import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { r1ParticipationMoney } from "../client/src/lib/r1StockPresentation";
import type { Ledger37AiStockPool, StockPoolRow } from "../shared/ledger37-ai-presentation";
import type { Ledger37HoldingPosition, Ledger37HoldingSource, Ledger37HoldingSources } from "../shared/ledger37-ai-holdings";

const disclosureSource = readFileSync(new URL("../client/src/components/Ledger37AiNetValueDisclosure.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../client/src/components/Ledger37AiHome.tsx", import.meta.url), "utf8");
const sourcesSource = readFileSync(new URL("../client/src/components/Ledger37HoldingSources.tsx", import.meta.url), "utf8");

// Execute the production TSX module's actual declarations, not a reimplementation.
// Imports are removed via AST; only real pure helpers/icons and explicit offline hooks enter scope.
// Never import the application tRPC client, backend, environment loader, router or database.
function actualModule(source: string, names: string[], scope: Record<string, any> = {}) {
  const file = ts.createSourceFile("actual.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = file.statements.filter(node => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node) && !ts.isExportAssignment(node));
  for (const name of names) expect(declarations.some(node => ts.isFunctionDeclaration(node) && node.name?.text === name), `Missing actual declaration ${name}`).toBe(true);
  const body = declarations.map(node => node.getText(file).replace(/^export\s+(default\s+)?/, "")).join("\n");
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  const safeIcons = Object.fromEntries(Object.entries(icons).filter(([name]) => name !== "default" && /^[A-Za-z_$][\w$]*$/.test(name)));
  const bindings = { React, ...safeIcons, r1ParticipationMoney, ...scope };
  return new Function(...Object.keys(bindings), `${js}; return { ${names.join(",")} };`)(...Object.values(bindings));
}
const pure = actualModule(disclosureSource, ["ledger37AiNetDisclosureTotal", "ledger37AiNetDisclosureDate", "Ledger37AiNetValueDisclosureRenderer"]);
const total = pure.ledger37AiNetDisclosureTotal;
const netDate = pure.ledger37AiNetDisclosureDate;
const Renderer = pure.Ledger37AiNetValueDisclosureRenderer;
function nodes(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : []; }
function text(tree: any): string { return Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree); }
function visibleText(tree: any): string {
  if (Array.isArray(tree)) return tree.map(visibleText).join("");
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (/\bsr-only\b/.test(tree.props?.className ?? "") || tree.props?.["aria-hidden"] === true) return "";
  return visibleText(tree.props?.children);
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
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) if ("value" in descriptor) freeze(descriptor.value); Object.freeze(value); }
  return value;
}
const stock = (patch: Partial<StockPoolRow> = {}): StockPoolRow => ({ symbol: "AAPL", stockName: "苹果", currency: "USD", status: "holding", hasParticipation: true, pnlCny: 12.5, ...patch });
const pool = (stocks: StockPoolRow[] = [stock()], patch: Partial<Ledger37AiStockPool> = {}): Ledger37AiStockPool => ({ viewerUserId: 901, aiEnabled: true, stocks, ...patch });
const position = (patch: Partial<Ledger37HoldingPosition> = {}): Ledger37HoldingPosition => ({ symbol: "PERSONAL", stockName: "我的真实证券", currency: "CNY", shares: "12.123456789123456789", weightPct: 12.123456789, ...patch });
const source = (patch: Partial<Ledger37HoldingSource> = {}): Ledger37HoldingSource => ({ id: "r1", displayName: "R1 持仓", entityName: "R1", kind: "internal", status: "available", asOf: "2026-11-18", publishedAt: null, checkedAt: null, sourceUrl: null, description: "", coverageNote: "", holdings: [position({ symbol: "CATALOG", stockName: "总仓证券", weightPct: 90 })], memberPortfolio: { holdings: [position(), position({ symbol: "UNKNOWN", stockName: "未知比例证券", weightPct: null })], valuationAsOf: "2026-11-19", reportingCurrency: "CNY", positionChanges: [{ symbol: "NEW", stockName: "真实新增", action: "new" }, { symbol: "UP", stockName: "真实增持", action: "increase" }, { symbol: "DOWN", stockName: "真实减持", action: "decrease" }] }, ...patch });
const sources = (): Ledger37HoldingSources => ({ viewerUserId: 901, aiEnabled: true, sources: [source({ id: "ark", displayName: "木头姐持仓", entityName: "ARKK", kind: "etf", memberPortfolio: undefined }), source({ id: "berkshire", displayName: "巴菲特持仓", kind: "13f", memberPortfolio: undefined }), source(), source({ id: "pelosi", displayName: "佩洛西持仓", kind: "disclosure", memberPortfolio: undefined }), source({ id: "nvidia", displayName: "英伟达持仓", kind: "13f", memberPortfolio: undefined })] });
function guardedLedger(allowed: Record<string, any>) {
  return new Proxy(allowed, { get(target, key) { if (!(key in target)) throw new Error(`Forbidden raw/legacy API hook: ${String(key)}`); return target[key as string]; } });
}
function disclosure(query: any = { data: pool(), isFetchedAfterMount: true, isFetching: false }) {
  const spy = vi.fn((_input: any, _options: any) => query);
  const api = actualModule(disclosureSource, ["Ledger37AiNetValueDisclosure", "Ledger37AiNetValueDisclosureRenderer"], { trpc: { ledger: guardedLedger({ getMyLedger37AiStockPool: { useQuery: spy } }) } });
  return { spy, query, api, render: (...args: [viewerUserId?: any, adminPreview?: boolean]) => expand(api.Ledger37AiNetValueDisclosure({ viewerUserId: args.length ? args[0] : 901, adminPreview: args[1] ?? false })) };
}
function pnl(tree: any) { const result = nodes(tree).filter(node => node.props?.["data-ai-net-disclosure-pnl"] === "true"); expect(result).toHaveLength(1); return result[0]; }
function disclosureNodes(tree: any) { return nodes(tree).filter(node => node.props?.["data-ai-net-disclosure"] === "true"); }
function dateNodes(tree: any) { return nodes(tree).filter(node => node.props?.["data-ai-net-disclosure-date"] === "true"); }
function noDate(tree: any) { expect(dateNodes(tree)).toHaveLength(0); expect(visibleText(disclosureNodes(tree))).not.toMatch(/\d{4}年\d{1,2}月\d{1,2}日/); }
function expectDate(tree: any, iso: string, label: string) {
  const dates = dateNodes(tree); expect(dates).toHaveLength(1); expect(dates[0].type).toBe("time");
  expect(dates[0].props.dateTime).toBe(iso); expect(visibleText(dates[0])).toBe(label);
  return dates[0];
}
function unknown(tree: any, label = "待披露") { expect(text(pnl(tree))).toBe(label); expect(pnl(tree).props.className).toContain("text-[#61758A]"); expect(visibleText(tree)).not.toContain("¥0.00"); noDate(tree); }
function shape(tree: any): any { return Array.isArray(tree) ? tree.map(shape) : !tree || typeof tree !== "object" ? typeof tree : [tree.type, tree.key, tree.props.role, shape(tree.props.children)]; }

