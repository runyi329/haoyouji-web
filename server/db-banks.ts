import { db } from './db';
import { banks } from '../drizzle/schema-banks';
import { eq, ilike, desc, sql } from 'drizzle-orm';

/**
 * 预置的常用银行列表
 */
const PRESET_BANKS = [
  '中国工商银行',
  '中国农业银行',
  '中国银行',
  '中国建设银行',
  '交通银行',
  '中国邮政储蓄银行',
  '招商银行',
  '浦发银行',
  '中信银行',
  '中国光大银行',
  '华夏银行',
  '中国民生银行',
  '广发银行',
  '平安银行',
  '兴业银行',
  '浙商银行',
  '上海银行',
  '北京银行',
  '江苏银行',
  '宁波银行',
];

/**
 * 初始化银行数据库
 * 如果数据库为空，则插入预置银行列表
 */
export async function initializeBanks() {
  try {
    const existingBanks = await db.select().from(banks).limit(1);
    
    if (existingBanks.length === 0) {
      // 数据库为空，插入预置银行
      for (const bankName of PRESET_BANKS) {
        await db.insert(banks).values({
          name: bankName,
          usageCount: 0,
        }).onConflictDoNothing();
      }
      console.log(`[Banks] Initialized with ${PRESET_BANKS.length} preset banks`);
    }
  } catch (error) {
    console.error('[Banks] Failed to initialize:', error);
  }
}

/**
 * 搜索银行（模糊匹配）
 */
export async function searchBanks(query: string) {
  if (!query || query.trim() === '') {
    // 如果没有查询，返回使用次数最多的前20个
    return await db
      .select()
      .from(banks)
      .orderBy(desc(banks.usageCount))
      .limit(20);
  }
  
  // 模糊搜索
  return await db
    .select()
    .from(banks)
    .where(ilike(banks.name, `%${query}%`))
    .orderBy(desc(banks.usageCount))
    .limit(10);
}

/**
 * 添加或更新银行
 * 如果银行已存在，增加使用次数；否则创建新银行
 */
export async function addOrUpdateBank(bankName: string) {
  if (!bankName || bankName.trim() === '') {
    return null;
  }
  
  const trimmedName = bankName.trim();
  
  try {
    // 检查银行是否已存在
    const existing = await db
      .select()
      .from(banks)
      .where(eq(banks.name, trimmedName))
      .limit(1);
    
    if (existing.length > 0) {
      // 银行已存在，增加使用次数
      await db
        .update(banks)
        .set({
          usageCount: sql`${banks.usageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(banks.id, existing[0].id));
      
      return existing[0];
    } else {
      // 银行不存在，创建新银行
      const newBank = await db
        .insert(banks)
        .values({
          name: trimmedName,
          usageCount: 1,
        })
        .returning();
      
      console.log(`[Banks] New bank added: ${trimmedName}`);
      return newBank[0];
    }
  } catch (error) {
    console.error('[Banks] Failed to add/update bank:', error);
    return null;
  }
}

/**
 * 获取所有银行（按使用次数排序）
 */
export async function getAllBanks() {
  return await db
    .select()
    .from(banks)
    .orderBy(desc(banks.usageCount));
}
