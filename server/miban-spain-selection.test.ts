import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { HERBALIFE_THEME } from "../shared/herbalife-theme";
import {
  getMibanLimitedBrandByName,
  getMibanLimitedBrandBySlug,
  mibanLimitedBrands,
  mibanLimitedAttentionSlugs,
} from "../shared/miban-limited-brand-config";
import {
  getMibanLimitedProduct,
  getMibanLimitedProductSku,
  mibanLimitedProducts,
  type LimitedProduct,
} from "../shared/miban-limited-products";
import { groupMibanCartItems } from "../shared/miban-cart-checkout";
import { cnyToU } from "../client/src/pages/miban/useMibanUsdtCnyRate";

// Offline only: real shared catalogs, real local assets and real cnyToU. No app
// mocks, live hooks, backend/router imports, wallet calls, DB or order harness.
// 6.6541 is a supplied conversion fixture, NOT an application default/live quote.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const wines = [
  { key: "spain-romanico", skuId: "spain-romanico-750ml", name: "ROMANICO", priceCny: 328,
    legacyFile: "WineProductRomanico", struckPriceCny: 468,
    legacyMain: "romanico-main-square-Q4xQjKSfZ72zcj4mvWfiMK.webp", image: "/miban-spain/products/v2/romanico-list.webp" },
  { key: "spain-marthu", skuId: "spain-marthu-750ml", name: "MARTHU", priceCny: 198,
    legacyFile: "WineProductMarthu", struckPriceCny: 268,
    legacyMain: "marthu-compressed_1fe7a336.webp", image: "/miban-spain/products/v2/marthu-list.webp" },
  { key: "spain-fidencio", skuId: "spain-fidencio-750ml", name: "FIDENCIO", priceCny: 168,
    legacyFile: "WineProductFidencio", struckPriceCny: 238,
    legacyMain: "fidencio-compressed_26249364.webp", image: "/miban-spain/products/v2/fidencio-list.webp" },
] as const;
function productFor(key: string): LimitedProduct {
  const product = getMibanLimitedProduct(key);
  expect(product, `${key} must exist in the real shared catalog`).toBeDefined();
  return product!;
}
function walk(node: ts.Node, visitor: (node: ts.Node) => void) {
  visitor(node);
  ts.forEachChild(node, child => walk(child, visitor));
}
const parse = (source: string) => ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const detailPath = "../client/src/pages/miban/HerbalifeRedGinsengDetail.tsx";

