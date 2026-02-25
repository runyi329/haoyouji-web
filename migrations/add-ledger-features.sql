-- 添加账本功能管理字段
-- 在 ledgers 表添加功能开关字段

ALTER TABLE ledgers 
ADD COLUMN enable_reimbursement TINYINT DEFAULT 1 NOT NULL COMMENT '是否启用报销功能（1=启用，0=禁用）',
ADD COLUMN enable_pending TINYINT DEFAULT 0 NOT NULL COMMENT '是否启用待结功能（1=启用，0=禁用）';

-- 在 ledger_records 表添加待结类型字段
ALTER TABLE ledger_records
ADD COLUMN pending_type ENUM('receivable', 'payable') DEFAULT NULL COMMENT '待结类型（receivable=代收，payable=代付，NULL=无）';

-- 创建索引以提高查询性能
CREATE INDEX idx_pending_type ON ledger_records(pending_type);
