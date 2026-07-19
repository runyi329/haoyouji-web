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
  mibanReviews,
  mibanFavorites,
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
// 管理员页面入口已在前端控制，后端只需要登录即可
const mibanAdminProcedure = protectedProcedure;

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
  try {
    console.log('[Miban] createOrder data:', JSON.stringify(data));
    const result = await db.insert(mibanOrders).values(data);
    return (result[0] as any).insertId as number;
  } catch (e: any) {
    console.error('[Miban] createOrder ERROR:', e?.message);
    throw e;
  }
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
  const now = new Date();
  const extra: Record<string, any> = {};
  // 发货时自动记录shippedAt和autoConfirmAt（30天后）
  if (status === "shipped") {
    const autoConfirm = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    extra.shippedAt = now;
    extra.autoConfirmAt = autoConfirm;
  }
  await db.update(mibanOrders).set({ status, trackingNo, trackingCompany, adminNote, ...extra }).where(eq(mibanOrders.id, id));
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
  const conn = await getDbConnection();
  if (!conn) return { totalCommission: 0, pendingCommission: 0, settledCommission: 0, orderCount: 0 };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 19).replace('T', ' ');
  try {
    const [rows] = await (conn as any).execute(
      `SELECT
        COALESCE(SUM(commission_amount), 0) AS total,
        COALESCE(SUM(CASE WHEN status='pending' THEN commission_amount ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status='settled' THEN commission_amount ELSE 0 END), 0) AS settled,
        COUNT(*) AS orderCount
       FROM miban_commissions
       WHERE agent_id = ? AND created_at >= ?`,
      [agentUserId, monthStart]
    ) as any[];
    const r = Array.isArray(rows) ? rows[0] : rows;
    return {
      totalCommission: parseFloat(r?.total ?? '0'),
      pendingCommission: parseFloat(r?.pending ?? '0'),
      settledCommission: parseFloat(r?.settled ?? '0'),
      orderCount: Number(r?.orderCount ?? 0),
    };
  } catch (e) {
    console.warn('[miban] getAgentMonthlyStats failed:', (e as any)?.message);
    return { totalCommission: 0, pendingCommission: 0, settledCommission: 0, orderCount: 0 };
  }
}

