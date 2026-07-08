/**
 * useLivePrice.ts — 前端直连行情工具库
 * 
 * 规则 G：金融数据获取规则（脉动网规则库 005-G）
 * 
 * 通道一：数字币 → 前端直连（币安主 → OKX备 → CoinGecko兜底）
 * 通道二：美股/港股/黄金/石油/汇率/指数 → Cloudflare Worker 代理新浪财经/Yahoo Finance
 * 
 * 老方案（服务器端 price-scanner / getRate / getLivePrices）代码保留不删，
 * 注释标注「已封存，新方案见 useLivePrice.ts / useDeribit.ts」，备用切回。
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ===== Cloudflare Worker 地址 =====
const CF_WORKER = 'https://polymarket-proxy.runyihongkong.workers.dev';

// ===== 内存缓存（避免同一会话重复请求）=====
const _cryptoCache: Record<string, { price: number; changePercent: number; open: number; fetchedAt: number }> = {};
const _marketCache: Record<string, { price: number; prevClose: number; change: number; changePercent: number; success: boolean; fetchedAt: number }> = {};
const _rateCache: { rate: number; fetchedAt: number } | null = null;
let _rateCacheValue: { rate: number; fetchedAt: number } | null = null;

const CRYPTO_CACHE_TTL = 5000;   // 5秒
const MARKET_CACHE_TTL = 5000;   // 5秒
const RATE_CACHE_TTL = 60000;    // 60秒

// ===== 数字币代码映射 =====
// 币安使用 USDT 交易对，CoinGecko 使用 id
const BINANCE_SYMBOL_MAP: Record<string, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', BNB: 'BNBUSDT',
  AAVE: 'AAVEUSDT', SUI: 'SUIUSDT', ONDO: 'ONDOUSDT', ASTER: 'ASTERUSDT',
  LDO: 'LDOUSDT', ENA: 'ENAUSDT', ARKM: 'ARKMUSDT', PLUME: 'PLUMEUSDT',
  SEI: 'SEIUSDT', DRAM: 'DRAMUSDT', MU: 'MUUSDT', USDT: 'USDCUSDT',
};
const OKX_SYMBOL_MAP: Record<string, string> = {
  BTC: 'BTC-USDT', ETH: 'ETH-USDT', SOL: 'SOL-USDT', BNB: 'BNB-USDT',
  AAVE: 'AAVE-USDT', SUI: 'SUI-USDT', ONDO: 'ONDO-USDT', ASTER: 'ASTER-USDT',
  LDO: 'LDO-USDT', ENA: 'ENA-USDT', ARKM: 'ARKM-USDT', PLUME: 'PLUME-USDT',
  SEI: 'SEI-USDT', DRAM: 'DRAM-USDT', MU: 'MU-USDT',
};
const COINGECKO_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
  AAVE: 'aave', SUI: 'sui', ONDO: 'ondo-finance', LDO: 'lido-dao',
  ENA: 'ethena', ARKM: 'arkham', SEI: 'sei-network',
};

// ===== 通道一：数字币价格（三重兜底）=====

async function fetchCryptoPriceBinance(coin: string): Promise<{ price: number; changePercent: number; open: number } | null> {
  const symbol = BINANCE_SYMBOL_MAP[coin.toUpperCase()];
  if (!symbol) return null;
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const price = parseFloat(d.lastPrice) || 0;
    const open = parseFloat(d.openPrice) || 0;
    const changePercent = parseFloat(d.priceChangePercent) || 0;
    if (price <= 0) return null;
    return { price, changePercent, open };
  } catch {
    return null;
  }
}

async function fetchCryptoPriceOKX(coin: string): Promise<{ price: number; changePercent: number; open: number } | null> {
  const instId = OKX_SYMBOL_MAP[coin.toUpperCase()];
  if (!instId) return null;
  try {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const ticker = d?.data?.[0];
    if (!ticker) return null;
    const price = parseFloat(ticker.last) || 0;
    const open = parseFloat(ticker.open24h) || 0;
    const changePercent = open > 0 ? ((price - open) / open * 100) : 0;
    if (price <= 0) return null;
    return { price, changePercent, open };
  } catch {
    return null;
  }
}

async function fetchCryptoPriceCoinGecko(coin: string): Promise<{ price: number; changePercent: number; open: number } | null> {
  const id = COINGECKO_ID_MAP[coin.toUpperCase()];
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const price = d?.[id]?.usd || 0;
    const changePercent = d?.[id]?.usd_24h_change || 0;
    if (price <= 0) return null;
    return { price, changePercent, open: 0 };
  } catch {
    return null;
  }
}

/** 获取单个数字币价格（三重兜底：币安→OKX→CoinGecko） */
export async function fetchCryptoPrice(coin: string): Promise<{ price: number; changePercent: number; open: number }> {
  const key = coin.toUpperCase();
  const cached = _cryptoCache[key];
  if (cached && Date.now() - cached.fetchedAt < CRYPTO_CACHE_TTL) {
    return { price: cached.price, changePercent: cached.changePercent, open: cached.open };
  }

  const result =
    (await fetchCryptoPriceBinance(key)) ||
    (await fetchCryptoPriceOKX(key)) ||
    (await fetchCryptoPriceCoinGecko(key)) ||
    { price: cached?.price || 0, changePercent: cached?.changePercent || 0, open: cached?.open || 0 };

  if (result.price > 0) {
    _cryptoCache[key] = { ...result, fetchedAt: Date.now() };
  }
  return result;
}

