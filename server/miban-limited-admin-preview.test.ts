import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertMibanLimitedCollectionActive,
  buildMibanLimitedPublicAvailability,
  isMibanLimitedPreviewAdministrator,
  mibanLimitedPreviewInputSchema,
  readMibanLimitedCollectionsForViewer,
  readMibanLimitedCollectionStates,
} from "./miban-limited-collections";
import { mibanLimitedCollections } from "../shared/miban-limited-collections";
import { getMibanLimitedProductSku, mibanLimitedProducts } from "../shared/miban-limited-products";

// 纯内存 SQL fixture；不 import miban.ts、db、钱包或认证模块，也不连接数据库。
class CollectionSqlFixture {
  calls: string[] = [];
  saved = new Map(mibanLimitedCollections.map(c => [c.slug, c.slug !== "spain" ? 1 : 0]));

  async execute(sql: string): Promise<any> {
    this.calls.push(sql);
    if (!sql.startsWith("SELECT slug, is_active FROM miban_limited_collection_state")) {
      throw new Error(`Unexpected SQL: ${sql}`);
    }
    return [[...this.saved].map(([slug, is_active]) => ({ slug, is_active }))];
  }
}

const ordinary = { id: 81, role: "user" };
const administrator = { id: 28, role: "super_admin" };
const product = {
  key: "preview-test",
  brand: "西班牙",
  status: "on_sale",
  skus: [{ id: "sku-1", active: true }],
};
const stateKey = `${product.key}:sku-1`;
const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

// 与生产 query 一样，先解析缓存隔离输入，再仅把 ctx.user 交给读取 helper。
async function collectionRequest(ctx: { user: typeof ordinary | null }, input: unknown) {
  mibanLimitedPreviewInputSchema.parse(input);
  return readMibanLimitedCollectionsForViewer(new CollectionSqlFixture(), ctx.user);
}

function availabilityRequest(ctx: { user: typeof ordinary | null }, input: unknown) {
  mibanLimitedPreviewInputSchema.parse(input);
  return buildMibanLimitedPublicAvailability(
    [product],
    new Map([[stateKey, { isActive: true, stockQty: 9 }]]),
    new Map([["spain", false]]),
    ctx.user,
  );
}

const nonAdministratorUsers = [
  null,
  undefined,
  { id: 28, role: "user" },
  { id: 28, role: "admin" },
  { id: 28, role: "parent" },
  { id: 28, role: "supplier" },
  { id: 28, role: "SUPER_ADMIN" },
  { id: 28, role: "super_admin " },
  { id: 28, role: "user", isAdmin: true, admin: true, mibanRole: "super_admin" },
  { id: 28, isAdmin: true, admin: true },
];

