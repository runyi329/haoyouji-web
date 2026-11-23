import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createTRPCUntypedClient, httpBatchLink, httpLink, splitLink } from "@trpc/client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createUseQueries } from "@trpc/react-query/shared";
import superjson from "superjson";
import { isT0JournalRequest } from "../client/src/lib/t0JournalRequests";
import { isAdminWalletRequest } from "../client/src/lib/adminWalletRequests";

// 仅执行生产源码中的纯表达式/首屏分支和真实tRPC link；绝不导入生产router或连接数据库。
const source = readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../client/src/main.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("T0Journal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const mainTree = ts.createSourceFile("main.tsx", main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodes<T extends ts.Node>(ast: ts.Node, predicate: (n: ts.Node) => n is T): T[] {
  const result: T[] = [];
  const visit = (n: ts.Node) => { if (predicate(n)) result.push(n); ts.forEachChild(n, visit); };
  visit(ast);
  return result;
}
function code(text: string): string {
  return ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
}
function execute(text: string, values: Record<string, unknown> = {}): any {
  return new Function(...Object.keys(values), code(text))(...Object.values(values));
}
function initializer(name: string): string {
  const declaration = nodes(tree, ts.isVariableDeclaration).find(n => n.name.getText(tree) === name);
  if (!declaration?.initializer) throw new Error(`Missing production initializer: ${name}`);
  return declaration.initializer.getText(tree);
}
function evaluate(name: string, values: Record<string, unknown>): any {
  return execute(`return (${initializer(name)});`, values);
}
const journalCall = nodes(tree, ts.isCallExpression).find(n => n.expression.getText(tree) === "trpc.ledger.t0GetJournal.useQuery")!;
function productionInput(previewUserId: number | null = null, viewerScopeUserId?: number) {
  return execute(`return (${journalCall.arguments[0].getText(tree)});`, { previewUserId, viewerScopeUserId });
}
function productionOptions(canAccess: boolean) {
  return execute(`return (${journalCall.arguments[1].getText(tree)});`, { canAccess, T0_JOURNAL_STALE_TIME_MS: 2_000 });
}
const conditionNode = nodes(mainTree, ts.isMethodDeclaration).find(n => n.name.getText(mainTree) === "condition")!;
const independent = execute(`return function(op) ${conditionNode.body!.getText(mainTree)};`, { isT0JournalRequest, isAdminWalletRequest }) as (op: { path: string }) => boolean;
const initialBranch = nodes(tree, ts.isIfStatement).find(n => n.expression.getText(tree) === "isJournalInitialLoad")!;
const renderInitial = execute(`return function() ${initialBranch.thenStatement.getText(tree)};`, {
  React, embedded: false, backToLedger: () => {}, ArrowLeft: () => React.createElement("svg"),
  isUserPreview: false, canUseMemberPreview: false, returnToAdminFromPreview: () => {},
  isPreviewSwitching: false, t0JournalQuery: { isError: false, isFetching: true },
}) as () => React.ReactNode;
function initialHtml(isError: boolean, isFetching: boolean, isPreviewSwitching = false, refetch = () => {}) {
  const render = execute(`return function() ${initialBranch.thenStatement.getText(tree)};`, {
    React, embedded: false, backToLedger: () => {}, ArrowLeft: () => React.createElement("svg"),
    isUserPreview: false, canUseMemberPreview: false, returnToAdminFromPreview: () => {}, isPreviewSwitching,
    t0JournalQuery: { isError, isFetching, refetch },
  });
  return { element: render(), html: renderToStaticMarkup(render()) };
}
function scopeState(rawJournalData: any, previewUserId: number | null = null, viewerScopeUserId?: number, canUseMemberPreview = true) {
  const values: Record<string, any> = { rawJournalData, previewUserId, viewerScopeUserId, canUseMemberPreview,
    queriedViewerMode: rawJournalData?.viewerMode, isUserPreview: previewUserId !== null,
    hasViewAsSessionScope: !!viewerScopeUserId };
  values.isViewAsSessionSwitching = evaluate("isViewAsSessionSwitching", values);
  values.isPreviewSwitching = evaluate("isPreviewSwitching", values);
  values.activeJournalData = evaluate("activeJournalData", values);
  values.journalViewScopeKey = evaluate("journalViewScopeKey", { ledgerId: 52, previewUserId, viewerScopeUserId });
  return values;
}
const adminResponse = { viewerMode: "admin", accounts: [], recentUsers: [], relatedFunds: [], entries: [] };
const memberResponse = (id: number) => ({ ...adminResponse, viewerMode: "member", viewerRelatedUserId: id });
function initialLoad(values: ReturnType<typeof scopeState>, hydratedJournalScopeKey: string | null) {
  return evaluate("isJournalInitialLoad", { ...values, hydratedJournalScopeKey });
}
function response(data: unknown) {
  return { result: { data: superjson.serialize(data) } };
}
function network() {
  const requests: Array<{ path: string; input: any; batch: boolean; method: string }> = [];
  let releaseSlow!: () => void;
  let slowStarted!: () => void;
  const started = new Promise<void>(resolve => { slowStarted = resolve; });
  const slow = new Promise<void>(resolve => { releaseSlow = resolve; });
  let revision = 1;
  const fetch: typeof globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    const batch = parsed.searchParams.get("batch") === "1";
    const paths = parsed.pathname.split("/").pop()!.split(",");
    const raw = JSON.parse(parsed.searchParams.get("input")!);
    const inputs = batch ? Object.values(raw) : [raw];
    const results = paths.map((path, index) => {
      const input = superjson.deserialize(inputs[index] as any) as any;
      requests.push({ path, input, batch, method: init?.method ?? "GET" });
      return response(path === "ledger.t0GetJournal"
        ? { ...(input.previewUserId || input.viewerScopeUserId ? memberResponse(input.previewUserId || input.viewerScopeUserId) : adminResponse), revision }
        : { ok: true });
    });
    if (paths.includes("ledger.slowStats")) { slowStarted(); await slow; }
    return new Response(JSON.stringify(batch ? results : results[0]), { headers: { "Content-Type": "application/json" } });
  };
  const client = createTRPCUntypedClient({ links: [splitLink({ condition: independent,
    true: httpLink({ url: "https://offline.test/api/trpc", transformer: superjson, fetch }),
    false: httpBatchLink({ url: "https://offline.test/api/trpc", transformer: superjson, fetch }),
  })] });
  return { client, requests, releaseSlow, started, nextRevision: () => { revision++; } };
}

