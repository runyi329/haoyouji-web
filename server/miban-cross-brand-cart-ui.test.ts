import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMibanLimitedProduct,
  getMibanLimitedProductSku,
} from "../shared/miban-limited-products";
import {
  formatMibanPaymentSummary,
  type MibanWalletPaymentQuote,
} from "../shared/miban-wallet-payment";

// Only React scheduling/context and external tRPC/auth/router hooks are isolated.
// Catalogs, payment maths, allocation component and checkout page are real modules.
// mutate is a capture-only unit boundary: no application/router/DB/network starts.
const boundary = vi.hoisted(() => ({
  active: null as any,
  context: null as any,
  mutationOptions: null as any,
  pending: false,
  authenticated: true,
  addresses: [] as any[],
  quote: null as any,
  mutate: vi.fn(),
  quoteQuery: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (initial: any) =>
      boundary.active
        ? boundary.active.useState(initial)
        : actual.useState(initial),
    useRef: (initial: any) =>
      boundary.active
        ? boundary.active.useRef(initial)
        : actual.useRef(initial),
    useMemo: (fn: any, deps: any) =>
      boundary.active
        ? boundary.active.useMemo(fn, deps)
        : actual.useMemo(fn, deps),
    useCallback: (fn: any, deps: any) =>
      boundary.active
        ? boundary.active.useMemo(() => fn, deps)
        : actual.useCallback(fn, deps),
    useEffect: (fn: any, deps: any) =>
      boundary.active
        ? boundary.active.useEffect(fn, deps)
        : actual.useEffect(fn, deps),
    useContext: (context: any) =>
      boundary.active ? boundary.context : actual.useContext(context),
  };
});
vi.mock("../client/src/pages/miban/mibanTrpc", () => ({
  mtrpc: {
    useUtils: () => ({
      order: { walletPaymentQuote: { invalidate: boundary.invalidate } },
    }),
    address: { list: { useQuery: () => ({ data: boundary.addresses }) } },
    order: { walletPaymentQuote: { useQuery: boundary.quoteQuery } },
    limitedProduct: {
      createCartOrder: {
        useMutation: (options: any) => {
          boundary.mutationOptions = options;
          return { mutate: boundary.mutate, isPending: boundary.pending };
        },
      },
    },
  },
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      recharge: Object.fromEntries(
        [
          "getBalance",
          "getCnyBalance",
          "getUsdtBalanceSummary",
          "getCnyBalanceSummary",
          "getMultiAssetBalances",
        ].map(key => [key, { invalidate: boundary.invalidate }])
      ),
    }),
  },
}));
vi.mock("../client/src/_core/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: boundary.authenticated, loading: false }),
}));
vi.mock("wouter", async () => ({
  ...(await vi.importActual<typeof import("wouter")>("wouter")),
  useLocation: () => [
    "/p/proj_hzxm2t/limited/midaniang/classic-rice-gift",
    boundary.navigate,
  ],
}));
vi.mock("sonner", () => ({
  toast: {
    error: boundary.toastError,
    success: boundary.toastSuccess,
    message: vi.fn(),
  },
}));
import {
  LimitedProductCartProvider,
  type LimitedCartItem,
} from "../client/src/pages/miban/LimitedProductCart";

