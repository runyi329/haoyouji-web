-- 为 equity_investments 表添加投资人姓名和身份证字段
-- 执行时间：2026-02-13

ALTER TABLE `equity_investments`
ADD COLUMN `investor_name` VARCHAR(100) NULL COMMENT '投资人姓名' AFTER `user_id`,
ADD COLUMN `investor_id_card` VARCHAR(18) NULL COMMENT '投资人身份证号' AFTER `investor_name`;
