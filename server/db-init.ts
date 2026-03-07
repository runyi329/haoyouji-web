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

    console.log("[DB Init] Database initialization completed successfully");
  } catch (error) {
    console.error("[DB Init] Error during database initialization:", error);
    // 不抛出错误，避免影响应用启动
  }
}
