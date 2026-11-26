import { describe, expect, it } from 'vitest';
import { calculateOrdinaryTagDownsideSeries, type OrdinaryTagDownsideRule, type OrdinaryTagDownsidePoint } from '../shared/ordinary-tag-downside';

let seed = 73261126;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const date = (i: number) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
const rule = (thresholdAmount: number, downsidePercent: number, version = 1, startDate = date(0), enabled = true): OrdinaryTagDownsideRule => ({ ledgerId: 37, categoryId: 501, userId: 28, version, enabled, thresholdAmount, downsidePercent, startDate, createdAt: '2026-11-26T00:00:00.000Z' });
const close = (actual: number | null, expected: number, scale = 1) => {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected)).toBeLessThan(1e-7 * Math.max(scale, Math.abs(expected), 1));
};

describe('ordinary account downside deterministic properties', () => {
  it('below/above/crossing thresholds: pure additions, reductions and withdrawals generate no profit even across rule revisions', () => {
    for (let sample = 0; sample < 200; sample += 1) {
      const initialAmount = 100 + random() * 10000;
      const thresholdAmount = 100 + random() * 10000;
      const ratio = random() * 100;
      let balance = initialAmount;
      const points: OrdinaryTagDownsidePoint[] = [];
      for (let i = 0; i < 12; i += 1) {
        const capitalChange = (random() - 0.4) * balance * 0.8;
        const withdraw = random() * (balance + capitalChange) * 0.2;
        balance += capitalChange - withdraw;
        points.push({ date: date(i), rawBalance: balance, capitalChange, withdraw });
      }
      const rules = [rule(thresholdAmount, random() * 100), rule(thresholdAmount * 0.7, 0, 2, date(5)), rule(thresholdAmount, 100, 3, date(8)), rule(thresholdAmount, 100, 4, date(10), false)];
      const series = calculateOrdinaryTagDownsideSeries({ ledgerId: 37, categoryId: 501, initialAmount, entryDate: date(0), ratio, points, rules });
      for (const point of series) {
        expect(point.status).toBe('ready');
        close(point.rawPnl, 0, initialAmount);
        close(point.countedPnl, 0, initialAmount);
        close(point.dailyCountedPnl, 0, initialAmount);
      }
    }
  });

  it('remaining 100% is identically raw for arbitrary real performance and explicit cash flows', () => {
    for (let sample = 0; sample < 200; sample += 1) {
      const initialAmount = 100 + random() * 10000;
      let balance = initialAmount;
      const points: OrdinaryTagDownsidePoint[] = [];
      for (let i = 0; i < 12; i += 1) {
        const capitalChange = (random() - 0.4) * balance * 0.3;
        const withdraw = random() * (balance + capitalChange) * 0.1;
        balance = (balance + capitalChange - withdraw) * (0.6 + random() * 0.8);
        points.push({ date: date(i), rawBalance: balance, capitalChange, withdraw });
      }
      const series = calculateOrdinaryTagDownsideSeries({ ledgerId: 37, categoryId: 501, initialAmount, entryDate: date(0), ratio: random() * 100, points, rules: [rule(100 + random() * 10000, 100)] });
      for (const point of series) {
        expect(point.status).toBe('ready');
        close(point.countedPnl, point.rawPnl!, initialAmount);
        close(point.dailyCountedPnl, point.dailyRawPnl!, initialAmount);
      }
    }
  });

  it('no-cash round trips through either side of the gate have no permanent ratchet', () => {
    for (let sample = 0; sample < 200; sample += 1) {
      const initialAmount = 100 + random() * 10000;
      const thresholdAmount = 100 + random() * 10000;
      const points = [thresholdAmount * 0.1, thresholdAmount * 1.8, thresholdAmount * 0.5, thresholdAmount * 2.2, initialAmount]
        .map((rawBalance, i) => ({ date: date(i), rawBalance, capitalChange: 0, withdraw: 0 }));
      const input = { ledgerId: 37 as const, categoryId: 501, initialAmount, entryDate: date(0), ratio: random() * 100, points, rules: [rule(thresholdAmount, random() * 100)] };
      const snapshot = structuredClone(input);
      const series = calculateOrdinaryTagDownsideSeries(input);
      close(series.at(-1)!.countedPnl, 0, initialAmount);
      close(series.reduce((sum, point) => sum + point.dailyCountedPnl!, 0), series.at(-1)!.countedPnl!, initialAmount);
      expect(input).toEqual(snapshot);
    }
  });

  it('each revision produces a daily delta exactly matching its cumulative change, not a second raw balance calculation', () => {
    const points = [1300, 850, 700, 1200, 800, 750].map((rawBalance, i) => ({ date: date(i), rawBalance, capitalChange: 0, withdraw: 0 }));
    const series = calculateOrdinaryTagDownsideSeries({ ledgerId: 37, categoryId: 501, initialAmount: 1400, entryDate: date(0), ratio: 25, points,
      rules: [rule(1000, 0), rule(900, 20, 2, date(2)), rule(900, 20, 3, date(4), false), rule(1100, 50, 4, date(5))] });
    let previous = 0;
    for (const point of series) {
      close(point.dailyCountedPnl, point.countedPnl! - previous);
      previous = point.countedPnl!;
    }
  });
});
