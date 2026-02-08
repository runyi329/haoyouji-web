import { getDb } from "./db";
import {
  contacts, contactTags, contactTagRelations, contactInteractions, contactCustomFields, contactFieldValues, contactFieldCategories, reminders,
  personalContactTags, contactSharingConnections, ledgerRecords, ledgerMembers, users,
  InsertContact, InsertContactTag, InsertContactTagRelation, InsertContactInteraction, InsertContactCustomField,
  InsertPersonalContactTag,
} from "../drizzle/schema";
import { eq, and, like, or, desc, sql, gte, lt, isNotNull, isNull, ne, inArray } from "drizzle-orm";
import { getBeijingThisWeekStart, getBeijingThisMonthStart, getBeijingThisYearStart, getBeijingTodayStart, getBeijingTodayEnd } from "../shared/timezone";
import { getAllActiveStats } from "./db-contacts-active-stats";
import { getReferrerStats } from "./db-referrer-stats";

// ==================== 工具函数 ====================

// Promise 缓存，避免并发请求重复查询
const visibleContactIdsPromiseCache = new Map<number, { promise: Promise<number[]>, timestamp: number }>();
const contactStatsPromiseCache = new Map<number, { promise: Promise<any>, timestamp: number }>();
const CACHE_TTL = 0; // 禁用缓存onst contactCountsCache = new Map<number, { data: { total: number, mine: number, shared: number }, timestamp: number }>();

/**
 * 轻量级获取联系人数量统计（全部、我的、共享）
 * 不需要获取所有联系人 ID，只进行 COUNT 查询
 */
export async function getContactCounts(parentUserId: number): Promise<{ total: number, mine: number, shared: number }> {
  // 缓存已禁用
  
  console.log('[getContactCounts] 开始查询，用户ID:', parentUserId);
  
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 查询我的联系人数量
  const mineResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(eq(contacts.parentUserId, parentUserId));
  const mine = mineResult[0]?.count || 0;
  
  // 2. 查询共享给我的联系人数量
  const sharingConnections = await db
    .select({ sharerId: contactSharingConnections.sharerId })
    .from(contactSharingConnections)
    .where(
      and(
        eq(contactSharingConnections.receiverId, parentUserId),
        eq(contactSharingConnections.status, 'active')
      )
    );
  
  let shared = 0;
  if (sharingConnections.length > 0) {
    const sharerIds = sharingConnections.map(conn => conn.sharerId);
    const sharedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(contacts)
      .where(inArray(contacts.parentUserId, sharerIds));
    shared = sharedResult[0]?.count || 0;
  }
  
  const total = mine + shared;
  const result = { total, mine, shared };
  
  console.log('[getContactCounts] 查询结果:', result);
  
  // 缓存已禁用
  
  return result;
}

/**
 * 获取用户所有可见的人脉ID列表（包括自己的 + 共享给我的）
 * @param parentUserId 用户ID
 * @returns 人脉ID数组
 */
async function getAllVisibleContactIds(parentUserId: number): Promise<number[]> {
  // 缓存已禁用
  
  console.log('[getAllVisibleContactIds] 开始获取可见联系人ID，用户ID:', parentUserId);
  
  // 创建查询 Promise 并立即缓存
  const queryPromise = (async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    if (!db) return [];
  
  // 获取自己的人脉ID
  const ownContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.parentUserId, parentUserId));
  
  const ownContactIds = ownContacts.map(c => c.id);
  console.log('[getAllVisibleContactIds] 自己的联系人数量:', ownContactIds.length);
  
  // 获取共享给我的人脉ID
  const { contactSharingConnections } = await import('../drizzle/schema');
  const sharingConnections = await db
    .select({ sharerId: contactSharingConnections.sharerId })
    .from(contactSharingConnections)
    .where(
      and(
        eq(contactSharingConnections.receiverId, parentUserId),
        eq(contactSharingConnections.status, 'active')
      )
    );
  console.log('[getAllVisibleContactIds] 找到的共享连接数:', sharingConnections.length);
  console.log('[getAllVisibleContactIds] 共享连接详情:', sharingConnections);
  
  // 获取所有分享者的人脉ID（使用单次 IN 查询代替多次串行查询）
  let sharedContactIds: number[] = [];
  const sharerIds = sharingConnections.map(conn => conn.sharerId);
  
  if (sharerIds.length > 0) {
    const sharerContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(inArray(contacts.parentUserId, sharerIds));
    sharedContactIds = sharerContacts.map(c => c.id);
    console.log(`[getAllVisibleContactIds] 一次性查询 ${sharerIds.length} 个分享者的联系人，共 ${sharedContactIds.length} 个`);
  }
  
    // 合并并去重
    console.log('[getAllVisibleContactIds] 共享联系人总数:', sharedContactIds.length);
    const result = Array.from(new Set([...ownContactIds, ...sharedContactIds]));
    console.log('[getAllVisibleContactIds] 最终可见联系人总数:', result.length);
    
    return result;
  })();
  
  // 立即保存 Promise 到缓存，并发请求会共享同一个 Promise
  visibleContactIdsPromiseCache.set(parentUserId, { promise: queryPromise, timestamp: Date.now() });
  
  return queryPromise;
}

/**
 * 获取北京时间今天的开始和结束时间戳（毫秒）
 * @returns { startOfDay, endOfDay }
 */
function getTodayRange() {
  // 获取当前 UTC 时间戳
  const now = new Date();
  const utcTimestamp = now.getTime();
  
  // 北京时间是 UTC+8
  const beijingOffset = 8 * 60 * 60 * 1000;
  
  // 转换为北京时间戳
  const beijingTimestamp = utcTimestamp + beijingOffset;
  
  // 计算北京时间的今天开始时刻（毫秒）
  // 方法：将北京时间戳除以一天的毫秒数，然后取整数部分，再乘以一天的毫秒数
  const oneDayMs = 24 * 60 * 60 * 1000;
  const beijingStartOfDay = Math.floor(beijingTimestamp / oneDayMs) * oneDayMs;
  
  // 北京时间的今天结束时刻（毫秒）
  const beijingEndOfDay = beijingStartOfDay + oneDayMs - 1;
  
  // 转换回 UTC 时间戳
  return {
    startOfDay: new Date(beijingStartOfDay - beijingOffset),
    endOfDay: new Date(beijingEndOfDay - beijingOffset),
  };
}

/**
 * 按照北京时间的日期差计算天数
 * @param startTimestamp 开始时间戳（毫秒）
 * @param endTimestamp 结束时间戳（毫秒）
 * @returns 天数差
 */
function calculateDaysDifference(startTimestamp: number, endTimestamp: number): number {
  // 转换为北京时间 (UTC+8)
  const beijingOffset = 8 * 60 * 60 * 1000;
  
  // 获取开始日期的开始时刻（00:00:00）
  const startDate = new Date(startTimestamp + beijingOffset);
  startDate.setUTCHours(0, 0, 0, 0);
  
  // 获取结束日期的开始时刻（00:00:00）
  const endDate = new Date(endTimestamp + beijingOffset);
  endDate.setUTCHours(0, 0, 0, 0);
  
  // 计算日期差
  const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  return daysDiff;
}

// ==================== 人脉管理 ====================

/**
 * 创建人脉
 */
export async function createContact(data: InsertContact) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(contacts).values(data);
  return result[0].insertId;
}

/**
 * 获取家长的所有人脉列表
 */
export async function getContactsByParent(parentUserId: number, searchQuery?: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  let baseContacts: any[];
  
  // 如果没有搜索关键词，直接返回所有人脉
  if (!searchQuery) {
    baseContacts = await db.select().from(contacts)
      .where(eq(contacts.parentUserId, parentUserId))
      .orderBy(desc(contacts.updatedAt));
  } else {
    // 有搜索关键词时，同时搜索基本字段和自定义字段
    const searchPattern = `%${searchQuery}%`;
    
    // 搜索基本字段：姓名、称谓、职业、电话
    const basicFieldsContacts = await db.select().from(contacts)
      .where(
        and(
          eq(contacts.parentUserId, parentUserId),
          or(
            like(contacts.name, searchPattern),
            like(contacts.title, searchPattern),
            like(contacts.occupation, searchPattern),
            like(contacts.phone, searchPattern)
          )
        )
      )
      .orderBy(desc(contacts.updatedAt));
    
    // 搜索全局字段值（公司、职位等）
    const fieldValuesContacts = await db.select({
      id: contacts.id,
      parentUserId: contacts.parentUserId,
      name: contacts.name,
      title: contacts.title,
      gender: contacts.gender,
      birthDate: contacts.birthDate,
      occupation: contacts.occupation,
      address: contacts.address,
      wechat: contacts.wechat,
      phone: contacts.phone,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
    })
    .from(contacts)
    .innerJoin(contactFieldValues, eq(contactFieldValues.contactId, contacts.id))
    .where(
      and(
        eq(contacts.parentUserId, parentUserId),
        like(contactFieldValues.value, searchPattern)
      )
    )
    .orderBy(desc(contacts.updatedAt));
    
    // 合并结果并去重
    const allContacts = [...basicFieldsContacts, ...fieldValuesContacts];
    baseContacts = Array.from(
      new Map(allContacts.map(c => [c.id, c])).values()
    );
    
    // 按更新时间排序
    baseContacts.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }
  
  // 为每个人脉添加上次联络日期和距今天数
  const contactsWithInteractionInfo = await Promise.all(
    baseContacts.map(async (contact) => {
      const lastInteraction = await getLastInteractionDate(contact.id);
      const daysSinceLastInteraction = lastInteraction 
        ? calculateDaysDifference(lastInteraction, Date.now())
        : null;
      
      return {
        ...contact,
        lastInteractionDate: lastInteraction,
        daysSinceLastInteraction,
      };
    })
  );
  
  return contactsWithInteractionInfo;
}

/**
 * 获取单个人脉详情
 */
export async function getContactById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  // 获取基本信息
  const result = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (result.length === 0) return null;
  
  const contact = result[0];
  
  // 获取全局字段值（公司、职位等）
  const fieldValues = await db.select().from(contactFieldValues).where(eq(contactFieldValues.contactId, id));
  
  // 获取介绍人信息
  let referrer = null;
  if (contact.referrerId) {
    const referrerResult = await db.select({
      id: contacts.id,
      name: contacts.name,
      title: contacts.title,
    }).from(contacts).where(eq(contacts.id, contact.referrerId)).limit(1);
    if (referrerResult.length > 0) {
      referrer = referrerResult[0];
    }
  }
  
  return {
    ...contact,
    fieldValues,
    referrer,
  };
}

/**
 * 更新人脉信息
 */
export async function updateContact(id: number, data: Partial<InsertContact>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(contacts).set(data).where(eq(contacts.id, id));
}

/**
 * 删除人脉
 */
export async function deleteContact(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  // 删除相关的标签关联、联络记录和自定义字段
  await db.delete(contactTagRelations).where(eq(contactTagRelations.contactId, id));
  await db.delete(contactInteractions).where(eq(contactInteractions.contactId, id));
  await db.delete(contactCustomFields).where(eq(contactCustomFields.contactId, id));
  
  // 删除人脉本身
  await db.delete(contacts).where(eq(contacts.id, id));
}

// ==================== 标签管理 ====================

/**
 * 获取所有标签（用户自定义），并统计每个标签的人脉数量
 */
export async function getContactTags(parentUserId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  // 只获取用户自定义标签，按sort_order排序
  const tags = await db.select().from(contactTags)
    .where(eq(contactTags.parentUserId, parentUserId))
    .orderBy(contactTags.sortOrder, contactTags.id);
  
  // 为每个标签统计人脉数量
  const tagsWithCount = await Promise.all(
    tags.map(async (tag) => {
      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(contactTagRelations)
        .innerJoin(contacts, eq(contactTagRelations.contactId, contacts.id))
        .where(
          and(
            eq(contactTagRelations.tagId, tag.id),
            eq(contacts.parentUserId, parentUserId)
          )
        );
      
      return {
        ...tag,
        contactCount: count[0]?.count || 0,
      };
    })
  );
  
  return tagsWithCount;
}

/**
 * 搜索标签（模糊搜索标签名称）
 * 包括自己的标签和共享人脉的标签
 */
