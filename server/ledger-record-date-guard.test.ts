import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { TRPCError } from '@trpc/server';
import ts from 'typescript';
import { getBeijingLedgerRecordToday, getLedgerRecordDateError } from '../shared/ledger-record-date';

// Never import db-ledger: its module-level migration can access the real database.
// Extract the three production declarations and execute only with offline bindings.
const source = readFileSync(new URL('./db-ledger.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('db-ledger.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const entryNames = ['addTransaction', 'updateTransaction', 'restoreTransaction'] as const;
function declaration(name: string) {
  const node = ast.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node?.body) throw new Error(`Missing production function: ${name}`);
  return node;
}
const compiled = ts.transpileModule(entryNames.map(name => declaration(name).getText(ast).replace(/^export /, '')).join('\n')
  + '\nglobalThis.entries = { addTransaction, updateTransaction, restoreTransaction };', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const fixedNow = new Date('2026-11-11T08:30:00.000Z');
const today = '2026-11-11';
const future = '2026-11-12';
const past = '2020-01-01';
type Row = Record<string, any>;
type Write = { kind: string; table: string; data: Row; condition?: any };
function table(name: string) {
  return new Proxy({ name } as Row, { get: (target, key) => key === 'name' ? target.name : `${name}.${String(key)}` });
}
function harness(options: { ledgerId?: number; recordDate?: unknown; deletedAt?: string | null; duplicates?: Row[]; member?: boolean } = {}) {
  const ledgerId = options.ledgerId ?? 37;
  const oldRecord = Object.freeze({ id: 901, ledgerId, recordDate: options.recordDate ?? today,
    type: 'income', categoryId: 301, amount: '10', createdBy: 28, description: '原始备注',
    deleted_at: options.deletedAt === undefined ? '2026-11-10T01:00:00.000Z' : options.deletedAt });
  const oldSnapshot = JSON.stringify(oldRecord);
  const duplicates = options.duplicates ?? [];
  const writes: Write[] = [];
  const ledgerRecords = table('ledger_records');
  const ledgerMembers = table('ledger_members');
  const ledgers = table('ledgers');
  const ledgerCategories = table('ledger_categories');
  const membership = options.member === false ? [] : [{ id: 7, role: 'owner' }];
  const select = vi.fn((projection?: Row) => {
    let selected: Row | undefined;
    const result = () => {
      if (selected === ledgerMembers) return membership;
      if (selected === ledgers) return [{ type: 'custom_aa' }];
      if (selected === ledgerRecords) return projection ? duplicates : [oldRecord];
      throw new Error(`Unexpected offline SELECT table: ${selected?.name}`);
    };
    const chain: any = {
      from: (value: Row) => { selected = value; return chain; },
      where: () => chain,
      orderBy: () => chain,
      limit: async () => result(),
      then: (resolve: any, reject: any) => Promise.resolve().then(result).then(resolve, reject),
    };
    return chain;
  });
  const update = vi.fn((target: Row) => {
    expect(target).toBe(ledgerRecords); // No funds/config/stock table writes permitted, even in mocks.
    return { set: (data: Row) => ({ where: async (condition: any) => { writes.push({ kind: 'update', table: target.name, data, condition }); } }) };
  });
  const insert = vi.fn((target: Row) => {
    expect(target).toBe(ledgerRecords);
    return { values: async (data: Row) => { writes.push({ kind: 'insert', table: target.name, data }); return { insertId: 902 }; } };
  });
  const db = { select, update, insert };
  const execute = vi.fn(async (query: string, params: any[] = []) => {
    if (/^SELECT id, ledgerId,/.test(query)) {
      expect(query).toContain("DATE_FORMAT(recordDate, '%Y-%m-%d') AS recordDate");
      expect(params).toEqual([901]);
      return [[oldRecord]];
    }
    if (query.startsWith('SELECT id FROM ledger_members')) {
      expect(params).toEqual([ledgerId, 28]);
      return [membership];
    }
    if (query === 'UPDATE ledger_records SET deleted_at = NULL, deleted_by = NULL WHERE id = ?') {
      expect(params).toEqual([901]);
      writes.push({ kind: 'restore', table: 'ledger_records', data: { deleted_at: null, deleted_by: null } });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Forbidden/unexpected offline SQL: ${query}`);
  });
  const getLedgerDb = vi.fn(async () => db);
  const getDbConnection = vi.fn(async () => ({ execute }));
  const withDatabaseLock = vi.fn(async (_name: string, callback: () => any) => callback());
  const decryptFields = vi.fn(async (_db, _table, row) => row);
  const encryptFields = vi.fn(async (_db, _table, row) => row);
  const insertRecordLog = vi.fn(async () => undefined);
  const checkNeedApproval = vi.fn(async () => ({ needApproval: false }));
  const createApprovalRecords = vi.fn(async () => undefined);
  const op = (name: string) => (...args: any[]) => ({ name, args });
  const context: any = {
    Date, TRPCError, getLedgerRecordDateError, getLedgerDb, getDbConnection, withDatabaseLock,
    ledgerRecords, ledgerMembers, ledgers, ledgerCategories,
    eq: op('eq'), and: op('and'), ne: op('ne'), isNull: op('isNull'), inArray: op('inArray'), desc: op('desc'),
    sql: (parts: TemplateStringsArray, ...args: any[]) => ({ parts: [...parts], args }),
    LEDGER_RECORD_ENCRYPT_FIELDS: ['description'], decryptFields, encryptFields,
    insertRecordLog, checkNeedApproval, createApprovalRecords,
    console: { log: vi.fn(), error: vi.fn() },
  };
  runInNewContext(compiled, context, { timeout: 1000 });
  const add = (date: unknown, overrides: Row = {}) => context.entries.addTransaction({
    ledgerId, userId: 28, type: 'income', amount: 10, categoryId: 301, transactionDate: date, ...overrides,
  });
  const edit = (data: Row = {}) => context.entries.updateTransaction(901, 28, data);
  const restore = () => context.entries.restoreTransaction(901, 28);
  return { add, edit, restore, writes, oldRecord, db, execute, getLedgerDb, getDbConnection,
    withDatabaseLock, decryptFields, encryptFields, insertRecordLog, checkNeedApproval, createApprovalRecords,
    assertUntouched: () => {
      expect(writes).toEqual([]);
      expect(JSON.stringify(oldRecord)).toBe(oldSnapshot);
      expect(insertRecordLog).not.toHaveBeenCalled();
      expect(encryptFields).not.toHaveBeenCalled();
      expect(createApprovalRecords).not.toHaveBeenCalled();
    } };
}
async function expectDateRejection(action: Promise<unknown>) {
  await expect(action).rejects.toBeInstanceOf(TRPCError);
  await expect(action).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('账目日期') });
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(fixedNow); });
afterEach(() => { vi.useRealTimers(); });

describe('37号实际账目北京时间日期纯函数', () => {
  it.each([
    ['2026-11-11T15:59:59.999Z', '2026-11-11'],
    ['2026-11-11T16:00:00.000Z', '2026-11-12'],
    ['2026-12-31T15:59:59.999Z', '2026-12-31'],
    ['2026-12-31T16:00:00.000Z', '2027-01-01'],
  ])('UTC时刻%s对应北京时间日期%s', (now, expected) => {
    expect(getBeijingLedgerRecordToday(new Date(now))).toBe(expected);
  });
  it('以北京时间午夜为允许/禁止边界，而不是服务器本地午夜', () => {
    expect(getLedgerRecordDateError(37, future, new Date('2026-11-11T15:59:59.999Z'))).toContain('不能晚于今天');
    expect(getLedgerRecordDateError(37, future, new Date('2026-11-11T16:00:00.000Z'))).toBeNull();
  });
  it.each([today, past, '2024-02-29'])('今天或历史日期%s允许补录', date => {
    expect(getLedgerRecordDateError(37, date, fixedNow)).toBeNull();
  });
  it('未来日期返回含北京时间今天的友好消息', () => {
    expect(getLedgerRecordDateError(37, future, fixedNow)).toBe(`账目日期不能晚于今天（${today}，北京时间）`);
  });
  it.each(['', '2026-1-01', '2026-02-30', '2025-02-29', '2026-13-01', '2026-00-01',
    '2026-11-11T00:00:00Z', ' 2026-11-11', null, undefined, 20261111, new Date('2026-11-11T00:00:00Z')])(
    '37号拒绝无效或非严格YYYY-MM-DD日期%j', date => {
      expect(getLedgerRecordDateError(37, date, fixedNow)).toBe('请填写有效的账目日期');
    });
  it.each([1, 36, 38, 52, 100])('非37账本%d完全不启用该日期规则', ledgerId => {
    for (const date of [future, '2099-12-31', '', null, undefined]) {
      expect(getLedgerRecordDateError(ledgerId, date, fixedNow)).toBeNull();
    }
  });
});

describe('实际addTransaction离线执行', () => {
  it.each(['income', 'expense', 'transfer'])('37号%s未来日期在取得DB/锁/覆盖前拒绝', async type => {
    const h = harness({ duplicates: [{ id: 100 }, { id: 101 }] });
    await expectDateRejection(h.add(future, { type, overwriteExisting: true }));
    expect(h.getLedgerDb).not.toHaveBeenCalled();
    expect(h.withDatabaseLock).not.toHaveBeenCalled();
    expect(h.checkNeedApproval).not.toHaveBeenCalled();
    h.assertUntouched();
  });
  it.each(['', '2026-02-30', '2026-11-11T00:00:00Z'])('新增无效日期%s也拒绝且不访问DB', async date => {
    const h = harness();
    await expectDateRejection(h.add(date));
    expect(h.getLedgerDb).not.toHaveBeenCalled();
    h.assertUntouched();
  });
  it.each([today, past])('37号允许%s新增并保留日期原值', async date => {
    const h = harness();
    await expect(h.add(date)).resolves.toMatchObject({ success: true, overwritten: false });
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toMatchObject({ kind: 'insert', data: { ledgerId: 37, recordDate: date } });
    expect(h.withDatabaseLock).toHaveBeenCalledOnce();
  });
  it('历史日期明确覆盖仍执行已有覆盖逻辑，不误删独立资金记录', async () => {
    const h = harness({ duplicates: [{ id: 100 }, { id: 101 }] });
    await expect(h.add(past, { overwriteExisting: true })).resolves.toMatchObject({ overwritten: true, id: 100 });
    expect(h.writes).toHaveLength(2);
    expect(h.writes[0].data.recordDate).toBe(past);
    expect(h.writes[1].condition).toEqual({ name: 'inArray', args: ['ledger_records.id', [101]] });
  });
  it.each([1, 52])('非37账本%d仍允许未来实际日期，无37专用锁', async ledgerId => {
    const h = harness({ ledgerId });
    await expect(h.add(future)).resolves.toMatchObject({ success: true });
    expect(h.writes[0].data).toMatchObject({ ledgerId, recordDate: future });
    expect(h.withDatabaseLock).not.toHaveBeenCalled();
  });
  it('北京时间午夜到达时昨天的未来日期立即变为允许', async () => {
    vi.setSystemTime(new Date('2026-11-11T15:59:59.999Z'));
    const h = harness();
    await expectDateRejection(h.add(future));
    h.assertUntouched();
    vi.setSystemTime(new Date('2026-11-11T16:00:00.000Z'));
    await expect(h.add(future)).resolves.toMatchObject({ success: true });
    expect(h.writes[0].data.recordDate).toBe(future);
  });
});

describe('实际updateTransaction读取真实旧记录后校验最终日期', () => {
  it('未来改期即使确认覆盖也在加锁、解密、重复查询及所有写入前拒绝', async () => {
    const h = harness({ duplicates: [{ id: 100 }] });
    await expectDateRejection(h.edit({ transactionDate: future, overwriteExisting: true }));
    expect(h.db.select).toHaveBeenCalledOnce(); // Only the real-record lookup.
    expect(h.withDatabaseLock).not.toHaveBeenCalled();
    expect(h.decryptFields).not.toHaveBeenCalled();
    h.assertUntouched();
  });
  it.each([{ description: '改备注' }, { amount: 99 }, {}, { transactionDate: undefined }])(
    '旧未来记录不修改日期也必须拒绝：%j', async data => {
      const h = harness({ recordDate: future });
      await expectDateRejection(h.edit(data));
      expect(h.db.select).toHaveBeenCalledOnce();
      h.assertUntouched();
    });
  it('伪造data.ledgerId不能绕过旧记录的真实37账本', async () => {
    const h = harness({ recordDate: future });
    await expectDateRejection(h.edit({ ledgerId: 52, description: '伪造账本' }));
    h.assertUntouched();
  });
  it.each([today, past])('可将未来误录纠正为%s而不删除原记录', async date => {
    const h = harness({ recordDate: future });
    await expect(h.edit({ transactionDate: date })).resolves.toMatchObject({ success: true, overwritten: false });
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toMatchObject({ kind: 'update', data: { recordDate: date } });
    expect(h.writes[0].data).not.toHaveProperty('deletedAt');
    expect(h.insertRecordLog).toHaveBeenCalledWith(expect.objectContaining({ ledgerId: 37, fieldName: '日期', newValue: date }));
  });
  it('过去记录只改备注且不改日期仍允许', async () => {
    const h = harness({ recordDate: past });
    await expect(h.edit({ description: '历史补充' })).resolves.toMatchObject({ success: true });
    expect(h.writes[0].data).toEqual({ description: '历史补充' });
  });
  it.each(['', '2026-02-30', '2026-11-11T00:00:00Z'])('编辑无效日期%s拒绝，不利用原代码truthy日期分支绕过', async date => {
    const h = harness();
    await expectDateRejection(h.edit({ transactionDate: date }));
    h.assertUntouched();
  });
  it.each([1, 52])('非37账本%d旧未来日期只改备注仍不受限制', async ledgerId => {
    const h = harness({ ledgerId, recordDate: future });
    await expect(h.edit({ ledgerId: 37, description: '继续允许' })).resolves.toMatchObject({ success: true });
    expect(h.writes[0].data).toEqual({ description: '继续允许' });
    expect(h.withDatabaseLock).not.toHaveBeenCalled();
  });
  it('非37账本改为未来日期仍允许', async () => {
    const h = harness({ ledgerId: 52 });
    await expect(h.edit({ transactionDate: future })).resolves.toMatchObject({ success: true });
    expect(h.writes[0].data.recordDate).toBe(future);
  });
  it('仍要求真实账本成员权限，不因日期有效而绕过', async () => {
    const h = harness({ member: false });
    await expect(h.edit({ description: '无权限' })).rejects.toThrow('您不是该账本的成员');
    h.assertUntouched();
  });
});

describe('实际restoreTransaction禁止恢复未来误录且保留旧记录', () => {
  it('37号未来误录仅读取记录，BAD_REQUEST且不清除删除标记、不写日志', async () => {
    const h = harness({ recordDate: future });
    await expectDateRejection(h.restore());
    expect(h.execute).toHaveBeenCalledOnce();
    h.assertUntouched();
    expect(h.oldRecord.deleted_at).toBe('2026-11-10T01:00:00.000Z');
  });
  it.each([today, past])('37号日期%s恢复允许，即历史账目不受60天记录日期限制', async date => {
    const h = harness({ recordDate: date });
    await expect(h.restore()).resolves.toEqual({ success: true });
    expect(h.writes).toEqual([{ kind: 'restore', table: 'ledger_records', data: { deleted_at: null, deleted_by: null } }]);
    expect(h.insertRecordLog).toHaveBeenCalledWith(expect.objectContaining({ ledgerId: 37, action: 'restore' }));
  });
  it.each([1, 52])('非37账本%d未来记录恢复不变', async ledgerId => {
    const h = harness({ ledgerId, recordDate: future });
    await expect(h.restore()).resolves.toEqual({ success: true });
    expect(h.writes).toHaveLength(1);
  });
  it('仍保留删除超过60天不可恢复的原规则', async () => {
    const h = harness({ recordDate: past, deletedAt: '2026-01-01T00:00:00.000Z' });
    await expect(h.restore()).rejects.toThrow('已超过60天');
    h.assertUntouched();
  });
  it('仍保留恢复成员权限检查', async () => {
    const h = harness({ member: false });
    await expect(h.restore()).rejects.toThrow('您不是该账本的成员');
    h.assertUntouched();
  });
});

describe('生产AST日期防护接线与范围', () => {
  it('校验只接入实际新增/编辑/恢复，不改变账本配置、股票或资金其他入口', () => {
    const guarded: string[] = [];
    for (const statement of ast.statements) {
      if (!ts.isFunctionDeclaration(statement)) continue;
      let found = false;
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'getLedgerRecordDateError') found = true;
        ts.forEachChild(node, visit);
      };
      visit(statement);
      if (found) guarded.push(statement.name!.text);
    }
    expect(guarded.sort()).toEqual([...entryNames].sort());
  });
  it('新增使用传入账本；编辑和恢复使用查询所得真实账本和最终日期', () => {
    const calls = (name: string) => {
      const args: string[][] = [];
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'getLedgerRecordDateError') {
          args.push(node.arguments.map(arg => arg.getText(ast)));
        }
        ts.forEachChild(node, visit);
      };
      visit(declaration(name));
      return args;
    };
    expect(calls('addTransaction')).toEqual([['data.ledgerId', 'data.transactionDate']]);
    expect(calls('updateTransaction')).toEqual([['oldRecord.ledgerId', 'finalTransactionDate']]);
    expect(calls('restoreTransaction')).toEqual([['record.ledgerId', 'record.recordDate']]);
  });
});

// AI employee has a direct INSERT path; isolate executeTask without loading its timers/migrations.
const aiSource = readFileSync(new URL('./db-ai-employee.ts', import.meta.url), 'utf8');
const aiAst = ts.createSourceFile('db-ai-employee.ts', aiSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const executeTaskNode = aiAst.statements.find((statement): statement is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === 'executeTask');
if (!executeTaskNode) throw new Error('Missing production executeTask');
const aiCompiled = ts.transpileModule(executeTaskNode.getText(aiAst) + '\nglobalThis.executeTask = executeTask;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function aiHarness(ledgerId: number) {
  const records: any[][] = [];
  const logs: Array<{ query: string; params: any[] }> = [];
  const execute = vi.fn(async (query: string, params: any[] = []) => {
    if (query.startsWith('SELECT id FROM ledger_members')) return [[{ id: 7 }]];
    if (/^INSERT INTO ledger_records\s/.test(query)) { records.push(params); return [{ insertId: 901 }]; }
    if (/^INSERT INTO ai_employee_task_logs\s/.test(query)) { logs.push({ query, params }); return [{ insertId: 1 }]; }
    throw new Error(`Forbidden/unexpected AI offline SQL: ${query}`);
  });
  const context: any = { Date, TRPCError, getBeijingLedgerRecordToday, getLedgerRecordDateError,
    getDbConnection: vi.fn(async () => ({ execute })), console: { log: vi.fn(), error: vi.fn() } };
  runInNewContext(aiCompiled, context, { timeout: 1000 });
  return { execute, records, logs, run: (action: Row = {}) => context.executeTask(101, ledgerId, 28, {
    summary: '测试', actions: [{ type: 'add_transaction', category_id: 301, amount: 10, ...action }],
  }) };
}
describe('AI实际executeTask日期守卫离线回归', () => {
  it('37号未来日期不执行账目INSERT，原失败日志保存友好原因', async () => {
    const h = aiHarness(37);
    await h.run({ record_date: future });
    expect(h.records).toEqual([]);
    expect(h.execute).toHaveBeenCalledOnce(); // Only existing task-failure log, no members/records reads or writes.
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0].query).toContain("'failed'");
    expect(h.logs[0].params[3]).toContain(`账目日期不能晚于今天（${today}，北京时间）`);
  });
  it.each([today, past])('37号明确日期%s仍允许原始记账逻辑', async date => {
    const h = aiHarness(37);
    await h.run({ record_date: date, amount: 12.5, description: '历史补录' });
    expect(h.records).toEqual([[37, 'expense', 12.5, 301, '历史补录', date, 28]]);
    expect(h.logs[0].query).toContain("'success'");
  });
  it('37号无日期时默认北京时间今天，非37号维持UTC今天', async () => {
    vi.setSystemTime(new Date('2026-11-11T16:05:00.000Z'));
    const a = aiHarness(37), b = aiHarness(52);
    await a.run(); await b.run();
    expect(a.records[0][5]).toBe('2026-11-12');
    expect(b.records[0][5]).toBe('2026-11-11');
  });
  it('非37号明确未来日期保持允许', async () => {
    const h = aiHarness(52);
    await h.run({ record_date: future });
    expect(h.records[0][5]).toBe(future);
  });
  it('随机范围金额不改变：固定范围仍按原公式生成', async () => {
    const h = aiHarness(37);
    await h.run({ record_date: past, amount_min: 17, amount_max: 17 });
    expect(h.records[0][2]).toBe(17);
  });
  it('实际ledgerRecords的Drizzle DATE为string模式，旧日期不会变成Date误拒绝', () => {
    const schemaSource = readFileSync(new URL('../drizzle/schema.ts', import.meta.url), 'utf8');
    const schemaAst = ts.createSourceFile('schema.ts', schemaSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const statement = schemaAst.statements.find(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === 'ledgerRecords'));
    expect(statement?.getText(schemaAst)).toMatch(/recordDate:\s*date\(\{\s*mode:\s*'string'\s*\}\)/);
  });
});
