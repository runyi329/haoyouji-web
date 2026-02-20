-- 脉动节点工作平台 - 数据库迁移脚本
-- 创建时间: 2026-02-21

-- 1. 创建工作群表
CREATE TABLE IF NOT EXISTS `work_groups` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL COMMENT '工作群名称',
  `description` TEXT COMMENT '工作群描述',
  `icon` TEXT COMMENT '工作群图标',
  `created_by` INT NOT NULL COMMENT '创建者用户ID',
  `owner_id` INT NOT NULL COMMENT '所有者用户ID',
  `is_archived` TINYINT DEFAULT 0 NOT NULL COMMENT '是否已归档',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_owner_id` (`owner_id`),
  INDEX `idx_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作群表（脉动节点工作平台）';

-- 2. 在ledgers表中添加group_id字段
ALTER TABLE `ledgers` 
ADD COLUMN `group_id` INT DEFAULT NULL COMMENT '所属工作群ID，为null表示普通账本' AFTER `owner_id`,
ADD INDEX `idx_group_id` (`group_id`);
