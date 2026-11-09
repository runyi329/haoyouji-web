import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { transformSync } from 'esbuild';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateLedger37InitialBalances } from './ledger37-initial-balances';
import { ordinaryTagObservationKey } from '../shared/ordinary-tag-observation';

const mocks = vi.hoisted(() => ({ getDbConnection: vi.fn() }));
// 不加载真实db、巨型router、定时器或DDL；所有SQL都只进入下面的白名单fake。
vi.mock('./db', () => ({ getDbConnection: mocks.getDbConnection }));
import { adminSetOrdinaryTagObservationConfig } from './ordinary-tag-observation';

const CONFIG = { enabled: true, initialAmount: 1000, ratio: 50, startDate: '2026-11-02', pauseDate: null };
const ADMIN = { ledgerId: 37, categoryId: 10, targetUserId: 201, actorUserId: 100, config: CONFIG };
const observationKey = ordinaryTagObservationKey('普通');
const category = (id: number, name: string, mode = 'manual_balance', parentId: number | null = null, isDefault = 0) =>
  ({ id, ledgerId: 37, name, parentId, isDefault, accountingMode: mode });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
class RowLock {
  owner: object | null = null;
  waiters: Array<() => void> = [];
  async acquire(owner: object) {
    while (this.owner && this.owner !== owner) await new Promise<void>(r => this.waiters.push(r));
    this.owner = owner;
  }
  release(owner: object) {
    if (this.owner !== owner) return;
    this.owner = null;
    this.waiters.splice(0).forEach(r => r());
  }
}
// 模拟MySQL原子JSON patch，仅替换指定顶层值token；未改旧值不经JS数字序列化。
function rawFields(raw: string | null): Map<string, string> {
  const result = new Map<string, string>();
  if (raw === null || raw === '') return result;
  JSON.parse(raw); // 仅校验；值token直接保留原文。
  let i = raw.indexOf('{') + 1;
  const stringEnd = (start: number) => {
    let end = start + 1;
    while (end < raw.length) {
      if (raw[end] === '\\') end += 2;
      else if (raw[end++] === '"') return end;
    }
    throw new Error('invalid fixture string');
  };
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
    result.set(key, raw.slice(start, i));
    if (raw[i] === '}') break;
    i++;
  }
  return result;
}
function fixture(raw: string | null = '{}') {
  const state = {
    raw, categories: [category(10, '普通')], ledgerExists: true, memberExists: true,
    failUpdate: false, failCommit: false, failRollback: false, affectedRows: 1,
    beforeMember: null as null | (() => Promise<void>),
    afterMember: null as null | (() => Promise<void>),
  };
  const ledgerLock = new RowLock(), memberLock = new RowLock();
  const sqlLog: Array<{ owner: string; sql: string; values: any[] }> = [];
  let serial = 0;
  function connection() {
    const name = `connection${++serial}`;
    let inTransaction = false, changed = false, snapshot: string | null = null;
    const conn = {
      beginTransaction: vi.fn(async () => { inTransaction = true; }),
      commit: vi.fn(async () => {
        if (state.failCommit) throw new Error('commit failed');
        inTransaction = false; ledgerLock.release(conn); memberLock.release(conn);
      }),
      rollback: vi.fn(async () => {
        if (changed) state.raw = snapshot;
        inTransaction = false; ledgerLock.release(conn); memberLock.release(conn);
        if (state.failRollback) throw new Error('rollback failed');
      }),
      release: vi.fn(() => { ledgerLock.release(conn); memberLock.release(conn); }),
      execute: vi.fn(async (sql: string, values: any[]) => {
        sqlLog.push({ owner: name, sql, values });
        if (/SELECT id FROM ledgers/.test(sql)) {
          expect(sql).toContain('FOR UPDATE'); expect(values).toEqual([37]);
          await ledgerLock.acquire(conn);
          return [state.ledgerExists ? [{ id: 37 }] : [], []];
        }
        if (/FROM ledger_categories/.test(sql)) {
          if (sql.includes('FOR UPDATE')) {
            expect(ledgerLock.owner).toBe(conn); expect(sql).toContain('ORDER BY id');
            await state.beforeMember?.();
          }
          return [state.categories.filter(c => c.ledgerId === values[0] && (values.length === 1 || c.id === values[1])), []];
        }
        if (/FROM ledger_members m/.test(sql)) {
          if (values[1] === 100) return [[{ id: 1, ledgerId: 37, userId: 100, role: 'owner', memberType: 'real', initialBalances: '{}' }], []];
          return [state.memberExists ? [{ id: 2, ledgerId: 37, userId: 201, role: 'member', memberType: 'real', initialBalances: state.raw }] : [], []];
        }
        if (/SELECT id, initial_balances FROM ledger_members/.test(sql)) {
          expect(ledgerLock.owner).toBe(conn); expect(sql).toContain('FOR UPDATE'); expect(values).toEqual([37, 201]);
          await memberLock.acquire(conn);
          snapshot = state.raw;
          await state.afterMember?.();
          return [state.memberExists ? [{ id: 2, initial_balances: state.raw }] : [], []];
        }
        if (/^\s*UPDATE ledger_members/.test(sql)) {
          expect(sql).toMatch(/JSON_SET|JSON_REMOVE/);
          await memberLock.acquire(conn);
          try {
            if (state.failUpdate) throw new Error('update failed');
            if (state.affectedRows !== 1) return [{ affectedRows: state.affectedRows }, []];
            const fields = rawFields(state.raw);
            const data = values.slice(0, -3);
            const setArguments = sql.match(/JSON_SET\(COALESCE\(NULLIF\(initial_balances, ''\), JSON_OBJECT\(\)\), ([? ,]+)\)/)?.[1];
            const setPairs = setArguments ? (setArguments.match(/\?/g) ?? []).length / 2 : 0;
            for (let i = 0; i < setPairs * 2; i += 2) fields.set(JSON.parse(data[i].slice(2)), JSON.stringify(data[i + 1]));
            for (const path of data.slice(setPairs * 2)) fields.delete(JSON.parse(path.slice(2)));
            state.raw = `{${Array.from(fields).map(([key, value]) => `${JSON.stringify(key)}:${value}`).join(',')}}`;
            changed = true;
            return [{ affectedRows: 1 }, []];
          } finally {
            if (!inTransaction) memberLock.release(conn);
          }
        }
        throw new Error(`禁止未白名单SQL: ${sql}`);
      }),
    };
    return conn;
  }
  const tx = connection();
  const pooled = connection();
  mocks.getDbConnection.mockResolvedValue(pooled);
  return { state, tx, pooled, connection, sqlLog, ledgerLock, memberLock,
    saved: () => JSON.parse(state.raw!), writes: () => sqlLog.filter(({ sql }) => /^\s*UPDATE/.test(sql)) };
}

