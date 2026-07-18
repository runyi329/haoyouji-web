import { nanoid } from "nanoid";
import { z } from "zod";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import {
  mibanCartItems,
  mibanSavedRecipes,
  mibanRiceVarieties,
  mibanPresetRecipes,
  mibanHealthProfiles,
  mibanUserRecipes,
  mibanOrders,
  mibanCommissionConfig,
  mibanCommissions,
  users,
} from "../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { TRPCError } from "@trpc/server";
import { getDb, getDbConnection } from "./db";
import { sdk } from "./_core/sdk";
import { ONE_YEAR_MS } from "@shared/const";
import { getUserCnyBalance, adminAdjustCnyBalance, addUserBalance, getUserBalance } from "./db-recharge";
import { getUsdtCnyRate } from "./price-scanner";

// 管理员中间件：米伴只有 jiang 一个管理员
const MIBAN_ADMIN_USERNAMES = ["jiang"];
const mibanAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const user = ctx.user as any;
  const isAdmin =
    MIBAN_ADMIN_USERNAMES.includes(user?.username) ||
    user?.role === 'admin' ||
    user?.role === 'super_admin';
  if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
  return next({ ctx });
});

// ─── DB 辅助函数 ─────────────────────────────────────────────────────────────

async function getRiceVarieties(category?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(mibanRiceVarieties.isActive, true)];
  if (category) conditions.push(eq(mibanRiceVarieties.category, category));
  return db.select().from(mibanRiceVarieties).where(and(...conditions)).orderBy(mibanRiceVarieties.sortOrder);
}

async function getRiceVarietyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(mibanRiceVarieties).where(eq(mibanRiceVarieties.id, id)).limit(1);
  return result[0];
}

async function upsertRiceVariety(data: Partial<typeof mibanRiceVarieties.$inferInsert> & { id?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.id) {
    const { id, ...rest } = data;
    await db.update(mibanRiceVarieties).set(rest).where(eq(mibanRiceVarieties.id, id));
    return id;
  } else {
    const result = await db.insert(mibanRiceVarieties).values(data as typeof mibanRiceVarieties.$inferInsert);
    return (result[0] as any).insertId as number;
  }
}

async function getPresetRecipes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mibanPresetRecipes).where(eq(mibanPresetRecipes.isActive, true)).orderBy(mibanPresetRecipes.sortOrder);
}

async function getHealthProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(mibanHealthProfiles).where(eq(mibanHealthProfiles.userId, userId)).limit(1);
  return result[0];
}

async function upsertHealthProfile(data: typeof mibanHealthProfiles.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getHealthProfile(data.userId);
  if (existing) {
    await db.update(mibanHealthProfiles).set(data).where(eq(mibanHealthProfiles.userId, data.userId));
    return existing.id;
  } else {
    const result = await db.insert(mibanHealthProfiles).values(data);
    return (result[0] as any).insertId as number;
  }
}

async function getUserRecipes(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mibanUserRecipes).where(eq(mibanUserRecipes.userId, userId)).orderBy(desc(mibanUserRecipes.createdAt));
}

async function saveUserRecipe(data: typeof mibanUserRecipes.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(mibanUserRecipes).values(data);
  return (result[0] as any).insertId as number;
}

async function deleteUserRecipe(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(mibanUserRecipes).where(and(eq(mibanUserRecipes.id, id), eq(mibanUserRecipes.userId, userId)));
}

async function createOrder(data: typeof mibanOrders.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(mibanOrders).values(data);
  return (result[0] as any).insertId as number;
}

async function getUserOrders(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mibanOrders).where(eq(mibanOrders.userId, userId)).orderBy(desc(mibanOrders.createdAt));
}

async function getAllOrders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mibanOrders).orderBy(desc(mibanOrders.createdAt));
}

async function updateOrderStatus(
  id: number,
  status: "pending" | "confirmed" | "packing" | "shipped" | "delivered" | "cancelled",
  trackingNo?: string,
  trackingCompany?: string,
  adminNote?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(mibanOrders).set({ status, trackingNo, trackingCompany, adminNote }).where(eq(mibanOrders.id, id));
}

async function getAllCommissionConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mibanCommissionConfig).orderBy(mibanCommissionConfig.agentId);
}

async function setCommissionConfig(agentId: number | null, rate: number, note: string | undefined, updatedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (agentId === null) {
    const [existing] = await db.select({ id: mibanCommissionConfig.id }).from(mibanCommissionConfig).where(isNull(mibanCommissionConfig.agentId));
    if (existing) {
      await db.update(mibanCommissionConfig).set({ commissionRate: rate.toString() as any, note, updatedBy }).where(eq(mibanCommissionConfig.id, existing.id));
    } else {
      await db.insert(mibanCommissionConfig).values({ agentId: null, commissionRate: rate.toString() as any, note, updatedBy });
    }
  } else {
    const [existing] = await db.select({ id: mibanCommissionConfig.id }).from(mibanCommissionConfig).where(eq(mibanCommissionConfig.agentId, agentId));
    if (existing) {
      await db.update(mibanCommissionConfig).set({ commissionRate: rate.toString() as any, note, updatedBy }).where(eq(mibanCommissionConfig.id, existing.id));
    } else {
      await db.insert(mibanCommissionConfig).values({ agentId, commissionRate: rate.toString() as any, note, updatedBy });
    }
  }
}

