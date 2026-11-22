import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { TRPCError } from "@trpc/server";
import {
  PAYMENT_SCALE, paymentDecimalUnits, paymentUnitsText, type MibanPaymentDeduction,
} from "../shared/miban-wallet-payment";
import { splitMibanPaymentDeductionsByTotals } from "../shared/miban-cart-checkout";

// Only safe payment primitives are imported. No miban module, routers, SDK, real DB or DDL.
const mocks = vi.hoisted(() => ({ connection: vi.fn(), transaction: vi.fn(), infrastructure: vi.fn(), verify: vi.fn() }));
vi.mock("./db", () => ({ getDbConnection: mocks.connection, getDbTransactionConnection: mocks.transaction }));
vi.mock("./db-multi-asset-wallet", () => ({ ensureMultiAssetWalletInfrastructure: mocks.infrastructure }));
vi.mock("./miban-wallet-payment-quote", () => ({ verifyMibanPaymentQuoteToken: mocks.verify }));
import { debitGlobalWallet, withGlobalWalletTransaction } from "./wallet-funding-guard";
import {
  cancelMibanOrderWithWalletRefund, debitMibanLegacyCartWalletPayment, debitMibanWalletPayment,
  mibanFundingDeductionAmounts, prepareMibanWalletPayment,
} from "./miban-wallet-payment-service";

