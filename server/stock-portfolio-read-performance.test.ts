import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { StockPortfolioReadCache } from './stock-portfolio-read-cache';
import { buildMemberStockCalendar } from './shared/stock-member-calendar';
import { buildStockTotalCalendar } from './shared/stock-total-calendar';
import { buildCryptoPortfolioDailyPayload, revalueCryptoPortfolioDailyPayloads, revalueCryptoPortfolioDailyPayloadsAsync } from './shared/crypto-portfolio-calendar';

afterEach(() => vi.useRealTimers());
describe('R1 read reconstruction bounded work (offline)', () => {
  it('same executor/scope/revision shares pending work even after TTL; TTL begins at completion', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const cache = new StockPortfolioReadCache<number>(100), executor = {};
    let finish!: (value: number) => void;
    const load = vi.fn(() => new Promise<number>(resolve => { finish = resolve; }));
    const first = cache.read(executor, '37:81', 'v1', load);
    await Promise.resolve(); vi.setSystemTime(10_000);
    expect(cache.read(executor, '37:81', 'v1', load)).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
    finish(7); expect(await first).toBe(7);
    vi.setSystemTime(10_050);
    expect(cache.read(executor, '37:81', 'v1', load)).toBe(first);
    vi.setSystemTime(10_101);
    expect(cache.read(executor, '37:81', 'v1', async () => 8)).not.toBe(first);
  });
  it('revision, executor, invalidation and failures never reuse an incorrect snapshot', async () => {
    const cache = new StockPortfolioReadCache<number>(), executor = {};
    expect(await cache.read(executor, '81', 'v1', async () => 1)).toBe(1);
    expect(await cache.read(executor, '81', 'v2', async () => 2)).toBe(2);
    expect(await cache.read({}, '81', 'v2', async () => 3)).toBe(3);
    cache.clear(); expect(await cache.read(executor, '81', 'v2', async () => 4)).toBe(4);
    await expect(cache.read(executor, '82', 'v1', async () => { throw new Error('retry'); })).rejects.toThrow('retry');
    expect(await cache.read(executor, '82', 'v1', async () => 5)).toBe(5);
  });
  const now = new Date('2026-11-25T16:00:00+08:00');
  const quotes = ['2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25'].map((priceDate, i) => ({ symbol: '600000.SH', priceDate, price: 100 - i * 10, capturedAt: `${priceDate}T15:05:00+08:00`, source: 'unified_close_tushare' }));
  const rule = { ledgerId: 37, categoryId: 81, lotId: 1, userId: 28, version: 1, enabled: false,
    thresholdPrice: 100, downsidePercent: 20, startDate: '2026-11-23', effectiveAt: '2026-11-22T16:00:00.000Z',
    baselineRawPrice: 100, baselineCountedPrice: 100, currency: 'CNY' as const, createdAt: now.toISOString() };
  it('strict single-date member/total matches full history incl daily differences; disabled revisions still apply', () => {
    const input = { participations: [{ id: 1, lotId: 1, symbol: '600000.SH', startDate: '2026-11-20', openedAt: '2026-11-20T10:00:00+08:00',
      assignedAt: '2026-11-20T10:00:00+08:00', physicalUnitCost: 100, entryPrice: 100, remainingQuantity: 2 }],
      closures: [{ participationId: 1, quantity: 1, salePrice: 80, closeDate: '2026-11-24', actualAt: '2026-11-24T14:00:00+08:00' }],
      quotes, fx: [], downsideRules: [rule], now };
    const full = buildMemberStockCalendar(input);
    for (const date of quotes.map(q => q.priceDate)) {
      expect(buildMemberStockCalendar({ ...input, snapshotDates: [date] })).toEqual(full.filter(r => r.snapshotDate === date));
    }
    const totalInput = { lots: [{ id: 1, symbol: '600000.SH', initialQuantity: 2, unitCost: 100, openingFee: null,
      openedDate: '2026-11-20', openedAt: '2026-11-20T10:00:00+08:00' }], sales: [], quotes, fx: [], downsideRules: [rule], now };
    expect(buildStockTotalCalendar({ ...totalInput, snapshotDates: ['2026-11-24'] })).toEqual(buildStockTotalCalendar(totalInput).filter(r => r.snapshotDate === '2026-11-24'));
  });
  it('cooperative revaluation yields without changing pure output or source evidence', async () => {
    const date = '2026-11-25';
    const history = { lots: [{ id: 1, symbol: '600000.SH', initialQuantity: 2, unitCost: 100, openingFee: null,
      openedDate: '2026-11-20', actualTradedAt: '2026-11-20T10:00:00+08:00', registeredAt: '2026-11-20T10:01:00+08:00' }], sales: [], participations: [], closures: [], observations: [], downsideRules: [rule] };
    const original = buildCryptoPortfolioDailyPayload({ ...history, categoryId: 81, snapshotDate: date, activationDate: date, now,
      persistedActivation: { ledgerId: 37, categoryId: 81, policyVersion: 'mixed-crypto-natural-day-1505-v1', activationDate: date, snapshotDate: date },
      quotes: [{ ...quotes.at(-1)!, currency: 'CNY', updatedAt: quotes.at(-1)!.capturedAt }], usdtFx: null, usdFx: null,
      captureHistoryEvidence: true });
    const input = { categoryId: 81, originalPayloads: [original], history: { ...history, historicalQuotes: quotes.map(q => ({ ...q, currency: 'CNY' as const, updatedAt: q.capturedAt })) }, now };
    const before = JSON.stringify(input), yields = vi.fn(async () => undefined);
    expect(await revalueCryptoPortfolioDailyPayloadsAsync(input, yields)).toEqual(revalueCryptoPortfolioDailyPayloads(input));
    expect(yields).toHaveBeenCalledTimes(1); expect(JSON.stringify(input)).toBe(before);
  });
  it('save queues only dirty generation and activation reader uses one batch helper', () => {
    const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
    const save = source.slice(source.indexOf('export async function setStockLotDownsideRule'), source.indexOf('export async function getStockTagPortfolio'));
    expect(save).toContain('markStockCalendarResultDirty'); expect(save).not.toContain('void rebuildStockTagCalendarResult');
    const baseline = source.slice(source.indexOf('export async function readStockLotDownsideCalendarBaselines'), source.indexOf('/** Internal scheduler/admin tool API'));
    expect(baseline).toContain('snapshotDates: [snapshotDate]');
    expect(baseline).not.toContain('p.user_id=?'); expect(baseline).toContain('setImmediate');
    const settlement = readFileSync(new URL('./crypto-portfolio-settlement.ts', import.meta.url), 'utf8');
    expect(settlement).toContain('readStockLotDownsideCalendarBaselines(categoryId, date,');
  });
});
