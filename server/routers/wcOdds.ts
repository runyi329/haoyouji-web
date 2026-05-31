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
  if ((ctx.user.role as string) !== 'super_admin') {
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
        : Array.from(new Map(allRecords.map(r => [r.teamName, { name: r.teamName, code: r.teamCode || '' }])).values());

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

  /**
   * 获取最新快照的所有球队赔率（公开接口，P011 冠军预测使用）
   */
  getLatestChampionOdds: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { teams: [], fetchedAt: null };
    // 取最新快照
    const latestSnap = await db
      .select()
      .from(wcOddsSnapshots)
      .orderBy(desc(wcOddsSnapshots.fetchedAt))
      .limit(1);
    if (latestSnap.length === 0) return { teams: [], fetchedAt: null };
    const snap = latestSnap[0];
    // 取该快照所有球队赔率，按 rank 排序
    const records = await db
      .select()
      .from(wcOddsRecords)
      .where(eq(wcOddsRecords.snapshotId, snap.id))
      .orderBy(asc(wcOddsRecords.rank));
    const teams = records.map(r => ({
      name: r.teamName,
      code: r.teamCode || '',
      pinnacleOdds: r.pinnacleOdds,
      rank: r.rank,
    }));
    return { teams, fetchedAt: snap.fetchedAt };
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
   * 获取最新快照所有球队的原始赔率（用于Dialog中计算水钱调整后赔率）
   */
  getLatestSnapshotAllOdds: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const latestSnapshot = await db
        .select()
        .from(wcOddsSnapshots)
        .orderBy(desc(wcOddsSnapshots.fetchedAt))
        .limit(1);

      if (latestSnapshot.length === 0) return { snapshotId: null, records: [] };

      const snap = latestSnapshot[0];
      const records = await db
        .select({
          teamName: wcOddsRecords.teamName,
          teamCode: wcOddsRecords.teamCode,
          pinnacleOdds: wcOddsRecords.pinnacleOdds,
        })
        .from(wcOddsRecords)
        .where(eq(wcOddsRecords.snapshotId, snap.id));

      return { snapshotId: snap.id, records };
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
      // k值动态定价相关字段
      isDynamicPrice: z.boolean().optional(),  // 是否触发了k值保护
      baseFeeUsdt: z.string().optional(),       // 基础费用（水钱价，USDT）
      finalFeeUsdt: z.string().optional(),      // 实际费用（k值价，USDT）
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

      // 确保 wc_orders 表有 k值动态定价字段（幂等迎头，已有则跳过）
      try {
        await (conn as any).execute(`ALTER TABLE wc_orders ADD COLUMN IF NOT EXISTS is_dynamic_price TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'k值保护是否触发'`);
        await (conn as any).execute(`ALTER TABLE wc_orders ADD COLUMN IF NOT EXISTS base_fee_usdt DECIMAL(15,4) DEFAULT NULL COMMENT '基础费用(USDT)'`);
        await (conn as any).execute(`ALTER TABLE wc_orders ADD COLUMN IF NOT EXISTS final_fee_usdt DECIMAL(15,4) DEFAULT NULL COMMENT '实际费用(USDT)'`);
      } catch (_) { /* 字段已存在则忽略 */ }

      // 扣款：写入 af_manual_balances（负数）
      const teamCodeTag = input.teamCode ? `[${input.teamCode.toUpperCase()}]` : '';
      const deductNote = input.currency === 'CNY'
        ? `[CNY]世界杯投注-${input.teamName}${teamCodeTag} -${amt}${input.note ? ' ' + input.note : ''}`
        : `世界杯投注-${input.teamName}${teamCodeTag} -${amt} USDT${input.note ? ' ' + input.note : ''}`;

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

      // 将 k值动态定价字段写入订单
      const isDynamic = input.isDynamicPrice ?? false;
      const baseFee = input.baseFeeUsdt ?? null;
      const finalFee = input.finalFeeUsdt ?? null;

      // 生成唯一6位订单编号（大写字母+数字），碰撞时重试
      const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let orderNo = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        let candidate = '';
        for (let i = 0; i < 6; i++) candidate += CHARS[Math.floor(Math.random() * CHARS.length)];
        const [existing] = await (conn as any).execute(`SELECT id FROM wc_orders WHERE order_no = ? LIMIT 1`, [candidate]) as any[];
        if (!Array.isArray(existing) || existing.length === 0) { orderNo = candidate; break; }
      }

      await (conn as any).execute(
        `INSERT INTO wc_orders (order_no, user_id, team_name, team_code, snapshot_id, pinnacle_odds, amount, potential_return, currency, status, note, is_dynamic_price, base_fee_usdt, final_fee_usdt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NOW())`,
        [
          orderNo || null,
          input.userId,
          input.teamName,
          input.teamCode || null,
          input.snapshotId,
          input.pinnacleOdds,
          input.amount,
          potentialReturn,
          input.currency,
          input.note || null,
          isDynamic ? 1 : 0,
          baseFee,
          finalFee,
        ]
      );

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
      let drizzleRows;
      if (conditions.length === 1) {
        drizzleRows = await baseQuery.where(conditions[0]);
      } else {
        drizzleRows = await baseQuery.where(and(...conditions));
      }
      // 单独查询 k值动态定价字段（这些字段不在 drizzle schema 中，用原生 SQL 补充）
      const conn2 = await getDbConnection();
      let dynamicMap: Record<number, { isDynamicPrice: boolean; baseFeeUsdt: string | null; finalFeeUsdt: string | null; orderNo: string | null }> = {};
      if (conn2 && drizzleRows.length > 0) {
        try {
          const ids = drizzleRows.map(r => r.id);
          const placeholders = ids.map(() => '?').join(',');
          const [dynRows] = await (conn2 as any).execute(
            `SELECT id, order_no, COALESCE(is_dynamic_price, 0) AS is_dynamic_price, base_fee_usdt, final_fee_usdt FROM wc_orders WHERE id IN (${placeholders})`,
            ids
          ) as any[];
          const dynArr = Array.isArray(dynRows) ? dynRows : [];
          for (const d of dynArr) {
            dynamicMap[Number(d.id)] = {
              isDynamicPrice: Boolean(d.is_dynamic_price),
              baseFeeUsdt: d.base_fee_usdt != null ? String(d.base_fee_usdt) : null,
              finalFeeUsdt: d.final_fee_usdt != null ? String(d.final_fee_usdt) : null,
              orderNo: d.order_no != null ? String(d.order_no) : null,
            };
          }
        } catch (_) { /* 字段不存在时忽略 */ } finally {
          (conn2 as any).release?.();
        }
      }
      const rows = drizzleRows.map(r => ({
        ...r,
        isDynamicPrice: dynamicMap[r.id]?.isDynamicPrice ?? false,
        baseFeeUsdt: dynamicMap[r.id]?.baseFeeUsdt ?? null,
        finalFeeUsdt: dynamicMap[r.id]?.finalFeeUsdt ?? null,
        orderNo: dynamicMap[r.id]?.orderNo ?? null,
      }));
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

      // 查询订单原始信息（用于钱包操作）
      const [orderRow] = await db
        .select({
          userId: wcOrders.userId,
          currency: wcOrders.currency,
          bonusAmount: wcOrders.bonusAmount,
          status: wcOrders.status,
          teamCode: wcOrders.teamCode,
          teamName: wcOrders.teamName,
        })
        .from(wcOrders)
        .where(eq(wcOrders.id, input.orderId))
        .limit(1);
      if (!orderRow) throw new TRPCError({ code: 'NOT_FOUND', message: '订单不存在' });

      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });

      // 中奖 → 奖金打回用户钱包
      if (input.status === 'won') {
        const bonusAmt = parseFloat(input.bonusAmount!);
        const currency = orderRow.currency as string;
        const settleNote = currency === 'CNY'
          ? `[CNY]系统结算 +${bonusAmt}`
          : `系统结算 +${bonusAmt} USDT`;
        if (currency === 'CNY') {
          const [ledgerRows] = await (conn as any).execute(
            `SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
            [orderRow.userId]
          ) as any[];
          const ledgerId = (Array.isArray(ledgerRows) ? ledgerRows[0]?.ledger_id : null) ?? 37;
          await (conn as any).execute(
            `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [ledgerId, orderRow.userId, bonusAmt, settleNote]
          );
        } else {
          await (conn as any).execute(
            `UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?`,
            [bonusAmt, orderRow.userId]
          );
          const [balRows] = await (conn as any).execute(
            `SELECT balance FROM users WHERE id = ? LIMIT 1`,
            [orderRow.userId]
          ) as any[];
          const newBalance = parseFloat((Array.isArray(balRows) ? balRows[0] : balRows)?.balance ?? '0') || 0;
          await (conn as any).execute(
            `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description) VALUES (?, ?, 'income', NULL, ?, ?)`,
            [orderRow.userId, bonusAmt.toString(), newBalance.toString(), settleNote]
          );
        }
      }

      // 撤回中奖（won → pending）→ 从钱包扣回奖金
      if (input.status === 'pending' && orderRow.status === 'won' && orderRow.bonusAmount) {
        const prevBonus = parseFloat(orderRow.bonusAmount);
        const currency = orderRow.currency as string;
        const revokeNote = currency === 'CNY'
          ? `[CNY]撤回结算 -${prevBonus}`
          : `撤回结算 -${prevBonus} USDT`;
        if (currency === 'CNY') {
          const [ledgerRows] = await (conn as any).execute(
            `SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
            [orderRow.userId]
          ) as any[];
          const ledgerId = (Array.isArray(ledgerRows) ? ledgerRows[0]?.ledger_id : null) ?? 37;
          await (conn as any).execute(
            `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [ledgerId, orderRow.userId, -prevBonus, revokeNote]
          );
        } else {
          await (conn as any).execute(
            `UPDATE users SET balance = COALESCE(balance, 0) - ? WHERE id = ?`,
            [prevBonus, orderRow.userId]
          );
          const [balRows] = await (conn as any).execute(
            `SELECT balance FROM users WHERE id = ? LIMIT 1`,
            [orderRow.userId]
          ) as any[];
          const newBalance = parseFloat((Array.isArray(balRows) ? balRows[0] : balRows)?.balance ?? '0') || 0;
          await (conn as any).execute(
            `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description) VALUES (?, ?, 'consume', NULL, ?, ?)`,
            [orderRow.userId, (-prevBonus).toString(), newBalance.toString(), revokeNote]
          );
        }
      }

      // 删除订单的钉包规则：
      // 规则A：已中奖订单删除 → 自动从用户钉包扣回奖金（防止奖金白拿）
      // 规则B：进行中订单删除 → 自动退回投注金额（订单作废撤单）
      // 规则C：未中奖订单删除 → 不退款（已输的赔注不退）
      if (input.status === 'deleted') {
        const currency = orderRow.currency as string;

        // 规则A：已中奖 → 删除，扣回奖金
        if (orderRow.status === 'won' && orderRow.bonusAmount) {
          const prevBonus = parseFloat(orderRow.bonusAmount);
          const deleteWonNote = currency === 'CNY'
            ? `[CNY]系统结算`
            : `系统结算`;
          if (currency === 'CNY') {
            const [ledgerRows] = await (conn as any).execute(
              `SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
              [orderRow.userId]
            ) as any[];
            const ledgerId = (Array.isArray(ledgerRows) ? ledgerRows[0]?.ledger_id : null) ?? 37;
            await (conn as any).execute(
              `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
              [ledgerId, orderRow.userId, -prevBonus, deleteWonNote]
            );
          } else {
            await (conn as any).execute(
              `UPDATE users SET balance = COALESCE(balance, 0) - ? WHERE id = ?`,
              [prevBonus, orderRow.userId]
            );
            const [balRows] = await (conn as any).execute(
              `SELECT balance FROM users WHERE id = ? LIMIT 1`,
              [orderRow.userId]
            ) as any[];
            const newBalance = parseFloat((Array.isArray(balRows) ? balRows[0] : balRows)?.balance ?? '0') || 0;
            await (conn as any).execute(
              `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description) VALUES (?, ?, 'consume', NULL, ?, ?)`,
              [orderRow.userId, (-prevBonus).toString(), newBalance.toString(), deleteWonNote]
            );
          }
        }

        // 规则B：进行中 → 删除，退回投注金额
        if (orderRow.status === 'pending') {
          const [amtRows] = await db
            .select({ amount: wcOrders.amount })
            .from(wcOrders)
            .where(eq(wcOrders.id, input.orderId))
            .limit(1);
          const betAmt = amtRows ? parseFloat(amtRows.amount) : 0;
          if (betAmt > 0) {
            const teamCodeTag2 = orderRow.teamCode ? `[${(orderRow.teamCode as string).toUpperCase()}]` : '';
            const refundNote = currency === 'CNY'
              ? `[CNY]系统结算`
              : `系统结算`;
            if (currency === 'CNY') {
              const [ledgerRows] = await (conn as any).execute(
                `SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
                [orderRow.userId]
              ) as any[];
              const ledgerId = (Array.isArray(ledgerRows) ? ledgerRows[0]?.ledger_id : null) ?? 37;
              await (conn as any).execute(
                `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
                [ledgerId, orderRow.userId, betAmt, refundNote]
              );
            } else {
              await (conn as any).execute(
                `UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?`,
                [betAmt, orderRow.userId]
              );
              const [balRows] = await (conn as any).execute(
                `SELECT balance FROM users WHERE id = ? LIMIT 1`,
                [orderRow.userId]
              ) as any[];
              const newBalance = parseFloat((Array.isArray(balRows) ? balRows[0] : balRows)?.balance ?? '0') || 0;
              await (conn as any).execute(
                `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description) VALUES (?, ?, 'refund', NULL, ?, ?)`,
                [orderRow.userId, betAmt.toString(), newBalance.toString(), refundNote]
              );
            }
          }
        }
        // 规则C：未中奖(lost)/已撤销(revoked) → 删除，不动钉包
      }

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

  // ==================== 水钱设置 ====================
  /**
   * 获取当前水钱设置（公开，前端实时轮询用）
   */
  getMarginSetting: protectedProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) return { marginPct: 8 };
    try {
      // 确保表存在
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS wc_margin_settings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          margin_pct INT NOT NULL DEFAULT 8,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          updated_by INT
        )
      `);
      const [rows] = await (conn as any).execute(
        `SELECT margin_pct FROM wc_margin_settings ORDER BY id DESC LIMIT 1`
      ) as any[];
      const arr = Array.isArray(rows) ? rows : [];
      if (arr.length === 0) {
        await (conn as any).execute(`INSERT INTO wc_margin_settings (margin_pct) VALUES (8)`);
        return { marginPct: 8 };
      }
      return { marginPct: Number(arr[0].margin_pct) };
    } finally {
      (conn as any).release?.();
    }
  }),

  /**
   * 更新水钱设置（仅管理员）
   */
  setMarginSetting: adminProcedure
    .input(z.object({ marginPct: z.number().int().min(0).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      try {
        await (conn as any).execute(`
          CREATE TABLE IF NOT EXISTS wc_margin_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            margin_pct INT NOT NULL DEFAULT 8,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            updated_by INT
          )
        `);
        const [rows] = await (conn as any).execute(
          `SELECT id FROM wc_margin_settings ORDER BY id DESC LIMIT 1`
        ) as any[];
        const arr = Array.isArray(rows) ? rows : [];
        if (arr.length === 0) {
          await (conn as any).execute(
            `INSERT INTO wc_margin_settings (margin_pct, updated_by) VALUES (?, ?)`,
            [input.marginPct, ctx.user.id]
          );
        } else {
          await (conn as any).execute(
            `UPDATE wc_margin_settings SET margin_pct = ?, updated_by = ? WHERE id = ?`,
            [input.marginPct, ctx.user.id, arr[0].id]
          );
        }
        return { success: true, marginPct: input.marginPct };
      } finally {
        (conn as any).release?.();
      }
    }),

  /**
   * 获取 k 值设置（公开，前端计算费用用）
   */
  getKSetting: protectedProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) return { kValue: 3 };
    try {
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS wc_k_settings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          k_value INT NOT NULL DEFAULT 3,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          updated_by INT
        )
      `);
      const [rows] = await (conn as any).execute(
        `SELECT k_value FROM wc_k_settings ORDER BY id DESC LIMIT 1`
      ) as any[];
      const arr = Array.isArray(rows) ? rows : [];
      if (arr.length === 0) {
        await (conn as any).execute(`INSERT INTO wc_k_settings (k_value) VALUES (3)`);
        return { kValue: 3 };
      }
      return { kValue: Number(arr[0].k_value) };
    } finally {
      (conn as any).release?.();
    }
  }),

  /**
   * 设置 k 值（仅管理员）
   */
  setKSetting: adminProcedure
    .input(z.object({ kValue: z.number().int().min(1).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      try {
        await (conn as any).execute(`
          CREATE TABLE IF NOT EXISTS wc_k_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            k_value INT NOT NULL DEFAULT 3,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            updated_by INT
          )
        `);
        const [rows] = await (conn as any).execute(
          `SELECT id FROM wc_k_settings ORDER BY id DESC LIMIT 1`
        ) as any[];
        const arr = Array.isArray(rows) ? rows : [];
        if (arr.length === 0) {
          await (conn as any).execute(
            `INSERT INTO wc_k_settings (k_value, updated_by) VALUES (?, ?)`,
            [input.kValue, ctx.user.id]
          );
        } else {
          await (conn as any).execute(
            `UPDATE wc_k_settings SET k_value = ?, updated_by = ? WHERE id = ?`,
            [input.kValue, ctx.user.id, arr[0].id]
          );
        }
        return { success: true, kValue: input.kValue };
      } finally {
        (conn as any).release?.();
      }
    }),

  /**
   * 48支球队投注比例统计
   * 统计所有非删除订单，按球队分组，多币种折算成 USDT
   */
  getBettingStats: adminProcedure.query(async () => {
    const { getLatestPrice } = await import('../price-scanner');
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    try {
      // 查询所有非删除订单，按球队+货币分组统计
      const [rows] = await (conn as any).execute(`
        SELECT
          team_code,
          team_name,
          currency,
          COUNT(*) AS order_count,
          SUM(amount) AS total_amount
        FROM wc_orders
        WHERE status != 'deleted'
        GROUP BY team_code, team_name, currency
        ORDER BY team_name
      `) as any[];
      const arr = Array.isArray(rows) ? rows : [];

      // 汇率：CNY → USDT（固定汇率 7.25 CNY/USD 作为 fallback）
      const CNY_TO_USDT = 1 / 7.25;

      // 按球队聚合，合并不同货币
      const teamMap: Record<string, {
        teamCode: string;
        teamName: string;
        orderCount: number;
        totalUsdt: number;
        breakdown: { currency: string; amount: number; usdt: number }[];
      }> = {};

      for (const row of arr) {
        const key = (row.team_code || row.team_name) as string;
        const currency = (row.currency as string).toUpperCase();
        const rawAmount = parseFloat(row.total_amount) || 0;
        const orderCount = parseInt(row.order_count) || 0;

        // 折算成 USDT
        let usdt = 0;
        if (currency === 'USDT' || currency === 'USDC') {
          usdt = rawAmount;
        } else if (currency === 'CNY') {
          usdt = rawAmount * CNY_TO_USDT;
        } else {
          // 其他数字货币：用 price-scanner 实时价格
          const price = getLatestPrice(currency) ?? 0;
          usdt = rawAmount * price;
        }

        if (!teamMap[key]) {
          teamMap[key] = {
            teamCode: (row.team_code || '').toLowerCase(),
            teamName: row.team_name,
            orderCount: 0,
            totalUsdt: 0,
            breakdown: [],
          };
        }
        teamMap[key].orderCount += orderCount;
        teamMap[key].totalUsdt += usdt;
        teamMap[key].breakdown.push({ currency, amount: rawAmount, usdt });
      }

      const teams = Object.values(teamMap);
      const grandTotal = teams.reduce((s, t) => s + t.totalUsdt, 0);

      // 按 totalUsdt 降序排列，计算占比
      const result = teams
        .map(t => ({
          teamCode: t.teamCode,
          teamName: t.teamName,
          orderCount: t.orderCount,
          totalUsdt: parseFloat(t.totalUsdt.toFixed(4)),
          percentage: grandTotal > 0
            ? parseFloat(((t.totalUsdt / grandTotal) * 100).toFixed(2))
            : 0,
          breakdown: t.breakdown,
        }))
        .sort((a, b) => b.totalUsdt - a.totalUsdt);

      return {
        teams: result,
        grandTotalUsdt: parseFloat(grandTotal.toFixed(4)),
        totalOrders: result.reduce((s, t) => s + t.orderCount, 0),
        updatedAt: new Date().toISOString(),
        cnyRate: CNY_TO_USDT,
      };
    } finally {
      (conn as any).release?.();
    }
  }),
});