// ─── 无限级分佣引擎（含直级奖压缩制） ────────────────────────────────────────────
async function triggerMultiLevelCommission(params: {
  orderId: number;
  orderNo: string;
  buyerUserId: number;
  orderAmount: number;
}) {
  const { orderId, orderNo, buyerUserId, orderAmount } = params;
  const dbConn = await getDbConnection();
  if (!dbConn) return;

  // 1. 检查是否已经发过佣金（幂等保护）
  const [existRows] = await (dbConn as any).execute(
    `SELECT id FROM miban_commissions WHERE order_id = ? LIMIT 1`,
    [orderId]
  );
  if ((existRows as any[]).length > 0) {
    console.log(`[Commission] 订单 ${orderNo} 已发过佣金，跳过`);
    return;
  }

  // 2. 查找买家所属团队（通过推荐链往上找，看哪个祖先节点是某个团队的根节点）
  let teamPlanId: number | null = null;
  let teamMultiplier = 1.0;
  let teamId: number | null = null;
  let chainIds: number[] = [];
  try {
    // 获取买家的完整推荐链（最多20层）
    const [chainRows] = await (dbConn as any).execute(`
      WITH RECURSIVE chain AS (
        SELECT id, invited_by_user_id, 0 AS depth FROM users WHERE id = ?
        UNION ALL
        SELECT u.id, u.invited_by_user_id, c.depth + 1
        FROM users u INNER JOIN chain c ON u.id = c.invited_by_user_id
        WHERE c.depth < 20
      )
      SELECT id FROM chain ORDER BY depth ASC
    `, [buyerUserId]);
    chainIds = (chainRows as any[]).map((r: any) => r.id);

    if (chainIds.length > 0) {
      const ph = chainIds.map(() => '?').join(',');
      const [teamRows] = await (dbConn as any).execute(
        `SELECT id, commission_plan_id, COALESCE(payout_rate_multiplier, 1.0) AS multiplier
         FROM miban_teams WHERE root_user_id IN (${ph}) LIMIT 1`,
        chainIds
      );
      if ((teamRows as any[]).length > 0) {
        const team = (teamRows as any[])[0];
        teamId = team.id;
        teamPlanId = team.commission_plan_id;
        teamMultiplier = parseFloat(team.multiplier ?? '1');
      }
    }
  } catch (e: any) {
    console.warn('[Commission] 查找团队失败:', e?.message);
  }

  // 3. 获取制度层级配置（代数佣金）
  let planLevels: { levelIndex: number; rate: number }[] = [];
  // 3b. 获取直级奖配置（按职级天花板，压缩制）
  let rankBonusConfig: { rankIndex: number; rankName: string; bonusRate: number }[] = [];
  // 3c. 获取分红配置
  let dividendRate = 0;
  let salesRate = 0;

  if (teamPlanId) {
    try {
      const [lvRows] = await (dbConn as any).execute(
        `SELECT level_index, rate FROM miban_commission_plan_levels WHERE plan_id = ? ORDER BY level_index ASC`,
        [teamPlanId]
      );
      planLevels = (lvRows as any[]).map((r: any) => ({
        levelIndex: Number(r.level_index),
        rate: parseFloat(r.rate),
      }));
    } catch (e: any) {
      console.warn('[Commission] 获取层级配置失败:', e?.message);
    }

    // 获取直级奖配置（按 rank_index 升序）
    try {
      const [rankRows] = await (dbConn as any).execute(
        `SELECT rank_index, name, bonus_rate FROM miban_plan_ranks WHERE plan_id = ? ORDER BY rank_index ASC`,
        [teamPlanId]
      );
      rankBonusConfig = (rankRows as any[]).map((r: any) => ({
        rankIndex: Number(r.rank_index),
        rankName: String(r.name),
        bonusRate: parseFloat(r.bonus_rate ?? '0'),
      }));
    } catch (e: any) {
      console.warn('[Commission] 获取直级奖配置失败:', e?.message);
    }

    // 获取销售提成率和分红率
    try {
      const [planRows] = await (dbConn as any).execute(
        `SELECT sales_rate, dividend_rate FROM miban_commission_plans WHERE id = ? LIMIT 1`,
        [teamPlanId]
      );
      if ((planRows as any[]).length > 0) {
        salesRate = parseFloat((planRows as any[])[0]?.sales_rate ?? '0') || 0;
        dividendRate = parseFloat((planRows as any[])[0]?.dividend_rate ?? '0') || 0;
      }
    } catch (e: any) {
      console.warn('[Commission] 获取制度基本配置失败:', e?.message);
    }
  }

  // 如果没有制度层级，尝试用旧的全局佣金配置（兼容旧逻辑）
  if (planLevels.length === 0) {
    try {
      const [cfgRows] = await (dbConn as any).execute(
        `SELECT commission_rate FROM miban_commission_config WHERE agent_id IS NULL LIMIT 1`
      );
      if ((cfgRows as any[]).length > 0) {
        const globalRate = parseFloat((cfgRows as any[])[0].commission_rate ?? '0');
        if (globalRate > 0) planLevels = [{ levelIndex: 1, rate: globalRate }];
      }
    } catch { /* 无全局配置，跳过 */ }
  }

  if (planLevels.length === 0 && rankBonusConfig.length === 0) {
    console.log(`[Commission] 订单 ${orderNo} 无制度层级配置，跳过分佣`);
    return;
  }

  // 查询下单时锁定的 CNY/USDT 汇率（兜底用 7.2）
  let cnyRate = 7.2;
  try {
    const [rateRows] = await (dbConn as any).execute(
      `SELECT usdtCnyRateAtOrder FROM miban_orders WHERE id = ? LIMIT 1`,
      [orderId]
    ) as any[];
    cnyRate = parseFloat((rateRows as any[])[0]?.usdtCnyRateAtOrder ?? '7.2') || 7.2;
  } catch { /* 用默认值 */ }

  // ── 辅助函数：写入佣金并打入钱包 ──────────────────────────────────────────────
  async function settleCommission(agentId: number, commCny: number, levelIdx: number, note: string) {
    if (commCny <= 0) return;
    const commUsdt = parseFloat((commCny / cnyRate).toFixed(6));
    await (dbConn as any).execute(
      `INSERT INTO miban_commissions (agent_id, order_id, order_no, buyer_id, buyer_user_id, order_amount, commission_rate, commission_amount, status, team_id, level_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'settled', ?, ?)`,
      [agentId, orderId, orderNo, buyerUserId, buyerUserId, orderAmount.toFixed(2), (commCny / orderAmount).toFixed(4), commCny.toFixed(2), teamId, levelIdx]
    );
    await addUserBalance(
      agentId, commUsdt, 'commission', orderId,
      `${note} +${commUsdt.toFixed(4)} USDT (¥${commCny.toFixed(2)})`
    );
    console.log(`[Commission] ${note} agentId=${agentId} +${commUsdt.toFixed(4)} USDT (¥${commCny.toFixed(2)})`);
  }

  // 4. 代数佣金：沿推荐链逐层发放
  let currentUserId: number | null = buyerUserId;
  let totalGenCny = 0;

  for (const level of planLevels) {
    const [parentRows] = await (dbConn as any).execute(
      `SELECT invited_by_user_id FROM users WHERE id = ? LIMIT 1`,
      [currentUserId]
    ) as [any[], any];
    const parentId: number | null = (parentRows as any[])[0]?.invited_by_user_id ?? null;
    if (!parentId) break;

    const commCny = parseFloat((orderAmount * level.rate * teamMultiplier).toFixed(2));
    if (commCny > 0) {
      try {
        await settleCommission(parentId, commCny, level.levelIndex, `米伴代数佣金 第${level.levelIndex}层 订单#${orderNo}`);
        totalGenCny += commCny;
      } catch (e: any) {
        console.error(`[Commission] 代数佣金第${level.levelIndex}层失败:`, e?.message);
      }
    }
    currentUserId = parentId;
  }

  // 5. 直级奖（压缩制）：按职级天花板差额计算
  // 规则：每个上级拿「自己职级天花板 - 下方最近有资格人的职级天花板」的差额
  // 遇同级截断（同级不再往上传递）
  if (rankBonusConfig.length > 0) {
    try {
      // 构建推荐链（买家→上级1→上级2→...），每人带职级
      const upChain: { userId: number; rankIndex: number; bonusRate: number }[] = [];
      let cur: number | null = buyerUserId;
      while (cur) {
        const [uRows] = await (dbConn as any).execute(
          `SELECT invited_by_user_id, COALESCE(miban_rank_index, 1) AS rank_idx FROM users WHERE id = ? LIMIT 1`,
          [cur]
        ) as [any[], any];
        const uRow = (uRows as any[])[0] as any;
        if (!uRow) break;
        const parentId2: number | null = uRow.invited_by_user_id ?? null;
        if (!parentId2) break;
        const rankIdx = Number(uRow.rank_idx ?? 1);
        const rankCfg = rankBonusConfig.find(r => r.rankIndex === rankIdx);
        const bonusRate = rankCfg?.bonusRate ?? 0;
        upChain.push({ userId: parentId2, rankIndex: rankIdx, bonusRate });
        cur = parentId2;
        if (upChain.length >= 20) break; // 安全截断
      }

      // 压缩制计算：从买家往上遍历，记录「已分配天花板」
      // 买家自己的天花板（通常是0，因为买家不参与直级奖）
      let allocatedRate = 0; // 已分配出去的天花板比例
      let prevRankIdx = 0;   // 上一个有资格人的职级

      for (let i = 0; i < upChain.length; i++) {
        const person = upChain[i];
        const myRate = person.bonusRate;
        if (myRate <= allocatedRate) continue; // 天花板不超过已分配，跳过（被压缩）

        const diff = parseFloat((myRate - allocatedRate).toFixed(4));
        const commCny = parseFloat((orderAmount * diff * teamMultiplier).toFixed(2));

        if (commCny > 0) {
          try {
            await settleCommission(
              person.userId, commCny, 100 + i, // level_index 100+ 表示直级奖
              `米伴直级奖 ${person.bonusRate * 100}%档(差额${(diff * 100).toFixed(1)}%) 订单#${orderNo}`
            );
          } catch (e: any) {
            console.error(`[Commission] 直级奖失败 userId=${person.userId}:`, e?.message);
          }
        }

        allocatedRate = myRate;
        // 遇同级截断：如果下一个人职级 >= 当前人职级，停止
        if (i + 1 < upChain.length && upChain[i + 1].rankIndex >= person.rankIndex) {
          console.log(`[Commission] 直级奖：遇同级(${person.rankIndex})截断`);
          break;
        }
      }
    } catch (e: any) {
      console.error('[Commission] 直级奖计算失败:', e?.message);
    }
  }

  // 6. 分红：米庄(rank_index=4)及以上解锁，固定比例
  if (dividendRate > 0) {
    try {
      // 查找推荐链中所有米庄及以上用户
      if (chainIds.length > 0) {
        const ph2 = chainIds.map(() => '?').join(',');
        const [divUsers] = await (dbConn as any).execute(
          `SELECT id FROM users WHERE id IN (${ph2}) AND COALESCE(miban_rank_index, 1) >= 4`,
          chainIds
        );
        for (const divUser of (divUsers as any[])) {
          const divCny = parseFloat((orderAmount * dividendRate * teamMultiplier).toFixed(2));
          if (divCny > 0) {
            try {
              await settleCommission(
                divUser.id, divCny, 200, // level_index 200 表示分红
                `米伴分红 ${dividendRate * 100}% 订单#${orderNo}`
              );
            } catch (e: any) {
              console.error(`[Commission] 分红失败 userId=${divUser.id}:`, e?.message);
            }
          }
        }
      }
    } catch (e: any) {
      console.error('[Commission] 分红计算失败:', e?.message);
    }
  }

  console.log(`[Commission] 订单 ${orderNo} 全部分佣完成`);
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
  // 使用原生 SQL，避免 Drizzle ORM 列名映射问题（生产库用 snake_case，schema 用 camelCase）
  const conn = await getDbConnection();
  if (!conn) return [];
  try {
    // 步骤1: 查询用户基本信息（使用生产库实际列名）
    const [userRows] = await (conn as any).execute(
      `SELECT
        u.id, u.name, u.username, u.openId, u.role,
        u.miban_role AS mibanRole,
        COALESCE(u.miban_rank_index, 1) AS mibanRankIndex,
        u.invite_code AS inviteCode,
        u.invite_count AS inviteCount,
        u.invited_by_user_id AS invitedByUserId,
        u.createdAt, u.lastSignedIn,
        u.balance, u.points
       FROM users u
       ORDER BY u.createdAt DESC`
    ) as any[];
    const userList: any[] = Array.isArray(userRows) ? userRows : [];
    if (userList.length === 0) return [];
    const ids = userList.map((u: any) => u.id);
    const placeholders = ids.map(() => '?').join(',');

    // 步骤2: 订单数量
    let orderCountMap = new Map<number, number>();
    try {
      const [orderRows] = await (conn as any).execute(
        `SELECT userId, COUNT(*) AS orderCount FROM miban_orders WHERE userId IN (${placeholders}) GROUP BY userId`,
        ids
      ) as any[];
      for (const r of (Array.isArray(orderRows) ? orderRows : [])) {
        orderCountMap.set(Number(r.userId), Number(r.orderCount));
      }
    } catch (e) {
      console.warn('[miban] getAllUsers: miban_orders query failed:', (e as any)?.message);
    }

    // 步骤3: USDT 余额
    let usdtMap = new Map<number, number>();
    try {
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
    } catch (e) {
      console.warn('[miban] getAllUsers: USDT balance query failed:', (e as any)?.message);
    }

    // 步骤4: CNY 余额（balance_cny 字段可能不存在，用 IFNULL 兼容）
    let cnyMap = new Map<number, number>();
    try {
      const [cnyRows] = await (conn as any).execute(
        `SELECT u.id AS userId,
          COALESCE(IFNULL(u.balance_cny, 0), 0) + COALESCE(c.cnySum, 0) AS cnyBalance
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
    } catch (e) {
      console.warn('[miban] getAllUsers: CNY balance query failed:', (e as any)?.message);
    }

    return userList.map((u: any) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      openId: u.openId,
      role: u.role,
      mibanRole: u.mibanRole ?? 'baby',
      mibanRankIndex: Number(u.mibanRankIndex ?? 1),
      inviteCode: u.inviteCode,
      inviteCount: u.inviteCount ?? 0,
      invitedByUserId: u.invitedByUserId,
      createdAt: u.createdAt,
      lastSignedIn: u.lastSignedIn,
      balance: u.balance,
      points: u.points ?? 0,
      orderCount: orderCountMap.get(u.id) ?? 0,
      usdtBalance: usdtMap.get(u.id) ?? parseFloat(String(u.balance ?? '0')),
      cnyBalance: cnyMap.get(u.id) ?? 0,
    }));
  } catch (e) {
    console.error('[miban] getAllUsers failed:', (e as any)?.message);
    return [];
  }
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
      totalPayoutRate: z.number().min(0).max(1).default(0),
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
        totalPayoutRate: input.totalPayoutRate.toString() as any,
      };
      return upsertRiceVariety(data);
    }),
  // 管理员接口：查询所有米种（含未激活）
  adminList: mibanAdminProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const [rows]: any = await (conn as any).execute(
      `SELECT v.id, v.name, v.description, v.price_per_jin AS pricePerJin, COALESCE(v.total_payout_rate, 0) AS totalPayoutRate, v.image_url AS img, v.is_active AS isActive, v.sort_order AS sortOrder, v.catalogId, v.nutritionJson, v.tagsJson, v.created_at AS createdAt, COALESCE(s.stock_jin, 0) AS stockJin FROM \`miban_rice_varieties\` v LEFT JOIN \`miban_inventory_stock\` s ON s.catalog_id = v.catalogId ORDER BY v.sort_order ASC, v.id ASC`
    );
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      ...r,
      pricePerJin: parseFloat(r.pricePerJin ?? '0'),
      totalPayoutRate: parseFloat(r.totalPayoutRate ?? '0'),
      stockJin: parseFloat(r.stockJin ?? '0'),
      isActive: Boolean(r.isActive),
      nutritionJson: r.nutritionJson ? (typeof r.nutritionJson === 'string' ? JSON.parse(r.nutritionJson) : r.nutritionJson) : null,
      tagsJson: r.tagsJson ? (typeof r.tagsJson === 'string' ? JSON.parse(r.tagsJson) : r.tagsJson) : null,
      catalogId: r.catalogId ? Number(r.catalogId) : null,
    }));
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
      const sharp = (await import('sharp')).default;
      // 压缩到 400x400 WebP，节省存储和加载流量
      const rawBuf = Buffer.from(input.base64, 'base64');
      const compressed = await sharp(rawBuf)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const origKB = Math.round(rawBuf.length / 1024);
      const newKB = Math.round(compressed.length / 1024);
      console.log(`[miban] 米种图片压缩: ${origKB}KB → ${newKB}KB`);
      const filename = `rice_db_${input.id}_${Date.now()}.webp`;
      const url = await uploadFileToCOS(compressed, "assets/miban", filename, 'image/webp');
      const db = await getDb();
      if (db) await db.update(mibanRiceVarieties).set({ img: url } as any).where(eq(mibanRiceVarieties.id, input.id));
      return { url };
    }),

  // ─── 标准米种仓库接口 ─────────────────────────────────────────────────────
  // 公开：获取仓库列表（用于 DIY 页面选择米种）
  catalogList: publicProcedure
    .input(z.object({ category: z.string().optional(), onlyActive: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      try {
        let sql2 = 'SELECT c.*, COALESCE(s.stock_jin, 0) AS stockJin FROM `miban_rice_catalog` c LEFT JOIN `miban_inventory_stock` s ON s.catalog_id = c.id';
        const params: any[] = [];
        const conditions: string[] = [];
        if (input?.onlyActive !== false) conditions.push('c.isActive = 1');
        if (input?.category) { conditions.push('c.category = ?'); params.push(input.category); }
        if (conditions.length) sql2 += ' WHERE ' + conditions.join(' AND ');
        sql2 += ' ORDER BY c.sortOrder ASC, c.id ASC';
        const [rows]: any = await (conn as any).execute(sql2, params);
        return (Array.isArray(rows) ? rows : []).map((r: any) => ({
          ...r,
          pricePerJin: parseFloat(r.price_per_jin ?? r.pricePerJin ?? '0'),
          totalPayoutRate: parseFloat(r.total_payout_rate ?? '0'),
          stockJin: parseFloat(r.stockJin ?? '0'),
          nutritionJson: typeof r.nutritionJson === 'string' ? JSON.parse(r.nutritionJson) : (r.nutritionJson ?? null),
          tagsJson: typeof r.tagsJson === 'string' ? JSON.parse(r.tagsJson) : (r.tagsJson ?? []),
          isActive: Boolean(r.isActive),
        }));
      } catch(e) { console.warn('[miban] catalogList error:', (e as any)?.message); return []; }
    }),
  // 管理员：仓库 upsert
  catalogUpsert: mibanAdminProcedure
    .input(z.object({
      id: z.number().optional(),
      stdName: z.string().min(1),
      category: z.string().min(1),
      subCategory: z.string().optional(),
      origin: z.string().optional(),
      gbStandard: z.string().optional(),
      colorHex: z.string().optional(),
      description: z.string().optional(),
      nutritionJson: z.object({
        protein: z.number().optional(),
        carbs: z.number().optional(),
        fat: z.number().optional(),
        fiber: z.number().optional(),
        calories: z.number().optional(),
      }).optional(),
      tagsJson: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      isActive: z.boolean().optional(),
      pricePerJin: z.number().min(0).optional(),
      totalPayoutRate: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { id, nutritionJson, tagsJson, pricePerJin, totalPayoutRate, ...rest } = input;
      const fields: Record<string, any> = { ...rest };
      if (pricePerJin !== undefined) fields.price_per_jin = pricePerJin;
      if (totalPayoutRate !== undefined) fields.total_payout_rate = totalPayoutRate;
      if (nutritionJson !== undefined) fields.nutritionJson = JSON.stringify(nutritionJson);
      if (tagsJson !== undefined) fields.tagsJson = JSON.stringify(tagsJson);
      if (id) {
        fields.updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const setClauses = Object.keys(fields).map(k => `\`${k}\` = ?`).join(', ');
        await (conn as any).execute(`UPDATE \`miban_rice_catalog\` SET ${setClauses} WHERE id = ?`, [...Object.values(fields), id]);
        return { id };
      } else {
        const keys = Object.keys(fields);
        const placeholders = keys.map(() => '?').join(', ');
        const [result]: any = await (conn as any).execute(
          `INSERT INTO \`miban_rice_catalog\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders})`,
          Object.values(fields)
        );
        return { id: result.insertId };
      }
    }),
  // 管理员：批量更新仓库条目单个字段
  catalogBatchUpdate: mibanAdminProcedure
    .input(z.object({
      field: z.enum(['pricePerJin', 'origin', 'category', 'totalPayoutRate', 'stockJin']),
      items: z.array(z.object({ id: z.number(), value: z.string() })),
    }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const colMap: Record<string, string> = {
        pricePerJin: 'price_per_jin',
        origin: 'origin',
        category: 'category',
        totalPayoutRate: 'total_payout_rate',
      };
      let count = 0;
      for (const item of input.items) {
        if (item.value === '' || item.value === undefined) continue;
        if (input.field === 'stockJin') {
          // 库存存在 miban_inventory_stock 表，直接用 catalog_id
          const [catRows]: any = await (conn as any).execute('SELECT id, stdName FROM `miban_rice_catalog` WHERE id = ?', [item.id]);
          const catRow = Array.isArray(catRows) ? catRows[0] : catRows;
          if (!catRow?.id) continue;
          const stockVal = parseFloat(item.value);
          if (isNaN(stockVal)) continue;
          await (conn as any).execute(
            `INSERT INTO \`miban_inventory_stock\` (catalog_id, rice_name, stock_jin) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock_jin = VALUES(stock_jin), rice_name = VALUES(rice_name)`,
            [catRow.id, catRow.stdName, stockVal]
          );
          count++;
        } else {
          const col = colMap[input.field];
          let val: any = item.value;
          if (input.field === 'pricePerJin') val = parseFloat(item.value) || null;
          if (input.field === 'totalPayoutRate') val = item.value ? parseFloat(item.value) / 100 : null;
          if (val === null || val === undefined) continue;
          // 所有字段（pricePerJin、totalPayoutRate、origin、category）都直接更新 miban_rice_catalog 表
          await (conn as any).execute(
            `UPDATE \`miban_rice_catalog\` SET \`${col}\` = ?, updatedAt = NOW() WHERE id = ?`,
            [val, item.id]
          );
          count++;
        }
      }
      return { count };
    }),
  // 管理员：删除仓库条目
  catalogDelete: mibanAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      await (conn as any).execute('DELETE FROM `miban_rice_catalog` WHERE id = ?', [input.id]);
      return { success: true };
    }),
  // 管理员：仓库条目上传图片
  catalogUploadImg: mibanAdminProcedure
    .input(z.object({ id: z.number(), base64: z.string(), mimeType: z.string().default('image/webp') }))
    .mutation(async ({ input }) => {
      const { uploadFileToCOS } = await import('./cos-upload');
      const sharp = (await import('sharp')).default;
      // 压缩到 400x400 WebP，节省存储和加载流量
      const rawBuf = Buffer.from(input.base64, 'base64');
      const compressed = await sharp(rawBuf)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const origKB = Math.round(rawBuf.length / 1024);
      const newKB = Math.round(compressed.length / 1024);
      console.log(`[miban] 仓库米种图片压缩: ${origKB}KB → ${newKB}KB`);
      const filename = `rice_catalog_${input.id}_${Date.now()}.webp`;
      const url = await uploadFileToCOS(compressed, 'assets/miban/catalog', filename, 'image/webp');
      const conn = await getDbConnection();
      if (conn) await (conn as any).execute('UPDATE `miban_rice_catalog` SET img = ? WHERE id = ?', [url, input.id]);
      return { url };
    }),
  // 管理员：从仓库添加到本店米库（创建 miban_rice_varieties 记录）
  catalogAddToStore: mibanAdminProcedure
    .input(z.object({
      catalogId: z.number(),
      pricePerJin: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const [rows]: any = await (conn as any).execute('SELECT * FROM `miban_rice_catalog` WHERE id = ?', [input.catalogId]);
      const catalog = Array.isArray(rows) ? rows[0] : rows;
      if (!catalog) throw new TRPCError({ code: 'NOT_FOUND', message: '仓库中未找到该米种' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      // 改用 catalogId 做重复检测（更准确）
      const [existRows]: any = await (conn as any).execute('SELECT id FROM `miban_rice_varieties` WHERE catalogId = ?', [input.catalogId]);
      const existArr = Array.isArray(existRows) ? existRows : [existRows];
      if (existArr.length > 0 && existArr[0]) throw new TRPCError({ code: 'CONFLICT', message: `「${catalog.stdName}」已在本店米库中` });
      // 同步营养数据、标签、catalogId
      const nutritionStr = catalog.nutritionJson ? (typeof catalog.nutritionJson === 'string' ? catalog.nutritionJson : JSON.stringify(catalog.nutritionJson)) : null;
      const tagsStr = catalog.tagsJson ? (typeof catalog.tagsJson === 'string' ? catalog.tagsJson : JSON.stringify(catalog.tagsJson)) : null;
      const [result]: any = await (conn as any).execute(
        'INSERT INTO `miban_rice_varieties` (name, description, price_per_jin, image_url, is_active, sort_order, catalogId, nutritionJson, tagsJson) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)',
        [catalog.stdName, catalog.description ?? '', input.pricePerJin, catalog.img ?? null, catalog.sortOrder ?? 0, input.catalogId, nutritionStr, tagsStr]
      );
      return { id: result.insertId, name: catalog.stdName };
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
      totalWeightJin: z.number().min(1, "重量不能为0"),
      totalPrice: z.number(),
      receiverName: z.string().min(1),
      receiverPhone: z.string().min(11),
      receiverAddress: z.string().min(5),
      userNote: z.string().optional(),
      productImg: z.string().url().optional(),
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
      // 4a. 查询买家所属团队的制度触发时机，快照到订单中
      let commissionTriggerSnapshot: string = 'order_confirmed'; // 默认确认收货后触发
      try {
        const dbConn = await getDbConnection();
        if (dbConn) {
          const [chainRows] = await (dbConn as any).execute(`
            WITH RECURSIVE chain AS (
              SELECT id, invited_by_user_id, 0 AS depth FROM users WHERE id = ?
              UNION ALL
              SELECT u.id, u.invited_by_user_id, c.depth + 1
              FROM users u INNER JOIN chain c ON u.id = c.invited_by_user_id
              WHERE c.depth < 20
            )
            SELECT id FROM chain ORDER BY depth ASC
          `, [userId]);
          const chainIds = (chainRows as any[]).map((r: any) => r.id);
          if (chainIds.length > 0) {
            const ph = chainIds.map(() => '?').join(',');
            const [teamRows] = await (dbConn as any).execute(
              `SELECT t.id, p.trigger_event FROM miban_teams t
               LEFT JOIN miban_commission_plans p ON t.commission_plan_id = p.id
               WHERE t.root_user_id IN (${ph}) LIMIT 1`,
              chainIds
            );
            if ((teamRows as any[]).length > 0 && (teamRows as any[])[0].trigger_event) {
              commissionTriggerSnapshot = (teamRows as any[])[0].trigger_event;
            }
          }
        }
      } catch (e: any) {
        console.warn('[Miban] 获取制度触发时机失败，使用默认值:', e?.message);
      }

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
        productImg: input.productImg,
        walletDeductCny: deductCny.toString() as any,
        walletDeductUsdt: deductUsdt.toString() as any,
        usdtCnyRateAtOrder: usdtRate.toString() as any,
        commissionTrigger: commissionTriggerSnapshot,
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
          const usdtRate = parseFloat(String(order.usdtCnyRateAtOrder ?? 0)) || 6.75;
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

      // 如果是确认订单（商家确认付款），且订单快照触发时机为 order_placed，则立即触发分佣
      if (input.status === 'confirmed') {
        try {
          const [orderForCommission] = await db.select().from(mibanOrders).where(eq(mibanOrders.id, input.id)).limit(1);
          if (orderForCommission) {
            const triggerMode = (orderForCommission as any).commissionTrigger ?? 'order_confirmed';
            if (triggerMode === 'order_placed') {
              await triggerMultiLevelCommission({
                orderId: orderForCommission.id,
                orderNo: orderForCommission.orderNo,
                buyerUserId: orderForCommission.userId,
                orderAmount: parseFloat(String(orderForCommission.totalPrice ?? 0)),
              });
              console.log(`[Miban] 订单 ${orderForCommission.orderNo} 触发时机为 order_placed，商家确认后已触发分佣`);
            }
          }
        } catch (e: any) {
          console.error('[Miban] order_placed 分佣引擎错误:', e?.message);
        }
      }
    }),

  // 用户确认收货
  confirmReceipt: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const userId = ctx.user!.id;
      const [order] = await db.select().from(mibanOrders)
        .where(and(eq(mibanOrders.id, input.orderId), eq(mibanOrders.userId, userId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      if (order.status !== "shipped") throw new TRPCError({ code: "BAD_REQUEST", message: "订单状态不允许确认收货" });
      const now = new Date();
      await db.update(mibanOrders)
        .set({ status: "delivered", confirmedAt: now })
        .where(eq(mibanOrders.id, input.orderId));

      // ── 无限级分佣引擎 ──────────────────────────────────────────────────────
      // 按订单快照的触发时机决定是否在确认收货时触发分佣
      const triggerMode = (order as any).commissionTrigger ?? 'order_confirmed';
      if (triggerMode === 'order_confirmed') {
        try {
          await triggerMultiLevelCommission({
            orderId: order.id,
            orderNo: order.orderNo,
            buyerUserId: order.userId,
            orderAmount: parseFloat(String(order.totalPrice ?? 0)),
          });
        } catch (e: any) {
          console.error('[Miban] 分佣引擎错误（不影响确认收货）:', e?.message);
        }
      } else {
        console.log(`[Miban] 订单 ${order.orderNo} 触发时机为 order_placed，确认收货不再重复触发分佣`);
      }

      return { success: true };
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
  // 设置米伴职级（1=米农 2=米商 3=米行 4=米庄 5=米王）
  // 同时同步 miban_role：米农=baby（顾客），米商及以上=parent（经销商）
  setRank: mibanAdminProcedure
    .input(z.object({ userId: z.number(), rankIndex: z.number().int().min(1).max(10) }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("DB not available");
      const mibanRole = input.rankIndex >= 2 ? 'parent' : 'baby';
      await (conn as any).execute(
        `UPDATE users SET miban_rank_index = ?, miban_role = ? WHERE id = ?`,
        [input.rankIndex, mibanRole, input.userId]
      );
      return { ok: true };
    }),
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

// ─── 库存管理路由 ─────────────────────────────────────────────────────────────
export const mibanInventoryRouter = router({
  // 查询所有米种的当前库存（含零库存）
  stockList: mibanAdminProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) return [];
    // 以 miban_rice_catalog 为基准，LEFT JOIN 库存快照
    const [rows]: any = await (conn as any).execute(`
      SELECT c.id AS catalogId, c.stdName AS riceName, c.category, c.colorHex,
             COALESCE(s.stock_jin, 0) AS stockJin, c.price_per_jin AS pricePerJin
      FROM \`miban_rice_catalog\` c
      LEFT JOIN \`miban_inventory_stock\` s ON s.catalog_id = c.id
      WHERE c.isActive = 1
      ORDER BY c.sortOrder ASC, c.id ASC
    `);
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      catalogId: Number(r.catalogId),
      riceName: String(r.riceName),
      category: String(r.category),
      colorHex: String(r.colorHex),
      stockJin: parseFloat(String(r.stockJin ?? 0)),
      pricePerJin: parseFloat(String(r.pricePerJin ?? 0)),
    }));
  }),

  // 查询流水记录（最近200条）
  logList: mibanAdminProcedure
    .input(z.object({ catalogId: z.number().optional(), limit: z.number().min(1).max(500).default(100) }))
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      let sql2 = `SELECT * FROM \`miban_inventory_logs\``;
      const params: any[] = [];
      if (input.catalogId) {
        sql2 += ` WHERE catalog_id = ?`;
        params.push(input.catalogId);
      }
      sql2 += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(input.limit);
      const [rows]: any = await (conn as any).execute(sql2, params);
      return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        id: Number(r.id),
        catalogId: Number(r.catalog_id),
        riceName: String(r.rice_name),
        type: String(r.type) as 'in' | 'out',
        qtyJin: parseFloat(String(r.qty_jin)),
        costPerJin: r.cost_per_jin != null ? parseFloat(String(r.cost_per_jin)) : null,
        note: r.note ?? null,
        operator: r.operator ?? null,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      }));
    }),

  // 入库操作
  stockIn: mibanAdminProcedure
    .input(z.object({
      catalogId: z.number(),
      qtyJin: z.number().positive(),
      costPerJin: z.number().min(0).optional(),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      // 获取米种名称
      const [catRows]: any = await (conn as any).execute('SELECT stdName FROM `miban_rice_catalog` WHERE id = ?', [input.catalogId]);
      const cat = Array.isArray(catRows) ? catRows[0] : catRows;
      if (!cat) throw new TRPCError({ code: 'NOT_FOUND', message: '米种不存在' });
      const operator = (ctx.user as any)?.username ?? 'admin';
      // 写流水
      await (conn as any).execute(
        `INSERT INTO \`miban_inventory_logs\` (catalog_id, rice_name, type, qty_jin, cost_per_jin, note, operator) VALUES (?, ?, 'in', ?, ?, ?, ?)`,
        [input.catalogId, cat.stdName, input.qtyJin, input.costPerJin ?? null, input.note ?? null, operator]
      );
      // 更新库存快照（INSERT ON DUPLICATE KEY UPDATE）
      await (conn as any).execute(
        `INSERT INTO \`miban_inventory_stock\` (catalog_id, rice_name, stock_jin) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE stock_jin = stock_jin + VALUES(stock_jin), rice_name = VALUES(rice_name)`,
        [input.catalogId, cat.stdName, input.qtyJin]
      );
      return { success: true };
    }),

  // 手动出库（管理员手动扣减，如损耗/盘点）
  stockOut: mibanAdminProcedure
    .input(z.object({
      catalogId: z.number(),
      qtyJin: z.number().positive(),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const [catRows]: any = await (conn as any).execute('SELECT stdName FROM `miban_rice_catalog` WHERE id = ?', [input.catalogId]);
      const cat = Array.isArray(catRows) ? catRows[0] : catRows;
      if (!cat) throw new TRPCError({ code: 'NOT_FOUND', message: '米种不存在' });
      // 检查库存是否足够
      const [stockRows]: any = await (conn as any).execute('SELECT stock_jin FROM `miban_inventory_stock` WHERE catalog_id = ?', [input.catalogId]);
      const stock = Array.isArray(stockRows) ? stockRows[0] : stockRows;
      const current = parseFloat(String(stock?.stock_jin ?? 0));
      if (current < input.qtyJin) throw new TRPCError({ code: 'BAD_REQUEST', message: `库存不足，当前库存 ${current} 斤` });
      const operator = (ctx.user as any)?.username ?? 'admin';
      await (conn as any).execute(
        `INSERT INTO \`miban_inventory_logs\` (catalog_id, rice_name, type, qty_jin, note, operator) VALUES (?, ?, 'out', ?, ?, ?)`,
        [input.catalogId, cat.stdName, input.qtyJin, input.note ?? null, operator]
      );
      await (conn as any).execute(
        `UPDATE \`miban_inventory_stock\` SET stock_jin = GREATEST(0, stock_jin - ?) WHERE catalog_id = ?`,
        [input.qtyJin, input.catalogId]
      );
      return { success: true };
    }),

  // 删除流水记录（仅管理员）
  logDelete: mibanAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      // 先查出该记录，反向修正库存
      const [logRows]: any = await (conn as any).execute('SELECT * FROM `miban_inventory_logs` WHERE id = ?', [input.id]);
      const log = Array.isArray(logRows) ? logRows[0] : logRows;
      if (!log) throw new TRPCError({ code: 'NOT_FOUND' });
      const delta = log.type === 'in' ? -parseFloat(String(log.qty_jin)) : parseFloat(String(log.qty_jin));
      await (conn as any).execute(
        `UPDATE \`miban_inventory_stock\` SET stock_jin = GREATEST(0, stock_jin + ?) WHERE catalog_id = ?`,
        [delta, log.catalog_id]
      );
      await (conn as any).execute('DELETE FROM `miban_inventory_logs` WHERE id = ?', [input.id]);
      return { success: true };
    }),
});

