import React from "react";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Offline component-props fixtures only: verified admin below is NOT an online
// identity, auth bypass, fake API response, balance, order or payment fixture.
// Execute the real detail, YearAndQuantity and wallet components; replace only
// React's hook dispatcher and transport boundaries. Never start app/server/DB.
const boundary = vi.hoisted(() => ({
  active: null as any,
  network: vi.fn(),
  calls: vi.fn(),
  query: vi.fn(),
  refetch: vi.fn(),
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
vi.mock("../client/src/pages/miban/mibanTrpc", () => {
  const transport = (path: string[] = []): any => new Proxy(() => undefined, {
    get: (_, key: string) => transport([...path, key]),
    apply: (_, __, args) => {
      const operation = path.join(".");
      boundary.calls(operation, ...args);
      if (operation === "order.walletPaymentQuote.useQuery") return boundary.query(...args);
      throw new Error(`Offline regression forbids transport: ${operation}`);
    },
  });
  return { mtrpc: transport() };
});
vi.mock("@/lib/trpc", () => {
  const forbidden = (path: string[] = []): any => new Proxy(() => undefined, {
    get: (_, key: string) => forbidden([...path, key]),
    apply: (_, __, args) => {
      boundary.calls(`trpc.${path.join(".")}`, ...args);
      throw new Error(`No auth/API/DB calls in component-props regression: ${path.join(".")}`);
    },
  });
  return { trpc: forbidden() };
});

import MoutaiDetailView, { type MoutaiIdentity } from "../client/src/components/MoutaiDetailView";
import MoutaiWalletPayment from "../client/src/pages/miban/MoutaiWalletPayment";
import { MibanPaymentConfirmation, MibanWalletAvailableSummary } from "../client/src/pages/miban/MibanMixedPayment";
import { Sheet, SheetTitle } from "../client/src/components/ui/sheet";

const equalDeps = (a: any[], b: any[]) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
const harnesses: any[] = [];
function harness(render: () => any) {
  const slots: any[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const h = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) {
        slots[i] = { value: typeof initial === "function" ? initial() : initial };
        slots[i].set = (next: any) => { slots[i].value = typeof next === "function" ? next(slots[i].value) : next; };
      }
      return [slots[i].value, slots[i].set];
    },
    useRef(initial: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo(fn: any, deps: any[]) {
      const i = cursor++;
      if (!(i in slots) || !equalDeps(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useEffect(fn: any, deps: any[]) {
      const i = cursor++;
      if (!(i in slots) || !equalDeps(slots[i].deps, deps)) effects.push(() => {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: fn() };
      });
    },
    render() {
      cursor = 0;
      effects = [];
      const previous = boundary.active;
      boundary.active = h;
      let tree;
      try { tree = render(); } finally { boundary.active = previous; }
      effects.forEach(fn => fn());
      return tree;
    },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()); },
  };
  harnesses.push(h);
  return h;
}
function nodes(node: any, predicate: (value: any) => boolean): any[] {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...nodes((node.props as any).children, predicate)];
}
function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement(node)) return text((node.props as any).children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function one(tree: any, predicate: (value: any) => boolean) {
  const found = nodes(tree, predicate);
  expect(found).toHaveLength(1);
  return found[0];
}
const byId = (tree: any, id: string) => one(tree, node => node.props["data-testid"] === id);
const byLabel = (tree: any, label: string) => one(tree, node => node.props["aria-label"] === label);
const byText = (tree: any, label: string) => one(tree, node => typeof node.props.onClick === "function" && text(node) === label);
function sheet(tree: any, id: string) {
  return one(tree, node => node.type === Sheet && nodes(node.props.children, child => child.props["data-testid"] === id).length === 1);
}
function selection(tree: any) {
  const content = byId(tree, "specification-sheet");
  // Execute the actual private YearAndQuantity child, not a fabricated selector.
  const child = one(content, node => typeof node.type === "function" && typeof node.props.setYear === "function" && typeof node.props.setQuantity === "function");
  return { content, child, controls: child.type(child.props) };
}
const cnyText = (amount: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(amount);
const usdtText = (amount: number, rate: number) => (amount / rate).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Explicit OFFLINE verified-admin props fixture, never returned by useAuth/API.
const verifiedAdmin: MoutaiIdentity = { verified: true, name: "离线组件props管理员fixture", role: "admin", mode: "readonly-admin-preview" };
type DetailProps = Parameters<typeof MoutaiDetailView>[0];
function controller(initial: Partial<DetailProps> = {}) {
  const renderPayment = vi.fn((totalCny: number) => React.createElement(MoutaiWalletPayment, { totalCny }));
  const props: DetailProps = {
    identity: { ...verifiedAdmin }, identityLoading: false, onBack: vi.fn(), onRetryIdentity: vi.fn(),
    usdtCnyRate: 7.2, fxAsOf: "2026-11-27T09:00:00Z", renderPayment, ...initial,
  };
  const h = harness(() => MoutaiDetailView(props));
  return {
    props, h, renderPayment,
    tree: () => h.render(),
    buy: (id = "primary-buy") => { byId(h.render(), id).props.onClick(); return h.render(); },
    year: (year: number) => { byLabel(selection(h.render()).controls, `${year}年份`).props.onClick(); return h.render(); },
    quantity: (quantity: number) => { byLabel(selection(h.render()).controls, `${quantity}瓶`).props.onClick(); return h.render(); },
    next: () => { byId(h.render(), "specification-next").props.onClick(); return h.render(); },
    close: (id: string) => { sheet(h.render(), id).props.onOpenChange(false); return h.render(); },
  };
}
function expectOnlySpecification(tree: any) {
  expect(sheet(tree, "specification-sheet").props.open).toBe(true);
  expect(sheet(tree, "quote-sheet").props.open).toBe(false);
  expect(nodes(tree, node => node.type === MoutaiWalletPayment)).toHaveLength(0);
}
function expectQuote(tree: any, totalCny: number) {
  expect(sheet(tree, "specification-sheet").props.open).toBe(false);
  expect(sheet(tree, "quote-sheet").props.open).toBe(true);
  expect(text(one(byId(tree, "quote-sheet"), node => node.type === SheetTitle))).toBe("选择支付方式");
  expect(text(byId(tree, "quote-total-cny"))).toBe(`≈ ¥${cnyText(totalCny)}`);
  expect(one(tree, node => node.type === MoutaiWalletPayment).props.totalCny).toBe(totalCny);
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  boundary.network.mockReset().mockImplementation(() => { throw new Error("Real network forbidden in offline component regression"); });
  vi.stubGlobal("fetch", boundary.network);
  boundary.calls.mockReset();
  boundary.refetch.mockReset().mockImplementation(() => { throw new Error("No wallet refresh/prepare/payment in this regression"); });
  // A failed offline transport, NOT a fake successful quote or balance.
  boundary.query.mockReset().mockReturnValue({ data: undefined, isSuccess: false, isError: true, isFetching: false, refetch: boundary.refetch });
});
afterEach(() => {
  harnesses.splice(0).forEach(h => h.cleanup());
  boundary.active = null;
  expect(boundary.network).not.toHaveBeenCalled();
  expect(boundary.refetch).not.toHaveBeenCalled();
  expect(boundary.calls.mock.calls.every(([operation]) => operation === "order.walletPaymentQuote.useQuery")).toBe(true);
  vi.unstubAllGlobals();
});

describe("Moutai real detail: specification before read-only payment (offline)", () => {
  it("starts with both sheets closed, static detail specification and no preselected order total or inline controls", () => {
    const c = controller(); const tree = c.tree();
    expect(sheet(tree, "specification-sheet").props.open).toBe(false);
    expect(sheet(tree, "quote-sheet").props.open).toBe(false);
    expect(c.renderPayment).not.toHaveBeenCalled();
    expect(boundary.query).not.toHaveBeenCalled();
    const detail = byId(tree, "purchase-section");
    expect(text(detail)).toContain("规格");
    expect(text(detail)).toMatch(/53度\s*500mL/);
    expect(text(detail)).toMatch(/(?:下一步|购买时)选择生产年份与数量/);
    expect(text(detail)).not.toMatch(/已选|参考合计|合计\s*[\d¥]|2025\s*年\s*·\s*1\s*瓶/);
    expect(nodes(detail, node => typeof node.props.onClick === "function" && /规格|已选|生产年份/.test(text(node)) && node.props["data-testid"] !== "primary-buy")).toHaveLength(0);
    expect(nodes(tree, node => ["增加一瓶", "减少一瓶"].includes(node.props["aria-label"]))).toHaveLength(0);
    expect(nodes(tree, node => node.props["data-testid"] === "page-total")).toHaveLength(0);
    expect(text(byId(tree, "page-total-cny"))).toMatch(/下一步选择规格/);
    expect(text(byId(tree, "page-total-cny"))).not.toMatch(/合计|¥|\d\s*U/);
    expect(text(byId(tree, "sticky-summary"))).toMatch(/53度\s*500mL/);
    expect(text(byId(tree, "sticky-summary"))).not.toMatch(/合计|¥|202[0-6]\s*年/);
    expect(text(byId(tree, "primary-buy"))).toBe("立即购买");
    expect(text(byId(tree, "sticky-buy"))).toBe("立即购买");
  });

  it.each(["primary-buy", "sticky-buy"])("%s opens only specification and requires an explicit year click despite the 2025 reference", id => {
    const c = controller(); const tree = c.buy(id); const s = selection(tree);
    expectOnlySpecification(tree);
    expect(text(one(s.content, node => node.type === SheetTitle))).toBe("选择规格");
    expect(s.child.props.year).toBe(2025);
    expect(s.child.props.selected).toBe(false);
    expect(nodes(s.controls, node => /年份$/.test(node.props["aria-label"] ?? "")).every(node => node.props["aria-pressed"] === false)).toBe(true);
    expect(text(byId(s.controls, "sheet-total"))).toBe("请选择年份");
    expect(text(s.controls)).toContain("选择后显示对应规格合计");
    expect(byId(tree, "specification-next").props.disabled).toBe(true);
    expect(text(byId(tree, "specification-next"))).toBe("请先选择生产年份");
    // Call even the disabled handler to cover the runtime gate, not just markup.
    expectOnlySpecification(c.next());
    expect(c.renderPayment).not.toHaveBeenCalled();
    expect(boundary.query).not.toHaveBeenCalled();
  });

  it("quantity clicks alone never confirm the default/reference year", () => {
    const c = controller(); c.buy();
    for (const quantity of [1, 2, 3, 4, 5, 6]) {
      const tree = c.quantity(quantity); const s = selection(tree);
      expect(s.child.props.quantity).toBe(quantity);
      expect(s.child.props.selected).toBe(false);
      expect(byId(tree, "specification-next").props.disabled).toBe(true);
      expect(text(byId(tree, "specification-next"))).toBe("请先选择生产年份");
      expectOnlySpecification(c.next());
    }
    expect(c.renderPayment).not.toHaveBeenCalled();
  });

  it("provides every production year and exactly quantities 1–6, with no unlisted fallback controls", () => {
    const c = controller(); const s = selection(c.buy());
    expect(nodes(byId(s.controls, "sheet-years"), node => node.type === "button").map(node => node.props["aria-label"])).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020].map(year => `${year}年份`));
    expect(nodes(byId(s.controls, "sheet-quantities"), node => node.type === "button").map(node => node.props["aria-label"])).toEqual([1, 2, 3, 4, 5, 6].map(quantity => `${quantity}瓶`));
    expect(text(s.controls)).toContain("每单最多 6 瓶");
  });

  it.each([2026, 2023, 2022, 2021, 2020])("allows selecting unquoted %i but never substitutes a quoted year's price or opens payment", year => {
    const c = controller(); c.buy(); c.year(2024); c.quantity(6);
    const tree = c.year(year); const s = selection(tree);
    expect(s.child.props.year).toBe(year); expect(s.child.props.selected).toBe(true);
    expect(byLabel(s.controls, `${year}年份`).props["aria-pressed"]).toBe(true);
    expect(byLabel(s.controls, `${year}年份`).props.disabled).not.toBe(true);
    expect(text(byId(s.controls, "sheet-total"))).toBe("待报价");
    expect(text(s.controls)).toContain("不套用其他年份价");
    expect(byId(tree, "specification-next").props.disabled).toBe(true);
    expect(text(byId(tree, "specification-next"))).toBe("该年份价格待核实");
    expectOnlySpecification(c.next());
    expect(c.renderPayment).not.toHaveBeenCalled();
    // No quote must not disable a new detail buy/reconfirmation attempt.
    c.close("specification-sheet");
    expect(byId(c.tree(), "primary-buy").props.disabled).toBe(false);
    expect(byId(c.tree(), "sticky-buy").props.disabled).toBe(false);
    const reopened = c.buy("sticky-buy");
    expectOnlySpecification(reopened);
    expect(text(byId(reopened, "specification-next"))).toBe("请先选择生产年份");
  });

  const quotedChoices = [
    { year: 2025, unit: 1850 },
    { year: 2024, unit: 2729 },
  ].flatMap(sku => [1, 2, 3, 4, 5, 6].map(quantity => ({ ...sku, quantity, total: sku.unit * quantity })));
  it.each(quotedChoices)("$year × $quantity bottles uses the exact matching CNY total and continues only after selection", ({ year, unit, quantity, total }) => {
    const c = controller(); c.buy(); c.year(year); const tree = c.quantity(quantity); const s = selection(tree);
    expect(s.child.props.selected).toBe(true);
    expect(byLabel(s.controls, `${year}年份`).props["aria-pressed"]).toBe(true);
    expect(byLabel(s.controls, `${quantity}瓶`).props["aria-pressed"]).toBe(true);
    expect(nodes(byId(s.controls, "sheet-years"), node => node.props["aria-pressed"] === true)).toHaveLength(1);
    expect(nodes(byId(s.controls, "sheet-quantities"), node => node.props["aria-pressed"] === true)).toHaveLength(1);
    expect(text(byId(s.controls, "sheet-total"))).toBe(`${usdtText(total, 7.2)} U`);
    expect(text(s.controls)).toContain(`≈ ¥${cnyText(total)} · ¥${cnyText(unit)} × ${quantity} 瓶`);
    expect(byId(tree, "specification-next").props.disabled).toBe(false);
    expect(text(byId(tree, "specification-next"))).toBe("下一步：选择支付方式");
    expect(c.renderPayment).not.toHaveBeenCalled();
    const quote = c.next(); expectQuote(quote, total);
    expect(text(byId(quote, "quote-specification"))).toBe(`飞天茅台 · ${year} 年 · 53度500mL · ${quantity} 瓶`);
    expect(text(byId(quote, "quote-total"))).toBe(`${usdtText(total, 7.2)} U`);
    expect(c.renderPayment).toHaveBeenCalledOnce();
    expect(c.renderPayment).toHaveBeenCalledWith(total);
    expect(boundary.query).not.toHaveBeenCalled();
  });

  it("mounts the actual read-only wallet/hook only after next, with the current amount and no successful fabricated transport", () => {
    const c = controller(); c.tree(); c.buy(); c.quantity(6); c.next(); c.year(2024);
    expect(c.renderPayment).not.toHaveBeenCalled(); expect(boundary.query).not.toHaveBeenCalled();
    const quote = c.next();
    const walletNode = one(quote, node => node.type === MoutaiWalletPayment);
    expect(walletNode.props.totalCny).toBe(2729 * 6);
    const wallet = harness(() => MoutaiWalletPayment(walletNode.props)).render();
    expect(boundary.query).toHaveBeenCalledOnce();
    expect(boundary.query).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: true, refetchInterval: false, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false }));
    const summary = one(wallet, node => node.type === MibanWalletAvailableSummary);
    const confirmation = one(wallet, node => node.type === MibanPaymentConfirmation);
    expect(summary.props.payment).toBe(confirmation.props.payment);
    expect(summary.props.payment.ready).toBe(false); expect(summary.props.payment.canPay).toBe(false);
    expect(Number(summary.props.payment.remainingCny)).toBe(2729 * 6);
    expect(summary.props.payment.paymentAssets).toEqual([]);
    expect(text(wallet)).toContain("暂不可结算");
    expect(nodes(wallet, node => node.type === "button")).toHaveLength(0);
    const readOnly = MibanPaymentConfirmation(confirmation.props);
    expect(nodes(readOnly, node => ["button", "input", "select"].includes(node.type))).toHaveLength(0);
    expect(text(readOnly)).toContain("付款信息待核验");
    const summaryTree = harness(() => MibanWalletAvailableSummary(summary.props)).render();
    expect(text(summaryTree)).toContain("币种待查询");
    expect(nodes(summaryTree, node => node.props["data-payment-asset"])).toHaveLength(0);
    expect(boundary.refetch).not.toHaveBeenCalled();
  });

  it("modify specification returns to step one with confirmed year/quantity, then sends the newly edited amount", () => {
    const c = controller(); c.buy(); c.year(2024); c.quantity(6); let tree = c.next(); expectQuote(tree, 2729 * 6);
    c.renderPayment.mockClear();
    byText(tree, "修改规格").props.onClick(); tree = c.tree(); expectOnlySpecification(tree);
    const s = selection(tree);
    expect(s.child.props.year).toBe(2024); expect(s.child.props.quantity).toBe(6); expect(s.child.props.selected).toBe(true);
    expect(byLabel(s.controls, "2024年份").props["aria-pressed"]).toBe(true);
    expect(byLabel(s.controls, "6瓶").props["aria-pressed"]).toBe(true);
    expect(byId(tree, "specification-next").props.disabled).toBe(false);
    expect(c.renderPayment).not.toHaveBeenCalled();
    c.year(2025); c.quantity(2); tree = c.next(); expectQuote(tree, 1850 * 2);
    expect(c.renderPayment).toHaveBeenCalledOnce();
    expect(c.renderPayment).toHaveBeenCalledWith(1850 * 2);
  });

  it.each(["primary-buy", "sticky-buy"])("closing payment then %s requires year reconfirmation even with a previously valid quote", id => {
    const c = controller(); c.buy(); c.year(2024); c.quantity(4); c.next();
    const closed = c.close("quote-sheet");
    expect(nodes(closed, node => node.type === MoutaiWalletPayment)).toHaveLength(0);
    c.renderPayment.mockClear();
    const reopened = c.buy(id); expectOnlySpecification(reopened);
    expect(selection(reopened).child.props.year).toBe(2024);
    expect(selection(reopened).child.props.quantity).toBe(4);
    expect(selection(reopened).child.props.selected).toBe(false);
    expect(text(byId(reopened, "specification-next"))).toBe("请先选择生产年份");
    expectOnlySpecification(c.next()); expect(c.renderPayment).not.toHaveBeenCalled();
    c.year(2024); expectQuote(c.next(), 2729 * 4);
  });

  it("closing specification and rebuying also clears only year confirmation", () => {
    const c = controller(); c.buy(); c.year(2025); c.quantity(5); c.close("specification-sheet");
    const tree = c.buy("sticky-buy"); expectOnlySpecification(tree);
    const s = selection(tree); expect(s.child.props.quantity).toBe(5); expect(s.child.props.selected).toBe(false);
    expect(byId(tree, "specification-next").props.disabled).toBe(true);
    expectOnlySpecification(c.next()); expect(c.renderPayment).not.toHaveBeenCalled();
  });

  it("return to product unmounts payment and the following buy does not bypass year confirmation", () => {
    const c = controller(); c.buy(); c.year(2025); const quote = c.next();
    byText(quote, "返回商品页").props.onClick(); const detail = c.tree();
    expect(sheet(detail, "quote-sheet").props.open).toBe(false);
    expect(nodes(detail, node => node.type === MoutaiWalletPayment)).toHaveLength(0);
    expect(byId(c.buy(), "specification-next").props.disabled).toBe(true);
  });
});

