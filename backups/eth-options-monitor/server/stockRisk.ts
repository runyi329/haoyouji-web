/**
 * A 股风控工具 tRPC 路由
 * 复刻 backups/stock-risk-control/api.py 的全部逻辑
 * 数据来源：tushare Pro API（TUSHARE_TOKEN 环境变量）
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { stockRiskHistory, stockRiskPlans } from "../drizzle/schema";
import { desc, sql, eq, and } from "drizzle-orm";

// ─── tushare HTTP 调用 ────────────────────────────────────────────

async function tushareCall(apiName: string, params: Record<string, unknown>, fields: string): Promise<Record<string, unknown>[]> {
  const token = ENV.tushareToken;
  const res = await fetch("https://api.tushare.pro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_name: apiName, token, params, fields }),
  });
  const json = await res.json() as { code: number; msg: string; data: { fields: string[]; items: unknown[][] } };
  if (json.code !== 0) throw new Error(`tushare ${apiName} error: ${json.msg}`);
  const { fields: cols, items } = json.data;
  return items.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// ─── 规则配置（与 api.py 完全一致）────────────────────────────────

const RULES = [
  { id: "normal",         name: "普通股（无特殊风险）",   desc: "无以下任何风险标记，按基础利率计算",                         prob: 1.81, loss: 27,  add_rate: 0.49, level: "base", check_fn: null },
  { id: "net_asset_down", name: "归母净资产持续下降",     desc: "近两个完整会计年度归母净资产持续缩减",                       prob: 3.93, loss: 27,  add_rate: 1.06, level: "mid",  check_fn: "check_net_asset_down" },
  { id: "small_cap",      name: "小市值股",               desc: "总市值低于阈值，退市风险显著偏高",                           prob: 1.35, loss: 80,  add_rate: 1.08, level: "mid",  check_fn: "check_small_cap",      threshold: 30, threshold_unit: "亿" },
  { id: "loss2y",         name: "连续两年亏损（ST高危）", desc: "近两个完整会计年度净利润均为负",                             prob: 5.24, loss: 27,  add_rate: 1.41, level: "high", check_fn: "check_loss2y" },
  { id: "april_risk",     name: "年报季持有亏损记录股",   desc: "近两年内有亏损记录，且当前处于4月年报披露期",               prob: 5.43, loss: 27,  add_rate: 1.47, level: "high", check_fn: "check_april_risk" },
  { id: "pledge_high",    name: "大股东高比例质押",       desc: "大股东质押比例超过阈值，爆仓风险叠加戴帽风险",              prob: 2.71, loss: 40,  add_rate: 1.08, level: "mid",  check_fn: "check_pledge_high",    threshold: 70, threshold_unit: "%" },
  { id: "margin_blowup",  name: "保证金覆盖不足风险",     desc: "保证金比例低于股票单日最大跌幅，存在当日穿仓风险",          level: "high", check_fn: "check_margin_blowup", is_dynamic: true },
];

// ─── 穿仓概率数据表 ───────────────────────────────────────────────

const BLOWUP_REAL: Record<string, Record<number, [number, number, number]>> = {
  "20cm": {
    5:  [0.6703 * 2.5, 4.5,  0.6703 * 2.5 / 100 * 4.5 * 252],
    10: [0.7618, 2.24, (3.63 + 5.01)],
    15: [0.7618 * 0.35, 3.5, 0.7618 * 0.35 / 100 * 3.5 * 252],
    20: [0.7618 * 0.05, 1.5, 0.7618 * 0.05 / 100 * 1.5 * 252],
  },
  "10cm": {
    5:  [0.89 * 2.0, 3.0, 0.89 * 2.0 / 100 * 3.0 * 252],
    10: [0.89, 1.5, 0.89 / 100 * 1.5 * 252],
    15: [0.0, 0.0, 0.0],
    20: [0.0, 0.0, 0.0],
  },
  "5cm": {
    5:  [0.0, 0.0, 0.0],
    10: [0.0, 0.0, 0.0],
    15: [0.0, 0.0, 0.0],
    20: [0.0, 0.0, 0.0],
  },
};

// ─── 辅助函数 ─────────────────────────────────────────────────────

function fmtYi(val: number): string {
  const yi = val / 1e8;
  if (Math.abs(yi) >= 100) return `${yi.toFixed(1)}亿`;
  if (Math.abs(yi) >= 1)   return `${yi.toFixed(2)}亿`;
  return `${(val / 1e4).toFixed(0)}万`;
}

function fmtProfit(val: number): string {
  const yi = val / 1e8;
  const sign = yi > 0 ? "+" : "";
  if (Math.abs(yi) >= 100) return `${sign}${yi.toFixed(1)}亿`;
  if (Math.abs(yi) >= 1)   return `${sign}${yi.toFixed(2)}亿`;
  return `${sign}${(val / 1e4).toFixed(0)}万`;
}

function normalizeCode(code: string): string {
  code = code.trim().toUpperCase();
  if (code.includes(".")) return code;
  const digits = code.replace(/[^0-9]/g, "").padStart(6, "0");
  return digits.startsWith("6") || digits.startsWith("5") ? `${digits}.SH` : `${digits}.SZ`;
}

function getStockType(tsCode: string, name: string, market: string): "10cm" | "20cm" | "5cm" {
  if (name.includes("ST") || name.includes("*ST")) return "5cm";
  if (["科创板", "创业板"].includes(market) || /^(688|300|301)/.test(tsCode)) return "20cm";
  return "10cm";
}

// ─── 检测函数 ─────────────────────────────────────────────────────

interface Cache {
  income: Array<{ end_date: string; n_income_attr_p: number | null }>;
  balance: Array<{ end_date: string; total_hldr_eqy_exc_min_int: number | null }>;
  mv: number | null;
  pledge: number | null;
  stockType: "10cm" | "20cm" | "5cm";
}

function checkLoss2y(cache: Cache): { hit: boolean; detail: string } {
  if (cache.income.length < 2) return { hit: false, detail: "财务数据不足" };
  const rows = cache.income.slice(0, 2);
  const allLoss = rows.every(r => r.n_income_attr_p !== null && Number(r.n_income_attr_p) < 0);
  if (allLoss) {
    const lines = rows.map(r => `${String(r.end_date).slice(0, 4)}年净利润 ${fmtProfit(Number(r.n_income_attr_p))}`);
    return { hit: true, detail: lines.join("；") };
  }
  return { hit: false, detail: "" };
}

function checkNetAssetDown(cache: Cache): { hit: boolean; detail: string } {
  if (cache.balance.length < 2) return { hit: false, detail: "财务数据不足" };
  const rows = cache.balance.slice(0, 3);
  const v0 = Number(rows[0]?.total_hldr_eqy_exc_min_int);
  const v1 = Number(rows[1]?.total_hldr_eqy_exc_min_int);
  if (!isNaN(v0) && !isNaN(v1) && v0 < v1) {
    const lines = rows.filter(r => r.total_hldr_eqy_exc_min_int !== null)
      .map(r => `${String(r.end_date).slice(0, 4)}年 ${fmtYi(Number(r.total_hldr_eqy_exc_min_int))}`);
    const pct = Math.abs((v0 - v1) / Math.abs(v1) * 100);
    return { hit: true, detail: lines.join("；") + `（同比下降 ${pct.toFixed(1)}%）` };
  }
  return { hit: false, detail: "" };
}

function checkSmallCap(cache: Cache): { hit: boolean; detail: string } {
  if (cache.mv !== null && cache.mv < 30) {
    return { hit: true, detail: `当前总市值 ${cache.mv.toFixed(2)}亿，低于30亿警戒线` };
  }
  return { hit: false, detail: "" };
}

function checkAprilRisk(cache: Cache): { hit: boolean; detail: string } {
  if (new Date().getMonth() + 1 !== 4) return { hit: false, detail: "当前非4月年报披露期" };
  for (const row of cache.income.slice(0, 2)) {
    if (row.n_income_attr_p !== null && Number(row.n_income_attr_p) < 0) {
      const year = String(row.end_date).slice(0, 4);
      return { hit: true, detail: `当前处于4月年报披露期，${year}年净利润 ${fmtProfit(Number(row.n_income_attr_p))}` };
    }
  }
  return { hit: false, detail: "" };
}

function checkPledgeHigh(cache: Cache): { hit: boolean; detail: string } {
  if (cache.pledge !== null && cache.pledge > 70) {
    return { hit: true, detail: `大股东质押比例 ${cache.pledge.toFixed(1)}%，超过70%警戒线` };
  }
  return { hit: false, detail: "" };
}

function checkMarginBlowup(cache: Cache, marginPct: number): { hit: boolean; detail: string; blowupProb: number; addRate: number } {
  const table = BLOWUP_REAL[cache.stockType] ?? BLOWUP_REAL["10cm"];
  const thresholds = Object.keys(table).map(Number).sort((a, b) => a - b);
  const key = thresholds.reduce((prev, cur) => Math.abs(cur - marginPct) < Math.abs(prev - marginPct) ? cur : prev);
  const [blowupProbPct, avgExcessPct, annualExpectedPct] = table[key];
  const limitMap: Record<string, string> = { "10cm": "10%", "20cm": "20%", "5cm": "5%" };
  const addRate = Math.min(Math.round(annualExpectedPct * 100) / 100, 8.0);
  const detail = `股票类型 ${cache.stockType}（每日最大跌幅${limitMap[cache.stockType]}），保证金${marginPct}%，实测单日穿仓概率 ${blowupProbPct.toFixed(4)}%，穿仓时平均超额跌幅 ${avgExcessPct.toFixed(2)}%，年化期望损失率 ${annualExpectedPct.toFixed(2)}%`;
  return { hit: annualExpectedPct >= 0.1, detail, blowupProb: blowupProbPct, addRate };
}

// ─── 数据拉取 ─────────────────────────────────────────────────────

async function fetchCache(tsCode: string): Promise<Cache> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 4 * 365 * 24 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

  const [income, balance, dailyBasic, pledge] = await Promise.allSettled([
    tushareCall("income", { ts_code: tsCode, start_date: fmt(startDate), end_date: fmt(endDate), period_type: "A" }, "end_date,n_income_attr_p"),
    tushareCall("balancesheet", { ts_code: tsCode, start_date: fmt(startDate), end_date: fmt(endDate), period_type: "A" }, "end_date,total_hldr_eqy_exc_min_int"),
    tushareCall("daily_basic", { ts_code: tsCode, trade_date: fmt(endDate) }, "ts_code,total_mv"),
    tushareCall("pledge_stat", { ts_code: tsCode }, "ts_code,pledge_ratio"),
  ]);

  const incomeData = income.status === "fulfilled"
    ? income.value.sort((a, b) => String(b.end_date).localeCompare(String(a.end_date))) as Cache["income"]
    : [];

  const balanceData = balance.status === "fulfilled"
    ? balance.value.sort((a, b) => String(b.end_date).localeCompare(String(a.end_date))) as Cache["balance"]
    : [];

  let mv: number | null = null;
  if (dailyBasic.status === "fulfilled" && dailyBasic.value.length > 0) {
    mv = Number(dailyBasic.value[0].total_mv) / 10000;
  } else {
    // 尝试往前找最近交易日
    for (let i = 1; i <= 10; i++) {
      const d = new Date(endDate.getTime() - i * 24 * 3600 * 1000);
      try {
        const rows = await tushareCall("daily_basic", { ts_code: tsCode, trade_date: fmt(d) }, "ts_code,total_mv");
        if (rows.length > 0) { mv = Number(rows[0].total_mv) / 10000; break; }
      } catch { /* continue */ }
    }
  }

  let pledgeRatio: number | null = null;
  if (pledge.status === "fulfilled" && pledge.value.length > 0) {
    pledgeRatio = Number(pledge.value[0].pledge_ratio);
  }

  return { income: incomeData, balance: balanceData, mv, pledge: pledgeRatio, stockType: "10cm" };
}

