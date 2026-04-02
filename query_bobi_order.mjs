import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

// 1. 查询订单详情
console.log('=== 订单详情 ===');
const [orders] = await connection.execute(
  "SELECT * FROM finance_interest_orders WHERE order_id = 'af260328000053'"
);
console.log(JSON.stringify(orders, null, 2));

// 2. 查询 ccbt_xea 的用户信息
console.log('\n=== 用户信息 (ccbt_xea) ===');
const [users] = await connection.execute(
  "SELECT * FROM ledger_members WHERE username LIKE '%ccbt%' OR username LIKE '%xe%' OR display_name LIKE '%ccbt%' OR display_name LIKE '%xe%' LIMIT 10"
);
console.log(JSON.stringify(users, null, 2));

// 3. 查询拨比配置表
console.log('\n=== 拨比配置表 (所有) ===');
const [tables] = await connection.execute("SHOW TABLES LIKE '%bobi%'");
console.log('拨比相关表:', JSON.stringify(tables));

const [tables2] = await connection.execute("SHOW TABLES LIKE '%ratio%'");
console.log('ratio相关表:', JSON.stringify(tables2));

const [tables3] = await connection.execute("SHOW TABLES LIKE '%gift%'");
console.log('gift相关表:', JSON.stringify(tables3));

const [tables4] = await connection.execute("SHOW TABLES LIKE '%commission%'");
console.log('commission相关表:', JSON.stringify(tables4));

const [allTables] = await connection.execute("SHOW TABLES");
console.log('\n所有表:', JSON.stringify(allTables));

await connection.end();