async function deleteCommissionConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(mibanCommissionConfig).where(eq(mibanCommissionConfig.id, id));
}

async function getAgentCommissions(agentUserId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mibanCommissions).where(eq(mibanCommissions.agentId, agentUserId)).orderBy(desc(mibanCommissions.createdAt));
}

async function getAgentMonthlyStats(agentUserId: number) {
  const db = await getDb();
  if (!db) return { totalCommission: 0, pendingCommission: 0, settledCommission: 0, orderCount: 0 };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await db.select().from(mibanCommissions).where(and(eq(mibanCommissions.agentId, agentUserId), sql`${mibanCommissions.createdAt} >= ${monthStart}`));
  const total = rows.reduce((s, r) => s + Number(r.commissionAmount), 0);
  const pending = rows.filter(r => r.status === "pending").reduce((s, r) => s + Number(r.commissionAmount), 0);
  const settled = rows.filter(r => r.status === "settled").reduce((s, r) => s + Number(r.commissionAmount), 0);
  return { totalCommission: total, pendingCommission: pending, settledCommission: settled, orderCount: rows.length };
}

async function getAllAgentStats() {
  const db = await getDb();
  if (!db) return [];
  const agents = await db.select({ id: users.id, name: users.name, inviteCount: users.inviteCount, createdAt: users.createdAt }).from(users).where(eq(users.mibanRole, "parent"));
  const result = await Promise.all(agents.map(async (agent) => {
    const commRows = await db.select().from(mibanCommissions).where(eq(mibanCommissions.agentId, agent.id));
    const total = commRows.reduce((s, r) => s + Number(r.commissionAmount), 0);
    const pending = commRows.filter(r => r.status === "pending").reduce((s, r) => s + Number(r.commissionAmount), 0);
    return { ...agent, totalCommission: total, pendingCommission: pending, orderCount: commRows.length };
  }));
  return result;
}

async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  const userList = await db.select({
    id: users.id,
    name: users.name,
    username: users.username,
    openId: users.openId,
    role: users.role,
    mibanRole: users.mibanRole,
    inviteCode: users.inviteCode,
    inviteCount: users.inviteCount,
    invitedByUserId: users.invitedByUserId,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
    balance: users.balance,
    points: users.points,
  }).from(users).orderBy(desc(users.createdAt));

  // 获取每个用户的订单数量（加 try-catch 防止表不存在时崩溃）
  let orderCountMap = new Map<number, number>();
  try {
    const orderCounts = await db.select({
      userId: mibanOrders.userId,
      orderCount: sql<number>`count(*)`,
    }).from(mibanOrders).groupBy(mibanOrders.userId);
    orderCountMap = new Map(orderCounts.map(r => [r.userId, Number(r.orderCount)]));
  } catch (e) {
    console.warn('[miban] getAllUsers: miban_orders query failed (table may not exist yet):', (e as any)?.message);
  }

  // 批量查询全局钱包余额（一次 GROUP BY ，避免相关子查询）
  // USDT: users.balance + 全部 af_manual_balances
  // CNY:  users.balance_cny + af_manual_balances WHERE note LIKE '[CNY]%'
  const conn = await getDbConnection();
  let usdtMap = new Map<number, number>();
  let cnyMap = new Map<number, number>();
  if (conn && userList.length > 0) {
    const ids = userList.map(u => u.id);
    const placeholders = ids.map(() => '?').join(',');
    // USDT 余额：users.balance + af_manual_balances SUM（一次 LEFT JOIN GROUP BY）
    const [usdtRows] = await (conn as any).execute(
      `SELECT u.id AS userId,
        COALESCE(u.balance, 0) + COALESCE(m.manualSum, 0) AS usdtBalance
       FROM users u
       LEFT JOIN (
         SELECT user_id, SUM(amount) AS manualSum
         FROM af_manual_balances
         WHERE user_id IN (${placeholders})
         GROUP BY user_id
       ) m ON m.user_id = u.id
       WHERE u.id IN (${placeholders})`,
      [...ids, ...ids]
    ) as any[];
    for (const r of (Array.isArray(usdtRows) ? usdtRows : [])) {
      usdtMap.set(Number(r.userId), parseFloat(r.usdtBalance?.toString() || '0'));
    }
    // CNY 余额：users.balance_cny + af_manual_balances[CNY] SUM（一次 LEFT JOIN GROUP BY）
    const [cnyRows] = await (conn as any).execute(
      `SELECT u.id AS userId,
        COALESCE(u.balance_cny, 0) + COALESCE(c.cnySum, 0) AS cnyBalance
       FROM users u
       LEFT JOIN (
         SELECT user_id, SUM(amount) AS cnySum
         FROM af_manual_balances
         WHERE user_id IN (${placeholders}) AND note LIKE '[CNY]%'
         GROUP BY user_id
       ) c ON c.user_id = u.id
       WHERE u.id IN (${placeholders})`,
      [...ids, ...ids]
    ) as any[];
    for (const r of (Array.isArray(cnyRows) ? cnyRows : [])) {
      cnyMap.set(Number(r.userId), parseFloat(r.cnyBalance?.toString() || '0'));
    }
  }

  return userList.map(u => ({
    ...u,
    orderCount: orderCountMap.get(u.id) ?? 0,
    usdtBalance: usdtMap.get(u.id) ?? parseFloat(String(u.balance ?? '0')),
    cnyBalance: cnyMap.get(u.id) ?? 0,
  }));
}

