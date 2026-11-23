import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { isAdminRechargeManagementPage } from "../client/src/lib/adminWalletRequests";

// Only execute the production polling declaration, never mount App or call an API/DB.
const app = ts.createSourceFile("App.tsx", readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = app.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && node.name?.text === "ActiveLedgerPagePolling")
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === "ACTIVE_LEDGER_PAGE_REFRESH_INTERVAL_MS"))
).map(node => node.getText(app)).join("\n");
const production = ts.transpileModule(declarations + "\nActiveLedgerPagePolling();", { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;

type QueryShape = { queryKey: readonly unknown[]; state: { fetchStatus: string } };
type Filters = { type: "active"; refetchType: "active"; predicate: (query: QueryShape) => boolean };
function harness(location = "/ledger/37", client?: QueryClient) {
  let tick: (() => void) | undefined;
  let cleanup: (() => void) | undefined;
  const listeners = new Map<string, () => void>();
  const document = { visibilityState: "visible", addEventListener: vi.fn((name: string, callback: () => void) => listeners.set(name, callback)), removeEventListener: vi.fn((name: string) => listeners.delete(name)) };
  const window = { setInterval: vi.fn((callback: () => void, _interval: number) => { tick = callback; return 4; }), clearInterval: vi.fn() };
  const pending: Promise<unknown>[] = [];
  const invalidate = vi.fn((_input?: unknown, filters?: Filters, options?: { cancelRefetch: boolean }) => {
    const promise = client ? client.invalidateQueries({ queryKey: [["ledger"]], ...filters }, options) : Promise.resolve();
    pending.push(promise);
    return promise;
  });
  new vm.Script(production).runInNewContext({ useLocation: () => [location], trpc: { useUtils: () => ({ ledger: { invalidate } }) }, document, window, isAdminRechargeManagementPage, useEffect: (effect: () => (() => void) | undefined) => { cleanup = effect(); } });
  return { invalidate, document, window, listeners, tick: () => tick?.(), cleanup: () => cleanup?.(), drain: () => Promise.all(pending) };
}
const query = (procedure: string, ledgerId: number, fetchStatus = "idle") => ({ queryKey: [["ledger", procedure], { input: { ledgerId }, type: "query" }], state: { fetchStatus } });

describe("current-ledger non-interrupting refresh", () => {
  it("selects only idle current-ledger reads and preserves entry/plan snapshots", () => {
    const h = harness("/ledger/37/orders?tab=active");
    const [, filters, options] = h.invalidate.mock.calls[0];
    expect(filters).toMatchObject({ type: "active", refetchType: "active" });
    expect(options).toEqual({ cancelRefetch: false });
    const predicate = filters!.predicate;
    expect(predicate(query("getStockTagCalendar", 37))).toBe(true);
    expect(predicate(query("getStockTagCalendar", 52))).toBe(false);
    expect(predicate(query("getStockTagCalendar", 37, "fetching"))).toBe(false);
    expect(predicate(query("getStockTagCalendar", 37, "paused"))).toBe(false);
    for (const name of ["t0PreviewSharedIncomeAllocation", "getCalendarEntry", "getCalendarNumber"]) expect(predicate(query(name, 37))).toBe(false);
    expect(predicate({ queryKey: [["ledger", "getById"], { input: { id: 37 }, type: "query" }], state: { fetchStatus: "idle" } })).toBe(true);
    expect(predicate({ queryKey: [["ledger", "getCategories"]], state: { fetchStatus: "idle" } })).toBe(false);
    expect(predicate({ queryKey: [["getCryptoPrices"], { input: { ledgerId: 37 } }], state: { fetchStatus: "idle" } })).toBe(false);
    expect(h.window.setInterval).toHaveBeenCalledWith(expect.any(Function), 15_000);
    h.cleanup();
  });

  it("allows a cached slow refetch to finish across multiple timer ticks without an abort", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const key = query("getStockTagCalendar", 37).queryKey;
    const crossKey = query("getStockTagCalendar", 52).queryKey;
    const inactiveKey = query("getStockTagDailySnapshots", 37).queryKey;
    client.setQueryData(key, "previous");
    client.setQueryData(crossKey, "other-ledger");
    client.setQueryData(inactiveKey, "prefetched-history");
    let resolve: ((data: string) => void) | undefined;
    let calls = 0;
    let aborts = 0;
    const observer = new QueryObserver(client, { queryKey: key, staleTime: Infinity, queryFn: ({ signal }) => { calls++; signal.addEventListener("abort", () => { aborts++; }); return new Promise<string>(done => { resolve = done; }); } });
    const stop = observer.subscribe(() => undefined);
    const otherFetch = vi.fn(async () => "other-new");
    const otherObserver = new QueryObserver(client, { queryKey: crossKey, staleTime: Infinity, queryFn: otherFetch });
    const stopOther = otherObserver.subscribe(() => undefined);
    const h = harness("/ledger/37", client);
    expect(calls).toBe(1);
    for (let i = 0; i < 5; i++) h.tick();
    expect(calls).toBe(1);
    expect(aborts).toBe(0);
    expect(client.getQueryData(key)).toBe("previous");
    expect(otherFetch).not.toHaveBeenCalled();
    expect(client.getQueryState(crossKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(inactiveKey)?.isInvalidated).toBe(false);
    resolve!("fresh");
    await h.drain();
    expect(client.getQueryData(key)).toBe("fresh");
    expect(aborts).toBe(0);
    h.cleanup(); stop(); stopOther(); client.clear();
  });

  it("switches ledger scope and keeps hidden-tab/foreground lifecycle", () => {
    const first = harness("/ledger/37");
    first.cleanup();
    const h = harness("/ledger/52/t0-journal?payout=withdrawal");
    const predicate = h.invalidate.mock.calls[0][1]!.predicate;
    expect(predicate(query("t0GetPayoutAvailability", 52))).toBe(true);
    expect(predicate(query("getCategories", 37))).toBe(false);
    h.invalidate.mockClear(); h.document.visibilityState = "hidden"; h.tick();
    h.listeners.get("visibilitychange")?.();
    expect(h.invalidate).not.toHaveBeenCalled();
    h.document.visibilityState = "visible"; h.listeners.get("visibilitychange")?.();
    expect(h.invalidate).toHaveBeenCalledOnce();
    h.cleanup();
    expect(h.window.clearInterval).toHaveBeenCalledWith(4);
    expect(h.listeners.size).toBe(0);
  });

  it.each(["/ledger/37/aa-dividend-manage", "/ledger/52/finance-unified", "/ledger/52/funder-management", "/ledger/52/af-recharge-manage", "/ledger/52/af-recharge-manage/", "/ledger/53", "/wallet"])("does not add polling to %s", location => {
    const h = harness(location);
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.window.setInterval).not.toHaveBeenCalled();
  });
});
