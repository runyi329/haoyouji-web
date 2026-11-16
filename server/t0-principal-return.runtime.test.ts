import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 离线执行真实 AST 函数，不 import journal/db/服务器；所有 fixture 仅存在于本测试。
const journal = ts.createSourceFile("ledger52-t0-journal.ts", readFileSync(new URL("./ledger52-t0-journal.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const routers = ts.createSourceFile("routers.ts", readFileSync(new URL("./routers.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${label}`);
  return value;
}
function declaration(name: string) {
  return required(journal.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name), name);
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return result;
}
class SafeError extends Error {
  readonly code: string;
  constructor(input: { code: string; message: string }) { super(input.message); this.code = input.code; }
}
function isolated(text: string, result: string, dependencies: Record<string, unknown> = {}) {
  const compiled = ts.transpileModule(`${text.replace(/^export /gm, "")}\nconst __result = (${result});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    transformers: { before: [context => root => ts.visitNode(root, function visit(node: ts.Node): ts.VisitResult<ts.Node> {
      // 只替换真实 AST 的 import 调用，不重写业务分支或金额比较。
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const path = node.arguments[0];
        if (!path || !ts.isStringLiteral(path)) throw new Error("Unexpected dynamic import");
        if (path.text === "./ledger52-t0-weekly-settlement") return ts.factory.createIdentifier("weeklyFixture");
        if (path.text === "./ledger52-t0-journal") return ts.factory.createIdentifier("journalFixture");
        throw new Error(`Forbidden runtime import: ${path.text}`);
      }
      return ts.visitEachChild(node, visit, context);
    }) as ts.SourceFile] },
  }).outputText;
  return new vm.Script(`${compiled}\n;__result;`).runInContext(vm.createContext({
    Error, TRPCError: SafeError, process: { env: {} }, exports: {},
    require: (name: string) => { throw new Error(`Forbidden runtime import: ${name}`); },
    ...dependencies,
  }), { timeout: 2500 });
}
const pureNames = ["asRows", "toNumber", "isoTime", "normalizeWithdrawalSource", "mapT0JournalPayoutLog",
  "floorPayoutAmountToCents", "payoutAmountToCents", "payoutCentsToAmount", "parsePayoutFixedDecimal",
  "formatPayoutFixedDecimal", "resolveDepositEthPrincipal", "payoutDepositInputModeSelectSql",
  "payoutWithdrawalSourceSelectSql", "isLedger52T0ReadonlyPreview", "isLedger52T0ReadOnlyPreview", "assertExistingGlobalUser"];
const roots = ["getLedger52T0JournalPayoutAvailability", "createLedger52T0JournalPayoutLog",
  "updateLedger52T0JournalPayoutLog", "deleteLedger52T0JournalPayoutLog"];
const declarations = [...pureNames, ...roots].map(name => declaration(name).getText(journal)).join("\n");
// 抽取真实常量而非在 fixture 重写金额精度。
const constants = ["LEDGER_52_T0_JOURNAL_ID", "PAYOUT_ETH_REFERENCE_PRICE_SCALE", "PAYOUT_ETH_QUANTITY_SCALE"].map(name => {
  const node = required(journal.statements.find(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === name)), name);
  return node.getText(journal);
}).join("\n");
const OWNER = 77;
const MEMBER = 203;
const cents = (value: unknown) => Math.round(Number(value) * 100);

type Row = {
  id: number; ledger_id: number; user_id: number; related_user_id: number;
  direction: "deposit" | "withdrawal"; amount: string; withdrawal_source?: "income" | "principal";
  occurred_on: string; created_at: string; related_user_name: string;
  eth_reference_price?: string | null; eth_quantity?: string | null; deposit_input_mode?: string;
  note?: string | null;
};
function row(id: number, direction: Row["direction"], amount: string, source?: Row["withdrawal_source"], extra: Partial<Row> = {}): Row {
  return { id, ledger_id: 52, user_id: OWNER, related_user_id: MEMBER, direction, amount, withdrawal_source: source,
    occurred_on: "2026-11-15", created_at: "2026-11-15T00:00:00Z", related_user_name: "离线测试成员", ...extra };
}
const deposit = (id: number, amount: string, extra: Partial<Row> = {}) => row(id, "deposit", amount, undefined, extra);
const principal = (id: number, amount: string, extra: Partial<Row> = {}) => row(id, "withdrawal", amount, "principal", extra);
const income = (id: number, amount: string, extra: Partial<Row> = {}) => row(id, "withdrawal", amount, "income", extra);

