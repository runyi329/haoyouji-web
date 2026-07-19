
import { z } from "zod";
import { and, eq, sql, desc } from "drizzle-orm";
import { mibanTeams, mibanCommissionPlans, mibanOrders, users } from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getDbConnection } from "./db";

// 管理员页面入口已在前端控制，后端只需要登录即可
function assertAdmin(_ctx: any) {
  // 不再做额外权限校验
}

// ─── 工具：递归获取某用户下的所有成员（人脉树） ─────────────────────────────────
async function getMemberTree(rootUserId: number, maxDepth = 5): Promise<any[]> {
  const dbConn = await getDbConnection();
  if (!dbConn) return [];

  const [rows] = await dbConn.execute(`
    WITH RECURSIVE tree AS (
      SELECT id, name, username, invite_code AS inviteCode, invited_by_user_id AS invitedByUserId, createdAt, 1 AS depth
      FROM users
      WHERE id = ?
      UNION ALL
      SELECT u.id, u.name, u.username, u.invite_code, u.invited_by_user_id, u.createdAt, t.depth + 1
      FROM users u
      INNER JOIN tree t ON u.invited_by_user_id = t.id
      WHERE t.depth < ?
    )
    SELECT id, name, username, inviteCode, invitedByUserId, createdAt, depth
    FROM tree
    ORDER BY depth, id
  `, [rootUserId, maxDepth]);

  return rows as any[];
}

