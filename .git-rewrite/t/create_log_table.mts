import * as mysql from 'mysql2/promise';

// 使用腾讯云数据库（ORIGINAL_DATABASE_URL）
const url = process.env.ORIGINAL_DATABASE_URL || process.env.EXTERNAL_DATABASE_URL || '';
console.log('Using DB:', url.substring(0, 40) + '...');

if (!url) {
  console.log('NO_DB_URL - 请检查环境变量');
  process.exit(1);
}

let conn: mysql.Connection;
try {
  conn = await mysql.createConnection(url);
  console.log('Connected OK');
} catch (e: any) {
  console.log('CONNECT_ERROR:', e.message);
  process.exit(1);
}

// 检查表是否存在
const [rows] = await conn.execute(`SHOW TABLES LIKE 'eth_position_change_logs'`);
const tableArr = rows as any[];
console.log('Table exists:', tableArr.length > 0);

if (tableArr.length === 0) {
  console.log('Creating table...');
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`eth_position_change_logs\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_id INT NOT NULL COMMENT '账本ID',
        price INT NOT NULL COMMENT '档位价格',
        change_type ENUM('actual','planned') NOT NULL COMMENT '修改类型',
        old_value DECIMAL(18,8) NOT NULL COMMENT '修改前的值',
        new_value DECIMAL(18,8) NOT NULL COMMENT '修改后的值',
        note VARCHAR(500) NOT NULL DEFAULT '' COMMENT '用户备注',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX eth_log_ledger_idx (ledger_id),
        INDEX eth_log_ledger_price_idx (ledger_id, price)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ETH持仓修改日志表'
    `);
    console.log('TABLE_CREATED_OK ✅');
  } catch (e: any) {
    console.log('CREATE_ERROR:', e.message);
  }
} else {
  console.log('TABLE_ALREADY_EXISTS ✅');
}

// 验证表结构
const [cols] = await conn.execute(`DESCRIBE eth_position_change_logs`);
console.log('Columns:', JSON.stringify(cols, null, 2));

await conn.end();
