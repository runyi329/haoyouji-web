import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrdinaryTagDownsideRule } from '../shared/ordinary-tag-downside';

const deps = vi.hoisted(() => ({ rules: vi.fn(), build: vi.fn(), decrypt: vi.fn(), encrypted: vi.fn() }));
vi.mock('./ordinary-tag-downside-rules', () => ({ readOrdinaryTagDownsideRules: deps.rules }));
vi.mock('./ordinary-tag-downside-valuation', () => ({ buildOrdinaryTagDownsideValuation: deps.build }));
vi.mock('./encryption', () => ({ decryptValue: deps.decrypt, isEncrypted: deps.encrypted }));
import { readOrdinaryTagDownsidePaymentReturn, type OrdinaryTagDownsidePaymentReadbackInput } from './ordinary-tag-downside-payment-readback';

const input: OrdinaryTagDownsidePaymentReadbackInput = {
  ledgerId: 37, userId: 202, actorUserId: 101, tagName: '普通甲', expectedCategoryId: 90, today: '2026-11-20',
};
const rule: OrdinaryTagDownsideRule = { ledgerId: 37, categoryId: 90, userId: 101, version: 1,
  enabled: true, thresholdAmount: 1000, downsidePercent: 50, startDate: '2026-11-01', createdAt: '2026-10-31T00:00:00.000Z' };
function fixture() {
  const state = {
    ledgers: [{ id: 37, ownerId: 101 }] as any[],
    categories: [{ id: 90, ledgerId: 37, name: input.tagName, parentId: null, isDefault: 0, accountingMode: 'manual_balance' }] as any[],
    expected: [] as any[],
    members: [{ id: 801, ledgerId: 37, userId: input.userId, memberType: 'real', realUserId: input.userId,
      initialBalances: JSON.stringify({ [input.tagName]: 0, [`${input.tagName}__ratio`]: 0 }) }] as any[],
    records: [{ ledgerId: 37, categoryId: 90, recordDate: '2026-11-03', type: 'expense', amount: '0.00',
      recordId: 111, createdAt: '2026-11-03 08:01:02.123456', description: null, deletedAt: null }] as any[],
  };
  const log: Array<{ sql: string; params: any[] }> = [];
  const lockLog: Array<{ sql: string; params: any[] }> = [];
  const events: string[] = [];
  const conn = {
    // The caller already owns an active transaction. None of these methods may be called here.
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), end: vi.fn(),
    execute: vi.fn(async (sql: string, params: any[] = []) => {
      lockLog.push({ sql, params });
      if (!/^\s*SELECT\b/i.test(sql)) throw new Error('测试禁止非只读SQL');
      if (/FROM ledgers/.test(sql)) { events.push('ledger'); return [state.ledgers]; }
      log.push({ sql, params }); // Category/member/history queries, excluding the first ledger lock.
      if (/FROM ledger_categories/.test(sql)) {
        events.push('category');
        return [/BINARY name/.test(sql) ? state.categories : state.expected];
      }
      if (/FROM ledger_members/.test(sql)) { events.push('member'); return [state.members]; }
      if (/FROM ledger_records/.test(sql)) { events.push('records'); return [state.records]; }
      throw new Error('禁止额外查询: ' + sql);
    }),
  };
  deps.rules.mockImplementation(async () => { events.push('rules'); return [rule]; });
  deps.build.mockReturnValue({ categoryId: 90, categoryName: input.tagName, status: 'ready',
    totalPnl: 12.345678901, latestDate: '2026-11-03', points: [{ date: '2026-11-03', ruleVersion: 1 }] });
  return { state, log, lockLog, events, conn, run: (patch: Partial<OrdinaryTagDownsidePaymentReadbackInput> = {}) => readOrdinaryTagDownsidePaymentReturn(conn, { ...input, ...patch }) };
}
beforeEach(() => {
  vi.resetAllMocks();
  deps.decrypt.mockImplementation(value => value);
  deps.encrypted.mockImplementation(value => value.startsWith('enc:v1:'));
});

