import { int, mysqlEnum, mysqlTable, text, longtext, timestamp, varchar, boolean, json, date } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * 用户表 - 三级权限体系：超级管理员 → 家长 → 宝宝
 * 
 * 权限说明：
 * - super_admin: 超级管理员，拥有所有权限，可管理所有家庭和用户
 * - parent: 家长，可管理自己家庭的宝宝、字库、奖励等
 * - baby: 宝宝，只能使用游戏和学习功能
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 50 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // 三级权限体系
  role: mysqlEnum("role", ["super_admin", "parent", "baby"]).default("parent").notNull(),
  // 关联家庭（家长和宝宝都属于某个家庭）
  familyId: int("familyId"),
  avatar: text("avatar"),
  points: int("points").default(0).notNull(),
  // 好友记共享权限（用户级别）
  sharingEnabled: boolean("sharingEnabled").default(false).notNull(),
  isLocked: boolean("isLocked").default(false).notNull(),
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  lastFailedLogin: timestamp("lastFailedLogin"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 用户偏好设置表 - 存储用户的个性化设置
 * 
 * 用于存储用户的界面偏好、排序设置等
 */
export const userPreferences = mysqlTable("user_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // 用户ID,一个用户只有一条偏好记录
  homeCardOrder: json("homeCardOrder").$type<string[]>(), // 首页卡片排序,存储卡片ID数组
  favoriteFeatures: json("favoriteFeatures").$type<string[]>(), // 个人中心常用功能,存储功能ID数组
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = typeof userPreferences.$inferInsert;

/**
 * 家庭表 - 家长和宝宝的归属单位
 * 
 * 一个家庭可以有多个家长和多个宝宝
 * 家庭拥有自己的字库、奖励商店等资源
 */
export const families = mysqlTable("families", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // 家庭名称，如"胡家"
  description: text("description"), // 家庭描述
  avatar: text("avatar"), // 家庭头像/图标
  createdBy: int("createdBy").notNull(), // 创建者（家长）的用户ID
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Family = typeof families.$inferSelect;
export type InsertFamily = typeof families.$inferInsert;

/**
 * 家庭字库表 - 家庭自定义的汉字学习内容
 * 
 * 家长可以为自己的家庭添加自定义汉字
 * 系统字库(characters表) → 家庭字库(family_characters表) → 宝宝学习
 */
export const familyCharacters = mysqlTable("family_characters", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(), // 所属家庭
  character: varchar("character", { length: 10 }).notNull(), // 汉字
  pinyin: varchar("pinyin", { length: 50 }).notNull(), // 拼音（带声调）
  imageUrl: text("imageUrl"), // 自定义图片URL（可选）
  fileKey: varchar("fileKey", { length: 255 }), // S3文件key
  category: varchar("category", { length: 50 }).default("自定义").notNull(), // 分类
  difficulty: int("difficulty").default(1).notNull(), // 难度（1-5星）
  commonWords: json("commonWords").$type<string[]>(), // 常用词组
  notes: text("notes"), // 家长备注
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(), // 添加者（家长）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FamilyCharacter = typeof familyCharacters.$inferSelect;
export type InsertFamilyCharacter = typeof familyCharacters.$inferInsert;

/**
 * 游戏奖励配置表 - 后台可配置的游戏奖励规则
 * 
 * 超级管理员可以配置全局默认值
 * 家长可以为自己家庭配置覆盖值
 */
export const gameRewardConfig = mysqlTable("game_reward_config", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId"), // 为空表示全局配置，有值表示家庭自定义配置
  gameType: varchar("gameType", { length: 50 }).notNull(), // 游戏类型：math, antonym, character, memory, puzzle, chess, go, gomoku, ludo, brushing
  activityType: varchar("activityType", { length: 50 }).notNull(), // 活动类型：win, complete, perfect等
  starsReward: int("starsReward").default(1).notNull(), // 奖励星星数
  description: text("description"), // 配置说明
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(), // 配置者
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GameRewardConfig = typeof gameRewardConfig.$inferSelect;
export type InsertGameRewardConfig = typeof gameRewardConfig.$inferInsert;

/**
 * 孩子档案表 - 关联家长账户（保留兼容性）
 * @deprecated 建议使用 specialKids 表
 */
export const childProfiles = mysqlTable("child_profiles", {
  id: int("id").autoincrement().primaryKey(),
  parentId: int("parentId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  avatar: text("avatar"),
  birthday: timestamp("birthday"),
  points: int("points").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChildProfile = typeof childProfiles.$inferSelect;
export type InsertChildProfile = typeof childProfiles.$inferInsert;

/**
 * 游戏记录表
 */
export const gameRecords = mysqlTable("game_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  childId: int("childId"),
  gameType: mysqlEnum("gameType", ["memory", "puzzle", "math"]).notNull(),
  score: int("score").default(0).notNull(),
  level: int("level").default(1).notNull(),
  duration: int("duration").default(0).notNull(), // 游戏时长（秒）
  completedAt: timestamp("completedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GameRecord = typeof gameRecords.$inferSelect;
export type InsertGameRecord = typeof gameRecords.$inferInsert;

/**
 * 知识分类表
 */
export const knowledgeCategories = mysqlTable("knowledge_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 20 }),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KnowledgeCategory = typeof knowledgeCategories.$inferSelect;
export type InsertKnowledgeCategory = typeof knowledgeCategories.$inferInsert;

/**
 * 知识内容表
 */
export const knowledgeItems = mysqlTable("knowledge_items", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  coverImage: text("coverImage"),
  images: json("images").$type<string[]>(),
  viewCount: int("viewCount").default(0).notNull(),
  isPublished: boolean("isPublished").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type InsertKnowledgeItem = typeof knowledgeItems.$inferInsert;

/**
 * 相册表
 */
export const albums = mysqlTable("albums", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  childId: int("childId"),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  coverImage: text("coverImage"),
  isPublic: boolean("isPublic").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Album = typeof albums.$inferSelect;
export type InsertAlbum = typeof albums.$inferInsert;

/**
 * 照片表
 */
export const photos = mysqlTable("photos", {
  id: int("id").autoincrement().primaryKey(),
  albumId: int("albumId").notNull(),
  userId: int("userId").notNull(),
  url: text("url").notNull(),
  fileKey: varchar("fileKey", { length: 255 }).notNull(),
  thumbnail: text("thumbnail"),
  description: text("description"),
  takenAt: timestamp("takenAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = typeof photos.$inferInsert;

/**
 * 照片评论表
 */
export const photoComments = mysqlTable("photo_comments", {
  id: int("id").autoincrement().primaryKey(),
  photoId: int("photoId").notNull(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PhotoComment = typeof photoComments.$inferSelect;
export type InsertPhotoComment = typeof photoComments.$inferInsert;

/**
 * 勋章定义表
 */
export const badges = mysqlTable("badges", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 20 }),
  requirement: text("requirement"),
  pointsRequired: int("pointsRequired").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Badge = typeof badges.$inferSelect;
export type InsertBadge = typeof badges.$inferInsert;

/**
 * 用户勋章关联表
 */
export const userBadges = mysqlTable("user_badges", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  childId: int("childId"),
  badgeId: int("badgeId").notNull(),
  earnedAt: timestamp("earnedAt").defaultNow().notNull(),
});

export type UserBadge = typeof userBadges.$inferSelect;
export type InsertUserBadge = typeof userBadges.$inferInsert;

/**
 * 任务定义表
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  createdBy: int("createdBy").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  taskType: mysqlEnum("taskType", ["daily", "weekly", "custom"]).default("custom").notNull(),
  points: int("points").default(10).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * 任务完成记录表
 */
export const taskCompletions = mysqlTable("task_completions", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  childId: int("childId"),
  completedAt: timestamp("completedAt").defaultNow().notNull(),
  pointsEarned: int("pointsEarned").default(0).notNull(),
});

export type TaskCompletion = typeof taskCompletions.$inferSelect;
export type InsertTaskCompletion = typeof taskCompletions.$inferInsert;

/**
 * 奖品定义表
 */
export const rewards = mysqlTable("rewards", {
  id: int("id").autoincrement().primaryKey(),
  createdBy: int("createdBy").notNull(),
  familyId: int("familyId"), // 新增：所属家庭，为空表示全局奖品
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  icon: text("icon"),
  pointsCost: int("pointsCost").default(100).notNull(),
  stock: int("stock").default(-1).notNull(), // -1 表示无限
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Reward = typeof rewards.$inferSelect;
export type InsertReward = typeof rewards.$inferInsert;

/**
 * 奖品兑换记录表
 */
export const rewardRedemptions = mysqlTable("reward_redemptions", {
  id: int("id").autoincrement().primaryKey(),
  rewardId: int("rewardId").notNull(),
  userId: int("userId").notNull(),
  childId: int("childId"),
  pointsSpent: int("pointsSpent").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "completed"]).default("pending").notNull(),
  redeemedAt: timestamp("redeemedAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
});

export type RewardRedemption = typeof rewardRedemptions.$inferSelect;
export type InsertRewardRedemption = typeof rewardRedemptions.$inferInsert;

/**
 * 积分交易记录表
 */
export const pointTransactions = mysqlTable("point_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  childId: int("childId"),
  amount: int("amount").notNull(), // 正数为获得，负数为消费
  type: mysqlEnum("type", ["game", "task", "reward", "admin"]).notNull(),
  referenceId: int("referenceId"), // 关联的游戏/任务/奖品ID
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PointTransaction = typeof pointTransactions.$inferSelect;
export type InsertPointTransaction = typeof pointTransactions.$inferInsert;

/**
 * 登录失败记录表 - 用于跟踪IP级别的登录尝试
 */
export const loginAttempts = mysqlTable("login_attempts", {
  id: int("id").autoincrement().primaryKey(),
  ipAddress: varchar("ipAddress", { length: 45 }).notNull(),
  username: varchar("username", { length: 50 }),
  success: boolean("success").default(false).notNull(),
  attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
});

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type InsertLoginAttempt = typeof loginAttempts.$inferInsert;

/**
 * 专属孩子档案表 - 喵喵和旺旺的专属档案
 * 
 * 这是宝宝的核心数据表，存储宝宝的基本信息和星星数量
 * 与 users 表中 role='baby' 的用户关联
 */
export const specialKids = mysqlTable("special_kids", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // 关联users表中的宝宝账户
  parentUserId: int("parentUserId"), // 直接关联家长用户ID
  name: varchar("name", { length: 50 }).notNull(),
  avatar: text("avatar"),
  stars: int("stars").default(0).notNull(),
  position: mysqlEnum("position", ["left", "right"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SpecialKid = typeof specialKids.$inferSelect;
export type InsertSpecialKid = typeof specialKids.$inferInsert;

/**
 * 奖励规则表 - 管理员设置各种活动的奖励星数
 * @deprecated 建议使用 gameRewardConfig 表，支持家庭级别配置
 */
export const starRewardRules = mysqlTable("star_reward_rules", {
  id: int("id").autoincrement().primaryKey(),
  activityType: varchar("activityType", { length: 50 }).notNull().unique(),
  activityName: varchar("activityName", { length: 100 }).notNull(),
  starsReward: int("starsReward").default(1).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StarRewardRule = typeof starRewardRules.$inferSelect;
export type InsertStarRewardRule = typeof starRewardRules.$inferInsert;

/**
 * 五角星奖励记录表
 */
export const starRewards = mysqlTable("star_rewards", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull(),
  activityType: varchar("activityType", { length: 50 }).notNull(),
  starsEarned: int("starsEarned").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StarReward = typeof starRewards.$inferSelect;
export type InsertStarReward = typeof starRewards.$inferInsert;

/**
 * 星星商城商品表
 */
export const starShopItems = mysqlTable("star_shop_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  image: text("image"),
  starsCost: int("starsCost").default(10).notNull(),
  stock: int("stock").default(-1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StarShopItem = typeof starShopItems.$inferSelect;
export type InsertStarShopItem = typeof starShopItems.$inferInsert;

/**
 * 星星商城兑换记录表
 */
export const starRedemptions = mysqlTable("star_redemptions", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull(),
  itemId: int("itemId").notNull(),
  starsSpent: int("starsSpent").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "completed"]).default("pending").notNull(),
  redeemedAt: timestamp("redeemedAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
});

export type StarRedemption = typeof starRedemptions.$inferSelect;
export type InsertStarRedemption = typeof starRedemptions.$inferInsert;

/**
 * 反义词对表
 */// 人脉管理表
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  parentUserId: int("parentUserId").notNull(), // 所属家长ID
  name: varchar("name", { length: 100 }).notNull(), // 姓名
  title: varchar("title", { length: 50 }), // 称谓（如：叔叔、阿姨、老师等）
  gender: varchar("gender", { length: 10 }), // 性别
  birthDate: varchar("birthDate", { length: 20 }), // 出生年月
  occupation: varchar("occupation", { length: 100 }), // 职业
  address: text("address"), // 联络地址
  region: varchar("region", { length: 50 }), // 所在地区/省份
  wechat: varchar("wechat", { length: 100 }), // 微信
  phone: varchar("phone", { length: 20 }), // 电话
  tags: json("tags").$type<string[]>(), // 标签列表（如：资金往来、亲戚、同事等）
  referrerId: int("referrerId"), // 介绍人 ID（外键关联 contacts.id）
  linkedUserId: int("linkedUserId"), // 关联的用户ID（如果这个人脉已注册网站）
  avatar: text("avatar"), // 头像 URL
  isBlacklisted: boolean("isBlacklisted").default(false).notNull(), // 是否拉黑
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// 人脉自定义字段表
export const contactCustomFields = mysqlTable("contact_custom_fields", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(), // 关联的人脉ID
  fieldName: varchar("fieldName", { length: 100 }).notNull(), // 字段标题
  fieldValue: text("fieldValue"), // 字段内容
  sortOrder: int("sortOrder").default(0).notNull(), // 排序顺序
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactCustomField = typeof contactCustomFields.$inferSelect;
export type InsertContactCustomField = typeof contactCustomFields.$inferInsert;

export const contactTags = mysqlTable("contact_tags", {
  id: int("id").autoincrement().primaryKey(),
  parentUserId: int("parentUserId").notNull(), // 所属家长ID
  name: varchar("name", { length: 50 }).notNull(), // 标签名称
  color: varchar("color", { length: 20 }).default("#3b82f6").notNull(), // 标签颜色（十六进制颜色值）
  sortOrder: int("sortOrder").default(0).notNull(), // 排序顺序（数字越小越靠前）
  isPreset: boolean("isPreset").default(false).notNull(), // 是否为预设标签
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const contactTagRelations = mysqlTable("contact_tag_relations", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(), // 人脉ID
  tagId: int("tagId").notNull(), // 标签ID
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const contactInteractions = mysqlTable("contact_interactions", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(), // 人脉ID
  interactionDate: timestamp("interactionDate").notNull(), // 联络时间
  note: text("note"), // 备注
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

export type ContactTag = typeof contactTags.$inferSelect;
export type InsertContactTag = typeof contactTags.$inferInsert;

export type ContactTagRelation = typeof contactTagRelations.$inferSelect;
export type InsertContactTagRelation = typeof contactTagRelations.$inferInsert;

export type ContactInteraction = typeof contactInteractions.$inferSelect;
export type InsertContactInteraction = typeof contactInteractions.$inferInsert;

/**
 * 个人标签表 - 针对单个人脉的自定义标签（与全局标签分开）
 * 
 * 与全局标签(contactTags)的区别：
 * - 全局标签：用户创建的标签模板，可以应用到多个人脉
 * - 个人标签：针对单个人脉的自定义标签，只属于这一个人脉
 */
export const personalContactTags = mysqlTable("personal_contact_tags", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(), // 关联的人脉ID
  parentUserId: int("parentUserId").notNull(), // 所属家长ID
  name: varchar("name", { length: 50 }).notNull(), // 标签名称
  color: varchar("color", { length: 20 }).default("#8b5cf6").notNull(), // 标签颜色（默认紫色，与全局标签区分）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PersonalContactTag = typeof personalContactTags.$inferSelect;
export type InsertPersonalContactTag = typeof personalContactTags.$inferInsert;

export const antonyms = mysqlTable("antonyms", {
  id: int("id").autoincrement().primaryKey(),
  word: varchar("word", { length: 50 }).notNull(),
  antonym: varchar("antonym", { length: 50 }).notNull(),
  category: varchar("category", { length: 50 }).default("general").notNull(),
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).default("easy").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AntonymPair = typeof antonyms.$inferSelect;
export type InsertAntonymPair = typeof antonyms.$inferInsert;

/**
 * 错题本表 - 记录孩子答错的题目
 */
export const wrongQuestions = mysqlTable("wrong_questions", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull(), // 关联special_kids表
  gameType: mysqlEnum("gameType", ["math", "antonym", "character"]).notNull(),
  questionData: text("questionData").notNull(), // JSON格式存储题目数据
  userAnswer: varchar("userAnswer", { length: 100 }).notNull(), // 用户的错误答案
  correctAnswer: varchar("correctAnswer", { length: 100 }).notNull(), // 正确答案
  reviewed: boolean("reviewed").default(false).notNull(), // 是否已复习
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WrongQuestion = typeof wrongQuestions.$inferSelect;
export type InsertWrongQuestion = typeof wrongQuestions.$inferInsert;

/**
 * 游戏排序偏好表 - 存储每个孩子的游戏卡片排序
 */
export const gameOrderPreferences = mysqlTable("game_order_preferences", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull().unique(), // 孩子ID（关联special_kids表），唯一索引
  gameOrders: text("gameOrders").notNull(), // JSON字符串，存储游戏ID数组
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GameOrderPreference = typeof gameOrderPreferences.$inferSelect;
export type InsertGameOrderPreference = typeof gameOrderPreferences.$inferInsert;

/**
 * 汉字学习表 - 看图识字游戏（系统字库）
 */
export const characters = mysqlTable("characters", {
  id: int("id").autoincrement().primaryKey(),
  character: varchar("character", { length: 10 }).notNull(), // 汉字
  pinyin: varchar("pinyin", { length: 50 }).notNull(), // 拼音（带声调）
  imageUrl: text("imageUrl").notNull(), // 图片URL
  fileKey: varchar("fileKey", { length: 255 }).notNull(), // S3文件key
  category: varchar("category", { length: 50 }).notNull(), // 分类：动物/水果/身体/数字/颜色/日常
  difficulty: int("difficulty").default(1).notNull(), // 难度（1-5星）
  strokeCount: int("strokeCount").default(0).notNull(), // 笔画数
  commonWords: json("commonWords").$type<string[]>(), // 常用词组
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Character = typeof characters.$inferSelect;
export type InsertCharacter = typeof characters.$inferInsert;

/**
 * 汉字学习记录表
 */
export const characterLearningRecords = mysqlTable("character_learning_records", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull(), // 关联special_kids表
  characterId: int("characterId").notNull(), // 关联characters表
  isCorrect: boolean("isCorrect").notNull(), // 是否答对
  selectedAnswer: varchar("selectedAnswer", { length: 10 }), // 用户选择的答案
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CharacterLearningRecord = typeof characterLearningRecords.$inferSelect;
export type InsertCharacterLearningRecord = typeof characterLearningRecords.$inferInsert;

/**
 * 汉字游戏设置表 - 存储每个孩子的游戏设置
 */
export const characterGameSettings = mysqlTable("character_game_settings", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull().unique(), // 孩子ID，唯一索引
  autoPlayCount: int("autoPlayCount").default(1).notNull(), // 语音自动播放次数（0=关闭，1-3次）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CharacterGameSetting = typeof characterGameSettings.$inferSelect;
export type InsertCharacterGameSetting = typeof characterGameSettings.$inferInsert;

/**
 * 快闪识字记录表 - 记录每个孩子对每个汉字的认识/忘记次数
 */
export const flashcardRecords = mysqlTable("flashcard_records", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull(), // 孩子ID
  characterId: int("characterId").notNull(), // 汉字ID
  knownCount: int("knownCount").default(0).notNull(), // 认识次数
  forgottenCount: int("forgottenCount").default(0).notNull(), // 忘记次数
  lastInteraction: timestamp("lastInteraction").defaultNow().notNull(), // 最后交互时间
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FlashcardRecord = typeof flashcardRecords.$inferSelect;
export type InsertFlashcardRecord = typeof flashcardRecords.$inferInsert;

/**
 * 刷牙记录表 - 牙齿保卫战游戏
 */
export const brushingSessions = mysqlTable("brushing_sessions", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull(), // 孩子ID
  duration: int("duration").notNull(), // 刷牙时长（秒）
  completed: boolean("completed").default(true).notNull(), // 是否完成
  starsEarned: int("starsEarned").default(1).notNull(), // 获得的星星数
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BrushingSession = typeof brushingSessions.$inferSelect;
export type InsertBrushingSession = typeof brushingSessions.$inferInsert;


/**
 * 邀请码表 - 管理员邀请家长注册
 * 
 * 管理员生成邀请码，家长通过邀请链接注册后自动成为parent角色
 */
export const invitations = mysqlTable("invitations", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(), // 邀请码（随机生成）
  familyName: varchar("familyName", { length: 100 }), // 预设的家庭名称（可选）
  maxUses: int("maxUses").default(1).notNull(), // 最大使用次数
  usedCount: int("usedCount").default(0).notNull(), // 已使用次数
  expiresAt: timestamp("expiresAt"), // 过期时间（可选）
  isActive: boolean("isActive").default(true).notNull(), // 是否有效
  createdBy: int("createdBy").notNull(), // 创建者（管理员）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;

/**
 * 邀请使用记录表 - 记录每次邀请码的使用情况
 */
export const invitationUsages = mysqlTable("invitation_usages", {
  id: int("id").autoincrement().primaryKey(),
  invitationId: int("invitationId").notNull(), // 关联邀请码
  userId: int("userId").notNull(), // 使用邀请码注册的用户
  familyId: int("familyId").notNull(), // 创建的家庭ID
  usedAt: timestamp("usedAt").defaultNow().notNull(),
});

export type InvitationUsage = typeof invitationUsages.$inferSelect;
export type InsertInvitationUsage = typeof invitationUsages.$inferInsert;

/**
 * 家庭功能权限表 - 记录每个家庭的子功能开关和详细设置
 * 
 * 超级管理员通过此表控制每个家庭能使用哪些子功能
 * 6个主功能（游戏、健康、知识、逻辑、社交、家长）始终显示，但子功能需要开通
 */
export const familyFeatures = mysqlTable("familyFeatures", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(), // 关联的家庭ID
  featureName: varchar("featureName", { length: 50 }).notNull(), // 主功能名称：游戏、健康、知识、逻辑、社交、家长
  subFeatureName: varchar("subFeatureName", { length: 100 }).notNull(), // 子功能名称，如"记忆游戏"、"数学游戏"
  parentFeature: varchar("parentFeature", { length: 100 }), // 父功能名称，为空表示一级功能，有值表示这是某个功能的子功能
  level: int("level").default(1).notNull(), // 层级深度：1=大模块，2=子功能，3=细分功能，4=更细功能...
  path: varchar("path", { length: 500 }), // 完整路径，如"家长中心/宝宝词库/拍照取词"
  displayOrder: int("displayOrder").default(0).notNull(), // 显示顺序
  enabled: boolean("enabled").default(false).notNull(), // 是否启用该子功能
  settings: json("settings"), // 子功能的详细设置（JSON格式），如游戏关卡、难度等
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FamilyFeature = typeof familyFeatures.$inferSelect;
export type InsertFamilyFeature = typeof familyFeatures.$inferInsert;

/**
 * 首页横幅配置表 - 存储首页顶部的横幅内容
 * 
 * 超级管理员可以配置首页横幅的标题、描述和图片
 * 所有用户都能看到这个横幅内容
 */
export const homeBanner = mysqlTable("homeBanner", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }), // 横幅标题
  description: text("description"), // 横幅描述
  imageUrl: text("imageUrl"), // 横幅图片URL
  isActive: boolean("isActive").default(true).notNull(), // 是否启用
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HomeBanner = typeof homeBanner.$inferSelect;
export type InsertHomeBanner = typeof homeBanner.$inferInsert;


/**
 * 20加法游戏配置表 - 存储每个孩子的游戏设置
 * 
 * 家长可以为每个孩子配置：
 * - 题型难度：简单(和≤20)、中等(一个≥10)、困难(两个都≥10)
 * - 题目数量：10-50题
 * - 答题方式：选择题(4选1)或手写输入
 */
export const addition20Config = mysqlTable("addition20_config", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull().unique(), // 孩子ID，唯一索引
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).default("easy").notNull(), // 难度
  questionCount: int("questionCount").default(10).notNull(), // 题目数量（10-50）
  answerMode: mysqlEnum("answerMode", ["choice", "input"]).default("choice").notNull(), // 答题方式
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Addition20Config = typeof addition20Config.$inferSelect;
export type InsertAddition20Config = typeof addition20Config.$inferInsert;

/**
 * 20加法游戏记录表 - 记录每次游戏的成绩
 */
export const addition20Records = mysqlTable("addition20_records", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull(), // 孩子ID
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).notNull(), // 游戏时的难度
  questionCount: int("questionCount").notNull(), // 题目总数
  correctCount: int("correctCount").notNull(), // 答对数量
  duration: int("duration").notNull(), // 用时（秒）
  answerMode: mysqlEnum("answerMode", ["choice", "input"]).notNull(), // 答题方式
  starsEarned: int("starsEarned").default(0).notNull(), // 获得的星星数
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Addition20Record = typeof addition20Records.$inferSelect;
export type InsertAddition20Record = typeof addition20Records.$inferInsert;

/**
 * 20加法有奖挑战表 - 家长为孩子设置的个性化挑战奖励
 * 
 * 家长可以为孩子设置挑战目标和奖品
 * 孩子通过累计答对题目数量来完成挑战
 */
export const addition20Challenges = mysqlTable("addition20_challenges", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull(), // 宝宝ID
  parentId: int("parentId").notNull(), // 设置挑战的家长ID
  
  // 挑战要求
  targetCorrectCount: int("targetCorrectCount").notNull(), // 目标答对题数
  penaltyPerWrong: int("penaltyPerWrong").default(0).notNull(), // 每答错一题扣减的题数
  
  // 奖品信息
  rewardTitle: varchar("rewardTitle", { length: 100 }).notNull(), // 奖品名称
  rewardImageUrl: text("rewardImageUrl"), // 奖品图片URL
  rewardFileKey: varchar("rewardFileKey", { length: 255 }), // S3文件key
  
  // 进度追踪
  currentCorrectCount: int("currentCorrectCount").default(0).notNull(), // 当前累计答对题数
  totalAttempted: int("totalAttempted").default(0).notNull(), // 总答题次数
  totalCorrect: int("totalCorrect").default(0).notNull(), // 总答对次数
  totalWrong: int("totalWrong").default(0).notNull(), // 总答错次数
  
  // 状态管理
  status: mysqlEnum("status", ["active", "paused", "completed", "cancelled"]).default("active").notNull(),
  
  // 时间记录
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  lastPlayedAt: timestamp("lastPlayedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Addition20Challenge = typeof addition20Challenges.$inferSelect;
export type InsertAddition20Challenge = typeof addition20Challenges.$inferInsert;

/**
 * 阅读识字故事表
 * 存储预设故事模板和家长自定义的故事内容
 */
export const readingStories = mysqlTable("reading_stories", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(), // 故事标题
  content: text("content").notNull(), // 故事内容
  type: mysqlEnum("type", ["template", "custom", "ai_generated"]).default("template").notNull(), // 故事类型
  coverImageUrl: text("coverImageUrl"), // 故事封面图片URL
  createdBy: int("createdBy"), // 创建者ID（家长），模板故事为null
  kidId: int("kidId"), // 关联的孩子ID，模板故事为null
  wordCount: int("wordCount").notNull(), // 字数统计
  isActive: boolean("isActive").default(true).notNull(), // 是否激活
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReadingStory = typeof readingStories.$inferSelect;
export type InsertReadingStory = typeof readingStories.$inferInsert;

/**
 * 阅读识字记录表
 * 记录孩子的阅读历史和点读次数
 */
export const readingRecords = mysqlTable("reading_records", {
  id: int("id").autoincrement().primaryKey(),
  kidId: int("kidId").notNull(), // 孩子ID
  storyId: int("storyId").notNull(), // 故事ID
  clickCount: int("clickCount").default(0).notNull(), // 点读次数
  readDuration: int("readDuration").default(0).notNull(), // 阅读时长（秒）
  completedAt: timestamp("completedAt"), // 完成时间
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReadingRecord = typeof readingRecords.$inferSelect;
export type InsertReadingRecord = typeof readingRecords.$inferInsert;

/**
 * 总词库表 - 存储所有中文和英文词汇（超级管理员管理）
 */
export const vocabularyMaster = mysqlTable("vocabulary_master", {
  id: int("id").autoincrement().primaryKey(),
  word: varchar("word", { length: 100 }).notNull(), // 词汇
  language: mysqlEnum("language", ["chinese", "english"]).notNull(), // 语言类型
  wordType: mysqlEnum("wordType", ["character", "word"]).default("word").notNull(), // 词汇类型：character=单字，word=词语（仅中文有效）
  translation: varchar("translation", { length: 200 }), // 翻译（英文词的中文翻译，或中文词的英文翻译）
  pinyin: varchar("pinyin", { length: 100 }), // 拼音（仅中文词）
  pronunciation: varchar("pronunciation", { length: 100 }), // 音标（仅英文词）
  category: varchar("category", { length: 50 }).default("general").notNull(), // 分类
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).default("easy").notNull(),
  example: text("example"), // 例句
  imageUrl: text("imageUrl"), // 配图URL
  audioUrl: text("audioUrl"), // 发音音频URL
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VocabularyMaster = typeof vocabularyMaster.$inferSelect;
export type InsertVocabularyMaster = typeof vocabularyMaster.$inferInsert;

/**
 * 家庭词库关联表 - 记录每个家庭选择的词汇
 * 
 * 逻辑说明：
 * 1. 家长添加词汇时，如果总词库没有则自动添加到vocabulary_master
 * 2. 家长删除词汇时，只从family_vocabulary删除，不影响vocabulary_master
 * 3. 超级管理员可以直接管理vocabulary_master
 */
export const familyVocabulary = mysqlTable("family_vocabulary", {
  id: int("id").autoincrement().primaryKey(),
  parentUserId: int("parentUserId").notNull(), // 关联家长用户ID
  vocabularyId: int("vocabularyId").notNull(), // 关联vocabulary_master表
  kidId: int("kidId"), // 关联宝宝的special_kids.id（可选，null表示家长下所有宝宝通用）
  addedBy: int("addedBy").notNull(), // 添加者的用户ID（家长）
  customNote: text("customNote"), // 家长自定义备注
  masteryLevel: mysqlEnum("masteryLevel", ["not_started", "learning", "mastered"]).default("not_started").notNull(), // 学习进度
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FamilyVocabulary = typeof familyVocabulary.$inferSelect;
export type InsertFamilyVocabulary = typeof familyVocabulary.$inferInsert;

/**
 * 家长VI配置表 - 为每个家长配置独立的视觉识别系统
 * 
 * 超级管理员可以为每个家长账户配置独立的VI主题
 * 家长及其宝宝登录后自动应用对应的VI配置
 */
export const familyViConfig = mysqlTable("family_vi_config", {
  id: int("id").autoincrement().primaryKey(),
  parentUserId: int("parentUserId").notNull().unique(), // 关联家长用户ID（唯一）
  viThemeId: varchar("viThemeId", { length: 50 }), // VI主题ID（如"theme_blue", "theme_pink"等，等待用户上传VI方案）
  customConfig: json("customConfig").$type<{
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    fontFamily?: string;
    customCSS?: string;
  }>(), // 自定义配置（JSON格式，可覆盖主题默认值）
  isActive: boolean("isActive").default(true).notNull(), // 是否启用
  createdBy: int("createdBy").notNull(), // 创建者（超级管理员）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FamilyViConfig = typeof familyViConfig.$inferSelect;
export type InsertFamilyViConfig = typeof familyViConfig.$inferInsert;


/**
 * 人脉字段分类表 - 全局字段分类定义
 * 
 * 用户可以创建自定义字段分类（如：公司、职位、微信号等）
 * 创建后这些字段会自动应用到所有人脉
 */
export const contactFieldCategories = mysqlTable("contact_field_categories", {
  id: int("id").autoincrement().primaryKey(),
  parentUserId: int("parentUserId").notNull(), // 所属用户ID
  parentCategoryId: int("parentCategoryId").default(0), // 父分类ID，0表示主分类
  name: varchar("name", { length: 100 }).notNull(), // 字段名称
  icon: varchar("icon", { length: 50 }), // 图标（主分类使用emoji）
  fieldType: varchar("fieldType", { length: 20 }).default("text").notNull(), // 字段类型：text, number, date, select
  options: json("options").$type<string[]>(), // 选项列表（当fieldType为select时使用）
  sortOrder: int("sortOrder").default(0).notNull(), // 排序顺序
  isRequired: boolean("isRequired").default(false).notNull(), // 是否必填
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactFieldCategory = typeof contactFieldCategories.$inferSelect;
export type InsertContactFieldCategory = typeof contactFieldCategories.$inferInsert;

/**
 * 人脉字段值表 - 存储人脉的自定义字段值
 * 
 * 关联人脉和字段分类，存储具体的字段值
 */
export const contactFieldValues = mysqlTable("contact_field_values", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(), // 关联的人脉ID
  categoryId: int("categoryId").notNull(), // 关联的字段分类ID
  value: text("value"), // 字段值
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactFieldValue = typeof contactFieldValues.$inferSelect;
export type InsertContactFieldValue = typeof contactFieldValues.$inferInsert;

/**
 * 容器定义表 - 管理员定义的所有功能容器
 * 
 * 超级管理员可以添加、编辑、启用/禁用容器
 * 所有用户看到的容器列表都基于此表
 */
export const featureDefinitions = mysqlTable("feature_definitions", {
  id: int("id").autoincrement().primaryKey(),
  featureId: int("featureId").notNull().unique(), // 容器ID（1-16或更多）
  title: varchar("title", { length: 100 }).notNull(), // 容器标题
  description: text("description"), // 容器描述
  isActive: boolean("isActive").default(true).notNull(), // 是否启用
  defaultPosition: int("defaultPosition").notNull(), // 默认位置（0-15）
  createdBy: int("createdBy").notNull(), // 创建者（管理员）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FeatureDefinition = typeof featureDefinitions.$inferSelect;
export type InsertFeatureDefinition = typeof featureDefinitions.$inferInsert;

/**
 * 用户容器顺序表 - 每个用户自定义的容器排列顺序
 * 
 * 用户可以拖拽调整容器顺序，保存到此表
 * 跨设备同步：同一用户在不同设备上看到相同顺序
 */
export const userFeatureOrder = mysqlTable("user_feature_order", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // 用户ID
  featureId: int("featureId").notNull(), // 容器ID
  position: int("position").notNull(), // 显示位置（0-15）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserFeatureOrder = typeof userFeatureOrder.$inferSelect;
export type InsertUserFeatureOrder = typeof userFeatureOrder.$inferInsert;

/**
 * 提醒事项表 - 为人脉设置提醒事项
 * 
 * 一个人脉可以有多个提醒事项
 * 提醒事项包含事项内容和提醒时间
 */
/**
 * 提醒类型表 - 用户自定义的提醒类型
 * 
 * 用户可以创建自己的提醒类型，并应用到所有联系人
 */
export const reminderTypes = mysqlTable("reminder_types", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // 创建者用户ID
  name: varchar("name", { length: 50 }).notNull(), // 类型名称，如"纪念日"、"还款日"、"项目跟进"
  icon: varchar("icon", { length: 50 }).default("🔔"), // 图标emoji
  color: varchar("color", { length: 20 }).default("#6366f1"), // 颜色值
  isDefault: boolean("isDefault").default(false).notNull(), // 是否为默认类型（默认类型不能删除）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReminderType = typeof reminderTypes.$inferSelect;
export type InsertReminderType = typeof reminderTypes.$inferInsert;

/**
 * 提醒事项表 - 关联人脉的提醒事项
 * 
 * 提醒事项包含事项内容、提醒时间和通知方式
 */
export const reminders = mysqlTable("reminders", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(), // 关联的人脉ID
  userId: int("userId").notNull(), // 创建提醒的用户ID
  reminderTypeId: int("reminderTypeId"), // 提醒类型ID（关联reminder_types表）
  title: varchar("title", { length: 200 }).notNull(), // 提醒事项标题
  description: text("description"), // 提醒事项详细描述
  reminderTime: timestamp("reminderTime").notNull(), // 提醒时间
  reminderType: mysqlEnum("reminderType", ["normal", "birthday"]).default("normal").notNull(), // 提醒类型：普通提醒/生日提醒
  isRecurring: boolean("isRecurring").default(false).notNull(), // 是否年度循环（生日提醒自动为true）
  birthMonth: int("birthMonth"), // 生日月份（1-12，仅生日提醒使用）
  birthDay: int("birthDay"), // 生日日期（1-31，仅生日提醒使用）
  notificationMethod: mysqlEnum("notificationMethod", ["in_app", "in_app_sound"]).default("in_app").notNull(), // 提醒方式：站内/站内+声音
  isCompleted: boolean("isCompleted").default(false).notNull(), // 是否已完成
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = typeof reminders.$inferInsert;

/**
 * 锻炼项目表 - 用户自定义的锻炼项目
 * 
 * 家长可以创建自己的锻炼项目，如跳绳、俯卧撑、仰卧起坐等
 */
export const exerciseTypes = mysqlTable("exercise_types", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // 创建者用户ID（家长）
  name: varchar("name", { length: 50 }).notNull(), // 项目名称，如"跳绳"、"俯卧撑"
  icon: varchar("icon", { length: 50 }).default("💪"), // 图标emoji
  isActive: boolean("isActive").default(true).notNull(), // 是否激活（软删除标记）
  sortOrder: int("sortOrder").default(0).notNull(), // 排序顺序
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExerciseType = typeof exerciseTypes.$inferSelect;
export type InsertExerciseType = typeof exerciseTypes.$inferInsert;

/**
 * 锻炼记录表 - 每天的锻炼计数记录
 * 
 * 记录每个锻炼项目每天的计数
 */
export const exerciseRecords = mysqlTable("exercise_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // 用户ID（宝宝）
  exerciseTypeId: int("exerciseTypeId").notNull(), // 锻炼项目ID
  count: int("count").notNull(), // 计数
  recordDate: date("recordDate").notNull(), // 记录日期（YYYY-MM-DD）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExerciseRecord = typeof exerciseRecords.$inferSelect;
export type InsertExerciseRecord = typeof exerciseRecords.$inferInsert;

/**
 * 家长密码表 - 用于验证家长身份
 * 
 * 每个家长用户可以设置一个独立的密码，用于进入锻炼计数页面和编辑数据
 */
export const parentPasswords = mysqlTable("parent_passwords", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // 家长用户ID
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(), // 密码哈希
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParentPassword = typeof parentPasswords.$inferSelect;
export type InsertParentPassword = typeof parentPasswords.$inferInsert;

/**
 * 用户功能权限表 - 控制每个用户可以访问哪些功能模块
 * 
 * 超级管理员可以为每个用户（家长/宝宝）开启或关闭特定功能
 * 功能包括：游戏、知识、逻辑、社交、健康（锻炼计数）等
 */
export const userFeaturePermissions = mysqlTable("user_feature_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // 用户ID
  featureKey: varchar("featureKey", { length: 50 }).notNull(), // 功能标识，如"exercise"、"games"、"knowledge"等
  isEnabled: boolean("isEnabled").default(true).notNull(), // 是否启用
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserFeaturePermission = typeof userFeaturePermissions.$inferSelect;
export type InsertUserFeaturePermission = typeof userFeaturePermissions.$inferInsert;


/**
 * 人脉共享连接表 - 记录用户之间的共享连接关系
 * 
 * 分享者（sharer）将自己的人脉数据共享给接收者（receiver）
 * 连接状态：pending（待确认）、active（已激活）、rejected（已拒绝）
 */
export const contactSharingConnections = mysqlTable("contact_sharing_connections", {
  id: int("id").autoincrement().primaryKey(),
  sharerId: int("sharerId").notNull(), // 分享者用户ID（提供数据的人）
  receiverId: int("receiverId").notNull(), // 接收者用户ID（查看数据的人）
  status: mysqlEnum("status", ["pending", "active", "rejected"]).default("pending").notNull(), // 连接状态
  note: text("note"), // 连接备注
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactSharingConnection = typeof contactSharingConnections.$inferSelect;
export type InsertContactSharingConnection = typeof contactSharingConnections.$inferInsert;

/**
 * 人脉共享字段权限表 - 配置分享者对每个接收者共享哪些字段
 * 
 * 默认全部共享，分享者可以取消勾选某些字段
 * 取消勾选的字段不会展示给接收者
 */
export const contactSharingPermissions = mysqlTable("contact_sharing_permissions", {
  id: int("id").autoincrement().primaryKey(),
  connectionId: int("connectionId").notNull(), // 关联的共享连接ID
  fieldName: varchar("fieldName", { length: 100 }).notNull(), // 字段名称（如：name, phone, wechat, tags等）
  isShared: boolean("isShared").default(true).notNull(), // 是否共享该字段
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactSharingPermission = typeof contactSharingPermissions.$inferSelect;
export type InsertContactSharingPermission = typeof contactSharingPermissions.$inferInsert;

/**
 * 待办事项表 - 用户的待办任务管理
 * 
 * 支持创建个人待办事项,也可以推送给其他已注册用户
 */
export const todos = mysqlTable("todos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // 待办事项所属用户ID
  creatorId: int("creatorId").notNull(), // 创建者用户ID
  title: varchar("title", { length: 200 }).notNull(), // 待办事项标题
  description: text("description"), // 待办事项详细描述
  dueDate: timestamp("dueDate"), // 截止日期
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(), // 优先级
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "cancelled"]).default("pending").notNull(), // 状态
  completedAt: timestamp("completedAt"), // 完成时间
  relatedContactId: int("relatedContactId"), // 关联的人脉ID(可选)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Todo = typeof todos.$inferSelect;
export type InsertTodo = typeof todos.$inferInsert;

/**
 * 企业报告表 - 存储企查查报告的 AI 格式化结果
 * 
 * 用于存储上传的企查查 PDF 报告，经过 DeepSeek AI 提取和格式化后的内容
 */
export const companyReports = mysqlTable("company_reports", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("company_name", { length: 255 }).notNull().unique(), // 公司名称（唯一）
  reportFileUrl: text("report_file_url"), // 原始 PDF 文件的 S3 URL
  rawText: longtext("raw_text"), // PDF 提取的原始文本（支持长文本）
  formattedContent: text("formatted_content").notNull(), // AI 格式化后的内容（JSON 格式）
  uploadedBy: int("uploaded_by"), // 上传者用户ID（可选）
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type CompanyReport = typeof companyReports.$inferSelect;
export type InsertCompanyReport = typeof companyReports.$inferInsert;


/**
 * 积分规则配置表 - 定义各种行为的积分奖励规则
 * 
 * 支持的行为类型：
 * - add_contact: 添加人脉
 * - add_tag: 打标签
 * - communication: 每次联络
 * - share_contact: 共享人脉
 * - be_referrer: 被别人加为推荐人
 */
export const pointRules = mysqlTable("point_rules", {
  id: int("id").autoincrement().primaryKey(),
  actionType: varchar("actionType", { length: 50 }).notNull().unique(), // 行为类型
  actionName: varchar("actionName", { length: 100 }).notNull(), // 行为名称（中文）
  points: int("points").default(0).notNull(), // 奖励积分值
  isActive: boolean("isActive").default(true).notNull(), // 是否启用
  description: text("description"), // 规则描述
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PointRule = typeof pointRules.$inferSelect;
export type InsertPointRule = typeof pointRules.$inferInsert;

/**
 * 积分变动记录表 - 记录所有积分变动
 * 
 * 记录类型：
 * - 自动奖励：用户完成特定行为自动获得积分
 * - 手动调整：管理员手动增加或减少积分
 */
export const pointLogs = mysqlTable("point_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // 用户ID
  actionType: varchar("actionType", { length: 50 }), // 行为类型（自动奖励时）
  points: int("points").notNull(), // 积分变动值（正数=增加，负数=减少）
  description: text("description").notNull(), // 变动描述
  operatorId: int("operatorId"), // 操作者ID（管理员手动调整时）
  relatedId: int("relatedId"), // 关联ID（联系人ID、标签ID等）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PointLog = typeof pointLogs.$inferSelect;
export type InsertPointLog = typeof pointLogs.$inferInsert;
