import { pgTable, text, timestamp, serial } from 'drizzle-orm/pg-core';

/**
 * 银行列表表
 * 用于存储常用银行名称，支持智能搜索和自动学习
 */
export const banks = pgTable('banks', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // 银行名称
  usageCount: serial('usage_count').notNull().default(0), // 使用次数，用于排序
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Bank = typeof banks.$inferSelect;
export type NewBank = typeof banks.$inferInsert;
