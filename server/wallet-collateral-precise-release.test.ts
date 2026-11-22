import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomBytes, randomInt } from "node:crypto";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { AI_WALLET_ASSET_CATALOG, AI_WALLET_SETTLEMENT_ASSETS, AI_WALLET_CRYPTO_MARKET_ASSETS } from "../shared/ai-wallet-assets";

// Execute production declarations only: no db import, real connection, router, scanner, API or DDL.
function production(file: string, deps: Record<string, any>, names: string[], variables: string[]) {
  const ast = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const parts = ast.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && node.name && !node.name.text.startsWith("ensure") && !["getCnyValue"].includes(node.name.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && variables.includes(d.name.text)))
  ).map(node => node.getText(ast).replace(/^export /, ""));
  // Balance initialization is a production helper but never infrastructure/schema initialization.
  const balanceRow = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ensureBalanceRow");
  if (balanceRow) parts.push(balanceRow.getText(ast));
  const code = ts.transpileModule(parts.join("\n") + `\nexports.result = {${names.join(",")}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { ...deps, exports: {} as any };
  runInNewContext(code, context);
  return context.exports.result;
}
const SCALE = 10n ** 18n;
function units(value: string | number): bigint {
  const [integer, fraction = ""] = String(value).split(".");
  return BigInt(integer) * SCALE + BigInt(fraction.padEnd(18, "0"));
}
function decimal(value: bigint): string {
  const fractional = (value % SCALE).toString().padStart(18, "0").replace(/0+$/, "");
  return (value / SCALE).toString() + (fractional ? `.${fractional}` : "");
}
const tag = (order = 4860, segment = "__primary__") => segment === "__primary__"
  ? `52号融资订单 #${order} 钱包担保` : `52号融资订单 #${order} · 联合段 ${segment} 钱包担保`;
const fundingHold = (id: number, userId: number, amount = "18", asset = "USDT", order = 4860, segment = "__primary__", ledger = 52) => ({
  id, user_id: userId, asset_code: asset, ledger_id: ledger, tag_name: tag(order, segment), amount,
  released_amount: "0", status: "active", hold_no: `H${id}`,
});
const marketLock = (id: number, userId: number, amount = "18", order = 4860, segment = "__primary__", ledger = 52) => ({
  id, user_id: userId, asset_code: "ETH", ledger_id: ledger, order_id: order, joint_segment_id: segment, amount, status: "active",
});
type Trace = { sql: string; values: any[] };
class OfflineWallet {
  users = [{ id: 18, balance: "100", cny_balance: "100" }, { id: 28, balance: "100", cny_balance: "100" }];
  holds = [fundingHold(1, 18), fundingHold(2, 28), fundingHold(3, 18, "10", "USDT", 4861)];
  locks = [marketLock(1, 18), marketLock(2, 28), marketLock(3, 18, "10", 4861)];
  balances = [{ id: 1, user_id: 18, asset_code: "ETH", available_balance: "72", frozen_balance: "28" },
    { id: 2, user_id: 28, asset_code: "ETH", available_balance: "82", frozen_balance: "18" }];
  entries: any[] = [];
  releases: any[] = [];
  trace: Trace[] = [];
  commits = 0;
  rollbacks = 0;
  begins = 0;
  releasesOfConnection = 0;
  connections = 0;
  infrastructureCalls = 0;
  fail?: "entry" | "releaseAudit" | "marketCas" | "fundingCas" | "balance";
  beforeCurrentHold?: () => void;
  beforeBalanceUpdate?: () => void;
  api: any;
  market: any;
  constructor() {
    const deps = {
      randomBytes, randomInt, AI_WALLET_ASSET_CATALOG, AI_WALLET_SETTLEMENT_ASSETS, AI_WALLET_CRYPTO_MARKET_ASSETS,
      getDbTransactionConnection: async () => { this.connections++; return this.transaction(); },
      getDbConnection: async () => { throw new Error("FORBIDDEN: real/default connection"); },
      ensureMultiAssetWalletInfrastructure: async () => { this.infrastructureCalls++; },
      ensureLedger37WalletInfrastructure: async () => { this.infrastructureCalls++; },
    };
    this.market = production("./db-multi-asset-wallet.ts", deps, ["releaseWalletCollateralLocksForOrder", "normalizeJointCollateralSegmentId", "PRIMARY_JOINT_SEGMENT_ID"],
      ["MULTI_ASSET_WALLET_ASSETS", "PRIMARY_JOINT_SEGMENT_ID", "JOINT_SEGMENT_ID_PATTERN", "DECIMAL_PATTERN"]);
    this.api = production("./ledger37-wallet.ts", { ...deps, dbMultiAssetWallet: this.market },
      ["lockLedgerWalletUsersForUpdate", "lockLedger52FundingCollateralUsersForOrder", "releaseLedger52FundingCollateralHoldsForOrder"],
      ["LEDGER_37_ID", "LEDGER_52_ID", "ledger52FundingCollateralTag", "ledger52FundingCollateralTagsForOrder"]);
  }
  state() { return structuredClone({ users: this.users, holds: this.holds, locks: this.locks, balances: this.balances, entries: this.entries, releases: this.releases }); }
  fundingSummary(user = 18, asset = "USDT") {
    const owner = this.users.find(row => row.id === user)!;
    const total = units(asset === "CNY" ? owner.cny_balance : owner.balance);
    const frozen = this.holds.filter(row => row.user_id === user && row.asset_code === asset && row.status === "active")
      .reduce((sum, row) => sum + units(row.amount) - units(row.released_amount), 0n);
    return { total: decimal(total), frozen: decimal(frozen), available: decimal(total - frozen) };
  }
  transaction() {
    let undo: ReturnType<OfflineWallet["state"]> | undefined;
    const owned = new Set<number>();
    let lockedWallet = false;
    return {
      beginTransaction: async () => { this.begins++; undo = this.state(); },
      commit: async () => { this.commits++; owned.clear(); },
      rollback: async () => { this.rollbacks++; if (undo) Object.assign(this, undo); owned.clear(); },
      release: () => { this.releasesOfConnection++; },
      execute: async (raw: string, values: any[] = []) => {
        const sql = raw.replace(/\s+/g, " ").trim();
        this.trace.push({ sql, values });
        if (/\b(CREATE|ALTER|DROP|DELETE)\b/i.test(sql)) throw new Error("FORBIDDEN SQL: " + sql);
        if (sql.includes("FROM users")) {
          const id = Number(values[0]);
          if (sql.includes("FOR UPDATE")) {
            if (lockedWallet && !owned.has(id)) throw new Error("LOCK INVERSION: new owner after wallet lock");
            owned.add(id);
          }
          return [this.users.filter(row => row.id === id).map(row => ({ ...row }))];
        }
        if (sql.startsWith("SELECT amount FROM af_manual_balances")) { expect(owned.has(values[0])).toBe(true); return [[]]; }
        if (sql.includes("FROM ai_wallet_project_holds")) {
          if (sql.includes("FOR UPDATE")) {
            this.beforeCurrentHold?.(); this.beforeCurrentHold = undefined;
            lockedWallet = true;
          }
          const selected = this.select(this.holds, sql, values);
          if (sql.includes("SUM(")) return [[{ frozen: decimal(selected.reduce((n, row) => n + units(row.amount) - units(row.released_amount), 0n)) }]];
          return [selected.map(row => ({ ...row, remaining_amount: decimal(units(row.amount) - units(row.released_amount)) }))];
        }
        if (sql.includes("FROM ai_wallet_asset_collateral_locks")) {
          if (sql.includes("AND user_id = ?")) expect(owned.has(Number(values[values.length - 1]))).toBe(true);
          lockedWallet = true;
          return [this.select(this.locks, sql, values).map(row => ({ ...row }))];
        }
        if (sql.startsWith("INSERT INTO ai_wallet_asset_balances")) return [{ affectedRows: 1 }];
        if (sql.includes("FROM ai_wallet_asset_balances")) {
          lockedWallet = true;
          return [this.balances.filter(row => row.user_id === values[0] && row.asset_code === values[1]).map(row => ({ ...row }))];
        }
        if (sql.startsWith("UPDATE ai_wallet_asset_balances")) {
          this.beforeBalanceUpdate?.(); this.beforeBalanceUpdate = undefined;
          const row = this.balances.find(row => row.user_id === values[2] && row.asset_code === values[3]);
          if (this.fail === "balance" || !row || units(row.frozen_balance) < units(values[0])) return [{ affectedRows: 0 }];
          expect(values[0]).toBe(values[1]); expect(values[0]).toBe(values[4]);
          row.available_balance = decimal(units(row.available_balance) + units(values[0]));
          row.frozen_balance = decimal(units(row.frozen_balance) - units(values[0]));
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith("INSERT INTO ai_wallet_asset_entries")) {
          if (this.fail === "entry") throw new Error("injected immutable entry failure");
          this.entries.push({ user: values[2], asset: values[3], amount: values[4], availableAfter: values[5], event: values[6], ledger: values[8], note: values[7] });
          return [{ insertId: this.entries.length }];
        }
        if (sql.startsWith("INSERT INTO ai_wallet_project_hold_releases")) {
          if (this.fail === "releaseAudit") throw new Error("injected release audit failure");
          this.releases.push({ holdId: values[2], amount: values[3], kind: "release", status: "active" });
          return [{ insertId: this.releases.length }];
        }
        if (sql.startsWith("UPDATE ai_wallet_asset_collateral_locks")) {
          const row = this.locks.find(row => row.id === values[2]);
          const matches = row && (values.length === 3 || (row.ledger_id === values[3] && row.order_id === values[4] && row.user_id === values[5]
            && row.joint_segment_id === values[6] && row.asset_code === values[7] && row.status === "active" && units(row.amount) === units(values[8])));
          if (this.fail === "marketCas" || !matches) return [{ affectedRows: 0 }];
          row.status = "released"; return [{ affectedRows: 1 }];
        }
        if (sql.startsWith("UPDATE ai_wallet_project_holds")) {
          const row = this.holds.find(row => row.id === values[2]);
          const matches = row && (values.length === 3 || (row.ledger_id === values[3] && row.user_id === values[4] && row.tag_name === values[5]
            && row.asset_code === values[6] && row.status === "active" && units(row.amount) === units(values[7]) && units(row.released_amount) === units(values[8])));
          if (this.fail === "fundingCas" || !matches) return [{ affectedRows: 0 }];
          row.released_amount = row.amount; row.status = "released"; return [{ affectedRows: 1 }];
        }
        throw new Error("Unsupported offline SQL: " + sql);
      },
    };
  }
  select<T extends Record<string, any>>(rows: T[], sql: string, values: any[]): T[] {
    const where = sql.slice(sql.indexOf("WHERE"));
    const valueFor = (condition: string) => {
      const match = new RegExp(`\\b${condition.replace(/\?/g, "\\?")}`).exec(where);
      const offset = match?.index ?? -1;
      return offset < 0 ? undefined : values[(where.slice(0, offset).match(/\?/g) || []).length];
    };
    return rows.filter(row => {
      for (const column of ["id", "ledger_id", "order_id", "user_id", "asset_code", "joint_segment_id"]) {
        const value = valueFor(`${column} = ?`);
        if (value !== undefined && row[column] !== value) return false;
      }
      const exactTag = valueFor("tag_name = ?");
      const likeTag = valueFor("tag_name LIKE ?");
      if (exactTag !== undefined && row.tag_name !== exactTag && !(likeTag && new RegExp("^" + String(likeTag).replace(/[%]/g, ".*") + "$", "u").test(row.tag_name))) return false;
      if (where.includes("status = 'active'") && row.status !== "active") return false;
      if (where.includes("amount >") && units(row.amount) <= units(row.released_amount ?? "0")) return false;
      if (where.includes("asset_code IN ('CNY', 'USDT')") && !["CNY", "USDT"].includes(row.asset_code)) return false;
      return true;
    });
  }
}
const input = { orderId: 4860, userId: 18, actorUserId: 99, reason: "order_settled" };
const release = (h: OfflineWallet, kind: "funding" | "market", params: Record<string, any> = {}) => kind === "funding"
  ? h.api.releaseLedger52FundingCollateralHoldsForOrder({ ...input, ...params })
  : h.market.releaseWalletCollateralLocksForOrder({ ledgerId: 52, ...input, ...params });

describe("52 individual collateral release: production functions against offline SQL", () => {
  it.each(["USDT", "CNY"])("小胖18/Ocean18 same-order %s isolation; other-order10, other ledger and principal unchanged", async asset => {
    const h = new OfflineWallet(); h.holds.forEach(row => { row.asset_code = asset; });
    h.holds.push(fundingHold(4, 18, "10", asset, 4860, "__primary__", 37),
      { ...fundingHold(5, 18, "10", asset), tag_name: "52号谷底征筹订单 #4860 本金" }, fundingHold(6, 18, "10", asset, 48600));
    const excluded = structuredClone(h.holds.slice(1)); const users = structuredClone(h.users);
    const before = h.fundingSummary(18, asset);
    expect(await release(h, "funding")).toEqual({ releasedCount: 1 });
    expect(h.holds[0].status).toBe("released"); expect(h.holds.slice(1)).toEqual(excluded); expect(h.users).toEqual(users);
    const after = h.fundingSummary(18, asset);
    expect(after.total).toBe(before.total); expect(units(after.available) - units(before.available)).toBe(units("18"));
    expect(units(before.frozen) - units(after.frozen)).toBe(units("18"));
    expect(h.releases).toEqual([{ holdId: 1, amount: "18", kind: "release", status: "active" }]);
    expect(h.entries).toHaveLength(0);
    const firstHold = h.trace.findIndex(t => t.sql.includes("project_holds") && t.sql.includes("FOR UPDATE"));
    expect(h.trace.slice(0, firstHold).filter(t => t.sql.includes("FROM users")).map(t => t.values[0])).toEqual([18]);
    expect(h.trace.filter(t => t.sql.includes("project_holds") && t.sql.includes("tag_name"))[0].values.at(-1)).toBe(18);
  });
  it("ETH 小胖18/Ocean18 isolation; other-order10 and ledger unchanged, immutable collateral_release and total conserved", async () => {
    const h = new OfflineWallet(); h.locks.push(marketLock(4, 18, "10", 4860, "__primary__", 37));
    const excluded = structuredClone(h.locks.slice(1)); const ocean = structuredClone(h.balances[1]);
    expect(await release(h, "market")).toEqual({ releasedCount: 1 });
    expect(h.locks.slice(1)).toEqual(excluded); expect(h.balances[1]).toEqual(ocean);
    expect(h.balances[0]).toMatchObject({ available_balance: "90", frozen_balance: "10" });
    expect(units(h.balances[0].available_balance) + units(h.balances[0].frozen_balance)).toBe(units("100"));
    expect(h.entries).toHaveLength(1); expect(h.entries[0]).toMatchObject({ user: 18, asset: "ETH", amount: "18", event: "collateral_release", ledger: 52, availableAfter: "90" });
    expect(h.trace[0].sql).toContain("FROM users"); expect(h.trace[1].sql).toContain("AND user_id = ?");
  });
  it.each(["funding", "market"] as const)("%s exact segment/user intersection; omitted segment releases only target user's remaining segments", async kind => {
    const h = new OfflineWallet();
    const records = kind === "funding" ? h.holds : h.locks;
    records.push(kind === "funding" ? fundingHold(4, 18, "2", "USDT", 4860, "s_1") : marketLock(4, 18, "2", 4860, "s_1"));
    records.push(kind === "funding" ? fundingHold(5, 28, "2", "USDT", 4860, "s_1") : marketLock(5, 28, "2", 4860, "s_1"));
    if (kind === "market") h.balances.forEach(row => { row.frozen_balance = decimal(units(row.frozen_balance) + units("2")); });
    expect(await release(h, kind, { jointSegmentId: "s_1" })).toEqual({ releasedCount: 1 });
    expect(records[0].status).toBe("active"); expect(records[3].status).toBe("released"); expect(records[4].status).toBe("active");
    expect(await release(h, kind)).toEqual({ releasedCount: 1 }); expect(records[0].status).toBe("released"); expect(records[1].status).toBe("active");
  });
  it.each(["funding", "market"] as const)("%s primary sentinel does not release another joint segment", async kind => {
    const h = new OfflineWallet(); const records = kind === "funding" ? h.holds : h.locks;
    records.push(kind === "funding" ? fundingHold(4, 18, "2", "USDT", 4860, "s2") : marketLock(4, 18, "2", 4860, "s2"));
    expect(await release(h, kind, { jointSegmentId: "__primary__" })).toEqual({ releasedCount: 1 }); expect(records[3].status).toBe("active");
  });
  it.each(["funding", "market"] as const)("%s repeated release is idempotent with no second entry or balance change", async kind => {
    const h = new OfflineWallet(); await release(h, kind); const after = h.state();
    expect(await release(h, kind)).toEqual({ releasedCount: 0 }); expect(h.state()).toEqual(after);
  });
  it.each(["funding", "market"] as const)("%s omitted user preserves all-user whole-order contract", async kind => {
    const h = new OfflineWallet(); expect(await release(h, kind, { userId: undefined })).toEqual({ releasedCount: 2 });
    expect((kind === "funding" ? h.holds : h.locks).map(row => row.status)).toEqual(["released", "released", "active"]);
  });
  it("funding exact remaining DECIMAL releases a partially released hold without floating-point rounding", async () => {
    const h = new OfflineWallet(); h.holds[0].amount = "18.123456789012345678"; h.holds[0].released_amount = "0.100000000000000001";
    expect(await release(h, "funding")).toEqual({ releasedCount: 1 });
    expect(h.releases[0].amount).toBe("18.023456789012345677"); expect(h.holds[0].released_amount).toBe("18.123456789012345678");
  });
  it("funding exact release preserves the smallest valid remaining quantity", async () => {
    const h = new OfflineWallet(); h.holds[0].amount = "18.000000000000000001"; h.holds[0].released_amount = "18";
    expect(await release(h, "funding")).toEqual({ releasedCount: 1 }); expect(h.releases[0].amount).toBe("0.000000000000000001");
  });
  it.each(["funding", "market"] as const)("%s own transaction rolls back on immutable audit insertion error", async kind => {
    const h = new OfflineWallet(); const before = h.state(); h.fail = kind === "funding" ? "releaseAudit" : "entry";
    await expect(release(h, kind)).rejects.toThrow("failure"); expect(h.state()).toEqual(before); expect(h.rollbacks).toBe(1); expect(h.commits).toBe(0);
  });
  it.each(["funding", "market"] as const)("%s CAS affectedRows=0 rolls back balance, release audit and status", async kind => {
    const h = new OfflineWallet(); const before = h.state(); h.fail = kind === "funding" ? "fundingCas" : "marketCas";
    await expect(release(h, kind)).rejects.toThrow("状态已变化"); expect(h.state()).toEqual(before); expect(h.rollbacks).toBe(1); expect(h.commits).toBe(0);
  });
  it("ETH rejects frozen insufficiency without changing status, available or audit", async () => {
    const h = new OfflineWallet(); h.balances[0].frozen_balance = "17"; const before = h.state();
    await expect(release(h, "market")).rejects.toThrow("冻结余额异常"); expect(h.state()).toEqual(before);
  });
  it.each(["funding", "market"] as const)("%s external transaction success never begins, commits, rolls back or releases connection", async kind => {
    const h = new OfflineWallet(); const tx = h.transaction();
    expect(await release(h, kind, { transaction: tx })).toEqual({ releasedCount: 1 });
    expect([h.begins, h.commits, h.rollbacks, h.releasesOfConnection, h.connections]).toEqual([0, 0, 0, 0, 0]);
  });
  it.each(["funding", "market"] as const)("%s external transaction failure propagates; caller rollback restores all state", async kind => {
    const h = new OfflineWallet(); const before = h.state(); const tx = h.transaction(); await tx.beginTransaction();
    h.fail = kind === "funding" ? "fundingCas" : "marketCas";
    await expect(release(h, kind, { transaction: tx })).rejects.toThrow("状态已变化");
    expect(h.rollbacks).toBe(0); expect(h.commits).toBe(0); expect(h.releasesOfConnection).toBe(0);
    await tx.rollback(); expect(h.state()).toEqual(before);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, "18"])("invalid userId %s fails before infrastructure or SQL in all three helpers", async userId => {
    const h = new OfflineWallet();
    await expect(release(h, "funding", { userId })).rejects.toThrow("钱包用户无效");
    await expect(release(h, "market", { userId })).rejects.toThrow("钱包用户无效");
    await expect(h.api.lockLedger52FundingCollateralUsersForOrder(h.transaction(), 4860, userId)).rejects.toThrow("钱包用户无效");
    expect(h.trace).toHaveLength(0); expect(h.infrastructureCalls).toBe(0); expect(h.connections).toBe(0);
  });
  it("ETH-only target is prelocked even when no funding holds exist; funding and market share caller transaction", async () => {
    const h = new OfflineWallet(); h.holds = []; const tx = h.transaction();
    const prelockedUserIds = await h.api.lockLedger52FundingCollateralUsersForOrder(tx, 4860, 18);
    expect(prelockedUserIds).toEqual([18]);
    expect(await release(h, "funding", { transaction: tx, prelockedUserIds })).toEqual({ releasedCount: 0 });
    expect(await release(h, "market", { transaction: tx })).toEqual({ releasedCount: 1 });
    expect(h.trace[1]).toMatchObject({ values: [18] }); expect(h.trace[1].sql).toContain("FOR UPDATE");
  });
  it("individual multi-segment funding+ETH caller prelocks once before ANY hold or asset locks", async () => {
    const h = new OfflineWallet(); const tx = h.transaction();
    h.holds.push(fundingHold(4, 18, "2", "CNY", 4860, "s1")); h.locks.push(marketLock(4, 18, "2", 4860, "s1"));
    h.balances[0].frozen_balance = "30";
    const prelockedUserIds = await h.api.lockLedger52FundingCollateralUsersForOrder(tx, 4860, 18);
    for (const jointSegmentId of ["__primary__", "s1"]) {
      await release(h, "funding", { jointSegmentId, transaction: tx, prelockedUserIds });
      await release(h, "market", { jointSegmentId, transaction: tx });
    }
    expect(h.releases).toHaveLength(2); expect(h.entries).toHaveLength(2); expect(h.holds[1].status).toBe("active");
  });
  it("prelock all users remains ascending before any hold and can precede mixed-user funding+market release", async () => {
    const h = new OfflineWallet(); h.holds.reverse(); const tx = h.transaction();
    const prelockedUserIds = await h.api.lockLedger52FundingCollateralUsersForOrder(tx, 4860);
    expect(h.trace.filter(t => t.sql.includes("FROM users")).map(t => t.values[0])).toEqual([18, 28]);
    await release(h, "funding", { userId: undefined, transaction: tx, prelockedUserIds });
    await release(h, "market", { userId: undefined, transaction: tx }); expect(h.releases).toHaveLength(2); expect(h.entries).toHaveLength(2);
  });
  it("funding prelockedUserIds rejects unexpected owner before attempting any new user lock", async () => {
    const h = new OfflineWallet();
    await expect(release(h, "funding", { transaction: h.transaction(), prelockedUserIds: [28] })).rejects.toThrow("归属已变化");
    expect(h.trace.some(t => t.sql.includes("FROM users"))).toBe(false); expect(h.releases).toHaveLength(0);
  });
  it.each(["new owner", "changed asset"])("funding current-read %s recheck fails closed before release audit", async change => {
    const h = new OfflineWallet();
    h.beforeCurrentHold = () => { if (change === "new owner") h.holds.push(fundingHold(9, 18)); else h.holds[0].asset_code = "CNY"; };
    await expect(release(h, "funding")).rejects.toThrow("归属已变化"); expect(h.releases).toHaveLength(0);
  });
  it.each(["funding", "market"] as const)("%s empty filtered scope is a safe no-op", async kind => {
    const h = new OfflineWallet(); const before = h.state(); expect(await release(h, kind, { jointSegmentId: "missing" })).toEqual({ releasedCount: 0 }); expect(h.state()).toEqual(before);
  });
  it("market rejects absent target user before any collateral/asset lock", async () => {
    const h = new OfflineWallet(); await expect(release(h, "market", { userId: 999 })).rejects.toThrow("钱包用户不存在");
    expect(h.trace).toHaveLength(1); expect(h.trace[0].sql).toContain("FROM users");
  });
  it.each(["funding", "market"] as const)("%s actual CAS predicates detect changed source state and restore everything", async kind => {
    const h = new OfflineWallet(); const before = h.state();
    if (kind === "market") h.beforeBalanceUpdate = () => { h.locks[0].amount = "19"; };
    else {
      const original = h.transaction.bind(h);
      h.transaction = () => {
        const tx = original(); const execute = tx.execute;
        tx.execute = async (sql, values) => {
          const result = await execute(sql, values);
          if (sql.trim().startsWith("INSERT INTO ai_wallet_project_hold_releases")) h.holds[0].released_amount = "1";
          return result;
        };
        return tx;
      };
    }
    await expect(release(h, kind)).rejects.toThrow("状态已变化"); expect(h.state()).toEqual(before);
  });
});
