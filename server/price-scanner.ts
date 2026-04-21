/**
 * 实时价格扫描器
 * 每30秒从 Gate.io / 火币 / OKX 获取 BTC/ETH/SOL 的最新价格
 * 内存缓存供盈亏计算使用
 * 数据源优先级与 af-tier-scanner 保持一致：Gate.io > 火币 > OKX
 * 持久化：每次更新后写入本地文件，服务重启时自动恢复上次价格
 */

import fs from 'fs';
import path from 'path';

// 持久化缓存文件路径（服务器本地）
const CACHE_FILE = path.join(process.cwd(), 'price-cache.json');

// 内存价格缓存（含24h涨跌幅）
const latestPrices: Record<string, { price: number; changePercent: number; updatedAt: string }> = {};

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
          latestPrices[coin] = { price: cached[coin].price, changePercent: cached[coin].changePercent ?? 0, updatedAt: cached[coin].updatedAt };
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

async function fetchPriceWithChange(coin: string): Promise<{ price: number; changePercent: number | null } | null> {
  let price: number | null = null;

  // Gate.io 主用（只取价格）
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
        if (!isNaN(p) && p > 0) price = p;
      }
    }
  } catch {}

  // 火币备用（获取价格）
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
        }
      }
    } catch {}
  }

  // OKX 备用（获取价格）
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

  return { price, changePercent };
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
        latestPrices[coin] = {
          price: result.price,
          changePercent: result.changePercent !== null ? result.changePercent : prevChange,
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
        // 股票类合约保留已有的 changePercent，暂不计算
        const prevChange = latestPrices[coin]?.changePercent ?? 0;
        latestPrices[coin] = { price, changePercent: prevChange, updatedAt: new Date().toISOString() };
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

export function getAllLatestPrices(): Record<string, { price: number; changePercent: number; updatedAt: string }> {
  return { ...latestPrices };
}

export function getLatestChangePercent(coin: string): number | null {
  const entry = latestPrices[coin.toUpperCase()];
  if (!entry) return null;
  return entry.changePercent;
}

export function startPriceScanner() {
  // 先从文件恢复上次的价格（避免重启后短暂显示---）
  loadCacheFromFile();
  // 立即执行一次扫描更新到最新价格
  scanPrices().then(() => {
    console.log('[价格扫描] 首次扫描完成:', Object.entries(latestPrices).map(([k, v]) => `${k}=${v.price}`).join(', '));
  });
  // 每10秒扫描一次（规范：crypto-price-unified，前端 refetchInterval: 10000）
  setInterval(() => {
    scanPrices().catch(err => console.error('[价格扫描] 定时扫描失败:', err));
  }, 10 * 1000);
  console.log('[价格扫描] 已启动，每10秒刷新加密货币+股票合约价格（含文件持久化）');
}
