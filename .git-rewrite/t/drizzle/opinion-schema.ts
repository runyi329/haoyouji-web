/**
 * AB 定制账本 - 共享意见本 Schema
 * 应用场景：连锁店/餐厅每张桌子生成二维码，顾客扫码免注册提意见
 */
import { mysqlTable, int, varchar, text, timestamp, tinyint, decimal, index } from "drizzle-orm/mysql-core";

// ===== 意见本（AB账本主体）=====
export const opinionBooks = mysqlTable("opinion_books", {
  id: int().autoincrement().notNull().primaryKey(),
  name: varchar({ length: 100 }).notNull(),            // 意见本名称，如"红品会连锁店"
  storeName: varchar({ length: 100 }),                  // 门店/品牌名称
  description: text(),                                   // 描述
  ownerId: int("owner_id").notNull(),                   // 创建者（管理员）用户ID
  isActive: tinyint("is_active").default(1).notNull(),  // 是否启用
  createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
  index("opinion_books_owner_idx").on(table.ownerId),
]);
export type OpinionBook = typeof opinionBooks.$inferSelect;
export type InsertOpinionBook = typeof opinionBooks.$inferInsert;

// ===== 桌号/位置（每张桌子对应一个二维码）=====
export const opinionTables = mysqlTable("opinion_tables", {
  id: int().autoincrement().notNull().primaryKey(),
  bookId: int("book_id").notNull(),                     // 所属意见本ID
  tableCode: varchar("table_code", { length: 50 }).notNull(), // 桌号，如"A01"、"包间1"
  location: varchar({ length: 100 }),                   // 位置描述，如"一楼大厅"
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
  index("opinion_tables_book_idx").on(table.bookId),
]);
export type OpinionTable = typeof opinionTables.$inferSelect;
export type InsertOpinionTable = typeof opinionTables.$inferInsert;

// ===== 意见条目（顾客提交的意见）=====
export const opinionEntries = mysqlTable("opinion_entries", {
  id: int().autoincrement().notNull().primaryKey(),
  bookId: int("book_id").notNull(),                     // 所属意见本ID
  tableId: int("table_id").notNull(),                   // 所属桌号ID
  content: text().notNull(),                             // 意见内容
  rating: tinyint(),                                     // 评分 1-5，可选
  guestName: varchar("guest_name", { length: 50 }),     // 游客昵称，可选
  guestIp: varchar("guest_ip", { length: 45 }),         // 游客IP（防刷）
  isRead: tinyint("is_read").default(0).notNull(),      // 是否已读
  createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
  index("opinion_entries_book_idx").on(table.bookId),
  index("opinion_entries_table_idx").on(table.tableId),
  index("opinion_entries_created_idx").on(table.createdAt),
]);
export type OpinionEntry = typeof opinionEntries.$inferSelect;
export type InsertOpinionEntry = typeof opinionEntries.$inferInsert;
