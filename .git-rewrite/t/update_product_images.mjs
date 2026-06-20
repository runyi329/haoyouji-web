import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/haoyouji-full/.env' });

const dbUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
const conn = await mysql.createConnection(dbUrl);

// AI生成的图片CDN URLs
const mainImageUrl = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_yigenzu_main-KNvxFHdMWx5PH9ME9dBiZx.webp';

const detailImages = JSON.stringify([
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_detail_banner1-LRJHe27AiUBL3JtodaCirZ.webp',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_detail_banner2-Le6UFjwT2M6Mz6zjJycpFp.webp',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_detail_banner3-8GKTD6p7E5kX5p9cZCjmDJ.webp',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_detail_banner4-L7B7hP44waDvDnZvm7tq8v.webp',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_detail_banner5-3tpX8t8APHi6rTqvttSja4.webp',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_detail_banner6-C2P67v5YkdaabSYByo3HE7.webp',
]);

// 先查找产品
const [rows] = await conn.execute(
  "SELECT id, name, mainImageUrl FROM merchant_products WHERE name LIKE '%一根猪%' OR name LIKE '%大力水手%' ORDER BY id DESC LIMIT 5"
);
console.log('找到产品:', JSON.stringify(rows, null, 2));

if (rows.length > 0) {
  const productId = rows[0].id;
  console.log(`更新产品 ID=${productId} 的图片...`);
  
  await conn.execute(
    'UPDATE merchant_products SET mainImageUrl=?, imageUrls=? WHERE id=?',
    [mainImageUrl, detailImages, productId]
  );
  
  console.log('✅ 产品图片更新成功！');
  console.log(`  主图: ${mainImageUrl}`);
  console.log(`  详情图: 6张`);
} else {
  // 产品不存在，插入新产品
  console.log('产品不存在，正在插入新产品...');
  
  // 查找食品饮料分类
  const [cats] = await conn.execute(
    "SELECT id, name FROM merchant_product_categories WHERE name LIKE '%食品%' OR name LIKE '%健康%' OR name LIKE '%零食%' LIMIT 5"
  );
  console.log('分类:', JSON.stringify(cats));
  
  const categoryId = cats.length > 0 ? cats[0].id : null;
  
  const [result] = await conn.execute(
    `INSERT INTO merchant_products 
     (name, subtitle, basePrice, originalPrice, mainImageUrl, imageUrls, categoryId, status, sourceType, isShareable, stock, description, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'platform', 1, 999, ?, NOW(), NOW())`,
    [
      '大力水手 一根猪原味 68g',
      '4.5斤里脊≈1斤肉条 | 高蛋白质100g/64.3g | 盒装',
      '238',
      '23.8',
      mainImageUrl,
      detailImages,
      categoryId,
      '高蛋白低脂猪肉条，含优质蛋白质，适合搭配新鲜蔬菜和全谷物食用，均衡营养。选自优质里脊肉，自然风干口感香嫩，小包装方便携带。\n\n配料：猪里脊肉、酱油、海藻糖、复合调味料、香辛料（辐照加工）、鸡精调味料\n净含量：68克 | 保质期：6个月\n储存方法：置于凉爽干燥处保存 | 食用方法：拆袋即食\n\n致敏原信息：本产品含有大豆制品'
    ]
  );
  
  console.log(`✅ 新产品插入成功！ID=${result.insertId}`);
  
  // 写入积分价格（points_redeem_orders相关表）
  // 检查是否有pointsPrice字段
  const [cols] = await conn.execute("SHOW COLUMNS FROM merchant_products LIKE 'pointsPrice'");
  if (cols.length > 0) {
    await conn.execute('UPDATE merchant_products SET pointsPrice=? WHERE id=?', ['238', result.insertId]);
    console.log('✅ 积分价格设置为238');
  }
}

await conn.end();
console.log('完成！');
