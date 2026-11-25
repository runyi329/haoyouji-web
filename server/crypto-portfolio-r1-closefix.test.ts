import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE, USDT_USD_PARITY_RATE } from '../shared/usdt-usd-parity-policy';
const mocks = vi.hoisted(() => ({ conn: null as any, tx: null as any, usd: vi.fn(), crypto: vi.fn(), stock: vi.fn(), dirty: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: async () => mocks.conn, getDbTransactionConnection: async () => mocks.tx }));
vi.mock('./stock-usd-cny-rate', () => ({ fetchStockUsdCnyAtClose: mocks.usd, getLiveStockUsdCnyQuote: vi.fn() }));
vi.mock('./crypto-portfolio-quotes', () => ({ fetchCryptoPortfolioCloseQuotes: mocks.crypto, fetchCryptoPortfolioQuotes: vi.fn() }));
vi.mock('./stock-unified-close-quotes', async original => ({ ...(await original<any>()), fetchOvernightUnifiedCloseQuotes: mocks.stock, fetchUnifiedCloseQuotes: mocks.stock }));
vi.mock('./stock-calendar-result-cache', () => ({ decodeStockCalendarResult: (value: string) => JSON.parse(value), markStockCalendarResultDirty: mocks.dirty }));
const date = '2026-11-21', anchor = '2026-11-20', categoryId = 90250, symbol = 'CRYPTO:UNI-USDT';
const policy = 'cn-day-us-overnight-1505-v1';
const archive = (patch = {}) => ({ ledger_id: 37, category_id: categoryId, snapshot_date: anchor, policy_version: policy, pair: 'USD/CNY',
  usd_cny_rate: '6.67040000', source: 'sina_usdcny', as_of: `${anchor} 15:04:01`, locked_at: `${anchor} 15:05:00`, ...patch });
const upstream = (patch = {}) => ({ snapshotDate: anchor, pair: 'USD/CNY', source: 'yahoo_usdcny_5m', usdCnyRate: 6.8,
  asOf: `${anchor}T15:05:00+08:00`, lockedAt: `${anchor}T15:05:00+08:00`, ...patch });