export async function searchTags(parentUserId: number, keyword: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  // 1. 获取自己的标签
  const ownTagsQuery = db.select({
    id: contactTags.id,
    name: contactTags.name,
    color: contactTags.color,
    isPreset: contactTags.isPreset,
    parentUserId: contactTags.parentUserId,
  }).from(contactTags)
    .where(
      and(
        eq(contactTags.parentUserId, parentUserId),
        keyword ? like(contactTags.name, `%${keyword}%`) : sql`1=1`
      )
    );
  
  const ownTags = await ownTagsQuery;
  
  // 2. 获取共享给自己的人脉的标签
  const sharingConnections = await db.select({ sharerId: contactSharingConnections.sharerId })
    .from(contactSharingConnections)
    .where(and(
      eq(contactSharingConnections.receiverId, parentUserId),
      eq(contactSharingConnections.status, 'active')
    ));
  const sharerIds = sharingConnections.map(c => c.sharerId);
  
  let sharedTags: any[] = [];
  if (sharerIds.length > 0) {
    const sharedTagsQuery = db.select({
      id: contactTags.id,
      name: contactTags.name,
      color: contactTags.color,
      isPreset: contactTags.isPreset,
      parentUserId: contactTags.parentUserId,
    }).from(contactTags)
      .where(
        and(
          inArray(contactTags.parentUserId, sharerIds),
          keyword ? like(contactTags.name, `%${keyword}%`) : sql`1=1`
        )
      );
    sharedTags = await sharedTagsQuery;
  }
  
  // 3. 合并去重（按tagId去重）
  const allTags = [...ownTags, ...sharedTags];
  const uniqueTagsMap = new Map();
  for (const tag of allTags) {
    if (!uniqueTagsMap.has(tag.id)) {
      uniqueTagsMap.set(tag.id, tag);
    }
  }
  const uniqueTags = Array.from(uniqueTagsMap.values());
  
  // 4. 为每个标签统计人脉数量（包括自己的和共享的人脉）
  const tagsWithCount = await Promise.all(
    uniqueTags.map(async (tag) => {
      // 统计自己的人脉
      const ownCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(contactTagRelations)
        .innerJoin(contacts, eq(contactTagRelations.contactId, contacts.id))
        .where(
          and(
            eq(contactTagRelations.tagId, tag.id),
            eq(contacts.parentUserId, parentUserId)
          )
        );
      
      // 统计共享的人脉
      let sharedCount = 0;
      if (sharerIds.length > 0) {
        const sharedCountResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(contactTagRelations)
          .innerJoin(contacts, eq(contactTagRelations.contactId, contacts.id))
          .where(
            and(
              eq(contactTagRelations.tagId, tag.id),
              inArray(contacts.parentUserId, sharerIds)
            )
          );
        sharedCount = sharedCountResult[0]?.count || 0;
      }
      
      return {
        ...tag,
        contactCount: (ownCount[0]?.count || 0) + sharedCount,
      };
    })
  );
  
  // 5. 按人脉数量降序排序
  return tagsWithCount.sort((a, b) => b.contactCount - a.contactCount);
}

/**
 * 创建自定义标签
 */
export async function createContactTag(data: InsertContactTag) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(contactTags).values(data);
  return result[0].insertId;
}

/**
 * 编辑标签
 */
export async function updateContactTag(
  id: number,
  parentUserId: number,
  data: { name?: string; color?: string }
) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  // 只能编辑自己的标签
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.color !== undefined) updateData.color = data.color;
  
  if (Object.keys(updateData).length > 0) {
    await db.update(contactTags)
      .set(updateData)
      .where(
        and(
          eq(contactTags.id, id),
          eq(contactTags.parentUserId, parentUserId)
        )
      );
  }
}

/**
 * 删除自定义标签
 */
export async function deleteContactTag(id: number, parentUserId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  // 只能删除自己的标签
  await db.delete(contactTags).where(
    and(
      eq(contactTags.id, id),
      eq(contactTags.parentUserId, parentUserId)
    )
  );
  
  // 删除相关的标签关联
  await db.delete(contactTagRelations).where(eq(contactTagRelations.tagId, id));
}

/**
 * 批量更新标签排序
 */
export async function updateTagsOrder(
  parentUserId: number,
  tagOrders: Array<{ id: number; sortOrder: number }>
) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  // 为每个标签更新sortOrder
  await Promise.all(
    tagOrders.map(async ({ id, sortOrder }) => {
      await db.update(contactTags)
        .set({ sortOrder })
        .where(
          and(
            eq(contactTags.id, id),
            eq(contactTags.parentUserId, parentUserId)
          )
        );
    })
  );
}

/**
 * 获取人脉的标签列表
 */
export async function getContactTagsByContactId(contactId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  const result = await db
    .select({
      id: contactTags.id,
      name: contactTags.name,
      color: contactTags.color,
      isPreset: contactTags.isPreset,
    })
    .from(contactTagRelations)
    .innerJoin(contactTags, eq(contactTagRelations.tagId, contactTags.id))
    .where(eq(contactTagRelations.contactId, contactId));
  
  return result;
}

/**
 * 为人脉添加标签
 */
export async function addTagToContact(contactId: number, tagId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  // 检查是否已存在
  const existing = await db
    .select()
    .from(contactTagRelations)
    .where(
      and(
        eq(contactTagRelations.contactId, contactId),
        eq(contactTagRelations.tagId, tagId)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    return existing[0].id;
  }
  
  const result = await db.insert(contactTagRelations).values({ contactId, tagId });
  return result[0].insertId;
}

/**
 * 移除人脉的标签
 */
export async function removeTagFromContact(contactId: number, tagId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.delete(contactTagRelations).where(
    and(
      eq(contactTagRelations.contactId, contactId),
      eq(contactTagRelations.tagId, tagId)
    )
  );
}

// ==================== 个人标签管理 ====================

/**
 * 获取人脉的个人标签列表
 */
export async function getPersonalTagsByContactId(contactId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return db
    .select()
    .from(personalContactTags)
    .where(eq(personalContactTags.contactId, contactId))
    .orderBy(desc(personalContactTags.createdAt));
}

/**
 * 创建个人标签
 */
export async function createPersonalTag(data: InsertPersonalContactTag) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(personalContactTags).values(data);
  return result[0].insertId;
}

/**
 * 更新个人标签
 */
export async function updatePersonalTag(
  id: number,
  parentUserId: number,
  data: { name?: string; color?: string }
) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.color !== undefined) updateData.color = data.color;
  
  if (Object.keys(updateData).length > 0) {
    await db.update(personalContactTags)
      .set(updateData)
      .where(
        and(
          eq(personalContactTags.id, id),
          eq(personalContactTags.parentUserId, parentUserId)
        )
      );
  }
}

/**
 * 删除个人标签
 */
export async function deletePersonalTag(id: number, parentUserId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.delete(personalContactTags).where(
    and(
      eq(personalContactTags.id, id),
      eq(personalContactTags.parentUserId, parentUserId)
    )
  );
}

// ==================== 联络记录 ====================

/**
 * 记录一次联络
 */
export async function createContactInteraction(data: InsertContactInteraction) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(contactInteractions).values(data);
  return result[0].insertId;
}

/**
 * 删除联络记录
 */
export async function deleteContactInteraction(interactionId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(contactInteractions).where(eq(contactInteractions.id, interactionId));
}

/**
 * 更新联络记录
 */
export async function updateContactInteraction(data: { id: number; interactionDate?: Date; note?: string }) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  const updateData: any = {};
  if (data.interactionDate !== undefined) {
    updateData.interactionDate = data.interactionDate;
  }
  if (data.note !== undefined) {
    updateData.note = data.note;
  }
  
  await db.update(contactInteractions)
    .set(updateData)
    .where(eq(contactInteractions.id, data.id));
}

/**
 * 检查今天是否已经记录过联络
 * @param contactId 人脉ID
 * @returns true 表示今天已记录，false 表示今天未记录
 */
export async function hasTodayInteraction(contactId: number): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  const { startOfDay, endOfDay } = getTodayRange();
  // interactionDate在数据库中存储为MySQL datetime格式：'YYYY-MM-DD HH:mm:ss'
  // 需要转换为该格式进行比较
  const formatMySQLDatetime = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };
  
  const startTimeStr = formatMySQLDatetime(startOfDay);
  const endTimeStr = formatMySQLDatetime(endOfDay);
  
  const result = await db
    .select()
    .from(contactInteractions)
    .where(
      and(
        eq(contactInteractions.contactId, contactId),
        gte(contactInteractions.interactionDate, startTimeStr),
        lt(contactInteractions.interactionDate, endTimeStr)
      )
    )
    .limit(1);
  
  return result.length > 0;
}

/**
 * 获取人脉的联络历史
 */
export async function getContactInteractions(contactId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return db
    .select()
    .from(contactInteractions)
    .where(eq(contactInteractions.contactId, contactId))
    .orderBy(desc(contactInteractions.interactionDate));
}

/**
 * 获取最后一次联络时间
 */
export async function getLastInteractionDate(contactId: number): Promise<number | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const result = await db
    .select()
    .from(contactInteractions)
    .where(eq(contactInteractions.contactId, contactId))
    .orderBy(desc(contactInteractions.interactionDate))
    .limit(1);
  
  if (result.length === 0) return null;
  
  // 将Date对象转换为时间戳（毫秒）
  const interactionDate = result[0].interactionDate;
  if (interactionDate instanceof Date) {
    return interactionDate.getTime();
  } else if (typeof interactionDate === 'string') {
    // 如果是字符串格式,转换为Date再获取时间戳
    return new Date(interactionDate).getTime();
  } else if (typeof interactionDate === 'number') {
    // 如果已经是时间戳,直接返回
    return interactionDate;
  }
  
  return null;
}

/**
 * 获取人脉的联络统计信息
 */
