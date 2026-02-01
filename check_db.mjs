import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'gateway03.us-east-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: 'XTqR3P9v8tSgKnm.a50f4dd2e0aa',
  password: 'Ba9vOSxsX44g116pXAKU',
  database: 'dWfvfUieyVkmVGc44bjad7',
  ssl: { rejectUnauthorized: true }
});

console.log('✅ 连接成功\n');

// 查看contacts表结构
console.log('=== contacts 表结构 ===');
const [columns1] = await connection.query('DESCRIBE contacts');
console.log(columns1.map(c => c.Field).join(', '));

console.log('\n=== contact_field_categories 表结构 ===');
const [columns2] = await connection.query('DESCRIBE contact_field_categories');
console.log(columns2.map(c => c.Field).join(', '));

// 查询联系人数量
console.log('\n=== 数据统计 ===');
const [result] = await connection.query('SELECT COUNT(*) as count FROM contacts');
console.log(`联系人总数: ${result[0].count}`);

await connection.end();
