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
  freshQuote: null as any,
  refetch: vi.fn(),
  invoiceSupport: vi.fn(),
  invoiceAccess: vi.fn(),
  invoiceRouteAvailable: true,
  mutate: vi.fn(),
  quoteQuery: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
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
      limitedProduct: boundary.invoiceRouteAvailable
        ? {
            get invoiceSupport() {
              boundary.invoiceAccess();
              return { fetch: boundary.invoiceSupport };
            },
          }
        : {},
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
    auth: {
      me: {
        useQuery: () => ({ data: { name: "隔离测试用户", avatar: null } }),
      },
    },
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
    info: boundary.toastInfo,
    message: vi.fn(),
  },
}));
import {
  LimitedProductCartProvider,
  type LimitedCartItem,
} from "../client/src/pages/miban/LimitedProductCart";

const STORAGE_KEY = "miban-limited-product-cart-v1";
const NOW = Date.parse("2026-11-22T04:00:00.000Z");
function fixtureQuote(
  quoteToken = "isolated-snapshot-signature",
  quotedAt = NOW
): MibanWalletPaymentQuote {
  const at = new Date(quotedAt).toISOString();
  return {
    quoteToken,
    quotedAt: at,
    expiresAt: new Date(quotedAt + 60_000).toISOString(),
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
function cartPayment(
  cart: ReturnType<typeof setupCart>,
  element = cart.render()
) {
  return findElement(
    element,
    node =>
      typeof node.type === "function" &&
      ["MibanWalletAvailableSummary", "MibanPaymentConfirmation"].includes(
        node.type.name
      )
  ).props.payment;
}
function walletPopup(element: any) {
  return findElement(
    element,
    node => node.props["data-testid"] === "cart-wallet-confirmation"
  );
}
function goPayButton(cart: ReturnType<typeof setupCart>) {
  return findElement(
    cart.render(),
    node =>
      node.type === "button" && String(node.props.children).startsWith("去支付")
  );
}
function openWallet(cart: ReturnType<typeof setupCart>) {
  if (!walletPopup(cart.render())) {
    const button = goPayButton(cart);
    expect(button.props.disabled, cartPayment(cart).statusMessage).toBe(false);
    button.props.onClick();
    cart.render();
  }
  const element = cart.render();
  expect(walletPopup(element)).toBeDefined();
  return element;
}
function paymentConfirmButton(cart: ReturnType<typeof setupCart>) {
  const element = openWallet(cart);
  const pay = findElement(
    walletPopup(element),
    node =>
      node.type === "button" &&
      String(node.props.children).startsWith("确认支付")
  );
  expect(pay.props.disabled).toBe(false);
  return { pay, payment: cartPayment(cart, element) };
}
async function clickPay(cart: ReturnType<typeof setupCart>) {
  const { pay } = paymentConfirmButton(cart);
  await pay.props.onClick();
  cart.render();
}
function delayedRefetch() {
  let resolve!: (result: {
    data: MibanWalletPaymentQuote;
    isError: false;
  }) => void;
  const promise = new Promise<{
    data: MibanWalletPaymentQuote;
    isError: false;
  }>(done => {
    resolve = done;
  });
  boundary.refetch.mockImplementationOnce(() => promise);
  return (data = boundary.freshQuote) => resolve({ data, isError: false });
}
function html(element: any) {
  return renderToStaticMarkup(element);
}
// Render inside actual React SSR so useId/Radix Switch stay real; only expose the
// component's event tree for isolated callback dispatch, never mount DOM/network.
function componentTree(element: any) {
  let tree: any;
  function Probe() {
    tree = element.type(element.props);
    return tree;
  }
  html(React.createElement(Probe));
  return tree;
}
function invoiceForm(cart: ReturnType<typeof setupCart>) {
  return findElement(
    cart.render(),
    node =>
      typeof node.type === "function" &&
      node.type.name === "MibanInvoiceRequestForm"
  );
}
function invoiceTree(cart: ReturnType<typeof setupCart>) {
  return componentTree(invoiceForm(cart));
}
function setInvoiceEnabled(
  cart: ReturnType<typeof setupCart>,
  enabled: boolean
) {
  findElement(
    invoiceTree(cart),
    node =>
      node.props["aria-label"] === "索取发票" &&
      typeof node.props.onCheckedChange === "function"
  ).props.onCheckedChange(enabled);
  cart.render();
}
function chooseInvoiceType(
  cart: ReturnType<typeof setupCart>,
  type: "personal" | "company"
) {
  findElement(
    invoiceTree(cart),
    node =>
      node.type === "button" &&
      node.props.children === (type === "personal" ? "个人" : "公司")
  ).props.onClick();
  cart.render();
}
function setInvoiceField(
  cart: ReturnType<typeof setupCart>,
  field: "title" | "taxNo",
  value: string
) {
  findElement(
    invoiceTree(cart),
    node =>
      node.type === "input" &&
      String(node.props.id).endsWith(field === "title" ? "-title" : "-tax-no")
  ).props.onChange({ target: { value } });
  cart.render();
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

function expectPreparedPaymentContract(
  page: ts.SourceFile,
  mutation: ts.CallExpression,
  paymentName: string
) {
  let payload: ts.Expression = mutation.arguments[0];
  if (ts.isIdentifier(payload)) {
    const declaration = walk(
      page,
      node =>
        ts.isVariableDeclaration(node) &&
        node.name.getText(page) === payload.getText(page)
    ) as ts.VariableDeclaration[];
    expect(declaration).toHaveLength(1);
    payload = declaration[0].initializer as ts.ObjectLiteralExpression;
  }
  expect(ts.isObjectLiteralExpression(payload)).toBe(true);
  if (!ts.isObjectLiteralExpression(payload))
    throw new Error("Payment DTO must be an object");
  const fields = payload.properties.filter(ts.isPropertyAssignment);
  const preparedSpread = payload.properties.some(
    property =>
      ts.isSpreadAssignment(property) &&
      property.expression.getText(page) === "preparedPayment"
  );
  for (const key of ["cnyAmount", "paymentAssets", "paymentQuoteToken"]) {
    if (!preparedSpread)
      expect(
        fields
          .find(field => field.name.getText(page) === key)
          ?.initializer.getText(page)
      ).toBe(`preparedPayment.${key}`);
  }
  let handler: ts.Node | undefined = mutation.parent;
  while (
    handler &&
    !ts.isArrowFunction(handler) &&
    !ts.isFunctionExpression(handler) &&
    !ts.isFunctionDeclaration(handler)
  ) {
    handler = handler.parent;
  }
  expect(handler).toBeDefined();
  const paymentHandler = handler as ts.ArrowFunction;
  expect(
    paymentHandler.modifiers?.some(
      modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword
    )
  ).toBe(true);
  // Preparation and cancellation guard may live inside try/finally and combine scope/attempt guards.
  const prepares = walk(
    paymentHandler.body,
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(page) === "preparedPayment" &&
      Boolean(node.initializer) &&
      ts.isAwaitExpression(node.initializer!) &&
      ts.isCallExpression(node.initializer!.expression) &&
      node.initializer!.expression.expression.getText(page) ===
        `${paymentName}.preparePayment` &&
      node.initializer!.expression.arguments.length === 0
  );
  expect(prepares).toHaveLength(1);
  const guards = walk(
    paymentHandler.body,
    node =>
      ts.isIfStatement(node) &&
      walk(
        node.expression,
        expression =>
          ts.isPrefixUnaryExpression(expression) &&
          expression.operator === ts.SyntaxKind.ExclamationToken &&
          expression.operand.getText(page) === "preparedPayment"
      ).length > 0 &&
      walk(
        node.thenStatement,
        statement => ts.isReturnStatement(statement) && !statement.expression
      ).length > 0
  );
  expect(
    guards.some(
      guard =>
        guard.getStart(page) > prepares[0].getStart(page) &&
        guard.end < mutation.getStart(page)
    )
  ).toBe(true);
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
  boundary.invoiceRouteAvailable = true;
  boundary.invoiceSupport
    .mockReset()
    .mockResolvedValue({ supported: true, version: 1 });
  boundary.invoiceAccess.mockReset();
  boundary.freshQuote = fixtureQuote("isolated-fresh-signature");
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
  boundary.toastInfo.mockReset();
  boundary.refetch.mockReset().mockImplementation(async () => ({
    data: boundary.freshQuote,
    isError: false,
  }));
  boundary.quoteQuery.mockReset().mockImplementation(() => ({
    data: boundary.quote,
    isSuccess: true,
    isError: false,
    isFetching: false,
    refetch: boundary.refetch,
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
    const confirmation = cart.confirm();
    const allocation = findElement(
      confirmation,
      node =>
        typeof node.type === "function" &&
        node.type.name === "MibanWalletAvailableSummary"
    );
    expect(allocation.props.payment.selectedDigitalCode).toBe("ETH");
    allocation.props.payment.useOnlyAsset("USDT");
    const markup = html(cart.render());
    for (const item of [rice(), aloe()])
      expect(markup).toContain(
        `data-testid="confirmation-group-${item.checkoutGroupKey}"`
      );
    expect(markup).toContain('data-testid="confirmation-split-order-notice"');
    expect(markup).toContain("统一付款，按精选生成2张订单");
    expect(markup).not.toContain("已生成");
    expect(markup.match(/收货地址<\/div>/g)).toHaveLength(1);
    expect(markup.match(/钱包可用余额<\/h3>/g)).toHaveLength(1);
    expect(markup).toContain('data-payment-selection-heading="true"');
    expect(markup).toContain('aria-label="使用ETH支付"');
    expect(markup).toContain("统一应付");
    expect(markup).toContain("53.00");
    expect(markup).toContain("¥371.00");
    expect(markup).toContain("594.95 U");
    expect(markup).not.toContain("冻结 1.12");
    expect(boundary.mutate).not.toHaveBeenCalled();
  });
  it("captures one fresh signed payment input for all groups and never clears before success", async () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    const confirmation = cart.confirm();
    findElement(
      confirmation,
      node =>
        typeof node.type === "function" &&
        node.type.name === "MibanWalletAvailableSummary"
    ).props.payment.useOnlyAsset("USDT");
    cart.render();
    await clickPay(cart);
    expect(boundary.mutate).toHaveBeenCalledOnce();
    expect(boundary.refetch).toHaveBeenCalledOnce();
    expect(boundary.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    const input = boundary.mutate.mock.calls[0][0];
    expect(input.items).toEqual(
      [rice(), aloe()].map(({ productKey, skuId, quantity }) => ({
        productKey,
        skuId,
        quantity,
      }))
    );
    expect(input.paymentAssets).toEqual([{ assetCode: "USDT", amount: "53" }]);
    expect(input.cnyAmount).toBe(0);
    expect(input.paymentQuoteToken).toBe(boundary.freshQuote.quoteToken);
    expect(input.paymentQuoteToken).not.toBe(boundary.quote.quoteToken);
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
  it("preserves the digital-coin dropdown and raw ETH/fresh token across two-group checkout", async () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    boundary.quote.assets.push({
      assetCode: "BNB",
      assetName: "BNB",
      available: "0.1",
      frozen: "0",
      priceCny: "4200",
      priceUsdt: "600",
      priceUpdatedAt: new Date(NOW).toISOString(),
    });
    boundary.freshQuote.assets.push({ ...boundary.quote.assets.at(-1) });
    let element = cart.confirm();
    let allocationElement = findElement(
      element,
      node =>
        typeof node.type === "function" &&
        node.type.name === "MibanWalletAvailableSummary"
    );
    let payment = allocationElement.props.payment;
    const allocation = {
      render: () =>
        componentTree(React.createElement(allocationElement.type, { payment })),
    };
    const select = findElement(
      allocation.render(),
      node =>
        node.type === "select" && node.props["aria-label"] === "选择支付币种"
    );
    select.props.onChange({ target: { value: "ETH" } });
    element = cart.render();
    allocationElement = findElement(
      element,
      node =>
        typeof node.type === "function" &&
        node.type.name === "MibanWalletAvailableSummary"
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
    await clickPay(cart);
    expect(boundary.mutate).toHaveBeenCalledOnce();
    expect(boundary.refetch).toHaveBeenCalledOnce();
    expect(boundary.mutate.mock.calls[0][0].paymentAssets).toEqual([
      { assetCode: "ETH", amount: "0.0265" },
    ]);
    expect(boundary.mutate.mock.calls[0][0].paymentQuoteToken).toBe(
      boundary.freshQuote.quoteToken
    );
    expect(cart.context().items).toHaveLength(2);
  });
  it("blocks missing address, invalid phone and pending duplicate clicks before opening wallet/refetch", async () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    boundary.addresses = [];
    cart.confirm();
    await goPayButton(cart).props.onClick();
    expect(walletPopup(cart.render())).toBeUndefined();
    expect(boundary.toastError).toHaveBeenLastCalledWith("请先选择收货地址");
    boundary.addresses = [
      { id: 1, name: "单元测试", phone: "invalid", is_default: 1 },
    ];
    cart.render();
    cart.render();
    await goPayButton(cart).props.onClick();
    expect(walletPopup(cart.render())).toBeUndefined();
    expect(boundary.toastError).toHaveBeenCalled();
    boundary.addresses = [
      { id: 1, name: "单元测试", phone: "13800138000", is_default: 1 },
    ];
    cart.render();
    cart.render();
    boundary.pending = true;
    const pay = findElement(
      cart.render(),
      node =>
        node.type === "button" &&
        String(node.props.className).includes("disabled:bg-gray-300")
    );
    expect(pay.props.disabled).toBe(true);
    await pay.props.onClick();
    expect(walletPopup(cart.render())).toBeUndefined();
    expect(boundary.mutate).not.toHaveBeenCalled();
    expect(boundary.refetch).not.toHaveBeenCalled();
    expect(boundary.invoiceSupport).not.toHaveBeenCalled();
    expect(cart.context().items).toHaveLength(2);
  });
  it("keeps the displayed snapshot fixed without polling or adopting shared query updates", async () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    cart.confirm();
    paymentConfirmButton(cart);
    const original = cartPayment(cart);
    boundary.quote = fixtureQuote("unreviewed-cache-signature", NOW + 60_001);
    boundary.quote.assets.find((row: any) => row.assetCode === "ETH").priceCny =
      "14001";
    await vi.advanceTimersByTimeAsync(60_001);
    const payment = cartPayment(cart);
    expect(payment.paymentAssets).toEqual(original.paymentAssets);
    expect(payment.quotedAt).toBe(original.quotedAt);
    expect(payment.reviewed).toBe(false);
    expect(payment.quoteExpired).toBe(true);
    expect(payment.paymentQuoteToken).toBe("");
    expect(payment.canPay).toBe(true); // only permission to start verification
    expect(boundary.refetch).not.toHaveBeenCalled();
    expect(boundary.mutate).not.toHaveBeenCalled();
    for (const [, options] of boundary.quoteQuery.mock.calls) {
      expect(options).toMatchObject({
        refetchInterval: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
      });
    }
  });
  it("allows an expired old snapshot to obtain fresh payment but never returns the old DTO", async () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    cart.confirm();
    paymentConfirmButton(cart);
    vi.setSystemTime(NOW + 60_001);
    boundary.freshQuote = fixtureQuote(
      "isolated-post-expiry-signature",
      Date.now()
    );
    const { pay, payment } = paymentConfirmButton(cart);
    expect(payment.quoteExpired).toBe(true);
    expect(payment.paymentQuoteToken).toBe("");
    expect(payment.canPay).toBe(true);
    const prepare = vi.spyOn(payment, "preparePayment");
    await pay.props.onClick();
    await expect(prepare.mock.results[0].value).resolves.toEqual({
      cnyAmount: 0,
      paymentAssets: [{ assetCode: "ETH", amount: "0.0265" }],
      paymentQuoteToken: boundary.freshQuote.quoteToken,
    });
    expect(boundary.refetch).toHaveBeenCalledOnce();
    expect(boundary.mutate).toHaveBeenCalledOnce();
    expect(boundary.mutate.mock.calls[0][0].paymentQuoteToken).toBe(
      boundary.freshQuote.quoteToken
    );
    expect(boundary.mutate.mock.calls[0][0].paymentQuoteToken).not.toBe(
      boundary.quote.quoteToken
    );
    expect(cart.context().items).toHaveLength(2);
  });
  it("returns null without mutation when the fresh response expires during delayed refetch", async () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    cart.confirm();
    const finishRefetch = delayedRefetch();
    const { pay, payment } = paymentConfirmButton(cart);
    const prepare = vi.spyOn(payment, "preparePayment");
    const request = pay.props.onClick();
    expect(boundary.refetch).toHaveBeenCalledOnce();
    expect(boundary.mutate).not.toHaveBeenCalled();
    vi.setSystemTime(NOW + 60_001);
    finishRefetch();
    await request;
    await expect(prepare.mock.results[0].value).resolves.toBeNull();
    const latest = cartPayment(cart);
    expect(latest.reviewed).toBe(false);
    expect(latest.canPay).toBe(false);
    expect(latest.paymentQuoteToken).toBe("");
    expect(boundary.mutate).not.toHaveBeenCalled();
    expect(cart.context().items).toHaveLength(2);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toHaveLength(
      2
    );
  });
  it.each(["ETH", "USDT"])(
    "does not mutate or silently use another coin when latest %s available balance is insufficient",
    async code => {
      const cart = setupCart();
      cart.context().addItem(rice());
      cart.context().addItem(aloe());
      cart.confirm();
      cartPayment(cart).useOnlyAsset(code);
      boundary.freshQuote.assets.find(
        (row: any) => row.assetCode === code
      ).available = code === "ETH" ? "0.001" : "1";
      const { pay, payment } = paymentConfirmButton(cart);
      const prepare = vi.spyOn(payment, "preparePayment");
      await pay.props.onClick();
      await expect(prepare.mock.results[0].value).resolves.toBeNull();
      const latest = cartPayment(cart);
      expect(latest.selectedCodes).toEqual([code]);
      expect(latest.reviewed).toBe(false);
      expect(latest.canPay).toBe(false);
      expect(Number(latest.remainingCny)).toBeGreaterThan(0);
      expect(latest.statusMessage).toContain("最新可用余额或行情不足");
      expect(latest.paymentAssets.map((row: any) => row.assetCode)).toEqual([
        code,
      ]);
      expect(boundary.refetch).toHaveBeenCalledOnce();
      expect(boundary.mutate).not.toHaveBeenCalled();
      expect(cart.context().items).toHaveLength(2);
    }
  );
  it("requires a second explicit confirmation when raw USDT changes despite unchanged two-decimal display, then uses the same quote without a refresh loop", async () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    cart.confirm();
    cartPayment(cart).useOnlyAsset("USDT");
    const original = cartPayment(cart);
    expect(original.paymentAssets).toEqual([
      { assetCode: "USDT", amount: "53" },
    ]);
    expect(original.paymentSummary).toBe("53.00 U");
    boundary.freshQuote.usdtCnyRate = "7.0001";
    boundary.freshQuote.assets.find(
      (row: any) => row.assetCode === "USDT"
    ).priceCny = "7.0001";
    const { pay, payment } = paymentConfirmButton(cart);
    const prepare = vi.spyOn(payment, "preparePayment");
    await pay.props.onClick();
    await expect(prepare.mock.results[0].value).resolves.toBeNull();
    const changed = cartPayment(cart);
    const freshAssets = [{ assetCode: "USDT", amount: "52.99924287" }];
    expect(changed.paymentAssets).toEqual(freshAssets);
    expect(changed.paymentAssets).not.toEqual(original.paymentAssets);
    expect(changed.paymentSummary).toBe(original.paymentSummary);
    expect(changed.paymentQuoteToken).toBe(boundary.freshQuote.quoteToken);
    expect(changed.reviewed).toBe(false);
    expect(changed.canPay).toBe(true);
    expect(changed.statusMessage).toContain("报价已更新，请确认本次付款金额");
    expect(boundary.mutate).not.toHaveBeenCalled();
    expect(boundary.refetch).toHaveBeenCalledOnce();
    expect(html(walletPopup(cart.render()))).toContain("52.99924287");
    // A newly issued but unreviewed cache response must not replace the staged quote.
    boundary.quote = fixtureQuote("must-not-replace-reviewed-fresh-signature");
    await clickPay(cart);
    expect(boundary.refetch).toHaveBeenCalledOnce();
    expect(boundary.mutate).toHaveBeenCalledOnce();
    expect(boundary.mutate.mock.calls[0][0].paymentAssets).toEqual(freshAssets);
    expect(boundary.mutate.mock.calls[0][0].paymentQuoteToken).toBe(
      boundary.freshQuote.quoteToken
    );
    expect(cart.context().items).toHaveLength(2);
  });
  it("retains all 18 native ETH decimals after changed-quote second confirmation and submits just once", async () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    cart.confirm();
    expect(cartPayment(cart).selectedDigitalCode).toBe("ETH");
    boundary.freshQuote.assets.find(
      (row: any) => row.assetCode === "ETH"
    ).priceCny = "14001";
    await clickPay(cart);
    const native = "0.026498107278051568";
    const changed = cartPayment(cart);
    expect(changed.paymentAssets).toEqual([
      { assetCode: "ETH", amount: native },
    ]);
    expect(changed.paymentSummary).toBe(`${native} ETH`);
    expect(changed.reviewed).toBe(false);
    expect(boundary.mutate).not.toHaveBeenCalled();
    await clickPay(cart);
    expect(boundary.refetch).toHaveBeenCalledOnce();
    expect(boundary.mutate).toHaveBeenCalledOnce();
    expect(boundary.mutate.mock.calls[0][0].paymentAssets).toEqual([
      { assetCode: "ETH", amount: native },
    ]);
    expect(boundary.mutate.mock.calls[0][0].paymentQuoteToken).toBe(
      boundary.freshQuote.quoteToken
    );
    expect(cart.context().items).toHaveLength(2);
  });
  it.each(["cancel", "back", "close"])(
    "never mutates after %s during delayed fresh refetch, including late response after reopening",
    async action => {
      const cart = setupCart();
      cart.context().addItem(rice());
      cart.context().addItem(aloe());
      cart.confirm();
      const finishRefetch = delayedRefetch();
      const { pay, payment } = paymentConfirmButton(cart);
      const prepare = vi.spyOn(payment, "preparePayment");
      const request = pay.props.onClick();
      const busyElement = cart.render();
      expect(cartPayment(cart, busyElement).refreshing).toBe(true);
      expect(cartPayment(cart, busyElement).canPay).toBe(false);
      expect(boundary.refetch).toHaveBeenCalledOnce();
      expect(boundary.mutate).not.toHaveBeenCalled();
      if (action === "cancel") {
        cartPayment(cart, busyElement).cancelPendingPayment();
        cart.render();
      } else if (action === "back") {
        await findElement(
          busyElement,
          node =>
            node.type === "button" &&
            node.props["aria-label"] === "返回确认订单"
        ).props.onClick();
        expect(walletPopup(cart.render())).toBeUndefined();
        expect(html(cart.render())).toContain("确认订单");
      } else {
        cart.context().closeCart();
        expect(cart.render()).toBeNull();
        cart.open(); // returning cannot resurrect the cancelled request
      }
      finishRefetch();
      await request;
      await expect(prepare.mock.results[0].value).resolves.toBeNull();
      cart.render();
      expect(boundary.refetch).toHaveBeenCalledOnce();
      expect(boundary.mutate).not.toHaveBeenCalled();
      expect(cart.context().items).toHaveLength(2);
      expect(
        JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
      ).toHaveLength(2);
    }
  );
  it("blocks duplicate confirmation clicks while fresh refetch is delayed and does not clear cart", async () => {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    cart.confirm();
    const finishRefetch = delayedRefetch();
    const { pay } = paymentConfirmButton(cart);
    const request = pay.props.onClick();
    await pay.props.onClick(); // same render closure must also be safe
    const busyElement = cart.render();
    const busyPay = findElement(
      walletPopup(busyElement),
      node =>
        node.type === "button" &&
        String(node.props.className).includes("disabled:bg-gray-300")
    );
    expect(busyPay.props.disabled).toBe(true);
    await busyPay.props.onClick();
    expect(boundary.refetch).toHaveBeenCalledOnce();
    expect(boundary.mutate).not.toHaveBeenCalled();
    expect(cart.context().items).toHaveLength(2);
    finishRefetch();
    await request;
    expect(boundary.mutate).toHaveBeenCalledOnce();
    expect(boundary.mutate.mock.calls[0][0].paymentQuoteToken).toBe(
      boundary.freshQuote.quoteToken
    );
    expect(cart.context().items).toHaveLength(2);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toHaveLength(
      2
    );
  });
});

