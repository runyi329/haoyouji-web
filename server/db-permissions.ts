import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { userFeaturePermissions } from "../drizzle/schema";

/**
 * 获取用户的所有功能权限
 */
export async function getUserPermissions(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    throw new Error("Database not available");
  }
  return await db
    .select()
    .from(userFeaturePermissions)
    .where(eq(userFeaturePermissions.userId, userId));
}

/**
 * 检查用户是否有某个功能的权限
 */
export async function hasFeaturePermission(userId: number, featureKey: string): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    throw new Error("Database not available");
  }
  const result = await db
    .select()
    .from(userFeaturePermissions)
    .where(
      and(
        eq(userFeaturePermissions.userId, userId),
        eq(userFeaturePermissions.featureKey, featureKey)
      )
    )
    .limit(1);
  
  // 如果没有记录，根据功能类型决定默认值
  if (result.length === 0) {
    // 这些新功能默认关闭
    const defaultOffFeatures = ['my-equity', 'node-growth', 'my-points', 'ai-assistant'];
    if (defaultOffFeatures.includes(featureKey)) {
      return false;
    }
    // 其他功能默认开启(向后兼容)
    return true;
  }
  
  return result[0].isEnabled;
}

/**
 * 设置用户的功能权限
 */
export async function setFeaturePermission(userId: number, featureKey: string, isEnabled: boolean) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    throw new Error("Database not available");
  }
  
  // 检查是否已存在
  const existing = await db
    .select()
    .from(userFeaturePermissions)
    .where(
      and(
        eq(userFeaturePermissions.userId, userId),
        eq(userFeaturePermissions.featureKey, featureKey)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    // 更新
    await db
      .update(userFeaturePermissions)
      .set({ isEnabled, updatedAt: new Date() })
      .where(eq(userFeaturePermissions.id, existing[0].id));
  } else {
    // 插入
    await db.insert(userFeaturePermissions).values({
      userId,
      featureKey,
      isEnabled,
    });
  }
}

/**
 * 批量设置用户的功能权限
 */
export async function setUserPermissions(userId: number, permissions: { featureKey: string; isEnabled: boolean }[]) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    throw new Error("Database not available");
  }
  
  for (const perm of permissions) {
    await setFeaturePermission(userId, perm.featureKey, perm.isEnabled);
  }
}

/**
 * 获取所有可用的功能列表
 */
export function getAllFeatures() {
  return [
    { key: "games", name: "游戏", description: "各类益智游戏" },
    { key: "knowledge", name: "知识", description: "知识学习模块" },
    { key: "logic", name: "逻辑", description: "逻辑思维训练" },
    { key: "social", name: "社交", description: "社交功能" },
    { key: "exercise", name: "锻炼计数", description: "健康锻炼记录系统" },
    { key: "reading", name: "阅读", description: "阅读故事功能" },
    { key: "my-equity", name: "我的股权", description: "查看和管理个人股权" },
    { key: "node-growth", name: "节点成长", description: "节点成长跟踪和管理" },
    { key: "my-points", name: "我的积分", description: "积分系统和奖励" },
    { key: "ai-assistant", name: "AI助手", description: "AI智能助手功能" },
  ];
}