export async function getContactInteractionStats(contactId: number) {
  const db = await getDb();  
  if (!db) return null;

  // 获取人脉创建时间
  const contact = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  
  if (contact.length === 0) return null;
  const contactCreatedAt = contact[0].createdAt;

  // 获取所有联络记录
  const interactions = await db
    .select()
    .from(contactInteractions)
    .where(eq(contactInteractions.contactId, contactId))
    .orderBy(desc(contactInteractions.interactionDate));

  const totalInteractions = interactions.length;
  const lastInteractionDate = interactions.length > 0 ? interactions[0].interactionDate : null;
  
  // 计算距离上次联络天数
  const daysSinceLastInteraction = lastInteractionDate 
    ? calculateDaysDifference(new Date(lastInteractionDate).getTime(), Date.now())
    : null;

  // 计算平均联络间隔（从添加日起）
  const daysSinceCreated = Math.floor((Date.now() - new Date(contactCreatedAt).getTime()) / (1000 * 60 * 60 * 24));
  const averageInteractionInterval = totalInteractions > 0 
    ? Math.floor(daysSinceCreated / (totalInteractions + 1)) // +1 是因为包含创建时的"第一次联络"
    : daysSinceCreated;

  // 计算最长联络间隔
  let maxInteractionInterval = 0;
  if (interactions.length > 1) {
    for (let i = 0; i < interactions.length - 1; i++) {
      const interval = Math.floor(
        (new Date(interactions[i].interactionDate).getTime() - 
         new Date(interactions[i + 1].interactionDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      maxInteractionInterval = Math.max(maxInteractionInterval, interval);
    }
    // 还要考虑从创建到第一次联络的间隔
    const firstInterval = Math.floor(
      (new Date(interactions[interactions.length - 1].interactionDate).getTime() - 
       new Date(contactCreatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    maxInteractionInterval = Math.max(maxInteractionInterval, firstInterval);
  } else if (interactions.length === 1) {
    // 只有一次联络，最长间隔就是从创建到第一次联络
    maxInteractionInterval = Math.floor(
      (new Date(interactions[0].interactionDate).getTime() - 
       new Date(contactCreatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
  } else {
    // 没有联络记录，最长间隔就是从创建到现在
    maxInteractionInterval = daysSinceCreated;
  }

  // 计算本月联络次数
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyInteractions = interactions.filter(
    (interaction) => new Date(interaction.interactionDate) >= monthStart
  ).length;

  return {
    totalInteractions,
    lastInteractionDate,
    daysSinceLastInteraction,
    averageInteractionInterval,
    daysSinceAdded: daysSinceCreated,
    maxInteractionInterval,
    monthlyInteractions,
  };
}

// ==================== 自定义字段管理 ====================

/**
 * 添加自定义字段
 */
export async function addCustomField(data: InsertContactCustomField) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(contactCustomFields).values(data);
  return result[0].insertId;
}

/**
 * 获取人脉的所有自定义字段
 */
export async function getCustomFieldsByContactId(contactId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return db
    .select()
    .from(contactCustomFields)
    .where(eq(contactCustomFields.contactId, contactId));
}

/**
 * 更新自定义字段
 */
export async function updateCustomField(id: number, data: Partial<InsertContactCustomField>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(contactCustomFields).set(data).where(eq(contactCustomFields.id, id));
}

/**
 * 删除自定义字段
 */
export async function deleteCustomField(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(contactCustomFields).where(eq(contactCustomFields.id, id));
}

/**
 * 批量添加自定义字段
 */
export async function addCustomFields(contactId: number, fields: Array<{ fieldName: string; fieldValue: string }>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  if (fields.length === 0) return;
  
  const fieldsWithOrder = fields.map((field, index) => ({
    contactId,
    fieldName: field.fieldName,
    fieldValue: field.fieldValue,
    sortOrder: index,
  }));
  
  await db.insert(contactCustomFields).values(fieldsWithOrder);
}

/**
 * 获取累计联络次数（自己的 + 共享联系人的联络记录总数）
 */
export async function getTotalInteractionCount(parentUserId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 获取所有可见人脉ID（自己的 + 共享的）
  const visibleContactIds = await getAllVisibleContactIds(parentUserId);
  
  if (visibleContactIds.length === 0) {
    return 0;
  }
  
  // 统计所有可见联系人的互动记录总数
  const result = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(contactInteractions)
    .where(inArray(contactInteractions.contactId, visibleContactIds));
  
  return result[0]?.total || 0;
}

/**
 * 获取累计标签数量（全局标签使用次数 + 所有人脉的个人标签数）
 * 注意：统计的是标签使用次数，不是标签种类数
 * 例如："客户"标签被打给10个人脉，算作10次
 * 包含：自己的人脉标签 + 共享给自己的人脉标签
 */
export async function getTotalTagCount(parentUserId: number): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  // 1. 获取自己人脉的全局标签使用次数
  const ownGlobalTagsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(contactTagRelations)
    .innerJoin(contactTags, eq(contactTagRelations.tagId, contactTags.id))
    .where(eq(contactTags.parentUserId, parentUserId));
  const ownGlobalTagsCount = ownGlobalTagsResult[0]?.count || 0;
  
  // 2. 获取自己人脉的个人标签数量
  const ownPersonalTagsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(personalContactTags)
    .where(
      sql`${personalContactTags.contactId} IN (
        SELECT ${contacts.id} FROM ${contacts} 
        WHERE ${contacts.parentUserId} = ${parentUserId}
      )`
    );
  const ownPersonalTagsCount = ownPersonalTagsResult[0]?.count || 0;
  
  // 3. 获取分享给自己的人脉的全局标签数量
  const sharingConnections = await db.select({ sharerId: contactSharingConnections.sharerId })
    .from(contactSharingConnections)
    .where(and(
      eq(contactSharingConnections.receiverId, parentUserId),
      eq(contactSharingConnections.status, 'active')
    ));
  const sharerIds = sharingConnections.map(c => c.sharerId);
  
  let sharedGlobalTagsCount = 0;
  let sharedPersonalTagsCount = 0;
  
  if (sharerIds.length > 0) {
    // 3a. 共享人脉的全局标签
    const sharedGlobalTagsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(contactTagRelations)
      .innerJoin(contactTags, eq(contactTagRelations.tagId, contactTags.id))
      .where(inArray(contactTags.parentUserId, sharerIds));
    sharedGlobalTagsCount = sharedGlobalTagsResult[0]?.count || 0;
    
    // 3b. 共享人脉的个人标签
    const sharedPersonalTagsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(personalContactTags)
      .where(
        sql`${personalContactTags.contactId} IN (
          SELECT ${contacts.id} FROM ${contacts} 
          WHERE ${contacts.parentUserId} IN (${sql.join(sharerIds.map(id => sql`${id}`), sql`, `)})
        )`
      );
    sharedPersonalTagsCount = sharedPersonalTagsResult[0]?.count || 0;
  }
  
  return ownGlobalTagsCount + ownPersonalTagsCount + sharedGlobalTagsCount + sharedPersonalTagsCount;
}

/**
 * 获取账目总数（用户参与的所有账本的账目记录总数）
 */
export async function getTotalLedgerEntries(parentUserId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    // 先获取用户参与的所有账本ID
    const userLedgers = await db
      .select({ ledgerId: ledgerMembers.ledgerId })
      .from(ledgerMembers)
      .where(eq(ledgerMembers.userId, parentUserId));
    
    const ledgerIds = userLedgers.map(l => l.ledgerId);
    console.log('[getTotalLedgerEntries] 用户参与的账本IDs:', ledgerIds, '用户ID:', parentUserId);
    
    if (ledgerIds.length === 0) {
      return 0;
    }
    
    // 统计这些账本中的所有账目记录数
    const ledgerEntriesResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(ledgerRecords)
      .where(inArray(ledgerRecords.ledgerId, ledgerIds));
    
    const total = Number(ledgerEntriesResult[0]?.count || 0);
    console.log('[getTotalLedgerEntries] 账目总数:', total, '用户ID:', parentUserId);
    return total;
  } catch (error) {
    console.error('[getTotalLedgerEntries] 获取账目总数失败:', error);
    return 0;
  }
}

/**
 * 获取人脉统计数据
 */
export async function getContactStats(parentUserId: number) {
  // 缓存已禁用
  
  console.log('[getContactStats] 开始获取统计数据，用户ID:', parentUserId);
  
  // 创建查询 Promise 并立即缓存
  const queryPromise = (async () => {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return {
    totalContacts: 0,
    newThisWeek: 0,
    newThisMonth: 0,
    newThisYear: 0,
    needsContact: 0,
    tagDistribution: []
  };
  
  // 获取所有可见人脉ID（自己的 + 共享的）
  const visibleContactIds = await getAllVisibleContactIds(parentUserId);
  
  // 如果没有任何人脉，直接返回空统计
  if (visibleContactIds.length === 0) {
    return {
      totalContacts: 0,
      newThisWeek: 0,
      newThisMonth: 0,
      newThisYear: 0,
      needsContact: 0,
      weeklyActive: 0,
      monthlyActive: 0,
      yearlyActive: 0,
      blacklistCount: 0,
      todayActive: 0,
      dormantCount: 0,
      companyCount: 0,
      tagDistribution: []
    };
  }
  
  // 总人脉数（包括自己的 + 共享的）
  const totalContacts = visibleContactIds.length;
  
  // 计算本周开始时间（周一为一周开始，基于北京时间）
  const thisWeekStartTimestamp = getBeijingThisWeekStart();
  const thisWeekStart = new Date(thisWeekStartTimestamp);
  
  // 本周新增
  const newThisWeekResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(
      and(
        inArray(contacts.id, visibleContactIds),
        sql`${contacts.createdAt} >= ${thisWeekStart}`
      )
    );
  const newThisWeek = newThisWeekResult[0]?.count || 0;
  
  // 本月新增（基于北京时间）
  const thisMonthStartTimestamp = getBeijingThisMonthStart();
  const thisMonthStart = new Date(thisMonthStartTimestamp);
  
  const newThisMonthResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(
      and(
        inArray(contacts.id, visibleContactIds),
        sql`${contacts.createdAt} >= ${thisMonthStart}`
      )
    );
  const newThisMonth = newThisMonthResult[0]?.count || 0;
  
  // 本年新增（基于北京时间）
  const thisYearStartTimestamp = getBeijingThisYearStart();
  const thisYearStart = new Date(thisYearStartTimestamp);
  
  const newThisYearResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(
      and(
        inArray(contacts.id, visibleContactIds),
        sql`${contacts.createdAt} >= ${thisYearStart}`
      )
    );
  const newThisYear = newThisYearResult[0]?.count || 0;
  
  // 需要联络提醒（超过30天未联系）
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const allContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(inArray(contacts.id, visibleContactIds));
  
  let needsContact = 0;
  for (const contact of allContacts) {
    const lastInteraction = await getLastInteractionDate(contact.id);
    if (!lastInteraction || lastInteraction < thirtyDaysAgo) {
      needsContact++;
    }
  }
  
  // 标签分布（只统计自己的标签，不包括共享人脉的标签）
  const tagDistResult = await db
    .select({
      tagId: contactTags.id,
      tagName: contactTags.name,
      count: sql<number>`count(${contactTagRelations.contactId})`
    })
    .from(contactTags)
    .leftJoin(contactTagRelations, eq(contactTags.id, contactTagRelations.tagId))
    .leftJoin(contacts, 
      and(
        eq(contactTagRelations.contactId, contacts.id),
        eq(contacts.parentUserId, parentUserId)
      )
    )
    .where(
      eq(contactTags.parentUserId, parentUserId)
    )
    .groupBy(contactTags.id, contactTags.name);
  
  // 使用新的活跃统计模块（统计全部人脉：我的+共享）
  console.log('[获取活跃统计] 开始查询...');
  console.log('[获取活跃统计] 可见人脉总数:', visibleContactIds.length);
  const activeStats = await getAllActiveStats(parentUserId);
  console.log('[获取活跃统计] 结果:', activeStats);
  console.log('[获取活跃统计] 今年活跃:', activeStats.yearlyActive, '人（全部人脉）');
  
  const { todayActive, weeklyActive, monthlyActive, yearlyActive } = activeStats;
  
  // 拉黑名单（只统计个人的）
  const blacklistResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(
      and(
        eq(contacts.parentUserId, parentUserId),
        eq(contacts.isBlacklisted, true)
      )
    );
  const blacklistCount = blacklistResult[0]?.count || 0;
  
  // 休眠名单（180天未联络，只统计个人的）
  const oneEightyDaysAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);
  const ownContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.parentUserId, parentUserId));
  
  let dormantCount = 0;
  for (const contact of ownContacts) {
    const lastInteraction = await getLastInteractionDate(contact.id);
    if (!lastInteraction || lastInteraction < oneEightyDaysAgo) {
      dormantCount++;
    }
  }
  
  // 公司数量（去重后的公司数）- 从 contact_field_values 表中查询
  const { contactFieldCategories, contactFieldValues } = await import('../drizzle/schema');
  
  // 查找所有"公司名称"字段的 categoryId（可能有多个用户创建的）
  const companyCategories = await db
    .select({ id: contactFieldCategories.id })
    .from(contactFieldCategories)
    .where(eq(contactFieldCategories.name, '公司名称'));
  
  console.log('[getContactStats] 公司字段分类查询结果:', companyCategories);
  
  const companyCategoryIds = companyCategories.map(c => c.id);
  console.log('[getContactStats] companyCategoryIds:', companyCategoryIds);
  
  let companyCount = 0;
  const uniqueCompanies = new Set<string>();
  
  // 查询通过 categoryId 匹配的公司名称（旧数据）
  if (companyCategoryIds.length > 0) {
    const companyResultByCategoryId = await db
      .select({ 
        companyName: contactFieldValues.value
      })
      .from(contactFieldValues)
      .innerJoin(contacts, eq(contactFieldValues.contactId, contacts.id))
      .where(
        and(
          inArray(contacts.id, visibleContactIds),
          inArray(contactFieldValues.categoryId, companyCategoryIds),
          isNotNull(contactFieldValues.value),
          ne(contactFieldValues.value, '')
        )
      );
    
    companyResultByCategoryId.forEach(r => uniqueCompanies.add(r.companyName));
    console.log('[getContactStats] 通过categoryId查询到公司数:', companyResultByCategoryId.length);
  }
  
  // 查询通过 categoryName = '公司名称' 匹配的公司名称（新数据，categoryId可能为0）
  const companyResultByCategoryName = await db
    .select({ 
      companyName: contactFieldValues.value
    })
    .from(contactFieldValues)
    .innerJoin(contacts, eq(contactFieldValues.contactId, contacts.id))
    .where(
      and(
        inArray(contacts.id, visibleContactIds),
        eq(contactFieldValues.categoryName, '公司名称'),
        isNotNull(contactFieldValues.value),
        ne(contactFieldValues.value, '')
      )
    );
  
  companyResultByCategoryName.forEach(r => uniqueCompanies.add(r.companyName));
  console.log('[getContactStats] 通过categoryName查询到公司数:', companyResultByCategoryName.length);
  
  companyCount = uniqueCompanies.size;
  console.log('[getContactStats] 公司统计:', { 
    companyCategoryIds, 
    uniqueCompanyCount: companyCount,
    sampleCompanies: Array.from(uniqueCompanies).slice(0, 5)
  });
  
  console.log('[getContactStats] 统计结果:', { totalContacts, newThisWeek, newThisMonth, newThisYear });
  // 获取用户参与的所有账本的账目总数
  let totalLedgerEntries = 0;
  try {
    // 先获取用户参与的所有账本ID
    const userLedgers = await db
      .select({ ledgerId: ledgerMembers.ledgerId })
      .from(ledgerMembers)
      .where(eq(ledgerMembers.userId, parentUserId));
    
    const ledgerIds = userLedgers.map(l => l.ledgerId);
    console.log('[getContactStats] 用户参与的账本IDs:', ledgerIds, '用户ID:', parentUserId);
    
    if (ledgerIds.length > 0) {
      // 统计这些账本中的所有账目记录数
      const ledgerEntriesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(ledgerRecords)
        .where(inArray(ledgerRecords.ledgerId, ledgerIds));
      
      totalLedgerEntries = Number(ledgerEntriesResult[0]?.count || 0);
    }
    console.log('[getContactStats] 账目总数:', totalLedgerEntries, '用户ID:', parentUserId);
  } catch (error) {
    console.error('[获取账目总数失败]', error);
  }

  return {
    totalContacts,
    newThisWeek,
    newThisMonth,
    newThisYear,
    needsContact,
    weeklyActive,
    monthlyActive,
    yearlyActive,
    blacklistCount,
    todayActive,
    dormantCount,
    companyCount,
    totalLedgerEntries,
    tagDistribution: tagDistResult
  };
  })();
  
  // 存储到缓存
  contactStatsPromiseCache.set(parentUserId, {
    promise: queryPromise,
    timestamp: Date.now()
  });
  
  return queryPromise;
}


/**
 * 获取第一个人脉的创建日期
 */
export async function getFirstContactCreatedAt(parentUserId: number): Promise<number | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;

  const firstContact = await db
    .select({ createdAt: contacts.createdAt })
    .from(contacts)
    .where(eq(contacts.parentUserId, parentUserId))
    .orderBy(contacts.createdAt)
    .limit(1);

  return firstContact.length > 0 ? firstContact[0].createdAt : null;
}

/**
 * 获取人脉关系健康度汇总统计
 */
export async function getContactsOverviewStats(parentUserId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;

  // 获取所有可见人脉ID（自己的 + 共享的）
  const visibleContactIds = await getAllVisibleContactIds(parentUserId);

  if (visibleContactIds.length === 0) {
    return {
      totalContacts: 0,
      averageInteractionInterval: 0,
      needsAttentionCount: 0,
      monthlyActiveCount: 0,
    };
  }

  // 获取所有可见人脉
  const allContacts = await db.select().from(contacts)
    .where(inArray(contacts.id, visibleContactIds));

  const totalContacts = allContacts.length;

  // 获取所有联络记录（通过JOIN关联contacts表，使用visibleContactIds）
  const allInteractions = await db.select({
    id: contactInteractions.id,
    contactId: contactInteractions.contactId,
    interactionDate: contactInteractions.interactionDate,
    note: contactInteractions.note,
    createdAt: contactInteractions.createdAt,
  }).from(contactInteractions)
    .innerJoin(contacts, eq(contactInteractions.contactId, contacts.id))
    .where(inArray(contacts.id, visibleContactIds))
    .orderBy(desc(contactInteractions.interactionDate));

  // 计算每个人脉的最后联络时间
  const contactLastInteractionMap = new Map<number, number>();
  for (const interaction of allInteractions) {
    if (!contactLastInteractionMap.has(interaction.contactId)) {
      contactLastInteractionMap.set(interaction.contactId, interaction.interactionDate);
    }
  }

  // 获取所有可见人脉的标签关系（用于分级关注机制）
  const contactTagsResult = await db
    .select({
      contactId: contactTagRelations.contactId,
      tagName: contactTags.name,
    })
    .from(contactTagRelations)
    .innerJoin(contactTags, eq(contactTagRelations.tagId, contactTags.id))
    .innerJoin(contacts, eq(contactTagRelations.contactId, contacts.id))
    .where(inArray(contacts.id, visibleContactIds));
  
  // 构建人脉ID到标签名称列表的映射
  const contactTagsMap = new Map<number, string[]>();
  for (const row of contactTagsResult) {
    if (!contactTagsMap.has(row.contactId)) {
      contactTagsMap.set(row.contactId, []);
    }
    contactTagsMap.get(row.contactId)!.push(row.tagName);
  }
  
  // 计算需要关注的人脉数量（基于标签的分级关注机制）
  // 周关注：7天，月关注：30天，季关注：90天，无标签：180天
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
  const oneEightyDaysAgo = now - 180 * 24 * 60 * 60 * 1000;
  let needsAttentionCount = 0;

  for (const contact of allContacts) {
    const lastInteractionDate = contactLastInteractionMap.get(contact.id);
    const tags = contactTagsMap.get(contact.id) || [];
    
    // 确定关注阈值（根据标签）
    let thresholdDate: number;
    if (tags.includes('周关注')) {
      thresholdDate = sevenDaysAgo;
    } else if (tags.includes('月关注')) {
      thresholdDate = thirtyDaysAgo;
    } else if (tags.includes('季关注')) {
      thresholdDate = ninetyDaysAgo;
    } else {
      thresholdDate = oneEightyDaysAgo;
    }
    
    // 判断是否需要关注
    if (!lastInteractionDate || lastInteractionDate < thresholdDate) {
      needsAttentionCount++;
    }
  }

  // 计算本月活跃人脉数量（基于北京时间）
  const startOfMonthTimestamp = getBeijingThisMonthStart();

  const monthlyActiveContactIds = new Set<number>();
  for (const interaction of allInteractions) {
    if (interaction.interactionDate >= startOfMonthTimestamp) {
      monthlyActiveContactIds.add(interaction.contactId);
    }
  }
  const monthlyActiveCount = monthlyActiveContactIds.size;

  // 计算平均联络间隔
  let totalIntervalDays = 0;
  let contactsWithInteractions = 0;

  for (const contact of allContacts) {
    const contactInteractionsList = allInteractions.filter(i => i.contactId === contact.id);
    if (contactInteractionsList.length >= 2) {
      // 计算该人脉的平均联络间隔
      let totalInterval = 0;
      for (let i = 0; i < contactInteractionsList.length - 1; i++) {
        const interval = contactInteractionsList[i].interactionDate - contactInteractionsList[i + 1].interactionDate;
        totalInterval += interval;
      }
      const avgInterval = totalInterval / (contactInteractionsList.length - 1);
      totalIntervalDays += avgInterval / (24 * 60 * 60 * 1000);
      contactsWithInteractions++;
    }
  }

  const averageInteractionInterval = contactsWithInteractions > 0
    ? Math.round(totalIntervalDays / contactsWithInteractions)
    : 0;

  return {
    totalContacts,
    averageInteractionInterval,
    needsAttentionCount,
    monthlyActiveCount,
  };
}


// ==================== 人脉标签管理 ====================

/**
 * 更新人脉的标签
 */
export async function updateContactTags(contactId: number, tags: string[]) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const result = await db.update(contacts)
    .set({ tags: tags.length > 0 ? tags : null })
    .where(eq(contacts.id, contactId));
  
  return result[0].affectedRows > 0;
}

/**
 * 获取具有特定标签的人脉列表
 */
export async function getContactsByTag(parentUserId: number, tag: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  // 由于tags是JSON字段，需要使用SQL函数来查询
  const result = await db.select().from(contacts)
    .where(
      and(
        eq(contacts.parentUserId, parentUserId),
        sql`JSON_CONTAINS(${contacts.tags}, JSON_QUOTE(${tag}))`
      )
    )
    .orderBy(desc(contacts.updatedAt));
  
  return result;
}

/**
 * 获取特定标签的人脉数量
 */
export async function getContactCountByTag(parentUserId: number, tag: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  const result = await db.select({ count: sql<number>`COUNT(*)` })
    .from(contacts)
    .where(
      and(
        eq(contacts.parentUserId, parentUserId),
        sql`JSON_CONTAINS(${contacts.tags}, JSON_QUOTE(${tag}))`
      )
    );
  
  return result[0]?.count || 0;
}

// ==================== 提醒管理 ====================

/**
 * 创建提醒
 */
export async function createReminder(data: {
  contactId: number;
  userId: number;
  title: string;
  reminderDate: Date;
  reminderType?: "normal" | "birthday";
  isRecurring?: boolean;
  birthMonth?: number;
  birthDay?: number;
  isCompleted: boolean;
}) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  // 将reminderDate映射到数据库的reminderTime字段
  const { reminderDate, ...rest } = data;
  const result = await db.insert(reminders).values({
    ...rest,
    reminderTime: reminderDate,
  });
  return result[0].insertId;
}

