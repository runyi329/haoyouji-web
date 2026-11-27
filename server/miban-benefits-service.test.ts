import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rule } from "../shared/miban-benefits";
import { calculateBenefits } from "../shared/miban-benefits";
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({
  getDbConnection: vi.fn(async () => holder.db),
  getDbTransactionConnection: vi.fn(async () => holder.db),
  getActiveZidingLoginBlock: vi.fn(async () => null),
  setCurrentIsGuest: vi.fn(),
}));
vi.mock("./_core/env", () => ({
  ENV: { cookieSecret: "test-secret-never-for-app-1234" },
}));
import {
  ensureMibanBenefitsInfrastructure,
  getMibanBenefitQuote,
  assertMibanBenefitQuote,
  saveMibanBenefitRule,
  setMibanBenefitState,
  recordMibanBenefitUse,
  restoreMibanBenefitsForCancelledOrder,
  assertMibanBenefitOrderCanDelete,
  readMibanBenefitsCatalog,
  validateMibanBenefitRule,
  getMyMibanBenefits,
  getMibanBenefitsUsers,
} from "./miban-benefits";
import { mibanBenefitsRouter } from "./miban-benefits-router";
import { mibanLimitedProducts } from "../shared/miban-limited-products";
const STORE = "miban-limited";
const admin = { id: 1, role: "super_admin" };
const cart = [
  {
    productKey: "midaniang-classic-rice-gift",
    skuId: "classic-500g-6",
    quantity: 1,
  },
];
function makeRule(patch: Partial<Rule> = {}): Rule {
  return {
    id: "r",
    userId: "7",
    kind: "rate",
    name: "真实权益",
    scope: "all",
    targets: [],
    value: 8,
    threshold: 0,
    starts: "2026-11-27",
    ends: "2026-12-27",
    unlimited: true,
    maxUses: 0,
    uses: 0,
    state: "active",
    note: "仅内部",
    created: "2026-11-27",
    version: 1,
    ...patch,
  };
}
function dbRow(r: Rule) {
  return {
    id: r.id,
    user_id: Number(r.userId),
    kind: r.kind,
    state: r.state,
    starts: r.starts,
    ends: r.ends,
    unlimited: Number(r.unlimited),
    max_uses: r.maxUses,
    uses: r.uses,
    version: r.version,
    rule_json: JSON.stringify(r),
  };
}
class FakeDB {
  calls: Array<{ sql: string; values: any[] }> = [];
  rules: any[] = [];
  requests: any[] = [];
  usages: any[] = [];
  links: any[] = [];
  audits: any[] = [];
  orders = new Map<
    number,
    { status: string; userId: number; totalPrice?: string }
  >();
  states = mibanLimitedProducts.flatMap(p =>
    p.skus.map(s => ({
      product_key: p.key,
      sku_id: s.id,
      is_active: 1,
      stock_qty: 1000,
    }))
  );
  snapshot: any;
  releases = 0;
  commits = 0;
  rollbacks = 0;
  failSql = "";
  async beginTransaction() {
    this.snapshot = structuredClone({
      rules: this.rules,
      requests: this.requests,
      usages: this.usages,
      links: this.links,
      audits: this.audits,
    });
  }
  async commit() {
    this.commits++;
  }
  async rollback() {
    this.rollbacks++;
    Object.assign(this, this.snapshot);
  }
  release() {
    this.releases++;
  }
  async end() {}
  async execute(sql: string, values: any[] = []): Promise<any> {
    this.calls.push({ sql, values });
    if (this.failSql && sql.includes(this.failSql))
      throw Object.assign(new Error("test write failure"), {
        code: "TEST_FAILURE",
      });
    if (sql.startsWith("CREATE TABLE")) return [{ affectedRows: 0 }];
    if (sql.includes("COALESCE(balance"))
      return [[{ id: values[0], balance: 0, cny_balance: 0 }]];
    if (sql.includes("SELECT * FROM miban_benefit_rules"))
      return [
        this.rules
          .filter(r => r.user_id === values[1] && values[0] === STORE)
          .map(r => ({ ...r })),
      ];
    if (sql.includes("FROM miban_limited_sku_state"))
      return [this.states.map(s => ({ ...s }))];
    if (sql.includes("SELECT * FROM miban_benefit_requests"))
      return [
        this.requests.filter(
          r =>
            r.storefront === values[0] &&
            r.user_id === values[1] &&
            r.request_id === values[2]
        ),
      ];
    if (sql.startsWith("INSERT INTO miban_benefit_requests")) {
      this.requests.push({
        storefront: values[0],
        user_id: values[1],
        request_id: values[2],
        operator_id: values[3],
        input_hash: values[4],
        response_json: values[5],
      });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("INSERT INTO miban_benefit_rules")) {
      this.rules.push(dbRow(JSON.parse(values[11])));
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE miban_benefit_rules")) {
      const r = this.rules.find(
        r =>
          r.user_id === values[11] &&
          r.id === values[12] &&
          r.version === values[13]
      );
      if (!r) return [{ affectedRows: 0 }];
      Object.assign(r, dbRow(JSON.parse(values[8])));
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("INSERT INTO miban_benefit_audits")) {
      this.audits.push({ values });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("SELECT * FROM miban_benefit_usages"))
      return [
        this.usages.filter(
          u =>
            u.storefront === values[0] &&
            u.checkout_key === values[1] &&
            u.rule_id === values[2]
        ),
      ];
    if (sql.startsWith("INSERT INTO miban_benefit_usages")) {
      const id = this.usages.length + 1;
      this.usages.push({
        id,
        storefront: values[0],
        user_id: values[1],
        checkout_key: values[2],
        rule_id: values[3],
        snapshot_json: values[4],
        restored: 0,
      });
      return [{ insertId: id }];
    }
    if (sql.startsWith("INSERT INTO miban_benefit_usage_orders")) {
      this.links.push({
        storefront: values[0],
        usage_id: values[1],
        user_id: values[2],
        order_id: values[3],
        total_cents: values[4],
      });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("SELECT u.* FROM miban_benefit_usages"))
      return [
        this.usages.filter(
          u =>
            u.storefront === values[0] &&
            u.user_id === values[1] &&
            this.links.some(
              l => l.usage_id === u.id && l.order_id === values[2]
            )
        ),
      ];
    if (sql.includes("SELECT x.order_id"))
      return [
        this.links
          .filter(
            l =>
              l.storefront === values[0] &&
              l.user_id === values[1] &&
              l.usage_id === values[2]
          )
          .sort((a, b) => a.order_id - b.order_id)
          .map(l => ({ ...l, ...this.orders.get(l.order_id) })),
      ];
    if (sql.startsWith("UPDATE miban_benefit_usages")) {
      const u = this.usages.find(
        u => u.user_id === values[2] && u.id === values[3] && !u.restored
      );
      if (!u) return [{ affectedRows: 0 }];
      u.restored = 1;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("SELECT usage_id FROM miban_benefit_usage_orders"))
      return [
        this.links
          .filter(
            l =>
              l.storefront === values[0] &&
              l.user_id === values[1] &&
              l.order_id === values[2]
          )
          .slice(0, 1),
      ];
    if (sql.includes("SELECT COUNT(*) AS total FROM users"))
      return [[{ total: 999 }]];
    if (sql.includes("SELECT u.id,u.name,u.username"))
      return [
        [{ id: 7, name: "真实用户", username: "actual", activeCount: 1 }],
      ];
    if (sql.includes("FROM miban_orders"))
      return [
        [...this.orders.entries()]
          .filter(([id]) => values.includes(id))
          .map(([id, o]) => ({ id, ...o })),
      ];
    throw new Error(`Unhandled test SQL: ${sql}`);
  }
}
let db: FakeDB;
beforeEach(() => {
  db = new FakeDB();
  holder.db = db;
  delete process.env.JWT_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-27T10:00:00+08:00"));
});
const setupUsage = async (patch: Partial<Rule> = {}, orderIds = [101, 102]) => {
  const r = makeRule(patch);
  db.rules = [dbRow(r)];
  const result = calculateBenefits(
    [r],
    [{ ...cart[0], priceCny: 228, category: "大米礼盒", series: "米大娘精选" }]
  );
  const first = Math.floor(result.totalCents / orderIds.length),
    orders = orderIds.map((id, i) => ({
      orderId: id,
      totalCents:
        i === orderIds.length - 1
          ? result.totalCents - first * (orderIds.length - 1)
          : first,
    }));
  orders.forEach(o =>
    db.orders.set(o.orderId, {
      status: "paid",
      userId: 7,
      totalPrice: (o.totalCents / 100).toFixed(2),
    })
  );
  await recordMibanBenefitUse(db, 7, "checkout-1", result, orders);
  return { result, orders };
};
describe("miban benefits transaction safety (no real DB)", () => {
  it("initializer creates only empty benefit tables and no imports perform SQL", async () => {
    expect(db.calls).toEqual([]);
    await ensureMibanBenefitsInfrastructure();
    expect(db.calls.filter(c => c.sql.startsWith("CREATE TABLE"))).toHaveLength(
      5
    );
    expect(db.calls.every(c => !/INSERT|ALTER|UPDATE/.test(c.sql))).toBe(true);
  });
  it("catalog takes exact priceCny, stable IDs, shared series, missing state unavailable", async () => {
    db.states = [];
    const catalog = await readMibanBenefitsCatalog(db);
    const rice = catalog.find(p => p.productKey === cart[0].productKey)!;
    expect(rice.id).toBe(`limited:${cart[0].productKey}`);
    expect(rice.series).toBe("米大娘精选");
    expect(rice.skus[0]).toMatchObject({
      id: `limited:${cart[0].productKey}:${cart[0].skuId}`,
      price: 228,
      activity: 228,
      active: false,
      available: false,
    });
    expect(db.calls.every(c => !/INSERT|UPDATE|ALTER|CREATE/.test(c.sql))).toBe(
      true
    );
    const keys = catalog.map(p => p.productKey);
    expect(
      mibanLimitedProducts
        .filter(p => p.status === "draft" && !p.publicPreview)
        .every(p => !keys.includes(p.key))
    ).toBe(true);
  });
  it("quote is signed, user/cart/mode-bound, and reserve stock=0 does not invalidate transaction", async () => {
    db.rules = [dbRow(makeRule())];
    const quote = await getMibanBenefitQuote(7, cart);
    db.states.forEach(s => {
      s.stock_qty = 0;
    });
    expect(
      await assertMibanBenefitQuote(db, 7, cart, "once", quote.quoteToken)
    ).toEqual(quote.result);
    expect(db.calls.slice(-2).every(c => c.sql.includes("FOR UPDATE"))).toBe(
      true
    );
    await expect(
      assertMibanBenefitQuote(db, 8, cart, "once", quote.quoteToken)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      assertMibanBenefitQuote(
        db,
        7,
        [{ ...cart[0], quantity: 2 }],
        "once",
        quote.quoteToken
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      assertMibanBenefitQuote(db, 7, cart, "annual", quote.quoteToken)
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rejects changed rule version, deactivation, tamper and expired token without silent repricing", async () => {
    db.rules = [dbRow(makeRule())];
    const q = await getMibanBenefitQuote(7, cart);
    db.rules[0].version++;
    await expect(
      assertMibanBenefitQuote(db, 7, cart, "once", q.quoteToken)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    db.rules[0].version--;
    db.states.find(s => s.product_key === cart[0].productKey)!.is_active = 0;
    await expect(
      assertMibanBenefitQuote(db, 7, cart, "once", q.quoteToken)
    ).rejects.toThrow();
    await expect(
      assertMibanBenefitQuote(db, 7, cart, "once", `${q.quoteToken}tampered`)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await expect(
      assertMibanBenefitQuote(db, 7, cart, "once", q.quoteToken)
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("no-token old clients need exact expectedResult and cannot omit preflight", async () => {
    const q = await getMibanBenefitQuote(7, cart);
    expect(
      await assertMibanBenefitQuote(db, 7, cart, "once", undefined, q.result)
    ).toEqual(q.result);
    await expect(assertMibanBenefitQuote(db, 7, cart)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      assertMibanBenefitQuote(db, 7, cart, "once", undefined, {
        ...q.result,
        totalCents: 1,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("annual multiplies one real midaniang SKU by12 and rejects duplicates/too many/other brand", async () => {
    const q = await getMibanBenefitQuote(7, cart, "annual");
    expect(q.result.originalCents).toBe(22800 * 12);
    expect(q.result.lines[0].quantity).toBe(12);
    await expect(getMibanBenefitQuote(7, [...cart, ...cart])).rejects.toThrow(
      "重复"
    );
    await expect(
      getMibanBenefitQuote(7, [{ ...cart[0], quantity: 11 }])
    ).rejects.toThrow("上限");
    await expect(
      getMibanBenefitQuote(
        7,
        [
          {
            productKey: "herbalife-red-ginseng",
            skuId: "red-ginseng-10g-30",
            quantity: 1,
          },
        ],
        "annual"
      )
    ).rejects.toThrow("米大娘");
  });
  it("missing/weak secret fails closed and cannot silently use hard-coded fallback", async () => {
    process.env.JWT_SECRET = "short";
    await expect(getMibanBenefitQuote(7, cart)).rejects.toThrow("签名未配置");
  });
  it("saves 20 independent single-use coupons, ignores untrusted fields, request replay idempotent", async () => {
    const input = {
      storefront: STORE,
      userId: 7,
      rule: {
        ...makeRule({ id: "", kind: "cash", value: 30 }),
        userId: "999",
        uses: 99,
        state: "used" as const,
        created: "forged",
      },
      count: 20,
      requestId: "31c8a1f0-20d1-4184-a500-b4cc3c494aab",
    };
    const result = await saveMibanBenefitRule(admin, input);
    expect(result).toHaveLength(20);
    expect(new Set(result.map(r => r.id)).size).toBe(20);
    expect(
      result.every(
        r =>
          r.userId === "7" &&
          r.uses === 0 &&
          r.maxUses === 1 &&
          r.state === "active" &&
          r.created !== "forged"
      )
    ).toBe(true);
    expect(await saveMibanBenefitRule(admin, input)).toEqual(result);
    expect(db.rules).toHaveLength(20);
    await expect(
      saveMibanBenefitRule(admin, { ...input, count: 19 })
    ).rejects.toThrow("不同操作");
    const lockIndex = db.calls.findIndex(c =>
      c.sql.includes("COALESCE(balance")
    );
    const ruleLockIndex = db.calls.findIndex(c =>
      c.sql.includes("SELECT * FROM miban_benefit_rules")
    );
    expect(lockIndex).toBeLessThan(ruleLockIndex);
  });
  it("existing-id only edits with exact version, and used coupons cannot edit/reactivate", async () => {
    db.rules = [
      dbRow(
        makeRule({
          id: "c",
          kind: "cash",
          value: 30,
          maxUses: 1,
          uses: 1,
          state: "used",
        })
      ),
    ];
    const input = {
      storefront: STORE,
      userId: 7,
      rule: makeRule({ id: "c", kind: "cash", value: 25, version: 1 }),
      count: 1,
      requestId: "31c8a1f0-20d1-4184-a500-b4cc3c494aab",
    };
    await expect(saveMibanBenefitRule(admin, input)).rejects.toThrow("已用");
    await expect(
      setMibanBenefitState(admin, {
        storefront: STORE,
        userId: 7,
        ruleId: "c",
        version: 1,
        next: "active",
        reason: "重开",
      })
    ).rejects.toThrow("已用");
    await expect(
      saveMibanBenefitRule(admin, {
        ...input,
        rule: { ...input.rule, id: "unknown" },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      saveMibanBenefitRule(admin, {
        ...input,
        rule: { ...input.rule, version: 2 },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("invalid precise money/rate/deleted SKU/price>=all selected reject", async () => {
    const catalog = await readMibanBenefitsCatalog(db);
    expect(() =>
      validateMibanBenefitRule(makeRule({ value: 7.99 }), catalog)
    ).toThrow();
    expect(() =>
      validateMibanBenefitRule(
        makeRule({ kind: "cash", value: 1.001 }),
        catalog
      )
    ).toThrow();
    expect(() =>
      validateMibanBenefitRule(
        makeRule({ scope: "sku", targets: ["limited:deleted:x"] }),
        catalog
      )
    ).toThrow("已移除");
    expect(() =>
      validateMibanBenefitRule(
        makeRule({
          scope: "sku",
          targets: [`limited:${cart[0].productKey}:${cart[0].skuId}`],
          kind: "price",
          value: 228,
        }),
        catalog
      )
    ).toThrow("低于");
    const long = validateMibanBenefitRule(makeRule({ maxUses: 1 }), catalog);
    expect(long.maxUses).toBe(1);
    expect(() =>
      validateMibanBenefitRule(
        makeRule({ unlimited: false, ends: "" }),
        catalog
      )
    ).toThrow("结束日期");
    expect(() =>
      validateMibanBenefitRule(
        makeRule({ kind: "cash", unlimited: true, ends: "" }),
        catalog
      )
    ).toThrow("结束日期");
    expect(() =>
      validateMibanBenefitRule(
        makeRule({ kind: "price", scope: "all", value: 1 }),
        catalog
      )
    ).toThrow("单个");
    expect(() =>
      validateMibanBenefitRule(
        makeRule({
          kind: "price",
          scope: "sku",
          targets: ["a", "b"],
          value: 1,
        }),
        catalog
      )
    ).toThrow("单个");
    expect(() =>
      validateMibanBenefitRule(makeRule({ starts: "2026-02-30" }), catalog)
    ).toThrow();
  });
  it("wallet transaction rollback and release occur on audit failure", async () => {
    db.failSql = "INSERT INTO miban_benefit_audits";
    await expect(
      saveMibanBenefitRule(admin, {
        storefront: STORE,
        userId: 7,
        rule: makeRule({ id: "" }),
        count: 1,
        requestId: "31c8a1f0-20d1-4184-a500-b4cc3c494aab",
      })
    ).rejects.toThrow("failure");
    expect(db.rules).toEqual([]);
    expect(db.rollbacks).toBe(1);
    expect(db.releases).toBe(1);
  });
  it("records once per cart, never repeats usage, immutable snapshot has real links/cents", async () => {
    const { result, orders } = await setupUsage();
    await recordMibanBenefitUse(db, 7, "checkout-1", result, orders);
    expect(db.rules[0].uses).toBe(1);
    expect(db.usages).toHaveLength(1);
    expect(db.links).toHaveLength(2);
    const snapshot = JSON.parse(db.usages[0].snapshot_json);
    expect(snapshot.rule.uses).toBe(0);
    expect(snapshot.orders).toEqual(orders);
    expect(
      db.calls.filter(c => /CREATE|ALTER|DELETE/.test(c.sql))
    ).toHaveLength(0);
  });
  it("rejects actual order amount/ownership mismatch before any rule use", async () => {
    const r = makeRule();
    db.rules = [dbRow(r)];
    const result = calculateBenefits(
      [r],
      [
        {
          ...cart[0],
          priceCny: 228,
          category: "大米礼盒",
          series: "米大娘精选",
        },
      ]
    );
    db.orders.set(101, {
      status: "paid",
      userId: 8,
      totalPrice: (result.totalCents / 100).toFixed(2),
    });
    await expect(
      recordMibanBenefitUse(db, 7, "real-checkout", result, [
        { orderId: 101, totalCents: result.totalCents },
      ])
    ).rejects.toThrow("实际订单");
    db.orders.set(101, { status: "paid", userId: 7, totalPrice: "1.00" });
    await expect(
      recordMibanBenefitUse(db, 7, "real-checkout", result, [
        { orderId: 101, totalCents: result.totalCents },
      ])
    ).rejects.toThrow("实际订单");
    expect(db.rules[0].uses).toBe(0);
    expect(db.usages).toHaveLength(0);
  });
  it("partial cancel restores nothing, full cancel restores once, snapshot never changed", async () => {
    await setupUsage({ kind: "cash", value: 30, maxUses: 1, unlimited: false });
    const originalSnapshot = db.usages[0].snapshot_json;
    db.orders.get(101)!.status = "cancelled";
    await restoreMibanBenefitsForCancelledOrder(db, 7, 101, 1);
    expect(db.rules[0].uses).toBe(1);
    db.orders.get(102)!.status = "cancelled";
    await restoreMibanBenefitsForCancelledOrder(db, 7, 102, 1);
    expect(db.rules[0].uses).toBe(0);
    expect(db.rules[0].state).toBe("active");
    await restoreMibanBenefitsForCancelledOrder(db, 7, 102, 1);
    expect(db.rules[0].uses).toBe(0);
    expect(db.usages[0].snapshot_json).toBe(originalSnapshot);
  });
  it("long-term maxUses enforced during consumption, restored paused right stays paused", async () => {
    await setupUsage({ unlimited: true, maxUses: 1 });
    expect(db.rules[0].state).toBe("active");
    const { status } = await import("../shared/miban-benefits");
    expect(
      status({
        ...makeRule(),
        ...JSON.parse(db.rules[0].rule_json),
        uses: db.rules[0].uses,
      })
    ).toBe("次数用尽");
    db.rules[0].state = "paused";
    db.orders.forEach(o => {
      o.status = "cancelled";
    });
    await restoreMibanBenefitsForCancelledOrder(db, 7, 102, 1);
    expect(db.rules[0].state).toBe("paused");
  });
  it("cannot delete linked historical benefit orders even after full restoration", async () => {
    await setupUsage();
    db.orders.forEach(o => {
      o.status = "cancelled";
    });
    await restoreMibanBenefitsForCancelledOrder(db, 7, 101, 1);
    await expect(
      assertMibanBenefitOrderCanDelete(db, 7, 101)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      assertMibanBenefitOrderCanDelete(db, 7, 999)
    ).resolves.toBeUndefined();
  });
  it("legacy missing tables allowed for restore/delete only; outage errors not swallowed", async () => {
    const missing = {
      execute: vi.fn(async () => {
        throw { code: "ER_NO_SUCH_TABLE" };
      }),
    };
    await expect(
      restoreMibanBenefitsForCancelledOrder(missing, 7, 101, 1)
    ).resolves.toBeUndefined();
    await expect(
      assertMibanBenefitOrderCanDelete(missing, 7, 101)
    ).resolves.toBeUndefined();
    const outage = {
      execute: vi.fn(async () => {
        throw new Error("network failure");
      }),
    };
    await expect(
      restoreMibanBenefitsForCancelledOrder(outage, 7, 101, 1)
    ).rejects.toThrow("network failure");
  });
  it("supplier/admin roles forbidden and my strips internal notes", async () => {
    await expect(
      saveMibanBenefitRule(
        { id: 5, role: "supplier" },
        {
          storefront: STORE,
          userId: 7,
          rule: makeRule({ id: "" }),
          count: 1,
          requestId: "31c8a1f0-20d1-4184-a500-b4cc3c494aab",
        }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    db.rules = [dbRow(makeRule())];
    expect(await getMyMibanBenefits(7)).toEqual([
      expect.not.objectContaining({ note: expect.anything() }),
    ]);
  });
  it("all-admin routes deny suppliers, my only uses authenticated user", async () => {
    const supplier = mibanBenefitsRouter.createCaller({
      user: { id: 5, role: "supplier" },
      realUser: { id: 1, role: "super_admin" },
      isGuest: false,
    } as any);
    await expect(supplier.catalog({ storefront: STORE })).rejects.toMatchObject(
      { code: "FORBIDDEN" }
    );
    const me = mibanBenefitsRouter.createCaller({
      user: { id: 7, role: "parent" },
      isGuest: false,
    } as any);
    db.rules = [
      dbRow(makeRule()),
      dbRow(makeRule({ id: "other", userId: "9" })),
    ];
    const my = await me.my({ storefront: STORE });
    expect(my).toHaveLength(1);
    expect(my[0].userId).toBe("7");
    expect(my[0]).not.toHaveProperty("note");
    await expect(
      supplier.catalog({ storefront: "other" } as any)
    ).rejects.toThrow();
  });
  it("users searches all names/accounts/IDs with parameterized escaped keyword and paging", async () => {
    const input = {
      storefront: STORE,
      keyword: "x%' OR 1=1 --",
      offset: 200,
      limit: 30,
      filter: "with" as const,
    };
    const result = await getMibanBenefitsUsers(input);
    expect(result.total).toBe(999);
    expect(result.offset).toBe(200);
    expect(result.users[0].account).toBe("actual");
    const query = db.calls.find(c =>
      c.sql.includes("SELECT u.id,u.name,u.username")
    )!;
    expect(query.sql).not.toContain(input.keyword);
    expect(query.values.join(" ")).toContain("!%");
    expect(query.sql).toContain("CAST(u.id AS CHAR)");
  });
  it("initializer promise is cached on success and cleared on failure for retry", async () => {
    vi.resetModules();
    const fresh = await import("./miban-benefits");
    db.failSql = "CREATE TABLE";
    await expect(fresh.ensureMibanBenefitsInfrastructure()).rejects.toThrow(
      "failure"
    );
    db.failSql = "";
    db.calls = [];
    await Promise.all([
      fresh.ensureMibanBenefitsInfrastructure(),
      fresh.ensureMibanBenefitsInfrastructure(),
    ]);
    expect(db.calls.filter(c => c.sql.startsWith("CREATE TABLE"))).toHaveLength(
      5
    );
    await fresh.ensureMibanBenefitsInfrastructure();
    expect(db.calls.filter(c => c.sql.startsWith("CREATE TABLE"))).toHaveLength(
      5
    );
  });
});
