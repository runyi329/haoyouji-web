import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const db = vi.hoisted(() => ({ get: vi.fn(), tx: vi.fn() }));
const fx = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: db.get, getDbTransactionConnection: db.tx }));
vi.mock('./stock-usd-cny-rate', () => ({ getLiveStockUsdCnyQuote: fx.get }));
import { getForcedLiquidationSettings } from './forced-liquidation-settings';
import { getForcedLiquidationSettingDetail } from './forced-liquidation-setting-detail';
import { aggregateForcedLiquidationStockSummaries, buildForcedLiquidationStockDetail,
  type ForcedLiquidationIneffectiveSummary } from './forced-liquidation-setting-summary';
import { calculateOrdinaryTagDownsideSeries } from '../shared/ordinary-tag-downside';

const input = { ledgerId: 37, userId: 7 };
const today = '2026-11-26';
const category = (id = 81, mode = 'stock_portfolio') => ({ id, ledgerId: 37, parentId: null, isDefault: 0,
  name: `标签${id}`, accounting_mode: mode, sortOrder: id });
const lot = (id = 101, categoryId = 81, symbol = '600000.SH', overrides: Record<string, unknown> = {}) => ({
  id, ledger_id: 37, category_id: categoryId, symbol, stock_name: symbol, opened_event_id: 1000 + id,
  initial_quantity: '20', unit_cost: '100', allocated_quantity: '10', current_allocated_quantity: '10',
  opening_status: 'active', opening_event_type: 'buy', opened_at: '2026-11-20 09:35:16',
  actual_traded_at: '2026-11-20 09:35:16', note: '真实原始备注', ...overrides,
});
const stockRule = (lotId = 101, categoryId = 81, currency = 'CNY', overrides: Record<string, unknown> = {}) => ({
  ledger_id: 37, category_id: categoryId, lot_id: lotId, user_id: 7, version: 1, enabled: 1,
  threshold_price: '80', downside_percent: '20', start_date: '2026-11-20', effective_at: '2026-11-19T16:00:00.000000Z',
  baseline_raw_price: '79', baseline_counted_price: '79', baseline_source: 'verified_close', baseline_status: 'pending',
  holding_start_at: '2026-11-20T09:35:16+08:00', currency, created_at: '2026-11-25T06:00:00.000000Z', ...overrides,
});
const quote = (categoryId = 81, symbol = '600000.SH', overrides: Record<string, unknown> = {}) => ({ id: 1,
  ledger_id: 37, category_id: categoryId, symbol, price: '60', price_date: '2026-11-25',
  captured_at: '2026-11-25 15:05:00.000000', ...overrides,
});
const config = (id = 83, initial: unknown = '100') => ({ ledger_id: 37, tag_name: `标签${id}`,
  initial_amount: initial, pause_date: null, margin_pause_date: null, end_date: null });
const ordinaryRule = (categoryId = 83, overrides: Record<string, unknown> = {}) => ({ ledger_id: 37,
  category_id: categoryId, user_id: 7, version: 1, enabled: 1, threshold_amount: '80', downside_percent: '20',
  start_date: '2026-11-20', created_at: '2026-11-25T06:00:00.000000Z', ...overrides,
});
const record = (id: number, recordDate: string, amount: unknown, overrides: Record<string, unknown> = {}) => ({
  id, ledgerId: 37, categoryId: 83, recordDate, type: 'income', amount,
  createdAt: `${recordDate} 12:00:00.000000`, deletedAt: null, description: null, ...overrides,
});
function fixture() {
  const state = { owner: 7 as number | null, categories: [category(), category(83, 'manual_balance')],
    lots: [lot()] as any[], stockRules: [stockRule()] as any[], ordinaryRules: [] as any[],
    close: [quote()] as any[], intraday: [] as any[], configs: [config()] as any[],
    records: [record(1, '2026-11-20', 100), record(2, '2026-11-25', 60)] as any[],
    missing: new Set<string>(), failures: new Map<string, Error>(), missingInitial: false, missingEnd: false };
  const conn = { execute: vi.fn(async (sql: string, values: any[]) => {
    if (!/^SELECT\b/.test(sql) || /\bFOR\s+UPDATE\b/i.test(sql)) throw new Error('forbidden mutation');
    const table = sql.match(/\bFROM\s+(\w+)/)?.[1];
    if (table && state.failures.has(table)) throw state.failures.get(table);
    if (table && state.missing.has(table)) throw Object.assign(new Error('missing table'), { errno: 1146 });
    if (table === 'ledgers') return [state.owner === null ? [] : [{ ownerId: state.owner }]];
    if (table === 'ledger_categories') return [values.length > 1 ? state.categories.filter(c => c.id === values[1]) : state.categories];
    if (table === 'ledger_stock_lots') {
      // Detail gets the same current allocation evidence as the list's extra column.
      if (sql.includes('AND l.id=?')) return [state.lots.filter(l => l.id === values[3] && l.category_id === values[2])
        .map(l => ({ ...l, allocated_quantity: l.current_allocated_quantity }))];
      return [state.lots];
    }
    if (table === 'ledger_stock_lot_downside_rules') {
      if (sql.includes('LIMIT 1')) return [[...state.stockRules].filter(r => r.category_id === values[1] && r.lot_id === values[2])
        .sort((a, b) => b.version - a.version).slice(0, 1)];
      return [state.stockRules];
    }
    if (table === 'ledger_ordinary_tag_downside_rules') return [values.length === 2
      ? state.ordinaryRules.filter(r => r.category_id === values[1]) : state.ordinaryRules];
    if (table === 'ledger_stock_price_snapshots') return [state.close];
    if (table === 'ledger_stock_intraday_quotes') return [state.intraday];
    if (table === 'ledger_tag_config') {
      if (state.missingInitial && sql.includes('initial_amount')) throw Object.assign(new Error("Unknown column 'initial_amount' in 'field list'"), { errno: 1054 });
      if (state.missingEnd && sql.includes('end_date')) throw Object.assign(new Error("Unknown column 'end_date' in 'field list'"), { errno: 1054 });
      return [(values.length === 2 ? state.configs.filter(c => c.tag_name === values[1]) : state.configs).map(c => ({ ...c,
        initial_amount: sql.includes('initial_amount') ? c.initial_amount : undefined,
        end_date: sql.includes('end_date') ? c.end_date : undefined }))];
    }
    if (table === 'ledger_records') return [state.records];
    throw new Error(`unexpected ${sql}`);
  }) };
  db.get.mockResolvedValue(conn);
  return { state, conn };
}
const stockAt = async () => (await getForcedLiquidationSettings(input)).categories.find(c => c.categoryId === 81)!.stocks[0]!;
const categoryAt = async (id = 81) => (await getForcedLiquidationSettings(input)).categories.find(c => c.categoryId === id)!;
const callsFor = (conn: ReturnType<typeof fixture>['conn'], table: string) => conn.execute.mock.calls.filter(([sql]) => sql.includes(`FROM ${table} `));
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-26T01:00:00Z'));
  fx.get.mockReset().mockResolvedValue({ rate: 7, pair: 'USD/CNY', stale: false,
    source: 'sina_usdcny', asOf: '2026-11-26T00:59:59Z' });
});
afterEach(() => vi.mocked(Date.now).mockRestore());

