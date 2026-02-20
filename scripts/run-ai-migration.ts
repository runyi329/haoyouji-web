import { getDbConnection } from "../server/db";
import fs from "fs";
import path from "path";

async function runMigration() {
  try {
    console.log("开始执行AI表迁移...");
    
    const connection = await getDbConnection();
    if (!connection) {
      throw new Error("无法获取数据库连接");
    }

    const sqlPath = path.join(__dirname, "../migrations/create_ai_tables.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");

    // 分割SQL语句（按分号分割）
    const statements = sql
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      console.log(`执行SQL: ${statement.substring(0, 50)}...`);
      await connection.execute(statement);
    }

    console.log("✅ AI表迁移完成！");
    process.exit(0);
  } catch (error) {
    console.error("❌ 迁移失败:", error);
    process.exit(1);
  }
}

runMigration();
