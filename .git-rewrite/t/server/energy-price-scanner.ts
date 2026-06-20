/**
 * 能源价格定时扫描器
 * 每5分钟从 Stooq 获取 WTI原油/天然气 最新价格
 * 布伦特原油 = WTI + 固定价差 $2（Stooq 不提供布伦特期货数据）
 * 写入 energy_market_data 表（INSERT 新行，查询时取 MAX(id) 最新）
 */
import { getDbConnection } from './db';

interface PriceData {
  lastPrice: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
}

/**
 * 从 Stooq 获取期货价格（CSV格式）
 * 返回格式：Symbol,Date,Time,Open,High,Low,Close,Volume
 */
async function fetchStooqPrice(symbol: string): Promise<PriceData | null> {
  try {
    const url = `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/csv,*/*',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    // 解析CSV：Symbol,Date,Time,Open,High,Low,Close,Volume
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    const dataLine = lines[1].trim();
    const parts = dataLine.split(',');
    if (parts.length < 7) return null;
    // 检查是否有效数据（Stooq无数据时返回 N/D）
    if (parts[3] === 'N/D' || parts[6] === 'N/D') return null;
    const openPrice = parseFloat(parts[3]);
    const highPrice = parseFloat(parts[4]);
    const lowPrice = parseFloat(parts[5]);
    const lastPrice = parseFloat(parts[6]);
    if (isNaN(lastPrice) || lastPrice <= 0) return null;
    return { lastPrice, highPrice, lowPrice, openPrice };
  } catch (e) {
    console.warn(`[能源价格] Stooq 获取 ${symbol} 失败:`, (e as Error).message);
    return null;
  }
}

const SYMBOLS = [
  { symbol: 'CLUSDT', stooqTicker: 'cl.f', name: 'WTI原油' },
  { symbol: 'NATGASUSDT', stooqTicker: 'ng.f', name: '天然气' },
];

async function syncEnergyPrices() {
  const conn = await getDbConnection();
  if (!conn) {
    console.warn('[能源价格] 数据库连接失败，跳过本次同步');
    return;
  }
  const now = new Date();
  let successCount = 0;
  let wtiPrice: number | null = null;

  for (const { symbol, stooqTicker, name } of SYMBOLS) {
    const data = await fetchStooqPrice(stooqTicker);
    if (!data) {
      console.warn(`[能源价格] ${name}(${stooqTicker}) 获取失败，跳过`);
      continue;
    }
    if (symbol === 'CLUSDT') {
      wtiPrice = data.lastPrice;
    }
    const change = data.lastPrice - data.openPrice;
    const changePct = data.openPrice > 0 ? (change / data.openPrice) * 100 : 0;
    try {
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
          symbol, name,
          data.lastPrice.toFixed(4), data.lastPrice.toFixed(4), data.lastPrice.toFixed(4),
          change.toFixed(4), changePct.toFixed(4),
          data.highPrice.toFixed(4), data.lowPrice.toFixed(4),
          now,
        ]
      );
      successCount++;
      console.log(`[能源价格] ${name}: ${data.lastPrice.toFixed(3)} USD (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`);
    } catch (err: any) {
      console.error(`[能源价格] 写入 ${name} 失败:`, err.message);
    }
  }

  // 布伦特原油 = WTI + 2 USD（Stooq 不提供布伦特数据，用价差估算）
  if (wtiPrice !== null) {
    const brentPrice = wtiPrice + 2.0;
    const brentChange = 0;
    const brentChangePct = 0;
    try {
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
          'BZUSDT', '布伦特原油',
          brentPrice.toFixed(4), brentPrice.toFixed(4), brentPrice.toFixed(4),
          brentChange.toFixed(4), brentChangePct.toFixed(4),
          (brentPrice + 1).toFixed(4), (brentPrice - 1).toFixed(4),
          now,
        ]
      );
      successCount++;
      console.log(`[能源价格] 布伦特原油: ${brentPrice.toFixed(3)} USD (WTI+2估算)`);
    } catch (err: any) {
      console.error(`[能源价格] 写入布伦特原油失败:`, err.message);
    }
  }

  if (successCount > 0) {
    console.log(`[能源价格] 同步完成 ${successCount}/3 个品种 @ ${now.toISOString()}`);
  }
}

export function startEnergyPriceScanner() {
  console.log('[能源价格] 启动定时扫描器（Stooq数据源），每5分钟更新一次');
  // 启动时立即执行一次
  syncEnergyPrices().catch(e => console.error('[能源价格] 初始同步失败:', e.message));
  // 之后每5分钟执行一次
  setInterval(() => {
    syncEnergyPrices().catch(e => console.error('[能源价格] 定时同步失败:', e.message));
  }, 5 * 60 * 1000);
}
