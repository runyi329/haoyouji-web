const mysql2 = require("mysql2/promise");

const DB_URL = "mysql://CmANhgd4s9xTPkw.1c1bc8175aba:QPhwlU294mor1bZak1X8@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/cSuKEEZ8CGmJveg8PVZXzb?ssl=%7B%22rejectUnauthorized%22%3Atrue%7D";

async function main() {
  // 解析连接参数
  const url = new URL(DB_URL.replace('mysql://', 'http://'));
  const conn = await mysql2.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: true },
  });

  console.log("Connected!");

  // 查看所有memo_items
  try {
    const [rows] = await conn.execute("SELECT id, ledger_id, user_id, category, title, note, created_at FROM memo_items ORDER BY id DESC LIMIT 20");
    console.log("All memo_items:", JSON.stringify(rows, null, 2));

    // 删除title为空或null的记录
    const [del] = await conn.execute("DELETE FROM memo_items WHERE title IS NULL OR title = ''");
    console.log("Deleted empty records:", del.affectedRows);

    // 再查一次
    const [rows2] = await conn.execute("SELECT id, ledger_id, user_id, category, title, fields, note, created_at FROM memo_items ORDER BY id DESC LIMIT 20");
    console.log("Remaining memo_items:", JSON.stringify(rows2, null, 2));
  } catch (e) {
    console.error("Error:", e.message);
  }

  await conn.end();
}

main().catch(console.error);
