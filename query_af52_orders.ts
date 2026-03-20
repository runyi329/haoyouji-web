// 临时查询脚本：查询胡二在AF账本(#52)的订单记录
import mysql from 'mysql2/promise';

const TENCENT_DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";

async function main() {
  console.log('正在连接腾讯云数据库...');
  const conn = await mysql.createConnection({
    host: '124.223.54.69',
    port: 3306,
    user: 'root',
    password: 'Miao@20190603',
    database: 'crm_db',
    connectTimeout: 15000,
    ssl: { rejectUnauthorized: false },
  });
  
  console.log('连接成功！');

  // 查看账本52的成员列表
  const [members] = await conn.execute(
    `SELECT lm.userId, lm.role, u.name FROM ledger_members lm 
     JOIN users u ON u.id = lm.userId 
     WHERE lm.ledgerId = 52 ORDER BY lm.role`
  ) as any[];
  console.log('\n=== 账本52成员列表 ===');
  console.table(members);

  // 查询账本52的所有af_orders
  const [orders] = await conn.execute(
    `SELECT o.id, o.user_id, u.name as user_name, o.coin, o.side, o.status, o.sell_status, 
            o.limit_price, o.amount, o.quantity, o.sell_price, o.created_at
     FROM af_orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.ledger_id = 52
     ORDER BY o.created_at DESC
     LIMIT 50`
  ) as any[];
  console.log('\n=== 账本52所有订单（最近50条）===');
  console.table(orders);

  await conn.end();
}

main().catch(e => {
  console.error('查询失败:', e.message);
  process.exit(1);
});
