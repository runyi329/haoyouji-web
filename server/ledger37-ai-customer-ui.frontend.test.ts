import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as helpers from "../client/src/lib/r1StockPresentation";
import { isR1StockPresentationScope, type R1AiParticipationPortfolio } from "../shared/r1-stock-presentation";
import type { Ledger37AiOverview } from "../shared/ledger37-ai-presentation";

const homeSource = readFileSync(new URL("../client/src/components/Ledger37AiHome.tsx", import.meta.url), "utf8");
const holdingsSource = readFileSync(new URL("../client/src/components/Ledger37HoldingSources.tsx", import.meta.url), "utf8");
const aiSource = readFileSync(new URL("../client/src/components/R1AiParticipationView.tsx", import.meta.url), "utf8");

// Execute actual module-local TSX declarations (including any new local presentation helpers).
// Imports are removed by AST: only inert hooks, real pure helpers/icons and explicitly supplied APIs enter scope.
// No application module, router, service, environment loader, HTTP or DB is imported.
function actualModule(source: string, names: string[], scope: Record<string, any> = {}) {
  const file = ts.createSourceFile("actual.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const code = file.statements.filter(node => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node) && !ts.isExportAssignment(node))
    .map(node => node.getText(file).replace(/^export\s+(default\s+)?/, "")).join("\n");
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  const safeIcons = Object.fromEntries(Object.entries(icons).filter(([name]) => name !== "default" && /^[A-Za-z_$][\w$]*$/.test(name)));
  const context = { React, ...safeIcons, ...helpers, isR1StockPresentationScope, ...scope };
  return new Function(...Object.keys(context), `${js}; return { ${names.join(",")} };`)(...Object.values(context));
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
const overview = (): Ledger37AiOverview => ({ viewerUserId: 901, aiEnabled: true, projects: [
  { categoryId: 90250, displayName: "客户的超长股票参与项目名称LongUnbrokenProjectLabelForSmallScreen", kind: "stock", summary: { floatingPnl: -84, realizedPnl: 56, totalPnl: -28 }, receivedDividends: 11, recordedMargins: [{ assetCode: "USDT", amount: "100.123456789123456789" }], startDate: "2026-11-01" },
  { categoryId: 777, displayName: "第二股票项目", kind: "stock", summary: { floatingPnl: 1, realizedPnl: 2, totalPnl: 3 }, receivedDividends: null, recordedMargins: [], startDate: null },
  { categoryId: 888, displayName: "普通项目", kind: "ordinary", summary: null, receivedDividends: null, recordedMargins: null, startDate: null },
] });
const row = (patch: Record<string, any> = {}): any => ({ id: 1, symbol: "AAPL", stockName: "超长证券参与记录名称LongUnbrokenSecurityName", currency: "USD", quantity: 6, allocatedQuantity: 10, allocationRatio: 0.1, startDate: "2026-11-01", status: "active", floatingPnl: -12, realizedPnl: 8, totalPnl: -4, ...patch });
const dto = (patch: Partial<R1AiParticipationPortfolio> = {}): R1AiParticipationPortfolio => ({ viewerUserId: 901, aiEnabled: true, usdCnyRate: 7, usdtCnyRate: null, updatedAt: "2026-11-18", summary: { floatingPnl: -84, realizedPnl: 56, totalPnl: -28 }, participations: [row()], recordedMargins: [{ assetCode: "USDT", amount: "100.123456789123456789" }], observation: null, ...patch });
function homeRenderer(data = overview(), updating = false) {
  const { Ledger37AiHomeRenderer } = actualModule(homeSource, ["Ledger37AiHomeRenderer"]);
  return expand(Ledger37AiHomeRenderer({ overview: data, updating, onOpenStock: vi.fn() }));
}
function aiRenderer(data = dto(), rate: number | null = data.usdCnyRate, updating = false) {
  const { R1AiParticipationRenderer } = actualModule(aiSource, ["R1AiParticipationRenderer"]);
  return expand(R1AiParticipationRenderer({ portfolio: data, displayUsdCnyRate: rate, updating }));
}
function field(tree: any, label: RegExp) {
  const term = nodes(tree).find(node => node.type === "dt" && label.test(text(node)));
  expect(term, `Missing financial field ${label}`).toBeTruthy();
  const group = nodes(tree).find(node => nodes(node.props?.children).includes(term) && nodes(node).filter(child => child.type === "dt").length === 1);
  // Prefer the smallest group so colors/font checks apply to its own value, not a whole section.
  const groups = nodes(tree).filter(node => nodes(node.props?.children).includes(term) && nodes(node).filter(child => child.type === "dt").length === 1);
  return groups.at(-1) ?? group;
}
function amount(tree: any, label: RegExp) { return nodes(field(tree, label)).find(node => node.type === "dd"); }
function primaryAmount(tree: any) {
  expect(text(tree)).toMatch(/累计分配收益|累计收益|已分配收益/);
  const term = nodes(tree).find(node => node.type === "dt" && /^(?:累计分配收益|累计收益|已分配收益)$/.test(text(node)));
  return term ? amount(tree, /^(?:累计分配收益|累计收益|已分配收益)$/) : nodes(tree).find(node => node.type === "p" && /^(?:[+−]?¥[\d,.]+|—)$/.test(text(node)));
}
function fontSize(node: any): number {
  const css = String(node?.props?.className ?? "");
  const sizes: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36 };
  return Math.max(0, ...css.split(/\s+/).map(token => /^text-\[(\d+)px\]$/.test(token) ? Number(token.match(/\d+/)![0]) : sizes[token.replace(/^text-/, "")] ?? 0));
}
function direction(node: any): string {
  const css = String(node?.props?.className ?? "") + " " + String(node?.props?.style?.color ?? "");
  if (/text-(?:red|rose)-/.test(css)) return "positive";
  if (/text-(?:green|emerald)-/.test(css)) return "negative";
  const hex = css.match(/#[0-9a-fA-F]{6}/)?.[0];
  if (hex) {
    const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
    if (r > g * 1.3 && r > b * 1.1) return "positive";
    if (g > r * 1.2 && g > b * 1.05) return "negative";
  }
  return "neutral";
}
function shape(tree: any): any {
  if (Array.isArray(tree)) return tree.filter(child => child != null && typeof child !== "boolean" && !hidden(child)).map(shape);
  if (!tree || typeof tree !== "object") return null;
  return [typeof tree.type === "string" ? tree.type : "icon", tree.key, tree.props?.role, shape(tree.props?.children)];
}
function hidden(tree: any): boolean { return !!tree && typeof tree === "object" && (/\bsr-only\b/.test(String(tree.props?.className ?? "")) || tree.props?.["aria-hidden"] === true); }
function visibleText(tree: any): string {
  if (Array.isArray(tree)) return tree.map(visibleText).join("");
  if (tree == null || typeof tree === "boolean" || hidden(tree)) return "";
  return typeof tree === "object" ? visibleText(tree.props?.children) : String(tree);
}
function foregroundData(tree: any) { return nodes(tree).filter(node => ["dt", "dd", "h2", "h3"].includes(node.type)).map(text); }

// This is a static small-screen design contract, NOT a claim of browser pixel/layout verification.
// Check the actual rendered DOM's fluid constraints at the target minimum widths and wrapping protections.
function smallScreenContract(tree: any, width: number) {
  const main = nodes(tree).find(node => node.type === "main");
  const css = String(main?.props?.className ?? "");
  expect(css).toMatch(/max-w-(?:\[(?:480|4[0-7]\d)px\]|md|sm)/);
  for (const node of nodes(tree)) {
    const classes = String(node.props?.className ?? "").split(/\s+/);
    for (const token of classes) {
      const fixed = token.match(/^(?:min-w|w)-\[(\d+)px\]$/);
      if (fixed) expect(Number(fixed[1]), `Fixed width ${token} must fit ${width}px`).toBeLessThanOrEqual(width - 24);
    }
  }
  for (const card of nodes(tree).filter(node => node.type === "article")) {
    const heading = nodes(card).find(node => ["h2", "h3"].includes(node.type));
    expect(String(heading?.props?.className ?? "") + " " + String(card.props?.className ?? "")).toMatch(/break-(?:words|all)|overflow-wrap|\[overflow-wrap:/);
    for (const value of nodes(card).filter(node => node.type === "dd" && /\d{12}/.test(text(node)))) {
      expect(String(value.props?.className ?? "")).toMatch(/break-all|break-words|overflow-wrap/);
    }
  }
  expect(renderToStaticMarkup(tree)).not.toMatch(/<table|<canvas/);
}

describe("37号AI主客户UI：真实AST与SSR安全设计契约", () => {
  it.each([320, 375])("%spx小屏：首页及股票明细流式容器、长名称/精度金额可换行", width => {
    smallScreenContract(homeRenderer(), width);
    smallScreenContract(aiRenderer(), width);
  });
  it("AI客户页面统一使用37号AI浅蓝青绿主题，不再使用大红条或紫色仪表盘", () => {
    const walletSource = readFileSync(new URL("../client/src/pages/Wallet.tsx", import.meta.url), "utf8");
    expect(walletSource).toContain('"--wallet-accent": "#FF6900"');
    expect(walletSource).toContain('"--wallet-bg": "#F8F6F3"');
    for (const tree of [homeRenderer(), aiRenderer()]) {
      const html = renderToStaticMarkup(tree);
      expect(html).toContain("bg-[#E4F4F6]");
      expect(html).not.toContain("bg-[#087987]");
      expect(html).not.toMatch(/#644484|#F1EBF5|#30243B/);
      expect(html).not.toMatch(/text-\[(?:32|36|38)px\]/);
    }
  });
  it("旧项目概览已移除，普通项目实收仍是主数且缺收益不捏造", () => {
    const data = overview(); data.projects[2].receivedDividends = 22;
    const tree = homeRenderer(data);
    const overviewSection = nodes(tree).find(node => node.props?.["aria-label"] === "参与项目概览");
    expect(overviewSection).toBeUndefined();
    expect(nodes(tree).filter(node => ["h1", "h2", "h3"].includes(node.type)).map(text)).not.toContain("项目概览");
    expect(homeSource).toContain("<Ledger37HoldingSourcesRenderer");
    expect(homeSource).not.toContain("<Ledger37AiStockPool");
    expect(text(tree)).not.toMatch(/总投入|整体收益率|全部项目合计|合计本金/);
    const ordinary = nodes(tree).filter(node => node.type === "article")[2];
    expect(text(ordinary)).toContain("实收分配收益"); expect(text(ordinary)).toContain("+¥22.00");
    const primary = nodes(ordinary).find(node => node.type === "p" && text(node) === "+¥22.00");
    expect(fontSize(primary)).toBeGreaterThanOrEqual(24);
    expect(direction(primary)).toBe("positive");
    expect(text(ordinary)).not.toContain("当前分配收益");
    expect(text(ordinary)).not.toContain("历史分配收益");
    expect(nodes(ordinary).some(node => ["a", "button"].includes(node.type))).toBe(false);
  });
  it("股票项目优先，保持各类内部顺序，不遗漏或篡改任何项目原值", () => {
    const data = overview();
    const original = [data.projects[2], data.projects[0], data.projects[1]];
    data.projects = original;
    const snapshot = JSON.stringify(data);
    const cards = nodes(homeRenderer(data)).filter(node => node.type === "article");
    expect(cards.map(card => text(nodes(card).find(node => node.type === "h2")))).toEqual([original[1].displayName, original[2].displayName, original[0].displayName]);
    expect(cards).toHaveLength(original.length);
    expect(text(cards[0])).toContain("−¥28.00");
    expect(text(cards[1])).toContain("+¥3.00");
    expect(JSON.stringify(data)).toBe(snapshot);
  });
  it("股票入口与折叠区域44px触达，不用小字号文字作为唯一点击区域", () => {
    const tree = homeRenderer();
    const touchPixels = (node: any, axis: "h" | "w") => {
      const css = String(node.props?.className ?? "");
      const standard = css.match(new RegExp(`(?:^|\\s)(?:min-)?${axis}-(\\d+)(?:\\s|$)`));
      const arbitrary = css.match(new RegExp(`(?:^|\\s)(?:min-)?${axis}-\\[(\\d+)px\\](?:\\s|$)`));
      return arbitrary ? Number(arbitrary[1]) : standard ? Number(standard[1]) * 4 : Number(node.props?.style?.[axis === "h" ? "minHeight" : "minWidth"] ?? 0);
    };
    for (const button of nodes(tree).filter(node => node.type === "button")) {
      expect(button.props.type).toBe("button"); expect(button.props["aria-label"]).toBeTruthy();
      expect(touchPixels(button, "h")).toBeGreaterThanOrEqual(44); expect(touchPixels(button, "w")).toBeGreaterThanOrEqual(44);
    }
    for (const summary of nodes(tree).filter(node => node.type === "summary")) expect(touchPixels(summary, "h")).toBeGreaterThanOrEqual(44);
  });
  it("项目累计收益比当前/历史收益突出，不在全局伪造总收益", () => {
    const cards = nodes(homeRenderer()).filter(node => node.type === "article");
    for (const card of cards.slice(0, 2)) {
      const total = primaryAmount(card);
      expect(fontSize(total)).toBeGreaterThanOrEqual(24);
      expect(fontSize(total)).toBeGreaterThan(fontSize(amount(card, /^当前分配收益$/)));
      expect(fontSize(total)).toBeGreaterThan(fontSize(amount(card, /^历史分配收益$/)));
    }
    const summary = nodes(aiRenderer()).find(node => node.props?.["aria-label"] === "参与收益汇总");
    expect(fontSize(amount(summary, /^累计分配收益$/))).toBeGreaterThanOrEqual(24);
    expect(fontSize(amount(summary, /^累计分配收益$/))).toBeGreaterThan(fontSize(amount(summary, /^当前分配收益$/)));
  });
  it.each([12, -12, 0, null, Number.NaN])("实际首页及股票收益方向%s：正红负绿，零/未知中性", value => {
    const data = overview(); data.projects[0].summary = { floatingPnl: value, realizedPnl: value, totalPnl: value };
    const homeCard = nodes(homeRenderer(data)).find(node => node.type === "article");
    const participation = dto({ summary: { floatingPnl: value, realizedPnl: value, totalPnl: value }, participations: [row({ floatingPnl: value, realizedPnl: value, totalPnl: value })] });
    const detail = aiRenderer(participation);
    const summary = nodes(detail).find(node => node.props?.["aria-label"] === "参与收益汇总");
    const detailCard = nodes(detail).find(node => node.type === "article");
    for (const context of [homeCard, summary, detailCard]) {
      const current = amount(context, /^当前分配收益$/);
      expect(direction(current)).toBe(value != null && Number.isFinite(value) && value > 0 ? "positive" : value != null && Number.isFinite(value) && value < 0 ? "negative" : "neutral");
      if (value == null || !Number.isFinite(value)) { expect(text(current)).toBe("—"); expect(text(current)).not.toContain("0.00"); }
      if (value === 0) expect(text(current)).toContain("¥0.00");
    }
  });
  it("缺数据/FX时不伪0，原币旁注和登记十进制精度仍保留", () => {
    const data = dto({ usdCnyRate: null, summary: { floatingPnl: null, realizedPnl: null, totalPnl: null } });
    const tree = aiRenderer(data, null);
    const summary = nodes(tree).find(node => node.props?.["aria-label"] === "参与收益汇总");
    expect(text(summary)).toContain("—"); expect(text(summary)).not.toContain("¥0.00");
    const card = nodes(tree).find(node => node.type === "article");
    for (const value of [-12, 8, -4]) expect(text(card)).toContain(helpers.r1ParticipationMoney(value, "USD"));
    expect(renderToStaticMarkup(tree)).toContain("100.123456789123456789");
    const ordinary = nodes(homeRenderer()).filter(node => node.type === "article")[2];
    expect(text(ordinary)).toContain("—"); expect(text(ordinary)).not.toContain("¥0.00");
  });
  it("后台更新只改变稳定状态槽，不卸载数据或反复替换前台口径文字", () => {
    for (const render of [(updating: boolean) => homeRenderer(overview(), updating), (updating: boolean) => aiRenderer(dto(), 7, updating)]) {
      const before = render(false), during = render(true), after = render(false);
      expect(shape(during)).toEqual(shape(before)); expect(shape(after)).toEqual(shape(before));
      expect(foregroundData(during)).toEqual(foregroundData(before));
      expect(text(during)).toMatch(/更新中.*保留上次数据/);
      expect(visibleText(during)).toBe(visibleText(before));
      expect(nodes(during).filter(node => node.props?.role === "status").every(node => !/animate-(?:pulse|ping)/.test(String(node.props?.className)))).toBe(true);
    }
  });
  it("普通项目没有股票入口；stock导航与safe查询传真实categoryId及当前viewer", () => {
    const data = { viewerUserId: 901, aiEnabled: true, sources: [{ id: "r1", status: "available", holdings: [{}] }, { id: "berkshire", status: "available", holdings: [{}] }] }; const state: any[] = []; let cursor = 0;
    const sourcesSpy = vi.fn(() => ({ data, isFetching: false, isFetchedAfterMount: true }));
    const safeSpy = vi.fn(() => ({ data: dto(), isFetching: false }));
    const rawGuard = new Proxy({ getMyLedger37HoldingSources: { useQuery: sourcesSpy }, getMyR1AiParticipationPortfolio: { useQuery: safeSpy } }, { get(target, key) { if (!(key in target)) throw new Error(`Forbidden raw hook: ${String(key)}`); return (target as any)[key]; } });
    const { Ledger37AiHome } = actualModule(homeSource, ["Ledger37AiHome"], {
      useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value: any) => { state[i] = value; }]; },
      Ledger37AiIdentityHeader: () => React.createElement("div", { "data-identity-header": true }),
      Ledger37HoldingSourcesRenderer: "sources-renderer",
      ledger37HoldingSourceHasDetails: actualModule(holdingsSource, ["ledger37HoldingSourceHasDetails"]).ledger37HoldingSourceHasDetails,
      trpc: { ledger: rawGuard, stock: { getUsdCnyRate: { useQuery: () => ({ data: { success: true, rate: 7 } }) } } }, R1AiParticipationRenderer: () => React.createElement("div", { "data-safe-detail": true }),
    });
    const render = () => { cursor = 0; return Ledger37AiHome({ viewerUserId: 901, onBack: vi.fn() }); };
    let tree = render();
    const rendererNode = nodes(tree).find(node => node.props?.data === data);
    expect(rendererNode).toBeTruthy();
    const ordinary = nodes(homeRenderer()).filter(node => node.type === "article")[2];
    expect(nodes(ordinary).some(node => ["a", "button"].includes(node.type))).toBe(false);
    rendererNode.props.onOpen(888); expand(render()); expect(safeSpy).not.toHaveBeenCalled();
    rendererNode.props.onOpen("berkshire"); tree = render();
    expect(nodes(tree).find(node => node.props?.data === data).props.selectedSourceId).toBeNull();
    rendererNode.props.onOpen("r1"); tree = render();
    expect(nodes(tree).find(node => node.props?.data === data).props.selectedSourceId).toBe("r1");
    expect(safeSpy).not.toHaveBeenCalled();
    expect(sourcesSpy).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: 901 }, expect.objectContaining({ placeholderData: undefined }));
    // Direct legitimate stock entry retains the original scoped safe-API contract.
    const { Ledger37AiStockParticipationView } = actualModule(homeSource, ["Ledger37AiStockParticipationView"], { trpc: { ledger: rawGuard, stock: { getUsdCnyRate: { useQuery: () => ({ data: { success: true, rate: 7 } }) } } }, Ledger37AiIdentityHeader: "header", R1AiParticipationRenderer: "safe-detail" });
    Ledger37AiStockParticipationView({ ledgerId: 37, categoryId: 777, viewerUserId: 901, onBack: vi.fn() });
    expect(safeSpy).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 777, viewAsUserId: 901 }, expect.objectContaining({ placeholderData: undefined }));
  });
  it("打开股票明细与返回首页从顶部开始，普通项目不触发导航或滚动", () => {
    const data = { viewerUserId: 901, aiEnabled: true, sources: [{ id: "r1", status: "available", holdings: [{}] }, { id: "berkshire", status: "available", holdings: [{}] }] };
    const scrollTo = vi.fn();
    const state: any[] = []; let cursor = 0;
    vi.stubGlobal("window", { scrollTo });
    try {
      const { Ledger37AiHome } = actualModule(homeSource, ["Ledger37AiHome"], {
        useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value: any) => { state[i] = value; }]; },
        Ledger37AiIdentityHeader: "identity-header",
        Ledger37HoldingSourcesRenderer: "sources-renderer",
        ledger37HoldingSourceHasDetails: actualModule(holdingsSource, ["ledger37HoldingSourceHasDetails"]).ledger37HoldingSourceHasDetails,
        trpc: { ledger: { getMyLedger37HoldingSources: { useQuery: () => ({ data, isFetching: false, isFetchedAfterMount: true }) } } },
      });
      const render = () => { cursor = 0; return Ledger37AiHome({ viewerUserId: 901, onBack: vi.fn() }); };
      const rendererNode = nodes(render()).find(node => node.props?.data === data);
      rendererNode.props.onOpen(888);
      expect(scrollTo).not.toHaveBeenCalled();
      rendererNode.props.onOpen("berkshire");
      expect(scrollTo).not.toHaveBeenCalled();
      rendererNode.props.onOpen("r1");
      expect(scrollTo.mock.calls).toEqual([[0, 0]]);
      const detail = render();
      expect(nodes(detail).find(node => node.props?.data === data).props.selectedSourceId).toBe("r1");
      nodes(detail).find(node => node.type === "identity-header").props.onBack();
      expect(scrollTo.mock.calls).toEqual([[0, 0], [0, 0]]);
      expect(nodes(render()).find(node => node.props?.data === data).props.selectedSourceId).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
  it("不同symbol股数逐笔展示，不相加为总股数或直接持有数", () => {
    const tree = aiRenderer(dto({ participations: [row(), row({ id: 2, symbol: "TSLA", stockName: "第二证券", quantity: 17, allocatedQuantity: 19 })] }));
    const cards = nodes(tree).filter(node => node.type === "article");
    expect(text(cards[0])).toContain("AAPL"); expect(text(amount(cards[0], /^参与股数$/))).toBe("6");
    expect(text(cards[1])).toContain("TSLA"); expect(text(amount(cards[1], /^参与股数$/))).toBe("17");
    expect(text(tree)).not.toMatch(/总股数|持有股数|合计股数|23\s*股/);
  });
  it("global逐项目展示，不汇总多项目收益或伪造本金/收益率/走势图", () => {
    const data = overview(); Object.assign(data, { principal: 987654321, rateOfReturn: 91827364, history: [{ value: 87654321 }], totalPnl: -25, observation: { totalPnl: 334455667 } });
    const tree = homeRenderer(data); const html = renderToStaticMarkup(tree);
    const cards = nodes(tree).filter(node => node.type === "article");
    expect(text(cards[0])).toContain("−¥28.00"); expect(text(cards[1])).toContain("+¥3.00");
    expect(text(tree)).not.toContain("−¥25.00");
    expect(html).not.toMatch(/987654321|87654321|91827364|334455667|334,455,667|<canvas|recharts|chartjs/);
    expect(text(tree)).not.toMatch(/收益率|年化|本金|账户总收益|收益走势/);
    const file = ts.createSourceFile("home.tsx", homeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const forbiddenCalls: string[] = [];
    const visit = (node: ts.Node) => { if (ts.isCallExpression(node) && /\.(?:reduce|mutate|useMutation|save)$/.test(node.expression.getText(file))) forbiddenCalls.push(node.getText(file)); ts.forEachChild(node, visit); }; visit(file);
    expect(forbiddenCalls).toEqual([]);
  });
  it("风险披露明确参与非直接持股且不保证回报，普通项目边界明确", () => {
    for (const tree of [homeRenderer(), aiRenderer()]) {
      expect(text(tree)).toMatch(/不表示直接持有股票/); expect(text(tree)).toMatch(/不保证回报/);
      expect(text(tree)).not.toMatch(/保证本金|保本收益|稳赚|保证收益/);
    }
    expect(text(homeRenderer())).toMatch(/普通项目.*不表示参与股票/);
  });
  it("观察默认折叠且独立不结算，不计入真实累计收益", () => {
    const data = dto({ observation: { summary: { floatingPnl: 999, realizedPnl: 888, totalPnl: 1887 }, participations: [row({ id: 2, symbol: "WATCH", currency: "CNY", floatingPnl: 1234, realizedPnl: 234, totalPnl: 1468 })] } });
    const tree = aiRenderer(data); const details = nodes(tree).find(node => node.type === "details");
    expect(details).toBeTruthy(); expect(details.props.open).not.toBe(true);
    expect(text(details)).toMatch(/观察.*不结算/); expect(text(details)).toMatch(/不计入.*参与收益/);
    const actual = nodes(tree).find(node => node.props?.["aria-label"] === "参与收益汇总");
    expect(text(actual)).toContain("−¥28.00"); expect(text(actual)).not.toContain("1,468");
    expect(text(details)).toContain("+¥1,468.00"); expect(text(details)).not.toContain("+¥1,887.00");
    expect(nodes(tree).find(node => node.props?.["aria-label"] === "我的参与记录") && text(nodes(tree).find(node => node.props?.["aria-label"] === "我的参与记录"))).not.toContain("WATCH");
  });
});
