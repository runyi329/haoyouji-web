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

// 内存价格缓存
const latestPrices: Record<string, { price: number; updatedAt: string }> = {};

const COINS = ['BTC', 'ETH', 'SOL', 'AAVE', 'SUI', 'ONDO', 'ASTER', 'LDO', 'ENA', 'ARKM'];

// 从文件恢复缓存（服务启动时调用）
function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const cached = JSON.parse(raw);
      for (const coin of COINS) {
        if (cached[coin]?.price && cached[coin]?.updatedAt) {
          latestPrices[coin] = cached[coin];
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

async function fetchPrice(coin: string): Promise<number | null> {
  // Gate.io 主用（与 af-tier-scanner 一致）
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
        if (!isNaN(price) && price > 0) return price;
      }
    }
  } catch {}

  // 火币备用
  try {
    const sym = `${coin.toLowerCase()}usdt`;
    const r = await fetch(
      `https://api.huobi.pro/market/detail/merged?symbol=${sym}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const j: any = await r.json();
      if (j.status === 'ok' && j.tick?.close) {
        return j.tick.close;
      }
    }
  } catch {}

  // OKX 备用
  try {
    const instId = `${coin}-USDT`;
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
      const price = await fetchPrice(coin);
      if (price !== null && price > 0) {
        latestPrices[coin] = { price, updatedAt: new Date().toISOString() };
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

export function getAllLatestPrices(): Record<string, { price: number; updatedAt: string }> {
  return { ...latestPrices };
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
  console.log('[价格扫描] 已启动，每30秒刷新 BTC/ETH/SOL/AAVE/SUI/ONDO/ASTER/LDO/ENA/ARKM 价格（含文件持久化）');
}
