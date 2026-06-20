/**
 * 黄金日K线每日增量更新脚本
 * 每天凌晨2点由 cron 自动执行，追加最新一天的数据
 * 
 * 用法：node scripts/update-gold-daily.mjs
 */

import mysql from 'mysql2/promise';
import https from 'https';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ DATABASE_URL 未设置'); process.exit(1); }

function parseDbUrl(url) {
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!m) throw new Error('无法解析 DATABASE_URL');
  return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4]), database: m[5].split('?')[0] };
}

async function fetchLatestFromSina() {
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const url = `https://stock.finance.sina.com.cn/futures/api/jsonp.php/var%20_XAU_240_${ts}=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=XAU&_=${ts}`;
    const options = {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
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
          // 只取最近7天的数据用于更新
          const recent = rawBars.slice(-7).filter(b => b.close && parseFloat(b.close) > 0).map(b => ({
            tradeDate: b.date,
            open: parseFloat(parseFloat(b.open).toFixed(4)),
            high: parseFloat(parseFloat(b.high).toFixed(4)),
            low: parseFloat(parseFloat(b.low).toFixed(4)),
            close: parseFloat(parseFloat(b.close).toFixed(4)),
            volume: parseInt(b.volume) || 0,
            source: 'SINA',
          }));
          resolve(recent);
        } catch (e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

async function main() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[${new Date().toISOString()}] 黄金日K线每日更新 - ${today}`);

  const conn = await mysql.createConnection({
    ...parseDbUrl(DB_URL),
    ssl: { rejectUnauthorized: false },
    connectTimeout: 15000,
  });

  try {
    const bars = await fetchLatestFromSina();
    if (bars.length === 0) {
      console.log('⚠️ 未获取到新数据（可能今天是非交易日）');
      return;
    }

    let newCount = 0;
    for (const b of bars) {
      const [result] = await conn.execute(
        `INSERT IGNORE INTO gold_daily_kline (trade_date, open, high, low, close, volume, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [b.tradeDate, b.open, b.high, b.low, b.close, b.volume, b.source]
      );
      if (result.affectedRows > 0) newCount++;
    }

    console.log(`✅ 更新完成：新增 ${newCount} 条，检查 ${bars.length} 条`);
    if (bars.length > 0) {
      console.log(`📊 最新数据：${bars[bars.length-1].tradeDate} 收盘价 $${bars[bars.length-1].close}`);
    }
  } finally {
    await conn.end();
  }
}

main().catch(e => {
  console.error('❌ 更新失败:', e.message);
  process.exit(1);
});
