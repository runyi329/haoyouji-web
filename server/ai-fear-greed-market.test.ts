import { describe, expect, it, vi } from 'vitest';
import { aggregateAiFearGreedMarketDay, type AiFearGreedDailyRow } from '../shared/ai-fear-greed-market';
import {
  AI_FEAR_GREED_MARKET_SCHEMA_SQL,
  AI_FEAR_GREED_MARKET_SOURCE,
  AI_FEAR_GREED_MARKET_UNIVERSE,
  writeAiFearGreedMarketDay,
} from './ai-fear-greed-market-store';

// Synthetic fixtures exist ONLY in this isolated test; not a source-quality claim.
const fields = ['ts_code', 'trade_date', 'close', 'pre_close', 'pct_chg', 'vol', 'amount'];
const date = '20261126';
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const zeros = '0'.repeat(64);
function fixture(count = 3000, valid = false, day = date): unknown[][] {
  return Array.from({ length: count }, (_, i) => [
    `${600000 + i}.SH`, day, 10, 10, 0, valid ? 1 : 0, valid ? 10 : 0,
  ]);
}
function aggregate(items = fixture(), day = date): AiFearGreedDailyRow {
  return aggregateAiFearGreedMarketDay(fields, items, day);
}
function validRow(): AiFearGreedDailyRow {
  const items = fixture();
  items[0] = ['600000.SH', date, 10, 10, 2, 100, 10.25];
  items[1] = ['000001.SZ', date, 10, 10, -1, 100, 20.5];
  items[2] = ['300001.SZ', date, 10, 10, 0, 100, 30.125];
  return aggregate(items);
}

// No database client, business module, credentials, network or SQL execution.
// The fake records SQL text and models the documented conditional-write contract.
type Stored = {
  source: string;
  source_hash: string;
  universe: string;
  verified_at: string | null;
  parameters?: unknown[];
};
function memoryExecutor(initial?: Stored) {
  let stored = initial ? { ...initial } : undefined;
  let tick = 0;
  const execute = vi.fn(async (sql: string, parameters: unknown[]): Promise<unknown> => {
    if (sql.startsWith('INSERT INTO')) {
      const pending = stored?.source === 'pending' && stored.verified_at === null;
      const sameHash = stored !== undefined && stored.source === parameters[9] && stored.source_hash === parameters[10];
      if (!stored || (stored.universe === parameters[12] && (pending || sameHash))) {
        stored = {
          source: parameters[9] as string,
          source_hash: parameters[10] as string,
          universe: parameters[12] as string,
          verified_at: `verification-${++tick}`,
          parameters: [...parameters],
        };
      }
      return [{ affectedRows: 0 }, []]; // Deliberately unusable to infer acceptance.
    }
    if (sql.startsWith('SELECT')) return [stored ? [{ ...stored }] : [], []];
    throw new Error('Unexpected SQL in isolated test');
  });
  return { execute, stored: () => stored };
}

