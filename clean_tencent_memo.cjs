const mysql2 = require("mysql2/promise");

async function main() {
  const conn = await mysql2.createConnection({
    host: "124.223.54.69",
    port: 3306,
    user: "root",
    password: "Miao@20190603",
    database: "crm_db",
    ssl: false,
    charset: 'utf8mb4',
    connectTimeout: 15000,
  });

  console.log("=== 连接腾讯云数据库成功 ===");

  // 查看所有表
  const [tables] = await conn.execute("SHOW TABLES LIKE 'memo%'");
  console.log("\n=== memo相关表 ===");
  console.log(JSON.stringify(tables, null, 2));

  // 查 memo_items
  try {
    const [rows] = await conn.execute("SELECT id, ledgerId, userId, category, title, createdAt FROM memo_items ORDER BY id");
    console.log("\n=== memo_items 数据 ===");
    console.log(JSON.stringify(rows, null, 2));
    console.log(`共 ${rows.length} 条`);

    if (rows.length > 0) {
      const [result] = await conn.execute("DELETE FROM memo_items");
      console.log(`\n已删除 ${result.affectedRows} 条数据`);
    }
  } catch (e) {
    console.log("memo_items 操作:", e.message);
  }

  await conn.end();
}

main().catch(console.error);