// 提取真实db-ledger函数，动态import替换为离线依赖，不导入整个生产模块。
const dbSource = readFileSync(new URL('./db-ledger.ts', import.meta.url), 'utf8');
const dbAst = ts.createSourceFile('db-ledger.ts', dbSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaration = dbAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'updateMyInitialBalances')!;
const dbCode = transformSync(declaration.getText(dbAst).replace(/^export /, '')
  .replace("await import('./db')", 'await mockedDbModule()')
  .replace("await import('./ledger37-initial-balances')", 'await mockedServiceModule()')
  + '\nreturn updateMyInitialBalances;', { loader: 'ts', target: 'es2022' }).code;
function entry(f: ReturnType<typeof fixture>, service = vi.fn(updateLedger37InitialBalances)) {
  const where = vi.fn(async () => undefined), set = vi.fn(() => ({ where }));
  const rows = [{ id: 2, initialBalances: '{"legacy":123,"alias":"old"}' }];
  const chain: any = { from: () => chain, where: () => chain, limit: async () => rows };
  const db = { select: vi.fn(() => chain), update: vi.fn(() => ({ set })) };
  const getLedgerDb = vi.fn(async () => db);
  const getDbTransactionConnection = vi.fn(async () => f.tx);
  const deps = { getLedgerDb, ledgerMembers: { id: 'id', ledgerId: 'ledgerId', userId: 'userId', initialBalances: 'initialBalances' },
    eq: (...v: any[]) => v, and: (...v: any[]) => v,
    mockedDbModule: async () => ({ getDbTransactionConnection }),
    mockedServiceModule: async () => ({ updateLedger37InitialBalances: service }) };
  return { run: new Function(...Object.keys(deps), dbCode)(...Object.values(deps)), service, getLedgerDb, getDbTransactionConnection, db, set };
}
const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
function routeCode(name: string, next: string) {
  const start = routerSource.indexOf(`    ${name}: protectedProcedure`);
  const end = routerSource.indexOf(`    ${next}: protectedProcedure`, start);
  if (start < 0 || end < 0) throw new Error('missing production route');
  return routerSource.slice(start, end);
}
function handlers(run: ReturnType<typeof entry>['run']) {
  const procedure: any = { input: () => procedure, mutation: (fn: any) => fn };
  const code = transformSync(`return ({${routeCode('updateMyInitialBalances', 'adminGetAllInitialBalances')}
${routeCode('adminSetMemberInitialBalances', 'adminGetOrdinaryTagObservationConfig')}});`, { loader: 'ts', target: 'es2022' }).code;
  const deps = { protectedProcedure: procedure, z, TRPCError, LEDGER_37_ID: 37,
    dbLedger: { updateMyInitialBalances: run, getUserMembership: vi.fn(async () => ({ role: 'admin' })) },
    requireLedger52Creator: vi.fn(async () => undefined), assertLedger37AllocationTripletOnChange: vi.fn(async () => undefined),
    assertLedgerMemberTagHideAcknowledgements: vi.fn(async () => undefined), getLedgerDb: () => { throw new Error('禁止旧备注DB'); } };
  return new Function(...Object.keys(deps), code)(...Object.values(deps));
}
const invoke = (h: ReturnType<typeof handlers>, name: string, balances: Record<string, number | string>) =>
  h[name]({ ctx: { user: { id: name === 'updateMyInitialBalances' ? 201 : 100 } }, input: { ledgerId: 37, targetUserId: 201, balances } });

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('DEV_BYPASS_AUTH', 'false'); vi.stubEnv('PREVIEW_READONLY', 'false'); });
afterEach(() => vi.unstubAllEnvs());

