/**
 * 脉动共享商盟 - 商品库模块 Schema
 * 
 * 架构规则：
 * - 商品库是整个共享商盟的核心基础设施
 * - 商品可以来自商家自录，也可以由平台共享给商家
 * - 商品展示页面使用统一模板（固定结构：图片/名称/价格/购买按钮/规格）
 * - 商家可以对共享商品进行分类编辑，但不能修改商品本体
 */

import {
  mysqlTable,
  int,
  varchar,
  text,
  decimal,
  timestamp,
  mysqlEnum,
  index,
  tinyint,
} from "drizzle-orm/mysql-core";

// ===== 商家信息表 =====
// 记录每个商家的基本信息，与脉动网用户体系打通
export const merchants = mysqlTable("merchants", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),                          // 关联脉动网用户ID
  merchantCode: varchar("merchantCode", { length: 50 }).notNull().unique(), // 商家代码，如 cx8618
  shopName: varchar("shopName", { length: 100 }).notNull(), // 店铺名称
  shopDescription: text("shopDescription"),                 // 店铺简介
  shopLogoUrl: text("shopLogoUrl"),                         // 店铺Logo
  shopBannerUrl: text("shopBannerUrl"),                     // 店铺Banner
  themeColor: varchar("themeColor", { length: 20 }).default("#722F37"), // 主题色（默认酒红）
  shopType: varchar("shopType", { length: 50 }),            // 店铺类型：wine/beauty/food/other
  contactPhone: varchar("contactPhone", { length: 20 }),    // 联系电话
  contactWechat: varchar("contactWechat", { length: 50 }), // 微信号
  status: mysqlEnum("status", ["active", "inactive", "suspended"]).default("active").notNull(),
  isVerified: tinyint("isVerified").default(0).notNull(),   // 是否已实名认证
  depositAmount: decimal("depositAmount", { precision: 10, scale: 2 }).default("0.00"), // 保证金
  // 商家设置字段（v1.3 新增，对应架构规范 §11.5）
  share_title: varchar("share_title", { length: 50 }),         // 分享标题
  share_logo: text("share_logo"),                              // 分享 Logo URL
  share_cover_image: text("share_cover_image"),                // 分享封面图 URL
  share_description: varchar("share_description", { length: 100 }), // 分享描述语
  contact_wechat: varchar("contact_wechat", { length: 50 }),   // 商家客服微信
  contact_phone: varchar("contact_phone", { length: 20 }),     // 商家客服电话
  about_us: text("about_us"),                                  // 关于我们正文
  official_website: varchar("official_website", { length: 200 }), // 商家官网
  splash_image: text("splash_image"),                              // 开机画面图片 URL（v1.4 新增）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("merchants_userId_idx").on(table.userId),
  index("merchants_merchantCode_idx").on(table.merchantCode),
]);

export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = typeof merchants.$inferInsert;

