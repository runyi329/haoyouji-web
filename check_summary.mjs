import mysql from 'mysql2/promise';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const conn = await mysql.createConnection(dbUrl);

const ledgerId = 37;
const tagName = '150山郎4468长江';

// 1. 查ledger_members（用正确字段名）
const [balancesRows] = await conn.execute(
  'SELECT userId, initial_balances FROM ledger_members WHERE ledgerId = ?',
  [ledgerId]
);
console.log('ledger_members rows:', balancesRows.length);

// 2. 查ledger_records（模拟接口SQL）
const [latestBalanceRows] = await conn.execute(
  `SELECT lr.amount, lr.recordDate
   FROM ledger_records lr
   INNER JOIN ledger_categories lc ON lc.id = lr.categoryId
   WHERE lr.ledgerId = ?
     AND lc.name = ?
     AND lr.type != 'transfer'
     AND lr.deleted_at IS NULL
   ORDER BY lr.recordDate DESC
   LIMIT 1`,
  [ledgerId, tagName]
);
console.log('latestBalance rows:', latestBalanceRows.length);
if (latestBalanceRows.length > 0) {
  const row = latestBalanceRows[0];
  console.log('latestBalance:', JSON.stringify(row));
  const recordDate = typeof row.recordDate === 'string'
    ? row.recordDate.slice(0, 10)
    : new Date(row.recordDate).toISOString().slice(0, 10);
  console.log('formatted recordDate:', recordDate);
  console.log('返回结果:', JSON.stringify({ balance: row.amount, recordDate }));
}

await conn.end();