describe('ordinary-tag downside payment readback (offline SELECT-only)', () => {
  it('锁ledger -> category -> scoped全部规则 -> 目标真实member -> 完整records；返回pure精确累计而非端点公式', async () => {
    const f = fixture();
    expect(await f.run()).toEqual({ applicable: true, status: 'ready', cumulativeReturn: 12.345678901, ruleVersion: 1, categoryId: 90 });
    expect(f.events).toEqual(['ledger', 'category', 'rules', 'member', 'records']);
    expect(f.lockLog[0]).toEqual({ sql: 'SELECT id, ownerId FROM ledgers WHERE id = ? FOR UPDATE', params: [37] });
    expect(deps.rules).toHaveBeenCalledTimes(1);
    expect(deps.rules).toHaveBeenCalledWith(f.conn, 37, 90);
    const categorySQL = f.log[0];
    expect(categorySQL.params).toEqual([37, input.tagName]);
    expect(categorySQL.sql).toMatch(/BINARY name = BINARY \?/);
    for (const clause of ['parentId IS NULL', 'isDefault = 0', "accounting_mode = 'manual_balance'", 'FOR UPDATE']) expect(categorySQL.sql).toContain(clause);
    const memberSQL = f.log[1];
    expect(memberSQL.params).toEqual([37, input.userId]);
    expect(memberSQL.sql).toMatch(/m\.ledgerId = \? AND m\.userId = \? AND m\.member_type = 'real'/);
    expect(memberSQL.sql).toContain('m.id');
    expect(memberSQL.sql).toContain('INNER JOIN users u ON u.id = m.userId');
    expect(memberSQL.sql).toContain('FOR UPDATE');
    const recordsSQL = f.log[2];
    expect(recordsSQL.params).toEqual([90, 37, 90, 90, input.today]);
    expect(recordsSQL.sql).toContain('c.id = r.categoryId AND c.ledgerId = r.ledgerId');
    expect(recordsSQL.sql).toContain('(c.id = ? OR c.parentId = ?)');
    expect(recordsSQL.sql).toContain('r.deleted_at IS NULL AND r.recordDate <= ?');
    expect(recordsSQL.sql).toContain("DATE_FORMAT(r.recordDate, '%Y-%m-%d') AS recordDate");
    expect(recordsSQL.sql).toContain("DATE_FORMAT(r.createdAt, '%Y-%m-%d %H:%i:%s.%f') AS createdAt");
    expect(recordsSQL.sql).toContain('ORDER BY r.recordDate ASC, r.createdAt ASC, r.id ASC FOR UPDATE');
    expect(recordsSQL.sql).not.toMatch(/userId|LIMIT/);
    expect(deps.build).toHaveBeenCalledTimes(1);
    expect(deps.build).toHaveBeenCalledWith({ ledgerId: 37, userId: input.userId,
      categoryId: 90, categoryName: input.tagName, balances: { [input.tagName]: 0, [`${input.tagName}__ratio`]: 0 },
      records: f.state.records, rules: [rule], today: input.today });
  });
  it.each([{ ledgers: [] }, { ledgers: [{ id: 52 }] }, { ledgers: [{ id: 37 }, { id: 37 }] }])('ledger锁范围失效 %j先阻断，不能读分类/成员', async ({ ledgers }) => {
    const f = fixture(); f.state.ledgers = ledgers;
    expect(await f.run()).toEqual({ applicable: true, status: 'pending', cumulativeReturn: null, categoryId: 90 });
    expect(f.lockLog).toHaveLength(1); expect(f.log).toHaveLength(0); expect(deps.rules).not.toHaveBeenCalled();
  });
  it('preflight后owner变更时锁内拒绝，不读取规则/成员/流水', async () => {
    const f = fixture(); f.state.ledgers[0].ownerId = 999;
    expect(await f.run()).toEqual({ applicable: true, status: 'pending', cumulativeReturn: null, categoryId: 90 });
    expect(f.events).toEqual(['ledger']); expect(deps.rules).not.toHaveBeenCalled(); expect(deps.build).not.toHaveBeenCalled();
  });
  it('仅内部caller已保证owner的兼容调用允许省略actorUserId，但仍锁ledger/category/member', async () => {
    const f = fixture(); expect((await f.run({ actorUserId: undefined })).status).toBe('ready');
    expect(f.events).toEqual(['ledger', 'category', 'rules', 'member', 'records']);
  });
  it('无规则/尚未建表[]仍保留category锁且不读取成员/流水，不制造raw收益', async () => {
    const f = fixture(); deps.rules.mockResolvedValue([]);
    expect(await f.run()).toEqual({ applicable: false, status: 'no_data', cumulativeReturn: null });
    expect(f.log).toHaveLength(1); expect(f.log[0].sql).toContain('FOR UPDATE');
    expect(deps.build).not.toHaveBeenCalled();
  });
  it('找不到且无expectedId适用false，不读取任何规则/个人/流水', async () => {
    const f = fixture(); f.state.categories = [];
    expect(await f.run({ expectedCategoryId: undefined })).toEqual({ applicable: false, status: 'no_data', cumulativeReturn: null });
    expect(f.log).toHaveLength(1); expect(deps.rules).not.toHaveBeenCalled();
  });
  it('既有stock分类不应用普通收益，也不查询规则或流水', async () => {
    const f = fixture(); f.state.expected = [{ ...f.state.categories[0], accountingMode: 'stock_portfolio' }]; f.state.categories = [];
    expect(await f.run()).toEqual({ applicable: false, status: 'no_data', cumulativeReturn: null });
    expect(f.log).toHaveLength(2); expect(f.log[1].params).toEqual([37, 90]); expect(f.log[1].sql).toContain('FOR UPDATE');
    expect(deps.rules).not.toHaveBeenCalled();
  });
  it('驱动越界返回stock时也不应用', async () => {
    const f = fixture(); f.state.categories[0].accountingMode = 'stock_portfolio';
    expect((await f.run()).applicable).toBe(false); expect(deps.rules).not.toHaveBeenCalled();
  });
  it.each([
    { ledgerId: 52 }, { id: 91 }, { name: '普通乙' }, { parentId: 11 }, { isDefault: 1 }, { accountingMode: 'broken' },
  ])('锁下分类失效/改归属/名称/默认/mode %j必须pending而非raw回退', async change => {
    const f = fixture(); Object.assign(f.state.categories[0], change);
    expect(await f.run()).toMatchObject({ applicable: true, status: 'pending', cumulativeReturn: null });
    expect(deps.rules).not.toHaveBeenCalled(); expect(deps.build).not.toHaveBeenCalled();
  });
  it.each([{ expected: [] }, { expected: [{ id: 90, ledgerId: 37, name: '已改名', parentId: null, isDefault: 0, accountingMode: 'manual_balance' }] },
    { expected: [{ id: 90, ledgerId: 37, name: input.tagName, parentId: 11, isDefault: 0, accountingMode: 'manual_balance' }] }])('expected分类已删除/改名/降为子项拒绝 %j', async ({ expected }) => {
    const f = fixture(); f.state.categories = []; f.state.expected = expected;
    expect(await f.run()).toEqual({ applicable: true, status: 'pending', cumulativeReturn: null, categoryId: 90 });
    expect(deps.rules).not.toHaveBeenCalled();
  });
  it('重名类别不能任意选第一个进入支付', async () => {
    const f = fixture(); f.state.categories.push({ ...f.state.categories[0], id: 91 });
    expect((await f.run()).status).toBe('pending'); expect(deps.rules).not.toHaveBeenCalled();
  });
  it('规则读取故障不能当无规则，也不能返回0', async () => {
    const f = fixture(); deps.rules.mockRejectedValue(new Error('broken rules'));
    expect(await f.run()).toEqual({ applicable: true, status: 'pending', cumulativeReturn: null, categoryId: 90 });
    expect(f.log).toHaveLength(1); expect(deps.build).not.toHaveBeenCalled();
  });
  it.each([{ ledgerId: 52 }, { categoryId: 999 }])('store违规跨范围规则 %j fail closed', async change => {
    const f = fixture(); deps.rules.mockResolvedValue([{ ...rule, ...change }]);
    expect((await f.run()).status).toBe('pending'); expect(f.log).toHaveLength(1);
  });
  it.each(['{bad', 'null', '[]', '0', 'false', '"text"', undefined, {}])('成员真实JSON异常 %j返回pending，不能转空对象/零', async initialBalances => {
    const f = fixture(); f.state.members[0].initialBalances = initialBalances;
    expect(await f.run()).toMatchObject({ applicable: true, status: 'pending', cumulativeReturn: null });
    expect(f.log).toHaveLength(2); expect(deps.build).not.toHaveBeenCalled();
  });
  it.each([null, ''])('合法未配置字段 %j透传空对象由pure决定状态，不由helper假设0', async initialBalances => {
    const f = fixture(); f.state.members[0].initialBalances = initialBalances;
    deps.build.mockReturnValue({ categoryId: 90, categoryName: input.tagName, status: 'pending', totalPnl: null });
    expect((await f.run()).cumulativeReturn).toBeNull(); expect(deps.build.mock.calls[0][0].balances).toEqual({});
  });
  it.each([{ id: 0 }, { ledgerId: 52 }, { userId: 303 }, { realUserId: 303 }, { memberType: 'ai' }])('目标成员不真实或越界 %j拒绝、不读全员', async change => {
    const f = fixture(); Object.assign(f.state.members[0], change);
    expect((await f.run()).status).toBe('pending'); expect(f.log).toHaveLength(2);
  });
  it('成员缺失或重复拒绝', async () => {
    const f = fixture(); f.state.members = []; expect((await f.run()).status).toBe('pending');
    f.state.members = [{ id: 801, ledgerId: 37, userId: 202, realUserId: 202, memberType: 'real', initialBalances: '{}' }];
    f.state.members.push(f.state.members[0]); expect((await f.run()).status).toBe('pending');
    expect(deps.build).not.toHaveBeenCalled();
  });
  it('真零余额/比例/累计保留；非转账备注不用于本金推断', async () => {
    const f = fixture(); f.state.records[0].description = 'capital_add 非transfer';
    deps.build.mockReturnValue({ categoryId: 90, categoryName: input.tagName, status: 'ready', totalPnl: 0, latestDate: '2026-11-03', points: [] });
    expect((await f.run()).cumulativeReturn).toBe(0);
    expect(deps.build.mock.calls[0][0].records[0]).toMatchObject({ amount: '0.00', description: null });
    expect(deps.decrypt).not.toHaveBeenCalled();
  });
  it('解密transfer原备注再交pure，不重写资金流、不按余额差伪造capital', async () => {
    const f = fixture(); f.state.records.push({ ...f.state.records[0], type: 'transfer', amount: '100.00', recordId: 112, description: 'enc:v1:fixture' });
    deps.decrypt.mockReturnValue('capital_add 原始说明');
    await f.run(); expect(deps.decrypt).toHaveBeenCalledTimes(1);
    expect(deps.decrypt).toHaveBeenCalledWith('enc:v1:fixture');
    expect(deps.build.mock.calls[0][0].records[1]).toMatchObject({ type: 'transfer', amount: '100.00', description: 'capital_add 原始说明' });
    expect(f.state.records[1].description).toBe('enc:v1:fixture');
  });
  it('无法解密不把密文误识别为withdraw或本金，必须pending', async () => {
    const f = fixture(); f.state.records[0] = { ...f.state.records[0], type: 'transfer', description: 'enc:v1:broken' };
    expect((await f.run()).cumulativeReturn).toBeNull(); expect(deps.build).not.toHaveBeenCalled();
  });
  it.each([{ ledgerId: 52 }, { categoryId: 99 }, { deletedAt: '2026-11-01' }, { deleted_at: '2026-11-01' },
    { recordDate: '2026-11-21' }, { recordDate: new Date('2026-11-03') }])('unexpected record scope %j不得raw降级', async change => {
    const f = fixture(); Object.assign(f.state.records[0], change);
    expect((await f.run()).status).toBe('pending'); expect(deps.build).not.toHaveBeenCalled();
  });
  it('全部保存版本/未来版本均传pure，个人pausecutoff及有效ruleVersion只依pure最新点', async () => {
    const f = fixture(); const late = { ...rule, version: 7, startDate: '2026-12-01' };
    const rules = [rule, late]; deps.rules.mockResolvedValue(rules);
    f.state.members[0].initialBalances = JSON.stringify({ 普通甲: 1000, 普通甲__pauseDate: '2026-11-03' });
    expect((await f.run()).ruleVersion).toBe(1);
    expect(deps.build.mock.calls[0][0]).toMatchObject({ rules, today: '2026-11-20', balances: { 普通甲__pauseDate: '2026-11-03' } });
    expect(f.log[2].params.at(-1)).toBe(input.today); // builder, not this helper, chooses cutoff
  });
  it('全部规则未生效/disabled仍交pure，不自行按最后保存版本判定或提前应用', async () => {
    const f = fixture(); const future = [{ ...rule, startDate: '2026-12-01', version: 7, enabled: false }];
    deps.rules.mockResolvedValue(future);
    deps.build.mockReturnValue({ categoryId: 90, categoryName: input.tagName, status: 'ready', totalPnl: 9.87654,
      latestDate: '2026-11-03', points: [{ date: '2026-11-03', ruleVersion: 0 }] });
    expect(await f.run()).toEqual({ applicable: true, status: 'ready', cumulativeReturn: 9.87654, categoryId: 90 });
    expect(deps.build.mock.calls[0][0].rules).toEqual(future);
  });
  it.each(['pending', 'no_data'])('pure %s totalPnl即便0也不能变成ready/可支付', async status => {
    const f = fixture(); deps.build.mockReturnValue({ categoryId: 90, categoryName: input.tagName, status, totalPnl: 0 });
    expect(await f.run()).toEqual({ applicable: true, status, cumulativeReturn: null, categoryId: 90 });
  });
  it.each([null, undefined, NaN, Infinity, -Infinity, '0'])('pure ready无有效累计 %j仍pending而非0', async totalPnl => {
    const f = fixture(); deps.build.mockReturnValue({ categoryId: 90, categoryName: input.tagName, status: 'ready', totalPnl });
    expect((await f.run()).status).toBe('pending'); expect((await f.run()).cumulativeReturn).toBeNull();
  });
  it('pure流量/entry缺证据抛错返回pending；不执行任何事务收尾', async () => {
    const f = fixture(); deps.build.mockImplementation(() => { throw new Error('flow missing'); });
    expect((await f.run()).status).toBe('pending');
    for (const fn of [f.conn.beginTransaction, f.conn.commit, f.conn.rollback, f.conn.release, f.conn.end]) expect(fn).not.toHaveBeenCalled();
  });
  it('数据库锁/历史读取失败上抛，由caller负责回滚，不吞成零或自有事务', async () => {
    const f = fixture(); f.conn.execute.mockRejectedValue(new Error('lock timeout'));
    await expect(f.run()).rejects.toThrow('lock timeout');
    for (const fn of [f.conn.beginTransaction, f.conn.commit, f.conn.rollback, f.conn.release, f.conn.end]) expect(fn).not.toHaveBeenCalled();
  });
  it.each([{ ledgerId: 52 }, { userId: 0 }, { userId: 1.5 }, { expectedCategoryId: 0 }, { tagName: '' },
    { actorUserId: 0 }, { actorUserId: 1.5 }, { today: '2026-02-30' }, { today: '2026-1-01' }])('输入非法 %j在所有SQL前拒绝', async change => {
    const f = fixture(); await expect(f.run(change as any)).rejects.toThrow(); expect(f.conn.execute).not.toHaveBeenCalled();
  });
  it('source只有SELECT及FOR UPDATE，无DB获取/事务DDL/钱包/真实资金修改；caller owns transaction', async () => {
    const f = fixture(); await f.run();
    for (const fn of [f.conn.beginTransaction, f.conn.commit, f.conn.rollback, f.conn.release, f.conn.end]) expect(fn).not.toHaveBeenCalled();
    expect(f.log.every(item => /^\s*SELECT\b/.test(item.sql))).toBe(true);
    const source = readFileSync(new URL('./ordinary-tag-downside-payment-readback.ts', import.meta.url), 'utf8');
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(body).not.toMatch(/\b(?:CREATE|ALTER|DROP|INSERT|DELETE|TRUNCATE)\b|\bUPDATE\s+\w+\s+SET\b/i);
    expect(body).not.toMatch(/\.(?:beginTransaction|commit|rollback|release|end)\s*\(|getDb(?:Connection|TransactionConnection)|from ['"].*wallet/);
    expect(body).not.toMatch(/countedOrdinaryTagBalance|ordinaryTagCountedPnl|Math\.round|toFixed/);
    expect(source).toContain('caller already began a transaction');
  });
});
