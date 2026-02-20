import { getDb } from "./db";

/**
 * 数据库初始化模块
 * 在应用启动时自动检查并创建必要的表
 */

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

    console.log("[DB Init] Database initialization completed successfully");
  } catch (error) {
    console.error("[DB Init] Error during database initialization:", error);
    // 不抛出错误，避免影响应用启动
  }
}
