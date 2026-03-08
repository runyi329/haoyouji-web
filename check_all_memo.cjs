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

  // 查所有memo_items（包括软删除的）
  try {
    const [rows] = await conn.execute("SELECT id, ledgerId, userId, category, title, fields, note, deletedAt, createdAt FROM memo_items ORDER BY id");
    console.log(`\n=== memo_items 全部数据（含软删除）共 ${rows.length} 条 ===`);
    rows.forEach(r => {
      console.log(`id=${r.id}, ledgerId=${r.ledgerId}, userId=${r.userId}, category=${r.category}, title="${r.title}", deletedAt=${r.deletedAt}, createdAt=${r.createdAt}`);
    });

    if (rows.length > 0) {
      // 硬删除所有（包括已软删除的）
      const [result] = await conn.execute("DELETE FROM memo_items");
      console.log(`\n已硬删除全部 ${result.affectedRows} 条`);
    } else {
      console.log("表已空");
    }
  } catch (e) {
    console.log("memo_items 操作:", e.message);
  }

  await conn.end();
}

main().catch(console.error);
