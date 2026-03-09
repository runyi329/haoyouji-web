/**
 * ===== A1 定制账本 - 共享抽奖模块 =====
 *
 * 数据结构与共享账本底座完全打通：
 *   抽奖活动   ↔  子账本（ledger，type='lottery'）
 *   奖项设置   ↔  账本科目（ledgerCategories，一级/二级目录）
 *   报名记录   ↔  账目条目（ledgerRecords，type='income'，标记 entryType='lottery_signup'）
 *   开奖结果   ↔  特殊账目（ledgerRecords，标记 entryType='lottery_result'）
 *
 * 三种抽奖模式：
 *   instant   - 即时自助（刮刮乐/转盘/翻牌），满足条件即可独立抽
 *   scheduled - 定时开奖（倒计时，到点统一揭晓）
 *   milestone - 阶段解锁（账本达成某目标自动触发）
 */

import {
  mysqlTable, int, varchar, text, mysqlEnum,
  timestamp, tinyint, decimal, json, index
} from "drizzle-orm/mysql-core";

// ─────────────────────────────────────────────
// 1. 抽奖活动表
// ─────────────────────────────────────────────
export const lotteryActivities = mysqlTable("lottery_activities", {
  id: int().autoincrement().notNull(),

  // 关联账本底座
  ledgerId: int("ledger_id").notNull(),           // 所属共享账本 ID
  createdBy: int("created_by").notNull(),          // 组织者（账本成员 userId）

  // 基础信息
  title: varchar({ length: 100 }).notNull(),       // 活动名称
  description: text(),                             // 活动描述
  coverImageUrl: text("cover_image_url"),          // 封面图

  // 抽奖模式
  mode: mysqlEnum(['instant', 'scheduled', 'milestone']).default('scheduled').notNull(),

  // 即时模式动效样式
  instantStyle: mysqlEnum("instant_style", ['scratch', 'wheel', 'flip', 'egg'])
    .default('scratch'),                           // 刮刮乐/转盘/翻牌/砸金蛋

  // 定时模式
  drawAt: timestamp("draw_at", { mode: 'string' }), // 开奖时间（scheduled 模式）
  autoDrawEnabled: tinyint("auto_draw_enabled").default(1).notNull(), // 是否自动开奖

  // 阶段解锁模式
  milestoneType: mysqlEnum("milestone_type", ['amount', 'member_count', 'record_count']),
  milestoneTarget: decimal("milestone_target", { precision: 12, scale: 2 }), // 目标值

  // 报名规则
  signupStartAt: timestamp("signup_start_at", { mode: 'string' }), // 报名开始时间
  signupEndAt: timestamp("signup_end_at", { mode: 'string' }),     // 报名截止时间
  maxParticipants: int("max_participants"),        // 最大参与人数（null=不限）
  requiresInfo: tinyint("requires_info").default(0).notNull(), // 是否需要填写信息
  requiredFields: json("required_fields"),         // 自定义必填字段 [{name, label, type}]
  signupFee: decimal("signup_fee", { precision: 10, scale: 2 }).default('0.00').notNull(), // 报名费

  // 公平性
  randomSeedHash: varchar("random_seed_hash", { length: 64 }), // 开奖前公示的种子哈希
  randomSeed: varchar("random_seed", { length: 255 }),         // 开奖后公布的完整种子
  useParticipantSeed: tinyint("use_participant_seed").default(0).notNull(), // 是否用参与者共同决定种子

  // 状态
  status: mysqlEnum(['draft', 'open', 'drawing', 'completed', 'cancelled'])
    .default('draft').notNull(),

  // 可见性
  isPublic: tinyint("is_public").default(1).notNull(), // 1=链接可见，0=仅成员

  createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("lottery_activities_ledger_idx").on(table.ledgerId),
  index("lottery_activities_status_idx").on(table.status),
]);

export type LotteryActivity = typeof lotteryActivities.$inferSelect;
export type InsertLotteryActivity = typeof lotteryActivities.$inferInsert;

