import { getLedgerDb } from "./db";
import { ledgers, ledgerMembers, ledgerCategories, ledgerRecords } from "../drizzle/schema";
import { eq, and, desc, sql, isNull, asc } from "drizzle-orm";

/**
 * 获取用户的所有账本（包括自己创建的和参与的）
 */
export async function getUserLedgers(userId: number, isArchived: boolean = false) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 获取用户参与的所有账本ID
  const memberRecords = await db
    .select({ ledgerId: ledgerMembers.ledgerId, role: ledgerMembers.role })
    .from(ledgerMembers)
    .where(eq(ledgerMembers.userId, userId));

  const ledgerIds = memberRecords.map((m: any) => m.ledgerId);

  if (ledgerIds.length === 0) {
    return [];
  }

  // 获取账本详情
  const ledgerList = await db
    .select()
    .from(ledgers)
    .where(
      and(
        sql`${ledgers.id} IN (${sql.join(ledgerIds, sql`, `)})`,
        eq(ledgers.isArchived, isArchived)
      )
    )
    .orderBy(desc(ledgers.updatedAt));

  // 为每个账本获取成员信息
  const result = await Promise.all(
    ledgerList.map(async (ledger: any) => {
      // 使用账本数据库连接
      const members = await db
        .select({
          userId: ledgerMembers.userId,
          role: ledgerMembers.role,
        })
        .from(ledgerMembers)
        .where(eq(ledgerMembers.ledgerId, ledger.id))
        .limit(4); // 最多显示4个成员头像

      const memberCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(ledgerMembers)
        .where(eq(ledgerMembers.ledgerId, ledger.id))
        .then((rows: any[]) => rows[0]?.count || 0);

      // 获取当前用户在这个账本中的角色
      const userRole = memberRecords.find((m: any) => m.ledgerId === ledger.id)?.role || "member";

      return {
        ...ledger,
        members,
        memberCount,
        userRole,
      };
    })
  );

  return result;
}

/**
 * 创建新账本
 */
