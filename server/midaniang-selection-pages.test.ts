import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import MidaniangSelection, {
  MIDANIANG_SELECTION_PATH,
} from "../client/src/pages/miban/MidaniangSelection";
import MidaniangSelectionDetail, {
  getMidaniangSelection,
} from "../client/src/pages/miban/MidaniangSelectionDetail";
import { midaniangSelectionCatalog } from "../shared/midaniang-selection-catalog";
import {
  midaniangSelectionAssets,
  midaniangSelectionPosterDimensions,
} from "../shared/midaniang-selection-assets";
import {
  cnyToU,
  useMibanUsdtCnyRate,
} from "../client/src/pages/miban/useMibanUsdtCnyRate";
import MidaniangPurchaseActions from "../client/src/pages/miban/MidaniangPurchaseActions";
import {
  getMibanLimitedProduct,
  getMibanLimitedProductSku,
} from "../shared/miban-limited-products";

// Unit/SSR boundary only: mock the live query hook and cart context/button,
// never the selection/official catalogs, assets or cnyToU function.
const testRate = vi.hoisted(() => ({ value: 7.2 }));
const testCart = vi.hoisted(() => ({ addItem: vi.fn(() => true) }));
vi.mock("../client/src/pages/miban/LimitedProductCart", async () => {
  const actual = await vi.importActual<
    typeof import("../client/src/pages/miban/LimitedProductCart")
  >("../client/src/pages/miban/LimitedProductCart");
  return {
    ...actual,
    useLimitedProductCart: vi.fn(() => ({ addItem: testCart.addItem })),
    LimitedCartButton: ({ label = "购物车" }: { label?: string }) =>
      React.createElement(
        "button",
        {
          type: "button",
          "aria-label": label,
          "data-testid": "unit-limited-cart-button",
        },
        label
      ),
  };
});
vi.mock("../client/src/pages/miban/useMibanUsdtCnyRate", async () => {
  const actual = await vi.importActual<
    typeof import("../client/src/pages/miban/useMibanUsdtCnyRate")
  >("../client/src/pages/miban/useMibanUsdtCnyRate");
  return {
    ...actual,
    useMibanUsdtCnyRate: vi.fn(() => testRate.value),
  };
});
beforeEach(() => {
  testRate.value = 7.2;
  vi.mocked(useMibanUsdtCnyRate).mockClear();
  testCart.addItem.mockClear();
});

// Vitest's standalone config does not load the Vite React plugin.
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const appSource = read("../client/src/pages/miban/MibanApp.tsx");
const rootAppSource = read("../client/src/App.tsx");
const listSource = read("../client/src/pages/miban/MidaniangSelection.tsx");
const detailSource = read(
  "../client/src/pages/miban/MidaniangSelectionDetail.tsx"
);
const organicSource = read(
  "../client/src/pages/miban/MidaniangOrganicMark.tsx"
);
const purchaseSource = read(
  "../client/src/pages/miban/MidaniangPurchaseActions.tsx"
);

function renderList(search = "") {
  return renderToStaticMarkup(
    React.createElement(
      Router,
      {
        ssrPath: `${MIDANIANG_SELECTION_PATH}${search}`,
      },
      React.createElement(MidaniangSelection)
    )
  );
}
function renderDetail(selectionKey: string, search = "") {
  return renderToStaticMarkup(
    React.createElement(
      Router,
      {
        ssrPath: `${MIDANIANG_SELECTION_PATH}/${selectionKey}${search}`,
      },
      React.createElement(Route, {
        path: `${MIDANIANG_SELECTION_PATH}/:selectionKey`,
        component: MidaniangSelectionDetail,
      })
    )
  );
}

const extractImages = (html: string) =>
  html.match(/<img\b[^>]*data-poster-key=[^>]*>/g) ?? [];
const textContent = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const priceTexts = (html: string, testId: string) =>
  Array.from(
    html.matchAll(
      new RegExp(`<p[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</p>`, "g")
    ),
    match => textContent(match[1])
  );

