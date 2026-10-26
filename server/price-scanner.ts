/**
 * 统一实时行情扫描器。
 *
 * 设计原则：数字币使用 Gate.io → HTX → OKX；证券与商品优先新浪财经，
 * Yahoo Finance query1/query2 作为海外备用。所有请求并发执行，扫描任务绝不重入。
 */
import fs from 'fs';
import path from 'path';
import { hasLedger52T0PendingOrders, scanLedger52T0PendingOrders } from './ledger52-t0-journal';
const CACHE_FILE = path.join(process.cwd(), 'price-cache.json');
const CRYPTO_SCAN_INTERVAL_MS = 3_000;
const SLOW_MARKET_SCAN_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 7_000;
const CRYPTO_REQUEST_TIMEOUT_MS = 2_000;
const FAST_CRYPTO_CYCLE_TIMEOUT_MS = 2_500;
// T+0 永续标记价使用 Gate → HTX 主备；接口响应较慢时单独给足时限。
const PERPETUAL_MARK_REQUEST_TIMEOUT_MS = 4_000;
const GATE_ETH_PERPETUAL_WS_URL = 'wss://fx-ws.gateio.ws/v4/ws/usdt';
const PERPETUAL_MARK_STREAM_STALE_MS = 12_000;
const PERPETUAL_MARK_STREAM_PING_MS = 20_000;
const PERPETUAL_MARK_RECONNECT_MIN_MS = 1_000;
const PERPETUAL_MARK_RECONNECT_MAX_MS = 30_000;
const PERPETUAL_MARK_CACHE_SAVE_DELAY_MS = 2_000;

type PriceEntry = {
  price: number;
  todayOpen: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  updatedAt: string;
};

type PriceHealth = {
  source: string;
  lastSuccessAt: string;
  lastAttemptAt: string;
  consecutiveFailures: number;
  lastError?: string;
};

const latestPrices: Record<string, PriceEntry> = {};
const priceHealth: Record<string, PriceHealth> = {};
let usdtCnyRate = 6.7;
let scanInProgress = false;
let nextScanTimer: NodeJS.Timeout | null = null;
let lastSlowMarketScanAt = 0;
let slowMarketScanInProgress = false;
let usdtCnyRefreshInProgress = false;
let perpetualMarkScanInProgress = false;
let perpetualMarkSocket: WebSocket | null = null;
let perpetualMarkStreamStarted = false;
let perpetualMarkStreamLastMessageAt = 0;
let perpetualMarkStreamReconnectDelayMs = PERPETUAL_MARK_RECONNECT_MIN_MS;
let perpetualMarkStreamReconnectTimer: NodeJS.Timeout | null = null;
let perpetualMarkStreamPingTimer: NodeJS.Timeout | null = null;
let perpetualMarkCacheSaveTimer: NodeJS.Timeout | null = null;
type PendingOrderMarkTick = { price: number; observedAt: Date; rangeHigh: number; rangeLow: number };
const pendingOrderMarkTicks: PendingOrderMarkTick[] = [];
let pendingOrderMarkTriggerRunning = false;
type CompletedT0MinuteMarkRange = { high: number; low: number; openedAt: Date; observedAt: Date };
let latestCompletedT0MinuteMarkRange: CompletedT0MinuteMarkRange | null = null;
let completedT0MinuteMarkRangeRefreshInFlight = false;
let lastCompletedT0MinuteMarkRangeRefreshAt = 0;
const T0_COMPLETED_MINUTE_RANGE_REFRESH_MS = 3_000;
const T0_COMPLETED_MINUTE_RANGE_MAX_AGE_MS = 125_000;

