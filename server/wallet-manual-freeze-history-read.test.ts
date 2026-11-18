import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute actual production function/callback bodies, never import DB/router/scanner modules.
// All connections are SELECT-only local adapters; ensure stubs only preserve prior call semantics.
function ast(file: string) {
  return ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
}
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production definition: ${label}`);
  return value;
}
const manual = ast("./db-wallet-manual-freezes.ts");
const recharge = ast("./db-recharge.ts");
const miban = ast("./miban.ts");
const printer = ts.createPrinter();
function productionFunction(root: ts.SourceFile, name: string) {
  const fn = required(root.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name), name);
  const isolated = ts.factory.updateFunctionDeclaration(fn,
    fn.modifiers?.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword),
    fn.asteriskToken, fn.name, fn.typeParameters, fn.parameters, fn.type, fn.body);
  return printer.printNode(ts.EmitHint.Unspecified, isolated, root);
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}
function evaluate<T>(source: string, bindings: Record<string, unknown> = {}): T {
  return runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, bindings, { timeout: 1000 }) as T;
}
const probeSource = productionFunction(manual, "hasWalletManualFreezeActions");
const probe = evaluate<(connection: { execute: (...args: any[]) => Promise<unknown> }) => Promise<boolean>>(
  `${probeSource}\nhasWalletManualFreezeActions;`);
const property = required(nodes(miban, ts.isPropertyAssignment).find(node =>
  node.name.getText(miban) === "walletGlobalHistory"), "walletGlobalHistory");
const query = required(nodes(property.initializer, ts.isCallExpression).find(node =>
  ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "query"), "walletGlobalHistory.query");
const callback = required(query.arguments[0], "walletGlobalHistory callback");
const probeSql = "SELECT 1 FROM ai_wallet_manual_freeze_actions LIMIT 1";
const missingTable = () => Object.assign(new Error("optional table absent"), { code: "ER_NO_SUCH_TABLE" });
const sqlErrors = ["ER_PARSE_ERROR", "ER_TABLEACCESS_DENIED_ERROR", "ER_BAD_FIELD_ERROR", "ECONNRESET", "ETIMEDOUT"];

function harness(kind: "cny" | "global", options: {
  exists?: boolean; connected?: boolean; probeError?: unknown; historyError?: unknown;
} = {}) {
  let exists = options.exists ?? true;
  const calls: { sql: string; bindings: unknown[] }[] = [];
  const execute = vi.fn(async (sql: string, bindings: unknown[] = []) => {
    expect(sql.trim()).toMatch(/^(?:SELECT|WITH)\b/);
    expect(sql).not.toMatch(/\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|GRANT|CALL)\b|\bREPLACE\b(?!\s*\()/i);
    expect(sql).not.toContain(";");
    calls.push({ sql, bindings: Array.from(bindings) });
    if (sql === probeSql) {
      expect(bindings).toEqual([]);
      if (options.probeError) throw options.probeError;
      if (!exists) throw missingTable();
      return [[], []]; // An empty existing table still enables the branch.
    }
    if (options.historyError) throw options.historyError;
    expect((sql.match(/\?/g) ?? []).length).toBe(bindings.length);
    if (sql.startsWith("SELECT COUNT(*)")) return [[{ total: 0 }], []];
    return [[], []];
  });
  const conn = { execute };
  const oldLedgerEnsure = vi.fn(async () => undefined);
  const oldMultiAssetEnsure = vi.fn(async () => undefined);
  const forbiddenManualEnsure = vi.fn(async () => { throw new Error("read-time manual DDL forbidden"); });
  const bindings = {
    getDbConnection: vi.fn(async () => options.connected === false ? null : conn),
    ensureLedger37WalletInfrastructure: oldLedgerEnsure,
    ensureMultiAssetWalletInfrastructure: oldMultiAssetEnsure,
    ensureWalletManualFreezeInfrastructure: forbiddenManualEnsure,
  };
  const runtime = kind === "cny"
    ? evaluate<(...args: any[]) => Promise<any>>(`${probeSource}\n${productionFunction(recharge, "getUserCnyHistory")}\ngetUserCnyHistory;`, bindings)
    : evaluate<(args: any) => Promise<any>>(`${probeSource}\n(${callback.getText(miban)});`, bindings);
  const read = (input: Record<string, unknown> = {}, sources: unknown[] = []) => kind === "cny"
    ? runtime(28, 20, 0, input.filter ?? "all", sources)
    : runtime({ input: { includeAllWalletEvents: true, ...input } });
  return { read, calls, oldLedgerEnsure, oldMultiAssetEnsure, forbiddenManualEnsure,
    setExists: (value: boolean) => { exists = value; } };
}

function assertPriorEnsureSemantics(test: ReturnType<typeof harness>, kind: "cny" | "global") {
  expect(test.oldLedgerEnsure).toHaveBeenCalledOnce();
  if (kind === "global") expect(test.oldMultiAssetEnsure).toHaveBeenCalledOnce();
  else expect(test.oldMultiAssetEnsure).not.toHaveBeenCalled();
  expect(test.forbiddenManualEnsure).not.toHaveBeenCalled();
}

describe("manual freeze action presence: SELECT-only and missing-table-only compatibility", () => {
  it.each([{ rows: [] }, { rows: [{ "1": 1 }] }])("successful probe returns true for rows %j, including an empty table", async ({ rows }) => {
    const execute = vi.fn(async () => [rows, []]);
    expect(await probe({ execute })).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(probeSql, []);
  });
  it.each([missingTable(), { cause: missingTable() }])("only direct/wrapped ER_NO_SUCH_TABLE returns false: %j", async error => {
    expect(await probe({ execute: vi.fn().mockRejectedValue(error) })).toBe(false);
  });
  it.each(sqlErrors)("rethrows %s unchanged", async code => {
    const error = Object.assign(new Error(code), { code });
    await expect(probe({ execute: vi.fn().mockRejectedValue(error) })).rejects.toBe(error);
  });
  it("does not reinterpret a primary SQL error as a missing table from its cause", async () => {
    const error = { code: "ER_PARSE_ERROR", cause: missingTable() };
    await expect(probe({ execute: vi.fn().mockRejectedValue(error) })).rejects.toBe(error);
  });
  it("never swallows an unclassified error", async () => {
    const error = new Error("driver failure");
    await expect(probe({ execute: vi.fn().mockRejectedValue(error) })).rejects.toBe(error);
  });
});

describe.each(["cny", "global"] as const)("%s history uses optional manual UNION without manual DDL", kind => {
  it.each([false, true])("table exists=%s keeps query placeholders aligned and old ensure semantics", async exists => {
    const test = harness(kind, { exists });
    await test.read();
    expect(test.calls[0]).toEqual({ sql: probeSql, bindings: [] });
    const historyCalls = test.calls.slice(1);
    expect(historyCalls).toHaveLength(kind === "cny" ? 1 : 2);
    for (const call of historyCalls) {
      expect(call.sql.includes("FROM ai_wallet_manual_freeze_actions a")).toBe(exists);
      expect(call.bindings).toEqual(kind === "cny" ? Array(exists ? 6 : 5).fill(28) : []);
      if (exists) {
        expect(call.sql).toContain("a.ledger_id = 52");
        expect(call.sql).toContain("a.source = 'manual'");
        expect(call.sql).toContain("CASE WHEN a.direction = 'freeze' THEN -a.amount ELSE a.amount END AS amount");
        expect(call.sql).toContain(kind === "cny" ? "NULL AS recorded_balance" : "NULL AS raw_balance");
      }
    }
    assertPriorEnsureSemantics(test, kind);
  });
  it.each(sqlErrors)("probe %s fails closed before history count/page queries", async code => {
    const error = Object.assign(new Error(code), { code });
    const test = harness(kind, { probeError: error });
    await expect(test.read()).rejects.toBe(error);
    expect(test.calls).toHaveLength(1);
    assertPriorEnsureSemantics(test, kind);
  });
  it.each(["ER_PARSE_ERROR", "ECONNRESET", "ER_NO_SUCH_TABLE"])("non-probe history %s still propagates", async code => {
    const error = Object.assign(new Error(code), { code });
    const test = harness(kind, { exists: false, historyError: error });
    await expect(test.read()).rejects.toBe(error);
    expect(test.calls).toHaveLength(2);
    expect(test.forbiddenManualEnsure).not.toHaveBeenCalled();
  });
  it("absent connection runs neither probe nor any ensure", async () => {
    const test = harness(kind, { connected: false });
    expect(await test.read()).toEqual(kind === "cny" ? [] : { items: [], total: 0 });
    expect(test.calls).toEqual([]);
    expect(test.oldLedgerEnsure).not.toHaveBeenCalled();
    expect(test.oldMultiAssetEnsure).not.toHaveBeenCalled();
    expect(test.forbiddenManualEnsure).not.toHaveBeenCalled();
  });
  it("does not cache missing schema: a later write-created table enables manual history", async () => {
    const test = harness(kind, { exists: false });
    await test.read();
    test.setExists(true);
    await test.read();
    const calls = test.calls.filter(call => call.sql !== probeSql);
    const perRead = kind === "cny" ? 1 : 2;
    expect(calls.slice(0, perRead).every(call => !call.sql.includes("FROM ai_wallet_manual_freeze_actions a"))).toBe(true);
    expect(calls.slice(perRead).every(call => call.sql.includes("FROM ai_wallet_manual_freeze_actions a"))).toBe(true);
    expect(test.forbiddenManualEnsure).not.toHaveBeenCalled();
  });
});

describe("CNY manual branch bindings and full-history balance replay", () => {
  it.each([false, true])("exists=%s places source bindings after only enabled wallet branches", async exists => {
    const source = { id: "source-1", amount: "10", sourceTag: "LQY", note: "legacy", businessDate: "2025-01-01", linkedWalletEntryId: 91 };
    const test = harness("cny", { exists });
    await test.read({}, [source]);
    const { sql, bindings } = test.calls[1];
    expect(bindings).toEqual([...Array(exists ? 6 : 5).fill(28), source.id, 28, source.amount,
      "[CNY]历史微信存入 · LQY · legacy", "2025-01-01 00:00:00", 91]);
    expect(sql.match(/ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW/g)).toHaveLength(4);
    expect(sql).toContain("first_snapshot.recorded_balance - first_snapshot.snapshot_amount");
    expect(sql).toContain("current_snapshot.recorded_balance + current_snapshot.legacy_balance_total");
    expect(sql).toContain("e.legacy_delta_since_snapshot - e.frozen_after");
    expect(sql.indexOf("'historical_principal_source', NULL, NULL")).toBeGreaterThan(sql.indexOf("), wallet_display_rows AS ("));
    if (exists) {
      expect(sql).toContain("0 AS legacy_delta, CASE WHEN a.direction = 'freeze' THEN a.amount ELSE -a.amount END AS frozen_delta");
      expect(sql).toContain("a.asset_code = 'CNY'");
    }
  });
  it.each(["in", "out"])("%s excludes manual hold directions only after full-history replay", async filter => {
    const test = harness("cny");
    await test.read({ filter });
    const { sql } = test.calls[1];
    const condition = `WHERE e.amount ${filter === "in" ? ">" : "<"} 0 AND e.source_type <> 'manual_hold'`;
    expect(sql.indexOf(condition)).toBeGreaterThan(sql.indexOf("FROM combined_display_rows e"));
    expect(sql.indexOf(condition)).toBeLessThan(sql.indexOf("LIMIT 20 OFFSET 0"));
  });
});

describe("global history count/page share branch and retain bound filters", () => {
  it.each([false, true])("exists=%s retains keyword/dates only in bindings", async exists => {
    const test = harness("global", { exists });
    const keyword = "'; DROP TABLE users; --";
    await test.read({ keyword, startDate: "2026-01-01", endDate: "2026-02-01", page: 3, pageSize: 20 });
    const [count, page] = test.calls.slice(1);
    for (const call of [count, page]) {
      expect(call.bindings).toEqual([...Array(5).fill(`%${keyword}%`), "2026-01-01 00:00:00", "2026-02-01"]);
      expect(call.sql).not.toContain(keyword);
      expect(call.sql.includes("FROM ai_wallet_manual_freeze_actions a")).toBe(exists);
    }
    expect(page.sql).toContain("LIMIT 20 OFFSET 40");
    if (exists) expect(page.sql).toContain("a.asset_code IN ('CNY', 'USDT')");
  });
  it("legacy includeAllWalletEvents=false does not probe or initialize anything", async () => {
    const test = harness("global");
    expect(await test.read({ includeAllWalletEvents: false })).toEqual({ items: [], total: 0 });
    expect(test.calls).toHaveLength(2);
    expect(test.calls.every(call => !call.sql.includes("ai_wallet_manual_freeze_actions"))).toBe(true);
    expect(test.oldLedgerEnsure).not.toHaveBeenCalled();
    expect(test.oldMultiAssetEnsure).not.toHaveBeenCalled();
    expect(test.forbiddenManualEnsure).not.toHaveBeenCalled();
  });
});

describe("write interfaces keep manual DDL before transaction acquisition", () => {
  it.each(["freezeWalletManually", "releaseWalletManually"])("%s initializes outside money transaction", name => {
    const source = productionFunction(manual, name);
    const calls = nodes(required(manual.statements.find((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name), name), ts.isCallExpression);
    expect(calls.filter(call => call.expression.getText(manual) === "ensureWalletManualFreezeInfrastructure")).toHaveLength(1);
    expect(source.indexOf("await ensureWalletManualFreezeInfrastructure();")).toBeGreaterThan(0);
    expect(source.indexOf("await ensureWalletManualFreezeInfrastructure();")).toBeLessThan(source.indexOf("return withGlobalWalletTransaction("));
  });
});
