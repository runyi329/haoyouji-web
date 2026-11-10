import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { transformSync } from 'esbuild';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { updateLedger37InitialBalances } from './ledger37-initial-balances';
import { assertOrdinaryObservationAllocationChange, ordinaryTagObservationKey } from '../shared/ordinary-tag-observation';
import { readTagVisible } from '../shared/tag-visibility';

// 仅import无IO的真实服务/共享函数。巨型routers/db-ledger只读AST，不执行初始化；
// 所有连接和ORM依赖是内存fake，未知SQL/资金依赖一律抛错，没有真实网络请求。
const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const routerAst = ts.createSourceFile('routers.ts', routerSource, ts.ScriptTarget.Latest, true);
const dbSource = readFileSync(new URL('./db-ledger.ts', import.meta.url), 'utf8');
const dbAst = ts.createSourceFile('db-ledger.ts', dbSource, ts.ScriptTarget.Latest, true);
function declaration(ast: ts.SourceFile, name: string) {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!node) throw new Error(`生产函数不存在: ${name}`);
  return node.getText(ast).replace(/^export /, '');
}
function compile(source: string, deps: Record<string, unknown>) {
  const code = transformSync(source, { loader: 'ts', target: 'es2022' }).code;
  return new Function(...Object.keys(deps), code)(...Object.values(deps));
}
function routeNode(node: ts.Node, name = 'adminSetMemberInitialBalances'): ts.PropertyAssignment | undefined {
  if (ts.isPropertyAssignment(node) && node.name.getText(routerAst) === name) return node;
  return ts.forEachChild(node, child => routeNode(child, name));
}
const productionRoute = routeNode(routerAst);
if (!productionRoute) throw new Error('生产管理员保存入口不存在');
const observationRoute = routeNode(routerAst, 'adminSetOrdinaryTagObservationConfig');
function inputSchema(node: ts.Node): ts.Expression | undefined {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'input') return node.arguments[0];
  return ts.forEachChild(node, inputSchema);
}
const observationSchemaNode = observationRoute && inputSchema(observationRoute);
if (!observationSchemaNode) throw new Error('生产普通观察schema不存在');
const observationSchema = compile(`return ${observationSchemaNode.getText(routerAst)};`, { z }) as z.ZodTypeAny;

const TAG = '普通';
const TARGET = 201;
const ACTOR = 100;
const OBSERVATION = { enabled: true, initialAmount: 1234, ratio: 50, startDate: '2026-11-02', pauseDate: null };
const category = (id: number, name: string, mode = 'manual_balance', parentId: number | null = null, isDefault = 0) =>
  ({ id, ledgerId: 37, name, parentId, isDefault, accountingMode: mode });
const clearPatch = (name = TAG): Record<string, number | string> =>
  ({ [name]: 0, [`${name}__ratio`]: 0, [`${name}__targetAmount`]: 0, [`${name}__startDate`]: '' });
const payload = (name = TAG) => ({ ledgerId: 37, targetUserId: TARGET, balances: clearPatch(name), migratedMarginNoteIds: [] });

