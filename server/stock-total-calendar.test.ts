import { describe, expect, it } from 'vitest';
import { buildMemberStockCalendar } from './shared/stock-member-calendar';
import {
  buildStockTotalCalendar as buildTotalStockCalendar,
  type TotalCalendarInput,
  type TotalCalendarLot,
  type TotalCalendarSale,
} from './shared/stock-total-calendar';
import type { MemberCalendarQuote } from './shared/stock-member-calendar';

const now = new Date('2026-11-06T16:00:00+08:00');
const lot: TotalCalendarLot = {
  id: 1, symbol: '600000.SH', initialQuantity: 100, unitCost: 10,
  openingFee: null, openedDate: '2026-11-05',
};
function quote(symbol: string, priceDate: string, price: number): MemberCalendarQuote {
  return { symbol, priceDate, price, source: 'unified_close_yahoo', capturedAt: '2026-11-10T16:00:00+08:00' };
}
const quotes = [quote(lot.symbol, '2026-11-05', 11), quote(lot.symbol, '2026-11-06', 11)];
const sale: TotalCalendarSale = {
  lotId: 1, quantity: 20, salePrice: 11, transactionFee: null,
  eventQuantity: 20, closeDate: '2026-11-06',
};
function calendar(overrides: Partial<TotalCalendarInput> = {}) {
  return buildTotalStockCalendar({ lots: [lot], sales: [], quotes, fx: [], now, ...overrides });
}

