import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// 读取 .env 文件
try {
  const envContent = readFileSync('/home/ubuntu/haoyouji-full/.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
} catch(e) {}

const dbUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
console.log('DB URL:', dbUrl ? dbUrl.replace(/\/\/.*:.*@/, '//***:***@') : 'NOT FOUND');

if (!dbUrl) process.exit(1);

const conn = await mysql.createConnection({ uri: dbUrl, ssl: { rejectUnauthorized: false } });
const [rows] = await conn.execute(
  `SELECT id, order_no, interest_base_currency, interest_base, interest_rate_annual, interest_start_date 
   FROM funder_asset_orders 
   WHERE order_no LIKE '%0720%' OR order_no LIKE '%720%'
   ORDER BY created_at DESC LIMIT 10`
);
console.log('0720 订单:', JSON.stringify(rows, null, 2));

// 也查一下所有 interest_base_currency 的可能值
const [vals] = await conn.execute(
  `SELECT DISTINCT interest_base_currency, COUNT(*) as cnt FROM funder_asset_orders GROUP BY interest_base_currency`
);
console.log('interest_base_currency 所有值:', JSON.stringify(vals, null, 2));

await conn.end();
