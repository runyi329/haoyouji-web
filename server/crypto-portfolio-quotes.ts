/**
 * 37号数字币现货行情。只读公共市场数据；不启动扫描、定时器或数据库。
 * 标的身份由 Gate/HTX 活动 USDT spot 目录分别确认；Gate 优先，HTX 备用。
 * Gate 模型/分钟线契约：https://github.com/gateio/gateapi-python/blob/master/docs/SpotApi.md
 * HTX 目录/分钟线契约：https://huobiapi.github.io/docs/spot/v1/en/
 * Gate 返回 [timestamp, quoteVolume, close, high, low, open, baseVolume, closed]。
 */
import { parsePortfolioInstrument } from '../shared/portfolio-instruments';
import { getUnifiedCryptoSpotDirectory, getUnifiedCryptoSpotQuotes, peekUnifiedCryptoSpotInstrument, peekUnifiedCryptoSpotQuote } from './crypto-spot-quote-cache';
import { touchCryptoQuoteDemand } from './crypto-quote-demand';
import { AI_WALLET_ASSET_CATALOG, AI_WALLET_CRYPTO_MARKET_ASSETS } from '../shared/ai-wallet-assets';

const walletCryptoNames = new Map(AI_WALLET_ASSET_CATALOG.filter(asset => (AI_WALLET_CRYPTO_MARKET_ASSETS as readonly string[]).includes(asset.code)).map(asset => [asset.code as string, asset.name]));

export type CryptoPortfolioQuote = {
  symbol: string;
  price: number;
  currency: 'USDT';
  source: string;
  /** 真实取数时刻；历史报价不伪装为15:05采样。 */
  updatedAt: string;
  /** 实时报价的北京采样日期；历史报价的目标北京快照日期。 */
  priceDate: string;
  /** 历史报价对应的分钟结束边界；不等同于取数时刻。 */
  cutoffAt?: string;
};

export type CryptoPortfolioSearchResult = {
  symbol: string;
  name: string;
  market: 'CRYPTO';
  currency: 'USDT';
  latestPrice: number | null;
  updatedAt: string | null;
  source: string | null;
  displaySymbol?: string;
  available?: boolean;
};

type SpotInstrument = { symbol: string; base: string; pair: string; name: string;
  gate?: { delistingAt: number | null }; htxPair?: string };
type CachedQuote = { quote: CryptoPortfolioQuote; expiresAt: number };
const GATE = 'https://api.gateio.ws/api/v4/spot';
const HTX = 'https://api.huobi.pro';
const RETRY_MS = 15_000;
const SCANNER_FRESH_MS = 120_000;
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_SYMBOLS = 216;
const MAX_SEARCH_RESULTS = 20;
const MAX_CACHE = 256;
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_PENDING_REQUESTS = 256;
const closeCache = new Map<string, CachedQuote>();
const closeMisses = new Map<string, number>();
const closeFlights = new Map<string, Promise<CryptoPortfolioQuote | null>>();
let activeRequests = 0;
const requestWaiters: Array<() => void> = [];

function boundedSet<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_CACHE) map.delete(map.keys().next().value!);
}

/** 全模块共用并发上限；排队也有上限，不能靠多次调用扩大并发。 */
async function fetchJson(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    if (requestWaiters.length >= MAX_PENDING_REQUESTS) throw new Error('quote request queue full');
    await new Promise<void>((resolve) => requestWaiters.push(resolve));
  } else {
    activeRequests += 1;
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    // 直接将占用的槽交给下一请求，避免唤醒后被新请求抢占。
    const next = requestWaiters.shift();
    if (next) next();
    else activeRequests -= 1;
  }
}

