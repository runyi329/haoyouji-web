import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it, vi } from "vitest";
import {
  mibanLimitedCollections, getMibanLimitedCollectionSlugForPath,
  getMibanLimitedProductCollectionSlug,
} from "../shared/miban-limited-collections";
import { mibanCountryCollections } from "../shared/miban-country-collections";
import { mibanLimitedProducts, getMibanLimitedProduct } from "../shared/miban-limited-products";
import {
  ensureMibanLimitedCollectionTables, readMibanLimitedCollections,
  readMibanLimitedCollectionStates, updateMibanLimitedCollectionState,
  assertMibanLimitedCollectionActive, isMibanLimitedProductCollectionActive,
} from "./miban-limited-collections";

// Pure in-memory SQL fixture. No main backend, DB module, wallet or production API.
class CollectionFixture {
  saved = new Map<string, number>();
  calls: Array<{ sql: string; values: any[] }> = [];
  error: any;
  async execute(sql: string, values: any[] = []): Promise<any> {
    this.calls.push({ sql, values });
    if (this.error) throw this.error;
    if (sql.startsWith("CREATE TABLE")) return [{ affectedRows: 0 }];
    if (sql.startsWith("INSERT IGNORE")) {
      for (let i = 0; i < values.length; i += 2) if (!this.saved.has(values[i])) this.saved.set(values[i], values[i + 1]);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("INSERT INTO")) {
      this.saved.set(values[0], values[1]);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT")) return [[...this.saved].map(([slug, is_active]) => ({ slug, is_active }))];
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}
const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("精选分类上下架独立状态", () => {
  it("preserves twelve existing selections and defaults all seven new countries off", () => {
    expect(mibanLimitedCollections).toHaveLength(19);
    expect(new Set(mibanLimitedCollections.map(c => c.slug)).size).toBe(19);
    expect(mibanLimitedCollections.filter(c => c.defaultActive)).toHaveLength(12);
    expect(mibanLimitedCollections.filter(c => !c.defaultActive).map(c => c.slug)).toEqual(mibanCountryCollections.map(c => c.slug));
    expect(mibanLimitedProducts.every(p => getMibanLimitedProductCollectionSlug(p))).toBe(true);
    expect(mibanLimitedCollections.map(c => c.slug)).toEqual(expect.arrayContaining(["guizhou", "amway", "marykay", "nuskin", "jianghai", "spain"]));
  });
  it.each(mibanCountryCollections)("$slug is seeded off, stays hidden after reseeding, and has no sellable products", async country => {
    const db = new CollectionFixture();
    await ensureMibanLimitedCollectionTables(db);
    await ensureMibanLimitedCollectionTables(db);
    expect(db.saved.get(country.slug)).toBe(0);
    expect((await readMibanLimitedCollections(db, true)).some(c => c.slug === country.slug)).toBe(false);
    expect((await readMibanLimitedCollections(db, false)).find(c => c.slug === country.slug)).toMatchObject({ title: country.title, isActive: false });
    expect(getMibanLimitedCollectionSlugForPath(`/p/proj_hzxm2t/limited/${country.slug}?preview=1`, getMibanLimitedProduct)).toBe(country.slug);
    expect(mibanLimitedProducts.filter(p => getMibanLimitedProductCollectionSlug(p) === country.slug)).toEqual([]);
    await expect(assertMibanLimitedCollectionActive(db, country.slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it.each(mibanLimitedCollections.map(c => c.slug))("%s off hides the category; admin still sees it; reseeding never relists it", async slug => {
    const db = new CollectionFixture();
    await ensureMibanLimitedCollectionTables(db);
    await updateMibanLimitedCollectionState(db, { slug, isActive: false }, 28);
    await ensureMibanLimitedCollectionTables(db);
    expect((await readMibanLimitedCollections(db, true)).some(c => c.slug === slug)).toBe(false);
    expect((await readMibanLimitedCollections(db, false)).find(c => c.slug === slug)?.isActive).toBe(false);
    await updateMibanLimitedCollectionState(db, { slug, isActive: true }, 28);
    expect((await readMibanLimitedCollections(db, true)).some(c => c.slug === slug)).toBe(true);
    expect(db.calls.every(c => !/UPDATE miban_limited_sku_state|stock_qty|miban_orders/.test(c.sql))).toBe(true);
  });
  it("all four Spain products disappear together without changing their six wine and two ham SKUs", async () => {
    const db = new CollectionFixture();
    await ensureMibanLimitedCollectionTables(db);
    const before = JSON.stringify(mibanLimitedProducts);
    await updateMibanLimitedCollectionState(db, { slug: "spain", isActive: false }, 28);
    const states = await readMibanLimitedCollectionStates(db);
    expect(mibanLimitedProducts.filter(p => p.brand === "西班牙")).toHaveLength(4);
    expect(mibanLimitedProducts.filter(p => p.brand === "西班牙").every(p => !isMibanLimitedProductCollectionActive(p, states))).toBe(true);
    expect(isMibanLimitedProductCollectionActive(getMibanLimitedProduct("herbalife-red-ginseng"), states)).toBe(true);
    expect(JSON.stringify(mibanLimitedProducts)).toBe(before);
    await expect(assertMibanLimitedCollectionActive(db, "spain", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.calls.some(c => c.sql.endsWith("FOR SHARE"))).toBe(true);
  });
  it("unknown categories and unmapped products never pass", async () => {
    const db = new CollectionFixture();
    await expect(updateMibanLimitedCollectionState(db, { slug: "not-a-selection", isActive: true }, 28)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.calls).toHaveLength(0);
    expect(isMibanLimitedProductCollectionActive({ brand: "unknown" }, new Map())).toBe(false);
    await expect(assertMibanLimitedCollectionActive(db, undefined)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("database failure does not silently show categories; only pre-rollout missing table uses explicit defaults", async () => {
    const db = new CollectionFixture();
    db.error = Object.assign(new Error("unavailable"), { code: "ECONNRESET" });
    await expect(readMibanLimitedCollectionStates(db)).rejects.toMatchObject({ code: "ECONNRESET" });
    db.error = Object.assign(new Error("old schema"), { code: "ER_NO_SUCH_TABLE" });
    expect((await readMibanLimitedCollectionStates(db)).get("spain")).toBe(true);
  });
  it.each([
    ["/p/proj_hzxm2t/limited/spain", "spain"],
    ["/p/proj_hzxm2t/limited/spain-romanico", "spain"],
    ["/p/proj_hzxm2t/limited/spain-romanico/buy?sku=spain-romanico-750ml-case-6&quantity=2", "spain"],
    ["/p/proj_hzxm2t/limited/spain-iberian-ham", "spain"],
    ["/p/proj_hzxm2t/limited/midaniang/classic-rice-gift", "midaniang"],
    ["/p/proj_hzxm2t/limited/midaniang-classic-rice-gift/buy?plan=annual", "midaniang"],
    ["/p/proj_hzxm2t/limited/guangfeng-majiayou", "fruits"],
    ["/p/proj_hzxm2t/pear/tiangui", "fruits"],
    ["/p/proj_hzxm2t/limited/guizhou", "guizhou"],
    ...["amway", "marykay", "nuskin"].flatMap(slug => [1, 2, 3, 4, 5].map(number => [
      `/p/proj_hzxm2t/limited/official/${slug}-official-${number}?preview=1`, slug,
    ] as [string, string])),
    ["/p/proj_hzxm2t/limited/moutai-feitian", "guizhou"],
    ["/p/proj_hzxm2t/limited/", undefined],
    ["/p/proj_hzxm2t/admin/panel", undefined],
    ["/p/proj_hzxm2t/my-orders", undefined],
  ])("maps %s without allowing query-string preview to bypass", (path, slug) => {
    expect(getMibanLimitedCollectionSlugForPath(path!, getMibanLimitedProduct)).toBe(slug);
  });
  it("uses the existing super-admin middleware and checks both single and cart stock transactions", () => {
    const backend = source("./miban.ts");
    expect(backend).toMatch(/adminCollections: mibanAdminProcedure/);
    expect(backend).toMatch(/adminUpdateCollectionState: mibanAdminProcedure/);
    const single = backend.slice(backend.indexOf("async function reserveLimitedSkuStock("), backend.indexOf("async function linkLimitedStockDeductionToOrder("));
    expect(single.indexOf("assertMibanLimitedCollectionActive")).toBeLessThan(single.indexOf("SELECT is_active, stock_qty"));
    const cart = backend.slice(backend.indexOf("async function reserveLimitedSkuStocks("), backend.indexOf("async function linkLimitedStockDeductionsToOrder("));
    expect(cart.indexOf("readMibanLimitedCollectionStates")).toBeLessThan(cart.indexOf("SELECT is_active, stock_qty"));
    expect(backend).toContain("isMibanLimitedPreviewAdministrator(ctx.user)");
    expect(source("./miban-benefits.ts")).toContain(".filter(p => isMibanLimitedProductCollectionActive(p, collectionStates))");
    expect(source("../client/src/pages/miban/MibanApp.tsx")).toContain("<LimitedCategoryGate slug={collectionSlug}>");
  });
});

const ui = vi.hoisted(() => ({ data: { viewerUserId: null as number | null, canPreviewInactive: false, collections: [] as any[] }, user: null as any, availability: [] as any[], isLoading: false, isError: false, isFetchedAfterMount: true }));
vi.mock("../client/src/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: ui.user, loading: false }) }));
vi.mock("../client/src/pages/miban/LimitedProductCart", () => ({ LimitedCartButton: () => null }));
vi.mock("../client/src/pages/miban/useMibanUsdtCnyRate", async importOriginal => ({ ...(await importOriginal<any>()), useMibanUsdtCnyRate: () => 7 }));
vi.mock("../client/src/pages/miban/mibanTrpc", () => {
  const query = () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  const routes = new Proxy({}, { get: (_target, name) => name === "publicCollections"
    ? { useQuery: () => ({ ...ui, refetch: vi.fn() }) }
    : name === "publicAvailability" ? { useQuery: () => ({ data: ui.availability, isLoading: false }) }
    : name === "adminCollections" ? { useQuery: () => ({ data: mibanLimitedCollections.map(c => ({ ...c, isActive: !["spain", "amway"].includes(c.slug) })), isLoading: false, isError: false }) }
    : { useQuery: query, useMutation: mutation } });
  return { cosImg: (url: string) => url, mtrpc: { useUtils: () => ({}), limitedProduct: routes, order: { adminCancel: { useMutation: mutation }, adminUpdateAddress: { useMutation: mutation } } } };
});
vi.mock("../client/src/pages/miban/MibanImage", () => ({ MibanImage: (props: any) => React.createElement("img", { src: props.src, alt: props.alt }) }));
import { LimitedCategoryGate } from "../client/src/pages/miban/useMibanLimitedCollections";
import LimitedSale from "../client/src/pages/miban/LimitedSale";
import LimitedProductsPanel from "../client/src/pages/miban/LimitedProductsPanel";
import LimitedBrandProducts from "../client/src/pages/miban/LimitedBrandProducts";
const render = (node: React.ReactNode) => renderToStaticMarkup(<Router ssrPath="/p/proj_hzxm2t/limited">{node}</Router>);

const setViewer = (admin: boolean, collections: any[]) => {
  ui.user = admin ? { id: 28, role: "super_admin" } : null;
  ui.data = { viewerUserId: admin ? 28 : null, canPreviewInactive: admin, collections };
  ui.isLoading = false; ui.isError = false; ui.isFetchedAfterMount = true;
};
describe("offline actual collection UI", () => {
  it.each(mibanCountryCollections)("$slug has exactly one card, CTA and real attention label for admin, an empty off-shelf detail, and no public visibility", country => {
    const rows = [{ slug: country.slug, title: country.title, isActive: false }];
    setViewer(true, rows);
    const list = render(<LimitedSale />);
    expect(list).toContain(`data-brand-slug="${country.slug}"`);
    expect(list).toContain(`/miban-countries/${country.slug}-card-v1.webp`);
    expect(list.match(new RegExp(`data-testid="brand-cta-${country.slug}"`, "g"))).toHaveLength(1);
    expect(list).toContain(`href="/p/proj_hzxm2t/limited/${country.slug}"`);
    expect(list.match(/limited-off-shelf-badge/g)).toHaveLength(1);
    expect(list).toContain(`data-testid="${country.slug}-attention"`);
    const detail = renderToStaticMarkup(<Router ssrPath={`/p/proj_hzxm2t/limited/${country.slug}`}><LimitedCategoryGate slug={country.slug}><LimitedBrandProducts /></LimitedCategoryGate></Router>);
    expect(detail).toContain(country.title);
    expect(detail).toContain("已下架");
    expect(detail).toContain("该专区暂未添加商品");
    expect(detail).not.toContain("data-product-key");
    expect(detail).not.toContain(">购买<");
    setViewer(false, rows);
    expect(render(<LimitedSale />)).not.toContain(`data-brand-slug="${country.slug}"`);
    expect(render(<LimitedCategoryGate slug={country.slug}><div>COUNTRY SECRET</div></LimitedCategoryGate>)).not.toContain("COUNTRY SECRET");
  });
  it("ordinary users cannot render hidden category content", () => {
    setViewer(false, [{ slug: "herbalife", isActive: true }]);
    const html = render(<LimitedCategoryGate slug="spain"><div>SECRET PRODUCT CONTENT</div></LimitedCategoryGate>);
    expect(html).toContain("limited-category-unavailable");
    expect(html).not.toContain("SECRET PRODUCT CONTENT");
  });
  it.each(["amway", "marykay", "nuskin"])("%s retains the upstream real entry and blocks inactive official-detail direct links", slug => {
    setViewer(true, [{ slug, isActive: true }]);
    expect(render(<LimitedSale />)).toContain(`href="/p/proj_hzxm2t/limited/${slug}"`);
    const pathSlug = getMibanLimitedCollectionSlugForPath(`/p/proj_hzxm2t/limited/official/${slug}-official-1`, getMibanLimitedProduct);
    setViewer(false, [{ slug, isActive: false }]);
    expect(render(<LimitedCategoryGate slug={pathSlug}><div>OFFICIAL SECRET</div></LimitedCategoryGate>)).not.toContain("OFFICIAL SECRET");
    setViewer(true, [{ slug, isActive: false }]);
    const admin = render(<LimitedCategoryGate slug={pathSlug}><div>OFFICIAL PREVIEW</div></LimitedCategoryGate>);
    expect(admin).toContain("OFFICIAL PREVIEW");
    expect(admin).toContain("已下架");
  });
  it("ordinary users see only active cards, even if a malformed response includes inactive rows", () => {
    setViewer(false, [{ slug: "herbalife", isActive: true }, { slug: "amway", isActive: true }, { slug: "spain", isActive: false }]);
    const html = render(<LimitedSale />);
    expect(html).toContain('data-brand-slug="herbalife"');
    expect(html).toContain('data-brand-slug="amway"');
    expect(html).not.toContain('data-brand-slug="spain"');
    expect(html).not.toContain("limited-off-shelf-badge");
  });
  it("administrator sees inactive card and its category/detail content with off-shelf labels", () => {
    setViewer(true, [{ slug: "spain", isActive: false }, { slug: "herbalife", isActive: true }]);
    const list = render(<LimitedSale />);
    expect(list).toContain('data-brand-slug="spain"');
    expect(list).toContain("limited-off-shelf-badge");
    const detail = render(<LimitedCategoryGate slug="spain"><div>ADMIN READ ONLY CONTENT</div></LimitedCategoryGate>);
    expect(detail).toContain("ADMIN READ ONLY CONTENT");
    expect(detail).toContain("已下架");
    expect(detail).toContain("管理员可见，仅供查看");
  });
  it("a client-side role or preview flag cannot reuse another user's privileged cached response", () => {
    setViewer(true, [{ slug: "spain", isActive: false }]);
    ui.user = { id: 40, role: "super_admin" };
    expect(render(<LimitedSale />)).not.toContain('data-brand-slug="spain"');
    ui.user = { id: 28, role: "user", isAdmin: true };
    expect(render(<LimitedCategoryGate slug="spain"><div>SECRET</div></LimitedCategoryGate>)).not.toContain("SECRET");
    ui.user = { id: 28, role: "super_admin" }; ui.data.canPreviewInactive = false;
    expect(render(<LimitedSale />)).not.toContain('data-brand-slug="spain"');
  });
  it("administrator can browse all four Spain products under an inactive category, without exposing purchase CTAs", () => {
    setViewer(true, [{ slug: "spain", isActive: false }]);
    ui.availability = mibanLimitedProducts.filter(p => p.brand === "西班牙").flatMap(p => p.skus.map(sku => ({ productKey: p.key, skuId: sku.id, isOnSale: false, isOffShelf: true })));
    const html = renderToStaticMarkup(<Router ssrPath="/p/proj_hzxm2t/limited/spain"><LimitedBrandProducts /></Router>);
    for (const product of mibanLimitedProducts.filter(p => p.brand === "西班牙")) expect(html).toContain(`data-product-key="${product.key}"`);
    expect(html.match(/limited-off-shelf-badge/g)).toHaveLength(4);
    expect(html).not.toContain(">购买<");
  });
  it("loading, pre-fetch cache and errors cannot flash product details or cards", () => {
    setViewer(true, [{ slug: "spain", isActive: false }]); ui.isLoading = true;
    expect(render(<LimitedCategoryGate slug="spain"><div>SECRET</div></LimitedCategoryGate>)).not.toContain("SECRET");
    ui.isLoading = false; ui.isFetchedAfterMount = false;
    expect(render(<LimitedSale />)).not.toContain('data-brand-slug="spain"');
    ui.isFetchedAfterMount = true; ui.isError = true;
    expect(render(<LimitedSale />)).not.toContain('data-brand-slug="spain"');
    expect(render(<LimitedCategoryGate slug="spain"><div>SECRET</div></LimitedCategoryGate>)).not.toContain("SECRET");
    ui.isError = false;
  });
  it("cart uses active categories rather than administrator-visible categories", () => {
    const cart = source("../client/src/pages/miban/LimitedProductCart.tsx");
    expect(cart).toContain("activeSlugs.has(slug)");
    expect(cart).not.toContain("visibleSlugs.has(slug)");
  });
  it("admin can see all twelve switches and relist empty or inactive categories", () => {
    setViewer(true, []);
    const html = render(<LimitedProductsPanel />);
    for (const c of mibanLimitedCollections) expect(html).toContain(`collection-toggle-${c.slug}`);
    expect(html).toContain("上架西班牙精选");
    expect(html).toContain("上架安利日用精选");
    expect(html).toContain("商品原有上下架和库存保持不变");
  });
});
