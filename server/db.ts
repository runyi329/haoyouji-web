import { eq, desc, asc, and, or, sql, isNull, isNotNull, like, inArray, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  childProfiles, InsertChildProfile,
  gameRecords, InsertGameRecord,
  knowledgeCategories, InsertKnowledgeCategory,
  knowledgeItems, InsertKnowledgeItem,
  albums, InsertAlbum,
  photos, InsertPhoto,
  photoComments, InsertPhotoComment,
  badges, InsertBadge,
  userBadges, InsertUserBadge,
  tasks, InsertTask,
  taskCompletions, InsertTaskCompletion,
  rewards, InsertReward,
  rewardRedemptions, InsertRewardRedemption,
  pointTransactions, InsertPointTransaction,
  antonyms, InsertAntonymPair, AntonymPair,
  wrongQuestions, InsertWrongQuestion, WrongQuestion,
  characters, InsertCharacter, Character,
  characterLearningRecords, InsertCharacterLearningRecord,
  flashcardRecords,
  brushingSessions, InsertBrushingSession, BrushingSession,
  familyFeatures, InsertFamilyFeature, FamilyFeature,
  homeBanner, InsertHomeBanner, HomeBanner,
  specialKids, InsertSpecialKid, starRewardRules, InsertStarRewardRule, starRewards, InsertStarReward, starShopItems, InsertStarShopItem, starRedemptions, InsertStarRedemption,
  addition20Config, InsertAddition20Config, Addition20Config,
  addition20Records, InsertAddition20Record, Addition20Record,
  addition20Challenges, InsertAddition20Challenge, Addition20Challenge,
  readingStories, InsertReadingStory, ReadingStory,
  readingRecords, InsertReadingRecord, ReadingRecord,
  vocabularyMaster, InsertVocabularyMaster, VocabularyMaster,
  familyVocabulary, InsertFamilyVocabulary, FamilyVocabulary,
  familyViConfig, InsertFamilyViConfig, FamilyViConfig,
  contactFieldCategories, InsertContactFieldCategory, ContactFieldCategory,
  contactFieldValues, InsertContactFieldValue, ContactFieldValue,
  contacts,
  featureDefinitions, InsertFeatureDefinition, FeatureDefinition,
  userFeatureOrder, InsertUserFeatureOrder, UserFeatureOrder,
  reminders, InsertReminder, Reminder,
  userPreferences, InsertUserPreference, UserPreference,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db) {
    // 优先使用原数据库 (ORIGINAL_DATABASE_URL)
    const dbUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
    
    if (dbUrl) {
      try {
        _db = drizzle(dbUrl);
        const dbType = process.env.ORIGINAL_DATABASE_URL ? "原数据库" : "Manus数据库";
        console.log(`[Database] 成功连接到${dbType}`);
      } catch (error) {
        console.warn("[Database] Failed to connect:", error);
        _db = null;
      }
    }
  }
  return _db;
}

// ==================== 用户相关 ====================
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "avatar"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      let value = user[field];
      if (value === undefined) return;
      
      // 将 'manus' loginMethod 映射为 'oauth' 以兼容原数据库的 enum 定义
      if (field === 'loginMethod' && value === 'manus') {
        value = 'oauth';
      }
      
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserPoints(userId: number, amount: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(users).set({ points: sql`points + ${amount}` }).where(eq(users.id, userId));
}

// ==================== 孩子档案相关 ====================
export async function createChildProfile(data: InsertChildProfile) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(childProfiles).values(data);
  return result[0].insertId;
}

export async function getChildrenByParent(parentId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(childProfiles).where(eq(childProfiles.parentId, parentId));
}

export async function getChildById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(childProfiles).where(eq(childProfiles.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateChildPoints(childId: number, amount: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(childProfiles).set({ points: sql`points + ${amount}` }).where(eq(childProfiles.id, childId));
}

// ==================== 游戏记录相关 ====================
export async function createGameRecord(data: InsertGameRecord) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(gameRecords).values(data);
  return result[0].insertId;
}

export async function getGameRecordsByUser(userId: number, gameType?: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  if (gameType) {
    return db.select().from(gameRecords)
      .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameType, gameType as any)))
      .orderBy(desc(gameRecords.completedAt));
  }
  return db.select().from(gameRecords)
    .where(eq(gameRecords.userId, userId))
    .orderBy(desc(gameRecords.completedAt));
}

export async function getTopScores(gameType: string, limit: number = 10) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(gameRecords)
    .where(eq(gameRecords.gameType, gameType as any))
    .orderBy(desc(gameRecords.score))
    .limit(limit);
}

// ==================== 知识分类相关 ====================
export async function createKnowledgeCategory(data: InsertKnowledgeCategory) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(knowledgeCategories).values(data);
  return result[0].insertId;
}

export async function getAllKnowledgeCategories() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(knowledgeCategories).orderBy(knowledgeCategories.sortOrder);
}

export async function updateKnowledgeCategory(id: number, data: Partial<InsertKnowledgeCategory>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(knowledgeCategories).set(data).where(eq(knowledgeCategories.id, id));
}

export async function deleteKnowledgeCategory(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(knowledgeCategories).where(eq(knowledgeCategories.id, id));
}

// ==================== 知识内容相关 ====================
export async function createKnowledgeItem(data: InsertKnowledgeItem) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(knowledgeItems).values(data);
  return result[0].insertId;
}

export async function getKnowledgeItemsByCategory(categoryId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(knowledgeItems)
    .where(and(eq(knowledgeItems.categoryId, categoryId), eq(knowledgeItems.isPublished, true)))
    .orderBy(desc(knowledgeItems.createdAt));
}

export async function getKnowledgeItemById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function incrementKnowledgeViewCount(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(knowledgeItems).set({ viewCount: sql`viewCount + 1` }).where(eq(knowledgeItems.id, id));
}

export async function updateKnowledgeItem(id: number, data: Partial<InsertKnowledgeItem>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(knowledgeItems).set(data).where(eq(knowledgeItems.id, id));
}

export async function deleteKnowledgeItem(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(knowledgeItems).where(eq(knowledgeItems.id, id));
}

// ==================== 相册相关 ====================
export async function createAlbum(data: InsertAlbum) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(albums).values(data);
  return result[0].insertId;
}

export async function getAlbumsByUser(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(albums).where(eq(albums.userId, userId)).orderBy(desc(albums.createdAt));
}

export async function getAllPublicAlbums() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(albums).orderBy(desc(albums.createdAt));
}

export async function getAlbumById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(albums).where(eq(albums.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateAlbum(id: number, data: Partial<InsertAlbum>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(albums).set(data).where(eq(albums.id, id));
}

export async function deleteAlbum(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(albums).where(eq(albums.id, id));
}

// ==================== 照片相关 ====================
export async function createPhoto(data: InsertPhoto) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(photos).values(data);
  return result[0].insertId;
}

export async function getPhotosByAlbum(albumId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(photos).where(eq(photos.albumId, albumId)).orderBy(desc(photos.createdAt));
}

export async function getPhotoById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updatePhoto(id: number, data: Partial<InsertPhoto>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(photos).set(data).where(eq(photos.id, id));
}

export async function deletePhoto(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(photos).where(eq(photos.id, id));
}

// ==================== 照片评论相关 ====================
export async function createPhotoComment(data: InsertPhotoComment) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(photoComments).values(data);
  return result[0].insertId;
}

export async function getCommentsByPhoto(photoId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(photoComments).where(eq(photoComments.photoId, photoId)).orderBy(desc(photoComments.createdAt));
}

// ==================== 勋章相关 ====================
export async function createBadge(data: InsertBadge) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(badges).values(data);
  return result[0].insertId;
}

export async function getAllBadges() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(badges);
}

export async function getBadgeById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(badges).where(eq(badges.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function awardBadge(data: InsertUserBadge) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(userBadges).values(data);
  return result[0].insertId;
}

export async function getUserBadges(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(userBadges).where(eq(userBadges.userId, userId));
}

// ==================== 任务相关 ====================
export async function createTask(data: InsertTask) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(tasks).values(data);
  return result[0].insertId;
}

export async function getTasksByCreator(createdBy: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.createdBy, createdBy)).orderBy(desc(tasks.createdAt));
}

export async function getActiveTasks() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.isActive, true));
}

export async function getTaskById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateTask(id: number, data: Partial<InsertTask>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(tasks).set(data).where(eq(tasks.id, id));
}

export async function completeTask(data: InsertTaskCompletion) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(taskCompletions).values(data);
  return result[0].insertId;
}

export async function getTaskCompletionsByUser(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(taskCompletions).where(eq(taskCompletions.userId, userId)).orderBy(desc(taskCompletions.completedAt));
}

// ==================== 奖品相关 ====================
export async function createReward(data: InsertReward) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(rewards).values(data);
  return result[0].insertId;
}

export async function getActiveRewards() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(rewards).where(eq(rewards.isActive, true));
}

export async function getRewardsByCreator(creatorId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(rewards).where(eq(rewards.createdBy, creatorId));
}

export async function getRewardById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(rewards).where(eq(rewards.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateReward(id: number, data: Partial<InsertReward>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(rewards).set(data).where(eq(rewards.id, id));
}

export async function deleteReward(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(rewards).where(eq(rewards.id, id));
}

export async function redeemReward(data: InsertRewardRedemption) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(rewardRedemptions).values(data);
  return result[0].insertId;
}

export async function getRedemptionsByUser(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(rewardRedemptions).where(eq(rewardRedemptions.userId, userId)).orderBy(desc(rewardRedemptions.redeemedAt));
}

export async function updateRedemptionStatus(id: number, status: "pending" | "approved" | "rejected" | "completed") {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(rewardRedemptions).set({ status, processedAt: new Date() }).where(eq(rewardRedemptions.id, id));
}

// ==================== 积分交易相关 ====================
export async function createPointTransaction(data: InsertPointTransaction) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(pointTransactions).values(data);
  return result[0].insertId;
}

export async function getPointTransactionsByUser(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(pointTransactions).where(eq(pointTransactions.userId, userId)).orderBy(desc(pointTransactions.createdAt));
}

// ==================== 初始化默认数据 ====================
export async function initializeDefaultData() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;

  // 检查是否已有分类
  const existingCategories = await getAllKnowledgeCategories();
  if (existingCategories.length === 0) {
    // 创建默认知识分类
    const defaultCategories = [
      { name: "动物世界", icon: "🦁", color: "#FF9500", description: "探索神奇的动物王国", sortOrder: 1 },
      { name: "植物花园", icon: "🌸", color: "#34C759", description: "认识美丽的植物世界", sortOrder: 2 },
      { name: "太空探索", icon: "🚀", color: "#5856D6", description: "遨游浩瀚的宇宙星空", sortOrder: 3 },
      { name: "科学实验", icon: "🔬", color: "#007AFF", description: "有趣的科学小实验", sortOrder: 4 },
      { name: "历史故事", icon: "📜", color: "#AF52DE", description: "精彩的历史小故事", sortOrder: 5 },
      { name: "艺术天地", icon: "🎨", color: "#FF2D55", description: "发现艺术的魅力", sortOrder: 6 },
    ];
    for (const cat of defaultCategories) {
      await createKnowledgeCategory(cat);
    }
  }

  // 检查是否已有勋章
  const existingBadges = await getAllBadges();
  if (existingBadges.length === 0) {
    // 创建默认勋章
    const defaultBadges = [
      { name: "初来乍到", icon: "🌟", color: "#FFD700", description: "完成首次登录", pointsRequired: 0 },
      { name: "游戏达人", icon: "🎮", color: "#FF6B6B", description: "完成10场游戏", pointsRequired: 100 },
      { name: "知识小博士", icon: "📚", color: "#4ECDC4", description: "阅读20篇知识", pointsRequired: 200 },
      { name: "记忆大师", icon: "🧠", color: "#9B59B6", description: "记忆游戏获得满分", pointsRequired: 150 },
      { name: "数学天才", icon: "🔢", color: "#3498DB", description: "数学游戏连续答对10题", pointsRequired: 180 },
      { name: "积分王者", icon: "👑", color: "#F1C40F", description: "累计获得1000积分", pointsRequired: 1000 },
    ];
    for (const badge of defaultBadges) {
      await createBadge(badge);
    }
  }
}


