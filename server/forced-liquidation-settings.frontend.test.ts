import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { parsePortfolioInstrument, portfolioDisplaySymbol } from "../shared/portfolio-instruments";

// Execute actual frontend functions with inert hooks/tRPC. No backend imports, DB, HTTP, browser, or writes.
const source = readFileSync(new URL("../client/src/pages/ForcedLiquidationSettings.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../client/src/pages/LedgerSettings.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../client/src/components/StockTagDownsideRulePanel.tsx", import.meta.url), "utf8");
function parse(value: string) { return ts.createSourceFile("actual.tsx", value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
const file = parse(source), settings = parse(settingsSource), panel = parse(panelSource);
function find(file: ts.SourceFile, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(file); return found;
}
function execute(value: string, scope: Record<string, any> = {}, dev = false): any {
  const js = ts.transpileModule(`const actual = ${value.replace(/^export\s+(default\s+)?/, "").replaceAll("import.meta.env.DEV", String(dev))};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function("React", ...Object.keys(scope), `${js}; return actual;`)(React, ...Object.values(scope));
}
function fn(name: string, scope: Record<string, any> = {}, dev = false, target = file): any {
  const found = find(target, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  expect(found).toHaveLength(1); return execute(found[0].getText(target), scope, dev);
}
function expression(name: string, scope: Record<string, any>, target = file): any {
  const found = find(target, node => ts.isVariableDeclaration(node) && node.name.getText(target) === name) as ts.VariableDeclaration[];
  expect(found).toHaveLength(1); return execute(found[0].initializer!.getText(target), scope);
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
function hooks() {
  const state: any[] = []; let index = 0;
  return { state, reset: () => { index = 0; }, useState: (initial: any) => {
    const position = index++;
    if (!(position in state)) state[position] = typeof initial === "function" ? initial() : initial;
    return [state[position], (value: any) => { state[position] = typeof value === "function" ? value(state[position]) : value; }];
  } };
}
const symbols = { ...Object.fromEntries(["AccessNotice", "ForcedLiquidationOwnerGate", "ForcedLiquidationSettingsList", "InlineDetail", "OrdinaryTagDownsideRuleForm", "StockTagDownsideRulePanel", "Button", "Input", "Label", "ChevronDown", "ChevronLeft", "Search"].map(name => [name, name])), Fragment: React.Fragment };
const owner = 28;
const stock = { lotId: 77, eventId: 88, stockName: "苹果", symbol: "AAPL", quantity: 100, remainingQuantity: 80,
  executionPrice: 120, actualTradedAt: "2026-01-01T04:00:00Z", note: "原始批次", currentDownsideRule: null };
const categories = [
  { categoryId: 90250, categoryName: "成长标签", accountingMode: "stock_portfolio", currency: "CNY", ordinaryRule: null,
    stocks: [stock, { ...stock, lotId: 78, eventId: 89, stockName: "腾讯", symbol: "00700.HK", currentDownsideRule: { lotId: 78, version: 3, enabled: true, thresholdPrice: 300, downsidePercent: 10, startDate: "2026-01-01" } }] },
  { categoryId: 90251, categoryName: "现金标签", accountingMode: "manual_balance", currency: "CNY", stocks: [],
    ordinaryRule: { version: 5, enabled: true, thresholdAmount: 1000, downsidePercent: 20, startDate: "2026-01-01" } },
  { categoryId: 90252, categoryName: "未设置", accountingMode: "manual_balance", currency: "CNY", stocks: [], ordinaryRule: null },
];
function readonlyWindow(search = "", stored: string | null = null) {
  return { location: { search }, sessionStorage: { getItem: vi.fn(() => stored) } };
}
const validDate = fn("isValidStockTagDownsideStartDate", {}, false, panel);
const validate = fn("validateOrdinaryTagDownsideDraft", { isValidStockTagDownsideStartDate: validDate });
const access = fn("canAccessForcedLiquidationSettings");
const lifecycle = fn("forcedLiquidationLifecycle");
const sortCategories = fn("sortForcedLiquidationCategories");
const filter = fn("filterForcedLiquidationCategories", { sortForcedLiquidationCategories: sortCategories });
const order = fn("forcedLiquidationStockOrder");
const detailNumber = fn("forcedLiquidationDetailNumber");
const detailDrop = fn("forcedLiquidationDetailDrop");
const ineffectiveNumber = fn("forcedLiquidationIneffectiveNumber");
const stockLabel = fn("forcedLiquidationStockLabel", { parsePortfolioInstrument, portfolioDisplaySymbol });
const positionLabel = fn("forcedLiquidationPositionLabel");
const stockQuantity = fn("forcedLiquidationStockQuantity", { parsePortfolioInstrument });
const resolveSelection = fn("resolveForcedLiquidationSelection");
const click = (node: any) => node.props.onClick({ stopPropagation: vi.fn() });
function listHarness({ viewing = false, allowed = true, list = categories }: { viewing?: boolean; allowed?: boolean; list?: any[] } = {}) {
  const hook = hooks();
  const invalidations: Record<string, any> = {};
  const utils = { ledger: new Proxy({}, { get: (_, name: string) => ({ invalidate: invalidations[name] ??= vi.fn() }) }) };
  const query = { data: { ledgerId: 37, canEdit: allowed, categories: list }, isPending: false, error: null, refetch: vi.fn() };
  const useQuery = vi.fn(() => query);
  const scope = { ...symbols, useState: hook.useState, useLocation: () => ["", vi.fn()],
    isForcedLiquidationReadonlyView: () => viewing, filterForcedLiquidationCategories: filter, forcedLiquidationStockOrder: order, forcedLiquidationLifecycle: lifecycle,
    forcedLiquidationStockLabel: stockLabel, forcedLiquidationPositionLabel: positionLabel, forcedLiquidationStockQuantity: stockQuantity, resolveForcedLiquidationSelection: resolveSelection,
    forcedLiquidationIneffectiveNumber: ineffectiveNumber,
    trpc: { useUtils: () => utils, ledger: { getForcedLiquidationSettings: { useQuery } } } };
  return { hook, invalidations, useQuery, query, render: () => { hook.reset(); return fn("ForcedLiquidationSettingsList", scope)(); } };
}
function ordinaryHarness({ viewing = false, canEdit = true, dev = false, saved = true, pending = false } = {}) {
  const hook = hooks(), mutate = vi.fn(), onClose = vi.fn(), onReload = vi.fn(), onPendingChange = vi.fn();
  const invalidations: Record<string, any> = {};
  const utils = { ledger: new Proxy({}, { get: (_, name: string) => ({ invalidate: invalidations[name] ??= vi.fn() }) }),
    adminGetLedger37DividendAvailability: { get invalidate() { return invalidations.adminGetLedger37DividendAvailability ??= vi.fn(); } } };
  const toast = { success: vi.fn(), error: vi.fn() };
  let callbacks: any;
  const scope = { ...symbols, useState: hook.useState, toast, validateOrdinaryTagDownsideDraft: validate,
    beijingStockTagDownsideDate: () => "2026-11-26", isForcedLiquidationReadonlyView: () => viewing,
    trpc: { useUtils: () => utils, ledger: { setOrdinaryTagDownsideRule: { useMutation: (options: any) => { callbacks = options; return { isPending: pending, mutate }; } } } } };
  const props = { category: { ...categories[1], ordinaryRule: saved ? categories[1].ordinaryRule : null }, canEdit, isViewingAs: viewing, onClose, onReload, onPendingChange };
  return { hook, mutate, toast, onClose, onReload, onPendingChange, invalidations, props, callbacks: () => callbacks,
    render: () => { hook.reset(); return fn("OrdinaryTagDownsideRuleForm", scope, dev)(props); } };
}
const saveButton = (tree: any) => nodes(tree).find(node => node.type === "Button" && text(node).includes("保存"));
const tableRows = (tree: any) => nodes(tree).filter(node => node.type === "tr" && node.props["data-category-id"] !== undefined);
const ineffectiveSpans = (tree: any) => nodes(tree).filter(node => node.type === "span" && node.props["data-ineffective-funds"] !== undefined);
const ineffectiveSpan = (tree: any, key: string) => ineffectiveSpans(tree).find(node => node.props["data-ineffective-funds"] === key);
const rowButton = (tree: any, categoryId: number, lotId?: number) => nodes(tableRows(tree).find(row => row.props["data-category-id"] === categoryId && row.props["data-lot-id"] === lotId)).find(node => node.type === "button");
const openStockCategory = (h: ReturnType<typeof listHarness>, categoryId = 90250) => { click(rowButton(h.render(), categoryId)); return h.render(); };
const openStockLot = (h: ReturnType<typeof listHarness>, categoryId = 90250, lotId = 77) => { openStockCategory(h, categoryId); click(rowButton(h.render(), categoryId, lotId)); return h.render(); };

const savedDetail = {
  ledgerId: 37, categoryId: 90250, lotId: 77, kind: "stock", currency: "USD", initialValue: 120,
  latestValue: 70, latestDate: "2026-11-24", latestSource: "persisted_quote", remainingQuantity: 80,
  rule: { version: 9, enabled: true, threshold: 100, downsidePercent: 20, startDate: "2026-01-01", baselineSource: "owner_threshold", baselineStatus: "ready" },
  status: "ready", notice: null, capitalChange: null, withdraw: null, effectiveFunds: 7520, ineffectiveFunds: 1920,
  fundBasis: "segmented_price_drop", initialToThresholdPercent: 16.66666667, thresholdToLatestPercent: 30,
};
function detailHarness({ data = savedDetail, queryPatch = {}, viewing = false, canEdit = true, liveReadonly = false, selection = { kind: "stock", category: categories[0], stock } }: any = {}) {
  const query = { data, isPending: false, isFetchedAfterMount: true, error: null, refetch: vi.fn(), ...queryPatch };
  const useQuery = vi.fn(() => query);
  const scope = { ...symbols, forcedLiquidationDetailNumber: detailNumber, forcedLiquidationDetailDrop: detailDrop,
    isValidStockTagDownsideStartDate: validDate, beijingStockTagDownsideDate: () => "2026-11-26",
    parsePortfolioInstrument, forcedLiquidationStockQuantity: stockQuantity,
    isForcedLiquidationReadonlyView: () => liveReadonly,
    trpc: { ledger: { getForcedLiquidationSettingDetail: { useQuery } } } };
  return { query, useQuery, render: () => fn("InlineDetail", scope)({ selection, canEdit, isViewingAs: viewing }) };
}
const detailValues = (tree: any) => {
  const values = nodes(tree).filter(node => node.type === "dt" || node.type === "dd");
  return Object.fromEntries(values.filter(node => node.type === "dt").map((node, index) => [text(node), text(values[index * 2 + 1])]));
};

describe("37号集中强平设置：离线前端契约", () => {
  it("App lazy与route存在，设置入口位于保证金管理旁且不静态加载新页", () => {
    expect(appSource).toContain('const ForcedLiquidationSettings = lazy(() => import("./pages/ForcedLiquidationSettings"))');
    expect(appSource).toContain('<Route path="/ledger/:id/forced-liquidation-settings" component={ForcedLiquidationSettings} />');
    expect(settingsSource).not.toContain('from "./ForcedLiquidationSettings"');
    const start = settingsSource.indexOf('label="保证金管理"'), end = settingsSource.indexOf('label="利息管理"', start);
    expect(settingsSource.slice(start, end)).toContain('label="强平设置"');
  });
  it.each(["owner", "admin", "member", "viewer"])("入口userRole=%s只允许实际owner本人，系统管理员无豁免", userRole => {
    const value = (patch: any = {}) => expression("canOpenForcedLiquidationSettings", { ledgerId: 37, user: { id: owner, role: "super_admin" }, ledgerData: { userRole, ownerId: owner }, _urlSearchParams: new URLSearchParams(), window: readonlyWindow(), ...patch }, settings);
    expect(value()).toBe(userRole === "owner");
    expect(value({ user: { id: 901, role: "super_admin" } })).toBe(false);
    expect(value({ ledgerId: 52 })).toBe(false);
    expect(value({ user: null })).toBe(false);
    expect(value({ _urlSearchParams: new URLSearchParams("viewAs="), window: readonlyWindow("?viewAs=") })).toBe(false);
    expect(value({ window: readonlyWindow("", "901") })).toBe(false);
  });
  it.each(["?viewAs=901", `?viewAs=${owner}`, "?viewAs=", "?viewAs=bad", "?viewAs=0", "?readonly=true", "?readonly=1"])("URL%s拒绝列表读取与写入", search => {
    expect(fn("isForcedLiquidationReadonlyView", { window: readonlyWindow(search) })()).toBe(true);
  });
  it.each(["", "0", "bad", String(owner)])("session代看%s同样拒绝，SSR/存储错误fail-closed", stored => {
    expect(fn("isForcedLiquidationReadonlyView", { window: readonlyWindow("", stored) })()).toBe(true);
    expect(fn("isForcedLiquidationReadonlyView", { window: undefined })()).toBe(true);
    expect(fn("isForcedLiquidationReadonlyView", { window: { location: { search: "" }, sessionStorage: { getItem: () => { throw new Error("blocked"); } } } })()).toBe(true);
  });
  it("真正owner且role=owner才能挂列表；加载/错误/旧缓存/错账本/伪owner均不挂", () => {
    const render = (patch: any = {}) => {
      const query = { data: { id: 37, ownerId: owner, userRole: "owner" }, isPending: false, isFetchedAfterMount: true, error: null, ...patch };
      return fn("ForcedLiquidationOwnerGate", { ...symbols, isForcedLiquidationReadonlyView: () => false,
        canAccessForcedLiquidationSettings: access, trpc: { ledger: { getById: { useQuery: () => query } } } })({ ledgerId: 37, userId: owner });
    };
    expect(render().type).toBe("ForcedLiquidationSettingsList");
    for (const patch of [{ isPending: true }, { isFetchedAfterMount: false }, { error: new Error("expired") }, { data: undefined },
      { data: { id: 52, ownerId: owner, userRole: "owner" } }, { data: { id: 37, ownerId: 901, userRole: "owner" } }, { data: { id: 37, ownerId: owner, userRole: "admin" } }]) {
      expect(render(patch).type).toBe("AccessNotice");
    }
  });
  it("auth.me新鲜身份核验前不挂owner门控；代看不挂门控；actor切换重挂", () => {
    const scope: any = { ...symbols, useParams: () => ({ id: "37" }), useSearch: () => "", isForcedLiquidationReadonlyView: () => false,
      window: readonlyWindow(), trpc: { auth: { me: { useQuery: () => ({ data: { id: owner }, isPending: false, isFetchedAfterMount: true }) } } } };
    const page = fn("ForcedLiquidationSettings", scope);
    const initial = page(); expect(initial.type).toBe("ForcedLiquidationOwnerGate");
    scope.trpc.auth.me.useQuery = () => ({ data: { id: 901 }, isPending: false, isFetchedAfterMount: true });
    expect(fn("ForcedLiquidationSettings", scope)().key).not.toBe(initial.key);
    scope.trpc.auth.me.useQuery = () => ({ data: { id: owner }, isPending: false, isFetchedAfterMount: false });
    expect(fn("ForcedLiquidationSettings", scope)().type).toBe("AccessNotice");
    scope.isForcedLiquidationReadonlyView = () => true;
    expect(fn("ForcedLiquidationSettings", scope)().type).toBe("AccessNotice");
  });
  it("全部条目同一张真实三列表格、无details/summary/分离卡片，首页直接明确每行强平开关", () => {
    const h = listHarness(), tree = h.render();
    expect(h.useQuery).toHaveBeenCalledTimes(1);
    expect(h.useQuery).toHaveBeenCalledWith({ ledgerId: 37 }, expect.objectContaining({ enabled: true, refetchOnWindowFocus: false }));
    expect(nodes(tree).filter(node => node.type === "table")).toHaveLength(1);
    expect(nodes(tree).filter(node => node.type === "th").map(text)).toEqual(["标签 / 股票", "强平", "状态"]);
    expect(nodes(tree).filter(node => ["details", "summary"].includes(node.type))).toHaveLength(0);
    const tagNames = find(file, node => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)).map(node => (node as ts.JsxOpeningElement).tagName.getText(file));
    expect(tagNames.filter(name => name === "table")).toHaveLength(1);
    expect(tagNames).not.toContain("details"); expect(tagNames).not.toContain("summary");
    const rows = tableRows(tree); expect(rows).toHaveLength(3);
    expect(rows.map(row => nodes(row).filter(node => node.type === "td").map(text))).toEqual([
      ["成长标签", "已开启强平—已开启 1/2", "进行中"],
      ["现金标签", "已开启强平—", "进行中"], ["未设置", "未开启强平", "进行中"],
    ]);
    expect(rowButton(tree, 90250).props.title).toBe("成长标签");
    expect(rows.every(row => row.props["data-lot-id"] === undefined)).toBe(true);
    expect(nodes(tree).find(node => node.type === "div").props.className).toContain("max-w-[480px]");
    expect(nodes(tree).find(node => node.type === "table").props.className).toContain("table-fixed");
    expect(nodes(tree).filter(node => node.type === "StockTagDownsideRulePanel")).toHaveLength(0);
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0);
    expect(source).not.toMatch(/\b(?:Dialog|DialogContent|DialogTitle|DialogDescription|Portal)\b/);
    expect(nodes(tree).filter(node => node.type === "tr" && node.props["data-inline-detail"])).toHaveLength(0);
    const names = (find(file, node => ts.isCallExpression(node) && node.expression.getText(file).endsWith(".useQuery")) as ts.CallExpression[]).map(node => node.expression.getText(file));
    expect(names).toEqual(["trpc.auth.me.useQuery", "trpc.ledger.getById.useQuery", "trpc.ledger.getForcedLiquidationSettings.useQuery", "trpc.ledger.getForcedLiquidationSettingDetail.useQuery"]);
    const denied = listHarness({ viewing: true }); expect(denied.render().type).toBe("AccessNotice");
    expect(denied.useQuery).toHaveBeenCalledWith({ ledgerId: 37 }, expect.objectContaining({ enabled: false }));
    expect(tableRows(listHarness({ allowed: false }).render())).toHaveLength(0);
  });
  it.each([[0, "0.00"], [12345.678, "12,345.68"], [12.5, "12.50"], [-1234.5, "-1,234.50"],
    [undefined, "—"], [null, "—"], [NaN, "—"], [Infinity, "—"], [-Infinity, "—"], [false, "—"], ["123", "—"]])("列表无效金额%s只格式化真实有限数字为%s，不伪造zero", (value, expected) => {
    expect(ineffectiveNumber(value)).toBe(expected);
  });
  it("开启category/lot金额在开启文字下方，仅数字无标题无单位，开启计数在金额后；真实zero正常", () => {
    const list = [
      { ...categories[0], ineffectiveFunds: 9876.54, ineffectiveCurrency: "HKD", stocks: [
        { ...stock, ineffectiveFunds: 999, ineffectiveCurrency: "USD" },
        { ...categories[0].stocks[1], ineffectiveFunds: 42.5, ineffectiveCurrency: "HKD" },
      ] },
      { ...categories[1], ineffectiveFunds: 0, ineffectiveCurrency: "CNY" },
      { ...categories[2], ineffectiveFunds: 1234, ineffectiveCurrency: "CNY" },
    ];
    const h = listHarness({ list }); let tree = h.render();
    expect(ineffectiveSpans(tree).map(node => [node.props["data-ineffective-funds"], text(node)])).toEqual([
      ["90250:tag", "9,876.54"], ["90251:tag", "0.00"],
    ]);
    expect(nodes(tableRows(tree)[0]).filter(node => node.type === "td")[1].props.children.filter(Boolean).map(text)).toEqual(["已开启强平", "9,876.54", "已开启 1/2"]);
    tree = openStockCategory(h);
    expect(ineffectiveSpans(tree).map(node => [node.props["data-ineffective-funds"], text(node)])).toEqual([
      ["90250:tag", "9,876.54"], ["90250:78", "42.50"], ["90251:tag", "0.00"],
    ]);
    const lotCell = nodes(tableRows(tree).find(row => row.props["data-lot-id"] === 78)).filter(node => node.type === "td")[1];
    expect(lotCell.props.children.filter(Boolean).map(text)).toEqual(["已开启强平", "42.50"]);
    for (const span of ineffectiveSpans(tree)) {
      expect(span.props.className).toContain("block"); expect(span.props.className).toContain("tabular-nums");
      expect(text(span)).toMatch(/^-?[\d,]+\.\d{2}$/); expect(text(span)).not.toMatch(/无效|金额|CNY|HKD|USD|元|¥/);
      expect(span.props).not.toHaveProperty("onClick"); expect(span.props).not.toHaveProperty("onKeyDown");
      expect(renderToStaticMarkup(span)).toContain(`>${text(span)}</span>`);
    }
    expect(ineffectiveSpan(tree, "90250:tag").props.title).toBe("无效金额 · HKD");
    expect(ineffectiveSpan(tree, "90251:tag").props.title).toBe("无效金额 · CNY");
    expect(ineffectiveSpan(tree, "90250:77")).toBeUndefined(); expect(ineffectiveSpan(tree, "90252:tag")).toBeUndefined();
    expect(nodes(tree).filter(node => ["InlineDetail", "StockTagDownsideRulePanel"].includes(node.type))).toHaveLength(0);
    expect(nodes(tree).filter(node => node.type === "table")).toHaveLength(1);
    // The passive number span leaves the existing bubbling row click and unique second level intact.
    tableRows(tree).find(row => row.props["data-lot-id"] === 78).props.onClick(); tree = h.render();
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(1);
    expect(nodes(tree).find(node => node.type === "StockTagDownsideRulePanel").props.order.lotId).toBe(78);
  });
  it("开启stock category、真实lot和ordinary金额zero都显示0.00而不是—", () => {
    const list = [
      { ...categories[0], ineffectiveFunds: 0, stocks: [{ ...categories[0].stocks[1], ineffectiveFunds: 0 }] },
      { ...categories[1], ineffectiveFunds: 0 },
    ];
    const tree = openStockCategory(listHarness({ list }));
    expect(ineffectiveSpans(tree).map(node => [node.props["data-ineffective-funds"], text(node)])).toEqual([
      ["90250:tag", "0.00"], ["90250:78", "0.00"], ["90251:tag", "0.00"],
    ]);
  });
  it.each([undefined, null, NaN, Infinity, -Infinity])("开启category/lot缺失或异常DTO %s显示—，不套门槛/数量/价格造数字", value => {
    const list = [
      { ...categories[0], ineffectiveFunds: value, stocks: [{ ...categories[0].stocks[1], ineffectiveFunds: value }] },
      { ...categories[1], ineffectiveFunds: value },
    ];
    const h = listHarness({ list }), tree = openStockCategory(h);
    expect(ineffectiveSpans(tree).map(node => [node.props["data-ineffective-funds"], text(node)])).toEqual([
      ["90250:tag", "—"], ["90250:78", "—"], ["90251:tag", "—"],
    ]);
    for (const span of ineffectiveSpans(tree)) {
      expect(span.props.title).toBe("无效金额待核验"); expect(renderToStaticMarkup(span)).toContain(">—</span>");
      expect(text(span)).not.toMatch(/0|NaN|Infinity/);
    }
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0);
  });
  it.each([0, 1234.5, undefined, null, NaN, Infinity])("未开启category/lot即使DTO有金额%s也无numericspan或—", ineffectiveFunds => {
    const list = [
      { ...categories[0], ineffectiveFunds, stocks: [
        { ...stock, ineffectiveFunds },
        { ...stock, lotId: 78, ineffectiveFunds, currentDownsideRule: { ...categories[0].stocks[1].currentDownsideRule, enabled: false } },
      ] },
      { ...categories[1], ineffectiveFunds, ordinaryRule: { ...categories[1].ordinaryRule, enabled: false } },
    ];
    const tree = openStockCategory(listHarness({ list }));
    expect(ineffectiveSpans(tree)).toHaveLength(0);
    const cells = tableRows(tree).map(row => nodes(row).filter(node => node.type === "td")[1]);
    expect(cells.map(text)).toEqual(["未开启强平已开启 0/2", "未开启强平", "未开启强平", "未开启强平"]);
    expect(cells.map(text).join("")).not.toContain("—");
  });
  it("父行summary读取完整query category DTO，search/only-enabled只改变可见lot，不以subset累加", () => {
    const list = [{ ...categories[0], ineffectiveFunds: 4567.89, ineffectiveCurrency: "CNY", stocks: [
      { ...categories[0].stocks[1], lotId: 78, stockName: "第一笔", symbol: "600519.SH", ineffectiveFunds: 100, ineffectiveCurrency: "CNY" },
      { ...categories[0].stocks[1], lotId: 79, stockName: "第二笔", symbol: "600519.SH", ineffectiveFunds: 200, ineffectiveCurrency: "CNY" },
      { ...stock, lotId: 80, stockName: "第三笔", ineffectiveFunds: 999, ineffectiveCurrency: "CNY" },
    ] }];
    const h = listHarness({ list }); let tree = openStockCategory(h);
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: "第一笔" } }); tree = h.render();
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined, 78]);
    expect(text(ineffectiveSpan(tree, "90250:tag"))).toBe("4,567.89"); expect(text(ineffectiveSpan(tree, "90250:78"))).toBe("100.00");
    expect(text(tableRows(tree)[0])).toContain("已开启强平4,567.89已开启 2/3");
    click(nodes(tree).find(node => node.props["aria-label"] === "只看开启强平")); tree = h.render();
    expect(text(ineffectiveSpan(tree, "90250:tag"))).toBe("4,567.89");
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: "" } }); tree = h.render();
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined, 78, 79]);
    expect(ineffectiveSpans(tree).map(text)).toEqual(["4,567.89", "100.00", "200.00"]);
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0); expect(h.query.refetch).not.toHaveBeenCalled();
    // Explicit AST contract prevents a later filtered-category or client-side sum replacement.
    const fullCategory = { ineffectiveFunds: 4567.89 }, category = { ineffectiveFunds: 100 };
    expect(expression("summaryCategory", { isStock: true, fullCategory, category })).toBe(fullCategory);
    expect(expression("summaryCategory", { isStock: false, fullCategory, category })).toBe(category);
    expect(expression("categoryIneffectiveNumber", { summaryCategory: fullCategory, forcedLiquidationIneffectiveNumber: ineffectiveNumber })).toBe("4,567.89");
    expect(expression("lotIneffectiveNumber", { stock: { ineffectiveFunds: 200 }, forcedLiquidationIneffectiveNumber: ineffectiveNumber })).toBe("200.00");
  });
  it("同币/跨币证据就绪仅由后端summary决定；缺summary不从有效lot补sum或FX估算，币种只在tooltip", () => {
    const lots = [
      { ...categories[0].stocks[1], lotId: 78, ineffectiveFunds: 100, ineffectiveCurrency: "USD" },
      { ...categories[0].stocks[1], lotId: 79, ineffectiveFunds: 200, ineffectiveCurrency: "HKD" },
    ];
    for (const list of [
      [{ ...categories[0], ineffectiveFunds: null, stocks: lots }],
      [{ ...categories[0], stocks: lots.map(lot => ({ ...lot, ineffectiveCurrency: "CNY" })) }],
    ]) {
      const tree = openStockCategory(listHarness({ list }));
      expect(ineffectiveSpans(tree).map(text)).toEqual(["—", "100.00", "200.00"]);
      expect(text(ineffectiveSpan(tree, "90250:tag"))).not.toBe("300.00");
      expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0);
    }
    const fields = find(file, node => ts.isPropertySignature(node) && ["ineffectiveFunds", "ineffectiveCurrency"].includes(node.name.getText(file))) as ts.PropertySignature[];
    expect(fields.map(node => node.getText(file))).toEqual(["ineffectiveFunds?: number | null;", "ineffectiveCurrency?: string;", "ineffectiveFunds?: number | null;", "ineffectiveCurrency?: string;"]);
    const numberFn = find(file, node => ts.isFunctionDeclaration(node) && node.name?.text === "forcedLiquidationIneffectiveNumber")[0];
    expect(find(parse(numberFn.getText(file)), node => ts.isCallExpression(node) && node.expression.getText().endsWith(".useQuery"))).toHaveLength(0);
  });
  it("全局生命周期active在前，paused/ended共同稳定沉底异色，不从关闭规则、成员暂停或空仓推断", () => {
    const list = [
      { ...categories[1], categoryId: 1, lifecycleStatus: "ended", lifecycleDate: "2026-11-20" },
      { ...categories[2], categoryId: 2, lifecycleStatus: "active" },
      { ...categories[1], categoryId: 3, lifecycleStatus: "paused", lifecycleDate: "2026-11-21" },
      { ...categories[2], categoryId: 4, memberPaused: true },
      { ...categories[1], categoryId: 5, lifecycleStatus: "ended" },
      { ...categories[0], categoryId: 6, categoryName: "新建空标签", stocks: [] },
      { ...categories[2], categoryId: 7, lifecycleStatus: "paused" },
    ];
    const original = list.map(c => c.categoryId);
    expect(sortCategories(list).map((c: any) => c.categoryId)).toEqual([2, 4, 6, 1, 3, 5, 7]);
    expect(list.map(c => c.categoryId)).toEqual(original);
    expect(filter(list, "", false).map((c: any) => c.categoryId)).toEqual([2, 4, 6, 1, 3, 5, 7]);
    expect(filter(list, "", true).map((c: any) => c.categoryId)).toEqual([1, 3, 5]);
    const h = listHarness({ list }), tree = h.render(), rows = tableRows(tree);
    expect(rows.map(row => row.props["data-lifecycle-status"])).toEqual(["active", "active", "active", "ended", "paused", "ended", "paused"]);
    expect(rows.slice(0, 3).every(row => row.props.className.includes("bg-white"))).toBe(true);
    expect(rows[3].props.className).toContain("bg-[#E8EDF4]"); expect(rows[4].props.className).toContain("bg-gray-100");
    expect(rows[3].props.className).not.toEqual(rows[4].props.className);
    expect(text(rows[3])).toContain("已开启强平—已结束"); expect(text(rows[4])).toContain("已开启强平—已暂停");
    expect(text(rows[6])).toContain("未开启强平已暂停");
    expect(nodes(rows[4]).filter(node => node.type === "td")[2].props.title).toBe("已暂停 · 2026-11-21");
    expect(lifecycle(list[5]).label).toBe("进行中"); expect(lifecycle(list[3]).label).toBe("进行中");
    click(rowButton(tree, 3));
    expect(nodes(h.render()).find(node => node.type === "OrdinaryTagDownsideRuleForm").props.category.categoryId).toBe(3);
  });
  it("股票仅真实活跃批次逐行，空stock标签一行暂无持仓/未开启/进行中，不制造lot编辑", () => {
    const list = [{ ...categories[0], stocks: [stock, { ...stock, lotId: 99, remainingQuantity: 0 }, { ...stock, lotId: 100, remainingQuantity: -1 }] },
      { ...categories[0], categoryId: 10, categoryName: "新建空标签", stocks: [] }];
    expect(filter(list, "", false)[0].stocks.map((s: any) => s.lotId)).toEqual([77]);
    const h = listHarness({ list }); let tree = h.render();
    expect(tableRows(tree)).toHaveLength(2);
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined, undefined]);
    expect(text(tableRows(tree)[1])).toBe("新建空标签暂无持仓未开启强平已开启 0/0进行中");
    const emptyButton = rowButton(tree, 10); expect(emptyButton.props.disabled).toBe(true);
    click(emptyButton); tableRows(tree)[1].props.onClick(); tree = h.render();
    expect(nodes(tree).filter(node => ["StockTagDownsideRulePanel", "OrdinaryTagDownsideRuleForm"].includes(node.type))).toHaveLength(0);
    tree = openStockCategory(h);
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined, 77, undefined]);
    expect(nodes(tree).filter(node => ["InlineDetail", "StockTagDownsideRulePanel"].includes(node.type))).toHaveLength(0);
    expect(filter(list, "新建空", true)).toEqual([]);
  });
  it("搜索标签名/股票名/代码以及已启用筛选只过滤本地列表", () => {
    expect(filter(categories, "成长", false)[0].stocks).toHaveLength(2);
    expect(filter(categories, "苹果", false)[0].stocks.map((s: any) => s.lotId)).toEqual([77]);
    expect(filter(categories, " aapl ", false)[0].stocks.map((s: any) => s.lotId)).toEqual([77]);
    expect(filter(categories, "现金", false).map((c: any) => c.categoryId)).toEqual([90251]);
    expect(filter(categories, "", true).map((c: any) => c.categoryId)).toEqual([90250, 90251]);
    expect(filter(categories, "", true)[0].stocks.map((s: any) => s.lotId)).toEqual([78]);
    expect(filter(categories, "missing", false)).toEqual([]);
    const h = listHarness(); let tree = h.render();
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: " aapl " } }); tree = h.render();
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined]);
    tree = openStockCategory(h);
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined, 77]);
    expect(text(tableRows(tree)[0])).toContain("已开启强平—已开启 1/2");
    nodes(tree).find(node => node.type === "Button" && node.props["aria-label"] === "只看开启强平").props.onClick(); tree = h.render();
    expect(tableRows(tree)).toHaveLength(0); expect(text(tree)).toContain("没有匹配的标签或股票");
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: "" } }); tree = h.render();
    expect(tableRows(tree).map(row => row.props["data-category-id"])).toEqual([90250, 90250, 90251]);
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined, 78, undefined]);
    expect(text(tableRows(tree)[0])).toContain("已开启 1/2");
    expect(nodes(tree).find(node => node.type === "Button" && node.props["aria-label"] === "只看开启强平").props["aria-pressed"]).toBe(true);
    expect(h.query.refetch).not.toHaveBeenCalled(); expect(Object.keys(h.invalidations)).toEqual([]);
  });
  it("整行与键盘button展开，独立tr/colSpan=3并Fragment key；仅一个原面板和lazy详情，上展示下设置", () => {
    const h = listHarness(); let tree = h.render();
    const button = rowButton(tree, 90250);
    expect(button.type).toBe("button"); expect(button.props.type).toBe("button"); expect(button.props.disabled).toBe(false);
    expect(button.props["aria-expanded"]).toBe(false);
    tableRows(tree)[0].props.onClick(); tree = h.render();
    expect(nodes(tree).filter(node => ["InlineDetail", "StockTagDownsideRulePanel"].includes(node.type))).toHaveLength(0);
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined, 77, 78, undefined, undefined]);
    expect(rowButton(tree, 90250).props["aria-expanded"]).toBe(true);
    expect(rowButton(tree, 90250).props["aria-controls"]).toBe(tableRows(tree)[1].props.id);
    click(rowButton(tree, 90250, 77)); tree = h.render();
    let panels = nodes(tree).filter(node => node.type === "StockTagDownsideRulePanel"); expect(panels).toHaveLength(1);
    expect(panels[0].props).toMatchObject({ categoryId: 90250, order: { lotId: 77, eventId: 88, quantity: 100, executionPrice: 120 }, canEdit: true, isViewingAs: false, hideValuationSummary: true });
    expect(text(nodes(tree).find(node => node.type === "h2"))).toBe("成长标签 · AAPL · 批次 #77 · 80股");
    for (const name of ["currentMarketPrice", "currentCountedPrice", "onPreviewDownsideChange", "previewDownsideRule"]) expect(panels[0].props).not.toHaveProperty(name);
    expect(panels[0].props.order).not.toHaveProperty("marketPrice");
    expect(panelSource).toContain("mutation.mutate({ ledgerId: 37, categoryId, lotId: order.lotId, ...values })");
    const inlineRow = nodes(tree).find(node => node.type === "tr" && node.props["data-inline-detail"]);
    expect(nodes(inlineRow).filter(node => node.type === "td")).toHaveLength(1);
    expect(nodes(inlineRow).find(node => node.type === "td").props.colSpan).toBe(3);
    const section = nodes(inlineRow).find(node => node.type === "section");
    expect(rowButton(tree, 90250, 77).props["aria-expanded"]).toBe(true);
    expect(rowButton(tree, 90250, 77).props["aria-controls"]).toBe(section.props.id);
    const tbodyChildren = nodes(tree).find(node => node.type === "tbody").props.children;
    expect(tbodyChildren[0].type).toBe(React.Fragment); expect(tbodyChildren[0].key).toBe("90250:tag");
    const lotFragment = nodes(tree).find(node => node.type === React.Fragment && node.key === "90250:77");
    expect(lotFragment.props.children[0].type).toBe("tr"); expect(lotFragment.props.children[1]).toBe(inlineRow);
    expect(inlineRow.props["data-inline-detail"]).toBe("90250:77");
    expect(nodes(section).filter(node => ["InlineDetail", "h3", "StockTagDownsideRulePanel"].includes(node.type)).map(node => node.type)).toEqual(["InlineDetail", "h3", "StockTagDownsideRulePanel"]);
    expect(text(nodes(section).find(node => node.type === "h3"))).toBe("设置内容");
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(1);
    expect(nodes(tree).find(node => node.type === "InlineDetail").props.selection.stock.lotId).toBe(77);
    expect(nodes(tableRows(tree)[0]).find(node => node.type === "ChevronDown").props.className).toContain("rotate-180");
    const stopPropagation = vi.fn(); rowButton(tree, 90250, 77).props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce(); tree = h.render();
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0);
    expect(rowButton(tree, 90250).props["aria-expanded"]).toBe(true);
    click(rowButton(tree, 90250, 78)); tree = h.render();
    panels = nodes(tree).filter(node => node.type === "StockTagDownsideRulePanel"); expect(panels).toHaveLength(1); expect(panels[0].props.order.lotId).toBe(78);
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(1);
    expect(nodes(tree).filter(node => node.type === "tr" && node.props["data-inline-detail"])).toHaveLength(1);
    panels[0].props.onClose(); expect(nodes(h.render()).filter(node => node.type === "StockTagDownsideRulePanel")).toHaveLength(0);
    expect(rowButton(h.render(), 90250).props["aria-expanded"]).toBe(true);
    expect(tableRows(h.render()).map(row => row.props["data-lot-id"])).toEqual([undefined, 77, 78, undefined, undefined]);
    expect(h.invalidations.getForcedLiquidationSettings).toHaveBeenCalledWith({ ledgerId: 37 });
    expect(h.invalidations.getForcedLiquidationSettingDetail).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, lotId: 78 });
  });
  it("普通保存pending不收起、不切换、禁search/filter且直接回调也不隐藏表单", () => {
    const h = listHarness(); let tree = h.render();
    click(rowButton(tree, 90251)); tree = h.render();
    expect(nodes(tree).filter(node => node.type === "StockTagDownsideRulePanel")).toHaveLength(0);
    const form = nodes(tree).find(node => node.type === "OrdinaryTagDownsideRuleForm"); expect(form.props.category.categoryId).toBe(90251);
    form.props.onPendingChange(true); tree = h.render();
    const searchInput = nodes(tree).find(node => node.type === "Input"), filterButton = nodes(tree).find(node => node.props["aria-label"] === "只看开启强平");
    expect(searchInput.props.disabled).toBe(true); expect(filterButton.props.disabled).toBe(true);
    searchInput.props.onChange({ target: { value: "不匹配搜索" } }); filterButton.props.onClick();
    click(rowButton(tree, 90251)); tableRows(tree).find(row => row.props["data-category-id"] === 90251).props.onClick();
    expect(rowButton(tree, 90250).props.disabled).toBe(true); click(rowButton(tree, 90250));
    expect(nodes(h.render()).filter(node => node.type === "OrdinaryTagDownsideRuleForm")).toHaveLength(1);
    expect(nodes(h.render()).filter(node => node.type === "StockTagDownsideRulePanel")).toHaveLength(0);
    expect(nodes(h.render()).filter(node => node.type === "InlineDetail")).toHaveLength(1);
    expect(tableRows(h.render())).toHaveLength(3);
    expect(nodes(h.render()).find(node => node.type === "Input").props.value).toBe("");
    expect(nodes(h.render()).find(node => node.props["aria-label"] === "只看开启强平").props["aria-pressed"]).toBe(false);
    expect(Object.keys(h.invalidations)).toEqual([]);
    form.props.onPendingChange(false); tree = h.render();
    click(rowButton(tree, 90251));
    expect(nodes(h.render()).filter(node => node.type === "OrdinaryTagDownsideRuleForm")).toHaveLength(0);
  });
  it("股票保存中不能关闭或切换batch，原单mounted面板保持同一lot", () => {
    const h = listHarness(); let tree = openStockLot(h);
    const originalPanel = nodes(tree).find(node => node.type === "StockTagDownsideRulePanel"); originalPanel.props.onPendingChange(true); tree = h.render();
    tableRows(tree)[0].props.onClick(); click(rowButton(tree, 90250)); click(rowButton(tree, 90250, 77));
    expect(rowButton(tree, 90250).props.disabled).toBe(true);
    const searchInput = nodes(tree).find(node => node.type === "Input"), filterButton = nodes(tree).find(node => node.props["aria-label"] === "只看开启强平");
    expect(searchInput.props.disabled).toBe(true); expect(filterButton.props.disabled).toBe(true);
    searchInput.props.onChange({ target: { value: "bad" } }); click(filterButton);
    click(rowButton(tree, 90250, 78)); click(rowButton(tree, 90251)); tree = h.render();
    const panels = nodes(tree).filter(node => node.type === "StockTagDownsideRulePanel"); expect(panels).toHaveLength(1);
    expect(panels[0].props.order.lotId).toBe(77); expect(panels[0].key).toBe(originalPanel.key);
    expect(nodes(tree).filter(node => node.type === "OrdinaryTagDownsideRuleForm")).toHaveLength(0);
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(1);
    expect(Object.keys(h.invalidations)).toEqual([]);
    // A confirmed stock success is allowed to close before its pending effect clears.
    panels[0].props.onClose(); tree = h.render();
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0);
    expect(rowButton(tree, 90250).props["aria-expanded"]).toBe(true);
    expect(h.invalidations.getForcedLiquidationSettingDetail).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, lotId: 77 });
  });
  it("关闭股票一级清空二级，切其他股票或普通标签也同步且仅一表单", () => {
    const h = listHarness({ list: [...categories, { ...categories[0], categoryId: 40, categoryName: "阿姨" }] });
    let tree = openStockLot(h);
    click(rowButton(tree, 90250)); tree = h.render();
    expect(tableRows(tree).every(row => row.props["data-lot-id"] === undefined)).toBe(true);
    expect(nodes(tree).filter(node => ["InlineDetail", "StockTagDownsideRulePanel"].includes(node.type))).toHaveLength(0);
    tree = openStockCategory(h);
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0);
    click(rowButton(tree, 90250, 77)); tree = h.render();
    click(rowButton(tree, 40)); tree = h.render();
    expect(rowButton(tree, 90250).props["aria-expanded"]).toBe(false);
    expect(rowButton(tree, 40).props["aria-expanded"]).toBe(true);
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0);
    click(rowButton(tree, 40, 78)); tree = h.render();
    click(rowButton(tree, 90251)); tree = h.render();
    expect(tableRows(tree).every(row => row.props["data-lot-id"] === undefined)).toBe(true);
    expect(nodes(tree).filter(node => node.type === "StockTagDownsideRulePanel")).toHaveLength(0);
    expect(nodes(tree).filter(node => node.type === "OrdinaryTagDownsideRuleForm")).toHaveLength(1);
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(1);
  });
  it("A股所有可见名称/title/aria仅中文不代码，US ticker与Crypto使用真实共享标识；底层订单symbol不丢", () => {
    const lots = [
      { ...stock, symbol: "600519.SH", stockName: "贵州茅台", positionNumber: "01" },
      { ...stock, lotId: 78, symbol: "000001.SZ", stockName: "", positionNumber: "02" },
      { ...stock, lotId: 79, symbol: "430047.BJ", stockName: "430047.BJ", positionNumber: "03" },
      { ...stock, lotId: 80, symbol: "AAPL", stockName: "苹果", positionNumber: "04" },
      { ...stock, lotId: 81, symbol: "CRYPTO:BTC-USDT", stockName: "比特币", remainingQuantity: 0.12345678, positionNumber: "05" },
    ];
    const h = listHarness({ list: [{ ...categories[0], categoryName: "阿姨", stocks: lots }] });
    let tree = openStockCategory(h);
    expect(stockLabel({ ...lots[0], stockName: "贵州茅台 600519.SH" })).toBe("贵州茅台");
    expect(stockLabel({ ...lots[0], stockName: "600519" })).toBe("名称待核验");
    expect(stockLabel({ ...lots[0], stockName: "MOUTAI" })).toBe("名称待核验");
    for (const lot of lots.slice(0, 3)) {
      const button = rowButton(tree, 90250, lot.lotId);
      expect(text(button)).toContain(lot.lotId === 77 ? "贵州茅台" : "名称待核验");
      for (const value of [text(button), button.props.title, button.props["aria-label"]]) expect(value).not.toMatch(/600519|000001|430047|\.SH|\.SZ|\.BJ/);
      click(button); tree = h.render();
      expect(text(nodes(tree).find(node => node.type === "h2"))).not.toMatch(/600519|000001|430047|\.SH|\.SZ|\.BJ/);
      expect(nodes(tree).find(node => node.type === "section").props["aria-label"]).not.toMatch(/600519|000001|430047/);
      expect(nodes(tree).find(node => node.type === "StockTagDownsideRulePanel").props.order.symbol).toBe(lot.symbol);
    }
    expect(text(rowButton(tree, 90250, 80))).toContain("AAPL · 持仓 04");
    expect(text(rowButton(tree, 90250, 80))).not.toContain("苹果");
    expect(text(rowButton(tree, 90250, 81))).toContain("BTC/USDT · 持仓 05");
    expect(text(rowButton(tree, 90250, 81))).toContain("0.12345678币");
    expect(text(rowButton(tree, 90250, 81))).not.toContain("CRYPTO:");
    const crypto = detailValues(detailHarness({ data: { ...savedDetail, lotId: 81, remainingQuantity: 0.00000001, currency: "USDT" }, selection: { kind: "stock", category: categories[0], stock: lots[4] } }).render());
    expect(crypto["剩余币数"]).toBe("0.00000001币"); expect(crypto).not.toHaveProperty("剩余股数");
    expect(stockQuantity({ ...lots[4], remainingQuantity: 0 })).toBe("0币");
    expect(stockQuantity(lots[4], NaN)).toBe("待核验");
    expect(source).toContain('import { parsePortfolioInstrument, portfolioDisplaySymbol } from "@shared/portfolio-instruments"');
  });
  it("一级紧凑显示真实备注，二级完整换行break-words纯文本，不注入HTML不伪造备注", () => {
    const note = '妈妈第一笔\n<script>alert("x")</script><img src=x onerror=alert(1)>\n' + "长备注".repeat(50);
    const h = listHarness({ list: [{ ...categories[0], stocks: [{ ...stock, note }, { ...stock, lotId: 78, note: "" }] }] });
    let tree = openStockCategory(h);
    const shortNote = nodes(rowButton(tree, 90250, 77)).find(node => node.type === "span" && text(node) === note);
    expect(shortNote.props.className).toContain("truncate"); expect(shortNote.props.children).toBe(note);
    click(rowButton(tree, 90250, 77)); tree = h.render();
    const fullNote = nodes(tree).find(node => node.props["aria-label"] === "持仓备注");
    expect(fullNote.props.children).toBe(note);
    expect(fullNote.props.className).toContain("break-words"); expect(fullNote.props.className).toContain("whitespace-pre-wrap");
    expect(nodes(tree).filter(node => ["script", "img"].includes(node.type))).toHaveLength(0);
    expect(source).not.toContain("dangerouslySetInnerHTML");
    click(rowButton(tree, 90250, 78)); tree = h.render();
    expect(text(nodes(tree).find(node => node.props["aria-label"] === "持仓备注"))).toBe("无备注");
  });
  it("同中文股票不同lot保持后台positionNumber，代码搜索与开启组合筛选都不重新编号或误计total", () => {
    const lots = [
      { ...stock, lotId: 9, symbol: "600519.SH", stockName: "贵州茅台", positionNumber: "01", note: "第一笔" },
      { ...stock, lotId: 2, symbol: "600519.SH", stockName: "贵州茅台", positionNumber: "02", note: "第二笔", currentDownsideRule: { ...categories[0].stocks[1].currentDownsideRule, lotId: 2 } },
      { ...stock, lotId: 103, symbol: "600519.SH", stockName: "贵州茅台", positionNumber: undefined, remainingQuantity: 12.5 },
      { ...stock, lotId: 4, positionNumber: "04", remainingQuantity: 0 },
    ];
    const h = listHarness({ list: [{ ...categories[0], stocks: lots }] }); let tree = openStockCategory(h);
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined, 9, 2, 103]);
    expect(text(rowButton(tree, 90250, 9))).toContain("贵州茅台 · 持仓 01");
    expect(text(rowButton(tree, 90250, 2))).toContain("贵州茅台 · 持仓 02");
    expect(text(rowButton(tree, 90250, 103))).toContain("批次 #10312.5股");
    click(rowButton(tree, 90250, 2)); tree = h.render();
    expect(nodes(tree).find(node => node.type === "tr" && node.props["data-inline-detail"]).props["data-inline-detail"]).toBe("90250:2");
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: "600519" } }); tree = h.render();
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0);
    click(nodes(tree).find(node => node.props["aria-label"] === "只看开启强平")); tree = h.render();
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined, 2]);
    expect(text(rowButton(tree, 90250, 2))).toContain("持仓 02");
    expect(text(tableRows(tree)[0])).toContain("已开启强平—已开启 1/3");
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: "02" } }); tree = h.render();
    expect(tableRows(tree).map(row => row.props["data-lot-id"])).toEqual([undefined, 2]);
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: "01" } }); tree = h.render();
    expect(tableRows(tree)).toHaveLength(0);
    expect(positionLabel(lots[2])).toBe("批次 #103");
    expect(positionLabel({ ...lots[2], positionNumber: " " })).toBe("批次 #103");
  });
  it("保存刷新一级用当前query，二级按ids解析最新lot；pending不替换草稿props/面板key", () => {
    const h = listHarness(); let tree = openStockLot(h);
    const original = nodes(tree).find(node => node.type === "StockTagDownsideRulePanel");
    original.props.onPendingChange(true);
    const freshStock = { ...stock, positionNumber: "07", remainingQuantity: 31.5, note: "最新备注", currentDownsideRule: { ...categories[0].stocks[1].currentDownsideRule, lotId: 77, version: 10 } };
    const freshCategory = { ...categories[0], stocks: [freshStock, categories[0].stocks[1]] };
    h.query.data = { ...h.query.data, categories: [freshCategory, ...categories.slice(1)] }; tree = h.render();
    expect(text(rowButton(tree, 90250, 77))).toContain("31.5股最新备注");
    const pendingPanel = nodes(tree).find(node => node.type === "StockTagDownsideRulePanel");
    expect(pendingPanel.key).toBe(original.key); expect(pendingPanel.props.order.currentDownsideRule).toBe(null);
    pendingPanel.props.onClose(); tree = h.render();
    expect(rowButton(tree, 90250).props["aria-expanded"]).toBe(true);
    expect(text(tableRows(tree)[0])).toContain("已开启 2/2");
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0);
    click(rowButton(tree, 90250, 77)); tree = h.render();
    expect(nodes(tree).find(node => node.type === "InlineDetail").props.selection.stock).toBe(freshStock);
    expect(nodes(tree).find(node => node.type === "StockTagDownsideRulePanel").props.order.currentDownsideRule.version).toBe(10);
    const newerStock = { ...freshStock, note: "再次刷新", currentDownsideRule: { ...freshStock.currentDownsideRule, version: 11 } };
    h.query.data = { ...h.query.data, categories: [{ ...freshCategory, stocks: [newerStock, categories[0].stocks[1]] }, ...categories.slice(1)] }; tree = h.render();
    expect(nodes(tree).find(node => node.type === "InlineDetail").props.selection.stock).toBe(newerStock);
    expect(nodes(tree).find(node => node.type === "StockTagDownsideRulePanel").props.order.currentDownsideRule.version).toBe(11);
    expect(resolveSelection({ kind: "stock", category: categories[0], stock }, [])).toBe(null);
    expect(resolveSelection({ kind: "stock", category: categories[0], stock }, [{ ...freshCategory, stocks: [{ ...freshStock, remainingQuantity: 0 }] }])).toBe(null);
  });
  it("金额随真实query刷新：category summary与同symbol逐lot准确，pending不拿selection旧DTO而草稿仍稳定", () => {
    const firstLot = { ...categories[0].stocks[1], lotId: 77, ineffectiveFunds: 10 };
    const secondLot = { ...firstLot, lotId: 78, ineffectiveFunds: 20 };
    const initialCategory = { ...categories[0], ineffectiveFunds: 30, stocks: [firstLot, secondLot] };
    const h = listHarness({ list: [initialCategory] }); let tree = openStockLot(h);
    const originalPanel = nodes(tree).find(node => node.type === "StockTagDownsideRulePanel");
    originalPanel.props.onPendingChange(true);
    const freshLot = { ...firstLot, ineffectiveFunds: 1234.56, currentDownsideRule: { ...firstLot.currentDownsideRule, version: 10 } };
    h.query.data.categories = [{ ...initialCategory, ineffectiveFunds: 7890.12, stocks: [freshLot, { ...secondLot, ineffectiveFunds: 0 }] }]; tree = h.render();
    expect(ineffectiveSpans(tree).map(node => [node.props["data-ineffective-funds"], text(node)])).toEqual([
      ["90250:tag", "7,890.12"], ["90250:77", "1,234.56"], ["90250:78", "0.00"],
    ]);
    const pendingPanel = nodes(tree).find(node => node.type === "StockTagDownsideRulePanel");
    expect(pendingPanel.key).toBe(originalPanel.key); expect(pendingPanel.props.order.currentDownsideRule.version).toBe(firstLot.currentDownsideRule!.version);
    pendingPanel.props.onClose(); tree = h.render();
    expect(ineffectiveSpans(tree).map(text)).toEqual(["7,890.12", "1,234.56", "0.00"]);
    click(rowButton(tree, 90250, 77)); tree = h.render();
    expect(nodes(tree).find(node => node.type === "InlineDetail").props.selection.stock).toBe(freshLot);
    expect(nodes(tree).find(node => node.type === "StockTagDownsideRulePanel").props.order.currentDownsideRule.version).toBe(10);
    const ordinary = listHarness({ list: [{ ...categories[1], ineffectiveFunds: 100 }] });
    click(rowButton(ordinary.render(), 90251)); tree = ordinary.render();
    const form = nodes(tree).find(node => node.type === "OrdinaryTagDownsideRuleForm"); form.props.onPendingChange(true);
    ordinary.query.data.categories = [{ ...categories[1], ineffectiveFunds: 4321.09 }]; tree = ordinary.render();
    expect(text(ineffectiveSpan(tree, "90251:tag"))).toBe("4,321.09");
    expect(nodes(tree).find(node => node.type === "OrdinaryTagDownsideRuleForm").props.category.ineffectiveFunds).toBe(100);
    expect(nodes(tree).find(node => node.type === "OrdinaryTagDownsideRuleForm").key).toBe(form.key);
  });
  it("未展开不挂详情；InlineDetail的lazy hook只请求ledger/category/stock lot，不传userId且强制新鲜核验", () => {
    const list = listHarness(); expect(nodes(list.render()).filter(node => node.type === "InlineDetail")).toHaveLength(0);
    const h = detailHarness(); h.render();
    expect(h.useQuery).toHaveBeenCalledOnce();
    expect(h.useQuery).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, lotId: 77 }, {
      enabled: true, placeholderData: undefined, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false, retry: false,
    });
    const ordinary = detailHarness({ data: { ...savedDetail, kind: "ordinary", categoryId: 90251, lotId: null }, selection: { kind: "ordinary", category: categories[1] } });
    ordinary.render();
    expect(ordinary.useQuery.mock.calls[0][0]).toEqual({ ledgerId: 37, categoryId: 90251 });
    expect(source).toContain('import type { ForcedLiquidationSettingDetail } from "@shared/forced-liquidation-display"');
  });
  it.each([{ canEdit: false }, { viewing: true }, { liveReadonly: true }, { selection: { kind: "ordinary", category: { ...categories[1], categoryId: 0 } } },
    { selection: { kind: "stock", category: categories[0], stock: { ...stock, lotId: -1 } } }])("详情owner权限与有效scope不足不展示且禁hook请求%j", patch => {
    const h = detailHarness(patch); expect(h.render()).toBe(null);
    expect(h.useQuery.mock.calls[0][1].enabled).toBe(false);
  });
  it.each([{ isPending: true }, { isFetchedAfterMount: false }, { error: new Error("OFFLINE") }])("详情加载/旧缓存/错误不展示缓存数字或假0 %j", queryPatch => {
    const h = detailHarness({ queryPatch }); const tree = h.render();
    expect(nodes(tree).filter(node => node.type === "dl")).toHaveLength(0);
    expect(text(tree)).not.toContain("7520"); expect(text(tree)).not.toContain("7,520"); expect(text(tree)).not.toContain("0 USD");
    if (queryPatch.error) { expect(tree.props.role).toBe("alert"); nodes(tree).find(node => node.type === "Button").props.onClick(); expect(h.query.refetch).toHaveBeenCalledOnce(); }
  });
  it.each([{ ledgerId: 52 }, { categoryId: 90251 }, { lotId: 78 }, { lotId: null }, { kind: "ordinary" }])("详情scope拒绝其他账本/category/lot/kind旧缓存%j", patch => {
    const tree = detailHarness({ data: { ...savedDetail, ...patch } }).render();
    expect(text(tree)).toContain("详情范围不匹配"); expect(nodes(tree).filter(node => node.type === "dl")).toHaveLength(0);
  });
  it("详情整齐两列dt/dd，显示服务saved rule而非list/draft；币种/真实日期/股数全部取DTO", () => {
    const tree = detailHarness().render(), values = detailValues(tree);
    expect(nodes(tree).find(node => node.type === "dl").props.className).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
    expect(values).toMatchObject({ "当前强平规则": "已开启", "初始价": "120 USD", "强平价": "100 USD", "最新价": "70 USD",
      "从初始到门槛跌幅": "下跌16.67%", "从门槛到最新跌幅": "下跌30%", "剩余保证金比例": "剩20%保证金",
      "有效资金": "7,520 USD", "无效资金": "1,920 USD", "原币种": "USD", "最新数据日期": "2026-11-24", "最新数据来源": "persisted_quote", "剩余股数": "80股" });
    expect(stock.currentDownsideRule).toBe(null); expect(text(tree)).toContain("已保存规则与真实数据");
    expect(text(tree)).toContain("分段价格变动"); expect(text(tree)).toContain("不是钱包可用余额");
  });
  it.each(["USD", "HKD", "CNY", "JPY"])("股票详情保留原币种%s，不套category CNY", currency => {
    const values = detailValues(detailHarness({ data: { ...savedDetail, currency } }).render());
    expect(values["初始价"]).toBe(`120 ${currency}`); expect(values["有效资金"]).toBe(`7,520 ${currency}`);
    expect(values["原币种"]).toBe(currency);
  });
  it("详情所有真实zero均显示0，nullable不造余额、不由初始-门槛算有效资金", () => {
    const zero = { ...savedDetail, initialValue: 0, latestValue: 0, remainingQuantity: 0, effectiveFunds: 0, ineffectiveFunds: 0,
      initialToThresholdPercent: 0, thresholdToLatestPercent: 0, rule: { ...savedDetail.rule, threshold: 0, downsidePercent: 0 } };
    const zeroValues = detailValues(detailHarness({ data: zero }).render());
    expect(zeroValues).toMatchObject({ "初始价": "0 USD", "强平价": "0 USD", "最新价": "0 USD", "有效资金": "0 USD", "无效资金": "0 USD", "剩余股数": "0股", "剩余保证金比例": "剩0%保证金", "从初始到门槛跌幅": "下跌0%" });
    const unknown = { ...savedDetail, initialValue: null, latestValue: null, remainingQuantity: null, effectiveFunds: null, ineffectiveFunds: null, latestDate: null, latestSource: null, initialToThresholdPercent: null, thresholdToLatestPercent: null, status: "no_data", notice: null };
    const tree = detailHarness({ data: unknown }).render(), values = detailValues(tree);
    for (const label of ["初始价", "最新价", "有效资金", "无效资金", "剩余股数", "最新数据日期", "最新数据来源", "从初始到门槛跌幅", "从门槛到最新跌幅"]) expect(values[label]).toBe("待核验");
    expect(text(tree)).toContain("缺少历史数据"); expect(Object.values(values)).not.toContain("0 USD");
    const knownPrices = detailValues(detailHarness({ data: { ...savedDetail, effectiveFunds: null, ineffectiveFunds: null } }).render());
    expect(knownPrices["初始价"]).toBe("120 USD"); expect(knownPrices["强平价"]).toBe("100 USD");
    expect(knownPrices["有效资金"]).toBe("待核验"); expect(knownPrices["无效资金"]).toBe("待核验");
  });
  it.each([[-20, "上涨20%"], [20.5, "下跌20.5%"], [0, "下跌0%"], [null, "待核验"], [NaN, "待核验"], [Infinity, "待核验"]])("signed跌幅%s正确显示%s", (value, expected) => {
    expect(detailDrop(value)).toBe(expected);
    const values = detailValues(detailHarness({ data: { ...savedDetail, initialToThresholdPercent: value, thresholdToLatestPercent: value } }).render());
    expect(values["从初始到门槛跌幅"]).toBe(expected); expect(values["从门槛到最新跌幅"]).toBe(expected);
    expect(text(detailHarness({ data: { ...savedDetail, initialToThresholdPercent: value } }).render())).not.toContain("下跌-");
  });
  it("未保存规则不套list启用/默认20%/草稿，未来saved日期尚未生效，pending通知不假重算", () => {
    const ordinarySelection = { kind: "ordinary", category: categories[1] };
    const noRule = { ...savedDetail, kind: "ordinary", categoryId: 90251, lotId: null, rule: null, fundBasis: "cashflow_neutral_replay" };
    const values = detailValues(detailHarness({ data: noRule, selection: ordinarySelection }).render());
    expect(values["当前强平规则"]).toBe("未开启"); expect(values["强平金额"]).toBe("未设置"); expect(values["剩余保证金比例"]).toBe("未设置");
    const future = detailHarness({ data: { ...savedDetail, rule: { ...savedDetail.rule, startDate: "2026-12-01" } } }).render();
    expect(detailValues(future)["当前强平规则"]).toBe("已开启 · 尚未生效");
    const disabled = detailHarness({ data: { ...savedDetail, rule: { ...savedDetail.rule, enabled: false } } }).render();
    expect(detailValues(disabled)["当前强平规则"]).toBe("未开启");
    const pending = detailHarness({ data: { ...savedDetail, status: "pending", notice: "缺少真实历史记录，待核验" } }).render();
    expect(text(pending)).toContain("缺少真实历史记录，待核验");
    const baseline = detailHarness({ data: { ...savedDetail, rule: { ...savedDetail.rule, baselineStatus: "pending" } } }).render();
    expect(text(baseline)).toContain("不代表收益重算已完成");
  });
  it("普通现金流中性DTO显示本金净变动与取回，资金只取核验值且不凭I-B造资金或伪钱包余额", () => {
    const data = { ...savedDetail, categoryId: 90251, lotId: null, kind: "ordinary", currency: "CNY", fundBasis: "cashflow_neutral_replay",
      initialValue: 1000, latestValue: 800, effectiveFunds: 123.45, ineffectiveFunds: null, capitalChange: -250, withdraw: 0 };
    const tree = detailHarness({ data, selection: { kind: "ordinary", category: categories[1] } }).render(), values = detailValues(tree);
    expect(values).toMatchObject({ "初始账户金额": "1,000 CNY", "强平金额": "100 CNY", "最新账户金额": "800 CNY", "本金净变动": "-250 CNY", "取回": "0 CNY", "有效资金": "123.45 CNY", "无效资金": "待核验" });
    expect(values).not.toHaveProperty("剩余股数"); expect(text(tree)).toContain("现金流中性历史重放");
    expect(text(tree)).toContain("不按初始金额减门槛推算"); expect(text(tree)).toContain("不是钱包可用余额");
    expect(values["有效资金"]).not.toBe("900 CNY");
    const missing = detailValues(detailHarness({ data: { ...data, capitalChange: null, withdraw: null, effectiveFunds: null }, selection: { kind: "ordinary", category: categories[1] } }).render());
    expect(missing["本金净变动"]).toBe("待核验"); expect(missing["取回"]).toBe("待核验"); expect(missing["有效资金"]).toBe("待核验");
  });
  it.each(["", "0", "-1", "NaN", "Infinity", "1000000000001"])("普通金额门槛%s必须为正且有限且不超后端上限", threshold => {
    expect(typeof validate(true, threshold, "20", "2026-01-01")).toBe("string");
  });
  it.each(["", "-1", "100.1", "NaN", "Infinity"])("普通比例%s拒绝", percent => {
    expect(typeof validate(true, "1000", percent, "2026-01-01")).toBe("string");
  });
  it.each(["0", "100", "20.5"])("普通比例边界%s有效，关闭规则也严格校验", percent => {
    expect(validate(false, "1000.25", percent, "2024-02-29")).toEqual({ enabled: false, thresholdAmount: 1000.25, downsidePercent: Number(percent), startDate: "2024-02-29" });
  });
  it.each(["", "2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-1-01", "0000-01-01", "0999-12-31"])("普通日期%s不允许Date静默滚动或早于后端支持范围", date => {
    expect(typeof validate(true, "1000", "20", date)).toBe("string");
  });
  it("ordinary payload严格带ledger/category/CAS且成功返回前不提示、不关闭、不invalidate", () => {
    const h = ordinaryHarness(); saveButton(h.render()).props.onClick();
    expect(h.mutate).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90251, enabled: true, thresholdAmount: 1000, downsidePercent: 20, startDate: "2026-01-01", expectedVersion: 5 });
    expect(h.toast.success).not.toHaveBeenCalled(); expect(h.onClose).not.toHaveBeenCalled(); expect(Object.keys(h.invalidations)).toEqual([]);
    h.callbacks().onSuccess(); expect(h.toast.success).toHaveBeenCalledTimes(1); expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(Object.keys(h.invalidations).sort()).toEqual(["getForcedLiquidationSettings", "getForcedLiquidationSettingDetail", "getCategories", "getCalendarData", "getReport", "getMyOrdinaryTagObservationOverview", "getMyOrdinaryTagDownsideValuations", "getTagSummary", "getAllTagsMarginSummary", "adminGetLedger37DividendAvailability"].sort());
    for (const [name, spy] of Object.entries(h.invalidations)) expect(spy).toHaveBeenCalledWith(name === "getTagSummary" ? { ledgerId: 37, tagName: "现金标签" } : name === "getForcedLiquidationSettingDetail" ? { ledgerId: 37, categoryId: 90251 } : { ledgerId: 37 });
  });
  it("首次规则CAS=0，北京日期默认；坏版本拒写，冲突报错仅重读不假成功", () => {
    const h = ordinaryHarness({ saved: false }); h.render(); h.hook.state[1] = "900";
    saveButton(h.render()).props.onClick(); expect(h.mutate).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 0, startDate: "2026-11-26" }));
    h.callbacks().onError(new Error("CONFLICT")); expect(h.toast.error).toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled(); expect(h.onReload).toHaveBeenCalledTimes(1);
    expect(h.onClose).not.toHaveBeenCalled(); expect(Object.keys(h.invalidations)).toEqual([]); expect(h.onPendingChange).toHaveBeenLastCalledWith(false);
    const bad = ordinaryHarness(); (bad.props.category.ordinaryRule as any).version = -1; saveButton(bad.render()).props.onClick(); expect(bad.mutate).not.toHaveBeenCalled();
    // Restore the shared fixture after exercising malformed persisted data.
    categories[1].ordinaryRule!.version = 5;
  });
  it.each([{ viewing: true }, { canEdit: false }, { dev: true }, { pending: true }])("代看/无权限/DEV/保存中禁正式写%j且不假保存", patch => {
    const h = ordinaryHarness(patch); const button = saveButton(h.render()); expect(button.props.disabled).toBe(true); button.props.onClick();
    expect(h.mutate).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled();
  });
  it("普通表单保存pending取消即使直接调用也拒绝，失败只重读并保留原inline而成功才收起刷新", () => {
    const pending = ordinaryHarness({ pending: true }), cancel = nodes(pending.render()).find(node => node.type === "Button" && text(node) === "取消");
    expect(cancel.props.disabled).toBe(true); cancel.props.onClick(); expect(pending.onClose).not.toHaveBeenCalled();
    const list = listHarness(); click(rowButton(list.render(), 90251)); let tree = list.render();
    const original = nodes(tree).find(node => node.type === "OrdinaryTagDownsideRuleForm");
    const form = ordinaryHarness(); Object.assign(form.props, { onClose: original.props.onClose, onReload: original.props.onReload, onPendingChange: original.props.onPendingChange });
    saveButton(form.render()).props.onClick(); tree = list.render();
    expect(rowButton(tree, 90251).props.disabled).toBe(true);
    form.callbacks().onError(new Error("CONFLICT")); tree = list.render();
    expect(form.toast.success).not.toHaveBeenCalled();
    expect(nodes(tree).filter(node => node.type === "OrdinaryTagDownsideRuleForm")).toHaveLength(1);
    expect(nodes(tree).find(node => node.type === "OrdinaryTagDownsideRuleForm").key).toBe(original.key);
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(1);
    expect(rowButton(tree, 90251).props.disabled).toBe(false); expect(list.query.refetch).toHaveBeenCalledOnce();
    expect(list.invalidations.getForcedLiquidationSettingDetail).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90251 });
    expect(list.invalidations.getForcedLiquidationSettings).toBeUndefined();
    saveButton(form.render()).props.onClick(); form.callbacks().onSuccess(); tree = list.render();
    expect(nodes(tree).filter(node => node.type === "OrdinaryTagDownsideRuleForm")).toHaveLength(0);
    expect(nodes(tree).filter(node => node.type === "InlineDetail")).toHaveLength(0);
    expect(list.invalidations.getForcedLiquidationSettings).toHaveBeenCalledWith({ ledgerId: 37 });
  });
  it("比例Label动态剩20%保证金，非法输入使用剩余保证金；普通说明不显示数学公式", () => {
    const h = ordinaryHarness(); let tree = h.render();
    const label = (value: any) => text(nodes(value).find(node => node.type === "Label" && node.props.htmlFor === "ordinary-downside-percent"));
    expect(label(tree)).toBe("剩20%保证金");
    for (const value of ["0", "100", "20.5", "", "NaN", "101", "-1"]) {
      h.hook.state[2] = value; tree = h.render();
      expect(label(tree)).toBe(["0", "100", "20.5"].includes(value) ? `剩${value}%保证金` : "剩余保证金");
    }
    expect(text(tree)).toContain("本金变动与取回不算收益");
    expect(text(tree)).toContain("规则不改原登记金额");
    expect(text(tree)).not.toContain("计入金额=");
  });
  it("页面唯一mutation是普通规则，股票沿用原规则面板，无钱包/买卖/交易编辑/全站invalidate", () => {
    const mutations = (find(file, node => ts.isCallExpression(node) && node.expression.getText(file).endsWith(".useMutation")) as ts.CallExpression[]).map(node => node.expression.getText(file));
    expect(mutations).toEqual(["trpc.ledger.setOrdinaryTagDownsideRule.useMutation"]);
    expect(source).not.toMatch(/<(?:StockTagBuyEditDialog|StockTagTradeDialog)\b|utils\.invalidate\(|invalidate\(\)/);
    expect(source).not.toContain("getCryptoPrices"); expect(source).not.toContain("getStockPrice");
    expect(source).toContain("不自动卖出或操作钱包"); expect(source).toContain("不改原登记金额");
  });
});
