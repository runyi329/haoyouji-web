/**
 * 能源价格定时扫描器
 * 每5分钟从 Yahoo Finance 获取 WTI原油/布伦特原油/天然气 最新价格
 * 写入 energy_market_data 表（UPSERT：每个 symbol 只保留最新一条）
 */
import { getDbConnection } from './db';

const SYMBOLS = [
  { symbol: 'CLUSDT', yahooTicker: 'CL=F', name: 'WTI原油' },
  { symbol: 'BZUSDT', yahooTicker: 'BZ=F', name: '布伦特原油' },
  { symbol: 'NATGASUSDT', yahooTicker: 'NG=F', name: '天然气' },
];

async function fetchYahooPrice(ticker: string): Promise<{
  lastPrice: number;
  highPrice: number;
  lowPrice: number;
  prevClose: number;
  change: number;
  changePct: number;
} | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const lastPrice = meta.regularMarketPrice ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? lastPrice;
    const highPrice = meta.regularMarketDayHigh ?? lastPrice;
    const lowPrice = meta.regularMarketDayLow ?? lastPrice;
    const change = lastPrice - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return { lastPrice, highPrice, lowPrice, prevClose, change, changePct };
  } catch (e) {
    console.warn(`[能源价格] 获取 ${ticker} 失败:`, (e as Error).message);
    return null;
  }
}

async function syncEnergyPrices() {
  const conn = await getDbConnection();
  if (!conn) {
    console.warn('[能源价格] 数据库连接失败，跳过本次同步');
    return;
  }
  const now = new Date();
  let successCount = 0;
  for (const { symbol, yahooTicker, name } of SYMBOLS) {
    const data = await fetchYahooPrice(yahooTicker);
    if (!data) {
      console.warn(`[能源价格] ${name}(${yahooTicker}) 获取失败，跳过`);
      continue;
    }
    try {
      // 用 INSERT ... ON DUPLICATE KEY UPDATE 或先删旧记录再插入
      // 为保持与现有查询兼容（MAX(id)取最新），直接 INSERT 新行
      await (conn as any).execute(
        `INSERT INTO energy_market_data
          (symbol, symbol_name, last_price, mark_price, index_price,
           price_change, price_change_percent,
           high_price, low_price,
           volume, quote_volume,
           funding_rate, next_funding_time,
           open_interest, open_interest_value, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 0, 0, ?)`,
        [
          symbol,
          name,
          data.lastPrice.toFixed(4),
          data.lastPrice.toFixed(4),
          data.lastPrice.toFixed(4),
          data.change.toFixed(4),
          data.changePct.toFixed(4),
          data.highPrice.toFixed(4),
          data.lowPrice.toFixed(4),
          now,
        ]
      );
      successCount++;
      console.log(`[能源价格] ${name}: ${data.lastPrice.toFixed(3)} USD (${data.changePct >= 0 ? '+' : ''}${data.changePct.toFixed(2)}%)`);
    } catch (err: any) {
      console.error(`[能源价格] 写入 ${name} 失败:`, err.message);
    }
  }
  if (successCount > 0) {
    console.log(`[能源价格] 同步完成 ${successCount}/${SYMBOLS.length} 个品种 @ ${now.toISOString()}`);
  }
}

export function startEnergyPriceScanner() {
  console.log('[能源价格] 启动定时扫描器，每5分钟更新一次');
  // 启动时立即执行一次
  syncEnergyPrices().catch(e => console.error('[能源价格] 初始同步失败:', e.message));
  // 之后每5分钟执行一次
  setInterval(() => {
    syncEnergyPrices().catch(e => console.error('[能源价格] 定时同步失败:', e.message));
  }, 5 * 60 * 1000);
}
