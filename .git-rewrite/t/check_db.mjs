import { createConnection } from 'mysql2/promise';

const dbUrl = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";

const conn = await createConnection({
  uri: dbUrl,
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15000,
});

const [rows] = await conn.execute(
  `SELECT symbol, DATE_FORMAT(MAX(date), '%Y-%m-%d') as latest_date, COUNT(*) as total_rows
   FROM crypto_klines 
   WHERE symbol IN ('BTCUSDT','ETHUSDT','AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META')
   GROUP BY symbol
   ORDER BY symbol`
);

console.log('\n标的\t\t最新日期\t总行数');
console.log('─'.repeat(45));
for (const r of rows) {
  const sym = r.symbol.padEnd(10);
  console.log(`${sym}\t${r.latest_date}\t${r.total_rows}`);
}
await conn.end();