/**
 * 获取某个人脉的所有提醒
 */
export async function getContactReminders(contactId: number, userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(reminders)
    .where(and(
      eq(reminders.contactId, contactId),
      eq(reminders.userId, userId)
    ))
    .orderBy(reminders.reminderTime);
}

/**
 * 更新提醒
 */
export async function updateReminder(id: number, userId: number, data: { isCompleted: boolean }) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.update(reminders)
    .set(data)
    .where(and(
      eq(reminders.id, id),
      eq(reminders.userId, userId)
    ));
  return result[0].affectedRows > 0;
}

/**
 * 删除提醒
 */
export async function deleteReminder(id: number, userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.delete(reminders)
    .where(and(
      eq(reminders.id, id),
      eq(reminders.userId, userId)
    ));
  return result[0].affectedRows > 0;
}

/**
 * 获取今日提醒的人数（去重）
 */
export async function getTodayRemindersCount(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  // 使用北京时间计算今日范围
  const today = new Date(getBeijingTodayStart());
  const tomorrow = new Date(getBeijingTodayEnd() + 1);
  
  const result = await db.select({ count: sql<number>`COUNT(DISTINCT ${reminders.contactId})` })
    .from(reminders)
    .where(and(
      eq(reminders.userId, userId),
      eq(reminders.isCompleted, false),
      gte(reminders.reminderTime, today),
      lt(reminders.reminderTime, tomorrow)
    ));
  
  return result[0]?.count || 0;
}

/**
 * 获取本周提醒的人数（去重）
 */
export async function getWeekRemindersCount(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  // 使用北京时间计算本周范围
  const monday = new Date(getBeijingThisWeekStart());
  
  // 获取下周一
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  
  const result = await db.select({ count: sql<number>`COUNT(DISTINCT ${reminders.contactId})` })
    .from(reminders)
    .where(and(
      eq(reminders.userId, userId),
      eq(reminders.isCompleted, false),
      gte(reminders.reminderTime, monday),
      lt(reminders.reminderTime, nextMonday)
    ));
  
  return result[0]?.count || 0;
}

/**
 * 获取本月提醒的人数（去重）
 */
export async function getMonthRemindersCount(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  // 使用北京时间计算本月范围
  const firstDayOfMonth = new Date(getBeijingThisMonthStart());
  const firstDayOfNextMonth = new Date(firstDayOfMonth);
  firstDayOfNextMonth.setMonth(firstDayOfNextMonth.getMonth() + 1);
  
  const result = await db.select({ count: sql<number>`COUNT(DISTINCT ${reminders.contactId})` })
    .from(reminders)
    .where(and(
      eq(reminders.userId, userId),
      eq(reminders.isCompleted, false),
      gte(reminders.reminderTime, firstDayOfMonth),
      lt(reminders.reminderTime, firstDayOfNextMonth)
    ));
  
  return result[0]?.count || 0;
}

/**
 * 获取所有省份的人数统计（包含自己的人脉 + 共享给我的人脉）
 */