describe('enabled-only scoped batch list summaries, not lazy detail N+1', () => {
  it('single actual CNY rule: first-screen category and lot share non-null amount; same legacy/pending detail CURRENT, original fields retained', async () => {
    const { state, conn } = fixture(); const before = structuredClone(state);
    const c = await categoryAt(); const s = c.stocks[0]!;
    expect(c).toMatchObject({ ineffectiveFunds: 160, ineffectiveCurrency: 'CNY', ineffectiveStatus: 'ready', ineffectiveCurrencies: ['CNY'] });
    expect(s).toMatchObject({ lotId: 101, eventId: 1101, quantity: 20, remainingQuantity: 10,
      executionPrice: 100, positionNumber: '01', note: '真实原始备注', ineffectiveFunds: 160, ineffectiveCurrency: 'CNY' });
    expect(s.ineffectiveNotice).toContain('历史收益核验状态仍保留');
    expect(conn.execute).toHaveBeenCalledTimes(8);
    expect(callsFor(conn, 'ledger_records')).toHaveLength(0);
    const detail = await getForcedLiquidationSettingDetail({ ...input, categoryId: 81, lotId: 101 });
    expect(s.ineffectiveFunds).toBe(detail.ineffectiveFunds); expect(s.ineffectiveNotice).toBe(detail.notice);
    expect(state).toEqual(before); expect(db.tx).not.toHaveBeenCalled();
  });
  it.each([1, 4, 40])('%s enabled stocks and repeated category/symbol pairs: exactly base6+2 quotes and zero individual detail SQL', async count => {
    const { state, conn } = fixture();
    state.lots = Array.from({ length: count }, (_, i) => lot(101 + i));
    state.stockRules = state.lots.map(l => stockRule(l.id));
    const c = await categoryAt(); expect(c.stocks).toHaveLength(count);
    expect(c.ineffectiveFunds).toBe(count * 160); expect(conn.execute).toHaveBeenCalledTimes(8);
    for (const table of ['ledger_stock_price_snapshots', 'ledger_stock_intraday_quotes']) {
      const calls = callsFor(conn, table); expect(calls).toHaveLength(1);
      expect(calls[0]![1]).toEqual([37, 81, '600000.SH', today, '2026-11-26 09:00:00']);
      expect(calls[0]![0]).toContain('(category_id=? AND symbol=?)');
      expect(calls[0]![0]).toContain('price_date<=? AND captured_at<=? ORDER BY price_date,captured_at,id');
    }
    expect(callsFor(conn, 'ledger_stock_lots')).toHaveLength(1); expect(callsFor(conn, 'ledger_stock_lot_downside_rules')).toHaveLength(1);
  });
  it('zero enabled: original 6 SELECTs; disabled/future-disabled stocks and ordinary lack summary fields and valuation reads', async () => {
    const { state, conn } = fixture(); state.stockRules.push(stockRule(101, 81, 'CNY', { version: 2, enabled: 0,
      start_date: '2099-01-01', effective_at: '2098-12-31T16:00:00.000Z' }));
    state.ordinaryRules = [ordinaryRule(83, { enabled: 0 })];
    const result = await getForcedLiquidationSettings(input); expect(conn.execute).toHaveBeenCalledTimes(6);
    for (const c of result.categories) { expect(c).not.toHaveProperty('ineffectiveFunds'); for (const s of c.stocks) expect(s).not.toHaveProperty('ineffectiveFunds'); }
    for (const table of ['ledger_records', 'ledger_stock_price_snapshots', 'ledger_stock_intraday_quotes']) expect(callsFor(conn, table)).toHaveLength(0);
  });
  it('only enabled target exact pairs queried, disabled symbols/categories never added; crossledger/category/symbol quotes cannot inject', async () => {
    const { state, conn } = fixture(); state.categories.push(category(82));
    state.lots.push(lot(102, 81, 'MSFT'), lot(103, 82), lot(104, 82, 'AAPL'));
    state.stockRules.push(stockRule(104, 82, 'USD'));
    state.close.push(quote(81, '600000.SH', { ledger_id: 52, price: 1 }), quote(82, '600000.SH', { price: 2 }),
      quote(81, 'AAPL', { price: 3 }), quote(82, 'AAPL', { price: 60 }), quote(81, '600000.SH', { captured_at: '2099-01-01 00:00:00', price: 1 }));
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories.find(c => c.categoryId === 81)!.stocks[0]!.ineffectiveFunds).toBe(160);
    expect(result.categories.find(c => c.categoryId === 82)!.stocks.find(s => s.lotId === 104)!.ineffectiveCurrency).toBe('USD');
    for (const table of ['ledger_stock_price_snapshots', 'ledger_stock_intraday_quotes']) {
      expect(callsFor(conn, table)[0]![1]).toEqual([37, 81, '600000.SH', 82, 'AAPL', today, '2026-11-26 09:00:00']);
    }
    expect(conn.execute).toHaveBeenCalledTimes(8);
  });
  it('authorizer first; failed owner has exactly one SELECT and viewAs rejects before connection', async () => {
    const { state, conn } = fixture(); state.owner = 8;
    await expect(getForcedLiquidationSettings(input)).rejects.toThrow('所有者'); expect(conn.execute).toHaveBeenCalledTimes(1);
    expect(conn.execute.mock.calls[0]).toEqual(['SELECT ownerId FROM ledgers WHERE id=? LIMIT 1', [37]]);
    db.get.mockClear(); await expect(getForcedLiquidationSettings({ ...input, isViewingAs: true })).rejects.toThrow('代看'); expect(db.get).not.toHaveBeenCalled();
  });
  it('current real allocation column uses symbol and same now; do not use legacy/future sold list remaining', async () => {
    const { state, conn } = fixture(); state.lots[0] = lot(101, 81, '600000.SH', { allocated_quantity: 19, current_allocated_quantity: 2 });
    const s = await stockAt(); expect(s.remainingQuantity).toBe(1); expect(s.ineffectiveFunds).toBe(288);
    const detail = await getForcedLiquidationSettingDetail({ ...input, categoryId: 81, lotId: 101 });
    expect(detail.remainingQuantity).toBe(18); expect(s.ineffectiveFunds).toBe(detail.ineffectiveFunds);
    const call = callsFor(conn, 'ledger_stock_lots')[0]!;
    expect(call[0]).toContain('sale.symbol=l.symbol'); expect(call[0]).toContain('sale.actual_traded_at<=?');
    expect(call[0]).toContain('AS current_allocated_quantity'); expect(call[1]).toEqual(['2026-11-26 09:00:00', 37]);
  });
  it.each([{ downside_percent: 100 }, { threshold_price: 50 }])('actual zero remains number, not missing: %o', async overrides => {
    const { state } = fixture(); state.stockRules = [stockRule(101, 81, 'CNY', overrides)];
    expect(await categoryAt()).toMatchObject({ ineffectiveFunds: 0, ineffectiveStatus: 'ready' });
    expect(await stockAt()).toMatchObject({ ineffectiveFunds: 0, ineffectiveStatus: 'ready' });
  });
  it('rebound zero and latest saved revision immediately updates summary (no old cache or conversion)', async () => {
    const { state, conn } = fixture(); expect((await stockAt()).ineffectiveFunds).toBe(160);
    state.stockRules.push(stockRule(101, 81, 'CNY', { version: 2, downside_percent: 50 }));
    expect(await stockAt()).toMatchObject({ ineffectiveFunds: 100, currentDownsideRule: { version: 2 } });
    state.close[0].price = 110; expect((await stockAt()).ineffectiveFunds).toBe(0);
    expect(conn.execute).toHaveBeenCalledTimes(24);
  });
});

