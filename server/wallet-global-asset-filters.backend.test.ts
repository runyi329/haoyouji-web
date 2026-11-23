import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { DatabaseSync as SqliteDatabase } from "node:sqlite";
import { runInNewContext } from "node:vm";
import { TRPCError } from "@trpc/server";
import ts from "typescript";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { AI_WALLET_SETTLEMENT_ASSETS } from "../shared/ai-wallet-assets";
import {
  buildWalletAssetFilterSql,
  getWalletAssetCategory,
  getWalletAssetFilterCodes,
  getWalletAssetFilterLabel,
  matchesWalletAssetFilter,
  normalizeWalletAssetCode,
  type WalletAssetFilterCategory,
} from "../shared/wallet-asset-filters";

// Vite 5 predates node:sqlite; keep this built-in out of its module resolver.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

// Never import miban, database modules, env setup or infrastructure implementations.
// Execute the real AST callback against a private SQLite :memory: database. Only
// fixture setup uses local DDL/inserts; the callback adapter accepts SELECT only.
const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("miban.ts", source, ts.ScriptTarget.Latest, true);
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${label}`);
  return value;
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  function visit(node: ts.Node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}
function evaluate<T>(code: string, bindings: Record<string, unknown>): T {
  return runInNewContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, bindings, { timeout: 1000 }) as T;
}
const property = required(nodes(ast, ts.isPropertyAssignment).find(node =>
  node.name.getText(ast) === "walletGlobalHistory"), "walletGlobalHistory");
const calls = nodes(property.initializer, ts.isCallExpression);
const query = required(calls.find(node => ts.isPropertyAccessExpression(node.expression)
  && node.expression.name.text === "query"), "query");
const callback = required(query.arguments[0], "query callback");
const inputCall = required(calls.find(node => ts.isPropertyAccessExpression(node.expression)
  && node.expression.name.text === "input"), "input");
const schema = evaluate<z.ZodTypeAny>(`(${inputCall.arguments[0].getText(ast)});`, { z });

type Fixture = {
  id: number; currency: string | null; userId?: number; amount?: string;
  balance?: string | null; note?: string; date?: string; type?: string; relatedId?: number | null;
};
const fixtureCurrencies = [null, "", " \t\n ", "u", " UsDt ", "CNY", "rmb", " 人民币 ",
  "eth", " BTC ", "NEWCOIN", "MSTR", "CRCL", "USDC", "BTY"];
const fixtures: readonly Fixture[] = Object.freeze(fixtureCurrencies.map((currency, index) =>
  Object.freeze({ id: index + 1, currency, userId: index % 2 ? 29 : 28,
    amount: index % 2 ? "-3.125" : "0.125", balance: "123.875", note: `测试流水 ${index + 1}`,
    date: `2026-11-${String(index + 1).padStart(2, "0")} 12:00:00` })));

/** Minimal syntax shim, not a JS reimplementation of currency/category predicates.
 * The complete real UNION, deduplication, WHERE, COUNT, ORDER BY and LIMIT execute
 * in SQLite. MySQL text/date functions are registered locally with compatible semantics.
 */
function sqliteSql(sql: string): string {
  let text = sql;
  while (/CONVERT\(/i.test(text)) {
    const start = required(/CONVERT\(/i.exec(text)?.index, "CONVERT offset");
    const open = start + "CONVERT".length;
    let depth = 1;
    let quote = "";
    let end = open + 1;
    for (; end < text.length && depth; end++) {
      const char = text[end];
      if (quote) {
        if (char === quote && text[end + 1] === quote) end++;
        else if (char === quote) quote = "";
      } else if (char === "'" || char === '"') quote = char;
      else if (char === "(") depth++;
      else if (char === ")") depth--;
    }
    if (depth) throw new Error("Unbalanced production CONVERT");
    const body = text.slice(open + 1, end - 1);
    expect(body).toMatch(/\s+USING utf8mb4$/i);
    text = text.slice(0, start) + "(" + body.replace(/\s+USING utf8mb4$/i, "") + ")" + text.slice(end);
  }
  return text.replace(/\s+COLLATE utf8mb4_0900_ai_ci/gi, "")
    .replace(/DATE_ADD\(\?, INTERVAL 1 DAY\)/g, "datetime(?, '+1 day')")
    .replace(/TIMESTAMPDIFF\(SECOND,/g, "TIMESTAMPDIFF('SECOND',")
    .replace(/AS UNSIGNED/g, "AS INTEGER");
}
function harness(rows: readonly Fixture[] = fixtures, options: {
  helper?: boolean; connected?: boolean; manualActions?: boolean;
  setup?: (db: SqliteDatabase) => void;
} = {}) {
  const db = new DatabaseSync(":memory:");
  db.function("REGEXP_REPLACE", (value, pattern, replacement) => {
    const jsPattern = String(pattern).replaceAll("[[:space:]]", "\\s");
    return String(value).replace(new RegExp(jsPattern, "g"), String(replacement));
  });
  db.function("CONCAT", { varargs: true }, (...args) => args.some(arg => arg === null) ? null : args.join(""));
  db.function("TIMESTAMPDIFF", (_unit, start, end) => Math.trunc((Date.parse(String(end)) - Date.parse(String(start))) / 1000));
  db.function("DATE_FORMAT", (date, format) => String(format) === "%y%m%d"
    ? String(date).slice(2, 10).replaceAll("-", "") : String(date));
  db.function("LPAD", (value, length, pad) => String(value).padStart(Number(length), String(pad)));
  db.function("SUBSTRING_INDEX", (value, separator, count) => {
    const parts = String(value).split(String(separator));
    return (Number(count) < 0 ? parts.slice(Number(count)) : parts.slice(0, Number(count))).join(String(separator));
  });
  db.exec(`
    CREATE TABLE users (id INTEGER, name TEXT, username TEXT);
    CREATE TABLE balance_history (id INTEGER, user_id INTEGER, amount TEXT, type TEXT, currency TEXT,
      balance TEXT, description TEXT, created_at TEXT, related_id INTEGER);
    CREATE TABLE recharge_orders (id INTEGER, user_id INTEGER, status TEXT, completed_at TEXT, created_at TEXT);
    CREATE TABLE af_manual_balances (id INTEGER, user_id INTEGER, amount TEXT, note TEXT, created_at TEXT);
    CREATE TABLE ai_wallet_project_holds (id INTEGER, user_id INTEGER, amount TEXT, asset_code TEXT,
      ledger_id INTEGER, tag_name TEXT, created_at TEXT, released_at TEXT, status TEXT);
    CREATE TABLE af_orders (id INTEGER, ledger_id INTEGER, created_at TEXT);
    CREATE TABLE ai_wallet_manual_freeze_actions (id INTEGER, user_id INTEGER, direction TEXT, amount TEXT,
      asset_code TEXT, note TEXT, created_at TEXT, ledger_id INTEGER, source TEXT);
    CREATE TABLE ai_wallet_asset_entries (id INTEGER, user_id INTEGER, amount TEXT, event_type TEXT,
      asset_code TEXT, note TEXT, balance_after TEXT, created_at TEXT, source_ledger_id INTEGER);
    CREATE TABLE ledger_orders (id INTEGER, ledger_id INTEGER, order_no TEXT);
    INSERT INTO users VALUES (28, '甲用户', 'alice'), (29, '乙用户', 'bob');
  `);
  const insert = db.prepare("INSERT INTO balance_history VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const row of rows) insert.run(row.id, row.userId ?? 28, row.amount ?? "0.125", row.type ?? "consume",
    row.currency, row.balance ?? "123.875", row.note ?? `流水 ${row.id}`, row.date ?? "2026-11-01 12:00:00", row.relatedId ?? null);
  options.setup?.(db);
  const queries: { sql: string; bindings: unknown[] }[] = [];
  const execute = vi.fn(async (sql: string, bindings: unknown[] = []) => {
    expect(sql.trim()).toMatch(/^SELECT\b/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|CALL)\b|\bREPLACE\b(?!\s*\()/i);
    expect(sql).not.toContain(";");
    expect((sql.match(/\?/g) ?? []).length).toBe(bindings.length);
    queries.push({ sql, bindings: Array.from(bindings) });
    return [db.prepare(sqliteSql(sql)).all(...bindings as string[]), []];
  });
  const oldMultiEnsure = vi.fn(async () => undefined);
  const oldLedgerEnsure = vi.fn(async () => undefined);
  const replayEvents = vi.fn(async (_conn: unknown, _userIds: number[]) => new Map([["bh_1", 808.125]]));
  const replayHistory = vi.fn(async (_conn: unknown, _userIds: number[]) => new Map([[1, 808.125]]));
  const bindings: Record<string, unknown> = {
    getDbConnection: vi.fn(async () => options.connected === false ? null : { execute }),
    ensureMultiAssetWalletInfrastructure: oldMultiEnsure,
    ensureLedger37WalletInfrastructure: oldLedgerEnsure,
    hasWalletManualFreezeActions: vi.fn(async () => options.manualActions ?? true),
    getUnifiedWalletBalanceAfterByEventKey: replayEvents,
    getUnifiedUsdtBalanceAfterByHistoryId: replayHistory,
  };
  if (options.helper !== false) bindings.buildWalletAssetFilterSql = buildWalletAssetFilterSql;
  const runtime = evaluate<(args: { input: Record<string, unknown> }) => Promise<any>>(
    `(${callback.getText(ast)});`, bindings);
  return { read: (input: Record<string, unknown> = {}) => runtime({ input }), queries, execute,
    oldMultiEnsure, oldLedgerEnsure, replayEvents, replayHistory, close: () => db.close() };
}
function assertSharedConditions(test: ReturnType<typeof harness>, unified: boolean) {
  expect(test.queries).toHaveLength(2);
  const [count, list] = test.queries;
  expect(count.bindings).toEqual(list.bindings);
  const from = unified ? "FROM (" : "FROM balance_history bh";
  expect(count.sql.slice(count.sql.indexOf(from)).trim()).toBe(
    list.sql.slice(list.sql.indexOf(from), list.sql.lastIndexOf("ORDER BY")).trim());
  expect(count.sql).not.toMatch(/\bLIMIT\b/);
}
const categories: WalletAssetFilterCategory[] = ["all", "digital", "stable", "cny"];

describe("wallet asset filter shared pure functions", () => {
  it.each([
    [null, "USDT", "stable"], [undefined, "USDT", "stable"], ["", "USDT", "stable"],
    [" \t\n", "USDT", "stable"], ["u", "USDT", "stable"], [" usdt ", "USDT", "stable"],
    ["rmb", "CNY", "cny"], [" 人民币 ", "CNY", "cny"], [" cny ", "CNY", "cny"],
    ["eth", "ETH", "digital"], [" BTC ", "BTC", "digital"], ["MSTR", "MSTR", "digital"],
    ["CRCL", "CRCL", "digital"], ["USDC", "USDC", "digital"], ["newcoin", "NEWCOIN", "digital"],
  ])("normalizes %j to %s / %s", (value, code, category) => {
    expect(normalizeWalletAssetCode(value)).toBe(code);
    expect(getWalletAssetCategory(value)).toBe(category);
  });
  it("ANDs category and normalized single code without changing frozen inputs", () => {
    const original = JSON.stringify(fixtures);
    expect(matchesWalletAssetFilter(" eth ")).toBe(true);
    expect(matchesWalletAssetFilter(null, "stable", "U")).toBe(true);
    expect(matchesWalletAssetFilter("人民币", "cny", "rmb")).toBe(true);
    expect(matchesWalletAssetFilter("ETH", "digital", "btc")).toBe(false);
    expect(matchesWalletAssetFilter("ETH", "stable", "eth")).toBe(false);
    expect(matchesWalletAssetFilter("NEWCOIN", "digital", " newcoin ")).toBe(true);
    fixtures.forEach(row => categories.forEach(category => matchesWalletAssetFilter(row.currency, category)));
    expect(JSON.stringify(fixtures)).toBe(original);
  });
  it("labels single code first and all four categories in the agreed wording", () => {
    expect(categories.map(category => getWalletAssetFilterLabel(category, "all")))
      .toEqual(["全部币种", "数字币", "稳定币", "人民币"]);
    expect(getWalletAssetFilterLabel("stable", " eth ")).toBe("ETH");
    expect(getWalletAssetFilterLabel("digital", "U")).toBe("USDT");
    expect(getWalletAssetFilterLabel("all", "人民币")).toBe("人民币");
  });
  it("starts USDT/CNY, includes every real catalog asset, and adds supplied unknown holdings only", () => {
    const extras = Object.freeze([null, undefined, "", " \t ", "U", "rmb", " eth ", " newcoin ", "NEWCOIN"]);
    const codes = getWalletAssetFilterCodes(extras);
    expect(codes.slice(0, 2)).toEqual(["USDT", "CNY"]);
    expect(codes).toEqual(["USDT", "CNY", ...AI_WALLET_SETTLEMENT_ASSETS, "NEWCOIN"]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(getWalletAssetFilterCodes()).not.toContain("USDC");
    expect(extras).toEqual([null, undefined, "", " \t ", "U", "rmb", " eth ", " newcoin ", "NEWCOIN"]);
  });
  it("rejects non-whitelisted SQL columns and binds even hostile unknown asset codes", () => {
    expect(() => buildWalletAssetFilterSql("bh.currency; DROP TABLE users" as "bh.currency", {})).toThrow();
    const hostile = "X' OR 1=1 --";
    const input = Object.freeze({ assetCategory: "digital" as const, assetCode: hostile });
    const filter = buildWalletAssetFilterSql("bh.currency", input);
    expect(filter.parts.join(" AND ")).not.toContain(hostile);
    expect(filter.values).toContain(hostile);
    expect(filter.parts.join(" AND ").match(/\?/g)).toHaveLength(filter.values.length);
    expect(buildWalletAssetFilterSql("wallet_event.currency", {})).toEqual({ parts: [], values: [] });
  });
});

describe.each([false, true])("real walletGlobalHistory callback includeAllWalletEvents=%s", unified => {
  it.each(categories)("executes %s filtering for null/blank/aliases/securities, identically in COUNT and list", async category => {
    const test = harness();
    try {
      const result = await test.read({ includeAllWalletEvents: unified, assetCategory: category, pageSize: 50 });
      const expected = fixtures.filter(row => matchesWalletAssetFilter(row.currency, category));
      expect(result.total).toBe(expected.length);
      expect(result.items.map((item: any) => unified ? item.sourceId : item.id))
        .toEqual(expected.map(row => row.id).sort((a, b) => b - a));
      assertSharedConditions(test, unified);
      const filterPosition = test.queries[1].sql.indexOf("REGEXP_REPLACE");
      if (category !== "all") {
        expect(filterPosition).toBeGreaterThan(test.queries[1].sql.lastIndexOf("LEFT JOIN users u"));
        expect(filterPosition).toBeLessThan(test.queries[1].sql.lastIndexOf("LIMIT"));
        if (unified) expect(filterPosition).toBeGreaterThan(test.queries[1].sql.indexOf("duplicate_manual"));
      }
    } finally { test.close(); }
  });
  it.each([" eth ", "BTC", "NEWCOIN", "U", "RMB", "人民币"])("executes normalized single-code %s", async assetCode => {
    const test = harness();
    try {
      const result = await test.read({ includeAllWalletEvents: unified, assetCode });
      const expected = fixtures.filter(row => matchesWalletAssetFilter(row.currency, "all", assetCode));
      expect(result.total).toBe(expected.length);
      expect(result.items).toHaveLength(expected.length);
      assertSharedConditions(test, unified);
    } finally { test.close(); }
  });
  it.each([
    ["stable", "ETH"], ["digital", "USDT"], ["cny", "BTC"], ["stable", "CNY"],
  ] as const)("category %s AND code %s conflict yields zero, not an OR bypass", async (assetCategory, assetCode) => {
    const test = harness();
    try {
      expect(await test.read({ includeAllWalletEvents: unified, assetCategory, assetCode }))
        .toEqual({ total: 0, items: [] });
      assertSharedConditions(test, unified);
    } finally { test.close(); }
  });
  it("combines keyword, inclusive dates, category and code before both COUNT and LIMIT", async () => {
    const rows = Array.from({ length: 90 }, (_, index): Fixture => ({ id: index + 1,
      currency: index % 3 === 0 ? "ETH" : "BTC", note: index % 2 ? "needle" : "other",
      date: index < 70 ? "2026-11-02 23:59:59" : "2026-11-03 00:00:00" }));
    const test = harness(rows);
    try {
      const expectedIds = rows.filter(row => row.id <= 70 && row.currency === "ETH" && row.note === "needle")
        .map(row => row.id).sort((a, b) => unified ? `bh_${b}`.localeCompare(`bh_${a}`) : b - a);
      const result = await test.read({ includeAllWalletEvents: unified, keyword: " needle ",
        startDate: "2026-11-02", endDate: "2026-11-02", assetCategory: "digital", assetCode: "eth",
        page: 2, pageSize: 4 });
      expect(result.total).toBe(expectedIds.length);
      expect(result.total).toBeGreaterThan(4);
      expect(result.items.map((item: any) => unified ? item.sourceId : item.id)).toEqual(expectedIds.slice(4, 8));
      assertSharedConditions(test, unified);
      expect(test.queries[1].sql).toContain("LIMIT 4 OFFSET 4");
      expect(test.queries[0].bindings.slice(0, 7)).toEqual([
        ...Array(5).fill("%needle%"), "2026-11-02 00:00:00", "2026-11-02",
      ]);
    } finally { test.close(); }
  });
  it("finds older ETH beyond the unfiltered latest 20 and paginates all matching history", async () => {
    const rows = Array.from({ length: 65 }, (_, index): Fixture => ({ id: index + 1,
      currency: index < 25 ? "ETH" : "USDT", date: `2026-11-01 12:${String(index).padStart(2, "0")}:00` }));
    const test = harness(rows);
    try {
      const page1 = await test.read({ includeAllWalletEvents: unified, assetCode: "ETH", pageSize: 20 });
      expect(page1.total).toBe(25);
      expect(page1.items).toHaveLength(20);
      const page2 = await test.read({ includeAllWalletEvents: unified, assetCode: "ETH", page: 2, pageSize: 20 });
      expect(page2.total).toBe(25);
      expect(page2.items).toHaveLength(5);
      expect([...page1.items, ...page2.items].map((item: any) => unified ? item.sourceId : item.id))
        .toEqual(Array.from({ length: 25 }, (_, i) => 25 - i));
    } finally { test.close(); }
  });
  it("old no-filter calls execute without injecting the new helper, including recent-10 shape", async () => {
    const test = harness(fixtures, { helper: false });
    const explicitAll = harness();
    try {
      const input = { includeAllWalletEvents: unified, includeUnifiedBalance: true, pageSize: 10 };
      const result = await test.read(input);
      const all = await explicitAll.read({ ...input, assetCategory: "all", assetCode: "all" });
      expect(result.total).toBe(fixtures.length);
      expect(result.items).toHaveLength(10);
      expect(result).toEqual(all);
      expect(test.queries).toEqual(explicitAll.queries);
      expect(test.queries.every(q => !q.sql.includes("REGEXP_REPLACE") && q.bindings.length === 0)).toBe(true);
      expect(unified ? test.replayEvents : test.replayHistory).toHaveBeenCalledOnce();
      expect(test.oldMultiEnsure.mock.calls.length).toBe(unified ? 1 : 0);
      expect(test.oldLedgerEnsure.mock.calls.length).toBe(unified ? 1 : 0);
    } finally { test.close(); explicitAll.close(); }
  });
  it("preserves existing keyword/date-only SQL without the new helper", async () => {
    const test = harness(fixtures, { helper: false });
    try {
      const result = await test.read({ includeAllWalletEvents: unified, keyword: "测试流水", startDate: "2026-11-01",
        endDate: "2026-11-30", page: 3, pageSize: 4 });
      expect(result.total).toBe(15);
      expect(result.items).toHaveLength(4);
      assertSharedConditions(test, unified);
      expect(test.queries[0].bindings).toEqual([...Array(5).fill("%测试流水%"), "2026-11-01 00:00:00", "2026-11-30"]);
      expect(test.queries[1].sql).toContain("LIMIT 4 OFFSET 8");
      expect(test.queries[1].sql).not.toContain("REGEXP_REPLACE");
    } finally { test.close(); }
  });
  it("injection values exist only in bindings and cannot broaden results or execute writes", async () => {
    const assetCode = "X' OR 1=1 --";
    const keyword = "'; DROP TABLE users; --";
    const test = harness();
    try {
      expect(schema.safeParse({ assetCode }).success).toBe(true);
      expect(await test.read({ includeAllWalletEvents: unified, assetCode, keyword })).toEqual({ total: 0, items: [] });
      for (const query of test.queries) {
        expect(query.sql).not.toContain(assetCode);
        expect(query.sql).not.toContain(keyword);
        expect(query.bindings).toContain(assetCode);
        expect(query.bindings).toContain(`%${keyword}%`);
      }
      assertSharedConditions(test, unified);
    } finally { test.close(); }
  });
  it("amount, currency and balance retain the existing row mapping, with no conversion/recalculation", async () => {
    const rows: Fixture[] = [
      { id: 1, currency: "USDT", amount: "-3.125", balance: "123.875" },
      { id: 2, currency: "ETH", amount: "0.125", balance: "7.625" },
      { id: 3, currency: "U", amount: "-1.5", balance: "8.25" },
    ];
    const test = harness(rows);
    try {
      const result = await test.read({ includeAllWalletEvents: unified, assetCategory: "digital", assetCode: "ETH",
        includeUnifiedBalance: true });
      expect(result.items[0]).toMatchObject({ currency: "ETH", amount: 0.125, balance: 7.625 });
      const usdt = await test.read({ includeAllWalletEvents: unified, assetCode: "USDT", includeUnifiedBalance: true });
      expect(usdt.items.find((item: any) => item.currency === "USDT")).toMatchObject({ amount: -3.125, balance: 808.125 });
      expect(usdt.items.find((item: any) => item.currency === "U")).toMatchObject({ amount: -1.5, balance: 8.25 });
      const replay = unified ? test.replayEvents : test.replayHistory;
      expect(replay.mock.calls[0][1]).toEqual([28]);
    } finally { test.close(); }
  });
  it("no connection short-circuits all SQL and legacy ensure calls", async () => {
    const test = harness([], { connected: false });
    try {
      expect(await test.read({ includeAllWalletEvents: unified, assetCode: "ETH" })).toEqual({ total: 0, items: [] });
      expect(test.execute).not.toHaveBeenCalled();
      expect(test.oldMultiEnsure).not.toHaveBeenCalled();
      expect(test.oldLedgerEnsure).not.toHaveBeenCalled();
    } finally { test.close(); }
  });
});

describe("merged sources retain existing dedup/recharge/withdraw/note/freeze behavior", () => {
  it.each([false, true])("optional manualActions=%s does not change dedup and filters all sources after UNION", async manualActions => {
    const rows: Fixture[] = [
      { id: 1, currency: "USDT", amount: "10", type: "recharge", relatedId: 7 },
      { id: 2, currency: "USDT", amount: "5", note: "manual duplicate", date: "2026-11-01 12:00:01" },
      { id: 3, currency: "USDT", amount: "-2", type: "withdraw" },
      { id: 4, currency: "USDT", amount: "4", note: "[迁移自af_manual_balances#9]" },
    ];
    const test = harness(rows, { manualActions, setup(db) {
      db.exec(`
        INSERT INTO recharge_orders VALUES (7, 28, 'completed', '2026-11-01 12:00:00', '2026-11-01 11:00:00');
        INSERT INTO af_manual_balances VALUES (8, 28, '5', 'manual duplicate', '2026-11-01 12:00:00');
        INSERT INTO af_manual_balances VALUES (9, 28, '6', '[CNY]人民币入账', '2026-11-01 12:00:00');
        INSERT INTO af_manual_balances VALUES (10, 28, '7', '[BALANCE_BASE]基线', '2026-11-01 12:00:00');
        INSERT INTO ai_wallet_manual_freeze_actions VALUES (11, 28, 'freeze', '3', 'CNY', '备注', '2026-11-01 12:00:00', 52, 'manual');
        INSERT INTO ai_wallet_asset_entries VALUES (12, 28, '0.25', 'transfer_in', 'ETH', '真实ETH流水', '1.25', '2026-11-01 12:00:00', 52);
      `);
    } });
    try {
      const all = await test.read({ includeAllWalletEvents: true });
      expect(all.total).toBe(manualActions ? 6 : 5);
      expect(all.items.map((item: any) => item.id)).not.toContain("bh_1");
      expect(all.items.map((item: any) => item.id)).not.toContain("bh_2");
      expect(all.items.map((item: any) => item.id)).not.toContain("bh_4");
      expect(all.items.find((item: any) => item.id === "r_7")).toMatchObject({ amount: 10, currency: "USDT", note: "充值到账" });
      expect(all.items.find((item: any) => item.id === "bh_3")).toMatchObject({ type: "expense", amount: -2 });
      const cny = await test.read({ includeAllWalletEvents: true, assetCategory: "cny" });
      expect(cny.total).toBe(manualActions ? 2 : 1);
      expect(cny.items.find((item: any) => item.id === "cny_9")).toMatchObject({ note: "人民币入账", amount: 6 });
      if (manualActions) expect(cny.items.find((item: any) => item.id === "manual_hold_11"))
        .toMatchObject({ amount: -3, type: "collateral_lock", balance: null, note: "手动冻结 · 备注" });
      const digital = await test.read({ includeAllWalletEvents: true, assetCategory: "digital", assetCode: "ETH" });
      expect(digital.total).toBe(1);
      expect(digital.items[0]).toMatchObject({ id: "ma_12", amount: 0.25, balance: 1.25, currency: "ETH" });
    } finally { test.close(); }
  });
});

describe("real input schema, permissions and read-only AST boundaries", () => {
  it("retains mibanAdminProcedure and query (no mutation) with optional bounded unknown-code input", () => {
    expect(property.initializer.getText(ast)).toMatch(/^mibanAdminProcedure\s*\.input\(/);
    expect(calls.some(call => ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "mutation")).toBe(false);
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ assetCategory: "digital", assetCode: " newcoin " })).toMatchObject({ assetCode: "newcoin" });
    for (const assetCategory of categories) expect(schema.safeParse({ assetCategory }).success).toBe(true);
    for (const input of [{ assetCategory: "fiat" }, { assetCode: " " }, { assetCode: "X".repeat(33) }, { assetCode: 1 }]) {
      expect(schema.safeParse(input).success).toBe(false);
    }
    expect(schema.safeParse({ assetCode: "X".repeat(32) }).success).toBe(true);
    expect(callback.getText(ast)).not.toMatch(/\b(?:INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|CREATE TABLE|ALTER TABLE)\b/i);
  });
  it.each(["admin", "user", "guest", "", undefined])("real protected middleware denies role=%s", async role => {
    const guard = required(nodes(ast, ts.isVariableDeclaration).find(node => node.name.getText(ast) === "mibanAdminProcedure"), "admin guard");
    const use = required(guard.initializer && ts.isCallExpression(guard.initializer) ? guard.initializer : undefined, "protected use");
    expect(use.expression.getText(ast)).toBe("protectedProcedure.use");
    const middleware = evaluate<(args: any) => Promise<any>>(`(${use.arguments[0].getText(ast)});`, { TRPCError });
    const next = vi.fn(async () => "authorized");
    await expect(middleware({ ctx: { user: { role } }, next })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(next).not.toHaveBeenCalled();
    expect(await middleware({ ctx: { user: { role: "super_admin" } }, next })).toBe("authorized");
    expect(next).toHaveBeenCalledOnce();
  });
});