let api: typeof import('./crypto-portfolio-settlement');
let fxApi: typeof import('./crypto-portfolio-fx');
let network: ReturnType<typeof vi.fn>;
function db(options: { rows?: any[]; cryptoOnly?: boolean; oldEdited?: boolean; laterActual?: string; laterRegistered?: string } = {}) {
  const sqls: Array<{ sql: string; params: any[]; transaction: boolean }> = [], saved = new Map<string, string>();
  let started = false;
  const tx: any = { beginTransaction: vi.fn(async () => { started = true; }), commit: vi.fn(async () => { started = false; }),
    rollback: vi.fn(async () => { started = false; }), release: vi.fn(),
    execute: vi.fn(async (sql: string, params: any[] = []) => {
      sqls.push({ sql, params, transaction: started });
      if (sql.includes('FROM ledger_stock_lot_downside_rules')) return [[]];
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.startsWith('SELECT payload FROM ledger_crypto')) return [saved.has(params[2]) ? [{ payload: saved.get(params[2]) }] : []];
      if (sql.includes('MIN(e.settlement_effective_date)')) return [[{ activation_date: date }]];
      if (sql.includes('MIN(activation_date)')) return [[]];
      if (sql.includes('FROM ledger_stock_lots l INNER JOIN ledger_stock_events e')) return [[
        { id: 29, symbol, initial_quantity: 1561.47, unit_cost: 4.238, opening_fee: 6.61750986,
          actual_traded_at: `${date} 12:08:00`, registered_at: `${date} 12:09:00`, effective_date: date },
        ...options.cryptoOnly ? [] : [
          { id: 1, symbol: 'AAPL', initial_quantity: 1, unit_cost: 100, opening_fee: 0,
            actual_traded_at: '2026-11-19 22:00:00', registered_at: '2026-11-19 22:01:00' },
          { id: 28, symbol: 'GOOGL', initial_quantity: 1, unit_cost: 272.37, opening_fee: 0,
            actual_traded_at: options.laterActual ?? `${anchor} 22:22:00`, registered_at: options.laterRegistered ?? `${anchor} 22:23:39` },
        ],
      ]];
      if (sql.includes('FROM ledger_stock_lot_participations p INNER JOIN')) return [options.cryptoOnly ? [] : [
        { id: 1, lot_id: 1, user_id: 28, allocated_quantity: 1, remaining_quantity: 1, entry_price: 100, start_date: options.oldEdited ? '2026-11-23' : '2026-11-19',
          pause_date: null, assigned_at: '2026-11-19 22:02:00', updated_at: options.oldEdited ? `${date} 14:00:00` : '2026-11-19 22:02:00' },
        { id: 221, lot_id: 28, user_id: 28, allocated_quantity: 1, remaining_quantity: 1, entry_price: 272.37, start_date: anchor,
          pause_date: null, assigned_at: `${anchor} 23:15:35`, updated_at: `${date} 16:12:47` },
      ]];
      if (sql.includes('FROM ledger_stock_event_lot_allocations') || sql.includes('FROM ledger_stock_participation_closures') || sql.includes('FROM ledger_stock_lot_observations')) return [[]];
      if (sql.includes('FROM ledger_stock_unified_close_prices')) return [[{ symbol: 'AAPL', price: 110, currency: 'USD', source: 'unified_close_yahoo', price_date: '2026-11-19', captured_at: `${anchor} 05:00:00` }]];
      if (sql.includes('FROM ledger_stock_unified_close_fx')) return [options.rows ?? [archive()]];
      if (sql.includes('FROM ledger_stock_calendar_results')) return [[{ payload: JSON.stringify([{ snapshotDate: anchor, ready: true, totalPnl: 66.704, nativePnl: { CNY: 0, USD: 10 }, policyVersion: policy }]) }]];
      if (sql.startsWith('INSERT IGNORE INTO ledger_crypto')) { saved.set(params[2], params[5]); return [{ affectedRows: 1 }]; }
      throw new Error(`unexpected transaction SQL: ${sql}`);
    }) };
  const conn = { execute: vi.fn(async (sql: string) => {
    if (sql.startsWith('CREATE TABLE')) return [{ affectedRows: 0 }];
    if (sql.includes('SELECT DISTINCT category.id')) return [[{ id: categoryId }]];
    throw new Error(`non-transaction evidence read: ${sql}`);
  }) };
  mocks.conn = conn; mocks.tx = tx;
  return { conn, tx, sqls, saved };
}
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T17:00:00+08:00`));
  mocks.usd.mockReset().mockResolvedValue(null); mocks.stock.mockReset().mockResolvedValue({}); mocks.dirty.mockReset().mockResolvedValue(undefined);
  mocks.crypto.mockReset().mockImplementation(async (symbols: string[], d: string) => Object.fromEntries(symbols.map(s => [s, { symbol: s, price: 4.3, currency: 'USDT', priceDate: d,
    source: 'crypto_close_gate_1505', updatedAt: `${d}T15:05:03+08:00`, cutoffAt: `${d}T15:05:00+08:00` }])));
  network = vi.fn(async () => { throw new Error('unexpected FX network; USD archived/mocked, Coinbase forbidden'); });
  vi.stubGlobal('fetch', network);
  api = await import('./crypto-portfolio-settlement'); fxApi = await import('./crypto-portfolio-fx');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('R1 persisted USD anchor via mock SELECT → authorized parity policy', () => {
  it('Saturday UNI lot29 uses Friday6.6704 and Saturday policy time, excludes Friday-night GOOGL and keeps trustworthy daily baseline', async () => {
    const state = db();
    expect(await api.publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 1, skipped: 0 });
    const payload = JSON.parse(state.saved.get(date)!);
    expect(payload.fx.usdt).toMatchObject({ carried: true, forexSnapshotDate: anchor, usdCnyRate: 6.6704, usdCnySource: 'sina_usdcny',
      usdCnyAsOf: `${anchor}T07:04:01.000Z`, usdtUsdRate: USDT_USD_PARITY_RATE, usdtUsdAsOf: `${date}T07:05:00.000Z`,
      conversionPolicy: USDT_USD_PARITY_POLICY, usdtUsdSource: USDT_USD_PARITY_SOURCE,
      source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny_carried_A_anchor_${anchor}`,
      asOf: `${anchor}T07:04:01.000Z`, observedAt: `${date}T09:00:00.000Z` });
    expect(payload.fx.usdt.usdtCnyRate).toBe(6.6704);
    expect(payload.total.sourceDates).toEqual({ A: anchor, US: '2026-11-19', CRYPTO: date });
    expect(payload.total.positionCount).toBe(2); expect(payload.members['28'].positionCount).toBe(1);
    expect(payload.total.dailyPnlReady).toBe(true); expect(payload.members['28'].dailyPnlReady).toBe(true);
    expect(payload.members['28'].dailyPnl).toBeCloseTo(0, 10);
    expect(mocks.usd).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled(); expect(mocks.stock).not.toHaveBeenCalled();
    const reads = state.sqls.filter(q => q.sql.includes('FROM ledger_stock_unified_close_fx'));
    expect(reads.every(q => q.transaction && JSON.stringify(q.params) === JSON.stringify([37, categoryId, anchor, policy]))).toBe(true);
    expect(reads[0].sql).toContain("'USD/CNY' AS pair"); expect(reads[0].sql).toContain('SELECT ledger_id,category_id,policy_version');
    expect(state.sqls.filter(q => !q.sql.startsWith('SELECT')).every(q => q.sql.startsWith('INSERT IGNORE INTO ledger_crypto'))).toBe(true);
    expect(state.saved.has(anchor)).toBe(false);
    const frozen = state.saved.get(date); state.sqls.length = 0;
    expect(await api.publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ alreadyPublished: 1, published: 0 });
    expect(state.saved.get(date)).toBe(frozen); expect(state.sqls.some(q => q.sql.includes('unified_close_fx'))).toBe(false);
    expect(network).not.toHaveBeenCalled(); expect(mocks.dirty).toHaveBeenCalledTimes(1);
  });
  it('crypto-only scope also reads same-scope persistent USD leg without any USD history network', async () => {
    const state = db({ cryptoOnly: true });
    expect(await api.publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 1 });
    expect(JSON.parse(state.saved.get(date)!).fx.usd).toBeNull(); expect(mocks.usd).not.toHaveBeenCalled();
    expect(state.sqls.some(q => q.sql.includes('unified_close_fx') && q.transaction)).toBe(true);
  });
  it.each([
    ['ledger', { ledger_id: 38 }], ['category', { category_id: 90251 }], ['date', { snapshot_date: date }],
    ['policy', { policy_version: null }], ['old policy', { policy_version: 'old' }], ['pair', { pair: 'USDT/CNY' }],
    ['null rate', { usd_cny_rate: null }], ['infinite rate', { usd_cny_rate: 'Infinity' }], ['boolean rate', { usd_cny_rate: true }],
    ['null time', { as_of: null }], ['too old', { as_of: `${anchor} 14:34:59` }], ['after cutoff', { as_of: `${anchor} 15:05:01` }],
    ['future', { as_of: '2026-11-22 15:04:00' }], ['wrong lock', { locked_at: `${anchor} 15:06:00` }],
    ['null lock', { locked_at: null }], ['future lock', { locked_at: '2026-11-22 15:05:00' }], ['source', { source: 'invented' }],
  ])('invalid archive %s falls back only to verified real history; no archive relabel/fixed rate', async (_name, patch) => {
    const state = db({ rows: [archive(patch)] }); mocks.usd.mockResolvedValue(upstream());
    expect(await api.publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 1 });
    const payload = JSON.parse(state.saved.get(date)!);
    expect(payload.fx.usdt.usdCnySource).toBe('yahoo_usdcny_5m'); expect(payload.fx.usdt.usdCnyRate).toBe(6.8);
    expect(payload.fx.usd.usdCnyRate).toBe(6.8); expect(mocks.usd).toHaveBeenCalledTimes(1);
    expect(mocks.usd).toHaveBeenCalledWith(anchor);
  });
  it.each(['absent', 'conflicting sources', 'invalid with timeout'])('%s remains pending if historical fallback has no evidence', async reason => {
    const rows = reason === 'absent' ? [] : reason === 'conflicting sources' ? [archive(), archive({ source: 'yahoo_usdcny_5m' })] : [archive({ source: 'bad' })];
    const state = db({ rows }); if (reason.includes('timeout')) mocks.usd.mockRejectedValue(new Error('timeout'));
    expect(await api.publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 0, failures: [{ reason: 'missing_historical_fx' }] });
    expect(state.saved.size).toBe(0); expect(state.tx.rollback).toHaveBeenCalled(); expect(mocks.dirty).not.toHaveBeenCalled(); expect(mocks.usd).toHaveBeenCalledTimes(1);
  });
  it('valid real USD archive plus explicit policy is sufficient even when Coinbase is offline, with no USDT network request', async () => {
    const state = db(); network.mockRejectedValue(new Error('Coinbase timeout'));
    expect(await api.publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 1, skipped: 0 });
    expect(JSON.parse(state.saved.get(date)!).fx.usdt).toMatchObject({ conversionPolicy: USDT_USD_PARITY_POLICY,
      usdtUsdRate: 1, usdtUsdSource: USDT_USD_PARITY_SOURCE, usdCnyRate: 6.6704, usdtCnyRate: 6.6704 });
    expect(mocks.usd).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });
  it('old physically active lot edited to future start still loses baseline; guard is not waived', async () => {
    const state = db({ oldEdited: true });
    expect(await api.publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 1 });
    const member = JSON.parse(state.saved.get(date)!).members['28'];
    expect(member.dailyPnlReady).toBe(false); expect(member.dailyPnlReason).toBe('missing_reliable_previous_baseline');
  });
  it('later physical opening with untrustworthy registration timing does not exempt postcutoff configuration', async () => {
    const state = db({ laterRegistered: '2026-11-19 22:23:39' });
    expect(await api.publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId })).toMatchObject({ published: 1 });
    expect(JSON.parse(state.saved.get(date)!).members['28'].dailyPnlReady).toBe(false);
  });
  it('injected archive bypasses a prior cached upstream null, and conflict-source points have separate cache keys', async () => {
    expect(await fxApi.fetchCryptoUsdtCnyAtClose(date)).toBeNull();
    const point = upstream({ source: 'sina_usdcny', usdCnyRate: 6.6704, asOf: `${anchor}T15:04:01+08:00` }) as any;
    const first = await fxApi.fetchCryptoUsdtCnyAtClose(date, { usdCnyClose: point });
    const second = await fxApi.fetchCryptoUsdtCnyAtClose(date, { usdCnyClose: upstream() as any });
    expect(first?.usdCnyRate).toBe(6.6704); expect(second?.usdCnyRate).toBe(6.8);
    expect(second?.usdCnySource).toBe('yahoo_usdcny_5m'); expect(mocks.usd).toHaveBeenCalledTimes(1);
  });
});
