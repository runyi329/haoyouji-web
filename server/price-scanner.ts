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

async function fetchPriceWithChange(coin: string): Promise<{ price: number; changePercent: number } | null> {
  // Gate.io 主用（返回 last 和 change_percentage）
  try {
    const pair = `${coin}_USDT`;
    const r = await fetch(
      `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const data: any[] = await r.json();
      if (Array.isArray(data) && data.length > 0 && data[0].last) {
        const price = parseFloat(data[0].last);
        const changePercent = data[0].change_percentage ? parseFloat(data[0].change_percentage) * 100 : 0;
        if (!isNaN(price) && price > 0) return { price, changePercent };
      }
    }
  } catch {}

  // 火币备用（open + close 计算涨跌幅）
  try {
    const sym = `${coin.toLowerCase()}usdt`;
    const r = await fetch(
      `https://api.huobi.pro/market/detail/merged?symbol=${sym}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const j: any = await r.json();
      if (j.status === 'ok' && j.tick?.close) {
        const price = j.tick.close;
        const open = j.tick.open;
        const changePercent = open ? ((price - open) / open) * 100 : 0;
        return { price, changePercent };
      }
    }
  } catch {}

  // OKX 备用（open24h + last 计算涨跌幅）
  try {
    const instId = `${coin}-USDT`;
    const r = await fetch(
      `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const j: any = await r.json();
      if (j.code === '0' && j.data?.[0]?.last) {
        const price = parseFloat(j.data[0].last);
        const open24h = parseFloat(j.data[0].open24h);
        const changePercent = open24h ? ((price - open24h) / open24h) * 100 : 0;
        return { price, changePercent };
      }
    }
  } catch {}

  return null;
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
        latestPrices[coin] = { price: result.price, changePercent: result.changePercent, updatedAt: new Date().toISOString() };
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
  // 每30秒扫描一次（规范：crypto-price-unified，前端 refetchInterval: 30000）
  setInterval(() => {
    scanPrices().catch(err => console.error('[价格扫描] 定时扫描失败:', err));
  }, 30 * 1000);
  console.log('[价格扫描] 已启动，每30秒刷新加密货币+股票合约价格（含文件持久化）');
}