export async function getRegionStats(parentUserId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  // 查询自己的人脉按省份统计(排除海外)
  const ownContacts = await db.select({
    name: contacts.region,
    value: sql<number>`COUNT(*)`,
  })
    .from(contacts)
    .where(and(
      eq(contacts.parentUserId, parentUserId),
      isNotNull(contacts.region),
      ne(contacts.region, ''),
      ne(contacts.region, '海外')  // 排除海外人脉
    ))
    .groupBy(contacts.region);
  
  // 查询共享给我的人脉按省份统计(排除海外)
  const sharedContacts = await db.select({
    name: contacts.region,
    value: sql<number>`COUNT(*)`,
  })
    .from(contacts)
    .innerJoin(
      contactSharingConnections,
      and(
        eq(contactSharingConnections.sharerId, contacts.parentUserId),
        eq(contactSharingConnections.receiverId, parentUserId),
        eq(contactSharingConnections.status, 'active')
      )
    )
    .where(and(
      isNotNull(contacts.region),
      ne(contacts.region, ''),
      ne(contacts.region, '海外')  // 排除海外人脉
    ))
    .groupBy(contacts.region);
  
  // 查询自己的海外人脉数量
  const [ownOverseas] = await db.select({
    value: sql<number>`COUNT(*)`,
  })
    .from(contacts)
    .where(and(
      eq(contacts.parentUserId, parentUserId),
      eq(contacts.region, '海外')
    ));
  
  // 查询共享给我的海外人脉数量
  const [sharedOverseas] = await db.select({
    value: sql<number>`COUNT(*)`,
  })
    .from(contacts)
    .innerJoin(
      contactSharingConnections,
      and(
        eq(contactSharingConnections.sharerId, contacts.parentUserId),
        eq(contactSharingConnections.receiverId, parentUserId),
        eq(contactSharingConnections.status, 'active')
      )
    )
    .where(eq(contacts.region, '海外'));
  
  // 查询自己的未选择地域的人脉数量
  const [ownOther] = await db.select({
    value: sql<number>`COUNT(*)`,
  })
    .from(contacts)
    .where(and(
      eq(contacts.parentUserId, parentUserId),
      or(
        isNull(contacts.region),
        eq(contacts.region, '')
      )
    ));
  
  // 查询共享给我的未选择地域的人脉数量
  const [sharedOther] = await db.select({
    value: sql<number>`COUNT(*)`,
  })
    .from(contacts)
    .innerJoin(
      contactSharingConnections,
      and(
        eq(contactSharingConnections.sharerId, contacts.parentUserId),
        eq(contactSharingConnections.receiverId, parentUserId),
        eq(contactSharingConnections.status, 'active')
      )
    )
    .where(or(
      isNull(contacts.region),
      eq(contacts.region, '')
    ));
  
  // 合并两个统计结果
  const regionMap = new Map<string, number>();
  
  // 添加自己的人脉
  for (const r of ownContacts) {
    const region = r.name || '';
    regionMap.set(region, Number(r.value) || 0);
  }
  
  // 添加共享给我的人脉
  for (const r of sharedContacts) {
    const region = r.name || '';
    const currentCount = regionMap.get(region) || 0;
    regionMap.set(region, currentCount + (Number(r.value) || 0));
  }
  
  // 计算海外和其他的数量
  const overseasCount = (Number(ownOverseas?.value) || 0) + (Number(sharedOverseas?.value) || 0);
  const otherCount = (Number(ownOther?.value) || 0) + (Number(sharedOther?.value) || 0);
  
  // 所有34个省级行政区（使用短名字）
  const allProvinces = [
    '北京', '天津', '上海', '重庆',
    '河北', '山西', '辽宁', '吉林', '黑龙江',
    '江苏', '浙江', '安徽', '福建', '江西', '山东',
    '河南', '湖北', '湖南', '广东', '海南',
    '四川', '贵州', '云南', '陕西', '甘肃', '青海',
    '内蒙古', '广西', '西藏', '宁夏', '新疆',
    '台湾', '香港', '澳门'
  ];
  
  // 创建完整的省份列表，包括0人的省份
  const normalRegions = allProvinces.map(province => ({
    name: province,
    value: regionMap.get(province) || 0
  }));
  
  // 按人脉数量降序排列
  normalRegions.sort((a, b) => b.value - a.value);
  
  // 添加海外和其他
  const finalResults = [...normalRegions];
  finalResults.push({ name: '海外', value: overseasCount });
  finalResults.push({ name: '其他', value: otherCount });
  
  return finalResults;
}

/**
 * 按区域筛选人脉列表
 */
export async function getContactsByRegion(parentUserId: number, region: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  // 查询自己的人脉
  const ownContacts = await db.select()
    .from(contacts)
    .where(and(
      eq(contacts.parentUserId, parentUserId),
      eq(contacts.region, region)
    ))
    .orderBy(desc(contacts.updatedAt));
  
  // 查询共享给我的人脉
  // 1. 先找到所有分享给我的用户ID
  const sharingConnections = await db.select({
    sharerId: contactSharingConnections.sharerId
  })
    .from(contactSharingConnections)
    .where(and(
      eq(contactSharingConnections.receiverId, parentUserId),
      eq(contactSharingConnections.status, 'active')
    ));
  
  const sharerIds = sharingConnections.map(c => c.sharerId);
  
  // 2. 查询这些分享者在该地区的所有人脉
  let sharedContacts: any[] = [];
  if (sharerIds.length > 0) {
    sharedContacts = await db.select()
      .from(contacts)
      .where(and(
        inArray(contacts.parentUserId, sharerIds),
        eq(contacts.region, region)
      ))
      .orderBy(desc(contacts.updatedAt));
  }
  
  // 为自己的人脉添加标记
  const ownContactsWithFlag = ownContacts.map(c => ({ ...c, isShared: false, sharerName: null, sharerUserId: null }));
  
  // 为共享的人脉添加标记和分享者信息
  const sharedContactsWithFlag = await Promise.all(
    sharedContacts.map(async (contact) => {
      // 查找分享者信息
      const sharer = await db.select({
        username: users.username
      })
        .from(users)
        .where(eq(users.id, contact.parentUserId))
        .limit(1);
      
      return {
        ...contact,
        isShared: true,
        sharerName: sharer[0]?.username || '未知',
        sharerUserId: contact.parentUserId
      };
    })
  );
  
  // 合并结果
  const allContacts = [...ownContactsWithFlag, ...sharedContactsWithFlag];
  
  // 获取所有联系人ID
  const contactIds = allContacts.map(c => c.id);
  
  // 并行批量查询所有需要的数据（和contacts.list一样）
  const [allReferrerStats, tagsMap, personalTagsMap, interactionStatsMap, interactionInfoMap, fieldValuesMap] = await Promise.all([
    getReferrerStats(parentUserId).catch(() => []),
    getTagsForContacts(contactIds),
    getPersonalTagsForContacts(contactIds),
    getInteractionStatsForContacts(contactIds),
    getInteractionInfoForContacts(contactIds),
    getFieldValuesForContacts(contactIds),
  ]);
  
  // 创建推荐人统计的Map
  const referrerStatsMap = new Map(
    allReferrerStats.map((stat: any) => [stat.contactId, stat])
  );
  
  // 为每个人脉组装详情数据
  const contactsWithDetails = allContacts.map((contact) => {
    const tags = tagsMap.get(contact.id) || [];
    const personalTags = personalTagsMap.get(contact.id) || [];
    const interactionStats = interactionStatsMap.get(contact.id) || { totalInteractions: 0 };
    const interactionInfo = interactionInfoMap.get(contact.id) || { lastInteraction: null, hasTodayInteraction: false };
    const referrerStats = referrerStatsMap.get(contact.id) || null;
    const fieldValues = fieldValuesMap.get(contact.id) || [];
    
    return {
      ...contact,
      tags,
      personalTags,
      fieldValues,
      lastInteractionDate: interactionInfo.lastInteraction,
      daysSinceLastInteraction: interactionInfo.lastInteraction 
        ? Math.floor((Date.now() - new Date(interactionInfo.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      hasTodayInteraction: interactionInfo.hasTodayInteraction,
      hasReferrer: contact.referrerId !== null && contact.referrerId !== undefined,
      totalInteractions: interactionStats?.totalInteractions || 0,
      directReferrals: referrerStats?.directReferrals || 0,
      indirectReferrals: referrerStats?.indirectReferrals || 0,
    };
  });
  
  return contactsWithDetails;
}


/**
 * 获取直接推荐的人脉列表
 */
export async function getDirectReferrals(contactId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  const result = await db.select({
    id: contacts.id,
    name: contacts.name,
    title: contacts.title,
  })
    .from(contacts)
    .where(eq(contacts.referrerId, contactId))
    .orderBy(desc(contacts.updatedAt));
  
  return result;
}

/**
 * 获取间接推荐的人脉列表（按层级）
 */
export async function getIndirectReferrals(contactId: number, maxLevel: number = 10) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  const result: any[] = [];
  const visited = new Set<number>();
  
  // BFS 遍历推荐链路
  const queue: { id: number; level: number; referrerName: string }[] = [
    { id: contactId, level: 0, referrerName: "" }
  ];
  
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.level >= maxLevel || visited.has(current.id)) continue;
    
    visited.add(current.id);
    
    // 获取该人脉直接推荐的人
    const directReferrals = await db.select({
      id: contacts.id,
      name: contacts.name,
      title: contacts.title,
    })
      .from(contacts)
      .where(eq(contacts.referrerId, current.id));
    
    // 如果当前层级 > 0，说明是间接推荐
    if (current.level > 0) {
      for (const referral of directReferrals) {
        result.push({
          id: referral.id,
          name: referral.name,
          title: referral.title,
          level: current.level + 1,
          referrerName: current.referrerName,
        });
        
        // 继续遍历下一层
        queue.push({
          id: referral.id,
          level: current.level + 1,
          referrerName: referral.name,
        });
      }
    } else {
      // 第一层的直接推荐作为间接推荐的起点
      for (const referral of directReferrals) {
        queue.push({
          id: referral.id,
          level: 1,
          referrerName: referral.name,
        });
      }
    }
  }
  
  return result;
}


/**
 * 获取推荐链路数据（树状结构）
 */
export async function getReferralChain(contactId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  // 获取当前人脉信息
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  
  if (!contact) {
    return null;
  }
  
  // 递归获取推荐链路
  async function buildChain(id: number, level = 0): Promise<any> {
    const current = await db.query.contacts.findFirst({
      where: eq(contacts.id, id),
    });
    
    if (!current) return null;
    
    // 获取该人脉推荐的所有人
    const referrals = await db.query.contacts.findMany({
      where: eq(contacts.referrerId, id),
    });
    
    // 递归构建子节点
    const children = await Promise.all(
      referrals.map(ref => buildChain(ref.id, level + 1))
    );
    
    // 统计直接推荐和间接推荐
    const directReferrals = referrals.length;
    let indirectReferrals = 0;
    
    for (const child of children) {
      if (child) {
        indirectReferrals += child.directReferrals + child.indirectReferrals;
      }
    }
    
    return {
      id: current.id,
      name: current.name,
      title: current.title,
      level,
      directReferrals,
      indirectReferrals,
      children: children.filter(Boolean),
    };
  }
  
  return await buildChain(contactId);
}


// ==================== 批量查询优化函数 ====================

/**
 * 批量获取多个联系人的标签
 * @param contactIds 联系人ID数组
 * @returns Map<contactId, tags[]>
 */
export async function getTagsForContacts(contactIds: number[]): Promise<Map<number, any[]>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db || contactIds.length === 0) return new Map();
  
  // 批量查询所有联系人的标签关系
  const relations = await db.select({
    contactId: contactTagRelations.contactId,
    tagId: contactTagRelations.tagId,
    tagName: contactTags.name,
    tagColor: contactTags.color,
  })
    .from(contactTagRelations)
    .innerJoin(contactTags, eq(contactTagRelations.tagId, contactTags.id))
    .where(sql`${contactTagRelations.contactId} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`);
  
  // 按联系人ID分组
  const tagsMap = new Map<number, any[]>();
  for (const contactId of contactIds) {
    tagsMap.set(contactId, []);
  }
  
  for (const relation of relations) {
    const tags = tagsMap.get(relation.contactId) || [];
    tags.push({
      id: relation.tagId,
      name: relation.tagName,
      color: relation.tagColor,
    });
    tagsMap.set(relation.contactId, tags);
  }
  
  return tagsMap;
}

