import { getDb } from "./db";
import { ledgers, ledgerMembers, ledgerCategories, ledgerRecords, ledgerBudgets } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * 获取用户的所有账本（包括自己创建的和参与的）
 */
export async function getUserLedgers(userId: number, isArchived: boolean = false) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
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
      const dbInner = await getDb();
      if (!dbInner) throw new Error("Database connection failed");
      
      const members = await dbInner
        .select({
          userId: ledgerMembers.userId,
          role: ledgerMembers.role,
        })
        .from(ledgerMembers)
        .where(eq(ledgerMembers.ledgerId, ledger.id))
        .limit(4); // 最多显示4个成员头像

      const memberCount = await dbInner
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
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 创建账本，显式设置所有字段
  const ledgerData: any = {
    name: data.name,
    createdBy: data.createdBy,
  };
  
  // 只添加非 undefined 的可选字段
  if (data.description !== undefined) {
    ledgerData.description = data.description;
  }
  if (data.type !== undefined) {
    ledgerData.type = data.type;
  }
  if (data.currency !== undefined) {
    ledgerData.currency = data.currency;
  }
  
  const [newLedger] = await db.insert(ledgers).values(ledgerData).$returningId();

  // 将创建者添加为账本所有者
  await db.insert(ledgerMembers).values({
    ledgerId: newLedger.id,
    userId: data.createdBy,
    role: "owner",
    canEdit: true,
    canDelete: true,
    canInvite: true,
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
      ledgerId: newLedger.id,
      name: cat.name,
      type: cat.type,
      icon: cat.icon,
      color: cat.color,
      sortOrder: index,
      isDefault: true,
      createdBy: data.createdBy,
    }))
  );

  return newLedger;
}

/**
 * 存档/取消存档账本
 */
export async function archiveLedger(ledgerId: number, userId: number, isArchived: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
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
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
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
  await db.delete(ledgerBudgets).where(eq(ledgerBudgets.ledgerId, ledgerId));
  await db.delete(ledgerMembers).where(eq(ledgerMembers.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, ledgerId));

  return true;
}

/**
 * 加入账本（通过邀请码）
 */
export async function joinLedger(ledgerId: number, userId: number, invitedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
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
export async function getLedgerCategories(ledgerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const categories = await db
    .select()
    .from(ledgerCategories)
    .where(eq(ledgerCategories.ledgerId, ledgerId))
    .orderBy(ledgerCategories.sortOrder);
  
  return categories;
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
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
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
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
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
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
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
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
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
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(ledgerCategories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(ledgerCategories.id, categoryId));
  
  return true;
}
