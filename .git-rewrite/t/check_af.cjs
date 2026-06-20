const mysql = require('./node_modules/mysql2/promise');
const dbUrl = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) { console.log('No DB URL in env'); process.exit(1); }
(async () => {
  const conn = await mysql.createConnection({ uri: dbUrl, ssl: { rejectUnauthorized: false } });
  const [s] = await conn.execute('SELECT ledger_id, user_id, enabled, open_at, settled_hours FROM af_funding_rate_settings WHERE ledger_id = 52');
  console.log('=== settings ===');
  console.log(JSON.stringify(s, null, 2));
  const [l] = await conn.execute('SELECT id, user_id, amount, total_accumulated, created_at FROM af_funding_rate_logs WHERE ledger_id = 52 ORDER BY id DESC LIMIT 5');
  console.log('=== logs (latest 5) ===');
  console.log(JSON.stringify(l, null, 2));
  const [m] = await conn.execute('SELECT userId, role FROM ledger_members WHERE ledgerId = 52 LIMIT 5');
  console.log('=== members ===');
  console.log(JSON.stringify(m, null, 2));
  await conn.end();
})().catch(e => console.error(e.message));
