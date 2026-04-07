import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const CNY_RATE = 7.0;
const COINS = [
  { name: 'BTC', gateSymbol: 'BTC_USDT', huobiSymbol: 'btcusdt' },
  { name: 'ETH', gateSymbol: 'ETH_USDT', huobiSymbol: 'ethusdt' },
  { name: 'SOL', gateSymbol: 'SOL_USDT', huobiSymbol: 'solusdt' },
  { name: 'LDO', gateSymbol: 'LDO_USDT', huobiSymbol: 'ldousdt' },
];

async function fetchPrice(coin) {
  // Gate.io 主用
  try {
    const res = await fetch(
      `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${coin.gateSymbol}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].last) {
        const price = parseFloat(data[0].last);
        if (!isNaN(price) && price > 0) return price;
      }
    }
  } catch {}
  // 火币备用
  try {
    const res = await fetch(
      `https://api.huobi.pro/market/detail/merged?symbol=${coin.huobiSymbol}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const j = await res.json();
      if (j.status === 'ok' && j.tick?.close) {
        return j.tick.close;
      }
    }
  } catch {}
  throw new Error(`无法获取 ${coin.name} 价格`);
}

const dbUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL || process.env.EXTERNAL_DATABASE_URL;
if (!dbUrl) {
  console.error('No DATABASE_URL found in env');
  process.exit(1);
}

console.log('Connecting to DB...');
const conn = await mysql.createConnection({
  uri: dbUrl,
  ssl: { rejectUnauthorized: false },
});

// 先建表（如果不存在）
await conn.execute(`
  CREATE TABLE IF NOT EXISTS crypto_price_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    coin VARCHAR(20) NOT NULL,
    price_usdt DECIMAL(20, 8) NOT NULL,
    price_cny DECIMAL(20, 4) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY crypto_price_coin_uniq (coin)
  ) CHARACTER SET utf8mb4
`);
console.log('Table ready');

for (const coin of COINS) {
  try {
    const priceUsdt = await fetchPrice(coin);
    const priceCny = priceUsdt * CNY_RATE;
    await conn.execute(
      `INSERT INTO crypto_price_cache (coin, price_usdt, price_cny, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE price_usdt = VALUES(price_usdt), price_cny = VALUES(price_cny), updated_at = NOW()`,
      [coin.name, priceUsdt.toFixed(8), priceCny.toFixed(4)]
    );
    console.log(`✓ ${coin.name}: ${priceUsdt} USDT = ¥${priceCny.toFixed(2)}`);
  } catch (e) {
    console.error(`✗ ${coin.name}: ${e.message}`);
  }
}

await conn.end();
console.log('Done');
