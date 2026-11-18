import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { AI_WALLET_ASSETS, type AiWalletAsset } from "../shared/ai-wallet-assets";

// Execute actual production declarations without importing database, routers, scanners or ensures.
const file = ts.createSourceFile("manual.ts", readFileSync(new URL("./db-wallet-manual-freezes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const guard = ts.createSourceFile("guard.ts", readFileSync(new URL("./wallet-funding-guard.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const printer = ts.createPrinter();
function productionFunction(root: ts.SourceFile, name: string) {
  const node = root.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!node) throw new Error("Missing real production function: " + name);
  return printer.printNode(ts.EmitHint.Unspecified, ts.factory.updateFunctionDeclaration(node,
    node.modifiers?.filter(m => m.kind !== ts.SyntaxKind.ExportKeyword), node.asteriskToken, node.name,
    node.typeParameters, node.parameters, node.type, node.body), root);
}
const names = ["assertIdentity", "isMissingReadTable", "hasFundingReadTable", "readManualFreezeFunding", "manualFreezeAvailableText", "getWalletManualFreezeAvailableAssets", "getWalletManualFreezeState"];
const source = names.map(name => productionFunction(file, name)).join("\n");
const unitsSource = productionFunction(guard, "fundingUnits");
const scale = BigInt("1000000000000000000");
const units = (value: string) => {
  const match = /^(-?)(\d+)(?:\.(\d{1,18}))?$/.exec(value);
  if (!match) throw new Error("Bad isolated fixture decimal: " + value);
  const amount = BigInt(match[2]) * scale + BigInt((match[3] || "").padEnd(18, "0"));
  return match[1] ? -amount : amount;
};
function decimal(value: bigint) {
  const absolute = value < BigInt(0) ? -value : value;
  const fraction = (absolute % scale).toString().padStart(18, "0").replace(/0+$/, "");
  return `${value < BigInt(0) ? "-" : ""}${absolute / scale}${fraction ? "." + fraction : ""}`;
}
const missing = () => Object.assign(new Error("table absent"), { code: "ER_NO_SUCH_TABLE" });
const failures = ["ER_PARSE_ERROR", "ER_TABLEACCESS_DENIED_ERROR", "ER_BAD_FIELD_ERROR", "ECONNRESET", "ETIMEDOUT"];
type Adjustment = { user_id: number; ledger_id?: number; amount: string; note: string | null };
type Hold = { user_id: number; ledger_id: number; asset_code: string; amount: string; released_amount?: string | null; status: string; tag_name?: string };
function harness() {
  const book = {
    users: new Map<number, { balance: string; cny_balance: string }>([[1, { balance: "100", cny_balance: "100" }], [2, { balance: "999", cny_balance: "999" }]]),
    adjustments: [] as Adjustment[], holds: [] as Hold[],
    balances: [] as { user_id: number; asset_code: string; available_balance: unknown; frozen_balance?: string }[],
    absent: new Set<string>(),
    errors: new Map<string, unknown>(),
    fundingOverride: undefined as Record<string, unknown> | undefined,
  };
  const calls: { sql: string; values: unknown[] }[] = [];
  const execute = vi.fn(async (raw: string, values: unknown[] = []) => {
    const sql = raw.replace(/\s+/g, " ").trim();
    calls.push({ sql, values: Array.from(values) });
    expect(sql).toMatch(/^SELECT\b/);
    expect(sql).not.toMatch(/FOR UPDATE|\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|CALL)\b|orders|price|information_schema|;/i);
    expect((sql.match(/\?/g) || []).length).toBe(values.length);
    for (const [fragment, error] of book.errors) if (sql.includes(fragment)) throw error;
    for (const table of book.absent) if (new RegExp(`\\bFROM ${table}\\b`).test(sql)) throw missing();
    if (sql.startsWith("SELECT 1 FROM ")) return [[], []];
    if (sql.includes("AS cny_available")) {
      const userId = values.at(-1) as number;
      const user = book.users.get(userId);
      if (!user) return [[], []];
      if (book.fundingOverride) return [[book.fundingOverride], []];
      const hasManual = sql.includes("FROM af_manual_balances");
      const hasHolds = sql.includes("FROM ai_wallet_project_holds");
      expect(sql).toContain("CAST(COALESCE(u.cny_balance, 0)");
      expect(sql).toContain("CAST(COALESCE(u.balance, 0)");
      if (hasManual) {
        expect(sql).toContain("COALESCE(note, '') LIKE '[CNY]%'");
        expect(sql).toContain("COALESCE(note, '') NOT LIKE '[CNY]%' AND COALESCE(note, '') NOT LIKE '[BALANCE_BASE]%'");
        expect(sql).toContain("WHERE user_id = ? GROUP BY user_id");
      }
      if (hasHolds) {
        expect(sql).toContain("amount - COALESCE(released_amount, 0)");
        expect(sql).toContain("WHERE user_id = ? AND asset_code IN ('CNY', 'USDT') AND status = 'active' GROUP BY user_id");
        expect(sql).not.toMatch(/ledger_id|tag_name/);
      }
      const active = hasHolds ? book.holds.filter(h => h.user_id === userId && ["CNY", "USDT"].includes(h.asset_code) && h.status === "active") : [];
      const invalid = active.some(h => units(h.amount) < BigInt(0) || units(h.released_amount ?? "0") < BigInt(0) || units(h.released_amount ?? "0") > units(h.amount));
      const available = (asset: "CNY" | "USDT") => {
        const adjustments = hasManual ? book.adjustments.filter(m => m.user_id === userId && (asset === "CNY" ? (m.note || "").startsWith("[CNY]") : !(m.note || "").startsWith("[CNY]") && !(m.note || "").startsWith("[BALANCE_BASE]"))) : [];
        return decimal(units(asset === "CNY" ? user.cny_balance : user.balance)
          + adjustments.reduce((s, m) => s + units(m.amount), BigInt(0))
          - active.filter(h => h.asset_code === asset).reduce((s, h) => s + units(h.amount) - units(h.released_amount ?? "0"), BigInt(0)));
      };
      return [[{ cny_available: available("CNY"), usdt_available: available("USDT"), invalid_holds: invalid ? 1 : 0 }], []];
    }
    if (sql.includes("FROM ai_wallet_asset_balances")) {
      expect(sql).toContain("CAST(available_balance AS CHAR) AS available_balance");
      return [book.balances.filter(b => b.user_id === values[0]), []];
    }
    if (sql.includes("FROM ai_wallet_manual_")) return [[], []];
    throw new Error("Unrecognized isolated SQL: " + sql);
  });
  const connection = { execute };
  const getDbConnection = vi.fn(async () => connection as typeof connection | null);
  const ensures = vi.fn(() => { throw new Error("No read-time ensure allowed"); });
  const runtime = runInNewContext(ts.transpileModule(`${unitsSource}\n${source}\n({ available: getWalletManualFreezeAvailableAssets, state: getWalletManualFreezeState });`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, {
    AI_WALLET_ASSETS, SCALE: scale, BigInt, Map, getDbConnection,
    rowsOf: (v: unknown) => Array.isArray(v) ? v : [], isFunding: (a: string) => a === "CNY" || a === "USDT",
    itemResult: () => { throw new Error("Unexpected manual facts"); }, normalizeAsset: (a: string) => a,
    ensureWalletManualFreezeInfrastructure: ensures, ensureLedger37WalletInfrastructure: ensures, ensureMultiAssetWalletInfrastructure: ensures,
    withGlobalWalletTransaction: ensures,
  }, { timeout: 1000 }) as {
    available: (userId: number, conn?: typeof connection) => Promise<{ assetCode: AiWalletAsset; availableAmount: string }[]>;
    state: (input: { ledgerId: number; userId: number }) => Promise<any>;
  };
  return { book, calls, execute, connection, getDbConnection, ensures, ...runtime };
}

describe("real manual freeze availability: exact native quantities, no prices or writes", () => {
  it("uses one funding aggregate, preserves native 8/18 decimals above Number safe precision, and accepts unpriced BTY", async () => {
    const h = harness();
    h.book.users.set(1, { balance: "9007199254740993.12345678", cny_balance: "123456789012345678.99999999" });
    h.book.balances.push({ user_id: 1, asset_code: "BTY", available_balance: "9007199254740993.123456789123456789", frozen_balance: "999" },
      { user_id: 1, asset_code: "BTC", available_balance: "0.000000000000000001" },
      { user_id: 2, asset_code: "ETH", available_balance: "100" },
      { user_id: 1, asset_code: "UNKNOWN", available_balance: "invalid unknown data" },
      { user_id: 1, asset_code: "USDT", available_balance: "999999" });
    expect(await h.available(1)).toEqual([
      { assetCode: "CNY", availableAmount: "123456789012345678.99999999" },
      { assetCode: "USDT", availableAmount: "9007199254740993.12345678" },
      { assetCode: "BTC", availableAmount: "0.000000000000000001" },
      { assetCode: "BTY", availableAmount: "9007199254740993.123456789123456789" },
    ]);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[0].values).toEqual([1, 1, 1]);
    expect(h.calls.filter(c => c.sql.includes("FROM af_manual_balances"))).toHaveLength(1);
    expect(h.ensures).not.toHaveBeenCalled();
  });
  it("mirrors prefix/null rules and deducts all active37/52/manual/other-ledger holds, including partial releases", async () => {
    const h = harness();
    h.book.adjustments.push({ user_id: 1, ledger_id: 37, amount: "10.00000001", note: null },
      { user_id: 1, ledger_id: 52, amount: "-2", note: "debit" },
      { user_id: 1, ledger_id: 37, amount: "50", note: "[CNY]credit" },
      { user_id: 1, ledger_id: 52, amount: "-5", note: "[CNY][BALANCE_BASE]debit" },
      { user_id: 1, amount: "999", note: "[BALANCE_BASE]mirror" },
      { user_id: 2, amount: "999", note: "credit" });
    h.book.holds.push({ user_id: 1, ledger_id: 37, asset_code: "USDT", amount: "20", released_amount: "5", status: "active" },
      { user_id: 1, ledger_id: 52, asset_code: "USDT", amount: "30", released_amount: "0", status: "active" },
      { user_id: 1, ledger_id: 52, tag_name: "AIW_MANUAL_FREEZE:abc", asset_code: "USDT", amount: "10", status: "active" },
      { user_id: 1, ledger_id: 99, asset_code: "CNY", amount: "60", released_amount: "20", status: "active" },
      { user_id: 1, ledger_id: 37, asset_code: "USDT", amount: "999", status: "released" },
      { user_id: 2, ledger_id: 52, asset_code: "USDT", amount: "999", status: "active" });
    expect(await h.available(1)).toEqual([{ assetCode: "CNY", availableAmount: "105" }, { assetCode: "USDT", availableAmount: "53.00000001" }]);
  });
  it.each(["CNY", "USDT"] as const)("truncates historical sub8 hold remainder for %s rather than rounding max up", async asset => {
    const h = harness();
    h.book.holds.push({ user_id: 1, ledger_id: 37, asset_code: asset, amount: "0.000000000000000001", status: "active" });
    const result = await h.available(1);
    expect(result.find(a => a.assetCode === asset)?.availableAmount).toBe("99.99999999");
  });
  it("omits negative, signed zero, zero, absent assets and positive funding dust below8 places", async () => {
    const h = harness();
    h.book.users.set(1, { balance: "0.000000009999999999", cny_balance: "-1" });
    h.book.balances.push(...["0", "-0.000000000000000000", "-1"].map((amount, index) => ({ user_id: 1, asset_code: ["BTC", "ETH", "BTY"][index], available_balance: amount })));
    expect(await h.available(1)).toEqual([]);
  });
  it.each(["-1", "101"])("fails closed for invalid active released amount %s", async released_amount => {
    const h = harness();
    h.book.holds.push({ user_id: 1, ledger_id: 37, asset_code: "CNY", amount: "100", released_amount, status: "active" });
    await expect(h.available(1)).rejects.toThrow("冻结台账异常");
  });
  it("does not consult malformed released/foreign/market funding holds", async () => {
    const h = harness();
    h.book.holds.push({ user_id: 1, ledger_id: 37, asset_code: "USDT", amount: "-1", status: "released" },
      { user_id: 2, ledger_id: 37, asset_code: "CNY", amount: "-1", status: "active" },
      { user_id: 1, ledger_id: 52, asset_code: "BTY", amount: "-1", status: "active" });
    expect(await h.available(1)).toHaveLength(2);
  });
  it.each([undefined, null, 0.1, "NaN", "1e-8", "1.0000000000000000001"])("rejects known asset nondecimal/lossy driver value %j instead of inventing zero", async amount => {
    const h = harness();
    h.book.balances.push({ user_id: 1, asset_code: "BTY", available_balance: amount });
    await expect(h.available(1)).rejects.toThrow("可用余额数据异常");
  });
  it.each(["cny_available", "usdt_available"])("propagates malformed %s funding data", async field => {
    const h = harness();
    h.book.fundingOverride = { cny_available: "1", usdt_available: "1", invalid_holds: 0, [field]: undefined };
    await expect(h.available(1)).rejects.toThrow("可用余额数据异常");
  });
  it("reuses a supplied readonly connection without acquiring another", async () => {
    const h = harness();
    expect(await h.available(1, h.connection)).toHaveLength(2);
    expect(h.getDbConnection).not.toHaveBeenCalled();
  });
});

describe("first read and genuinely absent infrastructure without DDL or false empty wallets", () => {
  it.each(["ai_wallet_manual_freezes", "ai_wallet_manual_freeze_actions"])("absent %s keeps real availableAssets and empty facts", async table => {
    const h = harness();
    h.book.absent.add(table);
    h.book.balances.push({ user_id: 1, asset_code: "BTY", available_balance: "1.123456789123456789" });
    expect(await h.state({ ledgerId: 52, userId: 1 })).toEqual({ items: [], events: [], orderProtected: true,
      availableAssets: [{ assetCode: "CNY", availableAmount: "100" }, { assetCode: "USDT", availableAmount: "100" }, { assetCode: "BTY", availableAmount: "1.123456789123456789" }] });
    expect(h.ensures).not.toHaveBeenCalled();
  });
  it.each([["af_manual_balances"], ["ai_wallet_project_holds"], ["af_manual_balances", "ai_wallet_project_holds"], ["af_manual_balances", "ai_wallet_project_holds", "ai_wallet_asset_balances"]].map(absent => ({ absent })))("explicit absent sources $absent preserve users and every existing funding source", async ({ absent }) => {
    const h = harness();
    absent.forEach(t => h.book.absent.add(t));
    h.book.adjustments.push({ user_id: 1, amount: "10", note: "credit" });
    h.book.holds.push({ user_id: 1, ledger_id: 37, asset_code: "USDT", amount: "20", status: "active" });
    expect(await h.available(1)).toEqual([{ assetCode: "CNY", availableAmount: "100" },
      { assetCode: "USDT", availableAmount: absent.includes("af_manual_balances") ? absent.includes("ai_wallet_project_holds") ? "100" : "80" : "110" }]);
    expect(h.calls.filter(c => c.sql.startsWith("SELECT 1 FROM "))).toHaveLength(2);
    expect(h.ensures).not.toHaveBeenCalled();
  });
  it("missing market table only omits market assets, not funded balances", async () => {
    const h = harness(); h.book.absent.add("ai_wallet_asset_balances");
    expect(await h.available(1)).toEqual([{ assetCode: "CNY", availableAmount: "100" }, { assetCode: "USDT", availableAmount: "100" }]);
  });
  it.each([[], ["af_manual_balances", "ai_wallet_project_holds"]].map(absent => ({ absent })))("users is never optional even when optional sources absent=$absent", async ({ absent }) => {
    const h = harness(); ["users", ...absent].forEach(t => h.book.absent.add(t));
    await expect(h.available(1)).rejects.toMatchObject({ code: "ER_NO_SUCH_TABLE" });
  });
  it("does not cache missing schema or balances across reads", async () => {
    const h = harness(); h.book.absent.add("ai_wallet_asset_balances");
    await h.available(1);
    h.book.absent.clear(); h.book.balances.push({ user_id: 1, asset_code: "BTY", available_balance: "1" });
    expect((await h.available(1)).at(-1)).toEqual({ assetCode: "BTY", availableAmount: "1" });
  });
  it.each(failures)("funding %s errors propagate unchanged, never fall back", async code => {
    const h = harness(); const error = Object.assign(new Error(code), { code });
    h.book.errors.set("AS cny_available", error);
    await expect(h.state({ ledgerId: 52, userId: 1 })).rejects.toBe(error);
    expect(h.calls).toHaveLength(1);
  });
  it.each(failures)("market %s errors propagate unchanged, even if manual table is absent", async code => {
    const h = harness(); const error = Object.assign(new Error(code), { code });
    h.book.absent.add("ai_wallet_manual_freezes"); h.book.errors.set("FROM ai_wallet_asset_balances", error);
    await expect(h.state({ ledgerId: 52, userId: 1 })).rejects.toBe(error);
    expect(h.calls).toHaveLength(2);
  });
  it("does not prefer a missing-table cause over a primary SQL error", async () => {
    const h = harness(); const error = { code: "ER_PARSE_ERROR", cause: missing() };
    h.book.errors.set("AS cny_available", error);
    await expect(h.available(1)).rejects.toBe(error);
    expect(h.calls).toHaveLength(1);
  });
  it("supports wrapped genuine missing table, but propagates fallback/probe/retry errors", async () => {
    const h = harness(); h.book.errors.set("AS cny_available", { cause: missing() });
    h.book.errors.set("SELECT 1 FROM af_manual_balances", new Error("probe network failure"));
    await expect(h.available(1)).rejects.toThrow("probe network failure");
    const retry = harness(); retry.book.absent.add("af_manual_balances");
    const error = Object.assign(new Error("fallback bad column"), { code: "ER_BAD_FIELD_ERROR" });
    retry.book.errors.set("SELECT CAST(COALESCE(u.cny_balance, 0) -", error);
    await expect(retry.available(1)).rejects.toBe(error);
  });
  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("invalid user %s fails before acquiring or querying DB", async userId => {
    const h = harness();
    await expect(h.available(userId)).rejects.toThrow("用户无效");
    await expect(h.state({ ledgerId: 52, userId })).rejects.toThrow("用户无效");
    expect(h.calls).toEqual([]); expect(h.getDbConnection).not.toHaveBeenCalled();
  });
  it.each([37, 53])("non52 ledger %s fails before acquiring DB", async ledgerId => {
    const h = harness();
    await expect(h.state({ ledgerId, userId: 1 })).rejects.toThrow("52号");
    expect(h.getDbConnection).not.toHaveBeenCalled();
  });
  it("rejects nonexistent users and missing DB connection", async () => {
    const h = harness(); await expect(h.available(999)).rejects.toThrow("用户不存在");
    h.getDbConnection.mockResolvedValue(null);
    await expect(h.available(1)).rejects.toThrow("数据库连接失败");
    await expect(h.state({ ledgerId: 52, userId: 1 })).rejects.toThrow("数据库连接失败");
  });
  it("new readonly declarations contain no amount Number/parseFloat conversion or ES5-incompatible BigInt literal", () => {
    const amountSource = names.filter(name => name !== "getWalletManualFreezeState").map(name => productionFunction(file, name)).join("\n");
    expect(amountSource).not.toMatch(/\b(?:Number|parseFloat)\s*\(/);
    expect(source).not.toMatch(/\b\d+n\b/);
    expect(source).not.toMatch(/await ensure|beginTransaction|withGlobalWalletTransaction|FOR UPDATE/);
  });
});