// ==================== 用户名密码登录相关 ====================
import { loginAttempts, InsertLoginAttempt } from "../drizzle/schema";

export async function getUserByUsername(username: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUserWithPassword(data: {
  username: string;
  passwordHash: string;
  name?: string;
  email?: string;
  role?: "super_admin" | "parent" | "baby";
}) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  // 生成唯一的openId用于兼容现有系统
  const openId = `local_${data.username}_${Date.now()}`;
  
  const result = await db.insert(users).values({
    openId,
    username: data.username,
    passwordHash: data.passwordHash,
    name: data.name || data.username,
    email: data.email,
    role: data.role || "parent",
    loginMethod: "password",
  });
  return result[0].insertId;
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function updateUserLoginAttempts(userId: number, attempts: number, lastFailed?: Date) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(users).set({
    failedLoginAttempts: attempts,
    lastFailedLogin: lastFailed,
  }).where(eq(users.id, userId));
}

export async function lockUser(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(users).set({ isLocked: true }).where(eq(users.id, userId));
}

export async function unlockUser(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(users).set({ isLocked: false, failedLoginAttempts: 0 }).where(eq(users.id, userId));
}

export async function recordLoginAttempt(data: InsertLoginAttempt) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(loginAttempts).values(data);
  return result[0].insertId;
}

export async function getRecentLoginAttempts(ipAddress: string, minutes: number = 30) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  return db.select().from(loginAttempts)
    .where(and(
      eq(loginAttempts.ipAddress, ipAddress),
      eq(loginAttempts.success, false),
      gte(loginAttempts.attemptedAt, cutoff)
    ));
}

export async function getAllUsers() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select({
    id: users.id,
    username: users.username,
    name: users.name,
    email: users.email,
    role: users.role,
    points: users.points,
    isLocked: users.isLocked,
    familyId: users.familyId,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: "super_admin" | "parent" | "baby") {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}


// ==================== 喜喜旺旺专属档案相关 ====================

export async function getSpecialKids() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  // 获取所有宝贝
  const kids = await db.select().from(specialKids).orderBy(specialKids.position);
  
  // 为每个宝贝补充 username、avatar 和 stars
  const result = await Promise.all(
    kids.map(async (kid) => {
      if (kid.userId) {
        const user = await db.select({ 
          username: users.username,
          avatar: users.avatar,
          points: users.points,
        }).from(users).where(eq(users.id, kid.userId)).limit(1);
        return {
          ...kid,
          username: user[0]?.username || null,
          avatar: user[0]?.avatar || kid.avatar,
          stars: user[0]?.points || kid.stars,
        };
      }
      return { ...kid, username: null };
    })
  );
  
  return result as any[];
}

export async function getSpecialKidById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(specialKids).where(eq(specialKids.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createSpecialKid(data: InsertSpecialKid) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(specialKids).values(data);
  const insertId = result[0].insertId;
  
  // 返回完整的宝宝对象
  const kid = await db.select().from(specialKids).where(eq(specialKids.id, insertId)).limit(1);
  return kid[0] || null;
}

export async function updateSpecialKid(id: number, data: Partial<InsertSpecialKid>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(specialKids).set(data).where(eq(specialKids.id, id));
}

export async function updateSpecialKidStars(kidId: number, amount: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(specialKids).set({ stars: sql`stars + ${amount}` }).where(eq(specialKids.id, kidId));
}

export async function deleteSpecialKid(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  // 先获取宝宝信息，找到关联的userId
  const kid = await db.select().from(specialKids).where(eq(specialKids.id, id)).limit(1);
  if (kid.length === 0) return;
  
  const userId = kid[0].userId;
  
  // 删除special_kids表中的记录
  await db.delete(specialKids).where(eq(specialKids.id, id));
  
  // 如果有关联的用户账户，也删除users表中的记录
  if (userId) {
    await db.delete(users).where(eq(users.id, userId));
  }
}

// ==================== 奖励规则相关 ====================
export async function getStarRewardRules() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(starRewardRules).orderBy(starRewardRules.activityType);
}

export async function getStarRewardRuleByType(activityType: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(starRewardRules).where(eq(starRewardRules.activityType, activityType)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createStarRewardRule(data: InsertStarRewardRule) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(starRewardRules).values(data);
  return result[0].insertId;
}

export async function updateStarRewardRule(id: number, data: Partial<InsertStarRewardRule>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(starRewardRules).set(data).where(eq(starRewardRules.id, id));
}

export async function deleteStarRewardRule(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(starRewardRules).where(eq(starRewardRules.id, id));
}

// ==================== 五角星奖励记录相关 ====================
export async function createStarReward(data: InsertStarReward) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(starRewards).values(data);
  // 同时更新孩子的星星总数
  await updateSpecialKidStars(data.kidId, data.starsEarned);
  return result[0].insertId;
}

export async function getStarRewardsByKid(kidId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(starRewards).where(eq(starRewards.kidId, kidId)).orderBy(desc(starRewards.createdAt));
}

// ==================== 星星商城相关 ====================
export async function getStarShopItems() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(starShopItems).where(eq(starShopItems.isActive, true)).orderBy(starShopItems.starsCost);
}

export async function getAllStarShopItems() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(starShopItems).orderBy(starShopItems.starsCost);
}

export async function getStarShopItemById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(starShopItems).where(eq(starShopItems.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createStarShopItem(data: InsertStarShopItem) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(starShopItems).values(data);
  return result[0].insertId;
}

export async function updateStarShopItem(id: number, data: Partial<InsertStarShopItem>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(starShopItems).set(data).where(eq(starShopItems.id, id));
}

export async function deleteStarShopItem(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(starShopItems).where(eq(starShopItems.id, id));
}

// ==================== 星星兑换记录相关 ====================
export async function createStarRedemption(data: InsertStarRedemption) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(starRedemptions).values(data);
  // 扣除孩子的星星
  await updateSpecialKidStars(data.kidId, -data.starsSpent);
  return result[0].insertId;
}

export async function getStarRedemptionsByKid(kidId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(starRedemptions).where(eq(starRedemptions.kidId, kidId)).orderBy(desc(starRedemptions.redeemedAt));
}

export async function getAllStarRedemptions() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(starRedemptions).orderBy(desc(starRedemptions.redeemedAt));
}

export async function updateStarRedemptionStatus(id: number, status: "pending" | "approved" | "rejected" | "completed") {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(starRedemptions).set({ status, processedAt: new Date() }).where(eq(starRedemptions.id, id));
}

// 初始化默认奖励规则
export async function initDefaultStarRewardRules() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  const defaultRules = [
    { activityType: "chess_win", activityName: "国际象棋获胜", starsReward: 5, description: "下国际象棋赢一局" },
    { activityType: "go_win", activityName: "围棋获胜", starsReward: 5, description: "下围棋赢一局" },
    { activityType: "gomoku_win", activityName: "五子棋获胜", starsReward: 3, description: "下五子棋赢一局" },
    { activityType: "ludo_win", activityName: "飞行棋获胜", starsReward: 3, description: "下飞行棋赢一局" },
    { activityType: "antonym_win", activityName: "反义词游戏获胜", starsReward: 1, description: "反义词游戏全部答对" },
    { activityType: "memory_complete", activityName: "记忆翻牌完成", starsReward: 2, description: "完成一局记忆翻牌游戏" },
    { activityType: "puzzle_complete", activityName: "拼图完成", starsReward: 2, description: "完成一局拼图游戏" },
    { activityType: "math_correct", activityName: "数学答对", starsReward: 1, description: "数学问答答对一题" },
    { activityType: "knowledge_read", activityName: "阅读知识", starsReward: 1, description: "阅读一篇知识文章" },
    { activityType: "brushing_complete", activityName: "完成刷牙", starsReward: 1, description: "完成一次刷牙任务" },
  ];
  
  for (const rule of defaultRules) {
    const existing = await getStarRewardRuleByType(rule.activityType);
    if (!existing) {
      await createStarRewardRule(rule);
    }
  }
}

// 初始化喵喵和旺旺
export async function initSpecialKids() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  const kids = await getSpecialKids();
  if (kids.length === 0) {
    await createSpecialKid({ name: "喵喵", position: "left", stars: 0 });
    await createSpecialKid({ name: "旺旺", position: "right", stars: 0 });
  }
}

// ==================== 反义词相关 ====================
export async function createAntonymPair(data: InsertAntonymPair) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  // 检查是否存在完全重复（word ↔ antonym）
  const exactDuplicate = await db.select().from(antonyms)
    .where(
      and(
        eq(antonyms.word, data.word),
        eq(antonyms.antonym, data.antonym),
        eq(antonyms.isActive, true)
      )
    );
  
  if (exactDuplicate.length > 0) {
    throw new Error(`反义词对 "${data.word} ↔ ${data.antonym}" 已存在`);
  }
  
  // 检查是否存在反向重复（antonym ↔ word）
  const reverseDuplicate = await db.select().from(antonyms)
    .where(
      and(
        eq(antonyms.word, data.antonym),
        eq(antonyms.antonym, data.word),
        eq(antonyms.isActive, true)
      )
    );
  
  if (reverseDuplicate.length > 0) {
    throw new Error(`反义词对 "${data.antonym} ↔ ${data.word}" 已存在（与 "${data.word} ↔ ${data.antonym}" 重复）`);
  }
  
  const result = await db.insert(antonyms).values(data);
  return result[0].insertId;
}

export async function getAllAntonymPairs() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.select().from(antonyms).where(eq(antonyms.isActive, true));
}

export async function getAntonymPairById(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(antonyms).where(eq(antonyms.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getRandomAntonymPairs(count: number, difficulty: 'beginner' | 'advanced' = 'beginner'): Promise<AntonymPair[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  const pairs = await db.select().from(antonyms).where(eq(antonyms.isActive, true));
  
  // 根据难度筛选字数：初级=1字，高级=2字
  const targetLength = difficulty === 'beginner' ? 1 : 2;
  const filteredPairs = pairs.filter(pair => pair.word.length === targetLength && pair.antonym.length === targetLength);
  
  const shuffled = filteredPairs.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export async function updateAntonymPair(id: number, data: Partial<InsertAntonymPair>) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(antonyms).set(data).where(eq(antonyms.id, id));
}

export async function deleteAntonymPair(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(antonyms).where(eq(antonyms.id, id));
}

// ==================== 错题本相关 ====================
export async function createWrongQuestion(data: InsertWrongQuestion) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  const result = await db.insert(wrongQuestions).values(data);
  return result;
}

export async function getWrongQuestionsByKid(kidId: number, gameType?: "math" | "antonym" | "character") {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  if (gameType) {
    return await db.select()
      .from(wrongQuestions)
      .where(and(eq(wrongQuestions.kidId, kidId), eq(wrongQuestions.gameType, gameType)))
      .orderBy(desc(wrongQuestions.createdAt));
  }
  
  return await db.select()
    .from(wrongQuestions)
    .where(eq(wrongQuestions.kidId, kidId))
    .orderBy(desc(wrongQuestions.createdAt));
}

export async function markWrongQuestionReviewed(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.update(wrongQuestions).set({ reviewed: true }).where(eq(wrongQuestions.id, id));
}

export async function deleteWrongQuestion(id: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  await db.delete(wrongQuestions).where(eq(wrongQuestions.id, id));
}

export async function getWrongQuestionStats(kidId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return { total: 0, math: 0, antonym: 0, character: 0, reviewed: 0 };
  
  const allQuestions = await db.select()
    .from(wrongQuestions)
    .where(eq(wrongQuestions.kidId, kidId));
  
  return {
    total: allQuestions.length,
    math: allQuestions.filter(q => q.gameType === 'math').length,
    antonym: allQuestions.filter(q => q.gameType === 'antonym').length,
    character: allQuestions.filter(q => q.gameType === 'character').length,
    reviewed: allQuestions.filter(q => q.reviewed).length,
  };
}


// ==================== 游戏排序偏好相关 ====================
import { gameOrderPreferences, InsertGameOrderPreference } from "../drizzle/schema";

export async function getGameOrderPreference(kidId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  const result = await db.select().from(gameOrderPreferences).where(eq(gameOrderPreferences.kidId, kidId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function saveGameOrderPreference(kidId: number, gameOrders: string[]) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const existing = await getGameOrderPreference(kidId);
  const gameOrdersJson = JSON.stringify(gameOrders);
  
  if (existing) {
    // 更新现有记录
    await db.update(gameOrderPreferences)
      .set({ gameOrders: gameOrdersJson, updatedAt: new Date() })
      .where(eq(gameOrderPreferences.kidId, kidId));
    return existing.id;
  } else {
    // 创建新记录
    const result = await db.insert(gameOrderPreferences).values({
      kidId,
      gameOrders: gameOrdersJson,
    });
    return result[0].insertId;
  }
}

// ==================== 汉字学习相关 ====================

/**
 * 获取随机汉字题目
 */
export async function getRandomCharacters(count: number, category?: string, difficulty?: number): Promise<Character[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];

  try {
    const conditions = [eq(characters.isActive, true)];

    if (category) {
      conditions.push(eq(characters.category, category));
    }

    if (difficulty) {
      conditions.push(eq(characters.difficulty, difficulty));
    }

    const allChars = await db
      .select()
      .from(characters)
      .where(and(...conditions));
    
    // 随机打乱并取前count个
    const shuffled = allChars.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  } catch (error) {
    console.error("[Database] Failed to get random characters:", error);
    return [];
  }
}

/**
 * 根据ID获取汉字
 */
export async function getCharacterById(id: number): Promise<Character | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1);
    
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get character by id:", error);
    return null;
  }
}

