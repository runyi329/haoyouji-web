/**
 * 活跃人脉统计模块
 * 
 * 统计规则:
 * - 统计"全部"人脉(我的+共享的)中的活跃数量
 * - 活跃定义: 在指定时间范围内有联络记录
 * - 同一个人多次联络只算1次
 * 
 * 重要: interactionDate 在数据库中是 timestamp 类型，存储的是 ISO 格式字符串
 * 例如: "2026-02-04 08:30:00" 或 "2026-02-04T08:30:00.000Z"
 * 需要使用字符串比较或转换为 Date 对象进行比较
 */

import { getDb } from './db';
import { contacts, contactInteractions } from '../drizzle/schema';
import { eq, and, gte, sql, inArray } from 'drizzle-orm';
import { getBeijingTodayStart, getBeijingThisWeekStart, getBeijingThisMonthStart, getBeijingThisYearStart } from '../shared/timezone';

// 注意：现在使用 shared/timezone.ts 中的时间函数，保证与其他模块一致

/**
 * 获取用户所有可见的联系人ID(我的+共享的)
 */
async function getAllVisibleContactIds(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  console.log(`[getAllVisibleContactIds] 开始查询用户 ${userId} 的可见人脉`);
  
  // 1. 获取自己的联系人
  const myContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.parentUserId, userId));
  
  const myContactIds = myContacts.map(c => c.id);
  console.log(`[getAllVisibleContactIds] 我的人脉数量: ${myContactIds.length}`);
  
  // 2. 获取共享给我的联系人
  const sharedContactsResult = await db.execute(sql`
    SELECT DISTINCT c.id
    FROM contacts c
    INNER JOIN contact_sharing_connections sc ON c.parentUserId = sc.sharerId
    WHERE sc.receiverId = ${userId}
      AND sc.status = 'active'
  `);
  
  const sharedContactIds = sharedContactsResult.map((row: any) => row.id);
  console.log(`[getAllVisibleContactIds] 共享给我的人脉数量: ${sharedContactIds.length}`);
  
  // 3. 合并并去重
  const allIds = [...new Set([...myContactIds, ...sharedContactIds])];
  console.log(`[getAllVisibleContactIds] 总计可见人脉: ${allIds.length}`);
  
  return allIds;
}

/**
 * 统计指定时间范围内的活跃人脉数量
 * @param userId 用户ID
 * @param startDate 开始时间（Date对象）
 */
async function getActiveCount(userId: number, startDate: Date): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 获取所有可见的联系人 ID
  const visibleContactIds = await getAllVisibleContactIds(userId);
  
  if (visibleContactIds.length === 0) {
    return 0;
  }
  
  // 将 Date 转换为 ISO 字符串格式用于数据库比较
  // MySQL timestamp 字段存储的是 UTC 时间
  const startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
  
  console.log(`[getActiveCount] userId=${userId}, startDate=${startDate.toISOString()}, startDateStr=${startDateStr}`);
  console.log(`[getActiveCount] 可见人脉数量: ${visibleContactIds.length}`);
  
  // 2. 查询指定时间范围内的所有联络记录
  // 使用原生 SQL 确保时间比较正确
  const interactions = await db
    .select({ contactId: contactInteractions.contactId, interactionDate: contactInteractions.interactionDate })
    .from(contactInteractions)
    .where(
      and(
        sql`${contactInteractions.interactionDate} >= ${startDateStr}`,
        inArray(contactInteractions.contactId, visibleContactIds)
      )
    );
  
  console.log(`[getActiveCount] 查询到 ${interactions.length} 条联络记录`);
  if (interactions.length > 0 && interactions.length <= 5) {
    console.log(`[getActiveCount] 示例记录:`, interactions.map(i => ({ contactId: i.contactId, date: i.interactionDate })));
  }
  
  // 3. 去重统计
  const activeContactIds = new Set(interactions.map(i => i.contactId));
  
  console.log(`[getActiveCount] 去重后活跃人脉数: ${activeContactIds.size}`);
  
  return activeContactIds.size;
}

/**
 * 获取今日活跃人脉数量
 */
export async function getTodayActiveCount(userId: number): Promise<number> {
  const startTimestamp = getBeijingTodayStart();
  const startDate = new Date(startTimestamp);
  console.log(`[getTodayActiveCount] 今日开始时间: ${startDate.toISOString()}`);
  return getActiveCount(userId, startDate);
}

/**
 * 获取本周活跃人脉数量
 */
export async function getWeeklyActiveCount(userId: number): Promise<number> {
  const startTimestamp = getBeijingThisWeekStart();
  const startDate = new Date(startTimestamp);
  console.log(`[getWeeklyActiveCount] 本周开始时间: ${startDate.toISOString()}`);
  return getActiveCount(userId, startDate);
}

/**
 * 获取本月活跃人脉数量
 */
export async function getMonthlyActiveCount(userId: number): Promise<number> {
  const startTimestamp = getBeijingThisMonthStart();
  const startDate = new Date(startTimestamp);
  console.log(`[getMonthlyActiveCount] 本月开始时间: ${startDate.toISOString()}`);
  return getActiveCount(userId, startDate);
}

/**
 * 获取今年活跃人脉数量
 */
export async function getYearlyActiveCount(userId: number): Promise<number> {
  const startTimestamp = getBeijingThisYearStart();
  const startDate = new Date(startTimestamp);
  console.log(`[getYearlyActiveCount] 本年开始时间: ${startDate.toISOString()}`);
  return getActiveCount(userId, startDate);
}

/**
 * 一次性获取所有活跃统计数据
 */
export async function getAllActiveStats(userId: number) {
  try {
    console.log('[getAllActiveStats] 开始查询用户ID:', userId);
    console.log('[getAllActiveStats] 注意：统计的是全部人脉（我的+共享）');
    
    const [todayActive, weeklyActive, monthlyActive, yearlyActive] = await Promise.all([
      getTodayActiveCount(userId),
      getWeeklyActiveCount(userId),
      getMonthlyActiveCount(userId),
      getYearlyActiveCount(userId),
    ]);
    
    console.log('[getAllActiveStats] 查询结果（全部人脉）:', { todayActive, weeklyActive, monthlyActive, yearlyActive });
    
    return {
      todayActive,
      weeklyActive,
      monthlyActive,
      yearlyActive,
    };
  } catch (error) {
    console.error('[getAllActiveStats] 查询失败:', error);
    // 返回默认值而不是抛出异常
    return {
      todayActive: 0,
      weeklyActive: 0,
      monthlyActive: 0,
      yearlyActive: 0,
    };
  }
}
