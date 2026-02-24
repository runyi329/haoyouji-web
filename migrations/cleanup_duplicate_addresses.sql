-- 清理重复的钱包地址，只保留第一个
-- 查找重复的地址
DELETE FROM wallet_addresses
WHERE id NOT IN (
  SELECT MIN(id)
  FROM wallet_addresses
  GROUP BY address, network
);
