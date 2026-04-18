/**
 * 活跃人脉统计模块（性能优化版）
 *
 * 统计规则:
 * - 统计"全部"人脉(我的+共享的)中的活跃数量
 * - 活跃定义: 在指定时间范围内有联络记录
 * - 同一个人多次联络只算1次
 *
 * 优化: 原实现调用 4 次 getActiveCount，每次都重新查 getAllVisibleContactIds（3 次 SQL），
 * 共发出 4×3+4=16 次数据库查询。
 * 新实现: 1 次查可见 ID + 1 条 SQL 同时聚合四个时间段 = 共 3 次查询。
 */

import { getDb } from './db';
import { contacts, contactInteractions, contactSharingConnections } from '../drizzle/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import {
  getBeijingTodayStart,
  getBeijingThisWeekStart,
  getBeijingThisMonthStart,
  getBeijingThisYearStart,
} from '../shared/timezone';

// ─── 工具：时间戳 → MySQL UTC datetime 字符串 ───────────────────────────────
function toMySQLDatetime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ─── 获取可见人脉 ID（我的 + 共享给我的） ────────────────────────────────────
async function getAllVisibleContactIds(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // 1. 我的人脉
  const myContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.parentUserId, userId));
  const myIds = myContacts.map(c => c.id);

  // 2. 共享给我的人脉（两步 IN 查询）
  const sharingConns = await db
    .select({ sharerId: contactSharingConnections.sharerId })
    .from(contactSharingConnections)
    .where(
      and(
        eq(contactSharingConnections.receiverId, userId),
        eq(contactSharingConnections.status, 'active'),
      ),
    );

  let sharedIds: number[] = [];
  if (sharingConns.length > 0) {
    const sharerIds = sharingConns.map(c => c.sharerId);
    const sharedContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(inArray(contacts.parentUserId, sharerIds));
    sharedIds = sharedContacts.map(c => c.id);
  }

  return Array.from(new Set([...myIds, ...sharedIds]));
}

// ─── 核心：一条 SQL 同时聚合四个时间段的活跃数 ───────────────────────────────
async function getAllActiveStatsBatch(
  userId: number,
): Promise<{ todayActive: number; weeklyActive: number; monthlyActive: number; yearlyActive: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const visibleContactIds = await getAllVisibleContactIds(userId);
  if (visibleContactIds.length === 0) {
    return { todayActive: 0, weeklyActive: 0, monthlyActive: 0, yearlyActive: 0 };
  }

  const todayStr  = toMySQLDatetime(getBeijingTodayStart());
  const weekStr   = toMySQLDatetime(getBeijingThisWeekStart());
  const monthStr  = toMySQLDatetime(getBeijingThisMonthStart());
  const yearStr   = toMySQLDatetime(getBeijingThisYearStart());

  // ★ 一条 SQL：按 contactId 分组，用 CASE WHEN 同时标记四个时间段 ★
  const rows = await db
    .select({
      contactId: contactInteractions.contactId,
      isToday:   sql<number>`MAX(CASE WHEN ${contactInteractions.interactionDate} >= ${todayStr}  THEN 1 ELSE 0 END)`,
      isWeek:    sql<number>`MAX(CASE WHEN ${contactInteractions.interactionDate} >= ${weekStr}   THEN 1 ELSE 0 END)`,
      isMonth:   sql<number>`MAX(CASE WHEN ${contactInteractions.interactionDate} >= ${monthStr}  THEN 1 ELSE 0 END)`,
      isYear:    sql<number>`MAX(CASE WHEN ${contactInteractions.interactionDate} >= ${yearStr}   THEN 1 ELSE 0 END)`,
    })
    .from(contactInteractions)
    .where(
      sql`${contactInteractions.contactId} IN (${sql.join(visibleContactIds.map(id => sql`${id}`), sql`, `)})`,
    )
    .groupBy(contactInteractions.contactId);

  let todayActive = 0, weeklyActive = 0, monthlyActive = 0, yearlyActive = 0;
  for (const row of rows) {
    if (row.isToday  === 1) todayActive++;
    if (row.isWeek   === 1) weeklyActive++;
    if (row.isMonth  === 1) monthlyActive++;
    if (row.isYear   === 1) yearlyActive++;
  }

  return { todayActive, weeklyActive, monthlyActive, yearlyActive };
}

// ─── 对外导出（保持原有接口不变） ────────────────────────────────────────────

export async function getTodayActiveCount(userId: number): Promise<number> {
  const { todayActive } = await getAllActiveStatsBatch(userId);
  return todayActive;
}

export async function getWeeklyActiveCount(userId: number): Promise<number> {
  const { weeklyActive } = await getAllActiveStatsBatch(userId);
  return weeklyActive;
}

export async function getMonthlyActiveCount(userId: number): Promise<number> {
  const { monthlyActive } = await getAllActiveStatsBatch(userId);
  return monthlyActive;
}

export async function getYearlyActiveCount(userId: number): Promise<number> {
  const { yearlyActive } = await getAllActiveStatsBatch(userId);
  return yearlyActive;
}

/**
 * 一次性获取所有活跃统计数据（推荐使用此函数，避免重复查询）
 */
export async function getAllActiveStats(userId: number) {
  try {
    return await getAllActiveStatsBatch(userId);
  } catch (error) {
    console.error('[getAllActiveStats] 查询失败:', error);
    return { todayActive: 0, weeklyActive: 0, monthlyActive: 0, yearlyActive: 0 };
  }
}
