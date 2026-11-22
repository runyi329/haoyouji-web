-- Limited mall cumulative brand attention. Prepare only; run explicitly through
-- an authorized deployment. No fabricated historical counts or personal data.
-- Execute DDL before any transaction (MySQL DDL implicitly commits).
-- Do not delete event IDs while retaining totals: retries must remain idempotent.

CREATE TABLE IF NOT EXISTS miban_brand_attention_totals (
  brand_slug VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  total_views BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS miban_brand_attention_events (
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  brand_slug VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'UTC instant: MySQL TIMESTAMP is stored internally in UTC'
) ENGINE=InnoDB;
