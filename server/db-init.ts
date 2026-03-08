import { getDb, getDbConnection } from "./db";

/**
 * 数据库初始化模块
 * 在应用启动时自动检查并创建必要的表和字段
 */

/**
 * 安全地给表添加字段（如果字段不存在则添加，已存在则跳过）
 */
async function safeAddColumn(
  dbConn: any,
  table: string,
  column: string,
  definition: string
): Promise<boolean> {
  try {
    const [rows] = await dbConn.execute(
      `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if ((rows as any[])[0].cnt > 0) {
      return false; // 字段已存在
    }
    await dbConn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`[DB Init] ✅ Added column ${table}.${column}`);
    return true;
  } catch (error) {
    console.warn(`[DB Init] ⚠️ Failed to add column ${table}.${column}:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * 确保意见本功能所需的字段存在于 ledger_records 表中
 */
async function ensureOpinionBookColumns(dbConn: any) {
  console.log("[DB Init] Checking opinion book columns in ledger_records...");
  
  const columns = [
    { name: 'rating', definition: 'TINYINT DEFAULT NULL COMMENT \'评分1-5\'' },
    { name: 'guest_name', definition: 'VARCHAR(50) DEFAULT NULL COMMENT \'游客姓名\'' },
    { name: 'guest_wechat', definition: 'VARCHAR(100) DEFAULT NULL COMMENT \'游客微信号\'' },
    { name: 'guest_ip', definition: 'VARCHAR(45) DEFAULT NULL COMMENT \'游客IP\'' },
    { name: 'is_read', definition: 'TINYINT DEFAULT 0 COMMENT \'是否已读\'' },
    { name: 'deleted_at', definition: 'DATETIME DEFAULT NULL COMMENT \'软删除时间\'' },
  ];

  let addedCount = 0;
  for (const col of columns) {
    const added = await safeAddColumn(dbConn, 'ledger_records', col.name, col.definition);
    if (added) addedCount++;
  }

  if (addedCount > 0) {
    console.log(`[DB Init] ✅ Added ${addedCount} new columns to ledger_records`);
  } else {
    console.log("[DB Init] ✅ All opinion book columns already exist in ledger_records");
  }
}

export async function initDatabase() {
  try {
    console.log("[DB Init] Starting database initialization...");
    
    const db = await getDb();
    if (!db) {
      console.error("[DB Init] Failed to get database connection");
      return;
    }

    // 创建AI会话表
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ai_sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL DEFAULT '新对话',
        total_tokens INT NOT NULL DEFAULT 0,
        total_cost DECIMAL(10, 4) NOT NULL DEFAULT 0,
        message_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[DB Init] ✅ ai_sessions table checked/created");

    // 创建AI消息表
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ai_messages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        session_id INT NOT NULL,
        role ENUM('user', 'assistant', 'system') NOT NULL,
        content TEXT NOT NULL,
        tokens_used INT NOT NULL DEFAULT 0,
        cost DECIMAL(10, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session_id (session_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[DB Init] ✅ ai_messages table checked/created");

    // 确保意见本功能所需的字段存在
    const dbConn = await getDbConnection();
    if (dbConn) {
      await ensureOpinionBookColumns(dbConn);
    }

    // ─── 抽奖模块：确保四张表存在 ────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS \`lottery_activities\` (
        id INT PRIMARY KEY AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        created_by INT NOT NULL,
        title VARCHAR(100) NOT NULL,
        description TEXT,
        cover_image_url TEXT,
        mode ENUM('instant','scheduled','milestone') NOT NULL DEFAULT 'scheduled',
        instant_style ENUM('scratch','wheel','flip','egg') DEFAULT 'scratch',
        draw_at DATETIME DEFAULT NULL,
        auto_draw_enabled TINYINT NOT NULL DEFAULT 1,
        milestone_type ENUM('amount','member_count','record_count') DEFAULT NULL,
        milestone_target DECIMAL(12,2) DEFAULT NULL,
        signup_start_at DATETIME DEFAULT NULL,
        signup_end_at DATETIME DEFAULT NULL,
        max_participants INT DEFAULT NULL,
        requires_info TINYINT NOT NULL DEFAULT 0,
        required_fields JSON DEFAULT NULL,
        signup_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        registration_mode ENUM('open','invite','organizer_add') NOT NULL DEFAULT 'open',
        random_seed_hash VARCHAR(64) DEFAULT NULL,
        random_seed VARCHAR(255) DEFAULT NULL,
        use_participant_seed TINYINT NOT NULL DEFAULT 0,
        external_seed_type ENUM('sh_index','sz_index','ssq','dlt') DEFAULT NULL,
        external_seed_date DATE DEFAULT NULL,
        external_seed_value VARCHAR(255) DEFAULT NULL,
        external_seed_source TEXT DEFAULT NULL,
        status ENUM('draft','open','drawing','completed','cancelled') NOT NULL DEFAULT 'draft',
        is_public TINYINT NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_lottery_ledger_id (ledger_id),
        INDEX idx_lottery_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[DB Init] ✅ lottery_activities table checked/created");

    await db.execute(`
      CREATE TABLE IF NOT EXISTS \`lottery_prizes\` (
        id INT PRIMARY KEY AUTO_INCREMENT,
        activity_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        description TEXT,
        image_url TEXT,
        quantity INT NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        prize_value DECIMAL(10,2) DEFAULT NULL,
        weight INT NOT NULL DEFAULT 1,
        is_consolation TINYINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_lottery_prizes_activity (activity_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[DB Init] ✅ lottery_prizes table checked/created");

    await db.execute(`
      CREATE TABLE IF NOT EXISTS \`lottery_participants\` (
        id INT PRIMARY KEY AUTO_INCREMENT,
        activity_id INT NOT NULL,
        user_id INT DEFAULT NULL,
        ledger_record_id INT DEFAULT NULL,
        display_name VARCHAR(50) DEFAULT NULL,
        extra_info JSON DEFAULT NULL,
        participant_seed VARCHAR(64) DEFAULT NULL,
        status ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
        fee_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        payment_status ENUM('free','pending','paid') NOT NULL DEFAULT 'free',
        draw_count INT NOT NULL DEFAULT 1,
        draw_used INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_lottery_part_activity (activity_id),
        INDEX idx_lottery_part_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[DB Init] ✅ lottery_participants table checked/created");

    await db.execute(`
      CREATE TABLE IF NOT EXISTS \`lottery_results\` (
        id INT PRIMARY KEY AUTO_INCREMENT,
        activity_id INT NOT NULL,
        prize_id INT NOT NULL,
        participant_id INT NOT NULL,
        ledger_record_id INT DEFAULT NULL,
        winner_id INT DEFAULT NULL,
        winner_name VARCHAR(50) DEFAULT NULL,
        random_seed VARCHAR(255) DEFAULT NULL,
        draw_index INT NOT NULL DEFAULT 0,
        claim_status ENUM('unclaimed','claimed','expired') NOT NULL DEFAULT 'unclaimed',
        claimed_at DATETIME DEFAULT NULL,
        drawn_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_lottery_results_activity (activity_id),
        INDEX idx_lottery_results_winner (winner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[DB Init] ✅ lottery_results table checked/created");

    // 兼容旧部署：确保 lottery_activities 有新字段
    const dbConn2 = await getDbConnection();
    if (dbConn2) {
      const lotteryNewCols = [
        { name: 'registration_mode', def: "ENUM('open','invite','organizer_add') NOT NULL DEFAULT 'open'" },
        { name: 'external_seed_type', def: "ENUM('sh_index','sz_index','ssq','dlt') DEFAULT NULL" },
        { name: 'external_seed_date', def: 'DATE DEFAULT NULL' },
        { name: 'external_seed_value', def: 'VARCHAR(255) DEFAULT NULL' },
        { name: 'external_seed_source', def: 'TEXT DEFAULT NULL' },
      ];
      for (const col of lotteryNewCols) {
        await safeAddColumn(dbConn2, 'lottery_activities', col.name, col.def);
      }
    }

    console.log("[DB Init] Database initialization completed successfully");
  } catch (error) {
    console.error("[DB Init] Error during database initialization:", error);
    // 不抛出错误，避免影响应用启动
  }
}
