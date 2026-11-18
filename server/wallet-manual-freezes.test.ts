import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

const dbMocks = vi.hoisted(() => ({ getDbConnection: vi.fn(), getDbTransactionConnection: vi.fn() }));
vi.mock("./db", () => dbMocks);
vi.mock("./ledger37-wallet", () => ({ ensureLedger37WalletInfrastructure: vi.fn() }));
// Real production manual, global funding guard AND multi-asset movement functions run against
// this isolated SQL adapter. No production DB/scanner module is imported; clock is deterministic.
import { AI_WALLET_ASSETS } from "../shared/ai-wallet-assets";
import { assertGlobalWalletDebit, fundingUnits, withGlobalWalletTransaction } from "./wallet-funding-guard";
import {
  freezeWalletManually, releaseWalletManually, getWalletManualFreezeState,
  listWalletManualFundingFreezeEvents, normalizeWalletManualAmount,
} from "./db-wallet-manual-freezes";

const text = (units: bigint) => {
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const fraction = (abs % (10n ** 18n)).toString().padStart(18, "0").replace(/0+$/, "");
  return `${sign}${abs / (10n ** 18n)}${fraction ? `.${fraction}` : ""}`;
};
type Book = { users: Record<number, any>; manual: any[]; holds: any[]; freezes: any[]; actions: any[]; balances: any[]; entries: any[] };
class ManualHarness {
  book: Book = { users: { 1: { id: 1, balance: "100", cny_balance: "100" }, 2: { id: 2, balance: "100", cny_balance: "100" } }, manual: [], holds: [], freezes: [], actions: [], balances: [], entries: [] };
  trace: string[] = [];
  failAction = false;
  failManualUpdate = false;
  missingTable = false;
  connectionFailure = false;
  private queue = Promise.resolve();
  private signalUserLock!: () => void;
  firstUserLock = new Promise<void>(resolve => { this.signalUserLock = resolve; });
  constructor() {
    for (const asset of AI_WALLET_ASSETS.filter(a => a !== "CNY" && a !== "USDT")) {
      this.book.balances.push({ id: this.book.balances.length + 1, user_id: 1, asset_code: asset, available_balance: "100", frozen_balance: "0" });
    }
    dbMocks.getDbConnection.mockImplementation(async () => this.connectionFailure ? null : { execute: (sql: string, values: any[] = []) => this.execute(this.book, sql, values) });
    dbMocks.getDbTransactionConnection.mockImplementation(async () => this.connectionFailure ? null : this.connection());
  }
  connection() {
    let stage: Book | undefined;
    let unlock: (() => void) | undefined;
    const conn = {
      beginTransaction: async () => { this.trace.push("begin"); },
      commit: async () => { this.book = structuredClone(stage!); this.trace.push("commit"); unlock?.(); unlock = undefined; },
      rollback: async () => { this.trace.push("rollback"); unlock?.(); unlock = undefined; },
      release: () => { this.trace.push("release"); unlock?.(); unlock = undefined; },
      execute: async (sql: string, values: any[] = []) => {
        if (sql.includes("FROM users") && sql.includes("FOR UPDATE") && !stage) {
          const previous = this.queue;
          this.queue = new Promise<void>(resolve => { unlock = resolve; });
          await previous;
          stage = structuredClone(this.book);
          this.signalUserLock();
        }
        if (!stage) throw new Error("Transaction SQL ran before user row lock: " + sql);
        return this.execute(stage, sql, values);
      },
    };
    return conn;
  }
  async execute(book: Book, rawSql: string, v: any[]) {
    const sql = rawSql.replace(/\s+/g, " ").trim();
    this.trace.push(sql);
    if (sql.startsWith("CREATE TABLE") || sql.startsWith("ALTER TABLE")) return [{}];
    if (sql.includes("information_schema.columns")) return [[{ column_name: "frozen_balance" }, { column_name: "ledger_id" }, { column_name: "joint_segment_id" }]];
    if (this.missingTable && sql.includes("ai_wallet_manual_")) throw Object.assign(new Error("missing schema"), { code: "ER_NO_SUCH_TABLE" });
    if (sql.includes("AS cny_available")) {
      const user = book.users[v.at(-1)];
      if (!user) return [[]];
      const available = (asset: "CNY" | "USDT") => {
        const manual = book.manual.filter(row => row.user_id === user.id && (asset === "CNY" ? String(row.note || "").startsWith("[CNY]") : !String(row.note || "").startsWith("[CNY]") && !String(row.note || "").startsWith("[BALANCE_BASE]")))
          .reduce((sum, row) => sum + fundingUnits(row.amount), 0n);
        const holds = book.holds.filter(row => row.user_id === user.id && row.asset_code === asset && row.status === "active")
          .reduce((sum, row) => sum + fundingUnits(row.amount) - fundingUnits(row.released_amount ?? "0"), 0n);
        return text(fundingUnits(asset === "CNY" ? user.cny_balance : user.balance) + manual - holds);
      };
      return [[{ cny_available: available("CNY"), usdt_available: available("USDT"), invalid_holds: 0 }]];
    }
    if (sql.startsWith("SELECT asset_code, CAST(available_balance")) return [book.balances.filter(row => row.user_id === v[0])];
    if (sql.includes("FROM users")) return [book.users[v[0]] ? [book.users[v[0]]] : []];
    if (sql.startsWith("SELECT amount FROM af_manual_balances")) {
      const cny = !sql.includes("NOT LIKE '[CNY]%'");
      return [book.manual.filter(row => row.user_id === v[0] && (cny ? row.note.startsWith("[CNY]") : !row.note.startsWith("[CNY]") && !row.note.startsWith("[BALANCE_BASE]")))];
    }
    if (sql.startsWith("SELECT amount, COALESCE(released_amount")) return [book.holds.filter(row => row.user_id === v[0] && row.asset_code === v[1] && row.status === "active")];
    if (sql.startsWith("INSERT INTO ai_wallet_project_holds")) {
      const row = { id: book.holds.length + 1, hold_no: v[0], request_id: v[1], ledger_id: 52, user_id: v[2], tag_name: v[3], asset_code: v[4], amount: v[5], created_by: v[6], status: "active", released_amount: "0" };
      book.holds.push(row); return [{ insertId: row.id }];
    }
    if (sql.startsWith("INSERT INTO ai_wallet_manual_freezes")) {
      const row = { id: book.freezes.length + 1, ledger_id: 52, user_id: v[0], source: "manual", freeze_no: v[1], asset_code: v[2], amount: v[3], funding_hold_id: v[4], note: v[5], created_by: v[6], status: "active", released_amount: "0", created_at: "2026-11-18 08:00:00" };
      book.freezes.push(row); return [{ insertId: row.id }];
    }
    if (sql.startsWith("SELECT * FROM ai_wallet_manual_freezes")) return [book.freezes.filter(row => row.ledger_id === 52 && row.user_id === v[0] && row.source === "manual" && (v.length === 1 || row.id === v[1]))];
    if (sql.includes("FROM ai_wallet_manual_freeze_actions")) {
      return [book.actions.filter(row => sql.includes("request_id = ?") ? row.request_id === v[0] : row.ledger_id === 52 && row.source === "manual" && row.user_id === v[0] && (!sql.includes("asset_code IN") || ["CNY", "USDT"].includes(row.asset_code)))];
    }
    if (sql.startsWith("INSERT INTO ai_wallet_manual_freeze_actions")) {
      if (this.failAction) throw new Error("audit failed");
      if (book.actions.some(row => row.request_id === v[2])) throw Object.assign(new Error("duplicate request"), { code: "ER_DUP_ENTRY" });
      const row = { id: book.actions.length + 1, freeze_id: v[0], ledger_id: 52, user_id: v[1], source: "manual", request_id: v[2], payload_hash: v[3], asset_code: v[4], direction: v[5], amount: v[6], note: v[7], actor_user_id: v[8], result_json: v[9], created_at: "2026-11-18 08:00:00" };
      book.actions.push(row); return [{ insertId: row.id }];
    }
    if (sql.startsWith("SELECT * FROM ai_wallet_project_holds")) return [book.holds.filter(row => row.id === v[0] && row.ledger_id === 52 && row.user_id === v[1] && row.tag_name === v[2] && row.hold_no === v[3] && row.request_id === v[4] && row.asset_code === v[5] && row.created_by === v[6])];
    if (sql.startsWith("UPDATE ai_wallet_project_holds")) {
      // Validate the ACTUAL production SQL contains the identity and exact amount guards.
      expect(sql).toContain("ledger_id = 52 AND user_id = ? AND tag_name = ? AND hold_no = ? AND request_id = ?");
      expect(sql).toContain("released_amount + CAST(? AS DECIMAL(36,18)) <= amount");
      const row = book.holds.find(row => row.id === v[4] && row.ledger_id === 52 && row.user_id === v[5] && row.tag_name === v[6] && row.hold_no === v[7] && row.request_id === v[8] && row.asset_code === v[9]);
      if (!row || row.status !== "active" || fundingUnits(row.released_amount) + fundingUnits(v[10]) > fundingUnits(row.amount)) return [{ affectedRows: 0 }];
      row.released_amount = text(fundingUnits(row.released_amount) + fundingUnits(v[0]));
      row.status = fundingUnits(row.amount) === fundingUnits(row.released_amount) ? "released" : "active";
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE ai_wallet_manual_freezes")) {
      expect(sql).toContain("ledger_id = 52 AND user_id = ? AND source = 'manual' AND status = 'active'");
      expect(sql).toContain("released_amount + CAST(? AS DECIMAL(36,18)) <= amount");
      const row = book.freezes.find(row => row.id === v[2] && row.ledger_id === 52 && row.user_id === v[3] && row.source === "manual");
      if (this.failManualUpdate || !row || row.status !== "active" || fundingUnits(row.released_amount) + fundingUnits(v[4]) > fundingUnits(row.amount)) return [{ affectedRows: 0 }];
      row.released_amount = text(fundingUnits(row.released_amount) + fundingUnits(v[0]));
      row.status = fundingUnits(row.amount) === fundingUnits(row.released_amount) ? "released" : "active";
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("INSERT INTO ai_wallet_asset_balances")) return [{}];
    if (sql.startsWith("SELECT id, available_balance")) return [book.balances.filter(row => row.user_id === v[0] && row.asset_code === v[1])];
    if (sql.startsWith("SELECT asset_code, amount, balance_after")) return [book.entries.filter(row => row.user_id === v[0] && row.request_id === v[1])];
    if (sql.startsWith("UPDATE ai_wallet_asset_balances")) {
      const freeze = sql.includes("AND available_balance >= CAST(? AS DECIMAL(36,18))");
      if (!freeze) expect(sql).toContain("AND frozen_balance >= CAST(? AS DECIMAL(36,18))");
      const row = book.balances.find(row => row.user_id === v[2] && row.asset_code === v[3]);
      const amount = fundingUnits(v[0]);
      if (!row || fundingUnits(freeze ? row.available_balance : row.frozen_balance) < fundingUnits(v[4])) return [{ affectedRows: 0 }];
      row.available_balance = text(fundingUnits(row.available_balance) + (freeze ? -amount : amount));
      row.frozen_balance = text(fundingUnits(row.frozen_balance) + (freeze ? amount : -amount));
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("INSERT INTO ai_wallet_asset_entries")) {
      const row = { id: book.entries.length + 1, entry_no: v[0], request_id: v[1], user_id: v[2], asset_code: v[3], amount: v[4], balance_after: v[5], event_type: v[6], note: v[7], source_ledger_id: v[8], actor_user_id: v[9] };
      book.entries.push(row); return [{ insertId: row.id }];
    }
    throw new Error("Unexpected isolated SQL: " + sql);
  }
}
const freezeInput = (assetCode: (typeof AI_WALLET_ASSETS)[number] = "USDT", amount = "10", requestId = "freeze_request_000001") => ({ ledgerId: 52 as const, userId: 1, assetCode, amount, requestId, actorUserId: 99 });
const releaseInput = (freezeId: number, amount = "10", requestId = "release_request_00001") => ({ ledgerId: 52 as const, userId: 1, freezeId, amount, requestId, actorUserId: 99 });
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-18T08:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("manual freeze exact decimal validation", () => {
  it.each(["CNY", "USDT"] as const)("enforces funding precision for %s", asset => {
    expect(normalizeWalletManualAmount(asset, "0.00000001")).toBe("0.00000001");
    expect(() => normalizeWalletManualAmount(asset, "0.000000001")).toThrow("8位");
  });
  it.each(AI_WALLET_ASSETS.filter(a => a !== "CNY" && a !== "USDT"))("accepts 18-place independent %s", asset => {
    expect(normalizeWalletManualAmount(asset, "0.000000000000000001")).toBe("0.000000000000000001");
  });
  it.each(["-0", "-0.00", "0", "0.000", "-1", "1e-8", "+1", "NaN", "Infinity", "01", ".1", "1.", " 1 ", "1.0000000000000000001", "1000000000000000000"])("rejects %s", amount => {
    expect(() => normalizeWalletManualAmount("BTC", amount)).toThrow();
  });
  it("validates identity, request and notes before transaction", async () => {
    const h = new ManualHarness();
    for (const change of [{ userId: 0 }, { userId: 1.5 }, { ledgerId: 37 }, { ledgerId: 53 }, { actorUserId: 0 }, { assetCode: "FAKE" }, { requestId: "short" }, { note: "x".repeat(501) }]) {
      await expect(freezeWalletManually({ ...freezeInput(), ...change } as any)).rejects.toThrow();
    }
    expect(h.trace).toEqual([]);
  });
});

