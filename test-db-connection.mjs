import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

console.log('DATABASE_URL:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
console.log('\n尝试连接Manus数据库...');

try {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log('✅ 连接成功！');
  
  const [rows] = await conn.execute('SELECT 1 as test');
  console.log('✅ 查询成功:', rows);
  
  await conn.end();
  console.log('✅ 连接关闭');
} catch (error) {
  console.log('❌ 连接失败:', error.message);
  console.log('错误代码:', error.code);
}
