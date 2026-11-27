import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { mibanInvoiceRequestSchema, type MibanInvoiceRequest } from "../shared/miban-invoice";
import { mibanReceiverPhoneSchema } from "../shared/miban-shipping";
import { PAYMENT_SCALE, paymentDecimalUnits, paymentUnitsText, splitMibanPaymentDeductions } from "../shared/miban-wallet-payment";
import { splitMibanPaymentDeductionsByTotals } from "../shared/miban-cart-checkout";
import { MIDANIANG_ANNUAL_MONTHS, getMidaniangAnnualShipDates } from "./midaniang-annual-plan";

// Never import miban, app routers, SDK or real DB. Only isolated primitives use mocked connections.
const mocks = vi.hoisted(() => ({ connection: vi.fn(), transaction: vi.fn() }));
vi.mock("./db", () => ({ getDbConnection: mocks.connection, getDbTransactionConnection: mocks.transaction }));
import { debitGlobalWallet, withGlobalWalletTransaction } from "./wallet-funding-guard";
import { insertMibanOrderInvoiceRequest, readMibanOrderInvoiceRequests } from "./miban-order-invoice";

const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("miban.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function route(routerName: string, routeName: string) {
  for (const node of ast.statements) if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      if (declaration.name.getText(ast) !== routerName || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
      const object = declaration.initializer.arguments[0];
      if (!ts.isObjectLiteralExpression(object)) continue;
      const entry = object.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(ast) === routeName);
      if (entry && ts.isPropertyAssignment(entry)) return entry.initializer.getText(ast);
    }
  }
  throw new Error(`Missing isolated procedure: ${routerName}.${routeName}`);
}
const stockHelpers = ["reserveLimitedSkuStock", "reserveLimitedSkuStocks", "linkLimitedStockDeductionToOrder", "linkLimitedStockDeductionsToOrder", "releaseLimitedSkuStock", "releaseLimitedSkuStocks"]
  .map(name => {
    const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (!node) throw new Error(`Missing isolated stock helper: ${name}`);
    return node.getText(ast);
  }).join("\n");