describe("T0首屏journal独立传输", () => {
  it("执行main生产condition：journal独立且不扩大其他普通读取白名单", () => {
    expect(independent({ path: "ledger.t0GetJournal" })).toBe(true);
    expect(independent({ path: "ledger.getById" })).toBe(false);
    expect(independent({ path: "ledger.slowStats" })).toBe(false);
    expect(independent({ path: "ledger.t0CreateEntry" })).toBe(true);
    expect(independent({ path: "ledger.t0GetPayoutLogs" })).toBe(true);
    expect(main).toContain('true: httpLink({ url: trpcEndpoint, transformer: superjson, fetch: trpcFetch })');
    expect(main).toContain('false: httpBatchLink({ url: trpcEndpoint, transformer: superjson, fetch: trpcFetch })');
    expect(main).toContain("credentials: \"include\"");
    expect(main).toContain("headers.set('x-view-as-user-id', viewAsUserId)");
  });
  it("真实httpLink journal GET在同批统计仍阻塞时完成，输入和scope逐字不变", async () => {
    const net = network();
    const slow = net.client.query("ledger.slowStats", { ledgerId: 52 });
    let slowDone = false;
    void slow.then(() => { slowDone = true; });
    try {
      const result = await net.client.query("ledger.t0GetJournal", productionInput(101, 28));
      await net.started;
      expect(result).toMatchObject({ viewerMode: "member", viewerRelatedUserId: 101 });
      expect(slowDone).toBe(false);
      expect(net.requests.find(r => r.path === "ledger.t0GetJournal")).toEqual({
        path: "ledger.t0GetJournal", input: productionInput(101, 28), batch: false, method: "GET",
      });
      expect(net.requests.find(r => r.path === "ledger.slowStats")?.batch).toBe(true);
    } finally { net.releaseSlow(); await slow; }
  });
});

