import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl) { console.log('ERROR: DATABASE_URL not set'); process.exit(1); }

const parsedUrl = new URL(dbUrl.replace(/^mysql:\/\//, 'http://'));
console.log('Connecting to:', parsedUrl.hostname, 'db:', parsedUrl.pathname.slice(1));

const conn = await mysql.createConnection({
  host: parsedUrl.hostname,
  port: parseInt(parsedUrl.port) || 3306,
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database: parsedUrl.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

try {
  await conn.execute(`ALTER TABLE finance_interest_orders ADD COLUMN IF NOT EXISTS collateral_assets TEXT DEFAULT NULL`);
  console.log('OK: collateral_assets 字段已添加（或已存在）');
  
  // 验证字段是否存在
  const [rows] = await conn.execute(`SHOW COLUMNS FROM finance_interest_orders LIKE 'collateral_assets'`);
  console.log('字段验证:', rows.length > 0 ? '存在 ✓' : '不存在 ✗');
} catch(e) {
  console.log('ERROR:', e.message);
}

await conn.end();
