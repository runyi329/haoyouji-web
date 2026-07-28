import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
  ssl: false,
  connectTimeout: 10000,
});

console.log('连接成功！');

// 1. 查看所有表
console.log('\n=== 所有表 ===');
const [tables] = await connection.execute("SHOW TABLES");
tables.forEach(t => console.log(Object.values(t)[0]));

await connection.end();
