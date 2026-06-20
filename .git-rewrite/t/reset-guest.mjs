import { drizzle } from "drizzle-orm/mysql2";
import { users } from "./drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const DATABASE_URL = process.env.DATABASE_URL;
const db = drizzle(DATABASE_URL);

const GUEST_USER_ID = 5070293;
const GUEST_USERNAME = "guest_dev";
const GUEST_PASSWORD = "guest123";

console.log("🔄 重置游客用户...\n");

// 生成bcrypt密码哈希
console.log("生成密码哈希...");
const passwordHash = await bcrypt.hash(GUEST_PASSWORD, 10);
console.log("密码哈希:", passwordHash);

// 删除旧的游客用户
console.log("\n删除旧用户...");
await db.delete(users).where(eq(users.id, GUEST_USER_ID));

// 创建新的游客用户
console.log("创建新用户...");
await db.insert(users).values({
  id: GUEST_USER_ID,
  openId: `guest_${GUEST_USER_ID}`,
  username: GUEST_USERNAME,
  passwordHash: passwordHash,
  name: "游客体验账号",
  role: "parent",
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=guest",
  points: 0,
  sharingEnabled: 0,
  isLocked: 0,
  failedLoginAttempts: 0,
});

// 验证
console.log("\n验证用户创建...");
const [user] = await db.select().from(users).where(eq(users.username, GUEST_USERNAME));

if (user) {
  console.log("✅ 游客用户创建成功!");
  console.log("   ID:", user.id);
  console.log("   用户名:", user.username);
  console.log("   姓名:", user.name);
  
  // 测试密码验证
  console.log("\n测试密码验证...");
  const isValid = await bcrypt.compare(GUEST_PASSWORD, user.passwordHash);
  console.log("   密码验证:", isValid ? "✅ 成功" : "❌ 失败");
} else {
  console.log("❌ 用户创建失败");
}

process.exit(0);
