import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MidaniangSelection, {
  MIDANIANG_SELECTION_PATH,
} from "../client/src/pages/miban/MidaniangSelection";
import MidaniangPurchaseActions from "../client/src/pages/miban/MidaniangPurchaseActions";
import { getMibanImageSource } from "../client/src/pages/miban/MibanImage";
import { cnyToU } from "../client/src/pages/miban/useMibanUsdtCnyRate";
import {
  midaniangSelectionCatalog,
  type MidaniangSelectionItem,
} from "../shared/midaniang-selection-catalog";
import { midaniangSelectionAssets } from "../shared/midaniang-selection-assets";
import {
  getMibanLimitedProduct,
  getMibanLimitedProductSku,
} from "../shared/miban-limited-products";

/**
 * Offline regression of the REAL list and purchase components.
 * Only the query/cart dependency boundaries are fixtures; no DB, original backend,
 * wallet, order, browser, storage or network is started. Cart UI is omitted, not
 * replaced with fake visible controls. Official catalogs/assets/conversion stay real.
 *
 * Ordinary SSR delegates useState to React. For explicit leaf-component calls only,
 * a tiny hook-slot fixture retains state and executes the ACTUAL returned onClick
 * closures, including functional setState updates. Each event is followed by a fresh
 * leaf render. This tests handlers/state/output, NOT DOM dispatch or event bubbling,
 * hydration, real browser sizing, or React scheduling. No fixture enters product UI.
 */
const boundary = vi.hoisted(() => ({
  rate: 7.2,
  addItem: vi.fn((_payload: unknown) => true),
  query: vi.fn(() => ({ data: { usdtCnyRate: 7.2 } })),
}));
const hookSlots = vi.hoisted(() => ({
  enabled: false,
  cursor: 0,
  values: [] as unknown[],
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState(initial?: unknown) {
      if (!hookSlots.enabled) return actual.useState(initial);
      const index = hookSlots.cursor++;
      if (!(index in hookSlots.values)) {
        hookSlots.values[index] = typeof initial === "function" ? initial() : initial;
      }
      return [hookSlots.values[index], (action: unknown) => {
        hookSlots.values[index] = typeof action === "function"
          ? action(hookSlots.values[index])
          : action;
      }];
    },
  };
});
vi.mock("@/lib/trpc", () => ({
  trpc: { getCryptoPrices: { useQuery: boundary.query } },
}));
vi.mock("../client/src/pages/miban/LimitedProductCart", () => ({
  useLimitedProductCart: () => ({ addItem: boundary.addItem }),
  LimitedCartButton: () => null,
}));

// Standalone Vitest uses classic JSX for the imported real .tsx components.
vi.stubGlobal("React", React);
const network = vi.fn(() => { throw new Error("数量回归禁止网络请求"); });
vi.stubGlobal("fetch", network);
beforeEach(() => {
  boundary.rate = 7.2;
  boundary.addItem.mockClear();
  boundary.query.mockClear();
  boundary.query.mockImplementation(() => ({ data: { usdtCnyRate: boundary.rate } }));
  network.mockClear();
  hookSlots.enabled = false;
  hookSlots.cursor = 0;
  hookSlots.values = [];
});
afterEach(() => {
  expect(hookSlots.enabled).toBe(false);
  expect(network).not.toHaveBeenCalled();
});
afterAll(() => vi.unstubAllGlobals());