/**
 * 批量获取多个联系人的个人标签
 * @param contactIds 联系人ID数组
 * @returns Map<contactId, personalTags[]>
 */
export async function getPersonalTagsForContacts(contactIds: number[]): Promise<Map<number, any[]>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db || contactIds.length === 0) return new Map();
  
  // 批量查询所有联系人的个人标签
  const personalTagsList = await db.select()
    .from(personalContactTags)
    .where(sql`${personalContactTags.contactId} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`);
  
  // 按联系人ID分组
  const personalTagsMap = new Map<number, any[]>();
  for (const contactId of contactIds) {
    personalTagsMap.set(contactId, []);
  }
  
  for (const tag of personalTagsList) {
    const tags = personalTagsMap.get(tag.contactId) || [];
    tags.push({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    });
    personalTagsMap.set(tag.contactId, tags);
  }
  
  return personalTagsMap;
}

/**
 * 获取用户的所有个人标签使用统计
 * @param parentUserId 用户ID
 * @returns 个人标签使用统计列表
 */
export async function getPersonalTagsStats(parentUserId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  // 查询该用户创建的所有个人标签，并统计每个标签的使用次数
  const stats = await db
    .select({
      name: personalContactTags.name,
      color: personalContactTags.color,
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(personalContactTags)
    .where(eq(personalContactTags.parentUserId, parentUserId))
    .groupBy(personalContactTags.name, personalContactTags.color)
    .orderBy(desc(sql`COUNT(*)`));
  
  return stats;
}

/**
 * 批量获取多个联系人的联络统计
 * @param contactIds 联系人ID数组
 * @returns Map<contactId, stats>
 */
export async function getInteractionStatsForContacts(contactIds: number[]): Promise<Map<number, any>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db || contactIds.length === 0) return new Map();
  
  // 批量查询所有联系人的联络统计
  const stats = await db.select({
    contactId: contactInteractions.contactId,
    totalInteractions: sql<number>`COUNT(*)`,
    lastInteractionDate: sql<number>`MAX(${contactInteractions.interactionDate})`,
  })
    .from(contactInteractions)
    .where(sql`${contactInteractions.contactId} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`)
    .groupBy(contactInteractions.contactId);
  
  // 转换为Map
  const statsMap = new Map<number, any>();
  for (const contactId of contactIds) {
    statsMap.set(contactId, { totalInteractions: 0, lastInteractionDate: null });
  }
  
  for (const stat of stats) {
    statsMap.set(stat.contactId, {
      totalInteractions: stat.totalInteractions,
      lastInteractionDate: stat.lastInteractionDate,
    });
  }
  
  return statsMap;
}

/**
 * 批量获取多个联系人的最后联络时间和活跃时间段标记
 * @param contactIds 联系人ID数组
 * @returns Map<contactId, { lastInteraction, hasTodayInteraction, hasInteractionThisWeek, hasInteractionThisMonth, hasInteractionThisYear }>
 */
export async function getInteractionInfoForContacts(contactIds: number[]): Promise<Map<number, { lastInteraction: number | null, hasTodayInteraction: boolean, hasInteractionToday: boolean, hasInteractionThisWeek: boolean, hasInteractionThisMonth: boolean, hasInteractionThisYear: boolean }>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db || contactIds.length === 0) return new Map();
  
  // 获取时间范围（基于北京时间）
  const startOfTodayTimestamp = getBeijingTodayStart();
  const startOfWeekTimestamp = getBeijingThisWeekStart();
  const startOfMonthTimestamp = getBeijingThisMonthStart();
  const startOfYearTimestamp = getBeijingThisYearStart();
  
  // 初始化结果
  const infoMap = new Map<number, { lastInteraction: number | null, hasTodayInteraction: boolean, hasInteractionToday: boolean, hasInteractionThisWeek: boolean, hasInteractionThisMonth: boolean, hasInteractionThisYear: boolean }>();
  for (const contactId of contactIds) {
    infoMap.set(contactId, { 
      lastInteraction: null, 
      hasTodayInteraction: false,
      hasInteractionToday: false,
      hasInteractionThisWeek: false,
      hasInteractionThisMonth: false,
      hasInteractionThisYear: false
    });
  }
  
  // 对每个联系人单独检查
  for (const contactId of contactIds) {
    // 获取最后一次联络时间
    const lastInteraction = await getLastInteractionDate(contactId);
    
    // 检查今天是否有联络
    const hasToday = await hasTodayInteraction(contactId);
    
    // 检查各时间段是否有联络记录
    let hasInteractionToday = false;
    let hasInteractionThisWeek = false;
    let hasInteractionThisMonth = false;
    let hasInteractionThisYear = false;
    
    // 查询该人脉的所有联络记录
    const interactions = await db
      .select({ interactionDate: contactInteractions.interactionDate })
      .from(contactInteractions)
      .where(eq(contactInteractions.contactId, contactId));
    
    // 检查每个联络记录是否在各时间段内
    for (const interaction of interactions) {
      const interactionTimestamp = typeof interaction.interactionDate === 'number' 
        ? interaction.interactionDate 
        : new Date(interaction.interactionDate).getTime();
      
      if (interactionTimestamp >= startOfTodayTimestamp) {
        hasInteractionToday = true;
      }
      if (interactionTimestamp >= startOfWeekTimestamp) {
        hasInteractionThisWeek = true;
      }
      if (interactionTimestamp >= startOfMonthTimestamp) {
        hasInteractionThisMonth = true;
      }
      if (interactionTimestamp >= startOfYearTimestamp) {
        hasInteractionThisYear = true;
      }
    }
    
    infoMap.set(contactId, {
      lastInteraction: lastInteraction || null,
      hasTodayInteraction: hasToday,
      hasInteractionToday,
      hasInteractionThisWeek,
      hasInteractionThisMonth,
      hasInteractionThisYear
    });
  }
  
  return infoMap;
}


/**
 * 批量获取多个联系人的字段值（公司、职位等）
 * @param contactIds 联系人ID数组
 * @returns Map<contactId, fieldValues[]>
 */
export async function getFieldValuesForContacts(contactIds: number[]): Promise<Map<number, any[]>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db || contactIds.length === 0) return new Map();
  
  // 批量查询所有联系人的字段值
  const fieldValues = await db.select({
    contactId: contactFieldValues.contactId,
    categoryId: contactFieldValues.categoryId,
    value: contactFieldValues.value,
  })
    .from(contactFieldValues)
    .where(sql`${contactFieldValues.contactId} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`);
  
  // 按联系人ID分组
  const valuesMap = new Map<number, any[]>();
  for (const contactId of contactIds) {
    valuesMap.set(contactId, []);
  }
  
  for (const fv of fieldValues) {
    const values = valuesMap.get(fv.contactId);
    if (values) {
      values.push({
        categoryId: fv.categoryId,
        value: fv.value,
      });
    }
  }
  
  return valuesMap;
}

// ==================== 扩展信息管理 ====================

/**
 * 获取所有扩展信息类目（树状结构）
 * @returns 主分类列表，每个主分类包含 children 字段
 */
export async function getFieldCategories(userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 获取所有类目（包括公共分类和用户分类）
  const allCategories = await db
    .select()
    .from(contactFieldCategories)
    .where(
      userId 
        ? or(
            eq(contactFieldCategories.parentUserId, 0),
            eq(contactFieldCategories.parentUserId, userId)
          )
        : eq(contactFieldCategories.parentUserId, 0)
    )
    .orderBy(contactFieldCategories.sortOrder);
  
  // 分离主分类和子分类
  const mainCategories = allCategories.filter(cat => (cat.parentCategoryId ?? 0) === 0);
  const subCategories = allCategories.filter(cat => (cat.parentCategoryId ?? 0) !== 0);
  
  // 构建树状结构
  return mainCategories.map(main => ({
    ...main,
    children: subCategories.filter(sub => sub.parentCategoryId === main.id)
  }));
}

/**
 * 添加扩展信息字段值
 * @param contactId 联系人 ID
 * @param categoryId 类目 ID
 * @param categoryName 类目名称（按钮名称）
 * @param value 字段值
 * @returns 新增的字段值记录
 */
export async function addFieldValue(contactId: number, categoryId: number, categoryName: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db
    .insert(contactFieldValues)
    .values({
      contactId,
      categoryId,
      categoryName,
      value,
    });
  
  const insertId = result[0].insertId;
  
  // 返回新插入的记录
  return {
    id: insertId,
    contactId,
    categoryId,
    value,
    createdAt: new Date(),
  };
}

/**
 * 删除扩展信息字段值
 * @param fieldValueId 字段值ID
 * @returns 是否删除成功
 */
export async function deleteFieldValue(fieldValueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(contactFieldValues)
    .where(eq(contactFieldValues.id, fieldValueId));
  
  return true;
}

/**
 * 批量删除联系人的所有扩展信息
 * @param contactId 联系人ID
 * @returns 是否删除成功
 */
export async function deleteAllFieldValues(contactId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(contactFieldValues)
    .where(eq(contactFieldValues.contactId, contactId));
  
  return true;
}

/**
 * 获取联系人的所有扩展信息字段值（包含类目信息）
 * @param contactId 联系人ID
 * @returns 字段值列表（包含类目名称）
 */
export async function getContactFieldValues(contactId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 直接获取字段值（包含categoryName），按sortOrder和id排序
  const fieldValues = await db
    .select()
    .from(contactFieldValues)
    .where(eq(contactFieldValues.contactId, contactId))
    .orderBy(contactFieldValues.sortOrder, contactFieldValues.id);
  
  // 直接返回，不需要关联查询
  const result = fieldValues.map(fv => ({
      id: fv.id,
      contactId: fv.contactId,
      categoryId: fv.categoryId,
      categoryName: fv.categoryName || '', // 直接使用数据库中的categoryName
      categoryKey: fv.categoryName || '', // 使用 categoryName 作为 key
      value: fv.value,
      sortOrder: fv.sortOrder || 0,
      createdAt: fv.createdAt,
    }));
  
  return result;
}

/**
 * 更新扩展信息字段值
 * @param fieldValueId 字段值ID
 * @param value 新的字段值
 * @returns 更新后的字段值记录
 */
export async function updateFieldValue(fieldValueId: number, value: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [updatedFieldValue] = await db
    .update(contactFieldValues)
    .set({ value })
    .where(eq(contactFieldValues.id, fieldValueId))
    .returning();
  
  return updatedFieldValue;
}


/**
 * 获取公司列表（所有有公司名称的联系人，标注重复）
 * @param parentUserId 用户ID
 * @returns 公司列表，包含联系人信息和是否重复的标记
 */
