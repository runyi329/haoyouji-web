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
function paymentHarness(total: number | (() => number) = 70, auth = () => true) {
  const harness = hookHarness(() => useMibanMixedPayment(typeof total === "function" ? total() : total, auth()));
  harnesses.push(harness);
  return harness;
}
function setQuote(data: MibanWalletPaymentQuote | undefined, state: Record<string, unknown> = {}) {
  boundary.query = { data, isSuccess: Boolean(data), isError: false, isFetching: false, refetch: vi.fn().mockResolvedValue({ data }), ...state };
}
function deferredQuote() {
  let resolve!: (result: { data?: MibanWalletPaymentQuote; isError?: boolean }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ data?: MibanWalletPaymentQuote; isError?: boolean }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function freshQuote(assets = fixture().assets, extra: Partial<MibanWalletPaymentQuote> = {}) {
  const at = Date.now();
  return quote(assets.map(asset => ({ ...asset, priceUpdatedAt: new Date(at).toISOString() })), {
    quoteToken: "fresh-unit-fixture-signature", quotedAt: new Date(at).toISOString(), expiresAt: new Date(at + 60_000).toISOString(), ...extra,
  });
}
async function flushQuoteRequest() {
  // refetch -> Promise.race -> fetchLatest/finally -> preparePayment wrapper.
  // A void refresh has no public completion Promise, so drain those microtasks.
  for (let step = 0; step < 5; step++) await Promise.resolve();
}
function visibleText(node: any): string {
  if (Array.isArray(node)) return node.map(visibleText).join("");
  if (React.isValidElement(node)) return visibleText((node.props as any).children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
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
function assertPreparedBeforeCreate(name: string, paymentVariable: string) {
  const file = ts.createSourceFile(`${name}.tsx`, source(name), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls = walk(file, node => ts.isCallExpression(node) && node.expression.getText(file) === "createOrder.mutate") as ts.CallExpression[];
  expect(calls).toHaveLength(1);
  const create = calls[0];
  let handler: ts.Node | undefined = create.parent;
  while (handler && !ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler) && !ts.isFunctionDeclaration(handler)) handler = handler.parent;
  expect(handler, `${name}: order handler`).toBeDefined();
  expect((handler as ts.ArrowFunction).modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)).toBe(true);
  const body = (handler as ts.ArrowFunction).body;
  expect(ts.isBlock(body)).toBe(true);
  const statements = (body as ts.Block).statements;
  const preparations = statements.filter(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(file) === "preparedPayment")) as ts.VariableStatement[];
  expect(preparations).toHaveLength(1);
  const declaration = preparations[0].declarationList.declarations.find(item => item.name.getText(file) === "preparedPayment")!;
  expect(declaration.initializer && ts.isAwaitExpression(declaration.initializer)).toBe(true);
  const awaited = (declaration.initializer as ts.AwaitExpression).expression;
  expect(ts.isCallExpression(awaited)).toBe(true);
  expect((awaited as ts.CallExpression).expression.getText(file)).toBe(`${paymentVariable}.preparePayment`);
  expect((awaited as ts.CallExpression).arguments).toHaveLength(0);
  const guards = statements.filter(statement => ts.isIfStatement(statement) && statement.expression.getText(file) === "!preparedPayment") as ts.IfStatement[];
  expect(guards).toHaveLength(1);
  const guard = guards[0];
  const returns = walk(guard.thenStatement, ts.isReturnStatement) as ts.ReturnStatement[];
  expect(returns).toHaveLength(1);
  expect(returns[0].expression).toBeUndefined();
  expect(ts.isReturnStatement(guard.thenStatement) || (ts.isBlock(guard.thenStatement) && guard.thenStatement.statements.length === 1 && ts.isReturnStatement(guard.thenStatement.statements[0]))).toBe(true);
  expect(preparations[0].end).toBeLessThan(guard.getStart(file));
  expect(guard.end).toBeLessThan(create.getStart(file));
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
function findElements(node: any, predicate: (node: any) => boolean): any[] {
  if (Array.isArray(node)) return node.flatMap(item => findElements(item, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...findElements((node.props as any).children, predicate)];
}
function paymentCard(node: any, code: string) {
  const card = findElement(node, element => element.props["data-payment-asset"] === code);
  expect(card, `real card ${code}`).toBeDefined();
  return card;
}
function assertSummarySelection(summary: any, payment: MibanMixedPayment, codes: string[], accent = "#8d292c") {
  const description = findElement(summary, node => node.props["data-payment-selected-assets"] !== undefined);
  expect(description).toBeDefined();
  const lines = React.Children.toArray(description.props.children);
  expect(lines).toHaveLength(2);
  expect(visibleText(lines[0])).toBe(codes.length ? `已选币种：${codes.map(code => code === "CNY" ? "人民币" : code).join(" + ")}` : "尚未选择付款币种");
  expect(visibleText(lines[1])).toBe(`本次付款：${payment.paymentSummary}`);
  for (const card of findElements(summary, node => node.props["data-payment-asset"] !== undefined)) {
    const selected = codes.includes(card.props["data-payment-asset"]);
    expect(card.props["data-payment-selected"]).toBe(selected);
    expect(card.props.style.borderColor).toBe(selected ? accent : "#e5e7eb");
    const button = findElement(card, node => node.type === "button");
    expect(button.props["aria-pressed"]).toBe(selected);
    expect(visibleText(button)).toContain(selected ? "已选" : "点选");
    expect(renderToStaticMarkup(card).includes("lucide-check")).toBe(selected);
  }
  const combined = findElement(summary, node => node.type === "button" && visibleText(node) === "多币种联合支付");
  expect(combined.props["aria-pressed"]).toBe(payment.selectedCodes.length > 1);
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
  it("uses only the authenticated real order quote endpoint without polling, focus/reconnect refresh or a seconds timer", () => {
    paymentHarness().render();
    expect(boundary.quoteQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: true, refetchInterval: false, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false }));
    expect(vi.getTimerCount()).toBe(0);
    const text = source("MibanMixedPayment");
    expect(text).toContain("mtrpc.order.walletPaymentQuote.useQuery");
    expect(text).toContain("buildMibanPaymentPlan");
    expect(text).not.toMatch(/FALLBACK|useMibanUsdtCnyRate|getCnyBalanceSummary\.useQuery|getUsdtBalanceSummary\.useQuery/);
    const file = ts.createSourceFile("MibanMixedPayment.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(walk(file, node => ts.isCallExpression(node) && /(?:^|\.)setInterval$/.test(node.expression.getText(file)))).toHaveLength(0);
    const effects = walk(file, node => ts.isCallExpression(node) && /(?:^|\.)useEffect$/.test(node.expression.getText(file)));
    for (const effect of effects) expect(walk(effect, node => ts.isCallExpression(node) && /(?:^|\.)(?:setInterval|setTimeout)$/.test(node.expression.getText(file)))).toHaveLength(0);
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
  it.each([["ETH", "0.005"], ["SOL", "0.1"]])("supports %s-only and prepares the shared plan's raw decimal strings", async (code, amount) => {
    const harness = paymentHarness();
    let payment = harness.render();
    payment.useOnlyAsset(code);
    payment = harness.render();
    expect(payment.selectedCodes).toEqual([code]);
    expect(payment.paymentAssets).toEqual([{ assetCode: code, amount }]);
    expect(payment.paymentSummary).toContain(`${amount} ${code}`);
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.canPay).toBe(true);
    const fresh = freshQuote();
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    const payload = await payment.preparePayment();
    expect(payload).toEqual({ cnyAmount: 0, paymentAssets: [{ assetCode: code, amount }], paymentQuoteToken: fresh.quoteToken });
    expect(Object.keys(payload!.paymentAssets[0])).toEqual(["assetCode", "amount"]);
    expect(harness.render().canPay).toBe(true);
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
  it("ignores shared query fetching/errors/new data; only an explicit refresh replaces the page snapshot and clears review", async () => {
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
    expect(payment.canPay).toBe(true);
    expect(payment.reviewed).toBe(true);
    expect(payment.refreshing).toBe(false);
    expect(payment.paymentQuoteToken).toBe("unit-fixture-signature");
    setQuote(undefined, { isError: true });
    payment = harness.render();
    expect(payment.paymentAssets).toBe(previousAssets);
    expect(payment.reviewed).toBe(true);
    const fresh = freshQuote(fixture().assets, { quoteToken: "new-real-quote-token" });
    setQuote(fresh);
    payment = harness.render();
    expect(payment.paymentQuoteToken).toBe("unit-fixture-signature");
    expect(payment.paymentAssets).toBe(previousAssets);
    expect(payment.reviewed).toBe(true);
    const request = deferredQuote();
    boundary.query.refetch.mockReturnValue(request.promise);
    payment.refresh();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    payment = harness.render();
    expect(payment.refreshing).toBe(true);
    expect(payment.canPay).toBe(false);
    expect(payment.reviewed).toBe(false);
    expect(payment.paymentQuoteToken).toBe("");
    expect(payment.paymentAssets).toBe(previousAssets);
    request.resolve({ data: fresh });
    await request.promise;
    await flushQuoteRequest();
    payment = harness.render();
    expect(payment.paymentQuoteToken).toBe("new-real-quote-token");
    expect(payment.paymentAssets).toEqual(previousAssets);
    expect(payment.selectedCodes).toEqual(["ETH"]);
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    payment.confirmPaymentReview(true);
    expect(harness.render().canPay).toBe(true);
  });
  it("natural expiry does not revoke the ability to initiate verification but never exposes an expired token", async () => {
    const harness = paymentHarness();
    let payment = harness.render();
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.canPay).toBe(true);
    vi.setSystemTime(NOW + 60_001);
    expect(payment.canPay).toBe(true);
    payment = harness.render();
    expect(payment.quoteExpired).toBe(true);
    expect(payment.paymentQuoteToken).toBe("");
    const fresh = freshQuote();
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    const prepared = await payment.preparePayment();
    expect(prepared?.paymentQuoteToken).toBe(fresh.quoteToken);
    expect(prepared?.paymentAssets).toEqual(payment.paymentAssets);
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
  });
  it("keeps the fixed display and checkbox approval on natural expiry, without fetching or treating the old token as submittable", () => {
    const harness = paymentHarness();
    let payment = harness.render();
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.reviewed).toBe(true);
    const previousAssets = payment.paymentAssets;
    vi.setSystemTime(NOW + 60_001);
    const expired = harness.render();
    expect(expired.quoteExpired).toBe(true);
    expect(expired.ready).toBe(true);
    expect(expired.reviewed).toBe(true);
    expect(expired.canPay).toBe(true);
    expect(expired.paymentQuoteToken).toBe("");
    expect(expired.paymentAssets).toBe(previousAssets);
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment: expired }));
    harnesses.push(allocation);
    const checkbox = findElement(allocation.render(), node => node.props["aria-label"] === "确认本次实际扣币明细");
    expect(checkbox.props.checked).toBe(true);
    expect(checkbox.props.disabled).toBe(false);
    expect(boundary.query.refetch).not.toHaveBeenCalled();
    vi.setSystemTime(NOW + 10_000);
    expect(harness.render().reviewed).toBe(true);
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
  it("keeps plan references stable without timers and rejects future-dated crypto on first adoption", () => {
    const harness = paymentHarness();
    const first = harness.render();
    vi.advanceTimersByTime(1_000);
    const next = harness.render();
    expect(next.paymentAssets).toBe(first.paymentAssets);
    expect(next.deductions).toBe(first.deductions);
    expect(vi.getTimerCount()).toBe(0);
    setQuote(quote([row("ETH", "1", "14000", "0", { priceUpdatedAt: new Date(NOW + 10_000).toISOString() })]));
    expect(harness.render().paymentAssets).toBe(first.paymentAssets);
    const invalid = paymentHarness().render();
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

describe("async preparePayment revalidates approved native quantities before any order DTO", () => {
  function reviewedHarness(total: number | (() => number) = 70, auth = () => true) {
    const harness = paymentHarness(total, auth);
    harness.render().confirmPaymentReview(true);
    const payment = harness.render();
    expect(payment.reviewed).toBe(true);
    expect(payment.canPay).toBe(true);
    return { harness, payment };
  }
  function expectVisibleNotice(payment: MibanMixedPayment, pattern: RegExp) {
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    expect(payment.statusMessage).toMatch(pattern);
    expect(visibleText(allocation.render())).toMatch(pattern);
  }
  it("does not produce a DTO or refetch until an affordable native-quantity plan has explicit review", async () => {
    const harness = paymentHarness();
    const payment = harness.render();
    expect(await payment.preparePayment()).toBeNull();
    expect(boundary.query.refetch).not.toHaveBeenCalled();
    setQuote(quote([row("SOL", "0.001", "700")]));
    const insufficient = paymentHarness().render();
    insufficient.confirmPaymentReview(true);
    expect(await insufficient.preparePayment()).toBeNull();
    expect(boundary.query.refetch).not.toHaveBeenCalled();
  });
  it("refetches on initial confirmation even while the display token is valid, returns only the new signed DTO and retains same-quantity approval", async () => {
    const { harness, payment } = reviewedHarness();
    const approved = payment.paymentAssets;
    const fresh = freshQuote();
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    const prepared = await payment.preparePayment();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    expect(boundary.query.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(prepared).toEqual({ cnyAmount: 14, paymentAssets: approved, paymentQuoteToken: fresh.quoteToken });
    expect(Object.keys(prepared!).sort()).toEqual(["cnyAmount", "paymentAssets", "paymentQuoteToken"]);
    expect(prepared!.paymentAssets.every(asset => Object.keys(asset).sort().join() === "amount,assetCode")).toBe(true);
    expect(prepared!.paymentQuoteToken).not.toBe(payment.paymentQuoteToken);
    const next = harness.render();
    expect(next.paymentAssets).toEqual(approved);
    expect(next.reviewed).toBe(true);
    expect(next.canPay).toBe(true);
  });
  it("preserves explicit combined selection, priority and CNY cap when rebuilding at native precision", async () => {
    const data = quote([row("CNY", "40", "1", "900"), row("ETH", "0.002", "14000", "20"), row("SOL", "0.1", "700", "100"), row("USDT", "2", "7", "800")]);
    setQuote(data);
    const harness = paymentHarness();
    let payment = harness.render();
    payment.useCombinedAssets();
    payment = harness.render();
    payment.prioritizeAsset("ETH");
    payment = harness.render();
    payment.setCnyInput("10.00");
    payment = harness.render();
    payment.confirmPaymentReview(true);
    payment = harness.render();
    const priority = payment.deductions.map(item => item.assetCode);
    expect(priority[0]).toBe("ETH");
    expect(payment.cnyAmount).toBe(10);
    const fresh = freshQuote(data.assets);
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    const prepared = await payment.preparePayment();
    expect(prepared?.paymentAssets).toEqual(buildMibanPaymentPlan(70, fresh, priority, "10.00", Date.now()).paymentAssets);
    expect(prepared?.paymentAssets).toEqual(payment.paymentAssets);
    expect(prepared?.cnyAmount).toBe(10);
    const next = harness.render();
    expect([...next.selectedCodes].sort()).toEqual([...payment.selectedCodes].sort());
    expect(next.priorityCode).toBe("ETH");
    expect(next.cnyInput).toBe("10.00");
    expect(next.reviewed).toBe(true);
  });
  it("rejects even a tiny raw USDT amount change hidden by identical two-decimal U display; second reviewed confirmation uses the staged quote without refetch", async () => {
    const data = quote([row("USDT", "594.9506102699997", "6.6714", "1.12345678")]);
    setQuote(data);
    const { harness, payment } = reviewedHarness(228);
    const fresh = freshQuote([row("USDT", "594.9506102699997", "6.671401", "1.12345678")]);
    const expected = buildMibanPaymentPlan(228, fresh, ["USDT"], undefined, Date.now()).paymentAssets;
    expect(paymentDecimalUnits(expected[0].amount)).not.toBe(paymentDecimalUnits(payment.paymentAssets[0].amount));
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    expect(await payment.preparePayment()).toBeNull();
    let next = harness.render();
    expect(next.paymentAssets).toEqual(expected);
    expect(next.paymentAssets[0].amount).not.toBe(payment.paymentAssets[0].amount);
    expect(next.paymentSummary).toBe(payment.paymentSummary);
    expect(next.paymentSummary).toBe("34.18 U");
    expect(next.reviewed).toBe(false);
    expect(next.canPay).toBe(false);
    expectVisibleNotice(next, /扣币有变化/);
    expect(await next.preparePayment()).toBeNull();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    next.confirmPaymentReview(true);
    next = harness.render();
    expect(next.reviewed).toBe(true);
    expect(await next.preparePayment()).toEqual({ cnyAmount: 0, paymentAssets: expected, paymentQuoteToken: fresh.quoteToken });
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
  });
  it.each(["reject", "queryError", "noData"])("returns no DTO and preserves the last real snapshot after %s, with a visible failure", async failure => {
    const { harness, payment } = reviewedHarness();
    const before = { assets: payment.paymentAssets, deductions: payment.deductions, summary: payment.paymentSummary, quotedAt: payment.quotedAt };
    if (failure === "reject") boundary.query.refetch.mockRejectedValue(new Error("unit transport failure"));
    if (failure === "queryError") boundary.query.refetch.mockResolvedValue({ data: freshQuote(), isError: true });
    if (failure === "noData") boundary.query.refetch.mockResolvedValue({ data: undefined });
    expect(await payment.preparePayment()).toBeNull();
    const next = harness.render();
    expect(next.paymentAssets).toBe(before.assets);
    expect(next.deductions).toBe(before.deductions);
    expect(next.paymentSummary).toBe(before.summary);
    expect(next.quotedAt).toBe(before.quotedAt);
    expect(next.paymentQuoteToken).toBe("");
    expect(next.reviewed).toBe(false);
    expect(next.canPay).toBe(false);
    expectVisibleNotice(next, /核验失败/);
  });
  it("returns no DTO when selected balances drop, retaining the choice without silently topping up from wealthy unchecked coins", async () => {
    const { harness, payment } = reviewedHarness();
    const fresh = freshQuote(fixture().assets.map(asset => asset.assetCode === "SOL" ? { ...asset, available: "0.001" } : asset.assetCode === "USDT" ? { ...asset, available: "10000" } : asset));
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    expect(await payment.preparePayment()).toBeNull();
    const next = harness.render();
    expect(next.selectedCodes).toEqual(["CNY", "SOL"]);
    expect(next.selectedDigitalCode).toBe("SOL");
    expect(next.paymentAssets).toEqual([{ assetCode: "CNY", amount: "14" }, { assetCode: "SOL", amount: "0.001" }]);
    expect(next.paymentAssets.some(asset => asset.assetCode === "USDT" || asset.assetCode === "ETH")).toBe(false);
    expect(paymentDecimalUnits(next.remainingCny)).toBeGreaterThan(0n);
    expect(next.reviewed).toBe(false);
    expect(next.canPay).toBe(false);
    next.confirmPaymentReview(true);
    expect(harness.render().reviewed).toBe(false);
    expect(await harness.render().preparePayment()).toBeNull();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    expectVisibleNotice(next, /不足/);
  });
  it.each(["expiryEqual", "expired", "missingToken", "invalidRate", "invalidDate", "futureQuote", "malformedAssets"])("never adopts or returns an invalid fresh quote (%s)", async invalid => {
    const { harness, payment } = reviewedHarness();
    const fresh = freshQuote();
    if (invalid === "expiryEqual") fresh.expiresAt = new Date(Date.now()).toISOString();
    if (invalid === "expired") fresh.expiresAt = new Date(Date.now() - 1).toISOString();
    if (invalid === "missingToken") fresh.quoteToken = "";
    if (invalid === "invalidRate") fresh.usdtCnyRate = "0";
    if (invalid === "invalidDate") fresh.quotedAt = "invalid-date";
    if (invalid === "futureQuote") fresh.quotedAt = new Date(Date.now() + 5_001).toISOString();
    if (invalid === "malformedAssets") fresh.assets = null as any;
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    expect(await payment.preparePayment()).toBeNull();
    const next = harness.render();
    expect(next.paymentAssets).toBe(payment.paymentAssets);
    expect(next.deductions).toBe(payment.deductions);
    expect(next.paymentQuoteToken).toBe("");
    expect(next.reviewed).toBe(false);
    expect(next.canPay).toBe(false);
    expectVisibleNotice(next, /核验失败/);
  });
  it("allows only one pending refetch across repeated confirm and explicit refresh calls", async () => {
    const { harness, payment } = reviewedHarness();
    const request = deferredQuote();
    boundary.query.refetch.mockReturnValue(request.promise);
    const first = payment.preparePayment();
    expect(payment.canPay).toBe(false);
    expect(await payment.preparePayment()).toBeNull();
    payment.refresh();
    const waiting = harness.render();
    expect(waiting.refreshing).toBe(true);
    expect(await waiting.preparePayment()).toBeNull();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    const fresh = freshQuote();
    request.resolve({ data: fresh });
    expect(await first).toEqual({ cnyAmount: 14, paymentAssets: payment.paymentAssets, paymentQuoteToken: fresh.quoteToken });
    expect(harness.render().refreshing).toBe(false);
  });
  it("times out a pending verification after 15s, unlocks without a DTO, and ignores its late result even after successful explicit recovery", async () => {
    const { harness, payment } = reviewedHarness();
    const request = deferredQuote();
    boundary.query.refetch.mockReturnValueOnce(request.promise);
    const pending = payment.preparePayment();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(harness.render().refreshing).toBe(true);
    expect(await payment.preparePayment()).toBeNull();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
    let next = harness.render();
    expect(next.refreshing).toBe(false);
    expect(next.paymentAssets).toBe(payment.paymentAssets);
    expect(next.deductions).toBe(payment.deductions);
    expect(next.reviewed).toBe(false);
    expect(next.canPay).toBe(false);
    expect(next.paymentQuoteToken).toBe("");
    expectVisibleNotice(next, /核验失败/);
    expect(vi.getTimerCount()).toBe(0);
    const recovery = freshQuote(fixture().assets, { quoteToken: "recovery-signature" });
    boundary.query.refetch.mockResolvedValueOnce({ data: recovery });
    next.refresh();
    await flushQuoteRequest();
    next = harness.render();
    expect(next.ready).toBe(true);
    expect(next.paymentQuoteToken).toBe(recovery.quoteToken);
    const recoveredAssets = next.paymentAssets;
    const late = freshQuote([row("USDT", "10000", "1")], { quoteToken: "late-must-never-apply" });
    request.resolve({ data: late });
    await request.promise;
    await flushQuoteRequest();
    boundary.query.data = late; // A late shared-cache write is not an explicit page refresh.
    next = harness.render();
    expect(next.paymentQuoteToken).toBe(recovery.quoteToken);
    expect(next.paymentAssets).toBe(recoveredAssets);
    expect(next.reviewed).toBe(false);
    expect(next.canPay).toBe(false);
    expect(boundary.query.refetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects a quote that was valid when requested but has reached expiry when the pending response resolves", async () => {
    const { harness, payment } = reviewedHarness();
    const request = deferredQuote();
    const fresh = freshQuote(fixture().assets, { expiresAt: new Date(Date.now() + 1_000).toISOString() });
    boundary.query.refetch.mockReturnValue(request.promise);
    const pending = payment.preparePayment();
    vi.setSystemTime(Date.parse(fresh.expiresAt));
    request.resolve({ data: fresh });
    expect(await pending).toBeNull();
    const next = harness.render();
    expect(next.paymentAssets).toBe(payment.paymentAssets);
    expect(next.paymentQuoteToken).toBe("");
    expect(next.canPay).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the approved combined ordering when new wallet available-value ranking reverses", async () => {
    const data = quote([row("SOL", "0.02", "700"), row("ETH", "0.003", "14000"), row("USDT", "3", "7"), row("BNB", "0.02", "1400")]);
    setQuote(data);
    const harness = paymentHarness();
    let payment = harness.render();
    payment.useCombinedAssets();
    payment = harness.render();
    payment.prioritizeAsset("SOL");
    payment = harness.render();
    expect(payment.paymentAssets.map(asset => asset.assetCode)).toEqual(["SOL", "USDT", "ETH"]);
    payment.confirmPaymentReview(true);
    payment = harness.render();
    expect(payment.reviewed).toBe(true);
    expect(payment.canPay).toBe(true);
    const fresh = freshQuote(data.assets.map(asset => asset.assetCode === "BNB" ? { ...asset, available: "1" } : asset));
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    const prepared = await payment.preparePayment();
    expect(prepared?.paymentAssets).toEqual(payment.paymentAssets);
    const next = harness.render();
    expect(next.paymentAssets).toEqual(payment.paymentAssets);
    expect(next.deductions.map(asset => asset.assetCode)).toEqual(["SOL", "USDT", "ETH"]);
    expect(next.priorityCode).toBe("SOL");
    expect(next.reviewed).toBe(true);
  });
  it.each(["reset", "cancelPendingPayment", "totalChanged", "disabled", "unmount"])("cancels pending preparation on %s: no DTO and no stale snapshot adoption", async cancellation => {
    let total = 70;
    let auth = true;
    const { harness, payment } = reviewedHarness(() => total, () => auth);
    const request = deferredQuote();
    boundary.query.refetch.mockReturnValue(request.promise);
    const pending = payment.preparePayment();
    if (cancellation === "reset") payment.resetToCnyFirst();
    if (cancellation === "cancelPendingPayment") payment.cancelPendingPayment();
    if (cancellation === "totalChanged") total = 71;
    if (cancellation === "disabled") auth = false;
    if (cancellation === "unmount") harness.cleanup();
    else harness.render();
    request.resolve({ data: freshQuote(fixture().assets, { quoteToken: "must-not-be-adopted" }) });
    expect(await pending).toBeNull();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    if (cancellation !== "unmount") {
      const next = harness.render();
      expect(next.reviewed).toBe(false);
      expect(next.canPay).toBe(false);
      expect(next.paymentQuoteToken).not.toBe("must-not-be-adopted");
      if (cancellation === "disabled") expect(next.paymentAssets).toEqual([]);
    } else {
      expect(payment.canPay).toBe(false);
      expect(await payment.preparePayment()).toBeNull();
    }
  });
  it.each(["expiryEqual", "stalePrice"])("requires a new request instead of submitting staged approval at %s", async boundaryState => {
    const { harness, payment } = reviewedHarness();
    const at = Date.now();
    const changed = freshQuote(fixture().assets.map(asset => asset.assetCode === "SOL" ? { ...asset, priceCny: "701" } : asset), {
      expiresAt: new Date(at + (boundaryState === "stalePrice" ? 180_000 : 60_000)).toISOString(),
    });
    boundary.query.refetch.mockResolvedValueOnce({ data: changed });
    expect(await payment.preparePayment()).toBeNull();
    let next = harness.render();
    next.confirmPaymentReview(true);
    next = harness.render();
    vi.setSystemTime(at + (boundaryState === "stalePrice" ? 120_001 : 60_000));
    const invalid = boundaryState === "stalePrice" ? freshQuote(changed.assets) : freshQuote();
    if (boundaryState === "stalePrice") invalid.assets = invalid.assets.map(asset => asset.assetCode === "SOL" ? { ...asset, priceUpdatedAt: new Date(at).toISOString() } : asset);
    if (boundaryState === "expiryEqual") invalid.expiresAt = new Date(Date.now()).toISOString();
    boundary.query.refetch.mockResolvedValueOnce({ data: invalid });
    expect(await next.preparePayment()).toBeNull();
    expect(boundary.query.refetch).toHaveBeenCalledTimes(2);
    const after = harness.render();
    expect(after.canPay).toBe(false);
    expect(after.reviewed).toBe(false);
    if (boundaryState === "stalePrice") {
      expect(after.paymentAssets.some(asset => asset.assetCode === "SOL")).toBe(false);
      expect(after.assetRows.find(asset => asset.assetCode === "SOL")?.disabledReason).toMatch(/过时/);
    } else expect(after.paymentQuoteToken).toBe("");
  });
  it("refetches again when the user changes staged quantities instead of reusing a changed-quote approval", async () => {
    const { harness, payment } = reviewedHarness();
    const changed = freshQuote(fixture().assets.map(asset => asset.assetCode === "SOL" ? { ...asset, priceCny: "701" } : asset));
    boundary.query.refetch.mockResolvedValueOnce({ data: changed });
    expect(await payment.preparePayment()).toBeNull();
    let next = harness.render();
    next.useOnlyAsset("ETH");
    next = harness.render();
    next.confirmPaymentReview(true);
    next = harness.render();
    const fresh = freshQuote(changed.assets, { quoteToken: "new-selection-signature" });
    boundary.query.refetch.mockResolvedValueOnce({ data: fresh });
    expect(await next.preparePayment()).toEqual({ cnyAmount: 0, paymentAssets: [{ assetCode: "ETH", amount: "0.005" }], paymentQuoteToken: fresh.quoteToken });
    expect(boundary.query.refetch).toHaveBeenCalledTimes(2);
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
    expect(html).toContain("扣币变化需重新确认");
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
  it.each(["missing", "zero", "negative", "allFrozen"])("renders only the genuine digital category without a synthetic CNY card (%s)", state => {
    const assets = [row("SOL", "0.1", "700", "99")];
    if (state !== "missing") assets.unshift(row("CNY", state === "negative" ? "-957" : "0", "1", state === "allFrozen" ? "626000" : "0"));
    setQuote(quote(assets));
    const payment = paymentHarness().render();
    const summary = MibanWalletAvailableSummary({ payment });
    const html = renderToStaticMarkup(summary);
    const categories = findElement(summary, node => node.props["data-payment-categories"] !== undefined);
    expect(categories.props.className).toMatch(/\bgrid-cols-1\b/);
    expect(React.Children.toArray(categories.props.children)).toHaveLength(1);
    expect((html.match(/data-payment-asset=/g) ?? [])).toHaveLength(1);
    expect(findElement(summary, node => node.props["data-payment-asset"] === "CNY")).toBeUndefined();
    expect(findElement(summary, node => node.props["aria-label"] === "使用人民币支付")).toBeUndefined();
    expect(html).not.toContain("grid-cols-2");
    expect(html).toContain("数字币");
    expect(html).not.toContain("暂无可用人民币");
    expect(html).not.toContain("可用 ¥0.00");
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
  it("all-frozen wallets render a real empty state with no category cards, combobox or synthetic balance", () => {
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
    expect(findElement(summary, node => node.props["data-payment-categories"] !== undefined)).toBeUndefined();
    expect(visibleText(findElement(summary, node => node.props["data-payment-empty"] !== undefined))).toBe("暂无可用于本次付款的余额，请先充值。");
    expect(html).not.toContain("data-payment-asset=");
    expect(html).not.toContain("暂无可用人民币");
    expect(html).not.toContain("可用 ¥0.00");
    expect(findElement(summary, node => node.type === "select")).toBeUndefined();
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

describe("truthful summary cards reflect real selected rows, not dropdown candidates", () => {
  const accent = "#8d292c";
  const summaryOf = (payment: MibanMixedPayment, disabled = false) => MibanWalletAvailableSummary({ payment, accent, disabled });
  it.each(["missing", "unusable"])("CNY-only wallets never render a digital card or combobox (%s)", state => {
    const assets = [row("CNY", "80", "1", "900")];
    if (state === "unusable") assets.push(row("USDT", "0", "7", "800"), row("SOL", "1", null), row("ETH", "1", "14000", "0", { unavailableReason: "行情暂不可用" }));
    setQuote(quote(assets));
    const payment = paymentHarness().render();
    const summary = summaryOf(payment);
    const grid = findElement(summary, node => node.props["data-payment-categories"] !== undefined);
    expect(grid.props.className).toMatch(/\bgrid-cols-1\b/);
    expect(React.Children.toArray(grid.props.children)).toHaveLength(1);
    expect(findElements(summary, node => node.props["data-payment-asset"] !== undefined).map(card => card.props["data-payment-asset"])).toEqual(["CNY"]);
    expect(findElement(summary, node => node.type === "select")).toBeUndefined();
    expect(renderToStaticMarkup(summary)).not.toContain("数字币</span>");
    expect(payment.paymentAssets).toEqual([{ assetCode: "CNY", amount: "70" }]);
    expect(findElement(summary, node => node.type === "button" && visibleText(node) === "多币种联合支付").props.disabled).toBe(true);
    assertSummarySelection(summary, payment, ["CNY"], accent);
  });
  it("two usable categories use two columns with actual selected cards", () => {
    const payment = paymentHarness().render();
    const summary = summaryOf(payment);
    const grid = findElement(summary, node => node.props["data-payment-categories"] !== undefined);
    expect(grid.props.className).toMatch(/\bgrid-cols-2\b/);
    expect(React.Children.toArray(grid.props.children)).toHaveLength(2);
    assertSummarySelection(summary, payment, ["CNY", "SOL"], accent);
  });
  it.each(["empty", "initialError"])("has no fabricated cards or selected currencies in a wholly unavailable wallet (%s)", state => {
    setQuote(state === "empty" ? quote([]) : undefined, { isError: state === "initialError" });
    const payment = paymentHarness().render();
    const summary = summaryOf(payment);
    expect(findElements(summary, node => node.props["data-payment-asset"] !== undefined)).toHaveLength(0);
    expect(findElement(summary, node => node.props["data-payment-categories"] !== undefined)).toBeUndefined();
    expect(findElement(summary, node => node.type === "select")).toBeUndefined();
    const empty = findElement(summary, node => node.props["data-payment-empty"] !== undefined);
    expect(empty).toBeDefined();
    expect(visibleText(empty)).toBe(state === "empty" ? "暂无可用于本次付款的余额，请先充值。" : "钱包报价暂不可用，请刷新后再选择。");
    expect(renderToStaticMarkup(summary)).not.toContain("可用 ¥0.00");
    expect(payment.paymentAssets).toEqual([]);
    expect(payment.canPay).toBe(false);
    assertSummarySelection(summary, payment, [], accent);
  });
  it("clicking CNY leaves a real default digital dropdown candidate but never highlights or selects it", () => {
    setQuote(quote([row("CNY", "80", "1"), row("SOL", "1", "700"), row("ETH", "0.02", "14000")]));
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.reviewed).toBe(true);
    findElement(summaryOf(payment), node => node.props["aria-label"] === "使用人民币支付").props.onClick();
    payment = wallet.render();
    expect(payment.selectedCodes).toEqual(["CNY"]);
    expect(payment.selectedDigitalCode).toBe("SOL");
    expect(payment.paymentAssets).toEqual([{ assetCode: "CNY", amount: "70" }]);
    expect(payment.reviewed).toBe(false);
    const summary = summaryOf(payment);
    expect(findElement(summary, node => node.type === "select").props.value).toBe("SOL");
    assertSummarySelection(summary, payment, ["CNY"], accent);
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment, accent }));
    harnesses.push(allocation);
    const digitalCard = paymentCard(allocation.render(), "SOL");
    expect(digitalCard.props["data-payment-selected"]).toBe(false);
    expect(digitalCard.props.style.borderColor).not.toBe(accent);
    expect(visibleText(digitalCard)).not.toContain("已选");
    expect(findElement(digitalCard, node => node.props["aria-label"] === "参与支付 SOL").props.checked).toBe(false);
  });
  it("clicking the digital balance card cancels CNY and matches the allocation's sole actual debit", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    findElement(summaryOf(payment), node => node.props["aria-label"] === "使用人民币支付").props.onClick();
    payment = wallet.render();
    findElement(summaryOf(payment), node => node.props["aria-label"] === "使用SOL支付").props.onClick();
    payment = wallet.render();
    expect(payment.selectedCodes).toEqual(["SOL"]);
    expect(payment.cnyAmount).toBe(0);
    expect(payment.paymentAssets).toEqual([{ assetCode: "SOL", amount: "0.1" }]);
    expect(payment.reviewed).toBe(false);
    assertSummarySelection(summaryOf(payment), payment, ["SOL"], accent);
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment, accent }));
    harnesses.push(allocation);
    const element = allocation.render();
    expect(paymentCard(element, "CNY").props["data-payment-selected"]).toBe(false);
    expect(paymentCard(element, "SOL").props["data-payment-selected"]).toBe(true);
    expect(visibleText(paymentCard(element, "SOL"))).toContain("本次扣币 0.1 SOL");
    expect(visibleText(element)).toContain(`实际付款：${payment.paymentSummary}`);
  });
  it.each(["ETH", "USDT"])("summary dropdown clears review and preserves native %s quantities instead of display rounding", code => {
    const data = quote([row("CNY", "14", "1"), row("SOL", "1", "700"), row("ETH", "1", "14000"), row("USDT", "594.9506102699997", "6.6714")]);
    setQuote(data);
    const wallet = paymentHarness(228);
    let payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
    findElement(summaryOf(payment), node => node.type === "select").props.onChange({ target: { value: code } });
    payment = wallet.render();
    const expected = buildMibanPaymentPlan(228, data, [code], undefined, NOW).paymentAssets;
    expect(payment.paymentAssets).toEqual(expected);
    expect(payment.selectedCodes).toEqual([code]);
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    const summary = summaryOf(payment);
    assertSummarySelection(summary, payment, [code], accent);
    expect(visibleText(summary)).toContain(code === "USDT" ? "本次付款：34.18 U" : `本次付款：${expected[0].amount} ETH`);
    if (code === "USDT") {
      expect(expected[0].amount).toBe("34.17573523");
      expect(renderToStaticMarkup(summary)).not.toContain(expected[0].amount);
    }
  });
  it("joint selection labels every genuinely selected coin even when priority alone pays the order", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.useOnlyAsset("ETH");
    payment = wallet.render();
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment, accent }));
    harnesses.push(allocation);
    findElement(allocation.render(), node => node.type === "button" && node.props["aria-expanded"] === false).props.onClick();
    payment = wallet.render();
    expect(payment.selectedCodes).toEqual(["CNY", "USDT", "SOL", "ETH"]);
    expect(payment.paymentAssets).toEqual([{ assetCode: "ETH", amount: "0.005" }]);
    assertSummarySelection(summaryOf(payment), payment, ["CNY", "USDT", "SOL", "ETH"], accent);
    for (const code of payment.selectedCodes) {
      const card = paymentCard(allocation.render(), code);
      expect(card.props["data-payment-selected"]).toBe(true);
      expect(card.props.style.borderColor).toBe(accent);
      expect(visibleText(card)).toContain("已选");
      expect(findElement(card, node => node.props["aria-label"] === `参与支付 ${code}`).props.checked).toBe(true);
    }
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
  });
  it("insufficient single-coin card cannot approve review or prepare a DTO and cannot invent joint funding", async () => {
    setQuote(quote([row("CNY", "14", "1", "900"), row("USDT", "0", "7", "800")]));
    const wallet = paymentHarness();
    let payment = wallet.render();
    const summary = summaryOf(payment);
    findElement(summary, node => node.props["aria-label"] === "使用人民币支付").props.onClick();
    payment = wallet.render();
    expect(payment.paymentAssets).toEqual([{ assetCode: "CNY", amount: "14" }]);
    expect(payment.remainingCny).toBe("56");
    expect(findElement(summaryOf(payment), node => node.type === "button" && visibleText(node) === "多币种联合支付").props.disabled).toBe(true);
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment, accent }));
    harnesses.push(allocation);
    const review = findElement(allocation.render(), node => node.props["aria-label"] === "确认本次实际扣币明细");
    expect(review.props.disabled).toBe(true);
    review.props.onChange({ target: { checked: true } });
    payment = wallet.render();
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    expect(await payment.preparePayment()).toBeNull();
    expect(boundary.query.refetch).not.toHaveBeenCalled();
  });
  it("cancelling every coin keeps available cards as point-to-select with no phantom default highlight", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.toggleAsset("CNY");
    payment = wallet.render();
    payment.toggleAsset("SOL");
    payment = wallet.render();
    expect(payment.selectedCodes).toEqual([]);
    expect(payment.selectedDigitalCode).toBe("SOL");
    expect(payment.paymentAssets).toEqual([]);
    expect(payment.paymentSummary).toBe("尚未分配扣币");
    const summary = summaryOf(payment);
    expect(findElement(summary, node => node.type === "select").props.value).toBe("SOL");
    assertSummarySelection(summary, payment, [], accent);
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment, accent }));
    harnesses.push(allocation);
    for (const code of ["CNY", "SOL"]) {
      const card = paymentCard(allocation.render(), code);
      expect(card.props["data-payment-selected"]).toBe(false);
      expect(card.props.style.borderColor).not.toBe(accent);
      expect(visibleText(card)).not.toContain("已选");
    }
    expect(payment.canPay).toBe(false);
  });
  it("cards expose native keyboard-operable buttons with boolean aria-pressed instead of clickable divs", () => {
    const payment = paymentHarness().render();
    const summary = summaryOf(payment);
    for (const [code, label] of [["CNY", "使用人民币支付"], ["SOL", "使用SOL支付"]]) {
      const card = paymentCard(summary, code);
      expect(card.type).toBe("div");
      expect(card.props.onClick).toBeUndefined();
      expect(card.props["aria-pressed"]).toBeUndefined();
      const button = findElement(card, node => node.props["aria-label"] === label);
      expect(button.type).toBe("button");
      expect(button.props.type).toBe("button");
      expect(typeof button.props.onClick).toBe("function");
      expect(button.props.disabled).toBe(false);
      expect(button.props.tabIndex ?? 0).toBeGreaterThanOrEqual(0);
      expect(button.props["aria-pressed"]).toBe(true);
      expect(button.props.className).toContain("focus-visible:ring-2");
    }
    expect(renderToStaticMarkup(summary)).toContain('aria-pressed="true"');
  });
  it("summary disabled=true locks all callbacks even with ready=true and preserves the approved real hook choice", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.useOnlyAsset("ETH");
    payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.ready).toBe(true);
    expect(payment.reviewed).toBe(true);
    const before = payment;
    const summary = summaryOf(payment, true);
    const controls = findElements(summary, node => node.type === "button" || node.type === "select");
    expect(controls).toHaveLength(4);
    for (const control of controls) {
      expect(control.props.disabled).toBe(true);
      if (control.type === "select") control.props.onChange({ target: { value: "SOL" } });
      else control.props.onClick();
      payment = wallet.render();
      expect(payment.selectedCodes).toBe(before.selectedCodes);
      expect(payment.paymentAssets).toBe(before.paymentAssets);
      expect(payment.reviewed).toBe(true);
    }
    expect(payment.selectedCodes).toEqual(["ETH"]);
    assertSummarySelection(summary, payment, ["ETH"], accent);
    expect(boundary.query.refetch).not.toHaveBeenCalled();
  });
});

