import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { TRPCError } from "@trpc/server";
import {
  supplierCatalog,
  resolveSupplierOrderScope,
  parseSupplierOrderItems,
  toSupplierOrderDTO,
  supplierDateBounds,
  filterSupplierOrders,
  supplierStats,
  supplierOrdersCsv,
  supplierCsvCell,
  type SupplierOrderSource,
} from "../shared/miban-supplier";
import {
  createMibanSupplierRouter,
  snapshotMibanSupplierOrderScope,
  withSupplierTransaction,
  type SupplierTransactionConnection,
} from "./miban-supplier";
vi.mock("./db", () => ({
  getDbTransactionConnection: vi.fn(() => {
    throw new Error("REAL DB FORBIDDEN");
  }),
  getActiveZidingLoginBlock: vi.fn(async () => null),
  setCurrentIsGuest: vi.fn(),
}));

const catalog = supplierCatalog();
const first = catalog.products[0];
const other = catalog.products.find(
  product => product.seriesKey !== first.seriesKey
)!;
const line = (product = first) => ({
  kind: "limited_product",
  productKey: product.productKey,
  skuId: product.skus[0].id,
  quantity: 2,
  name: product.name,
  skuName: product.skus[0].name,
  unitLabel: product.skus[0].unitLabel,
  quantityPerOrder: 3,
  lineTotalCny: "10.10",
});
export function order(id = 100, overrides: Partial<Order> = {}): Order {
  return {
    id,
    orderNo: `AA${id}`,
    createdAt: "2026-11-23 10:00:00",
    status: "pending",
    totalPrice: "10.10",
    ingredients: JSON.stringify([line()]),
    receiverName: "收货人",
    receiverPhone: "13800000000",
    receiverAddress: "地址",
    trackingCompany: null,
    trackingNo: null,
    shippedAt: null,
    autoConfirmAt: null,
    ...overrides,
  };
}
type Order = SupplierOrderSource & { autoConfirmAt: string | null };
type State = {
  suppliers: { id: number; name: string; active: number }[];
  members: { supplierId: number; userId: number; active: number }[];
  series: { seriesKey: string; supplierId: number | null }[];
  scopes: {
    orderId: number;
    seriesKey: string;
    supplierId: number | null;
    source?: string;
  }[];
  orders: Order[];
  audits: unknown[][];
};
export function mockDatabase() {
  let state: State = {
    suppliers: [
      { id: 1, name: "供货商一", active: 1 },
      { id: 2, name: "供货商二", active: 1 },
    ],
    members: [
      { supplierId: 1, userId: 10, active: 1 },
      { supplierId: 2, userId: 20, active: 1 },
    ],
    series: catalog.series.map(series => ({
      seriesKey: series.key,
      supplierId:
        series.key === first.seriesKey
          ? 1
          : series.key === other.seriesKey
            ? 2
            : null,
    })),
    scopes: [
      { orderId: 100, seriesKey: first.seriesKey, supplierId: 1 },
      { orderId: 200, seriesKey: other.seriesKey, supplierId: 2 },
    ],
    orders: [
      order(),
      order(200, { ingredients: JSON.stringify([line(other)]) }),
    ],
    audits: [],
  };
  let snapshot: State | undefined;
  const sqlLog: { sql: string; values: unknown[] }[] = [];
  let failAudit = false;
  const db: SupplierTransactionConnection = {
    beginTransaction: vi.fn(async () => {
      snapshot = structuredClone(state);
    }),
    commit: vi.fn(async () => {
      snapshot = undefined;
    }),
    rollback: vi.fn(async () => {
      if (snapshot) state = snapshot;
      snapshot = undefined;
    }),
    release: vi.fn(),
    execute: vi.fn(async (raw, values = []) => {
      const sql = raw.replace(/\s+/g, " ").trim();
      sqlLog.push({ sql, values });
      const result = (rows: unknown) => [rows, []];
      if (sql.startsWith("SELECT GET_LOCK")) return result([{ acquired: 1 }]);
      if (sql.startsWith("SELECT RELEASE_LOCK"))
        return result([{ released: 1 }]);
      if (sql.startsWith("SELECT id FROM miban_supplier_audit")) {
        const audits = state.audits
          .map((a, i) => ({ a, id: i + 1 }))
          .filter(x => x.a[2] === values[0]);
        return result(audits.length ? [{ id: audits.at(-1)!.id }] : []);
      }
      if (
        sql.startsWith("SELECT id,trackingCompany,trackingNo FROM miban_orders")
      )
        return result(
          state.orders.filter(o => o.id !== values[0] && o.trackingNo != null)
        );
      if (sql.startsWith("SELECT o.id,o.orderNo,o.userId,o.status"))
        return result(
          state.orders.filter(o => o.orderNo === values[0]).map(o => ({ ...o }))
        );
      if (sql.startsWith("INSERT INTO miban_supplier_audit")) {
        if (failAudit) throw new Error("audit unavailable");
        state.audits.push(values);
        return result({ insertId: state.audits.length });
      }
      if (sql.startsWith("SELECT id,name,active FROM miban_suppliers WHERE"))
        return result(state.suppliers.filter(s => s.id === values[0]));
      if (sql === "SELECT id,name,active FROM miban_suppliers ORDER BY id")
        return result(state.suppliers);
      if (sql.startsWith("SELECT s.id,s.name,s.active"))
        return result(
          state.suppliers.filter(
            s =>
              s.active &&
              state.members.some(
                m => m.supplierId === s.id && m.userId === values[0] && m.active
              )
          )
        );
      if (sql.startsWith("SELECT active FROM miban_supplier_members"))
        return result(
          state.members.filter(
            m => m.supplierId === values[0] && m.userId === values[1]
          )
        );
      if (sql.startsWith("SELECT m.user_id AS userId"))
        return result(
          state.members
            .filter(m => m.supplierId === values[0] && m.active)
            .map(m => ({
              userId: m.userId,
              name: `员工${m.userId}`,
              username: `user${m.userId}`,
            }))
        );
      if (sql.startsWith("SELECT user_id FROM miban_supplier_members"))
        return result(state.members.filter(m => m.supplierId === values[0]));
      if (
        sql.startsWith(
          "SELECT series_key AS seriesKey FROM miban_supplier_series"
        )
      )
        return result(
          state.series
            .filter(s => s.supplierId === values[0])
            .map(s => ({ seriesKey: s.seriesKey }))
        );
      if (
        sql.startsWith(
          "SELECT series_key AS seriesKey,supplier_id AS supplierId FROM miban_supplier_series"
        )
      )
        return result(
          sql.includes("WHERE")
            ? state.series.filter(s => s.seriesKey === values[0])
            : [...state.series].sort((a, b) =>
                a.seriesKey.localeCompare(b.seriesKey)
              )
        );
      if (
        sql.startsWith(
          "SELECT DISTINCT series_key AS seriesKey FROM miban_supplier_order_scope"
        )
      )
        return result(
          state.scopes
            .filter(s => s.supplierId === values[0])
            .map(s => ({ seriesKey: s.seriesKey }))
        );
      if (sql.startsWith("INSERT IGNORE INTO miban_supplier_series")) {
        if (!state.series.some(s => s.seriesKey === values[0]))
          state.series.push({ seriesKey: String(values[0]), supplierId: null });
        return result({ affectedRows: 1 });
      }
      if (sql.startsWith("SELECT o.id FROM miban_orders"))
        return result(
          state.orders
            .filter(
              o =>
                o.orderNo === values[0] &&
                state.scopes.some(
                  s => s.orderId === o.id && s.supplierId === values[1]
                )
            )
            .map(o => ({ id: o.id }))
        );
      if (sql.startsWith("SELECT o.id,o.orderNo")) {
        if (sql.includes("WHERE o.id=?"))
          return result(state.orders.filter(o => o.id === values[0]));
        if (sql.includes("WHERE s.supplier_id=?"))
          return result(
            state.orders.flatMap(o => {
              const scope = state.scopes.find(
                s => s.orderId === o.id && s.supplierId === values[0]
              );
              return scope
                ? [
                    {
                      ...o,
                      userName: "用户",
                      userUsername: "user",
                      seriesKey: scope.seriesKey,
                    },
                  ]
                : [];
            })
          );
        if (sql.includes("WHERE s.supplier_id IS NULL"))
          return result(
            state.orders
              .filter(
                o => !state.scopes.find(s => s.orderId === o.id)?.supplierId
              )
              .map(o => ({
                ...o,
                snapshotSeriesKey:
                  state.scopes.find(s => s.orderId === o.id)?.seriesKey ?? null,
              }))
          );
      }
      if (sql.startsWith("SELECT order_id AS orderId"))
        return result(state.scopes.filter(s => s.orderId === values[0]));
      if (sql.startsWith("INSERT INTO miban_supplier_order_scope")) {
        if (state.scopes.some(s => s.orderId === values[0]))
          throw new Error("duplicate immutable scope");
        state.scopes.push({
          orderId: Number(values[0]),
          seriesKey: String(values[1]),
          supplierId: values[2] == null ? null : Number(values[2]),
          source: sql.includes("admin_history") ? "admin_history" : "new_order",
        });
        return result({ affectedRows: 1 });
      }
      if (sql.startsWith("UPDATE miban_supplier_order_scope")) {
        const scope = state.scopes.find(
          s => s.orderId === values[1] && s.supplierId === null
        )!;
        scope.supplierId = Number(values[0]);
        return result({ affectedRows: 1 });
      }
      if (sql.startsWith("UPDATE miban_orders SET status='shipped'")) {
        const firstShipment = sql.includes("shippedAt=?");
        const o = state.orders.find(
          o => o.id === values[firstShipment ? 4 : 2]
        )!;
        o.status = "shipped";
        o.trackingCompany = String(values[0]);
        o.trackingNo = String(values[1]);
        if (firstShipment) {
          o.shippedAt = String(values[2]);
          o.autoConfirmAt = String(values[3]);
        }
        return result({ affectedRows: 1 });
      }
      if (sql.startsWith("SELECT id FROM users WHERE id IN"))
        return result(values.map(id => ({ id })));
      if (sql.startsWith("SELECT id,name,COALESCE(username,''"))
        return result([{ id: 10, name: "员工10", username: "user10" }]);
      if (sql.startsWith("INSERT INTO miban_suppliers")) {
        const id = Math.max(...state.suppliers.map(s => s.id)) + 1;
        state.suppliers.push({
          id,
          name: String(values[0]),
          active: Number(values[1]),
        });
        return result({ insertId: id });
      }
      if (sql.startsWith("UPDATE miban_suppliers SET")) {
        Object.assign(state.suppliers.find(s => s.id === values[2])!, {
          name: values[0],
          active: Number(values[1]),
        });
        return result({ affectedRows: 1 });
      }
      if (sql.startsWith("UPDATE miban_supplier_members SET active=0")) {
        state.members
          .filter(m => m.supplierId === values[0])
          .forEach(m => {
            m.active = 0;
          });
        return result({ affectedRows: 1 });
      }
      if (sql.startsWith("INSERT INTO miban_supplier_members")) {
        const existing = state.members.find(
          m => m.supplierId === values[0] && m.userId === values[1]
        );
        if (existing) existing.active = 1;
        else
          state.members.push({
            supplierId: Number(values[0]),
            userId: Number(values[1]),
            active: 1,
          });
        return result({ affectedRows: 1 });
      }
      if (sql.startsWith("UPDATE miban_supplier_series SET supplier_id=NULL")) {
        state.series
          .filter(s => s.supplierId === values[0])
          .forEach(s => {
            s.supplierId = null;
          });
        return result({ affectedRows: 1 });
      }
      if (sql.startsWith("UPDATE miban_supplier_series SET supplier_id=?")) {
        state.series.find(s => s.seriesKey === values[1])!.supplierId = Number(
          values[0]
        );
        return result({ affectedRows: 1 });
      }
      throw new Error(`Unhandled MOCK SQL: ${sql}`);
    }),
  };
  return {
    db,
    get state() {
      return state;
    },
    sqlLog,
    setFailAudit: () => {
      failAudit = true;
    },
    factory: async () => db,
  };
}
export function ctx(id: number | null, role = "parent"): TrpcContext {
  return {
    user: id === null ? null : ({ id, role } as TrpcContext["user"]),
    realUser: null,
    isViewingAs: false,
    isGuest: false,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}
type SupplierCaller = ReturnType<
  ReturnType<typeof createMibanSupplierRouter>["createCaller"]
>;
async function fulfill(
  caller: SupplierCaller,
  input: {
    supplierId: number;
    orderId: number;
    trackingCompany: string;
    trackingNo: string;
  },
  mode: "ship" | "correct" = "ship"
) {
  const preview = await caller.fulfillmentPreview({
    supplierId: input.supplierId,
    mode,
    rows: [
      {
        orderNo: `AA${input.orderId}`,
        trackingCompany: input.trackingCompany,
        trackingNo: input.trackingNo,
      },
    ],
  });
  const row = preview.rows[0];
  if (!row.ok)
    throw new TRPCError({
      code: row.error === "无此供货商或订单权限" ? "FORBIDDEN" : "BAD_REQUEST",
      message: row.error,
    });
  const result = await caller.fulfillmentApply({
    supplierId: input.supplierId,
    mode,
    rows: [
      {
        orderNo: row.orderNo,
        trackingCompany: row.trackingCompany,
        trackingNo: row.trackingNo,
        revision: row.revision!,
      },
    ],
  });
  if (!result.results[0].success)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: result.results[0].error,
    });
  return result;
}
async function fulfillBatch(
  caller: SupplierCaller,
  input: {
    supplierId: number;
    rows: { orderNo: string; trackingCompany: string; trackingNo: string }[];
  }
) {
  const preview = await caller.fulfillmentPreview({ ...input, mode: "ship" });
  // Include rejected preview rows with an invalid-but-well-shaped token to retain row-level isolation checks.
  return caller.fulfillmentApply({
    ...input,
    mode: "ship",
    rows: preview.rows.map(row => ({
      ...row,
      revision: row.revision ?? "0".repeat(64),
    })),
  });
}
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("DEV_BYPASS_AUTH", "false");
});

