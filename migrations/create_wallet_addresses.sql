-- 创建收款地址管理表
CREATE TABLE IF NOT EXISTS `wallet_addresses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `address` varchar(100) NOT NULL COMMENT '钱包地址',
  `network` varchar(20) NOT NULL COMMENT '网络类型：TRC20, ERC20, BEP20',
  `label` varchar(50) DEFAULT NULL COMMENT '备注名称',
  `enabled` tinyint NOT NULL DEFAULT 1 COMMENT '是否启用：1启用 0禁用',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wallet_addresses_address_network_uk` (`address`, `network`),
  INDEX `wallet_addresses_network_idx` (`network`),
  INDEX `wallet_addresses_enabled_idx` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入默认的TRC20收款地址（有唯一索引，不会重复插入）
INSERT IGNORE INTO `wallet_addresses` (`address`, `network`, `label`, `enabled`)
VALUES ('TTHZ7NvpKSMCyU3JNLLN6zZNruysy5emQJ', 'TRC20', '默认TRC20钱包', 1);
