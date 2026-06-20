import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set");
  process.exit(1);
}

async function initContactFieldCategories() {
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection, { schema, mode: "default" });

  console.log("🚀 开始初始化人脉扩展信息字段分类...");

  // 默认字段分类
  const defaultCategories = [
    { name: "公司", fieldType: "text", sortOrder: 1, isRequired: false },
    { name: "职位", fieldType: "text", sortOrder: 2, isRequired: false },
    { name: "行业", fieldType: "text", sortOrder: 3, isRequired: false },
    { name: "学历", fieldType: "select", options: ["高中", "大专", "本科", "硕士", "博士"], sortOrder: 4, isRequired: false },
    { name: "毕业院校", fieldType: "text", sortOrder: 5, isRequired: false },
    { name: "专业", fieldType: "text", sortOrder: 6, isRequired: false },
    { name: "兴趣爱好", fieldType: "text", sortOrder: 7, isRequired: false },
    { name: "备注", fieldType: "text", sortOrder: 8, isRequired: false },
  ];

  // 查询所有家长用户
  const parents = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(schema.sql`role IN ('parent', 'super_admin')`);

  console.log(`📊 找到 ${parents.length} 个家长用户`);

  // 为每个家长用户创建默认字段分类
  for (const parent of parents) {
    console.log(`\n👤 为用户 ${parent.id} 创建字段分类...`);
    
    for (const category of defaultCategories) {
      await db.insert(schema.contactFieldCategories).values({
        parentUserId: parent.id,
        name: category.name,
        fieldType: category.fieldType,
        options: category.options || null,
        sortOrder: category.sortOrder,
        isRequired: category.isRequired,
      });
      console.log(`  ✅ 创建字段分类: ${category.name}`);
    }
  }

  console.log("\n✅ 初始化完成！");
  await connection.end();
}

initContactFieldCategories().catch((error) => {
  console.error("❌ 初始化失败:", error);
  process.exit(1);
});
