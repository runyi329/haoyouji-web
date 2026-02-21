-- 创建合伙人平台看板配置表
CREATE TABLE IF NOT EXISTS `partnership_dashboard_activities` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `partnership_id` INT NOT NULL DEFAULT 1,
  `user_name` VARCHAR(100) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `time_text` VARCHAR(100) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `partnership_dashboard_alerts` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `partnership_id` INT NOT NULL DEFAULT 1,
  `type` VARCHAR(20) NOT NULL DEFAULT 'warning',
  `message` TEXT NOT NULL,
  `action_text` VARCHAR(255) NOT NULL DEFAULT '',
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);

-- 插入默认数据
INSERT INTO `partnership_dashboard_activities` (`partnership_id`, `user_name`, `action`, `time_text`, `sort_order`)
VALUES
  (1, '张三', '记账', '2小时前', 1),
  (1, '李四', '更新', '5小时前', 2),
  (1, '王五', '记账', '1天前', 3);

INSERT INTO `partnership_dashboard_alerts` (`partnership_id`, `type`, `message`, `action_text`, `sort_order`)
VALUES
  (1, 'warning', '有3位伙伴已连续3天未联络新人', '建议介入辅导', 1),
  (1, 'info', '本周新增2位潜在高级用户', '及时跟进', 2);