// Price is currently a private, pure presentation component. Extract only that
// declaration, never execute/import the full detail page or its mutations.
function realPriceHelper() {
  const ast = parse(read(detailPath));
  const helper = ast.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "Price");
  expect(helper, "existing independent Price presentation helper").toBeDefined();
  expect(helper!.getText(ast)).not.toMatch(/useQuery|useMutation|fetch|walletPayment|createOrder|preparePayment/);
  const js = ts.transpileModule(`${helper!.getText(ast)}\nreturn Price;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function("React", "cnyToU", "HERBALIFE_THEME", js)(React, cnyToU, HERBALIFE_THEME) as
    (props: { value: number; usdtCnyRate: number }) => React.ReactElement;
}

// Resolve local rate aliases for narrow source checks without prescribing new
// variable names or mocking a wallet/public query. This follows only existing
// top-level declarations inside the actual detail component.
function detailRateWiring() {
  const ast = parse(read(detailPath));
  const component = ast.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "HerbalifeRedGinsengDetail");
  expect(component?.body).toBeDefined();
  const definitions = new Map<string, ts.Expression>();
  for (const statement of component!.body!.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer)
        definitions.set(declaration.name.text, declaration.initializer);
    }
  }
  const expandRate = (expression: ts.Expression, checkout: boolean, seen = new Set<string>()): string => {
    if (ts.isIdentifier(expression) && definitions.has(expression.text) && !seen.has(expression.text)) {
      return expandRate(definitions.get(expression.text)!, checkout, new Set([...seen, expression.text]));
    }
    if (ts.isConditionalExpression(expression)) {
      if (expression.condition.getText(ast) === "isCheckoutPage") {
        return expandRate(checkout ? expression.whenTrue : expression.whenFalse, checkout, seen);
      }
      return `${expression.condition.getText(ast)} ? ${expandRate(expression.whenTrue, checkout, seen)} : ${expandRate(expression.whenFalse, checkout, seen)}`;
    }
    return expression.getText(ast);
  };
  const priceRates: string[] = [];
  const settlementRates: string[] = [];
  walk(component!, node => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return;
    if (!["Price", "MibanCheckoutPaymentAmount"].includes(node.tagName.getText(ast))) return;
    const attribute = node.attributes.properties.find((item): item is ts.JsxAttribute =>
      ts.isJsxAttribute(item) && item.name.getText(ast) === "usdtCnyRate");
    if (!attribute?.initializer || !ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) return;
    const resolved = expandRate(attribute.initializer.expression, node.tagName.getText(ast) === "MibanCheckoutPaymentAmount");
    (node.tagName.getText(ast) === "Price" ? priceRates : settlementRates).push(resolved);
  });
  return { ast, definitions, priceRates, settlementRates, expandRate };
}

describe("Spain selection: three real original wines in the shared catalog (offline)", () => {
  it("registers one on-sale Spain brand and one attention slug in the approved order", () => {
    expect(mibanLimitedBrands.filter(brand => String(brand.slug) === "spain")).toHaveLength(1);
    const brand = getMibanLimitedBrandBySlug("spain");
    expect(brand).toMatchObject({ slug: "spain", brand: "西班牙", status: "on_sale" });
    expect(getMibanLimitedBrandByName("西班牙")).toBe(brand);
    expect([...mibanLimitedAttentionSlugs]).toEqual([
      "herbalife", "tuoquetang", "lingchuang", "fruits", "midaniang", "wangka",
      "spain", "guizhou", "amway", "marykay", "nuskin", "jianghai",
    ]);
    expect(mibanLimitedAttentionSlugs.filter(slug => slug === "spain")).toHaveLength(1);
  });

  it("contains exactly the three selected wines with globally unique product keys and Spain SKU IDs", () => {
    const products = mibanLimitedProducts.filter(product =>
      (product.brand === "西班牙" || product.key.startsWith("spain-")) && product.checkoutGroupKey === "spain-wines");
    expect(products.map(product => product.key).sort()).toEqual(wines.map(wine => wine.key).sort());
    for (const wine of wines) {
      expect(mibanLimitedProducts.filter(product => product.key === wine.key)).toHaveLength(1);
      expect(mibanLimitedProducts.flatMap(product => product.skus).filter(sku => sku.id === wine.skuId)).toHaveLength(1);
    }
    // Some unrelated historical products share a SKU ID; only new Spain IDs must
    // be globally unique, while catalog product keys are globally unique.
    expect(new Set(mibanLimitedProducts.map(product => product.key)).size).toBe(mibanLimitedProducts.length);
    expect(products.flatMap(product => product.skus)).toHaveLength(6);
    expect(new Set(products.flatMap(product => product.skus.map(sku => sku.id))).size).toBe(6);
  });

  it.each(wines)("$key preserves its old actual sales price, never the old struck-through price", wine => {
    const legacy = read(`../client/src/pages/wine/products/${wine.legacyFile}.tsx`);
    const sales = [...legacy.matchAll(/<span\b[^>]*style=\{\{\s*fontSize:\s*16\s*\}\}>¥<\/span>\s*(\d+)/g)];
    expect(sales.map(match => Number(match[1]))).toEqual([wine.priceCny]);
    const struck = [...legacy.matchAll(/<span\b[^>]*className="[^"]*line-through[^"]*"[^>]*>¥(\d+)<\/span>/g)];
    expect(struck.map(match => Number(match[1]))).toContain(wine.struckPriceCny);
    expect(legacy).toContain(wine.legacyMain);
    const product = productFor(wine.key);
    expect(product).toMatchObject({
      key: wine.key, brand: "西班牙", category: "红葡萄酒", status: "on_sale", checkoutGroupKey: "spain-wines",
      orderPolicy: { commissionEligible: false, allowAddressBook: true, allowFavorite: true, enableReview: false },
    });
    expect(`${product.card.title} ${product.card.subtitle} ${product.detail.title} ${product.detail.subtitle}`.toUpperCase()).toContain(wine.name);
    expect(product.skus).toHaveLength(2);
    expect(product.skus[0]).toMatchObject({
      id: wine.skuId, active: true, quantityPerOrder: 1, unitLabel: "瓶", priceCny: wine.priceCny,
    });
    expect(product.skus[0].netContentText).toMatch(/750\s*ml/i);
    expect(product.skus[0].priceCny).not.toBe(wine.struckPriceCny);
    expect(getMibanLimitedProductSku(product, wine.skuId)).toBe(product.skus[0]);
    expect(getMibanLimitedProductSku(product, "nonexistent-spain-sku")).toBeUndefined();
    // No imported, unverified market/strike price and no baked-in U quotation.
    expect(product.skus[0].marketPriceCny).toBeUndefined();
    expect(JSON.stringify(product)).not.toMatch(/"(?:priceU|priceUsdt|usdtPrice|fixedUPrice|usdtCnyRate)"\s*:/i);
    expect(JSON.stringify(product)).not.toMatch(/"(?:stock|stockQty|stockQuantity|stock_qty|inventory|inventoryCount|remainingStock)"\s*:\s*\d/i);
    expect(JSON.stringify(product)).not.toMatch(/现货供应|库存\s*[:：]?\s*\d|仅剩\s*\d/);
  });

  it.each(wines)("$key uses the independent v2 list WebP for card/detail/SKU, not the brand stage as product art", async wine => {
    const file = new URL(`../client/public${wine.image}`, import.meta.url);
    expect(existsSync(file), `real v2 list image required at ${wine.image}`).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
    const product = productFor(wine.key);
    expect(product.card.image).toBe(wine.image);
    expect(product.detail.productImage).toBe(wine.image);
    expect(product.detail.heroImages[0]).toBe(wine.image.replace("-list.webp", "-hero.webp"));
    expect(product.detail.heroImages).not.toContain(wine.image);
    expect(product.skus[0].image).toBe(wine.image);
    expect(product.card.image).not.toContain("spain-bodega-stage");
  });

  it("feeds the actual three catalog rows into the existing same-group cart math without creating orders", () => {
    const items = wines.map(wine => {
      const product = productFor(wine.key);
      const sku = getMibanLimitedProductSku(product, wine.skuId)!;
      return { productKey: product.key, skuId: sku.id, checkoutGroupKey: product.checkoutGroupKey!,
        groupLabel: `${product.brand}精选`, priceCny: sku.priceCny, quantity: sku.quantityPerOrder };
    });
    const groups = groupMibanCartItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ checkoutGroupKey: "spain-wines", itemCount: 3,
      totalCny: wines.reduce((sum, wine) => sum + wine.priceCny, 0) });
    expect(groups[0].items).toEqual(items);
    const cartAdd = read(detailPath).match(/addCartItem\(\{([\s\S]*?)\}\);/)?.[1];
    expect(cartAdd).toContain("checkoutGroupKey: currentProduct.checkoutGroupKey ?? currentProduct.key");
    expect(cartAdd).toContain("priceCny: selectedSku.priceCny");
    expect(cartAdd).not.toMatch(/priceU|public.*[Rr]ate|cnyToU/);
    // Read source only: no backend import or synthetic createCartOrder execution.
    const backend = read("./miban.ts");
    expect(backend).toContain("const checkoutGroupKey = product.checkoutGroupKey ?? product.key;");
    expect(backend).toContain("groupedLines.set(checkoutGroupKey, group)");
  });
});

describe("Spain navigation and shared public-price / signed-wallet settlement boundary", () => {
  it("matches the exact Spain brand route before the generic product route", () => {
    const app = read("../client/src/pages/miban/MibanApp.tsx");
    const exact = [...app.matchAll(/<Route\b[^>]*path=\{`\$\{BASE\}\/limited\/spain`\}[^>]*\/?\s*>/g)];
    expect(exact).toHaveLength(1);
    const generic = app.indexOf('path={`${BASE}/limited/:productKey`}');
    expect(generic).toBeGreaterThan(0);
    expect(exact[0].index).toBeLessThan(generic);
    expect(exact[0][0]).toContain("component={LimitedBrandProducts}");
    const buyRoute = app.match(/<Route\b[^>]*path=\{`\$\{BASE\}\/limited\/:productKey\/buy`\}[^>]*>/)?.[0];
    expect(buyRoute).toContain("component={HerbalifeRedGinsengDetail}");
    expect(app.slice(generic, generic + 180)).toContain("component={HerbalifeRedGinsengDetail}");
  });

  it.each(wines)("$key converts original CNY with the actual cnyToU function at 6.6541 and changing rates", wine => {
    expect(vi.isMockFunction(cnyToU)).toBe(false);
    const snapshots = [6.6541, 7.2, 8].map(rate => {
      const actual = cnyToU(wine.priceCny, rate);
      expect(actual).toBeCloseTo(wine.priceCny / rate, 12);
      return actual.toFixed(2);
    });
    expect(new Set(snapshots).size).toBe(3);
    const product = productFor(wine.key);
    expect(product.skus[0].priceCny).toBe(wine.priceCny);
  });

  it.each(wines)("the independent real Price helper displays $key dynamically, keeping CNY unchanged", wine => {
    const Price = realPriceHelper();
    for (const rate of [6.6541, 7.2, 8]) {
      const html = renderToStaticMarkup(React.createElement(Price, { value: wine.priceCny, usdtCnyRate: rate }));
      expect(html).toContain((wine.priceCny / rate).toFixed(2));
      expect(html).toContain("USDT");
      expect(html).toContain(`¥${wine.priceCny.toFixed(2)}`);
      expect(html).not.toContain("line-through");
    }
  });

  it("brand listing uses the platform public-rate hook and real CNY conversion, never a fixed U table", () => {
    const source = read("../client/src/pages/miban/LimitedBrandProducts.tsx");
    expect(source).toContain('from "./useMibanUsdtCnyRate"');
    expect(source).toContain("useMibanUsdtCnyRate()");
    expect(source).toContain("cnyToU(sku.priceCny, usdtCnyRate)");
    expect(source).toContain("sku.priceCny.toFixed(2)");
    expect(source).toContain("/limited/${product.key}");
    expect(source).not.toMatch(/\b(?:6\.6541|7\.2|FALLBACK_USDT_CNY_RATE|mockRate)\b/);
  });

  it("public detail prices are wired to the public hook while checkout amounts remain on the wallet quote", () => {
    const wiring = detailRateWiring();
    expect([...wiring.definitions.values()].some(value => /\buseMibanUsdtCnyRate\(\)/.test(value.getText(wiring.ast)))).toBe(true);
    expect(wiring.priceRates.length).toBeGreaterThanOrEqual(2);
    // Both the summary and SKU prices must be available without a personal
    // signed wallet quote. Alias/checkout-conditional rate names are allowed.
    for (const rate of wiring.priceRates) {
      expect(rate).toContain("useMibanUsdtCnyRate()");
      expect(rate).not.toContain("walletPayment.usdtCnyRate");
    }
    expect(wiring.settlementRates.length).toBeGreaterThan(0);
    for (const rate of wiring.settlementRates) {
      expect(rate).toContain("walletPayment.usdtCnyRate");
      expect(rate).not.toContain("useMibanUsdtCnyRate");
    }
  });

  it("existing order submission uses only prepared signed-wallet amounts and never public displayed U", () => {
    const source = read(detailPath);
    const start = source.indexOf("const preparedPayment = await walletPayment.preparePayment()");
    const end = source.indexOf("const callbacks =", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const input = source.slice(start, end);
    expect(input).toMatch(/if\s*\(\s*!preparedPayment\b/);
    expect(input).toContain("cnyAmount: preparedPayment.cnyAmount");
    expect(input).toContain("paymentAssets: preparedPayment.paymentAssets");
    expect(input).toContain("paymentQuoteToken: preparedPayment.paymentQuoteToken");
    expect(input).not.toMatch(/cnyToU|totalPriceU|priceU|usdtCnyRate|useMibanUsdtCnyRate/);
    const paymentService = read("./miban-wallet-payment-service.ts");
    expect(paymentService).toContain("verifyMibanPaymentQuoteToken(params.paymentQuoteToken, params.userId)");
    expect(paymentService).toContain("validateMibanPaymentDeductions(params.totalCny, params.paymentAssets, quote.assets)");
    expect(paymentService).not.toContain("useMibanUsdtCnyRate");
  });
});
