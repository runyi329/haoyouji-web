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
