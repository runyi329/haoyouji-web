import { getLedgerDb, getDbConnection } from "./db";
import { ledgers, ledgerMembers, ledgerCategories, ledgerRecords, users } from "../drizzle/schema";
import { eq, and, desc, sql, isNull, isNotNull, asc } from "drizzle-orm";
import { encryptFields, decryptFields, decryptFieldsArray } from "./encryption";

// 账目记录需要加密的字段
const LEDGER_RECORD_ENCRYPT_FIELDS = ['description'];
// 报销历史需要加密的字段
const REIMBURSEMENT_ENCRYPT_FIELDS = ['notes'];

// ========== 软删除自动迁移 ==========
let _softDeleteMigrated = false;
async function ensureSoftDeleteColumns() {
  if (_softDeleteMigrated) return;
  try {
    const db = await getLedgerDb();
    if (!db) return;
    // 尝试添加列，如果已存在则忽略
    await db.execute(sql`ALTER TABLE ledger_records ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL`);
  } catch (e: any) {
    // 列已存在时忽略错误
    if (!e.message?.includes('Duplicate column')) {
      console.error('[ensureSoftDeleteColumns] deleted_at error:', e.message);
    }
  }
  try {
    const db = await getLedgerDb();
    if (!db) return;
    await db.execute(sql`ALTER TABLE ledger_records ADD COLUMN deleted_by INT NULL DEFAULT NULL`);
  } catch (e: any) {
    if (!e.message?.includes('Duplicate column')) {
      console.error('[ensureSoftDeleteColumns] deleted_by error:', e.message);
    }
  }
  _softDeleteMigrated = true;
}
// 在模块加载时执行迁移
ensureSoftDeleteColumns().catch(console.error);

// ========== 备份权限字段迁移 ==========
let _backupPermissionMigrated = false;
async function ensureBackupPermissionColumn() {
  if (_backupPermissionMigrated) return;
  try {
    const db = await getLedgerDb();
    if (!db) return;
    // 添加 permission_backup 字段
    await db.execute(sql`ALTER TABLE ledger_members ADD COLUMN permission_backup ENUM('allow','none') NOT NULL DEFAULT 'allow'`);
    console.log('[ensureBackupPermissionColumn] permission_backup 字段添加成功');
  } catch (e: any) {
    if (!e.message?.includes('Duplicate column')) {
      console.error('[ensureBackupPermissionColumn] error:', e.message);
    }
  }
  _backupPermissionMigrated = true;
}
// 在模块加载时执行迁移
ensureBackupPermissionColumn().catch(console.error);

// ========== 账本功能字段迁移 ==========
let _ledgerFeaturesMigrated = false;
async function ensureLedgerFeaturesColumns() {
  if (_ledgerFeaturesMigrated) return;
  try {
    const db = await getLedgerDb();
    if (!db) return;
    // 添加 enable_reimbursement 字段
    await db.execute(sql`ALTER TABLE ledgers ADD COLUMN enable_reimbursement TINYINT DEFAULT 1 NOT NULL COMMENT '是否启用报销功能（1=启用，0=禁用）'`);
  } catch (e: any) {
    if (!e.message?.includes('Duplicate column')) {
      console.error('[ensureLedgerFeaturesColumns] enable_reimbursement error:', e.message);
    }
  }
  try {
    const db = await getLedgerDb();
    if (!db) return;
    // 添加 enable_pending 字段
    await db.execute(sql`ALTER TABLE ledgers ADD COLUMN enable_pending TINYINT DEFAULT 0 NOT NULL COMMENT '是否启用待结功能（1=启用，0=禁用）'`);
  } catch (e: any) {
    if (!e.message?.includes('Duplicate column')) {
      console.error('[ensureLedgerFeaturesColumns] enable_pending error:', e.message);
    }
  }
  try {
    const db = await getLedgerDb();
    if (!db) return;
    // 添加 pending_type 字段
    await db.execute(sql`ALTER TABLE ledger_records ADD COLUMN pending_type ENUM('receivable', 'payable') DEFAULT NULL COMMENT '待结类型（receivable=代收，payable=代付，NULL=无）'`);
  } catch (e: any) {
    if (!e.message?.includes('Duplicate column')) {
      console.error('[ensureLedgerFeaturesColumns] pending_type error:', e.message);
    }
  }
  try {
    const db = await getLedgerDb();
    if (!db) return;
    // 添加 pending_include_stats 字段
    await db.execute(sql`ALTER TABLE ledger_records ADD COLUMN pending_include_stats TINYINT DEFAULT 1 COMMENT '待结账目是否计入统计（0=仅显示不计入，1=显示并计入）'`);
  } catch (e: any) {
    if (!e.message?.includes('Duplicate column')) {
      console.error('[ensureLedgerFeaturesColumns] pending_include_stats error:', e.message);
    }
  }
  try {
    const db = await getLedgerDb();
    if (!db) return;
    // 添加 pending_default_include_stats 字段（账本级别默认统计模式）
    await db.execute(sql`ALTER TABLE ledgers ADD COLUMN pending_default_include_stats TINYINT DEFAULT 1 NOT NULL COMMENT '待结默认统计模式（0=仅显示不计入，1=显示并计入）'`);
  } catch (e: any) {
    if (!e.message?.includes('Duplicate column')) {
      console.error('[ensureLedgerFeaturesColumns] pending_default_include_stats error:', e.message);
    }
  }
  try {
    const db = await getLedgerDb();
    if (!db) return;
    // 创建索引
    await db.execute(sql`CREATE INDEX idx_pending_type ON ledger_records(pending_type)`);
  } catch (e: any) {
    if (!e.message?.includes('Duplicate key')) {
      console.error('[ensureLedgerFeaturesColumns] idx_pending_type error:', e.message);
    }
  }
  _ledgerFeaturesMigrated = true;
  console.log('[ensureLedgerFeaturesColumns] 账本功能字段迁移完成');
}
// 在模块加载时执行迁移
ensureLedgerFeaturesColumns().catch(console.error);

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

  // 获取账本详情（先不排序，后续按最近活动时间排序）
  const ledgerList = await db
    .select()
    .from(ledgers)
    .where(
      and(
        sql`${ledgers.id} IN (${sql.join(ledgerIds, sql`, `)})`,
        eq(ledgers.isArchived, isArchived)
      )
    );

  // 为每个账本获取成员信息和最近活动时间
  const result = await Promise.all(
    ledgerList.map(async (ledger: any) => {
      // 使用账本数据库连接,关联users表获取头像
      const membersRaw = await db
        .select({
          userId: ledgerMembers.userId,
          role: ledgerMembers.role,
          username: users.username,
          avatar: users.avatar,
        })
        .from(ledgerMembers)
        .leftJoin(users, eq(ledgerMembers.userId, users.id))
        .where(eq(ledgerMembers.ledgerId, ledger.id));
      
      // 将当前用户排在第一位，然后只取前4个
      const members = membersRaw
        .sort((a, b) => {
          if (a.userId === userId) return -1;
          if (b.userId === userId) return 1;
          return 0;
        })
        .slice(0, 4); // 最多显示4个成员头像

      const memberCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(ledgerMembers)
        .where(eq(ledgerMembers.ledgerId, ledger.id))
        .then((rows: any[]) => rows[0]?.count || 0);

      // 获取账目数量
      const recordCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(ledgerRecords)
        .where(and(eq(ledgerRecords.ledgerId, ledger.id), isNull(ledgerRecords.deletedAt)))
        .then((rows: any[]) => rows[0]?.count || 0);

      // 获取该账本最近一条账目的创建时间（作为最近活动时间）
      const latestRecord = await db
        .select({ latestAt: sql<string>`MAX(${ledgerRecords.createdAt})` })
        .from(ledgerRecords)
        .where(and(eq(ledgerRecords.ledgerId, ledger.id), isNull(ledgerRecords.deletedAt)))
        .then((rows: any[]) => rows[0]?.latestAt || null);

      // 获取当前用户在这个账本中的角色
      const userRole = memberRecords.find((m: any) => m.ledgerId === ledger.id)?.role || "member";

      // 最近活动时间：取账目最新时间和账本updatedAt中的较新值
      const lastActivityAt = latestRecord 
        ? new Date(Math.max(new Date(latestRecord).getTime(), new Date(ledger.updatedAt).getTime()))
        : new Date(ledger.updatedAt);

      return {
        ...ledger,
        members,
        memberCount,
        recordCount,
        userRole,
        lastActivityAt: lastActivityAt.toISOString(),
      };
    })
  );

  // 按最近活动时间降序排列（最近使用的排最前）
  result.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

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
  memberNickname?: string;
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 如果没有提供昵称，获取用户名作为默认昵称
  let finalNickname = data.memberNickname;
  if (!finalNickname || !finalNickname.trim()) {
    const { getDb } = await import("./db");
    const mainDb = await getDb();
    const userResult = await mainDb
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, data.createdBy))
      .limit(1);
    finalNickname = userResult[0]?.username || null;
  }
  
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
    nickname: finalNickname,
    permissionView: "all",
    permissionAdd: "all",
    permissionEdit: "all",
    permissionDelete: "all",
    canEdit: 1,
    canDelete: 1,
    canInvite: 1,
  });

  // 不再创建默认分类，用户可以自己添加或使用全局预设分类（ledgerId=0）

  return { id: newLedgerId, name: data.name };
}

/**
 * 复制账本（复制分类和成员）
 */
export async function copyLedger(sourceLedgerId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 首先检查用户是否是源账本的成员
  const member = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, sourceLedgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1);
  
  if (member.length === 0) {
    throw new Error("您不是该账本的成员，无法复制");
  }
  
  // 获取源账本信息
  const sourceLedger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, sourceLedgerId))
    .limit(1);
  
  if (sourceLedger.length === 0) {
    throw new Error("源账本不存在");
  }
  
  const source = sourceLedger[0];
  
  // 创建新账本，名称加上“复制”前缀
  const newLedgerName = `复制-${source.name}`;
  const result = await db.execute(sql`
    INSERT INTO ledgers (name, description, type, currency, icon, createdBy, ownerId, isVip, isArchived)
    VALUES (${newLedgerName}, ${source.description}, ${source.type}, ${source.currency}, ${source.icon}, ${userId}, ${userId}, ${0}, ${0})
  `);
  
  const newLedgerId = Number((result as any)[0]?.insertId || result.insertId);
  
  // 将创建者添加为账本所有者
  await db.insert(ledgerMembers).values({
    ledgerId: newLedgerId,
    userId: userId,
    role: "owner",
    memberType: "real",
    nickname: null,
    permissionView: "all",
    permissionAdd: "all",
    permissionEdit: "all",
    permissionDelete: "all",
    canEdit: 1,
    canDelete: 1,
    canInvite: 1,
  });
  
  // 复制分类
  const categories = await db
    .select()
    .from(ledgerCategories)
    .where(eq(ledgerCategories.ledgerId, sourceLedgerId));
  
  for (const category of categories) {
    await db.insert(ledgerCategories).values({
      ledgerId: newLedgerId,
      name: category.name,
      type: category.type,
      icon: category.icon,
      color: category.color,
      isDefault: category.isDefault,
      sortOrder: category.sortOrder,
    });
  }
  
  return { id: newLedgerId, name: newLedgerName };
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

    // 获取所有成员，关联users表获取username和avatar
    console.log('[getLedgerById] 开始查询成员列表...');
    const members = await db
      .select({
        userId: ledgerMembers.userId,
        role: ledgerMembers.role,
        nickname: ledgerMembers.nickname,
        username: users.username,
        avatar: users.avatar,
      })
      .from(ledgerMembers)
      .leftJoin(users, eq(ledgerMembers.userId, users.id))
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
 * 邀请用户加入账本（通过用户名）
 */
