-- 添加新加入成员的默认备份权限字段
-- 如果字段已存在则跳过（使用 IF NOT EXISTS 或者忽略错误）

-- 检查字段是否存在，不存在则添加
SET @dbname = DATABASE();
SET @tablename = 'ledgers';
SET @columnname = 'default_permission_backup';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1', -- 字段已存在，执行空操作
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` ENUM(''allow'', ''none'') NOT NULL DEFAULT ''allow'' AFTER `default_permission_delete`')
));

PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
