import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'haoyouji',
  password: 'haoyouji123',
  database: 'haoyouji_dev'
});

console.log('✅ 连接本地MySQL成功\n');

console.log('=== 查找特定用户 ===');
const [users] = await connection.query("SELECT id, username FROM users WHERE username IN ('jiang', 'yunting', 'hyy329')");
users.forEach(u => {
  console.log(`${u.username}: ID=${u.id}`);
});

console.log('\n=== 联系人统计 ===');
for (const user of users) {
  const [count] = await connection.query('SELECT COUNT(*) as count FROM contacts WHERE parent_user_id = ?', [user.id]);
  console.log(`${user.username}: ${count[0].count} 个联系人`);
}

console.log('\n=== 总联系人数 ===');
const [total] = await connection.query('SELECT COUNT(*) as count FROM contacts');
console.log(`总计: ${total[0].count} 个联系人`);

await connection.end();
