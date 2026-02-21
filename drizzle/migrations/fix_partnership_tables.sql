-- =====================================================
-- 修复工作群表 - 添加缺失的 updated_at 列
-- =====================================================

-- 给 partnerships 表添加 updated_at 列（如果不存在）
ALTER TABLE `partnerships` ADD COLUMN IF NOT EXISTS `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 给 partnership_work_groups 表添加 updated_at 列（如果不存在）
ALTER TABLE `partnership_work_groups` ADD COLUMN IF NOT EXISTS `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 确保初始数据存在
INSERT IGNORE INTO `partnerships` (`id`, `name`, `description`) VALUES 
(1, '上海煦斌教育科技合伙企业（有限合伙）', '有限合伙企业');

INSERT IGNORE INTO `partnership_work_groups` (`id`, `partnership_id`, `name`, `description`) VALUES 
(1, 1, '工作群1', '第一个工作群'),
(2, 1, '工作群2', '第二个工作群'),
(3, 1, '工作群3', '第三个工作群');
