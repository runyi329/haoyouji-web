-- 为 ledger_records 表添加软删除字段
ALTER TABLE ledger_records ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE ledger_records ADD COLUMN deleted_by INT NULL DEFAULT NULL;

-- 添加索引以加速查询已删除/未删除记录
CREATE INDEX idx_ledger_records_deleted_at ON ledger_records(deleted_at);
