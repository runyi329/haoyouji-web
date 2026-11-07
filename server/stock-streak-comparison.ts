import { getAShareCompletedCutoff, filterAShareCompletedRows, isValidAShareTradeDate } from '../shared/a-share-completed-days';
import { formatStockComparisonDate, type StockComparisonDb } from './stock-comparison';

export type StockStreakComparisonPeriod = '30' | '60' | '90' | '180' | '365';
export type StockStreakComparisonMarket = 'all' | 'SH' | 'SZ' | 'GEM' | 'STAR' | 'DELISTED';
export interface StockStreakComparisonInput {
  period: StockStreakComparisonPeriod;
  market: StockStreakComparisonMarket;
  keyword?: string;
}
export interface StockStreakComparisonItem { tsCode: string; name: string; days: number }
export interface StockStreakComparisonResult {
  period: StockStreakComparisonPeriod;
  asOf: string | null;
  windowStart: string | null;
  windowTradingDays: number;
  /** UTC instant this successful DB query completed; unchanged on cache hits. */
  fetchedAt: string;
  /** Latest source-row update on asOf across the whole market, normalized UTC. */
  dataUpdatedAt: string | null;
  up: StockStreakComparisonItem[];
  down: StockStreakComparisonItem[];
}

const PERIODS = new Set<string>(['30', '60', '90', '180', '365']);
// These fixed prefixes are equivalent to getStockComparisonMarket. all includes
// other listed A shares; DELISTED includes only D, regardless of code prefix.
const MARKET_SQL: Record<StockStreakComparisonMarket, string> = {
  all: '',
  SH: "AND b.ts_code LIKE '6%' AND b.ts_code NOT LIKE '688%'",
  SZ: "AND b.ts_code LIKE '0%'",
  GEM: "AND (b.ts_code LIKE '300%' OR b.ts_code LIKE '301%')",
  STAR: "AND b.ts_code LIKE '688%'",
  DELISTED: '',
};
const CACHE_TTL_MS = 90_000;
const MAX_CACHE_KEYS = 12;
const MAX_IN_FLIGHT_KEYS = 12;
const TOP_LIMIT = 100;
type Row = Record<string, unknown>;
type DbCache = {
  results: Map<string, { value: StockStreakComparisonResult; expiresAt: number }>;
  inFlight: Map<string, Promise<StockStreakComparisonResult>>;
};
const dbCaches = new WeakMap<StockComparisonDb, DbCache>();

/** Pure reference for the SQL's flat/unknown semantics, over actual source rows.
 * Call with rows already limited to the common window, not lifecycle history.
 * Finite decimal strings/numbers are valid; missing/blank/non-numeric quotes break.
 * No weekend/suspension rows are manufactured; same-date samples are deduplicated.
 */
export function getStockStreakLengths(
  rows: readonly { tradeDate: unknown; pctChange: unknown }[], cutoff: string,
): { upDays: number; downDays: number } {
  const completed = filterAShareCompletedRows(rows, row => row.tradeDate, cutoff)
    .sort((a, b) => String(a.tradeDate).localeCompare(String(b.tradeDate)));
  let upDays = 0, downDays = 0, length = 0, previous = 0;
  for (const row of completed) {
    const value = row.pctChange;
    const numeric = typeof value === 'number'
      || (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value));
    const pct = numeric ? Number(value) : NaN;
    if (!Number.isFinite(pct)) { length = 0; previous = 0; continue; }
    if (pct === 0) continue;
    const direction = pct > 0 ? 1 : -1;
    length = direction === previous ? length + 1 : 1;
    previous = direction;
    if (direction === 1) upDays = Math.max(upDays, length);
    else downDays = Math.max(downDays, length);
  }
  return { upDays, downDays };
}

async function selectRows(db: StockComparisonDb, sql: string, params: any[]): Promise<Row[]> {
  // Do not use the ORM/tagged SQL adapter or initialize a connection here.
  // All queries below start SELECT (no WITH, DDL, lifecycle table or collection).
  if (!/^\s*SELECT\s/i.test(sql)) throw new TypeError('Stock streak query must be SELECT');
  const result = await db.execute(sql, params);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows) || !rows.every(row => row !== null && typeof row === 'object' && !Array.isArray(row))) {
    throw new TypeError('Unexpected stock streak SELECT result');
  }
  return rows as Row[];
}

function count(value: unknown, windowDays: number): number {
  if ((typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'bigint')
    || (typeof value === 'string' && value.trim() === '')) {
    throw new TypeError('Invalid stock streak count');
  }
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days < 0 || days > windowDays) {
    throw new TypeError('Invalid stock streak count');
  }
  return days;
}

function compareItems(a: StockStreakComparisonItem, b: StockStreakComparisonItem): number {
  return b.days - a.days || (a.tsCode < b.tsCode ? -1 : a.tsCode > b.tsCode ? 1 : 0);
}

