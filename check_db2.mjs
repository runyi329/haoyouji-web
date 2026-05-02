import { createConnection } from 'mysql2/promise';

const conn = await createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
  ssl: false,
  connectTimeout: 15000,
});

console.log('✅ 连接成功！\n');

const [rows] = await conn.execute(
  `SELECT symbol, DATE_FORMAT(MAX(date), '%Y-%m-%d') as latest_date, COUNT(*) as total_rows
   FROM crypto_klines 
   WHERE symbol IN ('BTCUSDT','ETHUSDT','AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META')
   GROUP BY symbol
   ORDER BY symbol`
);

console.log('标的\t\t\t最新日期\t总行数');
console.log('─'.repeat(50));
for (const r of rows) {
  const sym = String(r.symbol).padEnd(12);
  console.log(`${sym}\t${r.latest_date}\t${r.total_rows}`);
}

await conn.end();
