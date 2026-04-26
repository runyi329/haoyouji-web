import mysql from 'mysql2/promise';

const url = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const conn = await mysql.createConnection({ 
  uri: url, 
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15000
});

// 查 ledger_id=37 的所有成员保证金
const [members] = await conn.execute(
  `SELECT lm.userId, u.name, u.real_name, lm.initial_balances, lm.updatedAt
   FROM ledger_members lm
   LEFT JOIN users u ON u.id = lm.userId
   WHERE lm.ledgerId = 37
   ORDER BY lm.updatedAt DESC`
);

console.log('=== 37号账本所有成员保证金 ===');
for (const m of members) {
  const balances = m.initial_balances ? JSON.parse(m.initial_balances) : {};
  const marginKeys = Object.keys(balances).filter(k => k.endsWith('__margin'));
  const name = m.real_name || m.name;
  console.log(`\n${name} (userId: ${m.userId}) 更新: ${m.updatedAt}`);
  if (marginKeys.length > 0) {
    for (const k of marginKeys) {
      const tag = k.replace('__margin', '');
      const coin = balances[`${tag}__marginCoin`] || '人民币';
      console.log(`  [${tag}] ${balances[k]} ${coin}`);
    }
  } else {
    console.log('  （无保证金）');
  }
}

await conn.end();
