import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only component boundaries are replaced. No app/server/network/database is started.
const boundary = vi.hoisted(() => ({ active: null as any, payment: null as any, cart: [] as any[], catalog: undefined as any, pending: false, mutations: {} as Record<string, any>, support: vi.fn(), create: vi.fn(), address: vi.fn(), authenticated: true }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual,
    useState: (x: any) => boundary.active ? boundary.active.useState(x) : actual.useState(x),
    useRef: (x: any) => boundary.active ? boundary.active.useRef(x) : actual.useRef(x),
    useMemo: (f: any, d: any) => boundary.active ? boundary.active.useMemo(f, d) : actual.useMemo(f, d),
    useCallback: (f: any, d: any) => boundary.active ? boundary.active.useMemo(() => f, d) : actual.useCallback(f, d),
    useEffect: (f: any, d: any) => boundary.active ? boundary.active.useEffect(f, d) : actual.useEffect(f, d),
  };
});
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: boundary.authenticated, loading: false }) }));
vi.mock("wouter", () => ({ Link: "a", useLocation: () => ["/p/proj_hzxm2t/pear/tiangui", vi.fn()] }));
vi.mock("html2canvas", () => ({ default: vi.fn() }));
vi.mock("@/hooks/useRiceFlyAnimation", () => ({ useRiceFlyAnimation: () => ({ flyToTarget: vi.fn() }) }));
vi.mock("../client/src/pages/miban/AddressBook", () => ({ default: () => null }));
vi.mock("../client/src/pages/miban/MibanImage", () => ({ MibanImage: "img" }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/trpc", () => {
  const utils = new Proxy({}, { get: (_, key) => key === "limitedProduct" ? { invoiceSupport: { fetch: boundary.support } } : new Proxy({}, { get: () => ({ invalidate: vi.fn() }) }) });
  const router = (path: string[] = []): any => new Proxy({}, { get: (_, key: string) => {
    if (key === "useUtils") return () => utils;
    if (key === "useQuery") return () => ({ data: path.join(".") === "cart.list" ? boundary.cart : path.join(".") === "rice.catalogList" ? boundary.catalog : undefined, refetch: vi.fn(), isLoading: false });
    if (key === "useMutation") return (options: any = {}) => {
      const name = path.join("."); boundary.mutations[name] = options;
      return { isPending: name === "order.create" && boundary.pending, mutate: name === "order.create" ? boundary.create : name === "address.add" ? boundary.address : vi.fn() };
    };
    return router([...path, key]);
  } });
  return { trpc: router() };
});
vi.mock("../client/src/pages/miban/MibanMixedPayment", async () => {
  const actual = await vi.importActual<any>("../client/src/pages/miban/MibanMixedPayment");
  return { ...actual, useMibanMixedPayment: () => boundary.payment };
});
import CartDrawer from "../client/src/pages/miban/CartDrawer";
import TianguiPearDetail from "../client/src/pages/miban/TianguiPearDetail";
import DiyWorkshop from "../client/src/pages/miban/DiyWorkshop";
import MoutaiWalletPayment from "../client/src/pages/miban/MoutaiWalletPayment";
import MibanInvoiceRequestForm, { createMibanInvoiceDraft, MIBAN_INVOICE_UNAVAILABLE_NOTICE } from "../client/src/pages/miban/MibanInvoiceRequestForm";
import { MibanPaymentConfirmation, MibanWalletAvailableSummary } from "../client/src/pages/miban/MibanMixedPayment";
import { MibanCheckoutConfirmationDetails } from "../client/src/pages/miban/MibanCheckoutConfirmationDetails";
import { toast } from "sonner";

