import mysql from 'mysql2/promise';

// 使用腾讯云数据库（与生产环境一致）
const dbUrl = process.env.ORIGINAL_DATABASE_URL || "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
console.log('Using DB:', dbUrl.replace(/\/\/.*:.*@/, '//***:***@'));

const conn = await mysql.createConnection(dbUrl);

// 检查字段是否存在
const [rows] = await conn.execute(
  "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_products' AND COLUMN_NAME IN ('badgeEnabled', 'badgeText')"
);
console.log('Existing badge columns:', rows.map(r => r.COLUMN_NAME));

if (rows.length < 2) {
  const existingCols = rows.map(r => r.COLUMN_NAME);
  
  if (!existingCols.includes('badgeEnabled')) {
    await conn.execute("ALTER TABLE `merchant_products` ADD COLUMN `badgeEnabled` TINYINT NOT NULL DEFAULT 0 COMMENT '是否显示角标(0=否,1=是)' AFTER `pointsPrice`");
    console.log('Added badgeEnabled column');
  }
  
  if (!existingCols.includes('badgeText')) {
    await conn.execute("ALTER TABLE `merchant_products` ADD COLUMN `badgeText` VARCHAR(16) NULL COMMENT '角标文字(2-8字)' AFTER `badgeEnabled`");
    console.log('Added badgeText column');
  }
} else {
  console.log('Both columns already exist!');
}

await conn.end();
console.log('Done!');