describe("midaniang selection route safety", () => {
  it("mounts the dedicated list and detail before all generic purchase/product routes", () => {
    const detailIndex = appSource.indexOf(
      "path={`${BASE}/limited/midaniang/:selectionKey`}"
    );
    const listIndex = appSource.indexOf("path={`${BASE}/limited/midaniang`}");
    const buyIndex = appSource.indexOf(
      "path={`${BASE}/limited/:productKey/buy`}"
    );
    const genericIndex = appSource.indexOf(
      "path={`${BASE}/limited/:productKey`}"
    );
    expect(detailIndex).toBeGreaterThan(-1);
    expect(detailIndex).toBeLessThan(buyIndex);
    expect(detailIndex).toBeLessThan(genericIndex);
    expect(listIndex).toBeLessThan(genericIndex);
    expect(appSource).toMatch(
      /path=\{`\$\{BASE\}\/limited\/midaniang`\}[\s\S]*?component=\{MidaniangSelection\}/
    );
    expect(appSource).toMatch(
      /path=\{`\$\{BASE\}\/limited\/midaniang\/:selectionKey`\}[\s\S]*?component=\{MidaniangSelectionDetail\}/
    );
    const rootDetailIndex = rootAppSource.indexOf(
      'path="/p/proj_hzxm2t/limited/midaniang/:selectionKey"'
    );
    expect(rootDetailIndex).toBeGreaterThan(-1);
    expect(rootDetailIndex).toBeLessThan(
      rootAppSource.indexOf('path="/p/proj_hzxm2t/limited/:productKey/buy"')
    );
    expect(rootDetailIndex).toBeLessThan(
      rootAppSource.indexOf('path="/p/:slug"')
    );
  });

  it("only accepts two explicit selection keys, never a production key or another SKU", () => {
    expect(getMidaniangSelection("classic-rice-gift")?.title).toBe(
      "经典大米礼盒"
    );
    expect(getMidaniangSelection("family-rice-gift")?.title).toBe(
      "给孩子的一份礼物"
    );
    for (const key of [
      undefined,
      "buy",
      "herbalife-red-ginseng",
      "__proto__",
      "constructor",
      "classic-rice-gift/buy",
      "midaniang-classic-rice-gift",
      "midaniang-family-rice-gift",
      "classic-500g-6",
      "family-300g-9",
    ]) {
      expect(getMidaniangSelection(key)).toBeUndefined();
    }
  });

  it("unknown keys show a safe local list return, not another product", () => {
    const html = renderDetail(
      "unknown",
      "?category=rice&returnTo=https://evil.example"
    );
    expect(html).toContain("商品不存在");
    expect(html).toContain(`href="${MIDANIANG_SELECTION_PATH}"`);
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("category=");
    expect(html).not.toContain("data-poster-key");
    expect(html).not.toMatch(
      /midaniang-purchase-actions|midaniang-buy-now|midaniang-add-to-cart|\/buy\?sku=/
    );
    expect(testCart.addItem).not.toHaveBeenCalled();
    expect(useMibanUsdtCnyRate).toHaveBeenCalledTimes(1);
    expect(
      detailSource.indexOf("const usdtCnyRate = useMibanUsdtCnyRate()")
    ).toBeLessThan(detailSource.indexOf("if (!item)"));
  });

  it("uses official purchasable mappings but never owns wallet/order/payment APIs", () => {
    expect(
      midaniangSelectionCatalog.every(item => item.purchasable === true)
    ).toBe(true);
    expect(midaniangSelectionCatalog.map(item => item.priceCny)).toEqual([
      228, 228,
    ]);
    for (const source of [
      listSource,
      detailSource,
      purchaseSource,
      organicSource,
    ]) {
      expect(source).not.toMatch(
        /\b(?:mutate|mutateAsync|createOrder|createCartOrder|useMutation|mtrpc|trpc|fetch|axios|localStorage)\b/
      );
      expect(source).not.toMatch(/(?:立即支付|提交订单)|\/api\//);
    }
    expect(detailSource).toContain("<MidaniangPurchaseActions item={item} />");
    expect(purchaseSource).toContain('from "./LimitedProductCart"');
    expect(purchaseSource).toContain('from "@shared/miban-limited-products"');
    expect(purchaseSource).toContain("getMibanLimitedProduct(item.productKey)");
    expect(purchaseSource).toContain(
      "getMibanLimitedProductSku(product, item.skuId)"
    );
    expect(purchaseSource).toContain('product.status !== "on_sale"');
    expect(purchaseSource).toContain(
      '<LimitedCartButton compact accent="#8d292c" />'
    );
    expect(purchaseSource).toContain("priceCny: sku.priceCny");
    expect(purchaseSource).not.toContain("priceCny: item.priceCny");
  });
});

describe("midaniang official purchase actions", () => {
  const mappings = [
    ["classic-rice-gift", "midaniang-classic-rice-gift", "classic-500g-6"],
    ["family-rice-gift", "midaniang-family-rice-gift", "family-300g-9"],
  ] as const;

  it.each(mappings)(
    "%s renders official buy href and shared cart controls in the first-screen summary",
    (key, productKey, skuId) => {
      const html = renderDetail(
        key,
        "?sku=foreign-sku&returnTo=https://evil.example"
      );
      const item = getMidaniangSelection(key);
      expect(item).toMatchObject({ purchasable: true, productKey, skuId });
      expect(vi.isMockFunction(getMibanLimitedProduct)).toBe(false);
      expect(vi.isMockFunction(getMibanLimitedProductSku)).toBe(false);
      const summary =
        html.match(
          /<section\b[^>]*aria-label="商品信息摘要"[^>]*>([\s\S]*?)<\/section>/
        )?.[1] ?? "";
      const buyLink =
        summary.match(
          /<a\b[^>]*data-testid="midaniang-buy-now"[^>]*>[\s\S]*?<\/a>/
        )?.[0] ?? "";
      expect(buyLink).toContain(
        `href="/p/proj_hzxm2t/limited/${productKey}/buy?sku=${skuId}"`
      );
      expect(buyLink).toContain("立即购买");
      expect(summary).toContain('data-testid="midaniang-purchase-actions"');
      expect(summary).toContain('data-testid="unit-limited-cart-button"');
      expect(summary).toMatch(
        /<button\b[^>]*type="button"[^>]*data-testid="midaniang-add-to-cart"[^>]*>加入购物车<\/button>/
      );
      expect(summary).toContain("已获有机认证");
      expect(html).toContain("通过米伴钱包完成支付");
      expect(html).toContain("加入购物车合单结算");
      expect(html).not.toMatch(
        /未开放购买|资料预览|待核验|foreign-sku|evil\.example/
      );
      expect(html.match(/\/buy\?sku=/g)).toHaveLength(1);
      expect(testCart.addItem).not.toHaveBeenCalled();
    }
  );

  it.each(midaniangSelectionCatalog)(
    "$key adds the real SKU payload, not display metadata or a self-created order",
    item => {
      const product = getMibanLimitedProduct(item.productKey)!;
      const sku = getMibanLimitedProductSku(product, item.skuId)!;
      // The mocked context makes the leaf component directly callable; no real cart,
      // network, wallet or DB writes occur. Deliberately vary display-only fields.
      const actions = MidaniangPurchaseActions({
        item: {
          ...item,
          title: midaniangSelectionCatalog[item.rank === 0 ? 1 : 0].title,
          specification: "展示规格不作为成交信息",
        },
      });
      expect(actions).not.toBeNull();
      const children = React.Children.toArray(actions!.props.children);
      const button = children.find(
        child =>
          React.isValidElement<{ "data-testid"?: string }>(child) &&
          child.props["data-testid"] === "midaniang-add-to-cart"
      );
      expect(React.isValidElement(button)).toBe(true);
      expect(testCart.addItem).not.toHaveBeenCalled();
      (
        button as React.ReactElement<{ onClick: () => boolean }>
      ).props.onClick();
      expect(testCart.addItem).toHaveBeenCalledTimes(1);
      expect(testCart.addItem).toHaveBeenCalledWith({
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
        quantity: 1,
        accent: "#8d292c",
      });
    }
  );
});

describe("midaniang selection horizontal list and accessibility", () => {
  it("renders two shrink-safe horizontal rows with full images and wrapping text", () => {
    const html = renderList();
    expect(html.match(/data-selection-key=/g)).toHaveLength(2);
    expect(html.match(/data-testid="midaniang-product-row"/g)).toHaveLength(2);
    expect(html).toContain('data-testid="midaniang-product-list"');
    expect(html).toContain('class="space-y-3"');
    expect(listSource).toContain("grid-cols-[132px_minmax(0,1fr)_24px]");
    expect(listSource).toContain(
      "max-[360px]:grid-cols-[106px_minmax(0,1fr)_20px]"
    );
    expect(listSource).toContain("min-h-[165px]");
    expect(listSource).toContain("rounded-[20px]");
    expect(listSource).toContain("line-clamp-2 break-words");
    expect(listSource).not.toMatch(
      /line-clamp-1|truncate|grid-cols-2|aspect-square/
    );
    expect(listSource).toContain("max-w-[480px]");
    const images = html.match(/<img\b[^>]*包装示意[^>]*>/g) ?? [];
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image).toContain("object-contain");
      expect(image).not.toContain("object-cover");
    }
    expect(html).toContain("500g×6 · 净含量3000g（6斤）");
    expect(html).toContain("300g×9包 · 净含量2700g（5.4斤）");
    expect(html).toContain("推荐零售价");
    expect(html).toContain("商品信息由商家提供");
    expect(html).not.toMatch(/未开放购买|资料预览|待核验/);
  });

  it("omits the redundant rice category and aligns the mark with a two-line name area", () => {
    const html = renderList();
    expect(html).not.toContain("大米 / 礼盒");
    const names =
      html.match(/<h2\b[^>]*data-testid="midaniang-product-name"[^>]*>/g) ?? [];
    expect(names).toHaveLength(2);
    for (const name of names) {
      expect(name).toContain("min-h-11");
      expect(name).toContain("line-clamp-2");
      expect(name).toContain("leading-[22px]");
      expect(name).not.toContain("mt-1");
    }
    expect(listSource).toContain("absolute right-2 top-3 z-10");
    expect(listSource).toContain('className="min-w-0 pr-6"');
  });

  it("has no search, category, packaging, sorting, count or Sheet/filter DOM", () => {
    const html = renderList();
    expect(html).not.toMatch(
      /<input\b|<select\b|<fieldset\b|role="(?:searchbox|combobox|dialog)"/
    );
    expect(html).not.toMatch(
      /搜索|筛选|全部品类|全部包装|排序|找到 \d 款|midaniang-result-count|midaniang-empty-state/
    );
    expect(listSource).not.toMatch(
      /\b(?:Sheet|SheetTrigger|SheetContent|SheetClose|FilterChoices|useSearch|useLocation|filterMidaniangSelection|parseMidaniangSelectionSearch|midaniangSelectionSearch)\b/
    );
  });

  it("ignores every old filter query and always links to both query-free details", () => {
    for (const search of [
      "?q=500g&category=rice&packaging=classic&sort=price-asc",
      "?category=oil&packaging=family&q=不存在&sort=price-desc",
      "?category=ricecake&returnTo=https://evil.example",
      "?category=invalid&packaging=__proto__&q=%3Cscript%3E&redirect=//evil.example",
    ]) {
      const html = renderList(search);
      expect(html).toBe(renderList());
      for (const key of ["classic-rice-gift", "family-rice-gift"]) {
        expect(html).toContain(`data-selection-key="${key}"`);
        expect(html).toContain(`href="${MIDANIANG_SELECTION_PATH}/${key}"`);
      }
      expect(html).not.toContain(
        `href="${MIDANIANG_SELECTION_PATH}/classic-rice-gift?`
      );
      expect(html).not.toContain(
        `href="${MIDANIANG_SELECTION_PATH}/family-rice-gift?`
      );
      expect(html).not.toContain("evil.example");
    }
  });

  it("keeps the logo and short introduction, with a collapsed accessible merchant toggle on each fresh render", () => {
    for (let freshRender = 0; freshRender < 2; freshRender++) {
      const html = renderList();
      const button = html.match(
        /<button\b[^>]*data-testid="midaniang-merchant-introduction-toggle"[^>]*>[\s\S]*?<\/button>/
      )?.[0];
      expect(button).toContain('aria-expanded="false"');
      expect(button).toContain(
        'aria-controls="midaniang-merchant-introduction"'
      );
      expect(button).toContain("商家介绍");
      expect(html).toMatch(
        /<div\b[^>]*id="midaniang-merchant-introduction"[^>]*hidden=""[^>]*><\/div>/
      );
      expect(html).not.toContain("米大娘关注有机稻田与日常餐桌");
      expect(html).not.toContain("一年一季，包装设有编号");
      expect(html).toContain("米大娘精选");
      expect(html).toContain("一份米粮，一份日常心意");
      expect(html).toContain("商家产地介绍 · 五常龙凤山镇");
      const logo = html.match(/<img\b[^>]*alt="米大娘品牌Logo"[^>]*>/)?.[0];
      expect(logo).toContain(midaniangSelectionAssets.logo);
      expect(logo).not.toMatch(/bg-|background/);
    }
    expect(listSource).toContain("useState(false)");
    expect(listSource).toContain("setMerchantIntroductionOpen(open => !open)");
    expect(listSource).toContain("商家确认产品已获有机认证");
    expect(listSource).toContain(
      "实际批次、认证范围与信息以认证证书和实物标签为准"
    );
  });

  it("places the merchant toggle on the right of the brand title row, never a separate row", () => {
    const html = renderList();
    const row = html.match(
      /<div\b[^>]*data-testid="midaniang-brand-title-row"[^>]*>([\s\S]*?)<\/div>/
    )?.[1];
    expect(row).toContain("米大娘");
    expect(row).toContain(
      'data-testid="midaniang-merchant-introduction-toggle"'
    );
    expect(row?.indexOf("米大娘")).toBeLessThan(row?.indexOf("商家介绍") ?? -1);
    expect(listSource).toContain("flex items-center justify-between gap-2");
    const button = html.match(
      /<button\b[^>]*data-testid="midaniang-merchant-introduction-toggle"[^>]*>/
    )?.[0];
    expect(button).toContain("shrink-0");
    expect(button).toContain("whitespace-nowrap");
    expect(button).not.toContain("mt-");
  });

  it("uses only a vertically centered entry arrow and edge-to-edge gradient media", () => {
    const html = renderList();
    expect(html).not.toContain("查看详情");
    expect(
      html.match(/data-testid="midaniang-product-entry-arrow"/g)
    ).toHaveLength(2);
    const arrows =
      html.match(
        /<span\b[^>]*data-testid="midaniang-product-entry-arrow"[^>]*>/g
      ) ?? [];
    for (const arrow of arrows)
      expect(arrow).toContain("flex items-center justify-center");
    expect(
      html.match(/data-testid="midaniang-product-media-gradient"/g)
    ).toHaveLength(2);
    expect(listSource).toContain("linear-gradient(90deg");
    expect(listSource).toContain("WebkitMaskImage");
    const media =
      html.match(/<div\b[^>]*data-testid="midaniang-product-media"[^>]*>/g) ??
      [];
    expect(media).toHaveLength(2);
    for (const region of media) {
      expect(region).toContain("relative isolate");
      expect(region).not.toMatch(/\bp-\d|\bm-\d/);
    }
  });

  it("blends the entire image scene into white at both vertical card edges", () => {
    const html = renderList();
    const overlays =
      html.match(
        /<div\b[^>]*data-testid="midaniang-product-media-vertical-gradient"[^>]*>/g
      ) ?? [];
    expect(overlays).toHaveLength(2);
    for (const overlay of overlays) {
      expect(overlay).toContain('aria-hidden="true"');
      expect(overlay).toContain("pointer-events-none absolute inset-0");
      expect(overlay).toContain("linear-gradient(180deg, #fff 0%");
      expect(overlay).toContain("rgba(255,255,255,0) 22%");
      expect(overlay).toContain("rgba(255,255,255,0) 78%");
      expect(overlay).toContain("#fff 100%");
    }
    expect(
      listSource.indexOf(
        'data-testid="midaniang-product-media-vertical-gradient"'
      )
    ).toBeGreaterThan(
      listSource.indexOf('data-testid="midaniang-product-media-gradient"')
    );
  });

  it("every detail return is a fixed local list path with no obsolete filters or open redirects", () => {
    for (const key of ["classic-rice-gift", "family-rice-gift", "unknown"]) {
      const html = renderDetail(
        key,
        "?q=礼物&category=rice&packaging=family&sort=price-desc&returnTo=https://evil.example"
      );
      const returnLinks =
        html.match(/<a\b[^>]*aria-label="返回米大娘精选列表"[^>]*>/g) ?? [];
      expect(returnLinks).toHaveLength(key === "unknown" ? 1 : 2);
      for (const link of returnLinks) {
        expect(link).toContain(`href="${MIDANIANG_SELECTION_PATH}"`);
        expect(link).not.toContain("?");
      }
      expect(html).not.toMatch(
        /evil\.example|category=|packaging=|sort=|returnTo=/
      );
    }
    expect(detailSource).not.toContain("useSearch");
    expect(detailSource).toContain("const listHref = MIDANIANG_SELECTION_PATH");
  });
});

