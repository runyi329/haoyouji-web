-- AF 资金费率设置表
CREATE TABLE IF NOT EXISTS `af_funding_rate_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ledger_id` int NOT NULL,
  `user_id` int NOT NULL,
  `enabled` tinyint NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `af_fr_settings_ledger_user_uniq` (`ledger_id`, `user_id`),
  KEY `af_fr_settings_ledger_idx` (`ledger_id`),
  KEY `af_fr_settings_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AF 资金费率日志表
CREATE TABLE IF NOT EXISTS `af_funding_rate_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ledger_id` int NOT NULL,
  `user_id` int NOT NULL,
  `balance_snapshot` decimal(20,8) NOT NULL,
  `amount` decimal(20,8) NOT NULL,
  `total_accumulated` decimal(20,8) NOT NULL,
  `annual_rate` decimal(8,4) NOT NULL DEFAULT 0.1200,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `af_fr_logs_ledger_user_idx` (`ledger_id`, `user_id`),
  KEY `af_fr_logs_created_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