describe("manual freezes use real funding and multi-asset primitives", () => {
  it.each(AI_WALLET_ASSETS)("freezes and partially/fully releases %s without price or changing total", async asset => {
    const h = new ManualHarness();
    const result = await freezeWalletManually({ ...freezeInput(asset), note: "冻结审计" });
    expect(result.item.remainingAmount).toBe("10");
    expect(h.book.users[1].balance).toBe("100");
    expect(h.book.users[1].cny_balance).toBe("100");
    expect(h.book.manual).toEqual([]);
    if (asset === "CNY" || asset === "USDT") {
      expect(h.book.holds[0].tag_name).toMatch(/^AIW_MANUAL_FREEZE:/);
      expect(h.book.freezes[0].funding_hold_id).toBe(h.book.holds[0].id);
      await expect(withGlobalWalletTransaction(1, tx => assertGlobalWalletDebit(tx, 1, asset, "90.00000001"))).rejects.toThrow("可用余额不足");
    } else {
      const balance = h.book.balances.find(row => row.asset_code === asset)!;
      expect([balance.available_balance, balance.frozen_balance]).toEqual(["90", "10"]);
      expect(h.book.entries[0].event_type).toBe("collateral_lock");
      expect(h.book.entries[0].note).toMatch(/^手动冻结/);
    }
    const partial = await releaseWalletManually({ ...releaseInput(result.item.id, "3"), note: "部分解除" });
    expect(partial.item.remainingAmount).toBe("7");
    expect(partial.item.status).toBe("active");
    expect(partial.item.note).toBe("冻结审计");
    const full = await releaseWalletManually(releaseInput(result.item.id, "7", "release_request_00002"));
    expect(full.item.remainingAmount).toBe("0");
    expect(full.item.status).toBe("released");
    const state = await getWalletManualFreezeState({ ledgerId: 52, userId: 1 });
    expect(state.orderProtected).toBe(true);
    expect(state.events.map(event => event.note)).toEqual(["冻结审计", "部分解除", ""]);
    expect(state.events.every(event => event.actorUserId === 99 && event.createdAt)).toBe(true);
    if (asset !== "CNY" && asset !== "USDT") {
      const balance = h.book.balances.find(row => row.asset_code === asset)!;
      expect([balance.available_balance, balance.frozen_balance]).toEqual(["100", "0"]);
      expect(h.book.entries.map(row => row.event_type)).toEqual(["collateral_lock", "collateral_release", "collateral_release"]);
    }
    expect(h.trace.filter(sql => /price|af_orders|ledger_orders|UPDATE users/.test(sql))).toEqual([]);
    expect(h.trace.at(-1)).not.toContain("CREATE");
  });
  it.each(["CNY", "USDT", "BTC", "BTY", "MSTR"] as const)("fails closed for insufficient %s", async asset => {
    const h = new ManualHarness();
    await expect(freezeWalletManually(freezeInput(asset, "100.00000001"))).rejects.toThrow("可用余额不足");
    expect(h.book.freezes).toEqual([]); expect(h.book.actions).toEqual([]); expect(h.book.holds).toEqual([]);
    expect(h.trace).toContain("rollback"); expect(h.trace.at(-1)).toBe("release");
  });
  it("counts existing37 and52 order holds, manual adjustments and sub-8 amounts exactly", async () => {
    const h = new ManualHarness();
    h.book.manual.push({ user_id: 1, amount: "10", note: "credit" }, { user_id: 1, amount: "999", note: "[CNY]credit" }, { user_id: 1, amount: "999", note: "[BALANCE_BASE]mirror" });
    h.book.holds.push({ id: 1, ledger_id: 37, user_id: 1, asset_code: "USDT", amount: "50", released_amount: "0", status: "active" }, { id: 2, ledger_id: 52, user_id: 1, asset_code: "USDT", amount: "59.999999990000000001", released_amount: "0", status: "active" });
    await expect(freezeWalletManually(freezeInput("USDT", "0.00000001"))).rejects.toThrow("可用余额不足");
    expect(h.book.holds).toHaveLength(2);
  });
  it("handles smallest independent quantum through full release", async () => {
    const h = new ManualHarness();
    const result = await freezeWalletManually(freezeInput("BTC", "0.000000000000000001"));
    await expect(releaseWalletManually(releaseInput(result.item.id, "0.000000000000000002"))).rejects.toThrow("剩余金额");
    const release = await releaseWalletManually(releaseInput(result.item.id, "0.000000000000000001"));
    expect(release.item.status).toBe("released");
    expect(h.book.balances[0].available_balance).toBe("100");
  });
  it("rejects nonexistent users, releases connection on user lock failure", async () => {
    const h = new ManualHarness();
    await expect(freezeWalletManually({ ...freezeInput(), userId: 999 })).rejects.toThrow("用户不存在");
    expect(h.trace).toContain("rollback"); expect(h.trace.at(-1)).toBe("release");
  });
});