const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("miban.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let handler: ts.ArrowFunction | undefined;
function visit(node: ts.Node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "createCartOrder") {
    const mutation = node.initializer;
    if (ts.isCallExpression(mutation) && ts.isArrowFunction(mutation.arguments[0])) handler = mutation.arguments[0];
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (!handler) throw new Error("createCartOrder mutation missing");
const functionNames = ["reserveLimitedSkuStocks", "linkLimitedStockDeductionsToOrder", "releaseLimitedSkuStocks", "restockLimitedOrderIfManaged", "readLimitedProductLines", "getLimitedOrderCommissionBaseCny"];
const declarations = functionNames.map(name => {
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Target function missing: ${name}`);
  return declaration.getText(ast);
}).join("\n");
const isolatedJs = ts.transpileModule(`${declarations}\nreturn { checkout: (${handler.getText(ast)}), restockLimitedOrderIfManaged, getLimitedOrderCommissionBaseCny };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const add = (a: string, b: string) => paymentUnitsText(paymentDecimalUnits(a) + paymentDecimalUnits(b));
const deduction = (assetCode: string, amount: string, priceCny: string, priceUsdt = "1"): MibanPaymentDeduction => ({
  assetCode, amount, priceCny, priceUsdt,
  cnyValue: paymentUnitsText(paymentDecimalUnits(amount) * paymentDecimalUnits(priceCny) / PAYMENT_SCALE),
});
const fixture = (key: string, price: number, group: string | undefined, brand: string, eligible = true) => ({
  key, status: "on_sale", checkoutGroupKey: group, brand, category: eligible ? "eligible" : "excluded",
  detail: { title: `${brand}商品`, productImage: `${key}.png` }, card: { theme: { accent: "#123456" } },
  skus: [{ id: "sku", name: `${brand}规格`, active: true, priceCny: price, maxPurchaseQty: 10, unitLabel: "件", netContentText: "1件" }],
});

class Harness {
  state: any = {
    user: { id: 1, balance: "1000", cny_balance: "1000" },
    balances: { ETH: { available_balance: "10", frozen_balance: "8" }, BTC: { available_balance: "10", frozen_balance: "4" } },
    manual: [], holds: [], uses: [], snapshots: [], entries: [], history: [], orders: [], commissions: [],
    stock: { "a:sku": 100, "b:sku": 100, "c:sku": 100 }, movements: [],
  };
  products: any = { a: fixture("a", 228, "group-a", "品牌甲"), b: fixture("b", 59, "group-b", "品牌乙", false), c: fixture("c", 45, "group-a", "品牌甲") };
  trace: string[] = [];
  nextOrderId = 1;
  nextOrderNo = 1;
  suppliedOrderNos: string[] = [];
  fail = "";
  rate = 7;
  quote = { quotedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), usdtCnyRate: "7", assets: [] as MibanPaymentDeduction[] };
  expireInTransaction = false;
  tail: Promise<void> = Promise.resolve();
  debitCalls = 0;
  legacyCalls = 0;
  reserveCalls = 0;
  infrastructureCalls: boolean[] = [];

  connection() {
    const h = this; let book: any; let unlock: (() => void) | undefined;
    const tx: any = {
      async beginTransaction() {
        const previous = h.tail; h.tail = new Promise<void>(resolve => { unlock = resolve; });
        await previous; book = structuredClone(h.state); h.trace.push("begin");
      },
      async commit() { h.state = book; h.trace.push("commit"); unlock?.(); },
      async rollback() { h.trace.push("rollback"); unlock?.(); },
      release() { h.trace.push("release"); }, async end() {},
      get book() { return book ?? h.state; },
      async execute(rawSql: string, args: any[] = []) {
        const sql = rawSql.replace(/\s+/g, " ").trim(); h.trace.push(sql);
        const b = book ?? h.state;
        if (h.fail === "snapshot" && sql.startsWith("INSERT INTO miban_order_wallet_payments") && b.snapshots.length >= 3) throw new Error("snapshot failure");
        if (h.fail === "remark" && sql.startsWith("UPDATE miban_limited_stock_movements SET note")) return [{ affectedRows: 0 }];
        if (h.fail === "link" && sql.startsWith("UPDATE miban_limited_stock_movements SET order_id") && args[1] === "b") return [{ affectedRows: 0 }];
        if (h.fail === "inventory-write" && sql.startsWith("UPDATE miban_limited_sku_state") && args[1] === "b") throw new Error("inventory failure");
        if (sql.includes("FROM users")) return [[b.user]];
        if (sql.includes("SELECT is_active, stock_qty")) {
          const key = `${args[0]}:${args[1]}`;
          return [b.stock[key] === undefined ? [] : [{ stock_qty: b.stock[key], is_active: 1 }]];
        }
        if (sql.startsWith("SELECT stock_qty")) return [[{ stock_qty: b.stock[`${args[0]}:${args[1]}`] }]];
        if (sql.startsWith("UPDATE miban_limited_sku_state")) { b.stock[`${args[1]}:${args[2]}`] = args[0]; return [{ affectedRows: 1 }]; }
        if (sql.startsWith("INSERT INTO miban_limited_stock_movements")) {
          if (sql.includes("'order_deduct'")) b.movements.push({ product_key: args[0], sku_id: args[1], event_type: "order_deduct", delta_qty: args[2], note: args[6], order_id: null });
          else b.movements.push({ product_key: args[0], sku_id: args[1], event_type: args[2], delta_qty: args[3], order_id: args[6], note: args[8] });
          return [{ insertId: b.movements.length }];
        }
        if (sql.startsWith("UPDATE miban_limited_stock_movements SET note")) {
          const rows = b.movements.filter((r: any) => r.product_key === args[1] && r.sku_id === args[2] && r.event_type === "order_deduct" && r.order_id === null && r.note === args[3]);
          rows.forEach((r: any) => { r.note = args[0]; }); return [{ affectedRows: rows.length }];
        }
        if (sql.startsWith("UPDATE miban_limited_stock_movements SET order_id")) {
          const rows = b.movements.filter((r: any) => r.product_key === args[1] && r.sku_id === args[2] && r.event_type === "order_deduct" && r.order_id === null && r.note === args[3]);
          rows.forEach((r: any) => { r.order_id = args[0]; }); return [{ affectedRows: rows.length }];
        }
        if (sql.startsWith("SELECT id FROM miban_limited_stock_movements")) {
          const event = sql.includes("'cancel_restock'") ? "cancel_restock" : "order_deduct";
          return [b.movements.filter((r: any) => r.event_type === event && r.order_id === args[0] && r.product_key === args[1] && r.sku_id === args[2])];
        }
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
          if (!r || paymentDecimalUnits(add(r.available_balance, args[0])) < 0n) return [{ affectedRows: 0 }];
          r.available_balance = add(r.available_balance, args[0]); return [{ affectedRows: 1 }];
        }
        if (sql.startsWith("INSERT INTO ai_wallet_asset_entries")) { b.entries.push(args); return [{ insertId: b.entries.length }]; }
        if (sql.startsWith("INSERT INTO af_manual_balances")) { b.manual.push({ amount: args[2], note: args[3] }); return [{ insertId: b.manual.length }]; }
        if (sql.startsWith("INSERT INTO balance_history")) { b.history.push(args); return [{ insertId: b.history.length }]; }
        if (sql.startsWith("INSERT INTO miban_order_wallet_payments")) {
          b.snapshots.push({ id: b.snapshots.length + 1, order_id: args[0], user_id: args[1], asset_code: args[2], amount: args[3], price_cny: args[4], price_usdt: args[5], cny_value: args[6], quoted_at: args[7], refunded: 0 });
          return [{ insertId: b.snapshots.length }];
        }
        if (sql.startsWith("SELECT * FROM miban_order_wallet_payments")) return [b.snapshots.filter((r: any) => args.includes(r.order_id))];
        if (sql.startsWith("UPDATE miban_order_wallet_payments")) { const r = b.snapshots.find((r: any) => r.id === args[2]); if (!r || r.refunded) return [{ affectedRows: 0 }]; r.refunded = 1; return [{ affectedRows: 1 }]; }
        if (sql.startsWith("SELECT * FROM miban_orders")) return [b.orders.filter((r: any) => r.id === args[0])];
        if (sql.startsWith("SELECT id, status FROM miban_commissions")) return [b.commissions.filter((r: any) => r.order_id === args[0])];
        if (sql.startsWith("UPDATE miban_commissions")) { b.commissions.forEach((r: any) => { if (r.order_id === args[0] && r.status === "pending") r.status = "cancelled"; }); return [{ affectedRows: 1 }]; }
        if (sql.startsWith("UPDATE miban_orders")) { const r = b.orders.find((r: any) => r.id === args[0]); if (!r || r.status !== args[1]) return [{ affectedRows: 0 }]; r.status = "cancelled"; return [{ affectedRows: 1 }]; }
        throw new Error(`Unexpected isolated SQL: ${sql}`);
      },
    };
    return tx;
  }

  targets() {
    mocks.transaction.mockImplementation(async () => this.connection());
    mocks.verify.mockImplementation(() => {
      if (Date.now() >= Date.parse(this.quote.expiresAt)) throw new Error("支付报价已过期");
      return this.quote;
    });
    const dependencies = {
      TRPCError, PAYMENT_SCALE, paymentDecimalUnits, paymentUnitsText, splitMibanPaymentDeductionsByTotals,
      assertAiWalletOperationEnabled: vi.fn().mockResolvedValue(undefined),
      getMibanLimitedProduct: (key: string) => this.products[key],
      getMibanLimitedProductSku: (product: any, id: string) => product.skus.find((sku: any) => sku.id === id),
      prepareMibanWalletPayment, mibanFundingDeductionAmounts,
      ensureMibanWalletPaymentInfrastructure: async (crypto: boolean) => { this.infrastructureCalls.push(crypto); },
      getGlobalWalletFundingBalance: async (_id: number, code: string) => ({ available: Number(code === "CNY" ? this.state.user.cny_balance : this.state.user.balance) }),
      getUsdtCnyRate: async () => this.rate,
      createUniqueMibanOrderNo: async () => this.suppliedOrderNos.shift() ?? `AA${String(this.nextOrderNo++).padStart(4, "0")}`,
      getLimitedStockTransactionConnection: async () => { this.reserveCalls++; return this.connection(); },
      closeLimitedStockTransactionConnection: async () => {},
      ensureLimitedProductManagementTables: async () => this.connection(),
      mibanLimitedBrands: [{ brand: "品牌甲", title: "甲精选" }, { brand: "品牌乙", title: "乙精选" }],
      snapshotLimitedCommissionLines: async (lines: any[]) => lines.map(line => ({ ...line, commissionEligible: line.category === "eligible", commissionBaseCny: line.category === "eligible" ? line.commissionBaseCny : 0 })),
      getCommissionTriggerSnapshotForBuyer: async () => "order_confirmed",
      withGlobalWalletTransaction: async (userId: number, work: any) => withGlobalWalletTransaction(userId, async tx => {
        if (this.expireInTransaction) this.quote.expiresAt = new Date(Date.now() - 1).toISOString();
        return work(tx);
      }),
      createOrder: async (order: any, tx: any) => {
        if (this.fail === "order" && tx.book.orders.length === 1) throw new Error("order failure");
        const id = this.nextOrderId++;
        tx.book.orders.push({ ...order, id, status: "pending" });
        tx.book.commissions.push({ id, order_id: id, status: "pending" });
        return id;
      },
      debitMibanWalletPayment: async (params: any) => { this.debitCalls++; await debitMibanWalletPayment(params); },
      debitMibanLegacyCartWalletPayment: async (params: any) => { this.legacyCalls++; await debitMibanLegacyCartWalletPayment(params); },
      debitGlobalWallet,
    };
    return new Function(...Object.keys(dependencies), isolatedJs)(...Object.values(dependencies));
  }
  input(rows?: MibanPaymentDeduction[], items = [{ productKey: "a", skuId: "sku", quantity: 1 }, { productKey: "b", skuId: "sku", quantity: 1 }]) {
    if (rows) this.quote.assets = rows;
    return { items, receiverName: "测试", receiverPhone: "13800000000", receiverAddress: "测试隔离地址", cnyAmount: 0,
      ...(rows ? { paymentQuoteToken: "server-signed-single-use", paymentAssets: rows.map(({ assetCode, amount }) => ({ assetCode, amount })) } : {}) };
  }
  async checkout(input = this.input([deduction("CNY", "7", "1", "0.142857142857142857"), deduction("USDT", "10", "7"), deduction("ETH", "2.1", "100", "14.285714285714285714")])) {
    return this.targets().checkout({ input, ctx: { user: { id: 1 } } });
  }
  async cancel(orderId: number) {
    const targets = this.targets();
    const result = await withGlobalWalletTransaction(1, transaction => cancelMibanOrderWithWalletRefund({ transaction, userId: 1, orderId, actorUserId: 9 }));
    const restocked = await targets.restockLimitedOrderIfManaged(result.order, 9, "isolated cancellation");
    return { ...result, restocked };
  }
}

beforeEach(() => { vi.clearAllMocks(); mocks.connection.mockImplementation(() => { throw new Error("Real/non-injected DB access forbidden"); }); });

describe("AST-isolated cross-brand shared checkout", () => {
  it("creates price-weighted independent orders, debits each selected asset once and persists separate honest snapshots", async () => {
    const h = new Harness(); const result = await h.checkout();
    expect(result.totalCny).toBe(287); expect(result.orders.map((r: any) => r.totalCny)).toEqual([228, 59]);
    expect(result.orders.map((r: any) => r.groupLabel)).toEqual(["甲精选", "乙精选"]);
    expect(result.orderId).toBe(result.orders[0].orderId); expect(result.orderNo).toBe(result.orders[0].orderNo);
    expect(result.signedRate).toBe("7"); expect(result.itemCount).toBe(2); expect(result.totalQuantity).toBe(2);
    expect(h.debitCalls).toBe(1); expect(h.legacyCalls).toBe(0); expect(h.state.uses).toHaveLength(1);
    expect(h.state.manual).toHaveLength(2); expect(h.state.entries).toHaveLength(1); expect(h.state.snapshots).toHaveLength(6);
    expect(h.state.balances.ETH).toEqual({ available_balance: "7.9", frozen_balance: "8" });
    expect(h.state.orders.map((r: any) => r.commissionTrigger)).toEqual(["order_confirmed", "not_eligible"]);
    for (const order of h.state.orders) {
      const lines = JSON.parse(order.ingredients); expect(lines).toHaveLength(1);
      expect(lines[0].productKey).toBe(order.id === result.orderId ? "a" : "b");
      expect(h.targets().getLimitedOrderCommissionBaseCny(order)).toBe(order.id === result.orderId ? 228 : 0);
      const movements = h.state.movements.filter((r: any) => r.order_id === order.id);
      expect(movements).toHaveLength(1); expect(movements[0].note).toBe(`用户合单扣减库存 #${order.orderNo}`);
    }
    expect(result.orders[0].walletPayments.find((r: any) => r.assetCode === "ETH").amount).not.toBe("1.05");
    for (const original of result.walletPayments) {
      const rows = h.state.snapshots.filter((r: any) => r.asset_code === original.assetCode);
      expect(paymentUnitsText(rows.reduce((sum: bigint, r: any) => sum + paymentDecimalUnits(r.amount), 0n))).toBe(original.amount);
      for (const row of rows) {
        expect(row.price_cny).toBe(original.priceCny); expect(row.price_usdt).toBe(original.priceUsdt);
        expect(row.cny_value).toBe(paymentUnitsText(paymentDecimalUnits(row.amount) * paymentDecimalUnits(row.price_cny) / PAYMENT_SCALE));
      }
    }
    expect(h.trace.some(sql => /CREATE TABLE|ALTER TABLE/.test(sql))).toBe(false);
    expect(mocks.connection).not.toHaveBeenCalled();
  });

  it("cancels only one group, refunds its original assets and restocks only linked group; replay is idempotent", async () => {
    const h = new Harness(); const result = await h.checkout();
    const first = result.orders[0]; const second = result.orders[1];
    const beforeEth = h.state.balances.ETH.available_balance;
    const ethShare = first.walletPayments.find((r: any) => r.assetCode === "ETH").amount;
    const refund = await h.cancel(first.orderId);
    expect(refund.alreadyCancelled).toBe(false); expect(refund.restocked).toBe(true);
    expect(h.state.balances.ETH.available_balance).toBe(add(beforeEth, ethShare));
    expect(h.state.stock).toMatchObject({ "a:sku": 100, "b:sku": 99 });
    expect(h.state.orders.find((r: any) => r.id === second.orderId).status).toBe("pending");
    expect(h.state.snapshots.filter((r: any) => r.order_id === second.orderId).every((r: any) => r.refunded === 0)).toBe(true);
    const after = structuredClone(h.state); const replay = await h.cancel(first.orderId);
    expect(replay.alreadyCancelled).toBe(true); expect(replay.restocked).toBe(false); expect(h.state).toEqual(after);
    await h.cancel(second.orderId);
    expect(h.state.stock).toMatchObject({ "a:sku": 100, "b:sku": 100 });
    expect(h.state.balances.ETH).toEqual({ available_balance: "10", frozen_balance: "8" });
    expect(h.state.manual.reduce((sum: bigint, r: any) => sum + paymentDecimalUnits(r.amount), 0n)).toBe(0n);
  });

  it.each(["order", "link", "remark", "snapshot"])("rolls back all orders/coins/snapshots and releases the entire reserved cart after %s failure", async failure => {
    const h = new Harness(); h.fail = failure;
    await expect(h.checkout()).rejects.toThrow();
    expect(h.state.orders).toEqual([]); expect(h.state.uses).toEqual([]); expect(h.state.snapshots).toEqual([]);
    expect(h.state.manual).toEqual([]); expect(h.state.entries).toEqual([]);
    expect(h.state.stock).toMatchObject({ "a:sku": 100, "b:sku": 100 });
    expect(h.state.balances.ETH.available_balance).toBe("10");
    expect(h.state.movements.filter((r: any) => r.event_type === "order_rollback")).toHaveLength(2);
    expect(h.state.movements.filter((r: any) => r.event_type === "order_deduct").every((r: any) => r.order_id === null)).toBe(true);
  });

  it("checks all balances before any debit, rolling back both orders and releasing stocks if crypto availability changed", async () => {
    const h = new Harness(); h.state.balances.ETH.available_balance = "2";
    await expect(h.checkout()).rejects.toThrow("可用余额不足");
    expect(h.state.manual).toEqual([]); expect(h.state.orders).toEqual([]); expect(h.state.uses).toEqual([]);
    expect(h.state.stock["a:sku"]).toBe(100); expect(h.state.stock["b:sku"]).toBe(100);
  });

  it("atomically rejects insufficient/inactive inventory before order creation and never partially reserves on a stock write failure", async () => {
    const h = new Harness(); h.state.stock["b:sku"] = 0;
    await expect(h.checkout()).rejects.toThrow("库存不足"); expect(h.state.stock["a:sku"]).toBe(100); expect(h.state.movements).toEqual([]);
    h.state.stock["b:sku"] = 100; h.fail = "inventory-write";
    await expect(h.checkout()).rejects.toThrow("inventory failure"); expect(h.state.stock["a:sku"]).toBe(100); expect(h.state.orders).toEqual([]);
    h.fail = ""; delete h.state.stock["b:sku"];
    await expect(h.checkout()).rejects.toThrow("已下架"); expect(h.state.movements).toEqual([]);
  });

  it("one successful quote cannot create or debit again, including simultaneous full checkout requests", async () => {
    const h = new Harness(); const input = h.input([deduction("USDT", "41", "7")]);
    const results = await Promise.allSettled([h.checkout(input), h.checkout(input)]);
    expect(results.map(r => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(h.state.orders).toHaveLength(2); expect(h.state.uses).toHaveLength(1); expect(h.state.manual).toHaveLength(1);
    expect(h.state.stock["a:sku"]).toBe(99); expect(h.state.stock["b:sku"]).toBe(99);
    await expect(h.checkout(input)).rejects.toThrow("已成功使用");
    expect(h.state.orders).toHaveLength(2); expect(h.state.manual).toHaveLength(1); expect(h.state.stock["b:sku"]).toBe(99);
  });

  it("rechecks quote expiry inside the locked transaction after reservations and rolls back the entire checkout", async () => {
    const h = new Harness(); h.expireInTransaction = true;
    await expect(h.checkout()).rejects.toThrow("过期");
    expect(h.state.orders).toEqual([]); expect(h.state.uses).toEqual([]); expect(h.state.stock["a:sku"]).toBe(100);
  });

  it("legacy two-wallet cross-group checkout uses one exact 8-digit U debit, price snapshots and conserving refunds", async () => {
    const h = new Harness(); h.rate = 7.03;
    const input = h.input(); input.cnyAmount = 0.01;
    const result = await h.checkout(input);
    expect(h.legacyCalls).toBe(1); expect(h.debitCalls).toBe(0); expect(h.state.uses).toEqual([]);
    expect(h.state.manual).toHaveLength(2); expect(h.state.snapshots).toHaveLength(3);
    expect(h.infrastructureCalls).toEqual([false]);
    const u = result.walletPayments.find((r: any) => r.assetCode === "USDT");
    expect(u.priceCny).toBe("7.0300"); expect(u.priceUsdt).toBe("1");
    expect(paymentDecimalUnits(u.amount) % (10n ** 10n)).toBe(0n);
    expect(paymentDecimalUnits(u.cnyValue) + paymentDecimalUnits("0.01")).toBeGreaterThanOrEqual(paymentDecimalUnits(287));
    expect(paymentDecimalUnits(u.cnyValue) + paymentDecimalUnits("0.01") - paymentDecimalUnits(287)).toBeLessThan(paymentDecimalUnits("0.01"));
    for (const code of ["CNY", "USDT"]) {
      const amount = result.walletPayments.find((r: any) => r.assetCode === code).amount;
      const shares = result.orders.flatMap((r: any) => r.walletPayments).filter((r: any) => r.assetCode === code);
      expect(paymentUnitsText(shares.reduce((sum: bigint, r: any) => sum + paymentDecimalUnits(r.amount), 0n))).toBe(amount);
    }
    await h.cancel(result.orders[1].orderId); expect(h.state.stock["a:sku"]).toBe(99); expect(h.state.stock["b:sku"]).toBe(100);
    await h.cancel(result.orders[0].orderId);
    expect(h.state.manual.reduce((sum: bigint, r: any) => sum + paymentDecimalUnits(r.amount), 0n)).toBe(0n);
    expect(h.state.manual.some((r: any) => /ETH|BTC/.test(r.note))).toBe(false);
  });

  it("pure-U 228+59 at a nondivisible rate succeeds without per-group ceil or extra native debit", async () => {
    const h = new Harness(); h.rate = 7.03;
    const result = await h.checkout(h.input());
    expect(h.state.manual).toHaveLength(1); expect(h.legacyCalls).toBe(1);
    const total = result.walletPayments[0].amount;
    expect(paymentUnitsText(result.orders.reduce((sum: bigint, r: any) => sum + paymentDecimalUnits(r.walletPayments[0].amount), 0n))).toBe(total);
    expect(result.orders.map((r: any) => r.totalCny)).toEqual([228, 59]);
  });

  it("signed pure-U nondivisible payment keeps one native debit and signed prices even when live rates are unavailable", async () => {
    const h = new Harness(); h.quote.usdtCnyRate = "7.03"; h.rate = Number.NaN;
    const step = 10n ** 10n;
    const numerator = paymentDecimalUnits(287) * PAYMENT_SCALE;
    const denominator = paymentDecimalUnits("7.03") * step;
    const amount = paymentUnitsText((numerator + denominator - 1n) / denominator * step);
    const result = await h.checkout(h.input([deduction("USDT", amount, "7.03")]));
    expect(h.debitCalls).toBe(1); expect(h.state.manual).toHaveLength(1); expect(h.state.uses).toHaveLength(1);
    expect(result.signedRate).toBe("7.03"); expect(result.walletPayments[0].amount).toBe(amount);
    expect(paymentUnitsText(result.orders.reduce((sum: bigint, order: any) => sum + paymentDecimalUnits(order.walletPayments[0].amount), 0n))).toBe(amount);
    for (const order of result.orders) {
      const value = paymentDecimalUnits(order.walletPayments[0].cnyValue);
      const difference = value - paymentDecimalUnits(order.totalCny);
      expect(difference < 0n ? -difference : difference).toBeLessThan(paymentDecimalUnits("0.01"));
      expect(order.walletPayments[0].priceCny).toBe("7.03");
    }
  });

  it("same-group multi-line native and legacy paths remain one order with their original quantities/prices", async () => {
    const items = [{ productKey: "a", skuId: "sku", quantity: 2 }, { productKey: "c", skuId: "sku", quantity: 1 }];
    const h = new Harness(); const result = await h.checkout(h.input([deduction("USDT", "71.57142858", "7")], items));
    expect(result.orders).toHaveLength(1); expect(result.totalCny).toBe(501); expect(result.totalQuantity).toBe(3);
    expect(result.orders[0].itemCount).toBe(2); expect(JSON.parse(h.state.orders[0].ingredients)).toHaveLength(2); expect(h.debitCalls).toBe(1);
    const old = new Harness(); old.rate = 7.03; const legacy = await old.checkout(old.input(undefined, items));
    expect(legacy.orders).toHaveLength(1); expect(legacy.deductUsdt).toBe(Number((501 / 7.03).toFixed(8)));
    expect(old.legacyCalls).toBe(0); expect(old.debitCalls).toBe(0); expect(old.infrastructureCalls).toEqual([]); expect(old.state.snapshots).toEqual([]);
  });

  it("fallback product key isolates products lacking checkoutGroupKey and deduplicates batch-generated order numbers", async () => {
    const h = new Harness(); delete h.products.a.checkoutGroupKey; delete h.products.b.checkoutGroupKey;
    h.suppliedOrderNos = ["ZZ1111", "ZZ1111", "ZZ1112"];
    const result = await h.checkout();
    expect(result.orders.map((r: any) => r.checkoutGroupKey)).toEqual(["a", "b"]);
    expect(result.orders.map((r: any) => r.orderNo)).toEqual(["ZZ1111", "ZZ1112"]);
  });

  it("server catalog prices are authoritative and duplicate/inactive/max-quantity checks run before reservation", async () => {
    const h = new Harness();
    const duplicate = h.input(undefined, [{ productKey: "a", skuId: "sku", quantity: 1 }, { productKey: "a", skuId: "sku", quantity: 1 }]);
    await expect(h.checkout(duplicate)).rejects.toThrow("重复商品"); expect(h.reserveCalls).toBe(0);
    h.products.b.skus[0].active = false;
    await expect(h.checkout()).rejects.toThrow("规格不可购买"); expect(h.reserveCalls).toBe(0);
    h.products.b.skus[0].active = true; h.products.a.skus[0].maxPurchaseQty = 0;
    await expect(h.checkout()).rejects.toThrow("单笔最多"); expect(h.reserveCalls).toBe(0);
    h.products.a.skus[0].maxPurchaseQty = 10; h.products.b.status = "off_sale";
    await expect(h.checkout()).rejects.toThrow("暂未上架"); expect(h.reserveCalls).toBe(0);
    h.products.b.status = "on_sale"; h.products.b.skus[0].priceCny = 60;
    await expect(h.checkout()).rejects.toThrow("支付金额不足"); expect(h.reserveCalls).toBe(0);
  });

  it("rejects fractional legacy CNY cents in cross-group input rather than silently changing the requested quantity", async () => {
    const h = new Harness(); const input = h.input(); input.cnyAmount = 0.001;
    await expect(h.checkout(input)).rejects.toThrow("两位小数"); expect(h.reserveCalls).toBe(0);
  });
});
