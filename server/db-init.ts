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
    { name: 'images', definition: 'JSON DEFAULT NULL COMMENT \'多图URL数组（最多5张）\'' },
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

    // 确保 users 表有多版本（皮肤）相关字段（兼容旧部署）
    const dbConnVer = await getDbConnection();
    if (dbConnVer) {
      const userVersionCols = [
        { name: 'version_key', def: 'VARCHAR(50) DEFAULT NULL COMMENT \'管理员为该用户单独指定的版本key（为空表示沿推荐链继承）\'' },
        { name: 'version_switch_enabled', def: 'TINYINT NOT NULL DEFAULT 0 COMMENT \'是否允许该用户在右上角自由切换版本\'' },
        { name: 'version_switch_scope', def: 'VARCHAR(255) DEFAULT NULL COMMENT \'允许切换到的版本key列表，逗号分隔；为空表示全部已启用版本\'' },
      ];
      for (const col of userVersionCols) {
        await safeAddColumn(dbConnVer, 'users', col.name, col.def);
      }

      // 站点版本（皮肤）表：可扩展的多版本登录UI与登录后落地地址
      await dbConnVer.execute(`
        CREATE TABLE IF NOT EXISTS \`site_versions\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`version_key\` VARCHAR(50) NOT NULL COMMENT '版本唯一标识，如 maidong / yaban',
          \`name\` VARCHAR(100) NOT NULL COMMENT '版本名称，如 脉动版 / 牙伴版',
          \`login_ui\` VARCHAR(50) NOT NULL DEFAULT 'maidong' COMMENT '登录页UI风格标识',
          \`landing_path\` VARCHAR(255) NOT NULL DEFAULT '/' COMMENT '登录成功后落地地址',
          \`is_default\` TINYINT NOT NULL DEFAULT 0 COMMENT '是否为系统默认版本（追溯到顶仍无设置时使用）',
          \`enabled\` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
          \`sort_order\` INT NOT NULL DEFAULT 0 COMMENT '排序',
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_version_key\` (\`version_key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站点多版本（皮肤）配置'
      `);

      // 种子：脉动版（系统默认）、牙伴版
      const [verRows]: any = await dbConnVer.execute('SELECT COUNT(*) as cnt FROM site_versions');
      if (Number(verRows?.[0]?.cnt ?? 0) === 0) {
        await dbConnVer.execute(
          `INSERT INTO site_versions (version_key, name, login_ui, landing_path, is_default, enabled, sort_order) VALUES
            ('maidong', '脉动版', 'maidong', '/', 1, 1, 0),
            ('yaban', '牙伴版', 'yaban', '/yaban/intro', 0, 1, 1)`
        );
        console.log('[DB Init] ✅ site_versions seeded (maidong, yaban)');
      }
      // 兼容：将旧的牙伴版落地地址 /yaban 纠正为开机画面入口 /yaban/intro
      await dbConnVer.execute(
        `UPDATE site_versions SET landing_path = '/yaban/intro' WHERE version_key = 'yaban' AND landing_path = '/yaban'`
      );
      console.log('[DB Init] ✅ users version columns & site_versions checked');
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

    // ===== 市场资源股初始化（资金股 × 30%，推荐人获得，INSERT IGNORE 幂等）=====
    // 规则：每位资金股持有人（第1位无推荐人除外）的推荐人，自动获得对应资金股数量×30%的市场资源股
    // 起始日期 = 被推荐人的资金股授予日期；年化利率与资金股相同（6%）
    // 推荐关系来源：users.invited_by_user_id
    // 注意：同一推荐人可能被多人推荐，每条资金股对应独立一条市场资源股记录
    // 使用 regNo 作为唯一标识（格式：MKT-{资金股equity_id}），防止重复插入
    const marketShareData = [
      // equity_id=4, Julie(510025) 推荐人 胡永煜(870413), 资金股100000, 授予2026-02-08
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 30000.00, grantDate: '2026-02-08', annualRate: 6.00, regNo: 'MKT-4', sourceUserId: 510025, sourceAmount: 100000 },
      // equity_id=5, 陈奇戌(4957147) 推荐人 vesen(4957141), 资金股100000, 授予2026-02-09
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 30000.00, grantDate: '2026-02-09', annualRate: 6.00, regNo: 'MKT-5', sourceUserId: 4957147, sourceAmount: 100000 },
      // equity_id=6, 大饼江湖(4957151) 推荐人 胡永煜(870413), 资金股100000, 授予2026-02-09
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 30000.00, grantDate: '2026-02-09', annualRate: 6.00, regNo: 'MKT-6', sourceUserId: 4957151, sourceAmount: 100000 },
      // equity_id=7, vesen(4957141) 推荐人 胡永煜(870413), 资金股100000, 授予2026-02-11
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 30000.00, grantDate: '2026-02-11', annualRate: 6.00, regNo: 'MKT-7', sourceUserId: 4957141, sourceAmount: 100000 },
      // equity_id=8, cyndi2109(4957213) 推荐人 vesen(4957141), 资金股200000, 授予2026-02-11
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 60000.00, grantDate: '2026-02-11', annualRate: 6.00, regNo: 'MKT-8', sourceUserId: 4957213, sourceAmount: 200000 },
      // equity_id=9, 李斌Luby(4957217) 推荐人 vesen(4957141), 资金股10000, 授予2026-02-19
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 3000.00, grantDate: '2026-02-19', annualRate: 6.00, regNo: 'MKT-9', sourceUserId: 4957217, sourceAmount: 10000 },
      // equity_id=10, 张慧(4680302) 推荐人 胡永煜(870413), 资金股10000, 授予2026-02-26
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 3000.00, grantDate: '2026-02-26', annualRate: 6.00, regNo: 'MKT-10', sourceUserId: 4680302, sourceAmount: 10000 },
      // equity_id=11, Johnson(4957155) 推荐人 vesen(4957141), 资金股100000, 授予2026-02-28
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 30000.00, grantDate: '2026-02-28', annualRate: 6.00, regNo: 'MKT-11', sourceUserId: 4957155, sourceAmount: 100000 },
      // equity_id=12, 刘力凡(4952766) 推荐人 胡永煜(870413), 资金股598, 授予2026-03-02
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 179.40, grantDate: '2026-03-02', annualRate: 6.00, regNo: 'MKT-12', sourceUserId: 4952766, sourceAmount: 598 },
      // equity_id=13, 阿潇(3060001) 推荐人 胡永煜(870413), 资金股700, 授予2026-03-06
      { ledgerId: 59, userId: 870413, memberNickname: '胡永煜', shareCount: 210.00, grantDate: '2026-03-06', annualRate: 6.00, regNo: 'MKT-13', sourceUserId: 3060001, sourceAmount: 700 },
      // equity_id=14, LK070865(4957222) 推荐人 阿潇(3060001), 资金股700, 授予2026-03-06
      { ledgerId: 59, userId: 3060001, memberNickname: '阿潇', shareCount: 210.00, grantDate: '2026-03-06', annualRate: 6.00, regNo: 'MKT-14', sourceUserId: 4957222, sourceAmount: 700 },
      // equity_id=15, Mychael(4957247) 推荐人 vesen(4957141), 资金股10000, 授予2026-03-06
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 3000.00, grantDate: '2026-03-06', annualRate: 6.00, regNo: 'MKT-15', sourceUserId: 4957247, sourceAmount: 10000 },
      // equity_id=16, 袁贇(4957293) 推荐人 vesen(4957141), 资金股100000, 授予2026-03-19
      { ledgerId: 59, userId: 4957141, memberNickname: 'vesen', shareCount: 30000.00, grantDate: '2026-03-19', annualRate: 6.00, regNo: 'MKT-16', sourceUserId: 4957293, sourceAmount: 100000 },
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
            `INSERT INTO \`equity_shares\` (\`ledgerId\`, \`userId\`, \`memberNickname\`, \`shareCount\`, \`shareType\`, \`grantDate\`, \`reason\`, \`regNo\`, \`annualRate\`, \`createdBy\`, \`source_user_id\`, \`source_amount\`) VALUES (?, ?, ?, ?, '资源股', ?, '市场推荐奖励（资金股30%）', ?, ?, 870413, ?, ?)`,
            [row.ledgerId, row.userId, row.memberNickname, row.shareCount, row.grantDate, row.regNo, row.annualRate, (row as any).sourceUserId ?? null, (row as any).sourceAmount ?? null]
          );
        } else {
          // 历史记录补录 source_user_id 和 source_amount（如果为空）
          await (dbConnMkt as any).execute(
            `UPDATE \`equity_shares\` SET source_user_id = COALESCE(source_user_id, ?), source_amount = COALESCE(source_amount, ?) WHERE \`regNo\` = ?`,
            [(row as any).sourceUserId ?? null, (row as any).sourceAmount ?? null, row.regNo]
          );
        }
      }
      console.log('[DB Init] ✅ market contribution shares seed data checked');
    }

    // ===== 一次性修复：将 shareType='市场贡献' 更正为 '资源股' =====
    try {
      const dbConn2 = await getDbConnection();
      if (dbConn2) {
        const [fixResult] = await (dbConn2 as any).execute(
          `UPDATE \`equity_shares\` SET shareType='资源股' WHERE shareType='市场贡献'`
        );
        const affected = (fixResult as any).affectedRows ?? 0;
        if (affected > 0) {
          console.log(`[DB Init] ✅ Fixed ${affected} equity_shares records: '市场贡献' -> '资源股'`);
        }
      }
    } catch (fixErr) {
      console.warn('[DB Init] ⚠️ shareType fix skipped:', fixErr instanceof Error ? fixErr.message : fixErr);
    }

    // ===== 建立 equity 相关表（共用连接）=====
    const connection = await getDbConnection();

    // ===== 建立 equity_transfers 股权转让申请表 =====
    try {
      if (connection) await connection.execute(`
        CREATE TABLE IF NOT EXISTS \`equity_transfers\` (
          id INT AUTO_INCREMENT PRIMARY KEY,
          from_user_id INT NOT NULL COMMENT '转出方用户ID',
          from_share_id INT NOT NULL COMMENT '转出股权记录ID',
          transfer_count DECIMAL(15,4) NOT NULL COMMENT '转让张数',
          to_user_id INT NOT NULL COMMENT '转入方用户ID',
          status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '状态',
          remark TEXT COMMENT '备注',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          approved_at DATETIME NULL,
          approved_by INT NULL,
          INDEX idx_from_user (from_user_id),
          INDEX idx_to_user (to_user_id),
          INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='股权转让申请表'
      `);
      console.log('[DB Init] ✅ equity_transfers table ready');
    } catch (e) {
      console.warn('[DB Init] ⚠️ equity_transfers table skipped:', e instanceof Error ? e.message : e);
    }

    // ===== 建立 equity_weights 股权权重表 =====
    try {
      if (connection) await connection.execute(`
        CREATE TABLE IF NOT EXISTS \`equity_weights\` (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL UNIQUE COMMENT '用户ID',
          resource_weight DECIMAL(5,2) NOT NULL DEFAULT 1.00 COMMENT '资源权重',
          capital_weight DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '资金权重',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='股权权重表'
      `);
      console.log('[DB Init] ✅ equity_weights table ready');
    } catch (e) {
      console.warn('[DB Init] ⚠️ equity_weights table skipped:', e instanceof Error ? e.message : e);
    }

    // ===== 建立 equity_weight_logs 权重变更日志表 =====
    try {
      if (connection) await connection.execute(`
        CREATE TABLE IF NOT EXISTS \`equity_weight_logs\` (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL COMMENT '账本ID',
          user_id INT NOT NULL COMMENT '被修改权重的用户ID',
          operator_id INT NOT NULL COMMENT '操作人用户ID',
          old_resource_weight DECIMAL(5,2) NOT NULL DEFAULT 1.00 COMMENT '修改前资源权重',
          old_capital_weight DECIMAL(5,2) NOT NULL DEFAULT 1.00 COMMENT '修改前资金权重',
          new_resource_weight DECIMAL(5,2) NOT NULL COMMENT '修改后资源权重',
          new_capital_weight DECIMAL(5,2) NOT NULL COMMENT '修改后资金权重',
          remark VARCHAR(255) DEFAULT '' COMMENT '备注',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_ledger (user_id, ledger_id),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权重变更日志表'
      `);
      console.log('[DB Init] ✅ equity_weight_logs table ready');
    } catch (e) {
      console.warn('[DB Init] ⚠️ equity_weight_logs table skipped:', e instanceof Error ? e.message : e);
    }

    // ===== 建立 eth_position_levels ETH持仓档位表 =====
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS \`eth_position_levels\` (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL COMMENT '账本ID',
          price INT NOT NULL COMMENT '价格档位（美元）',
          planned_qty DECIMAL(18,8) NOT NULL DEFAULT '0.00000000' COMMENT '计划买入数量',
          actual_qty DECIMAL(18,8) NOT NULL DEFAULT '0.00000000' COMMENT '已买入数量',
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY eth_pos_ledger_price_uniq (ledger_id, price),
          KEY eth_pos_ledger_idx (ledger_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ETH持仓档位表'
      `);
      console.log('[DB Init] ✅ eth_position_levels table ready');
    } catch (e) {
      console.warn('[DB Init] ⚠️ eth_position_levels table skipped:', e instanceof Error ? e.message : e);
    }
    // ===== 建立 eth_position_settings ETH持仓全局设置表 =====
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS \`eth_position_settings\` (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL COMMENT '账本ID',
          target_profit_cny DECIMAL(18,2) NOT NULL DEFAULT '0.00' COMMENT '目标止盈利润（人民币）',
          cny_rate DECIMAL(10,4) NOT NULL DEFAULT '7.2800' COMMENT 'USD/CNY汇率',
          target_eth_qty DECIMAL(18,8) NOT NULL DEFAULT '0.00000000' COMMENT '目标持仓ETH数量',
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY eth_settings_ledger_uniq (ledger_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ETH持仓全局设置表'
      `);
      console.log('[DB Init] ✅ eth_position_settings table ready');
    } catch (e) {
      console.warn('[DB Init] ⚠️ eth_position_settings table skipped:', e instanceof Error ? e.message : e);
    }

    // ===== 建立 eth_position_change_logs ETH持仓修改日志表 =====
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS \`eth_position_change_logs\` (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL COMMENT '账本ID',
          price INT NOT NULL COMMENT '档位价格',
          change_type ENUM('actual','planned') NOT NULL COMMENT '修改类型：已买/计划',
          old_value DECIMAL(18,8) NOT NULL COMMENT '修改前的值',
          new_value DECIMAL(18,8) NOT NULL COMMENT '修改后的值',
          note VARCHAR(500) NOT NULL DEFAULT '' COMMENT '用户备注',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX eth_log_ledger_idx (ledger_id),
          INDEX eth_log_ledger_price_idx (ledger_id, price)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ETH持仓修改日志表'
      `);
      console.log('[DB Init] ✅ eth_position_change_logs table ready');
    } catch (e) {
      console.warn('[DB Init] ⚠️ eth_position_change_logs table skipped:', e instanceof Error ? e.message : e);
    }

    // ===== 迁移 eth_position_levels：加 user_id 字段，更新唯一键 =====
    try {
      await db.execute(`ALTER TABLE \`eth_position_levels\` ADD COLUMN \`user_id\` INT NOT NULL DEFAULT 0 COMMENT '用户ID' AFTER \`ledger_id\``);
      console.log('[DB Init] ✅ eth_position_levels: user_id column added');
    } catch (e: any) {
      if (e.message?.includes('Duplicate column')) {
        console.log('[DB Init] eth_position_levels: user_id already exists, skip');
      } else {
        console.warn('[DB Init] ⚠️ eth_position_levels alter skipped:', e.message);
      }
    }
    try {
      await db.execute(`ALTER TABLE \`eth_position_levels\` DROP INDEX \`eth_pos_ledger_price_uniq\``);
    } catch (e: any) { /* ignore if already dropped */ }
    try {
      await db.execute(`ALTER TABLE \`eth_position_levels\` ADD UNIQUE KEY \`eth_pos_ledger_user_price_uniq\` (\`ledger_id\`, \`user_id\`, \`price\`)`);
      console.log('[DB Init] ✅ eth_position_levels: unique key updated');
    } catch (e: any) {
      if (!e.message?.includes('Duplicate key name')) {
        console.warn('[DB Init] ⚠️ eth_position_levels unique key skipped:', e.message);
      }
    }
    try {
      await db.execute(`ALTER TABLE \`eth_position_levels\` ADD INDEX \`eth_pos_user_idx\` (\`user_id\`)`);
    } catch (e: any) { /* ignore if already exists */ }

    // ===== 迁移 eth_position_settings：加 user_id 字段，更新唯一键 =====
    try {
      await db.execute(`ALTER TABLE \`eth_position_settings\` ADD COLUMN \`user_id\` INT NOT NULL DEFAULT 0 COMMENT '用户ID' AFTER \`ledger_id\``);
      console.log('[DB Init] ✅ eth_position_settings: user_id column added');
    } catch (e: any) {
      if (e.message?.includes('Duplicate column')) {
        console.log('[DB Init] eth_position_settings: user_id already exists, skip');
      } else {
        console.warn('[DB Init] ⚠️ eth_position_settings alter skipped:', e.message);
      }
    }
    try {
      await db.execute(`ALTER TABLE \`eth_position_settings\` DROP INDEX \`eth_settings_ledger_uniq\``);
    } catch (e: any) { /* ignore if already dropped */ }
    try {
      await db.execute(`ALTER TABLE \`eth_position_settings\` ADD UNIQUE KEY \`eth_settings_ledger_user_uniq\` (\`ledger_id\`, \`user_id\`)`);
      console.log('[DB Init] ✅ eth_position_settings: unique key updated');
    } catch (e: any) {
      if (!e.message?.includes('Duplicate key name')) {
        console.warn('[DB Init] ⚠️ eth_position_settings unique key skipped:', e.message);
      }
    }
    try {
      await db.execute(`ALTER TABLE \`eth_position_settings\` ADD INDEX \`eth_settings_user_idx\` (\`user_id\`)`);
    } catch (e: any) { /* ignore if already exists */ }

    // ===== 迁移 eth_position_change_logs：加 user_id 字段 =====
    try {
      await db.execute(`ALTER TABLE \`eth_position_change_logs\` ADD COLUMN \`user_id\` INT NOT NULL DEFAULT 0 COMMENT '用户ID' AFTER \`ledger_id\``);
      console.log('[DB Init] ✅ eth_position_change_logs: user_id column added');
    } catch (e: any) {
      if (e.message?.includes('Duplicate column')) {
        console.log('[DB Init] eth_position_change_logs: user_id already exists, skip');
      } else {
        console.warn('[DB Init] ⚠️ eth_position_change_logs alter skipped:', e.message);
      }
    }
    try {
      await db.execute(`ALTER TABLE \`eth_position_change_logs\` ADD INDEX \`eth_log_user_idx\` (\`user_id\`)`);
    } catch (e: any) { /* ignore if already exists */ }
    try {
      await db.execute(`ALTER TABLE \`eth_position_change_logs\` ADD INDEX \`eth_log_ledger_user_price_idx\` (\`ledger_id\`, \`user_id\`, \`price\`)`);
    } catch (e: any) { /* ignore if already exists */ }

    // ===== 把现有数据（user_id=0）迁移到 OWNER 的真实 user_id =====
    try {
      const ownerOpenId = process.env.OWNER_OPEN_ID;
      if (ownerOpenId) {
        const [ownerRows]: any = await db.execute(
          `SELECT id FROM \`users\` WHERE open_id = ? LIMIT 1`,
          [ownerOpenId]
        );
        if (ownerRows && ownerRows.length > 0) {
          const ownerId = ownerRows[0].id;
          await db.execute(`UPDATE \`eth_position_levels\` SET \`user_id\` = ? WHERE \`user_id\` = 0`, [ownerId]);
          await db.execute(`UPDATE \`eth_position_settings\` SET \`user_id\` = ? WHERE \`user_id\` = 0`, [ownerId]);
          await db.execute(`UPDATE \`eth_position_change_logs\` SET \`user_id\` = ? WHERE \`user_id\` = 0`, [ownerId]);
          console.log(`[DB Init] ✅ ETH持仓历史数据已迁移到 owner userId=${ownerId}`);
        } else {
          console.warn('[DB Init] ⚠️ OWNER_OPEN_ID 对应用户未找到，跳过历史数据迁移');
        }
      } else {
        console.warn('[DB Init] ⚠️ OWNER_OPEN_ID 未设置，跳过历史数据迁移');
      }
    } catch (e: any) {
      console.warn('[DB Init] ⚠️ ETH持仓历史数据迁移失败:', e.message);
    }

    // GTO 德州扑克笔记表
    await db.execute(`
      CREATE TABLE IF NOT EXISTS \`gto_notes\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`ledger_id\` INT NOT NULL,
        \`user_id\` INT NOT NULL,
        \`content\` TEXT NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`gto_notes_ledger_user_idx\` (\`ledger_id\`, \`user_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[DB Init] gto_notes table ready');

    // gto_hand_logs 牌局日志表
    await db.execute(`
      CREATE TABLE IF NOT EXISTS \`gto_hand_logs\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`user_id\` INT NOT NULL,
        \`ledger_id\` INT NOT NULL,
        \`table_size\` INT NOT NULL DEFAULT 6,
        \`position\` VARCHAR(16) NOT NULL,
        \`hole_cards\` VARCHAR(8) NOT NULL,
        \`preflop_action\` VARCHAR(32) NOT NULL,
        \`flop_cards\` VARCHAR(16) NOT NULL DEFAULT '',
        \`flop_action\` VARCHAR(32) NOT NULL DEFAULT '',
        \`turn_card\` VARCHAR(4) NOT NULL DEFAULT '',
        \`turn_action\` VARCHAR(32) NOT NULL DEFAULT '',
        \`river_card\` VARCHAR(4) NOT NULL DEFAULT '',
        \`river_action\` VARCHAR(32) NOT NULL DEFAULT '',
        \`result\` ENUM('win','lose','tie') NOT NULL,
        \`opponent_cards\` VARCHAR(16) NOT NULL DEFAULT '',
        \`is_bluff\` TINYINT(1) NOT NULL DEFAULT 0,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`gto_hand_logs_user_ledger_idx\` (\`user_id\`, \`ledger_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[DB Init] gto_hand_logs table ready');

    // 添加 merchant_products.pointsPrice 字段（积分兑换价格）
    const dbConnMerchant = await getDbConnection();
    if (dbConnMerchant) {
      await safeAddColumn(dbConnMerchant, 'merchant_products', 'pointsPrice', "INT NOT NULL DEFAULT 0 COMMENT '积分兑换价格（0=未设定）' AFTER `inPointsShop`");
      console.log('[DB Init] ✅ merchant_products.pointsPrice column checked');
    }

    // yaban_voice_segment: 录音分段临时转写缓存（每3分钟一段，分析完成后清空）
    const dbConnVoiceSeg = await getDbConnection();
    if (dbConnVoiceSeg) {
      await (dbConnVoiceSeg as any).execute(`
        CREATE TABLE IF NOT EXISTS \`yaban_voice_segment\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`tenant_id\` INT NOT NULL,
          \`customer_id\` INT NOT NULL,
          \`session_key\` VARCHAR(64) NOT NULL COMMENT '前端会话唯一标识',
          \`segment_index\` INT NOT NULL DEFAULT 0 COMMENT '段序号（从0开始）',
          \`raw_text\` TEXT NOT NULL COMMENT '该段转写文字',
          \`audio_url\` VARCHAR(512) DEFAULT NULL COMMENT 'COS音频文件URL',
          \`duration_sec\` INT NOT NULL DEFAULT 0 COMMENT '该段时长（秒）',
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_voice_seg\` (\`tenant_id\`, \`customer_id\`, \`session_key\`, \`segment_index\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('[DB Init] ✅ yaban_voice_segment table ready');
    }

    // ─── 确保 miban 四张核心表存在（CREATE TABLE IF NOT EXISTS）────────────────
    const dbConnMibanTables = await getDbConnection();
    if (dbConnMibanTables) {
      await (dbConnMibanTables as any).execute(`
        CREATE TABLE IF NOT EXISTS \`miban_rice_varieties\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`name\` VARCHAR(100) NOT NULL COMMENT '米种名称',
          \`description\` TEXT DEFAULT NULL,
          \`price_per_jin\` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '每斤价格(U)',
          \`image_url\` VARCHAR(512) DEFAULT NULL,
          \`is_active\` TINYINT NOT NULL DEFAULT 1,
          \`sort_order\` INT NOT NULL DEFAULT 0,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // 检查 miban_orders 是否用旧 snake_case 列名建的，如果是则 DROP 重建
      try {
        const [colCheck]: any = await (dbConnMibanTables as any).execute(
          `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='miban_orders' AND COLUMN_NAME='user_id'`
        );
        if (Number(colCheck?.[0]?.cnt ?? 0) > 0) {
          // 旧表用 snake_case，DROP 重建（此时表是空的，无数据损失）
          await (dbConnMibanTables as any).execute('DROP TABLE IF EXISTS `miban_orders`');
          console.log('[DB Init] ⚠️ miban_orders had old snake_case columns, dropped for rebuild');
        }
      } catch(e) { /* 表不存在时正常 */ }
      await (dbConnMibanTables as any).execute(`
        CREATE TABLE IF NOT EXISTS \`miban_orders\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`userId\` INT NOT NULL,
          \`orderNo\` VARCHAR(32) NOT NULL,
          \`recipeName\` VARCHAR(64) DEFAULT NULL,
          \`ingredients\` JSON NOT NULL,
          \`totalWeightJin\` DECIMAL(8,1) NOT NULL DEFAULT 0.0,
          \`totalPrice\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          \`status\` ENUM('pending','confirmed','packing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
          \`receiverName\` VARCHAR(64) DEFAULT NULL,
          \`receiverPhone\` VARCHAR(20) DEFAULT NULL,
          \`receiverAddress\` TEXT DEFAULT NULL,
          \`trackingNo\` VARCHAR(64) DEFAULT NULL,
          \`trackingCompany\` VARCHAR(32) DEFAULT NULL,
          \`userNote\` TEXT DEFAULT NULL,
          \`adminNote\` TEXT DEFAULT NULL,
          \`walletDeductCny\` DECIMAL(10,2) DEFAULT 0,
          \`walletDeductUsdt\` DECIMAL(18,8) DEFAULT 0,
          \`usdtCnyRateAtOrder\` DECIMAL(10,4) DEFAULT 0,
          \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_orderNo\` (\`orderNo\`),
          KEY \`idx_userId\` (\`userId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await (dbConnMibanTables as any).execute(`
        CREATE TABLE IF NOT EXISTS \`miban_cart_items\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`user_id\` INT DEFAULT NULL,
          \`session_id\` VARCHAR(64) DEFAULT NULL,
          \`rice_id\` VARCHAR(64) NOT NULL,
          \`rice_name\` VARCHAR(100) NOT NULL,
          \`weight_jin\` DECIMAL(10,2) NOT NULL DEFAULT 0,
          \`price_per_jin\` DECIMAL(10,4) NOT NULL DEFAULT 0,
          \`ratio\` INT NOT NULL DEFAULT 0,
          \`recipe_id\` VARCHAR(64) DEFAULT NULL,
          \`recipe_name\` VARCHAR(200) DEFAULT NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_user_id\` (\`user_id\`),
          KEY \`idx_session_id\` (\`session_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await (dbConnMibanTables as any).execute(`
        CREATE TABLE IF NOT EXISTS \`miban_saved_recipes\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`user_id\` INT NOT NULL,
          \`name\` VARCHAR(200) NOT NULL,
          \`ingredients\` JSON NOT NULL,
          \`total_weight_jin\` DECIMAL(10,2) NOT NULL DEFAULT 0,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_user_id\` (\`user_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // 标准米种仓库表
      await (dbConnMibanTables as any).execute(`
        CREATE TABLE IF NOT EXISTS \`miban_rice_catalog\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`stdName\` VARCHAR(100) NOT NULL COMMENT '标准名称',
          \`category\` VARCHAR(50) NOT NULL COMMENT '大类：粳米/籼米/糯米/特种米/杂粮',
          \`subCategory\` VARCHAR(50) DEFAULT NULL COMMENT '小类',
          \`origin\` VARCHAR(200) DEFAULT NULL COMMENT '主要产地',
          \`gbStandard\` VARCHAR(100) DEFAULT NULL COMMENT '国家标准编号',
          \`colorHex\` VARCHAR(20) NOT NULL DEFAULT '#C8A87A' COMMENT '代表色',
          \`description\` TEXT DEFAULT NULL COMMENT '描述',
          \`nutritionJson\` JSON DEFAULT NULL COMMENT '营养数据JSON',
          \`tagsJson\` JSON DEFAULT NULL COMMENT '标签JSON数组',
          \`img\` TEXT DEFAULT NULL COMMENT '图片URL',
          \`sortOrder\` INT NOT NULL DEFAULT 0,
          \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_stdName\` (\`stdName\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // 预填充标准米种数据（只在表为空时插入）
      const [catalogCountRows]: any = await (dbConnMibanTables as any).execute('SELECT COUNT(*) as cnt FROM `miban_rice_catalog`');
      if (Number((Array.isArray(catalogCountRows) ? catalogCountRows[0] : catalogCountRows)?.cnt ?? 0) === 0) {
        const catalogSeeds = [
          ['粳米（东北大米）','粳米','普通粳米','东北（黑龙江/吉林/辽宁）','GB/T 1354','#F5E6C8','颗粒圆润，口感软糯，是中国北方最主流的食用大米，蛋白质含量约7%，淀粉含量约75%。',JSON.stringify({protein:7.0,carbs:77.0,fat:0.8,fiber:0.6,calories:346}),JSON.stringify(['主粮','粳米','东北']),1],
          ['五常大米（稻花香2号）','粳米','地理标志粳米','黑龙江省五常市','GB/T 19266','#F0DDB0','国家地理标志产品，稻花香2号品种，米粒晶莹，香气浓郁，口感极佳，被誉为"中国最好的大米"之一。',JSON.stringify({protein:7.2,carbs:76.5,fat:0.9,fiber:0.5,calories:344}),JSON.stringify(['主粮','粳米','地理标志','五常']),2],
          ['盘锦大米','粳米','地理标志粳米','辽宁省盘锦市','GB/T 18824','#EDD9A3','国家地理标志产品，产自辽河三角洲湿地，米粒饱满，口感软糯，含有丰富的矿物质。',JSON.stringify({protein:7.1,carbs:76.8,fat:0.8,fiber:0.5,calories:345}),JSON.stringify(['主粮','粳米','地理标志','盘锦']),3],
          ['籼米（南方长粒米）','籼米','普通籼米','华南/华中（广东/湖南/江西）','GB/T 1354','#F2E0B6','颗粒细长，直链淀粉含量高，口感偏硬爽口，是南方主流大米，适合炒饭、煲仔饭。',JSON.stringify({protein:7.5,carbs:77.5,fat:0.6,fiber:0.4,calories:348}),JSON.stringify(['主粮','籼米','南方']),4],
          ['泰国香米（茉莉香米）','籼米','香型籼米','泰国（进口）','GB/T 1354','#EDD5A0','泰国原产茉莉花香米，米粒细长，具有天然茉莉花香，口感柔软，是东南亚最受欢迎的大米品种。',JSON.stringify({protein:7.0,carbs:78.0,fat:0.5,fiber:0.3,calories:350}),JSON.stringify(['主粮','籼米','进口','香米']),5],
          ['糯米（圆粒糯米）','糯米','粳糯','全国各地','GB/T 1354','#F8F0DC','支链淀粉含量接近100%，口感极黏糯，适合制作汤圆、粽子、年糕等传统食品。',JSON.stringify({protein:7.3,carbs:78.3,fat:1.0,fiber:0.5,calories:350}),JSON.stringify(['主粮','糯米']),6],
          ['黑米','特种米','有色米','云南/陕西/湖南','GB/T 20040','#2D1B4E','富含花青素、维生素E和铁元素，具有滋阴补肾、健脾暖肝的功效，是药食同源的代表性谷物。',JSON.stringify({protein:9.4,carbs:72.2,fat:2.5,fiber:3.9,calories:341}),JSON.stringify(['特种米','药食同源','有色米','黑米']),7],
          ['红米','特种米','有色米','云南/贵州/广西','GB/T 20040','#8B2E2E','富含花青素和铁元素，外皮呈红色，保留了更多的营养成分，具有补血养颜的功效。',JSON.stringify({protein:8.0,carbs:73.0,fat:1.8,fiber:2.5,calories:336}),JSON.stringify(['特种米','药食同源','有色米','红米']),8],
          ['糙米','特种米','全谷物','全国各地','GB/T 18810','#C8A87A','只去除稻壳保留麸皮和胚芽的全谷物大米，富含B族维生素、膳食纤维和矿物质，升糖指数低，适合控糖人群。',JSON.stringify({protein:7.9,carbs:73.1,fat:2.7,fiber:3.4,calories:348}),JSON.stringify(['特种米','全谷物','低GI','糙米']),9],
          ['小米（粟米）','杂粮','谷子','山西/内蒙古/河北','GB/T 11766','#F5C842','中国传统五谷之一，富含铁、锌、B族维生素，具有健脾和胃的功效，是月子期和病后调养的传统食材。',JSON.stringify({protein:9.0,carbs:73.5,fat:3.1,fiber:1.6,calories:361}),JSON.stringify(['杂粮','药食同源','小米']),10],
          ['薏米（薏苡仁）','杂粮','药食同源','贵州/福建/广西','GB/T 17891','#E8D5A3','药食同源食材，富含薏苡素，具有健脾祛湿、清热排脓的功效，是夏季祛湿的经典食材。',JSON.stringify({protein:12.8,carbs:69.1,fat:3.3,fiber:2.0,calories:357}),JSON.stringify(['杂粮','药食同源','薏米']),11],
          ['燕麦米','杂粮','全谷物','内蒙古/河北/山西','GB/T 7711','#D4B896','富含β-葡聚糖，可降低胆固醇，升糖指数低，是控糖、减脂人群的优选谷物。',JSON.stringify({protein:15.0,carbs:61.6,fat:6.7,fiber:5.3,calories:367}),JSON.stringify(['杂粮','全谷物','低GI','燕麦']),12],
          ['荞麦米','杂粮','药食同源','云南/四川/内蒙古','GB/T 10458','#8B7355','富含芦丁（维生素P），有助于降低血糖和血压，是糖尿病患者的友好食材，升糖指数极低。',JSON.stringify({protein:9.3,carbs:70.0,fat:2.3,fiber:6.5,calories:337}),JSON.stringify(['杂粮','药食同源','低GI','荞麦']),13],
          ['高粱米','杂粮','传统杂粮','东北/华北','GB/T 8231','#8B2500','中国传统五谷之一，富含鞣酸和铁元素，具有健脾止泻的功效，口感偏硬，适合与其他米种搭配食用。',JSON.stringify({protein:10.4,carbs:74.7,fat:3.1,fiber:4.3,calories:360}),JSON.stringify(['杂粮','传统五谷','高粱']),14],
          ['紫米（紫糯米）','特种米','有色米','云南西双版纳','GB/T 20040','#4A235A','云南少数民族传统食材，富含花青素和铁元素，具有补血益气、暖脾胃的功效，口感黏糯。',JSON.stringify({protein:8.3,carbs:72.2,fat:1.7,fiber:1.4,calories:343}),JSON.stringify(['特种米','药食同源','有色米','紫米']),15],
          ['绿豆','杂粮','豆类','全国各地','GB/T 10462','#4A7C59','药食同源食材，具有清热解毒、消暑利水的功效，富含蛋白质和膳食纤维，是夏季解暑的经典食材。',JSON.stringify({protein:21.6,carbs:55.6,fat:0.8,fiber:6.4,calories:316}),JSON.stringify(['杂粮','豆类','药食同源','绿豆']),16],
          ['红豆（赤小豆）','杂粮','豆类','全国各地','GB/T 10460','#8B1A1A','药食同源食材，具有利水消肿、解毒排脓的功效，富含铁元素，是补血养颜的传统食材。',JSON.stringify({protein:20.2,carbs:55.7,fat:0.6,fiber:7.7,calories:309}),JSON.stringify(['杂粮','豆类','药食同源','红豆']),17],
          ['莲子','杂粮','药食同源','湖南/福建/江西','药食同源目录','#F5E6C8','药食同源食材，具有补脾止泻、益肾涩精、养心安神的功效，富含钙、磷、钾。',JSON.stringify({protein:17.2,carbs:67.2,fat:2.0,fiber:3.0,calories:344}),JSON.stringify(['杂粮','药食同源','莲子']),18],
        ];
        for (const row of catalogSeeds) {
          await (dbConnMibanTables as any).execute(
            'INSERT IGNORE INTO `miban_rice_catalog` (stdName,category,subCategory,origin,gbStandard,colorHex,description,nutritionJson,tagsJson,sortOrder) VALUES (?,?,?,?,?,?,?,?,?,?)',
            row
          );
        }
        console.log('[DB Init] ✅ miban_rice_catalog seeded with 18 standard rice varieties');
      }
      console.log('[DB Init] ✅ miban core tables ready (CREATE IF NOT EXISTS)');
    }

    // 确保 users 表有 miban 相关字段（兼容旧部署）
    const dbConnMiban = await getDbConnection();
    if (dbConnMiban) {
      const mibanUserCols = [
        { name: 'miban_role', def: "ENUM('parent', 'baby') NOT NULL DEFAULT 'baby' COMMENT 'miban角色'" },
        { name: 'balance', def: "DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '余额'" },
        { name: 'wallet_enabled', def: "TINYINT NOT NULL DEFAULT 0 COMMENT '是否开通钱包'" },
        { name: 'highest_level_achieved', def: "INT NOT NULL DEFAULT 0 COMMENT '历史最高等级'" },
        { name: 'last_viewed_sharing_at', def: "DATETIME DEFAULT NULL COMMENT '最后查看分享时间'" },
        { name: 'real_name', def: "VARCHAR(50) DEFAULT NULL COMMENT '真实姓名'" },
        { name: 'phone', def: "VARCHAR(20) DEFAULT NULL COMMENT '手机号'" },
        { name: 'company', def: "VARCHAR(100) DEFAULT NULL COMMENT '公司'" },
        { name: 'business', def: "VARCHAR(200) DEFAULT NULL COMMENT '业务描述'" },
      ];
      for (const col of mibanUserCols) {
        await safeAddColumn(dbConnMiban as any, 'users', col.name, col.def);
      }
      console.log('[DB Init] ✅ users miban columns checked');
    }

    // 确保 miban_orders 表有钱包扣款记录字段（兼容旧部署）
    const dbConnMibanOrders = await getDbConnection();
    if (dbConnMibanOrders) {
      const mibanOrderCols = [
        { name: 'walletDeductCny', def: "DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'CNY扣款金额'" },
        { name: 'walletDeductUsdt', def: "DECIMAL(18,8) NOT NULL DEFAULT 0 COMMENT 'USDT扣款金额'" },
        { name: 'usdtCnyRateAtOrder', def: "DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT '下单时USDT/CNY汇率'" },
      ];
      for (const col of mibanOrderCols) {
        await safeAddColumn(dbConnMibanOrders as any, 'miban_orders', col.name, col.def);
      }
      console.log('[DB Init] ✅ miban_orders wallet columns checked');
    }

    console.log("[DB Init] Database initialization completed successfully");
  } catch (error) {
    console.error("[DB Init] Error during database initialization:", error);
    // 不抛出错误，避免影响应用启动
  }
}
