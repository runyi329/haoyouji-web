import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenefitQuote } from "../../../../shared/miban-benefits";

type Scheduler = {
  useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void];
  useRef<T>(initial: T): { current: T };
  useMemo<T>(fn: () => T, deps?: readonly unknown[]): T;
  useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
};
const boundary = vi.hoisted(() => ({ active: null as Scheduler | null, quoteQuery: vi.fn() }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => boundary.active ? boundary.active.useState(initial) : actual.useState(initial),
    useRef: <T,>(initial: T) => boundary.active ? boundary.active.useRef(initial) : actual.useRef(initial),
    useMemo: <T,>(fn: () => T, deps: readonly unknown[]) => boundary.active ? boundary.active.useMemo(fn, deps) : actual.useMemo(fn, deps),
    useCallback: <T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]) => boundary.active ? boundary.active.useMemo(() => fn, deps) : actual.useCallback(fn, deps),
    useEffect: (fn: () => void | (() => void), deps?: readonly unknown[]) => boundary.active ? boundary.active.useEffect(fn, deps) : actual.useEffect(fn, deps),
  };
});
vi.mock("@/lib/trpc", () => ({ trpc: { benefits: { quote: { useQuery: boundary.quoteQuery } } } }));
import { useMibanBenefitsQuote } from "./useMibanBenefitsQuote";

const NOW = Date.parse("2026-11-27T09:00:00Z");
const makeQuote = (totalCents = 18000, ruleId = "r1", quantity = 2, productKey = "product"): BenefitQuote => ({
  storefront: "miban-limited", quoteToken: `signed-${totalCents}-${ruleId}`, expiresAt: Date.now() + 300_000,
  result: { originalCents: quantity * 10000, totalCents, savedCents: quantity * 10000 - totalCents, summary: ruleId, consumedRuleIds: [ruleId], lines: [{ productKey, skuId: "sku", quantity, originalCents: quantity * 10000, totalCents, ruleId, ruleName: ruleId }] },
});
type QueryReply = { data?: BenefitQuote; isError?: boolean };
const sameDeps = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
function hookHarness<T>(renderHook: () => T) {
  const slots: unknown[] = [];
  let cursor = 0;
  let pending: Array<() => void> = [];
  const harness: Scheduler & { render(): T; cleanup(): void } = {
    useState<TValue,>(initial: TValue | (() => TValue)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? (initial as () => TValue)() : initial };
      const slot = slots[index] as { value: TValue };
      return [slot.value, next => { slot.value = typeof next === "function" ? (next as (previous: TValue) => TValue)(slot.value) : next; }];
    },
    useRef<TValue,>(initial: TValue) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: TValue };
    },
    useMemo<TValue,>(fn: () => TValue, deps?: readonly unknown[]) {
      const index = cursor++;
      const slot = slots[index] as { deps?: readonly unknown[]; value: TValue } | undefined;
      if (!slot || !sameDeps(slot.deps, deps)) slots[index] = { value: fn(), deps };
      return (slots[index] as { value: TValue }).value;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const slot = slots[index] as { deps?: readonly unknown[]; cleanup?: () => void } | undefined;
      if (!slot || !sameDeps(slot.deps, deps)) pending.push(() => {
        slot?.cleanup?.();
        slots[index] = { deps, cleanup: fn() };
      });
    },
    render() {
      cursor = 0;
      pending = [];
      boundary.active = harness;
      let value: T;
      try { value = renderHook(); } finally { boundary.active = null; }
      pending.forEach(effect => effect());
      return value;
    },
    cleanup() { slots.forEach(slot => (slot as { cleanup?: () => void } | undefined)?.cleanup?.()); },
  };
  return harness;
}
const harnesses: Array<{ cleanup(): void }> = [];
let enabled = true;
let owner: string | undefined = "28";
let quantity = 2;
let productKey = "product";
let query: { data?: BenefitQuote; isFetching: boolean; isError: boolean; refetch: ReturnType<typeof vi.fn> };
const deferred = () => {
  let resolve!: (value: QueryReply) => void;
  const promise = new Promise<QueryReply>(yes => { resolve = yes; });
  return { promise, resolve };
};
const flush = async () => { for (let step = 0; step < 10; step++) await Promise.resolve(); };
function createHarness() {
  const harness = hookHarness(() => useMibanBenefitsQuote({ items: [{ productKey, skuId: "sku", quantity }], mode: "once", enabled, userId: owner }));
  harnesses.push(harness);
  return harness;
}
async function readyHarness() {
  const harness = createHarness();
  expect(harness.render().ready).toBe(false);
  await flush();
  expect(harness.render().ready).toBe(true);
  return harness;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  enabled = true; owner = "28"; quantity = 2; productKey = "product";
  query = { data: makeQuote(), isFetching: false, isError: false, refetch: vi.fn().mockResolvedValue({ data: makeQuote(), isError: false }) };
  boundary.quoteQuery.mockReset().mockImplementation(() => query);
});
afterEach(() => { harnesses.splice(0).forEach(harness => harness.cleanup()); boundary.active = null; vi.useRealTimers(); });