async function updateUserMibanRole(userId: number, role: "parent" | "baby") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({ mibanRole: role }).where(eq(users.id, userId));
}

async function getOrCreateInviteInfo(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [user] = await db.select({ id: users.id, inviteCode: users.inviteCode, invitedByUserId: users.invitedByUserId }).from(users).where(eq(users.id, userId));
  if (!user) throw new Error("用户不存在");
  if (!user.inviteCode) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 10; i++) {
      const candidate = Array.from({ length: 6 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.inviteCode, candidate));
      if (!existing) { code = candidate; break; }
    }
    if (!code) throw new Error("生成邀请码失败");
    await db.update(users).set({ inviteCode: code }).where(eq(users.id, userId));
    user.inviteCode = code;
  }
  const [countRow] = await db.select({ cnt: count() }).from(users).where(eq(users.invitedByUserId, userId));
  return { inviteCode: user.inviteCode, inviteCount: Number(countRow?.cnt ?? 0), invitedByUserId: user.invitedByUserId };
}

async function findUserByInviteCode(inviteCode: string) {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.inviteCode, inviteCode));
  return user ?? null;
}

async function bindInviter(userId: number, invitedByUserId: number): Promise<{ success: boolean; alreadyBound: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [me] = await db.select({ invitedByUserId: users.invitedByUserId }).from(users).where(eq(users.id, userId));
  if (me?.invitedByUserId) return { success: false, alreadyBound: true };
  await db.update(users).set({ invitedByUserId }).where(eq(users.id, userId));
  await db.execute(sql`UPDATE users SET invite_count = invite_count + 1 WHERE id = ${invitedByUserId}`);
  return { success: true, alreadyBound: false };
}

async function getMyInvitedUsers(agentUserId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, createdAt: users.createdAt, inviteCount: users.inviteCount }).from(users).where(eq(users.invitedByUserId, agentUserId)).orderBy(desc(users.createdAt));
}

// ─── 收藏配方 Router ─────────────────────────────────────────────────────────
export const savedRecipesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(mibanSavedRecipes).where(eq(mibanSavedRecipes.userId, ctx.user!.openId!)).orderBy(mibanSavedRecipes.createdAt);
  }),
  save: protectedProcedure
    .input(z.object({
      recipeName: z.string().min(1).max(100),
      purpose: z.string().default("rice"),
      preferences: z.array(z.string()).default([]),
      aiReason: z.string().optional(),
      items: z.array(z.object({
        riceId: z.string(),
        riceName: z.string(),
        ratio: z.number(),
        pricePerJin: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(mibanSavedRecipes).values({
        userId: ctx.user!.openId!,
        recipeName: input.recipeName,
        purpose: input.purpose,
        preferences: JSON.stringify(input.preferences),
        aiReason: input.aiReason ?? null,
        items: JSON.stringify(input.items),
      });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(mibanSavedRecipes).where(and(eq(mibanSavedRecipes.id, input.id), eq(mibanSavedRecipes.userId, ctx.user!.openId!)));
      return { success: true };
    }),
});

// ─── 各子路由（独立导出，供 appRouter 直接注册）────────────────────────────────
export const mibanRiceRouter = router({
  list: publicProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(({ input }) => getRiceVarieties(input?.category)),
  detail: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getRiceVarietyById(input.id)),
  upsert: mibanAdminProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1),
      category: z.string().min(1),
      subCategory: z.string().optional(),
      origin: z.string().optional(),
      pricePerJin: z.number().positive(),
      giValue: z.number().optional(),
      sugarLevel: z.string().optional(),
      fiberLevel: z.string().optional(),
      proteinLevel: z.string().optional(),
      taste: z.string().optional(),
      suitableFor: z.array(z.string()).optional(),
      healthTags: z.array(z.string()).optional(),
      description: z.string().optional(),
      colorHex: z.string().optional(),
      colorName: z.string().optional(),
      stock: z.number().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const data = {
        ...input,
        suitableFor: input.suitableFor ? JSON.stringify(input.suitableFor) as any : undefined,
        healthTags: input.healthTags ? JSON.stringify(input.healthTags) as any : undefined,
        pricePerJin: input.pricePerJin.toString() as any,
      };
      return upsertRiceVariety(data);
    }),
  // 管理员接口：查询所有米种（含未激活）
  adminList: mibanAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(mibanRiceVarieties).orderBy(mibanRiceVarieties.sortOrder, mibanRiceVarieties.id);
  }),
  // 管理员接口：删除米种
  delete: mibanAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(mibanRiceVarieties).where(eq(mibanRiceVarieties.id, input.id));
      return { success: true };
    }),
  // 管理员接口：切换激活状态
  toggleActive: mibanAdminProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(mibanRiceVarieties).set({ isActive: input.isActive }).where(eq(mibanRiceVarieties.id, input.id));
      return { success: true };
    }),
  // 管理员接口：上传图片
  uploadImg: mibanAdminProcedure
    .input(z.object({ id: z.number(), base64: z.string(), mimeType: z.string().default("image/webp") }))
    .mutation(async ({ input }) => {
      const { uploadFileToCOS } = await import("./cos-upload");
      const ext = input.mimeType.split("/")[1] ?? "webp";
      const filename = `rice_db_${input.id}_${Date.now()}.${ext}`;
      const url = await uploadFileToCOS(input.base64, "assets/miban", filename, input.mimeType);
      const db = await getDb();
      if (db) await db.update(mibanRiceVarieties).set({ img: url } as any).where(eq(mibanRiceVarieties.id, input.id));
      return { url };
    }),
});

