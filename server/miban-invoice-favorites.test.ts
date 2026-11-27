import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { mibanInvoiceRequestSchema, type MibanInvoiceRequest } from "../shared/miban-invoice";

// Offline fixtures only: mock the DB module before importing storage or auth middleware.
// Never import miban.ts, start the app, connect to MySQL, or execute an actual order.
const mocks = vi.hoisted(() => ({
  connection: vi.fn(), transaction: vi.fn(), blocked: vi.fn(), guest: vi.fn(),
}));
vi.mock("./db", () => ({
  getDbConnection: mocks.connection,
  getDbTransactionConnection: mocks.transaction,
  getActiveZidingLoginBlock: mocks.blocked,
  setCurrentIsGuest: mocks.guest,
}));
import { protectedProcedure, router } from "./_core/trpc";

type FavoriteModule = typeof import("./miban-invoice-favorites");
let storage: FavoriteModule;
const personal: MibanInvoiceRequest = { type: "personal", title: "离线姓名" };
const company: MibanInvoiceRequest = { type: "company", title: "离线测试抬头", taxNo: "fixture-tax-A" };
const hash = (request: MibanInvoiceRequest) => createHash("sha256")
  .update(JSON.stringify([request.type, request.title, request.type === "company" ? request.taxNo : ""]))
  .digest("hex");
const driverError = (code: string) => Object.assign(new Error("driver SQL includes private fixture-tax-A"), { code });
const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

type Row = {
  user_id: number;
  invoice_type: unknown;
  invoice_title: unknown;
  tax_no: unknown;
  used_at: unknown;
  order_id?: number;
};
function row(userId: number, request: MibanInvoiceRequest, time: unknown, extra = {}): Row {
  return {
    user_id: userId, invoice_type: request.type, invoice_title: request.title,
    tax_no: request.type === "company" ? request.taxNo : null, used_at: time, ...extra,
  };
}

class OfflineDatabase {
  favoritesExist = false;
  historyExists = false;
  favorites = new Map<string, Row>();
  history: Row[] = [];
  clock = new Date("2026-01-02T03:04:05.100Z").getTime();
  failCreate = 0;
  createError: unknown = driverError("ER_TABLEACCESS_DENIED_ERROR");
  writeError: unknown = null;
  favoriteReadError: unknown = null;
  historyReadError: unknown = null;
  statements: { sql: string; args: unknown[] }[] = [];
  end = vi.fn().mockResolvedValue(undefined);
  execute = vi.fn(async (sql: string, args: unknown[] = []): Promise<[any, any]> => {
    const normalized = normalizeSql(sql);
    this.statements.push({ sql: normalized, args: args.slice() });
    expect((normalized.match(/\?/g) ?? []).length).toBe(args.length);
    if (normalized.startsWith("CREATE TABLE IF NOT EXISTS miban_invoice_favorites")) {
      if (this.failCreate > 0) { this.failCreate -= 1; throw this.createError; }
      this.favoritesExist = true;
      return [{ affectedRows: 0 }, []];
    }
    if (normalized.startsWith("INSERT INTO miban_invoice_favorites")) {
      if (this.writeError) throw this.writeError;
      if (!this.favoritesExist) throw driverError("ER_NO_SUCH_TABLE");
      expect(normalized).toContain("ON DUPLICATE KEY UPDATE last_used_at = CURRENT_TIMESTAMP(6)");
      const [userId, requestHash, type, title, taxNo] = args as [number, string, "personal" | "company", string, string | null];
      const key = JSON.stringify([userId, requestHash]);
      const previous = this.favorites.get(key);
      const time = new Date(this.clock++);
      this.favorites.set(key, previous ? { ...previous, used_at: time } : {
        user_id: userId, invoice_type: type, invoice_title: title, tax_no: taxNo, used_at: time,
      });
      return [{ affectedRows: previous ? 2 : 1 }, []];
    }
    if (normalized.startsWith("SELECT ")) {
      expect(normalized).toContain("WHERE user_id = ?");
      expect(normalized).toMatch(/ORDER BY (?:last_used_at|requested_at) DESC, .* LIMIT 200$/);
      const isFavorite = normalized.includes("FROM miban_invoice_favorites ");
      if (isFavorite ? this.favoriteReadError : this.historyReadError)
        throw isFavorite ? this.favoriteReadError : this.historyReadError;
      if (!(isFavorite ? this.favoritesExist : this.historyExists)) throw driverError("ER_NO_SUCH_TABLE");
      const rows = isFavorite ? Array.from(this.favorites.values()) : this.history;
      return [rows.filter(item => item.user_id === args[0])
        .sort((a, b) => new Date(b.used_at as any).getTime() - new Date(a.used_at as any).getTime()).slice(0, 200), []];
    }
    throw new Error("Unexpected offline statement");
  });
  connection() { return { execute: this.execute, end: this.end }; }
  bind() { mocks.connection.mockImplementation(async () => this.connection()); return this; }
}

