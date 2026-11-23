import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const deps = vi.hoisted(() => ({ db: vi.fn(), lock: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: deps.db, withDatabaseLock: deps.lock }));
import { calendarNumberSchema, saveCalendarNumberSchema, calendarNumberCategoriesSchema,
  getCalendarNumber, saveCalendarNumber, getCalendarNumberCategories, assertLedger37Owner,
  assertLedger37ResourceOwner, getLedger37Access, prepareLedger37PersonalConfigPatch } from './ledger37-calendar-recorder';
const admin = { user: { id: 201 }, realUser: { id: 201 }, isViewingAs: false };
const owner = { user: { id: 100 }, realUser: { id: 100 }, isViewingAs: false };
const input = { ledgerId: 37, categoryId: 90300, date: '2026-11-01' };
function fixture() {
  const state = { role: 'admin', ownerId: 100, member: true, memberType: 'real', balances: '{}', permissionAdd: null as string | null,
    category: { id: 90300, ledgerId: 37, name: '普通甲', parentId: null as number | null, isDefault: 0, accountingMode: 'manual_balance', type: 'expense' },
    records: [] as any[], config: {} as any, affected: 1 };
  const log: Array<{ sql: string; values: any[] }> = [];
  const conn = { execute: vi.fn(async (sql: string, values: any[] = []) => {
    log.push({ sql, values });
    if (/FROM ledgers l/.test(sql)) return [[{ ownerId: state.ownerId, memberRole: values[0] === 100 ? 'owner' : state.role,
      memberUserId: state.member && state.memberType !== 'ai' ? values[0] : null, initialBalances: state.balances, permissionAdd: state.permissionAdd }]];
    if (/FROM ledger_categories/.test(sql)) {
      if (/AS ledgerId/.test(sql)) return [[{ ledgerId: state.category.ledgerId }]];
      return [[state.category]];
    }
    if (/FROM ledger_tag_config/.test(sql)) return [[state.config]];
    if (/FROM ledger_records/.test(sql)) {
      if (/AS ledgerId/.test(sql)) return [[{ ledgerId: 37 }]];
      return [state.records.map(r => ({ ...r }))];
    }
    if (/^UPDATE ledger_records/.test(sql)) {
      state.records[0].amount = values[0];
      return [{ affectedRows: state.affected }];
    }
    if (/^INSERT INTO ledger_records/.test(sql)) {
      state.records.push({ id: 17, amount: values[0], type: 'expense', description: null, stock_codes: null,
        reimbursement_status: 'none', pending_type: null, aj_status: null, createdBy: values[3] });
      return [{ insertId: 17 }];
    }
    throw new Error('离线禁止非白名单SQL: ' + sql);
  }) };
  deps.db.mockResolvedValue(conn);
  let previous = Promise.resolve();
  deps.lock.mockImplementation((_key, operation) => {
    const result = previous.then(operation);
    previous = result.catch(() => undefined);
    return result;
  });
  const writes = () => log.filter(r => /^INSERT|^UPDATE|^DELETE|^ALTER|^CREATE/.test(r.sql));
  return { state, conn, log, writes };
}
function daily(extra = {}) { return { id: 16, amount: '123.00', type: 'expense', description: '日余额补录', stock_codes: null,
  reimbursement_status: 'none', pending_type: null, aj_status: null, createdBy: 999, imageUrl: 'secret', images: '["private"]', ...extra }; }
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-20T16:01:00Z')); });
afterEach(() => vi.useRealTimers());
describe('37日历数字严格schema / mockDB边界', () => {
  it('北京时间今天可登记，未来/不存在日期/非37拒绝', () => {
    expect(calendarNumberSchema.parse({ ...input, date: '2026-11-21' })).toBeTruthy();
    for (const change of [{ ledgerId: 52 }, { date: '2026-11-22' }, { date: '2026-02-30' }, { date: '2026-1-01' }, { categoryId: 0 }, { categoryId: 1.2 }])
      expect(calendarNumberSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it('数字字段外所有输入字段拒绝、不接受transfer或他人身份', () => {
    for (const extra of [{ type: 'transfer' }, { userId: 100 }, { viewAsUserId: 100 }, { description: 'x' }, { images: [] }, { memberId: 100 }, { stockCodes: [] }, { subcategoryId: 2 }]) {
      expect(saveCalendarNumberSchema.safeParse({ ...input, amount: 5, ...extra }).success).toBe(false);
      expect(calendarNumberSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    expect(calendarNumberCategoriesSchema.safeParse({ ledgerId: 37, userId: 201 }).success).toBe(false);
    for (const amount of [-1, NaN, Infinity, 100000000, 1.001, '1', null]) expect(saveCalendarNumberSchema.safeParse({ ...input, amount }).success).toBe(false);
    for (const amount of [0, 12.34, 99999999.99]) expect(saveCalendarNumberSchema.safeParse({ ...input, amount }).success).toBe(true);
  });
  it.each(['member', 'viewer', 'funder', 'owner'])('非owner真实%s不能登记，系统角色不能授予且零写入', async role => {
    const f = fixture(); f.state.role = role;
    const ctx = { ...admin, user: { ...admin.user, role: 'super_admin' } };
    await expect(saveCalendarNumber(ctx, { ...input, amount: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(getCalendarNumber(ctx, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(getCalendarNumberCategories(ctx, { ledgerId: 37 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.writes()).toEqual([]); expect(deps.lock).not.toHaveBeenCalled();
  });
  it.each([{ ...admin, isViewingAs: true }, { ...admin, realUser: { id: 100 } }, { ...owner, isViewingAs: true }])('代看/操作者不一致登记与owner管理拒绝', async ctx => {
    const f = fixture(); await expect(saveCalendarNumber(ctx, { ...input, amount: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(assertLedger37Owner(ctx, 37)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.writes()).toEqual([]); expect(deps.lock).not.toHaveBeenCalled();
  });
  it.each(['no-member', 'ai'])('非真实成员%s禁止且零写', async mode => {
    const f = fixture(); if (mode === 'no-member') f.state.member = false; else f.state.memberType = 'ai';
    await expect(saveCalendarNumber(admin, { ...input, amount: 2 })).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]);
  });
  it.each(['none', 'own', 'all', null])('admin日历登记独立于旧通用添加权限%s且不开放管理', async permissionAdd => {
    const f = fixture(); f.state.permissionAdd = permissionAdd;
    expect(await getLedger37Access(admin)).toMatchObject({ canManage: false, canRecordCalendar: true, row: { permissionAdd } });
    expect(await getCalendarNumberCategories(admin, { ledgerId: 37 })).toEqual([{ categoryId: 90300, name: '普通甲' }]);
    expect(await getCalendarNumber(admin, input)).toEqual({ amount: null, exists: false });
    await saveCalendarNumber(admin, { ...input, amount: 2 });
    expect(f.writes()).toHaveLength(1); expect(f.state.permissionAdd).toBe(permissionAdd);
    await saveCalendarNumber(admin, { ...input, amount: 3, overwriteExisting: true });
    expect(f.writes()).toHaveLength(2); expect(f.state.records[0].amount).toBe('3.00');
    await expect(assertLedger37Owner(admin, 37)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('owner仅取ledgers.ownerId且admin真实角色保留、无管理能力', async () => {
    fixture(); expect(await getLedger37Access(admin)).toMatchObject({ canManage: false, canRecordCalendar: true, row: { memberRole: 'admin' } });
    expect(await getLedger37Access(owner)).toMatchObject({ canManage: true, canRecordCalendar: true });
    await expect(assertLedger37Owner(admin, 37)).rejects.toMatchObject({ code: 'FORBIDDEN' }); await expect(assertLedger37Owner(owner, 37)).resolves.toBeUndefined();
  });
  it.each([{ ledgerId: 52 }, { accountingMode: 'stock_portfolio' }, { parentId: 8 }, { isDefault: 1 }, { type: 'transfer' }])('跨账本/股票/子分类/默认/转账标签拒绝%j', async change => {
    const f = fixture(); Object.assign(f.state.category, change);
    await expect(saveCalendarNumber(admin, { ...input, amount: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]);
  });
  it.each(['{"普通甲__visible":0}', '{"__tagVisibilityDefault":0}', 'broken', '[]'])('隐藏或损坏设置fail closed %s', async balances => {
    const f = fixture(); f.state.balances = balances;
    if (balances === 'broken' || balances === '[]') await expect(getCalendarNumberCategories(admin, { ledgerId: 37 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    else await expect(getCalendarNumberCategories(admin, { ledgerId: 37 })).resolves.toEqual([]);
    await expect(saveCalendarNumber(admin, { ...input, amount: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]);
  });
  it('目录仅标签ID+名称，没有余额/股票/成员/配置', async () => {
    const f = fixture(); expect(await getCalendarNumberCategories(admin, { ledgerId: 37 })).toEqual([{ categoryId: 90300, name: '普通甲' }]);
    expect(f.log.every(r => !/FROM ledger_records|UPDATE|INSERT|ALTER|CREATE/.test(r.sql))).toBe(true);
  });
  it('空记录纯数字固定expense写入，没有附件/备注/转账/分红/审批副作用', async () => {
    const f = fixture(); expect(await getCalendarNumber(admin, input)).toEqual({ amount: null, exists: false });
    expect(await saveCalendarNumber(admin, { ...input, amount: 0 })).toEqual({ success: true, amount: 0, exists: true, overwritten: false });
    expect(f.writes()).toHaveLength(1); expect(f.writes()[0].sql).toContain("VALUES (37, 'expense'");
    expect(f.writes()[0].values).toEqual(['0.00', 90300, '2026-11-01', 201]);
    expect(deps.lock).toHaveBeenCalledWith('ledger37:90300:2026-11-01', expect.any(Function));
  });
  it('同日覆盖必须确认，仅amount与updatedAt更新、createdBy及所有元数据保留', async () => {
    const f = fixture(); f.state.records = [daily()];
    expect(await getCalendarNumber(admin, input)).toEqual({ amount: 123, exists: true });
    await expect(saveCalendarNumber(admin, { ...input, amount: 10 })).rejects.toMatchObject({ code: 'CONFLICT' }); expect(f.writes()).toEqual([]);
    const before = { ...f.state.records[0] }; await saveCalendarNumber(admin, { ...input, amount: 10, overwriteExisting: true });
    expect(f.state.records[0]).toEqual({ ...before, amount: '10.00' });
    expect(f.writes()[0].sql).toContain('SET amount = ?, updatedAt = NOW()'); expect(f.writes()[0].sql).toContain("type = 'expense'");
    expect(f.writes()[0].sql).toContain('AND BINARY description <=> BINARY ?');
  });
  it.each([{ type: 'transfer' }, { type: 'income' }, { description: 'capital_add' }, { description: 'capital_sub:本金' }, { description: '补分红' },
    { description: '提现' }, { pending_type: 'payable' }, { reimbursement_status: 'pending' }, { reimbursement_status: 'completed' }, { aj_status: 'pending' }, { stock_codes: '[{"code":"x"}]' }])('特殊资金记录禁止数字读与覆盖%j', async change => {
    const f = fixture(); f.state.records = [daily(change)];
    await expect(getCalendarNumber(admin, input)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(saveCalendarNumber(admin, { ...input, amount: 1, overwriteExisting: true })).rejects.toMatchObject({ code: 'CONFLICT' }); expect(f.writes()).toEqual([]);
  });
  it('历史重复歧义拒绝，不软删除任何重复项', async () => {
    const f = fixture(); f.state.records = [daily(), daily({ id: 17 })]; await expect(saveCalendarNumber(admin, { ...input, amount: 1, overwriteExisting: true })).rejects.toMatchObject({ code: 'CONFLICT' }); expect(f.writes()).toEqual([]);
  });
  it('暂停截止日后拒绝，历史回填允许', async () => {
    const f = fixture(); f.state.config = { pause_date: '2026-10-31' }; await expect(saveCalendarNumber(admin, { ...input, amount: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]);
    await saveCalendarNumber(admin, { ...input, date: '2026-10-30', amount: 1 }); expect(f.writes()).toHaveLength(1);
  });
  it('并发无确认请求共用旧锁，第二次冲突仅一条写入', async () => {
    const f = fixture(); const results = await Promise.allSettled([saveCalendarNumber(admin, { ...input, amount: 1 }), saveCalendarNumber(admin, { ...input, amount: 2 })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(f.writes()).toHaveLength(1); expect(f.state.records).toHaveLength(1);
  });
  it('锁内权限重新核验，撤销admin时第一条写之前拒绝', async () => {
    const f = fixture(); deps.lock.mockImplementation(async (_key, operation) => { f.state.role = 'member'; return operation(); });
    await expect(saveCalendarNumber(admin, { ...input, amount: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]);
  });
  it('非37授权helper不改变原行为、不连接DB', async () => { fixture(); await assertLedger37Owner(admin, 52); expect(deps.db).not.toHaveBeenCalled(); });
  it('resource真实归37时拒绝旧交易/分类管理，第一写入前', async () => { const f = fixture(); await expect(assertLedger37ResourceOwner(admin, 'record', 16)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]); });
  it('普通member/admin本人note/alias可窄写，任意资金设置拒绝且无DB写', async () => {
    const f = fixture(); f.state.role = 'member'; f.state.balances = '{"普通甲":100,"普通甲__ratio":0.2,"普通甲__note":"旧"}';
    await expect(prepareLedger37PersonalConfigPatch(admin, 37, { '普通甲': 100, '普通甲__ratio': 0.2, '普通甲__note': '新', '普通甲__alias': '自己名字' })).resolves.toEqual({ '普通甲__note': '新', '普通甲__alias': '自己名字' });
    for (const patch of [{ '普通甲': 101 }, { '普通甲__ratio': 1 }, { '普通甲__visible': 1 }, { '普通甲__margin': 1 }, { '普通甲__pauseDate': '2026-01-01' }, { '普通甲__startDate': '2026-01-01' }, { '股票__note': 'x' }])
      await expect(prepareLedger37PersonalConfigPatch(admin, 37, patch)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.writes()).toEqual([]);
  });

});
