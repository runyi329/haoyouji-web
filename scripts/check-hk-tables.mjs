import mysql from 'mysql2/promise';

// 注意：密码中含有@符号，需要用%40编码
const DB_URL = process.env.ORIGINAL_DATABASE_URL ?? 'mysql://root:Miao%4020190603@124.223.54.69:3306/crm_db';

const conn = await mysql.createConnection(DB_URL);

const [tables] = await conn.execute('SHOW TABLES LIKE "%hk%"');
console.log('HK相关表:');
for (const t of tables) {
  const name = Object.values(t)[0];
  console.log(' -', name);
  try {
    const [cnt] = await conn.execute(`SELECT COUNT(*) as cnt FROM \`${name}\``);
    console.log('   行数:', cnt[0].cnt);
  } catch (e) {
    console.log('   查询失败:', e.message);
  }
}

const [tsTables] = await conn.execute('SHOW TABLES LIKE "%ts_%"');
console.log('\nTS相关表:');
for (const t of tsTables) {
  const name = Object.values(t)[0];
  console.log(' -', name);
}

await conn.end();
