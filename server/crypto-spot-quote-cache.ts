/**
 * Unified demand-only crypto USDT spot quotes. No DB/scanner/security parser imports,
 * startup I/O, interval, aliases, historical prices, swaps or mark prices.
 * This crypto-only boundary accepts BASE codes (including bare ETH as crypto), NOT
 * portfolio/security symbols. Callers must establish CRYPTO identity before calling.
 * A static catalogue is not trading evidence: each source needs a fresh spot directory.
 */
export type UnifiedCryptoSpotQuote = {
  code: string;
  price: number;
  currency: 'USDT';
  source: 'Gate.io' | 'HTX';
  /** Gate: actual successful HTTP receipt; HTX: validated response ts, never restamped. */
  updatedAt: string;
  /** Ticker rolling-24h statistics; todayOpen is the ticker-implied 24h open, not day K. */
  patch?: { todayOpen?: number; changePercent?: number; high24h?: number; low24h?: number;
    volume24h?: number; quoteVolume24h?: number };
};
export type UnifiedCryptoSpotInstrument = {
  code: string;
  pair: string;
  name: string;
  gatePair?: string;
  htxPair?: string;
  gateDelistingAt?: number | null;
  sources: Array<UnifiedCryptoSpotQuote['source']>;
};
export type UnifiedCryptoSpotQuoteHealth = {
  code: string;
  stale: boolean;
  directoryVerified: boolean;
  inFlight: boolean;
  source: UnifiedCryptoSpotQuote['source'] | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
};

type JsonRow = Record<string, unknown>;
type Instrument = { code: string; pair: string; name: string; delistingAt?: number | null };
type SourceDirectory = {
  rows: Map<string, Instrument>;
  expiresAt: number;
  retryAt: number;
  updatedAt: string | null;
  lastError: string | null;
  flight: Promise<void> | null;
};
type CachedQuote = { quote: UnifiedCryptoSpotQuote; expiresAt: number };
type AttemptHealth = Pick<UnifiedCryptoSpotQuoteHealth,
  'source' | 'lastSuccessAt' | 'lastAttemptAt' | 'consecutiveFailures' | 'lastError'>;

const GATE = 'https://api.gateio.ws/api/v4/spot';
const HTX = 'https://api.huobi.pro';
const DIRECTORY_TTL_MS = 10 * 60_000;
const DIRECTORY_RETRY_MS = 15_000;
const QUOTE_TTL_MS = 2_500;
const QUOTE_RETRY_MS = 2_500;
const HTX_MAX_AGE_MS = 120_000;
const REQUEST_TIMEOUT_MS = 3_000;
// 全量身份目录实测约4.5秒，冷启动预算独立于单币行情；每源仍single-flight。
const DIRECTORY_TIMEOUT_MS = 12_000;
const MAX_CODES = 216;
const MAX_CONCURRENT_REQUESTS = 8;
const MAX_PENDING_REQUESTS = 216;
const newDirectory = (): SourceDirectory => ({ rows: new Map(), expiresAt: 0,
  retryAt: 0, updatedAt: null, lastError: null, flight: null });
const gateDirectory = newDirectory();
const htxDirectory = newDirectory();
const quoteCache = new Map<string, CachedQuote>();
const quoteMisses = new Map<string, number>();
const quoteFlights = new Map<string, Promise<UnifiedCryptoSpotQuote | null>>();
const health = new Map<string, AttemptHealth>();
let activeRequests = 0;
const requestWaiters: Array<() => void> = [];