describe('global physical-lot tag-total calendar (offline)', () => {
  it('first buy day uses true portfolio direction and empty-prior zero, not buy principal', () => {
    const first = calendar()[0];
    expect(first).toMatchObject({ scope: 'tag-total', ready: true, previousKnownEmpty: true, dailyPnlReady: true });
    expect(first.costValue).toBe(100 * 10);
    expect(first.marketValue).toBe(100 * 11);
    expect(first.floatingPnl).toBe(100 * (11 - 10));
    expect(first.totalPnl).toBe(first.floatingPnl);
    expect(first.dailyPnl).toBe(first.totalPnl);
    expect(first.nativePnl).toEqual({ CNY: 100 * (11 - 10), USD: 0 });
  });

  it('member shares, names, pause/configuration cannot affect full physical lots or leak into rows', () => {
    const total = calendar();
    const member = buildMemberStockCalendar({
      participations: [{ id: 1, symbol: lot.symbol, startDate: lot.openedDate!, remainingQuantity: 1, entryPrice: 10 }],
      closures: [], quotes, fx: [], now,
    });
    expect(total.at(-1)!.marketValue).toBe(100 * member.at(-1)!.marketValue!);
    // Runtime extra metadata is deliberately ignored; the public input has no member parameter.
    const extra = { lots: [lot], sales: [], quotes, fx: [], now, members: [{ userId: 37, name: 'private', share: 0.01, pauseDate: '2026-11-05' }] };
    expect(buildTotalStockCalendar(extra)).toEqual(total);
    expect(JSON.stringify(total)).not.toMatch(/userId|members|name|notes|allocations|pauseDate/);
  });

  it('15:05 uses same-day A and previous NY US, including real US opening/sale cutoff', () => {
    const us = { ...lot, id: 2, symbol: 'AAOI', initialQuantity: 2, unitCost: 60, openedDate: '2026-11-06' };
    const input: TotalCalendarInput = {
      lots: [{ ...lot, openedDate: '2026-11-06' }, us],
      sales: [{ ...sale, quantity: 100, eventQuantity: 100, salePrice: 12, closeDate: '2026-11-09' },
        { lotId: 2, quantity: 2, eventQuantity: 2, salePrice: 70, transactionFee: null, closeDate: '2026-11-09' }],
      quotes: [quote(lot.symbol, '2026-11-06', 11), quote(us.symbol, '2026-11-06', 65), quote(us.symbol, '2026-11-09', 70)],
      fx: ['2026-11-09', '2026-11-10'].map(snapshotDate => ({ snapshotDate, usdCnyRate: 7 })),
      now: new Date('2026-11-10T15:05:00+08:00'),
    };
    const rows = buildTotalStockCalendar(input);
    expect(rows[0]).toMatchObject({ snapshotDate: '2026-11-06', positionCount: 1 });
    const monday = rows.find(row => row.snapshotDate === '2026-11-09')!;
    expect(monday.sourceDates).toEqual({ A: '2026-11-09', US: '2026-11-06' });
    expect(monday.positionCount).toBe(1);
    expect(monday.realizedPnl).toBe(100 * (12 - 10));
    expect(monday.floatingPnl).toBe(2 * (65 - 60) * 7);
    const tuesday = rows.at(-1)!;
    expect(tuesday.sourceDates).toEqual({ A: '2026-11-10', US: '2026-11-09' });
    expect(tuesday.positionCount).toBe(0);
    expect(tuesday.totalPnl).toBe(100 * (12 - 10) + 2 * (70 - 60) * 7);
    expect(buildTotalStockCalendar({ ...input, now: new Date('2026-11-10T15:04:59+08:00') }).at(-1)!.snapshotDate).toBe('2026-11-09');
  });

  it('partial reduction preserves total return and does not count withdrawn principal as daily income', () => {
    const rows = calendar({ sales: [sale] });
    const before = rows[0], after = rows.at(-1)!;
    expect(after.marketValue).toBe((100 - 20) * 11);
    expect(after.costValue).toBe((100 - 20) * 10);
    expect(after.realizedPnl).toBe(20 * (11 - 10));
    expect(after.totalPnl).toBe(before.totalPnl);
    expect(after.dailyPnl).toBe(0);
  });

  it('new sale fees allocate by whole event quantity and actual buy fees accrue on sale day only', () => {
    const rows = calendar({ lots: [{ ...lot, openingFee: 10 }], sales: [{ ...sale, salePrice: 12, transactionFee: 4, eventQuantity: 40 }] });
    expect(rows[0].costValue).toBe(100 * 10);
    expect(rows[0].realizedPnl).toBe(0);
    expect(rows[0].floatingPnl).toBe(100 * (11 - 10));
    expect(rows.at(-1)!.realizedPnl).toBeCloseTo(20 * (12 - 10 - 4 / 40 - 10 / 100));
  });

  it('legacy null sale fee means both fees zero; saved zero fee still applies fallback buy rate 0.001', () => {
    const legacy = calendar({ lots: [{ ...lot, openingFee: 500 }], sales: [{ ...sale, salePrice: 12, eventQuantity: Number.NaN }] }).at(-1)!;
    expect(legacy).toMatchObject({ ready: true });
    expect(legacy.realizedPnl).toBe(20 * (12 - 10));
    const modern = calendar({ sales: [{ ...sale, salePrice: 12, transactionFee: 0 }] }).at(-1)!;
    expect(modern.realizedPnl).toBeCloseTo(20 * (12 - 10 - 10 * 0.001));
  });

  it('multiple lots of one stock aggregate once by physical quantity, not member/event shares', () => {
    const second = { ...lot, id: 2, initialQuantity: 50, unitCost: 20 };
    const row = calendar({ lots: [lot, second], quotes: [quote(lot.symbol, '2026-11-06', 12)] }).at(-1)!;
    expect(row.positionCount).toBe(1);
    expect(row.marketValue).toBe((100 + 50) * 12);
    expect(row.costValue).toBe(100 * 10 + 50 * 20);
    expect(row.totalPnl).toBe(100 * (12 - 10) + 50 * (12 - 20));
    expect(row.quoteAsOf).toHaveLength(1);
    const sold = calendar({ lots: [lot, { ...lot, id: 2 }], sales: [
      { ...sale, quantity: 100, salePrice: 12, transactionFee: 20, eventQuantity: 200 },
      { ...sale, lotId: 2, quantity: 100, salePrice: 12, transactionFee: 20, eventQuantity: 200 },
    ] }).at(-1)!;
    expect(sold.realizedPnl).toBeCloseTo(200 * (12 - 10 - 20 / 200 - 10 * 0.001));
  });

  it('FX and stock decomposition both reverse and sum to frozen daily total/native PnL difference', () => {
    const us = { ...lot, id: 2, symbol: 'AAOI', initialQuantity: 2, unitCost: 60, openedDate: '2026-11-04' };
    const rows = calendar({ lots: [{ ...lot, openedDate: '2026-11-04' }, us],
      quotes: [quote(lot.symbol, '2026-11-05', 10), quote(lot.symbol, '2026-11-06', 9), quote(lot.symbol, '2026-11-09', 8),
        quote(us.symbol, '2026-11-04', 51), quote(us.symbol, '2026-11-05', 50), quote(us.symbol, '2026-11-06', 49)],
      fx: ['2026-11-05', '2026-11-06', '2026-11-09'].map(snapshotDate => ({ snapshotDate,
        usdCnyRate: snapshotDate === '2026-11-09' ? 7 : 6.7, source: 'offline-proof', asOf: `${snapshotDate}T07:05:00Z`, lockedAt: `${snapshotDate}T07:06:00Z` })),
      now: new Date('2026-11-09T16:00:00+08:00'),
    });
    const monday = rows.at(-1)!, friday = rows.at(-2)!;
    expect(monday.nativePnl).toEqual({ CNY: -200, USD: -22 });
    expect(monday.stockDailyPnl).toBeCloseTo(-114);
    expect(monday.fxDailyPnl).toBeCloseTo(-6);
    expect(monday.dailyPnl).toBeCloseTo(monday.totalPnl! - friday.totalPnl!);
    expect(monday.stockDailyPnl! + monday.fxDailyPnl!).toBeCloseTo(monday.dailyPnl!);
    expect(monday).toMatchObject({ usdCnyRate: 7, fxSource: 'offline-proof', fxAsOf: '2026-11-09T07:05:00Z', fxLockedAt: '2026-11-09T07:06:00Z' });
  });

  it('unknown close/FX stay nullable instead of publishing partial native or live PnL', () => {
    const missingQuote = calendar({ quotes: [] }).at(-1)!;
    expect(missingQuote).toMatchObject({ ready: false, priced: false, status: 'pending_verification', marketValue: null,
      floatingPnl: null, totalPnl: null, dailyPnl: null, stockDailyPnl: null, fxDailyPnl: null, nativePnl: { CNY: null, USD: 0 } });
    const us = { ...lot, symbol: 'AAOI', openedDate: '2026-11-04' };
    expect(calendar({ lots: [us], quotes: [quote(us.symbol, '2026-11-05', 11)] }).at(-1)).toMatchObject({
      ready: false, totalPnl: null, costValue: null, nativePnl: { USD: null }, dailyPnlReason: 'missing_historical_fx',
    });
  });

  it.each([-1, Number.NaN, 101])('invalid sold quantity %s is unknown, never clamped into plausible PnL', quantity => {
    expect(calendar({ sales: [{ ...sale, quantity }] }).at(-1)).toMatchObject({ ready: false,
      totalPnl: null, realizedPnl: null, costValue: null, nativePnl: { CNY: null, USD: 0 }, dailyPnlReason: 'invalid_trade_history' });
  });

  it('aggregate overselling, invalid opening quantity and invalid new event quantity remain pending', () => {
    const badInputs: Partial<TotalCalendarInput>[] = [
      { sales: [{ ...sale, quantity: 60 }, { ...sale, quantity: 50 }] },
      { lots: [{ ...lot, initialQuantity: 0 }] },
      { lots: [{ ...lot, initialQuantity: Number.NaN }] },
      { sales: [{ ...sale, transactionFee: 1, eventQuantity: 0 }] },
      { sales: [{ ...sale, transactionFee: 1, eventQuantity: 10 }] },
      { sales: [{ ...sale, closeDate: '2026-11-04' }] },
    ];
    for (const input of badInputs) expect(calendar(input).at(-1)).toMatchObject({ ready: false, totalPnl: null, realizedPnl: null });
  });

  it('unknown actual opening/close dates never substitute registration dates', () => {
    for (const openedDate of [null, 'invalid', '2026-02-30']) {
      expect(calendar({ lots: [{ ...lot, openedDate }] }).at(-1)).toMatchObject({ ready: false, totalPnl: null });
    }
    expect(calendar({ sales: [{ ...sale, closeDate: null }] }).at(-1)).toMatchObject({ ready: false, totalPnl: null, dailyPnl: null });
  });

  it('inputs remain readonly and empty physical scope stays empty', () => {
    const lots = Object.freeze([Object.freeze({ ...lot })]);
    const sales = Object.freeze([Object.freeze({ ...sale })]);
    const before = JSON.stringify({ lots, sales });
    calendar({ lots, sales });
    expect(JSON.stringify({ lots, sales })).toBe(before);
    expect(calendar({ lots: [], sales: [] })).toEqual([]);
  });
});