// 已覆盖原有行情需求，并包含52号账本当前的全部加密资产。
// 数字币按 Gate.io → HTX → OKX 的顺序查询 USDT 现货报价；B2 为 Binance Alpha 的 B² Network 代币。
const CRYPTO_COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'HYPE', 'TRUMP', 'PENGU', 'XPL', 'WLFI', 'AVAX', 'DOGE', 'XLM', 'TIA', 'EIGEN', 'FET', 'AAVE', 'SUI', 'ONDO', 'ASTER', 'LDO', 'ENA', 'ARKM', 'UNI', 'SEI', 'PLUME', 'ADA', 'ZRO', 'WLD', 'LINK', 'POL', 'CRV', 'PEPE', 'B2'];
// ETH 现货用于钱包估值；T+0 合约账本单独使用此键对应的永续合约标记价，绝不覆盖 ETH 现货报价。
const ETH_PERP_MARK_CACHE_KEY = 'ETH_PERP';
// 美股/指数化合约。优先走新浪美股，缺失才走 OKX SWAP。
const STOCK_COINS = ['COIN', 'AAOI', 'HOOD', 'SLV', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ', 'NFLX', 'ORCL', 'TSM', 'AMD'];
// 商品与海外股票：新浪国内源优先，Yahoo 双域名兜底。
const YAHOO_ONLY_COINS = ['COIN', 'AAOI', 'HOOD', 'SLV', 'CRCL', 'DRAM', 'MU', 'MSTR', 'SKHYNIX'];
// 代币化美股现货：系统统一显示基础股票代码，行情优先使用对应的X前缀交易对。
const TOKENIZED_STOCK_SPOT_MAP: Record<string, string> = {
  AAOI: 'XAAOI-USDT',
  HOOD: 'XHOOD-USDT',
};
const COMMODITY_COINS = ['BZ', 'CL', 'NG'];
const KRW_COINS = new Set(['SKHYNIX']);

const YAHOO_CODE_MAP: Record<string, string> = {
  BZ: 'BZ=F',
  CL: 'CL=F',
  NG: 'NG=F',
  SKHYNIX: '000660.KS',
};

const SINA_CODE_MAP: Record<string, string> = {
  COIN: 'gb_coin', AAOI: 'gb_aaoi', HOOD: 'gb_hood', SLV: 'gb_slv', TSLA: 'gb_tsla', NVDA: 'gb_nvda', AAPL: 'gb_aapl', MSFT: 'gb_msft',
  GOOGL: 'gb_googl', META: 'gb_meta', AMZN: 'gb_amzn', SPY: 'gb_spy',
  QQQ: 'gb_qqq', NFLX: 'gb_nflx', ORCL: 'gb_orcl', TSM: 'gb_tsm',
  AMD: 'gb_amd', CRCL: 'gb_crcl', DRAM: 'gb_dram', MU: 'gb_mu', MSTR: 'gb_mstr',
  BZ: 'hf_OIL', CL: 'hf_CL', NG: 'hf_NG',
};

function nowIso() { return new Date().toISOString(); }
function isValidPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function setPrice(coin: string, entry: PriceEntry, source: string) {
  const key = coin.toUpperCase();
  latestPrices[key] = entry;
  priceHealth[key] = {
    source,
    lastSuccessAt: entry.updatedAt,
    lastAttemptAt: entry.updatedAt,
    consecutiveFailures: 0,
  };
}

function markFailure(coin: string, error: unknown) {
  const key = coin.toUpperCase();
  const previous = priceHealth[key];
  priceHealth[key] = {
    source: previous?.source ?? 'none',
    lastSuccessAt: previous?.lastSuccessAt ?? latestPrices[key]?.updatedAt ?? '',
    lastAttemptAt: nowIso(),
    consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
    lastError: error instanceof Error ? error.message : String(error || 'all sources unavailable'),
  };
}

function entryFromPrice(coin: string, price: number, source: string, patch: Partial<PriceEntry> = {}) {
  const previous = latestPrices[coin] ?? { price, todayOpen: price, changePercent: 0, high24h: 0, low24h: 0, volume24h: 0, quoteVolume24h: 0, updatedAt: nowIso() };
  const entry: PriceEntry = {
    price,
    todayOpen: patch.todayOpen ?? previous.todayOpen ?? price,
    changePercent: patch.changePercent ?? previous.changePercent ?? 0,
    high24h: patch.high24h ?? previous.high24h ?? 0,
    low24h: patch.low24h ?? previous.low24h ?? 0,
    volume24h: patch.volume24h ?? previous.volume24h ?? 0,
    quoteVolume24h: patch.quoteVolume24h ?? previous.quoteVolume24h ?? 0,
    updatedAt: nowIso(),
  };
  setPrice(coin, entry, source);
}

/**
 * 每个 ETH 永续标记价更新均可触发挂单成交和止盈判断；没有自动订单时完全跳过。
 * 实时流逐笔排队；若突发积压，则合并为高低价区间，确保短暂跨价后回落也不会漏掉。
 */
function triggerLedger52T0PendingOrders(
  price: number,
  observedAt = new Date(),
  range: { high?: number; low?: number } = {},
) {
  if (process.env.DEV_BYPASS_AUTH === 'true' || !hasLedger52T0PendingOrders() || !isValidPrice(price)) return;
  // 实时价扫描不等待外部K线请求；已缓存的完整分钟线会被同一次数据库判定作为第二依据带入。
  void refreshLatestCompletedT0MinuteMarkRange();
  const requestedHigh = Number(range.high);
  const requestedLow = Number(range.low);
  const rangeHigh = isValidPrice(requestedHigh) ? Math.max(price, requestedHigh) : price;
  const rangeLow = isValidPrice(requestedLow) ? Math.min(price, requestedLow) : price;
  pendingOrderMarkTicks.push({ price, observedAt, rangeHigh, rangeLow });
  if (pendingOrderMarkTicks.length > 120) {
    const overflow = pendingOrderMarkTicks.splice(0, pendingOrderMarkTicks.length - 120);
    const latestOverflow = overflow[overflow.length - 1];
    if (latestOverflow) {
      pendingOrderMarkTicks.unshift({
        price: latestOverflow.price,
        observedAt: latestOverflow.observedAt,
        rangeHigh: Math.max(...overflow.map((tick) => tick.rangeHigh)),
        rangeLow: Math.min(...overflow.map((tick) => tick.rangeLow)),
      });
    }
  }
  if (pendingOrderMarkTriggerRunning) return;

  pendingOrderMarkTriggerRunning = true;
  void (async () => {
    try {
      while (pendingOrderMarkTicks.length > 0 && hasLedger52T0PendingOrders()) {
        const tick = pendingOrderMarkTicks.shift();
        if (!tick) continue;
        const result = await scanLedger52T0PendingOrders({
          markPrice: tick.price,
          filledAt: tick.observedAt,
          rangeHigh: tick.rangeHigh,
          rangeLow: tick.rangeLow,
          completedMinuteRange: getLatestCompletedT0MinuteMarkRange() ?? undefined,
        });
        if (result.filled > 0 || result.takeProfit > 0) {
          console.log(`[T0自动订单] 永续扫描区间 ${tick.rangeLow}–${tick.rangeHigh}，挂单成交 ${result.filled} 笔，自动止盈 ${result.takeProfit} 笔`);
        }
      }
    } catch (error) {
      console.error('[T0自动订单] 永续区间判断失败:', error instanceof Error ? error.message : error);
    } finally {
      pendingOrderMarkTriggerRunning = false;
      if (!hasLedger52T0PendingOrders()) pendingOrderMarkTicks.length = 0;
      else {
        const next = pendingOrderMarkTicks.shift();
        if (next) triggerLedger52T0PendingOrders(next.price, next.observedAt, { high: next.rangeHigh, low: next.rangeLow });
      }
    }
  })();
}

function loadCacheFromFile() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Record<string, PriceEntry>;
    for (const [coin, item] of Object.entries(cached)) {
      if (item && isValidPrice(item.price) && item.updatedAt) {
        latestPrices[coin] = item;
        priceHealth[coin] = { source: '本地持久化缓存', lastSuccessAt: item.updatedAt, lastAttemptAt: item.updatedAt, consecutiveFailures: 0 };
      }
    }
  } catch (error) {
    console.warn('[行情] 读取本地缓存失败:', (error as Error).message);
  }
}

function saveCacheToFile() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(latestPrices, null, 2), 'utf8'); }
  catch (error) { console.warn('[行情] 写入本地缓存失败:', (error as Error).message); }
}

