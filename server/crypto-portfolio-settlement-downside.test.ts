import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE } from '../shared/usdt-usd-parity-policy';
import { CRYPTO_PORTFOLIO_POLICY_VERSION } from '../shared/crypto-portfolio-policy';
const mocks = vi.hoisted(() => ({ conn: null as any, close: vi.fn(), fx: vi.fn(), stock: vi.fn(), usd: vi.fn(), dirty: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: async () => mocks.conn, getDbTransactionConnection: async () => mocks.conn }));
vi.mock('./crypto-portfolio-quotes', () => ({ fetchCryptoPortfolioCloseQuotes: mocks.close, fetchCryptoPortfolioQuotes: vi.fn() }));
vi.mock('./crypto-portfolio-fx', () => ({ fetchCryptoUsdtCnyAtClose: mocks.fx }));
vi.mock('./stock-usd-cny-rate', () => ({ fetchStockUsdCnyAtClose: mocks.usd }));
vi.mock('./stock-unified-close-quotes', async original => ({ ...await original<any>(), fetchOvernightUnifiedCloseQuotes: mocks.stock, fetchUnifiedCloseQuotes: mocks.stock }));
vi.mock('./stock-calendar-result-cache', () => ({ decodeStockCalendarResult: (v: string) => JSON.parse(v), markStockCalendarResultDirty: mocks.dirty }));
import { publishCryptoPortfolioSnapshots, readCryptoPortfolioCalendar } from './crypto-portfolio-settlement';