export async function createLedger(data: {
  name: string;
  description?: string;
  type?: string;
  currency?: string;
  createdBy: number;
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 使用原始 SQL 插入账本，避免 Drizzle 类型推断问题
  let newLedgerId: number;
  try {
    console.log("[createLedger] 开始插入账本，数据:", {
      name: data.name,
      description: data.description ?? null,
      type: data.type ?? "personal",
      currency: data.currency ?? "CNY",
      createdBy: data.createdBy
    });
    
    const result = await db.execute(sql`
      INSERT INTO ledgers (name, description, type, currency, icon, createdBy, ownerId, isVip, isArchived)
      VALUES (${data.name}, ${data.description ?? null}, ${data.type ?? "personal"}, ${data.currency ?? "CNY"}, ${null}, ${data.createdBy}, ${data.createdBy}, ${0}, ${0})
    `);
    
    console.log("[createLedger] result 结构:", JSON.stringify(result, null, 2));
    
    // TiDB 返回的是数组，需要从第一个元素获取 insertId
    newLedgerId = Number((result as any)[0]?.insertId || result.insertId);
    console.log("[createLedger] 账本插入成功， ID:", newLedgerId);
  } catch (error) {
    console.error("[createLedger] 插入账本失败:", error);
    throw error;
  }

  // 将创建者添加为账本所有者
  await db.insert(ledgerMembers).values({
    ledgerId: newLedgerId,
    userId: data.createdBy,
    role: "owner",
    memberType: "real",
    permissionView: "all",
    permissionAdd: "all",
    permissionEdit: "all",
    permissionDelete: "all",
    canEdit: 1,
    canDelete: 1,
    canInvite: 1,
  });

  // 创建默认分类
  const defaultCategories = [
    // 收入分类
    { name: "工资", type: "income" as const, icon: "💰", color: "#10b981" },
    { name: "奖金", type: "income" as const, icon: "🎁", color: "#10b981" },
    { name: "投资收益", type: "income" as const, icon: "📈", color: "#10b981" },
    { name: "其他收入", type: "income" as const, icon: "💵", color: "#10b981" },
    // 支出分类
    { name: "餐饮", type: "expense" as const, icon: "🍜", color: "#ef4444" },
    { name: "交通", type: "expense" as const, icon: "🚗", color: "#ef4444" },
    { name: "购物", type: "expense" as const, icon: "🛍️", color: "#ef4444" },
    { name: "娱乐", type: "expense" as const, icon: "🎮", color: "#ef4444" },
    { name: "医疗", type: "expense" as const, icon: "💊", color: "#ef4444" },
    { name: "教育", type: "expense" as const, icon: "📚", color: "#ef4444" },
    { name: "住房", type: "expense" as const, icon: "🏠", color: "#ef4444" },
    { name: "其他支出", type: "expense" as const, icon: "💸", color: "#ef4444" },
  ];

  await db.insert(ledgerCategories).values(
    defaultCategories.map((cat, index) => ({
      ledgerId: newLedgerId,
      name: cat.name,
      type: cat.type,
      icon: cat.icon,
      color: cat.color,
      sortOrder: index,
      isDefault: true,
      createdBy: data.createdBy,
    }))
  );

  return { id: newLedgerId, name: data.name };
}

/**
 * 获取单个账本详情
 */
export async function getLedgerById(ledgerId: number, userId: number) {
  console.log('[getLedgerById] 调用，参数:', { ledgerId, userId });
  
  try {
    const db = await getLedgerDb();
    if (!db) {
      console.error('[getLedgerById] 数据库连接失败');
      throw new Error("Ledger database connection failed");
    }
    console.log('[getLedgerById] 数据库连接成功');
    
    // 检查用户是否是账本成员
    console.log('[getLedgerById] 开始检查成员权限...');
    const member = await db
      .select()
      .from(ledgerMembers)
      .where(
        and(
          eq(ledgerMembers.ledgerId, ledgerId),
          eq(ledgerMembers.userId, userId)
        )
      )
      .limit(1);

    console.log('[getLedgerById] 成员检查结果:', member);
    if (member.length === 0) {
      console.log('[getLedgerById] 用户不是账本成员');
      throw new Error("您不是该账本的成员");
    }

    // 获取账本信息
    console.log('[getLedgerById] 开始查询账本信息...');
    const ledger = await db
      .select()
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId))
      .limit(1);

    console.log('[getLedgerById] 账本查询结果:', ledger);
    if (ledger.length === 0) {
      throw new Error("账本不存在");
    }

    // 获取所有成员
    console.log('[getLedgerById] 开始查询成员列表...');
    const members = await db
      .select({
        userId: ledgerMembers.userId,
        role: ledgerMembers.role,
        nickname: ledgerMembers.nickname,
      })
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, ledgerId));

    console.log('[getLedgerById] 成员列表:', members);
    const result = {
      ...ledger[0],
      members,
      userRole: member[0].role,
    };
    console.log('[getLedgerById] 返回结果:', result);
    return result;
  } catch (error) {
    console.error('[getLedgerById] 错误:', error);
    throw error;
  }
}

/**
 * 存档/取消存档账本
 */
export async function archiveLedger(ledgerId: number, userId: number, isArchived: boolean) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 检查用户权限（只有所有者和管理员可以存档）
  const member = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .then((rows: any[]) => rows[0]);

  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    throw new Error("没有权限存档此账本");
  }

  await db
    .update(ledgers)
    .set({ isArchived, updatedAt: new Date() })
    .where(eq(ledgers.id, ledgerId));

  return true;
}

/**
 * 删除账本
 */
export async function deleteLedger(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 检查用户权限（只有所有者可以删除）
  const member = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .then((rows: any[]) => rows[0]);

  if (!member || member.role !== "owner") {
    throw new Error("只有账本所有者可以删除账本");
  }

  // 删除所有相关数据
  await db.delete(ledgerRecords).where(eq(ledgerRecords.ledgerId, ledgerId));
  await db.delete(ledgerCategories).where(eq(ledgerCategories.ledgerId, ledgerId));
  // TODO: 删除预算数据（待实现）
  // await db.delete(ledgerBudgets).where(eq(ledgerBudgets.ledgerId, ledgerId));
  await db.delete(ledgerMembers).where(eq(ledgerMembers.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, ledgerId));

  return true;
}

/**
 * 加入账本（通过邀请码）
 */