describe("two-step checkout / invoice capability and async scope safety (isolated boundaries only)", () => {
  function confirmedCart() {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    cart.confirm();
    return cart;
  }
  function personalInvoice(cart: ReturnType<typeof setupCart>) {
    setInvoiceEnabled(cart, true);
    setInvoiceField(cart, "title", "  单元测试个人  ");
  }
  function deferredCapability() {
    let resolve!: (support: unknown) => void;
    const promise = new Promise<unknown>(done => {
      resolve = done;
    });
    boundary.invoiceSupport.mockImplementationOnce(() => promise);
    return resolve;
  }
  it("does not prepare from a stale confirmation button after returning to checkout", async () => {
    const cart = confirmedCart();
    const { pay, payment } = paymentConfirmButton(cart);
    const prepare = vi.spyOn(payment, "preparePayment");
    findElement(
      walletPopup(cart.render()),
      node => node.props["aria-label"] === "返回确认订单"
    ).props.onClick();
    cart.render();
    await pay.props.onClick();
    expect(prepare).not.toHaveBeenCalled();
    expect(boundary.refetch).not.toHaveBeenCalled();
    expect(boundary.mutate).not.toHaveBeenCalled();
    expect(walletPopup(cart.render())).toBeUndefined();
  });
  it("revalidates invoice on confirm, returns invalid company invoice to checkout without any requests", async () => {
    const cart = confirmedCart();
    personalInvoice(cart);
    openWallet(cart);
    // Isolated parent-state change simulates a stale invalid draft before final click.
    invoiceForm(cart).props.onChange({
      enabled: true,
      type: "company",
      title: "未完成公司",
      taxNo: "",
    });
    cart.render();
    const { pay, payment } = paymentConfirmButton(cart);
    const prepare = vi.spyOn(payment, "preparePayment");
    await pay.props.onClick();
    cart.render();
    expect(walletPopup(cart.render())).toBeUndefined();
    expect(invoiceForm(cart).props.errors.taxNo).toBe("请填写公司税号");
    expect(prepare).not.toHaveBeenCalled();
    expect(boundary.invoiceSupport).not.toHaveBeenCalled();
    expect(boundary.refetch).not.toHaveBeenCalled();
    expect(boundary.mutate).not.toHaveBeenCalled();
    expect(cart.context().items).toHaveLength(2);
  });
  it("retries invoice capability uncached after failure and only then prepares one payment", async () => {
    const cart = confirmedCart();
    personalInvoice(cart);
    boundary.invoiceSupport.mockRejectedValueOnce(
      new Error("isolated first capability failure")
    );
    await clickPay(cart);
    expect(boundary.refetch).not.toHaveBeenCalled();
    expect(boundary.mutate).not.toHaveBeenCalled();
    expect(invoiceForm(cart).props.draft.enabled).toBe(true);
    await clickPay(cart);
    expect(boundary.invoiceSupport).toHaveBeenCalledTimes(2);
    for (const args of boundary.invoiceSupport.mock.calls)
      expect(args).toEqual([undefined, { staleTime: 0, retry: false }]);
    expect(boundary.refetch).toHaveBeenCalledOnce();
    expect(boundary.mutate).toHaveBeenCalledOnce();
    expect(cart.context().items).toHaveLength(2);
  });
  it("opens wallet only on 去支付 without fresh quote/prepare/mutate or review approval, and popup is read-only", async () => {
    const cart = confirmedCart();
    expect(invoiceForm(cart).props.draft).toEqual({
      enabled: false,
      type: "personal",
      title: "个人",
      taxNo: "",
    });
    expect(walletPopup(cart.render())).toBeUndefined();
    expect(
      findElement(
        cart.render(),
        node =>
          typeof node.type === "function" &&
          node.type.name === "MibanWalletAvailableSummary"
      )
    ).toBeDefined();
    expect(
      findElement(
        cart.render(),
        node =>
          typeof node.type === "function" &&
          node.type.name === "MibanPaymentConfirmation"
      )
    ).toBeUndefined();
    const prepare = vi.spyOn(cartPayment(cart), "preparePayment");
    const review = vi.spyOn(cartPayment(cart), "confirmPaymentReview");
    openWallet(cart);
    expect(prepare).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(boundary.refetch).not.toHaveBeenCalled();
    expect(boundary.invoiceSupport).not.toHaveBeenCalled();
    expect(boundary.mutate).not.toHaveBeenCalled();
    const popup = walletPopup(cart.render());
    expect(
      findElement(
        popup,
        node =>
          typeof node.type === "function" &&
          node.type.name === "MibanPaymentConfirmation"
      )
    ).toBeDefined();
    expect(
      findElement(
        popup,
        node =>
          typeof node.type === "function" &&
          node.type.name === "MibanCheckoutConfirmationDetails"
      )
    ).toBeDefined();
    expect(
      findElement(
        popup,
        node =>
          typeof node.type === "function" &&
          ["MibanWalletAvailableSummary", "MibanInvoiceRequestForm"].includes(
            node.type.name
          )
      )
    ).toBeUndefined();
    const markup = html(popup);
    expect(markup).toContain("0.0265 ETH");
    expect(markup).toContain("不索取发票");
    expect(markup).toContain("北京市朝阳区单元测试地址");
    expect(markup).toContain('aria-label="返回确认订单"');
    expect(markup).not.toMatch(
      /<select|<input|<textarea|<details|type="checkbox"|核对明细|选择币种|刷新钱包可用余额/
    );
    await clickPay(cart);
    expect(boundary.refetch).toHaveBeenCalledOnce();
    expect(boundary.mutate).toHaveBeenCalledOnce();
    expect(boundary.invoiceSupport).not.toHaveBeenCalled();
    expect(boundary.invoiceAccess).not.toHaveBeenCalled();
  });
  it("uses real invoice Switch/type events, clears old company fields when changing type or disabling", async () => {
    const cart = confirmedCart();
    setInvoiceEnabled(cart, true);
    expect(invoiceForm(cart).props.draft).toMatchObject({
      enabled: true,
      type: "personal",
      title: "个人",
      taxNo: "",
    });
    chooseInvoiceType(cart, "company");
    expect(invoiceForm(cart).props.draft).toMatchObject({
      type: "company",
      title: "",
      taxNo: "",
    });
    setInvoiceField(cart, "title", "历史公司");
    setInvoiceField(cart, "taxNo", "OLD-TAX-123");
    chooseInvoiceType(cart, "personal");
    expect(invoiceForm(cart).props.draft).toEqual({
      enabled: true,
      type: "personal",
      title: "个人",
      taxNo: "",
    });
    expect(html(invoiceForm(cart))).not.toContain("请输入公司税号");
    chooseInvoiceType(cart, "company");
    setInvoiceField(cart, "title", "关闭的历史公司");
    setInvoiceEnabled(cart, false);
    expect(invoiceForm(cart).props.draft).toEqual({
      enabled: false,
      type: "personal",
      title: "个人",
      taxNo: "",
    });
    expect(html(invoiceForm(cart))).not.toContain("发票类型");
    boundary.invoiceRouteAvailable = false;
    await clickPay(cart);
    expect(boundary.mutate.mock.calls[0][0]).not.toHaveProperty(
      "invoiceRequest"
    );
    expect(boundary.invoiceSupport).not.toHaveBeenCalled();
  });
  it("does not open popup for company without tax number, and preserves draft on address updates", async () => {
    const cart = confirmedCart();
    setInvoiceEnabled(cart, true);
    chooseInvoiceType(cart, "company");
    setInvoiceField(cart, "title", "单元测试公司");
    await goPayButton(cart).props.onClick();
    expect(walletPopup(cart.render())).toBeUndefined();
    expect(invoiceForm(cart).props.errors.taxNo).toBe("请填写公司税号");
    expect(html(invoiceForm(cart))).toContain('aria-invalid="true"');
    expect(boundary.refetch).not.toHaveBeenCalled();
    expect(boundary.invoiceSupport).not.toHaveBeenCalled();
    expect(boundary.mutate).not.toHaveBeenCalled();
    boundary.addresses = [{ ...boundary.addresses[0], detail: "更换后地址" }];
    cart.render();
    cart.render();
    expect(invoiceForm(cart).props.draft).toMatchObject({
      enabled: true,
      type: "company",
      title: "单元测试公司",
    });
  });
  it.each([1, 2])(
    "submits personal invoice after real-time supported capability v%i, stripping any old tax number",
    async version => {
      const cart = confirmedCart();
      personalInvoice(cart);
      boundary.invoiceSupport.mockResolvedValue({ supported: true, version });
      // Legacy company tax values cannot enter a personal request, even at the boundary.
      invoiceForm(cart).props.onChange({
        ...invoiceForm(cart).props.draft,
        taxNo: "STALE-COMPANY-TAX",
      });
      cart.render();
      const popup = openWallet(cart);
      expect(html(walletPopup(popup))).toContain("单元测试个人");
      expect(html(walletPopup(popup))).not.toContain("STALE-COMPANY-TAX");
      expect(boundary.invoiceSupport).not.toHaveBeenCalled();
      await clickPay(cart);
      expect(boundary.invoiceSupport).toHaveBeenCalledOnce();
      expect(boundary.invoiceSupport).toHaveBeenCalledWith(
        undefined,
        { staleTime: 0, retry: false }
      );
      expect(boundary.invoiceSupport.mock.invocationCallOrder[0]).toBeLessThan(
        boundary.refetch.mock.invocationCallOrder[0]
      );
      expect(boundary.mutate).toHaveBeenCalledOnce();
      expect(boundary.mutate.mock.calls[0][0].invoiceRequest).toEqual({
        type: "personal",
        title: "单元测试个人",
      });
      expect(cart.context().items).toHaveLength(2);
    }
  );
  it("submits trimmed company invoice and raw signed allocation together, then keeps cart on error", async () => {
    const cart = confirmedCart();
    setInvoiceEnabled(cart, true);
    chooseInvoiceType(cart, "company");
    setInvoiceField(cart, "title", "  隔离公司  ");
    setInvoiceField(cart, "taxNo", "  TAX-CASE-Abc  ");
    expect(html(walletPopup(openWallet(cart)))).toContain("TAX-CASE-Abc");
    await clickPay(cart);
    expect(boundary.mutate.mock.calls[0][0]).toMatchObject({
      invoiceRequest: {
        type: "company",
        title: "隔离公司",
        taxNo: "TAX-CASE-Abc",
      },
      paymentAssets: [{ assetCode: "ETH", amount: "0.0265" }],
      paymentQuoteToken: boundary.freshQuote.quoteToken,
    });
    boundary.mutationOptions.onError({ message: "发票写入失败" });
    boundary.mutationOptions.onSettled();
    cart.render();
    expect(cart.context().items).toHaveLength(2);
    expect(invoiceForm(cart).props.draft.title).toBe("  隔离公司  ");
  });
  it.each([
    { supported: false, version: 1 },
    { supported: "true", version: 1 },
    { supported: true, version: 0 },
    { supported: true, version: "1" },
    { supported: true },
    null,
    {},
  ])(
    "fails closed for invalid invoice capability %j without prepare/refetch/mutate",
    async support => {
      const cart = confirmedCart();
      personalInvoice(cart);
      boundary.invoiceSupport.mockResolvedValue(support);
      openWallet(cart);
      const { pay, payment } = paymentConfirmButton(cart);
      const prepare = vi.spyOn(payment, "preparePayment");
      await pay.props.onClick();
      cart.render();
      expect(prepare).not.toHaveBeenCalled();
      expect(boundary.refetch).not.toHaveBeenCalled();
      expect(boundary.mutate).not.toHaveBeenCalled();
      expect(boundary.toastInfo).toHaveBeenCalledWith(
        "当前暂无法提交发票申请，请稍后重试；尚未下单或扣款。"
      );
      expect(cart.context().items).toHaveLength(2);
    }
  );
  it.each(["reject", "missing-route"])(
    "blocks enabled invoice on capability %s without prepare/mutate",
    async reason => {
      const cart = confirmedCart();
      personalInvoice(cart);
      if (reason === "reject")
        boundary.invoiceSupport.mockRejectedValue(
          new Error("isolated capability error")
        );
      else boundary.invoiceRouteAvailable = false;
      openWallet(cart);
      const { pay, payment } = paymentConfirmButton(cart);
      const prepare = vi.spyOn(payment, "preparePayment");
      await pay.props.onClick();
      expect(prepare).not.toHaveBeenCalled();
      expect(boundary.refetch).not.toHaveBeenCalled();
      expect(boundary.mutate).not.toHaveBeenCalled();
      expect(boundary.toastInfo).toHaveBeenCalled();
      expect(cart.context().items).toHaveLength(2);
    }
  );
  it("serializes capability and fresh-quote verification; duplicate clicks cannot start either twice", async () => {
    const cart = confirmedCart();
    personalInvoice(cart);
    const finishCapability = deferredCapability();
    const finishQuote = delayedRefetch();
    const { pay } = paymentConfirmButton(cart);
    const request = pay.props.onClick();
    await pay.props.onClick();
    const busy = findElement(
      walletPopup(cart.render()),
      node =>
        node.type === "button" &&
        String(node.props.className).includes("disabled:bg-gray-300")
    );
    expect(busy.props.disabled).toBe(true);
    await busy.props.onClick();
    expect(boundary.invoiceSupport).toHaveBeenCalledOnce();
    expect(boundary.refetch).not.toHaveBeenCalled();
    finishCapability({ supported: true, version: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(boundary.refetch).toHaveBeenCalledOnce();
    await pay.props.onClick();
    finishQuote();
    await request;
    expect(boundary.invoiceSupport).toHaveBeenCalledOnce();
    expect(boundary.mutate).toHaveBeenCalledOnce();
    expect(cart.context().items).toHaveLength(2);
  });
  it.each(["back", "close", "address", "items", "invoice"])(
    "rejects late capability response after %s scope changes, including reopening",
    async change => {
      const cart = confirmedCart();
      personalInvoice(cart);
      const finishCapability = deferredCapability();
      const { pay, payment } = paymentConfirmButton(cart);
      const prepare = vi.spyOn(payment, "preparePayment");
      const request = pay.props.onClick();
      cart.render();
      if (change === "close") {
        cart.context().closeCart();
        cart.render();
        cart.open();
        cart.confirm();
      } else if (change === "address") {
        boundary.addresses = [
          {
            ...boundary.addresses[0],
            phone: "13900139000",
            detail: "scope变更地址",
          },
        ];
        cart.render();
        cart.render();
      } else if (change === "items") {
        cart.context().setQuantity(`${rice().productKey}:${rice().skuId}`, 2);
        cart.render();
        cart.render();
      } else {
        findElement(
          walletPopup(cart.render()),
          node => node.props["aria-label"] === "返回确认订单"
        ).props.onClick();
        cart.render();
        if (change === "invoice") {
          setInvoiceEnabled(cart, false);
          expect(invoiceForm(cart).props.draft.enabled).toBe(false);
        }
        // Reopen while old capability is still outstanding; old attempt must stay cancelled.
        openWallet(cart);
      }
      finishCapability({ supported: true, version: 1 });
      await request;
      expect(prepare).not.toHaveBeenCalled();
      expect(boundary.refetch).not.toHaveBeenCalled();
      expect(boundary.mutate).not.toHaveBeenCalled();
      expect(cart.context().items).toHaveLength(2);
      expect(
        JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
      ).toHaveLength(2);
    }
  );
  it.each(["address", "items", "invoice"])(
    "never submits prepared quote after %s changes while awaiting the quote",
    async change => {
      const cart = confirmedCart();
      personalInvoice(cart);
      const finishQuote = delayedRefetch();
      const { pay } = paymentConfirmButton(cart);
      const request = pay.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
      expect(boundary.refetch).toHaveBeenCalledOnce();
      cart.render();
      if (change === "address") {
        boundary.addresses = [{ ...boundary.addresses[0], detail: "late地址" }];
        cart.render();
        cart.render();
      } else if (change === "items") {
        cart.context().setQuantity(`${rice().productKey}:${rice().skuId}`, 2);
        cart.render();
        cart.render();
      } else {
        findElement(
          walletPopup(cart.render()),
          node => node.props["aria-label"] === "返回确认订单"
        ).props.onClick();
        cart.render();
        setInvoiceEnabled(cart, false);
        expect(invoiceForm(cart).props.draft.enabled).toBe(false);
        // 取消已作废旧请求；仍在返回的报价不能用于新确认，待其结束后可正常重入。
        expect(goPayButton(cart).props.disabled).toBe(true);
      }
      finishQuote();
      await request;
      expect(boundary.mutate).not.toHaveBeenCalled();
      if (change === "invoice") expect(walletPopup(openWallet(cart))).toBeDefined();
      expect(cart.context().items).toHaveLength(2);
    }
  );
  it("resets invoice only when leaving checkout, not when closing the wallet popup", () => {
    const cart = confirmedCart();
    personalInvoice(cart);
    findElement(
      walletPopup(openWallet(cart)),
      node => node.props["aria-label"] === "返回确认订单"
    ).props.onClick();
    cart.render();
    expect(invoiceForm(cart).props.draft).toMatchObject({
      enabled: true,
      title: "  单元测试个人  ",
    });
    findElement(
      cart.render(),
      node => node.props["aria-label"] === "返回购物车"
    ).props.onClick();
    cart.render();
    cart.confirm();
    expect(invoiceForm(cart).props.draft).toEqual({
      enabled: false,
      type: "personal",
      title: "个人",
      taxNo: "",
    });
  });
  it.each([
    "reject",
    "is-error",
    "missing-token",
    "stale-signature",
    "timeout",
  ])(
    "never submits when fresh payment verification fails: %s",
    async failure => {
      const cart = confirmedCart();
      if (failure === "reject")
        boundary.refetch.mockRejectedValueOnce(
          new Error("isolated quote failure")
        );
      if (failure === "is-error")
        boundary.refetch.mockResolvedValueOnce({
          data: boundary.freshQuote,
          isError: true,
        });
      if (failure === "missing-token") boundary.freshQuote.quoteToken = "";
      if (failure === "stale-signature")
        boundary.freshQuote.expiresAt = new Date(NOW - 1).toISOString();
      if (failure === "timeout")
        boundary.refetch.mockImplementationOnce(() => new Promise(() => {}));
      const { pay, payment } = paymentConfirmButton(cart);
      const prepare = vi.spyOn(payment, "preparePayment");
      const request = pay.props.onClick();
      if (failure === "timeout") await vi.advanceTimersByTimeAsync(15_001);
      await request;
      await expect(prepare.mock.results[0].value).resolves.toBeNull();
      expect(cartPayment(cart).canPay).toBe(false);
      expect(boundary.mutate).not.toHaveBeenCalled();
      expect(cart.context().items).toHaveLength(2);
    }
  );
  it("excludes frozen balance from payment even when frozen value could cover all groups", async () => {
    const cart = confirmedCart();
    const frozen = boundary.freshQuote.assets.find(
      (row: any) => row.assetCode === "ETH"
    );
    frozen.available = "0";
    frozen.frozen = "100";
    await clickPay(cart);
    const payment = cartPayment(cart);
    expect(payment.selectedCodes).toEqual(["ETH"]);
    expect(payment.canPay).toBe(false);
    expect(Number(payment.remainingCny)).toBeGreaterThan(0);
    expect(
      payment.allAssetRows.find((row: any) => row.assetCode === "ETH")
        .disabledReason
    ).toContain("冻结");
    expect(boundary.mutate).not.toHaveBeenCalled();
  });
});

describe("truthful aggregate success / native per-order snapshots", () => {
  async function paidCart() {
    const cart = setupCart();
    cart.context().addItem(rice());
    cart.context().addItem(aloe());
    cart.confirm();
    await clickPay(cart);
    return cart;
  }
  it("renders only response child orders and actual snapshot amounts; clears once only after aggregate success", async () => {
    const cart = await paidCart();
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
  it("continues shopping in the shared selections mall rather than one fixed brand", async () => {
    const cart = await paidCart();
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
  it("uses response child totals rather than reconstructing them from submitted cart", async () => {
    const cart = await paidCart();
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
  it("supports legacy orderNo-only response as one order without invented totals/payment", async () => {
    const cart = await paidCart();
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
    async response => {
      const cart = await paidCart();
      boundary.mutationOptions.onSuccess(response);
      const markup = html(cart.render());
      expect(markup).toContain("订单结果待核对");
      expect(markup).not.toContain("统一付款成功");
      expect(markup).not.toContain("已生成");
      expect(markup).not.toContain('aria-label="子订单');
    }
  );
  it("formats USDT response snapshots at two decimals without changing raw amounts", async () => {
    const cart = await paidCart();
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
    expect(ts.isObjectLiteralExpression(payload)).toBe(true);
    expect(
      payload.properties
        .filter(ts.isSpreadAssignment)
        .map(field => field.expression.getText(file))
    ).toEqual(["orderInput", "preparedPayment"]);
    const orderInputs = walk(
      file,
      node =>
        ts.isVariableDeclaration(node) &&
        node.name.getText(file) === "orderInput"
    ) as ts.VariableDeclaration[];
    expect(orderInputs).toHaveLength(1);
    const orderFields = (
      orderInputs[0].initializer as ts.ObjectLiteralExpression
    ).properties.filter(ts.isPropertyAssignment);
    expect(orderFields.map(field => field.name.getText(file)).sort()).toEqual(
      [
        "items",
        "receiverName",
        "receiverPhone",
        "receiverAddress",
        "userNote",
      ].sort()
    );
    expect(orderInputs[0].initializer!.getText(file)).toContain(
      "invoiceRequest"
    );
    expectPreparedPaymentContract(file, mutationCalls[0], "payment");
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
      /(?<![.\w])fetch\(|axios\.|quoteAPI|setSuccess\(\{|items\[0\]\.checkoutGroupKey\s*!==/
    );
  });
  it.each([
    ["LimitedProductCart.tsx", "payment"],
    ["CartDrawer.tsx", "walletPayment"],
    ["DiyWorkshop.tsx", "walletPayment"],
    ["HerbalifeRedGinsengDetail.tsx", "walletPayment"],
    ["TianguiPearDetail.tsx", "walletPayment"],
  ])(
    "requires awaited prepared DTO and null guard before creating orders in %s",
    (name, paymentName) => {
      const pageSource = readFileSync(
        new URL(`../client/src/pages/miban/${name}`, import.meta.url),
        "utf8"
      );
      const page = ts.createSourceFile(
        name,
        pageSource,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      const calls = walk(
        page,
        node =>
          ts.isCallExpression(node) &&
          node.expression.getText(page) === "createOrder.mutate"
      ) as ts.CallExpression[];
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const paymentCalls = calls.filter(call => {
        let handler: ts.Node | undefined = call.parent;
        while (
          handler &&
          !ts.isArrowFunction(handler) &&
          !ts.isFunctionExpression(handler) &&
          !ts.isFunctionDeclaration(handler)
        )
          handler = handler.parent;
        return Boolean(
          handler &&
            handler.getText(page).includes(`${paymentName}.preparePayment`)
        );
      });
      expect(paymentCalls).toHaveLength(1);
      expectPreparedPaymentContract(page, paymentCalls[0], paymentName);
    }
  );
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