// ─── 收货地址路由 ─────────────────────────────────────────────────────────────
export const mibanAddressRouter = router({

  // 查询当前用户的地址列表
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const userId = (ctx.user as any)?.openId ?? (ctx.user as any)?.id;
      const [rows]: any = await (conn as any).execute(
        'SELECT * FROM `miban_addresses` WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
        [userId]
      );
      return (Array.isArray(rows) ? rows : []) as any[];
    }),

  // 新增地址
  add: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(50),
      phone: z.string().min(7).max(20),
      province: z.string().min(1).max(30),
      city: z.string().min(1).max(30),
      district: z.string().max(30).optional(),
      detail: z.string().min(1).max(200),
      label: z.string().max(20).optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const userId = (ctx.user as any)?.openId ?? (ctx.user as any)?.id;
      if (input.isDefault) {
        await (conn as any).execute('UPDATE `miban_addresses` SET is_default = 0 WHERE user_id = ?', [userId]);
      }
      await (conn as any).execute(
        `INSERT INTO \`miban_addresses\` (user_id, name, phone, province, city, district, detail, label, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, input.name, input.phone, input.province, input.city, input.district ?? '', input.detail, input.label ?? '家', input.isDefault ? 1 : 0]
      );
      return { success: true };
    }),

  // 更新地址
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(50),
      phone: z.string().min(7).max(20),
      province: z.string().min(1).max(30),
      city: z.string().min(1).max(30),
      district: z.string().max(30).optional(),
      detail: z.string().min(1).max(200),
      label: z.string().max(20).optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const userId = (ctx.user as any)?.openId ?? (ctx.user as any)?.id;
      if (input.isDefault) {
        await (conn as any).execute('UPDATE `miban_addresses` SET is_default = 0 WHERE user_id = ?', [userId]);
      }
      await (conn as any).execute(
        `UPDATE \`miban_addresses\` SET name=?, phone=?, province=?, city=?, district=?, detail=?, label=?, is_default=?
         WHERE id=? AND user_id=?`,
        [input.name, input.phone, input.province, input.city, input.district ?? '', input.detail, input.label ?? '家', input.isDefault ? 1 : 0, input.id, userId]
      );
      return { success: true };
    }),

  // 删除地址
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const userId = (ctx.user as any)?.openId ?? (ctx.user as any)?.id;
      await (conn as any).execute('DELETE FROM `miban_addresses` WHERE id=? AND user_id=?', [input.id, userId]);
      return { success: true };
    }),

  // 设为默认地址
  setDefault: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const userId = (ctx.user as any)?.openId ?? (ctx.user as any)?.id;
      await (conn as any).execute('UPDATE `miban_addresses` SET is_default = 0 WHERE user_id = ?', [userId]);
      await (conn as any).execute('UPDATE `miban_addresses` SET is_default = 1 WHERE id=? AND user_id=?', [input.id, userId]);
      return { success: true };
    }),
});