export async function inviteMemberByUsername(ledgerId: number, inviterUserId: number, inviteeUsername: string) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 检查邀请者是否有权限邀请
  const inviterMember = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, inviterUserId)
      )
    )
    .then((rows: any[]) => rows[0]);

  if (!inviterMember) {
    throw new Error("您不是该账本的成员");
  }

  if (!inviterMember.canInvite && inviterMember.role !== "owner" && inviterMember.role !== "admin") {
    throw new Error("您没有权限邀请成员");
  }

  // 从主数据库查找被邀请用户
  const { getDb } = await import("./db");
  const mainDb = await getDb();
  if (!mainDb) throw new Error("Main database connection failed");

  const inviteeUser = await mainDb
    .select()
    .from(users)
    .where(eq(users.username, inviteeUsername))
    .then((rows: any[]) => rows[0]);

  if (!inviteeUser) {
    throw new Error("用户不存在");
  }

  // 不能邀请自己
  if (inviteeUser.id === inviterUserId) {
    throw new Error("不能邀请自己");
  }

  // 检查用户是否已经是成员
  const existingMember = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, inviteeUser.id)
      )
    )
    .then((rows: any[]) => rows[0]);

  if (existingMember) {
    throw new Error("该用户已经是账本成员");
  }

  // 添加为成员
  await db.insert(ledgerMembers).values({
    ledgerId,
    userId: inviteeUser.id,
    role: "member",
    memberType: "real",
    permissionView: "all",
    permissionAdd: "all",
    permissionEdit: "own",
    permissionDelete: "own",
    canEdit: true,
    canDelete: false,
    canInvite: false,
    invitedBy: inviterUserId,
  });

  return {
    success: true,
    member: {
      userId: inviteeUser.id,
      username: inviteeUser.username,
      name: inviteeUser.name,
      avatar: inviteeUser.avatar,
    },
  };
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
  
  // 预设分类（ledgerId=0）对所有用户可见，不需要验证成员身份
  // 用户自定义分类由后续逻辑处理
  
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
 * 递归获取所有子分类ID
 */
async function getAllChildCategoryIds(db: any, parentId: number): Promise<number[]> {
  const children = await db
    .select({ id: ledgerCategories.id })
    .from(ledgerCategories)
    .where(eq(ledgerCategories.parentId, parentId));
  
  let allIds: number[] = [];
  for (const child of children) {
    allIds.push(child.id);
    const grandChildren = await getAllChildCategoryIds(db, child.id);
    allIds = allIds.concat(grandChildren);
  }
  
  return allIds;
}

/**
 * 删除分类(支持级联删除)
 */
export async function deleteLedgerCategory(categoryId: number, userId: number, cascade: boolean = false) {
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
  
  // 获取所有子分类ID
  const childIds = await getAllChildCategoryIds(db, categoryId);
  
  // 如果有子分类且不是级联删除,抛出错误
  if (childIds.length > 0 && !cascade) {
    throw new Error("此分类下有子分类，请确认是否级联删除");
  }
  
  // 收集所有要删除的分类ID(包括当前分类和所有子分类)
  const allIdsToDelete = [categoryId, ...childIds];
  
  // 检查是否有记录使用这些分类
  for (const id of allIdsToDelete) {
    const hasRecords = await db
      .select({ count: sql<number>`count(*)` })
      .from(ledgerRecords)
      .where(and(eq(ledgerRecords.categoryId, id), isNull(ledgerRecords.deletedAt)))
      .then((rows: any[]) => rows[0]?.count || 0);
    
    if (hasRecords > 0) {
      throw new Error("此分类或其子分类下有记录，不能删除");
    }
  }
  
  // 删除所有子分类(从最深层开始删除)
  for (const id of childIds.reverse()) {
    await db.delete(ledgerCategories).where(eq(ledgerCategories.id, id));
  }
  
  // 删除当前分类
  await db.delete(ledgerCategories).where(eq(ledgerCategories.id, categoryId));
  
  return { success: true, deletedCount: allIdsToDelete.length };
}

/**
 * 获取分类使用数量
 */
export async function getCategoryUsageCount(
  ledgerId: number,
  categoryId: number,
  userId: number
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证用户权限
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
  if (member.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 查询使用该分类的记录数量
  const count = await db
    .select({ count: sql<number>`count(*)` })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        eq(ledgerRecords.categoryId, categoryId),
        isNull(ledgerRecords.deletedAt)
      )
    )
    .then((rows: any[]) => rows[0]?.count || 0);
  
  return { count };
}

/**
 * 批量替换分类
 */
export async function replaceLedgerCategory(
  ledgerId: number,
  sourceCategoryId: number,
  targetCategoryId: number,
  userId: number
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证用户权限
  const member2 = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1);
  if (member2.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 验证源分类和目标分类是否存在
  const sourceCategory = await db
    .select()
    .from(ledgerCategories)
    .where(eq(ledgerCategories.id, sourceCategoryId))
    .then((rows: any[]) => rows[0]);
  
  const targetCategory = await db
    .select()
    .from(ledgerCategories)
    .where(eq(ledgerCategories.id, targetCategoryId))
    .then((rows: any[]) => rows[0]);
  
  if (!sourceCategory || !targetCategory) {
    throw new Error("分类不存在");
  }
  
  // 执行批量更新
  const result = await db
    .update(ledgerRecords)
    .set({ categoryId: targetCategoryId, updatedAt: sql`NOW()` })
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        eq(ledgerRecords.categoryId, sourceCategoryId)
      )
    );
  
  // 获取更新的记录数
  const affectedCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        eq(ledgerRecords.categoryId, targetCategoryId),
        isNull(ledgerRecords.deletedAt)
      )
    )
    .then((rows: any[]) => rows[0]?.count || 0);
  
  return { 
    success: true, 
    affectedCount,
    sourceCategoryName: sourceCategory.name,
    targetCategoryName: targetCategory.name
  };
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
  
  // 获取所有成员，关联users表获取username和avatar
  const members = await db
    .select({
      id: ledgerMembers.id,
      userId: ledgerMembers.userId,
      role: ledgerMembers.role,
      nickname: ledgerMembers.nickname,
      canEdit: ledgerMembers.canEdit,
      canDelete: ledgerMembers.canDelete,
      canInvite: ledgerMembers.canInvite,
      createdAt: ledgerMembers.createdAt,
      username: users.username,
      avatar: users.avatar,
    })
    .from(ledgerMembers)
    .leftJoin(users, eq(ledgerMembers.userId, users.id))
    .where(eq(ledgerMembers.ledgerId, ledgerId))
    .orderBy(ledgerMembers.createdAt);
  
  console.log("[getLedgerMembers] 成员列表:", members);
  
  // 标记当前用户
  const membersWithCurrentFlag = members.map(member => ({
    ...member,
    isCurrentUser: member.userId === userId
  }));
  
  // 将当前用户排在第一位
  const sortedMembers = membersWithCurrentFlag.sort((a, b) => {
    if (a.isCurrentUser) return -1;
    if (b.isCurrentUser) return 1;
    return 0;
  });
  
  return sortedMembers;
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
  
  // 获取账本信息
  const ledger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .limit(1);
  
  if (ledger.length === 0) {
    throw new Error("账本不存在");
  }
  
  // 验证请求用户是否是账本成员
  const currentMember = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, requestUserId)
      )
    )
    .limit(1);
  
  if (currentMember.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  const currentUserRole = currentMember[0].role;
  const isOwner = ledger[0].createdBy === requestUserId;
  
  // 获取成员列表
  let members;
  if (isOwner) {
    // 创建人可以看到所有成员
    members = await db
      .select({
        id: ledgerMembers.id,
        userId: ledgerMembers.userId,
        role: ledgerMembers.role,
        permissionView: ledgerMembers.permissionView,
        permissionAdd: ledgerMembers.permissionAdd,
        permissionEdit: ledgerMembers.permissionEdit,
        permissionDelete: ledgerMembers.permissionDelete,
        permissionBackup: ledgerMembers.permissionBackup,
      })
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, ledgerId));
  } else {
    // 普通成员只能看到自己
    members = await db
      .select({
        id: ledgerMembers.id,
        userId: ledgerMembers.userId,
        role: ledgerMembers.role,
        permissionView: ledgerMembers.permissionView,
        permissionAdd: ledgerMembers.permissionAdd,
        permissionEdit: ledgerMembers.permissionEdit,
        permissionDelete: ledgerMembers.permissionDelete,
        permissionBackup: ledgerMembers.permissionBackup,
      })
      .from(ledgerMembers)
      .where(
        and(
          eq(ledgerMembers.ledgerId, ledgerId),
          eq(ledgerMembers.userId, requestUserId)
        )
      );
  }
  
  // 将当前用户排在第一位
  const sortedMembers = members.sort((a, b) => {
    if (a.userId === requestUserId) return -1;
    if (b.userId === requestUserId) return 1;
    return 0;
  });
  
  return {
    ledgerName: ledger[0].name,
    currentUserRole,
    isOwner,
    members: sortedMembers,
    defaultPermissions: {
      view: ledger[0].defaultPermissionView,
      add: ledger[0].defaultPermissionAdd,
      edit: ledger[0].defaultPermissionEdit,
      delete: ledger[0].defaultPermissionDelete,
      backup: ledger[0].defaultPermissionBackup || 'allow',
    },
  };
}

/**
 * 更新成员权限
 */
export async function updateMemberPermission(
  ledgerId: number,
  memberId: number,
  permissionType: "view" | "add" | "edit" | "delete" | "backup",
  permissionValue: "all" | "own" | "none" | "allow",
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
  console.log('[updateMemberPermission] Input:', { ledgerId, memberId, permissionType, permissionValue });
  
  // 确保 permissionValue 是字符串
  const valueStr = String(permissionValue);
  console.log('[updateMemberPermission] Value as string:', valueStr);
  
  const updateData: any = {};
  switch (permissionType) {
    case "view":
      updateData.permissionView = valueStr;
      break;
    case "add":
      updateData.permissionAdd = valueStr;
      break;
    case "edit":
      updateData.permissionEdit = valueStr;
      break;
    case "delete":
      updateData.permissionDelete = valueStr;
      break;
    case "backup":
      updateData.permissionBackup = valueStr;
      break;
  }
  
  console.log('[updateMemberPermission] Update data:', updateData);
  
  await db
    .update(ledgerMembers)
    .set(updateData)
    .where(eq(ledgerMembers.id, memberId));
  
  return { success: true };
}

/**
 * 更新默认成员权限
 */
