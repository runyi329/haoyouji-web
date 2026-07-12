import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  index,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// 康宝莱（Herbalife）奖金制度
// ============================================================

export const MEMBER_LEVELS = [
  "member",
  "senior_consultant",
  "qualified_producer",
  "supervisor",
  "world_team",
  "get_team",
  "millionaire_team",
  "presidents_team",
] as const;

export type MemberLevel = (typeof MEMBER_LEVELS)[number];

export const mlmMembers = mysqlTable(
  "mlm_members",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: varchar("memberId", { length: 20 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 30 }),
    sponsorId: int("sponsorId"),
    level: mysqlEnum("level", MEMBER_LEVELS).default("member").notNull(),
    discountRate: decimal("discountRate", { precision: 5, scale: 2 }).default("25.00").notNull(),
    path: varchar("path", { length: 1000 }).default("/").notNull(),
    depth: int("depth").default(0).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    country: varchar("country", { length: 50 }).default("CN"),
    joinDate: timestamp("joinDate").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    sponsorIdx: index("mlm_sponsor_idx").on(table.sponsorId),
    pathIdx: index("mlm_path_idx").on(table.path),
    levelIdx: index("mlm_level_idx").on(table.level),
  })
);

export type MlmMember = typeof mlmMembers.$inferSelect;
export type InsertMlmMember = typeof mlmMembers.$inferInsert;

export const mlmMonthlyPerformance = mysqlTable(
  "mlm_monthly_performance",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("memberId").notNull(),
    year: int("year").notNull(),
    month: int("month").notNull(),
    personalVP: decimal("personalVP", { precision: 10, scale: 2 }).default("0.00").notNull(),
    groupVP: decimal("groupVP", { precision: 12, scale: 2 }).default("0.00").notNull(),
    levelSnapshot: mysqlEnum("levelSnapshot", MEMBER_LEVELS).default("member").notNull(),
    calculated: boolean("calculated").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    memberMonthIdx: index("mlm_member_month_idx").on(table.memberId, table.year, table.month),
  })
);

export const mlmBonusRecords = mysqlTable(
  "mlm_bonus_records",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("memberId").notNull(),
    year: int("year").notNull(),
    month: int("month").notNull(),
    retailProfit: decimal("retailProfit", { precision: 10, scale: 2 }).default("0.00").notNull(),
    wholesaleProfit: decimal("wholesaleProfit", { precision: 10, scale: 2 }).default("0.00").notNull(),
    royaltyOverride: decimal("royaltyOverride", { precision: 10, scale: 2 }).default("0.00").notNull(),
    productionBonus: decimal("productionBonus", { precision: 10, scale: 2 }).default("0.00").notNull(),
    annualBonus: decimal("annualBonus", { precision: 10, scale: 2 }).default("0.00").notNull(),
    totalBonus: decimal("totalBonus", { precision: 10, scale: 2 }).default("0.00").notNull(),
    royaltyDetail: text("royaltyDetail"),
    productionDetail: text("productionDetail"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    memberBonusIdx: index("mlm_member_bonus_idx").on(table.memberId, table.year, table.month),
  })
);

export const mlmBonusRules = mysqlTable("mlm_bonus_rules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  level: mysqlEnum("level", MEMBER_LEVELS).notNull(),
  discountRate: decimal("discountRate", { precision: 5, scale: 2 }).notNull(),
  minVP: decimal("minVP", { precision: 10, scale: 2 }).default("0.00").notNull(),
  royaltyRate: decimal("royaltyRate", { precision: 5, scale: 2 }).default("0.00").notNull(),
  royaltyLevels: int("royaltyLevels").default(0).notNull(),
  productionRate: decimal("productionRate", { precision: 5, scale: 2 }).default("0.00").notNull(),
  isTabTeam: boolean("isTabTeam").default(false).notNull(),
  color: varchar("color", { length: 20 }).default("#6b7280").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================================
// 数研金控（SYJK）让利制无限代奖金系统
// ============================================================

export const mlmSyjkConfig = mysqlTable("mlm_syjk_config", {
  id: int("id").autoincrement().primaryKey(),
  configKey: varchar("configKey", { length: 100 }).notNull().unique(),
  configValue: varchar("configValue", { length: 500 }).notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const mlmSyjkMembers = mysqlTable(
  "mlm_syjk_members",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: varchar("memberId", { length: 20 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 30 }),
    sponsorId: int("sponsorId"),
    receivedRate: decimal("receivedRate", { precision: 5, scale: 2 }).default("0.00").notNull(),
    allocatedRate: decimal("allocatedRate", { precision: 5, scale: 2 }).default("0.00").notNull(),
    path: varchar("path", { length: 2000 }).default("/").notNull(),
    depth: int("depth").default(0).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    joinDate: timestamp("joinDate").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    syjkSponsorIdx: index("mlm_syjk_sponsor_idx").on(table.sponsorId),
    syjkPathIdx: index("mlm_syjk_path_idx").on(table.path),
  })
);

export type MlmSyjkMember = typeof mlmSyjkMembers.$inferSelect;

export const mlmSyjkCommissionRules = mysqlTable(
  "mlm_syjk_commission_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    uplineId: int("uplineId").notNull(),
    downlineId: int("downlineId").notNull(),
    rate: decimal("rate", { precision: 5, scale: 2 }).notNull(),
    maxRate: decimal("maxRate", { precision: 5, scale: 2 }).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    syjkRuleIdx: index("mlm_syjk_rule_idx").on(table.uplineId, table.downlineId),
    syjkDownlineIdx: index("mlm_syjk_downline_idx").on(table.downlineId),
  })
);