const cases = [
  {
    item: midaniangSelectionCatalog[0],
    pack: "500g×6包",
    net: "净含量3000g（6斤）",
    listLines: ["500g×6包", "净含量3000g", "（6斤）"],
  },
  {
    item: midaniangSelectionCatalog[1],
    pack: "300g×9包",
    net: "净含量2700g（5.4斤）",
    listLines: ["300g×9包", "净含量2700g", "（5.4斤）"],
  },
];
function textContent(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function compactText(html: string) {
  return textContent(html).replace(/\s/g, "");
}
function byTestId(html: string, tag: string, id: string) {
  const matches = Array.from(html.matchAll(new RegExp(
    `<${tag}\\b[^>]*data-testid="${id}"[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g",
  )));
  expect(matches, `${id} SSR element`).toHaveLength(1);
  return matches[0][0];
}
function buttonByLabel(html: string, label: string) {
  const matches = Array.from(html.matchAll(new RegExp(
    `<button\\b[^>]*aria-label="${label}"[^>]*>[\\s\\S]*?<\\/button>`, "g",
  )));
  expect(matches, `${label} SSR button`).toHaveLength(1);
  return matches[0][0];
}
function classTokens(html: string) {
  return html.match(/\bclass="([^"]*)"/)?.[1].split(/\s+/) ?? [];
}
function renderWithRouter(child: React.ReactNode, path = MIDANIANG_SELECTION_PATH) {
  return renderToStaticMarkup(React.createElement(Router, { ssrPath: path, children: child }));
}
function renderPurchase(item: MidaniangSelectionItem, rate = boundary.rate) {
  return renderWithRouter(React.createElement(MidaniangPurchaseActions, {
    item,
    usdtCnyRate: rate,
  }));
}
function officialSku(item: MidaniangSelectionItem) {
  const product = getMibanLimitedProduct(item.productKey);
  expect(product?.status).toBe("on_sale");
  const sku = product && getMibanLimitedProductSku(product, item.skuId);
  if (!product || !sku) throw new Error(`真实SKU缺失: ${item.key}`);
  return { product, sku };
}

type HandlerProps = {
  children?: React.ReactNode;
  "data-testid"?: string;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  className?: string;
  disabled?: boolean;
  href?: string;
  onClick?: () => unknown;
};
type Element = React.ReactElement<HandlerProps>;
function elements(node: React.ReactNode): Element[] {
  const result: Element[] = [];
  React.Children.forEach(node, child => {
    if (!React.isValidElement<HandlerProps>(child)) return;
    result.push(child);
    result.push(...elements(child.props.children));
  });
  return result;
}
function findElement(tree: React.ReactNode, predicate: (node: Element) => boolean) {
  const matches = elements(tree).filter(predicate);
  expect(matches).toHaveLength(1);
  return matches[0];
}
function leafHarness(item: MidaniangSelectionItem, rate = boundary.rate) {
  let tree: React.ReactNode;
  function rerender() {
    hookSlots.cursor = 0;
    hookSlots.enabled = true;
    try {
      tree = MidaniangPurchaseActions({ item, usdtCnyRate: rate });
      expect(tree).not.toBeNull();
      expect(hookSlots.cursor).toBe(2);
    } finally {
      hookSlots.enabled = false;
    }
  }
  rerender();
  return {
    html: () => renderWithRouter(tree),
    element: (predicate: (node: Element) => boolean) => findElement(tree, predicate),
    value: () => findElement(tree, node => node.props["data-testid"] === "midaniang-quantity-value").props.children,
    // Deliberately invoke even disabled boundary handlers to prove clamping itself.
    // This is not a browser click and does not claim disabled-button dispatch behavior.
    click(predicate: (node: Element) => boolean) {
      const handler = findElement(tree, predicate).props.onClick;
      expect(handler).toBeTypeOf("function");
      handler!();
      rerender();
    },
  };
}
const minus = (node: Element) => node.type === "button" && node.props["aria-label"] === "减少份数";
const plus = (node: Element) => node.type === "button" && node.props["aria-label"] === "增加份数";
const cart = (node: Element) => node.props["data-testid"] === "midaniang-add-to-cart";
const buy = (node: Element) => node.props["data-testid"] === "midaniang-buy-now";
function plan(title: string) {
  return (node: Element) => node.type === "button" && elements(node.props.children)
    .some(child => child.type === "span" && child.props.children === title);
}
function expectedCheckout(item: MidaniangSelectionItem, quantity: number, annual = false) {
  return `/p/proj_hzxm2t/limited/${item.productKey}/buy?sku=${encodeURIComponent(item.skuId)}&quantity=${quantity}${annual ? "&plan=annual" : ""}`;
}
function expectPrice(html: string, priceCny: number, quantity: number, rate: number, annual = false) {
  const totalCny = priceCny * quantity * (annual ? 12 : 1);
  expect(textContent(html)).toContain(`${(totalCny / rate).toFixed(2)} USDT`);
  expect(textContent(html)).toContain(`≈ ¥${totalCny.toFixed(2)}`);
}

describe("米大娘列表真实 SSR / 删除冗余计划说明", () => {
  it("保留两商品名称、品牌Logo、有机商标、三行规格及固定详情链接", () => {
    const html = renderWithRouter(React.createElement(MidaniangSelection));
    expect(midaniangSelectionCatalog).toHaveLength(2);
    expect(html.match(/data-testid="midaniang-product-row"/g)).toHaveLength(2);
    const logo = html.match(/<img\b[^>]*alt="米大娘品牌Logo"[^>]*>/)?.[0];
    expect(logo).toContain(`src="${getMibanImageSource(midaniangSelectionAssets.logo, "icon")}"`);
    const marks = html.match(/<img\b[^>]*alt="中国有机产品标识"[^>]*>/g) ?? [];
    expect(marks).toHaveLength(2);
    marks.forEach(mark => expect(mark).toContain(
      `src="${getMibanImageSource(midaniangSelectionAssets.organicMark, "icon")}"`,
    ));
    for (const { item, listLines } of cases) {
      const row = html.match(new RegExp(
        `<a\\b[^>]*data-selection-key="${item.key}"[^>]*>[\\s\\S]*?<\\/a>`,
      ))?.[0] ?? "";
      expect(row).toContain(`href="${MIDANIANG_SELECTION_PATH}/${item.key}"`);
      expect(row).toContain(item.title);
      expect(row).not.toContain("<button"); // Structure only; not a bubbling test.
      const specification = byTestId(row, "p", "midaniang-product-specification");
      const lines = Array.from(specification.matchAll(
        /<span\b[^>]*data-testid="midaniang-product-specification-line"[^>]*>([\s\S]*?)<\/span>/g,
      ), match => textContent(match[1]));
      expect(lines).toEqual(listLines);
      expect(html).toContain(`data-testid="midaniang-list-organic-mark-${item.key}"`);
    }
    expect(boundary.query).toHaveBeenCalledTimes(1);
    expect(boundary.addItem).not.toHaveBeenCalled();
  });

  it("不再渲染列表计划说明、单月/全年购买计划或每月1/2/3份文案", () => {
    const html = renderWithRouter(React.createElement(MidaniangSelection));
    expect(html).not.toMatch(/midaniang-plan-introduction|单月购买|全年计划|连续12个月|每月[123]份|不一次发完/);
    expect(html).toContain('data-testid="midaniang-product-list"');
    expect(html).toContain("商家介绍");
    expect(html).toContain("商品信息由商家提供");
  });
});

describe.each(cases)("$item.key 购买栏真实默认 SSR", ({ item, pack, net }) => {
  it("使用真实sku.netContentText显示每盒规格，且不存在1/2/3份快捷按钮", () => {
    const { sku } = officialSku(item);
    expect(vi.isMockFunction(getMibanLimitedProduct)).toBe(false);
    expect(vi.isMockFunction(getMibanLimitedProductSku)).toBe(false);
    expect(vi.isMockFunction(cnyToU)).toBe(false);
    const html = renderPurchase({ ...item, specification: "展示规格禁止作为购买规格" });
    const specification = byTestId(html, "div", "midaniang-box-specification");
    expect(compactText(specification)).toBe(`1份=1盒${pack}${net}`);
    expect(sku.netContentText.replace(/\s/g, "")).toBe(`${pack}·${net.replace(/^净含量/, "")}`);
    expect(html).not.toContain("展示规格禁止作为购买规格");
    const buttons = Array.from(html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g), match => textContent(match[1]));
    expect(buttons).toHaveLength(5); // 2 plans + 2 stepper controls + add-to-cart.
    expect(buttons.filter(label => /^(?:每月)?[123](?:份|盒)?$/.test(label))).toEqual([]);
    expect(html).not.toMatch(/grid-cols-3|每月1份|每月2份|每月3份/);
    expect(boundary.addItem).not.toHaveBeenCalled();
  });

  it("规格左/计数右：减加48×56布局类、数字24px及数量1下限保持", () => {
    const html = renderPurchase(item);
    const row = byTestId(html, "div", "midaniang-quantity-row");
    expect(classTokens(row)).toEqual(expect.arrayContaining(["flex", "items-center", "justify-between", "gap-3"]));
    const specification = byTestId(html, "div", "midaniang-box-specification");
    expect(classTokens(specification)).toEqual(expect.arrayContaining(["min-w-0", "flex-1"]));
    expect(html.indexOf('data-testid="midaniang-box-specification"')).toBeLessThan(
      html.indexOf('data-testid="midaniang-quantity-stepper"'),
    );
    const stepper = byTestId(html, "div", "midaniang-quantity-stepper");
    expect(classTokens(stepper)).toEqual(expect.arrayContaining(["flex", "shrink-0", "items-center"]));
    expect(stepper).toContain('aria-label="单月购买份数"');
    const decrement = buttonByLabel(html, "减少份数");
    const increment = buttonByLabel(html, "增加份数");
    for (const button of [decrement, increment]) {
      expect(classTokens(button)).toEqual(expect.arrayContaining(["h-14", "w-12", "items-center", "justify-center"]));
      expect(button).toContain('aria-hidden="true"');
      expect(button).toContain("h-[22px] w-[22px]");
    }
    expect(decrement).toContain('disabled=""');
    expect(increment).not.toContain('disabled=""');
    const value = byTestId(html, "span", "midaniang-quantity-value");
    expect(classTokens(value)).toEqual(expect.arrayContaining(["text-[24px]", "tabular-nums", "min-w-11"]));
    expect(textContent(value)).toBe("1");
    expect(value).toContain('aria-live="polite"');
    expect(value).toContain('aria-atomic="true"');
  });

  it("保留单月/全年两个计划且默认单月，结算URL带真实sku及quantity=1", () => {
    const { sku } = officialSku(item);
    const html = renderPurchase(item);
    const plans = html.match(/<button\b[^>]*aria-pressed="(?:true|false)"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(plans).toHaveLength(2);
    expect(plans[0]).toContain('aria-pressed="true"');
    expect(textContent(plans[0]!)).toBe("单月购买 本次购买，一次发货");
    expect(plans[1]).toContain('aria-pressed="false"');
    expect(textContent(plans[1]!)).toBe("全年计划 长期计划 · 连续12个月");
    const link = byTestId(html, "a", "midaniang-buy-now");
    expect(link).toContain(`href="${expectedCheckout(item, 1).replace(/&/g, "&amp;")}"`);
    expect(textContent(link)).toBe("立即购买");
    expect(html).not.toMatch(/plan=annual|midaniang-annual-delivery-notice|全年计划单独下单/);
    expect(html).toContain('data-testid="midaniang-add-to-cart"');
    expectPrice(html, sku.priceCny, 1, boundary.rate);
  });
});

describe.each(cases)("$item.key 真实事件闭包 / hook边界隔离", ({ item }) => {
  it("从1逐份增加到真实上限10再降到1，边界处理不能越界且价量URL同步", () => {
    const { sku } = officialSku(item);
    expect(sku.maxPurchaseQty).toBe(10);
    const h = leafHarness(item);
    const check = (quantity: number) => {
      expect(h.value()).toBe(quantity);
      expect(h.element(minus).props.disabled).toBe(quantity <= 1);
      expect(h.element(plus).props.disabled).toBe(quantity >= sku.maxPurchaseQty);
      expect(h.element(buy).props.href).toBe(expectedCheckout(item, quantity));
      const html = h.html();
      expectPrice(html, sku.priceCny, quantity, boundary.rate);
      expect(textContent(byTestId(html, "span", "midaniang-quantity-value"))).toBe(String(quantity));
    };
    check(1);
    h.click(minus); // Actual closure must clamp even when invoked directly at 1.
    check(1);
    for (let quantity = 2; quantity <= sku.maxPurchaseQty; quantity++) {
      h.click(plus);
      check(quantity);
    }
    h.click(plus); // Actual closure must clamp at SKU max, not just disable the UI.
    check(sku.maxPurchaseQty);
    for (let quantity = sku.maxPurchaseQty - 1; quantity >= 1; quantity--) {
      h.click(minus);
      check(quantity);
    }
    h.click(minus);
    check(1);
    expect(boundary.addItem).not.toHaveBeenCalled();
  });

  it("默认及增加后的购物车事件提交完整真实SKU payload与quantity，不使用展示字段", () => {
    const { product, sku } = officialSku(item);
    const h = leafHarness({
      ...item,
      title: midaniangSelectionCatalog[item.rank === 0 ? 1 : 0].title,
      specification: "仅测试隔离展示字段，不进入真实UI",
    });
    const expectedPayload = (quantity: number) => ({
      checkoutGroupKey: product.checkoutGroupKey ?? product.key,
      groupLabel: "米大娘精选",
      productKey: product.key,
      productName: product.detail.title,
      skuId: sku.id,
      skuName: sku.name,
      image: sku.image ?? product.detail.productImage,
      unitLabel: sku.unitLabel,
      netContentText: sku.netContentText,
      priceCny: sku.priceCny,
      maxPurchaseQty: sku.maxPurchaseQty,
      quantity,
      accent: "#8d292c",
    });
    expect(boundary.addItem).not.toHaveBeenCalled();
    h.click(cart);
    expect(boundary.addItem).toHaveBeenNthCalledWith(1, expectedPayload(1));
    for (let quantity = 2; quantity <= 3; quantity++) h.click(plus);
    h.click(cart);
    expect(boundary.addItem).toHaveBeenNthCalledWith(2, expectedPayload(3));
    for (let quantity = 4; quantity <= sku.maxPurchaseQty; quantity++) h.click(plus);
    h.click(cart);
    expect(boundary.addItem).toHaveBeenNthCalledWith(3, expectedPayload(sku.maxPurchaseQty));
    expect(boundary.addItem).toHaveBeenCalledTimes(3);
  });

  it("实际计划事件保留份数，全年按12个月计价发货/独立链接，切回单月恢复购物车", () => {
    const { sku } = officialSku(item);
    const rate = 8;
    const h = leafHarness(item, rate);
    h.click(plus);
    h.click(plus);
    expect(h.value()).toBe(3);
    h.click(plan("全年计划"));
    const checkAnnual = (quantity: number) => {
      expect(h.value()).toBe(quantity);
      expect(h.element(plan("全年计划")).props["aria-pressed"]).toBe(true);
      expect(h.element(plan("单月购买")).props["aria-pressed"]).toBe(false);
      expect(h.element(buy).props.href).toBe(expectedCheckout(item, quantity, true));
      const html = h.html();
      const notice = byTestId(html, "div", "midaniang-annual-delivery-notice");
      expect(textContent(notice)).toContain("按月发货，不一次发完");
      expect(textContent(notice)).toContain(`每月${quantity}份，连续12个月，全年共${quantity * 12}份`);
      expect(textContent(html)).toContain(`每月 ¥${(sku.priceCny * quantity).toFixed(2)} × 12个月`);
      expect(textContent(html)).toContain("全年合计 · 一次支付");
      expect(textContent(html)).toContain("每月发几份");
      expect(html).toContain('aria-label="每月发货份数"');
      expect(html).toContain("全年计划单独下单，按月发货，不与一次性发货商品合单。");
      expect(textContent(byTestId(html, "a", "midaniang-buy-now"))).toBe("购买全年计划");
      expect(html).not.toContain('data-testid="midaniang-add-to-cart"');
      expectPrice(html, sku.priceCny, quantity, rate, true);
    };
    checkAnnual(3);
    for (let quantity = 4; quantity <= sku.maxPurchaseQty; quantity++) h.click(plus);
    checkAnnual(sku.maxPurchaseQty);
    expect(h.element(plus).props.disabled).toBe(true);
    h.click(plus);
    checkAnnual(sku.maxPurchaseQty);
    h.click(plan("单月购买"));
    expect(h.value()).toBe(sku.maxPurchaseQty);
    expect(h.element(plan("单月购买")).props["aria-pressed"]).toBe(true);
    expect(h.element(buy).props.href).toBe(expectedCheckout(item, sku.maxPurchaseQty));
    const html = h.html();
    expect(html).not.toMatch(/midaniang-annual-delivery-notice|plan=annual/);
    expect(html).toContain('data-testid="midaniang-add-to-cart"');
    expectPrice(html, sku.priceCny, sku.maxPurchaseQty, rate);
    expect(boundary.addItem).not.toHaveBeenCalled();
    h.click(cart);
    expect(boundary.addItem).toHaveBeenCalledOnce();
    expect(boundary.addItem).toHaveBeenCalledWith(expect.objectContaining({
      productKey: item.productKey,
      skuId: sku.id,
      quantity: sku.maxPurchaseQty,
      priceCny: sku.priceCny,
    }));
  });
});