beforeEach(async () => {
  vi.resetModules();
  mocks.connection.mockReset(); mocks.transaction.mockReset(); mocks.guest.mockReset();
  mocks.blocked.mockReset().mockResolvedValue(null);
  vi.stubEnv("DEV_BYPASS_AUTH", "false");
  storage = await import("./miban-invoice-favorites");
});
afterEach(() => vi.unstubAllEnvs());

describe("explicit valid favorite saves only, no payment coupling", () => {
  it("performs no DDL on import or either absent-table read", async () => {
    const db = new OfflineDatabase().bind();
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(await storage.readMibanInvoiceFavorites(7)).toEqual([]);
    expect(db.statements).toHaveLength(2);
    expect(db.statements.every(statement => statement.sql.startsWith("SELECT "))).toBe(true);
    expect(db.favoritesExist).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(db.end).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined, null, {}, { ...personal, title: " " }, { ...company, taxNo: " " },
    { ...personal, title: "\n离线姓名" }, { ...company, taxNo: "fixture\u007f" },
    { ...personal, title: "名".repeat(201) }, { ...company, taxNo: "T".repeat(101) },
  ])("rejects invalid input %j without acquiring a DB or creating tables", async input => {
    await expect(storage.rememberMibanInvoice(7, input)).rejects.toThrow("常用发票资料无效");
    expect(mocks.connection).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, "7 OR 1=1"])(
    "rejects invalid user ID %j before reading or writing", async userId => {
      await expect(storage.readMibanInvoiceFavorites(userId as number)).rejects.toThrow("请登录");
      await expect(storage.rememberMibanInvoice(userId as number, personal)).rejects.toThrow("请登录");
      expect(mocks.connection).not.toHaveBeenCalled();
    }
  );

  it("shares initialization for concurrent valid saves and creates only the new table", async () => {
    const db = new OfflineDatabase().bind();
    expect(await Promise.all([
      storage.rememberMibanInvoice(7, personal), storage.rememberMibanInvoice(7, company),
      storage.rememberMibanInvoice(7, company),
    ])).toEqual([{ saved: true }, { saved: true }, { saved: true }]);
    const ddl = db.statements.filter(statement => statement.sql.startsWith("CREATE "));
    expect(ddl).toHaveLength(1);
    expect(ddl[0].sql).toContain("PRIMARY KEY (user_id, request_hash)");
    expect(ddl[0].sql).toContain("last_used_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)");
    expect(ddl[0].sql).toContain("ENGINE=InnoDB");
    expect(db.favorites.size).toBe(2);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(db.statements.some(statement => /miban_orders|miban_order_invoice_requests|wallet|af_manual_balances|BEGIN|COMMIT|ALTER/.test(statement.sql))).toBe(false);
  });

  it("resets a failed initialization Promise, returns a safe error and retries", async () => {
    const db = new OfflineDatabase().bind(); db.failCreate = 1;
    const errors = await Promise.all([
      storage.rememberMibanInvoice(7, company).catch(error => error),
      storage.rememberMibanInvoice(7, company).catch(error => error),
    ]);
    for (const error of errors) {
      expect(error.message).toBe("常用发票初始化失败，请稍后重试");
      expect(error.cause).toBeUndefined(); expect(error.message).not.toContain(company.taxNo);
    }
    expect(db.statements).toHaveLength(1);
    expect(db.favorites.size).toBe(0);
    await expect(storage.rememberMibanInvoice(7, company)).resolves.toEqual({ saved: true });
    expect(db.statements.filter(statement => statement.sql.startsWith("CREATE "))).toHaveLength(2);
    expect(db.favorites.size).toBe(1);
  });

  it("also retries after connection acquisition failure during initialization", async () => {
    mocks.connection.mockRejectedValueOnce(driverError("ECONNREFUSED"));
    await expect(storage.rememberMibanInvoice(7, personal)).rejects.toThrow("常用发票初始化失败");
    const db = new OfflineDatabase().bind();
    await expect(storage.rememberMibanInvoice(7, personal)).resolves.toEqual({ saved: true });
    expect(db.favorites.size).toBe(1);
  });

  it("trims normalized fields, clears personal tax and refreshes only last_used_at without duplicates", async () => {
    const db = new OfflineDatabase().bind();
    await storage.rememberMibanInvoice(7, { ...personal, title: "  离线姓名  ", taxNo: "discarded" });
    const first = Array.from(db.favorites.values())[0].used_at as Date;
    await storage.rememberMibanInvoice(7, { ...personal, taxNo: "different discarded tax" });
    expect(db.favorites.size).toBe(1);
    const saved = Array.from(db.favorites.values())[0];
    expect(saved.tax_no).toBeNull(); expect(saved.invoice_title).toBe(personal.title);
    expect((saved.used_at as Date).getTime()).toBeGreaterThan(first.getTime());
    const inserts = db.statements.filter(statement => statement.sql.startsWith("INSERT "));
    expect(inserts[0].args).toEqual([7, hash(personal), "personal", personal.title, null]);
    expect(inserts[1].args).toEqual(inserts[0].args);
    expect(await storage.readMibanInvoiceFavorites(7)).toEqual([personal]);
  });

  it("keeps distinct tax numbers and types under the same title, including delimiter-like content", async () => {
    const db = new OfflineDatabase().bind();
    const second = { ...company, taxNo: "fixture-tax-B" };
    const asPersonal = { type: "personal", title: company.title } as const;
    const delimiterA = { type: "company", title: "a|b", taxNo: "c" } as const;
    const delimiterB = { type: "company", title: "a", taxNo: "b|c" } as const;
    for (const request of [company, { ...company, title: ` ${company.title} `, taxNo: ` ${company.taxNo} ` }, second, asPersonal, delimiterA, delimiterB])
      await storage.rememberMibanInvoice(7, request);
    expect(db.favorites.size).toBe(5);
    expect(await storage.readMibanInvoiceFavorites(7)).toEqual([delimiterB, delimiterA, asPersonal, second, company]);
    expect(hash(delimiterA)).not.toBe(hash(delimiterB));
  });

  it("isolates identical requests by user and never trusts payload userId", async () => {
    const db = new OfflineDatabase().bind();
    await storage.rememberMibanInvoice(7, { ...company, userId: 8 });
    await storage.rememberMibanInvoice(8, company);
    await storage.rememberMibanInvoice(8, personal);
    expect(db.favorites.size).toBe(3);
    expect(await storage.readMibanInvoiceFavorites(7)).toEqual([company]);
    expect(await storage.readMibanInvoiceFavorites(8)).toEqual([personal, company]);
    expect(await storage.readMibanInvoiceFavorites(9)).toEqual([]);
    expect(db.statements.filter(statement => statement.sql.startsWith("SELECT ")).map(statement => statement.args))
      .toEqual([[7], [7], [8], [8], [9], [9]]);
  });

  it("binds SQL-looking titles and tax values as data, not SQL text", async () => {
    const db = new OfflineDatabase().bind();
    const injection = { type: "company", title: "O'Reilly'); DROP TABLE users; --", taxNo: "tax' OR 1=1 --" } as const;
    await storage.rememberMibanInvoice(7, injection);
    const insert = db.statements.find(statement => statement.sql.startsWith("INSERT "))!;
    expect(insert.args).toEqual([7, hash(injection), "company", injection.title, injection.taxNo]);
    for (const statement of db.statements) {
      expect(statement.sql).not.toContain(injection.title); expect(statement.sql).not.toContain(injection.taxNo);
    }
    expect(await storage.readMibanInvoiceFavorites(7)).toEqual([injection]);
  });

  it("throws a safe save error on write failure and does not report saved:true", async () => {
    const db = new OfflineDatabase().bind(); db.writeError = driverError("ER_TABLEACCESS_DENIED_ERROR");
    const error = await storage.rememberMibanInvoice(7, company).catch(error => error);
    expect(error.message).toBe("常用发票保存失败，请稍后重试");
    expect(error.message).not.toContain(company.taxNo); expect(error.cause).toBeUndefined();
    expect(error.saved).toBeUndefined(); expect(db.favorites.size).toBe(0);
    expect(db.end).toHaveBeenCalledTimes(2);
    expect(mocks.transaction).not.toHaveBeenCalled();
    db.writeError = null;
    await expect(storage.rememberMibanInvoice(7, company)).resolves.toEqual({ saved: true });
  });

  it("fails safely when an expected connection is unavailable", async () => {
    mocks.connection.mockResolvedValue(null);
    await expect(storage.readMibanInvoiceFavorites(7)).rejects.toThrow("常用发票暂时无法读取");
    await expect(storage.rememberMibanInvoice(7, company)).rejects.toThrow("常用发票初始化失败");
    const db = new OfflineDatabase().bind();
    await storage.rememberMibanInvoice(7, company);
    mocks.connection.mockResolvedValue(null);
    await expect(storage.rememberMibanInvoice(7, company)).rejects.toThrow("常用发票保存失败");
    expect(db.favorites.size).toBe(1);
  });
});

