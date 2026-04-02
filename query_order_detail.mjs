import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

// 1. 查询 3月28日 ccbt_xea 的订单（按时间范围）
console.log('=== 2026-03-28 所有订单 ===');
const [orders] = await connection.execute(
  "SELECT * FROM funder_asset_orders WHERE DATE(created_at) = '2026-03-28' ORDER BY created_at"
);
console.log(JSON.stringify(orders, null, 2));

// 2. 查询所有用户
console.log('\n=== 所有用户 ===');
const [users] = await connection.execute(
  "SELECT id, name, openId FROM users ORDER BY id"
);
console.log(JSON.stringify(users, null, 2));

// 3. 查看 ledger_groups 表结构
console.log('\n=== ledger_groups 表结构 ===');
const [lgCols] = await connection.execute("DESCRIBE ledger_groups");
lgCols.forEach(c => console.log(`${c.Field}: ${c.Type} ${c.Null} ${c.Key}`));

// 4. 查询所有 ledger_groups 数据
console.log('\n=== ledger_groups 所有数据 ===');
const [groups] = await connection.execute("SELECT * FROM ledger_groups LIMIT 50");
console.log(JSON.stringify(groups, null, 2));

await connection.end();
