import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const passwordHash = '$2b$10$/oMfFqcumITVhZiaqEJViOAUdyxSTY2Xxf0h2jxFaFI1tuOVUb5/S';

console.log('连接Manus数据库...');
const conn = await mysql.createConnection(DATABASE_URL);

try {
  // 删除旧用户
  console.log('删除旧游客用户...');
  await conn.execute('DELETE FROM users WHERE username = ?', ['guest_dev']);
  
  // 创建新用户
  console.log('创建新游客用户...');
  await conn.execute(`
    INSERT INTO users (id, openId, username, passwordHash, name, role, avatar, points, sharingEnabled, isLocked, failedLoginAttempts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    5070293,
    'guest_5070293',
    'guest_dev',
    passwordHash,
    '游客体验账号',
    'parent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=guest',
    0,
    0,
    0,
    0
  ]);
  
  // 验证
  console.log('\n验证用户创建...');
  const [rows] = await conn.execute('SELECT id, username, name FROM users WHERE username = ?', ['guest_dev']);
  
  if (rows.length > 0) {
    console.log('✅ 游客用户创建成功!');
    console.log('   ID:', rows[0].id);
    console.log('   用户名:', rows[0].username);
    console.log('   姓名:', rows[0].name);
    console.log('\n请使用以下凭据登录:');
    console.log('   用户名: guest_dev');
    console.log('   密码: guest123');
  } else {
    console.log('❌ 用户创建失败');
  }
} finally {
  await conn.end();
}
