import { double, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
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

/**
 * 持仓记录表：存储用户买入的 ETH Call 期权记录
 * 不依赖登录，使用 sessionId 或匿名 clientId 区分用户
 */
export const buyRecords = mysqlTable("buy_records", {
  id: varchar("id", { length: 64 }).primaryKey(),
  /** 可选：关联登录用户 */
  userId: int("userId"),
  /** 未登录时用浏览器生成的匿名 clientId */
  clientId: varchar("clientId", { length: 64 }).notNull(),
  instrumentName: varchar("instrumentName", { length: 64 }).notNull(),
  strike: int("strike").notNull(),
  expiryLabel: varchar("expiryLabel", { length: 32 }).notNull(),
  annualizedRate: double("annualizedRate"),
  markPriceUsd: double("markPriceUsd"),
  ethPriceAtBuy: double("ethPriceAtBuy").notNull(),
  trueBreakeven: double("trueBreakeven"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BuyRecord = typeof buyRecords.$inferSelect;
export type InsertBuyRecord = typeof buyRecords.$inferInsert;

/**
 * A 股风控查询历史表
 */
export const stockRiskHistory = mysqlTable("stock_risk_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  symbols: text("symbols").notNull(),         // JSON 数组，如 ["600519","301228"]
  names: text("names").notNull(),             // JSON 数组，如 ["贵州茅台","实朴检测"]
  baseRate: double("baseRate").notNull(),
  totalRate: double("totalRate").notNull(),
  highestSymbol: varchar("highestSymbol", { length: 10 }),
  highestName: varchar("highestName", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockRiskHistory = typeof stockRiskHistory.$inferSelect;
export type InsertStockRiskHistory = typeof stockRiskHistory.$inferInsert;

/**
 * A 股全量股票代码表（用于前端实时查询名称）
 */
export const stockRiskStocks = mysqlTable("stock_risk_stocks", {
  symbol: varchar("symbol", { length: 10 }).primaryKey(),  // 6位数字代码
  name: varchar("name", { length: 50 }).notNull(),
  tsCode: varchar("ts_code", { length: 12 }).notNull(),    // 如 600519.SH
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StockRiskStock = typeof stockRiskStocks.$inferSelect;

/**
 * A 股风控方案表：用户保存的利率/保证金/板块/股票代码配置
 */
export const stockRiskPlans = mysqlTable("stock_risk_plans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 50 }).notNull(),          // 方案名称
  baseRate: double("baseRate").notNull(),                   // 月化利率
  marginPct: int("marginPct").notNull(),                    // 保证金比例
  boardTypes: text("boardTypes").notNull(),                 // JSON 数组，如 ["main","gem"]
  stocks: text("stocks").notNull(),                        // JSON 数组，如 [{"code":"600519","name":"贵州茅台"}]
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StockRiskPlan = typeof stockRiskPlans.$inferSelect;
export type InsertStockRiskPlan = typeof stockRiskPlans.$inferInsert;
