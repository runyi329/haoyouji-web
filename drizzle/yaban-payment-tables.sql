-- 齿科商城支付模块建表 SQL（多租户：每家医院钱进各自商户）
-- 敏感字段(密钥/证书/私钥)由后端 AES 加密后存储，库内为密文

-- 1. 医院支付商户配置表：一家医院(tenant)一条
CREATE TABLE IF NOT EXISTS `shop_merchant_config` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL COMMENT '租户(医院)ID，对应 shop_order.tenant_id',
  `merchant_name` VARCHAR(128) DEFAULT NULL COMMENT '商户/医院名称(备注用)',
  `mode` VARCHAR(16) NOT NULL DEFAULT 'sandbox' COMMENT '运行模式 sandbox模拟支付 / live真实支付',

  -- 微信支付配置
  `wx_enabled` TINYINT NOT NULL DEFAULT '0' COMMENT '是否启用微信支付 1是 0否',
  `wx_appid` VARCHAR(64) DEFAULT NULL COMMENT '微信AppID(公众号/小程序)',
  `wx_mch_id` VARCHAR(64) DEFAULT NULL COMMENT '微信商户号',
  `wx_api_key_enc` TEXT DEFAULT NULL COMMENT '微信APIv3密钥(AES加密密文)',
  `wx_cert_serial` VARCHAR(128) DEFAULT NULL COMMENT '微信商户证书序列号',
  `wx_private_key_enc` TEXT DEFAULT NULL COMMENT '微信商户私钥(AES加密密文)',

  -- 支付宝配置
  `ali_enabled` TINYINT NOT NULL DEFAULT '0' COMMENT '是否启用支付宝 1是 0否',
  `ali_appid` VARCHAR(64) DEFAULT NULL COMMENT '支付宝应用AppID',
  `ali_private_key_enc` TEXT DEFAULT NULL COMMENT '支付宝应用私钥(AES加密密文)',
  `ali_public_key_enc` TEXT DEFAULT NULL COMMENT '支付宝公钥(AES加密密文)',

  `is_active` TINYINT NOT NULL DEFAULT '1' COMMENT '配置是否启用 1是 0否',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_merchant_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='医院支付商户配置表(多租户)';

-- 2. 支付单表：与订单解耦，一个订单可多次支付(定金+尾款/失败重试)
CREATE TABLE IF NOT EXISTS `shop_payment` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `payment_no` VARCHAR(40) NOT NULL COMMENT '支付单号(唯一)',
  `tenant_id` INT NOT NULL COMMENT '租户(医院)ID',
  `order_id` INT NOT NULL COMMENT '关联订单ID(shop_order.id)',
  `order_no` VARCHAR(32) NOT NULL COMMENT '关联订单号(冗余便于对账)',
  `user_id` INT NOT NULL COMMENT '支付用户ID',
  `channel` VARCHAR(16) NOT NULL COMMENT '支付渠道 wechat/alipay/mock',
  `amount` DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT '支付金额(元)',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '支付状态 pending待支付/success成功/failed失败/closed关闭/refunded已退款',
  `mode` VARCHAR(16) NOT NULL DEFAULT 'sandbox' COMMENT '本次支付模式 sandbox/live',
  `prepay_id` VARCHAR(128) DEFAULT NULL COMMENT '微信预支付ID/支付宝交易创建返回',
  `trade_no` VARCHAR(128) DEFAULT NULL COMMENT '第三方交易流水号(微信transaction_id/支付宝trade_no)',
  `callback_raw` TEXT DEFAULT NULL COMMENT '支付回调原始报文(留存对账)',
  `paid_at` TIMESTAMP NULL DEFAULT NULL COMMENT '支付成功时间',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payment_no` (`payment_no`),
  KEY `idx_payment_order` (`order_id`),
  KEY `idx_payment_tenant` (`tenant_id`),
  KEY `idx_payment_status` (`status`),
  KEY `idx_payment_trade` (`trade_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='支付单表(与订单解耦,支持多渠道多次支付)';

-- 3. 为默认医院(tenant_id=1)插入一条默认配置(模拟模式)，便于现在就能跑通流程
INSERT INTO `shop_merchant_config` (`tenant_id`, `merchant_name`, `mode`, `wx_enabled`, `ali_enabled`, `is_active`)
VALUES (1, '默认门店(演示)', 'sandbox', 1, 1, 1)
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;
