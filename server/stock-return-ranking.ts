import {
  getAShareCompletedCutoff,
  isValidAShareTradeDate,
} from "../shared/a-share-completed-days";
import {
  formatStockComparisonDate,
  type StockComparisonDb,
} from "./stock-comparison";

export type StockReturnRankingMarket =
  | "all"
  | "SH"
  | "SZ"
  | "GEM"
  | "STAR"
  | "DELISTED";
export type StockReturnRankingPeriod =
  | "1w"
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "3y"
  | "all";
export interface StockReturnRankingInput {
  /** Legacy actual-trading-day count, 1..100; mutually exclusive with period. */
  days?: number;
  /** Natural-date interval; defaults to 1m only when days is also absent. */
  period?: StockReturnRankingPeriod;
  topN: number;
  direction: "up" | "down";
  market: StockReturnRankingMarket;
  keyword?: string;
  ledgerId?: number;
}
export interface StockReturnRankingItem {
  tsCode: string;
  name: string;
  listStatus: string;
  returnPercent: number;
  sampleDays: number;
  firstTradeDate: string;
  lastTradeDate: string;
  firstPreClose: number;
  lastClose: number;
}
export interface StockReturnRankingResult {
  /** Requested legacy N, or actual common windowTradingDays in period mode. */
  days: number;
  period?: StockReturnRankingPeriod;
  /** Inclusive natural-date boundary, not the first cached trading date; all/legacy: null. */
  requestedStart: string | null;
  coverageNote: string | null;
  topN: number;
  direction: "up" | "down";
  market: StockReturnRankingMarket;
  asOf: string | null;
  windowStart: string | null;
  windowTradingDays: number;
  /** Known source-date window available; NOT independent exchange-calendar verification. */
  completeWindow: boolean;
  /** Complete matching stocks before sign/topN filtering; all uses each stock's own listing window. */
  eligibleCount: number;
  /** Incomplete matching stocks, including stocks without any window rows. */
  excludedCount: number;
  items: StockReturnRankingItem[];
  /** Latest actual source update on asOf across the whole market, normalized UTC. */
  dataUpdatedAt: string | null;
  /** UTC instant the successful query finished; unchanged on cache hits. */
  fetchedAt: string;
  method: "daily-reference-compound";
}

// Same prefix rules as stock-streak-comparison / getStockComparisonMarket.
// all includes OTHER listed shares; DELISTED accepts only D irrespective of code.
const MARKET_SQL: Record<StockReturnRankingMarket, string> = {
  all: "",
  SH: "AND b.ts_code LIKE '6%' AND b.ts_code NOT LIKE '688%'",
  SZ: "AND b.ts_code LIKE '0%'",
  GEM: "AND (b.ts_code LIKE '300%' OR b.ts_code LIKE '301%')",
  STAR: "AND b.ts_code LIKE '688%'",
  DELISTED: "",
};
const CACHE_TTL_MS = 90_000;
const PERIOD_CACHE_TTL_MS = 5 * 60_000;
const PERIODS = new Set<StockReturnRankingPeriod>([
  "1w",
  "1m",
  "3m",
  "6m",
  "1y",
  "3y",
  "all",
]);
const PERIOD_COVERAGE_NOTE =
  "仅完整可用日线参与；缺失/停牌样本排除。交易日集合来自真实已缓存日线，未经独立交易日历核验。";
const ALL_COVERAGE_NOTE =
  "仅完整可用日线参与；缺失/停牌样本排除，历史补全尚未全部完成。按各股有效上市日起核验已缓存日期集；全市场缓存日期集未经独立交易日历核验，不代表所有股票历史完整。";
const MAX_CACHE_KEYS = 12;
const MAX_IN_FLIGHT_KEYS = 12;
type Row = Record<string, unknown>;
type LegacyInput = StockReturnRankingInput & { days: number };
type PeriodSource = {
  tradeDates: string[];
  requestedStart: string | null;
  rows: Row[];
  dataUpdatedAt: string | null;
  fetchedAt: string;
};
type DbCache = {
  results: Map<string, { value: StockReturnRankingResult; expiresAt: number }>;
  inFlight: Map<string, Promise<StockReturnRankingResult>>;
  sources: Map<string, { value: PeriodSource; expiresAt: number }>;
  sourceInFlight: Map<string, Promise<PeriodSource>>;
};
const dbCaches = new WeakMap<StockComparisonDb, DbCache>();

