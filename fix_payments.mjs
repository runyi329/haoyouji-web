import mysql from 'mysql2/promise';
const conn = await mysql.createConnection('mysql://root:Miao@20190603@124.223.54.69:3306/crm_db');

// 三条需要修正的记录：currency 改为 CNY，exchange_rate 用实时汇率 6.75
const toFix = [20, 25, 26];

for (const id of toFix) {
  const [result] = await conn.execute(
    'UPDATE ledger_order_payments SET currency = ?, exchange_rate = ? WHERE id = ?',
    ['CNY', 6.75, id]
  );
  console.log(`id=${id} 修改结果: ${result.affectedRows} 行`);
}

// 验证
const [rows] = await conn.execute(
  `SELECT id, order_id, amount, currency, exchange_rate FROM ledger_order_payments WHERE id IN (20, 25, 26)`
);
for (const r of rows) {
  console.log(`验证 id=${r.id}: ${r.amount} ${r.currency} 汇率=${r.exchange_rate}`);
}

await conn.end();
console.log('完成');
