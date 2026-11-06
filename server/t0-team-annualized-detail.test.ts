import { readFileSync } from "node:fs";
import React from "react";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 不导入应用、routers、db 或 journal：只读 AST，执行真实生产声明。
// SQL、React hooks 和 DOM 仅为内存隔离桩；没有网络、数据库或资金写操作。
function ast(relative: string) {
  const text = readFileSync(new URL(relative, import.meta.url), "utf8");
  return ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, relative.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
const teamAst = ast("./ledger52-t0-team-overview.ts");
const routerAst = ast("./routers.ts");
const pageAst = ast("../client/src/pages/T0Journal.tsx");
const dialogAst = ast("../client/src/components/T0TeamAnnualizedDialog.tsx");
const exportAst = ast("../client/src/components/OrderCardImageDownload.tsx");
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
function variable(root: ts.Node, name: string) {
  return required(nodes(root, ts.isVariableDeclaration).find(node => ts.isIdentifier(node.name) ? node.name.text === name : ts.isArrayBindingPattern(node.name) && node.name.elements.some(element => ts.isBindingElement(element) && ts.isIdentifier(element.name) && element.name.text === name)), name);
}
function declaration(root: ts.Node, name: string) {
  return required(nodes(root, ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
}
function compiled(text: string, deps: Record<string, any>, result: string): any {
  const output = ts.transpileModule(text, {
    fileName: "isolated.tsx", compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(deps), "exports", `${output}\nreturn ${result};`)(...Object.values(deps), {});
}
function expression(node: ts.Node, deps: Record<string, any> = {}): any {
  return compiled(`const isolated = (${node.getText(node.getSourceFile())});`, deps, "isolated");
}
function production(root: ts.SourceFile, name: string, deps: Record<string, any> = {}): any {
  return compiled(declaration(root, name).getText(root), deps, name);
}
function initial(root: ts.Node, name: string, deps: Record<string, any> = {}): any {
  return expression(required(variable(root, name).initializer, name), deps);
}
type Jsx = ts.JsxElement | ts.JsxSelfClosingElement;
function opening(element: Jsx) { return ts.isJsxElement(element) ? element.openingElement : element; }
function attribute(element: Jsx, name: string) {
  return opening(element).attributes.properties.find((node): node is ts.JsxAttribute => ts.isJsxAttribute(node) && node.name.getText() === name);
}
function attrExpression(element: Jsx, name: string) {
  const value = required(attribute(element, name)?.initializer, name);
  if (!ts.isJsxExpression(value)) throw new Error(`Expected expression: ${name}`);
  return required(value.expression, name);
}
function textAttribute(element: Jsx, name: string) {
  const value = attribute(element, name)?.initializer;
  return value && ts.isStringLiteral(value) ? value.text : undefined;
}
function query(root: ts.Node, name: string): ts.CallExpression {
  const value = required(variable(root, name).initializer, name);
  if (!ts.isCallExpression(value)) throw new Error(`Expected query: ${name}`);
  return value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// 非旧白名单ID也可因合格下级自动获得团队入口。
const ROOT = 600123;
const descendants = [
  { id: 101, invited_by_user_id: ROOT, name: "甲" },
  { id: 102, invited_by_user_id: ROOT, name: "无活动中间人" },
  { id: 103, invited_by_user_id: 102, name: "乙" },
  { id: 104, invited_by_user_id: ROOT, name: "未入账本" },
  { id: 105, invited_by_user_id: ROOT, name: "仅期权" },
];
function facts() {
  const entry = (id: string, user: number, action: string, price: number, createdAt: string, instrumentType = "contract") => ({ id, relatedUserId: user, action, price, createdAt, instrumentType, accountId: "account", symbol: "ETH", quantity: 1, fee: 0 });
  return freeze({
    entries: [entry("open", 101, "openLong", 100, "2026-01-01T01:00:00Z"), entry("close", 101, "closeLong", 200.123456, "2026-02-01T01:00:00Z"), entry("option", 105, "openLong", 1, "2025-01-01", "option")],
    payoutCashFlows: [
      { relatedUserId: 101, direction: "deposit", amount: 1000, occurredOn: "2026-01-02" },
      { relatedUserId: 101, direction: "withdrawal", amount: 200, occurredOn: "2026-06-01" },
      { relatedUserId: 101, direction: "deposit", amount: 50.123456, occurredOn: "2026-06-02" },
      { relatedUserId: 103, direction: "deposit", amount: 80, occurredOn: "2026-07-01" },
      { relatedUserId: 104, direction: "deposit", amount: 9999, occurredOn: "2026-01-01" },
      { relatedUserId: 999, direction: "deposit", amount: 7777, occurredOn: "2026-01-01" },
    ], profitShareSnapshots: [], sharedIncomeTransfers: [], sharedIncomeReductions: [],
  });
}
function teamHarness(journal = facts(), activityUserIds = [101, 103, 105]) {
  const execute = vi.fn(async (sql: string, params: number[]) => {
    if (sql.includes("FROM users WHERE")) return [descendants.filter(row => params.includes(row.invited_by_user_id))];
    if (sql.includes("FROM ledger_members")) {
      expect(params[0]).toBe(52);
      return [[101, 102, 103, 105].filter(id => params.slice(1).includes(id)).map(userId => ({ userId }))];
    }
    if (sql.includes("FROM ledger52_t0_journal_entries entry") && sql.includes("UNION")) {
      const width = params.length / 4;
      const scope = params.slice(0, width);
      expect(scope.slice(0, 2)).toEqual([52, 28]);
      for (let branch = 1; branch < 4; branch += 1) expect(params.slice(branch * width, (branch + 1) * width)).toEqual(scope);
      return [activityUserIds.filter(userId => scope.slice(2).includes(userId)).map(userId => ({ userId }))];
    }
    throw new Error("Unexpected SQL in isolated read-only test");
  });
  const getDbConnection = vi.fn(async () => ({ execute }));
  const journalReader = vi.fn(async () => journal);
  // 删除所有 import AST 节点，依赖名只能解析至下方内存桩。
  const printer = ts.createPrinter();
  const text = teamAst.statements.filter(node => !ts.isImportDeclaration(node)).map(node => {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isolated = modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ? ts.factory.replaceModifiers(node, modifiers.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword))
      : node;
    return printer.printNode(ts.EmitHint.Unspecified, isolated, teamAst);
  }).join("\n");
  const api = compiled(text, { TRPCError, getDbConnection, getLedger52T0JournalTeamFinancialFacts: journalReader }, "({ getLedger52T0TeamAccess, getLedger52T0TeamOverview, calculateTeamXirr, buildTeamAnnualizedCashFlowDetail, getCalendarDateUtc, getBeijingDateValue, calculateLedger52T0IncomeByUser })");
  return { ...api, execute, getDbConnection, journalReader, journal };
}
function routeHarness(mode = "member", role = "member", targetRole: string | null = "member") {
  const h = teamHarness();
  const resolveScope = vi.fn(async () => ({ mode, relatedUserId: ROOT, journalOwnerUserId: 28 }));
  const owner = vi.fn(async () => 28);
  const getUserMembership = vi.fn(async () => targetRole === null ? null : ({ role: targetRole }));
  const property = required(nodes(routerAst, ts.isPropertyAssignment).find(node => node.name.getText(routerAst) === "t0GetTeamOverview"), "t0GetTeamOverview");
  const call = property.initializer;
  if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) throw new Error("Expected route query");
  const callback = call.arguments[0];
  // 将生产 callback 的动态 import AST 变成内存 loadModule，绝不加载 journal/db。
  const transformed = ts.transform(callback, [context => root => ts.visitNode(root, function visit(node): ts.VisitResult<ts.Node> {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return ts.factory.updateCallExpression(node, ts.factory.createIdentifier("loadModule"), undefined, node.arguments);
    return ts.visitEachChild(node, visit, context);
  }) as typeof root]);
  const callbackText = ts.createPrinter().printNode(ts.EmitHint.Expression, transformed.transformed[0], routerAst);
  transformed.dispose();
  const loadModule = vi.fn(async (path: string) => {
    if (path === "./ledger52-t0-journal") return { resolveLedger52T0JournalReadScope: resolveScope, getLedger52T0JournalOwnerUserId: owner };
    if (path === "./ledger52-t0-team-overview") return h;
    throw new Error(`Forbidden module load: ${path}`);
  });
  const run = compiled(`const isolated = (${callbackText});`, { loadModule, TRPCError, dbLedger: { getUserMembership } }, "isolated");
  const inputCall = call.expression.expression;
  if (!ts.isCallExpression(inputCall)) throw new Error("Expected route input schema");
  const schema = expression(inputCall.arguments[0], { z });
  const ctx: any = { user: { id: ROOT, role }, isViewingAs: false };
  return { h, run: (input: any = {}, context = ctx) => run({ ctx: context, input: schema.parse({ ledgerId: 52, ...input }) }), schema, ctx, resolveScope, owner, getUserMembership };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-06T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("团队年化详情授权与最小下发（真实概览/路由 AST）", () => {
  it("默认团队总览只返回汇总，无任何成员原始或合并现金流", async () => {
    const h = teamHarness();
    const result = await h.getLedger52T0TeamOverview({ rootUserId: ROOT, journalOwnerUserId: 28 });
    expect(result.enabled).toBe(true);
    expect(result.members.map((member: any) => member.userId).sort((left: number, right: number) => left - right)).toEqual([101, 103, 105]);
    expect(result.members.find((member: any) => member.userId === 103)).toMatchObject({ parentUserId: ROOT, depth: 1 });
    const keys = (value: any): string[] => value && typeof value === "object" ? Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]) : [];
    expect(keys(result).filter(key => ["cashFlows", "groupedCashFlows", "payoutCashFlows", "annualizedDetail"].includes(key))).toEqual([]);
    expect(h.journalReader).toHaveBeenCalledOnce();
    expect(h.journalReader).toHaveBeenCalledWith({ journalOwnerUserId: 28 });
  });

  it("显式请求可见成员仅返回该成员详情；成员与详情共用未舍入收益/终值/XIRR", async () => {
    const h = teamHarness();
    const before = JSON.stringify(h.journal);
    const result = await h.getLedger52T0TeamOverview({ rootUserId: ROOT, journalOwnerUserId: 28, annualizedDetailUserId: 101 });
    const detail = result.annualizedDetail;
    const member = result.members.find((row: any) => row.userId === 101);
    expect(detail).toMatchObject({ userId: 101, name: "甲", asOfDate: "2026-11-06", cumulativeDepositAmount: 1050.123456, cumulativeWithdrawalAmount: 200 });
    expect(detail.currentCumulativeIncome).toBeCloseTo(100.123456, 10);
    expect(detail.currentNetValue).toBe(detail.cumulativeDepositAmount + detail.currentCumulativeIncome - detail.cumulativeWithdrawalAmount);
    expect(detail.annualizedReturn).toBe(member.annualizedReturn);
    expect(detail.annualizedReturn).toBe(h.calculateTeamXirr(detail.cashFlows));
    expect(detail.cashFlows.map((flow: any) => [flow.kind, flow.amount, flow.atEndOfBeijingDay])).toEqual([
      ["deposit", -1000, false], ["withdrawal", 200, false], ["deposit", -50.123456, false], ["terminal", detail.currentNetValue, true],
    ]);
    expect(result.members.every((row: any) => !("cashFlows" in row) && !("annualizedDetail" in row))).toBe(true);
    const other = await h.getLedger52T0TeamOverview({ rootUserId: ROOT, journalOwnerUserId: 28, annualizedDetailUserId: 103 });
    expect(other.annualizedDetail.userId).toBe(103);
    expect(other.annualizedDetail.cashFlows.map((flow: any) => flow.amount)).toEqual([-80, 80]);
    expect(JSON.stringify(h.journal)).toBe(before);
  });

  it("无下级/无有效活动默认disabled，详情FORBIDDEN；允许light select但不读取financialFacts", async () => {
    const h = teamHarness();
    expect(await h.getLedger52T0TeamOverview({ rootUserId: 999, journalOwnerUserId: 28 })).toEqual({ enabled: false });
    await expect(h.getLedger52T0TeamOverview({ rootUserId: 999, journalOwnerUserId: 28, annualizedDetailUserId: 101 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.execute).toHaveBeenCalled();
    expect(h.execute.mock.calls.every(([sql]) => sql.includes("FROM users WHERE"))).toBe(true);
    expect(h.journalReader).not.toHaveBeenCalled();
    const inactive = teamHarness(facts(), []);
    expect(await inactive.getLedger52T0TeamOverview({ rootUserId: ROOT, journalOwnerUserId: 28 })).toEqual({ enabled: false });
    await expect(inactive.getLedger52T0TeamOverview({ rootUserId: ROOT, journalOwnerUserId: 28, annualizedDetailUserId: 101 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(inactive.execute.mock.calls.some(([sql]) => sql.includes("UNION"))).toBe(true);
    expect(inactive.journalReader).not.toHaveBeenCalled();
  });

  it("详情仅eligible descendants：本人/跨团队/未入52/无活动拒绝，期权资格可见但不进入财务", async () => {
    const h = teamHarness();
    for (const target of [ROOT, 999, 102, 104]) {
      await expect(h.getLedger52T0TeamOverview({ rootUserId: ROOT, journalOwnerUserId: 28, annualizedDetailUserId: target })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(h.journalReader).not.toHaveBeenCalled();
    const base = facts();
    const optionHarness = teamHarness(freeze({
      ...base,
      entries: [...base.entries, { ...base.entries[2], id: "option-close", action: "closeLong", price: 999, createdAt: "2026-02-01" }],
      profitShareSnapshots: [{ entryId: "option-close", openingEntryId: "option", beneficiaryUserId: 101, percentage: 100, matchedQuantity: 1 }],
      sharedIncomeTransfers: [{ closingEntryId: "option-close", recipientUserId: 105, amount: 777 }],
      sharedIncomeReductions: [{ closingEntryId: "option-close", amount: 777, sourceNetPnl: 998 }],
    }));
    const option = await optionHarness.getLedger52T0TeamOverview({ rootUserId: ROOT, journalOwnerUserId: 28, annualizedDetailUserId: 105 });
    expect(option.members.find((row: any) => row.userId === 105)).toMatchObject({ firstActivityOn: null, currentCumulativeIncome: 0, annualizedReturn: null });
    expect(option.annualizedDetail).toMatchObject({ userId: 105, currentNetValue: 0, orderIncome: 0, commissionIncome: 0, sharedIncome: 0, cashFlows: [], annualizedReturn: null });
    expect(option.members.find((row: any) => row.userId === 101).currentCumulativeIncome).toBeCloseTo(100.123456, 10);
    expect(option.summary.currentCumulativeIncome).toBeCloseTo(100.123456, 10);
  });

  it("路由schema限定52/正整数目标；管理员全局默认disabled且禁止详情，普通成员只转发授权scope", async () => {
    const admin = routeHarness("admin", "admin");
    expect(await admin.run()).toEqual({ enabled: false });
    await expect(admin.run({ annualizedDetailUserId: 101 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(admin.h.execute).not.toHaveBeenCalled();
    const member = routeHarness();
    const result = await member.run({ annualizedDetailUserId: 101, rootUserId: 999 }, { user: { id: 456, role: "member" }, isViewingAs: false });
    expect(result.relation.rootUserId).toBe(ROOT);
    expect(result.annualizedDetail.userId).toBe(101);
    expect(member.resolveScope).toHaveBeenCalledWith({ id: 456, role: "member", isViewingAs: false });
    for (const input of [{ ledgerId: 53 }, { ledgerId: 52, annualizedDetailUserId: 0 }, { ledgerId: 52, annualizedDetailUserId: -1 }, { ledgerId: 52, annualizedDetailUserId: 101.5 }]) expect(member.schema.safeParse(input).success).toBe(false);
  });

  it("路由预览必须真实admin+普通52成员，不允许代入中再切换；合法预览仍受可见成员权限", async () => {
    await expect(routeHarness().run({ previewUserId: ROOT, annualizedDetailUserId: 101 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const targetRole of [null, "owner", "admin"]) await expect(routeHarness("admin", "admin", targetRole).run({ previewUserId: ROOT, annualizedDetailUserId: 101 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = routeHarness("admin", "admin");
    await expect(admin.run({ previewUserId: ROOT }, { ...admin.ctx, isViewingAs: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await admin.run({ previewUserId: ROOT, annualizedDetailUserId: 101 })).annualizedDetail.userId).toBe(101);
    expect(admin.getUserMembership).toHaveBeenCalledWith(52, ROOT);
    await expect(admin.run({ previewUserId: ROOT, annualizedDetailUserId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.run({ previewUserId: 999, annualizedDetailUserId: 101 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("代入路由核验realUser管理员scope，缺失或非admin拒绝；有权代入仍只读取代入root下属", async () => {
    const denied = routeHarness();
    await expect(denied.run({ annualizedDetailUserId: 101 }, { ...denied.ctx, isViewingAs: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(denied.run({ annualizedDetailUserId: 101 }, { ...denied.ctx, isViewingAs: true, realUser: { id: 28, role: "admin" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = routeHarness("admin", "admin");
    const context = { user: { id: ROOT, role: "member" }, realUser: { id: 28, role: "admin" }, isViewingAs: true };
    expect((await admin.run({ annualizedDetailUserId: 101 }, context)).annualizedDetail.userId).toBe(101);
    expect(admin.resolveScope).toHaveBeenCalledWith({ id: 28, role: "admin", isViewingAs: false });
    await expect(admin.run({ annualizedDetailUserId: 101 }, { ...context, user: { id: 999, role: "member" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("原始XIRR和解释现金流同源时间/精度", () => {
  it("365天单笔投入/终值实际求解10%；同日终值按endOfDay增加一天而非零时长", () => {
    const h = teamHarness();
    expect(h.calculateTeamXirr([{ occurredOn: "2025-01-01", amount: -1000 }, { occurredOn: "2025-12-31", amount: 1100, atEndOfBeijingDay: true }])).toBeCloseTo(0.1, 8);
    const sameDay = [{ occurredOn: "2026-11-06", amount: -100, kind: "deposit" }, { occurredOn: "2026-11-06", amount: 101, atEndOfBeijingDay: true }];
    const rate = h.calculateTeamXirr(sameDay);
    // 生产求解器按金额残差1e-7停止；单日放大后rate绝对精度不是1e-7。
    expect(rate).toBeCloseTo(Math.pow(101 / 100, 365) - 1, 4);
    expect(Math.abs(-100 + 101 / Math.pow(1 + rate, 1 / 365))).toBeLessThan(0.0000001);
    const detail = h.buildTeamAnnualizedCashFlowDetail(sameDay, "2026-11-06", rate);
    expect(detail.groupedCashFlows.map((flow: any) => flow.daysFromStart)).toEqual([0, 1]);
    expect(detail.daysHeld).toBe(1);
    expect(h.calculateTeamXirr(sameDay.map(flow => ({ ...flow, atEndOfBeijingDay: false })))).toBeNull();
  });

  it("同时间合并排除抵消0/无效日期/非有限/微额，解释d原点与求解器一致而非首笔投入", () => {
    const h = teamHarness();
    const flows = freeze([
      { occurredOn: "2026-01-01", amount: -50, kind: "deposit" }, { occurredOn: "2026-01-01", amount: 50, kind: "withdrawal" },
      { occurredOn: "2026-01-02", amount: -100, kind: "deposit" }, { occurredOn: "2026-01-03", amount: 10, kind: "withdrawal" }, { occurredOn: "2026-01-03", amount: 15, kind: "withdrawal" },
      { occurredOn: "2026-01-06", amount: 100, atEndOfBeijingDay: true },
      { occurredOn: "2026-02-30", amount: 99 }, { occurredOn: "invalid", amount: 99 }, { occurredOn: "2026-01-02", amount: NaN }, { occurredOn: "2026-01-02", amount: Infinity }, { occurredOn: "2026-01-02", amount: 0.0000001 },
    ]);
    const rate = h.calculateTeamXirr(flows);
    expect(rate).not.toBeNull();
    const detail = h.buildTeamAnnualizedCashFlowDetail(flows, "2026-01-06", rate);
    expect(detail.groupedCashFlows.map((flow: any) => [flow.amount, flow.daysFromStart])).toEqual([[-100, 0], [25, 1], [100, 5]]);
    expect(detail.cashFlows).toHaveLength(6);
    expect(detail.cashFlows.slice(0, 2).map((flow: any) => flow.daysFromStart)).toEqual([-1, -1]);
    expect(detail).toMatchObject({ firstInvestmentDate: "2026-01-01", daysHeld: 6, unavailableReason: null });
    expect(rate).toBe(h.calculateTeamXirr(detail.groupedCashFlows));
    const residual = detail.groupedCashFlows.reduce((sum: number, flow: any) => sum + flow.amount / Math.pow(1 + rate, flow.daysFromStart / 365), 0);
    expect(Math.abs(residual)).toBeLessThan(0.000001);
  });

  it("期末次日零点与次日普通资金同有效timestamp合并，日期排序/有效时间差完全一致", () => {
    const h = teamHarness();
    const flows = [{ occurredOn: "2026-01-03", amount: -10, kind: "deposit" }, { occurredOn: "2026-01-02", amount: 20, atEndOfBeijingDay: true }, { occurredOn: "2026-01-01", amount: -100, kind: "deposit" }, { occurredOn: "2026-01-06", amount: 110, atEndOfBeijingDay: true }];
    const rate = h.calculateTeamXirr(flows);
    const detail = h.buildTeamAnnualizedCashFlowDetail(flows, "2026-01-06", rate);
    expect(detail.groupedCashFlows.map((flow: any) => [flow.amount, flow.daysFromStart])).toEqual([[-100, 0], [10, 2], [110, 6]]);
    expect(detail.cashFlows.slice(0, 2).map((flow: any) => flow.daysFromStart)).toEqual([2, 2]);
    expect(h.calculateTeamXirr(detail.groupedCashFlows)).toBeCloseTo(rate, 8);
    expect(h.getCalendarDateUtc("2024-02-29")).not.toBeNull();
    expect(h.getCalendarDateUtc("2026-02-29")).toBeNull();
    expect(h.getBeijingDateValue(new Date("2026-11-05T16:01:00Z"))).toBe("2026-11-06");
  });

  it("null年化给出不足/无法求解原因，无正负/无有效跨度不伪造0，输入不变", () => {
    const h = teamHarness();
    for (const flows of [[], [{ occurredOn: "2026-01-01", amount: -100 }], [{ occurredOn: "2026-01-01", amount: 100 }], [{ occurredOn: "2026-01-01", amount: -100 }, { occurredOn: "2026-01-01", amount: 100 }]]) {
      expect(h.calculateTeamXirr(freeze(flows))).toBeNull();
      expect(h.buildTeamAnnualizedCashFlowDetail(flows, "2026-01-02", null).unavailableReason).toContain("有效正负现金流不足");
    }
    const overflow = freeze([{ occurredOn: "2025-01-01", amount: -1e308, kind: "deposit" }, { occurredOn: "2026-01-01", amount: 1e308, atEndOfBeijingDay: true }]);
    expect(h.calculateTeamXirr(overflow)).toBeNull();
    expect(h.buildTeamAnnualizedCashFlowDetail(overflow, "2026-01-01", null).unavailableReason).toContain("现有XIRR算法未能求得");
  });

  it("活动日取非期权订单/充值最早日而首笔投入单独计算；选中全量现金流不截断", async () => {
    const base = facts();
    const longJournal: any = freeze({ ...base, payoutCashFlows: [...base.payoutCashFlows, ...Array.from({ length: 65 }, (_, index) => ({ relatedUserId: 101, direction: "deposit", amount: 0.123456, occurredOn: `2026-03-${String(index % 28 + 1).padStart(2, "0")}` }))] });
    const h = teamHarness(longJournal);
    const result = await h.getLedger52T0TeamOverview({ rootUserId: ROOT, journalOwnerUserId: 28, annualizedDetailUserId: 101 });
    expect(result.members.find((row: any) => row.userId === 101).firstActivityOn).toBe("2026-01-01");
    const detail = result.annualizedDetail;
    expect(detail.firstInvestmentDate).toBe("2026-01-02");
    const expectedDays = (h.getCalendarDateUtc(detail.asOfDate) + 86400000 - h.getCalendarDateUtc(detail.firstInvestmentDate)) / 86400000;
    expect(detail.daysHeld).toBe(expectedDays);
    expect(detail.cashFlows.filter((flow: any) => flow.kind !== "terminal")).toHaveLength(68);
    expect(detail.annualizedReturn).toBe(h.calculateTeamXirr(detail.cashFlows));
  });
});

function elements(value: any, result: any[] = []): any[] {
  if (Array.isArray(value)) value.forEach(item => elements(item, result));
  else if (React.isValidElement(value)) { result.push(value); elements((value.props as any).children, result); }
  return result;
}
function content(value: any): string {
  if (Array.isArray(value)) return value.map(content).join("");
  if (React.isValidElement(value)) return content((value.props as any).children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function dialogHarness() {
  const helpers = Object.fromEntries(["amountText", "incomeText", "amountColor", "dateText"].map(name => [name, initial(dialogAst, name)]));
  const refs: any[] = [];
  const component = production(dialogAst, "T0TeamAnnualizedDialog", { React, ...helpers, X: "mock-x", OrderCardImageDownload: "mock-download", useRef: () => { const ref = { current: null }; refs.push(ref); return ref; }, useEffect: () => {} });
  const detail: any = freeze({ userId: 101, name: "甲", asOfDate: "2026-11-06", cumulativeDepositAmount: 1000.123456, cumulativeWithdrawalAmount: 200.123456, currentCumulativeIncome: 12.345678, currentNetValue: 812.345678, annualizedReturn: 0.1, firstInvestmentDate: "2026-01-01", daysHeld: 310, orderIncome: 10.123456, commissionIncome: 1.111111, sharedIncome: 1.111111, unavailableReason: null, cashFlows: [{ kind: "deposit", occurredOn: "2026-01-01", amount: -1000.123456, daysFromStart: 0, atEndOfBeijingDay: false }, { kind: "withdrawal", occurredOn: "2026-06-01", amount: 200.123456, daysFromStart: 151, atEndOfBeijingDay: false }, { kind: "terminal", occurredOn: "2026-11-06", amount: 812.345678, daysFromStart: 310, atEndOfBeijingDay: true }], groupedCashFlows: [{ occurredOn: "2026-01-01", amount: -1000.123456, daysFromStart: 0, atEndOfBeijingDay: false }, { occurredOn: "2026-11-06", amount: 812.345678, daysFromStart: 310, atEndOfBeijingDay: true }] });
  const render = (data: any = detail) => component({ detail: data, memberName: "甲", loading: !data, onClose: vi.fn(), onRetry: vi.fn(), formatRate: (rate: number | null) => rate === null ? "--" : `${rate * 100}%` });
  return { ...helpers, detail, refs, render };
}

describe("点击加载与真实JSX展示/下载接入", () => {
  it("首屏/未选中不启用详情；点击虚线数字后才绑定userId，有权且团队Tab可见才查询", () => {
    const normal = query(pageAst, "t0TeamOverviewQuery");
    const detail = query(pageAst, "teamAnnualizedDetailQuery");
    const state = query(pageAst, "teamAnnualizedMemberId");
    expect(expression(state.arguments[0])).toBeNull();
    const deps: any = { isUserPreview: false, previewUserId: null, teamAnnualizedMemberId: null, canViewTeamOverview: true, isTotalProfitReportVisible: true, totalProfitDetailTab: "team", teamAnnualizedMember: undefined, T0_JOURNAL_STALE_TIME_MS: 6000 };
    expect(expression(normal.arguments[0], deps)).toEqual({ ledgerId: 52, previewUserId: undefined });
    expect(expression(detail.arguments[1], deps).enabled).toBe(false);
    const button = required(nodes(pageAst, ts.isJsxElement).find(node => nodes(node, ts.isCallExpression).some(call => call.expression.getText() === "setTeamAnnualizedMemberId") && opening(node).tagName.getText() === "button"), "annualized number button");
    const setter = vi.fn((id: number) => { deps.teamAnnualizedMemberId = id; deps.teamAnnualizedMember = { userId: id }; });
    const rendered = expression(button, { React, member: { userId: 101, name: "甲", annualizedReturn: 0.1 }, setTeamAnnualizedMemberId: setter, formatT0AnnualizedReturn: () => "10%" });
    expect(content(rendered)).toBe("10%");
    expect(rendered.props.className.split(" ")).toEqual(expect.arrayContaining(["border-b", "border-dashed"]));
    rendered.props.onClick();
    expect(setter).toHaveBeenCalledWith(101);
    expect(expression(detail.arguments[0], deps)).toEqual({ ledgerId: 52, previewUserId: undefined, annualizedDetailUserId: 101 });
    expect(expression(detail.arguments[1], deps).enabled).toBe(true);
    for (const patch of [{ canViewTeamOverview: false }, { isTotalProfitReportVisible: false }, { totalProfitDetailTab: "income" }, { teamAnnualizedMember: undefined }]) expect(expression(detail.arguments[1], { ...deps, ...patch }).enabled).toBe(false);
    expect(expression(detail.arguments[0], { ...deps, isUserPreview: true, previewUserId: ROOT }).previewUserId).toBe(ROOT);
  });

  it("缓存旧成员详情不展示，切换scope/Tab的真实effect清空选择，关闭也清空", () => {
    const data = freeze({ userId: 101, cashFlows: [{ amount: -10 }] });
    expect(initial(pageAst, "teamAnnualizedDetail", { loadedTeamAnnualizedDetail: data, teamAnnualizedMemberId: 103 })).toBeUndefined();
    expect(initial(pageAst, "teamAnnualizedDetail", { loadedTeamAnnualizedDetail: data, teamAnnualizedMemberId: 101 })).toBe(data);
    const effect = required(nodes(pageAst, ts.isCallExpression).find(node => node.expression.getText() === "useEffect" && nodes(node.arguments[0], ts.isCallExpression).some(call => call.expression.getText() === "setTeamAnnualizedMemberId")), "scope reset effect");
    const setter = vi.fn();
    expression(effect.arguments[0], { setTeamAnnualizedMemberId: setter })();
    expect(setter).toHaveBeenCalledWith(null);
    expect(expression(effect.arguments[1], { previewUserId: 28, viewerScopeUserId: 29, totalProfitDetailTab: "income", isTotalProfitReportVisible: false })).toEqual([28, 29, "income", false]);
    initial(pageAst, "closeTeamAnnualizedDetail", { setTeamAnnualizedMemberId: setter, useCallback: (callback: any) => callback })();
    expect(setter).toHaveBeenLastCalledWith(null);
  });

  it("实际组件存入负数绿/取出正数红，terminal不冒充存取；income/net两位展示不改原值", () => {
    const h = dialogHarness();
    const before = JSON.stringify(h.detail);
    const tree = h.render();
    const tbody = required(elements(tree).find(node => node.type === "tbody"), "tbody");
    const rows = elements(tbody).filter(node => node.type === "tr");
    expect(rows).toHaveLength(2);
    expect(content(rows[0])).toContain("存入-1,000.123456");
    expect(content(rows[1])).toContain("取出+200.123456");
    for (const [index, color] of [[0, "text-emerald-600"], [1, "text-rose-600"]] as const) expect(elements(rows[index]).filter(node => node.type === "td").slice(1).every(node => node.props.className.includes(color))).toBe(true);
    expect(h.incomeText(12.345678)).toBe("12.35");
    expect(h.incomeText(-12.345678, true)).toBe("-12.35");
    expect(h.incomeText(812.345678, true)).toBe("+812.35");
    expect(h.amountText(200.123456, true)).toBe("+200.123456");
    expect(content(required(elements(tree).find(node => node.type === "tfoot"), "tfoot"))).toContain("留存（结余）+812.35");
    expect(content(tree)).toContain("本人订单 10.12＋收到分佣 1.11＋已到账共享 1.11＝12.35 U");
    expect(JSON.stringify(h.detail)).toBe(before);
  });

  it("XIRR公式默认可见不包在details；targetRef覆盖完整dialog、长图参数显式、所有控制区hide", () => {
    const h = dialogHarness();
    const tree = h.render();
    const all = elements(tree);
    const formula = required(all.find(node => node.type === "div" && content(node).startsWith("每笔现金流 ÷")), "visible formula");
    const disclosures = all.filter(node => node.type === "details");
    expect(disclosures).toHaveLength(2);
    expect(disclosures.every(node => !elements(node).includes(formula) && !node.props.open && node.props["data-card-export-expand"] === "true")).toBe(true);
    const report = required(all.find(node => node.props.role === "dialog"), "report ref");
    const download = required(all.find(node => node.type === "mock-download"), "download component");
    expect(download.props.targetRef).toBe(report.props.ref);
    expect(download.props).toMatchObject({ captureFullContent: true, outerPadding: 8, fullContentHorizontalBleed: 0, fullContentBottomPadding: 0, exportBackground: "#ffffff", filenamePrefix: "T+0年化回报说明", variant: "bare" });
    const hidden = all.filter(node => node.props["data-card-export-hide"] === "true");
    expect(hidden).toHaveLength(2);
    expect(hidden.some(node => elements(node).includes(download))).toBe(true);
    expect(all.filter(node => node.type === "button").every(button => hidden.some(wrapper => elements(wrapper).includes(button)))).toBe(true);
    expect(elements(h.render(null)).some(node => node.type === "mock-download")).toBe(false);
  });
});

// 最小可审计DOM桩；选择、clone、样式复制、展开、父高度释放、测量均执行生产函数。
function styleObject(source: any = {}) {
  const style: any = { ...source };
  Object.defineProperty(style, "setProperty", { enumerable: false, value: (key: string, value: string) => { style[key.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value; } });
  return style;
}
class MemoryElement {
  children: MemoryElement[] = [];
  parentElement: MemoryElement | null = null;
  attributes: Record<string, string> = {};
  style: any = styleObject();
  scrollTop = 0;
  scrollLeft = 0;
  scrollHeight = 300;
  className = "";
  textContent = "";
  rect = { width: 400, height: 300, top: 0, bottom: 300 };
  constructor(public tagName = "DIV") {}
  appendChild(element: MemoryElement) { this.children.push(element); element.parentElement = this; return element; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  hasAttribute(name: string) { return name in this.attributes; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  querySelectorAll(selector: string): MemoryElement[] {
    const match = (element: MemoryElement) => selector === "*" || (selector.startsWith("[") ? element.hasAttribute(selector.slice(1, -1)) : element.tagName === selector.toUpperCase());
    return this.children.flatMap(child => [...(match(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  cloneNode(deep: boolean) {
    const cloned = new MemoryElement(this.tagName);
    cloned.attributes = { ...this.attributes }; cloned.style = styleObject(this.style); cloned.rect = { ...this.rect }; cloned.scrollHeight = this.scrollHeight;
    if (deep) this.children.forEach(child => cloned.appendChild(child.cloneNode(true)));
    return cloned;
  }
  getBoundingClientRect() { return this.rect; }
}
function domHarness() {
  const document = { body: new MemoryElement("BODY"), createElement: (tag: string) => new MemoryElement(tag.toUpperCase()) };
  const window = { getComputedStyle: (element: MemoryElement) => {
    const entries = Object.entries(element.style);
    return { length: entries.length, item: (index: number) => entries[index][0], getPropertyValue: (key: string) => element.style[key], getPropertyPriority: () => "", position: element.style.position, borderRadius: element.style.borderRadius };
  } };
  const copy = production(exportAst, "copyRenderedStyles", { window, HTMLInputElement: class {}, HTMLTextAreaElement: class {}, HTMLSelectElement: class {} });
  const capture = production(exportAst, "createExactSnapshotContainer", { window, document, copyRenderedStyles: copy, EXPORT_HIDE_ATTRIBUTE: "data-card-export-hide" });
  const target = new MemoryElement();
  const controls = target.appendChild(new MemoryElement()); controls.setAttribute("data-card-export-hide", "true");
  const scroll = target.appendChild(new MemoryElement()); scroll.setAttribute("data-card-export-expand", "true"); scroll.style = styleObject({ height: "150px", maxHeight: "150px", overflowY: "auto", flex: "1 1 auto" }); scroll.scrollTop = 80; scroll.scrollLeft = 20;
  const section = scroll.appendChild(new MemoryElement("SECTION")); section.style = styleObject({ height: "60px", minHeight: "60px", maxHeight: "60px" });
  const details = section.appendChild(new MemoryElement("DETAILS")); details.setAttribute("data-card-export-expand", "true"); details.style = styleObject({ height: "20px", maxHeight: "20px", overflow: "hidden" });
  const tail = details.appendChild(new MemoryElement()); tail.rect = { width: 400, height: 100, top: 1150, bottom: 1250 };
  const unmarked = target.appendChild(new MemoryElement("DETAILS")); unmarked.style = styleObject({ height: "20px", maxHeight: "20px", overflow: "hidden" }); unmarked.scrollTop = 7;
  return { document, target, scroll, section, details, unmarked, capture };
}

describe("长图克隆执行与默认订单导出回归", () => {
  it("仅全内容克隆展开显式标记details/滚动区并释放父高度、reset scroll，删除hide控件且源DOM完全不变", () => {
    const h = domHarness();
    const snapshot = h.capture(h.target, "R1", 8, true, 0, "#ffffff", 0.07, 0);
    expect(snapshot.initialSize).toBeNull();
    expect(snapshot.clonedTarget.querySelectorAll("[data-card-export-hide]")).toHaveLength(0);
    const [scroll, details] = snapshot.clonedTarget.querySelectorAll("[data-card-export-expand]");
    for (const element of [scroll, details]) {
      expect(element.style).toMatchObject({ height: "auto", minHeight: "0", maxHeight: "none", overflow: "visible", overflowX: "visible", overflowY: "visible", flex: "0 0 auto" });
      expect([element.scrollTop, element.scrollLeft]).toEqual([0, 0]);
    }
    expect(details.hasAttribute("open")).toBe(true);
    expect(details.parentElement.style).toMatchObject({ height: "auto", minHeight: "0", maxHeight: "none" });
    const unmarked = snapshot.clonedTarget.querySelectorAll("DETAILS")[1];
    expect(unmarked.hasAttribute("open")).toBe(false);
    expect(unmarked.style).toMatchObject({ height: "20px", maxHeight: "20px", overflow: "hidden" });
    expect(unmarked.scrollTop).toBe(7);
    expect(h.target.querySelectorAll("[data-card-export-hide]")).toHaveLength(1);
    expect(h.details.hasAttribute("open")).toBe(false);
    expect(h.section.style.height).toBe("60px");
    expect([h.scroll.scrollTop, h.scroll.scrollLeft]).toEqual([80, 20]);
    const size = snapshot.finalizeSnapshot();
    expect(size).toEqual({ width: 416, height: 1266 });
    expect(snapshot.clonedTarget.style.overflow).toBe("visible");
    expect(snapshot.clonedTarget.querySelectorAll("[data-card-export-watermark]")).toHaveLength(1);
    snapshot.container.remove();
    expect(h.document.body.children).toHaveLength(0);
  });

  it("默认非full导出仍不展开标记/不reset scroll，不扩大至远端内容；full默认安全留白保留", () => {
    const h = domHarness();
    const normal = h.capture(h.target, "R1", 16, false, 16);
    expect(normal.initialSize).toEqual({ width: 432, height: 332 });
    expect(normal.clonedTarget.style.overflow).toBe("hidden");
    expect(normal.clonedTarget.querySelectorAll("DETAILS")[0].hasAttribute("open")).toBe(false);
    expect(normal.clonedTarget.querySelectorAll("[data-card-export-expand]")[0].scrollTop).toBe(80);
    const full = h.capture(h.target, "R1", 16, true, 16);
    expect(full.finalizeSnapshot()).toEqual({ width: 464, height: 1298 });
    expect(h.details.hasAttribute("open")).toBe(false);
    normal.container.remove(); full.container.remove();
  });

  it("下载组件真实generatePreview默认capture=false/圆形订单按钮；full参数透传、canvas全尺寸和scroll0、finally释放clone", async () => {
    async function generate(props: any) {
      const remove = vi.fn();
      const finalizeSnapshot = vi.fn(() => ({ width: 416, height: 1266 }));
      const createSnapshot = vi.fn((..._args: any[]) => ({ container: {}, clonedTarget: {}, initialSize: null, finalizeSnapshot }));
      const callbacks: any[] = [];
      const state = vi.fn();
      const html2canvas = vi.fn(async (_container: any, _options: any) => ({}));
      const helpers = { formatBeijingTime: production(exportAst, "formatBeijingTime"), sanitizeFilename: production(exportAst, "sanitizeFilename"), getErrorMessage: production(exportAst, "getErrorMessage") };
      createSnapshot.mockReturnValue({ container: { remove }, clonedTarget: {}, initialSize: null, finalizeSnapshot });
      const component = production(exportAst, "OrderCardImageDownload", { React, ...helpers, useState: (value: any) => [value, state], useEffect: () => {}, useCallback: (callback: any) => { callbacks.push(callback); return callback; }, createPortal: vi.fn(), X: "mock-x", Download: "mock-download", Share2: "mock-share", LoaderCircle: "mock-loader", toast: { error: vi.fn(), success: vi.fn() }, window: { innerWidth: 400, innerHeight: 800 }, URL: { createObjectURL: () => "blob:isolated", revokeObjectURL: vi.fn() }, createExactSnapshotContainer: createSnapshot, prepareSnapshotImages: vi.fn(), waitForSnapshotAssets: vi.fn(async () => {}), html2canvas, canvasToBlob: vi.fn(async () => new Blob(["PNG"], { type: "image/png" })) });
      const target = {};
      const tree = component({ targetRef: { current: target }, orderNo: "甲", ...props });
      await callbacks[0]();
      expect(remove).toHaveBeenCalledOnce();
      expect(state).toHaveBeenCalledWith(true);
      expect(state).toHaveBeenLastCalledWith(false);
      expect(html2canvas.mock.calls[0][1]).toMatchObject({ width: 416, height: 1266, windowHeight: 1266, scrollX: 0, scrollY: 0, scale: 2, allowTaint: false });
      return { tree, createSnapshot, target };
    }
    const normal = await generate({});
    expect(normal.createSnapshot.mock.calls[0].slice(2)).toEqual([16, false, 16, undefined, 0.07, undefined]);
    const normalButton = required(elements(normal.tree).find(node => node.type === "button"), "default download button");
    expect(normalButton.props.className).toContain("rounded-full");
    expect(normalButton.props["aria-label"]).toBe("订单图片预览");
    const full = await generate({ captureFullContent: true, outerPadding: 8, fullContentHorizontalBleed: 0, fullContentBottomPadding: 0, exportBackground: "#ffffff", variant: "bare" });
    expect(full.createSnapshot.mock.calls[0][0]).toBe(full.target);
    expect(full.createSnapshot.mock.calls[0].slice(2)).toEqual([8, true, 0, "#ffffff", 0.07, 0]);
    expect(required(elements(full.tree).find(node => node.type === "button"), "bare button").props.className).not.toContain("rounded-full");
  });
});