describe("manual idempotency, isolation and atomicity", () => {
  it.each(["USDT", "BTC"] as const)("serializes concurrent %s requests and prevents overfreeze", async asset => {
    const h = new ManualHarness();
    const results = await Promise.allSettled([freezeWalletManually(freezeInput(asset, "70", "concurrent_freeze_001")), freezeWalletManually(freezeInput(asset, "70", "concurrent_freeze_002"))]);
    expect(results.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(h.book.freezes).toHaveLength(1); expect(h.book.actions).toHaveLength(1);
    expect(h.trace.filter(sql => sql === "release")).toHaveLength(2);
  });
  it.each(["CNY", "BTC"] as const)("replays same concurrent %s request exactly once", async asset => {
    const h = new ManualHarness();
    const results = await Promise.all([freezeWalletManually(freezeInput(asset)), freezeWalletManually(freezeInput(asset))]);
    expect(results.map(result => result.alreadyCompleted).sort()).toEqual([false, true]);
    expect(results[0].item).toEqual(results[1].item); expect(h.book.freezes).toHaveLength(1);
    const release = releaseInput(results[0].item.id, "4");
    const releases = await Promise.all([releaseWalletManually(release), releaseWalletManually(release)]);
    expect(releases.map(result => result.alreadyCompleted).sort()).toEqual([false, true]);
    expect(h.book.freezes[0].released_amount).toBe("4");
    expect(h.book.actions).toHaveLength(2);
  });
  it.each(["USDT", "ETH"] as const)("concurrent partial releases cannot overrelease %s", async asset => {
    const h = new ManualHarness();
    const { item } = await freezeWalletManually(freezeInput(asset));
    const results = await Promise.allSettled([releaseWalletManually(releaseInput(item.id, "7", "concurrent_release_001")), releaseWalletManually(releaseInput(item.id, "7", "concurrent_release_002"))]);
    expect(results.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(h.book.freezes[0].released_amount).toBe("7");
  });
  it("rejects changed request payload (user, asset, amount, note, actor, direction, freezeId, ledger)", async () => {
    const h = new ManualHarness();
    const first = await freezeWalletManually(freezeInput());
    for (const change of [{ userId: 2 }, { assetCode: "CNY" }, { amount: "11" }, { note: "changed" }, { actorUserId: 100 }]) {
      await expect(freezeWalletManually({ ...freezeInput(), ...change } as any)).rejects.toThrow("不同资金操作");
    }
    await expect(releaseWalletManually(releaseInput(first.item.id, "1", freezeInput().requestId))).rejects.toThrow("不同资金操作");
    const second = await freezeWalletManually(freezeInput("USDT", "5", "second_freeze_request"));
    await releaseWalletManually(releaseInput(first.item.id, "1"));
    await expect(releaseWalletManually(releaseInput(second.item.id, "1"))).rejects.toThrow("不同资金操作");
    await expect(freezeWalletManually({ ...freezeInput(), ledgerId: 37 } as any)).rejects.toThrow("52号");
    expect(h.book.actions).toHaveLength(3);
  });
  it("treats canonical trailing zeros as same amount but does not ignore remark", async () => {
    new ManualHarness();
    await freezeWalletManually(freezeInput("USDT", "10.00000000"));
    expect((await freezeWalletManually(freezeInput("USDT", "10"))).alreadyCompleted).toBe(true);
  });
  it.each(["source", "ledger_id", "user_id"])("rejects manual record with wrong %s", async field => {
    const h = new ManualHarness(); const { item } = await freezeWalletManually(freezeInput());
    h.book.freezes[0][field] = field === "source" ? "order" : field === "ledger_id" ? 37 : 2;
    await expect(releaseWalletManually(releaseInput(item.id))).rejects.toThrow("原订单/项目");
    expect(h.book.holds[0].released_amount).toBe("0");
  });
  it.each(["ledger_id", "user_id", "asset_code", "tag_name", "hold_no", "request_id", "created_by", "amount", "released_amount", "status"])("verifies underlying funding hold %s", async field => {
    const h = new ManualHarness(); const { item } = await freezeWalletManually(freezeInput());
    h.book.holds[0][field] = ["amount", "released_amount"].includes(field) ? "2" : ["ledger_id", "user_id", "created_by"].includes(field) ? 37 : "order";
    await expect(releaseWalletManually(releaseInput(item.id))).rejects.toThrow("禁止释放订单或项目冻结");
    expect(h.book.freezes[0].released_amount).toBe("0");
  });
  it("cannot release37 or52 order freeze by supplying its holdId as manualfreeze id", async () => {
    const h = new ManualHarness();
    h.book.holds.push({ id: 99, ledger_id: 52, user_id: 1, asset_code: "USDT", amount: "10", released_amount: "0", status: "active", tag_name: "52号融资订单 #99 钱包担保" });
    await expect(releaseWalletManually(releaseInput(99))).rejects.toThrow("原订单/项目");
    expect(h.book.holds[0].released_amount).toBe("0");
  });
  it.each(["USDT", "BTC"] as const)("rolls back %s freeze and release if audit insert fails", async asset => {
    const h = new ManualHarness(); h.failAction = true;
    await expect(freezeWalletManually(freezeInput(asset))).rejects.toThrow("audit failed");
    expect(h.book.freezes).toEqual([]); expect(h.book.holds).toEqual([]); expect(h.book.entries).toEqual([]);
    h.failAction = false;
    const { item } = await freezeWalletManually(freezeInput(asset));
    const original = structuredClone(h.book); h.failAction = true;
    await expect(releaseWalletManually(releaseInput(item.id, "4"))).rejects.toThrow("audit failed");
    expect(h.book).toEqual(original); expect(h.trace.at(-1)).toBe("release");
  });
  it.each(["CNY", "BTY"] as const)("rolls back %s underlying release when manual SQL guard returns zero", async asset => {
    const h = new ManualHarness(); const { item } = await freezeWalletManually(freezeInput(asset));
    const original = structuredClone(h.book); h.failManualUpdate = true;
    await expect(releaseWalletManually(releaseInput(item.id, "4"))).rejects.toThrow("剩余额更新失败");
    expect(h.book).toEqual(original); expect(h.trace.at(-1)).toBe("release");
  });
  it("uses user row as first transaction operation and no transaction DDL", async () => {
    const h = new ManualHarness(); await freezeWalletManually(freezeInput("BTC"));
    const begin = h.trace.indexOf("begin");
    expect(h.trace[begin + 1]).toMatch(/FROM users .*FOR UPDATE$/);
    expect(h.trace.slice(begin + 1).filter(sql => /^(CREATE|ALTER)/.test(sql))).toEqual([]);
    const userLock = begin + 1;
    const balanceLock = h.trace.findIndex(sql => sql.includes("FROM ai_wallet_asset_balances") && sql.includes("FOR UPDATE"));
    expect(balanceLock).toBeGreaterThan(userLock);
  });
});

describe("read-only state and native funding events", () => {
  it("only reads own manual rows and returns actor/time/release note audit", async () => {
    const h = new ManualHarness(); const { item } = await freezeWalletManually({ ...freezeInput(), note: "a".repeat(500) });
    await releaseWalletManually({ ...releaseInput(item.id, "1"), note: "释放备注" });
    h.trace = [];
    const state = await getWalletManualFreezeState({ ledgerId: 52, userId: 1 });
    expect(state.events[0].note).toHaveLength(500);
    expect(state.events[1].note).toBe("释放备注");
    const events = await listWalletManualFundingFreezeEvents(1);
    expect(events.map(event => [event.type, event.amount])).toEqual([["manual_freeze", "-10"], ["manual_release", "1"]]);
    expect(events.every(event => event.balanceAfter === null && event.sourceType === "wallet_hold")).toBe(true);
    expect(h.trace.every(sql => sql.startsWith("SELECT ") && !/orders|FOR UPDATE|CREATE|ALTER/.test(sql))).toBe(true);
    expect((await getWalletManualFreezeState({ ledgerId: 52, userId: 2 })).items).toEqual([]);
  });
  it("native funding read excludes independent asset duplication", async () => {
    new ManualHarness(); await freezeWalletManually(freezeInput("BTC"));
    expect(await listWalletManualFundingFreezeEvents(1)).toEqual([]);
  });
  it("state returns no manual facts only for a genuinely absent table, never runs DDL", async () => {
    const h = new ManualHarness(); h.missingTable = true;
    expect(await getWalletManualFreezeState({ ledgerId: 52, userId: 1 })).toEqual({ items: [], events: [], orderProtected: true,
      availableAssets: AI_WALLET_ASSETS.map(assetCode => ({ assetCode, availableAmount: "100" })) });
    expect(h.trace.every(sql => sql.startsWith("SELECT "))).toBe(true);
    dbMocks.getDbConnection.mockResolvedValue({ execute: async () => { throw new Error("state network failed"); } });
    await expect(getWalletManualFreezeState({ ledgerId: 52, userId: 1 })).rejects.toThrow("state network failed");
    dbMocks.getDbConnection.mockResolvedValue({ execute: async () => { throw Object.assign(new Error("bad SQL"), { code: "ER_PARSE_ERROR" }); } });
    await expect(getWalletManualFreezeState({ ledgerId: 52, userId: 1 })).rejects.toThrow("bad SQL");
  });
  it("native read only tolerates absent table, not database/network errors", async () => {
    const h = new ManualHarness(); h.missingTable = true;
    expect(await listWalletManualFundingFreezeEvents(1)).toEqual([]);
    h.connectionFailure = true;
    await expect(listWalletManualFundingFreezeEvents(1)).rejects.toThrow("数据库连接失败");
    dbMocks.getDbConnection.mockResolvedValue({ execute: async () => { throw new Error("network failed"); } });
    await expect(listWalletManualFundingFreezeEvents(1)).rejects.toThrow("network failed");
  });
});

// Isolate the ACTUAL route expressions instead of importing miban.ts or routers.ts (scanner imports).
const routeSource = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("miban.ts", routeSource, ts.ScriptTarget.Latest, true);
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = []; const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); }; visit(root); return result;
}
function evaluate(source: string, bindings: Record<string, any>) {
  return runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, bindings, { timeout: 1000 });
}
function route(name: string, bindings: Record<string, any>) {
  const property = nodes(ast, ts.isPropertyAssignment).find(node => node.name.getText(ast) === name)!;
  const chain: any = { schema: undefined, input(schema: any) { this.schema = schema; return this; }, query(callback: any) { return { schema: this.schema, callback }; }, mutation(callback: any) { return { schema: this.schema, callback }; } };
  return evaluate(`(${property.initializer.getText(ast)})`, { ...bindings, mibanAdminProcedure: chain, AI_WALLET_ASSETS, z, TRPCError, Number });
}
describe("real manual admin route gates without importing DB/scanners", () => {
  it.each(["walletManualFreezeState", "walletManualFreeze", "walletManualRelease"])("%s requires52 and admin gate + wallet operation toggle", async name => {
    const helpers = { freezeWalletManually: vi.fn().mockResolvedValue({ success: true }), releaseWalletManually: vi.fn().mockResolvedValue({ success: true }), getWalletManualFreezeState: vi.fn().mockResolvedValue({ orderProtected: true }) };
    const enabled = vi.fn().mockResolvedValue(undefined);
    const actual = route(name, { ...helpers, assertAiWalletOperationEnabled: enabled });
    const input = name === "walletManualFreezeState" ? { ledgerId: 52, userId: 1 } : name === "walletManualFreeze" ? freezeInput() : releaseInput(1);
    expect(actual.schema.safeParse({ ...input, ledgerId: 37 }).success).toBe(false);
    expect(actual.schema.safeParse({ ...input, ledgerId: undefined }).success).toBe(false);
    expect(actual.schema.safeParse({ ...input, userId: -1 }).success).toBe(false);
    await actual.callback({ input: actual.schema.parse(input), ctx: { user: { id: 99 } } });
    expect(enabled).toHaveBeenCalledWith("ledger:52", "admin_adjustment");
    enabled.mockRejectedValue(new Error("operation disabled"));
    await expect(actual.callback({ input, ctx: { user: { id: 99 } } })).rejects.toThrow("disabled");
    expect(Object.values(helpers).reduce((sum, fn) => sum + fn.mock.calls.length, 0)).toBe(1);
  });
  it("executes the actual shared admin middleware and rejects non-admin/ledger-owner", async () => {
    const gate = nodes(ast, ts.isVariableDeclaration).find(node => node.name.getText(ast) === "mibanAdminProcedure")!;
    const use = gate.initializer as ts.CallExpression;
    const middleware = evaluate(`(${use.arguments[0].getText(ast)})`, { TRPCError });
    const next = vi.fn();
    for (const role of ["admin", "user", "owner", "parent", "baby", undefined]) await expect(middleware({ ctx: { user: { role } }, next })).rejects.toThrow("系统管理员");
    expect(next).not.toHaveBeenCalled();
    await middleware({ ctx: { user: { role: "super_admin" } }, next });
    expect(next).toHaveBeenCalledOnce();
  });
  it("keeps old order release entry point out of reserved manual namespace", () => {
    const source = readFileSync(new URL("./ledger37-wallet.ts", import.meta.url), "utf8");
    expect(source).toContain('if (String(hold.tag_name).startsWith("AIW_MANUAL_FREEZE:"))');
    expect(source).toContain('if (tagName.startsWith("AIW_MANUAL_FREEZE:"))');
    expect(readFileSync(new URL("./db-wallet-manual-freezes.ts", import.meta.url), "utf8")).not.toMatch(/price-scanner|getCnyValue|UPDATE ai_wallet_manual_freeze_actions|DELETE FROM ai_wallet_manual/);
  });
});

