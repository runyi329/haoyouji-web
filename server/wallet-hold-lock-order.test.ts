import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { AI_WALLET_ASSETS, AI_WALLET_CRYPTO_MARKET_ASSETS } from "../shared/ai-wallet-assets";

// Production AST/functions only; NEVER import db, router entrypoints, scanners or lazy DDL.
const tree = (file: string) => ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const ledger = tree("./ledger37-wallet.ts");
const guard = tree("./wallet-funding-guard.ts");
const manual = tree("./db-wallet-manual-freezes.ts");
const routers = tree("./routers.ts");
const fnText = (ast: ts.SourceFile, name: string) => {
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!fn) throw new Error("Missing production function: " + name);
  return fn.getText(ast).replace(/^export /, "");
};
function load(ast: ts.SourceFile, deps: Record<string, any>, names: string[], variables: string[] = [], excluded: string[] = []) {
  const parts = ast.statements.filter(n => ts.isFunctionDeclaration(n) && n.name && !excluded.includes(n.name.text))
    .map(n => n.getText(ast).replace(/^export /, ""));
  for (const n of ast.statements) {
    if (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ts.isIdentifier(d.name) && variables.includes(d.name.text))) parts.push(n.getText(ast).replace(/^export /, ""));
  }
  const code = ts.transpileModule(parts.join("\n") + `\nexports.result = {${names.join(",")}};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { ...deps, exports: {} as any };
  runInNewContext(code, context);
  return context.exports.result;
}
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};
const hold = (id = 1, user = 1, asset = "USDT", ledgerId = 37, tag = "项目保证金") => ({ id, user_id: user, asset_code: asset, ledger_id: ledgerId, tag_name: tag, amount: "10", released_amount: "0", status: "active", hold_no: `H${id}`, request_id: `hold_${id}` });

type Trace = { tx: number; sql: string; values: any[] };
class IsolatedSql {
  users = new Map([1, 2, 3].map(id => [id, { id, balance: "100", cny_balance: "100" }]));
  holds: any[] = [hold()];
  freezes: any[] = [];
  actions: any[] = [];
  trace: Trace[] = [];
  releaseActions = 0;
  nextId = 0;
  locks = new Map<number, { tx: number; done: ReturnType<typeof deferred> }>();
  afterFirstUser?: (tx: number) => Promise<void>;
  beforeHoldLock?: () => void;
  afterDiscovery?: () => void;
  api: any;
  manualApi: any;
  principal: any;
  route: any;
  constructor() {
    const base = { getDbTransactionConnection: async () => this.connection(), ensureLedger37WalletInfrastructure: async () => {}, createHash, randomBytes, AI_WALLET_CRYPTO_MARKET_ASSETS,
      dbMultiAssetWallet: { PRIMARY_JOINT_SEGMENT_ID: "__primary__", normalizeJointCollateralSegmentId: (v?: string) => v || "__primary__", moveMultiAssetBalanceToFrozen: async () => ({}) },
      getCnyValue: async () => "10" };
    this.api = load(ledger, base, ["lockLedgerWalletUsersForUpdate", "releaseLedger37WalletHold", "freezeLedger37WalletHold", "syncLedger52FundingCollateralHolds", "releaseLedger52FundingCollateralHoldsForOrder", "lockLedger52FundingCollateralUsersForOrder"],
      ["LEDGER_37_ID", "LEDGER_52_ID", "ledger52FundingCollateralTag", "ledger52FundingCollateralTagsForOrder"], ["ensureLedger37WalletInfrastructure", "getCnyValue"]);
    const funding = load(guard, { getDbTransactionConnection: base.getDbTransactionConnection, TRPCError }, ["withGlobalWalletTransaction", "assertGlobalWalletDebit", "fundingUnits"], ["SCALE"]);
    this.manualApi = load(manual, { ...funding, createHash, randomUUID, AI_WALLET_ASSETS, ensureWalletManualFreezeInfrastructure: async () => {} }, ["freezeWalletManually"],
      ["MANUAL_FREEZE_HOLD_TAG_PREFIX", "rowsOf", "isFunding"], ["ensureWalletManualFreezeInfrastructure"]);
    this.principal = runInNewContext(ts.transpileModule(fnText(routers, "getAf52ActivePrincipalHoldForUpdate") + "\ngetAf52ActivePrincipalHoldForUpdate;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
      { lockLedgerWalletUsersForUpdate: this.api.lockLedgerWalletUsersForUpdate, asRows: (r: any) => r, getAf52WalletHoldTag: (id: number) => `52号谷底征筹订单 #${id} 本金` });
    // Execute the actual legacy37 route mutation, not a synthetic withGlobalWalletTransaction.
    let callback: ts.ArrowFunction | undefined;
    const visit = (n: ts.Node) => {
      if (ts.isPropertyAssignment(n) && n.name.getText(routers) === "releaseLedger37MarginToWallet") {
        const find = (c: ts.Node) => { if (ts.isCallExpression(c) && ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === "mutation") callback = c.arguments[0] as ts.ArrowFunction; else ts.forEachChild(c, find); };
        find(n.initializer);
      }
      ts.forEachChild(n, visit);
    };
    visit(routers);
    if (!callback) throw new Error("Missing legacy37 route mutation");
    this.route = runInNewContext(ts.transpileModule("const callback = " + callback.getText(routers) + "; callback;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
      { process: { env: {} }, TRPCError, assertLedger37Owner: async () => {}, getDbTransactionConnection: base.getDbTransactionConnection, requireLedger37MarginActor: () => ({ id: 99 }), releaseLedger37WalletHold: this.api.releaseLedger37WalletHold, appendLedger37WalletMarginRecord: async () => {} });
  }
  connection() {
    const tx = ++this.nextId;
    const owned = new Set<number>();
    let hasHoldLock = false;
    let undo: any;
    const cleanup = () => { for (const id of owned) { const lock = this.locks.get(id); if (lock?.tx === tx) { this.locks.delete(id); lock.done.resolve(); } } };
    return {
      beginTransaction: async () => {},
      commit: async () => cleanup(),
      rollback: async () => { if (undo) { this.holds = undo.holds; this.freezes = undo.freezes; this.actions = undo.actions; this.releaseActions = undo.releaseActions; } cleanup(); },
      release: cleanup,
      execute: async (raw: string, values: any[] = []) => {
        const sql = raw.replace(/\s+/g, " ").trim();
        this.trace.push({ tx, sql, values });
        if (sql.includes("FROM users") && sql.includes("FOR UPDATE")) {
          const id = Number(values[0]);
          if (hasHoldLock && !owned.has(id)) throw new Error("LOCK INVERSION: new user after holds");
          if (!owned.has(id)) {
            while (this.locks.has(id)) await this.locks.get(id)!.done.promise;
            const first = owned.size === 0;
            owned.add(id); this.locks.set(id, { tx, done: deferred() });
            if (first) { undo = structuredClone({ holds: this.holds, freezes: this.freezes, actions: this.actions, releaseActions: this.releaseActions }); await this.afterFirstUser?.(tx); }
          }
          return [this.users.has(id) ? [this.users.get(id)] : []];
        }
        if (sql.includes("FROM ai_wallet_project_holds")) {
          if (!sql.includes("FOR UPDATE")) { const result = this.selectHolds(sql, values).map(r => ({ ...r })); this.afterDiscovery?.(); this.afterDiscovery = undefined; return [result]; }
          this.beforeHoldLock?.(); this.beforeHoldLock = undefined;
          const selected = this.selectHolds(sql, values);
          // Reject the actual legacy inversion; the current read still returns changed identities
          // so production revalidation is independently tested below.
          if (["CNY", "USDT"].includes(selected[0]?.asset_code) && owned.size === 0) throw new Error("LOCK INVERSION: holds before users");
          hasHoldLock = true;
          if (sql.includes("SUM(")) return [[{ frozen: selected.reduce((n, r) => n + Number(r.amount) - Number(r.released_amount), 0) }]];
          return [selected.map(r => ({ ...r, remaining_amount: String(Number(r.amount) - Number(r.released_amount)) }))];
        }
        if (sql.startsWith("SELECT amount FROM af_manual_balances")) { if (!owned.has(values[0])) throw new Error("manual before user"); return [[]]; }
        if (sql.includes("FROM ai_wallet_manual_freeze_actions")) return [[]];
        if (sql.startsWith("INSERT INTO ai_wallet_project_hold_releases")) { this.releaseActions++; return [{ insertId: this.releaseActions }]; }
        if (sql.startsWith("UPDATE ai_wallet_project_holds")) {
          const full = sql.includes("released_amount = amount");
          const r = this.holds.find(r => r.id === values[full ? 2 : 3]);
          if (!r) throw new Error("Missing hold update");
          r.released_amount = full ? r.amount : String(Number(r.released_amount) + Number(values[0]));
          if (full) r.status = "released";
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith("INSERT INTO ai_wallet_project_holds")) {
          const isManual = sql.includes("VALUES (?, ?, 52");
          const r = isManual ? { ...hold(this.holds.length + 10, values[2], values[4], 52, values[3]), amount: values[5], hold_no: values[0], request_id: values[1] }
            : { ...hold(this.holds.length + 10, values[3], values[5], values[2], values[4]), amount: values[6], hold_no: values[0], request_id: values[1] };
          this.holds.push(r); return [{ insertId: r.id }];
        }
        if (sql.startsWith("INSERT INTO ai_wallet_manual_freezes")) { const r = { id: this.freezes.length + 1, user_id: values[0], asset_code: values[2], amount: values[3], funding_hold_id: values[4], freeze_no: values[1], note: values[5], released_amount: "0", status: "active" }; this.freezes.push(r); return [{ insertId: r.id }]; }
        if (sql.includes("FROM ai_wallet_manual_freezes")) return [this.freezes.filter(r => r.user_id === values[0] && r.id === values[1])];
        if (sql.startsWith("INSERT INTO ai_wallet_manual_freeze_actions")) { this.actions.push(values); return [{ insertId: this.actions.length }]; }
        throw new Error("Unsupported isolated SQL: " + sql);
      },
    };
  }
  selectHolds(sql: string, v: any[]) {
    if (sql.includes("INNER JOIN af_orders")) return this.holds.filter(r => r.id === 1 && r.user_id === v[1] && r.ledger_id === 52 && r.asset_code === "USDT" && r.status === "active" && r.tag_name === v[3]);
    if (sql.includes("request_id = ?")) return this.holds.filter(r => r.request_id === v[0]);
    if (sql.includes("WHERE id = ?")) return this.holds.filter(r => r.id === v[0] && (!sql.includes("ledger_id = ?") || r.ledger_id === v[1]));
    if (sql.includes("WHERE user_id = ?")) return this.holds.filter(r => r.user_id === v[0] && r.asset_code === v[1] && r.status === "active");
    if (sql.includes("WHERE ledger_id = ?")) return this.holds.filter(r => r.ledger_id === v[0] && r.status === "active" && (sql.includes("tag_name LIKE") ? r.tag_name === v[1] || r.tag_name.startsWith("52号融资订单 #7 · 联合段 ") : r.tag_name === v[1]) && (!sql.includes("AND user_id = ?") || r.user_id === v[sql.includes("tag_name LIKE") ? 3 : 2]) && (!sql.includes("amount >") || Number(r.amount) > Number(r.released_amount)));
    throw new Error("Unsupported hold selection: " + sql);
  }
}
const oldInput = { holdId: 1, actorUserId: 99 };
const manualInput = { ledgerId: 52, userId: 1, assetCode: "USDT", amount: "80", requestId: "lock_order_manual_001", actorUserId: 99 };

