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

// 北京时区偏移量（毫秒）
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 获取北京时间当前时刻
 */
function getBeijingNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + BEIJING_OFFSET_MS);
}

/**
 * 获取北京时间今天的开始时间（00:00:00）
 * @returns Date 对象（UTC时间，但代表北京时间的00:00）
 */
function getBeijingTodayStartDate(): Date {
  const beijingNow = getBeijingNow();
  // 在北京时间下设置为当天00:00:00
  const year = beijingNow.getUTCFullYear();
  const month = beijingNow.getUTCMonth();
  const day = beijingNow.getUTCDate();
  // 创建北京时间的00:00:00，然后转回UTC
  const beijingMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  return new Date(beijingMidnight.getTime() - BEIJING_OFFSET_MS);
}

/**
 * 获取北京时间本周一的开始时间（00:00:00）
 * @returns Date 对象
 */
function getBeijingThisWeekStartDate(): Date {
  const beijingNow = getBeijingNow();
  const dayOfWeek = beijingNow.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const year = beijingNow.getUTCFullYear();
  const month = beijingNow.getUTCMonth();
  const day = beijingNow.getUTCDate() - daysToMonday;
  
  const beijingMondayMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  return new Date(beijingMondayMidnight.getTime() - BEIJING_OFFSET_MS);
}

/**
 * 获取北京时间本月1号的开始时间（00:00:00）
 * @returns Date 对象
 */
function getBeijingThisMonthStartDate(): Date {
  const beijingNow = getBeijingNow();
  const year = beijingNow.getUTCFullYear();
  const month = beijingNow.getUTCMonth();
  
  const beijingMonthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return new Date(beijingMonthStart.getTime() - BEIJING_OFFSET_MS);
}

/**
 * 获取北京时间本年1月1日的开始时间（00:00:00）
 * @returns Date 对象
 */
function getBeijingThisYearStartDate(): Date {
  const beijingNow = getBeijingNow();
  const year = beijingNow.getUTCFullYear();
  
  const beijingYearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  return new Date(beijingYearStart.getTime() - BEIJING_OFFSET_MS);
}

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
    INNER JOIN contact_sharing_connections sc ON c.parentUserId = sc.sharerId
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
  
  // 2. 查询指定时间范围内的所有联络记录
  // 使用原生 SQL 确保时间比较正确
  const interactions = await db
    .select({ contactId: contactInteractions.contactId })
    .from(contactInteractions)
    .where(
      and(
        sql`${contactInteractions.interactionDate} >= ${startDateStr}`,
        inArray(contactInteractions.contactId, visibleContactIds)
      )
    );
  
  console.log(`[getActiveCount] 查询到 ${interactions.length} 条联络记录`);
  
  // 3. 去重统计
  const activeContactIds = new Set(interactions.map(i => i.contactId));
  
  console.log(`[getActiveCount] 去重后活跃人脉数: ${activeContactIds.size}`);
  
  return activeContactIds.size;
}

/**
 * 获取今日活跃人脉数量
 */
export async function getTodayActiveCount(userId: number): Promise<number> {
  const startDate = getBeijingTodayStartDate();
  console.log(`[getTodayActiveCount] 今日开始时间: ${startDate.toISOString()}`);
  return getActiveCount(userId, startDate);
}

/**
 * 获取本周活跃人脉数量
 */
export async function getWeeklyActiveCount(userId: number): Promise<number> {
  const startDate = getBeijingThisWeekStartDate();
  console.log(`[getWeeklyActiveCount] 本周开始时间: ${startDate.toISOString()}`);
  return getActiveCount(userId, startDate);
}

/**
 * 获取本月活跃人脉数量
 */
export async function getMonthlyActiveCount(userId: number): Promise<number> {
  const startDate = getBeijingThisMonthStartDate();
  console.log(`[getMonthlyActiveCount] 本月开始时间: ${startDate.toISOString()}`);
  return getActiveCount(userId, startDate);
}

/**
 * 获取今年活跃人脉数量
 */
export async function getYearlyActiveCount(userId: number): Promise<number> {
  const startDate = getBeijingThisYearStartDate();
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
