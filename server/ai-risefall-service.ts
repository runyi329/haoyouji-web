import { createHash } from 'node:crypto';
import { getAShareCompletedCutoff, isValidAShareTradeDate } from '../shared/a-share-completed-days';
import type { AiRisefallMarket, AiRisefallPeriod, AiRisefallResult, AiRisefallToday } from '../shared/ai-risefall';

export type AiRisefallReadExecutor = { execute(sql: string, params?: unknown[]): Promise<any> };
export type AiRisefallLimitRow = { trade_date?: unknown; ts_code?: unknown; pre_close?: unknown; up_limit?: unknown; down_limit?: unknown };
export type AiRisefallFetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<any> }>;
export type AiRisefallOptions = { token?: string; fetchImpl?: AiRisefallFetch; now?: Date; market?: AiRisefallMarket; database?: object };

type InternalMarket = Exclude<AiRisefallMarket, 'all'> | 'BJ';
type Limit = { pre: number; up: number; down: number };
type LimitCoverage = { rows: Map<string, Limit>; complete: boolean };
type CacheEntry<T> = { value?: T; expiresAt: number; inflight?: Promise<T> };
const CACHE_MS = 90_000;
const FAILURE_MS = 5_000;
const SUPPLIER_TIMEOUT_MS = 8_000;
const MAX_KEYS = 10;
const MAX_DAYS = 60;
const PAGE_SIZE = 5800;
const MAX_PAGES = 8;
const PRICE_TOLERANCE = 0.0005;
let caches = new WeakMap<object, Map<string, CacheEntry<AiRisefallResult>>>();
let supplierCaches = new WeakMap<AiRisefallFetch, Map<string, CacheEntry<LimitCoverage>>>();
let identities = new WeakMap<object, number>();
let nextIdentity = 0;

