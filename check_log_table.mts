import { getLedgerDb } from './server/db.ts';
import { sql } from 'drizzle-orm';
const db = await getLedgerDb();
if (!db) { console.log('NO_DB'); process.exit(0); }
const r = await db.execute(sql`SHOW TABLES LIKE 'eth_position_change_logs'`);
const rows = Array.isArray(r) ? r[0] : r;
console.log('TABLE_ROWS:', JSON.stringify(rows));

// 也尝试直接插入一条测试记录
try {
  await db.execute(sql`INSERT INTO eth_position_change_logs (ledger_id, price, change_type, old_value, new_value, note) VALUES (1, 2000, 'actual', 0, 1.5, 'test')`);
  console.log('INSERT_OK');
  await db.execute(sql`DELETE FROM eth_position_change_logs WHERE note = 'test'`);
  console.log('DELETE_OK');
} catch(e: any) {
  console.log('INSERT_ERROR:', e.message);
}