export const mlmSyjkPerformance = mysqlTable(
  "mlm_syjk_performance",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("memberId").notNull(),
    year: int("year").notNull(),
    month: int("month").notNull(),
    personalRevenue: decimal("personalRevenue", { precision: 12, scale: 2 }).default("0.00").notNull(),
    teamRevenue: decimal("teamRevenue", { precision: 14, scale: 2 }).default("0.00").notNull(),
    calculated: boolean("calculated").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    syjkPerfIdx: index("mlm_syjk_perf_idx").on(table.memberId, table.year, table.month),
  })
);

export const mlmSyjkBonusRecords = mysqlTable(
  "mlm_syjk_bonus_records",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("memberId").notNull(),
    year: int("year").notNull(),
    month: int("month").notNull(),
    revenueBase: decimal("revenueBase", { precision: 14, scale: 2 }).default("0.00").notNull(),
    receivedRateSnapshot: decimal("receivedRateSnapshot", { precision: 5, scale: 2 }).default("0.00").notNull(),
    retainedRate: decimal("retainedRate", { precision: 5, scale: 2 }).default("0.00").notNull(),
    bonusAmount: decimal("bonusAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
    allocationDetail: text("allocationDetail"),
    sourceDetail: text("sourceDetail"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    syjkBonusIdx: index("mlm_syjk_bonus_idx").on(table.memberId, table.year, table.month),
  })
);

// ============================================================
// 自定义奖金制度（用户自建方案）
// ============================================================

export const customSchemes = mysqlTable(
  "mlm_custom_schemes",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"), // null = 未登录用户（临时）
    name: varchar("name", { length: 200 }).notNull(),
    industry: varchar("industry", { length: 100 }).default("").notNull(),
    schemeType: varchar("schemeType", { length: 50 }).default("staircase").notNull(),
    description: text("description"),
    config: text("config").notNull(), // JSON string of full SchemeConfig
    color: varchar("color", { length: 20 }).default("#3B82F6").notNull(),
    icon: varchar("icon", { length: 10 }).default("⭐").notNull(),
    isPublic: boolean("isPublic").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    customSchemeUserIdx: index("mlm_custom_scheme_user_idx").on(table.userId),
    customSchemePublicIdx: index("mlm_custom_scheme_public_idx").on(table.isPublic),
  })
);

export type CustomScheme = typeof customSchemes.$inferSelect;
export type InsertCustomScheme = typeof customSchemes.$inferInsert;

// ============================================================
// 公司目录（搜索索引源）
// ============================================================

export const companyCatalog = mysqlTable(
  "mlm_company_catalog",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: varchar("companyId", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    nameEn: varchar("nameEn", { length: 100 }).notNull(),
    tagline: varchar("tagline", { length: 200 }).notNull(),
    subtitle: varchar("subtitle", { length: 100 }).notNull(),
    description: text("description").notNull(),
    schemeType: varchar("schemeType", { length: 50 }).notNull(),
    tag: varchar("tag", { length: 30 }).notNull(),
    features: varchar("features", { length: 500 }).notNull(), // JSON array string
    href: varchar("href", { length: 100 }).notNull(),
    icon: varchar("icon", { length: 10 }).notNull(),
    locked: boolean("locked").default(false).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    catalogTypeIdx: index("mlm_catalog_type_idx").on(table.schemeType),
    catalogNameIdx: index("mlm_catalog_name_idx").on(table.name),
  })
);

export type CompanyCatalog = typeof companyCatalog.$inferSelect;
export type InsertCompanyCatalog = typeof companyCatalog.$inferInsert;
