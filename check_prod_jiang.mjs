import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users } from "./drizzle/schema.ts";

const dbUrl = process.env.ORIGINAL_DATABASE_URL;
console.log("连接到腾讯云数据库:", dbUrl?.substring(0, 50) + "...");

const db = drizzle(dbUrl);

// 查询jiang用户
const jiangUser = await db.select().from(users).where(eq(users.username, "jiang"));

console.log("\njiang用户信息:");
console.log(JSON.stringify(jiangUser, null, 2));

if (jiangUser.length > 0) {
  const user = jiangUser[0];
  console.log("\n关键信息:");
  console.log("- ID:", user.id);
  console.log("- 用户名:", user.username);
  console.log("- 姓名:", user.name);
  console.log("- 密码哈希:", user.passwordHash?.substring(0, 20) + "...");
  console.log("- 创建时间:", user.createdAt);
  console.log("- 最后登录:", user.lastSignedIn);
}

process.exit(0);