describe("midaniang merchant-confirmed organic certification and transparent public mark", () => {
  const markAlt = "中国有机产品标识";
  const keys = ["classic-rice-gift", "family-rice-gift"];

  it("renders two accessible transparent certification marks without pending captions in the list", () => {
    const html = renderList();
    const images = html.match(/<img\b[^>]*alt="中国有机产品标识"[^>]*>/g) ?? [];
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image).toContain(`src="${midaniangSelectionAssets.organicMark}"`);
      expect(image).toContain(`alt="${markAlt}"`);
      expect(image).toContain('width="32"');
      expect(image).toContain('height="32"');
      expect(image).not.toMatch(/hidden|sr-only|aria-hidden/);
    }
    for (const key of keys) {
      const button =
        html.match(
          new RegExp(
            `<button\\b[^>]*data-testid="midaniang-list-organic-mark-${key}"[^>]*>[\\s\\S]*?<\\/button>`
          )
        )?.[0] ?? "";
      expect(button).toContain('aria-label="查看有机认证说明"');
      expect(button).toContain('title="有机认证"');
      expect(button).toContain("min-h-11 min-w-11");
      expect(button).toContain("absolute right-2 top-3");
      expect(button).not.toMatch(/待核验|<span\b|text-\[9px\]/);
      expect(button).not.toMatch(/hidden|sr-only|aria-hidden/);
    }
  });

  it("keeps both whole-card Links button-free, with separate sibling overlay buttons", () => {
    const html = renderList();
    const links =
      html.match(/<a\b[^>]*data-selection-key="[^"]+"[^>]*>[\s\S]*?<\/a>/g) ??
      [];
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toMatch(
        /href="\/p\/proj_hzxm2t\/limited\/midaniang\/(?:classic|family)-rice-gift"/
      );
      expect(link).toContain('data-testid="midaniang-product-row"');
      expect(link).not.toMatch(/<button\b|data-slot="dialog-trigger"/);
    }
    expect(
      html.match(
        /<\/a><button\b[^>]*data-testid="midaniang-list-organic-mark-[^"]+"/g
      )
    ).toHaveLength(2);
    expect(
      html.match(/class="relative" data-testid="midaniang-product-card"/g)
    ).toHaveLength(2);
    expect(listSource).toContain('className="min-w-0 pr-6"');
    expect(listSource).toContain("line-clamp-2 break-words");
    expect(organicSource).toContain(
      "onClick={event => event.stopPropagation()}"
    );
  });

  it.each(keys)(
    "shows adjacent 48px brand/organic marks and confirmed first-screen summary on %s",
    key => {
      const html = renderDetail(key);
      const image =
        html.match(
          /<img\b[^>]*data-testid="midaniang-detail-organic-mark-image"[^>]*>/
        )?.[0] ?? "";
      expect(image).toContain(`src="${midaniangSelectionAssets.organicMark}"`);
      expect(image).toContain(`alt="${markAlt}"`);
      expect(image).toContain('width="48"');
      expect(image).toContain('height="48"');
      expect(image).not.toMatch(/hidden|aria-hidden|sr-only/);
      const hero =
        html.match(
          /<div\b[^>]*data-testid="midaniang-detail-hero"[^>]*>([\s\S]*?)<section\b/
        )?.[1] ?? "";
      const marks =
        hero.match(
          /<div\b[^>]*data-testid="midaniang-detail-brand-marks"[^>]*>([\s\S]*?)<\/div>/
        )?.[0] ?? "";
      expect(marks).toContain(
        "absolute right-3 top-3 z-10 flex items-start gap-3"
      );
      const brandImage =
        marks.match(
          /<img\b[^>]*data-testid="midaniang-detail-brand-mark"[^>]*>/
        )?.[0] ?? "";
      expect(brandImage).toContain(`src="${midaniangSelectionAssets.logo}"`);
      expect(brandImage).toContain('alt="米大娘品牌标签"');
      expect(brandImage).toContain('width="48"');
      expect(brandImage).toContain('height="48"');
      expect(brandImage).toContain("object-contain");
      expect(marks).toContain(image);
      expect(
        marks.indexOf('data-testid="midaniang-detail-brand-mark"')
      ).toBeLessThan(
        marks.indexOf('data-testid="midaniang-detail-organic-mark"')
      );
      expect(marks).toContain('aria-label="查看有机认证说明"');
      expect(marks).toContain('title="有机认证"');
      const status =
        html.match(
          /<p\b[^>]*data-testid="midaniang-detail-organic-status"[^>]*>([\s\S]*?)<\/p>/
        )?.[1] ?? "";
      expect(textContent(status)).toBe("已获有机认证");
      expect(
        html.indexOf('data-testid="midaniang-detail-organic-status"')
      ).toBeLessThan(html.indexOf('data-testid="midaniang-purchase-actions"'));
      expect(html).not.toMatch(/待核验|资料预览|当前不作认证或检测结论/);
      expect(html).toContain("商家确认产品已获有机认证");
      expect(html).toContain("认证证书和实物标签为准");
      expect(detailSource).toContain(
        'className="relative" data-testid="midaniang-detail-hero"'
      );
      expect(detailSource).toContain(
        'className="aspect-square w-full bg-[#ece8dc]"'
      );
      expect(detailSource).toContain('variant="large"');
    }
  );

  it("uses the transparent public COS mark and preserves the merchant original without any AI seal", () => {
    const url = new URL(midaniangSelectionAssets.organicMark);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe(
      "haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com"
    );
    expect(url.pathname).toContain("/public-organic-transparent-v1/");
    expect(midaniangSelectionAssets.organicMarkOriginal).toContain(
      "/original-organic-mark-v1/"
    );
    expect(midaniangSelectionAssets.organicMarkOriginal).not.toBe(
      midaniangSelectionAssets.organicMark
    );
    expect(midaniangSelectionAssets.organicMarkSource).toBe(
      "https://www.controlunion.com/certification-program/china-national-organic-standard/"
    );
    expect(url.pathname).toMatch(/\.(?:png|webp|jpe?g)$/);
    expect(url.pathname).not.toMatch(/ai[-_]|generated|redesign/i);
    expect([
      midaniangSelectionAssets.logo,
      ...Object.values(midaniangSelectionAssets.grid),
      ...Object.values(midaniangSelectionAssets.posters),
    ]).not.toContain(midaniangSelectionAssets.organicMark);
    expect(
      organicSource.match(/src=\{midaniangSelectionAssets\.organicMark\}/g)
    ).toHaveLength(2);
    expect(organicSource).not.toMatch(
      /<svg\b|<canvas\b|data:image|\.posters\b|\.grid\b|主页1\.jpg/
    );
  });

  it("owns a Radix dialog with public-source disclosure, preserved original and accessible close", () => {
    expect(organicSource).toContain('from "@/components/ui/dialog"');
    for (const component of [
      "Dialog",
      "DialogTrigger",
      "DialogContent",
      "DialogTitle",
      "DialogDescription",
      "DialogClose",
    ])
      expect(organicSource).toMatch(new RegExp(`<${component}(?:\\s|>)`));
    expect(organicSource).toContain(
      "商家确认产品已获有机认证，具体认证范围与有效期以认证证书和实物标签为准。"
    );
    expect(organicSource).toContain(
      "两款礼盒原素材（经典大米礼盒、给孩子的一份礼物）"
    );
    expect(organicSource).toContain(
      "透明展示图采用Control Union公开的中国有机产品标识，未重绘"
    );
    expect(organicSource).toContain("透明标识来源");
    expect(organicSource).toContain("查看商家原素材");
    expect(organicSource).toContain(
      "href={midaniangSelectionAssets.organicMarkSource}"
    );
    expect(organicSource).toContain(
      "href={midaniangSelectionAssets.organicMarkOriginal}"
    );
    expect(organicSource).toContain('rel="noopener noreferrer"');
    expect(organicSource).toContain("width={100}");
    expect(organicSource).toContain('aria-label="关闭有机认证说明"');
    expect(organicSource).not.toMatch(
      /onOpenChange|setAttention|useMutation|mutate(?:Async)?|createOrder|ShoppingCart|\/buy\b|认证编号|10年认证|行业唯一|SGS|零农药|已核验认证|平台(?:已)?核验|待核验/
    );
  });

  it("never fabricates certificate numbers, SGS findings or platform verification", () => {
    for (const source of [
      listSource,
      detailSource,
      purchaseSource,
      organicSource,
    ]) {
      expect(source).not.toMatch(
        /认证编号|证书编号|SGS|10年认证|行业唯一|绝对无农药|零农药|已核验认证|平台(?:已)?核验/
      );
    }
    for (const key of keys) {
      expect(renderDetail(key)).not.toMatch(
        /认证编号|证书编号|SGS|平台(?:已)?核验|已核验认证/
      );
    }
  });
});

