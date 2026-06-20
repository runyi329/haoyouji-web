-- 创建未匹配交易记录表（用于管理员手动处理）
CREATE TABLE IF NOT EXISTS unmatched_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  txn_hash VARCHAR(100) NOT NULL COMMENT '交易哈希',
  amount DECIMAL(20, 8) NOT NULL COMMENT '到账金额',
  from_address VARCHAR(100) DEFAULT '' COMMENT '转账来源地址',
  status ENUM('pending', 'resolved', 'ignored') DEFAULT 'pending' NOT NULL COMMENT '处理状态',
  resolved_order_id INT COMMENT '关联的订单ID（手动处理后）',
  resolved_by INT COMMENT '处理人ID',
  resolved_at TIMESTAMP NULL COMMENT '处理时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY uk_txn_hash (txn_hash),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='未匹配交易记录表';
