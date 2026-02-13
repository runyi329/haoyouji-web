-- 估值历史表
CREATE TABLE IF NOT EXISTS equity_valuation_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  valuation DECIMAL(15,2) NOT NULL COMMENT '公司估值',
  record_date DATE NOT NULL COMMENT '记录日期',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_date (record_date DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公司估值历史';

-- 股权动态表
CREATE TABLE IF NOT EXISTS equity_activities (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  activity_type ENUM('investment', 'invite') NOT NULL COMMENT '动态类型',
  value DECIMAL(15,2) COMMENT '金额或数量',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at DESC),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='股权动态记录';

-- 插入公司估值配置
INSERT INTO equity_rules (rule_key, rule_value, rule_description) 
VALUES ('company_valuation', '5000000', '公司当前估值（元）')
ON DUPLICATE KEY UPDATE rule_description = '公司当前估值（元）';

-- 插入初始估值历史
INSERT INTO equity_valuation_history (valuation, record_date) 
VALUES (5000000.00, '2026-01-01')
ON DUPLICATE KEY UPDATE valuation = valuation;

