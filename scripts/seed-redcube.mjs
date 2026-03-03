/**
 * 插入红立方光焕能舱商品数据到奢呗商城
 * 运行: node scripts/seed-redcube.mjs
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

// ========== 1. 查询现有品牌和分类 ==========
const [brands] = await connection.execute("SELECT id, name FROM beauty_brands ORDER BY id");
const [categories] = await connection.execute("SELECT id, name, type FROM beauty_product_categories ORDER BY id");
const [products] = await connection.execute("SELECT id, name FROM beauty_products ORDER BY id");

console.log("\n📦 现有品牌:", JSON.stringify(brands));
console.log("📂 现有分类:", JSON.stringify(categories));
console.log("🛍️  现有商品:", JSON.stringify(products));

// ========== 2. 确保品牌存在：IDEALIGHT ==========
let brandId;
const existingBrand = brands.find(b => b.name === "IDEALIGHT" || b.name === "爱达光");
if (existingBrand) {
  brandId = existingBrand.id;
  console.log(`\n✅ 品牌已存在: ${existingBrand.name} (id=${brandId})`);
} else {
  const [result] = await connection.execute(
    `INSERT INTO beauty_brands (name, description, logo_url, banner_url, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, 1, 0, NOW(), NOW())`,
    [
      "IDEALIGHT",
      "上海佰时特健康科技有限公司旗下品牌，专注红光生物光疗设备研发，产品通过国家CMA计量认证与CNAS实验室认证。"
    ]
  );
  brandId = result.insertId;
  console.log(`\n✅ 品牌已创建: IDEALIGHT (id=${brandId})`);
}

// ========== 3. 确保分类存在：健康仪器 ==========
let categoryId;
const existingCat = categories.find(c => c.name === "健康仪器" || c.name === "健康设备" || c.type === "health");
if (existingCat) {
  categoryId = existingCat.id;
  console.log(`✅ 分类已存在: ${existingCat.name} (id=${categoryId})`);
} else {
  const [result] = await connection.execute(
    `INSERT INTO beauty_product_categories (name, type, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, 1, 0, NOW(), NOW())`,
    ["健康仪器", "health"]
  );
  categoryId = result.insertId;
  console.log(`✅ 分类已创建: 健康仪器 (id=${categoryId})`);
}

// ========== 4. 检查商品是否已存在 ==========
const existingProduct = products.find(p => p.name.includes("红立方") || p.name.includes("光焕能舱"));
if (existingProduct) {
  console.log(`\n⚠️  商品已存在: ${existingProduct.name} (id=${existingProduct.id})，跳过插入`);
  await connection.end();
  process.exit(0);
}

// ========== 5. 插入商品 ==========
const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/redcube-hero_f052e330.jpg";

const description = `红立方光焕能舱 | 给身体充能

【产品亮点】
精准黄金波长 · 超大能量密度 · 网络远程监控 · 智能恒温保护
定时时间控制 · 两档速度选择 · 智能语音提示 · 独立新风系统

【六大核心功效】
1. 焕活身体活力，提升精气神——温和唤醒身体能量，让人更有精神、不易疲惫
2. 促进身体循环，周身舒畅——助力气血顺畅运行，改善身体发沉、手脚易凉的状态
3. 温和排浊，身体更轻松——微微出汗，帮助代谢多余湿气与浊物，体感轻盈舒适
4. 舒缓身心，提升睡眠质量——放松神经，帮助睡得更安稳，晨起更有活力
5. 焕亮肌肤状态，透出好气色——温和养护肌肤，让肤色更透亮、肤质更细腻
6. 调理身体状态，体质更稳定——长期坚持，帮助身体保持良好状态，日常更有活力

【科学原理】
红光波长630–680nm，属于生物活性光，可安全穿透皮下8–10mm，激活细胞线粒体产生ATP（细胞能量），促进一氧化氮（NO）释放，改善微循环。

【产品规格】
型号：RQ-22 | 品牌：IDEALIGHT | 生产商：上海佰时特健康科技有限公司
检测标准：GB 4706.1-2005 | 检测结论：合格品 | 报告编号：W02414500335

【认证资质】CMA计量认证 · CNAS实验室认证 · 国际互认资质`;

const [insertResult] = await connection.execute(
  `INSERT INTO beauty_products (name, description, price, image_url, brand_id, category_id, specification, stock, is_active, sort_order, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
  [
    "红立方光焕能舱",
    description,
    "30000.00",
    HERO_IMG,
    brandId,
    categoryId,
    "型号 RQ-22",
    99
  ]
);

console.log(`\n🎉 商品插入成功！id=${insertResult.insertId}`);
console.log(`   名称：红立方光焕能舱`);
console.log(`   价格：¥30,000`);
console.log(`   品牌ID：${brandId} | 分类ID：${categoryId}`);

await connection.end();
console.log("\n✅ 完成，数据库连接已关闭");
