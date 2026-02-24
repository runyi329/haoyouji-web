-- 给users表添加balance字段
ALTER TABLE users ADD COLUMN balance DECIMAL(20, 8) DEFAULT 0 NOT NULL COMMENT '用户余额';

-- 创建充值订单表
CREATE TABLE IF NOT EXISTS recharge_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_no VARCHAR(50) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL COMMENT '充值金额（带小数的唯一金额）',
  currency VARCHAR(10) DEFAULT 'USDT' NOT NULL,
  network VARCHAR(20) DEFAULT 'TRC20' NOT NULL,
  status ENUM('pending', 'completed', 'expired', 'cancelled') DEFAULT 'pending' NOT NULL,
  txn_hash VARCHAR(100) COMMENT '交易哈希',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  completed_at TIMESTAMP NULL,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_order_no (order_no),
  INDEX idx_amount_status (amount, status),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='充值订单表';

-- 创建余额变动记录表
CREATE TABLE IF NOT EXISTS balance_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(20, 8) NOT NULL COMMENT '变动金额（正数为增加，负数为减少）',
  type ENUM('recharge', 'consume', 'refund', 'reward', 'withdraw') NOT NULL,
  related_id INT COMMENT '关联订单ID',
  balance DECIMAL(20, 8) NOT NULL COMMENT '变动后的余额',
  description TEXT COMMENT '描述',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='余额变动记录表';
