import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.ORIGINAL_DATABASE_URL || "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
if (!DB_URL) {
  console.error("No DB URL found");
  process.exit(1);
}

const conn = await mysql.createConnection(DB_URL);

try {
  // 检查字段是否已存在
  const [rows] = await conn.execute(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'merchant_products' 
    AND COLUMN_NAME = 'badgeLeftText'
  `);
  
  if (rows.length > 0) {
    console.log("✅ badgeLeftText 字段已存在，无需添加");
  } else {
    await conn.execute(`
      ALTER TABLE merchant_products 
      ADD COLUMN badgeLeftText VARCHAR(8) NULL AFTER badgeEnabled
    `);
    console.log("✅ 成功添加 badgeLeftText 字段");
  }
  
  // 验证所有badge字段
  const [cols] = await conn.execute(`
    SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'merchant_products' 
    AND COLUMN_NAME LIKE 'badge%'
    ORDER BY ORDINAL_POSITION
  `);
  console.log("当前badge字段:", cols);
} catch (err) {
  console.error("❌ 错误:", err.message);
} finally {
  await conn.end();
}
