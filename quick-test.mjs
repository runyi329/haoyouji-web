import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
console.log('测试Manus数据库连接...\n');

try {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log('✅ 连接成功！');
  
  const [rows] = await conn.execute('SELECT 1 as test');
  console.log('✅ 查询成功！');
  
  await conn.end();
  process.exit(0);
} catch (error) {
  console.log('❌ 连接失败:', error.message);
  process.exit(1);
}