// ─── 米伴评价路由 ──────────────────────────────────────────────────────────────
export const mibanReviewRouter = router({
  // 提交评价（确认收货后才能评价，每单只能评价一次）
  submit: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      rating: z.number().min(1).max(5),
      content: z.string().max(500).optional(),
      images: z.array(z.string()).max(6).optional(), // base64图片数组，最多6张
      isAnonymous: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const userId = ctx.user!.id;

      // 验证订单归属且已确认收货
      const [order] = await db.select().from(mibanOrders)
        .where(and(eq(mibanOrders.id, input.orderId), eq(mibanOrders.userId, userId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      if (order.status !== "delivered") throw new TRPCError({ code: "BAD_REQUEST", message: "请先确认收货后再评价" });

      // 检查是否已评价
      const [existing] = await db.select({ id: mibanReviews.id }).from(mibanReviews)
        .where(eq(mibanReviews.orderId, input.orderId)).limit(1);
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "该订单已评价" });

      // 上传图片到COS
      let imageUrls: string[] = [];
      if (input.images && input.images.length > 0) {
        const { uploadImageToCOS } = await import('./cos-upload');
        imageUrls = await Promise.all(
          input.images.map(imgData => uploadImageToCOS(imgData, 'miban-reviews' as any))
        );
      }

      await db.insert(mibanReviews).values({
        orderId: input.orderId,
        orderNo: order.orderNo,
        userId,
        productKey: 'tiangui-pear',
        rating: input.rating,
        content: input.content ?? null,
        images: imageUrls,
        isAnonymous: input.isAnonymous ? 1 : 0,
      });

      return { success: true };
    }),

  // 查询商品评价列表（公开接口，无需登录）
  list: publicProcedure
    .input(z.object({
      productKey: z.string().default('tiangui-pear'),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return { reviews: [], total: 0, avgRating: 0 };
      try {
        const [rows]: any = await (conn as any).execute(
          `SELECT r.id, r.rating, r.content, r.images, r.is_anonymous, r.createdAt,
                  u.name as userName
           FROM miban_reviews r
           LEFT JOIN users u ON u.id = r.user_id
           WHERE r.product_key = ?
           ORDER BY r.createdAt DESC
           LIMIT ? OFFSET ?`,
          [input.productKey, input.limit, input.offset]
        );
        const [countRows]: any = await (conn as any).execute(
          `SELECT COUNT(*) as total, AVG(rating) as avgRating FROM miban_reviews WHERE product_key = ?`,
          [input.productKey]
        );
        const total = Number(countRows?.[0]?.total ?? 0);
        const avgRating = parseFloat(countRows?.[0]?.avgRating ?? '0') || 0;
        const reviews = (Array.isArray(rows) ? rows : []).map((r: any) => ({
          id: r.id,
          rating: r.rating,
          content: r.content ?? '',
          images: (() => { try { return JSON.parse(r.images ?? '[]'); } catch { return []; } })(),
          isAnonymous: r.is_anonymous === 1,
          userName: r.is_anonymous ? '匿名用户' : (r.userName ?? '用户'),
          createdAt: r.createdAt,
        }));
        return { reviews, total, avgRating: Math.round(avgRating * 10) / 10 };
      } catch (e) {
        console.error('[mibanReview.list]', e);
        return { reviews: [], total: 0, avgRating: 0 };
      }
    }),

  // 查询当前用户某订单是否已评价
  myReview: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const [review] = await db.select().from(mibanReviews)
        .where(and(eq(mibanReviews.orderId, input.orderId), eq(mibanReviews.userId, ctx.user!.id)))
        .limit(1);
      return review ?? null;
    }),
});