describe('enabled stock missing/invalid/future evidence never silently zero or old fallback', () => {
  it.each([{ threshold_price: null }, { threshold_price: 0 }, { downside_percent: null }, { downside_percent: 101 },
    { downside_percent: -1 }, { start_date: '2026-02-30' }, { start_date: null }, { effective_at: 'bad' },
    { currency: 'USD' }, { user_id: 0 }, { start_date: '2099-01-01', effective_at: '2098-12-31T16:00:00Z' },
    { start_date: '2026-11-25', effective_at: '2026-11-25T16:00:00Z' }])('latest saved enabled rule %o yields null, retaining latest version', async overrides => {
    const { state } = fixture(); state.stockRules.push(stockRule(101, 81, 'CNY', { version: 2, ...overrides }));
    const c = await categoryAt(); expect(c.ineffectiveFunds).toBeNull();
    expect(c.stocks[0]).toMatchObject({ ineffectiveFunds: null, ineffectiveStatus: 'pending', currentDownsideRule: { version: 2 } });
    expect(c.stocks[0]!.ineffectiveNotice).toBeTruthy();
  });
  it.each([{ price: null }, { price: 0 }, { price: 'bad' }, { price: '1e309' }])('latest invalid quote %o cannot revive old valid 160', async overrides => {
    const { state } = fixture(); state.intraday = [quote(81, '600000.SH', { captured_at: '2026-11-25 15:06:00.000001', ...overrides })];
    expect(await stockAt()).toMatchObject({ ineffectiveFunds: null, ineffectiveStatus: 'pending' });
  });
  it('selection matches detail date/capture microseconds/intraday exact tie with invalid latest protected', async () => {
    const { state } = fixture(); state.close.push(quote(81, '600000.SH', { price: 90, price_date: '2026-11-24', captured_at: '2026-11-25 23:00:00.000000' }));
    state.intraday = [quote(81, '600000.SH', { price: 58 })];
    let detail = await getForcedLiquidationSettingDetail({ ...input, categoryId: 81, lotId: 101 });
    expect((await stockAt()).ineffectiveFunds).toBe(detail.ineffectiveFunds); expect(detail.latestValue).toBe(58);
    state.close.push(quote(81, '600000.SH', { price: 'bad', captured_at: '2026-11-25 15:05:00.000001' }));
    detail = await getForcedLiquidationSettingDetail({ ...input, categoryId: 81, lotId: 101 });
    expect(detail.ineffectiveFunds).toBeNull(); expect((await stockAt()).ineffectiveFunds).toBeNull();
  });
  it.each([{ actual_traded_at: null }, { actual_traded_at: '2099-01-01 00:00:00' },
    { current_allocated_quantity: null }, { current_allocated_quantity: 21 }, { current_allocated_quantity: -1 }])('invalid real current holding %o null rather than fallback list quantity', async overrides => {
    const { state } = fixture(); Object.assign(state.lots[0], overrides);
    expect(await stockAt()).toMatchObject({ ineffectiveFunds: null, ineffectiveStatus: 'pending' });
  });
  it('quotes earlier than opening and no quote => pending/no_data, both amount null', async () => {
    const { state } = fixture(); state.close = [quote(81, '600000.SH', { captured_at: '2026-11-19 15:05:00.000000', price_date: '2026-11-19' })];
    expect(await stockAt()).toMatchObject({ ineffectiveFunds: null, ineffectiveStatus: 'pending' });
    state.close = []; expect(await stockAt()).toMatchObject({ ineffectiveFunds: null, ineffectiveStatus: 'no_data' });
  });
  it('both quote tables absent remains no_data, recreated tables immediately recover; no negative cache', async () => {
    const { state, conn } = fixture(); state.missing.add('ledger_stock_price_snapshots'); state.missing.add('ledger_stock_intraday_quotes');
    expect(await stockAt()).toMatchObject({ ineffectiveFunds: null, ineffectiveStatus: 'no_data' });
    state.missing.clear(); expect((await stockAt()).ineffectiveFunds).toBe(160); expect(conn.execute).toHaveBeenCalledTimes(16);
  });
  it('one quote table absent can use actual evidence in the other', async () => {
    const { state } = fixture(); state.missing.add('ledger_stock_price_snapshots'); state.intraday = [quote()];
    expect((await stockAt()).ineffectiveFunds).toBe(160);
  });
  it('real quote SQL errors propagate, never swallowed as missing', async () => {
    const { state } = fixture(); const error = new Error('permission/connection failed'); state.failures.set('ledger_stock_price_snapshots', error);
    await expect(getForcedLiquidationSettings(input)).rejects.toBe(error);
  });
});

