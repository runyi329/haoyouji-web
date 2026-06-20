/**
 * 迁移脚本：创建 lottery 相关表（如不存在），并添加 registration_mode 字段
 * 运行：node server/migrate-lottery-init.mjs
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

  try {
    // 1. 创建 lottery_activities 表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS lottery_activities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_id INT NOT NULL,
        created_by INT NOT NULL,
        title VARCHAR(100) NOT NULL,
        description TEXT,
        cover_image_url TEXT,
        mode ENUM('instant','scheduled','milestone') NOT NULL DEFAULT 'scheduled',
        instant_style ENUM('scratch','wheel','flip','egg') DEFAULT 'scratch',
        draw_at TIMESTAMP NULL,
        auto_draw_enabled TINYINT NOT NULL DEFAULT 1,
        milestone_type ENUM('amount','member_count','record_count'),
        milestone_target DECIMAL(12,2),
        signup_start_at TIMESTAMP NULL,
        signup_end_at TIMESTAMP NULL,
        max_participants INT,
        requires_info TINYINT NOT NULL DEFAULT 0,
        required_fields JSON,
        signup_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        registration_mode ENUM('invite','organizer_add','open') NOT NULL DEFAULT 'open',
        random_seed_hash VARCHAR(64),
        random_seed VARCHAR(255),
        use_participant_seed TINYINT NOT NULL DEFAULT 0,
        external_seed_type ENUM('sh_index','sz_index','ssq','dlt') DEFAULT NULL,
        external_seed_date DATE DEFAULT NULL,
        external_seed_value VARCHAR(255) DEFAULT NULL,
        external_seed_source TEXT DEFAULT NULL,
        status ENUM('draft','open','drawing','completed','cancelled') NOT NULL DEFAULT 'draft',
        is_public TINYINT NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX lottery_activities_ledger_idx (ledger_id),
        INDEX lottery_activities_status_idx (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✅ lottery_activities table ready");

    // 2. 创建 lottery_prizes 表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS lottery_prizes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        activity_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        description TEXT,
        image_url TEXT,
        quantity INT NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        prize_value DECIMAL(10,2),
        weight INT NOT NULL DEFAULT 1,
        is_consolation TINYINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX lottery_prizes_activity_idx (activity_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✅ lottery_prizes table ready");

    // 3. 创建 lottery_participants 表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS lottery_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        activity_id INT NOT NULL,
        user_id INT,
        ledger_record_id INT,
        display_name VARCHAR(50),
        extra_info JSON,
        participant_seed VARCHAR(64),
        status ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
        fee_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        payment_status ENUM('free','pending','paid') NOT NULL DEFAULT 'free',
        draw_count INT NOT NULL DEFAULT 1,
        draw_used INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX lottery_participants_activity_idx (activity_id),
        INDEX lottery_participants_user_idx (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✅ lottery_participants table ready");

    // 4. 创建 lottery_results 表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS lottery_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        activity_id INT NOT NULL,
        prize_id INT NOT NULL,
        participant_id INT NOT NULL,
        ledger_record_id INT,
        winner_id INT,
        winner_name VARCHAR(50),
        random_seed VARCHAR(255),
        draw_index INT NOT NULL DEFAULT 0,
        claim_status ENUM('unclaimed','claimed','expired') NOT NULL DEFAULT 'unclaimed',
        claimed_at TIMESTAMP NULL,
        drawn_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX lottery_results_activity_idx (activity_id),
        INDEX lottery_results_winner_idx (winner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✅ lottery_results table ready");

    // 5. 如果 lottery_activities 已存在但缺少 registration_mode 字段，添加它
    const [cols] = await conn.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_activities' AND COLUMN_NAME = 'registration_mode'
    `);
    if (cols.length === 0) {
      await conn.execute(`
        ALTER TABLE lottery_activities
        ADD COLUMN registration_mode ENUM('invite','organizer_add','open') NOT NULL DEFAULT 'open'
        AFTER signup_fee
      `);
      console.log("✅ Added registration_mode column");
    } else {
      console.log("ℹ️  registration_mode column already exists");
    }

    // 6. 添加外部开奖字段（如不存在）
    const extFields = [
      ["external_seed_type", "ADD COLUMN external_seed_type ENUM('sh_index','sz_index','ssq','dlt') DEFAULT NULL AFTER registration_mode"],
      ["external_seed_date", "ADD COLUMN external_seed_date DATE DEFAULT NULL AFTER external_seed_type"],
      ["external_seed_value", "ADD COLUMN external_seed_value VARCHAR(255) DEFAULT NULL AFTER external_seed_date"],
      ["external_seed_source", "ADD COLUMN external_seed_source TEXT DEFAULT NULL AFTER external_seed_value"],
    ];
    for (const [colName, alterSql] of extFields) {
      const [rows] = await conn.execute(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_activities' AND COLUMN_NAME = ?
      `, [colName]);
      if (rows.length === 0) {
        await conn.execute(`ALTER TABLE lottery_activities ${alterSql}`);
        console.log(`✅ Added ${colName} column`);
      }
    }

    console.log("\n🎉 All lottery migrations complete!");
  } catch (err) {
    console.error("❌ Migration error:", err.message);
    throw err;
  } finally {
    await conn.end();
  }
}

migrate().catch(process.exit.bind(process, 1));