function evaluate(text: string, bindings: Record<string, unknown>): any {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const context = vm.createContext(bindings, { codeGeneration: { strings: false, wasm: false } });
  return new vm.Script(js).runInContext(context, { timeout: 1000 });
}
const personal: MibanInvoiceRequest = { type: "personal", title: "离线测试个人" };
const company: MibanInvoiceRequest = { type: "company", title: "离线测试公司", taxNo: "非18位-123" };
const products = {
  a: { key: "a", brand: "品牌甲", category: "测试", status: "on_sale", checkoutGroupKey: "a", detail: { title: "甲商品", productImage: "test.png" }, card: { theme: { accent: "#000" } } },
  b: { key: "b", brand: "品牌乙", category: "测试", status: "on_sale", checkoutGroupKey: "b", detail: { title: "乙商品", productImage: "test.png" }, card: { theme: { accent: "#000" } } },
  "midaniang-classic-rice-gift": { key: "midaniang-classic-rice-gift", brand: "米大娘", category: "测试", status: "on_sale", detail: { title: "年付商品", productImage: "test.png" }, card: { theme: { accent: "#000" } } },
};
const sku = { id: "sku", active: true, priceCny: 10, maxPurchaseQty: 10, quantityPerOrder: 1, unitLabel: "盒", netContentText: "测试", name: "测试规格" };
const paths = ["order.create", "limitedProduct.createOrder", "limitedProduct.createAnnualOrder", "limitedProduct.createCartOrder"] as const;
type CheckoutPath = typeof paths[number];
class Harness {
  state: any = { orders: [], invoices: [], manual: [], history: [], stock: { "a:sku": 100, "b:sku": 100, "midaniang-classic-rice-gift:sku": 100 }, movements: [] };
  trace: string[] = [];
  txs: any[] = [];
  failInvoiceAt = 0;
  failInfrastructure = false;
  failDebit = false;
  infraCalls = 0;
  nextId = 0;
  nextNo = 0;
  connection() {
    const h = this;
    let pending: any;
    const tx: any = {
      get book() { return pending ?? h.state; },
      async beginTransaction() { pending = structuredClone(h.state); h.trace.push("begin"); },
      async commit() { h.state = pending; h.trace.push("commit"); },
      async rollback() { h.trace.push("rollback"); },
      release() { h.trace.push("release"); },
      async execute(raw: string, args: any[] = []) {
        const sql = raw.replace(/\s+/g, " ").trim(); h.trace.push(sql);
        const b = tx.book;
        if (sql.includes("FROM users")) return [[{ id: 1, balance: "1000", cny_balance: "1000" }]];
        if (sql.startsWith("SELECT amount FROM af_manual_balances")) return [b.manual.filter((r: any) => sql.includes("NOT LIKE") ? !r.note.startsWith("[CNY]") : r.note.startsWith("[CNY]"))];
        if (sql.includes("FROM ai_wallet_project_holds")) return [[]];
        if (sql.startsWith("SELECT ledger_id")) return [[{ ledger_id: 52 }]];
        if (sql.startsWith("INSERT INTO af_manual_balances")) { b.manual.push({ amount: args[2], note: args[3] }); return [{ insertId: b.manual.length }]; }
        if (sql.startsWith("INSERT INTO balance_history")) { b.history.push(args); return [{ affectedRows: 1 }]; }
        if (sql.startsWith("INSERT INTO miban_order_invoice_requests")) {
          if (args[0] === h.failInvoiceAt) throw new Error("fixture invoice failure");
          b.invoices.push(args); h.txs.push(tx); return [{ affectedRows: 1 }];
        }
        if (sql.startsWith("SELECT is_active, stock_qty")) return [[{ is_active: 1, stock_qty: b.stock[`${args[0]}:${args[1]}`] }]];
        if (sql.startsWith("SELECT stock_qty")) return [[{ stock_qty: b.stock[`${args[0]}:${args[1]}`] }]];
        if (sql.startsWith("UPDATE miban_limited_sku_state")) {
          const key = `${args[1]}:${args[2]}`;
          b.stock[key] = sql.includes("stock_qty - ?") ? b.stock[key] - args[0] : args[0];
          return [{ affectedRows: 1 }];
        }
        if (/^INSERT(?: IGNORE)? INTO miban_limited_stock_movements/.test(sql)) {
          const deduction = sql.includes("'order_deduct'");
          b.movements.push({ product_key: args[0], sku_id: args[1], event_type: deduction ? "order_deduct" : args[2], order_id: deduction ? null : args[6], note: deduction ? args[6] : args[8] });
          return [{ insertId: b.movements.length }];
        }
        if (sql.startsWith("UPDATE miban_limited_stock_movements")) {
          const rows = b.movements.filter((r: any) => r.product_key === args[1] && r.sku_id === args[2] && r.event_type === "order_deduct" && r.order_id === null && r.note === args[3]);
          for (const row of rows) if (sql.includes("SET note")) row.note = args[0]; else row.order_id = args[0];
          return [{ affectedRows: rows.length }];
        }
        throw new Error(`Unexpected isolated SQL: ${sql}`);
      },
    };
    return tx;
  }
  procedure(path: CheckoutPath | "limitedProduct.invoiceSupport") {
    const h = this;
    mocks.transaction.mockImplementation(async () => h.connection());
    const procedureBuilder = {
      input(schema: z.ZodType) { return { mutation: (handler: any) => ({ schema, handler }) }; },
      query(handler: any) { return { handler }; },
    };
    const dependencies = {
      z, protectedProcedure: procedureBuilder, TRPCError, mibanReceiverPhoneSchema, mibanInvoiceRequestSchema,
      PAYMENT_SCALE, paymentDecimalUnits, paymentUnitsText, splitMibanPaymentDeductions, splitMibanPaymentDeductionsByTotals,
      MIDANIANG_ANNUAL_MONTHS, getMidaniangAnnualShipDates,
      randomUUID: () => "11111111-2222-3333-4444-555555555555", console: { log() {}, warn() {} },
      assertAiWalletOperationEnabled: async () => {},
      getMibanLimitedProduct: (key: keyof typeof products) => products[key],
      getMibanLimitedProductSku: (_product: any, id: string) => id === sku.id ? sku : null,
      prepareMibanWalletPayment: ({ paymentAssets }: any) => paymentAssets ? { usdtCnyRate: "10", deductions: paymentAssets.map((r: any) => ({ ...r, priceCny: "1", priceUsdt: "0.1", cnyValue: r.amount })) } : null,
      mibanFundingDeductionAmounts: (rows: any[]) => ({ cnyAmount: rows.find(r => r.assetCode === "CNY")?.amount ?? "0", usdtAmount: rows.find(r => r.assetCode === "USDT")?.amount ?? "0" }),
      ensureMibanWalletPaymentInfrastructure: async () => {},
      ensureMibanOrderInvoiceInfrastructure: async () => { h.infraCalls++; h.trace.push("invoice-infrastructure"); if (h.failInfrastructure) throw new Error("fixture invoice initialization failure"); },
      insertMibanOrderInvoiceRequest,
      getGlobalWalletFundingBalance: async () => ({ available: 1000 }), getUsdtCnyRate: async () => 10,
      getDbConnection: async () => ({ execute: async () => [[]] }),
      createUniqueMibanOrderNo: async () => `AA${String(++h.nextNo).padStart(4, "0")}`,
      getLimitedStockTransactionConnection: async () => h.connection(), closeLimitedStockTransactionConnection: async () => {},
      snapshotLimitedCommissionLines: async (rows: any[]) => rows.map(row => ({ ...row, commissionEligible: true })),
      getCommissionTriggerSnapshotForBuyer: async () => "order_confirmed",
      mibanLimitedBrands: [{ brand: "品牌甲", title: "甲" }, { brand: "品牌乙", title: "乙" }],
      withGlobalWalletTransaction,
      createOrder: async (data: any, transaction: any) => { const id = ++h.nextId; transaction.book.orders.push({ ...data, id }); return id; },
      debitGlobalWallet,
      debitMibanWalletPayment: async ({ transaction, userId, payment }: any) => {
        await debitGlobalWallet({ transaction, userId, cnyAmount: Number(payment.deductions.find((r: any) => r.assetCode === "CNY")?.amount ?? 0), usdtAmount: 0, note: "fixture signed payment" });
        if (h.failDebit) throw new Error("fixture failure after debit");
      },
      debitMibanLegacyCartWalletPayment: async ({ transaction, userId, deductions }: any) => {
        await debitGlobalWallet({ transaction, userId, cnyAmount: Number(deductions.find((r: any) => r.assetCode === "CNY")?.amount ?? 0), usdtAmount: 0, note: "fixture legacy payment" });
      },
    };
    const [routerName, routeName] = path.split(".");
    return evaluate(`${stockHelpers}\n(${route(routerName === "order" ? "mibanOrderRouter" : "mibanLimitedProductRouter", routeName)});`, dependencies);
  }
  input(path: CheckoutPath, request?: unknown, months?: number, oneGroup = false, legacy = false): any {
    const base = { receiverName: "离线测试", receiverPhone: "13800138000", receiverAddress: "离线测试地址，不发货", cnyAmount: 10, ...(request === undefined ? {} : { invoiceRequest: request }) };
    if (path === "order.create") return { ...base, recipeName: "测试米", ingredients: [], totalWeightJin: 1, totalPrice: 10, ...(months ? { subscriptionMonths: months, cnyAmount: 10 * months } : {}) };
    if (path === "limitedProduct.createAnnualOrder") return { ...base, productKey: "midaniang-classic-rice-gift", skuId: "sku", quantity: 1, cnyAmount: 120, paymentAssets: [{ assetCode: "CNY", amount: "120" }], paymentQuoteToken: "test-fixture-not-a-real-quote" };
    if (path === "limitedProduct.createOrder") return { ...base, productKey: "a", skuId: "sku", quantity: 1 };
    return { ...base, cnyAmount: oneGroup ? 10 : 20, items: oneGroup ? [{ productKey: "a", skuId: "sku", quantity: 1 }] : [{ productKey: "a", skuId: "sku", quantity: 1 }, { productKey: "b", skuId: "sku", quantity: 1 }], ...(legacy ? {} : { paymentAssets: [{ assetCode: "CNY", amount: oneGroup ? "10" : "20" }], paymentQuoteToken: "test-fixture-not-a-real-quote" }) };
  }
  async checkout(path: CheckoutPath, request?: unknown, months?: number, oneGroup = false, legacy = false) {
    const procedure = this.procedure(path);
    return procedure.handler({ input: procedure.schema.parse(this.input(path, request, months, oneGroup, legacy)), ctx: { user: { id: 1 } } });
  }
}
beforeEach(() => { vi.clearAllMocks(); mocks.connection.mockImplementation(() => { throw new Error("Real DB access forbidden"); }); });

