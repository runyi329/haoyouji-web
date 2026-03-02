"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.banks = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
/**
 * 银行列表表
 * 用于存储常用银行名称，支持智能搜索和自动学习
 */
exports.banks = (0, pg_core_1.pgTable)('banks', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    name: (0, pg_core_1.text)('name').notNull().unique(), // 银行名称
    usageCount: (0, pg_core_1.serial)('usage_count').notNull().default(0), // 使用次数，用于排序
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').notNull().defaultNow(),
});