export async function joinLedger(ledgerId: number, userId: number, invitedBy: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 检查账本是否存在
  const ledger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .then((rows: any[]) => rows[0]);

  if (!ledger) {
    throw new Error("账本不存在");
  }

  // 检查用户是否已经是成员
  const existingMember = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .then((rows: any[]) => rows[0]);

  if (existingMember) {
    throw new Error("您已经是此账本的成员");
  }

  // 添加为成员
  await db.insert(ledgerMembers).values({
    ledgerId,
    userId,
    role: "member",
    memberType: "real",
    permissionView: "all",
    permissionAdd: "all",
    permissionEdit: "own",
    permissionDelete: "own",
    canEdit: true,
    canDelete: false,
    canInvite: false,
    invitedBy,
  });

  return true;
}

/**
 * 获取账本的所有分类（包括子分类）
 */
export async function getLedgerCategories(
  ledgerId: number,
  userId?: number,
  type?: 'income' | 'expense',
  parentId?: number | null
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 如果提供userId，验证用户是否是账本成员
  if (userId) {
    await verifyLedgerMember(ledgerId, userId);
  }
  
  // 构建查询条件：同时查询预设分类（ledgerId=0）和用户自定义分类（ledgerId=具体账本ID）
  const ledgerConditions = [eq(ledgerCategories.ledgerId, ledgerId)];
  const defaultConditions = [eq(ledgerCategories.ledgerId, 0)];
  
  if (type) {
    ledgerConditions.push(eq(ledgerCategories.type, type));
    defaultConditions.push(eq(ledgerCategories.type, type));
  }
  
  // 处理parentId查询：undefined表示查所有，null表示查顶级分类，number表示查指定父分类的子分类
  if (parentId === null) {
    ledgerConditions.push(isNull(ledgerCategories.parentId));
    defaultConditions.push(isNull(ledgerCategories.parentId));
  } else if (parentId !== undefined) {
    ledgerConditions.push(eq(ledgerCategories.parentId, parentId));
    defaultConditions.push(eq(ledgerCategories.parentId, parentId));
  }
  
  // 查询预设分类
  const defaultCategories = await db
    .select()
    .from(ledgerCategories)
    .where(and(...defaultConditions))
    .orderBy(asc(ledgerCategories.sortOrder), asc(ledgerCategories.id));
  
  // 查询用户自定义分类
  const customCategories = await db
    .select()
    .from(ledgerCategories)
    .where(and(...ledgerConditions))
    .orderBy(asc(ledgerCategories.sortOrder), asc(ledgerCategories.id));
  
  // 合并预设分类和自定义分类，预设分类在前
  return [...defaultCategories, ...customCategories];
}

/**
 * 添加自定义分类
 */
export async function addLedgerCategory(data: {
  ledgerId: number;
  name: string;
  type: "income" | "expense";
  parentId?: number;
  icon?: string;
  color?: string;
  sortOrder?: number;
  createdBy: number;
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 如果没有指定排序，获取当前最大排序值+1
  let sortOrder = data.sortOrder;
  if (sortOrder === undefined) {
    const maxSortOrder = await db
      .select({ max: sql<number>`MAX(${ledgerCategories.sortOrder})` })
      .from(ledgerCategories)
      .where(
        and(
          eq(ledgerCategories.ledgerId, data.ledgerId),
          eq(ledgerCategories.type, data.type),
          data.parentId ? eq(ledgerCategories.parentId, data.parentId) : sql`${ledgerCategories.parentId} IS NULL`
        )
      )
      .then((rows: any[]) => rows[0]?.max || 0);
    
    sortOrder = maxSortOrder + 1;
  }
  
  const [newCategory] = await db.insert(ledgerCategories).values({
    ledgerId: data.ledgerId,
    name: data.name,
    type: data.type,
    parentId: data.parentId || null,
    icon: data.icon || "📝",
    color: data.color || (data.type === "income" ? "#10b981" : "#ef4444"),
    sortOrder,
    isDefault: false,
    createdBy: data.createdBy,
  }).$returningId();
  
  return newCategory;
}

/**
 * 更新分类排序
 */
export async function updateCategorySortOrder(categoryId: number, sortOrder: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  await db
    .update(ledgerCategories)
    .set({ sortOrder, updatedAt: new Date() })
    .where(eq(ledgerCategories.id, categoryId));
  
  return true;
}

/**
 * 批量更新分类排序
 */
export async function batchUpdateCategorySortOrder(updates: { id: number; sortOrder: number }[]) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 使用事务批量更新
  await Promise.all(
    updates.map(({ id, sortOrder }) =>
      db
        .update(ledgerCategories)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(ledgerCategories.id, id))
    )
  );
  
  return true;
}