const STORAGE_KEY = "miban-limited-product-cart-v1";
const NOW = Date.parse("2026-11-22T04:00:00.000Z");
function fixtureQuote(): MibanWalletPaymentQuote {
  const at = new Date(NOW).toISOString();
  return {
    quoteToken: "isolated-unit-signature",
    quotedAt: at,
    expiresAt: new Date(NOW + 60_000).toISOString(),
    usdtCnyRate: "7",
    assets: [
      {
        assetCode: "CNY",
        assetName: "人民币",
        available: "0",
        frozen: "0",
        priceCny: "1",
        priceUsdt: "0.142857142857142857",
        priceUpdatedAt: at,
      },
      {
        assetCode: "USDT",
        assetName: "USDT",
        available: "594.9506102699997",
        frozen: "1.12345678",
        priceCny: "7",
        priceUsdt: "1",
        priceUpdatedAt: at,
      },
      {
        assetCode: "ETH",
        assetName: "Ethereum",
        available: "1",
        frozen: "0",
        priceCny: "14000",
        priceUsdt: "2000",
        priceUpdatedAt: at,
      },
    ],
  };
}
function catalogItem(key: string, skuId?: string): LimitedCartItem {
  const product = getMibanLimitedProduct(key)!;
  const sku = getMibanLimitedProductSku(product, skuId ?? product.skus[0].id)!;
  return {
    checkoutGroupKey: product.checkoutGroupKey ?? product.key,
    groupLabel: `${product.brand}精选`,
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
    accent: product.card.theme.accent,
  };
}
const rice = () => catalogItem("midaniang-classic-rice-gift");
const aloe = () => catalogItem("herbalife-aloe-nutrition");
const equalDeps = (a: any[] | undefined, b: any[] | undefined) =>
  Boolean(
    a &&
      b &&
      a.length === b.length &&
      a.every((value, index) => Object.is(value, b[index]))
  );
