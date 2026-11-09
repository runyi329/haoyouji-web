import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 只读源码 AST；VM 仅执行真实组件、回调、导航函数和 effect。
// 不导入应用/routers/DB、不起服务、不访问网络、不执行资金 mutation。
function ast(relative: string) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
const page = ast("../client/src/pages/T0Journal.tsx");
const exporter = ast("../client/src/components/OrderCardImageDownload.tsx");
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return result;
}
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing production AST node: ${name}`);
  return value;
}
function declaration(root: ts.Node, name: string) {
  return required(nodes(root, ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
}
const variableDeclarations = new Map<ts.Node, ts.VariableDeclaration[]>([
  [page, nodes(page, ts.isVariableDeclaration)],
  [exporter, nodes(exporter, ts.isVariableDeclaration)],
]);
function initializer(name: string, root: ts.Node = page) {
  return required(required(variableDeclarations.get(root), "cached AST declarations").find(node => node.name.getText() === name)?.initializer, name);
}
function compiled<T>(text: string, deps: Record<string, unknown>, result: string): T {
  const output = ts.transpileModule(text, {
    fileName: "isolated.tsx", compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return runInNewContext(`${output}\n${result};`, { ...deps, exports: {} }, { timeout: 1000 }) as T;
}
function expression<T>(node: ts.Node, deps: Record<string, unknown> = {}): T {
  return compiled<T>(`const isolated = (${node.getText()});`, deps, "isolated");
}
function production<T>(name: string, deps: Record<string, unknown> = {}): T {
  return compiled<T>(declaration(page, name).getText(), deps, name);
}
type Direction = "deposit" | "withdrawal";
type PayoutCallback = (direction: Direction, userId: number) => void;
type OpenPayout = (direction: Direction, userId?: number, returnToTeam?: boolean, returnToSettlement?: boolean) => void;
type Income = { order: number; commission: number; shared: number; total: number; orderCount: number; commissionCount: number; sharedCount: number };
type Member = { userId: number; name: string; income: Income };
type Report = { members: Member[]; period: { weekStartBjt: string } };
type Element = React.ReactElement<Record<string, any>>;
function elements(value: unknown, result: Element[] = []): Element[] {
  if (Array.isArray(value)) value.forEach(item => elements(item, result));
  else if (React.isValidElement<Record<string, any>>(value)) { result.push(value); elements(value.props.children, result); }
  return result;
}
function content(value: unknown): string {
  if (Array.isArray(value)) return value.map(content).join("");
  if (React.isValidElement<Record<string, any>>(value)) return content(value.props.children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function member(userId: number, name: string, parts = [12.345678, -0.456789, 0.987654]): Member {
  const [order, commission, shared] = parts;
  return { userId, name, income: { order, commission, shared, total: parts.reduce((sum, amount) => sum + amount, 0), orderCount: 2, commissionCount: 1, sharedCount: 1 } };
}
const current: Report = freeze({ period: { weekStartBjt: "2026-11-09" }, members: [member(101, "甲"), member(102, "乙"), member(103, "零收益成员", [0, 0, 0])] });
const historical: Report = freeze({ period: { weekStartBjt: "2026-11-02" }, members: [member(701, "历史成员")] });
const formatAmount = production<(amount: number) => string>("formatT0SettlementAmount");
const memberDeclaration = declaration(page, "T0AdminWeeklySettlementMemberList");
const memberCall = required(nodes(page, ts.isJsxSelfClosingElement).find(node => node.tagName.getText() === "T0AdminWeeklySettlementMemberList"), "settlement member list call");
const memberCallGate = memberCall.parent;
if (!ts.isBinaryExpression(memberCallGate)) throw new Error("Expected production admin overview gate");
const payoutAttribute = required(memberCall.attributes.properties.find((node): node is ts.JsxAttribute => ts.isJsxAttribute(node) && node.name.getText() === "onPayoutEntry"), "onPayoutEntry attribute");
const payoutAttributeValue = required(payoutAttribute.initializer, "onPayoutEntry value");
if (!ts.isJsxExpression(payoutAttributeValue)) throw new Error("Expected payout callback JSX expression");
const payoutCallbackNode = required(payoutAttributeValue.expression, "onPayoutEntry expression");
function render(expandedMemberId: number | null, onPayoutEntry?: PayoutCallback, report = current, onExpandedMemberChange = vi.fn(), formatter = formatAmount) {
  const component = production<(props: { report: Report; expandedMemberId: number | null; onPayoutEntry?: PayoutCallback; onExpandedMemberChange: (id: number | null) => void }) => Element>("T0AdminWeeklySettlementMemberList", { React, formatT0SettlementAmount: formatter, ArrowDownLeft: "icon-deposit", ArrowUpRight: "icon-withdrawal" });
  return component({ report, expandedMemberId, onPayoutEntry, onExpandedMemberChange });
}
function action(tree: unknown, label: string) {
  return required(elements(tree).find(node => node.type === "button" && node.props["aria-label"] === label), label);
}
const resetSetterNames = ["setEditingPayoutLog", "setPayoutAmount", "setPayoutDepositInputMode", "setPayoutEthQuantity", "setPayoutEthReferencePrice", "setPayoutEthReferencePriceIsManual", "setPayoutNote", "setPayoutSubmitNotice", "setPayoutOccurredOn"];
function navigationHarness(canManage = true, returns = { payoutReturnToSettlement: false, payoutReturnToTeam: false }) {
  const events: Array<[string, unknown]> = [];
  const state: Record<string, unknown> = Object.fromEntries(resetSetterNames.map(name => [name, "previous-user-dirty-value"]));
  const setters = Object.fromEntries([...resetSetterNames, "setShowPayoutLog", "setShowTotalNetProfitDetail", "setIsPayoutListEditing", "setDeletePayoutLogId", "setTeamDepositMemberId", "setTeamAnnualizedMemberId"].map(name => [name, vi.fn((value: unknown) => { state[name] = value; events.push([name, value]); })]));
  const setLocation = vi.fn((url: string) => { events.push(["navigate", url]); });
  const deps = { ...setters, canManage, ledgerId: 52, payoutTargetRelatedUserId: 999, getBeijingDateInputValue: () => "2026-11-09", setLocation };
  const resetPayoutLogForm = expression<() => void>(initializer("resetPayoutLogForm"), deps);
  const open = expression<OpenPayout>(initializer("openPayoutEntryPage"), deps);
  const close = expression<() => void>(initializer("closePayoutEntryPage"), { ...deps, ...returns, resetPayoutLogForm });
  function callback(selectedAdminSettlementReport: Report | undefined = undefined) {
    return expression<PayoutCallback | undefined>(payoutCallbackNode, {
      ...deps, selectedAdminSettlementReport, displayedWeeklySettlementCenter: { current }, openPayoutEntryPage: open,
    });
  }
  return { events, state, setters, setLocation, deps, open, close, callback };
}
function urls(search: string) {
  const searchParams = expression<URLSearchParams>(initializer("searchParams"), { URLSearchParams, search });
  const deps = { searchParams };
  const payoutEntryDirection = expression<Direction | null>(initializer("payoutEntryDirection"), deps);
  const payoutUserIdFromUrlValue = expression<number>(initializer("payoutUserIdFromUrlValue"), deps);
  return {
    requestedSettlementTab: expression<boolean>(initializer("requestedSettlementTab"), deps),
    payoutReturnToSettlement: expression<boolean>(initializer("payoutReturnToSettlement"), deps),
    payoutReturnToTeam: expression<boolean>(initializer("payoutReturnToTeam"), deps),
    payoutEntryDirection,
    payoutUserIdFromUrl: expression<number>(initializer("payoutUserIdFromUrl"), { ...deps, payoutEntryDirection, payoutUserIdFromUrlValue }),
  };
}

describe("结算资金入口：真实成员组件与 onClick", () => {
  it("未展开无资金入口；展开且有可选 callback 才在订单/分佣/共享下显示两项操作", () => {
    const callback = vi.fn();
    expect(content(render(null, callback))).not.toContain("资金操作");
    const withoutCallback = render(101);
    expect(content(withoutCallback)).not.toContain("资金操作");
    expect(elements(withoutCallback).filter(node => node.props["aria-label"])).toHaveLength(0);
    const tree = render(101, callback);
    const all = elements(tree);
    const controls = required(all.find(node => node.props["data-card-export-hide"] === "true"), "资金操作区");
    expect(content(controls)).toBe("资金操作充值提现");
    const breakdown = required(all.find(node => node.props.className?.includes("grid-cols-3")), "收益构成");
    expect(all.indexOf(breakdown)).toBeLessThan(all.indexOf(controls));
    expect(content(breakdown)).toContain("订单");
    expect(content(breakdown)).toContain("分佣");
    expect(content(breakdown)).toContain("共享");
    expect(elements(controls).filter(node => node.type === "button")).toHaveLength(2);
    expect(elements(action(tree, "为甲充值")).some(node => node.type === "icon-deposit")).toBe(true);
    expect(elements(action(tree, "为甲提现")).some(node => node.type === "icon-withdrawal")).toBe(true);
    expect(callback).not.toHaveBeenCalled();
    const propsType = required(memberDeclaration.parameters[0]?.type, "member props type");
    expect(nodes(propsType, ts.isPropertySignature).find(node => node.name.getText() === "onPayoutEntry")?.questionToken).toBeDefined();
  });

  it("真实展开/收起 handler 按 ID 更新；多人连续点击 deposit/withdrawal 精确传 ID 不串用户", () => {
    const expanded = vi.fn();
    const callback = vi.fn();
    const collapsed = render(null, callback, current, expanded);
    elements(collapsed).filter(node => node.type === "button")[1].props.onClick();
    expect(expanded).toHaveBeenLastCalledWith(102);
    elements(render(102, callback, current, expanded)).filter(node => node.type === "button")[1].props.onClick();
    expect(expanded).toHaveBeenLastCalledWith(null);
    for (const id of [101, 102, 103, 101]) {
      const row = required(current.members.find(item => item.userId === id), "member");
      const tree = render(id, callback);
      action(tree, `为${row.name}充值`).props.onClick();
      action(tree, `为${row.name}提现`).props.onClick();
    }
    expect(callback.mock.calls).toEqual([101, 102, 103, 101].flatMap(id => [["deposit", id], ["withdrawal", id]]));
  });

  it("零收益成员仍可充值/提现；快捷操作只导航，不更改原总额和三项收益", () => {
    const before = JSON.stringify(current);
    const h = navigationHarness();
    const formatter = vi.fn(formatAmount);
    const tree = render(103, required(h.callback(), "admin callback"), current, vi.fn(), formatter);
    action(tree, "为零收益成员充值").props.onClick();
    action(tree, "为零收益成员提现").props.onClick();
    expect(h.setLocation.mock.calls.map(([url]) => url)).toEqual([
      "/ledger/52/t0-journal?payout=deposit&payoutUserId=103&payoutReturn=settlement",
      "/ledger/52/t0-journal?payout=withdrawal&payoutUserId=103&payoutReturn=settlement",
    ]);
    const expected = [...current.members.map(row => row.income.total), 0, 0, 0];
    expect(formatter.mock.calls).toHaveLength(expected.length);
    formatter.mock.calls.forEach(([amount], index) => expect(amount).toBeCloseTo(expected[index], 10));
    expect(JSON.stringify(current)).toBe(before);
  });
});

describe("管理员结算接入、历史报表与固定导航", () => {
  it("真实调用仅在 admin settlement overview；无管理权限不传 callback", () => {
    expect(nodes(page, ts.isJsxSelfClosingElement).filter(node => node.tagName.getText() === "T0AdminWeeklySettlementMemberList")).toHaveLength(1);
    const h = navigationHarness();
    for (const [view, tab, canManage, visible] of [["admin", "overview", true, true], ["admin", "overview", false, true], ["admin", "reconciliation", true, false], ["member", "overview", true, false]] as const) {
      const tree = expression<Element | false>(memberCallGate, {
        React, T0AdminWeeklySettlementMemberList: "member-list", displayedWeeklySettlementCenter: { view, current }, adminSettlementTab: tab,
        canManage, selectedAdminSettlementReport: undefined, expandedSettlementMemberId: 101, setExpandedSettlementMemberId: vi.fn(),
        setShowTotalNetProfitDetail: h.setters.setShowTotalNetProfitDetail, openPayoutEntryPage: h.open,
      });
      expect(React.isValidElement(tree)).toBe(visible);
      if (tree) expect(typeof tree.props.onPayoutEntry).toBe(canManage ? "function" : "undefined");
    }
    let parent: ts.Node | undefined = memberCall.parent;
    while (parent && !(ts.isConditionalExpression(parent) && parent.condition.getText() === 'totalProfitPageTab === "settlement"')) parent = parent.parent;
    expect(parent).toBeDefined();
    expect(navigationHarness(false).callback()).toBeUndefined();
  });

  it("真实 selected report 优先历史成员；拒绝仅当前报表成员及非正整数/跨名单 target", () => {
    const h = navigationHarness();
    const displayedWeeklySettlementCenter = { view: "admin", current, history: [{ id: "history", report: historical }] };
    const memo = (factory: () => unknown) => factory();
    const adminSettlementReports = expression<unknown>(initializer("adminSettlementReports"), { displayedWeeklySettlementCenter, useMemo: memo });
    const selected = expression<Report>(initializer("selectedAdminSettlementReport"), { displayedWeeklySettlementCenter, adminSettlementReports, selectedSettlementReconciliationWeekStart: historical.period.weekStartBjt, useMemo: memo });
    expect(selected).toBe(historical);
    const callback = required(h.callback(selected), "historical callback");
    for (const invalid of [0, -1, 1.5, NaN, Infinity, 101, 999, "701", "701&return=https://example.com"]) callback("deposit", invalid as number);
    expect(h.events).toEqual([]);
    action(render(701, callback, selected), "为历史成员充值").props.onClick();
    expect(h.setLocation).toHaveBeenLastCalledWith("/ledger/52/t0-journal?payout=deposit&payoutUserId=701&payoutReturn=settlement");
    expect(h.events[0]).toEqual(["setShowTotalNetProfitDetail", false]);
    const fallback = expression<Report>(initializer("selectedAdminSettlementReport"), { displayedWeeklySettlementCenter, adminSettlementReports, selectedSettlementReconciliationWeekStart: "missing-week", useMemo: memo });
    expect(fallback).toBe(current);
  });

  it("open 首先检查 canManage；合法入口先清旧 editing/金额/ETH/备注/反馈，再固定路由导航", () => {
    const denied = navigationHarness(false);
    denied.open("deposit", 101, false, true);
    expect(denied.events).toEqual([]);
    const h = navigationHarness();
    h.open("withdrawal", 102, false, true);
    expect(h.state).toMatchObject({ setEditingPayoutLog: null, setPayoutAmount: "", setPayoutDepositInputMode: "u", setPayoutEthQuantity: "", setPayoutEthReferencePrice: "", setPayoutEthReferencePriceIsManual: false, setPayoutNote: "", setPayoutSubmitNotice: null, setPayoutOccurredOn: "2026-11-09", setShowPayoutLog: false });
    expect(h.events.slice(0, -1).map(([name]) => name)).toEqual([...resetSetterNames, "setShowPayoutLog"]);
    expect(h.events.at(-1)).toEqual(["navigate", "/ledger/52/t0-journal?payout=withdrawal&payoutUserId=102&payoutReturn=settlement"]);
  });

  it("第四参数默认 false，第三参数 team 保持兼容；两者均 true 时 settlement 优先", () => {
    const h = navigationHarness();
    h.open("deposit");
    h.open("deposit", 101, true);
    h.open("withdrawal", 102, true, true);
    expect(h.setLocation.mock.calls.map(([url]) => url)).toEqual([
      "/ledger/52/t0-journal?payout=deposit&payoutUserId=999",
      "/ledger/52/t0-journal?payout=deposit&payoutUserId=101&payoutReturn=team",
      "/ledger/52/t0-journal?payout=withdrawal&payoutUserId=102&payoutReturn=settlement",
    ]);
    const teamEntry = expression<(id: number) => void>(initializer("openTeamDepositEntryPage"), { ...h.deps, openPayoutEntryPage: h.open, canViewTeamOverview: true, isTotalProfitReportVisible: true, totalProfitDetailTab: "team", teamOverviewMembers: [{ userId: 701 }] });
    teamEntry(701);
    expect(h.setLocation).toHaveBeenLastCalledWith("/ledger/52/t0-journal?payout=deposit&payoutUserId=701&payoutReturn=team");
  });

  it("URL 只接受固定 tab/return 标记；保留原 payout target 解析，非法 URL target 不成为目标", () => {
    expect(urls("tab=settlement&payout=withdrawal&payoutUserId=701&payoutReturn=settlement")).toEqual({ requestedSettlementTab: true, payoutReturnToSettlement: true, payoutReturnToTeam: false, payoutEntryDirection: "withdrawal", payoutUserIdFromUrl: 701 });
    expect(urls("detailTab=team&payoutReturn=team").payoutReturnToTeam).toBe(true);
    for (const value of ["https://example.com/settlement", "/ledger/52/t0-journal/total-profit?tab=settlement", "javascript:alert(1)", "Settlement", "settlement/", ""]) {
      const parsed = urls(new URLSearchParams({ tab: value, payoutReturn: value }).toString());
      expect(parsed.requestedSettlementTab).toBe(false);
      expect(parsed.payoutReturnToSettlement).toBe(false);
      expect(parsed.payoutReturnToTeam).toBe(false);
    }
    for (const target of ["0", "-1", "1.5", "NaN", "Infinity", "701&x=1"]) expect(urls(new URLSearchParams({ payout: "deposit", payoutUserId: target }).toString()).payoutUserIdFromUrl).toBe(0);
    expect(urls("payoutUserId=701").payoutUserIdFromUrl).toBe(0);
    const parsed = urls("payout=deposit&payoutUserId=701");
    const base = { isUserPreview: false, previewUserId: 103, isMemberView: false, activeJournalData: { viewerRelatedUserId: 102 }, canManage: true, relatedUserFilterIds: ["101"], payoutUserIdFromUrl: parsed.payoutUserIdFromUrl };
    for (const [patch, expected] of [[{}, 701], [{ isMemberView: true }, 102], [{ isUserPreview: true }, 103], [{ canManage: false }, 0]] as const) expect(expression<number>(initializer("payoutTargetRelatedUserId"), { ...base, ...patch })).toBe(expected);
  });

  it("返回 effect 仅管理员+总收益路由+固定 settlement 请求设结算/overview，并监听三个条件", () => {
    const effect = required(nodes(page, ts.isCallExpression).find(node => node.expression.getText() === "useEffect" && node.arguments[0]?.getText().includes("!requestedSettlementTab")), "settlement return effect");
    for (const canManage of [false, true]) for (const isTotalProfitPageRoute of [false, true]) for (const requestedSettlementTab of [false, true]) {
      const setTotalProfitPageTab = vi.fn();
      const setAdminSettlementTab = vi.fn();
      const deps = { canManage, isTotalProfitPageRoute, requestedSettlementTab, setTotalProfitPageTab, setAdminSettlementTab };
      expression<() => void>(effect.arguments[0], deps)();
      const accepted = canManage && isTotalProfitPageRoute && requestedSettlementTab;
      expect(setTotalProfitPageTab.mock.calls).toEqual(accepted ? [["settlement"]] : []);
      expect(setAdminSettlementTab.mock.calls).toEqual(accepted ? [["overview"]] : []);
    }
    expect(expression<unknown[]>(required(effect.arguments[1], "effect deps"), { canManage: "permission", isTotalProfitPageRoute: "route", requestedSettlementTab: "request" })).toEqual(["permission", "route", "request"]);
  });

  it("close 优先固定结算返回，再原 team，再 journal；无权限忽略两个返回标记并清旧表单", () => {
    for (const [canManage, payoutReturnToSettlement, payoutReturnToTeam, suffix] of [[true, true, true, "/total-profit?tab=settlement"], [true, true, false, "/total-profit?tab=settlement"], [true, false, true, "/total-profit?detailTab=team"], [true, false, false, ""], [false, true, true, ""]] as const) {
      const h = navigationHarness(canManage, { payoutReturnToSettlement, payoutReturnToTeam });
      h.close();
      expect(h.setLocation).toHaveBeenCalledTimes(1);
      expect(h.setLocation).toHaveBeenCalledWith(`/ledger/52/t0-journal${suffix}`);
      expect(h.state).toMatchObject({ setEditingPayoutLog: null, setPayoutAmount: "", setIsPayoutListEditing: false, setDeletePayoutLogId: null });
      expect(h.events.at(-1)?.[0]).toBe("navigate");
    }
  });

  it("新增 UI/callback/open/close/effect 路径没有 mutation 或任意返回 URL 执行", () => {
    for (const root of [memberDeclaration, payoutCallbackNode, initializer("openPayoutEntryPage"), initializer("closePayoutEntryPage")]) {
      const calls = nodes(root, ts.isCallExpression).map(node => node.expression.getText());
      expect(calls.some(name => /mutate|fetch|axios|location\.(?:assign|replace)|window\.open/i.test(name))).toBe(false);
    }
  });
});

// 最小内存克隆树，仅运行生产导出函数的实际 query/remove 语句；不调用 canvas/DOM 服务。
class ExportNode {
  children: ExportNode[] = [];
  parent: ExportNode | undefined;
  constructor(public type: unknown, public props: Record<string, any>, public text = "") {}
  append(child: ExportNode) { child.parent = this; this.children.push(child); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  all(): ExportNode[] { return this.children.flatMap(child => [child, ...child.all()]); }
  querySelectorAll(selector: string) { return this.all().filter(node => Object.hasOwn(node.props, selector.slice(1, -1))); }
  clone(): ExportNode { const copy = new ExportNode(this.type, { ...this.props }, this.text); this.children.forEach(child => copy.append(child.clone())); return copy; }
  content(): string { return this.text + this.children.map(child => child.content()).join(""); }
}
function exportTree(value: unknown, parent = new ExportNode("root", {})): ExportNode {
  if (Array.isArray(value)) value.forEach(item => exportTree(item, parent));
  else if (React.isValidElement<Record<string, any>>(value)) {
    const node = new ExportNode(value.type, value.props);
    parent.append(node); exportTree(value.props.children, node);
  } else if (typeof value === "string" || typeof value === "number") parent.append(new ExportNode("text", {}, String(value)));
  return parent;
}

describe("结算导出忽略资金按钮", () => {
  it("操作区标记与真实导出 selector 一致：只删克隆资金区及两按钮，金额保留且原 UI 不变", () => {
    const callback = vi.fn();
    const tree = render(101, callback);
    const original = exportTree(tree);
    const clonedTarget = original.clone();
    const exportHiddenElements = expression<ExportNode[]>(initializer("exportHiddenElements", exporter), { clonedTarget, EXPORT_HIDE_ATTRIBUTE: expression<string>(initializer("EXPORT_HIDE_ATTRIBUTE", exporter)) });
    expect(exportHiddenElements).toHaveLength(1);
    expect(exportHiddenElements[0].props["data-card-export-hide"]).toBe("true");
    expect(exportHiddenElements[0].all().filter(node => node.type === "button")).toHaveLength(2);
    const removal = required(nodes(exporter, ts.isCallExpression).find(node => node.expression.getText() === "exportHiddenElements.forEach"), "actual export removal");
    expression<void>(removal, { exportHiddenElements });
    expect(clonedTarget.content()).not.toContain("资金操作");
    expect(clonedTarget.all().filter(node => node.type === "button")).toHaveLength(current.members.length);
    expect(original.content()).toContain("资金操作充值提现");
    expect(original.all().filter(node => node.type === "button")).toHaveLength(current.members.length + 2);
    const originalAmounts = original.all().filter(node => Object.hasOwn(node.props, "data-t0-fit")).map(node => Number(node.content().replace(/[U,\s]/g, "")));
    const exportedAmounts = clonedTarget.all().filter(node => Object.hasOwn(node.props, "data-t0-fit")).map(node => Number(node.content().replace(/[U,\s]/g, "")));
    expect(exportedAmounts).toHaveLength(originalAmounts.length);
    exportedAmounts.forEach((amount, index) => expect(amount).toBeCloseTo(originalAmounts[index], 10));
    expect(callback).not.toHaveBeenCalled();
  });
});