export async function updateDefaultPermission(
  ledgerId: number,
  permissionType: "view" | "add" | "edit" | "delete" | "backup",
  permissionValue: "all" | "own" | "none" | "allow",
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
    throw new Error("只有账本创建者可以修改默认权限设置");
  }
  // 根据权限类型更新对应字段
  console.log('[updateDefaultPermission] Input:', { ledgerId, permissionType, permissionValue });
  
  // 确保 permissionValue 是字符串
  const valueStr = String(permissionValue);
  console.log('[updateDefaultPermission] Value as string:', valueStr);
  
  const updateData: any = {};
  switch (permissionType) {
    case "view":
      updateData.defaultPermissionView = valueStr;
      break;
    case "add":
      updateData.defaultPermissionAdd = valueStr;
      break;
    case "edit":
      updateData.defaultPermissionEdit = valueStr;
      break;
    case "delete":
      updateData.defaultPermissionDelete = valueStr;
      break;
    case "backup":
      updateData.defaultPermissionBackup = valueStr;
      break;
    default:
      throw new Error(`无效的权限类型: ${permissionType}`);
  }
  
  console.log('[updateDefaultPermission] Update data:', updateData);
  
  // 防御性检查：确保 updateData 不为空
  if (Object.keys(updateData).length === 0) {
    throw new Error(`未能生成更新数据，permissionType: ${permissionType}, permissionValue: ${permissionValue}`);
  }
  
  await db
    .update(ledgers)
    .set(updateData)
    .where(eq(ledgers.id, ledgerId));
  
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
  year: number,
  startDate?: string,
  endDate?: string
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证请求用户是否是账本成员并获取权限
  const membership = await db
    .select({
      permissionView: ledgerMembers.permissionView,
      role: ledgerMembers.role,
    })
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
  
  const userPermission = membership[0].permissionView;
  
  // 检查查看权限
  if (userPermission === 'none') {
    // 不允许查看，返回空数据
    return {
      income: 0,
      expense: 0,
      memberStats: [],
      monthlyStats: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        income: 0,
        expense: 0,
      })),
      dailyStats: [],
      categoryStats: { income: [], expense: [] },
    };
  }
  
  // 构建权限筛选条件
  const permissionCondition = userPermission === 'own'
    ? sql`${ledgerRecords.createdBy} = ${requestUserId}`
    : undefined;
  
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
        sql`${ledgerRecords.recordDate} >= ${yearStart}`,
        sql`${ledgerRecords.recordDate} <= ${yearEnd}`,
        isNull(ledgerRecords.deletedAt),
        permissionCondition
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
        sql`${ledgerRecords.recordDate} >= ${yearStart}`,
        sql`${ledgerRecords.recordDate} <= ${yearEnd}`,
        isNull(ledgerRecords.deletedAt),
        permissionCondition
      )
    )
    .groupBy(ledgerRecords.createdBy);
  
  // 获取成员昵称和用户名
  const members = await db
    .select({
      userId: ledgerMembers.userId,
      nickname: ledgerMembers.nickname,
      username: users.username,
      avatar: users.avatar,
    })
    .from(ledgerMembers)
    .leftJoin(users, eq(ledgerMembers.userId, users.id))
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  
  const memberInfoMap = new Map(members.map((m: any) => [m.userId, m]));
  
  const memberStats = memberStatsRaw.map((stat: any) => {
    const memberInfo = memberInfoMap.get(stat.userId);
    return {
      userId: stat.userId,
      nickname: memberInfo?.nickname,
      username: memberInfo?.username,
      avatar: memberInfo?.avatar,
      income: Number(stat.totalIncome || 0),
      expense: Number(stat.totalExpense || 0),
    };
  });
  
  // 获取月度统计数据
  const monthlyStatsRaw = await db
    .select({
      month: sql<number>`MONTH(${ledgerRecords.recordDate})`,
      totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'income' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'expense' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.recordDate} >= ${yearStart}`,
        sql`${ledgerRecords.recordDate} <= ${yearEnd}`,
        isNull(ledgerRecords.deletedAt),
        permissionCondition
      )
    )
    .groupBy(sql`MONTH(${ledgerRecords.recordDate})`);
  
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
        sql`${ledgerRecords.recordDate} >= ${yearStart}`,
        sql`${ledgerRecords.recordDate} <= ${yearEnd}`,
        isNull(ledgerRecords.deletedAt),
        permissionCondition
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
  
  // 获取最近时间范围的统计数据
  // 如果提供了 startDate 和 endDate，则使用自定义时间范围
  // 否则使用最近30天
  let recentStartDate: string;
  let recentEndDate: string;
  let daysPassed: number;
  
  if (startDate && endDate) {
    recentStartDate = startDate;
    recentEndDate = endDate;
    // 计算天数
    const start = new Date(startDate);
    const end = new Date(endDate);
    daysPassed = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  } else {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29); // 包含当天共30天
    recentStartDate = thirtyDaysAgo.toISOString().split('T')[0];
    recentEndDate = today.toISOString().split('T')[0];
    daysPassed = 30;
  }
  
  const recentStats = await db
    .select({
      totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'income' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'expense' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.recordDate} >= ${recentStartDate}`,
        sql`${ledgerRecords.recordDate} <= ${recentEndDate}`,
        isNull(ledgerRecords.deletedAt)
      )
    );
  
  const recentIncome = Number(recentStats[0]?.totalIncome || 0);
  const recentExpense = Number(recentStats[0]?.totalExpense || 0);
  
  // 获取最近30天每日收支数据
  const dailyStatsRaw = await db
    .select({
      date: ledgerRecords.recordDate,
      totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'income' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'expense' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.recordDate} >= ${recentStartDate}`,
        sql`${ledgerRecords.recordDate} <= ${recentEndDate}`,
        isNull(ledgerRecords.deletedAt)
      )
    )
    .groupBy(ledgerRecords.recordDate)
    .orderBy(asc(ledgerRecords.recordDate));
  
  // 生成完整的日期范围数据(包含没有记录的日期)
  const dailyStats = [];
  const startDateObj = new Date(recentStartDate);
  for (let i = 0; i < daysPassed; i++) {
    const currentDate = new Date(startDateObj);
    currentDate.setDate(startDateObj.getDate() + i);
    const dateStr = currentDate.toISOString().split('T')[0];
    
    const dayData = dailyStatsRaw.find((d: any) => d.date === dateStr);
    dailyStats.push({
      date: dateStr,
      income: Number(dayData?.totalIncome || 0),
      expense: Number(dayData?.totalExpense || 0),
    });
  }
  
  // 获取最近30天的分类统计数据
  const recentCategoryStatsRaw = await db
    .select({
      categoryId: ledgerRecords.categoryId,
      type: ledgerRecords.type,
      totalAmount: sql<number>`COALESCE(SUM(${ledgerRecords.amount}), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.recordDate} >= ${recentStartDate}`,
        sql`${ledgerRecords.recordDate} <= ${recentEndDate}`,
        isNull(ledgerRecords.deletedAt)
      )
    )
    .groupBy(ledgerRecords.categoryId, ledgerRecords.type);
  
  // 获取最近30天的分类名称
  const recentCategoryIds = recentCategoryStatsRaw.map((c: any) => c.categoryId);
  let recentCategories: any[] = [];
  if (recentCategoryIds.length > 0) {
    recentCategories = await db
      .select({
        id: ledgerCategories.id,
        name: ledgerCategories.name,
      })
      .from(ledgerCategories)
      .where(sql`${ledgerCategories.id} IN (${sql.join(recentCategoryIds, sql`, `)})`);
  }
  
  const recentCategoryNameMap = new Map(recentCategories.map((c: any) => [c.id, c.name]));
  
  const recentExpenseCategories = recentCategoryStatsRaw
    .filter((c: any) => c.type === 'expense')
    .map((c: any) => ({
      category: recentCategoryNameMap.get(c.categoryId) || '未分类',
      amount: Number(c.totalAmount || 0),
    }))
    .sort((a: any, b: any) => b.amount - a.amount);
  
  const recentIncomeCategories = recentCategoryStatsRaw
    .filter((c: any) => c.type === 'income')
    .map((c: any) => ({
      category: recentCategoryNameMap.get(c.categoryId) || '未分类',
      amount: Number(c.totalAmount || 0),
    }))
    .sort((a: any, b: any) => b.amount - a.amount);
  
  return {
    yearlyStats: {
      income,
      expense,
    },
    recentStats: {
      income: recentIncome,
      expense: recentExpense,
      days: daysPassed,
    },
    dailyStats,
    memberStats,
    monthlyStats,
    categoryStats: {
      expense: expenseCategories,
      income: incomeCategories,
    },
    recentCategoryStats: {
      expense: recentExpenseCategories,
      income: recentIncomeCategories,
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
  
  // 验证请求用户是否是账本成员并获取权限
  const membership = await db
    .select({
      permissionView: ledgerMembers.permissionView,
      role: ledgerMembers.role,
    })
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
  
  const userPermission = membership[0].permissionView;
  
  // 检查查看权限
  if (userPermission === 'none') {
    // 不允许查看，返回空数据
    return {
      monthlyStats: { income: 0, expense: 0 },
      dailyStats: [],
    };
  }
  
  // 构建日期范围
  const monthStr = String(month).padStart(2, '0');
  const monthStart = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${monthStr}-${lastDay}`;
  
  // 构建成员筛选条件（根据权限进行安全检查）
  let memberCondition;
  if (userPermission === 'own') {
    // 如果权限是"仅自己"，强制只查看自己创建的记录
    memberCondition = sql`${ledgerRecords.createdBy} = ${requestUserId}`;
  } else if (userPermission === 'all' && memberIds && memberIds.length > 0) {
    // 如果权限是"全部"，允许使用 memberIds 筛选
    // 查询 memberIds 对应的 userId
    const memberUserIds = await db
      .select({ userId: ledgerMembers.userId })
      .from(ledgerMembers)
      .where(
        and(
          eq(ledgerMembers.ledgerId, ledgerId),
          sql`${ledgerMembers.id} IN (${sql.join(memberIds.map(id => sql`${id}`), sql`, `)})`
        )
      );
    
    if (memberUserIds.length > 0) {
      const userIds = memberUserIds.map((m: any) => m.userId);
      memberCondition = sql`${ledgerRecords.createdBy} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`;
    } else {
      memberCondition = sql`1 = 0`;
    }
  }
  // 如果权限是 'all' 且没有指定 memberIds，则 memberCondition 为 undefined
  
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
        sql`${ledgerRecords.recordDate} >= ${monthStart}`,
        sql`${ledgerRecords.recordDate} <= ${monthEnd}`,
        memberCondition,
        isNull(ledgerRecords.deletedAt)
      )
    );
  
  const monthlyStats = {
    income: Number(monthlyStatsRaw[0]?.totalIncome || 0),
    expense: Number(monthlyStatsRaw[0]?.totalExpense || 0),
  };
  
  // 获取每日统计
  const dailyStatsRaw = await db
    .select({
      recordDate: ledgerRecords.recordDate,
      totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'income' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerRecords.type} = 'expense' THEN ${ledgerRecords.amount} ELSE 0 END), 0)`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.recordDate} >= ${monthStart}`,
        sql`${ledgerRecords.recordDate} <= ${monthEnd}`,
        memberCondition,
        isNull(ledgerRecords.deletedAt)
      )
    )
    .groupBy(ledgerRecords.recordDate);
  
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
  
  // 验证请求用户是否是账本成员并获取权限
  const membership = await db
    .select({
      permissionView: ledgerMembers.permissionView,
      role: ledgerMembers.role,
    })
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
  
  const userPermission = membership[0].permissionView;
  const userRole = membership[0].role;
  
  // 检查查看权限
  if (userPermission === 'none') {
    // 不允许查看任何账目
    return [];
  }
  
  // 构建成员筛选条件（根据权限进行安全检查）
  let memberCondition;
  if (userPermission === 'own') {
    // 如果权限是"仅自己"，强制只查看自己创建的记录，忽略 memberIds 参数
    memberCondition = sql`${ledgerRecords.createdBy} = ${requestUserId}`;
  } else if (userPermission === 'all') {
    // 如果权限是"全部"，允许使用 memberIds 筛选
    if (memberIds && memberIds.length > 0) {
      // 注意：ledgerRecords 表中没有 memberId 字段，需要通过 createdBy 关联到成员
      // 这里先查询 memberIds 对应的 userId
      const memberUserIds = await db
        .select({ userId: ledgerMembers.userId })
        .from(ledgerMembers)
        .where(
          and(
            eq(ledgerMembers.ledgerId, ledgerId),
            sql`${ledgerMembers.id} IN (${sql.join(memberIds.map(id => sql`${id}`), sql`, `)})`
          )
        );
      
      if (memberUserIds.length > 0) {
        const userIds = memberUserIds.map((m: any) => m.userId);
        memberCondition = sql`${ledgerRecords.createdBy} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`;
      } else {
        // 如果没有找到对应的成员，返回空结果
        memberCondition = sql`1 = 0`;
      }
    }
    // 如果没有指定 memberIds，则 memberCondition 为 undefined，查看所有记录
  }
  // 如果权限是 'none'，已经在前面返回空数组了
  
  // 获取指定日期的记录
  const records = await db
    .select({
      id: ledgerRecords.id,
      type: ledgerRecords.type,
      amount: ledgerRecords.amount,
      categoryId: ledgerRecords.categoryId,
      description: ledgerRecords.description,
      date: ledgerRecords.recordDate,
      createdBy: ledgerRecords.createdBy,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        sql`${ledgerRecords.recordDate} = ${date}`,
        memberCondition,
        isNull(ledgerRecords.deletedAt)
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

/**
 * 添加记账记录
 */
export async function addTransaction(data: {
  ledgerId: number;
  userId: number;
  type: 'income' | 'expense';
  amount: number;
  categoryId: number;
  subcategoryId?: number;
  description?: string;
  imageUrl?: string;
  transactionDate: string;
  images?: string[];
  memberId?: number; // 为谁记账（默认为自己）
  accountId?: number; // 付款/收款方式
  reimbursementStatus?: 'none' | 'pending' | 'completed'; // 报销状态
  pendingType?: 'receivable' | 'payable'; // 待结类型（代收/代付）
  pendingIncludeStats?: number; // 待结账目是否计入统计（0=仅显示不计入，1=显示并计入）
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, data.ledgerId),
        eq(ledgerMembers.userId, data.userId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 检查是否需要审批
  const approvalCheck = await checkNeedApproval(data.ledgerId, data.userId);
  
  // 确定审批状态
  let approvalStatus: 'pending' | 'approved' | 'rejected' | 'not_required' = 'not_required';
  let approverIds: number[] = [];
  
  if (approvalCheck.needApproval && approvalCheck.rule) {
    approvalStatus = 'pending';
    
    // 获取审批人列表
    if (approvalCheck.rule.approverType === 'all') {
      // 需要全部成员审批（除了记账人自己）
      const allMembers = await db
        .select({ userId: ledgerMembers.userId })
        .from(ledgerMembers)
        .where(eq(ledgerMembers.ledgerId, data.ledgerId));
      
      approverIds = allMembers
        .map(m => m.userId)
        .filter(id => id !== data.userId);
    } else if (approvalCheck.rule.approverType === 'specific') {
      // 指定审批人
      const approverIdsJson = approvalCheck.rule.approverIds as any;
      approverIds = typeof approverIdsJson === 'string' 
        ? JSON.parse(approverIdsJson) 
        : approverIdsJson || [];
    }
  }
  
  // 插入记账记录（加密敏感字段）
  const recordData = {
    ledgerId: data.ledgerId,
    type: data.type,
    amount: data.amount.toString(),
    categoryId: data.categoryId,
    description: data.description || null,
    imageUrl: data.images && data.images.length > 0 ? data.images[0] : null,
    recordDate: data.transactionDate,
    createdBy: data.userId,
    reimbursementStatus: data.reimbursementStatus || 'none',
    pendingType: data.pendingType || null,
    pendingIncludeStats: data.pendingType ? (data.pendingIncludeStats ?? 1) : null,
  };
  const encryptedRecordData = await encryptFields(db, 'ledger_records', recordData, LEDGER_RECORD_ENCRYPT_FIELDS);
  const result = await db.insert(ledgerRecords).values(encryptedRecordData as any);
  
  // 如果需要审批，创建审批记录
  if (approvalStatus === 'pending' && approverIds.length > 0) {
    await createApprovalRecords(data.ledgerId, result.insertId, approverIds);
  }
  
  return {
    id: result.insertId,
    success: true,
    needApproval: approvalStatus === 'pending',
    approverIds,
  };
}

/**
 * 获取账本的记账记录列表（按日期分组）
 */
export async function getTransactionsList(
  ledgerId: number,
  userId: number,
  options?: {
    startDate?: string;
    endDate?: string;
    type?: 'income' | 'expense';
    categoryId?: number;
    memberId?: number;
    amountMin?: string;
    amountMax?: string;
    limit?: number;
    offset?: number;
  }
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证用户是否是账本成员并获取权限
  const membership = await db
    .select({
      permissionView: ledgerMembers.permissionView,
      role: ledgerMembers.role,
    })
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  const userPermission = membership[0].permissionView;
  
  // 检查查看权限
  if (userPermission === 'none') {
    return [];
  }
  
  // 构建查询条件
  const conditions = [eq(ledgerRecords.ledgerId, ledgerId)];
  
  // 如果权限是"仅自己"，强制只查看自己创建的记录
  if (userPermission === 'own') {
    conditions.push(sql`${ledgerRecords.createdBy} = ${userId}`);
  }
  
  if (options?.startDate) {
    conditions.push(sql`${ledgerRecords.recordDate} >= ${options.startDate}`);
  }
  if (options?.endDate) {
    conditions.push(sql`${ledgerRecords.recordDate} <= ${options.endDate}`);
  }
  if (options?.type) {
    conditions.push(eq(ledgerRecords.type, options.type));
  }
  if (options?.categoryId) {
    conditions.push(eq(ledgerRecords.categoryId, options.categoryId));
  }
  if (options?.amountMin) {
    conditions.push(sql`${ledgerRecords.amount} >= ${options.amountMin}`);
  }
  if (options?.amountMax) {
    conditions.push(sql`${ledgerRecords.amount} <= ${options.amountMax}`);
  }
  if (options?.memberId) {
    conditions.push(eq(ledgerRecords.createdBy, options.memberId));
  }
  
  // 注意：不过滤审批状态，返回所有记账（包括待审批的）
  // 前端会根据 approvalStatus 字段显示不同的状态图标
  
  // 获取记录
  const records = await db
    .select({
      id: ledgerRecords.id,
      type: ledgerRecords.type,
      amount: ledgerRecords.amount,
      categoryId: ledgerRecords.categoryId,
      description: ledgerRecords.description,
      date: ledgerRecords.recordDate,
      createdBy: ledgerRecords.createdBy,
      createdAt: ledgerRecords.createdAt,
      imageUrl: ledgerRecords.imageUrl,
      reimbursementStatus: ledgerRecords.reimbursementStatus,
      pendingType: ledgerRecords.pendingType,
      pendingIncludeStats: ledgerRecords.pendingIncludeStats,
    })
    .from(ledgerRecords)
    .where(and(...conditions, isNull(ledgerRecords.deletedAt)))
    .orderBy(desc(ledgerRecords.recordDate), desc(ledgerRecords.createdAt))
    .limit(options?.limit || 100)
    .offset(options?.offset || 0);
  
  // 获取所有涉及的分类ID
  const categoryIds = new Set<number>();
  records.forEach((r: any) => {
    if (r.categoryId) categoryIds.add(r.categoryId);
  });
  
  // 获取分类信息（包括所有父级分类）
  let categories: any[] = [];
  if (categoryIds.size > 0) {
    // 首先获取当前分类
    categories = await db
      .select({
        id: ledgerCategories.id,
        name: ledgerCategories.name,
        icon: ledgerCategories.icon,
        parentId: ledgerCategories.parentId,
      })
      .from(ledgerCategories)
      .where(sql`${ledgerCategories.id} IN (${sql.join(Array.from(categoryIds).map(id => sql`${id}`), sql`, `)})`);
    
    // 获取所有父级分类ID
    const parentIds = new Set<number>();
    categories.forEach((c: any) => {
      if (c.parentId) parentIds.add(c.parentId);
    });
    
    // 如果有父级分类，递归获取
    if (parentIds.size > 0) {
      const parentCategories = await db
        .select({
          id: ledgerCategories.id,
          name: ledgerCategories.name,
          icon: ledgerCategories.icon,
          parentId: ledgerCategories.parentId,
        })
        .from(ledgerCategories)
        .where(sql`${ledgerCategories.id} IN (${sql.join(Array.from(parentIds).map(id => sql`${id}`), sql`, `)})`);
      
      categories = [...categories, ...parentCategories];
      
      // 再获取父级的父级（最多3层）
      const grandParentIds = new Set<number>();
      parentCategories.forEach((c: any) => {
        if (c.parentId) grandParentIds.add(c.parentId);
      });
      
      if (grandParentIds.size > 0) {
        const grandParentCategories = await db
          .select({
            id: ledgerCategories.id,
            name: ledgerCategories.name,
            icon: ledgerCategories.icon,
            parentId: ledgerCategories.parentId,
          })
          .from(ledgerCategories)
          .where(sql`${ledgerCategories.id} IN (${sql.join(Array.from(grandParentIds).map(id => sql`${id}`), sql`, `)})`);
        
        categories = [...categories, ...grandParentCategories];
      }
    }
  }
  
  const categoryMap = new Map(categories.map((c: any) => [c.id, c]));
  
  // 构建分类路径的辅助函数
  const buildCategoryPath = (categoryId: number | null): string => {
    if (!categoryId) return '未分类';
    
    const path: string[] = [];
    let currentId: number | null = categoryId;
    
    // 最多遍历3层，防止无限循环
    for (let i = 0; i < 3 && currentId; i++) {
      const cat = categoryMap.get(currentId);
      if (!cat) break;
      
      path.unshift(cat.name); // 在前面插入，保证顺序是 一级 > 二级 > 三级
      currentId = cat.parentId;
    }
    
    return path.length > 0 ? path.join('-') : '未分类';
  };
  
  // 获取所有涉及的创建者ID
  const creatorIds = new Set<number>();
  records.forEach((r: any) => {
    if (r.createdBy) creatorIds.add(r.createdBy);
  });
  
  // 获取创建者用户信息
  let creators: any[] = [];
  if (creatorIds.size > 0) {
    creators = await db
      .select({
        id: users.id,
        username: users.username,
        avatar: users.avatar,
      })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(Array.from(creatorIds).map(id => sql`${id}`), sql`, `)})`);
  }
  
  const creatorMap = new Map(creators.map((c: any) => [c.id, c]));
  
  // 解密敏感字段
  const decryptedRecords = await decryptFieldsArray(db, 'ledger_records', records, LEDGER_RECORD_ENCRYPT_FIELDS);
  
  // 按日期分组
  const groupedRecords: Record<string, any> = {};
  
  decryptedRecords.forEach((record: any) => {
    const date = record.date;
    
    if (!groupedRecords[date]) {
      groupedRecords[date] = {
        date,
        records: [],
        income: 0,
        expense: 0,
      };
    }
    
    const category = categoryMap.get(record.categoryId);
    const creator = creatorMap.get(record.createdBy);
    
    const amount = Number(record.amount);
    
    groupedRecords[date].records.push({
      id: record.id,
      type: record.type,
      amount,
      category: buildCategoryPath(record.categoryId),
      categoryIcon: category?.icon,
      description: record.description,
      createdAt: record.createdAt,
      imageUrl: record.imageUrl,
      reimbursementStatus: record.reimbursementStatus,
      pendingType: record.pendingType,
      pendingIncludeStats: record.pendingIncludeStats,
      member: creator ? {
        username: creator.username,
        avatar: creator.avatar,
      } : null,
    });
    
    // 待结账目且 pendingIncludeStats === 0 时不计入统计
    const shouldIncludeInStats = !(record.pendingType && record.pendingIncludeStats === 0);
    
    if (shouldIncludeInStats) {
      if (record.type === 'income') {
        groupedRecords[date].income += amount;
      } else {
        groupedRecords[date].expense += amount;
      }
    }
  });
  
  // 转换为数组并计算每日余额
  const result = Object.values(groupedRecords).map((day: any) => ({
    ...day,
    balance: day.income - day.expense,
  }));
  
  return result;
}

/**
 * 获取单条记账详情
 */
export async function getTransactionDetail(
  ledgerId: number,
  transactionId: number,
  userId: number
) {
  try {
  console.log('[getTransactionDetail] 开始查询:', { ledgerId, transactionId, userId });
  
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证用户是否是账本成员并获取权限
  const membership = await db
    .select({
      permissionView: ledgerMembers.permissionView,
      role: ledgerMembers.role,
    })
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  const userPermission = membership[0].permissionView;
  
  // 检查查看权限
  if (userPermission === 'none') {
    throw new Error("您没有查看账目的权限");
  }
  
  // 获取记账详情
  const record = await db
    .select({
      id: ledgerRecords.id,
      ledgerId: ledgerRecords.ledgerId,
      categoryId: ledgerRecords.categoryId,
      amount: ledgerRecords.amount,
      type: ledgerRecords.type,
      date: ledgerRecords.recordDate,
      description: ledgerRecords.description,
      createdBy: ledgerRecords.createdBy,
      createdAt: ledgerRecords.createdAt,
      updatedAt: ledgerRecords.updatedAt,
      imageUrl: ledgerRecords.imageUrl,
      reimbursementStatus: ledgerRecords.reimbursementStatus,
      reimbursementNotes: ledgerRecords.reimbursementNotes,
      reimbursementVoucherUrl: ledgerRecords.reimbursementVoucherUrl,
      reimbursedAt: ledgerRecords.reimbursedAt,
      reimbursedBy: ledgerRecords.reimbursedBy,
      pendingType: ledgerRecords.pendingType,
      pendingIncludeStats: ledgerRecords.pendingIncludeStats,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.id, transactionId),
        eq(ledgerRecords.ledgerId, ledgerId),
        isNull(ledgerRecords.deletedAt)
      )
    )
    .limit(1);
  
  console.log('[getTransactionDetail] 查询结果:', { recordLength: record.length, record: record[0] });
  
  if (record.length === 0) {
    throw new Error("记账不存在");
  }
  
  const transaction = record[0];
  
  // 如果权限是"仅自己"，检查该记录是否是自己创建的
  if (userPermission === 'own' && transaction.createdBy !== userId) {
    throw new Error("您没有查看该账目的权限");
  }
  
  // 获取分类信息
  const category = await db
    .select({
      id: ledgerCategories.id,
      name: ledgerCategories.name,
      parentId: ledgerCategories.parentId,
    })
    .from(ledgerCategories)
    .where(eq(ledgerCategories.id, transaction.categoryId))
    .limit(1);
  
  let categoryName = '';
  let subcategoryName = '';
  
  if (category.length > 0) {
    if (category[0].parentId) {
      // 这是二级分类，需要获取父分类
      const parentCategory = await db
        .select({ name: ledgerCategories.name })
        .from(ledgerCategories)
        .where(eq(ledgerCategories.id, category[0].parentId))
        .limit(1);
      
      if (parentCategory.length > 0) {
        categoryName = parentCategory[0].name;
        subcategoryName = category[0].name;
      }
    } else {
      // 这是一级分类
      categoryName = category[0].name;
    }
  }
  
  // 获取成员信息(关联users表)
  const memberResult = await db
    .select({
      userId: ledgerMembers.userId,
      nickname: ledgerMembers.nickname,
      role: ledgerMembers.role,
      username: users.username,
      avatar: users.avatar,
    })
    .from(ledgerMembers)
    .leftJoin(users, eq(ledgerMembers.userId, users.id))
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, transaction.createdBy)
      )
    )
    .limit(1);
  
  const memberWithAvatar = memberResult.length > 0 ? memberResult[0] : null;
  
  // 构建分类路径
  const categoryPath: number[] = [];
  if (category.length > 0) {
    if (category[0].parentId) {
      // 有父分类，添加父分类 ID
      categoryPath.push(category[0].parentId);
    }
    // 添加当前分类 ID
    categoryPath.push(category[0].id);
  }
  
  // 解密敏感字段
  const decryptedTransaction = await decryptFields(db, 'ledger_records', transaction, LEDGER_RECORD_ENCRYPT_FIELDS);
  
  const result = {
    id: decryptedTransaction.id,
    ledgerId: decryptedTransaction.ledgerId,
    amount: decryptedTransaction.amount,
    type: decryptedTransaction.type,
    date: decryptedTransaction.date,
    description: decryptedTransaction.description,
    categoryId: transaction.categoryId,
    categoryPath,
    category: categoryName,
    subcategory: subcategoryName,
    createdBy: transaction.createdBy,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    member: memberWithAvatar,
    recordDate: transaction.date,
    approvalStatus: 'not_required' as const, // 默认不需要审批
    images: transaction.imageUrl ? [transaction.imageUrl] : [],
    reimbursementStatus: transaction.reimbursementStatus || 'none',
    reimbursementNotes: transaction.reimbursementNotes || null,
    reimbursementVoucherUrl: transaction.reimbursementVoucherUrl || null,
    reimbursedAt: transaction.reimbursedAt || null,
    reimbursedBy: transaction.reimbursedBy || null,
    pendingType: transaction.pendingType || null,
    pendingIncludeStats: transaction.pendingIncludeStats ?? null,
  };
  
  console.log('[getTransactionDetail] 返回结果:', result);
  return result;
  } catch (error) {
    console.error('[getTransactionDetail] 错误:', error);
    throw error;
  }
}

/**
 * 删除记账记录
 */
export async function deleteTransaction(
  recordId: number,
  userId: number
) {
  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");
  
  // 获取记录信息（使用原始mysql2连接）
  const [recordRows] = await conn.execute(
    'SELECT id, ledgerId, createdBy FROM ledger_records WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [recordId]
  ) as any;
  
  if (!recordRows || recordRows.length === 0) {
    throw new Error("记录不存在");
  }
  const record = recordRows[0];
  const ledgerId = record.ledgerId;
  console.log('[deleteTransaction] 找到记录:', { recordId, ledgerId, createdBy: record.createdBy });
  
  // 验证用户是否是账本成员
  const [memberRows] = await conn.execute(
    'SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
    [ledgerId, userId]
  ) as any;
  
  if (!memberRows || memberRows.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 软删除：使用原始SQL直接更新 deleted_at 和 deleted_by
  console.log('[deleteTransaction] 执行软删除:', { recordId, userId });
  await conn.execute(
    'UPDATE ledger_records SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
    [userId, recordId]
  );
  console.log('[deleteTransaction] 软删除成功');
  
  // 验证删除是否成功
  const [verifyRows] = await conn.execute(
    'SELECT id, deleted_at, deleted_by FROM ledger_records WHERE id = ?',
    [recordId]
  ) as any;
  console.log('[deleteTransaction] 验证结果:', verifyRows?.[0]);
  
  // 写入修改日志
  await insertRecordLog({
    recordId,
    ledgerId,
    operatorId: userId,
    action: 'delete',
    note: '删除账目',
  });
  
  return { success: true };
}

/**
 * 获取已删除的账目记录（60天内）
 */
export async function getDeletedTransactions(
  ledgerId: number,
  userId: number
) {
  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");
  const db = await getLedgerDb();
  
  console.log('[getDeletedTransactions] 开始查询:', { ledgerId, userId });
  
  // 验证用户是否是账本成员并获取权限
  const [memberRows] = await conn.execute(
    'SELECT permission_view, role FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
    [ledgerId, userId]
  ) as any;
  
  if (!memberRows || memberRows.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  const userPermission = memberRows[0].permission_view;
  console.log('[getDeletedTransactions] 用户权限:', userPermission);
  
  // 检查查看权限
  if (userPermission === 'none') {
    return [];
  }
  
  // 使用原始mysql2连接查询已删除的记录
  let records: any[];
  if (userPermission === 'own') {
    const [rows] = await conn.execute(
      'SELECT id, type, amount, categoryId, description, recordDate, createdBy, createdAt, imageUrl, deleted_at, deleted_by, reimbursement_status, pending_type, pending_include_stats FROM ledger_records WHERE ledgerId = ? AND deleted_at IS NOT NULL AND deleted_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND (deleted_by = ? OR createdBy = ?) ORDER BY deleted_at DESC',
      [ledgerId, userId, userId]
    ) as any;
    records = rows || [];
  } else {
    const [rows] = await conn.execute(
      'SELECT id, type, amount, categoryId, description, recordDate, createdBy, createdAt, imageUrl, deleted_at, deleted_by, reimbursement_status, pending_type, pending_include_stats FROM ledger_records WHERE ledgerId = ? AND deleted_at IS NOT NULL AND deleted_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) ORDER BY deleted_at DESC',
      [ledgerId]
    ) as any;
    records = rows || [];
  }
  
  console.log('[getDeletedTransactions] 查询结果:', { recordCount: records?.length || 0 });
  
  if (!records || records.length === 0) {
    return [];
  }
  
  // 获取分类信息
  const categoryIds = new Set<number>();
  records.forEach((r: any) => {
    if (r.categoryId) categoryIds.add(r.categoryId);
  });
  
  let categoriesMap: Record<number, string> = {};
  if (categoryIds.size > 0) {
    const catIdArr = [...categoryIds];
    const placeholders = catIdArr.map(() => '?').join(',');
    const [catRows] = await conn.execute(
      `SELECT id, name FROM ledger_categories WHERE id IN (${placeholders})`,
      catIdArr
    ) as any;
    (catRows || []).forEach((c: any) => {
      categoriesMap[c.id] = c.name;
    });
  }
  
  // 获取用户信息（删除人和创建人）
  const userIdSet = new Set<number>();
  records.forEach((r: any) => {
    if (r.deleted_by) userIdSet.add(r.deleted_by);
    if (r.createdBy) userIdSet.add(r.createdBy);
  });
  
  let usersMap: Record<number, string> = {};
  let avatarsMap: Record<number, string | null> = {};
  if (userIdSet.size > 0) {
    const userIdArr = [...userIdSet];
    const placeholders = userIdArr.map(() => '?').join(',');
    const [userRows] = await conn.execute(
      `SELECT id, username, name, avatar FROM users WHERE id IN (${placeholders})`,
      userIdArr
    ) as any;
    (userRows || []).forEach((u: any) => {
      usersMap[u.id] = u.name || u.username || '未知';
      avatarsMap[u.id] = u.avatar || null;
    });
  }
  
  // 辅助函数：将Date对象转为字符串
  const toStr = (v: any) => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };
  // 辅助函数：将日期格式化为YYYY-MM-DD
  const toDateStr = (v: any) => {
    if (!v) return null;
    if (v instanceof Date) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // 如果已经是字符串，截取前10位（YYYY-MM-DD）
    return String(v).substring(0, 10);
  };
  
  // 格式化结果（确保所有字段都是可序列化的基本类型）
  const formattedRecords = records.map((r: any) => ({
    id: r.id,
    type: r.type,
    amount: r.amount ? String(r.amount) : '0',
    categoryId: r.categoryId,
    description: r.description || '',
    date: toDateStr(r.recordDate),
    createdBy: r.createdBy,
    createdAt: toStr(r.createdAt),
    imageUrl: r.imageUrl || null,
    deletedAt: toDateStr(r.deleted_at),
    deletedBy: r.deleted_by,
    categoryName: r.categoryId ? (categoriesMap[r.categoryId] || '未分类') : '未分类',
    createdByName: usersMap[r.createdBy] || '未知',
    createdByAvatar: avatarsMap[r.createdBy] || null,
    deletedByName: r.deleted_by ? (usersMap[r.deleted_by] || '未知') : '未知',
    reimbursementStatus: r.reimbursement_status || 'none',
    pendingType: r.pending_type || null,
    pendingIncludeStats: r.pending_include_stats ?? 1,
  }));
  
  // 解密敏感字段
  if (db) {
    const decryptedRecords = await decryptFieldsArray(db, 'ledger_records', formattedRecords, LEDGER_RECORD_ENCRYPT_FIELDS);
    return decryptedRecords;
  }
  
  return formattedRecords;
}

/**
 * 恢复已删除的账目记录
 */
export async function restoreTransaction(
  recordId: number,
  userId: number
) {
  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");
  
  // 获取记录信息
  const [recordRows] = await conn.execute(
    'SELECT id, ledgerId, deleted_at FROM ledger_records WHERE id = ? LIMIT 1',
    [recordId]
  ) as any;
  
  if (!recordRows || recordRows.length === 0) {
    throw new Error("记录不存在");
  }
  
  const record = recordRows[0];
  
  if (!record.deleted_at) {
    throw new Error("该记录未被删除");
  }
  
  // 检查是否超过60天
  const deletedDate = new Date(record.deleted_at);
  const now = new Date();
  const diffDays = (now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 60) {
    throw new Error("该记录已超过60天，无法恢复");
  }
  
  // 验证用户是否是账本成员
  const [memberRows] = await conn.execute(
    'SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
    [record.ledgerId, userId]
  ) as any;
  
  if (!memberRows || memberRows.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 恢复记录：清除 deleted_at 和 deleted_by
  await conn.execute(
    'UPDATE ledger_records SET deleted_at = NULL, deleted_by = NULL WHERE id = ?',
    [recordId]
  );
  
  console.log('[restoreTransaction] 恢复成功:', { recordId });
  
  // 写入修改日志
  await insertRecordLog({
    recordId,
    ledgerId: record.ledgerId,
    operatorId: userId,
    action: 'restore',
    note: '恢复已删除账目',
  });
  
  return { success: true };
}

/**
 * 清理超过60天的已删除记录（永久删除）
 */
export async function purgeExpiredDeletedRecords() {
  const conn = await getDbConnection();
  if (!conn) throw new Error("Database connection failed");
  
  await conn.execute(
    'DELETE FROM ledger_records WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL 60 DAY)'
  );
  
  return { success: true };
}

/**
 * 更新记账记录
 */
export async function updateTransaction(
  recordId: number,
  userId: number,
  data: {
    type?: 'income' | 'expense';
    amount?: number;
    categoryId?: number;
    subcategoryId?: number;
    description?: string;
    transactionDate?: string;
    images?: string[];
    memberId?: number;
    accountId?: number;
    reimbursementStatus?: 'none' | 'pending' | 'completed';
    pendingType?: 'receivable' | 'payable' | null;
    pendingIncludeStats?: number | null;
  }
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 获取完整的旧记录信息（用于对比变更）
  const oldRecords = await db
    .select()
    .from(ledgerRecords)
    .where(and(eq(ledgerRecords.id, recordId), isNull(ledgerRecords.deletedAt)))
    .limit(1);
  
  if (oldRecords.length === 0) {
    throw new Error("记录不存在");
  }
  
  const oldRecord = oldRecords[0] as any;
  
  // 解密旧记录的敏感字段
  const decryptedOldRecord = await decryptFields(db, 'ledger_records', oldRecord, LEDGER_RECORD_ENCRYPT_FIELDS);
  
  // 验证用户是否是账本成员
  const membership = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, oldRecord.ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }
  
  // 构建更新数据，并对比旧值只记录真正变化的字段
  const updateData: any = {};
  const logChanges: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> = [];
  
  const typeLabel = (t: string) => t === 'income' ? '收入' : '支出';
  const reimbursementLabel = (s: string) => ({ none: '无报销', pending: '待报销', completed: '已报销' }[s] || s);
  const pendingLabel = (t: string | null) => t === 'receivable' ? '代收' : t === 'payable' ? '代付' : '无';
  
  if (data.type && data.type !== decryptedOldRecord.type) {
    updateData.type = data.type;
    logChanges.push({ fieldName: '类型', oldValue: typeLabel(decryptedOldRecord.type), newValue: typeLabel(data.type) });
  } else if (data.type) {
    updateData.type = data.type; // 仍然更新，但不记录日志
  }
  
  if (data.amount !== undefined && String(data.amount) !== String(parseFloat(decryptedOldRecord.amount))) {
    updateData.amount = data.amount.toString();
    logChanges.push({ fieldName: '金额', oldValue: String(parseFloat(decryptedOldRecord.amount)), newValue: String(data.amount) });
  } else if (data.amount !== undefined) {
    updateData.amount = data.amount.toString();
  }
  
  if (data.categoryId && data.categoryId !== decryptedOldRecord.categoryId) {
    updateData.categoryId = data.categoryId;
    logChanges.push({ fieldName: '分类', oldValue: String(decryptedOldRecord.categoryId), newValue: String(data.categoryId) });
  } else if (data.categoryId) {
    updateData.categoryId = data.categoryId;
  }
  
  if (data.subcategoryId !== undefined) { updateData.subcategoryId = data.subcategoryId; }
  
  if (data.description !== undefined && (data.description || '') !== (decryptedOldRecord.description || '')) {
    updateData.description = data.description;
    logChanges.push({ fieldName: '备注', oldValue: decryptedOldRecord.description || '无', newValue: data.description || '无' });
  } else if (data.description !== undefined) {
    updateData.description = data.description;
  }
  
  if (data.transactionDate && data.transactionDate !== decryptedOldRecord.recordDate) {
    updateData.recordDate = data.transactionDate;
    logChanges.push({ fieldName: '日期', oldValue: decryptedOldRecord.recordDate, newValue: data.transactionDate });
  } else if (data.transactionDate) {
    updateData.recordDate = data.transactionDate;
  }
  
  if (data.images && data.images.length > 0 && data.images[0] !== decryptedOldRecord.imageUrl) {
    updateData.imageUrl = data.images[0];
    logChanges.push({ fieldName: '凭证图片', oldValue: decryptedOldRecord.imageUrl ? '有' : '无', newValue: '已更新' });
  } else if (data.images && data.images.length > 0) {
    updateData.imageUrl = data.images[0];
  }
  
  if (data.memberId && data.memberId !== decryptedOldRecord.memberId) {
    updateData.memberId = data.memberId;
    logChanges.push({ fieldName: '支出人', oldValue: String(decryptedOldRecord.memberId || '无'), newValue: String(data.memberId) });
  } else if (data.memberId) {
    updateData.memberId = data.memberId;
  }
  
  if (data.accountId !== undefined && data.accountId !== decryptedOldRecord.accountId) {
    updateData.accountId = data.accountId;
    logChanges.push({ fieldName: '账户', oldValue: decryptedOldRecord.accountId ? String(decryptedOldRecord.accountId) : '无', newValue: data.accountId ? String(data.accountId) : '无' });
  } else if (data.accountId !== undefined) {
    updateData.accountId = data.accountId;
  }
  
  if (data.reimbursementStatus !== undefined && data.reimbursementStatus !== decryptedOldRecord.reimbursementStatus) {
    updateData.reimbursementStatus = data.reimbursementStatus;
    logChanges.push({ fieldName: '报销状态', oldValue: reimbursementLabel(decryptedOldRecord.reimbursementStatus), newValue: reimbursementLabel(data.reimbursementStatus) });
  } else if (data.reimbursementStatus !== undefined) {
    updateData.reimbursementStatus = data.reimbursementStatus;
  }
  
  if (data.pendingType !== undefined) {
    const oldPending = decryptedOldRecord.pendingType || null;
    const newPending = data.pendingType || null;
    if (newPending !== oldPending) {
      updateData.pendingType = data.pendingType;
      if (data.pendingType === null) {
        updateData.pendingIncludeStats = null;
      }
      logChanges.push({ fieldName: '待结状态', oldValue: pendingLabel(oldPending), newValue: pendingLabel(newPending) });
    } else {
      updateData.pendingType = data.pendingType;
    }
  }
  if (data.pendingIncludeStats !== undefined) updateData.pendingIncludeStats = data.pendingIncludeStats;
  
  // 加密敏感字段
  const encryptedUpdateData = await encryptFields(db, 'ledger_records', updateData, LEDGER_RECORD_ENCRYPT_FIELDS);
  
  // 更新记录
  await db
    .update(ledgerRecords)
    .set(encryptedUpdateData)
    .where(eq(ledgerRecords.id, recordId));
  
  // 只有真正有变化的字段才写入修改日志
  if (logChanges.length > 0) {
    console.log('[updateTransaction] 准备写入日志, logChanges数量:', logChanges.length, 'recordId:', recordId, 'ledgerId:', oldRecord.ledgerId, 'userId:', userId);
    for (const change of logChanges) {
      await insertRecordLog({
        recordId,
        ledgerId: oldRecord.ledgerId,
        operatorId: userId,
        action: 'edit',
        fieldName: change.fieldName,
        oldValue: change.oldValue,
        newValue: change.newValue,
      });
    }
  } else {
    console.log('[updateTransaction] 没有字段变化，不写入日志');
  }
  
  return { success: true };
}

// ==================== 审批相关函数 ====================

/**
 * 获取账本的审批规则列表
 */
export async function getApprovalRules(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  const { ledgerApprovalRules, ledgerMembers, ledgers } = await import("../drizzle/schema.js");
  
  // 验证用户权限 - 只有账本创建人(owner)和管理员(admin)才能查看审批规则
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
  
  if (member.length === 0 || (member[0].role !== 'owner' && member[0].role !== 'admin')) {
    throw new Error("只有账本创建人和管理员可以查看审批规则");
  }
  
  // 获取审批规则
  const rules = await db
    .select()
    .from(ledgerApprovalRules)
    .where(eq(ledgerApprovalRules.ledgerId, ledgerId));
  
  return rules;
}

/**
 * 保存审批规则
 */
export async function saveApprovalRules(
  ledgerId: number,
  userId: number,
  rules: Array<{
    recorderId: number | null;
    approverType: 'all' | 'specific';
    approverIds?: number[];
  }>
) {
  const db = await getLedgerDb();
  const { ledgerApprovalRules, ledgerMembers } = await import("../drizzle/schema.js");
  
  // 验证用户权限 - 只有账本创建人(owner)和管理员(admin)才能设置审批规则
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
  
  if (member.length === 0 || (member[0].role !== 'owner' && member[0].role !== 'admin')) {
    throw new Error("只有账本创建人和管理员可以设置审批规则");
  }
  
  // 删除旧规则
  await db
    .delete(ledgerApprovalRules)
    .where(eq(ledgerApprovalRules.ledgerId, ledgerId));
  
  // 插入新规则
  for (const rule of rules) {
    await db.insert(ledgerApprovalRules).values({
      ledgerId,
      recorderId: rule.recorderId,
      approverType: rule.approverType,
      approverIds: rule.approverIds ? JSON.stringify(rule.approverIds) : null,
      isEnabled: 1,
      createdBy: userId,
    });
  }
  
  return { success: true };
}

/**
 * 删除审批规则
 */
export async function deleteApprovalRule(ruleId: number, userId: number) {
  const db = await getLedgerDb();
  const { ledgerApprovalRules, ledgers } = await import("../drizzle/schema.js");
  
  // 获取规则
  const rule = await db
    .select()
    .from(ledgerApprovalRules)
    .where(eq(ledgerApprovalRules.id, ruleId))
    .limit(1);
  
  if (rule.length === 0) {
    throw new Error("规则不存在");
  }
  
  // 验证用户权限
  const ledger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, rule[0].ledgerId))
    .limit(1);
  
  if (ledger.length === 0 || ledger[0].ownerId !== userId) {
    throw new Error("只有账本创建者可以删除审批规则");
  }
  
  // 删除规则
  await db
    .delete(ledgerApprovalRules)
    .where(eq(ledgerApprovalRules.id, ruleId));
  
  return { success: true };
}

/**
 * 检查记账是否需要审批
 */
export async function checkNeedApproval(ledgerId: number, recorderId: number) {
  const db = await getLedgerDb();
  const { ledgerApprovalRules } = await import("../drizzle/schema.js");
  
  // 查找特殊规则（recorderId 匹配）
  const specificRule = await db
    .select()
    .from(ledgerApprovalRules)
    .where(
      and(
        eq(ledgerApprovalRules.ledgerId, ledgerId),
        eq(ledgerApprovalRules.recorderId, recorderId),
        eq(ledgerApprovalRules.isEnabled, 1)
      )
    )
    .limit(1);
  
  if (specificRule.length > 0) {
    return {
      needApproval: true,
      rule: specificRule[0],
    };
  }
  
  // 查找默认规则（recorderId 为 null）
  const defaultRule = await db
    .select()
    .from(ledgerApprovalRules)
    .where(
      and(
        eq(ledgerApprovalRules.ledgerId, ledgerId),
        isNull(ledgerApprovalRules.recorderId),
        eq(ledgerApprovalRules.isEnabled, 1)
      )
    )
    .limit(1);
  
  if (defaultRule.length > 0) {
    return {
      needApproval: true,
      rule: defaultRule[0],
    };
  }
  
  return {
    needApproval: false,
    rule: null,
  };
}

/**
 * 创建审批记录
 */
export async function createApprovalRecords(
  ledgerId: number,
  transactionId: number,
  approverIds: number[]
) {
  const db = await getLedgerDb();
  const { ledgerApprovalRecords } = await import("../drizzle/schema.js");
  
  // 为每个审批人创建审批记录
  for (const approverId of approverIds) {
    await db.insert(ledgerApprovalRecords).values({
      ledgerId,
      transactionId,
      approverId,
      status: 'pending',
    });
  }
  
  return { success: true };
}

/**
 * 审批记账
 */
export async function approveTransaction(
  transactionId: number,
  userId: number,
  action: 'approved' | 'rejected',
  comment?: string
) {
  const db = await getLedgerDb();
  const { ledgerApprovalRecords, transactions } = await import("../drizzle/schema.js");
  
  // 更新审批记录
  await db
    .update(ledgerApprovalRecords)
    .set({
      status: action,
      comment: comment || null,
    })
    .where(
      and(
        eq(ledgerApprovalRecords.transactionId, transactionId),
        eq(ledgerApprovalRecords.approverId, userId)
      )
    );
  
  // 检查是否所有审批人都已审批
  const allRecords = await db
    .select()
    .from(ledgerApprovalRecords)
    .where(eq(ledgerApprovalRecords.transactionId, transactionId));
  
  const allApproved = allRecords.every(r => r.status === 'approved');
  const anyRejected = allRecords.some(r => r.status === 'rejected');
  
  // 更新交易状态
  if (allApproved) {
    await db
      .update(transactions)
      .set({ approvalStatus: 'approved' })
      .where(eq(transactions.id, transactionId));
  } else if (anyRejected) {
    await db
      .update(transactions)
      .set({ approvalStatus: 'rejected' })
      .where(eq(transactions.id, transactionId));
  }
  
  return { success: true, allApproved, anyRejected };
}

/**
 * 获取待审批的记账列表
 */
export async function getPendingApprovals(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  const { ledgerApprovalRecords, transactions } = await import("../drizzle/schema.js");
  
  // 获取待审批的记录
  const records = await db
    .select({
      id: ledgerApprovalRecords.id,
      transactionId: ledgerApprovalRecords.transactionId,
      status: ledgerApprovalRecords.status,
      comment: ledgerApprovalRecords.comment,
      createdAt: ledgerApprovalRecords.createdAt,
      transaction: transactions,
    })
    .from(ledgerApprovalRecords)
    .leftJoin(transactions, eq(ledgerApprovalRecords.transactionId, transactions.id))
    .where(
      and(
        eq(ledgerApprovalRecords.ledgerId, ledgerId),
        eq(ledgerApprovalRecords.approverId, userId),
        eq(ledgerApprovalRecords.status, 'pending')
      )
    );
  
  return records;
}

/**
 * 设置成员角色（仅owner可操作）
 * 重写版本：使用targetUserId而不是memberId来标识目标成员
 */
export async function setMemberRole(
  ledgerId: number,
  operatorUserId: number,
  targetUserId: number,
  role: 'admin' | 'member'
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  console.log('[setMemberRole] 调用参数:', { ledgerId, operatorUserId, targetUserId, role });
  
  // 第1步：验证操作者是owner
  const operatorRows = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, operatorUserId)
      )
    )
    .limit(1);
  
  console.log('[setMemberRole] 操作者查询结果:', operatorRows);
  
  if (operatorRows.length === 0 || operatorRows[0].role !== 'owner') {
    throw new Error('只有账本所有者可以设置管理员');
  }
  
  // 第2步：通过userId+ledgerId查找目标成员
  const targetRows = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, targetUserId)
      )
    )
    .limit(1);
  
  console.log('[setMemberRole] 目标成员查询结果:', targetRows);
  
  if (targetRows.length === 0) {
    throw new Error('目标成员不存在于该账本中');
  }
  
  const targetMember = targetRows[0];
  
  // 第3步：不能修改owner的角色
  if (targetMember.role === 'owner') {
    throw new Error('不能修改所有者的角色');
  }
  
  // 第4步：更新角色（通过记录的主键id更新）
  await db
    .update(ledgerMembers)
    .set({ role })
    .where(eq(ledgerMembers.id, targetMember.id));
  
  console.log('[setMemberRole] 角色更新成功:', { targetMemberId: targetMember.id, newRole: role });
  
  return { success: true };
}

/**
 * 管理报销（管理员/owner操作）
 */
export async function manageReimbursement(
  recordId: number,
  userId: number,
  status: 'none' | 'pending' | 'completed',
  notes?: string,
  voucherImage?: string
) {
  console.log('[manageReimbursement] 开始执行', { recordId, userId, status, notes, hasVoucherImage: !!voucherImage });
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 获取账目信息
  const record = await db
    .select()
    .from(ledgerRecords)
    .where(and(eq(ledgerRecords.id, recordId), isNull(ledgerRecords.deletedAt)))
    .limit(1)
    .then((rows: any[]) => rows[0]);
  
  if (!record) {
    console.log('[manageReimbursement] 账目不存在', recordId);
    throw new Error('账目不存在');
  }
  console.log('[manageReimbursement] 找到账目', { recordId, ledgerId: record.ledgerId, currentStatus: record.reimbursementStatus });
  
  // 验证权限（admin或owner）
  const member = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, record.ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1)
    .then((rows: any[]) => rows[0]);
  
  if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
    console.log('[manageReimbursement] 权限不足', { userId, memberRole: member?.role });
    throw new Error('只有管理员和所有者可以管理报销');
  }
  console.log('[manageReimbursement] 权限验证通过', { userId, role: member.role });
  
  // 上传凭证图片（如果有）
  let voucherUrl = record.reimbursementVoucherUrl;
  if (voucherImage) {
    const { uploadImageToCOS } = await import('./cos-upload');
    voucherUrl = await uploadImageToCOS(voucherImage, 'reimbursement-vouchers');
  }
  
  // 记录旧状态
  const oldStatus = record.reimbursementStatus;
  
  // 更新报销状态
  const updateData: any = {
    reimbursementStatus: status,
    reimbursementNotes: notes || record.reimbursementNotes,
  };
  
  if (voucherUrl) {
    updateData.reimbursementVoucherUrl = voucherUrl;
  }
  
  if (status === 'completed') {
    updateData.reimbursedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    updateData.reimbursedBy = userId;
  }
  
  console.log('[manageReimbursement] 准备更新数据库', { recordId, updateData });
  await db
    .update(ledgerRecords)
    .set(updateData)
    .where(eq(ledgerRecords.id, recordId));
  console.log('[manageReimbursement] 数据库更新成功');
  
  // 记录历史
  // 加密报销备注
  const historyData = {
    recordId,
    ledgerId: record.ledgerId,
    operatedBy: userId,
    action: status === 'completed' ? 'mark_completed' : (status === 'pending' ? 'mark_pending' : 'update'),
    oldStatus,
    newStatus: status,
    notes: notes || null,
    voucherUrl: voucherUrl || null,
  };
  const encryptedHistoryData = await encryptFields(db, 'reimbursement_history', historyData, REIMBURSEMENT_ENCRYPT_FIELDS);
  
  const { reimbursementHistory } = await import("../drizzle/schema.js");
  await db.insert(reimbursementHistory).values(encryptedHistoryData as any);
  
  console.log('[manageReimbursement] 完成所有操作', { recordId, newStatus: status });
  return { 
    success: true, 
    voucherUrl: voucherUrl || undefined 
  };
}

/**
 * 获取报销历史
 */
export async function getReimbursementHistory(recordId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 获取账目信息
  const record = await db
    .select()
    .from(ledgerRecords)
    .where(and(eq(ledgerRecords.id, recordId), isNull(ledgerRecords.deletedAt)))
    .limit(1)
    .then((rows: any[]) => rows[0]);
  
  if (!record) {
    throw new Error('账目不存在');
  }
  
  // 验证权限（必须是账本成员）
  const member = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, record.ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1)
    .then((rows: any[]) => rows[0]);
  
  if (!member) {
    throw new Error('无权查看此账目');
  }
  
  // 获取历史记录
  const { reimbursementHistory } = await import("../drizzle/schema.js");
  const history = await db
    .select({
      id: reimbursementHistory.id,
      operatedBy: reimbursementHistory.operatedBy,
      action: reimbursementHistory.action,
      oldStatus: reimbursementHistory.oldStatus,
      newStatus: reimbursementHistory.newStatus,
      notes: reimbursementHistory.notes,
      voucherUrl: reimbursementHistory.voucherUrl,
      createdAt: reimbursementHistory.createdAt,
      operatorName: users.username,
      operatorNickname: ledgerMembers.nickname,
    })
    .from(reimbursementHistory)
    .leftJoin(users, eq(reimbursementHistory.operatedBy, users.id))
    .leftJoin(
      ledgerMembers,
      and(
        eq(ledgerMembers.userId, reimbursementHistory.operatedBy),
        eq(ledgerMembers.ledgerId, record.ledgerId)
      )
    )
    .where(eq(reimbursementHistory.recordId, recordId))
    .orderBy(desc(reimbursementHistory.createdAt));
  
  // 解密敏感字段
  const decryptedHistory = await decryptFieldsArray(db, 'reimbursement_history', history, REIMBURSEMENT_ENCRYPT_FIELDS);
  
  // 格式化返回数据
  return decryptedHistory.map((h: any) => ({
    id: h.id,
    operatedBy: h.operatorNickname || h.operatorName || '未知',
    action: h.action,
    oldStatus: h.oldStatus,
    newStatus: h.newStatus,
    notes: h.notes,
    voucherUrl: h.voucherUrl,
    createdAt: h.createdAt,
  }));
}

/**
 * 获取报销统计
 */
export async function getReimbursementStats(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证权限
  const member = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1)
    .then((rows: any[]) => rows[0]);
  
  if (!member) {
    throw new Error('无权查看此账本');
  }
  
  // 统计待报销
  const pendingStats = await db
    .select({
      count: sql<number>`count(*)`,
      amount: sql<number>`sum(${ledgerRecords.amount})`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        eq(ledgerRecords.reimbursementStatus, 'pending'),
        isNull(ledgerRecords.deletedAt)
      )
    )
    .then((rows: any[]) => rows[0]);
  
  // 统计已报销
  const completedStats = await db
    .select({
      count: sql<number>`count(*)`,
      amount: sql<number>`sum(${ledgerRecords.amount})`,
    })
    .from(ledgerRecords)
    .where(
      and(
        eq(ledgerRecords.ledgerId, ledgerId),
        eq(ledgerRecords.reimbursementStatus, 'completed'),
        isNull(ledgerRecords.deletedAt)
      )
    )
    .then((rows: any[]) => rows[0]);
  
  return {
    pending: {
      count: pendingStats?.count || 0,
      amount: Number(pendingStats?.amount || 0),
    },
    completed: {
      count: completedStats?.count || 0,
      amount: Number(completedStats?.amount || 0),
    },
  };
}


/**
 * 获取账本所有带图片的记录
 * 完全参照 getTransactionsList 的实现方式
 */
export async function getLedgerImages(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证用户是否是账本成员
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
    throw new Error("您不是该账本的成员");
  }
  
  // 获取记录 - 完全复制 getTransactionsList 的查询方式
  const records = await db
    .select({
      id: ledgerRecords.id,
      type: ledgerRecords.type,
      amount: ledgerRecords.amount,
      categoryId: ledgerRecords.categoryId,
      description: ledgerRecords.description,
      date: ledgerRecords.recordDate,
      createdBy: ledgerRecords.createdBy,
      createdAt: ledgerRecords.createdAt,
      imageUrl: ledgerRecords.imageUrl,
    })
    .from(ledgerRecords)
    .where(and(eq(ledgerRecords.ledgerId, ledgerId), isNull(ledgerRecords.deletedAt)))
    .orderBy(desc(ledgerRecords.recordDate), desc(ledgerRecords.createdAt))
    .limit(500);
  
  // 解密敏感字段 - 使用和 getTransactionsList 完全相同的4参数调用
  const decryptedRecords = await decryptFieldsArray(db, 'ledger_records', records, LEDGER_RECORD_ENCRYPT_FIELDS);
  
  // 在应用层过滤出有图片的记录
  const recordsWithImages = decryptedRecords.filter((record: any) => {
    return record.imageUrl && String(record.imageUrl).trim() !== '';
  });
  
  // 获取分类名称
  const categoryIds = new Set<number>();
  recordsWithImages.forEach((r: any) => {
    if (r.categoryId) categoryIds.add(r.categoryId);
  });
  
  let categories: any[] = [];
  if (categoryIds.size > 0) {
    categories = await db
      .select({
        id: ledgerCategories.id,
        name: ledgerCategories.name,
      })
      .from(ledgerCategories)
      .where(sql`${ledgerCategories.id} IN (${sql.join(Array.from(categoryIds).map(id => sql`${id}`), sql`, `)})`);
  }
  
  const categoryNameMap = new Map(categories.map((c: any) => [c.id, c.name]));
  
  return recordsWithImages.map((record: any) => ({
    id: record.id,
    amount: Number(record.amount),
    type: record.type,
    category: categoryNameMap.get(record.categoryId) || '未分类',
    description: record.description,
    imageUrl: record.imageUrl,
    date: record.date,
  }));
}

/**
 * 获取账本导出统计信息
 */
export async function getLedgerExportStats(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");
  
  // 验证用户是否是账本成员
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
    throw new Error("您不是该账本的成员");
  }
  
  // 获取账本信息
  const ledger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .limit(1);
  
  if (ledger.length === 0) {
    throw new Error("账本不存在");
  }
  
  // 获取所有记录（不包括已删除的）
  const records = await db
    .select({
      id: ledgerRecords.id,
      type: ledgerRecords.type,
      amount: ledgerRecords.amount,
      recordDate: ledgerRecords.recordDate,
    })
    .from(ledgerRecords)
    .where(and(eq(ledgerRecords.ledgerId, ledgerId), isNull(ledgerRecords.deletedAt)))
  
  // 解密金额字段
  const decryptedRecords = await decryptFieldsArray(db, 'ledger_records', records, ['amount']);
  
  // 统计数据
  let totalRecords = decryptedRecords.length;
  let totalIncome = 0;
  let totalExpense = 0;
  let earliestDate: string | null = null;
  let latestDate: string | null = null;
  
  decryptedRecords.forEach((record: any) => {
    const amount = parseFloat(record.amount || '0');
    if (record.type === 'income') {
      totalIncome += amount;
    } else if (record.type === 'expense') {
      totalExpense += amount;
    }
    
    const recordDate = record.recordDate;
    if (recordDate) {
      if (!earliestDate || recordDate < earliestDate) {
        earliestDate = recordDate;
      }
      if (!latestDate || recordDate > latestDate) {
        latestDate = recordDate;
      }
    }
  });
  
  return {
    ledgerName: ledger[0].name,
    totalRecords,
    totalIncome: totalIncome.toFixed(2),
    totalExpense: totalExpense.toFixed(2),
    balance: (totalIncome - totalExpense).toFixed(2),
    earliestDate,
    latestDate,
  };
}

/**
 * 转移账本创建人（所有权转移）
 * 将当前owner的角色降为admin，将目标成员提升为owner
 * 同时更新ledgers表的ownerId和createdBy
 */
export async function transferOwnership(
  ledgerId: number,
  currentOwnerId: number,
  newOwnerId: number
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");

  // 验证当前用户是owner
  const ownerRows = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, currentOwnerId)
      )
    )
    .limit(1);

  if (ownerRows.length === 0 || ownerRows[0].role !== 'owner') {
    throw new Error('只有账本创建人才能转移所有权');
  }

  // 验证目标用户是账本成员
  const targetRows = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, newOwnerId)
      )
    )
    .limit(1);

  if (targetRows.length === 0) {
    throw new Error('目标用户不是该账本的成员');
  }

  if (targetRows[0].userId === currentOwnerId) {
    throw new Error('不能转移给自己');
  }

  // 将当前owner降为admin
  await db
    .update(ledgerMembers)
    .set({ role: 'admin' })
    .where(eq(ledgerMembers.id, ownerRows[0].id));

  // 将目标成员提升为owner，并赋予全部权限
  await db
    .update(ledgerMembers)
    .set({
      role: 'owner',
      permissionView: 'all',
      permissionAdd: 'all',
      permissionEdit: 'all',
      permissionDelete: 'all',
      canEdit: 1,
      canDelete: 1,
      canInvite: 1,
    })
    .where(eq(ledgerMembers.id, targetRows[0].id));

  // 更新ledgers表的ownerId
  await db.execute(sql`UPDATE ledgers SET ownerId = ${newOwnerId} WHERE id = ${ledgerId}`);

  console.log('[transferOwnership] 所有权转移成功:', {
    ledgerId,
    from: currentOwnerId,
    to: newOwnerId,
  });

  return { success: true };
}

/**
 * 获取或生成账本密钥（Web3风格的长密钥）
 * 密钥存储在数据库中，如果不存在则自动生成
 */
export async function getLedgerSecretKey(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");

  // 验证用户是否是账本成员且有管理权限（owner或admin）
  const memberRows = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1);

  if (memberRows.length === 0) {
    throw new Error('您不是该账本的成员');
  }

  if (memberRows[0].role !== 'owner' && memberRows[0].role !== 'admin') {
    throw new Error('只有管理员或创建人可以查看账本密钥');
  }

  // 确保secret_key列存在
  try {
    await db.execute(sql`ALTER TABLE ledgers ADD COLUMN secret_key VARCHAR(130) NULL DEFAULT NULL`);
  } catch (e: any) {
    if (!e.message?.includes('Duplicate column')) {
      console.error('[getLedgerSecretKey] add column error:', e.message);
    }
  }

  // 查询现有密钥
  const result = await db.execute(sql`SELECT secret_key FROM ledgers WHERE id = ${ledgerId}`);
  const rows = (result as any)[0] || result;
  const existingKey = Array.isArray(rows) ? rows[0]?.secret_key : null;

  if (existingKey) {
    return { secretKey: existingKey };
  }

  // 生成Web3风格的密钥：0x + 64位十六进制字符
  const crypto = await import('crypto');
  const randomBytes = crypto.randomBytes(32);
  const secretKey = '0x' + randomBytes.toString('hex');

  // 保存到数据库
  await db.execute(sql`UPDATE ledgers SET secret_key = ${secretKey} WHERE id = ${ledgerId}`);

  console.log('[getLedgerSecretKey] 生成新密钥:', { ledgerId });
  return { secretKey };
}

/**
 * 通过密钥加入账本
 */
export async function joinLedgerBySecretKey(secretKey: string, userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");

  // 确保secret_key列存在
  try {
    await db.execute(sql`ALTER TABLE ledgers ADD COLUMN secret_key VARCHAR(130) NULL DEFAULT NULL`);
  } catch (e: any) {
    if (!e.message?.includes('Duplicate column')) {
      // ignore
    }
  }

  // 通过密钥查找账本
  const result = await db.execute(sql`SELECT id, name FROM ledgers WHERE secret_key = ${secretKey}`);
  const rows = (result as any)[0] || result;
  const ledgerRow = Array.isArray(rows) ? rows[0] : null;

  if (!ledgerRow) {
    throw new Error('无效的账本密钥，请检查后重试');
  }

  const ledgerId = ledgerRow.id;

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
    throw new Error('您已经是该账本的成员');
  }

  // 检查账本是否已封存
  const ledger = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .limit(1);

  if (ledger.length > 0 && ledger[0].isArchived) {
    throw new Error('该账本已封存，无法加入');
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

  console.log('[joinLedgerBySecretKey] 用户通过密钥加入账本:', { userId, ledgerId });
  return { ledgerId, ledgerName: ledgerRow.name };
}

/**
 * 检查用户是否有备份账本的权限
 */
export async function checkBackupPermission(
  ledgerId: number,
  userId: number
): Promise<boolean> {
  const db = await getLedgerDb();
  if (!db) return false;
  
  // 查询用户的备份权限
  const membership = await db
    .select({
      permissionBackup: ledgerMembers.permissionBackup,
      role: ledgerMembers.role,
    })
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1);
  
  if (membership.length === 0) {
    return false; // 不是账本成员
  }
  
  // owner 始终有备份权限
  if (membership[0].role === 'owner') {
    return true;
  }
  
  // 检查备份权限字段
  return membership[0].permissionBackup === 'allow';
}


/**
 * 更新账本功能设置
 */
export async function updateLedgerFeatures(
  ledgerId: number,
  userId: number,
  features: {
    enableReimbursement?: boolean;
    enablePending?: boolean;
    pendingDefaultIncludeStats?: number;
    requireImage?: boolean;
  }
): Promise<void> {
  const db = await getLedgerDb();
  if (!db) throw new Error("数据库连接失败");

  // 检查用户是否是账本的owner或admin
  const membership = await db
    .select({
      role: ledgerMembers.role,
    })
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    )
    .limit(1);

  if (membership.length === 0) {
    throw new Error("您不是该账本的成员");
  }

  if (membership[0].role !== 'owner' && membership[0].role !== 'admin') {
    throw new Error("只有账本创建人或管理员才能修改功能设置");
  }

  // 构建更新对象
  const updateData: any = {};
  if (features.enableReimbursement !== undefined) {
    // 如果要关闭报销功能，检查是否还有待报销的账目
    if (features.enableReimbursement === false) {
      const reimbursementRecords = await db
        .select({ id: ledgerRecords.id })
        .from(ledgerRecords)
        .where(
          and(
            eq(ledgerRecords.ledgerId, ledgerId),
            eq(ledgerRecords.reimbursementStatus, 'pending'),
            isNull(ledgerRecords.deletedAt)
          )
        )
        .limit(1);
      
      if (reimbursementRecords.length > 0) {
        const countResult = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(ledgerRecords)
          .where(
            and(
              eq(ledgerRecords.ledgerId, ledgerId),
              eq(ledgerRecords.reimbursementStatus, 'pending'),
              isNull(ledgerRecords.deletedAt)
            )
          );
        const count = countResult[0]?.count || 0;
        throw new Error(`当前账本中还有 ${count} 笔待报销账目，请先处理完毕后再关闭报销功能`);
      }
    }
    updateData.enableReimbursement = features.enableReimbursement ? 1 : 0;
  }
  if (features.enablePending !== undefined) {
    // 如果要关闭待结功能，检查是否还有未结算的账目
    if (features.enablePending === false) {
      const pendingRecords = await db
        .select({ id: ledgerRecords.id })
        .from(ledgerRecords)
        .where(
          and(
            eq(ledgerRecords.ledgerId, ledgerId),
            isNotNull(ledgerRecords.pendingType),
            isNull(ledgerRecords.deletedAt)
          )
        )
        .limit(1);
      
      if (pendingRecords.length > 0) {
        // 查询具体数量
        const countResult = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(ledgerRecords)
          .where(
            and(
              eq(ledgerRecords.ledgerId, ledgerId),
              isNotNull(ledgerRecords.pendingType),
              isNull(ledgerRecords.deletedAt)
            )
          );
        const count = countResult[0]?.count || 0;
        throw new Error(`当前账本中还有 ${count} 笔待结账目，请先处理完毕后再关闭待结功能`);
      }
    }
    updateData.enablePending = features.enablePending ? 1 : 0;
  }
  if (features.pendingDefaultIncludeStats !== undefined) {
    updateData.pendingDefaultIncludeStats = features.pendingDefaultIncludeStats;
  }
  if (features.requireImage !== undefined) {
    updateData.requireImage = features.requireImage ? 1 : 0;
  }

  // 更新账本功能设置
  await db
    .update(ledgers)
    .set(updateData)
    .where(eq(ledgers.id, ledgerId));

  console.log('[updateLedgerFeatures] 账本功能设置已更新:', { ledgerId, features });
}


/**
 * 获取用户所有账本中的待结账目（按账本分组）
 */
export async function getAllPendingTransactions(userId: number) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");

  // 1. 获取用户加入的所有未封存账本
  const userLedgers = await db
    .select({
      ledgerId: ledgerMembers.ledgerId,
      ledgerName: ledgers.name,
    })
    .from(ledgerMembers)
    .innerJoin(ledgers, eq(ledgerMembers.ledgerId, ledgers.id))
    .where(
      and(
        eq(ledgerMembers.userId, userId),
        eq(ledgers.isArchived, 0)
      )
    );

  if (userLedgers.length === 0) {
    return [];
  }

  // 2. 逐个账本查询待结账目
  const result = [];

  for (const ledger of userLedgers) {
    const rows = await db
      .select({
        id: ledgerRecords.id,
        description: ledgerRecords.description,
        amount: ledgerRecords.amount,
        type: ledgerRecords.type,
        pendingType: ledgerRecords.pendingType,
        pendingIncludeStats: ledgerRecords.pendingIncludeStats,
        recordDate: ledgerRecords.recordDate,
        categoryId: ledgerRecords.categoryId,
        categoryName: ledgerCategories.name,
        categoryIcon: ledgerCategories.icon,
        createdBy: ledgerRecords.createdBy,
        creatorName: users.username,
        creatorAvatar: users.avatar,
      })
      .from(ledgerRecords)
      .leftJoin(ledgerCategories, eq(ledgerRecords.categoryId, ledgerCategories.id))
      .leftJoin(users, eq(ledgerRecords.createdBy, users.id))
      .where(
        and(
          eq(ledgerRecords.ledgerId, ledger.ledgerId),
          isNotNull(ledgerRecords.pendingType),
          isNull(ledgerRecords.deletedAt)
        )
      )
      .orderBy(desc(ledgerRecords.recordDate));

    if (rows.length > 0) {
      result.push({
        ledgerId: ledger.ledgerId,
        ledgerName: ledger.ledgerName,
        transactions: rows.map(r => ({
          id: r.id,
          description: r.description || "",
          amount: Number(r.amount),
          type: r.type as string,
          pendingType: r.pendingType as string,
          pendingIncludeStats: r.pendingIncludeStats ?? 1,
          recordDate: r.recordDate,
          categoryId: r.categoryId,
          categoryName: r.categoryName ?? null,
          categoryIcon: r.categoryIcon ?? null,
          createdBy: r.createdBy,
          creatorName: r.creatorName ?? null,
          creatorAvatar: r.creatorAvatar ?? null,
        })),
      });
    }
  }

  return result;
}

// ==================== 账目修改记录日志 ====================

/**
 * 写入账目修改日志（单条字段变更）
 */
export async function insertRecordLog(params: {
  recordId: number;
  ledgerId: number;
  operatorId: number;
  action: string;
  fieldName?: string;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string;
}) {
  try {
    console.log('[insertRecordLog] 开始写入日志:', JSON.stringify(params));
    const conn = await getDbConnection();
    if (!conn) {
      console.error('[insertRecordLog] 数据库连接失败');
      return;
    }
    await conn.execute(
      `INSERT INTO ledger_record_logs (record_id, ledger_id, operator_id, action, field_name, old_value, new_value, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '+08:00'))`,
      [
        params.recordId,
        params.ledgerId,
        params.operatorId,
        params.action,
        params.fieldName ?? null,
        params.oldValue ?? null,
        params.newValue ?? null,
        params.note ?? null,
      ]
    );
  } catch (e: any) {
    console.error('[insertRecordLog] 写入日志失败:', e.message);
  }
}

/**
 * 查询账目的修改记录日志
 */
export async function getRecordLogs(
  recordId: number,
  ledgerId: number,
  userId: number
) {
  const db = await getLedgerDb();
  if (!db) throw new Error("Ledger database connection failed");

  const member = await db
    .select()
    .from(ledgerMembers)
    .where(and(eq(ledgerMembers.ledgerId, ledgerId), eq(ledgerMembers.userId, userId)))
    .limit(1);
  if (member.length === 0) throw new Error("您不是该账本的成员");

  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接失败");

  const [rows] = await conn.execute(
    `SELECT l.id, l.record_id, l.ledger_id, l.operator_id, l.action, l.field_name, l.old_value, l.new_value, l.note, l.created_at,
            u.username as operator_name, u.avatar as operator_avatar
     FROM ledger_record_logs l
     LEFT JOIN users u ON l.operator_id = u.id
     WHERE l.record_id = ? AND l.ledger_id = ?
     ORDER BY l.created_at DESC`,
    [recordId, ledgerId]
  ) as any[];

  return (rows as any[]).map((r: any) => {
    // created_at 已经是北京时间，直接格式化为字符串，不要用 toISOString()（会转换为UTC）
    let createdAtStr = '';
    if (r.created_at instanceof Date) {
      const d = r.created_at;
      // 数据库返回的Date对象可能被mysql2解析为本地时间，直接取各分量
      createdAtStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    } else {
      createdAtStr = String(r.created_at);
    }
    return {
      id: r.id,
      recordId: r.record_id,
      ledgerId: r.ledger_id,
      operatorId: r.operator_id,
      operatorName: r.operator_name || '未知用户',
      operatorAvatar: r.operator_avatar || null,
      action: r.action,
      fieldName: r.field_name,
      oldValue: r.old_value,
      newValue: r.new_value,
      note: r.note,
      createdAt: createdAtStr,
    };
  });
}

/**
 * 获取账目的修改记录条数
 */
export async function getRecordLogCount(
  recordId: number,
  ledgerId: number,
  userId: number
): Promise<number> {
  try {
    const db = await getLedgerDb();
    if (!db) return 0;

    const member = await db
      .select()
      .from(ledgerMembers)
      .where(and(eq(ledgerMembers.ledgerId, ledgerId), eq(ledgerMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return 0;

    const conn = await getDbConnection();
    if (!conn) return 0;

    const [rows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM ledger_record_logs WHERE record_id = ? AND ledger_id = ?`,
      [recordId, ledgerId]
    ) as any[];

    return Number((rows as any[])[0]?.cnt ?? 0);
  } catch (e: any) {
    console.error('[getRecordLogCount] 错误:', e.message);
    return 0;
  }
}
