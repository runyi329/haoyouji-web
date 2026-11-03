import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ getDbConnection: vi.fn(), getDbTransactionConnection: vi.fn() }));
vi.mock("./db", () => dbMocks);
vi.mock("./ledger37-wallet", () => ({ ensureLedger37WalletInfrastructure: vi.fn() }));
import { addUserBalance, adminAdjustCnyBalance, requestWithdraw } from "./db-recharge";
import {
  assertGlobalWalletDebit, debitGlobalWallet, fundingAmountText, fundingUnits,
  getGlobalWalletFundingBalance, withGlobalWalletTransaction,
} from "./wallet-funding-guard";

type Book = {
  balance: string;
  cny_balance: string;
  manual: Array<{ amount: string; note: string; ledger_id?: number }>;
  holds: Array<{ amount: string; released_amount: string; asset: string; ledger_id?: number }>;
  history: Array<unknown>;
  orders: number;
};

/** Isolated transaction adapter only. No real database module/credentials are loaded in these tests. */
class WalletHarness {
  book: Book;
  trace: string[] = [];
  failHistory = false;
  private queue = Promise.resolve();
  constructor(balance = "100.00000000", cny = "100.00000000") {
    this.book = { balance, cny_balance: cny, manual: [], holds: [], history: [], orders: 0 };
    dbMocks.getDbTransactionConnection.mockImplementation(async () => this.connection());
  }
  connection() {
    const harness = this;
    let stage: Book;
    let unlocked: (() => void) | undefined;
    let hasLock = false;
    const conn = {
      beginTransaction: async () => { harness.trace.push("begin"); },
      commit: async () => { harness.book = structuredClone(stage); harness.trace.push("commit"); unlocked?.(); unlocked = undefined; },
      rollback: async () => { harness.trace.push("rollback"); unlocked?.(); unlocked = undefined; },
      release: () => { harness.trace.push("release"); unlocked?.(); unlocked = undefined; },
      addOrder: () => { stage.orders += 1; },
      addHold: (amount: string, asset = "USDT") => { stage.holds.push({ amount, released_amount: "0", asset }); },
      execute: async (sql: string, values: any[] = []) => {
        harness.trace.push(sql);
        if (sql.includes("FROM users") && sql.includes("FOR UPDATE")) {
          if (!hasLock) {
            const previous = harness.queue;
            harness.queue = new Promise<void>(resolve => { unlocked = resolve; });
            await previous;
            stage = structuredClone(harness.book);
            hasLock = true;
          }
          return [[{ id: 1, balance: stage.balance, cny_balance: stage.cny_balance }]];
        }
        if (sql.startsWith("SELECT amount FROM af_manual_balances")) {
          const cny = !sql.includes("NOT LIKE '[CNY]%'");
          return [stage.manual.filter(m => cny ? m.note.startsWith("[CNY]") : !m.note.startsWith("[CNY]") && !m.note.startsWith("[BALANCE_BASE]"))];
        }
        if (sql.includes("FROM ai_wallet_project_holds")) {
          return [stage.holds.filter(h => h.asset === values[1])];
        }
        if (sql.startsWith("SELECT ledger_id")) return [[{ ledger_id: 52 }]];
        if (sql.startsWith("INSERT INTO af_manual_balances")) {
          stage.manual.push({ ledger_id: values[0], amount: values[2], note: values[3] });
          return [{ insertId: stage.manual.length }];
        }
        if (sql.startsWith("INSERT INTO balance_history")) {
          if (harness.failHistory) throw new Error("history storage unavailable");
          stage.history.push(values);
          return [{ insertId: stage.history.length }];
        }
        throw new Error("Unexpected test SQL: " + sql);
      },
    };
    return conn;
  }
}

const pay = (harness: WalletHarness, cnyAmount = 0, usdtAmount = 0) => withGlobalWalletTransaction(1, async tx => {
  tx.addOrder();
  await debitGlobalWallet({ transaction: tx, userId: 1, cnyAmount, usdtAmount, note: "测试交易", relatedId: 123 });
});

beforeEach(() => vi.clearAllMocks());

