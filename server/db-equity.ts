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
export async function addInvestment(userId: number, amount: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db
    .insert(equityInvestments)
    .values({
      userId,
      investmentAmount: amount.toString(),
      investmentDate: new Date().toISOString(),
      notes,
    });
  
  return { success: true, id: result.insertId };
}

/**
 * 更新投资记录
 */
export async function updateInvestment(id: number, amount: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(equityInvestments)
    .set({
      investmentAmount: amount.toString(),
      notes,
    })
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
  
  // 3. 计算邀请贡献
  const [user] = await db
    .select({ inviteCount: users.inviteCount })
    .from(users)
    .where(eq(users.id, userId));
  
  const inviteCount = user?.inviteCount || 0;
  const inviteEquity = inviteCount * invitePerUserPercentage;
  
  // 4. 计算人脉贡献（被邀请人的人脉总数）
  // 获取所有被该用户邀请的用户ID
  const invitedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.invitedByUserId, userId));
  
  const invitedUserIds = invitedUsers.map(u => u.id);
  
  let referralNetworkCount = 0;
  if (invitedUserIds.length > 0) {
    // 统计这些用户的人脉总数
    const [networkResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contacts)
      .where(inArray(contacts.parentUserId, invitedUserIds));
    
    referralNetworkCount = Number(networkResult?.count || 0);
  }
  
  const referralNetworkEquity = Math.floor(referralNetworkCount / 100) * referralNetworkPer100Percentage;
  
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
