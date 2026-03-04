/**
 * 奢贝美容院模块 - 数据库表定义
 * 独立文件，便于将来迁移到独立仓库
 * 
 * 迁移说明：
 * - 将本文件复制到目标仓库的 drizzle/ 目录
 * - 将 server/beauty-router.ts 复制到目标仓库的 server/ 目录
 * - 将 client/src/pages/beauty/ 目录复制到目标仓库
 * - 用户认证：可选择对接脉动网 API 或建立独立用户表
 */
import { mysqlTable, int, varchar, text, mysqlEnum, timestamp, decimal } from "drizzle-orm/mysql-core";

// 美容服务项目
export const beautyServices = mysqlTable("beauty_services", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  duration: int("duration").default(60).notNull(),
  imageUrl: text("imageUrl"),
  category: varchar("category", { length: 50 }),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyService = typeof beautyServices.$inferSelect;

// 预约记录
export const beautyAppointments = mysqlTable("beauty_appointments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  serviceId: int("serviceId").notNull(),
  appointmentDate: timestamp("appointmentDate").notNull(),
  timeSlot: varchar("timeSlot", { length: 20 }).notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "completed", "cancelled"]).default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyAppointment = typeof beautyAppointments.$inferSelect;

// 活动轮播
export const beautyPromotions = mysqlTable("beauty_promotions", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  type: mysqlEnum("type", ["opening", "points", "coupon", "other"]).default("other").notNull(),
  isActive: int("isActive").default(1).notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyPromotion = typeof beautyPromotions.$inferSelect;

// 品牌
export const beautyBrands = mysqlTable("beauty_brands", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  logoUrl: text("logoUrl"),
  bannerUrl: text("bannerUrl"),
  isActive: int("isActive").default(1).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyBrand = typeof beautyBrands.$inferSelect;

// 商品分类
export const beautyProductCategories = mysqlTable("beauty_product_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  type: mysqlEnum("type", ["beauty", "health"]).notNull(),
  isActive: int("isActive").default(1).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// 商品功效
export const beautyProductEffects = mysqlTable("beauty_product_effects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  isActive: int("isActive").default(1).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// 商品
export const beautyProducts = mysqlTable("beauty_products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("imageUrl"),
  brandId: int("brandId").notNull(),
  categoryId: int("categoryId").notNull(),
  specification: varchar("specification", { length: 100 }),
  stock: int("stock").default(0).notNull(),
  isActive: int("isActive").default(1).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyProduct = typeof beautyProducts.$inferSelect;

// 商品功效关联
export const beautyProductEffectMappings = mysqlTable("beauty_product_effect_mappings", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  effectId: int("effectId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// 购物车
export const beautyCartItems = mysqlTable("beauty_cart_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId").notNull(),
  quantity: int("quantity").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// 订单
export const beautyOrders = mysqlTable("beauty_orders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  orderNumber: varchar("orderNumber", { length: 50 }).notNull().unique(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["pending", "paid", "shipped", "completed", "cancelled"]).default("pending").notNull(),
  shippingAddress: text("shippingAddress"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyOrder = typeof beautyOrders.$inferSelect;

// 订单明细
export const beautyOrderItems = mysqlTable("beauty_order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  productId: int("productId").notNull(),
  productName: varchar("productName", { length: 100 }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  quantity: int("quantity").notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===== 奢贝积分系统 =====

// 奢贝积分账户（每个用户一条记录）
export const beautyPoints = mysqlTable("beauty_points", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  balance: int("balance").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyPointAccount = typeof beautyPoints.$inferSelect;

// 奢贝积分变动日志
export const beautyPointsLog = mysqlTable("beauty_points_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  operatorId: int("operatorId").notNull(),
  amount: int("amount").notNull(),
  balanceAfter: int("balanceAfter").notNull(),
  remark: varchar("remark", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BeautyPointLog = typeof beautyPointsLog.$inferSelect;