/**
 * 删除分类
 */
export async function deleteLedgerCategory(categoryId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 获取分类信息
  const category = await db
    .select()
    .from(ledgerCategories)
    .where(eq(ledgerCategories.id, categoryId))
    .then((rows: any[]) => rows[0]);
  
  if (!category) {
    throw new Error("分类不存在");
  }
  
  // 检查是否为默认分类
  if (category.isDefault) {
    throw new Error("默认分类不能删除");
  }
  
  // 检查是否有子分类
  const hasChildren = await db
    .select({ count: sql<number>`count(*)` })
    .from(ledgerCategories)
    .where(eq(ledgerCategories.parentId, categoryId))
    .then((rows: any[]) => rows[0]?.count || 0);
  
  if (hasChildren > 0) {
    throw new Error("请先删除子分类");
  }
  
  // 检查是否有记录使用此分类
  const hasRecords = await db
    .select({ count: sql<number>`count(*)` })
    .from(ledgerRecords)
    .where(eq(ledgerRecords.categoryId, categoryId))
    .then((rows: any[]) => rows[0]?.count || 0);
  
  if (hasRecords > 0) {
    throw new Error("此分类下有记录，不能删除");
  }
  
  // 删除分类
  await db.delete(ledgerCategories).where(eq(ledgerCategories.id, categoryId));
  
  return true;
}

/**
 * 更新分类信息
 */
export async function updateLedgerCategory(
  categoryId: number,
  data: {
    name?: string;
    icon?: string;
    color?: string;
  }
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  await db
    .update(ledgerCategories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(ledgerCategories.id, categoryId));
  
  return true;
}

/**
 * 获取账本成员列表
 */
export async function getLedgerMembers(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  console.log("[getLedgerMembers] 开始获取成员列表，参数:", { ledgerId, userId });
  
  // 检查用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是此账本的成员");
  }
  
  // 获取所有成员
  const members = await db
    .select({
      userId: ledgerMembers.userId,
      role: ledgerMembers.role,
      nickname: ledgerMembers.nickname,
      canEdit: ledgerMembers.canEdit,
      canDelete: ledgerMembers.canDelete,
      canInvite: ledgerMembers.canInvite,
      createdAt: ledgerMembers.createdAt,
    })
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId))
    .orderBy(ledgerMembers.createdAt);
  
  console.log("[getLedgerMembers] 成员列表:", members);
  
  return members;
}

/**
 * 生成邀请token
 */
export async function generateInviteToken(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");

  // 验证用户是否是账本创建者
  const ledger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .limit(1);

  if (ledger.length === 0) {
    throw new Error("账本不存在");
  }

  if (ledger[0].createdBy !== userId) {
    throw new Error("只有账本创建人可以生成邀请链接");
  }

  // 生成唯一的token（使用ledgerId + 随机字符串）
  const { nanoid } = await import("nanoid");
  const token = `${ledgerId}-${nanoid(16)}`;

  return token;
}

/**
 * 通过邀请token加入账本
 */
export async function joinLedgerByToken(token: string, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");

  // 从token中解析ledgerId
  const parts = token.split("-");
  if (parts.length < 2) {
    throw new Error("无效的邀请链接");
  }

  const ledgerId = parseInt(parts[0]);
  if (isNaN(ledgerId)) {
    throw new Error("无效的邀请链接");
  }

  // 验证账本是否存在
  const ledger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .limit(1);

  if (ledger.length === 0) {
    throw new Error("账本不存在");
  }

  // 检查用户是否已经是成员
  const existingMember = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1);

  if (existingMember.length > 0) {
    throw new Error("您已经是该账本的成员");
  }

  // 添加用户为账本成员
  await db.insert(ledgerMembers).values({
    ledgerId,
    userId,
    role: "member",
    memberType: "real",
    permissionView: "all",
    permissionAdd: "all",
    permissionEdit: "own",
    permissionDelete: "own",
  });

  return ledger[0];
}

