/**
 * 标签数据分析相关数据库查询函数
 */

import { getDb } from "./db";
import { 
  contactTags, 
  contactTagRelations, 
  personalContactTags,
  contacts,
  users,
  contactSharingConnections
} from "../drizzle/schema";
import { eq, sql, desc, and, gte, count, inArray, or } from "drizzle-orm";

export type DataScope = 'all' | 'mine' | 'shared' | 'global';

/**
 * 获取可见联系人ID列表
 * @param parentUserId 用户ID
 * @param scope 数据范围
 */
async function getVisibleContactIds(parentUserId: number, scope: DataScope): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  if (scope === 'global') {
    // 全局：所有联系人
    const allContacts = await db
      .select({ id: contacts.id })
      .from(contacts);
    return allContacts.map(c => c.id);
  }

  // 获取自己的联系人
  const ownContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.parentUserId, parentUserId));
  const ownContactIds = ownContacts.map(c => c.id);

  if (scope === 'mine') {
    // 只看自己
    return ownContactIds;
  }

  // 获取共享给我的联系人
  const sharingConnections = await db
    .select()
    .from(contactSharingConnections)
    .where(
      and(
        eq(contactSharingConnections.receiverId, parentUserId),
        eq(contactSharingConnections.status, 'active')
      )
    );

  const sharedContactIds: number[] = [];
  for (const conn of sharingConnections) {
    const sharerContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.parentUserId, conn.sharerId));
    sharedContactIds.push(...sharerContacts.map(c => c.id));
  }

  if (scope === 'shared') {
    // 只看共享
    return sharedContactIds;
  }

  // scope === 'all': 自己 + 共享
  return Array.from(new Set([...ownContactIds, ...sharedContactIds]));
}

/**
 * 获取可见用户ID列表
 * @param parentUserId 用户ID
 * @param scope 数据范围
 */
async function getVisibleUserIds(parentUserId: number, scope: DataScope): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  if (scope === 'global') {
    // 全局：所有用户
    const allUsers = await db
      .select({ id: users.id })
      .from(users);
    return allUsers.map(u => u.id);
  }

  if (scope === 'mine') {
    // 只看自己
    return [parentUserId];
  }

  // 获取共享给我的用户
  const sharingConnections = await db
    .select()
    .from(contactSharingConnections)
    .where(
      and(
        eq(contactSharingConnections.receiverId, parentUserId),
        eq(contactSharingConnections.status, 'active')
      )
    );
  const sharedUserIds = sharingConnections.map(conn => conn.sharerId);

  if (scope === 'shared') {
    // 只看共享
    return sharedUserIds;
  }

  // scope === 'all': 自己 + 共享
  return Array.from(new Set([parentUserId, ...sharedUserIds]));
}

/**
 * 获取全局标签使用排行榜
 * @param parentUserId 用户ID
 * @param scope 数据范围
 * @param limit 返回数量限制
 */
