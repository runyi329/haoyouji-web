/**
 * 奢贝积分系统 - 数据库迁移脚本
 * 创建 beauty_points 和 beauty_points_log 表
 */
import mysql from 'mysql2/promise';

async function migrate() {
  const connection = await mysql.createConnection({
    host: '124.223.54.69',
    port: 3306,
    user: 'root',
    password: 'Miao@20190603',
    database: 'crm_db',
    connectTimeout: 30000,
    charset: 'utf8mb4',
  });

  console.log('[migrate] 已连接数据库');

  // 1. 创建奢贝积分账户表
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS beauty_points (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      balance INT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      UNIQUE KEY beauty_points_userId_unique (userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('[migrate] beauty_points 表已创建');

  // 2. 创建奢贝积分变动日志表
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS beauty_points_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      operatorId INT NOT NULL,
      amount INT NOT NULL,
      balanceAfter INT NOT NULL,
      remark VARCHAR(200),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      INDEX beauty_points_log_userId_idx (userId),
      INDEX beauty_points_log_operatorId_idx (operatorId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('[migrate] beauty_points_log 表已创建');

  await connection.end();
  console.log('[migrate] 迁移完成');
}

migrate().catch(err => {
  console.error('[migrate] 迁移失败:', err);
  process.exit(1);
});
