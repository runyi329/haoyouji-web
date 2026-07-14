import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 递归查YJH邀请树
const YJH_ID = 4957151;
const treeIds = new Set([YJH_ID]);
let queue = [YJH_ID];
while (queue.length > 0) {
  const batch = queue.splice(0, 100);
  const ph = batch.map(() => '?').join(',');
  const [cr] = await conn.execute(`SELECT id FROM users WHERE invited_by_user_id IN (${ph})`, batch);
  for (const c of cr) {
    if (!treeIds.has(c.id)) {
      treeIds.add(c.id);
      queue.push(c.id);
    }
  }
}
const ids = Array.from(treeIds);
console.log('树下用户数:', ids.length);
console.log('兰兰(4958087)在树里:', ids.includes(4958087));
console.log('英姐(4957289)在树里:', ids.includes(4957289));
console.log('佳洋(4957355)在树里:', ids.includes(4957355));

// 跑最新成交SQL
const ph2 = ids.map(() => '?').join(',');
const [rows] = await conn.execute(
  `SELECT o.id, o.coin, o.side, o.amount, COALESCE(o.confirmed_at, o.sell_confirmed_at, o.updated_at, o.created_at) as eventTime, u.name as userName 
   FROM af_orders o LEFT JOIN users u ON u.id = o.user_id 
   WHERE o.ledger_id=52 AND o.status='completed' AND o.is_gift=0 AND o.user_id IN (${ph2}) 
   ORDER BY COALESCE(o.confirmed_at, o.sell_confirmed_at, o.updated_at, o.created_at) DESC LIMIT 10`,
  ids
);
console.log('最新成交结果数:', rows.length);
rows.forEach(r => console.log(' -', r.id, r.userName, r.coin, r.side, r.amount, String(r.eventTime)));

await conn.end();
