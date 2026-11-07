/** Read-only latest A-share quotes. No connection, collector or scheduler imports. */
export interface StockLatestQuotesDb {
  execute(sql: string, params?: any[]): Promise<unknown>;
}
export interface StockLatestQuotesInput { tsCodes: string[] }
export interface StockLatestQuotesOptions { fetchImpl?: typeof fetch; now?: Date }
export interface StockLatestQuoteItem {
  tsCode: string;
  price: number | null;
  changePercent: number | null;
  change: number | null;
  /** Actual source date, YYYY-MM-DD; never the request date. */
  tradeDate: string | null;
  /** Tencent's official Beijing wall time; daily rows have no quote timestamp. */
  quoteTime: string | null;
  source: 'tencent' | 'daily' | 'unavailable';
  status: 'live' | 'delayed' | 'close' | 'stale' | 'unavailable';
}
export interface StockLatestQuotesResult {
  items: StockLatestQuoteItem[];
  /** Response instant (UTC), or injected now; not a market quote timestamp. */
  fetchedAt: string;
}

const CODE_RE = /^\d{6}\.(SH|SZ|BJ)$/;
const MAX_CODES = 200;
const CHUNK_SIZE = 80;
const MAX_CONCURRENCY = 3;
const TTL_MS = 15_000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
type Row = Record<string, unknown>;
type TencentQuote = {
  price: number; changePercent: number; change: number;
  tradeDate: string; quoteTime: string; timestamp: number; session: boolean;
};
type FetchCache = {
  quotes: Map<string, { value: TencentQuote | null; storedAt: number }>;
  inFlight: Map<string, Promise<TencentQuote | null>>;
  active: number;
  waiters: Array<() => void>;
};
// Injected preview fetchers never share results with the production fetcher.
// Both code maps and the waiting-batch queue are independently bounded at 200.
const fetchCaches = new WeakMap<typeof fetch, FetchCache>();

function cacheFor(fetchImpl: typeof fetch): FetchCache {
  let cache = fetchCaches.get(fetchImpl);
  if (!cache) {
    cache = { quotes: new Map(), inFlight: new Map(), active: 0, waiters: [] };
    fetchCaches.set(fetchImpl, cache);
  }
  return cache;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 8 || !/^[1-9]\d{7}$/.test(value)) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(4, 6)), day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function displayDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}
function finiteDecimal(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string'
    || value.trim() !== value || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function inSession(seconds: number): boolean {
  return (seconds >= 9 * 3600 + 30 * 60 && seconds <= 11 * 3600 + 30 * 60)
    || (seconds >= 13 * 3600 && seconds <= 15 * 3600);
}
function beijingClock(now: Date) {
  const shifted = new Date(now.getTime() + BEIJING_OFFSET_MS);
  const seconds = shifted.getUTCHours() * 3600 + shifted.getUTCMinutes() * 60 + shifted.getUTCSeconds();
  const today = shifted.toISOString().slice(0, 10);
  const cutoffDate = seconds < 15 * 3600 ? new Date(shifted.getTime() - DAY_MS) : shifted;
  const cutoff = cutoffDate.toISOString().slice(0, 10).replace(/-/g, '');
  // No exchange/holiday calendar is fetched. The weekday recency heuristic labels
  // older suspended/holiday observations conservatively; it never manufactures rows.
  const recent = new Date(cutoffDate.getTime());
  while (recent.getUTCDay() === 0 || recent.getUTCDay() === 6) recent.setUTCDate(recent.getUTCDate() - 1);
  return { today, cutoff, recent: recent.toISOString().slice(0, 10), seconds,
    weekday: shifted.getUTCDay() !== 0 && shifted.getUTCDay() !== 6 };
}
function parseTimestamp(value: string): Pick<TencentQuote, 'tradeDate' | 'quoteTime' | 'timestamp' | 'session'> | null {
  if (!/^\d{14}$/.test(value) || !validDate(value.slice(0, 8))) return null;
  const hour = Number(value.slice(8, 10)), minute = Number(value.slice(10, 12)), second = Number(value.slice(12, 14));
  if (hour > 23 || minute > 59 || second > 59) return null;
  const tradeDate = displayDate(value.slice(0, 8));
  const quoteTime = `${tradeDate} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`;
  const timestamp = Date.parse(`${tradeDate}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`);
  return { tradeDate, quoteTime, timestamp, session: inSession(hour * 3600 + minute * 60 + second) };
}
function tencentSymbol(tsCode: string): string {
  return tsCode.slice(7).toLowerCase() + tsCode.slice(0, 6);
}
function parseBatch(text: string, codes: readonly string[], now: Date): Map<string, TencentQuote> {
  const expected = new Map(codes.map(code => [tencentSymbol(code), code]));
  const result = new Map<string, TencentQuote>();
  // Lookbehind keeps each semicolon available as the next record's separator.
  const records = text.matchAll(/(?:^|(?<=[;\r\n]))\s*v_((?:sh|sz|bj)\d{6})\s*=\s*"([^"\r\n]*)"\s*;/g);
  for (const match of records) {
    const code = expected.get(match[1]);
    if (!code || result.has(code)) continue;
    const fields = match[2].split('~');
    if (fields[2] !== code.slice(0, 6)) continue;
    // [4] is yesterday's close, NOT a substitute for [3]. [31]/[32] must
    // remain from this same quote/date; never recompute with another day's row.
    const price = finiteDecimal(fields[3]), change = finiteDecimal(fields[31]), changePercent = finiteDecimal(fields[32]);
    const time = parseTimestamp(fields[30] ?? '');
    if (price === null || price <= 0 || change === null || changePercent === null
      || !time || time.timestamp > now.getTime() + 60_000) continue;
    result.set(code, { price, change, changePercent, ...time });
  }
  return result;
}

