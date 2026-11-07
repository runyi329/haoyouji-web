import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import type mysql from "mysql2/promise";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStockMarketExecutor } from "./stock-market-connection";
import { getStockReturnRanking } from "./stock-return-ranking";
import {
  findStockCodesByInitials,
  resetStockSearchInitialsCacheForTests,
} from "./stock-search-initials";

// Only extract production declarations/callbacks: never import db/routers,
// boot the app, create a real mysql pool, collect quotes or contact the network.
function sourceAst(file: string) {
  return ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
const dbAst = sourceAst("./db.ts");
const routerAst = sourceAst("./routers.ts");
function transpile(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const factoryNames = new Set([
  "getDb", "asPooledConnection", "getDbConnection",
  "getStockMarketConnection", "getDbTransactionConnection",
]);
const factorySource = dbAst.statements.filter(node =>
  ts.isFunctionDeclaration(node) && node.name && factoryNames.has(node.name.text),
).map(node => node.getText(dbAst)).join("\n");
if (factorySource.length === 0) throw new Error("Missing production DB factory");

function connectionFactory(pools: mysql.Pool[], fallback: mysql.Connection | null = null) {
  const createPool = vi.fn(() => {
    const pool = pools.shift();
    if (!pool) throw new Error("Unexpected offline pool creation");
    return pool;
  });
  const exports: Record<string, any> = {};
  runInNewContext(transpile(`
    let _db = null, _pool = null, _connection = fallback;
    ${factorySource}
  `), {
    exports, fallback, mysql: { createPool }, drizzle: (pool: unknown) => ({ pool }),
    ENV: { mainDatabaseUrl: pools.length ? "mysql://offline.invalid/fixture" : "" },
    process: { env: {} }, getStockMarketExecutor,
    console: { log: vi.fn(), warn: vi.fn() },
  });
  return {
    getDbConnection: exports.getDbConnection as () => Promise<mysql.Connection | null>,
    getStockMarketConnection: exports.getStockMarketConnection as () => Promise<mysql.Connection | null>,
    getDbTransactionConnection: exports.getDbTransactionConnection as () => Promise<mysql.Connection | null>,
    createPool,
  };
}
function queryCallback(name: string): ts.Expression {
  let callback: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(routerAst) === name &&
      ts.isCallExpression(node.initializer) && ts.isPropertyAccessExpression(node.initializer.expression) &&
      node.initializer.expression.name.text === "query") callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(routerAst);
  if (!callback) throw new Error(`Missing production query: ${name}`);
  return callback;
}
function query(name: string, dependencies: Record<string, unknown>) {
  return runInNewContext(transpile(`const query = ${queryCallback(name).getText(routerAst)}; query;`), dependencies) as
    (args: { input: Record<string, unknown> }) => Promise<any>;
}
function poolFixture(code = "600001.SH") {
  const summary = (ts_code: string, factor: number) => ({
    ts_code, name: "新易盛", list_status: "L", list_date: "20261104",
    row_days: "1", distinct_days: "1", sample_days: "1", log_return: String(Math.log(factor)),
    first_trade_date: "20261104", last_trade_date: "20261104", first_pre_close: "10",
    last_close: String(10 * factor),
  });
  const pool = {
    _closed: false,
    execute: vi.fn(async function(this: unknown, sql: string, _params?: any[]) {
      expect(this).toBe(pool);
      if (sql === "SELECT ts_code, name FROM ts_stock_basic")
        return [[{ ts_code: code, name: "新易盛" }], []];
      if (sql.includes("COUNT(*) AS cnt")) return [[{ cnt: 1 }], []];
      if (sql.includes("COALESCE(l.up_days")) return [[{
        ts_code: code, name: "新易盛", list_status: "L", up_days: 1,
        down_days: 0, flat_days: 0, total_days: 1, up_rate: 100,
      }], []];
      if (sql.includes("AS data_updated_at")) return [[{ data_updated_at: "2026-11-04T08:00:00Z" }], []];
      if (sql.includes("AS as_of")) return [[{ as_of: "20261104" }], []];
      if (sql.includes("ORDER BY d.trade_date DESC")) return [[{ trade_date: "20261104" }], []];
      if (sql.includes("a.row_days")) return [[summary(code, 1.1), summary("000001.SZ", 0.9)], []];
      throw new Error(`Unexpected offline SQL: ${sql}`);
    }),
    query: vi.fn(async function(this: unknown, sql: string, params?: any[]) {
      expect(this).toBe(pool);
      return [[{ sql, params }], []];
    }),
    end: vi.fn(async () => undefined),
    getConnection: vi.fn(async () => exclusive),
    get marker() { expect(this).toBe(pool); return "physical-pool"; },
  };
  const exclusive = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  return { pool: pool as unknown as mysql.Pool, mock: pool, exclusive };
}
function sourceScanCount(pool: ReturnType<typeof poolFixture>["mock"]) {
  return pool.execute.mock.calls.filter(([sql]) => sql.includes("a.row_days")).length;
}
const rankingInput = { period: "all", topN: 20, direction: "up", market: "all" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T07:00:00Z"));
  resetStockSearchInitialsCacheForTests();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in offline regression"); }));
});
afterEach(() => {
  resetStockSearchInitialsCacheForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AI physical-pool executor and unchanged legacy connection factory", () => {
  it("two actual getters share identity despite fresh legacy proxies; transactions still acquire exclusive connections", async () => {
    const f = poolFixture();
    const factory = connectionFactory([f.pool]);
    const first = await factory.getStockMarketConnection();
    const oldA = await factory.getDbConnection();
    const oldB = await factory.getDbConnection();
    const second = await factory.getStockMarketConnection();
    expect(first).toBe(second);
    expect(oldA).not.toBe(oldB);
    expect(first).not.toBe(oldA);
    expect(factory.createPool).toHaveBeenCalledTimes(1);
    expect(f.mock.getConnection).not.toHaveBeenCalled();
    expect(await factory.getDbTransactionConnection()).toBe(f.exclusive);
    expect(f.mock.getConnection).toHaveBeenCalledTimes(1);
  });

  it("query/execute and accessor bind the physical pool; end is an async no-op", async () => {
    const f = poolFixture();
    const executor = getStockMarketExecutor(f.pool, null)!;
    const { query: boundQuery, execute: boundExecute } = executor;
    expect(await boundQuery("SELECT ?", [7])).toEqual([[{ sql: "SELECT ?", params: [7] }], []]);
    expect(await boundExecute("SELECT ts_code, name FROM ts_stock_basic", [])).toEqual([
      [{ ts_code: "600001.SH", name: "新易盛" }], [],
    ]);
    expect((executor as any).marker).toBe("physical-pool");
    await expect(executor.end()).resolves.toBeUndefined();
    expect(f.mock.end).not.toHaveBeenCalled();
    expect(getStockMarketExecutor(f.pool, executor)).toBe(executor);
  });

  it("no-pool fallback preserves the original connection or null verbatim", async () => {
    const fallback = { end: vi.fn(async () => undefined) } as unknown as mysql.Connection;
    expect(getStockMarketExecutor(null, fallback)).toBe(fallback);
    expect(getStockMarketExecutor(null, null)).toBeNull();
    const factory = connectionFactory([], fallback);
    expect(await factory.getStockMarketConnection()).toBe(fallback);
    expect(factory.createPool).not.toHaveBeenCalled();
    expect(await connectionFactory([]).getStockMarketConnection()).toBeNull();
  });

  it.each(["_closed", "pool._closed"])("actual factory rebuild for %s changes AI identity without closing either pool", async closedKey => {
    const a = poolFixture(), b = poolFixture("600002.SH");
    const factory = connectionFactory([a.pool, b.pool]);
    const first = await factory.getStockMarketConnection();
    if (closedKey === "_closed") a.mock._closed = true;
    else { delete (a.mock as any)._closed; (a.mock as any).pool = { _closed: true }; }
    const second = await factory.getStockMarketConnection();
    expect(second).not.toBe(first);
    expect(await factory.getStockMarketConnection()).toBe(second);
    expect(factory.createPool).toHaveBeenCalledTimes(2);
    await first!.end(); await second!.end();
    expect(a.mock.end).not.toHaveBeenCalled(); expect(b.mock.end).not.toHaveBeenCalled();
  });
});

