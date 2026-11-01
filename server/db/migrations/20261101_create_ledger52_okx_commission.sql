-- 52号账本：OKX交易所佣金业务
-- 客户配置可更新；每次累计交易量登记及其分配均作为不可变历史快照保存。

CREATE TABLE IF NOT EXISTS ledger52_okx_commission_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ledger_id INT NOT NULL,
  member_user_id BIGINT UNSIGNED NOT NULL,
  okx_uid VARCHAR(32) NOT NULL,
  okx_login VARCHAR(128) DEFAULT NULL,
  vip_tier VARCHAR(16) NOT NULL DEFAULT 'regular',
  allocation_config_json LONGTEXT NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  updated_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_okx_commission_member (ledger_id, member_user_id),
  UNIQUE KEY uq_okx_commission_uid (ledger_id, okx_uid),
  KEY idx_okx_commission_accounts_member (ledger_id, member_user_id, status),
  KEY idx_okx_commission_accounts_recent (ledger_id, status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='52号账本OKX交易所佣金：客户OKX账户与当前返佣分配配置';

CREATE TABLE IF NOT EXISTS ledger52_okx_commission_account_audits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ledger_id INT NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  member_user_id BIGINT UNSIGNED NOT NULL,
  operation ENUM('create','update') NOT NULL,
  before_snapshot LONGTEXT DEFAULT NULL,
  after_snapshot LONGTEXT NOT NULL,
  client_request_id VARCHAR(64) NOT NULL,
  operator_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_okx_commission_account_audit_request (ledger_id, operator_user_id, client_request_id),
  KEY idx_okx_commission_account_audit_account (ledger_id, account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='52号账本OKX交易所佣金：客户资料与当前返佣配置的操作审计';

CREATE TABLE IF NOT EXISTS ledger52_okx_commission_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ledger_id INT NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  transaction_cumulative_usdt DECIMAL(24,8) DEFAULT NULL,
  transaction_increment_usdt DECIMAL(24,8) DEFAULT NULL,
  spot_cumulative_usdt DECIMAL(24,8) NOT NULL,
  futures_cumulative_usdt DECIMAL(24,8) NOT NULL,
  spot_increment_usdt DECIMAL(24,8) NOT NULL,
  futures_increment_usdt DECIMAL(24,8) NOT NULL,
  rebate_rate_pct DECIMAL(12,8) DEFAULT NULL,
  expected_commission_usdt DECIMAL(24,8) DEFAULT NULL,
  paid_commission_usdt DECIMAL(24,8) DEFAULT NULL,
  allocation_snapshot_json LONGTEXT NOT NULL,
  client_request_id VARCHAR(64) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_okx_commission_record_request (ledger_id, created_by_user_id, client_request_id),
  KEY idx_okx_commission_record_account_time (ledger_id, account_id, recorded_at, id),
  KEY idx_okx_commission_record_created (ledger_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='52号账本OKX交易所佣金：管理员手工登记的累计交易量与返佣快照';

CREATE TABLE IF NOT EXISTS ledger52_okx_commission_record_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ledger_id INT NOT NULL,
  commission_record_id BIGINT UNSIGNED NOT NULL,
  beneficiary_user_id BIGINT UNSIGNED NOT NULL,
  beneficiary_name_snapshot VARCHAR(160) NOT NULL,
  beneficiary_invite_code_snapshot VARCHAR(64) DEFAULT NULL,
  allocation_pct DECIMAL(12,8) NOT NULL,
  expected_amount_usdt DECIMAL(24,8) DEFAULT NULL,
  paid_amount_usdt DECIMAL(24,8) DEFAULT NULL,
  payout_status ENUM('pending','paid','legacy_paid','void') NOT NULL DEFAULT 'pending',
  payout_batch_id BIGINT UNSIGNED DEFAULT NULL,
  payout_wallet_balance_id BIGINT UNSIGNED DEFAULT NULL,
  paid_at DATETIME(3) DEFAULT NULL,
  paid_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_okx_commission_record_beneficiary (commission_record_id, beneficiary_user_id),
  KEY idx_okx_commission_allocation_beneficiary (ledger_id, beneficiary_user_id, created_at),
  KEY idx_okx_commission_allocation_record (ledger_id, commission_record_id),
  KEY idx_okx_commission_allocation_pending (ledger_id, payout_status, beneficiary_user_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='52号账本OKX交易所佣金：每笔登记固定的受益分配快照';


-- 早期表补充单一累计交易额与VIP字段。使用information_schema守卫，兼容不支持ADD COLUMN IF NOT EXISTS的MySQL版本。
SET @okx_commission_schema = DATABASE();

SET @okx_has_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @okx_commission_schema AND table_name = 'ledger52_okx_commission_records' AND column_name = 'transaction_cumulative_usdt');
SET @okx_sql = IF(@okx_has_column = 0,
  'ALTER TABLE ledger52_okx_commission_records ADD COLUMN transaction_cumulative_usdt DECIMAL(24,8) DEFAULT NULL AFTER recorded_at',
  'SELECT 1');
PREPARE okx_commission_stmt FROM @okx_sql;
EXECUTE okx_commission_stmt;
DEALLOCATE PREPARE okx_commission_stmt;

SET @okx_has_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @okx_commission_schema AND table_name = 'ledger52_okx_commission_records' AND column_name = 'transaction_increment_usdt');
SET @okx_sql = IF(@okx_has_column = 0,
  'ALTER TABLE ledger52_okx_commission_records ADD COLUMN transaction_increment_usdt DECIMAL(24,8) DEFAULT NULL AFTER transaction_cumulative_usdt',
  'SELECT 1');
PREPARE okx_commission_stmt FROM @okx_sql;
EXECUTE okx_commission_stmt;
DEALLOCATE PREPARE okx_commission_stmt;

SET @okx_has_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @okx_commission_schema AND table_name = 'ledger52_okx_commission_accounts' AND column_name = 'vip_tier');
SET @okx_sql = IF(@okx_has_column = 0,
  'ALTER TABLE ledger52_okx_commission_accounts ADD COLUMN vip_tier VARCHAR(16) NOT NULL DEFAULT ''regular'' AFTER okx_login',
  'SELECT 1');
PREPARE okx_commission_stmt FROM @okx_sql;
EXECUTE okx_commission_stmt;
DEALLOCATE PREPARE okx_commission_stmt;


-- 待发佣金通过批次入账用户52号USDT钱包：每笔分配只能被一个批次标记为已发，防止重复发放。
CREATE TABLE IF NOT EXISTS ledger52_okx_commission_payout_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ledger_id INT NOT NULL,
  client_request_id VARCHAR(64) NOT NULL,
  operator_user_id BIGINT UNSIGNED NOT NULL,
  recipient_count INT NOT NULL,
  allocation_count INT NOT NULL,
  total_amount_usdt DECIMAL(24,8) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_okx_commission_payout_batch_request (ledger_id, operator_user_id, client_request_id),
  KEY idx_okx_commission_payout_batch_created (ledger_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='52号账本OKX交易所佣金：批量发放批次与幂等审计';

-- 为既有分配表追加待发状态与批次关联，逐列检查以兼容旧MySQL。

SET @okx_has_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @okx_commission_schema AND table_name = 'ledger52_okx_commission_record_allocations' AND column_name = 'payout_status');
SET @okx_sql = IF(@okx_has_column = 0, 'ALTER TABLE ledger52_okx_commission_record_allocations ADD COLUMN payout_status ENUM(''pending'',''paid'',''legacy_paid'',''void'') NOT NULL DEFAULT ''pending'' AFTER paid_amount_usdt', 'SELECT 1');
PREPARE okx_commission_stmt FROM @okx_sql;
EXECUTE okx_commission_stmt;
DEALLOCATE PREPARE okx_commission_stmt;

SET @okx_has_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @okx_commission_schema AND table_name = 'ledger52_okx_commission_record_allocations' AND column_name = 'payout_batch_id');
SET @okx_sql = IF(@okx_has_column = 0, 'ALTER TABLE ledger52_okx_commission_record_allocations ADD COLUMN payout_batch_id BIGINT UNSIGNED DEFAULT NULL AFTER payout_status', 'SELECT 1');
PREPARE okx_commission_stmt FROM @okx_sql;
EXECUTE okx_commission_stmt;
DEALLOCATE PREPARE okx_commission_stmt;

