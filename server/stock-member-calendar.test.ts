import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildMemberStockCalendar, isTrustedMemberCalendarClose, memberCalendarSettlementSummary, type MemberCalendarQuote } from './shared/stock-member-calendar';
const now = new Date('2026-11-10T16:00:00+08:00');
const a = { id: 1, symbol: '600000.SH', startDate: '2026-11-04', remainingQuantity: 100, entryPrice: 10 };
const us = { id: 2, symbol: 'AAOI', startDate: '2026-11-04', remainingQuantity: 2, entryPrice: 60 };
function quote(symbol: string, priceDate: string, price: number, source = 'unified_close_yahoo'): MemberCalendarQuote {
  return { symbol, priceDate, price, source, capturedAt: '2026-11-10T16:00:00+08:00' };
}
const quotes = [quote(a.symbol, '2026-11-05', 10, 'price_snapshot'), quote(a.symbol, '2026-11-06', 9, 'price_snapshot'),
  quote(a.symbol, '2026-11-09', 8, 'price_snapshot'), quote(a.symbol, '2026-11-10', 7, 'price_snapshot'),
  quote(us.symbol, '2026-11-04', 51), quote(us.symbol, '2026-11-05', 50), quote(us.symbol, '2026-11-06', 49), quote(us.symbol, '2026-11-09', 48)];
