import { describe, expect, it, vi } from 'vitest';
import { saveOrdinaryTagMemberDetailConfig, validateOrdinaryDetailPatch } from './ordinary-tag-detail-config';

const name = '普通标签';
const previous = { [name]: 200000, [`${name}__ratio`]: 5, [`${name}__targetAmount`]: 10000, [`${name}__startDate`]: '2026-01-01', '其他标签': 4321, '股票__ratio': 9 };
const input = (balances: Record<string, number | string> = { [`${name}__startDate`]: '2026-02-01' }) => ({ ledgerId: 37, targetUserId: 102, actorUserId: 101, scopedOrdinaryCategoryId: 7, balances });
function fixture(overrides: Record<string, any> = {}) {
  const state = { updates: [] as Array<{ sql: string; values: unknown[] }>, rollbacks: 0, commits: 0 };
  const connection = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => { state.commits++; }),
    rollback: vi.fn(async () => { state.rollbacks++; }),
    execute: vi.fn(async (sql: string, values: unknown[]) => {
      if (sql.startsWith('SELECT id FROM ledgers')) return [[{ id: 37 }], []];
      if (sql.includes('FROM ledger_categories')) return [[{ id: 7, name, parentId: null, isDefault: 0, accountingMode: 'manual_balance', ...overrides.category }, { id: 8, name: '股票', parentId: null, isDefault: 0, accountingMode: 'stock_portfolio' }], []];
      if (sql.includes('FROM ledger_members')) return [[{ id: 1, userId: 101, role: 'admin', memberType: 'real', realUserId: 101, ...overrides.actor }, { id: 2, userId: 102, role: 'member', memberType: 'real', realUserId: 102, initialBalances: overrides.raw ?? JSON.stringify(previous), ...overrides.target }], []];
      if (sql.startsWith('UPDATE ledger_members')) { state.updates.push({ sql, values }); return [{ affectedRows: overrides.affectedRows ?? 1 }, []]; }
      throw new Error('unexpected SQL');
    }),
  };
  return { state, connection };
}
describe('37号普通标签详情限域保存', () => {
  it('只JSON_SET当前日期，不删除股票兼容键、其他标签、历史资金或旧备注', async () => {
    const f = fixture(); await expect(saveOrdinaryTagMemberDetailConfig(input(), f.connection)).resolves.toEqual({ success: true });
    expect(f.state.updates).toHaveLength(1); const update = f.state.updates[0];
    expect(update.sql).toContain('JSON_SET'); expect(update.sql).not.toContain('JSON_REMOVE');
    expect(update.values).toEqual([`$.${JSON.stringify(`${name}__startDate`)}`, '2026-02-01', 2, 37, 102]);
    expect(f.state.commits).toBe(1); expect(f.state.rollbacks).toBe(0);
    for (const [sql] of f.connection.execute.mock.calls) expect(sql).not.toMatch(/DELETE|INSERT|wallet|ledger_records/i);
  });
  it('一次更新本标签金额三键和日期，不序列化回写旧JSON', async () => {
    const f = fixture(); const balances = { [name]: 200000, [`${name}__ratio`]: 10, [`${name}__targetAmount`]: 20000, [`${name}__startDate`]: '2026-02-01' };
    await saveOrdinaryTagMemberDetailConfig(input(balances), f.connection); expect(f.state.updates).toHaveLength(1);
    expect(f.state.updates[0].values).not.toContain(JSON.stringify(previous)); expect(f.state.updates[0].values).toHaveLength(11);
  });
  it.each([125, 200])('普通标签%s%%按初始金额×比例/100保存，不校验成员合计上限', async ratio => {
    const f = fixture();
    const balances = { [name]: 200000, [`${name}__ratio`]: ratio, [`${name}__targetAmount`]: 200000 * ratio / 100 };
    await expect(saveOrdinaryTagMemberDetailConfig(input(balances), f.connection)).resolves.toEqual({ success: true });
    expect(f.state.updates).toHaveLength(1);
    expect(f.state.updates[0].values).toEqual([`$.${JSON.stringify(name)}`, 200000, `$.${JSON.stringify(`${name}__ratio`)}`, ratio, `$.${JSON.stringify(`${name}__targetAmount`)}`, balances[`${name}__targetAmount`], 2, 37, 102]);
    expect(f.connection.execute.mock.calls.some(([sql]) => /SUM|wallet|ledger_records|DELETE|INSERT/i.test(sql))).toBe(false);
  });
  it.each([
    [1000, -1, 0], [1000, NaN, 0], [1000, Infinity, 0], [1000, 125, 1000],
    [Number.MAX_VALUE, 200, Number.MAX_VALUE], [Number.MAX_VALUE, 0, Infinity],
  ])('非法数字、权益不符或乘积溢出拒绝，金额=%s比例=%s权益=%s', async (amount, ratio, target) => {
    const f = fixture();
    await expect(saveOrdinaryTagMemberDetailConfig(input({ [name]: amount, [`${name}__ratio`]: ratio, [`${name}__targetAmount`]: target }), f.connection)).rejects.toThrow();
    expect(f.state.updates).toHaveLength(0); expect(f.state.commits).toBe(0); expect(f.state.rollbacks).toBe(1);
  });
  it('旧杠杆三键不完整时只维护日期，不修改或迁移旧金额', async () => {
    const f = fixture({ raw: JSON.stringify({ ...previous, [`${name}__ratio`]: 200, [`${name}__targetAmount`]: 'legacy' }) });
    await saveOrdinaryTagMemberDetailConfig(input(), f.connection);
    expect(f.state.updates[0].values).toEqual([`$.${JSON.stringify(`${name}__startDate`)}`, '2026-02-01', 2, 37, 102]);
  });
  it.each([{ category: { accountingMode: 'stock_portfolio' } }, { category: { parentId: 3 } }, { category: { isDefault: 1 } }, { actor: { role: 'member' } }, { actor: { realUserId: null } }, { target: { memberType: 'ai' } }, { raw: 'null' }, { raw: '{bad' }])('异常范围/权限/配置拒绝且回滚：%j', async overrides => {
    const f = fixture(overrides); await expect(saveOrdinaryTagMemberDetailConfig(input(), f.connection)).rejects.toThrow();
    expect(f.state.updates).toHaveLength(0); expect(f.state.commits).toBe(0); expect(f.state.rollbacks).toBe(1);
  });
  it('更新未确认成功则回滚，不虚假返回成功', async () => {
    const f = fixture({ affectedRows: 0 }); await expect(saveOrdinaryTagMemberDetailConfig(input(), f.connection)).rejects.toThrow('未保存');
    expect(f.state.commits).toBe(0); expect(f.state.rollbacks).toBe(1);
  });
  it.each([{ ledgerId: 52 }, { actorUserId: 0 }, { targetUserId: 0 }, { scopedOrdinaryCategoryId: -1 }])('非法目标在事务前拒绝：%j', async patch => {
    const f = fixture(); await expect(saveOrdinaryTagMemberDetailConfig({ ...input(), ...patch }, f.connection)).rejects.toThrow(); expect(f.connection.beginTransaction).not.toHaveBeenCalled();
  });
  it.each([{ '其他标签__ratio': 2 }, { [`${name}__visible`]: 0 }, { [`${name}__ordinaryObservation`]: '{}' }, { [`${name}__startDate`]: '2026-02-30' }, { [name]: 200000 }, { [name]: 200000, [`${name}__ratio`]: 10, [`${name}__targetAmount`]: 1 }, { [`${name}__pauseHistory`]: '{}' }, { [`${name}__margins`]: '[null]' }])('非法配置不写入：%j', async balances => {
    const f = fixture(); await expect(saveOrdinaryTagMemberDetailConfig(input(balances), f.connection)).rejects.toThrow(); expect(f.state.updates).toHaveLength(0);
  });
  it('完整清空不能绕过真实影响天数确认', () => {
    expect(() => validateOrdinaryDetailPatch(name, { [name]: 0, [`${name}__ratio`]: 0, [`${name}__targetAmount`]: 0, [`${name}__startDate`]: '' }, previous)).toThrow('受影响天数');
  });
  it('观察状态下禁止回写正的真实份额', () => {
    const before = { ...previous, [`${name}__ordinaryObservation`]: JSON.stringify({ enabled: true, initialAmount: 200000, ratio: 5, startDate: '2026-01-01', pauseDate: null }) };
    expect(() => validateOrdinaryDetailPatch(name, { [name]: 200000, [`${name}__ratio`]: 5, [`${name}__targetAmount`]: 10000 }, before)).toThrow();
    expect(() => validateOrdinaryDetailPatch(name, { [name]: 200000, [`${name}__ratio`]: 125, [`${name}__targetAmount`]: 250000 }, before)).toThrow('先关闭观察');
    expect(() => validateOrdinaryDetailPatch(name, { [name]: 200000, [`${name}__ratio`]: 0, [`${name}__targetAmount`]: 0 }, before)).not.toThrow();
  });
  it('损坏的观察配置不能按未开启绕过校验', () => {
    expect(() => validateOrdinaryDetailPatch(name, { [`${name}__startDate`]: '2026-02-01' }, { ...previous, [`${name}__ordinaryObservation`]: '{bad' })).toThrow('观察配置格式异常');
  });
  it('正常保存暂停计划和参考押金只更新配置，不调用钱包', async () => {
    const f = fixture(); const balances = { [`${name}__pauseHistory`]: JSON.stringify([{ pauseDate: '2026-11-09' }]), [`${name}__pauseDate`]: '2026-11-09', [`${name}__margins`]: '[{"id":"m1","coin":"CNY","amount":300}]', [`${name}__margin`]: 300, [`${name}__marginCoin`]: 'CNY' };
    await saveOrdinaryTagMemberDetailConfig(input(balances), f.connection); expect(f.state.updates).toHaveLength(1); expect(f.state.commits).toBe(1);
  });
});