describe("legacy common wallet debit entry points cannot bypass the guard", () => {
  it.each(["consume", "reward", "commission", "refund", "withdraw"] as const)("checks available funds for negative %s", async type => {
    const h = new WalletHarness("100");
    h.book.holds.push({ amount: "100", released_amount: "0", asset: "USDT" });
    await expect(addUserBalance(1, -10, type, 123, "资金安全回归测试")).rejects.toThrow("冻结资金不可用于扣款");
    expect(h.book.manual).toEqual([]);
    expect(h.trace).not.toContain("commit");
  });
  it("protects negative CNY administrative adjustments", async () => {
    const h = new WalletHarness("0", "100");
    h.book.holds.push({ amount: "100", released_amount: "0", asset: "CNY" });
    await expect(adminAdjustCnyBalance({ userId: 1, amount: -10, note: "调整", operatorId: 2 })).rejects.toThrow("冻结资金不可用于扣款");
    expect(h.book.manual).toEqual([]);
  });
  it("routes regular withdrawal through the same protected debit entry", async () => {
    const h = new WalletHarness("100");
    h.book.holds.push({ amount: "100", released_amount: "0", asset: "USDT" });
    await expect(requestWithdraw(1, 10, 1)).rejects.toThrow("冻结资金不可用于扣款");
    expect(h.book.history).toEqual([]);
  });
  it("rolls back the common consumption ledger if its mirror fails", async () => {
    const h = new WalletHarness("100");
    h.failHistory = true;
    await expect(addUserBalance(1, -10, "consume", 1, "测试")).rejects.toThrow("history storage unavailable");
    expect(h.book.manual).toEqual([]);
  });
});

describe("global wallet funding precision", () => {
  it("compares 18-decimal holds exactly", () => {
    expect(fundingUnits("0.000000000000000001")).toBe(1n);
    expect(fundingUnits("-957.00000000")).toBe(-957n * 10n ** 18n);
  });
  it("rejects corrupt/nonfinite/tiny-zero amounts rather than treating them as spendable", () => {
    for (const value of ["bad", "NaN", "1e-8", "Infinity"]) expect(() => fundingUnits(value)).toThrow();
    expect(() => fundingAmountText(NaN)).toThrow();
    expect(() => fundingAmountText(0.000000001)).toThrow();
  });
});

