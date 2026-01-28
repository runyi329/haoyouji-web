import mysql from 'mysql2/promise';

// 解析DATABASE_URL
const url = process.env.DATABASE_URL;
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);

if (!match) {
  console.log('❌ 无法解析DATABASE_URL');
  process.exit(1);
}

const [, user, password, host, port, database] = match;

console.log('连接配置:');
console.log('  Host:', host);
console.log('  Port:', port);
console.log('  User:', user);
console.log('  Database:', database);

console.log('\n尝试连接...');

try {
  const conn = await mysql.createConnection({
    host,
    port: parseInt(port),
    user,
    password,
    database,
    ssl: { rejectUnauthorized: true }
  });
  
  console.log('✅ 连接成功!');
  
  const [rows] = await conn.execute('SELECT 1 as test');
  console.log('✅ 查询成功:', rows);
  
  await conn.end();
} catch (error) {
  console.log('❌ 失败:', error.message);
  console.log('错误代码:', error.code);
}
