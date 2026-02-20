import { getDb } from './db';
import { workGroups, ledgers } from '../drizzle/schema';
import { eq, and, or, desc, sql } from 'drizzle-orm';

/**
 * 脉动节点工作平台 - 工作群数据库操作
 */

// 创建工作群
export async function createWorkGroup(data: {
  name: string;
  description?: string;
  icon?: string;
  createdBy: number;
  ownerId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(workGroups).values({
    name: data.name,
    description: data.description,
    icon: data.icon,
    createdBy: data.createdBy,
    ownerId: data.ownerId,
    isArchived: 0,
  });
  
  return result;
}

// 获取用户的所有工作群（包括创建的和参与的）
export async function getUserWorkGroups(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 获取用户创建或拥有的工作群
  const ownedGroups = await db
    .select()
    .from(workGroups)
    .where(
      and(
        or(
          eq(workGroups.ownerId, userId),
          eq(workGroups.createdBy, userId)
        ),
        eq(workGroups.isArchived, 0)
      )
    )
    .orderBy(desc(workGroups.updatedAt));

  return ownedGroups;
}

// 获取工作群详情
export async function getWorkGroupById(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [group] = await db
    .select()
    .from(workGroups)
    .where(eq(workGroups.id, groupId));
  
  return group;
}

// 更新工作群信息
export async function updateWorkGroup(
  groupId: number,
  data: {
    name?: string;
    description?: string;
    icon?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db
    .update(workGroups)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workGroups.id, groupId));
  
  return result;
}

// 删除（归档）工作群
export async function archiveWorkGroup(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db
    .update(workGroups)
    .set({
      isArchived: 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workGroups.id, groupId));
  
  return result;
}

// 获取工作群中的所有人员（账本）
export async function getWorkGroupMembers(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const members = await db
    .select()
    .from(ledgers)
    .where(
      and(
        // eq(ledgers.groupId, groupId), // 临时注释等待数据库迁移
        sql`1=0`, // 临时返回空结果
        eq(ledgers.isArchived, 0)
      )
    )
    .orderBy(desc(ledgers.updatedAt));
  
  return members;
}

// 在工作群中创建人员（账本）
export async function createWorkGroupMember(data: {
  groupId: number;
  name: string;
  description?: string;
  icon?: string;
  createdBy: number;
  ownerId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(ledgers).values({
    // groupId: data.groupId, // 临时注释等待数据库迁移
    name: data.name,
    description: data.description,
    icon: data.icon,
    type: 'work_node', // 工作节点类型
    currency: 'CNY',
    createdBy: data.createdBy,
    ownerId: data.ownerId,
    isVip: 0,
    isArchived: 0,
    defaultPermissionView: 'all',
    defaultPermissionAdd: 'all',
    defaultPermissionEdit: 'own',
    defaultPermissionDelete: 'own',
  });
  
  return result;
}

// 检查用户是否有权限访问工作群
export async function checkWorkGroupPermission(groupId: number, userId: number): Promise<boolean> {
  const group = await getWorkGroupById(groupId);
  
  if (!group) {
    return false;
  }
  
  // 检查是否是创建者或所有者
  if (group.ownerId === userId || group.createdBy === userId) {
    return true;
  }
  
  // TODO: 后续可以添加更多权限检查逻辑
  // 例如：检查是否是工作群中某个账本的成员
  
  return false;
}
