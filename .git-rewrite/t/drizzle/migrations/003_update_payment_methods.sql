-- 更新user_profiles表，添加支付方式和收款码字段

-- 添加支付方式枚举字段
ALTER TABLE `user_profiles` 
ADD COLUMN `payment_method` ENUM('bank_card', 'digital_wallet', 'alipay', 'wechat') AFTER `verified_at`;

-- 添加数字钱包相关字段
ALTER TABLE `user_profiles` 
ADD COLUMN `wallet_network` VARCHAR(50) AFTER `bank_account_name`,
ADD COLUMN `wallet_qr_code_url` TEXT AFTER `digital_wallet_address`;

-- 添加支付宝相关字段
ALTER TABLE `user_profiles` 
ADD COLUMN `alipay_account_name` VARCHAR(100) AFTER `alipay_account`,
ADD COLUMN `alipay_qr_code_url` TEXT AFTER `alipay_account_name`;

-- 添加微信相关字段
ALTER TABLE `user_profiles` 
ADD COLUMN `wechat_qr_code_url` TEXT AFTER `alipay_qr_code_url`,
ADD COLUMN `wechat_account_name` VARCHAR(100) AFTER `wechat_qr_code_url`;

-- 删除旧的微信账号字段（如果存在）
ALTER TABLE `user_profiles` 
DROP COLUMN IF EXISTS `wechat_account`;