describe('37共同保存入口与最小委托', () => {
  it.each(['updateMyInitialBalances', 'adminSetMemberInitialBalances'])('%s共同delegate独占事务服务并释放，绕开旧ORM', async name => {
    const f = fixture(); const e = entry(f); const h = handlers(e.run);
    expect(await invoke(h, name, { alias: 'new' })).toEqual({ success: true });
    expect(e.service).toHaveBeenCalledWith(f.tx, 201, { alias: 'new' });
    expect(e.getLedgerDb).not.toHaveBeenCalled(); expect(e.getDbTransactionConnection).toHaveBeenCalledOnce();
    expect(f.tx.commit).toHaveBeenCalledOnce(); expect(f.tx.release).toHaveBeenCalledOnce();
  });
  it.each(['updateMyInitialBalances', 'adminSetMemberInitialBalances'])('%s不能直写观察键，即使新旧相同', async name => {
    const f = fixture(JSON.stringify({ [observationKey]: JSON.stringify(CONFIG) })); const e = entry(f);
    await expect(invoke(handlers(e.run), name, { [observationKey]: JSON.stringify(CONFIG) })).rejects.toThrow('观察专用');
    expect(f.writes()).toHaveLength(0); expect(f.tx.beginTransaction).not.toHaveBeenCalled(); expect(f.tx.release).toHaveBeenCalledOnce();
  });
  it.each(['普通__ordinaryObservation', '旧名称__ordinaryObservation', '__ordinaryObservation'])('所有后缀键%s均禁止', async key => {
    const f = fixture(); await expect(updateLedger37InitialBalances(f.tx, 201, { [key]: '' })).rejects.toThrow('观察专用');
    expect(f.sqlLog).toHaveLength(0);
  });
  it.each([1, 52, 100])('非37账本%d原样get-read-merge ORM保存、不取得事务', async ledgerId => {
    const f = fixture(); const e = entry(f);
    await e.run(ledgerId, 201, { alias: 'new' });
    expect(e.getDbTransactionConnection).not.toHaveBeenCalled(); expect(e.service).not.toHaveBeenCalled();
    expect(e.db.select).toHaveBeenCalledOnce(); expect(e.db.update).toHaveBeenCalledOnce();
    expect(e.set).toHaveBeenCalledWith({ initialBalances: '{"legacy":123,"alias":"new"}' });
  });
  it.each(['update failed', 'commit failed'])('保存%s回滚原始JSON、释放且绝不退回旧ORM', async failure => {
    const original = '{"precision":900719925474099312345}'; const f = fixture(original); const e = entry(f);
    f.state.failUpdate = failure === 'update failed'; f.state.failCommit = failure === 'commit failed';
    await expect(e.run(37, 201, { alias: 'new' })).rejects.toThrow(failure);
    expect(f.state.raw).toBe(original); expect(f.tx.rollback).toHaveBeenCalledOnce(); expect(f.tx.release).toHaveBeenCalledOnce();
    expect(e.getLedgerDb).not.toHaveBeenCalled();
  });
  it('回滚本身失败时合并错误并仍释放', async () => {
    const f = fixture(); const e = entry(f); f.state.failUpdate = f.state.failRollback = true;
    await expect(e.run(37, 201, { alias: 'new' })).rejects.toBeInstanceOf(AggregateError);
    expect(f.tx.release).toHaveBeenCalledOnce();
  });
  it('取不到独占连接不触发旧ORM', async () => {
    const f = fixture(); const e = entry(f); e.getDbTransactionConnection.mockResolvedValueOnce(null as any);
    await expect(e.run(37, 201, {})).rejects.toThrow('connection failed'); expect(e.getLedgerDb).not.toHaveBeenCalled();
  });
});

