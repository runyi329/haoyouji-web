import { getDb } from "./db";
import {
  contacts,
  contactInteractions,
  contactTags,
  contactTagRelations,
  contactFieldValues,
  contactFieldCategories,
} from "../drizzle/schema";
import { eq, and, like, inArray, sql, desc } from "drizzle-orm";
import { checkRateLimit, logAIOperation } from "./ai-rate-limit";

/**
 * 获取用户所有可见的人脉ID列表
 */
async function getAllVisibleContactIds(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. 获取自己的人脉ID
  const ownContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.parentUserId, userId));
  
  const ownContactIds = ownContacts.map((c) => c.id);

  // TODO: 2. 获取共享给我的人脉ID（VIP 3 功能，暂时不实现）

  return ownContactIds;
}

/**
 * 搜索人脉
 */
export async function searchContacts(
  userId: number,
  filters: {
    name?: string;
    company?: string;
    region?: string;
    position?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const visibleIds = await getAllVisibleContactIds(userId);
  if (visibleIds.length === 0) {
    return [];
  }

  const conditions = [inArray(contacts.id, visibleIds)];

  if (filters.name) {
    conditions.push(like(contacts.name, `%${filters.name}%`));
  }
  if (filters.company) {
    conditions.push(like(contacts.company, `%${filters.company}%`));
  }
  if (filters.region) {
    conditions.push(like(contacts.region, `%${filters.region}%`));
  }
  if (filters.position) {
    conditions.push(like(contacts.position, `%${filters.position}%`));
  }

  const results = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      phone: contacts.phone,
      company: contacts.company,
      position: contacts.position,
      region: contacts.region,
      gender: contacts.gender,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(and(...conditions));

  return results;
}

/**
 * 统计人脉数量
 */
export async function countContacts(
  userId: number,
  filters?: {
    region?: string;
    company?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const visibleIds = await getAllVisibleContactIds(userId);
  if (visibleIds.length === 0) {
    return 0;
  }

  const conditions = [inArray(contacts.id, visibleIds)];

  if (filters?.region) {
    conditions.push(like(contacts.region, `%${filters.region}%`));
  }
  if (filters?.company) {
    conditions.push(like(contacts.company, `%${filters.company}%`));
  }

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(and(...conditions));

  return result[0]?.count || 0;
}

/**
 * 添加人脉
 */
export async function addContact(
  userId: number,
  data: {
    name: string;
    phone?: string;
    company?: string;
    position?: string;
    region?: string;
    gender?: string;
  }
) {
  // 检查速率限制
  await checkRateLimit(userId, "add_contact");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(contacts).values({
    parentUserId: userId,
    name: data.name,
    phone: data.phone || null,
    company: data.company || null,
    position: data.position || null,
    region: data.region || null,
    gender: data.gender || null,
  });

  // 记录操作日志
  await logAIOperation(userId, "add_contact", { contactId: result[0].insertId, name: data.name });

  return {
    id: result[0].insertId,
    name: data.name,
  };
}

/**
 * 修改人脉信息
 */
export async function updateContact(
  userId: number,
  contactId: number,
  data: {
    name?: string;
    phone?: string;
    company?: string;
    position?: string;
    region?: string;
    gender?: string;
  }
) {
  // 检查速率限制
  await checkRateLimit(userId, "update_contact");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查权限
  const visibleIds = await getAllVisibleContactIds(userId);
  if (!visibleIds.includes(contactId)) {
    throw new Error("无权修改此人脉");
  }

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.company !== undefined) updateData.company = data.company;
  if (data.position !== undefined) updateData.position = data.position;
  if (data.region !== undefined) updateData.region = data.region;
  if (data.gender !== undefined) updateData.gender = data.gender;

  await db
    .update(contacts)
    .set(updateData)
    .where(eq(contacts.id, contactId));

  return { success: true, contactId };
}

/**
 * 删除人脉
 */
export async function deleteContact(userId: number, contactId: number) {
  // 检查速率限制
  await checkRateLimit(userId, "delete_contact");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查权限
  const visibleIds = await getAllVisibleContactIds(userId);
  if (!visibleIds.includes(contactId)) {
    throw new Error("无权删除此人脉");
  }

  // 获取人脉信息用于返回
  const contact = await db
    .select({ name: contacts.name })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  // 删除人脉（级联删除会自动处理相关数据）
  await db.delete(contacts).where(eq(contacts.id, contactId));

  return {
    success: true,
    contactId,
    name: contact[0]?.name || "未知",
  };
}

/**
 * 添加联络记录（打卡）
 */
export async function addContactInteraction(
  userId: number,
  contactId: number,
  note: string
) {
  // 检查速率限制
  await checkRateLimit(userId, "add_interaction");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查权限
  const visibleIds = await getAllVisibleContactIds(userId);
  if (!visibleIds.includes(contactId)) {
    throw new Error("无权为此人脉添加联络记录");
  }

  // 获取人脉姓名
  const contact = await db
    .select({ name: contacts.name })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  // 插入联络记录
  await db.insert(contactInteractions).values({
    contactId,
    interactionDate: new Date().toISOString().split("T")[0],
    notes: note,
  });

  return {
    success: true,
    contactName: contact[0]?.name || "未知",
    note,
  };
}

/**
 * 获取最早的人脉创建时间（用于计算使用天数）
 */
export async function getEarliestContactDate(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const visibleIds = await getAllVisibleContactIds(userId);
  if (visibleIds.length === 0) {
    return null;
  }

  const result = await db
    .select({ createdAt: contacts.createdAt })
    .from(contacts)
    .where(inArray(contacts.id, visibleIds))
    .orderBy(contacts.createdAt)
    .limit(1);

  return result[0]?.createdAt || null;
}

/**
 * 获取人脉的详细信息
 */
export async function getContactDetail(userId: number, contactId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查权限
  const visibleIds = await getAllVisibleContactIds(userId);
  if (!visibleIds.includes(contactId)) {
    throw new Error("无权查看此人脉");
  }

  // 获取基本信息
  const contact = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact[0]) {
    throw new Error("人脉不存在");
  }

  // 获取扩展字段
  const fields = await db
    .select({
      category: contactFieldCategories.name,
      value: contactFieldValues.value,
    })
    .from(contactFieldValues)
    .leftJoin(
      contactFieldCategories,
      eq(contactFieldValues.categoryId, contactFieldCategories.id)
    )
    .where(eq(contactFieldValues.contactId, contactId));

  // 获取标签
  const tags = await db
    .select({ name: contactTags.name })
    .from(contactTagRelations)
    .leftJoin(contactTags, eq(contactTagRelations.tagId, contactTags.id))
    .where(eq(contactTagRelations.contactId, contactId));

  return {
    ...contact[0],
    fields,
    tags: tags.map((t) => t.name),
  };
}

