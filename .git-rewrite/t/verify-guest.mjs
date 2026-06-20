import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;

console.log("连接Manus数据库...");
const connection = await mysql.createConnection(DATABASE_URL);

try {
  const [rows] = await connection.execute(
    "SELECT id, username, name, passwordHash FROM users WHERE username = ?",
    ["guest_dev"]
  );
  
  if (rows.length === 0) {
    console.log("❌ 游客用户不存在于Manus数据库");
  } else {
    console.log("✅ 找到游客用户:");
    console.log(JSON.stringify(rows[0], null, 2));
  }
} finally {
  await connection.end();
}
