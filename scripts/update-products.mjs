/**
 * 更新奢贝美容院商品数据
 * - 将原有红立方商品改为"细胞焕能红光养护"系列
 * - 新增5个套餐：398/次、499/3次、2999季卡、10000年卡、30000年度私定
 * 运行: node scripts/update-products.mjs
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌ 未找到 DATABASE_URL 环境变量");
  process.exit(1);
}

const connection = await mysql.createConnection({
  uri: DB_URL,
  ssl: { rejectUnauthorized: false },
  charset: "utf8mb4",
});

console.log("✅ 数据库连接成功");

// 压缩后的图片CDN地址
const CDN = {
  hero: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_hero_92ec7df5.jpg",
  interiorGlow: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_interior-glow_85c7e788.jpg",
  lifestyleWoman: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_lifestyle-woman_6ce2894a.jpg",
  lifestyle: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_lifestyle_acf1f032.jpg",
  heroOld: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_hero-old_0b3dfbfe.jpg",
  yuanqiCover: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/yuanqi-huanhuo-cover-SNnALrhSqxwtzkGk6z9jN8.webp",
};

// 查询现有品牌和分类
const [brands] = await connection.execute("SELECT id, name FROM beauty_brands ORDER BY id");
const [categories] = await connection.execute("SELECT id, name FROM beauty_product_categories ORDER BY id");
const [existingProducts] = await connection.execute("SELECT id, name FROM beauty_products ORDER BY id");

console.log("\n📦 现有品牌:", JSON.stringify(brands));
console.log("📂 现有分类:", JSON.stringify(categories));
console.log("🛍️  现有商品:", JSON.stringify(existingProducts));

// 确保品牌存在
let brandId;
const existingBrand = brands.find(b => b.name.includes("IDEALIGHT") || b.name.includes("爱达光") || b.name.includes("奢贝"));
if (existingBrand) {
  brandId = existingBrand.id;
  console.log(`\n✅ 品牌已存在: ${existingBrand.name} (id=${brandId})`);
} else {
  const [result] = await connection.execute(
    `INSERT INTO beauty_brands (name, description, logo_url, banner_url, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, 1, 0, NOW(), NOW())`,
    ["奢贝美容院", "专注高端健康养护，为您提供专业、私密、个性化的养护服务"]
  );
  brandId = result.insertId;
  console.log(`\n✅ 品牌已创建: 奢贝美容院 (id=${brandId})`);
}

// 确保分类存在
let categoryId;
const existingCat = categories.find(c => c.name.includes("健康") || c.name.includes("养护"));
if (existingCat) {
  categoryId = existingCat.id;
  console.log(`✅ 分类已存在: ${existingCat.name} (id=${categoryId})`);
} else {
  const [result] = await connection.execute(
    `INSERT INTO beauty_product_categories (name, type, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, 1, 0, NOW(), NOW())`,
    ["红光养护", "health"]
  );
  categoryId = result.insertId;
  console.log(`✅ 分类已创建: 红光养护 (id=${categoryId})`);
}

// 删除旧商品（红立方光焕能舱）
const oldProduct = existingProducts.find(p => p.name.includes("红立方") || p.name.includes("光焕能舱"));
if (oldProduct) {
  await connection.execute("DELETE FROM beauty_products WHERE id = ?", [oldProduct.id]);
  console.log(`\n🗑️  已删除旧商品: ${oldProduct.name} (id=${oldProduct.id})`);
}

// 新商品数据
const newProducts = [
  {
    name: "细胞焕能红光养护 · 单次体验",
    price: "398.00",
    imageUrl: CDN.interiorGlow,
    specification: "单次 · 30分钟",
    sortOrder: 1,
    description: `细胞焕能红光养护 | 单次体验 30分钟

【适合人群】
想要初次体验红光养护效果，或偶尔调理身体状态的朋友。

【服务内容】
专业红光舱单次30分钟养护，全身360°环绕照射，激活细胞活力。

【六大核心功效】
1. 焕活身体活力，提升精气神
2. 促进身体循环，周身舒畅
3. 温和排浊，身体更轻松
4. 舒缓身心，提升睡眠质量
5. 焕亮肌肤状态，透出好气色
6. 调理身体状态，体质更稳定

【科学原理】
红光波长630–680nm，属于生物活性光，可安全穿透皮下8–10mm，激活细胞线粒体产生ATP（细胞能量），促进一氧化氮（NO）释放，改善微循环。`,
  },
  {
    name: "细胞焕能红光养护 · 三次套餐",
    price: "499.00",
    imageUrl: CDN.hero,
    specification: "3次 · 每次30分钟",
    sortOrder: 2,
    description: `细胞焕能红光养护 | 三次套餐

【适合人群】
希望持续体验红光养护效果，感受身体逐步改善的朋友。

【服务内容】
专业红光舱3次养护，每次30分钟，全身360°环绕照射，连续养护效果更佳。

【六大核心功效】
1. 焕活身体活力，提升精气神
2. 促进身体循环，周身舒畅
3. 温和排浊，身体更轻松
4. 舒缓身心，提升睡眠质量
5. 焕亮肌肤状态，透出好气色
6. 调理身体状态，体质更稳定

【科学原理】
红光波长630–680nm，属于生物活性光，可安全穿透皮下8–10mm，激活细胞线粒体产生ATP（细胞能量），促进一氧化氮（NO）释放，改善微循环。`,
  },
  {
    name: "细胞焕能红光养护 · 季卡",
    price: "2999.00",
    imageUrl: CDN.lifestyleWoman,
    specification: "季卡 · 3个月无限次",
    sortOrder: 3,
    description: `细胞焕能红光养护 | 季卡（3个月）

【适合人群】
注重身体健康管理，希望通过系统性红光养护改善体质的朋友。

【服务内容】
3个月内无限次享受专业红光舱养护服务，每次30分钟，持续改善身体状态。

【六大核心功效】
1. 焕活身体活力，提升精气神
2. 促进身体循环，周身舒畅
3. 温和排浊，身体更轻松
4. 舒缓身心，提升睡眠质量
5. 焕亮肌肤状态，透出好气色
6. 调理身体状态，体质更稳定`,
  },
  {
    name: "细胞焕能红光养护 · 年卡",
    price: "10000.00",
    imageUrl: CDN.lifestyle,
    specification: "年卡 · 一年内无限次",
    sortOrder: 4,
    description: `细胞焕能红光养护 | 年卡（一年内无限次）

【适合人群】
将健康养护纳入日常生活，追求长期体质改善的朋友。

【服务内容】
一年内无限次享受专业红光舱养护服务，每次30分钟，全年陪伴您的健康之旅。

【六大核心功效】
1. 焕活身体活力，提升精气神
2. 促进身体循环，周身舒畅
3. 温和排浊，身体更轻松
4. 舒缓身心，提升睡眠质量
5. 焕亮肌肤状态，透出好气色
6. 调理身体状态，体质更稳定`,
  },
  {
    name: "元气焕活年度私定养护",
    price: "30000.00",
    imageUrl: CDN.yuanqiCover,
    specification: "年度私定 · 一年内无限次",
    sortOrder: 5,
    description: `元气焕活年度私定养护 | 顶级私人定制

清·通·补三步自然养护，给身体一场温柔的焕新之旅。

【服务理念】
遵循中国传统养生智慧，结合现代科技，为您量身定制专属养护方案。
"清"——清除身体积累的浊气与湿邪
"通"——疏通经络，促进气血顺畅运行
"补"——补充身体所需能量，恢复元气

【服务内容】
一年内无限次私定养护服务，包含：
· 专属健康档案建立与跟踪
· 个性化养护方案定制
· 专业养护师一对一服务
· 全套综合养护项目（含红光、经络、芳疗等）
· 定期健康回访与方案调整

【适合人群】
追求高品质生活，注重全方位身心健康管理的贵宾客户。`,
  },
];

// 插入新商品
for (const p of newProducts) {
  // 检查是否已存在
  const existing = existingProducts.find(ep => ep.name === p.name);
  if (existing) {
    // 更新
    await connection.execute(
      `UPDATE beauty_products SET description=?, price=?, image_url=?, brand_id=?, category_id=?, specification=?, sort_order=?, updated_at=NOW() WHERE id=?`,
      [p.description, p.price, p.imageUrl, brandId, categoryId, p.specification, p.sortOrder, existing.id]
    );
    console.log(`✏️  已更新: ${p.name} (id=${existing.id})`);
  } else {
    const [result] = await connection.execute(
      `INSERT INTO beauty_products (name, description, price, image_url, brand_id, category_id, specification, stock, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 999, 1, ?, NOW(), NOW())`,
      [p.name, p.description, p.price, p.imageUrl, brandId, categoryId, p.specification, p.sortOrder]
    );
    console.log(`✅ 已插入: ${p.name} (id=${result.insertId})`);
  }
}

await connection.end();
console.log("\n🎉 商品数据更新完成！");