async function selectRows(db: StockLatestQuotesDb, sql: string, params: any[]): Promise<Row[]> {
  if (!/^\s*SELECT\s/i.test(sql)) throw new TypeError('Latest quotes DB access must be SELECT');
  const result = await db.execute(sql, params);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows) || !rows.every(row => row !== null && typeof row === 'object' && !Array.isArray(row))) {
    throw new TypeError('Unexpected latest quotes SELECT result');
  }
  return rows as Row[];
}

async function fetchBatch(fetchImpl: typeof fetch, cache: FetchCache, codes: string[], now: Date): Promise<Map<string, TencentQuote>> {
  // Shared across calls using this fetcher, not merely three workers per request.
  if (cache.active >= MAX_CONCURRENCY) {
    if (cache.waiters.length >= MAX_CODES) return new Map();
    await new Promise<void>(resolve => cache.waiters.push(resolve));
  } else {
    cache.active++;
  }
  try {
    const response = await fetchImpl(`https://qt.gtimg.cn/q=${codes.map(tencentSymbol).join(',')}`, {
      headers: { Referer: 'https://finance.qq.com', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return new Map();
    const text = new TextDecoder('gbk', { fatal: true }).decode(await response.arrayBuffer());
    return parseBatch(text, codes, now);
  } catch {
    return new Map();
  } finally {
    const next = cache.waiters.shift();
    if (next) next(); // Hand the occupied slot directly to a waiting batch.
    else cache.active--;
  }
}

async function getTencentQuotes(fetchImpl: typeof fetch, codes: string[], now: Date): Promise<Map<string, TencentQuote>> {
  const cache = cacheFor(fetchImpl);
  const result = new Map<string, TencentQuote>();
  const pending: Array<Promise<void>> = [];
  const missing: string[] = [];
  const wallNow = Date.now();
  for (const [code, entry] of cache.quotes) {
    if (wallNow < entry.storedAt || wallNow - entry.storedAt >= TTL_MS) cache.quotes.delete(code);
  }
  const collect = (code: string, quote: TencentQuote | null) => {
    // Recheck source future-time validity on cache/inflight hits with injected now.
    if (quote && quote.timestamp <= now.getTime() + 60_000) result.set(code, quote);
  };
  for (const code of codes) {
    const entry = cache.quotes.get(code);
    if (entry) collect(code, entry.value);
    else {
      const inFlight = cache.inFlight.get(code);
      if (inFlight) pending.push(inFlight.then(quote => collect(code, quote)));
      else missing.push(code);
    }
  }
  for (let start = 0; start < missing.length; start += CHUNK_SIZE) {
    const chunk = missing.slice(start, start + CHUNK_SIZE);
    const batch = fetchBatch(fetchImpl, cache, chunk, now);
    for (const code of chunk) {
      const promise = batch.then(quotes => {
        const value = quotes.get(code) ?? null;
        if (cache.quotes.size >= MAX_CODES && !cache.quotes.has(code)) {
          cache.quotes.delete(cache.quotes.keys().next().value!);
        }
        cache.quotes.set(code, { value, storedAt: Date.now() });
        return value;
      });
      if (cache.inFlight.size < MAX_CODES) cache.inFlight.set(code, promise);
      pending.push(promise.then(quote => collect(code, quote)).finally(() => {
        if (cache.inFlight.get(code) === promise) cache.inFlight.delete(code);
      }));
    }
  }
  await Promise.all(pending);
  return result;
}
function unavailable(tsCode: string): StockLatestQuoteItem {
  return { tsCode, price: null, changePercent: null, change: null, tradeDate: null,
    quoteTime: null, source: 'unavailable', status: 'unavailable' };
}
function tencentItem(tsCode: string, quote: TencentQuote, now: Date): StockLatestQuoteItem {
  const clock = beijingClock(now);
  let status: StockLatestQuoteItem['status'];
  if (quote.tradeDate !== clock.today) status = quote.tradeDate < clock.recent ? 'stale' : 'close';
  else if (!clock.weekday || !inSession(clock.seconds)) status = 'close';
  else {
    const age = now.getTime() - quote.timestamp;
    status = quote.session && age >= 0 && age <= 120_000 ? 'live' : 'delayed';
  }
  return { tsCode, price: quote.price, changePercent: quote.changePercent, change: quote.change,
    tradeDate: quote.tradeDate, quoteTime: quote.quoteTime, source: 'tencent', status };
}

/** Validate before any I/O; preserve first-requested order after deduplication.
 * D (and any unknown/non-L status) never hits Tencent, even if an L quote was
 * cached earlier: reused delisted numeric symbols cannot become live quotes.
 * Daily failures propagate; this function never initializes or writes the DB.
 */
export async function getStockLatestQuotes(
  db: StockLatestQuotesDb, input: StockLatestQuotesInput, options: StockLatestQuotesOptions = {},
): Promise<StockLatestQuotesResult> {
  if (!input || !Array.isArray(input.tsCodes) || input.tsCodes.length > MAX_CODES
    || Array.from(input.tsCodes).some(code => typeof code !== 'string' || code.length !== 9 || !CODE_RE.test(code))) {
    throw new TypeError('tsCodes must contain at most 200 six-digit .SH/.SZ/.BJ codes');
  }
  const now = new Date((options.now ?? new Date()).getTime());
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid current date');
  const codes = [...new Set(input.tsCodes)];
  const fetchedAt = now.toISOString();
  if (codes.length === 0) return { items: [], fetchedAt };
  const placeholders = codes.map(() => '?').join(',');
  const basics = await selectRows(db, `
    SELECT ts_code, list_status FROM ts_stock_basic WHERE ts_code IN (${placeholders})
  `, codes);
  const statuses = new Map<string, unknown>();
  for (const row of basics) {
    if (typeof row.ts_code === 'string' && codes.includes(row.ts_code)) {
      // Defensive D precedence if a faulty adapter returns duplicate identities.
      if (statuses.get(row.ts_code) !== 'D') statuses.set(row.ts_code, row.list_status);
    }
  }
  const listed = codes.filter(code => statuses.get(code) === 'L');
  const quotes = listed.length ? await getTencentQuotes(options.fetchImpl ?? fetch, listed, now) : new Map<string, TencentQuote>();
  // A normal response may be timestamped seconds after the request began.
  // Evaluate live against completion time, but keep injected test time stable.
  const evaluatedAt = options.now ? now : new Date();
  const items = new Map<string, StockLatestQuoteItem>();
  for (const [code, quote] of quotes) items.set(code, tencentItem(code, quote, evaluatedAt));
  const missing = codes.filter(code => !items.has(code));
  if (missing.length) {
    const clock = beijingClock(evaluatedAt);
    // uk_code_date (ts_code, trade_date) makes each correlated MAX an indexed
    // per-code lookup, driven by one basic row and one unique daily point join.
    // No all-market GROUP BY/MAX or outer full per-code daily-history scan.
    const rows = await selectRows(db, `
      SELECT d.ts_code, d.close, d.pct_chg, d.chg AS \`change\`, d.trade_date
      FROM ts_stock_basic AS b
      STRAIGHT_JOIN ts_daily AS d FORCE INDEX (uk_code_date)
        ON d.ts_code = b.ts_code AND d.trade_date = (
          SELECT MAX(latest.trade_date)
          FROM ts_daily AS latest FORCE INDEX (uk_code_date)
          WHERE latest.ts_code = b.ts_code AND latest.trade_date <= ?
        )
      WHERE b.ts_code IN (${missing.map(() => '?').join(',')})
    `, [clock.cutoff, ...missing]);
    const missingSet = new Set(missing);
    for (const row of rows) {
      if (typeof row.ts_code !== 'string' || !missingSet.has(row.ts_code) || items.has(row.ts_code)
        || !validDate(row.trade_date) || row.trade_date > clock.cutoff) continue;
      const price = finiteDecimal(row.close);
      if (price === null || price <= 0) continue;
      const tradeDate = displayDate(row.trade_date);
      items.set(row.ts_code, { tsCode: row.ts_code, price,
        changePercent: finiteDecimal(row.pct_chg), change: finiteDecimal(row.change),
        tradeDate, quoteTime: null, source: 'daily', status: tradeDate < clock.recent ? 'stale' : 'close' });
    }
  }
  return { items: codes.map(code => items.get(code) ?? unavailable(code)),
    fetchedAt: options.now ? fetchedAt : new Date().toISOString() };
}
