const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const LIVE_CACHE_MS = 30_000;
const MAX_HISTORY_GAP_MS = 30 * 60 * 1000;
const YAHOO_SYMBOL = 'CNY=X';

type RateSource = 'sina_usdcny' | 'yahoo_usdcny_5m';
export type StockUsdCnyQuote = {
  rate: number;
  asOf: string;
  source: RateSource;
  pair: 'USD/CNY';
  stale: boolean;
};
export type StockUsdCnyHistoryPoint = {
  snapshotDate: string;
  usdCnyRate: number;
  asOf: string;
  source: 'yahoo_usdcny_5m';
  pair: 'USD/CNY';
  lockedAt: string;
};

type CacheEntry = { quote: StockUsdCnyQuote; expiresAt: number };
let liveCache: CacheEntry | null = null;
let lastValid: StockUsdCnyQuote | null = null;
let liveInFlight: Promise<StockUsdCnyQuote | null> | null = null;

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

export async function getLiveStockUsdCnyQuote(): Promise<StockUsdCnyQuote | null> {
  const now = Date.now();
  if (liveCache && liveCache.expiresAt > now) return liveCache.quote;
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
      lastValid = quote;
      liveCache = { quote, expiresAt: Date.now() + LIVE_CACHE_MS };
      return quote;
    } catch {
      return lastValid ? { ...lastValid, stale: true } : null;
    } finally {
      liveInFlight = null;
    }
  })();
  return liveInFlight;
}

function yahooBars(payload: unknown): Array<{ timestamp: number; close: number }> {
  let root: any;
  try { root = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch { return []; }
  const result = root?.chart?.result?.[0];
  if (result?.meta?.symbol !== YAHOO_SYMBOL || result?.meta?.currency !== 'CNY'
    || result?.meta?.instrumentType !== 'CURRENCY' || result?.meta?.dataGranularity !== '5m') return [];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) return [];
  return timestamps.map((timestamp: unknown, i: number) => ({ timestamp: Number(timestamp), close: Number(closes[i]) }))
    .filter((bar: { timestamp: number; close: number }) => Number.isFinite(bar.timestamp) && validRate(bar.close));
}

export function parseStockUsdCnyHistory(payload: unknown, aDates: string[], now = new Date()): StockUsdCnyHistoryPoint[] {
  const bars = yahooBars(payload).sort((a, b) => a.timestamp - b.timestamp);
  const nowMs = now.getTime();
  return aDates.filter(validDate).map((snapshotDate) => {
    const cutoff = cutoffMs(snapshotDate);
    const candidates = bars.filter((bar) => {
      const start = bar.timestamp * 1000;
      const end = start + 300_000;
      return end <= cutoff && end <= nowMs && cutoff - end <= MAX_HISTORY_GAP_MS;
    });
    const bar = candidates.at(-1);
    if (!bar) return null;
    const asOf = toIso(bar.timestamp + 300);
    return { snapshotDate, usdCnyRate: bar.close, asOf, source: 'yahoo_usdcny_5m', pair: 'USD/CNY', lockedAt: `${snapshotDate}T15:05:00+08:00` };
  }).filter((point): point is StockUsdCnyHistoryPoint => point !== null);
}

export async function fetchStockUsdCnyAtClose(date: string): Promise<StockUsdCnyHistoryPoint | null> {
  if (!validDate(date)) return null;
  const now = new Date();
  if (now.getTime() < cutoffMs(date)) return null;
  const center = Date.parse(`${date}T00:00:00+08:00`);
  const period1 = Math.floor((center - 86_400_000) / 1000);
  const period2 = Math.floor((center + 86_400_000 * 2) / 1000);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${YAHOO_SYMBOL}?interval=5m&period1=${period1}&period2=${period2}&events=history`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    return parseStockUsdCnyHistory(await response.json(), [date], now)[0] ?? null;
  } catch {
    return null;
  }
}

export const __stockUsdCnyTest = {
  reset(): void { liveCache = null; lastValid = null; liveInFlight = null; },
  beijingDate,
};
