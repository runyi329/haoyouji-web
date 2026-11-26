import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrdinaryTagDownsideRule } from '../shared/ordinary-tag-downside';
import type { UserTagDownsideOverride } from '../shared/user-tag-downside-override';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getDbConnection: vi.fn(), decryptValue: vi.fn(), readOverrides: vi.fn(),
  getDbTransactionConnection: vi.fn(() => { throw new Error('transaction forbidden'); }),
  getLedgerDb: vi.fn(() => { throw new Error('legacy DB forbidden'); }) }));
vi.mock('./db', () => ({ getDbConnection: mocks.getDbConnection,
  getDbTransactionConnection: mocks.getDbTransactionConnection, getLedgerDb: mocks.getLedgerDb }));
vi.mock('./encryption', () => ({ decryptValue: mocks.decryptValue, isEncrypted: (value: string) => value.startsWith('enc:v1:') }));
vi.mock('./user-tag-downside-overrides', () => ({ readUserTagDownsideOverrides: mocks.readOverrides }));
import { buildOrdinaryTagDownsideValuation, getMyOrdinaryTagDownsideValuations, ordinaryTagDownsideBusinessDate,
  type OrdinaryTagDownsideValuationRecord } from './ordinary-tag-downside-valuation';

const TODAY = '2026-11-26';
const RULE: OrdinaryTagDownsideRule = { ledgerId: 37, categoryId: 10, userId: 100, version: 1,
  enabled: true, thresholdAmount: 1000, downsidePercent: 30, startDate: '2026-11-02', createdAt: '2026-11-25T01:02:03.000Z' };
const BALANCES = { 普通: 1000, 普通__ratio: 100, 普通__startDate: '2026-11-02' };
function record(date: string | Date, amount: number | string | null, extra: Partial<OrdinaryTagDownsideValuationRecord> = {}): OrdinaryTagDownsideValuationRecord {
  return { ledgerId: 37, categoryId: 10, recordDate: date, amount, type: 'income', recordId: 1,
    createdAt: '2026-11-26 01:00:00.000000', ...extra };
}
function transfer(date: string, amount: number | string | null, description: string, extra: Partial<OrdinaryTagDownsideValuationRecord> = {}) {
  return record(date, amount, { type: 'transfer', description, ...extra });
}
function build(records: OrdinaryTagDownsideValuationRecord[], balances: Record<string, unknown> = BALANCES,
  rules: OrdinaryTagDownsideRule[] = [RULE], today = TODAY) {
  return buildOrdinaryTagDownsideValuation({ ledgerId: 37, userId: 201, categoryId: 10, categoryName: '普通', balances, records, rules, today });
}
let members: Array<{ id: number; ledgerId: number; userId: number; memberType: string; role: string; initialBalances: string | null; ownerId: number }>;
let categories: Array<{ id: number; ledgerId: number; name: string; parentId: number | null; isDefault: number; accountingMode: string }>;
let records: OrdinaryTagDownsideValuationRecord[];
let rules: OrdinaryTagDownsideRule[];
let ruleError: Error | null;
function ownBalances(value: Record<string, unknown>) { members.find(m => m.userId === 201)!.initialBalances = JSON.stringify(value); }
function queries(fragment: string) { return mocks.execute.mock.calls.filter(([sql]) => sql.includes(fragment)); }
function rowsOfRules() { return rules.map(rule => ({ ledger_id: rule.ledgerId, category_id: rule.categoryId, user_id: rule.userId,
  version: rule.version, enabled: rule.enabled ? 1 : 0, threshold_amount: rule.thresholdAmount, downside_percent: rule.downsidePercent,
  start_date: rule.startDate, created_at: rule.createdAt })); }
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-26T08:00:00+08:00'));
  members = [
    { id: 1, ledgerId: 37, userId: 201, memberType: 'real', role: 'member', initialBalances: JSON.stringify(BALANCES), ownerId: 100 },
    { id: 2, ledgerId: 37, userId: 100, memberType: 'real', role: 'owner', initialBalances: JSON.stringify(BALANCES), ownerId: 100 },
    { id: 3, ledgerId: 37, userId: 202, memberType: 'real', role: 'member', initialBalances: JSON.stringify({ secretOtherUser: 987654321 }), ownerId: 100 },
  ];
  categories = [{ id: 10, ledgerId: 37, name: '普通', parentId: null, isDefault: 0, accountingMode: 'manual_balance' }];
  records = [record('2026-11-02', 1000), record(TODAY, 900)];
  rules = [RULE]; ruleError = null;
  mocks.getDbConnection.mockResolvedValue({ execute: mocks.execute });
  mocks.readOverrides.mockResolvedValue([]);
  mocks.decryptValue.mockImplementation((value: string) => value === 'enc:v1:valid' ? 'capital_add:private' : value);
  mocks.execute.mockImplementation(async (sql: string, values: Array<number | string>) => {
    if (sql.includes('FROM ledger_members m')) return [members.filter(m => m.ledgerId === values[0] && m.userId === values[1]), []];
    if (sql.includes('FROM ledger_ordinary_tag_downside_rules')) {
      if (ruleError) throw ruleError;
      return [rowsOfRules().filter(r => r.ledger_id === values[0]), []];
    }
    if (sql.includes('FROM ledger_categories')) return [categories.filter(c => c.ledgerId === values[0]), []];
    if (sql.includes('FROM ledger_records')) {
      const n = (values.length - 2) / 5;
      const ids = new Set(values.slice(1, 1 + n));
      return [records.flatMap(row => {
        const c = categories.find(c => c.ledgerId === row.ledgerId && c.id === row.categoryId);
        if (row.ledgerId !== 37 || !c || (!ids.has(c.id) && !ids.has(c.parentId ?? -1))) return [];
        return [{ ...row, categoryId: c.parentId ?? c.id }];
      }), []];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});
afterEach(() => {
  expect(mocks.getDbTransactionConnection).not.toHaveBeenCalled(); expect(mocks.getLedgerDb).not.toHaveBeenCalled();
  for (const [sql] of mocks.execute.mock.calls) {
    expect(sql).toMatch(/^\s*SELECT\b/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|wallet|balance_history|recharge_orders|af_manual_balances|ledger_stock_\w*)\b/i);
  }
  vi.useRealTimers();
});