describe("midaniang real exchange-rate price presentation", () => {
  it.each([7.2, 8.0])(
    "uses rate %s in list, detail summary, specification and price FAQ without changing CNY",
    rate => {
      testRate.value = rate;
      const expectedU = (228 / rate).toFixed(2);
      expect(vi.isMockFunction(cnyToU)).toBe(false);
      expect(cnyToU(228, rate).toFixed(2)).toBe(expectedU);
      const list = renderList();
      expect(priceTexts(list, "midaniang-list-price-u")).toEqual([
        `${expectedU} USDT /盒`,
        `${expectedU} USDT /盒`,
      ]);
      expect(priceTexts(list, "midaniang-list-price-cny")).toEqual([
        "≈ ¥228.00",
        "≈ ¥228.00",
      ]);
      for (const key of ["classic-rice-gift", "family-rice-gift"]) {
        const detail = renderDetail(key);
        expect(priceTexts(detail, "midaniang-detail-price-u")).toEqual([
          `${expectedU} USDT /盒`,
        ]);
        expect(priceTexts(detail, "midaniang-detail-price-cny")).toEqual([
          "≈ ¥228.00",
        ]);
        const specificationPrice =
          detail.match(
            /<dd\b[^>]*data-testid="midaniang-specification-price"[^>]*>([\s\S]*?)<\/dd>/
          )?.[1] ?? "";
        expect(textContent(specificationPrice)).toBe(
          `${expectedU} USDT /盒 ≈ ¥228.00 /盒 · 原始推荐零售价`
        );
        expect(detail).toContain(`两款USDT参考价均为${expectedU} USDT /盒`);
        expect(detail).toContain("商家原始推荐零售价 ≈ ¥228.00 /盒");
        expect(detail).not.toMatch(/228(?:\.00)?\s*(?:USDT|U)(?:\s|<|\/)/);
      }
      expect(midaniangSelectionCatalog.map(item => item.priceCny)).toEqual([
        228, 228,
      ]);
    }
  );

  it("changes SSR U prices when the shared live rate changes, not the original CNY price", () => {
    const snapshots = [7.2, 8.0].map(rate => {
      testRate.value = rate;
      return {
        list: renderList(),
        detail: renderDetail("family-rice-gift"),
      };
    });
    expect(priceTexts(snapshots[0].list, "midaniang-list-price-u")).not.toEqual(
      priceTexts(snapshots[1].list, "midaniang-list-price-u")
    );
    expect(
      priceTexts(snapshots[0].detail, "midaniang-detail-price-u")
    ).not.toEqual(priceTexts(snapshots[1].detail, "midaniang-detail-price-u"));
    expect(priceTexts(snapshots[0].list, "midaniang-list-price-cny")).toEqual(
      priceTexts(snapshots[1].list, "midaniang-list-price-cny")
    );
    expect(
      priceTexts(snapshots[0].detail, "midaniang-detail-price-cny")
    ).toEqual(priceTexts(snapshots[1].detail, "midaniang-detail-price-cny"));
    for (const source of [listSource, detailSource]) {
      expect(source).toContain('from "./useMibanUsdtCnyRate"');
      expect(source).toContain("cnyToU(item.priceCny, usdtCnyRate)");
      expect(source).not.toMatch(
        /\b(?:vi\.mock|mockRate|FALLBACK_USDT_CNY_RATE)\b|\b(?:7\.2|8\.0)\b/
      );
    }
  });
});

