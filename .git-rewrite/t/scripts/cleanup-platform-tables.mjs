import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const c = await mysql.createConnection(dbUrl);

// 1. 删除 platform_products 表（空表，无数据）
await c.execute('DROP TABLE IF EXISTS platform_products');
console.log('✓ Dropped platform_products table');

// 2. 修改 product_import_requests 表：
//    将 platformProductId 改名为 productId（引用 merchant_products.id）
//    先检查列名是否已经是 productId
const [cols] = await c.execute("SHOW COLUMNS FROM product_import_requests LIKE 'platformProductId'");
if (cols.length > 0) {
  await c.execute('ALTER TABLE product_import_requests CHANGE platformProductId productId INT NOT NULL');
  console.log('✓ Renamed platformProductId -> productId in product_import_requests');
} else {
  console.log('ℹ productId column already exists, skipping rename');
}

// 3. 验证
const [tables] = await c.execute("SHOW TABLES LIKE 'platform%'");
console.log('Remaining platform tables:', tables.map(r => Object.values(r)[0]));

const [reqCols] = await c.execute('SHOW COLUMNS FROM product_import_requests');
console.log('product_import_requests columns:', reqCols.map(r => r.Field));

await c.end();
console.log('Done!');
