/**
 * USDT/CNY = Coinbase USDT/USD真实现货参考 × 现有USD/CNY真实换汇数据。
 * 这是双腿桥接参考，不是USD/USDT等价假设，也不是CNY可交易市场/场外买价。
 * exchange.getRate中的提供商函数被路由闭包封装且USD/USDT混用，不能直接复用。
 * 复用stock-usd-cny-rate的独立只读函数；不导入routers，不调用DB/price-scanner汇率。
 * Coinbase公开价格：https://docs.cdp.coinbase.com/coinbase-business/track-apis/prices
 * 历史：https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles
 */
import { getLiveStockUsdCnyQuote, fetchStockUsdCnyAtClose } from './stock-usd-cny-rate';
import { getUnifiedStockCloseSnapshotDate } from '../shared/stock-unified-close-policy';
import { isStockMarketSession, isStockSessionDate } from '../shared/stock-market-session';

export type CryptoUsdtCnyProvenance = {
  carried: boolean;
  /** carried时为最近已发布A股日15:05外汇anchor，不伪称自然日的新外汇收盘。 */
  forexSnapshotDate?: string;
  usdCnyRate: number;
  usdCnyAsOf: string;
  usdCnySource: string;
  usdtUsdRate: number;
  usdtUsdAsOf: string;
  usdtUsdSource: string;
  /** 本次两腿完成取数的真实时刻，与旧外汇证据时刻不同。 */
  observedAt: string;
};
export type CryptoUsdtCnyQuote = CryptoUsdtCnyProvenance & {
  rate: number;
  /** 两腿中较旧的证据时刻；每一腿另保留独立时刻。 */
  asOf: string;
  source: string;
  pair: 'USDT/CNY';
  stale: boolean;
};
export type CryptoUsdtCnyClosePoint = CryptoUsdtCnyProvenance & {
  snapshotDate: string;
  usdtCnyRate: number;
  asOf: string;
  source: string;
  pair: 'USDT/CNY';
  lockedAt: string;
};
type Leg = { rate: number; asOf: string; source: string };
const TTL_MS = 30_000;
const MAX_GAP_MS = 30 * 60_000;
const MAX_CACHE = 64;
let liveCache: { quote: CryptoUsdtCnyQuote | null; expiresAt: number } | null = null;
let liveFlight: Promise<CryptoUsdtCnyQuote | null> | null = null;
const closeCache = new Map<string, { quote: CryptoUsdtCnyClosePoint | null; expiresAt: number }>();
const closeFlights = new Map<string, Promise<CryptoUsdtCnyClosePoint | null>>();

const cutoffMs = (date: string) => Date.parse(`${date}T15:05:00+08:00`);
const beijingDate = (time: number) => new Date(time + 8 * 60 * 60_000).toISOString().slice(0, 10);
const positive = (value: unknown): number | null => {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};
const validTime = (time: unknown): time is string => typeof time === 'string' && Number.isFinite(Date.parse(time)) && Date.parse(time) <= Date.now();

function copy<T extends object>(value: T | null): T | null { return value ? { ...value } : null; }
function trimCache() { while (closeCache.size > MAX_CACHE) closeCache.delete(closeCache.keys().next().value!); }
async function json(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6_000) });
  if (!response.ok) throw new Error(`FX HTTP ${response.status}`);
  return response.json();
}

async function liveUsdtUsd(): Promise<Leg | null> {
  try {
    const payload = await json('https://api.coinbase.com/v2/prices/USDT-USD/spot');
    const row = payload?.data;
    const rate = positive(row?.amount);
    if (rate === null || row.base !== 'USDT' || row.currency !== 'USD') return null;
    // v2 spot无交易时间字段，asOf明确是实际读取参考价的采样时刻，不编造交易时刻。
    return { rate, asOf: new Date().toISOString(), source: 'coinbase_usdt_usd_spot_reference_sampled' };
  } catch { return null; }
}

async function closeUsdtUsd(date: string): Promise<Leg | null> {
  const cutoff = cutoffMs(date);
  const start = cutoff - 60_000;
  try {
    const params = new URLSearchParams({ granularity: '60', start: new Date(start).toISOString(), end: new Date(cutoff).toISOString() });
    const rows = await json(`https://api.exchange.coinbase.com/products/USDT-USD/candles?${params}`);
    // Coinbase可能返回start之前或end之后的行；只能取15:04起点已结束的唯一行。
    const exact = Array.isArray(rows) ? rows.filter((row) => Array.isArray(row) && Number.isSafeInteger(row[0]) && row[0] * 1000 === start) : [];
    if (exact.length !== 1 || cutoff > Date.now()) return null;
    const rate = positive(exact[0][4]);
    if (rate === null) return null;
    return { rate, asOf: new Date(cutoff).toISOString(), source: 'coinbase_usdt_usd_spot_close_1505' };
  } catch { return null; }
}