function positive(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function beijingDate(milliseconds: number): string {
  return new Date(milliseconds + 8 * 60 * 60_000).toISOString().slice(0, 10);
}

function cryptoSymbol(raw: unknown): string | null {
  const instrument = parsePortfolioInstrument(raw);
  return instrument?.market === 'CRYPTO' ? instrument.symbol : null;
}

function eligibleSource(instrument: SpotInstrument, source: string): boolean {
  if (source === 'Gate.io' || source === 'crypto_close_gate_1505') {
    return !!instrument.gate && (instrument.gate.delistingAt === null || instrument.gate.delistingAt > Date.now());
  }
  return (source === 'HTX' || source === 'crypto_close_htx_1505') && !!instrument.htxPair;
}

function verifiedQuote(symbol: string, quote: CryptoPortfolioQuote): boolean {
  const instrument = liveInstrument(symbol);
  return !!instrument && eligibleSource(instrument, quote.source);
}

function liveInstrument(symbol: string): SpotInstrument | null {
  const parsed = parsePortfolioInstrument(symbol);
  if (parsed?.market !== 'CRYPTO') return null;
  const base = symbol.replace(/^CRYPTO:/, '').replace(/-USDT$/, '');
  const instrument = peekUnifiedCryptoSpotInstrument(base);
  return instrument ? { symbol, base, pair: instrument.pair, name: instrument.name,
    ...(instrument.gatePair ? { gate: { delistingAt: instrument.gateDelistingAt ?? null } } : {}),
    ...(instrument.htxPair ? { htxPair: instrument.htxPair } : {}) } : null;
}

/** 共享活动现货目录，加载列表只获取身份，不取任何币价。 */
async function getDirectory(): Promise<Map<string, SpotInstrument> | null> {
  const rows = await getUnifiedCryptoSpotDirectory();
  const result = new Map<string, SpotInstrument>();
  for (const row of rows) {
    const symbol = `CRYPTO:${row.code}-USDT`;
    const instrument = liveInstrument(symbol);
    if (instrument) result.set(symbol, instrument);
  }
  return result.size ? result : null;
}

/** 同步只读共享缓存：无资格/失败/过期不返回旧价，也不触发网络。 */
export function getCachedCryptoPortfolioQuote(symbol: string): CryptoPortfolioQuote | null {
  const normalized = cryptoSymbol(symbol);
  if (!normalized) return null;
  const instrument = liveInstrument(normalized);
  if (!instrument) return null;
  const quote = peekUnifiedCryptoSpotQuote(instrument.base);
  return quote ? { symbol: normalized, price: quote.price, currency: 'USDT', source: quote.source,
    updatedAt: quote.updatedAt, priceDate: beijingDate(Date.parse(quote.updatedAt)) } : null;
}

function makeQuote(instrument: SpotInstrument, price: number, source: string): CryptoPortfolioQuote {
  const sampledAt = Date.now();
  return { symbol: instrument.symbol, price, currency: 'USDT', source,
    updatedAt: new Date(sampledAt).toISOString(), priceDate: beijingDate(sampledAt) };
}

function freshHtxResponse(data: any, channel: string, notBefore = 0): boolean {
  const timestamp = positive(data?.ts);
  return data?.status === 'ok' && data.ch === channel && timestamp !== null
    && timestamp >= notBefore && timestamp <= Date.now() && Date.now() - timestamp <= SCANNER_FRESH_MS;
}

async function quoteFor(instrument: SpotInstrument): Promise<CryptoPortfolioQuote | null> {
  touchCryptoQuoteDemand([instrument.base]);
  const quotes = await getUnifiedCryptoSpotQuotes([instrument.base]);
  const quote = quotes[instrument.base];
  if (!quote || !liveInstrument(instrument.symbol) || !eligibleSource(instrument, quote.source)) return null;
  return { symbol: instrument.symbol, price: quote.price, currency: 'USDT', source: quote.source,
    updatedAt: quote.updatedAt, priceDate: beijingDate(Date.parse(quote.updatedAt)) };
}

function normalizeSymbols(symbols: string[]): string[] {
  // 输入和输出均有界；裸ETH等仍是US证券，不接受其作为数字币。
  return Array.from(new Set(symbols.slice(0, MAX_SYMBOLS).map(cryptoSymbol).filter((s): s is string => s !== null)));
}

export async function fetchCryptoPortfolioQuotes(rawSymbols: string[]): Promise<Record<string, CryptoPortfolioQuote>> {
  const symbols = normalizeSymbols(rawSymbols);
  if (!symbols.length || !await getDirectory()) return {};
  const result: Record<string, CryptoPortfolioQuote> = {};
  await Promise.all(symbols.map(async (symbol) => {
    const instrument = liveInstrument(symbol);
    if (!instrument) return;
    const quote = await quoteFor(instrument);
    if (quote) result[symbol] = { ...quote };
  }));
  return result;
}

export async function searchCryptoPortfolio(query: string): Promise<{ results: CryptoPortfolioSearchResult[] }> {
  const text = String(query ?? '').trim().toUpperCase();
  if (!text || text.length > 80) return { results: [] };
  // 可搜目录与可报价身份分离：静态目录不冒充活动现货，取价/保存仍核验共享provider。
  const catalog = new Map<string, SpotInstrument>((AI_WALLET_CRYPTO_MARKET_ASSETS as readonly string[]).map(base => {
    const symbol = `CRYPTO:${base}-USDT`;
    return [symbol, { symbol, base, pair: `${base}_USDT`, name: walletCryptoNames.get(base) || base }];
  }));
  if (text === '*') {
    // 下拉完全共用钱包/52号目录，零上游请求；没有价格时不可据此判定可交易。
    const bases: readonly string[] = AI_WALLET_CRYPTO_MARKET_ASSETS;
    return { results: bases.map(base => catalog.get(`CRYPTO:${base}-USDT`))
      .filter((instrument): instrument is SpotInstrument => !!instrument)
      .map(instrument => ({ symbol: instrument.symbol, name: instrument.name, market: 'CRYPTO' as const,
        currency: 'USDT' as const, latestPrice: null, updatedAt: null, source: null,
        displaySymbol: instrument.base, available: false })) };
  }
  const compact = text.replace(/^CRYPTO:/, '').replace(/[_/]/g, '-');
  const score = (i: SpotInstrument) => i.base === compact || `${i.base}-USDT` === compact ? 0
    : i.base.startsWith(compact) ? 1 : i.name.toUpperCase().startsWith(text) ? 2 : 3;
  const candidates = Array.from(catalog.values())
    .filter((i) => i.base.includes(text) || `${i.base}-USDT`.includes(compact) || i.name.toUpperCase().includes(text))
    .sort((a, b) => score(a) - score(b) || a.pair.localeCompare(b.pair))
    .slice(0, MAX_SEARCH_RESULTS);
  // 模糊搜索不激活全部命中；明确代码/pair只为该币取价，选中后前端续租。
  const exact = candidates.find(i => i.base === compact || `${i.base}-USDT` === compact);
  const quotes = exact ? await fetchCryptoPortfolioQuotes([exact.symbol]) : {};
  return { results: candidates.map((i) => {
    const quote = quotes[i.symbol] ?? getCachedCryptoPortfolioQuote(i.symbol);
    return { symbol: i.symbol, name: i.name, market: 'CRYPTO', currency: 'USDT',
      latestPrice: quote?.price ?? null, updatedAt: quote?.updatedAt ?? null, source: quote?.source ?? null,
      displaySymbol: `${i.base}/USDT`, available: !!quote };
  }) };
}

function snapshotCutoff(snapshotDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) return null;
  const cutoff = Date.parse(`${snapshotDate}T15:05:00+08:00`);
  return Number.isFinite(cutoff) && beijingDate(cutoff) === snapshotDate && cutoff <= Date.now() ? cutoff : null;
}