// ===== 商品分类表 =====
export const merchantProductCategories = mysqlTable("merchant_product_categories", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId"),                            // NULL = 平台公共分类
  name: varchar("name", { length: 100 }).notNull(),         // 分类名称
  description: text("description"),
  iconUrl: text("iconUrl"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: tinyint("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("mpc_merchantId_idx").on(table.merchantId),
]);

export type MerchantProductCategory = typeof merchantProductCategories.$inferSelect;

// ===== 商品主表（平台中央商品库）=====
// 这是所有商品的唯一来源，商家可以引用这里的商品到自己的店铺
export const merchantProducts = mysqlTable("merchant_products", {
  id: int("id").autoincrement().primaryKey(),
  ownerMerchantId: int("ownerMerchantId"),                  // 商品归属商家ID（NULL=平台自有）
  categoryId: int("categoryId"),                            // 分类ID
  name: varchar("name", { length: 200 }).notNull(),         // 商品名称
  subtitle: varchar("subtitle", { length: 300 }),           // 副标题/简介
  description: text("description"),                         // 详细描述（富文本/HTML）
  mainImageUrl: text("mainImageUrl"),                       // 主图URL
  thumbnailUrl: text("thumbnailUrl"),                         // 列表预览图URL（建议800x800正方形）
  imageUrls: text("imageUrls"),                             // 图片列表（JSON数组）
  videoUrl: text("videoUrl"),                               // 视频介绍URL
  basePrice: decimal("basePrice", { precision: 10, scale: 2 }).notNull(), // 基础价格
  originalPrice: decimal("originalPrice", { precision: 10, scale: 2 }), // 划线原价
  unit: varchar("unit", { length: 20 }).default("件"),      // 单位
  stock: int("stock").default(999).notNull(),               // 库存数量
  salesCount: int("salesCount").default(0).notNull(),       // 销量
  // 商品来源标识（用于订单路由）
  sourceType: mysqlEnum("sourceType", ["platform", "merchant", "shared"]).default("merchant").notNull(),
  // 商品状态
  status: mysqlEnum("status", ["active", "inactive", "draft"]).default("active").notNull(),
  isShareable: tinyint("isShareable").default(1).notNull(), // 是否允许被其他商家共享
  inPointsShop: tinyint("inPointsShop").default(0).notNull(), // 是否上架到积分商城（0=否，1=是）
  pointsPrice: int("pointsPrice").default(0).notNull(), // 积分兑换价格（0=未设定）
  // 蓝色角标（图片左下角胶囊双色角标）
  badgeEnabled: tinyint("badgeEnabled").default(0).notNull(), // 是否显示角标（0=不显示，1=显示）
  badgeText: varchar("badgeText", { length: 16 }),             // 角标文字（2-8字，右侧白底蓝字区域）
  // 扩展字段（JSON，存储红酒特有字段如产区/年份/酒庄等）
  extendedFields: text("extendedFields"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("mp_ownerMerchantId_idx").on(table.ownerMerchantId),
  index("mp_categoryId_idx").on(table.categoryId),
  index("mp_status_idx").on(table.status),
]);

export type MerchantProduct = typeof merchantProducts.$inferSelect;
export type InsertMerchantProduct = typeof merchantProducts.$inferInsert;

// ===== 商品规格表 =====
// 支持多规格商品（如红酒的容量/年份，美容品的颜色/规格）
export const merchantProductSpecs = mysqlTable("merchant_product_specs", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  specName: varchar("specName", { length: 50 }).notNull(),  // 规格名称，如"容量"、"年份"
  specValue: varchar("specValue", { length: 100 }).notNull(), // 规格值，如"750ml"、"2018"
  priceAdjustment: decimal("priceAdjustment", { precision: 10, scale: 2 }).default("0.00"), // 价格调整
  stock: int("stock").default(999).notNull(),
  isActive: tinyint("isActive").default(1).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("mps_productId_idx").on(table.productId),
]);

export type MerchantProductSpec = typeof merchantProductSpecs.$inferSelect;

// ===== 店铺商品陈列表 =====
// 商家选择哪些商品展示在自己的店铺里（自有商品 + 共享商品）
export const merchantShopProducts = mysqlTable("merchant_shop_products", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),                  // 展示该商品的商家
  productId: int("productId").notNull(),                    // 商品ID
  // 商家可以自定义展示价格（加价销售共享商品）
  displayPrice: decimal("displayPrice", { precision: 10, scale: 2 }), // NULL=使用原价
  // 商家可以给共享商品重新分类
  customCategoryId: int("customCategoryId"),
  customSortOrder: int("customSortOrder").default(0).notNull(),
  isVisible: tinyint("isVisible").default(1).notNull(),     // 是否在店铺显示
  // 来源标识
  isOwned: tinyint("isOwned").default(1).notNull(),         // 1=自有商品 0=共享商品
  sharedFromMerchantId: int("sharedFromMerchantId"),        // 共享来源商家ID
  commissionRate: decimal("commissionRate", { precision: 5, scale: 2 }), // 佣金比例（共享商品）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("msp_merchantId_idx").on(table.merchantId),
  index("msp_productId_idx").on(table.productId),
]);

export type MerchantShopProduct = typeof merchantShopProducts.$inferSelect;

// ===== 商品共享申请表 =====
// A 申请销售 B 的商品，B 需要确认
export const merchantProductShareRequests = mysqlTable("merchant_product_share_requests", {
  id: int("id").autoincrement().primaryKey(),
  requesterMerchantId: int("requesterMerchantId").notNull(), // 申请方（想销售商品的商家）
  ownerMerchantId: int("ownerMerchantId").notNull(),         // 商品所有方
  productId: int("productId"),                               // NULL=申请共享所有商品
  proposedCommissionRate: decimal("proposedCommissionRate", { precision: 5, scale: 2 }), // 提议佣金比例
  agreedCommissionRate: decimal("agreedCommissionRate", { precision: 5, scale: 2 }),     // 最终协商佣金比例
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  message: text("message"),                                  // 申请留言
  replyMessage: text("replyMessage"),                        // 回复留言
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("mps_requester_idx").on(table.requesterMerchantId),
  index("mps_owner_idx").on(table.ownerMerchantId),
]);

export type MerchantProductShareRequest = typeof merchantProductShareRequests.$inferSelect;

// ===== 红酒产区表（Wine Regions）=====
// 用于红酒商会商品的产区分类管理
export const wineRegions = mysqlTable("wine_regions", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),                   // 所属商家ID
  name: varchar("name", { length: 100 }).notNull(),          // 产区名称，如"法国·波尔多"
  country: varchar("country", { length: 50 }).notNull(),     // 国家，如"法国"
  subRegion: varchar("subRegion", { length: 100 }),          // 子产区，如"梅多克"
  description: text("description"),                          // 产区描述
  flagEmoji: varchar("flagEmoji", { length: 10 }),           // 国旗emoji，如"🇫🇷"
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: tinyint("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("wr_merchantId_idx").on(table.merchantId),
]);
export type WineRegion = typeof wineRegions.$inferSelect;
export type InsertWineRegion = typeof wineRegions.$inferInsert;

