-- 添加 backup_count 字段到 ledger_backup_settings 表
ALTER TABLE ledger_backup_settings ADD COLUMN backup_count INT NOT NULL DEFAULT 0 AFTER enabled;
