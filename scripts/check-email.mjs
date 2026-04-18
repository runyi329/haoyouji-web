import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const dbUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DB URL'); process.exit(1); }

const parsedUrl = new URL(dbUrl.replace(/^mysql:\/\//, 'http://'));
const conn = await mysql.createConnection({
  host: parsedUrl.hostname,
  port: parseInt(parsedUrl.port) || 3306,
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database: parsedUrl.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
});

// 查询有email的用户
const [rows] = await conn.execute('SELECT id, name, email FROM users WHERE email IS NOT NULL AND email != "" LIMIT 10');
console.log('有邮箱的用户：', rows);

// 查询alert_state表是否存在
const [tables] = await conn.execute("SHOW TABLES LIKE 'funder_order_alert_state'");
console.log('alert_state表：', tables);

// 查询ctx.user.id的来源 - 看看ledger_members表的userId字段
const [members] = await conn.execute('SELECT userId, role FROM ledger_members LIMIT 5');
console.log('ledger_members示例：', members);

await conn.end();
