import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { parsePortfolioInstrument, portfolioDisplaySymbol } from "../shared/portfolio-instruments";

// Extract the actual component/function AST and run with inert hooks and tRPC spies only.
// No production component/module import, backend execution, API, network, database or writes.
const source = readFileSync(new URL("../client/src/components/ForcedLiquidationUserControl.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("actual.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate: (node: ts.Node) => boolean, root: ts.Node = ast): ts.Node[] {
  const result: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); }
  visit(root); return result;
}
function fn(name: string, scope: Record<string, any> = {}, dev = false): any {
  const declarations = find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  expect(declarations).toHaveLength(1);
  const value = declarations[0].getText(ast).replace(/^export\s+(default\s+)?/, "").replaceAll("import.meta.env.DEV", String(dev));
  const js = ts.transpileModule(`const actual = ${value};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function("React", ...Object.keys(scope), `${js}; return actual;`)(React, ...Object.values(scope));
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
  return { state, reset: () => { index = 0; }, useEffect: () => {},
    useRef: (initial: any) => { const i = index++; return state[i] ??= { current: initial }; },
    useState: (initial: any) => {
      const i = index++;
      if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
      return [state[i], (value: any) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
    },
  };
}
const symbols = { Fragment: React.Fragment, ...Object.fromEntries([
  "Button", "Input", "Search", "ChevronDown", "ForcedLiquidationUserImpactBody", "ForcedLiquidationUserLines", "ForcedLiquidationUserModeDraft",
].map(name => [name, name])) };
const number = fn("forcedLiquidationUserNumber");
const fresh = fn("freshForcedLiquidationUserImpact");
const total = fn("forcedLiquidationUserTotal", { forcedLiquidationUserNumber: number });
const profitScope = fn("forcedLiquidationUserProfitScope");
const profitTotal = fn("forcedLiquidationUserProfitTotal", { forcedLiquidationUserNumber: number, forcedLiquidationUserProfitScope: profitScope });
const filterUsers = fn("filterForcedLiquidationUsers");
const filterCategories = fn("filterForcedLiquidationUserCategories");
const payload = fn("forcedLiquidationUserMutationPayload");
const label = fn("forcedLiquidationUserLineLabel", { parsePortfolioInstrument, portfolioDisplaySymbol });
const quantity = fn("forcedLiquidationUserQuantity", { parsePortfolioInstrument });
const users = [{ userId: 31, displayName: "真实张三", username: "zhang" }, { userId: 32, displayName: "真实李四", username: "li" }];
const stock = { kind: "stock", participationId: 11, lotId: 77, symbol: "AAPL", stockName: "苹果", quantity: 2,
  entryDate: "2026-01-01", latestDate: "2026-11-24", currency: "USD", rawPnl: -100, countedPnl: -120,
  ineffectiveFunds: 20, ineffectiveFundsCny: 140, status: "ready", notice: "" };
const ordinary = { ...stock, kind: "ordinary", participationId: null, lotId: null, symbol: null, stockName: null, quantity: null,
  currency: "CNY", rawPnl: -100, countedPnl: -80, ineffectiveFunds: -20, ineffectiveFundsCny: -20 };
const categories = [
  { categoryId: 101, categoryName: "股票标签", accountingMode: "stock_portfolio", lifecycleStatus: "active", globalEnabled: true,
    override: { mode: "follow_tag", version: 9 }, participationStatus: "participating", ineffectiveFundsCny: 140, status: "ready", notice: "", lines: [stock] },
  { categoryId: 102, categoryName: "普通标签", accountingMode: "manual_balance", lifecycleStatus: "paused", globalEnabled: true,
    override: { mode: "exempt", version: 3 }, participationStatus: "participating", ineffectiveFundsCny: -20, status: "ready", notice: "", lines: [ordinary] },
  { categoryId: 103, categoryName: "未参与标签", accountingMode: "manual_balance", lifecycleStatus: "ended", globalEnabled: false,
    override: { mode: "follow_tag", version: 0 }, participationStatus: "none", ineffectiveFundsCny: 0, status: "ready", notice: "", lines: [] },
];
// Deliberately NOT equal to category sums: proves the UI does not recompute a subtotal locally.
const saved = { ledgerId: 37, targetUserId: 31, displayName: "真实张三", canEdit: true, basis: "member_raw_minus_counted",
  asOf: "2026-11-24", categories, totalImpactCny: 999, totalRawPnlCny: 2345.67, totalCountedPnlCny: -890.12,
  profitPendingCount: 0, profitScope: "complete", excludedProfitCategories: [], verifiedProfitImpactCny: 999,
  profitImpactMatchesTotal: true, status: "ready", pendingCount: 0, notice: "" };
const partial = { ...saved, profitScope: "verified_only", profitPendingCount: 3, profitImpactMatchesTotal: false,
  verifiedProfitImpactCny: 456.78,
  excludedProfitCategories: [
    { categoryId: 104, categoryName: "待核验股票标签超长名称ABCDEFGHIJKLMNOPQRSTUVWXYZ", lineCount: 2, notice: "缺少本人原始累计收益，整标签未包含。" },
    { categoryId: 105, categoryName: "待核验普通标签", lineCount: 1, notice: "缺少人民币汇率证据，整标签未包含。" },
  ] };
const button = (tree: any, words: string) => nodes(tree).find(node => ["Button", "button"].includes(node.type) && text(node).includes(words));
const row = (tree: any, id: number) => nodes(tree).find(node => node.type === "tr" && node.props["data-user-category"] === id);
const totalNode = (tree: any) => nodes(tree).find(node => node.props["data-user-total"] === "CNY");
const profitNode = (tree: any, kind: "raw" | "counted") => nodes(tree).find(node => node.props["data-user-profit"] === kind);
const totalsText = (tree: any) => [text(profitNode(tree, "raw")), text(profitNode(tree, "counted")), text(totalNode(tree))];
const draftNode = (tree: any) => nodes(tree).find(node => node.type === "ForcedLiquidationUserModeDraft");
const click = (node: any) => node.props.onClick({ stopPropagation: vi.fn() });
function selectorHarness({ viewing = false, data = { ledgerId: 37, users }, queryPatch = {}, dev = false }: any = {}) {
  const hook = hooks(), onPendingChange = vi.fn(), onSaved = vi.fn();
  const query = { data, isFetchedAfterMount: true, error: null, refetch: vi.fn(), ...queryPatch };
  const useQuery = vi.fn(() => query);
  const scope = { ...symbols, ...hook, useSearch: () => "", filterForcedLiquidationUsers: filterUsers,
    isForcedLiquidationUserReadonlyView: () => viewing, trpc: { ledger: { getForcedLiquidationUsers: { useQuery } } } };
  const props = { initialCategoryId: 102, onPendingChange, onSaved };
  return { hook, query, useQuery, onPendingChange, onSaved, render: () => { hook.reset(); return fn("ForcedLiquidationUserControl", scope, dev)(props); } };
}
function impactHarness({ viewing = false, dev = false, data = saved, queryPatch = {}, mutationPending = false, initialCategoryId = null }: any = {}) {
  const hook = hooks(), mutate = vi.fn(), onPendingChange = vi.fn(), onSaved = vi.fn();
  const invalidations: Record<string, any> = {};
  const utils = { ledger: new Proxy({}, { get: (_, name: string) => ({ invalidate: invalidations[name] ??= vi.fn(async () => {}) }) }),
    adminGetLedger37DividendAvailability: { invalidate: invalidations.adminGetLedger37DividendAvailability = vi.fn(async () => {}) } };
  const query = { data, isFetchedAfterMount: true, isPending: false, error: null, ...queryPatch,
    refetch: vi.fn(async () => ({ data: query.data, error: query.error, isSuccess: !query.error })) };
  const useQuery = vi.fn(() => query), toast = { success: vi.fn(), error: vi.fn() };
  let callbacks: any;
  const live = { viewing };
  const scope = { ...symbols, ...hook, toast,
    isForcedLiquidationUserReadonlyView: () => live.viewing, freshForcedLiquidationUserImpact: fresh,
    filterForcedLiquidationUserCategories: filterCategories, forcedLiquidationUserTotal: total,
    forcedLiquidationUserProfitTotal: profitTotal, forcedLiquidationUserProfitScope: profitScope,
    forcedLiquidationUserNumber: number, forcedLiquidationUserMutationPayload: payload,
    trpc: { useUtils: () => utils, ledger: {
      getForcedLiquidationUserImpact: { useQuery },
      setUserTagDownsideOverride: { useMutation: (options: any) => { callbacks = options; return { isPending: mutationPending, mutate }; } },
    } } };
  const props = { targetUserId: 31, onPendingChange, onSaved, initialCategoryId };
  return { hook, query, useQuery, mutate, invalidations, onPendingChange, onSaved, toast, live, callbacks: () => callbacks,
    render: () => { hook.reset(); return fn("ForcedLiquidationUserImpactBody", scope, dev)(props); } };
}
function modeHarness({ dev = false, viewing = false, pending = false, canEdit = true, category = categories[0] }: any = {}) {
  const hook = hooks(), onSave = vi.fn(), live = { viewing };
  const props = { category, pending, canEdit, isViewingAs: viewing, onSave };
  return { props, onSave, live, render: () => { hook.reset(); return fn("ForcedLiquidationUserModeDraft", {
    ...symbols, ...hook, isForcedLiquidationUserReadonlyView: () => live.viewing,
  }, dev)(props); } };
}
function open(h: ReturnType<typeof impactHarness>, id = 101) {
  click(nodes(row(h.render(), id)).find(node => node.type === "button")); return h.render();
}

 describe("用户×标签强平控制：离线真实前端契约", () => {
  it.each([[0, "0.00"], [1.25, "+1.25"], [-12.5, "-12.50"], [null, "待核验"], [undefined, "待核验"], [NaN, "待核验"], [Infinity, "待核验"], ["0", "待核验"]])("真实数字%s不混淆0/null且保留符号", (value, expected) => {
    expect(number(value)).toBe(expected);
  });
  it("差额方向以member raw−counted为准，不绝对值/非负裁剪，不计算全局当前段或钱包", () => {
    expect(total(saved)).toBe("+999.00");
    expect(total({ ...saved, totalImpactCny: -100 })).toBe("-100.00");
    expect(total({ ...saved, totalImpactCny: 0 })).toBe("0.00");
    expect(total({ ...saved, totalImpactCny: null })).toBe("待核验");
    expect(source).toContain("正数=强平少计，负数=相对原口径多计");
    expect(source).toContain("不是全局当前分段金额或钱包余额");
    expect(source).not.toMatch(/Math\.abs|Math\.max|\.reduce\(|rawPnl\s*-\s*|countedPnl\s*-/);
  });
  it("用户名heading后紧凑三行人民币金额右对齐，只展示独立server DTO、不反推或重算", () => {
    const tree = impactHarness().render();
    const summary = nodes(tree).find(node => node.type === "div" && node.props.children?.[0]?.type === "h3");
    expect(text(summary.props.children[0])).toBe("真实张三 · 全部标签");
    expect(summary.props["data-user-profit-scope"]).toBe("complete");
    expect(summary.props["data-profit-impact-matches-total"]).toBe("true");
    expect(nodes(summary).filter(node => node.type === "dt").map(text)).toEqual(["不受强平影响时获利", "当前设置下获利", "全部标签影响总计"]);
    expect(nodes(summary).filter(node => node.type === "dd").every(node => node.props.className.includes("text-right") && node.props.className.includes("tabular-nums"))).toBe(true);
    // All three are intentionally inconsistent with category sums AND each other, so reconstruction fails this assertion.
    expect(totalsText(tree)).toEqual(["+2,345.67 元", "-890.12 元", "+999.00 元"]);
    expect(text(summary)).toContain("不受影响时获利 − 当前设置下获利 = 影响总计");
    expect(text(summary)).toContain("当前设置按已保存用户×标签控制及标签规则核算，不改真实规则开关");
    const declarations = ["forcedLiquidationUserTotal", "forcedLiquidationUserProfitTotal", "forcedLiquidationUserProfitScope"].map(name =>
      find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)[0]);
    for (const declaration of declarations) {
      const arithmetic = find(node => ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken,
        ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(node.operatorToken.kind), declaration);
      expect(arithmetic).toHaveLength(0);
      expect(declaration.getText(ast)).not.toMatch(/visibleCategories|search|focusCategoryId|participatedOnly|override\.mode/);
    }
    expect(declarations[1].getText(ast)).toContain('kind === "raw" ? data.totalRawPnlCny : data.totalCountedPnlCny');
    expect(declarations[0].getText(ast)).toContain("forcedLiquidationUserNumber(data.totalImpactCny)");
  });
  it.each([
    [100, 80, 20, ["+100.00 元", "+80.00 元", "+20.00 元"]],
    [-100, -80, -20, ["-100.00 元", "-80.00 元", "-20.00 元"]],
    [0, 0, 0, ["0.00 元", "0.00 元", "0.00 元"]],
  ])("三数保留正负收益与真实零 raw=%s counted=%s impact=%s", (raw, counted, impact, expected) => {
    const tree = impactHarness({ data: { ...saved, totalRawPnlCny: raw, totalCountedPnlCny: counted, totalImpactCny: impact } }).render();
    expect(totalsText(tree)).toEqual(expected);
  });
  it("收益缺证据两新增总计一起待核验，与已知0影响及原pending/status独立", () => {
    for (const patch of [{ totalRawPnlCny: null, totalCountedPnlCny: null, profitPendingCount: 1 },
      { totalRawPnlCny: null }, { totalCountedPnlCny: null }, { profitPendingCount: 1 },
      { totalRawPnlCny: NaN }, { totalCountedPnlCny: Infinity }]) {
      const data = { ...saved, totalImpactCny: 0, ...patch };
      expect(profitTotal(data, "raw")).toBe("待核验"); expect(profitTotal(data, "counted")).toBe("待核验");
      expect(total(data)).toBe("0.00");
      expect(totalsText(impactHarness({ data }).render())).toEqual(["待核验", "待核验", "0.00 元"]);
    }
    const data = { ...saved, status: "pending", pendingCount: 1, totalImpactCny: null };
    expect(totalsText(impactHarness({ data }).render())).toEqual(["+2,345.67 元", "-890.12 元", "待核验"]);
  });
  it("partial即使profitPendingCount>0仍显示两项server获利，heading/金额明确已核验范围，同页列出所有未包含标签及原因", () => {
    const tree = impactHarness({ data: partial }).render();
    expect(profitScope(partial)).toBe("verified_only");
    expect(totalsText(tree)).toEqual(["+2,345.67 元", "-890.12 元", "+999.00 元"]);
    const summary = nodes(tree).find(node => node.props["data-user-profit-scope"] === "verified_only");
    expect(summary.props["data-profit-impact-matches-total"]).toBe("false");
    expect(text(nodes(tree).find(node => node.type === "h3"))).toBe("真实张三 · 已核验标签获利");
    expect(nodes(tree).filter(node => node.type === "dt").map(text)).toEqual([
      "已核验标签 · 不受强平影响时获利", "已核验标签 · 当前设置下获利", "全部标签影响总计",
    ]);
    const exclusions = nodes(tree).find(node => node.props["aria-label"] === "获利未包含标签");
    expect(exclusions.props.className).toContain("break-words");
    expect(exclusions.props["data-user-profit-excluded"]).toBe("true");
    expect(text(exclusions)).toContain(`未包含：${partial.excludedProfitCategories.map(category => category.categoryName).join("、")}（整标签排除）`);
    for (const category of partial.excludedProfitCategories) {
      const reason = nodes(exclusions).find(node => node.props.role === "status" && text(node).includes(category.categoryName));
      expect(text(reason)).toContain(category.notice);
      expect(reason.props.className).toContain("break-words");
    }
    expect(nodes(tree).some(node => node.props.role === "dialog")).toBe(false);
  });
  it("partial未匹配时不声明三数等式；只格式化server已核验差额而不反推，全部影响保留真实值", () => {
    const tree = impactHarness({ data: partial }).render();
    expect(text(tree)).not.toContain("获利 − 当前设置下获利 = 影响总计");
    expect(text(tree)).toContain("前两项获利差额只对应已核验标签，不代表全部标签影响总计");
    // Deliberately differs from both displayed profit difference and full impact: never reconstruct in the client.
    expect(text(tree)).toContain("已核验标签获利差额（服务端）：+456.78 元");
    expect(text(totalNode(tree))).toBe("+999.00 元");
    const matched = impactHarness({ data: { ...partial, profitImpactMatchesTotal: true, verifiedProfitImpactCny: 999 } }).render();
    expect(text(matched)).toContain("已核验标签：不受影响时获利 − 当前设置下获利 = 影响总计");
    expect(text(matched)).toContain("服务端已核验与全部标签一致");
  });
  it("partial获利ready不替代待核验完整影响；status/pendingCount及逐笔证据保持旧gate", () => {
    for (const patch of [{ status: "pending", pendingCount: 1, totalImpactCny: null }, { status: "pending" }, { pendingCount: 1 },
      { categories: [{ ...categories[0], status: "pending", lines: [{ ...stock, status: "pending" }] }] }]) {
      const data = { ...partial, ...patch };
      const tree = impactHarness({ data }).render();
      expect(totalsText(tree)).toEqual(["+2,345.67 元", "-890.12 元", "待核验"]);
      expect(text(tree)).not.toContain("获利 − 当前设置下获利 = 影响总计");
      expect(text(tree)).toContain("已核验标签获利差额（服务端）：+456.78 元");
      // Even a contradictory true flag cannot turn a pending full-impact DTO into a ready equation.
      expect(text(impactHarness({ data: { ...data, profitImpactMatchesTotal: true } }).render()))
        .not.toContain("获利 − 当前设置下获利 = 影响总计");
    }
  });
  it("全部参与标签被排除时null获利仍待核验，不显示0；全部标签已知零影响独立保留", () => {
    const data = { ...partial, categories: categories.slice(0, 2), totalRawPnlCny: null, totalCountedPnlCny: null,
      totalImpactCny: 0, verifiedProfitImpactCny: null, excludedProfitCategories: categories.slice(0, 2).map(category => ({
        categoryId: category.categoryId, categoryName: category.categoryName, lineCount: category.lines.length, notice: "原始获利缺证据，整标签排除。",
      })) };
    const tree = impactHarness({ data }).render();
    expect(profitTotal(data, "raw")).toBe("待核验"); expect(profitTotal(data, "counted")).toBe("待核验");
    expect(totalsText(tree)).toEqual(["待核验", "待核验", "0.00 元"]);
    expect(text(tree)).toContain("未包含：股票标签、普通标签（整标签排除）");
    expect(text(tree)).toContain("已核验标签获利差额（服务端）：待核验");
    expect(text(tree)).not.toContain("获利 − 当前设置下获利 = 影响总计");
    expect(totalsText(impactHarness({ data: { ...data, status: "pending", pendingCount: 2, totalImpactCny: null } }).render()))
      .toEqual(["待核验", "待核验", "待核验"]);
  });
  it("profit helper对旧DTO/非法scope/partial缺名单及新增必需字段缺失fail closed，不隐藏独立全标签影响", () => {
    const { profitScope: _scope, excludedProfitCategories: _excluded, verifiedProfitImpactCny: _verified,
      profitImpactMatchesTotal: _matched, ...legacy } = saved;
    const malformed = [legacy, ...[
      { profitScope: undefined }, { profitScope: null }, { profitScope: "partial" }, { profitScope: "all" },
      { excludedProfitCategories: undefined }, { verifiedProfitImpactCny: undefined }, { verifiedProfitImpactCny: Infinity },
      { profitImpactMatchesTotal: undefined }, { profitImpactMatchesTotal: "true" }, { profitPendingCount: -1 }, { profitPendingCount: 1.5 },
      { excludedProfitCategories: partial.excludedProfitCategories },
    ].map(patch => ({ ...saved, ...patch })), ...[
      { excludedProfitCategories: [] }, { excludedProfitCategories: null }, { excludedProfitCategories: {} },
      { excludedProfitCategories: [null] },
      { excludedProfitCategories: [{ ...partial.excludedProfitCategories[0], categoryName: " " }] },
      { excludedProfitCategories: [{ ...partial.excludedProfitCategories[0], notice: undefined }] },
    ].map(patch => ({ ...partial, ...patch }))];
    for (const data of malformed) {
      expect(profitScope(data)).toBeNull();
      expect(profitTotal(data, "raw")).toBe("待核验"); expect(profitTotal(data, "counted")).toBe("待核验");
      const tree = impactHarness({ data }).render();
      expect(totalsText(tree)).toEqual(["待核验", "待核验", "+999.00 元"]);
      expect(text(tree)).toContain("获利范围待核验");
      expect(text(tree)).not.toContain("获利 − 当前设置下获利 = 影响总计");
    }
  });
  it("partial名单及获利/差额由完整DTO提供，筛选/跳转/草稿不改变已核验总计或排除名单", () => {
    const h = impactHarness({ data: partial, initialCategoryId: 102 });
    const before = totalsText(h.render());
    expect(row(h.render(), 101)).toBeUndefined();
    click(button(h.render(), "显示全部"));
    const tree = open(h, 101);
    const draft = modeHarness({ category: draftNode(tree).props.category });
    click(button(draft.render(), "不受强平影响")); expect(text(draft.render())).toContain("草稿未保存");
    click(button(tree, "只看已参与"));
    nodes(h.render()).find(node => node.type === "Input").props.onChange({ target: { value: "无匹配标签" } });
    expect(nodes(h.render()).filter(node => node.props["data-user-category"] !== undefined)).toHaveLength(0);
    expect(totalsText(h.render())).toEqual(before);
    for (const category of partial.excludedProfitCategories) expect(text(h.render())).toContain(category.categoryName);
    expect(text(h.render())).toContain("已核验标签获利差额（服务端）：+456.78 元");
    expect(h.query.refetch).not.toHaveBeenCalled(); expect(h.mutate).not.toHaveBeenCalled();
  });
  it("总计任一pending/no_data证据即待核验，不展示部分假总和", () => {
    for (const patch of [{ status: "pending" }, { pendingCount: 1 }, { totalImpactCny: null },
      { categories: [{ ...categories[0], status: "pending" }] }, { categories: [{ ...categories[0], participationStatus: "pending" }] },
      { categories: [{ ...categories[0], lines: [{ ...stock, status: "pending" }] }] },
      { categories: [{ ...categories[0], lines: [{ ...stock, status: "no_data" }] }] }]) {
      expect(total({ ...saved, ...patch })).toBe("待核验");
      const h = impactHarness({ data: { ...saved, ...patch } }); expect(text(totalNode(h.render()))).toBe("待核验");
    }
  });
  it("fresh guard要求ledger/target/canEdit/basis/fetchedAfterMount且无error/viewAs/refresh", () => {
    const input = { data: saved, targetUserId: 31, isFetchedAfterMount: true, hasError: false, isViewingAs: false, refreshing: false };
    expect(fresh(input)).toBe(saved);
    for (const patch of [{ targetUserId: 32 }, { targetUserId: 0 }, { isFetchedAfterMount: false }, { hasError: true }, { isViewingAs: true }, { refreshing: true },
      { data: undefined }, { data: { ...saved, ledgerId: 52 } }, { data: { ...saved, canEdit: false } }, { data: { ...saved, basis: "segmented_price_drop" } }]) {
      expect(fresh({ ...input, ...patch })).toBeUndefined();
    }
  });
  it("默认不选用户、不挂统计；名单姓名/账号搜索且只保留真实ID", () => {
    const h = selectorHarness(); let tree = h.render();
    expect(nodes(tree).filter(node => node.type === "ForcedLiquidationUserImpactBody")).toHaveLength(0);
    expect(nodes(tree).find(node => node.type === "select").props.value).toBe("");
    expect(h.useQuery).toHaveBeenCalledWith({ ledgerId: 37 }, expect.objectContaining({ placeholderData: undefined, staleTime: 0, retry: false, refetchOnMount: "always" }));
    expect(filterUsers([...users, { userId: 0, displayName: "机器人", username: "fake" }], "")).toEqual(users);
    expect(filterUsers(users, " ZHANG ")).toEqual([users[0]]);
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: "李四" } }); tree = h.render();
    expect(nodes(tree).filter(node => node.type === "option")).toHaveLength(2);
    expect(text(tree)).toContain("真实李四");
  });
  it("切换真实用户以target key重挂，选定后用户搜索不改变统计；pending禁用户/搜索切换", () => {
    const h = selectorHarness(); let tree = h.render();
    nodes(tree).find(node => node.type === "select").props.onChange({ target: { value: "31" } }); tree = h.render();
    let body = nodes(tree).find(node => node.type === "ForcedLiquidationUserImpactBody");
    expect(body.key).toBe("31"); expect(body.props.initialCategoryId).toBe(102); expect(body.props.onSaved).toBe(h.onSaved);
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: "李四" } }); tree = h.render();
    expect(nodes(tree).find(node => node.type === "ForcedLiquidationUserImpactBody").props.targetUserId).toBe(31);
    body.props.onPendingChange(true); tree = h.render();
    expect(h.onPendingChange).toHaveBeenLastCalledWith(true);
    expect(nodes(tree).find(node => node.type === "select").props.disabled).toBe(true);
    expect(nodes(tree).find(node => node.type === "Input").props.disabled).toBe(true);
    nodes(tree).find(node => node.type === "select").props.onChange({ target: { value: "32" } });
    expect(nodes(h.render()).find(node => node.type === "ForcedLiquidationUserImpactBody").key).toBe("31");
    body.props.onPendingChange(false); tree = h.render();
    nodes(tree).find(node => node.type === "select").props.onChange({ target: { value: "32" } });
    expect(nodes(h.render()).find(node => node.type === "ForcedLiquidationUserImpactBody").key).toBe("32");
  });
  it("pending cleanup仅unmount，回调身份变化不触发false；读取最新callback ref", () => {
    const component = find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ForcedLiquidationUserControl")[0];
    const effects = find(node => ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect", component) as ts.CallExpression[];
    expect(effects).toHaveLength(1);
    expect(effects[0].arguments[1].getText(ast)).toBe("[]");
    expect(effects[0].arguments[0].getText(ast)).toContain("pendingCallbackRef.current?.(false)");
    expect(component.getText(ast)).toContain("pendingCallbackRef.current = onPendingChange");
    const body = find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ForcedLiquidationUserImpactBody")[0];
    const bodyEffects = find(node => ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect", body) as ts.CallExpression[];
    expect(bodyEffects.every(effect => !effect.arguments[0].getText(ast).includes("onPendingChange"))).toBe(true);
  });
  it.each([{ isFetchedAfterMount: false }, { error: new Error("expired") }, { data: { ledgerId: 52, users } }])("名单旧缓存或范围不匹配不可挂统计%o", queryPatch => {
    const h = selectorHarness({ queryPatch }); const tree = h.render();
    expect(nodes(tree).find(node => node.type === "select").props.disabled).toBe(true);
    expect(nodes(tree).filter(node => node.type === "option")).toHaveLength(1);
  });
  it("统计查询禁placeholder、stale0/retryfalse/fetchedAfterMount门控，旧user DTO不闪现", () => {
    const h = impactHarness(); h.render();
    expect(h.useQuery).toHaveBeenCalledWith({ ledgerId: 37, targetUserId: 31 }, expect.objectContaining({ enabled: true,
      placeholderData: undefined, staleTime: 0, retry: false, refetchOnMount: "always", refetchOnWindowFocus: false }));
    for (const options of [{ data: { ...saved, targetUserId: 32 } }, { data: { ...saved, canEdit: false } },
      { queryPatch: { isFetchedAfterMount: false } }, { queryPatch: { error: new Error("expired") } }]) {
      const tree = impactHarness(options).render(); expect(totalNode(tree)).toBeUndefined();
      expect(profitNode(tree, "raw")).toBeUndefined(); expect(profitNode(tree, "counted")).toBeUndefined();
      expect(nodes(tree).filter(node => node.type === "table")).toHaveLength(0);
    }
  });
  it("紧凑单表两层inline，无dialog；标签总计服务端only、已参与默认true，可显示未参与", () => {
    const h = impactHarness(); let tree = h.render();
    expect(nodes(tree).filter(node => node.type === "table")).toHaveLength(1);
    expect(nodes(tree).find(node => node.type === "table").props.className).toContain("table-fixed");
    expect(nodes(tree).filter(node => node.type === "th").map(text)).toEqual(["标签", "影响（元）", "用户控制"]);
    expect(row(tree, 103)).toBeUndefined(); expect(text(totalNode(tree))).toBe("+999.00 元");
    expect(text(row(tree, 101))).toContain("跟随标签"); expect(text(row(tree, 102))).toContain("不受强平影响");
    tree = open(h);
    const inline = nodes(tree).find(node => node.type === "tr" && node.props["data-user-inline-detail"] === 101);
    expect(nodes(inline).find(node => node.type === "td").props.colSpan).toBe(3);
    expect(nodes(inline).filter(node => ["ForcedLiquidationUserLines", "ForcedLiquidationUserModeDraft"].includes(node.type)).map(node => node.type)).toEqual(["ForcedLiquidationUserLines", "ForcedLiquidationUserModeDraft"]);
    expect(draftNode(tree).key).toBe("31:101:9:follow_tag");
    click(button(tree, "只看已参与")); tree = h.render(); expect(text(row(tree, 103))).toContain("未参与");
    expect(text(totalNode(tree))).toBe("+999.00 元");
    expect(source).not.toMatch(/\b(?:Dialog|DialogContent|Portal)\b|overflow-x-auto|min-w-\[\d+px\]/);
    const html = renderToStaticMarkup(nodes(tree).find(node => node.type === "table").props.children[0]);
    expect(html).toContain("40%"); expect(html).toContain("31%");
  });
  it("标签/资产/已参与/跳转标签筛选不改变完整server total，资产搜索保留整标签全部笔", () => {
    const full = [{ ...categories[0], lines: [stock, { ...stock, lotId: 78, symbol: "CRYPTO:UNI-USDT" }] }, ...categories.slice(1)];
    expect(filterCategories(full, "aapl", true, null)[0].lines).toHaveLength(2);
    expect(filterCategories(full, "", false, 103)).toEqual([full[2]]);
    const h = impactHarness({ data: { ...saved, categories: full } }); let tree = h.render();
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: "aapl" } }); tree = h.render();
    expect(nodes(tree).filter(node => node.props["data-user-category"] !== undefined)).toHaveLength(1);
    expect(totalsText(tree)).toEqual(["+2,345.67 元", "-890.12 元", "+999.00 元"]); expect(h.query.refetch).not.toHaveBeenCalled();
    click(button(tree, "只看已参与")); tree = h.render();
    nodes(tree).find(node => node.type === "Input").props.onChange({ target: { value: "不存在的筛选" } }); tree = h.render();
    expect(nodes(tree).filter(node => node.props["data-user-category"] !== undefined)).toHaveLength(0);
    expect(totalsText(tree)).toEqual(["+2,345.67 元", "-890.12 元", "+999.00 元"]);
    const focus = impactHarness({ initialCategoryId: 102 }); tree = focus.render();
    expect(row(tree, 101)).toBeUndefined(); expect(row(tree, 102)).toBeDefined();
    expect(totalsText(tree)).toEqual(["+2,345.67 元", "-890.12 元", "+999.00 元"]);
    click(button(tree, "显示全部")); tree = focus.render(); expect(row(tree, 101)).toBeDefined();
    expect(totalsText(tree)).toEqual(["+2,345.67 元", "-890.12 元", "+999.00 元"]);
  });
  it("本人逐笔明细原币/人民币/真实份额/日期，A股中文美股ticker数字币symbol，普通一笔", () => {
    expect(label({ ...stock, symbol: "600519.SH", stockName: "贵州茅台 600519.SH" })).toBe("贵州茅台");
    expect(label(stock)).toBe("AAPL"); expect(label({ ...stock, symbol: "CRYPTO:UNI-USDT" })).toBe("UNI/USDT");
    expect(quantity(stock)).toBe("2股"); expect(quantity({ ...stock, symbol: "CRYPTO:UNI-USDT", quantity: 0.00000001 })).toBe("0.00000001币");
    expect(quantity({ ...stock, quantity: null })).toBe("待核验"); expect(quantity({ ...stock, quantity: 0 })).toBe("0股");
    const lines = fn("ForcedLiquidationUserLines", { ...symbols, forcedLiquidationUserLineLabel: label,
      forcedLiquidationUserQuantity: quantity, forcedLiquidationUserNumber: number });
    const tree = lines({ category: { ...categories[0], lines: [stock, { ...stock, lotId: 78, quantity: 1 }] } });
    expect(nodes(tree).filter(node => node.props["data-user-line"] === "stock")).toHaveLength(2);
    expect(text(tree)).toContain("本人实际持有 2股"); expect(text(tree)).toContain("参与日 2026-01-01");
    expect(text(tree)).toContain("原始累计收益 raw-100 USD"); expect(text(tree)).toContain("差额 raw − 计入+20 USD");
    expect(text(tree)).toContain("人民币影响+140.00 元");
    expect(nodes(lines({ category: categories[1] })).filter(node => node.props["data-user-line"] === "ordinary")).toHaveLength(1);
    expect(text(lines({ category: categories[1] }))).toContain("-20.00 元");
    const none = lines({ category: categories[2] }); expect(text(none)).toContain("未参与此标签");
    expect(nodes(none).filter(node => node.type === "dl")).toHaveLength(0); expect(text(none)).not.toContain("收益 raw0");
  });
  it("草稿两态无自动保存、已保存统计不变，必须明确保存；version来自该行override", () => {
    const h = modeHarness(); let tree = h.render();
    expect(h.onSave).not.toHaveBeenCalled(); expect(button(tree, "保存此用户").props.disabled).toBe(true);
    click(button(tree, "不受强平影响")); tree = h.render();
    expect(text(tree)).toContain("草稿未保存"); expect(text(tree)).toContain("全部历史及累计恢复正常原始收益（raw）");
    expect(h.onSave).not.toHaveBeenCalled(); expect(button(tree, "保存此用户").props.disabled).toBe(false);
    click(button(tree, "保存此用户")); expect(h.onSave).toHaveBeenCalledWith("exempt");
    const body = impactHarness(); const before = totalsText(open(body)); draftNode(body.render()).props.onSave("exempt");
    expect(body.mutate).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 101, targetUserId: 31, mode: "exempt", expectedVersion: 9 });
    expect(totalsText(body.render())).toEqual(before); expect(body.onPendingChange).toHaveBeenLastCalledWith(true);
    expect(body.mutate.mock.calls[0][0]).not.toHaveProperty("actorUserId");
  });
  it("DEV真实草稿两态切换不改变三数，跟随已保存用户豁免及标签开关而非本地强制全开", () => {
    const body = impactHarness({ dev: true }); const tree = open(body, 102), before = totalsText(tree);
    const draft = modeHarness({ dev: true, category: draftNode(tree).props.category });
    click(button(draft.render(), "跟随标签"));
    expect(text(draft.render())).toContain("草稿未保存");
    expect(totalsText(body.render())).toEqual(before);
    expect(body.query.data.categories[1].override.mode).toBe("exempt");
    expect(body.query.data.categories[2].globalEnabled).toBe(false);
    expect(body.query.refetch).not.toHaveBeenCalled(); expect(body.mutate).not.toHaveBeenCalled(); expect(draft.onSave).not.toHaveBeenCalled();
  });
  it("payload allowlist仅五个strict fields且拒绝坏范围/版本/模式", () => {
    expect(Object.keys(payload(31, 101, "exempt", 9)).sort()).toEqual(["ledgerId", "categoryId", "targetUserId", "mode", "expectedVersion"].sort());
    expect(payload(31, 103, "follow_tag", 0)?.expectedVersion).toBe(0);
    for (const args of [[0, 101, "exempt", 9], [31, -1, "exempt", 9], [31, 101, "exempt", -1], [31, 101, "exempt", 1.5], [31, 101, "bad", 9]]) expect(payload(...args)).toBeNull();
    const declaration = find(node => ts.isFunctionDeclaration(node) && node.name?.text === "forcedLiquidationUserMutationPayload")[0];
    const returns = find(node => ts.isReturnStatement(node) && !!node.expression && ts.isObjectLiteralExpression(node.expression), declaration) as ts.ReturnStatement[];
    expect(returns).toHaveLength(1);
    expect((returns[0].expression as ts.ObjectLiteralExpression).properties.map(prop => prop.name!.getText(ast))).toEqual(["ledgerId", "categoryId", "targetUserId", "mode", "expectedVersion"]);
  });
  it("DEV可试填但正式mutation绝对blocked，不假保存；viewAs/canEdit二次校验", () => {
    const dev = modeHarness({ dev: true }); click(button(dev.render(), "不受强平影响")); const tree = dev.render();
    expect(text(tree)).toContain("草稿未保存"); expect(button(tree, "保存此用户").props.disabled).toBe(true);
    click(button(tree, "保存此用户")); expect(dev.onSave).not.toHaveBeenCalled();
    const h = impactHarness({ dev: true }); draftNode(open(h)).props.onSave("exempt"); expect(h.mutate).not.toHaveBeenCalled();
    expect(text(selectorHarness({ dev: true }).render())).toContain("正式写入已禁用，不会假保存");
    for (const opts of [{ viewing: true }, { canEdit: false }, { pending: true }]) {
      const mode = modeHarness(opts); expect(button(mode.render(), "不受强平影响").props.disabled).toBe(true);
      click(button(mode.render(), "不受强平影响")); click(button(mode.render(), "保存")); expect(mode.onSave).not.toHaveBeenCalled();
    }
    const changed = impactHarness(); const oldDraft = draftNode(open(changed)); changed.live.viewing = true;
    oldDraft.props.onSave("exempt"); expect(changed.mutate).not.toHaveBeenCalled(); expect(totalNode(changed.render())).toBeUndefined();
    const denied = impactHarness({ viewing: true }); denied.render(); expect(denied.useQuery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ enabled: false }));
  });
  it.each(["?viewAs=31", "?viewAs=", "?viewAs=bad", "?viewAs=0", "?readonly=1", "?readonly=true"])("调用前同源只读guard %s fail-closed", search => {
    const window = { location: { search }, sessionStorage: { getItem: () => null } };
    expect(fn("isForcedLiquidationUserReadonlyView", { window })()).toBe(true);
  });
  it("session包括无效viewAs、SSR及存储异常全部拒绝，正常owner无session代看才放行", () => {
    for (const stored of ["31", "", "0", "bad"]) expect(fn("isForcedLiquidationUserReadonlyView", {
      window: { location: { search: "" }, sessionStorage: { getItem: () => stored } },
    })()).toBe(true);
    expect(fn("isForcedLiquidationUserReadonlyView", { window: undefined })()).toBe(true);
    expect(fn("isForcedLiquidationUserReadonlyView", { window: { location: { search: "" }, sessionStorage: { getItem: () => { throw new Error("denied"); } } } })()).toBe(true);
    expect(fn("isForcedLiquidationUserReadonlyView", { window: { location: { search: "" }, sessionStorage: { getItem: () => null } } })()).toBe(false);
    const denied = selectorHarness({ viewing: true }); expect(text(denied.render())).toContain("代看或只读");
    expect(denied.useQuery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ enabled: false }));
    expect(source).not.toContain('from "@/pages/ForcedLiquidationSettings"');
  });
  it("保存pending禁过滤/标签切换及重复提交，并回报父pending", () => {
    const h = impactHarness(); const tree = open(h); draftNode(tree).props.onSave("exempt");
    draftNode(tree).props.onSave("exempt"); expect(h.mutate).toHaveBeenCalledTimes(1);
    let pendingTree = h.render(); expect(nodes(pendingTree).find(node => node.type === "Input").props.disabled).toBe(true);
    expect(button(pendingTree, "只看已参与").props.disabled).toBe(true);
    expect(nodes(row(pendingTree, 102)).find(node => node.type === "button").props.disabled).toBe(true);
    click(nodes(row(pendingTree, 102)).find(node => node.type === "button"));
    nodes(pendingTree).find(node => node.type === "Input").props.onChange({ target: { value: "不存在" } });
    pendingTree = h.render(); expect(row(pendingTree, 101)).toBeDefined(); expect(draftNode(pendingTree).props.category.categoryId).toBe(101);
    expect(draftNode(pendingTree).props.pending).toBe(true); expect(h.onPendingChange).toHaveBeenLastCalledWith(true);
  });
  it("成功保存invalidate本用户impact及概览/日历/分红可用，global list仅onSaved，不改全局rules", async () => {
    const h = impactHarness(); draftNode(open(h)).props.onSave("exempt");
    h.query.data = { ...saved, categories: [{ ...categories[0], override: { mode: "exempt", version: 10 } }], totalImpactCny: 0 };
    await h.callbacks().onSuccess();
    expect(h.invalidations.getForcedLiquidationUserImpact).toHaveBeenCalledWith({ ledgerId: 37, targetUserId: 31 });
    for (const name of ["getMyStockTagOverview", "getMyStockTagObservationOverview", "getMyOrdinaryTagObservationOverview", "getMyOrdinaryTagDownsideValuations", "getStockTagCalendar", "getCalendarData", "getReport", "adminGetLedger37DividendAvailability"]) {
      expect(h.invalidations[name]).toHaveBeenCalledWith({ ledgerId: 37 });
    }
    expect(h.invalidations.getForcedLiquidationSettings).toBeUndefined(); expect(h.invalidations.getStockLotDownsideRule).toBeUndefined();
    expect(h.onSaved).toHaveBeenCalledTimes(1); expect(h.query.refetch).toHaveBeenCalledTimes(1);
    expect(h.onPendingChange).toHaveBeenLastCalledWith(false); expect(text(totalNode(h.render()))).toBe("0.00 元");
  });
  it("并发保存失败先隐藏旧统计，重读override版本重新挂草稿，禁止old stats fresh", async () => {
    const h = impactHarness(); draftNode(open(h)).props.onSave("exempt");
    let resolve: (value: any) => void = () => {};
    h.query.refetch.mockImplementation(() => new Promise(done => { resolve = done; }));
    const task = h.callbacks().onError(new Error("CONFLICT"));
    expect(totalNode(h.render())).toBeUndefined(); expect(text(h.render())).toContain("旧统计已隐藏");
    await Promise.resolve(); await Promise.resolve();
    h.query.data = { ...saved, categories: [{ ...categories[0], override: { mode: "exempt", version: 10 } }], totalImpactCny: 0 };
    resolve({ data: h.query.data, isSuccess: true, error: null }); await task;
    expect(h.onSaved).not.toHaveBeenCalled(); expect(h.onPendingChange).toHaveBeenLastCalledWith(false);
    const latest = h.render(); expect(draftNode(latest).key).toBe("31:101:10:exempt"); expect(text(totalNode(latest))).toBe("0.00 元");
  });
  it("并发刷新失败即使cache保留无error旧data也不能重新展示；重试范围必须匹配", async () => {
    const h = impactHarness(); draftNode(open(h)).props.onSave("exempt");
    h.query.refetch.mockResolvedValueOnce({ data: saved, error: new Error("offline"), isSuccess: false });
    await h.callbacks().onError(new Error("CONFLICT")); expect(totalNode(h.render())).toBeUndefined();
    expect(h.onPendingChange).toHaveBeenLastCalledWith(false); expect(button(h.render(), "重新核验").props.disabled).toBe(false);
    h.query.refetch.mockResolvedValueOnce({ data: { ...saved, targetUserId: 32 }, error: null, isSuccess: true });
    click(button(h.render(), "重新核验")); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(totalNode(h.render())).toBeUndefined();
  });
  it("only指定三API，用户名单/统计读与严格mutation，不执行任何production模块或网络", () => {
    const calls = find(node => ts.isCallExpression(node) && /\.use(?:Query|Mutation)$/.test(node.expression.getText(ast))) as ts.CallExpression[];
    expect(calls.map(node => node.expression.getText(ast))).toEqual([
      "trpc.ledger.getForcedLiquidationUsers.useQuery", "trpc.ledger.getForcedLiquidationUserImpact.useQuery", "trpc.ledger.setUserTagDownsideOverride.useMutation",
    ]);
    expect(source).not.toMatch(/actorUserId:|ownerId:|viewAsUserId:|userRole:|\bfetch\(|\.query\(/);
    const exports = find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ForcedLiquidationUserControl")[0] as ts.FunctionDeclaration;
    expect(exports.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)).toBe(true);
  });
});
