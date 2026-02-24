-- 修复钱包地址重复问题
-- 1. 删除重复的地址记录（保留id最小的那条）
DELETE w1 FROM wallet_addresses w1
INNER JOIN wallet_addresses w2
WHERE w1.id > w2.id
  AND w1.address = w2.address
  AND w1.network = w2.network;

-- 2. 添加唯一索引防止未来重复（如果不存在）
-- 先检查索引是否已存在，不存在则创建
SET @indexExists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'wallet_addresses' 
  AND INDEX_NAME = 'wallet_addresses_address_network_uk'
);

SET @sql = IF(@indexExists = 0, 
  'ALTER TABLE wallet_addresses ADD UNIQUE KEY wallet_addresses_address_network_uk (address, network)', 
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