describe("supplier pure allowlist, scopes, dates, totals and CSV", () => {
  it("maps catalog exactly to static series slug, not checkoutGroupKey or claimed brand", () => {
    expect(resolveSupplierOrderScope([line()])).toEqual({
      kind: "series",
      seriesKey: first.seriesKey,
    });
    expect(
      resolveSupplierOrderScope([
        { ...line(), brand: other.seriesKey, checkoutGroupKey: "fake" },
      ])
    ).toEqual({ kind: "series", seriesKey: first.seriesKey });
    expect(
      catalog.series.every(
        s =>
          s.productCount ===
          catalog.products.filter(p => p.seriesKey === s.key).length
      )
    ).toBe(true);
  });
  it.each([
    "unknown product",
    "unknown sku",
    "missing sku",
    "bad quantity",
    "mixed series",
    "ordinary mixture",
    "malformed",
  ])("denies %s", kind => {
    const ingredients =
      kind === "unknown product"
        ? [{ ...line(), productKey: "no-such" }]
        : kind === "unknown sku"
          ? [{ ...line(), skuId: "no-such" }]
          : kind === "missing sku"
            ? [{ ...line(), skuId: undefined }]
            : kind === "bad quantity"
              ? [{ ...line(), quantity: 0 }]
              : kind === "mixed series"
                ? [line(), line(other)]
                : kind === "ordinary mixture"
                  ? [line(), { kind: "rice" }]
                  : "{broken";
    expect(resolveSupplierOrderScope(ingredients).kind).toBe("denied");
  });
  it("ordinary orders produce no scope", () => {
    expect(resolveSupplierOrderScope([{ riceId: 1 }])).toEqual({
      kind: "none",
    });
  });
  it("DTO excludes funds, notes and commissions", () => {
    const dto = toSupplierOrderDTO({
      ...order(),
      walletDeductCny: "999",
      adminNote: "SECRET",
    } as Order);
    expect(Object.keys(dto)).not.toContain("walletDeductCny");
    expect(JSON.stringify(dto)).not.toContain("SECRET");
    expect(parseSupplierOrderItems([line()])[0]).toMatchObject({
      quantity: 2,
      quantityPerOrder: 3,
      lineTotal: "10.10",
    });
  });
  it("independent Beijing day bounds include end-of-day and convert ISO UTC", () => {
    expect(supplierDateBounds({ dateTo: "2026-11-23" })).toEqual({
      from: undefined,
      to: "2026-11-23 23:59:59.999",
    });
    const orders = [
      toSupplierOrderDTO(order(1, { createdAt: "2026-11-22T16:00:00Z" })),
      toSupplierOrderDTO(order(2, { createdAt: "2026-11-23 23:59:59.999" })),
      toSupplierOrderDTO(order(3, { createdAt: "2026-11-23T16:00:00Z" })),
    ];
    expect(
      filterSupplierOrders(orders, {
        dateFrom: "2026-11-23",
        dateTo: "2026-11-23",
      }).map(o => o.id)
    ).toEqual([1, 2]);
    expect(() => supplierDateBounds({ dateTo: "2026-02-30" })).toThrow();
    expect(() =>
      supplierDateBounds({ dateFrom: "2026-11-24", dateTo: "2026-11-23" })
    ).toThrow();
  });
  it("stats follow filters and exclude cancelled units/sales using exact cents", () => {
    const orders = [
      toSupplierOrderDTO(order()),
      toSupplierOrderDTO(
        order(2, { status: "cancelled", totalPrice: "999.99" })
      ),
      toSupplierOrderDTO(order(3, { status: "shipped", totalPrice: "0.20" })),
    ];
    expect(supplierStats(orders)).toEqual({
      orderCount: 3,
      soldUnits: 12,
      salesCny: "10.30",
      pendingCount: 1,
      shippedCount: 1,
      deliveredCount: 0,
      cancelledCount: 1,
    });
    expect(
      supplierStats(filterSupplierOrders(orders, { status: "shipped" }))
        .salesCny
    ).toBe("0.20");
  });
  it("quotes CSV cells, stops formula injection and never exports internal fields", () => {
    for (const value of ["=SUM(A1)", " +cmd", "\t@exec", "-cmd", "\runsafe"])
      expect(supplierCsvCell(value)).toContain("'");
    expect(supplierCsvCell('a,"b"')).toBe('"a,""b"""');
    const csv = supplierOrdersCsv([
      toSupplierOrderDTO(
        order(1, {
          receiverName: "=1+1",
          ingredients: JSON.stringify([
            { ...line(), adminNote: "SECRET", commissionBaseCny: 999 },
          ]),
        })
      ),
    ]);
    expect(csv).toContain("'=1+1");
    expect(csv).not.toContain("SECRET");
    expect(csv).not.toContain("commission");
  });
});

