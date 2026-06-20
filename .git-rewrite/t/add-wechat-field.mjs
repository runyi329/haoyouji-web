import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("No DB URL"); process.exit(1); }

const conn = await mysql.createConnection(url);
try {
  // 检查字段是否已存在
  const [cols] = await conn.execute(`SHOW COLUMNS FROM ledger_records LIKE 'guest_wechat'`);
  if (cols.length > 0) {
    console.log("guest_wechat 字段已存在，无需添加");
  } else {
    await conn.execute(`ALTER TABLE ledger_records ADD COLUMN guest_wechat VARCHAR(100) NULL DEFAULT NULL AFTER guest_name`);
    console.log("✅ 成功添加 guest_wechat 字段");
  }
  // 验证
  const [rows] = await conn.execute(`SHOW COLUMNS FROM ledger_records LIKE 'guest%'`);
  console.log("guest相关字段：", rows.map(r => r.Field));
} finally {
  await conn.end();
}
