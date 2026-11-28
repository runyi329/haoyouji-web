import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";
import ts from "typescript";
import sharp from "sharp";
import * as fx from "../shared/usdt-cny-display";
import { mibanOfficialCardVisuals, getMibanOfficialCardVisual } from "../shared/miban-official-card-visuals";
import { getMibanOfficialProduct } from "../shared/miban-official-selection";

const officialPrices = [
  ["nuskin-official-1", 665], ["nuskin-official-2", 335], ["nuskin-official-3", 300],
  ["nuskin-official-4", 350], ["nuskin-official-5", 85],
  ["marykay-official-1", 568], ["marykay-official-2", 568], ["marykay-official-3", 588],
  ["marykay-official-4", 428], ["marykay-official-5", 388],
  ["amway-official-1", 99], ["amway-official-2", 129], ["amway-official-3", 54],
  ["amway-official-4", 46], ["amway-official-5", 88],
] as const;
const root = process.cwd();
const source = readFileSync(path.join(root, "client/src/pages/miban/OfficialReferencePrice.tsx"), "utf8");
const list = readFileSync(path.join(root, "client/src/pages/miban/OfficialBrandSelection.tsx"), "utf8");
const detail = readFileSync(path.join(root, "client/src/pages/miban/OfficialProductDetail.tsx"), "utf8");
// Existing verified list-card sources are independent of later detail-gallery URLs.
const frozenNuskinCardSources = [
  ["/miban-official/nuskin/hero-official-full-cover.webp", "https://img.cn.nuskin.com/supplychain-prod/undefined/6X4HW6iEpZ.jpg"],
  ["/miban-official/nuskin/nuskin-official-2/nuskin-official-2-cover.webp", "https://img.cn.nuskin.com/supplychain-prod/undefined/rZzEdwFjmw.jpg"],
  ["/miban-official/nuskin/nuskin-official-3/nuskin3-cover.webp", "https://img.cn.nuskin.com/supplychain-prod/undefined/R7eJQEAPKa.jpg"],
  ["/miban-official/nuskin/nuskin-official-4/original-0af32a74d218.jpg", "https://img.cn.nuskin.com/supplychain-prod/release/F4SyCsmMXn.jpg"],
  ["/miban-official/nuskin/nuskin-official-5/original-fcce320ded57.jpg", "https://china.nuskin.com/content/dam/ns-zh/images/product/cn/supplychain-prod/release/Bf37GXCttx.jpg"],
] as const;
type VNode = { children: unknown[] };
const React = { createElement: (_type: unknown, _props: unknown, ...children: unknown[]): VNode => ({ children }) };
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "children" in node) return text((node as VNode).children);
  return typeof node === "number" || typeof node === "string" ? String(node) : "";
}
function load(data: unknown) {
  const useQuery = vi.fn(() => ({ data }));
  const exports: Record<string, any> = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } });
  runInNewContext(outputText, { React, exports, require: (name: string) => {
    if (name === "@shared/usdt-cny-display") return fx;
    if (name === "@/lib/trpc") return { trpc: { getCryptoPrices: { useQuery } } };
    throw new Error(`Unexpected production import: ${name}`);
  } });
  return Object.assign(exports, { useQuery });
}
const prices = (rate: unknown = 6.6541, extra = {}) => ({ usdtCnyRate: rate, usdtCnyFx: { pair: "USDT/CNY", rate, stale: false, source: "official-live-source", asOf: new Date().toISOString(), observedAt: new Date().toISOString(), ...extra } });

describe("官方只读精选的真实U参考价格", () => {
  it("实际组件复用现有getCryptoPrices入口、30秒刷新，不伪造7.2或沿用无限旧值", () => {
    const module = load(prices());
    expect(module.useOfficialUsdtCnyRate()).toBe(6.6541);
    expect(module.useQuery).toHaveBeenCalledWith(undefined, { refetchInterval: 30_000, staleTime: 25_000 });
    expect(source).not.toMatch(/7\.2|FALLBACK|lastValidRate|useState/);
  });
  it.each(officialPrices)("%s的已核验人民币基价%s只在展示时除以真实汇率", (key, amount) => {
    expect(getMibanOfficialProduct(key)!.officialPriceCny).toBe(amount);
    const module = load(prices());
    expect(module.getOfficialReferencePrice(amount, 6.6541)).toBe(amount / 6.6541);
    const rendered = text(module.default({ priceCny: amount }));
    expect(rendered).toContain((amount / 6.6541).toFixed(2) + "U");
    expect(rendered).toContain(`官网零售价 ¥${amount.toFixed(2)}`);
  });
  it.each([undefined, null, {}, { usdtCnyRate: 6.6541 }, prices(0), prices(NaN), prices(Infinity), prices(6.6541, { stale: true }), prices(6.6541, { success: false }), prices(6.6541, { observedAt: new Date(Date.now() - 130_000).toISOString() })])("真实汇率缺失或失效时仍保留官网价且不显示假U值：%s", data => {
    const module = load(data);
    expect(module.useOfficialUsdtCnyRate()).toBeNull();
    expect(module.getOfficialReferencePrice(665, null)).toBeNull();
    const rendered = text(module.default({ priceCny: 665 }));
    expect(rendered).toContain("--U");
    expect(rendered).toContain("汇率待更新");
    expect(rendered).toContain("¥665.00");
    expect(rendered).not.toMatch(/NaN|Infinity|0\.00U/);
  });
  it.each([undefined, null, 0, -1, NaN, Infinity])("未核价%s不能展示为0U", amount => {
    const module = load(prices());
    expect(module.getOfficialReferencePrice(amount, 6.6541)).toBeNull();
    expect(text(module.default({ priceCny: amount }))).toContain("官网价格待核实");
  });
  it("列表与详情使用同一个只读价格组件，不接入销售或支付", () => {
    expect(list).toContain("<OfficialReferencePrice priceCny={product.officialPriceCny} compact");
    expect(detail).toContain("<OfficialReferencePrice priceCny={salePrice}");
    expect(source + list + detail).not.toMatch(/\.mutate|addToCart|createOrder|initInventory/);
    expect(detail).toContain("此页不收款、不创建订单");
  });
});

