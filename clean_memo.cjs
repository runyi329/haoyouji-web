const mysql2 = require("mysql2/promise");

const DB_URL = "mysql://CmANhgd4s9xTPkw.1c1bc8175aba:QPhwlU294mor1bZak1X8@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/cSuKEEZ8CGmJveg8PVZXzb";

async function main() {
  const conn = await mysql2.createConnection({
    host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
    port: 4000,
    user: "CmANhgd4s9xTPkw.1c1bc8175aba",
    password: "QPhwlU294mor1bZak1X8",
    database: "cSuKEEZ8CGmJveg8PVZXzb",
    ssl: { rejectUnauthorized: false },
    charset: 'utf8mb4',
  });

  console.log("=== 连接成功 ===");

  // 先查看
  try {
    const [rows] = await conn.execute("SELECT id, ledgerId, userId, category, title, createdAt FROM memo_items ORDER BY id");
    console.log("\n=== 当前 memo_items 数据 ===");
    console.log(JSON.stringify(rows, null, 2));

    if (rows.length > 0) {
      // 删除所有数据（硬删除）
      const [result] = await conn.execute("DELETE FROM memo_items");
      console.log(`\n已删除 ${result.affectedRows} 条数据`);
    } else {
      console.log("没有数据需要删除");
    }
  } catch (e) {
    console.log("操作失败:", e.message);
  }

  await conn.end();
}

main().catch(console.error);