function boundedSet<T>(map: Map<string, T>, key: string, value: T): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_CODES) map.delete(map.keys().next().value!);
}
function rowOf(value: unknown): JsonRow | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRow : null;
}
function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function positive(value: unknown): number | null {
  const number = numeric(value);
  return number !== null && number > 0 ? number : null;
}
function baseCode(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 32) return null;
  const code = raw.trim().toUpperCase();
  // BTY has separate, explicitly assigned Hotcoin/MEXC handling in the scanner.
  return /^[A-Z0-9][A-Z0-9_]{0,29}$/.test(code) && code !== 'USDT' && code !== 'BTY'
    ? code : null;
}
function isLeveraged(base: string, name: string, row: JsonRow): boolean {
  return /(?:[2-9]|10)(?:L|S|LONG|SHORT|BULL|BEAR|X)$/.test(base)
    || /\bleveraged\b|\bETF\b|\b[2-9](?:x|\s+times)\s+(?:long|short)\b|杠杆|倍做[多空]/i.test(name)
    || row.is_leveraged === true || row.leveraged === true;
}
function parseGateSpot(value: unknown): Instrument | null {
  const row = rowOf(value);
  if (!row || typeof row.base !== 'string') return null;
  const code = baseCode(row.base);
  const name = typeof row.base_name === 'string' && row.base_name.trim() ? row.base_name.trim() : row.base;
  if (!code || code !== row.base || row.quote !== 'USDT' || row.id !== `${code}_USDT`
    || row.type !== 'normal' || row.trade_status !== 'tradable' || isLeveraged(code, name, row)) return null;
  for (const start of [row.buy_start, row.sell_start]) {
    if (start == null) continue;
    const time = numeric(start);
    if (time === null || time < 0 || time * 1_000 > Date.now()) return null;
  }
  let delistingAt: number | null = null;
  if (row.delisting_time != null) {
    const time = numeric(row.delisting_time);
    if (time === null || time < 0) return null;
    if (time !== 0) delistingAt = time * 1_000;
    if (delistingAt !== null && delistingAt <= Date.now()) return null;
  }
  return { code, pair: `${code}_USDT`, name, delistingAt };
}
function parseHtxSpot(value: unknown): Instrument | null {
  const row = rowOf(value);
  const rawBase = row?.['base-currency'];
  if (!row || typeof rawBase !== 'string' || !/^[a-z0-9][a-z0-9_]{0,29}$/.test(rawBase)) return null;
  const code = baseCode(rawBase);
  if (!code || row['quote-currency'] !== 'usdt' || row.symbol !== `${rawBase}usdt`
    || row.state !== 'online' || row['api-trading'] !== 'enabled' || row['ca-state'] != null
    || isLeveraged(code, code, row)
    || /(?:^|,)\s*(?:etp|etf)\s*(?:,|$)/i.test(String(row.tags ?? ''))
    || ['underlying', 'mgmt-fee-rate', 'charge-time', 'rebal-time', 'rebal-threshold', 'init-nav']
      .some(key => row[key] != null)) return null;
  // Ordinary spot leverage-ratio describes margin eligibility, NOT an ETP flag.
  return { code, pair: row.symbol as string, name: code };
}

