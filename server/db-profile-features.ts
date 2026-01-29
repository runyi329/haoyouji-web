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
  
  // 检查是否已有记录
  const existing = await db
    .select({ id: userPreferences.id })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (existing.length === 0) {
    // 创建新记录
    await db.insert(userPreferences).values({
      userId,
      favoriteFeatures: featureIds,
    });
  } else {
    // 更新现有记录
    await db
      .update(userPreferences)
      .set({
        favoriteFeatures: featureIds,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, userId));
  }
}
