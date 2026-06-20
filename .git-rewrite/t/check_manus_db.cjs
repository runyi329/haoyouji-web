const mysql2 = require("mysql2/promise");

// Manus 临时数据库（DATABASE_URL）
const DB_URL = "mysql://CmANhgd4s9xTPkw.1c1bc8175aba:QPhwlU294mor1bZak1X8@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/cSuKEEZ8CGmJveg8PVZXzb?ssl=%7B%22rejectUnauthorized%22%3Atrue%7D";

async function main() {
  const url = new URL(DB_URL.replace('mysql://', 'http://'));
  const conn = await mysql2.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });

  console.log("=== 连接成功 ===");

  // 查所有表
  const [tables] = await conn.execute("SHOW TABLES");
  console.log("\n=== 所有表 ===");
  console.log(JSON.stringify(tables, null, 2));

  // 查 memo_items
  try {
    const [rows] = await conn.execute("SELECT id, ledgerId, userId, category, title, note, createdAt FROM memo_items ORDER BY id DESC LIMIT 20");
    console.log("\n=== memo_items 数据 ===");
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.log("\nmemo_items 表不存在或查询失败:", e.message);
  }

  await conn.end();
}

main().catch(console.error);
