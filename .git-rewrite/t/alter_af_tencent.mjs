import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Yjh2024!',
  database: 'crm_db',
});

console.log('Connected to Tencent Cloud crm_db');

// 检查当前表结构
const [cols] = await conn.execute("SHOW COLUMNS FROM af_funding_rate_settings");
console.log('Current columns:', JSON.stringify(cols.map((c) => c.Field)));

// 添加缺失字段（如果不存在）
const existingCols = cols.map((c) => c.Field);

if (!existingCols.includes('open_at')) {
  await conn.execute(`ALTER TABLE af_funding_rate_settings ADD COLUMN open_at BIGINT NULL COMMENT '本次开启时间戳(ms)'`);
  console.log('Added open_at');
}

if (!existingCols.includes('open_balance_snapshot')) {
  await conn.execute(`ALTER TABLE af_funding_rate_settings ADD COLUMN open_balance_snapshot DECIMAL(20,8) NULL COMMENT '开启时余额快照'`);
  console.log('Added open_balance_snapshot');
}

if (!existingCols.includes('settled_hours')) {
  await conn.execute(`ALTER TABLE af_funding_rate_settings ADD COLUMN settled_hours INT NOT NULL DEFAULT 0 COMMENT '本次开启已结算小时数'`);
  console.log('Added settled_hours');
}

// 验证
const [cols2] = await conn.execute("SHOW COLUMNS FROM af_funding_rate_settings");
console.log('Updated columns:', JSON.stringify(cols2.map((c) => c.Field)));

await conn.end();
console.log('Done!');