describe("supplier tRPC authorization and transactions (mock DB only)", () => {
  it("module import does not create connections or tables", async () => {
    const { getDbTransactionConnection } = await import("./db");
    expect(getDbTransactionConnection).not.toHaveBeenCalled();
  });
  it("unauthenticated access rejected by protectedProcedure", async () => {
    const m = mockDatabase();
    const caller = createMibanSupplierRouter(m.factory).createCaller(ctx(null));
    await expect(caller.access()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(m.db.beginTransaction).not.toHaveBeenCalled();
  });
  it("ordinary users cannot call every admin procedure", async () => {
    const m = mockDatabase();
    const caller = createMibanSupplierRouter(m.factory).createCaller(ctx(10));
    await expect(caller.adminCatalog()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.adminSearchUsers({ keyword: "员工" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.adminSave({
        id: 1,
        name: "one",
        active: true,
        seriesKeys: [],
        userIds: [],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminHistory({ supplierId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.adminAssignHistory({ supplierId: 1, orderIds: [100] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("access scopes effective memberships, workspace includes only assigned orders", async () => {
    const m = mockDatabase();
    m.state.orders.push(order(300));
    const caller = createMibanSupplierRouter(m.factory).createCaller(ctx(10));
    expect((await caller.access()).suppliers.map(s => s.id)).toEqual([1]);
    const result = await caller.workspace({ supplierId: 1 });
    expect(result.orders.map(o => o.id)).toEqual([100]);
    expect(result.stats.orderCount).toBe(1);
    await expect(caller.workspace({ supplierId: 2 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.exportOrders({ supplierId: 2 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.ship({
        supplierId: 2,
        orderId: 200,
        trackingCompany: "SF",
        trackingNo: "1",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.batchShip({
        supplierId: 2,
        rows: [{ orderNo: "AA200", trackingCompany: "SF", trackingNo: "1" }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects a different supplier's order and corrupt/unknown scope", async () => {
    const m = mockDatabase();
    const caller = createMibanSupplierRouter(m.factory).createCaller(ctx(10));
    await expect(
      caller.ship({
        supplierId: 1,
        orderId: 200,
        trackingCompany: "SF",
        trackingNo: "1",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    m.state.orders[0].ingredients = JSON.stringify([
      { ...line(), productKey: "unknown" },
    ]);
    expect((await caller.workspace({ supplierId: 1 })).orders).toEqual([]);
    await expect(
      caller.ship({
        supplierId: 1,
        orderId: 100,
        trackingCompany: "SF",
        trackingNo: "1",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.state.audits).toHaveLength(0);
  });
  it.each(["cancelled", "delivered"] as const)("rejects %s", async status => {
    const m = mockDatabase();
    m.state.orders[0].status = status;
    await expect(
      fulfill(createMibanSupplierRouter(m.factory).createCaller(ctx(10)), {
        supplierId: 1,
        orderId: 100,
        trackingCompany: "SF",
        trackingNo: "1",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.state.orders[0].status).toBe(status);
  });
  it.each(["pending", "confirmed", "packing"] as const)(
    "ships %s with 30-day deadline, trimmed logistics and audit",
    async status => {
      const m = mockDatabase();
      m.state.orders[0].status = status;
      await fulfill(
        createMibanSupplierRouter(m.factory).createCaller(ctx(10)),
        {
          supplierId: 1,
          orderId: 100,
          trackingCompany: " SF ",
          trackingNo: " 123 ",
        }
      );
      const shipped = m.state.orders[0];
      expect(shipped.status).toBe("shipped");
      expect(shipped.trackingNo).toBe("123");
      expect(shipped.trackingCompany).toBe("顺丰速运");
      expect(
        new Date(
          String(shipped.autoConfirmAt).replace(" ", "T") + "+08:00"
        ).getTime() -
          new Date(
            String(shipped.shippedAt).replace(" ", "T") + "+08:00"
          ).getTime()
      ).toBe(30 * 24 * 60 * 60 * 1000);
      expect(m.state.audits[0].slice(0, 4)).toEqual([10, 1, 100, "ship"]);
      expect(
        m.sqlLog.filter(q => q.sql.includes("FOR UPDATE")).map(q => q.sql)
      ).toEqual(
        expect.arrayContaining([
          expect.stringContaining("miban_suppliers"),
          expect.stringContaining("miban_supplier_members"),
          expect.stringContaining("miban_orders"),
          expect.stringContaining("miban_supplier_order_scope"),
        ])
      );
    }
  );
  it("correction never resets shippedAt/autoConfirmAt, including legacy null", async () => {
    for (const shippedAt of ["2026-10-01 10:00:00", null]) {
      const m = mockDatabase();
      Object.assign(m.state.orders[0], {
        status: "shipped",
        shippedAt,
        autoConfirmAt: "2026-10-31 10:00:00",
      });
      await fulfill(
        createMibanSupplierRouter(m.factory).createCaller(ctx(10)),
        {
          supplierId: 1,
          orderId: 100,
          trackingCompany: "SF",
          trackingNo: "NEW",
        },
        "correct"
      );
      expect(m.state.orders[0].shippedAt).toBe(shippedAt);
      expect(m.state.orders[0].autoConfirmAt).toBe("2026-10-31 10:00:00");
      expect(
        m.sqlLog.find(q => q.sql.startsWith("UPDATE miban_orders"))!.sql
      ).not.toContain("autoConfirmAt");
      expect(m.state.audits[0][3]).toBe("correct_tracking");
    }
  });
  it("revoked member and paused supplier fail closed; admin can inspect and fulfill paused", async () => {
    const m = mockDatabase();
    const caller = createMibanSupplierRouter(m.factory).createCaller(ctx(10));
    m.state.members[0].active = 0;
    await expect(caller.workspace({ supplierId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.ship({
        supplierId: 1,
        orderId: 100,
        trackingCompany: "SF",
        trackingNo: "1",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    m.state.members[0].active = 1;
    m.state.suppliers[0].active = 0;
    expect((await caller.access()).suppliers).toEqual([]);
    const admin = createMibanSupplierRouter(m.factory).createCaller(
      ctx(99, "super_admin")
    );
    expect((await admin.workspace({ supplierId: 1 })).supplier.active).toBe(
      false
    );
    await fulfill(admin, {
      supplierId: 1,
      orderId: 100,
      trackingCompany: "SF",
      trackingNo: "1",
    });
    expect(m.state.orders[0].status).toBe("shipped");
  });
  it("audit failure rolls back logistics update and releases transaction", async () => {
    const m = mockDatabase();
    m.setFailAudit();
    await expect(
      fulfill(createMibanSupplierRouter(m.factory).createCaller(ctx(10)), {
        supplierId: 1,
        orderId: 100,
        trackingCompany: "SF",
        trackingNo: "1",
      })
    ).rejects.toThrow();
    expect(m.state.orders[0].status).toBe("pending");
    expect(m.state.orders[0].trackingNo).toBeNull();
    expect(m.db.rollback).toHaveBeenCalledTimes(1);
    expect(m.db.commit).toHaveBeenCalledTimes(2);
    expect(m.db.release).toHaveBeenCalledTimes(3);
  });
  it("batch has each-row transactions/authorization and no cross-supplier enumeration", async () => {
    const m = mockDatabase();
    const result = await fulfillBatch(
      createMibanSupplierRouter(m.factory).createCaller(ctx(10)),
      {
        supplierId: 1,
        rows: [
          { orderNo: "AA100", trackingCompany: "SF", trackingNo: "1" },
          { orderNo: "AA200", trackingCompany: "SF", trackingNo: "2" },
        ],
      }
    );
    expect(result.successCount).toBe(1);
    expect(result.results[1]).toMatchObject({
      success: false,
      error: "无此供货商或订单权限",
    });
    expect(m.db.beginTransaction).toHaveBeenCalledTimes(4);
    expect(m.state.orders[1].status).toBe("pending");
    expect(
      m.sqlLog.filter(q =>
        q.sql.startsWith("SELECT active FROM miban_supplier_members")
      ).length
    ).toBeGreaterThanOrEqual(3);
  });
  it("batch rechecks membership after first transaction so mid-batch revocation cannot ship second row", async () => {
    const m = mockDatabase();
    m.state.orders.push(order(101));
    m.state.scopes.push({
      orderId: 101,
      seriesKey: first.seriesKey,
      supplierId: 1,
    });
    let commits = 0;
    vi.mocked(m.db.commit).mockImplementation(async () => {
      commits++;
      if (commits === 3) m.state.members[0].active = 0;
    });
    const result = await fulfillBatch(
      createMibanSupplierRouter(m.factory).createCaller(ctx(10)),
      {
        supplierId: 1,
        rows: [
          { orderNo: "AA100", trackingCompany: "SF", trackingNo: "1" },
          { orderNo: "AA101", trackingCompany: "SF", trackingNo: "2" },
        ],
      }
    );
    expect(result.successCount).toBe(1);
    expect(m.state.orders.find(o => o.id === 101)!.status).toBe("pending");
  });
  it("adminSave conflicts with paused occupancy and does not expose unassigned history", async () => {
    const m = mockDatabase();
    m.state.suppliers[1].active = 0;
    m.state.orders.push(order(300));
    m.state.scopes.push({
      orderId: 300,
      seriesKey: first.seriesKey,
      supplierId: null,
    });
    const admin = createMibanSupplierRouter(m.factory).createCaller(
      ctx(99, "super_admin")
    );
    await expect(
      admin.adminSave({
        id: 1,
        name: "one",
        active: true,
        seriesKeys: [other.seriesKey],
        userIds: [10],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await admin.adminSave({
      id: 1,
      name: "one",
      active: false,
      seriesKeys: [first.seriesKey],
      userIds: [10],
    });
    expect(m.state.scopes.find(s => s.orderId === 300)!.supplierId).toBeNull();
    expect(
      m.state.series.find(s => s.seriesKey === first.seriesKey)!.supplierId
    ).toBe(1);
    expect(m.state.audits.at(-1)![3]).toBe("save_supplier");
  });
  it("new unbound series snapshots are kept unassigned on later supplier setup", async () => {
    const m = mockDatabase();
    m.state.series.find(s => s.seriesKey === first.seriesKey)!.supplierId =
      null;
    await withSupplierTransaction(m.factory, db =>
      snapshotMibanSupplierOrderScope(db, 300, [line()], 10)
    );
    expect(m.state.scopes.find(s => s.orderId === 300)).toMatchObject({
      supplierId: null,
      seriesKey: first.seriesKey,
    });
    await createMibanSupplierRouter(m.factory)
      .createCaller(ctx(99, "super_admin"))
      .adminSave({
        id: 1,
        name: "one",
        active: true,
        seriesKeys: [first.seriesKey],
        userIds: [10],
      });
    expect(m.state.scopes.find(s => s.orderId === 300)!.supplierId).toBeNull();
  });
  it("new snapshots deny mixed/unknown lines and are immutable; ordinary order touches no supplier SQL", async () => {
    const m = mockDatabase();
    await snapshotMibanSupplierOrderScope(m.db, 333, [{ riceId: 1 }], 10);
    expect(m.sqlLog).toHaveLength(0);
    await expect(
      snapshotMibanSupplierOrderScope(m.db, 333, [line(), line(other)], 10)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await withSupplierTransaction(m.factory, db =>
      snapshotMibanSupplierOrderScope(db, 333, [line()], 10)
    );
    expect(m.state.scopes.find(s => s.orderId === 333)).toMatchObject({
      seriesKey: first.seriesKey,
      supplierId: 1,
    });
    await expect(
      withSupplierTransaction(m.factory, db =>
        snapshotMibanSupplierOrderScope(db, 333, [line()], 10)
      )
    ).rejects.toThrow("duplicate");
    expect(m.sqlLog.every(q => !/CREATE TABLE|ALTER TABLE/.test(q.sql))).toBe(
      true
    );
  });
  it("history exposes only definite own-series unassigned candidates and requires explicit confirmation", async () => {
    const m = mockDatabase();
    m.state.orders.push(
      order(300),
      order(301, { ingredients: JSON.stringify([line(other)]) }),
      order(302, {
        ingredients: JSON.stringify([{ ...line(), productKey: "unknown" }]),
      })
    );
    const admin = createMibanSupplierRouter(m.factory).createCaller(
      ctx(99, "super_admin")
    );
    const history = await admin.adminHistory({ supplierId: 1 });
    expect(history.candidates.map(o => o.id)).toEqual([300]);
    expect(history.unresolvedCount).toBe(1);
    const member = createMibanSupplierRouter(m.factory).createCaller(ctx(10));
    expect(
      (await member.workspace({ supplierId: 1 })).orders.map(o => o.id)
    ).toEqual([100]);
    expect(
      await admin.adminAssignHistory({ supplierId: 1, orderIds: [300] })
    ).toEqual({ assignedCount: 1 });
    expect(
      (await member.workspace({ supplierId: 1 })).orders.map(o => o.id)
    ).toEqual([100, 300]);
    expect(
      await admin.adminAssignHistory({ supplierId: 1, orderIds: [300] })
    ).toEqual({ assignedCount: 0 });
  });
  it("history confirmation rejects different supplier/series and rolls back earlier rows", async () => {
    const m = mockDatabase();
    m.state.orders.push(
      order(300),
      order(301, { ingredients: JSON.stringify([line(other)]) })
    );
    const admin = createMibanSupplierRouter(m.factory).createCaller(
      ctx(99, "super_admin")
    );
    await expect(
      admin.adminAssignHistory({ supplierId: 1, orderIds: [300, 301] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.state.scopes.some(s => s.orderId === 300)).toBe(false);
    expect(m.state.audits).toEqual([]);
    m.state.orders[1].ingredients = JSON.stringify([line()]);
    await expect(
      admin.adminAssignHistory({ supplierId: 1, orderIds: [200] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("safe Zod contracts reject invalid days, logistics and batch >100", async () => {
    const caller = createMibanSupplierRouter(
      mockDatabase().factory
    ).createCaller(ctx(10));
    await expect(
      caller.workspace({ supplierId: 1, filters: { dateFrom: "2026-02-30" } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.ship({
        supplierId: 1,
        orderId: 100,
        trackingCompany: " ",
        trackingNo: "1",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.batchShip({
        supplierId: 1,
        rows: Array.from({ length: 101 }, () => ({
          orderNo: "AA100",
          trackingCompany: "SF",
          trackingNo: "1",
        })),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("pause cannot drop series and attributed history prevents detaching series", async () => {
    const m = mockDatabase();
    const admin = createMibanSupplierRouter(m.factory).createCaller(
      ctx(99, "super_admin")
    );
    await expect(
      admin.adminSave({
        id: 1,
        name: "one",
        active: false,
        seriesKeys: [],
        userIds: [10],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      admin.adminSave({
        id: 1,
        name: "one",
        active: true,
        seriesKeys: [],
        userIds: [10],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.state.suppliers[0].active).toBe(1);
    expect(
      m.state.series.find(s => s.seriesKey === first.seriesKey)!.supplierId
    ).toBe(1);
  });
  it("administrator legacy endpoint cannot bypass preview; unified fulfillment is audited", async () => {
    const m = mockDatabase();
    const admin = createMibanSupplierRouter(m.factory).createCaller(
      ctx(99, "super_admin")
    );
    await expect(
      admin.ship({
        supplierId: 1,
        orderId: 200,
        trackingCompany: "SF",
        trackingNo: "1",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await fulfill(admin, {
      supplierId: 1,
      orderId: 100,
      trackingCompany: "SF",
      trackingNo: "1",
    });
    expect(m.state.audits[0][0]).toBe(99);
    expect((await admin.access()).suppliers).toHaveLength(2);
  });
  it("missing tables fail closed without returning false access or lazy DDL", async () => {
    const m = mockDatabase();
    vi.mocked(m.db.execute).mockRejectedValue(new Error("ER_NO_SUCH_TABLE"));
    await expect(
      createMibanSupplierRouter(m.factory).createCaller(ctx(10)).access()
    ).rejects.toThrow("ER_NO_SUCH_TABLE");
    expect(m.db.rollback).toHaveBeenCalledTimes(1);
  });
  it("adminSearchUsers returns only identity fields and escapes wildcard input", async () => {
    const m = mockDatabase();
    const admin = createMibanSupplierRouter(m.factory).createCaller(
      ctx(99, "super_admin")
    );
    expect(await admin.adminSearchUsers({ keyword: "%_!" })).toEqual([
      { id: 10, name: "员工10", username: "user10" },
    ]);
    const query = m.sqlLog.find(q =>
      q.sql.startsWith("SELECT id,name,COALESCE(username,''")
    )!;
    expect(query.values).toEqual(["%_!", "%!%!_!!%", "%!%!_!!%"]);
    expect(query.sql).toContain("LIMIT 20");
    expect(query.sql).not.toContain("balance");
  });
  it("historical snapshot series is immutable even when supplier is still unassigned", async () => {
    const m = mockDatabase();
    m.state.orders.push(order(300));
    m.state.scopes.push({
      orderId: 300,
      supplierId: null,
      seriesKey: other.seriesKey,
    });
    const admin = createMibanSupplierRouter(m.factory).createCaller(
      ctx(99, "super_admin")
    );
    expect((await admin.adminHistory({ supplierId: 1 })).unresolvedCount).toBe(
      1
    );
    await expect(
      admin.adminAssignHistory({ supplierId: 1, orderIds: [300] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.state.scopes.find(s => s.orderId === 300)!.seriesKey).toBe(
      other.seriesKey
    );
  });
  it("actual createOrder hook uses same transaction and audit failure rolls back inserted order + scope", async () => {
    const m = mockDatabase();
    const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
    const start = source.indexOf("async function createOrder(");
    const end = source.indexOf("// 米伴商城沿用", start);
    const isolated = transpileModule(source.slice(start, end), {
      compilerOptions: {
        module: ModuleKind.ESNext,
        target: ScriptTarget.ES2020,
      },
    }).outputText;
    const mockDrizzle = vi.fn((transaction: SupplierTransactionConnection) => {
      expect(transaction).toBe(m.db);
      return {
        insert: () => ({
          values: async (data: Order) => {
            m.state.orders.push(data);
            return [{ insertId: data.id }];
          },
        }),
      };
    });
    const createOrder = new Function(
      "drizzle",
      "getDb",
      "mibanOrders",
      "resolveSupplierOrderScope",
      "snapshotMibanSupplierOrderScope",
      "TRPCError",
      "console",
      `${isolated}\nreturn createOrder;`
    )(
      mockDrizzle,
      vi.fn(),
      {},
      resolveSupplierOrderScope,
      snapshotMibanSupplierOrderScope,
      TRPCError,
      { log: vi.fn(), error: vi.fn() }
    ) as (
      data: Order,
      transaction?: SupplierTransactionConnection
    ) => Promise<number>;
    m.setFailAudit();
    await expect(
      withSupplierTransaction(m.factory, db =>
        createOrder(order(333), db as SupplierTransactionConnection)
      )
    ).rejects.toThrow("audit unavailable");
    expect(m.state.orders.some(o => o.id === 333)).toBe(false);
    expect(m.state.scopes.some(s => s.orderId === 333)).toBe(false);
    expect(m.db.rollback).toHaveBeenCalledTimes(1);
  });
  it("new-order snapshot for paused supplier remains unassigned", async () => {
    const m = mockDatabase();
    m.state.suppliers[0].active = 0;
    await withSupplierTransaction(m.factory, db =>
      snapshotMibanSupplierOrderScope(db, 333, [line()], 10)
    );
    expect(m.state.scopes.find(s => s.orderId === 333)).toMatchObject({
      seriesKey: first.seriesKey,
      supplierId: null,
    });
  });
});
