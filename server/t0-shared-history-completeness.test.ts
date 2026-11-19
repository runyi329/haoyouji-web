import { readFileSync } from "node:fs";
import vm from "node:vm";
import { TRPCError } from "@trpc/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 仅只读源码 AST；绝不 runtime import journal/db/routers，也不启动任务或真实计时器。
// 生产 getLedger52T0Journal 的连接、ensure、行情读取全部以显式内存桩替换。
function source(path: string, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, kind);
}
const journal = source("./ledger52-t0-journal.ts");
const page = source("../client/src/pages/T0Journal.tsx", ts.ScriptKind.TSX);
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${name}`);
  return value;
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return found;
}
function variable(root: ts.Node, name: string) {
  const component = root === page ? required(fn(page, "T0JournalView").body, "T0JournalView body") : root;
  const declarations = ts.isBlock(component)
    ? component.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
    : nodes(component, ts.isVariableDeclaration);
  const matches = declarations.filter(node => ts.isIdentifier(node.name) && node.name.text === name);
  if (matches.length !== 1) throw new Error(`Expected one production variable ${name}, got ${matches.length}`);
  return matches[0];
}
function initializer(root: ts.Node, name: string) { return required(variable(root, name).initializer, name); }
function fn(root: ts.SourceFile, name: string) {
  return required(root.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name), name);
}
function isolated(text: string, deps: Record<string, any>, result: string): any {
  const output = ts.transpileModule(`${text.replace(/^export /gm, "")}\nconst __result = (${result});`, {
    fileName: "isolated.tsx", compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const forbidden = (name: string) => () => { throw new Error(`Forbidden isolated operation: ${name}`); };
  return new vm.Script(`${output}\n;__result;`).runInContext(vm.createContext({
    Date, Intl, Map, Set, ...deps, exports: {}, require: forbidden("require"), fetch: forbidden("fetch"),
    setTimeout: forbidden("setTimeout"), setInterval: forbidden("setInterval"), process: { env: {} },
  }), { timeout: 2000 });
}
// 递归收集顶层纯声明，未纳入任何 import；用于真实 DTO、投影和 FIFO 算法。
function pure(root: ts.SourceFile, names: string[]) {
  const named = new Map<string, ts.Statement>();
  for (const statement of root.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) named.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) for (const item of statement.declarationList.declarations) {
      if (ts.isIdentifier(item.name)) named.set(item.name.text, statement);
    }
  }
  const selected = new Set<ts.Statement>();
  const visit = (node: ts.Node) => {
    for (const id of nodes(node, ts.isIdentifier)) {
      const statement = named.get(id.text);
      if (!statement || selected.has(statement)) continue;
      selected.add(statement); visit(statement);
    }
  };
  names.forEach(name => visit(required(named.get(name), name)));
  return isolated([...selected].map(node => node.getText(root)).join("\n"), {}, `({ ${names.join(",")} })`);
}
function expression(node: ts.Node, deps: Record<string, any> = {}) {
  return isolated(`const value = (${node.getText(node.getSourceFile())});`, deps, "value");
}
function initial(name: string, deps: Record<string, any>) { return expression(initializer(page, name), deps); }
function memo(name: string, deps: Record<string, any>) {
  const call = initializer(page, name);
  if (!ts.isCallExpression(call) || call.expression.getText() !== "useMemo") throw new Error(`Expected production useMemo: ${name}`);
  return expression(call.arguments[0], { ...client, ...deps })();
}
const serverPure = pure(journal, ["asRows", "toNumber", "isoTime", "mapAccount", "mapEntry", "mapRelatedUser", "mapRelatedFund", "mapProfitShareSnapshot", "mapProfitShareRule"]);
const client = pure(page, ["ACTIONS", "previewTradeFromEntry", "getStoredEntryId", "getDetailEntryId", "attachSharedIncomePerspectiveTrades", "getT0WeeklySettlementWeekStart", "getBeijingDateInputValue", "projectMemberProfitShareTrades", "projectAdminCounterpartyTrades", "buildPositionBuckets", "buildRecentJournalTradeDetails", "buildOpeningClosingAllocations"]);
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function row(id: number, overrides: Record<string, any> = {}) {
  return { id, ledger_id: 52, user_id: 28, account_id: 1, account_name: "真实账户", account_hidden: 0,
    related_user_id: 101, related_user_name: "来源用户", related_username: "source", related_user_avatar: "avatar",
    related_fund_id: 7, related_fund_name: "真实项目", related_fund_hidden: 0, related_user_hidden: 0,
    symbol: "ETH", instrument_type: "contract", action: "closeLong", execution_status: "filled",
    quantity: "2.75", price: "3021.12345678", fee_usdt: "2.9912345678", target_price: "2900.125",
    target_opening_entry_id: 1, note: "原始来源备注", trade_time: new Date("2026-11-08T15:59:59.000Z"),
    created_at: new Date("2026-11-20T03:00:00.000Z"), filled_at: new Date("2026-11-08T16:00:00.000Z"),
    filled_price: "3021.12345678", ...overrides };
}
function transfer(id: number, closing = row(9001), overrides: Record<string, any> = {}) {
  return { id, ledger_id: 52, user_id: 28, closing_entry_id: closing.id, source_user_id: 101,
    recipient_user_id: 303, source_user_name: "来源用户", recipient_user_name: "收款人", recipient_username: "recipient",
    amount: "12.345678", source_net_pnl: "123.456789", manager_pool_amount: "120.123456", reduces_regular_distribution: 1,
    created_at: new Date("2026-12-01T00:00:00.000Z"),
    ...Object.fromEntries(Object.entries(closing).map(([key, value]) => [`history_source_${key}`, value])), ...overrides };
}
function readHarness(entries: any[] = [], transfers: any[] = []) {
  const execute = vi.fn(async (sql: string, params: any[]) => {
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error("SQL writes/DDL forbidden");
    if (sql.includes("SELECT transfer.id, transfer.closing_entry_id")) return [transfers];
    if (sql.includes("SELECT e.id, e.account_id")) return [entries];
    // 目录、审计、资金与分佣仅返回空内存行；真实数据库连接从未导入。
    return [[]];
  });
  const ensure = vi.fn(async (_connection: any) => {});
  const connection = { execute };
  const optionPrices = vi.fn(async (_connection: any, _rows: any[]) => new Map());
  const takeProfitPlans = vi.fn(async (_connection: any, _ids: any[]) => new Map());
  const rejectUnexpectedRow = () => { throw new Error("Unexpected nonempty audit fixture"); };
  const run = isolated(fn(journal, "getLedger52T0Journal").getText(journal), {
    ...serverPure, TRPCError, LEDGER_52_T0_JOURNAL_ID: 52, getDbConnection: vi.fn(async () => connection),
    ensureLedger52T0JournalTables: ensure, getT0CachedOptionMarkPrices: optionPrices, getTakeProfitPlansByEntryId: takeProfitPlans,
    mapRecoverableAudit: rejectUnexpectedRow, mapT0JournalSystemActivity: rejectUnexpectedRow,
  }, "getLedger52T0Journal");
  return { run, execute, ensure, connection, optionPrices, takeProfitPlans };
}
function sqlCall(h: ReturnType<typeof readHarness>, marker: string) {
  return required(h.execute.mock.calls.find(([sql]) => sql.includes(marker)), marker);
}
function assertValidSourceJoin(sql: string) {
  expect(sql).toMatch(/INNER JOIN ledger52_t0_journal_entries source_closing/);
  for (const condition of ["source_closing.id = transfer.closing_entry_id", "source_closing.ledger_id = transfer.ledger_id", "source_closing.user_id = transfer.user_id", "source_closing.action IN ('closeLong', 'closeShort')", "source_closing.execution_status = 'filled'"]) expect(sql).toContain(condition);
}
function normalize(data: any, rawJournalTrades: any[] = []) {
  const activeSharedIncomeClosingEntryIds = memo("activeSharedIncomeClosingEntryIds", { activeJournalData: data, rawJournalTrades });
  const sharedIncomeSourceClosings = memo("sharedIncomeSourceClosings", { activeJournalData: data, activeSharedIncomeClosingEntryIds });
  const sharedIncomeTransfers = memo("sharedIncomeTransfers", { activeJournalData: data, activeSharedIncomeClosingEntryIds });
  return { activeSharedIncomeClosingEntryIds, sharedIncomeSourceClosings, sharedIncomeTransfers, rawJournalTrades };
}
async function sample() {
  const a = row(9001, { target_price: "2900" });
  const b = row(9002, { action: "closeShort", price: "2789.98765432", quantity: "4.25", filled_at: null });
  const h = readHarness([row(1, { action: "openLong", quantity: "10", price: "2900", fee_usdt: "0", trade_time: "2026-11-01T00:00:00Z", filled_at: null })], [transfer(501, a), transfer(502, b, { amount: "20.123456" })]);
  return { h, data: await h.run({ mode: "member", relatedUserId: 303 }) };
}

describe("共享全历史SQL、权限与真实来源DTO（生产getJournal AST；无数据库）", () => {
  it("共享读取没有全局2000/entries IN窗口，普通entries保留LIMIT 2000；ensure只能调用内存桩", async () => {
    const h = readHarness([row(1)], [transfer(501)]);
    await h.run({ mode: "admin", journalOwnerUserId: 870413 });
    const [sharedSql, sharedParams] = sqlCall(h, "SELECT transfer.id");
    expect(sharedSql).not.toMatch(/\bLIMIT\b|closing_entry_id\s+IN\s*\(/i);
    expect(sharedSql).toContain("WHERE transfer.ledger_id = ? AND transfer.user_id = ?");
    expect(sharedParams).toEqual([52, 870413]);
    expect(sqlCall(h, "SELECT e.id, e.account_id")[0]).toMatch(/ORDER BY e.trade_time ASC, e.id ASC\s+LIMIT 2000/);
    expect(sqlCall(h, "SELECT e.id, e.account_id")[1]).toEqual([52, 870413]);
    expect(h.ensure).toHaveBeenCalledOnce();
    expect(h.ensure).toHaveBeenCalledWith(h.connection);
    expect(h.execute.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true);
  });

  it("fullRead只解除普通entries窗口；共享路径始终全量，显式skipEnsure不会初始化", async () => {
    const h = readHarness();
    await h.run({ mode: "admin", journalOwnerUserId: 28 }, { fullRead: true, skipTableEnsure: true });
    expect(sqlCall(h, "SELECT e.id, e.account_id")[0]).not.toMatch(/\bLIMIT\b/i);
    expect(sqlCall(h, "SELECT transfer.id")[0]).not.toMatch(/\bLIMIT\b/i);
    expect(h.ensure).not.toHaveBeenCalled();
  });

  it.each([{ mode: "admin", journalOwnerUserId: 81 }, { mode: "member", relatedUserId: 303 }])("$mode scope：共享与贡献核验真实source ID/ledger/user且只能filled平仓", async scope => {
    const h = readHarness();
    await h.run(scope);
    const [sharedSql, params] = sqlCall(h, "SELECT transfer.id");
    assertValidSourceJoin(sharedSql);
    const where = sharedSql.slice(sharedSql.indexOf("WHERE transfer.ledger_id"));
    if (scope.mode === "admin") {
      expect(params).toEqual([52, 81]);
      expect(where).toContain("transfer.user_id = ?");
      const [contributionSql, contributionParams] = sqlCall(h, "COUNT(DISTINCT closing_entry_id)");
      assertValidSourceJoin(contributionSql);
      expect(contributionParams).toEqual([52, 81]);
    } else {
      expect(params).toEqual([52, 303]);
      expect(where).toContain("transfer.recipient_user_id = ?");
      expect(where).not.toContain("transfer.user_id = ?");
      const [entrySql, entryParams] = sqlCall(h, "SELECT e.id, e.account_id");
      expect(entryParams).toEqual([52, 303, 303, 303]);
      expect(entrySql).toContain("shared_entry.beneficiary_user_id = ?");
      expect(entrySql).toContain("shared_income.recipient_user_id = ?");
      for (const condition of ["shared_income.ledger_id = e.ledger_id", "shared_income.user_id = e.user_id", "shared_income.closing_entry_id = e.id"]) expect(entrySql).toContain(condition);
      expect(entrySql).not.toMatch(/invited_by|referral|descendant/i);
      expect(h.execute.mock.calls.some(([sql]) => sql.includes("COUNT(DISTINCT closing_entry_id)") || sql.includes("FROM ledger52_t0_journal_shared_income_eligibilities"))).toBe(false);
    }
  });

  it("超过2000个有效历史来源全部下发，重复转账来源去重，源DTO不并入entries/行情/FIFO输入", async () => {
    const sources = Array.from({ length: 2005 }, (_, index) => row(10000 + index, { action: index % 2 ? "closeShort" : "closeLong" }));
    const transfers = [...sources.map((closing, index) => transfer(index + 1, closing)), transfer(9000, sources[0])];
    const h = readHarness([row(1, { action: "openLong" })], transfers);
    const data = await h.run({ mode: "member", relatedUserId: 303 });
    expect(data.sharedIncomeTransfers).toHaveLength(2006);
    expect(data.sharedIncomeSourceClosingEntryIds).toHaveLength(2005);
    expect(new Set(data.sharedIncomeSourceClosingEntryIds).size).toBe(2005);
    expect(data.sharedIncomeSourceClosingEntryIds).toEqual(sources.map(item => String(item.id)));
    expect(data.sharedIncomeSourceClosings).toHaveLength(2005);
    expect(data.sharedIncomeSourceClosings[0]).toEqual(serverPure.mapEntry(sources[0]));
    expect(data.sharedIncomeSourceClosings[2004].id).toBe("12004");
    expect(data.entries.map((entry: any) => entry.id)).toEqual(["1"]);
    expect(h.optionPrices).toHaveBeenCalledWith(h.connection, [expect.objectContaining({ id: 1 })]);
    expect(h.takeProfitPlans).toHaveBeenCalledWith(h.connection, [1]);
  });

  it("来源DTO复用普通mapEntry的真实价量日期精度与账户/项目/删人隐藏规则", async () => {
    const hidden = row(9001, { account_name: null, account_hidden: 1, related_fund_name: null, related_fund_hidden: 1,
      related_user_name: null, related_username: null, related_user_avatar: null, related_user_hidden: 1 });
    const h = readHarness([hidden], [transfer(501, hidden), transfer(502, hidden)]);
    const data = await h.run({ mode: "admin", journalOwnerUserId: 28 });
    const dto = data.sharedIncomeSourceClosings[0];
    expect(data.sharedIncomeSourceClosingEntryIds).toEqual(["9001"]);
    expect(dto).toMatchObject({ id: "9001", price: 3021.12345678, quantity: 2.75, fee: 2.9912345678,
      accountHidden: true, accountName: "", relatedFundHidden: true, relatedUserHidden: true,
      createdAt: "2026-11-08T15:59:59.000Z", recordedAt: "2026-11-20T03:00:00.000Z", filledAt: "2026-11-08T16:00:00.000Z" });
    expect(dto.relatedFundName).toBeUndefined();
    expect(dto.relatedUserName).toBeUndefined();
    expect(dto.relatedUsername).toBeUndefined();
    expect(dto.relatedUserAvatar).toBeUndefined();
    expect(dto).toEqual({ ...data.entries[0], takeProfitEnabled: false });
    const [sql] = sqlCall(h, "SELECT transfer.id");
    for (const dimension of ["history_account", "history_fund"]) {
      expect(sql).toContain(`CASE WHEN ${dimension}.is_active = 1 THEN ${dimension}.name ELSE NULL END`);
      expect(sql).toContain(`CASE WHEN ${dimension}.is_active = 1 THEN 0 ELSE 1 END`);
    }
    expect(sql).toContain("history_deleted_user.ledger_id = source_closing.ledger_id AND history_deleted_user.user_id = source_closing.user_id");
    expect(sql).toContain("history_deleted_user.dimension = 'related_user' AND history_deleted_user.dimension_id = source_closing.related_user_id");
    for (const field of ["related_user_name", "related_username", "related_user_avatar"]) expect(sql).toMatch(new RegExp(`CASE WHEN history_deleted_user\\.id IS NULL THEN[^\\n]+ELSE NULL END AS history_source_${field}`));
    expect(Object.keys(dto).some(key => key.startsWith("history_source_") || ["ledger_id", "user_id", "recipient_user_id"].includes(key))).toBe(false);
  });
});

describe("权威来源metadata、窗口外共享累计/详情/周归属（真实useMemo和纯函数）", () => {
  it("权威[]绝不fallback raw，undefined兼容旧已成交平仓；非数组权威也不制造来源", () => {
    const raw = [row(9001), row(9002, { action: "openLong" }), row(9003, { execution_status: "pending" }), row(9004, { action: "closeShort" })].map(serverPure.mapEntry).map(client.previewTradeFromEntry);
    const transfers = [9001, 9002, 9003, 9004].map(id => ({ id: String(id), closingEntryId: String(id), amount: 10, recipientUserId: 303 }));
    const authority = normalize({ sharedIncomeSourceClosingEntryIds: [], sharedIncomeTransfers: transfers }, freeze(raw));
    expect(authority.activeSharedIncomeClosingEntryIds.size).toBe(0);
    expect(authority.sharedIncomeTransfers).toEqual([]);
    const legacy = normalize({ sharedIncomeTransfers: transfers }, raw);
    expect([...legacy.activeSharedIncomeClosingEntryIds]).toEqual(["9001", "9004"]);
    expect(legacy.sharedIncomeTransfers.map((item: any) => item.closingEntryId)).toEqual(["9001", "9004"]);
    expect(normalize({ sharedIncomeSourceClosingEntryIds: null, sharedIncomeTransfers: transfers }, raw).sharedIncomeTransfers).toEqual([]);
  });

  it("ID按字符串归一；源DTO必须在权威集合中且为filled平仓，金额非法/非正的转账不进入有效收入", () => {
    const closings = [row(9001), row(9002, { action: "openLong" }), row(9003, { execution_status: "pending" }), row(9004, { action: "closeShort" }), row(9005)].map(serverPure.mapEntry);
    const base = { closingEntryId: 9001, sourceUserId: 101, recipientUserId: 303 };
    const result = normalize({ sharedIncomeSourceClosingEntryIds: [9001, "9002", "9003", 9004], sharedIncomeSourceClosings: closings,
      sharedIncomeTransfers: [{ ...base, id: 1, amount: "1.234567" }, { ...base, id: "zero", amount: 0 }, { ...base, id: "negative", amount: -2 }, { ...base, id: "nan", amount: "bad" }, { ...base, id: "inf", amount: Infinity }, { ...base, id: "not-authorized", closingEntryId: 9005, amount: 5 }] });
    expect(result.sharedIncomeSourceClosings.map((item: any) => item.id)).toEqual(["9001", "9004"]);
    expect(result.sharedIncomeTransfers).toHaveLength(1);
    expect(result.sharedIncomeTransfers[0]).toMatchObject({ id: "1", closingEntryId: "9001", amount: 1.234567 });
  });

  it("窗口外共享与普通订单/分佣累计同源，到账/归因明细保留真实价格数量和成交日而非transfer落库日", async () => {
    const { data } = await sample();
    const normalized = normalize(data, data.entries.map(client.previewTradeFromEntry));
    const totalNetProfitDetails = freeze([
      { trade: client.previewTradeFromEntry(serverPure.mapEntry(row(3, { related_user_id: 303 }))), quantity: 2.75, netPnl: -3.123456 },
      { trade: client.previewTradeFromEntry(serverPure.mapEntry(row(4))), quantity: 2.75, netPnl: 7.234567 },
    ]);
    const deps: any = { ...normalized, payoutTargetRelatedUserId: 303, totalNetProfitDetails };
    deps.payoutSharedIncomeTransfers = memo("payoutSharedIncomeTransfers", deps);
    deps.payoutSharedIncomeTotal = initial("payoutSharedIncomeTotal", deps);
    deps.totalNetProfit = initial("totalNetProfit", deps);
    deps.totalIncome = initial("totalIncome", deps);
    const expected = totalNetProfitDetails.reduce((sum, item) => sum + item.netPnl, 0) + data.sharedIncomeTransfers.reduce((sum: number, item: any) => sum + item.amount, 0);
    expect(initial("payoutBookTotalIncome", deps)).toBe(expected);
    const attribution = memo("totalProfitAttribution", { ...deps, payoutTargetUserIdentity: { name: "收款人" } });
    expect(attribution).toMatchObject({ ownTradingNetProfit: -3.123456, commissionShareNetProfit: 7.234567, sharedIncomeCount: 2, total: expected });
    expect(attribution.sharedIncomeNetProfit).toBe(deps.payoutSharedIncomeTotal);
    for (const name of ["payoutIncomeEntries", "totalProfitAttributionDetailEntries"]) {
      const result = memo(name, deps);
      const shared = result.filter((item: any) => item.kind === "shared");
      expect(shared).toHaveLength(2);
      const detail = shared.find((item: any) => item.transfer.id === "501");
      expect(detail.createdAt).toBe("2026-11-08T15:59:59.000Z");
      expect(detail.createdAt).not.toBe(detail.transfer.createdAt);
      expect(detail.sourceTrade).toMatchObject({ price: 3021.12345678, quantity: 2.75, filledAt: "2026-11-08T16:00:00.000Z", note: "原始来源备注" });
    }
    expect(memo("payoutSharedIncomeTransfers", { ...deps, payoutTargetRelatedUserId: undefined })).toEqual([]);
    expect(memo("payoutSharedIncomeTransfers", { ...deps, payoutTargetRelatedUserId: 999 })).toEqual([]);
  });

  it("共享归周/归日按真实来源filledAt优先、缺失按trade date；不按到账时间，周合计回加完整共享", async () => {
    const { data } = await sample();
    const normalized = normalize(data, data.entries.map(client.previewTradeFromEntry));
    const payoutSharedIncomeTransfers = memo("payoutSharedIncomeTransfers", { ...normalized, payoutTargetRelatedUserId: 303 });
    const result = memo("memberSettlementIncomeByWeek", { ...normalized, payoutSharedIncomeTransfers, payoutTargetRelatedUserId: 303, totalNetProfitDetails: [] });
    expect(result.incomeByWeek.get("2026-11-09")).toMatchObject({ shared: 12.345678, total: 12.345678, sharedCount: 1, orderCount: 0, commissionCount: 0 });
    expect(result.incomeByWeek.get("2026-11-02")).toMatchObject({ shared: 20.123456, total: 20.123456, sharedCount: 1 });
    expect([...result.incomeByDay.keys()].sort()).toEqual(["2026-11-08", "2026-11-09"]);
    expect(result.incomeByWeek.has("2026-11-30")).toBe(false);
    expect([...result.incomeByWeek.values()].reduce((sum: number, income: any) => sum + income.total, 0)).toBe(payoutSharedIncomeTransfers.reduce((sum: number, item: any) => sum + item.amount, 0));
    expect(memo("memberSettlementIncomeByWeek", { ...normalized, payoutSharedIncomeTransfers, payoutTargetRelatedUserId: 0, totalNetProfitDetails: [] })).toBeNull();
  });

  it("共享历史投影合并同来源到一张真实平仓卡；不制造零价量单，不误合并其他收款人或其他来源", async () => {
    const { data } = await sample();
    const normalized = normalize(data);
    const transfers = freeze([...normalized.sharedIncomeTransfers, { ...normalized.sharedIncomeTransfers[0], id: "extra", amount: 2 }, { ...normalized.sharedIncomeTransfers[1], id: "other-recipient", recipientUserId: 999, amount: 500 }]);
    const source = normalized.sharedIncomeSourceClosings[0];
    const base = freeze([{ ...source, id: "beneficiary-9001", sourceEntryId: "9001", quantity: 1.25 }]);
    const before = JSON.stringify({ base, transfers, sources: normalized.sharedIncomeSourceClosings });
    const result = client.attachSharedIncomePerspectiveTrades(base, [], transfers, 303, normalized.sharedIncomeSourceClosings);
    expect(result).toHaveLength(2);
    expect(result.find((item: any) => item.id === "beneficiary-9001")).toMatchObject({ quantity: 1.25, sharedIncomeAmount: 14.345678 });
    expect(result.find((item: any) => item.sourceEntryId === "9002")).toMatchObject({ historyIncomeKind: "shared", quantity: 4.25, price: 2789.98765432, sharedIncomeAmount: 20.123456, createdAt: "2026-11-08T15:59:59.000Z" });
    expect(JSON.stringify({ base, transfers, sources: normalized.sharedIncomeSourceClosings })).toBe(before);
    expect(client.attachSharedIncomePerspectiveTrades([], [], transfers, 303, [])).toEqual([]);
    expect(client.attachSharedIncomePerspectiveTrades(base, [], transfers, 0, normalized.sharedIncomeSourceClosings)).toBe(base);
  });

  it("真实加载语句只将journal.entries变成raw/trades；共享窗口外来源不进入仓位、FIFO或手续费", async () => {
    const { data } = await sample();
    data.viewerMode = "admin";
    const effect = required(nodes(page, ts.isCallExpression).find(node => node.expression.getText() === "useEffect" && node.arguments[0]?.getText().includes("setRawJournalTrades(rawTrades)") && node.arguments[0]?.getText().includes("setAccounts(nextAccounts)")), "journal load effect");
    const callback = effect.arguments[0];
    if (!ts.isArrowFunction(callback) || !ts.isBlock(callback.body)) throw new Error("Expected load block");
    const wanted = callback.body.statements.filter(statement => {
      if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && ["rawTrades", "nextTrades"].includes(item.name.text));
      return ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && ["setRawJournalTrades", "setTrades"].includes(statement.expression.expression.getText());
    });
    const rawSetter = vi.fn(); const tradeSetter = vi.fn();
    isolated(wanted.map(statement => statement.getText(page)).join("\n"), { ...client, journal: freeze(data), nextProfitShareSnapshots: [], setRawJournalTrades: rawSetter, setTrades: tradeSetter }, "undefined");
    const raw = rawSetter.mock.calls[0][0]; const trades = tradeSetter.mock.calls[0][0];
    expect(raw.map((item: any) => item.id)).toEqual(["1"]);
    expect(trades.map((item: any) => item.id)).toEqual(["1"]);
    const deps = { selectedFilledTrades: trades, trades };
    const buckets = memo("buckets", deps);
    expect(buckets.reduce((sum: number, bucket: any) => sum + bucket.remainingQuantity, 0)).toBe(10);
    expect(memo("recentJournalTradeDetails", deps).size).toBe(1);
    expect([...client.buildOpeningClosingAllocations(trades).values()].flat()).toHaveLength(0);
    expect(client.buildPositionBuckets([...trades, ...normalize(data).sharedIncomeSourceClosings]).reduce((sum: number, bucket: any) => sum + bucket.remainingQuantity, 0)).toBeLessThan(10);
  });
});

function mutationCallback(name: string) {
  const call = initializer(page, name);
  if (!ts.isCallExpression(call) || !ts.isObjectLiteralExpression(call.arguments[0])) throw new Error(`Expected mutation options: ${name}`);
  const success = required(call.arguments[0].properties.find((node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node) && node.name.getText() === "onSuccess"), `${name}.onSuccess`);
  return success.initializer;
}
function cacheHarness(initialData: any, scope = { previewUserId: 303, viewerScopeUserId: 870413 }) {
  let cache = initialData;
  let trades = initialData.entries.map(client.previewTradeFromEntry);
  let raw = [...trades];
  let expanded = new Set(["9001", "9002"]);
  let recoverable: any[] = [];
  const events: string[] = [];
  let release!: () => void;
  const cancelled = new Promise<void>(resolve => { release = resolve; });
  const cancel = vi.fn((_input: any) => { events.push("cancel"); return cancelled; });
  const setData = vi.fn((_input: any, update: any) => { events.push("setData"); cache = update(cache); });
  const refetch = vi.fn(async () => { events.push("refetch"); });
  const deps = { ...client, ...scope, canManage: false, t0Utils: { ledger: { t0GetJournal: { cancel, setData } } }, t0JournalQuery: { refetch },
    setTrades: (update: any) => { trades = update(trades); }, setRawJournalTrades: (update: any) => { raw = update(raw); },
    setExpandedOpenedTradeIds: (update: any) => { expanded = update(expanded); }, setRecoverableEntries: (update: any) => { recoverable = update(recoverable); },
    setRevertCandidate: vi.fn(), setRestoreCandidate: vi.fn(), t0Toast: { success: vi.fn() } };
  return { revert: expression(mutationCallback("revertEntryMutation"), deps), restore: expression(mutationCallback("restoreEntryMutation"), deps),
    cancel, setData, refetch, release, events, state: () => ({ cache, trades, raw, expanded, recoverable }), freshRefetch: (data: any) => { cache = data; } };
}

describe("回撤cancel → setData精准剔除，restore同ID由fresh refetch恢复（真实mutation回调）", () => {
  it("await cancel相同preview/viewer请求scope后才清理entry/transfer/sourceIds/sourceDTO，不误伤其他记录", async () => {
    const h = readHarness([row(9001), row(9002)], [transfer(501), transfer(502, row(9001)), transfer(503, row(9002))]);
    const initialData = freeze(await h.run({ mode: "member", relatedUserId: 303 }));
    const before = JSON.stringify(initialData);
    const cache = cacheHarness(initialData);
    const result = cache.revert({ entryId: 9001, auditId: 77, entry: initialData.entries[0] });
    expect(cache.events).toEqual(["cancel"]);
    expect(cache.setData).not.toHaveBeenCalled();
    expect(cache.state().cache).toBe(initialData);
    cache.release(); await result;
    const requestScope = { ledgerId: 52, previewUserId: 303, viewerScopeUserId: 870413 };
    expect(cache.cancel).toHaveBeenCalledWith(requestScope);
    expect(cache.setData.mock.calls[0][0]).toEqual(requestScope);
    expect(cache.events).toEqual(["cancel", "setData", "refetch"]);
    const state = cache.state();
    expect(state.cache.entries.map((item: any) => item.id)).toEqual(["9002"]);
    expect(state.cache.sharedIncomeTransfers.map((item: any) => item.id)).toEqual(["503"]);
    expect(state.cache.sharedIncomeSourceClosingEntryIds).toEqual(["9002"]);
    expect(state.cache.sharedIncomeSourceClosings.map((item: any) => item.id)).toEqual(["9002"]);
    expect(state.trades.map((item: any) => item.id)).toEqual(["9002"]);
    expect(state.raw.map((item: any) => item.id)).toEqual(["9002"]);
    expect([...state.expanded]).toEqual(["9002"]);
    expect(state.recoverable).toHaveLength(1);
    expect(state.recoverable[0]).toMatchObject({ auditId: "77", operation: "revert", trade: { id: "9001" } });
    expect(state.cache.profitShareSnapshots).toBe(initialData.profitShareSnapshots);
    expect(state.cache.accounts).toBe(initialData.accounts);
    expect(state.cache.entries[0]).toBe(initialData.entries[1]);
    expect(JSON.stringify(initialData)).toBe(before);
    expect(normalize(state.cache, initialData.entries.map(client.previewTradeFromEntry)).sharedIncomeTransfers.map((item: any) => item.id)).toEqual(["503"]);
  });

  it("普通scope省略preview，旧回包undefined字段及空缓存不抛错；不存在ID不误删任一有效记录", async () => {
    const h = readHarness([row(9002)]);
    const data: any = await h.run({ mode: "member", relatedUserId: 303 });
    delete data.sharedIncomeTransfers; delete data.sharedIncomeSourceClosingEntryIds; delete data.sharedIncomeSourceClosings;
    const cache = cacheHarness(freeze(data), { previewUserId: 0, viewerScopeUserId: 303 });
    cache.release(); await cache.revert({ entryId: "missing" });
    expect(cache.cancel).toHaveBeenCalledWith({ ledgerId: 52, previewUserId: undefined, viewerScopeUserId: 303 });
    expect(cache.state().cache.entries).toEqual(data.entries);
    expect(cache.state().cache.sharedIncomeSourceClosingEntryIds).toBeUndefined();
    const update = cache.setData.mock.calls[0][1];
    expect(update(undefined)).toBeUndefined();
    expect(update(null)).toBeNull();
  });

  it("恢复同一entry ID只触发refetch、不臆造共享；fresh真实回包重新恢复转账/来源/累计", async () => {
    const reader = readHarness([row(9001), row(9002)], [transfer(501), transfer(502, row(9002))]);
    const initialData = freeze(await reader.run({ mode: "member", relatedUserId: 303 }));
    const cache = cacheHarness(initialData);
    cache.release(); await cache.revert({ entryId: "9001", auditId: 77, entry: initialData.entries[0] });
    expect(normalize(cache.state().cache).sharedIncomeTransfers.map((item: any) => item.id)).toEqual(["502"]);
    cache.restore({ entry: initialData.entries[0] }, { auditId: 77 });
    expect(cache.refetch).toHaveBeenCalledTimes(2);
    expect(cache.setData).toHaveBeenCalledTimes(1);
    expect(cache.state().recoverable).toEqual([]);
    expect(cache.state().trades.filter((item: any) => item.id === "9001")).toHaveLength(1);
    expect(normalize(cache.state().cache).sharedIncomeTransfers.map((item: any) => item.id)).toEqual(["502"]);
    const fresh = await reader.run({ mode: "member", relatedUserId: 303 });
    cache.freshRefetch(fresh);
    const restored = normalize(cache.state().cache);
    expect(restored.sharedIncomeTransfers.map((item: any) => item.id)).toEqual(["501", "502"]);
    expect(restored.sharedIncomeSourceClosings.map((item: any) => item.id)).toEqual(["9001", "9002"]);
    const received = memo("payoutSharedIncomeTransfers", { ...restored, payoutTargetRelatedUserId: 303 });
    expect(initial("payoutSharedIncomeTotal", { payoutSharedIncomeTransfers: received })).toBe(initialData.sharedIncomeTransfers.reduce((sum: number, item: any) => sum + item.amount, 0));
  });
});
