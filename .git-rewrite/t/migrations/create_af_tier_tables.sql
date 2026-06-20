-- 无损合约收益权档位触发记录表
CREATE TABLE IF NOT EXISTS af_order_tier_triggers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL COMMENT '关联 af_orders 表 ID',
  ledger_id INT NOT NULL COMMENT '账本 ID',
  coin VARCHAR(10) NOT NULL COMMENT '币种 BTC/ETH/SOL',
  tier INT NOT NULL COMMENT '档位 1-9（1=跌10%，2=跌20%...）',
  trigger_price VARCHAR(50) NOT NULL COMMENT '触发时的币价',
  triggered_at BIGINT NOT NULL COMMENT '触发时间戳（毫秒）',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_order_tier (order_id, tier),
  INDEX idx_order_id (order_id),
  INDEX idx_ledger_id (ledger_id)
) COMMENT='无损合约收益权档位触发记录';

-- 价格扫描日志表（记录每次4小时扫描结果）
CREATE TABLE IF NOT EXISTS af_price_scan_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  coin VARCHAR(10) NOT NULL COMMENT '币种',
  low_price VARCHAR(50) NOT NULL COMMENT '4小时区间最低价',
  scanned_at BIGINT NOT NULL COMMENT '扫描时间戳（毫秒）',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_coin_scanned (coin, scanned_at)
) COMMENT='无损合约价格扫描日志';