type Event = { connection: string; kind: string; sql?: string; params?: unknown[] };
function fixture(initial: Row[] = [], hasSource = true) {
  const state = { rows: initial.map(item => ({ ...item })), nextId: 10000, events: [] as Event[] };
  const locks = new Map<number, string>();
  const queues = new Map<number, Array<() => void>>();
  let connectionCount = 0;
  function connection(name: string = `tx${++connectionCount}`, withRelease = true) {
    let local: Row[] | undefined;
    let lockedUser: number | undefined;
    let inTransaction = false;
    const event = (kind: string, sql?: string, params?: unknown[]) => state.events.push({ connection: name, kind, sql, params });
    const unlock = () => {
      if (lockedUser === undefined) return;
      const user = lockedUser;
      locks.delete(user);
      lockedUser = undefined;
      queues.get(user)?.shift()?.();
    };
    const conn = {
      fixtureSourceForEdit: vi.fn(async (input: { journalOwnerUserId: number; relatedUserId: number; payoutLogId: number }) => {
        const found = state.rows.find(item => item.id === input.payoutLogId && item.ledger_id === 52 && item.user_id === input.journalOwnerUserId && item.related_user_id === input.relatedUserId);
        if (!found) throw new SafeError({ code: "NOT_FOUND", message: "未找到可编辑的资金流水记录" });
        return hasSource && found.withdrawal_source === "principal" ? "principal" : "income";
      }),
      beginTransaction: vi.fn(async () => { inTransaction = true; event("begin"); }),
      execute: vi.fn(async (rawSql: string, params: unknown[] = []): Promise<any[]> => {
        const sql = rawSql.replace(/\s+/g, " ").trim();
        event("sql", sql, params);
        if ((sql.match(/\?/g) || []).length !== params.length) throw new Error(`Incomplete SQL parameters: ${sql}`);
        if (/\b(?:ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql)) throw new Error("DDL forbidden in offline fixture");
        if (sql.startsWith("SHOW COLUMNS")) return [hasSource ? [{ Field: "withdrawal_source" }] : []];
        if (sql.startsWith("SELECT id FROM users WHERE id = ?")) {
          const user = Number(params[0]);
          if (inTransaction && lockedUser !== user) {
            if (locks.has(user)) { event("lock-wait"); await new Promise<void>(resolve => queues.set(user, [...(queues.get(user) || []), resolve])); }
            locks.set(user, name);
            lockedUser = user;
            local = state.rows.map(item => ({ ...item }));
            event("lock-acquired");
          }
          return [[{ id: user }]];
        }
        const current = () => local || state.rows;
        const scoped = (ledger: unknown, owner: unknown, member: unknown) => current().filter(item => item.ledger_id === ledger && item.user_id === owner && item.related_user_id === member);
        const total = (items: Row[]) => items.reduce((sum, item) => sum + cents(item.amount), 0) / 100;
        if (sql.startsWith("SELECT") && sql.includes("SUM(")) {
          // 参数位置由真实 SQL 里的排除条件确定；不返回预制总额，按当前共享行重算。
          const firstExclusion = sql.indexOf("id <> ?") >= 0 && sql.indexOf("id <> ?") < sql.indexOf("WHERE ledger_id");
          const offset = firstExclusion ? 1 : 0;
          const items = scoped(params[offset], params[offset + 1], params[offset + 2]);
          const withdrawals = items.filter(item => item.direction === "withdrawal");
          const source = (item: Row) => hasSource && sql.includes("withdrawal_source") ? (item.withdrawal_source || "income") : "income";
          if (sql.includes("AS total_amount")) {
            const exclude = sql.includes("id <> ?") ? Number(params[4]) : undefined;
            return [[{ total_amount: total(withdrawals.filter(item => source(item) === params[3] && item.id !== exclude)) }]];
          }
          if (sql.includes("AS deposit_total")) return [[{
            deposit_total: total(items.filter(item => item.direction === "deposit")),
            income_withdrawal_total: total(withdrawals.filter(item => source(item) === "income")),
            principal_withdrawal_total: total(withdrawals.filter(item => source(item) === "principal")),
            withdrawal_total: total(withdrawals),
          }]];
          if (sql.includes("AS other_deposits")) return [[{
            principal_withdrawals: total(withdrawals.filter(item => source(item) === "principal")),
            other_deposits: total(items.filter(item => item.direction === "deposit" && item.id !== Number(params[0]))),
          }]];
          if (sql.includes("AS deposits")) return [[{
            deposits: total(items.filter(item => item.direction === "deposit")),
            principal_withdrawals: total(withdrawals.filter(item => source(item) === "principal" && (!firstExclusion || item.id !== Number(params[0])))),
          }]];
          throw new Error(`Unexpected aggregate SQL: ${sql}`);
        }
        if (sql.startsWith("SELECT") && sql.includes("FROM ledger52_t0_journal_payout_logs")) {
          const [id, ledger, owner, member] = params;
          return [current().filter(item => item.id === id && item.ledger_id === ledger && item.user_id === owner && (member === undefined || item.related_user_id === member)).map(item => ({ ...item, ...(sql.includes("'income' AS withdrawal_source") ? { withdrawal_source: "income" } : {}) }))];
        }
        if (sql.startsWith("INSERT INTO ledger52_t0_journal_payout_logs")) {
          if (!local || lockedUser === undefined) throw new Error("Insert before member lock");
          const [ledger, owner, member, date, amount, direction, source, price, quantity, mode, note] = params;
          const id = state.nextId++;
          local.push(row(id, direction as Row["direction"], String(amount), source as Row["withdrawal_source"], {
            ledger_id: Number(ledger), user_id: Number(owner), related_user_id: Number(member), occurred_on: String(date),
            eth_reference_price: price as string | null, eth_quantity: quantity as string | null, deposit_input_mode: String(mode), note: note as string | null,
          }));
          return [{ insertId: id }];
        }
        if (sql.startsWith("UPDATE ledger52_t0_journal_payout_logs")) {
          if (!local || lockedUser === undefined) throw new Error("Update before member lock");
          const [date, amount, direction, source, price, quantity, mode, note, id, ledger, owner, member] = params;
          const target = local.find(item => item.id === id && item.ledger_id === ledger && item.user_id === owner && item.related_user_id === member);
          if (!target) return [{ affectedRows: 0 }];
          Object.assign(target, { occurred_on: date, amount, direction, withdrawal_source: source, eth_reference_price: price, eth_quantity: quantity, deposit_input_mode: mode, note });
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith("DELETE FROM ledger52_t0_journal_payout_logs")) {
          if (!local || lockedUser === undefined) throw new Error("Delete before member lock");
          const [id, ledger, owner, member] = params;
          const index = local.findIndex(item => item.id === id && item.ledger_id === ledger && item.user_id === owner && item.related_user_id === member);
          if (index < 0) return [{ affectedRows: 0 }];
          local.splice(index, 1);
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected production SQL: ${sql}`);
      }),
      commit: vi.fn(async () => { if (local) state.rows = local.map(item => ({ ...item })); event("commit"); inTransaction = false; local = undefined; unlock(); }),
      rollback: vi.fn(async () => { event("rollback"); inTransaction = false; local = undefined; unlock(); }),
      ...(withRelease ? { release: vi.fn(() => { event("release"); unlock(); }) } : {}),
    };
    return conn;
  }
  return { state, connection };
}
function api(conn: any, total = 0) {
  const cap = vi.fn(async (_input: { journalOwnerUserId: number; relatedUserId: number }) => ({ order: total, commission: 0, shared: 0, total }));
  const ensure = vi.fn(async (_connection: any) => undefined); // 绝不抽取/执行建表函数。
  const getConnection = vi.fn(async () => conn);
  const sourceForEdit = vi.fn(async (input: { journalOwnerUserId: number; relatedUserId: number; payoutLogId: number }) => conn.fixtureSourceForEdit(input));
  const functions = isolated(`${constants}\n${declarations}`, `({${[...roots, "mapT0JournalPayoutLog", "payoutWithdrawalSourceSelectSql"].join(",")}})`, {
    getDbConnection: getConnection, getDbTransactionConnection: getConnection,
    ensureLedger52T0JournalTables: ensure, getLedger52T0JournalWithdrawalIncomeCap: cap,
    getLedger52T0JournalWithdrawalSourceForEdit: sourceForEdit,
  });
  return { ...functions, cap, ensure, getConnection, sourceForEdit };
}
function createInput(extra: Record<string, unknown> = {}) {
  return { journalOwnerUserId: OWNER, operatorUserId: 28, relatedUserId: MEMBER, occurredOn: "2026-11-15", amount: "40", direction: "withdrawal", withdrawalSource: "principal", ...extra };
}
function updateInput(extra: Record<string, unknown> = {}) {
  return { journalOwnerUserId: OWNER, relatedUserId: MEMBER, payoutLogId: "2", occurredOn: "2026-11-15", amount: "40", direction: "withdrawal", withdrawalSource: "principal", ...extra };
}
const deleteInput = (id = "1") => ({ journalOwnerUserId: OWNER, relatedUserId: MEMBER, payoutLogId: id });
function writeCalls(conn: any) { return conn.execute.mock.calls.filter(([sql]: [string]) => /^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql)); }
function lifecycle(conn: any, success: boolean) {
  expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
  expect(conn.commit).toHaveBeenCalledTimes(success ? 1 : 0);
  expect(conn.rollback).toHaveBeenCalledTimes(success ? 0 : 1);
  if (conn.release) expect(conn.release).toHaveBeenCalledTimes(1);
  if (!success) expect(writeCalls(conn)).toHaveLength(0);
  const lockIndex = conn.execute.mock.calls.findIndex(([sql]: [string]) => /SELECT id FROM users WHERE id = \? FOR UPDATE/.test(sql));
  const fundsIndex = conn.execute.mock.calls.findIndex(([sql]: [string]) => /SELECT[\s\S]*FROM ledger52_t0_journal_payout_logs/.test(sql));
  expect(lockIndex).toBeGreaterThanOrEqual(0);
  if (fundsIndex >= 0) expect(lockIndex).toBeLessThan(fundsIndex);
  expect(conn.beginTransaction.mock.invocationCallOrder[0]).toBeLessThan(conn.execute.mock.invocationCallOrder[lockIndex]);
  const finish = success ? conn.commit : conn.rollback;
  if (conn.release) expect(finish.mock.invocationCallOrder[0]).toBeLessThan(conn.release.mock.invocationCallOrder[0]);
  for (const [sql, params] of conn.execute.mock.calls) {
    if (!sql.includes("ledger52_t0_journal_payout_logs")) continue;
    expect(sql).toContain("ledger_id"); expect(sql).toContain("user_id");
    expect(params).toContain(52); expect(params).toContain(OWNER);
    if (sql.includes("SUM(")) { expect(sql).not.toMatch(/\bLIMIT\b/i); expect(params).toContain(MEMBER); expect(sql).toContain("FOR UPDATE"); }
  }
}

describe("本金 availability：完整独立资金口径", () => {
  it.each([0, -900, 1000])("收益为 %s 时本金不受收益、损失、持仓或挂单影响", async total => {
    const f = fixture([deposit(1, "100"), principal(2, "60"), income(3, "90")]);
    const conn = f.connection(); const service = api(conn, total);
    const result = await service.getLedger52T0JournalPayoutAvailability({ journalOwnerUserId: OWNER, relatedUserId: MEMBER });
    expect(result).toMatchObject({ depositTotal: 100, principalWithdrawalTotal: 60, incomeWithdrawalTotal: 90,
      principalBookBalance: 40, availablePrincipalAmount: 40, withdrawalTotal: 150, availableIncomeAmount: Math.max(0, total - 90), availableAmount: Math.max(0, total - 90) });
    expect(service.cap).toHaveBeenCalledWith({ journalOwnerUserId: OWNER, relatedUserId: MEMBER });
    expect(service.ensure).not.toHaveBeenCalled(); expect(writeCalls(conn)).toHaveLength(0);
    for (const [sql, params] of conn.execute.mock.calls) {
      expect(sql).not.toMatch(/\b(?:LIMIT|INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i);
      if (sql.includes("SUM(")) expect(params).toEqual([52, OWNER, MEMBER]);
    }
  });
  it("完整收益读取失败时 income=null，不把本金降为0或把availableIncome伪装为0", async () => {
    const f = fixture([deposit(1, "100"), principal(2, "25")]); const service = api(f.connection());
    service.cap.mockRejectedValueOnce(new Error("完整收益事实失败"));
    expect(await service.getLedger52T0JournalPayoutAvailability({ journalOwnerUserId: OWNER, relatedUserId: MEMBER })).toMatchObject({
      income: null, availableIncomeAmount: null, availableAmount: null, incomeUnavailableReason: "完整收益事实失败", availablePrincipalAmount: 75,
    });
    expect(service.ensure).not.toHaveBeenCalled();
  });
  it("legacy 无 source 列时按income聚合，无DDL，已有提现不误扣本金", async () => {
    const f = fixture([deposit(1, "100"), row(2, "withdrawal", "60")], false); const conn = f.connection(); const service = api(conn, 80);
    expect(await service.getLedger52T0JournalPayoutAvailability({ journalOwnerUserId: OWNER, relatedUserId: MEMBER })).toMatchObject({ availablePrincipalAmount: 100, availableIncomeAmount: 20, principalWithdrawalTotal: 0, incomeWithdrawalTotal: 60 });
    expect(conn.execute.mock.calls[0][0]).toContain("SHOW COLUMNS");
    expect(conn.execute.mock.calls[1][0]).toContain("'income' = 'income'");
    expect(conn.execute.mock.calls[1][0]).toContain("'income' = 'principal'");
    expect(service.ensure).not.toHaveBeenCalled();
  });
  it("owner/member/ledger严格隔离，超过500行仍完整聚合，不收订单筛选与LIMIT", async () => {
    const valid = Array.from({ length: 601 }, (_, i) => principal(i + 10, "0.01"));
    const f = fixture([deposit(1, "100"), ...valid, income(2, "2"), deposit(3, "9000", { user_id: 28 }), deposit(4, "9000", { related_user_id: 204 }), deposit(5, "9000", { ledger_id: 53 })]);
    const conn = f.connection(); const service = api(conn, 10);
    expect(await service.getLedger52T0JournalPayoutAvailability({ journalOwnerUserId: OWNER, relatedUserId: MEMBER, accountId: 9, instrumentType: "option", limit: 1 })).toMatchObject({ depositTotal: 100, principalWithdrawalTotal: 6.01, availablePrincipalAmount: 93.99, availableIncomeAmount: 8 });
    const [sql, params] = conn.execute.mock.calls[1];
    expect(params).toEqual([52, OWNER, MEMBER]); expect(sql).not.toMatch(/\bLIMIT\b|account_id|instrument_type|execution_status/i);
  });
  it("本金账面为负只归0，收益精度向下到分", async () => {
    const service = api(fixture([deposit(1, "10"), principal(2, "10.01"), income(3, "0.01")]).connection(), 0.039);
    expect(await service.getLedger52T0JournalPayoutAvailability({ journalOwnerUserId: OWNER, relatedUserId: MEMBER })).toMatchObject({ availablePrincipalAmount: 0, availableIncomeAmount: 0.02 });
  });
  it("无效成员与无连接明确失败，不返回假额度", async () => {
    const service = api(null);
    await expect(service.getLedger52T0JournalPayoutAvailability({ journalOwnerUserId: OWNER, relatedUserId: 0 })).rejects.toThrow("有效的关联用户");
    expect(service.getConnection).not.toHaveBeenCalled();
    await expect(service.getLedger52T0JournalPayoutAvailability({ journalOwnerUserId: OWNER, relatedUserId: MEMBER })).rejects.toThrow("数据库连接失败");
  });
  it.each([undefined, null, "", "income", "principal"])("真实日志映射旧 source=%s", source => {
    const service = api(null);
    expect(service.mapT0JournalPayoutLog({ ...principal(1, "1"), withdrawal_source: source }).withdrawalSource).toBe(source === "principal" ? "principal" : "income");
    expect(service.mapT0JournalPayoutLog(deposit(1, "1")).withdrawalSource).toBeUndefined();
  });
  it.each([true, false])("只读预览 source 列存在=%s，真实选择器回退income", async hasSource => {
    const conn = fixture([], hasSource).connection();
    const selector = isolated(declaration("payoutWithdrawalSourceSelectSql").getText(journal) + "\n" + declaration("asRows").getText(journal) + "\n" + declaration("isLedger52T0ReadOnlyPreview").getText(journal), "payoutWithdrawalSourceSelectSql", { process: { env: { PREVIEW_READONLY: "true" } } });
    expect(await selector(conn)).toBe(hasSource ? "payout.withdrawal_source" : "'income' AS withdrawal_source");
    expect(conn.execute).toHaveBeenCalledTimes(1); expect(writeCalls(conn)).toHaveLength(0);
  });
});

describe("真实收益cap：动态依赖仅注入fixture", () => {
  it.each([10.239, -100, 0])("完整收益 %s 向下到分并正确传递owner/member", async total => {
    const weeklyFixture = { getLedger52T0CumulativeRealizedIncome: vi.fn(async () => ({ order: total, commission: 2, shared: 3, total })) };
    const cap = isolated(["getLedger52T0JournalWithdrawalIncomeCap", "floorPayoutAmountToCents", "payoutCentsToAmount"].map(name => declaration(name).getText(journal)).join("\n"), "getLedger52T0JournalWithdrawalIncomeCap", { weeklyFixture });
    expect(await cap({ journalOwnerUserId: OWNER, relatedUserId: MEMBER })).toMatchObject({ order: total, commission: 2, shared: 3, total: Math.floor(Math.max(0, total) * 100 + 0.0000001) / 100 });
    expect(weeklyFixture.getLedger52T0CumulativeRealizedIncome).toHaveBeenCalledWith({ journalOwnerUserId: OWNER, targetUserId: MEMBER });
  });
});

describe("本金create：金额边界、分类与事务", () => {
  it("首次可提全部100本金，收益cap失败也完全不调用", async () => {
    const f = fixture([deposit(1, "100")]); const conn = f.connection(); const service = api(conn);
    service.cap.mockRejectedValue(new Error("收益服务不可用"));
    expect(await service.createLedger52T0JournalPayoutLog(createInput({ amount: "100" }))).toMatchObject({ amount: 100, withdrawalSource: "principal", direction: "withdrawal" });
    expect(service.cap).not.toHaveBeenCalled(); expect(writeCalls(conn)).toHaveLength(1); lifecycle(conn, true);
    expect(service.ensure).toHaveBeenCalledWith(conn);
    expect(writeCalls(conn)[0][1]).toEqual([52, OWNER, MEMBER, "2026-11-15", "100", "withdrawal", "principal", null, null, "u", null, 28]);
  });
  it.each([["40", true], ["41", false], ["40.01", false]] as const)("投入100已返60，新提%s success=%s（防重复扣减）", async (amount, ok) => {
    const f = fixture([deposit(1, "100"), principal(2, "60")]); const conn = f.connection(); const service = api(conn, -500);
    const call = service.createLedger52T0JournalPayoutLog(createInput({ amount }));
    if (ok) await expect(call).resolves.toMatchObject({ amount: Number(amount), withdrawalSource: "principal" });
    else await expect(call).rejects.toThrow("本金提现将超过");
    expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, ok);
    if (!ok) expect(f.state.rows).toEqual([deposit(1, "100"), principal(2, "60")]);
  });
  it("连续真实create共享facts：60后40允许，第三笔0.01拒绝且不改已提交记录", async () => {
    const f = fixture([deposit(1, "100")]);
    for (const amount of ["60", "40"]) { const conn = f.connection(); await api(conn).createLedger52T0JournalPayoutLog(createInput({ amount })); lifecycle(conn, true); }
    const before = JSON.stringify(f.state.rows); const conn = f.connection();
    await expect(api(conn).createLedger52T0JournalPayoutLog(createInput({ amount: "0.01" }))).rejects.toThrow("本金提现将超过");
    lifecycle(conn, false); expect(JSON.stringify(f.state.rows)).toBe(before);
  });
  it.each([["0.01", true], ["0.02", false]] as const)("投入0.30已返0.29，一分钱边界%s", async (amount, ok) => {
    const f = fixture([deposit(1, "0.30"), principal(2, "0.29")]); const conn = f.connection();
    const call = api(conn).createLedger52T0JournalPayoutLog(createInput({ amount }));
    if (ok) await expect(call).resolves.toMatchObject({ amount: 0.01 }); else await expect(call).rejects.toThrow("本金提现将超过");
    lifecycle(conn, ok);
  });
  it("再多收益不能抵本金不足，其他owner/member/ledger投入不能借用", async () => {
    const f = fixture([deposit(1, "10"), principal(2, "10"), deposit(3, "10000", { user_id: 28 }), deposit(4, "10000", { related_user_id: 204 }), deposit(5, "10000", { ledger_id: 53 })]);
    const conn = f.connection(); const service = api(conn, 100000);
    await expect(service.createLedger52T0JournalPayoutLog(createInput({ amount: "0.01" }))).rejects.toThrow("本金提现将超过");
    expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, false);
  });
  it("已提收益900不消耗本金100", async () => {
    const f = fixture([deposit(1, "100"), income(2, "900")]); const conn = f.connection(); const service = api(conn, -10);
    await expect(service.createLedger52T0JournalPayoutLog(createInput({ amount: "100" }))).resolves.toMatchObject({ amount: 100 });
    expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, true);
  });
  it.each([["40", true], ["40.01", false]] as const)("income只扣已有income10，不含principal60：新提%s", async (amount, ok) => {
    const f = fixture([deposit(1, "100"), principal(2, "60"), income(3, "10")]); const conn = f.connection(); const service = api(conn, 50);
    const call = service.createLedger52T0JournalPayoutLog(createInput({ amount, withdrawalSource: "income" }));
    if (ok) await expect(call).resolves.toMatchObject({ withdrawalSource: "income" }); else await expect(call).rejects.toThrow("累计收益提现将超过");
    const aggregate = conn.execute.mock.calls.find(([sql]) => sql.includes("AS total_amount"));
    expect(aggregate?.[1]).toEqual([52, OWNER, MEMBER, "income"]);
    expect(service.cap).toHaveBeenCalledWith({ journalOwnerUserId: OWNER, relatedUserId: MEMBER }); lifecycle(conn, ok);
  });
  it("create省略source按income，不自动取本金；收益失败在借用tx前拒绝不写", async () => {
    const f = fixture([deposit(1, "100")]); const conn = f.connection(); const service = api(conn);
    service.cap.mockRejectedValueOnce(new Error("收益读取失败"));
    await expect(service.createLedger52T0JournalPayoutLog(createInput({ withdrawalSource: undefined }))).rejects.toThrow("收益读取失败");
    expect(service.cap).toHaveBeenCalledWith({ journalOwnerUserId: OWNER, relatedUserId: MEMBER });
    expect(service.getConnection).not.toHaveBeenCalled(); expect(conn.execute).not.toHaveBeenCalled();
    expect(conn.beginTransaction).not.toHaveBeenCalled(); expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled(); if (conn.release) expect(conn.release).not.toHaveBeenCalled();
  });
  it("deposit+principal在获取连接前拒绝", async () => {
    const service = api(null);
    await expect(service.createLedger52T0JournalPayoutLog(createInput({ direction: "deposit", ethReferencePrice: "3000" }))).rejects.toThrow("存入流水不能设置提现来源");
    expect(service.getConnection).not.toHaveBeenCalled();
  });
  it("两次并发create争用同一users锁；第二次看到首笔提交后facts并拒绝穿透", async () => {
    const f = fixture([deposit(1, "100")]); const a = f.connection("A"); const b = f.connection("B");
    const serviceA = api(a); const serviceB = api(b);
    const results = await Promise.allSettled([
      serviceA.createLedger52T0JournalPayoutLog(createInput({ amount: "60" })),
      serviceB.createLedger52T0JournalPayoutLog(createInput({ amount: "60" })),
    ]);
    expect(results.map(item => item.status)).toEqual(["fulfilled", "rejected"]);
    expect((results[1] as PromiseRejectedResult).reason.message).toContain("本金提现将超过");
    expect(f.state.rows.filter(item => item.withdrawal_source === "principal")).toHaveLength(1);
    expect(f.state.events.some(item => item.connection === "B" && item.kind === "lock-wait")).toBe(true);
    const aCommit = f.state.events.findIndex(item => item.connection === "A" && item.kind === "commit");
    const bLock = f.state.events.findIndex(item => item.connection === "B" && item.kind === "lock-acquired");
    const bFunds = f.state.events.findIndex(item => item.connection === "B" && item.sql?.includes("SUM("));
    expect(aCommit).toBeLessThan(bLock); expect(bLock).toBeLessThan(bFunds);
    expect(serviceA.cap).not.toHaveBeenCalled(); expect(serviceB.cap).not.toHaveBeenCalled();
    lifecycle(a, true); lifecycle(b, false);
  });
  it.each(["40", "40.01"])("两次并发60+%s仅在累计不超过100时允许", async amount => {
    const f = fixture([deposit(1, "100")]); const a = f.connection("A"); const b = f.connection("B");
    const results = await Promise.allSettled([api(a).createLedger52T0JournalPayoutLog(createInput({ amount: "60" })), api(b).createLedger52T0JournalPayoutLog(createInput({ amount }))]);
    expect(results[0].status).toBe("fulfilled"); expect(results[1].status).toBe(amount === "40" ? "fulfilled" : "rejected");
    lifecycle(a, true); lifecycle(b, amount === "40");
  });
});

describe("本金edit：排除本笔、保留source、禁止转换", () => {
  it.each([["90", true], ["90.01", false]] as const)("投入100，本笔60其他10，排除本笔后新金额%s", async (amount, ok) => {
    const f = fixture([deposit(1, "100"), principal(2, "60"), principal(3, "10")]); const conn = f.connection(); const service = api(conn);
    const call = service.updateLedger52T0JournalPayoutLog(updateInput({ amount }));
    if (ok) await expect(call).resolves.toMatchObject({ amount: 90, withdrawalSource: "principal" }); else await expect(call).rejects.toThrow("本金提现将超过");
    const sums = conn.execute.mock.calls.filter(([sql]) => sql.includes("SUM("));
    expect(sums[0][1]).toEqual([52, OWNER, MEMBER, "principal", 2]); expect(sums[1][1]).toEqual([2, 52, OWNER, MEMBER]);
    expect(sums[1][0]).toContain("withdrawal_source = 'principal' AND id <> ?");
    expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, ok);
  });
  it("省略source编辑保留principal，不误变income，不重复扣旧本金", async () => {
    const f = fixture([deposit(1, "100"), principal(2, "60")]); const conn = f.connection(); const service = api(conn);
    expect(await service.updateLedger52T0JournalPayoutLog(updateInput({ amount: "100", withdrawalSource: undefined }))).toMatchObject({ amount: 100, withdrawalSource: "principal" });
    expect(writeCalls(conn)[0][1][3]).toBe("principal"); expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, true);
  });
  it.each(["principal", "income"] as const)("显式将%s转成另一source被拒绝回滚不写", async source => {
    const existing = source === "principal" ? principal(2, "60") : income(2, "60"); const f = fixture([deposit(1, "100"), existing]); const conn = f.connection(); const service = api(conn, 1000);
    await expect(service.updateLedger52T0JournalPayoutLog(updateInput({ withdrawalSource: source === "principal" ? "income" : "principal" }))).rejects.toThrow("提现来源不可切换");
    expect(service.cap).toHaveBeenCalledTimes(source === "principal" ? 1 : 0);
    if (service.cap.mock.calls.length) expect(service.cap.mock.invocationCallOrder[0]).toBeLessThan(service.getConnection.mock.invocationCallOrder[0]);
    expect(f.state.rows).toEqual([deposit(1, "100"), existing]); lifecycle(conn, false);
  });
  it.each(["deposit", "withdrawal"] as const)("已有%s记录切换direction拒绝，资金事实未读/未写", async direction => {
    const existing = direction === "deposit" ? deposit(2, "100") : principal(2, "60"); const f = fixture([existing]); const conn = f.connection(); const service = api(conn, 1000);
    await expect(service.updateLedger52T0JournalPayoutLog(updateInput({ direction: direction === "deposit" ? "withdrawal" : "deposit", withdrawalSource: undefined, ethReferencePrice: "3000" }))).rejects.toThrow("存入/提现方向不能切换");
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes("SUM("))).toBe(false);
    expect(service.cap).toHaveBeenCalledTimes(direction === "deposit" ? 1 : 0); lifecycle(conn, false); expect(f.state.rows).toEqual([existing]);
  });
  it.each([["40", true], ["40.01", false]] as const)("income编辑排除本笔，只计其他income10，不计principal60；新金额%s", async (amount, ok) => {
    const f = fixture([deposit(1, "100"), income(2, "20"), income(3, "10"), principal(4, "60")]); const conn = f.connection(); const service = api(conn, 50);
    const call = service.updateLedger52T0JournalPayoutLog(updateInput({ amount, withdrawalSource: undefined }));
    if (ok) await expect(call).resolves.toMatchObject({ amount: 40, withdrawalSource: "income" }); else await expect(call).rejects.toThrow("累计收益提现将超过");
    expect(conn.execute.mock.calls.find(([sql]) => sql.includes("AS total_amount"))?.[1]).toEqual([52, OWNER, MEMBER, "income", 2]);
    expect(service.cap).toHaveBeenCalledTimes(1); lifecycle(conn, ok);
  });
  it("编辑不可跨owner/member，找不到记录时回滚不写", async () => {
    const f = fixture([principal(2, "60", { user_id: 28 }), principal(2, "60", { related_user_id: 204 })]); const conn = f.connection();
    await expect(api(conn).updateLedger52T0JournalPayoutLog(updateInput())).rejects.toThrow("未找到可编辑"); lifecycle(conn, false);
  });
});

describe("deposit修改/删除：已返本金约束", () => {
  it.each([["40", true], ["39.99", false], ["120", true]] as const)("其他投入20已返60，修改本笔为%s success=%s", async (amount, ok) => {
    const initial = [deposit(2, "100"), deposit(3, "20"), principal(4, "60")]; const f = fixture(initial); const conn = f.connection(); const service = api(conn, 100000);
    const call = service.updateLedger52T0JournalPayoutLog(updateInput({ direction: "deposit", withdrawalSource: undefined, amount }));
    if (ok) await expect(call).resolves.toMatchObject({ direction: "deposit", amount: Number(amount), ethQuantity: undefined }); else await expect(call).rejects.toThrow("减少投入后将低于已返还本金，未改账");
    expect(conn.execute.mock.calls.find(([sql]) => sql.includes("AS other_deposits"))?.[1]).toEqual([2, 52, OWNER, MEMBER]);
    expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, ok); if (!ok) expect(f.state.rows).toEqual(initial);
  });
  it.each([["60", true], ["59.99", false]] as const)("删除投入后其他投入%s与已返60比较（分边界）", async (other, ok) => {
    const initial = [deposit(1, "100"), deposit(2, other), principal(3, "60")]; const f = fixture(initial); const conn = f.connection(); const service = api(conn, 100000);
    const call = service.deleteLedger52T0JournalPayoutLog(deleteInput());
    if (ok) await expect(call).resolves.toEqual({ id: "1" }); else await expect(call).rejects.toThrow("删除投入后将低于已返还本金，未改账");
    expect(conn.execute.mock.calls.find(([sql]) => sql.includes("AS other_deposits"))?.[1]).toEqual([1, 52, OWNER, MEMBER]);
    expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, ok);
    if (!ok) expect(f.state.rows).toEqual(initial); else expect(f.state.rows.some(item => item.id === 1)).toBe(false);
  });
  it("没有已返本金时可删除最后投入，收益提现不构成本金约束", async () => {
    const f = fixture([deposit(1, "100"), income(2, "900")]); const conn = f.connection();
    await expect(api(conn).deleteLedger52T0JournalPayoutLog(deleteInput())).resolves.toEqual({ id: "1" }); lifecycle(conn, true);
  });
  it("删除本金返还不调用收益cap，归还本金额度", async () => {
    const f = fixture([deposit(1, "100"), principal(2, "60")]); const conn = f.connection(); const service = api(conn);
    await service.deleteLedger52T0JournalPayoutLog(deleteInput("2"));
    expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, true);
    expect(await api(f.connection()).getLedger52T0JournalPayoutAvailability({ journalOwnerUserId: OWNER, relatedUserId: MEMBER })).toMatchObject({ availablePrincipalAmount: 100 });
  });
  it("删除跨owner/member的记录拒绝并且rollback/release", async () => {
    const f = fixture([deposit(1, "100", { user_id: 28 }), deposit(1, "100", { related_user_id: 204 })]); const conn = f.connection();
    await expect(api(conn).deleteLedger52T0JournalPayoutLog(deleteInput())).rejects.toThrow("未找到可删除"); lifecycle(conn, false);
  });
  it("并发本金返还先提交后降低deposit，不读过期facts且禁止不足60的修改", async () => {
    const f = fixture([deposit(2, "100")]); const a = f.connection("return"); const b = f.connection("edit-deposit");
    const results = await Promise.allSettled([api(a).createLedger52T0JournalPayoutLog(createInput({ amount: "60" })), api(b).updateLedger52T0JournalPayoutLog(updateInput({ direction: "deposit", withdrawalSource: undefined, amount: "59.99" }))]);
    expect(results.map(item => item.status)).toEqual(["fulfilled", "rejected"]);
    expect((results[1] as PromiseRejectedResult).reason.message).toContain("减少投入后将低于已返还本金");
    expect(f.state.rows.find(item => item.id === 2)?.amount).toBe("100"); lifecycle(a, true); lifecycle(b, false);
  });
});

describe("固定ETH投入保持与连接兼容", () => {
  it("U存入1000按3000固定参考价截断18位ETH，不随本金功能改变", async () => {
    const f = fixture(); const conn = f.connection(); const service = api(conn);
    expect(await service.createLedger52T0JournalPayoutLog(createInput({ direction: "deposit", withdrawalSource: undefined, amount: "1000", ethReferencePrice: "3000" }))).toMatchObject({ amount: 1000, ethReferencePrice: "3000", ethQuantity: "0.333333333333333333", depositInputMode: "u", withdrawalSource: undefined });
    expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, true);
  });
  it("ETH存入按原固定整数算法入账U分，保持用户实际ETH18位数量", async () => {
    const quantity = "0.123456789123456789"; const price = "3000.12345678";
    // 独立整数oracle：数量×价格取U分；不调用被测resolve函数生成期望。
    const expectedCents = BigInt(quantity.replace(".", "")) * BigInt(price.replace(".", "")) / (10n ** 24n);
    const f = fixture(); const conn = f.connection(); const service = api(conn);
    const result = await service.createLedger52T0JournalPayoutLog(createInput({ direction: "deposit", withdrawalSource: undefined, amount: undefined, ethQuantity: quantity, ethReferencePrice: price }));
    expect(result).toMatchObject({ amount: Number(expectedCents) / 100, ethQuantity: quantity, ethReferencePrice: price, depositInputMode: "eth", withdrawalSource: undefined });
    const insert = writeCalls(conn)[0][1]; expect(insert[6]).toBe("income"); expect(insert[8]).toBe(quantity); expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, true);
  });
  it("有固定ETH快照的deposit合法编辑同步重算，仍须覆盖已返本金", async () => {
    const f = fixture([deposit(2, "100", { eth_reference_price: "3000", eth_quantity: "0.033333333333333333", deposit_input_mode: "u" }), principal(3, "60")]); const conn = f.connection();
    expect(await api(conn).updateLedger52T0JournalPayoutLog(updateInput({ direction: "deposit", withdrawalSource: undefined, amount: "60", ethReferencePrice: "3000" }))).toMatchObject({ amount: 60, ethReferencePrice: "3000", ethQuantity: "0.02", depositInputMode: "u" }); lifecycle(conn, true);
  });
  it("固定ETH存入编辑不提供参考价仍被拒，不丢已有快照", async () => {
    const initial = [deposit(2, "100", { eth_reference_price: "3000", eth_quantity: "0.033333333333333333" })]; const f = fixture(initial); const conn = f.connection();
    await expect(api(conn).updateLedger52T0JournalPayoutLog(updateInput({ direction: "deposit", withdrawalSource: undefined, amount: "60" }))).rejects.toThrow("请确认本笔投入的 ETH 参考价");
    lifecycle(conn, false); expect(f.state.rows).toEqual(initial);
  });
  it.each(["create", "update", "delete"])("%s普通备用连接没有release亦可正常commit", async operation => {
    const f = fixture([deposit(1, "100"), principal(2, "20")]); const conn = f.connection("ordinary", false); const service = api(conn);
    if (operation === "create") await service.createLedger52T0JournalPayoutLog(createInput());
    else if (operation === "update") await service.updateLedger52T0JournalPayoutLog(updateInput());
    else await service.deleteLedger52T0JournalPayoutLog(deleteInput("2"));
    lifecycle(conn, true);
  });
  it("普通备用连接无release失败仍rollback，不覆盖本金不足错误", async () => {
    const conn = fixture([deposit(1, "10")]).connection("ordinary", false);
    await expect(api(conn).createLedger52T0JournalPayoutLog(createInput())).rejects.toThrow("本金提现将超过"); lifecycle(conn, false);
  });
});

const routeCases = [
  ["t0GetPayoutAvailability", "getLedger52T0JournalPayoutAvailability"],
  ["t0CreatePayoutLog", "createLedger52T0JournalPayoutLog"],
  ["t0UpdatePayoutLog", "updateLedger52T0JournalPayoutLog"],
  ["t0DeletePayoutLog", "deleteLedger52T0JournalPayoutLog"],
] as const;
function route(name: string, journalFixture: any, env: Record<string, string> = {}) {
  const property = required(nodes(routers, ts.isPropertyAssignment).find(item => item.name.getText(routers) === name), name);
  const callback = required(nodes(property, ts.isArrowFunction).find(item => item.getText(routers).includes("resolveLedger52T0JournalReadScope")), `${name} callback`);
  return isolated("", callback.getText(routers), { journalFixture, process: { env } });
}
describe("真实路由：仅管理员登记，解析owner而非浏览器/当前操作人", () => {
  it.each(routeCases)("%s成员/代入成员scope被拒，不能读取或登记本金", async (name, method) => {
    const journalFixture = { resolveLedger52T0JournalReadScope: vi.fn(async () => ({ mode: "member", relatedUserId: MEMBER })), [method]: vi.fn() };
    const handler = route(name, journalFixture);
    for (const isViewingAs of [false, true]) await expect(handler({ ctx: { user: { id: MEMBER, role: "user" }, isViewingAs }, input: { ledgerId: 52, relatedUserId: MEMBER } })).rejects.toThrow("仅具备登记权限");
    expect(journalFixture[method]).not.toHaveBeenCalled();
    expect(journalFixture.resolveLedger52T0JournalReadScope).toHaveBeenLastCalledWith({ id: MEMBER, role: "user", isViewingAs: true });
  });
  it.each(routeCases)("%s管理员使用服务端解析owner及完整member参数", async (name, method) => {
    const journalFixture = { resolveLedger52T0JournalReadScope: vi.fn(async () => ({ mode: "admin", journalOwnerUserId: OWNER })), [method]: vi.fn(async (_input: any) => ({ ok: true })) };
    const input = { ledgerId: 52, id: "2", relatedUserId: MEMBER, occurredOn: "2026-11-15", amount: "40", direction: "withdrawal", withdrawalSource: "principal", journalOwnerUserId: 999, operatorUserId: 999 };
    expect(await route(name, journalFixture)({ ctx: { user: { id: 28, role: "admin" }, isViewingAs: false }, input })).toEqual({ ok: true });
    const arg = journalFixture[method].mock.calls[0][0]; expect(arg.journalOwnerUserId).toBe(OWNER); expect(arg.relatedUserId).toBe(MEMBER);
    if (name === "t0CreatePayoutLog") expect(arg.operatorUserId).toBe(28);
    if (name === "t0CreatePayoutLog" || name === "t0UpdatePayoutLog") expect(arg.withdrawalSource).toBe("principal");
    if (name === "t0UpdatePayoutLog" || name === "t0DeletePayoutLog") expect(arg.payoutLogId).toBe("2");
    if (name === "t0GetPayoutAvailability") expect(arg).toEqual({ journalOwnerUserId: OWNER, relatedUserId: MEMBER });
  });
  it.each(routeCases.slice(1))("%s只读预览在解析身份/登记前拒绝", async (name, method) => {
    const journalFixture = { resolveLedger52T0JournalReadScope: vi.fn(), [method]: vi.fn() };
    for (const key of ["PREVIEW_READONLY", "FAST_PREVIEW"]) await expect(route(name, journalFixture, { [key]: "true" })({ ctx: { user: { id: 28 } }, input: {} })).rejects.toThrow("只读热预览");
    expect(journalFixture.resolveLedger52T0JournalReadScope).not.toHaveBeenCalled(); expect(journalFixture[method]).not.toHaveBeenCalled();
  });
});

function sourceReader(conn: any) {
  return isolated(`${constants}\n${["getLedger52T0JournalWithdrawalSourceForEdit", "asRows", "normalizeWithdrawalSource"].map(name => declaration(name).getText(journal)).join("\n")}`, "getLedger52T0JournalWithdrawalSourceForEdit", { getDbConnection: vi.fn(async () => conn) });
}
describe("编辑来源只读预取：真实helper与连接池饥饿回归", () => {
  it.each(["principal", "income"] as const)("真实来源helper读取%s，所有者和成员SQL参数完整，无DDL/事务锁", async source => {
    const f = fixture([row(2, "withdrawal", "60", source), principal(2, "90", { user_id: 28 })]); const conn = f.connection();
    expect(await sourceReader(conn)({ journalOwnerUserId: OWNER, relatedUserId: MEMBER, payoutLogId: 2 })).toBe(source);
    expect(conn.execute.mock.calls[0][0]).toContain("SHOW COLUMNS");
    expect(conn.execute.mock.calls[1][1]).toEqual([2, 52, OWNER, MEMBER]);
    for (const [sql] of conn.execute.mock.calls) expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|FOR UPDATE)\b/i);
    expect(conn.beginTransaction).not.toHaveBeenCalled(); expect(writeCalls(conn)).toHaveLength(0);
  });
  it("真实来源helper旧表缺列退回income，空值同样按历史income", async () => {
    for (const hasSource of [false, true]) {
      const conn = fixture([row(2, "withdrawal", "60")], hasSource).connection();
      expect(await sourceReader(conn)({ journalOwnerUserId: OWNER, relatedUserId: MEMBER, payoutLogId: 2 })).toBe("income");
      if (!hasSource) expect(conn.execute.mock.calls[1][0]).toContain("'income' AS withdrawal_source");
    }
  });
  it("真实来源helper不能跨owner/member；无连接明确失败", async () => {
    const conn = fixture([principal(2, "60", { user_id: 28 }), principal(2, "60", { related_user_id: 204 })]).connection();
    await expect(sourceReader(conn)({ journalOwnerUserId: OWNER, relatedUserId: MEMBER, payoutLogId: 2 })).rejects.toThrow("未找到可编辑");
    await expect(sourceReader(null)({ journalOwnerUserId: OWNER, relatedUserId: MEMBER, payoutLogId: 2 })).rejects.toThrow("资金流水来源读取失败");
    expect(writeCalls(conn)).toHaveLength(0);
  });
  it.each(["create", "update-explicit", "update-omitted"])("%s收益cap完成在事务连接申请之前，不在锁内借第二条连接", async operation => {
    const f = fixture([deposit(1, "100"), income(2, "10")]); const conn = f.connection(); const service = api(conn, 100);
    let capFinished = false;
    service.cap.mockImplementationOnce(async () => { await Promise.resolve(); capFinished = true; return { order: 100, commission: 0, shared: 0, total: 100 }; });
    service.getConnection.mockImplementationOnce(async () => {
      if (!capFinished) throw new Error("Income cap attempted after borrowing transaction connection");
      return conn;
    });
    if (operation === "create") await service.createLedger52T0JournalPayoutLog(createInput({ withdrawalSource: "income" }));
    else await service.updateLedger52T0JournalPayoutLog(updateInput({ withdrawalSource: operation === "update-explicit" ? "income" : undefined }));
    expect(service.cap).toHaveBeenCalledTimes(1);
    expect(service.cap.mock.invocationCallOrder[0]).toBeLessThan(service.getConnection.mock.invocationCallOrder[0]);
    expect(service.getConnection.mock.invocationCallOrder[0]).toBeLessThan(conn.beginTransaction.mock.invocationCallOrder[0]);
    if (operation === "update-omitted") {
      expect(service.sourceForEdit).toHaveBeenCalledWith({ journalOwnerUserId: OWNER, relatedUserId: MEMBER, payoutLogId: 2 });
      expect(service.sourceForEdit.mock.invocationCallOrder[0]).toBeLessThan(service.cap.mock.invocationCallOrder[0]);
    } else expect(service.sourceForEdit).not.toHaveBeenCalled();
    lifecycle(conn, true);
  });
  it("省略source的本金编辑不依赖收益且source预取先于tx，锁内仍重读本金", async () => {
    const f = fixture([deposit(1, "100"), principal(2, "60")]); const conn = f.connection(); const service = api(conn);
    service.cap.mockRejectedValue(new Error("收益不可用"));
    await service.updateLedger52T0JournalPayoutLog(updateInput({ withdrawalSource: undefined, amount: "100" }));
    expect(service.sourceForEdit).toHaveBeenCalledWith({ journalOwnerUserId: OWNER, relatedUserId: MEMBER, payoutLogId: 2 });
    expect(service.sourceForEdit.mock.invocationCallOrder[0]).toBeLessThan(service.getConnection.mock.invocationCallOrder[0]);
    expect(service.cap).not.toHaveBeenCalled(); lifecycle(conn, true);
    expect(conn.execute.mock.calls[1][0]).toContain("direction, withdrawal_source");
  });
  it("income省略source编辑cap失败，不借tx不开始事务，不写资金流水", async () => {
    const f = fixture([income(2, "10")]); const conn = f.connection(); const service = api(conn);
    service.cap.mockRejectedValueOnce(new Error("收益事实失败"));
    await expect(service.updateLedger52T0JournalPayoutLog(updateInput({ withdrawalSource: undefined }))).rejects.toThrow("收益事实失败");
    expect(service.sourceForEdit).toHaveBeenCalledTimes(1); expect(service.getConnection).not.toHaveBeenCalled();
    expect(conn.execute).not.toHaveBeenCalled(); expect(conn.beginTransaction).not.toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled(); expect(f.state.rows).toEqual([income(2, "10")]);
  });
});
