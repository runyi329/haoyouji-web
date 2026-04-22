CREATE TABLE IF NOT EXISTS `eth_position_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ledger_id` int NOT NULL,
  `target_profit_cny` decimal(18,2) NOT NULL DEFAULT '0.00',
  `cny_rate` decimal(10,4) NOT NULL DEFAULT '7.2800',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `eth_settings_ledger_uniq` (`ledger_id`)
);