async function selectRows(
  db: StockComparisonDb,
  sql: string,
  params: any[]
): Promise<Row[]> {
  if (!/^\s*SELECT\s/i.test(sql))
    throw new TypeError("Stock return ranking query must be SELECT");
  const result = await db.execute(sql, params);
  const rows =
    Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (
    !Array.isArray(rows) ||
    !rows.every(
      row => row !== null && typeof row === "object" && !Array.isArray(row)
    )
  ) {
    throw new TypeError("Unexpected stock return ranking SELECT result");
  }
  return rows as Row[];
}

function aggregateCount(value: unknown): number {
  // LEFT JOIN's NULL is a stock with no window rows, not a manufactured sample.
  if (value === null) return 0;
  if (
    (typeof value !== "number" &&
      typeof value !== "string" &&
      typeof value !== "bigint") ||
    (typeof value === "string" && !/^\d+$/.test(value))
  ) {
    throw new TypeError("Invalid stock return ranking aggregate count");
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    throw new TypeError("Invalid stock return ranking aggregate count");
  return result;
}

function finiteNumber(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
  )
    return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

async function queryRanking(
  db: StockComparisonDb,
  input: LegacyInput,
  keyword: string,
  cutoff: string
): Promise<StockReturnRankingResult> {
  // A checked integer literal LIMIT, globally independent of stock/market/search.
  // Sargable YYYYMMDD source dates; do not discover a stock's listing-era history.
  const dates = await selectRows(
    db,
    `
    SELECT DISTINCT d.trade_date
    FROM ts_daily AS d FORCE INDEX (idx_trade_date)
    WHERE d.trade_date <= ?
    ORDER BY d.trade_date DESC
    LIMIT ${input.days}
  `,
    [cutoff]
  );
  const tradeDates = dates.map(row => {
    if (!isValidAShareTradeDate(row.trade_date) || row.trade_date > cutoff) {
      throw new TypeError("Invalid stock return ranking window trade_date");
    }
    return row.trade_date;
  });
  if (
    tradeDates.length > input.days ||
    tradeDates.some((date, i) => i > 0 && date >= tradeDates[i - 1])
  ) {
    throw new TypeError("Invalid stock return ranking window ordering/size");
  }
  const result: StockReturnRankingResult = {
    days: input.days,
    requestedStart: null,
    coverageNote: null,
    topN: input.topN,
    direction: input.direction,
    market: input.market,
    asOf: null,
    windowStart: null,
    windowTradingDays: tradeDates.length,
    completeWindow: tradeDates.length === input.days,
    eligibleCount: 0,
    excludedCount: 0,
    items: [],
    dataUpdatedAt: null,
    fetchedAt: new Date().toISOString(),
    method: "daily-reference-compound",
  };
  if (tradeDates.length === 0) return result;
  const end = tradeDates[0],
    start = tradeDates[tradeDates.length - 1];
  result.asOf = formatStockComparisonDate(end);
  result.windowStart = formatStockComparisonDate(start);

  const params: any[] = [
    start,
    end,
    start,
    end,
    ...tradeDates,
    input.market === "DELISTED" ? "D" : "L",
  ];
  const keywordSql = keyword
    ? "AND (b.ts_code LIKE ? ESCAPE '!' OR b.name LIKE ? ESCAPE '!')"
    : "";
  if (keyword) {
    // ! is explicit and works with NO_BACKSLASH_ESCAPES; all user text is bound.
    const pattern = `%${keyword.replace(/[!%_]/g, "!$&")}%`;
    params.push(pattern, pattern);
  }

  // close/pre_close are the existing DECIMAL(10,3) price columns, so NULL/nonpositive prices are
  // invalid; nonnumeric/nonfinite values cannot inhabit these numeric columns.
  // SUM(log(ratio)) then expm1 implements product(close/pre_close)-1, NOT SUM
  // pct_chg or a raw first/last close ratio. 1e0 forces floating-point division
  // before LN, avoiding MySQL DECIMAL division's fractional-scale truncation.
  // Retain Tushare's pre_close reference (including its adjustments); this is
  // NOT a claim of cash-dividend-reinvested total return or independently adjusted prices.
  // Only summaries cross the DB boundary. LEFT JOIN counts even no-sample stocks
  // as excluded. The date-index range bounds one daily scan; IN pins the exact
  // discovered window, so an intervening insert cannot substitute another date.
  const rows = await selectRows(
    db,
    `
    SELECT b.ts_code, b.name, b.list_status,
           a.row_days, a.distinct_days, a.sample_days, a.log_return,
           a.first_trade_date, a.last_trade_date, a.first_pre_close, a.last_close
    FROM ts_stock_basic AS b
    LEFT JOIN (
      SELECT d.ts_code,
             COUNT(*) AS row_days,
             COUNT(DISTINCT d.trade_date) AS distinct_days,
             COUNT(CASE WHEN d.close > 0 AND d.pre_close > 0 THEN 1 ELSE NULL END) AS sample_days,
             SUM(CASE WHEN d.close > 0 AND d.pre_close > 0
                      THEN LN(d.close / (d.pre_close * 1e0)) ELSE NULL END) AS log_return,
             MIN(d.trade_date) AS first_trade_date,
             MAX(d.trade_date) AS last_trade_date,
             MAX(CASE WHEN d.trade_date = ? THEN d.pre_close ELSE NULL END) AS first_pre_close,
             MAX(CASE WHEN d.trade_date = ? THEN d.close ELSE NULL END) AS last_close
      FROM ts_daily AS d FORCE INDEX (idx_trade_date)
      WHERE d.trade_date >= ? AND d.trade_date <= ?
        AND d.trade_date IN (${tradeDates.map(() => "?").join(", ")})
      GROUP BY d.ts_code
    ) AS a ON a.ts_code = b.ts_code
    WHERE b.list_status = ? ${MARKET_SQL[input.market]}
      ${keywordSql}
    ORDER BY b.ts_code ASC
  `,
    params
  );
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      typeof row.ts_code !== "string" ||
      !row.ts_code ||
      seen.has(row.ts_code) ||
      typeof row.name !== "string" ||
      typeof row.list_status !== "string" ||
      row.list_status !== (input.market === "DELISTED" ? "D" : "L")
    ) {
      throw new TypeError("Invalid stock return ranking identity");
    }
    seen.add(row.ts_code);
    const rowDays = aggregateCount(row.row_days),
      distinctDays = aggregateCount(row.distinct_days);
    const sampleDays = aggregateCount(row.sample_days);
    if (distinctDays > rowDays || sampleDays > rowDays) {
      throw new TypeError("Inconsistent stock return ranking aggregate count");
    }
    const logReturn = finiteNumber(row.log_return);
    const firstPreClose = finiteNumber(row.first_pre_close),
      lastClose = finiteNumber(row.last_close);
    const returnPercent =
      logReturn === null ? NaN : Math.expm1(logReturn) * 100;
    if (
      !result.completeWindow ||
      rowDays !== input.days ||
      distinctDays !== input.days ||
      sampleDays !== input.days ||
      row.first_trade_date !== start ||
      row.last_trade_date !== end ||
      firstPreClose === null ||
      firstPreClose <= 0 ||
      lastClose === null ||
      lastClose <= 0 ||
      !Number.isFinite(returnPercent)
    ) {
      result.excludedCount++;
      continue;
    }
    result.eligibleCount++;
    if (input.direction === "up" ? returnPercent <= 0 : returnPercent >= 0)
      continue;
    result.items.push({
      tsCode: row.ts_code,
      name: row.name,
      listStatus: row.list_status,
      returnPercent,
      sampleDays,
      firstTradeDate: result.windowStart!,
      lastTradeDate: result.asOf!,
      firstPreClose,
      lastClose,
    });
  }
  result.items.sort(
    (a, b) =>
      (input.direction === "up"
        ? b.returnPercent - a.returnPercent
        : a.returnPercent - b.returnPercent) ||
      (a.tsCode < b.tsCode ? -1 : a.tsCode > b.tsCode ? 1 : 0)
  );
  result.items = result.items.slice(0, input.topN);

  // Same source-time normalization as streak service: existing updated_at is a
  // TIMESTAMP displayed in the session calendar, not a mysql2-parsed Date.
  // Source-wide latest actual update on the actual asOf day; never fake freshness
  // from fetchedAt, and never mask missing-column/query errors as null success.
  const timestamps = await selectRows(
    db,
    `
    SELECT DATE_FORMAT(
             DATE_SUB(MAX(d.updated_at), INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND),
             '%Y-%m-%dT%H:%i:%sZ'
           ) AS data_updated_at
    FROM ts_daily AS d FORCE INDEX (idx_trade_date)
    WHERE d.trade_date = ?
  `,
    [end]
  );
  if (timestamps.length !== 1)
    throw new TypeError("Invalid stock return ranking source timestamp result");
  const updatedAt = timestamps[0].data_updated_at;
  if (
    updatedAt !== null &&
    (typeof updatedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(updatedAt) ||
      !Number.isFinite(Date.parse(updatedAt)) ||
      new Date(updatedAt).toISOString() !== updatedAt.replace("Z", ".000Z"))
  ) {
    throw new TypeError("Invalid stock return ranking source timestamp");
  }
  result.dataUpdatedAt = updatedAt as string | null;
  result.fetchedAt = new Date().toISOString();
  return result;
}

