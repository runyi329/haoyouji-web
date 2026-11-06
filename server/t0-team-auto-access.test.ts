import { readFileSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 仅只读 AST 并运行生产声明；DB 是内存关系表，禁止导入应用、生产DB或触发 ensure/write。
function ast(relative: string) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, relative.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
const teamAst = ast("./ledger52-t0-team-overview.ts");
const routerAst = ast("./routers.ts");
const weeklyAst = ast("./ledger52-t0-weekly-settlement.ts");
const pageAst = ast("../client/src/pages/T0Journal.tsx");
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
function compiled(text: string, deps: Record<string, any>, result: string): any {
  const output = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(deps), "exports", `${output}\nreturn ${result};`)(...Object.values(deps), {});
}
function production(root: ts.SourceFile, name: string, deps: Record<string, any>): any {
  const node = required(nodes(root, ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
  return compiled(node.getText(root), deps, name);
}
function withoutImports(root: ts.SourceFile) {
  const printer = ts.createPrinter();
  return root.statements.filter(node => !ts.isImportDeclaration(node)).map(node => {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isolated = modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ? ts.factory.replaceModifiers(node, modifiers.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword)) : node;
    return printer.printNode(ts.EmitHint.Unspecified, isolated, root);
  }).join("\n");
}
const ROOT = 600123; // 不使用原4952766白名单。
const OWNER = 28;
type User = { id: number; invited_by_user_id: number; name: string };
type Scoped = { ledger_id: number; user_id: number };
type Entry = Scoped & { id: string; related_user_id: number; action: string; instrument_type?: string; filled?: boolean; is_pending?: boolean; quantity?: number };
type Payout = Scoped & { related_user_id: number; direction: string; amount: number };
type Snapshot = Scoped & { entry_id: string; opening_entry_id: string; beneficiary_user_id: number };
type Transfer = Scoped & { closing_entry_id: string; recipient_user_id: number; amount: number };
function entry(id = "entry", related_user_id = 101, extra: Partial<Entry> = {}): Entry {
  return { id, ledger_id: 52, user_id: OWNER, related_user_id, action: "openLong", ...extra };
}
function sourceEntries(): Entry[] { return [entry("opening", 9000), entry("closing", 9000, { action: "closeLong" })]; }
function snapshot(extra: Partial<Snapshot> = {}): Snapshot {
  return { ledger_id: 52, user_id: OWNER, entry_id: "closing", opening_entry_id: "opening", beneficiary_user_id: 101, ...extra };
}
function transfer(extra: Partial<Transfer> = {}): Transfer {
  return { ledger_id: 52, user_id: OWNER, closing_entry_id: "closing", recipient_user_id: 101, amount: 2, ...extra };
}
function payout(extra: Partial<Payout> = {}): Payout {
  return { ledger_id: 52, user_id: OWNER, related_user_id: 101, direction: "deposit", amount: 10, ...extra };
}
function accessHarness(options: {
  journalOwnerUserId?: number;
  users?: User[];
  memberships?: Array<{ ledgerId: number; userId: number }>;
  entries?: Entry[];
  payouts?: Payout[];
  snapshots?: Snapshot[];
  transfers?: Transfer[];
} = {}) {
  const users = options.users ?? [{ id: 101, invited_by_user_id: ROOT, name: "下级" }];
  const memberships = options.memberships ?? users.map(user => ({ ledgerId: 52, userId: user.id }));
  const entries = options.entries ?? [];
  const payouts = options.payouts ?? [];
  const snapshots = options.snapshots ?? [];
  const transfers = options.transfers ?? [];
  const authorityOwner = options.journalOwnerUserId ?? OWNER;
  const execute = vi.fn(async (sql: string, params: number[]) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    expect(normalized).toMatch(/^SELECT /);
    expect(normalized).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|REPLACE|SUM|COUNT|GROUP BY|LIMIT|filled|is_pending|instrument_type|quantity)\b/i);
    expect(normalized).not.toMatch(/SELECT\s+\*|quote|market|balance_history|recharge_orders/i);
    expect((sql.match(/\?/g) ?? []).length).toBe(params.length);
    if (normalized.includes("FROM users WHERE")) {
      expect(params.length).toBeLessThanOrEqual(500);
      expect(normalized).toContain("WHERE invited_by_user_id IN (");
      return [users.filter(user => params.includes(user.invited_by_user_id)).sort((a, b) => a.id - b.id)];
    }
    if (normalized.includes("FROM ledger_members")) {
      expect(normalized).toMatch(/^SELECT userId FROM ledger_members WHERE ledgerId = \? AND userId IN \(/);
      expect(params[0]).toBe(52);
      expect(params.length - 1).toBeLessThanOrEqual(500);
      return [memberships.filter(row => row.ledgerId === params[0] && params.slice(1).includes(row.userId))];
    }
    // 验证真实 SQL 的每个 UNION 条件，再按这些关系条件模拟数据库 SELECT，而不是直接返回预设合格ID。
    const branches = normalized.split(" UNION ");
    expect(branches).toHaveLength(4);
    const width = params.length / 4;
    const scope = params.slice(0, width);
    expect(scope.slice(0, 2)).toEqual([52, authorityOwner]);
    expect(width - 2).toBeGreaterThan(0);
    expect(width - 2).toBeLessThanOrEqual(500);
    const aliases = ["entry", "payout", "shared_entry", "transfer"];
    const userFields = ["related_user_id", "related_user_id", "beneficiary_user_id", "recipient_user_id"];
    for (let index = 0; index < 4; index += 1) {
      expect(params.slice(index * width, (index + 1) * width)).toEqual(scope);
      expect(branches[index]).toContain(`SELECT ${aliases[index]}.${userFields[index]} AS userId`);
      expect(branches[index]).toContain(`WHERE ${aliases[index]}.ledger_id = ? AND ${aliases[index]}.user_id = ? AND ${aliases[index]}.${userFields[index]} IN (`);
    }
    expect(branches[1]).toContain("payout.direction IN ('deposit', 'withdrawal') AND ABS(payout.amount) > 0.000001");
    for (const [alias, field] of [["source_entry", "entry_id"], ["opening_entry", "opening_entry_id"]]) {
      expect(branches[2]).toContain(`INNER JOIN ledger52_t0_journal_entries ${alias} ON ${alias}.id = shared_entry.${field} AND ${alias}.ledger_id = shared_entry.ledger_id AND ${alias}.user_id = shared_entry.user_id`);
    }
    expect(branches[3]).toContain("INNER JOIN ledger52_t0_journal_entries source_closing ON source_closing.id = transfer.closing_entry_id AND source_closing.ledger_id = transfer.ledger_id AND source_closing.user_id = transfer.user_id AND source_closing.action IN ('closeLong', 'closeShort')");
    expect(branches[3]).toContain("ABS(transfer.amount) > 0.000001");
    const scoped = (row: Scoped) => row.ledger_id === scope[0] && row.user_id === scope[1];
    const candidate = (id: number) => scope.slice(2).includes(id);
    const exists = (id: string, row: Scoped, closing = false) => entries.some(source => source.id === id && source.ledger_id === row.ledger_id && source.user_id === row.user_id && (!closing || ["closeLong", "closeShort"].includes(source.action)));
    const ids = [
      ...entries.filter(row => scoped(row) && candidate(row.related_user_id)).map(row => row.related_user_id),
      ...payouts.filter(row => scoped(row) && candidate(row.related_user_id) && ["deposit", "withdrawal"].includes(row.direction) && Math.abs(row.amount) > 0.000001).map(row => row.related_user_id),
      ...snapshots.filter(row => scoped(row) && candidate(row.beneficiary_user_id) && exists(row.entry_id, row) && exists(row.opening_entry_id, row)).map(row => row.beneficiary_user_id),
      ...transfers.filter(row => scoped(row) && candidate(row.recipient_user_id) && Math.abs(row.amount) > 0.000001 && exists(row.closing_entry_id, row, true)).map(row => row.recipient_user_id),
    ];
    return [[...new Set(ids)].map(userId => ({ userId }))];
  });
  const getDbConnection = vi.fn(async () => ({ execute }));
  const financialFacts = { entries: [], payoutCashFlows: [], profitShareSnapshots: [], sharedIncomeTransfers: [], sharedIncomeReductions: [] };
  const journalReader = vi.fn(async () => financialFacts);
  const api = compiled(withoutImports(teamAst), { TRPCError, getDbConnection, getLedger52T0JournalTeamFinancialFacts: journalReader }, "({ getLedger52T0TeamAccess, getLedger52T0TeamOverview })");
  const access = vi.fn(api.getLedger52T0TeamAccess);
  return { ...api, access, execute, getDbConnection, journalReader, financialFacts };
}
function routeHarness(mode = "member", targetRole: string | null = "member", activity = true, scope: {
  rootUserId?: number; journalOwnerUserId?: number; users?: User[]; entries?: Entry[];
} = {}) {
  const rootUserId = scope.rootUserId ?? ROOT;
  const journalOwnerUserId = scope.journalOwnerUserId ?? OWNER;
  const authorityOwner = mode === "admin" ? journalOwnerUserId : OWNER;
  const h = accessHarness({
    journalOwnerUserId: authorityOwner,
    users: scope.users ?? [{ id: 101, invited_by_user_id: rootUserId, name: "下级" }],
    entries: scope.entries ?? (activity ? [entry("entry", 101, { user_id: authorityOwner })] : []),
  });
  // 用真实概览编译依赖，资格共享可观察的helper，财务计算来自原生产纯函数声明。
  const helperNames = ["toNumber", "getCalendarDateUtc", "getBeijingDateValue", "getCalendarDateText", "recordEarlierCalendarDate", "calculateTeamXirr", "buildTeamAnnualizedCashFlowDetail", "archivePrice", "scopeKey", "sortByTime", "buildRealizedDetails", "buildRecentDetails", "buildOpeningClosingAllocations", "linkedNetPnl", "getFrozenSnapshotOpeningLinks", "buildFrozenSnapshotDetails", "regularDistributable", "buildProfitDistribution", "buildLedger52T0IncomeAttributionContext", "calculateLedger52T0IncomeByClosing", "calculateLedger52T0IncomeByUser", "getLedger52T0TeamOverview"];
  const actionNode = required(nodes(teamAst, ts.isVariableDeclaration).find(node => node.name.getText() === "actionInfo"), "actionInfo");
  const declarations = helperNames.map(name => required(nodes(teamAst, ts.isFunctionDeclaration).find(node => node.name?.text === name), name).getText(teamAst)).join("\n");
  const overview = vi.fn(compiled(`const ${actionNode.getText(teamAst)};\n${declarations}`, { TRPCError, getLedger52T0TeamAccess: h.access, getLedger52T0JournalTeamFinancialFacts: h.journalReader }, "getLedger52T0TeamOverview"));
  const week = { weekStartBjt: "2026-11-02", weekEndBjt: "2026-11-09" };
  const emptyIncome = () => ({ orderIncome: 0, commissionIncome: 0, sharedIncome: 0, total: 0 });
  // 执行实际周团队函数；仅周报财务引擎输入/输出为空的纯桩，验证真实名单与资金读取路径。
  const weekly = vi.fn(production(weeklyAst, "getLedger52T0TeamWeeklySettlement", {
    TRPCError, getLedger52T0JournalTeamFinancialFacts: h.journalReader,
    getLedger52T0TeamOverview: overview,
    getLedger52T0WeekWindow: () => week,
    assertWeekStartBjt: (value: string) => value,
    getWeekWindowFromStart: () => week,
    getSettlementIncomeFacts: (journal: any) => journal,
    buildSettlementIncomeAttribution: () => ({ closings: [] }),
    buildWeeklySettlementReport: () => ({ generatedAt: "2026-11-06", status: "realtime", period: week, members: [{ userId: ROOT, income: { ...emptyIncome(), total: 999 } }, { userId: 999, income: { ...emptyIncome(), total: 888 } }] }),
    emptyIncome, sumIncomeParts: (incomes: any[]) => incomes.reduce((sum, income) => ({ ...sum, total: sum.total + income.total }), emptyIncome()),
  }));
  const resolveScope = vi.fn(async () => ({ mode, relatedUserId: ROOT, journalOwnerUserId }));
  const owner = vi.fn(async () => OWNER);
  const getUserMembership = vi.fn(async () => targetRole === null ? null : ({ role: targetRole }));
  const loadModule = vi.fn(async (path: string) => {
    if (path === "./ledger52-t0-journal") return { resolveLedger52T0JournalReadScope: resolveScope, getLedger52T0JournalOwnerUserId: owner };
    if (path === "./ledger52-t0-team-overview") return { getLedger52T0TeamAccess: h.access, getLedger52T0TeamOverview: overview };
    if (path === "./ledger52-t0-weekly-settlement") return { getLedger52T0TeamWeeklySettlement: weekly };
    throw new Error(`Forbidden module load: ${path}`);
  });
  const routes = Object.fromEntries(["t0CanViewTeamOverview", "t0GetTeamOverview", "t0GetTeamWeeklySettlement"].map(name => {
    const property = required(nodes(routerAst, ts.isPropertyAssignment).find(node => node.name.getText() === name), name);
    const call = property.initializer;
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) throw new Error(`Expected query: ${name}`);
    const transformed = ts.transform(call.arguments[0], [context => root => ts.visitNode(root, function visit(node): ts.VisitResult<ts.Node> {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return ts.factory.updateCallExpression(node, ts.factory.createIdentifier("loadModule"), undefined, node.arguments);
      return ts.visitEachChild(node, visit, context);
    }) as typeof root]);
    const callbackText = ts.createPrinter().printNode(ts.EmitHint.Expression, transformed.transformed[0], routerAst);
    transformed.dispose();
    const run = compiled(`const isolated = (${callbackText});`, { loadModule, TRPCError, dbLedger: { getUserMembership } }, "isolated");
    const inputCall = call.expression.expression;
    if (!ts.isCallExpression(inputCall)) throw new Error(`Expected schema: ${name}`);
    const schema = compiled(`const isolated = (${inputCall.arguments[0].getText(routerAst)});`, { z }, "isolated");
    return [name, (input: any = {}, ctx: any = { user: { id: 456, role: "member" }, isViewingAs: false }) => run({ ctx, input: schema.parse({ ledgerId: 52, ...input }) })];
  }));
  return { h, routes, overview, weekly, resolveScope, owner, getUserMembership };
}
const input = { rootUserId: ROOT, journalOwnerUserId: OWNER };
const routeNames = ["t0CanViewTeamOverview", "t0GetTeamOverview", "t0GetTeamWeeklySettlement"];