// 模拟JSON_SET/REMOVE时保留未修改value的原文token，绝不parse后stringify旧数值。
// 这验证真实服务使用的SQL/参数，不声称代替真实MySQL运行集成测试。
function rawFields(raw: string | null): Map<string, string> {
  const fields = new Map<string, string>();
  if (raw === null || raw === '') return fields;
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('fixture requires JSON object');
  const stringEnd = (start: number): number => {
    let end = start + 1;
    while (end < raw.length) {
      if (raw[end] === '\\') end += 2;
      else if (raw[end++] === '"') return end;
    }
    throw new Error('fixture invalid string');
  };
  let i = raw.indexOf('{') + 1;
  while (i < raw.length) {
    while (/\s/.test(raw[i] ?? '') && i < raw.length) i++;
    if (raw[i] === '}') break;
    const keyEnd = stringEnd(i);
    const key = JSON.parse(raw.slice(i, keyEnd));
    i = raw.indexOf(':', keyEnd) + 1;
    const start = i;
    let depth = 0;
    while (i < raw.length) {
      if (raw[i] === '"') { i = stringEnd(i); continue; }
      if (raw[i] === '{' || raw[i] === '[') depth++;
      else if (raw[i] === '}' || raw[i] === ']') { if (depth === 0) break; depth--; }
      else if (raw[i] === ',' && depth === 0) break;
      i++;
    }
    fields.set(key, raw.slice(start, i));
    if (raw[i] === '}') break;
    i++;
  }
  return fields;
}
function fixture(raw: string | null = '{}') {
  const state = {
    raw, categories: [category(10, TAG)], role: 'admin' as string | null,
    memberExists: true, failUpdate: false, affectedRows: 1,
    beforeMember: undefined as undefined | (() => void),
  };
  const log: Array<{ sql: string; values: any[] }> = [];
  let snapshot = raw;
  const tx = {
    beginTransaction: vi.fn(async () => { snapshot = state.raw; }),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => { state.raw = snapshot; }),
    release: vi.fn(),
    execute: vi.fn(async (sql: string, values: any[]) => {
      log.push({ sql, values });
      if (sql === 'SELECT id FROM ledgers WHERE id = ? FOR UPDATE') {
        expect(values).toEqual([37]); return [[{ id: 37 }], []];
      }
      if (/^SELECT id, ledgerId, name, parentId, isDefault, accounting_mode AS accountingMode/.test(sql)) {
        expect(sql).toContain('ORDER BY id FOR UPDATE'); expect(values).toEqual([37]);
        return [state.categories, []];
      }
      if (/^SELECT id, initial_balances FROM ledger_members/.test(sql)) {
        expect(sql).toContain('FOR UPDATE'); expect(values).toEqual([37, TARGET]);
        state.beforeMember?.();
        snapshot = state.raw;
        return [state.memberExists ? [{ id: 2, initial_balances: state.raw }] : [], []];
      }
      if (/^UPDATE ledger_members SET initial_balances = /.test(sql)) {
        expect(sql).toMatch(/JSON_SET|JSON_REMOVE/);
        expect(sql).toContain('WHERE id = ? AND ledgerId = ? AND userId = ?');
        expect(values.slice(-3)).toEqual([2, 37, TARGET]);
        if (state.failUpdate) throw new Error('offline update failed');
        if (state.affectedRows !== 1) return [{ affectedRows: state.affectedRows }, []];
        const fields = rawFields(state.raw);
        const setArgs = sql.match(/JSON_SET\(COALESCE\(NULLIF\(initial_balances, ''\), JSON_OBJECT\(\)\), ([? ,]+)\)/)?.[1];
        const setPairs = setArgs ? (setArgs.match(/\?/g) ?? []).length / 2 : 0;
        const args = values.slice(0, -3);
        for (let j = 0; j < setPairs * 2; j += 2) fields.set(JSON.parse(args[j].slice(2)), JSON.stringify(args[j + 1]));
        for (const path of args.slice(setPairs * 2)) fields.delete(JSON.parse(path.slice(2)));
        state.raw = `{${Array.from(fields).map(([key, value]) => `${JSON.stringify(key)}:${value}`).join(',')}}`;
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`禁止真实/非白名单SQL: ${sql}`);
    }),
  };
  const forbiddenDb = vi.fn(() => { throw new Error('禁止旧ORM写入/备注删除/真实数据库'); });
  const ormChain: any = { from: () => ormChain, where: () => ormChain,
    limit: async () => state.memberExists ? [{ initialBalances: state.raw }] : [] };
  const readOrm = { select: vi.fn(() => ormChain) };
  const symbols = { ledgerMembers: { id: 'id', ledgerId: 'ledgerId', userId: 'userId', initialBalances: 'initialBalances' },
    eq: (...v: any[]) => v, and: (...v: any[]) => v };
  const getOld = compile(declaration(dbAst, 'getMyInitialBalances') + '\nreturn getMyInitialBalances;', {
    ...symbols, getLedgerDb: async () => readOrm,
  });
  const service = vi.fn(updateLedger37InitialBalances);
  const transactionConnection = vi.fn(async () => tx);
  const updateEntry = compile(declaration(dbAst, 'updateMyInitialBalances')
    .replace("await import('./db')", 'await mockedDbModule()')
    .replace("await import('./ledger37-initial-balances')", 'await mockedServiceModule()')
    + '\nreturn updateMyInitialBalances;', {
      ...symbols, getLedgerDb: forbiddenDb,
      mockedDbModule: async () => ({ getDbTransactionConnection: transactionConnection }),
      mockedServiceModule: async () => ({ updateLedger37InitialBalances: service }),
    });
  const dbLedger = { getMyInitialBalances: getOld,
    getLedgerCategories: vi.fn(async () => state.categories),
    getUserMembership: vi.fn(async () => state.role ? { role: state.role } : null),
    updateMyInitialBalances: vi.fn(updateEntry),
  };
  const impact = vi.fn(async () => ({ hasFinancialRecords: true, impactHash: 'a'.repeat(64),
    dividend: { recordCount: 3 }, margin: { recordCount: 2 }, walletHolds: { recordCount: 1 } }));
  const helpers = ['readLedger37NonNegativeNumber', 'sameLedger37Number', 'assertLedger37AllocationTripletOnChange',
    'assertLedgerMemberTagHideAcknowledgements', 'requireLedger52Creator']
    .map(name => declaration(routerAst, name)).join('\n')
    .replace("await import('../shared/ordinary-tag-observation')", 'await mockedObservationModule()');
  // 保留真实zod input schema并实际parse请求，不只绕过schema调用回调。
  const protectedProcedure = { input: (schema: z.ZodTypeAny) => ({
    mutation: (fn: any) => (args: any) => fn({ ...args, input: schema.parse(args.input) }),
  }) };
  const handler = compile(helpers + '\nreturn ({' + productionRoute!.getText(routerAst) + '}).adminSetMemberInitialBalances;', {
    protectedProcedure, z, TRPCError, dbLedger, readTagVisible, LEDGER_37_ID: 37, LEDGER_52_ID: 52,
    mockedObservationModule: async () => ({ assertOrdinaryObservationAllocationChange }),
    isLedger52Creator: forbiddenDb, getLedgerMemberTagHideImpact: impact, getLedgerDb: forbiddenDb,
    sql: forbiddenDb,
  });
  const assertTriplet = compile(helpers + '\nreturn assertLedger37AllocationTripletOnChange;', {
    TRPCError, dbLedger, LEDGER_37_ID: 37,
    mockedObservationModule: async () => ({ assertOrdinaryObservationAllocationChange }),
  });
  return { state, tx, log, forbiddenDb, service, dbLedger, impact, transactionConnection,
    invoke: (input: any = payload()) => handler({ ctx: { user: { id: ACTOR } }, input }),
    assertTriplet: (balances: Record<string, number | string>) => assertTriplet({ targetUserId: TARGET, actorUserId: ACTOR, balances }),
    saved: () => JSON.parse(state.raw!),
    writes: () => log.filter(({ sql }) => /^UPDATE/.test(sql)),
  };
}