// ─────────────────────────────────────────────
// 2. 奖项表（对应账本二级科目）
// ─────────────────────────────────────────────
export const lotteryPrizes = mysqlTable("lottery_prizes", {
  id: int().autoincrement().notNull(),
  activityId: int("activity_id").notNull(),        // 所属抽奖活动

  // 奖项信息
  name: varchar({ length: 50 }).notNull(),         // 奖项名称（一等奖/二等奖/…）
  description: text(),                             // 奖品描述
  imageUrl: text("image_url"),                     // 奖品图片
  quantity: int().default(1).notNull(),            // 中奖名额数
  sortOrder: int("sort_order").default(0).notNull(), // 排序（越小越高级）

  // 奖品价值（可选，用于收费报名场景的资金流水）
  prizeValue: decimal("prize_value", { precision: 10, scale: 2 }),

  // 权重（用于权重随机模式）
  weight: int().default(1).notNull(),

  // 是否为保底奖（必中）
  isConsolation: tinyint("is_consolation").default(0).notNull(),

  createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("lottery_prizes_activity_idx").on(table.activityId),
]);

export type LotteryPrize = typeof lotteryPrizes.$inferSelect;
export type InsertLotteryPrize = typeof lotteryPrizes.$inferInsert;

// ─────────────────────────────────────────────
// 3. 报名记录表（对应账目条目）
// ─────────────────────────────────────────────
export const lotteryParticipants = mysqlTable("lottery_participants", {
  id: int().autoincrement().notNull(),
  activityId: int("activity_id").notNull(),        // 所属抽奖活动
  userId: int("user_id"),                          // 已登录用户 ID（可为 null=游客）
  ledgerRecordId: int("ledger_record_id"),         // 关联的账目 ID（打通账本底座）

  // 参与者信息
  displayName: varchar("display_name", { length: 50 }), // 显示名称
  extraInfo: json("extra_info"),                   // 自定义字段填写内容

  // 公平性：参与者随机贡献（用于共同决定种子）
  participantSeed: varchar("participant_seed", { length: 64 }),

  // 报名状态
  status: mysqlEnum(['pending', 'confirmed', 'cancelled']).default('confirmed').notNull(),

  // 报名费支付
  feePaid: decimal("fee_paid", { precision: 10, scale: 2 }).default('0.00').notNull(),
  paymentStatus: mysqlEnum("payment_status", ['free', 'pending', 'paid']).default('free').notNull(),

  // 抽奖次数（即时模式：每次报名可抽几次）
  drawCount: int("draw_count").default(1).notNull(),
  drawUsed: int("draw_used").default(0).notNull(), // 已使用次数

  createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("lottery_participants_activity_idx").on(table.activityId),
  index("lottery_participants_user_idx").on(table.userId),
]);

export type LotteryParticipant = typeof lotteryParticipants.$inferSelect;
export type InsertLotteryParticipant = typeof lotteryParticipants.$inferInsert;

// ─────────────────────────────────────────────
// 4. 开奖结果表
// ─────────────────────────────────────────────
export const lotteryResults = mysqlTable("lottery_results", {
  id: int().autoincrement().notNull(),
  activityId: int("activity_id").notNull(),        // 所属抽奖活动
  prizeId: int("prize_id").notNull(),              // 所中奖项
  participantId: int("participant_id").notNull(),  // 中奖参与者
  ledgerRecordId: int("ledger_record_id"),         // 关联账目（打通账本底座）

  // 中奖信息
  winnerId: int("winner_id"),                      // 中奖者 userId
  winnerName: varchar("winner_name", { length: 50 }), // 中奖者显示名

  // 公平验证
  randomSeed: varchar("random_seed", { length: 255 }), // 本次开奖使用的种子
  drawIndex: int("draw_index").default(0).notNull(),    // 第几个被抽中

  // 领奖状态
  claimStatus: mysqlEnum("claim_status", ['unclaimed', 'claimed', 'expired'])
    .default('unclaimed').notNull(),
  claimedAt: timestamp("claimed_at", { mode: 'string' }),

  drawnAt: timestamp("drawn_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
}, (table) => [
  index("lottery_results_activity_idx").on(table.activityId),
  index("lottery_results_winner_idx").on(table.winnerId),
]);

export type LotteryResult = typeof lotteryResults.$inferSelect;
export type InsertLotteryResult = typeof lotteryResults.$inferInsert;
