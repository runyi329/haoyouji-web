/**
 * NBA 总决赛赔率追踪 tRPC 路由
 * 管理员专用：手动触发抓取、查询历史快照、订单管理（含钱包扣款）
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { getDb, getDbConnection } from '../db';
import { users } from '../../drizzle/schema';
import { desc, eq, like, or, and, ne } from 'drizzle-orm';
import { fetchAndSaveNbaOdds, ensureNbaTablesExist } from '../nbaOddsScraper';
import { getUserBalance, getUserCnyBalance } from '../db-recharge';

// 管理员检查中间件
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user.role as string) !== 'super_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
  }
  return next({ ctx });
});

type NbaOrderStatus = 'pending' | 'won' | 'lost' | 'revoked' | 'deleted';

export const nbaOddsRouter = router({
  /**
   * 手动触发一次抓取（管理员）
   */
  triggerFetch: adminProcedure.mutation(async () => {
    try {
      const result = await fetchAndSaveNbaOdds();
      return { success: true, ...result };
    } catch (e: any) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message });
    }
  }),

  /**
   * 获取所有快照列表（管理员）
   */
  getSnapshots: adminProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    try {
      const [rows] = await (conn as any).execute(
        `SELECT * FROM nba_odds_snapshots ORDER BY fetched_at DESC LIMIT 100`
      ) as any[];
      return Array.isArray(rows) ? rows : [];
    } finally {
      (conn as any).release?.();
    }
  }),

  /**
   * 获取赔率追踪矩阵：行=球队，列=快照时间
   */
  getOddsMatrix: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(30) }))
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      try {
        const [snapRows] = await (conn as any).execute(
          `SELECT * FROM nba_odds_snapshots ORDER BY fetched_at DESC LIMIT ?`,
          [input.limit]
        ) as any[];
        const snapshots = Array.isArray(snapRows) ? snapRows : [];
        if (snapshots.length === 0) return { snapshots: [], teams: [], matrix: {} };

        const snapshotIds = snapshots.map((s: any) => s.id);
        const placeholders = snapshotIds.map(() => '?').join(',');
        const [recRows] = await (conn as any).execute(
          `SELECT * FROM nba_odds_records WHERE snapshot_id IN (${placeholders}) ORDER BY rank ASC`,
          snapshotIds
        ) as any[];
        const allRecords = Array.isArray(recRows) ? recRows : [];

        const firstSnapshotId = snapshots[snapshots.length - 1].id;
        const teamsFromFirst = allRecords
          .filter((r: any) => r.snapshot_id === firstSnapshotId)
          .sort((a: any, b: any) => a.rank - b.rank);

        const teamNames = teamsFromFirst.length > 0
          ? teamsFromFirst.map((r: any) => ({ name: r.team_name, code: r.team_code || '' }))
          : Array.from(new Map(allRecords.map((r: any) => [r.team_name, { name: r.team_name, code: r.team_code || '' }])).values());

        const matrix: Record<string, Record<number, { decimalOdds: string | null; americanOdds: number | null; rank: number }>> = {};
        for (const record of allRecords) {
          if (!matrix[record.team_name]) matrix[record.team_name] = {};
          matrix[record.team_name][record.snapshot_id] = {
            decimalOdds: record.decimal_odds,
            americanOdds: record.american_odds,
            rank: record.rank,
          };
        }

        return {
          snapshots: [...snapshots].reverse(),
          teams: teamNames,
          matrix,
        };
      } finally {
        (conn as any).release?.();
      }
    }),

  /**
   * 获取追踪统计信息
   */
  getStats: adminProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    try {
      const [snapRows] = await (conn as any).execute(
        `SELECT COUNT(*) AS total_runs, MAX(fetched_at) AS last_fetched_at FROM nba_odds_snapshots`
      ) as any[];
      const [orderRows] = await (conn as any).execute(
        `SELECT COUNT(*) AS total_orders FROM nba_orders WHERE status != 'deleted'`
      ) as any[];
      const snapStats = Array.isArray(snapRows) ? snapRows[0] : snapRows;
      const orderStats = Array.isArray(orderRows) ? orderRows[0] : orderRows;
      return {
        totalRuns: Number(snapStats?.total_runs ?? 0),
        lastFetchedAt: snapStats?.last_fetched_at ?? null,
        totalOrders: Number(orderStats?.total_orders ?? 0),
      };
    } finally {
      (conn as any).release?.();
    }
  }),

  /**
   * 获取当前水钱设置
   */
  getMarginPct: adminProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) return { marginPct: 8 };
    try {
      const [rows] = await (conn as any).execute(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'nba_margin_pct' LIMIT 1`
      ) as any[];
      const arr = Array.isArray(rows) ? rows : [];
      return { marginPct: arr.length > 0 ? parseFloat(arr[0].setting_value) : 8 };
    } catch {
      return { marginPct: 8 };
    } finally {
      (conn as any).release?.();
    }
  }),

  /**
   * 设置水钱百分比
   */
  setMarginPct: adminProcedure
    .input(z.object({ marginPct: z.number().min(0).max(50) }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      try {
        await (conn as any).execute(
          `INSERT INTO app_settings (setting_key, setting_value) VALUES ('nba_margin_pct', ?) ON DUPLICATE KEY UPDATE setting_value = ?`,
          [input.marginPct.toString(), input.marginPct.toString()]
        );
        return { success: true };
      } finally {
        (conn as any).release?.();
      }
    }),

  /**
   * 搜索用户（管理员）
   */
  searchUsers: adminProcedure
    .input(z.object({ keyword: z.string().min(1) }))
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
   * 获取指定用户的钱包余额
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
      decimalOdds: z.string(),
      amount: z.string(),
      currency: z.enum(['CNY', 'USDT']),
      note: z.string().max(500).optional(),
      isDynamicPrice: z.boolean().optional(),
      baseFeeUsdt: z.string().optional(),
      finalFeeUsdt: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const odds = parseFloat(input.decimalOdds);
      const amt = parseFloat(input.amount);
      if (isNaN(odds) || odds <= 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '赔率无效（欧式赔率须大于1）' });
      }
      if (isNaN(amt) || amt <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '金额无效' });
      }

      // 检查余额
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

      try {
        // 确保表存在
        await ensureNbaTablesExist();

        // 扣款
        const teamCodeTag = input.teamCode ? `[${input.teamCode.toUpperCase()}]` : '';
        const deductNote = input.currency === 'CNY'
          ? `[CNY]NBA总决赛投注-${input.teamName}${teamCodeTag} -${amt}${input.note ? ' ' + input.note : ''}`
          : `NBA总决赛投注-${input.teamName}${teamCodeTag} -${amt} USDT${input.note ? ' ' + input.note : ''}`;

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

        // 生成唯一6位订单编号
        const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let orderNo = '';
        for (let attempt = 0; attempt < 10; attempt++) {
          let candidate = '';
          for (let i = 0; i < 6; i++) candidate += CHARS[Math.floor(Math.random() * CHARS.length)];
          const [existing] = await (conn as any).execute(`SELECT id FROM nba_orders WHERE order_no = ? LIMIT 1`, [candidate]) as any[];
          if (!Array.isArray(existing) || existing.length === 0) { orderNo = candidate; break; }
        }

        const isDynamic = input.isDynamicPrice ?? false;
        await (conn as any).execute(
          `INSERT INTO nba_orders (order_no, user_id, team_name, team_code, snapshot_id, decimal_odds, amount, potential_return, currency, status, note, is_dynamic_price, base_fee_usdt, final_fee_usdt, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NOW())`,
          [
            orderNo || null,
            input.userId, input.teamName, input.teamCode || null,
            input.snapshotId, input.decimalOdds, input.amount, potentialReturn,
            input.currency, input.note || null,
            isDynamic ? 1 : 0,
            input.baseFeeUsdt ?? null,
            input.finalFeeUsdt ?? null,
          ]
        );

        return { success: true };
      } finally {
        (conn as any).release?.();
      }
    }),

  /**
   * 获取订单列表（管理员，支持分页和筛选）
   */
  getOrders: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      status: z.enum(['pending', 'won', 'lost', 'revoked', 'deleted', 'all']).default('all'),
      teamName: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      try {
        const offset = (input.page - 1) * input.pageSize;
        const conditions: string[] = [];
        const params: any[] = [];

        if (input.status !== 'all') {
          conditions.push(`o.status = ?`);
          params.push(input.status);
        } else {
          conditions.push(`o.status != 'deleted'`);
        }
        if (input.teamName) {
          conditions.push(`o.team_name LIKE ?`);
          params.push(`%${input.teamName}%`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const [rows] = await (conn as any).execute(
          `SELECT o.*, u.name AS user_name, u.username AS user_username, u.phone AS user_phone, u.avatar AS user_avatar
           FROM nba_orders o
           LEFT JOIN users u ON o.user_id = u.id
           ${whereClause}
           ORDER BY o.created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, input.pageSize, offset]
        ) as any[];

        const orderRows = Array.isArray(rows) ? rows : [];

        // 计算每张订单的庄家优势
        const snapshotEdgeCache: Record<number, number> = {};
        const uniqueSnapshotIds = [...new Set(orderRows.map((r: any) => r.snapshot_id).filter(Boolean))] as number[];
        for (const sid of uniqueSnapshotIds) {
          try {
            const [snapRows] = await (conn as any).execute(
              `SELECT SUM(1/decimal_odds) AS sum_implied FROM nba_odds_records WHERE snapshot_id = ? AND decimal_odds > 0`,
              [sid]
            ) as any[];
            const arr = Array.isArray(snapRows) ? snapRows : [];
            if (arr.length > 0 && arr[0].sum_implied != null) {
              const sumImplied = parseFloat(String(arr[0].sum_implied));
              snapshotEdgeCache[sid] = Math.max(0, (sumImplied - 1) * 100);
            }
          } catch (_) { /* 忽略 */ }
        }

        const result = orderRows.map((r: any) => ({
          id: r.id,
          orderNo: r.order_no,
          userId: r.user_id,
          teamName: r.team_name,
          teamCode: r.team_code,
          snapshotId: r.snapshot_id,
          decimalOdds: r.decimal_odds,
          amount: r.amount,
          potentialReturn: r.potential_return,
          currency: r.currency,
          status: r.status,
          bonusAmount: r.bonus_amount,
          note: r.note,
          createdAt: r.created_at,
          settledAt: r.settled_at,
          deletedAt: r.deleted_at,
          isDynamicPrice: Boolean(r.is_dynamic_price),
          baseFeeUsdt: r.base_fee_usdt,
          finalFeeUsdt: r.final_fee_usdt,
          userName: r.user_name,
          userUsername: r.user_username,
          userPhone: r.user_phone,
          userAvatar: r.user_avatar,
          houseEdgePct: (() => {
            const baseEdge = snapshotEdgeCache[r.snapshot_id] != null
              ? parseFloat(snapshotEdgeCache[r.snapshot_id].toFixed(2))
              : null;
            if (r.is_dynamic_price && r.potential_return && r.amount) {
              const actualOdds = parseFloat(String(r.potential_return)) / parseFloat(String(r.amount));
              const baseOdds = r.decimal_odds ? parseFloat(String(r.decimal_odds)) : 0;
              if (actualOdds > 0 && baseOdds > 0 && baseEdge !== null) {
                const kExtra = (1 / actualOdds - 1 / baseOdds) * 100;
                return parseFloat((baseEdge + kExtra).toFixed(2));
              }
            }
            return baseEdge;
          })(),
        }));

        return { orders: result, page: input.page, pageSize: input.pageSize };
      } finally {
        (conn as any).release?.();
      }
    }),

  /**
   * 更新订单状态（管理员）
   */
  updateOrderStatus: adminProcedure
    .input(z.object({
      orderId: z.number().int().positive(),
      status: z.enum(['pending', 'won', 'lost', 'revoked', 'deleted']),
      bonusAmount: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.status === 'won' && !input.bonusAmount) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '中奖时必须填写实际奖金' });
      }
      const bonus = input.bonusAmount ? parseFloat(input.bonusAmount) : null;
      if (input.status === 'won' && (bonus === null || isNaN(bonus) || bonus < 0)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '奖金金额无效' });
      }

      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });

      try {
        const [orderRows] = await (conn as any).execute(
          `SELECT user_id, currency, bonus_amount, status, team_code, team_name, amount FROM nba_orders WHERE id = ? LIMIT 1`,
          [input.orderId]
        ) as any[];
        const orderArr = Array.isArray(orderRows) ? orderRows : [];
        if (orderArr.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: '订单不存在' });
        const orderRow = orderArr[0];

        // 已中奖订单不允许删除
        if (input.status === 'deleted' && orderRow.status === 'won') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '已中奖订单不允许删除，请先撤回中奖结算' });
        }

        // 恢复订单时检查余额
        if (input.status === 'pending' && orderRow.status === 'deleted') {
          const amt = parseFloat(orderRow.amount);
          const currency = orderRow.currency as string;
          let currentBalance: number;
          if (currency === 'USDT') {
            currentBalance = await getUserBalance(orderRow.user_id).catch(() => 0);
          } else {
            currentBalance = await getUserCnyBalance(orderRow.user_id).catch(() => 0);
          }
          if (currentBalance < amt) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `用户 ${currency} 余额不足（当前 ${currentBalance.toFixed(2)}，需要 ${amt.toFixed(2)}），无法恢复订单`,
            });
          }
          // 重新扣款
          const teamCodeTag = orderRow.team_code ? `[${orderRow.team_code.toUpperCase()}]` : '';
          const deductNote = currency === 'CNY'
            ? `[CNY]NBA总决赛投注恢复-${orderRow.team_name}${teamCodeTag} -${amt}`
            : `NBA总决赛投注恢复-${orderRow.team_name}${teamCodeTag} -${amt} USDT`;
          if (currency === 'CNY') {
            const [ledgerRows] = await (conn as any).execute(
              `SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
              [orderRow.user_id]
            ) as any[];
            const ledgerId = (Array.isArray(ledgerRows) ? ledgerRows[0]?.ledger_id : null) ?? 37;
            await (conn as any).execute(
              `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
              [ledgerId, orderRow.user_id, -amt, deductNote]
            );
          } else {
            await (conn as any).execute(
              `UPDATE users SET balance = COALESCE(balance, 0) - ? WHERE id = ?`,
              [amt, orderRow.user_id]
            );
            const [balRows] = await (conn as any).execute(
              `SELECT balance FROM users WHERE id = ? LIMIT 1`,
              [orderRow.user_id]
            ) as any[];
            const newBalance = parseFloat((Array.isArray(balRows) ? balRows[0] : balRows)?.balance ?? '0') || 0;
            await (conn as any).execute(
              `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description) VALUES (?, ?, 'consume', NULL, ?, ?)`,
              [orderRow.user_id, (-amt).toString(), newBalance.toString(), deductNote]
            );
          }
        }

        // 中奖 → 奖金打回钱包
        if (input.status === 'won') {
          const bonusAmt = parseFloat(input.bonusAmount!);
          const currency = orderRow.currency as string;
          const settleNote = currency === 'CNY' ? `[CNY]NBA系统结算 +${bonusAmt}` : `NBA系统结算 +${bonusAmt} USDT`;
          if (currency === 'CNY') {
            const [ledgerRows] = await (conn as any).execute(
              `SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
              [orderRow.user_id]
            ) as any[];
            const ledgerId = (Array.isArray(ledgerRows) ? ledgerRows[0]?.ledger_id : null) ?? 37;
            await (conn as any).execute(
              `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
              [ledgerId, orderRow.user_id, bonusAmt, settleNote]
            );
          } else {
            await (conn as any).execute(`UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?`, [bonusAmt, orderRow.user_id]);
            const [balRows] = await (conn as any).execute(`SELECT balance FROM users WHERE id = ? LIMIT 1`, [orderRow.user_id]) as any[];
            const newBalance = parseFloat((Array.isArray(balRows) ? balRows[0] : balRows)?.balance ?? '0') || 0;
            await (conn as any).execute(
              `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description) VALUES (?, ?, 'income', NULL, ?, ?)`,
              [orderRow.user_id, bonusAmt.toString(), newBalance.toString(), settleNote]
            );
          }
        }

        // 撤回中奖（won → pending）→ 扣回奖金
        if (input.status === 'pending' && orderRow.status === 'won' && orderRow.bonus_amount) {
          const prevBonus = parseFloat(orderRow.bonus_amount);
          const currency = orderRow.currency as string;
          const revokeNote = currency === 'CNY' ? `[CNY]NBA撤回结算 -${prevBonus}` : `NBA撤回结算 -${prevBonus} USDT`;
          if (currency === 'CNY') {
            const [ledgerRows] = await (conn as any).execute(
              `SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
              [orderRow.user_id]
            ) as any[];
            const ledgerId = (Array.isArray(ledgerRows) ? ledgerRows[0]?.ledger_id : null) ?? 37;
            await (conn as any).execute(
              `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
              [ledgerId, orderRow.user_id, -prevBonus, revokeNote]
            );
          } else {
            await (conn as any).execute(`UPDATE users SET balance = COALESCE(balance, 0) - ? WHERE id = ?`, [prevBonus, orderRow.user_id]);
            const [balRows] = await (conn as any).execute(`SELECT balance FROM users WHERE id = ? LIMIT 1`, [orderRow.user_id]) as any[];
            const newBalance = parseFloat((Array.isArray(balRows) ? balRows[0] : balRows)?.balance ?? '0') || 0;
            await (conn as any).execute(
              `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description) VALUES (?, ?, 'consume', NULL, ?, ?)`,
              [orderRow.user_id, (-prevBonus).toString(), newBalance.toString(), revokeNote]
            );
          }
        }

        // 删除进行中订单 → 退款
        if (input.status === 'deleted' && orderRow.status === 'pending') {
          const amt = parseFloat(orderRow.amount);
          const currency = orderRow.currency as string;
          const refundNote = currency === 'CNY' ? `[CNY]NBA投注撤单退款 +${amt}` : `NBA投注撤单退款 +${amt} USDT`;
          if (currency === 'CNY') {
            const [ledgerRows] = await (conn as any).execute(
              `SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
              [orderRow.user_id]
            ) as any[];
            const ledgerId = (Array.isArray(ledgerRows) ? ledgerRows[0]?.ledger_id : null) ?? 37;
            await (conn as any).execute(
              `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
              [ledgerId, orderRow.user_id, amt, refundNote]
            );
          } else {
            await (conn as any).execute(`UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?`, [amt, orderRow.user_id]);
            const [balRows] = await (conn as any).execute(`SELECT balance FROM users WHERE id = ? LIMIT 1`, [orderRow.user_id]) as any[];
            const newBalance = parseFloat((Array.isArray(balRows) ? balRows[0] : balRows)?.balance ?? '0') || 0;
            await (conn as any).execute(
              `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description) VALUES (?, ?, 'refund', NULL, ?, ?)`,
              [orderRow.user_id, amt.toString(), newBalance.toString(), refundNote]
            );
          }
        }

        // 更新订单状态
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        if (input.status === 'won') {
          await (conn as any).execute(
            `UPDATE nba_orders SET status = ?, bonus_amount = ?, settled_at = ? WHERE id = ?`,
            [input.status, input.bonusAmount, now, input.orderId]
          );
        } else if (input.status === 'deleted') {
          await (conn as any).execute(
            `UPDATE nba_orders SET status = ?, deleted_at = ? WHERE id = ?`,
            [input.status, now, input.orderId]
          );
        } else {
          await (conn as any).execute(
            `UPDATE nba_orders SET status = ? WHERE id = ?`,
            [input.status, input.orderId]
          );
        }

        return { success: true };
      } finally {
        (conn as any).release?.();
      }
    }),

  /**
   * 获取投注比例统计
   */
  getBettingStats: adminProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    try {
      const [rows] = await (conn as any).execute(
        `SELECT team_name, team_code, currency,
                COUNT(*) AS order_count,
                SUM(CAST(amount AS DECIMAL(15,4))) AS total_amount,
                SUM(CAST(potential_return AS DECIMAL(15,4))) AS total_potential
         FROM nba_orders
         WHERE status = 'pending'
         GROUP BY team_name, team_code, currency
         ORDER BY total_amount DESC`
      ) as any[];
      return Array.isArray(rows) ? rows : [];
    } finally {
      (conn as any).release?.();
    }
  }),
});
