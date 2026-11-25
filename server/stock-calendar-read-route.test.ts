import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ execute: vi.fn(), read: vi.fn(), eligible: true,
  category: { id: 19, ledgerId: 37, name: 'R1', parentId: null, accounting_mode: 'stock_portfolio', member_user_id: 5,
    member_role: 'member', initialBalances: '{}' } as any }));
vi.mock('./db', () => ({ getDbConnection: async () => ({ execute: fake.execute }), getDbTransactionConnection: vi.fn() }));
vi.mock('./price-scanner', () => ({ fetchIntradayStockQuotes: vi.fn(), getUsdtCnyRate: vi.fn(), refreshUsdtCnyRate: vi.fn(), resolveUsStockExchange: vi.fn(), searchManualStocks: vi.fn() }));
vi.mock('./stock-unified-close-quotes', () => ({ fetchOvernightUnifiedCloseQuotes: vi.fn(), marketSessionDateFromBeijingTradeTimestamp: vi.fn() }));
vi.mock('./stock-usd-cny-rate', () => ({ fetchStockUsdCnyAtClose: vi.fn() }));
vi.mock('./stock-calendar-result-cache', () => ({ ensureStockCalendarResultTable: vi.fn(), markStockCalendarResultDirty: vi.fn(),
  readStockCalendarResult: fake.read, rebuildCachedStockCalendarResult: vi.fn() }));

import { getStockTagCalendar } from './ledger-stock-portfolio';
import { ensureStockCalendarResultTable, rebuildCachedStockCalendarResult } from './stock-calendar-result-cache';

const input = { ledgerId: 37, categoryId: 19, userId: 5 };
const ownerOnlyError = '仅37号账本所有者可以查看标签总盘日历';
beforeEach(() => {
  vi.clearAllMocks(); fake.eligible = true;
  fake.category = { id: 19, ledgerId: 37, name: 'R1', parentId: null, accounting_mode: 'stock_portfolio',
    member_user_id: 5, member_role: 'member', initialBalances: '{}' };
  fake.read.mockResolvedValue([]);
  fake.execute.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM ledger_categories c')) return [[{
      ledger_owner_id: fake.category.member_role === 'owner' ? fake.category.member_user_id : 999,
      ...fake.category }]];
    if (sql.includes('SELECT 1 AS eligible')) return [fake.eligible ? [{ eligible: 1 }] : []];
    throw new Error(`Forbidden read route SQL: ${sql}`);
  });
});