describe("all marketplaces must pay from globally available funds", () => {
  it("does not spend any fully frozen CNY", async () => {
    const h = new WalletHarness("100", "626000");
    h.book.holds.push({ amount: "626000", released_amount: "0", asset: "CNY", ledger_id: 37 });
    await expect(pay(h, 49, 0)).rejects.toThrow("冻结资金不可用于扣款");
    expect(h.book.manual).toEqual([]);
    expect(h.book.orders).toBe(0);
  });
  it("rejects additional spending for the existing negative-available CNY case", async () => {
    const h = new WalletHarness("100", "0");
    h.book.manual.push({ amount: "626000", note: "[CNY]保证金迁入" }, { amount: "-957", note: "[CNY]消费" });
    h.book.holds.push({ amount: "626000", released_amount: "0", asset: "CNY" });
    await expect(pay(h, 1, 0)).rejects.toThrow("可用余额不足");
    expect(h.book.manual).toHaveLength(2);
  });
  it("honors combined 37 and 52 freezes, regardless of the marketplace's own ledger", async () => {
    const h = new WalletHarness("100", "100");
    h.book.holds.push({ amount: "40", released_amount: "0", asset: "USDT", ledger_id: 37 }, { amount: "30", released_amount: "0", asset: "USDT", ledger_id: 52 });
    await expect(pay(h, 0, 31)).rejects.toThrow("可用余额不足");
    await expect(pay(h, 0, 30)).resolves.toBeUndefined();
    expect(h.book.manual[0].amount).toBe("-30.00000000");
  });
  it("uses remaining frozen funds after partial release", async () => {
    const h = new WalletHarness("100");
    h.book.holds.push({ amount: "100", released_amount: "25", asset: "USDT" });
    await expect(pay(h, 0, 25)).resolves.toBeUndefined();
    await expect(pay(h, 0, 0.00000001)).rejects.toThrow("可用余额不足");
  });
  it("excludes BALANCE_BASE mirrors and never mixes CNY with USDT", async () => {
    const h = new WalletHarness("0", "0");
    h.book.manual.push({ amount: "100", note: "[BALANCE_BASE]充值副本" }, { amount: "100", note: "[CNY]入账" });
    await expect(pay(h, 0, 1)).rejects.toThrow("USDT钱包可用余额不足");
    await expect(pay(h, 100, 0)).resolves.toBeUndefined();
  });
  it("does not block a zero-used currency with a historical negative balance", async () => {
    const h = new WalletHarness("100", "-10");
    await expect(pay(h, 0, 49)).resolves.toBeUndefined();
    expect(h.book.manual).toHaveLength(1);
  });
  it("atomically rejects mixed payment before writing either currency", async () => {
    const h = new WalletHarness("5", "100");
    await expect(pay(h, 49, 6)).rejects.toThrow("USDT钱包可用余额不足");
    expect(h.book.manual).toEqual([]);
    expect(h.book.orders).toBe(0);
  });
  it("rolls back orders and BOTH debits on a history-write failure", async () => {
    const h = new WalletHarness();
    h.failHistory = true;
    await expect(pay(h, 49, 20)).rejects.toThrow("history storage unavailable");
    expect(h.book.manual).toEqual([]);
    expect(h.book.history).toEqual([]);
    expect(h.book.orders).toBe(0);
    expect(h.trace).toContain("rollback");
    expect(h.trace).not.toContain("commit");
    expect(h.trace.at(-1)).toBe("release");
  });
  it("serializes concurrent purchases so the second cannot overdraw", async () => {
    const h = new WalletHarness("80", "0");
    const results = await Promise.allSettled([pay(h, 0, 60), pay(h, 0, 60)]);
    expect(results.map(r => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(h.book.orders).toBe(1);
    expect(h.book.manual).toHaveLength(1);
    expect(h.book.manual[0].amount).toBe("-60.00000000");
  });
  it("concurrent freeze and payment use the same user lock", async () => {
    const h = new WalletHarness("80", "0");
    const freeze = withGlobalWalletTransaction(1, async tx => { tx.addHold("70"); });
    const results = await Promise.allSettled([freeze, pay(h, 0, 60)]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(h.book.manual).toEqual([]);
    expect(h.book.holds).toHaveLength(1);
  });
  it("never allows even a sub-8-decimal overdraft because of an epsilon", async () => {
    const h = new WalletHarness("1", "0");
    h.book.holds.push({ amount: "0.999999990000000001", released_amount: "0", asset: "USDT" });
    await expect(pay(h, 0, 0.00000001)).rejects.toThrow("可用余额不足");
  });
  it("fails closed on malformed frozen releases", async () => {
    const h = new WalletHarness();
    h.book.holds.push({ amount: "10", released_amount: "11", asset: "USDT" });
    await expect(pay(h, 0, 1)).rejects.toThrow("冻结台账异常");
  });
  it("rejects negative/nonfinite marketplace payment amounts", async () => {
    const h = new WalletHarness();
    await expect(pay(h, -1, 0)).rejects.toThrow("商城扣款金额无效");
    await expect(pay(h, 0, Infinity)).rejects.toThrow("商城扣款金额无效");
    expect(h.book.orders).toBe(0);
  });
  it("preflight fails closed on database failure, never silently assumes frozen=0", async () => {
    dbMocks.getDbConnection.mockResolvedValue(null);
    await expect(getGlobalWalletFundingBalance(1, "CNY")).rejects.toThrow("数据库连接失败");
  });
  it("keeps auxiliary mirrors at exactly the same persisted precision", async () => {
    const h = new WalletHarness();
    await pay(h, 0, 19.10447761);
    expect(h.book.manual[0].amount).toBe("-19.10447761");
    expect((h.book.history[0] as any[])[1]).toBe(h.book.manual[0].amount);
  });
});
