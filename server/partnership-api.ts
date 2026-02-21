import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq, and, or, like, notInArray, inArray } from 'drizzle-orm';

/**
 * 有限合伙企业成员管理API
 * 
 * 简化设计：
 * - 目前只有一个企业"上海煦斌教育科技合伙企业（有限合伙）"（写死）
 * - 工作群固定为群1、群2、群3（写死）
 * - 使用users表存储成员信息
 * - 使用新的partnership_members表存储成员关联
 */

// 固定的企业ID（写死）
const PARTNERSHIP_ID = 1;
const PARTNERSHIP_NAME = "上海煦斌教育科技合伙企业（有限合伙）";

// 固定的工作群（写死）
const WORK_GROUPS = [
  { id: 1, name: "群1" },
  { id: 2, name: "群2" },
  { id: 3, name: "群3" },
];

/**
 * 搜索可添加的用户
 * @param keyword 搜索关键词（用户名、邮箱）
 * @param currentUserId 当前用户ID
 * @returns 用户列表（排除已是成员的用户）
 */
export async function searchAvailableUsers(keyword: string, currentUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // TODO: 获取已是成员的用户ID列表
  // 目前先返回所有匹配的用户
  
  const searchPattern = `%${keyword}%`;
  
  const availableUsers = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      avatar: users.avatar,
    })
    .from(users)
    .where(
      and(
        or(
          like(users.username, searchPattern),
          like(users.name, searchPattern),
          like(users.email, searchPattern)
        ),
        eq(users.isLocked, 0)
      )
    )
    .limit(20);

  return availableUsers;
}

/**
 * 添加成员到企业和工作群
 * @param userId 要添加的用户ID
 * @param workGroupIds 工作群ID列表（可多选）
 * @param operatorId 操作人ID
 */
export async function addPartnershipMember(
  userId: number,
  workGroupIds: number[],
  operatorId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // TODO: 实现添加成员逻辑
  // 1. 检查用户是否已是成员
  // 2. 添加到partnership_members表
  // 3. 添加到work_group_members表
  // 4. 初始化member_scores表

  return {
    success: true,
    message: "成员添加成功",
  };
}

/**
 * 获取企业成员列表
 * @returns 成员列表（包含工作群信息）
 */
export async function getPartnershipMembers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // TODO: 实现获取成员列表逻辑
  // 1. 从partnership_members表获取成员
  // 2. 关联users表获取用户信息
  // 3. 关联work_group_members表获取工作群信息
  // 4. 关联member_scores表获取得分信息

  // 临时返回模拟数据
  return [
    {
      id: 1,
      userId: 1,
      name: "张三",
      avatar: "/default-avatar.png",
      workGroups: [1, 2],
      totalScore: 1280,
      joinedAt: new Date().toISOString(),
    },
  ];
}

/**
 * 获取成员详情
 * @param memberId 成员ID
 * @returns 成员详情（包含五维得分、行为记录等）
 */
export async function getMemberDetail(memberId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // TODO: 实现获取成员详情逻辑
  // 1. 从partnership_members表获取成员基本信息
  // 2. 从member_scores表获取五维得分
  // 3. 从member_activities表获取行为记录
  // 4. 从member_notes表获取经营者备注

  return null;
}

/**
 * 检查用户是否有权限管理企业
 * @param userId 用户ID
 * @returns 是否有权限
 */
export async function checkPartnershipPermission(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查是否是super_admin
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));

  return user?.role === 'super_admin';
}