/**
 * 移除账本成员
 */
export async function removeLedgerMember(ledgerId: number, operatorId: number, targetUserId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");

  // 验证操作者是否是账本创建者
  const ledger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .limit(1);

  if (ledger.length === 0) {
    throw new Error("账本不存在");
  }

  if (ledger[0].createdBy !== operatorId) {
    throw new Error("只有账本创建人可以移除成员");
  }

  // 不能移除创建者自己
  if (targetUserId === ledger[0].createdBy) {
    throw new Error("不能移除账本创建人");
  }

  // 移除成员
  await db
    .delete(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, targetUserId)
      )
    );
}

/**
 * 获取账本成员权限列表
 */
export async function getMemberPermissions(ledgerId: number, requestUserId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本创建者
  const ledger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .limit(1);
  
  if (ledger.length === 0) {
    throw new Error("账本不存在");
  }
  
  if (ledger[0].createdBy !== requestUserId) {
    throw new Error("只有账本创建者可以查看权限设置");
  }
  
  // 获取所有成员及其权限
  const members = await db
    .select({
      id: ledgerMembers.id,
      userId: ledgerMembers.userId,
      role: ledgerMembers.role,
      permissionView: ledgerMembers.permissionView,
      permissionAdd: ledgerMembers.permissionAdd,
      permissionEdit: ledgerMembers.permissionEdit,
      permissionDelete: ledgerMembers.permissionDelete,
    })
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  
  return {
    ledgerName: ledger[0].name,
    members,
  };
}

/**
 * 更新成员权限
 */
export async function updateMemberPermission(
  ledgerId: number,
  memberId: number,
  permissionType: "view" | "add" | "edit" | "delete",
  permissionValue: "all" | "own",
  requestUserId: number
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本创建者
  const ledger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .limit(1);
  
  if (ledger.length === 0) {
    throw new Error("账本不存在");
  }
  
  if (ledger[0].createdBy !== requestUserId) {
    throw new Error("只有账本创建者可以修改权限设置");
  }
  
  // 验证成员是否属于该账本
  const member = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.id, memberId),
        eq(ledgerMembers.ledgerId, ledgerId)
      )
    )
    .limit(1);
  
  if (member.length === 0) {
    throw new Error("成员不存在");
  }
  
  // 不能修改创建者的权限
  if (member[0].role === "owner") {
    throw new Error("不能修改创建者的权限");
  }
  
  // 根据权限类型更新对应字段
  const updateData: any = {};
  switch (permissionType) {
    case "view":
      updateData.permissionView = permissionValue;
      break;
    case "add":
      updateData.permissionAdd = permissionValue;
      break;
    case "edit":
      updateData.permissionEdit = permissionValue;
      break;
    case "delete":
      updateData.permissionDelete = permissionValue;
      break;
  }
  
  await db
    .update(ledgerMembers)
    .set(updateData)
    .where(eq(ledgerMembers.id, memberId));
  
  return { success: true };
}

/**
 * 获取账本的AI雇员列表
 */
export async function getAIEmployees(ledgerId: number, requestUserId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, requestUserId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 获取所有AI雇员
  const aiEmployees = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.memberType, 'ai')
      )
    );
  
  return aiEmployees;
}

/**
 * 添加AI雇员到账本
 */
export async function addAIEmployee(
  ledgerId: number,
  avatarType: string,
  nickname: string,
  requestUserId: number
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, requestUserId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 检查该头像类型是否已存在
  const existing = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.memberType, 'ai'),
        eq(ledgerMembers.avatarType, avatarType)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    throw new Error("该虚拟成员已添加");
  }
  
  // 添加AI雇员
  await db.insert(ledgerMembers).values({
    ledgerId,
    userId: 0, // AI雇员的userId为0
    role: 'member',
    memberType: 'ai',
    avatarType,
    nickname,
    permissionView: 'all',
    permissionAdd: 'all',
    permissionEdit: 'own',
    permissionDelete: 'own',
  });
  
  return { success: true };
}

/**
 * 删除账本中的AI雇员
 */
