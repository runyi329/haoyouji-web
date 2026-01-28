import { drizzle } from "drizzle-orm/mysql2";
import { users } from "./drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const DATABASE_URL = process.env.DATABASE_URL;
const db = drizzle(DATABASE_URL);

// 查询游客用户
const [guestUser] = await db.select().from(users).where(eq(users.username, "guest_dev"));

if (!guestUser) {
  console.log("❌ 游客用户不存在");
  process.exit(1);
}

console.log("✅ 找到游客用户");
console.log("用户名:", guestUser.username);
console.log("密码哈希:", guestUser.passwordHash);

// 测试密码验证
const password = "guest123";
const isValid = await bcrypt.compare(password, guestUser.passwordHash);

console.log("\n密码验证结果:", isValid ? "✅ 成功" : "❌ 失败");

// 生成新的哈希对比
const newHash = await bcrypt.hash(password, 10);
console.log("\n新生成的哈希:", newHash);
console.log("数据库中的哈希:", guestUser.passwordHash);
