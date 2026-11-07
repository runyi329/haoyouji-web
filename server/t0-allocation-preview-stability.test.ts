import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Only production AST declarations/callbacks run in a VM. No runtime imports of
// App, T0Journal, Router, tRPC, DB, browser, or service initialization are allowed.
// Query/state/document fixtures below exist only inside this isolated unit test.
function source(file: string) {
  return ts.createSourceFile(
    file,
    readFileSync(new URL(file, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}
const app = source("../client/src/App.tsx");
const journal = source("../client/src/pages/T0Journal.tsx");
function nodes<T extends ts.Node>(
  root: ts.Node,
  predicate: (node: ts.Node) => node is T
): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined)
    throw new Error(`Missing real production node: ${label}`);
  return value;
}
function variable(tree: ts.SourceFile, name: string) {
  return required(
    nodes(tree, ts.isVariableDeclaration).find(
      node => ts.isIdentifier(node.name) && node.name.text === name
    ),
    name
  );
}
function initializer(tree: ts.SourceFile, name: string) {
  return required(variable(tree, name).initializer, `${name} initializer`);
}
function script(text: string) {
  const output = ts.transpileModule(text, {
    fileName: "isolated.tsx",
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  return new vm.Script(output);
}
function context(dependencies: Record<string, unknown>) {
  return vm.createContext({
    ...dependencies,
    require: (name: string) => {
      throw new Error(`Forbidden runtime import: ${name}`);
    },
  });
}
function evaluate<T = any>(
  node: ts.Node,
  tree: ts.SourceFile,
  dependencies: Record<string, unknown>
): T {
  return script(`(${node.getText(tree)});`).runInContext(
    context(dependencies),
    { timeout: 2000 }
  );
}
const draftEffectCall = required(
  nodes(journal, ts.isCallExpression).find(
    call =>
      call.expression.getText(journal) === "useEffect" &&
      call.arguments[0]
        ?.getText(journal)
        .includes("sharedIncomeServerPlanActive") &&
      call.arguments[0]?.getText(journal).includes("setSharedIncomeDrafts")
  ),
  "formal allocation draft synchronization effect"
);
const draftEffect = required(
  draftEffectCall.arguments[0],
  "draft effect callback"
);
if (!ts.isArrowFunction(draftEffect))
  throw new Error("Expected real draft effect arrow callback");
const draftScript = script(`(${draftEffect.getText(journal)})();`);
const derivedScript = script(
  [
    "sharedIncomeServerPlanActive",
    "sharedIncomeServerPlan",
    "sharedIncomeServerPlanUnavailable",
    "sharedIncomeServerPlanInputKey",
  ]
    .map(
      name =>
        `globalThis.${name} = (${initializer(journal, name).getText(journal)});`
    )
    .join("\n")
);
const snapshotInitializer = initializer(
  journal,
  "sharedIncomePlanDraftSnapshotRef"
);
const saveHandler = initializer(journal, "handleSaveEntry");
if (!ts.isArrowFunction(saveHandler) || !ts.isBlock(saveHandler.body))
  throw new Error("Expected real save callback body");
// Run the complete real guard prefix, stopping before unrelated trade mutation.
// This is not a substitute guard: all leading statements come from handleSaveEntry.
const saveGuardStatements = saveHandler.body.statements.slice(
  0,
  saveHandler.body.statements.findIndex(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        item => item.name.getText(journal) === "normalizedQuantity"
      )
  )
);
if (
  saveGuardStatements.length < 3 ||
  !saveGuardStatements.every(ts.isIfStatement)
)
  throw new Error("Missing real confirmation guard prefix");
const saveGuardScript = script(
  `(() => {\n${saveGuardStatements.map(statement => statement.getText(journal)).join("\n")}\nreturn "passed-guards";\n})();`
);

function input(extra: Record<string, unknown> = {}) {
  return {
    ledgerId: 52,
    accountId: 1,
    accountName: "account",
    relatedUserId: 2,
    relatedFundId: 1,
    action: "closeLong",
    price: "110",
    quantity: "1",
    targetPrice: "100",
    targetOpeningEntryId: 101,
    metrics: ["principal"],
    budgetMode: "amount",
    budgetValue: "5.00",
    ...extra,
  };
}
function plan(extra: Record<string, unknown> = {}) {
  return {
    planToken: "signed-token-1",
    asOf: "2026-11-07T04:00:00Z",
    shareableAmount: 10,
    sourceNetPnl: 10,
    candidates: [],
    weightedFacts: [],
    allocations: [
      { recipientUserId: 3, amount: "2.00" },
      { recipientUserId: 4, amount: "3.00" },
    ],
    ...extra,
  };
}
function draftHarness() {
  const state = {
    drafts: {} as Record<string, string>,
    selections: {} as Record<string, number>,
    error: null as string | null,
    closeError: null as string | null,
  };
  const setDrafts = vi.fn((next: Record<string, string>) => {
    state.drafts = next;
  });
  const setSelections = vi.fn((next: Record<string, number>) => {
    state.selections = next;
  });
  const setError = vi.fn((next: string | null) => {
    state.error = next;
  });
  const query: {
    data: ReturnType<typeof plan> | undefined;
    isFetching: boolean;
    error: Error | null;
    refetch: ReturnType<typeof vi.fn>;
  } = {
    data: undefined,
    isFetching: true,
    error: null,
    refetch: vi.fn(async () => undefined),
  };
  const sandbox = context({
    canManage: true,
    closeConfirmationStep: "review",
    isCloseDistributionPreviewLink: false,
    ACTIONS: { closeLong: { opening: false }, openLong: { opening: true } },
    entryForm: { action: "closeLong" },
    sharedIncomeAllocationMetrics: ["principal"],
    sharedIncomeAnnualizedRuleUnavailable: false,
    sharedIncomeServerPlanInput: input(),
    t0SharedIncomeServerPlanQuery: query,
    useRef: (current: unknown) => ({ current }),
    setSharedIncomeDrafts: setDrafts,
    setSharedIncomeTargetSelections: setSelections,
    setSharedIncomeAllocationPlanError: setError,
    setCloseSaveError: (next: string | null) => {
      state.closeError = next;
    },
  });
  sandbox.sharedIncomePlanDraftSnapshotRef = evaluate(
    snapshotInitializer,
    journal,
    sandbox
  );
  const render = (patch: Record<string, unknown> = {}) => {
    Object.assign(sandbox, patch);
    derivedScript.runInContext(sandbox, { timeout: 2000 });
    draftScript.runInContext(sandbox, { timeout: 2000 });
    sandbox.sharedIncomeAllocationPlanError = state.error;
  };
  const successful = (result = plan()) => {
    query.data = result;
    query.isFetching = false;
    query.error = null;
    render();
  };
  const resetCalls = () => {
    setDrafts.mockClear();
    setSelections.mockClear();
    setError.mockClear();
  };
  const confirm = (allocations: unknown = query.data?.allocations) => {
    derivedScript.runInContext(sandbox, { timeout: 2000 });
    sandbox.sharedIncomeSaveAllocations = allocations;
    sandbox.sharedIncomeAllocationPlanError = state.error;
    return saveGuardScript.runInContext(sandbox, { timeout: 2000 });
  };
  return {
    state,
    query,
    sandbox,
    render,
    successful,
    resetCalls,
    confirm,
    setDrafts,
    setSelections,
    setError,
  };
}

function pollingHarness(
  location = "/ledger/52/t0",
  visibilityState = "visible"
) {
  const listeners = new Map<string, () => void>();
  let cleanup: (() => void) | undefined;
  let tick: (() => void) | undefined;
  const invalidate = vi.fn(
    async (
      _input?: unknown,
      _filters?: { predicate: (query: { queryKey: unknown[] }) => boolean }
    ) => undefined
  );
  const document = {
    visibilityState,
    addEventListener: vi.fn((name: string, callback: () => void) =>
      listeners.set(name, callback)
    ),
    removeEventListener: vi.fn((name: string, _callback: () => void) =>
      listeners.delete(name)
    ),
  };
  const window = {
    setInterval: vi.fn((callback: () => void, _interval: number) => {
      tick = callback;
      return 71;
    }),
    clearInterval: vi.fn(),
  };
  const declaration = required(
    nodes(app, ts.isFunctionDeclaration).find(
      node => node.name?.text === "ActiveLedgerPagePolling"
    ),
    "ActiveLedgerPagePolling"
  );
  const sandbox = context({
    useLocation: () => [location],
    trpc: { useUtils: () => ({ ledger: { invalidate } }) },
    document,
    window,
    useEffect: (callback: () => (() => void) | undefined) => {
      cleanup = callback();
    },
  });
  script(
    `const ACTIVE_LEDGER_PAGE_REFRESH_INTERVAL_MS = ${initializer(app, "ACTIVE_LEDGER_PAGE_REFRESH_INTERVAL_MS").getText(app)};\n${declaration.getText(app)}\nActiveLedgerPagePolling();`
  ).runInContext(sandbox, { timeout: 2000 });
  return {
    invalidate,
    document,
    window,
    listeners,
    tick: () => required(tick, "polling timer")(),
    cleanup: () => required(cleanup, "polling cleanup")(),
  };
}

describe("T0 formal allocation is excluded only from the real two-second ledger polling", () => {
  it.each(["/ledger/52/t0", "/ledger/37/orders?tab=active"])(
    "keeps ledger polling active on %s and excludes the exact preview path only",
    location => {
      const h = pollingHarness(location);
      expect(h.invalidate).toHaveBeenCalledOnce();
      expect(h.window.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        2_000
      );
      const [allLedgerInputs, filters] = h.invalidate.mock.calls[0];
      expect(allLedgerInputs).toBeUndefined();
      const predicate = required(
        filters,
        "actual invalidate predicate"
      ).predicate;
      expect(
        predicate({
          queryKey: [
            ["ledger", "t0PreviewSharedIncomeAllocation"],
            { input: { ledgerId: 52 }, type: "query" },
          ],
        })
      ).toBe(false);
      for (const path of [
        ["ledger", "t0GetJournal"],
        ["ledger", "t0GetTeamOverview"],
        ["ledger", "t0GetPayoutLogs"],
        ["ledger", "t0GetAllocationRules"],
        ["ledger", "t0GetMarketContributionFacts"],
        ["ledger", "t0PreviewSharedIncomeAllocationExtra"],
        ["ledger", "t0PreviewSharedIncomeAllocation", "nested"],
        ["other", "t0PreviewSharedIncomeAllocation"],
        ["getT0EthPerpetualMark"],
        ["getCryptoPrices"],
      ])
        expect(predicate({ queryKey: [path] })).toBe(true);
      expect(predicate({ queryKey: ["legacy-unstructured-key"] })).toBe(true);
      h.tick();
      expect(h.invalidate).toHaveBeenCalledTimes(2);
    }
  );
  it("skips hidden tabs, immediately refreshes on return to foreground, and removes timer/listener on cleanup", () => {
    const h = pollingHarness();
    h.invalidate.mockClear();
    h.document.visibilityState = "hidden";
    h.tick();
    required(h.listeners.get("visibilitychange"), "visibility handler")();
    expect(h.invalidate).not.toHaveBeenCalled();
    h.document.visibilityState = "visible";
    required(h.listeners.get("visibilitychange"), "visibility handler")();
    expect(h.invalidate).toHaveBeenCalledOnce();
    h.cleanup();
    expect(h.window.clearInterval).toHaveBeenCalledWith(71);
    expect(h.document.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    expect(h.listeners.size).toBe(0);
  });
  it.each([
    "/ledger/52/aa-dividend-manage",
    "/ledger/37/finance-unified",
    "/ledger/52/funder-management",
    "/ledger/53/t0",
    "/wallet",
  ])("does not activate excluded page %s", location => {
    const h = pollingHarness(location);
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.window.setInterval).not.toHaveBeenCalled();
  });
  it("retains independent ETH mark and general crypto quote refresh configuration", () => {
    const options = (path: string) =>
      required(
        nodes(journal, ts.isCallExpression).find(
          call => call.expression.getText(journal) === path
        )?.arguments[1],
        path
      );
    const mark = evaluate(
      options("trpc.getT0EthPerpetualMark.useQuery"),
      journal,
      {
        canAccess: true,
        t0MarkPricePushConnected: false,
        T0_PRICE_REFRESH_INTERVAL_MS: 500,
      }
    );
    expect(mark).toMatchObject({
      enabled: true,
      refetchInterval: 500,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    });
    const pushed = evaluate(
      options("trpc.getT0EthPerpetualMark.useQuery"),
      journal,
      {
        canAccess: true,
        t0MarkPricePushConnected: true,
        T0_PRICE_REFRESH_INTERVAL_MS: 500,
      }
    );
    expect(pushed.refetchInterval).toBe(5_000);
    const crypto = evaluate(options("trpc.getCryptoPrices.useQuery"), journal, {
      canAccess: true,
    });
    expect(crypto).toMatchObject({
      enabled: true,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    });
  });
});

describe("T0 real formal plan query and stable input identity", () => {
  it("keeps the formal query input, 45-second signature renewal, focus refresh and retry safety", () => {
    const call = initializer(journal, "t0SharedIncomeServerPlanQuery");
    if (!ts.isCallExpression(call))
      throw new Error("Expected production preview query");
    expect(call.expression.getText(journal)).toBe(
      "trpc.ledger.t0PreviewSharedIncomeAllocation.useQuery"
    );
    expect(call.arguments[0].getText(journal)).toBe(
      "sharedIncomeServerPlanInput"
    );
    const options = (active: boolean, sharedInput = input()) =>
      evaluate(call.arguments[1], journal, {
        sharedIncomeServerPlanActive: active,
        sharedIncomeServerPlanInput: sharedInput,
      });
    expect(options(true)).toMatchObject({
      enabled: true,
      staleTime: 20_000,
      refetchInterval: 45_000,
      refetchOnWindowFocus: true,
      retry: expect.any(Function),
    });
    const retry = options(true).retry;
    expect(retry(0, new Error("temporary network failure"))).toBe(true);
    expect(retry(1, new Error("temporary network failure"))).toBe(false);
    for (const code of ["CONFLICT", "BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"]) {
      expect(retry(0, { data: { code } })).toBe(false);
      expect(retry(1, { data: { code } })).toBe(false);
    }
    expect(options(false)).toMatchObject({
      enabled: false,
      refetchInterval: false,
    });
    expect(options(true, input({ price: "0" })).enabled).toBe(false);
    expect(options(true, input({ quantity: "0" })).enabled).toBe(false);
    expect(options(true, input({ targetPrice: "" })).enabled).toBe(false);
  });
  it("keys the snapshot by JSON of shared request input, not token/asOf/object identity", () => {
    const key = initializer(journal, "sharedIncomeServerPlanInputKey");
    expect(key.getText(journal)).toBe(
      "JSON.stringify(sharedIncomeServerPlanInput)"
    );
    expect(
      evaluate(key, journal, { sharedIncomeServerPlanInput: input() })
    ).toBe(JSON.stringify(input()));
    expect(
      evaluate(key, journal, {
        sharedIncomeServerPlanInput: structuredClone(input()),
      })
    ).toBe(JSON.stringify(input()));
    const dependencies = required(
      draftEffectCall.arguments[1],
      "draft effect dependency list"
    );
    expect(dependencies.getText(journal)).toContain(
      "sharedIncomeServerPlanInputKey"
    );
    const request = initializer(journal, "sharedIncomeServerPlanInput");
    expect(request.getText(journal)).toContain(
      "budgetMode: sharedIncomeAllocationBudgetMode"
    );
    expect(request.getText(journal)).toContain(
      "budgetValue: sharedIncomeAllocationBudgetValue.trim()"
    );
    expect(request.getText(journal)).toContain(
      "sharedIncomeAllocationMetrics.includes(metric)"
    );
  });
});

describe("T0 real draft effect preserves rendered amounts through background refresh", () => {
  it("initial fetching produces no false allocations; first success fills the actual recipients/amounts", () => {
    const h = draftHarness();
    h.render();
    expect(h.state.drafts).toEqual({});
    expect(h.state.error).toMatch(/正在/);
    h.successful();
    expect(h.state.drafts).toEqual({ "3": "2.00", "4": "3.00" });
    expect(h.state.error).toBeNull();
    expect(h.sandbox.sharedIncomePlanDraftSnapshotRef.current.inputKey).toBe(
      JSON.stringify(input())
    );
    expect(
      h.sandbox.sharedIncomePlanDraftSnapshotRef.current.allocationKey
    ).toBe(JSON.stringify(plan().allocations));
  });
  it("isFetching -> success with unchanged amounts never clears/reassigns drafts or target selections", () => {
    const h = draftHarness();
    h.successful();
    const displayed = h.state.drafts;
    h.state.selections = { "3": 7 };
    const selections = h.state.selections;
    h.resetCalls();
    h.query.isFetching = true;
    h.render();
    expect(h.state.drafts).toBe(displayed);
    expect(h.state.selections).toBe(selections);
    expect(h.sandbox.sharedIncomeServerPlanUnavailable).toBe(true);
    h.successful(
      plan({ planToken: "renewed-token", asOf: "2026-11-07T04:00:45Z" })
    );
    expect(h.setDrafts).not.toHaveBeenCalled();
    expect(h.setSelections).not.toHaveBeenCalled();
    expect(h.state.drafts).toBe(displayed);
    expect(h.state.error).toBeNull();
    expect(h.sandbox.sharedIncomeServerPlan.planToken).toBe("renewed-token");
    expect(h.sandbox.sharedIncomeServerPlanUnavailable).toBe(false);
  });
  it("token/asOf/candidate metadata rotation with equal allocations preserves manual edits for the confirm mismatch guard", () => {
    const h = draftHarness();
    h.successful();
    h.state.drafts = { "3": "1.50", "4": "3.50" };
    const edits = h.state.drafts;
    h.state.selections = { "3": 99 };
    h.resetCalls();
    for (const token of ["token-2", "token-3", "token-4"])
      h.successful(
        plan({
          planToken: token,
          asOf: token,
          candidates: [{ userId: "3", name: token }],
        })
      );
    expect(h.state.drafts).toBe(edits);
    expect(h.state.selections).toEqual({ "3": 99 });
    expect(h.setDrafts).not.toHaveBeenCalled();
    expect(h.setSelections).not.toHaveBeenCalled();
    expect(
      h.confirm([
        { recipientUserId: 3, amount: "1.50" },
        { recipientUserId: 4, amount: "3.50" },
      ])
    ).toBeUndefined();
    expect(h.state.closeError).toMatch(/分配金额已被修改/);
  });
  it.each([
    ["budgetValue", "6.00"],
    ["budgetMode", "percentage"],
    ["metrics", ["sharedContribution"]],
    ["quantity", "2"],
    ["price", "111"],
    ["targetOpeningEntryId", 102],
    ["relatedUserId", 5],
  ])(
    "real request %s change clears the obsolete plan once, then fills success even when amounts equal the prior plan",
    (field, value) => {
      const h = draftHarness();
      h.successful();
      h.state.selections = { "3": 7 };
      h.resetCalls();
      h.query.data = undefined;
      h.query.isFetching = true;
      h.render({
        sharedIncomeServerPlanInput: input({ [field as string]: value }),
      });
      expect(h.state.drafts).toEqual({});
      expect(h.state.selections).toEqual({});
      expect(h.setDrafts).toHaveBeenCalledTimes(1);
      expect(h.setSelections).toHaveBeenCalledTimes(1);
      h.render();
      expect(h.setDrafts).toHaveBeenCalledTimes(1);
      h.successful(plan({ planToken: "new-input-token" }));
      expect(h.state.drafts).toEqual({ "3": "2.00", "4": "3.00" });
      expect(h.setDrafts).toHaveBeenCalledTimes(2);
      expect(h.state.error).toBeNull();
    }
  );
  it("truly changed allocation amounts/recipients replace drafts once even if the token does not change", () => {
    const h = draftHarness();
    h.successful();
    h.resetCalls();
    const changed = plan({
      allocations: [
        { recipientUserId: 3, amount: "1.00" },
        { recipientUserId: 5, amount: "4.00" },
      ],
    });
    h.successful(changed);
    expect(h.state.drafts).toEqual({ "3": "1.00", "5": "4.00" });
    expect(h.setDrafts).toHaveBeenCalledOnce();
    expect(h.setSelections).toHaveBeenCalledOnce();
    h.successful(structuredClone(changed));
    expect(h.setDrafts).toHaveBeenCalledOnce();
  });
  it("background errors retain existing drafts and selections; unchanged recovery clears only error", () => {
    const h = draftHarness();
    h.successful();
    const drafts = h.state.drafts;
    h.state.selections = { "4": 11 };
    const selections = h.state.selections;
    h.resetCalls();
    h.query.error = new Error("预览请求暂时失败");
    h.render();
    expect(h.state.error).toBe("预览请求暂时失败");
    expect(h.state.drafts).toBe(drafts);
    expect(h.state.selections).toBe(selections);
    expect(h.sandbox.sharedIncomeServerPlanUnavailable).toBe(true);
    expect(h.confirm()).toBeUndefined();
    expect(h.query.refetch).toHaveBeenCalledOnce();
    expect(h.state.closeError).toBe("预览请求暂时失败");
    h.successful(plan({ planToken: "recovery-token" }));
    expect(h.state.error).toBeNull();
    expect(h.state.drafts).toBe(drafts);
    expect(h.setDrafts).not.toHaveBeenCalled();
    expect(h.setSelections).not.toHaveBeenCalled();
    expect(h.confirm()).toBe("passed-guards");
  });
  it("an initial request error fails closed without inventing data, then recovery fills first real plan", () => {
    const h = draftHarness();
    h.query.isFetching = false;
    h.query.error = new Error("首次读取失败");
    h.render();
    expect(h.state.drafts).toEqual({});
    expect(h.state.error).toBe("首次读取失败");
    expect(h.confirm()).toBeUndefined();
    expect(h.query.refetch).toHaveBeenCalledOnce();
    h.successful();
    expect(h.state.drafts).toEqual({ "3": "2.00", "4": "3.00" });
    expect(h.state.error).toBeNull();
  });
  it("disabled/manual mode never overwrites drafts and resets snapshot so re-enabled formal mode reapplies its plan", () => {
    const h = draftHarness();
    h.successful();
    h.state.drafts = { "3": "4.25" };
    h.state.selections = { "3": 8 };
    h.resetCalls();
    h.render({ sharedIncomeAllocationMetrics: [] });
    expect(h.sandbox.sharedIncomeServerPlanActive).toBe(false);
    expect(h.sandbox.sharedIncomePlanDraftSnapshotRef.current).toBeNull();
    h.query.error = new Error("disabled cached error");
    h.query.isFetching = true;
    h.render();
    expect(h.state.drafts).toEqual({ "3": "4.25" });
    expect(h.state.selections).toEqual({ "3": 8 });
    expect(h.setDrafts).not.toHaveBeenCalled();
    expect(h.setSelections).not.toHaveBeenCalled();
    expect(h.confirm([{ recipientUserId: 3, amount: "4.25" }])).toBe(
      "passed-guards"
    );
    h.query.error = null;
    h.query.isFetching = false;
    h.render({ sharedIncomeAllocationMetrics: ["principal"] });
    expect(h.state.drafts).toEqual({ "3": "2.00", "4": "3.00" });
    expect(h.state.selections).toEqual({});
  });
});

describe("T0 amount stability never weakens real confirmation safety", () => {
  it("blocks confirmation while fetching, refetches the real query, and passes only after success", () => {
    const h = draftHarness();
    h.successful();
    const drafts = h.state.drafts;
    h.query.isFetching = true;
    h.render();
    expect(h.confirm()).toBeUndefined();
    expect(h.query.refetch).toHaveBeenCalledOnce();
    expect(h.state.closeError).toMatch(/正式分配清单尚未就绪/);
    expect(h.state.drafts).toBe(drafts);
    h.successful();
    expect(h.confirm()).toBe("passed-guards");
  });
  it("direct preview links still cannot confirm, regardless of cached signed plan", () => {
    const h = draftHarness();
    h.successful();
    h.render({ isCloseDistributionPreviewLink: true });
    expect(h.confirm()).toBeUndefined();
    expect(h.state.closeError).toMatch(/不会写入/);
    expect(h.query.refetch).not.toHaveBeenCalled();
  });
  it("save payload takes current signed token, metrics and budgets rather than stale snapshot fields", () => {
    const mutation = required(
      nodes(saveHandler, ts.isCallExpression).find(
        call => call.expression.getText(journal) === "saveEntryMutation.mutate"
      ),
      "actual save mutation"
    );
    const payload = required(mutation.arguments[0], "actual save payload");
    if (!ts.isObjectLiteralExpression(payload))
      throw new Error("Expected save payload object");
    const signedFields = [
      "sharedIncomePlanToken",
      "sharedIncomeMetrics",
      "sharedIncomeBudgetMode",
      "sharedIncomeBudgetValue",
    ];
    const fields = payload.properties.filter(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) &&
        signedFields.includes(property.name.getText(journal))
    );
    expect(fields).toHaveLength(4);
    const evaluateFields = (active: boolean) =>
      script(
        `({ ${fields.map(field => field.getText(journal)).join(",")} });`
      ).runInContext(
        context({
          sharedIncomeServerPlanActive: active,
          sharedIncomeServerPlan: plan({ planToken: "latest-renewed-token" }),
          sharedIncomeServerPlanInput: input(),
        }),
        { timeout: 2000 }
      );
    expect(evaluateFields(true)).toEqual({
      sharedIncomePlanToken: "latest-renewed-token",
      sharedIncomeMetrics: ["principal"],
      sharedIncomeBudgetMode: "amount",
      sharedIncomeBudgetValue: "5.00",
    });
    expect(Object.values(evaluateFields(false))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
