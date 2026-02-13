import { getDb } from "./db";
import { equityInvestments, equityRules, equityContributions, users, contacts } from "../drizzle/schema";
import { eq, sql, sum, and, inArray } from "drizzle-orm";

/**
 * 获取股权规则配置
 */
export async function getEquityRules() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const rules = await db.select().from(equityRules);
  
  // 转换为键值对对象
  const rulesMap: Record<string, number> = {};
  for (const rule of rules) {
    rulesMap[rule.ruleKey] = Number(rule.ruleValue);
  }
  
  return rulesMap;
}

/**
 * 更新股权规则
 */
export async function updateEquityRule(ruleKey: string, ruleValue: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(equityRules)
    .set({ ruleValue: ruleValue.toString() })
    .where(eq(equityRules.ruleKey, ruleKey));
  
  return { success: true };
}

/**
 * 插入或更新股权规则（upsert）
 * 使用drizzle ORM的insert + onDuplicateKeyUpdate确保可靠性
 */
export async function upsertEquityRule(ruleKey: string, ruleValue: number, ruleDescription?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const desc = ruleDescription || ruleKey;
  const valStr = Number(ruleValue).toFixed(4);
  
  console.log(`[upsertEquityRule] key=${ruleKey}, value=${valStr}, desc=${desc}`);
  
  try {
    // 方法一：先查后插/更
    const existing = await db
      .select()
      .from(equityRules)
      .where(eq(equityRules.ruleKey, ruleKey));
    
    if (existing.length > 0) {
      console.log(`[upsertEquityRule] Updating existing rule: ${ruleKey}`);
      await db
        .update(equityRules)
        .set({
          ruleValue: valStr,
          ruleDescription: desc,
        })
        .where(eq(equityRules.ruleKey, ruleKey));
    } else {
      console.log(`[upsertEquityRule] Inserting new rule: ${ruleKey}`);
      await db
        .insert(equityRules)
        .values({
          ruleKey: ruleKey,
          ruleValue: valStr,
          ruleDescription: desc,
        });
      console.log(`[upsertEquityRule] Insert completed for: ${ruleKey}`);
    }
    
    // 验证写入是否成功
    const verify = await db
      .select()
      .from(equityRules)
      .where(eq(equityRules.ruleKey, ruleKey));
    console.log(`[upsertEquityRule] Verify result for ${ruleKey}:`, verify.length > 0 ? 'EXISTS' : 'NOT FOUND');
    
    return { success: true };
  } catch (error: any) {
    console.error(`[upsertEquityRule] Error for ${ruleKey}:`, error.message);
    throw error;
  }
}

/**
 * 删除股权规则
 */
export async function deleteEquityRule(ruleKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(equityRules)
    .where(eq(equityRules.ruleKey, ruleKey));
  
  return { success: true };
}

/**
 * 获取所有规则详情（包含描述）
 */
export async function getEquityRulesDetail() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const rules = await db.select().from(equityRules);
  return rules.map(r => ({
    ruleKey: r.ruleKey,
    ruleValue: Number(r.ruleValue),
    ruleDescription: r.ruleDescription,
  }));
}

/**
 * 获取所有投资记录
 */
export async function getAllInvestments() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const investments = await db
    .select({
      id: equityInvestments.id,
      userId: equityInvestments.userId,
      userName: users.name,
      username: users.username,
      investorName: equityInvestments.investorName,
      investorIdCard: equityInvestments.investorIdCard,
      investmentAmount: equityInvestments.investmentAmount,
      investmentDate: equityInvestments.investmentDate,
      notes: equityInvestments.notes,
    })
    .from(equityInvestments)
    .leftJoin(users, eq(equityInvestments.userId, users.id))
    .orderBy(equityInvestments.investmentDate);
  
  return investments;
}

/**
 * 获取用户的投资记录
 */
export async function getUserInvestments(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const investments = await db
    .select()
    .from(equityInvestments)
    .where(eq(equityInvestments.userId, userId))
    .orderBy(equityInvestments.investmentDate);
  
  return investments;
}

/**
 * 添加投资记录
 */
export async function addInvestment(
  userId: number,
  investorName?: string,
  investorIdCard?: string,
  amount?: number,
  investmentDate?: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (!amount) throw new Error("Investment amount is required");
  
  // 如果传入了投资日期，使用传入的日期；否则用当前时间
  let dateStr: string;
  if (investmentDate) {
    // 前端传入的是 YYYY-MM-DD 格式，补上时间部分
    dateStr = `${investmentDate} 00:00:00`;
  } else {
    const now = new Date();
    dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  }
  
  const [result] = await db
    .insert(equityInvestments)
    .values({
      userId,
      investorName: investorName || null,
      investorIdCard: investorIdCard || null,
      investmentAmount: amount.toFixed(2),
      investmentDate: dateStr,
      notes: notes || null,
    });
  
  return { success: true, id: result.insertId };
}

