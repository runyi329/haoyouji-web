/**
 * Herbalife Bonus Calculation Engine
 * Implements the complete Herbalife Sales & Marketing Plan compensation logic
 */

import { and, eq, like, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  mlmMembers,
  mlmMonthlyPerformance,
  mlmBonusRecords,
  type MlmMember,
  type MemberLevel,
} from "../drizzle/schema";

// ─── Level Configuration ──────────────────────────────────────────────────────

export const LEVEL_CONFIG: Record<
  MemberLevel,
  {
    label: string;
    labelEn: string;
    discountRate: number;
    minVP: number;
    royaltyRate: number;
    royaltyLevels: number;
    productionRate: number;
    isTabTeam: boolean;
    color: string;
    sortOrder: number;
  }
> = {
  member: { label: "会员", labelEn: "Member", discountRate: 25, minVP: 0, royaltyRate: 0, royaltyLevels: 0, productionRate: 0, isTabTeam: false, color: "#6b7280", sortOrder: 1 },
  senior_consultant: { label: "高级顾问", labelEn: "Senior Consultant", discountRate: 35, minVP: 500, royaltyRate: 0, royaltyLevels: 0, productionRate: 0, isTabTeam: false, color: "#2563eb", sortOrder: 2 },
  qualified_producer: { label: "合格生产者", labelEn: "Qualified Producer", discountRate: 42, minVP: 1000, royaltyRate: 0, royaltyLevels: 0, productionRate: 0, isTabTeam: false, color: "#7c3aed", sortOrder: 3 },
  supervisor: { label: "主管", labelEn: "Supervisor", discountRate: 50, minVP: 2500, royaltyRate: 5, royaltyLevels: 3, productionRate: 0, isTabTeam: false, color: "#0891b2", sortOrder: 4 },
  world_team: { label: "世界队", labelEn: "World Team", discountRate: 50, minVP: 10000, royaltyRate: 5, royaltyLevels: 3, productionRate: 0, isTabTeam: false, color: "#059669", sortOrder: 5 },
  get_team: { label: "全球扩展团队", labelEn: "Global Expansion Team", discountRate: 50, minVP: 20000, royaltyRate: 5, royaltyLevels: 3, productionRate: 2, isTabTeam: true, color: "#d97706", sortOrder: 6 },
  millionaire_team: { label: "百万富翁团队", labelEn: "Millionaire Team", discountRate: 50, minVP: 50000, royaltyRate: 5, royaltyLevels: 3, productionRate: 4, isTabTeam: true, color: "#dc2626", sortOrder: 7 },
  presidents_team: { label: "总裁团队", labelEn: "President's Team", discountRate: 50, minVP: 100000, royaltyRate: 5, royaltyLevels: 3, productionRate: 7, isTabTeam: true, color: "#b45309", sortOrder: 8 },
};

export const VP_TO_PRICE = 1.0;

export function determineLevelByVP(personalVP: number): MemberLevel {
  if (personalVP >= 100000) return "presidents_team";
  if (personalVP >= 50000) return "millionaire_team";
  if (personalVP >= 20000) return "get_team";
  if (personalVP >= 10000) return "world_team";
  if (personalVP >= 2500) return "supervisor";
  if (personalVP >= 1000) return "qualified_producer";
  if (personalVP >= 500) return "senior_consultant";
  return "member";
}

export async function getAncestors(memberId: number): Promise<MlmMember[]> {
  const db = await getDb();
  if (!db) return [];
  const member = await db.select().from(mlmMembers).where(eq(mlmMembers.id, memberId)).limit(1);
  if (!member[0] || !member[0].path) return [];
  const pathParts = member[0].path.split("/").filter((p) => p !== "" && p !== String(memberId));
  if (pathParts.length === 0) return [];
  const ancestorIds = pathParts.map(Number);
  const ancestors = await db.select().from(mlmMembers).where(sql`${mlmMembers.id} IN (${sql.join(ancestorIds.map((id) => sql`${id}`), sql`, `)})`);
  return ancestors.sort((a, b) => b.depth - a.depth);
}

