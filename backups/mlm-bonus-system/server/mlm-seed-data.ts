/**
 * Seed data generator for Herbalife MLM simulation
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { mlmMembers, mlmMonthlyPerformance, mlmBonusRules } from "../drizzle/schema";
import { LEVEL_CONFIG, determineLevelByVP } from "./mlm-bonus-engine";

const CHINESE_SURNAMES = ["王","李","张","刘","陈","杨","黄","赵","吴","周","徐","孙","马","朱","胡","郭","何","高","林","郑"];
const CHINESE_GIVEN = ["伟","芳","娜","秀英","敏","静","丽","强","磊","洋","艳","勇","军","杰","娟","涛","明","超","秀兰","霞","平","刚","桂英","华","玲"];

function randomName(): string {
  const surname = CHINESE_SURNAMES[Math.floor(Math.random() * CHINESE_SURNAMES.length)];
  const given = CHINESE_GIVEN[Math.floor(Math.random() * CHINESE_GIVEN.length)];
  return surname + given;
}

function randomVPForLevel(level: string): number {
  const ranges: Record<string, [number, number]> = {
    member: [50, 499], senior_consultant: [500, 999], qualified_producer: [1000, 2499],
    supervisor: [2500, 9999], world_team: [10000, 19999], get_team: [20000, 49999],
    millionaire_team: [50000, 99999], presidents_team: [100000, 150000],
  };
  const [min, max] = ranges[level] || [50, 499];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface SeedMember {
  memberId: string;
  name: string;
  sponsorIndex: number | null;
  targetLevel: string;
}

function buildSeedTree(): SeedMember[] {
  const tree: SeedMember[] = [];
  let counter = 1;
  const addMember = (sponsorIndex: number | null, level: string): number => {
    const idx = tree.length;
    tree.push({ memberId: `HBL-${String(counter++).padStart(6, "0")}`, name: randomName(), sponsorIndex, targetLevel: level });
    return idx;
  };

  const root = addMember(null, "presidents_team");
  const mil1 = addMember(root, "millionaire_team");
  const mil2 = addMember(root, "millionaire_team");
  const mil3 = addMember(root, "get_team");
  const get1 = addMember(mil1, "get_team"); const get2 = addMember(mil1, "world_team");
  const get3 = addMember(mil2, "get_team"); const get4 = addMember(mil2, "world_team");
  const get5 = addMember(mil3, "get_team"); const get6 = addMember(mil3, "supervisor");
  const supervisors: number[] = [];
  const parents = [get1, get2, get3, get4, get5, get6];
  for (const parent of parents) {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const level = Math.random() > 0.6 ? "supervisor" : "world_team";
      supervisors.push(addMember(parent, level));
    }
  }
  const producers: number[] = [];
  for (const sup of supervisors) {
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const level = Math.random() > 0.5 ? "qualified_producer" : "senior_consultant";
      producers.push(addMember(sup, level));
    }
  }
  for (const prod of producers.slice(0, 20)) {
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) addMember(prod, "member");
  }
  return tree;
}

export async function seedDatabase(): Promise<{ success: boolean; message: string; count: number }> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database not available", count: 0 };

  const existing = await db.select({ count: sql<number>`count(*)` }).from(mlmMembers);
  if (existing[0]?.count > 0) return { success: true, message: "Database already has data", count: existing[0].count };

  for (const [level, config] of Object.entries(LEVEL_CONFIG)) {
    await db.insert(mlmBonusRules).values({
      name: config.label, level: level as any, discountRate: String(config.discountRate),
      minVP: String(config.minVP), royaltyRate: String(config.royaltyRate),
      royaltyLevels: config.royaltyLevels, productionRate: String(config.productionRate),
      isTabTeam: config.isTabTeam, color: config.color, sortOrder: config.sortOrder,
    });
  }

  const seedTree = buildSeedTree();
  const insertedIds: number[] = [];

  for (let i = 0; i < seedTree.length; i++) {
    const seed = seedTree[i];
    const sponsorId = seed.sponsorIndex !== null ? insertedIds[seed.sponsorIndex] : null;
    let path = "/";
    let depth = 0;
    if (sponsorId !== null) {
      const sponsor = await db.select().from(mlmMembers).where(eq(mlmMembers.id, sponsorId)).limit(1);
      if (sponsor[0]) { path = `${sponsor[0].path}${sponsorId}/`; depth = sponsor[0].depth + 1; }
    }
    const config = LEVEL_CONFIG[seed.targetLevel as keyof typeof LEVEL_CONFIG];
    const [result] = await db.insert(mlmMembers).values({
      memberId: seed.memberId, name: seed.name, sponsorId: sponsorId ?? undefined,
      level: seed.targetLevel as any, discountRate: String(config.discountRate),
      path, depth, isActive: true, country: "CN",
      joinDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
    });
    insertedIds.push((result as any).insertId);
  }

  const now = new Date();
  for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
    const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    for (let i = 0; i < seedTree.length; i++) {
      const vp = randomVPForLevel(seedTree[i].targetLevel);
      await db.insert(mlmMonthlyPerformance).values({
        memberId: insertedIds[i], year, month,
        personalVP: String(vp), groupVP: String(vp),
        levelSnapshot: seedTree[i].targetLevel as any, calculated: false,
      });
    }
  }

  return { success: true, message: `Seeded ${seedTree.length} members with 3 months of performance data`, count: seedTree.length };
}

export async function clearDatabase(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mlmMonthlyPerformance);
  await db.delete(mlmMembers);
}