// Real Home -> SourcesRenderer -> List/Detail -> Disclosure query -> pure renderer.
// Other imported components are inert. Per-route source hook stores preserve real tab interaction.
function actualHome(sourceQuery: any = { data: sources(), isFetchedAfterMount: true, isFetching: false }, poolQuery: any = { data: pool(), isFetchedAfterMount: true, isFetching: false }) {
  const homeHooks = hooks(), sourceHooks = new Map<string, ReturnType<typeof hooks>>(); let activeHooks = hooks();
  const sourcesSpy = vi.fn((_input: any, _options: any) => sourceQuery), poolSpy = vi.fn((_input: any, _options: any) => poolQuery), onBack = vi.fn();
  const trpc = { ledger: guardedLedger({ getMyLedger37HoldingSources: { useQuery: sourcesSpy }, getMyLedger37AiStockPool: { useQuery: poolSpy } }), stock: guardedLedger({}) };
  const disclosureApi = actualModule(disclosureSource, ["Ledger37AiNetValueDisclosure"], { trpc });
  const sourcesApi = actualModule(sourcesSource, ["Ledger37HoldingSourcesRenderer", "Ledger37HoldingSourceList", "Ledger37HoldingSourceDetail", "ledger37HoldingSourceHasDetails"], { useState: (initial: any) => activeHooks.useState(initial) });
  const api = actualModule(homeSource, ["Ledger37AiHome"], { useState: homeHooks.useState, trpc, ...sourcesApi, Ledger37AiNetValueDisclosure: disclosureApi.Ledger37AiNetValueDisclosure, Ledger37AiIdentityHeader: "identity-header", Ledger37CalendarRecorder: () => null });
  const tree = (viewerUserId: any = 901, adminPreview = false) => { homeHooks.reset(); return api.Ledger37AiHome({ viewerUserId, adminPreview, onBack }); };
  const render = (viewerUserId: any = 901, adminPreview = false) => {
    const raw = tree(viewerUserId, adminPreview), entry = nodes(raw).find(node => node.type === sourcesApi.Ledger37HoldingSourcesRenderer);
    const route = `${viewerUserId}:${entry?.props.selectedSourceId ?? "list"}`;
    if (!sourceHooks.has(route)) sourceHooks.set(route, hooks());
    activeHooks = sourceHooks.get(route)!; activeHooks.reset();
    return expand(raw);
  };
  const open = (id: string) => { const entry = nodes(tree()).find(node => node.type === sourcesApi.Ledger37HoldingSourcesRenderer); expect(entry).toBeDefined(); entry.props.onOpen(id); };
  return { sourceQuery, poolQuery, sourcesSpy, poolSpy, onBack, tree, render, open, sourcesApi, disclosureApi };
}

