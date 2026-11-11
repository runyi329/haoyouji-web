const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const LIVE_CACHE_MS = 30_000;
const MAX_HISTORY_GAP_MS = 30 * 60 * 1000;
const CLOSE_CAPTURE_GRACE_MS = 30_000;
const CLOSE_MEMORY_MS = 2 * 86_400_000;
const YAHOO_SYMBOL = 'CNY=X';

type RateSource = 'sina_usdcny' | 'yahoo_usdcny_5m';
export type StockUsdCnyQuote = {
  rate: number;
  asOf: string;
  source: RateSource;
  pair: 'USD/CNY';
  stale: boolean;
};
export type StockUsdCnyClosePoint = {
  snapshotDate: string;
  usdCnyRate: number;
  asOf: string;
  source: RateSource;
  pair: 'USD/CNY';
  lockedAt: string;
};
// Historical bars remain Yahoo-only; broadening close sources does not relabel history.
export type StockUsdCnyHistoryPoint = Omit<StockUsdCnyClosePoint, 'source'> & {
  source: 'yahoo_usdcny_5m';
};

type CacheEntry = { quote: StockUsdCnyQuote; expiresAt: number };
type CapturedQuote = { quote: StockUsdCnyQuote; capturedAt: number };
let liveCache: CacheEntry | null = null;
let lastValid: StockUsdCnyQuote | null = null;
let liveInFlight: Promise<StockUsdCnyQuote | null> | null = null;
// One latest eligible observation per Beijing date, at most two dates. Never durable evidence.
const closeQuotes = new Map<string, CapturedQuote>();

const validDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date;
};
const validTime = (time: string) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return false;
  return true;
};
const validRate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100;
const beijingDate = (epochMs: number) => new Date(epochMs + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
const cutoffMs = (date: string) => Date.parse(`${date}T15:05:00+08:00`);
const toIso = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString();

function eligibleCloseQuote(quote: StockUsdCnyQuote, date: string, capturedAt: number): boolean {
  const asOf = Date.parse(quote.asOf);
  const cutoff = cutoffMs(date);
  return quote.source === 'sina_usdcny' && quote.pair === 'USD/CNY' && !quote.stale
    && validRate(quote.rate) && Number.isFinite(asOf)
    && asOf >= cutoff - MAX_HISTORY_GAP_MS && asOf <= cutoff
    && capturedAt >= asOf && capturedAt - asOf <= MAX_HISTORY_GAP_MS
    && capturedAt <= cutoff + CLOSE_CAPTURE_GRACE_MS && beijingDate(capturedAt) === date;
}

function pruneCloseQuotes(now: number): void {
  for (const [date, entry] of closeQuotes) {
    if (entry.capturedAt > now || now - entry.capturedAt >= CLOSE_MEMORY_MS) closeQuotes.delete(date);
  }
}

function rememberCloseQuote(quote: StockUsdCnyQuote, capturedAt: number): void {
  pruneCloseQuotes(capturedAt);
  const date = beijingDate(capturedAt);
  if (!eligibleCloseQuote(quote, date, capturedAt)) return;
  const previous = closeQuotes.get(date);
  if (!previous || Date.parse(quote.asOf) > Date.parse(previous.quote.asOf)) {
    closeQuotes.set(date, { quote: { ...quote }, capturedAt });
  }
  while (closeQuotes.size > 2) closeQuotes.delete([...closeQuotes.keys()].sort()[0]);
}

function capturedClosePoint(date: string, now: number): StockUsdCnyClosePoint | null {
  pruneCloseQuotes(now);
  const entry = closeQuotes.get(date);
  if (!entry || !eligibleCloseQuote(entry.quote, date, entry.capturedAt)) return null;
  return {
    snapshotDate: date, usdCnyRate: entry.quote.rate, asOf: entry.quote.asOf,
    source: 'sina_usdcny', pair: 'USD/CNY', lockedAt: `${date}T15:05:00+08:00`,
  };
}

function parseSinaQuote(text: string, now = new Date()): StockUsdCnyQuote | null {
  const match = text.match(/(?:^|\n)\s*var\s+hq_str_USDCNY\s*=\s*"([^"]*)"/);
  if (!match) return null;
  const parts = match[1].split(',');
  const time = parts[0]?.trim();
  const rate = Number(parts[1]);
  const date = parts[10]?.trim();
  if (!date || !validDate(date) || !time || !validTime(time) || !validRate(rate)) return null;
  const asOf = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+08:00`);
  if (!Number.isFinite(asOf.getTime()) || asOf.getTime() > now.getTime() + 5_000) return null;
  return { rate, asOf: asOf.toISOString(), source: 'sina_usdcny', pair: 'USD/CNY', stale: false };
}

export function parseStockUsdCnySina(payload: string | Uint8Array, now = new Date()): StockUsdCnyQuote | null {
  const text = typeof payload === 'string' ? payload : new TextDecoder('gbk').decode(payload);
  return parseSinaQuote(text, now);
}

export async function getLiveStockUsdCnyQuote(forceFresh = false): Promise<StockUsdCnyQuote | null> {
  const now = Date.now();
  pruneCloseQuotes(now);
  if (!forceFresh && liveCache && liveCache.expiresAt > now) return liveCache.quote;
  if (liveInFlight) return liveInFlight;
  liveInFlight = (async () => {
    try {
      const response = await fetch('https://hq.sinajs.cn/list=USDCNY', {
        headers: { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Sina HTTP ${response.status}`);
      const quote = parseStockUsdCnySina(new Uint8Array(await response.arrayBuffer()));
      if (!quote) throw new Error('invalid Sina USDCNY payload');
      const capturedAt = Date.now();
      rememberCloseQuote(quote, capturedAt);
      lastValid = quote;
      liveCache = { quote, expiresAt: capturedAt + LIVE_CACHE_MS };
      return quote;
    } catch {
      return lastValid ? { ...lastValid, stale: true } : null;
    } finally {
      liveInFlight = null;
    }
  })();
  return liveInFlight;
}

