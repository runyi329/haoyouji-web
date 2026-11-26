import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), tx: vi.fn(), dirty: vi.fn(), invalidations: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: mocks.get, getDbTransactionConnection: mocks.tx }));
vi.mock('./stock-calendar-result-cache', () => ({ markStockCalendarResultDirty: mocks.dirty }));
vi.mock('./stock-lot-downside-rules', async original => ({
  ...await original<typeof import('./stock-lot-downside-rules')>(), invalidateStockLotDownsideRuleCache: mocks.invalidations,
}));
// A forbidden import is a test failure, rather than accidentally starting the application or market requests.
vi.mock('./ledger-stock-portfolio', () => { throw new Error('Forbidden full portfolio import'); });
vi.mock('./routers', () => { throw new Error('Forbidden routers import'); });
vi.mock('./_core/index', () => { throw new Error('Forbidden startup import'); });
vi.mock('./price-scanner', () => { throw new Error('Forbidden quote source import'); });
vi.mock('./crypto-portfolio-quotes', () => { throw new Error('Forbidden crypto source import'); });
import { createStockLotDownsideVersion } from '../shared/stock-lot-downside';
import { isStockLotDownsideAutoQuoteValid, processStockLotDownsideAutoQuote, type StockLotDownsideAutoQuote } from './stock-lot-downside-auto-trigger';
const now = new Date('2026-11-25T06:01:30.987Z');
const quote: StockLotDownsideAutoQuote = { ledgerId: 37, categoryId: 90250, symbol: '600000.SH', price: 90,
  currency: 'CNY', priceDate: '2026-11-25', observedAt: '2026-11-25T06:01:30.123Z', source: '新浪财经' };
const waiting = createStockLotDownsideVersion({ ledgerId: 37, categoryId: 90250, lotId: 1, userId: 7, currency: 'CNY',
  enabled: true, activationMode: 'auto_drop', autoDropPercent: 10, autoEntryPrice: 100, expectedVersion: 0,
  effectiveAt: '2026-11-25T05:00:00.456Z', currentRawPrice: NaN, holdingStartAt: '2026-11-20T02:00:00.000Z' }, null);
const lot = { id: 1, ledger_id: 37, category_id: 90250, symbol: quote.symbol, initial_quantity: '10.00000000', unit_cost: '100',
  opened_event_id: 11, opened_at_wall: '2026-11-20 10:00:00', ledger_owner_id: 7, category_scope_id: 90250,
  category_ledger_id: 37, parentId: null, isDefault: 0, accounting_mode: 'stock_portfolio' };
const opening = { id: 11, ledger_id: 37, category_id: 90250, event_type: 'buy', status: 'active', symbol: quote.symbol,
  quantity: '10.00000000', execution_price: '100', actual_traded_at_wall: lot.opened_at_wall };
