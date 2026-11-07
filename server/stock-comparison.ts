import {
  getAShareCompletedCutoff,
  isValidAShareTradeDate,
} from '../shared/a-share-completed-days';

export type StockComparisonPeriod = '30' | '60' | '90' | '180' | '365' | 'lifetime';
export type StockComparisonMarket = 'SH' | 'SZ' | 'GEM' | 'STAR' | 'OTHER';

/** Inject a stable mysql2 connection/pool adapter; never initialize a DB here. */
export interface StockComparisonDb {
  execute(sql: string, params?: any[]): Promise<unknown>;
}

export interface StockComparisonItem {
  tsCode: string;
  name: string;
  listStatus: string;
  market: StockComparisonMarket;
  upDays: number;
  downDays: number;
  flatDays: number;
  totalDays: number;
  upRate: number;
  downRate: number;
  flatRate: number;
  lastTradeDate: string | null;
  updatedAt: string | null;
}

export interface StockComparisonResult {
  period: StockComparisonPeriod;
  asOf: string | null;
  windowStart: string | null;
  windowTradingDays: number | null;
  /** Generation's Beijing calendar date, YYYY-MM-DD; not a market cutoff. */
  generatedAt: string;
  source: 'daily' | 'lifecycle';
  items: StockComparisonItem[];
}

const PERIODS = new Set<string>(['30', '60', '90', '180', '365', 'lifetime']);
const CACHE_TTL_MS = 90_000;
const MAX_CACHE_KEYS = 12;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
type Row = Record<string, unknown>;
type CacheEntry = { value: StockComparisonResult; expiresAt: number };
type DbCache = {
  results: Map<string, CacheEntry>;
  inFlight: Map<string, Promise<StockComparisonResult>>;
};
// Scope cache by executor identity: separate databases must not share results.
// Only successful results are cached; errors propagate and remain retryable.
const dbCaches = new WeakMap<StockComparisonDb, DbCache>();

export function getStockComparisonMarket(tsCode: string): StockComparisonMarket {
  if (tsCode.startsWith('688')) return 'STAR';
  if (tsCode.startsWith('300') || tsCode.startsWith('301')) return 'GEM';
  if (tsCode.startsWith('6')) return 'SH';
  if (tsCode.startsWith('0')) return 'SZ';
  return 'OTHER';
}

/** Normalize source dates only; never substitute today's date for a missing date. */
export function formatStockComparisonDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const compact = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, '') : value;
  if (!isValidAShareTradeDate(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function count(value: unknown, column: string): number {
  if ((typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'bigint')
    || (typeof value === 'string' && value.trim() === '')) {
    throw new TypeError(`Invalid stock comparison count: ${column}`);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new TypeError(`Invalid stock comparison count: ${column}`);
  }
  return result;
}

/** Recompute from actual counts, not stored up_rate or the requested window length. */
export function getStockComparisonRates(
  upDays: number, downDays: number, flatDays: number, totalDays: number,
): { upRate: number; downRate: number; flatRate: number } {
  return {
    upRate: totalDays > 0 ? upDays / totalDays * 100 : 0,
    downRate: totalDays > 0 ? downDays / totalDays * 100 : 0,
    flatRate: totalDays > 0 ? flatDays / totalDays * 100 : 0,
  };
}

async function selectRows(db: StockComparisonDb, sql: string, params: any[] = []): Promise<Row[]> {
  const result = await db.execute(sql, params);
  // mysql2's [rows, fields] (also [rows] in adapters); direct row arrays are accepted.
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows) || !rows.every(row => row !== null && typeof row === 'object' && !Array.isArray(row))) {
    throw new TypeError('Unexpected stock comparison SELECT result');
  }
  return rows as Row[];
}

function toItem(row: Row, source: 'daily' | 'lifecycle'): StockComparisonItem {
  const tsCode = String(row.ts_code ?? '');
  const upDays = count(row.up_days, 'up_days');
  const downDays = count(row.down_days, 'down_days');
  const flatDays = count(row.flat_days, 'flat_days');
  const totalDays = count(row.total_days, 'total_days');
  return {
    tsCode,
    name: String(row.name ?? ''),
    listStatus: String(row.list_status ?? ''),
    market: getStockComparisonMarket(tsCode),
    upDays, downDays, flatDays, totalDays,
    ...getStockComparisonRates(upDays, downDays, flatDays, totalDays),
    lastTradeDate: source === 'daily' ? formatStockComparisonDate(row.last_trade_date) : null,
    updatedAt: source === 'lifecycle' ? formatStockComparisonDate(row.updated_at) : null,
  };
}

