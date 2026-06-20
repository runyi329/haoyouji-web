import { createConnection } from 'mysql2/promise';

const TENCENT_CLOUD_DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const url = process.env.ORIGINAL_DATABASE_URL || TENCENT_CLOUD_DB_URL;
console.log('[alter_af_tables] Using DB:', url.replace(/\/\/.*:.*@/, '//***:***@'));

const conn = await createConnection({ uri: url, ssl: { rejectUnauthorized: false } });

// 新增 total_enabled_seconds（累计开启秒数）
try {
  await conn.execute(`ALTER TABLE af_funding_rate_settings ADD COLUMN total_enabled_seconds BIGINT NOT NULL DEFAULT 0 AFTER enabled`);
  console.log('Added column: total_enabled_seconds');
} catch (e) {
  if (e.code === 'ER_DUP_FIELDNAME') {
    console.log('Column total_enabled_seconds already exists, skipping');
  } else throw e;
}

// 新增 last_enabled_at（最近一次打开时间，用于计算本次已计时秒数）
try {
  await conn.execute(`ALTER TABLE af_funding_rate_settings ADD COLUMN last_enabled_at BIGINT NULL DEFAULT NULL AFTER total_enabled_seconds`);
  console.log('Added column: last_enabled_at');
} catch (e) {
  if (e.code === 'ER_DUP_FIELDNAME') {
    console.log('Column last_enabled_at already exists, skipping');
  } else throw e;
}

// 验证表结构
const [cols] = await conn.execute(`DESCRIBE af_funding_rate_settings`);
console.log('Table structure:', JSON.stringify(cols.map((c) => ({ Field: c.Field, Type: c.Type, Default: c.Default })), null, 2));

await conn.end();
console.log('Done!');
