/**
 * 迁移脚本：为 lottery_activities 表添加外部开奖数据源字段
 * 运行：node server/migrate-lottery-external.mjs
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

async function migrate() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log("✅ Connected to database");

  // 检查 lottery_activities 表是否存在
  const [tables] = await conn.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_activities'`
  );
  if (tables.length === 0) {
    console.log("⚠️  lottery_activities table does not exist yet, skipping migration");
    await conn.end();
    return;
  }

  // 添加字段（如果不存在）
  const columnsToAdd = [
    {
      name: "external_seed_type",
      sql: "ALTER TABLE `lottery_activities` ADD COLUMN `external_seed_type` ENUM('sh_index','sz_index','ssq','dlt') DEFAULT NULL COMMENT '外部开奖数据类型'",
    },
    {
      name: "external_seed_date",
      sql: "ALTER TABLE `lottery_activities` ADD COLUMN `external_seed_date` DATE DEFAULT NULL COMMENT '外部数据日期'",
    },
    {
      name: "external_seed_value",
      sql: "ALTER TABLE `lottery_activities` ADD COLUMN `external_seed_value` VARCHAR(255) DEFAULT NULL COMMENT '外部数据实际值（开奖后写入）'",
    },
    {
      name: "external_seed_source",
      sql: "ALTER TABLE `lottery_activities` ADD COLUMN `external_seed_source` TEXT DEFAULT NULL COMMENT '外部数据来源说明'",
    },
  ];

  for (const col of columnsToAdd) {
    const [rows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_activities' AND COLUMN_NAME = ?`,
      [col.name]
    );
    if (rows[0].cnt > 0) {
      console.log(`  ⏭️  Column ${col.name} already exists, skipping`);
    } else {
      await conn.execute(col.sql);
      console.log(`  ✅ Added column ${col.name}`);
    }
  }

  await conn.end();
  console.log("✅ Migration complete");
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
