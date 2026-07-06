const mysql = require('./node_modules/.pnpm/mysql2@3.15.1/node_modules/mysql2/promise');
mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db'
}).then(async conn => {
  const [rows] = await conn.query('SELECT id, ledger_id, asset_type, coin, amount, order_no FROM funder_orders WHERE id=2977');
  console.log(JSON.stringify(rows, null, 2));
  conn.end();
}).catch(e => console.error(e.message));
