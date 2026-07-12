/**
 * MLM 奖金制度研究平台路由
 */
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  mlmMembers,
  mlmMonthlyPerformance,
  mlmBonusRecords,
  mlmSyjkMembers,
  mlmSyjkCommissionRules,
  mlmSyjkPerformance,
  mlmSyjkBonusRecords,
  mlmSyjkConfig,
  MEMBER_LEVELS,
} from "../drizzle/schema";
import { LEVEL_CONFIG, calculateMemberBonus, calculateAllBonuses, getDirectDownline, getSubtree, determineLevelByVP } from "./mlm-bonus-engine";
import { seedDatabase, clearDatabase } from "./mlm-seed-data";
import { calculateSyjkBonuses, saveSyjkBonusResults, setCommissionRate, generateSyjkSeedData } from "./mlm-syjk-engine";

export const mlmRouter = router({
  // ── Seed / Config ──────────────────────────────────────────────────────────
  seed: router({
    run: publicProcedure.mutation(async () => seedDatabase()),
    clear: publicProcedure.mutation(async () => { await clearDatabase(); return { success: true }; }),
    status: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { count: 0, seeded: false };
      const result = await db.select({ count: sql<number>`count(*)` }).from(mlmMembers);
      return { count: result[0]?.count ?? 0, seeded: (result[0]?.count ?? 0) > 0 };
    }),
  }),

  // ── Level Config ───────────────────────────────────────────────────────────
  levels: router({
    getAll: publicProcedure.query(() => Object.entries(LEVEL_CONFIG).map(([key, val]) => ({ key, ...val }))),
  }),

  // ── Members ────────────────────────────────────────────────────────────────
  members: router({
    list: publicProcedure
      .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20), search: z.string().optional(), level: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const allMembers = await db.select().from(mlmMembers);
        let filtered = allMembers;
        if (input.search) {
          const s = input.search.toLowerCase();
          filtered = filtered.filter(m => m.name.toLowerCase().includes(s) || m.memberId.toLowerCase().includes(s));
        }
        if (input.level) filtered = filtered.filter(m => m.level === input.level);
        const paginated = filtered.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
        const result = [];
        for (const m of paginated) {
          const perf = await db.select().from(mlmMonthlyPerformance).where(and(eq(mlmMonthlyPerformance.memberId, m.id), eq(mlmMonthlyPerformance.year, year), eq(mlmMonthlyPerformance.month, month))).limit(1);
          result.push({ ...m, memberCode: m.memberId, monthlyVolume: perf[0]?.personalVP ?? 0 });
        }
        return result;
      }),

    stats: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, byLevel: [] };
      const allMembers = await db.select().from(mlmMembers);
      const byLevel = MEMBER_LEVELS.map(level => ({ level, count: allMembers.filter(m => m.level === level).length })).filter(x => x.count > 0);
      return { total: allMembers.length, byLevel };
    }),

    getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(mlmMembers).where(eq(mlmMembers.id, input.id)).limit(1);
      return result[0] ?? null;
    }),
  }),

  // ── Tree ───────────────────────────────────────────────────────────────────
  tree: router({
    getNode: publicProcedure
      .input(z.object({ memberId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const allMembers = await db.select().from(mlmMembers);
        const childrenMap = new Map<number, typeof allMembers>();
        for (const m of allMembers) {
          if (m.sponsorId !== null) {
            if (!childrenMap.has(m.sponsorId)) childrenMap.set(m.sponsorId, []);
            childrenMap.get(m.sponsorId)!.push(m);
          }
        }
        const buildNode = (member: typeof allMembers[0], depth: number): object => {
          if (depth > 5) return { ...member, children: [] };
          const children = (childrenMap.get(member.id) ?? []).map(c => buildNode(c, depth + 1));
          return { id: member.id, name: member.name, level: member.level, memberId: member.memberId, depth: member.depth, children };
        };
        if (input.memberId) {
          const root = allMembers.find(m => m.id === input.memberId);
          if (!root) return null;
          return buildNode(root, 0);
        }
        const roots = allMembers.filter(m => m.sponsorId === null);
        if (roots.length === 0) return null;
        return buildNode(roots[0], 0);
      }),
  }),

  // ── Bonuses ────────────────────────────────────────────────────────────────
  bonuses: router({
    calculate: publicProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .mutation(async ({ input }) => calculateAllBonuses(input.year, input.month)),

    summary: publicProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const records = await db.select().from(mlmBonusRecords).where(and(eq(mlmBonusRecords.year, input.year), eq(mlmBonusRecords.month, input.month)));
        if (records.length === 0) return null;
        return {
          totalRetail: records.reduce((s, r) => s + parseFloat(r.retailProfit), 0),
          totalWholesale: records.reduce((s, r) => s + parseFloat(r.wholesaleProfit), 0),
          totalRoyalty: records.reduce((s, r) => s + parseFloat(r.royaltyOverride), 0),
          totalProduction: records.reduce((s, r) => s + parseFloat(r.productionBonus), 0),
          totalAll: records.reduce((s, r) => s + parseFloat(r.totalBonus), 0),
        };
      }),

    leaderboard: publicProcedure
      .input(z.object({ year: z.number(), month: z.number(), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const records = await db.select().from(mlmBonusRecords).where(and(eq(mlmBonusRecords.year, input.year), eq(mlmBonusRecords.month, input.month))).orderBy(desc(mlmBonusRecords.totalBonus)).limit(input.limit);
        const result = [];
        for (const r of records) {
          const member = await db.select().from(mlmMembers).where(eq(mlmMembers.id, r.memberId)).limit(1);
          result.push({ ...r, memberName: member[0]?.name ?? "未知", memberCode: member[0]?.memberId ?? "", level: member[0]?.level ?? "member" });
        }
        return result;
      }),
  }),

  // ── SYJK ───────────────────────────────────────────────────────────────────
  syjk: router({
    getConfig: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { initialRate: 25 };
      const configs = await db.select().from(mlmSyjkConfig);
      const configMap: Record<string, string> = {};
      for (const c of configs) configMap[c.configKey] = c.configValue;
      return { initialRate: parseInt(configMap["initial_rate"] ?? "25", 10) };
    }),

    setConfig: publicProcedure
      .input(z.object({ initialRate: z.number().int().min(1).max(100) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("数据库连接失败");
        await db.insert(mlmSyjkConfig).values({ configKey: "initial_rate", configValue: input.initialRate.toString(), description: "公司给顶层会员的初始让利比例上限（%）" }).onDuplicateKeyUpdate({ set: { configValue: input.initialRate.toString() } });
        return { success: true };
      }),

    seed: publicProcedure
      .input(z.object({ initialRate: z.number().int().min(1).max(100).default(25) }).optional())
      .mutation(async ({ input }) => generateSyjkSeedData(input?.initialRate ?? 25)),

    clearData: publicProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");
      await db.delete(mlmSyjkBonusRecords);
      await db.delete(mlmSyjkPerformance);
      await db.delete(mlmSyjkCommissionRules);
      await db.delete(mlmSyjkMembers);
      return { success: true };
    }),

    listMembers: publicProcedure
      .input(z.object({ search: z.string().optional(), page: z.number().default(1), pageSize: z.number().default(20) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { members: [], total: 0 };
        const offset = (input.page - 1) * input.pageSize;
        const allMembers = await db.select().from(mlmSyjkMembers);
        let filtered = allMembers;
        if (input.search) {
          const s = input.search.toLowerCase();
          filtered = allMembers.filter(m => m.name.toLowerCase().includes(s) || m.memberId.toLowerCase().includes(s));
        }
        const total = filtered.length;
        const paginated = filtered.sort((a, b) => a.depth - b.depth || a.id - b.id).slice(offset, offset + input.pageSize);
        return { members: paginated, total };
      }),

    getMember: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(mlmSyjkMembers).where(eq(mlmSyjkMembers.id, input.id)).limit(1);
      return result[0] ?? null;
    }),

    addMember: publicProcedure
      .input(z.object({ name: z.string().min(1), email: z.string().email().optional(), phone: z.string().optional(), sponsorId: z.number().nullable(), initialRate: z.number().min(0).max(100).default(0) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("数据库连接失败");
        let path = "/"; let depth = 0;
        if (input.sponsorId !== null) {
          const sponsor = await db.select().from(mlmSyjkMembers).where(eq(mlmSyjkMembers.id, input.sponsorId)).limit(1);
          if (sponsor.length === 0) throw new Error("上线会员不存在");
          path = `${sponsor[0].path}${sponsor[0].id}/`;
          depth = sponsor[0].depth + 1;
        }
        const countResult = await db.select({ count: sql<number>`count(*)` }).from(mlmSyjkMembers);
        const count = countResult[0]?.count ?? 0;
        const memberId = `SYJK-${String(count + 1).padStart(6, "0")}`;
        await db.insert(mlmSyjkMembers).values({ memberId, name: input.name, email: input.email, phone: input.phone, sponsorId: input.sponsorId, receivedRate: "0.00", allocatedRate: "0.00", path, depth, isActive: true, joinDate: new Date() });
        const inserted = await db.select().from(mlmSyjkMembers).where(eq(mlmSyjkMembers.memberId, memberId)).limit(1);
        return inserted[0];
      }),

    deleteMember: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");
      await db.delete(mlmSyjkCommissionRules).where(eq(mlmSyjkCommissionRules.uplineId, input.id));
      await db.delete(mlmSyjkCommissionRules).where(eq(mlmSyjkCommissionRules.downlineId, input.id));
      await db.delete(mlmSyjkPerformance).where(eq(mlmSyjkPerformance.memberId, input.id));
      await db.delete(mlmSyjkBonusRecords).where(eq(mlmSyjkBonusRecords.memberId, input.id));
      await db.delete(mlmSyjkMembers).where(eq(mlmSyjkMembers.id, input.id));
      return { success: true };
    }),

    getDownlineRules: publicProcedure.input(z.object({ uplineId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rules = await db.select().from(mlmSyjkCommissionRules).where(eq(mlmSyjkCommissionRules.uplineId, input.uplineId));
      const result = [];
      for (const rule of rules) {
        const downline = await db.select().from(mlmSyjkMembers).where(eq(mlmSyjkMembers.id, rule.downlineId)).limit(1);
        result.push({ ...rule, downlineName: downline[0]?.name ?? "未知" });
      }
      return result;
    }),

    setRate: publicProcedure
      .input(z.object({ uplineId: z.number(), downlineId: z.number(), rate: z.number().min(0).max(100) }))
      .mutation(async ({ input }) => setCommissionRate(input.uplineId, input.downlineId, input.rate)),

    getPerformance: publicProcedure.input(z.object({ year: z.number(), month: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const perfs = await db.select().from(mlmSyjkPerformance).where(and(eq(mlmSyjkPerformance.year, input.year), eq(mlmSyjkPerformance.month, input.month)));
      const result = [];
      for (const p of perfs) {
        const member = await db.select().from(mlmSyjkMembers).where(eq(mlmSyjkMembers.id, p.memberId)).limit(1);
        result.push({ ...p, memberName: member[0]?.name ?? "未知", memberCode: member[0]?.memberId ?? "" });
      }
      return result;
    }),

    setPerformance: publicProcedure
      .input(z.object({ memberId: z.number(), year: z.number(), month: z.number(), personalRevenue: z.number().min(0) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("数据库连接失败");
        const values = { memberId: input.memberId, year: input.year, month: input.month, personalRevenue: input.personalRevenue.toFixed(2), teamRevenue: "0.00", calculated: false };
        await db.insert(mlmSyjkPerformance).values(values).onDuplicateKeyUpdate({ set: values });
        return { success: true };
      }),

    calculateBonuses: publicProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .mutation(async ({ input }) => {
        const results = await calculateSyjkBonuses(input.year, input.month);
        await saveSyjkBonusResults(results);
        return { calculated: results.length, totalBonus: results.reduce((s, r) => s + r.bonusAmount, 0), results: results.slice(0, 50) };
      }),

    getBonusResults: publicProcedure.input(z.object({ year: z.number(), month: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const records = await db.select().from(mlmSyjkBonusRecords).where(and(eq(mlmSyjkBonusRecords.year, input.year), eq(mlmSyjkBonusRecords.month, input.month))).orderBy(desc(mlmSyjkBonusRecords.bonusAmount));
      const result = [];
      for (const r of records) {
        const member = await db.select().from(mlmSyjkMembers).where(eq(mlmSyjkMembers.id, r.memberId)).limit(1);
        result.push({ ...r, memberName: member[0]?.name ?? "未知", memberCode: member[0]?.memberId ?? "", depth: member[0]?.depth ?? 0, receivedRate: member[0]?.receivedRate ?? "0", allocationDetail: r.allocationDetail ? JSON.parse(r.allocationDetail) : [] });
      }
      return result;
    }),

    getTree: publicProcedure
      .input(z.object({ rootId: z.number().optional(), maxDepth: z.number().default(5), year: z.number().optional(), month: z.number().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const allMembers = await db.select().from(mlmSyjkMembers);
        const allRules = await db.select().from(mlmSyjkCommissionRules);
        const perfMap = new Map<number, number>();
        if (input.year && input.month) {
          const perfs = await db.select().from(mlmSyjkPerformance).where(and(eq(mlmSyjkPerformance.year, input.year), eq(mlmSyjkPerformance.month, input.month)));
          for (const p of perfs) perfMap.set(p.memberId, parseFloat(p.personalRevenue));
        }
        const ruleMap = new Map<number, number>();
        for (const r of allRules) ruleMap.set(r.downlineId, parseInt(String(parseFloat(r.rate)), 10));
        const childrenMap = new Map<number, typeof allMembers>();
        for (const m of allMembers) {
          if (m.sponsorId !== null) {
            if (!childrenMap.has(m.sponsorId)) childrenMap.set(m.sponsorId, []);
            childrenMap.get(m.sponsorId)!.push(m);
          }
        }
        const buildNode = (member: typeof allMembers[0], depth: number): object => {
          const receivedRate = Math.round(parseFloat(member.receivedRate));
          const allocatedRate = Math.round(parseFloat(member.allocatedRate));
          if (depth > input.maxDepth) return { ...member, receivedRate, allocatedRate, retainedRate: receivedRate - allocatedRate, rateFromUpline: ruleMap.get(member.id) ?? 0, personalRevenue: perfMap.get(member.id) ?? 0, children: [] };
          const children = (childrenMap.get(member.id) ?? []).map(c => buildNode(c, depth + 1));
          return { id: member.id, memberId: member.memberId, name: member.name, depth: member.depth, receivedRate, allocatedRate, retainedRate: receivedRate - allocatedRate, rateFromUpline: ruleMap.get(member.id) ?? 0, isActive: member.isActive, personalRevenue: perfMap.get(member.id) ?? 0, children };
        };
        if (input.rootId) {
          const root = allMembers.find(m => m.id === input.rootId);
          if (!root) return null;
          return buildNode(root, 0);
        }
        const roots = allMembers.filter(m => m.sponsorId === null);
        return roots.map(r => buildNode(r, 0));
      }),

    getStats: publicProcedure.input(z.object({ year: z.number(), month: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const totalMembers = await db.select({ count: sql<number>`count(*)` }).from(mlmSyjkMembers);
      const activeMembers = await db.select({ count: sql<number>`count(*)` }).from(mlmSyjkMembers).where(eq(mlmSyjkMembers.isActive, true));
      const perfs = await db.select().from(mlmSyjkPerformance).where(and(eq(mlmSyjkPerformance.year, input.year), eq(mlmSyjkPerformance.month, input.month)));
      const totalRevenue = perfs.reduce((s, p) => s + parseFloat(p.personalRevenue), 0);
      const bonuses = await db.select().from(mlmSyjkBonusRecords).where(and(eq(mlmSyjkBonusRecords.year, input.year), eq(mlmSyjkBonusRecords.month, input.month)));
      const totalBonus = bonuses.reduce((s, b) => s + parseFloat(b.bonusAmount), 0);
      const allMembers = await db.select().from(mlmSyjkMembers);
      const maxDepth = allMembers.reduce((max, m) => Math.max(max, m.depth), 0);
      const config = await db.select().from(mlmSyjkConfig).where(eq(mlmSyjkConfig.configKey, "initial_rate")).limit(1);
      const initialRate = parseFloat(config[0]?.configValue ?? "25");
      return {
        totalMembers: totalMembers[0]?.count ?? 0, activeMembers: activeMembers[0]?.count ?? 0,
        totalRevenue, totalBonus, bonusRatio: totalRevenue > 0 ? (totalBonus / totalRevenue) * 100 : 0,
        companyRevenue: totalRevenue - totalBonus, maxDepth, initialRate,
        depthDistribution: Array.from({ length: maxDepth + 1 }, (_, d) => ({ depth: d, count: allMembers.filter(m => m.depth === d).length })),
      };
    }),

    getBonusChain: publicProcedure.input(z.object({ memberId: z.number(), year: z.number(), month: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { chain: [] };
      const member = await db.select().from(mlmSyjkMembers).where(eq(mlmSyjkMembers.id, input.memberId)).limit(1);
      if (!member[0]) return { chain: [] };
      const chain: { name: string; depth: number; gaveRate: number; keptRate: number }[] = [];
      const allRules = await db.select().from(mlmSyjkCommissionRules);
      const ruleMap = new Map<number, { rate: string; uplineId: number }>();
      for (const r of allRules) ruleMap.set(r.downlineId, { rate: r.rate, uplineId: r.uplineId });
      const path: typeof member[0][] = [member[0]];
      let parentId = member[0].sponsorId;
      while (parentId !== null) {
        const parent = await db.select().from(mlmSyjkMembers).where(eq(mlmSyjkMembers.id, parentId)).limit(1);
        if (!parent[0]) break;
        path.unshift(parent[0]);
        parentId = parent[0].sponsorId;
      }
      for (const node of path) {
        const received = parseFloat(node.receivedRate);
        const allocated = parseFloat(node.allocatedRate);
        const kept = received - allocated;
        const gaveToNext = path.indexOf(node) < path.length - 1 ? parseFloat(ruleMap.get(path[path.indexOf(node) + 1]?.id ?? 0)?.rate ?? "0") : 0;
        chain.push({ name: node.name, depth: node.depth, gaveRate: gaveToNext, keptRate: kept });
      }
      return { chain };
    }),
  }),
});
