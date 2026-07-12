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
