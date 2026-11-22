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
  it("defaults to available CNY plus the highest available-value digital coin, without silently selecting USDT or every coin", () => {
    const harness = paymentHarness();
    let payment = harness.render();
    expect(payment.deductions.map(item => item.assetCode)).toEqual(["CNY", "SOL"]);
    expect(payment.selectedCodes).toEqual(["CNY", "SOL"]);
    expect(payment.selectedDigitalCode).toBe("SOL");
    expect(payment.paymentAssets).toEqual([{ assetCode: "CNY", amount: "14" }, { assetCode: "SOL", amount: "0.08" }]);
    expect(payment.canPay).toBe(false);
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.canPay).toBe(true);
    expect(payment.paymentAssets).toEqual(buildMibanPaymentPlan(70, fixture(), ["CNY", "SOL"], undefined, NOW).paymentAssets);
    expect(payment.assetRows.find(item => item.assetCode === "CNY")?.frozen).toBe("900");
    expect(payment.assetRows.some(item => item.assetCode === "NVDA")).toBe(false);
    expect(payment.assetRows.some(item => item.assetCode === "BNB")).toBe(false);
  });
  it.each([
    ["10", "0.003", "USDT", "10"],
    ["2", "0.02", "ETH", "0.005"],
  ])("selects the highest available CNY value, not USDT hard priority (USDT %s, ETH %s)", (usdt, eth, chosen, amount) => {
    setQuote(quote([row("CNY", "0", "1", "900"), row("USDT", usdt, "7", "999999"), row("ETH", eth, "14000", "1")]));
    const payment = paymentHarness().render();
    expect(payment.selectedCodes).toEqual([chosen]);
    expect(payment.selectedDigitalCode).toBe(chosen);
    expect(payment.paymentAssets).toEqual([{ assetCode: chosen, amount }]);
    expect(payment.canPay).toBe(false);
  });
  it("uses partially frozen holdings' available amount exactly once, never gross holdings or available minus frozen", () => {
    setQuote(quote([row("CNY", "14", "1", "900"), row("SOL", "0.08", "700", "100"), row("USDT", "2", "7", "9999")]));
    const wallet = paymentHarness();
    let payment = wallet.render();
    expect(payment.selectedCodes).toEqual(["CNY", "SOL"]);
    expect(payment.paymentAssets).toEqual([{ assetCode: "CNY", amount: "14" }, { assetCode: "SOL", amount: "0.08" }]);
    expect(payment.totalValueCny).toBe("70");
    expect(payment.remainingCny).toBe("0");
    expect(payment.assetRows.find(item => item.assetCode === "SOL")?.availableValueCny).toBe("56");
    expect(payment.assetRows.find(item => item.assetCode === "SOL")?.frozen).toBe("100");
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
  });
  it("never adds other coins to an insufficient default or single coin until explicit combined selection, then requires review", () => {
    const data = quote([
      row("CNY", "14", "1", "900"), row("SOL", "0.04", "700", "100"),
      row("ETH", "0.0015", "14000", "20"), row("USDT", "1", "7", "800"),
      row("BTC", "0", "700000", "2"), row("DOGE", "15", null), row("BNB", "0", "1400"), row("NVDA", "100", "700"),
    ]);
    setQuote(data);
    const wallet = paymentHarness();
    let payment = wallet.render();
    expect(payment.selectedCodes).toEqual(["CNY", "SOL"]);
    expect(payment.paymentAssets).toEqual([{ assetCode: "CNY", amount: "14" }, { assetCode: "SOL", amount: "0.04" }]);
    expect(payment.remainingCny).toBe("28");
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    payment.useOnlyAsset("SOL");
    payment = wallet.render();
    expect(payment.selectedCodes).toEqual(["SOL"]);
    expect(payment.paymentAssets).toEqual([{ assetCode: "SOL", amount: "0.04" }]);
    expect(payment.remainingCny).toBe("42");
    vi.advanceTimersByTime(1_000);
    expect(wallet.render().selectedCodes).toEqual(["SOL"]);
    payment.useCombinedAssets();
    payment = wallet.render();
    expect([...payment.selectedCodes].sort()).toEqual(["CNY", "ETH", "SOL", "USDT"]);
    expect(payment.selectedDigitalCode).toBe("SOL");
    expect(payment.deductions[0].assetCode).toBe("SOL");
    expect([...payment.paymentAssets].sort((a, b) => a.assetCode.localeCompare(b.assetCode))).toEqual([
      { assetCode: "CNY", amount: "14" }, { assetCode: "ETH", amount: "0.0015" },
      { assetCode: "SOL", amount: "0.04" }, { assetCode: "USDT", amount: "1" },
    ]);
    expect(payment.paymentAssets).toEqual(buildMibanPaymentPlan(70, data, payment.deductions.map(item => item.assetCode), undefined, NOW).paymentAssets);
    expect(payment.totalValueCny).toBe("70");
    expect(payment.remainingCny).toBe("0");
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    payment.confirmPaymentReview(true);
    expect(wallet.render().canPay).toBe(true);
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
    expect(payment.selectedCodes).toEqual(["SOL"]);
    payment.useCombinedAssets();
    payment = harness.render();
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
  it("skips missing prices, stale crypto and all-frozen assets while retaining true zero-held rows only in the underlying catalog", () => {
    setQuote(quote([row("ETH", "1", null), row("SOL", "0", "700", "10"), row("BTC", "1", "700000", "0", { priceUpdatedAt: new Date(NOW - 120_001).toISOString() }), row("BNB", "0", "1400")]));
    const payment = paymentHarness().render();
    expect(payment.paymentAssets).toEqual([]);
    expect(payment.canPay).toBe(false);
    expect(payment.assetRows.find(item => item.assetCode === "ETH")?.disabledReason).toMatch(/价格/);
    expect(payment.assetRows.find(item => item.assetCode === "SOL")?.disabledReason).toMatch(/全部冻结/);
    expect(payment.assetRows.find(item => item.assetCode === "BTC")?.disabledReason).toMatch(/过时/);
    expect(payment.allAssetRows.find(item => item.assetCode === "BNB")?.disabledReason).toMatch(/暂无可用/);
    expect(payment.selectedCodes).toEqual([]);
    expect(payment.selectedDigitalCode).toBeNull();
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
    const previousSelection = payment.selectedCodes;
    payment.useCombinedAssets();
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.selectedCodes).toEqual(previousSelection);
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
  it("clears the visible review on natural expiry without fetching and never restores old approval", () => {
    const harness = paymentHarness();
    let payment = harness.render();
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.reviewed).toBe(true);
    const previousAssets = payment.paymentAssets;
    vi.setSystemTime(NOW + 60_001);
    const expired = harness.render();
    expect(expired.quoteExpired).toBe(true);
    expect(expired.ready).toBe(false);
    expect(expired.reviewed).toBe(false);
    expect(expired.canPay).toBe(false);
    expect(expired.paymentQuoteToken).toBe("");
    expect(expired.paymentAssets).toBe(previousAssets);
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment: expired }));
    harnesses.push(allocation);
    const checkbox = findElement(allocation.render(), node => node.props["aria-label"] === "确认本次实际扣币明细");
    expect(checkbox.props.checked).toBe(false);
    expect(checkbox.props.disabled).toBe(true);
    vi.setSystemTime(NOW + 10_000);
    expect(harness.render().reviewed).toBe(false);
  });
  it("moves the current digital choice to a selected coin after cancelling the priority coin in joint payment", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.useCombinedAssets();
    payment = wallet.render();
    expect(payment.priorityCode).toBe("SOL");
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    payment.toggleAsset("SOL");
    payment = wallet.render();
    expect(payment.selectedCodes).not.toContain("SOL");
    expect(payment.priorityCode).toBe("ETH");
    expect(payment.selectedDigitalCode).toBe("ETH");
    expect(payment.selectedCodes).toContain(payment.selectedDigitalCode);
    expect(payment.paymentAssets).toEqual([{ assetCode: "ETH", amount: "0.005" }]);
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    expect(findElement(allocation.render(), node => node.type === "select").props.value).toBe("ETH");
    expect(findElement(MibanWalletAvailableSummary({ payment }), node => node.type === "select").props.value).toBe("ETH");
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
  it("shows available selected balances, per-coin price, debit, remainder, quote status and explicit review in two summary categories", () => {
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
    expect(html).toContain("本次扣币 0.08 SOL");
    const summary = renderToStaticMarkup(React.createElement(MibanWalletAvailableSummary, { payment }));
    expect((summary.match(/data-payment-asset=/g) ?? [])).toHaveLength(2);
    expect(summary).toContain("人民币");
    expect(summary).toContain("数字币");
    expect(summary).toContain('aria-label="选择支付数字币"');
    expect(summary).toContain("SOL");
    expect(summary).not.toContain("冻结 900");
    expect(summary).not.toContain("BTC");
    expect(summary).not.toContain("DOGE");
    expect(summary).toContain("冻结、无余额或无有效行情的数字币已过滤");
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
    expect(select.props.value).toBe("SOL");
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
  it("both dropdowns offer only genuine positive available, valid-price digital coins and reject hidden invalid selections", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    const previousAssets = payment.paymentAssets;
    for (const element of [allocation.render(), MibanWalletAvailableSummary({ payment })]) {
      const select = findElement(element, node => node.type === "select" && node.props["aria-label"] === "选择支付数字币");
      expect(select).toBeDefined();
      const options = React.Children.toArray(select.props.children) as any[];
      expect(options.map(option => option.props.value).sort()).toEqual(["ETH", "SOL", "USDT"]);
      expect(options.every(option => !option.props.disabled)).toBe(true);
      for (const code of ["BTC", "DOGE", "BNB", "NVDA", "NOT-IN-WALLET"]) {
        select.props.onChange({ target: { value: code } });
        payment = wallet.render();
        expect(payment.paymentAssets).toEqual(previousAssets);
        expect(payment.selectedDigitalCode).toBe("SOL");
      }
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
    expect(summary).toContain("可用 594.95");
    expect(summary).not.toContain("594.9506102699997");
    expect(summary).not.toContain("冻结 1.12");
  });
  it("explicitly enables only usable coins with the multi-coin button, never zero-held, frozen-only or price-invalid catalog rows", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    let element = allocation.render();
    expect(renderToStaticMarkup(element)).not.toContain("参与支付 BNB");
    const button = findElement(element, node => node.type === "button" && node.props["aria-expanded"] === false);
    expect(button).toBeDefined();
    button.props.onClick();
    payment = wallet.render();
    expect([...payment.selectedCodes].sort()).toEqual(["CNY", "ETH", "SOL", "USDT"]);
    expect(payment.selectedDigitalCode).toBe("SOL");
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    element = allocation.render();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("收起联合币种");
    expect(html).toContain("参与支付 ETH");
    expect(html).toContain("参与支付 SOL");
    expect(html).toContain("参与支付 USDT");
    for (const code of ["BNB", "BTC", "DOGE", "NVDA"]) expect(html).not.toContain(`参与支付 ${code}`);
    expect(html).not.toContain("查看全部数字币");
    expect(html).not.toContain("收起未持有币种");
  });
  it.each(["missing", "zero", "negative", "allFrozen"])("always keeps CNY and digital summary categories with truthful zero CNY (%s)", state => {
    const assets = [row("SOL", "0.1", "700", "99")];
    if (state !== "missing") assets.unshift(row("CNY", state === "negative" ? "-957" : "0", "1", state === "allFrozen" ? "626000" : "0"));
    setQuote(quote(assets));
    const payment = paymentHarness().render();
    const summary = MibanWalletAvailableSummary({ payment });
    const html = renderToStaticMarkup(summary);
    const categories = findElement(summary, node => node.type === "div" && /\bgrid-cols-2\b/.test(node.props.className ?? ""));
    expect(React.Children.toArray(categories.props.children)).toHaveLength(2);
    expect((html.match(/data-payment-asset=/g) ?? [])).toHaveLength(1);
    expect(html).toContain("人民币");
    expect(html).toContain("数字币");
    expect(html).toContain("暂无可用人民币");
    expect(html).toContain("可用 ¥0.00");
    expect(html).not.toContain("-957");
    expect(html).not.toContain("626000");
    expect(html).not.toContain("冻结 99");
    expect(payment.selectedCodes).toEqual(["SOL"]);
    expect(payment.paymentAssets).toEqual([{ assetCode: "SOL", amount: "0.1" }]);
  });
  it("never invents USDT or exposes missing-price, stale, unavailable or frozen-only digital options even after expansion", () => {
    setQuote(quote([
      row("SOL", "0.1", "700", "9"), row("USDT", "0", "7", "800"),
      row("ETH", "1", null), row("BTC", "1", "700000", "0", { priceUpdatedAt: new Date(NOW - 120_001).toISOString() }),
      row("DOGE", "15", "7", "0", { unavailableReason: "行情暂不可用" }), row("BNB", "0", "1400"), row("NVDA", "100", "700"),
    ]));
    const wallet = paymentHarness();
    let payment = wallet.render();
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    for (const element of [MibanWalletAvailableSummary({ payment }), allocation.render()]) {
      const select = findElement(element, node => node.type === "select");
      expect((React.Children.toArray(select.props.children) as any[]).map(option => option.props.value)).toEqual(["SOL"]);
    }
    const button = findElement(allocation.render(), node => node.type === "button" && node.props["aria-expanded"] === false);
    button.props.onClick();
    payment = wallet.render();
    const html = renderToStaticMarkup(allocation.render());
    expect(payment.selectedCodes).toEqual(["SOL"]);
    for (const code of ["USDT", "ETH", "BTC", "DOGE", "BNB", "NVDA"]) expect(html).not.toContain(`参与支付 ${code}`);
  });
  it("all-frozen wallets retain two category cards but no payable digital choice or synthetic balance", () => {
    setQuote(quote([row("CNY", "0", "1", "900"), row("USDT", "0", "7", "800"), row("SOL", "0", "700", "10")]));
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.useCombinedAssets();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.selectedCodes).toEqual([]);
    expect(payment.selectedDigitalCode).toBeNull();
    expect(payment.paymentAssets).toEqual([]);
    expect(payment.canPay).toBe(false);
    const summary = MibanWalletAvailableSummary({ payment });
    const html = renderToStaticMarkup(summary);
    const categories = findElement(summary, node => node.type === "div" && /\bgrid-cols-2\b/.test(node.props.className ?? ""));
    expect(React.Children.toArray(categories.props.children)).toHaveLength(2);
    expect(html).not.toContain("data-payment-asset=");
    expect(html).toContain("暂无可用人民币");
    expect(findElement(summary, node => node.type === "option" && ["USDT", "SOL"].includes(node.props.value))).toBeUndefined();
    for (const frozen of ["900", "800", "10"]) expect(html).not.toContain(`冻结 ${frozen}`);
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    const element = allocation.render();
    expect(findElement(element, node => node.props["aria-label"] === "确认本次实际扣币明细").props.disabled).toBe(true);
    for (const code of ["CNY", "USDT", "SOL"]) expect(renderToStaticMarkup(element)).not.toContain(`参与支付 ${code}`);
  });
  it("shows the insufficient single-coin hint and button, debits no extra coin before clicking, then precisely combines and demands review", () => {
    setQuote(quote([row("SOL", "0.06", "700", "100"), row("ETH", "0.002", "14000", "99"), row("USDT", "0", "7", "800")]));
    const wallet = paymentHarness();
    let payment = wallet.render();
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    let element = allocation.render();
    expect(payment.selectedCodes).toEqual(["SOL"]);
    expect(payment.paymentAssets).toEqual([{ assetCode: "SOL", amount: "0.06" }]);
    expect(payment.remainingCny).toBe("28");
    const hint = findElement(element, node => node.props["data-payment-combination-hint"] !== undefined);
    expect(hint).toBeDefined();
    expect(renderToStaticMarkup(hint)).toContain("多币种联合支付");
    const button = findElement(element, node => node.type === "button" && node.props["aria-expanded"] === false);
    expect(renderToStaticMarkup(button)).toContain("多币种联合支付");
    expect(button.props.disabled).toBeFalsy();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.reviewed).toBe(false);
    expect(payment.paymentAssets).toEqual([{ assetCode: "SOL", amount: "0.06" }]);
    button.props.onClick();
    payment = wallet.render();
    element = allocation.render();
    expect(payment.selectedDigitalCode).toBe("SOL");
    expect(payment.paymentAssets).toEqual([{ assetCode: "SOL", amount: "0.06" }, { assetCode: "ETH", amount: "0.002" }]);
    expect(payment.totalValueCny).toBe("70");
    expect(payment.remainingCny).toBe("0");
    expect(payment.canPay).toBe(false);
    expect(payment.reviewed).toBe(false);
    expect(renderToStaticMarkup(element)).toContain("收起联合币种");
    expect(renderToStaticMarkup(element)).not.toContain("参与支付 USDT");
    const review = findElement(element, node => node.props["aria-label"] === "确认本次实际扣币明细");
    expect(review.props.disabled).toBe(false);
    review.props.onChange({ target: { checked: true } });
    expect(wallet.render().canPay).toBe(true);
  });
  it("summary dropdown stores the choice in the same hook for later/new allocation dialogs and clears previous review", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
    const summary = MibanWalletAvailableSummary({ payment });
    const select = findElement(summary, node => node.type === "select" && node.props["aria-label"] === "选择支付数字币");
    expect(select.props.value).toBe("SOL");
    select.props.onChange({ target: { value: "ETH" } });
    payment = wallet.render();
    expect(payment.selectedDigitalCode).toBe("ETH");
    expect(payment.selectedCodes).toEqual(["ETH"]);
    expect(payment.paymentAssets).toEqual([{ assetCode: "ETH", amount: "0.005" }]);
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    const firstDialog = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(firstDialog);
    expect(findElement(firstDialog.render(), node => node.type === "select").props.value).toBe("ETH");
    firstDialog.cleanup();
    const nextDialog = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(nextDialog);
    expect(findElement(nextDialog.render(), node => node.type === "select").props.value).toBe("ETH");
    expect(findElement(MibanWalletAvailableSummary({ payment }), node => node.type === "select").props.value).toBe("ETH");
    payment.confirmPaymentReview(true);
    expect(wallet.render().canPay).toBe(true);
  });
  it("summary's explicit multi-coin button enables usable funding and clears a reviewed single-coin plan", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.useOnlyAsset("ETH");
    payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
    const summary = MibanWalletAvailableSummary({ payment });
    const button = findElement(summary, node => node.type === "button" && renderToStaticMarkup(node).includes("多币种联合支付"));
    expect(button.props.disabled).toBe(false);
    button.props.onClick();
    payment = wallet.render();
    expect([...payment.selectedCodes].sort()).toEqual(["CNY", "ETH", "SOL", "USDT"]);
    expect(payment.selectedDigitalCode).toBe("ETH");
    expect(payment.paymentAssets).toEqual([{ assetCode: "ETH", amount: "0.005" }]);
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
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
    for (const member of ["cnyBalance", "usdtBalance", "usdtCnyRate", "cnyInput", "cnyAmount", "usdtAmount", "paymentSummary", "setCnyInput", "normalizeCnyInput", "useAllCny", "useUsdtFirst", "resetToCnyFirst", "paymentAssets", "paymentQuoteToken", "deductions", "assetRows", "ready", "refresh", "quoteExpiresAt", "quoteExpired", "selectedDigitalCode", "useCombinedAssets"]) expect(text).toContain(member);
    expect(text).toContain("export type MibanMixedPayment");
    expect(text).toContain("export function useMibanMixedPayment");
    expect(text).toContain("export function MibanMixedPaymentAllocation");
  });
  it("opening the Herbalife payment dialog clears only review, preserving the summary-selected hook choice", () => {
    const text = source("HerbalifeRedGinsengDetail");
    const file = ts.createSourceFile("HerbalifeRedGinsengDetail.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = walk(file, node => ts.isVariableDeclaration(node) && node.name.getText(file) === "handleOpenWalletPayment") as ts.VariableDeclaration[];
    expect(declarations).toHaveLength(1);
    const handler = declarations[0].initializer!.getText(file);
    expect(handler).toContain("walletPayment.confirmPaymentReview(false)");
    expect(handler).not.toContain("resetToCnyFirst");
    expect(handler).not.toContain("useOnlyAsset");
    expect(handler).not.toContain("useCombinedAssets");
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

describe("stable wallet layout while real quote refresh remains fail-closed", () => {
  // Inspect actual component output rather than JSX spelling or status copy.
  function elements(node: any, predicate: (node: any) => boolean): any[] {
    if (Array.isArray(node)) return node.flatMap(item => elements(item, predicate));
    if (!React.isValidElement(node)) return [];
    return [...(predicate(node) ? [node] : []), ...elements((node.props as any).children, predicate)];
  }
  function text(node: any): string {
    if (Array.isArray(node)) return node.map(text).join("");
    if (React.isValidElement(node)) return text((node.props as any).children);
    return typeof node === "string" || typeof node === "number" ? String(node) : "";
  }
  function shape(node: any): any {
    if (Array.isArray(node)) return node.filter(React.isValidElement).map(shape);
    if (!React.isValidElement(node)) return null;
    const props = node.props as any;
    return { tag: node.type, asset: props["data-payment-asset"], children: React.Children.toArray(props.children).filter(React.isValidElement).map(shape) };
  }
  function marked(node: any, attribute: string): any[] {
    return elements(node, element => element.props[attribute] !== undefined);
  }
  function assertStableSlots(summary: any, allocation: any, payment: MibanMixedPayment) {
    expect(marked(summary, "data-payment-summary")).toHaveLength(1);
    expect(marked(allocation, "data-payment-allocation")).toHaveLength(1);
    const summarySlots = marked(summary, "data-payment-summary-status");
    const allocationSlots = marked(allocation, "data-payment-allocation-status");
    expect(summarySlots).toHaveLength(1);
    expect(allocationSlots).toHaveLength(1);
    const summarySlot = summarySlots[0];
    const allocationSlot = allocationSlots[0];
    expect(summarySlot.props.role).toBe("status");
    expect(summarySlot.props.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-4", "leading-4"]));
    expect(summarySlot.props.className).toMatch(/\b(?:truncate|whitespace-nowrap)\b/);
    expect(summarySlot.props.title).toContain(payment.statusMessage);
    expect(text(summarySlot)).not.toBe("");
    expect(elements(summarySlot, element => element.type === "br")).toHaveLength(0);
    expect(allocationSlot.props.role).toBe("status");
    expect(allocationSlot.props.className).toMatch(/\b(?:h-10|min-h-10)\b/);
    expect(allocationSlot.props.className.split(/\s+/)).toContain("leading-5");
    expect(allocationSlot.props.title).toContain(payment.statusMessage);
    const statusLines = elements(allocationSlot, element => element.type === "p");
    expect(statusLines).toHaveLength(2);
    for (const line of statusLines) {
      expect(line.props.className ?? "").toMatch(/\b(?:truncate|whitespace-nowrap)\b/);
      expect(text(line)).not.toBe("");
    }
    expect(elements(allocationSlot, element => /\btabular-nums\b/.test(element.props.className ?? ""))).not.toHaveLength(0);
    expect(text(allocationSlot)).toContain("1 U ≈ ¥7.0000");
    expect(text(allocationSlot)).toContain(`${payment.quoteSecondsLeft} 秒`);
    // SSR must expose the same measurement targets used by the real browser.
    expect(renderToStaticMarkup(summary)).toContain("data-payment-summary-status");
    expect(renderToStaticMarkup(allocation)).toContain("data-payment-allocation-status");
    for (const component of [summary, allocation]) {
      const hint = marked(component, "data-payment-combination-hint");
      expect(hint).toHaveLength(1);
      expect(hint[0].props.className.split(/\s+/)).toContain("min-h-10");
      expect(text(hint[0])).not.toBe("");
    }
  }

  it.each(["ready", "refresh", "error", "expired"] as const)("keeps the single-line summary and two-line allocation slots, positions and genuine asset cards in %s", state => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    const previousSummary = MibanWalletAvailableSummary({ payment });
    const previousAllocation = allocation.render();
    assertStableSlots(previousSummary, previousAllocation, payment);

    if (state === "refresh") setQuote(fixture(), { isFetching: true });
    if (state === "error") setQuote(undefined, { isError: true });
    if (state === "expired") vi.advanceTimersByTime(60_000);
    payment = wallet.render();
    payment = wallet.render(); // flush the isolated useEffect clearing review on fetching
    expect(payment.ready).toBe(state === "ready");
    expect(payment.canPay).toBe(state === "ready");
    if (state !== "ready") expect(payment.paymentQuoteToken).toBe("");
    const summary = MibanWalletAvailableSummary({ payment });
    const element = allocation.render();
    assertStableSlots(summary, element, payment);
    // Includes slot positions: removing/reinserting a status paragraph changes shape.
    expect(shape(summary)).toEqual(shape(previousSummary));
    expect(shape(element)).toEqual(shape(previousAllocation));
    expect(marked(summary, "data-payment-asset").map(card => card.props["data-payment-asset"])).toEqual(["CNY", "SOL"]);
    expect(marked(element, "data-payment-asset").map(card => card.props["data-payment-asset"])).toEqual(["CNY", "SOL"]);
    expect(renderToStaticMarkup(summary)).toContain("可用 1");
    expect(renderToStaticMarkup(summary)).not.toContain("冻结 900");
    expect(renderToStaticMarkup(element)).toContain("本次扣币 0.08 SOL");
    expect(renderToStaticMarkup(element)).not.toContain("参与支付 NVDA");
  });

  it.each([true, false])("retains undimmed old balances/debits but clears review, locks controls and exposes no token during background refresh (cached live data: %s)", keepLiveData => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.useOnlyAsset("ETH");
    payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
    const previous = payment;
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    const previousElement = allocation.render();
    vi.advanceTimersByTime(15_000);
    setQuote(keepLiveData ? fixture() : undefined, { isFetching: true });
    payment = wallet.render();
    payment = wallet.render();
    expect(payment.refreshing).toBe(true);
    expect(payment.quoteExpired).toBe(false);
    expect(payment.quoteSecondsLeft).toBe(45);
    expect(payment.ready).toBe(false);
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    expect(payment.paymentQuoteToken).toBe("");
    expect(payment.paymentAssets).toBe(previous.paymentAssets);
    expect(payment.deductions).toBe(previous.deductions);
    expect(payment.cnyBalance).toBe(previous.cnyBalance);
    expect(payment.usdtBalance).toBe(previous.usdtBalance);
    expect(payment.paymentSummary).toBe("0.005 ETH");
    const element = allocation.render();
    expect(shape(element)).toEqual(shape(previousElement));
    const isPaymentControl = (node: any) => node.type === "input" || node.type === "select" || (node.type === "button" && (["优先使用", "已优先", "仅用此币"].includes(text(node)) || node.props["aria-expanded"] !== undefined));
    const controls = elements(element, isPaymentControl);
    const previousControls = elements(previousElement, isPaymentControl);
    const activeOpacity = (node: any) => (node.props.className ?? "").split(/\s+/)
      .filter((token: string) => /^opacity-/.test(token) || (node.props.disabled && /^disabled:opacity-/.test(token)))
      .map((token: string) => token.replace(/^disabled:/, ""));
    expect(controls.length).toBeGreaterThan(4);
    expect(controls).toHaveLength(previousControls.length);
    for (const [index, control] of controls.entries()) {
      expect(control.props.disabled).toBe(true);
      // Layout stability must not be implemented by unlocking stale-quote inputs.
      // A genuinely unselected CNY input may stay dim; refreshing must not add dimming.
      expect(activeOpacity(control)).toEqual(activeOpacity(previousControls[index]));
    }
    for (const attribute of ["data-payment-allocation", "data-payment-asset"]) {
      expect(marked(element, attribute).map(activeOpacity)).toEqual(marked(previousElement, attribute).map(activeOpacity));
    }
    const review = findElement(element, node => node.props["aria-label"] === "确认本次实际扣币明细");
    expect(review.props.checked).toBe(false);
    const html = renderToStaticMarkup(element);
    expect(html).toContain("可用 0.02 · 冻结 20");
    expect(html).toContain("本次扣币 0.005 ETH");
    expect(html).toContain("实际付款：0.005 ETH");
    const summary = MibanWalletAvailableSummary({ payment });
    expect(renderToStaticMarkup(summary)).toContain("可用 0.02");
    expect(renderToStaticMarkup(summary)).not.toContain("冻结 800.00");
    const summarySelect = findElement(summary, node => node.type === "select");
    expect(summarySelect.props.disabled).toBe(true);
    const summaryPaymentControls = elements(summary, node => node.type === "button" || node.type === "select");
    expect(summaryPaymentControls.length).toBeGreaterThan(1);
    for (const control of summaryPaymentControls) expect(control.props.disabled).toBe(true);

    const previousSelection = payment.selectedCodes;
    const select = findElement(element, node => node.type === "select");
    select.props.onChange({ target: { value: "SOL" } });
    summarySelect.props.onChange({ target: { value: "SOL" } });
    payment.useOnlyAsset("SOL");
    payment.useCombinedAssets();
    payment.prioritizeAsset("SOL");
    payment.toggleAsset("ETH");
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.selectedCodes).toEqual(previousSelection);
    expect(payment.selectedDigitalCode).toBe("ETH");
    expect(payment.paymentAssets).toBe(previous.paymentAssets);
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    expect(payment.paymentQuoteToken).toBe("");

    setQuote(quote(fixture().assets, { quoteToken: "refreshed-unit-signature", quotedAt: new Date(NOW + 15_000).toISOString(), expiresAt: new Date(NOW + 75_000).toISOString() }));
    payment = wallet.render();
    expect(payment.ready).toBe(true);
    expect(payment.paymentQuoteToken).toBe("refreshed-unit-signature");
    expect(payment.quoteSecondsLeft).toBe(60);
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
    payment.refresh();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    payment = wallet.render();
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
  });
});
