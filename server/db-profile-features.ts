import { getDb } from "./db";
import { userPreferences } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * 获取用户的常用功能列表
 */
export async function getUserFavoriteFeatures(userId: number, userRole?: string): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const prefs = await db
    .select({ favoriteFeatures: userPreferences.favoriteFeatures })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (prefs.length === 0 || !prefs[0].favoriteFeatures) {
    // 根据用户角色返回默认常用功能
    if (userRole === "super_admin") {
      return ["admin-panel", "edit-profile"];
    }
    return ["edit-profile"];
  }

  return prefs[0].favoriteFeatures;
}

/**
 * 保存用户的常用功能配置
 */
export async function saveUserFavoriteFeatures(
  userId: number,
  featureIds: string[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  console.log('[saveUserFavoriteFeatures] userId:', userId);
  console.log('[saveUserFavoriteFeatures] featureIds:', featureIds);
  
  // 检查是否已有记录
  const existing = await db
    .select({ id: userPreferences.id })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  console.log('[saveUserFavoriteFeatures] existing:', existing);

  if (existing.length === 0) {
    // 创建新记录
    console.log('[saveUserFavoriteFeatures] Inserting new record');
    const insertData = {
      userId: userId,
      favoriteFeatures: featureIds,
    };
    console.log('[saveUserFavoriteFeatures] insertData:', JSON.stringify(insertData));
    await db.insert(userPreferences).values(insertData as any);
  } else {
    // 更新现有记录
    console.log('[saveUserFavoriteFeatures] Updating existing record');
    const updateData = {
      favoriteFeatures: featureIds,
    };
    console.log('[saveUserFavoriteFeatures] updateData:', JSON.stringify(updateData));
    await db
      .update(userPreferences)
      .set(updateData as any)
      .where(eq(userPreferences.userId, userId));
  }
  
  console.log('[saveUserFavoriteFeatures] Save completed');
}
