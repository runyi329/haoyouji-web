/**
 * 37号数字币现货行情。只读公共市场数据；不启动扫描、定时器或数据库。
 * 标的身份由 Gate/HTX 活动 USDT spot 目录分别确认；Gate 优先，HTX 备用。
 * Gate 模型/分钟线契约：https://github.com/gateio/gateapi-python/blob/master/docs/SpotApi.md
 * HTX 目录/分钟线契约：https://huobiapi.github.io/docs/spot/v1/en/
 * Gate 返回 [timestamp, quoteVolume, close, high, low, open, baseVolume, closed]。
 */
import { parsePortfolioInstrument } from '../shared/portfolio-instruments';
import { getAllLatestPrices, getMarketPriceHealth } from './price-scanner';
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
const DIRECTORY_TTL_MS = 10 * 60_000;
const RETRY_MS = 15_000;
const QUOTE_TTL_MS = 15_000;
const SCANNER_FRESH_MS = 120_000;
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_SYMBOLS = 100;
const MAX_SEARCH_RESULTS = 20;
const MAX_CACHE = 256;
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_PENDING_REQUESTS = 256;
const SCANNER_BASES = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'HYPE', 'TRUMP', 'PENGU', 'XPL', 'WLFI', 'AVAX',
  'DOGE', 'XLM', 'TIA', 'EIGEN', 'FET', 'AAVE', 'SUI', 'ONDO', 'ASTER', 'LDO',
  'ENA', 'ARKM', 'UNI', 'SEI', 'PLUME', 'ADA', 'ZRO', 'WLD', 'LINK', 'POL',
  'CRV', 'PEPE', 'B2', 'TAO', 'PENDLE', 'NEAR', 'INJ', 'STRK',
]);
let directory = new Map<string, SpotInstrument>();
let directoryExpiresAt = 0;
let directoryRetryAt = 0;
let directoryFlight: Promise<Map<string, SpotInstrument> | null> | null = null;
const quoteCache = new Map<string, CachedQuote>();
const quoteMisses = new Map<string, number>();
const quoteFlights = new Map<string, Promise<CryptoPortfolioQuote | null>>();
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

function isLeveraged(base: string, name: string, row: any): boolean {
  return /(?:[2-9]|10)(?:L|S|LONG|SHORT|BULL|BEAR|X)$/.test(base)
    || /\bleveraged\b|\bETF\b|\b[2-9](?:x|\s+times)\s+(?:long|short)\b|杠杆|倍做[多空]/i.test(name)
    || row?.is_leveraged === true || row?.leveraged === true;
}

function parseSpot(row: any): SpotInstrument | null {
  const base = typeof row?.base === 'string' ? row.base : '';
  const name = typeof row?.base_name === 'string' && row.base_name.trim() ? row.base_name.trim() : base;
  if (!/^[A-Z0-9][A-Z0-9_]{0,29}$/.test(base) || base === 'USDT'
    || row.quote !== 'USDT' || row.id !== `${base}_USDT`
    || row.type !== 'normal' || row.trade_status !== 'tradable'
    || isLeveraged(base, name, row)) return null;
  for (const start of Array.from([row.buy_start, row.sell_start])) {
    if (start != null && (!Number.isFinite(Number(start)) || Number(start) * 1_000 > Date.now())) return null;
  }
  const delisting = row.delisting_time == null || Number(row.delisting_time) === 0 ? null : Number(row.delisting_time) * 1_000;
  if (delisting !== null && (!Number.isFinite(delisting) || delisting <= Date.now())) return null;
  return { symbol: `CRYPTO:${base}-USDT`, base, pair: row.id, name, gate: { delistingAt: delisting } };
}

function parseHtxSpot(row: any): SpotInstrument | null {
  // 官方V1目录仍可用；不能把支持保证金的普通BTC（leverage-ratio=5）误判为ETP。
  const rawBase = typeof row?.['base-currency'] === 'string' ? row['base-currency'] : '';
  const base = rawBase.toUpperCase();
  if (!/^[a-z0-9][a-z0-9_]{0,29}$/.test(rawBase) || base === 'USDT'
    || row['quote-currency'] !== 'usdt' || row.symbol !== `${rawBase}usdt`
    || row.state !== 'online' || row['api-trading'] !== 'enabled'
    || row['ca-state'] != null || isLeveraged(base, base, row)
    || /(?:^|,)\s*(?:etp|etf)\s*(?:,|$)/i.test(String(row.tags ?? ''))
    || ['underlying', 'mgmt-fee-rate', 'charge-time', 'rebal-time', 'rebal-threshold', 'init-nav']
      .some(key => row[key] != null)) return null;
  return { symbol: `CRYPTO:${base}-USDT`, base, pair: `${base}_USDT`, name: base, htxPair: row.symbol };
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
  if (Date.now() >= directoryExpiresAt) return null;
  const instrument = directory.get(symbol);
  return instrument && (eligibleSource(instrument, 'Gate.io') || eligibleSource(instrument, 'HTX')) ? instrument : null;
}

