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
beforeEach(() => {
  vi.clearAllMocks(); fake.eligible = true;
  fake.category = { id: 19, ledgerId: 37, name: 'R1', parentId: null, accounting_mode: 'stock_portfolio',
    member_user_id: 5, member_role: 'member', initialBalances: '{}' };
  fake.read.mockResolvedValue([]);
  fake.execute.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM ledger_categories c')) return [[fake.category]];
    if (sql.includes('SELECT 1 AS eligible')) return [fake.eligible ? [{ eligible: 1 }] : []];
    throw new Error(`Forbidden read route SQL: ${sql}`);
  });
});

describe('calendar read authorization (offline, no DB/HTTP)', () => {
  it('performs current joined authorization and minimal real participation query on every read', async () => {
    expect(await getStockTagCalendar(input)).toEqual([]);
    expect(await getStockTagCalendar(input)).toEqual([]);
    expect(fake.execute).toHaveBeenCalledTimes(4);
    const [auth, args] = fake.execute.mock.calls[0];
    expect(auth).toContain('LEFT JOIN ledger_members'); expect(args).toEqual([5, 19, 37]);
    const eligibility = fake.execute.mock.calls[1][0];
    expect(eligibility).toContain('p.allocated_quantity>0');
    expect(eligibility).toContain("DATE_FORMAT(p.start_date,'%Y-%m-%d')");
    expect(eligibility).not.toMatch(/observation|remaining_quantity|pause_date/);
    expect(fake.read).toHaveBeenCalledWith(19);
    expect(ensureStockCalendarResultTable).not.toHaveBeenCalled();
    expect(rebuildCachedStockCalendarResult).not.toHaveBeenCalled();
    expect(fake.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  });
  it('observer/future-only noneligible member is refused before reading shared payload', async () => {
    fake.eligible = false;
    await expect(getStockTagCalendar(input)).rejects.toThrow('尚未对您开放');
    expect(fake.read).not.toHaveBeenCalled();
  });
  it('revoked member cannot reuse a previously readable payload', async () => {
    await getStockTagCalendar(input);
    fake.read.mockClear(); fake.category.member_user_id = null;
    await expect(getStockTagCalendar(input)).rejects.toThrow('不是此账本的成员');
    expect(fake.read).not.toHaveBeenCalled();
  });
  it('checks current tag visibility even when the caller has a cached result or a system admin role', async () => {
    await getStockTagCalendar(input); fake.read.mockClear();
    fake.category.initialBalances = '{"R1__visible":0}';
    await expect(getStockTagCalendar(input)).rejects.toThrow('无权查看此标签');
    await expect(getStockTagCalendar({ ...input, systemRole: 'admin' })).rejects.toThrow('无权查看此标签');
    expect(fake.read).not.toHaveBeenCalled();
  });
  it('keeps administrator bypass of member eligibility, but no guessed ledger/category access', async () => {
    fake.eligible = false; fake.category.member_role = 'owner';
    expect(await getStockTagCalendar(input)).toEqual([]); expect(fake.execute).toHaveBeenCalledTimes(1);
    await expect(getStockTagCalendar({ ...input, ledgerId: 52 })).rejects.toThrow('仅适用于37');
    fake.category.accounting_mode = 'manual_balance';
    await expect(getStockTagCalendar(input)).rejects.toThrow('不是股票持仓模式');
  });
});