export async function getDirectDownline(memberId: number): Promise<MlmMember[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mlmMembers).where(eq(mlmMembers.sponsorId, memberId));
}

export async function getSubtree(memberId: number): Promise<MlmMember[]> {
  const db = await getDb();
  if (!db) return [];
  const member = await db.select().from(mlmMembers).where(eq(mlmMembers.id, memberId)).limit(1);
  if (!member[0]) return [];
  const pathPrefix = `${member[0].path}${memberId}/`;
  return db.select().from(mlmMembers).where(like(mlmMembers.path, `${pathPrefix}%`));
}

export interface BonusBreakdown {
  memberId: number;
  memberName: string;
  level: MemberLevel;
  personalVP: number;
  groupVP: number;
  retailProfit: number;
  wholesaleProfit: number;
  royaltyOverride: number;
  royaltyDetail: Array<{ fromMemberId: number; fromMemberName: string; fromLevel: MemberLevel; relativeDepth: number; vpContributed: number; rate: number; amount: number }>;
  productionBonus: number;
  productionDetail: { orgTotalVP: number; rate: number; amount: number } | null;
  annualBonus: number;
  totalBonus: number;
}

export async function calculateMemberBonus(memberId: number, year: number, month: number): Promise<BonusBreakdown | null> {
  const db = await getDb();
  if (!db) return null;
  const memberResult = await db.select().from(mlmMembers).where(eq(mlmMembers.id, memberId)).limit(1);
  if (!memberResult[0]) return null;
  const member = memberResult[0];

  const perfResult = await db.select().from(mlmMonthlyPerformance).where(and(eq(mlmMonthlyPerformance.memberId, memberId), eq(mlmMonthlyPerformance.year, year), eq(mlmMonthlyPerformance.month, month))).limit(1);
  const personalVP = perfResult[0] ? parseFloat(String(perfResult[0].personalVP)) : 0;
  const currentLevel = determineLevelByVP(personalVP);
  const config = LEVEL_CONFIG[currentLevel];

  const retailProfit = personalVP * (config.discountRate / 100) * VP_TO_PRICE;

  const directDownline = await getDirectDownline(memberId);
  let wholesaleProfit = 0;
  for (const downlineMember of directDownline) {
    const downlinePerf = await db.select().from(mlmMonthlyPerformance).where(and(eq(mlmMonthlyPerformance.memberId, downlineMember.id), eq(mlmMonthlyPerformance.year, year), eq(mlmMonthlyPerformance.month, month))).limit(1);
    const downlineVP = downlinePerf[0] ? parseFloat(String(downlinePerf[0].personalVP)) : 0;
    const downlineLevel = determineLevelByVP(downlineVP);
    const downlineDiscount = LEVEL_CONFIG[downlineLevel].discountRate;
    const discountDiff = config.discountRate - downlineDiscount;
    if (discountDiff > 0) wholesaleProfit += (discountDiff / 100) * downlineVP * VP_TO_PRICE;
  }

  const royaltyDetail: BonusBreakdown["royaltyDetail"] = [];
  let royaltyOverride = 0;
  if (config.royaltyLevels > 0 && config.royaltyRate > 0) {
    const subtree = await getSubtree(memberId);
    for (const downlineMember of subtree) {
      const relativeDepth = downlineMember.depth - member.depth;
      if (relativeDepth > 3 || relativeDepth <= 0) continue;
      const downlinePerf = await db.select().from(mlmMonthlyPerformance).where(and(eq(mlmMonthlyPerformance.memberId, downlineMember.id), eq(mlmMonthlyPerformance.year, year), eq(mlmMonthlyPerformance.month, month))).limit(1);
      const downlineVP = downlinePerf[0] ? parseFloat(String(downlinePerf[0].personalVP)) : 0;
      const downlineLevel = determineLevelByVP(downlineVP);
      if (LEVEL_CONFIG[downlineLevel].sortOrder >= LEVEL_CONFIG["supervisor"].sortOrder) {
        const amount = (config.royaltyRate / 100) * downlineVP * VP_TO_PRICE;
        royaltyOverride += amount;
        royaltyDetail.push({ fromMemberId: downlineMember.id, fromMemberName: downlineMember.name, fromLevel: downlineLevel, relativeDepth, vpContributed: downlineVP, rate: config.royaltyRate, amount });
      }
    }
  }

  let productionBonus = 0;
  let productionDetail: BonusBreakdown["productionDetail"] = null;
  if (config.isTabTeam && config.productionRate > 0) {
    const subtree = await getSubtree(memberId);
    let orgTotalVP = personalVP;
    for (const downlineMember of subtree) {
      const downlinePerf = await db.select().from(mlmMonthlyPerformance).where(and(eq(mlmMonthlyPerformance.memberId, downlineMember.id), eq(mlmMonthlyPerformance.year, year), eq(mlmMonthlyPerformance.month, month))).limit(1);
      orgTotalVP += downlinePerf[0] ? parseFloat(String(downlinePerf[0].personalVP)) : 0;
    }
    productionBonus = (config.productionRate / 100) * orgTotalVP * VP_TO_PRICE;
    productionDetail = { orgTotalVP, rate: config.productionRate, amount: productionBonus };
  }

  const annualBonus = currentLevel === "presidents_team" ? personalVP * 0.01 * VP_TO_PRICE : 0;
  const totalBonus = retailProfit + wholesaleProfit + royaltyOverride + productionBonus + annualBonus;

  const subtreeForGroup = await getSubtree(memberId);
  let groupVP = personalVP;
  for (const d of subtreeForGroup) {
    const dp = await db.select().from(mlmMonthlyPerformance).where(and(eq(mlmMonthlyPerformance.memberId, d.id), eq(mlmMonthlyPerformance.year, year), eq(mlmMonthlyPerformance.month, month))).limit(1);
    groupVP += dp[0] ? parseFloat(String(dp[0].personalVP)) : 0;
  }

  return { memberId, memberName: member.name, level: currentLevel, personalVP, groupVP, retailProfit, wholesaleProfit, royaltyOverride, royaltyDetail, productionBonus, productionDetail, annualBonus, totalBonus };
}

