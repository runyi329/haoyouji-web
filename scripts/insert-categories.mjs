import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ 未找到数据库环境变量');
  process.exit(1);
}

console.log('连接数据库...');
const conn = await mysql.createConnection(DATABASE_URL);

// 查看现有分类
const [existing] = await conn.execute('SELECT id, name, sortOrder FROM merchant_product_categories ORDER BY sortOrder');
console.log('现有分类:', JSON.stringify(existing));

// 插入吃喝玩乐4个分类（如果不存在）
const categories = [
  { name: '吃', description: '美食餐饮', sortOrder: 10 },
  { name: '喝', description: '饮品茶酒', sortOrder: 20 },
  { name: '玩', description: '休闲娱乐', sortOrder: 30 },
  { name: '乐', description: '生活享乐', sortOrder: 40 },
];

for (const cat of categories) {
  const [rows] = await conn.execute('SELECT id FROM merchant_product_categories WHERE name = ?', [cat.name]);
  if (rows.length > 0) {
    console.log(`⏭️  分类"${cat.name}"已存在 (id=${rows[0].id})，跳过`);
  } else {
    const [result] = await conn.execute(
      'INSERT INTO merchant_product_categories (name, description, sortOrder, isActive) VALUES (?, ?, ?, 1)',
      [cat.name, cat.description, cat.sortOrder]
    );
    console.log(`✅ 已插入分类"${cat.name}" (id=${result.insertId})`);
  }
}

// 查看最终分类
const [final] = await conn.execute('SELECT id, name, description, sortOrder FROM merchant_product_categories ORDER BY sortOrder');
console.log('最终分类:', JSON.stringify(final));

await conn.end();
console.log('完成！');
