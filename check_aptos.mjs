import mysql from 'mysql2/promise';

const DB_URL = 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';

// 解析 mysql URL
function parseDbUrl(url) {
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4]), database: m[5] };
}

async function main() {
  const cfg = parseDbUrl(DB_URL);
  const conn = await mysql.createConnection(cfg);

  // 1. 查询 APTOS 收款钱包地址
  console.log('=== APTOS 收款钱包地址 ===');
  const [wallets] = await conn.execute(
    `SELECT id, address, label, network, is_enabled FROM wallet_addresses WHERE network = 'APTOS' ORDER BY id`
  );
  console.log(JSON.stringify(wallets, null, 2));

  // 2. 查询最近的充值订单（包括2000u附近的）
  console.log('\n=== 最近充值订单（过去48小时）===');
  const [orders] = await conn.execute(
    `SELECT id, order_no, user_id, amount, network, status, ledger_id, txn_hash, created_at, expires_at 
     FROM recharge_orders 
     WHERE created_at > DATE_SUB(NOW(), INTERVAL 48 HOUR)
     ORDER BY created_at DESC
     LIMIT 20`
  );
  console.log(JSON.stringify(orders, null, 2));

  // 3. 查询金额在1990-2010之间的订单
  console.log('\n=== 金额在1990-2010之间的订单 ===');
  const [orders2] = await conn.execute(
    `SELECT id, order_no, user_id, amount, network, status, ledger_id, txn_hash, created_at, expires_at 
     FROM recharge_orders 
     WHERE CAST(amount AS DECIMAL(20,8)) BETWEEN 1990 AND 2010
     ORDER BY created_at DESC
     LIMIT 10`
  );
  console.log(JSON.stringify(orders2, null, 2));

  await conn.end();
}

main().catch(console.error);
