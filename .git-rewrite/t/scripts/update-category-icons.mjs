import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_URL = process.env.DATABASE_URL || process.env.EXTERNAL_DATABASE_URL;
if (!DB_URL) {
  console.error('EXTERNAL_DATABASE_URL not set');
  process.exit(1);
}

// 解析 MySQL URL
const url = new URL(DB_URL);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false }
});

// 分类名称 → 图标文件名映射
const iconMap = {
  '食品饮料': '/icons/icon_food_drink_transparent.png',
  '美妆护肤': '/icons/icon_beauty_transparent.png',
  '服装鞋帽': '/icons/icon_fashion_transparent.png',
  '日用百货': '/icons/icon_daily_transparent.png',
  '水果生鲜': '/icons/icon_fresh_transparent.png',
  '家用电器': '/icons/icon_appliance_transparent.png',
  '家具家纺': '/icons/icon_furniture_transparent.png',
  '母婴用品': '/icons/icon_baby_transparent.png',
  '运动户外': '/icons/icon_sports_transparent.png',
  '宠物生活': '/icons/icon_pet_transparent.png',
  '数码通讯': '/icons/icon_digital_transparent.png',
  '礼品玩具': '/icons/icon_gift_transparent.png',
  '健康养生': '/icons/icon_health_transparent.png',
  '珠宝首饰': '/icons/icon_jewelry_transparent.png',
  '更多': '/icons/icon_more_transparent.png',
};

console.log('开始更新分类图标URL...');

for (const [name, iconUrl] of Object.entries(iconMap)) {
  const [result] = await connection.execute(
    'UPDATE merchant_product_categories SET icon_url = ? WHERE name = ?',
    [iconUrl, name]
  );
  const affected = result.affectedRows;
  if (affected > 0) {
    console.log(`✅ ${name} → ${iconUrl}`);
  } else {
    console.log(`⚠️  未找到分类: ${name}`);
  }
}

// 查看更新结果
const [rows] = await connection.execute(
  'SELECT id, name, icon_url FROM merchant_product_categories ORDER BY sort_order ASC LIMIT 20'
);
console.log('\n当前分类列表:');
rows.forEach(r => console.log(`  [${r.id}] ${r.name}: ${r.icon_url || '(无图标)'}`));

await connection.end();
console.log('\n完成！');
