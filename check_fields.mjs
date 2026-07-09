import mysql from 'mysql2/promise';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const conn = await mysql.createConnection(dbUrl);

const [cols] = await conn.execute('DESCRIBE ledger_members');
console.log('ledger_members字段:');
cols.forEach(c => console.log(' ', c.Field));

// 也直接查一下37号账本的members
const [rows] = await conn.execute('SELECT * FROM ledger_members WHERE ledger_id = 37 LIMIT 3');
console.log('\n37号账本members(ledger_id=37):', rows.length);
if (rows.length === 0) {
  const [rows2] = await conn.execute('SELECT * FROM ledger_members WHERE ledgerId = 37 LIMIT 3');
  console.log('37号账本members(ledgerId=37):', rows2.length);
  if (rows2.length > 0) console.log('sample:', JSON.stringify(rows2[0]).slice(0, 200));
} else {
  console.log('sample:', JSON.stringify(rows[0]).slice(0, 200));
}

await conn.end();
