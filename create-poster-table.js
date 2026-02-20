const mysql = require('mysql2/promise');
const fs = require('fs');

async function createTable() {
  let connection;
  try {
    // 从DATABASE_URL环境变量解析连接信息
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('DATABASE_URL 环境变量未设置');
      process.exit(1);
    }

    // 解析DATABASE_URL
    const url = new URL(dbUrl);
    const config = {
      host: url.hostname,
      port: url.port || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
    };

    console.log('连接数据库...');
    connection = await mysql.createConnection(config);
    
    // 读取SQL文件
    const sql = fs.readFileSync('database/poster_favorites.sql', 'utf8');
    
    console.log('创建 poster_favorites 表...');
    await connection.query(sql);
    
    console.log('✓ 表创建成功！');
    process.exit(0);
  } catch (error) {
    console.error('✗ 创建表失败:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createTable();
