// @ts-nocheck
import { z } from "zod";
import { and, eq, sql, desc } from "drizzle-orm";
import { mibanTeams, mibanCommissionPlans, mibanOrders, users } from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./_core/db";
import { getDbConnection } from "./_core/db";

// ─── 工具：递归获取某用户下的所有成员（人脉树） ─────────────────────────────────
async function getMemberTree(rootUserId: number, maxDepth = 5): Promise<any[]> {
  const dbConn = await getDbConnection();
  if (!dbConn) return [];

  // 用递归CTE查询整棵人脉树
  const [rows] = await dbConn.execute(`
    WITH RECURSIVE tree AS (
      SELECT id, name, account, inviteCode, invitedByUserId, createdAt, 1 AS depth
      FROM users
      WHERE id = ?
      UNION ALL
      SELECT u.id, u.name, u.account, u.inviteCode, u.invitedByUserId, u.createdAt, t.depth + 1
      FROM users u
      INNER JOIN tree t ON u.invitedByUserId = t.id
      WHERE t.depth < ?
    )
    SELECT id, name, account, inviteCode, invitedByUserId, createdAt, depth
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
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as amt FROM miban_orders WHERE user_id IN (${placeholders}) AND status NOT IN ('cancelled')`,
    memberIds
  );
  const [monthRows] = await dbConn.execute(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as amt FROM miban_orders WHERE user_id IN (${placeholders}) AND status NOT IN ('cancelled') AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
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

// ─── 团队管理路由（仅超级管理员） ─────────────────────────────────────────────
export const mibanTeamRouter = router({

  // 获取所有销售制度
  listPlans: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    return db.select().from(mibanCommissionPlans).orderBy(desc(mibanCommissionPlans.createdAt));
  }),

  // 创建销售制度
  createPlan: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(64),
      triggerEvent: z.enum(["order_placed", "order_confirmed"]).default("order_confirmed"),
      level1Rate: z.number().min(0).max(1).default(0.05),
      level2Rate: z.number().min(0).max(1).default(0.02),
      level3Rate: z.number().min(0).max(1).default(0.01),
      settlement: z.enum(["auto", "manual"]).default("manual"),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(mibanCommissionPlans).values({
        name: input.name,
        triggerEvent: input.triggerEvent,
        level1Rate: String(input.level1Rate),
        level2Rate: String(input.level2Rate),
        level3Rate: String(input.level3Rate),
        settlement: input.settlement,
        note: input.note ?? null,
      });
      return { ok: true };
    }),

  // 更新销售制度
  updatePlan: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(64).optional(),
      triggerEvent: z.enum(["order_placed", "order_confirmed"]).optional(),
      level1Rate: z.number().min(0).max(1).optional(),
      level2Rate: z.number().min(0).max(1).optional(),
      level3Rate: z.number().min(0).max(1).optional(),
      settlement: z.enum(["auto", "manual"]).optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...rest } = input;
      const updates: any = {};
      if (rest.name !== undefined) updates.name = rest.name;
      if (rest.triggerEvent !== undefined) updates.triggerEvent = rest.triggerEvent;
      if (rest.level1Rate !== undefined) updates.level1Rate = String(rest.level1Rate);
      if (rest.level2Rate !== undefined) updates.level2Rate = String(rest.level2Rate);
      if (rest.level3Rate !== undefined) updates.level3Rate = String(rest.level3Rate);
      if (rest.settlement !== undefined) updates.settlement = rest.settlement;
      if (rest.note !== undefined) updates.note = rest.note;
      await db.update(mibanCommissionPlans).set(updates).where(eq(mibanCommissionPlans.id, id));
      return { ok: true };
    }),

  // 删除销售制度
  deletePlan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(mibanCommissionPlans).where(eq(mibanCommissionPlans.id, input.id));
      return { ok: true };
    }),

  // 获取所有团队（含成员数和本月业绩）
  listTeams: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    const teams = await db.select().from(mibanTeams).orderBy(desc(mibanTeams.createdAt));
    // 并发获取每个团队的成员树和业绩
    const result = await Promise.all(teams.map(async (team) => {
      const members = await getMemberTree(team.rootUserId, 10);
      const memberIds = members.map((m: any) => m.id);
      const stats = await getTeamStats(memberIds);
      // 获取根节点用户名
      const rootUser = members.find((m: any) => m.id === team.rootUserId);
      return {
        ...team,
        memberCount: members.length,
        rootUserName: rootUser?.name ?? rootUser?.account ?? "未知",
        stats,
      };
    }));
    return result;
  }),

  // 创建团队
  createTeam: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(64),
      rootUserId: z.number(),
      commissionPlanId: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(mibanTeams).values({
        name: input.name,
        rootUserId: input.rootUserId,
        commissionPlanId: input.commissionPlanId ?? null,
        description: input.description ?? null,
      });
      return { ok: true };
    }),

  // 更新团队
  updateTeam: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(64).optional(),
      commissionPlanId: z.number().nullable().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...rest } = input;
      const updates: any = {};
      if (rest.name !== undefined) updates.name = rest.name;
      if (rest.commissionPlanId !== undefined) updates.commissionPlanId = rest.commissionPlanId;
      if (rest.description !== undefined) updates.description = rest.description;
      await db.update(mibanTeams).set(updates).where(eq(mibanTeams.id, id));
      return { ok: true };
    }),

  // 删除团队
  deleteTeam: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(mibanTeams).where(eq(mibanTeams.id, input.id));
      return { ok: true };
    }),

  // 获取团队成员树（含层级、订单数）
  getTeamMembers: protectedProcedure
    .input(z.object({ teamId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { team: null, members: [] };
      const [team] = await db.select().from(mibanTeams).where(eq(mibanTeams.id, input.teamId)).limit(1);
      if (!team) return { team: null, members: [] };
      const members = await getMemberTree(team.rootUserId, 10);
      // 批量查询每个成员的订单数和总金额
      const memberIds = members.map((m: any) => m.id);
      const dbConn = await getDbConnection();
      let orderMap: Record<number, { cnt: number; amt: number }> = {};
      if (dbConn && memberIds.length) {
        const ph = memberIds.map(() => "?").join(",");
        const [rows] = await dbConn.execute(
          `SELECT user_id, COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as amt FROM miban_orders WHERE user_id IN (${ph}) AND status NOT IN ('cancelled') GROUP BY user_id`,
          memberIds
        );
        for (const r of rows as any[]) {
          orderMap[r.user_id] = { cnt: Number(r.cnt), amt: Number(r.amt) };
        }
      }
      const enriched = members.map((m: any) => ({
        ...m,
        orderCount: orderMap[m.id]?.cnt ?? 0,
        orderAmount: orderMap[m.id]?.amt ?? 0,
      }));
      return { team, members: enriched };
    }),

  // 搜索用户（创建团队时选根节点用）
  searchUsers: protectedProcedure
    .input(z.object({ keyword: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
      const dbConn = await getDbConnection();
      if (!dbConn) return [];
      const kw = `%${input.keyword}%`;
      const [rows] = await dbConn.execute(
        `SELECT id, name, account, inviteCode FROM users WHERE (name LIKE ? OR account LIKE ? OR inviteCode LIKE ?) LIMIT 20`,
        [kw, kw, kw]
      );
      return rows as any[];
    }),
});
