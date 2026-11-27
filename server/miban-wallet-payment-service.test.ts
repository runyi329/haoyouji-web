import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { paymentDecimalUnits, paymentUnitsText, splitMibanPaymentDeductions, type MibanPaymentDeduction } from "../shared/miban-wallet-payment";
const mocks = vi.hoisted(() => ({ connection: vi.fn(), transaction: vi.fn(), infrastructure: vi.fn(), verify: vi.fn() }));
vi.mock("./db", () => ({ getDbConnection: mocks.connection, getDbTransactionConnection: mocks.transaction }));
vi.mock("./db-multi-asset-wallet", () => ({ ensureMultiAssetWalletInfrastructure: mocks.infrastructure }));
vi.mock("./miban-wallet-payment-quote", () => ({ verifyMibanPaymentQuoteToken: mocks.verify }));
import { withGlobalWalletTransaction } from "./wallet-funding-guard";
import {
  cancelMibanOrderWithWalletRefund, debitMibanWalletPayment, mibanWalletPaymentSalesValue,
  prepareMibanWalletPayment, readMibanOrderWalletPayments, type PreparedMibanPayment,
} from "./miban-wallet-payment-service";

const deduction = (assetCode = "ETH", amount = "1", priceCny = "100"): MibanPaymentDeduction => ({ assetCode, amount, priceCny, priceUsdt: "10", cnyValue: paymentUnitsText(paymentDecimalUnits(amount) * paymentDecimalUnits(priceCny) / (10n ** 18n)) });
const payment = (rows = [deduction()]): PreparedMibanPayment => ({ quoteToken: "server-signed-token", quotedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), usdtCnyRate: "10", deductions: rows });
const add = (a: string, b: string) => paymentUnitsText(paymentDecimalUnits(a) + paymentDecimalUnits(b));