describe("37 AI最新净值披露：真实安全股票池金额与renderer", () => {
  it("所有实际参与股票已有pnlCny直接合计：holding/closed同算，跨已换CNY币种，不换汇或重算", () => {
    const rows = [stock({ symbol: "USD_HOLD", currency: "USD", pnlCny: 700.125 }), stock({ symbol: "USDT_CLOSED", currency: "USDT", status: "closed", pnlCny: -20.375 }), stock({ symbol: "CNY_CLOSED", currency: "CNY", status: "closed", pnlCny: 99.5 }), stock({ symbol: "OBSERVE", hasParticipation: false, pnlCny: 999999 })];
    const data = freeze(pool(rows)), snapshot = structuredClone(data);
    expect(total(data)).toBe(779.25);
    expect(text(pnl(disclosure({ data, isFetchedAfterMount: true }).render()))).toBe("+¥779.25");
    expect(data).toEqual(snapshot);
    expect(total(pool(rows.map(row => ({ ...row, status: row.status === "holding" ? "closed" : "holding" }))))).toBe(779.25);
    const poisoned = freeze(pool(rows.map(row => ({ ...row, price: 12345678, shares: "999999", currencyRate: 100, floatingPnl: 9999, realizedPnl: 9999, dividend: 9999 })) as StockPoolRow[]));
    expect(total(poisoned)).toBe(779.25);
  });
  it("hasParticipation=false完全排除，即使其pnl未知/非法；不读观察行pnl，也不mutation", () => {
    const observation = Object.freeze({ ...stock({ hasParticipation: false }), get pnlCny() { throw new Error("Observation P/L must not be read"); } });
    const rows = freeze([stock({ pnlCny: -8.25 }), observation, ...[null, NaN, Infinity, -Infinity, "999", {}, undefined].map(value => ({ ...stock({ hasParticipation: false }), pnlCny: value }))]);
    expect(total({ stocks: rows })).toBe(-8.25);
    expect(rows[0].pnlCny).toBe(-8.25);
    expect(rows).toHaveLength(9);
  });
  it.each([undefined, null, {}, { stocks: null }, { stocks: {} }, { stocks: "bad" }, { stocks: [] }, pool([stock({ hasParticipation: false, pnlCny: 999 })])])("无池/空/无参与不披露零：%j", data => {
    expect(total(data)).toBeNull(); unknown(Renderer({ totalPnl: total(data) }));
  });
  it.each([null, undefined, NaN, Infinity, -Infinity, "12.50", "", "NaN", "Infinity", {}, [], true, false].map(value => ({ value })))("任一个参与pnlCny=$value未知或非法，整项待披露而不是部分合计", ({ value }) => {
    for (const index of [0, 1, 2]) {
      const rows: any[] = [stock({ pnlCny: 10 }), stock({ pnlCny: 20 }), stock({ pnlCny: -5 })];
      rows[index] = { ...rows[index], pnlCny: value, status: index === 1 ? "closed" : "holding" };
      const data = freeze(pool(rows)), snapshot = structuredClone(data);
      expect(total(data)).toBeNull(); unknown(disclosure({ data, isFetchedAfterMount: true }).render()); expect(data).toEqual(snapshot);
    }
  });
  it.each(["true", "false", 1, 0, null, undefined, {}, new Boolean(true)])("malformed hasParticipation=%s不得真值强转参与或伪装未参与", flag => {
    const data = freeze(pool([stock({ pnlCny: 10 }), { ...stock({ pnlCny: 20 }), hasParticipation: flag } as any]));
    expect(total(data)).toBeNull(); unknown(Renderer({ totalPnl: total(data) }));
  });
  it.each([null, undefined, "row", 1, true])("malformed行=%s不能使已有部分收益被当完整披露", row => {
    expect(total({ stocks: [stock(), row] })).toBeNull(); unknown(Renderer({ totalPnl: total({ stocks: [stock(), row] }) }));
  });
  it("正负overflow立即待披露，不靠后续抵消掩盖中间溢出", () => {
    for (const sign of [1, -1]) {
      const data = freeze(pool([stock({ pnlCny: sign * Number.MAX_VALUE }), stock({ pnlCny: sign * Number.MAX_VALUE }), stock({ pnlCny: -sign * Number.MAX_VALUE })]));
      expect(total(data)).toBeNull(); unknown(disclosure({ data, isFetchedAfterMount: true }).render());
    }
  });
  it.each([
    { value: 1234.5, label: "+¥1,234.50", tone: "text-[#D32F2F]" },
    { value: -1234.5, label: "−¥1,234.50", tone: "text-[#2E7D32]" },
    { value: 0, label: "¥0.00", tone: "text-[#142A3F]" },
    { value: -0, label: "¥0.00", tone: "text-[#142A3F]" },
    { value: 12.345, label: "+¥12.35", tone: "text-[#D32F2F]" },
    { value: -12.345, label: "−¥12.35", tone: "text-[#2E7D32]" },
    { value: 0.001, label: "+¥0.00", tone: "text-[#D32F2F]" },
  ])("真实r1ParticipationMoney金额与颜色：$value", ({ value, label, tone }) => {
    const tree = Renderer({ totalPnl: value }), valueNode = pnl(tree);
    expect(text(valueNode)).toBe(r1ParticipationMoney(value)); expect(text(valueNode)).toBe(label);
    expect(valueNode.props.className).toContain(tone); expect(text(valueNode)).toMatch(/\.\d{2}$/);
    expect(valueNode.props.className).toMatch(/tabular-nums/); expect(valueNode.props.className).toContain("[overflow-wrap:anywhere]");
    if (Object.is(value, -0)) expect(text(valueNode)).not.toMatch(/[+−-]/);
    expect(renderToStaticMarkup(tree)).toContain(label);
  });
  it("可见披露仅保留标题与原金额，不显示累计盈亏·人民币副标题或伪造单位净值/本金/市值/价格/股数/项目/收益率", () => {
    const data = freeze(Object.assign(pool(), { principal: 123456789, totalAssets: 87654321, unitNav: 1.012345, observation: { pnlCny: 987654321 }, projects: [{ name: "SECRET_PROJECT", pnlCny: 123456789 }] }));
    const tree = disclosure({ data, isFetchedAfterMount: true }).render(), html = renderToStaticMarkup(tree);
    expect(disclosureNodes(tree)).toHaveLength(1); expect(disclosureNodes(tree)[0].props["aria-label"]).toBe("最新净值披露");
    expect(visibleText(tree)).toBe("最新净值披露+¥12.50");
    expect(visibleText(tree)).not.toContain("累计盈亏 · 人民币");
    expect(visibleText(tree)).not.toMatch(/单位净值|本金|市值|价格|股数|项目|收益率|年化|净资产|总资产/);
    expect(html).not.toMatch(/SECRET|123456789|87654321|987654321|1\.012345|<table|<canvas/);
    expect(text(tree)).toContain("个人累计盈亏，不含观察，不是持仓市值或可提现余额");
    expect(disclosureSource).toContain("r1ParticipationMoney(totalPnl)");
  });
  it.each([null, undefined, NaN, Infinity, -Infinity, "12", {}])("renderer非法total=%s待披露，不伪零且中性", value => unknown(Renderer({ totalPnl: value })));
});

