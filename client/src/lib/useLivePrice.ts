/**
 * useLivePrice.ts — 页面行情工具库。
 *
 * 数字币统一经 /api/trpc/getCryptoPrices 读取 server/price-scanner.ts 内存缓存；
 * 前端绝不直接向交易所或行情网站发起数字币报价请求。
 * 非数字币市场数据仍按各自受控服务端接口读取。
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ===== Cloudflare Worker 地址 =====
const CF_WORKER = 'https://polymarket-proxy.runyihongkong.workers.dev';

// ===== 内存缓存（避免同一会话重复请求）=====
const _cryptoCache: Record<string, { price: number; changePercent: number; open: number; fetchedAt: number }> = {};
const _marketCache: Record<string, { price: number; prevClose: number; change: number; changePercent: number; success: boolean; fetchedAt: number }> = {};
const _rateCache: { rate: number; fetchedAt: number } | null = null;
let _rateCacheValue: { rate: number; fetchedAt: number } | null = null;

const CRYPTO_CACHE_TTL = 2500;   // 与统一三秒扫描器同步，避免重复读取
const MARKET_CACHE_TTL = 5000;   // 5秒
const RATE_CACHE_TTL = 60000;    // 60秒

type UnifiedCryptoPrices = {
  prices: Record<string, number>;
  changes: Record<string, number>;
  opens: Record<string, number>;
  usdtCnyRate: number;
};

let _unifiedCryptoCache: (UnifiedCryptoPrices & { fetchedAt: number }) | null = null;

async function fetchUnifiedCryptoPrices(): Promise<UnifiedCryptoPrices | null> {
  if (_unifiedCryptoCache && Date.now() - _unifiedCryptoCache.fetchedAt < CRYPTO_CACHE_TTL) {
    return _unifiedCryptoCache;
  }
  try {
    const response = await fetch('/api/trpc/getCryptoPrices', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return _unifiedCryptoCache;
    const raw = await response.json() as any;
    const payload = raw?.result?.data?.json ?? raw?.result?.data ?? raw;
    const prices = payload?.prices && typeof payload.prices === 'object' ? payload.prices : {};
    const changes = payload?.changes && typeof payload.changes === 'object' ? payload.changes : {};
    const opens = payload?.opens && typeof payload.opens === 'object' ? payload.opens : {};
    const rate = Number(payload?.usdtCnyRate || 0);
    if (Object.keys(prices).length === 0) return _unifiedCryptoCache;
    _unifiedCryptoCache = {
      prices,
      changes,
      opens,
      usdtCnyRate: rate > 0 ? rate : (_unifiedCryptoCache?.usdtCnyRate || 6.8),
      fetchedAt: Date.now(),
    };
    return _unifiedCryptoCache;
  } catch {
    return _unifiedCryptoCache;
  }
}

/** 获取单个数字币价格：只读取服务端统一多源缓存。 */
export async function fetchCryptoPrice(coin: string): Promise<{ price: number; changePercent: number; open: number }> {
  const key = coin.toUpperCase();
  const cached = _cryptoCache[key];
  if (cached && Date.now() - cached.fetchedAt < CRYPTO_CACHE_TTL) {
    return { price: cached.price, changePercent: cached.changePercent, open: cached.open };
  }

  const source = await fetchUnifiedCryptoPrices();
  const price = Number(source?.prices?.[key] || 0);
  const result = price > 0
    ? { price, changePercent: Number(source?.changes?.[key] || 0), open: Number(source?.opens?.[key] || 0) }
    : { price: cached?.price || 0, changePercent: cached?.changePercent || 0, open: cached?.open || 0 };

  if (result.price > 0) {
    _cryptoCache[key] = { ...result, fetchedAt: Date.now() };
  }
  return result;
}

