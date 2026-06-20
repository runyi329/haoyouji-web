import { getDb } from "./db";
import { exerciseTypes, exerciseRecords, parentPasswords, type ExerciseType, type ExerciseRecord, type ParentPassword } from "../drizzle/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";

/**
 * 创建锻炼项目
 */
export async function createExerciseType(userId: number, name: string, icon: string = "💪"): Promise<ExerciseType> {
  const db = await getDb();
  
  if (!db) throw new Error("Database not available");
  
  // 获取当前最大的sortOrder
  const maxOrderResult = await db.select({ maxOrder: exerciseTypes.sortOrder })
    .from(exerciseTypes)
    .where(eq(exerciseTypes.userId, userId))
    .orderBy(desc(exerciseTypes.sortOrder))
    .limit(1);
  
  const nextOrder = maxOrderResult.length > 0 && maxOrderResult[0].maxOrder !== null ? maxOrderResult[0].maxOrder + 1 : 0;
  const [exerciseType] = await db.insert(exerciseTypes).values({
    userId,
    name,
    icon,
    isActive: true,
    sortOrder: nextOrder,
  }).$returningId();
  
  const [result] = await db.select().from(exerciseTypes).where(eq(exerciseTypes.id, exerciseType.id));
  return result;
}

/**
 * 获取用户的所有锻炼项目
 */
export async function getExerciseTypes(userId: number): Promise<ExerciseType[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(exerciseTypes)
    .where(and(eq(exerciseTypes.userId, userId), eq(exerciseTypes.isActive, true)))
    .orderBy(exerciseTypes.sortOrder, exerciseTypes.createdAt);
}

/**
 * 更新锻炼项目
 */
export async function updateExerciseType(id: number, userId: number, data: { name?: string; icon?: string }): Promise<ExerciseType | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(exerciseTypes).set(data).where(and(eq(exerciseTypes.id, id), eq(exerciseTypes.userId, userId)));
  
  const [result] = await db.select().from(exerciseTypes).where(eq(exerciseTypes.id, id));
  return result || null;
}

/**
 * 删除锻炼项目
 */
export async function deleteExerciseType(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  
  if (!db) throw new Error("Database not available");
  
  // 软删除：只标记为不激活，不删除数据
  const result = await db.update(exerciseTypes)
    .set({ isActive: false })
    .where(and(eq(exerciseTypes.id, id), eq(exerciseTypes.userId, userId)));
  return result.rowsAffected > 0;
}

/**
 * 创建或更新锻炼记录
 */
export async function upsertExerciseRecord(
  userId: number,
  exerciseTypeId: number,
  count: number,
  recordDate: string
): Promise<ExerciseRecord> {
  const db = await getDb();
  
  if (!db) throw new Error("Database not available");
  
  // 检查是否已存在该日期的记录
  const [existing] = await db.select().from(exerciseRecords).where(
    and(
      eq(exerciseRecords.userId, userId),
      eq(exerciseRecords.exerciseTypeId, exerciseTypeId),
      eq(exerciseRecords.recordDate, recordDate)
    )
  );
  
  if (existing) {
    // 更新现有记录
    await db.update(exerciseRecords).set({ count }).where(eq(exerciseRecords.id, existing.id));
    const [updated] = await db.select().from(exerciseRecords).where(eq(exerciseRecords.id, existing.id));
    return updated;
  } else {
    // 创建新记录
    const [record] = await db.insert(exerciseRecords).values({
      userId,
      exerciseTypeId,
      count,
      recordDate,
    }).$returningId();
    
    const [result] = await db.select().from(exerciseRecords).where(eq(exerciseRecords.id, record.id));
    return result;
  }
}

/**
 * 获取指定日期范围的锻炼记录
 */
export async function getExerciseRecordsByDateRange(
  userId: number,
  exerciseTypeId: number,
  startDate: string,
  endDate: string
): Promise<ExerciseRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(exerciseRecords).where(
    and(
      eq(exerciseRecords.userId, userId),
      eq(exerciseRecords.exerciseTypeId, exerciseTypeId),
      gte(exerciseRecords.recordDate, startDate),
      lte(exerciseRecords.recordDate, endDate)
    )
  ).orderBy(desc(exerciseRecords.recordDate));
}

/**
 * 删除锻炼记录
 */
export async function deleteExerciseRecord(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.delete(exerciseRecords).where(and(eq(exerciseRecords.id, id), eq(exerciseRecords.userId, userId)));
  return result.rowsAffected > 0;
}

/**
 * 设置家长密码
 */
export async function setParentPassword(userId: number, password: string): Promise<ParentPassword> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const passwordHash = await bcrypt.hash(password, 10);
  
  // 检查是否已存在密码
  const [existing] = await db.select().from(parentPasswords).where(eq(parentPasswords.userId, userId));
  
  if (existing) {
    // 更新现有密码
    await db.update(parentPasswords).set({ passwordHash }).where(eq(parentPasswords.userId, userId));
    const [updated] = await db.select().from(parentPasswords).where(eq(parentPasswords.userId, userId));
    return updated;
  } else {
    // 创建新密码
    const [record] = await db.insert(parentPasswords).values({
      userId,
      passwordHash,
    }).$returningId();
    
    const [result] = await db.select().from(parentPasswords).where(eq(parentPasswords.id, record.id));
    return result;
  }
}

/**
 * 验证家长密码
 */
export async function verifyParentPassword(userId: number, password: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [record] = await db.select().from(parentPasswords).where(eq(parentPasswords.userId, userId));
  
  if (!record) {
    return false;
  }
  
  return await bcrypt.compare(password, record.passwordHash);
}

/**
 * 检查用户是否已设置家长密码
 */
export async function hasParentPassword(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [record] = await db.select().from(parentPasswords).where(eq(parentPasswords.userId, userId));
  return !!record;
}