const fx = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'].map(snapshotDate => ({ snapshotDate, usdCnyRate: 6.7, source: 'yahoo_usdcny_5m', asOf: `${snapshotDate}T07:05:00.000Z`, lockedAt: `${snapshotDate}T07:05:00.000Z` }));
describe('37 member A-day / overnight-US calendar (offline)', () => {
  it('A 11/10 at 15:05 uses NY11/9, Friday uses US Thursday, no weekend snapshots', () => {
    const rows = buildMemberStockCalendar({ participations: [a, us], closures: [], quotes, fx, now });
    expect(rows.map(row => row.snapshotDate)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10']);
    const friday = rows.find(row => row.snapshotDate === '2026-11-06')!;
    const monday = rows.find(row => row.snapshotDate === '2026-11-09')!;
    const tuesday = rows.at(-1)!;
    expect(friday).toMatchObject({ ready: true, previousDate: '2026-11-05', fxAsOf: '2026-11-06T07:05:00.000Z' });
    expect(friday.dailyPnl).toBeCloseTo(113.4);
    expect(monday.dailyPnl).toBeCloseTo(113.4);
    expect(tuesday.dailyPnl).toBeCloseTo(113.4);
    expect(tuesday.sourceDates).toEqual({ A: '2026-11-10', US: '2026-11-09' });
    expect(tuesday.quoteAsOf.find(row => row.symbol === us.symbol)?.priceDate).toBe('2026-11-09');
    expect(buildMemberStockCalendar({ participations: [a, us], closures: [], quotes, fx, now: new Date('2026-11-10T15:04:59+08:00') }).at(-1)?.snapshotDate).toBe('2026-11-09');
  });
  it('legacy US BJ-date close and intraday proofs rejected; same-day US cannot leak backward', () => {
    expect(isTrustedMemberCalendarClose(quote('AAOI', '2026-11-05', 59.27, 'close'))).toBe(false);
    expect(isTrustedMemberCalendarClose(quote('AAOI', '2026-11-07', 50.13))).toBe(false);
    expect(isTrustedMemberCalendarClose({ ...quote('AAOI', '2026-11-09', 50), capturedAt: '2026-11-10T04:59:59+08:00' })).toBe(false);
    const rows = buildMemberStockCalendar({ participations: [a, us], closures: [],
      quotes: quotes.filter(row => !(row.symbol === us.symbol && row.priceDate === '2026-11-06')).concat({ ...quote(us.symbol, '2026-11-10', 100), capturedAt: '2026-11-11T07:00:00+08:00' }), fx, now });
    expect(rows.find(row => row.snapshotDate === '2026-11-09')).toMatchObject({ ready: false, totalPnl: null, dailyPnl: null });
    expect(rows.at(-1)).toMatchObject({ ready: true, dailyPnl: null, previousDate: '2026-11-09' });
    expect(rows.at(-1)!.quoteAsOf.find(row => row.symbol === us.symbol)?.priceDate).toBe('2026-11-09');
  });
  it('new US D-night proof and pre-15:05 next morning cannot change the completed overview', () => {
    const base = buildMemberStockCalendar({ participations: [a, us], closures: [], quotes, fx, now });
    const overnight = buildMemberStockCalendar({ participations: [a, us], closures: [],
      quotes: quotes.concat({ ...quote(us.symbol, '2026-11-10', 100), capturedAt: '2026-11-11T05:01:00+08:00' }), fx,
      now: new Date('2026-11-11T10:00:00+08:00') });
    expect(memberCalendarSettlementSummary(overnight)).toEqual(memberCalendarSettlementSummary(base));
  });
  it('US D opening and sale delay to next A day, while CNY D is included', () => {
    const closed = { ...us, remainingQuantity: 0 };
    const later = { ...us, id: 3, symbol: 'CRCL', startDate: '2026-11-09' };
    const inputs = Object.freeze([Object.freeze(closed), Object.freeze(later)]);
    const closures = Object.freeze([Object.freeze({ participationId: us.id, quantity: 2, salePrice: 40, closeDate: '2026-11-09' })]);
    const rows = buildMemberStockCalendar({ participations: inputs, closures,
      quotes: quotes.concat(quote('CRCL', '2026-11-09', 50)), fx, now });
    expect(rows.find(row => row.snapshotDate === '2026-11-09')).toMatchObject({ ready: true, positionCount: 1, realizedPnl: 0 });
    expect(rows.at(-1)).toMatchObject({ ready: true, positionCount: 1 });
    expect(rows.at(-1)!.realizedPnl).toBeCloseTo(268);
    expect(rows.at(-1)!.quoteAsOf.map(row => row.symbol)).toEqual(['CRCL']);
    expect(inputs[0].remainingQuantity).toBe(0);
  });
  it('manual effective A date differs from physical NY opening, and unknown later history stays local', () => {
    const crcl = { ...us, symbol: 'CRCL', startDate: '2026-10-15', participationEffectiveDate: '2026-10-15', historyStartDate: '2026-10-14' };
    const unknownLater = { ...a, id: 3, participationEffectiveDate: '2026-10-16', historyStartDate: null };
    const rows = buildMemberStockCalendar({ participations: [crcl, unknownLater], closures: [],
      quotes: [quote('CRCL', '2026-10-14', 50), quote('CRCL', '2026-10-15', 49)],
      fx: [{ snapshotDate: '2026-10-15', usdCnyRate: 6.7 }], now: new Date('2026-10-16T16:00:00+08:00') });
    expect(rows[0]).toMatchObject({ snapshotDate: '2026-10-15', ready: true, positionCount: 1 });
    expect(rows[0].quoteAsOf[0].priceDate).toBe('2026-10-14');
    expect(rows[1]).toMatchObject({ snapshotDate: '2026-10-16', ready: false, totalPnl: null });
  });
  it('first-day daily return uses zero only for provably empty previous participation scope', () => {
    const first = { ...a, startDate: '2026-09-28', historyStartDate: '2026-09-28', participationEffectiveDate: '2026-09-28' };
    const rows = buildMemberStockCalendar({ participations: [first], closures: [], quotes: [quote(a.symbol, '2026-09-28', 9)], fx: [], now: new Date('2026-09-28T16:00:00+08:00') });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ previousDate: '2026-09-24', previousKnownEmpty: true, dailyPnlReady: true, dailyPnl: 100 });
    const existed = buildMemberStockCalendar({ participations: [{ ...first, startDate: '2026-09-23', historyStartDate: '2026-09-23', participationEffectiveDate: '2026-09-23' }], closures: [], quotes: [quote(a.symbol, '2026-09-28', 9)], fx: [], now: new Date('2026-09-28T16:00:00+08:00') });
    expect(existed.at(-1)).toMatchObject({ ready: true, previousKnownEmpty: false, dailyPnl: null });
    const unknown = buildMemberStockCalendar({ participations: [{ ...first, historyStartDate: null }], closures: [], quotes: [quote(a.symbol, '2026-09-28', 9)], fx: [], now: new Date('2026-09-28T16:00:00+08:00') });
    expect(unknown.at(-1)).toMatchObject({ previousKnownEmpty: false, totalPnl: null, dailyPnl: null });
  });
  it('A holiday accumulates US changes at next A day and known US holiday carries actual close', () => {
    const input = { participations: [{ ...us, startDate: '2026-09-01' }], closures: [],
      quotes: [quote(us.symbol, '2026-09-29', 50), quote(us.symbol, '2026-10-07', 45)],
      fx: ['2026-09-30', '2026-10-08'].map(snapshotDate => ({ snapshotDate, usdCnyRate: 6.7 })), now: new Date('2026-10-08T16:00:00+08:00') };
    const rows = buildMemberStockCalendar(input);
    expect(rows.slice(-3).map(row => row.snapshotDate)).toEqual(['2026-09-29', '2026-09-30', '2026-10-08']);
    expect(rows.some(row => row.snapshotDate >= '2026-10-01' && row.snapshotDate <= '2026-10-07')).toBe(false);
    expect(rows.at(-1)!.dailyPnl).toBeCloseTo(67);
    const holiday = buildMemberStockCalendar({ participations: [{ ...us, startDate: '2026-06-01' }], closures: [],
      quotes: [quote(us.symbol, '2026-06-18', 50)], fx: [{ snapshotDate: '2026-06-22', usdCnyRate: 6.7 }], now: new Date('2026-06-22T16:00:00+08:00') }).at(-1)!;
    expect(holiday).toMatchObject({ snapshotDate: '2026-06-22', ready: true });
    expect(holiday.quoteAsOf[0].priceDate).toBe('2026-06-18');
  });
  it('separates stock return from FX translation and their sum matches the frozen daily return', () => {
    const rates = fx.map(row => ({ ...row, usdCnyRate: row.snapshotDate >= '2026-11-09' ? 7 : 6.7 }));
    const rows = buildMemberStockCalendar({ participations: [a, us], closures: [], quotes, fx: rates, now });
    const monday = rows.find(row => row.snapshotDate === '2026-11-09')!;
    expect(monday.stockDailyPnl).toBeCloseTo(114);
    expect(monday.fxDailyPnl).toBeCloseTo(6);
    expect(monday.dailyPnl).toBeCloseTo(120);
    expect(monday.stockDailyPnl! + monday.fxDailyPnl!).toBeCloseTo(monday.dailyPnl!);
    expect(monday.nativePnl).toEqual({ CNY: 200, USD: 22 });
  });
  it('pause remains valuation freeze, not sale; real closures preserve realized profit', () => {
    const closed = { ...a, remainingQuantity: 0, pauseDate: '2026-11-05' };
    const rows = buildMemberStockCalendar({ participations: [closed],
      closures: [{ participationId: 1, quantity: 100, salePrice: 8, closeDate: '2026-11-09' }], quotes, fx: [], now });
    expect(rows.find(row => row.snapshotDate === '2026-11-06')).toMatchObject({ marketValue: 1000, realizedPnl: 0 });
    expect(rows.at(-1)).toMatchObject({ positionCount: 0, realizedPnl: 200, totalPnl: 200 });
  });
  it('unknown dates, missing close/fx remain nullable; overview never uses live amounts', () => {
    const unknown = buildMemberStockCalendar({ participations: [{ ...a, historyStartDate: null }], closures: [], quotes, fx: [], now });
    expect(unknown.at(-1)).toMatchObject({ ready: false, costValue: null, totalPnl: null, dailyPnlReason: 'invalid_trade_history' });
    const missingFx = buildMemberStockCalendar({ participations: [us], closures: [], quotes, fx: [], now });
    expect(missingFx.at(-1)).toMatchObject({ totalPnl: null, dailyPnlReason: 'missing_historical_fx' });
    const noClosureTime = buildMemberStockCalendar({ participations: [us], closures: [{ participationId: 2, quantity: 2, salePrice: 40, closeDate: '' }], quotes, fx, now });
    expect(noClosureTime.at(-1)).toMatchObject({ ready: false, totalPnl: null });
    expect(memberCalendarSettlementSummary([])).toMatchObject({ totalPnl: null, costValue: null, positionCount: null });
    expect(memberCalendarSettlementSummary(missingFx).totalPnl).toBeNull();
  });
  it('writer raw proof is immutable, market-date scoped; overview-only mapping leaves funds APIs alone', () => {
    const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
    const writer = source.slice(source.indexOf('export async function refreshLedgerStockTagCloseSnapshots'), source.indexOf('export async function refreshLedgerStockTagIntradaySnapshots'));
    expect(writer).toContain('fetchOvernightUnifiedCloseQuotes(missing, snapshotDate)');
    expect(writer).toContain('marketCutoff(symbol)');
    expect(writer).toContain('marketSessionDateFromBeijingTradeTimestamp');
    expect(writer).toContain('GET_LOCK'); expect(writer).toContain('beginTransaction');
    expect(writer).toContain('INSERT IGNORE INTO ledger_stock_unified_close_prices');
    expect(writer).toContain("quote.priceDate, quote.price, quote.currency, quote.source, 'cn-us-regular-close-v1'");
    expect(writer).not.toContain('buildPortfolio('); expect(writer).not.toContain('fetchIntradayStockQuotes(');
    expect(writer).not.toContain('INSERT INTO ledger_stock_daily_snapshots'); expect(writer).not.toContain('ON DUPLICATE KEY UPDATE');
    const reader = source.slice(source.indexOf('const [unifiedRows]'), source.indexOf('const [publicationRows]'));
    expect(reader).not.toContain('policy_version =');
    expect(source).toContain('summary: portfolio.settlementSummary');
    expect(source).not.toContain('ledger_stock_unified_close_publications');
  });
});