describe("additional failure and live SQL wiring regression", () => {
  it("serializes manual native freeze against actual shared debit guard", async () => {
    const h = new ManualHarness();
    const freezing = freezeWalletManually(freezeInput("USDT", "80"));
    await h.firstUserLock;
    const results = await Promise.allSettled([
      freezing,
      withGlobalWalletTransaction(1, tx => assertGlobalWalletDebit(tx, 1, "USDT", "30")),
    ]);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(h.book.holds).toHaveLength(1);
    expect(h.book.actions).toHaveLength(1);
  });
  it("full-release request replays after released status without a second movement", async () => {
    const h = new ManualHarness(); const { item } = await freezeWalletManually(freezeInput("BTC"));
    const input = releaseInput(item.id);
    const original = await releaseWalletManually(input);
    const repeat = await releaseWalletManually(input);
    expect(repeat).toEqual({ ...original, alreadyCompleted: true });
    expect(h.book.entries).toHaveLength(2); expect(h.book.actions).toHaveLength(2);
  });
  it("rejects release on wrong user/ledger, bad quantity, or overlong note", async () => {
    const h = new ManualHarness(); const { item } = await freezeWalletManually(freezeInput());
    for (const change of [{ userId: 2 }, { ledgerId: 37 }, { amount: "-0" }, { amount: "1e-8" }, { amount: "0.000000001" }, { note: "x".repeat(501) }]) {
      await expect(releaseWalletManually({ ...releaseInput(item.id, "1"), ...change } as any)).rejects.toThrow();
    }
    expect(h.book.holds[0].released_amount).toBe("0");
    expect(h.book.actions).toHaveLength(1);
  });
  it("independent asset release cannot refer to native/order hold", async () => {
    const h = new ManualHarness(); const { item } = await freezeWalletManually(freezeInput("BTY"));
    h.book.freezes[0].funding_hold_id = 55;
    await expect(releaseWalletManually(releaseInput(item.id))).rejects.toThrow("关联异常");
    expect(h.book.entries).toHaveLength(1);
  });
  it("unique lower movement request is not an independent replay authority", async () => {
    const h = new ManualHarness();
    await freezeWalletManually(freezeInput("BTC"));
    // Corrupt recovery scenario: action deleted out-of-band but original movement survives.
    h.book.actions = [];
    const original = structuredClone(h.book);
    await expect(freezeWalletManually(freezeInput("BTC"))).rejects.toThrow("资产流水关联异常");
    expect(h.book).toEqual(original);
    expect(h.trace.at(-1)).toBe("release");
  });
  it("state validatesledger and user, never silently hides malformed freeze data", async () => {
    const h = new ManualHarness(); const { item } = await freezeWalletManually(freezeInput());
    await expect(getWalletManualFreezeState({ ledgerId: 37, userId: 1 } as any)).rejects.toThrow("52号");
    await expect(getWalletManualFreezeState({ ledgerId: 52, userId: 0 })).rejects.toThrow("用户无效");
    h.book.freezes[0].released_amount = "11";
    await expect(getWalletManualFreezeState({ ledgerId: 52, userId: 1 })).rejects.toThrow("金额异常");
    await expect(releaseWalletManually(releaseInput(item.id, "1"))).rejects.toThrow("金额异常");
  });
  it("global manual native branch shows transfers between layers, never credits total balance", () => {
    const declaration = nodes(ast, ts.isVariableDeclaration).find(node => node.name.getText(ast) === "eventSourceSql")!;
    const sql = declaration.initializer!.getText(ast);
    const manualDeclaration = nodes(ast, ts.isVariableDeclaration).find(node => node.name.getText(ast) === "manualActionUnion")!;
    const manualInitializer = manualDeclaration.initializer!;
    if (!ts.isConditionalExpression(manualInitializer)) throw new Error("Manual native union must be conditional on the read-only table probe");
    const branch = manualInitializer.whenTrue.getText(ast);
    expect(sql).toContain("${manualActionUnion}");
    expect(branch).toContain("FROM ai_wallet_manual_freeze_actions a");
    expect(branch).toContain("a.ledger_id = 52 AND a.source = 'manual' AND a.asset_code IN ('CNY', 'USDT')");
    expect(branch).toContain("'wallet_hold'");
    expect(branch).toContain("'collateral_lock' ELSE 'collateral_release'");
    expect(branch).toContain("NULL AS raw_balance");
    expect(branch).not.toMatch(/JOIN|UPDATE|recharge|withdraw/);
    expect(sql).toContain("AND mae.note NOT LIKE '%[MANUAL_FREEZE:%'");
  });
  it("CNY native branch adjusts frozen delta only and income filters exclude manual layer movement", () => {
    const source = readFileSync(new URL("./db-recharge.ts", import.meta.url), "utf8");
    const start = source.indexOf("SELECT a.id AS event_id");
    const branch = source.slice(start, source.indexOf("), sequenced_events", start));
    expect(branch).toContain("0 AS legacy_delta");
    expect(branch).toContain("CASE WHEN a.direction = 'freeze' THEN a.amount ELSE -a.amount END AS frozen_delta");
    expect(branch).toContain("a.ledger_id = 52 AND a.user_id = ? AND a.source = 'manual' AND a.asset_code = 'CNY'");
    expect(source).toContain("e.amount > 0 AND e.source_type <> 'manual_hold'");
    expect(source).toContain("e.amount < 0 AND e.source_type <> 'manual_hold'");
  });
});
