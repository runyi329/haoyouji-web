import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mibanInvoiceRequestSchema, type MibanInvoiceRequest } from "../shared/miban-invoice";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), transaction: vi.fn() }));
vi.mock("./db", () => ({ getDbConnection: mocks.connection, getDbTransactionConnection: mocks.transaction }));
import { insertMibanOrderInvoiceRequest, readMibanOrderInvoiceRequests } from "./miban-order-invoice";
import { withGlobalWalletTransaction } from "./wallet-funding-guard";

const personal: MibanInvoiceRequest = { type: "personal", title: "个人姓名" };
const company: MibanInvoiceRequest = { type: "company", title: "示例公司", taxNo: "旧税号-123456789012345" };
beforeEach(() => { mocks.connection.mockReset(); mocks.transaction.mockReset(); });

describe("shared invoice request contract", () => {
  it("is off by omission, trims fields and removes stale personal tax numbers", () => {
    expect(mibanInvoiceRequestSchema.optional().parse(undefined)).toBeUndefined();
    expect(mibanInvoiceRequestSchema.parse({ ...personal, title: "  个人姓名  ", taxNo: "不应保存", email: "ignored" }))
      .toEqual(personal);
    expect(mibanInvoiceRequestSchema.parse({ type: "company", title: "  示例公司  ", taxNo: `  ${company.taxNo}  ` })).toEqual(company);
  });
  it("requires a nonblank title and a company tax number, without an eighteen-digit-only rule", () => {
    for (const request of [
      { type: "personal", title: "  " },
      { type: "company", title: "示例公司" },
      { type: "company", title: "示例公司", taxNo: "  " },
      { type: "other", title: "姓名" },
    ]) expect(mibanInvoiceRequestSchema.safeParse(request).success).toBe(false);
    for (const taxNo of ["123456789012345", "91310000XXXXXXXXXX", "非18位税号-123"])
      expect(mibanInvoiceRequestSchema.safeParse({ ...company, taxNo }).success).toBe(true);
  });
  it("rejects overlong fields and control characters before trimming", () => {
    expect(mibanInvoiceRequestSchema.safeParse({ ...personal, title: "名".repeat(201) }).success).toBe(false);
    expect(mibanInvoiceRequestSchema.safeParse({ ...company, taxNo: "A".repeat(101) }).success).toBe(false);
    for (const control of ["\u0000", "\t", "\n", "\u007f", "\u0085"]) {
      expect(mibanInvoiceRequestSchema.safeParse({ ...personal, title: `${control}姓名` }).success).toBe(false);
      expect(mibanInvoiceRequestSchema.safeParse({ ...company, taxNo: `${company.taxNo}${control}` }).success).toBe(false);
    }
  });
});