describe("T0首屏状态和真实空回包", () => {
  it.each([undefined, null])("未收到真实回包%s时不发布假空值", raw => {
    expect(initialLoad(scopeState(raw), null)).toBe(true);
    const html = renderToStaticMarkup(renderInitial());
    expect(html).toContain("正在加载订单");
    expect(html).not.toMatch(/暂无账户|暂无用户|暂无项目|0\.00|历史记录.*0/);
  });
  it("真实空订单回包完成投影后仍进入正常空界面，第一轮Effect前不能闪出0", () => {
    const empty = scopeState(adminResponse);
    expect(initialLoad(empty, null)).toBe(true);
    expect(initialLoad(empty, empty.journalViewScopeKey)).toBe(false);
    expect(empty.activeJournalData.entries).toEqual([]);
    expect(empty.activeJournalData).toBe(adminResponse);
  });
  it("首次错误展示可重试错误，重试中回到加载；不误报没有订单", () => {
    const failed = initialHtml(true, false);
    expect(failed.html).toContain("订单加载失败，请重试");
    expect(failed.html).toContain("不代表没有订单");
    expect(failed.html).toContain("重试加载");
    expect(failed.html).not.toMatch(/暂无账户|0\.00/);
    expect(initialHtml(true, true).html).toContain("正在加载订单");
    let retryOptions: unknown;
    const retry = initialHtml(true, false, false, (options?: any) => { retryOptions = options; });
    const findButton = (element: any): any => {
      if (!element || typeof element !== "object") return undefined;
      if (element.type === "button" && element.props.children === "重试加载") return element;
      return React.Children.toArray(element.props?.children).map(findButton).find(Boolean);
    };
    findButton(retry.element).props.onClick();
    expect(retryOptions).toEqual({ cancelRefetch: false });
  });
  it.each([{ isFetching: true, isError: false }, { isFetching: false, isError: true }])(
    "同key真实旧数据后台刷新/错误不白屏：%j", state => {
      const previous = scopeState({ ...adminResponse, entries: [{ id: "real-order" }] });
      expect(evaluate("isJournalInitialLoad", { ...previous, ...state, hydratedJournalScopeKey: previous.journalViewScopeKey })).toBe(false);
      expect(previous.activeJournalData.entries[0].id).toBe("real-order");
    });
  it("未有响应时同步Effect先退出，不清空选择/缓存；加载分支本身不触发重置", () => {
    const syncEffect = nodes(tree, ts.isCallExpression).find(n => n.expression.getText(tree) === "useEffect"
      && n.arguments[0]?.getText(tree).includes("setAccounts(nextAccounts)"))!;
    const callback = syncEffect.arguments[0] as ts.ArrowFunction;
    const statements = (callback.body as ts.Block).statements;
    expect(statements[0].getText(tree)).toBe("const journal = activeJournalData as any;");
    expect(statements[1].getText(tree)).toBe("if (!journal) return;");
    expect(callback.body.getText(tree)).toContain("setHydratedJournalScopeKey(journalViewScopeKey)");
    expect(initialBranch.getText(tree)).not.toMatch(/resetPreviewMemberDerivedView\(|setSelectedAccountIds\(|\.clear\(|\.remove\(/);
    expect(journalCall.getText(tree)).not.toMatch(/placeholderData|initialData|queryKey|retry\s*:/);
  });
});

describe("T0访问权限、scope和缓存隔离保持不变", () => {
  it.each([
    [52, true, false, "", false, false, true],
    [52, false, true, "", false, false, true],
    [52, false, false, "", false, false, false],
    [37, true, true, "", false, false, false],
    [52, true, false, "101", false, false, false],
    [52, true, false, "101", true, false, false],
    [52, true, false, "101", true, true, true],
  ])("账本%s成员%s系统管理员%s代入%s嵌入%s允许代入%s => %s", (ledgerId, hasLedgerMembership, isSuperAdmin, viewAsUserId, embedded, allowAdminViewAs, expected) => {
    const canAccess = evaluate("canAccess", { ledgerId, hasLedgerMembership, isSuperAdmin, viewAsUserId, embedded, allowAdminViewAs });
    expect(canAccess).toBe(expected);
    expect(productionOptions(canAccess).enabled).toBe(expected);
    expect(productionOptions(canAccess)).toMatchObject({ staleTime: 2_000, refetchOnWindowFocus: true });
  });
  it("预览/代入收到其他成员或管理员回包时不泄露，不放开编辑", () => {
    for (const state of [scopeState(adminResponse, 101), scopeState(memberResponse(102), 101),
      scopeState(memberResponse(102), null, 101, false), scopeState(memberResponse(101), null, undefined, true)]) {
      expect(state.activeJournalData).toBeUndefined();
      expect(initialLoad(state, state.journalViewScopeKey)).toBe(true);
      expect(evaluate("canManage", { ...state, canAccess: true })).toBe(false);
    }
    const correct = scopeState(memberResponse(101), 101);
    expect(initialLoad(correct, correct.journalViewScopeKey)).toBe(false);
    expect(evaluate("canManage", { ...correct, canAccess: true })).toBe(false);
  });
  it("tRPC真实query key按预览和代入用户隔离；同key刷新保留数据，禁用查询不发请求", async () => {
    const net = network();
    const proxy = createUseQueries<any>(net.client as any);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const queries = [productionInput(), productionInput(101), productionInput(102), productionInput(null, 101), productionInput(null, 102)]
      .map(input => proxy.ledger.t0GetJournal(input, productionOptions(true)));
    try {
      await Promise.all(queries.map(q => cache.fetchQuery(q)));
      expect(new Set(queries.map(q => JSON.stringify(q.queryKey))).size).toBe(5);
      expect(cache.getQueryData<any>(queries[1].queryKey!)?.viewerRelatedUserId).toBe(101);
      expect(cache.getQueryData<any>(queries[2].queryKey!)?.viewerRelatedUserId).toBe(102);
      net.nextRevision();
      const observer = new QueryObserver(cache, queries[1]);
      const before = observer.getCurrentResult().data;
      const refresh = observer.refetch({ cancelRefetch: false });
      expect(observer.getCurrentResult().data).toBe(before);
      await refresh;
      expect(observer.getCurrentResult().data).toMatchObject({ viewerRelatedUserId: 101, revision: 2 });
      expect(cache.getQueryData<any>(queries[2].queryKey!)?.revision).toBe(1);
      const requestCount = net.requests.length;
      const disabled = new QueryObserver(cache, proxy.ledger.t0GetJournal(productionInput(999), productionOptions(false)));
      const unsubscribe = disabled.subscribe(() => {});
      await Promise.resolve();
      expect(net.requests.length).toBe(requestCount);
      unsubscribe(); observer.destroy(); disabled.destroy();
    } finally { cache.clear(); }
  });
  it("生产router仍 protectedProcedure，scope不一致拒绝且预览仅允许管理员，未扩大账户范围", () => {
    const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const route = router.slice(router.indexOf("t0GetJournal: protectedProcedure"), router.indexOf("t0GetWeeklySettlementCenter: protectedProcedure"));
    expect(route).toContain("input.viewerScopeUserId !== Number(ctx.user.id)");
    expect(route).toContain("if (managerScope.mode !== 'admin')");
    expect(route).toContain("dbLedger.getUserMembership(52, input.previewUserId)");
    expect(route).toContain("relatedUserId: input.previewUserId");
    expect(route).toContain("relatedUserId: ctx.user.id");
  });
});
