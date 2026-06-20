import mysql from 'mysql2/promise';

const DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";

const conn = await mysql.createConnection(DB_URL);
console.log('✅ 已连接腾讯云数据库');

// 查看merchant_products表结构
const [cols] = await conn.execute("SHOW COLUMNS FROM merchant_products");
console.log('表字段:', cols.map(c => c.Field).join(', '));

// 查找食品/健康相关分类
const [cats] = await conn.execute(
  "SELECT id, name FROM merchant_product_categories ORDER BY id LIMIT 20"
);
console.log('现有分类:', JSON.stringify(cats));

// 产品图片URLs（AI生成的无缝衔接详情图）
const mainImageUrl = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_1-4uVemLpCaLACTWdNtnGtXc.png';

const detailImages = JSON.stringify([
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_1-4uVemLpCaLACTWdNtnGtXc.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_2-RcioVPUFxQjUmaouWghPcm.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_3-ZMgzcqTWZD9GgRXxtUteWF.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_4-c9pLtbFpdY6eF6W2FonbiY.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_5-RDuGg2KS9vyNnCrPs2yUyn.png',
  'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/popeye_seamless_6-5qDbVgNLrUfyfdwHHqESzq.png',
]);

// 先检查是否已存在该产品
const [existing] = await conn.execute(
  "SELECT id FROM merchant_products WHERE name LIKE '%一根猪%' OR name LIKE '%大力水手%' LIMIT 3"
);
console.log('已存在的产品:', JSON.stringify(existing));

// 查找食品饮料分类ID
let categoryId = null;
const foodCat = cats.find(c => 
  c.name.includes('食品') || c.name.includes('健康') || c.name.includes('零食') || c.name.includes('饮料')
);
if (foodCat) {
  categoryId = foodCat.id;
  console.log('使用分类:', foodCat.name, 'ID:', categoryId);
}

// 检查pointsPrice字段是否存在
const hasPointsPrice = cols.some(c => c.Field === 'pointsPrice');
const hasInPointsShop = cols.some(c => c.Field === 'inPointsShop');
console.log('pointsPrice字段:', hasPointsPrice, '| inPointsShop字段:', hasInPointsShop);

const description = '高蛋白低脂猪肉条，含优质蛋白质，适合搭配新鲜蔬菜和全谷物食用，均衡营养。选自优质里脊肉，自然风干口感香嫩，小包装方便携带。\n\n配料：猪里脊肉、酱油、海藻糖、复合调味料、香辛料（辐照加工）、鸡精调味料\n净含量：68克 | 保质期：6个月\n储存方法：置于凉爽干燥处保存 | 食用方法：拆袋即食\n\n致敏原信息：本产品含有大豆制品';

if (existing.length > 0) {
  // 更新已有产品
  const productId = existing[0].id;
  console.log(`更新已有产品 ID=${productId}...`);
  
  let updateSql = 'UPDATE merchant_products SET mainImageUrl=?, imageUrls=?, description=?';
  const params = [mainImageUrl, detailImages, description];
  
  if (hasPointsPrice) {
    updateSql += ', pointsPrice=238';
  }
  if (hasInPointsShop) {
    updateSql += ', inPointsShop=1';
  }
  updateSql += ' WHERE id=?';
  params.push(productId);
  
  await conn.execute(updateSql, params);
  console.log(`✅ 产品 ID=${productId} 更新成功！`);
} else {
  // 插入新产品
  console.log('插入新产品...');
  
  // 构建动态字段
  const fields = ['name', 'subtitle', 'basePrice', 'originalPrice', 'mainImageUrl', 'imageUrls', 'status', 'stock', 'description', 'createdAt', 'updatedAt'];
  const values = ['大力水手 一根猪原味 68g', '4.5斤里脊≈1斤肉条 | 高蛋白质100g/64.3g | 盒装', 238, 23.8, mainImageUrl, detailImages, 'active', 999, description, new Date(), new Date()];
  
  if (categoryId) {
    fields.push('categoryId');
    values.push(categoryId);
  }
  if (hasPointsPrice) {
    fields.push('pointsPrice');
    values.push(238);
  }
  if (hasInPointsShop) {
    fields.push('inPointsShop');
    values.push(1);
  }
  
  const placeholders = fields.map(() => '?').join(', ');
  const sql = `INSERT INTO merchant_products (${fields.join(', ')}) VALUES (${placeholders})`;
  
  const [result] = await conn.execute(sql, values);
  console.log(`✅ 新产品插入成功！ID=${result.insertId}`);
}

await conn.end();
console.log('🎉 完成！产品已上架到积分商城（238积分）');
