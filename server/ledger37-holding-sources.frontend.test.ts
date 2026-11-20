import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { Ledger37HoldingPosition, Ledger37HoldingSource, Ledger37HoldingSources } from "../shared/ledger37-ai-holdings";

const source = readFileSync(new URL("../client/src/components/Ledger37HoldingSources.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../client/src/components/Ledger37AiHome.tsx", import.meta.url), "utf8");
// Actual frontend declarations executed offline: no server imports, DB, network or browser.
function actual(code: string, names: string[], scope: Record<string, any> = {}) {
  const file = ts.createSourceFile("actual.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const body = file.statements.filter(node => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node) && !ts.isExportAssignment(node)).map(node => node.getText(file).replace(/^export\s+(default\s+)?/, "")).join("\n");
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  const safeIcons = Object.fromEntries(Object.entries(icons).filter(([name]) => name !== "default" && /^[A-Za-z_$][\w$]*$/.test(name)));
  const bindings = { React, useState: React.useState, ...safeIcons, ...scope };
  return new Function(...Object.keys(bindings), `${js}; return { ${names.join(",")} };`)(...Object.values(bindings));
}
const position = (patch: Partial<Ledger37HoldingPosition> = {}): Ledger37HoldingPosition => ({ symbol: "AAPL", stockName: "苹果", currency: "USD", shares: "12.123456789123456789", weightPct: 25, ...patch });
const item = (patch: Partial<Ledger37HoldingSource> = {}): Ledger37HoldingSource => ({ id: "berkshire", displayName: "巴菲特持仓", entityName: "Berkshire Hathaway", kind: "13f", status: "available", asOf: "2026-09-30", publishedAt: "2026-11-16", checkedAt: "2026-11-19T02:00:00Z", sourceUrl: "https://www.sec.gov/Archives/example", description: "公开申报主体说明", coverageNote: "仅对应披露范围，不是实时持仓。", holdings: [position()], ...patch });
const payload = (): Ledger37HoldingSources => ({ viewerUserId: 901, aiEnabled: true, sources: [item({ id: "ark", displayName: "木头姐持仓", entityName: "ARKK", kind: "etf" }), item({ id: "nvidia", displayName: "英伟达持仓" }), item(), item({ id: "pelosi", displayName: "佩洛西持仓", kind: "disclosure" }), item({ id: "r1", displayName: "R1 持仓", entityName: "R1", kind: "internal", holdings: [position()] })] });
function nodes(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : []; }
function text(tree: any): string { return Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree); }
function hooks() {
  const state: any[] = []; let cursor = 0;
  return { reset: () => { cursor = 0; }, useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value: any) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; } };
}
function home(query: any = { data: payload(), isFetchedAfterMount: true, isFetching: false }) {
  const h = hooks(), spy = vi.fn((_input: any, _options: any) => query), onBack = vi.fn();
  const rawGuard = new Proxy({ getMyLedger37HoldingSources: { useQuery: spy } }, { get(target, key) { if (!(key in target)) throw new Error(`Forbidden hook: ${String(key)}`); return (target as any)[key]; } });
  const component = actual(homeSource, ["Ledger37AiHome"], { useState: h.useState, trpc: { ledger: rawGuard }, Ledger37AiIdentityHeader: "identity-header", Ledger37HoldingSourcesRenderer: "sources", ledger37HoldingSourceHasDetails: actual(source, ["ledger37HoldingSourceHasDetails"]).ledger37HoldingSourceHasDetails }).Ledger37AiHome;
  return { spy, query, onBack, render: (viewerUserId = 901, adminPreview = false) => { h.reset(); return component({ viewerUserId, adminPreview, onBack }); } };
}
function list(data = payload()) { const component = actual(source, ["Ledger37HoldingSourceList"]).Ledger37HoldingSourceList; return renderToStaticMarkup(React.createElement(component, { data, onOpen: vi.fn() })); }
function detail(data = item()) { const component = actual(source, ["Ledger37HoldingSourceDetail"]).Ledger37HoldingSourceDetail; return renderToStaticMarkup(React.createElement(component, { source: data })); }

// Expand only the shared, hook-free row; preserve real detail hooks for interaction tests.
function compactRows(tree: any): any[] {
  return nodes(tree).filter(node => typeof node.type === "function" && node.type.name === "HoldingCompactRow").map(node => node.type(node.props));
}
function compactRowName(row: any): string {
  return nodes(row).find(node => typeof node.props?.title === "string")?.props.title;
}
function expectCompactRow(tree: any, row: Ledger37HoldingPosition, isDetail = false, showMarketValue = false) {
  const api = actual(source, ["ledger37HoldingSymbol", "ledger37HoldingWeightLabel", "ledger37DisclosedWeight"]);
  const name = row.stockName || api.ledger37HoldingSymbol(row);
  const weight = api.ledger37DisclosedWeight(row.weightPct), label = api.ledger37HoldingWeightLabel(row.weightPct);
  expect(tree.type).toBe("li");
  expect(tree.props["data-holding-compact"]).toBe("true");
  expect(tree.props["data-inline-holding-row"]).toBe(isDetail ? undefined : row.symbol);
  expect(tree.props["data-holding-row"]).toBe(isDetail ? "true" : undefined);
  for (const token of ["flex", "min-h-9", "min-w-0", "items-center", "gap-3", "py-2"]) expect(tree.props.className.split(/\s+/)).toContain(token);
  const children = React.Children.toArray(tree.props.children) as React.ReactElement<any>[];
  expect(children).toHaveLength(showMarketValue ? 4 : 3);
  expect(children[0].props.title).toBe(name); expect(text(children[0])).toBe(name);
  expect(children[0].props.className).toContain("truncate");
  expect(children[1].props["data-holding-bar"]).toBe(weight === null ? "neutral" : "disclosed");
  const fills = nodes(children[1]).filter(node => node.props?.style?.width !== undefined);
  if (weight === null) expect(fills).toHaveLength(0);
  else { expect(fills).toHaveLength(1); expect(fills[0].props.style.width).toBe(`${row.weightPct}%`); }
  expect(text(children[2])).toBe(label);
  if (showMarketValue) {
    expect(children[3].props["data-holding-market-value"]).toBe("true");
    expect(text(children[3])).toMatch(/^市值(?: |待更新$)/);
  } else expect(text(tree)).toBe(`${name}${label}`);
  expect(nodes(tree).some(node => ["img", "dl", "dt", "dd"].includes(node.type) || node.type?.name === "HoldingLogo")).toBe(false);
  expect(renderToStaticMarkup(tree)).not.toMatch(/披露股数|零权重已披露|证券标识|披露日期|资料截至|核验日期| · USD| · CNY/);
}

