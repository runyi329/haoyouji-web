import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const dbUrl = process.env.EXTERNAL_DATABASE_URL;
if (!dbUrl) { console.error('找不到 EXTERNAL_DATABASE_URL'); process.exit(1); }

const conn = await createConnection(dbUrl);
const [rows] = await conn.execute(
  `SELECT symbol, DATE_FORMAT(MAX(date), '%Y-%m-%d') as latest_date, COUNT(*) as total_rows
   FROM crypto_klines 
   WHERE symbol IN ('BTCUSDT','ETHUSDT','AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META')
   GROUP BY symbol
   ORDER BY symbol`
);
console.log('标的\t\t最新日期\t总行数');
console.log('─'.repeat(50));
for (const r of rows) {
  console.log(`${r.symbol}\t\t${r.latest_date}\t${r.total_rows}`);
}
await conn.end();