export const mibanPresetRouter = router({
  list: publicProcedure.query(() => getPresetRecipes()),
});

export const mibanHealthRouter = router({
  getProfile: protectedProcedure.query(({ ctx }) => getHealthProfile(ctx.user!.id)),
  saveProfile: protectedProcedure
    .input(z.object({
      age: z.number().optional(),
      gender: z.enum(["male", "female", "other"]).optional(),
      weight: z.number().optional(),
      height: z.number().optional(),
      bloodSugar: z.enum(["normal", "prediabetes", "diabetes"]).optional(),
      bloodPressure: z.enum(["normal", "high", "low"]).optional(),
      dietGoal: z.enum(["lose_weight", "gain_muscle", "maintain", "health"]).optional(),
      allergies: z.array(z.string()).optional(),
      healthConditions: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const data = {
        userId: ctx.user!.id,
        ...input,
        weight: input.weight?.toString() as any,
        height: input.height?.toString() as any,
        allergies: input.allergies ? JSON.stringify(input.allergies) as any : undefined,
        healthConditions: input.healthConditions ? JSON.stringify(input.healthConditions) as any : undefined,
      };
      return upsertHealthProfile(data);
    }),
  generateAiProfile: protectedProcedure
    .input(z.object({
      age: z.number().optional(),
      gender: z.enum(["male", "female", "other"]).optional(),
      weight: z.number().optional(),
      height: z.number().optional(),
      bloodSugar: z.enum(["normal", "prediabetes", "diabetes"]).optional(),
      bloodPressure: z.enum(["normal", "high", "low"]).optional(),
      dietGoal: z.enum(["lose_weight", "gain_muscle", "maintain", "health"]).optional(),
      allergies: z.array(z.string()).optional(),
      healthConditions: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const genderMap = { male: "男性", female: "女性", other: "其他" };
      const bloodSugarMap = { normal: "正常", prediabetes: "糖尿病前期", diabetes: "糖尿病" };
      const bloodPressureMap = { normal: "正常", high: "高血压", low: "低血压" };
      const dietGoalMap = { lose_weight: "减脂", gain_muscle: "增肌", maintain: "维持健康", health: "改善健康" };
      const prompt = `你是一位专业的营养师，请根据以下用户健康信息，生成一份个性化的健康档案分析和大米搭配推荐。\n\n用户信息：\n- 年龄：${input.age ?? "未填写"}岁\n- 性别：${input.gender ? genderMap[input.gender] : "未填写"}\n- 体重：${input.weight ?? "未填写"}kg\n- 身高：${input.height ?? "未填写"}cm\n- 血糖状况：${input.bloodSugar ? bloodSugarMap[input.bloodSugar] : "未填写"}\n- 血压状况：${input.bloodPressure ? bloodPressureMap[input.bloodPressure] : "未填写"}\n- 饮食目标：${input.dietGoal ? dietGoalMap[input.dietGoal] : "未填写"}\n- 过敏情况：${input.allergies?.join("、") ?? "无"}\n- 健康状况：${input.healthConditions?.join("、") ?? "无特殊"}\n\n请按以下格式输出（使用Markdown）：\n\n## 您的健康画像\n（2-3句话概括用户的健康状况和主要关注点）\n\n## 饮食建议\n（针对用户情况的具体饮食建议，3-4条）\n\n## 专属米种推荐\n（推荐3-5种最适合的米种，每种说明推荐理由和建议占比）\n\n| 米种 | 建议占比 | 推荐理由 |\n|------|---------|----------|\n| ... | ...% | ... |\n\n## 配方小贴士\n（1-2条使用建议）\n\n请用温暖、专业的语气，避免过于医疗化的表述。`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const rawContent = result.choices?.[0]?.message?.content ?? "";
      const fullText = typeof rawContent === "string" ? rawContent : (rawContent as any)?.[0]?.text ?? "";
      await upsertHealthProfile({
        userId: ctx.user!.id,
        ...input,
        weight: input.weight?.toString() as any,
        height: input.height?.toString() as any,
        allergies: input.allergies ? JSON.stringify(input.allergies) as any : undefined,
        healthConditions: input.healthConditions ? JSON.stringify(input.healthConditions) as any : undefined,
        aiProfile: fullText,
      });
      return { aiProfile: fullText };
    }),
});

export const mibanDiyRouter = router({
  aiRecommend: publicProcedure
    .input(z.object({ need: z.string().min(1).max(100) }))
    .mutation(async ({ input }) => {
      const riceList = [
        { id: "white", name: "白米", desc: "软糯香甜，日常主食，GI值高" },
        { id: "black", name: "黑米", desc: "花青素丰富，补肾益气，GI值低" },
        { id: "red", name: "红米", desc: "铁元素高，补血养颜，GI值中" },
        { id: "brown", name: "糙米", desc: "膳食纤维高，控糖减脂，GI值低" },
        { id: "purple", name: "紫米", desc: "花青素+铁，美容养颜，GI值低" },
        { id: "millet", name: "小米", desc: "健脾养胃，易消化，GI值中" },
        { id: "mung", name: "绿豆", desc: "清热解毒，消暑降火" },
        { id: "coix", name: "薏米", desc: "祛湿消肿，美白润肤" },
      ];
      const prompt = `你是一位专业的营养师和大米搭配专家。用户的需求是：「${input.need}」。\n\n可选的米种有：\n${riceList.map(r => `- ${r.id}（${r.name}）：${r.desc}`).join("\n")}\n\n请根据用户需求，从以上米种中选出2-4种最合适的组合，并给出简短的推荐理由（不超过50字）。\n\n请严格按照以下JSON格式输出，不要输出任何其他内容：\n{\n  "recommended": ["id1", "id2", "id3"],\n  "reason": "推荐理由，简短说明为什么这个组合适合用户需求"\n}`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } as any });
      const rawContent = result.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent));
      return { recommended: (parsed.recommended ?? []) as string[], reason: (parsed.reason ?? "") as string };
    }),
  aiRatio: publicProcedure
    .input(z.object({
      selectedIds: z.array(z.string()).min(1).max(8),
      purpose: z.enum(["rice", "porridge"]).default("rice"),
      preferences: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const riceMap: Record<string, { name: string; desc: string }> = {
        white: { name: "白米", desc: "软糯香甜，GI值高，口感好" },
        black: { name: "黑米", desc: "花青素丰富，补肾益气，GI值低" },
        red: { name: "红米", desc: "铁元素高，补血养颜，GI值中" },
        brown: { name: "糙米", desc: "膳食纤维高，控糖减脂，GI值低" },
        purple: { name: "紫米", desc: "花青素+铁，美容养颜，GI值低" },
        millet: { name: "小米", desc: "健脾养胃，易消化，GI值中" },
        mung: { name: "绿豆", desc: "清热解毒，消暑降火" },
        coix: { name: "薏米", desc: "祛湿消肿，美白润肤" },
      };
      const selected = input.selectedIds.map(id => ({ id, name: riceMap[id]?.name ?? id, desc: riceMap[id]?.desc ?? "" }));
      const purposeText = input.purpose === "porridge" ? "煮粥" : "蒸饭";
      const prefText = (input.preferences && input.preferences.length > 0) ? `用户的口感偏好是：${input.preferences.join("、")}。请在配比中充分体现这些偏好。` : "用户没有特定口感偏好，请根据营养均衡原则推荐。";
      const riceLines = selected.map(r => `- ${r.id}（${r.name}）：${r.desc}`).join("\n");
      const prompt = `你是一位专业的营养师和大米搭配专家。用户已选择以下 ${selected.length} 种米种，用途是「${purposeText}」。\n\n${prefText}\n\n可用米种：\n${riceLines}\n\n请根据营养均衡、口感搭配、用途和用户偏好，为这 ${selected.length} 种米种推荐最佳配比（各种米的百分比，总和必须等于100）。\n\n要求：\n1. 比例必须是整数，总和严格等于100\n2. 给出简短的推荐理由（不超过60字），重点说明如何满足用户的口感偏好\n3. 每种米的比例都要大于0\n\n请严格按照以下JSON格式输出，不要输出任何其他内容：\n{\n  "ratios": {"id1": 比例数字, "id2": 比例数字},\n  "reason": "推荐理由"\n}`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } as any });
      const rawContent = result.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent));
      const ratios = parsed.ratios ?? {};
      const total = Object.values(ratios).reduce((s: number, v) => s + Number(v), 0);
      if (total !== 100 && total > 0) {
        const factor = 100 / (total as number);
        const adjusted: Record<string, number> = {};
        let sum = 0;
        const keys = Object.keys(ratios);
        keys.forEach((k, i) => {
          if (i === keys.length - 1) { adjusted[k] = 100 - sum; }
          else { const v = Math.round(Number(ratios[k]) * factor); adjusted[k] = v; sum += v; }
        });
        return { ratios: adjusted, reason: (parsed.reason ?? "") as string };
      }
      return { ratios: ratios as Record<string, number>, reason: (parsed.reason ?? "") as string };
    }),
});

