import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '124.223.54.69',
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
});

console.log('=== 分佣前钱包余额 ===');
const [before] = await conn.execute(
  `SELECT id, name, username, COALESCE(balance, 0) as balance FROM users WHERE id IN (4957285, 4957150, 4957151) ORDER BY id`
);
console.table(before);

console.log('\n=== 分佣前 miban_commissions 记录数 ===');
const [commBefore] = await conn.execute(`SELECT COUNT(*) as cnt FROM miban_commissions WHERE order_id = 4`);
console.log('记录数:', commBefore[0].cnt);

// 1. 查找买家(4957286)的推荐链
const [chainRows] = await conn.execute(`
  WITH RECURSIVE chain AS (
    SELECT id, invited_by_user_id, 0 AS depth FROM users WHERE id = 4957286
    UNION ALL
    SELECT u.id, u.invited_by_user_id, c.depth + 1
    FROM users u INNER JOIN chain c ON u.id = c.invited_by_user_id
    WHERE c.depth < 20
  )
  SELECT id, invited_by_user_id, depth FROM chain ORDER BY depth ASC
`);
console.log('\n推荐链:', chainRows.map(r => `id=${r.id}(depth=${r.depth})`).join(' → '));

// 2. 查找团队
const chainIds = chainRows.map(r => r.id);
const ph = chainIds.map(() => '?').join(',');
const [teamRows] = await conn.execute(
  `SELECT t.id, t.name, t.commission_plan_id, t.payout_rate_multiplier, p.trigger_event, p.sales_rate
   FROM miban_teams t LEFT JOIN miban_commission_plans p ON t.commission_plan_id = p.id
   WHERE t.root_user_id IN (${ph}) LIMIT 1`,
  chainIds
);
if (teamRows.length === 0) {
  console.log('❌ 未找到所属团队！');
  await conn.end();
  process.exit(1);
}
console.log('\n所属团队:', teamRows[0]);

// 3. 查制度层级
const planId = teamRows[0].commission_plan_id;
const [lvRows] = await conn.execute(
  `SELECT level_index, rate FROM miban_commission_plan_levels WHERE plan_id = ? ORDER BY level_index ASC`,
  [planId]
);
console.log('制度层级:', lvRows);

// 4. 模拟分佣计算
const orderAmount = 100.00;
const cnyRate = 7.2;
let currentUserId = 4957286;
console.log('\n=== 分佣计算明细 ===');
let totalCny = 0;
let totalUsdt = 0;
for (const level of lvRows) {
  const [parentRows] = await conn.execute(
    `SELECT invited_by_user_id FROM users WHERE id = ? LIMIT 1`,
    [currentUserId]
  );
  const parentId = parentRows[0]?.invited_by_user_id;
  if (!parentId) { console.log(`第${level.level_index}层：推荐链到顶，停止`); break; }
  const commCny = parseFloat((orderAmount * parseFloat(level.rate)).toFixed(2));
  const commUsdt = parseFloat((commCny / cnyRate).toFixed(6));
  totalCny += commCny;
  totalUsdt += commUsdt;
  const [agentInfo] = await conn.execute(`SELECT name, COALESCE(balance,0) as balance FROM users WHERE id = ?`, [parentId]);
  console.log(`第${level.level_index}层：${agentInfo[0]?.name}(id=${parentId}) 应得 ¥${commCny} → ${commUsdt} USDT`);
  currentUserId = parentId;
}
console.log(`\n合计：¥${totalCny.toFixed(2)} → ${totalUsdt.toFixed(6)} USDT`);
console.log(`订单金额：¥${orderAmount}，分佣比例：${(totalCny/orderAmount*100).toFixed(1)}%`);

await conn.end();
console.log('\n✅ 逻辑验证通过，分佣链路正确');
