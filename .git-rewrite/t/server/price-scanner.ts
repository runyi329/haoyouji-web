/**
 * 实时价格扫描器
 * 每10秒从 Gate.io / 火币 / OKX 获取 BTC/ETH/SOL 的最新价格
 * 内存缓存供盈亏计算使用
 * 数据源优先级与 af-tier-scanner 保持一致：Gate.io > 火币 > OKX
 * 持久化：每次更新后写入本地文件，服务重启时自动恢复上次价格
 */

import fs from 'fs';
import path from 'path';

// 持久化缓存文件路径（服务器本地）
const CACHE_FILE = path.join(process.cwd(), 'price-cache.json');

// 内存价格缓存（含今日开盘价、24h高低价、成交量）
const latestPrices: Record<string, { price: number; todayOpen: number; changePercent: number; high24h: number; low24h: number; volume24h: number; quoteVolume24h: number; updatedAt: string }> = {};

const COINS = ['BTC', 'ETH', 'SOL', 'AAVE', 'SUI', 'ONDO', 'ASTER', 'LDO', 'ENA', 'ARKM'];
// 股票类合约（仅 OKX SWAP 有价格，Gate.io/火币无此品种）
const STOCK_COINS = ['TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ', 'NFLX', 'ORCL', 'TSM', 'AMD', 'CL', 'NG'];

// 从文件恢复缓存（服务启动时调用）
function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const cached = JSON.parse(raw);
      for (const coin of [...COINS, ...STOCK_COINS]) {
        if (cached[coin]?.price && cached[coin]?.updatedAt) {
          latestPrices[coin] = { price: cached[coin].price, todayOpen: cached[coin].todayOpen ?? 0, changePercent: cached[coin].changePercent ?? 0, high24h: cached[coin].high24h ?? 0, low24h: cached[coin].low24h ?? 0, volume24h: cached[coin].volume24h ?? 0, quoteVolume24h: cached[coin].quoteVolume24h ?? 0, updatedAt: cached[coin].updatedAt };
        }
      }
      const coins = Object.entries(latestPrices).map(([k, v]) => `${k}=${v.price}`).join(', ');
      if (coins) console.log('[价格扫描] 从缓存文件恢复价格:', coins);
    }
  } catch (e) {
    console.warn('[价格扫描] 读取缓存文件失败（忽略）:', (e as Error).message);
  }
}

// 将当前价格写入文件
function saveCacheToFile() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(latestPrices, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[价格扫描] 写入缓存文件失败（忽略）:', (e as Error).message);
  }
}

/**
 * 获取当日开盘价（火币日K，北京时间 00:00 对齐）
 * 火币日K线的 id 就是当天北京时间 00:00 的 Unix 时间戳
 */
async function fetchTodayOpen(coin: string): Promise<number | null> {
  try {
    const sym = `${coin.toLowerCase()}usdt`;
    const r = await fetch(
      `https://api.huobi.pro/market/history/kline?symbol=${sym}&period=1day&size=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const j: any = await r.json();
      if (j.status === 'ok' && j.data?.[0]?.open) {
        return j.data[0].open;
      }
    }
  } catch {}
  return null;
}

async function fetchPriceWithChange(coin: string): Promise<{ price: number; todayOpen: number | null; changePercent: number | null; high24h: number | null; low24h: number | null; volume24h: number | null; quoteVolume24h: number | null } | null> {
  let price: number | null = null;
  let high24h: number | null = null;
  let low24h: number | null = null;
  let volume24h: number | null = null;
  let quoteVolume24h: number | null = null;

  // Gate.io 主用（取价格 + 高低价 + 成交量）
  try {
    const pair = `${coin}_USDT`;
    const r = await fetch(
      `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const data: any[] = await r.json();
      if (Array.isArray(data) && data.length > 0 && data[0].last) {
        const p = parseFloat(data[0].last);
        if (!isNaN(p) && p > 0) {
          price = p;
          if (data[0].high_24h) high24h = parseFloat(data[0].high_24h);
          if (data[0].low_24h) low24h = parseFloat(data[0].low_24h);
          if (data[0].base_volume) volume24h = parseFloat(data[0].base_volume);
          if (data[0].quote_volume) quoteVolume24h = parseFloat(data[0].quote_volume);
        }
      }
    }
  } catch {}

  // 火币备用（获取价格 + 高低价 + 成交量）
  if (!price) {
    try {
      const sym = `${coin.toLowerCase()}usdt`;
      const r = await fetch(
        `https://api.huobi.pro/market/detail/merged?symbol=${sym}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const j: any = await r.json();
        if (j.status === 'ok' && j.tick?.close) {
          price = j.tick.close;
          if (j.tick.high) high24h = j.tick.high;
          if (j.tick.low) low24h = j.tick.low;
          if (j.tick.amount) volume24h = j.tick.amount;
          if (j.tick.vol) quoteVolume24h = j.tick.vol;
        }
      }
    } catch {}
  }

  // OKX 备用（获取价格 + 高低价 + 成交量）
  if (!price) {
    try {
      const instId = `${coin}-USDT`;
      const r = await fetch(
        `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const j: any = await r.json();
        if (j.code === '0' && j.data?.[0]?.last) {
          price = parseFloat(j.data[0].last);
          if (j.data[0].high24h) high24h = parseFloat(j.data[0].high24h);
          if (j.data[0].low24h) low24h = parseFloat(j.data[0].low24h);
          if (j.data[0].vol) volume24h = parseFloat(j.data[0].vol);
          if (j.data[0].volCcy) quoteVolume24h = parseFloat(j.data[0].volCcy);
        }
      }
    } catch {}
  }

  if (!price) return null;

  // 用火币日K线开盘价计算当日涨跌幅（北京时间 00:00 对齐）
  const todayOpen = await fetchTodayOpen(coin);
  // 查不到开盘价时返回 null，让上层保留上次缓存的 changePercent
  const changePercent = todayOpen && todayOpen > 0
    ? ((price - todayOpen) / todayOpen) * 100
    : null;

  return { price, todayOpen, changePercent, high24h, low24h, volume24h, quoteVolume24h };
}

