-- 添加 backup_count 字段到 ledger_backup_settings 表（幂等执行）
SET @dbname = DATABASE();
SET @tablename = 'ledger_backup_settings';
SET @columnname = 'backup_count';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE ledger_backup_settings ADD COLUMN backup_count INT NOT NULL DEFAULT 0 AFTER enabled'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
