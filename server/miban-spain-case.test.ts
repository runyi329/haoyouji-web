import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  getMibanLimitedProduct,
  getMibanLimitedProductSku,
  mibanLimitedProducts,
  type LimitedProductSku,
} from "../shared/miban-limited-products";
import { mibanSpanishWineProducts } from "../shared/miban-spanish-wines";
import { groupMibanCartItems } from "../shared/miban-cart-checkout";
import { cnyToU } from "../client/src/pages/miban/useMibanUsdtCnyRate";

// Offline only: use the real shared catalog/cart math/conversion and extract only
// pure presentation/state expressions. Never import the live pages, backend,
// availability/payment hooks, DB, order harness or operational inventory.
// The rates below are explicit conversion fixtures, not application defaults.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const detailSource = read("../client/src/pages/miban/HerbalifeRedGinsengDetail.tsx");
const sheetSource = read("../client/src/pages/miban/MibanWinePurchaseSheet.tsx");
const parse = (source: string) => ts.createSourceFile("presentation.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const detailAst = parse(detailSource);
const sheetAst = parse(sheetSource);
const wines = [
  { id: "romanico", priceCny: 328, struckPriceCny: 468 },
  { id: "marthu", priceCny: 198, struckPriceCny: 268 },
  { id: "fidencio", priceCny: 168, struckPriceCny: 238 },
] as const;
function walk(node: ts.Node, visitor: (node: ts.Node) => void) {
  visitor(node);
  ts.forEachChild(node, child => walk(child, visitor));
}
function evaluate(source: string, bindings: Record<string, unknown> = {}) {
  expect(source).not.toMatch(/useQuery|useMutation|useEffect|fetch\s*\(|preparePayment|createOrder|walletPayment/);
  const js = ts.transpileModule(`return (${source});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings));
}
function expression(name: string) {
  const matches: ts.Expression[] = [];
  walk(detailAst, node => {
    if (!ts.isVariableDeclaration(node) || !node.initializer) return;
    const named = ts.isIdentifier(node.name) && node.name.text === name;
    const state = ts.isArrayBindingPattern(node.name) && node.name.elements.some(element =>
      ts.isBindingElement(element) && ts.isIdentifier(element.name) && element.name.text === name);
    if (named || state) matches.push(node.initializer);
  });
  expect(matches, `one real ${name} initializer`).toHaveLength(1);
  return matches[0];
}
const initializer = (name: string) => expression(name).getText(detailAst);
function pureFunction(ast: ts.SourceFile, name: string, bindings: Record<string, unknown> = {}) {
  const node = ast.statements.find((item): item is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(item) && item.name?.text === name);
  expect(node, `real independent function ${name}`).toBeDefined();
  return evaluate(node!.getText(ast).replace(/^export\s+/, ""), bindings);
}
const normalize = pureFunction(detailAst, "normalizePurchaseQuantity") as (value: string | number | null, max?: number) => number;
const quantityText = pureFunction(sheetAst, "winePurchaseQuantityText") as (sku: LimitedProductSku, quantity: number) => string;
const SelectionPrice = pureFunction(sheetAst, "WineSelectionPrice", { React, cnyToU });
function productFor(id: string) {
  const product = getMibanLimitedProduct(`spain-${id}`);
  expect(product, `real catalog wine spain-${id}`).toBeDefined();
  return product!;
}
function caseFor(id: string) {
  const sku = getMibanLimitedProductSku(productFor(id), `spain-${id}-case-6bottles`);
  expect(sku, `real six-bottle case SKU for ${id}`).toBeDefined();
  return sku!;
}
function stateInitializer(name: string) {
  const node = expression(name);
  expect(ts.isCallExpression(node) && node.expression.getText(detailAst) === "useState").toBe(true);
  return (node as ts.CallExpression).arguments[0].getText(detailAst);
}
function sheetElement(predicate: (node: ts.JsxElement) => boolean) {
  const matches: ts.JsxElement[] = [];
  walk(sheetAst, node => { if (ts.isJsxElement(node) && predicate(node)) matches.push(node); });
  expect(matches, "one actual subtotal presentation element").toHaveLength(1);
  return matches[0].getText(sheetAst);
}
const subtotalElement = () => sheetElement(node => node.openingElement.attributes.properties.some(attribute =>
  ts.isJsxAttribute(attribute) && attribute.name.getText(sheetAst) === "data-testid" &&
  attribute.initializer?.getText(sheetAst) === '"wine-selection-subtotal"'));
const subtotalLabel = () => sheetElement(node => node.children.some(child =>
  ts.isJsxText(child) && child.text.includes("商品小计")));

 describe("Spain wine cases: three real products and six unique active SKUs (offline)", () => {
  it("adds exactly one case to each original wine, without adding products or replacing bottle IDs", () => {
    const products = mibanLimitedProducts.filter(product => product.checkoutGroupKey === "spain-wines");
    expect(products).toHaveLength(3);
    expect(products).toEqual(mibanSpanishWineProducts);
    expect(products.map(product => product.key)).toEqual(wines.map(wine => `spain-${wine.id}`));
    expect(products.flatMap(product => product.skus)).toHaveLength(6);
    expect(new Set(products.flatMap(product => product.skus.map(sku => sku.id))).size).toBe(6);
    for (const wine of wines) {
      const product = productFor(wine.id);
      expect(product.skus.map(sku => sku.id)).toEqual([
        `spain-${wine.id}-750ml`, `spain-${wine.id}-case-6bottles`,
      ]);
      expect(product.skus.filter(sku => sku.active)).toHaveLength(2);
      expect(product).toMatchObject({ status: "on_sale", brand: "西班牙", category: "红葡萄酒", checkoutGroupKey: "spain-wines" });
      expect(product.publicPreview).toBeUndefined();
      for (const sku of product.skus) {
        expect(mibanLimitedProducts.flatMap(item => item.skus).filter(item => item.id === sku.id)).toHaveLength(1);
        expect(getMibanLimitedProductSku(product, sku.id)).toBe(sku);
        expect(sku.marketPriceCny).toBeUndefined();
        expect(JSON.stringify(sku)).not.toMatch(/"(?:priceU|priceUsdt|usdtPrice|fixedUPrice|usdtCnyRate|stock|stockQty|stockQuantity|inventory|remainingStock)"\s*:/i);
      }
    }
  });

  it.each(wines)("$id keeps its bottle price/ID and prices one six-bottle case at exactly six original bottles", wine => {
    const product = productFor(wine.id);
    const bottle = getMibanLimitedProductSku(product, `spain-${wine.id}-750ml`)!;
    expect(bottle).toMatchObject({ id: `spain-${wine.id}-750ml`, name: "750ml 单瓶装", priceCny: wine.priceCny,
      quantityPerOrder: 1, unitLabel: "瓶", bottleCountPerUnit: 1, maxPurchaseQty: 10, active: true });
    expect(bottle.priceCny).not.toBe(wine.struckPriceCny);
    const sku = caseFor(wine.id);
    expect(sku).toMatchObject({ id: `spain-${wine.id}-case-6bottles`, name: "整箱装（6瓶）", priceCny: wine.priceCny * 6,
      quantityPerOrder: 1, unitLabel: "箱", bottleCountPerUnit: 6, maxPurchaseQty: 10, active: true });
    expect(sku.netContentText.replace(/\s/g, "")).toBe("750ml×6瓶/箱");
    expect(sku.priceCny).not.toBe(wine.struckPriceCny * 6);
    expect(sku.image).toBe(bottle.image);
    expect(sku.heroImages).toEqual(bottle.heroImages);
    expect(product.orderPolicy).toMatchObject({ commissionEligible: false, allowAddressBook: true, allowFavorite: true, enableReview: false });
  });
});

describe("Spain wine cases: selected quantities stay in cases while bottle counts explain the packaging", () => {
  it.each(wines)("$id explains one/two cases as six/twelve bottles using the actual pure subtotal function", wine => {
    const sku = caseFor(wine.id);
    for (const quantity of [1, 2]) {
      const text = `${quantity}箱 · 共${quantity * 6}瓶`;
      expect(quantityText(sku, quantity)).toBe(text);
      const label = renderToStaticMarkup(evaluate(subtotalLabel(), { React, selectedSku: sku, quantity, winePurchaseQuantityText: quantityText }));
      expect(label).toContain(`商品小计 · ${text}`);
      expect(evaluate(initializer("maxQuantity"), { selectedSku: sku, isAnnualPlan: false })).toBe(10);
      expect(evaluate(initializer("purchaseQuantity"), { quantity, maxQuantity: sku.maxPurchaseQty, normalizePurchaseQuantity: normalize })).toBe(quantity);
      expect(evaluate(initializer("monthlyPrice"), { selectedSku: sku, purchaseQuantity: quantity })).toBe(wine.priceCny * 6 * quantity);
      expect(evaluate(initializer("totalQuantity"), { purchaseQuantity: quantity, isAnnualPlan: false })).toBe(quantity);
    }
    expect(normalize(11, sku.maxPurchaseQty)).toBe(10);
    for (const value of [null, "", "0", "-1", "1.5", "NaN"]) expect(normalize(value, sku.maxPurchaseQty)).toBe(1);
  });

  it("single bottles and both real ham packaging units keep their original quantity labels", () => {
    for (const wine of wines) {
      const bottle = getMibanLimitedProductSku(productFor(wine.id), `spain-${wine.id}-750ml`)!;
      for (const quantity of [1, 2, 3, 10]) expect(quantityText(bottle, quantity)).toBe(`${quantity}瓶`);
    }
    const ham = getMibanLimitedProduct("spain-iberian-ham")!;
    expect(ham.skus).toHaveLength(2);
    for (const [id, unit] of [["spain-ham-sliced-single", "包"], ["spain-ham-whole-leg", "只"]]) {
      const sku = getMibanLimitedProductSku(ham, id)!;
      for (const quantity of [1, 2, 3, 10]) {
        expect(quantityText(sku, quantity)).toBe(`${quantity}${unit}`);
        expect(quantityText(sku, quantity)).not.toMatch(/箱|瓶/);
      }
    }
  });

  it.each(wines)("$id actual subtotal JSX uses case price times one/two and dynamically converts U at changing rates", wine => {
    expect(vi.isMockFunction(cnyToU)).toBe(false);
    const selectedSku = caseFor(wine.id);
    for (const quantity of [1, 2]) {
      const cny = wine.priceCny * 6 * quantity;
      const snapshots: string[] = [];
      for (const usdtCnyRate of [6.6541, 7.2, 8]) {
        expect(cnyToU(cny, usdtCnyRate)).toBeCloseTo(cny / usdtCnyRate, 12);
        snapshots.push(cnyToU(cny, usdtCnyRate).toFixed(2));
        const html = renderToStaticMarkup(evaluate(subtotalElement(), { React, selectedSku, quantity, usdtCnyRate, accent: "#831C25", WineSelectionPrice: SelectionPrice }));
        expect(html).toContain(cnyToU(cny, usdtCnyRate).toFixed(2));
        expect(html).toContain("USDT");
        expect(html).toContain(`≈ ¥${cny.toFixed(2)}`);
        expect(html).not.toContain("line-through");
      }
      expect(new Set(snapshots).size).toBe(3);
    }
    expect(sheetSource).not.toMatch(/\b(?:6\.6541|7\.2|FALLBACK_USDT_CNY_RATE|mockRate)\b/);
    expect(sheetSource).not.toMatch(/useQuery|useMutation|preparePayment|paymentQuoteToken|createOrder|fetch\s*\(/);
  });
});

describe("Spain wine cases: existing buy URL, real selection state and cart preserve case SKU and case quantity", () => {
  it.each(wines)("$id round-trips both original bottle and case SKUs at quantities one/two via the unchanged buy route", wine => {
    const product = productFor(wine.id);
    const activeSkus = evaluate(initializer("activeSkus"), { currentProduct: product, localPreviewMode: true, availabilityLoading: true, availabilityBySku: new Map() });
    expect(activeSkus).toEqual(product.skus);
    for (const sku of product.skus) {
      for (const quantity of [1, 2]) {
        const checkoutPathBase = `/p/proj_hzxm2t/limited/${product.key}/buy`;
        const path = evaluate(initializer("checkoutPath"), { checkoutPathBase, activeSkuId: sku.id, requestedAnnualPlan: false, isSpainProduct: true, purchaseQuantity: quantity });
        const url = new URL(path, "https://offline.example.test");
        expect(url.pathname).toBe(checkoutPathBase);
        expect([...url.searchParams.entries()]).toEqual([["sku", sku.id], ["quantity", String(quantity)]]);
        const selected = evaluate(stateInitializer("selectedSkuId"), { checkoutSkuId: url.searchParams.get("sku") });
        const qty = evaluate(stateInitializer("quantity"), { checkoutQuery: url.searchParams, normalizePurchaseQuantity: normalize });
        expect(selected()).toBe(sku.id);
        expect(qty()).toBe(quantity);
        const activeSkuId = evaluate(initializer("activeSkuId"), { selectedSkuId: selected(), defaultSku: product.skus[0] });
        expect(activeSkuId).toBe(sku.id);
        expect(evaluate(initializer("selectedSku"), { currentProduct: product, activeSkus, activeSkuId })).toBe(sku);
        expect(evaluate(initializer("purchaseQuantity"), { quantity: qty(), maxQuantity: sku.maxPurchaseQty, normalizePurchaseQuantity: normalize })).toBe(quantity);
      }
    }
  });

  it.each(wines)("$id production availability remains keyed by the case SKU, not the bottle or bottle count", wine => {
    const currentProduct = productFor(wine.id);
    const selectedSku = caseFor(wine.id);
    const key = `${currentProduct.key}:${selectedSku.id}`;
    const bindings = { currentProduct, selectedSku, isSpainProduct: true, localPreviewMode: false, availabilityLoading: false };
    for (const availabilityBySku of [new Map(), new Map([[key, { isOnSale: false }]]), new Map([[key, { isOnSale: "true" }]])]) {
      expect(evaluate(initializer("isOnSale"), { ...bindings, availabilityBySku })).toBe(false);
    }
    const availabilityBySku = new Map([[key, { isOnSale: true }]]);
    expect(evaluate(initializer("isOnSale"), { ...bindings, availabilityBySku })).toBe(true);
    expect(evaluate(initializer("isOnSale"), { ...bindings, availabilityBySku, availabilityLoading: true })).toBe(false);
    expect(evaluate(initializer("activeSkus"), { ...bindings, availabilityBySku })).toEqual([selectedSku]);
  });

  it.each([1, 2])("the actual cart helper prices all three case rows at %s cases each, without multiplying quantity by six again", quantity => {
    const items = wines.map(wine => {
      const product = productFor(wine.id);
      const sku = caseFor(wine.id);
      return { productKey: product.key, skuId: sku.id, checkoutGroupKey: product.checkoutGroupKey!,
        groupLabel: "西班牙红酒", priceCny: sku.priceCny, quantity };
    });
    const groups = groupMibanCartItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ checkoutGroupKey: "spain-wines", itemCount: quantity * 3,
      totalCny: wines.reduce((sum, wine) => sum + wine.priceCny * 6 * quantity, 0) });
    expect(groups[0].items).toEqual(items);
    const cartAdd = detailSource.match(/addCartItem\(\{([\s\S]*?)\}\);/)?.[1];
    expect(cartAdd).toContain("skuId: selectedSku.id");
    expect(cartAdd).toContain("priceCny: selectedSku.priceCny");
    expect(cartAdd).toContain("quantity: purchaseQuantity");
    expect(cartAdd).toContain("checkoutGroupKey: currentProduct.checkoutGroupKey ?? currentProduct.key");
    expect(cartAdd).not.toMatch(/bottleCountPerUnit|priceU|cnyToU|usdtCnyRate/);
  });
});

describe("Spain wine cases: source-only guards preserve generic order, optional invoice and signed-wallet authority", () => {
  it("keeps case IDs/quantities on generic createOrder and never submits public U or bottle-count-derived quantities", () => {
    expect(detailSource).toContain("const createOrder = mtrpc.limitedProduct.createOrder.useMutation");
    const support = detailSource.indexOf("support = await mibanUtils.limitedProduct.invoiceSupport.fetch");
    const prepared = detailSource.indexOf("const preparedPayment = await walletPayment.preparePayment()");
    expect(support).toBeGreaterThan(0);
    expect(prepared).toBeGreaterThan(support);
    const input = detailSource.slice(detailSource.indexOf("const input = {", prepared), detailSource.indexOf("const callbacks =", prepared));
    for (const text of ["productKey: currentProduct.key", "skuId: selectedSku.id", "quantity: purchaseQuantity",
      "cnyAmount: preparedPayment.cnyAmount", "paymentAssets: preparedPayment.paymentAssets",
      "paymentQuoteToken: preparedPayment.paymentQuoteToken", "...(invoice.invoiceRequest ? { invoiceRequest: invoice.invoiceRequest } : {})"]) expect(input).toContain(text);
    expect(input).not.toMatch(/bottleCountPerUnit|cnyToU|priceU|totalPriceU|usdtCnyRate|useMibanUsdtCnyRate/);
    expect(detailSource).toMatch(/if \(isAnnualPlan\) \{\s*createAnnualOrder\.mutate\(input, callbacks\);\s*\} else \{\s*createOrder\.mutate\(input, callbacks\);/);
    expect(detailSource).not.toMatch(/(?:case|Case|wine|Wine)(?:CreateOrder|createOrder|OrderMutation|InvoiceMutation)/);
  });

  it("reads but never executes backend pricing, stock reservation, invoice persistence and signature verification", () => {
    const backend = read("./miban.ts");
    const normalStart = backend.indexOf("  createOrder: protectedProcedure");
    const cartStart = backend.indexOf("  createCartOrder: protectedProcedure");
    expect(normalStart).toBeGreaterThan(0);
    expect(cartStart).toBeGreaterThan(normalStart);
    const normalOrder = backend.slice(normalStart, cartStart);
    const cartOrder = backend.slice(cartStart);
    expect(normalOrder).toContain("getMibanLimitedProduct(input.productKey)");
    expect(normalOrder).toContain("getMibanLimitedProductSku(product, input.skuId)");
    expect(normalOrder).toContain("sku.priceCny * input.quantity");
    expect(normalOrder).toMatch(/reserveLimitedSkuStock\(\s*product\.key,\s*sku\.id,\s*input\.quantity,/);
    expect(normalOrder).toContain("quantity: input.quantity");
    expect(normalOrder).toContain("quantityPerOrder: sku.quantityPerOrder");
    expect(normalOrder).toContain("unitLabel: sku.unitLabel");
    expect(cartOrder).toContain("getMibanLimitedProduct(item.productKey)");
    expect(cartOrder).toContain("getMibanLimitedProductSku(product, item.skuId)");
    expect(cartOrder).toContain("Math.round(Number(sku.priceCny) * 100) * item.quantity");
    expect(cartOrder).toContain("quantity: item.quantity");
    expect(cartOrder).toContain("quantity: line.quantity");
    expect(cartOrder).toContain("quantityPerOrder: line.sku.quantityPerOrder");
    expect(cartOrder).toContain("unitLabel: line.sku.unitLabel");
    for (const route of [normalOrder, cartOrder]) {
      expect(route).toContain("invoiceRequest: mibanInvoiceRequestSchema.optional()");
      expect(route).toContain("if (input.invoiceRequest) await ensureMibanOrderInvoiceInfrastructure()");
      expect(route).toMatch(/insertMibanOrderInvoiceRequest\(\{ transaction, orderId(?:: createdOrderId)?, userId, invoiceRequest: input\.invoiceRequest \}\)/);
      expect(route).toContain("prepareMibanWalletPayment({ userId, totalCny, paymentAssets: input.paymentAssets, paymentQuoteToken: input.paymentQuoteToken })");
      expect(route).not.toMatch(/bottleCountPerUnit|useMibanUsdtCnyRate|case-6bottles/);
    }
    const payment = read("./miban-wallet-payment-service.ts");
    expect(payment).toContain("verifyMibanPaymentQuoteToken(params.paymentQuoteToken, params.userId)");
    expect(payment).toContain("validateMibanPaymentDeductions(params.totalCny, params.paymentAssets, quote.assets)");
    expect(payment).not.toContain("useMibanUsdtCnyRate");
  });
});