const scenarios = [
  { path: "order.create", count: 1 },
  { path: "order.create", count: 3, months: 3 },
  { path: "order.create", count: 12, months: 12 },
  { path: "limitedProduct.createOrder", count: 1 },
  { path: "limitedProduct.createAnnualOrder", count: 12 },
  { path: "limitedProduct.createCartOrder", count: 1, oneGroup: true },
  { path: "limitedProduct.createCartOrder", count: 2 },
  { path: "limitedProduct.createCartOrder", count: 2, legacy: true },
] as const;
describe("actual AST checkout routes / invoice requests / original transaction", () => {
  it.each(scenarios)("$path stores an invoice for all $count real child orders", async scenario => {
    const h = new Harness();
    await h.checkout(scenario.path, company, "months" in scenario ? scenario.months : undefined, "oneGroup" in scenario, "legacy" in scenario);
    expect(h.state.orders).toHaveLength(scenario.count);
    expect(h.state.invoices).toHaveLength(scenario.count);
    expect(h.state.invoices.map((row: any[]) => row[0])).toEqual(h.state.orders.map((o: any) => o.id));
    expect(h.state.invoices.every((row: any[]) => row.slice(1).join("|") === [1, "company", company.title, company.taxNo].join("|"))).toBe(true);
    expect(new Set(h.txs).size).toBe(1);
    expect(h.trace.indexOf("invoice-infrastructure")).toBeLessThan(h.trace.indexOf("begin"));
    expect(h.trace.some(sql => /CREATE|ALTER/.test(sql))).toBe(false);
    expect(h.state.manual).toHaveLength(1);
    expect(mocks.connection).not.toHaveBeenCalled();
  });
  it.each(scenarios)("$path rolls back all $count child orders and releases every reserved SKU when last invoice fails", async scenario => {
    const h = new Harness(); h.failInvoiceAt = scenario.count;
    const stockBefore = structuredClone(h.state.stock);
    await expect(h.checkout(scenario.path, company, "months" in scenario ? scenario.months : undefined, "oneGroup" in scenario, "legacy" in scenario)).rejects.toThrow("发票申请保存失败");
    expect(h.state.orders).toEqual([]); expect(h.state.invoices).toEqual([]); expect(h.state.manual).toEqual([]); expect(h.state.history).toEqual([]);
    expect(h.state.stock).toEqual(stockBefore);
    expect(h.trace).toContain("rollback");
    expect(h.state.movements.filter((r: any) => r.order_id !== null)).toEqual([]);
    expect(mocks.connection).not.toHaveBeenCalled();
  });
  it.each(paths)("%s rejects invalid personal/company fields at its actual zod boundary, before all side effects", async path => {
    for (const request of [{ type: "personal", title: " " }, { type: "personal", title: "\n姓名" }, { type: "personal", title: "名".repeat(201) }, { type: "company", title: "公司" }, { type: "company", title: "公司", taxNo: "\u0085税号" }, { type: "company", title: "公司", taxNo: "A".repeat(101) }]) {
      const h = new Harness(); await expect(h.checkout(path, request)).rejects.toThrow();
      expect(h.infraCalls).toBe(0); expect(h.trace).toEqual([]); expect(h.state.orders).toEqual([]);
    }
  });
  it.each(paths)("%s keeps omitted request off without probing or inserting", async path => {
    const h = new Harness(); await h.checkout(path);
    expect(h.infraCalls).toBe(0); expect(h.state.invoices).toEqual([]);
    expect(h.trace.some(sql => sql.includes("miban_order_invoice_requests"))).toBe(false);
    expect(mocks.connection).not.toHaveBeenCalled();
  });
  it.each(paths)("%s fails invoice infrastructure before inventory reservation or wallet transaction", async path => {
    const h = new Harness(); h.failInfrastructure = true;
    await expect(h.checkout(path, personal)).rejects.toThrow("invoice initialization failure");
    expect(h.trace).toEqual(["invoice-infrastructure"]); expect(h.state.orders).toEqual([]); expect(h.state.manual).toEqual([]);
  });
  it.each(paths)("%s discards personal stale company taxNo", async path => {
    const h = new Harness(); await h.checkout(path, { ...personal, taxNo: "stale\ncompany" });
    expect(h.state.invoices.every((row: any[]) => row[2] === "personal" && row[3] === personal.title && row[4] === null)).toBe(true);
  });
  it("rolls back existing invoice inserts, wallet debits and all 12 orders on later payment failure", async () => {
    const h = new Harness(); h.failDebit = true; const stock = structuredClone(h.state.stock);
    await expect(h.checkout("limitedProduct.createAnnualOrder", company)).rejects.toThrow("failure after debit");
    expect(h.trace.some(sql => sql.startsWith("INSERT INTO af_manual_balances"))).toBe(true);
    expect(h.state.orders).toEqual([]); expect(h.state.invoices).toEqual([]); expect(h.state.manual).toEqual([]); expect(h.state.stock).toEqual(stock);
  });
  it("the authenticated support probe reports support only after successful infrastructure validation", async () => {
    const h = new Harness(); const procedure = h.procedure("limitedProduct.invoiceSupport");
    await expect(procedure.handler()).resolves.toEqual({ supported: true, version: 1 });
    expect(h.infraCalls).toBe(1); expect(h.trace).toEqual(["invoice-infrastructure"]);
    h.failInfrastructure = true; await expect(procedure.handler()).rejects.toThrow("invoice initialization failure");
  });
  it("legacy CartDrawer uses the covered order.create, with no separate cart checkout or fake Moutai orders", () => {
    const cart = readFileSync(new URL("../client/src/pages/miban/CartDrawer.tsx", import.meta.url), "utf8");
    expect(cart).toContain("mtrpc.order.create.useMutation(");
    const cartRouter = source.slice(source.indexOf("export const mibanCartRouter"), source.indexOf("export const mibanImpersonateRouter"));
    expect(cartRouter).not.toMatch(/checkout:|createOrder:/);
    expect(source.match(/invoiceRequest: mibanInvoiceRequestSchema\.optional\(\)/g)).toHaveLength(4);
    expect(source).not.toContain("MoutaiWalletPayment");
  });
});

