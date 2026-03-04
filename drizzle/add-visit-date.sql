-- 添加 visitDate 字段到 beauty_visit_logs 表
ALTER TABLE `beauty_visit_logs` ADD COLUMN `visitDate` varchar(20) NULL COMMENT '消费日期 YYYY-MM-DD，为空则使用createdAt';
