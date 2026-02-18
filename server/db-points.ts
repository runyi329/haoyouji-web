import { getDb } from "./db";
import { pointTransactions } from "../drizzle/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

/**
 * 获取用户的积分交易历史
 * @param userId 用户ID
 * @param limit 返回记录数量限制
 */
export async function getPointHistory(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(pointTransactions)
    .where(eq(pointTransactions.userId, userId))
    .orderBy(desc(pointTransactions.createdAt))
    .limit(limit);
}

/**
 * 获取用户的积分统计数据
 * @param userId 用户ID
 */
export async function getPointStats(userId: number) {
  const db = await getDb();
  if (!db) return null;
  
  // 获取当前月份的开始时间
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // 本月获得的积分(正数)
  const monthEarnedResult = await db
    .select({ total: sql<number>`COALESCE(SUM(${pointTransactions.amount}), 0)` })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.userId, userId),
        gte(pointTransactions.createdAt, monthStart),
        sql`${pointTransactions.amount} > 0`
      )
    );
  
  // 本月使用的积分(负数的绝对值)
  const monthSpentResult = await db
    .select({ total: sql<number>`COALESCE(ABS(SUM(${pointTransactions.amount})), 0)` })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.userId, userId),
        gte(pointTransactions.createdAt, monthStart),
        sql`${pointTransactions.amount} < 0`
      )
    );
  
  // 总获得积分
  const totalEarnedResult = await db
    .select({ total: sql<number>`COALESCE(SUM(${pointTransactions.amount}), 0)` })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.userId, userId),
        sql`${pointTransactions.amount} > 0`
      )
    );
  
  // 总使用积分
  const totalSpentResult = await db
    .select({ total: sql<number>`COALESCE(ABS(SUM(${pointTransactions.amount})), 0)` })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.userId, userId),
        sql`${pointTransactions.amount} < 0`
      )
    );
  
  return {
    monthEarned: Number(monthEarnedResult[0]?.total || 0),
    monthSpent: Number(monthSpentResult[0]?.total || 0),
    totalEarned: Number(totalEarnedResult[0]?.total || 0),
    totalSpent: Number(totalSpentResult[0]?.total || 0),
  };
}

/**
 * 获取用户积分余额
 * @param userId 用户ID
 * @returns 积分余额
 */
export async function getUserPoints(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(
    `SELECT points FROM users WHERE id = ?`,
    [userId]
  );

  const user = Array.isArray(result) ? result[0] : (result.rows?.[0] || null);
  
  if (!user) {
    throw new Error("用户不存在");
  }

  return Number(user.points) || 0;
}

/**
 * 扣除用户积分（用于AI消费）
 * @param userId 用户ID
 * @param amount 扣除金额（正数）
 * @param relatedType 关联类型（如'ai_message'）
 * @param relatedId 关联ID（如消息ID）
 * @param description 交易描述
 * @returns 扣除后的余额
 */
export async function deductPoints(
  userId: number,
  amount: number,
  relatedType: string = "ai_message",
  relatedId: number | null = null,
  description: string = "AI对话消费"
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 开始事务
  await db.execute("START TRANSACTION");

  try {
    // 检查余额
    const currentBalance = await getUserPoints(userId);
    
    if (currentBalance < amount) {
      throw new Error(`积分不足，当前余额：${currentBalance.toFixed(2)}，需要：${amount.toFixed(2)}`);
    }

    // 扣除积分
    await db.execute(
      `UPDATE users SET points = points - ? WHERE id = ?`,
      [amount, userId]
    );

    // 获取扣除后的余额
    const newBalance = currentBalance - amount;

    // 记录交易
    await db.execute(
      `INSERT INTO points_transactions 
       (user_id, type, amount, balance_after, related_type, related_id, description) 
       VALUES (?, 'consume', ?, ?, ?, ?, ?)`,
      [userId, -amount, newBalance, relatedType, relatedId, description]
    );

    // 提交事务
    await db.execute("COMMIT");

    console.log(`[Points] Deducted ${amount} points from user ${userId}, new balance: ${newBalance}`);
    
    return newBalance;
  } catch (error) {
    // 回滚事务
    await db.execute("ROLLBACK");
    throw error;
  }
}

/**
 * 充值用户积分
 * @param userId 用户ID
 * @param amount 充值金额（正数）
 * @param description 交易描述
 * @returns 充值后的余额
 */
export async function rechargePoints(
  userId: number,
  amount: number,
  description: string = "积分充值"
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 开始事务
  await db.execute("START TRANSACTION");

  try {
    // 增加积分
    await db.execute(
      `UPDATE users SET points = points + ? WHERE id = ?`,
      [amount, userId]
    );

    // 获取充值后的余额
    const newBalance = await getUserPoints(userId);

    // 记录交易
    await db.execute(
      `INSERT INTO points_transactions 
       (user_id, type, amount, balance_after, description) 
       VALUES (?, 'recharge', ?, ?, ?)`,
      [userId, amount, newBalance, description]
    );

    // 提交事务
    await db.execute("COMMIT");

    console.log(`[Points] Recharged ${amount} points to user ${userId}, new balance: ${newBalance}`);
    
    return newBalance;
  } catch (error) {
    // 回滚事务
    await db.execute("ROLLBACK");
    throw error;
  }
}

/**
 * 计算AI对话的费用
 * @param promptTokens 输入token数
 * @param completionTokens 输出token数
 * @returns 费用（积分）
 */
export function calculateAICost(promptTokens: number, completionTokens: number): number {
  // 计费规则：
  // 输入token: 0.001积分/1K tokens
  // 输出token: 0.002积分/1K tokens
  const inputCost = (promptTokens / 1000) * 0.001;
  const outputCost = (completionTokens / 1000) * 0.002;
  const totalCost = inputCost + outputCost;
  
  // 保留4位小数
  return Math.round(totalCost * 10000) / 10000;
}
