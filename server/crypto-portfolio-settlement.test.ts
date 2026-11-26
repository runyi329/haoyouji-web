import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cryptoPortfolioCutoffAt, getCryptoPortfolioEffectiveDate, getCryptoPortfolioTradeSettlementDate, CRYPTO_PORTFOLIO_POLICY_VERSION } from '../shared/crypto-portfolio-policy';
import { buildCryptoPortfolioDailyPayload, cryptoPortfolioStockAnchor, isCryptoCalendarCloseQuote, type CryptoCalendarInput } from './shared/crypto-portfolio-calendar';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE, USDT_USD_PARITY_RATE } from '../shared/usdt-usd-parity-policy';

const mocks = vi.hoisted(() => ({ conn: null as any, crypto: vi.fn(), live: vi.fn(), fx: vi.fn(), stock: vi.fn(), usd: vi.fn(), dirty: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: vi.fn(async () => mocks.conn), getDbTransactionConnection: vi.fn(async () => mocks.conn) }));
vi.mock('./crypto-portfolio-quotes', () => ({ fetchCryptoPortfolioCloseQuotes: mocks.crypto, fetchCryptoPortfolioQuotes: mocks.live }));
vi.mock('./crypto-portfolio-fx', () => ({ fetchCryptoUsdtCnyAtClose: mocks.fx }));
vi.mock('./stock-usd-cny-rate', () => ({ fetchStockUsdCnyAtClose: mocks.usd }));
vi.mock('./stock-unified-close-quotes', async importOriginal => ({ ...(await importOriginal<any>()), fetchOvernightUnifiedCloseQuotes: mocks.stock }));
vi.mock('./stock-calendar-result-cache', () => ({ decodeStockCalendarResult: (value: string) => JSON.parse(value), markStockCalendarResultDirty: mocks.dirty }));
import { publishCryptoPortfolioSnapshots, readCryptoPortfolioCalendar, refreshCryptoPortfolioIntradaySnapshots, getCryptoPortfolioActivationDate } from './crypto-portfolio-settlement';

const date = '2026-11-14', symbol = 'CRYPTO:BTC-USDT';
const fx = (d = date, rate = 7.19) => {
  const anchor = cryptoPortfolioStockAnchor(d)!.A;
  return { snapshotDate: d, usdtCnyRate: rate, pair: 'USDT/CNY' as const,
    source: `bridge_coinbase_usdt_usd_spot_close_1505_x_yahoo_usdcny_5m${anchor !== d ? `_carried_A_anchor_${anchor}` : ''}`,
    asOf: `${anchor}T15:04:00+08:00`, lockedAt: `${d}T15:05:00+08:00`, carried: anchor !== d, forexSnapshotDate: anchor,
    usdCnyRate: rate / 0.999355, usdCnyAsOf: `${anchor}T15:04:00+08:00`, usdCnySource: 'yahoo_usdcny_5m',
    usdtUsdRate: 0.999355, usdtUsdAsOf: `${d}T15:05:00+08:00`, usdtUsdSource: 'coinbase_usdt_usd_spot_close_1505',
    observedAt: `${d}T15:05:04+08:00` };
};
const policyFx = (d = date, rate = 7.19) => {
  const point = fx(d, rate);
  return { ...point, conversionPolicy: USDT_USD_PARITY_POLICY,
    source: `${USDT_USD_PARITY_SOURCE}_x_${point.usdCnySource}${point.carried ? `_carried_A_anchor_${point.forexSnapshotDate}` : ''}`,
    usdCnyRate: rate, usdtUsdRate: USDT_USD_PARITY_RATE, usdtUsdSource: USDT_USD_PARITY_SOURCE };
};
const cryptoQuote = (d = date, price = 110, source = 'crypto_close_gate_1505') => ({ symbol, price, currency: 'USDT' as const,
  priceDate: d, source, updatedAt: `${d}T15:05:03+08:00`, cutoffAt: `${d}T15:05:00+08:00` });
