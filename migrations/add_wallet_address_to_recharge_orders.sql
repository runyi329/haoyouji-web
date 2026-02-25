-- 添加 wallet_address 字段到 recharge_orders 表
ALTER TABLE `recharge_orders` 
ADD COLUMN `wallet_address` VARCHAR(255) NULL COMMENT '收款钱包地址' 
AFTER `network`;

-- 为现有的 APTOS 订单补充地址（如果知道的话）
UPDATE `recharge_orders` 
SET `wallet_address` = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d'
WHERE `network` = 'APTOS' 
  AND `wallet_address` IS NULL
  AND `order_no` = 'CHG1771986246733318';