describe('37锁下观察状态与JSON安全增量patch', () => {
  it('锁顺序ledgers -> 当下categories -> target member，只允许成员JSON的UPDATE', async () => {
    const f = fixture(); await updateLedger37InitialBalances(f.tx, 201, { alias: 'new' });
    expect(f.sqlLog.slice(0, 3).map(({ sql }) => sql.match(/FROM (\w+)/)![1])).toEqual(['ledgers', 'ledger_categories', 'ledger_members']);
    expect(f.sqlLog.slice(0, 3).every(({ sql }) => sql.includes('FOR UPDATE'))).toBe(true);
    for (const { sql } of f.sqlLog) expect(sql).not.toMatch(/\b(?:wallet|users|ledger_records|balance_history|INSERT|DELETE|CREATE|ALTER|DROP)\b/i);
  });
  it.each([null, ''])('SQL未配置值%j合法，不造额外默认配置', async raw => {
    const f = fixture(raw); await updateLedger37InitialBalances(f.tx, 201, { alias: 'new' });
    expect(f.saved()).toEqual({ alias: 'new' }); expect(f.tx.commit).toHaveBeenCalledOnce();
  });
  it.each(['broken', 'null', '[]', '123', '"text"', '   '])('损坏/非对象JSON %s拒绝且保持原文', async raw => {
    const f = fixture(raw); const e = entry(f); await expect(e.run(37, 201, { alias: 'new' })).rejects.toThrow();
    expect(f.state.raw).toBe(raw); expect(f.writes()).toHaveLength(0); expect(f.tx.rollback).toHaveBeenCalledOnce(); expect(f.tx.release).toHaveBeenCalledOnce();
  });
  it.each(['ratio', 'targetAmount'])('启用观察不能恢复真实%s', async suffix => {
    const f = fixture(JSON.stringify({ [observationKey]: JSON.stringify(CONFIG), 普通__ratio: 0, 普通__targetAmount: 0 }));
    await expect(updateLedger37InitialBalances(f.tx, 201, { [`普通__${suffix}`]: '10' })).rejects.toThrow('先关闭观察');
    expect(f.writes()).toHaveLength(0); expect(f.saved().普通__ratio).toBe(0);
  });
  it.each(['', ' ', 'NaN', -1, Infinity])('启用观察明确零守卫拒绝%j', async value => {
    const f = fixture(JSON.stringify({ [observationKey]: JSON.stringify(CONFIG) }));
    await expect(updateLedger37InitialBalances(f.tx, 201, { 普通__ratio: value })).rejects.toThrow(); expect(f.writes()).toHaveLength(0);
  });
  it('启用观察零值与无关字段可保存，原始日期/押金/其它标签/观察键不变', async () => {
    const prior = { [observationKey]: JSON.stringify(CONFIG), 普通: '999', 普通__ratio: 0, 普通__targetAmount: 0,
      普通__startDate: '2026-01-01', 普通__marginEntries: [{ amount: '100' }], 其他__ratio: 30, historicalAlias: 'keep' };
    const f = fixture(JSON.stringify(prior));
    await updateLedger37InitialBalances(f.tx, 201, { alias: 'new', 普通__ratio: '0', 普通__targetAmount: 0 });
    expect(f.saved()).toEqual({ ...prior, alias: 'new', 普通__ratio: '0' });
  });
  it('只守卫当前普通顶层manual_balance非default；不清理或恢复未知历史名称', async () => {
    const f = fixture(JSON.stringify({ [observationKey]: JSON.stringify(CONFIG), 旧名__ordinaryObservation: JSON.stringify(CONFIG), 默认__ordinaryObservation: JSON.stringify(CONFIG) }));
    f.state.categories = [category(10, '新名'), category(11, '默认', 'manual_balance', null, 1)];
    await updateLedger37InitialBalances(f.tx, 201, { 普通__ratio: 10, 旧名__ratio: 20, 默认__ratio: 30 });
    expect(f.saved()).toMatchObject({ 普通__ratio: 10, 旧名__ratio: 20, 默认__ratio: 30 });
    expect(f.saved()[observationKey]).toBe(JSON.stringify(CONFIG));
  });
  it('已关闭观察允许真实配置但不自动恢复本金/比例', async () => {
    const f = fixture(JSON.stringify({ [observationKey]: JSON.stringify({ ...CONFIG, enabled: false }), 普通__ratio: 0, 普通__targetAmount: 0 }));
    await updateLedger37InitialBalances(f.tx, 201, { 普通__ratio: 10 });
    expect(f.saved().普通__ratio).toBe(10); expect(f.saved().普通__targetAmount).toBe(0);
  });
  it('股票仅清理顶层主额/ratio/target三键，保留其日期押金观察配置和子标签', async () => {
    const prior = { 股票: 1000, 股票__ratio: 50, 股票__targetAmount: 500, 股票__startDate: '2026-01-01', 股票__margin: '200',
      股票__visible: 1, 股票__ordinaryObservation: 'old-keep', 子股票: 100, 子股票__ratio: 50, 普通: 1000, 普通__ratio: 30 };
    const f = fixture(JSON.stringify(prior)); f.state.categories.push(category(11, '股票', 'stock_portfolio'), category(12, '子股票', 'stock_portfolio', 11));
    await updateLedger37InitialBalances(f.tx, 201, { 股票: 9999, 股票__ratio: 99, 股票__targetAmount: 999, 股票__pauseDate: '2026-11-09' });
    const expected: any = { ...prior, 股票__pauseDate: '2026-11-09' }; delete expected.股票; delete expected.股票__ratio; delete expected.股票__targetAmount;
    expect(f.saved()).toEqual(expected); expect(f.writes()[0].sql).toContain('JSON_REMOVE(JSON_SET(');
    expect(f.writes()[0].values).not.toContain(9999); expect(f.writes()[0].values).not.toContain(99);
  });
  it('特殊JSON键安全参数化，历史超大数字/高精度小数从未重新stringify', async () => {
    const original = '{"huge":900719925474099312345,"decimal":0.123456789012345678901,"nested":{"n":900719925474099312345},"ordinary":1}';
    const f = fixture(original); const key = 'A".B\\C__alias';
    await updateLedger37InitialBalances(f.tx, 201, { [key]: 'new' });
    const update = f.writes()[0]; expect(update.sql).toContain('JSON_SET('); expect(update.sql).not.toContain(key);
    expect(update.values).toEqual([`$.${JSON.stringify(key)}`, 'new', 2, 37, 201]);
    expect(f.state.raw).toContain('900719925474099312345'); expect(f.state.raw).toContain('0.123456789012345678901');
    expect(f.saved()[key]).toBe('new');
  });
  it.each(['ledger', 'member', 'affectedRows'])('%s不存在/未匹配必须回滚并释放', async kind => {
    const f = fixture(); const e = entry(f); f.state.ledgerExists = kind !== 'ledger'; f.state.memberExists = kind !== 'member'; f.state.affectedRows = kind === 'affectedRows' ? 0 : 1;
    await expect(e.run(37, 201, { alias: 'new' })).rejects.toThrow();
    expect(f.tx.rollback).toHaveBeenCalledOnce(); expect(f.tx.release).toHaveBeenCalledOnce(); expect(f.tx.commit).not.toHaveBeenCalled();
  });
  it('空补丁不改SQL NULL，不额外生成配置', async () => {
    const f = fixture(null); await updateLedger37InitialBalances(f.tx, 201, {});
    expect(f.state.raw).toBeNull(); expect(f.writes()).toHaveLength(0); expect(f.tx.commit).toHaveBeenCalledOnce();
  });
});

