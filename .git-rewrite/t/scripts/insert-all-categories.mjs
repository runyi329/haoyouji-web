import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.EXTERNAL_DATABASE_URL);

// 15个分类配置（含图标URL）
const categories = [
  { name: '食品饮料', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_food_v3-HSvkiSX7WrrNEoKmLEZYtW.png', sortOrder: 1 },
  { name: '美妆护肤', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_beauty_v3-MXbew7mZTymf8vkPzd8oZf.png', sortOrder: 2 },
  { name: '服装鞋帽', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_fashion_v3-g6SVnpxPXSaaaXUTTjds63.png', sortOrder: 3 },
  { name: '日用百货', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_daily-GjF7FxS2SfRVsz4TjahZYo.png', sortOrder: 4 },
  { name: '水果生鲜', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_fresh-bkoiPcXsgE5gmNrKb6CCzH.png', sortOrder: 5 },
  { name: '家用电器', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_appliance-MhyXd8DXB5xo9ygJe6HN2u.png', sortOrder: 6 },
  { name: '家具家纺', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_furniture-H9uzAr7FEy7CwvnzAXxYvn.png', sortOrder: 7 },
  { name: '母婴用品', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_baby-m8y55fJqV8Fphmeauy6cSM.png', sortOrder: 8 },
  { name: '运动户外', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_sports-KmzfckoDWmoLc859E3kSvq.png', sortOrder: 9 },
  { name: '数码通讯', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_digital-6BfbB39LXkcyKx29moukJv.png', sortOrder: 10 },
  { name: '健康养生', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_health-gW9fb6mDU2Rye92tNpgs42.png', sortOrder: 11 },
  { name: '礼品玩具', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_gift-YzYG2CCMMbwpDb2NufnKhX.png', sortOrder: 12 },
  { name: '珠宝首饰', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_jewelry-nevWK7j7NJzXsuzSwrRkVb.png', sortOrder: 13 },
  { name: '宠物生活', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_pet-iub3fnPikQuea8WkC5zjEr.png', sortOrder: 14 },
  { name: '更多', icon: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/icon_more-fJVCU3m8TAdC93bni8Wdgo.png', sortOrder: 15 },
];

// 先删除旧的吃喝玩乐4个分类（id 35-38）
await db.execute('DELETE FROM merchant_product_categories WHERE id IN (35, 36, 37, 38)');
console.log('已删除旧的吃喝玩乐分类');

// 插入新的15个分类
for (const cat of categories) {
  const [result] = await db.execute(
    'INSERT INTO merchant_product_categories (name, iconUrl, sortOrder, isActive) VALUES (?, ?, ?, 1)',
    [cat.name, cat.icon, cat.sortOrder]
  );
  console.log(`✅ 插入分类: ${cat.name} (id=${result.insertId})`);
}

await db.end();
console.log('\n全部完成！');