async function getDirectory(): Promise<Map<string, SpotInstrument> | null> {
  if (Date.now() < directoryExpiresAt) return directory;
  if (directoryFlight) return directoryFlight;
  if (Date.now() < directoryRetryAt) return null;
  directoryFlight = (async () => {
    try {
      // 同次刷新独立核验两家，不让Gate目录失败阻断HTX，也不继承过期供应商资格。
      // 完整目录允许12秒；仍共用并发上限与single-flight，不重试或启动后台扫描。
      const [gate, htx] = await Promise.allSettled([
        fetchJson(`${GATE}/currency_pairs`, 12_000), fetchJson(`${HTX}/v1/common/symbols`, 12_000),
      ]);
      const next = new Map<string, SpotInstrument>();
      const gateRows = gate.status === 'fulfilled' && Array.isArray(gate.value) ? gate.value : [];
      for (const row of Array.from(gateRows)) {
        const instrument = parseSpot(row);
        if (instrument) next.set(instrument.symbol, instrument);
      }
      const htxRows = htx.status === 'fulfilled' && htx.value?.status === 'ok' && Array.isArray(htx.value.data) ? htx.value.data : [];
      for (const row of Array.from(htxRows)) {
        const instrument = parseHtxSpot(row);
        if (!instrument) continue;
        const primary = next.get(instrument.symbol);
        next.set(instrument.symbol, primary ? { ...primary, htxPair: instrument.htxPair } : instrument);
      }
      if (next.size === 0) throw new Error('empty active spot directory');
      directory = next;
      directoryExpiresAt = Date.now() + DIRECTORY_TTL_MS;
      directoryRetryAt = 0;
      // 下架/改产品类型/失去该报价来源资格时不保留可返回的缓存。
      for (const [key, cached] of Array.from(quoteCache)) if (!verifiedQuote(key, cached.quote)) quoteCache.delete(key);
      for (const [key, cached] of Array.from(closeCache)) if (!verifiedQuote(cached.quote.symbol, cached.quote)) closeCache.delete(key);
      quoteMisses.clear(); closeMisses.clear();
      return directory;
    } catch {
      directoryRetryAt = Date.now() + RETRY_MS;
      return null; // 过期目录不可充当仍可交易的证据。
    } finally {
      directoryFlight = null;
    }
  })();
  return directoryFlight;
}

function scannerQuote(instrument: SpotInstrument): CryptoPortfolioQuote | null {
  if (!SCANNER_BASES.has(instrument.base)) return null;
  try {
    const entry = getAllLatestPrices()[instrument.base];
    const health = getMarketPriceHealth()[instrument.base];
    const price = positive(entry?.price);
    const sampledAt = Date.parse(entry?.updatedAt ?? '');
    const age = Date.now() - sampledAt;
    if (price === null || !health || health.stale !== false
      || !['Gate.io', 'HTX'].includes(health.source)
      || !eligibleSource(instrument, health.source)
      || health.lastSuccessAt !== entry.updatedAt
      || !Number.isFinite(sampledAt) || age < 0 || age > SCANNER_FRESH_MS) return null;
    return { symbol: instrument.symbol, price, currency: 'USDT', source: health.source,
      updatedAt: new Date(sampledAt).toISOString(), priceDate: beijingDate(sampledAt) };
  } catch {
    return null;
  }
}