/**
 * 获取所有汉字（支持分页和筛选）
 */
export async function getAllCharacters(params?: {
  category?: string;
  difficulty?: number;
  limit?: number;
  offset?: number;
}): Promise<Character[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];

  try {
    const conditions = [eq(characters.isActive, true)];

    if (params?.category) {
      conditions.push(eq(characters.category, params.category));
    }

    if (params?.difficulty) {
      conditions.push(eq(characters.difficulty, params.difficulty));
    }

    const allResults = await db
      .select()
      .from(characters)
      .where(and(...conditions))
      .orderBy(desc(characters.createdAt));

    // 在内存中处理分页
    if (params?.offset || params?.limit) {
      const start = params?.offset || 0;
      const end = params?.limit ? start + params.limit : undefined;
      return allResults.slice(start, end);
    }

    return allResults;
  } catch (error) {
    console.error("[Database] Failed to get all characters:", error);
    return [];
  }
}

/**
 * 创建汉字
 */
export async function createCharacter(data: InsertCharacter): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");

  try {
    const result = await db.insert(characters).values(data);
    return Number(result[0].insertId);
  } catch (error) {
    console.error("[Database] Failed to create character:", error);
    throw error;
  }
}

/**
 * 更新汉字
 */
export async function updateCharacter(id: number, data: Partial<InsertCharacter>): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");

  try {
    await db
      .update(characters)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(characters.id, id));
  } catch (error) {
    console.error("[Database] Failed to update character:", error);
    throw error;
  }
}

/**
 * 删除汉字（软删除）
 */
export async function deleteCharacter(id: number): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");

  try {
    await db
      .update(characters)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(characters.id, id));
  } catch (error) {
    console.error("[Database] Failed to delete character:", error);
    throw error;
  }
}

/**
 * 记录汉字学习
 */
export async function recordCharacterLearning(data: InsertCharacterLearningRecord): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");

  try {
    const result = await db.insert(characterLearningRecords).values(data);
    return Number(result[0].insertId);
  } catch (error) {
    console.error("[Database] Failed to record character learning:", error);
    throw error;
  }
}

/**
 * 获取孩子的汉字学习记录
 */
export async function getCharacterLearningRecords(kidId: number, characterId?: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];

  try {
    if (characterId) {
      return await db
        .select()
        .from(characterLearningRecords)
        .where(
          and(
            eq(characterLearningRecords.kidId, kidId),
            eq(characterLearningRecords.characterId, characterId)
          )
        )
        .orderBy(desc(characterLearningRecords.createdAt));
    }

    return await db
      .select()
      .from(characterLearningRecords)
      .where(eq(characterLearningRecords.kidId, kidId))
      .orderBy(desc(characterLearningRecords.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get character learning records:", error);
    return [];
  }
}

/**
 * 获取汉字统计信息
 */
export async function getCharacterStats() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return { total: 0, byCategory: {}, byDifficulty: {} };

  try {
    // 获取所有活跃汉字
    const allCharacters = await db
      .select()
      .from(characters)
      .where(eq(characters.isActive, true));

    // 总数
    const total = allCharacters.length;

    // 按分类统计
    const byCategory: Record<string, number> = {};
    allCharacters.forEach((char) => {
      byCategory[char.category] = (byCategory[char.category] || 0) + 1;
    });

    // 按难度统计
    const byDifficulty: Record<number, number> = {};
    allCharacters.forEach((char) => {
      byDifficulty[char.difficulty] = (byDifficulty[char.difficulty] || 0) + 1;
    });

    return { total, byCategory, byDifficulty };
  } catch (error) {
    console.error("[Database] Failed to get character stats:", error);
    return { total: 0, byCategory: {}, byDifficulty: {} };
  }
}

/**
 * 获取或创建快闪识字记录
 */
export async function getOrCreateFlashcardRecord(kidId: number, characterId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;

  try {
    // 先查询是否存在
    const existing = await db
      .select()
      .from(flashcardRecords)
      .where(
        and(
          eq(flashcardRecords.kidId, kidId),
          eq(flashcardRecords.characterId, characterId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // 不存在则创建
    const [result] = await db.insert(flashcardRecords).values({
      kidId,
      characterId,
      knownCount: 0,
      forgottenCount: 0,
    });

    return await db
      .select()
      .from(flashcardRecords)
      .where(eq(flashcardRecords.id, Number(result.insertId)))
      .limit(1)
      .then((rows) => rows[0] || null);
  } catch (error) {
    console.error("[Database] Failed to get or create flashcard record:", error);
    return null;
  }
}

/**
 * 更新快闪识字记录（认识）
 */
export async function incrementFlashcardKnown(kidId: number, characterId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;

  try {
    // 先确保记录存在
    await getOrCreateFlashcardRecord(kidId, characterId);

    // 更新认识次数
    await db
      .update(flashcardRecords)
      .set({
        knownCount: sql`${flashcardRecords.knownCount} + 1`,
        lastInteraction: new Date(),
      })
      .where(
        and(
          eq(flashcardRecords.kidId, kidId),
          eq(flashcardRecords.characterId, characterId)
        )
      );
  } catch (error) {
    console.error("[Database] Failed to increment flashcard known:", error);
  }
}

/**
 * 更新快闪识字记录（忘记）
 */
export async function incrementFlashcardForgotten(kidId: number, characterId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;

  try {
    // 先确保记录存在
    await getOrCreateFlashcardRecord(kidId, characterId);

    // 更新忘记次数
    await db
      .update(flashcardRecords)
      .set({
        forgottenCount: sql`${flashcardRecords.forgottenCount} + 1`,
        lastInteraction: new Date(),
      })
      .where(
        and(
          eq(flashcardRecords.kidId, kidId),
          eq(flashcardRecords.characterId, characterId)
        )
      );
  } catch (error) {
    console.error("[Database] Failed to increment flashcard forgotten:", error);
  }
}

/**
 * 获取孩子的所有快闪识字记录
 */
export async function getFlashcardRecords(kidId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];

  try {
    return await db
      .select()
      .from(flashcardRecords)
      .where(eq(flashcardRecords.kidId, kidId))
      .orderBy(desc(flashcardRecords.lastInteraction));
  } catch (error) {
    console.error("[Database] Failed to get flashcard records:", error);
    return [];
  }
}

/**
 * 获取单个汉字的快闪识字记录
 */
export async function getFlashcardRecordByCharacter(kidId: number, characterId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;

  try {
    const records = await db
      .select()
      .from(flashcardRecords)
      .where(
        and(
          eq(flashcardRecords.kidId, kidId),
          eq(flashcardRecords.characterId, characterId)
        )
      )
      .limit(1);

    return records[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get flashcard record by character:", error);
    return null;
  }
}

// ==================== 刷牙记录相关 ====================

/**
 * 创建刷牙记录
 */
export async function createBrushingSession(session: InsertBrushingSession): Promise<BrushingSession | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;

  try {
    const result = await db.insert(brushingSessions).values(session);
    const insertedId = Number(result[0].insertId);
    
    // 返回插入的记录
    const records = await db
      .select()
      .from(brushingSessions)
      .where(eq(brushingSessions.id, insertedId))
      .limit(1);
    
    return records[0] || null;
  } catch (error) {
    console.error("[Database] Failed to create brushing session:", error);
    return null;
  }
}

/**
 * 获取孩子的刷牙记录列表
 */
export async function getBrushingSessions(kidId: number, limit: number = 10): Promise<BrushingSession[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];

  try {
    return await db
      .select()
      .from(brushingSessions)
      .where(eq(brushingSessions.kidId, kidId))
      .orderBy(desc(brushingSessions.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("[Database] Failed to get brushing sessions:", error);
    return [];
  }
}

/**
 * 获取孩子的刷牙统计信息
 */
export async function getBrushingStats(kidId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return { totalSessions: 0, totalDuration: 0, totalStars: 0 };

  try {
    const sessions = await db
      .select()
      .from(brushingSessions)
      .where(and(
        eq(brushingSessions.kidId, kidId),
        eq(brushingSessions.completed, true)
      ));
    
    const totalSessions = sessions.length;
    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
    const totalStars = sessions.reduce((sum, s) => sum + s.starsEarned, 0);
    
    return { totalSessions, totalDuration, totalStars };
  } catch (error) {
    console.error("[Database] Failed to get brushing stats:", error);
    return { totalSessions: 0, totalDuration: 0, totalStars: 0 };
  }
}


// ==================== 邀请码相关 ====================
import { invitations, InsertInvitation, Invitation, invitationUsages, families, InsertFamily } from "../drizzle/schema";
import { nanoid } from "nanoid";

/**
 * 生成随机邀请码
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除容易混淆的字符
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 创建邀请码
 */
export async function createInvitation(data: {
  familyName?: string;
  maxUses?: number;
  expiresAt?: Date;
  createdBy: number;
}): Promise<{ id: number; code: string } | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;

  try {
    const code = generateInviteCode();
    const result = await db.insert(invitations).values({
      code,
      familyName: data.familyName || null,
      maxUses: data.maxUses || 1,
      expiresAt: data.expiresAt || null,
      createdBy: data.createdBy,
    });
    return { id: Number(result[0].insertId), code };
  } catch (error) {
    console.error("[Database] Failed to create invitation:", error);
    return null;
  }
}

/**
 * 根据邀请码获取邀请信息
 */
export async function getInvitationByCode(code: string): Promise<Invitation | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(invitations)
      .where(eq(invitations.code, code))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get invitation by code:", error);
    return null;
  }
}

/**
 * 验证邀请码是否有效
 */
export async function validateInvitation(code: string): Promise<{
  valid: boolean;
  invitation?: Invitation;
  error?: string;
}> {
  const invitation = await getInvitationByCode(code);
  
  if (!invitation) {
    return { valid: false, error: "邀请码不存在" };
  }
  
  if (!invitation.isActive) {
    return { valid: false, error: "邀请码已失效" };
  }
  
  if (invitation.usedCount >= invitation.maxUses) {
    return { valid: false, error: "邀请码已达到使用上限" };
  }
  
  if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
    return { valid: false, error: "邀请码已过期" };
  }
  
  return { valid: true, invitation };
}

/**
 * 使用邀请码注册家长
 */
