// 执行 yaban_clinic 表字段迁移
require('dotenv').config({ path: '.env' });
const mysql = require('mysql2/promise');

async function main() {
  const dbUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

  const conn = await mysql.createConnection({ uri: dbUrl, ssl: { rejectUnauthorized: false }, connectTimeout: 15000 });
  
  // 检查字段是否已存在
  const [cols] = await conn.execute("SHOW COLUMNS FROM yaban_clinic LIKE 'service_expire_at'");
  if (cols.length > 0) {
    console.log('字段 service_expire_at 已存在，跳过');
  } else {
    await conn.execute("ALTER TABLE yaban_clinic ADD COLUMN service_expire_at DATE NULL COMMENT '服务到期日期'");
    console.log('✅ 已添加 service_expire_at 字段');
  }

  const [cols2] = await conn.execute("SHOW COLUMNS FROM yaban_clinic LIKE 'service_plan'");
  if (cols2.length > 0) {
    console.log('字段 service_plan 已存在，跳过');
  } else {
    await conn.execute("ALTER TABLE yaban_clinic ADD COLUMN service_plan VARCHAR(32) NULL COMMENT '套餐类型：monthly/annual/lifetime'");
    console.log('✅ 已添加 service_plan 字段');
  }

  await conn.end();
  console.log('迁移完成');
}

main().catch(e => { console.error(e); process.exit(1); });
