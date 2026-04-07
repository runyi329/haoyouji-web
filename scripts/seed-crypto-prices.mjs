import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const CNY_RATE = 7.0;
const COINS = [
  { name: 'BTC', symbol: 'BTC-USDT' },
  { name: 'ETH', symbol: 'ETH-USDT' },
  { name: 'SOL', symbol: 'SOL-USDT' },
  { name: 'LDO', symbol: 'LDO-USDT' },
];

async function fetchPrice(symbol) {
  const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}`);
  const j = await res.json();
  const last = j?.data?.[0]?.last;
  if (last) return parseFloat(last);
  throw new Error(`No price for ${symbol}`);
}

const dbUrl = process.env.DATABASE_URL || process.env.EXTERNAL_DATABASE_URL;
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
    const priceUsdt = await fetchPrice(coin.symbol);
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