export const mibanRecipeRouter = router({
  list: protectedProcedure.query(({ ctx }) => getUserRecipes(ctx.user!.id)),
  save: protectedProcedure
    .input(z.object({
      name: z.string().min(1, "配方名称不能为空"),
      ingredients: z.array(z.object({ riceId: z.number(), name: z.string(), percentage: z.number(), colorHex: z.string() })),
      totalPricePerJin: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ input, ctx }) =>
      saveUserRecipe({ userId: ctx.user!.id, name: input.name, ingredients: JSON.stringify(input.ingredients) as any, totalPricePerJin: input.totalPricePerJin?.toString() as any, notes: input.notes })
    ),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input, ctx }) => deleteUserRecipe(input.id, ctx.user!.id)),
});

export const mibanOrderRouter = router({
  create: protectedProcedure
    .input(z.object({
      recipeName: z.string().optional(),
      ingredients: z.array(z.object({ riceId: z.number(), name: z.string(), percentage: z.number(), colorHex: z.string(), weightJin: z.number() })),
      totalWeightJin: z.number().min(10, "最低起订10斤"),
      totalPrice: z.number(),
      receiverName: z.string().min(1),
      receiverPhone: z.string().min(11),
      receiverAddress: z.string().min(5),
      userNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user!.id;
      const totalCny = input.totalPrice; // 订单金额（人民币）

      // 1. 查询用户钱包余额
      const cnyBalance = await getUserCnyBalance(userId);
      const usdtBalance = await getUserBalance(userId);
      const usdtRate = await getUsdtCnyRate(); // 1 USDT = ? CNY

      // 2. 计算可用总额（折合成 CNY）
      const totalAvailableCny = cnyBalance + usdtBalance * usdtRate;
      if (totalAvailableCny < totalCny - 0.001) {
        throw new TRPCError({
          code: "PAYMENT_REQUIRED",
          message: `余额不足，需要 ¥${totalCny.toFixed(2)}，当前可用 ¥${totalAvailableCny.toFixed(2)}（CNY ¥${cnyBalance.toFixed(2)} + USDT ${usdtBalance.toFixed(4)} ≈ ¥${(usdtBalance * usdtRate).toFixed(2)}），请先充値`,
        });
      }

      // 3. 确定扣款方案：优先扣 CNY
      let deductCny = 0;
      let deductUsdt = 0;
      if (cnyBalance >= totalCny) {
        // CNY 足够，全部扣 CNY
        deductCny = totalCny;
        deductUsdt = 0;
      } else {
        // CNY 不够，先扣完 CNY，剩余按汇率扣 USDT
        deductCny = cnyBalance;
        const remainCny = totalCny - cnyBalance;
        deductUsdt = remainCny / usdtRate;
      }

      // 4. 创建订单
      const orderNo = `MB${Date.now()}${nanoid(4).toUpperCase()}`;
      const orderId = await createOrder({
        orderNo,
        userId,
        recipeName: input.recipeName,
        ingredients: JSON.stringify(input.ingredients) as any,
        totalWeightJin: input.totalWeightJin.toString() as any,
        totalPrice: totalCny.toString() as any,
        receiverName: input.receiverName,
        receiverPhone: input.receiverPhone,
        receiverAddress: input.receiverAddress,
        userNote: input.userNote,
        walletDeductCny: deductCny.toString() as any,
        walletDeductUsdt: deductUsdt.toString() as any,
        usdtCnyRateAtOrder: usdtRate.toString() as any,
      });

      // 5. 扣款（订单已入库后才扣，避免扣款成功但订单失败）
      if (deductCny > 0.001) {
        await adminAdjustCnyBalance({
          userId,
          amount: -deductCny,
          note: `米伴订单扣款 #${orderNo}`,
          operatorId: userId,
        });
      }
      if (deductUsdt > 0.000001) {
        await addUserBalance(
          userId,
          -deductUsdt,
          'reward',
          orderId,
          `米伴订单扣款 #${orderNo} (-${deductUsdt.toFixed(6)} USDT ≈ ¥${(deductUsdt * usdtRate).toFixed(2)})`,
        );
      }

      console.log(`[Miban] 订单创建并扣款成功: orderId=${orderId}, orderNo=${orderNo}, deductCny=${deductCny}, deductUsdt=${deductUsdt}, rate=${usdtRate}`);
      return orderId;
    }),
  myOrders: protectedProcedure.query(({ ctx }) => getUserOrders(ctx.user!.id)),
  allOrders: mibanAdminProcedure.query(() => getAllOrders()),
  updateStatus: mibanAdminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "confirmed", "packing", "shipped", "delivered", "cancelled"]),
      trackingNo: z.string().optional(),
      trackingCompany: z.string().optional(),
      adminNote: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      // 如果是取消订单，查询原订单扣款金额并退款
      if (input.status === "cancelled") {
        const [order] = await db.select().from(mibanOrders).where(eq(mibanOrders.id, input.id)).limit(1);
        if (order && order.status !== "cancelled") {
          const deductCny = parseFloat(String(order.walletDeductCny ?? 0));
          const deductUsdt = parseFloat(String(order.walletDeductUsdt ?? 0));
          const usdtRate = parseFloat(String(order.usdtCnyRateAtOrder ?? 0)) || 7.0;
          const orderNo = order.orderNo;
          const userId = order.userId;

          // 退回 CNY
          if (deductCny > 0.001) {
            await adminAdjustCnyBalance({
              userId,
              amount: deductCny,
              note: `米伴订单退款 #${orderNo}`,
              operatorId: userId,
            });
          }
          // 退回 USDT
          if (deductUsdt > 0.000001) {
            await addUserBalance(
              userId,
              deductUsdt,
              'reward',
              order.id,
              `米伴订单退款 #${orderNo} (+${deductUsdt.toFixed(6)} USDT ≈ ¥${(deductUsdt * usdtRate).toFixed(2)})`,
            );
          }
          console.log(`[Miban] 订单取消并退款: orderId=${order.id}, orderNo=${orderNo}, refundCny=${deductCny}, refundUsdt=${deductUsdt}`);
        }
      }

      await updateOrderStatus(input.id, input.status, input.trackingNo, input.trackingCompany, input.adminNote);
    }),
});