// ─── 米伴商品收藏路由 ──────────────────────────────────────────────────────────
export const mibanFavoriteRouter = router({
  // 切换收藏状态（收藏/取消收藏）
  toggle: protectedProcedure
    .input(z.object({
      productKey: z.string(),
      productName: z.string(),
      productImg: z.string().optional(),
      productUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const userId = ctx.user!.id;
      const [existing] = await db.select({ id: mibanFavorites.id })
        .from(mibanFavorites)
        .where(and(eq(mibanFavorites.userId, userId), eq(mibanFavorites.productKey, input.productKey)))
        .limit(1);
      if (existing) {
        await db.delete(mibanFavorites).where(eq(mibanFavorites.id, existing.id));
        return { favorited: false };
      } else {
        await db.insert(mibanFavorites).values({
          userId,
          productKey: input.productKey,
          productName: input.productName,
          productImg: input.productImg ?? null,
          productUrl: input.productUrl ?? null,
        });
        return { favorited: true };
      }
    }),

  // 查询当前用户是否收藏了某商品
  isFavorited: protectedProcedure
    .input(z.object({ productKey: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { favorited: false };
      const [existing] = await db.select({ id: mibanFavorites.id })
        .from(mibanFavorites)
        .where(and(eq(mibanFavorites.userId, ctx.user!.id), eq(mibanFavorites.productKey, input.productKey)))
        .limit(1);
      return { favorited: !!existing };
    }),

  // 查询当前用户的收藏列表
  myList: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(mibanFavorites)
      .where(eq(mibanFavorites.userId, ctx.user!.id))
      .orderBy(mibanFavorites.createdAt);
  }),
});

