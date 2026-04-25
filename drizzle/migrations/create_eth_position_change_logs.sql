CREATE TABLE IF NOT EXISTS `eth_position_change_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ledger_id` int NOT NULL,
  `price` int NOT NULL,
  `change_type` enum('actual','planned') NOT NULL,
  `old_value` decimal(18,8) NOT NULL,
  `new_value` decimal(18,8) NOT NULL,
  `note` varchar(500) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `eth_log_ledger_idx` (`ledger_id`),
  INDEX `eth_log_ledger_price_idx` (`ledger_id`, `price`)
);