export async function getCompanyList(parentUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 获取所有可见人脉ID（自己的 + 共享的）
  const visibleContactIds = await getAllVisibleContactIds(parentUserId);

  console.log('[getCompanyList] visibleContactIds.length:', visibleContactIds.length);
  if (visibleContactIds.length === 0) {
    return [];
  }

  // 查询公司字段的 categoryId
  const { contactFieldCategories, contactFieldValues } = await import('../drizzle/schema');
  
  // 查询所有“公司名称”字段分类的ID（可能有多个用户创建的）
  const companyCategoryResult = await db
    .select({ id: contactFieldCategories.id })
    .from(contactFieldCategories)
    .where(eq(contactFieldCategories.name, '公司名称'));
  
  console.log('[getCompanyList] companyCategoryResult:', companyCategoryResult);
  
  const companyCategoryIds = companyCategoryResult.map(r => r.id);
  console.log('[getCompanyList] companyCategoryIds:', companyCategoryIds);
  
  // 查询所有有公司名称的联系人
  // 支持两种情况：
  // 1. 通过 categoryId 匹配（旧数据）
  // 2. 通过 categoryName = '公司名称' 匹配（新数据，categoryId可能为0）
  let companyContacts: any[] = [];
  
  // 查询通过 categoryId 匹配的记录
  if (companyCategoryIds.length > 0) {
    const contactsByCategoryId = await db
      .select({
        contactId: contactFieldValues.contactId,
        contactName: contacts.name,
        companyName: contactFieldValues.value,
        createdAt: contactFieldValues.createdAt,
        parentUserId: contacts.parentUserId,
      })
      .from(contactFieldValues)
      .innerJoin(contacts, eq(contactFieldValues.contactId, contacts.id))
      .where(
        and(
          inArray(contacts.id, visibleContactIds),
          inArray(contactFieldValues.categoryId, companyCategoryIds),
          isNotNull(contactFieldValues.value),
          ne(contactFieldValues.value, '')
        )
      )
      .orderBy(desc(contactFieldValues.createdAt));
    companyContacts = [...contactsByCategoryId];
    console.log('[getCompanyList] 通过categoryId查询到:', contactsByCategoryId.length);
  }
  
  // 查询通过 categoryName = '公司名称' 匹配的记录（categoryId可能为0）
  const contactsByCategoryName = await db
    .select({
      contactId: contactFieldValues.contactId,
      contactName: contacts.name,
      companyName: contactFieldValues.value,
      createdAt: contactFieldValues.createdAt,
      parentUserId: contacts.parentUserId,
    })
    .from(contactFieldValues)
    .innerJoin(contacts, eq(contactFieldValues.contactId, contacts.id))
    .where(
      and(
        inArray(contacts.id, visibleContactIds),
        eq(contactFieldValues.categoryName, '公司名称'),
        isNotNull(contactFieldValues.value),
        ne(contactFieldValues.value, '')
      )
    )
    .orderBy(desc(contactFieldValues.createdAt));
  console.log('[getCompanyList] 通过categoryName查询到:', contactsByCategoryName.length);
  
  // 合并结果，去重（同一个contactId只保留一条）
  const seenContactIds = new Set(companyContacts.map(c => c.contactId));
  for (const contact of contactsByCategoryName) {
    if (!seenContactIds.has(contact.contactId)) {
      companyContacts.push(contact);
      seenContactIds.add(contact.contactId);
    }
  }

  console.log('[getCompanyList] companyContacts.length:', companyContacts.length);
  if (companyContacts.length > 0) {
    console.log('[getCompanyList] companyContacts 示例:', companyContacts.slice(0, 3));
  }

  // 按公司名分组
  const companyMap = new Map<string, {
    companyName: string;
    contactIds: number[];
    contactNames: string[];
    contactCount: number;
    createdAt: Date;
    isShared: boolean;  // 是否是共享的公司
  }>();

  companyContacts.forEach(contact => {
    const existing = companyMap.get(contact.companyName);
    const isContactShared = contact.parentUserId !== parentUserId;
    
    if (existing) {
      existing.contactIds.push(contact.contactId);
      existing.contactNames.push(contact.contactName);
      existing.contactCount++;
      // 如果有任何一个联系人是共享的，则整个公司标记为共享
      if (isContactShared) {
        existing.isShared = true;
      }
      // 保留最早的创建时间
      if (new Date(contact.createdAt) < new Date(existing.createdAt)) {
        existing.createdAt = contact.createdAt;
      }
    } else {
      companyMap.set(contact.companyName, {
        companyName: contact.companyName,
        contactIds: [contact.contactId],
        contactNames: [contact.contactName],
        contactCount: 1,
        createdAt: contact.createdAt,
        isShared: isContactShared,
      });
    }
  });

  // 查询所有公司的报告状态
  const { companyReports } = await import('../drizzle/schema');
  const uniqueCompanyNames = Array.from(companyMap.keys());
  const reportsData = uniqueCompanyNames.length > 0 ? await db
    .select({ companyName: companyReports.companyName })
    .from(companyReports)
    .where(inArray(companyReports.companyName, uniqueCompanyNames))
  : [];
  
  const hasReportMap = new Map(reportsData.map(r => [r.companyName, true]));

  // 返回按公司分组的列表，按创建时间倒序排列
  return Array.from(companyMap.values())
    .map(company => ({
      ...company,
      hasReport: hasReportMap.get(company.companyName) || false,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * 创建扩展信息分类
 * @param name 分类名称
 * @param icon 分类图标
 * @param parentCategoryId 父分类ID（null表示一级分类）
 * @returns 新创建的分类记录
 */
export async function createFieldCategory(name: string, icon: string = '', parentCategoryId: number | null = null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db
    .insert(contactFieldCategories)
    .values({
      name,
      icon,
      parentCategoryId,
      parentUserId: 0, // 系统级分类
      sortOrder: 0,
    });
  
  return {
    id: Number(result.insertId),
    name,
    icon,
    parentCategoryId,
  };
}

/**
 * 获取健康度统计数据
 */
export async function getHealthStats(parentUserId: number, type: 'all' | 'my' | 'shared' = 'all') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 根据type获取对应的人脉ID
  let visibleContactIds: number[];
  if (type === 'all') {
    visibleContactIds = await getAllVisibleContactIds(parentUserId);
  } else if (type === 'my') {
    // 只获取自己的人脉
    const myContacts = await db.select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.parentUserId, parentUserId));
    visibleContactIds = myContacts.map(c => c.id);
  } else {
    // 只获取共享的人脉
    const sharingConnections = await db.select({ sharerId: contactSharingConnections.sharerId })
      .from(contactSharingConnections)
      .where(and(
        eq(contactSharingConnections.receiverId, parentUserId),
        eq(contactSharingConnections.status, 'active')
      ));
    const sharerIds = sharingConnections.map(c => c.sharerId);
    
    const sharedContactIds: number[] = [];
    for (const sharerId of sharerIds) {
      const sharerContacts = await db.select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.parentUserId, sharerId));
      sharedContactIds.push(...sharerContacts.map(c => c.id));
    }
    visibleContactIds = sharedContactIds;
  }

  if (visibleContactIds.length === 0) {
    return {
      thirtyDayInteractionRate: { value: "0%", detail: "(0/0人)", trend: "0%", status: "待改善" },
      averageInteractionFrequency: { value: "0天", trend: "0天", status: "待改善" },
      dormantContactsCount: { value: "0人", percentage: "0%", trend: "0人", status: "良好" },
      needsFollowUpCount: { value: "0项", trend: "0项", status: "良好" },
      highValueInteractionRate: { value: "0%", trend: "0%", status: "待改善" },
    };
  }

  // 获取所有可见人脉
  const allContacts = await db.select().from(contacts)
    .where(inArray(contacts.id, visibleContactIds));

  const totalContacts = allContacts.length;

  // 获取所有联络记录
  const allInteractions = await db.select({
    id: contactInteractions.id,
    contactId: contactInteractions.contactId,
    interactionDate: contactInteractions.interactionDate,
    note: contactInteractions.note,
  }).from(contactInteractions)
    .innerJoin(contacts, eq(contactInteractions.contactId, contacts.id))
    .where(inArray(contacts.id, visibleContactIds))
    .orderBy(desc(contactInteractions.interactionDate));

  // 1. 计算30天互动率
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const contactsWithRecentInteraction = new Set<number>();
  for (const interaction of allInteractions) {
    if (interaction.interactionDate >= thirtyDaysAgo) {
      contactsWithRecentInteraction.add(interaction.contactId);
    }
  }
  const thirtyDayCount = contactsWithRecentInteraction.size;
  const thirtyDayRate = totalContacts > 0 ? Math.round((thirtyDayCount / totalContacts) * 100) : 0;

  // 2. 计算平均互动频率（所有人脉的平均互动间隔天数）
  let totalIntervalDays = 0;
  let contactsWithInteractions = 0;

  for (const contact of allContacts) {
    const contactInteractionsList = allInteractions.filter(i => i.contactId === contact.id);
    if (contactInteractionsList.length >= 2) {
      let totalInterval = 0;
      for (let i = 0; i < contactInteractionsList.length - 1; i++) {
        const interval = contactInteractionsList[i].interactionDate - contactInteractionsList[i + 1].interactionDate;
        totalInterval += interval;
      }
      const avgInterval = totalInterval / (contactInteractionsList.length - 1);
      totalIntervalDays += avgInterval / (24 * 60 * 60 * 1000);
      contactsWithInteractions++;
    }
  }

  const averageInteractionInterval = contactsWithInteractions > 0
    ? Math.round(totalIntervalDays / contactsWithInteractions)
    : 0;

  // 3. 失联人脉数（>180天未联络）
  const oneEightyDaysAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const contactLastInteractionMap = new Map<number, number>();
  for (const interaction of allInteractions) {
    if (!contactLastInteractionMap.has(interaction.contactId)) {
      contactLastInteractionMap.set(interaction.contactId, interaction.interactionDate);
    }
  }

  let dormantCount = 0;
  for (const contact of allContacts) {
    const lastInteractionDate = contactLastInteractionMap.get(contact.id);
    if (!lastInteractionDate || lastInteractionDate < oneEightyDaysAgo) {
      dormantCount++;
    }
  }
  const dormantPercentage = totalContacts > 0 ? Math.round((dormantCount / totalContacts) * 100) : 0;

  // 4. 待跟进承诺数（引用首页"需要关注"的数字）
  // 获取所有可见人脉的标签关系
  const contactTagsResult = await db
    .select({
      contactId: contactTagRelations.contactId,
      tagName: contactTags.name,
    })
    .from(contactTagRelations)
    .innerJoin(contactTags, eq(contactTagRelations.tagId, contactTags.id))
    .innerJoin(contacts, eq(contactTagRelations.contactId, contacts.id))
    .where(inArray(contacts.id, visibleContactIds));
  
  const contactTagsMap = new Map<number, string[]>();
  for (const row of contactTagsResult) {
    if (!contactTagsMap.has(row.contactId)) {
      contactTagsMap.set(row.contactId, []);
    }
    contactTagsMap.get(row.contactId)!.push(row.tagName);
  }
  
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgoTimestamp = now - 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
  let needsFollowUpCount = 0;

  for (const contact of allContacts) {
    const lastInteractionDate = contactLastInteractionMap.get(contact.id);
    const tags = contactTagsMap.get(contact.id) || [];
    
    let needsFollowUp = false;
    if (tags.includes('周关注') && (!lastInteractionDate || lastInteractionDate < sevenDaysAgo)) {
      needsFollowUp = true;
    } else if (tags.includes('月关注') && (!lastInteractionDate || lastInteractionDate < thirtyDaysAgoTimestamp)) {
      needsFollowUp = true;
    } else if (tags.includes('季关注') && (!lastInteractionDate || lastInteractionDate < ninetyDaysAgo)) {
      needsFollowUp = true;
    }
    
    if (needsFollowUp) {
      needsFollowUpCount++;
    }
  }

  // 5. 高价值互动占比（评分≥4分的互动次数 / 总互动次数）
  let highValueCount = 0;
  const totalInteractionCount = allInteractions.length;

  for (const interaction of allInteractions) {
    const note = interaction.note || "";
    // 匹配格式：[重要性:X分]
    const match = note.match(/\[重要性:(\d+)分\]/);
    if (match) {
      const score = parseInt(match[1]);
      if (score >= 4) {
        highValueCount++;
      }
    }
  }

  const highValueRate = totalInteractionCount > 0 
    ? Math.round((highValueCount / totalInteractionCount) * 100) 
    : 0;

  return {
    thirtyDayInteractionRate: {
      value: `${thirtyDayRate}%`,
      detail: `(${thirtyDayCount}/${totalContacts}人)`,
      trend: "↑ 5%", // TODO: 需要历史数据对比
      status: thirtyDayRate >= 60 ? "良好" : thirtyDayRate >= 40 ? "注意" : "待改善",
    },
    averageInteractionFrequency: {
      value: `每${averageInteractionInterval}天一次`,
      trend: "↓ 3天", // TODO: 需要历史数据对比
      status: averageInteractionInterval <= 45 ? "良好" : averageInteractionInterval <= 60 ? "注意" : "待改善",
    },
    dormantContactsCount: {
      value: `${dormantCount}人`,
      percentage: `(${dormantPercentage}%)`,
      trend: "↓ 8人", // TODO: 需要历史数据对比
      status: dormantPercentage <= 20 ? "良好" : dormantPercentage <= 30 ? "注意" : "待改善",
    },
    needsFollowUpCount: {
      value: `${needsFollowUpCount}项`,
      trend: "↑ 12项", // TODO: 需要历史数据对比
      status: needsFollowUpCount <= 30 ? "良好" : needsFollowUpCount <= 50 ? "预警" : "严重",
    },
    highValueInteractionRate: {
      value: `${highValueRate}%`,
      trend: "↑ 8%", // TODO: 需要历史数据对比
      status: highValueRate >= 30 ? "优秀" : highValueRate >= 20 ? "良好" : "待改善",
    },
  };
}

