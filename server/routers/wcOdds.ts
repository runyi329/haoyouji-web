/**
 * 世界杯赔率追踪 tRPC 路由
 * 管理员专用：手动触发抓取、查询历史快照、订单管理
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { getDb } from '../db';
import { wcOddsSnapshots, wcOddsRecords, wcOrders, users } from '../../drizzle/schema';
import { desc, eq, asc, inArray, like, or, sql, and } from 'drizzle-orm';
import { fetchAndSaveOdds } from '../wcOddsScraper';

// 管理员检查中间件
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'super_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
  }
  return next({ ctx });
});

export const wcOddsRouter = router({
  /**
   * 手动触发一次抓取（管理员）
   */
  triggerFetch: adminProcedure.mutation(async () => {
    try {
      const result = await fetchAndSaveOdds();
      return { success: true, ...result };
    } catch (e: any) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message });
    }
  }),

  /**
   * 获取所有快照列表（管理员）
   */
  getSnapshots: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    const snapshots = await db
      .select()
      .from(wcOddsSnapshots)
      .orderBy(desc(wcOddsSnapshots.fetchedAt))
      .limit(100);
    return snapshots;
  }),

  /**
   * 获取赔率追踪矩阵：行=球队，列=快照时间
   */
  getOddsMatrix: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const snapshots = await db
        .select()
        .from(wcOddsSnapshots)
        .orderBy(desc(wcOddsSnapshots.fetchedAt))
        .limit(input.limit);

      if (snapshots.length === 0) {
        return { snapshots: [], teams: [], matrix: {} };
      }

      const snapshotIds = snapshots.map(s => s.id);

      const allRecords = await db
        .select()
        .from(wcOddsRecords)
        .where(
          snapshotIds.length === 1
            ? eq(wcOddsRecords.snapshotId, snapshotIds[0])
            : inArray(wcOddsRecords.snapshotId, snapshotIds)
        )
        .orderBy(asc(wcOddsRecords.rank));

      const firstSnapshotId = snapshots[snapshots.length - 1].id;
      const teamsFromFirst = allRecords
        .filter(r => r.snapshotId === firstSnapshotId)
        .sort((a, b) => a.rank - b.rank);

      const teamNames = teamsFromFirst.length > 0
        ? teamsFromFirst.map(r => ({ name: r.teamName, code: r.teamCode || '' }))
        : [...new Map(allRecords.map(r => [r.teamName, { name: r.teamName, code: r.teamCode || '' }])).values()];

      const matrix: Record<string, Record<number, { pinnacle: string | null; wh: string | null; rank: number }>> = {};
      for (const record of allRecords) {
        if (!matrix[record.teamName]) matrix[record.teamName] = {};
        matrix[record.teamName][record.snapshotId] = {
          pinnacle: record.pinnacleOdds,
          wh: record.williamHillOdds,
          rank: record.rank,
        };
      }

      return {
        snapshots: snapshots.reverse(),
        teams: teamNames,
        matrix,
      };
    }),

  /**
   * 获取追踪统计信息
   */
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

    const snapshots = await db
      .select()
      .from(wcOddsSnapshots)
      .orderBy(desc(wcOddsSnapshots.fetchedAt))
      .limit(1);

    const totalCount = await db
      .select()
      .from(wcOddsSnapshots);

    return {
      totalRuns: totalCount.length,
      lastFetchedAt: snapshots[0]?.fetchedAt || null,
      source: 'wc-2026.com',
      interval: '每4小时',
    };
  }),

  // ==================== 订单管理 ====================

  /**
   * 获取所有球队列表（从最新快照提取，用于下拉选择）
   */
  getTeamList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

    const latestSnapshot = await db
      .select()
      .from(wcOddsSnapshots)
      .orderBy(desc(wcOddsSnapshots.fetchedAt))
      .limit(1);

    if (latestSnapshot.length === 0) return [];

    const records = await db
      .select({
        teamName: wcOddsRecords.teamName,
        teamCode: wcOddsRecords.teamCode,
        rank: wcOddsRecords.rank,
        pinnacleOdds: wcOddsRecords.pinnacleOdds,
      })
      .from(wcOddsRecords)
      .where(eq(wcOddsRecords.snapshotId, latestSnapshot[0].id))
      .orderBy(asc(wcOddsRecords.rank));

    return records;
  }),

  /**
   * 根据球队名获取最新快照的赔率（新建订单时自动填充）
   */
  getLatestOddsForTeam: adminProcedure
    .input(z.object({ teamName: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const latestSnapshot = await db
        .select()
        .from(wcOddsSnapshots)
        .orderBy(desc(wcOddsSnapshots.fetchedAt))
        .limit(1);

      if (latestSnapshot.length === 0) {
        return { snapshotId: null, pinnacleOdds: null, fetchedAt: null, teamCode: null };
      }

      const snap = latestSnapshot[0];

      const record = await db
        .select()
        .from(wcOddsRecords)
        .where(and(
          eq(wcOddsRecords.snapshotId, snap.id),
          eq(wcOddsRecords.teamName, input.teamName)
        ))
        .limit(1);

      if (record.length === 0) {
        return { snapshotId: snap.id, pinnacleOdds: null, fetchedAt: snap.fetchedAt, teamCode: null };
      }

      return {
        snapshotId: snap.id,
        pinnacleOdds: record[0].pinnacleOdds,
        teamCode: record[0].teamCode,
        fetchedAt: snap.fetchedAt,
      };
    }),

  /**
   * 搜索用户（管理员用，从全量用户中搜索下单人）
   */
  searchUsers: adminProcedure
    .input(z.object({ keyword: z.string().min(1).max(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const kw = `%${input.keyword}%`;
      const results = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          phone: users.phone,
          openId: users.openId,
          avatar: users.avatar,
        })
        .from(users)
        .where(
          or(
            like(users.name, kw),
            like(users.username, kw),
            like(users.phone, kw),
            like(users.openId, kw)
          )
        )
        .limit(20);

      return results;
    }),

  /**
   * 创建订单（管理员手动录入）
   */
  createOrder: adminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      teamName: z.string().min(1).max(50),
      teamCode: z.string().max(10).optional(),
      snapshotId: z.number().int().positive(),
      pinnacleOdds: z.string(),
      amount: z.string(),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const odds = parseFloat(input.pinnacleOdds);
      const amt = parseFloat(input.amount);
      if (isNaN(odds) || odds <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '赔率无效' });
      }
      if (isNaN(amt) || amt <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '金额无效' });
      }

      const potentialReturn = (odds * amt).toFixed(2);

      await db.insert(wcOrders).values({
        userId: input.userId,
        teamName: input.teamName,
        teamCode: input.teamCode || null,
        snapshotId: input.snapshotId,
        pinnacleOdds: input.pinnacleOdds,
        amount: input.amount,
        potentialReturn,
        status: 'pending',
        note: input.note || null,
      });

      return { success: true };
    }),

  /**
   * 获取订单列表（管理员，支持分页和筛选）
   */
  getOrders: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      status: z.enum(['pending', 'settled', 'cancelled', 'all']).default('all'),
      teamName: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.status !== 'all') {
        conditions.push(eq(wcOrders.status, input.status));
      }
      if (input.teamName) {
        conditions.push(like(wcOrders.teamName, `%${input.teamName}%`));
      }

      const baseQuery = db
        .select({
          id: wcOrders.id,
          userId: wcOrders.userId,
          teamName: wcOrders.teamName,
          teamCode: wcOrders.teamCode,
          snapshotId: wcOrders.snapshotId,
          pinnacleOdds: wcOrders.pinnacleOdds,
          amount: wcOrders.amount,
          potentialReturn: wcOrders.potentialReturn,
          status: wcOrders.status,
          note: wcOrders.note,
          createdAt: wcOrders.createdAt,
          settledAt: wcOrders.settledAt,
          userName: users.name,
          userUsername: users.username,
          userPhone: users.phone,
          userAvatar: users.avatar,
        })
        .from(wcOrders)
        .leftJoin(users, eq(wcOrders.userId, users.id))
        .orderBy(desc(wcOrders.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      let rows;
      if (conditions.length === 0) {
        rows = await baseQuery;
      } else if (conditions.length === 1) {
        rows = await baseQuery.where(conditions[0]);
      } else {
        rows = await baseQuery.where(and(...conditions));
      }

      return { orders: rows, page: input.page, pageSize: input.pageSize };
    }),

  /**
   * 更新订单状态（管理员）
   */
  updateOrderStatus: adminProcedure
    .input(z.object({
      orderId: z.number().int().positive(),
      status: z.enum(['pending', 'settled', 'cancelled']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      await db
        .update(wcOrders)
        .set({
          status: input.status,
          settledAt: input.status === 'settled'
            ? new Date().toISOString().slice(0, 19).replace('T', ' ')
            : undefined,
        })
        .where(eq(wcOrders.id, input.orderId));

      return { success: true };
    }),
});
