/**
 * 减肥账本 - 数据库操作
 * 支持多学员：每个学员有独立的减肥档案（按 ledgerId + userId 区分）
 */
import { getLedgerDb } from "./db";
import { sql } from "drizzle-orm";

let _tablesCreated = false;

export async function ensureDietTables() {
  if (_tablesCreated) return;
  const db = await getLedgerDb();
  if (!db) return;

  // 减肥档案表（每个学员独立一条，按 ledgerId+userId 唯一）
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS diet_member_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledgerId INT NOT NULL,
      userId INT NOT NULL,
      nickname VARCHAR(50) COMMENT '学员昵称',
      initialWeight DECIMAL(5,1) COMMENT '初始体重(斤)',
      targetWeight DECIMAL(5,1) COMMENT '目标体重(斤)',
      currentWeight DECIMAL(5,1) COMMENT '当前体重(斤)',
      height DECIMAL(5,1) COMMENT '身高(cm)',
      gender ENUM('male','female') DEFAULT 'female',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_ledger_user (ledgerId, userId)
    )
  `);

  // 体重打卡记录表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS diet_weight_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledgerId INT NOT NULL,
      userId INT NOT NULL,
      weight DECIMAL(5,1) NOT NULL COMMENT '体重(斤)',
      note VARCHAR(200) COMMENT '备注',
      recordDate DATE NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ledger_user_date (ledgerId, userId, recordDate)
    )
  `);

  // 卡路里消耗记录表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS diet_calorie_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledgerId INT NOT NULL,
      userId INT NOT NULL,
      calories INT NOT NULL COMMENT '卡路里(kcal)',
      activityType VARCHAR(50) COMMENT '运动类型',
      note VARCHAR(200) COMMENT '备注',
      recordDate DATE NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ledger_user_date (ledgerId, userId, recordDate)
    )
  `);

  // 三餐照片+AI分析记录表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS diet_meal_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledgerId INT NOT NULL,
      userId INT NOT NULL,
      mealType ENUM('breakfast','lunch','dinner','snack') NOT NULL,
      imageUrl VARCHAR(500) NOT NULL,
      aiAnalysis TEXT COMMENT 'AI分析结果JSON',
      recordDate DATE NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ledger_user_date (ledgerId, userId, recordDate)
    )
  `);

  // 三围/BMI记录表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS diet_measurement_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledgerId INT NOT NULL,
      userId INT NOT NULL,
      measureType ENUM('measurement','bmi') NOT NULL COMMENT '记录类型：三围/BMI',
      chest DECIMAL(5,1) COMMENT '胸围(cm)',
      waist DECIMAL(5,1) COMMENT '腰围(cm)',
      hip DECIMAL(5,1) COMMENT '臀围(cm)',
      height DECIMAL(5,1) COMMENT '身高(cm，BMI用)',
      weight DECIMAL(5,1) COMMENT '体重(kg，BMI用)',
      bmi DECIMAL(4,1) COMMENT 'BMI值',
      imageUrl VARCHAR(500) COMMENT '照片URL',
      note VARCHAR(200) COMMENT '备注',
      recordDate DATE NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ledger_user_date (ledgerId, userId, recordDate)
    )
  `);
  _tablesCreated = true;
  // 迁移：为体重记录表添加 weightUnit 和 imageUrl 字段
  try {
    await db.execute(sql`ALTER TABLE diet_weight_records ADD COLUMN weightUnit ENUM('jin','kg') NOT NULL DEFAULT 'jin' COMMENT '单位：斤/公斤'`);
  } catch (e: any) { if (!String(e).includes('Duplicate column')) console.warn('[diet] weightUnit迁移跳过:', e?.message); }
  try {
    await db.execute(sql`ALTER TABLE diet_weight_records ADD COLUMN imageUrl VARCHAR(500) NULL COMMENT '照片URL'`);
  } catch (e: any) { if (!String(e).includes('Duplicate column')) console.warn('[diet] imageUrl迁移跳过:', e?.message); }
  console.log("[diet] 减肥账本数据表初始化完成");
}

ensureDietTables().catch(console.error);

// ========== 学员档案（教练可为任意学员设置） ==========

export async function getMemberConfig(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) return null;
  await ensureDietTables();
  const rows = await db.execute(sql`
    SELECT * FROM diet_member_config WHERE ledgerId = ${ledgerId} AND userId = ${userId} LIMIT 1
  `);
  const data = (rows as any)[0];
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

export async function saveMemberConfig(ledgerId: number, userId: number, config: {
  nickname?: string;
  initialWeight?: number;
  targetWeight?: number;
  currentWeight?: number;
  height?: number;
  gender?: 'male' | 'female';
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("DB connection failed");
  await ensureDietTables();
  await db.execute(sql`
    INSERT INTO diet_member_config (ledgerId, userId, nickname, initialWeight, targetWeight, currentWeight, height, gender)
    VALUES (
      ${ledgerId}, ${userId},
      ${config.nickname ?? null},
      ${config.initialWeight ?? null},
      ${config.targetWeight ?? null},
      ${config.currentWeight ?? config.initialWeight ?? null},
      ${config.height ?? null},
      ${config.gender ?? 'female'}
    )
    ON DUPLICATE KEY UPDATE
      nickname = COALESCE(VALUES(nickname), nickname),
      initialWeight = COALESCE(VALUES(initialWeight), initialWeight),
      targetWeight = COALESCE(VALUES(targetWeight), targetWeight),
      currentWeight = COALESCE(VALUES(currentWeight), currentWeight),
      height = COALESCE(VALUES(height), height),
      gender = VALUES(gender)
  `);
}

// 设置成员档案（完整版）
export async function setMemberConfig(ledgerId: number, userId: number, config: any) {
  const db = await getLedgerDb();
  if (!db) throw new Error("DB connection failed");
  await ensureDietTables();
  const existing = await getMemberConfig(ledgerId, userId);
  if (existing) {
    await db.execute(sql`
      UPDATE diet_member_config SET
        nickname = ${config.studentName ?? existing.nickname},
        gender = ${config.gender ?? existing.gender},
        height = ${config.height ?? existing.height},
        initialWeight = ${config.initialWeight},
        targetWeight = ${config.targetWeight},
        currentWeight = ${config.initialWeight}
      WHERE ledgerId = ${ledgerId} AND userId = ${userId}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO diet_member_config (ledgerId, userId, nickname, gender, height, initialWeight, targetWeight, currentWeight)
      VALUES (${ledgerId}, ${userId}, ${config.studentName ?? null}, ${config.gender ?? 'female'}, ${config.height ?? null}, ${config.initialWeight}, ${config.targetWeight}, ${config.initialWeight})
    `);
  }
}

// 获取指定学员的完整档案
export async function getMemberFullConfig(ledgerId: number, userId: number) {
  const config = await getMemberConfig(ledgerId, userId);
  if (!config) return null;
  let bmi = null;
  if (config.height && config.initialWeight) {
    const heightM = Number(config.height) / 100;
    const weightKg = Number(config.initialWeight) * 0.5;
    bmi = Number((weightKg / (heightM * heightM)).toFixed(1));
  }
  return { ...config, bmi };
}

// 获取账本内所有学员的档案（教练用）
export async function getAllMemberConfigs(ledgerId: number) {
  const db = await getLedgerDb();
  if (!db) return [];
  await ensureDietTables();
  const rows = await db.execute(sql`
    SELECT c.*, 
      (SELECT weight FROM diet_weight_records WHERE ledgerId = c.ledgerId AND userId = c.userId ORDER BY recordDate DESC LIMIT 1) as latestWeight,
      (SELECT recordDate FROM diet_weight_records WHERE ledgerId = c.ledgerId AND userId = c.userId ORDER BY recordDate DESC LIMIT 1) as lastCheckIn
    FROM diet_member_config c
    WHERE c.ledgerId = ${ledgerId}
    ORDER BY c.createdAt ASC
  `);
  return (rows as any)[0] as any[];
}

// ========== 体重记录 ==========

export async function addWeightRecord(data: {
  ledgerId: number;
  userId: number;
  weight: number;
  weightUnit?: 'jin' | 'kg';
  imageUrl?: string;
  note?: string;
  recordDate: string;
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("DB connection failed");
  await ensureDietTables();
  const result = await db.execute(sql`
    INSERT INTO diet_weight_records (ledgerId, userId, weight, weightUnit, imageUrl, note, recordDate)
    VALUES (${data.ledgerId}, ${data.userId}, ${data.weight}, ${data.weightUnit ?? 'jin'}, ${data.imageUrl ?? null}, ${data.note ?? null}, ${data.recordDate})
  `);
  // 同步更新该学员的当前体重
  await db.execute(sql`
    UPDATE diet_member_config SET currentWeight = ${data.weight}
    WHERE ledgerId = ${data.ledgerId} AND userId = ${data.userId}
  `);
  return { id: Number((result as any)[0]?.insertId || (result as any).insertId) };
}

// ========== 三围/BMI 记录 ==========

export async function addMeasurementRecord(data: {
  ledgerId: number;
  userId: number;
  measureType: 'measurement' | 'bmi';
  chest?: number;
  waist?: number;
  hip?: number;
  height?: number;
  weight?: number;
  bmi?: number;
  imageUrl?: string;
  note?: string;
  recordDate: string;
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("DB connection failed");
  await ensureDietTables();
  const result = await db.execute(sql`
    INSERT INTO diet_measurement_records (ledgerId, userId, measureType, chest, waist, hip, height, weight, bmi, imageUrl, note, recordDate)
    VALUES (
      ${data.ledgerId}, ${data.userId}, ${data.measureType},
      ${data.chest ?? null}, ${data.waist ?? null}, ${data.hip ?? null},
      ${data.height ?? null}, ${data.weight ?? null}, ${data.bmi ?? null},
      ${data.imageUrl ?? null}, ${data.note ?? null}, ${data.recordDate}
    )
  `);
  return { id: Number((result as any)[0]?.insertId || (result as any).insertId) };
}

export async function getMeasurementRecords(ledgerId: number, userId: number, days: number = 30) {
  const db = await getLedgerDb();
  if (!db) return [];
  await ensureDietTables();
  const rows = await db.execute(sql`
    SELECT * FROM diet_measurement_records
    WHERE ledgerId = ${ledgerId} AND userId = ${userId}
    ORDER BY recordDate DESC
    LIMIT ${days}
  `);
  return (rows as any)[0] as any[];
}

export async function getWeightRecords(ledgerId: number, userId: number, days: number = 30) {
  const db = await getLedgerDb();
  if (!db) return [];
  await ensureDietTables();
  const rows = await db.execute(sql`
    SELECT id, weight, note, recordDate, createdAt
    FROM diet_weight_records
    WHERE ledgerId = ${ledgerId} AND userId = ${userId}
    ORDER BY recordDate ASC
    LIMIT ${days}
  `);
  return (rows as any)[0] as any[];
}

// ========== 卡路里记录 ==========

export async function addCalorieRecord(data: {
  ledgerId: number;
  userId: number;
  calories: number;
  activityType?: string;
  note?: string;
  recordDate: string;
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("DB connection failed");
  await ensureDietTables();
  const result = await db.execute(sql`
    INSERT INTO diet_calorie_records (ledgerId, userId, calories, activityType, note, recordDate)
    VALUES (${data.ledgerId}, ${data.userId}, ${data.calories}, ${data.activityType ?? null}, ${data.note ?? null}, ${data.recordDate})
  `);
  return { id: Number((result as any)[0]?.insertId || (result as any).insertId) };
}

export async function getCalorieSummaryByDate(ledgerId: number, userId: number, days: number = 30) {
  const db = await getLedgerDb();
  if (!db) return [];
  await ensureDietTables();
  const rows = await db.execute(sql`
    SELECT recordDate, SUM(calories) as totalCalories
    FROM diet_calorie_records
    WHERE ledgerId = ${ledgerId} AND userId = ${userId}
    GROUP BY recordDate
    ORDER BY recordDate ASC
    LIMIT ${days}
  `);
  return (rows as any)[0] as any[];
}

// ========== 三餐记录 ==========

export async function addMealRecord(data: {
  ledgerId: number;
  userId: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  imageUrl: string;
  aiAnalysis?: string;
  recordDate: string;
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("DB connection failed");
  await ensureDietTables();
  const result = await db.execute(sql`
    INSERT INTO diet_meal_records (ledgerId, userId, mealType, imageUrl, aiAnalysis, recordDate)
    VALUES (${data.ledgerId}, ${data.userId}, ${data.mealType}, ${data.imageUrl}, ${data.aiAnalysis ?? null}, ${data.recordDate})
  `);
  return { id: Number((result as any)[0]?.insertId || (result as any).insertId) };
}

export async function getMealRecords(ledgerId: number, userId: number, date?: string) {
  const db = await getLedgerDb();
  if (!db) return [];
  await ensureDietTables();
  let rows;
  if (date) {
    rows = await db.execute(sql`
      SELECT id, mealType, imageUrl, aiAnalysis, recordDate, createdAt
      FROM diet_meal_records
      WHERE ledgerId = ${ledgerId} AND userId = ${userId} AND recordDate = ${date}
      ORDER BY createdAt ASC
    `);
  } else {
    rows = await db.execute(sql`
      SELECT id, mealType, imageUrl, aiAnalysis, recordDate, createdAt
      FROM diet_meal_records
      WHERE ledgerId = ${ledgerId} AND userId = ${userId}
      ORDER BY recordDate DESC, createdAt ASC
      LIMIT 50
    `);
  }
  return (rows as any)[0] as any[];
}

export async function updateMealAiAnalysis(mealId: number, aiAnalysis: string) {
  const db = await getLedgerDb();
  if (!db) throw new Error("DB connection failed");
  await db.execute(sql`
    UPDATE diet_meal_records SET aiAnalysis = ${aiAnalysis} WHERE id = ${mealId}
  `);
}

// ========== 综合统计（按学员） ==========

export async function getDietStats(ledgerId: number, userId: number) {
  const db = await getLedgerDb();
  if (!db) return null;
  await ensureDietTables();

  const config = await getMemberConfig(ledgerId, userId);
  const weightRows = await db.execute(sql`
    SELECT weight, recordDate FROM diet_weight_records
    WHERE ledgerId = ${ledgerId} AND userId = ${userId}
    ORDER BY recordDate ASC
  `);
  const calorieRows = await db.execute(sql`
    SELECT SUM(calories) as total FROM diet_calorie_records
    WHERE ledgerId = ${ledgerId} AND userId = ${userId}
  `);

  const weights = (weightRows as any)[0] as any[];
  const totalCalories = Number((calorieRows as any)[0]?.[0]?.total || 0);

  return {
    config,
    weightHistory: weights,
    totalCaloriesBurned: totalCalories,
    currentWeight: weights.length > 0 ? Number(weights[weights.length - 1].weight) : (config?.currentWeight ? Number(config.currentWeight) : null),
    startWeight: config?.initialWeight ? Number(config.initialWeight) : (weights.length > 0 ? Number(weights[0].weight) : null),
  };
}

// ========== 减肥分类辅助（确保账本存在对应分类，返回categoryId） ==========
const _dietCategoryCache: Record<string, number> = {};

// 旧分类名称映射表（带 emoji 的旧名 -> 新名）
const DIET_CATEGORY_ALIASES: Record<string, string[]> = {
  '体重/斤': ['体重打卡'],
  '体重/kg': ['体重打卡'],
  'BMI': ['BMI指标'],
  '胸围/cm': ['📏 胸围', '胸围'],
  '腰围/cm': ['📏 腰围', '腰围'],
  '臀围/cm': ['📏 臀围', '臀围'],
  '卡路里/kcal': ['卡路里消耗'],
};

export async function ensureDietCategory(
  ledgerId: number,
  userId: number,
  name: string,
  icon: string,
  color: string
): Promise<number> {
  const cacheKey = `${ledgerId}:${name}`;
  if (_dietCategoryCache[cacheKey]) return _dietCategoryCache[cacheKey];

  const db = await getLedgerDb();
  if (!db) throw new Error("DB connection failed");

  // 查找是否已存在精确同名分类
  const existing = await db.execute(sql`
    SELECT id FROM ledger_categories
    WHERE ledgerId = ${ledgerId} AND name = ${name}
    LIMIT 1
  `);
  const rows = (existing as any)[0] as any[];
  if (rows && rows.length > 0) {
    const id = Number(rows[0].id);
    // 确保 icon 已清除
    await db.execute(sql`UPDATE ledger_categories SET icon = '' WHERE id = ${id} AND icon != ''`);
    _dietCategoryCache[cacheKey] = id;
    return id;
  }

  // 尝试匹配旧的带 emoji 分类名，如果找到则重命名为新名称并清除 icon
  const aliases = DIET_CATEGORY_ALIASES[name] || [];
  for (const oldName of aliases) {
    const oldRows = (await db.execute(sql`
      SELECT id FROM ledger_categories
      WHERE ledgerId = ${ledgerId} AND name = ${oldName}
      LIMIT 1
    `) as any)[0] as any[];
    if (oldRows && oldRows.length > 0) {
      const id = Number(oldRows[0].id);
      await db.execute(sql`UPDATE ledger_categories SET name = ${name}, icon = '' WHERE id = ${id}`);
      _dietCategoryCache[cacheKey] = id;
      return id;
    }
  }

  // 不存在则创建（icon 一律为空）
  const result = await db.execute(sql`
    INSERT INTO ledger_categories (ledgerId, name, type, icon, color, isDefault, createdBy, sortOrder)
    VALUES (${ledgerId}, ${name}, 'expense', '', ${color}, 0, ${userId}, 99)
  `);
  const newId = Number((result as any)[0]?.insertId || 0);
  if (newId > 0) _dietCategoryCache[cacheKey] = newId;
  return newId;
}
