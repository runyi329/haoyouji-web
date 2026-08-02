import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute(`
  SELECT o.id, o.order_no, o.user_id, o.asset_type, o.option_info, o.amount,
         u.name as user_name
  FROM ledger_orders o
  LEFT JOIN users u ON o.user_id = u.id
  WHERE (o.order_no LIKE '%5835%' OR u.name LIKE '%张文佳%')
    AND o.asset_type = 'crypto_option'
  LIMIT 10
`);
console.log(JSON.stringify(rows, null, 2));

// 也查一下 deribit_cache 里有没有这张订单的缓存
if (rows.length > 0) {
  const optInfo = typeof rows[0].option_info === 'string' ? JSON.parse(rows[0].option_info) : rows[0].option_info;
  console.log('\noption_info:', JSON.stringify(optInfo, null, 2));
  
  if (optInfo?.instrument) {
    const [cache] = await conn.execute(`SELECT * FROM deribit_cache WHERE instrument = ?`, [optInfo.instrument]);
    console.log('\nderibit_cache:', JSON.stringify(cache, null, 2));
  }
}

await conn.end();
