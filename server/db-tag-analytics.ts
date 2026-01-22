/**
 * 标签数据分析相关数据库查询函数
 */

import { getDb } from "./db";
import { 
  contactTags, 
  contactTagRelations, 
  personalContactTags,
  contacts,
  users
} from "../drizzle/schema";
import { eq, sql, desc, and, gte, count } from "drizzle-orm";

/**
 * 获取全局标签使用排行榜
 * @param parentUserId 用户ID
 * @param limit 返回数量限制
 */
export async function getGlobalTagRanking(parentUserId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  // 查询全局标签的使用次数（按人数统计）
  const result = await db
    .select({
      tagId: contactTagRelations.tagId,
      tagName: contactTags.name,
      tagColor: contactTags.color,
      usageCount: count(contactTagRelations.contactId).as('usage_count'),
    })
    .from(contactTagRelations)
    .leftJoin(contactTags, eq(contactTagRelations.tagId, contactTags.id))
    .leftJoin(contacts, eq(contactTagRelations.contactId, contacts.id))
    .groupBy(contactTagRelations.tagId, contactTags.name, contactTags.color)
    .orderBy(desc(sql`usage_count`))
    .limit(limit);

  return result.map(row => ({
    tagId: row.tagId,
    tagName: row.tagName || '未知标签',
    tagColor: row.tagColor || '#3b82f6',
    usageCount: Number(row.usageCount),
  }));
}

/**
 * 获取个人标签使用排行榜
 * @param parentUserId 用户ID
 * @param limit 返回数量限制
 */
export async function getPersonalTagRanking(parentUserId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  // 查询个人标签的使用情况（按标签名称分组统计）
  const result = await db
    .select({
      tagName: personalContactTags.name,
      tagColor: personalContactTags.color,
      usageCount: count(personalContactTags.id).as('usage_count'),
    })
    .from(personalContactTags)
    .leftJoin(contacts, eq(personalContactTags.contactId, contacts.id))
    .groupBy(personalContactTags.name, personalContactTags.color)
    .orderBy(desc(sql`usage_count`))
    .limit(limit);

  return result.map(row => ({
    tagName: row.tagName,
    tagColor: row.tagColor || '#8b5cf6',
    usageCount: Number(row.usageCount),
  }));
}

/**
 * 获取标签使用的用户分布
 * @param parentUserId 用户ID
 */
export async function getTagUserDistribution(parentUserId: number) {
  const db = await getDb();
  if (!db) return [];

  // 统计每个用户的标签使用情况
  const globalTagsByUser = await db
    .select({
      userId: contacts.parentUserId,
      userName: users.name,
      tagCount: count(contactTagRelations.id).as('tag_count'),
    })
    .from(contactTagRelations)
    .leftJoin(contacts, eq(contactTagRelations.contactId, contacts.id))
    .leftJoin(users, eq(contacts.parentUserId, users.id))
    .groupBy(contacts.parentUserId, users.name)
    .orderBy(desc(sql`tag_count`));

  const personalTagsByUser = await db
    .select({
      userId: personalContactTags.parentUserId,
      userName: users.name,
      tagCount: count(personalContactTags.id).as('tag_count'),
    })
    .from(personalContactTags)
    .leftJoin(users, eq(personalContactTags.parentUserId, users.id))
    .groupBy(personalContactTags.parentUserId, users.name)
    .orderBy(desc(sql`tag_count`));

  // 合并全局标签和个人标签的统计
  const userMap = new Map<number, { userId: number; userName: string; globalTags: number; personalTags: number }>();

  globalTagsByUser.forEach(row => {
    if (row.userId) {
      userMap.set(row.userId, {
        userId: row.userId,
        userName: row.userName || '未知用户',
        globalTags: Number(row.tagCount),
        personalTags: 0,
      });
    }
  });

  personalTagsByUser.forEach(row => {
    if (row.userId) {
      const existing = userMap.get(row.userId);
      if (existing) {
        existing.personalTags = Number(row.tagCount);
      } else {
        userMap.set(row.userId, {
          userId: row.userId,
          userName: row.userName || '未知用户',
          globalTags: 0,
          personalTags: Number(row.tagCount),
        });
      }
    }
  });

  return Array.from(userMap.values()).map(user => ({
    ...user,
    totalTags: user.globalTags + user.personalTags,
  })).sort((a, b) => b.totalTags - a.totalTags);
}

