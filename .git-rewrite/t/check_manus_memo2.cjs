const mysql2 = require("mysql2/promise");

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

  console.log("=== Manus临时数据库 连接成功 ===");

  // 查所有表（不区分大小写）
  const [tables] = await conn.execute("SHOW TABLES");
  const tableNames = tables.map(t => Object.values(t)[0]);
  console.log("\n所有表:", tableNames.join(', '));

  // 找memo相关表
  const memoTables = tableNames.filter(t => t.toLowerCase().includes('memo'));
  console.log("memo相关表:", memoTables);

  for (const tbl of memoTables) {
    try {
      const [rows] = await conn.execute(`SELECT id, ledgerId, userId, category, title, createdAt FROM \`${tbl}\` ORDER BY id`);
      console.log(`\n=== ${tbl} (${rows.length}条) ===`);
      console.log(JSON.stringify(rows, null, 2));
      if (rows.length > 0) {
        await conn.execute(`DELETE FROM \`${tbl}\``);
        console.log(`已删除 ${rows.length} 条`);
      }
    } catch(e) {
      console.log(`${tbl} 操作失败:`, e.message);
    }
  }

  await conn.end();
}

main().catch(console.error);