/**
 * 更新投资记录
 */
export async function updateInvestment(
  id: number,
  amount: number,
  investorName?: string,
  investorIdCard?: string,
  investmentDate?: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = {
    investmentAmount: amount.toString(),
    notes: notes || null,
    investorName: investorName || null,
    investorIdCard: investorIdCard || null,
  };
  
  if (investmentDate) {
    updateData.investmentDate = `${investmentDate} 00:00:00`;
  }
  
  await db
    .update(equityInvestments)
    .set(updateData)
    .where(eq(equityInvestments.id, id));
  
  return { success: true };
}

/**
 * 删除投资记录
 */
export async function deleteInvestment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(equityInvestments)
    .where(eq(equityInvestments.id, id));
  
  return { success: true };
}

/**
 * 计算用户的股权信息
 */
export async function calculateUserEquity(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 获取规则配置
  const rules = await getEquityRules();
  const investmentPoolPercentage = rules['investment_pool_percentage'] || 33.3333;
  const invitePerUserPercentage = rules['invite_per_user_percentage'] || 0.05;
  const referralNetworkPer100Percentage = rules['referral_network_per_100_percentage'] || 0.02;
  
  // 2. 计算投资股份
  // 获取所有投资总额
  const [totalInvestmentResult] = await db
    .select({ total: sum(equityInvestments.investmentAmount) })
    .from(equityInvestments);
  
  const totalInvestment = Number(totalInvestmentResult?.total || 0);
  
  // 获取用户投资总额
  const [userInvestmentResult] = await db
    .select({ total: sum(equityInvestments.investmentAmount) })
    .from(equityInvestments)
    .where(eq(equityInvestments.userId, userId));
  
  const userInvestment = Number(userInvestmentResult?.total || 0);
  
  // 计算投资股份百分比
  let investmentEquity = 0;
  if (totalInvestment > 0 && userInvestment > 0) {
    investmentEquity = (userInvestment / totalInvestment) * investmentPoolPercentage;
  }
  
  // 3. 计算邀请贡献和人脉贡献
  // 核心逻辑：只有有投资记录的用户（股东）才计算市场贡献股份
  let inviteCount = 0;
  let inviteEquity = 0;
  let referralNetworkCount = 0;
  let referralNetworkEquity = 0;
  
  if (userInvestment > 0) {
    // 用户有投资记录，才计算贡献股份
    const [user] = await db
      .select({ inviteCount: users.inviteCount })
      .from(users)
      .where(eq(users.id, userId));
    
    inviteCount = user?.inviteCount || 0;
    inviteEquity = inviteCount * invitePerUserPercentage;
    
    // 4. 计算人脉贡献（被邀请人的人脉总数）
    const invitedUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.invitedByUserId, userId));
    
    const invitedUserIds = invitedUsers.map(u => u.id);
    
    if (invitedUserIds.length > 0) {
      const [networkResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contacts)
        .where(inArray(contacts.parentUserId, invitedUserIds));
      
      referralNetworkCount = Number(networkResult?.count || 0);
    }
    
    referralNetworkEquity = Math.floor(referralNetworkCount / 100) * referralNetworkPer100Percentage;
  }
  // 如果用户没有投资记录，inviteEquity 和 referralNetworkEquity 保持为 0
  
  // 5. 计算总股份
  const totalEquity = investmentEquity + inviteEquity + referralNetworkEquity;
  
  return {
    totalEquity: Number(totalEquity.toFixed(4)),
    investmentEquity: Number(investmentEquity.toFixed(4)),
    inviteEquity: Number(inviteEquity.toFixed(4)),
    referralNetworkEquity: Number(referralNetworkEquity.toFixed(4)),
    details: {
      userInvestment,
      totalInvestment,
      inviteCount,
      referralNetworkCount,
    },
  };
}

/**
 * 获取所有股东的股权信息
 */
export async function getAllShareholdersEquity() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 获取所有有投资记录的用户
  const investors = await db
    .select({
      userId: equityInvestments.userId,
      userName: users.name,
      username: users.username,
    })
    .from(equityInvestments)
    .leftJoin(users, eq(equityInvestments.userId, users.id))
    .groupBy(equityInvestments.userId, users.name, users.username);
  
  // 计算每个股东的股权
  const shareholdersEquity = [];
  for (const investor of investors) {
    if (!investor.userId) continue;
    
    const equity = await calculateUserEquity(investor.userId);
    shareholdersEquity.push({
      userId: investor.userId,
      userName: investor.userName || investor.username || '未知',
      ...equity,
    });
  }
  
  // 按总股份降序排序
  shareholdersEquity.sort((a, b) => b.totalEquity - a.totalEquity);
  
  return shareholdersEquity;
}