describe("invoice infrastructure is explicit and outside transactions", () => {
  it("initializes once, with unique order ownership and no invented invoicing state", async () => {
    vi.resetModules();
    const { ensureMibanOrderInvoiceInfrastructure } = await import("./miban-order-invoice");
    const conn = { execute: vi.fn().mockResolvedValue([{}]), end: vi.fn().mockResolvedValue(undefined) };
    mocks.connection.mockResolvedValue(conn);
    await Promise.all([ensureMibanOrderInvoiceInfrastructure(), ensureMibanOrderInvoiceInfrastructure()]);
    expect(conn.execute).toHaveBeenCalledTimes(1);
    const sql = conn.execute.mock.calls[0][0];
    expect(sql).toContain("PRIMARY KEY (order_id)");
    expect(sql).toContain("requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    expect(sql).not.toMatch(/invoice_status|issued_at|refunded|ALTER TABLE/);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(conn.end).toHaveBeenCalledTimes(1);
  });
  it("propagates initialization failure without sensitive SQL, and allows retry", async () => {
    vi.resetModules();
    const { ensureMibanOrderInvoiceInfrastructure } = await import("./miban-order-invoice");
    const conn = { execute: vi.fn().mockRejectedValueOnce(new Error("driver SQL details")), end: vi.fn().mockResolvedValue(undefined) };
    mocks.connection.mockResolvedValue(conn);
    await expect(ensureMibanOrderInvoiceInfrastructure()).rejects.toThrow("发票申请服务初始化失败");
    conn.execute.mockResolvedValue([{}]);
    await expect(ensureMibanOrderInvoiceInfrastructure()).resolves.toBeUndefined();
    expect(conn.execute).toHaveBeenCalledTimes(2);
  });
});

describe("transaction-only invoice persistence", () => {
  it("uses the supplied transaction, parameterized columns and null personal taxNo", async () => {
    const transaction = { execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await insertMibanOrderInvoiceRequest({ transaction, orderId: 8, userId: 1, invoiceRequest: { ...personal, taxNo: "stale" } });
    const [sql, args] = transaction.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO miban_order_invoice_requests");
    expect(args).toEqual([8, 1, "personal", "个人姓名", null]);
    expect(sql).not.toMatch(/CREATE|ALTER|userNote|ingredients/);
    expect(mocks.connection).not.toHaveBeenCalled();
    await insertMibanOrderInvoiceRequest({ transaction, orderId: 9, userId: 1, invoiceRequest: company });
    expect(transaction.execute.mock.calls[1][1]).toEqual([9, 1, "company", company.title, company.taxNo]);
  });
  it("refuses absent transactions and malformed requests before SQL", async () => {
    await expect(insertMibanOrderInvoiceRequest({ transaction: null, orderId: 1, userId: 1, invoiceRequest: personal })).rejects.toThrow("原钱包事务");
    const transaction = { execute: vi.fn() };
    await expect(insertMibanOrderInvoiceRequest({ transaction, orderId: 1, userId: 1, invoiceRequest: { ...company, taxNo: "" } })).rejects.toThrow("资料无效");
    expect(transaction.execute).not.toHaveBeenCalled();
  });
  it("does not expose the driver error, SQL or invoice data on failed inserts", async () => {
    const transaction = { execute: vi.fn().mockRejectedValue(new Error(`SQL ${company.taxNo}`)) };
    const error = await insertMibanOrderInvoiceRequest({ transaction, orderId: 1, userId: 1, invoiceRequest: company }).catch(error => error);
    expect(error.message).toContain("发票申请保存失败");
    expect(error.message).not.toContain(company.taxNo);
    expect(error.cause).toBeUndefined();
  });
});

class InvoiceTransactionHarness {
  state = { orders: [] as number[], invoices: [] as any[][], debits: [] as number[] };
  trace: string[] = [];
  failInvoiceAt = 0;
  connection() {
    const harness = this;
    let pending = structuredClone(this.state);
    return {
      async beginTransaction() { pending = structuredClone(harness.state); harness.trace.push("begin"); },
      async commit() { harness.state = pending; harness.trace.push("commit"); },
      async rollback() { harness.trace.push("rollback"); },
      release() { harness.trace.push("release"); },
      async execute(sql: string, args: any[] = []) {
        harness.trace.push(sql);
        if (sql.includes("FROM users")) return [[{ id: 1, balance: "1000", cny_balance: "1000" }]];
        if (sql.startsWith("INSERT INTO miban_orders")) { pending.orders.push(args[0]); return [{ insertId: args[0] }]; }
        if (sql.startsWith("INSERT INTO af_manual_balances")) { pending.debits.push(args[0]); return [{ affectedRows: 1 }]; }
        if (sql.includes("INSERT INTO miban_order_invoice_requests")) {
          if (harness.failInvoiceAt === args[0]) throw new Error("invoice storage failed");
          pending.invoices.push(args); return [{ affectedRows: 1 }];
        }
        throw new Error("Unexpected test SQL");
      },
    };
  }
}
function checkout(harness: InvoiceTransactionHarness, count: number, request?: MibanInvoiceRequest, lateInvoice = false) {
  mocks.transaction.mockImplementation(async () => harness.connection());
  return withGlobalWalletTransaction(1, async transaction => {
    for (let orderId = 1; orderId <= count; orderId++) {
      await transaction.execute("INSERT INTO miban_orders (id) VALUES (?)", [orderId]);
      if (request && !lateInvoice) await insertMibanOrderInvoiceRequest({ transaction, orderId, userId: 1, invoiceRequest: request });
    }
    await transaction.execute("INSERT INTO af_manual_balances (amount) VALUES (?)", [-100]);
    if (request && lateInvoice) for (let orderId = 1; orderId <= count; orderId++)
      await insertMibanOrderInvoiceRequest({ transaction, orderId, userId: 1, invoiceRequest: request });
  });
}

describe("invoice requests share the wallet transaction", () => {
  it.each([1, 3, 12])("writes the same invoice to every one of %i actual orders", async count => {
    const harness = new InvoiceTransactionHarness();
    await checkout(harness, count, company);
    expect(harness.state.orders).toHaveLength(count);
    expect(harness.state.invoices).toHaveLength(count);
    expect(harness.state.invoices.every(row => row.slice(1).join("|") === [1, "company", company.title, company.taxNo].join("|"))).toBe(true);
    expect(harness.state.debits).toEqual([-100]);
    expect(harness.trace.some(sql => /CREATE|ALTER/.test(sql))).toBe(false);
  });
  it("keeps invoice-off checkout unchanged with no invoice writes or initialization", async () => {
    const harness = new InvoiceTransactionHarness();
    await checkout(harness, 1);
    expect(harness.state.invoices).toEqual([]);
    expect(mocks.connection).not.toHaveBeenCalled();
  });
  it.each([1, 3, 12])("rolls back all %i orders when an invoice insert fails", async count => {
    const harness = new InvoiceTransactionHarness(); harness.failInvoiceAt = count;
    await expect(checkout(harness, count, company)).rejects.toThrow("发票申请保存失败");
    expect(harness.state).toEqual({ orders: [], invoices: [], debits: [] });
    expect(harness.trace).toContain("rollback"); expect(harness.trace).not.toContain("commit");
  });
  it("also rolls back already-written wallet debits if a late invoice write fails", async () => {
    const harness = new InvoiceTransactionHarness(); harness.failInvoiceAt = 2;
    await expect(checkout(harness, 3, company, true)).rejects.toThrow("发票申请保存失败");
    expect(harness.state).toEqual({ orders: [], invoices: [], debits: [] });
  });
});

describe("readonly invoice enrichment stays inside the authorized order ID set", () => {
  it("deduplicates authorized IDs, ignores unrelated rows and strips personal taxNo", async () => {
    const conn = { execute: vi.fn().mockResolvedValue([[
      { order_id: 2, invoice_type: "personal", invoice_title: "个人姓名", tax_no: "stale" },
      { order_id: 3, invoice_type: "company", invoice_title: company.title, tax_no: company.taxNo },
      { order_id: 999, invoice_type: "company", invoice_title: "不可见", tax_no: "不可见" },
    ]]), end: vi.fn() };
    const requests = await readMibanOrderInvoiceRequests([2, 2, 3, -1, NaN], conn);
    expect(conn.execute.mock.calls[0][1]).toEqual([2, 3]);
    expect(requests.get(2)).toEqual(personal); expect(requests.get(3)).toEqual(company);
    expect(requests.has(999)).toBe(false); expect(conn.end).not.toHaveBeenCalled();
  });
  it("returns no requests for pre-migration tables without DDL; outages fail closed", async () => {
    const conn = { execute: vi.fn().mockRejectedValue(Object.assign(new Error("absent"), { code: "ER_NO_SUCH_TABLE" })) };
    expect((await readMibanOrderInvoiceRequests([1], conn)).size).toBe(0);
    expect(conn.execute.mock.calls[0][0]).not.toMatch(/CREATE|ALTER/);
    conn.execute.mockRejectedValue(new Error("connection lost"));
    await expect(readMibanOrderInvoiceRequests([1], conn)).rejects.toThrow("暂时无法读取");
    expect(mocks.connection).not.toHaveBeenCalled();
  });
  it("does not obtain a connection for an empty authorized set", async () => {
    expect((await readMibanOrderInvoiceRequests([])).size).toBe(0);
    expect(mocks.connection).not.toHaveBeenCalled();
  });
  it("releases only its own read connection and refuses malformed stored requests", async () => {
    const conn = { execute: vi.fn().mockResolvedValue([[{ order_id: 1, invoice_type: "company", invoice_title: company.title, tax_no: null }]]), end: vi.fn().mockResolvedValue(undefined) };
    mocks.connection.mockResolvedValue(conn);
    await expect(readMibanOrderInvoiceRequests([1])).rejects.toThrow("资料异常");
    expect(conn.end).toHaveBeenCalledTimes(1);
  });
});

describe("backend route wiring without importing or starting the application", () => {
  const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
  const limited = source.slice(source.indexOf("export const mibanLimitedProductRouter"), source.indexOf("export const mibanAftersaleRouter"));
  const legacy = source.slice(source.indexOf("export const mibanOrderRouter"), source.indexOf("myOrders: protectedProcedure"));
  it("adds only optional requests to the three limited endpoints and the pear legacy endpoint", () => {
    expect(limited.match(/invoiceRequest: mibanInvoiceRequestSchema\.optional\(\)/g)).toHaveLength(3);
    expect(legacy.match(/invoiceRequest: mibanInvoiceRequestSchema\.optional\(\)/g)).toHaveLength(1);
    for (const block of [legacy, ...["createAnnualOrder:", "createOrder:", "createCartOrder:"].map((entry, index, entries) => {
      const begin = limited.indexOf(entry);
      const end = entries[index + 1] ? limited.indexOf(entries[index + 1], begin + entry.length) : limited.length;
      return limited.slice(begin, end);
    })]) {
      expect(block).toContain("if (input.invoiceRequest) await ensureMibanOrderInvoiceInfrastructure();");
      expect(block.indexOf("ensureMibanOrderInvoiceInfrastructure();")).toBeLessThan(block.indexOf("withGlobalWalletTransaction(userId"));
      expect(block.indexOf("insertMibanOrderInvoiceRequest({ transaction")).toBeGreaterThan(block.indexOf("withGlobalWalletTransaction(userId"));
      expect(block.indexOf("insertMibanOrderInvoiceRequest({ transaction")).toBeLessThan(block.indexOf("debitMibanWalletPayment({ transaction"));
    }
  });
  it("advertises support only through an authenticated successful infrastructure probe", () => {
    expect(limited).toContain("invoiceSupport: protectedProcedure.query(async () => {");
    expect(limited).toContain("await ensureMibanOrderInvoiceInfrastructure();\n    return { supported: true, version: 1 } as const;");
  });
  it("enriches only user/admin order reads at top level, not ingredients or notes", () => {
    const readers = source.slice(source.indexOf("async function getUserOrders"), source.indexOf("async function updateOrderStatus"));
    expect(readers.match(/readMibanOrderInvoiceRequests\(/g)).toHaveLength(2);
    expect(readers).toContain("invoiceRequest: invoiceRequests.get(row.id) ?? null");
    expect(readers).toContain("invoiceRequest: invoiceRequests.get(Number(o.id)) ?? null");
    expect(source).toContain("myOrders: protectedProcedure.query(({ ctx }) => getUserOrders(ctx.user!.id))");
    expect(source).toContain("allOrders: mibanAdminProcedure.query(() => getAllOrders())");
    expect(source).not.toMatch(/ingredients:.*invoiceRequest|userNote:.*invoiceRequest|console\.(?:log|error|warn).*invoiceRequest/);
  });
});