const date = '2026-11-25', categoryId = 81, symbol = 'CRYPTO:BTC-USDT';
function db(options: { missingRules?: boolean; late?: boolean; missingEpoch?: boolean; partial?: boolean; oldSale?: boolean; missingSale?: boolean } = {}) {
  const saved = new Map<string, string>(), calls: { sql: string; params: any[] }[] = [];
  const conn: any = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    execute: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM ledger_user_tag_downside_overrides')) {
        expect(sql.replace(/\s+/g, ' ').trim()).toBe("SELECT ledger_id,category_id,target_user_id,actor_user_id,version,mode, DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created_at FROM ledger_user_tag_downside_overrides WHERE ledger_id=? ORDER BY target_user_id,category_id,version");
        expect(params).toEqual([37]);
        return [[]];
      }
      if (sql.startsWith('CREATE TABLE')) {
        if (!sql.includes('ledger_crypto_portfolio_daily_snapshots')) throw new Error('禁止自动安装规则表');
        return [{ affectedRows: 0 }];
      }
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('SELECT DISTINCT category.id')) return [[{ id: categoryId }]];
      if (sql.includes('MIN(e.settlement_effective_date)')) return [[{ activation_date: date }]];
      if (sql.includes('MIN(activation_date)')) return [saved.size ? [{ ledger_id: 37, category_id: categoryId, policy_version: CRYPTO_PORTFOLIO_POLICY_VERSION, activation_date: date, snapshot_date: date }] : []];
      if (sql.startsWith('SELECT payload FROM ledger_crypto')) {
        if (sql.includes('snapshot_date=?')) return [saved.has(params[2]) ? [{ payload: saved.get(params[2]) }] : []];
        return [[...saved.values()].map(payload => ({ payload }))];
      }
      if (sql.includes('FROM ledger_stock_lot_downside_rules')) {
        if (options.missingRules) throw Object.assign(new Error('optional absent'), { code: 'ER_NO_SUCH_TABLE' });
        return [[{ ledger_id: 37, category_id: categoryId, lot_id: 1, user_id: 28, version: 1, enabled: 1,
          threshold_price: 100, downside_percent: 0, effective_at: `${date}T02:00:00.000Z`, baseline_raw_price: 100,
          baseline_counted_price: 100, currency: 'USDT', created_at: `${date}T02:00:00.000Z` }]];
      }
      if (sql.includes('FROM ledger_stock_lot_downside_sales')) return [options.partial && !options.oldSale && !options.missingSale ? [{ lot_id: 1, sell_event_id: 7,
        rule_version: 1, raw_price: 80, counted_price: 100, effective_at: `${date}T06:00:00.000Z` }] : []];
      if (sql.includes('FROM ledger_stock_lot_downside_member_epochs')) return [options.late && !options.missingEpoch ? [{
        ledger_id: 37, category_id: categoryId, lot_id: 1, participation_id: 11, user_id: 28,
        raw_price: 90, counted_price: 100, entry_counted_offset: 10, effective_at: `${date}T04:00:00.000Z` }] : []];
      if (sql.includes('FROM ledger_stock_lots l INNER JOIN ledger_stock_events e')) return [[{ id: 1, symbol, initial_quantity: 2, unit_cost: 100,
        opening_fee: null, actual_traded_at: `${date} 08:00:00`, registered_at: `${date} 08:01:00`, effective_date: date }]];
      if (sql.includes('FROM ledger_stock_event_lot_allocations')) return [options.partial ? [{ lot_id: 1, sell_event_id: 7, symbol, quantity: 1,
        execution_price: 80, event_quantity: 1, transaction_fee: null, actual_traded_at: `${date} ${options.oldSale ? '09' : '14'}:00:00`, registered_at: `${date} ${options.oldSale ? '09' : '14'}:01:00`, effective_date: date }] : []];
      if (sql.includes('FROM ledger_stock_lot_participations p INNER JOIN')) return [[{ id: 11, lot_id: 1, user_id: 28, allocated_quantity: 1,
        remaining_quantity: options.partial ? 0.5 : 1, entry_price: options.late ? 90 : 100, start_date: date, pause_date: null,
        assigned_at: `${date} ${options.late ? '12' : '08'}:00:00`, updated_at: `${date} ${options.late ? '12' : '08'}:00:00` }]];
      if (sql.includes('FROM ledger_stock_participation_closures')) return [options.partial ? [{ participation_id: 11, sell_event_id: 7, lot_id: 1,
        symbol, quantity: 0.5, sale_price: 80, actual_traded_at: `${date} ${options.oldSale ? '09' : '14'}:00:00`, registered_at: `${date} ${options.oldSale ? '09' : '14'}:01:00`, effective_date: date }] : []];
      if (sql.includes('FROM ledger_stock_lot_observations') || sql.includes('FROM ledger_stock_unified_close_prices')
        || sql.includes('FROM ledger_stock_unified_close_fx') || sql.includes('FROM ledger_stock_calendar_results')) return [[]];
      if (sql.startsWith('INSERT IGNORE INTO ledger_crypto')) { saved.set(params[2], params[5]); return [{ affectedRows: 1 }]; }
      throw new Error(`unexpected stub SQL: ${sql}`);
    }) };
  mocks.conn = conn;
  return { conn, calls, saved };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T16:00:00+08:00`)); vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('禁止真实网络'); }));
  mocks.close.mockImplementation(async (symbols: string[], d: string) => Object.fromEntries(symbols.map(s => [s, { symbol: s, price: 80, currency: 'USDT',
    priceDate: d, source: 'crypto_close_gate_1505', updatedAt: `${d}T15:05:03+08:00`, cutoffAt: `${d}T15:05:00+08:00` }])));
  mocks.stock.mockResolvedValue({}); mocks.usd.mockResolvedValue(null); mocks.dirty.mockResolvedValue(undefined);
  mocks.fx.mockImplementation(async (d: string) => ({ snapshotDate: d, usdtCnyRate: 7, pair: 'USDT/CNY', conversionPolicy: USDT_USD_PARITY_POLICY,
    source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny`, asOf: `${d}T15:04:00+08:00`, lockedAt: `${d}T15:05:00+08:00`, carried: false,
    forexSnapshotDate: d, usdCnyRate: 7, usdCnyAsOf: `${d}T15:04:00+08:00`, usdCnySource: 'sina_usdcny', usdtUsdRate: 1,
    usdtUsdAsOf: `${d}T15:05:00+08:00`, usdtUsdSource: USDT_USD_PARITY_SOURCE, observedAt: `${d}T15:05:03+08:00` }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('mixed settlement scoped rule/epoch SQL stub wiring', () => {
  it('missing optional rule table falls back to exact legacy raw values without rule DDL or sale/epoch reads', async () => {
    const state = db({ missingRules: true });
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 1, skipped: 0 });
    const p = JSON.parse(state.saved.get(date)!);
    expect(p.total.nativePnl.USDT).toBe(-40); expect(p.members['28'].nativePnl.USDT).toBe(20);
    expect(state.calls.filter(c => c.sql.includes('FROM ledger_stock_lot_downside_rules')).map(c => c.params)).toEqual([[37, categoryId]]);
    expect(state.calls.some(c => c.sql.includes('downside_sales') || c.sql.includes('downside_member_epochs'))).toBe(false);
  });
  it('late member epoch offsets frozen global counted sale+remaining, preserving real prices and FX evidence', async () => {
    const state = db({ late: true, partial: true });
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 1, skipped: 0 });
    const p = JSON.parse(state.saved.get(date)!);
    expect(p.total.nativePnl.USDT).toBe(0); expect(p.members['28'].nativePnl.USDT).toBe(0);
    expect(p.members['28'].realizedPnl).toBe(0); expect(p.quotes[0].price).toBe(80);
    expect(p.policyVersion).toBe(CRYPTO_PORTFOLIO_POLICY_VERSION); expect(p.fx.usdt.lockedAt).toBe(`${date}T15:05:00+08:00`);
    const reads = state.calls.filter(c => /FROM ledger_stock_lot_downside_(rules|sales|member_epochs)/.test(c.sql));
    expect(reads).toHaveLength(3); expect(reads.every(c => JSON.stringify(c.params) === JSON.stringify([37, categoryId]))).toBe(true);
    expect(state.calls.filter(c => /^(INSERT|UPDATE|DELETE|ALTER)/.test(c.sql)).every(c => c.sql.startsWith('INSERT IGNORE INTO ledger_crypto'))).toBe(true);
  });
  it('late actual member missing epoch refuses publication, including fully closed counted returns', async () => {
    const state = db({ late: true, missingEpoch: true, partial: true });
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 0, skipped: 1,
      failures: [{ reason: 'missing_downside_member_baseline' }] });
    expect(state.saved.size).toBe(0); expect(state.conn.rollback).toHaveBeenCalled(); expect(mocks.dirty).not.toHaveBeenCalled();
  });
  it('old sale without independent counted evidence remains raw rather than backfilled from current rule', async () => {
    const state = db({ partial: true, oldSale: true });
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 1 });
    const p = JSON.parse(state.saved.get(date)!);
    expect(p.total.realizedPnl).toBe(-140); expect(p.total.floatingPnl).toBe(0);
    expect(p.members['28'].realizedPnl).toBe(70); expect(p.members['28'].floatingPnl).toBe(0);
  });
  it('proven post-rule sale missing immutable counted evidence refuses publication instead of silently counting raw', async () => {
    const state = db({ partial: true, missingSale: true });
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 0, skipped: 1,
      failures: [{ reason: 'missing_downside_sale_evidence' }] });
    expect(state.saved.size).toBe(0); expect(state.conn.rollback).toHaveBeenCalled(); expect(mocks.dirty).not.toHaveBeenCalled();
  });
  it('existing fixed snapshot short-circuits before rule/epoch/quote/FX reads and SELECT-only calendar is not rewritten', async () => {
    const state = db();
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 1 });
    const fixed = state.saved.get(date)!, start = state.calls.length;
    mocks.close.mockRejectedValue(new Error('不得重新报价')); mocks.fx.mockRejectedValue(new Error('不得重锁FX'));
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ alreadyPublished: 1, published: 0 });
    expect(state.calls.slice(start).some(c => c.sql.includes('downside') || c.sql.includes('unified_close_fx'))).toBe(false);
    expect(state.saved.get(date)).toBe(fixed); expect(mocks.dirty).toHaveBeenCalledTimes(1);
    const readStart = state.calls.length;
    const rows = await readCryptoPortfolioCalendar(categoryId, 28, new Date(`${date}T16:00:00+08:00`));
    expect(rows[0].totalPnl).toBe(JSON.parse(fixed).members['28'].totalPnl);
    expect(state.calls.slice(readStart).every(c => c.sql.startsWith('SELECT'))).toBe(true);
  });
});
