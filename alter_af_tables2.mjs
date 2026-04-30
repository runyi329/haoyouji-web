import { createConnection } from 'mysql2/promise';

const TENCENT_CLOUD_DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const url = process.env.ORIGINAL_DATABASE_URL || TENCENT_CLOUD_DB_URL;
console.log('[alter_af_tables2] Using DB:', url.replace(/\/\/.*:.*@/, '//***:***@'));

const conn = await createConnection({ uri: url, ssl: { rejectUnauthorized: false } });

const addCols = [
  { name: 'open_balance_snapshot', sql: `ALTER TABLE af_funding_rate_settings ADD COLUMN open_balance_snapshot DECIMAL(20,8) NULL DEFAULT NULL AFTER last_enabled_at` },
  { name: 'open_at', sql: `ALTER TABLE af_funding_rate_settings ADD COLUMN open_at BIGINT NULL DEFAULT NULL AFTER open_balance_snapshot` },
  { name: 'settled_hours', sql: `ALTER TABLE af_funding_rate_settings ADD COLUMN settled_hours INT NOT NULL DEFAULT 0 AFTER open_at` },
];

for (const col of addCols) {
  try {
    await conn.execute(col.sql);
    console.log(`Added column: ${col.name}`);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log(`Column ${col.name} already exists, skipping`);
    } else throw e;
  }
}

const [cols] = await conn.execute(`DESCRIBE af_funding_rate_settings`);
console.log('Table structure:', JSON.stringify(cols.map((c) => c.Field)));

await conn.end();
console.log('Done!');