describe("37 AI最新净值披露日期：服务端出具时间、北京时间与fail-closed", () => {
  const now = "2026-11-22T02:00:00.000Z";
  const issued = "2026-11-20T16:00:00.000Z", issuedLabel = "2026年11月21日";
  const datedPool = (disclosedAt: unknown = issued, stocks: StockPoolRow[] = [stock()], patch: Partial<Ledger37AiStockPool> = {}) => Object.assign(pool(stocks, patch), { disclosedAt });
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
  afterEach(() => { vi.useRealTimers(); });

  it.each([
    { iso: "2026-11-20T15:59:59.999Z", label: "2026年11月20日" },
    { iso: issued, label: issuedLabel },
    { iso: "2026-01-31T16:00:00.000Z", label: "2026年2月1日" },
    { iso: "2025-12-31T16:00:00.000Z", label: "2026年1月1日" },
    { iso: "2024-02-29T00:00:00.000Z", label: "2024年2月29日" },
    { iso: now, label: "2026年11月22日" },
  ])("真实helper转换UTC为北京时间且不补零：$iso → $label", ({ iso, label }) => {
    expect(netDate(iso)).toBe(label);
    const tree = Renderer({ totalPnl: 12.5, disclosedAt: iso });
    expectDate(tree, iso, label); expect(text(pnl(tree))).toBe("+¥12.50");
  });
  it.each([
    undefined, null, "", " ", 0, Date.parse(issued), NaN, Infinity, false, true, {}, [], new Date(issued), new String(issued),
    "2026-11-20", "2026年11月20日", "2026-11-20T16:00:00", "2026-11-20 16:00:00.000Z", "2026-11-20T16:00:00.000+08:00",
    "2026-2-01T00:00:00.000Z", "2026-11-20t16:00:00.000z", "2026-11-20T16:00:00.000Z trailing", " 2026-11-20T16:00:00.000Z",
    "2026-02-29T00:00:00.000Z", "2025-02-29T00:00:00.000Z", "2026-02-30T00:00:00.000Z", "2026-04-31T00:00:00.000Z",
    "2026-00-20T00:00:00.000Z", "2026-13-20T00:00:00.000Z", "2026-11-00T00:00:00.000Z", "2026-11-31T00:00:00.000Z",
    "2026-11-20T24:00:00.000Z", "2026-11-20T25:00:00.000Z", "2026-11-20T16:60:00.000Z", "2026-11-20T16:00:60.000Z",
    "2026-11-20T16:00:00.NaNZ", "2026-11-20T16:00:00.000Z\n", "2026-11-22T02:00:00.001Z", "2026-11-22T03:00:00.000Z", "2099-01-01T00:00:00.000Z",
  ].map(value => ({ value })))("未知/缺失/非ISO UTC/不真实日期时间/未来=$value只能返回null，不回落客户端今天", ({ value }) => {
    expect(netDate(value)).toBeNull();
    const tree = Renderer({ totalPnl: 12.5, disclosedAt: value });
    noDate(tree); expect(visibleText(tree)).toBe("最新净值披露+¥12.50");
    expect(visibleText(tree)).not.toContain("2026年11月22日");
    const safe = disclosure({ data: datedPool(value), isFetchedAfterMount: true }).render();
    noDate(safe); expect(text(pnl(safe))).toBe("+¥12.50");
  });
  it("helper不强转对象、不会执行恶意toString；不修改输入", () => {
    const toString = vi.fn(() => { throw new Error("Never coerce a date object"); }), value = freeze({ toString });
    expect(netDate(value)).toBeNull(); noDate(Renderer({ totalPnl: 12.5, disclosedAt: value })); expect(toString).not.toHaveBeenCalled();
  });
  it("标题下真实time日期，金额完全保留且旧累计盈亏·人民币副标题不恢复", () => {
    const data = freeze(datedPool()), snapshot = structuredClone(data), tree = disclosure({ data, isFetchedAfterMount: true }).render();
    expectDate(tree, issued, issuedLabel);
    const dateParent = nodes(tree).find(node => React.Children.toArray(node.props?.children).some((child: any) => child?.props?.["data-ai-net-disclosure-date"] === "true"));
    expect(dateParent).toBeDefined();
    const siblings = React.Children.toArray(dateParent.props.children);
    const titleIndex = siblings.findIndex(node => visibleText(node) === "最新净值披露");
    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeLessThan(siblings.findIndex((node: any) => node?.props?.["data-ai-net-disclosure-date"] === "true"));
    expect(visibleText(tree)).toBe(`最新净值披露${issuedLabel}+¥12.50`);
    expect(visibleText(tree)).not.toMatch(/累计盈亏\s*·\s*人民币|单位净值|本金|市值|股数|收益率/);
    expect(pnl(tree).props.className).toContain("text-[#D32F2F]"); expect(text(tree)).toContain("个人累计盈亏，不含观察，不是持仓市值或可提现余额");
    expect(renderToStaticMarkup(tree)).toContain(`datetime="${issued}"`); expect(data).toEqual(snapshot);
  });
  it.each([0, -0, -12.5, 12.5])("已知有限金额=$value含真实零才可同时展示日期", value => {
    const tree = Renderer({ totalPnl: value, disclosedAt: issued }); expectDate(tree, issued, issuedLabel); expect(text(pnl(tree))).toBe(r1ParticipationMoney(value));
  });
  it.each([null, undefined, NaN, Infinity, -Infinity, "12", {}, []])("非法或未知total=%s即使disclosedAt有效也不显示日期", value => {
    unknown(Renderer({ totalPnl: value, disclosedAt: issued }));
  });
  it.each([{ loading: true }, { unavailable: true }, { loading: true, unavailable: true }])("loading/unavailable=%j不能泄露已知数值和日期", flags => {
    const tree = Renderer({ totalPnl: 9876.54, disclosedAt: issued, ...flags });
    noDate(tree); expect(visibleText(tree)).not.toContain("9,876.54"); expect(pnl(tree).props.className).toContain("text-[#61758A]");
  });
  it("任一个个人pnl未知、无参与或overflow，不把日期当成完整披露凭证", () => {
    for (const stocks of [[], [stock({ hasParticipation: false })], [stock(), stock({ pnlCny: null })], [stock({ pnlCny: Number.MAX_VALUE }), stock({ pnlCny: Number.MAX_VALUE })]]) {
      unknown(disclosure({ data: datedPool(issued, stocks), isFetchedAfterMount: true }).render());
    }
  });
  it("日期只取安全池disclosedAt，不从行情日、来源资料日、冻结净值日期或本地今天回落", () => {
    const data = freeze(Object.assign(pool(), { asOf: "2026-11-19", valuationAsOf: "2026-11-18", publishedAt: issued, checkedAt: issued, quoteDate: "2026-11-17", frozenNavDate: issued }));
    const h = actualHome({ data: sources(), isFetchedAfterMount: true }, { data, isFetchedAfterMount: true });
    noDate(h.render()); h.open("r1"); noDate(h.render()); expect(text(pnl(h.render()))).toBe("+¥12.50");
    expect(netDate(issued)).toBe(issuedLabel); vi.setSystemTime(new Date("2026-11-25T02:00:00.000Z"));
    expect(netDate(issued)).toBe(issuedLabel); noDate(h.render());
  });
  it("首次确认前隐藏带日期缓存，只有同identity安全响应确认后展示", () => {
    const h = disclosure({ data: freeze(datedPool()), isFetchedAfterMount: false, isFetching: true });
    unknown(h.render(), "读取中…"); h.query.isFetching = false; unknown(h.render(), "读取中…");
    h.query.isFetchedAfterMount = true; expectDate(h.render(), issued, issuedLabel); expect(text(pnl(h.render()))).toBe("+¥12.50");
  });
  it.each([902, "901", undefined, null])("错误identity=%s隐藏金额和日期，即使adminPreview", identity => {
    const h = disclosure({ data: freeze(datedPool(issued, undefined, { viewerUserId: identity as any })), isFetchedAfterMount: true });
    unknown(h.render()); unknown(h.render(901, true));
  });
  it.each([false, undefined, null, "true", 1])("AI关闭/非法flag=%s不显示日期或金额", flag => {
    unknown(disclosure({ data: freeze(datedPool(issued, undefined, { aiEnabled: flag as any })), isFetchedAfterMount: true }).render());
  });
  it.each([0, -1, NaN, Infinity, 1.5, "901", null, undefined])("非法viewer=%s禁用query且不泄露缓存日期", viewer => {
    const h = disclosure({ data: freeze(datedPool()), isFetchedAfterMount: true }); unknown(h.render(viewer)); unknown(h.render(viewer, true));
    expect(h.spy.mock.calls[0][1].enabled).toBe(false);
  });
  it("已获准adminPreview仍支持实际AI关闭，但身份、首次确认和error日期门禁不绕过", () => {
    const data = freeze(datedPool(issued, undefined, { aiEnabled: false })), snapshot = structuredClone(data), h = disclosure({ data, isFetchedAfterMount: true });
    unknown(h.render()); expectDate(h.render(901, true), issued, issuedLabel); expect(text(pnl(h.render(901, true)))).toBe("+¥12.50");
    unknown(h.render(902, true)); h.query.isFetchedAfterMount = false; unknown(h.render(901, true), "读取中…");
    h.query.error = new Error("forbidden"); unknown(h.render(901, true), "披露暂不可用"); expect(data).toEqual(snapshot);
  });
  it("后台更新保留旧日期与金额直到新响应，不把新客户端日期充作披露时间", () => {
    const h = disclosure({ data: freeze(datedPool()), isFetchedAfterMount: true, isFetching: false }), before = h.render();
    h.query.isFetching = true; vi.setSystemTime(new Date("2026-11-23T02:00:00.000Z")); const during = h.render();
    expectDate(during, issued, issuedLabel); expect(visibleText(during)).toBe(visibleText(before)); expect(shape(during)).toEqual(shape(before));
    expect(pnl(during).props.className).toBe(pnl(before).props.className); expect(visibleText(during)).not.toContain("2026年11月23日");
    const status = nodes(during).filter(node => node.props?.role === "status"); expect(status).toHaveLength(1); expect(status[0].props.className).toBe("sr-only");
    expect(text(status[0])).toBe("后台更新净值披露，保留当前数值"); expect(renderToStaticMarkup(during)).not.toMatch(/animate-(?:pulse|ping|spin)/);
    const next = "2026-11-21T16:00:00.000Z"; h.query.data = freeze(datedPool(next, [stock({ pnlCny: -1.25 })]));
    expectDate(h.render(), next, "2026年11月22日"); expect(text(pnl(h.render()))).toBe("−¥1.25");
    h.query.isFetching = false; expectDate(h.render(), next, "2026年11月22日");
    h.query.data = pool([stock({ pnlCny: 9 })]); noDate(h.render()); expect(text(pnl(h.render()))).toBe("+¥9.00");
  });
  it("背景或首次error立即隐藏日期和数值，不从旧响应或今天回落；新安全响应可恢复", () => {
    const h = disclosure({ data: freeze(datedPool()), isFetchedAfterMount: true, isFetching: false }); expectDate(h.render(), issued, issuedLabel);
    h.query.error = new Error("denied"); unknown(h.render(), "披露暂不可用");
    h.query.isFetching = true; unknown(h.render(), "披露暂不可用"); h.query.isFetchedAfterMount = false; unknown(h.render(), "披露暂不可用");
    expect(visibleText(h.render())).not.toMatch(/12\.50|denied|2026年11月22日/);
    h.query.error = null; unknown(h.render(), "读取中…"); h.query.isFetchedAfterMount = true; expectDate(h.render(), issued, issuedLabel);
    h.query.data = datedPool(issued, undefined, { viewerUserId: 902 }); unknown(h.render()); unknown(h.render(901, true));
  });
  it("真实Home列表和R1详情展示同一安全出具日期，池error不影响原持股比例且日期隐藏", () => {
    const h = actualHome({ data: sources(), isFetchedAfterMount: true }, { data: freeze(datedPool()), isFetchedAfterMount: true });
    const list = h.render(), article = nodes(list).find(node => node.props?.["data-holding-source"] === "r1"); expectDate(article, issued, issuedLabel);
    for (const external of nodes(list).filter(node => node.type === "article" && node.props?.["data-holding-source"] !== "r1")) noDate(external);
    h.open("r1"); const detail = h.render(); expectDate(detail, issued, issuedLabel); expect(renderToStaticMarkup(detail)).toContain("width:12.123456789%");
    h.poolQuery.error = new Error("P/L unavailable"); const failed = h.render(); unknown(failed, "披露暂不可用");
    expect(renderToStaticMarkup(failed)).toContain("width:12.123456789%"); expect(visibleText(failed)).toContain("我的真实证券");
    expect(nodes(failed).filter(node => node.props?.role === "tab")).toHaveLength(3);
  });
});

