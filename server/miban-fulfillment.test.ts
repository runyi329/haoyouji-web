import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import {
  createMibanSupplierRouter,
  authorizeSupplier,
  type SupplierTransactionConnection,
  type SupplierActor,
} from "./miban-supplier";
import {
  createFulfillmentService,
  type FulfillmentOrder,
} from "./miban-fulfillment";
import { supplierCatalog } from "../shared/miban-supplier";
import {
  normalizeTrackingCompany,
  normalizeTrackingNo,
  type FulfillmentRow,
  type FulfillmentMode,
} from "../shared/miban-fulfillment";
vi.mock("./db", () => ({
  getDbTransactionConnection: vi.fn(() => {
    throw new Error("REAL DB FORBIDDEN");
  }),
  getActiveZidingLoginBlock: vi.fn(async () => null),
  setCurrentIsGuest: vi.fn(),
}));
const product = supplierCatalog().products[0];
const ingredients = JSON.stringify([
  {
    kind: "limited_product",
    productKey: product.productKey,
    skuId: product.skus[0].id,
    quantity: 1,
  },
]);
function order(
  id: number,
  extra: Partial<FulfillmentOrder> = {}
): FulfillmentOrder {
  return {
    id,
    orderNo: `AA${id}`,
    status: "pending",
    receiverName: "收货人",
    receiverPhone: "13800000000",
    receiverAddress: "地址",
    trackingCompany: null,
    trackingNo: null,
    shippedAt: null,
    autoConfirmAt: null,
    ingredients,
    userId: 50,
    updatedAt: "2026-11-23 10:00:00",
    ...extra,
  };
}
const row = (
  id = 100,
  trackingNo = "000012345678901234567890"
): FulfillmentRow => ({
  orderNo: `AA${id}`,
  trackingCompany: "SF",
  trackingNo,
});
function context(actor: SupplierActor | null): TrpcContext {
  return {
    user: actor as TrpcContext["user"],
    realUser: null,
    isViewingAs: false,
    isGuest: false,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}
const member = { id: 10, role: "parent" },
  admin = { id: 99, role: "super_admin" };
function fixture() {
  let state = {
    suppliers: [{ id: 1, name: "供货商", active: 1 }],
    members: [{ supplierId: 1, userId: 10, active: 1 }],
    orders: [
      order(100),
      order(101),
      order(200, { ingredients: JSON.stringify([{ riceId: 1 }]) }),
    ],
    scopes: [100, 101].map(orderId => ({
      orderId,
      seriesKey: product.seriesKey,
      supplierId: 1 as number | null,
    })),
    audits: [] as { id: number; values: unknown[] }[],
  };
  const log: { connection: number; sql: string; values: unknown[] }[] = [];
  const connections: SupplierTransactionConnection[] = [];
  let heldBy: number | null = null;
  let wake: (() => void)[] = [];
  let failAudit = false,
    failRelease = false,
    failLock = false;
  let commits = 0;
  let onCommit: ((count: number) => void) | undefined;
  const factory = async () => {
    const id = connections.length;
    let snapshot: typeof state | undefined;
    const db: SupplierTransactionConnection & {
      destroy: ReturnType<typeof vi.fn>;
    } = {
      beginTransaction: vi.fn(async () => {
        snapshot = structuredClone(state);
      }),
      commit: vi.fn(async () => {
        snapshot = undefined;
        onCommit?.(++commits);
      }),
      rollback: vi.fn(async () => {
        if (snapshot) state = snapshot;
        snapshot = undefined;
      }),
      release: vi.fn(),
      destroy: vi.fn(),
      execute: vi.fn(async (sql, values = []) => {
        log.push({ connection: id, sql, values });
        const result = (rows: unknown) => [rows, []];
        if (sql.includes("GET_LOCK")) {
          if (failLock) return result([{ acquired: 0 }]);
          while (heldBy !== null)
            await new Promise<void>(resolve => {
              wake.push(resolve);
            });
          heldBy = id;
          return result([{ acquired: 1 }]);
        }
        if (sql.includes("RELEASE_LOCK")) {
          expect(heldBy).toBe(id);
          heldBy = null;
          wake.splice(0).forEach(resolve => resolve());
          if (failRelease) throw new Error("release unavailable");
          return result([{ released: 1 }]);
        }
        if (sql.startsWith("SELECT id,name,active FROM miban_suppliers"))
          return result(state.suppliers.filter(s => s.id === values[0]));
        if (sql.startsWith("SELECT active FROM miban_supplier_members"))
          return result(
            state.members.filter(
              m => m.supplierId === values[0] && m.userId === values[1]
            )
          );
        if (sql.startsWith("SELECT o.id,o.orderNo"))
          return result(
            state.orders
              .filter(o =>
                sql.includes("o.orderNo=?")
                  ? o.orderNo === values[0]
                  : o.id === values[0]
              )
              .map(o => ({ ...o }))
          );
        if (sql.startsWith("SELECT order_id AS orderId"))
          return result(
            state.scopes
              .filter(s => s.orderId === values[0])
              .map(s => ({ ...s }))
          );
        if (sql.startsWith("SELECT id FROM miban_supplier_audit"))
          return result(
            state.audits
              .filter(a => a.values[2] === values[0])
              .slice(-1)
              .map(a => ({ id: a.id }))
          );
        if (
          sql.startsWith(
            "SELECT id,trackingCompany,trackingNo FROM miban_orders"
          )
        )
          return result(
            state.orders.filter(
              o => o.id !== values[0] && o.trackingNo !== null
            )
          );
        if (sql.startsWith("UPDATE miban_orders")) {
          expect(heldBy).toBe(id);
          const first = sql.includes("shippedAt=?"),
            current = state.orders.find(o => o.id === values[first ? 4 : 2])!;
          Object.assign(current, {
            status: "shipped",
            trackingCompany: values[0],
            trackingNo: values[1],
          });
          if (first)
            Object.assign(current, {
              shippedAt: values[2],
              autoConfirmAt: values[3],
            });
          return result({ affectedRows: 1 });
        }
        if (sql.startsWith("INSERT INTO miban_supplier_audit")) {
          expect(heldBy).toBe(id);
          if (failAudit) throw new Error("audit unavailable");
          state.audits.push({ id: state.audits.length + 1, values });
          return result({ insertId: state.audits.length });
        }
        throw new Error(`Unhandled mock SQL: ${sql}`);
      }),
    };
    connections.push(db);
    return db;
  };
  const service = createFulfillmentService(factory, authorizeSupplier);
  return {
    factory,
    service,
    log,
    connections,
    get state() {
      return state;
    },
    get heldBy() {
      return heldBy;
    },
    setAuditFailure() {
      failAudit = true;
    },
    setReleaseFailure() {
      failRelease = true;
    },
    setLockFailure() {
      failLock = true;
    },
    setCommitHook(fn: (count: number) => void) {
      commits = 0;
      onCommit = fn;
    },
  };
}
type Fixture = ReturnType<typeof fixture>;
async function plan(
  m: Fixture,
  actor = member,
  rows = [row()],
  mode: FulfillmentMode = "ship",
  supplierId: number | undefined = 1
) {
  const preview = await m.service.preview(actor, { supplierId, mode, rows });
  return {
    supplierId,
    mode,
    rows: preview.rows.map(r => ({
      orderNo: r.orderNo,
      trackingCompany: r.trackingCompany,
      trackingNo: r.trackingNo,
      revision: r.revision ?? "0".repeat(64),
    })),
  };
}
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("DEV_BYPASS_AUTH", "false");
});

