import { createConnection } from 'mysql2/promise';
const url = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('No DB URL'); process.exit(1); }
console.log('Using DB:', url.replace(/\/\/.*:.*@/, '//***:***@'));
const conn = await createConnection({ uri: url, ssl: { rejectUnauthorized: false } });

// 查看 settings 表所有记录
const [settings] = await conn.execute('SELECT * FROM af_funding_rate_settings LIMIT 20');
console.log('af_funding_rate_settings rows:', JSON.stringify(settings, null, 2));

// 查看 logs 表记录数
const [logCount] = await conn.execute('SELECT COUNT(*) as cnt FROM af_funding_rate_logs');
console.log('af_funding_rate_logs count:', JSON.stringify(logCount));

await conn.end();