// ===== 平台总商品库（Platform Product Library）=====
// 脉动平台维护的公共商品池，管理员录入，可推送给各商家
export const platformProducts = mysqlTable("platform_products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),          // 商品名称
  subtitle: varchar("subtitle", { length: 300 }),            // 副标题/产地描述
  category: varchar("category", { length: 50 }).default("wine").notNull(), // 商品类别
  basePrice: decimal("basePrice", { precision: 10, scale: 2 }).notNull(), // 建议零售价
  mainImageUrl: text("mainImageUrl"),                        // 主图URL（S3）
  description: text("description"),                          // 商品描述
  extendedFields: text("extendedFields"),                    // JSON扩展字段（酒庄/年份/产区等）
  tags: text("tags"),                                        // JSON标签数组
  status: varchar("status", { length: 20 }).default("active").notNull(), // active/inactive
  createdBy: int("createdBy"),                               // 创建管理员的userId
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pp_category_idx").on(table.category),
  index("pp_status_idx").on(table.status),
]);
export type PlatformProduct = typeof platformProducts.$inferSelect;
export type InsertPlatformProduct = typeof platformProducts.$inferInsert;

// ===== 商家导入申请表（Product Import Requests）=====
// 商家申请将平台总库商品导入自己的私库，或平台主动推送给商家
export const productImportRequests = mysqlTable("product_import_requests", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),                     // 平台总库商品ID（merchant_products.id，ownerMerchantId=NULL）
  merchantId: int("merchantId").notNull(),                   // 目标商家ID
  merchantCode: varchar("merchantCode", { length: 50 }).notNull(), // 商家代码（如cx8618）
  requestType: varchar("requestType", { length: 20 }).default("merchant_apply").notNull(), // merchant_apply / admin_push
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending/approved/rejected
  message: text("message"),                                  // 申请留言
  replyMessage: text("replyMessage"),                        // 审核回复
  reviewedBy: int("reviewedBy"),                             // 审核管理员userId
  reviewedAt: timestamp("reviewedAt"),                       // 审核时间
  merchantProductId: int("merchantProductId"),               // 审核通过后在merchantProducts中创建的商品ID
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pir_productId_idx").on(table.productId),
  index("pir_merchantId_idx").on(table.merchantId),
  index("pir_status_idx").on(table.status),
  index("pir_merchantCode_idx").on(table.merchantCode),
]);
export type ProductImportRequest = typeof productImportRequests.$inferSelect;
export type InsertProductImportRequest = typeof productImportRequests.$inferInsert;

// ===== 积分兑换订单表（Points Redeem Orders）=====
// 用户用积分兑换商城商品后生成的订单
export const pointsRedeemOrders = mysqlTable("points_redeem_orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNo: varchar("orderNo", { length: 30 }).notNull().unique(), // 订单号，格式：PO+时间戳+随机3位
  userId: int("userId").notNull(),                               // 下单用户ID
  productId: int("productId").notNull(),                         // 商品ID（merchant_products.id）
  productName: varchar("productName", { length: 200 }).notNull(), // 商品名称快照
  productImage: text("productImage"),                            // 商品主图快照
  pointsSpent: int("pointsSpent").notNull(),                     // 消耗积分数
  quantity: int("quantity").default(1).notNull(),                // 数量
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending/shipped/completed/cancelled
  recipientName: varchar("recipientName", { length: 100 }).notNull(),   // 收件人姓名
  recipientPhone: varchar("recipientPhone", { length: 20 }).notNull(),  // 收件人手机
  province: varchar("province", { length: 50 }),                        // 省
  city: varchar("city", { length: 50 }),                                // 市
  district: varchar("district", { length: 50 }),                        // 区
  detailedAddress: text("detailedAddress").notNull(),                   // 详细地址
  trackingCompany: varchar("trackingCompany", { length: 50 }),  // 快递公司（管理员填写）
  trackingNo: varchar("trackingNo", { length: 100 }),           // 快递单号（管理员填写）
  shippedAt: timestamp("shippedAt"),                            // 发货时间
  remark: text("remark"),                                       // 用户备注
  cancelReason: text("cancelReason"),                           // 取消原因
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pro_userId_idx").on(table.userId),
  index("pro_productId_idx").on(table.productId),
  index("pro_status_idx").on(table.status),
  index("pro_orderNo_idx").on(table.orderNo),
  index("pro_createdAt_idx").on(table.createdAt),
]);
export type PointsRedeemOrder = typeof pointsRedeemOrders.$inferSelect;
export type InsertPointsRedeemOrder = typeof pointsRedeemOrders.$inferInsert;
