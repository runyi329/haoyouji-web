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

// ===== 奢贝消费卡系统 =====

// 消费卡表（每个客户一张有效卡，新增时覆盖旧卡）
export const beautyMemberCards = mysqlTable("beauty_member_cards", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),           // 持卡客户
  operatorId: int("operatorId").notNull(),   // 开卡操作人
  cardType: varchar("cardType", { length: 20 }).notNull(), // monthly/quarterly/semiannual/annual
  startDate: varchar("startDate", { length: 20 }).notNull(), // YYYY-MM-DD
  endDate: varchar("endDate", { length: 20 }).notNull(),     // YYYY-MM-DD（自动计算）
  isActive: int("isActive").default(1).notNull(),            // 1=有效 0=已作废
  remark: varchar("remark", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyMemberCard = typeof beautyMemberCards.$inferSelect;

// 消费记录表（累积消费次数）
export const beautyVisitLogs = mysqlTable("beauty_visit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),           // 消费客户
  operatorId: int("operatorId").notNull(),   // 记录操作人
  visitDate: varchar("visitDate", { length: 20 }),  // 消费日期 YYYY-MM-DD，为空则用createdAt
  remark: varchar("remark", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BeautyVisitLog = typeof beautyVisitLogs.$inferSelect;

// 数据展示 - 照片组（每组2-5张照片，横向滑动展示）
export const beautyShowcaseGroups = mysqlTable("beauty_showcase_groups", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),           // 创建者
  title: varchar("title", { length: 100 }),  // 组标题（可选）
  sortOrder: int("sortOrder").default(0).notNull(),
  shareToken: varchar("shareToken", { length: 64 }),  // 分享token（生成后可通过公开链接访问）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyShowcaseGroup = typeof beautyShowcaseGroups.$inferSelect;

// 数据展示 - 照片（属于某个照片组）
export const beautyShowcasePhotos = mysqlTable("beauty_showcase_photos", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),         // 所属照片组
  imageUrl: text("imageUrl").notNull(),       // COS图片URL
  caption: varchar("caption", { length: 200 }),  // 照片文字说明（可选）
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BeautyShowcasePhoto = typeof beautyShowcasePhotos.$inferSelect;


// ===== 素材展示（刘立凡主页素材Tab，独立数据）=====

// 素材照片组（每组2-5张照片，横向滑动展示）
export const beautyMaterialGroups = mysqlTable("beauty_material_groups", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),           // 创建者
  title: varchar("title", { length: 100 }),  // 组标题（可选）
  sortOrder: int("sortOrder").default(0).notNull(),
  shareToken: varchar("shareToken", { length: 64 }),  // 分享token
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyMaterialGroup = typeof beautyMaterialGroups.$inferSelect;

// 素材照片（属于某个素材组）
export const beautyMaterialPhotos = mysqlTable("beauty_material_photos", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),         // 所属素材组
  imageUrl: text("imageUrl").notNull(),       // COS图片URL
  caption: varchar("caption", { length: 200 }),  // 照片文字说明（可选）
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BeautyMaterialPhoto = typeof beautyMaterialPhotos.$inferSelect;


// ===== PPT对比展示 =====

// PPT对比组（一组包含两个PPT：A和B）
export const beautyPptCompareGroups = mysqlTable("beauty_ppt_compare_groups", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),           // 创建者
  title: varchar("title", { length: 100 }),  // 对比组标题（可选）
  titleA: varchar("titleA", { length: 100 }), // PPT-A标题（如"改版前"）
  titleB: varchar("titleB", { length: 100 }), // PPT-B标题（如"改版后"）
  sortOrder: int("sortOrder").default(0).notNull(),
  shareToken: varchar("shareToken", { length: 64 }),  // 分享token（生成后可通过公开链接访问）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BeautyPptCompareGroup = typeof beautyPptCompareGroups.$inferSelect;

// PPT页面图片（每页转成的图片，属于某个对比组的A或B）
export const beautyPptPages = mysqlTable("beauty_ppt_pages", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),         // 所属对比组
  side: varchar("side", { length: 1 }).notNull(), // 'A' 或 'B'
  pageNum: int("pageNum").notNull(),         // 页码（从1开始）
  imageUrl: text("imageUrl").notNull(),       // COS图片URL
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BeautyPptPage = typeof beautyPptPages.$inferSelect;

// AI提示词分类（一级分类，可自定义名称）
export const beautyAiPromptCategories = mysqlTable("beauty_ai_prompt_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),   // 分类名称（如：字体类、背景类、色调类）
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BeautyAiPromptCategory = typeof beautyAiPromptCategories.$inferSelect;

// AI提示词库（全局共享，不绑定对比组）
export const beautyAiPrompts = mysqlTable("beauty_ai_prompts", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull().default(0), // 所属分类ID，0表示未分类
  content: text("content").notNull(),           // 提示词内容（简短标签）
  remark: text("remark"),                        // 备注（详细文本，有备注时购物车显示备注内容）
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BeautyAiPrompt = typeof beautyAiPrompts.$inferSelect;