export async function useInvitationToRegister(data: {
  code: string;
  username: string;
  passwordHash: string;
  name?: string;
  email?: string;
}): Promise<{
  success: boolean;
  userId?: number;
  familyId?: number;
  error?: string;
}> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return { success: false, error: "数据库不可用" };

  try {
    // 验证邀请码
    const validation = await validateInvitation(data.code);
    if (!validation.valid || !validation.invitation) {
      return { success: false, error: validation.error };
    }
    
    const invitation = validation.invitation;
    
    // 检查用户名是否已存在
    const existingUser = await getUserByUsername(data.username);
    if (existingUser) {
      return { success: false, error: "用户名已存在" };
    }
    
    // 创建家庭
    const familyName = invitation.familyName || `${data.name || data.username}的家庭`;
    const familyResult = await db.insert(families).values({
      name: familyName,
      createdBy: 0, // 临时值，稍后更新
    });
    const familyId = Number(familyResult[0].insertId);
    
    // 创建用户（家长角色）
    const openId = `local_${nanoid()}`;
    const userResult = await db.insert(users).values({
      openId,
      username: data.username,
      passwordHash: data.passwordHash,
      name: data.name || data.username,
      email: data.email || null,
      loginMethod: 'password',
      role: 'parent',
      familyId,
    });
    const userId = Number(userResult[0].insertId);
    
    // 更新家庭的创建者
    await db.update(families).set({ createdBy: userId }).where(eq(families.id, familyId));
    
    // 更新邀请码使用次数
    await db.update(invitations)
      .set({ usedCount: invitation.usedCount + 1 })
      .where(eq(invitations.id, invitation.id));
    
    // 记录使用情况
    await db.insert(invitationUsages).values({
      invitationId: invitation.id,
      userId,
      familyId,
    });
    
    return { success: true, userId, familyId };
  } catch (error) {
    console.error("[Database] Failed to use invitation:", error);
    return { success: false, error: "注册失败，请稍后重试" };
  }
}

/**
 * 获取所有邀请码列表
 */
export async function getAllInvitations(): Promise<Invitation[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];

  try {
    return await db
      .select()
      .from(invitations)
      .orderBy(desc(invitations.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get all invitations:", error);
    return [];
  }
}

/**
 * 停用邀请码
 */
export async function deactivateInvitation(id: number): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;

  try {
    await db.update(invitations)
      .set({ isActive: false })
      .where(eq(invitations.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to deactivate invitation:", error);
    return false;
  }
}

/**
 * 获取所有家庭列表
 */
export async function getAllFamilies() {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];

  try {
    return await db
      .select()
      .from(families)
      .orderBy(desc(families.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get all families:", error);
    return [];
  }
}

/**
 * 获取家庭成员
 */
export async function getFamilyMembers(familyId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];

  try {
    return await db
      .select()
      .from(users)
      .where(eq(users.familyId, familyId))
      .orderBy(users.role, users.createdAt);
  } catch (error) {
    console.error("[Database] Failed to get family members:", error);
    return [];
  }
}


// ==================== 家长宝宝管理 ====================

/**
 * 获取家长的宝宝列表
 * 根据家长的familyId查询该家庭中的所有宝宝（specialKids表中的宝宝）
 */
export async function getKidsByParent(parentId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  // 直接通过special_kids.parentUserId查询该家长的所有宝宝
  const kids = await db.select({
    id: specialKids.id,
    userId: specialKids.userId,
    parentUserId: specialKids.parentUserId,
    name: specialKids.name,
    avatar: specialKids.avatar,
    stars: specialKids.stars,
    position: specialKids.position,
    createdAt: specialKids.createdAt,
    updatedAt: specialKids.updatedAt,
    username: users.username,
  }).from(specialKids)
    .leftJoin(users, eq(specialKids.userId, users.id))
    .where(eq(specialKids.parentUserId, parentId));
  
  return kids as any[];
}


/**
 * 为家长创建家庭
 */
export async function createFamilyForParent(parentId: number, familyName: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  // 创建family
  const result = await db.insert(families).values({
    name: familyName,
    createdBy: parentId,
  });
  
  const familyId = result[0].insertId;
  
  // 更新家长的familyId
  await db.update(users).set({ familyId }).where(eq(users.id, parentId));
  
  return familyId;
}

/**
 * 更新用户的家庭归属
 */
export async function updateUserFamily(userId: number, familyId: number | null) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.update(users).set({ familyId }).where(eq(users.id, userId));
}

/**
 * 更新用户关系：关联家长和宝宝
 * @param userId - 要编辑的用户ID
 * @param relatedUserId - 要关联的用户ID（家长或宝宝）
 * @param relationType - 关系类型：'parent'(关联到家长) 或 'child'(关联到宝宝)
 */
export async function updateUserRelation(
  userId: number,
  relatedUserId: number | null,
  relationType: 'parent' | 'child'
) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;

  // 获取目标用户
  const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
  if (!targetUser) {
    throw new Error("用户不存在");
  }

  if (relatedUserId === null) {
    // 解除关系
    await db.update(users).set({ familyId: null }).where(eq(users.id, userId));
    return;
  }

  // 获取关联用户
  const [relatedUser] = await db.select().from(users).where(eq(users.id, relatedUserId));
  if (!relatedUser) {
    throw new Error("关联用户不存在");
  }

  if (relationType === 'parent') {
    // 宝宝关联到家长：使用家长的familyId
    if (relatedUser.role !== 'parent') {
      throw new Error("只能关联到家长账户");
    }
    
    // 如果家长还没有家庭，自动创建一个
    let parentFamilyId = relatedUser.familyId;
    if (!parentFamilyId) {
      const familyName = `${relatedUser.name || relatedUser.username}的家庭`;
      parentFamilyId = await createFamilyForParent(relatedUser.id, familyName);
    }
    
    await db.update(users).set({ familyId: parentFamilyId }).where(eq(users.id, userId));
  } else {
    // 家长关联到宝宝：将宝宝的familyId设置为家长的familyId
    if (targetUser.role !== 'parent') {
      throw new Error("只有家长账户可以关联宝宝");
    }
    if (relatedUser.role !== 'baby') {
      throw new Error("只能关联到宝宝账户");
    }
    
    // 如果家长还没有家庭，自动创建一个
    let parentFamilyId = targetUser.familyId;
    if (!parentFamilyId) {
      const familyName = `${targetUser.name || targetUser.username}的家庭`;
      parentFamilyId = await createFamilyForParent(targetUser.id, familyName);
    }
    
    // 将宝宝的familyId设置为家长的familyId（支持一个家长绑定多个宝宝）
    await db.update(users).set({ familyId: parentFamilyId }).where(eq(users.id, relatedUserId));
  }
}

/**
 * 批量删除用户
 */
export async function deleteUsers(userIds: number[]) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  // 删除用户记录
  await db.delete(users).where(inArray(users.id, userIds));
}

/**
 * 更新用户基本信息（用户名和昵称）
 */
export async function updateUserInfo(userId: number, data: { username?: string; name?: string }) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  const updateData: any = {};
  if (data.username !== undefined) updateData.username = data.username;
  if (data.name !== undefined) updateData.name = data.name;
  
  await db.update(users).set(updateData).where(eq(users.id, userId));
}

// ==================== 家庭功能权限相关 ====================

/**
 * 获取家庭的所有子功能权限
 */
export async function getFamilyFeatures(familyId: number): Promise<FamilyFeature[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return await db.select().from(familyFeatures).where(eq(familyFeatures.familyId, familyId));
}

/**
 * 获取家庭某个主功能下的所有子功能
 */
export async function getFamilyFeaturesByName(familyId: number, featureName: string): Promise<FamilyFeature[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return await db.select().from(familyFeatures)
    .where(and(
      eq(familyFeatures.familyId, familyId),
      eq(familyFeatures.featureName, featureName)
    ));
}

/**
 * 更新或创建子功能权限
 */
export async function upsertFamilyFeature(feature: InsertFamilyFeature): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  const existing = await db.select().from(familyFeatures)
    .where(and(
      eq(familyFeatures.familyId, feature.familyId),
      eq(familyFeatures.featureName, feature.featureName),
      eq(familyFeatures.subFeatureName, feature.subFeatureName)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    await db.update(familyFeatures)
      .set({
        enabled: feature.enabled,
        settings: feature.settings,
        updatedAt: new Date()
      })
      .where(eq(familyFeatures.id, existing[0].id));
  } else {
    await db.insert(familyFeatures).values(feature);
  }
}

/**
 * 批量更新家庭的子功能权限
 */
export async function batchUpdateFamilyFeatures(familyId: number, features: Array<{
  featureName: string;
  subFeatureName: string;
  enabled: boolean;
  settings?: any;
}>): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  for (const feature of features) {
    await upsertFamilyFeature({
      familyId,
      featureName: feature.featureName,
      subFeatureName: feature.subFeatureName,
      enabled: feature.enabled,
      settings: feature.settings
    });
  }
}

/**
 * 根据功能ID获取家庭的功能权限状态
 * @param familyId 家庭ID
 * @param featureId 功能ID（如"parent.vocabulary.photo"）
 */
export async function getFamilyFeatureByPath(familyId: number, path: string): Promise<FamilyFeature | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const result = await db.select().from(familyFeatures)
    .where(and(
      eq(familyFeatures.familyId, familyId),
      eq(familyFeatures.path, path)
    ))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

/**
 * 批量插入或更新功能权限（用于同步功能树）
 * @param familyId 家庭ID
 * @param features 功能列表
 */
export async function syncFamilyFeatures(familyId: number, features: Array<{
  featureName: string;
  subFeatureName: string;
  parentFeature: string | null;
  level: number;
  path: string;
  displayOrder: number;
  enabled: boolean;
}>): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  for (const feature of features) {
    const existing = await db.select().from(familyFeatures)
      .where(and(
        eq(familyFeatures.familyId, familyId),
        eq(familyFeatures.path, feature.path)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      // 更新现有记录（保留enabled状态）
      await db.update(familyFeatures)
        .set({
          featureName: feature.featureName,
          subFeatureName: feature.subFeatureName,
          parentFeature: feature.parentFeature,
          level: feature.level,
          displayOrder: feature.displayOrder,
          updatedAt: new Date()
        })
        .where(eq(familyFeatures.id, existing[0].id));
    } else {
      // 插入新记录
      await db.insert(familyFeatures).values({
        familyId,
        featureName: feature.featureName,
        subFeatureName: feature.subFeatureName,
        parentFeature: feature.parentFeature,
        level: feature.level,
        path: feature.path,
        displayOrder: feature.displayOrder,
        enabled: feature.enabled
      });
    }
  }
}

/**
 * 批量更新功能权限状态（按path）
 * @param familyId 家庭ID
 * @param updates 更新列表：{ path: string, enabled: boolean }[]
 */
export async function batchUpdateFeaturesByPath(familyId: number, updates: Array<{
  path: string;
  enabled: boolean;
}>): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  for (const update of updates) {
    await db.update(familyFeatures)
      .set({
        enabled: update.enabled,
        updatedAt: new Date()
      })
      .where(and(
        eq(familyFeatures.familyId, familyId),
        eq(familyFeatures.path, update.path)
      ));
  }
}

/**
 * 检查家庭是否有某个功能的权限
 * 
 * 注意：功能树的权限检查逻辑：
 * - 一级功能（如"社交"、"游戏"）是大模块，始终显示，不需要检查权限
 * - 二级功能（如"好友记"、"相册"）需要检查自身权限，不检查父级
 * - 三级及以下功能需要检查自身和父级权限
 * 
 * @param familyId 家庭ID
 * @param path 功能路径
 * @returns 是否有权限
 */
export async function checkFeaturePermission(familyId: number, path: string): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  // 查询当前功能的权限
  const feature = await getFamilyFeatureByPath(familyId, path);
  if (!feature) return false;
  if (!feature.enabled) return false;
  
  // 计算当前功能的层级（通过路径中的/数量判断）
  const level = path.split('/').length;
  
  // 一级功能（如"社交"）始终返回true，因为大模块始终显示
  if (level === 1) {
    return true;
  }
  
  // 二级功能（如"社交/好友记"）只检查自身权限，不检查父级
  if (level === 2) {
    return feature.enabled;
  }
  
  // 三级及以下功能需要检查父级权限
  if (feature.parentFeature) {
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    return await checkFeaturePermission(familyId, parentPath);
  }
  
  return true;
}