function retainedFixture() {
  return {
    普通: 1000, 普通__ratio: 50, 普通__targetAmount: 500, 普通__startDate: '2026-01-01',
    普通__visible: 1, __tagVisibilityDefault: 0,
    普通__margin: '199.123456789012345678901', 普通__marginCoin: 'USDT',
    普通__marginCreatedAt: '2026-01-02', 普通__marginNotes: '保留旧备注',
    普通__margins: JSON.stringify([{ id: 'hold_9', source: 'wallet_hold', holdId: 9, amount: '200', coin: 'CNY',
      releaseRecords: [{ id: 'r1', amount: '10' }], notes: [{ id: 'legacy_note_7', content: '保留迁入备注' }] }]),
    普通__pauseDate: '2026-10-10', 普通__endDate: '2026-12-12',
    普通__pauseHistory: JSON.stringify([{ pauseDate: '2026-09-01', resumeDate: '2026-09-05' },
      { pauseDate: '2026-10-10', pauseSource: 'tag_global', pausedBy: 100 }]),
    [ordinaryTagObservationKey(TAG)]: JSON.stringify(OBSERVATION),
    其他: '900719925474099312345', 其他__ratio: '12.123456789012345678901',
    其他__targetAmount: '旧的不完整配置', 其他__startDate: '2026-07-01',
    其他__margins: '[{"id":"other","amount":"99"}]', 其他__pauseHistory: '[{"pauseDate":"2026-05-01"}]',
    alias: '保留别名', unknownHistory: { nested: ['a', 'b'] },
  };
}