/** 批量获取多个数字币价格：整页仅读取一次统一缓存。 */
export async function fetchCryptoPrices(coins: string[]): Promise<{
  prices: Record<string, number>;
  changes: Record<string, number>;
  opens: Record<string, number>;
  usdtCnyRate: number;
}> {
  const source = await fetchUnifiedCryptoPrices();
  const prices: Record<string, number> = {};
  const changes: Record<string, number> = {};
  const opens: Record<string, number> = {};
  for (const coin of coins) {
    const key = coin.toUpperCase();
    const price = Number(source?.prices?.[key] || _cryptoCache[key]?.price || 0);
    if (price > 0) {
      prices[key] = price;
      changes[key] = Number(source?.changes?.[key] ?? _cryptoCache[key]?.changePercent ?? 0);
      opens[key] = Number(source?.opens?.[key] ?? _cryptoCache[key]?.open ?? 0);
      _cryptoCache[key] = { price, changePercent: changes[key], open: opens[key], fetchedAt: Date.now() };
    }
  }
  return { prices, changes, opens, usdtCnyRate: Number(source?.usdtCnyRate || _unifiedCryptoCache?.usdtCnyRate || 6.8) };
}

// ===== 通道二：市场行情（直接调用服务器 tRPC，待 Cloudflare Worker 部署后切换）=====
// TODO: Worker 部署后将 fetchMarketFromServer 改为 fetchMarketFromWorker

type MarketPriceResult = { price: number; prevClose: number; change: number; changePercent: number; success: boolean };

// tRPC 路由名称映射
const TRPC_ROUTE_MAP: Record<string, string> = {
  '/market/gold': 'stock.getGoldPrice',
  '/market/oil': 'stock.getOilPrice',
  '/market/dxy': 'stock.getDollarIndex',
  '/market/usdcnh': 'stock.getUsdCnh',
  '/market/sh': 'stock.getShanghaiIndex',
  '/market/hsi': 'stock.getHangSengIndex',
  '/market/sp500': 'stock.getSP500Index',
  '/market/usdcny': 'exchange.getRate',
};

async function fetchMarketFromServer(endpoint: string, usSymbol?: string): Promise<MarketPriceResult | null> {
  try {
    let url = '';
    if (endpoint.startsWith('/market/us')) {
      url = `/api/trpc/stock.getUsStockPrice?input=${encodeURIComponent(JSON.stringify({ symbol: usSymbol || '' }))}`;
    } else if (endpoint === '/market/usdcny') {
      url = `/api/trpc/exchange.getRate?input=${encodeURIComponent(JSON.stringify({ fromcoin: 'USD', tocoin: 'CNY' }))}` ;
    } else {
      const route = TRPC_ROUTE_MAP[endpoint];
      if (!route) return null;
      url = `/api/trpc/${route}`;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const d = await res.json() as any;
    const result = d?.result?.data?.json ?? d?.result?.data;
    if (!result) return null;
    // exchange.getRate 返回格式不同
    if (endpoint === '/market/usdcny') {
      const rate = parseFloat(result.money || '0');
      return { price: rate, prevClose: rate, change: 0, changePercent: 0, success: rate > 0 };
    }
    if (!result.success) return null;
    return { price: result.price || 0, prevClose: result.prevClose || 0, change: result.change || 0, changePercent: result.changePercent || 0, success: true };
  } catch {
    return null;
  }
}

/** 黄金价格（GC=F，通过 Worker 代理） */
export async function fetchGoldPrice(): Promise<MarketPriceResult> {
  const cached = _marketCache['gold'];
  if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) return cached;
  const result = await fetchMarketFromServer('/market/gold') || cached || { price: 0, prevClose: 0, change: 0, changePercent: 0, success: false };
  if (result.success) _marketCache['gold'] = { ...result, fetchedAt: Date.now() };
  return result;
}

/** 石油价格（上海原油期货，通过 Worker 代理） */
export async function fetchOilPrice(): Promise<MarketPriceResult> {
  const cached = _marketCache['oil'];
  if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) return cached;
  const result = await fetchMarketFromServer('/market/oil') || cached || { price: 0, prevClose: 0, change: 0, changePercent: 0, success: false };
  if (result.success) _marketCache['oil'] = { ...result, fetchedAt: Date.now() };
  return result;
}