describe("37 AI净值披露query：离线实际useQuery与fail-closed", () => {
  it.each([901, 902, Number.MAX_SAFE_INTEGER])("只查询固定37和同viewer=%s，60s刷新、挂载确认、不后台轮询", viewerUserId => {
    const h = disclosure({ data: pool(undefined, { viewerUserId }), isFetchedAfterMount: true });
    h.render(viewerUserId);
    expect(h.spy).toHaveBeenCalledOnce(); expect(h.spy).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: viewerUserId }, {
      enabled: true, placeholderData: undefined, retry: false, staleTime: 60000, refetchOnMount: "always", refetchInterval: 60000, refetchIntervalInBackground: false, refetchOnWindowFocus: true,
    });
    const file = ts.createSourceFile("disclosure.tsx", disclosureSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), queries: string[] = [];
    const visit = (node: ts.Node) => { if (ts.isCallExpression(node) && node.expression.getText(file).endsWith(".useQuery")) queries.push(node.expression.getText(file)); ts.forEachChild(node, visit); }; visit(file);
    expect(queries).toEqual(["trpc.ledger.getMyLedger37AiStockPool.useQuery"]);
    expect(disclosureSource).not.toMatch(/getMyLedger37AiOverview|getMyR1AiParticipationPortfolio|getStockPortfolio|getUsdCnyRate|getTransactions|getCategories|getTagSummary|getMyInitialBalances|\.useMutation\(|\.mutate\(|fetch\(|axios/);
  });
  it("首次挂载不展示未确认缓存，服务端首次确认后才披露", () => {
    const h = disclosure({ data: freeze(pool([stock({ pnlCny: 9876.54 })])), isFetchedAfterMount: false, isFetching: true });
    unknown(h.render(), "读取中…"); expect(visibleText(h.render())).not.toContain("9,876.54");
    h.query.isFetching = false; unknown(h.render(), "读取中…");
    h.query.isFetchedAfterMount = true; expect(text(pnl(h.render()))).toBe("+¥9,876.54");
    const empty = disclosure({ isFetchedAfterMount: false, isLoading: true }); unknown(empty.render(), "读取中…");
    empty.query.isFetchedAfterMount = true; unknown(empty.render());
  });
  it.each([902, "901", undefined, null])("缓存或响应错identity=%s即使管理员preview也不披露", identity => {
    const h = disclosure({ data: pool(undefined, { viewerUserId: identity as any }), isFetchedAfterMount: true });
    unknown(h.render()); unknown(h.render(901, true));
  });
  it.each([false, undefined, null, "true", 1])("AI关闭或非法flag=%s普通用户fail-closed", flag => {
    const h = disclosure({ data: freeze(pool(undefined, { aiEnabled: flag as any })), isFetchedAfterMount: true }); unknown(h.render());
  });
  it("adminPreview只读允许实际false，不改flag、不绕过identity/首次确认/error", () => {
    const data = freeze(pool(undefined, { aiEnabled: false })), snapshot = structuredClone(data), h = disclosure({ data, isFetchedAfterMount: true });
    unknown(h.render()); expect(text(pnl(h.render(901, true)))).toBe("+¥12.50"); expect(data).toEqual(snapshot); expect(data.aiEnabled).toBe(false);
    unknown(h.render(902, true)); h.query.isFetchedAfterMount = false; unknown(h.render(901, true), "读取中…");
    h.query.error = new Error("forbidden"); unknown(h.render(901, true), "披露暂不可用"); expect(data).toEqual(snapshot);
  });
  it.each([0, -1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 1.5, "901", null, undefined])("非法ID=%s query enabled=false且不泄露已有数据", viewerUserId => {
    const h = disclosure(); unknown(h.render(viewerUserId));
    expect(h.spy.mock.calls[0][1].enabled).toBe(false); expect(visibleText(h.render(viewerUserId, true))).not.toContain("12.50");
  });
  it("任何error立即隐藏已知值，不在首次或背景error回落缓存", () => {
    const h = disclosure(); expect(text(pnl(h.render()))).toBe("+¥12.50");
    h.query.error = new Error("denied"); unknown(h.render(), "披露暂不可用");
    h.query.isFetching = true; unknown(h.render(), "披露暂不可用"); h.query.isFetchedAfterMount = false; unknown(h.render(), "披露暂不可用");
    expect(visibleText(h.render())).not.toContain("denied");
  });
  it("背景更新保留数值、颜色与树，只改变稳定sr-only状态槽；新安全响应到达才更新", () => {
    const h = disclosure(), before = h.render(); h.query.isFetching = true; const during = h.render();
    expect(shape(during)).toEqual(shape(before)); expect(visibleText(during)).toBe(visibleText(before)); expect(pnl(during).props.className).toBe(pnl(before).props.className);
    const status = nodes(during).filter(node => node.props?.role === "status"); expect(status).toHaveLength(1); expect(status[0].props.className).toBe("sr-only");
    expect(text(status[0])).toBe("后台更新净值披露，保留当前数值"); expect(renderToStaticMarkup(during)).not.toMatch(/animate-(?:pulse|ping|spin)/);
    h.query.data = pool([stock({ pnlCny: -1.25 })]); expect(text(pnl(h.render()))).toBe("−¥1.25"); h.query.isFetching = false; expect(text(pnl(h.render()))).toBe("−¥1.25");
  });
});

describe("实际Home→SourcesRenderer→list/detail净值披露专属R1接线", () => {
  it("首页真实组件传同viewer和preview，披露只在R1 article标题后，外部来源没有", () => {
    const h = actualHome(), raw = h.tree(), entry = nodes(raw).find(node => node.type === h.sourcesApi.Ledger37HoldingSourcesRenderer);
    expect(entry).toBeDefined(); expect(entry.props.netValueDisclosure.type).toBe(h.disclosureApi.Ledger37AiNetValueDisclosure);
    expect(entry.props.netValueDisclosure.props).toEqual({ viewerUserId: 901, adminPreview: false }); expect(entry.props.netValueDisclosure.key).toBe("net-disclosure-901");
    const tree = h.render(), articles = nodes(tree).filter(node => node.type === "article");
    expect(articles.map(node => node.props["data-holding-source"])).toEqual(["r1", "berkshire", "pelosi", "ark", "nvidia"]); expect(disclosureNodes(tree)).toHaveLength(1);
    for (const article of articles) expect(disclosureNodes(article)).toHaveLength(article.props["data-holding-source"] === "r1" ? 1 : 0);
    const children = React.Children.toArray(articles[0].props.children) as React.ReactElement<any>[];
    expect(children[0].type).toBe("button"); expect(children[1].props["data-ai-net-disclosure"]).toBe("true"); expect(children[0].props["aria-label"]).toBe("查看R1 持仓详情");
    expect(visibleText(articles[0])).not.toMatch(/2026-11-18|资料截至|披露日期|核验日期|资料日期未提供|股票名录|比例待更新|累计盈亏 · 人民币/);
    expect(h.sourcesSpy.mock.calls[0][0]).toEqual({ ledgerId: 37, viewAsUserId: 901 }); expect(h.poolSpy).toHaveBeenCalledOnce(); expect(h.poolSpy.mock.calls[0][0]).toEqual(h.sourcesSpy.mock.calls[0][0]);
    expect(nodes(tree).some(node => node.props?.role === "tablist")).toBe(false);
  });
  it("R1详情净值属于main首个持股section下半段，tablist紧随；原个人比例、真实精度条、排序、三页签和仓位变动保留", () => {
    const h = actualHome(); h.open("r1"); let tree = h.render();
    expect(disclosureNodes(tree)).toHaveLength(1); const main = nodes(tree).find(node => node.type === "main"), children = React.Children.toArray(main.props.children) as React.ReactElement<any>[];
    const disclosureIndex = children.findIndex(child => disclosureNodes(child).length > 0), tabIndex = children.findIndex(child => child.props?.role === "tablist");
    expect(disclosureIndex).toBe(0); expect(tabIndex).toBe(1); expect(children[0].type).toBe("section");
    expect(disclosureNodes(children[0])).toHaveLength(1);
    const summaryChildren = React.Children.toArray(children[0].props.children) as React.ReactElement<any>[];
    expect(disclosureNodes(summaryChildren[0])).toHaveLength(0); expect(disclosureNodes(summaryChildren.at(-1))).toHaveLength(1);
    expect(visibleText(children[0])).toContain("R1 持仓"); expect(visibleText(children[0])).toContain("最新净值披露+¥12.50");
    expect(visibleText(children[0])).not.toMatch(/2026-11-18|2026-11-19|资料截至|披露日期|核验日期|资料日期未提供|股票名录|比例待更新|环图按|累计盈亏 · 人民币/);
    expect(nodes(tree).filter(node => node.props?.role === "tab").map(text)).toEqual(["持股列表", "交易变动", "简介"]);
    let html = renderToStaticMarkup(tree); expect(html).toContain("我的真实证券"); expect(html).not.toContain("总仓证券"); expect(html).toContain("持股百分比");
    expect(html).toContain("width:12.123456789%"); expect(html).toContain("12.12%"); expect(html).toContain('data-holding-bar="neutral"'); expect(html).not.toContain("12.123456789123456789");
    expect(html).not.toContain('aria-label="持股排序"'); expect(html).not.toContain('aria-label="搜索股票名称或代码"');
    const original = structuredClone(h.sourceQuery.data); nodes(tree).find(node => node.props?.role === "tab" && text(node) === "交易变动").props.onClick(); tree = h.render();
    expect(disclosureNodes(tree)).toHaveLength(1); expect(visibleText(tree)).toContain("我的仓位变动");
    expect(nodes(tree).filter(node => node.props?.["data-holding-position-change"]).map(node => node.props["data-holding-position-change"])).toEqual(["new", "increase", "decrease"]);
    expect(visibleText(tree)).toContain("真实新增新增"); expect(visibleText(tree)).toContain("真实增持增持"); expect(visibleText(tree)).toContain("真实减持减持");
    nodes(tree).find(node => node.props?.role === "tab" && text(node) === "简介").props.onClick(); tree = h.render(); expect(disclosureNodes(tree)).toHaveLength(1); expect(visibleText(tree)).toContain("AI 如何辅助选股");
    expect(h.sourceQuery.data).toEqual(original);
  });
  it("R1缺日期与未知比例时，list和详情摘要不回落旧日期/股票名录/比例待更新；未知持仓比例仍不填零", () => {
    const data = sources(), r1 = data.sources.find(row => row.id === "r1")!;
    r1.asOf = null; r1.publishedAt = null; r1.checkedAt = null;
    r1.holdings = r1.holdings.map(row => ({ ...row, weightPct: null }));
    r1.memberPortfolio!.valuationAsOf = null; r1.memberPortfolio!.holdings = r1.memberPortfolio!.holdings.map(row => ({ ...row, weightPct: null }));
    const h = actualHome({ data, isFetchedAfterMount: true }), list = h.render(), article = nodes(list).find(node => node.props?.["data-holding-source"] === "r1");
    expect(article).toBeDefined(); expect(disclosureNodes(article)).toHaveLength(1); expect(text(pnl(article))).toBe("+¥12.50");
    expect(visibleText(article)).not.toMatch(/资料截至|披露日期|核验日期|资料日期未提供|股票名录|比例待更新|累计盈亏 · 人民币/);
    h.open("r1"); const detail = h.render(), main = nodes(detail).find(node => node.type === "main"), children = React.Children.toArray(main.props.children) as React.ReactElement<any>[];
    expect(children[0].type).toBe("section"); expect(disclosureNodes(children[0])).toHaveLength(1); expect(children[1].props.role).toBe("tablist");
    expect(visibleText(children[0])).not.toMatch(/资料截至|披露日期|核验日期|资料日期未提供|股票名录|比例待更新|环图按|累计盈亏 · 人民币/);
    const rows = nodes(detail).filter(node => node.props?.["data-holding-row"] === "true"); expect(rows).toHaveLength(2);
    for (const row of rows) { expect(visibleText(row)).toContain("未披露"); expect(visibleText(row)).not.toContain("0%"); }
    expect(nodes(detail).filter(node => node.props?.["data-holding-bar"] === "neutral")).toHaveLength(2);
    expect(renderToStaticMarkup(detail)).not.toContain("width:0%");
  });
  it("外部ARK在list和详情摘要仍显示真实资料日期及股票名录说明，不受R1精简影响", () => {
    const data = sources(), ark = data.sources.find(row => row.id === "ark")!;
    ark.holdings = ark.holdings.map(row => ({ ...row, weightPct: null }));
    const h = actualHome({ data, isFetchedAfterMount: true }), article = nodes(h.render()).find(node => node.props?.["data-holding-source"] === "ark");
    expect(article).toBeDefined(); expect(disclosureNodes(article)).toHaveLength(0);
    expect(visibleText(article)).toContain("截至2026年11月18日"); expect(visibleText(article)).toContain("股票名录 · 比例未披露");
    h.open("ark"); const detail = h.render(), main = nodes(detail).find(node => node.type === "main"), children = React.Children.toArray(main.props.children) as React.ReactElement<any>[];
    expect(children[0].type).toBe("section"); expect(children[1].props.role).toBe("tablist"); expect(disclosureNodes(detail)).toHaveLength(0);
    expect(visibleText(children[0])).toContain("资料截至 2026-11-18"); expect(visibleText(children[0])).toContain("股票名录 · 无可绘制比例，灰环不表示零持仓");
  });
  it.each(["ark", "pelosi"])("实际首页打开%s外部详情不挂净值组件或股票池API，返回R1才恢复", id => {
    const h = actualHome(); h.open(id); const raw = h.tree(), entry = nodes(raw).find(node => node.type === h.sourcesApi.Ledger37HoldingSourcesRenderer);
    expect(entry.props.selectedSourceId).toBe(id); expect(entry.props.netValueDisclosure).toBeUndefined();
    const tree = h.render(); expect(disclosureNodes(tree)).toHaveLength(0); expect(h.poolSpy).not.toHaveBeenCalled(); expect(nodes(tree).some(node => node.props?.role === "tablist")).toBe(true);
    h.open("r1"); expect(disclosureNodes(h.render())).toHaveLength(1); expect(h.poolSpy).toHaveBeenCalledOnce();
  });
  it("真实list/detail也各自限制注入ReactNode，外部来源即使收到节点也不得展示", () => {
    const h = hooks(), api = actualModule(sourcesSource, ["Ledger37HoldingSourcesRenderer"], { useState: h.useState });
    const data = sources(), injected = React.createElement(Renderer, { totalPnl: 1.25 });
    const render = (selectedSourceId: string | null, nextData = data) => { h.reset(); return expand(api.Ledger37HoldingSourcesRenderer({ data: nextData, selectedSourceId, netValueDisclosure: injected, onOpen: vi.fn() })); };
    for (const id of ["ark", "pelosi"]) expect(disclosureNodes(render(id))).toHaveLength(0);
    const list = render(null); expect(disclosureNodes(list)).toHaveLength(1); expect(disclosureNodes(nodes(list).find(node => node.props?.["data-holding-source"] === "r1"))).toHaveLength(1);
    expect(disclosureNodes(render(null, { ...data, sources: data.sources.filter(row => row.id !== "r1") }))).toHaveLength(0);
    expect(disclosureNodes(render("r1"))).toHaveLength(1);
  });
  it.each([
    { isFetchedAfterMount: false }, { error: new Error("source denied") }, { identity: 902 }, { aiEnabled: false }, { viewer: 0 },
  ])("实际home首次cache/error/错身份/AI关闭/非法viewer不挂净值子树：%j", patch => {
    const data = sources(); if ("identity" in patch) data.viewerUserId = patch.identity!; if ("aiEnabled" in patch) data.aiEnabled = patch.aiEnabled!;
    const h = actualHome({ data, isFetchedAfterMount: true, isFetching: false, ...patch }); const tree = h.render("viewer" in patch ? patch.viewer : 901);
    expect(disclosureNodes(tree)).toHaveLength(0); expect(h.poolSpy).not.toHaveBeenCalled();
    if ("viewer" in patch) expect(h.sourcesSpy.mock.calls[0][1].enabled).toBe(false);
  });
  it("实际home adminPreview透传而不改flag，同identity有效才展示", () => {
    const sourceData = freeze({ ...sources(), aiEnabled: false }), poolData = freeze(pool(undefined, { aiEnabled: false }));
    const h = actualHome({ data: sourceData, isFetchedAfterMount: true }, { data: poolData, isFetchedAfterMount: true });
    expect(disclosureNodes(h.render())).toHaveLength(0); expect(disclosureNodes(h.render(901, true))).toHaveLength(1); expect(text(pnl(h.render(901, true)))).toBe("+¥12.50");
    expect(sourceData.aiEnabled).toBe(false); expect(poolData.aiEnabled).toBe(false); expect(disclosureNodes(h.render(902, true))).toHaveLength(0);
  });
  it("池披露失败与来源独立：仍保留真实持仓/比例，背景刷新不卸载R1数据", () => {
    const h = actualHome(); h.open("r1"); const before = h.render(); h.sourceQuery.isFetching = true; h.poolQuery.isFetching = true; const during = h.render();
    expect(visibleText(during)).toBe(visibleText(before)); expect(shape(during)).toEqual(shape(before));
    h.poolQuery.error = new Error("P/L unavailable"); const failed = h.render(); unknown(failed, "披露暂不可用");
    expect(renderToStaticMarkup(failed)).toContain("width:12.123456789%"); expect(visibleText(failed)).toContain("我的真实证券"); expect(nodes(failed).filter(node => node.props?.role === "tab")).toHaveLength(3);
    h.sourceQuery.error = new Error("sources unavailable"); expect(disclosureNodes(h.render())).toHaveLength(0);
  });
  it("已结束全部个人持仓仍可由真实仓位变动进入R1披露，不用持股数量代替已参与盈亏", () => {
    const data = sources(), r1 = data.sources.find(row => row.id === "r1")!; r1.holdings = []; r1.memberPortfolio!.holdings = [];
    const h = actualHome({ data, isFetchedAfterMount: true }, { data: pool([stock({ status: "closed", pnlCny: -75.5 })]), isFetchedAfterMount: true });
    expect(disclosureNodes(h.render())).toHaveLength(1); h.open("r1"); const tree = h.render(); expect(text(pnl(tree))).toBe("−¥75.50"); expect(visibleText(tree)).toContain("暂无已分配持仓");
  });
});