// ── 天桂梨规格路由 ──────────────────────────────────────────────────────────
export const mibanPearRouter = router({
  // 获取规格列表（公开接口，无需登录）
  getSpecs: publicProcedure
    .input(z.object({ productKey: z.string().default('tiangui-pear') }))
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      try {
        const [rows]: any = await (conn as any).execute(
          `SELECT id, name, sub, price, weight_jin as weightJin, is_featured as isFeatured, sort_order as sortOrder
           FROM miban_pear_specs
           WHERE product_key = ? AND is_active = 1
           ORDER BY sort_order ASC`,
          [input.productKey]
        );
        return (Array.isArray(rows) ? rows : []).map((r: any) => ({
          id: r.id,
          name: r.name,
          sub: r.sub ?? '',
          price: parseFloat(r.price),
          weightJin: parseFloat(r.weightJin ?? 0),
          isFeatured: r.isFeatured === 1,
          sortOrder: r.sortOrder,
        }));
      } catch (e) {
        console.error('[mibanPear.getSpecs]', e);
        return [];
      } finally {
        try { await (conn as any).end(); } catch {}
      }
    }),

  // 更新规格价格（管理员接口）
  updateSpec: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      sub: z.string().optional(),
      price: z.number().optional(),
      weightJin: z.number().optional(),
      isFeatured: z.boolean().optional(),
      sortOrder: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.isAdmin) throw new Error('无权限');
      const conn = await getDbConnection();
      if (!conn) throw new Error('数据库连接失败');
      try {
        const sets: string[] = [];
        const vals: any[] = [];
        if (input.name !== undefined) { sets.push('name = ?'); vals.push(input.name); }
        if (input.sub !== undefined) { sets.push('sub = ?'); vals.push(input.sub); }
        if (input.price !== undefined) { sets.push('price = ?'); vals.push(input.price); }
        if (input.weightJin !== undefined) { sets.push('weight_jin = ?'); vals.push(input.weightJin); }
        if (input.isFeatured !== undefined) { sets.push('is_featured = ?'); vals.push(input.isFeatured ? 1 : 0); }
        if (input.sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(input.sortOrder); }
        if (input.isActive !== undefined) { sets.push('is_active = ?'); vals.push(input.isActive ? 1 : 0); }
        if (sets.length === 0) return { success: true };
        vals.push(input.id);
        await (conn as any).execute(`UPDATE miban_pear_specs SET ${sets.join(', ')} WHERE id = ?`, vals);
        return { success: true };
      } finally {
        try { await (conn as any).end(); } catch {}
      }
    }),
});
