-- 创建行为估值权重配置表
CREATE TABLE IF NOT EXISTS valuation_weights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action_type VARCHAR(50) NOT NULL UNIQUE COMMENT '行为类型（如new_user, complete_tag等）',
  action_name VARCHAR(100) NOT NULL COMMENT '行为名称（如"新增用户"）',
  weight_value DECIMAL(10,2) NOT NULL DEFAULT 100.00 COMMENT '估值增量（元）',
  is_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  description TEXT COMMENT '行为描述',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='行为估值权重配置表';

-- 插入默认配置
INSERT INTO valuation_weights (action_type, action_name, weight_value, is_enabled, description) VALUES
('new_user', '新增用户', 100.00, 1, '每新增一个用户对平台估值的贡献'),
('complete_tag', '完善标签', 50.00, 1, '每完善一个人脉标签对平台估值的贡献'),
('share_contact', '共享人脉', 80.00, 1, '每共享一个人脉对平台估值的贡献'),
('business_match', '业务撮合', 500.00, 1, '每完成一次业务撮合对平台估值的贡献'),
('active_interaction', '活跃互动', 20.00, 1, '每次活跃互动对平台估值的贡献');

-- 创建实时估值历史记录表
CREATE TABLE IF NOT EXISTS valuation_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  total_valuation DECIMAL(15,2) NOT NULL COMMENT '总估值（元）',
  action_type VARCHAR(50) COMMENT '触发的行为类型',
  action_count INT DEFAULT 1 COMMENT '行为发生次数',
  increment_amount DECIMAL(10,2) COMMENT '本次增量（元）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at),
  INDEX idx_action_type (action_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实时估值历史记录表';

-- 插入初始估值记录
INSERT INTO valuation_history (total_valuation, action_type, action_count, increment_amount) VALUES
(8520000.00, 'initial', 0, 0);
