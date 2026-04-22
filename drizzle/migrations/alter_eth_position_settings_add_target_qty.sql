ALTER TABLE `eth_position_settings` ADD COLUMN IF NOT EXISTS `target_eth_qty` decimal(18,8) NOT NULL DEFAULT '0.00000000';