describe("readonly merge of current user's real timestamps", () => {
  it("merges history and favorites in chronological order, deduplicates across sources and excludes other users", async () => {
    const db = new OfflineDatabase().bind(); db.historyExists = true;
    db.history = [
      row(7, company, new Date("2026-01-01T00:00:00Z"), { order_id: 900 }),
      row(7, personal, new Date("2026-01-04T00:00:00Z"), { order_id: 2, tax_no: "stale personal tax" }),
      row(7, { ...company, taxNo: "fixture-tax-history" }, new Date("2026-01-03T00:00:00Z"), { order_id: 3 }),
      row(8, { ...company, taxNo: "private-other-user" }, new Date("2030-01-01T00:00:00Z")),
      row(7, personal, new Date("2025-01-01T00:00:00Z"), { order_id: 9999 }),
    ];
    await storage.rememberMibanInvoice(7, company);
    const historyBefore = structuredClone(db.history);
    db.statements = [];
    expect(await storage.readMibanInvoiceFavorites(7)).toEqual([
      personal, { ...company, taxNo: "fixture-tax-history" }, company,
    ]);
    expect(db.history).toEqual(historyBefore);
    expect(db.statements).toHaveLength(2);
    for (const statement of db.statements) expect(statement.sql).toMatch(/^SELECT .* WHERE user_id = \? ORDER BY .* DESC, .* LIMIT 200$/);
    expect(db.statements[1].sql).toContain("requested_at AS used_at");
    expect(db.statements[0].sql).toContain("last_used_at AS used_at");
  });

  it("supports history-only selection without creating the new favorites table", async () => {
    const db = new OfflineDatabase().bind(); db.historyExists = true;
    db.history = [row(7, company, "2026-01-01 12:00:00"), row(7, personal, "2026-01-02 12:00:00.000000")];
    expect(await storage.readMibanInvoiceFavorites(7)).toEqual([personal, company]);
    expect(db.favoritesExist).toBe(false);
    expect(db.statements.every(statement => statement.sql.startsWith("SELECT "))).toBe(true);
  });

  it("returns at most 20 unique requests after timestamp ordering, not before deduplication", async () => {
    const db = new OfflineDatabase().bind(); db.historyExists = true;
    const requests = Array.from({ length: 25 }, (_, index) => ({ type: "personal", title: `fixture-${index}` } as const));
    db.history = requests.map((request, index) => row(7, request, new Date(Date.UTC(2026, 0, index + 1))));
    db.history.push(...Array.from({ length: 25 }, () => row(7, requests[24], new Date(Date.UTC(2026, 1, 1)))));
    const result = await storage.readMibanInvoiceFavorites(7);
    expect(result).toEqual(requests.slice(5).reverse());
    expect(result).toHaveLength(20);
    expect(db.statements.every(statement => statement.sql.endsWith("LIMIT 200"))).toBe(true);
  });

  it("orders mixed Date and offset timestamps by actual time, never lexical order or order ID", async () => {
    const db = new OfflineDatabase().bind();
    db.execute.mockResolvedValueOnce([[
      row(7, company, "2026-01-01T03:00:00+08:00"),
      row(7, personal, new Date("2026-01-01T00:00:00Z")),
    ], []]).mockResolvedValueOnce([[
      row(7, { ...company, taxNo: "fixture-next" }, "2025-12-31T20:00:00Z", { order_id: 999999 }),
    ], []]);
    expect(await storage.readMibanInvoiceFavorites(7)).toEqual([personal, { ...company, taxNo: "fixture-next" }, company]);
  });

  it("defensively discards other users before parsing even if a driver stub returns unrelated invalid rows", async () => {
    const db = new OfflineDatabase().bind();
    db.execute.mockResolvedValueOnce([[
      row(7, personal, new Date()),
      { user_id: 8, invoice_type: "broken", invoice_title: null, tax_no: "private", used_at: "broken" },
    ], []]).mockResolvedValueOnce([[], []]);
    expect(await storage.readMibanInvoiceFavorites(7)).toEqual([personal]);
  });

  it.each(["ER_TABLEACCESS_DENIED_ERROR", "ER_BAD_FIELD_ERROR", "ECONNRESET"])(
    "does not suppress %s as absent history or return a misleading partial result", async code => {
      const db = new OfflineDatabase().bind(); db.historyExists = true;
      await storage.rememberMibanInvoice(7, company);
      db.historyReadError = driverError(code);
      let error = await storage.readMibanInvoiceFavorites(7).catch(error => error);
      expect(error.message).toBe("常用发票暂时无法读取，请稍后重试");
      expect(error.message).not.toContain(company.taxNo); expect(error.cause).toBeUndefined();
      db.historyReadError = null; db.favoriteReadError = driverError(code);
      error = await storage.readMibanInvoiceFavorites(7).catch(error => error);
      expect(error.message).toBe("常用发票暂时无法读取，请稍后重试");
    }
  );

  it("handles only exact missing-table codes, including a wrapped legacy-table error", async () => {
    const db = new OfflineDatabase().bind();
    await storage.rememberMibanInvoice(7, company);
    db.historyReadError = { cause: driverError("ER_NO_SUCH_TABLE") };
    expect(await storage.readMibanInvoiceFavorites(7)).toEqual([company]);
    db.historyReadError = new Error("ER_NO_SUCH_TABLE appears only in a message");
    await expect(storage.readMibanInvoiceFavorites(7)).rejects.toThrow("常用发票暂时无法读取");
  });

  it.each([
    { invoice_type: "other" }, { invoice_title: "\ninvalid" }, { invoice_title: " " },
    { invoice_type: "company", tax_no: null }, { used_at: "not-a-timestamp" }, { used_at: null },
  ])("safely rejects malformed current-user stored rows %j", async extra => {
    const db = new OfflineDatabase().bind();
    db.execute.mockResolvedValueOnce([[row(7, personal, new Date(), extra)], []]).mockResolvedValueOnce([[], []]);
    const error = await storage.readMibanInvoiceFavorites(7).catch(error => error);
    expect(error.message).toBe("常用发票暂时无法读取，请稍后重试");
    expect(error.cause).toBeUndefined(); expect(db.end).toHaveBeenCalledTimes(1);
  });

  it("rejects unexpected driver result shape instead of reporting an empty list", async () => {
    const db = new OfflineDatabase().bind(); db.execute.mockResolvedValueOnce([{}, []]);
    await expect(storage.readMibanInvoiceFavorites(7)).rejects.toThrow("常用发票暂时无法读取");
  });

  it.each(["read", "save"])("sanitizes connection cleanup failures during %s", async operation => {
    const db = new OfflineDatabase().bind();
    if (operation === "save") await storage.rememberMibanInvoice(7, personal);
    db.end.mockRejectedValue(driverError("ECONNRESET"));
    const error = await (operation === "read" ? storage.readMibanInvoiceFavorites(7) : storage.rememberMibanInvoice(7, personal)).catch(error => error);
    expect(error.message).toBe(operation === "read" ? "常用发票暂时无法读取，请稍后重试" : "常用发票保存失败，请稍后重试");
    expect(error.cause).toBeUndefined();
  });
});