/**
 * 为人脉添加标签
 */
export async function addTagToContact(
  userId: number,
  contactId: number,
  tagName: string
) {
  // 检查速率限制
  await checkRateLimit(userId, "tag_operation");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查权限
  const visibleIds = await getAllVisibleContactIds(userId);
  if (!visibleIds.includes(contactId)) {
    throw new Error("无权为此人脉添加标签");
  }

  // 查找或创建标签
  let tag = await db
    .select()
    .from(contactTags)
    .where(and(eq(contactTags.name, tagName), eq(contactTags.userId, userId)))
    .limit(1);

  let tagId: number;
  if (tag.length === 0) {
    // 创建新标签
    const result = await db.insert(contactTags).values({
      name: tagName,
      userId,
    });
    tagId = result[0].insertId;
  } else {
    tagId = tag[0].id;
  }

  // 检查是否已经有这个标签
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
    return { success: true, message: "标签已存在" };
  }

  // 添加标签关系
  await db.insert(contactTagRelations).values({
    contactId,
    tagId,
  });

  return { success: true, tagName };
}

/**
 * 从人脉移除标签
 */
export async function removeTagFromContact(
  userId: number,
  contactId: number,
  tagName: string
) {
  // 检查速率限制
  await checkRateLimit(userId, "tag_operation");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查权限
  const visibleIds = await getAllVisibleContactIds(userId);
  if (!visibleIds.includes(contactId)) {
    throw new Error("无权移除此人脉的标签");
  }

  // 查找标签
  const tag = await db
    .select()
    .from(contactTags)
    .where(and(eq(contactTags.name, tagName), eq(contactTags.userId, userId)))
    .limit(1);

  if (tag.length === 0) {
    throw new Error("标签不存在");
  }

  // 删除标签关系
  await db
    .delete(contactTagRelations)
    .where(
      and(
        eq(contactTagRelations.contactId, contactId),
        eq(contactTagRelations.tagId, tag[0].id)
      )
    );

  return { success: true, tagName };
}