function hookHarness<T>(render: () => T) {
  const slots: any[] = [];
  let cursor = 0;
  let pending: (() => void)[] = [];
  const harness = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      return [
        slots[index].value,
        (next: any) => {
          slots[index].value =
            typeof next === "function" ? next(slots[index].value) : next;
        },
      ];
    },
    useRef(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(fn: () => any, deps: any[]) {
      const index = cursor++;
      if (!(index in slots) || !equalDeps(slots[index].deps, deps))
        slots[index] = { value: fn(), deps };
      return slots[index].value;
    },
    useEffect(fn: () => any, deps: any[]) {
      const index = cursor++;
      if (!(index in slots) || !equalDeps(slots[index].deps, deps))
        pending.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
    },
    render(): T {
      cursor = 0;
      pending = [];
      boundary.active = harness;
      let result: T;
      try {
        result = render();
      } finally {
        boundary.active = null;
      }
      pending.forEach(effect => effect());
      return result!;
    },
    cleanup() {
      slots.forEach(slot => slot?.cleanup?.());
    },
  };
  harnesses.push(harness);
  return harness;
}
const harnesses: ReturnType<typeof hookHarness>[] = [];
function findElement(node: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(node))
    return node.map(item => findElement(item, predicate)).find(Boolean);
  if (!React.isValidElement(node)) return undefined;
  if (predicate(node)) return node;
  return findElement((node.props as any).children, predicate);
}
function setupCart() {
  const provider = hookHarness(() =>
    LimitedProductCartProvider({ children: null })
  );
  const updateProvider = () => {
    const element = provider.render();
    boundary.context = element.props.value;
    return element;
  };
  const initial = updateProvider();
  const overlayType = initial.props.children[1].type;
  const overlay = hookHarness(() => overlayType());
  const render = () => {
    updateProvider();
    return overlay.render();
  };
  const open = () => {
    boundary.context.openCart();
    render();
    return render();
  };
  const confirm = () => {
    const element = open();
    findElement(
      element,
      node => node.type === "button" && node.props.children === "统一买单"
    ).props.onClick();
    render();
    return render();
  };
  return { render, open, confirm, context: () => boundary.context };
}
function clickPay(cart: ReturnType<typeof setupCart>) {
  let element = cart.render();
  const allocation = findElement(
    element,
    node =>
      typeof node.type === "function" &&
      node.type.name === "MibanMixedPaymentAllocation"
  );
  allocation.props.payment.confirmPaymentReview(true);
  element = cart.render();
  const pay = findElement(
    element,
    node =>
      node.type === "button" &&
      String(node.props.children).startsWith("确认支付")
  );
  expect(pay.props.disabled).toBe(false);
  pay.props.onClick();
}
function html(element: any) {
  return renderToStaticMarkup(element);
}
const source = readFileSync(
  new URL("../client/src/pages/miban/LimitedProductCart.tsx", import.meta.url),
  "utf8"
);
const file = ts.createSourceFile(
  "LimitedProductCart.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
function walk(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (current: ts.Node) => {
    if (predicate(current)) found.push(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("React", React);
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  boundary.fetch.mockReset().mockImplementation(() => {
    throw new Error("Unit tests must never call network");
  });
  vi.stubGlobal("fetch", boundary.fetch);
  boundary.active = null;
  boundary.context = null;
  boundary.pending = false;
  boundary.authenticated = true;
  boundary.quote = fixtureQuote();
  boundary.addresses = [
    {
      id: 1,
      name: "隔离单元测试收货人",
      phone: "13800138000",
      province: "北京市",
      city: "北京市",
      district: "朝阳区",
      detail: "单元测试地址",
      is_default: 1,
    },
  ];
  boundary.mutate.mockReset();
  boundary.invalidate.mockReset();
  boundary.navigate.mockReset();
  boundary.toastError.mockReset();
  boundary.toastSuccess.mockReset();
  boundary.quoteQuery.mockReset().mockImplementation(() => ({
    data: boundary.quote,
    isSuccess: true,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }));
});
afterEach(() => {
  harnesses.splice(0).forEach(harness => harness.cleanup());
  expect(boundary.fetch).not.toHaveBeenCalled();
  boundary.active = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("cross-brand cart provider and grouped confirmation (no network)", () => {
  it("allows different groups, merges same product/SKU and preserves quantity caps", () => {
    const cart = setupCart();
    expect(cart.context().addItem(rice())).toBe(true);
    expect(cart.context().addItem(aloe())).toBe(true);
    cart.render();
    expect(cart.context().items).toHaveLength(2);
    expect(cart.context().itemCount).toBe(2);
    expect(cart.context().totalCny).toBe(371);
    cart.context().addItem({ ...rice(), quantity: 20 });
    cart.render();
    expect(
      cart
        .context()
        .items.find(
          (item: LimitedCartItem) => item.productKey === rice().productKey
        ).quantity
    ).toBe(rice().maxPurchaseQty);
    expect(cart.context().items).toHaveLength(2);
    const key = `${rice().productKey}:${rice().skuId}`;
    cart.context().setQuantity(key, 100);
    cart.render();
    expect(cart.context().items[0].quantity).toBe(rice().maxPurchaseQty);
    cart.context().setQuantity(key, 0);
    cart.render();
    expect(cart.context().items).toEqual([aloe()]);
    expect(boundary.toastError).not.toHaveBeenCalled();
  });
  it("keeps distinct SKUs as distinct rows inside the same group", () => {
    const cart = setupCart();
    const shake = getMibanLimitedProduct("herbalife-protein-shake-portable")!;
    cart.context().addItem(catalogItem(shake.key, shake.skus[0].id));
    cart.context().addItem(catalogItem(shake.key, shake.skus[1].id));
    const markup = html(cart.open());
    expect(cart.context().items).toHaveLength(2);
    expect(
      markup.match(/data-testid="cart-group-herbalife-limited"/g)
    ).toHaveLength(1);
    expect(markup).toContain(shake.skus[0].name);
    expect(markup).toContain(shake.skus[1].name);
  });
  it("retains v1 stored rows and rehydrates missing labels/group keys from the real catalog", () => {
    const legacy: any = { ...rice(), quantity: "2", priceCny: "228" };
    for (const key of ["checkoutGroupKey", "groupLabel", "accent"])
      delete legacy[key];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([legacy, aloe()]));
    const cart = setupCart();
    expect(cart.context().items).toHaveLength(2);
    expect(cart.context().items[0]).toMatchObject({
      quantity: 2,
      priceCny: 228,
      checkoutGroupKey: rice().checkoutGroupKey,
      groupLabel: rice().groupLabel,
    });
    expect(cart.context().totalCny).toBe(599);
    expect(html(cart.open())).not.toContain("undefined");
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toHaveLength(
      2
    );
  });
  it("sums native decimal cents without floating point accumulation", () => {
    // Numeric edge fixtures at unit boundary only, not production/default cart data.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { ...rice(), priceCny: 0.29, quantity: 3 },
        { ...aloe(), priceCny: 0.07, quantity: 9 },
      ])
    );
    const cart = setupCart();
    expect(cart.context().totalCny).toBe(1.5);
    const markup = html(cart.open());
    expect(markup).toContain("¥0.87");
    expect(markup).toContain("¥0.63");
    expect(markup).toContain("¥1.50");
  });
  it("shows two groups/subtotals/accents in cart and confirmation with one address and wallet", () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    const cartMarkup = html(cart.open());
    for (const item of [rice(), aloe()]) {
      expect(cartMarkup).toContain(
        `data-testid="cart-group-${item.checkoutGroupKey}"`
      );
      expect(cartMarkup).toContain(item.groupLabel);
      expect(cartMarkup).toContain(item.accent);
      expect(cartMarkup).toContain(`¥${item.priceCny.toFixed(2)}`);
    }
    expect(cartMarkup).toContain('data-testid="cart-split-order-notice"');
    const markup = html(cart.confirm());
    for (const item of [rice(), aloe()])
      expect(markup).toContain(
        `data-testid="confirmation-group-${item.checkoutGroupKey}"`
      );
    expect(markup).toContain('data-testid="confirmation-split-order-notice"');
    expect(markup).toContain("统一付款，按精选生成2张订单");
    expect(markup).not.toContain("已生成");
    expect(markup.match(/收货地址<\/div>/g)).toHaveLength(1);
    expect(markup.match(/钱包单币 \/ 组合支付/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="选择支付数字币"');
    expect(markup).toContain('value="ETH"');
    expect(markup).toContain("统一应付");
    expect(markup).toContain("53.00");
    expect(markup).toContain("¥371.00");
    expect(markup).toContain("可用 594.95 · 冻结 1.12");
    expect(boundary.mutate).not.toHaveBeenCalled();
  });
  it("captures one unchanged signed payment input for all groups and never clears before success", () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    cart.confirm();
    clickPay(cart);
    expect(boundary.mutate).toHaveBeenCalledOnce();
    const input = boundary.mutate.mock.calls[0][0];
    expect(input.items).toEqual(
      [rice(), aloe()].map(({ productKey, skuId, quantity }) => ({
        productKey,
        skuId,
        quantity,
      }))
    );
    expect(input.paymentAssets).toEqual([{ assetCode: "USDT", amount: "53" }]);
    expect(input.paymentQuoteToken).toBe(boundary.quote.quoteToken);
    expect(Object.keys(input).sort()).toEqual(
      [
        "items",
        "receiverName",
        "receiverPhone",
        "receiverAddress",
        "userNote",
        "cnyAmount",
        "paymentAssets",
        "paymentQuoteToken",
      ].sort()
    );
    expect(input.receiverPhone).toBe("13800138000");
    expect(input.receiverAddress).toBe("北京市朝阳区单元测试地址");
    expect(cart.context().items).toHaveLength(2);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toHaveLength(
      2
    );
    boundary.mutationOptions.onError({ message: "签名报价过期" });
    cart.render();
    expect(cart.context().items).toHaveLength(2);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toHaveLength(
      2
    );
    expect(boundary.toastError).toHaveBeenCalled();
  });
  it("preserves the digital-coin dropdown and raw ETH/token across two-group checkout", () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    let element = cart.confirm();
    let allocationElement = findElement(
      element,
      node =>
        typeof node.type === "function" &&
        node.type.name === "MibanMixedPaymentAllocation"
    );
    let payment = allocationElement.props.payment;
    const allocation = hookHarness(() => allocationElement.type({ payment }));
    const select = findElement(
      allocation.render(),
      node =>
        node.type === "select" && node.props["aria-label"] === "选择支付数字币"
    );
    select.props.onChange({ target: { value: "ETH" } });
    element = cart.render();
    allocationElement = findElement(
      element,
      node =>
        typeof node.type === "function" &&
        node.type.name === "MibanMixedPaymentAllocation"
    );
    payment = allocationElement.props.payment;
    expect(payment.paymentAssets).toEqual([
      { assetCode: "ETH", amount: "0.0265" },
    ]);
    expect(payment.reviewed).toBe(false);
    expect(
      findElement(allocation.render(), node => node.type === "select").props
        .value
    ).toBe("ETH");
    clickPay(cart);
    expect(boundary.mutate).toHaveBeenCalledOnce();
    expect(boundary.mutate.mock.calls[0][0].paymentAssets).toEqual([
      { assetCode: "ETH", amount: "0.0265" },
    ]);
    expect(boundary.mutate.mock.calls[0][0].paymentQuoteToken).toBe(
      boundary.quote.quoteToken
    );
    expect(cart.context().items).toHaveLength(2);
  });
  it("blocks missing address, invalid phone, stale quote and pending duplicate clicks", () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    boundary.addresses = [];
    cart.confirm();
    clickPay(cart);
    expect(boundary.mutate).not.toHaveBeenCalled();
    expect(boundary.toastError).toHaveBeenLastCalledWith("请先选择收货地址");
    boundary.addresses = [
      { id: 1, name: "单元测试", phone: "invalid", is_default: 1 },
    ];
    cart.render();
    cart.render();
    clickPay(cart);
    expect(boundary.mutate).not.toHaveBeenCalled();
    boundary.addresses = [
      { id: 1, name: "单元测试", phone: "13800138000", is_default: 1 },
    ];
    cart.render();
    cart.render();
    boundary.pending = true;
    const element = cart.render();
    const pay = findElement(
      element,
      node =>
        node.type === "button" &&
        node.props.disabled === true &&
        String(node.props.className).includes("disabled:bg-gray-300")
    );
    pay.props.onClick();
    expect(boundary.mutate).not.toHaveBeenCalled();
    boundary.pending = false;
    vi.setSystemTime(NOW + 60_001);
    const expired = cart.render();
    expect(
      findElement(
        expired,
        node =>
          node.type === "button" &&
          String(node.props.className).includes("disabled:bg-gray-300")
      ).props.disabled
    ).toBe(true);
    expect(cart.context().items).toHaveLength(2);
  });
});