/** Inclusive [asOf minus N clamped calendar months, asOf]; 1w is [asOf-6d, asOf].
 * UTC date arithmetic avoids server timezone/DST; do not approximate years as 100 days.
 */
function naturalStart(
  asOf: string,
  period: Exclude<StockReturnRankingPeriod, "all">
): string {
  const date = new Date(`${formatStockComparisonDate(asOf)}T00:00:00Z`);
  if (period === "1w") date.setUTCDate(date.getUTCDate() - 6);
  else {
    const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, "3y": 36 }[period];
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - months);
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
    ).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function checkedDates(rows: Row[], cutoff: string, start?: string): string[] {
  const dates = rows.map(row => {
    if (
      !isValidAShareTradeDate(row.trade_date) ||
      row.trade_date > cutoff ||
      (start !== undefined && row.trade_date < start)
    )
      throw new TypeError("Invalid stock return ranking window trade_date");
    return row.trade_date;
  });
  if (dates.some((date, i) => i > 0 && date >= dates[i - 1]))
    throw new TypeError("Invalid stock return ranking window ordering");
  return dates;
}

async function queryPeriodSource(
  db: StockComparisonDb,
  period: StockReturnRankingPeriod,
  cutoff: string
): Promise<PeriodSource> {
  let tradeDates: string[],
    requestedStart: string | null = null;
  if (period === "all") {
    // Exactly one global distinct-date discovery, via idx_trade_date; no LIMIT100.
    tradeDates = checkedDates(
      await selectRows(
        db,
        `
      SELECT /*+ MAX_EXECUTION_TIME(90000) */ DISTINCT d.trade_date
      FROM ts_daily AS d FORCE INDEX (idx_trade_date)
      WHERE d.trade_date <= ?
      ORDER BY d.trade_date DESC
    `,
        [cutoff]
      ),
      cutoff
    );
  } else {
    // MAX is global, independent of market/keyword and actual publication delay.
    const latest = await selectRows(
      db,
      `
      SELECT /*+ MAX_EXECUTION_TIME(90000) */ MAX(d.trade_date) AS as_of
      FROM ts_daily AS d FORCE INDEX (idx_trade_date)
      WHERE d.trade_date <= ?
    `,
      [cutoff]
    );
    if (latest.length !== 1)
      throw new TypeError("Invalid stock return ranking asOf result");
    const end = latest[0].as_of;
    if (end === null) tradeDates = [];
    else {
      if (!isValidAShareTradeDate(end) || end > cutoff)
        throw new TypeError("Invalid stock return ranking asOf");
      requestedStart = naturalStart(end, period);
      tradeDates = checkedDates(
        await selectRows(
          db,
          `
        SELECT /*+ MAX_EXECUTION_TIME(90000) */ DISTINCT d.trade_date
        FROM ts_daily AS d FORCE INDEX (idx_trade_date)
        WHERE d.trade_date >= ? AND d.trade_date <= ?
        ORDER BY d.trade_date DESC
      `,
          [requestedStart, end]
        ),
        end,
        requestedStart
      );
      // Inserts/deletes cannot silently replace the globally discovered asOf.
      if (tradeDates[0] !== end)
        throw new TypeError(
          "Stock return ranking source dates changed during discovery"
        );
    }
  }
  if (!tradeDates.length)
    return {
      tradeDates,
      requestedStart,
      rows: [],
      dataUpdatedAt: null,
      fetchedAt: new Date().toISOString(),
    };
  const end = tradeDates[0],
    start = tradeDates[tradeDates.length - 1];
  // One bounded aggregate scan, only summaries returned to Node. Compact MIN/MAX
  // date:price pairs retain actual per-stock endpoints without GROUP_CONCAT,
  // a second history scan, window sorting, or thousands of per-stock DB requests.
  // IN pins the discovered date set; future concurrent date inserts cannot stand
  // in for missing source dates. Invalid/duplicate rows fail completeness below.
  const rows = await selectRows(
    db,
    `
    SELECT /*+ MAX_EXECUTION_TIME(90000) */ b.ts_code, b.name, b.list_status${period === "all" ? ", b.list_date" : ""},
           a.row_days, a.distinct_days, a.sample_days, a.log_return,
           a.first_trade_date, a.last_trade_date, a.first_pre_close, a.last_close
    FROM ts_stock_basic AS b
    LEFT JOIN (
      SELECT d.ts_code,
             COUNT(*) AS row_days,
             COUNT(DISTINCT d.trade_date) AS distinct_days,
             COUNT(CASE WHEN d.close > 0 AND d.pre_close > 0 THEN 1 ELSE NULL END) AS sample_days,
             SUM(CASE WHEN d.close > 0 AND d.pre_close > 0
                      THEN LN(d.close / (d.pre_close * 1e0)) ELSE NULL END) AS log_return,
             MIN(d.trade_date) AS first_trade_date,
             MAX(d.trade_date) AS last_trade_date,
             SUBSTRING_INDEX(MIN(CONCAT(d.trade_date, ':', d.pre_close)), ':', -1) AS first_pre_close,
             SUBSTRING_INDEX(MAX(CONCAT(d.trade_date, ':', d.close)), ':', -1) AS last_close
      FROM ts_daily AS d FORCE INDEX (idx_trade_date)
      WHERE d.trade_date >= ? AND d.trade_date <= ?
        AND d.trade_date IN (${tradeDates.map(() => "?").join(", ")})
      GROUP BY d.ts_code
    ) AS a ON a.ts_code = b.ts_code
    WHERE b.list_status IN ('L', 'D')
    ORDER BY b.ts_code ASC
  `,
    [start, end, ...tradeDates]
  );
  // Validate before storing a heavy-source cache entry; malformed data/errors
  // must never become successful cached sources, even across filtered projections.
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      typeof row.ts_code !== "string" ||
      !row.ts_code ||
      seen.has(row.ts_code) ||
      typeof row.name !== "string" ||
      (row.list_status !== "L" && row.list_status !== "D")
    )
      throw new TypeError("Invalid stock return ranking identity");
    seen.add(row.ts_code);
    const rowDays = aggregateCount(row.row_days);
    if (
      aggregateCount(row.distinct_days) > rowDays ||
      aggregateCount(row.sample_days) > rowDays
    )
      throw new TypeError("Inconsistent stock return ranking aggregate count");
  }
  const timestamps = await selectRows(
    db,
    `
    SELECT /*+ MAX_EXECUTION_TIME(90000) */ DATE_FORMAT(
             DATE_SUB(MAX(d.updated_at), INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND),
             '%Y-%m-%dT%H:%i:%sZ'
           ) AS data_updated_at
    FROM ts_daily AS d FORCE INDEX (idx_trade_date)
    WHERE d.trade_date = ?
  `,
    [end]
  );
  if (timestamps.length !== 1)
    throw new TypeError("Invalid stock return ranking source timestamp result");
  const updatedAt = timestamps[0].data_updated_at;
  if (
    updatedAt !== null &&
    (typeof updatedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(updatedAt) ||
      !Number.isFinite(Date.parse(updatedAt)) ||
      new Date(updatedAt).toISOString() !== updatedAt.replace("Z", ".000Z"))
  )
    throw new TypeError("Invalid stock return ranking source timestamp");
  return {
    tradeDates,
    requestedStart,
    rows,
    dataUpdatedAt: updatedAt as string | null,
    fetchedAt: new Date().toISOString(),
  };
}

