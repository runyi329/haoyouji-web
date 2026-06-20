-- 添加 require_image 字段到 ledgers 表
-- 用于控制记账时是否必须上传图片

-- 检查字段是否存在，不存在则添加
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'ledgers' 
AND COLUMN_NAME = 'require_image';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE ledgers ADD COLUMN require_image TINYINT NOT NULL DEFAULT 0 COMMENT ''是否要求记账必须上传图片: 0=不要求, 1=要求''',
  'SELECT ''Column require_image already exists'' AS message');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
