import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection(url);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS funder_order_alert_state (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    ledger_id INT NOT NULL,
    user_id INT NOT NULL,
    alert_level VARCHAR(20) NOT NULL DEFAULT 'none' COMMENT 'none|negative|pct5|pct10',
    last_triggered_state VARCHAR(20) NOT NULL DEFAULT 'none' COMMENT 'none|negative|pct5|pct10',
    last_triggered_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    UNIQUE KEY funder_alert_order_uniq (order_id),
    KEY funder_alert_ledger_idx (ledger_id),
    KEY funder_alert_user_idx (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`);

console.log('✅ funder_order_alert_state 表创建成功');
await conn.end();
