const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/home/ubuntu/haoyouji-web/.env' });

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // 第一步：递归查YJH邀请树
  const YJH_ID = 4957151;
  const treeIds = new Set([YJH_ID]);
  let queue = [YJH_ID];
  let round = 0;
  while (queue.length > 0) {
    round++;
    const batch = queue.splice(0, 100);
    const ph = batch.map(() => '?').join(',');
    const [childRows] = await conn.execute(`SELECT id FROM users WHERE invited_by_user_id IN (${ph})`, batch);
    for (const c of childRows) {
      if (!treeIds.has(c.id)) { treeIds.add(c.id); queue.push(c.id); }
    }
  }
  console.log('Tree size:', treeIds.size, '| 含兰兰(4958087):', treeIds.has(4958087));
  
  // 第二步：查最新成交
  const ids = Array.from(treeIds);
  const ph2 = ids.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT o.id, o.coin, o.side, o.status, o.is_gift, o.amount, o.user_id,
            COALESCE(o.confirmed_at, o.sell_confirmed_at, o.updated_at, o.created_at) as eventTime,
            u.name as userName
     FROM af_orders o LEFT JOIN users u ON u.id = o.user_id
     WHERE o.ledger_id=52 AND o.status='completed' AND o.is_gift=0 AND o.user_id IN (${ph2})
     ORDER BY COALESCE(o.confirmed_at, o.sell_confirmed_at, o.updated_at, o.created_at) DESC LIMIT 10`,
    [52, ...ids]
  );
  console.log('Results:', JSON.stringify(rows, null, 2));
  
  // 第三步：单独查兰兰的订单
  const [lanRows] = await conn.execute(
    `SELECT id, coin, side, status, is_gift, amount, created_at, confirmed_at, sell_confirmed_at FROM af_orders WHERE user_id=4958087 AND ledger_id=52 ORDER BY created_at DESC LIMIT 5`
  );
  console.log('兰兰订单:', JSON.stringify(lanRows, null, 2));
  
  await conn.end();
}
main().catch(console.error);