describe("midaniang detail image and document structure", () => {
  it("uses actual 1120 by 1680 poster metadata and all required image mappings", () => {
    expect(midaniangSelectionPosterDimensions).toEqual({
      width: 1120,
      height: 1680,
    });
    expect(Object.keys(midaniangSelectionAssets.grid)).toEqual([
      "classic-rice-gift",
      "family-rice-gift",
    ]);
    expect(Object.keys(midaniangSelectionAssets.posters)).toHaveLength(8);
  });

  it("renders the classic five full posters in the agreed order", () => {
    const html = renderDetail("classic-rice-gift");
    const images = extractImages(html);
    expect(
      images.map(image => image.match(/data-poster-key="([^"]+)"/)?.[1])
    ).toEqual([
      "classicHero",
      "organicStory",
      "classicPackaging",
      "classicGift",
      "cookingStory",
    ]);
    expect(html).toContain("500g×6 · 净含量3000g（6斤）");
    expect(html).toContain("经典礼盒为500g×6，净含量3000g（6斤）");
  });

  it("renders the family five full posters in the agreed order", () => {
    const html = renderDetail("family-rice-gift");
    const images = extractImages(html);
    expect(
      images.map(image => image.match(/data-poster-key="([^"]+)"/)?.[1])
    ).toEqual([
      "familyHero",
      "organicStory",
      "familyPackaging",
      "familyMeal",
      "cookingStory",
    ]);
    expect(html).toContain("300g×9包 · 净含量2700g（5.4斤）");
    expect(html).toContain("净含量2700g（5.4斤）");
    const weightFaq =
      html.match(
        /<details\b[^>]*><summary\b[^>]*>净含量是多少？<\/summary>([\s\S]*?)<\/details>/
      )?.[1] ?? "";
    expect(textContent(weightFaq)).toBe(
      "绿色礼盒为300g×9包，净含量2700g（5.4斤）。实际规格以实物标签为准。"
    );
    expect(html).toContain("商品规格、批次与日期以实物包装标签为准");
    expect(html).not.toContain('data-testid="family-weight-warning"');
    expect(html).not.toContain("净含量待确认");
    expect(html).not.toContain("等待商家核对");
    expect(html).not.toContain("现有Word资料中的总量与单包描述不一致");
    expect(html).not.toContain("绿色礼盒包装 · 9小包，净含量待确认");
  });

  it.each(["classic-rice-gift", "family-rice-gift"])(
    "preserves edge-to-edge original-ratio posters and eager/lazy behavior on %s",
    key => {
      const html = renderDetail(key);
      const images = extractImages(html);
      expect(images).toHaveLength(5);
      for (const [index, image] of images.entries()) {
        const posterKey = image.match(
          /data-poster-key="([^"]+)"/
        )?.[1] as keyof typeof midaniangSelectionAssets.posters;
        expect(image).toContain(
          `src="${midaniangSelectionAssets.posters[posterKey]}"`
        );
        expect(image).toContain('width="1120"');
        expect(image).toContain('height="1680"');
        expect(image).toContain(
          'style="display:block;width:100%;height:auto;margin:0;padding:0;border:0"'
        );
        expect(image).toContain(`loading="${index === 0 ? "eager" : "lazy"}"`);
        expect(image).not.toMatch(/object-cover|aspect-square/);
      }
      const stack = html.match(
        /<section[^>]*data-testid="midaniang-poster-stack"[^>]*>/
      )?.[0];
      expect(stack).toContain("margin:0;padding:0;border:0;line-height:0");
      const mainImage = html.match(
        /<img[^>]*data-testid="midaniang-detail-main-image"[^>]*>/
      )?.[0];
      expect(mainImage).toContain('loading="eager"');
      expect(mainImage).toContain('fetchPriority="high"');
    }
  );

  it.each(["classic-rice-gift", "family-rice-gift"])(
    "provides all four navigable DOM chapters after the poster stack on %s",
    key => {
      const html = renderDetail(key);
      for (const [id, label] of [
        ["product-story", "产品故事"],
        ["specification-info", "规格信息"],
        ["cooking-storage", "食用保存"],
        ["frequently-asked-questions", "常见问题"],
      ]) {
        expect(html).toContain(`href="#${id}"`);
        expect(html).toContain(`id="${id}"`);
        expect(html).toContain(label);
        expect(html.indexOf(`id="${id}"`)).toBeGreaterThan(
          html.indexOf("midaniang-poster-stack")
        );
      }
    }
  );

  it.each(["classic-rice-gift", "family-rice-gift"])(
    "exposes merchant attribution, certification scope and seven real FAQs on %s",
    key => {
      const html = renderDetail(key);
      for (const label of [
        "米大娘",
        "五常龙凤山镇",
        "一年一季",
        "编号",
        "配料",
        "执行标准",
        "生产日期 / 保质期",
        "有机认证 / 检测报告",
        "配料、执行标准和日期以实物标签为准",
        "认证信息与批次检测报告以实际文件为准",
        "商家确认产品已获有机认证",
        "认证范围与有效期以认证证书和实物标签为准",
        "商品信息由商家提供，包装图片为设计展示",
        "场景图片为AI重设计示意，不作为产地溯源或检测证明",
      ])
        expect(html).toContain(label);
      expect(html.match(/<details\b/g)).toHaveLength(7);
      for (const question of [
        "两款礼盒有什么区别？",
        "净含量是多少？",
        "怎么买？",
        "有机认证信息怎么看？",
        "儿童可以食用吗？",
        "煮饭水量要多少？",
        "如何保存，保质期多久？",
      ])
        expect(html).toContain(question);
    }
  );

  it.each(["classic-rice-gift", "family-rice-gift"])(
    "keeps diet guidance non-medical and links neutral nutrition reference on %s",
    key => {
      const html = renderDetail(key);
      for (const text of [
        "充分煮熟",
        "个人口感",
        "密封",
        "避光",
        "干燥",
        "防潮",
        "一般主食",
        "实际年龄",
        "咀嚼能力",
        "分量和软硬度",
        "蔬菜与蛋、豆类",
        "不替代多样饮食",
        "该来源不评价或背书米大娘产品",
      ])
        expect(html).toContain(text);
      expect(html).toContain(
        "https://www.mayoclinic.org/healthy-lifestyle/childrens-health/in-depth/nutrition-for-kids/art-20049335"
      );
      expect(html).not.toMatch(
        /SGS|提高免疫力|促进发育|绝对无农药|零农药|认证有机大米/
      );
    }
  );
});