class Harness {
  state: any = { balances: { ETH: { available_balance: "2", frozen_balance: "8" }, BTC: { available_balance: "1", frozen_balance: "4" } },
    user: { id: 1, balance: "100", cny_balance: "100" }, manual: [], holds: [], uses: [], snapshots: [], entries: [], history: [],
    orders: { 1: { id: 1, userId: 1, status: "pending", walletDeductCny: "0", walletDeductUsdt: "0" } }, commissions: [] };
  trace: string[] = [];
  failOn = "";
  tail: Promise<void> = Promise.resolve();
  connection() {
    const h = this; let book: any; let unlock: (() => void) | undefined;
    return {
      async beginTransaction() { const previous = h.tail; h.tail = new Promise<void>(resolve => { unlock = resolve; }); await previous; book = structuredClone(h.state); h.trace.push("begin"); },
      async commit() { h.state = book; h.trace.push("commit"); unlock?.(); },
      async rollback() { h.trace.push("rollback"); unlock?.(); },
      release() { h.trace.push("release"); },
      async execute(sql: string, args: any[] = []) {
        sql = sql.replace(/\s+/g, " ").trim(); h.trace.push(sql);
        const b = book ?? h.state;
        if (h.failOn && sql.includes(h.failOn)) throw new Error("storage unavailable");
        if (sql.startsWith("SELECT id") && sql.includes("FROM users")) return [[b.user]];
        if (sql.startsWith("SELECT amount FROM af_manual_balances WHERE id")) return [[b.manual[Number(args[0]) - 1]]];
        if (sql.startsWith("SELECT amount FROM af_manual_balances")) return [b.manual.filter((r: any) => sql.includes("NOT LIKE") ? !r.note.startsWith("[CNY]") : r.note.startsWith("[CNY]"))];
        if (sql.includes("FROM ai_wallet_project_holds")) return [b.holds.filter((r: any) => r.asset_code === args[1])];
        if (sql.startsWith("SELECT ledger_id")) return [[{ ledger_id: 52 }]];
        if (sql.startsWith("INSERT INTO miban_wallet_payment_quote_uses")) {
          if (b.uses.includes(args[0])) throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
          b.uses.push(args[0]); return [{ insertId: b.uses.length }];
        }
        if (sql.startsWith("SELECT available_balance")) return [b.balances[args[1]] ? [b.balances[args[1]]] : []];
        if (sql.startsWith("UPDATE ai_wallet_asset_balances")) {
          const r = b.balances[args[2]];
          if (!r || paymentDecimalUnits(r.frozen_balance) < 0n || paymentDecimalUnits(add(r.available_balance, args[0])) < 0n) return [{ affectedRows: 0 }];
          r.available_balance = add(r.available_balance, args[0]); return [{ affectedRows: 1 }];
        }
        if (sql.startsWith("INSERT INTO ai_wallet_asset_entries")) { b.entries.push(args); return [{ insertId: b.entries.length }]; }
        if (sql.startsWith("INSERT INTO af_manual_balances")) { b.manual.push({ amount: args[2], note: args[3] }); return [{ insertId: b.manual.length }]; }
        if (sql.startsWith("INSERT INTO balance_history")) { b.history.push(args); return [{ insertId: b.history.length }]; }
        if (sql.startsWith("INSERT INTO miban_order_wallet_payments")) {
          b.snapshots.push({ id: b.snapshots.length + 1, order_id: args[0], user_id: args[1], asset_code: args[2], amount: args[3], price_cny: args[4], price_usdt: args[5], cny_value: args[6], quoted_at: args[7], refunded: 0 });
          return [{ insertId: b.snapshots.length }];
        }
        if (sql.startsWith("SELECT * FROM miban_order_wallet_payments")) return [b.snapshots.filter((r: any) => args.includes(r.order_id)).sort((a: any, c: any) => a.asset_code.localeCompare(c.asset_code))];
        if (sql.startsWith("UPDATE miban_order_wallet_payments")) { const r = b.snapshots.find((r: any) => r.id === args[2]); if (!r || r.refunded) return [{ affectedRows: 0 }]; r.refunded = 1; return [{ affectedRows: 1 }]; }
        if (sql.startsWith("SELECT * FROM miban_orders")) return [b.orders[args[0]] ? [b.orders[args[0]]] : []];
        if (sql.startsWith("SELECT id, status FROM miban_commissions")) return [b.commissions];
        if (sql.startsWith("UPDATE miban_commissions")) { b.commissions.forEach((r: any) => { if (r.status === "pending") r.status = "cancelled"; }); return [{ affectedRows: 1 }]; }
        if (sql.startsWith("UPDATE miban_orders")) { const r = b.orders[args[0]]; if (!r || r.status !== args[1]) return [{ affectedRows: 0 }]; r.status = "cancelled"; return [{ affectedRows: 1 }]; }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
  }
}
function pay(h: Harness, p = payment(), orders = [{ orderId: 1, deductions: p.deductions }]) {
  mocks.transaction.mockImplementation(async () => h.connection());
  return withGlobalWalletTransaction(1, transaction => debitMibanWalletPayment({ transaction, userId: 1, payment: p, orders }));
}
function cancel(h: Harness) {
  mocks.transaction.mockImplementation(async () => h.connection());
  return withGlobalWalletTransaction(1, transaction => cancelMibanOrderWithWalletRefund({ transaction, userId: 1, orderId: 1, actorUserId: 9 }));
}
beforeEach(() => { vi.clearAllMocks(); mocks.verify.mockReturnValue({ quotedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), usdtCnyRate: "10", assets: [deduction()] }); });

describe("isolated miban native payment transactions", () => {
  it("uses independent available without subtracting frozen again and preserves frozen", async () => {
    const h = new Harness(); await pay(h);
    expect(h.state.balances.ETH).toEqual({ available_balance: "1", frozen_balance: "8" });
    expect(h.state.entries[0][6]).toBe("miban_payment");
    expect(h.state.snapshots[0].amount).toBe("1");
    expect(h.trace[1]).toContain("FROM users");
    expect(h.trace.some(s => /CREATE|ALTER/.test(s))).toBe(false);
  });
  it("never spends frozen balances", async () => {
    const h = new Harness(); h.state.balances.ETH.available_balance = "0";
    await expect(pay(h)).rejects.toThrow("冻结资金不可用于扣款"); expect(h.state.uses).toEqual([]); expect(h.state.entries).toEqual([]);
  });
  it("fails closed on malformed/negative frozen data", async () => {
    const h = new Harness(); h.state.balances.ETH.frozen_balance = "-1";
    await expect(pay(h)).rejects.toThrow("台账异常"); expect(h.state.balances.ETH.available_balance).toBe("2");
  });
  it("checks every asset before any debit, including native funding holds", async () => {
    const h = new Harness(); h.state.holds.push({ asset_code: "USDT", amount: "100", released_amount: "0" });
    await expect(pay(h, payment([deduction(), deduction("USDT", "1", "10")]))).rejects.toThrow("冻结资金不可用于扣款");
    expect(h.state.balances.ETH.available_balance).toBe("2"); expect(h.state.entries).toEqual([]);
  });
  it("rolls back every asset, quote use and snapshot on late storage failure", async () => {
    const h = new Harness(); h.failOn = "INSERT INTO miban_order_wallet_payments";
    await expect(pay(h, payment([deduction(), deduction("BTC", "0.5", "100")]))).rejects.toThrow("storage unavailable");
    expect(h.state.entries).toEqual([]); expect(h.state.uses).toEqual([]); expect(h.state.balances.ETH.available_balance).toBe("2");
    h.failOn = ""; await expect(pay(h)).resolves.toBeUndefined();
  });
  it("rejects same successful quote across repeated and simultaneous requests", async () => {
    const h = new Harness(); const results = await Promise.allSettled([pay(h), pay(h)]);
    expect(results.map(row => row.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(h.state.entries).toHaveLength(1); expect(h.state.uses).toHaveLength(1);
    await expect(pay(h)).rejects.toThrow("已成功使用");
  });
  it("rechecks token expiration after obtaining the user lock", async () => {
    const h = new Harness(); const p = payment(); p.expiresAt = new Date(Date.now() - 1).toISOString();
    await expect(pay(h, p)).rejects.toThrow("过期"); expect(h.state.uses).toEqual([]); expect(mocks.verify).toHaveBeenCalledWith(p.quoteToken, 1);
  });
  it("supports the smallest native coin amount without number rounding", async () => {
    const h = new Harness(); await pay(h, payment([deduction("ETH", "0.000000000000000001")]));
    expect(h.state.balances.ETH.available_balance).toBe("1.999999999999999999");
    expect(h.state.snapshots[0].amount).toBe("0.000000000000000001");
  });
  it("debits subscription once and snapshots exact per-coin shares", async () => {
    const h = new Harness(); const p = payment([deduction("ETH", "1.000000000000000001")]);
    const shares = splitMibanPaymentDeductions(p.deductions, 3);
    await pay(h, p, shares.map((deductions, index) => ({ orderId: index + 1, deductions })));
    expect(h.state.entries).toHaveLength(1); expect(h.state.uses).toHaveLength(1); expect(h.state.snapshots).toHaveLength(3);
    const sum = h.state.snapshots.reduce((sum: bigint, row: any) => sum + paymentDecimalUnits(row.amount), 0n);
    expect(paymentUnitsText(sum)).toBe(p.deductions[0].amount);
  });
  it("rejects broken per-order native splits", async () => {
    const h = new Harness(); await expect(pay(h, payment(), [{ orderId: 1, deductions: [deduction("ETH", "0.5")] }])).rejects.toThrow("不一致");
    expect(h.state.uses).toEqual([]);
  });
});

describe("isolated order cancellation and refund", () => {
  it("refunds original coin exactly and leaves frozen untouched; repeat only retries stock", async () => {
    const h = new Harness(); await pay(h); h.trace = [];
    const first = await cancel(h); expect(first.alreadyCancelled).toBe(false);
    expect(h.state.balances.ETH).toEqual({ available_balance: "2", frozen_balance: "8" });
    expect(h.state.entries[1][6]).toBe("miban_refund"); expect(h.state.snapshots[0].refunded).toBe(1);
    const ownerIndex = h.trace.findIndex(s => s.includes("FROM users"));
    const orderIndex = h.trace.findIndex(s => s.includes("FROM miban_orders"));
    const commissionIndex = h.trace.findIndex(s => s.includes("FROM miban_commissions"));
    expect(ownerIndex).toBeLessThan(orderIndex); expect(orderIndex).toBeLessThan(commissionIndex);
    expect((await cancel(h)).alreadyCancelled).toBe(true); expect(h.state.entries).toHaveLength(2);
  });
  it("settled commission blocks refunds and pending cancellation", async () => {
    const h = new Harness(); await pay(h); h.state.commissions = [{ id: 1, status: "settled" }, { id: 2, status: "pending" }];
    await expect(cancel(h)).rejects.toThrow("奖金已结算");
    expect(h.state.balances.ETH.available_balance).toBe("1"); expect(h.state.commissions[1].status).toBe("pending"); expect(h.state.orders[1].status).toBe("pending");
  });
  it("refund storage failure rolls back credit, pending commission and order status", async () => {
    const h = new Harness(); await pay(h); h.state.commissions = [{ id: 1, status: "pending" }]; h.failOn = "UPDATE miban_order_wallet_payments";
    await expect(cancel(h)).rejects.toThrow("storage unavailable");
    expect(h.state.entries).toHaveLength(1); expect(h.state.snapshots[0].refunded).toBe(0); expect(h.state.orders[1].status).toBe("pending");
    expect(h.state.commissions[0].status).toBe("pending"); expect(h.state.balances.ETH.available_balance).toBe("1");
  });
  it("legacy tiny USDT is refunded in original currency without epsilon suppression", async () => {
    const h = new Harness(); h.state.orders[1].walletDeductUsdt = "0.00000001";
    const result = await cancel(h); expect(result.walletPayments[0].amount).toBe("0.00000001");
    expect(h.state.manual[0].amount).toBe("0.00000001"); expect(h.state.history[0][2]).toBe("refund"); expect(h.state.balances.ETH.available_balance).toBe("2");
  });
  it("current shipped status blocks cancellation", async () => {
    const h = new Harness(); h.state.orders[1].status = "shipped"; await expect(cancel(h)).rejects.toThrow("已发货"); expect(h.state.manual).toEqual([]);
  });
  it("legacy ledger precision mismatch fails closed rather than rounding a refund", async () => {
    const h = new Harness(); h.state.orders[1].walletDeductUsdt = "0.00000001";
    mocks.transaction.mockImplementation(async () => {
      const tx = h.connection(); const execute = tx.execute.bind(tx);
      tx.execute = async (sql, args = []) => sql.startsWith("SELECT amount FROM af_manual_balances WHERE id") ? [[{ amount: "0.00" }]] : execute(sql, args);
      return tx;
    });
    await expect(withGlobalWalletTransaction(1, transaction => cancelMibanOrderWithWalletRefund({ transaction, userId: 1, orderId: 1, actorUserId: 9 }))).rejects.toThrow("精度不足");
    expect(h.state.manual).toEqual([]); expect(h.state.orders[1].status).toBe("pending");
  });
});

describe("readonly compatibility and trusted plans", () => {
  it("only missing side table returns empty, other database failure propagates", async () => {
    const absent = { execute: vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ER_NO_SUCH_TABLE" })) };
    expect((await readMibanOrderWalletPayments([1], absent)).size).toBe(0);
    const outage = { execute: vi.fn().mockRejectedValue(new Error("connection lost")) };
    await expect(readMibanOrderWalletPayments([1], outage)).rejects.toThrow("connection lost");
    expect(mocks.infrastructure).not.toHaveBeenCalled();
  });
  it("legacy API stays legacy, missing token and unsupported securities fail closed", () => {
    expect(prepareMibanWalletPayment({ userId: 1, totalCny: "100" })).toBeNull();
    expect(() => prepareMibanWalletPayment({ userId: 1, totalCny: "100", paymentAssets: [{ assetCode: "ETH", amount: "1" }] })).toThrow("报价");
    expect(() => prepareMibanWalletPayment({ userId: 1, totalCny: "100", paymentQuoteToken: "signed", paymentAssets: [{ assetCode: "AAPL", amount: "1" }] })).toThrow("不支持");
    const plan = prepareMibanWalletPayment({ userId: 1, totalCny: "100", paymentQuoteToken: "signed", paymentAssets: [{ assetCode: "ETH", amount: "1" }] });
    expect(plan?.deductions[0].priceCny).toBe("100");
  });
  it("sales use original snapshot equivalents and never double count legacy fields", () => {
    const result = mibanWalletPaymentSalesValue({ walletPayments: [deduction()], walletDeductCny: "50", walletDeductUsdt: "60" });
    expect(result).toEqual({ cny: 100, usdt: 10 });
    expect(mibanWalletPaymentSalesValue({ walletDeductCny: "50", walletDeductUsdt: "60" })).toEqual({ cny: 50, usdt: 60 });
  });
  it("exactly four released order mutations retain native payment; only the original three allow legacy", () => {
    const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
    const ast = ts.createSourceFile("miban.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const routes: Array<{ path: string; node: ts.PropertyAssignment }> = [];
    for (const statement of ast.statements) if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
        const object = declaration.initializer.arguments[0];
        if (!object || !ts.isObjectLiteralExpression(object)) continue;
        for (const property of object.properties) if (ts.isPropertyAssignment(property)) {
          const paymentFields: ts.PropertyAssignment[] = [];
          const visit = (node: ts.Node) => {
            if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "paymentAssets" && node.initializer.getText(ast).startsWith("z.array(")) {
              paymentFields.push(node);
            }
            ts.forEachChild(node, visit);
          };
          visit(property.initializer);
          if (paymentFields.length) {
            expect(paymentFields).toHaveLength(1);
            routes.push({ path: `${declaration.name.getText(ast)}.${property.name.getText(ast)}`, node: property });
          }
        }
      }
    }
    expect(routes.map(route => route.path)).toEqual([
      "mibanOrderRouter.create", "mibanLimitedProductRouter.createAnnualOrder",
      "mibanLimitedProductRouter.createOrder", "mibanLimitedProductRouter.createCartOrder",
    ]);
    for (const { path, node } of routes) {
      const expression = node.initializer.getText(ast);
      expect(expression.match(/prepareMibanWalletPayment\(\{\s*userId, totalCny/g)).toHaveLength(1);
      expect(expression.match(/await withGlobalWalletTransaction\(userId,/g)).toHaveLength(1);
      expect(expression.match(/await debitMibanWalletPayment\(/g)).toHaveLength(1);
      expect(expression).toContain("paymentAssets: input.paymentAssets, paymentQuoteToken: input.paymentQuoteToken");
      if (path === "mibanLimitedProductRouter.createAnnualOrder") {
        // 年单在正式HEAD已上线：必须签名支付，不新增或放开legacy回退。
        expect(expression).toContain('message: "全年计划必须使用签名钱包报价支付"');
        expect(expression).toMatch(/if \(!payment\)\s*\{\s*throw new TRPCError/);
        expect(expression).not.toMatch(/\bdebitGlobalWallet\s*\(/);
        expect(expression.match(/await debitMibanWalletPayment\(\{ transaction, userId, payment, orders: createdOrders \}\)/g)).toHaveLength(1);
      } else {
        expect(expression.match(/if \(payment\) await debitMibanWalletPayment/g)).toHaveLength(1);
        expect(expression.match(/else await debitGlobalWallet/g)).toHaveLength(1);
      }
    }
    expect(source.match(/paymentAssets: z\.array/g)).toHaveLength(4);
    expect(source.match(/prepareMibanWalletPayment\(\{\s*userId, totalCny/g)).toHaveLength(4);
    expect(source.match(/await debitMibanWalletPayment\(/g)).toHaveLength(4);
    expect(source.match(/if \(payment\) await debitMibanWalletPayment/g)).toHaveLength(3);
    expect(source.match(/else await debitGlobalWallet/g)).toHaveLength(3);
    expect(source).toContain("walletPaymentQuote: protectedProcedure.query");
    expect(source).toContain("if (Number((claimed as any).affectedRows) !== 1) continue");
    expect(source).toContain("sql`${mibanOrders.status} <> 'cancelled'`");
    expect(source).not.toContain("if (deductUsdt > 0.000001)");
  });
});