describe('getMyOrdinaryTagDownsideValuations member scope and batch SELECT only', () => {
  it.each([0, -1, NaN, 1.5, undefined])('invalid effective user %s rejects before DB', async userId => {
    await expect(getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: userId as number })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(mocks.getDbConnection).not.toHaveBeenCalled();
  });
  it.each([52, 0, 36, '37'])('strict ledger %s rejects before DB', async ledgerId => {
    await expect(getMyOrdinaryTagDownsideValuations({ ledgerId: ledgerId as number, userId: 201 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.getDbConnection).not.toHaveBeenCalled();
  });
  it.each(['viewAsUserId', 'targetUserId', 'actorUserId'])('client third user via %s is not accepted', async key => {
    await expect(getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201, [key]: 202 } as any)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.getDbConnection).not.toHaveBeenCalled();
  });
  it.each(['ai', 'missing', 'wrongLedger'])('%s membership denies before rules/categories/history', async kind => {
    if (kind === 'ai') members[0].memberType = 'ai';
    if (kind === 'missing') members = members.filter(m => m.userId !== 201);
    if (kind === 'wrongLedger') members[0].ledgerId = 52;
    await expect(getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201, systemRole: 'admin' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('membership join verifies real user, no other member list or wallet fields', async () => {
    const result = await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 });
    expect(queries('FROM ledger_members')).toHaveLength(1);
    const [sql, values] = queries('FROM ledger_members')[0];
    expect(values).toEqual([37, 201]); expect(sql).toContain('INNER JOIN users u ON u.id = m.userId');
    expect(sql).toContain('l.ownerId'); expect(sql).not.toContain('u.balance');
    expect(JSON.stringify(result)).not.toMatch(/secretOtherUser|987654321|initialBalances|memberType/);
  });
  it('no saved rules exits after member + one rule batch (2 queries)', async () => {
    rules = []; ownBalances({ __tagVisibilityDefault: 0 });
    expect(await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 })).toEqual({ ledgerId: 37, categories: [] });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(queries('FROM ledger_categories')).toHaveLength(0); expect(queries('FROM ledger_records')).toHaveLength(0);
  });
  it('rule read failure throws rather than raw or empty result', async () => {
    ruleError = new Error('rules unavailable');
    await expect(getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 })).rejects.toThrow('rules unavailable');
    expect(mocks.execute).toHaveBeenCalledTimes(2); expect(queries('FROM ledger_records')).toHaveLength(0);
  });
  it('saved disabled history stays eligible, unlike no configured rule', async () => {
    rules = [{ ...RULE, enabled: false }];
    const result = await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 });
    expect(result.categories).toHaveLength(1); expect(result.categories[0].totalPnl).toBe(100);
    expect(result.categories[0].points.at(-1)?.ruleVersion).toBe(1);
  });
  it.each(['member', 'admin', 'owner'])('%s memberRole does not upgrade hidden category visibility', async role => {
    members[0].role = role; ownBalances({ ...BALANCES, 普通__visible: 0 });
    expect(await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201, systemRole: 'admin' })).toEqual({ ledgerId: 37, categories: [] });
    expect(queries('FROM ledger_records')).toHaveLength(0);
  });
  it('only actual ledger owner, not viewingAs, can read hidden categories', async () => {
    members[1].role = 'member'; members[1].initialBalances = JSON.stringify({ ...BALANCES, 普通__visible: 0 });
    const own = await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 100 }); expect(own.categories).toHaveLength(1);
    mocks.execute.mockClear();
    const viewing = await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 100, isViewingAs: true });
    expect(viewing.categories).toEqual([]); expect(queries('FROM ledger_records')).toHaveLength(0);
  });
  it('viewAs read permitted for effective real member but hidden remains hidden', async () => {
    const result = await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201, isViewingAs: true });
    expect(result.categories).toHaveLength(1); expect(queries('FROM ledger_members')[0][1]).toEqual([37, 201]);
  });
  it('new member default-hidden requires explicit tag visibility', async () => {
    ownBalances({ ...BALANCES, __tagVisibilityDefault: 0 });
    expect((await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 })).categories).toEqual([]);
    ownBalances({ ...BALANCES, __tagVisibilityDefault: 0, 普通__visible: 1 });
    expect((await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 })).categories).toHaveLength(1);
  });
  it('invalid member JSON refuses visibility broadening and never writes', async () => {
    members[0].initialBalances = 'broken';
    await expect(getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(queries('FROM ledger_records')).toHaveLength(0);
  });
  it('4 valuation queries plus one mocked override batch for many eligible roots, no N+1', async () => {
    const root = categories[0];
    categories.push({ ...root, id: 20, name: '第二' }, { ...root, id: 30, name: '第三' },
      { ...root, id: 40, name: '未配置' }, { ...root, id: 50, name: '隐藏' },
      { ...root, id: 60, name: '默认', isDefault: 1 }, { ...root, id: 70, name: '股票', accountingMode: 'stock_portfolio' },
      { ...root, id: 80, name: '子', parentId: 10 }, { ...root, id: 90, ledgerId: 52, name: '其他账本' });
    rules = categories.map(c => ({ ...RULE, categoryId: c.id })); rules = rules.filter(r => r.categoryId !== 40);
    ownBalances({ ...BALANCES, 第二: 1000, 第二__startDate: '2026-11-02', 第三: 1000, 第三__startDate: '2026-11-02', 隐藏__visible: 0 });
    records.push(record(TODAY, 800, { categoryId: 20 }), record(TODAY, 700, { categoryId: 30 }), record(TODAY, 42, { categoryId: 80, recordId: 8 }));
    const result = await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 });
    expect(result.categories.map(c => c.categoryId)).toEqual([10, 20, 30]);
    expect(result.categories[0].points.at(-1)?.balance).toBe(42); expect(mocks.execute).toHaveBeenCalledTimes(4);
    expect(mocks.readOverrides).toHaveBeenCalledTimes(1);
    expect(mocks.readOverrides).toHaveBeenCalledWith(expect.objectContaining({ execute: mocks.execute }), 37, 201);
    expect(queries('FROM ledger_ordinary_tag_downside_rules')).toHaveLength(1); expect(queries('FROM ledger_records')).toHaveLength(1);
    const [sql, values] = queries('FROM ledger_records')[0];
    expect(values.slice(0, 8)).toEqual([37, 10, 20, 30, 10, 20, 30, TODAY]);
    expect(values).not.toContain(40); expect(values).not.toContain(50); expect(values).not.toContain(90);
    expect(sql).toContain('c.id IN (?, ?, ?) OR c.parentId IN (?, ?, ?)');
    expect(sql).toContain('COALESCE(c.parentId, c.id) AS categoryId');
  });
  it('direct children map to root, grandchildren and other ledger never enter batch', async () => {
    categories.push({ ...categories[0], id: 11, parentId: 10, name: 'child' }, { ...categories[0], id: 12, parentId: 11, name: 'grandchild' },
      { ...categories[0], id: 13, parentId: 10, ledgerId: 52, name: 'otherledger' });
    records.push(record(TODAY, 0, { categoryId: 11, recordId: 2 }), record(TODAY, 88888, { categoryId: 12, recordId: 3 }),
      record(TODAY, 99999, { categoryId: 13, ledgerId: 52, recordId: 4 }));
    const result = await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 });
    expect(result.categories[0].points.at(-1)?.balance).toBe(0); expect(JSON.stringify(result)).not.toMatch(/88888|99999/);
  });
  it('full history SQL uses DATE_FORMAT + deleted/future/cutoff filters + stable ASC order, no LIMIT', async () => {
    ownBalances({ ...BALANCES, 普通__pauseDate: '2026-11-20' });
    records.push(record('2026-11-19', 900), record('2026-11-20', 800), record('2026-11-27', 11), record('2026-11-18', 12, { deletedAt: '2026-11-19' }));
    const result = await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 });
    const [sql, values] = queries('FROM ledger_records')[0];
    expect(sql).toContain("DATE_FORMAT(r.recordDate, '%Y-%m-%d') AS recordDate");
    expect(sql).toContain('r.deleted_at IS NULL AND r.recordDate <= ?');
    expect(sql).toContain('ORDER BY r.recordDate ASC, r.createdAt ASC, r.id ASC');
    expect(sql).not.toMatch(/\bLIMIT\b|2000|\b200\b/); expect(values).toEqual([37, 10, 10, TODAY, 10, 10, '2026-11-20']);
    expect(result.categories[0].latestDate).toBe('2026-11-20'); expect(result.categories[0].todayPnl).toBeNull();
  });
  it('decrypts real transfer description and never exposes plaintext or ciphertext in DTO', async () => {
    records = [record('2026-11-02', 1000), transfer(TODAY, 100, 'enc:v1:valid'), record(TODAY, 1100)];
    const result = await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 });
    expect(mocks.decryptValue).toHaveBeenCalledWith('enc:v1:valid');
    expect(result.categories[0].points.at(-1)).toMatchObject({ pnl: 0, dailyPnl: 0, capitalChange: 100 });
    expect(JSON.stringify(result)).not.toMatch(/private|enc:v1|description|thresholdAmount|downsidePercent|rules|userId/);
  });
  it('undecryptable transfer throws not pending-as-zero or ordinary withdraw', async () => {
    records.push(transfer(TODAY, 100, 'enc:v1:unreadable'));
    await expect(getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
  it('Beijing day boundary keeps today point while UTC is previous day', async () => {
    vi.setSystemTime(new Date('2026-11-26T00:01:00+08:00'));
    const result = await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 });
    expect(result.categories[0].latestDate).toBe(TODAY); expect(result.categories[0].todayPnl).toBe(30);
    expect(queries('FROM ledger_records')[0][1]).toContain(TODAY);
  });
  it('only new module pure reads; no router, scanner, market, wallet, cache or background import', () => {
    const source = readFileSync(new URL('./ordinary-tag-downside-valuation.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/(?:from|import\()['"].*(?:routers|db-ledger|portfolio|wallet|scanner|scheduler|background|index)/);
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE FROM|CREATE TABLE|setInterval|setTimeout|getDbTransactionConnection)\b/);
  });
});