async function fetchPrice(coin: string): Promise<number | null> {
  const result = await fetchPriceWithChange(coin);
  return result ? result.price : null;
}

// 股票类合约专用：通过 OKX SWAP 接口获取价格
async function fetchStockPrice(coin: string): Promise<number | null> {
  try {
    const instId = `${coin}-USDT-SWAP`;
    const r = await fetch(
      `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const j: any = await r.json();
      if (j.code === '0' && j.data?.[0]?.last) {
        return parseFloat(j.data[0].last);
      }
    }
  } catch {}
  return null;
}

async function scanPrices() {
  let updated = false;
  for (const coin of COINS) {
    try {
      const result = await fetchPriceWithChange(coin);
      if (result !== null && result.price > 0) {
        // changePercent 为 null 时（火币日K查不到）保留上次缓存值，不覆盖
        const prevChange = latestPrices[coin]?.changePercent ?? 0;
        const prevOpen = latestPrices[coin]?.todayOpen ?? 0;
        latestPrices[coin] = {
          price: result.price,
          todayOpen: result.todayOpen !== null ? result.todayOpen : prevOpen,
          changePercent: result.changePercent !== null ? result.changePercent : prevChange,
          high24h: result.high24h !== null ? result.high24h : (latestPrices[coin]?.high24h ?? 0),
          low24h: result.low24h !== null ? result.low24h : (latestPrices[coin]?.low24h ?? 0),
          volume24h: result.volume24h !== null ? result.volume24h : (latestPrices[coin]?.volume24h ?? 0),
          quoteVolume24h: result.quoteVolume24h !== null ? result.quoteVolume24h : (latestPrices[coin]?.quoteVolume24h ?? 0),
          updatedAt: new Date().toISOString()
        };
        updated = true;
      }
    } catch (err) {
      console.error(`[价格扫描] ${coin} 获取失败:`, err);
    }
  }
  // 扫描股票类合约（OKX SWAP 接口）
  for (const coin of STOCK_COINS) {
    try {
      const price = await fetchStockPrice(coin);
      if (price !== null && price > 0) {
        // 股票类合约保留已有的 todayOpen 和 changePercent，暂不计算
        const prevChange = latestPrices[coin]?.changePercent ?? 0;
        const prevOpen = latestPrices[coin]?.todayOpen ?? 0;
        latestPrices[coin] = { price, todayOpen: prevOpen, changePercent: prevChange, high24h: latestPrices[coin]?.high24h ?? 0, low24h: latestPrices[coin]?.low24h ?? 0, volume24h: latestPrices[coin]?.volume24h ?? 0, quoteVolume24h: latestPrices[coin]?.quoteVolume24h ?? 0, updatedAt: new Date().toISOString() };
        updated = true;
      }
    } catch (err) {
      console.error(`[价格扫描] ${coin} 获取失败:`, err);
    }
  }
  // 有更新时持久化到文件
  if (updated) saveCacheToFile();
}

export function getLatestPrice(coin: string): number | null {
  // USDT 是稳定币，固定价格为 1 美元
  if (coin.toUpperCase() === 'USDT') return 1.0;
  const entry = latestPrices[coin.toUpperCase()];
  if (!entry) return null;
  // 只要有缓存价格就返回，不设过期限制
  // 服务器无法访问境外API时，至少用上一次持久化缓存的价格显示资产
  return entry.price;
}

export function getAllLatestPrices(): Record<string, { price: number; todayOpen: number; changePercent: number; high24h: number; low24h: number; volume24h: number; quoteVolume24h: number; updatedAt: string }> {
  return { ...latestPrices };
}

export function getLatestChangePercent(coin: string): number | null {
  const entry = latestPrices[coin.toUpperCase()];
  if (!entry) return null;
  return entry.changePercent;
}

export function getLatestTickerData(coin: string): { price: number; todayOpen: number; changePercent: number; high24h: number; low24h: number; volume24h: number; quoteVolume24h: number } | null {
  const entry = latestPrices[coin.toUpperCase()];
  if (!entry) return null;
  return { price: entry.price, todayOpen: entry.todayOpen, changePercent: entry.changePercent, high24h: entry.high24h, low24h: entry.low24h, volume24h: entry.volume24h, quoteVolume24h: entry.quoteVolume24h };
}

export function startPriceScanner() {
  // 先从文件恢复上次的价格（避免重启后短暂显示---）
  loadCacheFromFile();
  // 立即执行一次扫描更新到最新价格
  scanPrices().then(() => {
    console.log('[价格扫描] 首次扫描完成:', Object.entries(latestPrices).map(([k, v]) => `${k}=${v.price}`).join(', '));
  });
  // 每3秒扫描一次（规范：crypto-price-unified，前端 refetchInterval: 3000）
  setInterval(() => {
    scanPrices().catch(err => console.error('[价格扫描] 定时扫描失败:', err));
  }, 3 * 1000);
  console.log('[价格扫描] 已启动，每3秒刷新加密货币+股票合约价格（含文件持久化）');
}