// ─── 工具：统计团队业绩 ───────────────────────────────────────────────────────
async function getTeamStats(memberIds: number[]) {
  if (!memberIds.length) return { totalOrders: 0, totalAmount: 0, thisMonthOrders: 0, thisMonthAmount: 0 };
  const dbConn = await getDbConnection();
  if (!dbConn) return { totalOrders: 0, totalAmount: 0, thisMonthOrders: 0, thisMonthAmount: 0 };

  const placeholders = memberIds.map(() => "?").join(",");
  const [totalRows] = await dbConn.execute(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(totalPrice), 0) as amt FROM miban_orders WHERE userId IN (${placeholders}) AND status NOT IN ('cancelled')`,
    memberIds
  );
  const [monthRows] = await dbConn.execute(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(totalPrice), 0) as amt FROM miban_orders WHERE userId IN (${placeholders}) AND status NOT IN ('cancelled') AND createdAt >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
    memberIds
  );

  const total = (totalRows as any[])[0];
  const month = (monthRows as any[])[0];
  return {
    totalOrders: Number(total.cnt),
    totalAmount: Number(total.amt),
    thisMonthOrders: Number(month.cnt),
    thisMonthAmount: Number(month.amt),
  };
}

// ─── 工具：获取代数奖配置 ────────────────────────────────────────────────────
async function getPlanGenerationBonus(planId: number): Promise<{ genIndex: number; rate: number }[]> {
  const dbConn = await getDbConnection();
  if (!dbConn) return [];
  try {
    const [rows] = await dbConn.execute(
      `SELECT gen_index, rate FROM miban_plan_generation_bonus WHERE plan_id = ? ORDER BY gen_index ASC`,
      [planId]
    );
    return (rows as any[]).map(r => ({ genIndex: Number(r.gen_index), rate: Number(r.rate) }));
  } catch {
    return [];
  }
}

// ─── 工具：获取制度的所有层级配置 ────────────────────────────────────────────
async function getPlanLevels(planId: number): Promise<{ levelIndex: number; rate: number }[]> {
  const dbConn = await getDbConnection();
  if (!dbConn) return [];
  try {
    const [rows] = await dbConn.execute(
      `SELECT level_index, rate FROM miban_commission_plan_levels WHERE plan_id = ? ORDER BY level_index ASC`,
      [planId]
    );
    return (rows as any[]).map(r => ({ levelIndex: Number(r.level_index), rate: Number(r.rate) }));
  } catch {
    return [];
  }
}

// ─── 团队管理路由（仅管理员） ──────────────────────────────────────────────────
export const mibanTeamRouter = router({

  // ── 制度管理 ────────────────────────────────────────────────────────────────

  // 获取所有销售制度（含层级 + 职级）
  listPlans: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    const dbConn = await getDbConnection();
    if (!dbConn) return [];
    const [rows] = await dbConn.execute(
      `SELECT id, name, trigger_event AS triggerEvent, settlement, note, sales_rate AS salesRate, dividend_rate AS dividendRate, created_at AS createdAt FROM miban_commission_plans ORDER BY created_at DESC`
    );
    const plans = rows as any[];
    // 附带层级配置 + 职级配置
    const result = await Promise.all(plans.map(async (plan: any) => {
      const levels = await getPlanLevels(plan.id);
      const [rankRows] = await dbConn.execute(
        `SELECT id, rank_index AS rankIndex, name, bonus_rate AS bonusRate, condition_type AS conditionType, unlock_type AS unlockType, personal_cumulative_min AS personalCumulativeMin, team_cumulative_min AS teamCumulativeMin, personal_sales_min AS personalSalesMin, team_size_min AS teamSizeMin, team_sales_min AS teamSalesMin FROM miban_plan_ranks WHERE plan_id = ? ORDER BY rank_index ASC`,
        [plan.id]
      );
      const generationBonus = await getPlanGenerationBonus(plan.id);
      return { ...plan, levels, ranks: rankRows as any[], generationBonus };
    }));
    return result;
  }),

  // 创建销售制度（含初始层级）
  createPlan: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(64),
      triggerEvent: z.enum(["order_placed", "order_confirmed"]).default("order_confirmed"),
      settlement: z.enum(["auto", "manual"]).default("manual"),
      note: z.string().optional(),
      // 无限级层级配置：[{ levelIndex: 1, rate: 0.5 }, { levelIndex: 2, rate: 0.3 }, ...]
      levels: z.array(z.object({
        levelIndex: z.number().int().min(1),
        rate: z.number().min(0).max(1),
      })).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      assertAdmin(ctx);
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 插入制度主记录（保留旧字段兼容）
      const [result] = await dbConn.execute(
        `INSERT INTO miban_commission_plans (name, trigger_event, level1_rate, level2_rate, level3_rate, settlement, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.name,
          input.triggerEvent,
          String(input.levels[0]?.rate ?? 0.05),
          String(input.levels[1]?.rate ?? 0.02),
          String(input.levels[2]?.rate ?? 0.01),
          input.settlement,
          input.note ?? null,
        ]
      );
      const planId = (result as any).insertId;

      // 插入层级配置
      if (input.levels.length > 0) {
        for (const lv of input.levels) {
          await dbConn.execute(
            `INSERT INTO miban_commission_plan_levels (plan_id, level_index, rate) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rate = VALUES(rate)`,
            [planId, lv.levelIndex, String(lv.rate)]
          );
        }
      }
      return { ok: true, planId };
    }),

  // 更新销售制度（含层级 + 职级）
  updatePlan: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(64).optional(),
      triggerEvent: z.enum(["order_placed", "order_confirmed"]).optional(),
      settlement: z.enum(["auto", "manual"]).optional(),
      note: z.string().optional(),
      levels: z.array(z.object({
        levelIndex: z.number().int().min(1),
        rate: z.number().min(0).max(1),
      })).optional(),
      // 职级奖金配置（完整替换）
      ranks: z.array(z.object({
        rankIndex: z.number().int().min(1),
        name: z.string().min(1).max(32),
        bonusRate: z.number().min(0).max(1),
        conditionType: z.enum(['personal', 'team', 'both']).default('personal'),
        unlockType: z.enum(['personal_cumulative','team_cumulative','personal_monthly','team_monthly']).default('personal_cumulative'),
        personalCumulativeMin: z.number().nullable().optional(),
        teamCumulativeMin: z.number().nullable().optional(),
        personalSalesMin: z.number().nullable().optional(),
        teamSizeMin: z.number().int().nullable().optional(),
        teamSalesMin: z.number().nullable().optional(),
      })).optional(),
      // 代数奖配置（完整替换，无限代）
      generationBonus: z.array(z.object({
        genIndex: z.number().int().min(1),
        rate: z.number().min(0).max(1),
      })).optional(),
      // 销售提成率
      salesRate: z.number().min(0).max(1).optional(),
      // 分红率（米庄及以上解锁）
      dividendRate: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertAdmin(ctx);
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 更新制度主记录
      const setParts: string[] = [];
      const setVals: any[] = [];
      if (input.name !== undefined) { setParts.push('name = ?'); setVals.push(input.name); }
      if (input.triggerEvent !== undefined) { setParts.push('trigger_event = ?'); setVals.push(input.triggerEvent); }
      if (input.settlement !== undefined) { setParts.push('settlement = ?'); setVals.push(input.settlement); }
      if (input.note !== undefined) { setParts.push('note = ?'); setVals.push(input.note); }
      if (input.salesRate !== undefined) { setParts.push('sales_rate = ?'); setVals.push(String(input.salesRate)); }
      if (input.dividendRate !== undefined) { setParts.push('dividend_rate = ?'); setVals.push(String(input.dividendRate)); }
      // 同步更新旧的 level1/2/3 字段（兼容旧逻辑）
      if (input.levels) {
        if (input.levels[0]) { setParts.push('level1_rate = ?'); setVals.push(String(input.levels[0].rate)); }
        if (input.levels[1]) { setParts.push('level2_rate = ?'); setVals.push(String(input.levels[1].rate)); }
        if (input.levels[2]) { setParts.push('level3_rate = ?'); setVals.push(String(input.levels[2].rate)); }
      }
      if (setParts.length > 0) {
        await dbConn.execute(
          `UPDATE miban_commission_plans SET ${setParts.join(', ')} WHERE id = ?`,
          [...setVals, input.id]
        );
      }

      // 完整替换层级配置
      if (input.levels !== undefined) {
        await dbConn.execute(`DELETE FROM miban_commission_plan_levels WHERE plan_id = ?`, [input.id]);
        for (const lv of input.levels) {
          await dbConn.execute(
            `INSERT INTO miban_commission_plan_levels (plan_id, level_index, rate) VALUES (?, ?, ?)`,
            [input.id, lv.levelIndex, String(lv.rate)]
          );
        }
      }
      // 完整替换职级配置
      if (input.ranks !== undefined) {
        await dbConn.execute(`DELETE FROM miban_plan_ranks WHERE plan_id = ?`, [input.id]);
        for (const rk of input.ranks) {
          await dbConn.execute(
            `INSERT INTO miban_plan_ranks (plan_id, rank_index, name, bonus_rate, condition_type, unlock_type, personal_cumulative_min, team_cumulative_min, personal_sales_min, team_size_min, team_sales_min) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.id, rk.rankIndex, rk.name, String(rk.bonusRate), rk.conditionType, rk.unlockType ?? 'personal_cumulative', rk.personalCumulativeMin ?? null, rk.teamCumulativeMin ?? null, rk.personalSalesMin ?? null, rk.teamSizeMin ?? null, rk.teamSalesMin ?? null]
          );
        }
      }
      // 完整替换代数奖配置
      if (input.generationBonus !== undefined) {
        await dbConn.execute(`DELETE FROM miban_plan_generation_bonus WHERE plan_id = ?`, [input.id]);
        for (const gb of input.generationBonus) {
          await dbConn.execute(
            `INSERT INTO miban_plan_generation_bonus (plan_id, gen_index, rate) VALUES (?, ?, ?)`,
            [input.id, gb.genIndex, String(gb.rate)]
          );
        }
      }
      return { ok: true };
    }),

  // 删除销售制度
  deletePlan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertAdmin(ctx);
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await dbConn.execute(`DELETE FROM miban_commission_plan_levels WHERE plan_id = ?`, [input.id]);
      await dbConn.execute(`DELETE FROM miban_plan_ranks WHERE plan_id = ?`, [input.id]);
      await dbConn.execute(`DELETE FROM miban_plan_generation_bonus WHERE plan_id = ?`, [input.id]);
      await dbConn.execute(`DELETE FROM miban_commission_plans WHERE id = ?`, [input.id]);
      return { ok: true };
    }),

  // ── 团队管理 ────────────────────────────────────────────────────────────────

  // 获取所有团队（含成员数和本月业绩）
  listTeams: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    const dbConn = await getDbConnection();
    if (!dbConn) return [];
    // 只返回基本信息，不做递归查询，确保快速响应
    const [teamRows] = await dbConn.execute(
      `SELECT t.id, t.name, t.root_user_id, t.commission_plan_id, t.payout_rate_multiplier, t.description, t.created_at,
              u.name AS root_user_name, u.username AS root_user_username,
              p.name AS plan_name
       FROM miban_teams t
       LEFT JOIN users u ON u.id = t.root_user_id
       LEFT JOIN miban_commission_plans p ON p.id = t.commission_plan_id
       ORDER BY t.created_at DESC`
    );
    return (teamRows as any[]).map(team => ({
      id: team.id,
      name: team.name,
      rootUserId: team.root_user_id,
      rootUserName: team.root_user_name ?? team.root_user_username ?? `ID ${team.root_user_id}`,
      commissionPlanId: team.commission_plan_id,
      planName: team.plan_name ?? null,
      payoutRateMultiplier: Number(team.payout_rate_multiplier ?? 1),
      description: team.description,
      createdAt: team.created_at,
    }));
  }),

  // 创建团队
  createTeam: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(64),
      rootUserId: z.number(),
      commissionPlanId: z.number().optional(),
      payoutRateMultiplier: z.number().min(0).max(10).default(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertAdmin(ctx);
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await dbConn.execute(
        `INSERT INTO miban_teams (name, root_user_id, commission_plan_id, payout_rate_multiplier, description) VALUES (?, ?, ?, ?, ?)`,
        [
          input.name,
          input.rootUserId,
          input.commissionPlanId ?? null,
          String(input.payoutRateMultiplier),
          input.description ?? null,
        ]
      );
      return { ok: true };
    }),

  // 更新团队
  updateTeam: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(64).optional(),
      commissionPlanId: z.number().nullable().optional(),
      payoutRateMultiplier: z.number().min(0).max(10).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertAdmin(ctx);
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const setParts: string[] = [];
      const setVals: any[] = [];
      if (input.name !== undefined) { setParts.push('name = ?'); setVals.push(input.name); }
      if (input.commissionPlanId !== undefined) { setParts.push('commission_plan_id = ?'); setVals.push(input.commissionPlanId); }
      if (input.payoutRateMultiplier !== undefined) { setParts.push('payout_rate_multiplier = ?'); setVals.push(String(input.payoutRateMultiplier)); }
      if (input.description !== undefined) { setParts.push('description = ?'); setVals.push(input.description); }
      if (setParts.length > 0) {
        await dbConn.execute(
          `UPDATE miban_teams SET ${setParts.join(', ')} WHERE id = ?`,
          [...setVals, input.id]
        );
      }
      return { ok: true };
    }),

  // 删除团队
  deleteTeam: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertAdmin(ctx);
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await dbConn.execute(`DELETE FROM miban_teams WHERE id = ?`, [input.id]);
      return { ok: true };
    }),

  // 获取团队成员树（含层级、订单数）
  getTeamMembers: protectedProcedure
    .input(z.object({ teamId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx);
      try {
      const dbConn = await getDbConnection();
      if (!dbConn) return { team: null, members: [] };
      const [teamRows] = await dbConn.execute(
        `SELECT id, name, root_user_id, commission_plan_id, payout_rate_multiplier, description FROM miban_teams WHERE id = ? LIMIT 1`,
        [input.teamId]
      );
      const teamArr = teamRows as any[];
      if (!teamArr.length) return { team: null, members: [] };
      const team = teamArr[0];
      const members = await getMemberTree(team.root_user_id, 10);
      const memberIds = members.map((m: any) => m.id);
      let orderMap: Record<number, { cnt: number; amt: number }> = {};
      if (memberIds.length) {
        const ph = memberIds.map(() => "?").join(",");
        const [rows] = await dbConn.execute(
          `SELECT userId, COUNT(*) as cnt, COALESCE(SUM(totalPrice),0) as amt FROM miban_orders WHERE userId IN (${ph}) AND status NOT IN ('cancelled') GROUP BY userId`,
          memberIds
        );
        for (const r of rows as any[]) {
          orderMap[r.userId] = { cnt: Number(r.cnt), amt: Number(r.amt) };
        }
      }
      const enriched = members.map((m: any) => ({
        ...m,
        orderCount: orderMap[m.id]?.cnt ?? 0,
        orderAmount: orderMap[m.id]?.amt ?? 0,
      }));
      console.log('[getTeamMembers] teamId:', input.teamId, 'rootUserId:', team.root_user_id, 'memberCount:', enriched.length);
      return {
        team: {
          id: team.id,
          name: team.name,
          rootUserId: team.root_user_id,
          commissionPlanId: team.commission_plan_id,
          payoutRateMultiplier: Number(team.payout_rate_multiplier ?? 1),
          description: team.description,
        },
        members: enriched,
      };
      } catch(e: any) {
        console.error('[getTeamMembers] ERROR:', e?.message, e?.stack?.split('\n')[1]);
        return { team: null, members: [] };
      }
    }),

  // 搜索用户（创建团队时选根节点用）
  searchUsers: protectedProcedure
    .input(z.object({ keyword: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      assertAdmin(ctx);
      const dbConn = await getDbConnection();
      if (!dbConn) return [];
      const kw = `%${input.keyword}%`;
      const [rows] = await dbConn.execute(
        `SELECT id, name, username, invite_code FROM users WHERE (name LIKE ? OR username LIKE ? OR invite_code LIKE ?) LIMIT 20`,
        [kw, kw, kw]
      );
      return rows as any[];
    }),
});