/** 美元指数（通过 Worker 代理） */
export async function fetchDollarIndex(): Promise<MarketPriceResult> {
  const cached = _marketCache['dxy'];
  if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) return cached;
  const result = await fetchMarketFromServer('/market/dxy') || cached || { price: 0, prevClose: 0, change: 0, changePercent: 0, success: false };
  if (result.success) _marketCache['dxy'] = { ...result, fetchedAt: Date.now() };
  return result;
}

/** 离岸人民币汇率 USD/CNH（通过 Worker 代理） */
export async function fetchUsdCnh(): Promise<MarketPriceResult> {
  const cached = _marketCache['usdcnh'];
  if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) return cached;
  const result = await fetchMarketFromServer('/market/usdcnh') || cached || { price: 0, prevClose: 0, change: 0, changePercent: 0, success: false };
  if (result.success) _marketCache['usdcnh'] = { ...result, fetchedAt: Date.now() };
  return result;
}

/** 上证指数（通过 Worker 代理） */
export async function fetchShanghaiIndex(): Promise<MarketPriceResult> {
  const cached = _marketCache['sh'];
  if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) return cached;
  const result = await fetchMarketFromServer('/market/sh') || cached || { price: 0, prevClose: 0, change: 0, changePercent: 0, success: false };
  if (result.success) _marketCache['sh'] = { ...result, fetchedAt: Date.now() };
  return result;
}

/** 恒生指数（通过 Worker 代理） */
export async function fetchHangSengIndex(): Promise<MarketPriceResult> {
  const cached = _marketCache['hsi'];
  if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) return cached;
  const result = await fetchMarketFromServer('/market/hsi') || cached || { price: 0, prevClose: 0, change: 0, changePercent: 0, success: false };
  if (result.success) _marketCache['hsi'] = { ...result, fetchedAt: Date.now() };
  return result;
}

/** 标普500指数（通过 Worker 代理） */
export async function fetchSP500Index(): Promise<MarketPriceResult> {
  const cached = _marketCache['sp500'];
  if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) return cached;
  const result = await fetchMarketFromServer('/market/sp500') || cached || { price: 0, prevClose: 0, change: 0, changePercent: 0, success: false };
  if (result.success) _marketCache['sp500'] = { ...result, fetchedAt: Date.now() };
  return result;
}

/** 美股个股价格（通过 Worker 代理，symbol 如 AAPL/MSTR/TSLA） */
export async function fetchUSStockPrice(symbol: string): Promise<MarketPriceResult> {
  const key = `us_${symbol.toUpperCase()}`;
  const cached = _marketCache[key];
  if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) return cached;
  const result = await fetchMarketFromServer(`/market/us`, symbol.toUpperCase()) || cached || { price: 0, prevClose: 0, change: 0, changePercent: 0, success: false };
  if (result.success) _marketCache[key] = { ...result, fetchedAt: Date.now() };
  return result;
}