/** 批量获取多个数字币价格 */
export async function fetchCryptoPrices(coins: string[]): Promise<{
  prices: Record<string, number>;
  changes: Record<string, number>;
  opens: Record<string, number>;
  usdtCnyRate: number;
}> {
  const results = await Promise.allSettled(coins.map(c => fetchCryptoPrice(c)));
  const prices: Record<string, number> = {};
  const changes: Record<string, number> = {};
  const opens: Record<string, number> = {};
  coins.forEach((coin, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.price > 0) {
      prices[coin] = r.value.price;
      changes[coin] = r.value.changePercent;
      opens[coin] = r.value.open;
    }
  });
  // 汇率从 Worker 获取
  const rate = await fetchUsdCnyRate();
  return { prices, changes, opens, usdtCnyRate: rate };
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
    const result = d?.result?.data;
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
  return _rateCacheValue?.rate || 7.25; // 最终兜底
}

// ===== React Hooks =====

/** Hook：实时数字币价格（替换 trpc.getCryptoPrices.useQuery） */
export function useCryptoPrices(intervalMs = 3000) {
  const [data, setData] = useState<{
    prices: Record<string, number>;
    changes: Record<string, number>;
    opens: Record<string, number>;
    usdtCnyRate: number;
  }>({ prices: {}, changes: {}, opens: {}, usdtCnyRate: 7.25 });

  const ALL_COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'AAVE', 'SUI', 'ONDO', 'LDO', 'ENA', 'ARKM', 'SEI', 'PLUME', 'ASTER', 'DRAM', 'MU'];

  const fetch_ = useCallback(async () => {
    const result = await fetchCryptoPrices(ALL_COINS);
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
  const [rate, setRate] = useState<number>(7.25);

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
  const [data, setData] = useState<{ price: number; changePercent: number; success: boolean }>({ price: 0, changePercent: 0, success: false });
  useEffect(() => {
    fetchCryptoPrice('BTC').then(r => setData({ price: r.price, changePercent: r.changePercent, success: r.price > 0 }));
    const t = setInterval(() => {
      fetchCryptoPrice('BTC').then(r => setData({ price: r.price, changePercent: r.changePercent, success: r.price > 0 }));
    }, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return { data };
}
