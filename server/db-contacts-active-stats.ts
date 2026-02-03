/**
 * 活跃人脉统计模块
 * 
 * 统计规则:
 * - 统计"全部"人脉(我的+共享的)中的活跃数量
 * - 活跃定义: 在指定时间范围内有联络记录
 * - 同一个人多次联络只算1次
 */

import { getDb } from './db';
import { contacts, contactInteractions } from '@shared/db-schema';
import { eq, and, gte, lt, sql, inArray } from 'drizzle-orm';
import { getBeijingTodayStart, getBeijingThisWeekStart, getBeijingThisMonthStart, getBeijingThisYearStart } from '@shared/timezone';

/**
 * 获取用户所有可见的联系人ID(我的+共享的)
 */
async function getAllVisibleContactIds(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 获取自己的联系人
  const myContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.parentUserId, userId));
  
  const myContactIds = myContacts.map(c => c.id);
  
  // 2. 获取共享给我的联系人
  const sharedContactsResult = await db.execute(sql`
    SELECT DISTINCT c.id
    FROM contacts c
    INNER JOIN sharing_connections sc ON c.parentUserId = sc.sharerId
    WHERE sc.receiverId = ${userId}
      AND sc.status = 'active'
  `);
  
  const sharedContactIds = sharedContactsResult.map((row: any) => row.id);
  
  // 3. 合并并去重
  const allIds = [...new Set([...myContactIds, ...sharedContactIds])];
  
  return allIds;
}

/**
 * 统计指定时间范围内的活跃人脉数量
 */
async function getActiveCount(userId: number, startTime: Date): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 获取所有可见的联系人 ID
  const visibleContactIds = await getAllVisibleContactIds(userId);
  
  if (visibleContactIds.length === 0) {
    return 0;
  }
  
  // 2. 查询指定时间范围内的所有联络记录
  const interactions = await db
    .select({ contactId: contactInteractions.contactId })
    .from(contactInteractions)
    .where(
      and(
        gte(contactInteractions.interactionDate, startTime),
        inArray(contactInteractions.contactId, visibleContactIds)
      )
    );
  
  // 3. 去重统计
  const activeContactIds = new Set(interactions.map(i => i.contactId));
  
  return activeContactIds.size;
}

/**
 * 获取今日活跃人脉数量
 */
export async function getTodayActiveCount(userId: number): Promise<number> {
  const startTime = getBeijingTodayStart();
  return getActiveCount(userId, startTime);
}

/**
 * 获取本周活跃人脉数量
 */
export async function getWeeklyActiveCount(userId: number): Promise<number> {
  const startTime = getBeijingThisWeekStart();
  return getActiveCount(userId, startTime);
}

/**
 * 获取本月活跃人脉数量
 */
export async function getMonthlyActiveCount(userId: number): Promise<number> {
  const startTime = getBeijingThisMonthStart();
  return getActiveCount(userId, startTime);
}

/**
 * 获取今年活跃人脉数量
 */
export async function getYearlyActiveCount(userId: number): Promise<number> {
  const startTime = getBeijingThisYearStart();
  return getActiveCount(userId, startTime);
}

/**
 * 一次性获取所有活跃统计数据
 */
export async function getAllActiveStats(userId: number) {
  const [todayActive, weeklyActive, monthlyActive, yearlyActive] = await Promise.all([
    getTodayActiveCount(userId),
    getWeeklyActiveCount(userId),
    getMonthlyActiveCount(userId),
    getYearlyActiveCount(userId),
  ]);
  
  return {
    todayActive,
    weeklyActive,
    monthlyActive,
    yearlyActive,
  };
}
