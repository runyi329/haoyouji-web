import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { getMibanLimitedProduct } from "../shared/miban-limited-products";
import { cnyToU } from "../client/src/pages/miban/useMibanUsdtCnyRate";

// Offline presentation/state tests: never import live pages, call wallet/API,
// create orders or initialize operational inventory.
const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const detailSource = read("../client/src/pages/miban/HerbalifeRedGinsengDetail.tsx");
const sheetSource = read("../client/src/pages/miban/MibanWinePurchaseSheet.tsx");
const parse = (source: string) => ts.createSourceFile("presentation.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const detailAst = parse(detailSource);
const sheetAst = parse(sheetSource);
function walk(node: ts.Node, visitor: (node: ts.Node) => void) {
  visitor(node);
  ts.forEachChild(node, child => walk(child, visitor));
}
function initializer(name: string) {
  const matches: ts.Expression[] = [];
  walk(detailAst, node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) matches.push(node.initializer);
  });
  expect(matches).toHaveLength(1);
  return matches[0].getText(detailAst);
}
function evaluate(source: string, bindings: Record<string, unknown> = {}) {
  const js = ts.transpileModule(`return (${source});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings));
}
function pureDeclaration(ast: ts.SourceFile, name: string) {
  const declaration = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  expect(declaration).toBeDefined();
  return declaration!.getText(ast);
}
const normalize = evaluate(pureDeclaration(detailAst, "normalizePurchaseQuantity")) as (value: string | number | null, max?: number) => number;
const wines = ["romanico", "marthu", "fidencio"] as const;

describe("Spain purchase selection on real single-bottle catalog", () => {
  it.each(wines)("%s uses its original 750ml SKU, original CNY price and quantity limit", id => {
    const product = getMibanLimitedProduct(`spain-${id}`)!;
    const sku = product.skus[0];
    expect(product.status).toBe("on_sale");
    expect(product.publicPreview).toBeUndefined();
    expect(sku.active).toBe(true);
    expect(sku.name).toBe("750ml 单瓶装");
    expect(sku.maxPurchaseQty).toBe(10);
    expect(sku.priceCny).toBe({ romanico: 328, marthu: 198, fidencio: 168 }[id]);
    for (const quantity of [1, 3, 10]) {
      const path = evaluate(initializer("checkoutPath"), { checkoutPathBase: `/p/proj_hzxm2t/limited/${product.key}/buy`, activeSkuId: sku.id, requestedAnnualPlan: false, isSpainProduct: true, purchaseQuantity: quantity });
      const url = new URL(path, "https://example.test");
      expect(url.searchParams.get("sku")).toBe(sku.id);
      expect(url.searchParams.get("quantity")).toBe(String(quantity));
      expect(url.searchParams.has("plan")).toBe(false);
    }
  });

  it.each([null, "", "0", "-1", "1.5", "NaN", Number.NaN, Number.POSITIVE_INFINITY])("normalizes invalid quantity %s to one", value => {
    expect(normalize(value, 10)).toBe(1);
  });
  it.each([1, 3, 10, 11, 100])("clamps quantity %s to the real SKU limit", value => {
    expect(normalize(value, 10)).toBe(Math.min(10, value));
  });

  it("does not change unrelated ordinary/annual checkout URLs", () => {
    const bindings = { checkoutPathBase: "/p/proj_hzxm2t/limited/midaniang-classic-rice-gift/buy", activeSkuId: "rice", isSpainProduct: false, purchaseQuantity: 3 };
    expect(evaluate(initializer("checkoutPath"), { ...bindings, requestedAnnualPlan: false })).toBe(`${bindings.checkoutPathBase}?sku=rice`);
    expect(evaluate(initializer("checkoutPath"), { ...bindings, requestedAnnualPlan: true })).toBe(`${bindings.checkoutPathBase}?sku=rice&plan=annual&quantity=3`);
  });

  it.each(wines)("%s public subtotal uses the actual rate and original price, not a snapshot", id => {
    const sku = getMibanLimitedProduct(`spain-${id}`)!.skus[0];
    const Price = evaluate(pureDeclaration(sheetAst, "WineSelectionPrice"), { React, cnyToU });
    for (const rate of [6.6541, 7.2, 8]) {
      const cny = sku.priceCny * 3;
      const html = renderToStaticMarkup(React.createElement(Price, { cny, rate, accent: "#831C25" }));
      expect(html).toContain(cnyToU(cny, rate).toFixed(2));
      expect(html).toContain("USDT");
      expect(html).toContain(`≈ ¥${cny.toFixed(2)}`);
      expect(html).not.toContain("line-through");
    }
  });

  it("opens wine selection before login, payment or adding a cart line", () => {
    for (const [name, action] of [["handleBuy", "buy"], ["handleAddToCart", "cart"]] as const) {
      const setWinePurchaseAction = vi.fn();
      const proceedToCheckout = vi.fn();
      const addSelectedProductToCart = vi.fn();
      const handler = evaluate(initializer(name), { isOnSale: true, authLoading: false, isPreviewProduct: false, annualPlanUnavailable: false, requestedAnnualPlan: false, isSpainProduct: true, isCheckoutPage: false, setWinePurchaseAction, proceedToCheckout, addSelectedProductToCart });
      handler();
      expect(setWinePurchaseAction).toHaveBeenCalledWith(action);
      expect(proceedToCheckout).not.toHaveBeenCalled();
      expect(addSelectedProductToCart).not.toHaveBeenCalled();
    }
  });

  it("confirmation delegates to the existing cart or checkout and never charges from selection", () => {
    for (const action of ["buy", "cart"] as const) {
      const proceedToCheckout = vi.fn();
      const addSelectedProductToCart = vi.fn();
      const close = vi.fn();
      const confirm = evaluate(initializer("confirmWinePurchase"), { isOnSale: true, isPreviewProduct: false, checkoutBusy: false, winePurchaseAction: action, setWinePurchaseAction: close, proceedToCheckout, addSelectedProductToCart });
      confirm();
      expect(close).toHaveBeenCalledWith(null);
      expect(proceedToCheckout).toHaveBeenCalledTimes(action === "buy" ? 1 : 0);
      expect(addSelectedProductToCart).toHaveBeenCalledTimes(action === "cart" ? 1 : 0);
    }
    expect(sheetSource).not.toMatch(/useQuery|useMutation|preparePayment|paymentQuoteToken|createOrder|fetch\s*\(/);
    expect(sheetSource).toContain('min={1} max={maxQuantity}');
    expect(sheetSource).toContain('quantity <= 1');
    expect(sheetSource).toContain('quantity >= maxQuantity');
    expect(sheetSource).toContain('selectedSku.priceCny * quantity');
  });

  it("requires confirmed runtime availability for production wine checkout quotes, but preserves other brands", () => {
    const currentProduct = getMibanLimitedProduct("spain-romanico")!;
    const selectedSku = currentProduct.skus[0];
    const key = `${currentProduct.key}:${selectedSku.id}`;
    const bindings = { currentProduct, selectedSku, isSpainProduct: true, localPreviewMode: false };
    expect(evaluate(initializer("isOnSale"), { ...bindings, availabilityLoading: true, availabilityBySku: new Map() })).toBe(false);
    expect(evaluate(initializer("isOnSale"), { ...bindings, availabilityLoading: false, availabilityBySku: new Map() })).toBe(false);
    expect(evaluate(initializer("isOnSale"), { ...bindings, availabilityLoading: false, availabilityBySku: new Map([[key, { isOnSale: false }]]) })).toBe(false);
    expect(evaluate(initializer("isOnSale"), { ...bindings, availabilityLoading: false, availabilityBySku: new Map([[key, { isOnSale: true }]]) })).toBe(true);
    expect(evaluate(initializer("isOnSale"), { ...bindings, localPreviewMode: true, availabilityLoading: true, availabilityBySku: new Map() })).toBe(true);
    expect(evaluate(initializer("isOnSale"), { ...bindings, isSpainProduct: false, availabilityLoading: true, availabilityBySku: new Map() })).toBe(true);
  });
});