export async function calculateAllBonuses(year: number, month: number): Promise<{ success: boolean; count: number }> {
  const db = await getDb();
  if (!db) return { success: false, count: 0 };
  const allMembers = await db.select().from(mlmMembers);
  let count = 0;
  for (const member of allMembers) {
    const breakdown = await calculateMemberBonus(member.id, year, month);
    if (!breakdown) continue;
    await db.insert(mlmBonusRecords).values({
      memberId: member.id, year, month,
      retailProfit: String(breakdown.retailProfit.toFixed(2)),
      wholesaleProfit: String(breakdown.wholesaleProfit.toFixed(2)),
      royaltyOverride: String(breakdown.royaltyOverride.toFixed(2)),
      productionBonus: String(breakdown.productionBonus.toFixed(2)),
      annualBonus: String(breakdown.annualBonus.toFixed(2)),
      totalBonus: String(breakdown.totalBonus.toFixed(2)),
      royaltyDetail: JSON.stringify(breakdown.royaltyDetail),
      productionDetail: JSON.stringify(breakdown.productionDetail),
    }).onDuplicateKeyUpdate({
      set: {
        retailProfit: String(breakdown.retailProfit.toFixed(2)),
        wholesaleProfit: String(breakdown.wholesaleProfit.toFixed(2)),
        royaltyOverride: String(breakdown.royaltyOverride.toFixed(2)),
        productionBonus: String(breakdown.productionBonus.toFixed(2)),
        annualBonus: String(breakdown.annualBonus.toFixed(2)),
        totalBonus: String(breakdown.totalBonus.toFixed(2)),
        royaltyDetail: JSON.stringify(breakdown.royaltyDetail),
        productionDetail: JSON.stringify(breakdown.productionDetail),
      },
    });
    await db.update(mlmMembers).set({ level: breakdown.level }).where(eq(mlmMembers.id, member.id));
    count++;
  }
  return { success: true, count };
}
