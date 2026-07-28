import mysql from 'mysql2/promise';

const url = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const conn = await mysql.createConnection({ 
  uri: url, 
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15000
});

// 查张慧当前的 initial_balances
const [rows] = await conn.execute(
  `SELECT initial_balances FROM ledger_members WHERE ledgerId = 37 AND userId = 4680302 LIMIT 1`
);

const current = rows[0].initial_balances ? JSON.parse(rows[0].initial_balances) : {};
console.log('修改前：', JSON.stringify(current, null, 2));

// 把所有 marginCoin 为「人民币」的改成「元」
for (const key of Object.keys(current)) {
  if (key.endsWith('__marginCoin') && current[key] === '人民币') {
    current[key] = '元';
    console.log(`  修改 ${key}: 人民币 → 元`);
  }
}

console.log('\n修改后：', JSON.stringify(current, null, 2));

await conn.execute(
  `UPDATE ledger_members SET initial_balances = ?, updatedAt = NOW() WHERE ledgerId = 37 AND userId = 4680302`,
  [JSON.stringify(current)]
);

console.log('\n✅ 已统一张慧所有保证金币种为「元」');
await conn.end();
