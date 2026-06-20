import { getDb } from "./db";
import { contacts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

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
 * 获取介绍人贡献统计排行榜
 * 优化：一条SQL查出所有人脉，在内存中递归计算，消除N+1递归DB查询
 *
 * 贡献分计算规则（递减权重）：
 * - 第1层（直接推荐）：权重 = 1.0
 * - 第2层（间接推荐）：权重 = 0.5
 * - 第3层：权重 = 0.25
 * - 第N层：权重 = 0.5^(N-1)
 */
export async function getReferrerStats(
  parentUserId: number
): Promise<ReferrerStat[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 一条SQL查出所有人脉（只取需要的字段）
  const allContacts = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      title: contacts.title,
      referrerId: contacts.referrerId,
    })
    .from(contacts)
    .where(eq(contacts.parentUserId, parentUserId));

  if (allContacts.length === 0) return [];

  // 构建 referrerId → 直接下级ID列表 的 Map（在内存中）
  const childrenMap = new Map<number, number[]>();
  const contactMap = new Map<number, { name: string; title: string | null }>();

  for (const c of allContacts) {
    contactMap.set(c.id, { name: c.name, title: c.title });
    if (c.referrerId) {
      if (!childrenMap.has(c.referrerId)) childrenMap.set(c.referrerId, []);
      childrenMap.get(c.referrerId)!.push(c.id);
    }
  }

  // 在内存中递归计算贡献分（无数据库查询）
  function calcReferrals(
    contactId: number,
    depth: number,
    visited: Set<number>
  ): { direct: number; indirect: number; weightedScore: number } {
    if (visited.has(contactId)) return { direct: 0, indirect: 0, weightedScore: 0 };
    visited.add(contactId);
    const children = childrenMap.get(contactId) || [];
    const currentWeight = Math.pow(0.5, depth - 1);
    let direct = 0, indirect = 0, weightedScore = 0;
    if (depth === 1) {
      direct = children.length;
      weightedScore = direct * currentWeight;
      for (const childId of children) {
        const sub = calcReferrals(childId, depth + 1, visited);
        indirect += sub.direct + sub.indirect;
        weightedScore += sub.weightedScore;
      }
    } else {
      indirect = children.length;
      weightedScore = indirect * currentWeight;
      for (const childId of children) {
        const sub = calcReferrals(childId, depth + 1, visited);
        indirect += sub.direct + sub.indirect;
        weightedScore += sub.weightedScore;
      }
    }
    return { direct, indirect, weightedScore };
  }

  const stats: ReferrerStat[] = [];
  for (const c of allContacts) {
    const visited = new Set<number>();
    const counts = calcReferrals(c.id, 1, visited);
    if (counts.direct > 0 || counts.indirect > 0) {
      const info = contactMap.get(c.id)!;
      stats.push({
        contactId: c.id,
        contactName: info.name,
        contactTitle: info.title,
        directReferrals: counts.direct,
        indirectReferrals: counts.indirect,
        totalScore: Math.round(counts.weightedScore * 10) / 10,
      });
    }
  }
  stats.sort((a, b) => b.totalScore - a.totalScore);
  return stats;
}