describe("real benefits hook async checkout gate (isolated hook/query boundary only)", () => {
  it("does not enable any request outside authenticated valid confirmation and never accepts cached data without fresh fetch", async () => {
    enabled = false;
    const harness = createHarness();
    expect(harness.render().ready).toBe(false);
    expect(query.refetch).not.toHaveBeenCalled();
    expect(boundary.quoteQuery).toHaveBeenLastCalledWith(expect.objectContaining({ storefront: "miban-limited", mode: "once" }), expect.objectContaining({ enabled: false, refetchInterval: false, refetchOnWindowFocus: true }));
    enabled = true;
    const request = deferred(); query.refetch.mockReturnValue(request.promise);
    expect(harness.render().ready).toBe(false);
    expect(await harness.render().refreshForConfirmation()).toBeNull();
    request.resolve({ data: makeQuote() }); await flush();
    expect(harness.render().totalCny).toBe(180);
    expect(harness.render().ready).toBe(true);
  });
  it("changed total halts first click, updates wallet input and returns a fresh token only on a later explicit click", async () => {
    const harness = await readyHarness();
    query.refetch.mockResolvedValue({ data: makeQuote(17000) });
    expect(await harness.render().refreshForConfirmation()).toBeNull();
    const changed = harness.render();
    expect(changed.totalCny).toBe(170);
    expect(changed.notice).toContain("金额/优惠已更新");
    expect(await changed.refreshForConfirmation()).toMatchObject({ quoteToken: "signed-17000-r1" });
  });
  it("same-total different rule consumption and expiration both stop the current click", async () => {
    const harness = await readyHarness();
    query.refetch.mockResolvedValue({ data: makeQuote(18000, "r2") });
    expect(await harness.render().refreshForConfirmation()).toBeNull();
    expect(harness.render().notice).toContain("再次确认");
    vi.advanceTimersByTime(300_001);
    query.refetch.mockResolvedValue({ data: makeQuote(18000, "r2") });
    expect(await harness.render().refreshForConfirmation()).toBeNull();
    expect(harness.render().totalCny).toBe(180);
  });
  it("loading and error forbid confirmation but retain the actual prior amount, retry only refreshes quote", async () => {
    const harness = await readyHarness();
    const request = deferred(); query.refetch.mockReturnValue(request.promise);
    const confirmation = harness.render().refreshForConfirmation();
    expect(harness.render().ready).toBe(false);
    expect(harness.render().totalCny).toBe(180);
    request.resolve({ isError: true, data: makeQuote() });
    expect(await confirmation).toBeNull();
    expect(harness.render().error).toContain("未提交订单");
    expect(harness.render().ready).toBe(false);
    expect(await harness.render().refreshForConfirmation()).toBeNull();
    query.refetch.mockResolvedValue({ data: makeQuote() });
    harness.render().retry(); await flush();
    expect(harness.render().ready).toBe(true);
    expect(harness.render().totalCny).toBe(180);
  });
  it("quantity changes invalidate old in-flight confirmation and refetch the new quantity once", async () => {
    const harness = await readyHarness();
    const request = deferred(); query.refetch.mockReturnValueOnce(request.promise).mockResolvedValue({ data: makeQuote(27000, "r1", 3) });
    const confirmation = harness.render().refreshForConfirmation();
    quantity = 3;
    expect(harness.render().ready).toBe(false);
    expect(harness.render().totalCny).toBe(180);
    request.resolve({ data: makeQuote() });
    expect(await confirmation).toBeNull();
    harness.render(); await flush();
    expect(harness.render().ready).toBe(true);
    expect(harness.render().totalCny).toBe(270);
    expect(boundary.quoteQuery).toHaveBeenLastCalledWith(expect.objectContaining({ items: [{ productKey: "product", skuId: "sku", quantity: 3 }] }), expect.objectContaining({ enabled: true }));
  });
  it("switching identity hides previous user's amount immediately and discards delayed results", async () => {
    const harness = await readyHarness();
    const request = deferred(); query.refetch.mockReturnValueOnce(request.promise).mockResolvedValue({ data: makeQuote(15000, "r-new") });
    const confirmation = harness.render().refreshForConfirmation();
    owner = "29";
    expect(harness.render().displayQuote).toBeNull();
    expect(harness.render().totalCny).toBe(0);
    request.resolve({ data: makeQuote() });
    expect(await confirmation).toBeNull();
    harness.render(); await flush();
    expect(harness.render().quote?.result.summary).toBe("r-new");
    owner = undefined;
    expect(harness.render().quote).toBeNull();
    expect(harness.render().ready).toBe(false);
  });
  it("focus refetch never clears display and a change during wallet async preparation makes old benefit token unusable", async () => {
    const harness = await readyHarness();
    const verified = await harness.render().refreshForConfirmation();
    expect(verified).not.toBeNull();
    const oldClosure = harness.render();
    query.isFetching = true;
    expect(harness.render().totalCny).toBe(180);
    expect(harness.render().ready).toBe(false);
    expect(oldClosure.isCurrent(verified!)).toBe(false);
    query.isFetching = false; query.data = makeQuote(18000, "r2");
    harness.render();
    expect(harness.render().notice).toContain("再次确认");
    expect(oldClosure.isCurrent(verified!)).toBe(false);
  });
  it("backend rejection refresh never triggers another confirmation or order", async () => {
    const harness = await readyHarness();
    query.refetch.mockResolvedValue({ data: makeQuote(17000) });
    harness.render().refreshAfterRejection(); await flush();
    expect(harness.render().notice).toContain("再次确认");
    expect(harness.render().totalCny).toBe(170);
    expect(query.refetch).toHaveBeenCalledTimes(2); // entry + explicit rejection-refresh only
  });
});