/**
 * 获取家长的人脉列表（分页版本）
 * @param parentUserId 用户ID
 * @param searchQuery 搜索关键词
 * @param page 页码（从1开始）
 * @param pageSize 每页数量
 * @returns { total: 总数, contacts: 人脉列表, hasMore: 是否还有更多 }
 */
export async function getContactsByParentPaginated(
  parentUserId: number, 
  searchQuery?: string,
  page: number = 1,
  pageSize: number = 50
) {
  console.log('[getContactsByParentPaginated] 开始查询:', { parentUserId, searchQuery, page, pageSize });
  
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const offset = (page - 1) * pageSize;
  
  // 1. 先查询总数（不包含联络信息，只统计人脉数量）
  let totalQuery;
  if (!searchQuery) {
    totalQuery = db.select({ count: sql<number>`COUNT(*)` })
      .from(contacts)
      .where(eq(contacts.parentUserId, parentUserId));
  } else {
    const searchPattern = `%${searchQuery}%`;
    // 使用UNION去重统计，包含标签搜索
    totalQuery = db.execute(sql`
      SELECT COUNT(DISTINCT c.id) as count
      FROM contacts c
      LEFT JOIN contact_field_values cfv ON c.id = cfv.contactId
      LEFT JOIN contact_tag_relations ctr ON c.id = ctr.contactId
      LEFT JOIN contact_tags ct ON ctr.tagId = ct.id
      LEFT JOIN personal_contact_tags pct ON c.id = pct.contactId
      WHERE c.parentUserId = ${parentUserId}
      AND (
        c.name COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR c.title COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR c.occupation COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR c.phone COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR cfv.value COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR ct.name COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR pct.name COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
      )
    `);
  }
  
  const totalResult = await totalQuery;
  // mysql2 的 execute 返回 [rows, fields]，需要正确解析
  let total = 0;
  if (Array.isArray(totalResult)) {
    // 检查是否是 mysql2 的 [rows, fields] 格式
    if (Array.isArray(totalResult[0])) {
      // mysql2 execute 返回的格式: [[{count: n}], fields]
      total = Number(totalResult[0][0]?.count || 0);
    } else if (totalResult[0]?.count !== undefined) {
      // drizzle select 返回的格式: [{count: n}]
      total = Number(totalResult[0].count || 0);
    }
  }
  console.log('[getContactsByParentPaginated] 查询结果总数:', total, 'totalResult结构:', JSON.stringify(totalResult).substring(0, 200));
  
  // 2. 查询分页数据
  let baseContacts: any[];
  
  if (!searchQuery) {
    baseContacts = await db.select().from(contacts)
      .where(eq(contacts.parentUserId, parentUserId))
      .orderBy(desc(contacts.updatedAt))
      .limit(pageSize)
      .offset(offset);
  } else {
    const searchPattern = `%${searchQuery}%`;
    
    // 使用子查询去重并分页，包含标签搜索
    const result = await db.execute(sql`
      SELECT DISTINCT c.*
      FROM contacts c
      LEFT JOIN contact_field_values cfv ON c.id = cfv.contactId
      LEFT JOIN contact_tag_relations ctr ON c.id = ctr.contactId
      LEFT JOIN contact_tags ct ON ctr.tagId = ct.id
      LEFT JOIN personal_contact_tags pct ON c.id = pct.contactId
      WHERE c.parentUserId = ${parentUserId}
      AND (
        c.name COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR c.title COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR c.occupation COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR c.phone COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR cfv.value COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR ct.name COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
        OR pct.name COLLATE utf8mb4_unicode_ci LIKE ${searchPattern}
      )
      ORDER BY c.updatedAt DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `);
    
    // mysql2 的 execute 返回 [rows, fields]，需要取第一个元素
    console.log('[getContactsByParentPaginated] 原始结果类型:', typeof result, Array.isArray(result));
    console.log('[getContactsByParentPaginated] 原始结果长度:', Array.isArray(result) ? result.length : 'N/A');
    if (Array.isArray(result) && result.length > 0) {
      console.log('[getContactsByParentPaginated] result[0]类型:', typeof result[0], Array.isArray(result[0]));
      if (Array.isArray(result[0]) && result[0].length > 0) {
        console.log('[getContactsByParentPaginated] result[0][0]:', JSON.stringify(result[0][0]).substring(0, 200));
      } else if (!Array.isArray(result[0])) {
        console.log('[getContactsByParentPaginated] result[0]:', JSON.stringify(result[0]).substring(0, 200));
      }
    }
    baseContacts = Array.isArray(result) && Array.isArray(result[0]) ? result[0] as any[] : result as any[];
  }
  
  console.log('[getContactsByParentPaginated] 查询到的联系人数量:', baseContacts.length);
  if (baseContacts.length > 0) {
    console.log('[getContactsByParentPaginated] 第一个联系人:', baseContacts[0]?.name, JSON.stringify(baseContacts[0]).substring(0, 200));
  }
  
  // 3. 为每个人脉添加上次联络日期、距今天数和活跃时间段标记
  // 获取时间范围（基于北京时间）
  const startOfTodayTimestamp = getBeijingTodayStart();
  const startOfWeekTimestamp = getBeijingThisWeekStart();
  const startOfMonthTimestamp = getBeijingThisMonthStart();
  const startOfYearTimestamp = getBeijingThisYearStart();
  
  const contactsWithInteractionInfo = await Promise.all(
    baseContacts.map(async (contact) => {
      const lastInteraction = await getLastInteractionDate(contact.id);
      const daysSinceLastInteraction = lastInteraction 
        ? calculateDaysDifference(lastInteraction, Date.now())
        : null;
      
      // 检查各时间段是否有联络记录
      let hasInteractionToday = false;
      let hasInteractionThisWeek = false;
      let hasInteractionThisMonth = false;
      let hasInteractionThisYear = false;
      
      // 查询该人脉的所有联络记录
      const interactions = await db
        .select({ interactionDate: contactInteractions.interactionDate })
        .from(contactInteractions)
        .where(eq(contactInteractions.contactId, contact.id));
      
      // 检查每个联络记录是否在各时间段内
      for (const interaction of interactions) {
        const interactionTimestamp = typeof interaction.interactionDate === 'number' 
          ? interaction.interactionDate 
          : new Date(interaction.interactionDate).getTime();
        
        if (interactionTimestamp >= startOfTodayTimestamp) {
          hasInteractionToday = true;
        }
        if (interactionTimestamp >= startOfWeekTimestamp) {
          hasInteractionThisWeek = true;
        }
        if (interactionTimestamp >= startOfMonthTimestamp) {
          hasInteractionThisMonth = true;
        }
        if (interactionTimestamp >= startOfYearTimestamp) {
          hasInteractionThisYear = true;
        }
      }
      
      return {
        ...contact,
        lastInteractionDate: lastInteraction,
        daysSinceLastInteraction,
        hasInteractionToday,
        hasInteractionThisWeek,
        hasInteractionThisMonth,
        hasInteractionThisYear,
      };
    })
  );
  
  console.log('[getContactsByParentPaginated] 分页计算:', {
    offset,
    baseContactsLength: baseContacts.length,
    contactsWithInteractionInfoLength: contactsWithInteractionInfo.length,
    total,
    calculation: `${offset} + ${baseContacts.length} < ${total}`,
    hasMore: offset + baseContacts.length < total
  });
  
  const hasMore = offset + baseContacts.length < total;
  
  return {
    total,
    contacts: contactsWithInteractionInfo,
    hasMore,
    page,
    pageSize,
  };
}


/**
 * 获取按筛选类型分类的统计数量（全部/我的/共享）
 * 用于列表页显示"全部/我的/共享"按钮的数字
 * @param parentUserId 用户ID
 * @param filterType 筛选类型: thisWeek, thisMonth, thisYear, weeklyActive, monthlyActive, yearlyActive, todayActive
 * @returns { total, mine, shared }
 */
export async function getFilteredCounts(
  parentUserId: number, 
  filterType: string
): Promise<{ total: number, mine: number, shared: number }> {
  console.log('[getFilteredCounts] 开始查询, 用户ID:', parentUserId, '筛选类型:', filterType);
  
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 获取时间范围
  const thisWeekStart = new Date(getBeijingThisWeekStart());
  const thisMonthStart = new Date(getBeijingThisMonthStart());
  const thisYearStart = new Date(getBeijingThisYearStart());
  const todayStart = new Date(getBeijingTodayStart());
  
  // 获取共享给我的人脉的所有者ID列表
  const sharingConnections = await db
    .select({ sharerId: contactSharingConnections.sharerId })
    .from(contactSharingConnections)
    .where(
      and(
        eq(contactSharingConnections.receiverId, parentUserId),
        eq(contactSharingConnections.status, 'active')
      )
    );
  const sharerIds = sharingConnections.map(conn => conn.sharerId);
  
  let mine = 0;
  let shared = 0;
  
  // 根据筛选类型计算
  if (filterType === 'thisWeek' || filterType === 'thisMonth' || filterType === 'thisYear') {
    // 新增类型：根据createdAt筛选
    let startDate: Date;
    if (filterType === 'thisWeek') {
      startDate = thisWeekStart;
    } else if (filterType === 'thisMonth') {
      startDate = thisMonthStart;
    } else {
      startDate = thisYearStart;
    }
    
    // 统计我的新增人脉
    const mineResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(contacts)
      .where(
        and(
          eq(contacts.parentUserId, parentUserId),
          sql`${contacts.createdAt} >= ${startDate}`
        )
      );
    mine = mineResult[0]?.count || 0;
    
    // 统计共享的新增人脉
    if (sharerIds.length > 0) {
      const sharedResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(contacts)
        .where(
          and(
            inArray(contacts.parentUserId, sharerIds),
            sql`${contacts.createdAt} >= ${startDate}`
          )
        );
      shared = sharedResult[0]?.count || 0;
    }
  } else if (filterType === 'todayActive' || filterType === 'weeklyActive' || filterType === 'monthlyActive' || filterType === 'yearlyActive') {
    // 活跃类型：根据contact_interactions筛选
    // 使用Date对象并转换为SQL格式字符串进行比较
    let startDate: Date;
    if (filterType === 'todayActive') {
      startDate = new Date(getBeijingTodayStart());
    } else if (filterType === 'weeklyActive') {
      startDate = new Date(getBeijingThisWeekStart());
    } else if (filterType === 'monthlyActive') {
      startDate = new Date(getBeijingThisMonthStart());
    } else {
      startDate = new Date(getBeijingThisYearStart());
    }
    // 转换为SQL格式字符串 (YYYY-MM-DD HH:mm:ss)
    const startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
    console.log('[getFilteredCounts] 活跃筛选 startDate:', startDate.toISOString(), 'startDateStr:', startDateStr);
    
    // 获取我的人脉ID
    const myContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.parentUserId, parentUserId));
    const myContactIds = myContacts.map(c => c.id);
    
    // 获取共享人脉ID
    let sharedContactIds: number[] = [];
    if (sharerIds.length > 0) {
      const sharerContacts = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(inArray(contacts.parentUserId, sharerIds));
      sharedContactIds = sharerContacts.map(c => c.id);
    }
    
    // 查询有活跃记录的联系人（使用SQL格式字符串进行比较）
    const activeInteractions = await db
      .select({ contactId: contactInteractions.contactId })
      .from(contactInteractions)
      .where(sql`${contactInteractions.interactionDate} >= ${startDateStr}`);
    
    // 统计我的活跃人脉
    const myActiveSet = new Set<number>();
    for (const interaction of activeInteractions) {
      if (myContactIds.includes(interaction.contactId)) {
        myActiveSet.add(interaction.contactId);
      }
    }
    mine = myActiveSet.size;
    
    // 统计共享的活跃人脉
    const sharedActiveSet = new Set<number>();
    for (const interaction of activeInteractions) {
      if (sharedContactIds.includes(interaction.contactId)) {
        sharedActiveSet.add(interaction.contactId);
      }
    }
    shared = sharedActiveSet.size;
  }
  
  const total = mine + shared;
  const result = { total, mine, shared };
  
  console.log('[getFilteredCounts] 查询结果:', result);
  
  return result;
}
