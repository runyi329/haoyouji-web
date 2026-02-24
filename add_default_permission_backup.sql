-- 为 ledgers 表添加 default_permission_backup 字段
ALTER TABLE `ledgers` 
ADD COLUMN `default_permission_backup` ENUM('allow', 'none') NOT NULL DEFAULT 'allow' 
AFTER `default_permission_delete`;
