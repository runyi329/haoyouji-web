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
  formatMibanUsdtAmount,
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
vi.mock("../client/src/lib/trpc", () => ({ trpc: { auth: { me: { useQuery: () => ({ data: undefined }) } } } }));
vi.mock("../client/src/pages/miban/mibanTrpc", () => ({
  mtrpc: { order: { walletPaymentQuote: { useQuery: boundary.quoteQuery } } },
}));
import {
  MibanMixedPaymentAllocation,
  MibanPaymentConfirmation,
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
  let payload = calls[0].arguments[0];
  if (ts.isIdentifier(payload)) {
    const name = payload.getText(file);
    const declaration = (walk(file, node => ts.isVariableDeclaration(node) && node.name.getText(file) === name) as ts.VariableDeclaration[]).find(node => node.initializer && ts.isObjectLiteralExpression(node.initializer));
    expect(declaration).toBeDefined();
    payload = declaration!.initializer!;
  }
  expect(ts.isObjectLiteralExpression(payload)).toBe(true);
  return payload as ts.ObjectLiteralExpression;
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
  const statements = walk(body, node => ts.isVariableStatement(node) || ts.isIfStatement(node));
  const preparations = statements.filter(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(file) === "preparedPayment")) as ts.VariableStatement[];
  expect(preparations).toHaveLength(1);
  const declaration = preparations[0].declarationList.declarations.find(item => item.name.getText(file) === "preparedPayment")!;
  expect(declaration.initializer && ts.isAwaitExpression(declaration.initializer)).toBe(true);
  const awaited = (declaration.initializer as ts.AwaitExpression).expression;
  expect(ts.isCallExpression(awaited)).toBe(true);
  expect((awaited as ts.CallExpression).expression.getText(file)).toBe(`${paymentVariable}.preparePayment`);
  expect((awaited as ts.CallExpression).arguments).toHaveLength(0);
  const guards = statements.filter(statement => ts.isIfStatement(statement) && walk(statement.expression, node => ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken && node.operand.getText(file) === "preparedPayment").length > 0) as ts.IfStatement[];
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
  if (!property && ["cnyAmount", "paymentAssets", "paymentQuoteToken"].includes(key)) {
    const preparedSpread = payload.properties.find(item => ts.isSpreadAssignment(item) && item.expression.getText() === "preparedPayment");
    expect(preparedSpread, `prepared DTO spread for ${key}`).toBeDefined();
    return `preparedPayment.${key}`;
  }
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
    expect(payment.canPay).toBe(true);
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
    expect(payment.canPay).toBe(true);
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
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
  });
  it("never adds other coins to an insufficient default or single coin until explicit combined selection, and allows verification without review", () => {
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
    expect(payment.canPay).toBe(true);
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
    payment = harness.render();
    expect(payment.selectedCodes).toEqual(previousSelection);
    expect(payment.ready).toBe(false);
    expect(payment.canPay).toBe(false);
    expect(payment.paymentQuoteToken).toBe("");
    expect(payment.paymentSummary).not.toMatch(/^0(\.0+)? U$/);
  });
  it("ignores shared query fetching/errors/new data; only an explicit refresh replaces the fixed page snapshot", async () => {
    const harness = paymentHarness();
    let payment = harness.render();
    payment.useOnlyAsset("ETH");
    payment = harness.render();
    expect(payment.canPay).toBe(true);
    const previousAssets = payment.paymentAssets;
    setQuote(undefined, { isFetching: true });
    payment = harness.render();
    expect(payment.paymentAssets).toBe(previousAssets);
    expect(payment.canPay).toBe(true);
    expect(payment.reviewed).toBe(false);
    expect(payment.refreshing).toBe(false);
    expect(payment.paymentQuoteToken).toBe("unit-fixture-signature");
    setQuote(undefined, { isError: true });
    payment = harness.render();
    expect(payment.paymentAssets).toBe(previousAssets);
    expect(payment.reviewed).toBe(false);
    const fresh = freshQuote(fixture().assets, { quoteToken: "new-real-quote-token" });
    setQuote(fresh);
    payment = harness.render();
    expect(payment.paymentQuoteToken).toBe("unit-fixture-signature");
    expect(payment.paymentAssets).toBe(previousAssets);
    expect(payment.reviewed).toBe(false);
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
    expect(payment.canPay).toBe(true);
    expect(harness.render().canPay).toBe(true);
  });
  it("natural expiry does not revoke the ability to initiate verification but never exposes an expired token", async () => {
    const harness = paymentHarness();
    let payment = harness.render();
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
  it("keeps the fixed display on natural expiry, without fetching or submitting the old token", () => {
    const harness = paymentHarness();
    const first = harness.render();
    vi.setSystemTime(NOW + 60_001);
    const expired = harness.render();
    expect(expired.quoteExpired).toBe(true);
    expect(expired.ready).toBe(true);
    expect(expired.canPay).toBe(true);
    expect(expired.paymentQuoteToken).toBe("");
    expect(expired.paymentAssets).toBe(first.paymentAssets);
    const element = MibanPaymentConfirmation({ payment: expired });
    expect(findElement(element, node => node.type === "input")).toBeUndefined();
    expect(visibleText(element)).toContain("0.08 SOL");
    expect(boundary.query.refetch).not.toHaveBeenCalled();
  });
  it("moves the current digital choice to a selected coin after removing the priority coin in joint payment", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.useCombinedAssets();
    payment = wallet.render();
    expect(payment.priorityCode).toBe("SOL");
    payment = wallet.render();
    payment.toggleAsset("SOL");
    payment = wallet.render();
    expect(payment.selectedCodes).not.toContain("SOL");
    expect(payment.priorityCode).toBe("ETH");
    expect(payment.selectedDigitalCode).toBe("ETH");
    expect(payment.selectedCodes).toContain(payment.selectedDigitalCode);
    expect(payment.paymentAssets).toEqual([{ assetCode: "ETH", amount: "0.005" }]);
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(true);
    const confirmation = MibanPaymentConfirmation({ payment });
    expect(findElement(confirmation, node => node.type === "select")).toBeUndefined();
    expect(visibleText(confirmation)).toContain("0.005 ETH");
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

describe("async preparePayment revalidates selected native quantities before any order DTO", () => {
  function eligibleHarness(total: number | (() => number) = 70, auth = () => true) {
    const harness = paymentHarness(total, auth);
    const payment = harness.render();
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(true);
    return { harness, payment };
  }
  function expectVisibleNotice(payment: MibanMixedPayment, pattern: RegExp) {
    const allocation = hookHarness(() => MibanMixedPaymentAllocation({ payment }));
    harnesses.push(allocation);
    expect(payment.statusMessage).toMatch(pattern);
    expect(visibleText(allocation.render())).toMatch(pattern);
  }
  it("allows a payable plan without review, but always requests a real fresh quote before producing a DTO", async () => {
    const harness = paymentHarness();
    const payment = harness.render();
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(true);
    const fresh = freshQuote();
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    expect(await payment.preparePayment()).toEqual({ cnyAmount: 14, paymentAssets: payment.paymentAssets, paymentQuoteToken: fresh.quoteToken });
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    expect(await harness.render().preparePayment()).toEqual({ cnyAmount: 14, paymentAssets: payment.paymentAssets, paymentQuoteToken: fresh.quoteToken });
    expect(boundary.query.refetch).toHaveBeenCalledTimes(2);
    setQuote(quote([row("SOL", "0.001", "700")]));
    const insufficient = paymentHarness().render();
    expect(await insufficient.preparePayment()).toBeNull();
    expect(boundary.query.refetch).not.toHaveBeenCalled();
  });
  it("refetches on initial confirmation even while the display token is valid, returns only the new signed DTO and retains the same native quantities without approval", async () => {
    const { harness, payment } = eligibleHarness();
    const displayed = payment.paymentAssets;
    const fresh = freshQuote();
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    const prepared = await payment.preparePayment();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    expect(boundary.query.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(prepared).toEqual({ cnyAmount: 14, paymentAssets: displayed, paymentQuoteToken: fresh.quoteToken });
    expect(Object.keys(prepared!).sort()).toEqual(["cnyAmount", "paymentAssets", "paymentQuoteToken"]);
    expect(prepared!.paymentAssets.every(asset => Object.keys(asset).sort().join() === "amount,assetCode")).toBe(true);
    expect(prepared!.paymentQuoteToken).not.toBe(payment.paymentQuoteToken);
    const next = harness.render();
    expect(next.paymentAssets).toEqual(displayed);
    expect(next.reviewed).toBe(false);
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
    expect(next.reviewed).toBe(false);
  });
  it("rejects even a tiny raw USDT amount change hidden by identical two-decimal U display; second explicit confirmation uses the staged quote without refetch", async () => {
    const data = quote([row("USDT", "594.9506102699997", "6.6714", "1.12345678")]);
    setQuote(data);
    const { harness, payment } = eligibleHarness(228);
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
    expect(next.canPay).toBe(true);
    expectVisibleNotice(next, /报价已更新，请确认本次付款金额/);
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    next = harness.render();
    expect(next.reviewed).toBe(false);
    expect(await next.preparePayment()).toEqual({ cnyAmount: 0, paymentAssets: expected, paymentQuoteToken: fresh.quoteToken });
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
  });
  it.each(["reject", "queryError", "noData"])("returns no DTO and preserves the last real snapshot after %s, with a visible failure", async failure => {
    const { harness, payment } = eligibleHarness();
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
    const { harness, payment } = eligibleHarness();
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
    expect(harness.render().reviewed).toBe(false);
    expect(await harness.render().preparePayment()).toBeNull();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
    expectVisibleNotice(next, /报价已更新，请确认本次付款金额.*不足/);
  });
  it.each(["expiryEqual", "expired", "missingToken", "invalidRate", "invalidDate", "futureQuote", "malformedAssets"])("never adopts or returns an invalid fresh quote (%s)", async invalid => {
    const { harness, payment } = eligibleHarness();
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
    const { harness, payment } = eligibleHarness();
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
    const { harness, payment } = eligibleHarness();
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
    expect(next.canPay).toBe(true);
    expect(boundary.query.refetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects a quote that was valid when requested but has reached expiry when the pending response resolves", async () => {
    const { harness, payment } = eligibleHarness();
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
  it("keeps the explicitly selected combined ordering when new wallet available-value ranking reverses", async () => {
    const data = quote([row("SOL", "0.02", "700"), row("ETH", "0.003", "14000"), row("USDT", "3", "7"), row("BNB", "0.02", "1400")]);
    setQuote(data);
    const harness = paymentHarness();
    let payment = harness.render();
    payment.useCombinedAssets();
    payment = harness.render();
    payment.prioritizeAsset("SOL");
    payment = harness.render();
    expect(payment.paymentAssets.map(asset => asset.assetCode)).toEqual(["SOL", "USDT", "ETH"]);
    payment = harness.render();
    expect(payment.reviewed).toBe(false);
    expect(payment.canPay).toBe(true);
    const fresh = freshQuote(data.assets.map(asset => asset.assetCode === "BNB" ? { ...asset, available: "1" } : asset));
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    const prepared = await payment.preparePayment();
    expect(prepared?.paymentAssets).toEqual(payment.paymentAssets);
    const next = harness.render();
    expect(next.paymentAssets).toEqual(payment.paymentAssets);
    expect(next.deductions.map(asset => asset.assetCode)).toEqual(["SOL", "USDT", "ETH"]);
    expect(next.priorityCode).toBe("SOL");
    expect(next.reviewed).toBe(false);
  });
  it.each(["reset", "cancelPendingPayment", "totalChanged", "disabled", "unmount"])("cancels pending preparation on %s: no DTO and no stale snapshot adoption", async cancellation => {
    let total = 70;
    let auth = true;
    const { harness, payment } = eligibleHarness(() => total, () => auth);
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
      expect(next.canPay).toBe(cancellation !== "disabled");
      expect(payment.canPay).toBe(false);
      expect(await payment.preparePayment()).toBeNull();
      expect(next.paymentQuoteToken).not.toBe("must-not-be-adopted");
      if (cancellation === "disabled") expect(next.paymentAssets).toEqual([]);
    } else {
      expect(payment.canPay).toBe(false);
      expect(await payment.preparePayment()).toBeNull();
    }
  });
  it.each(["expiryEqual", "stalePrice"])("requires a new request instead of submitting a staged confirmation at %s", async boundaryState => {
    const { harness, payment } = eligibleHarness();
    const at = Date.now();
    const changed = freshQuote(fixture().assets.map(asset => asset.assetCode === "SOL" ? { ...asset, priceCny: "701" } : asset), {
      expiresAt: new Date(at + (boundaryState === "stalePrice" ? 180_000 : 60_000)).toISOString(),
    });
    boundary.query.refetch.mockResolvedValueOnce({ data: changed });
    expect(await payment.preparePayment()).toBeNull();
    let next = harness.render();
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
  it("refetches again when the user changes staged quantities instead of reusing a changed-quote confirmation", async () => {
    const { harness, payment } = eligibleHarness();
    const changed = freshQuote(fixture().assets.map(asset => asset.assetCode === "SOL" ? { ...asset, priceCny: "701" } : asset));
    boundary.query.refetch.mockResolvedValueOnce({ data: changed });
    expect(await payment.preparePayment()).toBeNull();
    let next = harness.render();
    next.useOnlyAsset("ETH");
    next = harness.render();
    next = harness.render();
    const fresh = freshQuote(changed.assets, { quoteToken: "new-selection-signature" });
    boundary.query.refetch.mockResolvedValueOnce({ data: fresh });
    expect(await next.preparePayment()).toEqual({ cnyAmount: 0, paymentAssets: [{ assetCode: "ETH", amount: "0.005" }], paymentQuoteToken: fresh.quoteToken });
    expect(boundary.query.refetch).toHaveBeenCalledTimes(2);
  });
});

describe("readonly payment confirmation and separate checkout selection", () => {
  function summaryHarness(payment: () => MibanMixedPayment, disabled = false) {
    const refresh = vi.fn();
    const harness = hookHarness(() => MibanWalletAvailableSummary({ payment: { ...payment(), refresh }, disabled, accent: "#8d292c" }));
    harnesses.push(harness);
    return { harness, refresh };
  }
  it("confirmation is natively readonly, immediately visible and never mounts selection or refreshes a quote", () => {
    const payment = paymentHarness().render();
    const refresh = vi.fn();
    const element = MibanPaymentConfirmation({ payment: { ...payment, refresh }, accent: "#8d292c" });
    expect(findElements(element, node => ["button", "select", "input", "details", "summary"].includes(node.type))).toHaveLength(0);
    expect(findElement(element, node => node.type === MibanWalletAvailableSummary)).toBeUndefined();
    expect(findElement(element, node => node.props["aria-expanded"] !== undefined)).toBeUndefined();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("14 人民币");
    expect(html).toContain("0.08 SOL");
    expect(html).toContain("合计 ≈ 10.00 U · ¥70.00");
    expect(html).not.toMatch(/本次付款方案|本次预计扣币|已选币种|剩余待付|服务端验签|页面报价已固定/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("#8d292c");
    expect(html).not.toMatch(/核对扣币明细|优先使用|我已核对|选择币种/);
    expect(refresh).not.toHaveBeenCalled();
    expect(boundary.query.refetch).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(MibanMixedPaymentAllocation({ payment: { ...payment, refresh }, accent: "#8d292c" }))).toBe(html);
  });
  it("shows exact raw USDT debit in confirmation so tiny changes are visible, retaining compact balance display in selection", () => {
    setQuote(quote([row("USDT", "594.9506102699997", "6.6714", "1.12345678")]));
    const payment = paymentHarness(228).render();
    expect(payment.paymentAssets).toEqual([{ assetCode: "USDT", amount: "34.17573523" }]);
    const confirmation = renderToStaticMarkup(MibanPaymentConfirmation({ payment }));
    expect(confirmation).toContain("34.17573523 USDT");
    expect(confirmation).toContain(`合计 ≈ ${formatMibanUsdtAmount(228 / payment.usdtCnyRate)} U · ¥228.00`);
    const { harness } = summaryHarness(() => payment);
    const summary = renderToStaticMarkup(harness.render());
    expect(summary).toContain("594.95 U");
    expect(summary).not.toContain("594.9506102699997");
  });
  it("shows native tiny nonzero debit without rounding it to zero", () => {
    setQuote(quote([row("ETH", "0.000000000000000001", "70000000000000000000")]));
    const payment = paymentHarness().render();
    expect(renderToStaticMarkup(MibanPaymentConfirmation({ payment }))).toContain("0.000000000000000001 ETH");
  });
  it.each(["ETH", "USDT"])("checkout dropdown explicitly selects %s while confirmation preserves the same plan", code => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    const { harness } = summaryHarness(() => payment);
    const select = findElement(harness.render(), node => node.type === "select");
    expect(select.props.value).toBe("SOL");
    expect((React.Children.toArray(select.props.children) as any[]).map(option => option.props.value).sort()).toEqual(["ETH", "SOL", "USDT"]);
    select.props.onChange({ target: { value: code } });
    payment = wallet.render();
    expect([...payment.selectedCodes].sort()).toEqual(["CNY", code].sort());
    expect(payment.paymentAssets).toEqual(buildMibanPaymentPlan(70, fixture(), [code, "CNY"], undefined, NOW).paymentAssets);
    expect(payment.canPay).toBe(code === "ETH");
    expect(findElement(harness.render(), node => node.type === "select").props.value).toBe(code);
    expect(visibleText(MibanPaymentConfirmation({ payment }))).toContain(payment.paymentAssets[0].amount);
  });
  it("checkout excludes zero-held, all-frozen, securities, unknown-price and stale options and refuses invalid selections", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    const { harness } = summaryHarness(() => payment);
    const first = payment.paymentAssets;
    for (const code of ["BTC", "DOGE", "BNB", "NVDA", "NOT-IN-WALLET"]) {
      findElement(harness.render(), node => node.type === "select").props.onChange({ target: { value: code } });
      payment = wallet.render();
      expect(payment.paymentAssets).toBe(first);
    }
    setQuote(quote([row("SOL", "0.1", "700"), row("ETH", "1", null), row("BTC", "1", "700000", "0", { priceUpdatedAt: new Date(NOW - 120_001).toISOString() })]));
    const onlySol = paymentHarness().render();
    const onlySummary = summaryHarness(() => onlySol).harness.render();
    expect(findElement(onlySummary, node => node.type === "select")).toBeUndefined();
    expect(findElements(onlySummary, node => node.props["data-payment-asset"] !== undefined).map(node => node.props["data-payment-asset"])).toEqual(["SOL"]);
  });
  it("checkout enables joint payment only for visibly selected coins, not all holdings, and requires no extra review", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.useOnlyAsset("ETH");
    payment = wallet.render();
    const { harness } = summaryHarness(() => payment);
    findElement(harness.render(), node => node.props["data-payment-joint-toggle"] !== undefined).props.onClick();
    payment = wallet.render();
    expect([...payment.selectedCodes].sort()).toEqual(["CNY", "ETH"]);
    expect(payment.selectedCodes).not.toContain("SOL");
    expect(payment.selectedCodes).not.toContain("USDT");
    expect(payment.canPay).toBe(true);
    const summary = harness.render();
    expect(findElements(summary, node => node.type === "input" && node.props.type === "checkbox")).toHaveLength(2);
    expect(findElement(summary, node => node.props["aria-label"] === "确认本次实际扣币明细")).toBeUndefined();
    const old = payment.paymentAssets;
    findElement(summary, node => node.props["aria-label"] === "参与支付 ETH").props.onChange();
    payment = wallet.render();
    expect(payment.selectedCodes).toEqual(["CNY"]);
    expect(payment.paymentAssets).not.toEqual(old);
    expect(payment.canPay).toBe(false);
  });
  it("checkout native asset buttons reflect real selected state without silently selecting a dropdown candidate", () => {
    setQuote(quote([row("CNY", "80", "1"), row("SOL", "1", "700"), row("ETH", "0.02", "14000")]));
    const wallet = paymentHarness();
    let payment = wallet.render();
    const { harness } = summaryHarness(() => payment);
    const initial = harness.render();
    // Default joint mode: clicking SOL deselects it and leaves CNY only.
    findElement(initial, node => node.props["aria-label"] === "使用SOL支付").props.onClick();
    payment = wallet.render();
    expect(payment.selectedCodes).toEqual(["CNY"]);
    const summary = harness.render();
    expect(findElement(summary, node => node.type === "select").props.value).toBe("SOL");
    for (const code of ["CNY", "SOL"]) {
      const card = paymentCard(summary, code);
      const button = findElement(card, node => node.type === "button");
      expect(button.props.type).toBe("button");
      expect(button.props["aria-pressed"]).toBe(code === "CNY");
      expect(card.props.onClick).toBeUndefined();
      expect(card.props["data-payment-selected"]).toBe(code === "CNY");
    }
    expect(visibleText(MibanPaymentConfirmation({ payment }))).not.toContain("SOL");
  });
  it.each(["missing", "negative", "zero", "allFrozen"])("no synthetic CNY selectable card appears for %s CNY", state => {
    const assets = [row("SOL", "0.1", "700", "99")];
    if (state !== "missing") assets.unshift(row("CNY", state === "negative" ? "-957" : "0", "1", state === "allFrozen" ? "626000" : "0"));
    setQuote(quote(assets));
    const payment = paymentHarness().render();
    const summary = summaryHarness(() => payment).harness.render();
    expect(findElements(summary, node => node.props["data-payment-asset"] !== undefined).map(node => node.props["data-payment-asset"])).toEqual(["SOL"]);
    expect(renderToStaticMarkup(summary)).not.toMatch(/-957|626000|冻结 99/);
    expect(payment.paymentAssets).toEqual([{ assetCode: "SOL", amount: "0.1" }]);
  });
  it("all-frozen wallets have no payable plan, selectors or synthetic deduction", async () => {
    setQuote(quote([row("CNY", "0", "1", "900"), row("USDT", "0", "7", "800"), row("SOL", "0", "700", "10")]));
    const payment = paymentHarness().render();
    const summary = summaryHarness(() => payment).harness.render();
    expect(findElements(summary, node => node.props["data-payment-asset"] !== undefined)).toHaveLength(0);
    expect(findElement(summary, node => node.type === "select")).toBeUndefined();
    expect(visibleText(summary)).toContain("暂无可用币种");
    expect(payment.canPay).toBe(false);
    expect(await payment.preparePayment()).toBeNull();
    expect(findElements(MibanPaymentConfirmation({ payment }), node => node.props["data-payment-deduction-asset"] !== undefined)).toHaveLength(0);
  });
  it("disabled checkout locks callbacks while confirmation stays readonly and retains visible amounts", () => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    const before = payment.paymentAssets;
    const { harness, refresh } = summaryHarness(() => payment, true);
    const summary = harness.render();
    for (const control of findElements(summary, node => ["button", "select", "input"].includes(node.type))) {
      expect(control.props.disabled).toBe(true);
      if (control.type === "select") control.props.onChange({ target: { value: "ETH" } });
      else if (control.type !== "input") control.props.onClick();
      payment = wallet.render();
      expect(payment.paymentAssets).toBe(before);
    }
    expect(refresh).not.toHaveBeenCalled();
    const confirmation = MibanPaymentConfirmation({ payment, disabled: true });
    expect(confirmation.props["aria-busy"]).toBe(true);
    expect(visibleText(confirmation)).toContain("0.08 SOL");
    expect(findElements(confirmation, node => ["button", "input", "select"].includes(node.type))).toHaveLength(0);
  });
  it("mounting confirmation never refreshes; selection stage mounts refresh once only", () => {
    const payment = paymentHarness().render();
    const refresh = vi.fn();
    const confirmation = hookHarness(() => MibanPaymentConfirmation({ payment: { ...payment, refresh } }));
    harnesses.push(confirmation);
    confirmation.render(); confirmation.render();
    expect(refresh).not.toHaveBeenCalled();
    const selection = hookHarness(() => MibanWalletAvailableSummary({ payment: { ...payment, refresh } }));
    harnesses.push(selection);
    selection.render(); selection.render();
    expect(refresh).toHaveBeenCalledOnce();
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
    expect(text).toContain("const totalPriceU = cnyToU(payableTotalCny, usdtCnyRate)");
    expect(text).toContain('Number.isFinite(usdtCnyRate) ? totalPriceU.toFixed(2) : "--"');
    const summaryCalls = walk(file, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "MibanWalletAvailableSummary") as ts.JsxSelfClosingElement[];
    expect(summaryCalls).toHaveLength(1);
    expect(summaryCalls[0].getText(file)).toContain("accent={accent}");
    expect(summaryCalls[0].getText(file)).toMatch(/disabled=\{(?:createOrder\.isPending|checkoutBusy)\}/);
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
    expect(text).toMatch(/<(?:MibanMixedPaymentAllocation|MibanPaymentConfirmation)/);
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
  it("opening the Herbalife payment dialog preserves the summary-selected hook choice without adding review", () => {
    const text = source("HerbalifeRedGinsengDetail");
    const file = ts.createSourceFile("HerbalifeRedGinsengDetail.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = walk(file, node => ts.isVariableDeclaration(node) && node.name.getText(file) === "handleOpenWalletPayment") as ts.VariableDeclaration[];
    expect(declarations).toHaveLength(1);
    const handler = declarations[0].initializer!.getText(file);
    expect(handler).not.toContain("confirmPaymentReview(true)");
    expect(handler).toContain("setShowWalletPayment(true)");
    expect(handler).not.toContain("resetToCnyFirst");
    expect(handler).not.toContain("useOnlyAsset");
    expect(handler).not.toContain("useCombinedAssets");
  });
  it("never substitutes a fallback SKU for an invalid explicitly requested checkout SKU", () => {
    const text = source("HerbalifeRedGinsengDetail");
    expect(text).toMatch(/(?:new URLSearchParams\(queryString\)|checkoutQuery)\.get\("sku"\)/);
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

describe("stable readonly snapshots and fail-closed refresh eligibility", () => {
  function shape(node: any): any {
    if (Array.isArray(node)) return node.filter(React.isValidElement).map(shape);
    if (!React.isValidElement(node)) return null;
    const props = node.props as any;
    return { tag: node.type, asset: props["data-payment-deduction-asset"], children: React.Children.toArray(props.children).filter(React.isValidElement).map(shape) };
  }
  it("preserves fixed snapshot, raw plan references and visible confirmation for 180s without refetch, countdown or intervals", async () => {
    const wallet = paymentHarness();
    const first = wallet.render();
    const firstElement = MibanPaymentConfirmation({ payment: first });
    const html = renderToStaticMarkup(firstElement);
    for (let tick = 0; tick < 3; tick++) {
      await vi.advanceTimersByTimeAsync(60_000);
      boundary.query.isFetching = tick === 0;
      boundary.query.isError = tick === 2;
      boundary.query.data = tick === 1 ? freshQuote([row("USDT", "10000", "1")]) : undefined;
      const payment = wallet.render();
      expect(payment.paymentAssets).toBe(first.paymentAssets);
      expect(payment.deductions).toBe(first.deductions);
      expect(payment.selectedCodes).toBe(first.selectedCodes);
      expect(payment.canPay).toBe(true);
      expect(payment.paymentQuoteToken).toBe("");
      expect(renderToStaticMarkup(MibanPaymentConfirmation({ payment }))).toBe(html);
      expect(boundary.query.refetch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  });
  it.each(["ready", "refresh", "error", "expired"])("retains amount layout and directly visible status during %s", async state => {
    const wallet = paymentHarness();
    const previous = wallet.render();
    const request = deferredQuote();
    if (state === "refresh" || state === "error") {
      boundary.query.refetch.mockReturnValue(request.promise);
      previous.refresh();
      if (state === "error") { request.reject(new Error("unit network failure")); await flushQuoteRequest(); }
    }
    if (state === "expired") vi.advanceTimersByTime(60_000);
    const payment = wallet.render();
    expect(payment.canPay).toBe(state === "ready" || state === "expired");
    const confirmation = MibanPaymentConfirmation({ payment });
    expect(shape(confirmation)).toEqual(shape(MibanPaymentConfirmation({ payment: previous })));
    const status = findElement(confirmation, node => node.props["data-payment-allocation-status"] !== undefined);
    expect(status.props.role).toBe("status");
    if (state === "refresh" || state === "error") expect(visibleText(status)).toContain(payment.statusMessage);
    else expect(visibleText(status)).toBe("");
    expect(visibleText(status)).not.toMatch(/倒计时|\d+ 秒/);
    expect(visibleText(confirmation)).toContain("0.08 SOL");
    if (state === "refresh") { request.resolve({ data: freshQuote() }); await flushQuoteRequest(); }
  });
  it.each([true, false])("explicit refresh blocks all payment selection and old DTOs while retaining undimmed snapshot (live cache present %s)", async keepLiveData => {
    const wallet = paymentHarness();
    let payment = wallet.render();
    payment.useOnlyAsset("ETH");
    payment = wallet.render();
    const before = payment;
    setQuote(keepLiveData ? fixture() : undefined, { isFetching: true });
    const request = deferredQuote();
    boundary.query.refetch.mockReturnValue(request.promise);
    payment = wallet.render();
    expect(payment.canPay).toBe(true);
    payment.refresh();
    payment = wallet.render();
    expect(payment.ready).toBe(false);
    expect(payment.refreshing).toBe(true);
    expect(payment.canPay).toBe(false);
    expect(payment.paymentQuoteToken).toBe("");
    expect(payment.paymentAssets).toBe(before.paymentAssets);
    expect(payment.deductions).toBe(before.deductions);
    const confirmation = MibanPaymentConfirmation({ payment });
    expect(visibleText(confirmation)).toContain("0.005 ETH");
    expect(confirmation.props.className).not.toMatch(/opacity-/);
    const selection = hookHarness(() => MibanWalletAvailableSummary({ payment }));
    harnesses.push(selection);
    const summary = selection.render();
    for (const control of findElements(summary, node => ["button", "input", "select"].includes(node.type))) expect(control.props.disabled).toBe(true);
    findElement(summary, node => node.type === "select").props.onChange({ target: { value: "SOL" } });
    payment.useOnlyAsset("SOL"); payment.useCombinedAssets(); payment.prioritizeAsset("SOL"); payment.toggleAsset("ETH"); payment.setCnyInput("1.00");
    expect(await payment.preparePayment()).toBeNull();
    payment = wallet.render();
    expect(payment.paymentAssets).toBe(before.paymentAssets);
    expect(payment.selectedCodes).toEqual(["ETH"]);
    request.resolve({ data: freshQuote(fixture().assets, { quoteToken: "refreshed-unit-signature" }) });
    await flushQuoteRequest();
    payment = wallet.render();
    expect(payment.ready).toBe(true);
    expect(payment.canPay).toBe(true);
    expect(payment.paymentQuoteToken).toBe("refreshed-unit-signature");
    expect(payment.reviewed).toBe(false);
  });
  it("legacy review true never approves anything or bypasses a failed verification", async () => {
    const wallet = paymentHarness();
    const payment = wallet.render();
    payment.confirmPaymentReview(true);
    expect(wallet.render().canPay).toBe(true);
    boundary.query.refetch.mockRejectedValue(new Error("unit failure"));
    expect(await wallet.render().preparePayment()).toBeNull();
    payment.confirmPaymentReview(true);
    expect(wallet.render().canPay).toBe(false);
    expect(await payment.preparePayment()).toBeNull();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
  });
  it("requires a second click when a changed balance reallocates debit between already-selected coins", async () => {
    const wallet = paymentHarness();
    const payment = wallet.render();
    const changed = freshQuote(fixture().assets.map(asset => asset.assetCode === "CNY" ? { ...asset, available: "0" } : asset));
    boundary.query.refetch.mockResolvedValue({ data: changed });
    expect(await payment.preparePayment()).toBeNull();
    const next = wallet.render();
    expect(next.selectedCodes).toEqual(["CNY", "SOL"]);
    expect(next.paymentAssets).toEqual([{ assetCode: "SOL", amount: "0.1" }]);
    expect(next.canPay).toBe(true);
    expect(visibleText(MibanPaymentConfirmation({ payment: next }))).toContain("报价已更新，请确认本次付款金额");
    expect(await next.preparePayment()).toEqual({ cnyAmount: 0, paymentAssets: next.paymentAssets, paymentQuoteToken: changed.quoteToken });
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
  });
  it("rejects a staged token expiring during the fast confirmation microtask", async () => {
    const wallet = paymentHarness();
    const payment = wallet.render();
    const changed = freshQuote(fixture().assets.map(asset => asset.assetCode === "SOL" ? { ...asset, priceCny: "701" } : asset), { expiresAt: new Date(NOW + 1_000).toISOString() });
    boundary.query.refetch.mockResolvedValue({ data: changed });
    expect(await payment.preparePayment()).toBeNull();
    const next = wallet.render();
    const pending = next.preparePayment();
    vi.setSystemTime(NOW + 1_000);
    expect(await pending).toBeNull();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
  });
  it("cancel invalidates old attempts but a new confirmation verifies fresh quote without a manual refresh", async () => {
    const wallet = paymentHarness();
    const payment = wallet.render();
    payment.cancelPendingPayment();
    const cancelled = wallet.render();
    expect(cancelled.canPay).toBe(true);
    expect(payment.canPay).toBe(false);
    expect(await payment.preparePayment()).toBeNull();
    expect(boundary.query.refetch).not.toHaveBeenCalled();
    const fresh = freshQuote(fixture().assets, { quoteToken: "new-confirmation-after-cancel" });
    boundary.query.refetch.mockResolvedValue({ data: fresh });
    expect(await cancelled.preparePayment()).toEqual({ cnyAmount: cancelled.cnyAmount, paymentAssets: cancelled.paymentAssets, paymentQuoteToken: fresh.quoteToken });
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
  });
  it("cancel never clears a real failed-quote block or permits a stale payment", async () => {
    const wallet = paymentHarness();
    boundary.query.refetch.mockRejectedValue(new Error("quote unavailable"));
    expect(await wallet.render().preparePayment()).toBeNull();
    const failed = wallet.render();
    expect(failed.canPay).toBe(false);
    failed.cancelPendingPayment();
    const cancelled = wallet.render();
    expect(cancelled.canPay).toBe(false);
    expect(await cancelled.preparePayment()).toBeNull();
    expect(boundary.query.refetch).toHaveBeenCalledOnce();
  });
  it("changed-quote fast confirmation still blocks double clicks, cancellation, unmount and changed inputs", async () => {
    for (const interruption of ["double", "cancel", "unmount", "total", "reset"]) {
      setQuote(fixture());
      let total = 70;
      const wallet = paymentHarness(() => total);
      const payment = wallet.render();
      const changed = freshQuote(fixture().assets.map(asset => asset.assetCode === "SOL" ? { ...asset, priceCny: "701" } : asset));
      boundary.query.refetch.mockResolvedValue({ data: changed });
      expect(await payment.preparePayment()).toBeNull();
      const next = wallet.render();
      const pending = next.preparePayment();
      expect(next.canPay).toBe(false);
      if (interruption === "double") expect(await next.preparePayment()).toBeNull();
      if (interruption === "cancel") next.cancelPendingPayment();
      if (interruption === "unmount") wallet.cleanup();
      if (interruption === "total") { total = 71; wallet.render(); }
      if (interruption === "reset") next.resetToCnyFirst();
      const prepared = await pending;
      if (interruption === "double") expect(prepared?.paymentQuoteToken).toBe(changed.quoteToken);
      else expect(prepared).toBeNull();
      expect(boundary.query.refetch).toHaveBeenCalledOnce();
    }
  });
});