describe("actual AI routes reuse one period source across independent requests", () => {
  const routeNames = ["aiStockComparison", "aiStockStreakComparison", "aiStockReturnRanking", "aiStockLatestQuotes", "aiStockLifecycle"];
  it.each(routeNames)("%s is wired only to the AI getter", name => {
    const callback = queryCallback(name).getText(routerAst);
    expect(callback.match(/\bgetStockMarketConnection\(/g)).toHaveLength(1);
    expect(callback).not.toMatch(/\bgetDbConnection\(/);
  });

  it.each(["all", "1m"])("separate up/down route requests (%s) scan source once and keep fetchedAt identical", async period => {
    const f = poolFixture();
    const factory = connectionFactory([f.pool]);
    const route = query("aiStockReturnRanking", { ...factory, getStockReturnRanking });
    const up = await route({ input: { ...rankingInput, period } });
    vi.setSystemTime(new Date("2026-11-05T07:00:01Z"));
    const down = await route({ input: { ...rankingInput, period, direction: "down", topN: 7 } });
    expect(up.items[0].tsCode).toBe("600001.SH");
    expect(down.items[0].tsCode).toBe("000001.SZ");
    expect(down.fetchedAt).toBe(up.fetchedAt);
    expect(down.asOf).toBe(up.asOf);
    expect(sourceScanCount(f.mock)).toBe(1);
    expect(f.mock.execute).toHaveBeenCalledTimes(period === "all" ? 3 : 4);
  });

  it("concurrent independent route requests share the in-flight source", async () => {
    const f = poolFixture();
    const factory = connectionFactory([f.pool]);
    const route = query("aiStockReturnRanking", { ...factory, getStockReturnRanking });
    const [up, down] = await Promise.all([
      route({ input: rankingInput }),
      route({ input: { ...rankingInput, direction: "down" } }),
    ]);
    expect(down.fetchedAt).toBe(up.fetchedAt);
    expect(sourceScanCount(f.mock)).toBe(1);
    expect(f.mock.execute).toHaveBeenCalledTimes(3);
  });

  it("rebuilt pool never inherits cached source/results from its predecessor", async () => {
    const a = poolFixture(), b = poolFixture("600002.SH");
    const factory = connectionFactory([a.pool, b.pool]);
    const route = query("aiStockReturnRanking", { ...factory, getStockReturnRanking });
    const before = await route({ input: rankingInput });
    a.mock._closed = true;
    vi.setSystemTime(new Date("2026-11-05T07:00:01Z"));
    const after = await route({ input: rankingInput });
    expect(before.items[0].tsCode).toBe("600001.SH");
    expect(after.items[0].tsCode).toBe("600002.SH");
    expect(after.fetchedAt).not.toBe(before.fetchedAt);
    expect(sourceScanCount(a.mock)).toBe(1); expect(sourceScanCount(b.mock)).toBe(1);
  });

  it("lifecycle initials searches receive the stable executor and reuse metadata across calls", async () => {
    const f = poolFixture();
    const factory = connectionFactory([f.pool]);
    const executors: unknown[] = [];
    const lookup = vi.fn(async (db: mysql.Connection, keyword: string) => {
      executors.push(db);
      return findStockCodesByInitials(db, keyword);
    });
    const route = query("aiStockLifecycle", { ...factory, findStockCodesByInitials: lookup });
    const input = { page: 1, pageSize: 50, sortBy: "code", sortDir: "asc", market: "all", minTotalDays: 0, keyword: "XYS" };
    const first = await route({ input });
    const second = await route({ input: { ...input, keyword: "YS" } });
    expect(first.total).toBe(1); expect(second.list[0].tsCode).toBe("600001.SH");
    expect(executors[0]).toBe(executors[1]);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(f.mock.execute.mock.calls.filter(([sql]) => sql === "SELECT ts_code, name FROM ts_stock_basic")).toHaveLength(1);
  });
});