async function getPeriodSource(
  db: StockComparisonDb,
  cache: DbCache,
  period: StockReturnRankingPeriod,
  cutoff: string
): Promise<PeriodSource> {
  const key = JSON.stringify([period, cutoff]);
  for (;;) {
    for (const [cachedKey, entry] of cache.sources)
      if (entry.expiresAt <= Date.now()) cache.sources.delete(cachedKey);
    const cached = cache.sources.get(key);
    if (cached) {
      cache.sources.delete(key);
      cache.sources.set(key, cached);
      return cached.value;
    }
    const pending = cache.sourceInFlight.get(key);
    if (pending) return pending;
    // Different period/cutoff keys also serialize heavy scans per stable DB.
    if (!cache.sourceInFlight.size) break;
    await Promise.race(
      Array.from(cache.sourceInFlight.values(), p =>
        p.then(
          () => undefined,
          () => undefined
        )
      )
    );
  }
  const pending = queryPeriodSource(db, period, cutoff)
    .then(value => {
      cache.sources.set(key, {
        value,
        expiresAt: Date.parse(value.fetchedAt) + PERIOD_CACHE_TTL_MS,
      });
      while (cache.sources.size > MAX_CACHE_KEYS)
        cache.sources.delete(cache.sources.keys().next().value!);
      return value;
    })
    .finally(() => cache.sourceInFlight.delete(key));
  cache.sourceInFlight.set(key, pending);
  return pending;
}