/** 非A交易日使用现有证券anchor；A交易日缺价不能偷换成前日价。 */
async function forexClose(date: string, explicitAnchor?: string): Promise<(Leg & { anchor: string; carried: boolean }) | null> {
  try {
    const anchor = explicitAnchor ?? (isStockMarketSession(date, 'A') ? date : getUnifiedStockCloseSnapshotDate(new Date(cutoffMs(date))));
    if (!isStockMarketSession(anchor, 'A') || cutoffMs(anchor) > Date.now()) return null;
    const point = await fetchStockUsdCnyAtClose(anchor);
    if (!point || point.pair !== 'USD/CNY' || point.snapshotDate !== anchor || !validTime(point.asOf)
      || !['sina_usdcny', 'yahoo_usdcny_5m'].includes(point.source) || positive(point.usdCnyRate) === null) return null;
    const asOf = Date.parse(point.asOf);
    // 明确证明anchor 15:05前半小时内真实采样；不能把周末日期贴到周五外汇上。
    if (asOf > cutoffMs(anchor) || cutoffMs(anchor) - asOf > MAX_GAP_MS || beijingDate(asOf) !== anchor) return null;
    return { rate: point.usdCnyRate, asOf: point.asOf, source: point.source, anchor, carried: anchor !== date };
  } catch { return null; }
}

function provenance(usdt: Leg, forex: Leg, carried: boolean, anchor?: string): CryptoUsdtCnyProvenance {
  return { carried, ...(anchor ? { forexSnapshotDate: anchor } : {}),
    usdCnyRate: forex.rate, usdCnyAsOf: forex.asOf, usdCnySource: forex.source,
    usdtUsdRate: usdt.rate, usdtUsdAsOf: usdt.asOf, usdtUsdSource: usdt.source,
    observedAt: new Date().toISOString() };
}
function source(usdt: Leg, forex: Leg, carried: boolean, anchor?: string): string {
  return `bridge_${usdt.source}_x_${forex.source}${carried ? `_carried_A_anchor_${anchor}` : ''}`;
}
const olderAsOf = (a: Leg, b: Leg) => new Date(Math.min(Date.parse(a.asOf), Date.parse(b.asOf))).toISOString();

/** 仅判定明确全球周末闭市；不把交易日断网或公共假期猜成休市。
 * 纽约周五17点至周日17点，Intl处理EST/EDT。
 * https://www.dukascopy.com/swiss/english/fx-market-tools/forex-market-hours/
 */
export function isCryptoFxWeekendClosed(now: Date): boolean {
  if (!Number.isFinite(now.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value, hour = Number(parts.find(p => p.type === 'hour')?.value);
  return weekday === 'Sat' || weekday === 'Fri' && hour >= 17 || weekday === 'Sun' && hour < 17;
}

export async function getLiveCryptoUsdtCnyQuote(): Promise<CryptoUsdtCnyQuote | null> {
  if (liveCache && liveCache.expiresAt > Date.now()) return copy(liveCache.quote);
  if (liveFlight) return copy(await liveFlight);
  liveFlight = (async () => {
    try {
      const now = Date.now();
      const date = beijingDate(now);
      const nonSession = !isStockMarketSession(date, 'A');
      const weekendClosed = isCryptoFxWeekendClosed(new Date(now));
      const useClose = nonSession || weekendClosed;
      const carryAnchor = weekendClosed ? getUnifiedStockCloseSnapshotDate(new Date(now)) : undefined;
      const [usdt, forex] = await Promise.all([
        liveUsdtUsd(),
        useClose ? forexClose(date, carryAnchor) : getLiveStockUsdCnyQuote(),
      ]);
      if (!usdt || !forex || !validTime(forex.asOf) || positive(forex.rate) === null) return null;
      if (!useClose && (!('pair' in forex) || forex.pair !== 'USD/CNY')) return null;
      const carried = useClose && 'carried' in forex && forex.carried;
      const anchor = useClose && 'anchor' in forex ? forex.anchor : undefined;
      const stale = !carried && (('stale' in forex && forex.stale) || now - Date.parse(forex.asOf) > MAX_GAP_MS);
      const rate = usdt.rate * forex.rate;
      if (positive(rate) === null) return null;
      return { ...provenance(usdt, forex, carried, anchor), rate, asOf: olderAsOf(usdt, forex),
        source: source(usdt, forex, carried, anchor), pair: 'USDT/CNY' as const, stale };
    } catch { return null; }
  })();
  try {
    const quote = await liveFlight;
    liveCache = { quote, expiresAt: Date.now() + TTL_MS };
    return copy(quote);
  } finally { liveFlight = null; }
}

export async function fetchCryptoUsdtCnyAtClose(date: string): Promise<CryptoUsdtCnyClosePoint | null> {
  if (!isStockSessionDate(date) || cutoffMs(date) > Date.now()) return null;
  const cached = closeCache.get(date);
  if (cached && cached.expiresAt > Date.now()) return copy(cached.quote);
  const existing = closeFlights.get(date);
  if (existing) return copy(await existing);
  if (closeFlights.size >= 4) return null; // 本模块最多4日期并发，不扩展供应商全历史扫描。
  const pending = (async () => {
    try {
      const [usdt, forex] = await Promise.all([closeUsdtUsd(date), forexClose(date)]);
      if (!usdt || !forex) return null;
      const rate = usdt.rate * forex.rate;
      if (positive(rate) === null) return null;
      return { ...provenance(usdt, forex, forex.carried, forex.anchor), snapshotDate: date,
        usdtCnyRate: rate, asOf: olderAsOf(usdt, forex), source: source(usdt, forex, forex.carried, forex.anchor),
        pair: 'USDT/CNY' as const, lockedAt: `${date}T15:05:00+08:00` };
    } catch { return null; }
  })();
  closeFlights.set(date, pending);
  try {
    const quote = await pending;
    closeCache.delete(date);
    closeCache.set(date, { quote, expiresAt: Date.now() + (quote ? 24 * 60 * 60_000 : TTL_MS) });
    trimCache();
    return copy(quote);
  } finally { closeFlights.delete(date); }
}
