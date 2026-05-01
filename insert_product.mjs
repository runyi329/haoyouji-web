import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// 读取环境变量
dotenv.config({ path: '/home/ubuntu/haoyouji-full/.env' });

const dbUrl = process.env.ORIGINAL_DATABASE_URL || 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';
console.log('Using DB:', dbUrl.replace(/\/\/.*:.*@/, '//***:***@'));

const conn = await mysql.createConnection(dbUrl);

// 1. 查询现有分类
const [categories] = await conn.execute('SELECT id, name FROM merchant_product_categories WHERE isActive=1 ORDER BY sortOrder LIMIT 20');
console.log('现有分类:', JSON.stringify(categories, null, 2));

// 2. 查找"健康食品"分类
let healthCategoryId = null;
for (const cat of categories) {
  if (cat.name && (cat.name.includes('健康') || cat.name.includes('食品') || cat.name.includes('零食') || cat.name.includes('肉'))) {
    healthCategoryId = cat.id;
    console.log('找到分类:', cat.name, 'ID:', cat.id);
    break;
  }
}

if (!healthCategoryId) {
  console.log('未找到健康食品分类，使用第一个分类ID:', categories[0]?.id);
  healthCategoryId = categories[0]?.id || null;
}

// 3. CDN图片URLs（从截图上传的）
// IMG_9651 = 主图（产品+包装盒）
// IMG_9655 = 详情图1（原味风干猪里脊 优质高蛋白 banner）
// IMG_9656 = 详情图2（高蛋白 解馋的同时补营养）
// IMG_9657 = 详情图3（干净配料 每一口都是放心滋味 + 配料表）
// IMG_9658 = 详情图4（从原料到配料 我们都很认真 + 营养成分表）
const mainImageUrl = 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/lUEaSvqsBkcfJGZT.PNG';
const imageUrls = JSON.stringify([
  mainImageUrl,
  'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/EhmbdOZAnUPtipyL.PNG',
  'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/PFNqGbmZIssbNMiU.PNG',
  'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/yCTHggmNPScfkYXK.PNG',
  'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/DANeGhHXmfhiBbtl.PNG',
]);

// 4. 插入产品
const [result] = await conn.execute(
  `INSERT INTO merchant_products 
    (name, subtitle, description, mainImageUrl, imageUrls, basePrice, originalPrice, 
     categoryId, status, sourceType, isShareable, inPointsShop, pointsPrice, stock, salesCount, sortOrder, createdAt, updatedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'platform', 1, 1, ?, 999, 0, 0, NOW(), NOW())`,
  [
    '大力水手 一根猪原味 68g',
    '4.5斤里脊≈1斤肉条 | 高蛋白质100g/64.3g | 盒装',
    '低温烘烤工艺，健康非油炸，只用原切里脊肉，脂肪含量低、高蛋白，4.5斤原切猪里脊肉约等于1斤猪肉条。高蛋白低脂猪肉条，含优质蛋白质，适合搭配新鲜蔬菜和全谷物食用，均衡营养。选自优质里脊肉，自然风干口感香嫩，小包装方便携带。\n\n配料：猪里脊肉、酱油、海藻糖、复合调味料、香辛料（辐照加工）、鸡精调味料\n净含量：68克\n产品标准号：Q/ZWSX0005S\n生产许可证编号：SC10435062700051\n加工方式：热加工\n贮存方法：置于凉爽干燥处保存\n保质期：6个月',
    mainImageUrl,
    imageUrls,
    '23.80',
    '29.90',
    healthCategoryId,
    238,
  ]
);

console.log('产品插入成功！产品ID:', result.insertId);

await conn.end();
process.exit(0);