describe('pure full-source Tushare daily market aggregation', () => {
  it('uses pct_chg direction, decimal mean, source units and flat turnover', () => {
    expect(validRow()).toEqual({
      canonicaldate: '2026-11-26', rawCount: 3000, validCount: 3,
      upCount: 1, downCount: 1, upAmount: 10.25, downAmount: 20.5,
      totalAmount: 60.875, meanReturn: (0.02 - 0.01) / 3,
    });
  });

  it('keeps legal zero-volume/zero-amount rows raw but invalid, with null zero-valid mean', () => {
    expect(aggregate()).toEqual({
      canonicaldate: '2026-11-26', rawCount: 3000, validCount: 0,
      upCount: 0, downCount: 0, upAmount: 0, downAmount: 0, totalAmount: 0, meanReturn: null,
    });
    const rows = fixture();
    rows[0][6] = 100; // positive turnover but zero vol => invalid
    rows[1][5] = 100; // positive vol but zero turnover => invalid
    rows[2] = ['600002.SH', date, 0, 10, 1, 100, 100];
    rows[3] = ['600003.SH', date, 10, 0, 1, 100, 100];
    rows[4] = ['600004.SH', date, -1, 10, 1, 100, 100];
    expect(aggregate(rows)).toMatchObject({ rawCount: 3000, validCount: 0, meanReturn: null });
  });

  it('aggregates all 3000 valid source-day rows, no current constituent lookup', () => {
    const rows = fixture(3000, true, '20160104');
    rows.forEach(row => { row[4] = 1.25; });
    const result = aggregate(rows, '20160104');
    expect(result).toMatchObject({ canonicaldate: '2016-01-04', rawCount: 3000, validCount: 3000, upCount: 3000, downCount: 0, totalAmount: 30000 });
    expect(result.meanReturn).toBeCloseTo(0.0125, 12);
  });

  it('accepts only Shanghai 6 and Shenzhen 0/3, excludes Beijing and both B shares', () => {
    const rows = fixture(3000, true);
    const excluded = ['430047.BJ', '920001.BJ', '900001.SH', '200001.SZ', '500001.SH'];
    excluded.forEach(code => rows.push([code, date, 10, 10, 100, 100, 99999]));
    const result = aggregate(rows);
    expect(result).toMatchObject({ rawCount: 3000, validCount: 3000, totalAmount: 30000, meanReturn: 0 });
  });

  it('rejects below 3000 in-universe raw rows even when excluded codes fill sourceRows', () => {
    expect(() => aggregate(fixture(2999, true))).toThrow(/minimum 3000/);
    const rows = fixture(2999, true);
    rows.push(['430047.BJ', date, 10, 10, 0, 100, 100]);
    expect(() => aggregate(rows)).toThrow(/minimum 3000/);
  });

  it('maps reordered required fields and ignores extra numeric/non-numeric fields', () => {
    const reordered = ['amount', 'extra', 'trade_date', 'vol', 'pct_chg', 'pre_close', 'ts_code', 'close'];
    const rows = fixture(3000, true).map(row => [row[6], null, row[1], row[5], row[4], row[3], row[0], row[2]]);
    expect(aggregateAiFearGreedMarketDay(reordered, rows, date)).toEqual(aggregate(fixture(3000, true)));
  });

  it.each(fields)('rejects missing required field %s', missing => {
    const index = fields.indexOf(missing);
    const incomplete = fields.filter(field => field !== missing);
    expect(() => aggregateAiFearGreedMarketDay(incomplete, fixture().map(row => row.filter((_, i) => i !== index)), date)).toThrow(/Missing required field/);
  });

  it('rejects duplicate fields, short/sparse items and malformed codes', () => {
    expect(() => aggregateAiFearGreedMarketDay([...fields, 'amount'], fixture(), date)).toThrow(/Duplicate field/);
    const short = fixture(); short[0].pop();
    expect(() => aggregate(short)).toThrow(/length mismatch/);
    const sparse = fixture(); delete sparse[0][6];
    expect(() => aggregate(sparse)).toThrow(/finite number/);
    const malformed = fixture(); malformed[0][0] = '600000.sh';
    expect(() => aggregate(malformed)).toThrow(/malformed ts_code/);
  });

  it.each([null, undefined, '', '1', true, NaN, Infinity, -Infinity])('does not coerce missing/non-finite numeric input %s', bad => {
    for (const index of [2, 3, 4, 5, 6]) {
      const rows = fixture(); rows[0][index] = bad;
      expect(() => aggregate(rows)).toThrow(/finite number/);
    }
  });

  it('rejects missing values even in an excluded source row', () => {
    const rows = fixture(); rows.push(['430047.BJ', date, 10, 10, 0, 0, null]);
    expect(() => aggregate(rows)).toThrow(/finite number/);
  });

  it.each(['2026-11-26', '2026112', '20260229', '20261301', '20260431', '00000101', '20261126 '])('rejects noncanonical/impossible tradeDate %s', day => {
    expect(() => aggregate(fixture(3000, false, day), day)).toThrow(/tradeDate/);
  });

  it('accepts a true leap day and rejects mixed or noncanonical row source days', () => {
    expect(aggregate(fixture(3000, false, '20240229'), '20240229').canonicaldate).toBe('2024-02-29');
    for (const bad of ['20261125', '2026-11-26', null]) {
      const rows = fixture(); rows[0][1] = bad;
      expect(() => aggregate(rows)).toThrow(/trade_date/);
    }
  });

  it('rejects duplicate day/code including excluded rows', () => {
    const rows = fixture(); rows.push([...rows[0]]);
    expect(() => aggregate(rows)).toThrow(/duplicate day\/code/);
    const excluded = fixture();
    excluded.push(['430047.BJ', date, 10, 10, 0, 0, 0], ['430047.BJ', date, 10, 10, 0, 0, 0]);
    expect(() => aggregate(excluded)).toThrow(/duplicate day\/code/);
  });

  it('keeps Number sums within tolerance regardless of source response order', () => {
    const rows = fixture(3000, true);
    rows.forEach((row, i) => { row[4] = i % 2 ? -0.03 : 0.07; row[6] = i === 0 ? 1e12 : 0.1; });
    const forward = aggregate(rows);
    const reverse = aggregate([...rows].reverse());
    expect(forward.meanReturn).toBeCloseTo(0.0002, 12);
    expect(forward.totalAmount).toBeCloseTo(1e12 + 299.9, 3);
    expect(reverse.totalAmount).toBeCloseTo(forward.totalAmount, 3);
    expect(reverse.meanReturn).toBeCloseTo(forward.meanReturn!, 12);
  });

  it('rejects finite inputs whose accumulated amount overflows Number', () => {
    const rows = fixture(3000, true); rows[0][6] = Number.MAX_VALUE; rows[1][6] = Number.MAX_VALUE;
    expect(() => aggregate(rows)).toThrow(/Non-finite aggregate/);
  });
});

