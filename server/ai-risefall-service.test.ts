import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAiRisefallCacheForTests, getAiRisefall, readAiRisefall, type AiRisefallOptions } from './ai-risefall-service';

const D = '20261127';
const NOW = new Date('2026-11-28T08:00:00Z');
const FIELDS = ['trade_date', 'ts_code', 'pre_close', 'up_limit', 'down_limit'];
type Detail = { ts_code: string; close: unknown; pre_close: unknown };
type Daily = { tradeDate: string; total: unknown; up: unknown; down: unknown; flat: unknown; excluded: unknown; maxRise: unknown; maxFall: unknown };
const quote = (ts_code = '600000.SH', close: unknown = 11, pre_close: unknown = 10): Detail => ({ ts_code, close, pre_close });
const daily = (tradeDate = D, overrides: Partial<Daily> = {}): Daily => ({ tradeDate, total: 1, up: 1, down: 0, flat: 0, excluded: 0, maxRise: 10, maxFall: null, ...overrides });
const limit = (ts_code = '600000.SH', pre = 10, up = 11, down = 9, date = D) => [date, ts_code, pre, up, down];
function database(aggregates: Daily[] = [daily()], details: Detail[] = [quote()], dates = aggregates.map(row => row.tradeDate)) {
  // Independent fixtures for distinct dates, per-date summaries, and current-day details.
  // Never synthesize daily aggregates from a single detail row.
  return { execute: vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('SELECT DISTINCT d.trade_date')) return [dates.map(trade_date => ({ trade_date }))];
    if (sql.includes('SELECT d.ts_code')) return [details];
    if (sql.includes('GROUP BY d.trade_date')) return [aggregates];
    throw new Error(`Unexpected query ${sql}`);
  }) };
}
function response(items: unknown[][], fields = FIELDS, code = 0) {
  return { ok: true, json: async () => ({ code, data: { fields, items } }) };
}
function supplier(items: unknown[][] = [limit()]) {
  return vi.fn(async (_url: string, init: any) => {
    const { params } = JSON.parse(init.body);
    return response(items.slice(params.offset, params.offset + params.limit));
  });
}
const options = (fetchImpl?: AiRisefallOptions['fetchImpl'], extras: Partial<AiRisefallOptions> = {}): AiRisefallOptions => ({ now: NOW, token: 'test-token', fetchImpl, ...extras });
function fullPage(start = 0): unknown[][] {
  // 5800 unique canonical BJ codes, plus the local SH code; no fabricated days.
  const items = Array.from({ length: 5800 }, (_, i) => limit(`${830000 + start + i}.BJ`));
  items[0] = limit();
  return items;
}