export const mibanInviteRouter = router({
  myInfo: protectedProcedure.query(({ ctx }) => getOrCreateInviteInfo(ctx.user!.id)),
  validate: publicProcedure
    .input(z.object({ code: z.string().length(6) }))
    .query(async ({ input }) => {
      const inviter = await findUserByInviteCode(input.code);
      if (!inviter) return { valid: false, inviter: null };
      return { valid: true, inviter: { id: inviter.id, name: inviter.name } };
    }),
  bind: protectedProcedure
    .input(z.object({ inviteCode: z.string().length(6) }))
    .mutation(async ({ input, ctx }) => {
      const inviter = await findUserByInviteCode(input.inviteCode);
      if (!inviter) throw new TRPCError({ code: "NOT_FOUND", message: "邀请码无效" });
      if (inviter.id === ctx.user!.id) throw new TRPCError({ code: "BAD_REQUEST", message: "不能邀请自己" });
      return bindInviter(ctx.user!.id, inviter.id);
    }),
  myInvitedUsers: protectedProcedure.query(({ ctx }) => getMyInvitedUsers(ctx.user!.id)),
});

export const mibanAgentRouter = router({
  myCommissions: protectedProcedure.query(({ ctx }) => getAgentCommissions(ctx.user!.id)),
  myMonthlyStats: protectedProcedure.query(({ ctx }) => getAgentMonthlyStats(ctx.user!.id)),
  myReferrals: protectedProcedure.query(({ ctx }) => getMyInvitedUsers(ctx.user!.id)),
  myInviteInfo: protectedProcedure.query(({ ctx }) => getOrCreateInviteInfo(ctx.user!.id)),
});