// ─── 单只股票检测 ─────────────────────────────────────────────────

async function checkStock(tsCode: string, baseRate: number, marginPct: number) {
  const infoRows = await tushareCall("stock_basic", { ts_code: tsCode, list_status: "L" }, "ts_code,name,market,list_status");
  if (infoRows.length === 0) return { error: `未找到股票 ${tsCode}，请检查代码` };
  const info = infoRows[0];
  const name = String(info.name ?? tsCode);
  const market = String(info.market ?? "");

  const cache = await fetchCache(tsCode);
  cache.stockType = getStockType(tsCode, name, market);

  const checkers: Record<string, (c: Cache) => { hit: boolean; detail: string }> = {
    check_loss2y: checkLoss2y,
    check_net_asset_down: checkNetAssetDown,
    check_small_cap: checkSmallCap,
    check_april_risk: checkAprilRisk,
    check_pledge_high: checkPledgeHigh,
  };

  const hitItems: Array<{ rule: typeof RULES[number]; detail: string }> = [];
  for (const rule of RULES) {
    if (!rule.check_fn || rule.check_fn === "check_margin_blowup") continue;
    const fn = checkers[rule.check_fn];
    if (!fn) continue;
    try {
      const res = fn(cache);
      if (res.hit) hitItems.push({ rule, detail: res.detail });
    } catch { /* skip */ }
  }

  const marginRes = checkMarginBlowup(cache, marginPct);
  const marginItem = {
    id: "margin_blowup",
    name: `保证金覆盖不足风险（保证金${marginPct}%）`,
    add_rate: marginRes.addRate,
    detail: marginRes.detail,
    level: marginRes.hit ? "high" : "base",
    blowup_prob: Math.round(marginRes.blowupProb * 10000) / 100,
    stock_type: cache.stockType,
  };

  const rateBreakdown = hitItems.map(item => ({
    id: (item.rule as Record<string, unknown>).id as string,
    name: item.rule.name,
    add_rate: (item.rule as Record<string, unknown>).add_rate as number,
    detail: item.detail,
    level: item.rule.level,
  }));
  if (marginRes.hit) rateBreakdown.push(marginItem);

  const totalAdd = rateBreakdown.length > 0 ? Math.round(rateBreakdown.reduce((s, x) => s + x.add_rate, 0) * 100) / 100 : 0;
  const accountRate = Math.round((baseRate + totalAdd) * 100) / 100;

  // 强平规则
  const FORCE_CLOSE_RATIO = 0.90;
  const forceClosePct = Math.round(marginPct * FORCE_CLOSE_RATIO * 100) / 100;
  const limitMap: Record<string, number> = { "10cm": 10, "20cm": 20, "5cm": 5 };
  const dailyLimit = limitMap[cache.stockType] ?? 10;
  const forceCloseRisk = dailyLimit >= forceClosePct ? "high" : dailyLimit * 0.9 >= forceClosePct ? "medium" : "low";
  const forceCloseInfo = {
    trigger_pct: forceClosePct,
    margin_pct: marginPct,
    force_close_ratio: FORCE_CLOSE_RATIO,
    daily_limit: dailyLimit,
    stock_type: cache.stockType,
    risk_level: forceCloseRisk,
    desc: `保证金${marginPct}%，亏失达到${forceClosePct}%（即保证金的90%）时强平。该股每日最大跌幅${dailyLimit}%，${forceCloseRisk === "high" ? "一个跌停就可能触发强平。" : `跌幅超过${forceClosePct}%即触发强平，盘中可以补仓避免。`}`,
  };

  // all_rules
  const allRules = RULES.filter(r => r.check_fn && !r.is_dynamic).map(rule => {
    const isHit = hitItems.some(x => (x.rule as Record<string, unknown>).id === rule.id);
    const hitDetail = isHit ? (hitItems.find(x => (x.rule as Record<string, unknown>).id === rule.id)?.detail ?? "") : "";
    return { id: rule.id, name: rule.name, add_rate: (rule as Record<string, unknown>).add_rate as number ?? 0, hit: isHit, detail: hitDetail, level: rule.level };
  });
  allRules.push({ id: "margin_blowup", name: marginItem.name, add_rate: marginItem.add_rate, hit: marginRes.hit, detail: marginItem.detail, level: marginItem.level });

  return {
    ts_code: tsCode,
    name,
    stock_type: cache.stockType,
    market_cap_yi: cache.mv !== null ? Math.round(cache.mv * 100) / 100 : null,
    pledge_ratio: cache.pledge !== null ? Math.round(cache.pledge * 10) / 10 : null,
    hits: rateBreakdown.map(x => x.id),
    rate_breakdown: rateBreakdown,
    all_rules: allRules,
    margin_item: marginItem,
    force_close_info: forceCloseInfo,
    total_add: totalAdd,
    base_rate: baseRate,
    margin_pct: marginPct,
    account_rate: accountRate,
    is_multi: rateBreakdown.length >= 2,
  };
}