function matchesMarket(
  code: string,
  market: StockReturnRankingMarket
): boolean {
  switch (market) {
    case "SH":
      return code.startsWith("6") && !code.startsWith("688");
    case "SZ":
      return code.startsWith("0");
    case "GEM":
      return code.startsWith("300") || code.startsWith("301");
    case "STAR":
      return code.startsWith("688");
    default:
      return true;
  }
}

function rankPeriodSource(
  source: PeriodSource,
  input: StockReturnRankingInput,
  keyword: string
): StockReturnRankingResult {
  const { tradeDates } = source;
  const end = tradeDates[0],
    start = tradeDates.at(-1);
  const all = input.period === "all";
  const result: StockReturnRankingResult = {
    days: tradeDates.length,
    period: input.period,
    requestedStart: formatStockComparisonDate(source.requestedStart),
    coverageNote: all ? ALL_COVERAGE_NOTE : PERIOD_COVERAGE_NOTE,
    topN: input.topN,
    direction: input.direction,
    market: input.market,
    asOf: formatStockComparisonDate(end),
    windowStart: formatStockComparisonDate(start),
    windowTradingDays: tradeDates.length,
    completeWindow: tradeDates.length > 0,
    eligibleCount: 0,
    excludedCount: 0,
    items: [],
    dataUpdatedAt: source.dataUpdatedAt,
    fetchedAt: source.fetchedAt,
    method: "daily-reference-compound",
  };
  // O(1) expected-count lookup per stock: membership plus ascending ordinal gap.
  const ordinals = new Map(
    tradeDates
      .slice()
      .reverse()
      .map((date, i) => [date, i])
  );
  for (const row of source.rows) {
    const code = row.ts_code as string,
      name = row.name as string,
      status = row.list_status as string;
    // Mimic SQL LIKE's ordinary case-insensitive text search, but %/_/! stay literal.
    if (
      status !== (input.market === "DELISTED" ? "D" : "L") ||
      !matchesMarket(code, input.market) ||
      (keyword &&
        !code.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()) &&
        !name.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()))
    )
      continue;
    const rowDays = aggregateCount(row.row_days),
      distinctDays = aggregateCount(row.distinct_days),
      sampleDays = aggregateCount(row.sample_days);
    let first = start,
      last = end,
      expectedCount = tradeDates.length;
    if (all) {
      // Accept only strict real compact/ISO listing dates (VARCHAR may contain junk).
      const listed = formatStockComparisonDate(
        typeof row.list_date === "string" ? row.list_date.trim() : null
      );
      first = listed?.replace(/-/g, "");
      last =
        status === "D" && isValidAShareTradeDate(row.last_trade_date)
          ? row.last_trade_date
          : end;
      const firstOrdinal =
        first === undefined ? undefined : ordinals.get(first);
      const lastOrdinal = last === undefined ? undefined : ordinals.get(last);
      expectedCount =
        firstOrdinal === undefined ||
        lastOrdinal === undefined ||
        firstOrdinal > lastOrdinal
          ? 0
          : lastOrdinal - firstOrdinal + 1;
    }
    const logReturn = finiteNumber(row.log_return),
      firstPreClose = finiteNumber(row.first_pre_close),
      lastClose = finiteNumber(row.last_close);
    const returnPercent =
      logReturn === null ? NaN : Math.expm1(logReturn) * 100;
    if (
      expectedCount === 0 ||
      rowDays !== expectedCount ||
      distinctDays !== expectedCount ||
      sampleDays !== expectedCount ||
      row.first_trade_date !== first ||
      row.last_trade_date !== last ||
      firstPreClose === null ||
      firstPreClose <= 0 ||
      lastClose === null ||
      lastClose <= 0 ||
      !Number.isFinite(returnPercent)
    ) {
      result.excludedCount++;
      continue;
    }
    result.eligibleCount++;
    if (input.direction === "up" ? returnPercent <= 0 : returnPercent >= 0)
      continue;
    result.items.push({
      tsCode: code,
      name,
      listStatus: status,
      returnPercent,
      sampleDays,
      firstTradeDate: formatStockComparisonDate(row.first_trade_date)!,
      lastTradeDate: formatStockComparisonDate(row.last_trade_date)!,
      firstPreClose,
      lastClose,
    });
  }
  result.items.sort(
    (a, b) =>
      (input.direction === "up"
        ? b.returnPercent - a.returnPercent
        : a.returnPercent - b.returnPercent) ||
      (a.tsCode < b.tsCode ? -1 : a.tsCode > b.tsCode ? 1 : 0)
  );
  result.items = result.items.slice(0, input.topN);
  return result;
}

