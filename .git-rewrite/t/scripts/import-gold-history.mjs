/**
 * 黄金历史日K线数据全量导入脚本
 * 数据来源：Yahoo Finance (GC=F 黄金期货，覆盖1975年至今) + 新浪财经(2006年至今)
 * 标注来源：美联储伦敦金定盘价（LBMA Gold Price）
 * 
 * 用法：node scripts/import-gold-history.mjs
 */

import mysql from 'mysql2/promise';
import https from 'https';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ DATABASE_URL 未设置');
  process.exit(1);
}

// 解析 MySQL URL
function parseDbUrl(url) {
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!m) throw new Error('无法解析 DATABASE_URL');
  return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4]), database: m[5].split('?')[0] };
}

// 从 Yahoo Finance 拉取黄金历史数据（GC=F 期货，1975年至今）
async function fetchYahooGoldData() {
  return new Promise((resolve, reject) => {
    // period1 = 1975-01-01 Unix时间戳
    const period1 = Math.floor(new Date('1975-01-01').getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false`;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 30000,
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart?.result?.[0];
          if (!result) {
            reject(new Error('Yahoo Finance 返回数据格式异常'));
            return;
          }
          const timestamps = result.timestamp || [];
          const quotes = result.indicators?.quote?.[0] || {};
          const bars = [];
          for (let i = 0; i < timestamps.length; i++) {
            const open = quotes.open?.[i];
            const high = quotes.high?.[i];
            const low = quotes.low?.[i];
            const close = quotes.close?.[i];
            const volume = quotes.volume?.[i] || 0;
            if (!close || close <= 0) continue;
            const date = new Date(timestamps[i] * 1000);
            const tradeDate = date.toISOString().split('T')[0];
            bars.push({
              tradeDate,
              open: open ? parseFloat(open.toFixed(4)) : parseFloat(close.toFixed(4)),
              high: high ? parseFloat(high.toFixed(4)) : parseFloat(close.toFixed(4)),
              low: low ? parseFloat(low.toFixed(4)) : parseFloat(close.toFixed(4)),
              close: parseFloat(close.toFixed(4)),
              volume: volume || 0,
              source: 'YAHOO',
            });
          }
          resolve(bars);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Yahoo Finance 请求超时')));
  });
}

// 从新浪财经拉取数据（2006年至今，作为补充/更新）
async function fetchSinaGoldData() {
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const url = `https://stock.finance.sina.com.cn/futures/api/jsonp.php/var%20_XAU_240_${ts}=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=XAU&_=${ts}`;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn/',
      },
      timeout: 20000,
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const m = data.match(/\(\[(.+)\]\)/s);
          if (!m) { resolve([]); return; }
          const rawBars = JSON.parse(`[${m[1]}]`);
          const bars = rawBars
            .filter(b => b.close && parseFloat(b.close) > 0)
            .map(b => ({
              tradeDate: b.date,
              open: parseFloat(parseFloat(b.open).toFixed(4)),
              high: parseFloat(parseFloat(b.high).toFixed(4)),
              low: parseFloat(parseFloat(b.low).toFixed(4)),
              close: parseFloat(parseFloat(b.close).toFixed(4)),
              volume: parseInt(b.volume) || 0,
              source: 'SINA',
            }));
          resolve(bars);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

async function main() {
  console.log('🚀 开始导入黄金历史日K线数据...');
  
  const dbConfig = parseDbUrl(DB_URL);
  const conn = await mysql.createConnection({
    ...dbConfig,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 30000,
  });

  try {
    // 确保表存在
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS gold_daily_kline (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trade_date VARCHAR(10) NOT NULL,
        open DECIMAL(10,4),
        high DECIMAL(10,4),
        low DECIMAL(10,4),
        close DECIMAL(10,4) NOT NULL,
        volume BIGINT DEFAULT 0,
        source VARCHAR(20) DEFAULT 'YAHOO',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY gold_date_uniq (trade_date),
        KEY gold_date_idx (trade_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ 数据表已就绪');

    // 拉取数据
    console.log('📡 正在从 Yahoo Finance 拉取黄金历史数据（1975年至今）...');
    let bars = [];
    try {
      bars = await fetchYahooGoldData();
      console.log(`✅ Yahoo Finance 返回 ${bars.length} 条数据`);
    } catch (e) {
      console.warn(`⚠️ Yahoo Finance 失败: ${e.message}，尝试新浪财经...`);
    }

    // 如果Yahoo失败或数据不足，用新浪财经补充
    console.log('📡 正在从新浪财经拉取数据（2006年至今，用于补充/更新最新数据）...');
    try {
      const sinaBars = await fetchSinaGoldData();
      console.log(`✅ 新浪财经返回 ${sinaBars.length} 条数据`);
      
      if (bars.length === 0) {
        bars = sinaBars;
      } else {
        // 用新浪数据更新/补充最近的数据（新浪数据更准确）
        const sinaMap = new Map(sinaBars.map(b => [b.tradeDate, b]));
        bars = bars.map(b => sinaMap.has(b.tradeDate) ? { ...sinaMap.get(b.tradeDate) } : b);
        // 追加新浪有但Yahoo没有的最新数据
        const yahooMap = new Set(bars.map(b => b.tradeDate));
        for (const b of sinaBars) {
          if (!yahooMap.has(b.tradeDate)) bars.push(b);
        }
        bars.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
      }
    } catch (e) {
      console.warn(`⚠️ 新浪财经失败: ${e.message}`);
    }

    if (bars.length === 0) {
      console.error('❌ 未能获取任何数据');
      process.exit(1);
    }

    console.log(`📊 合并后共 ${bars.length} 条数据，日期范围: ${bars[0].tradeDate} ~ ${bars[bars.length-1].tradeDate}`);

    // 批量写入（INSERT IGNORE 避免重复）
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < bars.length; i += BATCH) {
      const batch = bars.slice(i, i + BATCH);
      const values = batch.map(b => [b.tradeDate, b.open, b.high, b.low, b.close, b.volume, b.source]);
      await conn.query(
        `INSERT IGNORE INTO gold_daily_kline (trade_date, open, high, low, close, volume, source) VALUES ?`,
        [values]
      );
      inserted += batch.length;
      process.stdout.write(`\r⏳ 已处理 ${inserted}/${bars.length} 条...`);
    }
    
    console.log(`\n✅ 导入完成！共写入 ${bars.length} 条黄金历史日K线数据`);
    
    // 验证
    const [rows] = await conn.execute('SELECT COUNT(*) as cnt, MIN(trade_date) as min_date, MAX(trade_date) as max_date FROM gold_daily_kline');
    console.log(`📈 数据库验证: ${rows[0].cnt} 条，${rows[0].min_date} ~ ${rows[0].max_date}`);

  } finally {
    await conn.end();
  }
}

main().catch(e => {
  console.error('❌ 导入失败:', e.message);
  process.exit(1);
});
