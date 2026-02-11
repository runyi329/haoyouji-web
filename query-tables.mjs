import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db'
});

try {
  const [tables] = await connection.execute(`SHOW TABLES LIKE '%interact%'`);
  console.log('=== 互动相关表 ===');
  console.log(JSON.stringify(tables, null, 2));
  
  const [allTables] = await connection.execute(`SHOW TABLES`);
  console.log('\n=== 所有表 ===');
  console.log(allTables.map(t => Object.values(t)[0]).join(', '));
  
} catch (error) {
  console.error('查询失败:', error);
} finally {
  await connection.end();
}
