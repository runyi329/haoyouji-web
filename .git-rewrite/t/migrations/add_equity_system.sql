-- 股权激励系统数据库表结构
-- 创建时间: 2026-02-13

-- 1. 投资记录表
CREATE TABLE IF NOT EXISTS equity_investments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '股东用户ID',
  investment_amount DECIMAL(15, 2) NOT NULL DEFAULT 0 COMMENT '投资金额（元）',
  investment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '投资日期',
  notes TEXT COMMENT '备注',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_investment_date (investment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='股权投资记录表';

-- 2. 股权规则配置表
CREATE TABLE IF NOT EXISTS equity_rules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  rule_key VARCHAR(100) NOT NULL UNIQUE COMMENT '规则键名',
  rule_value DECIMAL(10, 4) NOT NULL COMMENT '规则值',
  rule_description TEXT COMMENT '规则描述',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rule_key (rule_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='股权规则配置表';

-- 3. 贡献股份记录表
CREATE TABLE IF NOT EXISTS equity_contributions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  contribution_type VARCHAR(50) NOT NULL COMMENT '贡献类型: invite(邀请), referral_network(人脉贡献), other',
  contribution_value DECIMAL(10, 4) NOT NULL COMMENT '贡献值（股份百分比）',
  related_user_id INT COMMENT '关联用户ID（如被邀请人）',
  description TEXT COMMENT '贡献描述',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_contribution_type (contribution_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='股权贡献记录表';

-- 插入默认规则配置
INSERT INTO equity_rules (rule_key, rule_value, rule_description) VALUES
('investment_pool_percentage', 33.3333, '投资股份池占总股本的百分比'),
('contribution_pool_percentage', 66.6667, '贡献股份池占总股本的百分比'),
('invite_per_user_percentage', 0.05, '每邀请1个用户获得的股份百分比'),
('referral_network_per_100_percentage', 0.02, '被邀请人每增加100人脉获得的股份百分比')
ON DUPLICATE KEY UPDATE 
  rule_value = VALUES(rule_value),
  rule_description = VALUES(rule_description);