describe("精选预览身份与缓存隔离输入契约（纯离线）", () => {
  it.each(nonAdministratorUsers)("never grants preview to non-system-admin identity %#", user => {
    expect(isMibanLimitedPreviewAdministrator(user)).toBe(false);
  });

  it("only exact authenticated super_admin role grants preview, independent of id", () => {
    expect(isMibanLimitedPreviewAdministrator(administrator)).toBe(true);
    expect(isMibanLimitedPreviewAdministrator({ id: 81, role: "super_admin" })).toBe(true);
  });

  it.each([undefined, {}, { viewerUserId: null }, { viewerUserId: 28 }])(
    "accepts optional cache-isolation input %# without changing trusted viewer",
    async input => {
      const result = await collectionRequest({ user: ordinary }, input);
      expect(result.viewerUserId).toBe(ordinary.id);
      expect(result.canPreviewInactive).toBe(false);
      expect(result.collections.some(c => c.slug === "spain")).toBe(false);
    },
  );

  it.each([0, -1, 1.5, "28", NaN, Infinity])("rejects invalid viewerUserId %s", viewerUserId => {
    expect(mibanLimitedPreviewInputSchema.safeParse({ viewerUserId }).success).toBe(false);
  });

  it.each([
    { viewerUserId: 28, isAdmin: true },
    { viewerUserId: 28, admin: true },
    { viewerUserId: 28, role: "super_admin" },
    { viewerUserId: 28, canPreviewInactive: true, user: administrator },
    { isAdmin: true, admin: true, role: "super_admin" },
  ])("forged browser fields never authorize collections or SKU preview %#", async input => {
    expect(mibanLimitedPreviewInputSchema.parse(input)).toEqual(
      "viewerUserId" in input ? { viewerUserId: 28 } : {},
    );
    for (const user of [null, ordinary, { id: 28, role: "admin" }]) {
      const result = await collectionRequest({ user }, input);
      expect(result.viewerUserId).toBe(user?.id ?? null);
      expect(result.canPreviewInactive).toBe(false);
      expect(result.collections.some(c => c.slug === "spain")).toBe(false);
      expect(availabilityRequest({ user }, input)).toEqual([]);
    }
  });

  it("super_admin sees inactive categories and SKU rows even with mismatched/null input id", async () => {
    for (const input of [undefined, { viewerUserId: 81 }, { viewerUserId: null }]) {
      const result = await collectionRequest({ user: administrator }, input);
      expect(result).toMatchObject({ viewerUserId: 28, canPreviewInactive: true });
      expect(result.collections).toHaveLength(mibanLimitedCollections.length);
      expect(result.collections.find(c => c.slug === "spain")?.isActive).toBe(false);
      expect(availabilityRequest({ user: administrator }, input)).toEqual([{
        productKey: product.key,
        skuId: "sku-1",
        isOnSale: false,
        isOffShelf: true,
        stockQty: 9,
        isSkuActive: true,
        collectionIsActive: false,
      }]);
    }
  });

  it("ctx.realUser and view-as flags cannot elevate the effective ctx.user", async () => {
    const ctx = { user: ordinary, realUser: administrator, isViewingAs: true, isAdmin: true };
    expect((await collectionRequest(ctx, { viewerUserId: 28 })).canPreviewInactive).toBe(false);
    expect(availabilityRequest(ctx, { viewerUserId: 28 })).toEqual([]);
  });
});