/** 同步只读：不触发目录或报价请求；过期/无目录证据返回null。 */
export function getCachedCryptoPortfolioQuote(symbol: string): CryptoPortfolioQuote | null {
  const normalized = cryptoSymbol(symbol);
  if (!normalized) return null;
  const instrument = liveInstrument(normalized);
  if (!instrument) return null;
  const shared = scannerQuote(instrument);
  const cached = quoteCache.get(normalized);
  if (cached && cached.expiresAt > Date.now() && eligibleSource(instrument, cached.quote.source)) {
    // 本模块有更新的真实采样时优先它；否则复用扫描器，不改造稳定币固定价接口。
    if (!shared || Date.parse(cached.quote.updatedAt) > Date.parse(shared.updatedAt)) return { ...cached.quote };
  }
  return shared ? { ...shared } : null;
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

async function fetchSpotQuote(instrument: SpotInstrument): Promise<CryptoPortfolioQuote | null> {
  if (eligibleSource(instrument, 'Gate.io')) try {
    const rows = await fetchJson(`${GATE}/tickers?currency_pair=${encodeURIComponent(instrument.pair)}`);
    const row = Array.isArray(rows) ? rows.find((item) => item?.currency_pair === instrument.pair) : null;
    const price = positive(row?.last); // 绝不读取 mark_price。
    if (price !== null) return makeQuote(instrument, price, 'Gate.io');
  } catch { /* HTX备用 */ }
  if (eligibleSource(instrument, 'HTX')) try {
    const htxPair = instrument.htxPair!;
    const data = await fetchJson(`${HTX}/market/detail/merged?symbol=${encodeURIComponent(htxPair)}`);
    const price = positive(data?.tick?.close);
    if (price !== null && freshHtxResponse(data, `market.${htxPair}.detail.merged`)) {
      return makeQuote(instrument, price, 'HTX');
    }
  } catch { /* 缺证据返回缺项 */ }
  return null;
}

async function quoteFor(instrument: SpotInstrument): Promise<CryptoPortfolioQuote | null> {
  const cached = getCachedCryptoPortfolioQuote(instrument.symbol);
  if (cached) return cached;
  const flight = quoteFlights.get(instrument.symbol);
  if (flight) return flight;
  if ((quoteMisses.get(instrument.symbol) ?? 0) > Date.now() || quoteFlights.size >= MAX_CACHE) return null;
  const pending = (async () => {
    try {
      const quote = await fetchSpotQuote(instrument);
      if (!liveInstrument(instrument.symbol) || (quote && !verifiedQuote(instrument.symbol, quote))) return null;
      if (quote) {
        boundedSet(quoteCache, instrument.symbol, { quote, expiresAt: Date.now() + QUOTE_TTL_MS });
        quoteMisses.delete(instrument.symbol);
      } else boundedSet(quoteMisses, instrument.symbol, Date.now() + RETRY_MS);
      return quote;
    } finally { quoteFlights.delete(instrument.symbol); }
  })();
  quoteFlights.set(instrument.symbol, pending);
  return pending;
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
  const catalog = await getDirectory();
  if (!catalog) return { results: [] };
  if (text === '*') {
    // 下拉沿用钱包/52号数字币顺序并补充已支持品种；仅活动现货目录能提供可选身份。
    // 打开下拉不请求38个币的报价，选中后由同一搜索接口核验并取得该币实时价格。
    const bases = Array.from(new Set<string>([...AI_WALLET_CRYPTO_MARKET_ASSETS, ...Array.from(SCANNER_BASES)]));
    return { results: bases.map(base => catalog.get(`CRYPTO:${base}-USDT`))
      .filter((instrument): instrument is SpotInstrument => !!instrument && !!liveInstrument(instrument.symbol))
      .map(instrument => ({ symbol: instrument.symbol, name: instrument.name, market: 'CRYPTO' as const,
        currency: 'USDT' as const, latestPrice: null, updatedAt: null, source: null,
        displaySymbol: instrument.base, available: false })) };
  }
  const compact = text.replace(/^CRYPTO:/, '').replace(/[_/]/g, '-');
  const score = (i: SpotInstrument) => i.base === compact || `${i.base}-USDT` === compact ? 0
    : i.base.startsWith(compact) ? 1 : i.name.toUpperCase().startsWith(text) ? 2 : 3;
  const candidates = Array.from(catalog.values())
    .filter((i) => liveInstrument(i.symbol) && (i.base.includes(text) || `${i.base}-USDT`.includes(compact) || i.name.toUpperCase().includes(text) || walletCryptoNames.get(i.base)?.toUpperCase().includes(text)))
    .sort((a, b) => score(a) - score(b) || a.pair.localeCompare(b.pair))
    .slice(0, MAX_SEARCH_RESULTS);
  const quotes = await fetchCryptoPortfolioQuotes(candidates.map((i) => i.symbol));
  return { results: candidates.map((i) => {
    const quote = quotes[i.symbol];
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
