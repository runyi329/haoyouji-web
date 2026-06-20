import mysql from "mysql2/promise";

const url = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";

const conn = await mysql.createConnection(url);
try {
  console.log("✅ 数据库连接成功");

  // 1. 检查 ledger_records 表是否存在
  const [tables] = await conn.execute(`SHOW TABLES LIKE 'ledger_records'`);
  if (tables.length === 0) {
    console.error("❌ ledger_records 表不存在");
    process.exit(1);
  }
  console.log("✅ ledger_records 表存在");

  // 2. 查看现有 guest 相关字段
  const [cols] = await conn.execute(`SHOW COLUMNS FROM ledger_records LIKE 'guest%'`);
  console.log("现有 guest 字段：", cols.map(r => r.Field));

  // 3. 添加 guest_wechat 字段（如不存在）
  const hasWechat = cols.some(r => r.Field === 'guest_wechat');
  if (hasWechat) {
    console.log("guest_wechat 字段已存在，跳过");
  } else {
    await conn.execute(
      `ALTER TABLE ledger_records ADD COLUMN guest_wechat VARCHAR(100) NULL DEFAULT NULL AFTER guest_name`
    );
    console.log("✅ 成功添加 guest_wechat 字段");
  }

  // 4. 验证最终字段
  const [finalCols] = await conn.execute(`SHOW COLUMNS FROM ledger_records LIKE 'guest%'`);
  console.log("最终 guest 字段：", finalCols.map(r => r.Field));

  // 5. 查看最近几条意见记录
  const [rows] = await conn.execute(
    `SELECT id, ledgerId, description, rating, guest_name, guest_wechat, created_at 
     FROM ledger_records 
     WHERE deleted_at IS NULL 
     ORDER BY created_at DESC 
     LIMIT 5`
  );
  console.log("最近5条记录：", rows);

} finally {
  await conn.end();
}
