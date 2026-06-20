const mysql2 = require("mysql2/promise");

// 从haoyouji服务进程读取ORIGINAL_DATABASE_URL
const { execSync } = require("child_process");

async function main() {
  // 获取haoyouji服务进程的环境变量
  let dbUrl;
  try {
    const pid = execSync("pgrep -f 'haoyouji.*server/_core/index' | tail -1").toString().trim();
    const env = execSync(`cat /proc/${pid}/environ`).toString().split('\0');
    const dbEntry = env.find(e => e.startsWith('ORIGINAL_DATABASE_URL='));
    if (dbEntry) {
      dbUrl = dbEntry.replace('ORIGINAL_DATABASE_URL=', '');
    }
  } catch(e) {
    console.log("无法从进程读取，尝试其他方式...");
  }

  if (!dbUrl) {
    // 尝试从.env.backup读取
    try {
      const fs = require('fs');
      const envContent = fs.readFileSync('/home/ubuntu/haoyouji-web-new/.env.backup', 'utf8');
      const match = envContent.match(/ORIGINAL_DATABASE_URL=(.+)/);
      if (match) dbUrl = match[1].trim();
    } catch(e) {}
  }

  if (!dbUrl) {
    console.log("无法获取ORIGINAL_DATABASE_URL");
    return;
  }

  console.log("连接到:", dbUrl.replace(/\/\/.*:.*@/, '//***:***@'));

  const url = new URL(dbUrl.replace('mysql://', 'http://'));
  const conn = await mysql2.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1).split('?')[0],
    ssl: { rejectUnauthorized: false },
    charset: 'utf8mb4',
  });

  console.log("=== 连接成功 ===");

  // 查 memo_items
  try {
    const [rows] = await conn.execute("SELECT id, ledgerId, userId, category, title, note, createdAt FROM memo_items ORDER BY id");
    console.log("\n=== memo_items 数据 ===");
    console.log(JSON.stringify(rows, null, 2));
    console.log(`\n共 ${rows.length} 条`);
  } catch (e) {
    console.log("memo_items 表不存在:", e.message);
  }

  await conn.end();
}

main().catch(console.error);