/**
 * 获取所有家长用户（用于超级管理员账户管理）
 */
export async function getAllParents(): Promise<any[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return await db.select({
    id: users.id,
    name: users.name,
    username: users.username,
    email: users.email,
    familyId: users.familyId,
    createdAt: users.createdAt
  })
  .from(users)
  .where(eq(users.role, 'parent'));
}

// ==================== 首页横幅 ====================

/**
 * 获取当前活跃的首页横幅
 */
export async function getActiveHomeBanner(): Promise<HomeBanner | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const result = await db.select()
    .from(homeBanner)
    .where(eq(homeBanner.isActive, true))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

/**
 * 更新首页横幅（如果不存在则创建）
 */
export async function upsertHomeBanner(data: {
  title?: string;
  description?: string;
  imageUrl?: string;
}): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  const existing = await db.select().from(homeBanner).limit(1);
  
  if (existing.length > 0) {
    await db.update(homeBanner)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(homeBanner.id, existing[0].id));
  } else {
    await db.insert(homeBanner).values({
      ...data,
      isActive: true
    });
  }
}

/**
 * 获取首页横幅（包括未启用的）
 */
export async function getHomeBanner(): Promise<HomeBanner | undefined> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  
  const result = await db.select().from(homeBanner).limit(1);
  return result.length > 0 ? result[0] : undefined;
}


// ==================== 20加法游戏相关 ====================

/**
 * 获取孩子的20加法游戏配置
 */
export async function getAddition20Config(kidId: number): Promise<Addition20Config | undefined> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  
  const result = await db.select()
    .from(addition20Config)
    .where(eq(addition20Config.kidId, kidId))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

/**
 * 保存或更新孩子的20加法游戏配置
 */
export async function upsertAddition20Config(data: {
  kidId: number;
  difficulty?: "easy" | "medium" | "hard";
  questionCount?: number;
  answerMode?: "choice" | "input";
}): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  const existing = await getAddition20Config(data.kidId);
  
  if (existing) {
    await db.update(addition20Config)
      .set({
        difficulty: data.difficulty ?? existing.difficulty,
        questionCount: data.questionCount ?? existing.questionCount,
        answerMode: data.answerMode ?? existing.answerMode,
        updatedAt: new Date()
      })
      .where(eq(addition20Config.kidId, data.kidId));
  } else {
    await db.insert(addition20Config).values({
      kidId: data.kidId,
      difficulty: data.difficulty ?? "easy",
      questionCount: data.questionCount ?? 10,
      answerMode: data.answerMode ?? "choice"
    });
  }
}

/**
 * 保存20加法游戏记录
 */
export async function saveAddition20Record(data: InsertAddition20Record): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(addition20Records).values(data);
  return Number(result[0].insertId);
}

/**
 * 获取孩子的20加法游戏记录
 */
export async function getAddition20Records(kidId: number, limit: number = 10): Promise<Addition20Record[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return await db.select()
    .from(addition20Records)
    .where(eq(addition20Records.kidId, kidId))
    .orderBy(desc(addition20Records.createdAt))
    .limit(limit);
}

/**
 * 获取孩子的20加法游戏最高分
 */
export async function getAddition20HighScore(kidId: number): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  const records = await db.select()
    .from(addition20Records)
    .where(eq(addition20Records.kidId, kidId))
    .orderBy(desc(addition20Records.correctCount))
    .limit(1);
  
  return records.length > 0 ? records[0].correctCount : 0;
}


// ==================== 20加法有奖挑战相关 ====================

/**
 * 创建有奖挑战
 */
export async function createAddition20Challenge(data: InsertAddition20Challenge): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(addition20Challenges).values(data);
  return Number(result[0].insertId);
}

/**
 * 获取孩子的活跃挑战
 */
export async function getActiveAddition20Challenge(kidId: number): Promise<Addition20Challenge | undefined> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return undefined;
  
  const result = await db.select()
    .from(addition20Challenges)
    .where(and(
      eq(addition20Challenges.kidId, kidId),
      eq(addition20Challenges.status, "active")
    ))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

/**
 * 更新挑战进度
 */
export async function updateAddition20ChallengeProgress(
  challengeId: number,
  data: {
    currentCorrectCount?: number;
    totalAttempted?: number;
    totalCorrect?: number;
    totalWrong?: number;
    lastPlayedAt?: Date;
  }
): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  // 确俜currentCorrectCount不会为负数
  const updateData = { ...data };
  if (updateData.currentCorrectCount !== undefined && updateData.currentCorrectCount < 0) {
    updateData.currentCorrectCount = 0;
  }
  
  await db.update(addition20Challenges)
    .set({
      ...updateData,
      updatedAt: new Date()
    })
    .where(eq(addition20Challenges.id, challengeId));
}

/**
 * 完成挑战
 */
export async function completeAddition20Challenge(challengeId: number): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.update(addition20Challenges)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(addition20Challenges.id, challengeId));
}

/**
 * 暂停挑战（休息保存）
 */
export async function pauseAddition20Challenge(challengeId: number): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.update(addition20Challenges)
    .set({
      status: "paused",
      lastPlayedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(addition20Challenges.id, challengeId));
}

/**
 * 恢复挑战
 */
export async function resumeAddition20Challenge(challengeId: number): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.update(addition20Challenges)
    .set({
      status: "active",
      updatedAt: new Date()
    })
    .where(eq(addition20Challenges.id, challengeId));
}

/**
 * 取消/放弃挑战
 */
export async function cancelAddition20Challenge(challengeId: number): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  const now = new Date();
  await db.update(addition20Challenges)
    .set({
      status: "cancelled",
      completedAt: now
    })
    .where(eq(addition20Challenges.id, challengeId));
}

/**
 * 获取孩子的挑战历史
 */
export async function getAddition20ChallengeHistory(kidId: number, limit: number = 10): Promise<Addition20Challenge[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return await db.select()
    .from(addition20Challenges)
    .where(eq(addition20Challenges.kidId, kidId))
    .orderBy(desc(addition20Challenges.createdAt))
    .limit(limit);
}

// ==================== 阅读识字游戏相关函数 ====================

/**
 * 获取所有故事列表（包括模板和自定义）
 */
export async function getReadingStories(kidId?: number): Promise<ReadingStory[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  // 获取模板故事和该孩子的自定义故事
  if (kidId) {
    return await db.select()
      .from(readingStories)
      .where(
        or(
          eq(readingStories.type, "template"),
          eq(readingStories.kidId, kidId)
        )
      )
      .orderBy(desc(readingStories.createdAt));
  }
  
  // 只获取模板故事
  return await db.select()
    .from(readingStories)
    .where(eq(readingStories.type, "template"))
    .orderBy(desc(readingStories.createdAt));
}

/**
 * 获取单个故事详情
 */
export async function getReadingStoryById(id: number): Promise<ReadingStory | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const stories = await db.select()
    .from(readingStories)
    .where(eq(readingStories.id, id))
    .limit(1);
  
  return stories[0] || null;
}

/**
 * 创建自定义故事
 */
export async function createReadingStory(data: {
  title: string;
  content: string;
  type: "template" | "custom" | "ai_generated";
  coverImageUrl?: string;
  createdBy?: number;
  kidId?: number;
}): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  const wordCount = data.content.length;
  
  const result = await db.insert(readingStories).values({
    title: data.title,
    content: data.content,
    type: data.type,
    coverImageUrl: data.coverImageUrl,
    createdBy: data.createdBy,
    kidId: data.kidId,
    wordCount,
    isActive: true,
  });
  
  return Number((result as any).insertId || result[0]?.insertId || 0);
}

/**
 * 更新故事内容
 */
export async function updateReadingStory(id: number, data: {
  title?: string;
  content?: string;
}): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  const updateData: any = {};
  if (data.title) updateData.title = data.title;
  if (data.content) {
    updateData.content = data.content;
    updateData.wordCount = data.content.length;
  }
  
  await db.update(readingStories)
    .set(updateData)
    .where(eq(readingStories.id, id));
}

/**
 * 删除故事
 */
export async function deleteReadingStory(id: number): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.delete(readingStories)
    .where(eq(readingStories.id, id));
}

/**
 * 创建阅读记录
 */
export async function createReadingRecord(data: {
  kidId: number;
  storyId: number;
}): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  const result = await db.insert(readingRecords).values({
    kidId: data.kidId,
    storyId: data.storyId,
    clickCount: 0,
    readDuration: 0,
  });
  
  return Number((result as any).insertId || result[0]?.insertId || 0);
}

/**
 * 更新阅读记录
 */
export async function updateReadingRecord(id: number, data: {
  clickCount?: number;
  readDuration?: number;
  completedAt?: Date;
}): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.update(readingRecords)
    .set(data)
    .where(eq(readingRecords.id, id));
}

/**
 * 获取孩子的阅读记录
 */
export async function getReadingRecords(kidId: number, limit: number = 20): Promise<ReadingRecord[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return await db.select()
    .from(readingRecords)
    .where(eq(readingRecords.kidId, kidId))
    .orderBy(desc(readingRecords.createdAt))
    .limit(limit);
}

// ==================== 词库相关 ====================

/**
 * 获取总词库列表（支持筛选）
 */
export async function getVocabularyMasterList(filters?: {
  language?: "chinese" | "english";
  category?: string;
  difficulty?: "easy" | "medium" | "hard";
  search?: string;
}): Promise<VocabularyMaster[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  try {
    const conditions = [eq(vocabularyMaster.isActive, true)];
    
    if (filters?.language) {
      conditions.push(eq(vocabularyMaster.language, filters.language));
    }
    if (filters?.category) {
      conditions.push(eq(vocabularyMaster.category, filters.category));
    }
    if (filters?.difficulty) {
      conditions.push(eq(vocabularyMaster.difficulty, filters.difficulty));
    }
    if (filters?.search) {
      conditions.push(
        or(
          like(vocabularyMaster.word, `%${filters.search}%`),
          like(vocabularyMaster.translation, `%${filters.search}%`)
        )!
      );
    }
    
    const result = await db.select().from(vocabularyMaster).where(and(...conditions));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get vocabulary master list:", error);
    return [];
  }
}

/**
 * 根据ID获取总词库词汇
 */
export async function getVocabularyMasterById(id: number): Promise<VocabularyMaster | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  try {
    const result = await db.select().from(vocabularyMaster).where(eq(vocabularyMaster.id, id)).limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get vocabulary master by id:", error);
    return null;
  }
}

/**
 * 根据词汇和语言查找总词库中的词汇
 */
export async function findVocabularyMasterByWord(word: string, language: "chinese" | "english"): Promise<VocabularyMaster | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  try {
    const result = await db.select().from(vocabularyMaster)
      .where(and(
        eq(vocabularyMaster.word, word),
        eq(vocabularyMaster.language, language)
      ))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to find vocabulary master by word:", error);
    return null;
  }
}

/**
 * 创建总词库词汇
 */
export async function createVocabularyMaster(data: InsertVocabularyMaster): Promise<VocabularyMaster | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  try {
    const result = await db.insert(vocabularyMaster).values(data);
    const insertId = Number(result[0].insertId);
    return await getVocabularyMasterById(insertId);
  } catch (error) {
    console.error("[Database] Failed to create vocabulary master:", error);
    return null;
  }
}

/**
 * 更新总词库词汇
 */