describe("37 AI首页真实持仓来源：离线前端安全回归", () => {
  it("默认首页只查来源API，不挂旧项目/选股池/原始或组合查询", () => {
    const h = home(); const tree = h.render();
    expect(nodes(tree).filter(node => node.type === "sources")).toHaveLength(1);
    const ast = ts.createSourceFile("home.tsx", homeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "Ledger37AiHome")!;
    expect(fn.getText(ast)).not.toMatch(/Ledger37AiHomeRenderer|Ledger37AiStockPool|getMyLedger37AiOverview|getMyR1AiParticipationPortfolio|getStockPortfolio|getUsdCnyRate|categoryId|projectName/);
    expect(h.spy).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: 901 }, expect.objectContaining({ enabled: true, placeholderData: undefined, retry: false, staleTime: 60000, refetchOnMount: "always", refetchInterval: 60000, refetchIntervalInBackground: false }));
    expect(homeSource).toContain("export function Ledger37AiStockParticipationView");
  });
  it.each([0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("非法viewer %s不查询或渲染数据", viewer => {
    const h = home(); expect(nodes(h.render(viewer)).some(node => node.type === "sources")).toBe(false);
    expect(h.spy.mock.calls[0][1].enabled).toBe(false);
  });
  it("初次缓存未确认、身份错、AI关闭、error均fail-closed，管理员预览不改flag", () => {
    const h = home({ data: payload(), isFetchedAfterMount: false });
    expect(nodes(h.render()).some(node => node.type === "sources")).toBe(false);
    h.query.isFetchedAfterMount = true;
    expect(nodes(h.render()).some(node => node.type === "sources")).toBe(true);
    expect(nodes(h.render(902)).some(node => node.type === "sources")).toBe(false);
    h.query.data.aiEnabled = false;
    expect(nodes(h.render()).some(node => node.type === "sources")).toBe(false);
    expect(nodes(h.render(901, true)).some(node => node.type === "sources")).toBe(true);
    expect(h.query.data.aiEnabled).toBe(false);
    expect(nodes(h.render(902, true)).some(node => node.type === "sources")).toBe(false);
    h.query.error = new Error("denied");
    expect(nodes(h.render(901, true)).some(node => node.type === "sources")).toBe(false);
  });
  it("刷新保留来源资料与key，详情头像菜单返回列表而非退出", () => {
    const h = home(); const first = nodes(h.render()).find(node => node.type === "sources");
    h.query.isFetching = true;
    expect(nodes(h.render()).find(node => node.type === "sources").key).toBe(first.key);
    const scrollTo = vi.fn(); vi.stubGlobal("window", { scrollTo });
    try {
      first.props.onOpen("bad"); expect(scrollTo).not.toHaveBeenCalled();
      first.props.onOpen("r1");
      expect(nodes(h.render()).find(node => node.type === "sources").props.selectedSourceId).toBe("r1");
      nodes(h.render()).find(node => node.type === "identity-header").props.onBack();
      expect(h.onBack).not.toHaveBeenCalled();
      expect(nodes(h.render()).find(node => node.type === "sources").props.selectedSourceId).toBeNull();
      nodes(h.render()).find(node => node.type === "identity-header").props.onBack(); expect(h.onBack).toHaveBeenCalledOnce();
      expect(scrollTo.mock.calls).toEqual([[0, 0], [0, 0]]);
    } finally { vi.unstubAllGlobals(); }
  });
  it("固定来源顺序R1第一，可进详情来源整行触达；没有股票不造零收益", () => {
    const data = payload(), snapshot = JSON.stringify(data);
    const component = actual(source, ["Ledger37HoldingSourceList"]).Ledger37HoldingSourceList;
    const tree = component({ data, onOpen: vi.fn() });
    expect(nodes(tree).filter(node => node.type === "article").map(article => text(nodes(article).find(node => node.type === "h3")))).toEqual(["R1 持仓", "巴菲特持仓", "佩洛西持仓", "木头姐持仓", "英伟达持仓"]);
    for (const button of nodes(tree).filter(node => node.type === "button")) { expect(button.props.className).toMatch(/min-h-\[(?:128|136)px\]/); expect(button.props.className).toContain("w-full"); }
    const html = list(data);
    expect(html).toContain("1 只已接入证券"); expect(html).not.toMatch(/年化|一年收益|收益率|¥0\.00|<canvas|<svg[^>]*recharts/);
    expect(html).toContain("2026-09-30"); expect(JSON.stringify(data)).toBe(snapshot);
  });
  it("环图只映射真实weightPct，未知不归一化、不以股数或Pnl替代", () => {
    const api = actual(source, ["ledger37HoldingRing"]);
    const rows = [position({ weightPct: 25 }), position({ symbol: "TSLA", weightPct: null, shares: "99999999" })];
    Object.assign(rows[1], { pnl: 99999, allocationRatio: 0.75 });
    const ring = api.ledger37HoldingRing(rows);
    expect(ring.background).toContain("0% 25%"); expect(ring.background).toContain("25% 100%");
    expect(ring.label).not.toContain("99999"); expect(ring.label).toContain("AAPL 25%");
    expect(api.ledger37HoldingRing([position({ weightPct: null })]).hasWeight).toBe(false);
    expect(api.ledger37HoldingRing([position({ weightPct: 0 })]).hasWeight).toBe(false);
    expect(api.ledger37HoldingRing([position({ weightPct: 80 }), position({ weightPct: 30 })]).hasWeight).toBe(false);
    for (const weightPct of [-1, Infinity, NaN, 101]) expect(api.ledger37HoldingRing([position({ weightPct })]).hasWeight).toBe(false);
  });
  it("真实权重降序未知末尾；筛选股票不改变原始数据", () => {
    const api = actual(source, ["ledger37OrderedHoldings"]);
    const rows = [position({ symbol: "UNKNOWN", weightPct: null }), position({ symbol: "ZERO", weightPct: 0 }), position({ symbol: "TSLA", stockName: "特斯拉", weightPct: 40 }), position({ weightPct: 25 })];
    const snapshot = JSON.stringify(rows);
    expect(api.ledger37OrderedHoldings(rows).map((row: any) => row.symbol)).toEqual(["TSLA", "AAPL", "ZERO", "UNKNOWN"]);
    expect(api.ledger37OrderedHoldings(rows, " 特斯拉 ").map((row: any) => row.symbol)).toEqual(["TSLA"]);
    expect(api.ledger37OrderedHoldings(rows, "aapl")).toHaveLength(1);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
  it("共享紧凑行默认内联、detail显式切换；原始百分比与未知中性条均不造零或归一化", () => {
    const compact = actual(source, ["HoldingCompactRow"]).HoldingCompactRow;
    for (const weightPct of [25, 12.123456789, 0.00001, 0, 100, null, -1, 101, NaN, Infinity]) {
      const row = Object.freeze(position({ stockName: "真实名称", weightPct })), snapshot = { ...row };
      const inline = compact({ row }); expectCompactRow(inline, row);
      const detailed = compact({ row, detail: true }); expectCompactRow(detailed, row, true);
      if (weightPct === null || !Number.isFinite(weightPct) || weightPct < 0 || weightPct > 100) {
        expect(text(inline)).toBe("真实名称未披露"); expect(renderToStaticMarkup(inline)).not.toContain("width:0%");
      }
      expect(row).toEqual(snapshot);
    }
  });
  it("外部内联与R1详情都复用同一HoldingCompactRow，R1全部24只不分页且头部环图日期保留", () => {
    const h = hooks(), api = actual(source, ["SourceInlineHoldings", "Ledger37HoldingSourceDetail", "HoldingCompactRow", "SourceRing"], { useState: h.useState });
    const rows = Array.from({ length: 24 }, (_, index) => Object.freeze(position({ symbol: `EXACT${index}`, stockName: `真实名称${index}`, weightPct: index === 23 ? null : index / 10 })));
    const data = item({ id: "r1", displayName: "R1 持仓", kind: "internal", holdings: rows, memberPortfolio: { holdings: rows, valuationAsOf: "2026-09-30", reportingCurrency: "USD" } }), snapshot = JSON.stringify(data);
    const inline = api.SourceInlineHoldings({ source: data }), detailed = api.Ledger37HoldingSourceDetail({ source: data });
    for (const [tree, isDetail] of [[inline, false], [detailed, true]] as const) {
      const components = nodes(tree).filter(node => node.type === api.HoldingCompactRow);
      expect(components).toHaveLength(rows.length);
      expect(components.map(node => node.props.row.symbol)).toEqual([...rows].reverse().slice(1).map(row => row.symbol).concat("EXACT23"));
      for (const component of components) expectCompactRow(component.type(component.props), component.props.row, isDetail);
      const html = renderToStaticMarkup(tree);
      expect((html.match(/data-holding-compact=/g) || [])).toHaveLength(rows.length);
      expect(html).not.toMatch(/显示更多|加载更多|下一页|分页|披露股数/);
    }
    expect(nodes(detailed).filter(node => node.type === api.SourceRing)).toHaveLength(1);
    expect(renderToStaticMarkup(detailed)).toContain("资料截至 2026-09-30");
    expect(renderToStaticMarkup(detailed)).not.toContain('aria-label="搜索股票名称或代码"');
    expect(renderToStaticMarkup(detailed)).toContain('aria-label="持股排序"');
    expect(JSON.stringify(data)).toBe(snapshot);
  });
  it("详情仅名字、比例与进度条，精度DTO不变，零与未知区分且不泄露股数和资金", () => {
    const data = item({ holdings: [position({ weightPct: 0, shares: "0" }), position({ symbol: "UNKNOWN", stockName: "未知比例证券", weightPct: null, shares: null }), position({ symbol: "LONG", stockName: "LongUnbrokenSecurityNameForSmallScreenLongUnbrokenSecurityName" })] });
    Object.assign(data, { categoryName: "SECRET_PROJECT", categoryId: 456112233, buyPrice: 88112233, trades: [{ price: 99887766 }] });
    Object.assign(data.holdings[0], { projectName: "SECRET_PERSONAL", currentPrice: 7654321 });
    const snapshot = JSON.stringify(data), h = hooks(), api = actual(source, ["Ledger37HoldingSourceDetail"], { useState: h.useState });
    const rows = compactRows(api.Ledger37HoldingSourceDetail({ source: data }));
    expect(rows).toHaveLength(data.holdings.length);
    for (const row of rows) expectCompactRow(row, data.holdings.find(holding => holding.stockName === compactRowName(row))!, true);
    const html = detail(data);
    expect(html).toContain("0%"); expect(html).toContain("未披露"); expect(html).not.toContain("零权重已披露"); expect(html).not.toContain("12.123456789123456789");
    expect(html).not.toMatch(/SECRET|456112233|88112233|7654321|99887766|买入价|卖出价|当前价|股价/);
    expect(html).toContain(`title="${data.holdings[2].stockName}"`);
    expect(html).toContain("max-w-[480px]"); expect(html).toContain("min-w-0"); expect(html).toContain("truncate");
    expect(html).not.toContain("<table"); expect(JSON.stringify(data)).toBe(snapshot);
  });
  it("三个真实页签切换；交易变动暂无接入，不由快照推断交易；来源外链安全", () => {
    const h = hooks(); const api = actual(source, ["Ledger37HoldingSourceDetail"], { useState: h.useState });
    const render = (data = item()) => { h.reset(); return api.Ledger37HoldingSourceDetail({ source: data }); };
    let tree = render();
    expect(nodes(tree).filter(node => node.props?.role === "tab").map(text)).toEqual(["持股列表", "交易变动", "简介"]);
    nodes(tree).find(node => node.props?.role === "tab" && text(node) === "交易变动").props.onClick();
    tree = render(); expect(text(tree)).toContain("暂无已接入交易数据"); expect(text(tree)).toContain("持仓快照不等于成交记录");
    const html = renderToStaticMarkup(tree); expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toMatch(/买入\s*\d|卖出\s*\d|收益率|一年收益/);
    nodes(tree).find(node => node.props?.role === "tab" && text(node) === "简介").props.onClick();
    tree = render(); expect(text(tree)).toContain("公开申报主体说明"); expect(text(tree)).toContain("2026-11-16");
    expect(renderToStaticMarkup(render(item({ sourceUrl: "javascript:alert(1)" })))).not.toContain("javascript:");
  });
  it("公开披露范围准确：13F滞后、ARKK特定基金、Pelosi家族不全面", () => {
    expect(detail(item())).toContain("13F 为滞后披露");
    expect(detail(item({ id: "ark", kind: "etf" }))).toContain("仅对应 ARKK 特定基金");
    expect(detail(item({ id: "pelosi", kind: "disclosure" }))).toContain("家族交易披露并非完整持仓清单");
    expect(source).not.toMatch(/牌照|保本|稳赚/);
  });
  it("肖像在简介署名且保留许可，英伟达图片不暗示个人持仓或背书", () => {
    const component = actual(source, ["PortraitCredit"]).PortraitCredit;
    for (const id of ["berkshire", "pelosi", "ark", "nvidia"] as const) {
      const html = renderToStaticMarkup(React.createElement(component, { source: item({ id }) }));
      expect(html).toContain("Wikimedia Commons"); expect(html).toContain("图片来源与许可");
      expect(html).toContain('rel="noopener noreferrer"'); expect(html).toContain("不代表产品背书");
      if (id === "ark") { expect(html).toContain("Caroline Wood"); expect(html).toContain("https://creativecommons.org/licenses/by-sa/4.0/"); }
      if (id === "nvidia") { expect(html).toContain("總統府"); expect(html).toContain("并非黄仁勋个人持仓"); expect(html).toContain("https://creativecommons.org/licenses/by/2.0/"); }
    }
  });
  it("固定本地来源头像地址，R1文本品牌，坏图片落入文字fallback", () => {
    const h = hooks(), api = actual(source, ["SourcePortrait"], { useState: h.useState });
    const render = () => { h.reset(); return api.SourcePortrait({ source: item() }); };
    const img = nodes(render()).find(node => node.type === "img");
    expect(img.props.src).toBe("/holdings/berkshire.jpg"); expect(img.props.className).toContain("object-center");
    img.props.onError(); expect(nodes(render()).some(node => node.type === "img")).toBe(false);
    expect(text(render())).toBe("巴");
    expect(list()).not.toContain("/holdings/r1.jpg"); expect(list()).toContain("R1</span>");
  });
  it("不可用资料不展示夹带旧持仓，也不把缺数据当零", () => {
    const html = detail(item({ status: "unavailable", holdings: [position({ stockName: "STALE_SECRET" })] }));
    expect(html).not.toContain("STALE_SECRET"); expect(html).toContain("未知不表示零持仓");
  });
  it("浮点合计100.00000000000001仅clamp末端，真实超额不归一化", () => {
    const api = actual(source, ["ledger37HoldingRing"]);
    const weights = [99.4, 0.4, 0.2];
    expect(weights.reduce((sum, value) => sum + value, 0)).toBe(100.00000000000001);
    const ring = api.ledger37HoldingRing(weights.map((weightPct, i) => position({ symbol: `REAL${i}`, weightPct })));
    expect(ring.hasWeight).toBe(true);
    expect(ring.background).toContain("0% 99.4%");
    expect(ring.background).toContain("99.80000000000001% 100%");
    expect(ring.background).not.toContain("100.00000000000001%");
    const abnormal = api.ledger37HoldingRing([position({ weightPct: 99.4 }), position({ weightPct: 0.6000000001 })]);
    expect(abnormal.hasWeight).toBe(false); expect(abnormal.label).toContain("合计异常");
  });
  it("卫星最多四个，只从available真实holdings按权重选择，去重而不修改原数据", () => {
    const api = actual(source, ["ledger37SourceHighlights", "SourceRing"]);
    const rows = [position({ symbol: "REAL1", weightPct: 5 }), position({ symbol: "REAL2", weightPct: 40 }), position({ symbol: "REAL3", weightPct: null }), position({ symbol: "REAL4", weightPct: 20 }), position({ symbol: "REAL5", weightPct: 10 }), position({ symbol: "REAL2", weightPct: 15 })];
    const data = item({ id: "nvidia", holdings: rows }), snapshot = JSON.stringify(data);
    expect(api.ledger37SourceHighlights(data).map((row: any) => row.symbol)).toEqual(["REAL2", "REAL4", "REAL5", "REAL1"]);
    const html = renderToStaticMarkup(React.createElement(api.SourceRing, { source: data }));
    expect((html.match(/data-holding-satellite=/g) || [])).toHaveLength(4);
    for (const code of ["REAL2", "REAL4", "REAL5", "REAL1"]) expect(html).toContain(`data-holding-satellite="${code}"`);
    expect(html).not.toMatch(/logo_apple|logo_tesla|data-holding-satellite="REAL3"/);
    expect(JSON.stringify(data)).toBe(snapshot);
    expect(api.ledger37SourceHighlights(item({ status: "unavailable", holdings: rows }))).toEqual([]);
    const unavailable = renderToStaticMarkup(React.createElement(api.SourceRing, { source: item({ status: "unavailable", holdings: rows }) }));
    expect(unavailable).not.toContain("REAL"); expect(unavailable).not.toContain("data-holding-satellite=");
  });
  it("没有权重保持中性轨道，真实ticker仅作名录；空或不可用来源无装饰股票", () => {
    const neutral = item({ id: "r1", kind: "internal", holdings: [position({ symbol: "CATALOG", weightPct: null, shares: null })] });
    const html = list({ ...payload(), sources: [neutral] });
    expect(html).toContain('data-holding-ring="neutral"'); expect(html).not.toContain('data-holding-satellite="CATALOG"');
    expect(html).toContain("比例待更新"); expect(html).not.toContain("比例未披露，仅股票名录"); expect(html).not.toContain("conic-gradient");
    expect(html).not.toContain("TOP HOLDINGS"); expect(html).not.toContain("25%");
    for (const data of [item({ holdings: [] }), item({ status: "unavailable", holdings: [position()] })]) {
      const empty = list({ ...payload(), sources: [data] });
      expect(empty).toContain("暂无已接入来源"); expect(empty).not.toContain("data-holding-ring="); expect(empty).not.toContain("data-holding-satellite=");
      expect(empty).not.toMatch(/logo_apple|logo_tesla|25%|conic-gradient/);
    }
  });
  it("准确displaySymbol、CUSIP与securityId仍可搜索，行仅名称title或真实代码fallback", () => {
    const data = item({ holdings: [Object.assign(position({ symbol: "037833100", stockName: "APPLE INC" }), { displaySymbol: "AAPL", securityId: "037833100" }), Object.assign(position({ symbol: "UNMAPPED_ID", stockName: "未映射证券", weightPct: null }), { securityId: "EXACT_SECURITY_ID" }), position({ symbol: "CODE_FALLBACK", stockName: "", weightPct: null }), Object.assign(position({ symbol: "EXACT_CUSIP", stockName: "" }), { displaySymbol: "MSFT" })] });
    const snapshot = JSON.stringify(data);
    const api = actual(source, ["ledger37OrderedHoldings"]);
    expect(api.ledger37OrderedHoldings(data.holdings, "aapl")).toHaveLength(1);
    expect(api.ledger37OrderedHoldings(data.holdings, "037833100")).toHaveLength(1);
    expect(api.ledger37OrderedHoldings(data.holdings, "EXACT_SECURITY_ID").map((row: any) => row.symbol)).toEqual(["UNMAPPED_ID"]);
    expect(api.ledger37OrderedHoldings(data.holdings, "EXACT_CUSIP").map((row: any) => row.symbol)).toEqual(["EXACT_CUSIP"]);
    const html = detail(data);
    for (const name of ["APPLE INC", "未映射证券", "CODE_FALLBACK", "MSFT"]) expect(html).toContain(`title="${name}"`);
    const compact = actual(source, ["HoldingCompactRow"]).HoldingCompactRow;
    for (const row of data.holdings) {
      const tree = compact({ row, detail: true }); expectCompactRow(tree, row, true);
      expect(renderToStaticMarkup(tree)).not.toMatch(/证券标识|EXACT_SECURITY_ID|037833100|UNMAPPED_ID|EXACT_CUSIP| · USD|logo_apple/);
    }
    expect(html).not.toMatch(/AAPL · USD|UNMAPPED_ID · USD|证券标识/); expect(JSON.stringify(data)).toBe(snapshot);
  });
  it("18位小数和180位长股数不进入DOM且DTO保持原文，不Number转换或推算比例", () => {
    const longShares = `123456789012345678.${"1234567890".repeat(18)}`;
    const data = item({ holdings: [position({ symbol: "PRECISE", shares: "12.123456789123456789", weightPct: null }), position({ symbol: "LONG", shares: longShares, weightPct: null })] }), snapshot = JSON.stringify(data);
    for (const html of [detail(data), list({ ...payload(), sources: [data] })]) {
      expect(html).not.toContain("12.123456789123456789"); expect(html).not.toContain(longShares); expect(html).not.toContain("披露股数");
      expect(html).not.toContain("conic-gradient"); expect(html).toContain('data-holding-bar="neutral"');
    }
    expect(JSON.stringify(data)).toBe(snapshot); expect(data.holdings[0].shares).toBe("12.123456789123456789"); expect(data.holdings[1].shares).toBe(longShares);
    expect(source).not.toMatch(/(?:Number|parseFloat|parseInt)\(\s*(?:row\.)?shares/);
  });
  it("真实权重、名称排序和搜索可交互，未知权重始终排在权重排序末尾", () => {
    const h = hooks(), api = actual(source, ["Ledger37HoldingSourceDetail"], { useState: h.useState });
    const ownRows = [position({ symbol: "ZZ", stockName: "Zebra", weightPct: 40 }), position({ symbol: "AA", stockName: "Alpha", weightPct: 10 }), position({ symbol: "UNK", stockName: "Unknown", weightPct: null })];
    const data = item({ id: "r1", kind: "internal", holdings: ownRows, memberPortfolio: { holdings: ownRows, valuationAsOf: null, reportingCurrency: null } }), snapshot = JSON.stringify(data);
    const render = () => { h.reset(); return api.Ledger37HoldingSourceDetail({ source: data }); };
    const symbols = (tree: any) => compactRows(tree).map(row => data.holdings.find(holding => holding.stockName === compactRowName(row))?.symbol);
    let tree = render(); expect(symbols(tree)).toEqual(["ZZ", "AA", "UNK"]);
    nodes(tree).find(node => node.type === "select").props.onChange({ target: { value: "weight-asc" } });
    tree = render(); expect(symbols(tree)).toEqual(["AA", "ZZ", "UNK"]);
    nodes(tree).find(node => node.type === "select").props.onChange({ target: { value: "name" } });
    tree = render(); expect(symbols(tree)).toEqual(["AA", "UNK", "ZZ"]);
    expect(nodes(tree).some(node => node.type === "input")).toBe(false);
    const external = item({ holdings: ownRows });
    const renderExternal = () => { h.reset(); return api.Ledger37HoldingSourceDetail({ source: external }); };
    tree = renderExternal();
    nodes(tree).find(node => node.type === "input").props.onChange({ target: { value: "zebra" } });
    tree = renderExternal(); expect(symbols(tree)).toEqual(["ZZ"]);
    nodes(tree).find(node => node.props?.["aria-label"] === "清空搜索").props.onClick();
    expect(symbols(renderExternal())).toEqual(["AA", "UNK", "ZZ"]);
    nodes(renderExternal()).find(node => node.type === "input").props.onChange({ target: { value: "AA" } });
    tree = renderExternal(); expect(symbols(tree)).toEqual(["AA"]);
    expect(renderToStaticMarkup(tree)).not.toContain("AA · USD"); expect(JSON.stringify(data)).toBe(snapshot);
  });
  it("320px移动结构：36px单行名字截断、有限轨道与触控搜索排序，不加行级精度字段或返回箭头", () => {
    const listComponent = actual(source, ["Ledger37HoldingSourceList"]).Ledger37HoldingSourceList;
    const tree = listComponent({ data: payload(), onOpen: vi.fn() });
    expect(tree.props.className).toContain("w-full"); expect(tree.props.className).toContain("min-w-0");
    expect(nodes(tree).find(node => node.type === "section").props.className).toContain("space-y-3");
    const orbit = actual(source, ["SourceRing"]).SourceRing({ source: item({ id: "nvidia", holdings: [position(), position({ symbol: "ONE" }), position({ symbol: "TWO" }), position({ symbol: "THREE" })] }) });
    expect(orbit.props.className).toContain("w-[124px]");
    const satellites = nodes(orbit).filter(node => node.props?.["data-holding-satellite"]);
    expect(satellites.map(node => node.props.className)).toEqual(["absolute z-10 left-0 top-0", "absolute z-10 right-0 top-0", "absolute z-10 right-0 bottom-0", "absolute z-10 left-0 bottom-0"]);
    const row = position({ shares: "9".repeat(180), stockName: "LongSecurityName".repeat(8) });
    const compact = actual(source, ["HoldingCompactRow"]).HoldingCompactRow;
    for (const detail of [false, true]) expectCompactRow(compact({ row, detail }), row, detail);
    const html = detail(item({ holdings: [row] }));
    expect(html).toContain(`title="${row.stockName}"`); expect(html).not.toContain(row.shares!);
    expect(html).toContain('aria-label="搜索股票名称或代码"'); expect(html).toContain('aria-label="持股排序"');
    expect(html).not.toMatch(/min-w-\[(?:3\d\d|4\d\d)px\]|<table|ArrowLeft|返回/);
    expect(source).not.toMatch(/ArrowLeft\s*[,}]|<canvas|recharts|客户参与项目/);
  });
  it("披露时点与真实比例条显式保留，非关键来源与license收拢到详情底部", () => {
    const html = detail(item({ holdings: [position({ weightPct: 12.123456789 }), position({ symbol: "UNKNOWN", weightPct: null })] }));
    expect(html).toContain("12.123456789%"); expect(html).toContain("width:12.123456789%");
    expect(html).toMatch(/>12\.12%<\/(?:p|span)>/);
    expect(html).toContain("披露日期"); expect(html).toContain("2026-11-16");
    expect(html).toContain("资料范围与披露说明"); expect(html).toContain("图片来源与许可");
    expect(html.indexOf("资料范围与披露说明")).toBeGreaterThan(html.indexOf("data-holding-row"));
    expect(html.indexOf("图片来源与许可")).toBeGreaterThan(html.indexOf("资料范围与披露说明"));
    expect(html).not.toMatch(/模拟|折线|市值|收益率/);
  });
  it("显示比例简洁且极小非零持仓不显示成零，原始比例没有被改写", () => {
    const api = actual(source, ["ledger37HoldingWeightLabel"]);
    expect(api.ledger37HoldingWeightLabel(12.123456789)).toBe("12.12%");
    expect(api.ledger37HoldingWeightLabel(10)).toBe("10%");
    expect(api.ledger37HoldingWeightLabel(100)).toBe("100%");
    expect(api.ledger37HoldingWeightLabel(0)).toBe("0%");
    expect(api.ledger37HoldingWeightLabel(0.00001)).toBe("<0.01%");
    expect(api.ledger37HoldingWeightLabel(null)).toBe("未披露");
    expect(api.ledger37HoldingWeightLabel(NaN)).toBe("未披露");
    expect(api.ledger37HoldingWeightLabel(101)).toBe("未披露");
  });
  it("真实图标加载前与失败后仍有证券代码，已加载时再显示原股票图标", () => {
    const h = hooks();
    const component = actual(source, ["HoldingLogo"], { useState: h.useState }).HoldingLogo;
    const render = () => { h.reset(); return component({ symbol: "AAPL.US", satellite: true }); };
    let tree = render();
    expect(text(tree)).toBe("AAPL");
    let image = nodes(tree).find(node => node.type === "img");
    expect(image.props.className).toContain("opacity-0");
    image.props.onLoad(); tree = render();
    expect(text(tree)).toBe("");
    image = nodes(tree).find(node => node.type === "img");
    expect(image.props.className).toContain("opacity-100");
    image.props.onError(); tree = render();
    expect(text(tree)).toBe("AAPL");
    expect(nodes(tree).some(node => node.type === "img")).toBe(false);
  });
  it("只显示已获取真实持仓的来源，不展示空卡或不可用来源夹带的旧记录，计数同步", () => {
    const data = payload();
    data.sources.find(row => row.id === "pelosi")!.status = "unavailable";
    data.sources.find(row => row.id === "ark")!.holdings = [];
    const snapshot = JSON.stringify(data), html = list(data);
    expect(html).toContain("R1 持仓"); expect(html).toContain("巴菲特持仓"); expect(html).toContain("英伟达持仓");
    expect(html).not.toContain("佩洛西"); expect(html).not.toContain("木头姐");
    expect(html).not.toContain("资料暂不可用"); expect(html).not.toContain("暂无股票记录");
    expect(html.match(/data-holding-source=/g)).toHaveLength(3); expect(JSON.stringify(data)).toBe(snapshot);
    data.sources.find(row => row.id === "pelosi")!.status = "available";
    expect(list(data)).toContain("佩洛西持仓"); expect(list(data).match(/data-holding-source=/g)).toHaveLength(4);
  });
  it("已选来源刷新后不可用或变空时回列表，不展示隐藏来源旧详情", () => {
    const api = actual(source, ["Ledger37HoldingSourcesRenderer", "Ledger37HoldingSourceDetail", "Ledger37HoldingSourceList"]);
    const data = payload(), onOpen = vi.fn();
    const render = () => api.Ledger37HoldingSourcesRenderer({ data, selectedSourceId: "r1", onOpen, updating: true });
    expect(nodes(render()).some(node => node.type === api.Ledger37HoldingSourceDetail)).toBe(true);
    const selected = data.sources.find(row => row.id === "r1")!;
    selected.status = "unavailable";
    expect(nodes(render()).some(node => node.type === api.Ledger37HoldingSourceDetail)).toBe(false);
    expect(nodes(render()).some(node => node.type === api.Ledger37HoldingSourceList)).toBe(true);
    selected.status = "available"; selected.holdings = [];
    expect(nodes(render()).some(node => node.type === api.Ledger37HoldingSourceDetail)).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });
  it.each(["berkshire", "nvidia"] as const)("%s 来源标题是不可点击的div，保留环图但无button、ChevronRight或详情入口", id => {
    const api = actual(source, ["Ledger37HoldingSourceList", "SourceRing"]), onOpen = vi.fn();
    const data = { ...payload(), sources: [item({ id, displayName: id === "berkshire" ? "巴菲特持仓" : "英伟达持仓" })] };
    const tree = api.Ledger37HoldingSourceList({ data, onOpen });
    const article = nodes(tree).find(node => node.type === "article");
    expect(article).toBeDefined();
    const header = React.Children.toArray(article.props.children)[0] as React.ReactElement<any>;
    expect(header.type).toBe("div"); expect(header.props.onClick).toBeUndefined();
    expect(nodes(article).some(node => node.type === "button" || node.props?.role === "button" || typeof node.props?.onClick === "function")).toBe(false);
    expect(nodes(article).some(node => node.type === icons.ChevronRight)).toBe(false);
    expect(nodes(article).filter(node => node.type === api.SourceRing)).toHaveLength(1);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('data-holding-ring="disclosed"');
    if (id === "berkshire") expect(html).not.toContain('data-holding-satellite="AAPL"');
    else expect(html).toContain('data-holding-satellite="AAPL"');
    expect(html).not.toMatch(/<button|lucide-chevron-right|查看[^<]*详情|role="button"/);
    expect(onOpen).not.toHaveBeenCalled();
  });
  it.each(["berkshire", "nvidia"] as const)("%s 在列表逐行输出全部紧凑股票，降序、零和未知准确且股数不显示不改写", id => {
    const longShares = `123456789012345678.${"1234567890".repeat(18)}`;
    const rows = [
      position({ symbol: "UNKNOWN", stockName: "未知比例证券", weightPct: null, shares: longShares }),
      ...Array.from({ length: 14 }, (_, index) => position({ symbol: `REAL${index + 1}`, stockName: `完整披露证券${index + 1}`, weightPct: (index + 1) / 2, shares: `${index + 1}.123456789123456789` })),
      position({ symbol: "ZERO", stockName: "已披露零持仓", weightPct: 0, shares: "0.000000000000000000" }),
      position({ symbol: "PRECISE", stockName: "高精度持仓", weightPct: 12.123456789, shares: "12.123456789123456789" }),
      position({ symbol: "TINY", stockName: "极小非零权重", weightPct: 0.00001 }),
      position({ symbol: "EMPTY", stockName: "股数比例均未披露", weightPct: null, shares: null }),
    ];
    rows[3].stockName = "LongUnbrokenStockName".repeat(8);
    const data = item({ id, displayName: id === "berkshire" ? "巴菲特持仓" : "英伟达持仓", holdings: rows });
    Object.assign(data, { categoryName: "SECRET_PROJECT", categoryId: 456112233, buyPrice: 88112233 });
    Object.assign(rows[0], { projectName: "SECRET_PERSONAL", currentPrice: 7654321, pnl: 99887766 });
    const snapshot = JSON.stringify(data), api = actual(source, ["SourceInlineHoldings"]);
    const tree = api.SourceInlineHoldings({ source: data });
    const ul = nodes(tree).find(node => node.type === "ul");
    expect(ul.props["aria-label"]).toBe(`${data.displayName}全部持仓`);
    const rowComponents = nodes(ul).filter(node => node.type?.name === "HoldingCompactRow");
    expect(rowComponents).toHaveLength(rows.length); expect(rowComponents.every(node => node.props.detail === undefined)).toBe(true);
    const renderedRows = compactRows(ul);
    expect(renderedRows).toHaveLength(rows.length);
    expect(renderedRows.map(node => node.props["data-inline-holding-row"])).toEqual(["PRECISE", ...Array.from({ length: 14 }, (_, index) => `REAL${14 - index}`), "TINY", "ZERO", "UNKNOWN", "EMPTY"]);
    for (const row of rows) {
      const renderedRow = renderedRows.find(node => node.props["data-inline-holding-row"] === row.symbol);
      expectCompactRow(renderedRow, row);
      expect(text(renderedRow)).not.toContain(row.symbol); expect(text(renderedRow)).not.toContain("披露股数");
      if (row.shares !== null) expect(renderToStaticMarkup(renderedRow)).not.toContain(row.shares);
      if (row.symbol.startsWith("REAL")) expect(text(renderedRow)).toContain(`${row.weightPct}%`);
    }
    const bySymbol = (symbol: string) => renderedRows.find(node => node.props["data-inline-holding-row"] === symbol);
    expect(text(bySymbol("PRECISE"))).toContain("12.12%");
    expect(text(bySymbol("TINY"))).toContain("<0.01%");
    expect(text(bySymbol("ZERO"))).toContain("0%"); expect(nodes(bySymbol("ZERO")).find(node => node.props?.["data-holding-bar"]).props["data-holding-bar"]).toBe("disclosed");
    for (const symbol of ["UNKNOWN", "EMPTY"]) {
      expect(text(bySymbol(symbol))).toContain("未披露"); expect(text(bySymbol(symbol))).not.toMatch(/\d+(?:\.\d+)?%/);
      const bar = nodes(bySymbol(symbol)).find(node => node.props?.["data-holding-bar"]);
      expect(bar.props["data-holding-bar"]).toBe("neutral"); expect(nodes(bar).some(node => node.props?.style?.width !== undefined)).toBe(false);
    }
    const html = list({ ...payload(), sources: [data] });
    expect((html.match(/data-inline-holding-row=/g) || [])).toHaveLength(rows.length);
    expect((html.match(/data-holding-compact=/g) || [])).toHaveLength(rows.length);
    for (const row of rows) expect(html).toContain(`data-inline-holding-row="${row.symbol}"`);
    for (const row of rows) if (row.shares !== null) expect(html).not.toContain(row.shares);
    expect(html).not.toContain("12.123456789123456789"); expect(html).not.toContain(longShares); expect(html).not.toContain("0.000000000000000000");
    expect(html).toContain(`title="${rows[3].stockName}"`); expect(html).toContain("width:12.123456789%"); expect(html).toContain("width:0.00001%");
    expect(html).toContain(`aria-label="${data.displayName}全部持仓"`);
    expect(html).not.toMatch(/SECRET|456112233|88112233|7654321|99887766|买入价|卖出价|当前价|股价|<table|披露股数| · USD|证券标识|显示更多|下一页/);
    expect(source).not.toMatch(/(?:Number|parseFloat|parseInt)\(\s*(?:row\.)?shares/);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
  it.each(["berkshire", "nvidia"] as const)("%s 不可用或空来源完全隐藏，不泄露旧内联股票、环图和许可", id => {
    const stale = position({ symbol: "STALE_SECRET", stockName: "旧记录不可泄露", shares: "99999999.123456789123456789" });
    for (const data of [item({ id, status: "unavailable", holdings: [stale] }), item({ id, holdings: [] })]) {
      const html = list({ ...payload(), sources: [data] });
      expect(html).toContain("暂无已接入来源"); expect(html).not.toContain("data-holding-source=");
      expect(html).not.toContain(`data-holding-source="${id}"`);
      expect(html).not.toMatch(/STALE_SECRET|旧记录不可泄露|99999999|data-inline-holding-row=|data-holding-ring=|data-holding-satellite=|图片来源与许可|Wikimedia Commons/);
    }
  });
  it.each(["berkshire", "nvidia"] as const)("%s 内联持仓下保留披露说明、来源安全外链与肖像许可", id => {
    const data = item({ id }), html = list({ ...payload(), sources: [data] });
    expect(html).toContain("资料来源与说明"); expect(html).toContain(data.coverageNote!);
    expect(html).toContain("不代表完整资产或实时持仓"); expect(html).toContain("图片来源与许可"); expect(html).toContain("Wikimedia Commons");
    expect(html).toContain("不代表产品背书"); expect(html).toContain("2026-09-30");
    expect(html).toContain(data.sourceUrl!); expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"');
    expect(html.indexOf("资料来源与说明")).toBeGreaterThan(html.lastIndexOf("data-inline-holding-row="));
    expect(html.indexOf("图片来源与许可")).toBeGreaterThan(html.indexOf("资料来源与说明"));
    expect(html).not.toContain(data.description!);
    if (id === "nvidia") { expect(html).toContain("并非黄仁勋个人持仓"); expect(html).toContain("總統府"); expect(html).toContain("https://creativecommons.org/licenses/by/2.0/"); }
    expect(list({ ...payload(), sources: [item({ id, sourceUrl: "javascript:alert(1)" })] })).not.toContain("javascript:");
  });
  it.each(["berkshire", "nvidia"] as const)("%s 旧selectedSourceId仍回列表，不挂详情或触发导航", id => {
    const api = actual(source, ["Ledger37HoldingSourcesRenderer", "Ledger37HoldingSourceDetail", "Ledger37HoldingSourceList"]), onOpen = vi.fn();
    const tree = api.Ledger37HoldingSourcesRenderer({ data: payload(), selectedSourceId: id, onOpen, updating: true });
    expect(nodes(tree).some(node => node.type === api.Ledger37HoldingSourceDetail)).toBe(false);
    expect(nodes(tree).filter(node => node.type === api.Ledger37HoldingSourceList)).toHaveLength(1);
    expect(text(tree)).toContain("后台更新中，保留当前来源资料"); expect(onOpen).not.toHaveBeenCalled();
  });
  it("R1 列表详情按钮仍执行onOpen，Renderer仍挂真实详情", () => {
    const api = actual(source, ["Ledger37HoldingSourceList", "Ledger37HoldingSourcesRenderer", "Ledger37HoldingSourceDetail"]), onOpen = vi.fn();
    const data = payload(), tree = api.Ledger37HoldingSourceList({ data, onOpen });
    const r1Article = nodes(tree).find(node => node.type === "article" && text(nodes(node).find(child => child.type === "h3")) === "R1 持仓");
    const button = nodes(r1Article).find(node => node.type === "button");
    expect(nodes(r1Article).some(node => node.type === icons.ChevronRight)).toBe(false);
    expect(renderToStaticMarkup(r1Article)).not.toContain("lucide-chevron-right");
    expect(button.props["aria-label"]).toBe("查看R1 持仓详情"); button.props.onClick();
    expect(onOpen).toHaveBeenCalledOnce(); expect(onOpen).toHaveBeenCalledWith("r1");
    const selected = api.Ledger37HoldingSourcesRenderer({ data, selectedSourceId: "r1", onOpen });
    const detailNode = nodes(selected).find(node => node.type === api.Ledger37HoldingSourceDetail);
    expect(detailNode.props.source).toBe(data.sources.find(row => row.id === "r1"));
    expect(renderToStaticMarkup(selected)).toContain('aria-label="R1 持仓详情"');
  });
  it("R1真实SSR使用96px干净比例环：无卫星、无虚线轨道，保留真实ring与头像", () => {
    const api = actual(source, ["SourceRing"]);
    const r1 = item({ id: "r1", displayName: "R1 持仓", entityName: "R1", kind: "internal", holdings: [position({ symbol: "AAPL", weightPct: 25 }), position({ symbol: "MSFT", weightPct: 15 })] });
    const tree = api.SourceRing({ source: r1 });
    const html = renderToStaticMarkup(tree);
    expect(tree.props["data-holding-orbit"]).toBe("true");
    expect(tree.props["data-holding-style"]).toBe("minimal");
    expect(tree.props.className).toContain("h-[96px]"); expect(tree.props.className).toContain("w-[96px]");
    expect(html).toContain('data-holding-ring="disclosed"');
    expect(html).toContain("conic-gradient"); expect(html).toContain("AAPL 25%");
    expect(html).toContain("R1"); expect(html).not.toContain("data-holding-satellite=");
    expect(html).not.toContain("border-dashed"); expect(html).not.toContain("h-[124px]");
  });
  it("R1列表卡片只保留名称、纯数字数量、日期及比例待更新，不泄露目录摘要且整卡仍一次打开", () => {
    const r1 = item({ id: "r1", displayName: "R1 持仓", entityName: "R1", kind: "internal", holdings: [position({ symbol: "CATALOG", stockName: "目录证券", weightPct: null })] });
    const data = { ...payload(), sources: [r1] }, onOpen = vi.fn();
    const api = actual(source, ["Ledger37HoldingSourceList"]);
    const tree = api.Ledger37HoldingSourceList({ data, onOpen });
    const card = nodes(tree).find(node => node.type === "article")!;
    const html = renderToStaticMarkup(card);
    expect(html).toContain("R1 持仓"); expect(html).toContain(">1<"); expect(html).toContain("资料截至 2026-09-30");
    expect(html).toContain("比例待更新");
    expect(html).not.toContain("内部股票目录"); expect(html).not.toContain(">R1 持仓</span>");
    expect(html).not.toContain("TOP HOLDINGS"); expect(html).not.toContain("目录证券"); expect(html).not.toContain("CATALOG");
    expect(nodes(card).some(node => node.type === icons.ChevronRight)).toBe(false);
    expect(nodes(card).some(node => typeof node.props?.onClick === "function")).toBe(true);
    const button = nodes(card).find(node => node.type === "button")!; button.props.onClick();
    expect(onOpen).toHaveBeenCalledOnce(); expect(onOpen).toHaveBeenCalledWith("r1");
  });
  it("R1名单与个人详情SSR均无四周卫星，持股估值日保留，交易变动20条分页且不显示成交日期", () => {
    const trades = Array.from({ length: 21 }, (_, index) => ({ symbol: `C${index}`, stockName: `历史${index}`, openedDate: "2026-01-01", closedDate: "2026-11-18" }));
    const rows = [position({ symbol: "OWN", stockName: "本人证券", weightPct: 12.123456789 })];
    const r1 = item({ id: "r1", displayName: "R1 持仓", entityName: "R1", kind: "internal", holdings: rows, memberPortfolio: { holdings: rows, valuationAsOf: "2026-09-30", reportingCurrency: "CNY", closedTrades: trades } });
    const api = actual(source, ["Ledger37HoldingSourceDetail", "HoldingPositionChangeList"]);
    const html = renderToStaticMarkup(React.createElement(api.Ledger37HoldingSourceDetail, { source: r1 }));
    expect(html).not.toContain("data-holding-satellite="); expect(html).not.toContain("h-[124px]");
    expect(html).toContain("本人证券"); expect(html).toContain("width:12.123456789%"); expect(html).toContain("12.12%");
    expect(html).toContain("资料截至 2026-09-30");
    const pagedHtml = renderToStaticMarkup(React.createElement(api.HoldingPositionChangeList, { trades }));
    expect((pagedHtml.match(/data-holding-position-change=/g) || [])).toHaveLength(20);
    expect(pagedHtml).toContain("减持"); expect(pagedHtml).not.toMatch(/2026-01-01|2026-11-18|新增 未记录|减少/); expect(pagedHtml).toContain("下一页");
    const h = hooks(), detailApi = actual(source, ["Ledger37HoldingSourceDetail"], { useState: h.useState });
    const render = () => { h.reset(); return detailApi.Ledger37HoldingSourceDetail({ source: r1 }); };
    let tree = render(); nodes(tree).find(node => node.props?.role === "tab" && text(node) === "交易变动").props.onClick();
    tree = render();
  });
  it("巴菲特来源SSR使用96px真实比例环：无外围徽章与虚线轨道，保留头像图片", () => {
    const api = actual(source, ["SourceRing"]);
    const berkshire = item({ id: "berkshire", holdings: [position({ symbol: "AAPL", weightPct: 25 }), position({ symbol: "MSFT", weightPct: 15 })] });
    const snapshot = JSON.stringify(berkshire), tree = api.SourceRing({ source: berkshire }), html = renderToStaticMarkup(tree);
    expect(tree.props.className).toContain("h-[96px]"); expect(tree.props.className).toContain("w-[96px]");
    expect(tree.props["data-holding-style"]).toBe("minimal");
    expect(html).toContain('data-holding-ring="disclosed"'); expect(html).toContain("conic-gradient");
    expect(html).toContain("AAPL 25%"); expect(html).toContain("MSFT 15%");
    expect(html).not.toContain("data-holding-satellite="); expect(html).not.toContain("border-dashed");
    expect(html).toContain('/holdings/berkshire.jpg'); expect(JSON.stringify(berkshire)).toBe(snapshot);
  });
  it("Nvidia外部来源SSR仍保持124px原卫星与真实data输入不变", () => {
    const api = actual(source, ["SourceRing"]);
    const external = item({ id: "nvidia", holdings: [position({ symbol: "AAPL", weightPct: 25 })] });
    const snapshot = JSON.stringify(external), tree = api.SourceRing({ source: external }), html = renderToStaticMarkup(tree);
    expect(tree.props.className).toContain("h-[124px]"); expect(tree.props.className).toContain("w-[124px]");
    expect(html).toContain('data-holding-satellite="AAPL"'); expect(html).toContain("border-dashed");
    expect(html).not.toContain('data-holding-style="minimal"'); expect(JSON.stringify(external)).toBe(snapshot);
  });
  it("客户份额市值formatter只接受合法对象与匹配估值日，保留大额字符串精度并区分零与未知", () => {
    const api = actual(source, ["ledger37HoldingMarketValueLabel"]);
    const exact = { amount: "123456789012345678901234567890.5", currency: "CNY", asOf: "2026-09-30" } as const;
    expect(api.ledger37HoldingMarketValueLabel(exact, "2026-09-30")).toBe("123,456,789,012,345,678,901,234,567,890.50 元");
    expect(api.ledger37HoldingMarketValueLabel({ amount: "0", currency: "USD", asOf: "2026-09-30" }, "2026-09-30")).toBe("0.00 美元");
    expect(api.ledger37HoldingMarketValueLabel({ amount: "12.5", currency: "USDT", asOf: "2026-09-30" }, "2026-09-30")).toBe("12.50 USDT");
    for (const value of [null, undefined, {}, { amount: "1", currency: "CNY" }, { amount: "1", currency: "EUR", asOf: "2026-09-30" }, { amount: "1", currency: "CNY", asOf: "2026-09-29" }, { amount: "1", currency: "CNY", asOf: null }, { amount: "1e6", currency: "CNY", asOf: "2026-09-30" }]) {
      expect(api.ledger37HoldingMarketValueLabel(value, "2026-09-30")).toBeNull();
    }
    expect(api.ledger37HoldingMarketValueLabel(exact, null)).toBeNull();
  });
  it("R1详情只读memberPortfolio客户份额：个人环与日期隔离，行仅显示百分比且不暴露个人或总组合金额", () => {
    const h = hooks(), api = actual(source, ["SourceInlineHoldings", "Ledger37HoldingSourceDetail", "HoldingCompactRow", "SourceRing"], { useState: h.useState });
    const sourceRows = [
      position({ symbol: "SOURCE_ONLY", stockName: "来源总组合证券", weightPct: 70, marketValue: { amount: "999999999999", currency: "CNY", asOf: "2026-09-30" } }),
      position({ symbol: "SHARED", stockName: "共享证券", weightPct: 30, marketValue: { amount: "888888888888", currency: "USD", asOf: "2026-09-30" } }),
    ];
    const memberRows = [
      position({ symbol: "SHARED", stockName: "共享证券", weightPct: 60, marketValue: { amount: "12345678901234567890.5", currency: "CNY", asOf: "2026-09-30" } }),
      position({ symbol: "MEMBER_ONLY", stockName: "客户专属证券", weightPct: 40, marketValue: { amount: "0", currency: "CNY", asOf: "2026-09-30" } }),
    ];
    const data = item({ id: "r1", displayName: "R1 持仓", entityName: "R1", kind: "internal", asOf: "2026-01-01", holdings: sourceRows, memberPortfolio: { holdings: memberRows, valuationAsOf: "2026-09-30", reportingCurrency: "CNY" } });
    const snapshot = JSON.stringify(data);
    const inline = api.SourceInlineHoldings({ source: data });
    const detailed = api.Ledger37HoldingSourceDetail({ source: data });
    const inlineHtml = renderToStaticMarkup(inline), detailHtml = renderToStaticMarkup(detailed);
    expect(inlineHtml).toContain("来源总组合证券"); expect(inlineHtml).toContain("共享证券");
    expect(inlineHtml).not.toContain("我的份额市值"); expect(inlineHtml).not.toContain("999,999,999,999"); expect(inlineHtml).not.toContain("888,888,888,888");
    expect(detailHtml).toContain("客户专属证券"); expect(detailHtml).not.toContain("来源总组合证券");
    expect(detailHtml).toContain("持股百分比"); expect(detailHtml).toContain("60%"); expect(detailHtml).toContain("40%");
    expect(detailHtml).not.toMatch(/市值|data-holding-market-value|12,345,678,901,234,567,890|12345678901234567890|0\.00 元/);
    expect(detailHtml).toContain("资料截至 2026-09-30");
    expect(detailHtml).not.toContain("资料截至 2026-01-01"); expect(detailHtml).not.toContain("999,999,999,999"); expect(detailHtml).not.toContain("888,888,888,888");
    const detailRows = compactRows(detailed);
    expect(detailRows.map(row => compactRowName(row))).toEqual(["共享证券", "客户专属证券"]);
    expect(detailRows.every(row => row.props["data-inline-holding-row"] === undefined)).toBe(true);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
  it.each([
    ["missing", undefined, "我的份额待更新"],
    ["empty", { holdings: [], valuationAsOf: "2026-09-30", reportingCurrency: "CNY" }, "暂无已分配持仓"],
  ] as const)("R1 memberPortfolio %s不回退来源持仓并显示明确空态", (_case, memberPortfolio, expected) => {
    const data = item({ id: "r1", displayName: "R1 持仓", entityName: "R1", kind: "internal", holdings: [position({ stockName: "来源秘密组合" })], ...(memberPortfolio ? { memberPortfolio: { ...memberPortfolio, holdings: [...memberPortfolio.holdings] } } : {}) });
    const html = detail(data);
    expect(html).toContain(expected); expect(html).not.toContain("来源秘密组合");
    expect(html).not.toContain("来源秘密组合");
    if (memberPortfolio) expect(html).toContain("资料截至 2026-09-30");
  });
  it("外部inline即使夹带marketValue也不显示市值，R1日期不匹配也不显示金额或市值占位", () => {
    const malicious = position({ stockName: "外部证券", marketValue: { amount: "777777777777", currency: "CNY", asOf: "2026-09-30" } });
    const external = item({ id: "berkshire", holdings: [malicious] });
    const inlineApi = actual(source, ["SourceInlineHoldings"]);
    expect(renderToStaticMarkup(inlineApi.SourceInlineHoldings({ source: external }))).not.toContain("777,777,777,777");
    const stale = item({ id: "r1", holdings: [position({ stockName: "过期估值", marketValue: { amount: "0", currency: "CNY", asOf: "2026-09-29" } })], memberPortfolio: { holdings: [position({ stockName: "过期估值", marketValue: { amount: "0", currency: "CNY", asOf: "2026-09-29" } })], valuationAsOf: "2026-09-30", reportingCurrency: "CNY" } });
    const html = detail(stale);
    expect(html).not.toMatch(/市值|data-holding-market-value|0\.00 元/);
  });
  it("个人报告币种错配与未知不得展示假金额，个人说明不沿用R1总组合日期", () => {
    const own = position({ weightPct: null, marketValue: { amount: "123.45", currency: "USDT", asOf: "2026-09-30" } });
    const data = item({ id: "r1", asOf: "2026-01-01", checkedAt: "2026-01-02", publishedAt: "2026-01-03", coverageNote: "SOURCE_WIDE_DENOMINATOR", memberPortfolio: { holdings: [own], valuationAsOf: "2026-09-30", reportingCurrency: "CNY" } });
    const html = detail(data);
    expect(html).not.toMatch(/市值|data-holding-market-value|123\.45 USDT/);
    expect(html).not.toMatch(/SOURCE_WIDE_DENOMINATOR|2026-01-01|2026-01-02|2026-01-03/);
    expect(html).toContain("个人持仓构成"); expect(html).toContain("并非该日期的历史持仓快照");
    const api = actual(source, ["ledger37HoldingMarketValueLabel"]);
    expect(api.ledger37HoldingMarketValueLabel(own.marketValue, "2026-09-30", null)).toBeNull();
    expect(api.ledger37HoldingMarketValueLabel(own.marketValue, "2026-09-30", "CNY")).toBeNull();
    expect(api.ledger37HoldingMarketValueLabel(own.marketValue, "2026-09-30", "USDT")).toBe("123.45 USDT");
  });
  it("首页onOpen直接拒绝巴菲特、英伟达及不可用或空来源，不滚动不改选择，R1仍可打开", () => {
    const data = payload();
    data.sources.find(row => row.id === "pelosi")!.status = "unavailable";
    data.sources.find(row => row.id === "ark")!.holdings = [];
    const h = home({ data, isFetchedAfterMount: true, isFetching: false }), scrollTo = vi.fn();
    vi.stubGlobal("window", { scrollTo });
    try {
      const getRenderer = () => nodes(h.render()).find(node => node.type === "sources");
      for (const id of ["berkshire", "nvidia", "pelosi", "ark", "bad"]) {
        getRenderer().props.onOpen(id); expect(getRenderer().props.selectedSourceId).toBeNull();
      }
      expect(scrollTo).not.toHaveBeenCalled();
      getRenderer().props.onOpen("r1"); expect(getRenderer().props.selectedSourceId).toBe("r1");
      expect(scrollTo.mock.calls).toEqual([[0, 0]]);
      for (const id of ["berkshire", "nvidia", "pelosi", "ark"]) getRenderer().props.onOpen(id);
      expect(getRenderer().props.selectedSourceId).toBe("r1"); expect(scrollTo.mock.calls).toEqual([[0, 0]]);
      expect(h.onBack).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it.each(["unavailable", "empty"])("首页onOpen拒绝%s的R1，不进入隐藏来源详情", state => {
    const data = payload(), r1 = data.sources.find(row => row.id === "r1")!;
    if (state === "unavailable") r1.status = "unavailable"; else r1.holdings = [];
    const h = home({ data, isFetchedAfterMount: true, isFetching: false }), scrollTo = vi.fn();
    vi.stubGlobal("window", { scrollTo });
    try {
      nodes(h.render()).find(node => node.type === "sources").props.onOpen("r1");
      expect(nodes(h.render()).find(node => node.type === "sources").props.selectedSourceId).toBeNull();
      expect(scrollTo).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});


describe("持仓来源首页浅蓝青绿配色：纯展示契约", () => {
  function expectHomeTheme(html: string) {
    expect(html).toContain('data-holding-theme="home"');
    for (const token of ["bg-[#F2F6FA]", "bg-[#FFFFFF]", "text-[#142A3F]", "text-[#61758A]", "border-[#DCE7F0]", "text-[#087987]"]) expect(html).toContain(token);
    expect(html).not.toMatch(/data-holding-theme="terminal"|#0B0E11|#171C23|#1D242E|#202833|#303B49|#2B333E|#252D38|#354050|#594028|#F0F3F7|#A0AABB|#8F9BAD|#DDE5EF|#FF9F43|#12342D|#5BC9A0|\b(?:bg-black|text-white)\b/);
  }
  it("列表与R1详情同用首页浅蓝画布、白卡和青绿强调，不残留黑底浅字，保留真实比例环", () => {
    for (const html of [list(), detail(item({ id: "r1", displayName: "R1持股", memberPortfolio: { holdings: [position()], valuationAsOf: null, reportingCurrency: null } }))]) {
      expectHomeTheme(html);
      expect(html).toContain("divide-[#EAF2F7]");
      expect(html).toContain("bg-[#EAF2F7]");
      expect(html).toContain("bg-[#087987]");
      expect(html).toContain('data-holding-ring="disclosed"');
    }
    const listTree = actual(source, ["Ledger37HoldingSourceList"]).Ledger37HoldingSourceList({ data: payload(), onOpen: vi.fn() });
    expect(nodes(listTree).some(node => node.type === "header")).toBe(false);
    expect(renderToStaticMarkup(listTree)).not.toMatch(/HOLDINGS WATCH|持股观察|个独立来源|从原始披露，观察每一个持股主体/);
    expect(nodes(listTree).find(node => node.type === "article").props["data-holding-source"]).toBe("r1");
    const r1Card = nodes(listTree).find(node => node.type === "article" && node.props["data-holding-source"] === "r1");
    expect(r1Card.props.className).toContain("border-[#DCE7F0]");
  });
  it("配色不改变披露权重、原始股数、过滤与外部无详情行为", () => {
    const data = payload(), before = JSON.stringify(data), html = list(data);
    expect(JSON.stringify(data)).toBe(before);
    expect(html).toContain("25%");
    for (const id of ["berkshire", "nvidia"] as const) {
      const sourceRow = data.sources.find(row => row.id === id)!;
      for (const row of sourceRow.holdings) {
        expect(html).toContain(`data-inline-holding-row="${row.symbol}"`);
        if (row.shares !== null) expect(html).not.toContain(row.shares);
      }
      expect(html).not.toContain(`查看${sourceRow.displayName}详情`);
    }
  });
  it.each([null, "r1"] as const)("真实Renderer选择%s时实际挂载浅蓝列表或个人详情，状态提示和金额隔离不变", selectedSourceId => {
    const data = payload(), personal = data.sources.find(row => row.id === "r1")!;
    personal.memberPortfolio = { holdings: [position({ stockName: "本人浅蓝证券", weightPct: 12.123456789, marketValue: { amount: "12345678901234567890.5", currency: "CNY", asOf: "2026-11-19" } })], valuationAsOf: "2026-11-19", reportingCurrency: "CNY" };
    const snapshot = JSON.stringify(data), onOpen = vi.fn(), api = actual(source, ["Ledger37HoldingSourcesRenderer"]);
    for (const updating of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(api.Ledger37HoldingSourcesRenderer, { data, selectedSourceId, onOpen, updating }));
      expectHomeTheme(html);
      expect(html).toContain('role="status"'); expect(html).toContain('aria-live="polite"');
      expect(html).toContain(updating ? "后台更新中，保留当前来源资料" : "持仓来源资料已确认");
      expect(html).toContain(selectedSourceId === "r1" ? 'aria-label="R1 持仓详情"' : 'aria-label="持仓来源列表"');
      if (selectedSourceId === "r1") { expect(html).toContain("本人浅蓝证券"); expect(html).toContain("width:12.123456789%"); expect(html).toContain("12.12%"); }
      expect(html).not.toMatch(/市值|data-holding-market-value|12345678901234567890|12,345,678,901,234,567,890|12\.123456789123456789/);
    }
    expect(onOpen).not.toHaveBeenCalled(); expect(JSON.stringify(data)).toBe(snapshot);
  });
  it.each(["r1", "ark"] as const)("%s详情三个真实页签均保留浅蓝画布、白卡青绿选中态及深色正文，无黑底浅字", id => {
    const data = item({ id, displayName: id === "r1" ? "R1持股" : "木头姐持仓", kind: id === "r1" ? "internal" : "etf", memberPortfolio: id === "r1" ? { holdings: [position({ stockName: "本人证券", weightPct: 12.123456789 })], valuationAsOf: "2026-11-19", reportingCurrency: "CNY", closedTrades: [{ symbol: "ENDED", stockName: "真实仓位变动", openedDate: "2026-01-01", closedDate: "2026-11-18" }] } : undefined });
    const snapshot = JSON.stringify(data), h = hooks(), api = actual(source, ["Ledger37HoldingSourceDetail"], { useState: h.useState });
    const render = () => { h.reset(); return api.Ledger37HoldingSourceDetail({ source: data }); };
    for (const label of ["持股列表", "交易变动", "简介"]) {
      const before = render(); nodes(before).find(node => node.props?.role === "tab" && text(node) === label).props.onClick();
      const tree = render(), html = renderToStaticMarkup(tree); expectHomeTheme(html);
      const tabs = nodes(tree).filter(node => node.props?.role === "tab");
      expect(tabs.filter(tab => tab.props["aria-selected"]).map(text)).toEqual([label]);
      for (const tab of tabs) {
        expect(tab.props.className).toContain(tab.props["aria-selected"] ? "border-[#087987] text-[#087987]" : "border-transparent text-[#61758A]");
        expect(tab.props.className).toContain("focus-visible:ring-[#087987]");
      }
      const panel = nodes(tree).find(node => node.props?.role === "tabpanel"), panelHtml = renderToStaticMarkup(panel);
      expect(panelHtml).toContain("bg-[#FFFFFF]"); expect(panelHtml).toContain("border-[#DCE7F0]");
      expect(panelHtml).toContain(label === "持股列表" || label === "交易变动" && id === "r1" ? "text-[#142A3F]" : "text-[#142A3F]"); expect(panelHtml).toContain("text-[#61758A]");
      if (label === "持股列表") { expect(panelHtml).toContain('data-holding-row="true"'); expect(panelHtml).toContain(id === "r1" ? "width:12.123456789%" : "width:25%"); }
      if (label === "交易变动") {
        if (id === "r1") { expect(panelHtml).toContain("减持"); expect(panelHtml).not.toMatch(/2026-01-01|2026-11-18|未记录|减少/); expect(panelHtml).toContain('data-holding-position-change="decrease"'); expect(panelHtml).not.toMatch(/开仓 |平仓 |已平仓记录/); }
        else { expect(panelHtml).toContain("暂无已接入交易数据"); expect(panelHtml).toContain("持仓快照不等于成交记录"); }
      }
      if (label === "简介") {
        if (id === "r1") { expect(panelHtml).toContain("快速整理海量财报与行情数据"); expect(panelHtml).toContain("配合回测工具批量验证策略"); expect(panelHtml).toContain("回测结果不代表未来收益"); }
        else expect(panelHtml).toContain(data.description!);
      }
      if (id === "r1") expect(html).not.toMatch(/搜索股票名称或代码|type="search"/);
      expect(html).not.toMatch(/市值|data-holding-market-value|12\.123456789123456789/);
    }
    expect(JSON.stringify(data)).toBe(snapshot);
  });
  it("真实紧凑行以深色名字、浅蓝轨道和青绿进度显示原始百分比，未知仍为次要色而非假零", () => {
    const compact = actual(source, ["HoldingCompactRow"]).HoldingCompactRow;
    for (const weightPct of [12.123456789, 0.00001, 0, null]) {
      const row = position({ stockName: "真实证券", weightPct });
      for (const isDetail of [false, true]) {
        const tree = compact({ row, detail: isDetail }); expectCompactRow(tree, row, isDetail);
        const children = React.Children.toArray(tree.props.children) as React.ReactElement<any>[];
        expect(children[0].props.className).toContain("text-[#142A3F]");
        expect(children[1].props.className).toContain("bg-[#EAF2F7]");
        expect(children[2].props.className).toContain(weightPct === null ? "text-[#61758A]" : "text-[#142A3F]");
        const fills = nodes(children[1]).filter(node => node.props?.style?.width !== undefined);
        for (const fill of fills) expect(fill.props.className).toContain("bg-[#087987]");
        if (weightPct === null) { expect(fills).toHaveLength(0); expect(text(children[2])).toBe("未披露"); }
        expect(renderToStaticMarkup(tree)).not.toMatch(/#303B49|#FF9F43|#F0F3F7|#DDE5EF|#8F9BAD|市值|披露股数/);
      }
    }
  });
  it("未知权重与空来源在浅蓝空态保留浅蓝中性环，无推算比例或不可用旧持仓泄漏", () => {
    const api = actual(source, ["ledger37HoldingRing"]), ring = api.ledger37HoldingRing([position({ weightPct: null })]);
    expect(ring.background).toBe("#EAF2F7"); expect(ring.hasWeight).toBe(false);
    const disclosed = api.ledger37HoldingRing([position({ weightPct: 12.123456789 })]);
    expect(disclosed.background).toContain("#087987 0% 12.123456789%"); expect(disclosed.background).toContain("#EAF2F7 12.123456789% 100%");
    const redGold = api.ledger37HoldingRing([position({ weightPct: 25 }), position({ symbol: "MSFT", weightPct: 10 })]);
    expect(redGold.background).toContain("#087987 0% 25%"); expect(redGold.background).toContain("#459CAF 25% 35%"); expect(redGold.background).toContain("#EAF2F7 35% 100%");
    const unknownHtml = list({ ...payload(), sources: [item({ holdings: [position({ weightPct: null })] })] });
    expectHomeTheme(unknownHtml); expect(unknownHtml).toContain('data-holding-ring="neutral"'); expect(unknownHtml).toContain("未披露"); expect(unknownHtml).not.toContain("conic-gradient");
    const emptyHtml = list({ ...payload(), sources: [item({ status: "unavailable", holdings: [position({ stockName: "STALE_THEME_SECRET" })] })] });
    expect(emptyHtml).toContain('data-holding-theme="home"'); expect(emptyHtml).toContain("bg-[#F2F6FA]"); expect(emptyHtml).toContain("bg-[#FFFFFF]"); expect(emptyHtml).toContain("text-[#61758A]");
    expect(emptyHtml).toContain("暂无已接入来源"); expect(emptyHtml).not.toMatch(/STALE_THEME_SECRET|data-holding-ring=|data-inline-holding-row=|#0B0E11|#171C23/);
  });
  it("比例环浅蓝青绿各分区可区分，首个主色对白底保持至少3比1，不改真实比例", () => {
    const api = actual(source, ["RING_COLORS", "ledger37HoldingRing"]);
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    expect(api.RING_COLORS).toEqual(["#087987", "#459CAF", "#73AFC0", "#86BED1", "#ADCEDC", "#729BAC", "#A5B9CA", "#D2E3EC"]);
    expect(api.RING_COLORS).not.toContain("#8F1425"); expect(api.RING_COLORS).not.toContain("#C08A14");
    expect(contrast(api.RING_COLORS[0], "#FFFFFF")).toBeGreaterThanOrEqual(3);
    const rows = [position({ weightPct: 25 }), position({ symbol: "MSFT", weightPct: 10 })], before = JSON.stringify(rows);
    const ring = api.ledger37HoldingRing(rows);
    expect(ring.background).toContain("#087987 0% 25%"); expect(ring.background).toContain("#459CAF 25% 35%");
    expect(ring.background).toContain("#EAF2F7 35% 100%"); expect(JSON.stringify(rows)).toBe(before);
  });
});


describe("R1客户持仓简化与真实仓位变动", () => {
  const ownSource = (patch: Partial<Ledger37HoldingSource> = {}) => item({ id: "r1", displayName: "R1持股", entityName: "R1", kind: "internal", holdings: [position()], memberPortfolio: { holdings: [position()], valuationAsOf: "2026-11-19", reportingCurrency: "CNY", closedTrades: [] }, ...patch });
  it("数量仅显示数字，客户不出现已披露或已接入证券数量文案、搜索框和市值，仅保留持股百分比", () => {
    const data = ownSource(), snapshot = JSON.stringify(data);
    const api = actual(source, ["sourceStatusLabel"]);
    expect(api.sourceStatusLabel(data)).toBe("1");
    const html = detail(data);
    expect(html).not.toMatch(/1 只已接入证券|已接入证券 ·|已披露权重 ↓|搜索股票名称或代码|type="search"/);
    expect(html).toContain("持仓比例 ↓"); expect(html).toContain("环图按持股百分比绘制");
    expect(html).not.toMatch(/市值|data-holding-market-value/); expect(JSON.stringify(data)).toBe(snapshot);
  });
  it.each(["2026-02-29", "2026-13-01", "2026-11-31", "2026-11-19T00:00:00Z", "", null, undefined])("不真实日期%s不能变成今天或有效交易日期", value => {
    const api = actual(source, ["ledger37HoldingTradeDate"]);
    expect(api.ledger37HoldingTradeDate(value)).toBeNull();
  });
  it("交易日期按真实日历保留，不转时区或改日期", () => {
    const api = actual(source, ["ledger37HoldingTradeDate"]);
    for (const date of ["2024-02-29", "2026-11-19", "2026-01-01"]) expect(api.ledger37HoldingTradeDate(date)).toBe(date);
  });
  it("兼容旧个人卖出缓存并按真实顺序展示减持，不显示日期价格或其他人字段", () => {
    const h = hooks(), api = actual(source, ["HoldingPositionChangeList"], { useState: h.useState });
    const trades = [{ symbol: "OLD", stockName: "先平仓股票", openedDate: "2026-01-02", closedDate: "2026-04-01", buyPrice: "SECRET_PRICE", projectName: "SECRET_PROJECT" }, { symbol: "NEW", stockName: "最近平仓股票", openedDate: "2026-02-03", closedDate: "2026-11-18", userName: "SECRET_OTHER_USER" }, { symbol: "UNKNOWN", stockName: "日期待核对", openedDate: null, closedDate: "invalid" }];
    const snapshot = JSON.stringify(trades); h.reset(); const tree = api.HoldingPositionChangeList({ trades });
    const rows = nodes(tree).filter(node => node.props?.["data-holding-position-change"] === "decrease");
    expect(rows.map(row => nodes(row).find(node => typeof node.props?.title === "string")?.props.title)).toEqual(["最近平仓股票", "先平仓股票", "日期待核对"]);
    const html = renderToStaticMarkup(tree);
    expect(html.match(/data-holding-position-change="decrease"/g)).toHaveLength(3); expect(html).toContain("减持"); expect(html).not.toMatch(/2026-02-03|2026-11-18|2026-04-01|未记录|减少/);
    expect(html).not.toMatch(/开仓 |平仓 |已平仓记录|aria-label="已平仓交易"/);
    expect(html).not.toMatch(/SECRET|买入价|卖出价|当前价|市值|invalid/); expect(JSON.stringify(trades)).toBe(snapshot);
  });
  it("交易变动20条分页，多次平仓不去重丢失；缩短后页码有效", () => {
    const h = hooks(), api = actual(source, ["HoldingPositionChangeList"], { useState: h.useState });
    const trades = Array.from({ length: 24 }, (_, index) => ({ symbol: "SAME", stockName: `同票分笔${index}`, openedDate: "2026-01-01", closedDate: "2026-11-18" }));
    const render = (rows = trades) => { h.reset(); return api.HoldingPositionChangeList({ trades: rows }); };
    let tree = render(); expect(nodes(tree).filter(node => node.props?.["data-holding-position-change"])).toHaveLength(20);
    expect(nodes(tree).find(node => node.type === "button" && text(node) === "上一页").props.disabled).toBe(true);
    nodes(tree).find(node => node.type === "button" && text(node) === "下一页").props.onClick();
    tree = render(); expect(nodes(tree).filter(node => node.props?.["data-holding-position-change"])).toHaveLength(4); expect(text(tree)).toContain("2 / 2");
    tree = render(trades.slice(0, 1)); expect(nodes(tree).filter(node => node.props?.["data-holding-position-change"])).toHaveLength(1); expect(nodes(tree).some(node => node.type === "nav")).toBe(false);
  });
  it("无平仓和未读到历史分开显示，不由剩余持仓或总仓位推断交易", () => {
    const api = actual(source, ["HoldingPositionChangeList"]);
    expect(renderToStaticMarkup(React.createElement(api.HoldingPositionChangeList, { trades: [] }))).toContain("暂无仓位变动记录");
    expect(renderToStaticMarkup(React.createElement(api.HoldingPositionChangeList, {}))).toContain("交易记录待更新");
  });
  it("R1交易页只传本人positionChanges，旧closedTrades仅兼容，简介为通俗辅助能力而非收益承诺", () => {
    const h = hooks(), api = actual(source, ["Ledger37HoldingSourceDetail", "HoldingPositionChangeList", "R1HoldingIntroduction"], { useState: h.useState });
    const data = ownSource(); data.memberPortfolio!.closedTrades = [{ symbol: "CLOSED", stockName: "已结束股票", openedDate: "2026-01-01", closedDate: "2026-02-01" }]; data.memberPortfolio!.positionChanges = [{ symbol: "GOOGL", stockName: "谷歌", action: "new" }];
    const render = () => { h.reset(); return api.Ledger37HoldingSourceDetail({ source: data }); };
    let tree = render(); expect(compactRows(tree).map(compactRowName)).not.toContain("已结束股票");
    nodes(tree).find(node => node.props?.role === "tab" && text(node) === "交易变动").props.onClick(); tree = render();
    expect(nodes(tree).find(node => node.type === api.HoldingPositionChangeList).props.changes).toBe(data.memberPortfolio!.positionChanges); expect(nodes(tree).find(node => node.type === api.HoldingPositionChangeList).props.trades).toBe(data.memberPortfolio!.closedTrades);
    nodes(tree).find(node => node.props?.role === "tab" && text(node) === "简介").props.onClick(); tree = render();
    const intro = nodes(tree).find(node => node.type === api.R1HoldingIntroduction);
    const html = renderToStaticMarkup(intro.type(intro.props));
    expect(html).toContain("AI 如何辅助选股"); expect(html).toContain("快速整理海量财报与行情数据"); expect(html).toContain("配合回测工具批量验证策略"); expect(html).toContain("比较历史表现"); expect(html).toContain("减少手工分析和测试的时间");
    expect((html.match(/<p /g) || [])).toHaveLength(2);
    expect(html).toContain("回测结果不代表未来收益"); expect(html).toContain("具体功能以实际提供为准"); expect(html).toContain("IOSCOPD788.pdf"); expect(html).toContain("cfainstitute.org");
    expect(html).not.toMatch(/本系统已|保证盈利|稳赢|自动买卖|已自动交易/);
  });
  it("R1当前持仓为零但本人有平仓记录，仍可打开历史；外部空来源继续隐藏", () => {
    const data = ownSource({ holdings: [], memberPortfolio: { holdings: [], valuationAsOf: null, reportingCurrency: null, closedTrades: [{ symbol: "ENDED", stockName: "已结束股票", openedDate: "2026-01-01", closedDate: "2026-02-01" }] } });
    const payloadData = { ...payload(), sources: [data, item({ holdings: [] })] };
    const api = actual(source, ["Ledger37HoldingSourcesRenderer"]);
    const tree = api.Ledger37HoldingSourcesRenderer({ data: payloadData, selectedSourceId: "r1", onOpen: vi.fn() });
    expect(nodes(tree).some(node => node.type?.name === "Ledger37HoldingSourceDetail")).toBe(true);
    const html = list(payloadData); expect(html).toContain("查看R1持股详情"); expect(html).not.toContain("巴菲特持仓");
    const h = home({ data: payloadData, isFetchedAfterMount: true, isFetching: false });
    const first = nodes(h.render()).find(node => node.type === "sources"); first.props.onOpen("r1");
    expect(nodes(h.render()).find(node => node.type === "sources").props.selectedSourceId).toBe("r1");
  });
});


describe("个人获配交易变动：简洁动作、分页与入口", () => {
  const changes = [
    { symbol: "GOOGL", stockName: "谷歌", action: "new" as const },
    { symbol: "AAPL", stockName: "苹果", action: "increase" as const },
    { symbol: "AAPL", stockName: "苹果", action: "decrease" as const },
    { symbol: "AAPL", stockName: "苹果", action: "decrease" as const },
  ];
  it("只显示股票名与新增增持减持，按服务端记录顺序，多次减持不合并", () => {
    const rows = changes.map(row => ({ ...row, openedDate: "2026-01-01", closedDate: "2026-11-18", assignedAt: "2026-11-19T08:00:00Z", quantity: "9007199254740993", categoryId: 99887766, lotId: 55555555, price: "77777777", projectName: "PRIVATE_PROJECT", note: "SECRET_NOTE" }));
    const before = JSON.stringify(rows), api = actual(source, ["HoldingPositionChangeList"]);
    const html = renderToStaticMarkup(React.createElement(api.HoldingPositionChangeList, { changes: rows }));
    expect(html.match(/data-holding-position-change=/g)).toHaveLength(4);
    expect([...html.matchAll(/data-holding-position-change="([^"]+)"/g)].map(match => match[1])).toEqual(["new", "increase", "decrease", "decrease"]);
    for (const label of ["谷歌", "苹果", "新增", "增持", "减持"]) expect(html).toContain(label);
    expect(html).not.toMatch(/2026-|T08:|9007199254740993|99887766|55555555|77777777|PRIVATE|SECRET|开仓|平仓|买入价|卖出价|股数|市值|减少|未记录/);
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("新数组为空是权威空态，不用旧缓存或总持股补造新增", () => {
    const api = actual(source, ["HoldingPositionChangeList"]);
    const trades = [{ symbol: "SECRET", stockName: "旧缓存卖出", openedDate: null, closedDate: null }];
    const html = renderToStaticMarkup(React.createElement(api.HoldingPositionChangeList, { changes: [], trades }));
    expect(html).toContain("暂无仓位变动记录"); expect(html).not.toContain("旧缓存卖出");
    const invalid = renderToStaticMarkup(React.createElement(api.HoldingPositionChangeList, { changes: null, trades }));
    expect(invalid).toContain("交易记录待更新"); expect(invalid).not.toContain("旧缓存卖出");
  });
  it("新获配记录20条分页且保留原顺序，上一页下一页可用，数据缩短页码有效", () => {
    const rows = Array.from({ length: 41 }, (_, index) => ({ symbol: "SAME", stockName: `真实获配${index}`, action: "new" }));
    const h = hooks(), api = actual(source, ["HoldingPositionChangeList"], { useState: h.useState });
    const render = (changes = rows) => { h.reset(); return api.HoldingPositionChangeList({ changes }); };
    let tree = render();
    const visible = () => nodes(tree).filter(node => node.props?.["data-holding-position-change"]);
    expect(visible()).toHaveLength(20); expect(text(visible()[0])).toBe("真实获配0新增"); expect(text(tree)).toContain("1 / 3");
    expect(nodes(tree).find(node => node.type === "button" && text(node) === "上一页").props.disabled).toBe(true);
    nodes(tree).find(node => node.type === "button" && text(node) === "下一页").props.onClick(); tree = render();
    expect(visible()).toHaveLength(20); expect(text(visible()[0])).toBe("真实获配20新增"); expect(text(tree)).toContain("2 / 3");
    nodes(tree).find(node => node.type === "button" && text(node) === "下一页").props.onClick(); tree = render();
    expect(visible()).toHaveLength(1); expect(text(tree)).toContain("3 / 3");
    expect(nodes(tree).find(node => node.type === "button" && text(node) === "下一页").props.disabled).toBe(true);
    nodes(tree).find(node => node.type === "button" && text(node) === "上一页").props.onClick(); tree = render(); expect(text(tree)).toContain("2 / 3");
    tree = render(rows.slice(0, 1)); expect(visible()).toHaveLength(1); expect(nodes(tree).some(node => node.type === "nav")).toBe(false);
  });
  it.each(["new", "increase", "decrease"] as const)("只有个人%s变动而总仓位及个人持仓均为空，列表、详情和主页入口都可用", action => {
    const r1 = item({ id: "r1", displayName: "R1持股", holdings: [], memberPortfolio: { holdings: [], valuationAsOf: null, reportingCurrency: null, closedTrades: [], positionChanges: [{ ...changes[0], action }] } });
    const data = { ...payload(), sources: [r1, item({ holdings: [] })] };
    const api = actual(source, ["Ledger37HoldingSourcesRenderer", "Ledger37HoldingSourceDetail"]);
    const tree = api.Ledger37HoldingSourcesRenderer({ data, selectedSourceId: "r1", onOpen: vi.fn() });
    expect(nodes(tree).some(node => node.type === api.Ledger37HoldingSourceDetail)).toBe(true);
    expect(list(data)).toContain("查看R1持股详情"); expect(list(data)).not.toContain("巴菲特持仓");
    const h = home({ data, isFetchedAfterMount: true, isFetching: false });
    nodes(h.render()).find(node => node.type === "sources").props.onOpen("r1");
    expect(nodes(h.render()).find(node => node.type === "sources").props.selectedSourceId).toBe("r1");
    r1.status = "unavailable";
    expect(nodes(api.Ledger37HoldingSourcesRenderer({ data, selectedSourceId: "r1", onOpen: vi.fn() })).some(node => node.type === api.Ledger37HoldingSourceDetail)).toBe(false);
    expect(list(data)).not.toContain("查看R1持股详情");
  });
  it("本人有持股但没有任何新增来源时，不能用当前持股猜交易变动", () => {
    const r1 = item({ id: "r1", holdings: [position({ stockName: "来源总组合" })], memberPortfolio: { holdings: [position({ stockName: "当前个人持股" })], valuationAsOf: null, reportingCurrency: null } });
    const h = hooks(), api = actual(source, ["Ledger37HoldingSourceDetail"], { useState: h.useState });
    const render = () => { h.reset(); return api.Ledger37HoldingSourceDetail({ source: r1 }); };
    nodes(render()).find(node => node.props?.role === "tab" && text(node) === "交易变动").props.onClick();
    const tree = render(), panel = nodes(tree).find(node => node.props?.role === "tabpanel"), html = renderToStaticMarkup(panel);
    expect(html).toContain("交易记录待更新"); expect(html).not.toMatch(/来源总组合|当前个人持股|data-holding-position-change=/);
  });
  it("非法动作不被误认成减持，股票名超长在小屏单行截断", () => {
    const api = actual(source, ["HoldingPositionChangeList"]), longName = "LongUnbrokenSecurityName".repeat(10);
    const rows = [{ ...changes[0], stockName: longName }, { ...changes[0], stockName: "BAD_ACTION_SECRET", action: "buy" }, null, { ...changes[0], symbol: "" }];
    const html = renderToStaticMarkup(React.createElement(api.HoldingPositionChangeList, { changes: rows }));
    expect(html.match(/data-holding-position-change=/g)).toHaveLength(1);
    expect(html).toContain(`title="${longName}"`); expect(html).toContain("truncate"); expect(html).toContain("min-w-0"); expect(html).not.toMatch(/BAD_ACTION_SECRET|<table|減持/);
  });
});
