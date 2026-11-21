/**
 * Authorized accounting conversion: USDT/USD = 1, multiplied by real USD/CNY evidence.
 * The parity leg is an accounting policy, never a USDT/USD market quote.
 * Historical closes reuse verified USD/CNY archives/near-cutoff evidence and A-session anchors;
 * they never reconstruct a past close from a current USD quote. No DB/router/scanner imports.
 */
import { fetchStockUsdCnyAtClose } from './stock-usd-cny-rate';
import { getLiveUsdtCnyQuote, type UsdtCnyQuote } from './usdt-cny-rate';
import { getUnifiedStockCloseSnapshotDate } from '../shared/stock-unified-close-policy';
import { isStockMarketSession, isStockSessionDate } from '../shared/stock-market-session';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE, USDT_USD_PARITY_RATE } from '../shared/usdt-usd-parity-policy';
import { validateCryptoUsdCnyClosePoint } from './crypto-portfolio-usd-anchor';
import type { StockUsdCnyClosePoint } from './stock-usd-cny-rate';

export type CryptoUsdtCnyProvenance = {
  conversionPolicy: typeof USDT_USD_PARITY_POLICY;
  carried: boolean;
  /** carried时为最近已发布A股日15:05外汇anchor，不伪称自然日的新外汇收盘。 */
  forexSnapshotDate?: string;
  usdCnyRate: number;
  usdCnyAsOf: string;
  usdCnySource: string;
  usdtUsdRate: typeof USDT_USD_PARITY_RATE;
  /** 本日15:05记账政策估值适用时点；不是市场报价/成交时点。 */
  usdtUsdAsOf: string;
  usdtUsdSource: typeof USDT_USD_PARITY_SOURCE;
  /** 本次读取证据的真实时刻，与USD证据和政策适用时点分别保留。 */
  observedAt: string;
};
/** Live values use exactly the unified USDT/CNY entry's contract, cache and evidence. */
export type CryptoUsdtCnyQuote = UsdtCnyQuote;
export type CryptoUsdtCnyClosePoint = CryptoUsdtCnyProvenance & {
  snapshotDate: string;
  usdtCnyRate: number;
  /** 较旧的证据时刻，周末仍为原USD anchor的真实asOf。 */
  asOf: string;
  source: string;
  pair: 'USDT/CNY';
  lockedAt: string;
};
export type CryptoUsdtCnyCloseOptions = {
  /** Caller validates persistent scope/policy; this pure module revalidates point evidence. */
  usdCnyClose?: StockUsdCnyClosePoint | null;
  /** Optional transaction-owned shared fallback, so mixed USD/USDT scopes request USD only once. */
  fetchUsdCnyAtClose?: (anchor: string) => Promise<StockUsdCnyClosePoint | null>;
};
type ForexLeg = { rate: number; asOf: string; source: string; anchor: string; carried: boolean };
const TTL_MS = 30_000;
const MAX_CACHE = 64;
const closeCache = new Map<string, { quote: CryptoUsdtCnyClosePoint | null; expiresAt: number }>();
const closeFlights = new Map<string, Promise<CryptoUsdtCnyClosePoint | null>>();

const cutoffMs = (date: string) => Date.parse(`${date}T15:05:00+08:00`);
function copy<T extends object>(value: T | null): T | null { return value ? { ...value } : null; }
function trimCache() { while (closeCache.size > MAX_CACHE) closeCache.delete(closeCache.keys().next().value!); }

/** 非A交易日使用现有证券anchor；A交易日缺价不能偷换成前日价。 */
async function forexClose(date: string, anchor: string, options: CryptoUsdtCnyCloseOptions): Promise<ForexLeg | null> {
  try {
    if (!isStockMarketSession(anchor, 'A') || cutoffMs(anchor) > Date.now()) return null;
    const point = validateCryptoUsdCnyClosePoint(options.usdCnyClose, anchor)
      ?? validateCryptoUsdCnyClosePoint(await (options.fetchUsdCnyAtClose ?? fetchStockUsdCnyAtClose)(anchor), anchor);
    if (!point) return null;
    return { rate: point.usdCnyRate, asOf: point.asOf, source: point.source, anchor, carried: anchor !== date };
  } catch { return null; }
}

function provenance(date: string, forex: ForexLeg): CryptoUsdtCnyProvenance {
  return { conversionPolicy: USDT_USD_PARITY_POLICY, carried: forex.carried, forexSnapshotDate: forex.anchor,
    usdCnyRate: forex.rate, usdCnyAsOf: forex.asOf, usdCnySource: forex.source,
    usdtUsdRate: USDT_USD_PARITY_RATE, usdtUsdAsOf: new Date(cutoffMs(date)).toISOString(), usdtUsdSource: USDT_USD_PARITY_SOURCE,
    observedAt: new Date().toISOString() };
}
function source(forex: ForexLeg): string {
  return `${USDT_USD_PARITY_SOURCE}_x_${forex.source}${forex.carried ? `_carried_A_anchor_${forex.anchor}` : ''}`;
}

/** 保留旧export兼容调用；实时记账政策不以该判定另行要求Coinbase或旧anchor。
 * 纽约周五17点至周日17点，Intl处理EST/EDT。
 */
export function isCryptoFxWeekendClosed(now: Date): boolean {
  if (!Number.isFinite(now.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value, hour = Number(parts.find(p => p.type === 'hour')?.value);
  return weekday === 'Sat' || weekday === 'Fri' && hour >= 17 || weekday === 'Sun' && hour < 17;
}

/** Delegate without a second cache/provider choice: weekends also use the unified live USD evidence. */
export async function getLiveCryptoUsdtCnyQuote(): Promise<CryptoUsdtCnyQuote | null> {
  return copy(await getLiveUsdtCnyQuote());
}

export async function fetchCryptoUsdtCnyAtClose(date: string, options: CryptoUsdtCnyCloseOptions = {}): Promise<CryptoUsdtCnyClosePoint | null> {
  if (!isStockSessionDate(date) || cutoffMs(date) > Date.now()) return null;
  let anchor: string;
  try { anchor = isStockMarketSession(date, 'A') ? date : getUnifiedStockCloseSnapshotDate(new Date(cutoffMs(date))); }
  catch { return null; }
  const supplied = validateCryptoUsdCnyClosePoint(options.usdCnyClose, anchor);
  // A prior upstream null or different source cannot mask a newly available archived leg.
  const key = supplied ? JSON.stringify([date, supplied.snapshotDate, supplied.usdCnyRate, supplied.source, supplied.asOf, supplied.lockedAt]) : date;
  const cached = closeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return copy(cached.quote);
  const existing = closeFlights.get(key);
  if (existing) return copy(await existing);
  if (closeFlights.size >= 4) return null; // 本模块最多4日期并发，不扩展供应商全历史扫描。
  const pending = (async () => {
    try {
      const forex = await forexClose(date, anchor, { ...options, usdCnyClose: supplied });
      if (!forex) return null;
      return { ...provenance(date, forex), snapshotDate: date,
        usdtCnyRate: USDT_USD_PARITY_RATE * forex.rate, asOf: forex.asOf, source: source(forex),
        pair: 'USDT/CNY' as const, lockedAt: `${date}T15:05:00+08:00` };
    } catch { return null; }
  })();
  closeFlights.set(key, pending);
  try {
    const quote = await pending;
    closeCache.delete(key);
    closeCache.set(key, { quote, expiresAt: Date.now() + (quote ? 24 * 60 * 60_000 : TTL_MS) });
    trimCache();
    return copy(quote);
  } finally { closeFlights.delete(key); }
}
