/**
 * 迁移脚本：merchant_products 表新增 inPointsShop 字段
 * 运行方式：node scripts/migrate-add-inPointsShop.cjs
 */
const mysql = require('mysql2/promise');

async function main() {
  const dbUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ 未找到数据库连接URL');
    process.exit(1);
  }
  
  const conn = await mysql.createConnection(dbUrl);
  
  try {
    // 检查字段是否已存在
    const [cols] = await conn.execute("SHOW COLUMNS FROM merchant_products LIKE 'inPointsShop'");
    if (cols.length > 0) {
      console.log('✅ 字段 inPointsShop 已存在，无需迁移');
    } else {
      await conn.execute(`
        ALTER TABLE merchant_products 
        ADD COLUMN inPointsShop TINYINT(1) NOT NULL DEFAULT 0 
        COMMENT '是否上架到积分商城（0=否，1=是）'
        AFTER isShareable
      `);
      console.log('✅ 成功新增 inPointsShop 字段');
    }
    
    // 验证
    const [rows] = await conn.execute("SELECT COUNT(*) as total FROM merchant_products");
    console.log(`数据库共有 ${rows[0].total} 个商品`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('❌ 迁移失败:', err.message);
  process.exit(1);
});
