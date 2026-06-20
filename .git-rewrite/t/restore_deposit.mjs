import mysql from 'mysql2/promise';

const url = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const conn = await mysql.createConnection({ 
  uri: url, 
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15000
});

// 先查张慧当前的 initial_balances
const [rows] = await conn.execute(
  `SELECT initial_balances FROM ledger_members WHERE ledgerId = 37 AND userId = 4680302 LIMIT 1`
);

if (rows.length === 0) {
  console.log('未找到张慧的记录！');
  await conn.end();
  process.exit(1);
}

const current = rows[0].initial_balances ? JSON.parse(rows[0].initial_balances) : {};
console.log('当前保证金：', JSON.stringify(current, null, 2));

// 加回 LQY 标签的 20000 人民币
current['LQY__margin'] = 20000;
current['LQY__marginCoin'] = '人民币';

console.log('\n恢复后保证金：', JSON.stringify(current, null, 2));

// 写回数据库
await conn.execute(
  `UPDATE ledger_members SET initial_balances = ?, updatedAt = NOW() WHERE ledgerId = 37 AND userId = 4680302`,
  [JSON.stringify(current)]
);

console.log('\n✅ 已成功恢复张慧 LQY 标签 20000 元人民币保证金');

await conn.end();
