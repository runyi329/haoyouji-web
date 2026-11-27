import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WangkaBrandCard, WANGKA_BRAND_CARD_IMAGE, WANGKA_BRAND_PATH } from "../client/src/pages/miban/WangkaBrandCard";
import { getMibanLimitedBrandBySlug } from "../shared/miban-limited-brand-config";
import { mibanLimitedProducts } from "../shared/miban-limited-products";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("approved Wangka public brand entrance (offline)", () => {
  it("renders the approved name, imported-health copy and final asset without invented counts", () => {
    const html = renderToStaticMarkup(React.createElement(Router, { ssrPath: WANGKA_BRAND_PATH }, React.createElement(WangkaBrandCard)));
    expect(html).toContain("旺咔宠物口粮精选");
    expect(html).not.toMatch(/旺咖|旺卡/);
    expect(html).toContain("全球采购");
    expect(html).toContain("专注进口");
    expect(html).toContain('href="/p/proj_hzxm2t/limited/wangka"');
    expect(html).toContain(WANGKA_BRAND_CARD_IMAGE);
    expect(html).toContain('data-view-count="unavailable"');
    expect(html).toContain("关注 --");
    expect(existsSync(new URL(`../client/public${WANGKA_BRAND_CARD_IMAGE}`, import.meta.url))).toBe(true);
  });

  it("wires real clicks and counts into the existing sorted brand list", () => {
    const list = source("../client/src/pages/miban/LimitedSale.tsx");
    expect(list).toContain("<WangkaBrandCard");
    expect(list).toContain('onClick={() => recordBrandClick("wangka")}');
    expect(list).toContain('viewCount={viewCountFor("wangka")}');
    expect(list).toContain("sortedBrands.map(brandSlug => brandCards[brandSlug])");
  });

  it("resolves the explicit brand route before the generic product route", () => {
    const app = source("../client/src/pages/miban/MibanApp.tsx");
    const brandRoute = app.indexOf('path={`${BASE}/limited/wangka`}');
    expect(brandRoute).toBeGreaterThan(0);
    expect(brandRoute).toBeLessThan(app.indexOf('path={`${BASE}/limited/:productKey`}'));
    expect(app.slice(brandRoute, brandRoute + 130)).toContain("component={LimitedBrandProducts}");
    expect(WANGKA_BRAND_PATH).not.toContain("pet-platform");
  });

  it("opens a real empty brand page without fabricating products, SKUs or prices", () => {
    expect(getMibanLimitedBrandBySlug("wangka")).toMatchObject({ brand: "旺咔", title: "旺咔宠物口粮精选", status: "on_sale" });
    expect(mibanLimitedProducts.filter(product => product.brand === "旺咔")).toEqual([]);
    const page = source("../client/src/pages/miban/LimitedBrandProducts.tsx");
    expect(page).toContain("图片为精选陈列展示，具体商品与规格确认后开放购买。");
    expect(page).toContain("enabled: !localPreviewMode && mibanLimitedProducts.some");
  });
});
