/**
 * 数研金控「让利制」无限代奖金计算引擎
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import {
  mlmSyjkMembers,
  mlmSyjkCommissionRules,
  mlmSyjkPerformance,
  mlmSyjkBonusRecords,
  mlmSyjkConfig,
} from "../drizzle/schema";

export interface AllocationItem {
  downlineId: number;
  downlineName: string;
  rate: number;
  downlineRevenue: number;
  bonusFromDownline: number;
}

export interface SyjkBonusResult {
  memberId: number;
  memberCode: string;
  memberName: string;
  year: number;
  month: number;
  personalRevenue: number;
  teamRevenue: number;
  revenueBase: number;
  receivedRate: number;
  allocatedRate: number;
  retainedRate: number;
  bonusAmount: number;
  allocationDetail: AllocationItem[];
}

export function validateRateSetting(uplineReceivedRate: number, currentAllocatedToOthers: number, newRate: number, currentRate: number): { valid: boolean; reason?: string } {
  if (newRate < 0) return { valid: false, reason: "让利比例不能为负数" };
  if (newRate < currentRate) return { valid: false, reason: `让利比例只能调高，不能从 ${currentRate}% 降低到 ${newRate}%` };
  const totalAfterSetting = currentAllocatedToOthers + newRate;
  const maxAllowable = uplineReceivedRate - 1;
  if (totalAfterSetting > maxAllowable) {
    const available = maxAllowable - currentAllocatedToOthers;
    return { valid: false, reason: `超出可让利额度。上线获得 ${uplineReceivedRate}%，已分配给其他下线 ${currentAllocatedToOthers}%，最多还可分配 ${available.toFixed(2)}%（上线需保留至少1%）` };
  }
  return { valid: true };
}

export async function calculateSyjkBonuses(year: number, month: number): Promise<SyjkBonusResult[]> {
  const db = await getDb();
  if (!db) throw new Error("数据库连接失败");

  const allMembers = await db.select().from(mlmSyjkMembers).where(eq(mlmSyjkMembers.isActive, true));
  if (allMembers.length === 0) return [];

  const allRules = await db.select().from(mlmSyjkCommissionRules);
  const performances = await db.select().from(mlmSyjkPerformance).where(and(eq(mlmSyjkPerformance.year, year), eq(mlmSyjkPerformance.month, month)));

  const perfMap = new Map<number, number>();
  for (const p of performances) perfMap.set(p.memberId, parseFloat(p.personalRevenue));

  const ruleMap = new Map<number, { downlineId: number; rate: number }[]>();
  for (const rule of allRules) {
    if (!ruleMap.has(rule.uplineId)) ruleMap.set(rule.uplineId, []);
    ruleMap.get(rule.uplineId)!.push({ downlineId: rule.downlineId, rate: parseFloat(rule.rate) });
  }

  const memberMap = new Map<number, typeof allMembers[0]>();
  for (const m of allMembers) memberMap.set(m.id, m);

  const childrenMap = new Map<number, number[]>();
  for (const m of allMembers) {
    if (m.sponsorId !== null) {
      if (!childrenMap.has(m.sponsorId)) childrenMap.set(m.sponsorId, []);
      childrenMap.get(m.sponsorId)!.push(m.id);
    }
  }

  const teamRevenueMap = new Map<number, number>();
  function calcTeamRevenue(memberId: number): number {
    const children = childrenMap.get(memberId) ?? [];
    let teamTotal = 0;
    for (const childId of children) {
      const childPersonal = perfMap.get(childId) ?? 0;
      const childTeam = calcTeamRevenue(childId);
      teamTotal += childPersonal + childTeam;
    }
    teamRevenueMap.set(memberId, teamTotal);
    return teamTotal;
  }

  const rootMembers = allMembers.filter((m) => m.sponsorId === null);
  for (const root of rootMembers) calcTeamRevenue(root.id);

  const results: SyjkBonusResult[] = [];
  for (const member of allMembers) {
    const personalRevenue = perfMap.get(member.id) ?? 0;
    const teamRevenue = teamRevenueMap.get(member.id) ?? 0;
    const revenueBase = personalRevenue + teamRevenue;
    const receivedRate = parseFloat(member.receivedRate);
    const allocatedRate = parseFloat(member.allocatedRate);
    const retainedRate = receivedRate - allocatedRate;
    const bonusAmount = (revenueBase * retainedRate) / 100;

    const downlineRules = ruleMap.get(member.id) ?? [];
    const allocationDetail: AllocationItem[] = [];
    for (const rule of downlineRules) {
      const downlineMember = memberMap.get(rule.downlineId);
      if (!downlineMember) continue;
      const downlinePersonal = perfMap.get(rule.downlineId) ?? 0;
      const downlineTeam = teamRevenueMap.get(rule.downlineId) ?? 0;
      const downlineBase = downlinePersonal + downlineTeam;
      allocationDetail.push({ downlineId: rule.downlineId, downlineName: downlineMember.name, rate: rule.rate, downlineRevenue: downlineBase, bonusFromDownline: (downlineBase * rule.rate) / 100 });
    }

    results.push({ memberId: member.id, memberCode: member.memberId, memberName: member.name, year, month, personalRevenue, teamRevenue, revenueBase, receivedRate, allocatedRate, retainedRate, bonusAmount, allocationDetail });
  }

  return results;
}

export async function saveSyjkBonusResults(results: SyjkBonusResult[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("数据库连接失败");
  for (const r of results) {
    const values = {
      memberId: r.memberId, year: r.year, month: r.month,
      revenueBase: r.revenueBase.toFixed(2),
      receivedRateSnapshot: r.receivedRate.toFixed(2),
      retainedRate: r.retainedRate.toFixed(2),
      bonusAmount: r.bonusAmount.toFixed(2),
      allocationDetail: JSON.stringify(r.allocationDetail),
      sourceDetail: JSON.stringify({ personalRevenue: r.personalRevenue, teamRevenue: r.teamRevenue }),
    };
    await db.insert(mlmSyjkBonusRecords).values(values).onDuplicateKeyUpdate({ set: values });
  }
  if (results.length > 0) {
    await db.update(mlmSyjkPerformance).set({ calculated: true }).where(and(eq(mlmSyjkPerformance.year, results[0].year), eq(mlmSyjkPerformance.month, results[0].month)));
  }
}

export async function setCommissionRate(uplineId: number, downlineId: number, newRate: number): Promise<{ success: boolean; message: string; newRate?: number }> {
  const db = await getDb();
  if (!db) return { success: false, message: "数据库连接失败" };
  const uplineResult = await db.select().from(mlmSyjkMembers).where(eq(mlmSyjkMembers.id, uplineId)).limit(1);
  if (uplineResult.length === 0) return { success: false, message: "上线会员不存在" };
  const upline = uplineResult[0];
  const existingRule = await db.select().from(mlmSyjkCommissionRules).where(and(eq(mlmSyjkCommissionRules.uplineId, uplineId), eq(mlmSyjkCommissionRules.downlineId, downlineId))).limit(1);
  const currentRate = existingRule.length > 0 ? parseFloat(existingRule[0].rate) : 0;
  const currentMaxRate = existingRule.length > 0 ? parseFloat(existingRule[0].maxRate) : 0;
  const otherRules = await db.select().from(mlmSyjkCommissionRules).where(eq(mlmSyjkCommissionRules.uplineId, uplineId));
  let allocatedToOthers = 0;
  for (const rule of otherRules) {
    if (rule.downlineId !== downlineId) allocatedToOthers += parseFloat(rule.rate);
  }
  const validation = validateRateSetting(parseFloat(upline.receivedRate), allocatedToOthers, newRate, currentRate);
  if (!validation.valid) return { success: false, message: validation.reason! };
  const newMaxRate = Math.max(newRate, currentMaxRate);
  if (existingRule.length > 0) {
    await db.update(mlmSyjkCommissionRules).set({ rate: newRate.toFixed(2), maxRate: newMaxRate.toFixed(2) }).where(and(eq(mlmSyjkCommissionRules.uplineId, uplineId), eq(mlmSyjkCommissionRules.downlineId, downlineId)));
  } else {
    await db.insert(mlmSyjkCommissionRules).values({ uplineId, downlineId, rate: newRate.toFixed(2), maxRate: newMaxRate.toFixed(2) });
  }
  await db.update(mlmSyjkMembers).set({ receivedRate: newRate.toFixed(2) }).where(eq(mlmSyjkMembers.id, downlineId));
  const totalAllocated = allocatedToOthers + newRate;
  await db.update(mlmSyjkMembers).set({ allocatedRate: totalAllocated.toFixed(2) }).where(eq(mlmSyjkMembers.id, uplineId));
  return { success: true, message: "让利比例设置成功", newRate };
}

export async function generateSyjkSeedData(initialRate: number = 25): Promise<{ created: number; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("数据库连接失败");

  await db.delete(mlmSyjkBonusRecords);
  await db.delete(mlmSyjkPerformance);
  await db.delete(mlmSyjkCommissionRules);
  await db.delete(mlmSyjkMembers);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  type NodeDef = [string, number, number, number];
  const surnames = ["张","李","王","陈","刘","赵","孙","周","吴","郑","冯","蒋","韩","杨","林","何","许","曹","谢","邓","彭","苏","丁","魏","薛","叶","阎","余","潘","杜","戴"];
  const roles = ["总监","经理","主任","专员","助理","会员","新人","代理","顾问","合伙人"];
  let nameCounter = 0;
  function genName(depth: number): string {
    const s = surnames[nameCounter % surnames.length];
    const r = roles[Math.min(depth, roles.length - 1)];
    nameCounter++;
    return `${s}${r}${nameCounter}`;
  }

  const nodes: NodeDef[] = [];
  const receivedRates: number[] = [];
  const allocatedSoFar: number[] = [];

  function addNode(name: string, sponsorIdx: number, rate: number, revenue: number): number {
    const idx = nodes.length;
    nodes.push([name, sponsorIdx, rate, revenue]);
    receivedRates.push(rate);
    allocatedSoFar.push(0);
    if (sponsorIdx >= 0) allocatedSoFar[sponsorIdx] += rate;
    return idx;
  }

  function getAvailable(idx: number): number {
    return receivedRates[idx] - 1 - allocatedSoFar[idx];
  }

  function depthOf(idx: number): number {
    let depth = 0;
    let cur = idx;
    while (nodes[cur][1] !== -1) { depth++; cur = nodes[cur][1]; }
    return depth;
  }

  addNode(genName(0), -1, initialRate, 50000);
  for (let d = 1; d < initialRate; d++) {
    const parentIdx = d - 1;
    const parentRate = receivedRates[parentIdx];
    if (parentRate <= 1) break;
    const rate = parentRate - 1;
    const revenue = Math.max(500, 50000 - d * 1500);
    addNode(genName(d), parentIdx, rate, revenue);
  }

  let safetyCounter = 0;
  while (safetyCounter < 500) {
    safetyCounter++;
    let added = false;
    for (let i = 0; i < nodes.length; i++) {
      const avail = getAvailable(i);
      if (avail >= 1) {
        const rate = avail;
        const revenue = Math.max(300, 20000 - nodes.length * 150);
        addNode(genName(Math.min(depthOf(i) + 1, 9)), i, rate, revenue);
        added = true;
        break;
      }
    }
    if (!added) break;
  }

  const pathArr: string[] = [];
  const depthArr: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const sponsorIdx = nodes[i][1];
    if (sponsorIdx === -1) { pathArr.push("/"); depthArr.push(0); }
    else { pathArr.push(`${pathArr[sponsorIdx]}__ID${sponsorIdx}__/`); depthArr.push(depthArr[sponsorIdx] + 1); }
  }

  const insertedIds: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const [name, sponsorIdx, rate] = nodes[i];
    const sponsorId = sponsorIdx === -1 ? null : insertedIds[sponsorIdx];
    const memberId = `SYJK-${String(i + 1).padStart(6, "0")}`;
    let realPath = pathArr[i];
    for (let j = 0; j < i; j++) realPath = realPath.replace(`__ID${j}__`, String(insertedIds[j]));

    await db.insert(mlmSyjkMembers).values({
      memberId, name, sponsorId,
      receivedRate: String(Math.round(rate)),
      allocatedRate: String(allocatedSoFar[i]),
      path: realPath, depth: depthArr[i], isActive: true,
      joinDate: new Date(now.getTime() - Math.random() * 365 * 24 * 3600 * 1000),
    });

    const inserted = await db.select({ id: mlmSyjkMembers.id }).from(mlmSyjkMembers).where(eq(mlmSyjkMembers.memberId, memberId)).limit(1);
    insertedIds.push(inserted[0].id);
  }

  for (let i = 0; i < nodes.length; i++) {
    await db.insert(mlmSyjkPerformance).values({ memberId: insertedIds[i], year, month, personalRevenue: String(Math.round(nodes[i][3])), teamRevenue: "0", calculated: false });
  }

  for (let i = 0; i < nodes.length; i++) {
    const [, sponsorIdx, rate] = nodes[i];
    if (sponsorIdx === -1) continue;
    await db.insert(mlmSyjkCommissionRules).values({ uplineId: insertedIds[sponsorIdx], downlineId: insertedIds[i], rate: String(Math.round(rate)), maxRate: String(Math.round(rate)) });
  }

  await db.insert(mlmSyjkConfig).values({ configKey: "initial_rate", configValue: initialRate.toString(), description: "公司给顶层会员的初始让利比例上限（%）" }).onDuplicateKeyUpdate({ set: { configValue: initialRate.toString() } });

  const maxDepth = Math.max(...depthArr);
  return { created: nodes.length, message: `成功生成 ${nodes.length} 名模拟会员，最深 ${maxDepth} 层让利链路` };
}
