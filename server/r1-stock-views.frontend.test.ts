import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as instruments from "../shared/portfolio-instruments";
import * as helpers from "../client/src/lib/r1StockPresentation";
import { isR1StockPresentationScope, type R1AiParticipationPortfolio } from "../shared/r1-stock-presentation";
import { buildStockMemberRealizedLots, hasStockCustomerActivity } from "../shared/stock-realized-portfolio";
import { summarizeStockCustomerPnl } from "../shared/stock-customer-pnl";

// Actual TSX function bodies, inert hooks only. No application backend, DB, HTTP or writes.
const source = readFileSync(new URL("../client/src/pages/StockTagPortfolio.tsx", import.meta.url), "utf8");
const aiSource = readFileSync(new URL("../client/src/components/R1AiParticipationView.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../client/src/components/Ledger37AiHome.tsx", import.meta.url), "utf8");
function actual(source: string, name: string, scope: Record<string, any> = {}) {
  const file = ts.createSourceFile("actual.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let code = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = node.getText(file).replace(/^export\s+(default\s+)?/, "");
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) code = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!code) throw new Error(`Actual frontend function missing: ${name}`);
  const js = ts.transpileModule(`const execute = ${code.replaceAll("import.meta.env.DEV", "false")};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
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
function hookState() {
  const state: any[] = []; let cursor = 0;
  return { reset: () => { cursor = 0; }, useState: (initial: any) => {
    const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
    return [state[i], (value: any) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
  } };
}
const props = { ledgerId: 37, categoryId: 90250, categoryName: "DO_NOT_RENDER_CATEGORY", onBack: vi.fn(), participantView: true };
const context = { ledgerId: 37 as const, categoryId: 90250, viewerUserId: 901, canManage: false, aiEnabled: false };
function tabs(ctx = context) {
  const hooks = hookState();
  const scope = { useState: hooks.useState, LegacyStockTagPortfolio: "legacy", Ledger37AiHome: "safe" };
  const component = actual(source, "R1StockPresentationTabs", scope);
  const render = () => { hooks.reset(); return component({ props, context: ctx }); };
  return { render, click: (label: string) => nodes(render()).find(n => n.props?.role === "tab" && text(n) === label).props.onClick() };
}
function wrapper(query: any, search = "", effectiveUserId = 901, authUserId = 909, storedViewAs: string | null = null) {
  const get = vi.fn(() => storedViewAs), set = vi.fn();
  const originalStorage = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: get, setItem: set } });
  const spy = vi.fn(() => ({ isFetchedAfterMount: true, ...query }));
  const scope: Record<string, any> = { useAuth: () => ({ user: { id: authUserId } }), useSearch: () => search, resolveR1EffectiveUserId: helpers.resolveR1EffectiveUserId,
    trpc: { ledger: { getLedger37PresentationContext: { useQuery: spy } } }, R1StockPresentationTabs: "tabs", LegacyStockTagPortfolio: "legacy", Ledger37AiStockParticipationView: "safe", isR1StockPresentationScope, ArrowLeft: "span", Loader2: "span" };
  scope.useLedger37PresentationContext = actual(homeSource, "useLedger37PresentationContext", scope);
  scope.Ledger37PresentationPending = actual(homeSource, "Ledger37PresentationPending", scope);
  const render = () => actual(source, "R1StockPresentation", scope)({ ...props, effectiveUserId });
  const finish = () => Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: originalStorage });
  return { render, spy, get, set, finish };
}
const row = (patch = {}): any => ({ id: 1, symbol: "AAPL", stockName: "苹果", currency: "USD", quantity: 6, allocatedQuantity: 10, allocationRatio: 0.1,
  startDate: "2026-11-01", status: "active", floatingPnl: -12, realizedPnl: 8, totalPnl: -4, ...patch });
const dto = (patch: Partial<R1AiParticipationPortfolio> = {}): R1AiParticipationPortfolio => ({ viewerUserId: 901, aiEnabled: true, usdCnyRate: 7, usdtCnyRate: null,
  updatedAt: "2026-11-18", summary: { floatingPnl: -84, realizedPnl: 56, totalPnl: -28 }, participations: [row()],
  recordedMargins: [{ assetCode: "USDT", amount: "100.123456789123456789" }], observation: null, ...patch });
function aiRenderer(data = dto(), rate?: number | null, updating = false) {
  const scope: Record<string, any> = { ...helpers, participationStatus: { pending: "待开始", active: "进行中", paused: "已暂停", closed: "已结束" } };
  scope.ParticipationSummary = actual(aiSource, "ParticipationSummary", scope);
  scope.ParticipationRows = actual(aiSource, "ParticipationRows", scope);
  return expand(actual(aiSource, "R1AiParticipationRenderer", scope)({ portfolio: data, displayUsdCnyRate: rate, updating }));
}
function legacy(participantView = false, presentationMode = "admin") {
  const hooks = hookState(); const calls: Record<string, any[]> = {};
  const publicData = { positions: [{ symbol: "AAPL", stockName: "苹果", currency: "USD", marketPrice: 12, lots: [{ id: 11, quantity: 100, unitCost: 10, openedAt: "2026-11-01T02:00:00Z" }] }], summary: { usdtCnyRate: null } };
  const memberData = { viewerUserId: 901, positions: [{ symbol: "AAPL", lots: [{ id: 11, lotId: 11, quantity: 6, entryPrice: 10 }] }], summary: {}, history: [],
    participations: [{ id: 1, lotId: 11, symbol: "AAPL", stockName: "苹果", startDate: "2026-11-01", openedAt: "2026-11-01", allocatedQuantity: 10,
      remainingQuantity: 6, closedQuantity: 4, closedValue: 32, entryPrice: 10, closedAt: "2026-11-10", realizedPnl: 8 }],
    closedLots: [{ participationId: 1, lotId: 11, symbol: "AAPL", stockName: "苹果", soldAt: "2026-11-10", soldQuantity: 4, unitCost: 10, sellPrice: 8, buyValue: 40, sellValue: 32, realizedPnl: 8 }] };
  const globalData = { ...publicData, canEdit: true, viewerUserId: 901, history: [], soldLots: [{ lotId: 11, sellEventId: 81, symbol: "AAPL", stockName: "苹果", soldQuantity: 4, unitCost: 10, sellPrice: 8, buyValue: 40, sellValue: 32, accountNetProfit: -8 }], realizedLots: [{ symbol: "AAPL", buyValue: 40, sellValue: 32, accountNetProfit: -8 }] };
  const matrix = { members: [{ userId: 901, name: "成员甲" }, { userId: 902, name: "成员乙" }], lots: [{ id: 11, symbol: "AAPL", participations: [
    { id: 1, userId: 901, remainingQuantity: 6, allocatedQuantity: 10, entryPrice: 10, floatingPnl: -12, realizedPnl: 8, closedQuantity: 4 },
    { id: 2, userId: 902, remainingQuantity: 20, allocatedQuantity: 20, entryPrice: 10, floatingPnl: -40, realizedPnl: 0 },
  ] }] };
  const scope: Record<string, any> = { ...instruments, instrumentCurrency: instruments.portfolioCurrency, useState: hooks.useState, useAuth: () => ({ user: { id: 901, name: "成员甲" } }),
    summarizeStockCustomerPnl, hasStockCustomerActivity, buildStockMemberRealizedLots, eventLabels: {}, eventTone: {}, trpc: { useUtils: () => ({}),
      stock: { getUsdCnyRate: { useQuery: () => ({ data: { success: true, rate: 7.2 } }) } }, ledger: {}, searchManualStocks: { useQuery: () => ({ data: { results: [] } }) } } };
  const dataMap: Record<string, any> = { getStockTagPortfolio: globalData, getStockTagPublicPortfolio: publicData, getMyStockTagParticipantPortfolio: memberData, getStockTagDailySnapshots: [], getStockLotParticipationMatrix: matrix };
  for (const [name, data] of Object.entries(dataMap)) scope.trpc.ledger[name] = { useQuery: (input: any, options: any) => { (calls[name] ??= []).push({ input, options }); return { data, isLoading: false, error: null }; } };
  for (const name of ["correctStockTagEvent", "updateStockTagLotNote"]) scope.trpc.ledger[name] = { useMutation: () => ({}) };
  for (const name of ["normalizeCurrency", "money", "signedMoney", "formatQuantity", "formatDateTime", "daysSinceBeijingDate", "formatMonthDay", "formatQuoteUpdate", "formatCompactQuoteUpdate", "localInputTime", "buildCryptoAwareMemberRealizedLots"]) scope[name] = actual(source, name, scope);
  for (const name of ["ArrowLeft", "BadgeCheck", "ChevronDown", "ChevronUp", "History", "Loader2", "Plus", "X", "Button", "Avatar", "AvatarImage", "AvatarFallback", "Input", "Label", "StockNameProfitSummary", "StockCustomerProfitSummary", "StockQuoteUpdateIndicator", "CryptoAwareObservationAccountSummary", "CryptoAwareObservationPortfolio", "StockParticipantProfitChart"]) scope[name] = "span";
  scope.StockTagBuyEditDialog = (p: any) => p.order && p.canEdit ? React.createElement("div", { "data-buy-edit-lot": p.order.lotId }) : null;
  for (const name of ["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "Sheet", "SheetContent", "SheetHeader", "SheetTitle", "StockTagTradeDialog"]) scope[name] = (p: any) => p.open ? React.createElement("div", null, p.children) : null;
  const component = actual(source, "LegacyStockTagPortfolio", scope);
  const render = () => { hooks.reset(); return expand(component({ ...props, participantView, presentationMode, effectiveUserId: 901 })); };
  const click = (label: string) => nodes(render()).find(n => n.type === "button" && (text(n) === label || n.props?.["aria-label"] === label)).props.onClick();
  return { render, click, calls, matrix };
}

describe("R1 展示升级：真实前端离线执行", () => {
  it("ledger37全股票global门控：改名保留R1，非37仍直接旧组件，无context调用", () => {
    const component = actual(source, "StockTagPortfolio", { isR1StockPresentationScope, LegacyStockTagPortfolio: "legacy", R1StockPresentation: "r1" });
    for (const [ledgerId, categoryId] of [[52, 90250], [59, 222]]) expect(component({ ...props, ledgerId, categoryId }).type).toBe("legacy");
    for (const categoryId of [90249, 222]) expect(component({ ...props, categoryId }).type).toBe("r1");
    expect(component({ ...props, categoryName: "已改名" }).type).toBe("r1");
  });
  it("实际管理员不受父 participantView 限制，三连tab默认管理员", () => {
    const h = tabs({ ...context, canManage: true }); const tree = h.render();
    expect(nodes(tree).filter(n => n.props?.role === "tab").map(text)).toEqual(["用户", "管理员", "AI"]);
    expect(nodes(tree).find(n => n.type === "legacy").props).toMatchObject({ participantView: false, presentationMode: "admin", effectiveUserId: 901 });
  });
  it.each([true, false])("普通/代看canManage=false无三tab，开关=%s决定默认，忽略原admin prop", aiEnabled => {
    const tree = tabs({ ...context, aiEnabled }).render();
    expect(nodes(tree).filter(n => n.props?.role === "tab")).toHaveLength(0);
    const child = nodes(tree).find(n => n.type === (aiEnabled ? "safe" : "legacy"));
    expect(child).toBeTruthy();
    if (!aiEnabled) expect(child.props.participantView).toBe(true);
  });
  it("切tab只改展示目标，用户完整复用原成员组件，AI预览自己，不写身份", () => {
    const h = tabs({ ...context, canManage: true });
    h.click("用户"); expect(nodes(h.render()).find(n => n.type === "legacy").props).toMatchObject({ participantView: true, effectiveUserId: 901 });
    const userKey = nodes(h.render()).find(n => n.key && String(n.key).endsWith(":user"))?.key;
    h.click("AI"); expect(nodes(h.render()).find(n => n.type === "safe").props).toMatchObject({ viewerUserId: 901, adminPreview: true });
    expect(nodes(h.render()).find(n => n.type === "safe").props.categoryId).toBeUndefined();
    expect(nodes(h.render()).some(n => n.type === "legacy")).toBe(false);
    expect(userKey).toBeTruthy(); expect(nodes(h.render()).some(n => n.key === userKey)).toBe(false);
    const tabsCode = source.slice(source.indexOf("function R1StockPresentationTabs"), source.indexOf("export function LegacyStockTagPortfolio"));
    expect(tabsCode).not.toMatch(/sessionStorage|setLocation|\.mutate|setItem/);
  });
  it.each([{ isFetching: true, isFetchedAfterMount: false, data: context }, { isLoading: true }, { error: new Error("failure") }, { data: { ...context, viewerUserId: 902 } }])("首次缓存未确认/未加载/失败/身份不符不挂原始或AI子页：%j", query => {
    const h = wrapper(query); try { const tree = expand(h.render()); expect(nodes(tree).some(n => ["tabs", "legacy", "safe"].includes(n.type))).toBe(false); expect(h.spy).toHaveBeenCalledOnce(); } finally { h.finish(); }
  });
  it('已确认配置在后台刷新时不卸载页面或重置页签', () => {
    const h = wrapper({ data: context, isFetching: true, isFetchedAfterMount: true });
    try { expect(h.render().type).toBe('tabs'); expect(text(h.render())).not.toContain('正在确认'); } finally { h.finish(); }
  });
  it("URL优先session，父effective再auth，globalcontext显式target且无category，禁placeholder复用", () => {
    const h = wrapper({ data: { ...context, viewerUserId: 903 } }, "?viewAs=903", 901, 909, "902");
    try { h.render(); expect(h.spy).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: 903 }, expect.objectContaining({ placeholderData: undefined })); expect(h.set).not.toHaveBeenCalled(); } finally { h.finish(); }
    expect(helpers.resolveR1EffectiveUserId("", "902", 901, 909)).toBe(902);
    expect(helpers.resolveR1EffectiveUserId("", null, 901, 909)).toBe(901);
    expect(helpers.resolveR1EffectiveUserId("", null, undefined, 909)).toBe(909);
  });
  it("目标切换 remount key隔离，旧response不能成为新user context", () => {
    const h = wrapper({ data: context }, "?viewAs=902"); try { expect(text(expand(h.render()))).toContain("正在确认"); } finally { h.finish(); }
    const one = wrapper({ data: context }); const two = wrapper({ data: { ...context, viewerUserId: 902 } }, "?viewAs=902");
    try { expect(one.render().key).not.toBe(two.render().key); } finally { one.finish(); two.finish(); }
  });
  it("safe API仅按当前target查询；AI没有任何rawpublic/member/global/matrix/observation hook", () => {
    const safe = vi.fn(() => ({ data: dto(), isFetching: false })), fx = vi.fn(() => ({ data: { success: true, rate: 7.2 } }));
    const scope = { isR1StockPresentationScope, trpc: { ledger: { getMyR1AiParticipationPortfolio: { useQuery: safe } }, stock: { getUsdCnyRate: { useQuery: fx } } }, R1AiParticipationRenderer: "renderer", ArrowLeft: "span", Loader2: "span" };
    const component = actual(aiSource, "R1AiParticipationView", scope);
    const output = component({ ledgerId: 37, categoryId: 90250, viewerUserId: 901, onBack: vi.fn() });
    expect(safe).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, viewAsUserId: 901 }, expect.objectContaining({ placeholderData: undefined }));
    expect(nodes(output).find(n => n.type === "renderer").props.displayUsdCnyRate).toBe(7.2);
    expect(aiSource).not.toMatch(/getStockTag(?:Public)?Portfolio|getMyStockTagParticipantPortfolio|getStockLotParticipationMatrix|getMyStockTagObservationPortfolio|StockTagTradeDialog|StockParticipantProfitChart|categoryName/);
  });
  it("真实AI DOM即使输入夹带敏感字段也不读取，保证金保持登记字符串，无价格/category/admin/trade泄漏", () => {
    const data = dto(); Object.assign(data, { categoryName: "SECRET_TAG", adminName: "SECRET_ADMIN", marketPrice: 987654321, costValue: 54321, history: [{ executionPrice: 888 }] });
    Object.assign(data.participations[0], { entryPrice: 7654321, marketPrice: 987654321, note: "SECRET_TRADE" });
    const html = renderToStaticMarkup(aiRenderer(data));
    expect(html).toContain("苹果"); expect(html).toContain("AAPL"); expect(html).toContain("100.123456789123456789");
    expect(html).not.toMatch(/SECRET|987654321|7654321|54321|买入价|当前价|股价|成交|管理员|做多|做空|博弈|交易者/);
    expect(html).toContain("不表示直接持有股票"); expect(html).toContain("不保证回报");
  });
  it("DTO人民币summary直接展示，记录金额未知不是0；更新中继续保留旧数", () => {
    const tree = aiRenderer(dto({ summary: { floatingPnl: 20, realizedPnl: 30, totalPnl: 50 }, recordedMargins: null }), undefined, true);
    expect(text(nodes(tree).find(n => n.props?.["aria-label"] === "参与收益汇总"))).toContain("+¥50.00");
    expect(text(nodes(tree).find(n => n.props?.["aria-label"] === "已登记保证金"))).toBe("已登记保证金—");
    expect(text(tree)).toContain("更新中，保留上次数据");
  });
  it("同一用户同一FX：真实旧inner总盈亏与AI native换汇一致，部分平仓不双算不翻转", () => {
    const h = legacy(true, "user"); const oldTree = h.render();
    expect(text(oldTree)).toContain("−¥28.80");
    const tree = aiRenderer(dto(), 7.2);
    const summary = nodes(tree).find(n => n.props?.["aria-label"] === "参与收益汇总");
    expect(text(summary)).toContain("−¥86.40"); expect(text(summary)).toContain("+¥57.60"); expect(text(summary)).toContain("−¥28.80");
    expect(helpers.r1SummaryAtDisplayFx(dto().participations, 7.2, null).totalPnl).toBeCloseTo(-28.8);
  });
  it.each([12, -12])("已分配收益正负方向原样，历史值只累计一次：%s", floatingPnl => {
    const rows = [row({ floatingPnl, realizedPnl: 8, totalPnl: floatingPnl + 8 })];
    const summary = helpers.r1SummaryAtDisplayFx(rows, 7.2, null);
    expect(summary.floatingPnl).toBeCloseTo(floatingPnl * 7.2); expect(summary.realizedPnl).toBeCloseTo(8 * 7.2); expect(summary.totalPnl).toBeCloseTo((floatingPnl + 8) * 7.2);
  });
  it("FXnull保留—，不假用0或USD代替USDT；观察折叠独立不混实际汇总", () => {
    const data = dto({ observation: { summary: { floatingPnl: 999, realizedPnl: 111, totalPnl: 1110 }, participations: [row({ id: 2 })] } });
    const tree = aiRenderer(data, null); const summary = nodes(tree).find(n => n.props?.["aria-label"] === "参与收益汇总");
    expect(text(summary)).not.toContain("¥0.00"); expect(text(summary)).toContain("—");
    expect(nodes(tree).find(n => n.type === "details").props.open).toBeUndefined(); expect(text(tree)).toContain("观察 · 不结算");
    expect(helpers.r1ParticipationToCny(2, "USDT", 7.2, null)).toBeNull();
  });
  it.each(['CNY', 'USD', 'USDT'] as const)('观察%s汇总与逐笔使用相同换汇，不把旧原币summary当人民币', currency => {
    const observations = [row({ id: 2, currency, floatingPnl: 10, realizedPnl: 2, totalPnl: 12 })];
    const data = dto({ usdtCnyRate: 6.8, observation: { summary: { floatingPnl: 999, realizedPnl: 888, totalPnl: 1887 }, participations: observations } });
    const tree = aiRenderer(data, data.usdCnyRate);
    const expected = helpers.r1SummaryAtDisplayFx(observations, data.usdCnyRate, data.usdtCnyRate);
    const observationText = text(nodes(tree).find(n => n.type === 'details'));
    expect(observationText).toContain(helpers.r1ParticipationMoney(expected.totalPnl));
    expect(observationText).not.toContain(helpers.r1ParticipationMoney(1887));
    expect(text(nodes(tree).find(n => n.props?.['aria-label'] === '参与收益汇总'))).toContain('−¥28.00');
  });
  it.each(['USD', 'USDT'] as const)('观察%s缺所需汇率时汇总与明细均未知，不冒充人民币原币收益', currency => {
    const data = dto({ usdCnyRate: null, usdtCnyRate: null, observation: { summary: { floatingPnl: 10, realizedPnl: 2, totalPnl: 12 }, participations: [row({ id: 2, currency, floatingPnl: 10, realizedPnl: 2, totalPnl: 12 })] } });
    const observationText = text(nodes(aiRenderer(data, null)).find(n => n.type === 'details'));
    expect(observationText).toContain('—'); expect(observationText).not.toContain('¥12.00'); expect(observationText).not.toContain('¥0.00');
  });
  it("管理员个人bits隐藏但全局账户金额/全部成员/本人普通member不删除", () => {
    const h = legacy(); const tree = h.render(); const output = text(tree);
    expect(output).toContain("账户总盈亏"); expect(output).toContain("+¥1,382.40");
    expect(output).not.toMatch(/我的持仓|我的当前持仓|我的已平仓|我的平仓|我的股数/);
    expect(h.calls.getMyStockTagParticipantPortfolio[0].options.enabled).toBe(false);
    h.click("展开持仓编号 01"); const expanded = text(h.render());
    expect(expanded).toContain("成员甲"); expect(expanded).toContain("成员乙"); expect(expanded).not.toContain("（我）"); expect(expanded).not.toContain("我的份额");
    h.click("用户视角"); expect(text(h.render())).toContain("成员甲"); expect(text(h.render())).toContain("成员乙");
    expect(h.matrix.members).toHaveLength(2);
    for (const name of ["getStockTagPortfolio", "getStockTagPublicPortfolio", "getMyStockTagParticipantPortfolio", "getStockTagDailySnapshots"]) {
      expect(h.calls[name][0].input).toMatchObject({ ledgerId: 37, categoryId: 90250, viewAsUserId: 901 });
      expect(h.calls[name][0].options.placeholderData).toBeUndefined();
    }
  });
  it("非R1旧混合视图的个人叠层仍保留，legacy query input无新身份字段", () => {
    const h = legacy(false, "legacy"); expect(text(h.render())).toContain("我的当前持仓"); expect(text(h.render())).toContain("我的已平仓");
    expect(h.calls.getStockTagPortfolio[0].input).toEqual({ ledgerId: 37, categoryId: 90250 });
  });
});
