import mysql from 'mysql2/promise';
const conn = await mysql.createConnection('mysql://root:Miao@20190603@124.223.54.69:3306/crm_db');
const [rows] = await conn.execute(
  'SELECT p.id, p.order_id, p.amount, p.currency, p.exchange_rate, p.pay_date, o.order_no, o.interest_base_currency FROM ledger_order_payments p LEFT JOIN ledger_orders o ON o.id = p.order_id ORDER BY p.id'
);
for (const r of rows) {
  console.log(`id=${r.id} order=${r.order_no} amount=${r.amount} currency=${r.currency} rate=${r.exchange_rate} base_cur=${r.interest_base_currency} date=${r.pay_date}`);
}
await conn.end();
