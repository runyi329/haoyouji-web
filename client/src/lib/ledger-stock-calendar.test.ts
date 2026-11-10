import { describe, expect, it } from 'vitest';
import { expectedStockSettlementDate, normalizeStockCalendarPoints, nullableStockNumber, stockCalendarScope, stockDateKey, sumKnownStockDailyPnl } from './ledger-stock-calendar';

const now = new Date('2026-11-10T15:00:00+08:00');
const previousDates: Record<string, string> = { '2026-11-06': '2026-11-05', '2026-11-09': '2026-11-06', '2026-11-10': '2026-11-09' };
const previousTradingDate = (date: string) => previousDates[date] || '';
const nonTrading = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
const member = (date: string, dailyPnl: unknown, extra = {}) => ({ date, pnl: 100, dailyPnl, marketValue: 1000, historical: true, priced: true, ...extra });

describe('ledger stock calendar nullable compatibility', () => {
  it('unknown numbers never become zero; actual zero stays zero', () => {
    for (const value of [null, undefined, '', ' ', NaN, Infinity, true, {}]) expect(nullableStockNumber(value)).toBeNull();
    expect(nullableStockNumber(0)).toBe(0);
    expect(nullableStockNumber('0')).toBe(0);
  });
  it('owner with own overview chooses member points, not total; loading cannot fall back to total', () => {
    expect(stockCalendarScope(true, true, true)).toBe('member');
    expect(stockCalendarScope(false, true, true)).toBe('total');
    expect(stockCalendarScope(false, true, false)).toBe('loading');
    expect(stockCalendarScope(false, false, true)).toBe('missing');
  });
  it('preserves member signs and nullable dailyPnl, with missing historical market value retained', () => {
    const points = normalizeStockCalendarPoints([member('2026-11-09', null, { marketValue: null }), member('2026-11-06', 45)], 'member', previousTradingDate, now);
    expect(points.map((point) => point.date)).toEqual(['2026-11-06', '2026-11-09']);
    expect(points.map((point) => point.dailyPnl)).toEqual([45, null]);
    expect(sumKnownStockDailyPnl(points)).toBe(45);
    expect(sumKnownStockDailyPnl(points.slice(1))).toBeNull();
  });
  it('rejects realtime, future and old empty placeholder points rather than showing false settlements', () => {
    const points = normalizeStockCalendarPoints([member('2026-11-09', 1, { historical: false }), member('2026-11-10', 9343), { date: '2026-11-09', pnl: 0, dailyPnl: 0, marketValue: null }], 'member', previousTradingDate, now);
    expect(points).toEqual([]);
  });
  it('unpriced and multi-session gaps never produce daily profit', () => {
    const points = normalizeStockCalendarPoints([member('2026-11-06', 0, { priced: false }), member('2026-11-09', 9343, { previousDate: '2026-11-05' })], 'member', previousTradingDate, now);
    expect(points[0].totalPnl).toBeNull();
    expect(points.map((point) => point.dailyPnl)).toEqual([null, null]);
  });
  it('old total snapshots only derive adjacent priced trading-day deltas, never first/gap zero baseline', () => {
    const rows = [{ snapshotDate: '2026-11-05', totalPnl: 20 }, { snapshotDate: '2026-11-09', totalPnl: 100 }];
    expect(normalizeStockCalendarPoints(rows, 'total', previousTradingDate, now).map((point) => point.dailyPnl)).toEqual([null, null]);
    rows.splice(1, 0, { snapshotDate: '2026-11-06', totalPnl: 40 });
    expect(normalizeStockCalendarPoints(rows, 'total', previousTradingDate, now).map((point) => point.dailyPnl)).toEqual([null, 20, 60]);
  });
  it('15:05 cutoff uses the A-share settlement date and never publishes during the night', () => {
    expect(expectedStockSettlementDate(nonTrading, now)).toBe('2026-11-09');
    expect(expectedStockSettlementDate(nonTrading, new Date('2026-11-10T06:15:00+08:00'))).toBe('2026-11-09');
    expect(expectedStockSettlementDate(nonTrading, new Date('2026-11-10T15:04:59+08:00'))).toBe('2026-11-09');
    expect(expectedStockSettlementDate(nonTrading, new Date('2026-11-10T15:05:00+08:00'))).toBe('2026-11-10');
    expect(expectedStockSettlementDate(nonTrading, new Date('2026-11-10T23:59:00+08:00'))).toBe('2026-11-10');
    expect(expectedStockSettlementDate(nonTrading, new Date('2026-11-09T15:04:59+08:00'))).toBe('2026-11-06');
    expect(expectedStockSettlementDate(nonTrading, new Date('2026-11-07T15:05:00+08:00'))).toBe('2026-11-06');
    expect(stockDateKey('2026-02-30')).toBeNull();
    expect(stockDateKey(null)).toBeNull();
  });
});