export async function updateVocabularyMaster(id: number, data: Partial<InsertVocabularyMaster>): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  try {
    await db.update(vocabularyMaster).set(data).where(eq(vocabularyMaster.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update vocabulary master:", error);
    return false;
  }
}

/**
 * 删除总词库词汇（软删除）
 */
export async function deleteVocabularyMaster(id: number): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  try {
    await db.update(vocabularyMaster).set({ isActive: false }).where(eq(vocabularyMaster.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete vocabulary master:", error);
    return false;
  }
}

/**
 * 获取家庭词库列表
 */
export async function getFamilyVocabularyList(parentUserId: number, language?: "chinese" | "english", kidId?: number | null, wordType?: "character" | "word"): Promise<Array<any>> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  try {
    const conditions = [
      eq(familyVocabulary.parentUserId, parentUserId),
      eq(vocabularyMaster.isActive, true)
    ];
    
    if (language) {
      conditions.push(eq(vocabularyMaster.language, language));
    }
    
    // 根据kidId过滤
    if (kidId !== undefined) {
      if (kidId === null) {
        conditions.push(isNull(familyVocabulary.kidId));
      } else {
        conditions.push(eq(familyVocabulary.kidId, kidId));
      }
    }
    
    // 根据wordType过滤
    if (wordType) {
      conditions.push(eq(vocabularyMaster.wordType, wordType));
    }
    
    const result = await db.select({
      id: familyVocabulary.id,
      parentUserId: familyVocabulary.parentUserId,
      vocabularyId: familyVocabulary.vocabularyId,
      addedBy: familyVocabulary.addedBy,
      customNote: familyVocabulary.customNote,
      masteryLevel: familyVocabulary.masteryLevel,
      createdAt: familyVocabulary.createdAt,
      vocabulary: {
        id: vocabularyMaster.id,
        word: vocabularyMaster.word,
        language: vocabularyMaster.language,
        translation: vocabularyMaster.translation,
        pinyin: vocabularyMaster.pinyin,
        pronunciation: vocabularyMaster.pronunciation,
        category: vocabularyMaster.category,
        difficulty: vocabularyMaster.difficulty,
        example: vocabularyMaster.example,
        imageUrl: vocabularyMaster.imageUrl,
        audioUrl: vocabularyMaster.audioUrl,
        isActive: vocabularyMaster.isActive,
        createdAt: vocabularyMaster.createdAt,
        updatedAt: vocabularyMaster.updatedAt,
      },
    })
    .from(familyVocabulary)
    .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
    .where(and(...conditions));
    
    return result;
  } catch (error) {
    console.error("[Database] Failed to get family vocabulary list:", error);
    return [];
  }
}

/**
 * 添加词汇到家庭词库
 */
export async function addVocabularyToFamily(data: InsertFamilyVocabulary): Promise<FamilyVocabulary | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  try {
    // 检查是否已存在（同一家长、同一词汇、同一宝宝）
    const conditions = [
      eq(familyVocabulary.parentUserId, data.parentUserId),
      eq(familyVocabulary.vocabularyId, data.vocabularyId),
    ];
    
    if (data.kidId !== undefined) {
      conditions.push(data.kidId === null ? isNull(familyVocabulary.kidId) : eq(familyVocabulary.kidId, data.kidId));
    }
    
    const existing = await db.select().from(familyVocabulary)
      .where(and(...conditions))
      .limit(1);
    
    if (existing.length > 0) {
      return existing[0];
    }
    
    const result = await db.insert(familyVocabulary).values(data);
    const insertId = Number(result[0].insertId);
    const newRecord = await db.select().from(familyVocabulary).where(eq(familyVocabulary.id, insertId)).limit(1);
    return newRecord[0] || null;
  } catch (error) {
    console.error("[Database] Failed to add vocabulary to family:", error);
    return null;
  }
}

/**
 * 从家庭词库删除词汇
 */
export async function removeVocabularyFromFamily(parentUserId: number, vocabularyId: number): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  try {
    await db.delete(familyVocabulary).where(and(
      eq(familyVocabulary.parentUserId, parentUserId),
      eq(familyVocabulary.vocabularyId, vocabularyId)
    ));
    return true;
  } catch (error) {
    console.error("[Database] Failed to remove vocabulary from family:", error);
    return false;
  }
}

/**
 * 更新家庭词库备注
 */
export async function updateFamilyVocabularyNote(parentUserId: number, vocabularyId: number, customNote: string): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  try {
    await db.update(familyVocabulary)
      .set({ customNote })
      .where(and(
        eq(familyVocabulary.parentUserId, parentUserId),
        eq(familyVocabulary.vocabularyId, vocabularyId)
      ));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update family vocabulary note:", error);
    return false;
  }
}

/**
 * 更新家庭词库学习进度
 */
export async function updateFamilyVocabularyMasteryLevel(parentUserId: number, vocabularyId: number, masteryLevel: "not_started" | "learning" | "mastered"): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  try {
    await db.update(familyVocabulary)
      .set({ masteryLevel })
      .where(and(
        eq(familyVocabulary.parentUserId, parentUserId),
        eq(familyVocabulary.vocabularyId, vocabularyId)
      ));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update family vocabulary mastery level:", error);
    return false;
  }
}

/**
 * 获取家庭词库统计数据
 */
export async function getFamilyVocabularyStats(parentUserId: number, kidId?: number | null): Promise<{
  totalCount: number;
  chineseCount: number;
  englishCount: number;
  chineseCharCount: number;
  chineseWordCount: number;
  recentAddedCount: number;
  notStartedCount: number;
  learningCount: number;
  masteredCount: number;
}> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return {
    totalCount: 0,
    chineseCount: 0,
    englishCount: 0,
    chineseCharCount: 0,
    chineseWordCount: 0,
    recentAddedCount: 0,
    notStartedCount: 0,
    learningCount: 0,
    masteredCount: 0,
  };
  
  try {
    const baseConditions = [
      eq(familyVocabulary.parentUserId, parentUserId),
      eq(vocabularyMaster.isActive, true)
    ];
    
    // 根据kidId过滤
    if (kidId !== undefined) {
      if (kidId === null) {
        baseConditions.push(isNull(familyVocabulary.kidId));
      } else {
        baseConditions.push(eq(familyVocabulary.kidId, kidId));
      }
    }
    
    // 获取总词汇量
    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(familyVocabulary)
      .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
      .where(and(...baseConditions));
    const totalCount = Number(totalResult[0]?.count || 0);
    
    // 获取中文词汇量
    const chineseResult = await db.select({ count: sql<number>`count(*)` })
      .from(familyVocabulary)
      .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
      .where(and(...baseConditions, eq(vocabularyMaster.language, "chinese")));
    const chineseCount = Number(chineseResult[0]?.count || 0);
    
    // 获取英文词汇量
    const englishResult = await db.select({ count: sql<number>`count(*)` })
      .from(familyVocabulary)
      .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
      .where(and(...baseConditions, eq(vocabularyMaster.language, "english")));
    const englishCount = Number(englishResult[0]?.count || 0);
    
    // 获取中文字数量
    const chineseCharResult = await db.select({ count: sql<number>`count(*)` })
      .from(familyVocabulary)
      .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
      .where(and(...baseConditions, eq(vocabularyMaster.language, "chinese"), eq(vocabularyMaster.wordType, "character")));
    const chineseCharCount = Number(chineseCharResult[0]?.count || 0);
    
    // 获取中文词数量
    const chineseWordResult = await db.select({ count: sql<number>`count(*)` })
      .from(familyVocabulary)
      .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
      .where(and(...baseConditions, eq(vocabularyMaster.language, "chinese"), eq(vocabularyMaster.wordType, "word")));
    const chineseWordCount = Number(chineseWordResult[0]?.count || 0);
    
    // 获取近7天新增词汇量
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentResult = await db.select({ count: sql<number>`count(*)` })
      .from(familyVocabulary)
      .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
      .where(and(...baseConditions, gte(familyVocabulary.createdAt, sevenDaysAgo)));
    const recentAddedCount = Number(recentResult[0]?.count || 0);
    
    // 获取学习进度统计
    const notStartedResult = await db.select({ count: sql<number>`count(*)` })
      .from(familyVocabulary)
      .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
      .where(and(...baseConditions, eq(familyVocabulary.masteryLevel, "not_started")));
    const notStartedCount = Number(notStartedResult[0]?.count || 0);
    
    const learningResult = await db.select({ count: sql<number>`count(*)` })
      .from(familyVocabulary)
      .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
      .where(and(...baseConditions, eq(familyVocabulary.masteryLevel, "learning")));
    const learningCount = Number(learningResult[0]?.count || 0);
    
    const masteredResult = await db.select({ count: sql<number>`count(*)` })
      .from(familyVocabulary)
      .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
      .where(and(...baseConditions, eq(familyVocabulary.masteryLevel, "mastered")));
    const masteredCount = Number(masteredResult[0]?.count || 0);
    
    // 获取近7天每日新增趋势数据
    const trendData: { date: string; chineseChar: number; chineseWord: number; english: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      // 中文字
      const charResult = await db.select({ count: sql<number>`count(*)` })
        .from(familyVocabulary)
        .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
        .where(and(
          ...baseConditions,
          eq(vocabularyMaster.language, "chinese"),
          eq(vocabularyMaster.wordType, "character"),
          gte(familyVocabulary.createdAt, date),
          sql`${familyVocabulary.createdAt} < ${nextDate}`
        ));
      const charCount = Number(charResult[0]?.count || 0);
      
      // 中文词
      const wordResult = await db.select({ count: sql<number>`count(*)` })
        .from(familyVocabulary)
        .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
        .where(and(
          ...baseConditions,
          eq(vocabularyMaster.language, "chinese"),
          eq(vocabularyMaster.wordType, "word"),
          gte(familyVocabulary.createdAt, date),
          sql`${familyVocabulary.createdAt} < ${nextDate}`
        ));
      const wordCount = Number(wordResult[0]?.count || 0);
      
      // 英文单词
      const engResult = await db.select({ count: sql<number>`count(*)` })
        .from(familyVocabulary)
        .innerJoin(vocabularyMaster, eq(familyVocabulary.vocabularyId, vocabularyMaster.id))
        .where(and(
          ...baseConditions,
          eq(vocabularyMaster.language, "english"),
          gte(familyVocabulary.createdAt, date),
          sql`${familyVocabulary.createdAt} < ${nextDate}`
        ));
      const engCount = Number(engResult[0]?.count || 0);
      
      trendData.push({
        date: date.toISOString().split('T')[0],
        chineseChar: charCount,
        chineseWord: wordCount,
        english: engCount,
        total: charCount + wordCount + engCount,
      });
    }
    
    return {
      totalCount,
      chineseCount,
      englishCount,
      chineseCharCount,
      chineseWordCount,
      recentAddedCount,
      notStartedCount,
      learningCount,
      masteredCount,
    };
  } catch (error) {
    console.error("[Database] Failed to get family vocabulary stats:", error);
    return {
      totalCount: 0,
      chineseCount: 0,
      englishCount: 0,
      chineseCharCount: 0,
      chineseWordCount: 0,
      recentAddedCount: 0,
      notStartedCount: 0,
      learningCount: 0,
      masteredCount: 0,
    };
  }
}

// ============= 游戏使用统计相关函数 =============

/**
 * 获取所有游戏的使用统计数据
 * 返回每个游戏的使用次数、活跃用户数、最近使用时间
 */
