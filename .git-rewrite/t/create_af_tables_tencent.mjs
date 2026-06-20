import { createConnection } from 'mysql2/promise';

// 直接使用腾讯云数据库（与 server/_core/env.ts 中 TENCENT_CLOUD_DB_URL 一致）
const TENCENT_CLOUD_DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const url = process.env.ORIGINAL_DATABASE_URL || TENCENT_CLOUD_DB_URL;
console.log('[create_af_tables] Using DB:', url.replace(/\/\/.*:.*@/, '//***:***@'));

const conn = await createConnection({ uri: url, ssl: { rejectUnauthorized: false } });

await conn.execute(`CREATE TABLE IF NOT EXISTS \`af_funding_rate_settings\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`ledger_id\` int NOT NULL,
  \`user_id\` int NOT NULL,
  \`enabled\` tinyint NOT NULL DEFAULT 0,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`af_fr_settings_ledger_user_uniq\` (\`ledger_id\`, \`user_id\`),
  KEY \`af_fr_settings_ledger_idx\` (\`ledger_id\`),
  KEY \`af_fr_settings_user_idx\` (\`user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
console.log('af_funding_rate_settings created/exists');

await conn.execute(`CREATE TABLE IF NOT EXISTS \`af_funding_rate_logs\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`ledger_id\` int NOT NULL,
  \`user_id\` int NOT NULL,
  \`balance_snapshot\` decimal(20,8) NOT NULL,
  \`amount\` decimal(20,8) NOT NULL,
  \`total_accumulated\` decimal(20,8) NOT NULL,
  \`annual_rate\` decimal(8,4) NOT NULL DEFAULT 0.1200,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`af_fr_logs_ledger_user_idx\` (\`ledger_id\`, \`user_id\`),
  KEY \`af_fr_logs_created_idx\` (\`created_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
console.log('af_funding_rate_logs created/exists');

const [rows] = await conn.execute("SHOW TABLES LIKE 'af_funding_rate%'");
console.log('Tables in DB:', JSON.stringify(rows));

// 查询现有数据
const [settings] = await conn.execute('SELECT * FROM af_funding_rate_settings LIMIT 5');
console.log('Existing settings:', JSON.stringify(settings));

await conn.end();
console.log('Done!');
