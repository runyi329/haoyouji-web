import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PAYMENT_SCALE,
  buildMibanPaymentPlan,
  paymentDecimalUnits,
  paymentUnitsText,
  type MibanPaymentAsset,
  type MibanWalletPaymentQuote,
} from "../shared/miban-wallet-payment";

// Unit boundary only: replace React hook scheduling and the tRPC query hook.
// Never mock shared payment maths, product catalogs or production/preview amounts.
const boundary = vi.hoisted(() => ({
  active: null as any,
  query: null as any,
  quoteQuery: vi.fn(),
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (initial: any) => boundary.active ? boundary.active.useState(initial) : actual.useState(initial),
    useRef: (initial: any) => boundary.active ? boundary.active.useRef(initial) : actual.useRef(initial),
    useMemo: (fn: any, deps: any) => boundary.active ? boundary.active.useMemo(fn, deps) : actual.useMemo(fn, deps),
    useCallback: (fn: any, deps: any) => boundary.active ? boundary.active.useMemo(() => fn, deps) : actual.useCallback(fn, deps),
    useEffect: (fn: any, deps: any) => boundary.active ? boundary.active.useEffect(fn, deps) : actual.useEffect(fn, deps),
  };
});
vi.mock("../client/src/pages/miban/mibanTrpc", () => ({
  mtrpc: { order: { walletPaymentQuote: { useQuery: boundary.quoteQuery } } },
}));
import {
  MibanMixedPaymentAllocation,
  MibanWalletAvailableSummary,
  useMibanMixedPayment,
  type MibanMixedPayment,
} from "../client/src/pages/miban/MibanMixedPayment";