/**
 * 获取标签颜色分布统计
 */
export async function getTagColorDistribution() {
  const db = await getDb();
  if (!db) return [];

  // 全局标签颜色分布
  const globalColors = await db
    .select({
      color: contactTags.color,
      count: count(contactTags.id).as('count'),
    })
    .from(contactTags)
    .groupBy(contactTags.color)
    .orderBy(desc(sql`count`));

  // 个人标签颜色分布
  const personalColors = await db
    .select({
      color: personalContactTags.color,
      count: count(personalContactTags.id).as('count'),
    })
    .from(personalContactTags)
    .groupBy(personalContactTags.color)
    .orderBy(desc(sql`count`));

  // 合并颜色统计
  const colorMap = new Map<string, { color: string; globalCount: number; personalCount: number }>();

  globalColors.forEach(row => {
    colorMap.set(row.color || '#3b82f6', {
      color: row.color || '#3b82f6',
      globalCount: Number(row.count),
      personalCount: 0,
    });
  });

  personalColors.forEach(row => {
    const color = row.color || '#8b5cf6';
    const existing = colorMap.get(color);
    if (existing) {
      existing.personalCount = Number(row.count);
    } else {
      colorMap.set(color, {
        color,
        globalCount: 0,
        personalCount: Number(row.count),
      });
    }
  });

  return Array.from(colorMap.values()).map(item => ({
    ...item,
    totalCount: item.globalCount + item.personalCount,
  })).sort((a, b) => b.totalCount - a.totalCount);
}

/**
 * 获取标签总体统计数据
 */
export async function getTagOverallStats() {
  const db = await getDb();
  if (!db) return null;

  // 全局标签统计
  const [globalTagsCount] = await db
    .select({ count: count(contactTags.id) })
    .from(contactTags);

  const [globalTagUsageCount] = await db
    .select({ count: count(contactTagRelations.id) })
    .from(contactTagRelations);

  // 个人标签统计
  const [personalTagsCount] = await db
    .select({ count: count(personalContactTags.id) })
    .from(personalContactTags);

  // 有标签的联系人数量
  const [contactsWithGlobalTags] = await db
    .select({ count: count(sql`DISTINCT ${contactTagRelations.contactId}`) })
    .from(contactTagRelations);

  const [contactsWithPersonalTags] = await db
    .select({ count: count(sql`DISTINCT ${personalContactTags.contactId}`) })
    .from(personalContactTags);

  return {
    globalTags: {
      totalTags: Number(globalTagsCount?.count || 0),
      totalUsage: Number(globalTagUsageCount?.count || 0),
      avgUsagePerTag: Number(globalTagsCount?.count || 0) > 0
        ? Number(globalTagUsageCount?.count || 0) / Number(globalTagsCount?.count || 0)
        : 0,
    },
    personalTags: {
      totalTags: Number(personalTagsCount?.count || 0),
    },
    contacts: {
      withGlobalTags: Number(contactsWithGlobalTags?.count || 0),
      withPersonalTags: Number(contactsWithPersonalTags?.count || 0),
    },
    overall: {
      totalTags: Number(globalTagsCount?.count || 0) + Number(personalTagsCount?.count || 0),
      totalUsage: Number(globalTagUsageCount?.count || 0) + Number(personalTagsCount?.count || 0),
    },
  };
}

/**
 * 获取最近创建的标签
 * @param limit 返回数量限制
 */
export async function getRecentTags(limit: number = 20) {
  const db = await getDb();
  if (!db) return [];

  // 最近创建的全局标签
  const recentGlobalTags = await db
    .select({
      id: contactTags.id,
      name: contactTags.name,
      color: contactTags.color,
      type: sql<string>`'global'`.as('type'),
      createdAt: contactTags.createdAt,
    })
    .from(contactTags)
    .orderBy(desc(contactTags.createdAt))
    .limit(limit);

  // 最近创建的个人标签
  const recentPersonalTags = await db
    .select({
      id: personalContactTags.id,
      name: personalContactTags.name,
      color: personalContactTags.color,
      type: sql<string>`'personal'`.as('type'),
      createdAt: personalContactTags.createdAt,
    })
    .from(personalContactTags)
    .orderBy(desc(personalContactTags.createdAt))
    .limit(limit);

  // 合并并按时间排序
  const allTags = [...recentGlobalTags, ...recentPersonalTags]
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    })
    .slice(0, limit);

  return allTags;
}