// Anchored fixed exchange/prefix rules, shared by SQL scope and detail validation.
// BJ is deliberately internal: all includes it, but SH never does.
const CODE_RULES: readonly [InternalMarket, string][] = [
  ['STAR', '^(688|689)[0-9]{3}[.]SH$'],
  ['GEM', '^(300|301)[0-9]{3}[.]SZ$'],
  ['SH', '^(600|601|603|605)[0-9]{3}[.]SH$'],
  ['SZ', '^(000|001|002|003)[0-9]{3}[.]SZ$'],
  ['BJ', '^(43|83|87|88|92)[0-9]{4}[.]BJ$'],
];
function marketCode(code: unknown): InternalMarket | null {
  if (typeof code !== 'string') return null;
  return CODE_RULES.find(([, rule]) => new RegExp(rule).test(code))?.[0] ?? null;
}
const scopeSql = `(CASE ${CODE_RULES.map(([market, rule]) => `WHEN REGEXP_LIKE(d.ts_code, '${rule}', 'c') THEN '${market}'`).join(' ')} ELSE NULL END)`;
const validDaily = `d.close IS NOT NULL AND d.pre_close IS NOT NULL AND d.close > 0 AND d.pre_close > 0`;
const sourceSql = `FROM ts_daily AS d FORCE INDEX (idx_trade_date) INNER JOIN ts_stock_basic b ON b.ts_code = d.ts_code`;
function scope(market: AiRisefallMarket) {
  if (market !== 'all' && !CODE_RULES.some(([m]) => m !== 'BJ' && m === market)) throw new TypeError('Invalid risefall market');
  return { sql: `b.list_status = 'L' AND ${scopeSql} IS NOT NULL${market === 'all' ? '' : ` AND ${scopeSql} = ?`}`, params: market === 'all' ? [] : [market] };
}
function numeric(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'bigint' && typeof value !== 'string') return NaN;
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return NaN;
  return Number(value);
}
function count(value: unknown): number {
  const number = numeric(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new TypeError('Invalid risefall aggregate count');
  return number;
}
const validPrice = (value: unknown) => Number.isFinite(numeric(value)) && numeric(value) > 0;
const dateText = (value: unknown) => isValidAShareTradeDate(value) ? value : null;
const displayDate = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
const matchingPrice = (a: number, b: number) => Math.abs(a - b) <= PRICE_TOLERANCE;
function empty(status: 'unavailable' | 'insufficient'): AiRisefallResult {
  return { latestDate: null, status, source: 'daily', today: null, periods: [] };
}
async function selectRows(connection: AiRisefallReadExecutor, query: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  const result = await connection.execute(query, params);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows) || !rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) throw new TypeError('Invalid risefall SELECT result');
  return rows;
}
function normalizeDaily(rows: Record<string, unknown>[], dates: Set<string>) {
  const seen = new Set<string>();
  return rows.map(row => {
    const date = dateText(row.tradeDate ?? row.trade_date);
    if (!date || !dates.has(date) || seen.has(date)) throw new TypeError('Invalid risefall aggregate date');
    seen.add(date);
    const total = count(row.total), up = count(row.up), down = count(row.down), flat = count(row.flat), excluded = count(row.excluded);
    if (!Number.isSafeInteger(up + down + flat) || up + down + flat !== total) throw new TypeError('Inconsistent risefall aggregate count');
    const rise = numeric(row.maxRise), fall = numeric(row.maxFall);
    return { date, total, up, down, flat, excluded, maxRise: up > 0 && Number.isFinite(rise) && rise > 0 ? rise : null, maxFall: down > 0 && Number.isFinite(fall) && fall < 0 ? fall : null };
  }).filter(row => row.total > 0).sort((a, b) => a.date.localeCompare(b.date));
}
function periods(days: ReturnType<typeof normalizeDaily>): AiRisefallPeriod[] {
  return [5, 20, 60].map(size => {
    const selected = days.slice(-size);
    // 每日上涨股票占当日有效股票的比例；不是单只股票收益率。
    const distribution = ['<30%', '30~40%', '40~50%', '50~60%', '60~70%', '>70%'].map(label => ({ label, count: 0 }));
    for (const day of selected) {
      const ratio = day.up / day.total * 100;
      const bucket = ratio < 30 ? 0 : ratio < 40 ? 1 : ratio < 50 ? 2 : ratio < 60 ? 3 : ratio <= 70 ? 4 : 5;
      distribution[bucket].count++;
    }
    return { label: `近${size}日`, total: selected.length, requestedDays: size, windowStart: selected[0] ? displayDate(selected[0].date) : null, windowEnd: selected.at(-1) ? displayDate(selected.at(-1)!.date) : null, distribution };
  });
}
function tokenScope(token?: string) { return createHash('sha256').update(token ?? '').digest('hex'); }
function identity(object?: object): number {
  if (!object) return 0;
  let id = identities.get(object);
  if (!id) { id = ++nextIdentity; identities.set(object, id); }
  return id;
}
function putBounded<T>(map: Map<string, CacheEntry<T>>, key: string, entry: CacheEntry<T>) {
  map.delete(key);
  map.set(key, entry);
  while (map.size > MAX_KEYS) map.delete(map.keys().next().value!);
}
async function cached<T>(map: Map<string, CacheEntry<T>>, key: string, run: () => Promise<T>, successful: (value: T) => boolean): Promise<T> {
  const prior = map.get(key);
  if (prior?.inflight) return prior.inflight;
  if (prior?.value !== undefined && Date.now() < prior.expiresAt) return prior.value;
  const entry: CacheEntry<T> = { expiresAt: 0 };
  // Cache only resolved data; a DB failure is removed and propagates to the route.
  const inflight = Promise.resolve().then(run).then(value => {
    if (map.get(key) === entry) { entry.value = value; entry.expiresAt = Date.now() + (successful(value) ? CACHE_MS : FAILURE_MS); entry.inflight = undefined; }
    return value;
  }, error => { if (map.get(key) === entry) map.delete(key); throw error; });
  entry.inflight = inflight;
  putBounded(map, key, entry);
  return inflight;
}