describe('method-independent store with fake-only executor', () => {
  it('exports non-running IF NOT EXISTS schema and stable source/universe', () => {
    expect(AI_FEAR_GREED_MARKET_SOURCE).toBe('tushare_daily');
    expect(AI_FEAR_GREED_MARKET_UNIVERSE).toBe('shu-sz-a-share-v1');
    expect(AI_FEAR_GREED_MARKET_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS ai_fear_greed_market_daily');
    expect(AI_FEAR_GREED_MARKET_SCHEMA_SQL).toContain('trade_date CHAR(8) NOT NULL');
    expect(AI_FEAR_GREED_MARKET_SCHEMA_SQL).toContain('PRIMARY KEY (trade_date)');
    expect(AI_FEAR_GREED_MARKET_SCHEMA_SQL).toContain('DECIMAL(24,6)');
    expect(AI_FEAR_GREED_MARKET_SCHEMA_SQL).toContain('mean_return DECIMAL(20,12) NULL');
    expect(AI_FEAR_GREED_MARKET_SCHEMA_SQL).toContain('verified_at TIMESTAMP NULL DEFAULT NULL');
    expect(AI_FEAR_GREED_MARKET_SCHEMA_SQL).not.toMatch(/tenant|ledger|user|method_version/i);
  });

  it('binds a verified INSERT with fixed-point DECIMAL and reads it back', async () => {
    const executor = memoryExecutor();
    await writeAiFearGreedMarketDay(executor, validRow(), hashA.toUpperCase(), 3002);
    expect(executor.execute).toHaveBeenCalledTimes(2);
    const [sql, parameters] = executor.execute.mock.calls[0];
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
    expect(parameters).toEqual([
      date, 3000, 3, 1, 1, '10.250000', '20.500000', '60.875000', '0.003333333333',
      'tushare_daily', hashA, 3002, 'shu-sz-a-share-v1',
    ]);
    expect(sql.indexOf('source_hash = IF')).toBeLessThan(sql.indexOf('source = IF'));
    expect(sql.indexOf('source = IF')).toBeLessThan(sql.indexOf('verified_at = IF'));
    expect(sql).toContain("source = 'pending' AND verified_at IS NULL");
    expect(sql).toContain('universe = VALUES(universe)');
    expect(executor.execute.mock.calls[1][1]).toEqual([date]);
  });

  it('replaces an official-calendar pending placeholder, keeps zero-valid mean SQL NULL', async () => {
    const executor = memoryExecutor({ source: 'pending', source_hash: zeros, universe: AI_FEAR_GREED_MARKET_UNIVERSE, verified_at: null });
    await writeAiFearGreedMarketDay(executor, aggregate(), hashA, 3000);
    expect(executor.stored()).toMatchObject({ source: 'tushare_daily', source_hash: hashA, verified_at: 'verification-1' });
    expect(executor.stored()?.parameters?.[8]).toBeNull();
    expect(executor.stored()?.parameters?.slice(5, 8)).toEqual(['0.000000', '0.000000', '0.000000']);
  });

  it('refreshes identical verified hash idempotently despite affectedRows=0', async () => {
    const executor = memoryExecutor();
    await writeAiFearGreedMarketDay(executor, validRow(), hashA, 3000);
    await writeAiFearGreedMarketDay(executor, validRow(), hashA, 3000);
    expect(executor.stored()?.verified_at).toBe('verification-2');
    expect(executor.execute).toHaveBeenCalledTimes(4);
  });

  it('rejects different verified hash even for identical aggregation, without overwrite', async () => {
    const executor = memoryExecutor();
    await writeAiFearGreedMarketDay(executor, validRow(), hashA, 3000);
    const prior = executor.stored();
    await expect(writeAiFearGreedMarketDay(executor, validRow(), hashB, 3000)).rejects.toThrow(/source conflict/);
    expect(executor.stored()).toEqual(prior);
  });

  it('does not overwrite other-universe, personal-source or verified pending rows', async () => {
    for (const initial of [
      { source: 'tushare_daily', source_hash: hashA, universe: 'another-universe', verified_at: 'old' },
      { source: 'personal', source_hash: hashA, universe: AI_FEAR_GREED_MARKET_UNIVERSE, verified_at: 'old' },
      { source: 'pending', source_hash: zeros, universe: AI_FEAR_GREED_MARKET_UNIVERSE, verified_at: 'old' },
    ]) {
      const executor = memoryExecutor(initial);
      await expect(writeAiFearGreedMarketDay(executor, validRow(), hashA, 3000)).rejects.toThrow(/source conflict/);
      expect(executor.stored()).toEqual(initial);
    }
  });

  it.each(['20261126', '2026-02-29', '2026-04-31', '0000-01-01', '2026-11-26 '])('rejects malformed canonicaldate before executor call %s', canonicaldate => {
    const executor = memoryExecutor();
    return expect(writeAiFearGreedMarketDay(executor, { ...validRow(), canonicaldate }, hashA, 3000)).rejects.toThrow(/canonicaldate/).then(() => {
      expect(executor.execute).not.toHaveBeenCalled();
    });
  });

  it('rejects invalid counts/hash/amount/mean before any execution', async () => {
    const patches: Partial<AiFearGreedDailyRow>[] = [
      { rawCount: 2999 }, { validCount: 3001 }, { upCount: 4 }, { downCount: -1 },
      { rawCount: 3000.5 }, { upAmount: NaN }, { totalAmount: Infinity },
      { totalAmount: null as unknown as number }, { upAmount: -1 }, { totalAmount: 1 },
      { meanReturn: null }, { meanReturn: NaN }, { meanReturn: 1e8 }, { totalAmount: 1e18 },
    ];
    for (const patch of patches) {
      const executor = memoryExecutor();
      await expect(writeAiFearGreedMarketDay(executor, { ...validRow(), ...patch }, hashA, 3000)).rejects.toThrow();
      expect(executor.execute).not.toHaveBeenCalled();
    }
    for (const badHash of [zeros, 'x'.repeat(64), 'a'.repeat(63), `${hashA} `]) {
      const executor = memoryExecutor();
      await expect(writeAiFearGreedMarketDay(executor, validRow(), badHash, 3000)).rejects.toThrow(/sourceHash/);
      expect(executor.execute).not.toHaveBeenCalled();
    }
    for (const sourceRows of [2999, NaN, 3000.5, 2147483648]) {
      const executor = memoryExecutor();
      await expect(writeAiFearGreedMarketDay(executor, validRow(), hashA, sourceRows)).rejects.toThrow();
      expect(executor.execute).not.toHaveBeenCalled();
    }
  });

  it('rejects unconfirmed writes and propagates executor failure', async () => {
    const emptyRead = { execute: vi.fn(async () => [[], []]) };
    await expect(writeAiFearGreedMarketDay(emptyRead, validRow(), hashA, 3000)).rejects.toThrow(/unverified write/);
    const failed = { execute: vi.fn(async () => { throw new Error('isolated executor failure'); }) };
    await expect(writeAiFearGreedMarketDay(failed, validRow(), hashA, 3000)).rejects.toThrow('isolated executor failure');
  });
});