async function queryStreakComparison(
  db: StockComparisonDb, input: StockStreakComparisonInput, keyword: string, cutoff: string,
): Promise<StockStreakComparisonResult> {
  // Global window discovery is intentionally independent of market/keyword and
  // stock suspensions. N <= 365 is an allowlisted literal, not interpolated input.
  // Existing date index, VARCHAR(8) YYYYMMDD: no function wraps indexed trade_date.
  const dates = await selectRows(db, `
    SELECT DISTINCT d.trade_date
    FROM ts_daily AS d FORCE INDEX (idx_trade_date)
    WHERE d.trade_date <= ?
    ORDER BY d.trade_date DESC
    LIMIT ${Number(input.period)}
  `, [cutoff]);
  const tradeDates = dates.map(row => {
    if (!isValidAShareTradeDate(row.trade_date) || row.trade_date > cutoff) {
      throw new TypeError('Invalid stock streak window trade_date');
    }
    return row.trade_date;
  });
  if (tradeDates.length > Number(input.period)
    || tradeDates.some((date, index) => index > 0 && date >= tradeDates[index - 1])) {
    throw new TypeError('Invalid stock streak window ordering/size');
  }
  const result: StockStreakComparisonResult = {
    period: input.period, asOf: null, windowStart: null, windowTradingDays: tradeDates.length,
    fetchedAt: new Date().toISOString(),
    dataUpdatedAt: null,
    up: [], down: [],
  };
  if (tradeDates.length === 0) return result;
  const end = tradeDates[0], start = tradeDates[tradeDates.length - 1];
  result.asOf = formatStockComparisonDate(end);
  result.windowStart = formatStockComparisonDate(start);
  const params: any[] = [start, end, input.market === 'DELISTED' ? 'D' : 'L'];
  // Explicit ! escape works even with NO_BACKSLASH_ESCAPES. Backslash remains a
  // literal; %, _ and ! cannot turn a keyword into LIKE wildcards. Both fields
  // are bound parameters, never SQL concatenation of user text.
  const keywordSql = keyword ? "AND (b.ts_code LIKE ? ESCAPE '!' OR b.name LIKE ? ESCAPE '!')" : '';
  if (keyword) {
    const pattern = `%${keyword.replace(/[!%_]/g, '!$&')}%`;
    params.push(pattern, pattern);
  }

  // ts_daily.pct_chg is the existing DECIMAL(10,4) column (sync_early.py), not a
  // string quote column: nonnumeric/nonfinite values cannot exist in that type.
  // CASE's ELSE NULL treats SQL unknowns as breakers, never COALESCE(..., 0).
  // Remove *only* valid flat quotes before ROW_NUMBER. Keep NULL in both window
  // sequences so the difference changes after every unknown/opposite quote.
  // Each constant (direction, difference) island is one run; count excludes flat
  // quotes. A missing daily row does not add a day and does not invent a breaker.
  // Nested SELECTs (not WITH) are compatible with stable db.execute. Inner scan
  // is bounded to the same last-N-date range. Only the union of both top 100
  // sets leaves SQL; both ranks use code ASC to resolve ties deterministically.
  const rows = await selectRows(db, `
    SELECT ranked.ts_code, ranked.name, ranked.up_days, ranked.down_days
    FROM (
      SELECT maxima.*,
             ROW_NUMBER() OVER (ORDER BY maxima.up_days DESC, maxima.ts_code ASC) AS up_rank,
             ROW_NUMBER() OVER (ORDER BY maxima.down_days DESC, maxima.ts_code ASC) AS down_rank
      FROM (
        SELECT runs.ts_code, runs.name,
               MAX(CASE WHEN runs.direction = 1 THEN runs.days ELSE 0 END) AS up_days,
               MAX(CASE WHEN runs.direction = -1 THEN runs.days ELSE 0 END) AS down_days
        FROM (
          SELECT segmented.ts_code, segmented.name, segmented.direction, segmented.streak_group,
                 COUNT(*) AS days
          FROM (
            SELECT observed.*,
                   ROW_NUMBER() OVER (PARTITION BY observed.ts_code ORDER BY observed.trade_date)
                   - ROW_NUMBER() OVER (PARTITION BY observed.ts_code, observed.direction ORDER BY observed.trade_date)
                     AS streak_group
            FROM (
              SELECT classified.*
              FROM (
                SELECT d.ts_code, b.name, d.trade_date,
                       CASE WHEN d.pct_chg > 0 THEN 1
                            WHEN d.pct_chg < 0 THEN -1
                            WHEN d.pct_chg = 0 THEN 0 ELSE NULL END AS direction
                FROM ts_daily AS d FORCE INDEX (idx_trade_date)
                INNER JOIN ts_stock_basic AS b ON b.ts_code = d.ts_code
                WHERE d.trade_date >= ? AND d.trade_date <= ?
                  AND b.list_status = ? ${MARKET_SQL[input.market]}
                  ${keywordSql}
              ) AS classified
              WHERE classified.direction IS NULL OR classified.direction <> 0
            ) AS observed
          ) AS segmented
          WHERE segmented.direction IS NOT NULL
          GROUP BY segmented.ts_code, segmented.name, segmented.direction, segmented.streak_group
        ) AS runs
        GROUP BY runs.ts_code, runs.name
      ) AS maxima
    ) AS ranked
    WHERE (ranked.up_days > 0 AND ranked.up_rank <= 100)
       OR (ranked.down_days > 0 AND ranked.down_rank <= 100)
    ORDER BY ranked.ts_code ASC
  `, params);
  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row.ts_code !== 'string' || row.ts_code.length === 0 || seen.has(row.ts_code)
      || typeof row.name !== 'string') throw new TypeError('Invalid stock streak identity');
    seen.add(row.ts_code);
    const upDays = count(row.up_days, tradeDates.length), downDays = count(row.down_days, tradeDates.length);
    if (upDays > 0) result.up.push({ tsCode: row.ts_code, name: row.name, days: upDays });
    if (downDays > 0) result.down.push({ tsCode: row.ts_code, name: row.name, days: downDays });
  }
  result.up = result.up.sort(compareItems).slice(0, TOP_LIMIT);
  result.down = result.down.sort(compareItems).slice(0, TOP_LIMIT);

  // stock-daily-scanner.ts writes the verified updated_at column with NOW().
  // Normalize that session-calendar DATETIME in SQL (never mysql2 Date parsing),
  // using the session offset from UTC. Index equality reads just the market end
  // day's rows; filters do not change this source-wide update timestamp. Missing
  // column/query errors propagate; never substitute query time or fake freshness.
  const timestamps = await selectRows(db, `
    SELECT DATE_FORMAT(
             DATE_SUB(MAX(d.updated_at), INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND),
             '%Y-%m-%dT%H:%i:%sZ'
           ) AS data_updated_at
    FROM ts_daily AS d FORCE INDEX (idx_trade_date)
    WHERE d.trade_date = ?
  `, [end]);
  if (timestamps.length !== 1) throw new TypeError('Invalid stock streak source timestamp result');
  const updatedAt = timestamps[0].data_updated_at;
  if (updatedAt !== null && (typeof updatedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(updatedAt)
    || !Number.isFinite(Date.parse(updatedAt))
    || new Date(updatedAt).toISOString() !== updatedAt.replace('Z', '.000Z'))) {
    throw new TypeError('Invalid stock streak source timestamp');
  }
  result.dataUpdatedAt = updatedAt as string | null;
  result.fetchedAt = new Date().toISOString();
  return result;
}