describe("动态团队准入：真实AST、轻量关系SELECT", () => {
  it("任意保留订单含filled=false挂单、现货/合约/期权/网格均开放；不以数量或成交状态筛资格", async () => {
    for (const instrument_type of ["spot", "contract", "option", "grid"]) {
      const h = accessHarness({ entries: [entry("pending", 101, { instrument_type, filled: false, is_pending: true, quantity: 0 })] });
      const access = await h.getLedger52T0TeamAccess(input);
      expect(access).toMatchObject({ enabled: true, eligibleDescendants: [{ userId: 101, parentUserId: ROOT, depth: 1 }] });
      expect(h.journalReader).not.toHaveBeenCalled();
    }
  });

  it("本人活动不开放；先完整递归再筛选，无会员/无活动中间推荐节点折叠到最近可见父级", async () => {
    const self = accessHarness({ entries: [entry("self", ROOT)] });
    expect(await self.getLedger52T0TeamAccess(input)).toEqual({ enabled: false, eligibleDescendants: [] });
    const h = accessHarness({
      users: [
        { id: 101, invited_by_user_id: ROOT, name: "可见父" }, { id: 102, invited_by_user_id: 101, name: "无活动中间人" },
        { id: 103, invited_by_user_id: 102, name: "可见孙" }, { id: 104, invited_by_user_id: 103, name: "无membership中间人" },
        { id: 105, invited_by_user_id: 104, name: "多级后代" }, { id: 201, invited_by_user_id: ROOT, name: "不活跃直推" },
        { id: 202, invited_by_user_id: 201, name: "折叠到root" }, { id: ROOT, invited_by_user_id: 101, name: "循环root" },
        { id: 999, invited_by_user_id: 888, name: "跨团队" },
      ], memberships: [101, 102, 103, 105, 201, 202, ROOT, 999].map(userId => ({ ledgerId: 52, userId })),
      entries: [ROOT, 101, 103, 105, 202, 999].map(id => entry(`entry-${id}`, id)),
    });
    const result = await h.getLedger52T0TeamAccess(input);
    expect(result.enabled).toBe(true);
    expect(result.eligibleDescendants.map((member: any) => [member.userId, member.parentUserId, member.depth])).toEqual([[101, ROOT, 1], [202, ROOT, 1], [103, 101, 2], [105, 103, 3]]);
    expect(h.journalReader).not.toHaveBeenCalled();
    const invalid = accessHarness();
    for (const bad of [{ rootUserId: 0 }, { rootUserId: 1.5 }, { journalOwnerUserId: -1 }, { journalOwnerUserId: NaN }]) expect(await invalid.getLedger52T0TeamAccess({ ...input, ...bad })).toEqual({ enabled: false, eligibleDescendants: [] });
    expect(invalid.getDbConnection).not.toHaveBeenCalled();
  });

  it("仅真实入金/提现、有效来源订单分佣快照或共享收益也可开放，无需本人的订单", async () => {
    for (const options of [
      { payouts: [payout()] }, { payouts: [payout({ direction: "withdrawal", amount: -10 })] },
      { entries: sourceEntries(), snapshots: [snapshot()] }, { entries: sourceEntries(), transfers: [transfer()] },
    ]) {
      const h = accessHarness(options);
      const result = await h.getLedger52T0TeamAccess(input);
      expect(result.enabled).toBe(true);
      expect(result.eligibleDescendants.map((member: any) => member.userId)).toEqual([101]);
      expect(h.journalReader).not.toHaveBeenCalled();
    }
  });

  it("无52membership/无活动/其它owner或ledger/来源已删除或跨scope的孤立快照共享均不开放", async () => {
    const exclusions = [
      { memberships: [{ ledgerId: 53, userId: 101 }], entries: [entry()] }, {},
      { entries: [entry("other-owner", 101, { user_id: ROOT })] }, { entries: [entry("other-ledger", 101, { ledger_id: 53 })] },
      { payouts: [payout({ user_id: ROOT }), payout({ ledger_id: 53 }), payout({ direction: "other" }), payout({ amount: 0.000001 })] },
      { entries: sourceEntries(), snapshots: [snapshot({ user_id: ROOT }), snapshot({ ledger_id: 53 })], transfers: [transfer({ user_id: ROOT }), transfer({ ledger_id: 53 }), transfer({ amount: 0.000001 })] },
      { snapshots: [snapshot()], transfers: [transfer()] },
      { entries: [sourceEntries()[1]], snapshots: [snapshot()] },
      { entries: [sourceEntries()[0]], snapshots: [snapshot()], transfers: [transfer()] },
      { entries: sourceEntries().map(row => ({ ...row, user_id: ROOT })), snapshots: [snapshot()], transfers: [transfer()] },
      { entries: sourceEntries().map(row => ({ ...row, ledger_id: 53 })), snapshots: [snapshot()], transfers: [transfer()] },
      { entries: [entry("closing", 9000)], transfers: [transfer()] },
    ];
    for (const options of exclusions) {
      const h = accessHarness(options);
      expect(await h.getLedger52T0TeamAccess(input)).toEqual({ enabled: false, eligibleDescendants: [] });
      expect(await h.getLedger52T0TeamOverview(input)).toEqual({ enabled: false });
      expect(h.journalReader).not.toHaveBeenCalled();
    }
  });

  it("BFS、membership和活动每批不超过500；四个UNION重复ledger52+authority owner，绝不用root替代且不ensure/write/金融扫描", async () => {
    const users = Array.from({ length: 501 }, (_, index) => ({ id: 1000 + index, invited_by_user_id: ROOT, name: `下级${index}` }));
    const h = accessHarness({ users, entries: users.map(user => entry(`e-${user.id}`, user.id)) });
    const result = await h.getLedger52T0TeamAccess(input);
    expect(result.eligibleDescendants).toHaveLength(501);
    const calls = h.execute.mock.calls;
    expect(calls.filter(([sql]) => sql.includes("FROM users WHERE")).map(([, params]) => params.length)).toEqual([1, 500, 1]);
    expect(calls.filter(([sql]) => sql.includes("FROM ledger_members")).map(([, params]) => params.length - 1)).toEqual([500, 1]);
    const activityCalls = calls.filter(([sql]) => sql.includes("UNION"));
    expect(activityCalls.map(([, params]) => params.length / 4 - 2)).toEqual([500, 1]);
    expect(activityCalls.flatMap(([, params]) => params.slice(2, params.length / 4))).toEqual(users.map(user => user.id));
    expect(h.journalReader).not.toHaveBeenCalled();
    const dependencyNames = ["getLedger52T0TeamAccess", "getRecursiveTeamMembers", "getLedger52MemberUserIds"];
    for (const name of dependencyNames) {
      const declaration = required(nodes(teamAst, ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
      const calledNames = nodes(declaration, ts.isCallExpression).map(node => node.expression.getText(teamAst));
      expect(calledNames.some(name => /ensure|migrat|insert|update|financial|quote|write/i.test(name))).toBe(false);
    }
  });
});

describe("三路由动态门禁与authority scope一致", () => {
  it("普通root无需白名单；canAccess只下发enabled且无财务读取；overview/weekly复用同helper与合格名单", async () => {
    const h = routeHarness("member", "member", true, { journalOwnerUserId: 999 }); // 普通成员仍lookup真实owner，不能改用scope owner。
    const probe = await h.routes.t0CanViewTeamOverview({ rootUserId: 999, journalOwnerUserId: ROOT });
    expect(probe).toEqual({ enabled: true });
    expect(Object.keys(probe)).toEqual(["enabled"]);
    expect(h.h.access).toHaveBeenLastCalledWith(input);
    expect(h.h.journalReader).not.toHaveBeenCalled();
    const overview = await h.routes.t0GetTeamOverview();
    expect(overview.members.map((member: any) => member.userId)).toEqual([101]);
    const weekly = await h.routes.t0GetTeamWeeklySettlement();
    expect(weekly.members.map((member: any) => member.userId)).toEqual([101]);
    expect(weekly.summary).toMatchObject({ participantCount: 1, income: { total: 0 } });
    expect(h.h.access.mock.calls.every(([scope]) => JSON.stringify(scope) === JSON.stringify(input))).toBe(true);
    expect(h.resolveScope).toHaveBeenCalledWith({ id: 456, role: "member", isViewingAs: false });
    expect(h.owner).toHaveBeenCalledTimes(3);
    expect(h.h.journalReader).toHaveBeenCalledTimes(2); // overview一次；weekly共享同一份facts给概览。
    expect(h.overview.mock.calls[1][0]).toMatchObject({ ...input, financialFacts: expect.any(Promise) });
    const closed = routeHarness("member", "member", false);
    for (const name of routeNames) expect(await closed.routes[name]()).toEqual({ enabled: false });
    expect(closed.h.journalReader).not.toHaveBeenCalled();
    expect(closed.weekly).not.toHaveBeenCalled();
  });

  it("管理员Hu与普通admin只开放actor推荐链，authority owner与root严格分离，轻量响应不泄露成员", async () => {
    for (const [actor, authorityOwner, role] of [[870413, 870413, "super_admin"], [81, 81, "admin"], [81, 999, "admin"]] as const) {
      const ctx = { user: { id: actor, role }, isViewingAs: false };
      const adminInput = { rootUserId: actor, journalOwnerUserId: authorityOwner };
      const users = [
        { id: 101, invited_by_user_id: actor, name: "直推" },
        { id: 102, invited_by_user_id: 101, name: "无活动中间人" },
        { id: 103, invited_by_user_id: 102, name: "合格孙级" },
        { id: actor, invited_by_user_id: 101, name: "循环本人" },
        { id: 201, invited_by_user_id: ROOT, name: "scope.relatedUserId团队" },
        { id: 202, invited_by_user_id: 777, name: "全局无关用户" },
        ...(actor === authorityOwner ? [] : [{ id: 203, invited_by_user_id: authorityOwner, name: "authority owner团队" }]),
      ];
      const entries = [actor, 101, 103, 201, 202, 203].map(id => entry(`admin-${id}`, id, { user_id: authorityOwner }));
      const admin = routeHarness("admin", "member", true, { ...adminInput, users, entries });
      const probe = await admin.routes.t0CanViewTeamOverview({ rootUserId: ROOT, journalOwnerUserId: OWNER }, ctx);
      expect(probe).toEqual({ enabled: true });
      expect(Object.keys(probe)).toEqual(["enabled"]);
      expect(admin.h.access).toHaveBeenLastCalledWith(adminInput);
      expect(admin.h.journalReader).not.toHaveBeenCalled();
      expect(admin.overview).not.toHaveBeenCalled();
      const overview = await admin.routes.t0GetTeamOverview({ rootUserId: ROOT, journalOwnerUserId: OWNER }, ctx);
      expect(overview.relation.rootUserId).toBe(actor);
      expect(overview.members.map((member: any) => [member.userId, member.parentUserId, member.depth])).toEqual([[101, actor, 1], [103, 101, 2]]);
      expect(admin.overview).toHaveBeenLastCalledWith({ ...adminInput, annualizedDetailUserId: undefined });
      expect(admin.h.journalReader).toHaveBeenLastCalledWith({ journalOwnerUserId: authorityOwner });
      const detail = await admin.routes.t0GetTeamOverview({ annualizedDetailUserId: 103 }, ctx);
      expect(detail.annualizedDetail.userId).toBe(103);
      expect(admin.overview).toHaveBeenLastCalledWith({ ...adminInput, annualizedDetailUserId: 103 });
      expect(admin.h.access.mock.calls.every(([scope]) => scope.rootUserId === actor && scope.journalOwnerUserId === authorityOwner)).toBe(true);
      for (const target of new Set([actor, authorityOwner, ROOT, 102, 201, 202, 203])) {
        await expect(admin.routes.t0GetTeamOverview({ annualizedDetailUserId: target }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(admin.h.journalReader).toHaveBeenCalledTimes(2); // 拒绝详情前仍仅运行资格helper。
      expect(admin.owner).not.toHaveBeenCalled();
      expect(admin.getUserMembership).not.toHaveBeenCalled();
      expect(admin.resolveScope).toHaveBeenCalledWith({ id: actor, role, isViewingAs: false });
      const selfOnly = routeHarness("admin", "member", false, { ...adminInput, users, entries: entries.filter(row => row.related_user_id !== 101 && row.related_user_id !== 103) });
      expect(await selfOnly.routes.t0CanViewTeamOverview({}, ctx)).toEqual({ enabled: false });
      expect(await selfOnly.routes.t0GetTeamOverview({}, ctx)).toEqual({ enabled: false });
      await expect(selfOnly.routes.t0GetTeamOverview({ annualizedDetailUserId: actor }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(selfOnly.h.journalReader).not.toHaveBeenCalled();
    }
  });

  it("管理员自身teamweekly仍closed，不因总收益团队Tab开放而扩大至全局结算", async () => {
    for (const [actor, authorityOwner] of [[870413, 870413], [81, 81], [81, 999]]) {
      const admin = routeHarness("admin", "member", true, { rootUserId: actor, journalOwnerUserId: authorityOwner });
      expect(await admin.routes.t0GetTeamWeeklySettlement({}, { user: { id: actor, role: "admin" }, isViewingAs: false })).toEqual({ enabled: false });
      expect(admin.h.access).not.toHaveBeenCalled();
      expect(admin.h.journalReader).not.toHaveBeenCalled();
      expect(admin.weekly).not.toHaveBeenCalled();
      expect(admin.owner).not.toHaveBeenCalled();
    }
  });

  it("合法预览/代入共用管理员authority owner，拒绝非admin/异常membership/二次切换", async () => {
    const admin = routeHarness("admin");
    const adminCtx = { user: { id: OWNER, role: "admin" }, isViewingAs: false };
    for (const name of routeNames) {
      expect((await admin.routes[name]({ previewUserId: ROOT }, adminCtx)).enabled).toBe(true);
      expect(admin.h.access).toHaveBeenLastCalledWith(input);
    }
    expect(admin.getUserMembership).toHaveBeenCalledWith(52, ROOT);
    expect(admin.owner).not.toHaveBeenCalled();
    const viewingCtx = { user: { id: ROOT, role: "member" }, realUser: { id: OWNER, role: "admin" }, isViewingAs: true };
    for (const name of routeNames) {
      expect((await admin.routes[name]({}, viewingCtx)).enabled).toBe(true);
      expect(admin.h.access).toHaveBeenLastCalledWith(input);
      expect(admin.resolveScope).toHaveBeenLastCalledWith({ id: OWNER, role: "admin", isViewingAs: false });
      await expect(admin.routes[name]({ previewUserId: ROOT }, viewingCtx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(admin.routes[name]({}, { user: viewingCtx.user, isViewingAs: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    for (const targetRole of [null, "owner", "admin"]) {
      const denied = routeHarness("admin", targetRole);
      for (const name of routeNames) await expect(denied.routes[name]({ previewUserId: ROOT }, adminCtx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(denied.h.access).not.toHaveBeenCalled();
    }
    const member = routeHarness();
    for (const name of routeNames) {
      await expect(member.routes[name]({ previewUserId: ROOT })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(member.routes[name]({}, { ...viewingCtx, realUser: { id: 456, role: "member" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(member.h.access).not.toHaveBeenCalled();
  });
});

describe("总收益团队Tab前端真实AST门禁", () => {
  it("管理员/成员/预览均能请求light probe，无canAccess或非报告不发；API enabled才显示team且只点击后读财务", () => {
    const query = (name: string) => {
      const declaration = required(nodes(pageAst, ts.isVariableDeclaration).find(node => node.name.getText() === name), name);
      const call = required(declaration.initializer, name);
      if (!ts.isCallExpression(call)) throw new Error(`Expected query: ${name}`);
      return call;
    };
    const evaluate = (node: ts.Node, deps: Record<string, any>) => compiled(`const value = (${node.getText(pageAst)});`, deps, "value");
    const accessQuery = query("t0TeamOverviewAccessQuery");
    const overviewQuery = query("t0TeamOverviewQuery");
    const canView = required(nodes(pageAst, ts.isVariableDeclaration).find(node => node.name.getText() === "canViewTeamOverview")?.initializer, "canViewTeamOverview");
    const teamTab = required(nodes(pageAst, ts.isConditionalExpression).find(node => node.condition.getText() === "canViewTeamOverview" && node.whenTrue.getText().includes('id: "team"') && node.whenTrue.getText().includes('label: "团队"')), "team Tab condition");
    const base = { canAccess: true, isTotalProfitReportVisible: true, canManage: false, isUserPreview: false, queriedViewerMode: "admin", previewUserId: null, T0_JOURNAL_STALE_TIME_MS: 6000 };
    for (const patch of [{ canManage: true }, { queriedViewerMode: "member" }, { isUserPreview: true, previewUserId: ROOT }]) {
      const deps = { ...base, ...patch };
      expect(evaluate(accessQuery.arguments[1], deps).enabled).toBe(true);
      expect(evaluate(accessQuery.arguments[0], deps)).toEqual({ ledgerId: 52, previewUserId: deps.isUserPreview ? ROOT : undefined });
      expect(evaluate(accessQuery.arguments[1], { ...deps, canAccess: false }).enabled).toBe(false);
      expect(evaluate(accessQuery.arguments[1], { ...deps, isTotalProfitReportVisible: false }).enabled).toBe(false);
    }
    expect(evaluate(accessQuery.arguments[1], base).enabled).toBe(false);
    for (const data of [undefined, { enabled: false }, { enabled: true }]) {
      const enabled = evaluate(canView, { t0TeamOverviewAccessQuery: { data } });
      expect(enabled).toBe(data?.enabled === true);
      expect(evaluate(teamTab, { canViewTeamOverview: enabled })).toEqual(enabled ? [{ id: "team", label: "团队" }] : []);
      expect(evaluate(overviewQuery.arguments[1], { ...base, canViewTeamOverview: enabled, totalProfitDetailTab: "team" }).enabled).toBe(enabled);
      expect(evaluate(overviewQuery.arguments[1], { ...base, canViewTeamOverview: enabled, totalProfitDetailTab: "income" }).enabled).toBe(false);
    }
  });
});
