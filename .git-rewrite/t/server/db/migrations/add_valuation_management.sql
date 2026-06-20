-- 市值管理：行为估值权重配置表
CREATE TABLE IF NOT EXISTS valuation_weights (
  id INT PRIMARY KEY AUTO_INCREMENT,
  action_type VARCHAR(50) NOT NULL UNIQUE COMMENT '行为类型',
  action_name VARCHAR(100) NOT NULL COMMENT '行为名称',
  weight_value DECIMAL(10, 2) NOT NULL DEFAULT 0 COMMENT '估值增量（元）',
  is_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  description TEXT COMMENT '行为描述',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='市值管理-行为估值权重配置';

-- 插入默认配置
INSERT INTO valuation_weights (action_type, action_name, weight_value, description) VALUES
('new_user', '新增用户', 100.00, '每新增一个用户，平台估值增加的金额'),
('complete_tag', '完善标签', 50.00, '每完善一个人脉标签，平台估值增加的金额'),
('share_contact', '共享人脉', 80.00, '每共享一次人脉，平台估值增加的金额'),
('business_match', '业务撮合', 500.00, '每成功撮合一次业务，平台估值增加的金额'),
('active_interaction', '活跃互动', 20.00, '每次活跃互动，平台估值增加的金额');

-- 市值管理：实时估值记录表
CREATE TABLE IF NOT EXISTS valuation_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  total_valuation DECIMAL(15, 2) NOT NULL COMMENT '总估值（元）',
  action_type VARCHAR(50) COMMENT '触发的行为类型',
  action_count INT DEFAULT 1 COMMENT '行为发生次数',
  increment_amount DECIMAL(10, 2) COMMENT '本次增量（元）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='市值管理-实时估值历史记录';

-- 插入初始估值
INSERT INTO valuation_history (total_valuation, action_type, increment_amount) 
VALUES (0, 'init', 0);