describe("精选可见性与可售性分离（纯映射与 SQL）", () => {
  it("exhaustively hides all inactive combinations for ordinary users and never sells them to admins", () => {
    for (const collectionIsActive of [false, true]) {
      for (const status of ["draft", "off_sale", "on_sale"]) {
        for (const skuActive of [false, true]) {
          for (const stateActive of [false, true]) {
            for (const stockQty of [-1, 0, 6]) {
              const products = [{ ...product, status, skus: [{ id: "sku-1", active: skuActive }] }];
              const states = new Map([[stateKey, { isActive: stateActive, stockQty }]]);
              const collections = new Map([["spain", collectionIsActive]]);
              const isOffShelf = !collectionIsActive || status !== "on_sale" || !skuActive || !stateActive;
              const publicRows = buildMibanLimitedPublicAvailability(products, states, collections, ordinary);
              const adminRows = buildMibanLimitedPublicAvailability(products, states, collections, administrator);
              expect(adminRows).toHaveLength(1);
              expect(adminRows[0]).toMatchObject({
                isOffShelf,
                isOnSale: !isOffShelf && stockQty !== 0,
                stockQty,
                isSkuActive: skuActive && stateActive,
                collectionIsActive,
              });
              if (isOffShelf) expect(publicRows).toEqual([]);
              else expect(publicRows).toEqual(adminRows);
            }
          }
        }
      }
    }
  });

  it("zero stock is visible and not off-shelf, but not on sale; negative stock preserves unlimited semantics", () => {
    for (const stockQty of [0, -1, 4]) {
      const rows = buildMibanLimitedPublicAvailability(
        [product], new Map([[stateKey, { isActive: true, stockQty }]]),
        new Map([["spain", true]]), ordinary,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ isOffShelf: false, isOnSale: stockQty !== 0, stockQty });
    }
  });

  it("missing operational state and unknown collection fail closed without hiding admin preview", () => {
    const collections = new Map([["spain", true]]);
    expect(buildMibanLimitedPublicAvailability([product], new Map(), collections, ordinary)).toEqual([]);
    expect(buildMibanLimitedPublicAvailability([product], new Map(), collections, administrator)[0])
      .toMatchObject({ isOffShelf: true, isOnSale: false, isSkuActive: false, stockQty: 0 });
    const unknown = [{ ...product, brand: "unknown" }];
    const states = new Map([[stateKey, { isActive: true, stockQty: 7 }]]);
    expect(buildMibanLimitedPublicAvailability(unknown, states, collections, ordinary)).toEqual([]);
    expect(buildMibanLimitedPublicAvailability(unknown, states, collections, administrator)[0])
      .toMatchObject({ collectionIsActive: false, isOffShelf: true, isOnSale: false, stockQty: 7 });
  });

  it("real catalog Spain products/SKUs are visible only to super_admin while off, with original stock retained", async () => {
    const db = new CollectionSqlFixture();
    const collections = await readMibanLimitedCollectionStates(db);
    const states = new Map(mibanLimitedProducts.flatMap(p => p.skus.map(s => [
      `${p.key}:${s.id}`, { isActive: true, stockQty: 13 },
    ] as const)));
    const publicRows = buildMibanLimitedPublicAvailability(mibanLimitedProducts, states, collections, ordinary);
    const adminRows = buildMibanLimitedPublicAvailability(mibanLimitedProducts, states, collections, administrator);
    const spainKeys = new Set(mibanLimitedProducts.filter(p => p.brand === "西班牙").map(p => p.key));
    expect(spainKeys.size).toBeGreaterThan(0);
    expect(publicRows.filter(row => spainKeys.has(row.productKey))).toEqual([]);
    expect(adminRows).toHaveLength(mibanLimitedProducts.reduce((sum, p) => sum + p.skus.length, 0));
    const spainRows = adminRows.filter(row => spainKeys.has(row.productKey));
    expect(spainRows.length).toBeGreaterThan(0);
    expect(spainRows.every(row => row.isOffShelf && !row.isOnSale && row.stockQty === 13)).toBe(true);
    expect(db.calls.every(sql => sql.startsWith("SELECT"))).toBe(true);
  });

  it.each([null, ordinary, { id: 28, role: "admin" }, administrator])(
    "inactive category transaction guard rejects every identity, including preview administrator %#",
    async user => {
      const db = new CollectionSqlFixture();
      await readMibanLimitedCollectionsForViewer(db, user);
      await expect(assertMibanLimitedCollectionActive(db, "spain", true))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.calls.at(-1)).toMatch(/ FOR SHARE$/);
    },
  );

  it("static inactive SKU selection remains forbidden for ordinary and administrator checkout", () => {
    const actual = mibanLimitedProducts.find(p => p.skus.length > 0)!;
    const inactive = { ...actual, skus: actual.skus.map(s => ({ ...s, active: false })) };
    expect(getMibanLimitedProductSku(inactive, inactive.skus[0].id)).toBeUndefined();
  });
});

