import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
// 读取 .env 文件
const envContent = readFileSync('/home/ubuntu/haoyouji-web/.env', 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
}
const dbUrl = envVars['ORIGINAL_DATABASE_URL'] || envVars['DATABASE_URL'];
if (!dbUrl) {
  console.error('No database URL found');
  process.exit(1);
}
// 解析 URL
const url = new URL(dbUrl);
const isLocalhost = url.hostname.includes('localhost') || url.hostname.includes('127.0.0.1');
const config = {
  uri: dbUrl,
  connectTimeout: 30000,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
  charset: 'utf8mb4',
};
console.log('Connecting to:', url.hostname, url.port, url.pathname.slice(1));
const conn = await mysql.createConnection(config);
// 检查 visitDate 字段是否已存在
const [columns] = await conn.execute(`
  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'beauty_visit_logs' AND COLUMN_NAME = 'visitDate'
`);
if (columns.length > 0) {
  console.log('visitDate column already exists, skipping');
} else {
  await conn.execute(`
    ALTER TABLE beauty_visit_logs ADD COLUMN visitDate VARCHAR(20) NULL COMMENT '消费日期 YYYY-MM-DD'
  `);
  console.log('Added visitDate column to beauty_visit_logs');
}
await conn.end();
console.log('Migration complete!');