/**
 * 添加或更新人脉的扩展字段
 */
export async function updateContactField(
  userId: number,
  contactId: number,
  categoryName: string,
  value: string
) {
  // 检查速率限制
  await checkRateLimit(userId, "field_operation");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查权限
  const visibleIds = await getAllVisibleContactIds(userId);
  if (!visibleIds.includes(contactId)) {
    throw new Error("无权修改此人脉的扩展字段");
  }

  // 查找或创建字段分类
  let category = await db
    .select()
    .from(contactFieldCategories)
    .where(
      and(
        eq(contactFieldCategories.name, categoryName),
        eq(contactFieldCategories.userId, userId)
      )
    )
    .limit(1);

  let categoryId: number;
  if (category.length === 0) {
    // 创建新分类
    const result = await db.insert(contactFieldCategories).values({
      name: categoryName,
      userId,
    });
    categoryId = result[0].insertId;
  } else {
    categoryId = category[0].id;
  }

  // 检查是否已有该字段
  const existing = await db
    .select()
    .from(contactFieldValues)
    .where(
      and(
        eq(contactFieldValues.contactId, contactId),
        eq(contactFieldValues.categoryId, categoryId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // 更新现有字段
    await db
      .update(contactFieldValues)
      .set({ value })
      .where(eq(contactFieldValues.id, existing[0].id));
  } else {
    // 插入新字段
    await db.insert(contactFieldValues).values({
      contactId,
      categoryId,
      value,
    });
  }

  return { success: true, categoryName, value };
}

/**
 * 删除人脉的扩展字段
 */
export async function deleteContactField(
  userId: number,
  contactId: number,
  categoryName: string
) {
  // 检查速率限制
  await checkRateLimit(userId, "field_operation");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查权限
  const visibleIds = await getAllVisibleContactIds(userId);
  if (!visibleIds.includes(contactId)) {
    throw new Error("无权删除此人脉的扩展字段");
  }

  // 查找字段分类
  const category = await db
    .select()
    .from(contactFieldCategories)
    .where(
      and(
        eq(contactFieldCategories.name, categoryName),
        eq(contactFieldCategories.userId, userId)
      )
    )
    .limit(1);

  if (category.length === 0) {
    throw new Error("字段分类不存在");
  }

  // 删除字段值
  await db
    .delete(contactFieldValues)
    .where(
      and(
        eq(contactFieldValues.contactId, contactId),
        eq(contactFieldValues.categoryId, category[0].id)
      )
    );

  return { success: true, categoryName };
}

/**
 * 设置人脉的推荐人
 */
export async function setContactReferrer(
  userId: number,
  contactId: number,
  referrerName: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查权限
  const visibleIds = await getAllVisibleContactIds(userId);
  if (!visibleIds.includes(contactId)) {
    throw new Error("无权修改此人脉的推荐人");
  }

  // 查找推荐人
  const referrer = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.name, referrerName),
        eq(contacts.parentUserId, userId)
      )
    )
    .limit(1);

  if (referrer.length === 0) {
    throw new Error(`推荐人「${referrerName}」不存在，请先添加该人脉`);
  }

  // 更新推荐人
  await db
    .update(contacts)
    .set({ referrerId: referrer[0].id })
    .where(eq(contacts.id, contactId));

  return { success: true, referrerName };
}