function generatedDate(): string {
  return new Date(Date.now() + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

async function queryComparison(
  db: StockComparisonDb, period: StockComparisonPeriod, cutoff: string,
): Promise<StockComparisonResult> {
  if (period === 'lifetime') {
    // Historical cache, NOT a uniformly completed-through-today snapshot.
    // updated_at is the row's real cache refresh date, NEVER an asOf/lastTradeDate.
    // DATE_FORMAT keeps the DB's calendar date without a driver's timezone conversion.
    const rows = await selectRows(db, `
      SELECT l.ts_code, b.name, b.list_status,
             l.up_days, l.down_days, l.flat_days, l.total_days,
             DATE_FORMAT(l.updated_at, '%Y-%m-%d') AS updated_at
      FROM ts_stock_lifecycle AS l
      INNER JOIN ts_stock_basic AS b ON b.ts_code = l.ts_code
      WHERE b.list_status IN ('L', 'D') AND l.total_days > 0
      ORDER BY l.ts_code
    `);
    return {
      period, asOf: null, windowStart: null, windowTradingDays: null,
      generatedAt: generatedDate(), source: 'lifecycle',
      items: rows.map(row => toItem(row, 'lifecycle')),
    };
  }

  // LIMIT is a literal from the checked period enum, never unchecked user input.
  // VARCHAR(8) YYYYMMDD dates stay sargable: no functions on trade_date.
  // Read at most N distinct dates using the existing single-column date index.
  const dates = await selectRows(db, `
    SELECT DISTINCT d.trade_date
    FROM ts_daily AS d FORCE INDEX (idx_trade_date)
    WHERE d.trade_date <= ?
    ORDER BY d.trade_date DESC
    LIMIT ${Number(period)}
  `, [cutoff]);
  const tradeDates = dates.map(row => {
    if (!isValidAShareTradeDate(row.trade_date) || row.trade_date > cutoff) {
      throw new TypeError('Invalid stock comparison window trade_date');
    }
    return row.trade_date;
  });
  if (tradeDates.length === 0) {
    return {
      period, asOf: null, windowStart: null, windowTradingDays: 0,
      generatedAt: generatedDate(), source: 'daily', items: [],
    };
  }
  const end = tradeDates[0];
  const start = tradeDates[tradeDates.length - 1];

  // One all-market aggregation over the same actual trading-day window.
  // SUM(CASE ...) does NOT classify NULL pct_chg as flat; COUNT(pct_chg)
  // excludes unknown values from the denominator. MAX preserves each stock's
  // own last recorded date in this window (e.g. suspension), not the market end.
  // Stocks with no rows in the window are not fabricated from another period.
  const rows = await selectRows(db, `
    SELECT d.ts_code, b.name, b.list_status,
           SUM(CASE WHEN d.pct_chg > 0 THEN 1 ELSE 0 END) AS up_days,
           SUM(CASE WHEN d.pct_chg < 0 THEN 1 ELSE 0 END) AS down_days,
           SUM(CASE WHEN d.pct_chg = 0 THEN 1 ELSE 0 END) AS flat_days,
           COUNT(d.pct_chg) AS total_days,
           MAX(d.trade_date) AS last_trade_date
    FROM ts_daily AS d FORCE INDEX (idx_trade_date)
    INNER JOIN ts_stock_basic AS b ON b.ts_code = d.ts_code
    WHERE d.trade_date >= ? AND d.trade_date <= ?
      AND b.list_status IN ('L', 'D')
    GROUP BY d.ts_code, b.name, b.list_status
    ORDER BY d.ts_code
  `, [start, end]);
  return {
    period, asOf: formatStockComparisonDate(end), windowStart: formatStockComparisonDate(start),
    windowTradingDays: tradeDates.length, generatedAt: generatedDate(), source: 'daily',
    items: rows.map(row => toItem(row, 'daily')),
  };
}

/**
 * Read-only stock comparison; only injected db.execute is used.
 * Recent: global last N distinct completed trading dates, actual per-stock valid
 * samples. Lifetime: existing historical cache, NOT today's unified market cutoff;
 * UI must disclose this distinction. All date strings have YYYY-MM-DD precision.
 * 90s successful-result LRU cache (max 12 keys per DB), with in-flight deduplication.
 */
export async function getStockComparison(
  db: StockComparisonDb, input: { period: StockComparisonPeriod },
): Promise<StockComparisonResult> {
  if (!input || !PERIODS.has(input.period)) {
    throw new RangeError('Unsupported stock comparison period');
  }
  const cutoff = getAShareCompletedCutoff();
  const key = `${input.period}:${cutoff}`;
  let cache = dbCaches.get(db);
  if (!cache) {
    cache = { results: new Map(), inFlight: new Map() };
    dbCaches.set(db, cache);
  }
  const now = Date.now();
  for (const [cachedKey, entry] of cache.results) {
    if (entry.expiresAt <= now) cache.results.delete(cachedKey);
  }
  const cached = cache.results.get(key);
  if (cached) {
    // Touch the insertion order to maintain LRU eviction.
    cache.results.delete(key);
    cache.results.set(key, cached);
    return cached.value;
  }
  const pending = cache.inFlight.get(key);
  if (pending) return pending;
  const pendingQuery = queryComparison(db, input.period, cutoff).then(value => {
    cache.results.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    while (cache.results.size > MAX_CACHE_KEYS) {
      const oldest = cache.results.keys().next().value;
      if (oldest === undefined) break;
      cache.results.delete(oldest);
    }
    return value;
  }).finally(() => {
    cache.inFlight.delete(key);
  });
  cache.inFlight.set(key, pendingQuery);
  return pendingQuery;
}
