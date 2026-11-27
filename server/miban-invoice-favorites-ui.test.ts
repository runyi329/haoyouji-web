import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only hooks and the transport boundary are replaced; no server, real DB or payment.
const boundary = vi.hoisted(() => ({ active: null as any, query: vi.fn(), mutate: vi.fn(), utils: vi.fn(), client: null as any }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual,
    useId: () => "memory-field",
    useState: (x: any) => boundary.active ? boundary.active.useState(x) : actual.useState(x),
    useRef: (x: any) => boundary.active ? boundary.active.useRef(x) : actual.useRef(x),
    useEffect: (f: any, d: any) => boundary.active ? boundary.active.useEffect(f, d) : actual.useEffect(f, d),
  };
});
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => {
  boundary.utils();
  return { client: boundary.client };
} } }));
import MibanInvoiceRequestForm, { createMibanInvoiceDraft, type MibanInvoiceDraft } from "../client/src/pages/miban/MibanInvoiceRequestForm";
import { MibanInvoiceMemory, MIBAN_INVOICE_MEMORY_FAILURE } from "../client/src/pages/miban/MibanInvoiceMemory";

const equalDeps = (a: any[], b: any[]) => Boolean(a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i])));
const harnesses: any[] = [];
function harness(render: () => any) {
  const slots: any[] = []; let cursor = 0; let effects: any[] = [];
  const h = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, (next: any) => { slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
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
function deferred<T>() { let resolve!: (x: T) => void; let reject!: (x: any) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const personal = { type: "personal", title: "历史个人" } as const;
const company = { type: "company", title: "历史公司", taxNo: "91330000TEST2026" } as const;
const input = (field = "title") => ({ tagName: "INPUT", dataset: { invoiceField: field } });
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function controller(initial: Partial<{ userId: number; draft: MibanInvoiceDraft; disabled: boolean }> = {}) {
  const onChange = vi.fn((draft: MibanInvoiceDraft) => { props.draft = draft; });
  const props = { userId: 101, draft: { ...createMibanInvoiceDraft(), enabled: true }, disabled: false, onChange, children: React.createElement("input", { "data-invoice-field": "title" }), ...initial };
  const h = harness(() => MibanInvoiceMemory(props));
  h.render();
  return {
    h, props, onChange,
    tree: () => h.render(),
    edit: (patch: Partial<MibanInvoiceDraft>, field = "title") => {
      props.draft = { ...props.draft, ...patch };
      h.render().props.onChangeCapture({ target: input(field) });
    },
    blur: (next: any = null, inside = false, field = "title") => h.render().props.onBlurCapture({ target: input(field), relatedTarget: next, currentTarget: { contains: () => inside } }),
  };
}
const favoriteButtons = (tree: any) => nodes(tree, n => n.type === "button" && text(n).includes(" · "));

beforeEach(() => {
  vi.stubGlobal("React", React);
  boundary.query.mockReset().mockResolvedValue([]);
  boundary.mutate.mockReset().mockResolvedValue({ saved: true });
  boundary.utils.mockReset();
  boundary.client = { limitedProduct: { invoiceFavorites: { query: boundary.query }, rememberInvoice: { mutate: boundary.mutate } } };
});
afterEach(() => { harnesses.splice(0).forEach(h => h.cleanup()); vi.unstubAllGlobals(); });

describe("invoice favorites mount/API/privacy contract (offline)", () => {
  it("defaults off; logged-out, invalid user IDs and closed forms never mount hooks or request history", () => {
    for (const userId of [undefined, 0, -1, NaN, Infinity, 1.5]) {
      const tree = MibanInvoiceRequestForm({ userId, draft: { ...createMibanInvoiceDraft(), enabled: true }, onChange: vi.fn() });
      expect(nodes(tree, n => n.type === MibanInvoiceMemory)).toHaveLength(0);
      expect(renderToStaticMarkup(tree)).toContain("发票抬头");
    }
    const off = MibanInvoiceRequestForm({ userId: 101, draft: createMibanInvoiceDraft(), onChange: vi.fn() });
    expect(nodes(off, n => n.type === MibanInvoiceMemory || n.type === "input")).toHaveLength(0);
    expect(boundary.utils).not.toHaveBeenCalled(); expect(boundary.query).not.toHaveBeenCalled(); expect(boundary.mutate).not.toHaveBeenCalled();
  });
  it("keeps the default function pure and keys its logged-in child by userId with marked real fields", () => {
    const tree = MibanInvoiceRequestForm({ userId: 101, draft: { enabled: true, type: "company", title: "草稿", taxNo: "TAX" }, onChange: vi.fn() });
    const child = nodes(tree, n => n.type === MibanInvoiceMemory)[0];
    expect(child.key).toBe("101"); expect(child.props.userId).toBe(101);
    expect(nodes(child, n => n.type === "input").map(n => n.props["data-invoice-field"])).toEqual(["title", "taxNo"]);
    const source = readFileSync(new URL("../client/src/pages/miban/MibanInvoiceRequestForm.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("useRef"); expect(source).not.toContain("useState");
  });
  it("fetches real personal/company history exactly once and never fills or enables the parent automatically", async () => {
    boundary.query.mockResolvedValue([personal, company]);
    const draft = { enabled: true, type: "company" as const, title: "当前未完成草稿", taxNo: "" };
    const c = controller({ draft }); await settle();
    expect(boundary.query).toHaveBeenCalledTimes(1);
    expect(boundary.query).toHaveBeenCalledWith(undefined, { signal: expect.any(AbortSignal) });
    expect(favoriteButtons(c.tree())).toHaveLength(2); expect(c.props.draft).toBe(draft); expect(c.onChange).not.toHaveBeenCalled();
    expect(boundary.mutate).not.toHaveBeenCalled();
  });
  it("one-click selection fills the complete favorite; personal immediately clears any company tax number without saving", async () => {
    boundary.query.mockResolvedValue([personal, company]); const c = controller(); await settle();
    favoriteButtons(c.tree())[1].props.onClick();
    expect(c.onChange).toHaveBeenLastCalledWith({ enabled: true, ...company });
    favoriteButtons(c.tree())[0].props.onClick();
    expect(c.onChange).toHaveBeenLastCalledWith({ enabled: true, ...personal, taxNo: "" });
    c.blur(); await settle(); expect(boundary.mutate).not.toHaveBeenCalled();
  });
  it("wraps long titles, shows only a minimal tax suffix, filters invalid history and never uses local storage", async () => {
    const long = { ...company, title: "公司".repeat(95) };
    boundary.query.mockResolvedValue([long, long, { type: "company", title: "非法", taxNo: "\n" }]);
    const c = controller(); await settle(); const tree = c.tree();
    expect(favoriteButtons(tree)).toHaveLength(1); expect(text(tree)).toContain(long.title);
    expect(text(tree)).toContain("2026"); expect(text(tree)).not.toContain(company.taxNo);
    expect(favoriteButtons(tree)[0].props.className).toContain("min-w-0");
    const source = readFileSync(new URL("../client/src/pages/miban/MibanInvoiceMemory.tsx", import.meta.url), "utf8");
    for (const forbidden of ["localStorage", "console.", "useQuery(", ".fetch(", "onSuccess"]) expect(source).not.toContain(forbidden);
    expect(source).toContain("[overflow-wrap:anywhere]"); expect(source).toContain("rounded-[4px]");
  });
  it("history read failure is non-blocking and never fabricated as an empty success or save", async () => {
    boundary.query.mockRejectedValue(new Error("offline")); const c = controller(); await settle();
    expect(text(c.tree())).toContain("常用发票暂未读取，不影响本次发票申请"); expect(text(c.tree())).not.toContain("暂无常用发票");
    expect(c.onChange).not.toHaveBeenCalled(); expect(boundary.mutate).not.toHaveBeenCalled();
  });
});

describe("user-edit only / blur autosave / acknowledgement", () => {
  it("enabling with the default personal title and merely blurring never saves", async () => {
    const c = controller(); c.blur(); await settle(); expect(boundary.mutate).not.toHaveBeenCalled();
    c.tree().props.onChangeCapture({ target: { tagName: "BUTTON", dataset: { invoiceField: "title" } } });
    c.blur(); await settle(); expect(boundary.mutate).not.toHaveBeenCalled();
  });
  it("does not save per keystroke or between company fields; saves only on leaving the area with valid complete input", async () => {
    const c = controller({ draft: { enabled: true, type: "company", title: "", taxNo: "" } }); await settle();
    c.edit({ title: "输入公司" }); c.blur(input("taxNo"), true);
    c.edit({ taxNo: "9133" }, "taxNo"); c.blur(input("title"), true, "taxNo");
    expect(boundary.mutate).not.toHaveBeenCalled();
    c.edit({ taxNo: "  91330000COMPLETE  " }, "taxNo"); c.blur(null, false, "taxNo"); await settle();
    expect(boundary.mutate).toHaveBeenCalledTimes(1);
    expect(boundary.mutate).toHaveBeenCalledWith({ type: "company", title: "输入公司", taxNo: "91330000COMPLETE" });
    expect(c.props.draft.taxNo).toBe("  91330000COMPLETE  "); expect(c.onChange).not.toHaveBeenCalled();
    expect(boundary.query).toHaveBeenCalledTimes(2);
  });
  it.each([
    { enabled: true, type: "personal", title: "  ", taxNo: "" },
    { enabled: true, type: "personal", title: "\n非法", taxNo: "" },
    { enabled: true, type: "company", title: "公司", taxNo: "" },
    { enabled: true, type: "company", title: "公司", taxNo: "TAX\t" },
    { enabled: true, type: "company", title: "A".repeat(201), taxNo: "TAX" },
  ] as MibanInvoiceDraft[])("does not save blank/illegal fields: %#", async draft => {
    const c = controller({ draft }); c.edit({}); c.blur(); await settle(); expect(boundary.mutate).not.toHaveBeenCalled();
  });
  it("personal save strips residual company tax number and success preserves exact untrimmed parent draft", async () => {
    const c = controller(); c.edit({ title: "  实际姓名  ", taxNo: "OLD-TAX" }); const draft = c.props.draft;
    c.blur(); await settle(); expect(boundary.mutate).toHaveBeenCalledWith({ type: "personal", title: "实际姓名" });
    expect(c.props.draft).toBe(draft); expect(c.onChange).not.toHaveBeenCalled();
  });
  it("remembers an identity only after saved:true; deduplicates in flight and after success", async () => {
    const pending = deferred<{ saved: true }>(); boundary.mutate.mockReturnValue(pending.promise);
    const c = controller(); c.edit({ title: "重复" }); c.blur();
    c.edit({ title: "重复" }); c.blur(); expect(boundary.mutate).toHaveBeenCalledTimes(1);
    pending.resolve({ saved: true }); await settle(); c.edit({ title: "重复" }); c.blur(); await settle();
    expect(boundary.mutate).toHaveBeenCalledTimes(1);
  });
  it.each(["reject", "unacknowledged"])("shows the exact non-blocking failure for %s and retries after another real edit", async failure => {
    if (failure === "reject") boundary.mutate.mockRejectedValueOnce(new Error("offline"));
    else boundary.mutate.mockResolvedValueOnce({ saved: false });
    const c = controller(); c.edit({ title: "重试姓名" }); c.blur(); await settle();
    expect(text(c.tree())).toContain(MIBAN_INVOICE_MEMORY_FAILURE); expect(boundary.query).toHaveBeenCalledTimes(1);
    c.blur(); await settle(); expect(boundary.mutate).toHaveBeenCalledTimes(1);
    c.edit({ title: "重试姓名" }); c.blur(); await settle(); expect(boundary.mutate).toHaveBeenCalledTimes(2);
    expect(text(c.tree())).not.toContain(MIBAN_INVOICE_MEMORY_FAILURE); expect(boundary.query).toHaveBeenCalledTimes(2);
    expect(c.onChange).not.toHaveBeenCalled();
  });
  it("never overwrites subsequent draft edits when an earlier save resolves; refresh replaces the history with real data", async () => {
    const pending = deferred<{ saved: true }>(); boundary.mutate.mockReturnValue(pending.promise);
    const c = controller(); await settle(); c.edit({ title: "先保存" }); c.blur(); c.edit({ title: "后续草稿" });
    boundary.query.mockResolvedValue([{ type: "personal", title: "云端真实返回" }]); pending.resolve({ saved: true }); await settle();
    expect(c.props.draft.title).toBe("后续草稿"); expect(c.onChange).not.toHaveBeenCalled(); expect(text(c.tree())).toContain("云端真实返回");
    expect(text(c.tree())).not.toContain("先保存");
  });
  it("selecting a favorite, changing type or closing the switch cannot promote stale dirty into a default-personal save", async () => {
    boundary.query.mockResolvedValue([personal, company]); const c = controller(); await settle();
    c.edit({ title: "dirty" }); favoriteButtons(c.tree())[0].props.onClick(); c.blur();
    expect(boundary.mutate).not.toHaveBeenCalled();
    c.edit({ title: "dirty" }); c.tree().props.onClickCapture({ target: { closest: () => ({}) } }); c.props.draft = { ...createMibanInvoiceDraft(), enabled: true }; c.blur();
    expect(boundary.mutate).not.toHaveBeenCalled();
    c.edit({ title: "关闭前" }); c.blur({ closest: () => ({}) }); await settle(); expect(boundary.mutate).not.toHaveBeenCalled();
  });
  it("disabled guards edits, blur saves and stale favorite handlers, not only the rendered disabled attribute", async () => {
    boundary.query.mockResolvedValue([company]); const c = controller(); await settle(); const staleButton = favoriteButtons(c.tree())[0];
    c.edit({ title: "尚未保存" }); c.props.disabled = true;
    expect(favoriteButtons(c.tree())[0].props.disabled).toBe(true); staleButton.props.onClick(); c.blur(); await settle();
    expect(c.onChange).not.toHaveBeenCalled(); expect(boundary.mutate).not.toHaveBeenCalled();
  });
});

describe("user/cache/response scope isolation", () => {
  it("switching users hides old data immediately, aborts the old read and truly requests new data without shared cache reuse", async () => {
    const old = deferred<any[]>(); const fresh = deferred<any[]>(); boundary.query.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const c = controller(); const oldSignal = boundary.query.mock.calls[0][1].signal;
    c.props.userId = 202; expect(text(c.tree())).not.toContain(personal.title);
    expect(boundary.query).toHaveBeenCalledTimes(2); expect(oldSignal.aborted).toBe(true);
    old.resolve([personal]); await settle(); expect(text(c.tree())).not.toContain(personal.title);
    fresh.resolve([company]); await settle(); expect(text(c.tree())).toContain(company.title); expect(text(c.tree())).not.toContain(personal.title);
  });
  it("a stale favorite button from an old user cannot fill the new user's draft", async () => {
    boundary.query.mockResolvedValue([personal]); const c = controller(); await settle(); const old = favoriteButtons(c.tree())[0];
    c.props.userId = 202; c.tree(); old.props.onClick(); expect(c.onChange).not.toHaveBeenCalled();
  });
  it("already visible old-user history disappears in the very first new-user render", async () => {
    const fresh = deferred<any[]>(); boundary.query.mockResolvedValueOnce([personal]).mockReturnValueOnce(fresh.promise);
    const c = controller(); await settle(); expect(text(c.tree())).toContain(personal.title);
    c.props.userId = 202; expect(text(c.tree())).not.toContain(personal.title); expect(text(c.tree())).not.toContain(personal.title);
    fresh.resolve([company]); await settle(); expect(text(c.tree())).toContain(company.title);
  });
  it("old-user save success neither refreshes the new history nor deduplicates new-user input", async () => {
    const old = deferred<{ saved: true }>(); boundary.mutate.mockReturnValueOnce(old.promise);
    const c = controller(); c.edit({ title: "同名" }); c.blur(); c.props.userId = 202; c.tree(); await settle();
    old.resolve({ saved: true }); await settle(); expect(boundary.query).toHaveBeenCalledTimes(2);
    c.edit({ title: "同名" }); c.blur(); await settle(); expect(boundary.mutate).toHaveBeenCalledTimes(2);
  });
  it("switching users isolates both late save success/failure and dedup identities", async () => {
    const old = deferred<{ saved: true }>(); boundary.mutate.mockReturnValueOnce(old.promise);
    const c = controller(); c.edit({ title: "同名" }); c.blur(); c.props.userId = 202; c.tree(); await settle();
    old.reject(new Error("old user failed")); await settle(); expect(text(c.tree())).not.toContain(MIBAN_INVOICE_MEMORY_FAILURE);
    c.edit({ title: "同名" }); c.blur(); await settle(); expect(boundary.mutate).toHaveBeenCalledTimes(2);
  });
  it.each(["close", "unmount"])("%s suppresses old read/save responses and their refresh writes", async mode => {
    const oldRead = deferred<any[]>(); const oldSave = deferred<{ saved: true }>(); boundary.query.mockReturnValueOnce(oldRead.promise); boundary.mutate.mockReturnValueOnce(oldSave.promise);
    const c = controller(); c.edit({ title: "旧草稿" }); c.blur(); const signal = boundary.query.mock.calls[0][1].signal;
    if (mode === "close") { c.props.draft = createMibanInvoiceDraft(); c.tree(); } else c.h.cleanup();
    expect(signal.aborted).toBe(true); oldRead.resolve([personal]); oldSave.resolve({ saved: true }); await settle();
    expect(boundary.query).toHaveBeenCalledTimes(1); expect(c.onChange).not.toHaveBeenCalled();
    if (mode === "close") expect(text(c.tree())).not.toContain(personal.title);
  });
  it("out-of-order list reads never replace a newer refreshed history", async () => {
    const old = deferred<any[]>(); boundary.query.mockReturnValueOnce(old.promise).mockResolvedValueOnce([company]);
    const c = controller(); c.edit({ title: "新姓名" }); c.blur(); await settle(); expect(text(c.tree())).toContain(company.title);
    old.resolve([personal]); await settle(); expect(text(c.tree())).toContain(company.title); expect(text(c.tree())).not.toContain(personal.title);
  });
  it("latest save notice wins when concurrent distinct identities settle out of order", async () => {
    const first = deferred<any>(); const second = deferred<any>(); boundary.mutate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const c = controller(); c.edit({ title: "第一" }); c.blur(); c.edit({ title: "第二" }); c.blur();
    second.resolve({ saved: true }); await settle(); first.reject(new Error("older")); await settle(); expect(text(c.tree())).not.toContain(MIBAN_INVOICE_MEMORY_FAILURE);
    expect(c.props.draft.title).toBe("第二"); expect(c.onChange).not.toHaveBeenCalled();
  });
});