describe('AI 日涨跌只读服务', () => {
  beforeEach(() => { clearAiRisefallCacheForTests(); vi.useFakeTimers({ now: NOW }); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('ignores legitimate B-shares and funds without invalidating complete A-share limit coverage', async () => {
    const result = await readAiRisefall(database(), options(supplier([
      limit(), limit('900001.SH'), limit('200001.SZ'), limit('510300.SH'),
    ])));
    expect(result.status).toBe('available');
    expect(result.today).toMatchObject({ total: 1, limit_up: 1, limit_down: 0, limitEvaluated: 1, limitUnknown: 0 });
  });

  it('uses separate daily aggregates, close/pre_close direction, ISO dates and signed extrema', async () => {
    const db = database([daily(D, { total: 3, up: 1, down: 1, flat: 1, maxFall: -10 })], [quote(), quote('000001.SZ', 9), quote('300001.SZ', 10)]);
    const result = await readAiRisefall(db, options(supplier([limit(), limit('000001.SZ'), limit('300001.SZ')])));
    expect(result.latestDate).toBe('2026-11-27');
    expect(result.status).toBe('available');
    expect(result.today).toMatchObject({ total: 3, up: 1, down: 1, flat: 1, max_rise: 10, max_fall: -10, limit_up: 1, limit_down: 1, limitEvaluated: 3, limitUnknown: 0 });
  });

  it('discovers actual latest 60 distinct indexed dates before range aggregation, without calendar arithmetic', async () => {
    const dates: string[] = [];
    const cursor = new Date('2026-11-27T00:00:00Z');
    while (dates.length < 60) {
      if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) dates.unshift(cursor.toISOString().slice(0, 10).replace(/-/g, ''));
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    const db = database(dates.map(date => daily(date)), [quote()], [...dates].reverse());
    const result = await readAiRisefall(db, options(supplier()));
    const [discovery, aggregate, details] = db.execute.mock.calls;
    expect(discovery[0]).toMatch(/SELECT DISTINCT d\.trade_date/);
    expect(discovery[0]).toContain('FORCE INDEX (idx_trade_date)');
    expect(discovery[0]).toMatch(/d\.trade_date <= \? ORDER BY d\.trade_date DESC LIMIT 60/);
    expect(discovery[1]).toEqual(['20261128']);
    expect(aggregate[1]).toEqual([dates[0], D]);
    expect(aggregate[0]).toContain('d.trade_date >= ? AND d.trade_date <= ?');
    expect(details[1]).toEqual([D]);
    for (const [sql] of db.execute.mock.calls) expect(sql).not.toMatch(/DATE_SUB|INTERVAL|DATE_FORMAT|STR_TO_DATE/);
    expect(result.periods.map(period => [period.requestedDays, period.total])).toEqual([[5, 5], [20, 20], [60, 60]]);
    expect(result.periods[2].windowStart).toBe(`${dates[0].slice(0, 4)}-${dates[0].slice(4, 6)}-${dates[0].slice(6, 8)}`);
    expect(result.periods[2].windowEnd).toBe('2026-11-27');
  });

  it('uses INNER JOIN/list_status=L and strict fixed code rules for both summary and detail SQL', async () => {
    const db = database();
    await readAiRisefall(db, options());
    for (const [sql] of db.execute.mock.calls.slice(1)) {
      expect(sql).toContain('INNER JOIN ts_stock_basic b ON b.ts_code = d.ts_code');
      expect(sql).toContain("b.list_status = 'L'");
      expect(sql).toContain("REGEXP_LIKE(d.ts_code, '^(600|601|603|605)[0-9]{3}[.]SH$', 'c')");
      expect(sql).toContain("'^(000|001|002|003)[0-9]{3}[.]SZ$'");
      expect(sql).toContain("'^(688|689)[0-9]{3}[.]SH$'");
      expect(sql).toContain("'^(300|301)[0-9]{3}[.]SZ$'");
      expect(sql).not.toMatch(/\bLIKE\b|004|200|900|list_status = 'D'/);
    }
    expect(db.execute.mock.calls[2][0]).toContain('d.close IS NOT NULL AND d.pre_close IS NOT NULL AND d.close > 0 AND d.pre_close > 0');
  });

  it('maps BJ internally and all includes BJ but SH never verifies BJ', async () => {
    const bj = quote('920001.BJ');
    const allDB = database([daily()], [bj]);
    const all = await readAiRisefall(allDB, options(supplier([limit('920001.BJ')])));
    expect(all.today?.limit_up).toBe(1);
    expect(allDB.execute.mock.calls[1][0]).toContain("WHEN REGEXP_LIKE(d.ts_code, '^(43|83|87|88|92)[0-9]{4}[.]BJ$', 'c') THEN 'BJ'");
    const shDB = database([daily()], [bj]);
    const sh = await readAiRisefall(shDB, options(supplier([limit('920001.BJ')]), { market: 'SH' }));
    expect(shDB.execute.mock.calls[1][1]).toEqual([D, D, 'SH']);
    expect(shDB.execute.mock.calls[2][1]).toEqual([D, 'SH']);
    expect(sh.today).toMatchObject({ limit_up: null, limitEvaluated: 0, limitUnknown: 1 });
    expect(shDB.execute.mock.calls[1][0]).not.toMatch(/BJ[^)]*\) THEN 'SH'/);
  });

  it.each(['SZ', 'GEM', 'STAR'] as const)('passes market %s as a bound parameter without widening scope', async market => {
    const db = database();
    await readAiRisefall(db, options(undefined, { market }));
    expect(db.execute.mock.calls[1][1]).toEqual([D, D, market]);
    expect(db.execute.mock.calls[2][1]).toEqual([D, market]);
  });

  it.each(['900001.SH', '200001.SZ', '510300.SH', '159001.SZ', '600000.SSE', ' 600000.SH', '600000.sh', '004001.SZ', '990001.BJ'])('rejects noncanonical/non-A detail %s instead of verified zero', async code => {
    const result = await readAiRisefall(database([daily()], [quote(code)]), options(supplier([limit(code)])));
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ limit_up: null, limit_down: null, limitEvaluated: 0, limitUnknown: 1 });
  });

  it('counts excluded in same scope, with valid prices inside CASE not the aggregate WHERE', async () => {
    const db = database([daily(D, { excluded: 7 })]);
    const result = await readAiRisefall(db, options(supplier()));
    const sql = db.execute.mock.calls[1][0];
    expect(sql).toContain('THEN 0 ELSE 1 END) AS excluded');
    expect(sql).toContain('THEN 1 ELSE 0 END) AS total');
    expect(sql.slice(sql.indexOf(' WHERE '))).not.toMatch(/close IS NOT NULL|pre_close IS NOT NULL/);
    expect(result.today).toMatchObject({ total: 1, excluded: 7 });
  });

  it.each([
    { total: undefined }, { up: null }, { down: '' }, { flat: NaN }, { excluded: undefined },
    { total: -1 }, { up: 0.5 }, { excluded: Number.MAX_SAFE_INTEGER + 1 }, { flat: true },
  ])('rejects missing/non-safe aggregate counts rather than n||0 (%j)', async overrides => {
    await expect(readAiRisefall(database([daily(D, overrides as Partial<Daily>)]), options())).rejects.toThrow(/aggregate count/);
  });

  it('rejects up+down+flat mismatches', async () => {
    await expect(readAiRisefall(database([daily(D, { total: 2 })]), options())).rejects.toThrow(/Inconsistent/);
  });

  it('accepts exact integer count strings without silently inventing numbers', async () => {
    const result = await readAiRisefall(database([daily(D, { total: '1', up: '1', down: '0', flat: '0', excluded: '2' })]), options());
    expect(result.today).toMatchObject({ total: 1, up: 1, down: 0, flat: 0, excluded: 2 });
  });

  it('distinguishes no dates/no market records unavailable from records with no valid quotes insufficient', async () => {
    const noDates = database([], [], []);
    expect((await readAiRisefall(noDates, options())).status).toBe('unavailable');
    expect(noDates.execute).toHaveBeenCalledTimes(1);
    expect((await readAiRisefall(database([], [], [D]), options())).status).toBe('unavailable');
    const invalid = database([daily(D, { total: 0, up: 0, down: 0, flat: 0, excluded: 4 })], []);
    expect(await readAiRisefall(invalid, options())).toMatchObject({ status: 'insufficient', latestDate: null, today: null });
    expect(invalid.execute).toHaveBeenCalledTimes(2);
  });

  it('drops zero-effective dates and uses actual latest valid day for details and ISO windows', async () => {
    const db = database([daily('20261125'), daily('20261126', { total: 0, up: 0, excluded: 2 }), daily(D, { total: 0, up: 0, excluded: 3 })], [quote()]);
    const result = await readAiRisefall(db, options(supplier([limit('600000.SH', 10, 11, 9, '20261125')])));
    expect(result.latestDate).toBe('2026-11-25');
    expect(db.execute.mock.calls[2][1]).toEqual(['20261125']);
    expect(result.periods.map(period => period.total)).toEqual([1, 1, 1]);
    expect(result.periods[0]).toMatchObject({ requestedDays: 5, windowStart: '2026-11-25', windowEnd: '2026-11-25' });
  });

  it('preserves all six bucket labels and exact boundary definitions of daily rising share', async () => {
    const ratios = [29, 30, 40, 50, 60, 70, 71];
    const aggregates = ratios.map((up, i) => daily(`202611${20 + i}`, { total: 100, up, down: 100 - up, flat: 0, maxFall: -1 }));
    const result = await readAiRisefall(database(aggregates, []), options());
    expect(result.periods[1].distribution).toEqual([
      { label: '<30%', count: 1 }, { label: '30~40%', count: 1 }, { label: '40~50%', count: 1 },
      { label: '50~60%', count: 1 }, { label: '60~70%', count: 2 }, { label: '>70%', count: 1 },
    ]);
    expect(result.periods.map(period => period.total)).toEqual([5, 7, 7]);
    expect(result.periods[0].distribution.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(5);
  });

  it('reports maxima only if corresponding rising/falling stocks exist, not flat zeros', async () => {
    const flat = await readAiRisefall(database([daily(D, { up: 0, flat: 1, maxRise: 0, maxFall: 0 })], [quote('600000.SH', 10)]), options(supplier()));
    expect(flat.today).toMatchObject({ max_rise: null, max_fall: null });
    const down = await readAiRisefall(database([daily(D, { up: 0, down: 1, maxRise: 99, maxFall: -10 })], [quote('600000.SH', 9)]), options(supplier()));
    expect(down.today).toMatchObject({ max_rise: null, max_fall: -10 });
  });

  it('rejects invalid/future distinct dates rather than guessing a trade date', async () => {
    for (const date of ['20260230', '2026-11-27', '20261129']) {
      await expect(readAiRisefall(database([], [], [date]), options())).rejects.toThrow(/window date/);
    }
  });

  it('probes stk_limit with pagination inside params and follows actual offsets', async () => {
    const fetchImpl = supplier([...fullPage(), limit('603001.SH')]);
    const result = await readAiRisefall(database(), options(fetchImpl));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchImpl.mock.calls[0][1].body), second = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(first.params).toEqual({ trade_date: D, limit: 5800, offset: 0 });
    expect(second.params).toEqual({ trade_date: D, limit: 5800, offset: 5800 });
    expect(first).not.toHaveProperty('limit'); expect(first).not.toHaveProperty('offset');
    expect(first.api_name).toBe('stk_limit');
    expect(result.status).toBe('available');
  });

  it.each([
    { code: -1, data: { fields: FIELDS, items: [limit()] } },
    { data: { fields: FIELDS, items: [limit()] } },
    { code: '0', data: { fields: FIELDS, items: [limit()] } },
    { code: 0, data: { fields: ['ts_code'], items: [['600000.SH']] } },
    { code: 0, data: { fields: [...FIELDS, 'ts_code'], items: [[...limit(), '600000.SH']] } },
    { code: 0, data: { fields: FIELDS, items: [{ ts_code: '600000.SH' }] } },
    { code: 0, data: { fields: FIELDS, items: [limit().slice(0, 3)] } },
    { code: 0, data: { fields: FIELDS, items: null } },
  ])('requires body.code===0 and exact fields/items shape (%j)', async body => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => body }));
    const result = await readAiRisefall(database(), options(fetchImpl));
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ total: 1, up: 1, limit_up: null, limit_down: null, limitEvaluated: 0, limitUnknown: 1 });
  });

  it.each([
    limit('600000.SH', 10, 10, 9), limit('600000.SH', 10, 11, 10), limit('600000.SH', 10, 9, 11),
    limit('600000.SH', 0, 11, 9), limit('600000.SH', 10, -11, 9), limit('600000.SH', 10, 11, 0),
    limit('600000.SH', 10, 11, 9, '20261126'),
  ].map(item => ({ item })))('requires correct date, positive prices and up>pre>down (%j)', async ({ item }) => {
    const result = await readAiRisefall(database(), options(supplier([item])));
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ limit_up: null, limit_down: null, limitUnknown: 1, limitEvaluated: 0 });
  });

  it('rejects a one-cent local preclose mismatch', async () => {
    const result = await readAiRisefall(database([daily()], [quote('600000.SH', 11, 10.01)]), options(supplier()));
    expect(result.today).toMatchObject({ limit_up: null, limitEvaluated: 0, limitUnknown: 1 });
  });

  it('rejects relative tolerance on expensive stocks and preclose differences above 0.0005', async () => {
    for (const pre of [1000.01, 1000.0006]) {
      const result = await readAiRisefall(database([daily()], [quote('600000.SH', 1100, pre)]), options(supplier([limit('600000.SH', 1000, 1100, 900)])));
      expect(result.today?.limitEvaluated).toBe(0);
    }
  });

  it('matches millesimal prices with only <=0.0005 tolerance', async () => {
    const result = await readAiRisefall(database([daily()], [quote('600000.SH', 11.001, 10.001)]), options(supplier([limit('600000.SH', 10.001, 11.001, 9.001)])));
    expect(result.today).toMatchObject({ limit_up: 1, limit_down: 0, limitEvaluated: 1, limitUnknown: 0 });
  });

  it('does not count a one-cent near-limit close as limit up (verified ordinary rising stock)', async () => {
    const result = await readAiRisefall(database([daily()], [quote('600000.SH', 10.99)]), options(supplier()));
    expect(result.today).toMatchObject({ limit_up: 0, limit_down: 0, limitEvaluated: 1, limitUnknown: 0 });
  });

  it.each([11.001, 8.999])('treats out-of-band close %s as unknown, not verified zero', async close => {
    const falling = close < 10;
    const result = await readAiRisefall(database([daily(D, { up: falling ? 0 : 1, down: falling ? 1 : 0 })], [quote('600000.SH', close)]), options(supplier()));
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ limit_up: null, limit_down: null, limitEvaluated: 0, limitUnknown: 1 });
  });

  it('invalidates conflicting duplicate supplier codes, keeping conflict-free subset evaluation', async () => {
    const db = database([daily(D, { total: 2, up: 2 })], [quote(), quote('600001.SH')]);
    const result = await readAiRisefall(db, options(supplier([limit(), limit('600000.SH', 10, 12, 9), limit('600001.SH')])));
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ limit_up: null, limit_down: null, limitEvaluated: 1, limitUnknown: 1 });
  });

  it('deduplicates identical supplier records without double-counting', async () => {
    const result = await readAiRisefall(database(), options(supplier([limit(), limit()])));
    expect(result.today).toMatchObject({ limit_up: 1, limitEvaluated: 1, limitUnknown: 0 });
  });

  it('duplicate daily detail rows never overcount limits', async () => {
    const result = await readAiRisefall(database([daily()], [quote(), quote()]), options(supplier()));
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ limit_up: null, limitEvaluated: 0, limitUnknown: 1 });
  });

  it('enforces limit_up<=up and limit_down<=down if injected detail and aggregate disagree', async () => {
    const mismatchedUp = await readAiRisefall(database([daily(D, { up: 0, down: 1 })], [quote()]), options(supplier()));
    expect(mismatchedUp.today).toMatchObject({ limit_up: null, limitEvaluated: 0, limitUnknown: 1 });
    const mismatchedDown = await readAiRisefall(database([daily()], [quote('600000.SH', 9)]), options(supplier()));
    expect(mismatchedDown.today).toMatchObject({ limit_down: null, limitEvaluated: 0, limitUnknown: 1 });
  });

  it('missing supplier coverage is partial with exact totals null, never a fake zero', async () => {
    const result = await readAiRisefall(database(), options());
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ total: 1, up: 1, limit_up: null, limit_down: null, limitEvaluated: 0, limitUnknown: 1 });
  });

  it('all-matched local subset remains partial/null when pagination makes no progress', async () => {
    const page = fullPage();
    const fetchImpl = vi.fn(async () => response(page));
    const result = await readAiRisefall(database(), options(fetchImpl));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ limit_up: null, limit_down: null, limitEvaluated: 1, limitUnknown: 0 });
  });

  it('reaching max pages without terminal short page is incomplete even when local code matched', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      const { offset } = JSON.parse(init.body).params;
      const prefixes = [83, 87, 88, 92, 43];
      const items = Array.from({ length: 5800 }, (_, i) => {
        const index = offset + i;
        const code = `${prefixes[Math.floor(index / 10000)]}${String(index % 10000).padStart(4, '0')}.BJ`;
        return limit(code);
      });
      if (offset === 0) items[0] = limit();
      return response(items);
    });
    const result = await readAiRisefall(database(), options(fetchImpl));
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ limit_up: null, limitEvaluated: 1, limitUnknown: 0 });
  });

  it('oversized/truncated page is incomplete instead of accepted as full coverage', async () => {
    const fetchImpl = vi.fn(async () => response([...fullPage(), limit('603001.SH')]));
    const result = await readAiRisefall(database(), options(fetchImpl));
    expect(result.status).toBe('partial');
    expect(result.today?.limit_up).toBeNull();
  });

  it('later page API error preserves daily data and matched subset, but not exact total', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(fullPage())).mockResolvedValueOnce(response([], FIELDS, -1));
    const result = await readAiRisefall(database(), options(fetchImpl));
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ total: 1, up: 1, limit_up: null, limit_down: null, limitEvaluated: 1, limitUnknown: 0 });
  });

  it.each(['network', 'HTTP', 'JSON'])('preserves daily data on supplier %s failure', async failure => {
    const fetchImpl = vi.fn(async () => {
      if (failure === 'network') throw new Error('offline');
      return { ok: failure !== 'HTTP', json: async () => { throw new Error('invalid JSON'); } };
    });
    const result = await readAiRisefall(database(), options(fetchImpl));
    expect(result).toMatchObject({ status: 'partial', latestDate: '2026-11-27', today: { total: 1, up: 1, limit_up: null, limitUnknown: 1 } });
  });

  it('accepts a real-world 5.343-second supplier response without false partial coverage', async () => {
    const fetchImpl = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 5343));
      return response([limit()]);
    });
    const pending = readAiRisefall(database(), options(fetchImpl));
    await vi.advanceTimersByTimeAsync(5343);
    expect(await pending).toMatchObject({ status: 'available', today: { limit_up: 1, limit_down: 0, limitUnknown: 0 } });
  });

  it('8-second total deadline also covers stalled JSON, even if supplier ignores abort', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: any) => ({ ok: true, json: () => new Promise(() => {}) }));
    const pending = readAiRisefall(database(), options(fetchImpl));
    await vi.advanceTimersByTimeAsync(7999);
    let settled = false;
    pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe('partial');
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('8-second deadline covers all pages combined, not eight seconds per page', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      const offset = JSON.parse(init.body).params.offset;
      await new Promise(resolve => setTimeout(resolve, 4500));
      return response(offset === 0 ? fullPage() : []);
    });
    const pending = readAiRisefall(database(), options(fetchImpl));
    await vi.advanceTimersByTimeAsync(8000);
    const result = await pending;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('partial');
    expect(result.today).toMatchObject({ limit_up: null, limitEvaluated: 1, limitUnknown: 0 });
    expect(fetchImpl.mock.calls[1][1].signal.aborted).toBe(true);
  });

  it('8-second deadline covers stalled fetch, without hanging when abort is ignored', async () => {
    const fetchImpl = vi.fn(() => new Promise<any>(() => {}));
    const pending = readAiRisefall(database(), options(fetchImpl));
    await vi.advanceTimersByTimeAsync(8000);
    expect((await pending).today).toMatchObject({ limit_up: null, limitUnknown: 1 });
  });

  it('caches successful results for 90 seconds and refreshes after expiry', async () => {
    const db = database(), fetchImpl = supplier(), config = options(fetchImpl);
    const first = await getAiRisefall(db, config);
    await vi.advanceTimersByTimeAsync(89_999);
    expect(await getAiRisefall(db, config)).toBe(first);
    expect(db.execute).toHaveBeenCalledTimes(3); expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await getAiRisefall(db, config);
    expect(db.execute).toHaveBeenCalledTimes(6); expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps multiple market cache entries while supplier same-date calls are shared', async () => {
    const db = database(), fetchImpl = supplier();
    const all = await getAiRisefall(db, options(fetchImpl));
    const sh = await getAiRisefall(db, options(fetchImpl, { market: 'SH' }));
    expect(all.status).toBe('available'); expect(sh.status).toBe('available');
    expect(db.execute).toHaveBeenCalledTimes(6); expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await getAiRisefall(db, options(fetchImpl))).toBe(all);
    expect(await getAiRisefall(db, options(fetchImpl, { market: 'SH' }))).toBe(sh);
    expect(db.execute).toHaveBeenCalledTimes(6);
  });

  it('deduplicates concurrent result inflight and supplier inflight across markets and DBs', async () => {
    let resolveFetch!: (value: ReturnType<typeof response>) => void;
    const fetchImpl = vi.fn(() => new Promise<ReturnType<typeof response>>(resolve => { resolveFetch = resolve; }));
    const db = database(), secondDB = database();
    const first = getAiRisefall(db, options(fetchImpl));
    const repeat = getAiRisefall(db, options(fetchImpl));
    const sh = getAiRisefall(db, options(fetchImpl, { market: 'SH' }));
    const otherDB = getAiRisefall(secondDB, options(fetchImpl));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(6); expect(secondDB.execute).toHaveBeenCalledTimes(3);
    resolveFetch(response([limit()]));
    const [a, b, c, e] = await Promise.all([first, repeat, sh, otherDB]);
    expect(a).toBe(b); expect(c.status).toBe('available'); expect(e.status).toBe('available');
  });

  it('SHA256 token scope prevents same length/prefix/suffix collision', async () => {
    const db = database(), fetchImpl = supplier();
    await getAiRisefall(db, options(fetchImpl, { token: 'same-AAAA-tail' }));
    await getAiRisefall(db, options(fetchImpl, { token: 'same-BBBB-tail' }));
    expect(db.execute).toHaveBeenCalledTimes(6); expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('separates fetch implementation/database scope and completed cutoff in result cache', async () => {
    const db = database(), fetchA = supplier(), fetchB = supplier();
    const databaseA = {}, databaseB = {};
    await getAiRisefall(db, options(fetchA, { database: databaseA }));
    await getAiRisefall(db, options(fetchB, { database: databaseA }));
    await getAiRisefall(db, options(fetchB, { database: databaseB }));
    await getAiRisefall(db, options(fetchB, { database: databaseB, now: new Date('2026-11-29T08:00:00Z') }));
    expect(db.execute).toHaveBeenCalledTimes(12);
    expect(fetchA).toHaveBeenCalledTimes(1); expect(fetchB).toHaveBeenCalledTimes(1);
    expect(db.execute.mock.calls[9][1]).toEqual(['20261129']);
  });

  it('bounds each DB cache to ten keys (oldest key is evicted, recent keys retained)', async () => {
    const db = database(), fetchImpl = supplier();
    for (let i = 0; i < 11; i++) await getAiRisefall(db, options(fetchImpl, { token: `token-${i}` }));
    const before = db.execute.mock.calls.length;
    await getAiRisefall(db, options(fetchImpl, { token: 'token-10' }));
    expect(db.execute).toHaveBeenCalledTimes(before);
    await getAiRisefall(db, options(fetchImpl, { token: 'token-0' }));
    expect(db.execute).toHaveBeenCalledTimes(before + 3);
  });

  it('partial supplier failure has only <=5sec cooldown, retries and recovers (not cached 90sec)', async () => {
    const db = database();
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response([limit()]));
    const config = options(fetchImpl);
    const failure = await getAiRisefall(db, config);
    expect(failure.status).toBe('partial');
    await vi.advanceTimersByTimeAsync(4999);
    expect(await getAiRisefall(db, config)).toBe(failure);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await getAiRisefall(db, config)).status).toBe('available');
    expect(fetchImpl).toHaveBeenCalledTimes(2); expect(db.execute).toHaveBeenCalledTimes(6);
  });

  it('supplier failure cooldown is shared across markets but result errors never leak wrong market', async () => {
    const db = database();
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response([limit()]));
    const all = await getAiRisefall(db, options(fetchImpl));
    const sh = await getAiRisefall(db, options(fetchImpl, { market: 'SH' }));
    expect(all.status).toBe('partial'); expect(sh.status).toBe('partial');
    expect(db.execute).toHaveBeenCalledTimes(6); expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(db.execute.mock.calls[4][1]).toEqual([D, D, 'SH']);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await getAiRisefall(db, options(fetchImpl, { market: 'SH' }))).status).toBe('available');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('DB errors propagate from read/get, are not cached, and next request can recover', async () => {
    const db = database(), fetchImpl = supplier();
    db.execute.mockRejectedValueOnce(new Error('DB failed'));
    await expect(getAiRisefall(db, options(fetchImpl))).rejects.toThrow('DB failed');
    const result = await getAiRisefall(db, options(fetchImpl));
    expect(result.status).toBe('available'); expect(db.execute).toHaveBeenCalledTimes(4);
    db.execute.mockRejectedValueOnce(new Error('read failed'));
    await expect(readAiRisefall(db, options(fetchImpl))).rejects.toThrow('read failed');
  });

  it('one failed market never replaces another successful market cache', async () => {
    const db = database(), fetchImpl = supplier();
    const all = await getAiRisefall(db, options(fetchImpl));
    db.execute.mockRejectedValueOnce(new Error('SH failed'));
    await expect(getAiRisefall(db, options(fetchImpl, { market: 'SH' }))).rejects.toThrow('SH failed');
    expect(await getAiRisefall(db, options(fetchImpl))).toBe(all);
    expect((await getAiRisefall(db, options(fetchImpl, { market: 'SH' }))).status).toBe('available');
  });

  it('clear test API really clears DB and supplier caches', async () => {
    const db = database(), fetchImpl = supplier();
    await getAiRisefall(db, options(fetchImpl));
    clearAiRisefallCacheForTests();
    await getAiRisefall(db, options(fetchImpl));
    expect(db.execute).toHaveBeenCalledTimes(6); expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
