import mysql from 'mysql2/promise';

// 直接测试分佣逻辑（不通过HTTP API）
const conn = await mysql.createConnection({
  host: '124.223.54.69',
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
});

const orderId = 4;
const orderNo = 'TEST20260719001';
const buyerUserId = 4957286;
const orderAmount = 100.00;

console.log('=== 开始分佣引擎测试 ===');
console.log(`订单: ${orderNo}, 买家: ${buyerUserId}, 金额: ¥${orderAmount}`);

// 1. 幂等检查
const [existRows] = await conn.execute('SELECT id FROM miban_commissions WHERE order_id = ? LIMIT 1', [orderId]);
if (existRows.length > 0) {
  console.log('⚠️ 已有佣金记录，先清除...');
  await conn.execute('DELETE FROM miban_commissions WHERE order_id = ?', [orderId]);
}

// 2. 查推荐链
const [chainRows] = await conn.execute(`
  WITH RECURSIVE chain AS (
    SELECT id, invited_by_user_id, 0 AS depth FROM users WHERE id = ?
    UNION ALL
    SELECT u.id, u.invited_by_user_id, c.depth + 1
    FROM users u INNER JOIN chain c ON u.id = c.invited_by_user_id
    WHERE c.depth < 20
  )
  SELECT id FROM chain ORDER BY depth ASC
`, [buyerUserId]);
const chainIds = chainRows.map(r => r.id);
console.log('推荐链IDs:', chainIds);

// 3. 查团队
const ph = chainIds.map(() => '?').join(',');
const [teamRows] = await conn.execute(
  `SELECT id, commission_plan_id, COALESCE(payout_rate_multiplier, 1.0) AS multiplier FROM miban_teams WHERE root_user_id IN (${ph}) LIMIT 1`,
  chainIds
);
if (!teamRows.length) { console.log('❌ 未找到团队'); process.exit(1); }
const team = teamRows[0];
console.log('团队:', team);

// 4. 查制度层级
const [lvRows] = await conn.execute(
  'SELECT level_index, rate FROM miban_commission_plan_levels WHERE plan_id = ? ORDER BY level_index ASC',
  [team.commission_plan_id]
);
console.log('制度层级:', lvRows);

// 5. 查汇率
const [rateRows] = await conn.execute('SELECT usdtCnyRateAtOrder FROM miban_orders WHERE id = ? LIMIT 1', [orderId]);
const cnyRate = parseFloat(rateRows[0]?.usdtCnyRateAtOrder ?? '7.2') || 7.2;
console.log('汇率:', cnyRate);

// 6. 逐层发放
let currentUserId = buyerUserId;
const teamMultiplier = parseFloat(team.multiplier ?? '1');
let totalCommCny = 0;
let totalCommUsdt = 0;

for (const level of lvRows) {
  const [parentRows] = await conn.execute('SELECT invited_by_user_id FROM users WHERE id = ? LIMIT 1', [currentUserId]);
  const parentId = parentRows[0]?.invited_by_user_id;
  if (!parentId) { console.log(`第${level.level_index}层：推荐链到顶`); break; }

  const commCny = parseFloat((orderAmount * parseFloat(level.rate) * teamMultiplier).toFixed(2));
  const commUsdt = parseFloat((commCny / cnyRate).toFixed(6));
  totalCommCny += commCny;
  totalCommUsdt += commUsdt;

  // 写入佣金记录
  await conn.execute(
    `INSERT INTO miban_commissions (agent_id, order_id, order_no, buyer_id, buyer_user_id, order_amount, commission_rate, commission_amount, status, team_id, level_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [parentId, orderId, orderNo, buyerUserId, buyerUserId, orderAmount.toFixed(2), (parseFloat(level.rate)*teamMultiplier).toFixed(4), commCny.toFixed(2), team.id, level.level_index]
  );

  // 打入钱包
  await conn.execute('UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?', [commUsdt, parentId]);
  const [newBalRows] = await conn.execute('SELECT balance FROM users WHERE id = ?', [parentId]);
  const newBal = parseFloat(newBalRows[0]?.balance ?? '0');

  // 写balance_history
  await conn.execute(
    `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description) VALUES (?, ?, 'commission', ?, ?, ?)`,
    [parentId, commUsdt.toString(), orderId, newBal.toString(), `米伴佣金 第${level.level_index}层 订单#${orderNo} +${commUsdt.toFixed(4)} USDT (¥${commCny.toFixed(2)})`]
  );

  // 更新佣金状态为settled
  await conn.execute(
    `UPDATE miban_commissions SET status = 'settled' WHERE order_id = ? AND agent_id = ? AND level_index = ?`,
    [orderId, parentId, level.level_index]
  );

  const [agentInfo] = await conn.execute('SELECT name FROM users WHERE id = ?', [parentId]);
  console.log(`✅ 第${level.level_index}层 ${agentInfo[0]?.name}(${parentId}) +${commUsdt.toFixed(6)} USDT (¥${commCny.toFixed(2)}), 新余额: ${newBal.toFixed(6)}`);
  currentUserId = parentId;
}

console.log(`\n=== 分佣完成 ===`);
console.log(`总计: ¥${totalCommCny.toFixed(2)} → ${totalCommUsdt.toFixed(6)} USDT`);

// 验证结果
console.log('\n=== 验证结果 ===');
const [commRows] = await conn.execute('SELECT agent_id, level_index, commission_amount, status FROM miban_commissions WHERE order_id = ? ORDER BY level_index', [orderId]);
console.log('佣金记录:', commRows);

const [balRows] = await conn.execute('SELECT id, name, COALESCE(balance,0) as balance FROM users WHERE id IN (4957285, 4957150, 4957151) ORDER BY id');
console.log('钱包余额:', balRows);

const [histRows] = await conn.execute('SELECT user_id, amount, type, description FROM balance_history WHERE related_id = ? AND type = "commission" ORDER BY user_id', [orderId]);
console.log('余额历史:', histRows);

await conn.end();
console.log('\n✅ 端到端测试完成！');
