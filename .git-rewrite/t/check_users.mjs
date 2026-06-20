import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'gateway03.us-east-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: 'XTqR3P9v8tSgKnm.a50f4dd2e0aa',
  password: 'Ba9vOSxsX44g116pXAKU',
  database: 'dWfvfUieyVkmVGc44bjad7',
  ssl: { rejectUnauthorized: true }
});

console.log('=== 用户列表 ===');
const [users] = await connection.query('SELECT id, username, name, role FROM users ORDER BY id LIMIT 20');
users.forEach(u => {
  console.log(`ID: ${u.id}, 用户名: ${u.username}, 姓名: ${u.name || 'N/A'}, 角色: ${u.role}`);
});

console.log('\n=== 查找特定用户 ===');
const [specific] = await connection.query("SELECT id, username FROM users WHERE username IN ('jiang', 'yunting', 'hyy329')");
specific.forEach(u => {
  console.log(`${u.username}: ID=${u.id}`);
});

// 查询每个用户的联系人数
console.log('\n=== 联系人统计 ===');
for (const user of specific) {
  const [count] = await connection.query('SELECT COUNT(*) as count FROM contacts WHERE parent_user_id = ?', [user.id]);
  console.log(`${user.username}: ${count[0].count} 个联系人`);
}

await connection.end();