describe("real component identity gates, no mutation and missing FX regressions", () => {
  it.each([
    { name: "no identity", identity: null },
    { name: "unverified admin", identity: { ...verifiedAdmin, verified: false } },
    { name: "ordinary user", identity: { ...verifiedAdmin, role: "user" } },
    { name: "unverified parent", identity: { ...verifiedAdmin, verified: false, role: "user", mibanRole: "parent" } },
  ])("$name cannot enter either purchase sheet, even by invoking disabled click handlers", ({ identity }) => {
    const c = controller({ identity });
    for (const id of ["primary-buy", "sticky-buy"]) {
      expect(byId(c.tree(), id).props.disabled).toBe(true);
      const tree = c.buy(id);
      expect(sheet(tree, "specification-sheet").props.open).toBe(false);
      expect(sheet(tree, "quote-sheet").props.open).toBe(false);
    }
    c.year(2025); const tree = c.next();
    expect(byId(tree, "specification-next").props.disabled).toBe(true);
    expect(sheet(tree, "quote-sheet").props.open).toBe(false);
    expect(c.renderPayment).not.toHaveBeenCalled(); expect(boundary.query).not.toHaveBeenCalled();
  });

  it.each([null, verifiedAdmin])("identity loading never authorizes buy, including an old verified props snapshot: %#", identity => {
    const c = controller({ identity, identityLoading: true });
    for (const id of ["primary-buy", "sticky-buy"]) {
      expect(byId(c.tree(), id).props.disabled).toBe(true);
      expect(sheet(c.buy(id), "specification-sheet").props.open).toBe(false);
    }
    c.year(2025);
    expect(sheet(c.next(), "quote-sheet").props.open).toBe(false);
    expect(c.renderPayment).not.toHaveBeenCalled(); expect(boundary.query).not.toHaveBeenCalled();
  });

  it.each([
    { role: "super_admin" }, { role: "admin" }, { role: "parent" }, { role: "user", mibanRole: "parent" },
  ])("retains existing verified admin/parent permission $role/$mibanRole without an API identity fixture", role => {
    const c = controller({ identity: { ...verifiedAdmin, ...role } });
    expect(byId(c.tree(), "primary-buy").props.disabled).toBe(false);
    expectOnlySpecification(c.buy()); c.year(2025); expectQuote(c.next(), 1850);
  });

  it("losing verification after choosing a year blocks next at runtime and suppresses wallet mounting", () => {
    const c = controller(); c.buy(); c.year(2025); c.quantity(2);
    c.props.identity = null;
    expect(byId(c.tree(), "specification-next").props.disabled).toBe(true);
    expect(sheet(c.next(), "quote-sheet").props.open).toBe(false); expect(c.renderPayment).not.toHaveBeenCalled();
    c.props.identity = { ...verifiedAdmin }; c.next(); c.renderPayment.mockClear();
    c.props.identity = { ...verifiedAdmin, verified: false };
    expect(nodes(c.tree(), node => node.type === MoutaiWalletPayment)).toHaveLength(0);
    expect(c.renderPayment).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 0, -1, NaN, Infinity])("invalid/missing USD-CNY rate %# never invents zero U or a fixed rate while preserving CNY totals", rate => {
    const c = controller({ usdtCnyRate: rate }); const detail = c.tree();
    expect(text(byId(detail, "page-unit-u"))).toBe("汇率待查询");
    c.buy(); c.year(2024); const tree = c.quantity(3); const s = selection(tree);
    expect(text(byId(s.controls, "sheet-total"))).toBe("汇率待查询");
    expect(text(s.controls)).toContain(`≈ ¥${cnyText(2729 * 3)} · ¥2,729 × 3 瓶`);
    expect(text(s.controls)).not.toMatch(/(?:^|[^\d])0(?:\.00)?\s*U/);
    expect(byId(tree, "specification-next").props.disabled).toBe(false);
    const quote = c.next(); expectQuote(quote, 2729 * 3);
    expect(text(byId(quote, "quote-total"))).toBe("汇率待查询");
    expect(c.renderPayment).toHaveBeenLastCalledWith(2729 * 3);
  });

  it("does not offer order/debit submission and real source contains no mutation transport (AST safety supplement)", () => {
    const c = controller(); c.buy(); c.year(2025); const quote = c.next();
    expect(nodes(byId(quote, "quote-sheet"), node => typeof node.props.onClick === "function").map(node => text(node))).toEqual(expect.arrayContaining(["修改规格", "返回商品页"]));
    expect(nodes(quote, node => typeof node.props.onClick === "function" && /确认支付|提交订单|立即下单|扣款/.test(text(node)))).toHaveLength(0);
    for (const relative of ["../client/src/components/MoutaiDetailView.tsx", "../client/src/pages/miban/MoutaiWalletPayment.tsx"]) {
      const source = readFileSync(new URL(relative, import.meta.url), "utf8");
      const file = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      expect((file as any).parseDiagnostics).toHaveLength(0);
      const writes: string[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && /(?:^|\.)(?:useMutation|mutate|mutateAsync|createOrder|createPayment|preparePayment)$/.test(node.expression.getText(file))) writes.push(node.expression.getText(file));
        ts.forEachChild(node, visit);
      };
      visit(file); expect(writes).toEqual([]);
    }
    expect(boundary.calls).not.toHaveBeenCalled();
  });
});
