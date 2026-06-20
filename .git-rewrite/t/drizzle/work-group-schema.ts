import { mysqlTable, int, varchar, text, timestamp, tinyint, index, primaryKey } from "drizzle-orm/mysql-core";

// 有限合伙企业表
export const partnerships = mysqlTable("partnerships", {
  id: int().autoincrement().notNull().primaryKey(),
  name: varchar({ length: 255 }).notNull(), // 企业名称
  description: text(), // 企业描述
  createdBy: int().notNull(), // 创建人ID
  createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// 工作群表
export const workGroups = mysqlTable("work_groups", {
  id: int().autoincrement().notNull().primaryKey(),
  partnershipId: int().notNull(), // 所属企业ID
  name: varchar({ length: 100 }).notNull(), // 工作群名称（例如：群1、群2、群3）
  description: text(), // 工作群描述
  createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_groups_partnership_id_idx").on(table.partnershipId),
]);

// 企业成员表（用户-企业关联）
export const partnershipMembers = mysqlTable("partnership_members", {
  id: int().autoincrement().notNull().primaryKey(),
  partnershipId: int().notNull(), // 企业ID
  userId: int().notNull(), // 用户ID
  role: varchar({ length: 50 }).default('member').notNull(), // 角色：admin（管理员）、member（成员）
  joinedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("partnership_members_partnership_id_idx").on(table.partnershipId),
  index("partnership_members_user_id_idx").on(table.userId),
  index("partnership_members_partnership_user_idx").on(table.partnershipId, table.userId),
]);

// 工作群成员表（成员-工作群关联，多对多）
export const workGroupMembers = mysqlTable("work_group_members", {
  id: int().autoincrement().notNull().primaryKey(),
  workGroupId: int().notNull(), // 工作群ID
  partnershipMemberId: int().notNull(), // 企业成员ID
  joinedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_group_members_work_group_id_idx").on(table.workGroupId),
  index("work_group_members_partnership_member_id_idx").on(table.partnershipMemberId),
  index("work_group_members_work_group_member_idx").on(table.workGroupId, table.partnershipMemberId),
]);

// 成员行为记录表
export const memberActivities = mysqlTable("member_activities", {
  id: int().autoincrement().notNull().primaryKey(),
  partnershipMemberId: int().notNull(), // 企业成员ID
  type: varchar({ length: 50 }).notNull(), // 行为类型：contact（联络）、share（共享）、tag（标签）、asset（资产）、referral（推荐）
  title: varchar({ length: 255 }).notNull(), // 行为标题
  description: text(), // 行为描述
  activityDate: timestamp({ mode: 'string' }).notNull(), // 行为发生日期时间
  details: text(), // 详细信息（JSON格式）
  createdBy: int().notNull(), // 记录创建人ID
  createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("member_activities_partnership_member_id_idx").on(table.partnershipMemberId),
  index("member_activities_type_idx").on(table.type),
  index("member_activities_activity_date_idx").on(table.activityDate),
]);

// 成员五维得分表
export const memberScores = mysqlTable("member_scores", {
  id: int().autoincrement().notNull().primaryKey(),
  partnershipMemberId: int().notNull(), // 企业成员ID
  assetScore: int().default(0).notNull(), // 资产力得分
  reservoirScore: int().default(0).notNull(), // 蓄水力得分
  linkScore: int().default(0).notNull(), // 链接力得分
  shareScore: int().default(0).notNull(), // 共享力得分
  replicationScore: int().default(0).notNull(), // 复制力得分
  totalScore: int().default(0).notNull(), // 总分（资产确权总分）
  updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("member_scores_partnership_member_id_unique").on(table.partnershipMemberId),
]);

// 经营者备注表
export const memberNotes = mysqlTable("member_notes", {
  id: int().autoincrement().notNull().primaryKey(),
  partnershipMemberId: int().notNull(), // 企业成员ID
  note: text(), // 备注内容
  createdBy: int().notNull(), // 备注创建人ID
  createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("member_notes_partnership_member_id_idx").on(table.partnershipMemberId),
]);
