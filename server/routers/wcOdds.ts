/**
 * 世界杯赔率追踪 tRPC 路由
 * 管理员专用：手动触发抓取、查询历史快照、订单管理（含钱包扣款）
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { getDb, getDbConnection } from '../db';
import { wcOddsSnapshots, wcOddsRecords, wcOrders, users } from '../../drizzle/schema';
import { desc, eq, asc, inArray, like, or, and, ne } from 'drizzle-orm';
import { fetchAndSaveOdds } from '../wcOddsScraper';
import { getUserBalance, getUserCnyBalance } from '../db-recharge';

// 管理员检查中间件
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'super_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
  }
  return next({ ctx });
});

// 订单状态类型
// pending  = 进行中（默认）
// won      = 中奖（需填奖金）
// lost     = 未中（赔注）
// revoked  = 已撤销（可恢复为 pending）
// deleted  = 软删除（列表默认不展示，可恢复）
type OrderStatus = 'pending' | 'won' | 'lost' | 'revoked' | 'deleted';

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

    const totalCount = await db.select().from(wcOddsSnapshots);

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
   * 获取指定用户的钱包余额（USDT + CNY）
   */
  getUserWallet: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [usdtBalance, cnyBalance] = await Promise.all([
        getUserBalance(input.userId).catch(() => 0),
        getUserCnyBalance(input.userId).catch(() => 0),
      ]);
      return {
        usdt: parseFloat(usdtBalance.toString()) || 0,
        cny: parseFloat(cnyBalance.toString()) || 0,
      };
    }),

  /**
   * 创建订单（管理员手动录入，自动从钱包扣款）
   */
  createOrder: adminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      teamName: z.string().min(1).max(50),
      teamCode: z.string().max(10).optional(),
      snapshotId: z.number().int().positive(),
      pinnacleOdds: z.string(),
      amount: z.string(),
      currency: z.enum(['CNY', 'USDT']),
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

      // 检查余额是否充足
      let currentBalance: number;
      if (input.currency === 'USDT') {
        currentBalance = await getUserBalance(input.userId).catch(() => 0);
      } else {
        currentBalance = await getUserCnyBalance(input.userId).catch(() => 0);
      }

      if (currentBalance < amt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${input.currency} 余额不足（当前 ${currentBalance.toFixed(2)}，需要 ${amt.toFixed(2)}）`,
        });
      }

      const potentialReturn = (odds * amt).toFixed(2);
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });

      // 扣款：写入 af_manual_balances（负数）
      const deductNote = input.currency === 'CNY'
        ? `[CNY]世界杯投注-${input.teamName} -${amt}${input.note ? ' ' + input.note : ''}`
        : `世界杯投注-${input.teamName} -${amt} USDT${input.note ? ' ' + input.note : ''}`;

      if (input.currency === 'CNY') {
        const [ledgerRows] = await (conn as any).execute(
          `SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
          [input.userId]
        ) as any[];
        const ledgerId = (Array.isArray(ledgerRows) ? ledgerRows[0]?.ledger_id : null) ?? 37;
        await (conn as any).execute(
          `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [ledgerId, input.userId, -amt, deductNote]
        );
      } else {
        await (conn as any).execute(
          `UPDATE users SET balance = COALESCE(balance, 0) - ? WHERE id = ?`,
          [amt, input.userId]
        );
        const [balRows] = await (conn as any).execute(
          `SELECT balance FROM users WHERE id = ? LIMIT 1`,
          [input.userId]
        ) as any[];
        const newBalance = parseFloat((Array.isArray(balRows) ? balRows[0] : balRows)?.balance ?? '0') || 0;
        await (conn as any).execute(
          `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description) VALUES (?, ?, 'consume', NULL, ?, ?)`,
          [input.userId, (-amt).toString(), newBalance.toString(), deductNote]
        );
      }

      await db.insert(wcOrders).values({
        userId: input.userId,
        teamName: input.teamName,
        teamCode: input.teamCode || null,
        snapshotId: input.snapshotId,
        pinnacleOdds: input.pinnacleOdds,
        amount: input.amount,
        potentialReturn,
        currency: input.currency,
        status: 'pending',
        note: input.note || null,
      });

      return { success: true };
    }),

  /**
   * 获取订单列表（管理员，支持分页和筛选）
   * 默认不展示 deleted 状态的订单，除非明确筛选 deleted
   */
  getOrders: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      status: z.enum(['pending', 'won', 'lost', 'revoked', 'deleted', 'all']).default('all'),
      teamName: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.status !== 'all') {
        conditions.push(eq(wcOrders.status, input.status as OrderStatus));
      } else {
        // 默认隐藏软删除的订单
        conditions.push(ne(wcOrders.status, 'deleted' as OrderStatus));
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
          currency: wcOrders.currency,
          status: wcOrders.status,
          bonusAmount: wcOrders.bonusAmount,
          note: wcOrders.note,
          createdAt: wcOrders.createdAt,
          settledAt: wcOrders.settledAt,
          deletedAt: wcOrders.deletedAt,
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
      if (conditions.length === 1) {
        rows = await baseQuery.where(conditions[0]);
      } else {
        rows = await baseQuery.where(and(...conditions));
      }

      return { orders: rows, page: input.page, pageSize: input.pageSize };
    }),

  /**
   * 更新订单状态（管理员，全部可逆）
   *
   * 状态流转规则（所有流转均可逆，无不可逆操作）：
   *   pending  → won（中奖，需填 bonusAmount）
   *   pending  → lost（未中）
   *   pending  → revoked（撤销）
   *   pending  → deleted（软删除）
   *   won      → pending（撤回中奖结算）
   *   lost     → pending（撤回未中结算）
   *   revoked  → pending（恢复进行中）
   *   deleted  → pending（从回收站恢复）
   *   任意状态 → deleted（软删除，可恢复）
   */
  updateOrderStatus: adminProcedure
    .input(z.object({
      orderId: z.number().int().positive(),
      status: z.enum(['pending', 'won', 'lost', 'revoked', 'deleted']),
      bonusAmount: z.string().optional(), // 中奖时必填实际奖金
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      if (input.status === 'won' && !input.bonusAmount) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '中奖时必须填写实际奖金' });
      }

      const bonus = input.bonusAmount ? parseFloat(input.bonusAmount) : null;
      if (input.status === 'won' && (bonus === null || isNaN(bonus) || bonus < 0)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '奖金金额无效' });
      }

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      await db
        .update(wcOrders)
        .set({
          status: input.status as OrderStatus,
          // 结算时间：won/lost 时记录，恢复 pending 时清空
          settledAt: (input.status === 'won' || input.status === 'lost') ? now
            : input.status === 'pending' ? null
            : undefined,
          // 奖金：won 时写入，恢复 pending 时清空
          bonusAmount: input.status === 'won' ? input.bonusAmount!
            : input.status === 'pending' ? null
            : undefined,
          // 软删除时间戳
          deletedAt: input.status === 'deleted' ? now
            : input.status === 'pending' ? null
            : undefined,
        })
        .where(eq(wcOrders.id, input.orderId));

      return { success: true };
    }),
});