describe("actual protected route declarations, evaluated in isolation without bootstrapping miban", () => {
  const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
  const limited = source.slice(source.indexOf("export const mibanLimitedProductRouter"), source.indexOf("export const mibanAftersaleRouter"));
  const declarations = limited.slice(limited.indexOf("invoiceFavorites:"), limited.indexOf("// 所有米伴可结算入口"));

  function isolatedRouter() {
    // Evaluate exactly the two production declaration expressions with real auth middleware;
    // esbuild strips TS non-null assertions, without loading any app/payment dependencies.
    const code = transformSync(`const routes = { ${declarations} };`, { loader: "ts", target: "es2018" }).code;
    const routes = new Function("protectedProcedure", "mibanInvoiceRequestSchema", "readMibanInvoiceFavorites", "rememberMibanInvoice", `${code}; return routes;`)(
      protectedProcedure, mibanInvoiceRequestSchema, storage.readMibanInvoiceFavorites, storage.rememberMibanInvoice
    );
    return router(routes);
  }
  const ctx = (id: number | null) => ({ user: id === null ? null : { id, role: "user" }, isGuest: false, realUser: null }) as any;

  it("registers query/mutation under limitedProduct, with shared validation and ctx-only user IDs", () => {
    expect(declarations).toContain("invoiceFavorites: protectedProcedure.query(({ ctx }) => readMibanInvoiceFavorites(ctx.user!.id))");
    expect(declarations).toContain(".input(mibanInvoiceRequestSchema)");
    expect(declarations).toContain(".mutation(({ ctx, input }) => rememberMibanInvoice(ctx.user!.id, input))");
    expect(declarations).not.toMatch(/input\.userId|userId:\s*z\./);
    const route = isolatedRouter();
    expect(route._def.procedures.invoiceFavorites._def.type).toBe("query");
    expect(route._def.procedures.rememberInvoice._def.type).toBe("mutation");
  });

  it("denies anonymous access before storage or DDL", async () => {
    const caller = isolatedRouter().createCaller(ctx(null));
    await expect(caller.invoiceFavorites()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.rememberInvoice(company)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.connection).not.toHaveBeenCalled();
  });

  it("binds the authenticated ctx user and strips forged userId through the exact input schema", async () => {
    const db = new OfflineDatabase().bind();
    const route = isolatedRouter();
    const caller = route.createCaller(ctx(7));
    await expect(caller.rememberInvoice({ ...company, userId: 8, title: ` ${company.title} ` })).resolves.toEqual({ saved: true });
    await expect(caller.invoiceFavorites()).resolves.toEqual([company]);
    await expect(route.createCaller(ctx(8)).invoiceFavorites()).resolves.toEqual([]);
    expect(Array.from(db.favorites.values()).map(item => item.user_id)).toEqual([7]);
    expect(mocks.blocked).toHaveBeenCalledWith(7);
  });

  it("rejects invalid input and blocked users without initializing favorites", async () => {
    const route = isolatedRouter(); const caller = route.createCaller(ctx(7));
    await expect(caller.rememberInvoice({ ...company, taxNo: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.connection).not.toHaveBeenCalled();
    mocks.blocked.mockResolvedValue({ id: 7 });
    await expect(caller.invoiceFavorites()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.rememberInvoice(company)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.connection).not.toHaveBeenCalled();
  });

  it("surfaces safe storage failure rather than reporting success via mutation", async () => {
    const db = new OfflineDatabase().bind(); db.writeError = driverError("ER_TABLEACCESS_DENIED_ERROR");
    await expect(isolatedRouter().createCaller(ctx(7)).rememberInvoice(company)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR", message: "常用发票保存失败，请稍后重试",
    });
  });

  it("never wires favorite saving into payment, order reads, invoice support or legacy transactions", () => {
    expect(source.match(/rememberMibanInvoice\(/g)).toHaveLength(1);
    expect(source.match(/readMibanInvoiceFavorites\(/g)).toHaveLength(1);
    const moduleSource = readFileSync(new URL("./miban-invoice-favorites.ts", import.meta.url), "utf8");
    expect(moduleSource).not.toMatch(/console\.|withGlobalWalletTransaction|getDbTransactionConnection|INSERT INTO miban_order_invoice_requests|UPDATE miban_orders/);
    expect(moduleSource).not.toMatch(/\.\.\.(?:seen|new Set|new Map)/);
    expect(declarations).not.toContain("ensure");
  });
});
