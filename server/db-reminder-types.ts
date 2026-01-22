import { getDb } from "./db";
import { reminderTypes, type InsertReminderType, type ReminderType } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * 创建提醒类型
 */
export async function createReminderType(data: InsertReminderType): Promise<ReminderType> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(reminderTypes).values(data);
  const insertId = result[0].insertId;
  
  const [newType] = await db.select().from(reminderTypes).where(eq(reminderTypes.id, insertId));
  return newType;
}

/**
 * 获取用户的所有提醒类型（包括默认类型）
 */
export async function getReminderTypesByUserId(userId: number): Promise<ReminderType[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  const results = await db
    .select()
    .from(reminderTypes)
    .where(eq(reminderTypes.userId, userId));
  return results;
}

/**
 * 更新提醒类型
 */
export async function updateReminderType(
  id: number,
  userId: number,
  data: Partial<InsertReminderType>
): Promise<ReminderType | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  await db
    .update(reminderTypes)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(reminderTypes.id, id), eq(reminderTypes.userId, userId)));

  const [result] = await db.select().from(reminderTypes).where(eq(reminderTypes.id, id));
  return result || null;
}

/**
 * 删除提醒类型（不能删除默认类型）
 */
export async function deleteReminderType(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  // 检查是否为默认类型
  const [type] = await db
    .select()
    .from(reminderTypes)
    .where(and(eq(reminderTypes.id, id), eq(reminderTypes.userId, userId)));

  if (!type || type.isDefault) {
    return false;
  }

  await db.delete(reminderTypes).where(and(eq(reminderTypes.id, id), eq(reminderTypes.userId, userId)));
  return true;
}

/**
 * 获取单个提醒类型
 */
export async function getReminderTypeById(id: number, userId: number): Promise<ReminderType | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const [result] = await db
    .select()
    .from(reminderTypes)
    .where(and(eq(reminderTypes.id, id), eq(reminderTypes.userId, userId)));
  return result || null;
}
