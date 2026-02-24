-- 创建银行卡表
CREATE TABLE IF NOT EXISTS `bank_cards` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `card_number` TEXT NOT NULL COMMENT '银行卡号（加密存储）',
  `card_holder` TEXT NOT NULL COMMENT '持卡人姓名（加密存储）',
  `bank_name` VARCHAR(100) NOT NULL COMMENT '开户行名称',
  `card_type` ENUM('debit', 'credit') NOT NULL DEFAULT 'debit' COMMENT '卡类型：debit=借记卡，credit=信用卡',
  `is_default` TINYINT NOT NULL DEFAULT 0 COMMENT '是否默认卡',
  `notes` TEXT COMMENT '备注',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `bank_cards_user_id_idx` (`user_id`),
  INDEX `bank_cards_is_default_idx` (`is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='银行卡表';

-- 创建数字钱包表
CREATE TABLE IF NOT EXISTS `digital_wallets` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `wallet_type` ENUM('blockchain', 'alipay', 'wechat', 'other') NOT NULL COMMENT '钱包类型：blockchain=区块链钱包，alipay=支付宝，wechat=微信支付，other=其他',
  `network` VARCHAR(50) COMMENT '区块链网络：TRC20, ERC20, BEP20等',
  `wallet_address` TEXT COMMENT '钱包地址（加密存储）',
  `currency` VARCHAR(20) COMMENT '币种：USDT, USDC, ETH, BTC等',
  `account` TEXT COMMENT '支付宝/微信账号/手机号（加密存储）',
  `account_name` TEXT COMMENT '支付宝/微信账户名（加密存储）',
  `is_default` TINYINT NOT NULL DEFAULT 0 COMMENT '是否默认钱包',
  `notes` TEXT COMMENT '备注',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `digital_wallets_user_id_idx` (`user_id`),
  INDEX `digital_wallets_is_default_idx` (`is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数字钱包表';