describe("all six authorized files: real payload references and regression protection", () => {
  it("Herbalife's go-to-payment button uses the selected native payment summary while U remains an equivalent reference", () => {
    const text = source("HerbalifeRedGinsengDetail");
    const file = ts.createSourceFile("HerbalifeRedGinsengDetail.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const buttons = walk(file, node => ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === "button" && node.getText(file).includes("去支付"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getText(file)).toContain("${paymentSummary}");
    const aliases = walk(file, node => ts.isVariableDeclaration(node) && node.name.getText(file) === "paymentSummary") as ts.VariableDeclaration[];
    expect(aliases).toHaveLength(1);
    expect(aliases[0].initializer!.getText(file)).toBe("walletPayment.paymentSummary");
    expect(buttons[0].getText(file)).not.toContain("orderAmountUsdt");
    expect(buttons[0].getText(file)).not.toContain("totalPriceU");
    expect(text).toContain("const totalPriceU = cnyToU(totalPrice, usdtCnyRate)");
    expect(text).toContain('Number.isFinite(usdtCnyRate) ? totalPriceU.toFixed(2) : "--"');
    const summaryCalls = walk(file, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "MibanWalletAvailableSummary") as ts.JsxSelfClosingElement[];
    expect(summaryCalls).toHaveLength(1);
    expect(summaryCalls[0].getText(file)).toContain("accent={accent}");
    expect(summaryCalls[0].getText(file)).toContain("disabled={createOrder.isPending}");
  });
  const entries = ["HerbalifeRedGinsengDetail", "LimitedProductCart", "CartDrawer", "TianguiPearDetail", "DiyWorkshop"];
  it.each(entries)("%s awaits preparation and null-guards before creating an order with only the prepared DTO, invalidating real wallet queries", name => {
    const payload = orderPayload(name);
    const paymentVariable = name === "LimitedProductCart" ? "payment" : "walletPayment";
    expect(initializer(payload, "cnyAmount")).toBe("preparedPayment.cnyAmount");
    expect(initializer(payload, "paymentAssets")).toBe("preparedPayment.paymentAssets");
    expect(initializer(payload, "paymentQuoteToken")).toBe("preparedPayment.paymentQuoteToken");
    assertPreparedBeforeCreate(name, paymentVariable);
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
    expect(text).toContain("export type MibanPreparedPayment");
    expect(text).toContain("preparePayment");
    expect(text).toContain("cancelPendingPayment");
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
    expect(text(allocationSlot)).toContain("付款时核验");
    expect(text(summarySlot)).not.toMatch(/\d+\s*秒|倒计时/);
    expect(text(allocationSlot)).not.toMatch(/\d+\s*秒|倒计时/);
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

  it("keeps page markup, raw plan references and the reviewed checkbox unchanged for at least 180s without refetch or intervals", async () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    const first = payment;
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    const firstElement = allocation.render();
    const firstSummary = MibanWalletAvailableSummary({ payment });
    const firstAllocationHtml = renderToStaticMarkup(firstElement);
    const firstSummaryHtml = renderToStaticMarkup(firstSummary);
    const refetch = boundary.query.refetch;
    for (let tick = 0; tick < 3; tick++) {
      await vi.advanceTimersByTimeAsync(60_000);
      if (tick === 0) boundary.query.isFetching = true;
      if (tick === 1) { boundary.query.data = freshQuote([row("USDT", "10000", "1")]); boundary.query.isFetching = false; }
      if (tick === 2) { boundary.query.isError = true; boundary.query.data = undefined; }
      payment = wallet.render();
      expect(payment.paymentAssets).toBe(first.paymentAssets);
      expect(payment.deductions).toBe(first.deductions);
      expect(payment.selectedCodes).toBe(first.selectedCodes);
      expect(payment.paymentSummary).toBe(first.paymentSummary);
      expect(payment.availableValueCny).toBe(first.availableValueCny);
      expect(payment.reviewed).toBe(true);
      expect(payment.ready).toBe(true);
      expect(payment.canPay).toBe(true); // Only permission to initiate fresh verification.
      expect(payment.paymentQuoteToken).toBe("");
      const element = allocation.render();
      const summary = MibanWalletAvailableSummary({ payment });
      const checkbox = findElement(element, node => node.props["aria-label"] === "确认本次实际扣币明细");
      expect(checkbox.props.checked).toBe(true);
      expect(checkbox.props.disabled).toBe(false);
      assertStableSlots(summary, element, payment);
      expect(shape(element)).toEqual(shape(firstElement));
      expect(renderToStaticMarkup(element)).toBe(firstAllocationHtml);
      expect(renderToStaticMarkup(summary)).toBe(firstSummaryHtml);
      expect(refetch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
    expect(Date.now()).toBeGreaterThanOrEqual(NOW + 180_000);
  });

  it.each(["ready", "refresh", "error", "expired"] as const)("keeps the single-line summary and two-line allocation slots, positions and genuine asset cards in %s", async state => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    const previousSummary = MibanWalletAvailableSummary({ payment });
    const previousAllocation = allocation.render();
    assertStableSlots(previousSummary, previousAllocation, payment);

    const request = deferredQuote();
    if (state === "refresh" || state === "error") {
      boundary.query.refetch.mockReturnValue(request.promise);
      payment.refresh();
      if (state === "error") { request.reject(new Error("unit network failure")); await request.promise.catch(() => undefined); await flushQuoteRequest(); }
    }
    if (state === "expired") vi.advanceTimersByTime(60_000);
    payment = wallet.render();
    expect(payment.ready).toBe(state === "ready" || state === "expired");
    expect(payment.canPay).toBe(state === "ready" || state === "expired");
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
    if (state === "refresh") { request.resolve({ data: freshQuote() }); await request.promise; await flushQuoteRequest(); }
  });

  it.each([true, false])("retains undimmed old balances/debits but clears review, locks controls and exposes no token during explicit refresh (cached live data: %s)", async keepLiveData => {
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
    const previousSummary = MibanWalletAvailableSummary({ payment, accent: "#8d292c" });
    vi.advanceTimersByTime(15_000);
    setQuote(keepLiveData ? fixture() : undefined, { isFetching: true });
    const request = deferredQuote();
    boundary.query.refetch.mockReturnValue(request.promise);
    payment = wallet.render();
    expect(payment.refreshing).toBe(false);
    expect(payment.reviewed).toBe(true);
    payment.refresh();
    payment = wallet.render();
    expect(payment.refreshing).toBe(true);
    expect(payment.quoteExpired).toBe(false);
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
    const summary = MibanWalletAvailableSummary({ payment, accent: "#8d292c" });
    expect(shape(summary)).toEqual(shape(previousSummary));
    expect(visibleText(findElement(summary, node => node.props["data-payment-selected-assets"] !== undefined))).toBe(visibleText(findElement(previousSummary, node => node.props["data-payment-selected-assets"] !== undefined)));
    assertSummarySelection(summary, payment, ["ETH"]);
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
    for (const button of summaryPaymentControls.filter(control => control.type === "button")) button.props.onClick();
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

    request.resolve({ data: freshQuote(fixture().assets, { quoteToken: "refreshed-unit-signature" }) });
    await request.promise;
    await flushQuoteRequest();
    payment = wallet.render();
    expect(payment.ready).toBe(true);
    expect(payment.paymentQuoteToken).toBe("refreshed-unit-signature");
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    payment.confirmPaymentReview(true);
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
    payment.refresh();
    expect(boundary.query.refetch).toHaveBeenCalledTimes(2);
    payment = wallet.render();
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(false);
    await request.promise;
    await flushQuoteRequest();
  });
});