describe("十五款铺满融合式列表图不影响详情", () => {
  it("三品牌十五款都有getCardVisual，独立560×700新图及0.8真实源裁区", async () => {
    expect(Object.keys(mibanOfficialCardVisuals).sort()).toEqual(officialPrices.map(([key]) => key).sort());
    const cardImages = new Set<string>();
    for (const [key] of officialPrices) {
      const visual = getMibanOfficialCardVisual(key)!;
      expect(visual).toBeDefined();
      const product = getMibanOfficialProduct(key)!;
      expect(visual.image).toMatch(new RegExp(`^/miban-official/${product.brandSlug}/`));
      if (product.brandSlug === "nuskin") expect(visual.image).toContain("/list-v2/");
      expect(cardImages.has(visual.image)).toBe(false);
      cardImages.add(visual.image);
      expect(visual.image).not.toBe(visual.sourceImage);
      expect(visual.image).not.toBe(product.cardImageUrl);
      expect(visual.image).not.toBe(product.heroImageUrl);
      expect(product.gallery.map(image => image.url)).not.toContain(visual.image);
      for (const image of [visual.image, visual.sourceImage]) expect(existsSync(path.join(root, "client/public", image))).toBe(true);
      const rendered = await sharp(path.join(root, "client/public", visual.image)).metadata();
      expect([rendered.width, rendered.height]).toEqual([560, 700]);
      const original = await sharp(path.join(root, "client/public", visual.sourceImage)).metadata();
      const [x0, y0, x1, y1] = visual.crop;
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(y0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeGreaterThan(x0);
      expect(y1).toBeGreaterThan(y0);
      expect(x1).toBeLessThanOrEqual(original.width!);
      expect(y1).toBeLessThanOrEqual(original.height!);
      expect((x1 - x0) / (y1 - y0)).toBeCloseTo(0.8, 8);
      expect(visual.sourceUrl).toMatch(/^https:\/\//);
      if (product.brandSlug === "nuskin") {
        const frozen = frozenNuskinCardSources[Number(key.split("-").at(-1)) - 1];
        expect([visual.sourceImage, visual.sourceUrl]).toEqual(frozen);
      } else {
        expect([product.heroSourceUrl, ...product.gallery.map(image => image.sourceUrl), ...product.evidence.map(item => item.url)]).toContain(visual.sourceUrl);
      }
      expect(product.sellable).toBe(false);
      expect(product).not.toHaveProperty("priceCny");
    }
    expect(cardImages.size).toBe(15);
  });
  it("照片铺满图槽且右侧融合，价格按钮独立grid", () => {
    expect(list).toContain("getMibanOfficialCardVisual(product.key)");
    expect(list).toContain("absolute inset-0 h-full w-full object-cover object-center");
    expect(list).toContain("from-transparent to-white");
    expect(list).toContain("grid-cols-[minmax(0,1fr)_auto] items-end gap-2");
    expect(list).not.toContain("h-[176px]");
  });
  it("如新首款详情不覆盖，后两款真实正文已补全，其他品牌使用独立列表视觉", () => {
    const first = getMibanOfficialProduct("nuskin-official-1")!;
    expect(first.heroImageUrl).toBe("/miban-official/nuskin/hero-official-full-cover.webp");
    expect(first.gallery[0].url).toBe("/miban-official/nuskin/detail-full-original.jpg");
    for (const [key] of officialPrices.filter(([key]) => !key.startsWith("nuskin-"))) {
      expect(getMibanOfficialCardVisual(key)).toBeDefined();
      expect(getMibanOfficialCardVisual(key)!.image).not.toContain("/nuskin/");
    }
    for (const key of ["nuskin-official-4", "nuskin-official-5"]) {
      const product = getMibanOfficialProduct(key)!;
      expect(product.detailStatus).toBe("complete");
      expect(product.mobilePoster!.sourcePosterCount).toBe(1);
      expect(product.gallery[0].kind).toBe("poster");
      expect(product.evidence.some(item => item.url.includes("item/detail/get"))).toBe(true);
    }
  });
});
