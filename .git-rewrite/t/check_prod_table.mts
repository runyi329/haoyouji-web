import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL || '';
console.log('DB URL prefix:', url.substring(0, 30));

if (!url) {
  console.log('NO_DB_URL');
  process.exit(1);
}

const conn = await mysql.createConnection(url);

// 检查表是否存在
const [rows] = await conn.execute(`SHOW TABLES LIKE 'eth_position_change_logs'`);
console.log('TABLE_EXISTS:', JSON.stringify(rows));

// 如果不存在，手动创建
const tableArr = rows as any[];
if (tableArr.length === 0) {
  console.log('TABLE_NOT_FOUND - 手动创建...');
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
  console.log('TABLE_CREATED_OK');
} else {
  console.log('TABLE_ALREADY_EXISTS');
}

await conn.end();