async function fetchClose(instrument: SpotInstrument, snapshotDate: string, cutoff: number): Promise<CryptoPortfolioQuote | null> {
  const openedAt = cutoff / 1_000 - 60;
  const makeClose = (price: number, source: string): CryptoPortfolioQuote => ({
    ...makeQuote(instrument, price, source), priceDate: snapshotDate, cutoffAt: new Date(cutoff).toISOString(),
  });
  if (eligibleSource(instrument, 'Gate.io')) try {
    // 不指定limit，它与from/to互斥；请求截止15:04:59，仅接受15:04起点且明确已完成的行。
    const params = new URLSearchParams({ currency_pair: instrument.pair, interval: '1m', from: String(openedAt), to: String(cutoff / 1_000 - 1) });
    const rows = await fetchJson(`${GATE}/candlesticks?${params}`);
    const exact = Array.isArray(rows) ? rows.filter((row) => Array.isArray(row) && Number(row[0]) === openedAt) : [];
    if (exact.length === 1) {
      const row = exact[0];
      const price = positive(row[2]);
      if (price !== null && (row[7] === 'true' || row[7] === true)) return makeClose(price, 'crypto_close_gate_1505');
    }
  } catch { /* 同样精确校验HTX现货历史分钟 */ }
  if (eligibleSource(instrument, 'HTX')) try {
    // HTX REST没有from/to。仅在最近2000根覆盖目标时读取，不将参数猜测为历史支持。
    const size = Math.floor((Date.now() - openedAt * 1_000) / 60_000) + 2;
    if (size > 2_000) return null;
    const pair = instrument.htxPair!;
    const params = new URLSearchParams({ symbol: pair, period: '1min', size: String(Math.max(2, size)) });
    const data = await fetchJson(`${HTX}/market/history/kline?${params}`);
    if (!freshHtxResponse(data, `market.${pair}.kline.1min`, cutoff)) return null;
    const exact = Array.isArray(data.data) ? data.data.filter((row: any) => Number(row?.id) === openedAt) : [];
    if (exact.length !== 1) return null;
    const row = exact[0];
    const price = positive(row?.close);
    // HTX无closed字段：id+完整分钟 <= 回应生成时间与真实取数时间才是已完成证据。
    if (price !== null && openedAt * 1_000 + 60_000 <= Number(data.ts)
      && row.closed !== false && row.closed !== 'false') return makeClose(price, 'crypto_close_htx_1505');
  } catch { /* 不拿当前价/旧分钟补过去 */ }
  return null;
}

