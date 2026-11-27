import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChongbanSectionTabs from "../client/src/components/ChongbanSectionTabs";
import { CHONGBAN_SERVICES_PATH, CHONGBAN_SHOP_PATH } from "../client/src/lib/chongban-navigation";
import { WANGKA_BRAND_PATH } from "../client/src/pages/miban/WangkaBrandCard";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const renderTabs = (active: "shop" | "services") => renderToStaticMarkup(
  React.createElement(Router, { ssrPath: active === "shop" ? CHONGBAN_SHOP_PATH : CHONGBAN_SERVICES_PATH },
    React.createElement(ChongbanSectionTabs, { active }))
);

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("Chongban shop-first entrance and preserved services (offline)", () => {
  it("shares the exact existing Wangka route without replacing the legacy services route", () => {
    expect(CHONGBAN_SHOP_PATH).toBe(WANGKA_BRAND_PATH);
    expect(CHONGBAN_SERVICES_PATH).toBe("/pet-platform");
    expect(CHONGBAN_SHOP_PATH).not.toBe(CHONGBAN_SERVICES_PATH);
  });

  it("sends all historical pet category names directly to the actual shop", () => {
    const home = source("../client/src/pages/Home.tsx");
    const branch = home.match(/if \(cat\.name === '宠物生活' \|\| cat\.name === '宠物伴侣' \|\| cat\.name === '宠伴'\) \{([\s\S]*?)\}/)?.[1];
    expect(branch).toContain("navigate(CHONGBAN_SHOP_PATH)");
    expect(branch).toContain("return;");
    expect(branch).not.toContain("pet-platform");
    expect(home).toContain("name: '宠伴', iconUrl: CHONGBAN_ICON_PATH");
    expect(home).toContain("const MIBAN_HOME_PATH = '/p/proj_hzxm2t/'");
  });

  it.each(["shop", "services"] as const)("renders both working links with exactly one selected section: %s", active => {
    const html = renderTabs(active);
    expect(html).toContain('aria-label="宠伴专区切换"');
    expect(html).toContain(`href="${CHONGBAN_SHOP_PATH}"`);
    expect(html).toContain(`href="${CHONGBAN_SERVICES_PATH}"`);
    expect(html).toContain("口粮精选");
    expect(html).toContain("功能区");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const activePath = active === "shop" ? CHONGBAN_SHOP_PATH : CHONGBAN_SERVICES_PATH;
    const selectedLink = html.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0];
    expect(selectedLink).toContain(`href="${activePath}"`);
  });

  it("adds the shop tabs only to Wangka and leaves inventory guards intact", () => {
    const page = source("../client/src/pages/miban/LimitedBrandProducts.tsx");
    expect(page).toContain('{brandSlug === "wangka" && <ChongbanSectionTabs active="shop" />}');
    expect(page).toContain("enabled: !localPreviewMode && mibanLimitedProducts.some");
  });

  it("retains the old route and wraps all services states, including machine details", () => {
    expect(source("../client/src/App.tsx")).toContain('<Route path="/pet-platform" component={PetPlatform} />');
    const page = source("../client/src/pages/PetPlatform.tsx");
    expect(page).toContain('<ChongbanSectionTabs active="services" />');
    expect(page).toContain("<PetPlatformContent />");
    expect(page).toContain("trpc.pet.getMyRole.useQuery()");
    expect(page).toContain("trpc.pet.getMyMachines.useQuery()");
    expect(page).toContain("upsert.mutate({ machineId: machine.id, recordDate: date, revenue: parseFloat(revenue) })");
    expect(page).toContain('userRole === "admin" || userRole === "petshop"');
    expect(page).toContain("<MachineDetail");
  });

  it("keeps the shared tabs pure navigation, without hidden data pages or auth bypass", () => {
    const tabs = source("../client/src/components/ChongbanSectionTabs.tsx");
    expect(tabs).not.toMatch(/useQuery|useMutation|useEffect|useLayoutEffect|PetPlatformContent|iframe|BYPASS/);
  });
});
