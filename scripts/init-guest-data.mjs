/**
 * 游客数据初始化脚本
 * 在Manus临时数据库中创建游客用户和测试数据
 */
import { drizzle } from "drizzle-orm/mysql2";
import { users, contacts, ledgers, ledgerMembers, ledgerRecords, ledgerCategories } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

// 使用Manus临时数据库
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not found");
  process.exit(1);
}

console.log("🔗 连接到Manus临时数据库...");
const db = drizzle(DATABASE_URL);

const GUEST_USER_ID = 5070293;
const GUEST_USERNAME = "guest_dev";
const GUEST_PASSWORD = "guest123"; // 简单密码，仅用于开发

// 生成密码哈希（使用bcrypt，与登录验证保持一致）
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log("\n🚀 开始初始化游客数据...\n");

  // 1. 创建游客用户
  console.log("👤 创建游客用户...");
  const passwordHash = await hashPassword(GUEST_PASSWORD);
  
  try {
    // 先删除已存在的游客用户
    await db.delete(users).where(eq(users.id, GUEST_USER_ID));
    
    // 插入游客用户
    await db.insert(users).values({
      id: GUEST_USER_ID,
      username: GUEST_USERNAME,
      passwordHash: passwordHash,
      name: "游客体验账号",
      openId: `guest_${GUEST_USER_ID}`,
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=guest",
      createdAt: new Date().toISOString(),
      lastSignedIn: new Date().toISOString(),
    });
    console.log("✅ 游客用户创建成功");
  } catch (error) {
    console.error("❌ 创建游客用户失败:", error.message);
  }

  // 2. 创建测试人脉数据
  console.log("\n👥 创建测试人脉数据（50个）...");
  const contactNames = [
    "张伟", "李娜", "王芳", "刘洋", "陈静",
    "杨帆", "赵敏", "黄磊", "周杰", "吴彦祖",
    "郑爽", "孙俪", "朱茵", "林志玲", "范冰冰",
    "胡歌", "霍建华", "彭于晏", "陈坤", "邓超",
    "孙红雷", "黄渤", "王宝强", "徐峥", "沈腾",
    "贾玲", "宋丹丹", "赵本山", "小沈阳", "郭德纲",
    "于谦", "岳云鹏", "张云雷", "秦霄贤", "孟鹤堂",
    "周九良", "烧饼", "曹云金", "刘云天", "高峰",
    "栾云平", "张鹤伦", "郎鹤炎", "阎鹤祥", "孙越",
    "张国立", "陈道明", "唐国强", "李雪健", "陈宝国"
  ];

  const companies = ["阿里巴巴", "腾讯", "字节跳动", "百度", "美团", "京东", "拼多多", "小米", "华为", "网易"];
  const positions = ["CEO", "CTO", "产品经理", "技术总监", "市场总监", "销售经理", "设计师", "工程师", "运营经理", "HR经理"];
  const tags = ["重要客户", "合作伙伴", "老朋友", "同学", "同事", "亲戚", "邻居", "健身伙伴", "投资人", "创业者"];

  try {
    // 先删除已存在的测试人脉
    await db.delete(contacts).where(eq(contacts.parentUserId, GUEST_USER_ID));
    
    // 批量插入人脉
    const contactsData = contactNames.map((name, index) => ({
      parentUserId: GUEST_USER_ID,
      name: name,
      phone: `138${String(index).padStart(8, '0')}`,
      occupation: positions[index % positions.length],
      tags: [tags[index % tags.length], tags[(index + 1) % tags.length]],
      address: `${companies[index % companies.length]}公司`,
      createdAt: new Date(Date.now() - (50 - index) * 24 * 60 * 60 * 1000).toISOString(), // 过去50天内逐步添加
      updatedAt: new Date().toISOString(),
    }));

    await db.insert(contacts).values(contactsData);
    console.log(`✅ 成功创建 ${contactsData.length} 个测试人脉`);
  } catch (error) {
    console.error("❌ 创建测试人脉失败:", error.message);
  }

  // 3. 创建测试账本
  console.log("\n📚 创建测试账本（2个）...");
  try {
    // 先删除已存在的测试账本
    const existingLedgers = await db.select().from(ledgers).where(eq(ledgers.createdBy, GUEST_USER_ID));
    for (const ledger of existingLedgers) {
      await db.delete(ledgerMembers).where(eq(ledgerMembers.ledgerId, ledger.id));
      await db.delete(ledgerRecords).where(eq(ledgerRecords.ledgerId, ledger.id));
    }
    await db.delete(ledgers).where(eq(ledgers.createdBy, GUEST_USER_ID));

    // 创建家庭账本
    const [familyLedger] = await db.insert(ledgers).values({
      name: "家庭账本",
      type: "family",
      description: "记录家庭日常开支",
      createdBy: GUEST_USER_ID,
      ownerId: GUEST_USER_ID,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const familyLedgerId = familyLedger.insertId;

    // 添加成员
    await db.insert(ledgerMembers).values({
      ledgerId: familyLedgerId,
      userId: GUEST_USER_ID,
      role: "owner",
      memberType: "real",
      joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    console.log(`✅ 家庭账本创建成功 (ID: ${familyLedgerId})`);

    // 创建生意账本
    const [businessLedger] = await db.insert(ledgers).values({
      name: "生意账本",
      type: "business",
      description: "记录生意收支",
      createdBy: GUEST_USER_ID,
      ownerId: GUEST_USER_ID,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const businessLedgerId = businessLedger.insertId;

    // 添加成员
    await db.insert(ledgerMembers).values({
      ledgerId: businessLedgerId,
      userId: GUEST_USER_ID,
      role: "owner",
      memberType: "real",
      joinedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    });

    console.log(`✅ 生意账本创建成功 (ID: ${businessLedgerId})`);

    // 4. 创建测试记账记录
    console.log("\n💰 创建测试记账记录...");
    
    // 家庭账本记录
    const familyRecords = [
      { category: "餐饮", subcategory: "早餐", amount: -15.5, note: "早餐店" },
      { category: "交通", subcategory: "地铁", amount: -6, note: "上班通勤" },
      { category: "购物", subcategory: "日用品", amount: -128, note: "超市购物" },
      { category: "娱乐", subcategory: "电影", amount: -80, note: "周末看电影" },
      { category: "工资", subcategory: "月薪", amount: 15000, note: "1月工资" },
    ];

    for (let i = 0; i < familyRecords.length; i++) {
      const record = familyRecords[i];
      await db.insert(ledgerRecords).values({
        ledgerId: familyLedgerId,
        userId: GUEST_USER_ID,
        type: record.amount > 0 ? "income" : "expense",
        amount: Math.abs(record.amount),
        category: record.category,
        subcategory: record.subcategory,
        account: "微信钱包",
        note: record.note,
        recordDate: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    console.log(`✅ 家庭账本记录创建成功 (${familyRecords.length} 条)`);

    // 生意账本记录
    const businessRecords = [
      { category: "收入", subcategory: "销售收入", amount: 50000, note: "本月销售额" },
      { category: "成本", subcategory: "采购成本", amount: -30000, note: "进货成本" },
      { category: "费用", subcategory: "房租", amount: -8000, note: "店铺租金" },
      { category: "费用", subcategory: "工资", amount: -12000, note: "员工工资" },
    ];

    for (let i = 0; i < businessRecords.length; i++) {
      const record = businessRecords[i];
      await db.insert(ledgerRecords).values({
        ledgerId: businessLedgerId,
        userId: GUEST_USER_ID,
        type: record.amount > 0 ? "income" : "expense",
        amount: Math.abs(record.amount),
        category: record.category,
        subcategory: record.subcategory,
        account: "银行转账",
        note: record.note,
        recordDate: new Date(Date.now() - (4 - i) * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - (4 - i) * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    console.log(`✅ 生意账本记录创建成功 (${businessRecords.length} 条)`);

  } catch (error) {
    console.error("❌ 创建测试账本失败:", error.message);
  }

  console.log("\n✨ 游客数据初始化完成！\n");
  console.log("📋 游客账号信息：");
  console.log(`   用户名: ${GUEST_USERNAME}`);
  console.log(`   密码: ${GUEST_PASSWORD}`);
  console.log(`   用户ID: ${GUEST_USER_ID}`);
  console.log(`   人脉数量: 50个`);
  console.log(`   账本数量: 2个`);
  console.log("\n💡 在登录页面长按logo 2秒即可自动登录游客账号\n");

  process.exit(0);
}

main().catch((error) => {
  console.error("❌ 初始化失败:", error);
  process.exit(1);
});