/** Gate WebSocket 可能在短时间内连续推送；合并落盘，内存价格仍逐条即时更新。 */
function schedulePerpetualMarkCacheSave() {
  if (perpetualMarkCacheSaveTimer) return;
  perpetualMarkCacheSaveTimer = setTimeout(() => {
    perpetualMarkCacheSaveTimer = null;
    saveCacheToFile();
  }, PERPETUAL_MARK_CACHE_SAVE_DELAY_MS);
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

/** 数字币行情高频刷新不等待慢源，单个交易对请求最多占用两秒。 */
async function fetchCryptoJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(CRYPTO_REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

/** 永续标记价独立使用略长时限，避免影响普通现货报价的高频熔断。 */
async function fetchPerpetualMarkJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(PERPETUAL_MARK_REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

async function fetchCryptoQuote(coin: string): Promise<{ price: number; source: string; patch: Partial<PriceEntry> } | null> {
  const pair = `${coin}_USDT`;
  try {
    const data = await fetchCryptoJson(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`);
    const row = Array.isArray(data) ? data[0] : null;
    const price = Number(row?.last);
    const changePercent = Number(row?.change_percentage);
    if (isValidPrice(price)) return { price, source: 'Gate.io', patch: { high24h: Number(row.high_24h) || 0, low24h: Number(row.low_24h) || 0, volume24h: Number(row.base_volume) || 0, quoteVolume24h: Number(row.quote_volume) || 0, changePercent: Number.isFinite(changePercent) ? changePercent : undefined } };
  } catch {}
  try {
    const data = await fetchCryptoJson(`https://api.huobi.pro/market/detail/merged?symbol=${coin.toLowerCase()}usdt`);
    const tick = data?.status === 'ok' ? data.tick : null;
    const price = Number(tick?.close);
    if (isValidPrice(price)) return { price, source: 'HTX', patch: { high24h: Number(tick.high) || 0, low24h: Number(tick.low) || 0, volume24h: Number(tick.amount) || 0, quoteVolume24h: Number(tick.vol) || 0 } };
  } catch {}
  try {
    const data = await fetchCryptoJson(`https://www.okx.com/api/v5/market/ticker?instId=${coin}-USDT`);
    const row = data?.code === '0' ? data.data?.[0] : null;
    const price = Number(row?.last);
    if (isValidPrice(price)) return { price, source: 'OKX', patch: { high24h: Number(row.high24h) || 0, low24h: Number(row.low24h) || 0, volume24h: Number(row.vol) || 0, quoteVolume24h: Number(row.volCcy) || 0 } };
  } catch {}
  return null;
}

/**
 * ETH/USDT 永续合约标记价。Gate → HTX 主备；两者不可用时保留最后成功缓存，不调用 OKX。
 * 仅用于合约速记，不影响钱包的 ETH 现货估值。
 */
async function fetchEthPerpetualMarkQuote(): Promise<{ price: number; source: string; patch: Partial<PriceEntry> } | null> {
  try {
    const data = await fetchPerpetualMarkJson('https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=ETH_USDT');
    const row = Array.isArray(data) ? data[0] : null;
    const price = Number(row?.mark_price);
    const changePercent = Number(row?.change_percentage);
    if (isValidPrice(price)) {
      return {
        price,
        source: 'Gate.io ETH/USDT 永续标记价',
        patch: {
          high24h: Number(row?.high_24h) || 0,
          low24h: Number(row?.low_24h) || 0,
          volume24h: Number(row?.volume_24h_base) || 0,
          quoteVolume24h: Number(row?.volume_24h_quote) || 0,
          changePercent: Number.isFinite(changePercent) ? changePercent : undefined,
        },
      };
    }
  } catch {}
  try {
    // HTX 公开接口返回最新 1 分钟标记价 K 线，作为 Gate 暂不可用时的永续价格兜底。
    const data = await fetchPerpetualMarkJson('https://api.hbdm.com/index/market/history/linear_swap_mark_price_kline?contract_code=ETH-USDT&period=1min&size=1');
    const row = data?.status === 'ok' ? data.data?.[0] : null;
    const price = Number(row?.close);
    if (isValidPrice(price)) return { price, source: 'HTX ETH/USDT 永续标记价', patch: {} };
  } catch {}
  return null;
}


/** HTX ETH 永续标记价一分钟K线；仅供T+0挂单的启动/定期漏扫复核使用。 */
export type T0EthPerpetualMarkHistoryCandle = {
  openedAt: Date;
  observedAt: Date;
  close: number;
  high: number;
  low: number;
};

/**
 * Gate 当前只提供实时标记价，因此历史补扫固定读取 HTX 官方一分钟标记价K线。
 * 仅返回按时间正序排列的已收盘有效K线；任何进行中、缺价或异常K线都不会参与自动订单判断。
 */
export async function getT0EthPerpetualMarkHistory(limit = 1_500): Promise<T0EthPerpetualMarkHistoryCandle[]> {
  const requestedLimit = Math.max(1, Math.min(1_500, Math.floor(limit)));
  try {
    const endpoint = new URL('https://api.hbdm.com/index/market/history/linear_swap_mark_price_kline');
    endpoint.searchParams.set('contract_code', 'ETH-USDT');
    endpoint.searchParams.set('period', '1min');
    endpoint.searchParams.set('size', String(requestedLimit));
    const data = await fetchPerpetualMarkJson(endpoint.toString());
    const now = Date.now();
    return (Array.isArray(data?.data) ? data.data : [])
      .map((row: any) => {
        const rawEpoch = Number(row?.id);
        const openedAtMs = rawEpoch > 1_000_000_000_000 ? rawEpoch : rawEpoch * 1_000;
        const observedAtMs = openedAtMs + 59_999;
        const close = Number(row?.close);
        const high = Number(row?.high);
        const low = Number(row?.low);
        if (!Number.isFinite(openedAtMs) || openedAtMs <= 0 || observedAtMs > now
          || !isValidPrice(close) || !isValidPrice(high) || !isValidPrice(low)) return null;
        return {
          openedAt: new Date(openedAtMs),
          // 将一分钟K线的事件时点置于该分钟收盘，保证只用已经完整形成的区间。
          observedAt: new Date(observedAtMs),
          close,
          high: Math.max(high, low),
          low: Math.min(high, low),
        } satisfies T0EthPerpetualMarkHistoryCandle;
      })
      .filter((row): row is T0EthPerpetualMarkHistoryCandle => row !== null)
      .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime());
  } catch {
    return [];
  }
}

/**
 * 返回最近一根已收盘的一分钟标记价区间。未收盘K线不得作为挂单成交依据，
 * 否则会把挂单创建前同一分钟发生的波动误归为该订单的成交依据。
 */
function getLatestCompletedT0MinuteMarkRange(): CompletedT0MinuteMarkRange | null {
  if (!latestCompletedT0MinuteMarkRange) return null;
  const age = Date.now() - latestCompletedT0MinuteMarkRange.observedAt.getTime();
  if (!Number.isFinite(age) || age < 0 || age > T0_COMPLETED_MINUTE_RANGE_MAX_AGE_MS) return null;
  return latestCompletedT0MinuteMarkRange;
}

async function refreshLatestCompletedT0MinuteMarkRange() {
  if (!hasLedger52T0PendingOrders() || completedT0MinuteMarkRangeRefreshInFlight) return;
  const now = Date.now();
  if (now - lastCompletedT0MinuteMarkRangeRefreshAt < T0_COMPLETED_MINUTE_RANGE_REFRESH_MS) return;
  lastCompletedT0MinuteMarkRangeRefreshAt = now;
  completedT0MinuteMarkRangeRefreshInFlight = true;
  try {
    const candles = await getT0EthPerpetualMarkHistory(2);
    // observedAt 是分钟收盘时刻；只采纳已经结束的K线，绝不使用当前进行中的一分钟。
    const latestClosed = [...candles].reverse().find((candle) => candle.observedAt.getTime() <= Date.now());
    if (!latestClosed) return;
    latestCompletedT0MinuteMarkRange = {
      high: latestClosed.high,
      low: latestClosed.low,
      openedAt: latestClosed.openedAt,
      observedAt: latestClosed.observedAt,
    };
  } catch {
    // 保留尚未过期的上一根完整分钟线；超过时效会由读取函数自动拒绝使用。
  } finally {
    completedT0MinuteMarkRangeRefreshInFlight = false;
  }
}

async function fetchTodayOpen(coin: string): Promise<number | null> {
  try {
    const data = await fetchJson(`https://api.huobi.pro/market/history/kline?symbol=${coin.toLowerCase()}usdt&period=1day&size=1`);
    const value = Number(data?.status === 'ok' ? data.data?.[0]?.open : 0);
    return isValidPrice(value) ? value : null;
  } catch { return null; }
}

async function fetchYahooPrice(symbol: string): Promise<number | null> {
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const data = await fetchJson(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const value = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
      if (isValidPrice(value)) return value;
    } catch {}
  }
  return null;
}

/** Yahoo 回退未返回交易日期时，按纽约时区标记美股交易日，不能误用北京时间跨日。 */
function newYorkTradingDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** 国内优先的新浪批量行情：美股的第2列为最新价，hf_商品的第1列为最新价。 */
async function fetchSinaQuotes(coins: string[]): Promise<Record<string, number>> {
  const reverse = new Map<string, string>();
  const codes = coins.map(coin => {
    const code = SINA_CODE_MAP[coin];
    if (code) reverse.set(code, coin);
    return code;
  }).filter(Boolean);
  if (!codes.length) return {};
  try {
    const response = await fetch(`https://hq.sinajs.cn/list=${codes.join(',')}`, {
      headers: { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return {};
    const text = new TextDecoder('gbk').decode(await response.arrayBuffer());
    const result: Record<string, number> = {};
    const quotePattern = /var\s+hq_str_([^=]+)="([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = quotePattern.exec(text)) !== null) {
      const code = match[1];
      const coin = reverse.get(code);
      if (!coin) continue;
      const parts = match[2].split(',');
      const price = Number(code.startsWith('hf_') ? parts[0] : parts[1]);
      if (isValidPrice(price)) result[coin] = price;
    }
    return result;
  } catch { return {}; }
}

type OnDemandStockQuote = {
  price: number;
  currency: 'USD' | 'CNY';
  source: string;
  updatedAt: string;
  priceDate?: string;
  name?: string;
};

export type ManualStockMarket = 'A' | 'US';

export type ManualStockSuggestion = {
  /** 订单中统一保存的交易所代码，例如 600519.SH 或 AAPL。 */
  symbol: string;
  /** 管理员识别用的本地交易代码。 */
  code: string;
  name: string;
  market: ManualStockMarket;
  currency: 'CNY' | 'USD';
  /** 美股挂牌交易所；A股不填写。 */
  exchange?: string | null;
  /** 选中股票时写入一笔最新价；随后由每日 15:05 的盘尾快照覆盖。 */
  latestPrice?: number;
  latestPriceDate?: string;
  latestPriceUpdatedAt?: string;
};

/** 兼容既有52号订单调用；新37号标签统一使用 ManualStockSuggestion。 */
export type ManualAshareStockSuggestion = ManualStockSuggestion;

/**
 * 针对融资订单里管理员临时录入的股票代码查询最新价格。
 * 常规扫描只覆盖项目预置的证券；这个入口允许安全地读取最多 20 个
 * 合法的美股 / A 股代码，不会把任意 URL 交给外部请求。
 */
function normalizeOnDemandStockSymbol(raw: string): string | null {
  const symbol = String(raw || '').trim().toUpperCase();
  if (/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol)) return symbol;
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(symbol)) return symbol;
  return null;
}

async function fetchSinaOnDemandStockQuote(symbol: string): Promise<OnDemandStockQuote | null> {
  const aShare = symbol.match(/^(\d{6})\.(SH|SZ|BJ)$/);
  const sinaCode = aShare
    ? `${aShare[2].toLowerCase()}${aShare[1]}`
    : `gb_${symbol.toLowerCase()}`;
  try {
    const response = await fetch(`https://hq.sinajs.cn/list=${encodeURIComponent(sinaCode)}`, {
      headers: { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const text = new TextDecoder('gbk').decode(await response.arrayBuffer());
    const match = text.match(/var\s+hq_str_[^=]+="([^"]*)"/);
    if (!match?.[1]) return null;
    const parts = match[1].split(',');
    // 美股 gb_ 的第 2 项、A 股 sh/sz/bj 的第 4 项均为最近成交价。
    // A股开盘前/休市时最近成交价会返回 0；此时用昨收作为最后有效参考价，
    // 以便新加入的股票保证金能立即完成估值，且用来源明确标识并不伪称盘中成交。
    const latestPrice = Number(aShare ? parts[3] : parts[1]);
    const previousClose = aShare ? Number(parts[2]) : NaN;
    const usePreviousClose = aShare !== null && !isValidPrice(latestPrice) && isValidPrice(previousClose);
    const price = usePreviousClose ? previousClose : latestPrice;
    if (!isValidPrice(price)) return null;
    const dateIndex = parts.findIndex((part) => /^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(String(part).trim()));
    return {
      price,
      currency: aShare ? 'CNY' : 'USD',
      source: usePreviousClose ? '新浪财经·昨收参考' : '新浪财经',
      updatedAt: nowIso(),
      priceDate: dateIndex >= 0 ? String(parts[dateIndex]).trim().slice(0, 10) : undefined,
      name: String(parts[0] || '').trim() || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * 52号账本手工股票组合的盘中参考价。
 *
 * 仅由服务端的交易时段任务调用，前端订单页始终只读取已保存的数据；
 * 盘尾 15:05 仍通过 fetchEndOfDayStockCloseSnapshots 固化日结价。
 */
export async function fetchIntradayStockQuotes(symbols: string[]): Promise<Record<string, OnDemandStockQuote>> {
  const uniqueSymbols = Array.from(new Set(symbols
    .map(normalizeOnDemandStockSymbol)
    .filter((symbol): symbol is string => !!symbol)))
    .slice(0, 200);
  const results: Record<string, OnDemandStockQuote> = {};

  await Promise.all(uniqueSymbols.map(async (symbol) => {
    const sina = await fetchSinaOnDemandStockQuote(symbol);
    if (sina) {
      results[symbol] = sina;
      return;
    }
    // 美股盘中更新与录入检索使用同一组回退来源，避免新浪短暂限流后持仓估值停止刷新。
    if (!/^\d{6}\.(SH|SZ|BJ)$/.test(symbol)) {
      const yahooPrice = await fetchYahooPrice(symbol);
      if (yahooPrice) {
        results[symbol] = {
          price: yahooPrice,
          currency: 'USD',
          source: 'Yahoo Finance',
          updatedAt: nowIso(),
          priceDate: newYorkTradingDate(),
        };
      }
    }
  }));

  return results;
}

function expectedAshareSuffix(code: string): 'SH' | 'SZ' | 'BJ' | null {
  if (/^(?:600|601|603|605|688)\d{3}$/.test(code)) return 'SH';
  if (/^(?:000|001|002|003|300|301)\d{3}$/.test(code)) return 'SZ';
  if (/^(?:4[3-9]|8[0-9]|9[02])\d{4}$/.test(code)) return 'BJ';
  return null;
}

type ManualAshareStockBase = Omit<ManualStockSuggestion, 'latestPrice' | 'latestPriceDate' | 'latestPriceUpdatedAt'>;

async function searchLocalManualAshareStocks(query: string): Promise<ManualAshareStockBase[]> {
  const rawQuery = String(query || '').trim();
  if (!rawQuery) return [];
  try {
    // 本地 5210 只 A 股目录是建议接口异常时的兜底。动态导入避免行情扫描器启动时形成数据库循环依赖。
    const { getDbConnection } = await import('./db');
    const conn = await getDbConnection();
    if (!conn) return [];
    const compactCode = rawQuery
      .toUpperCase()
      .replace(/^(?:SH|SZ|BJ)[._-]?/, '')
      .replace(/[._-]?(?:SH|SZ|BJ)$/, '')
      .replace(/\s+/g, '');
    const isExactCode = /^\d{6}$/.test(compactCode);
    const [rows] = await (conn as any).execute(
      isExactCode
        ? 'SELECT code, name FROM stock_list WHERE code = ? LIMIT 8'
        : 'SELECT code, name FROM stock_list WHERE name LIKE ? ORDER BY name LIMIT 8',
      [isExactCode ? compactCode : `%${rawQuery}%`],
    );
    const suggestions: Array<ManualAshareStockBase | null> = (rows as any[])
      .map((row): ManualAshareStockBase | null => {
        const code = String(row?.code || '').trim().padStart(6, '0');
        const suffix = expectedAshareSuffix(code);
        const name = String(row?.name || '').trim();
        return suffix && name ? { symbol: `${code}.${suffix}`, code, name, market: 'A' as const, currency: 'CNY' as const } : null;
      });
    return suggestions.filter((item): item is ManualAshareStockBase => item !== null);
  } catch {
    return [];
  }
}

async function hydrateManualAshareStockSuggestions(results: ManualAshareStockBase[]): Promise<ManualAshareStockSuggestion[]> {
  return await Promise.all(results.slice(0, 8).map(async (result) => {
    const quote = await fetchSinaOnDemandStockQuote(result.symbol);
    return {
      ...result,
      ...(quote ? {
        latestPrice: quote.price,
        latestPriceDate: quote.priceDate,
        latestPriceUpdatedAt: quote.updatedAt,
      } : {}),
    };
  }));
}

/**
 * A 股检索可按六码、中文名称或拼音简称匹配；只接受可校验的沪深北代码。
 * 选中时获取一笔最新价，订单保存后由每日 15:05 盘尾快照接管，不会产生盘中轮询。
 */
export async function searchManualAshareStocks(query: string): Promise<ManualAshareStockSuggestion[]> {
  const normalizedQuery = String(query || '').trim();
  if (normalizedQuery.length < 2 || normalizedQuery.length > 40) return [];
  const deduped = new Map<string, ManualAshareStockBase>();
  try {
    const response = await fetch(`https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15&key=${encodeURIComponent(normalizedQuery)}`, {
      headers: { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Sina suggestion response ${response.status}`);
    const text = new TextDecoder('gbk').decode(await response.arrayBuffer());
    const payload = text.match(/suggestvalue="([^"]*)"/)?.[1] || '';
    for (const row of payload.split(';')) {
      const fields = row.split(',').map((item) => item.trim());
      const marketCode = fields[3] || fields[0] || '';
      const match = marketCode.match(/^(sh|sz|bj)(\d{6})$/i);
      if (!match) continue;
      const code = match[2];
      const suffix = expectedAshareSuffix(code);
      if (!suffix || suffix !== match[1].toUpperCase()) continue;
      const name = String(fields[4] || fields[0] || '').trim();
      if (!name) continue;
      const symbol = `${code}.${suffix}`;
      deduped.set(symbol, { symbol, code, name, market: 'A', currency: 'CNY' });
    }
  } catch {
    // 建议源偶发网络/限流不应让管理员无法验证股票，继续读取本地目录。
  }
  const remoteResults = Array.from(deduped.values());
  const baseResults = remoteResults.length > 0
    ? remoteResults
    : await searchLocalManualAshareStocks(normalizedQuery);
  return await hydrateManualAshareStockSuggestions(baseResults);
}

type ManualUsStockBase = Pick<ManualStockSuggestion, 'symbol' | 'code' | 'name' | 'market' | 'currency' | 'exchange'>;

/** 将行情源与本地目录的缩写统一为用户可读的美股挂牌市场。 */
export function normalizeUsStockExchange(value: unknown): string | null {
  const raw = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!raw) return null;
  if (['NMS', 'NGM', 'NCM', 'NAS', 'NASDAQ', 'NASDAQGS', 'NASDAQGM', 'NASDAQCM'].includes(raw)) return 'NASDAQ';
  if (['NYQ', 'NYSE', 'XNYS', 'NEW YORK STOCK EXCHANGE'].includes(raw)) return 'NYSE';
  if (['ASE', 'AMEX', 'XASE', 'NYSE AMERICAN', 'NYSEAMERICAN'].includes(raw)) return 'NYSE American';
  if (['BATS', 'CBOE', 'CBOE BZX', 'BZX'].includes(raw)) return 'Cboe BZX';
  return raw;
}

// 新股基础目录同步可能晚于实际上市。仅收录已由发行人/交易所公开确认的补充项；
// 未列入时保持空值，前端不会猜测其挂牌市场。
const VERIFIED_US_STOCK_EXCHANGE_OVERRIDES: Record<string, string> = {
  CRCL: 'NYSE',
};

export function resolveUsStockExchange(symbol: unknown, sourceExchange?: unknown): string | null {
  return normalizeUsStockExchange(sourceExchange)
    || VERIFIED_US_STOCK_EXCHANGE_OVERRIDES[String(symbol || '').trim().toUpperCase()]
    || null;
}

/**
 * 美股基础目录已在生产库中维护。先在目录按代码、英文名及中文名模糊匹配，
 * 再逐只取实时价核验，避免把用户输入的任意英文字符串误当成可交易 ticker。
 */
async function searchLocalManualUsStocks(query: string): Promise<ManualUsStockBase[]> {
  const normalizedQuery = String(query || '').trim().toUpperCase();
  if (!normalizedQuery || normalizedQuery.length > 40) return [];
  try {
    const { getDbConnection } = await import('./db');
    const conn = await getDbConnection();
    if (!conn) return [];
    const contains = `%${normalizedQuery}%`;
    const startsWith = `${normalizedQuery}%`;
    const [rows] = await (conn as any).execute(
      `SELECT ts_code, name, enname, exchange
       FROM us_stock_basic
       WHERE classify = 'EQ'
         AND (UPPER(ts_code) LIKE ? OR UPPER(COALESCE(name, '')) LIKE ? OR UPPER(COALESCE(enname, '')) LIKE ?)
       ORDER BY CASE
         WHEN UPPER(ts_code) = ? THEN 0
         WHEN UPPER(ts_code) LIKE ? THEN 1
         WHEN UPPER(COALESCE(enname, '')) = ? THEN 2
         WHEN UPPER(COALESCE(enname, '')) LIKE ? THEN 3
         WHEN UPPER(COALESCE(name, '')) LIKE ? THEN 4
         ELSE 5
       END, list_date DESC, ts_code ASC
       LIMIT 8`,
      [contains, contains, contains, normalizedQuery, startsWith, normalizedQuery, startsWith, startsWith],
    );
    return (rows as any[]).flatMap((row): ManualUsStockBase[] => {
      const symbol = String(row?.ts_code || '').trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol)) return [];
      const name = String(row?.name || row?.enname || symbol).trim() || symbol;
      return [{ symbol, code: symbol, name, market: 'US', currency: 'USD', exchange: resolveUsStockExchange(symbol, row?.exchange) }];
    });
  } catch {
    // 目录暂不可用时，仍允许用合法 ticker 直接走行情源核验。
    return [];
  }
}

/** Yahoo 的搜索目录补足本地基础表中尚未同步的英文公司全名，例如 NVIDIA Corporation。 */
async function searchYahooManualUsStocks(query: string): Promise<ManualUsStockBase[]> {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery || normalizedQuery.length > 40) return [];
  const usEquityExchanges = new Set(['NMS', 'NYQ', 'ASE', 'NGM', 'NCM', 'NAS']);
  try {
    const data = await fetchJson(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(normalizedQuery)}&quotesCount=8&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    return (Array.isArray(data?.quotes) ? data.quotes : []).flatMap((row: any): ManualUsStockBase[] => {
      const symbol = String(row?.symbol || '').trim().toUpperCase();
      const quoteType = String(row?.quoteType || '').toUpperCase();
      const exchange = String(row?.exchange || '').toUpperCase();
      if (quoteType !== 'EQUITY' || !usEquityExchanges.has(exchange) || !/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol)) return [];
      const name = String(row?.longname || row?.shortname || symbol).trim() || symbol;
      return [{ symbol, code: symbol, name, market: 'US', currency: 'USD', exchange: resolveUsStockExchange(symbol, row?.fullExchangeName || exchange) }];
    });
  } catch {
    return [];
  }
}

/** 美股支持 ticker、英文名及目录中中文名的模糊搜索；候选项均必须有最新有效报价。 */
export async function searchManualUsStocks(query: string): Promise<ManualStockSuggestion[]> {
  const rawQuery = String(query || '').trim();
  const normalizedQuery = rawQuery.toUpperCase();
  if (!normalizedQuery || normalizedQuery.length > 40) return [];
  const [yahooMatches, directoryMatches] = await Promise.all([
    searchYahooManualUsStocks(rawQuery),
    searchLocalManualUsStocks(rawQuery),
  ]);
  const candidates = new Map<string, ManualUsStockBase>();
  // 输入合法 ticker 时即使基础目录尚未收录新股，也保持原有的直接核验能力。
  if (/^[A-Z][A-Z0-9.\-]{0,14}$/.test(normalizedQuery)) {
    candidates.set(normalizedQuery, {
      symbol: normalizedQuery,
      code: normalizedQuery,
      name: normalizedQuery,
      market: 'US',
      currency: 'USD',
      exchange: resolveUsStockExchange(normalizedQuery),
    });
  }
  yahooMatches.forEach((item) => candidates.set(item.symbol, item));
  directoryMatches.forEach((item) => {
    const previous = candidates.get(item.symbol);
    candidates.set(item.symbol, {
      ...previous,
      ...item,
      exchange: item.exchange || previous?.exchange || resolveUsStockExchange(item.symbol),
    });
  });
  const bases = Array.from(candidates.values()).slice(0, 8);
  if (bases.length === 0) return [];
  const quotes = await fetchIntradayStockQuotes(bases.map((item) => item.symbol));
  return bases.flatMap((item): ManualStockSuggestion[] => {
    const quote = quotes[item.symbol];
    if (!quote?.price || quote.price <= 0) return [];
    return [{
      ...item,
      name: item.name || quote.name || item.symbol,
      exchange: resolveUsStockExchange(item.symbol, item.exchange),
      latestPrice: quote.price,
      latestPriceDate: quote.priceDate,
      latestPriceUpdatedAt: quote.updatedAt,
    }];
  });
}

/** 37号股票标签的统一检索入口：A股可按名称/拼音，美股可按代码或名称模糊核验。 */
export async function searchManualStocks(query: string, market: ManualStockMarket = 'A'): Promise<ManualStockSuggestion[]> {
  return market === 'US' ? searchManualUsStocks(query) : searchManualAshareStocks(query);
}

/** Tushare 仅作为日线收盘价兜底，令牌必须在服务端环境变量中配置。 */
async function fetchTushareDailyClose(symbol: string): Promise<OnDemandStockQuote | null> {
  const token = String(process.env.TUSHARE_TOKEN || process.env.TS_TOKEN || '').trim();
  if (!token) return null;
  const aShare = /^(\d{6})\.(SH|SZ|BJ)$/.test(symbol);
  const apiName = aShare ? 'daily' : 'us_daily';
  try {
    const response = await fetch('https://api.tushare.pro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_name: apiName,
        token,
        params: { ts_code: symbol },
        fields: 'trade_date,close',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload = await response.json() as any;
    const fields: string[] = Array.isArray(payload?.data?.fields) ? payload.data.fields : [];
    const row: unknown[] | undefined = Array.isArray(payload?.data?.items) ? payload.data.items[0] : undefined;
    const closeIndex = fields.indexOf('close');
    const tradeDateIndex = fields.indexOf('trade_date');
    const price = Number(row?.[closeIndex]);
    if (!isValidPrice(price)) return null;
    return {
      price,
      currency: aShare ? 'CNY' : 'USD',
      source: 'Tushare 日线收盘',
      updatedAt: nowIso(),
      priceDate: String(row?.[tradeDateIndex] || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * 盘尾任务使用的收盘价快照：Tushare 日线为首选，新浪为同日兜底，
 * Yahoo 仅用于前两者均不可用时保留最近一个有效收盘参考。
 * 此函数只由每日任务调用；前端页面不会在盘中触发外部报价请求。
 */
export async function fetchEndOfDayStockCloseSnapshots(symbols: string[]): Promise<Record<string, OnDemandStockQuote>> {
  const uniqueSymbols = Array.from(new Set(symbols
    .map(normalizeOnDemandStockSymbol)
    .filter((symbol): symbol is string => !!symbol)))
    .slice(0, 200);
  const results: Record<string, OnDemandStockQuote> = {};

  await Promise.all(uniqueSymbols.map(async (symbol) => {
    const tushare = await fetchTushareDailyClose(symbol);
    if (tushare) {
      results[symbol] = tushare;
      return;
    }

    const sina = await fetchSinaOnDemandStockQuote(symbol);
    if (sina) {
      results[symbol] = sina;
      return;
    }

    const yahoo = await fetchYahooPrice(symbol);
    if (yahoo) {
      results[symbol] = {
        price: yahoo,
        currency: 'USD',
        source: 'Yahoo Finance',
        updatedAt: nowIso(),
        priceDate: newYorkTradingDate(),
      };
      return;
    }
  }));

  return results;
}

async function fetchOkxSwap(coin: string): Promise<number | null> {
  try {
    const data = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${coin}-USDT-SWAP`);
    const value = Number(data?.code === '0' ? data.data?.[0]?.last : 0);
    return isValidPrice(value) ? value : null;
  } catch { return null; }
}

async function fetchOkxSpotQuote(instId: string): Promise<{ price: number; patch: Partial<PriceEntry> } | null> {
  try {
    const data = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`);
    const row = data?.code === '0' ? data.data?.[0] : null;
    const price = Number(row?.last);
    if (!isValidPrice(price)) return null;
    const todayOpen = Number(row.open24h) || price;
    return {
      price,
      patch: {
        todayOpen,
        changePercent: todayOpen > 0 ? ((price - todayOpen) / todayOpen) * 100 : 0,
        high24h: Number(row.high24h) || 0,
        low24h: Number(row.low24h) || 0,
        volume24h: Number(row.vol24h) || 0,
        quoteVolume24h: Number(row.volCcy24h) || 0,
      },
    };
  } catch { return null; }
}

/**
 * 37号混合币种股票标签在北京时间15:05固化日结前显式调用，避免将上一轮扫描
 * 的旧汇率写为当天的统一人民币结算汇率。
 */
export async function refreshUsdtCnyRate(): Promise<number> {
  try {
    const data = await fetchCryptoJson('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=USDT_CNY');
    const rate = Number(Array.isArray(data) ? data[0]?.last : 0);
    if (rate > 5 && rate < 10) usdtCnyRate = rate;
  } catch {
    try {
      const data = await fetchCryptoJson('https://www.okx.com/api/v5/market/ticker?instId=USDT-CNY');
      const rate = Number(data?.code === '0' ? data.data?.[0]?.last : 0);
      if (rate > 5 && rate < 10) usdtCnyRate = rate;
    } catch {}
  }
  return usdtCnyRate;
}

async function updateCrypto(coin: string) {
  const quote = await fetchCryptoQuote(coin);
  if (!quote) { markFailure(coin, 'Gate.io、HTX、OKX均无有效报价'); return; }
  const open = await fetchTodayOpen(coin);
  const change = open && open > 0 ? ((quote.price - open) / open) * 100 : undefined;
  entryFromPrice(coin, quote.price, quote.source, { ...quote.patch, todayOpen: open ?? undefined, changePercent: change });
}

/** 高频轮询只更新成交价及交易所已返回的24小时字段，避免为每个币种再发一笔日K请求。 */
async function updateCryptoFast(coin: string) {
  // 个别交易对可能被上游限流且 fetch 的底层连接迟迟不释放；外层再兜一层硬时限，
  // 不能让一枚冷门币阻塞全部资产的下一轮三秒报价。
  let timeout: NodeJS.Timeout | null = null;
  const quote = await Promise.race([
    fetchCryptoQuote(coin),
    new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), FAST_CRYPTO_CYCLE_TIMEOUT_MS);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  if (!quote) {
    markFailure(coin, 'Gate.io、HTX、OKX均无有效报价');
    return;
  }
  entryFromPrice(coin, quote.price, quote.source, quote.patch);
}

/**
 * 以同一缓存与三秒节拍维护 ETH 永续标记价；失败时保留最近成功值。
 * WebSocket 健康时逐笔处理；流暂不可用时追加一分钟标记价高低区间，避免轮询空档漏触发。
 */
async function updateEthPerpetualMarkFast() {
  const quote = await fetchEthPerpetualMarkQuote();
  if (!quote) {
    markFailure(ETH_PERP_MARK_CACHE_KEY, 'Gate、HTX均无有效ETH永续标记价，保留最近成功价');
    return;
  }
  entryFromPrice(ETH_PERP_MARK_CACHE_KEY, quote.price, quote.source, quote.patch);
  if (hasLedger52T0PendingOrders()) void refreshLatestCompletedT0MinuteMarkRange();
  triggerLedger52T0PendingOrders(quote.price, new Date());
}

/** 常规数字币以小请求并发方式统一每三秒写入同一份内存缓存。 */
async function updateAllCryptoFast() {
  await Promise.all(CRYPTO_COINS.map(updateCryptoFast));
}

/** 永续标记价独立调度，不让三源合约回退影响全站现货报价节拍。 */
async function scanEthPerpetualMark() {
  if (perpetualMarkScanInProgress) return;
  perpetualMarkScanInProgress = true;
  try {
    await updateEthPerpetualMarkFast();
  } catch (error) {
    console.warn('[行情] ETH永续标记价刷新异常:', error);
  } finally {
    perpetualMarkScanInProgress = false;
    saveCacheToFile();
  }
}

function isEthPerpetualMarkStreamFresh() {
  return perpetualMarkSocket?.readyState === WebSocket.OPEN
    && Date.now() - perpetualMarkStreamLastMessageAt < PERPETUAL_MARK_STREAM_STALE_MS;
}

function clearEthPerpetualMarkStreamPing() {
  if (!perpetualMarkStreamPingTimer) return;
  clearInterval(perpetualMarkStreamPingTimer);
  perpetualMarkStreamPingTimer = null;
}

function scheduleEthPerpetualMarkReconnect() {
  if (!perpetualMarkStreamStarted || perpetualMarkStreamReconnectTimer) return;
  const delay = perpetualMarkStreamReconnectDelayMs;
  perpetualMarkStreamReconnectDelayMs = Math.min(
    PERPETUAL_MARK_RECONNECT_MAX_MS,
    perpetualMarkStreamReconnectDelayMs * 2,
  );
  perpetualMarkStreamReconnectTimer = setTimeout(() => {
    perpetualMarkStreamReconnectTimer = null;
    connectEthPerpetualMarkStream();
  }, delay);
}

function connectEthPerpetualMarkStream() {
  if (!perpetualMarkStreamStarted) return;
  if (perpetualMarkSocket && (
    perpetualMarkSocket.readyState === WebSocket.CONNECTING
    || perpetualMarkSocket.readyState === WebSocket.OPEN
  )) return;

  let socket: WebSocket;
  try {
    socket = new WebSocket(GATE_ETH_PERPETUAL_WS_URL);
  } catch (error) {
    console.warn('[行情] T+0 ETH永续实时流创建失败:', (error as Error).message);
    scheduleEthPerpetualMarkReconnect();
    return;
  }
  perpetualMarkSocket = socket;

  socket.addEventListener('open', () => {
    if (perpetualMarkSocket !== socket) return;
    perpetualMarkStreamReconnectDelayMs = PERPETUAL_MARK_RECONNECT_MIN_MS;
    socket.send(JSON.stringify({
      time: Math.floor(Date.now() / 1000),
      channel: 'futures.tickers',
      event: 'subscribe',
      payload: ['ETH_USDT'],
    }));
    clearEthPerpetualMarkStreamPing();
    perpetualMarkStreamPingTimer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ time: Math.floor(Date.now() / 1000), channel: 'futures.ping' }));
    }, PERPETUAL_MARK_STREAM_PING_MS);
    console.log('[行情] T+0 ETH永续实时流已连接');
  });

  socket.addEventListener('message', (event) => {
    if (perpetualMarkSocket !== socket) return;
    try {
      const payload = JSON.parse(String(event.data));
      if (payload?.channel !== 'futures.tickers' || payload?.event !== 'update') return;
      const rows = Array.isArray(payload?.result) ? payload.result : [];
      const row = rows.find((item: any) => item?.contract === 'ETH_USDT');
      const price = Number(row?.mark_price);
      if (!isValidPrice(price)) return;
      const changePercent = Number(row?.change_percentage);
      entryFromPrice(ETH_PERP_MARK_CACHE_KEY, price, 'Gate.io ETH/USDT 永续标记价（实时）', {
        high24h: Number(row?.high_24h) || 0,
        low24h: Number(row?.low_24h) || 0,
        volume24h: Number(row?.volume_24h_base) || 0,
        quoteVolume24h: Number(row?.volume_24h_quote) || 0,
        changePercent: Number.isFinite(changePercent) ? changePercent : undefined,
      });
      const observedAt = Number.isFinite(Number(row?.t)) ? new Date(Number(row.t)) : new Date();
      triggerLedger52T0PendingOrders(price, observedAt);
      perpetualMarkStreamLastMessageAt = Date.now();
      schedulePerpetualMarkCacheSave();
    } catch (error) {
      console.warn('[行情] T+0 ETH永续实时流消息解析失败:', (error as Error).message);
    }
  });

  socket.addEventListener('error', () => {
    // close 事件会统一清理并安排退避重连，避免同一异常重复打印。
  });

  socket.addEventListener('close', () => {
    if (perpetualMarkSocket !== socket) return;
    perpetualMarkSocket = null;
    clearEthPerpetualMarkStreamPing();
    console.warn('[行情] T+0 ETH永续实时流已断开，临时回退REST并准备重连');
    scheduleEthPerpetualMarkReconnect();
  });
}

/**
 * T+0 专属常驻实时流：仅订阅一个 ETH 永续合约，不影响全站现货扫描。
 * 页面打开时直接读取持久化/内存缓存；WebSocket 首包与后续推送持续更新该缓存，断线时保留 REST 主备兜底。
 */
function startEthPerpetualMarkStream() {
  if (perpetualMarkStreamStarted) return;
  perpetualMarkStreamStarted = true;
  connectEthPerpetualMarkStream();
}

async function updateSecuritiesAndCommodities() {
  const sinaCoins = [...STOCK_COINS, 'CRCL', 'DRAM', 'MU', 'MSTR', ...COMMODITY_COINS];
  const sina = await fetchSinaQuotes(sinaCoins);
  for (const [coin, price] of Object.entries(sina)) entryFromPrice(coin, price, '新浪财经');

  const unresolvedStocks = STOCK_COINS.filter(coin => !sina[coin]);
  await Promise.all(unresolvedStocks.map(async coin => {
    const price = await fetchOkxSwap(coin);
    if (price) entryFromPrice(coin, price, 'OKX SWAP');
    else markFailure(coin, '新浪财经和OKX SWAP均无有效报价');
  }));

  const yahooCoins = [...YAHOO_ONLY_COINS, ...COMMODITY_COINS.filter(coin => !sina[coin])];
  let usdKrw = 0;
  if (yahooCoins.includes('SKHYNIX')) usdKrw = (await fetchYahooPrice('USDKRW=X')) ?? 0;
  await Promise.all(yahooCoins.filter(coin => !sina[coin]).map(async coin => {
    const raw = await fetchYahooPrice(YAHOO_CODE_MAP[coin] ?? coin);
    const price = raw && KRW_COINS.has(coin) && usdKrw > 0 ? raw / usdKrw : raw;
    if (price && isValidPrice(price)) entryFromPrice(coin, price, 'Yahoo Finance');
    else markFailure(coin, '新浪财经及Yahoo Finance均无有效报价');
  }));

  // XAAOI/XHOOD为对应美股的24/7代币化现货。可用时覆盖传统美股延迟报价；失败时保留新浪/Yahoo结果。
  await Promise.all(Object.entries(TOKENIZED_STOCK_SPOT_MAP).map(async ([coin, instId]) => {
    const quote = await fetchOkxSpotQuote(instId);
    if (quote) entryFromPrice(coin, quote.price, `OKX ${instId.replace('-', '/')}`, quote.patch);
  }));
}

async function scanPricesInternal() {
  await updateAllCryptoFast();
  if (!usdtCnyRefreshInProgress) {
    usdtCnyRefreshInProgress = true;
    // 人民币估值与数字币报价同频更新；失败时保留上一笔有效汇率。
    void refreshUsdtCnyRate()
      .catch((error) => console.warn('[行情] USDT/CNY 刷新失败:', error))
      .finally(() => {
        usdtCnyRefreshInProgress = false;
        saveCacheToFile();
      });
  }
  const now = Date.now();
  if (!slowMarketScanInProgress && now - lastSlowMarketScanAt >= SLOW_MARKET_SCAN_INTERVAL_MS) {
    lastSlowMarketScanAt = now;
    slowMarketScanInProgress = true;
    void updateSecuritiesAndCommodities()
      .catch((error) => console.warn('[行情] 慢速市场刷新失败:', error))
      .finally(() => {
        slowMarketScanInProgress = false;
        saveCacheToFile();
      });
  }
  saveCacheToFile();
}

async function scanPrices() {
  if (scanInProgress) return;
  scanInProgress = true;
  try { await scanPricesInternal(); }
  catch (error) { console.error('[行情] 本轮扫描异常:', error); }
  finally { scanInProgress = false; }
}

export function startPriceScanner() {
  if (nextScanTimer) return;
  loadCacheFromFile();
  void scanPrices();
  startEthPerpetualMarkStream();
  // WebSocket 建连或收流异常时才以 Gate → HTX REST 保温；完整一分钟K线则始终仅在有自动订单时缓存为安全补扫依据。
  void scanEthPerpetualMark();
  void refreshLatestCompletedT0MinuteMarkRange();
  // 固定节拍：上一轮尚未完成时由 scanInProgress 丢弃本轮，避免“完成后再等三秒”变成六秒。
  nextScanTimer = setInterval(() => { void scanPrices(); }, CRYPTO_SCAN_INTERVAL_MS);
  setInterval(() => {
    if (hasLedger52T0PendingOrders()) void refreshLatestCompletedT0MinuteMarkRange();
    if (!isEthPerpetualMarkStreamFresh()) void scanEthPerpetualMark();
  }, CRYPTO_SCAN_INTERVAL_MS);
  console.log(`[行情] 统一行情扫描已启动：数字币固定每${CRYPTO_SCAN_INTERVAL_MS / 1000}秒刷新，ETH永续由T+0专属实时流维护，证券与商品每${SLOW_MARKET_SCAN_INTERVAL_MS / 1000}秒刷新`);
}

export function getLatestPrice(coin: string): number | null {
  const key = coin.toUpperCase();
  if (key === 'USDT' || key === 'USDC' || key === 'BUSD' || key === 'DAI') return 1;
  if (key === 'CNY') return 1;
  const entry = latestPrices[key];
  if (!entry) return null;
  if (KRW_COINS.has(key) && entry.price > 10000) return Number((entry.price / 1400).toFixed(4));
  return entry.price;
}

export function getAllLatestPrices() { return { ...latestPrices }; }
export function getT0EthPerpetualMark() {
  const entry = latestPrices[ETH_PERP_MARK_CACHE_KEY];
  const health = priceHealth[ETH_PERP_MARK_CACHE_KEY];
  return {
    price: entry?.price ?? null,
    updatedAt: entry?.updatedAt ?? null,
    source: health?.source ?? 'none',
    ageMilliseconds: entry ? Math.max(0, Date.now() - new Date(entry.updatedAt).getTime()) : null,
  };
}
export function getLatestChangePercent(coin: string): number | null { return latestPrices[coin.toUpperCase()]?.changePercent ?? null; }
export function getLatestTickerData(coin: string): Omit<PriceEntry, 'updatedAt'> | null {
  const entry = latestPrices[coin.toUpperCase()];
  if (!entry) return null;
  const { updatedAt: _updatedAt, ...ticker } = entry;
  return ticker;
}

export function getMarketPriceHealth() {
  const now = Date.now();
  const result: Record<string, PriceHealth & { ageSeconds: number; stale: boolean }> = {};
  for (const [coin, health] of Object.entries(priceHealth)) {
    const ageSeconds = health.lastSuccessAt ? Math.max(0, Math.floor((now - new Date(health.lastSuccessAt).getTime()) / 1000)) : Number.MAX_SAFE_INTEGER;
    // 开盘资产120秒、休市资产30分钟后标记为需要人工核查；不删除最后有效价。
    const limit = CRYPTO_COINS.includes(coin) || coin === ETH_PERP_MARK_CACHE_KEY ? 120 : 1800;
    result[coin] = { ...health, ageSeconds, stale: ageSeconds > limit };
  }
  return result;
}

export function getUsdtCnyRate() { return usdtCnyRate; }

export async function testCoinPrice(symbol: string): Promise<{ price: number; source: string; supported: boolean }> {
  const coin = symbol.toUpperCase().trim();
  if (coin === 'USDT' || coin === 'USDC') return { price: 1, source: '稳定币固定汇率', supported: true };
  if (SINA_CODE_MAP[coin]) {
    const sina = await fetchSinaQuotes([coin]);
    if (sina[coin]) return { price: sina[coin], source: '新浪财经', supported: true };
  }
  if (YAHOO_ONLY_COINS.includes(coin) || COMMODITY_COINS.includes(coin)) {
    const raw = await fetchYahooPrice(YAHOO_CODE_MAP[coin] ?? coin);
    if (raw) return { price: raw, source: 'Yahoo Finance', supported: true };
  }
  const crypto = await fetchCryptoQuote(coin);
  if (crypto) return { price: crypto.price, source: crypto.source, supported: true };
  const swap = await fetchOkxSwap(coin);
  if (swap) return { price: swap, source: 'OKX SWAP', supported: true };
  return { price: 0, source: 'none', supported: false };
}
