import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as helpers from "../client/src/lib/r1StockPresentation";
import { isR1StockPresentationScope } from "../shared/r1-stock-presentation";
import type { Ledger37AiOverview, Ledger37PresentationContext } from "../shared/ledger37-ai-presentation";

// Execute actual AST-selected TSX functions with inert hooks. No backend imports, HTTP, DB or writes.
const homeSource = readFileSync(new URL("../client/src/components/Ledger37AiHome.tsx", import.meta.url), "utf8");
const holdingsSource = readFileSync(new URL("../client/src/components/Ledger37HoldingSources.tsx", import.meta.url), "utf8");
const stockSource = readFileSync(new URL("../client/src/pages/StockTagPortfolio.tsx", import.meta.url), "utf8");
const ledgerSource = readFileSync(new URL("../client/src/pages/LedgerDetail.tsx", import.meta.url), "utf8");
function actual(source: string, name: string, scope: Record<string, any> = {}) {
  const file = ts.createSourceFile("actual.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let code = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = node.getText(file).replace(/^export\s+(default\s+)?/, "");
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!code) throw new Error(`Actual frontend function missing: ${name}`);
  const js = ts.transpileModule(`const execute = ${code};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function("React", ...Object.keys(scope), `${js}; return execute;`)(React, ...Object.values(scope));
}
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
function expand(tree: any): any {
  if (Array.isArray(tree)) return tree.map((child, index) => { const expanded = expand(child); return React.isValidElement(expanded) ? React.cloneElement(expanded, { key: expanded.key ?? index }) : expanded; });
  if (!tree || typeof tree !== "object") return tree;
  if (typeof tree.type === "function") return expand(tree.type(tree.props));
  return React.cloneElement(tree, tree.props, expand(tree.props?.children));
}
function hooks() {
  const state: any[] = []; let cursor = 0;
  return { reset: () => { cursor = 0; }, useState: (initial: any) => {
    const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
    return [state[i], (value: any) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
  } };
}
const ctx = (patch: Partial<Ledger37PresentationContext> = {}): Ledger37PresentationContext => ({ ledgerId: 37, viewerUserId: 901, canManage: false, aiEnabled: true, ...patch });
const overview = (patch: Partial<Ledger37AiOverview> = {}): Ledger37AiOverview => ({ viewerUserId: 901, aiEnabled: true, projects: [
  { categoryId: 90250, displayName: "项目一", kind: "stock", summary: { floatingPnl: -84, realizedPnl: 56, totalPnl: -28 }, receivedDividends: 11, recordedMargins: [{ assetCode: "USDT", amount: "100.123456789123456789" }], startDate: "2026-11-01" },
  { categoryId: 777, displayName: "项目二", kind: "stock", summary: { floatingPnl: 1, realizedPnl: 2, totalPnl: 3 }, receivedDividends: null, recordedMargins: null, startDate: null },
  { categoryId: 888, displayName: "项目三", kind: "ordinary", summary: null, receivedDividends: null, recordedMargins: null, startDate: null },
], ...patch });
function presentation(query: any = { data: ctx(), isFetchedAfterMount: true }, search = "", stored: string | null = null, ledgerId = 37, effectiveUserId: number | undefined = 901, authUserId = 909) {
  const oldStorage = globalThis.sessionStorage;
  const set = vi.fn();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: () => stored, setItem: set } });
  const spy = vi.fn(() => query);
  const component = actual(homeSource, "useLedger37PresentationContext", { resolveR1EffectiveUserId: helpers.resolveR1EffectiveUserId, trpc: { ledger: { getLedger37PresentationContext: { useQuery: spy } } } });
  const render = () => component({ ledgerId, search, effectiveUserId, authUserId });
  const finish = () => Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: oldStorage });
  return { render, spy, set, finish, query };
}
const stockProps = { ledgerId: 37, categoryId: 90250, categoryName: "SECRET_TAG", onBack: vi.fn(), participantView: true, effectiveUserId: 901 };
function stock(p: any, props = stockProps) {
  return actual(stockSource, "R1StockPresentation", { useAuth: () => ({ user: { id: 909 } }), useSearch: () => "", useLedger37PresentationContext: () => p,
    isR1StockPresentationScope, LegacyStockTagPortfolio: "legacy", R1StockPresentationTabs: "tabs", Ledger37AiStockParticipationView: "safe", Ledger37PresentationPending: "pending" })(props);
}
function gate(p: any, ledgerId = 37) {
  return actual(homeSource, "Ledger37PresentationGate", { Ledger37PresentationPending: "pending", Ledger37AiHome: "home" })({ ledgerId, presentation: p, onBack: vi.fn(), children: React.createElement("raw", {}) });
}
function renderer(data = overview(), updating = false) {
  const scope: Record<string, any> = { ...helpers, ChevronRight: "span", Layers3: "span" };
  for (const name of ["ledger37AiMoneyTone", "ledger37AiProjectTone"]) scope[name] = actual(homeSource, name, scope);
  scope.Ledger37AiProjectCard = actual(homeSource, "Ledger37AiProjectCard", scope);
  return expand(actual(homeSource, "Ledger37AiHomeRenderer", scope)({ overview: data, updating, onOpenStock: vi.fn() }));
}
function home(query: any = { data: overview(), isFetching: false, isFetchedAfterMount: true }) {
  // Legacy renderer fixtures remain intact; actual default-home fixtures now carry source DTOs.
  query.data = { viewerUserId: query.data.viewerUserId, aiEnabled: query.data.aiEnabled, sources: [{ id: "r1", status: "available", holdings: [{}] }, { id: "berkshire", status: "available", holdings: [{}] }] };
  query.isFetchedAfterMount ??= true;
  const h = hooks(), spy = vi.fn(() => query);
  const component = actual(homeSource, "Ledger37AiHome", { useState: h.useState, trpc: { ledger: { getMyLedger37HoldingSources: { useQuery: spy } } }, ArrowLeft: "span", Loader2: "span", Ledger37AiIdentityHeader: "identity-header", Ledger37AiNetValueDisclosure: "net-value-disclosure", Ledger37HoldingSourcesRenderer: "renderer", ledger37HoldingSourceHasDetails: actual(holdingsSource, "ledger37HoldingSourceHasDetails"), Ledger37AiStockParticipationView: "safe" });
  return { query, spy, render: (viewerUserId = 901, adminPreview = false) => { h.reset(); return component({ viewerUserId, adminPreview, onBack: vi.fn() }); } };
}

// Execute actual parent query initializers selected from LedgerDetail's AST, rather than fabricated options.
function parentRawQueries(canReadRaw: boolean, ledgerId = 37) {
  const file = ts.createSourceFile("ledger.tsx", ledgerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statements: string[] = [];
  const calls: Record<string, any> = {};
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(file).endsWith(".useQuery")) {
      const path = node.expression.getText(file);
      const name = path.split(".").at(-2)!;
      if (["getById", "getMembers", "getTransactions", "getPendingApprovals", "listByLedger"].includes(name)) {
        statements.push(`${node.getText(file)};`);
        calls[name] = vi.fn(() => ({}));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  const js = ts.transpileModule(`function execute() { ${statements.join("\n")} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("trpc", "ledgerId", "filters", "canReadLedger37Raw", `${js}; execute();`)({ ledger: Object.fromEntries(Object.entries(calls).filter(([name]) => name !== "listByLedger").map(([name, useQuery]) => [name, { useQuery }])), lottery: { listByLedger: { useQuery: calls.listByLedger } } }, ledgerId, { ledgerId }, canReadRaw);
  return calls;
}

describe("账本37全局AI展示：实际前端离线执行", () => {
  it("首次进入全37无需selectedTagId，AI直接首页且不挂旧AA", () => {
    const h = presentation(); try {
      const result = gate(h.render());
      expect(result.type).toBe("home"); expect(result.props.viewerUserId).toBe(901);
      expect(nodes(result).some(node => node.type === "raw")).toBe(false);
      const file = ts.createSourceFile("ledger.tsx", ledgerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "LedgerDetail") as ts.FunctionDeclaration;
      const gateBranch = fn.body!.statements.find(node => ts.isIfStatement(node) && node.getText(file).includes("<Ledger37PresentationGate"))!;
      expect(gateBranch.getText(file)).not.toContain("selectedTagId");
      const customAA = fn.body!.statements.findIndex(node => ts.isVariableStatement(node) && node.getText(file).includes("const isCustomAA"));
      expect(fn.body!.statements.indexOf(gateBranch)).toBeLessThan(customAA);
    } finally { h.finish(); }
  });
  it.each([90250, 777, 999])("股票category=%s一律使用同一个无category的globalcontext，AI只挂safe", categoryId => {
    const h = presentation(); try {
      const p = h.render(); const result = stock(p, { ...stockProps, categoryId });
      expect(result.type).toBe("safe"); expect(result.props.categoryId).toBe(categoryId);
      expect(h.spy).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: 901 }, expect.objectContaining({ placeholderData: undefined }));
      expect(nodes(result).some(node => ["legacy", "tabs"].includes(node.type))).toBe(false);
    } finally { h.finish(); }
  });
  it("legacy标签AIflag不读不控制模式，唯一依据globalcontext", () => {
    const h = presentation({ data: { ...ctx({ aiEnabled: false }), __stockAiDisplay_category_90250: true }, isFetchedAfterMount: true });
    try { expect(stock(h.render()).type).toBe("tabs"); expect(h.render().knownSelfAIgate).toBe(false); } finally { h.finish(); }
    expect(homeSource).not.toMatch(/__stockAiDisplay|r1AiDisplayKey|getR1StockPresentationContext/);
    expect(stockSource.slice(stockSource.indexOf("export default function StockTagPortfolio"), stockSource.indexOf("export function LegacyStockTagPortfolio"))).not.toContain("getR1StockPresentationContext");
  });
  it("非37不走stockglobal门控，其他ledger父raw enabled原样不变", () => {
    const component = actual(stockSource, "StockTagPortfolio", { LegacyStockTagPortfolio: "legacy", R1StockPresentation: "global" });
    expect(component({ ...stockProps, ledgerId: 52 }).type).toBe("legacy");
    const h = presentation({}, "", null, 59); try {
      expect(h.render().canReadRaw).toBe(true);
      expect(h.spy.mock.calls[0][1].enabled).toBe(false);
      expect(nodes(gate(h.render(), 59)).some(node => node.type === "raw")).toBe(true);
    } finally { h.finish(); }
    expect(parentRawQueries(true, 59).getTransactions.mock.calls[0][1].enabled).toBe(true);
    expect(parentRawQueries(true, 52).getTransactions.mock.calls[0][1].enabled).toBe(false);
  });
  it.each([
    { data: ctx(), isFetchedAfterMount: false, isFetching: true },
    { isLoading: true },
    { data: ctx(), isFetchedAfterMount: true, error: new Error("denied") },
    { data: ctx({ viewerUserId: 902 }), isFetchedAfterMount: true },
  ])("首次缓存未确认/loading/error/身份不匹配不挂raw或安全子树，父raw也不请求", query => {
    const h = presentation(query); try {
      const p = h.render(); expect(p.context).toBeUndefined(); expect(p.canReadRaw).toBe(false);
      expect(gate(p).type).toBe("pending"); expect(stock(p).type).toBe("pending");
      const calls = parentRawQueries(p.canReadRaw);
      expect(calls.getTransactions.mock.calls[0][1].enabled).toBe(false);
      expect(calls.getPendingApprovals.mock.calls[0][1].enabled).toBe(false);
      expect(calls.listByLedger.mock.calls[0][1].enabled).toBe(false);
      expect(calls.getById.mock.calls[0]).toEqual([{ ledgerId: 37 }]);
      expect(calls.getMembers.mock.calls[0]).toEqual([{ ledgerId: 37 }]);
    } finally { h.finish(); }
  });
  it("已确认背景fetch保留既有树和key；背景error立即failclosed", () => {
    const query = { data: ctx({ aiEnabled: false }), isFetchedAfterMount: true, isFetching: false, error: null as Error | null };
    const h = presentation(query); try {
      const before = stock(h.render()); const gateBefore = gate(h.render());
      query.isFetching = true;
      expect(stock(h.render()).type).toBe(before.type); expect(stock(h.render()).key).toBe(before.key);
      expect(gate(h.render()).key).toBe(gateBefore.key); expect(h.render().canReadRaw).toBe(true);
      query.error = new Error("denied"); expect(stock(h.render()).type).toBe("pending"); expect(h.render().canReadRaw).toBe(false);
    } finally { h.finish(); }
  });
  it("身份与global on/off隔离key，URL/session/effective/auth优先，不写视角", () => {
    const query = { data: ctx(), isFetchedAfterMount: true };
    const h = presentation(query, "?viewAs=901", "902", 37, 903, 904); try {
      const first = stock(h.render()).key;
      expect(h.spy.mock.calls[0][0].viewAsUserId).toBe(901); expect(h.set).not.toHaveBeenCalled();
      query.data = ctx({ aiEnabled: false }); expect(stock(h.render()).key).not.toBe(first);
      expect(helpers.resolveR1EffectiveUserId("", "902", 903, 904)).toBe(902);
      expect(helpers.resolveR1EffectiveUserId("", null, 903, 904)).toBe(903);
      expect(helpers.resolveR1EffectiveUserId("", null, undefined, 904)).toBe(904);
    } finally { h.finish(); }
    const other = presentation({ data: ctx(), isFetchedAfterMount: true }, "?viewAs=902"); try { expect(stock(other.render()).type).toBe("pending"); } finally { other.finish(); }
    const confirmed = presentation({ data: ctx({ viewerUserId: 902 }), isFetchedAfterMount: true }, "?viewAs=902"); try { expect(stock(confirmed.render()).key).toContain(":902:"); } finally { confirmed.finish(); }
  });
  it("全局AI时父原始查询禁用，AI关闭/实际管理员可正常挂旧树", () => {
    const h = presentation(); try {
      expect(parentRawQueries(h.render().canReadRaw).getTransactions.mock.calls[0][1].enabled).toBe(false);
    } finally { h.finish(); }
    for (const context of [ctx({ aiEnabled: false }), ctx({ canManage: true })]) {
      const h = presentation({ data: context, isFetchedAfterMount: true }); try {
        expect(parentRawQueries(h.render().canReadRaw).getTransactions.mock.calls[0][1].enabled).toBe(true);
        expect(nodes(gate(h.render())).some(node => node.type === "raw")).toBe(true);
      } finally { h.finish(); }
    }
  });
  it("真实safehome DOM即使DTO夹带敏感字段也不泄漏价格/对手方/tagName/备注", () => {
    const data = overview();
    Object.assign(data, { marketPrice: 987654321, counterparty: "SECRET_PARTY", tagName: "SECRET_TAG", note: "SECRET_NOTE", raw: { executionPrice: 7654321 } });
    for (const project of data.projects) Object.assign(project, { marketPrice: 987654321, entryPrice: 7654321, counterparty: "SECRET_PARTY", tagName: "SECRET_TAG", originalNote: "SECRET_NOTE", history: [{ price: 54321 }] });
    const html = renderToStaticMarkup(renderer(data));
    expect(html).toContain("项目一"); expect(html).toContain("项目二"); expect(html).toContain("项目三");
    expect(html).toContain("100.123456789123456789"); expect(html).toContain("实收分配收益");
    expect(html).not.toMatch(/SECRET|987654321|7654321|54321|买入价|当前价|股价|成交价|对手方/);
    expect(html).toContain("不表示直接持有股票，不保证回报"); expect(html).toContain("普通项目仅展示安全概要，不表示参与股票");
  });
  it("人民币summary直接展示且不跨项目汇总，未知保持—，保证金不换汇", () => {
    const tree = renderer(); const cards = nodes(tree).filter(node => node.type === "article");
    expect(text(cards[0])).toContain("−¥28.00"); expect(text(cards[0])).toContain("+¥11.00");
    expect(text(cards[1])).toContain("+¥3.00"); expect(text(cards[1])).toContain("—");
    expect(text(cards[2])).not.toContain("¥0.00"); expect(text(cards[2])).toContain("开始日期 —");
    expect(text(tree)).not.toContain("−¥25.00"); expect(text(renderer(overview(), true))).toContain("更新中，保留上次数据");
    expect(homeSource).not.toMatch(/\.reduce\(|\.mutate\(|\.useMutation\(|\.save\(/);
  });
  it("ordinary项目没有raw详情链接/按钮，程序传入ordinary也不调用股票详情", () => {
    const tree = renderer(); const ordinary = nodes(tree).filter(node => node.type === "article")[2];
    expect(nodes(ordinary).some(node => ["a", "button"].includes(node.type))).toBe(false);
    const h = home(); const entry = nodes(h.render()).find(node => node.type === "renderer");
    entry.props.onOpen(888); expect(nodes(h.render()).some(node => node.type === "safe")).toBe(false);
    expect(nodes(h.render()).find(node => node.type === "renderer").props.selectedSourceId).toBeNull();
    entry.props.onOpen("berkshire"); expect(nodes(h.render()).find(node => node.type === "renderer").props.selectedSourceId).toBeNull();
    entry.props.onOpen("r1"); expect(nodes(h.render()).find(node => node.type === "renderer").props.selectedSourceId).toBe("r1");
    expect(nodes(h.render()).some(node => node.type === "safe")).toBe(false);
    nodes(h.render()).find(node => node.type === "identity-header").props.onBack(); expect(nodes(h.render()).find(node => node.type === "renderer").props.selectedSourceId).toBeNull();
    expect(homeSource).not.toMatch(/setLocation|window\.location|href=|getTransactions|getCategories|getTagSummary|getMyInitialBalances/);
  });
  it("safehome只查询安全来源当前viewer；身份错/AI关闭/错误不展示旧资料", () => {
    const h = home(); expect(nodes(h.render()).some(node => node.type === "renderer")).toBe(true);
    expect(h.spy).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: 901 }, expect.objectContaining({ placeholderData: undefined }));
    expect(nodes(h.render(902)).some(node => ["renderer", "safe"].includes(node.type))).toBe(false);
    h.query.data.aiEnabled = false; expect(nodes(h.render()).some(node => node.type === "renderer")).toBe(false);
    h.query.error = new Error("denied"); expect(text(h.render())).toContain("持仓来源暂不可用");
  });
  it("仅管理员context打开全37只读预览，实际aiEnabled=false不伪造或保存flag", () => {
    const data = overview({ aiEnabled: false }); const h = home({ data, isFetching: false });
    expect(nodes(h.render()).some(node => node.type === "renderer")).toBe(false);
    expect(nodes(h.render(901, true)).some(node => node.type === "renderer")).toBe(true);
    expect(data.aiEnabled).toBe(false);
    expect(nodes(h.render(902, true)).some(node => node.type === "renderer")).toBe(false);
    expect(stockSource).toContain("adminPreview={context.canManage}");
  });
  it("所有stock safe详情只执行安全API与旧FXquery，不执行任何raw hook", () => {
    const safeSpy = vi.fn(() => ({ data: { viewerUserId: 901, aiEnabled: true, usdCnyRate: 7, usdtCnyRate: null, updatedAt: null, summary: { floatingPnl: 1, realizedPnl: 2, totalPnl: 3 }, participations: [], recordedMargins: null, observation: null }, isFetching: true }));
    const fxSpy = vi.fn(() => ({ data: { success: true, rate: 7.2 } }));
    const trpc = { ledger: new Proxy({ getMyR1AiParticipationPortfolio: { useQuery: safeSpy } }, { get(target, property) { if (!(property in target)) throw new Error(`Forbidden raw hook: ${String(property)}`); return (target as any)[property]; } }), stock: { getUsdCnyRate: { useQuery: fxSpy } } };
    const component = actual(homeSource, "Ledger37AiStockParticipationView", { trpc, ArrowLeft: "span", Loader2: "span", Ledger37AiIdentityHeader: "identity-header", R1AiParticipationRenderer: "renderer" });
    const output = component({ ledgerId: 37, categoryId: 777, viewerUserId: 901, onBack: vi.fn() });
    expect(safeSpy).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 777, viewAsUserId: 901 }, expect.objectContaining({ enabled: true, placeholderData: undefined }));
    expect(nodes(output).find(node => node.type === "renderer").props).toMatchObject({ displayUsdCnyRate: 7.2, updating: true });
    expect(fxSpy).toHaveBeenCalledOnce();
  });
  it("安全股票DTO实际开关关闭普通身份不渲染，管理员只读预览仍可渲染", () => {
    const data = { viewerUserId: 901, aiEnabled: false };
    const component = actual(homeSource, "Ledger37AiStockParticipationView", { trpc: { ledger: { getMyR1AiParticipationPortfolio: { useQuery: () => ({ data }) } }, stock: { getUsdCnyRate: { useQuery: () => ({}) } } }, ArrowLeft: "span", Loader2: "span", Ledger37AiIdentityHeader: "identity-header", R1AiParticipationRenderer: "renderer" });
    const props = { ledgerId: 37, categoryId: 777, viewerUserId: 901, onBack: vi.fn() };
    expect(nodes(component(props)).some(node => node.type === "renderer")).toBe(false);
    expect(nodes(component({ ...props, adminPreview: true })).some(node => node.type === "renderer")).toBe(true);
    expect(nodes(component({ ...props, adminPreview: true, viewerUserId: 902 })).some(node => node.type === "renderer")).toBe(false);
    expect(data.aiEnabled).toBe(false);
  });
  it("实际管理员R1仍有用户/管理员/AI三tab，非R1保留原管理页和participant props", () => {
    const h = hooks(); const component = actual(stockSource, "R1StockPresentationTabs", { useState: h.useState, LegacyStockTagPortfolio: "legacy", Ledger37AiHome: "safe" });
    const render = () => { h.reset(); return component({ props: stockProps, context: ctx({ canManage: true }) }); };
    const tree = render(); expect(nodes(tree).filter(node => node.props?.role === "tab").map(text)).toEqual(["用户", "管理员", "AI"]);
    expect(nodes(tree).find(node => node.type === "legacy").props).toMatchObject({ participantView: false, presentationMode: "admin", effectiveUserId: 901 });
    nodes(tree).find(node => node.props?.role === "tab" && text(node) === "用户").props.onClick();
    expect(nodes(render()).find(node => node.type === "legacy").props.participantView).toBe(true);
    nodes(render()).find(node => node.props?.role === "tab" && text(node) === "AI").props.onClick();
    expect(nodes(render()).find(node => node.type === "safe").props).toMatchObject({ viewerUserId: 901, adminPreview: true });
    expect(nodes(render()).find(node => node.type === "safe").props.categoryId).toBeUndefined();
    const p = presentation({ data: ctx({ canManage: true }), isFetchedAfterMount: true }); try {
      expect(stock(p.render()).type).toBe("tabs");
      const nonR1 = stock(p.render(), { ...stockProps, categoryId: 777, participantView: false });
      expect(nonR1.type).toBe("legacy"); expect(nonR1.props.participantView).toBe(false); expect(nonR1.props.presentationMode).toBeUndefined();
      expect(nonR1.props).toMatchObject({ identityScoped: true, effectiveUserId: 901 });
    } finally { p.finish(); }
  });
});