export async function getGameUsageStats() {
  const database = await getDb();
  if (!database) return [];

  const stats = [];

  // 1. 看图识字游戏统计
  const characterStats = await database
    .select({
      usageCount: sql<number>`COUNT(*)`,
      activeUsers: sql<number>`COUNT(DISTINCT ${characterLearningRecords.kidId})`,
      lastUsedAt: sql<Date>`MAX(${characterLearningRecords.createdAt})`,
    })
    .from(characterLearningRecords);
  
  if (characterStats[0] && Number(characterStats[0].usageCount) > 0) {
    stats.push({
      gameId: 'character',
      gameName: '看图识字',
      usageCount: Number(characterStats[0].usageCount),
      activeUsers: Number(characterStats[0].activeUsers),
      lastUsedAt: characterStats[0].lastUsedAt,
    });
  }

  // 2. 快闪识字游戏统计
  const flashcardStats = await database
    .select({
      usageCount: sql<number>`SUM(${flashcardRecords.knownCount} + ${flashcardRecords.forgottenCount})`,
      activeUsers: sql<number>`COUNT(DISTINCT ${flashcardRecords.kidId})`,
      lastUsedAt: sql<Date>`MAX(${flashcardRecords.lastInteraction})`,
    })
    .from(flashcardRecords);
  
  if (flashcardStats[0] && Number(flashcardStats[0].usageCount) > 0) {
    stats.push({
      gameId: 'flashcard',
      gameName: '快闪识字',
      usageCount: Number(flashcardStats[0].usageCount),
      activeUsers: Number(flashcardStats[0].activeUsers),
      lastUsedAt: flashcardStats[0].lastUsedAt,
    });
  }

  // 3. 20加法游戏统计
  const addition20Stats = await database
    .select({
      usageCount: sql<number>`COUNT(*)`,
      activeUsers: sql<number>`COUNT(DISTINCT ${addition20Records.kidId})`,
      lastUsedAt: sql<Date>`MAX(${addition20Records.createdAt})`,
    })
    .from(addition20Records);
  
  if (addition20Stats[0] && Number(addition20Stats[0].usageCount) > 0) {
    stats.push({
      gameId: 'addition20',
      gameName: '20加法',
      usageCount: Number(addition20Stats[0].usageCount),
      activeUsers: Number(addition20Stats[0].activeUsers),
      lastUsedAt: addition20Stats[0].lastUsedAt,
    });
  }

  // 4. 阅读识字游戏统计
  const readingStats = await database
    .select({
      usageCount: sql<number>`COUNT(*)`,
      activeUsers: sql<number>`COUNT(DISTINCT ${readingRecords.kidId})`,
      lastUsedAt: sql<Date>`MAX(${readingRecords.updatedAt})`,
    })
    .from(readingRecords);
  
  if (readingStats[0] && Number(readingStats[0].usageCount) > 0) {
    stats.push({
      gameId: 'reading',
      gameName: '阅读识字',
      usageCount: Number(readingStats[0].usageCount),
      activeUsers: Number(readingStats[0].activeUsers),
      lastUsedAt: readingStats[0].lastUsedAt,
    });
  }

  // 5. 刷牙游戏统计
  const brushingStats = await database
    .select({
      usageCount: sql<number>`COUNT(*)`,
      activeUsers: sql<number>`COUNT(DISTINCT ${brushingSessions.kidId})`,
      lastUsedAt: sql<Date>`MAX(${brushingSessions.createdAt})`,
    })
    .from(brushingSessions);
  
  if (brushingStats[0] && Number(brushingStats[0].usageCount) > 0) {
    stats.push({
      gameId: 'brushing',
      gameName: '刷牙游戏',
      usageCount: Number(brushingStats[0].usageCount),
      activeUsers: Number(brushingStats[0].activeUsers),
      lastUsedAt: brushingStats[0].lastUsedAt,
    });
  }

  // 按使用次数降序排序
  return stats.sort((a, b) => b.usageCount - a.usageCount);
}

// ============= VI配置相关函数 =============

/**
 * 根据家长用户ID获取VI配置
 */
export async function getViConfigByParentUserId(parentUserId: number): Promise<FamilyViConfig | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  try {
    const result = await db.select().from(familyViConfig)
      .where(and(
        eq(familyViConfig.parentUserId, parentUserId),
        eq(familyViConfig.isActive, true)
      ))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get VI config:", error);
    return null;
  }
}

/**
 * 创建或更新家长的VI配置
 */
export async function upsertViConfig(data: {
  parentUserId: number;
  viThemeId?: string | null;
  customConfig?: any;
  createdBy: number;
}): Promise<FamilyViConfig | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  try {
    // 检查是否已存在配置
    const existing = await getViConfigByParentUserId(data.parentUserId);
    
    if (existing) {
      // 更新现有配置
      await db.update(familyViConfig)
        .set({
          viThemeId: data.viThemeId,
          customConfig: data.customConfig,
          updatedAt: new Date(),
        })
        .where(eq(familyViConfig.parentUserId, data.parentUserId));
      
      return await getViConfigByParentUserId(data.parentUserId);
    } else {
      // 创建新配置
      const insertData: InsertFamilyViConfig = {
        parentUserId: data.parentUserId,
        viThemeId: data.viThemeId,
        customConfig: data.customConfig,
        isActive: true,
        createdBy: data.createdBy,
      };
      
      const result = await db.insert(familyViConfig).values(insertData);
      const insertId = Number(result[0].insertId);
      
      const newConfig = await db.select().from(familyViConfig)
        .where(eq(familyViConfig.id, insertId))
        .limit(1);
      
      return newConfig[0] || null;
    }
  } catch (error) {
    console.error("[Database] Failed to upsert VI config:", error);
    return null;
  }
}

/**
 * 删除家长的VI配置（软删除）
 */
export async function deleteViConfig(parentUserId: number): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  try {
    await db.update(familyViConfig)
      .set({ isActive: false })
      .where(eq(familyViConfig.parentUserId, parentUserId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete VI config:", error);
    return false;
  }
}

/**
 * 获取所有可用的VI主题列表
 * 注意：目前返回空数组，等待用户上传VI方案后填充
 */
export async function getAvailableViThemes(): Promise<Array<{
  id: string;
  name: string;
  description: string;
  previewUrl?: string;
}>> {
  // TODO: 等待用户上传VI方案后填充实际主题数据
  return [];
}


// ==================== 人脉字段分类相关 ====================

/**
 * 获取用户的所有字段分类
 */
export async function getContactFieldCategories(parentUserId: number): Promise<ContactFieldCategory[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  try {
    const categories = await db.select().from(contactFieldCategories)
      .where(eq(contactFieldCategories.parentUserId, parentUserId))
      .orderBy(contactFieldCategories.sortOrder);
    return categories;
  } catch (error) {
    console.error("[Database] Failed to get contact field categories:", error);
    return [];
  }
}

/**
 * 创建字段分类
 */
export async function createContactFieldCategory(data: InsertContactFieldCategory): Promise<ContactFieldCategory | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  try {
    const result = await db.insert(contactFieldCategories).values(data);
    const insertId = Number(result[0].insertId);
    
    const newCategory = await db.select().from(contactFieldCategories)
      .where(eq(contactFieldCategories.id, insertId))
      .limit(1);
    
    return newCategory[0] || null;
  } catch (error) {
    console.error("[Database] Failed to create contact field category:", error);
    return null;
  }
}

/**
 * 删除字段分类
 */
export async function deleteContactFieldCategory(id: number, parentUserId: number): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  try {
    // 先删除该分类下的所有字段值
    await db.delete(contactFieldValues)
      .where(eq(contactFieldValues.categoryId, id));
    
    // 再删除分类本身
    await db.delete(contactFieldCategories)
      .where(and(
        eq(contactFieldCategories.id, id),
        eq(contactFieldCategories.parentUserId, parentUserId)
      ));
    
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete contact field category:", error);
    return false;
  }
}

/**
 * 获取人脉的所有自定义字段值
 */
export async function getContactFieldValues(contactId: number): Promise<ContactFieldValue[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  try {
    const values = await db.select().from(contactFieldValues)
      .where(eq(contactFieldValues.contactId, contactId));
    return values;
  } catch (error) {
    console.error("[Database] Failed to get contact field values:", error);
    return [];
  }
}

/**
 * 设置人脉的自定义字段值（批量更新）
 */
export async function setContactFieldValues(
  contactId: number, 
  values: Array<{ categoryId: number; value: string }>
): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  try {
    // 删除该人脉的所有现有字段值
    await db.delete(contactFieldValues)
      .where(eq(contactFieldValues.contactId, contactId));
    
    // 插入新的字段值
    if (values.length > 0) {
      const insertData = values.map(v => ({
        contactId,
        categoryId: v.categoryId,
        value: v.value || null,
      }));
      await db.insert(contactFieldValues).values(insertData);
    }
    
    return true;
  } catch (error) {
    console.error("[Database] Failed to set contact field values:", error);
    return false;
  }
}

/**
 * 获取所有可用的字段类目（全局类目，parentUserId=0）
 */
export async function getAllFieldCategories(): Promise<Array<{
  id: number;
  name: string;
  fieldType: string;
  sortOrder: number;
}>> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  try {
    const categories = await db.select()
      .from(contactFieldCategories)
      .where(eq(contactFieldCategories.parentUserId, 0))
      .orderBy(contactFieldCategories.sortOrder);
    return categories;
  } catch (error) {
    console.error("[Database] Failed to get all field categories:", error);
    return [];
  }
}

/**
 * 添加单个字段值
 */
export async function addContactFieldValue(
  contactId: number,
  categoryId: number,
  value: string
): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");
  
  try {
    const result = await db.insert(contactFieldValues).values({
      contactId,
      categoryId,
      value,
    });
    return result[0].insertId;
  } catch (error) {
    console.error("[Database] Failed to add contact field value:", error);
    throw error;
  }
}

/**
 * 删除单个字段值
 */
export async function deleteContactFieldValue(id: number): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return false;
  
  try {
    await db.delete(contactFieldValues)
      .where(eq(contactFieldValues.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete contact field value:", error);
    return false;
  }
}

/**
 * 获取人脉和字段值（用于编辑页面）
 */
export async function getContactWithFieldValues(contactId: number, parentUserId: number): Promise<{
  contact: typeof contacts.$inferSelect | null;
  fieldValues: Array<{ categoryId: number; categoryName: string; value: string | null }>;
}> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return { contact: null, fieldValues: [] };
  
  try {
    // 获取人脉基本信息
    const contactResult = await db.select().from(contacts)
      .where(and(
        eq(contacts.id, contactId),
        eq(contacts.parentUserId, parentUserId)
      ))
      .limit(1);
    
    if (contactResult.length === 0) {
      return { contact: null, fieldValues: [] };
    }
    
    // 获取所有字段分类
    const categories = await db.select().from(contactFieldCategories)
      .where(eq(contactFieldCategories.parentUserId, parentUserId))
      .orderBy(contactFieldCategories.sortOrder);
    
    // 获取该人脉的字段值
    const values = await db.select().from(contactFieldValues)
      .where(eq(contactFieldValues.contactId, contactId));
    
    // 组合字段分类和值
    const fieldValues = categories.map(cat => {
      const fieldValue = values.find(v => v.categoryId === cat.id);
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        value: fieldValue?.value || null,
      };
    });
    
    return { contact: contactResult[0], fieldValues };
  } catch (error) {
    console.error("[Database] Failed to get contact with field values:", error);
    return { contact: null, fieldValues: [] };
  }
}

// ==================== 容器顺序相关 ====================

/**
 * 获取所有启用的容器定义
 */
export async function getActiveFeatureDefinitions(): Promise<FeatureDefinition[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  try {
    return await db
      .select()
      .from(featureDefinitions)
      .where(eq(featureDefinitions.isActive, true))
      .orderBy(asc(featureDefinitions.defaultPosition));
  } catch (error) {
    console.error("[Database] Failed to get active feature definitions:", error);
    return [];
  }
}

/**
 * 获取用户的容器顺序配置
 */
export async function getUserFeatureOrder(userId: number): Promise<UserFeatureOrder[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  try {
    return await db
      .select()
      .from(userFeatureOrder)
      .where(eq(userFeatureOrder.userId, userId))
      .orderBy(asc(userFeatureOrder.position));
  } catch (error) {
    console.error("[Database] Failed to get user feature order:", error);
    return [];
  }
}

/**
 * 保存用户的容器顺序配置
 * 删除旧配置并插入新配置
 */
export async function saveUserFeatureOrder(userId: number, orders: { featureId: number; position: number }[]): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    console.warn("[Database] Cannot save user feature order: database not available");
    return;
  }
  
  try {
    // 删除该用户的所有旧配置
    await db
      .delete(userFeatureOrder)
      .where(eq(userFeatureOrder.userId, userId));
    
    // 批量插入新配置
    if (orders.length > 0) {
      await db.insert(userFeatureOrder).values(
        orders.map(order => ({
          userId,
          featureId: order.featureId,
          position: order.position,
        }))
      );
    }
  } catch (error) {
    console.error("[Database] Failed to save user feature order:", error);
    throw error;
  }
}

/**
 * 创建或更新容器定义（管理员用）
 */