const NOW = Date.parse("2026-11-22T04:00:00.000Z");
function row(code: string, available = "0", priceCny: string | null = "7", frozen = "0", extra: Partial<MibanPaymentAsset> = {}): MibanPaymentAsset {
  return {
    assetCode: code, assetName: code, available, frozen, priceCny,
    priceUsdt: priceCny === null ? null : paymentUnitsText(paymentDecimalUnits(priceCny) / 7n),
    priceUpdatedAt: new Date(NOW).toISOString(), ...extra,
  };
}
function quote(assets: MibanPaymentAsset[], extra: Partial<MibanWalletPaymentQuote> = {}): MibanWalletPaymentQuote {
  return { quoteToken: "unit-fixture-signature", quotedAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + 60_000).toISOString(), usdtCnyRate: "7", assets, ...extra };
}
function fixture() {
  return quote([
    row("CNY", "14", "1", "900", { priceUsdt: "0.142857142857142857" }),
    row("USDT", "2", "7", "800"),
    row("ETH", "0.02", "14000", "20"),
    row("SOL", "1", "700", "3"),
    row("BNB", "0", "1400"),
    row("DOGE", "15", null),
    row("BTC", "0", "700000", "2"),
    row("NVDA", "100", "700"), // defensive securities exclusion
  ]);
}
const equalDeps = (a: any[] | undefined, b: any[] | undefined) => Boolean(a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
// Minimal isolated hook scheduler; no application, server, network or DOM is started.
function hookHarness<T>(render: () => T) {
  const slots: any[] = [];
  let cursor = 0;
  let pending: (() => void)[] = [];
  const harness = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next: any) => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; }];
    },
    useRef(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(fn: () => any, deps: any[]) {
      const index = cursor++;
      if (!(index in slots) || !equalDeps(slots[index].deps, deps)) slots[index] = { value: fn(), deps };
      return slots[index].value;
    },
    useEffect(fn: () => any, deps: any[]) {
      const index = cursor++;
      if (!(index in slots) || !equalDeps(slots[index].deps, deps)) pending.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: fn() };
      });
    },
    render(): T {
      cursor = 0;
      pending = [];
      boundary.active = harness;
      let result: T;
      try { result = render(); } finally { boundary.active = null; }
      pending.forEach(effect => effect());
      return result!;
    },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()); },
  };
  return harness;
}
const harnesses: ReturnType<typeof hookHarness>[] = [];
function paymentHarness(total = 70, auth = () => true) {
  const harness = hookHarness(() => useMibanMixedPayment(total, auth()));
  harnesses.push(harness);
  return harness;
}
function setQuote(data: MibanWalletPaymentQuote | undefined, state: Record<string, unknown> = {}) {
  boundary.query = { data, isSuccess: Boolean(data), isError: false, isFetching: false, refetch: vi.fn().mockResolvedValue({ data }), ...state };
}
function walk(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (current: ts.Node) => { if (predicate(current)) found.push(current); ts.forEachChild(current, visit); };
  visit(node);
  return found;
}
const source = (name: string) => readFileSync(fileURLToPath(new URL(`../client/src/pages/miban/${name}.tsx`, import.meta.url)), "utf8");
function orderPayload(name: string): ts.ObjectLiteralExpression {
  const text = source(name);
  const file = ts.createSourceFile(`${name}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls = walk(file, node => ts.isCallExpression(node) && node.expression.getText(file) === "createOrder.mutate") as ts.CallExpression[];
  expect(calls).toHaveLength(1);
  expect(ts.isObjectLiteralExpression(calls[0].arguments[0])).toBe(true);
  return calls[0].arguments[0] as ts.ObjectLiteralExpression;
}
function initializer(payload: ts.ObjectLiteralExpression, key: string) {
  const property = payload.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText() === key);
  expect(property, key).toBeDefined();
  return (property as ts.PropertyAssignment).initializer.getText();
}
function findElement(node: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(node)) return node.map(item => findElement(item, predicate)).find(Boolean);
  if (!React.isValidElement(node)) return undefined;
  if (predicate(node)) return node;
  return findElement((node.props as any).children, predicate);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("React", React);
  boundary.quoteQuery.mockReset().mockImplementation(() => boundary.query);
  setQuote(fixture());
});
afterEach(() => {
  harnesses.splice(0).forEach(harness => harness.cleanup());
  boundary.active = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("all-assets payment hook (unit quote fixtures only)", () => {
  it("uses only the authenticated real order quote endpoint and a 15s refresh", () => {
    paymentHarness().render();
    expect(boundary.quoteQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: true, refetchInterval: 15_000, retry: false }));
    const text = source("MibanMixedPayment");
    expect(text).toContain("mtrpc.order.walletPaymentQuote.useQuery");
    expect(text).toContain("buildMibanPaymentPlan");
    expect(text).not.toMatch(/FALLBACK|useMibanUsdtCnyRate|getCnyBalanceSummary\.useQuery|getUsdtBalanceSummary\.useQuery/);
  });
  it("defaults to CNY, U, then real available valuation descending and requires visible deduction review", () => {
    const harness = paymentHarness();
    let payment = harness.render();
    expect(payment.deductions.map(item => item.assetCode)).toEqual(["CNY", "USDT", "SOL"]);
    expect(payment.selectedCodes).toEqual(["CNY", "USDT", "SOL", "ETH"]);
    expect(payment.canPay).toBe(false);
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.canPay).toBe(true);
    expect(payment.paymentAssets).toEqual(buildMibanPaymentPlan(70, fixture(), ["CNY", "USDT", "SOL", "ETH"], undefined, NOW).paymentAssets);
    expect(payment.assetRows.find(item => item.assetCode === "CNY")?.frozen).toBe("900");
    expect(payment.assetRows.some(item => item.assetCode === "NVDA")).toBe(false);
    expect(payment.assetRows.some(item => item.assetCode === "BNB")).toBe(false);
  });
  it.each([["ETH", "0.005"], ["SOL", "0.1"]])("supports %s-only and sends the shared plan's raw decimal strings", (code, amount) => {
    const harness = paymentHarness();
    let payment = harness.render();
    payment.useOnlyAsset(code);
    payment = harness.render();
    expect(payment.selectedCodes).toEqual([code]);
    expect(payment.paymentAssets).toEqual([{ assetCode: code, amount }]);
    expect(payment.paymentSummary).toContain(`${amount} ${code}`);
    payment.confirmPaymentReview(true);
    payment = harness.render();
    const payload = { paymentAssets: payment.paymentAssets, paymentQuoteToken: payment.paymentQuoteToken };
    expect(payload.paymentAssets).toBe(payment.paymentAssets);
    expect(payload.paymentQuoteToken).toBe(boundary.query.data.quoteToken);
    expect(Object.keys(payload.paymentAssets[0])).toEqual(["assetCode", "amount"]);
    expect(payment.canPay).toBe(true);
  });
  it("supports ETH/SOL combinations, priority changes and cancellation without silently adding unchecked coins", () => {
    setQuote(quote([row("ETH", "0.002", "14000"), row("SOL", "0.1", "700")]));
    const harness = paymentHarness();
    let payment = harness.render();
    payment.prioritizeAsset("ETH");
    payment = harness.render();
    expect(payment.deductions.map(item => item.assetCode)).toEqual(["ETH", "SOL"]);
    expect(payment.deductions[0].amount).toBe("0.002");
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.canPay).toBe(true);
    payment.toggleAsset("SOL");
    payment = harness.render();
    expect(payment.selectedCodes).toEqual(["ETH"]);
    expect(payment.deductions.map(item => item.assetCode)).toEqual(["ETH"]);
    expect(payment.remainingCny).toBe("42");
    expect(payment.canPay).toBe(false);
    payment.prioritizeAsset("SOL");
    payment = harness.render();
    expect(payment.deductions).toEqual([{ assetCode: "SOL", amount: "0.1", priceCny: "700", priceUsdt: "100", cnyValue: "70" }]);
    expect(payment.reviewed).toBe(false);
  });
  it("skips missing prices, stale crypto and all-frozen assets; zero-held assets remain available only in expanded catalog", () => {
    setQuote(quote([row("ETH", "1", null), row("SOL", "0", "700", "10"), row("BTC", "1", "700000", "0", { priceUpdatedAt: new Date(NOW - 120_001).toISOString() }), row("BNB", "0", "1400")]));
    const payment = paymentHarness().render();
    expect(payment.paymentAssets).toEqual([]);
    expect(payment.canPay).toBe(false);
    expect(payment.assetRows.find(item => item.assetCode === "ETH")?.disabledReason).toMatch(/价格/);
    expect(payment.assetRows.find(item => item.assetCode === "SOL")?.disabledReason).toMatch(/全部冻结/);
    expect(payment.assetRows.find(item => item.assetCode === "BTC")?.disabledReason).toMatch(/过时/);
    expect(payment.allAssetRows.find(item => item.assetCode === "BNB")?.disabledReason).toMatch(/暂无可用/);
  });
  it("historical negative CNY displays zero without blocking other coins and never subtracts frozen twice", () => {
    setQuote(quote([row("CNY", "-957", "1", "626000"), row("ETH", "0.005", "14000", "99")]));
    const harness = paymentHarness();
    let payment = harness.render();
    expect(payment.cnyBalance).toBe(0);
    expect(payment.assetRows.find(item => item.assetCode === "CNY")?.available).toBe("0");
    expect(payment.paymentAssets).toEqual([{ assetCode: "ETH", amount: "0.005" }]);
    payment.confirmPaymentReview(true);
    expect(harness.render().canPay).toBe(true);
  });
  it.each(["loading", "error", "fetching", "expired", "invalidRate", "missingToken"])("rejects %s quotes without a fallback payable zero", state => {
    const data = state === "loading" ? undefined : fixture();
    if (data && state === "expired") data.expiresAt = new Date(NOW).toISOString();
    if (data && state === "invalidRate") data.usdtCnyRate = "0";
    if (data && state === "missingToken") data.quoteToken = "";
    setQuote(data, { isError: state === "error", isFetching: state === "fetching" });
    const harness = paymentHarness();
    let payment = harness.render();
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.ready).toBe(false);
    expect(payment.canPay).toBe(false);
    expect(payment.paymentQuoteToken).toBe("");
    expect(payment.paymentSummary).not.toMatch(/^0(\.0+)? U$/);
  });
  it("preserves last real deductions during failed/active refresh, updates token on success and requires re-review", () => {
    const harness = paymentHarness();
    let payment = harness.render();
    payment.useOnlyAsset("ETH");
    payment = harness.render();
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.canPay).toBe(true);
    const previousAssets = payment.paymentAssets;
    setQuote(undefined, { isFetching: true });
    payment = harness.render();
    expect(payment.paymentAssets).toBe(previousAssets);
    expect(payment.canPay).toBe(false);
    expect(payment.paymentQuoteToken).toBe("");
    setQuote(undefined, { isError: true });
    payment = harness.render();
    expect(payment.paymentAssets).toBe(previousAssets);
    setQuote(fixture(), { data: { ...fixture(), quoteToken: "new-real-quote-token" } });
    payment = harness.render();
    expect(payment.paymentQuoteToken).toBe("new-real-quote-token");
    expect(payment.reviewed).toBe(false);
    payment.confirmPaymentReview(true);
    expect(harness.render().canPay).toBe(true);
    payment.refresh();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    expect(harness.render().canPay).toBe(false);
  });
  it("checks expiry again at click time even before the next React timer render", () => {
    const harness = paymentHarness();
    let payment = harness.render();
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.canPay).toBe(true);
    vi.setSystemTime(NOW + 60_001);
    expect(payment.canPay).toBe(false);
    expect(harness.render().quoteExpired).toBe(true);
  });
  it("keeps plan references stable across countdown ticks and rejects future-dated crypto prices", () => {
    const harness = paymentHarness();
    const first = harness.render();
    vi.advanceTimersByTime(1_000);
    const next = harness.render();
    expect(next.paymentAssets).toBe(first.paymentAssets);
    expect(next.quoteSecondsLeft).toBe(59);
    setQuote(quote([row("ETH", "1", "14000", "0", { priceUpdatedAt: new Date(NOW + 10_000).toISOString() })]));
    const invalid = harness.render();
    expect(invalid.paymentAssets).toEqual([]);
    expect(invalid.assetRows[0].disabledReason).toMatch(/异常/);
    expect(invalid.canPay).toBe(false);
  });
  it("disables authenticated quote queries and clears private snapshots after logout", () => {
    let auth = true;
    const harness = paymentHarness(70, () => auth);
    expect(harness.render().assetRows.length).toBeGreaterThan(0);
    auth = false;
    const payment = harness.render();
    expect(payment.assetRows).toEqual([]);
    expect(payment.allAssetRows).toEqual([]);
    expect(payment.paymentAssets).toEqual([]);
    expect(payment.canPay).toBe(false);
    expect(boundary.quoteQuery).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ enabled: false }));
  });
  it("uses native tiny nonzero coin strings and does not round a real debit to zero", () => {
    setQuote(quote([row("ETH", "0.000000000000000001", "70000000000000000000")]));
    const payment = paymentHarness().render();
    expect(payment.paymentAssets).toEqual([{ assetCode: "ETH", amount: "0.000000000000000001" }]);
    expect(payment.paymentSummary).toBe("0.000000000000000001 ETH");
    expect(paymentDecimalUnits(payment.paymentAssets[0].amount)).toBe(1n);
    expect(PAYMENT_SCALE).toBe(10n ** 18n);
  });
});

describe("mobile allocation and truthful visible balances", () => {
  it("shows available, frozen, per-coin price, debit, remainder, quote status and explicit review", () => {
    const payment = paymentHarness().render();
    const html = renderToStaticMarkup(React.createElement(MibanMixedPaymentAllocation, { payment, accent: "#8d292c" }));
    expect(html).toContain("本次扣币");
    expect(html).toContain('aria-label="选择支付数字币"');
    expect(html).toContain('value="ETH"');
    expect(html).toContain("剩余待付");
    expect(html).toContain("确认本次实际扣币明细");
    expect(html).toContain("报价刷新后需重新核对");
    expect(html).toContain("break-all");
    expect(html).toContain("min-w-0");
    expect(html).toContain("#8d292c");
    expect(html).not.toContain("参与支付 NVDA");
    const summary = renderToStaticMarkup(React.createElement(MibanWalletAvailableSummary, { payment }));
    expect(summary).toContain("ETH");
    expect(summary).toContain("可用 0.02 · 冻结 20");
    expect(summary).toContain("SOL");
    expect(summary).toContain("冻结数量不参与支付");
  });
  it.each([["ETH", "0.005"], ["SOL", "0.1"]])("dropdown selects held %s for purchase and resets review without rounding raw quantity", (code, amount) => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    let element = allocation.render();
    const select = findElement(element, node => node.type === "select" && node.props["aria-label"] === "选择支付数字币");
    expect(select.props.value).toBe("USDT");
    select.props.onChange({ target: { value: code } });
    payment = wallet.render();
    element = allocation.render();
    expect(payment.paymentAssets).toEqual([{ assetCode: code, amount }]);
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    const html = renderToStaticMarkup(element);
    expect(html).toContain(`参与支付 ${code}`);
    expect(html).not.toContain("参与支付 USDT");
    expect(findElement(element, node => node.type === "select").props.value).toBe(code);
    payment.confirmPaymentReview(true);
    expect(wallet.render().canPay).toBe(true);
  });
  it("dropdown offers only held coins plus USDT and rejects frozen-only, missing-price or zero-unheld assets", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    const element = allocation.render();
    const select = findElement(element, node => node.type === "select");
    const options = select.props.children;
    expect(options.map((option: any) => option.props.value)).toEqual(["USDT", "SOL", "ETH", "BTC", "DOGE"]);
    expect(options.find((option: any) => option.props.value === "BTC").props.disabled).toBe(true);
    expect(options.find((option: any) => option.props.value === "DOGE").props.disabled).toBe(true);
    const previousAssets = payment.paymentAssets;
    for (const code of ["BTC", "DOGE", "BNB", "NVDA"]) {
      select.props.onChange({ target: { value: code } });
      payment = wallet.render();
      expect(payment.paymentAssets).toEqual(previousAssets);
    }
  });
  it("formats all visible USDT quantities to two decimals while submitted raw amounts remain eight-decimal", () => {
    setQuote(quote([row("CNY", "0", "1"), row("USDT", "594.9506102699997", "6.6714", "1.12345678")]));
    const payment = paymentHarness(228).render();
    const raw = payment.paymentAssets[0].amount;
    expect(raw).toBe("34.17573523");
    expect(payment.paymentSummary).toBe("34.18 U");
    const html = renderToStaticMarkup(React.createElement(MibanMixedPaymentAllocation, { payment }));
    expect(html).toContain("可用 594.95 · 冻结 1.12");
    expect(html).toContain("本次扣币 34.18 U");
    expect(html).toContain("实际付款：34.18 U");
    expect(html).not.toContain("594.9506102699997");
    expect(html).not.toContain("34.17573523");
    expect(payment.paymentAssets[0].amount).toBe(raw);
    const summary = renderToStaticMarkup(React.createElement(MibanWalletAvailableSummary, { payment }));
    expect(summary).toContain("可用 594.95 · 冻结 1.12");
  });
  it("expands genuine zero-held quote rows with price and disabled checkboxes; defaults to held only", () => {
    const payment = paymentHarness().render();
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    let element = allocation.render();
    expect(renderToStaticMarkup(element)).not.toContain("参与支付 BNB");
    const button = findElement(element, node => node.type === "button" && node.props["aria-expanded"] === false);
    expect(button).toBeDefined();
    button.props.onClick();
    element = allocation.render();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("收起未持有币种");
    expect(html).toContain("参与支付 BNB");
    expect(html).toContain("1400");
    expect(html).toContain("暂无可用数量");
    const checkbox = findElement(element, node => node.props["aria-label"] === "参与支付 BNB");
    expect(checkbox.props.disabled).toBe(true);
    expect(checkbox.props.checked).toBe(false);
    expect(html).not.toContain("参与支付 NVDA");
  });
});

describe("all six authorized files: real payload references and regression protection", () => {
  const entries = ["HerbalifeRedGinsengDetail", "LimitedProductCart", "CartDrawer", "TianguiPearDetail", "DiyWorkshop"];
  it.each(entries)("%s preserves its original API and sends only plan assets + signature, invalidating real wallet queries", name => {
    const payload = orderPayload(name);
    const paymentVariable = name === "LimitedProductCart" ? "payment" : "walletPayment";
    expect(initializer(payload, "paymentAssets")).toBe(`${paymentVariable}.paymentAssets`);
    expect(initializer(payload, "paymentQuoteToken")).toBe(`${paymentVariable}.paymentQuoteToken`);
    expect(payload.properties.some(item => ts.isPropertyAssignment(item) && /^(priceCny|priceUsdt|userId|available|frozen|usdtCnyRate)$/.test(item.name.getText()))).toBe(false);
    const text = source(name);
    expect(text).toContain("useMibanMixedPayment(");
    expect(text).toContain("<MibanMixedPaymentAllocation");
    expect(text).toContain("getMultiAssetBalances.invalidate()");
    expect(text).toContain("order.walletPaymentQuote.invalidate()");
    expect(text).toContain("getCnyBalanceSummary.invalidate()");
    expect(text).toContain("getUsdtBalanceSummary.invalidate()");
    expect(text).toContain("normalizeMibanReceiverPhone");
    expect(text).toContain("getMibanReceiverPhoneError");
    expect(text).toContain("walletPayments");
    expect(text).toContain("formatMibanPaymentSummary");
    expect(text).not.toMatch(/orderSuccess\.deduct(?:Cny|Usdt)\s*>/);
  });
  it("common sixth file retains original exports/fields/callbacks plus exact payment DTOs", () => {
    const text = source("MibanMixedPayment");
    for (const member of ["cnyBalance", "usdtBalance", "usdtCnyRate", "cnyInput", "cnyAmount", "usdtAmount", "paymentSummary", "setCnyInput", "normalizeCnyInput", "useAllCny", "useUsdtFirst", "resetToCnyFirst", "paymentAssets", "paymentQuoteToken", "deductions", "assetRows", "ready", "refresh", "quoteExpiresAt", "quoteExpired"]) expect(text).toContain(member);
    expect(text).toContain("export type MibanMixedPayment");
    expect(text).toContain("export function useMibanMixedPayment");
    expect(text).toContain("export function MibanMixedPaymentAllocation");
  });
  it("never substitutes a fallback SKU for an invalid explicitly requested checkout SKU", () => {
    const text = source("HerbalifeRedGinsengDetail");
    expect(text).toContain('new URLSearchParams(queryString).get("sku")');
    expect(text).toContain("? activeSkus.find(sku => sku.id === activeSkuId)");
    expect(text).not.toContain("activeSkus.find(sku => sku.id === activeSkuId) ?? defaultSku");
    const payload = orderPayload("HerbalifeRedGinsengDetail");
    expect(initializer(payload, "skuId")).toBe("selectedSku.id");
    expect(initializer(payload, "productKey")).toBe("currentProduct.key");
  });
  it("preserves custom Midaniang return mapping, both transparent 48px labels, purchase controls and red accent", () => {
    const checkout = source("HerbalifeRedGinsengDetail");
    expect(checkout).toContain("midaniangSelectionCatalog.find(item => item.productKey === productKey)");
    expect(checkout).toContain("`/p/proj_hzxm2t/limited/midaniang/${midaniangSelection.key}`");
    expect(checkout).toContain("navigate(detailPath)");
    expect(checkout).toContain("accent={accent}");
    const detail = source("MidaniangSelectionDetail");
    expect(detail).toContain('alt="米大娘品牌标签"');
    expect(detail).toContain("width={48}");
    expect(detail).toContain("height={48}");
    expect(detail).toContain('<MidaniangOrganicMark');
    expect(detail).toContain('variant="large"');
    expect(detail).toContain("MidaniangPurchaseActions");
    expect(detail).toContain('aria-label="返回米大娘精选列表"');
    const mark = source("MidaniangOrganicMark");
    expect(mark).toContain('variant === "large" ? 48 : 32');
    expect(mark).toContain("bg-transparent");
    expect(mark).toContain("查看有机认证说明");
    const purchase = source("MidaniangPurchaseActions");
    expect(purchase).toContain("midaniang-add-to-cart");
    expect(purchase).toContain("midaniang-buy-now");
    expect(purchase).toContain('accent: "#8d292c"');
    expect(purchase).toContain("encodeURIComponent(sku.id)");
  });
  it("copies/screenshots only server walletPayments, never fabricates a 0U/0RMB receipt", () => {
    const text = source("HerbalifeRedGinsengDetail");
    expect(text).toContain("walletPayments: data.walletPayments ?? []");
    expect(text).toContain("orderSuccess.walletPayments.map");
    expect(text).toContain("formatMibanPaymentSummary(orderSuccess.walletPayments)");
    expect(text).toContain("OrderCardImageDownload");
    expect(source("LimitedProductCart")).not.toContain("useMibanUsdtCnyRate()");
    expect(text).toContain("currentUser={user}");
    expect(text).toContain("实际付款明细待核对");
    expect(text).not.toContain("requiredUsdt");
    expect(text).not.toContain("cnyBalanceQuery");
  });
});