describe("truthful aggregate success / native per-order snapshots", () => {
  function paidCart() {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    cart.confirm();
    clickPay(cart);
    return cart;
  }
  it("renders only response child orders and actual snapshot amounts; clears once only after aggregate success", () => {
    const cart = paidCart();
    const native = "0.010214285714285715";
    const response = {
      checkoutNo: "UNIT-CHECKOUT-LONG-12345678901234567890",
      orderId: 101,
      orderNo: "UNIT-FIRST",
      totalCny: 371,
      walletPayments: [{ assetCode: "ETH", amount: "0.026500000000000001" }],
      orders: [
        {
          orderId: 101,
          orderNo: "UNIT-FIRST",
          checkoutGroupKey: rice().checkoutGroupKey,
          groupLabel: "米大娘精选",
          totalCny: 228,
          walletPayments: [
            { assetCode: "ETH", amount: "0.016285714285714286" },
          ],
        },
        {
          orderId: 102,
          orderNo: "UNIT-SECOND",
          checkoutGroupKey: aloe().checkoutGroupKey,
          groupLabel: "康宝莱精选",
          totalCny: 143,
          walletPayments: [{ assetCode: "ETH", amount: native }],
        },
      ],
    };
    boundary.mutationOptions.onSuccess(response);
    const markup = html(cart.render());
    expect(cart.context().items).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual([]);
    expect(boundary.invalidate).toHaveBeenCalledTimes(6);
    expect(markup).toContain("统一付款成功");
    expect(markup).toContain("已生成 2 张订单");
    expect(markup).toContain("分开发货");
    expect(markup).toContain("独立处理");
    expect(markup).toContain(response.checkoutNo);
    for (const order of response.orders) {
      expect(markup).toContain(`aria-label="子订单 ${order.orderNo}"`);
      expect(markup).toContain(order.groupLabel);
      expect(markup).toContain(`¥${order.totalCny.toFixed(2)}`);
      expect(markup).toContain(formatMibanPaymentSummary(order.walletPayments));
    }
    expect(markup).toContain(
      formatMibanPaymentSummary(response.walletPayments)
    );
    expect(markup).not.toContain("53.00 U"); // never substitutes the pre-submit wallet plan
    expect(boundary.mutate).toHaveBeenCalledOnce();
  });
  it("continues shopping in the shared selections mall rather than one fixed brand", () => {
    const cart = paidCart();
    boundary.mutationOptions.onSuccess({
      totalCny: 371,
      orders: [{ orderNo: "UNIT-PAID-ONE" }, { orderNo: "UNIT-PAID-TWO" }],
    });
    const continueShopping = findElement(
      cart.render(),
      node =>
        node.type === "button" &&
        String(node.props.children).trim() === "继续选购"
    );
    continueShopping.props.onClick();
    expect(boundary.navigate).toHaveBeenCalledWith("/p/proj_hzxm2t/limited");
  });
  it("uses response child totals rather than reconstructing them from submitted cart", () => {
    const cart = paidCart();
    boundary.mutationOptions.onSuccess({
      totalCny: 370,
      orders: [
        {
          orderNo: "UNIT-ONE-ONLY",
          groupLabel: "服务端精选名",
          checkoutGroupKey: rice().checkoutGroupKey,
          totalCny: 370,
        },
      ],
    });
    const markup = html(cart.render());
    expect(markup).toContain("已生成 1 张订单");
    expect(markup).toContain("服务端精选名");
    expect(markup).toContain("¥370.00");
    expect(markup).not.toContain("¥228.00");
    expect(markup).not.toContain("¥143.00");
    expect(markup).not.toContain("UNIT-SECOND");
    expect(markup).toContain("实际付款明细待核对");
    expect(markup).not.toContain("0.00 U");
  });
  it("supports legacy orderNo-only response as one order without invented totals/payment", () => {
    const cart = paidCart();
    boundary.mutationOptions.onSuccess({ orderNo: "UNIT-LEGACY" });
    const markup = html(cart.render());
    expect(markup).toContain("已生成 1 张订单");
    expect(markup.match(/aria-label="子订单/g)).toHaveLength(1);
    expect(markup).toContain("UNIT-LEGACY");
    expect(markup).toContain("金额待核对");
    expect(markup).toContain("实际付款明细待核对");
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("¥371.00");
  });
  it.each([{ orders: [] }, { orders: [{}], orderNo: "UNIT-FIRST-COMPAT" }, {}])(
    "does not fabricate successful orders from incomplete response %j",
    response => {
      const cart = paidCart();
      boundary.mutationOptions.onSuccess(response);
      const markup = html(cart.render());
      expect(markup).toContain("订单结果待核对");
      expect(markup).not.toContain("统一付款成功");
      expect(markup).not.toContain("已生成");
      expect(markup).not.toContain('aria-label="子订单');
    }
  );
  it("formats USDT response snapshots at two decimals without changing raw amounts", () => {
    const cart = paidCart();
    const response = {
      orderNo: "UNIT-USDT",
      totalCny: 371,
      walletPayments: [{ assetCode: "USDT", amount: "53.01234567" }],
    };
    const original = JSON.stringify(response);
    boundary.mutationOptions.onSuccess(response);
    expect(html(cart.render())).toContain("53.01 U");
    expect(JSON.stringify(response)).toBe(original);
  });
});

describe("AST contract / mobile layout guardrails", () => {
  it("retains exactly one createCartOrder mutation and the unchanged aggregate input DTO", () => {
    const mutationHooks = walk(
      file,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(file) ===
          "mtrpc.limitedProduct.createCartOrder.useMutation"
    ) as ts.CallExpression[];
    expect(mutationHooks).toHaveLength(1);
    const mutationCalls = walk(
      file,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(file) === "createOrder.mutate"
    ) as ts.CallExpression[];
    expect(mutationCalls).toHaveLength(1);
    const payload = mutationCalls[0].arguments[0] as ts.ObjectLiteralExpression;
    const fields = payload.properties.filter(ts.isPropertyAssignment);
    expect(fields.map(field => field.name.getText(file)).sort()).toEqual(
      [
        "items",
        "receiverName",
        "receiverPhone",
        "receiverAddress",
        "userNote",
        "cnyAmount",
        "paymentAssets",
        "paymentQuoteToken",
      ].sort()
    );
    for (const key of ["paymentAssets", "paymentQuoteToken"])
      expect(
        fields
          .find(field => field.name.getText(file) === key)!
          .initializer.getText(file)
      ).toBe(`payment.${key}`);
    const options = mutationHooks[0].arguments[0] as ts.ObjectLiteralExpression;
    const onSuccess = options.properties.find(
      node =>
        ts.isPropertyAssignment(node) && node.name.getText(file) === "onSuccess"
    )!;
    const onError = options.properties.find(
      node =>
        ts.isPropertyAssignment(node) && node.name.getText(file) === "onError"
    )!;
    expect(
      walk(
        onSuccess,
        node =>
          ts.isCallExpression(node) &&
          node.expression.getText(file) === "clearCart"
      )
    ).toHaveLength(1);
    expect(
      walk(
        onError,
        node =>
          ts.isCallExpression(node) &&
          node.expression.getText(file) === "clearCart"
      )
    ).toHaveLength(0);
    expect(source).not.toMatch(
      /fetch\(|axios\.|quoteAPI|setSuccess\(\{|items\[0\]\.checkoutGroupKey\s*!==/
    );
  });
  it("keeps a single real signed quote wallet integration and no frontend order/amount fabrication", () => {
    expect(
      walk(
        file,
        node =>
          ts.isCallExpression(node) &&
          node.expression.getText(file) === "useMibanMixedPayment"
      )
    ).toHaveLength(1);
    expect(source).toContain("setSuccess(data)");
    expect(source).toContain("success.orders.filter");
    expect(source).toContain("receiptCny(order.totalCny)");
    expect(source).toContain("receiptPaymentSummary(order.walletPayments)");
    expect(source).not.toMatch(
      /success\.deduct(?:Cny|Usdt)|order\.deduct(?:Cny|Usdt)|useMibanUsdtCnyRate\(\)/
    );
  });
  it.each([320, 375, 390, 430])(
    "retains width-adaptive wrapping for %ipx cart/confirmation/receipt",
    width => {
      // Structural CSS guard only; real WebKit screenshot/layout verification is a separate read-only task.
      const cart = setupCart();
      cart.context().addItem(rice());
      cart.context().addItem(aloe());
      const cartMarkup = html(cart.open());
      const confirmationMarkup = html(cart.confirm());
      expect(width).toBeLessThanOrEqual(480);
      for (const markup of [cartMarkup, confirmationMarkup]) {
        expect(markup).toContain("max-w-[480px]");
        expect(markup).toContain("min-w-0");
        expect(markup).toContain("flex-wrap");
        expect(markup).toContain("break-words");
        expect(markup).toContain("break-all");
        expect(markup).not.toMatch(/min-w-\[(?:3[2-9]\d|4\d\d)px\]/);
      }
      expect(cartMarkup).toContain("h-14 w-14 shrink-0");
      expect(cartMarkup).toContain("min-[390px]:h-18");
      expect(confirmationMarkup).toContain("min-h-0");
      expect(confirmationMarkup).toContain("overflow-y-auto");
    }
  );
});
