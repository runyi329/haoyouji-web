import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
});

// 查订单基本信息
const [rows] = await conn.execute(
  `SELECT o.*, u.username, u.name as user_name
   FROM ledger_orders o
   LEFT JOIN users u ON u.id = o.user_id
   WHERE o.ledger_id = 52
   ORDER BY o.created_at DESC
   LIMIT 200`
);

// 找 FL6148
const order = rows.find(r => {
  const d = new Date(r.created_at);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd2 = String(d.getDate()).padStart(2,'0');
  const no = `FL${yy}${mm}${dd2}${String(r.id).padStart(4,'0')}`;
  return no === 'FL6148';
});

if (order) {
  console.log('=== FL6148 订单详情 ===');
  console.log(JSON.stringify(order, null, 2));
} else {
  console.log('未找到 FL6148，列出所有期权订单：');
  const opts = rows.filter(r => r.asset_type === 'crypto_option');
  opts.forEach(r => {
    const d = new Date(r.created_at);
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd2 = String(d.getDate()).padStart(2,'0');
    const no = `FL${yy}${mm}${dd2}${String(r.id).padStart(4,'0')}`;
    console.log(no, r.id, r.coin, r.option_info, r.user_id);
  });
}

await conn.end();