/** 15:05固定日结；实时缓存与历史缓存彻底分离。缺价/未来/无效日期返回缺项。 */
export async function fetchCryptoPortfolioCloseQuotes(symbols: string[], snapshotDate: string): Promise<Record<string, CryptoPortfolioQuote>> {
  const cutoff = snapshotCutoff(snapshotDate);
  const normalized = normalizeSymbols(symbols);
  if (cutoff === null || !normalized.length || !await getDirectory()) return {};
  const result: Record<string, CryptoPortfolioQuote> = {};
  await Promise.all(normalized.map(async (symbol) => {
    const instrument = liveInstrument(symbol);
    if (!instrument) return;
    const key = `${snapshotDate}:${symbol}`;
    const cached = closeCache.get(key);
    if (cached && cached.expiresAt > Date.now() && verifiedQuote(symbol, cached.quote)) { result[symbol] = { ...cached.quote }; return; }
    let pending = closeFlights.get(key);
    if (!pending) {
      if ((closeMisses.get(key) ?? 0) > Date.now() || closeFlights.size >= MAX_CACHE) return;
      pending = (async () => {
        try {
          const quote = await fetchClose(instrument, snapshotDate, cutoff);
          if (!liveInstrument(symbol) || (quote && !verifiedQuote(symbol, quote))) return null;
          if (quote) {
            boundedSet(closeCache, key, { quote, expiresAt: Date.now() + 24 * 60 * 60_000 });
            closeMisses.delete(key);
          } else boundedSet(closeMisses, key, Date.now() + RETRY_MS);
          return quote;
        } finally { closeFlights.delete(key); }
      })();
      closeFlights.set(key, pending);
    }
    const quote = await pending;
    if (quote && verifiedQuote(symbol, quote)) result[symbol] = { ...quote };
  }));
  return result;
}
