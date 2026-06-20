import { drizzle } from "drizzle-orm/mysql2";
import { users } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;

console.log('DATABASE_URL配置:', DATABASE_URL ? '已设置' : '未设置');
console.log('\n创建drizzle实例...');

const db = drizzle(DATABASE_URL);
console.log('✅ drizzle实例创建成功');

console.log('\n尝试查询users表...');
try {
  const result = await db.select().from(users).where(eq(users.username, 'guest_dev')).limit(1);
  console.log('✅ 查询成功!');
  console.log('结果:', result.length > 0 ? `找到用户: ${result[0].username}` : '未找到用户');
} catch (error) {
  console.log('❌ 查询失败:', error.message);
}