export async function removeAIEmployee(
  ledgerId: number,
  employeeId: number,
  requestUserId: number
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, requestUserId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 验证要删除的是AI雇员
  const employee = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.id, employeeId),
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.memberType, 'ai')
      )
    )
    .limit(1);
  
  if (employee.length === 0) {
    throw new Error("AI雇员不存在");
  }
  
  // 删除AI雇员
  await db
    .delete(ledgerMembers)
    .where(eq(ledgerMembers.id, employeeId));
  
  return { success: true };
}

/**
 * 更新账本信息
 */
export async function updateLedger(
  ledgerId: number,
  requestUserId: number,
  data: {
    name?: string;
    description?: string;
  }
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, requestUserId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 更新账本信息
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  
  if (Object.keys(updateData).length > 0) {
    await db
      .update(ledgers)
      .set(updateData)
      .where(eq(ledgers.id, ledgerId));
  }
  
  return { success: true };
}

/**
 * 更新成员昵称
 */
export async function updateMemberNickname(
  ledgerId: number,
  requestUserId: number,
  nickname: string
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, requestUserId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 更新成员昵称
  await db
    .update(ledgerMembers)
    .set({ nickname })
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, requestUserId)
      )
    );
  
  return { success: true };
}

/**
 * 获取账本报表数据
 */
export async function getLedgerReport(
  ledgerId: number,
  requestUserId: number,
  year: number
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, requestUserId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 获取年度统计数据
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  
  // 获取年度总收入和支出
  const yearlyStats = await db
    .select({
      totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'income' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'expense' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.date} >= ${yearStart}`,
        sql`${ledgerRecords.date} <= ${yearEnd}`
      )
    );
  
  const income = Number(yearlyStats[0]?.totalIncome || 0);
  const expense = Number(yearlyStats[0]?.totalExpense || 0);
  
  // 获取成员统计数据
  const memberStatsRaw = await db
    .select({
      userId: ledgerRecords.createdBy,
      totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'income' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'expense' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.date} >= ${yearStart}`,
        sql`${ledgerRecords.date} <= ${yearEnd}`
      )
    )
    .groupBy(ledgerRecords.createdBy);
  
  // 获取成员昵称
  const members = await db
    .select({
      userId: ledgerMembers.userId,
      nickname: ledgerMembers.nickname,
    })
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  
  const memberNicknameMap = new Map(members.map((m: any) => [m.userId, m.nickname]));
  
  const memberStats = memberStatsRaw.map((stat: any) => ({
    userId: stat.userId,
    nickname: memberNicknameMap.get(stat.userId) || '未知用户',
    income: Number(stat.totalIncome || 0),
    expense: Number(stat.totalExpense || 0),
  }));
  
  // 获取月度统计数据
  const monthlyStatsRaw = await db
    .select({
      month: sql<number>`MONTH(${ledgerRecords.date})`,
      totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'income' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'expense' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.date} >= ${yearStart}`,
        sql`${ledgerRecords.date} <= ${yearEnd}`
      )
    )
    .groupBy(sql`MONTH(${ledgerRecords.date})`);
  
  const monthlyStats = Array.from({ length: 12 }, (_, i) => {
    const monthData = monthlyStatsRaw.find((m: any) => Number(m.month) === i + 1);
    return {
      month: i + 1,
      income: Number(monthData?.totalIncome || 0),
      expense: Number(monthData?.totalExpense || 0),
    };
  });
  
  // 获取分类统计数据
  const categoryStatsRaw = await db
    .select({
      categoryId: ledgerRecords.categoryId,
      type: ledgerRecords.type,
      totalAmount: sql<number>`COALESCE(SUM(${ledgerRecords.amount}), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.date} >= ${yearStart}`,
        sql`${ledgerRecords.date} <= ${yearEnd}`
      )
    )
    .groupBy(ledgerRecords.categoryId, ledgerRecords.type);
  
  // 获取分类名称
  const categoryIds = categoryStatsRaw.map((c: any) => c.categoryId);
  let categories: any[] = [];
  if (categoryIds.length > 0) {
    categories = await db
      .select({
        id: ledgerCategories.id,
        name: ledgerCategories.name,
      })
      .from(ledgerCategories)
      .where(sql`${ledgerCategories.id} IN (${sql.join(categoryIds, sql`, `)})`);
  }
  
  const categoryNameMap = new Map(categories.map((c: any) => [c.id, c.name]));
  
  const expenseCategories = categoryStatsRaw
    .filter((c: any) => c.type === 'expense')
    .map((c: any) => ({
      category: categoryNameMap.get(c.categoryId) || '未分类',
      amount: Number(c.totalAmount || 0),
    }))
    .sort((a: any, b: any) => b.amount - a.amount);
  
  const incomeCategories = categoryStatsRaw
    .filter((c: any) => c.type === 'income')
    .map((c: any) => ({
      category: categoryNameMap.get(c.categoryId) || '未分类',
      amount: Number(c.totalAmount || 0),
    }))
    .sort((a: any, b: any) => b.amount - a.amount);
  
  return {
    yearlyStats: {
      income,
      expense,
    },
    memberStats,
    monthlyStats,
    categoryStats: {
      expense: expenseCategories,
      income: incomeCategories,
    },
  };
}


/**
 * 获取日历数据（指定月份的每日收支统计）
 */
export async function getCalendarData(
  ledgerId: number,
  requestUserId: number,
  year: number,
  month: number,
  memberIds?: number[]
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, requestUserId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 构建日期范围
  const monthStr = String(month).padStart(2, '0');
  const monthStart = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${monthStr}-${lastDay}`;
  
  // 构建成员筛选条件
  const memberCondition = memberIds && memberIds.length > 0
    ? sql`${ledgerRecords.memberId} IN (${sql.join(memberIds.map(id => sql`${id}`), sql`, `)})`
    : undefined;
  
  // 获取月度总统计
  const monthlyStatsRaw = await db
    .select({
      totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'income' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'expense' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.date} >= ${monthStart}`,
        sql`${ledgerRecords.date} <= ${monthEnd}`,
        memberCondition
      )
    );
  
  const monthlyStats = {
    income: Number(monthlyStatsRaw[0]?.totalIncome || 0),
    expense: Number(monthlyStatsRaw[0]?.totalExpense || 0),
  };
  
  // 获取每日统计
  const dailyStatsRaw = await db
    .select({
      recordDate: ledgerRecords.date,
      totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'income' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'expense' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.date} >= ${monthStart}`,
        sql`${ledgerRecords.date} <= ${monthEnd}`,
        memberCondition
      )
    )
    .groupBy(ledgerRecords.date);
  
  const dailyStats = dailyStatsRaw.map((day: any) => {
    // 从日期字符串中提取天数
    const dateStr = String(day.recordDate);
    const dayNum = parseInt(dateStr.split('-')[2], 10);
    return {
      day: dayNum,
      income: Number(day.totalIncome || 0),
      expense: Number(day.totalExpense || 0),
    };
  });
  
  return {
    monthlyStats,
    dailyStats,
  };
}

