import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// 读取 .env 文件
let dbUrl = '';
try {
  const envContent = readFileSync('/home/ubuntu/haoyouji-full/.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const m = line.match(/^([^=\s#]+)\s*=\s*(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'EXTERNAL_DATABASE_URL' || key === 'DATABASE_URL') {
        dbUrl = val;
      }
    }
  }
} catch(e) {
  console.error('读取 .env 失败:', e.message);
  process.exit(1);
}

if (!dbUrl) {
  console.error('未找到 DATABASE_URL');
  process.exit(1);
}

console.log('连接数据库...');
const conn = await mysql.createConnection(dbUrl);

console.log('\n=== af_funding_rate_settings (ledger_id=52) ===');
const [settings] = await conn.execute(
  'SELECT ledger_id, user_id, enabled, open_at, open_balance_snapshot, settled_hours, updated_at FROM af_funding_rate_settings WHERE ledger_id = 52'
);
console.log(JSON.stringify(settings, null, 2));

console.log('\n=== af_funding_rate_logs (ledger_id=52, 最新10条) ===');
const [logs] = await conn.execute(
  'SELECT id, ledger_id, user_id, balance_snapshot, amount, total_accumulated, created_at FROM af_funding_rate_logs WHERE ledger_id = 52 ORDER BY id DESC LIMIT 10'
);
console.log(JSON.stringify(logs, null, 2));

console.log('\n=== 52号账本的 owner/members ===');
const [members] = await conn.execute(
  'SELECT userId, role FROM ledger_members WHERE ledgerId = 52 LIMIT 10'
);
console.log(JSON.stringify(members, null, 2));

await conn.end();
