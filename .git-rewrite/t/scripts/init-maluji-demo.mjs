/**
 * 初始化麻六记AB演示账本
 * 创建：1个演示账本 + 10家北京门店 + 300条模拟点评
 * 运行: node scripts/init-maluji-demo.mjs
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DB_URL = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
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

// ========== 配置 ==========
const MALUJI_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/maluji-logo_40f7da5d.png";
const DEMO_LEDGER_NAME = "麻六记·北京区域意见簿";
const DEMO_LEDGER_DESC = "麻六记北京区域顾客意见收集平台（演示账本）";

// 查找jiang用户（super_admin）
const [userRows] = await connection.execute(
  `SELECT id FROM users WHERE role='super_admin' LIMIT 1`
);
if (!userRows.length) {
  console.error("❌ 未找到管理员用户");
  process.exit(1);
}
const ownerId = userRows[0].id;
console.log(`✅ 找到管理员用户 ID: ${ownerId}`);

// ========== 1. 检查是否已存在演示账本 ==========
const [existingRows] = await connection.execute(
  `SELECT id FROM ledgers WHERE name=? AND type='opinion_book_demo' LIMIT 1`,
  [DEMO_LEDGER_NAME]
);

let ledgerId;
if (existingRows.length > 0) {
  ledgerId = existingRows[0].id;
  console.log(`✅ 演示账本已存在，ID: ${ledgerId}，跳过创建`);
} else {
  // ========== 2. 创建演示账本 ==========
  const [result] = await connection.execute(
    `INSERT INTO ledgers (name, description, type, currency, icon, createdBy, ownerId, isVip, isArchived)
     VALUES (?, ?, 'opinion_book_demo', 'CNY', ?, ?, ?, 0, 0)`,
    [DEMO_LEDGER_NAME, DEMO_LEDGER_DESC, MALUJI_LOGO, ownerId, ownerId]
  );
  ledgerId = result.insertId;
  console.log(`✅ 创建演示账本成功，ID: ${ledgerId}`);

  // 将创建者加入成员
  await connection.execute(
    `INSERT INTO ledger_members (ledgerId, userId, role, memberType, nickname, permissionView, permissionAdd, permissionEdit, permissionDelete, canEdit, canDelete, canInvite)
     VALUES (?, ?, 'owner', 'real', '麻六记管理员', 'all', 'all', 'all', 'all', 1, 1, 1)`,
    [ledgerId, ownerId]
  );
  console.log(`✅ 已将管理员加入账本成员`);
}

// ========== 3. 创建10家北京门店 ==========
const BEIJING_BRANCHES = [
  { name: "国贸商城店", address: "朝阳区建国门外大街1号国贸商城北区四层" },
  { name: "银泰中心店", address: "朝阳区建国门外大街2号银泰中心in01地下1层" },
  { name: "金融街店", address: "西城区金城坊街2号金融街购物中心1期L2层" },
  { name: "王府井APM店", address: "东城区王府井大街138号APM购物中心" },
  { name: "三里屯太古里店", address: "朝阳区三里屯路19号太古里南区L1层" },
  { name: "望京华彩店", address: "朝阳区望京街10号华彩购物中心3层" },
  { name: "中关村欧美汇店", address: "海淀区丹棱街1号欧美汇购物中心4层" },
  { name: "西单大悦城店", address: "西城区西单北大街131号大悦城7层" },
  { name: "朝阳大悦城店", address: "朝阳区朝阳北路101号朝阳大悦城5层" },
  { name: "来广营环宇汇店", address: "朝阳区来广营西路66号环宇汇购物中心3层" },
];

const branchIds = [];
for (let i = 0; i < BEIJING_BRANCHES.length; i++) {
  const branch = BEIJING_BRANCHES[i];
  // 检查是否已存在
  const [existBranch] = await connection.execute(
    `SELECT id FROM ledger_categories WHERE ledgerId=? AND name=? LIMIT 1`,
    [ledgerId, branch.name]
  );
  if (existBranch.length > 0) {
    branchIds.push(existBranch[0].id);
    console.log(`  ✅ 门店已存在: ${branch.name} (ID: ${existBranch[0].id})`);
  } else {
    const [res] = await connection.execute(
      `INSERT INTO ledger_categories (ledgerId, name, type, icon, color, isDefault, sortOrder)
       VALUES (?, ?, 'expense', '🏪', '#E8472A', 0, ?)`,
      [ledgerId, branch.name, i + 1]
    );
    branchIds.push(res.insertId);
    console.log(`  ✅ 创建门店: ${branch.name} (ID: ${res.insertId})`);
  }
}
console.log(`✅ 10家门店创建完成`);

// ========== 4. 检查是否已有点评数据 ==========
const [countRows] = await connection.execute(
  `SELECT COUNT(*) as cnt FROM ledger_records WHERE ledgerId=? AND type='expense'`,
  [ledgerId]
);
const existingCount = countRows[0].cnt;
if (existingCount >= 300) {
  console.log(`✅ 已有 ${existingCount} 条点评数据，跳过创建`);
  await connection.end();
  console.log("\n🎉 演示账本初始化完成！");
  console.log(`📌 账本ID: ${ledgerId}`);
  console.log(`🔗 演示链接: /demo/opinion/${ledgerId}`);
  process.exit(0);
}

// ========== 5. 生成300条模拟点评 ==========
// 各维度的点评模板
const POSITIVE_COMMENTS = [
  "菜品口味非常好，麻辣鲜香，层次丰富，下次还会来！",
  "服务员态度很好，上菜速度快，整体体验很满意。",
  "环境干净整洁，装修有特色，适合朋友聚餐。",
  "酸辣粉真的很好吃，汤底浓郁，分量也足。",
  "性价比很高，味道正宗，是我吃过最好的川菜之一。",
  "店员很热情，推荐了几道招牌菜，都非常好吃。",
  "食材新鲜，火候到位，麻辣程度可以自选，很贴心。",
  "位置很好找，停车方便，下次带家人来。",
  "招牌夫妻肺片超级好吃，红油拌得很均匀。",
  "整体体验超出预期，强烈推荐给喜欢川菜的朋友！",
  "点了套餐，量很足，两个人吃很划算。",
  "装修很有川渝风格，拍照很好看，朋友圈发了很多赞。",
  "辣度可以调节，非常适合不太能吃辣的朋友。",
  "外卖包装也很用心，送到家还是热的。",
  "老板很亲切，会主动询问口味偏好。",
];

const NEGATIVE_COMMENTS = [
  "等位时间有点长，希望能优化一下叫号系统。",
  "菜品口味偏咸，建议减少盐的用量。",
  "服务员有点忙，叫了几次才来，希望增加人手。",
  "空调温度有点低，坐久了有点冷，建议调高一点。",
  "停车位不够，找了很久才停好车。",
  "菜品上桌速度有点慢，等了将近20分钟。",
  "分量稍微少了一点，建议加量或者降价。",
  "有一道菜的食材不太新鲜，希望加强食材管理。",
  "结账时排队时间较长，建议增加收银台或支持自助结账。",
  "噪音有点大，用餐体验稍受影响。",
  "菜单更新不够及时，有几道菜已经下架但还在菜单上。",
  "餐具有一个有点脏，希望加强清洗质量。",
  "辣度标注不够准确，点了微辣但实际很辣。",
  "桌子间距有点小，坐着有点拥挤。",
  "希望增加一些非辣菜品，方便不能吃辣的顾客。",
];

const NEUTRAL_COMMENTS = [
  "整体还不错，就是价格稍微贵了一点。",
  "口味中规中矩，没有特别惊艳但也不差。",
  "环境一般，但菜品质量还可以。",
  "第一次来，还在适应口味，下次再来试试其他菜。",
  "朋友推荐来的，感觉和预期差不多。",
  "性价比一般，但胜在位置方便。",
  "味道还行，就是等位时间有点长。",
  "菜品种类丰富，但有几道菜口味一般。",
  "服务态度还不错，但上菜速度可以再快一点。",
  "整体来说是一次还算满意的用餐体验。",
];

const GUEST_NAMES = [
  "张先生", "李女士", "王先生", "赵女士", "陈先生",
  "刘女士", "杨先生", "黄女士", "周先生", "吴女士",
  "徐先生", "孙女士", "马先生", "朱女士", "胡先生",
  "郭女士", "何先生", "高女士", "林先生", "郑女士",
  "匿名顾客", "路过的食客", "常客", "第一次来", "老顾客",
];

// 生成随机日期（过去90天内）
function randomDate() {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 90);
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString().split('T')[0];
}

// 生成随机评分（偏向正面）
function randomRating() {
  const rand = Math.random();
  if (rand < 0.45) return 5;
  if (rand < 0.70) return 4;
  if (rand < 0.85) return 3;
  if (rand < 0.95) return 2;
  return 1;
}

// 根据评分选择评论
function randomComment(rating) {
  if (rating >= 4) {
    return POSITIVE_COMMENTS[Math.floor(Math.random() * POSITIVE_COMMENTS.length)];
  } else if (rating === 3) {
    return NEUTRAL_COMMENTS[Math.floor(Math.random() * NEUTRAL_COMMENTS.length)];
  } else {
    return NEGATIVE_COMMENTS[Math.floor(Math.random() * NEGATIVE_COMMENTS.length)];
  }
}

console.log(`\n📝 开始插入300条模拟点评...`);
let insertCount = 0;

for (let i = 0; i < branchIds.length; i++) {
  const branchId = branchIds[i];
  const branchName = BEIJING_BRANCHES[i].name;
  
  for (let j = 0; j < 30; j++) {
    const rating = randomRating();
    const content = randomComment(rating);
    const guestName = GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)];
    const recordDate = randomDate();
    
    await connection.execute(
      `INSERT INTO ledger_records (ledgerId, type, amount, categoryId, description, recordDate, createdBy, rating, guest_name, guest_wechat, guest_ip, is_read)
       VALUES (?, 'expense', '0.00', ?, ?, ?, 0, ?, ?, NULL, NULL, 0)`,
      [ledgerId, branchId, content, recordDate, rating, guestName]
    );
    insertCount++;
  }
  console.log(`  ✅ ${branchName}: 已插入30条点评`);
}

console.log(`\n✅ 共插入 ${insertCount} 条模拟点评`);

await connection.end();
console.log("\n🎉 演示账本初始化完成！");
console.log(`📌 账本ID: ${ledgerId}`);
console.log(`🔗 演示链接: /demo/opinion/${ledgerId}`);
console.log(`🖼️  Logo: ${MALUJI_LOGO}`);