/** Inject a stable mysql2 connection/pool identity. Only last N completed actual
 * market dates, never lifecycle or full history. Successful results cache for
 * 90 seconds (12 LRU keys/DB); errors are retryable. In-flight queries deduplicate
 * by period + market + literal keyword + completed cutoff, with at most 12 active
 * keys per DB; extra distinct requests wait for a slot rather than growing a map.
 */
export async function getStockStreakComparison(
  db: StockComparisonDb, input: StockStreakComparisonInput,
): Promise<StockStreakComparisonResult> {
  if (!input || !PERIODS.has(input.period)) throw new RangeError('Unsupported stock streak period');
  if (!Object.prototype.hasOwnProperty.call(MARKET_SQL, input.market)) {
    throw new RangeError('Unsupported stock streak market');
  }
  if (input.keyword !== undefined && typeof input.keyword !== 'string') {
    throw new TypeError('Invalid stock streak keyword');
  }
  const keyword = (input.keyword ?? '').trim();
  // Snapshot inputs before awaiting admission, so caller mutation cannot change
  // the SQL under a previously assigned cache key.
  const snapshot = { period: input.period, market: input.market };
  const cutoff = getAShareCompletedCutoff();
  const key = JSON.stringify([snapshot.period, snapshot.market, keyword, cutoff]);
  let cache = dbCaches.get(db);
  if (!cache) {
    cache = { results: new Map(), inFlight: new Map() };
    dbCaches.set(db, cache);
  }
  for (;;) {
    const now = Date.now();
    for (const [cachedKey, entry] of cache.results) {
      if (entry.expiresAt <= now) cache.results.delete(cachedKey);
    }
    const cached = cache.results.get(key);
    if (cached) {
      cache.results.delete(key);
      cache.results.set(key, cached);
      return cached.value;
    }
    const pending = cache.inFlight.get(key);
    if (pending) return pending;
    if (cache.inFlight.size < MAX_IN_FLIGHT_KEYS) break;
    // Recheck both result/dedup maps after admission; a rejected unrelated request
    // only releases its slot, never fails this request or caches a fake result.
    await Promise.race(Array.from(cache.inFlight.values(), promise => promise.then(() => undefined, () => undefined)));
  }
  const pending = queryStreakComparison(db, snapshot, keyword, cutoff).then(value => {
    cache.results.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    while (cache.results.size > MAX_CACHE_KEYS) {
      const oldest = cache.results.keys().next().value;
      if (oldest === undefined) break;
      cache.results.delete(oldest);
    }
    return value;
  }).finally(() => { cache.inFlight.delete(key); });
  cache.inFlight.set(key, pending);
  return pending;
}