describe('原子patch与真实观察转换的并发序列', () => {
  it('取成员锁前观察已成功开启，必须读锁下最新值拒绝旧正比例保存', async () => {
    const f = fixture('{"普通__ratio":50,"普通__targetAmount":500,"alias":"old"}');
    f.state.beforeMember = async () => { f.state.beforeMember = null; await adminSetOrdinaryTagObservationConfig(ADMIN); };
    await expect(updateLedger37InitialBalances(f.tx, 201, { 普通__ratio: 50, alias: 'stale' })).rejects.toThrow('先关闭观察');
    expect(f.saved()).toMatchObject({ 普通__ratio: 0, 普通__targetAmount: 0, alias: 'old', [observationKey]: JSON.stringify(CONFIG) });
    expect(f.writes()).toHaveLength(1); expect(f.tx.rollback).toHaveBeenCalledOnce();
  });
  it('alias/date先持锁，观察UPDATE必须等待其提交，最终两边字段和归零都保留', async () => {
    const f = fixture('{"普通__ratio":50,"普通__targetAmount":500,"普通__margin":"100"}');
    const locked = deferred(), continueSave = deferred();
    f.state.afterMember = async () => { locked.resolve(); await continueSave.promise; };
    const save = updateLedger37InitialBalances(f.tx, 201, { alias: 'new', 普通__startDate: '2026-11-01' });
    await locked.promise;
    const observation = adminSetOrdinaryTagObservationConfig(ADMIN);
    for (let i = 0; i < 20 && !f.pooled.execute.mock.calls.some(([sql]) => /^\s*UPDATE/.test(sql)); i++) await Promise.resolve();
    expect(f.pooled.execute.mock.calls.some(([sql]) => /^\s*UPDATE/.test(sql))).toBe(true);
    expect(f.saved()[observationKey]).toBeUndefined(); expect(f.memberLock.owner).toBe(f.tx);
    continueSave.resolve(); await Promise.all([save, observation]);
    expect(f.saved()).toEqual({ 普通__ratio: 0, 普通__targetAmount: 0, 普通__margin: '100', alias: 'new', 普通__startDate: '2026-11-01', [observationKey]: JSON.stringify(CONFIG) });
  });
  it('观察先提交再alias/date保存，原子patch绝不覆盖成功归零', async () => {
    const f = fixture('{"普通__ratio":50,"普通__targetAmount":500,"unrelated":123}');
    await adminSetOrdinaryTagObservationConfig(ADMIN);
    await updateLedger37InitialBalances(f.tx, 201, { alias: 'new', 普通__pauseDate: '2026-11-09' });
    expect(f.saved()).toEqual({ 普通__ratio: 0, 普通__targetAmount: 0, unrelated: 123, alias: 'new', 普通__pauseDate: '2026-11-09', [observationKey]: JSON.stringify(CONFIG) });
  });
  it('两个事务分别并发保存alias/date，在ledger行锁串行且不丢兄弟字段', async () => {
    const f = fixture('{"普通__margin":"100"}'); const second = f.connection();
    const locked = deferred(), continueSave = deferred();
    f.state.afterMember = async () => { f.state.afterMember = null; locked.resolve(); await continueSave.promise; };
    const firstSave = updateLedger37InitialBalances(f.tx, 201, { alias: 'new' }); await locked.promise;
    const secondSave = updateLedger37InitialBalances(second, 201, { 普通__startDate: '2026-11-01' });
    await Promise.resolve(); expect(second.execute.mock.calls).toHaveLength(1); expect(f.ledgerLock.owner).toBe(f.tx);
    continueSave.resolve(); await Promise.all([firstSave, secondSave]);
    expect(f.saved()).toEqual({ 普通__margin: '100', alias: 'new', 普通__startDate: '2026-11-01' });
  });
});
