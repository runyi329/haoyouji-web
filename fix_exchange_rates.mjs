import mysql from 'mysql2/promise';

// 当前实时汇率（从52号账本实时接口获取）
const CURRENT_RATE = 6.75;

const conn = await mysql.createConnection('mysql://root:Miao@20190603@124.223.54.69:3306/crm_db');

// 查出所有 exchange_rate 写死为 7.0 或 7.15 或 6.8 的记录（非精确实时汇率）
const [rows] = await conn.execute(
  `SELECT p.id, p.order_id, p.amount, p.currency, p.exchange_rate, p.pay_date, o.order_no
   FROM ledger_order_payments p
   LEFT JOIN ledger_orders o ON o.id = p.order_id
   WHERE p.currency = 'CNY' AND (p.exchange_rate = 7.0 OR p.exchange_rate = 7.15 OR p.exchange_rate = 6.8)
   ORDER BY p.id`
);

console.log(`找到 ${rows.length} 条需要修正的记录：`);
for (const r of rows) {
  console.log(`  id=${r.id} 订单=${r.order_no} 金额=${r.amount}元 旧汇率=${r.exchange_rate} 日期=${r.pay_date}`);
}

if (rows.length > 0) {
  const ids = rows.map(r => r.id);
  const [result] = await conn.execute(
    `UPDATE ledger_order_payments SET exchange_rate = ? WHERE id IN (${ids.join(',')}) AND currency = 'CNY'`,
    [CURRENT_RATE]
  );
  console.log(`\n已更新 ${result.affectedRows} 条记录，exchange_rate 统一改为 ${CURRENT_RATE}`);
}

// 验证
const [verify] = await conn.execute(
  `SELECT id, amount, currency, exchange_rate FROM ledger_order_payments WHERE currency = 'CNY' ORDER BY id`
);
console.log('\n所有 CNY 付款记录（验证）：');
for (const r of verify) {
  console.log(`  id=${r.id} ${r.amount}元 汇率=${r.exchange_rate}`);
}

await conn.end();
console.log('\n完成');