describe("生产接口只读源码授权回归（不执行生产模块）", () => {
  it("both optional-input public routes pass only ctx.user into helpers", () => {
    const backend = source("./miban.ts");
    const collections = backend.slice(backend.indexOf("  publicCollections:"), backend.indexOf("  adminCollections:"));
    const availability = backend.slice(backend.indexOf("  publicAvailability:"), backend.indexOf("  adminSalesStats:"));
    for (const route of [collections, availability]) {
      expect(route).toContain(".input(mibanLimitedPreviewInputSchema)");
      expect(route).toContain(".query(async ({ ctx }) => {");
      expect(route).not.toMatch(/input\.|ctx\.realUser|ctx\.isAdmin|ctx\.admin/);
    }
    expect(collections).toContain("isMibanLimitedPreviewAdministrator(ctx.user)");
    expect(collections).toContain("viewerUserId: ctx.user?.id ?? null");
    expect(collections).toContain("readMibanLimitedCollections(conn as any, !canPreviewInactive)");
    expect(availability).toContain("mibanLimitedProducts, states, collectionStates, ctx.user");
    expect(backend).toContain('(ctx.user as any).role !== "super_admin"');
  });

  it("legacy pear checks fruits before wallet preflight and again under the order transaction", () => {
    const backend = source("./miban.ts");
    const legacy = backend.slice(backend.indexOf("export const mibanOrderRouter = router({"), backend.indexOf("// ─── 静态限时商品下单路由"));
    expect(legacy).toContain("input.ingredients.some(ingredient => ingredient.riceId === 47)");
    expect(legacy.indexOf('assertMibanLimitedCollectionActive(collectionConn as any, "fruits")')).toBeLessThan(legacy.indexOf("prepareMibanWalletPayment"));
    const transaction = legacy.slice(legacy.indexOf("await withGlobalWalletTransaction(userId"));
    expect(transaction).toContain('assertMibanLimitedCollectionActive(transaction, "fruits", true)');
    expect(transaction.indexOf("assertMibanLimitedCollectionActive")).toBeLessThan(transaction.indexOf("await createOrder("));
    expect(transaction.indexOf("assertMibanLimitedCollectionActive")).toBeLessThan(transaction.indexOf("await debitMibanWalletPayment("));
  });

  it("cart filters real SKU state, isolates viewer cache, and rejects inactive or unavailable additions", () => {
    const cart = source("../client/src/pages/miban/LimitedProductCart.tsx");
    expect(cart).toContain("publicAvailability.useQuery({ viewerUserId }");
    expect(cart).toContain("availabilityQuery.isFetchedAfterMount === false");
    const visibility = cart.slice(cart.indexOf("const visibleItems"), cart.indexOf("  useEffect(", cart.indexOf("const visibleItems")));
    expect(visibility).toContain("state?.isOffShelf === false");
    expect(visibility).not.toContain("isOnSale");
    expect(cart).toContain("state?.isOffShelf !== false || state.isOnSale !== true");
  });

  it("preview helpers never enter stock transactions, benefits quotes or order mutations", () => {
    const backend = source("./miban.ts");
    const single = backend.slice(backend.indexOf("async function reserveLimitedSkuStock("), backend.indexOf("async function linkLimitedStockDeductionToOrder("));
    const cart = backend.slice(backend.indexOf("async function reserveLimitedSkuStocks("), backend.indexOf("async function linkLimitedStockDeductionsToOrder("));
    expect(single.indexOf("assertMibanLimitedCollectionActive")).toBeLessThan(single.indexOf("SELECT is_active, stock_qty"));
    expect(single).toContain("Number(state.is_active) !== 1");
    expect(cart.indexOf("readMibanLimitedCollectionStates")).toBeLessThan(cart.indexOf("SELECT is_active, stock_qty"));
    expect(cart).toContain("!isMibanLimitedProductCollectionActive");
    expect(cart).toContain("Number(state.is_active) !== 1");
    const orders = backend.slice(backend.indexOf("  createOrder: protectedProcedure"), backend.indexOf("// ───", backend.indexOf("  createCartOrder: protectedProcedure")));
    const benefits = source("./miban-benefits.ts");
    for (const section of [single, cart, orders, benefits]) {
      expect(section).not.toMatch(/canPreviewInactive|isMibanLimitedPreviewAdministrator|buildMibanLimitedPublicAvailability|readMibanLimitedCollectionsForViewer|viewerUserId/);
    }
    expect(orders).toContain('product.status !== "on_sale"');
    expect(orders).toContain("getMibanLimitedProductSku(product, input.skuId)");
    expect(orders).toContain("!sku || !sku.active");
    expect(benefits).toContain(".filter(p => isMibanLimitedProductCollectionActive(p, collectionStates))");
    expect(benefits).toContain('p.status === "on_sale"');
    expect(benefits).toContain("s.active &&");
    expect(benefits).toContain("Number(state.is_active) === 1");
  });
});
