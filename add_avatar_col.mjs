import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'haoyouji',
  password: 'haoyouji123',
  database: 'haoyouji_dev',
  ssl: false,
});

try {
  await conn.execute(`ALTER TABLE wecom_channels ADD COLUMN avatar_url VARCHAR(500) DEFAULT NULL`);
  console.log('✅ avatar_url 列添加成功');
} catch (e) {
  if (e.code === 'ER_DUP_FIELDNAME') {
    console.log('✅ avatar_url 列已存在');
  } else {
    console.error('❌ 错误:', e.message);
  }
}

await conn.end();