// ─── tRPC 路由 ────────────────────────────────────────────────────

export const stockRiskRouter = router({
  /** 从本地数据库搜索股票名称（毫秒级） */
  searchStock: publicProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { name: "", ts_code: "" };
      const raw = input.code.trim();
      const digits = raw.replace(/[^0-9]/g, "").padStart(6, "0");
      // 用 drizzle sql 模板查询 stock_risk_stocks 表（列名用数据库实际列名 ts_code）
      const rows = await db.execute(sql`SELECT name, ts_code FROM stock_risk_stocks WHERE symbol = ${raw} LIMIT 1`) as unknown as [Array<{ name: string; ts_code: string }>];
      const result = Array.isArray(rows[0]) ? rows[0][0] : (rows[0] as any);
      if (result?.name) return { name: result.name, ts_code: result.ts_code };
      // 尝试补零匹配
      const rows2 = await db.execute(sql`SELECT name, ts_code FROM stock_risk_stocks WHERE symbol = ${digits} LIMIT 1`) as unknown as [Array<{ name: string; ts_code: string }>];
      const result2 = Array.isArray(rows2[0]) ? rows2[0][0] : (rows2[0] as any);
      return result2?.name ? { name: result2.name, ts_code: result2.ts_code } : { name: "", ts_code: "" };
    }),

  /** 检测股票风险，返回加息明细和账户利率 */
  check: publicProcedure
    .input(z.object({
      stocks: z.array(z.string()).max(10),
      base_rate: z.number().default(12),
      margin_pct: z.number().int().default(10),
      board_types: z.array(z.enum(["main", "star", "gem", "st"])).optional(),
    }))
    .mutation(async ({ input }) => {
      const { stocks, base_rate, margin_pct, board_types } = input;

      // 空股票：按选中板块计算加成
      if (stocks.length === 0) {
        const boards = board_types && board_types.length > 0 ? board_types : ["main"];
        // 板块对应的 stock_type
        const stockTypeMap: Record<string, string> = { main: "10cm", star: "20cm", gem: "20cm", st: "5cm" };
        // 板块对应的风险规则命中情况
        const boardHitsMap: Record<string, string[]> = {
          main: [],                              // 沪深主板：无额外风险
          star: ["margin_blowup"],               // 科创板：±20cm，保证金覆盖风险
          gem:  ["margin_blowup"],               // 创业板：±20cm，保证金覆盖风险
          st:   ["loss2y", "net_asset_down"],    // ST：连续亏损+净资产下降
        };
        // 合并所有选中板块的命中规则（去重）
        const hitIdSet = new Set<string>();
        boards.forEach(b => (boardHitsMap[b] ?? []).forEach(id => hitIdSet.add(id)));
        const hitIds = Array.from(hitIdSet);
        // 计算保证金覆盖风险（取最严格板块）
        const hasHighCm = boards.some(b => b === "star" || b === "gem");
        const hasSt = boards.some(b => b === "st");
        const worstStockType = hasHighCm ? "20cm" : hasSt ? "5cm" : "10cm";
        const blowupData = BLOWUP_REAL[worstStockType]?.[margin_pct];
        let marginAddRate = 0;
        if (blowupData && blowupData[2] > 0) {
          marginAddRate = Math.round(blowupData[2] * 100) / 100;
        }
        // 构建规则列表
        const boardRules = RULES.filter(r => r.id !== "normal" && !(r as Record<string, unknown>).is_dynamic).map(r => ({
          id: r.id, name: r.name,
          add_rate: (r as Record<string, unknown>).add_rate as number ?? 0,
          hit: hitIds.includes(r.id),
          detail: hitIds.includes(r.id) ? r.desc ?? "" : "",
          level: r.level,
        }));
        if (hasHighCm || hasSt) {
          boardRules.push({ id: "margin_blowup", name: `保证金覆盖不足风险（${worstStockType === "20cm" ? "科创/创业板±20%" : "ST±5%"}，保证金${margin_pct}%）`, add_rate: marginAddRate, hit: marginAddRate > 0, detail: marginAddRate > 0 ? `${worstStockType === "20cm" ? "科创/创业板单日最大跌幅20%" : "ST单日最大跌幅5%"}，保证金${margin_pct}%，存在当日穿仓风险` : "", level: "high" });
        }
        const totalAdd = boardRules.filter(r => r.hit).reduce((s, r) => s + r.add_rate, 0);
        const boardRate = Math.round((base_rate + totalAdd) * 100) / 100;
        const boardNames: Record<string, string> = { main: "沪深主板", star: "科创板", gem: "创业板", st: "ST股" };
        const boardLabel = boards.map(b => boardNames[b] ?? b).join(" + ");
        return {
          results: [{ ts_code: "BOARD", name: boardLabel, account_rate: boardRate, hits: boardRules.filter(r => r.hit).map(r => r.id), all_rules: boardRules, is_board_case: true, base_rate, total_add: Math.round(totalAdd * 100) / 100 }],
          account_rate: boardRate,
          account_add: Math.round((boardRate - base_rate) * 100) / 100,
          all_hits: boardRules.filter(r => r.hit).map(r => r.id),
          base_rate,
        };
      }

      const results = await Promise.all(
        stocks.map(async (raw) => {
          const tsCode = normalizeCode(raw);
          try { return await checkStock(tsCode, base_rate, margin_pct); }
          catch (e) { return { ts_code: tsCode, error: String(e) }; }
        })
      );

      const valid = results.filter(r => "account_rate" in r) as Array<{ account_rate: number; hits: string[] }>;
      const accountRate = valid.length > 0 ? Math.max(...valid.map(r => r.account_rate)) : base_rate;
      const allHitsSet = new Set(valid.flatMap(r => r.hits));
      const allHits = Array.from(allHitsSet);

      return {
        results,
        account_rate: Math.round(accountRate * 100) / 100,
        account_add: Math.round((accountRate - base_rate) * 100) / 100,
        all_hits: allHits,
        base_rate,
      };
    }),

  /** 获取查询历史（最新50条） */
  getHistory: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(stockRiskHistory).orderBy(desc(stockRiskHistory.createdAt)).limit(50);
  }),

  /** 保存查询历史 */
  saveHistory: publicProcedure
    .input(z.object({
      symbols: z.array(z.string()),
      names: z.array(z.string()),
      baseRate: z.number(),
      totalRate: z.number(),
      highestSymbol: z.string().optional(),
      highestName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.insert(stockRiskHistory).values({
        symbols: JSON.stringify(input.symbols),
        names: JSON.stringify(input.names),
        baseRate: input.baseRate,
        totalRate: input.totalRate,
        highestSymbol: input.highestSymbol ?? null,
        highestName: input.highestName ?? null,
      });
      return { success: true };
    }),

  /** 批量导入股票数据（管理用，仅本地调用） */
  importStocks: publicProcedure
    .input(z.object({
      stocks: z.array(z.object({
        symbol: z.string(),
        name: z.string(),
        ts_code: z.string(),
      })).max(200),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, count: 0 };
      const { stockRiskStocks } = await import("../drizzle/schema");
      // 使用 mysql2 原生连接直接执行 INSERT，绕过 drizzle prepared statement
      const mysql2 = await import('mysql2/promise');
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        for (const s of input.stocks) {
          await conn.execute(
            'INSERT INTO stock_risk_stocks (symbol, name, ts_code) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=?, ts_code=?',
            [s.symbol, s.name, s.ts_code, s.name, s.ts_code]
          );
        }
      } finally {
        await conn.end();
      }
      return { success: true, count: input.stocks.length };
    }),

  /** 保存方案 */
  savePlan: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(50),
      baseRate: z.number(),
      marginPct: z.number().int(),
      boardTypes: z.array(z.string()),
      stocks: z.array(z.object({ code: z.string(), name: z.string().nullable() })),
      monthlyRate: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(stockRiskPlans).values({
        userId: ctx.user.id,
        name: input.name,
        baseRate: input.baseRate,
        marginPct: input.marginPct,
        boardTypes: JSON.stringify(input.boardTypes),
        stocks: JSON.stringify(input.stocks),
        monthlyRate: input.monthlyRate,
      });
      return { success: true };
    }),

  /** 获取当前用户的方案列表 */
  listPlans: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(stockRiskPlans)
      .where(eq(stockRiskPlans.userId, ctx.user.id))
      .orderBy(desc(stockRiskPlans.updatedAt))
      .limit(20);
    return rows.map(r => ({
      ...r,
      boardTypes: JSON.parse(r.boardTypes) as string[],
      stocks: JSON.parse(r.stocks) as Array<{ code: string; name: string | null }>,
    }));
  }),

  /** 更新方案 */
  updatePlan: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).max(50),
      baseRate: z.number(),
      marginPct: z.number().int(),
      boardTypes: z.array(z.string()),
      stocks: z.array(z.object({ code: z.string(), name: z.string().nullable() })),
      monthlyRate: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(stockRiskPlans)
        .set({
          name: input.name,
          baseRate: input.baseRate,
          marginPct: input.marginPct,
          boardTypes: JSON.stringify(input.boardTypes),
          stocks: JSON.stringify(input.stocks),
          updatedAt: new Date(),
        })
        .where(and(eq(stockRiskPlans.id, input.id), eq(stockRiskPlans.userId, ctx.user.id)));
      return { success: true };
    }),

  /** 删除方案 */
  deletePlan: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(stockRiskPlans).where(
        and(eq(stockRiskPlans.id, input.id), eq(stockRiskPlans.userId, ctx.user.id))
      );
      return { success: true };
    }),

  /** 返回规则配置（前端用于渲染利率加成表） */
  getRules: publicProcedure.query(() => {
    const DEFAULT_BASE_RATE = 12.0;
    return {
      base_rate: DEFAULT_BASE_RATE,
      rules: RULES.filter(r => r.id !== "normal").map(r => {
        const rr = r as Record<string, unknown>;
        const isDynamic = !!rr.is_dynamic;
        const addRate = (rr.add_rate as number) ?? 0;
        return {
          id: r.id,
          name: r.name,
          desc: r.desc,
          level: r.level,
          add_rate: isDynamic ? null : addRate,
          is_dynamic: isDynamic,
          suggest_rate: isDynamic ? null : Math.round((DEFAULT_BASE_RATE + addRate) * 100) / 100,
        };
      }),
    };
  }),
});
