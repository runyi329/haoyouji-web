import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq, desc, sql, like } from "drizzle-orm";

/**
 * 新积分系统数据库操作
 * 使用 point_rules 和 point_logs 表（通过原生 SQL，因为这些表不在 schema.ts 中）
 */

// 定义类型
interface PointRule {
  id: number;
  actionType: string;
  actionName: string;
  points: number;
  isActive: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PointLog {
  id: number;
  userId: number;
  actionType?: string;
  points: number;
  description: string;
  operatorId?: number;
  relatedId?: number;
  createdAt: Date;
}

// ==================== 积分规则 CRUD ====================

/**
 * 获取所有积分规则
 */
export async function getAllPointRules(): Promise<PointRule[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const result: any = await db.execute(sql`SELECT * FROM point_rules ORDER BY id`);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[PointSystem] Error fetching point rules:", error);
    return [];
  }
}

/**
 * 获取单个积分规则
 */
export async function getPointRuleByActionType(actionType: string): Promise<PointRule | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result: any = await db.execute(
      sql`SELECT * FROM point_rules WHERE actionType = ${actionType} LIMIT 1`
    );
    const rows = Array.isArray(result) ? result : [];
    return rows[0] || null;
  } catch (error) {
    console.error("[PointSystem] Error fetching point rule:", error);
    return null;
  }
}

/**
 * 更新积分规则
 */
export async function updatePointRule(
  actionType: string,
  data: { points?: number; isActive?: boolean; description?: string }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  try {
    const updates: string[] = [];
    
    if (data.points !== undefined) {
      await db.execute(
        sql`UPDATE point_rules SET points = ${data.points} WHERE actionType = ${actionType}`
      );
    }
    if (data.isActive !== undefined) {
      await db.execute(
        sql`UPDATE point_rules SET isActive = ${data.isActive} WHERE actionType = ${actionType}`
      );
    }
    if (data.description !== undefined) {
      await db.execute(
        sql`UPDATE point_rules SET description = ${data.description} WHERE actionType = ${actionType}`
      );
    }
  } catch (error) {
    console.error("[PointSystem] Error updating point rule:", error);
  }
}

// ==================== 积分变动记录 ====================

/**
 * 创建积分变动记录
 */
export async function createPointLog(data: {
  userId: number;
  actionType?: string;
  points: number;
  description: string;
  operatorId?: number;
  relatedId?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  try {
    await db.execute(sql`
      INSERT INTO point_logs (userId, actionType, points, description, operatorId, relatedId)
      VALUES (${data.userId}, ${data.actionType || null}, ${data.points}, ${data.description}, ${data.operatorId || null}, ${data.relatedId || null})
    `);
  } catch (error) {
    console.error("[PointSystem] Error creating point log:", error);
  }
}

/**
 * 获取用户的积分变动记录
 */
export async function getUserPointLogs(userId: number, limit: number = 50): Promise<PointLog[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const result: any = await db.execute(sql`
      SELECT * FROM point_logs 
      WHERE userId = ${userId} 
      ORDER BY createdAt DESC 
      LIMIT ${limit}
    `);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[PointSystem] Error fetching user point logs:", error);
    return [];
  }
}

/**
 * 获取所有积分变动记录（管理员用）
 */
export async function getAllPointLogs(limit: number = 100): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const result: any = await db.execute(sql`
      SELECT pl.*, u.username, u.name 
      FROM point_logs pl
      LEFT JOIN users u ON pl.userId = u.id
      ORDER BY pl.createdAt DESC 
      LIMIT ${limit}
    `);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[PointSystem] Error fetching all point logs:", error);
    return [];
  }
}

// ==================== 用户积分操作 ====================

/**
 * 获取用户当前积分
 */
export async function getUserPoints(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  try {
    const result = await db
      .select({ points: users.points })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
      
    return result[0]?.points ?? 0;
  } catch (error) {
    console.error("[PointSystem] Error fetching user points:", error);
    return 0;
  }
}

/**
 * 增加用户积分
 */
export async function addUserPoints(userId: number, points: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  try {
    await db.execute(sql`
      UPDATE users 
      SET points = points + ${points} 
      WHERE id = ${userId}
    `);
  } catch (error) {
    console.error("[PointSystem] Error adding user points:", error);
  }
}

/**
 * 减少用户积分
 */
export async function subtractUserPoints(userId: number, points: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  try {
    await db.execute(sql`
      UPDATE users 
      SET points = GREATEST(0, points - ${points})
      WHERE id = ${userId}
    `);
  } catch (error) {
    console.error("[PointSystem] Error subtracting user points:", error);
  }
}

// ==================== 核心积分奖励逻辑 ====================

/**
 * 为用户的某个行为添加积分
 * @param userId 用户ID
 * @param actionType 行为类型
 * @param relatedId 关联ID（可选，如联系人ID）
 * @returns 是否成功添加积分
 */
export async function addPointsForAction(
  userId: number,
  actionType: string,
  relatedId?: number
): Promise<boolean> {
  try {
    // 1. 获取该行为的积分规则
    const rule = await getPointRuleByActionType(actionType);
    
    if (!rule || !rule.isActive || rule.points <= 0) {
      return false; // 规则不存在、未启用或积分为0
    }

    // 2. 增加用户积分
    await addUserPoints(userId, rule.points);

    // 3. 记录积分变动
    await createPointLog({
      userId,
      actionType,
      points: rule.points,
      description: `${rule.actionName}：+${rule.points}分`,
      relatedId,
    });

    return true;
  } catch (error) {
    console.error("[PointSystem] Error adding points for action:", error);
    return false;
  }
}

/**
 * 管理员手动调整用户积分
 * @param userId 用户ID
 * @param points 积分变动值（正数=增加，负数=减少）
 * @param description 变动描述
 * @param operatorId 操作者ID（管理员ID）
 */
export async function adjustUserPointsByAdmin(
  userId: number,
  points: number,
  description: string,
  operatorId: number
): Promise<void> {
  try {
    // 1. 更新用户积分
    if (points > 0) {
      await addUserPoints(userId, points);
    } else if (points < 0) {
      await subtractUserPoints(userId, Math.abs(points));
    }

    // 2. 记录积分变动
    await createPointLog({
      userId,
      points,
      description: `管理员调整：${description}`,
      operatorId,
    });
  } catch (error) {
    console.error("[PointSystem] Error adjusting user points by admin:", error);
  }
}

// ==================== 批量查询 ====================

/**
 * 获取所有用户及其积分（分页）
 */
export async function getAllUsersWithPoints(page: number = 1, pageSize: number = 50) {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const offset = (page - 1) * pageSize;
    
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        points: users.points,
        role: users.role,
      })
      .from(users)
      .orderBy(desc(users.points))
      .limit(pageSize)
      .offset(offset);

    return result;
  } catch (error) {
    console.error("[PointSystem] Error fetching all users with points:", error);
    return [];
  }
}

/**
 * 搜索用户（按用户名）
 */
export async function searchUsersByUsername(keyword: string) {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const result: any = await db.execute(sql`
      SELECT id, username, name, points, role 
      FROM users 
      WHERE username LIKE ${`%${keyword}%`} 
      ORDER BY points DESC 
      LIMIT 20
    `);
    
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[PointSystem] Error searching users:", error);
    return [];
  }
}