function row(rule: typeof waiting) {
  return { ledger_id: rule.ledgerId, category_id: rule.categoryId, lot_id: rule.lotId, user_id: rule.userId, version: rule.version,
    enabled: Number(rule.enabled), threshold_price: rule.thresholdPrice, downside_percent: rule.downsidePercent, start_date: rule.startDate,
    effective_at: rule.effectiveAt, baseline_raw_price: rule.baselineRawPrice, baseline_counted_price: rule.baselineCountedPrice,
    baseline_status: rule.baselineStatus, baseline_source: rule.baselineSource, holding_start_at: rule.holdingStartAt,
    currency: rule.currency, created_at: rule.createdAt, activation_mode: rule.activationMode, auto_drop_percent: rule.autoDropPercent,
    auto_entry_price: rule.autoEntryPrice, armed_at: rule.armedAt, triggered_at: rule.triggeredAt, trigger_price: rule.triggerPrice,
    trigger_quote_as_of: rule.triggerQuoteAsOf, trigger_source: rule.triggerSource };
}
function setup(options: { lot?: object; opening?: object; rules?: any[]; latest?: any; sold?: number;
  dirtyError?: boolean; commitError?: boolean; missing?: number; insertError?: boolean } = {}) {
  const originalRows = options.rules ?? [row(waiting)];
  const conn = { execute: vi.fn(async (sql: string) => {
    if (!/^SELECT/.test(sql)) throw new Error('Forbidden pre-read write/DDL');
    if (options.missing) throw Object.assign(new Error('missing schema'), { errno: options.missing });
    if (sql.includes('FROM ledger_stock_lot_downside_rules')) return [originalRows];
    if (sql.includes('FROM ledger_stock_lots l')) return [[lot]];
    throw new Error(`Unexpected pre-read SQL ${sql}`);
  }) };
  const tx = { beginTransaction: vi.fn(async () => {}), commit: vi.fn(async () => { if (options.commitError) throw new Error('commit'); }),
    rollback: vi.fn(async () => {}), release: vi.fn(), execute: vi.fn(async (sql: string, _params?: any[]) => {
      if (sql.includes('FROM ledger_stock_lots l')) return [[{ ...lot, ...options.lot }]];
      if (sql.includes('FROM ledger_stock_events WHERE')) return [[{ ...opening, ...options.opening }]];
      if (sql.includes('FROM ledger_stock_lot_downside_rules')) return [[options.latest ?? originalRows.at(-1)]];
      if (sql.includes('FROM ledger_stock_event_lot_allocations a')) return [[{ quantity: options.sold ?? 2 }]];
      if (sql.startsWith('INSERT INTO ledger_stock_lot_downside_rules')) {
        if (options.insertError) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Forbidden/unexpected transaction SQL ${sql}`);
    }) };
  mocks.get.mockResolvedValue(conn); mocks.tx.mockResolvedValue(tx);
  mocks.dirty.mockImplementation(async () => { if (options.dirtyError) throw new Error('missing derived table'); });
  return { conn, tx };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PREVIEW_READONLY', 'false'); vi.stubEnv('FAST_PREVIEW', 'false'); vi.stubEnv('DEV_BYPASS_AUTH', 'false');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Forbidden network call'); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('auto quote pure fail-closed checks', () => {
  it('current fresh A share regular session is accepted without DB/network', () => {
    expect(isStockLotDownsideAutoQuoteValid(quote, now)).toBe(true);
    expect(mocks.get).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it.each([
    { price: 0 }, { price: -1 }, { price: NaN }, { price: Infinity }, { ledgerId: 52 }, { currency: 'USD' },
    { categoryId: -1 }, { observedAt: '' }, { observedAt: '2026-11-25 14:01:30' }, { observedAt: '2026-11-25T06:01:31.000Z' },
    { observedAt: '2026-11-25T05:59:30.986Z' }, { source: '' }, { source: 'unknown' }, { source: '新浪财经·昨收参考' },
    { source: 'close' }, { source: 'Tushare 日线收盘' }, { source: '新浪财经 fallback' }, { priceDate: '2026-11-24' },
    { kind: 'reference' }, { kind: 'close' }, { isReference: true }, { isFallback: true }, { isHistorical: true },
    { lookbackLow: 80 }, { rangeLow: 80 }, { low4h: 80 }, { cutoffAt: '2026-11-25T06:00:00Z' },
    { priceKind: 'reference' }, { priceType: 'lookback_low' }, { isClose: true }, { isLookbackLow: true },
    { isPreview: true }, { isViewingAs: true }, { autoTriggerEligible: false },
  ])('rejects invalid quote metadata %j before SQL', async change => {
    expect(await processStockLotDownsideAutoQuote({ ...quote, ...change } as any, now)).toEqual([]);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.tx).not.toHaveBeenCalled();
  });
  it('freshness <=120s inclusive, no future grace', () => {
    expect(isStockLotDownsideAutoQuoteValid({ ...quote, observedAt: new Date(now.getTime() - 120_000) }, now)).toBe(true);
    expect(isStockLotDownsideAutoQuoteValid({ ...quote, observedAt: now }, now)).toBe(true);
  });
  it.each([
    ['2026-11-25T01:29:59Z', '2026-11-25'], ['2026-11-25T03:30:00Z', '2026-11-25'],
    ['2026-11-25T04:59:59Z', '2026-11-25'], ['2026-11-25T07:00:00Z', '2026-11-25'],
    ['2026-11-22T06:00:00Z', '2026-11-22'], ['2026-10-01T06:00:00Z', '2026-10-01'],
  ])('rejects A nonregular session / holiday %s', (at, priceDate) => {
    expect(isStockLotDownsideAutoQuoteValid({ ...quote, observedAt: at, priceDate }, new Date(at))).toBe(false);
  });
  it.each([
    ['2026-11-25T14:30:00Z', true], ['2026-07-02T13:30:00Z', true], ['2026-11-25T14:29:59Z', false],
    ['2026-11-25T21:00:00Z', false], ['2026-11-26T15:00:00Z', false], ['2026-07-03T15:00:00Z', false],
  ])('US DST-safe regular session and holiday %s', (at, valid) => {
    expect(isStockLotDownsideAutoQuoteValid({ ...quote, symbol: 'AAPL', currency: 'USD', source: 'Yahoo Finance',
      observedAt: at, priceDate: at.slice(0, 10) }, new Date(at))).toBe(valid);
  });
  it('crypto is all-day including holidays, same Beijing date, distinct USDT', () => {
    const at = '2026-11-22T23:00:00Z';
    expect(isStockLotDownsideAutoQuoteValid({ ...quote, symbol: 'CRYPTO:BTC-USDT', currency: 'USDT', source: 'Gate.io',
      observedAt: at, priceDate: '2026-11-23' }, new Date(at))).toBe(true);
  });
});
describe('scanner isolated append-only transaction', () => {
  it.each(['PREVIEW_READONLY', 'FAST_PREVIEW', 'DEV_BYPASS_AUTH'])('%s rejects even valid quote before DB', async name => {
    vi.stubEnv(name, 'true'); expect(await processStockLotDownsideAutoQuote(quote, now)).toEqual([]);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.tx).not.toHaveBeenCalled();
  });
  it.each([1146, 1054])('missing table/auto columns %i is SELECT-only no-op without DDL', async missing => {
    const h = setup({ missing }); expect(await processStockLotDownsideAutoQuote(quote, now)).toEqual([]);
    expect(h.conn.execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
    expect(mocks.tx).not.toHaveBeenCalled();
  });
  it('threshold equality confirms append at actual UTC millisecond instant (not midnight)', async () => {
    const h = setup();
    expect(await processStockLotDownsideAutoQuote(quote, now)).toEqual([{ ledgerId: 37, categoryId: 90250, lotId: 1, version: 2 }]);
    expect(h.tx.execute.mock.calls.slice(0, 3).map(([sql]) => sql.match(/FROM (\w+)/)?.[1]))
      .toEqual(['ledger_stock_lots', 'ledger_stock_events', 'ledger_stock_lot_downside_rules']);
    expect(h.tx.execute.mock.calls.slice(0, 3).every(([sql]) => sql.includes('FOR UPDATE'))).toBe(true);
    const insert = h.tx.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT'))!;
    const values = insert[1]!;
    expect(values[8]).toBe('2026-11-25 06:01:30.987'); expect(values[13]).toBe('2026-11-25 06:01:30.987');
    expect(values[21]).toBe('2026-11-25 05:00:00.456'); expect(values[22]).toBe('2026-11-25 06:01:30.987');
    expect(values[24]).toBe('2026-11-25 06:01:30.123'); expect(values[25]).toBe('新浪财经');
    expect(h.tx.commit).toHaveBeenCalledOnce(); expect(h.tx.rollback).not.toHaveBeenCalled(); expect(h.tx.release).toHaveBeenCalledOnce();
    expect(mocks.dirty).toHaveBeenCalledWith(h.tx, 90250);
    expect(mocks.invalidations.mock.calls).toEqual([[h.conn, 37, 90250], [h.tx, 37, 90250]]);
    const soldSql = h.tx.execute.mock.calls.find(([sql]) => sql.includes('SUM(a.quantity)'))![0];
    expect(soldSql).toContain("e.event_type IN ('reduce','sell')"); expect(soldSql).toContain("e.status='active'");
    expect(h.tx.execute.mock.calls.every(([sql]) => /^SELECT|^INSERT INTO ledger_stock_lot_downside_rules/.test(sql))).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('only newest scope rule is eligible: newer disabled/manual/triggered cannot expose older waiting', async () => {
    for (const latest of [row({ ...waiting, version: 2, enabled: false }), row({ ...waiting, version: 2, activationMode: 'manual' }),
      row({ ...waiting, version: 2, triggeredAt: now.toISOString(), effectiveAt: now.toISOString(), triggerPrice: 90,
        triggerQuoteAsOf: String(quote.observedAt), triggerSource: quote.source })]) {
      setup({ rules: [row(waiting), latest] }); expect(await processStockLotDownsideAutoQuote(quote, now)).toEqual([]);
    }
    expect(mocks.tx).not.toHaveBeenCalled();
  });
  it('quote before armedAt and price above threshold never enter transaction', async () => {
    setup({ rules: [row({ ...waiting, armedAt: now.toISOString(), effectiveAt: now.toISOString() })] });
    expect(await processStockLotDownsideAutoQuote(quote, now)).toEqual([]);
    setup(); expect(await processStockLotDownsideAutoQuote({ ...quote, price: 90.0000000001 }, now)).toEqual([]);
    expect(mocks.tx).not.toHaveBeenCalled();
  });
  it.each([
    { lot: { ledger_owner_id: 8 } }, { lot: { parentId: 12 } }, { lot: { isDefault: 1 } },
    { lot: { category_ledger_id: 52 } }, { lot: { category_scope_id: 1 } }, { lot: { accounting_mode: 'manual_balance' } },
    { lot: { symbol: 'AAPL' } }, { lot: { unit_cost: 101 } }, { lot: { initial_quantity: 9 } }, { lot: { opened_event_id: 12 } },
    { opening: { status: 'voided' } }, { opening: { symbol: 'AAPL' } }, { opening: { event_type: 'sell' } },
    { opening: { ledger_id: 52 } }, { opening: { category_id: 2 } }, { opening: { quantity: 9 } },
    { opening: { execution_price: 101 } }, { opening: { actual_traded_at_wall: '2026-11-21 10:00:00' } },
    { sold: 10 }, { sold: NaN }, { sold: -1 }, { latest: row({ ...waiting, enabled: false }) },
    { latest: row({ ...waiting, version: 2 }) }, { latest: row({ ...waiting, autoDropPercent: 11 }) },
    { latest: row({ ...waiting, triggerSource: 'damaged' }) },
    { lot: { opened_at_wall: '2026-11-21 10:00:00' }, opening: { actual_traded_at_wall: '2026-11-21 10:00:00' } },
  ])('lock-time changed state %j rolls back with no derived/cache pollution', async change => {
    const h = setup(change); expect(await processStockLotDownsideAutoQuote(quote, now)).toEqual([]);
    expect(h.tx.commit).not.toHaveBeenCalled(); expect(h.tx.rollback).toHaveBeenCalledOnce(); expect(h.tx.release).toHaveBeenCalledOnce();
    expect(h.tx.execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
    expect(mocks.dirty).not.toHaveBeenCalled(); expect(mocks.invalidations).not.toHaveBeenCalled();
  });
  it.each([{ insertError: true }, { dirtyError: true }, { commitError: true }])('write failure %j returns no committed scope', async options => {
    const h = setup(options); expect(await processStockLotDownsideAutoQuote(quote, now)).toEqual([]);
    expect(h.tx.rollback).toHaveBeenCalledOnce(); expect(h.tx.release).toHaveBeenCalledOnce(); expect(mocks.invalidations).not.toHaveBeenCalled();
  });
  it('one candidate rollback does not block another real lot in the quote batch', async () => {
    const first = row(waiting), second = row({ ...waiting, lotId: 2 });
    const h = setup({ rules: [first, second] });
    h.conn.execute.mockImplementation(async (sql: string) => sql.includes('FROM ledger_stock_lot_downside_rules')
      ? [[first, second]] : [[lot, { ...lot, id: 2, opened_event_id: 12 }]]);
    h.tx.execute.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM ledger_stock_lots l')) return [[{ ...lot, id: params![0], opened_event_id: params![0] === 1 ? 11 : 12 }]];
      if (sql.includes('FROM ledger_stock_events WHERE')) return [[{ ...opening, id: params![0], status: params![0] === 11 ? 'voided' : 'active' }]];
      if (sql.includes('FROM ledger_stock_lot_downside_rules')) return [[params![2] === 1 ? first : second]];
      if (sql.includes('SUM(a.quantity)')) return [[{ quantity: 0 }]];
      if (sql.startsWith('INSERT INTO ledger_stock_lot_downside_rules')) return [{ affectedRows: 1 }];
      throw new Error('Forbidden SQL');
    });
    expect(await processStockLotDownsideAutoQuote(quote, now)).toEqual([{ ledgerId: 37, categoryId: 90250, lotId: 2, version: 2 }]);
    expect(h.tx.rollback).toHaveBeenCalledOnce(); expect(h.tx.commit).toHaveBeenCalledOnce(); expect(mocks.dirty).toHaveBeenCalledOnce();
  });
  it('concurrent scan after another committed trigger observes latest version under lock and appends once', async () => {
    const h = setup(); let latestRow: any = row(waiting);
    let tail = Promise.resolve(); let insertCount = 0;
    mocks.tx.mockImplementation(async () => {
      let ownRelease: () => void = () => {};
      const tx = { ...h.tx, execute: vi.fn(async (sql: string, values?: any[]) => {
        if (sql.includes('FROM ledger_stock_lots l')) {
          const previous = tail; tail = new Promise<void>(resolve => { ownRelease = resolve; }); await previous;
        }
        if (sql.includes('FROM ledger_stock_lot_downside_rules')) return [[latestRow]];
        if (sql.startsWith('INSERT INTO ledger_stock_lot_downside_rules')) {
          insertCount++; latestRow = { ...latestRow, version: 2, effective_at: now.toISOString(), triggered_at: now.toISOString(),
            trigger_price: quote.price, trigger_quote_as_of: String(quote.observedAt), trigger_source: quote.source };
        }
        return h.tx.execute(sql, values);
      }), commit: vi.fn(async () => { ownRelease(); }), rollback: vi.fn(async () => { ownRelease(); }), release: vi.fn() };
      return tx;
    });
    const results = await Promise.all([processStockLotDownsideAutoQuote(quote, now), processStockLotDownsideAutoQuote(quote, now)]);
    expect(results.flat()).toHaveLength(1); expect(insertCount).toBe(1); expect(mocks.dirty).toHaveBeenCalledOnce();
  });
});