async function requestLimits(token: string, date: string, fetchImpl: AiRisefallFetch): Promise<LimitCoverage> {
  const rows = new Map<string, Limit>();
  const conflicts = new Set<string>();
  const controller = new AbortController();
  const deadline = Date.now() + SUPPLIER_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout>;
  let clean = true;
  const snapshot = (complete = false): LimitCoverage => ({ rows: new Map(rows), complete });
  const collect = async (): Promise<LimitCoverage> => {
    try {
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (controller.signal.aborted || Date.now() >= deadline) return snapshot();
        const response = await fetchImpl('https://api.tushare.pro', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_name: 'stk_limit', token, params: { trade_date: date, limit: PAGE_SIZE, offset }, fields: 'trade_date,ts_code,pre_close,up_limit,down_limit' }), signal: controller.signal,
        });
        if (controller.signal.aborted || Date.now() >= deadline || !response.ok) return snapshot();
        const body = await response.json();
        if (controller.signal.aborted || Date.now() >= deadline || body?.code !== 0) return snapshot();
        const fields = body?.data?.fields, items = body?.data?.items;
        const required = ['trade_date', 'ts_code', 'pre_close', 'up_limit', 'down_limit'];
        if (!Array.isArray(fields) || !fields.every(field => typeof field === 'string') || new Set(fields).size !== fields.length || !required.every(field => fields.includes(field)) || !Array.isArray(items) || items.length > PAGE_SIZE || !items.every(item => Array.isArray(item) && item.length === fields.length)) return snapshot();
        let added = 0;
        for (const item of items) {
          const row: AiRisefallLimitRow = Object.fromEntries(fields.map((field: string, index: number) => [field, item[index]]));
          // stk_limit legitimately includes B-shares and funds. They are outside
          // this A-share universe, not a failure of the requested day's coverage.
          if (!marketCode(row.ts_code)) continue;
          if (dateText(row.trade_date) !== date || !validPrice(row.pre_close) || !validPrice(row.up_limit) || !validPrice(row.down_limit)) { clean = false; continue; }
          const code = row.ts_code as string;
          const limit = { pre: numeric(row.pre_close), up: numeric(row.up_limit), down: numeric(row.down_limit) };
          if (!(limit.up > limit.pre && limit.pre > limit.down)) { clean = false; conflicts.add(code); rows.delete(code); continue; }
          if (conflicts.has(code)) continue;
          const previous = rows.get(code);
          if (previous) {
            if (previous.pre !== limit.pre || previous.up !== limit.up || previous.down !== limit.down) { clean = false; conflicts.add(code); rows.delete(code); }
            continue;
          }
          rows.set(code, limit); added++;
        }
        if (controller.signal.aborted || Date.now() >= deadline) return snapshot();
        if (items.length > 0 && added === 0) return snapshot();
        if (items.length < PAGE_SIZE) return snapshot(clean);
        offset += items.length;
      }
      // A full final page is not proof of complete coverage.
      return snapshot();
    } catch { return snapshot(); } // Preserve daily data; incomplete supplier results get only a 5s cooldown.
  };
  const timedOut = new Promise<LimitCoverage>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(snapshot()); }, SUPPLIER_TIMEOUT_MS); });
  try { return await Promise.race([collect(), timedOut]); } finally { clearTimeout(timer!); }
}
async function fetchLimits(token: string | undefined, date: string, fetchImpl: AiRisefallFetch | undefined): Promise<LimitCoverage> {
  if (!token || !fetchImpl) return { rows: new Map(), complete: false };
  let cache = supplierCaches.get(fetchImpl);
  if (!cache) { cache = new Map(); supplierCaches.set(fetchImpl, cache); }
  // Supplier response is whole-market, and is shared across DBs/market selections.
  return cached(cache, `${date}|${tokenScope(token)}`, () => requestLimits(token, date, fetchImpl), value => value.complete);
}
function applyLimits(today: AiRisefallToday, details: Record<string, unknown>[], coverage: LimitCoverage, market: AiRisefallMarket): AiRisefallToday {
  let up = 0, down = 0, evaluated = 0, detailUp = 0, detailDown = 0, detailFlat = 0;
  const seen = new Set<string>();
  const duplicateCodes = new Set<string>();
  for (const row of details) {
    if (typeof row.ts_code === 'string') { if (seen.has(row.ts_code)) duplicateCodes.add(row.ts_code); seen.add(row.ts_code); }
  }
  for (const row of details) {
    const code = row.ts_code, internalMarket = marketCode(code);
    if (typeof code !== 'string' || !internalMarket || (market !== 'all' && internalMarket !== market) || duplicateCodes.has(code) || !validPrice(row.close) || !validPrice(row.pre_close)) continue;
    const close = numeric(row.close), pre = numeric(row.pre_close);
    if (close > pre) detailUp++; else if (close < pre) detailDown++; else detailFlat++;
    const limit = coverage.rows.get(code);
    if (!limit || !matchingPrice(pre, limit.pre) || close > limit.up + PRICE_TOLERANCE || close < limit.down - PRICE_TOLERANCE) continue;
    const isUp = matchingPrice(close, limit.up), isDown = matchingPrice(close, limit.down);
    if ((isUp && close <= pre) || (isDown && close >= pre) || (isUp && isDown)) continue;
    evaluated++;
    if (isUp) up++; else if (isDown) down++;
  }
  if (detailUp > today.up || detailDown > today.down || detailFlat > today.flat || evaluated > today.total || up > today.up || down > today.down) {
    return { ...today, limitEvaluated: 0, limitUnknown: today.total };
  }
  const unknown = today.total - evaluated;
  const exact = coverage.complete && unknown === 0;
  return { ...today, limit_up: exact ? up : null, limit_down: exact ? down : null, limitEvaluated: evaluated, limitUnknown: unknown };
}