describe("unified fulfillment shared normalization", () => {
  it("canonicalizes common carrier aliases without parsing long tracking text", () => {
    for (const alias of ["SF", " s-f ", "顺丰", "顺丰速运"])
      expect(normalizeTrackingCompany(alias)).toBe("顺丰速运");
    expect(normalizeTrackingCompany("中通")).toBe("中通快递");
    expect(normalizeTrackingNo(" 000012345678901234567890 ")).toBe(
      "000012345678901234567890"
    );
  });
});
describe("unified fulfillment authorization and versions (mock only)", () => {
  it("root supplier namespace is wired; preview is authenticated mutation without writes", async () => {
    const source = readFileSync(
      new URL("./routers.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("supplier: mibanSupplierRouter");
    const m = fixture(),
      router = createMibanSupplierRouter(m.factory);
    expect(router._def.procedures.fulfillmentPreview._def.type).toBe(
      "mutation"
    );
    await expect(
      router
        .createCaller(context(null))
        .fulfillmentPreview({ mode: "ship", rows: [row()] })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const preview = await router
      .createCaller(context(member))
      .fulfillmentPreview({ supplierId: 1, mode: "ship", rows: [row()] });
    expect(preview.rows[0]).toMatchObject({
      index: 0,
      ok: true,
      trackingCompany: "顺丰速运",
      order: { receiverName: "收货人" },
    });
    expect(preview.rows[0].revision).toMatch(/^[a-f0-9]{64}$/);
    expect(m.log.every(q => q.sql.startsWith("SELECT"))).toBe(true);
    expect(m.state.audits).toHaveLength(0);
  });
  it.each(["missing supplier", "paused", "revoked", "non-member"])(
    "denies %s before querying any order",
    async kind => {
      const m = fixture();
      if (kind === "paused") m.state.suppliers[0].active = 0;
      if (kind === "revoked") m.state.members[0].active = 0;
      const actor = kind === "non-member" ? { id: 11, role: "parent" } : member;
      await expect(
        m.service.preview(actor, {
          supplierId: kind === "missing supplier" ? undefined : 1,
          mode: "ship",
          rows: [row()],
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(m.log.some(q => q.sql.includes("FROM miban_orders"))).toBe(false);
    }
  );
  it.each(["wrong owner", "no scope", "unknown product", "wrong series"])(
    "denies %s without leaking private order DTO or version",
    async kind => {
      const m = fixture();
      m.state.orders[0].receiverName = "PRIVATE NAME";
      if (kind === "wrong owner") m.state.scopes[0].supplierId = 2;
      if (kind === "no scope") m.state.scopes.splice(0, 1);
      if (kind === "unknown product")
        m.state.orders[0].ingredients = JSON.stringify([
          {
            kind: "limited_product",
            productKey: "unknown",
            skuId: "unknown",
            quantity: 1,
          },
        ]);
      if (kind === "wrong series") m.state.scopes[0].seriesKey = "other";
      const preview = await m.service.preview(member, {
        supplierId: 1,
        mode: "ship",
        rows: [row()],
      });
      expect(preview.rows[0]).toEqual({
        index: 0,
        ...row(),
        trackingCompany: "顺丰速运",
        ok: false,
        error: "无此供货商或订单权限",
      });
      expect(JSON.stringify(preview)).not.toContain("PRIVATE NAME");
      const applied = await m.service.apply(member, {
        supplierId: 1,
        mode: "ship",
        rows: [{ ...row(), revision: "0".repeat(64) }],
      });
      expect(applied.successCount).toBe(0);
      expect(m.state.orders[0].status).toBe("pending");
    }
  );
  it("admin can fulfill paused, unassigned and ordinary orders without supplierId", async () => {
    const m = fixture();
    m.state.suppliers[0].active = 0;
    m.state.scopes[0].supplierId = null;
    const input = await plan(
      m,
      admin,
      [row(), row(200, "ORDINARY")],
      "ship",
      undefined
    );
    // helper default argument uses 1; explicitly exercise absent supplierId at API boundary.
    const preview = await m.service.preview(admin, {
      mode: "ship",
      rows: [row(), row(200, "ORDINARY")],
    });
    expect(preview.validCount).toBe(2);
    input.supplierId = undefined;
    input.rows = preview.rows.map(r => ({ ...r, revision: r.revision! }));
    expect((await m.service.apply(admin, input)).successCount).toBe(2);
    expect(m.state.audits.map(a => a.values.slice(0, 4))).toEqual([
      [99, null, 100, "ship"],
      [99, null, 200, "ship"],
    ]);
  });
  it("two actors cannot silently overwrite the same order, and replay cannot write audit twice", async () => {
    const m = fixture(),
      one = await plan(m),
      two = await plan(m, admin);
    expect((await m.service.apply(member, one)).successCount).toBe(1);
    const changed = await m.service.apply(admin, two),
      replay = await m.service.apply(member, one);
    expect(changed.results[0].error).toContain("重新预览");
    expect(replay.results[0].error).toContain("重复提交");
    expect(m.state.audits).toHaveLength(1);
  });
  it.each([
    "receiverName",
    "receiverPhone",
    "receiverAddress",
    "status",
    "trackingCompany",
    "trackingNo",
    "shippedAt",
    "autoConfirmAt",
    "updatedAt",
  ] as const)("invalidates preview when %s changes", async field => {
    const m = fixture(),
      input = await plan(m);
    (m.state.orders[0] as unknown as Record<string, unknown>)[field] =
      "changed";
    expect((await m.service.apply(member, input)).results[0]).toMatchObject({
      success: false,
      error: expect.stringContaining("重新预览"),
    });
    expect(m.state.audits).toHaveLength(0);
  });
  it("scope reassignment invalidates admin revision and removes supplier row access", async () => {
    const m = fixture(),
      input = await plan(m, admin),
      supplierPlan = await plan(m);
    m.state.scopes[0].supplierId = 2;
    expect((await m.service.apply(admin, input)).results[0].error).toContain(
      "重新预览"
    );
    expect((await m.service.apply(member, supplierPlan)).results[0].error).toBe(
      "无此供货商或订单权限"
    );
  });
  it.each(["mode", "trackingNo", "trackingCompany", "actor", "supplierId"])(
    "HMAC binds %s, so changed plans cannot reuse a token",
    async key => {
      const m = fixture(),
        input = await plan(m, admin);
      if (key === "mode") input.mode = "correct";
      if (key === "trackingNo") input.rows[0].trackingNo = "other";
      if (key === "trackingCompany") input.rows[0].trackingCompany = "中通";
      if (key === "supplierId") input.supplierId = undefined;
      const result = await m.service.apply(
        key === "actor" ? member : admin,
        input
      );
      expect(result.results[0]).toMatchObject({
        success: false,
        error: expect.stringContaining("重新预览"),
      });
      expect(m.state.audits).toHaveLength(0);
    }
  );
  it("revocation during batch is reauthorized inside each row transaction", async () => {
    const m = fixture(),
      input = await plan(m, member, [row(), row(101, "SECOND")]);
    m.setCommitHook(count => {
      if (count === 2) m.state.members[0].active = 0;
    });
    const result = await m.service.apply(member, input);
    expect(result.successCount).toBe(1);
    expect(result.results[1].error).toBe("无此供货商或订单权限");
    expect(m.state.orders[1].status).toBe("pending");
    expect(
      m.log.filter(q =>
        q.sql.startsWith("SELECT active FROM miban_supplier_members")
      ).length
    ).toBeGreaterThanOrEqual(5);
  });
});
describe("unified fulfillment state machine, duplication and atomic audit", () => {
  it.each(["pending", "confirmed", "packing"])(
    "ships %s with first timestamps and full before/after audit",
    async status => {
      const m = fixture();
      m.state.orders[0].status = status;
      const result = await m.service.apply(
        member,
        await plan(m),
        new Date("2026-11-23T02:00:00Z")
      );
      expect(result.successCount).toBe(1);
      expect(m.state.orders[0]).toMatchObject({
        status: "shipped",
        shippedAt: "2026-11-23 10:00:00",
        autoConfirmAt: "2026-12-23 10:00:00",
        trackingNo: row().trackingNo,
      });
      const audit = m.state.audits[0].values;
      expect(JSON.parse(String(audit[4]))).toMatchObject({
        status,
        receiverAddress: "地址",
        trackingNo: null,
        scope: { supplierId: 1 },
      });
      expect(JSON.parse(String(audit[5]))).toMatchObject({
        status: "shipped",
        shippedAt: "2026-11-23 10:00:00",
        trackingNo: row().trackingNo,
      });
    }
  );
  it.each(["shipped", "cancelled", "delivered"])(
    "ship rejects %s and never writes",
    async status => {
      const m = fixture();
      m.state.orders[0].status = status;
      expect(
        (await m.service.preview(admin, { mode: "ship", rows: [row()] }))
          .validCount
      ).toBe(0);
      expect(m.state.audits).toHaveLength(0);
    }
  );
  it("normal shipping cannot cover an existing tracking number", async () => {
    const m = fixture();
    m.state.orders[0].trackingNo = "OLD";
    const preview = await m.service.preview(member, {
      supplierId: 1,
      mode: "ship",
      rows: [row()],
    });
    expect(preview.rows[0].error).toContain("不能覆盖");
  });
  it.each(["pending", "confirmed", "packing", "cancelled", "delivered"])(
    "correct rejects %s",
    async status => {
      const m = fixture();
      m.state.orders[0].status = status;
      expect(
        (await m.service.preview(admin, { mode: "correct", rows: [row()] }))
          .validCount
      ).toBe(0);
    }
  );
  it.each([null, "2026-10-01 10:00:00"])(
    "correction preserves first timestamps including legacy %s",
    async shippedAt => {
      const m = fixture();
      Object.assign(m.state.orders[0], {
        status: "shipped",
        trackingNo: "OLD",
        trackingCompany: "SF",
        shippedAt,
        autoConfirmAt: "2026-10-31 10:00:00",
      });
      expect(
        (
          await m.service.apply(
            member,
            await plan(m, member, [row()], "correct")
          )
        ).successCount
      ).toBe(1);
      expect(m.state.orders[0].shippedAt).toBe(shippedAt);
      expect(m.state.orders[0].autoConfirmAt).toBe("2026-10-31 10:00:00");
      expect(m.log.find(q => q.sql.startsWith("UPDATE"))!.sql).not.toContain(
        "shippedAt"
      );
    }
  );
  it("audit sequence invalidates an old correction token after logistics ABA, even within same SQL second", async () => {
    const m = fixture();
    Object.assign(m.state.orders[0], {
      status: "shipped",
      trackingCompany: "SF",
      trackingNo: "OLD",
    });
    const stale = await plan(m, member, [row(100, "THIRD")], "correct");
    await m.service.apply(
      member,
      await plan(m, member, [row(100, "NEW")], "correct")
    );
    await m.service.apply(
      member,
      await plan(m, member, [row(100, "OLD")], "correct")
    );
    // Reset to the exact original legacy alias too: audit version remains the difference.
    m.state.orders[0].trackingCompany = "SF";
    expect((await m.service.apply(member, stale)).results[0].error).toContain(
      "重新预览"
    );
    expect(m.state.audits).toHaveLength(2);
  });
  it("rejects unchanged correction and duplicate order rows", async () => {
    const m = fixture();
    Object.assign(m.state.orders[0], {
      status: "shipped",
      trackingCompany: "顺丰",
      trackingNo: row().trackingNo,
    });
    expect(
      (
        await m.service.preview(member, {
          supplierId: 1,
          mode: "correct",
          rows: [row()],
        })
      ).rows[0].error
    ).toContain("无需更正");
    const preview = await m.service.preview(admin, {
      mode: "ship",
      rows: [row(101, "A"), row(101, "B")],
    });
    expect(preview.validCount).toBe(0);
    expect(preview.rows.every(r => r.error?.includes("订单号重复"))).toBe(true);
  });
  it("duplicate submissions within apply fail all duplicate rows rather than silently choosing one", async () => {
    const m = fixture(),
      input = await plan(m);
    input.rows.push({ ...input.rows[0] });
    const result = await m.service.apply(member, input);
    expect(result.successCount).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(m.state.audits).toHaveLength(0);
  });
  it("carrier aliases detect cross-order same tracking in a batch and existing orders", async () => {
    const m = fixture();
    const preview = await m.service.preview(admin, {
      mode: "ship",
      rows: [row(), { ...row(101), trackingCompany: "顺丰" }],
    });
    expect(preview.validCount).toBe(0);
    Object.assign(m.state.orders[2], {
      trackingCompany: " sf ",
      trackingNo: row().trackingNo,
    });
    expect(
      (await m.service.preview(admin, { mode: "ship", rows: [row()] })).rows[0]
        .error
    ).toContain("其他订单");
  });
  it("concurrent cross-order same tracking accepts exactly one and releases each session lock", async () => {
    const m = fixture(),
      one = await plan(m, admin, [row()]),
      two = await plan(m, admin, [row(101)]);
    const result = await Promise.all([
      m.service.apply(admin, one),
      m.service.apply(admin, two),
    ]);
    expect(result.map(r => r.successCount).sort()).toEqual([0, 1]);
    expect(m.state.audits).toHaveLength(1);
    expect(m.heldBy).toBeNull();
    for (const locked of m.log.filter(q => q.sql.includes("GET_LOCK"))) {
      expect(
        m.log.some(
          q =>
            q.connection === locked.connection && q.sql.includes("RELEASE_LOCK")
        )
      ).toBe(true);
      expect(locked.values).toEqual(["miban.fulfillment.v1"]);
    }
    expect(
      m.log.some(
        q =>
          q.sql.startsWith("SELECT id,trackingCompany") &&
          q.sql.endsWith("FOR UPDATE")
      )
    ).toBe(true);
  });
  it("failed row retry doesn't replay successful rows and reports original 0-based indexes", async () => {
    const m = fixture(),
      input = await plan(m, admin, [row(), row(101, "SECOND")]);
    m.state.orders[1].receiverAddress = "NEW ADDRESS";
    const first = await m.service.apply(admin, input);
    expect(first.results).toMatchObject([
      { index: 0, success: true },
      { index: 1, success: false },
    ]);
    const retry = await m.service.apply(
      admin,
      await plan(m, admin, [row(101, "SECOND")])
    );
    expect(retry.successCount).toBe(1);
    expect(m.state.audits.map(a => a.values[2])).toEqual([100, 101]);
  });
  it("audit failure rolls back shipment, keeps timestamps null and releases same-session lock", async () => {
    const m = fixture(),
      input = await plan(m);
    m.setAuditFailure();
    expect((await m.service.apply(member, input)).successCount).toBe(0);
    expect(m.state.orders[0]).toMatchObject({
      status: "pending",
      trackingNo: null,
      shippedAt: null,
      autoConfirmAt: null,
    });
    expect(m.connections.at(-1)!.rollback).toHaveBeenCalledOnce();
    expect(m.connections.at(-1)!.release).toHaveBeenCalledOnce();
    expect(m.heldBy).toBeNull();
  });
  it("named lock timeout doesn't start a row transaction or write", async () => {
    const m = fixture(),
      input = await plan(m);
    m.setLockFailure();
    expect((await m.service.apply(member, input)).results[0].error).toContain(
      "其他物流操作"
    );
    expect(m.connections.at(-1)!.beginTransaction).not.toHaveBeenCalled();
    expect(m.connections.at(-1)!.release).toHaveBeenCalled();
    expect(m.state.audits).toHaveLength(0);
  });
  it("uncertain named lock release destroys the physical session rather than returning it to pool", async () => {
    const m = fixture(),
      input = await plan(m);
    m.setReleaseFailure();
    expect((await m.service.apply(member, input)).successCount).toBe(1);
    expect(
      (
        m.connections.at(-1)! as SupplierTransactionConnection & {
          destroy: unknown;
        }
      ).destroy
    ).toHaveBeenCalledOnce();
    expect(m.connections.at(-1)!.release).not.toHaveBeenCalled();
  });
  it.each(["", "1e20", "=A1", "A B", "a\nB", "9".repeat(65)])(
    "rejects unsafe/lossy tracking %s as a row error",
    async trackingNo => {
      const m = fixture();
      expect(
        (
          await m.service.preview(admin, {
            mode: "ship",
            rows: [row(100, trackingNo), row(101, "VALID")],
          })
        ).validCount
      ).toBe(1);
    }
  );
  it("max100 and malformed revision are rejected by actual router without any write", async () => {
    const m = fixture(),
      caller = createMibanSupplierRouter(m.factory).createCaller(
        context(admin)
      );
    await expect(
      caller.fulfillmentPreview({
        mode: "ship",
        rows: Array.from({ length: 101 }, () => row()),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.fulfillmentApply({
        mode: "ship",
        rows: [{ ...row(), revision: "" }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.connections).toHaveLength(0);
  });
});
describe("legacy entry points cannot bypass unified revision", () => {
  it("supplier ship and batchShip explicitly require preview but still enforce ordinary supplier permissions", async () => {
    const m = fixture(),
      caller = createMibanSupplierRouter(m.factory).createCaller(
        context(member)
      );
    await expect(
      caller.ship({
        supplierId: 1,
        orderId: 100,
        trackingCompany: "SF",
        trackingNo: "A",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("revision"),
    });
    await expect(
      caller.batchShip({ supplierId: 1, rows: [row()] })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("revision"),
    });
    expect(m.state.audits).toHaveLength(0);
    expect(m.state.orders[0].status).toBe("pending");
  });
  it("administrator status helper rejects shipped and logistics hidden inside non-logistics status before DB", async () => {
    const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
    const start = source.indexOf("async function updateOrderStatus("),
      end = source.indexOf("async function getAllCommissionConfigs", start);
    const isolated = transpileModule(source.slice(start, end), {
      compilerOptions: {
        module: ModuleKind.ESNext,
        target: ScriptTarget.ES2020,
      },
    }).outputText;
    const getDb = vi.fn();
    const update = new Function(
      "getDb",
      "rejectLegacyFulfillment",
      `${isolated};return updateOrderStatus;`
    )(getDb, () => {
      throw new TRPCError({ code: "BAD_REQUEST", message: "preview required" });
    });
    await expect(update(100, "shipped")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      update(100, "confirmed", "HIDDEN", "SF")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDb).not.toHaveBeenCalled();
    const importStart = source.indexOf(
        "importTrackingNumbers: mibanAdminProcedure"
      ),
      importEnd = source.indexOf("// 更新管理员备注", importStart);
    expect(source.slice(importStart, importEnd)).toContain(
      ".mutation(() => rejectLegacyFulfillment())"
    );
    expect(source.slice(importStart, importEnd)).not.toContain(
      ".update(mibanOrders)"
    );
  });
});