/**
 * 获取指定日期的记账记录
 */
export async function getDayRecords(
  ledgerId: number,
  requestUserId: number,
  date: string,
  memberIds?: number[]
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, requestUserId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 构建成员筛选条件
  const memberCondition = memberIds && memberIds.length > 0
    ? sql`${ledgerRecords.memberId} IN (${sql.join(memberIds.map(id => sql`${id}`), sql`, `)})`
    : undefined;
  
  // 获取指定日期的记录
  const records = await db
    .select({
      id: ledgerRecords.id,
      type: ledgerRecords.type,
      amount: ledgerRecords.amount,
      categoryId: ledgerRecords.categoryId,
      description: ledgerRecords.description,
      date: ledgerRecords.date,
      createdBy: ledgerRecords.createdBy,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.date} = ${date}`,
        memberCondition
      )
    )
    .orderBy(desc(ledgerRecords.createdAt));
  
  // 获取分类名称
  const categoryIds = records.map((r: any) => r.categoryId).filter((id: any) => id);
  let categories: any[] = [];
  if (categoryIds.length > 0) {
    categories = await db
      .select({
        id: ledgerCategories.id,
        name: ledgerCategories.name,
      })
      .from(ledgerCategories)
      .where(sql`${ledgerCategories.id} IN (${sql.join(categoryIds, sql`, `)})`);
  }
  
  const categoryNameMap = new Map(categories.map((c: any) => [c.id, c.name]));
  
  return records.map((record: any) => ({
    ...record,
    amount: Number(record.amount),
    categoryName: categoryNameMap.get(record.categoryId) || '未分类',
  }));
}