describe('native category sum, never crossFX or incomplete enabled evidence', () => {
  const ready = (value: number, currency: 'CNY' | 'USD' | 'USDT' = 'CNY'): ForcedLiquidationIneffectiveSummary =>
    ({ ineffectiveFunds: value, ineffectiveCurrency: currency, ineffectiveStatus: 'ready' });
  it('same currency total including zero; no enabled stocks gives absent fields', () => {
    expect(aggregateForcedLiquidationStockSummaries([ready(160), ready(0), ready(5)])).toMatchObject({ ineffectiveFunds: 165, ineffectiveCurrency: 'CNY', ineffectiveStatus: 'ready' });
    expect(aggregateForcedLiquidationStockSummaries([])).toEqual({});
  });
  it.each([['USD', 'CNY'], ['USD', 'USDT'], ['USDT', 'CNY']])('mixed %s/%s => null plus explicit native currency list/notice, no chosen currency', (left, right) => {
    const sum = aggregateForcedLiquidationStockSummaries([ready(160, left as 'USD'), ready(160, right as 'CNY')]);
    expect(sum.ineffectiveFunds).toBeNull(); expect(sum.ineffectiveCurrency).toBeUndefined();
    expect(sum.ineffectiveCurrencies).toEqual([left, right]); expect(sum.ineffectiveNotice).toContain('不跨币种');
  });
  it.each([{ ineffectiveFunds: null, ineffectiveCurrency: 'CNY', ineffectiveStatus: 'pending' },
    { ineffectiveFunds: null, ineffectiveCurrency: 'CNY', ineffectiveStatus: 'no_data' },
    { ineffectiveFunds: 160, ineffectiveCurrency: 'CNY', ineffectiveStatus: 'pending' },
    { ineffectiveFunds: NaN, ineffectiveCurrency: 'CNY', ineffectiveStatus: 'ready' }, {}])('partial evidence %o gives null', missing => {
    expect(aggregateForcedLiquidationStockSummaries([ready(160), missing as ForcedLiquidationIneffectiveSummary]).ineffectiveFunds).toBeNull();
  });
  it('overflow aggregate null; mixed/partial real category stays null even one enabled ready stock exists', async () => {
    expect(aggregateForcedLiquidationStockSummaries([ready(Number.MAX_VALUE), ready(Number.MAX_VALUE)]).ineffectiveFunds).toBeNull();
    const { state } = fixture(); state.lots.push(lot(102, 81, 'AAPL')); state.stockRules.push(stockRule(102, 81, 'USD')); state.close.push(quote(81, 'AAPL'));
    const c = await categoryAt(); expect(c.ineffectiveFunds).toBeNull(); expect(c.stocks.every(s => s.ineffectiveFunds === 160)).toBe(true);
    state.lots[1].symbol = '600001.SH'; state.stockRules[1].currency = 'CNY'; state.close.pop();
    const partial = await categoryAt(); expect(partial.ineffectiveFunds).toBeNull(); expect(partial.ineffectiveCurrency).toBe('CNY');
    expect(partial.stocks[0]!.ineffectiveFunds).toBe(160);
  });
  it('disabled stocks excluded even mixed currency/no quotes, category exactly enabled stock amount', async () => {
    const { state } = fixture(); state.lots.push(lot(102, 81, 'AAPL')); state.stockRules.push(stockRule(102, 81, 'USD', { enabled: 0 }));
    const c = await categoryAt(); expect(c.ineffectiveFunds).toBe(160); expect(c.ineffectiveCurrency).toBe('CNY');
    expect(c.stocks[1]).not.toHaveProperty('ineffectiveFunds');
  });
});

