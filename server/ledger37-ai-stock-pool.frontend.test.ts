import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as helpers from "../client/src/lib/ledger37AiStockPool";
import * as moneyHelpers from "../client/src/lib/r1StockPresentation";
import type { Ledger37AiStockPool as Pool } from "../shared/ledger37-ai-presentation";

type Stock = Parameters<typeof helpers.buildLedger37AiStockPoolChart>[0][number];
const componentSource = () => readFileSync(new URL("../client/src/components/Ledger37AiStockPool.tsx", import.meta.url), "utf8");

// Execute real declarations, not a duplicate implementation. Imports are removed by AST.
// Only useState, React, Lucide, genuine pure presentation helpers and an explicit query stub enter scope.
// No router, application bootstrap, database, environment loader or HTTP client is imported.
function actualModule(source: string, names: string[], scope: Record<string, any> = {}) {
  const file = ts.createSourceFile("actual.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const code = file.statements.filter(node => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node) && !ts.isExportAssignment(node))
    .map(node => node.getText(file).replace(/^export\s+(default\s+)?/, "")).join("\n");
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  const safeIcons = Object.fromEntries(Object.entries(icons).filter(([name]) => name !== "default" && /^[A-Za-z_$][\w$]*$/.test(name)));
  const context = { React, ...safeIcons, ...moneyHelpers, ...helpers, ...scope };
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
function stateHarness() {
  const values: any[] = []; let cursor = 0;
  return {
    reset: () => { cursor = 0; },
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
      return [values[index], (next: any) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
    },
  };
}
const row = (patch: Partial<Stock> = {}): Stock => ({ symbol: "AAPL", stockName: "苹果", currency: "USD", status: "holding", pnlCny: 100, hasParticipation: true, ...patch });
const pool = (stocks: Stock[] = [row()], patch: Partial<Pool> = {}): Pool => ({ viewerUserId: 901, aiEnabled: true, stocks, ...patch });
function renderer(data: Pool | undefined = pool(), props: Record<string, any> = {}) {
  const state = stateHarness();
  const { Ledger37AiStockPoolRenderer } = actualModule(componentSource(), ["Ledger37AiStockPoolRenderer"], { useState: state.useState });
  return expand(Ledger37AiStockPoolRenderer({ pool: data, ...props }));
}
function wrapper(result: Record<string, any>, viewerUserId: any, adminPreview = false) {
  const query = vi.fn((..._args: any[]) => result);
  const ledger = new Proxy({ getMyLedger37AiStockPool: { useQuery: query } }, {
    get(target, key) { if (!(key in target)) throw new Error(`Forbidden query/mutation: ${String(key)}`); return (target as any)[key]; },
  });
  const state = stateHarness();
  const { Ledger37AiStockPool } = actualModule(componentSource(), ["Ledger37AiStockPool"], { useState: state.useState, trpc: { ledger } });
  const tree = Ledger37AiStockPool({ viewerUserId, adminPreview });
  return { query, tree, html: renderToStaticMarkup(expand(tree)) };
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
function amountNode(tree: any, value: number) {
  const label = moneyHelpers.r1ParticipationMoney(value, "CNY");
  return nodes(tree).filter(node => text(node) === label).at(-1);
}

describe("37号AI选股池：真实纯helper与离线AST/SSR契约", () => {
  it("按确认参与收益绝对值构成25/75，不翻转100/-300，也不改原输入", () => {
    const stocks = [row(), row({ symbol: "TSLA", stockName: "特斯拉", pnlCny: -300, status: "closed" })];
    const snapshot = JSON.stringify(stocks);
    const chart = helpers.buildLedger37AiStockPoolChart(stocks);
    expect(chart.rows.map(item => item.pnlCny)).toEqual([100, -300]);
    expect(chart.rows.map(item => item.share)).toEqual([25, 75]);
    expect(chart.gradient).toMatch(/^conic-gradient\(/);
    expect(chart.hasPending).toBe(false);
    expect(JSON.stringify(stocks)).toBe(snapshot);
    const tree = renderer(pool(stocks));
    for (const [value, color] of [[100, "positive"], [-300, "negative"]] as const) {
      const amount = amountNode(tree, value); expect(amount).toBeTruthy(); expect(direction(amount)).toBe(color);
    }
    expect(text(tree)).toMatch(/25(?:\.0)?%/); expect(text(tree)).toMatch(/75(?:\.0)?%/);
    expect(text(tree)).not.toMatch(/股数合计|总股数|投入权重|市值权重|项目概览/);
  });
  it("零是真实0和share0；未参与/null不进分母且不能伪0", () => {
    const stocks = [row(), row({ symbol: "ZERO", stockName: "真实零", pnlCny: 0 }), row({ symbol: "PENDING", stockName: "待确认", pnlCny: null }), row({ symbol: "NO", stockName: "未参与股票", pnlCny: 999999, hasParticipation: false })];
    const chart = helpers.buildLedger37AiStockPoolChart(stocks);
    expect(chart.rows.map(item => item.share)).toEqual([100, 0, null, null]);
    expect(chart.hasPending).toBe(true);
    const tree = renderer(pool(stocks));
    const zero = amountNode(tree, 0); expect(zero).toBeTruthy(); expect(direction(zero)).toBe("neutral");
    expect(text(tree)).toMatch(/待更新|待确认|未确认|待.*核算|暂无.*收益|数据.*缺|缺.*数据/);
    expect(text(tree)).toContain("未参与");
    expect(renderToStaticMarkup(tree)).not.toMatch(/999,999|999999/);
    const unknownOnly = renderer(pool([stocks[2]]));
    expect(text(unknownOnly)).not.toContain("¥0.00");
    expect(text(unknownOnly)).toMatch(/—|待确认|暂无|未确认/);
  });
  it.each([
    { stocks: [row({ pnlCny: 0 }), row({ symbol: "ZERO2", pnlCny: 0 })] },
    { stocks: [row({ pnlCny: null }), row({ symbol: "NONE", pnlCny: null, hasParticipation: false })] },
    { stocks: [] },
  ])("全0、未知或空数据不画虚构圆环 %#", ({ stocks }) => {
    const chart = helpers.buildLedger37AiStockPoolChart(stocks);
    expect(chart.gradient).toBeNull();
    expect(renderToStaticMarkup(renderer(pool(stocks)))).not.toContain("conic-gradient(");
  });
  it("先按maxAbs缩放，1e308的绝对收益和不溢出；非有限值仍未知", () => {
    const chart = helpers.buildLedger37AiStockPoolChart([row({ pnlCny: 1e308 }), row({ symbol: "BIG", pnlCny: -1e308 }), row({ symbol: "NAN", pnlCny: Number.NaN }), row({ symbol: "INF", pnlCny: Infinity })]);
    expect(chart.rows.map(item => item.share)).toEqual([50, 50, null, null]);
    expect(chart.gradient).not.toMatch(/NaN|Infinity/);
    expect(chart.hasPending).toBe(true);
  });
  it("所有symbol+currency都展示，closed/未参与保留；同名股票不合并，不截前N", () => {
    const stocks = Array.from({ length: 18 }, (_, index) => row({ symbol: `STOCK${index}`, stockName: `完整股票名称${index}`, pnlCny: index + 1, status: index % 2 ? "closed" : "holding", hasParticipation: index % 3 !== 0 }));
    stocks.push(row({ symbol: "SAME", currency: "CNY", stockName: "同一个名字" }), row({ symbol: "SAME", currency: "USDT", stockName: "同一个名字" }), row({ symbol: "OTHER", currency: "CNY", stockName: "同一个名字" }));
    const chart = helpers.buildLedger37AiStockPoolChart(stocks);
    expect(chart.rows).toHaveLength(stocks.length);
    expect(new Set(chart.rows.map(item => item.key)).size).toBe(stocks.length);
    expect(chart.rows.map(item => [item.symbol, item.currency])).toEqual(stocks.map(item => [item.symbol, item.currency]));
    const tree = renderer(pool(stocks));
    for (const stock of stocks) { expect(text(tree)).toContain(stock.stockName); expect(text(tree)).toContain(stock.symbol); }
    expect(text(tree)).toContain("当前"); expect(text(tree)).toContain("已结束"); expect(text(tree)).toContain("未参与");
    expect(text(tree)).toContain("CNY"); expect(text(tree)).toContain("USDT");
    const legendRows = nodes(tree).filter(node => node.props?.role === "listitem");
    expect(legendRows).toHaveLength(stocks.length);
    stocks.forEach((stock, index) => expect(text(legendRows[index])).toContain(stock.status === "closed" ? "已结束" : "当前"));
  });
  it("长stockName完整可换行且标题只有AI选股池；safe字段以外哨兵不泄漏", () => {
    const longName = "完整超长中文股票名称LongUnbrokenSecurityNameForSmallScreenNoTruncation";
    const sentinel = { password: "SECRET_PASSWORD_27371", price: "SECRET_PRICE_27372", quantity: "SECRET_QUANTITY_27373", categoryName: "SECRET_CATEGORY_27374" };
    const stocks = [Object.assign(row({ stockName: longName, currency: "CNY" }), sentinel), row({ symbol: "TOKEN", currency: "USDT", stockName: "保留原始USDT名字" })];
    const tree = renderer(Object.assign(pool(stocks), sentinel)); const html = renderToStaticMarkup(tree);
    expect(text(tree)).toContain(longName); expect(text(tree)).toContain("保留原始USDT名字");
    const headings = nodes(tree).filter(node => /^h[1-6]$/.test(String(node.type)));
    expect(headings.some(node => text(node) === "AI选股池")).toBe(true);
    expect(text(tree)).not.toContain("项目概览");
    const labels = nodes(tree).filter(node => text(node) === longName);
    expect(labels.some(node => /break-(?:words|all)|overflow-wrap/.test(String(node.props?.className ?? "")))).toBe(true);
    expect(html).not.toMatch(/truncate|line-clamp/);
    for (const value of Object.values(sentinel)) expect(html).not.toContain(value);
    expect(html).not.toMatch(/password|categoryName|<canvas|<table/);
  });
  it.each([false, true])("有效viewer作用域查询只走safe route（adminPreview=%s仍自己的数据）", adminPreview => {
    const data = pool(); const { query, tree } = wrapper({ data, isLoading: false, isFetching: false, isError: false }, 901, adminPreview);
    expect(query).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: 901 }, expect.objectContaining({ enabled: true, placeholderData: undefined }));
    expect(tree.props.pool).toBe(data);
  });
  it("AI未开通普通视角不展示，adminPreview只展示匹配自己的safe DTO", () => {
    const own = pool([row({ stockName: "自己的预览股票" })], { aiEnabled: false });
    expect(wrapper({ data: own }, 901).tree.props.pool).toBeUndefined();
    expect(wrapper({ data: own }, 901, true).tree.props.pool).toBe(own);
    const other = pool([row({ stockName: "OTHER_USER_ADMIN_SECRET" })], { aiEnabled: false, viewerUserId: 902 });
    const mismatch = wrapper({ data: other }, 901, true);
    expect(mismatch.tree.props.pool).toBeUndefined(); expect(mismatch.html).not.toContain("OTHER_USER_ADMIN_SECRET");
  });
  it("renderer loading/error不展示股票；更新状态保留股票；点击仅本地选择不改数据", () => {
    const data = pool([row(), row({ symbol: "TSLA", stockName: "特斯拉", pnlCny: -300 })]);
    expect(text(renderer(data, { loading: true }))).not.toContain("苹果");
    expect(text(renderer(data, { error: true }))).not.toContain("苹果");
    expect(text(renderer(data, { error: true }))).toMatch(/暂不可用|失败/);
    const normal = renderer(data), updating = renderer(data, { updating: true });
    expect(nodes(normal).filter(node => node.props?.role === "listitem").map(text)).toEqual(nodes(updating).filter(node => node.props?.role === "listitem").map(text));
    const state = stateHarness();
    const { Ledger37AiStockPoolRenderer } = actualModule(componentSource(), ["Ledger37AiStockPoolRenderer"], { useState: state.useState });
    const render = () => { state.reset(); return expand(Ledger37AiStockPoolRenderer({ pool: data })); };
    const before = render(); const first = nodes(before).find(node => node.props?.role === "listitem");
    const snapshot = JSON.stringify(data); first.props.onClick(); const after = render();
    expect(nodes(after).filter(node => node.props?.role === "listitem").map(text)).toEqual(nodes(before).filter(node => node.props?.role === "listitem").map(text));
    expect(nodes(after).find(node => node.props?.role === "listitem").props.className).not.toBe(first.props.className);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
  it.each([undefined, 0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("无效viewer %s禁止启用查询且丢弃旧数据", viewer => {
    const { query, tree, html } = wrapper({ data: pool([row({ stockName: "STALE_USER_SECRET" })]), isError: false }, viewer);
    expect(query.mock.calls[0][1]).toMatchObject({ enabled: false, placeholderData: undefined });
    expect(tree.props.pool).toBeUndefined(); expect(html).not.toContain("STALE_USER_SECRET");
  });
  it.each([
    { data: pool([row({ stockName: "ERROR_STALE_SECRET" })]), error: new Error("offline safe query failure"), isError: true },
    { data: pool([row({ stockName: "MISMATCH_SECRET" })], { viewerUserId: 902 }), isError: false },
  ])("失败或返回viewer不匹配时fail closed，不显示缓存数据 %#", result => {
    const { tree, html } = wrapper(result, 901);
    expect(tree.props.pool).toBeUndefined(); expect(html).not.toMatch(/ERROR_STALE_SECRET|MISMATCH_SECRET/);
  });
  it("组件只读safe query，renderer只用selection state，无业务写入/原始价成本量", () => {
    const source = componentSource();
    const file = ts.createSourceFile("pool.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const calls: string[] = []; const fields: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) calls.push(node.expression.getText(file));
      if (ts.isPropertyAccessExpression(node)) fields.push(node.name.text);
      ts.forEachChild(node, visit);
    }; visit(file);
    expect(calls.filter(call => /mutate|useMutation|fetch|axios|save|useEffect|useReducer/.test(call))).toEqual([]);
    expect(fields.filter(field => /^(?:password|price|quantity|categoryName|cost|buyPrice|currentPrice)$/.test(field))).toEqual([]);
    expect(calls.filter(call => /\.useQuery$/.test(call))).toEqual(["trpc.ledger.getMyLedger37AiStockPool.useQuery"]);
  });
});
