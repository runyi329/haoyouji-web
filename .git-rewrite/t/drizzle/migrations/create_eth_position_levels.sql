CREATE TABLE IF NOT EXISTS `eth_position_levels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ledger_id` int NOT NULL,
  `price` int NOT NULL,
  `planned_qty` decimal(18,8) NOT NULL DEFAULT '0',
  `actual_qty` decimal(18,8) NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `eth_pos_ledger_price_uniq` (`ledger_id`, `price`),
  KEY `eth_pos_ledger_idx` (`ledger_id`)
);
