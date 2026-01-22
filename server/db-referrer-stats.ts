import { getDb } from "./db";
import { contacts } from "../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * 介绍人贡献统计接口
 */
export interface ReferrerStat {
  contactId: number;
  contactName: string;
  contactTitle: string | null;
  directReferrals: number; // 直接介绍数量（一度人脉）
  indirectReferrals: number; // 间接介绍数量（二度及以上人脉）
  totalScore: number; // 总贡献分（递减权重计算）
}

/**
 * 递归查询某个人介绍的所有下级人脉，并计算递减权重贡献分
 * @param contactId 介绍人ID
 * @param parentUserId 家长用户ID
 * @param depth 当前递归深度（1=直接介绍，2=二度，3=三度...）
 * @returns 返回 { direct: 直接介绍数量, indirect: 间接介绍数量, weightedScore: 加权贡献分 }
 */
async function countReferrals(
  contactId: number,
  parentUserId: number,
  depth: number = 1
): Promise<{ direct: number; indirect: number; weightedScore: number }> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    throw new Error("Database not available");
  }
  
  // 查询由该contactId直接介绍的所有人脉
  const directReferrals = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.parentUserId, parentUserId),
        eq(contacts.referrerId, contactId)
      )
    );

  let directCount = 0;
  let indirectCount = 0;
  let weightedScore = 0;

  // 当前层的权重：第1层=1.0，第2层=0.5，第3层=0.25...
  // 公式：weight = 0.5^(depth-1)
  const currentWeight = Math.pow(0.5, depth - 1);

  if (depth === 1) {
    // 第一层：这些是直接介绍的人脉
    directCount = directReferrals.length;
    // 第一层的贡献分 = 人数 * 1.0
    weightedScore = directCount * currentWeight;
    
    // 递归查询每个直接介绍的人脉的下级（这些是间接介绍）
    for (const referral of directReferrals) {
      const subCounts = await countReferrals(referral.id, parentUserId, depth + 1);
      indirectCount += subCounts.direct + subCounts.indirect;
      weightedScore += subCounts.weightedScore;
    }
  } else {
    // 第二层及以上：这些都算作间接介绍
    indirectCount = directReferrals.length;
    // 当前层的贡献分 = 人数 * 当前层权重
    weightedScore = indirectCount * currentWeight;
    
    // 继续递归查询下级
    for (const referral of directReferrals) {
      const subCounts = await countReferrals(referral.id, parentUserId, depth + 1);
      indirectCount += subCounts.direct + subCounts.indirect;
      weightedScore += subCounts.weightedScore;
    }
  }

  return { direct: directCount, indirect: indirectCount, weightedScore };
}

/**
 * 获取介绍人贡献统计排行榜
 * @param parentUserId 家长用户ID
 * @returns 返回排行榜数据，按总贡献分降序排列
 * 
 * 贡献分计算规则（递减权重）：
 * - 第1层（直接推荐）：权重 = 1.0
 * - 第2层（间接推荐）：权重 = 0.5
 * - 第3层：权重 = 0.25
 * - 第N层：权重 = 0.5^(N-1)
 * 
 * 示例：张三 → 李四 → 王五 → 赵六
 * 张三的贡献分 = 1.0（李四）+ 0.5（王五）+ 0.25（赵六）= 1.75分
 */
export async function getReferrerStats(
  parentUserId: number
): Promise<ReferrerStat[]> {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) {
    throw new Error("Database not available");
  }
  
  // 获取该家长的所有人脉
  const allContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.parentUserId, parentUserId));

  const stats: ReferrerStat[] = [];

  // 对每个人脉，计算其介绍的直接和间接人脉数量及加权贡献分
  for (const contact of allContacts) {
    const counts = await countReferrals(contact.id, parentUserId);
    
    // 只统计有介绍记录的人脉
    if (counts.direct > 0 || counts.indirect > 0) {
      stats.push({
        contactId: contact.id,
        contactName: contact.name,
        contactTitle: contact.title,
        directReferrals: counts.direct,
        indirectReferrals: counts.indirect,
        totalScore: Math.round(counts.weightedScore * 10) / 10, // 保留一位小数
      });
    }
  }

  // 按总贡献分降序排列
  stats.sort((a, b) => b.totalScore - a.totalScore);

  return stats;
}
