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
        banner_image_url TEXT,
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
        participant_scale ENUM('small','large') NOT NULL DEFAULT 'small',
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
        { name: 'participant_scale', def: "ENUM('small','large') NOT NULL DEFAULT 'small'" },
        { name: 'banner_image_url', def: 'TEXT DEFAULT NULL' },
      ];
      for (const col of lotteryNewCols) {
        await safeAddColumn(dbConn2, 'lottery_activities', col.name, col.def);
      }
    }

    // 确保 users 表有 invited_at 和 invited_by_user_id 字段（兼容旧部署）
    const dbConn3 = await getDbConnection();
    if (dbConn3) {
      const userInviteCols = [
        { name: 'invited_by_user_id', def: 'INT DEFAULT NULL COMMENT \'邀请人用户ID\'' },
        { name: 'invited_at', def: 'DATETIME DEFAULT NULL COMMENT \'被邀请时间\'' },
        { name: 'invite_count', def: 'INT NOT NULL DEFAULT 0 COMMENT \'邀请人数\'' },
        { name: 'invite_enabled', def: 'TINYINT NOT NULL DEFAULT 0 COMMENT \'是否开启邀请\'' },
        { name: 'invite_code', def: 'VARCHAR(20) DEFAULT NULL COMMENT \'邀请码\'' },
      ];
      for (const col of userInviteCols) {
        await safeAddColumn(dbConn3, 'users', col.name, col.def);
      }
      console.log('[DB Init] ✅ users invite columns checked');
    }

    // 确保 AG 数据源相关表存在（ag_sync_sources / ag_sync_logs）
    const dbConnAg = await getDbConnection();
    if (dbConnAg) {
      await dbConnAg.execute(`
        CREATE TABLE IF NOT EXISTS \`ag_sync_sources\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`ledger_id\` INT NOT NULL,
          \`name\` VARCHAR(100) NOT NULL,
          \`api_url\` TEXT NOT NULL,
          \`model_name\` VARCHAR(100) DEFAULT NULL,
          \`sync_rule\` TEXT DEFAULT NULL,
          \`status\` ENUM('active','inactive') NOT NULL DEFAULT 'active',
          \`last_max_id\` INT NOT NULL DEFAULT 0,
          \`total_synced\` INT NOT NULL DEFAULT 0,
          \`last_synced_at\` DATETIME DEFAULT NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_ag_sync_sources_ledger\` (\`ledger_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // 确保已有表补上 updated_at 字段（兼容旧表）
      await safeAddColumn(dbConnAg, 'ag_sync_sources', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
      await dbConnAg.execute(`
        CREATE TABLE IF NOT EXISTS \`ag_sync_logs\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`source_id\` INT NOT NULL,
          \`synced_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`new_count\` INT NOT NULL DEFAULT 0,
          \`skip_count\` INT NOT NULL DEFAULT 0,
          \`min_id\` INT DEFAULT NULL,
          \`max_id\` INT DEFAULT NULL,
          \`duration_ms\` INT DEFAULT NULL,
          \`status\` ENUM('success','error') NOT NULL DEFAULT 'success',
          \`error_msg\` TEXT DEFAULT NULL,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_ag_sync_logs_source\` (\`source_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // 确保 ag_prompt_images 表有 tags 和 author 字段
      await safeAddColumn(dbConnAg, 'ag_prompt_images', 'tags', "TEXT DEFAULT NULL COMMENT 'tags JSON array'");
      await safeAddColumn(dbConnAg, 'ag_prompt_images', 'author', "VARCHAR(255) DEFAULT NULL COMMENT 'author name'");
      console.log('[DB Init] ✅ ag_sync_sources / ag_sync_logs tables checked/created');
    }

    // ===== 股东编号表（shareholder_numbers）=====
    const dbConnSn = await getDbConnection();
    if (dbConnSn) {
      await (dbConnSn as any).execute(`
        CREATE TABLE IF NOT EXISTS \`shareholder_numbers\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`ledgerId\` INT NOT NULL,
          \`userId\` INT NOT NULL,
          \`shareNo\` VARCHAR(10) NOT NULL,
          \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_ledger_user\` (\`ledgerId\`, \`userId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('[DB Init] ✅ shareholder_numbers table checked/created');
      // 初始化 59 号账本的 14 位股东编号（已存则跳过）
      const shareholderData = [
        { ledgerId: 59, userId: 870413,  shareNo: '0001' }, // 胡永煜
        { ledgerId: 59, userId: 510025,  shareNo: '0002' }, // Julie
        { ledgerId: 59, userId: 4957147, shareNo: '0003' }, // 陈奇戌
        { ledgerId: 59, userId: 4957151, shareNo: '0004' }, // 大饼江湖
        { ledgerId: 59, userId: 4957141, shareNo: '0005' }, // vesen
        { ledgerId: 59, userId: 4957213, shareNo: '0006' }, // cyndi2109
        { ledgerId: 59, userId: 4957217, shareNo: '0007' }, // 李斌Luby
        { ledgerId: 59, userId: 4680302, shareNo: '0008' }, // 张慧
        { ledgerId: 59, userId: 4957155, shareNo: '0009' }, // Johnson
        { ledgerId: 59, userId: 4952766, shareNo: '0010' }, // 刘力凡
        { ledgerId: 59, userId: 3060001, shareNo: '0011' }, // 阿潇
        { ledgerId: 59, userId: 4957222, shareNo: '0012' }, // LK070865
        { ledgerId: 59, userId: 4957247, shareNo: '0013' }, // Mychael
        { ledgerId: 59, userId: 4957293, shareNo: '0014' }, // 袁贇
      ];
      for (const row of shareholderData) {
        await (dbConnSn as any).execute(
          `INSERT IGNORE INTO \`shareholder_numbers\` (\`ledgerId\`, \`userId\`, \`shareNo\`) VALUES (?, ?, ?)`,
          [row.ledgerId, row.userId, row.shareNo]
        );
      }
      console.log('[DB Init] ✅ shareholder_numbers seed data checked');
    }

    // ===== 市场贡献股初始化（天使股 × 30%，推荐人获得，INSERT IGNORE 幂等）=====
    // 规则：每位天使股持有人（第1位无推荐人除外）的推荐人，自动获得对应天使股数量×30%的市场贡献股
    // 起始日期 = 被推荐人的天使股授予日期；年化利率与天使股相同（6%）
    // 推荐关系来源：users.invited_by_user_id
    // 注意：同一推荐人可能被多人推荐，每条天使股对应独立一条市场贡献股记录
    // 使用 regNo 作为唯一标识（格式：MKT-{天使股equity_id}），防止重复插入
    const marketShareData = [
      // equity_id=4, Julie(510025) 推荐人 胡永煜(870413), 天使股100000, 授予2026-02-08
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 30000.00, grantDate: '2026-02-08', annualRate: 6.00, regNo: 'MKT-4' },
      // equity_id=5, 陈奇戌(4957147) 推荐人 vesen(4957141), 天使股100000, 授予2026-02-09
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 30000.00, grantDate: '2026-02-09', annualRate: 6.00, regNo: 'MKT-5' },
      // equity_id=6, 大饼江湖(4957151) 推荐人 胡永煜(870413), 天使股100000, 授予2026-02-09
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 30000.00, grantDate: '2026-02-09', annualRate: 6.00, regNo: 'MKT-6' },
      // equity_id=7, vesen(4957141) 推荐人 胡永煜(870413), 天使股100000, 授予2026-02-11
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 30000.00, grantDate: '2026-02-11', annualRate: 6.00, regNo: 'MKT-7' },
      // equity_id=8, cyndi2109(4957213) 推荐人 vesen(4957141), 天使股200000, 授予2026-02-11
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 60000.00, grantDate: '2026-02-11', annualRate: 6.00, regNo: 'MKT-8' },
      // equity_id=9, 李斌Luby(4957217) 推荐人 vesen(4957141), 天使股10000, 授予2026-02-19
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 3000.00, grantDate: '2026-02-19', annualRate: 6.00, regNo: 'MKT-9' },
      // equity_id=10, 张慧(4680302) 推荐人 胡永煜(870413), 天使股10000, 授予2026-02-26
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 3000.00, grantDate: '2026-02-26', annualRate: 6.00, regNo: 'MKT-10' },
      // equity_id=11, Johnson(4957155) 推荐人 vesen(4957141), 天使股100000, 授予2026-02-28
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 30000.00, grantDate: '2026-02-28', annualRate: 6.00, regNo: 'MKT-11' },
      // equity_id=12, 刘力凡(4952766) 推荐人 胡永煜(870413), 天使股598, 授予2026-03-02
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 179.40, grantDate: '2026-03-02', annualRate: 6.00, regNo: 'MKT-12' },
      // equity_id=13, 阿潇(3060001) 推荐人 胡永煜(870413), 天使股700, 授予2026-03-06
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 210.00, grantDate: '2026-03-06', annualRate: 6.00, regNo: 'MKT-13' },
      // equity_id=14, LK070865(4957222) 推荐人 阿潇(3060001), 天使股700, 授予2026-03-06
      { ledgerId: 59, userId: 3060001, memberNickname: '阿潇', shareCount: 210.00, grantDate: '2026-03-06', annualRate: 6.00, regNo: 'MKT-14' },
      // equity_id=15, Mychael(4957247) 推荐人 vesen(4957141), 天使股10000, 授予2026-03-06
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 3000.00, grantDate: '2026-03-06', annualRate: 6.00, regNo: 'MKT-15' },
      // equity_id=16, 袁贇(4957293) 推荐人 vesen(4957141), 天使股100000, 授予2026-03-19
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 30000.00, grantDate: '2026-03-19', annualRate: 6.00, regNo: 'MKT-16' },
    ];
    const dbConnMkt = await getDbConnection();
    if (dbConnMkt) {
      for (const row of marketShareData) {
        // 先检查是否已存在（以 regNo 为唯一标识），避免重复插入
        const [existRows] = await (dbConnMkt as any).execute(
          `SELECT COUNT(*) as cnt FROM \`equity_shares\` WHERE \`regNo\` = ?`,
          [row.regNo]
        );
        const cnt = Array.isArray(existRows) ? (existRows[0] as any).cnt : 0;
        if (Number(cnt) === 0) {
          await (dbConnMkt as any).execute(
            `INSERT INTO \`equity_shares\` (\`ledgerId\`, \`userId\`, \`memberNickname\`, \`shareCount\`, \`shareType\`, \`grantDate\`, \`reason\`, \`regNo\`, \`annualRate\`, \`createdBy\`) VALUES (?, ?, ?, ?, '市场贡献股', ?, '市场推荐奖励（天使股30%）', ?, ?, 870413)`,
            [row.ledgerId, row.userId, row.memberNickname, row.shareCount, row.grantDate, row.regNo, row.annualRate]
          );
        }
      }
      console.log('[DB Init] ✅ market contribution shares seed data checked');
    }

    // ===== 一次性修复：将 shareType='市场贡献' 更正为 '市场贡献股' =====
    try {
      const dbConn2 = await getDbConnection();
      if (dbConn2) {
        const [fixResult] = await (dbConn2 as any).execute(
          `UPDATE \`equity_shares\` SET shareType='市场贡献股' WHERE shareType='市场贡献'`
        );
        const affected = (fixResult as any).affectedRows ?? 0;
        if (affected > 0) {
          console.log(`[DB Init] ✅ Fixed ${affected} equity_shares records: '市场贡献' -> '市场贡献股'`);
        }
      }
    } catch (fixErr) {
      console.warn('[DB Init] ⚠️ shareType fix skipped:', fixErr instanceof Error ? fixErr.message : fixErr);
    }

    console.log("[DB Init] Database initialization completed successfully");
  } catch (error) {
    console.error("[DB Init] Error during database initialization:", error);
    // 不抛出错误，避免影响应用启动
  }
}