describe('ordinary enabled categories batch exact complete replay, no all-53 records', () => {
  it.each([1, 8, 25])('%s enabled ordinary categories: only one records batch; all rules and config read reused, closed targets not computed', async count => {
    const { state, conn } = fixture(); state.stockRules = [];
    state.categories = [category(), ...Array.from({ length: 53 }, (_, i) => category(100 + i, 'manual_balance'))];
    state.ordinaryRules = Array.from({ length: count }, (_, i) => ordinaryRule(100 + i));
    state.configs = Array.from({ length: count }, (_, i) => config(100 + i));
    state.records = state.configs.flatMap((_, i) => [record(2 * i + 1, '2026-11-20', 100, { categoryId: 100 + i }), record(2 * i + 2, '2026-11-25', 60, { categoryId: 100 + i })]);
    const result = await getForcedLiquidationSettings(input); expect(conn.execute).toHaveBeenCalledTimes(7);
    const ids = Array.from({ length: count }, (_, i) => 100 + i), calls = callsFor(conn, 'ledger_records');
    expect(calls).toHaveLength(1); expect(calls[0]![1]).toEqual([37, ...ids, ...ids, today]);
    expect(calls[0]![0]).toContain('c.id IN ('); expect(calls[0]![0]).toContain('c.parentId IN (');
    expect(callsFor(conn, 'ledger_ordinary_tag_downside_rules')).toHaveLength(1); expect(callsFor(conn, 'ledger_tag_config')).toHaveLength(1);
    expect(result.categories.filter(c => c.ineffectiveStatus === 'ready')).toHaveLength(count);
    expect(result.categories.filter(c => c.ordinaryRule?.enabled).every(c => c.ineffectiveFunds === 16)).toBe(true);
    expect(result.categories.filter(c => !c.ordinaryRule?.enabled).every(c => c.ineffectiveFunds === undefined)).toBe(true);
  });
  it('full multi-rule crossing/capital-add/remove/withdraw transfer-only history exactly matches detail and shared engine', async () => {
    const { state } = fixture(); state.stockRules = []; state.ordinaryRules = [ordinaryRule(83, { downside_percent: 50 }), ordinaryRule(83, { version: 2, start_date: '2026-11-24' })];
    state.records = [record(1, '2026-11-20', 100), record(2, '2026-11-21', 60),
      record(3, '2026-11-22', 40, { type: 'transfer', description: 'capital_add' }), record(4, '2026-11-23', 90),
      record(5, '2026-11-24', 10, { type: 'transfer', description: 'capital_remove' }),
      record(6, '2026-11-24', 5, { type: 'transfer', description: 'withdraw' }), record(7, '2026-11-25', 55)];
    const c = await categoryAt(83), detail = await getForcedLiquidationSettingDetail({ ...input, categoryId: 83 });
    expect(c.ineffectiveFunds).toBe(detail.ineffectiveFunds); expect(c.ineffectiveNotice).toBe(detail.notice);
    const final = calculateOrdinaryTagDownsideSeries({ ledgerId: 37, categoryId: 83, initialAmount: 100, entryDate: '2026-11-20', ratio: 100,
      rules: state.ordinaryRules.map(s => ({ ledgerId: 37, categoryId: 83, userId: 7, version: s.version, enabled: true,
        thresholdAmount: 80, downsidePercent: Number(s.downside_percent), startDate: s.start_date, createdAt: s.created_at })),
      points: [{ date: '2026-11-20', rawBalance: 100, capitalChange: 0, withdraw: 0 }, { date: '2026-11-21', rawBalance: 60, capitalChange: 0, withdraw: 0 },
        { date: '2026-11-22', rawBalance: null, capitalChange: 40, withdraw: 0 }, { date: '2026-11-23', rawBalance: 90, capitalChange: 0, withdraw: 0 },
        { date: '2026-11-24', rawBalance: null, capitalChange: -10, withdraw: 5 }, { date: '2026-11-25', rawBalance: 55, capitalChange: 0, withdraw: 0 }] }).at(-1)!;
    expect(c.ineffectiveFunds).toBe(final.rawPnl! - final.countedPnl!); expect(c.ineffectiveNotice).toContain('不是初始与最新两端');
  });
  it.each([['capital_add', 100, 200], ['capital_remove', 20, 80], ['withdraw', 20, 80]])('pure %s cash-neutral genuine zero', async (description, flow, latest) => {
    const { state } = fixture(); state.stockRules = []; state.ordinaryRules = [ordinaryRule()];
    state.records = [record(1, '2026-11-20', 100), record(2, '2026-11-21', flow, { type: 'transfer', description }), record(3, '2026-11-25', latest)];
    expect(await categoryAt(83)).toMatchObject({ ineffectiveFunds: 0, ineffectiveCurrency: 'CNY', ineffectiveStatus: 'ready' });
  });
  it('global zero initial/latest valid; signed recovery retained; newest saved ordinary version updates immediately', async () => {
    const { state } = fixture(); state.stockRules = []; state.ordinaryRules = [ordinaryRule()]; state.configs = [config(83, 0)];
    state.records = [record(1, '2026-11-20', 0), record(2, '2026-11-25', 0)]; expect((await categoryAt(83)).ineffectiveFunds).toBe(0);
    state.configs = [config(83, 100)]; state.records = [record(1, '2026-11-20', 100), record(2, '2026-11-25', 110)];
    state.ordinaryRules = [ordinaryRule(83, { threshold_amount: 120 })]; expect((await categoryAt(83)).ineffectiveFunds).toBe(-8);
    state.ordinaryRules.push(ordinaryRule(83, { version: 2, threshold_amount: 120, downside_percent: 50 })); expect((await categoryAt(83)).ineffectiveFunds).toBe(-5);
  });
  it('record injection foreign ledger/category/deleted/future and canonical invalid latest: same detail, no old balance fallback', async () => {
    const { state } = fixture(); state.stockRules = []; state.ordinaryRules = [ordinaryRule()];
    state.records.push(record(3, '2026-11-26', 1, { ledgerId: 52 }), record(4, '2026-11-26', 1, { categoryId: 84 }),
      record(5, '2026-11-26', 1, { deletedAt: '2026-11-26 12:00:00' }), record(6, '2099-01-01', 1),
      record(7, '2026-11-25', 999, { type: 'transfer', description: 'capital_add' }));
    const c = await categoryAt(83), d = await getForcedLiquidationSettingDetail({ ...input, categoryId: 83 }); expect(c.ineffectiveFunds).toBe(d.ineffectiveFunds);
    state.records.push(record(8, '2026-11-25', null, { createdAt: '2026-11-25 12:00:00.000001' }));
    expect(await categoryAt(83)).toMatchObject({ ineffectiveFunds: null, ineffectiveStatus: 'pending' });
  });
  it.each([null, '', ' '])('global initial not filled %s falls back to real first balance in both list and detail', async initial => {
    const { state } = fixture(); state.stockRules = []; state.ordinaryRules = [ordinaryRule()]; state.configs = [config(83, initial)];
    const c = await categoryAt(83), d = await getForcedLiquidationSettingDetail({ ...input, categoryId: 83 });
    expect(c).toMatchObject({ ineffectiveFunds: 16, ineffectiveStatus: 'ready' });
    expect(d).toMatchObject({ initialValue: 100, initialBasis: 'first_balance', ineffectiveFunds: 16, status: 'ready' });
    expect(c.ineffectiveFunds).toBe(d.ineffectiveFunds); expect(c.ineffectiveNotice).toBe(d.notice);
  });
  it.each(['bad', -1, '1e309'])('global initial invalid %s null, not member or first balance substitute', async initial => {
    const { state } = fixture(); state.stockRules = []; state.ordinaryRules = [ordinaryRule()]; state.configs = [config(83, initial)];
    expect(await categoryAt(83)).toMatchObject({ ineffectiveFunds: null, ineffectiveStatus: 'pending' });
  });
  it.each([{ amount: 'bad', description: 'capital_add' }, { amount: 10, description: 'enc:v1:unreadable' }])('invalid transfer %o pending replay', async overrides => {
    const { state } = fixture(); state.stockRules = []; state.ordinaryRules = [ordinaryRule()]; state.records.push(record(3, '2026-11-22', 10, { type: 'transfer', ...overrides }));
    expect((await categoryAt(83)).ineffectiveFunds).toBeNull();
  });
  it('missing global initial old columns bounded compatibility; future rule pending; real records query error propagates', async () => {
    const { state, conn } = fixture(); state.stockRules = []; state.ordinaryRules = [ordinaryRule()]; state.missingInitial = true;
    expect(await categoryAt(83)).toMatchObject({ ineffectiveFunds: 16, ineffectiveStatus: 'ready' }); expect(callsFor(conn, 'ledger_tag_config')).toHaveLength(2);
    state.missingInitial = false; state.ordinaryRules.push(ordinaryRule(83, { version: 2, start_date: '2099-01-01' }));
    expect((await categoryAt(83)).ineffectiveNotice).toContain('不自动回退');
    const failure = new Error('records connection error'); state.failures.set('ledger_records', failure);
    await expect(getForcedLiquidationSettings(input)).rejects.toBe(failure);
  });
  it('missing config/rules/records tables produce no fake numbers and no mutations', async () => {
    const { state } = fixture(); state.stockRules = []; state.ordinaryRules = [ordinaryRule()]; state.missing.add('ledger_tag_config');
    expect(await categoryAt(83)).toMatchObject({ ineffectiveFunds: 16, ineffectiveStatus: 'ready' }); state.missing.clear(); state.missing.add('ledger_records');
    expect(await categoryAt(83)).toMatchObject({ ineffectiveFunds: null, ineffectiveStatus: 'no_data' });
    state.missing.clear(); state.missing.add('ledger_ordinary_tag_downside_rules'); expect(await categoryAt(83)).not.toHaveProperty('ineffectiveFunds');
    expect(db.tx).not.toHaveBeenCalled();
  });
  it('compatibility missing both initial and end columns never SELECT * or expand personal evidence', async () => {
    const { state, conn } = fixture(); state.stockRules = []; state.missingInitial = true; state.missingEnd = true;
    const result = await getForcedLiquidationSettings(input); expect(result.categories).toHaveLength(2);
    expect(callsFor(conn, 'ledger_tag_config')).toHaveLength(3); expect(conn.execute).toHaveBeenCalledTimes(8);
    expect(callsFor(conn, 'ledger_tag_config').every(([sql, values]) => values.length === 1 && values[0] === 37 && !/SELECT \*|initial_balances|user_id|history/.test(sql))).toBe(true);
  });
});

