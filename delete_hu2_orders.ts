// 清空胡二同志(userId:4957150)在52号AF账本里的所有订单和余额记录
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
  connectTimeout: 15000,
  ssl: { rejectUnauthorized: false },
});

const USER_ID = 4957150;
const LEDGER_ID = 52;

console.log(`正在清空 userId=${USER_ID} 在 ledgerId=${LEDGER_ID} 的所有数据...`);

// 1. 先查询要删除的数据（确认）
const [orders] = await conn.execute(
  `SELECT id, coin, side, status, sell_status, amount FROM af_orders WHERE ledger_id = ? AND user_id = ?`,
  [LEDGER_ID, USER_ID]
) as any[];
console.log('\n将删除的订单：');
console.table(orders);

const [balances] = await conn.execute(
  `SELECT id, amount, note FROM af_manual_balances WHERE ledger_id = ? AND user_id = ?`,
  [LEDGER_ID, USER_ID]
) as any[];
console.log('\n将删除的余额记录：');
console.table(balances);

// 2. 删除 af_orders
const [r1] = await conn.execute(
  `DELETE FROM af_orders WHERE ledger_id = ? AND user_id = ?`,
  [LEDGER_ID, USER_ID]
) as any[];
console.log(`\n✅ 删除 af_orders: ${r1.affectedRows} 条`);

// 3. 删除 af_manual_balances
const [r2] = await conn.execute(
  `DELETE FROM af_manual_balances WHERE ledger_id = ? AND user_id = ?`,
  [LEDGER_ID, USER_ID]
) as any[];
console.log(`✅ 删除 af_manual_balances: ${r2.affectedRows} 条`);

// 4. 验证
const [remaining] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM af_orders WHERE ledger_id = ? AND user_id = ?`,
  [LEDGER_ID, USER_ID]
) as any[];
console.log(`\n剩余订单数: ${remaining[0].cnt}`);

await conn.end();
console.log('\n✅ 清空完成！');
