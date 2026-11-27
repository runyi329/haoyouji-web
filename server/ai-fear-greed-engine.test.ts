import { describe, expect, it } from 'vitest';
import { buildAiFearGreedIndex, type AiFearGreedDailyRow } from './ai-fear-greed-engine';

const row = (i: number, patch: Partial<AiFearGreedDailyRow> = {}): AiFearGreedDailyRow => ({
  canonicaldate: (() => { const d = new Date(Date.UTC(2024, 0, 1 + i)); return d.toISOString().slice(0, 10); })(),
  rawCount: 2000, validCount: 2000, upCount: 1100, downCount: 800, upAmount: 110, downAmount: 80, totalAmount: 200, meanReturn: 0.001, ...patch,
});
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i));

function resultWithCurrent(current: Partial<AiFearGreedDailyRow>) {
  return buildAiFearGreedIndex([...rows(563), row(563, current)]);
}

describe('buildAiFearGreedIndex', () => {
  it('requires exactly 504 finite prior factor rows plus warmup', () => {
    expect(buildAiFearGreedIndex(rows(503 + 59 + 1)).score).toBeNull();
    expect(buildAiFearGreedIndex(rows(563)).score).toBeNull();
    expect(buildAiFearGreedIndex(rows(564)).score).not.toBeNull();
  });

  it('keeps 0 and 100 percentile boundaries and uses fractional weights summing to 1', () => {
    const result = buildAiFearGreedIndex(rows(564).map((r, i) => ({ ...r, meanReturn: i === 563 ? 0.01 : -0.01 })));
    expect(result.score).not.toBeNull();
    expect(result.factors.every(f => f.score === null || (f.score >= 0 && f.score <= 100))).toBe(true);
    expect(result.factors.reduce((sum, f) => sum + f.weight, 0)).toBeCloseTo(1);
    expect(result.factors.map(f => f.weight)).toEqual([25 / 80, 25 / 80, 15 / 80, 15 / 80]);
  });

  it('rejects duplicate dates, invalid dates and illegal numeric fields', () => {
    expect(buildAiFearGreedIndex([...rows(564), rows(1)[0]]).status).toBe('unavailable');
    expect(buildAiFearGreedIndex(rows(564).map((r, i) => i === 10 ? { ...r, canonicaldate: '2024-02-30' } : r)).status).toBe('unavailable');
    expect(buildAiFearGreedIndex(rows(564).map((r, i) => i === 10 ? { ...r, validCount: 1.5 } : r)).status).toBe('unavailable');
    expect(buildAiFearGreedIndex(rows(564).map((r, i) => i === 10 ? { ...r, upAmount: 201 } : r)).status).toBe('unavailable');
  });

  it('keeps latest source date and does not coerce null meanReturn to zero', () => {
    const input = rows(564); input[563] = { ...input[563], meanReturn: null };
    const result = buildAiFearGreedIndex(input);
    expect(result.latestDate).toBe(input[563].canonicaldate);
    expect(result.score).toBeNull();
    expect(result.history.at(-1)?.score).toBeNull();
  });

  it('preserves a null bad day, restarts path, and needs 60 valid days before recovery', () => {
    const broken = rows(1200); broken[1100] = { ...broken[1100], validCount: 1899, upCount: 900, downCount: 900 };
    const brokenResult = buildAiFearGreedIndex(broken);
    expect(brokenResult.status).toBe('insufficient');
    expect(brokenResult.history[152]?.score).toBeNull();
    const recovered = rows(1800); recovered[1000] = { ...recovered[1000], validCount: 1899, upCount: 900, downCount: 900 };
    const recoveredResult = buildAiFearGreedIndex(recovered);
    expect(recoveredResult.history.at(-1)?.score).not.toBeNull();
  });

  it('does not let future appended data alter prior history', () => {
    const base = rows(564); const first = buildAiFearGreedIndex(base);
    const extended = buildAiFearGreedIndex([...base, row(564, { meanReturn: -0.5 })]);
    const oldDate = base[563].canonicaldate;
    expect(extended.history.find(p => p.date === oldDate)?.score).toBe(first.history.find(p => p.date === oldDate)?.score);
  });

  it('makes larger downside volatility less greedy', () => {
    const low = resultWithCurrent({ meanReturn: 0 });
    const high = resultWithCurrent({ meanReturn: -0.2 });
    expect(high.score).toBeLessThan(low.score!);
  });

  it('uses only the adjacent previous source-day score', () => {
    const input = rows(565); input[563] = { ...input[563], validCount: 900 };
    const result = buildAiFearGreedIndex(input);
    expect(result.previousScore).toBeNull();
  });
});