describe('summary implementation safety', () => {
  it('only allowed list SELECTs and pure builder; no network, portfolio/router startup, members/wallet or financial write', async () => {
    const { conn } = fixture(); await getForcedLiquidationSettings(input);
    for (const [sql] of conn.execute.mock.calls) {
      expect(sql).toMatch(/^SELECT\b/); expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|FOR UPDATE)\b|ledger_members|balance_history|participation|wallet/i);
    }
    for (const file of ['./forced-liquidation-settings.ts', './forced-liquidation-setting-summary.ts', './forced-liquidation-setting-detail.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from ['"][^'"]*(?:routers|ledger-stock-portfolio|price-scanner|crypto-portfolio-quotes|backend\/index)/);
      expect(source).not.toMatch(/\b(?:fetch|setInterval|setTimeout|beginTransaction)\s*\(/);
    }
    const pure = readFileSync(new URL('./forced-liquidation-setting-summary.ts', import.meta.url), 'utf8');
    expect(pure).not.toMatch(/getDbConnection|\.execute\(/);
    expect(buildForcedLiquidationStockDetail).toBeTypeOf('function');
  });
});

describe('CNY display list integration: one live FX leg, full enabled totals, native detail unchanged', () => {
  it('mixed A-share/US/crypto totals converted enabled rows, excludes disabled rows, never alters rule/quote/native detail', async () => {
    const { state, conn } = fixture();
    state.lots.push(lot(102, 81, 'AAPL'), lot(103, 81, 'CRYPTO:UNI-USDT'), lot(104, 81, 'MSFT'));
    state.stockRules.push(stockRule(102, 81, 'USD'), stockRule(103, 81, 'USDT'), stockRule(104, 81, 'USD', { enabled: 0 }));
    state.close.push(quote(81, 'AAPL'), quote(81, 'CRYPTO:UNI-USDT'));
    const original = structuredClone(state);
    const c = await categoryAt();
    expect(c.ineffectiveFunds).toBeNull(); // No meaningless native mixed sum.
    expect(c.ineffectiveFundsCny).toBe(2400);
    expect(c.ineffectiveCnyStatus).toBe('ready');
    expect(c.stocks.slice(0, 3).map(s => s.ineffectiveFundsCny)).toEqual([160, 1120, 1120]);
    expect(c.stocks.slice(0, 3).map(s => s.ineffectiveFunds)).toEqual([160, 160, 160]);
    expect(c.stocks[3]).not.toHaveProperty('ineffectiveFundsCny');
    expect(fx.get).toHaveBeenCalledTimes(1); expect(conn.execute).toHaveBeenCalledTimes(8);
    expect(state).toEqual(original); expect(db.tx).not.toHaveBeenCalled();
    const d = await getForcedLiquidationSettingDetail({ ...input, categoryId: 81, lotId: 102 });
    expect(d.currency).toBe('USD'); expect(d.ineffectiveFunds).toBe(160);
    expect(d.rule?.threshold).toBe(80); expect(d).not.toHaveProperty('ineffectiveFundsCny');
    expect(fx.get).toHaveBeenCalledTimes(1); // Lazy native detail has no extra FX read.
  });
  it.each([1, 4, 40])('%s enabled foreign lots use one shared FX observation, not per-lot or per-category requests', async count => {
    const { state, conn } = fixture();
    state.lots = Array.from({ length: count }, (_, i) => lot(101 + i, 81, 'AAPL'));
    state.stockRules = state.lots.map(l => stockRule(l.id, 81, 'USD'));
    state.close = [quote(81, 'AAPL')];
    const c = await categoryAt();
    expect(c.ineffectiveFundsCny).toBe(count * 1120);
    expect(c.ineffectiveFundsCny).toBe(c.stocks.reduce((sum, s) => sum + s.ineffectiveFundsCny!, 0));
    expect(fx.get).toHaveBeenCalledTimes(1); expect(conn.execute).toHaveBeenCalledTimes(8);
  });
  it('CNY-only ordinary and stocks never wait for FX, ordinary signed replay stays native', async () => {
    const { state } = fixture(); state.ordinaryRules = [ordinaryRule()];
    let result = await getForcedLiquidationSettings(input);
    expect(result.categories.find(c => c.categoryId === 81)?.ineffectiveFundsCny).toBe(160);
    expect(result.categories.find(c => c.categoryId === 83)?.ineffectiveFundsCny).toBe(16);
    state.records = [record(1, '2026-11-20', 100), record(2, '2026-11-25', 110)];
    state.ordinaryRules = [ordinaryRule(83, { threshold_amount: 120 })];
    result = await getForcedLiquidationSettings(input);
    expect(result.categories.find(c => c.categoryId === 83)?.ineffectiveFundsCny).toBe(-8);
    expect(fx.get).not.toHaveBeenCalled();
  });
  it.each([null, { rate: 7, pair: 'USD/CNY', stale: true, source: 'sina_usdcny', asOf: '2026-11-26T00:59:59Z' },
    { rate: 7, pair: 'USD/CNH', stale: false, source: 'wrong-pair', asOf: '2026-11-26T00:59:59Z' }])('missing/invalid FX %j keeps foreign and parent pending but native/CNY available', async failed => {
    const { state } = fixture(); state.lots.push(lot(102, 81, 'AAPL'));
    state.stockRules.push(stockRule(102, 81, 'USD')); state.close.push(quote(81, 'AAPL'));
    fx.get.mockResolvedValue(failed);
    const c = await categoryAt();
    expect(c.stocks[0]?.ineffectiveFundsCny).toBe(160);
    expect(c.stocks[1]).toMatchObject({ ineffectiveFunds: 160, ineffectiveFundsCny: null, ineffectiveCnyStatus: 'pending' });
    expect(c.ineffectiveFundsCny).toBeNull(); expect(c.ineffectiveCnyStatus).toBe('pending');
  });
  it('FX rejection fails closed without blocking list or making a partial category sum', async () => {
    const { state } = fixture(); state.lots.push(lot(102, 81, 'AAPL'));
    state.stockRules.push(stockRule(102, 81, 'USD')); state.close.push(quote(81, 'AAPL'));
    fx.get.mockRejectedValue(new Error('rate unavailable'));
    const c = await categoryAt(); expect(c.ineffectiveFundsCny).toBeNull();
    expect(c.stocks[0]?.ineffectiveFundsCny).toBe(160); expect(c.stocks[1]?.ineffectiveFunds).toBe(160);
  });
  it('owner/viewAs rejection, disabled and pending foreign lots cause zero FX requests', async () => {
    const { state } = fixture(); state.owner = 8;
    await expect(getForcedLiquidationSettings(input)).rejects.toThrow('所有者');
    await expect(getForcedLiquidationSettings({ ...input, isViewingAs: true })).rejects.toThrow('代看');
    state.owner = 7; state.lots = [lot(102, 81, 'AAPL')]; state.stockRules = [stockRule(102, 81, 'USD', { enabled: 0 })];
    await getForcedLiquidationSettings(input);
    state.stockRules = [stockRule(102, 81, 'USD')]; state.close = [];
    await getForcedLiquidationSettings(input);
    expect(fx.get).not.toHaveBeenCalled();
  });
});