/** A slot is transferred to its waiter, so a new request cannot steal it. */
async function fetchJson(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    if (requestWaiters.length >= MAX_PENDING_REQUESTS) throw new Error('spot request queue full');
    await new Promise<void>(resolve => requestWaiters.push(resolve));
  } else activeRequests += 1;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    const next = requestWaiters.shift();
    if (next) next();
    else activeRequests -= 1;
  }
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'spot provider unavailable';
}
function refreshDirectory(state: SourceDirectory, source: UnifiedCryptoSpotQuote['source']): Promise<void> {
  if (state.flight) return state.flight;
  if (Date.now() < state.expiresAt || Date.now() < state.retryAt) return Promise.resolve();
  const pending = (async () => {
    try {
      const data = await fetchJson(source === 'Gate.io' ? `${GATE}/currency_pairs` : `${HTX}/v1/common/symbols`, DIRECTORY_TIMEOUT_MS);
      const wrapper = rowOf(data);
      const rows = source === 'Gate.io' ? data
        : wrapper?.status === 'ok' ? wrapper.data : null;
      if (!Array.isArray(rows)) throw new Error('invalid spot directory');
      const next = new Map<string, Instrument>();
      for (const row of rows) {
        const instrument = source === 'Gate.io' ? parseGateSpot(row) : parseHtxSpot(row);
        if (instrument) next.set(instrument.code, instrument);
      }
      state.rows = next; // Valid empty directory proves that no pair qualifies.
      state.updatedAt = new Date(Date.now()).toISOString();
      state.expiresAt = Date.now() + DIRECTORY_TTL_MS;
      state.retryAt = 0;
      state.lastError = null;
    } catch (error) {
      // No expired source eligibility is inherited from an earlier successful load.
      state.rows = new Map();
      state.expiresAt = 0;
      state.retryAt = Date.now() + DIRECTORY_RETRY_MS;
      state.lastError = errorMessage(error);
    } finally { state.flight = null; }
  })();
  state.flight = pending;
  return pending;
}
async function ensureDirectories(): Promise<void> {
  // Separate TTL/retry/flight per source: one failure never invalidates the other.
  await Promise.all([refreshDirectory(gateDirectory, 'Gate.io'), refreshDirectory(htxDirectory, 'HTX')]);
  for (const [code, cached] of Array.from(quoteCache)) {
    if (!eligibleInstrument(code, cached.quote.source)) quoteCache.delete(code);
  }
}
function eligibleInstrument(code: string, source: UnifiedCryptoSpotQuote['source']): Instrument | null {
  const state = source === 'Gate.io' ? gateDirectory : htxDirectory;
  if (Date.now() >= state.expiresAt) return null;
  const instrument = state.rows.get(code);
  if (!instrument || (instrument.delistingAt != null && instrument.delistingAt <= Date.now())) return null;
  return instrument;
}
/** Synchronous identity evidence; does not fetch or refresh anything. */
export function peekUnifiedCryptoSpotInstrument(base: string): UnifiedCryptoSpotInstrument | null {
  const code = baseCode(base);
  if (!code) return null;
  const gate = eligibleInstrument(code, 'Gate.io');
  const htx = eligibleInstrument(code, 'HTX');
  if (!gate && !htx) return null;
  const sources: UnifiedCryptoSpotQuote['source'][] = [];
  if (gate) sources.push('Gate.io');
  if (htx) sources.push('HTX');
  return { code, pair: `${code}_USDT`, name: gate?.name ?? htx!.name, sources,
    ...(gate ? { gatePair: gate.pair, gateDelistingAt: gate.delistingAt ?? null } : {}),
    ...(htx ? { htxPair: htx.pair } : {}) };
}
/** Explicit directory-only call for CRYPTO search/identity integration; never pulls prices. */
export async function getUnifiedCryptoSpotDirectory(): Promise<UnifiedCryptoSpotInstrument[]> {
  await ensureDirectories();
  const codes = new Set([...Array.from(gateDirectory.rows.keys()), ...Array.from(htxDirectory.rows.keys())]);
  return Array.from(codes).map(peekUnifiedCryptoSpotInstrument)
    .filter((item): item is UnifiedCryptoSpotInstrument => item !== null);
}
function copyQuote(quote: UnifiedCryptoSpotQuote): UnifiedCryptoSpotQuote {
  return { ...quote, ...(quote.patch ? { patch: { ...quote.patch } } : {}) };
}
/** Synchronous display window is distinct from the 2.5s request TTL. No I/O.
 * A failed refresh invalidates the success cache, even within this display window.
 */
