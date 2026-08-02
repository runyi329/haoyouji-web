import mysql from 'mysql2/promise';
const conn = await mysql.createConnection('mysql://root:Miao@20190603@124.223.54.69:3306/crm_db');

const orderNos = ['FX5305', 'FD4599', 'FQ6410'];
for (const no of orderNos) {
  const [rows] = await conn.execute(
    `SELECT o.id, o.order_no, o.coin, o.interest_base, o.interest_base_currency,
            o.interest_rate_annual, o.interest_start_date, o.interest_payment_type,
            u.username, u.name as nickname
     FROM ledger_orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.order_no = ?`,
    [no]
  );
  const r = rows[0];
  if (!r) { console.log(`${no}: 未找到`); continue; }
  console.log(`\n=== ${r.order_no} ===`);
  console.log(`用户: ${r.username} / ${r.nickname}`);
  console.log(`币种: ${r.coin}`);
  console.log(`计息基数: ${r.interest_base} ${r.interest_base_currency}`);
  console.log(`年利率: ${r.interest_rate_annual}%`);
  console.log(`起息日: ${r.interest_start_date}`);
  console.log(`付息方式: ${r.interest_payment_type}`);

  // 查该订单的付款记录
  const [payments] = await conn.execute(
    'SELECT id, amount, currency, exchange_rate, pay_date, note FROM ledger_order_payments WHERE order_id = ? ORDER BY id',
    [r.id]
  );
  for (const p of payments) {
    console.log(`  付款记录 id=${p.id}: ${p.amount} ${p.currency} (汇率${p.exchange_rate}) 日期=${p.pay_date} 备注=${p.note}`);
  }
}

await conn.end();