/** Pure DB injection: no DB initialization, routes, writes or natural-day substitute. */
export async function readAiRisefall(connection: AiRisefallReadExecutor, options: AiRisefallOptions = {}): Promise<AiRisefallResult> {
  const cutoff = getAShareCompletedCutoff(options.now);
  const market = options.market ?? 'all', selectedScope = scope(market);
  const dateRows = await selectRows(connection, `SELECT DISTINCT d.trade_date FROM ts_daily AS d FORCE INDEX (idx_trade_date) WHERE d.trade_date <= ? ORDER BY d.trade_date DESC LIMIT ${MAX_DAYS}`, [cutoff]);
  const dates = Array.from(new Set(dateRows.map(row => {
    const date = dateText(row.trade_date);
    if (!date || date > cutoff) throw new TypeError('Invalid risefall window date');
    return date;
  }))).sort();
  if (dates.length > MAX_DAYS) throw new TypeError('Invalid risefall window size');
  if (!dates.length) return empty('unavailable');
  const aggregate = await selectRows(connection, `SELECT d.trade_date AS tradeDate,
    SUM(CASE WHEN ${validDaily} THEN 1 ELSE 0 END) AS total,
    SUM(CASE WHEN ${validDaily} AND d.close > d.pre_close THEN 1 ELSE 0 END) AS up,
    SUM(CASE WHEN ${validDaily} AND d.close < d.pre_close THEN 1 ELSE 0 END) AS down,
    SUM(CASE WHEN ${validDaily} AND d.close = d.pre_close THEN 1 ELSE 0 END) AS flat,
    SUM(CASE WHEN ${validDaily} THEN 0 ELSE 1 END) AS excluded,
    MAX(CASE WHEN ${validDaily} AND d.close > d.pre_close THEN (d.close-d.pre_close)/d.pre_close*100 ELSE NULL END) AS maxRise,
    MIN(CASE WHEN ${validDaily} AND d.close < d.pre_close THEN (d.close-d.pre_close)/d.pre_close*100 ELSE NULL END) AS maxFall
    ${sourceSql} WHERE d.trade_date >= ? AND d.trade_date <= ? AND ${selectedScope.sql}
    GROUP BY d.trade_date ORDER BY d.trade_date`, [dates[0], dates.at(-1)!, ...selectedScope.params]);
  if (!aggregate.length) return empty('unavailable');
  const days = normalizeDaily(aggregate, new Set(dates));
  if (!days.length) return empty('insufficient');
  const latest = days.at(-1)!;
  const details = await selectRows(connection, `SELECT d.ts_code,d.close,d.pre_close ${sourceSql} WHERE d.trade_date = ? AND ${validDaily} AND ${selectedScope.sql}`, [latest.date, ...selectedScope.params]);
  const base: AiRisefallToday = { total: latest.total, up: latest.up, down: latest.down, flat: latest.flat, limit_up: null, limit_down: null, max_rise: latest.maxRise, max_fall: latest.maxFall, excluded: latest.excluded, limitEvaluated: 0, limitUnknown: latest.total };
  const coverage = await fetchLimits(options.token, latest.date, options.fetchImpl);
  const today = applyLimits(base, details, coverage, market);
  return { latestDate: displayDate(latest.date), status: coverage.complete && today.limit_up !== null && today.limit_down !== null ? 'available' : 'partial', source: 'daily', today, periods: periods(days) };
}
export function clearAiRisefallCacheForTests() {
  caches = new WeakMap(); supplierCaches = new WeakMap(); identities = new WeakMap(); nextIdentity = 0;
}
/** The route owns connection acquisition and error handling; failures must propagate. */
export async function getAiRisefall(connection: AiRisefallReadExecutor, options: AiRisefallOptions = {}): Promise<AiRisefallResult> {
  let cache = caches.get(connection);
  if (!cache) { cache = new Map(); caches.set(connection, cache); }
  const key = `${getAShareCompletedCutoff(options.now)}|${options.market ?? 'all'}|${tokenScope(options.token)}|${identity(options.fetchImpl)}|${identity(options.database)}`;
  return cached(cache, key, () => readAiRisefall(connection, options), value => value.status === 'available');
}
