import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;

console.log("=== 测试查询游客用户 ===\n");
console.log("DATABASE_URL:", DATABASE_URL.split('@')[1]);

const connection = await mysql.createConnection(DATABASE_URL);

try {
  const [rows] = await connection.execute(
    "SELECT id, username, name FROM users WHERE username = ?",
    ["guest_dev"]
  );
  
  if (rows.length === 0) {
    console.log("\n❌ 未找到游客用户");
  } else {
    console.log("\n✅ 找到游客用户:");
    console.log("ID:", rows[0].id);
    console.log("用户名:", rows[0].username);
    console.log("姓名:", rows[0].name);
  }
} catch (error) {
  console.log("\n❌ 查询失败:", error.message);
} finally {
  await connection.end();
}