export function peekUnifiedCryptoSpotQuote(base: string, options?: { maxAgeMs?: number }): UnifiedCryptoSpotQuote | null {
  const code = baseCode(base);
  if (!code) return null;
  const cached = quoteCache.get(code);
  if (!cached || !eligibleInstrument(code, cached.quote.source)) return null;
  const requestedAge = options?.maxAgeMs ?? HTX_MAX_AGE_MS;
  if (!Number.isFinite(requestedAge) || requestedAge < 0) return null;
  const maxAge = Math.min(requestedAge, HTX_MAX_AGE_MS);
  const timestamp = Date.parse(cached.quote.updatedAt);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() || Date.now() - timestamp > maxAge) return null;
  return copyQuote(cached.quote);
}
function tickerPatch(row: JsonRow, source: UnifiedCryptoSpotQuote['source'], price: number): UnifiedCryptoSpotQuote['patch'] {
  const patch: NonNullable<UnifiedCryptoSpotQuote['patch']> = {};
  const fields = source === 'Gate.io'
    ? { high24h: 'high_24h', low24h: 'low_24h', volume24h: 'base_volume', quoteVolume24h: 'quote_volume' }
    : { high24h: 'high', low24h: 'low', volume24h: 'amount', quoteVolume24h: 'vol' };
  for (const [key, field] of Object.entries(fields)) {
    const value = numeric(row[field]);
    if (value !== null && (key === 'volume24h' || key === 'quoteVolume24h' ? value >= 0 : value > 0)) {
      patch[key as keyof typeof fields] = value;
    }
  }
  if (source === 'Gate.io') {
    const change = numeric(row.change_percentage);
    if (change !== null && change > -100) {
      const open = price / (1 + change / 100);
      if (Number.isFinite(open) && open > 0) { patch.changePercent = change; patch.todayOpen = open; }
    }
  } else {
    const open = positive(row.open);
    if (open !== null) {
      patch.todayOpen = open;
      const change = (price / open - 1) * 100;
      if (Number.isFinite(change)) patch.changePercent = change;
    }
  }
  return Object.keys(patch).length ? patch : undefined;
}
async function fetchSpotQuote(code: string): Promise<{ quote: UnifiedCryptoSpotQuote | null; error: string | null }> {
  const errors: string[] = [];
  const gate = eligibleInstrument(code, 'Gate.io');
  if (gate) try {
    const data = await fetchJson(`${GATE}/tickers?currency_pair=${encodeURIComponent(gate.pair)}`);
    const rows = Array.isArray(data) ? data.map(rowOf).filter(row => row?.currency_pair === gate.pair) : [];
    const price = rows.length === 1 ? positive(rows[0]?.last) : null; // NOT mark_price.
    if (price !== null && eligibleInstrument(code, 'Gate.io')) {
      const patch = tickerPatch(rows[0]!, 'Gate.io', price);
      return { quote: { code, price, currency: 'USDT', source: 'Gate.io',
        updatedAt: new Date(Date.now()).toISOString(), ...(patch ? { patch } : {}) }, error: null };
    }
    errors.push('Gate.io invalid or unverified spot quote');
  } catch (error) { errors.push(`Gate.io: ${errorMessage(error)}`); }
  const htx = eligibleInstrument(code, 'HTX');
  if (htx) try {
    const data = rowOf(await fetchJson(`${HTX}/market/detail/merged?symbol=${encodeURIComponent(htx.pair)}`));
    const price = positive(rowOf(data?.tick)?.close);
    const timestamp = positive(data?.ts);
    if (price !== null && timestamp !== null && data?.status === 'ok'
      && data.ch === `market.${htx.pair}.detail.merged` && timestamp <= Date.now()
      && Date.now() - timestamp <= HTX_MAX_AGE_MS && eligibleInstrument(code, 'HTX')) {
      const patch = tickerPatch(rowOf(data.tick)!, 'HTX', price);
      return { quote: { code, price, currency: 'USDT', source: 'HTX',
        updatedAt: new Date(timestamp).toISOString(), ...(patch ? { patch } : {}) }, error: null };
    }
    errors.push('HTX invalid, stale or unverified spot quote');
  } catch (error) { errors.push(`HTX: ${errorMessage(error)}`); }
  return { quote: null, error: errors.join('; ') || 'no fresh active USDT spot directory evidence' };
}
function quoteFor(code: string, force: boolean): Promise<UnifiedCryptoSpotQuote | null> {
  // Even force joins a prior attempt. Non-force also joins instead of serving an old
  // cached price while a forced refresh is pending.
  const flight = quoteFlights.get(code);
  if (flight) return flight;
  if (!force) {
    const cached = peekUnifiedCryptoSpotQuote(code);
    if (cached && (quoteCache.get(code)?.expiresAt ?? 0) > Date.now()) return Promise.resolve(cached);
    if ((quoteMisses.get(code) ?? 0) > Date.now()) return Promise.resolve(null);
  }
  if (quoteFlights.size >= MAX_CODES) return Promise.resolve(null);
  const prior = health.get(code);
  const attempt: AttemptHealth = { source: prior?.source ?? null, lastSuccessAt: prior?.lastSuccessAt ?? null,
    lastAttemptAt: new Date(Date.now()).toISOString(), consecutiveFailures: prior?.consecutiveFailures ?? 0,
    lastError: prior?.lastError ?? null };
  boundedSet(health, code, attempt);
  const pending = (async () => {
    try {
      const fetched = await fetchSpotQuote(code);
      const quote = fetched.quote;
      if (quote && eligibleInstrument(code, quote.source)) {
        boundedSet(quoteCache, code, { quote, expiresAt: Date.now() + QUOTE_TTL_MS });
        quoteMisses.delete(code);
        boundedSet(health, code, { ...attempt, source: quote.source, lastSuccessAt: quote.updatedAt,
          consecutiveFailures: 0, lastError: null });
        return quote;
      }
      // A failed refresh never returns 0, the previous success, or an invented timestamp.
      quoteCache.delete(code);
      boundedSet(quoteMisses, code, Date.now() + QUOTE_RETRY_MS);
      boundedSet(health, code, { ...attempt, consecutiveFailures: attempt.consecutiveFailures + 1,
        lastError: fetched.error ?? 'spot eligibility expired during request' });
      return null;
    } finally { quoteFlights.delete(code); }
  })();
  quoteFlights.set(code, pending);
  return pending;
}

