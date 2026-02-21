-- 给 partnership_work_groups 表添加 updated_at 列
ALTER TABLE `partnership_work_groups` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
