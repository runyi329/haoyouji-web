/**
 * 统一实时行情扫描器。
 *
 * 设计原则：数字币使用 Gate.io → HTX → OKX；证券与商品优先新浪财经，
 * Yahoo Finance query1/query2 作为海外备用。所有请求并发执行，扫描任务绝不重入。
 */
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'price-cache.json');
const SCAN_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 7_000;

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

// 已覆盖原有行情需求，并包含52号账本当前的全部加密资产。
const CRYPTO_COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'HYPE', 'TRUMP', 'PENGU', 'XPL', 'WLFI', 'AVAX', 'DOGE', 'XLM', 'TIA', 'EIGEN', 'FET', 'AAVE', 'SUI', 'ONDO', 'ASTER', 'LDO', 'ENA', 'ARKM', 'SEI', 'PLUME'];
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

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

async function fetchCryptoQuote(coin: string): Promise<{ price: number; source: string; patch: Partial<PriceEntry> } | null> {
  const pair = `${coin}_USDT`;
  try {
    const data = await fetchJson(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`);
    const row = Array.isArray(data) ? data[0] : null;
    const price = Number(row?.last);
    if (isValidPrice(price)) return { price, source: 'Gate.io', patch: { high24h: Number(row.high_24h) || 0, low24h: Number(row.low_24h) || 0, volume24h: Number(row.base_volume) || 0, quoteVolume24h: Number(row.quote_volume) || 0 } };
  } catch {}
  try {
    const data = await fetchJson(`https://api.huobi.pro/market/detail/merged?symbol=${coin.toLowerCase()}usdt`);
    const tick = data?.status === 'ok' ? data.tick : null;
    const price = Number(tick?.close);
    if (isValidPrice(price)) return { price, source: 'HTX', patch: { high24h: Number(tick.high) || 0, low24h: Number(tick.low) || 0, volume24h: Number(tick.amount) || 0, quoteVolume24h: Number(tick.vol) || 0 } };
  } catch {}
  try {
    const data = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${coin}-USDT`);
    const row = data?.code === '0' ? data.data?.[0] : null;
    const price = Number(row?.last);
    if (isValidPrice(price)) return { price, source: 'OKX', patch: { high24h: Number(row.high24h) || 0, low24h: Number(row.low24h) || 0, volume24h: Number(row.vol) || 0, quoteVolume24h: Number(row.volCcy) || 0 } };
  } catch {}
  return null;
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
    for (const match of text.matchAll(/var\s+hq_str_([^=]+)="([^"]*)"/g)) {
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

async function refreshUsdtCnyRate() {
  try {
    const data = await fetchJson('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=USDT_CNY');
    const rate = Number(Array.isArray(data) ? data[0]?.last : 0);
    if (rate > 5 && rate < 10) usdtCnyRate = rate;
  } catch {
    try {
      const data = await fetchJson('https://www.okx.com/api/v5/market/ticker?instId=USDT-CNY');
      const rate = Number(data?.code === '0' ? data.data?.[0]?.last : 0);
      if (rate > 5 && rate < 10) usdtCnyRate = rate;
    } catch {}
  }
}

async function updateCrypto(coin: string) {
  const quote = await fetchCryptoQuote(coin);
  if (!quote) { markFailure(coin, 'Gate.io、HTX、OKX均无有效报价'); return; }
  const open = await fetchTodayOpen(coin);
  const change = open && open > 0 ? ((quote.price - open) / open) * 100 : undefined;
  entryFromPrice(coin, quote.price, quote.source, { ...quote.patch, todayOpen: open ?? undefined, changePercent: change });
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
  await Promise.all(CRYPTO_COINS.map(updateCrypto));
  await updateSecuritiesAndCommodities();
  await refreshUsdtCnyRate();
  saveCacheToFile();
}

async function scanPrices() {
  if (scanInProgress) return;
  scanInProgress = true;
  try { await scanPricesInternal(); }
  catch (error) { console.error('[行情] 本轮扫描异常:', error); }
  finally { scanInProgress = false; }
}

function scheduleNextScan() {
  nextScanTimer = setTimeout(async () => {
    await scanPrices();
    scheduleNextScan();
  }, SCAN_INTERVAL_MS);
}

export function startPriceScanner() {
  if (nextScanTimer) return;
  loadCacheFromFile();
  void scanPrices().then(scheduleNextScan);
  console.log(`[行情] 统一行情扫描已启动：并发扫描、非重入、每轮结束后${SCAN_INTERVAL_MS / 1000}秒再次执行`);
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
    const limit = CRYPTO_COINS.includes(coin) ? 120 : 1800;
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
