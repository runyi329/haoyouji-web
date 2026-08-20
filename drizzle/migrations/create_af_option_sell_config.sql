-- 卖期权设置表：管理员配置每个到期日+行权价档位的锁仓优惠
CREATE TABLE IF NOT EXISTS af_option_sell_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ledger_id INT NOT NULL DEFAULT 52,
  coin VARCHAR(10) NOT NULL DEFAULT 'ETH',
  expiry_label VARCHAR(20) NOT NULL COMMENT '到期日标签，如 28AUG26',
  expiry_date DATE NOT NULL COMMENT '到期日期',
  strike_price DECIMAL(12,2) NOT NULL COMMENT '行权价（即委买价格档位）',
  option_type VARCHAR(10) NOT NULL DEFAULT 'PUT' COMMENT 'PUT/CALL',
  instrument_name VARCHAR(60) NOT NULL COMMENT '标准合约名称，如 ETH-28AUG26-1500-P',
  monthly_yield DECIMAL(6,4) NOT NULL DEFAULT 0 COMMENT '月化收益率，如 0.08 表示 8%',
  enabled TINYINT NOT NULL DEFAULT 0 COMMENT '0=未启用, 1=已启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ledger_instrument (ledger_id, instrument_name),
  INDEX idx_ledger_coin_enabled (ledger_id, coin, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 订单表新增锁仓字段
ALTER TABLE af_orders
  ADD COLUMN is_locked TINYINT NOT NULL DEFAULT 0 COMMENT '0=普通订单, 1=已锁仓（不可撤单）' AFTER sell_status,
  ADD COLUMN lock_expiry DATE NULL COMMENT '锁仓到期日' AFTER is_locked,
  ADD COLUMN lock_instrument VARCHAR(60) NULL COMMENT '关联的期权合约名称' AFTER lock_expiry,
  ADD COLUMN lock_yield DECIMAL(6,4) NULL COMMENT '锁仓月化收益率' AFTER lock_instrument;