describe("legacy and manual wallet lock order: real production functions, isolated DB", () => {
  it.each(["USDT", "CNY"])("legacy37 real route releases %s with owner→hold→current balance locks", async asset => {
    const h = new IsolatedSql(); h.holds[0].asset_code = asset;
    const result = await h.route({ ctx: { user: { id: 99 } }, input: { holdId: 1, amount: "3", ledgerId: 37 } });
    expect(result.remainingAmount).toBe("7"); expect(h.releaseActions).toBe(1);
    const sql = h.trace.map(t => t.sql); expect(sql.findIndex(s => s.includes("FROM users"))).toBeLessThan(sql.findIndex(s => s.includes("project_holds") && s.includes("FOR UPDATE")));
    expect(sql.some(s => s.includes("af_manual_balances") && s.includes("FOR UPDATE"))).toBe(true);
    expect(sql.some(s => s.includes("SUM(") && s.includes("FOR UPDATE"))).toBe(true);
  });
  it("own transaction release commits the unchanged full-release semantics", async () => {
    const h = new IsolatedSql(); const result = await h.api.releaseLedger37WalletHold(oldInput);
    expect(result.fullyReleased).toBe(true); expect(result.releasedAmount).toBe("10"); expect(h.locks.size).toBe(0);
  });
  it.each(["owner", "asset"])("fails closed if discovered %s changes before current hold lock", async field => {
    const h = new IsolatedSql(); h.beforeHoldLock = () => { if (field === "owner") h.holds[0].user_id = 2; else h.holds[0].asset_code = "CNY"; };
    await expect(h.api.releaseLedger37WalletHold(oldInput)).rejects.toThrow("归属已变化"); expect(h.releaseActions).toBe(0);
  });
  it("rejects manual namespace using the legacy release after identity/current-read checks", async () => {
    const h = new IsolatedSql(); h.holds[0].tag_name = "AIW_MANUAL_FREEZE:protected";
    await expect(h.api.releaseLedger37WalletHold(oldInput)).rejects.toThrow("独立手动解冻"); expect(h.releaseActions).toBe(0);
  });
  it.each(["released", "missing"])("refuses %s hold without a release write", async state => {
    const h = new IsolatedSql(); if (state === "missing") h.holds = []; else h.holds[0].status = state;
    await expect(h.api.releaseLedger37WalletHold(oldInput)).rejects.toThrow(); expect(h.releaseActions).toBe(0);
  });
  it("52 original principal helper locks the wallet BEFORE its joined FOR UPDATE then releases", async () => {
    const h = new IsolatedSql(); h.holds = [hold(1, 1, "USDT", 52, "52号谷底征筹订单 #7 本金")];
    const tx = h.connection(); await tx.beginTransaction();
    const row = await h.principal(tx, 7, 1); expect(row.id).toBe(1);
    await h.api.releaseLedger37WalletHold({ ...oldInput, ledgerId: 52, transaction: tx }); await tx.commit();
    expect(h.trace[0].sql).toContain("FROM users"); expect(h.trace[1].sql).toContain("INNER JOIN af_orders"); expect(h.releaseActions).toBe(1);
  });
  it("52 principal helper retains joined owner/order namespace rejection", async () => {
    const h = new IsolatedSql(); h.holds = [hold(1, 2, "USDT", 52, "AIW_MANUAL_FREEZE:fake")];
    const tx = h.connection(); expect(await h.principal(tx, 7, 1)).toBeNull(); await tx.rollback(); expect(h.releaseActions).toBe(0);
  });
  it("52 sync locks users first and shrinks the actual existing collateral hold", async () => {
    const h = new IsolatedSql(); h.holds = [hold(1, 1, "USDT", 52, "52号融资订单 #7 钱包担保")];
    const result = await h.api.syncLedger52FundingCollateralHolds({ orderId: 7, userId: 1, assets: [{ coin: "USDT", qty: "6" }], actorUserId: 99 });
    expect(result.holds[0].remainingAmount).toBe("6"); expect(h.trace[0].sql).toContain("FROM users");
  });
  it("52 batch locks every owner ascending before ANY hold, regardless of input/asset order", async () => {
    const h = new IsolatedSql(); h.holds = [hold(1, 3, "USDT", 52, "52号融资订单 #7 钱包担保"), hold(2, 1, "CNY", 52, "52号融资订单 #7 · 联合段 s1 钱包担保"), hold(3, 3, "CNY", 52, "52号融资订单 #7 钱包担保")];
    const result = await h.api.releaseLedger52FundingCollateralHoldsForOrder({ orderId: 7, reason: "order_settled", actorUserId: 99 });
    expect(result.releasedCount).toBe(3);
    const firstHold = h.trace.findIndex(t => t.sql.includes("project_holds") && t.sql.includes("FOR UPDATE"));
    expect(h.trace.slice(0, firstHold).filter(t => t.sql.includes("FROM users")).map(t => t.values[0])).toEqual([1, 3]);
  });
  it.each(["new owner", "changed owner"])("batch rejects %s found by current read before any amount action", async change => {
    const h = new IsolatedSql(); h.holds = [hold(1, 1, "USDT", 52, "52号融资订单 #7 钱包担保")];
    h.beforeHoldLock = () => { if (change === "new owner") h.holds.push(hold(2, 2, "CNY", 52, "52号融资订单 #7 钱包担保")); else h.holds[0].user_id = 2; };
    await expect(h.api.releaseLedger52FundingCollateralHoldsForOrder({ orderId: 7, reason: "order_deleted", actorUserId: 99 })).rejects.toThrow("归属已变化"); expect(h.releaseActions).toBe(0);
  });
  it("multi-segment caller prelocks ALL owners; sequential segments never acquire a new user after holds", async () => {
    const h = new IsolatedSql(); h.holds = [hold(1, 3, "USDT", 52, "52号融资订单 #7 · 联合段 s1 钱包担保"), hold(2, 1, "CNY", 52, "52号融资订单 #7 · 联合段 s2 钱包担保")];
    const tx = h.connection(); const prelockedUserIds = await h.api.lockLedger52FundingCollateralUsersForOrder(tx, 7);
    for (const jointSegmentId of ["s1", "s2"]) await h.api.releaseLedger52FundingCollateralHoldsForOrder({ orderId: 7, jointSegmentId, reason: "order_settled", actorUserId: 99, transaction: tx, prelockedUserIds });
    await tx.commit(); expect(h.releaseActions).toBe(2);
    expect(h.trace.filter(t => t.sql.includes("FROM users")).slice(0, 2).map(t => t.values[0])).toEqual([1, 3]);
  });
  it("personal multi-segment prelock/filter never locks or releases another same-order owner", async () => {
    const h = new IsolatedSql(); h.holds = [hold(1, 3, "USDT", 52, "52号融资订单 #7 · 联合段 s1 钱包担保"), hold(2, 1, "CNY", 52, "52号融资订单 #7 · 联合段 s2 钱包担保"), hold(3, 3, "CNY", 52, "52号融资订单 #7 · 联合段 s2 钱包担保")];
    const tx = h.connection(); const prelockedUserIds = await h.api.lockLedger52FundingCollateralUsersForOrder(tx, 7, 3);
    expect(prelockedUserIds).toEqual([3]);
    for (const jointSegmentId of ["s1", "s2"]) await h.api.releaseLedger52FundingCollateralHoldsForOrder({ orderId: 7, userId: 3, jointSegmentId, reason: "order_settled", actorUserId: 99, transaction: tx, prelockedUserIds });
    await tx.commit(); expect(h.releaseActions).toBe(2); expect(h.holds[1].status).toBe("active");
    expect(h.trace.filter(t => t.sql.includes("FROM users")).every(t => t.values[0] === 3)).toBe(true);
  });
  it("personal omitted-segment filter uses the last SQL parameter and retains other-order prefix isolation", async () => {
    const h = new IsolatedSql(); h.holds = [hold(1, 3, "USDT", 52, "52号融资订单 #7 钱包担保"), hold(2, 1, "CNY", 52, "52号融资订单 #7 钱包担保"), hold(3, 3, "CNY", 52, "52号融资订单 #70 钱包担保")];
    const result = await h.api.releaseLedger52FundingCollateralHoldsForOrder({ orderId: 7, userId: 3, reason: "order_settled", actorUserId: 99 });
    expect(result.releasedCount).toBe(1); expect(h.holds.map(r => r.status)).toEqual(["released", "active", "active"]);
  });
  it("prelocked multi-segment owner set rejects unexpected owners BEFORE acquiring another user", async () => {
    const h = new IsolatedSql(); h.holds = [hold(1, 2, "USDT", 52, "52号融资订单 #7 钱包担保")]; const tx = h.connection();
    await expect(h.api.releaseLedger52FundingCollateralHoldsForOrder({ orderId: 7, reason: "order_settled", actorUserId: 99, transaction: tx, prelockedUserIds: [1] })).rejects.toThrow("归属已变化");
    expect(h.trace.some(t => t.sql.includes("FROM users"))).toBe(false); await tx.rollback();
  });
  it.each(["manual first", "legacy first"])("concurrent real manual freeze + legacy37 route: %s serialize without inversion", async first => {
    const h = new IsolatedSql(); const acquired = deferred(); const resume = deferred(); let blocked = false;
    h.afterFirstUser = async () => { if (!blocked) { blocked = true; acquired.resolve(); await resume.promise; } };
    const legacy = () => h.route({ ctx: { user: { id: 99 } }, input: { ...oldInput, ledgerId: 37, amount: "3" } });
    const newer = () => h.manualApi.freezeWalletManually(manualInput);
    const a = first === "manual first" ? newer() : legacy(); await acquired.promise;
    const b = first === "manual first" ? legacy() : newer();
    // Wait until the second path reaches the user mutex: it must not have held a hold first.
    for (let i = 0; i < 50 && !h.trace.some(t => t.tx === 2 && t.sql.includes("FROM users")); i++) await Promise.resolve();
    expect(h.trace.some(t => t.tx === 2 && t.sql.includes("project_holds") && t.sql.includes("FOR UPDATE"))).toBe(false);
    resume.resolve(); await Promise.all([a, b]);
    expect(h.actions).toHaveLength(1); expect(h.releaseActions).toBe(1); expect(h.holds[0].released_amount).toBe("3"); expect(h.locks.size).toBe(0);
  });
  it("manual path still refuses overfreeze using current locked legacy holds, not discovery snapshot", async () => {
    const h = new IsolatedSql(); await expect(h.manualApi.freezeWalletManually({ ...manualInput, amount: "90.00000001" })).rejects.toThrow("可用余额不足");
    expect(h.freezes).toHaveLength(0); expect(h.actions).toHaveLength(0); expect(h.holds).toHaveLength(1);
  });
  it("legacy funding freeze idempotency lookup now follows the user lock", async () => {
    const h = new IsolatedSql(); const result = await h.api.freezeLedger37WalletHold({ userId: 1, assetCode: "USDT", amount: "10", tagName: "项目保证金", requestId: "hold_1", actorUserId: 99 });
    expect(result.alreadyCompleted).toBe(true); expect(h.trace[0].sql).toContain("FROM users"); expect(h.trace[1].sql).toContain("request_id = ?");
  });
  it("37 paused batch routes acquire user lock before caller-owned hold locks", () => {
    for (const name of ["releaseLedger37PausedTagMarginsToWallet", "settleLedger37PausedTag"]) {
      let text = ""; const visit = (n: ts.Node) => { if (ts.isPropertyAssignment(n) && n.name.getText(routers) === name) text = n.initializer.getText(routers); ts.forEachChild(n, visit); }; visit(routers);
      expect(text).not.toBe(""); expect(text.indexOf("lockLedgerWalletUsersForUpdate(transaction, [input.targetUserId])")).toBeLessThan(text.indexOf("SELECT id FROM ai_wallet_project_holds"));
    }
    const principalText = fnText(routers, "getAf52ActivePrincipalHoldForUpdate"); expect(principalText.indexOf("lockLedgerWalletUsersForUpdate")).toBeLessThan(principalText.indexOf("FROM ai_wallet_project_holds"));
  });
});
