import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOrdinaryTagMemberConfig, getOrdinaryTagClearImpact, type OrdinaryTagClearInput } from './ordinary-tag-clear-config';

const INPUT: OrdinaryTagClearInput = { ledgerId: 37, actorUserId: 100, targetUserId: 201, categoryId: 10 };
const BASE = { 普通: 1000, 普通__ratio: 50, 普通__targetAmount: 500, 普通__startDate: '2026-11-02' };
const category = (id = 10, name = '普通', parentId: number | null = null, mode = 'manual_balance') =>
  ({ id, ledgerId: 37, name, parentId, isDefault: 0, accountingMode: mode });
const record = (id: number, date: string | null, amount: any = '100', type = 'expense', categoryId = 10) =>
  ({ id, ledgerId: 37, categoryId, recordDate: date, type, amount, createdBy: 100, deletedAt: null as any, description: null as string | null });

// 模拟MySQL JSON_SET仅指定value token更新；未改历史数值不经JS stringify。
function rawFields(raw: string | null): Map<string, string> {
  const fields = new Map<string, string>();
  if (raw === null) return fields;
  JSON.parse(raw);
  const stringEnd = (start: number) => {
    let i = start + 1;
    while (i < raw.length) { if (raw[i] === '\\') i += 2; else if (raw[i++] === '"') return i; }
    throw new Error('bad fixture');
  };
  let i = raw.indexOf('{') + 1;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (raw[i] === '}') break;
    const keyEnd = stringEnd(i), key = JSON.parse(raw.slice(i, keyEnd));
    i = raw.indexOf(':', keyEnd) + 1;
    const start = i; let depth = 0;
    while (i < raw.length) {
      if (raw[i] === '"') { i = stringEnd(i); continue; }
      if (raw[i] === '{' || raw[i] === '[') depth++;
      else if (raw[i] === '}' || raw[i] === ']') { if (!depth) break; depth--; }
      else if (raw[i] === ',' && !depth) break;
      i++;
    }
    fields.set(key, raw.slice(start, i).trim());
    if (raw[i] === '}') break;
    i++;
  }
  return fields;
}
function fixture(raw: string | null = JSON.stringify(BASE)) {
  const state = {
    raw, ledgers: [{ id: 37, ownerId: 100 }], categories: [category(), category(11, '子类', 10), category(20, '其他')],
    members: [
      { id: 1, ledgerId: 37, userId: 100, role: 'owner', memberType: 'real', realUserId: 100, permissionView: 'all' },
      { id: 2, ledgerId: 37, userId: 201, role: 'member', memberType: 'real', realUserId: 201, permissionView: 'all' },
    ],
    records: [record(1, '2026-11-02'), record(2, '2026-11-05')],
    failRead: false, failUpdate: false, failCommit: false, failRollback: false, affectedRows: 1,
    beforeLockedMember: undefined as undefined | (() => void),
  };
  const log: Array<{ sql: string; values: any[] }> = [];
  let snapshot = state.raw, changed = false, inTransaction = false;
  const connection = {
    beginTransaction: vi.fn(async () => { inTransaction = true; changed = false; }),
    commit: vi.fn(async () => { if (state.failCommit) throw new Error('offline commit failed'); inTransaction = false; }),
    rollback: vi.fn(async () => { if (changed) state.raw = snapshot; inTransaction = false; if (state.failRollback) throw new Error('offline rollback failed'); }),
    release: vi.fn(),
    execute: vi.fn(async (query: string, values: any[] = []) => {
      const sql = query.replace(/\s+/g, ' ').trim(); log.push({ sql, values });
      const locked = sql.endsWith(' FOR UPDATE');
      if (locked) expect(inTransaction).toBe(true);
      if (sql === 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ') {
        expect(inTransaction).toBe(false); return [{ affectedRows: 0 }, []];
      }
      if (sql.startsWith('SELECT id, ownerId FROM ledgers')) {
        expect(values).toEqual([37]); return [state.ledgers, []];
      }
      if (sql.includes('FROM ledger_categories WHERE')) {
        expect(sql).toContain('ORDER BY id'); expect(values).toEqual([37]);
        if (locked) expect(log.at(-2)?.sql).toContain('FROM ledgers');
        return [[...state.categories].sort((a, b) => a.id - b.id), []];
      }
      if (sql.includes('FROM ledger_members m LEFT JOIN users u')) {
        expect(sql).toContain('ORDER BY m.userId, m.id');
        if (locked) {
          expect(log.at(-2)?.sql).toContain('FROM ledger_categories');
          state.beforeLockedMember?.(); snapshot = state.raw;
        }
        return [state.members.filter(m => m.ledgerId === values[0] && values.slice(1).includes(m.userId))
          .sort((a, b) => a.userId - b.userId).map(m => ({ ...m, initialBalances: m.userId === 201 ? state.raw : '{}' })), []];
      }
      if (sql.includes('FROM ledger_records r')) {
        if (state.failRead) throw new Error('offline read failed');
        expect(sql).toContain("r.type IN ('income', 'expense', 'transfer')"); expect(sql).not.toMatch(/LIMIT|createdBy =/);
        expect(values).toEqual([37, 10, 11]);
        return [state.records.filter(r => r.ledgerId === values[0] && values.slice(1).includes(r.categoryId)
          && ['income', 'expense', 'transfer'].includes(r.type)).sort((a, b) => a.id - b.id), []];
      }
      if (sql.startsWith('UPDATE ledger_members')) {
        expect(inTransaction).toBe(true); expect(sql).toContain('JSON_SET(COALESCE(initial_balances, JSON_OBJECT())');
        expect(sql).not.toMatch(/JSON_REMOVE|DELETE|margin|stock|pause|visible/);
        expect(values.slice(-3)).toEqual([2, 37, 201]); expect(values).toHaveLength(11);
        if (state.failUpdate) throw new Error('offline update failed');
        if (state.affectedRows !== 1) return [{ affectedRows: state.affectedRows }, []];
        const fields = rawFields(state.raw);
        for (let j = 0; j < 8; j += 2) fields.set(JSON.parse(values[j].slice(2)), JSON.stringify(values[j + 1]));
        state.raw = `{${[...fields].map(([key, value]) => `${JSON.stringify(key)}:${value}`).join(',')}}`; changed = true;
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`禁止非白名单SQL或真实DB: ${sql}`);
    }),
  };
  const deps = { connection };
  return { state, connection, log, deps,
    impact: (input = INPUT) => getOrdinaryTagClearImpact(input, deps),
    clear: (hash: string, input = INPUT) => clearOrdinaryTagMemberConfig({ ...input, impactHash: hash }, deps),
    writes: () => log.filter(e => e.sql.startsWith('UPDATE')),
  };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T08:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('普通标签真实余额登记日影响预检（GET只SELECT）', () => {
  it('准确N按实际日期去重；顶层及直接子类、负登记金额、0收益/亏损点均计数，不补空白自然日', async () => {
    const f = fixture();
    f.state.records = [record(1, '2026-11-01'), record(2, '2026-11-02'), record(3, '2026-11-02', '-20', 'income', 11),
      record(4, '2026-11-05', '1000'), record(5, '2026-11-08'), record(6, '2026-11-09'),
      record(7, '2026-11-10'), record(8, '2026-11-03', '0'), record(9, '2026-11-04', '3', 'transfer'),
      record(10, '2026-11-04', '3', 'expense', 20), { ...record(11, '2026-11-06'), deletedAt: '2026-11-07' }];
    expect(await f.impact()).toMatchObject({ ledgerId: 37, userId: 201, categoryId: 10, categoryName: '普通',
      affectedDays: 4, firstDate: '2026-11-02', lastDate: '2026-11-09', hasConfiguredStartDate: true });
    expect(f.writes()).toEqual([]); expect(f.log.every(e => !e.sql.includes('FOR UPDATE'))).toBe(true);
    expect(f.connection.beginTransaction).not.toHaveBeenCalled(); expect(f.connection.release).not.toHaveBeenCalled();
  });
  it.each([null, '{}', '{"普通__ratio":0}', JSON.stringify({ ...BASE, 普通__ratio: 0 }),
    JSON.stringify({ ...BASE, 普通__startDate: '' }), JSON.stringify({ ...BASE, 普通__startDate: null }),
    JSON.stringify({ ...BASE, 普通__startDate: '2026-11-10' })])('合法无配置/比例0/无开始日/未来开始 %s 返回0且边界null', async raw => {
    const f = fixture(raw); expect(await f.impact()).toMatchObject({ affectedDays: 0, firstDate: null, lastDate: null });
  });
  it('无真实记录和纯0记录都是0，不按自然日估算；NULL允许仅生成四键', async () => {
    const f = fixture(null); f.state.records = [];
    const impact = await f.impact(); expect(impact.affectedDays).toBe(0);
    await f.clear(impact.impactHash); expect(JSON.parse(f.state.raw!)).toEqual({ 普通: 0, 普通__ratio: 0, 普通__targetAmount: 0, 普通__startDate: '' });
    const g = fixture(); g.state.records = [record(1, '2026-11-02', 0)]; expect((await g.impact()).affectedDays).toBe(0);
  });
  it('缺失/null实际比例遵循累计普通回报默认100%，不是观察比例默认0', async () => {
    const f = fixture('{"普通":1000,"普通__startDate":"2026-11-02"}'); expect((await f.impact()).affectedDays).toBe(2);
  });
  it('暂停日当天保留、暂停之后至恢复之前排除、恢复当天保留，结束日期为含当天截止', async () => {
    const f = fixture(JSON.stringify({ ...BASE, 普通__endDate: '2026-11-08', 普通__pauseHistory: JSON.stringify([
      { pauseDate: '2026-11-03', resumeDate: '2026-11-06', snapshotAmount: 'KEEP' }, { pauseDate: '2026-11-08' },
    ]) }));
    f.state.records = Array.from({ length: 9 }, (_, i) => record(i + 1, `2026-11-${String(i + 1).padStart(2, '0')}`));
    expect(await f.impact()).toMatchObject({ affectedDays: 5, firstDate: '2026-11-02', lastDate: '2026-11-08' });
  });
  it('兼容旧pauseDate，已有有效数组优先；不修改过去暂停片段', async () => {
    const f = fixture(JSON.stringify({ ...BASE, 普通__pauseDate: '2026-11-02' })); expect((await f.impact()).affectedDays).toBe(1);
    const g = fixture(JSON.stringify({ ...BASE, 普通__pauseDate: '2026-11-02', 普通__pauseHistory: '[]' })); expect((await g.impact()).affectedDays).toBe(2);
  });
  it.each(['all', 'own', 'none'])('真实permission_view=%s决定成员实际可读记录范围', async permission => {
    const f = fixture(); f.state.members[1].permissionView = permission;
    f.state.records.push({ ...record(3, '2026-11-07'), createdBy: 201 });
    expect((await f.impact()).affectedDays).toBe(permission === 'all' ? 3 : permission === 'own' ? 1 : 0);
  });
  it('隐藏可见性不扣减收益登记日但参与hash', async () => {
    const f = fixture(); const first = await f.impact();
    f.state.raw = JSON.stringify({ ...BASE, 普通__visible: 0, __tagVisibilityDefault: 0 });
    const second = await f.impact(); expect(second.affectedDays).toBe(first.affectedDays); expect(second.impactHash).not.toBe(first.impactHash);
  });
  it.each(['', ' ', 'null', '[]', 'broken', '{"普通":1,"普通":2}', '{"普通":1e999}'])('损坏/歧义JSON %j不能伪0或清空覆盖', async raw => {
    const f = fixture(raw); await expect(f.impact()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(f.clear('a'.repeat(64))).rejects.toThrow(); expect(f.state.raw).toBe(raw); expect(f.writes()).toHaveLength(0);
  });
  it.each([{ 普通__startDate: '2026-02-30' }, { 普通__startDate: 0 }, { 普通__endDate: 'bad' },
    { 普通__endDate: '2026-11-01' }, { 普通__ratio: '' }, { 普通__ratio: 'NaN' }, { 普通__ratio: 101 },
    { 普通__pauseDate: 'bad' }, { 普通__pauseHistory: '{broken' }, { 普通__pauseHistory: '[{}]' },
    { 普通__pauseHistory: '[{"pauseDate":"2026-11-05","resumeDate":"2026-11-02"}]' },
    { 普通__pauseHistory: '[{"pauseDate":"2026-11-05"},{"pauseDate":"2026-11-07"}]' }])('损坏参与配置 %j拒绝且无写', async patch => {
    const f = fixture(JSON.stringify({ ...BASE, ...patch })); await expect(f.impact()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(f.writes()).toHaveLength(0);
  });
  it.each([null, '', '2026-02-30', '0000-00-00'])('真实登记缺失/坏日期%j即便ratio0也拒绝', async date => {
    const f = fixture(JSON.stringify({ ...BASE, 普通__ratio: 0 })); f.state.records = [record(1, date)];
    await expect(f.impact()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
  it.each([null, '', 'enc:v1:bad', 'NaN'])('坏余额金额%j不伪0', async amount => {
    const f = fixture(); f.state.records[0].amount = amount; await expect(f.impact()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
  it('读取失败不能返回0成功', async () => {
    const f = fixture(); f.state.failRead = true; await expect(f.impact()).rejects.toThrow('offline read failed'); expect(f.writes()).toHaveLength(0);
  });
});

describe('真实操作者/成员/ledger/category限域', () => {
  it.each(['owner', 'admin'])('真实%s可执行，忽略客户端冒充角色username', async role => {
    const f = fixture(); f.state.members[0].role = role;
    expect((await f.impact({ ...INPUT, ...{ role: 'member', username: 'fake' } })).affectedDays).toBe(2);
  });
  it('数据库真实member角色不能靠客户端owner/username假冒管理员', async () => {
    const f = fixture(); f.state.members[0].role = 'member';
    await expect(f.impact({ ...INPUT, ...{ role: 'owner', username: 'JiamG' } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each(['actorAI', 'targetAI', 'actorMissing', 'targetMissing', 'targetNoRealUser'])('拒绝%s', async mode => {
    const f = fixture();
    if (mode === 'actorAI') f.state.members[0].memberType = 'ai';
    if (mode === 'targetAI') f.state.members[1].memberType = 'ai';
    if (mode === 'actorMissing') f.state.members.splice(0, 1);
    if (mode === 'targetMissing') f.state.members.splice(1, 1);
    if (mode === 'targetNoRealUser') f.state.members[1].realUserId = 0;
    await expect(f.impact()).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toHaveLength(0);
  });
  it.each([36, 52])('错账本%d在任何SQL前拒绝', async ledgerId => {
    const f = fixture(); await expect(f.impact({ ...INPUT, ledgerId })).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(f.log).toHaveLength(0);
  });
  it.each(['wrongLedger', 'stock', 'child', 'default', 'missing'])('目标分类%s拒绝', async mode => {
    const f = fixture();
    if (mode === 'wrongLedger') f.state.categories[0].ledgerId = 52;
    if (mode === 'stock') f.state.categories[0].accountingMode = 'stock_portfolio';
    if (mode === 'child') f.state.categories[0].parentId = 20;
    if (mode === 'default') f.state.categories[0].isDefault = 1;
    if (mode === 'missing') f.state.categories.shift();
    await expect(f.impact()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('观察启用拒绝预检和清空；损坏观察拒绝，不影响合法disabled原JSON', async () => {
    for (const value of ['{"enabled":true}', 'bad', 'false', '{"enabled":"false"}']) {
      const f = fixture(JSON.stringify({ ...BASE, 普通__ordinaryObservation: value }));
      await expect(f.impact()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      await expect(f.clear('a'.repeat(64))).rejects.toThrow(); expect(f.writes()).toHaveLength(0);
    }
  });
});

describe('事务current READ hash防并发与严格四键增量patch', () => {
  it('hash稳定且64位SHA256；严格四键，保留其他tag/stock、暂停/保证金/观察、超大历史数字原token', async () => {
    const raw = '{"普通":1000,"普通__ratio":50,"普通__targetAmount":500,"普通__startDate":"2026-11-02",'
      + '"普通__visible":0,"普通__endDate":"2027-01-01","普通__pauseHistory":"[]","普通__pauseDate":"2026-11-09",'
      + '"普通__margins":"[{\\"id\\":\\"hold9\\",\\"amount\\":\\"200\\"}]","普通__ordinaryObservation":"{\\"enabled\\":false}",'
      + '"股票":900719925474099312345,"股票__ratio":0.123456789012345678901,"股票__targetAmount":123456789123456789,'
      + '"nested":{"n":900719925474099312345,"d":0.123456789012345678901},"other":"unchanged"}';
    const f = fixture(raw); f.state.categories.push(category(30, '股票', null, 'stock_portfolio'));
    const impact = await f.impact(); expect(impact.impactHash).toMatch(/^[a-f0-9]{64}$/); expect((await f.impact()).impactHash).toBe(impact.impactHash);
    expect(await f.clear(impact.impactHash)).toEqual({ success: true, ledgerId: 37, userId: 201, categoryId: 10, categoryName: '普通',
      affectedDays: 2, cleared: { amount: '0', ratio: '0', targetAmount: '0', startDate: '' } });
    const before = rawFields(raw), after = rawFields(f.state.raw);
    for (const [key, value] of before) if (![ '普通', '普通__ratio', '普通__targetAmount', '普通__startDate' ].includes(key)) expect(after.get(key)).toBe(value);
    expect(f.writes()).toHaveLength(1); expect(f.writes()[0].values.slice(0, 8)).toEqual([
      '$."普通"', 0, '$."普通__ratio"', 0, '$."普通__targetAmount"', 0, '$."普通__startDate"', '',
    ]);
    expect(f.connection.commit).toHaveBeenCalledOnce(); expect(f.connection.rollback).not.toHaveBeenCalled(); expect(f.connection.release).not.toHaveBeenCalled();
  });
  it.each(['amount', 'ratio', 'date', 'recordAmount', 'recordDate', 'insert', 'delete', 'rename', 'pause', 'visible', 'role', 'today', 'transfer'])('预检后%s变化拒绝不覆盖，回滚且不释放caller连接', async mode => {
    const f = fixture(); const impact = await f.impact();
    f.state.beforeLockedMember = () => {
      if (mode === 'amount') f.state.raw = JSON.stringify({ ...BASE, 普通: 2000 });
      if (mode === 'ratio') f.state.raw = JSON.stringify({ ...BASE, 普通__ratio: 25 });
      if (mode === 'date') f.state.raw = JSON.stringify({ ...BASE, 普通__startDate: '2026-11-03' });
      if (mode === 'recordAmount') f.state.records[0].amount = '101';
      if (mode === 'recordDate') f.state.records[0].recordDate = '2026-11-03';
      if (mode === 'insert') f.state.records.push(record(3, '2026-11-07'));
      if (mode === 'delete') f.state.records[0].deletedAt = '2026-11-09';
      if (mode === 'pause') f.state.raw = JSON.stringify({ ...BASE, 普通__pauseHistory: '[{"pauseDate":"2026-11-03"}]' });
      if (mode === 'transfer') f.state.records.push({ ...record(3, '2026-11-07', '25', 'transfer'), description: 'capital_add' });
      if (mode === 'visible') f.state.raw = JSON.stringify({ ...BASE, 普通__visible: 0 });
      if (mode === 'role') f.state.members[0].role = 'admin';
    };
    // 分类锁读取之前的改名和today变化也必须导致hash不同。
    if (mode === 'rename') f.state.categories[0].name = '新名';
    if (mode === 'today') vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    await expect(f.clear(impact.impactHash)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(f.writes()).toHaveLength(0); expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.connection.release).not.toHaveBeenCalled();
  });
  it('预检后无关tag/押金字段最新变更保留，不回写旧快照', async () => {
    const f = fixture(); const impact = await f.impact();
    f.state.beforeLockedMember = () => { f.state.raw = JSON.stringify({ ...BASE, other: 'LATEST', 普通__margins: '[{"amount":"999"}]' }); };
    await f.clear(impact.impactHash); expect(JSON.parse(f.state.raw!)).toMatchObject({ other: 'LATEST', 普通__margins: '[{"amount":"999"}]' });
  });
  it.each(['', 'bad', 'a'.repeat(64)])('缺失/错误hash%j不写', async hash => {
    const f = fixture(); await expect(f.clear(hash)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(f.writes()).toHaveLength(0);
  });
  it('readOnly禁止clear，GET仍仅SELECT', async () => {
    const f = fixture(); const impact = await getOrdinaryTagClearImpact(INPUT, { ...f.deps, readOnly: true });
    await expect(clearOrdinaryTagMemberConfig({ ...INPUT, impactHash: impact.impactHash }, { ...f.deps, readOnly: true }))
      .rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(f.connection.beginTransaction).not.toHaveBeenCalled(); expect(f.writes()).toHaveLength(0);
  });
  it.each(['read', 'update', 'affectedRows', 'commit'])('%s失败rollback恢复原值并不报告成功', async failure => {
    const f = fixture(); const impact = await f.impact(); const before = f.state.raw;
    f.state.failRead = failure === 'read'; f.state.failUpdate = failure === 'update';
    f.state.affectedRows = failure === 'affectedRows' ? 0 : 1; f.state.failCommit = failure === 'commit';
    await expect(f.clear(impact.impactHash)).rejects.toThrow(); expect(f.connection.rollback).toHaveBeenCalledOnce();
    expect(f.state.raw).toBe(before); expect(f.connection.release).not.toHaveBeenCalled();
  });
  it('rollback失败AggregateError保留原始故障，不假成功', async () => {
    const f = fixture(); const impact = await f.impact(); f.state.failUpdate = true; f.state.failRollback = true;
    await expect(f.clear(impact.impactHash)).rejects.toBeInstanceOf(AggregateError);
  });
  it('不导入db/巨型router、不调用旧更新/资金函数、不建表或网络', () => {
    const source = readFileSync(new URL('./ordinary-tag-clear-config.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]\.\/db|import\(['"]\.\/db|routers|updateLedger37InitialBalances|\bfetch\(|CREATE TABLE|JSON_REMOVE/);
  });
});
