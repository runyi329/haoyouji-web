import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCryptoPortfolioDailyPayload, cryptoPortfolioStockAnchor, type CryptoCalendarInput } from './shared/crypto-portfolio-calendar';
import { CRYPTO_PORTFOLIO_POLICY_VERSION } from '../shared/crypto-portfolio-policy';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE } from '../shared/usdt-usd-parity-policy';
const m = vi.hoisted(() => ({ network: vi.fn(() => { throw new Error('禁止真实网络'); }) }));
vi.mock('./db', () => ({ getDbConnection: () => { throw new Error('必须注入mock conn'); }, getDbTransactionConnection: () => { throw new Error('禁止事务'); } }));
vi.mock('./crypto-portfolio-quotes', () => ({ fetchCryptoPortfolioCloseQuotes: m.network, fetchCryptoPortfolioQuotes: m.network }));
vi.mock('./crypto-portfolio-fx', () => ({ fetchCryptoUsdtCnyAtClose: m.network }));
vi.mock('./stock-usd-cny-rate', () => ({ fetchStockUsdCnyAtClose: m.network }));
vi.mock('./stock-calendar-result-cache', () => ({ decodeStockCalendarResult: JSON.parse, markStockCalendarResultDirty: () => { throw new Error('禁止dirty write'); } }));
import { readCryptoPortfolioCalendar } from './crypto-portfolio-settlement';
const categoryId = 81, date = '2026-11-25', symbol = 'CRYPTO:BTC-USDT';
function data(d: string, price: number): CryptoCalendarInput {
  const a = cryptoPortfolioStockAnchor(d)!.A;
  return { categoryId, snapshotDate: d, activationDate: '2026-11-24', now: new Date(`${d}T16:00:00+08:00`),
    lots: [{ id: 1, symbol, initialQuantity: 2, unitCost: 200, openingFee: null, openedDate: '2026-11-24',
      actualTradedAt: '2026-11-24T08:00:00+08:00', registeredAt: '2026-11-24T08:01:00+08:00' }], sales: [], closures: [],
    participations: [28, 29].map((userId, i) => ({ id: 11 + i, lotId: 1, userId, allocatedQuantity: 1, remainingQuantity: 1,
      entryPrice: 200, startDate: '2026-11-24', pauseDate: null, assignedAt: '2026-11-24T08:02:00+08:00', updatedAt: '2026-11-24T08:02:00+08:00' })), observations: [],
    quotes: [{ symbol, price, currency: 'USDT', priceDate: d, source: 'crypto_close_gate_1505', updatedAt: `${d}T15:05:03+08:00`, cutoffAt: `${d}T15:05:00+08:00` }], usdFx: null,
    usdtFx: { snapshotDate: d, usdtCnyRate: 7, pair: 'USDT/CNY', conversionPolicy: USDT_USD_PARITY_POLICY,
      source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny`, asOf: `${a}T15:04:00+08:00`, lockedAt: `${d}T15:05:00+08:00`, carried: false,
      forexSnapshotDate: a, usdCnyRate: 7, usdCnyAsOf: `${a}T15:04:00+08:00`, usdCnySource: 'sina_usdcny',
      usdtUsdRate: 1, usdtUsdAsOf: `${d}T15:05:00+08:00`, usdtUsdSource: USDT_USD_PARITY_SOURCE, observedAt: `${d}T15:05:03+08:00` }, captureHistoryEvidence: true };
}
function db() {
  let version = 1, ratio = 20;
  const first = buildCryptoPortfolioDailyPayload(data('2026-11-24', 200));
  const second = buildCryptoPortfolioDailyPayload({ ...data(date, 100), previous: first });
  const saved = [first, second].map(p => JSON.stringify(p)), before = JSON.stringify(saved);
  const calls: Array<{ sql: string; params: any[] }> = [];
  const conn = { execute: vi.fn(async (sql: string, params: any[]) => {
    calls.push({ sql, params }); if (!sql.startsWith('SELECT')) throw new Error('禁止DB写入');
    if (sql.includes('FROM ledger_user_tag_downside_overrides')) {
      expect(sql.replace(/\s+/g, ' ').trim()).toBe("SELECT ledger_id,category_id,target_user_id,actor_user_id,version,mode, DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created_at FROM ledger_user_tag_downside_overrides WHERE ledger_id=? ORDER BY target_user_id,category_id,version");
      expect(params).toEqual([37]);
      return [[]];
    }
    if (sql.includes('MIN(e.settlement_effective_date)')) return [[{ activation_date: '2026-11-24' }]];
    if (sql.includes('MIN(activation_date)')) return [[{ ledger_id: 37, category_id: categoryId, policy_version: CRYPTO_PORTFOLIO_POLICY_VERSION,
      activation_date: '2026-11-24', snapshot_date: '2026-11-24' }]];
    if (sql.startsWith('SELECT payload FROM ledger_crypto')) return [saved.map(payload => ({ payload }))];
    if (sql.includes('FROM ledger_stock_lot_downside_rules')) return [[{ ledger_id: 37, category_id: categoryId, lot_id: 1, user_id: 28,
      version, enabled: 1, threshold_price: 200, downside_percent: ratio, start_date: date, effective_at: `${date}T00:00:00+08:00`,
      baseline_raw_price: 200, baseline_counted_price: 200, currency: 'USDT', created_at: '2026-11-25T20:00:00+08:00' }]];
    if (sql.includes('FROM ledger_stock_lots l INNER JOIN ledger_stock_events e')) return [[{ id: 1, symbol, initial_quantity: 2, unit_cost: 200,
      opening_fee: null, actual_traded_at: '2026-11-24 08:00:00', registered_at: '2026-11-24 08:01:00', effective_date: '2026-11-24' }]];
    if (sql.includes('FROM ledger_stock_lot_participations p INNER JOIN')) return [data(date, 100).participations.map(p => ({ id: p.id, lot_id: 1,
      user_id: p.userId, allocated_quantity: 1, remaining_quantity: 1, entry_price: 200, start_date: '2026-11-24', pause_date: null,
      assigned_at: '2026-11-24 08:02:00', updated_at: '2026-11-24 08:02:00' }))];
    if (sql.includes('SELECT p.id FROM ledger_stock_lot_participations')) return [[]];
    if (/FROM ledger_stock_(lot_downside_sales|lot_downside_member_epochs|event_lot_allocations|participation_closures|lot_observations|unified_close_prices)/.test(sql)) return [[]];
    throw new Error(`unexpected SQL ${sql}`);
  }) };
  return { conn, calls, saved, before, revise: () => { version++; ratio = 30; } };
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe('retrodate real read path via SELECT-only mock', () => {
  it('admin gets newderived total, member only own rederived row with no owner config, original payload unchanged', async () => {
    const s = db(), now = new Date(`${date}T22:00:00+08:00`);
    const total = await readCryptoPortfolioCalendar(categoryId, undefined, now, s.conn);
    const member = await readCryptoPortfolioCalendar(categoryId, 28, now, s.conn);
    expect(total[0].nativePnl.USDT).toBe(-40); expect(member[0].nativePnl.USDT).toBe(20);
    expect(member[0].downsideRuleAudit).toBeUndefined(); expect(JSON.stringify(member)).not.toContain('thresholdPrice');
    expect(await readCryptoPortfolioCalendar(categoryId, 99, now, s.conn)).toEqual([]);
    expect(JSON.stringify(s.saved)).toBe(s.before); expect(s.calls.every(c => c.sql.startsWith('SELECT'))).toBe(true);
    expect(s.calls.filter(c => c.sql.startsWith('SELECT l.id,l.symbol')).length).toBe(1);
    expect(m.network).not.toHaveBeenCalled();
  });
  it('concurrent member reads share one history/rawpayload batch; next ruleversion invalidates immediately', async () => {
    const s = db(), now = new Date(`${date}T22:00:00+08:00`);
    await Promise.all([28, 29, undefined].map(id => readCryptoPortfolioCalendar(categoryId, id, now, s.conn)));
    expect(s.calls.filter(c => c.sql.startsWith('SELECT payload FROM ledger_crypto'))).toHaveLength(1);
    expect(s.calls.filter(c => c.sql.startsWith('SELECT l.id,l.symbol'))).toHaveLength(1);
    s.revise(); const changed = await readCryptoPortfolioCalendar(categoryId, 28, now, s.conn);
    expect(changed[0].nativePnl.USDT).toBe(30);
    expect(s.calls.filter(c => c.sql.startsWith('SELECT payload FROM ledger_crypto'))).toHaveLength(2);
  });
  it('cache output cannot be mutated by earlier caller, and 15:05 cutoff never returns early future row', async () => {
    const s = db(), now = new Date(`${date}T22:00:00+08:00`);
    const a = await readCryptoPortfolioCalendar(categoryId, 28, now, s.conn); a[0].totalPnl = 999;
    expect((await readCryptoPortfolioCalendar(categoryId, 28, now, s.conn))[0].totalPnl).toBe(140);
    const early = await readCryptoPortfolioCalendar(categoryId, 28, new Date(`${date}T15:04:59+08:00`), s.conn);
    expect(early[0]).toMatchObject({ ready: false, dailyPnlReason: 'awaiting_1505_close' });
  });
});