/** Call from existing 15:00 / 15:05 intraday jobs, before slow stock requests.
 * Uses the real response capture time, not the optional scheduling time, as evidence.
 * Memory is only for retries; the caller must independently persist/freeze the close point.
 */
export async function captureStockUsdCnyBeforeClose(now = new Date()): Promise<StockUsdCnyQuote | null> {
  if (!Number.isFinite(now.getTime())) return null;
  const date = beijingDate(now.getTime());
  const cutoff = cutoffMs(date);
  if (now.getTime() < cutoff - MAX_HISTORY_GAP_MS || now.getTime() > cutoff) return null;
  const quote = await getLiveStockUsdCnyQuote(true);
  return quote && eligibleCloseQuote(quote, date, Date.now()) ? { ...quote } : null;
}

function yahooBars(payload: unknown): Array<{ timestamp: number; close: number }> {
  let root: any;
  try { root = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch { return []; }
  const result = root?.chart?.result?.[0];
  if (root?.chart?.error || result?.meta?.symbol !== YAHOO_SYMBOL || result?.meta?.currency !== 'CNY'
    || result?.meta?.instrumentType !== 'CURRENCY' || result?.meta?.dataGranularity !== '5m') return [];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) return [];
  return timestamps.map((timestamp: unknown, i: number) => ({ timestamp, close: closes[i] }))
    .filter((bar): bar is { timestamp: number; close: number } =>
      typeof bar.timestamp === 'number' && Number.isSafeInteger(bar.timestamp)
      && bar.timestamp <= (8_640_000_000_000_000 - BEIJING_OFFSET_MS - 300_000) / 1000
      && bar.timestamp > 0 && bar.timestamp % 300 === 0 && validRate(bar.close));
}

export function parseStockUsdCnyHistory(payload: unknown, aDates: string[], now = new Date()): StockUsdCnyHistoryPoint[] {
  const bars = yahooBars(payload).sort((a, b) => a.timestamp - b.timestamp);
  const nowMs = now.getTime();
  return aDates.filter(validDate).map((snapshotDate) => {
    const cutoff = cutoffMs(snapshotDate);
    const candidates = bars.filter((bar) => {
      const start = bar.timestamp * 1000;
      const end = start + 300_000;
      return end <= cutoff && end <= nowMs && cutoff - end <= MAX_HISTORY_GAP_MS
        && beijingDate(start) === snapshotDate;
    });
    const bar = candidates.at(-1);
    if (!bar) return null;
    const asOf = toIso(bar.timestamp + 300);
    return { snapshotDate, usdCnyRate: bar.close, asOf, source: 'yahoo_usdcny_5m', pair: 'USD/CNY', lockedAt: `${snapshotDate}T15:05:00+08:00` };
  }).filter((point): point is StockUsdCnyHistoryPoint => point !== null);
}

export async function fetchStockUsdCnyAtClose(date: string): Promise<StockUsdCnyClosePoint | null> {
  if (!validDate(date)) return null;
  const now = new Date();
  const cutoff = cutoffMs(date);
  if (now.getTime() < cutoff) return null;
  const captured = capturedClosePoint(date, now.getTime());
  if (captured) return captured;
  // A late current quote cannot reconstruct 15:05. Only refresh at the close instant.
  if (now.getTime() <= cutoff + CLOSE_CAPTURE_GRACE_MS) {
    await getLiveStockUsdCnyQuote(true);
    const fresh = capturedClosePoint(date, Date.now());
    if (fresh) return fresh;
  }
  const center = Date.parse(`${date}T00:00:00+08:00`);
  const period1 = Math.floor((center - 86_400_000) / 1000);
  const period2 = Math.floor((center + 86_400_000 * 2) / 1000);
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const url = `https://${host}/v8/finance/chart/${YAHOO_SYMBOL}?interval=5m&period1=${period1}&period2=${period2}&events=history`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) continue;
      const point = parseStockUsdCnyHistory(await response.json(), [date], now)[0];
      if (point) return point;
    } catch {
      // Try the other Yahoo host, never substitute a live/current or fixed rate.
    }
  }
  return null;
}

export const __stockUsdCnyTest = {
  reset(): void { liveCache = null; lastValid = null; liveInFlight = null; closeQuotes.clear(); },
  beijingDate,
};