export async function getGlobalTagRanking(
  parentUserId: number,
  scope: DataScope = 'all',
  limit: number = 50
) {
  const db = await getDb();
  if (!db) return [];

  const visibleContactIds = await getVisibleContactIds(parentUserId, scope);
  if (visibleContactIds.length === 0) return [];

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
    .where(inArray(contactTagRelations.contactId, visibleContactIds))
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
 * @param scope 数据范围
 * @param limit 返回数量限制
 */
export async function getPersonalTagRanking(
  parentUserId: number,
  scope: DataScope = 'all',
  limit: number = 50
) {
  const db = await getDb();
  if (!db) return [];

  const visibleUserIds = await getVisibleUserIds(parentUserId, scope);
  if (visibleUserIds.length === 0) return [];

  // 查询个人标签的使用情况（按标签名称分组统计）
  const result = await db
    .select({
      tagName: personalContactTags.name,
      tagColor: personalContactTags.color,
      usageCount: count(personalContactTags.id).as('usage_count'),
    })
    .from(personalContactTags)
    .where(inArray(personalContactTags.parentUserId, visibleUserIds))
    .groupBy(personalContactTags.name, personalContactTags.color)
    .orderBy(desc(sql`usage_count`))
    .limit(limit);

  return result.map(row => ({
    tagName: row.tagName,
    tagColor: row.tagColor || '#A80000',
    usageCount: Number(row.usageCount),
  }));
}

/**
 * 获取标签使用的用户分布
 * @param parentUserId 用户ID
 * @param scope 数据范围
 */
export async function getTagUserDistribution(
  parentUserId: number,
  scope: DataScope = 'all'
) {
  const db = await getDb();
  if (!db) return [];

  const visibleUserIds = await getVisibleUserIds(parentUserId, scope);
  if (visibleUserIds.length === 0) return [];

  const visibleContactIds = await getVisibleContactIds(parentUserId, scope);
  if (visibleContactIds.length === 0) return [];

  // 统计每个用户的全局标签使用情况
  const globalTagsByUser = await db
    .select({
      userId: contacts.parentUserId,
      userName: users.name,
      tagCount: count(contactTagRelations.id).as('tag_count'),
    })
    .from(contactTagRelations)
    .leftJoin(contacts, eq(contactTagRelations.contactId, contacts.id))
    .leftJoin(users, eq(contacts.parentUserId, users.id))
    .where(
      and(
        inArray(contactTagRelations.contactId, visibleContactIds),
        inArray(contacts.parentUserId, visibleUserIds)
      )
    )
    .groupBy(contacts.parentUserId, users.name)
    .orderBy(desc(sql`tag_count`));

  // 统计每个用户的个人标签使用情况
  const personalTagsByUser = await db
    .select({
      userId: personalContactTags.parentUserId,
      userName: users.name,
      tagCount: count(personalContactTags.id).as('tag_count'),
    })
    .from(personalContactTags)
    .leftJoin(users, eq(personalContactTags.parentUserId, users.id))
    .where(inArray(personalContactTags.parentUserId, visibleUserIds))
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
 * 获取标签总体统计数据
 * @param parentUserId 用户ID
 * @param scope 数据范围
 */
export async function getTagOverallStats(
  parentUserId: number,
  scope: DataScope = 'all'
) {
  const db = await getDb();
  if (!db) return null;

  const visibleContactIds = await getVisibleContactIds(parentUserId, scope);
  const visibleUserIds = await getVisibleUserIds(parentUserId, scope);

  // 全局标签统计
  let globalTagsCount, globalTagUsageCount;
  
  if (scope === 'global') {
    // 全局模式：统计所有标签
    [globalTagsCount] = await db
      .select({ count: count(contactTags.id) })
      .from(contactTags);

    [globalTagUsageCount] = await db
      .select({ count: count(contactTagRelations.id) })
      .from(contactTagRelations);
  } else {
    // 其他模式：只统计可见范围内的标签
    if (visibleContactIds.length === 0) {
      globalTagsCount = { count: 0 };
      globalTagUsageCount = { count: 0 };
    } else {
      // 统计可见联系人使用的不同标签数量
      [globalTagsCount] = await db
        .select({ count: count(sql`DISTINCT ${contactTagRelations.tagId}`) })
        .from(contactTagRelations)
        .where(inArray(contactTagRelations.contactId, visibleContactIds));

      [globalTagUsageCount] = await db
        .select({ count: count(contactTagRelations.id) })
        .from(contactTagRelations)
        .where(inArray(contactTagRelations.contactId, visibleContactIds));
    }
  }

  // 个人标签统计
  let personalTagsCount;
  if (visibleUserIds.length === 0) {
    personalTagsCount = { count: 0 };
  } else {
    [personalTagsCount] = await db
      .select({ count: count(personalContactTags.id) })
      .from(personalContactTags)
      .where(inArray(personalContactTags.parentUserId, visibleUserIds));
  }

  // 有标签的联系人数量
  let contactsWithGlobalTags, contactsWithPersonalTags;
  if (visibleContactIds.length === 0) {
    contactsWithGlobalTags = { count: 0 };
    contactsWithPersonalTags = { count: 0 };
  } else {
    [contactsWithGlobalTags] = await db
      .select({ count: count(sql`DISTINCT ${contactTagRelations.contactId}`) })
      .from(contactTagRelations)
      .where(inArray(contactTagRelations.contactId, visibleContactIds));

    [contactsWithPersonalTags] = await db
      .select({ count: count(sql`DISTINCT ${personalContactTags.contactId}`) })
      .from(personalContactTags)
      .where(
        and(
          inArray(personalContactTags.parentUserId, visibleUserIds),
          inArray(personalContactTags.contactId, visibleContactIds)
        )
      );
  }

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
 * @param parentUserId 用户ID
 * @param scope 数据范围
 * @param limit 返回数量限制
 */
export async function getRecentTags(
  parentUserId: number,
  scope: DataScope = 'all',
  limit: number = 20
) {
  const db = await getDb();
  if (!db) return [];

  const visibleUserIds = await getVisibleUserIds(parentUserId, scope);

  let recentGlobalTags: any[] = [];
  let recentPersonalTags: any[] = [];

  if (scope === 'global') {
    // 全局模式：所有标签
    recentGlobalTags = await db
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

    recentPersonalTags = await db
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
  } else {
    // 其他模式：只看可见用户的标签
    if (visibleUserIds.length === 0) {
      recentGlobalTags = [];
      recentPersonalTags = [];
    } else {
      // 全局标签：通过联系人关联
      const visibleContactIds = await getVisibleContactIds(parentUserId, scope);
      if (visibleContactIds.length > 0) {
        recentGlobalTags = await db
          .select({
            id: contactTags.id,
            name: contactTags.name,
            color: contactTags.color,
            type: sql<string>`'global'`.as('type'),
            createdAt: contactTags.createdAt,
          })
          .from(contactTags)
          .leftJoin(contactTagRelations, eq(contactTags.id, contactTagRelations.tagId))
          .where(inArray(contactTagRelations.contactId, visibleContactIds))
          .groupBy(contactTags.id, contactTags.name, contactTags.color, contactTags.createdAt)
          .orderBy(desc(contactTags.createdAt))
          .limit(limit);
      } else {
        recentGlobalTags = [];
      }

      recentPersonalTags = await db
        .select({
          id: personalContactTags.id,
          name: personalContactTags.name,
          color: personalContactTags.color,
          type: sql<string>`'personal'`.as('type'),
          createdAt: personalContactTags.createdAt,
        })
        .from(personalContactTags)
        .where(inArray(personalContactTags.parentUserId, visibleUserIds))
        .orderBy(desc(personalContactTags.createdAt))
        .limit(limit);
    }
  }

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
