/**
 * 减肥账本 - 数据库操作
 * 包含：体重记录、卡路里记录、三餐照片、AI营养分析
 */
import { getLedgerDb } from "./db";
import { sql } from "drizzle-orm";

// ========== 自动建表 ==========
let _tablesCreated = false;

export async function ensureDietTables() {
  if (_tablesCreated) return;
  const db = await getLedgerDb();
  if (!db) return;

  // 减肥账本配置表（初始体重/目标体重）
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS diet_ledger_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledgerId INT NOT NULL UNIQUE,
      initialWeight DECIMAL(5,1) NOT NULL COMMENT '初始体重(斤)',
      targetWeight DECIMAL(5,1) NOT NULL COMMENT '目标体重(斤)',
      currentWeight DECIMAL(5,1) COMMENT '当前体重(斤)',
      height DECIMAL(5,1) COMMENT '身高(cm)',
      gender ENUM('male','female') DEFAULT 'female',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
      INDEX idx_ledger_date (ledgerId, recordDate)
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
      INDEX idx_ledger_date (ledgerId, recordDate)
    )
  `);

  // 三餐照片+AI分析记录表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS diet_meal_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledgerId INT NOT NULL,
      userId INT NOT NULL,
      mealType ENUM('breakfast','lunch','dinner','snack') NOT NULL COMMENT '餐次',
      imageUrl VARCHAR(500) NOT NULL COMMENT '照片URL',
      aiAnalysis TEXT COMMENT 'AI分析结果JSON',
      recordDate DATE NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ledger_date (ledgerId, recordDate)
    )
  `);

  _tablesCreated = true;
  console.log("[diet] 减肥账本数据表初始化完成");
}

// 在模块加载时执行
ensureDietTables().catch(console.error);

// ========== 减肥账本配置 ==========

export async function getDietConfig(ledgerId: number) {
  const db = await getLedgerDb();
  if (!db) return null;
  await ensureDietTables();
  const rows = await db.execute(sql`
    SELECT * FROM diet_ledger_config WHERE ledgerId = ${ledgerId} LIMIT 1
  `);
  const data = (rows as any)[0];
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

export async function saveDietConfig(ledgerId: number, config: {
  initialWeight: number;
  targetWeight: number;
  currentWeight?: number;
  height?: number;
  gender?: 'male' | 'female';
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("DB connection failed");
  await ensureDietTables();
  await db.execute(sql`
    INSERT INTO diet_ledger_config (ledgerId, initialWeight, targetWeight, currentWeight, height, gender)
    VALUES (${ledgerId}, ${config.initialWeight}, ${config.targetWeight}, ${config.currentWeight ?? null}, ${config.height ?? null}, ${config.gender ?? 'female'})
    ON DUPLICATE KEY UPDATE
      targetWeight = VALUES(targetWeight),
      currentWeight = COALESCE(VALUES(currentWeight), currentWeight),
      height = COALESCE(VALUES(height), height),
      gender = VALUES(gender)
  `);
}

// ========== 体重记录 ==========

export async function addWeightRecord(data: {
  ledgerId: number;
  userId: number;
  weight: number;
  note?: string;
  recordDate: string;
}) {
  const db = await getLedgerDb();
  if (!db) throw new Error("DB connection failed");
  await ensureDietTables();
  const result = await db.execute(sql`
    INSERT INTO diet_weight_records (ledgerId, userId, weight, note, recordDate)
    VALUES (${data.ledgerId}, ${data.userId}, ${data.weight}, ${data.note ?? null}, ${data.recordDate})
  `);
  // 同步更新配置里的当前体重
  await db.execute(sql`
    UPDATE diet_ledger_config SET currentWeight = ${data.weight} WHERE ledgerId = ${data.ledgerId}
  `);
  return { id: Number((result as any)[0]?.insertId || (result as any).insertId) };
}

export async function getWeightRecords(ledgerId: number, days: number = 30) {
  const db = await getLedgerDb();
  if (!db) return [];
  await ensureDietTables();
  const rows = await db.execute(sql`
    SELECT id, weight, note, recordDate, createdAt
    FROM diet_weight_records
    WHERE ledgerId = ${ledgerId}
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

export async function getCalorieRecords(ledgerId: number, days: number = 30) {
  const db = await getLedgerDb();
  if (!db) return [];
  await ensureDietTables();
  const rows = await db.execute(sql`
    SELECT id, calories, activityType, note, recordDate, createdAt
    FROM diet_calorie_records
    WHERE ledgerId = ${ledgerId}
    ORDER BY recordDate ASC
    LIMIT ${days}
  `);
  return (rows as any)[0] as any[];
}

// 按日期汇总卡路里（用于图表）
export async function getCalorieSummaryByDate(ledgerId: number, days: number = 30) {
  const db = await getLedgerDb();
  if (!db) return [];
  await ensureDietTables();
  const rows = await db.execute(sql`
    SELECT recordDate, SUM(calories) as totalCalories
    FROM diet_calorie_records
    WHERE ledgerId = ${ledgerId}
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

export async function getMealRecords(ledgerId: number, date?: string) {
  const db = await getLedgerDb();
  if (!db) return [];
  await ensureDietTables();
  let rows;
  if (date) {
    rows = await db.execute(sql`
      SELECT id, mealType, imageUrl, aiAnalysis, recordDate, createdAt
      FROM diet_meal_records
      WHERE ledgerId = ${ledgerId} AND recordDate = ${date}
      ORDER BY createdAt ASC
    `);
  } else {
    rows = await db.execute(sql`
      SELECT id, mealType, imageUrl, aiAnalysis, recordDate, createdAt
      FROM diet_meal_records
      WHERE ledgerId = ${ledgerId}
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

// ========== 综合统计 ==========

export async function getDietStats(ledgerId: number) {
  const db = await getLedgerDb();
  if (!db) return null;
  await ensureDietTables();

  const config = await getDietConfig(ledgerId);
  const weightRows = await db.execute(sql`
    SELECT weight, recordDate FROM diet_weight_records
    WHERE ledgerId = ${ledgerId}
    ORDER BY recordDate ASC
  `);
  const calorieRows = await db.execute(sql`
    SELECT SUM(calories) as total FROM diet_calorie_records
    WHERE ledgerId = ${ledgerId}
  `);

  const weights = (weightRows as any)[0] as any[];
  const totalCalories = Number((calorieRows as any)[0]?.[0]?.total || 0);

  return {
    config,
    weightHistory: weights,
    totalCaloriesBurned: totalCalories,
    currentWeight: weights.length > 0 ? Number(weights[weights.length - 1].weight) : null,
    startWeight: weights.length > 0 ? Number(weights[0].weight) : null,
  };
}
