import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'haoyouji',
  password: 'haoyouji123',
  database: 'haoyouji_dev'
});

console.log('✅ 连接本地MySQL成功\n');

console.log('=== 联系人统计 (使用驼峰命名) ===');
const [users] = await connection.query("SELECT id, username FROM users WHERE username IN ('jiang', 'yunting', 'hyy329')");
for (const user of users) {
  const [count] = await connection.query('SELECT COUNT(*) as count FROM contacts WHERE parentUserId = ?', [user.id]);
  console.log(`${user.username}: ${count[0].count} 个联系人`);
}

await connection.end();