describe('37普通标签三联动场外杠杆：提取生产函数，完全离线', () => {
  it.each([125, 200])('%s%%按公式通过，即使另一普通标签超过100也不汇总限制', async ratio => {
    const f = fixture(JSON.stringify({ 其他: 1000, 其他__ratio: 200, 其他__targetAmount: 2000 }));
    f.state.categories.push(category(11, '其他'));
    await expect(f.assertTriplet({ 普通: 1000, 普通__ratio: ratio, 普通__targetAmount: 1000 * ratio / 100 })).resolves.toBeUndefined();
    expect(f.dbLedger.getLedgerCategories).toHaveBeenCalledWith(37, ACTOR, undefined, null);
    expect(f.log).toEqual([]); expect(f.transactionConnection).not.toHaveBeenCalled();
  });
  it('部分patch继承旧初始金额，但比例和实际权益仍须符合公式', async () => {
    const f = fixture('{"普通":1000,"普通__ratio":50,"普通__targetAmount":500}');
    await expect(f.assertTriplet({ 普通__ratio: 125, 普通__targetAmount: 1250 })).resolves.toBeUndefined();
    await expect(f.assertTriplet({ 普通__ratio: 200 })).rejects.toThrow('实际权益必须等于');
  });
  it.each([
    [1000, -1, 0], [1000, NaN, 0], [1000, Infinity, 0], [1000, 125, 1000],
    [Number.MAX_VALUE, 200, Number.MAX_VALUE], [1000, 200, Infinity],
  ])('拒绝非法或溢出的三联动 %s/%s/%s', async (amount, ratio, target) => {
    const f = fixture();
    await expect(f.assertTriplet({ 普通: amount, 普通__ratio: ratio, 普通__targetAmount: target })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(f.log).toEqual([]); expect(f.transactionConnection).not.toHaveBeenCalled();
  });
  it('观察开启即使参考比例125%，仍拒绝正真实份额并允许全零', async () => {
    const f = fixture(JSON.stringify({ [ordinaryTagObservationKey(TAG)]: JSON.stringify({ ...OBSERVATION, ratio: 125 }) }));
    await expect(f.assertTriplet({ 普通: 1000, 普通__ratio: 200, 普通__targetAmount: 2000 })).rejects.toThrow('先关闭观察');
    await expect(f.assertTriplet({ 普通: 0, 普通__ratio: 0, 普通__targetAmount: 0 })).resolves.toBeUndefined();
  });
  it('未触及的非法旧数据不阻塞日期维护且不迁移', async () => {
    const raw = '{"普通":1000,"普通__ratio":200,"普通__targetAmount":"legacy"}';
    const f = fixture(raw);
    await expect(f.assertTriplet({ 普通__startDate: '2026-11-03' })).resolves.toBeUndefined();
    expect(f.state.raw).toBe(raw); expect(f.log).toEqual([]);
  });
  it.each(['accountingMode', 'accounting_mode'])('股票标签由独立实股校验负责，普通函数跳过%s', async modeKey => {
    const f = fixture();
    f.state.categories = [{ ...category(11, 'R1', modeKey === 'accountingMode' ? 'stock_portfolio' : 'manual_balance'), [modeKey]: 'stock_portfolio' }];
    await expect(f.assertTriplet({ R1: 1000, R1__ratio: 200, R1__targetAmount: 1 })).resolves.toBeUndefined();
    expect(f.log).toEqual([]);
  });
  it.each([0, 125, 200, 999])('生产普通观察路由schema允许非负有限比例%s', ratio => {
    const input = { ledgerId: 37, categoryId: 10, targetUserId: TARGET, config: { ...OBSERVATION, ratio } };
    expect(observationSchema.parse(input)).toEqual(input);
  });
  it.each([-1, NaN, Infinity, -Infinity])('生产普通观察路由schema仍拒绝非法比例%s', ratio => {
    expect(() => observationSchema.parse({ ledgerId: 37, categoryId: 10, targetUserId: TARGET, config: { ...OBSERVATION, ratio } })).toThrow();
  });
  it('观察schema仍限37号、正成员ID和严格观察配置，不放行其他账本', () => {
    const input = { ledgerId: 37, categoryId: 10, targetUserId: TARGET, config: { ...OBSERVATION, ratio: 125 } };
    for (const patch of [{ ledgerId: 52 }, { targetUserId: 0 }, { categoryId: 0 }, { config: { ...input.config, walletBalance: 1 } }]) {
      expect(() => observationSchema.parse({ ...input, ...patch })).toThrow();
    }
  });
});

describe('37普通标签独立清空：真实路由校验→真实委托→真实事务服务（完全离线）', () => {
  it('严格四键0/0/0/空日期接受；旧普通标签、保证金、暂停history、观察与可见性完整保留', async () => {
    const before = retainedFixture(); const f = fixture(JSON.stringify(before));
    f.state.categories.push(category(11, '其他'));
    expect(await f.invoke()).toEqual({ success: true });
    expect(f.saved()).toEqual({ ...before, ...clearPatch() });
    expect(f.service).toHaveBeenCalledWith(f.tx, TARGET, clearPatch());
    expect(f.writes()).toHaveLength(1);
    expect(f.writes()[0].sql).not.toContain('JSON_REMOVE');
    expect(f.writes()[0].values).toEqual(['$."普通"', 0, '$."普通__ratio"', 0,
      '$."普通__targetAmount"', 0, '$."普通__startDate"', '', 2, 37, TARGET]);
    expect(f.impact).not.toHaveBeenCalled(); expect(f.forbiddenDb).not.toHaveBeenCalled();
    expect(f.tx.commit).toHaveBeenCalledOnce(); expect(f.tx.release).toHaveBeenCalledOnce();
    expect(f.log.slice(0, 3).map(({ sql }) => sql.match(/FROM (\w+)/)![1])).toEqual(['ledgers', 'ledger_categories', 'ledger_members']);
    expect(f.log.every(({ sql }) => !/\b(?:wallet|users|ledger_records|balance_history|dividend_records|INSERT|DELETE|CREATE|ALTER|DROP)\b/i.test(sql))).toBe(true);
  });
  it.each([true, false])('观察enabled=%s仍接受全0，观察专用配置不变', async enabled => {
    const config = JSON.stringify({ ...OBSERVATION, enabled });
    const f = fixture(JSON.stringify({ 普通: 1000, 普通__ratio: 50, 普通__targetAmount: 500,
      [ordinaryTagObservationKey(TAG)]: config }));
    await f.invoke();
    expect(f.saved()).toMatchObject({ ...clearPatch(), [ordinaryTagObservationKey(TAG)]: config });
  });
  it('预检后观察并发开启：锁下读取最新观察，全0仍通过且保留最新配置', async () => {
    const f = fixture('{"普通":1000,"普通__ratio":50,"普通__targetAmount":500}');
    f.state.beforeMember = () => { f.state.raw = JSON.stringify({ 普通: 1000, 普通__ratio: 0, 普通__targetAmount: 0,
      [ordinaryTagObservationKey(TAG)]: JSON.stringify(OBSERVATION), latestHistory: 'keep' }); };
    await f.invoke();
    expect(f.saved()).toEqual({ ...clearPatch(), [ordinaryTagObservationKey(TAG)]: JSON.stringify(OBSERVATION), latestHistory: 'keep' });
  });
  it.each([null, ''])('SQL未配置值%j可保存，仅生成四键', async raw => {
    const f = fixture(raw); await f.invoke(); expect(f.saved()).toEqual(clearPatch());
    expect(f.tx.commit).toHaveBeenCalledOnce();
  });
  it.each(['broken', '{"普通":', 'null', '[]', '123', '"text"', '   '])('坏/非对象JSON %s 必须拒绝且原文不变', async raw => {
    const f = fixture(raw); await expect(f.invoke()).rejects.toThrow();
    expect(f.state.raw).toBe(raw); expect(f.writes()).toHaveLength(0); expect(f.tx.commit).not.toHaveBeenCalled();
    // JSON文本null可能被旧读取器返回null，在路由预检就拒绝；其余到事务严格校验再回滚。
    if (f.transactionConnection.mock.calls.length) {
      expect(f.tx.rollback).toHaveBeenCalledOnce(); expect(f.tx.release).toHaveBeenCalledOnce();
    }
  });
  it('SQL参数增量patch保留其它tag超大整数、高精度小数和嵌套原始token', async () => {
    const raw = '{"普通":1000,"普通__ratio":50,"普通__targetAmount":500,"其他":900719925474099312345,"其他__ratio":0.123456789012345678901,"nested":{"n":900719925474099312345,"d":0.123456789012345678901}}';
    const f = fixture(raw); f.state.categories.push(category(11, '其他'));
    const before = rawFields(raw); await f.invoke(); const after = rawFields(f.state.raw);
    for (const key of ['其他', '其他__ratio', 'nested']) expect(after.get(key)).toBe(before.get(key));
    expect(f.writes()[0].values).not.toContain(JSON.stringify(JSON.parse(raw)));
  });
  it.each(['owner', 'admin'])('账本%s获准执行', async role => {
    const f = fixture(); f.state.role = role; await expect(f.invoke()).resolves.toEqual({ success: true });
  });
  it.each(['member', null])('无管理员权限%s在写连接前拒绝', async role => {
    const f = fixture(); f.state.role = role;
    await expect(f.invoke()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.transactionConnection).not.toHaveBeenCalled(); expect(f.service).not.toHaveBeenCalled();
  });
  it('只清空初始金额不是合法全0方案，会被三元组校验拒绝', async () => {
    const f = fixture('{"普通":1000,"普通__ratio":50,"普通__targetAmount":500}');
    await expect(f.invoke({ ...payload(), balances: { 普通: 0, 普通__startDate: '' } })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(f.writes()).toHaveLength(0);
  });
  it('观察开启时ratio空字符串不是显式零，会被真实观察守卫拒绝', async () => {
    const f = fixture(JSON.stringify(retainedFixture()));
    await expect(f.invoke({ ...payload(), balances: { ...clearPatch(), 普通__ratio: '' } })).rejects.toThrow('先关闭观察');
    expect(f.writes()).toHaveLength(0);
  });
  it('误带visible:0会触发隐藏账务确认，四键入口不可复用全量草稿payload', async () => {
    const f = fixture(JSON.stringify(retainedFixture()));
    await expect(f.invoke({ ...payload(), balances: { ...clearPatch(), 普通__visible: 0 } })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(f.impact).toHaveBeenCalledOnce(); expect(f.writes()).toHaveLength(0);
  });
  it('误带非空备注迁移IDs会在余额保存后进入旧备注DB分支；必须固定[]', async () => {
    const f = fixture();
    await expect(f.invoke({ ...payload(), migratedMarginNoteIds: [7] })).rejects.toThrow('禁止旧ORM');
    expect(f.tx.commit).toHaveBeenCalledOnce(); expect(f.forbiddenDb).toHaveBeenCalledOnce();
  });
  it.each(['update', 'affectedRows'])('保存%s失败回滚、释放且不报告成功', async failure => {
    const original = JSON.stringify(retainedFixture()); const f = fixture(original);
    f.state.failUpdate = failure === 'update'; f.state.affectedRows = failure === 'affectedRows' ? 0 : 1;
    await expect(f.invoke()).rejects.toThrow();
    expect(f.state.raw).toBe(original); expect(f.tx.rollback).toHaveBeenCalledOnce();
    expect(f.tx.release).toHaveBeenCalledOnce(); expect(f.tx.commit).not.toHaveBeenCalled();
  });
});

describe('已确认的部署阻断/并发边界：仅记录现状，不修改服务端或添加改名迁移', () => {
  it('当前服务会误删所有其它顶层股票tag旧三键，不能声称严格仅四键清空', async () => {
    const prior = { ...retainedFixture(), 股票: 9999, 股票__ratio: 60, 股票__targetAmount: 5999.4,
      股票__startDate: '2026-01-01', 股票__margin: '200', 股票__pauseHistory: '[{"pauseDate":"2026-01-02"}]',
      股票__ordinaryObservation: 'keep', 子股票: 123, 子股票__ratio: 20, 子股票__targetAmount: 24.6 };
    const f = fixture(JSON.stringify(prior));
    f.state.categories.push(category(11, '股票', 'stock_portfolio'), category(12, '子股票', 'stock_portfolio', 11));
    await f.invoke();
    const expected: Record<string, unknown> = { ...prior, ...clearPatch() };
    delete expected.股票; delete expected.股票__ratio; delete expected.股票__targetAmount;
    expect(f.saved()).toEqual(expected);
    expect(f.saved()).not.toEqual({ ...prior, ...clearPatch() });
    expect(f.writes()[0].sql).toContain('JSON_REMOVE(JSON_SET(');
    expect(f.writes()[0].values.slice(-6, -3)).toEqual(['$."股票"', '$."股票__ratio"', '$."股票__targetAmount"']);
    expect(f.impact).not.toHaveBeenCalled(); expect(f.forbiddenDb).not.toHaveBeenCalled();
  });
  it('改名已提交后旧name四键仍被接受并新增旧孤立键，未清到新标签配置', async () => {
    const current = { 新名: 1000, 新名__ratio: 50, 新名__targetAmount: 500, 新名__startDate: '2026-01-01' };
    const f = fixture(JSON.stringify(current)); f.state.categories = [category(10, '新名')];
    await f.invoke(); expect(f.saved()).toEqual({ ...current, ...clearPatch() });
  });
  it('特殊标签名四键用JSON路径参数安全保存，不拼接名称进SQL', async () => {
    const name = 'A".B\\C'; const f = fixture(); f.state.categories = [category(10, name)];
    await f.invoke(payload(name)); expect(f.saved()).toEqual(clearPatch(name));
    expect(f.writes()[0].sql).not.toContain(name);
    expect(f.writes()[0].values[0]).toBe(`$.${JSON.stringify(name)}`);
  });
});