function input(): CryptoCalendarInput {
  return { categoryId: 81, snapshotDate: date, activationDate: date, now: new Date(`${date}T15:06:00+08:00`),
    lots: [{ id: 1, symbol, initialQuantity: 2, unitCost: 100, openingFee: 0.2, openedDate: date,
      actualTradedAt: `${date}T14:59:00+08:00`, registeredAt: `${date}T15:00:00+08:00` }], sales: [], closures: [],
    participations: [{ id: 11, lotId: 1, userId: 28, allocatedQuantity: 1, remainingQuantity: 1, entryPrice: 100,
      startDate: date, pauseDate: null, assignedAt: `${date}T15:00:00+08:00`, updatedAt: `${date}T15:00:00+08:00` }],
    quotes: [cryptoQuote()], usdtFx: fx(), usdFx: null };
}
function fakeDb(categories = [81]) {
  const saved = new Map<string, string>(), staged = new Map<string, string>(), sqls: Array<{ sql: string; params: any[] }> = [];
  let failInsert = false, failCommit = false, futureSale = false, altered = false;
  const conn: any = {
    beginTransaction: vi.fn(async () => { staged.clear(); }),
    commit: vi.fn(async () => { if (failCommit) throw new Error('commit failure'); for (const [key, p] of staged) saved.set(key, p); staged.clear(); }),
    rollback: vi.fn(async () => { staged.clear(); }), release: vi.fn(),
    execute: vi.fn(async (sql: string, params: any[] = []) => {
      sqls.push({ sql, params });
      if (sql.startsWith('CREATE TABLE')) return [{ affectedRows: 0 }];
      if (sql.includes('FROM ledger_user_tag_downside_overrides')) {
        expect(sql.replace(/\s+/g, ' ').trim()).toBe("SELECT ledger_id,category_id,target_user_id,actor_user_id,version,mode, DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created_at FROM ledger_user_tag_downside_overrides WHERE ledger_id=? ORDER BY target_user_id,category_id,version");
        expect(params).toEqual([37]);
        return [[]];
      }
      if (sql.includes('FROM ledger_stock_lot_downside_rules')) return [[]];
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('SELECT DISTINCT category.id')) return [categories.filter(id => params.length === 2 || id === params[2]).map(id => ({ id }))];
      if (sql.includes('MIN(e.settlement_effective_date)')) return [[{ activation_date: categories.includes(params[1]) ? date : null }]];
      if (sql.includes('MIN(activation_date)')) {
        const dates = [...saved.keys()].filter(k => k.startsWith(`${params[1]}:`)).map(k => k.slice(k.indexOf(':') + 1)).sort();
        return [dates.length ? [{ ledger_id: 37, category_id: params[1], policy_version: CRYPTO_PORTFOLIO_POLICY_VERSION,
          activation_date: date, snapshot_date: dates[0] }] : []];
      }
      if (sql.startsWith('SELECT payload FROM ledger_crypto')) {
        if (sql.includes('snapshot_date=?')) {
          const key = `${params[1]}:${params[2]}`, value = saved.get(key) ?? staged.get(key); return [value ? [{ payload: value }] : []];
        }
        return [[...saved.entries()].filter(([key]) => key.startsWith(`${params[1]}:`)).map(([, payload]) => ({ payload }))];
      }
      if (sql.includes('FROM ledger_stock_lots l INNER JOIN ledger_stock_events e')) return [[{
        id: 1, symbol, initial_quantity: 2, unit_cost: altered ? 999 : 100, opening_fee: 0.2,
        actual_traded_at: `${date} 14:59:00`, registered_at: `${date} 15:00:00`, effective_date: date }]];
      if (sql.includes('FROM ledger_stock_event_lot_allocations a INNER JOIN ledger_stock_events e')) return [futureSale ? [{
        lot_id: 1, symbol, quantity: 1, execution_price: 120, event_quantity: 1, transaction_fee: 0.12,
        actual_traded_at: `${date} 16:00:00`, registered_at: `${date} 16:00:01`, effective_date: '2026-11-15' }] : []];
      if (sql.includes('FROM ledger_stock_lot_participations p INNER JOIN')) return [[{
        id: 11, lot_id: 1, user_id: 28, allocated_quantity: 1, remaining_quantity: futureSale ? 0 : 1,
        entry_price: altered ? 888 : 100, start_date: date, pause_date: null,
        assigned_at: `${date} 15:00:00`, updated_at: `${date} 15:00:00` }]];
      if (sql.includes('FROM ledger_stock_participation_closures c')) return [futureSale ? [{
        participation_id: 11, symbol, quantity: 1, sale_price: 120, actual_traded_at: `${date} 16:00:00`, registered_at: `${date} 16:00:01`, effective_date: '2026-11-15' }] : []];
      if (sql.includes('FROM ledger_stock_lot_observations')) return [[]];
      if (sql.includes('FROM ledger_stock_unified_close_prices') || sql.includes('FROM ledger_stock_unified_close_fx') || sql.includes('FROM ledger_stock_calendar_results')) return [[]];
      if (sql.startsWith('INSERT IGNORE INTO ledger_crypto')) {
        if (failInsert) throw new Error('simulated insert failure');
        const key = `${params[1]}:${params[2]}`; if (saved.has(key)) return [{ affectedRows: 0 }]; staged.set(key, params[5]); return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT p.id FROM ledger_stock_lot_participations')) return [params[2] === 28 ? [{ id: 11 }] : []];
      if (sql.includes('SELECT l.category_id,l.symbol,l.initial_quantity')) return [categories.map(category_id => ({ category_id, symbol, initial_quantity: 1e-8, sold_quantity: 0 }))];
      if (sql.startsWith('INSERT INTO ledger_stock_intraday_quotes')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected mock SQL: ${sql}`);
    }),
  };
  return { conn, saved, sqls, setFailInsert: () => { failInsert = true; }, setFailCommit: () => { failCommit = true; },
    setFutureSale: () => { futureSale = true; }, alter: () => { altered = true; } };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T15:06:00+08:00`));
  vi.clearAllMocks(); mocks.conn = fakeDb().conn;
  mocks.crypto.mockImplementation(async (symbols: string[], d: string) => Object.fromEntries(symbols.map(s => [s, { ...cryptoQuote(d), symbol: s }])));
  mocks.fx.mockImplementation(async (d: string) => fx(d)); mocks.stock.mockResolvedValue({}); mocks.usd.mockResolvedValue(null);
  mocks.live.mockResolvedValue({}); mocks.dirty.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('crypto natural-day pure reconstruction', () => {
  it('3e-8减2e-8剩余一量子不能被浮点误差丢弃，缺价不得固定成ready零市值', () => {
    const data = input(); data.lots[0].initialQuantity = 3e-8; data.lots[0].openingFee = 0;
    data.participations[0].allocatedQuantity = 3e-8; data.participations[0].remainingQuantity = 1e-8;
    data.sales = [{ lotId: 1, quantity: 2e-8, salePrice: 100, eventQuantity: 2e-8, transactionFee: null, closeDate: date }];
    data.closures = [{ participationId: 11, quantity: 2e-8, salePrice: 100, closeDate: date }]; data.quotes = [];
    const pending = buildCryptoPortfolioDailyPayload(data);
    for (const row of [pending.total, pending.members['28']]) expect(row).toMatchObject({ ready: false, positionCount: 1, marketValue: null, missingSymbols: [symbol] });
    data.quotes = [cryptoQuote()]; const ready = buildCryptoPortfolioDailyPayload(data);
    for (const row of [ready.total, ready.members['28']]) { expect(row.ready).toBe(true); expect(row.positionCount).toBe(1); expect(row.marketValue).toBeCloseTo(1e-8 * 110 * 7.19, 14); }
  });

  it('Saturday and Sunday keep Friday A + Thursday US; crypto gets its actual natural day', () => {
    expect(cryptoPortfolioStockAnchor(date)).toEqual({ A: '2026-11-13', US: '2026-11-12', CRYPTO: date });
    expect(cryptoPortfolioStockAnchor('2026-11-15')).toEqual({ A: '2026-11-13', US: '2026-11-12', CRYPTO: '2026-11-15' });
  });
  it('15:04:59 qualifies today, exactly 15:05 / after qualify next natural day, max registration preserved', () => {
    expect(getCryptoPortfolioTradeSettlementDate(`${date} 15:04:59`)).toBe(date);
    expect(getCryptoPortfolioTradeSettlementDate(`${date} 15:05:00`)).toBe('2026-11-15');
    expect(getCryptoPortfolioTradeSettlementDate(`${date} 18:30:00`)).toBe('2026-11-15');
    expect(getCryptoPortfolioEffectiveDate('2026-11-12 12:00:00', `${date} 15:05:01`)).toBe('2026-11-15');
    expect(() => buildCryptoPortfolioDailyPayload({ ...input(), now: new Date(`${date}T15:04:59+08:00`) })).toThrow('not_due');
  });
  it('accepts only exact historical Gate/HTX completed minute evidence, not scanner/current prices', () => {
    expect(isCryptoCalendarCloseQuote(cryptoQuote(), date)).toBe(true);
    expect(isCryptoCalendarCloseQuote(cryptoQuote(date, 110, 'crypto_close_htx_1505'), date)).toBe(true);
    expect(isCryptoCalendarCloseQuote(cryptoQuote(date, 110, 'Gate.io'), date)).toBe(false);
    expect(isCryptoCalendarCloseQuote({ ...cryptoQuote(), cutoffAt: `${date}T15:04:00+08:00` }, date)).toBe(false);
    expect(isCryptoCalendarCloseQuote(cryptoQuote('2026-11-13'), date)).toBe(false);
  });
  it('USDT has separate native pnl and real FX; never assumes USD=CNY=USDT', () => {
    const payload = buildCryptoPortfolioDailyPayload(input());
    expect(payload.total.nativePnl.USDT).toBe(20);
    expect(payload.members['28'].nativePnl.USDT).toBe(-10);
    expect(payload.total.totalPnl).toBeCloseTo(143.8);
    expect(payload.members['28'].totalPnl).toBeCloseTo(-71.9);
    expect(payload.total.usdCnyRate).toBeNull(); expect(payload.total.usdtCnyRate).toBe(7.19);
    expect(payload.total.dailyPnl).toBeNull(); expect(payload.total.dailyPnlReason).toContain('baseline');
    const missing = buildCryptoPortfolioDailyPayload({ ...input(), usdtFx: null });
    expect(missing.total.ready).toBe(false); expect(missing.total.totalPnl).toBeNull();
  });
  it('accepts truthful weekend older forex evidence but rejects false same-day/missing bridge legs', () => {
    const data = input(); expect(buildCryptoPortfolioDailyPayload(data).total.ready).toBe(true);
    expect(data.usdtFx!.asOf).toContain('2026-11-13');
    const falseFx = { ...fx(), forexSnapshotDate: date, usdCnyAsOf: `${date}T15:04:00+08:00`, carried: false };
    expect(buildCryptoPortfolioDailyPayload({ ...data, usdtFx: falseFx }).total.ready).toBe(false);
    expect(buildCryptoPortfolioDailyPayload({ ...data, usdtFx: { ...fx(), usdtUsdRate: undefined } }).total.ready).toBe(false);
    expect(buildCryptoPortfolioDailyPayload({ ...data, usdtFx: { ...fx(), usdtCnyRate: 7.2 } }).total.ready).toBe(false);
  });
  it('complete authorized parity evidence makes total/member/observation ready; policy version and native units stay unchanged', () => {
    const data = input(); data.usdtFx = policyFx();
    data.observations = [{ lotId: 1, userId: 99, quantity: 3, entryPrice: 100, startDate: date,
      pauseDate: null, assignedAt: `${date}T15:00:00+08:00`, updatedAt: `${date}T15:00:00+08:00` }];
    const before = JSON.stringify(data.usdtFx), payload = buildCryptoPortfolioDailyPayload(data);
    expect(payload.policyVersion).toBe(CRYPTO_PORTFOLIO_POLICY_VERSION);
    for (const row of [payload.total, payload.members['28'], payload.observations['99']]) {
      expect(row).toMatchObject({ ready: true, usdtCnyRate: 7.19, fxAsOf: '2026-11-13T15:04:00+08:00' });
    }
    expect(payload.total.totalPnl).toBeCloseTo(20 * 7.19);
    expect(payload.members['28'].totalPnl).toBeCloseTo(-10 * 7.19);
    expect(payload.observations['99'].totalPnl).toBeCloseTo(-30 * 7.19);
    expect(payload.fx.usdt).toMatchObject({ conversionPolicy: USDT_USD_PARITY_POLICY, usdtUsdRate: 1,
      usdtUsdSource: USDT_USD_PARITY_SOURCE, usdtUsdAsOf: `${date}T15:05:00+08:00`,
      usdCnySource: 'yahoo_usdcny_5m', forexSnapshotDate: '2026-11-13', carried: true });
    expect(JSON.stringify(data.usdtFx)).toBe(before);
  });
  it.each([
    ['missing policy', { conversionPolicy: undefined }], ['wrong policy', { conversionPolicy: 'unapproved' }],
    ['missing policy source', { usdtUsdSource: undefined }], ['market source with policy', { usdtUsdSource: 'coinbase_usdt_usd_spot_close_1505' }],
    ['wrong policy rate', { usdtUsdRate: 0.999355 }], ['missing policy rate', { usdtUsdRate: undefined }],
    ['wrong composite source', { source: 'bridge_coinbase_usdt_usd_spot_close_1505_x_yahoo_usdcny_5m' }],
    ['missing composite source', { source: '' }], ['policy time is not cutoff', { usdtUsdAsOf: `${date}T15:04:59+08:00` }],
    ['future policy time', { usdtUsdAsOf: `${date}T15:05:01+08:00` }], ['missing policy time', { usdtUsdAsOf: undefined }],
    ['missing USD rate', { usdCnyRate: undefined }], ['invalid USD rate', { usdCnyRate: 0 }],
    ['missing USD source', { usdCnySource: undefined }], ['invalid USD source', { usdCnySource: 'invented' }],
    ['missing USD time', { usdCnyAsOf: undefined }], ['future USD time', { usdCnyAsOf: '2026-11-15T15:04:00+08:00' }],
    ['after anchor USD time', { usdCnyAsOf: '2026-11-13T15:05:01+08:00' }], ['old USD time', { usdCnyAsOf: '2026-11-13T14:34:59+08:00' }],
    ['false weekend anchor', { forexSnapshotDate: date }], ['missing anchor', { forexSnapshotDate: undefined }],
    ['false carried', { carried: false }], ['missing carried', { carried: undefined }],
    ['wrong product', { usdtCnyRate: 7.2 }], ['false newer asOf', { asOf: `${date}T15:05:00+08:00` }],
    ['future observation', { observedAt: `${date}T15:06:01+08:00` }], ['pre-cutoff observation', { observedAt: `${date}T15:04:59+08:00` }],
    ['missing observation', { observedAt: undefined }], ['wrong lock', { lockedAt: `${date}T15:05:01+08:00` }],
  ])('policy %s cannot be ready merely because one rate is 1', (_name, patch) => {
    const payload = buildCryptoPortfolioDailyPayload({ ...input(), usdtFx: { ...policyFx(), ...patch } });
    for (const row of [payload.total, payload.members['28']]) expect(row).toMatchObject({ ready: false, totalPnl: null, dailyPnlReason: 'missing_historical_fx' });
  });
  it('bare 1 and incomplete legacy-looking policy claims are not evidence; authentic legacy market legs remain readable', () => {
    const data = input(), legacy = fx();
    expect(buildCryptoPortfolioDailyPayload({ ...data, usdtFx: legacy }).total.ready).toBe(true);
    expect(buildCryptoPortfolioDailyPayload({ ...data, usdtFx: { ...legacy, usdtUsdRate: 1 } }).total.ready).toBe(false);
    expect(buildCryptoPortfolioDailyPayload({ ...data, usdtFx: { ...legacy, conversionPolicy: 'unapproved' } }).total.ready).toBe(false);
    expect(buildCryptoPortfolioDailyPayload({ ...data, usdtFx: { ...policyFx(), usdCnyRate: undefined, usdtUsdRate: 1 } }).total.ready).toBe(false);
    expect(buildCryptoPortfolioDailyPayload({ ...data, usdtFx: null }).total.ready).toBe(false);
  });
  it('A-day policy requires today USD anchor; Friday carry cannot masquerade as Monday close', () => {
    const monday = '2026-11-16', data = { ...input(), snapshotDate: monday, now: new Date(`${monday}T15:06:00+08:00`),
      quotes: [cryptoQuote(monday)], usdtFx: policyFx(monday) };
    expect(buildCryptoPortfolioDailyPayload(data).total.ready).toBe(true);
    expect(buildCryptoPortfolioDailyPayload({ ...data, usdtFx: { ...policyFx(monday), carried: true, forexSnapshotDate: '2026-11-13',
      usdCnyAsOf: '2026-11-13T15:04:00+08:00', asOf: '2026-11-13T15:04:00+08:00',
      source: `${USDT_USD_PARITY_SOURCE}_x_yahoo_usdcny_5m_carried_A_anchor_2026-11-13` } }).total.ready).toBe(false);
  });
  it('policy transition uses the frozen legacy previous PnL, does not revalue/rewrite it', () => {
    const data = input(), legacy = buildCryptoPortfolioDailyPayload(data), frozen = JSON.stringify(legacy);
    const nextDate = '2026-11-15';
    const next = buildCryptoPortfolioDailyPayload({ ...data, snapshotDate: nextDate, now: new Date(`${nextDate}T15:06:00+08:00`),
      quotes: [cryptoQuote(nextDate, 115)], usdtFx: policyFx(nextDate, 7.2), previous: legacy });
    expect(next.total).toMatchObject({ ready: true, dailyPnlReady: true });
    expect(next.total.dailyPnl).toBeCloseTo(30 * 7.2 - legacy.total.totalPnl!);
    expect(next.members['28'].dailyPnl).toBeCloseTo(-15 * 7.2 - legacy.members['28'].totalPnl!);
    expect(JSON.stringify(legacy)).toBe(frozen);
  });
  it('approved FX policy does not waive post-cutoff allocation/quantity guards or missing UNI close', () => {
    const data = input(); data.usdtFx = policyFx();
    expect(() => buildCryptoPortfolioDailyPayload({ ...data, participations: data.participations.map(p => ({ ...p, updatedAt: `${date}T15:05:00+08:00` })) })).toThrow('unverifiable_allocation_history');
    expect(() => buildCryptoPortfolioDailyPayload({ ...data, lots: data.lots.map(l => ({ ...l, initialQuantity: 1e-9 })) })).toThrow('invalid_trade_history');
    const uni = 'CRYPTO:UNI-USDT', today = '2026-11-21';
    const uniInput = { ...data, snapshotDate: today, activationDate: today, now: new Date(`${today}T17:00:00+08:00`),
      lots: [{ ...data.lots[0], symbol: uni, openedDate: today, actualTradedAt: `${today}T12:08:00+08:00`, registeredAt: `${today}T12:09:00+08:00` }],
      participations: [], quotes: [], usdtFx: policyFx(today, 6.6704) };
    expect(buildCryptoPortfolioDailyPayload(uniInput).total).toMatchObject({ ready: false, totalPnl: null, missingSymbols: [uni] });
    expect(buildCryptoPortfolioDailyPayload({ ...uniInput, quotes: [{ ...cryptoQuote(today, 4.3), symbol: uni }] }).total).toMatchObject({ ready: true, usdtCnyRate: 6.6704 });
  });
  it('restores quantities from original lot and effective closures, not current remaining', () => {
    const data = input(); data.sales = [{ lotId: 1, quantity: 1, salePrice: 120, transactionFee: 0.12, eventQuantity: 1, closeDate: '2026-11-15' }];
    data.participations = data.participations.map(p => ({ ...p, remainingQuantity: 0 }));
    data.closures = [{ participationId: 11, quantity: 1, salePrice: 120, closeDate: '2026-11-15' }];
    expect(buildCryptoPortfolioDailyPayload(data).members['28'].marketValue).toBeCloseTo(790.9);
    const first = buildCryptoPortfolioDailyPayload(data);
    const next = buildCryptoPortfolioDailyPayload({ ...data, snapshotDate: '2026-11-15', now: new Date('2026-11-15T15:06:00+08:00'),
      quotes: [cryptoQuote('2026-11-15', 115)], usdtFx: fx('2026-11-15'), previous: first });
    expect(next.total.realizedPnl).toBeCloseTo((20 - 0.12 - 0.1) * 7.19);
    expect(next.members['28'].realizedPnl).toBeCloseTo(-20 * 7.19);
    expect(next.total.dailyPnl).toBeCloseTo(next.total.totalPnl! - first.total.totalPnl!);
    expect(next.total.dailyPnl).not.toBeCloseTo(-120 * 7.19); // no principal flow as daily pnl
  });
  it('minimum 1e-8 is a real position and absent price is not frozen as zero', () => {
    const data = input(); data.lots = data.lots.map(l => ({ ...l, initialQuantity: 1e-8 })); data.participations = [];
    expect(buildCryptoPortfolioDailyPayload(data).total.positionCount).toBe(1);
    const missing = buildCryptoPortfolioDailyPayload({ ...data, quotes: [] });
    expect(missing.total.ready).toBe(false); expect(missing.total.totalPnl).toBeNull(); expect(missing.total.missingSymbols).toEqual([symbol]);
  });
  it('no crypto category never enters policy; old A/US symbol is not crypto', () => {
    const data = input(); data.lots = [{ ...data.lots[0], symbol: 'AAPL', openedDate: '2026-11-12' }];
    expect(() => buildCryptoPortfolioDailyPayload(data)).toThrow('no_effective_crypto_lots');
  });
  it('empty account continues only with matching persisted activation, evidence is not serialized or a fake lot', () => {
    const data = input(), previous = buildCryptoPortfolioDailyPayload(data);
    const persistedActivation = { ledgerId: 37 as const, categoryId: 81, policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION,
      activationDate: date, snapshotDate: date };
    expect(JSON.stringify(buildCryptoPortfolioDailyPayload({ ...data, persistedActivation }))).toBe(JSON.stringify(previous));
    const empty = { ...data, snapshotDate: '2026-11-15', now: new Date('2026-11-15T15:06:00+08:00'),
      lots: [], participations: [], observations: [], quotes: [], usdtFx: null, previous };
    expect(() => buildCryptoPortfolioDailyPayload(empty)).toThrow('no_effective_crypto_lots');
    const next = buildCryptoPortfolioDailyPayload({ ...empty, persistedActivation });
    expect(next.total).toMatchObject({ ready: true, positionCount: 0, marketValue: 0, totalPnl: 0, dailyPnlReady: true });
    expect(next.total.dailyPnl).toBeCloseTo(-previous.total.totalPnl!);
    expect(next.members).toEqual({}); expect(next.observations).toEqual({});
    expect(next).not.toHaveProperty('persistedActivation'); expect(empty.lots).toEqual([]);
    expect(() => buildCryptoPortfolioDailyPayload({ ...empty, persistedActivation: null, previous: null })).toThrow('no_effective_crypto_lots');
  });
  it.each([
    ['wrong ledger', { ledgerId: 38 }], ['wrong category', { categoryId: 82 }], ['wrong policy', { policyVersion: 'old-policy' }],
    ['invalid activation', { activationDate: '2026-02-30' }], ['mismatched activation', { activationDate: '2026-11-13' }],
    ['future activation', { activationDate: '2026-11-16' }], ['invalid proof day', { snapshotDate: '2026-02-30' }],
    ['proof before activation', { snapshotDate: '2026-11-13' }], ['future proof day', { snapshotDate: '2026-11-16' }],
    ['incomplete proof', { snapshotDate: undefined }],
  ])('rejects %s persisted evidence even when previous payload exists', (_name, patch) => {
    const data = input(), previous = buildCryptoPortfolioDailyPayload(data);
    const persistedActivation = { ledgerId: 37, categoryId: 81, policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION,
      activationDate: date, snapshotDate: date, ...patch } as NonNullable<CryptoCalendarInput['persistedActivation']>;
    expect(() => buildCryptoPortfolioDailyPayload({ ...data, snapshotDate: '2026-11-15', now: new Date('2026-11-15T15:06:00+08:00'),
      lots: [], participations: [], quotes: [], usdtFx: null, previous, persistedActivation })).toThrow('invalid_persisted_crypto_activation');
  });
  it('persisted securities-only natural days preserve total/member/observation scopes and verified stock requirements', () => {
    const data = input();
    data.persistedActivation = { ledgerId: 37, categoryId: 81, policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION, activationDate: date, snapshotDate: date };
    data.lots = [{ id: 2, symbol: '600519.SH', initialQuantity: 2, unitCost: 100, openingFee: 0, openedDate: '2026-11-13' }];
    data.participations = [{ ...data.participations[0], lotId: 2, startDate: '2026-11-13',
      assignedAt: '2026-11-13T12:00:00+08:00', updatedAt: '2026-11-13T12:00:00+08:00' }];
    data.observations = [{ lotId: 2, userId: 99, quantity: 3, entryPrice: 100, startDate: '2026-11-13', pauseDate: null,
      assignedAt: '2026-11-13T12:00:00+08:00', updatedAt: '2026-11-13T12:00:00+08:00' }];
    data.quotes = [{ symbol: '600519.SH', price: 110, currency: 'CNY', priceDate: '2026-11-13',
      source: 'unified_close_tushare', updatedAt: '2026-11-13T15:01:00+08:00' }]; data.usdtFx = null;
    const previous = buildCryptoPortfolioDailyPayload(data);
    const next = buildCryptoPortfolioDailyPayload({ ...data, snapshotDate: '2026-11-15', now: new Date('2026-11-15T15:06:00+08:00'), previous });
    expect(next.total).toMatchObject({ scope: 'tag-total', ready: true, totalPnl: 20, dailyPnl: 0, positionCount: 1 });
    expect(next.members['28']).toMatchObject({ ready: true, totalPnl: -10, dailyPnl: 0 });
    expect(next.observations['99']).toMatchObject({ ready: true, totalPnl: -30, dailyPnl: 0 });
    expect(next.members['99']).toBeUndefined(); expect(next.observations['28']).toBeUndefined();
    expect(next.total.sourceDates).toEqual({ A: '2026-11-13', US: '2026-11-12', CRYPTO: '2026-11-15' });
    expect(buildCryptoPortfolioDailyPayload({ ...data, quotes: [] }).total).toMatchObject({ ready: false, totalPnl: null, missingSymbols: ['600519.SH'] });
    expect(() => buildCryptoPortfolioDailyPayload({ ...data, lots: [{ ...data.lots[0], initialQuantity: 0 }] })).toThrow('invalid_trade_history');
    expect(() => buildCryptoPortfolioDailyPayload({ ...data, participations: [{ ...data.participations[0], updatedAt: `${date}T15:05:00+08:00` }] })).toThrow('unverifiable_allocation_history');
    expect(() => buildCryptoPortfolioDailyPayload({ ...data, observations: [{ ...data.observations[0], updatedAt: `${date}T15:05:00+08:00` }] })).toThrow('unverifiable_observation_history');
    expect(() => buildCryptoPortfolioDailyPayload({ ...data, persistedActivation: null })).toThrow('no_effective_crypto_lots');
  });
  it('mixed weekend stock price/holdings keep A-anchor and strictly prior US with independent FX legs', () => {
    const data = input(); data.participations = [];
    data.lots = [...data.lots, { id: 2, symbol: 'AAPL', initialQuantity: 1, unitCost: 200, openingFee: 0.2, openedDate: '2026-11-12' },
      { id: 3, symbol: '600519.SH', initialQuantity: 1, unitCost: 1000, openingFee: 1, openedDate: '2026-11-13' },
      { id: 4, symbol: 'AAPL', initialQuantity: 2, unitCost: 300, openingFee: 0.6, openedDate: '2026-11-13' }];
    data.quotes = [...data.quotes, { symbol: 'AAPL', price: 210, currency: 'USD', priceDate: '2026-11-12', source: 'unified_close_yahoo', updatedAt: '2026-11-13T05:00:00+08:00' },
      { symbol: 'AAPL', price: 310, currency: 'USD', priceDate: '2026-11-13', source: 'unified_close_yahoo', updatedAt: '2026-11-14T05:00:00+08:00' },
      { symbol: '600519.SH', price: 1050, currency: 'CNY', priceDate: '2026-11-13', source: 'unified_close_tushare', updatedAt: '2026-11-13T15:01:00+08:00' }];
    data.usdFx = { snapshotDate: '2026-11-13', usdCnyRate: 7.2, pair: 'USD/CNY', source: 'yahoo_usdcny_5m', asOf: '2026-11-13T15:04:00+08:00', lockedAt: '2026-11-13T15:05:00+08:00' };
    const payload = buildCryptoPortfolioDailyPayload(data);
    expect(payload.total.totalPnl).toBeCloseTo(20 * 7.19 + 10 * 7.2 + 50);
    expect(payload.total.nativePnl).toEqual({ CNY: 50, USD: 10, USDT: 20 });
    expect(payload.total.quoteAsOf.find(q => q.symbol === 'AAPL')?.priceDate).toBe('2026-11-12');
    expect(payload.total.positionCount).toBe(3); // Friday-night US lot not included on Saturday
  });
  it('pause freezes at its own day and ignores subsequent sales instead of using current remainder', () => {
    const data = input(); data.lots = data.lots.map(l => ({ ...l, openedDate: '2026-11-13', actualTradedAt: null, registeredAt: null }));
    data.participations = data.participations.map(p => ({ ...p, remainingQuantity: 0, startDate: '2026-11-13', pauseDate: '2026-11-13', assignedAt: '2026-11-13T12:00:00+08:00', updatedAt: '2026-11-13T12:00:00+08:00' }));
    data.sales = [{ lotId: 1, quantity: 1, salePrice: 120, eventQuantity: 1, transactionFee: 0.12, closeDate: date }];
    data.closures = [{ participationId: 11, quantity: 1, salePrice: 120, closeDate: date }];
    data.quotes = [cryptoQuote('2026-11-13', 105), cryptoQuote(date, 110, 'crypto_close_htx_1505')];
    const payload = buildCryptoPortfolioDailyPayload(data);
    expect(payload.members['28'].totalPnl).toBeCloseTo(-5 * 7.19); expect(payload.members['28'].realizedPnl).toBe(0);
    expect(payload.members['28'].quoteAsOf[0].priceDate).toBe('2026-11-13');
    expect(payload.quotes[1].source).toBe('crypto_close_htx_1505');
  });
  it('observation remains independent display-only short pnl, not actual member allocation', () => {
    const data = input(); data.observations = [{ lotId: 1, userId: 99, quantity: 3, entryPrice: 100, startDate: date,
      pauseDate: null, assignedAt: `${date}T15:00:00+08:00`, updatedAt: `${date}T15:00:00+08:00` }];
    const payload = buildCryptoPortfolioDailyPayload(data);
    expect(payload.observations['99'].totalPnl).toBeCloseTo(-30 * 7.19);
    expect(payload.members['99']).toBeUndefined(); expect(payload.total.totalPnl).toBeCloseTo(20 * 7.19);
  });
  it('unchanged historical stock total/member can baseline activation day without rewriting prior rows', () => {
    const data = input(), old = buildCryptoPortfolioDailyPayload(data).total;
    const baselineTotal = { ...old, snapshotDate: '2026-11-13', totalPnl: 50, nativePnl: { CNY: 50, USD: 0 } };
    const baselineMember = { ...baselineTotal, totalPnl: -25, nativePnl: { CNY: -25, USD: 0 } };
    const result = buildCryptoPortfolioDailyPayload({ ...data, baseline: { snapshotDate: '2026-11-13', total: baselineTotal, members: { '28': baselineMember } } });
    expect(result.total.dailyPnlReady).toBe(true); expect(result.total.dailyPnl).toBeCloseTo(143.8 - 50);
    expect(result.members['28'].dailyPnl).toBeCloseTo(-71.9 + 25); expect(baselineTotal.totalPnl).toBe(50);
  });
  it('post-cutoff mutable configuration cannot backfill a reliable historical allocation', () => {
    const data = input(); data.participations = data.participations.map(p => ({ ...p, updatedAt: `${date}T15:05:00+08:00` }));
    expect(() => buildCryptoPortfolioDailyPayload(data)).toThrow('unverifiable_allocation_history');
  });
});

describe('real settlement exports with mock SQL/network', () => {
  it('stock-only category enumeration never requests crypto prices or publishes under this policy', async () => {
    const db = fakeDb([]); mocks.conn = db.conn;
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date })).toMatchObject({ categories: 0, published: 0 });
    expect(mocks.crypto).not.toHaveBeenCalled(); expect(mocks.fx).not.toHaveBeenCalled(); expect(mocks.dirty).not.toHaveBeenCalled();
  });
  it('named-lock competition skips before historical reads/quotes and leaves stored history untouched', async () => {
    const db = fakeDb(); const execute = db.conn.execute;
    db.conn.execute = vi.fn((sql: string, params: any[]) => sql.includes('GET_LOCK') ? Promise.resolve([[{ acquired: 0 }]]) : execute(sql, params));
    mocks.conn = db.conn;
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date })).toMatchObject({ published: 0, skipped: 1, failures: [{ reason: 'publication_busy', categoryId: 81, snapshotDate: date }] });
    expect(mocks.crypto).not.toHaveBeenCalled(); expect(db.conn.beginTransaction).not.toHaveBeenCalled(); expect(db.saved.size).toBe(0);
  });
  it('publishes weekends atomically with provenance, immutable payload and one dirty call', async () => {
    const db = fakeDb(); mocks.conn = db.conn;
    const first = await publishCryptoPortfolioSnapshots({ snapshotDate: date });
    expect(first).toMatchObject({ categories: 1, published: 1, skipped: 0 });
    expect(mocks.dirty).toHaveBeenCalledTimes(1); expect(db.conn.commit).toHaveBeenCalledTimes(1);
    const before = db.saved.get(`81:${date}`)!; expect(JSON.parse(before).policyVersion).toBe(CRYPTO_PORTFOLIO_POLICY_VERSION);
    db.alter(); mocks.crypto.mockResolvedValue({ [symbol]: cryptoQuote(date, 9999) }); mocks.fx.mockResolvedValue(fx(date, 99));
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date })).toMatchObject({ alreadyPublished: 1, published: 0 });
    expect(db.saved.get(`81:${date}`)).toBe(before); expect(mocks.crypto).toHaveBeenCalledTimes(1); expect(mocks.dirty).toHaveBeenCalledTimes(1);
    expect(db.sqls.some(q => q.sql.startsWith('INSERT IGNORE INTO ledger_crypto'))).toBe(true);
    expect(db.sqls.some(q => q.sql.includes('UPDATE ledger_stock_') || q.sql.includes('INSERT INTO ledger_stock_daily'))).toBe(false);
  });
  it('mock publisher does not overwrite legacy frozen snapshot after enabling policy; reads remain legacy SELECT-only', async () => {
    const db = fakeDb(); mocks.conn = db.conn;
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date })).toMatchObject({ published: 1 });
    const frozen = db.saved.get(`81:${date}`)!;
    expect(JSON.parse(frozen).fx.usdt.usdtUsdSource).toBe('coinbase_usdt_usd_spot_close_1505');
    mocks.fx.mockImplementation(async d => policyFx(d)); db.alter();
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date })).toMatchObject({ alreadyPublished: 1, published: 0 });
    expect(db.saved.get(`81:${date}`)).toBe(frozen); expect(mocks.fx).toHaveBeenCalledTimes(1);
    const start = db.sqls.length;
    const read = await readCryptoPortfolioCalendar(81, undefined, new Date(`${date}T15:06:00+08:00`));
    expect(read.find(row => row.snapshotDate === date)?.totalPnl).toBe(JSON.parse(frozen).total.totalPnl);
    expect(db.sqls.slice(start).every(q => q.sql.startsWith('SELECT'))).toBe(true);
  });
  it('mock publisher can freeze a new unpublished day with complete policy evidence, but cannot overwrite it later', async () => {
    const db = fakeDb(); mocks.conn = db.conn; mocks.fx.mockImplementation(async d => policyFx(d));
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date })).toMatchObject({ published: 1 });
    const frozen = db.saved.get(`81:${date}`)!;
    expect(JSON.parse(frozen)).toMatchObject({ policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION,
      total: { ready: true, usdtCnyRate: 7.19 }, fx: { usdt: { conversionPolicy: USDT_USD_PARITY_POLICY,
        usdtUsdSource: USDT_USD_PARITY_SOURCE, usdtUsdRate: 1 } } });
    mocks.fx.mockResolvedValue(policyFx(date, 99));
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date })).toMatchObject({ alreadyPublished: 1, published: 0 });
    expect(db.saved.get(`81:${date}`)).toBe(frozen); expect(mocks.fx).toHaveBeenCalledTimes(1);
  });
  it('before weekend cutoff does no DB/price publication and future date is bounded out', async () => {
    const db = fakeDb(); mocks.conn = db.conn; vi.setSystemTime(new Date(`${date}T15:04:59+08:00`));
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date })).toMatchObject({ categories: 0, published: 0 });
    expect(db.conn.execute).not.toHaveBeenCalled(); expect(mocks.crypto).not.toHaveBeenCalled();
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: '2099-01-01' })).toMatchObject({ published: 0 });
  });
  it('missing quote or FX does not publish a zero and transaction rolls back', async () => {
    const db = fakeDb(); mocks.conn = db.conn; mocks.crypto.mockResolvedValue({});
    const result = await publishCryptoPortfolioSnapshots({ snapshotDate: date });
    expect(result.skipped).toBe(1); expect(result.failures?.[0].missingSymbols).toEqual([symbol]);
    expect(db.saved.size).toBe(0); expect(db.conn.rollback).toHaveBeenCalled(); expect(mocks.dirty).not.toHaveBeenCalled();
    mocks.crypto.mockResolvedValue({ [symbol]: cryptoQuote() }); mocks.fx.mockResolvedValue(null);
    expect((await publishCryptoPortfolioSnapshots({ snapshotDate: date })).failures?.[0].reason).toBe('missing_historical_fx');
  });
  it('insert/commit/dirty failure rolls back, releases named lock/connection and never claims published', async () => {
    for (const fail of ['insert', 'commit', 'dirty']) {
      const db = fakeDb(); mocks.conn = db.conn;
      if (fail === 'insert') db.setFailInsert(); if (fail === 'commit') db.setFailCommit();
      if (fail === 'dirty') mocks.dirty.mockRejectedValueOnce(new Error('dirty failure'));
      expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date })).toMatchObject({ published: 0, skipped: 1 });
      expect(db.conn.rollback).toHaveBeenCalled(); expect(db.saved.size).toBe(0);
      expect(db.sqls.some(q => q.sql.includes('RELEASE_LOCK'))).toBe(true); expect(db.conn.release).toHaveBeenCalled();
    }
  });
  it('different category/user stays isolated, read is SELECT-only and not real-time revaluation', async () => {
    const db = fakeDb([81, 82]); mocks.conn = db.conn;
    await publishCryptoPortfolioSnapshots({ snapshotDate: date, categoryId: 81 });
    expect(db.saved.has(`82:${date}`)).toBe(false);
    const start = db.sqls.length, calls = mocks.crypto.mock.calls.length;
    const own = await readCryptoPortfolioCalendar(81, 28, new Date('2026-11-15T15:04:59+08:00'));
    expect(own[0].snapshotDate).toBe('2026-11-15'); expect(own[0].ready).toBe(false); expect(own[0].dailyPnlReason).toBe('awaiting_1505_close');
    expect(own[1].totalPnl).toBeCloseTo(-71.9);
    expect(await readCryptoPortfolioCalendar(81, 999)).toEqual([]);
    expect(await getCryptoPortfolioActivationDate(999)).toBeNull();
    expect(db.sqls.slice(start).every(q => q.sql.startsWith('SELECT'))).toBe(true); expect(mocks.crypto.mock.calls.length).toBe(calls);
  });
  it('restores fully sold live remainder when effective closure belongs next day', async () => {
    const db = fakeDb(); db.setFutureSale(); mocks.conn = db.conn;
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: date })).toMatchObject({ published: 1 });
    const payload = JSON.parse(db.saved.get(`81:${date}`)!);
    expect(payload.members['28'].marketValue).toBeCloseTo(110 * 7.19); expect(payload.total.realizedPnl).toBe(0);
  });
  it('crypto intraday quotes use only registered 37 lots, preserve minimum quantum and do not dirty or day-write', async () => {
    const db = fakeDb(); mocks.conn = db.conn;
    mocks.live.mockResolvedValue({ [symbol]: { ...cryptoQuote(), source: 'HTX', updatedAt: new Date().toISOString() } });
    expect(await refreshCryptoPortfolioIntradaySnapshots()).toEqual({ categories: 1, symbols: 1, updated: 1 });
    expect(mocks.live).toHaveBeenCalledWith([symbol]); expect(mocks.crypto).not.toHaveBeenCalled(); expect(mocks.fx).not.toHaveBeenCalled(); expect(mocks.dirty).not.toHaveBeenCalled();
    expect(db.sqls.filter(q => !q.sql.startsWith('SELECT') && !q.sql.startsWith('CREATE')).every(q => q.sql.startsWith('INSERT INTO ledger_stock_intraday_quotes'))).toBe(true);
  });
});