/** At most 216 inputs and globally 216 quote flights, regardless of overlapping callers.
 * force bypasses success/miss TTL only; never directory TTL/retry or request limits.
 */
export async function getUnifiedCryptoSpotQuotes(
  baseCodes: readonly string[], options?: { force?: boolean },
): Promise<Record<string, UnifiedCryptoSpotQuote>> {
  const codes = Array.from(new Set(baseCodes.slice(0, MAX_CODES).map(baseCode)
    .filter((code): code is string => code !== null)));
  if (!codes.length) return {};
  await ensureDirectories();
  const result: Record<string, UnifiedCryptoSpotQuote> = {};
  await Promise.all(codes.map(async code => {
    if (!peekUnifiedCryptoSpotInstrument(code)) return;
    const quote = await quoteFor(code, options?.force === true);
    if (quote && eligibleInstrument(code, quote.source)) result[code] = copyQuote(quote);
  }));
  return result;
}
/** Health is computed at read time; a last successful source/time is diagnostic,
 * not permission to serve stale data. Never fetches, even for unknown codes.
 */
export function getUnifiedCryptoSpotQuoteHealth(base: string): UnifiedCryptoSpotQuoteHealth {
  const code = baseCode(base) ?? String(base);
  const previous = health.get(code);
  const directoryVerified = !!peekUnifiedCryptoSpotInstrument(code);
  return { code, stale: !peekUnifiedCryptoSpotQuote(code), directoryVerified,
    inFlight: quoteFlights.has(code), source: previous?.source ?? null,
    lastSuccessAt: previous?.lastSuccessAt ?? null, lastAttemptAt: previous?.lastAttemptAt ?? null,
    consecutiveFailures: previous?.consecutiveFailures ?? 0,
    lastError: directoryVerified ? previous?.lastError ?? null : 'no fresh active USDT spot directory evidence' };
}
/** Read-only diagnostics, including independent source directory status and hard limits. */
export function getUnifiedCryptoSpotQuoteCacheStatus() {
  const describe = (state: SourceDirectory) => ({ stale: Date.now() >= state.expiresAt,
    updatedAt: state.updatedAt, expiresAt: state.expiresAt, retryAt: state.retryAt,
    lastError: state.lastError, inFlight: !!state.flight, size: state.rows.size });
  return { activeRequests, pendingRequests: requestWaiters.length, quoteFlights: quoteFlights.size,
    cachedQuotes: quoteCache.size, directory: { gate: describe(gateDirectory), htx: describe(htxDirectory) },
    limits: { maxCodes: MAX_CODES, maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
      maxPendingRequests: MAX_PENDING_REQUESTS, quoteTtlMs: QUOTE_TTL_MS, directoryTtlMs: DIRECTORY_TTL_MS } };
}
