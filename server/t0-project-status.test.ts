import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 只执行抽取的真实生产函数与事件；测试fixture不进入产品、不连DB、不启动真实计时器。
function source(path: string, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, kind);
}
const page = source("../client/src/pages/T0Journal.tsx", ts.ScriptKind.TSX);
const journal = source("./ledger52-t0-journal.ts");
const routers = source("./routers.ts");
function required<T>(value: T | undefined, label: string): T { if (value === undefined) throw new Error(`Missing production node: ${label}`); return value; }
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root); return result;
}
function declaration(tree: ts.SourceFile, name: string) {
  return required(tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name), name) as ts.FunctionDeclaration;
}
function declarations(tree: ts.SourceFile, roots: ts.Node[]) {
  const named = new Map<string, ts.Statement>();
  for (const node of tree.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) named.set(node.name.text, node);
    if (ts.isVariableStatement(node)) for (const item of node.declarationList.declarations) if (ts.isIdentifier(item.name)) named.set(item.name.text, node);
  }
  const selected = new Set<ts.Statement>();
  const visit = (root: ts.Node) => {
    for (const id of nodes(root, ts.isIdentifier)) {
      const dependency = named.get(id.text);
      if (!dependency || selected.has(dependency)) continue;
      selected.add(dependency); visit(dependency);
    }
  };
  roots.forEach(visit);
  return [...selected].map((node) => node.getText(tree)).join("\n");
}
function isolated(text: string, result: string, dependencies: Record<string, unknown> = {}) {
  const compiled = ts.transpileModule(`${text.replace(/^export /gm, "")}\nconst __result = (${result});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return new vm.Script(`${compiled}\n;__result;`).runInContext(vm.createContext({
    ...dependencies, exports: {}, require: (name: string) => { throw new Error(`Forbidden runtime import: ${name}`); },
  }), { timeout: 2500 });
}
const clientNames = ["buildT0ProjectStatusGroups", "previewTradeFromEntry"];
const client = isolated(declarations(page, clientNames.map((name) => declaration(page, name))), `({${clientNames.join(",")}})`);
function project(id = "10", userId = "2", extra: Record<string, unknown> = {}) {
  return { id, relatedUserId: userId, name: `项目${id}`, relatedUserName: `姓名${userId}`, ...extra };
}
function trade(id = "100", extra: Record<string, unknown> = {}) {
  return { id, accountId: "1", relatedUserId: "2", relatedFundId: "10", symbol: "ETH", action: "openLong", instrumentType: "contract",
    quantity: 10, price: 2500, fee: 0, createdAt: "2026-11-14T01:00:00.000Z", recordedAt: "2026-11-14T01:00:00.000Z", ...extra };
}
function closing(id = "101", extra: Record<string, unknown> = {}) {
  return trade(id, { action: "closeLong", price: 2600, targetPrice: 2500, targetOpeningEntryId: "100",
    createdAt: "2026-11-14T02:00:00.000Z", recordedAt: "2026-11-14T02:00:00.000Z", ...extra });
}
function state(trades: unknown[], projects = [project()]) { return client.buildT0ProjectStatusGroups(projects, trades)[0].projects[0]; }

describe("项目状态：完整目录与真实逐笔匹配", () => {
  it("从未开单也显示，一位用户多个项目，不按账户拆分", () => {
    const groups = client.buildT0ProjectStatusGroups([project(), project("11"), project("12"), project("13")], []);
    expect(groups).toHaveLength(1); expect(groups[0].projects).toHaveLength(4);
    for (const row of groups[0].projects) expect([row.pendingCount, row.holdingCount]).toEqual([0, 0]);
  });
  it("同姓名不同ID保持两位用户，不按姓名合并", () => {
    expect(client.buildT0ProjectStatusGroups([project("10", "2", { relatedUserName: "同名" }), project("11", "3", { relatedUserName: "同名" })], [])).toHaveLength(2);
  });
  it.each([[true, 1, 0], [false, 0, 1]])("开仓pending=%s，挂单=%s，持仓=%s", (isPending, pending, holding) => {
    expect(state([trade("100", { isPending })])).toMatchObject({ pendingCount: pending, holdingCount: holding });
  });
  it("同项目同时有挂单和成交，独立状态不互相覆盖", () => {
    expect(state([trade(), trade("102", { isPending: true })])).toMatchObject({ pendingCount: 1, holdingCount: 1 });
  });
  it.each([1, 5, 9.99])("部分平仓%s后仍持仓，不按订单数净减", (quantity) => {
    expect(state([trade(), closing("101", { quantity })]).holdingCount).toBe(1);
  });
  it("全部平仓项目不消失，回到未开单", () => {
    expect(state([trade(), closing()])).toMatchObject({ id: "10", pendingCount: 0, holdingCount: 0 });
  });
  it("全部平仓后新挂单/新成交按当前活动状态恢复", () => {
    expect(state([trade(), closing(), trade("103", { isPending: true })])).toMatchObject({ pendingCount: 1, holdingCount: 0 });
    expect(state([trade(), closing(), trade("103")])).toMatchObject({ pendingCount: 0, holdingCount: 1 });
  });
  it("待成交平仓不消耗持仓，也不算新开仓挂单", () => {
    expect(state([trade(), closing("101", { isPending: true })])).toMatchObject({ pendingCount: 0, holdingCount: 1 });
  });
  it("删除订单/回撤平仓仅基于活动行，不读审计或待补位提醒", () => {
    expect(state([]).holdingCount).toBe(0);
    expect(state([trade()]).holdingCount).toBe(1);
  });
  it("跨账户同项目显示一项，但平仓不能跨账户误消耗", () => {
    expect(state([trade(), trade("102", { accountId: "9" }), closing()]).holdingCount).toBe(1);
    expect(state([trade(), closing("101", { accountId: "9" })]).holdingCount).toBe(1);
  });
  it("按用户ID和项目ID关联，名字变化不影响，其他项目/用户不能借用", () => {
    expect(state([trade("100", { relatedFundName: "旧名字" })], [project("10", "2", { name: "改名" })])).toMatchObject({ name: "改名", holdingCount: 1 });
    expect(state([trade("100", { relatedFundId: "11" })]).holdingCount).toBe(0);
    expect(state([trade("100", { relatedUserId: "3" })]).holdingCount).toBe(0);
  });
  it("具名平仓不误扣同价另一张主单，缺失来源不回退FIFO", () => {
    expect(state([trade(), trade("102"), closing("103", { targetOpeningEntryId: "102" })]).holdingCount).toBe(1);
    expect(state([trade(), closing("103", { targetOpeningEntryId: "999" })]).holdingCount).toBe(1);
  });
  it("历史无具名来源仍按原FIFO匹配", () => {
    expect(state([trade(), closing("101", { targetOpeningEntryId: undefined })]).holdingCount).toBe(0);
  });
  it("直接止盈按真实外键优先扣一次，兼容倒填时间与多空归档差异", () => {
    const opening = trade("100", { takeProfitPlans: [{ status: "triggered", closingEntryId: "101", quantity: 10, triggeredQuantity: 10 }] });
    const close = closing("101", { createdAt: "2026-11-13T01:00:00.000Z", recordedAt: "2026-11-13T01:00:00.000Z", targetPrice: 2400 });
    expect(state([opening, close]).holdingCount).toBe(0);
    expect(state([opening]).holdingCount).toBe(1); // 撤回止盈后仅剩计划审计，不能虚扣。
  });
  it.each(["spot", "contract", "option", "grid"])("%s订单按原开平仓匹配，不依赖行情或收益", (instrumentType) => {
    expect(state([trade("100", { instrumentType }), closing("101", { instrumentType })]).holdingCount).toBe(0);
  });
  it("反向展示标记与锁定不改变真实项目活动状态", () => {
    expect(state([trade("100", { isCounterparty: true, isLocked: true })]).holdingCount).toBe(1);
    expect(state([trade("100", { isCounterparty: true, isLocked: true }), closing()]).holdingCount).toBe(0);
  });
  it("转归属后旧单quantity为当前历史已平量，不用转移前原始量", () => {
    expect(state([trade("100", { quantity: 5, originalQuantityBeforeReassignment: 10 }), closing("101", { quantity: 5 })]).holdingCount).toBe(0);
  });
  it("无效/零数量与其他标的不造状态，输入不被改动", () => {
    const projects = Object.freeze([Object.freeze(project())]);
    const trades = Object.freeze([Object.freeze(trade("100", { quantity: 0 })), Object.freeze(trade("101", { quantity: NaN })), Object.freeze(trade("102", { symbol: "BTC" }))]);
    const before = JSON.stringify({ projects, trades });
    expect(client.buildT0ProjectStatusGroups(projects, trades)[0].projects[0].holdingCount).toBe(0);
    expect(JSON.stringify({ projects, trades })).toBe(before);
  });
  it("超过200项目、2000订单仍完整，新增项目与最新挂单不被截断", () => {
    const projects = Array.from({ length: 251 }, (_, i) => project(String(i + 10)));
    const trades = Array.from({ length: 2001 }, (_, i) => trade(String(i + 100), { relatedFundId: "260", isPending: true }));
    const group = client.buildT0ProjectStatusGroups(projects, trades)[0];
    expect(group.projects).toHaveLength(251); expect(group.projects.find((p: any) => p.id === "260").pendingCount).toBe(2001);
  });
});

class SafeError extends Error { constructor(input: { code: string; message: string }) { super(input.message); } }
const serverFunction = declaration(journal, "getLedger52T0ProjectStatusData");
function reader(connection: any) {
  return isolated(declarations(journal, [serverFunction]), "getLedger52T0ProjectStatusData", { TRPCError: SafeError, getDbTransactionConnection: vi.fn(async () => connection) });
}
function db(projects: any[] = [], entries: any[] = [], plans: any[] = []) {
  const connection = { query: vi.fn(async () => []), execute: vi.fn(async (sql: string) => {
    if (sql.includes("FROM ledger52_t0_journal_related_funds f")) return [projects];
    if (sql.includes("FROM ledger52_t0_journal_entries e")) return [entries];
    if (sql.includes("FROM ledger52_t0_journal_take_profit_plans p")) return [plans];
    throw new Error("Unexpected production SQL");
  }), commit: vi.fn(async () => undefined), rollback: vi.fn(async () => undefined), release: vi.fn() };
  return connection;
}
describe("项目状态服务端：完整只读快照", () => {
  it("成员被拒绝，尚未取得DB连接", async () => {
    const conn = db(); await expect(reader(conn)({ mode: "member", relatedUserId: 2 })).rejects.toThrow("仅管理员");
    expect(conn.query).not.toHaveBeenCalled(); expect(conn.execute).not.toHaveBeenCalled();
  });
  it("数据库不可用明确失败，不误返回空项目", async () => { await expect(reader(null)({ mode: "admin", journalOwnerUserId: 28 })).rejects.toThrow("数据库连接失败"); });
  it("备用普通连接没有release时仍能完成只读查询，不关闭共享连接", async () => {
    const { release: _release, ...conn } = db();
    const result = await reader(conn)({ mode: "admin", journalOwnerUserId: 28 });
    expect(result.projects).toEqual([]);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(serverFunction.getText(journal)).not.toContain("conn.end(");
  });
  it("备用普通连接查询失败仍回滚，不被不存在的release覆盖原错误", async () => {
    const { release: _release, ...conn } = db();
    conn.execute.mockRejectedValueOnce(new Error("read-only query failed"));
    await expect(reader(conn)({ mode: "admin", journalOwnerUserId: 28 })).rejects.toThrow("read-only query failed");
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
  });
  it("完整目录与活动订单同一只读快照，所有SELECT均按ledger及解析owner隔离", async () => {
    const conn = db([{ id: 10, related_user_id: 2, name: "专项", related_user_name: "姓名", related_username: "user2" }], [
      { id: 100, account_id: 1, related_user_id: 2, related_fund_id: 10, symbol: "ETH", action: "openLong", execution_status: "pending", price: 2500, quantity: 10, trade_time: "2026-11-14T01:00:00Z", created_at: "2026-11-14T01:00:00Z" },
    ]);
    const result = await reader(conn)({ mode: "admin", journalOwnerUserId: 28 });
    expect(result.projects).toEqual([{ id: "10", relatedUserId: "2", name: "专项", relatedUserName: "姓名", relatedUsername: "user2" }]);
    expect(client.previewTradeFromEntry(result.entries[0])).toMatchObject({ id: "100", relatedUserId: "2", relatedFundId: "10", isPending: true });
    expect(conn.query).toHaveBeenCalledWith("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    for (const [sql, params] of conn.execute.mock.calls) {
      expect(sql).not.toMatch(/\b(LIMIT|INSERT|UPDATE|DELETE|ALTER|CREATE|FOR UPDATE)\b/i);
      expect(sql).toContain("ledger_id = ?"); expect(sql).toContain("user_id = ?"); expect(params).toEqual([52, 28]);
    }
    expect(conn.commit).toHaveBeenCalledTimes(1); expect(conn.release).toHaveBeenCalledTimes(1); expect(conn.rollback).not.toHaveBeenCalled();
  });
  it("自动止盈关闭外键正确从DB映射到原前端匹配器", async () => {
    const rows = [
      { id: 100, account_id: 1, related_user_id: 2, related_fund_id: 10, symbol: "ETH", action: "openLong", price: 2500, quantity: 10, created_at: "2026-11-14T01:00:00Z" },
      { id: 101, account_id: 1, related_user_id: 2, related_fund_id: 10, symbol: "ETH", action: "closeLong", price: 2400, quantity: 10, created_at: "2026-11-13T01:00:00Z" },
    ];
    const conn = db([{ id: 10, related_user_id: 2, name: "专项", related_user_name: "姓名" }], rows, [{ id: 1, opening_entry_id: 100, status: "triggered", quantity: 10, triggered_quantity: 10, closing_entry_id: 101 }]);
    const data = await reader(conn)({ mode: "admin", journalOwnerUserId: 28 });
    expect(client.buildT0ProjectStatusGroups(data.projects, data.entries.map(client.previewTradeFromEntry))[0].projects[0].holdingCount).toBe(0);
  });
  it("查询失败回滚并释放，不返回部分清单", async () => {
    const conn = db(); conn.execute.mockRejectedValueOnce(new Error("DB read failed"));
    await expect(reader(conn)({ mode: "admin", journalOwnerUserId: 28 })).rejects.toThrow("DB read failed");
    expect(conn.rollback).toHaveBeenCalledTimes(1); expect(conn.release).toHaveBeenCalledTimes(1); expect(conn.commit).not.toHaveBeenCalled();
  });
  it("项目来自active目录且排除显式删除用户，但读取订单不按账户/主表筛选删行", () => {
    const text = serverFunction.getText(journal);
    expect(text).toContain("f.is_active = 1"); expect(text).toContain("d.dimension = 'related_user'");
    expect(text).not.toContain("account.is_active"); expect(text).not.toContain("ensureLedger52T0JournalTables");
    expect(text).not.toMatch(/getCrypto|ProfitShare|Payout|shared_income_allocations|LIMIT 200/);
  });
});

function variable(name: string) {
  return required(nodes(page, ts.isVariableDeclaration).find((node) => ts.isIdentifier(node.name) && node.name.text === name), name);
}
const query = required(variable("projectStatusQuery").initializer, "project query") as ts.CallExpression;
const queryOptions = isolated("", query.arguments[1].getText(page), { canManage: true, isMemberView: false, showProjectStatus: true });
const jsx = nodes(page, ts.isJsxElement);
function attribute(node: ts.JsxElement, name: string) {
  return node.openingElement.attributes.properties.find((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(page) === name);
}
function textAttribute(node: ts.JsxElement, name: string) { const attr = attribute(node, name)?.initializer; return attr && ts.isStringLiteral(attr) ? attr.text : undefined; }
function gate(node: ts.JsxElement) {
  let parent: ts.Node | undefined = node.parent;
  while (parent && !ts.isJsxExpression(parent)) parent = parent.parent;
  const exp = required((parent as ts.JsxExpression | undefined)?.expression, "UI gate");
  if (!ts.isBinaryExpression(exp)) throw new Error("Expected real UI && gate");
  return exp.left.getText(page);
}
const toggle = required(jsx.find((node) => textAttribute(node, "aria-controls") === "t0-project-status"), "project toggle");
const panel = required(jsx.find((node) => textAttribute(node, "id") === "t0-project-status"), "project panel");
describe("项目状态管理员前端接线", () => {
  it("按钮在盈亏显示后；按钮/面板均拒绝成员与代入展示", () => {
    const pnlToggle = required(jsx.find((node) => textAttribute(node, "aria-controls") === "t0-ladder-pnl-settings"), "PnL toggle");
    expect(toggle.pos).toBeGreaterThan(pnlToggle.pos);
    for (const canManage of [false, true]) for (const isMemberView of [false, true]) for (const showProjectStatus of [false, true]) {
      const deps = { canManage, isMemberView, showProjectStatus };
      expect(isolated("", gate(toggle), deps)).toBe(canManage && !isMemberView);
      expect(isolated("", gate(panel), deps)).toBe(canManage && !isMemberView && showProjectStatus);
      const opts = isolated("", query.arguments[1].getText(page), deps);
      expect(opts.enabled).toBe(canManage && !isMemberView && showProjectStatus);
      expect(opts.refetchInterval).toBe(opts.enabled ? 15000 : false);
    }
  });
  it("真实点击开关只改变面板，不触发订单/资金写入", () => {
    const attr = required(attribute(toggle, "onClick")?.initializer, "click") as ts.JsxExpression;
    let value = false;
    const setter = vi.fn((updater) => { value = updater(value); });
    const click = isolated("", required(attr.expression, "click expression").getText(page), { setShowProjectStatus: setter });
    click(); expect(value).toBe(true); click(); expect(value).toBe(false); expect(setter).toHaveBeenCalledTimes(2);
    expect(toggle.getText(page)).not.toMatch(/mutate|CreateEntry|UpdateEntry|payout/i);
  });
  it("姓名与全部项目使用独立完整query，跟账户/用户/类型/状态筛选无关", () => {
    expect(query.expression.getText(page)).toBe("trpc.ledger.t0GetProjectStatusData.useQuery");
    const input = query.arguments[0].getText(page);
    expect(input).toContain("viewerScopeUserId"); expect(input).not.toMatch(/selectedAccount|relatedUserFilter|relatedFundFilter|instrumentTypeFilter|executionFilter/);
    const groups = required(variable("projectStatusGroups").initializer, "status groups").getText(page);
    expect(groups).toContain("projectStatusQuery.data.projects"); expect(groups).toContain("projectStatusQuery.data.entries.map(previewTradeFromEntry)");
    expect(groups).not.toMatch(/rawJournalTrades|recentRelatedUsers|filteredTrades|entryScopedTrades|projectAdminCounterpartyTrades/);
    expect(queryOptions.staleTime).toBe(0); expect(queryOptions.refetchIntervalInBackground).toBe(false);
  });
  it("查询失败/初始读取不误标未开单，缓存结果失败时明确标明上次结果", () => {
    expect(panel.getText(page)).toContain("未读取完成，不判断是否开单");
    expect(panel.getText(page)).toContain("下方为上次读取结果");
    expect(panel.getText(page)).toContain("正在读取完整项目状态");
    expect(panel.getText(page)).toContain("projectStatusQuery.data &&");
    expect(panel.getText(page)).toContain("已成交持仓中"); expect(panel.getText(page)).toContain("挂单中"); expect(panel.getText(page)).toContain("未开单");
    const main = readFileSync(new URL("../client/src/main.tsx", import.meta.url), "utf8");
    expect(main).toContain('op.path === "ledger.t0GetProjectStatusData"');
  });
});

const route = required(nodes(routers, ts.isPropertyAssignment).find((node) => node.name.getText(routers) === "t0GetProjectStatusData"), "status route");
const callback = required(nodes(route, ts.isArrowFunction).find((node) => node.getText(routers).includes("const scope =")), "query callback");
function routeHandler(fixture: any) {
  return isolated("", callback.getText(routers).replace("await import('./ledger52-t0-journal')", "journalFixture"), { journalFixture: fixture, TRPCError: SafeError });
}
describe("项目状态服务端路由权限", () => {
  it("代入视角和伪身份请求在任何目录读取前拒绝", async () => {
    const fixture = { resolveLedger52T0JournalReadScope: vi.fn(), getLedger52T0ProjectStatusData: vi.fn() };
    await expect(routeHandler(fixture)({ ctx: { isViewingAs: true, user: { id: 2 } }, input: {} })).rejects.toThrow("代入成员");
    await expect(routeHandler(fixture)({ ctx: { user: { id: 28 } }, input: { viewerScopeUserId: 2 } })).rejects.toThrow("会话不一致");
    expect(fixture.resolveLedger52T0JournalReadScope).not.toHaveBeenCalled(); expect(fixture.getLedger52T0ProjectStatusData).not.toHaveBeenCalled();
  });
  it("成员scope不能读，管理员使用已解析所有者而非硬编码当前人", async () => {
    const fixture = { resolveLedger52T0JournalReadScope: vi.fn(async () => ({ mode: "member", relatedUserId: 2 })), getLedger52T0ProjectStatusData: vi.fn(async () => ({ projects: [] })) };
    const handler = routeHandler(fixture);
    await expect(handler({ ctx: { user: { id: 2 } }, input: {} })).rejects.toThrow("仅管理员");
    expect(fixture.getLedger52T0ProjectStatusData).not.toHaveBeenCalled();
    fixture.resolveLedger52T0JournalReadScope.mockResolvedValue({ mode: "admin", journalOwnerUserId: 28 } as any);
    await handler({ ctx: { user: { id: 1, role: "super_admin" } }, input: { viewerScopeUserId: 1 } });
    expect(fixture.getLedger52T0ProjectStatusData).toHaveBeenCalledWith({ mode: "admin", journalOwnerUserId: 28 });
    expect(route.getText(routers)).toContain("z.literal(52)"); expect(route.getText(routers)).toContain(".strict()");
    expect(route.getText(routers)).not.toContain("previewUserId");
  });
});

const refreshEffect = required(nodes(page, ts.isCallExpression).find((node) => node.expression.getText(page) === "useEffect" && node.arguments[0]?.getText(page).includes("getMutationCache().subscribe")), "status mutation success effect");
function observeWrites(canManage = true, isMemberView = false, showProjectStatus = true) {
  let listener: ((event: any) => void) | undefined;
  const cleanup = vi.fn();
  const subscribe = vi.fn((callback) => { listener = callback; return cleanup; });
  const refetch = vi.fn();
  const callback = isolated("", refreshEffect.arguments[0].getText(page), { canManage, isMemberView, showProjectStatus,
    projectStatusQueryClient: { getMutationCache: () => ({ subscribe }) }, projectStatusQuery: { refetch } });
  return { cleanup, subscribe, refetch, stop: callback(), send: (event: any) => listener?.(event) };
}
describe("项目状态保存后即时刷新", () => {
  it.each(["t0CreateEntry", "t0UpdateOpeningEntry", "t0ReassignOpeningRemaining", "t0UpdatePartialOpeningHistoricalAttribution", "t0DeleteOpeningEntry", "t0RevertEntry", "t0RestoreEntry", "t0RenameRelatedFund", "t0DeleteDirectoryItem", "t0SetProfitShareRule"])("%s服务端确认成功后立即重读", (operation) => {
    const observer = observeWrites();
    observer.send({ type: "updated", action: { type: "success" }, mutation: { options: { mutationKey: [["ledger", operation]] } } });
    expect(observer.refetch).toHaveBeenCalledTimes(1); expect(observer.stop).toBe(observer.cleanup);
    observer.stop(); expect(observer.cleanup).toHaveBeenCalledTimes(1);
  });
  it("保存失败/尚在保存/无关操作不触发，面板关闭或成员身份不注册监听", () => {
    for (const args of [[false, false, true], [true, true, true], [true, false, false]]) {
      const obs = observeWrites(...args as [boolean, boolean, boolean]); expect(obs.subscribe).not.toHaveBeenCalled(); expect(obs.stop).toBeUndefined();
    }
    const observer = observeWrites();
    for (const type of ["error", "pending", "failed"]) observer.send({ type: "updated", action: { type }, mutation: { options: { mutationKey: [["ledger", "t0CreateEntry"]] } } });
    for (const key of [undefined, [["other", "t0CreateEntry"]], [["ledger", "t0SetAllocationRules"]], [["ledger", "t0CreatePayoutLog"]]]) observer.send({ type: "updated", action: { type: "success" }, mutation: { options: { mutationKey: key } } });
    observer.send({ type: "removed" }); expect(observer.refetch).not.toHaveBeenCalled();
    expect(refreshEffect.arguments[1].getText(page)).toContain("canManage, isMemberView, showProjectStatus");
  });
  it("止盈计划事实也严格校验owner，不跨所有者纳入关闭数量", () => {
    expect(serverFunction.getText(journal)).toContain("e.user_id = p.user_id");
  });
});