/** USD/CNY 汇率（通过 Worker 代理，用于替换 exchange.getRate） */
export async function fetchUsdCnyRate(): Promise<number> {
  if (_rateCacheValue && Date.now() - _rateCacheValue.fetchedAt < RATE_CACHE_TTL) {
    return _rateCacheValue.rate;
  }
  try {
    const res = await fetch(`/api/trpc/exchange.getRate?input=${encodeURIComponent(JSON.stringify({ fromcoin: 'USD', tocoin: 'CNY' }))}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const d = await res.json() as any;
      const rateResult = d?.result?.data;
      const rate = rateResult?.success ? parseFloat(rateResult.money || '0') : 0;
      if (rate > 0) {
        _rateCacheValue = { rate, fetchedAt: Date.now() };
        return rate;
      }
    }
  } catch { /* 兜底 */ }
  // 兜底：fawazahmed0 currency-api（免费，无需 Key，支持 CORS）
  try {
    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const d = await res.json() as any;
      const rate = d?.usd?.cny;
      if (rate && rate > 0) {
        _rateCacheValue = { rate, fetchedAt: Date.now() };
        return rate;
      }
    }
  } catch { /* 兜底 */ }
  return _rateCacheValue?.rate || 6.8; // 最终兜底
}

// ===== React Hooks =====

// ===== 自定义币种内存缓存（从数据库 API 读取，60秒刷新一次）=====
let _customCoinsCache: Array<{ symbol: string; binance?: string | null; okx?: string | null; coingecko?: string | null }> = [];
let _customCoinsCacheAt = 0;
const CUSTOM_COINS_CACHE_TTL = 60000; // 60秒

/** 从数据库 API 读取自定义币种（带内存缓存，避免频繁请求） */
async function fetchCustomCoinsFromDb(): Promise<string[]> {
  // 缓存未过期则直接返回
  if (_customCoinsCacheAt > 0 && Date.now() - _customCoinsCacheAt < CUSTOM_COINS_CACHE_TTL) {
    return _customCoinsCache.map(c => c.symbol.toUpperCase());
  }
  try {
    const res = await fetch('/api/trpc/cryptoData.getCustomCoins', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const d = await res.json() as any;
      const coins = d?.result?.data?.json ?? d?.result?.data ?? [];
      if (Array.isArray(coins)) {
        _customCoinsCache = coins;
        _customCoinsCacheAt = Date.now();
        return coins.map((c: any) => (c.symbol as string).toUpperCase());
      }
    }
  } catch { /* 网络失败时使用缓存 */ }
  return _customCoinsCache.map(c => c.symbol.toUpperCase());
}

/** Hook：兼容旧页面调用，内部仍读取统一服务端行情缓存。 */
export function useCryptoPrices(intervalMs = 3000) {
  const [data, setData] = useState<{
    prices: Record<string, number>;
    changes: Record<string, number>;
    opens: Record<string, number>;
    usdtCnyRate: number;
  }>({ prices: {}, changes: {}, opens: {}, usdtCnyRate: 6.8 });

  const BUILTIN_COINS_LIST = ['BTC', 'ETH', 'SOL', 'BNB', 'AAVE', 'SUI', 'ONDO', 'LDO', 'ENA', 'ARKM', 'UNI', 'SEI', 'PLUME', 'ASTER', 'DRAM', 'MU'];

  const fetch_ = useCallback(async () => {
    // 每次拉取前合并数据库中的自定义币种（带内存缓存，不会每次都发请求）
    const customCoins = await fetchCustomCoinsFromDb();
    const allCoins = Array.from(new Set([...BUILTIN_COINS_LIST, ...customCoins]));
    const result = await fetchCryptoPrices(allCoins);
    setData(prev => ({
      prices: { ...prev.prices, ...result.prices },
      changes: { ...prev.changes, ...result.changes },
      opens: { ...prev.opens, ...result.opens },
      usdtCnyRate: result.usdtCnyRate || prev.usdtCnyRate,
    }));
  }, []);

  useEffect(() => {
    fetch_();
    const timer = setInterval(fetch_, intervalMs);
    return () => clearInterval(timer);
  }, [fetch_, intervalMs]);

  return data;
}

/** Hook：USD/CNY 汇率（替换 trpc.exchange.getRate.useQuery） */
export function useUsdCnyRate(intervalMs = 60000) {
  const [rate, setRate] = useState<number>(6.8);

  useEffect(() => {
    fetchUsdCnyRate().then(r => { if (r > 0) setRate(r); });
    const timer = setInterval(() => {
      fetchUsdCnyRate().then(r => { if (r > 0) setRate(r); });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  // 返回与 trpc.exchange.getRate 兼容的格式
  return { data: { success: true, money: String(rate), fromcoin: 'USD', tocoin: 'CNY' } };
}

/** Hook：黄金价格（替换 trpc.stock.getGoldPrice.useQuery） */
export function useGoldPrice(intervalMs = 3000) {
  const [data, setData] = useState<MarketPriceResult>({ price: 0, prevClose: 0, change: 0, changePercent: 0, success: false });
  useEffect(() => {
    fetchGoldPrice().then(setData);
    const t = setInterval(() => fetchGoldPrice().then(setData), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return { data };
}

/** Hook：石油价格（替换 trpc.stock.getOilPrice.useQuery） */
export function useOilPrice(intervalMs = 3000) {
  const [data, setData] = useState<MarketPriceResult>({ price: 0, prevClose: 0, change: 0, changePercent: 0, success: false });
  useEffect(() => {
    fetchOilPrice().then(setData);
    const t = setInterval(() => fetchOilPrice().then(setData), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return { data };
}

/** Hook：美元指数（替换 trpc.stock.getDollarIndex.useQuery） */
export function useDollarIndex(intervalMs = 3000) {
  const [data, setData] = useState<MarketPriceResult>({ price: 0, prevClose: 0, change: 0, changePercent: 0, success: false });
  useEffect(() => {
    fetchDollarIndex().then(setData);
    const t = setInterval(() => fetchDollarIndex().then(setData), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return { data };
}

/** Hook：离岸人民币汇率（替换 trpc.stock.getUsdCnh.useQuery） */
export function useUsdCnh(intervalMs = 3000) {
  const [data, setData] = useState<MarketPriceResult>({ price: 0, prevClose: 0, change: 0, changePercent: 0, success: false });
  useEffect(() => {
    fetchUsdCnh().then(setData);
    const t = setInterval(() => fetchUsdCnh().then(setData), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return { data };
}

/** Hook：上证指数（替换 trpc.stock.getShanghaiIndex.useQuery） */
export function useShanghaiIndex(intervalMs = 3000) {
  const [data, setData] = useState<MarketPriceResult>({ price: 0, prevClose: 0, change: 0, changePercent: 0, success: false });
  useEffect(() => {
    fetchShanghaiIndex().then(setData);
    const t = setInterval(() => fetchShanghaiIndex().then(setData), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return { data };
}

/** Hook：恒生指数（替换 trpc.stock.getHangSengIndex.useQuery） */
export function useHangSengIndex(intervalMs = 3000) {
  const [data, setData] = useState<MarketPriceResult>({ price: 0, prevClose: 0, change: 0, changePercent: 0, success: false });
  useEffect(() => {
    fetchHangSengIndex().then(setData);
    const t = setInterval(() => fetchHangSengIndex().then(setData), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return { data };
}

/** Hook：标普500指数（替换 trpc.stock.getSP500Index.useQuery） */
export function useSP500Index(intervalMs = 3000) {
  const [data, setData] = useState<MarketPriceResult>({ price: 0, prevClose: 0, change: 0, changePercent: 0, success: false });
  useEffect(() => {
    fetchSP500Index().then(setData);
    const t = setInterval(() => fetchSP500Index().then(setData), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return { data };
}

/** Hook：美股个股价格（替换 trpc.getUsStockPrice.useQuery） */
export function useUSStockPrice(symbol: string, intervalMs = 10000) {
  const [data, setData] = useState<MarketPriceResult>({ price: 0, prevClose: 0, change: 0, changePercent: 0, success: false });
  useEffect(() => {
    if (!symbol) return;
    fetchUSStockPrice(symbol).then(setData);
    const t = setInterval(() => fetchUSStockPrice(symbol).then(setData), intervalMs);
    return () => clearInterval(t);
  }, [symbol, intervalMs]);
  return { data };
}

/** Hook：BTC价格（替换 trpc.stock.getBtcPrice.useQuery，兼容旧格式） */
export function useBtcPrice(intervalMs = 3000) {
  const [data, setData] = useState<{ price: number; change: number; changePercent: number; success: boolean }>({ price: 0, change: 0, changePercent: 0, success: false });
  useEffect(() => {
    fetchCryptoPrice('BTC').then(r => setData({ price: r.price, change: 0, changePercent: r.changePercent, success: r.price > 0 }));
    const t = setInterval(() => {
      fetchCryptoPrice('BTC').then(r => setData({ price: r.price, change: 0, changePercent: r.changePercent, success: r.price > 0 }));
    }, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return { data };
}
