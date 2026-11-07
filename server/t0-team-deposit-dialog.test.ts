import { readFileSync } from "node:fs";
import React from "react";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 只执行生产AST中的声明；React hooks为内存桩，不导入应用/路由/数据库，不发网络或资金写请求。
const page = source("../client/src/pages/T0Journal.tsx");
const dialog = source("../client/src/components/T0TeamDepositDialog.tsx");
function source(relative: string) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function nodes<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (guard(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return result;
}
function variable(root: ts.Node, name: string) {
  const found = nodes(root, ts.isVariableDeclaration).find((node) => ts.isIdentifier(node.name) && node.name.text === name);
  if (!found?.initializer) throw new Error(`Missing production variable ${name}`);
  return found.initializer;
}
function evaluate(code: string, dependencies: Record<string, any> = {}) {
  const output = ts.transpileModule(`const result = (${code});`, { fileName: "isolated.tsx", compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(dependencies), "exports", `${output}; return result;`)(...Object.values(dependencies), {});
}
function initial(root: ts.SourceFile, name: string, dependencies: Record<string, any> = {}) {
  return evaluate(variable(root, name).getText(root), dependencies);
}
function production(name: string, dependencies: Record<string, any> = {}) {
  const declaration = nodes(dialog, ts.isFunctionDeclaration).find((node) => node.name?.text === name);
  if (!declaration) throw new Error(`Missing production function ${name}`);
  return evaluate(declaration.getText(dialog).replace(/^export\s+/, ""), dependencies);
}
function content(value: any): string {
  if (Array.isArray(value)) return value.map(content).join("");
  if (React.isValidElement(value)) return content((value.props as any).children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function elements(value: any, result: any[] = []): any[] {
  if (Array.isArray(value)) value.forEach((item) => elements(item, result));
  else if (React.isValidElement(value)) { result.push(value); elements((value.props as any).children, result); }
  return result;
}
const summary = production("getT0TeamDepositSummary");
const dateText = production("formatT0TeamDepositDate");
const render = production("T0TeamDepositDialog", {
  React, Plus: "test-plus", X: "test-x", useRef: () => ({ current: null }), useEffect: () => {},
  getT0TeamDepositSummary: summary, formatT0TeamDepositDate: dateText,
  amountText: initial(dialog, "amountText"),
});
const member = { userId: 101, name: "成员甲", cumulativeDepositAmount: 0.3 };
const logs = Object.freeze([
  Object.freeze({ id: "a", relatedUserId: 101, direction: "deposit", occurredOn: "2025-12-31", amount: 0.1, note: "首笔" }),
  Object.freeze({ id: "b", relatedUserId: 101, direction: "deposit", occurredOn: "2026-01-01", amount: 0.2 }),
  Object.freeze({ id: "c", relatedUserId: 101, direction: "withdrawal", occurredOn: "2026-01-02", amount: 99 }),
  Object.freeze({ id: "d", relatedUserId: 102, direction: "deposit", occurredOn: "2026-01-03", amount: 999 }),
]);
function tree(overrides: Record<string, any> = {}) {
  return render({ member, logs, loading: false, error: false, onClose: vi.fn(), onRetry: vi.fn(), onRegister: vi.fn(), ...overrides });
}

describe("团队总金额逐笔充值口径", () => {
  it("只取该成员deposit，原U金额精度保留，提现及他人数据不混入且不改输入", () => {
    const before = JSON.stringify(logs);
    const result = summary(logs, 101);
    expect(result.deposits.map((log: any) => log.id)).toEqual(["a", "b"]);
    expect(result.total).toBeCloseTo(0.3, 12);
    expect(JSON.stringify(logs)).toBe(before);
    expect(summary(undefined, 101)).toBeUndefined();
    expect(summary([], 101)).toEqual({ deposits: [], total: 0 });
    expect(summary([{ ...logs[0], amount: Number.NaN }], 101).total).toBeNull();
  });
  it("ETH录入仍以冻结U金额展示，绝不按参考币数重新折算", () => {
    const result = summary([{ ...logs[0], amount: 1346.52, ethQuantity: "0.5", ethReferencePrice: "1", depositInputMode: "eth" }], 101);
    expect(result.total).toBe(1346.52);
  });
  it("真实occurredOn显示月日，跨年保留title和time年份", () => {
    expect(dateText("2025-12-31")).toBe("12月31日");
    expect(dateText("2026-01-01")).toBe("1月1日");
    const times = elements(tree()).filter((element) => element.type === "time");
    expect(times.map((element) => element.props.title)).toEqual(["2025-12-31", "2026-01-01"]);
    expect(times[0].props.dateTime).toBe("2025-12-31");
  });
  it("紧凑小行、备注截短、笔数合计核对，层级高于总收益报告", () => {
    const result = tree();
    expect(result.props.className).toContain("z-[80]");
    expect(elements(result).filter((element) => element.type === "li")).toHaveLength(2);
    expect(elements(result).some((element) => element.type === "table")).toBe(false);
    expect(content(result)).toContain("共 2 笔充值合计 0.3 U");
    expect(content(result)).toContain("与总金额一致");
    const note = elements(result).find((element) => element.props.title === "首笔");
    expect(note.props.className).toContain("truncate");
  });
  it("失败或未读完不会伪造0笔/0合计，金额异常也显示错误", () => {
    for (const patch of [{ logs: undefined, loading: true }, { logs: undefined, error: true }, { logs, error: true }, { logs: [{ ...logs[0], amount: Number.NaN }] }]) {
      const text = content(tree(patch));
      expect(text).not.toContain("共 0 笔");
      expect(text).not.toContain("合计 0 U");
      expect(text).not.toContain("暂无充值记录");
      expect(text).not.toContain("与总金额一致");
    }
    expect(content(tree({ error: true }))).toContain("读取失败");
    expect(content(tree({ logs: [] }))).toContain("合计 0 U");
    expect(content(tree({ member: { ...member, cumulativeDepositAmount: 5 } }))).toContain("不一致");
  });
  it("登记仅调用父回调，不在弹窗发起任何mutation", () => {
    const onRegister = vi.fn();
    const button = elements(tree({ onRegister })).find((element) => element.type === "button" && content(element) === "登记充值");
    button.props.onClick();
    expect(onRegister).toHaveBeenCalledOnce();
    expect(dialog.text).not.toContain("useMutation");
  });
});

describe("页面授权、懒加载与固定返回", () => {
  const scope = { canManage: true, canViewTeamOverview: true, isTotalProfitReportVisible: true, totalProfitPageTab: "income", totalProfitDetailTab: "team", teamDepositMember: member };
  it("真正管理员允许，用户代入和权限切换中均关闭管理权限", () => {
    const deps = { canAccess: true, queriedViewerMode: "admin", isUserPreview: false, isPreviewSwitching: false };
    expect(initial(page, "canManage", deps)).toBe(true);
    for (const patch of [{ isUserPreview: true }, { isPreviewSwitching: true }, { queriedViewerMode: "member" }, { canAccess: false }]) expect(initial(page, "canManage", { ...deps, ...patch })).toBe(false);
  });
  it("仅管理员团队Tab选中当前可见成员才启用，查询按用户绑定且不全量加载", () => {
    expect(initial(page, "canReadTeamDeposits", scope)).toBe(true);
    for (const patch of [{ canManage: false }, { canViewTeamOverview: false }, { isTotalProfitReportVisible: false }, { totalProfitDetailTab: "order" }, { totalProfitPageTab: "settlement" }, { teamDepositMember: undefined }]) expect(initial(page, "canReadTeamDeposits", { ...scope, ...patch })).toBe(false);
    const query = variable(page, "teamDepositLogsQuery") as ts.CallExpression;
    expect(evaluate(query.arguments[0].getText(page), scope)).toEqual({ ledgerId: 52, relatedUserId: 101 });
    const options = evaluate(query.arguments[1].getText(page), { canReadTeamDeposits: false });
    expect(options.enabled).toBe(false);
    expect(options.placeholderData()).toBeUndefined();
    const selected = initial(page, "teamDepositMember", { teamOverviewMembers: [member], teamDepositMemberId: 102 });
    expect(selected).toBeUndefined();
  });
  it("成员原总金额文本不变，管理员用虚线按钮，原年化入口保留", () => {
    const conditional = nodes(page, ts.isConditionalExpression).find((node) => node.condition.getText(page) === "canManage" && node.whenTrue.getText(page).includes("setTeamDepositMemberId"));
    expect(conditional).toBeDefined();
    const setTeamDepositMemberId = vi.fn();
    const admin = evaluate(conditional!.getText(page), { React, canManage: true, member, setTeamDepositMemberId });
    expect(admin.type).toBe("button");
    expect(admin.props.className).toContain("border-dashed");
    admin.props.onClick();
    expect(setTeamDepositMemberId).toHaveBeenCalledWith(101);
    const readOnly = evaluate(conditional!.getText(page), { React, canManage: false, member, setTeamDepositMemberId });
    expect(readOnly.type).toBe("div");
    expect(readOnly.props.onClick).toBeUndefined();
    expect(content(readOnly)).toBe(content(admin));
    expect(page.text).toContain("onClick={() => setTeamAnnualizedMemberId(member.userId)}");
  });
  it("登记复用父入口且预选成员，拒绝非管理员和不在当前团队的用户", () => {
    const openPayoutEntryPage = vi.fn();
    const deps = { ...scope, teamOverviewMembers: [member], openPayoutEntryPage, setTeamDepositMemberId: vi.fn(), setTeamAnnualizedMemberId: vi.fn(), setShowTotalNetProfitDetail: vi.fn() };
    initial(page, "openTeamDepositEntryPage", deps)(101);
    expect(openPayoutEntryPage).toHaveBeenCalledWith("deposit", 101, true);
    openPayoutEntryPage.mockClear();
    initial(page, "openTeamDepositEntryPage", deps)(102);
    initial(page, "openTeamDepositEntryPage", { ...deps, canManage: false })(101);
    expect(openPayoutEntryPage).not.toHaveBeenCalled();
  });
  it("仅固定payoutReturn=team和detailTab=team生效，不接受外部URL", () => {
    for (const value of [null, "https://example.com", "//example.com", "team"]) {
      const searchParams = new URLSearchParams();
      if (value) { searchParams.set("payoutReturn", value); searchParams.set("detailTab", value); }
      expect(initial(page, "payoutReturnToTeam", { searchParams })).toBe(value === "team");
      expect(initial(page, "requestedTeamDetail", { searchParams })).toBe(value === "team");
    }
    const setLocation = vi.fn();
    const close = nodes(page, ts.isVariableDeclaration).find((node) => node.name.getText(page) === "closePayoutEntryPage")!;
    const deps = { resetPayoutLogForm: vi.fn(), setIsPayoutListEditing: vi.fn(), setDeletePayoutLogId: vi.fn(), setLocation, ledgerId: 52, canManage: true, payoutReturnToTeam: true };
    evaluate(close.initializer!.getText(page), deps)();
    expect(setLocation).toHaveBeenLastCalledWith("/ledger/52/t0-journal/total-profit?detailTab=team");
    evaluate(close.initializer!.getText(page), { ...deps, payoutReturnToTeam: false })();
    expect(setLocation).toHaveBeenLastCalledWith("/ledger/52/t0-journal");
  });
  it("新增/更新/删除后调用同一全键缓存失效，读取失败不吞掉成功提示", async () => {
    const keys = ["t0GetPayoutLogs", "t0GetPayoutAvailability", "t0CanViewTeamOverview", "t0GetTeamOverview", "t0GetTeamWeeklySettlement", "t0GetWeeklySettlementCenter", "t0GetJournal"];
    const ledger = Object.fromEntries(keys.map((key) => [key, { invalidate: vi.fn(() => key === "t0GetTeamOverview" ? Promise.reject(new Error("read only test failure")) : Promise.resolve()) }]));
    await expect(initial(page, "refreshPayoutRelatedCaches", { t0Utils: { ledger } })()).resolves.toHaveLength(keys.length);
    for (const key of keys) expect(ledger[key].invalidate).toHaveBeenCalledWith();
    for (const mutation of ["createPayoutLogMutation", "updatePayoutLogMutation", "deletePayoutLogMutation"]) {
      const text = variable(page, mutation).getText(page);
      expect(text).toContain("await refreshPayoutRelatedCaches()");
      expect(text.indexOf('tone: "success"')).toBeLessThan(text.indexOf("await refreshPayoutRelatedCaches()"));
    }
  });
});
