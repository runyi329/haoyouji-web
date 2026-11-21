/**
 * 只读 USDT/CNY 记账参考：用户授权 1 USDT = 1 USD，直接复用真实 USD/CNY。
 * 不是交易所 USDT/USD 市价；不导入 crypto FX/routers/DB/scanner，不补写历史收盘。
 */
import { getLiveStockUsdCnyQuote } from './stock-usd-cny-rate';
import {
  USDT_USD_PARITY_POLICY,
  USDT_USD_PARITY_RATE,
  USDT_USD_PARITY_SOURCE,
} from '../shared/usdt-usd-parity-policy';

export type UsdtCnyQuote = {
  rate: number;
  pair: 'USDT/CNY';
  source: string;
  /** 原始美元报价证据时间，不用组装时间替换。 */
  asOf: string;
  /** 本服务读取并组装的时间，不代表新美元采样；缓存命中不更新。 */
  observedAt: string;
  stale: boolean;
  carried: boolean;
  forexSnapshotDate?: string;
  conversionPolicy: typeof USDT_USD_PARITY_POLICY;
  usdtUsdRate: typeof USDT_USD_PARITY_RATE;
  /** 政策适用的估值证据时点，不是交易所 USDT/USD 价格时点。 */
  usdtUsdAsOf: string;
  usdtUsdSource: typeof USDT_USD_PARITY_SOURCE;
  usdCnyRate: number;
  usdCnyAsOf: string;
  usdCnySource: string;
};

type CacheEntry = { value: UsdtCnyQuote | null; expiresAt: number };
const TTL_MS = 30_000;
const FAILURE_TTL_MS = 5_000;
let cache: CacheEntry | null = null;
let flight: Promise<UsdtCnyQuote | null> | null = null;
let generation = 0;

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const time = (value: unknown): number => nonempty(value) ? Date.parse(value) : NaN;
const inPast = (value: unknown, now: number): boolean => Number.isFinite(time(value)) && time(value) > 0 && time(value) <= now;
const copy = (quote: UsdtCnyQuote | null): UsdtCnyQuote | null => quote ? { ...quote } : null;
const policySource = (usdSource: string): string => `${USDT_USD_PARITY_SOURCE}_x_${usdSource}`;

function usable(quote: UsdtCnyQuote, now: number): boolean {
  return quote.pair === 'USDT/CNY' && positive(quote.rate) && quote.stale === false
    && typeof quote.carried === 'boolean'
    && quote.conversionPolicy === USDT_USD_PARITY_POLICY
    && quote.usdtUsdRate === USDT_USD_PARITY_RATE && quote.usdtUsdSource === USDT_USD_PARITY_SOURCE
    && positive(quote.usdCnyRate) && quote.rate === quote.usdCnyRate
    && nonempty(quote.usdCnySource) && quote.source === policySource(quote.usdCnySource)
    && inPast(quote.asOf, now) && inPast(quote.observedAt, now)
    && time(quote.asOf) <= time(quote.observedAt)
    && quote.usdtUsdAsOf === quote.asOf && quote.usdCnyAsOf === quote.asOf
    && now - time(quote.observedAt) < TTL_MS;
}

async function accountingQuote(forceFresh: boolean): Promise<UsdtCnyQuote | null> {
  try {
    const usd = await getLiveStockUsdCnyQuote(forceFresh);
    const now = Date.now();
    if (!usd || usd.pair !== 'USD/CNY' || usd.stale !== false || !positive(usd.rate)
      || !nonempty(usd.source) || !inPast(usd.asOf, now)) return null;
    // 周末/休市证据有效性遵循上游美元服务，不另设美元腿 max-age 或另取历史 anchor。
    return {
      rate: usd.rate, pair: 'USDT/CNY', source: policySource(usd.source),
      asOf: usd.asOf, observedAt: new Date(now).toISOString(), stale: false, carried: false,
      conversionPolicy: USDT_USD_PARITY_POLICY, usdtUsdRate: USDT_USD_PARITY_RATE,
      usdtUsdAsOf: usd.asOf, usdtUsdSource: USDT_USD_PARITY_SOURCE,
      usdCnyRate: usd.rate, usdCnyAsOf: usd.asOf, usdCnySource: usd.source,
    };
  } catch { return null; }
}

/** 只读内存，不联网；过期、stale、未来或无效证据返回 null。 */
export function peekUsdtCnyQuote(): UsdtCnyQuote | null {
  const now = Date.now();
  if (!cache) return null;
  if (cache.expiresAt <= now || cache.value && !usable(cache.value, now)) {
    cache = null;
    return null;
  }
  return copy(cache.value);
}

/**
 * forceFresh 跳过本服务正/负缓存并传递给美元服务，仍加入已有 singleflight。
 * 刷新失败移除旧成功值，不使用无限 last-good；返回值与上游/缓存对象隔离。
 */
export async function getLiveUsdtCnyQuote(forceFresh = false): Promise<UsdtCnyQuote | null> {
  if (flight) {
    const value = await flight;
    return value && usable(value, Date.now()) ? copy(value) : null;
  }
  if (!forceFresh && cache && cache.expiresAt > Date.now()) {
    if (!cache.value) return null;
    const cached = peekUsdtCnyQuote();
    if (cached) return cached;
  }
  cache = null;
  const currentGeneration = generation;
  const pending = accountingQuote(forceFresh);
  flight = pending;
  try {
    const value = await pending;
    const now = Date.now();
    const valid = value && usable(value, now) ? value : null;
    if (generation === currentGeneration) {
      cache = { value: valid, expiresAt: valid ? time(valid.observedAt) + TTL_MS : now + FAILURE_TTL_MS };
    }
    return copy(valid);
  } finally {
    if (flight === pending) flight = null;
  }
}

export const __usdtCnyTest = {
  reset(): void { generation++; cache = null; flight = null; },
};