SET @okx_has_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @okx_commission_schema AND table_name = 'ledger52_okx_commission_record_allocations' AND column_name = 'payout_wallet_balance_id');
SET @okx_sql = IF(@okx_has_column = 0, 'ALTER TABLE ledger52_okx_commission_record_allocations ADD COLUMN payout_wallet_balance_id BIGINT UNSIGNED DEFAULT NULL AFTER payout_batch_id', 'SELECT 1');
PREPARE okx_commission_stmt FROM @okx_sql;
EXECUTE okx_commission_stmt;
DEALLOCATE PREPARE okx_commission_stmt;

SET @okx_has_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @okx_commission_schema AND table_name = 'ledger52_okx_commission_record_allocations' AND column_name = 'paid_at');
SET @okx_sql = IF(@okx_has_column = 0, 'ALTER TABLE ledger52_okx_commission_record_allocations ADD COLUMN paid_at DATETIME(3) DEFAULT NULL AFTER payout_wallet_balance_id', 'SELECT 1');
PREPARE okx_commission_stmt FROM @okx_sql;
EXECUTE okx_commission_stmt;
DEALLOCATE PREPARE okx_commission_stmt;

SET @okx_has_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @okx_commission_schema AND table_name = 'ledger52_okx_commission_record_allocations' AND column_name = 'paid_by_user_id');
SET @okx_sql = IF(@okx_has_column = 0, 'ALTER TABLE ledger52_okx_commission_record_allocations ADD COLUMN paid_by_user_id BIGINT UNSIGNED DEFAULT NULL AFTER paid_at', 'SELECT 1');
PREPARE okx_commission_stmt FROM @okx_sql;
EXECUTE okx_commission_stmt;
DEALLOCATE PREPARE okx_commission_stmt;

SET @okx_has_index = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = @okx_commission_schema AND table_name = 'ledger52_okx_commission_record_allocations' AND index_name = 'idx_okx_commission_allocation_pending');
SET @okx_sql = IF(@okx_has_index = 0,
  'ALTER TABLE ledger52_okx_commission_record_allocations ADD KEY idx_okx_commission_allocation_pending (ledger_id, payout_status, beneficiary_user_id, id)',
  'SELECT 1');
PREPARE okx_commission_stmt FROM @okx_sql;
EXECUTE okx_commission_stmt;
DEALLOCATE PREPARE okx_commission_stmt;

-- 上线前已经手填为正数的历史“已发佣金”按旧线下记录处理；0与空值仍显示为待发。
UPDATE ledger52_okx_commission_record_allocations
   SET payout_status = 'legacy_paid'
 WHERE ledger_id = 52
   AND payout_status = 'pending'
   AND COALESCE(paid_amount_usdt, 0) > 0
   AND payout_wallet_balance_id IS NULL;