describe("actual AST user/admin order read enrichment", () => {
  function readers(error?: unknown) {
    const orders = [{ id: 7, userId: 1, createdAt: "2026-11-27" }];
    const conn = {
      execute: vi.fn(async (sql: string) => {
        if (sql.includes("FROM miban_order_invoice_requests")) {
          if (error) throw error;
          return [[{ order_id: 7, invoice_type: "personal", invoice_title: personal.title, tax_no: "stale" }]];
        }
        if (sql.includes("FROM miban_orders")) return [orders];
        return [[]];
      }),
      end: vi.fn(async () => {}),
    };
    mocks.connection.mockResolvedValue(conn);
    const query: any = { from: () => query, where: vi.fn(() => query), orderBy: async () => orders };
    const declarations = ["getUserOrders", "getAllOrders"].map(name => {
      const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
      if (!node) throw new Error(`Missing reader ${name}`);
      return node.getText(ast);
    }).join("\n");
    const targets = evaluate(`${declarations}\n({ getUserOrders, getAllOrders });`, {
      getDb: async () => ({ select: () => query }), getDbConnection: async () => conn,
      mibanOrders: { userId: "userId", createdAt: "createdAt" }, eq: (...args: any[]) => args, desc: (value: any) => value,
      serializeOrder: (order: any) => order, readMibanOrderWalletPayments: async () => new Map(),
      readMibanOrderInvoiceRequests, mibanLimitedProducts: [], readLimitedProductLines: () => [],
    });
    return { targets, conn, query };
  }
  it("enriches owned user rows and authorized admin rows, without DDL or invoice fields inside ingredients", async () => {
    const h = readers();
    for (const rows of [await h.targets.getUserOrders(1), await h.targets.getAllOrders()]) {
      expect(rows[0].invoiceRequest).toEqual(personal);
      expect(rows[0].walletPayments).toEqual([]);
    }
    expect(h.query.where).toHaveBeenCalledWith(["userId", 1]);
    const invoiceCalls = h.conn.execute.mock.calls.filter(([sql]) => sql.includes("FROM miban_order_invoice_requests"));
    expect(invoiceCalls).toHaveLength(2);
    expect(h.conn.execute.mock.calls.some(([sql]) => /CREATE|ALTER/.test(sql))).toBe(false);
  });
  it("historical missing invoice table returns null on both existing read interfaces", async () => {
    const h = readers(Object.assign(new Error("fixture table absent"), { code: "ER_NO_SUCH_TABLE" }));
    expect((await h.targets.getUserOrders(1))[0].invoiceRequest).toBeNull();
    expect((await h.targets.getAllOrders())[0].invoiceRequest).toBeNull();
  });
  it.each(["ER_TABLEACCESS_DENIED_ERROR", "ECONNRESET"])("%s cannot become a successful empty invoice response", async code => {
    const h = readers(Object.assign(new Error("fixture query failure"), { code }));
    await expect(h.targets.getUserOrders(1)).rejects.toThrow("发票申请暂时无法读取");
    await expect(h.targets.getAllOrders()).rejects.toThrow("发票申请暂时无法读取");
    expect(h.conn.end).toHaveBeenCalledTimes(2);
  });
});