const equalDeps = (a: any[], b: any[]) => Boolean(a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i])));
const harnesses: any[] = [];
function harness(render: () => any) {
  const slots: any[] = []; let cursor = 0; let effects: any[] = [];
  const h = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, (next: any) => { slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo(f: any, deps: any[]) { const i = cursor++; if (!(i in slots) || !equalDeps(slots[i].deps, deps)) slots[i] = { value: f(), deps }; return slots[i].value; },
    useEffect(f: any, deps: any[]) { const i = cursor++; if (!(i in slots) || !equalDeps(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: f() }; }); },
    render() { cursor = 0; effects = []; boundary.active = h; let tree; try { tree = render(); } finally { boundary.active = null; } effects.forEach(f => f()); return tree; },
    cleanup() { slots.forEach(s => s?.cleanup?.()); },
  }; harnesses.push(h); return h;
}
function nodes(node: any, predicate: (x: any) => boolean): any[] {
  if (Array.isArray(node)) return node.flatMap(x => nodes(x, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...nodes((node.props as any).children, predicate)];
}
function text(node: any): string { return Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text((node.props as any).children) : typeof node === "string" || typeof node === "number" ? String(node) : ""; }
function one(tree: any, predicate: (x: any) => boolean) { const found = nodes(tree, predicate); expect(found.length).toBeGreaterThan(0); return found[0]; }
function button(tree: any, label: string) { return one(tree, n => n.type === "button" && text(n) === label); }
function change(tree: any, placeholder: string, value: string) { one(tree, n => n.type === "input" && n.props.placeholder === placeholder).props.onChange({ target: { value } }); }
function deferred<T>() { let resolve!: (x: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
const entries = [["CartDrawer", CartDrawer], ["TianguiPearDetail", TianguiPearDetail], ["DiyWorkshop", DiyWorkshop]] as const;
function checkout(name: string, component: () => any) {
  const h = harness(component); let tree = h.render();
  if (name === "CartDrawer") {
    one(tree, n => n.props["aria-label"] === "购物车").props.onClick(); tree = h.render();
    one(tree, n => n.type === "button" && text(n).includes("立即下单")).props.onClick();
  } else if (name === "TianguiPearDetail") button(tree, "立即购买").props.onClick();
  else {
    one(tree, n => n.type === "button" && text(n).includes("下一步")).props.onClick(); tree = h.render();
    one(tree, n => n.type === "button" && text(n).includes("白米") && !n.props["aria-label"]).props.onClick(); tree = h.render();
    one(tree, n => n.type === "button" && text(n).includes("下一步")).props.onClick(); tree = h.render();
    one(tree, n => n.type === "button" && text(n).includes("立即下单")).props.onClick();
  }
  tree = h.render();
  change(tree, "收货人姓名", " 测试收货人 "); change(tree, name === "TianguiPearDetail" ? "手机号" : "手机号码", "13800138000");
  if (name === "TianguiPearDetail") {
    one(tree, n => n.type === "select" && n.props.value === "").props.onChange({ target: { value: "北京市" } });
    tree = h.render(); change(tree, "详细地址（街道、楼号、门牌号等）", "测试路1号");
  } else change(tree, "收货地址（省市区+详细地址）", "北京市测试路1号");
  tree = h.render();
  return { h, tree, invoice(draft: any) { one(h.render(), n => n.type === MibanInvoiceRequestForm).props.onChange(draft); return h.render(); }, open() { button(h.render(), "去支付").props.onClick(); return h.render(); } };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-10T12:00:00+08:00")); vi.stubGlobal("React", React);
  vi.stubGlobal("localStorage", { getItem: () => "isolated-ui-session", setItem: vi.fn() });
  boundary.authenticated = true; boundary.pending = false; boundary.mutations = {}; boundary.catalog = undefined;
  boundary.cart = [{ id: 1, riceId: "db_2", riceName: "白米", weightJin: "10", pricePerJin: "4.8", ratio: 100, recipeId: "recipe-1", recipeName: "测试配方" }];
  boundary.create.mockReset(); boundary.address.mockReset(); boundary.support.mockReset().mockResolvedValue({ supported: true, version: 1 });
  boundary.payment = { canPay: true, ready: true, refreshing: false, selectedCodes: ["CNY"], priorityCode: "CNY", cnyInput: "48.00", paymentAssets: [{ assetCode: "CNY", amount: "48" }], deductions: [{ assetCode: "CNY", amount: "48", cnyValue: "48" }], totalValueCny: "48", remainingCny: "0", usdtCnyRate: 7, paymentSummary: "¥48", statusMessage: "页面报价已固定", resetToCnyFirst: vi.fn(), cancelPendingPayment: vi.fn(), preparePayment: vi.fn().mockResolvedValue({ cnyAmount: 48, paymentAssets: [{ assetCode: "CNY", amount: "48" }], paymentQuoteToken: "fresh-signed-unit-fixture" }) };
  vi.mocked(toast.error).mockClear(); vi.mocked(toast.info).mockClear();
});
afterEach(() => { harnesses.splice(0).forEach(h => h.cleanup()); boundary.active = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

for (const [name, component] of entries) describe(`${name}: isolated two-step checkout`, () => {
  it("defaults invoice off and validates/open-only before a read-only wallet popup", async () => {
    const c = checkout(name, component);
    expect(one(c.tree, n => n.type === MibanInvoiceRequestForm).props.draft).toEqual(createMibanInvoiceDraft());
    expect(nodes(c.tree, n => n.type === MibanWalletAvailableSummary)).toHaveLength(1);
    const popup = c.open();
    const dialog = one(popup, n => n.props["aria-label"] === "钱包支付确认");
    expect(dialog.props.role).toBe("dialog"); expect(dialog.props["aria-modal"]).toBe("true");
    expect(nodes(popup, n => n.type === MibanWalletAvailableSummary || n.type === MibanInvoiceRequestForm)).toHaveLength(0);
    expect(nodes(popup, n => n.type === MibanPaymentConfirmation)).toHaveLength(1);
    expect(nodes(popup, n => n.type === MibanCheckoutConfirmationDetails)).toHaveLength(1);
    expect(boundary.support).not.toHaveBeenCalled(); expect(boundary.payment.preparePayment).not.toHaveBeenCalled(); expect(boundary.create).not.toHaveBeenCalled();
    await button(popup, "确认支付").props.onClick();
    expect(boundary.support).not.toHaveBeenCalled(); expect(boundary.create).toHaveBeenCalledOnce();
    expect(boundary.create.mock.calls[0][0]).not.toHaveProperty("invoiceRequest");
    expect(boundary.create.mock.calls[0][0].paymentQuoteToken).toBe("fresh-signed-unit-fixture");
  });
  it.each(["personal", "company"])("submits normalized %s invoice only after fresh capability support", async type => {
    const c = checkout(name, component); c.invoice({ enabled: true, type, title: " 测试抬头 ", taxNo: " TAX-123 " });
    boundary.support.mockResolvedValue({ supported: true, version: 2 });
    const popup = c.open(); await button(popup, "确认支付").props.onClick();
    expect(boundary.support).toHaveBeenCalledWith(undefined, { staleTime: 0, retry: false });
    expect(boundary.create.mock.calls[0][0].invoiceRequest).toEqual(type === "personal" ? { type, title: "测试抬头" } : { type, title: "测试抬头", taxNo: "TAX-123" });
    expect(boundary.support.mock.invocationCallOrder[0]).toBeLessThan(boundary.payment.preparePayment.mock.invocationCallOrder[0]);
  });
  it.each([null, { supported: false, version: 1 }, { supported: true, version: 0 }, { supported: true, version: "1" }, { supported: true, version: NaN }, { supported: true, version: Infinity }])("rejects unsupported capability %j before preparing/debit", async support => {
    const c = checkout(name, component); c.invoice({ enabled: true, type: "personal", title: "个人", taxNo: "" }); boundary.support.mockResolvedValue(support);
    await button(c.open(), "确认支付").props.onClick();
    expect(toast.info).toHaveBeenCalledWith(MIBAN_INVOICE_UNAVAILABLE_NOTICE); expect(boundary.payment.preparePayment).not.toHaveBeenCalled(); expect(boundary.create).not.toHaveBeenCalled();
  });
  it("blocks transport failures and empty company fields before any order/payment", async () => {
    const c = checkout(name, component); c.invoice({ enabled: true, type: "company", title: "", taxNo: "" });
    button(c.h.render(), "去支付").props.onClick(); expect(boundary.support).not.toHaveBeenCalled(); expect(boundary.create).not.toHaveBeenCalled();
    c.invoice({ enabled: true, type: "personal", title: "个人", taxNo: "" }); boundary.support.mockRejectedValue(new Error("fixture unavailable"));
    await button(c.open(), "确认支付").props.onClick(); expect(toast.info).toHaveBeenCalledWith(MIBAN_INVOICE_UNAVAILABLE_NOTICE); expect(boundary.payment.preparePayment).not.toHaveBeenCalled();
  });
  it("synchronously blocks double clicks through pending capability and actual order", async () => {
    const c = checkout(name, component); c.invoice({ enabled: true, type: "personal", title: "个人", taxNo: "" }); const d = deferred<any>(); boundary.support.mockReturnValue(d.promise);
    const handler = button(c.open(), "确认支付").props.onClick; const first = handler(); await handler(); expect(boundary.support).toHaveBeenCalledOnce();
    d.resolve({ supported: true, version: 1 }); await first; await handler(); expect(boundary.create).toHaveBeenCalledOnce();
    boundary.mutations["order.create"].onSettled();
  });
  it.each(["cancel", "unmount", "address", "invoice", "cart", "wallet"])("does not create an order after asynchronous %s invalidation", async reason => {
    const c = checkout(name, component); c.invoice({ enabled: true, type: "personal", title: "个人", taxNo: "" }); const d = deferred<any>(); boundary.support.mockReturnValue(d.promise);
    const popup = c.open(); const submit = button(popup, "确认支付").props.onClick();
    if (reason === "cancel") button(popup, "返回修改订单").props.onClick();
    if (reason === "unmount") c.h.cleanup();
    if (reason === "address" || reason === "invoice") {
      // Retained confirmation handlers may fire after async request begins; scopes must still block them.
      const old = c.tree;
      if (reason === "address") change(old, "收货人姓名", "另一个收货人");
      else one(old, n => n.type === MibanInvoiceRequestForm).props.onChange({ enabled: true, type: "personal", title: "另一个抬头", taxNo: "" });
      c.h.render();
    }
    if (reason === "cart") {
      if (name === "CartDrawer") boundary.cart = boundary.cart.map(i => ({ ...i, riceName: "同价替换米种" }));
      else if (name === "TianguiPearDetail") one(c.tree, n => n.type === "button" && text(n).includes("10斤礼盒装")).props.onClick();
      else boundary.catalog = [{ id: "white", stdName: "同价更新白米", pricePerJin: 4.8, colorHex: "#A07840", img: "" }];
      c.h.render();
    }
    if (reason === "wallet") { boundary.payment = { ...boundary.payment, selectedCodes: ["USDT"], paymentAssets: [{ assetCode: "USDT", amount: "7" }] }; c.h.render(); }
    d.resolve({ supported: true, version: 1 }); await submit;
    expect(boundary.create).not.toHaveBeenCalled(); expect(boundary.address).not.toHaveBeenCalled();
  });
  it("cancels during quote preparation and retains invoice when returning to edit", async () => {
    const c = checkout(name, component); const draft = { enabled: true, type: "personal", title: "保留抬头", taxNo: "" }; c.invoice(draft);
    const d = deferred<any>(); boundary.payment.preparePayment.mockReturnValue(d.promise);
    const popup = c.open(); const submit = button(popup, "确认支付").props.onClick(); await Promise.resolve(); await Promise.resolve();
    button(popup, "返回修改订单").props.onClick();
    expect(one(c.h.render(), n => n.type === MibanInvoiceRequestForm).props.draft).toEqual(draft);
    d.resolve({ cnyAmount: 48, paymentAssets: [{ assetCode: "CNY", amount: "48" }], paymentQuoteToken: "fresh" }); await submit; expect(boundary.create).not.toHaveBeenCalled();
  });
  it("shows updated read-only amount and waits for a second explicit confirmation", async () => {
    const c = checkout(name, component); const popup = c.open(); boundary.payment.preparePayment.mockResolvedValueOnce(null);
    await button(popup, "确认支付").props.onClick(); expect(boundary.create).not.toHaveBeenCalled();
    boundary.payment = { ...boundary.payment, paymentAssets: [{ assetCode: "CNY", amount: "49" }], deductions: [{ assetCode: "CNY", amount: "49", cnyValue: "49" }] };
    const updated = c.h.render(); expect(nodes(updated, n => n.type === MibanPaymentConfirmation)).toHaveLength(1);
    await button(updated, "确认支付").props.onClick(); expect(boundary.create).toHaveBeenCalledOnce();
  });
});

describe("basic checkout inventory/address compatibility and Moutai preview", () => {
  it.each(entries.filter(([name]) => name !== "CartDrawer"))("%s saves optional address only in actual order success callback", async (name, component) => {
    const c = checkout(name, component); one(c.tree, n => n.type === "button" && text(n).includes("保存到地址簿")).props.onClick(); c.h.render();
    await button(c.open(), "确认支付").props.onClick(); expect(boundary.address).not.toHaveBeenCalled();
    boundary.create.mock.calls[0][1].onSuccess(); expect(boundary.address).toHaveBeenCalledOnce();
  });
  it("keeps expired pear unavailable without creating a SKU or alternate order", () => {
    vi.setSystemTime(new Date("2026-11-27T12:00:00+08:00")); const tree = harness(TianguiPearDetail).render();
    expect(button(tree, "已下架，暂停购买").props.disabled).toBe(true); expect(boundary.create).not.toHaveBeenCalled();
  });
  it("Moutai keeps selection preview and read-only amount, no invoice or checkout", () => {
    const tree = MoutaiWalletPayment({ totalCny: 1499 });
    expect(nodes(tree, n => n.type === MibanWalletAvailableSummary)).toHaveLength(1); expect(nodes(tree, n => n.type === MibanPaymentConfirmation)).toHaveLength(1);
    expect(nodes(tree, n => n.type === MibanInvoiceRequestForm || n.type === "button")).toHaveLength(0); expect(text(tree)).toContain("暂不可结算");
    expect(boundary.support).not.toHaveBeenCalled(); expect(boundary.payment.preparePayment).not.toHaveBeenCalled(); expect(boundary.create).not.toHaveBeenCalled();
  });
  it("read-only payment summary contains no choice, refresh, detail toggle or review checkbox", () => {
    const tree = MibanPaymentConfirmation({ payment: boundary.payment });
    expect(nodes(tree, n => ["input", "select", "button", MibanWalletAvailableSummary].includes(n.type))).toHaveLength(0);
  });
  it.each(entries)("%s keeps only one prepared order call and no legacy review reset", (name) => {
    const source = readFileSync(fileURLToPath(new URL(`../client/src/pages/miban/${name}.tsx`, import.meta.url)), "utf8");
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); expect(file.parseDiagnostics).toHaveLength(0);
    expect(source.match(/createOrder\.mutate\(/g)).toHaveLength(1); expect(source).not.toContain("MibanMixedPaymentAllocation"); expect(source).not.toContain("confirmPaymentReview(false)");
    expect(source).toContain("walletVersion"); expect(source).toContain("scope === latestCheckoutScope.current"); expect(source).toContain("mountedRef.current");
  });
});
