/**
 * 实时价格扫描器
 * 每60秒从 Gate.io / 火币 / OKX 获取 BTC/ETH/SOL 的最新价格
 * 内存缓存供盈亏计算使用
 * 数据源优先级与 af-tier-scanner 保持一致：Gate.io > 火币 > OKX
 */

// 内存价格缓存
const latestPrices: Record<string, { price: number; updatedAt: string }> = {};

const COINS = ['BTC', 'ETH', 'SOL'];

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
  for (const coin of COINS) {
    try {
      const price = await fetchPrice(coin);
      if (price !== null && price > 0) {
        latestPrices[coin] = { price, updatedAt: new Date().toISOString() };
      }
    } catch (err) {
      console.error(`[价格扫描] ${coin} 获取失败:`, err);
    }
  }
}

export function getLatestPrice(coin: string): number | null {
  const entry = latestPrices[coin.toUpperCase()];
  if (!entry) return null;
  // 如果价格超30分钟未更新，视为过期
  const age = Date.now() - new Date(entry.updatedAt).getTime();
  if (age > 30 * 60 * 1000) return null;;
  return entry.price;
}

export function getAllLatestPrices(): Record<string, { price: number; updatedAt: string }> {
  return { ...latestPrices };
}

export function startPriceScanner() {
  // 立即执行一次
  scanPrices().then(() => {
    console.log('[价格扫描] 首次扫描完成:', Object.entries(latestPrices).map(([k, v]) => `${k}=${v.price}`).join(', '));
  });
  // 每60秒扫描一次
  setInterval(() => {
    scanPrices().catch(err => console.error('[价格扫描] 定时扫描失败:', err));
  }, 60 * 1000);
  console.log('[价格扫描] 已启动，每60秒刷新 BTC/ETH/SOL 价格');
}