export async function upsertFeatureDefinition(feature: InsertFeatureDefinition): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    console.warn("[Database] Cannot upsert feature definition: database not available");
    return;
  }
  
  try {
    await db
      .insert(featureDefinitions)
      .values(feature)
      .onDuplicateKeyUpdate({
        set: {
          title: feature.title,
          description: feature.description,
          isActive: feature.isActive,
          defaultPosition: feature.defaultPosition,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error("[Database] Failed to upsert feature definition:", error);
    throw error;
  }
}

/**
 * 获取所有容器定义（管理员用）
 */
export async function getAllFeatureDefinitions(): Promise<FeatureDefinition[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  try {
    return await db
      .select()
      .from(featureDefinitions)
      .orderBy(asc(featureDefinitions.defaultPosition));
  } catch (error) {
    console.error("[Database] Failed to get all feature definitions:", error);
    return [];
  }
}

// ==================== Reminder Helpers ====================

/**
 * 创建提醒事项
 */
export async function createReminder(reminder: InsertReminder): Promise<Reminder | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    console.warn("[Database] Cannot create reminder: database not available");
    return null;
  }
  
  try {
    const result = await db.insert(reminders).values(reminder);
    const insertId = Number(result[0].insertId);
    return await getReminderById(insertId);
  } catch (error) {
    console.error("[Database] Failed to create reminder:", error);
    throw error;
  }
}

/**
 * 根据ID获取提醒事项
 */
export async function getReminderById(id: number): Promise<Reminder | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  try {
    const results = await db
      .select()
      .from(reminders)
      .where(eq(reminders.id, id))
      .limit(1);
    return results[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get reminder by ID:", error);
    return null;
  }
}

/**
 * 获取某个人脉的所有提醒事项
 */
export async function getRemindersByContactId(contactId: number, userId: number): Promise<Reminder[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  try {
    return await db
      .select()
      .from(reminders)
      .where(and(
        eq(reminders.contactId, contactId),
        eq(reminders.userId, userId)
      ))
      .orderBy(asc(reminders.reminderTime));
  } catch (error) {
    console.error("[Database] Failed to get reminders by contact ID:", error);
    return [];
  }
}

/**
 * 更新提醒事项
 */
export async function updateReminder(
  id: number,
  userId: number,
  updates: Partial<InsertReminder>
): Promise<Reminder | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    console.warn("[Database] Cannot update reminder: database not available");
    return null;
  }
  
  try {
    await db
      .update(reminders)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(reminders.id, id),
        eq(reminders.userId, userId)
      ));
    return await getReminderById(id);
  } catch (error) {
    console.error("[Database] Failed to update reminder:", error);
    throw error;
  }
}

/**
 * 删除提醒事项
 */
export async function deleteReminder(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    console.warn("[Database] Cannot delete reminder: database not available");
    return false;
  }
  
  try {
    await db
      .delete(reminders)
      .where(and(
        eq(reminders.id, id),
        eq(reminders.userId, userId)
      ));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete reminder:", error);
    return false;
  }
}

/**
 * 统计今日有提醒的人数
 */
export async function getTodayReminderCount(userId: number): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const results = await db
      .selectDistinct({ contactId: reminders.contactId })
      .from(reminders)
      .where(and(
        eq(reminders.userId, userId),
        eq(reminders.isCompleted, false),
        gte(reminders.reminderTime, today),
        lt(reminders.reminderTime, tomorrow)
      ));
    
    return results.length;
  } catch (error) {
    console.error("[Database] Failed to get today reminder count:", error);
    return 0;
  }
}

/**
 * 统计本周有提醒的人数
 */
export async function getWeeklyReminderCount(userId: number): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  try {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    
    const results = await db
      .selectDistinct({ contactId: reminders.contactId })
      .from(reminders)
      .where(and(
        eq(reminders.userId, userId),
        eq(reminders.isCompleted, false),
        gte(reminders.reminderTime, startOfWeek),
        lt(reminders.reminderTime, endOfWeek)
      ));
    
    return results.length;
  } catch (error) {
    console.error("[Database] Failed to get weekly reminder count:", error);
    return 0;
  }
}

/**
 * 统计本月有提醒的人数
 */
export async function getMonthlyReminderCount(userId: number): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return 0;
  
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    const results = await db
      .selectDistinct({ contactId: reminders.contactId })
      .from(reminders)
      .where(and(
        eq(reminders.userId, userId),
        eq(reminders.isCompleted, false),
        gte(reminders.reminderTime, startOfMonth),
        lt(reminders.reminderTime, endOfMonth)
      ));
    
    return results.length;
  } catch (error) {
    console.error("[Database] Failed to get monthly reminder count:", error);
    return 0;
  }
}

/**
 * 获取有提醒的人脉ID列表（用于筛选）
 */
export async function getContactIdsWithReminders(
  userId: number,
  timeRange: 'today' | 'week' | 'month'
): Promise<number[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  try {
    let startTime: Date;
    let endTime: Date;
    
    const now = new Date();
    
    if (timeRange === 'today') {
      startTime = new Date(now);
      startTime.setHours(0, 0, 0, 0);
      endTime = new Date(startTime);
      endTime.setDate(endTime.getDate() + 1);
    } else if (timeRange === 'week') {
      const dayOfWeek = now.getDay();
      startTime = new Date(now);
      startTime.setDate(now.getDate() - dayOfWeek);
      startTime.setHours(0, 0, 0, 0);
      endTime = new Date(startTime);
      endTime.setDate(startTime.getDate() + 7);
    } else { // month
      startTime = new Date(now.getFullYear(), now.getMonth(), 1);
      endTime = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    
    const results = await db
      .selectDistinct({ contactId: reminders.contactId })
      .from(reminders)
      .where(and(
        eq(reminders.userId, userId),
        eq(reminders.isCompleted, false),
        gte(reminders.reminderTime, startTime),
        lt(reminders.reminderTime, endTime)
      ));
    
    return results.map(r => r.contactId);
  } catch (error) {
    console.error("[Database] Failed to get contact IDs with reminders:", error);
    return [];
  }
}


// ==================== 人脉共享相关 ====================
import { contactSharingConnections, contactSharingPermissions, InsertContactSharingConnection, InsertContactSharingPermission, ContactSharingConnection, ContactSharingPermission } from "../drizzle/schema";

/**
 * 创建共享连接
 */
export async function createSharingConnection(data: InsertContactSharingConnection): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(contactSharingConnections).values(data);
  return result[0].insertId;
}

/**
 * 获取共享连接（通过分享者和接收者ID）
 */
export async function getSharingConnection(sharerId: number, receiverId: number): Promise<ContactSharingConnection | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const result = await db.select().from(contactSharingConnections)
    .where(and(
      eq(contactSharingConnections.sharerId, sharerId),
      eq(contactSharingConnections.receiverId, receiverId)
    ))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

/**
 * 获取共享连接（通过ID）
 */
export async function getSharingConnectionById(id: number): Promise<ContactSharingConnection | null> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const result = await db.select().from(contactSharingConnections)
    .where(eq(contactSharingConnections.id, id))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

/**
 * 获取分享者的所有共享连接
 */
export async function getSharingConnectionsBySharerId(sharerId: number): Promise<ContactSharingConnection[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return db.select().from(contactSharingConnections)
    .where(eq(contactSharingConnections.sharerId, sharerId))
    .orderBy(desc(contactSharingConnections.createdAt));
}

/**
 * 获取接收者的所有共享连接
 */
export async function getSharingConnectionsByReceiverId(receiverId: number): Promise<ContactSharingConnection[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return db.select().from(contactSharingConnections)
    .where(and(
      eq(contactSharingConnections.receiverId, receiverId),
      eq(contactSharingConnections.status, 'active')
    ))
    .orderBy(desc(contactSharingConnections.createdAt));
}

/**
 * 删除共享连接
 */
export async function deleteSharingConnection(id: number): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.delete(contactSharingConnections).where(eq(contactSharingConnections.id, id));
}

/**
 * 创建共享权限
 */
export async function createSharingPermission(data: InsertContactSharingPermission): Promise<number> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(contactSharingPermissions).values(data);
  return result[0].insertId;
}

/**
 * 获取连接的所有权限配置
 */
export async function getSharingPermissionsByConnectionId(connectionId: number): Promise<ContactSharingPermission[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return db.select().from(contactSharingPermissions)
    .where(eq(contactSharingPermissions.connectionId, connectionId));
}

/**
 * 更新或创建共享权限
 */
export async function upsertSharingPermission(connectionId: number, fieldName: string, isShared: boolean): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  // 先查找是否存在
  const existing = await db.select().from(contactSharingPermissions)
    .where(and(
      eq(contactSharingPermissions.connectionId, connectionId),
      eq(contactSharingPermissions.fieldName, fieldName)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    // 更新
    await db.update(contactSharingPermissions)
      .set({ isShared })
      .where(eq(contactSharingPermissions.id, existing[0].id));
  } else {
    // 创建
    await db.insert(contactSharingPermissions).values({
      connectionId,
      fieldName,
      isShared,
    });
  }
}

/**
 * 删除连接的所有权限配置
 */
export async function deleteSharingPermissionsByConnectionId(connectionId: number): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.delete(contactSharingPermissions).where(eq(contactSharingPermissions.connectionId, connectionId));
}

/**
 * 搜索用户（通过用户名或显示名模糊搜索）
 */
export async function searchUsersByUsername(query: string): Promise<any[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return db.select({
    id: users.id,
    username: users.username,
    name: users.name,
  }).from(users)
    .where(
      or(
        like(users.username, `%${query}%`),
        like(users.name, `%${query}%`)
      )
    )
    .limit(10);
}


/**
 * 获取家庭下的所有用户
 */
export async function getUsersByFamilyId(familyId: number): Promise<any[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];
  
  return db.select({
    id: users.id,
    username: users.username,
    name: users.name,
    sharingEnabled: users.sharingEnabled,
  }).from(users)
    .where(eq(users.familyId, familyId));
}

/**
 * 批量更新用户的sharingEnabled字段
 */
export async function updateUsersSharingEnabled(familyId: number, enabled: boolean): Promise<void> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return;
  
  await db.update(users)
    .set({ sharingEnabled: enabled })
    .where(eq(users.familyId, familyId));
}

/**
 * 获取用户偏好设置
 */
export async function getUserPreference(userId: number): Promise<UserPreference | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  
  return result[0] || null;
}

/**
 * 保存或更新用户首页卡片排序
 */
export async function saveHomeCardOrder(userId: number, cardOrder: string[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getUserPreference(userId);
  
  if (existing) {
    // 更新现有记录
    await db.update(userPreferences)
      .set({ 
        homeCardOrder: cardOrder,
        updatedAt: new Date()
      })
      .where(eq(userPreferences.userId, userId));
  } else {
    // 创建新记录
    await db.insert(userPreferences).values({
      userId,
      homeCardOrder: cardOrder,
    });
  }
}

/**
 * 创建关联人脉记录（用户注册时自动创建）
 */
export async function createLinkedContact(data: {
  parentUserId: number;
  name: string;
  linkedUserId: number;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const result = await db.insert(contacts).values({
      parentUserId: data.parentUserId,
      name: data.name,
      linkedUserId: data.linkedUserId,
    });
    return result[0].insertId;
  } catch (error) {
    console.error("[Database] Failed to create linked contact:", error);
    return null;
  }
}

/**
 * 同步关联人脉记录的名字（用户修改个人资料时调用）
 */
export async function syncLinkedContactName(userId: number, newName: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    // 更新所有 linkedUserId 为该用户的人脉记录
    await db
      .update(contacts)
      .set({ name: newName })
      .where(eq(contacts.linkedUserId, userId));
    
    return true;
  } catch (error) {
    console.error("[Database] Failed to sync linked contact name:", error);
    return false;
  }
}

/**
 * 同步关联人脉记录的头像（用户修改头像时调用）
 */
export async function syncLinkedContactAvatar(userId: number, avatarUrl: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    // 更新所有 linkedUserId 为该用户的人脉记录
    await db
      .update(contacts)
      .set({ avatar: avatarUrl })
      .where(eq(contacts.linkedUserId, userId));
    
    return true;
  } catch (error) {
    console.error("[Database] Failed to sync linked contact avatar:", error);
    return false;
  }
}