describe('pure category DTO normalization and real cashflow-neutral series', () => {
  const exemption: UserTagDownsideOverride = { ledgerId: 37, categoryId: 10, targetUserId: 201,
    actorUserId: 100, version: 1, mode: 'exempt', createdAt: '2026-11-26T00:00:00.000Z' };
  const withOverrides = (rows: OrdinaryTagDownsideValuationRecord[], overrides = [exemption], balances: Record<string, unknown> = BALANCES) =>
    buildOrdinaryTagDownsideValuation({ ledgerId: 37, userId: 201, categoryId: 10, categoryName: '普通',
      balances, records: rows, rules: [RULE], userTagDownsideOverrides: overrides, today: TODAY });
  it('用户标签豁免恢复所有历史和累计raw；pure不改规则/记录且不能放宽他人或相邻tag', () => {
    const rows = [record('2026-11-02', 900), record(TODAY, 800)];
    const snapshot = JSON.stringify({ rows, rule: RULE, exemption });
    const exempt = withOverrides(rows);
    expect(exempt.points.map(p => [p.rawPnl, p.pnl, p.dailyPnl, p.countedBalance])).toEqual([[100, 100, 100, 900], [200, 200, 100, 800]]);
    expect(exempt.totalPnl).toBe(200);
    for (const override of [{ ...exemption, targetUserId: 202 }, { ...exemption, categoryId: 20 }]) {
      expect(withOverrides(rows, [override as UserTagDownsideOverride]).totalPnl).toBe(60);
    }
    expect(() => withOverrides(rows, [{ ...exemption, ledgerId: 52 } as unknown as UserTagDownsideOverride])).toThrow();
    expect(JSON.stringify({ rows, rule: RULE, exemption })).toBe(snapshot);
  });
  it('latest follow恢复规则，豁免前后不把纯加减本金或提现变为收益', () => {
    const rows = [record('2026-11-02', 900), transfer('2026-11-03', 200, 'capital_add'),
      transfer('2026-11-04', 100, 'capital_reduce'), transfer('2026-11-05', 50, 'withdraw'), record(TODAY, 950)];
    const exempt = withOverrides(rows);
    expect(exempt.points.at(-1)).toMatchObject({ rawPnl: 100, pnl: 100, dailyPnl: 0, capitalChange: 100, withdrawToDate: 50 });
    expect(withOverrides(rows, [exemption, { ...exemption, version: 2, mode: 'follow_tag' }]).totalPnl).toBe(30);
  });
  it('豁免不能假造entry/本金/最新余额或无数据；个人暂停仍截断历史', () => {
    const rows = [record('2026-11-02', 900), record(TODAY, 500)];
    for (const balances of [{ ...BALANCES, 普通: null }, { ...BALANCES, 普通__startDate: '' }]) {
      expect(withOverrides(rows, [exemption], balances)).toMatchObject({ status: 'pending', totalPnl: null });
    }
    expect(withOverrides([record(TODAY, null)])).toMatchObject({ status: 'pending', totalPnl: null });
    expect(withOverrides([])).toMatchObject({ status: 'no_data', totalPnl: null });
    expect(withOverrides(rows, [exemption], { ...BALANCES, 普通__pauseDate: '2026-11-02' })).toMatchObject({ latestDate: '2026-11-02', totalPnl: 100 });
  });
  it('完整用户入口一次target批量读取override并传pure；store故障不回退raw或0', async () => {
    mocks.readOverrides.mockResolvedValue([exemption]);
    expect((await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 })).categories[0].totalPnl).toBe(100);
    expect(mocks.readOverrides).toHaveBeenCalledTimes(1);
    expect(mocks.readOverrides).toHaveBeenCalledWith(expect.objectContaining({ execute: mocks.execute }), 37, 201);
    mocks.execute.mockClear(); mocks.readOverrides.mockRejectedValue(new Error('override corrupt'));
    await expect(getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 })).rejects.toThrow('override corrupt');
    expect(queries('FROM ledger_records')).toHaveLength(0);
  });
  it('canonical last daily non-transfer by createdAt then highest id, zero is valid; not income/expense sums', () => {
    const rows = [record(TODAY, 400, { recordId: 2 }), record(TODAY, 0, { recordId: 9, type: 'expense' }),
      record(TODAY, 300, { recordId: 3 }), record(TODAY, 500, { recordId: 1, createdAt: '2026-11-26 00:00:00.000000' })];
    const snapshot = JSON.stringify(rows); const result = build(rows);
    expect(result.points).toHaveLength(1); expect(result.points[0]).toMatchObject({ date: TODAY, balance: 0, pnl: 300, rawPnl: 1000, countedBalance: 700 });
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
  it('date, createdAt and id ordering works across Date and DATE_FORMAT values', () => {
    const result = build([record(TODAY, 600, { recordId: 3, createdAt: new Date('2026-11-26T01:00:00Z') }),
      record(TODAY, 700, { recordId: 2, createdAt: '2026-11-26 01:00:00.000000' }), record('2026-11-02', 1000)]);
    expect(result.points.map(p => p.date)).toEqual(['2026-11-02', TODAY]); expect(result.points[1].balance).toBe(600);
  });
  it('pre-entry point only baseline, not returned profit point; uses Beijing Date values', () => {
    const result = build([record(new Date('2026-11-01T16:00:00Z'), 1000), record(new Date('2026-11-25T16:00:00Z'), 900), record('2026-10-30', 1000)]);
    expect(result.points.map(p => p.date)).toEqual(['2026-11-02', TODAY]); expect(result.totalPnl).toBe(30);
  });
  it('wrong ledger/root, deleted, invalid dates and future never enter canonical points', () => {
    const result = build([record(TODAY, 900), record(TODAY, 12, { ledgerId: 52 }), record(TODAY, 13, { categoryId: 11 }),
      record(TODAY, 14, { deleted_at: '2026-11-26' }), record('2026-11-27', 15), record('2026-02-30', 16)]);
    expect(result.points).toHaveLength(1); expect(result.points[0].balance).toBe(900);
  });
  it.each([
    ['add', [transfer('2026-11-03', 200, 'capital_add'), record('2026-11-04', 1100)], 200, 0],
    ['reduce', [transfer('2026-11-03', 200, 'capital_reduce'), record('2026-11-04', 700)], -200, 0],
    ['withdraw', [transfer('2026-11-03', 200, 'private withdraw'), record('2026-11-04', 700)], 0, 200],
  ])('%s interval balances pure cashflow has zero performance and unscaled true flow', (_, flowRows, capital, withdraw) => {
    const result = build([record('2026-11-02', 900), ...flowRows as OrdinaryTagDownsideValuationRecord[]]);
    expect(result.points[1]).toMatchObject({ dailyPnl: 0, pnl: 30, rawPnl: 100,
      capitalChange: capital, withdrawToDate: withdraw, capitalChangeToday: capital, withdrawToday: withdraw });
  });
  it('first point with cashflows is neutral against initial, same-day transfer ordering does not fake before/after balances', () => {
    const result = build([transfer('2026-11-02', 300, 'capital_add', { recordId: 50 }),
      transfer('2026-11-02', 100, 'withdraw', { recordId: 51 }), record('2026-11-02', 1200)]);
    expect(result.points[0]).toMatchObject({ pnl: 0, rawPnl: 0, dailyPnl: 0, capitalChange: 300, withdrawToDate: 100 });
  });
  it('late below-K entry avoids fictitious starting loss; r=0 no below-K price pnl then crossing recovers', () => {
    const result = build([record('2026-11-02', 600), record('2026-11-03', 400), record('2026-11-04', 1100)],
      { ...BALANCES, 普通: 600 }, [{ ...RULE, downsidePercent: 0 }]);
    expect(result.points.map(p => p.pnl)).toEqual([0, 0, -100]); expect(result.points.map(p => p.dailyPnl)).toEqual([0, 0, -100]);
  });
  it('future version not early; historical point uses its own rule; disabled restores raw, no carry leak', () => {
    const result = build([record('2026-11-02', 900), record('2026-11-03', 800), record('2026-11-04', 700)], BALANCES,
      [RULE, { ...RULE, version: 2, enabled: false, startDate: '2026-11-03' }, { ...RULE, version: 3, downsidePercent: 0, startDate: '2026-12-01' }]);
    expect(result.points.map(p => p.ruleVersion)).toEqual([1, 2, 2]); expect(result.points.map(p => p.pnl)).toEqual([30, 200, 300]);
  });
  it.each([null, undefined, '', 'bad'])('missing initial %s remains pending/null, never Number(null)=0', initial => {
    const result = build([record(TODAY, 0)], { ...BALANCES, 普通: initial });
    expect(result.status).toBe('pending'); expect(result.totalPnl).toBeNull(); expect(result.points[0].pnl).toBeNull();
  });
  it.each([null, undefined, '', '2026-02-30'])('missing actual entryDate %s remains pending and does not invent one', entry => {
    const result = build([record(TODAY, 900)], { ...BALANCES, 普通__startDate: entry });
    expect(result.status).toBe('pending'); expect(result.totalPnl).toBeNull();
  });
  it('default ratio 100 retained, explicit ratio zero retained, invalid ratio does not convert to default', () => {
    expect(build([record(TODAY, 900)], { 普通: 1000, 普通__startDate: '2026-11-02' }).totalPnl).toBe(30);
    expect(build([record(TODAY, 900)], { ...BALANCES, 普通__ratio: 0 }).totalPnl).toBe(0);
    expect(build([record(TODAY, 900)], { ...BALANCES, 普通__ratio: '' }).status).toBe('pending');
  });
  it('negative derived Q missing comparison evidence yields pending counted profit, not fabricated balance', () => {
    const result = build([record('2026-11-02', 1000), transfer('2026-11-03', 2000, 'capital_reduce'), record('2026-11-03', 0)]);
    expect(result.points[1]).toMatchObject({ balance: 0, pnl: null, dailyPnl: null }); expect(result.status).toBe('pending');
  });
  it('paused cutoff includes pause date and no fallback after it, even no prior point', () => {
    const result = build([record('2026-11-03', 900), transfer('2026-11-04', 1000, 'capital_add'), record(TODAY, 50)],
      { ...BALANCES, 普通__pauseDate: '2026-11-02' });
    expect(result).toMatchObject({ status: 'no_data', points: [], latestDate: null, totalPnl: null, todayPnl: null });
  });
  it('pauseHistory overrides stale legacy pause; resume excludes pause window cashflows as well as balance', () => {
    const result = build([record('2026-11-02', 1000), record('2026-11-03', 900),
      transfer('2026-11-04', 5000, 'capital_add'), record('2026-11-04', 5000),
      transfer('2026-11-05', 4000, 'withdraw'), record('2026-11-06', 800), record('2026-11-07', 700)],
      { ...BALANCES, 普通__pauseDate: '2026-11-02', 普通__pauseHistory: JSON.stringify([{ pauseDate: '2026-11-03', resumeDate: '2026-11-06' }]) });
    expect(result.points.map(p => p.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-06', '2026-11-07']);
    expect(result.points.at(-1)).toMatchObject({ pnl: 90, capitalChange: 0, withdrawToDate: 0 });
  });
  it('empty valid pauseHistory overrides legacy; damaged history without legacy stays pending', () => {
    expect(build([record(TODAY, 900)], { ...BALANCES, 普通__pauseHistory: '[]', 普通__pauseDate: '2026-11-02' }).latestDate).toBe(TODAY);
    expect(build([record(TODAY, 900)], { ...BALANCES, 普通__pauseHistory: 'broken' }).status).toBe('pending');
  });
  it('latest frozen point uses historical rule, not rule effective today', () => {
    const result = build([record('2026-11-02', 1000), record('2026-11-03', 900), record(TODAY, 200)],
      { ...BALANCES, 普通__pauseHistory: [{ pauseDate: '2026-11-03' }] }, [RULE, { ...RULE, version: 2, downsidePercent: 0, startDate: '2026-11-04' }]);
    expect(result.latestDate).toBe('2026-11-03'); expect(result.points.at(-1)?.ruleVersion).toBe(1); expect(result.totalPnl).toBe(30);
  });
  it('no records/only transfer/pre-entry data does not fabricate a profit point', () => {
    for (const rows of [[], [transfer(TODAY, 10, 'withdraw')], [record('2026-10-30', 1000)]]) {
      expect(build(rows)).toMatchObject({ status: 'no_data', points: [], latestDate: null, totalPnl: null });
    }
  });
  it('trailing cashflows after last actual point cannot rewrite historical totals', () => {
    const result = build([record('2026-11-02', 900), transfer(TODAY, 5000, 'capital_add')]);
    expect(result.points[0]).toMatchObject({ pnl: 30, capitalChange: 0, capitalChangeToday: 0 });
  });
  it('DTO fields are allowlisted and no rules, raw records, balances config, user IDs or descriptions are exposed', () => {
    const result = build([record(TODAY, 900), transfer(TODAY, 10, 'privateNote')], { ...BALANCES, privateConfig: 987654 });
    expect(Object.keys(result).sort()).toEqual(['categoryId', 'categoryName', 'latestDate', 'points', 'status', 'todayPnl', 'totalPnl']);
    expect(Object.keys(result.points[0]).sort()).toEqual(['balance', 'capitalChange', 'capitalChangeToday', 'countedBalance', 'dailyPnl', 'date', 'pnl', 'rawPnl', 'ruleVersion', 'withdrawToDate', 'withdrawToday']);
    expect(JSON.stringify(result)).not.toMatch(/privateNote|privateConfig|987654|thresholdAmount|downsidePercent|startDate|createdAt|userId/);
  });
  it('pure builder never queries DB', () => {
    build([record(TODAY, 900)]); expect(mocks.getDbConnection).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('real pre-entry last B supplies daily baseline while true initial raw cumulative is bridged, not replaced', () => {
    const result = build([record('2026-10-29', 950), record('2026-10-30', 900), record('2026-11-02', 800)], BALANCES);
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({ date: '2026-11-02', balance: 800, rawPnl: 200, pnl: 130, dailyPnl: 30 });
    expect(result.totalPnl).toBe(130);
  });
  it('missing true initial cannot use actual prior B to fabricate initial or emit before-entry point', () => {
    const result = build([record('2026-10-30', 900), record(TODAY, 800)], { ...BALANCES, 普通: null });
    expect(result.status).toBe('pending'); expect(result.totalPnl).toBeNull();
    expect(result.points.map(p => p.date)).toEqual([TODAY]); expect(result.points[0].pnl).toBeNull();
  });
  it('pure build decrypts transfer so batch availability needs no duplicated decrypt or DB call', () => {
    const result = build([record('2026-11-02', 1000), transfer(TODAY, 100, 'enc:v1:valid'), record(TODAY, 1100)]);
    expect(result.points.at(-1)).toMatchObject({ pnl: 0, dailyPnl: 0, capitalChange: 100 });
    expect(mocks.decryptValue).toHaveBeenCalledWith('enc:v1:valid'); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('pure build ignores undecryptable stopped-window flows but rejects applicable ones', () => {
    expect(build([record('2026-11-02', 1000), transfer(TODAY, 100, 'enc:v1:bad')],
      { ...BALANCES, 普通__pauseDate: '2026-11-02' }).totalPnl).toBe(0);
    expect(() => build([transfer(TODAY, 100, 'enc:v1:bad'), record(TODAY, 1100)])).toThrow();
  });
  it.each([null, '', 'not-money', Infinity, -900])('latest explicit bad balance %s keeps date and pending null, not previous ready day', balance => {
    const result = build([record('2026-11-02', 900), record(TODAY, balance)]);
    expect(result).toMatchObject({ status: 'pending', latestDate: TODAY, totalPnl: null, todayPnl: null });
    expect(result.points[0].pnl).toBe(30);
    expect(result.points[1]).toMatchObject({ date: TODAY, balance: null, countedBalance: null, pnl: null, rawPnl: null, dailyPnl: null });
  });
  it('same-day greatest id invalid balance cannot resurrect earlier same-day real balance', () => {
    const result = build([record(TODAY, null, { recordId: 3 }), record(TODAY, 900, { recordId: 2 }), record(TODAY, 800, { recordId: 1 })]);
    expect(result).toMatchObject({ status: 'pending', latestDate: TODAY, totalPnl: null });
    expect(result.points).toHaveLength(1); expect(result.points[0].balance).toBeNull();
  });
  it('after missing balance explicit cashflows carry to next actual point and do not duplicate cumulative capital', () => {
    const result = build([record('2026-11-02', 900), transfer('2026-11-03', 100, 'capital_add'), record('2026-11-03', null),
      transfer('2026-11-04', 50, 'withdraw'), record('2026-11-04', 950)]);
    expect(result.points.map(p => p.balance)).toEqual([900, null, 950]); expect(result.status).toBe('ready');
    expect(result.points[2]).toMatchObject({ pnl: 30, dailyPnl: 0, capitalChange: 100, withdrawToDate: 50,
      capitalChangeToday: 100, withdrawToday: 50 });
  });
  it('last pre-entry bad balance invalidates baseline instead of resurrecting an older one', () => {
    const result = build([record('2026-10-29', 1000), record('2026-10-30', null), record(TODAY, 900)]);
    expect(result.points).toHaveLength(1); expect(result.points[0].date).toBe(TODAY);
    expect(result).toMatchObject({ status: 'pending', totalPnl: null });
  });
  it('configured future-only rule remains category with raw pre-effective profits and version zero', () => {
    const result = build([record(TODAY, 900)], BALANCES, [{ ...RULE, startDate: '2026-12-01', downsidePercent: 0 }]);
    expect(result).toMatchObject({ status: 'ready', latestDate: TODAY, totalPnl: 100 });
    expect(result.points[0]).toMatchObject({ balance: 900, countedBalance: 900, rawPnl: 100, pnl: 100, ruleVersion: 0 });
  });
  it('future-only saved rule cannot grant visibility to hidden category or read its history', async () => {
    rules = [{ ...RULE, startDate: '2026-12-01' }]; ownBalances({ ...BALANCES, 普通__visible: 0 });
    expect((await getMyOrdinaryTagDownsideValuations({ ledgerId: 37, userId: 201 })).categories).toEqual([]);
    expect(queries('FROM ledger_records')).toHaveLength(0);
  });
  it('normalizes valid calendar business date and rejects ambiguous or impossible date', () => {
    expect(ordinaryTagDownsideBusinessDate(new Date('2026-11-25T16:01:00Z'))).toBe(TODAY);
    expect(ordinaryTagDownsideBusinessDate('2026-11-25T16:01:00Z')).toBe(TODAY);
    expect(ordinaryTagDownsideBusinessDate('2026-11-26 03:04:05.123456')).toBe(TODAY);
    expect(ordinaryTagDownsideBusinessDate('2026-02-30')).toBeNull(); expect(ordinaryTagDownsideBusinessDate('2026-11-26T03:04:05')).toBeNull();
  });
});
