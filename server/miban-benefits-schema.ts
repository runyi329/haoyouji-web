/** Empty-table infrastructure only. Never executed at import time or inside a money transaction. */
export const MIBAN_BENEFITS_DDL = [
  `CREATE TABLE IF NOT EXISTS miban_benefit_rules (
    storefront VARCHAR(32) NOT NULL, id VARCHAR(64) NOT NULL, user_id INT NOT NULL,
    kind VARCHAR(16) NOT NULL, state VARCHAR(16) NOT NULL, starts CHAR(10) NOT NULL,
    ends VARCHAR(10) NOT NULL DEFAULT '', unlimited TINYINT(1) NOT NULL,
    max_uses INT NOT NULL, uses INT NOT NULL DEFAULT 0, version INT NOT NULL DEFAULT 1,
    rule_json JSON NOT NULL, operator_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (storefront,id), KEY idx_mb_benefit_user (storefront,user_id,id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS miban_benefit_audits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, storefront VARCHAR(32) NOT NULL,
    user_id INT NOT NULL, rule_id VARCHAR(64) NOT NULL, operator_id INT NOT NULL,
    action VARCHAR(32) NOT NULL, detail TEXT NOT NULL, before_json JSON NULL, after_json JSON NULL,
    order_id INT NULL, saved_cents BIGINT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_mb_benefit_audit_user (storefront,user_id,id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS miban_benefit_usages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, storefront VARCHAR(32) NOT NULL,
    user_id INT NOT NULL, checkout_key VARCHAR(128) NOT NULL, rule_id VARCHAR(64) NOT NULL,
    snapshot_json JSON NOT NULL, restored TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, restored_at DATETIME NULL, restored_by INT NULL,
    UNIQUE KEY uk_mb_benefit_checkout_rule (storefront,checkout_key,rule_id),
    KEY idx_mb_benefit_usage_user (storefront,user_id,checkout_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS miban_benefit_usage_orders (
    storefront VARCHAR(32) NOT NULL, usage_id BIGINT UNSIGNED NOT NULL, user_id INT NOT NULL,
    order_id INT NOT NULL, total_cents BIGINT NOT NULL,
    PRIMARY KEY (storefront,usage_id,order_id), KEY idx_mb_benefit_usage_order (storefront,user_id,order_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS miban_benefit_requests (
    storefront VARCHAR(32) NOT NULL, user_id INT NOT NULL, request_id CHAR(36) NOT NULL,
    operator_id INT NOT NULL, input_hash CHAR(64) NOT NULL, response_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (storefront,user_id,request_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
] as const;