function expectNoSharedCalendarRead() {
  expect(fake.read).not.toHaveBeenCalled();
  expect(ensureStockCalendarResultTable).not.toHaveBeenCalled();
  expect(rebuildCachedStockCalendarResult).not.toHaveBeenCalled();
  expect(fake.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  expect(fake.execute.mock.calls.some(([sql]) => sql.includes('SELECT 1 AS eligible'))).toBe(false);
}

describe('calendar read authorization (offline, no DB/HTTP)', () => {
  it('real ledger owner reauthorizes every read and reads cached payload with SELECT only, without eligibility or rebuild', async () => {
    fake.category.member_role = 'owner'; fake.eligible = false;
    const cached = Object.freeze([Object.freeze({ snapshotDate: '2026-11-20', ready: true, scope: 'tag-total' })]);
    fake.read.mockResolvedValue(cached);
    expect(await getStockTagCalendar(input)).toBe(cached);
    expect(await getStockTagCalendar(input)).toBe(cached);
    expect(fake.execute).toHaveBeenCalledTimes(2);
    for (const [auth, args] of fake.execute.mock.calls) {
      expect(auth).toContain('LEFT JOIN ledger_members'); expect(args).toEqual([5, 19, 37]);
      expect(auth).toContain('l.ownerId AS ledger_owner_id'); expect(auth).toMatch(/^SELECT/);
    }
    expect(fake.read).toHaveBeenCalledTimes(2); expect(fake.read).toHaveBeenCalledWith(19);
    expect(ensureStockCalendarResultTable).not.toHaveBeenCalled();
    expect(rebuildCachedStockCalendarResult).not.toHaveBeenCalled();
  });
  it('eligible ordinary member is refused on every read before eligibility or shared payload access', async () => {
    await expect(getStockTagCalendar(input)).rejects.toThrow(ownerOnlyError);
    await expect(getStockTagCalendar(input)).rejects.toThrow(ownerOnlyError);
    expect(fake.execute).toHaveBeenCalledTimes(2);
    expectNoSharedCalendarRead();
  });
  it.each([
    { name: 'ordinary ledger admin', memberRole: 'admin', ownerId: 999, systemRole: undefined, isViewingAs: false },
    { name: 'system admin', memberRole: 'member', ownerId: 999, systemRole: 'admin', isViewingAs: false },
    { name: 'fake member-role owner', memberRole: 'owner', ownerId: 999, systemRole: undefined, isViewingAs: false },
    { name: 'real owner in viewing-as mode', memberRole: 'owner', ownerId: 5, systemRole: 'admin', isViewingAs: true },
  ])('$name cannot read tag-total calendar', async ({ memberRole, ownerId, systemRole, isViewingAs }) => {
    fake.category.member_role = memberRole;
    // Override the role-derived fixture default: a claimed owner role is not the ledger ownerId.
    fake.category.ledger_owner_id = ownerId;
    await expect(getStockTagCalendar({ ...input, systemRole, isViewingAs })).rejects.toThrow(ownerOnlyError);
    expect(fake.execute).toHaveBeenCalledTimes(1);
    expectNoSharedCalendarRead();
  });
  it('observer/future-only noneligible member is refused before reading shared payload', async () => {
    fake.eligible = false;
    await expect(getStockTagCalendar(input)).rejects.toThrow(ownerOnlyError);
    expectNoSharedCalendarRead();
  });
  it('revoked member cannot reuse a previously available shared payload', async () => {
    fake.read.mockResolvedValue([{ scope: 'tag-total' }]);
    await expect(getStockTagCalendar(input)).rejects.toThrow(ownerOnlyError);
    fake.category.member_user_id = null;
    await expect(getStockTagCalendar(input)).rejects.toThrow('不是此账本的成员');
    expectNoSharedCalendarRead();
  });
  it('checks current tag visibility even when a shared cached result exists or caller has a system admin role', async () => {
    fake.read.mockResolvedValue([{ scope: 'tag-total' }]);
    await expect(getStockTagCalendar(input)).rejects.toThrow(ownerOnlyError);
    fake.category.initialBalances = '{"R1__visible":0}';
    await expect(getStockTagCalendar(input)).rejects.toThrow('无权查看此标签');
    await expect(getStockTagCalendar({ ...input, systemRole: 'admin' })).rejects.toThrow('无权查看此标签');
    expectNoSharedCalendarRead();
  });
  it('real owner bypasses member eligibility, but cannot guess another ledger or nonstock category', async () => {
    fake.eligible = false; fake.category.member_role = 'owner';
    expect(await getStockTagCalendar(input)).toEqual([]); expect(fake.execute).toHaveBeenCalledTimes(1);
    await expect(getStockTagCalendar({ ...input, ledgerId: 52 })).rejects.toThrow('仅适用于37');
    fake.category.accounting_mode = 'manual_balance';
    await expect(getStockTagCalendar(input)).rejects.toThrow('不是股票持仓模式');
    expect(fake.read).toHaveBeenCalledTimes(1);
    expect(ensureStockCalendarResultTable).not.toHaveBeenCalled();
    expect(rebuildCachedStockCalendarResult).not.toHaveBeenCalled();
  });
  it('preserves the existing nonowner AI raw-read rejection before the owner-only calendar guard', async () => {
    fake.category.initialBalances = '{"__ledger37AiDisplay":1}';
    await expect(getStockTagCalendar(input)).rejects.toThrow('R1 AI展示已开启，请使用安全参与收益接口');
    await expect(getStockTagCalendar({ ...input, systemRole: 'admin' })).rejects.toThrow('R1 AI展示已开启，请使用安全参与收益接口');
    expectNoSharedCalendarRead();
    fake.category.member_role = 'owner';
    expect(await getStockTagCalendar(input)).toEqual([]);
    expect(fake.read).toHaveBeenCalledOnce();
  });
});
