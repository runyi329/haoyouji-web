-- 给users表添加balance字段
-- 注意：如果字段已存在会报错，但不影响后续SQL执行
ALTER TABLE users ADD COLUMN balance DECIMAL(20, 8) DEFAULT 0 NOT NULL COMMENT '用户余额';
