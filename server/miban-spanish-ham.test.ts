import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import sharp from "sharp";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { HERBALIFE_THEME } from "../shared/herbalife-theme";
import { getMibanLimitedBrandByName } from "../shared/miban-limited-brand-config";
import { getMibanLimitedProduct, getMibanLimitedProductSku, mibanLimitedProducts } from "../shared/miban-limited-products";
import { mibanSpanishHamProduct } from "../shared/miban-spanish-ham";
import { groupMibanCartItems } from "../shared/miban-cart-checkout";
import { cnyToU } from "../client/src/pages/miban/useMibanUsdtCnyRate";

// Offline only. No live page, backend/router, DB, availability hook, order harness,
// wallet or API imports/execution. Extract only actual pure initializers/JSX.
// The sole SSR substitute is MibanImage -> an inert native img; no API mocks.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const detailPath = "../client/src/pages/miban/HerbalifeRedGinsengDetail.tsx";
const parse = (source: string) => ts.createSourceFile("presentation.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const detailAst = () => parse(read(detailPath));
const base = "/miban-spain/ham/v1";
const stories = Array.from({ length: 9 }, (_, i) => `${base}/story-${String(i + 1).padStart(2, "0")}.webp`);
const assets = [...stories, `${base}/connector.webp`, `${base}/list.webp`, `${base}/sliced-hero.webp`, `${base}/whole-hero.webp`];
const skuFixtures = [
  { id: "spain-ham-sliced-single", priceCny: 60, unitLabel: "包", name: "切片单包", hero: `${base}/sliced-hero.webp` },
  { id: "spain-ham-whole-leg", priceCny: 2400, unitLabel: "只", name: "整只火腿", hero: `${base}/whole-hero.webp` },
] as const;
const wineFixtures = [
  { key: "spain-romanico", id: "spain-romanico-750ml", priceCny: 328 },
  { key: "spain-marthu", id: "spain-marthu-750ml", priceCny: 198 },
  { key: "spain-fidencio", id: "spain-fidencio-750ml", priceCny: 168 },
];
function ham() {
  const product = getMibanLimitedProduct("spain-iberian-ham");
  expect(product, "ham must be registered in the real shared catalog").toBeDefined();
  return product!;
}
function walk(node: ts.Node, visitor: (node: ts.Node) => void) {
  visitor(node);
  ts.forEachChild(node, child => walk(child, visitor));
}
function expression(ast: ts.SourceFile, name: string) {
  const matches: ts.Expression[] = [];
  walk(ast, node => {
    if (!ts.isVariableDeclaration(node) || !node.initializer) return;
    const named = ts.isIdentifier(node.name) && node.name.text === name;
    const state = ts.isArrayBindingPattern(node.name) && node.name.elements.some(element =>
      ts.isBindingElement(element) && ts.isIdentifier(element.name) && element.name.text === name);
    if (named || state) matches.push(node.initializer);
  });
  expect(matches, `one real ${name} initializer`).toHaveLength(1);
  return matches[0];
}
function initializer(name: string) {
  const ast = detailAst();
  return expression(ast, name).getText(ast);
}
function evaluate(source: string, bindings: Record<string, unknown> = {}) {
  expect(source).not.toMatch(/useQuery|useMutation|useEffect|fetch\s*\(|preparePayment|createOrder|walletPayment/);
  const js = ts.transpileModule(`return (${source});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings));
}
function pureFunction(ast: ts.SourceFile, name: string, bindings: Record<string, unknown> = {}) {
  const node = ast.statements.find((item): item is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(item) && item.name?.text === name);
  expect(node, `real independent presentation function ${name}`).toBeDefined();
  return evaluate(node!.getText(ast).replace(/^export\s+/, ""), bindings);
}
function imagePresentation({ variant, priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { variant?: string; priority?: boolean }) {
  return React.createElement("img", { ...props, "data-miban-image-variant": variant });
}
function connectedPosters() {
  return pureFunction(parse(read("../client/src/pages/miban/MibanConnectedPosters.tsx")), "MibanConnectedPosters", {
    React, MibanImage: imagePresentation,
  }) as React.ComponentType<{ images: string[]; title: string; background: string; connectorImage: string }>;
}
function renderPosters(images = stories) {
  const product = ham();
  return renderToStaticMarkup(React.createElement(connectedPosters(), {
    images, title: product.detail.title, ...product.detail.posterPresentation!,
  }));
}
function flags(currentProduct = ham()) {
  const currentBrand = getMibanLimitedBrandByName(currentProduct.brand);
  const isSpainProduct = evaluate(initializer("isSpainProduct"), { currentBrand });
  return {
    isSpainProduct,
    isSpainWineProduct: evaluate(initializer("isSpainWineProduct"), { currentProduct, isSpainProduct }),
    isSpainHamProduct: evaluate(initializer("isSpainHamProduct"), { currentProduct, isSpainProduct }),
  };
}
function jsxExpressions(ast: ts.SourceFile, predicate: (text: string) => boolean) {
  const matches: ts.Expression[] = [];
  walk(ast, node => {
    if (ts.isJsxExpression(node) && node.expression && predicate(node.expression.getText(ast))) matches.push(node.expression);
  });
  return matches;
}

describe("Spanish ham: real one-product/two-SKU catalog, not preview data", () => {
  it("registers exactly one ham with two globally unique active SKU IDs and an independent checkout group", () => {
    const products = mibanLimitedProducts.filter(product => product.key === "spain-iberian-ham" || product.checkoutGroupKey === "spain-ham");
    expect(products).toHaveLength(1);
    expect(ham()).toBe(mibanSpanishHamProduct);
    expect(ham()).toMatchObject({ key: "spain-iberian-ham", brand: "西班牙", category: "西班牙火腿", status: "on_sale", checkoutGroupKey: "spain-ham", detail: { skuSelectionLabel: "规格" }, orderPolicy: { commissionEligible: false, allowAddressBook: true, allowFavorite: true, enableReview: false } });
    expect(ham().publicPreview).toBeUndefined();
    expect(ham().skus.map(sku => sku.id)).toEqual(skuFixtures.map(sku => sku.id));
    expect(ham().skus.filter(sku => sku.active)).toHaveLength(2);
    expect(mibanLimitedProducts.filter(product => product.key === ham().key)).toHaveLength(1);
    for (const fixture of skuFixtures) {
      expect(mibanLimitedProducts.flatMap(product => product.skus).filter(sku => sku.id === fixture.id)).toHaveLength(1);
    }
  });

  it.each(skuFixtures)("$id preserves the approved CNY price, unit and selected packaging", fixture => {
    const product = ham();
    const sku = getMibanLimitedProductSku(product, fixture.id)!;
    expect(sku).toMatchObject({ id: fixture.id, name: fixture.name, priceCny: fixture.priceCny, unitLabel: fixture.unitLabel, active: true, quantityPerOrder: 1, maxPurchaseQty: 10, image: fixture.hero, heroImages: [fixture.hero] });
    expect(sku.marketPriceCny).toBeUndefined();
    expect(sku.netContentText).not.toMatch(/750\s*ml|瓶/i);
    expect(evaluate(initializer("productHeroImages"), { selectedSku: sku, currentProduct: product })).toEqual([fixture.hero]);
    expect(evaluate(initializer("detailImages"), { selectedSku: sku, currentProduct: product })).toEqual(stories);
    expect(evaluate(initializer("checkoutProductImage"), { selectedSku: sku, currentProduct: product })).toBe(fixture.hero);
    expect(JSON.stringify(sku)).not.toMatch(/"(?:priceU|priceUsdt|usdtPrice|fixedUPrice|usdtCnyRate|stockQty|stockQuantity|inventory|remainingStock)"\s*:/i);
  });

  it("contains four Spain products/eight SKUs while the three original wines and prices remain unchanged", () => {
    const products = mibanLimitedProducts.filter(product => product.brand === "西班牙" || product.key.startsWith("spain-"));
    expect(products).toHaveLength(4);
    expect(products.flatMap(product => product.skus)).toHaveLength(8);
    expect(new Set(products.flatMap(product => product.skus.map(sku => sku.id))).size).toBe(8);
    expect(products.map(product => product.key).sort()).toEqual([...wineFixtures.map(wine => wine.key), ham().key].sort());
    const wines = products.filter(product => product.checkoutGroupKey === "spain-wines");
    expect(wines.map(product => product.key)).toEqual(wineFixtures.map(wine => wine.key));
    for (const fixture of wineFixtures) {
      const product = getMibanLimitedProduct(fixture.key)!;
      expect(product.skus).toHaveLength(2);
      expect(product.skus[0]).toMatchObject({ id: fixture.id, priceCny: fixture.priceCny, unitLabel: "瓶", active: true });
    }
  });

  it("all catalog image references resolve to exactly the thirteen approved local assets", () => {
    const product = ham();
    const references = [product.card.image, product.detail.productImage, ...product.detail.heroImages,
      ...product.detail.detailImages!, product.detail.posterPresentation!.connectorImage,
      ...product.skus.flatMap(sku => [sku.image!, ...sku.heroImages!])];
    expect([...new Set(references)].sort()).toEqual([...assets].sort());
    expect(readdirSync(new URL(`../client/public${base}/`, import.meta.url)).sort()).toEqual(assets.map(path => path.split("/").pop()!).sort());
    expect(new Set(assets.map(path => createHash("sha256").update(readFileSync(new URL(`../client/public${path}`, import.meta.url))).digest("hex"))).size).toBe(13);
  });
});

describe("Spanish ham: decode the actual local WebP assets", () => {
  it.each(assets)("%s exists and fully decodes; stories are 1080x1920 and connector has real transparency", async path => {
    const file = new URL(`../client/public${path}`, import.meta.url);
    expect(existsSync(file), path).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    const metadata = await sharp(bytes, { failOn: "warning" }).metadata();
    expect(metadata.format).toBe("webp");
    const decoded = await sharp(bytes, { failOn: "warning" }).raw().toBuffer({ resolveWithObject: true });
    expect(decoded.info.width).toBe(metadata.width);
    expect(decoded.info.height).toBe(metadata.height);
    expect(decoded.data.length).toBe(decoded.info.width * decoded.info.height * decoded.info.channels);
    expect(decoded.info.width).toBeGreaterThan(0);
    expect(decoded.info.height).toBeGreaterThan(0);
    if (stories.includes(path)) {
      expect(metadata.width).toBe(1080);
      expect(metadata.height).toBe(1920);
    }
    if (path === `${base}/connector.webp`) {
      expect(metadata).toMatchObject({ width: 1200, height: 800, hasAlpha: true });
      expect(decoded.info.channels).toBe(4);
      const alpha = await sharp(bytes).extractChannel("alpha").raw().toBuffer();
      expect(alpha.some(value => value === 0), "transparent background pixels").toBe(true);
      expect(alpha.some(value => value > 0), "visible connector pixels").toBe(true);
      expect(alpha.some(value => value > 0 && value < 255), "soft transparent edge pixels").toBe(true);
    }
  });
});

describe("Spanish ham: real pure pricing, query/state and production sale gates", () => {
  it.each(skuFixtures)("$id dynamically displays CNY/U at changing public rates, including selection subtotal", fixture => {
    expect(vi.isMockFunction(cnyToU)).toBe(false);
    const Price = pureFunction(detailAst(), "Price", { React, cnyToU, HERBALIFE_THEME });
    const SelectionPrice = pureFunction(parse(read("../client/src/pages/miban/MibanWinePurchaseSheet.tsx")), "WineSelectionPrice", { React, cnyToU });
    const snapshots: string[] = [];
    for (const rate of [6.6541, 7.2, 8]) {
      expect(cnyToU(fixture.priceCny, rate)).toBeCloseTo(fixture.priceCny / rate, 12);
      snapshots.push(cnyToU(fixture.priceCny, rate).toFixed(2));
      const html = renderToStaticMarkup(React.createElement(Price, { value: fixture.priceCny, usdtCnyRate: rate }));
      expect(html).toContain(cnyToU(fixture.priceCny, rate).toFixed(2));
      expect(html).toContain("USDT");
      expect(html).toContain(`¥${fixture.priceCny.toFixed(2)}`);
      expect(html).not.toContain("line-through");
      const cny = fixture.priceCny * 3;
      const subtotal = renderToStaticMarkup(React.createElement(SelectionPrice, { cny, rate, accent: "#831C25" }));
      expect(subtotal).toContain(cnyToU(cny, rate).toFixed(2));
      expect(subtotal).toContain(`≈ ¥${cny.toFixed(2)}`);
    }
    expect(new Set(snapshots).size).toBe(3);
    expect(read("../shared/miban-spanish-ham.ts")).not.toMatch(/\b(?:6\.6541|7\.2|priceU|priceUsdt|usdtPrice|fixedUPrice)\b/);
  });

  it.each(skuFixtures)("$id retains the original /buy route, sku and quantity on URL/state round-trip", fixture => {
    const product = ham();
    const sku = getMibanLimitedProductSku(product, fixture.id)!;
    const normalize = pureFunction(detailAst(), "normalizePurchaseQuantity");
    const ast = detailAst();
    const selectedState = expression(ast, "selectedSkuId");
    const quantityState = expression(ast, "quantity");
    expect(ts.isCallExpression(selectedState) && selectedState.expression.getText(ast) === "useState").toBe(true);
    expect(ts.isCallExpression(quantityState) && quantityState.expression.getText(ast) === "useState").toBe(true);
    for (const quantity of [1, 3, sku.maxPurchaseQty]) {
      const checkoutPathBase = `/p/proj_hzxm2t/limited/${product.key}/buy`;
      const path = evaluate(initializer("checkoutPath"), { checkoutPathBase, activeSkuId: sku.id, requestedAnnualPlan: false, purchaseQuantity: quantity, ...flags(product) });
      const url = new URL(path, "https://offline.example.test");
      expect(url.pathname).toBe(checkoutPathBase);
      expect([...url.searchParams.entries()]).toEqual([["sku", sku.id], ["quantity", String(quantity)]]);
      const selected = evaluate((selectedState as ts.CallExpression).arguments[0].getText(ast), { checkoutSkuId: url.searchParams.get("sku") });
      const qty = evaluate((quantityState as ts.CallExpression).arguments[0].getText(ast), { checkoutQuery: url.searchParams, normalizePurchaseQuantity: normalize });
      expect(selected()).toBe(sku.id);
      expect(qty()).toBe(quantity);
      expect(evaluate(initializer("purchaseQuantity"), { quantity: qty(), maxQuantity: sku.maxPurchaseQty, normalizePurchaseQuantity: normalize })).toBe(quantity);
    }
    for (const invalid of [null, "", "0", "-1", "1.5", "NaN"]) expect(normalize(invalid, sku.maxPurchaseQty)).toBe(1);
    expect(normalize(100, sku.maxPurchaseQty)).toBe(sku.maxPurchaseQty);
  });

  it.each(skuFixtures)("$id requires true runtime availability in production, never catalog status alone", fixture => {
    const currentProduct = ham();
    const selectedSku = getMibanLimitedProductSku(currentProduct, fixture.id)!;
    const key = `${currentProduct.key}:${selectedSku.id}`;
    const bindings = { currentProduct, selectedSku, ...flags(currentProduct), localPreviewMode: false };
    for (const availabilityLoading of [true, false]) {
      for (const availabilityBySku of [new Map(), new Map([[key, { isOnSale: false }]]), new Map([[key, { isOnSale: "true" }]])]) {
        expect(evaluate(initializer("isOnSale"), { ...bindings, availabilityLoading, availabilityBySku })).toBe(false);
      }
    }
    const available = new Map([[key, { isOnSale: true }]]);
    expect(evaluate(initializer("isOnSale"), { ...bindings, availabilityLoading: true, availabilityBySku: available })).toBe(false);
    expect(evaluate(initializer("isOnSale"), { ...bindings, availabilityLoading: false, availabilityBySku: available })).toBe(true);
    expect(evaluate(initializer("isOnSale"), { ...bindings, selectedSku: undefined, availabilityLoading: false, availabilityBySku: available })).toBe(false);
    expect(evaluate(initializer("isOnSale"), { ...bindings, currentProduct: { ...currentProduct, status: "draft" }, availabilityLoading: false, availabilityBySku: available })).toBe(false);
    expect(evaluate(initializer("isOnSale"), { ...bindings, localPreviewMode: true, availabilityLoading: true, availabilityBySku: new Map() })).toBe(true);
    expect(evaluate(initializer("activeSkus"), { currentProduct, localPreviewMode: false, availabilityLoading: false, availabilityBySku: available })).toEqual([selectedSku]);
  });

  it("two ham specifications group together but remain separate from all three wines using the actual cart helper", () => {
    const products = [ham(), ...wineFixtures.map(wine => getMibanLimitedProduct(wine.key)!)];
    const items = products.flatMap(product => product.skus.map((sku, i) => ({
      productKey: product.key, skuId: sku.id, checkoutGroupKey: product.checkoutGroupKey!,
      groupLabel: product.checkoutGroupKey === "spain-ham" ? "西班牙火腿" : "西班牙红酒",
      priceCny: sku.priceCny, quantity: product === ham() ? (i === 0 ? 3 : 2) : 1,
    })));
    const groups = groupMibanCartItems(items);
    expect(groups).toHaveLength(2);
    expect(groups.map(group => group.checkoutGroupKey)).toEqual(["spain-ham", "spain-wines"]);
    expect(groups[0]).toMatchObject({ itemCount: 5, totalCny: 60 * 3 + 2400 * 2 });
    expect(groups[0].items).toEqual(items.slice(0, 2));
    expect(groups[1]).toMatchObject({ itemCount: 6, totalCny: wineFixtures.reduce((sum, wine) => sum + wine.priceCny * 7, 0) });
    expect(groups[1].items).toEqual(items.slice(2));
    const source = read(detailPath);
    const cartAdd = source.match(/addCartItem\(\{([\s\S]*?)\}\);/)?.[1];
    expect(cartAdd).toContain("checkoutGroupKey: currentProduct.checkoutGroupKey ?? currentProduct.key");
    expect(cartAdd).toContain("skuId: selectedSku.id");
    expect(cartAdd).toContain("priceCny: selectedSku.priceCny");
    expect(cartAdd).toContain("quantity: purchaseQuantity");
    expect(cartAdd).not.toMatch(/priceU|cnyToU|usdtCnyRate/);
  });
});

describe("Spanish ham: connected posters render natural full images and eight transparent seams", () => {
  it("SSR renders nine real main images in order and eight inert connector overlays", () => {
    const $ = load(renderPosters());
    const container = $('[data-testid="miban-connected-posters"]');
    expect(container).toHaveLength(1);
    expect(container.attr("style")).toContain(`background:${ham().detail.posterPresentation!.background}`);
    expect(container.attr("class")).not.toContain("overflow-hidden");
    const figures = container.children("figure");
    expect(figures).toHaveLength(9);
    expect(container.find('img[data-miban-image-variant="poster"]')).toHaveLength(9);
    expect(container.find('[data-testid="miban-poster-seam"]')).toHaveLength(8);
    figures.each((index, node) => {
      const figure = $(node);
      expect(figure.attr("class")).toBe("relative m-0 p-0");
      expect(figure.attr("class")).not.toMatch(/overflow-hidden|aspect-|h-\[/);
      const image = figure.children('img[data-miban-image-variant="poster"]');
      expect(image.attr("src")).toBe(stories[index]);
      expect(image.attr("width")).toBe("1080");
      expect(image.attr("height")).toBe("1920");
      expect(image.attr("class")).toBe("block h-auto w-full");
      expect(image.attr("style")).toContain("aspect-ratio:9 / 16");
      expect(image.attr("class")).not.toMatch(/object-cover|absolute|h-full/);
      expect(image.attr("loading")).toBe("lazy");
      expect(figure.find('[data-testid="miban-poster-seam"]')).toHaveLength(index < 8 ? 1 : 0);
    });
  });

  it("each seam crosses the bottom by half its own height and alternates right/left without intercepting input", () => {
    const $ = load(renderPosters());
    $('[data-testid="miban-poster-seam"]').each((index, node) => {
      const seam = $(node);
      expect(seam.attr("src")).toBe(ham().detail.posterPresentation!.connectorImage);
      expect(seam.attr("data-miban-image-variant")).toBe("original");
      expect(seam.attr("width")).toBe("1200");
      expect(seam.attr("height")).toBe("800");
      expect(seam.attr("aria-hidden")).toBe("true");
      expect(seam.attr("alt")).toBe("");
      expect(seam.attr("class")).toContain("pointer-events-none absolute bottom-0 z-10 h-auto");
      const style = seam.attr("style")!;
      expect(style).toContain("translateY(50%)");
      if (index % 2 === 1) {
        expect(style).toContain("left:0");
        expect(style).not.toContain("right:");
        expect(style).toContain("width:46%");
        expect(style).toContain("scaleX(-1)");
      } else {
        expect(style).toContain("right:0");
        expect(style).not.toContain("left:");
        expect(style).toContain("width:54%");
        expect(style).not.toContain("scaleX");
      }
      expect(style).not.toMatch(/background:|height:|overflow:/);
    });
    const html = renderPosters();
    expect(html).not.toMatch(/750\s*ml|预览|核验|<footer|<button|USDT|钱包/i);
  });

  it("the final image never receives a trailing connector, including the single-image boundary", () => {
    for (const count of [0, 1, 2, 9]) {
      const $ = load(renderPosters(stories.slice(0, count)));
      expect($("figure")).toHaveLength(count);
      expect($('[data-testid="miban-poster-seam"]')).toHaveLength(Math.max(0, count - 1));
      expect($("figure").last().find('[data-testid="miban-poster-seam"]')).toHaveLength(0);
    }
  });

  it("the detail page passes the actual catalog poster config and suppresses the old generic image caption", () => {
    const ast = detailAst();
    const gates = jsxExpressions(ast, text => text.startsWith("detailImages.length > 0 &&") && text.includes("<MibanConnectedPosters"));
    expect(gates).toHaveLength(1);
    // The real conditional selects the connected branch. Unselected legacy JSX
    // cannot execute, and only its MibanImage presentation leaf is substituted.
    const element = evaluate(gates[0].getText(ast), {
      React, currentProduct: ham(), detailImages: stories, MibanConnectedPosters: connectedPosters(),
    });
    const html = renderToStaticMarkup(element);
    expect(load(html)('[data-testid="miban-poster-seam"]')).toHaveLength(8);
    const caption = jsxExpressions(ast, text => text.startsWith("!currentProduct.detail.posterPresentation &&"));
    expect(caption).toHaveLength(1);
    expect(evaluate(caption[0].getText(ast), { currentProduct: ham() })).toBe(false);
    expect(read(detailPath)).toContain('from "./MibanConnectedPosters"');
  });
});

describe("Spanish ham: wine-only wording and existing invoice route are preserved", () => {
  it("the actual Spain wine flag selects only the three wines; ham gets its own quantity hint and no 750ml", () => {
    for (const product of mibanLimitedProducts) {
      expect(flags(product).isSpainWineProduct, product.key).toBe(product.brand === "西班牙" && product.checkoutGroupKey === "spain-wines");
      expect(flags(product).isSpainHamProduct, product.key).toBe(product.key === "spain-iberian-ham");
    }
    const ast = detailAst();
    const hints = jsxExpressions(ast, text => text.startsWith("skuSelectionLabel ===") && text.includes('"切片单包或整只装，按所选数量下单"'));
    expect(hints).toHaveLength(1);
    const bindings = { skuSelectionLabel: "规格", isPreviewProduct: false };
    const hamHint = evaluate(hints[0].getText(ast), { ...bindings, ...flags(ham()) });
    expect(hamHint).toBe("切片单包或整只装，按所选数量下单");
    expect(hamHint).not.toMatch(/750\s*ml|瓶/i);
    const gates = jsxExpressions(ast, text => text.startsWith("!isSpainWineProduct &&"));
    expect(gates).toHaveLength(1);
    expect(ts.isBinaryExpression(gates[0])).toBe(true);
    const visible = (gates[0] as ts.BinaryExpression).left.getText(ast);
    expect(evaluate(visible, flags(ham()))).toBe(true);
    for (const fixture of wineFixtures) {
      const wine = getMibanLimitedProduct(fixture.key)!;
      expect(evaluate(visible, flags(wine))).toBe(false);
      expect(wine.detail.tags.join(" ")).not.toMatch(/单瓶|整箱|按需选择/);
    }
    expect(JSON.stringify(ham())).not.toMatch(/750\s*ml|资料预览|仅供.*核验|尚未上架/i);
    const footer: ts.JsxElement[] = [];
    walk(ast, node => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "footer") footer.push(node);
    });
    expect(footer.filter(node => /预览|核验|设计|参考/.test(node.getText(ast)))).toHaveLength(0);
    expect(read(detailPath)).not.toMatch(/火腿[^\n]*仅供[^\n]*预览|本地预览说明|本地预览素材|当前为火腿视觉预览/);
    expect(ham().detail.logistics).toEqual([]);
    expect(ham().detail.notices).toEqual([]);
  });

  it("source only: ham uses generic signed-wallet createOrder and its unchanged optional invoice flow", () => {
    const source = read(detailPath);
    expect(source).toContain("const createOrder = mtrpc.limitedProduct.createOrder.useMutation");
    const support = source.indexOf("support = await mibanUtils.limitedProduct.invoiceSupport.fetch");
    const prepared = source.indexOf("const preparedPayment = await walletPayment.preparePayment()");
    expect(support).toBeGreaterThan(0);
    expect(support).toBeLessThan(prepared);
    const input = source.slice(source.indexOf("const input = {", prepared), source.indexOf("const callbacks =", prepared));
    expect(input).toContain("productKey: currentProduct.key");
    expect(input).toContain("skuId: selectedSku.id");
    expect(input).toContain("quantity: purchaseQuantity");
    expect(input).toContain("paymentQuoteToken: preparedPayment.paymentQuoteToken");
    expect(input).toContain("...(invoice.invoiceRequest ? { invoiceRequest: invoice.invoiceRequest } : {})");
    expect(source).toMatch(/if \(isAnnualPlan\) \{\s*createAnnualOrder\.mutate\(input, callbacks\);\s*\} else \{\s*createOrder\.mutate\(input, callbacks\);/);
    expect(source).not.toMatch(/(?:ham|Ham)(?:Create|create|OrderMutation|InvoiceMutation)/);
    const backend = read("./miban.ts");
    const normalOrder = backend.slice(backend.indexOf("  createOrder: protectedProcedure"), backend.indexOf("  createCartOrder: protectedProcedure"));
    const cartOrder = backend.slice(backend.indexOf("  createCartOrder: protectedProcedure"));
    for (const route of [normalOrder, cartOrder]) {
      expect(route).toContain("invoiceRequest: mibanInvoiceRequestSchema.optional()");
      expect(route).toContain("if (input.invoiceRequest) await ensureMibanOrderInvoiceInfrastructure()");
      expect(route).toMatch(/insertMibanOrderInvoiceRequest\(\{ transaction, orderId(?:: createdOrderId)?, userId, invoiceRequest: input\.invoiceRequest \}\)/);
    }
    expect(normalOrder).toContain("getMibanLimitedProduct(input.productKey)");
    expect(cartOrder).toContain("getMibanLimitedProduct(item.productKey)");
    expect(cartOrder).toContain("const checkoutGroupKey = product.checkoutGroupKey ?? product.key;");
    expect(cartOrder).toContain("groupedLines.set(checkoutGroupKey, group)");
  });
});