/** Read-only ranking: legacy days=1..100, or natural period (default 1m).
 * topN remains any integer 1..100 for old callers, not just new UI tens.
 * Stable injected adapter only: no DB boot, writes, external requests or collector.
 * ledgerId is caller/cache scope, not a global Tushare-source predicate.
 * 12 result LRU/in-flight keys per DB; success-only legacy TTL90s / period TTL5m.
 * Period heavy sources share a DB/period/completed-cutoff key across all filters,
 * direction, topN and ledgers. Cutoff changes invalidate both cache layers;
 * source inserts/updates within the same cutoff become visible at most 5m later.
 */
export async function getStockReturnRanking(
  db: StockComparisonDb,
  input: StockReturnRankingInput
): Promise<StockReturnRankingResult> {
  if (
    !input ||
    typeof input !== "object" ||
    (input.days !== undefined &&
      (!Number.isInteger(input.days) || input.days < 1 || input.days > 100)) ||
    !Number.isInteger(input.topN) ||
    input.topN < 1 ||
    input.topN > 100
  ) {
    throw new RangeError(
      "Stock return ranking days/topN must be integers in 1..100"
    );
  }
  if (input.period !== undefined && !PERIODS.has(input.period))
    throw new RangeError("Unsupported stock return ranking period");
  if (input.period !== undefined && input.days !== undefined)
    throw new RangeError(
      "Stock return ranking period and days are mutually exclusive"
    );
  if (input.direction !== "up" && input.direction !== "down")
    throw new RangeError("Unsupported stock return ranking direction");
  if (
    typeof input.market !== "string" ||
    !Object.prototype.hasOwnProperty.call(MARKET_SQL, input.market)
  ) {
    throw new RangeError("Unsupported stock return ranking market");
  }
  if (input.keyword !== undefined && typeof input.keyword !== "string")
    throw new TypeError("Invalid stock return ranking keyword");
  if (
    input.ledgerId !== undefined &&
    (!Number.isSafeInteger(input.ledgerId) || input.ledgerId <= 0)
  ) {
    throw new RangeError(
      "Stock return ranking ledgerId must be a positive safe integer"
    );
  }
  const keyword = (input.keyword ?? "").trim();
  // Snapshot every key/query field before awaiting admission to prevent caller mutation.
  const snapshot: StockReturnRankingInput = {
    days: input.days,
    period: input.period ?? (input.days === undefined ? "1m" : undefined),
    topN: input.topN,
    direction: input.direction,
    market: input.market,
    ledgerId: input.ledgerId,
  };
  const cutoff = getAShareCompletedCutoff();
  const key = JSON.stringify([
    snapshot.days,
    snapshot.period,
    snapshot.topN,
    snapshot.direction,
    snapshot.market,
    keyword,
    snapshot.ledgerId ?? null,
    cutoff,
  ]);
  let cache = dbCaches.get(db);
  if (!cache) {
    cache = {
      results: new Map(),
      inFlight: new Map(),
      sources: new Map(),
      sourceInFlight: new Map(),
    };
    dbCaches.set(db, cache);
  }
  for (;;) {
    const now = Date.now();
    for (const [cachedKey, entry] of cache.results)
      if (entry.expiresAt <= now) cache.results.delete(cachedKey);
    const cached = cache.results.get(key);
    if (cached) {
      cache.results.delete(key);
      cache.results.set(key, cached);
      return cached.value;
    }
    const pending = cache.inFlight.get(key);
    if (pending) return pending;
    if (cache.inFlight.size < MAX_IN_FLIGHT_KEYS) break;
    await Promise.race(
      Array.from(cache.inFlight.values(), promise =>
        promise.then(
          () => undefined,
          () => undefined
        )
      )
    );
  }
  const query =
    snapshot.period !== undefined
      ? getPeriodSource(db, cache, snapshot.period, cutoff).then(source =>
          rankPeriodSource(source, snapshot, keyword)
        )
      : queryRanking(db, snapshot as LegacyInput, keyword, cutoff);
  const pending = query
    .then(value => {
      cache.results.set(key, {
        value,
        // Filtered projections must not outlive their underlying 5m source snapshot.
        expiresAt:
          snapshot.period !== undefined
            ? Date.parse(value.fetchedAt) + PERIOD_CACHE_TTL_MS
            : Date.now() + CACHE_TTL_MS,
      });
      while (cache.results.size > MAX_CACHE_KEYS) {
        const oldest = cache.results.keys().next().value;
        if (oldest === undefined) break;
        cache.results.delete(oldest);
      }
      return value;
    })
    .finally(() => {
      cache.inFlight.delete(key);
    });
  cache.inFlight.set(key, pending);
  return pending;
}