export const mibanAdminUserRouter = router({
  list: mibanAdminProcedure.query(() => getAllUsers()),
  setRole: mibanAdminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["parent", "baby"]) }))
    .mutation(({ input }) => updateUserMibanRole(input.userId, input.role)),
});

export const mibanAdminCommissionRouter = router({
  configs: mibanAdminProcedure.query(() => getAllCommissionConfigs()),
  setConfig: mibanAdminProcedure
    .input(z.object({ agentId: z.number().nullable(), rate: z.number().min(0).max(1), note: z.string().optional() }))
    .mutation(({ input, ctx }) => setCommissionConfig(input.agentId, input.rate, input.note, ctx.user!.id)),
  deleteConfig: mibanAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteCommissionConfig(input.id)),
  agentStats: mibanAdminProcedure.query(() => getAllAgentStats()),
});

export const mibanCartRouter = router({
  list: publicProcedure
    .input(z.object({ sessionId: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = ctx.user?.id ?? null;
      const sessionId = input.sessionId ?? null;
      if (!userId && !sessionId) return [];
      const cond = userId ? eq(mibanCartItems.userId, userId) : eq(mibanCartItems.sessionId, sessionId!);
      return db!.select().from(mibanCartItems).where(cond).orderBy(mibanCartItems.createdAt);
    }),
  addBatch: publicProcedure
    .input(z.object({
      sessionId: z.string().optional(),
      recipeName: z.string().optional(),
      recipeId: z.string().optional(),
      items: z.array(z.object({ riceId: z.string(), riceName: z.string(), weightJin: z.number().positive(), pricePerJin: z.number().positive(), ratio: z.number().int().min(0).max(100) })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = ctx.user?.id ?? null;
      const sessionId = input.sessionId ?? null;
      const rows = input.items.map((item) => ({ userId, sessionId, riceId: item.riceId, riceName: item.riceName, weightJin: String(item.weightJin), pricePerJin: String(item.pricePerJin), ratio: item.ratio, recipeId: input.recipeId ?? null, recipeName: input.recipeName ?? null }));
      await db!.insert(mibanCartItems).values(rows);
      return { success: true, count: rows.length };
    }),
  remove: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.delete(mibanCartItems).where(eq(mibanCartItems.id, input.id));
      return { success: true };
    }),
  clear: publicProcedure
    .input(z.object({ sessionId: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = ctx.user?.id ?? null;
      const sessionId = input.sessionId ?? null;
      if (!userId && !sessionId) return { success: false };
      const cond = userId ? eq(mibanCartItems.userId, userId) : eq(mibanCartItems.sessionId, sessionId!);
      await db!.delete(mibanCartItems).where(cond);
      return { success: true };
    }),
});

// ─── 管理员身份切换路由（仅 super_admin 可用）────────────────────────────────
// 固定的三个账号（方便在不同身份视角间切换）
const MIBAN_SWITCH_ACCOUNTS = [
  { username: "jiang",   label: "管理员", role: "admin"  },
  { username: "hyy329",  label: "米商",   role: "parent" },
  { username: "yunting", label: "顾客",   role: "baby"   },
];
// 所有可互切账号（包括管理员）
const ALL_SWITCH_USERNAMES = ["jiang", "hyy329", "yunting"];

export const mibanImpersonateRouter = router({
  // 获取可切换的账号列表（含当前登录账号信息）
  switchList: mibanAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const result = [];
    for (const acct of MIBAN_SWITCH_ACCOUNTS) {
      const [u] = await db.select({ id: users.id, name: users.name, username: users.username, avatar: users.avatar, role: users.role })
        .from(users).where(eq(users.username, acct.username)).limit(1);
      if (u) result.push({ ...u, label: acct.label });
    }
    return result;
  }),

  // 切换到指定用户（返回该用户的 session token，前端用 saveToken 写入存储后刷新页面）
  switchTo: mibanAdminProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ input }) => {
      const allowed = MIBAN_SWITCH_ACCOUNTS.map(a => a.username);
      if (!allowed.includes(input.username)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "该账号不在切换列表中" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [u] = await db.select({ id: users.id, name: users.name, username: users.username })
        .from(users).where(eq(users.username, input.username)).limit(1);
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      const token = await sdk.createSessionToken(u.id.toString(), {
        expiresInMs: ONE_YEAR_MS,
        name: u.name || u.username || "",
      });
      return { token, userId: u.id, name: u.name, username: u.username };
    }),

  // 获取完整切换列表（hyy329/yunting 登录时可用，包括管理员入口）
  fullSwitchList: protectedProcedure.query(async ({ ctx }) => {
    const currentUsername = (ctx.user as any)?.username;
    if (!ALL_SWITCH_USERNAMES.includes(currentUsername)) return null;
    const db = await getDb();
    if (!db) return null;
    const result = [];
    for (const acct of MIBAN_SWITCH_ACCOUNTS) {
      const [u] = await db.select({ id: users.id, name: users.name, username: users.username, role: users.role })
        .from(users).where(eq(users.username, acct.username)).limit(1);
      const label = acct.role === "admin" ? "管理员" : acct.role === "parent" ? "米商" : "顾客";
      if (u) result.push({ ...u, label });
    }
    return result;
  }),

  // 切换到任意账号（hyy329/yunting 互切）
  switchToAny: protectedProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUsername = (ctx.user as any)?.username;
      if (!ALL_SWITCH_USERNAMES.includes(currentUsername)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无切换权限" });
      }
      if (!ALL_SWITCH_USERNAMES.includes(input.username)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "目标账号不在切换列表中" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [u] = await db.select({ id: users.id, name: users.name, username: users.username })
        .from(users).where(eq(users.username, input.username)).limit(1);
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      const token = await sdk.createSessionToken(u.id.toString(), {
        expiresInMs: ONE_YEAR_MS,
        name: u.name || u.username || "",
      });
      return { token, userId: u.id, name: u.name, username: u.username };
    }),
});
