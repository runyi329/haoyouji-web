-- 创建AI会话表
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
  INDEX idx_updated_at (updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建AI消息表
CREATE TABLE IF NOT EXISTS ai_messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content TEXT NOT NULL,
  tokens_used INT NOT NULL DEFAULT 0,
  cost DECIMAL(10, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
