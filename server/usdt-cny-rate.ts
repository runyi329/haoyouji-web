/**
 * 只读实时 USDT/CNY 参考：CoinGecko tether/CNY → OKX C2C 买价 → 现有真实双腿桥接。
 * 不导入 routers/DB/scanner，不注册后台任务，不参与或补写 15:05 历史收盘。
 * USD/CNY 不是 USDT/CNY；桥接必须同时保留真实 USDT/USD 与 USD/CNY 两腿证据。
 */
import { getLiveCryptoUsdtCnyQuote } from './crypto-portfolio-fx';

export type UsdtCnyQuote = {
  rate: number;
  pair: 'USDT/CNY';
  source: string;
  /** 提供商证据时间；OKX 无原生时间，明确为 sampled_reference 采样时间。 */
  asOf: string;
  /** 实际读取证据的时间，不将命中缓存伪称本次新取数。 */
  observedAt: string;
  stale: boolean;
  carried: boolean;
  forexSnapshotDate?: string;
  usdtUsdRate?: number;
  usdtUsdAsOf?: string;
  usdtUsdSource?: string;
  usdCnyRate?: number;
  usdCnyAsOf?: string;
  usdCnySource?: string;
};

type Kind = 'coingecko' | 'okx' | 'bridge';
type Candidate = { quote: UsdtCnyQuote; kind: Kind };
type CacheEntry = { value: Candidate | null; expiresAt: number };
const TTL_MS = 30_000;
const FAILURE_TTL_MS = 5_000;
const MAX_COINGECKO_AGE_MS = 10 * 60_000;
const MAX_USDT_USD_AGE_MS = 10 * 60_000;
const MAX_LIVE_FOREX_AGE_MS = 30 * 60_000;
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cny&include_last_updated_at=true';
const OKX_URL = 'https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=CNY&baseCurrency=USDT&side=buy&paymentMethod=all&userType=all&showTrade=false&showFollow=false&showAlreadyTraded=false&isAbleFilter=false';
let cache: CacheEntry | null = null;
let flight: Promise<Candidate | null> | null = null;
let generation = 0;

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const time = (value: unknown): number => typeof value === 'string' && nonempty(value) ? Date.parse(value) : NaN;
const inPast = (value: unknown, now: number): boolean => Number.isFinite(time(value)) && time(value) > 0 && time(value) <= now;
const copy = (quote: UsdtCnyQuote | null): UsdtCnyQuote | null => quote ? { ...quote } : null;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** 验证真实桥接契约，尤其不能让 USD-only、stale 或无来源的值进入可用缓存。 */
function validBridge(quote: UsdtCnyQuote, now: number): boolean {
  if (!positive(quote.usdtUsdRate) || !positive(quote.usdCnyRate)
    || !nonempty(quote.usdtUsdSource) || !nonempty(quote.usdCnySource)
    || !inPast(quote.usdtUsdAsOf, now) || !inPast(quote.usdCnyAsOf, now)
    || time(quote.usdtUsdAsOf) > time(quote.observedAt) || time(quote.usdCnyAsOf) > time(quote.observedAt)
    || now - time(quote.usdtUsdAsOf) > MAX_USDT_USD_AGE_MS
    || time(quote.asOf) !== Math.min(time(quote.usdtUsdAsOf), time(quote.usdCnyAsOf))) return false;
  const product = quote.usdtUsdRate * quote.usdCnyRate;
  if (!positive(product) || Math.abs(quote.rate - product) > product * 1e-12) return false;
  if (!quote.carried) return now - time(quote.usdCnyAsOf) <= MAX_LIVE_FOREX_AGE_MS;
  // carried 的旧 A 股外汇 anchor 是有效来源证据，不错误套用实时腿的十分钟上限。
  const anchor = quote.forexSnapshotDate;
  if (typeof anchor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return false;
  const day = Date.parse(`${anchor}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== anchor) return false;
  const cutoff = Date.parse(`${anchor}T15:05:00+08:00`);
  return cutoff <= now && time(quote.usdCnyAsOf) <= cutoff
    && cutoff - time(quote.usdCnyAsOf) <= MAX_LIVE_FOREX_AGE_MS;
}

function usable(value: Candidate, now: number): boolean {
  const quote = value.quote;
  if (quote.pair !== 'USDT/CNY' || !positive(quote.rate) || !nonempty(quote.source)
    || quote.stale !== false || typeof quote.carried !== 'boolean'
    || !inPast(quote.asOf, now) || !inPast(quote.observedAt, now)
    || time(quote.asOf) > time(quote.observedAt)
    || now - time(quote.observedAt) >= TTL_MS) return false;
  if (value.kind === 'coingecko') return !quote.carried && now - time(quote.asOf) <= MAX_COINGECKO_AGE_MS;
  if (value.kind === 'okx') return !quote.carried && quote.asOf === quote.observedAt;
  return validBridge(quote, now);
}

async function json(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6_000) });
  if (!response.ok) throw new Error(`USDT/CNY HTTP ${response.status}`);
  return response.json();
}

async function coinGecko(): Promise<Candidate | null> {
  try {
    const payload = await json(COINGECKO_URL);
    const row = record(payload) && record(payload.tether) ? payload.tether : null;
    if (!row || !positive(row.cny) || typeof row.last_updated_at !== 'number'
      || !Number.isSafeInteger(row.last_updated_at) || row.last_updated_at <= 0) return null;
    const observed = Date.now();
    const updated = row.last_updated_at * 1000;
    if (updated > observed || observed - updated > MAX_COINGECKO_AGE_MS) return null;
    return { kind: 'coingecko', quote: { rate: row.cny, pair: 'USDT/CNY',
      source: 'coingecko_tether_cny', asOf: new Date(updated).toISOString(),
      observedAt: new Date(observed).toISOString(), stale: false, carried: false } };
  } catch { return null; }
}

/** URL 显式指定交易对/买方向；若响应也给出身份字段，则必须匹配，不能只拿一个 USD 价格。 */
function matchesOkxMarket(value: Record<string, unknown>): boolean {
  // OKX 官方返回 baseCurrency=usdt、quoteCurrency=cny；只规范大小写，绝不混同 USD/USDT。
  const matches = (field: string, expected: string): boolean => value[field] === undefined
    || typeof value[field] === 'string' && value[field].trim().toUpperCase() === expected;
  return matches('baseCurrency', 'USDT') && matches('quoteCurrency', 'CNY')
    && matches('side', 'BUY') && matches('pair', 'USDT/CNY');
}

async function okx(): Promise<Candidate | null> {
  try {
    const payload = await json(OKX_URL);
    if (!record(payload) || !matchesOkxMarket(payload)
      || (payload.code !== undefined && payload.code !== 0 && payload.code !== '0')
      || !record(payload.data) || !matchesOkxMarket(payload.data) || !Array.isArray(payload.data.buy)) return null;
    for (const item of payload.data.buy) {
      if (!record(item) || !matchesOkxMarket(item)) continue;
      const raw = item.price;
      // Number 而非 parseFloat：拒绝“7.1USD”等部分可解析的假价格和空白字符串。
      const rate = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
      if (!positive(rate)) continue;
      const sampledAt = new Date().toISOString();
      return { kind: 'okx', quote: { rate, pair: 'USDT/CNY',
        source: 'okx_c2c_usdt_cny_buy_sampled_reference', asOf: sampledAt,
        observedAt: sampledAt, stale: false, carried: false } };
    }
    return null;
  } catch { return null; }
}

async function bridge(): Promise<Candidate | null> {
  try {
    const quote = await getLiveCryptoUsdtCnyQuote();
    if (!quote) return null;
    // 保留上游真实 observedAt 和每一腿 metadata；不把上游缓存命中改标成新的采样。
    const value: Candidate = { kind: 'bridge', quote: { ...quote } };
    return usable(value, Date.now()) ? value : null;
  } catch { return null; }
}

function expiry(value: Candidate, now: number): number {
  let expiresAt = Math.min(now + TTL_MS, time(value.quote.observedAt) + TTL_MS);
  // 即使 30 秒 TTL 未到，提供商证据跨过 max-age 时也立即失效。
  if (value.kind === 'coingecko') expiresAt = Math.min(expiresAt, time(value.quote.asOf) + MAX_COINGECKO_AGE_MS + 1);
  if (value.kind === 'bridge') {
    expiresAt = Math.min(expiresAt, time(value.quote.usdtUsdAsOf) + MAX_USDT_USD_AGE_MS + 1);
    if (!value.quote.carried) expiresAt = Math.min(expiresAt, time(value.quote.usdCnyAsOf) + MAX_LIVE_FOREX_AGE_MS + 1);
  }
  return expiresAt;
}

/** 只读内存、不触发网络；过期、stale、未来或无效证据均返回 null。 */
export function peekUsdtCnyQuote(): UsdtCnyQuote | null {
  const now = Date.now();
  if (!cache) return null;
  if (cache.expiresAt <= now || cache.value && !usable(cache.value, now)) {
    cache = null;
    return null;
  }
  return copy(cache.value?.quote ?? null);
}

/**
 * forceFresh 跳过本服务的正/负缓存，但仍加入现有 singleflight。
 * 旧桥接 API 没有 force 参数；允许其仍有效的真实采样缓存，不伪造新 observedAt。
 * 任一刷新全源失败返回 null 并清除旧成功值；没有“无限 last good”降级。
 */
export async function getLiveUsdtCnyQuote(forceFresh = false): Promise<UsdtCnyQuote | null> {
  if (flight) {
    const value = await flight;
    return value && usable(value, Date.now()) ? copy(value.quote) : null;
  }
  if (!forceFresh && cache && cache.expiresAt > Date.now()) {
    if (!cache.value) return null;
    const cached = peekUsdtCnyQuote();
    if (cached) return cached;
  }
  cache = null;
  const currentGeneration = generation;
  const pending = (async (): Promise<Candidate | null> => {
    for (const provider of [coinGecko, okx, bridge]) {
      const value = await provider();
      if (value && usable(value, Date.now())) return value;
    }
    return null;
  })();
  flight = pending;
  try {
    const value = await pending;
    const now = Date.now();
    const valid = value && usable(value, now) ? value : null;
    if (generation === currentGeneration) cache = { value: valid, expiresAt: valid ? expiry(valid, now) : now + FAILURE_TTL_MS };
    return copy(valid?.quote ?? null);
  } finally {
    if (flight === pending) flight = null;
  }
}

export const __usdtCnyTest = {
  reset(): void { generation++; cache = null; flight = null; },
};
