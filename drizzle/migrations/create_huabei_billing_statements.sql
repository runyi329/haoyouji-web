-- 花呗账单按“花呗档案 + 北京时间账单日”保存本期应还及累计已还金额。
-- 生产部署同时由 policyLoan 路由使用 CREATE TABLE IF NOT EXISTS 幂等创建，避免依赖手动迁移。
CREATE TABLE IF NOT EXISTS huabei_billing_statements (
  id BIGINT NOT NULL AUTO_INCREMENT,
  policy_loan_id INT NOT NULL COMMENT '花呗贷款档案 ID',
  billing_date DATE NOT NULL COMMENT '对应花呗账单日（北京时间账期唯一标识）',
  statement_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '本期应还金额',
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '本期累计已还金额',
  created_by_user_id INT NOT NULL COMMENT '首次录入人用户 ID',
  updated_by_user_id INT NOT NULL COMMENT '最后更新人用户 ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_huabei_loan_billing_date (policy_loan_id, billing_date),
  KEY idx_huabei_billing_statement_loan_date (policy_loan_id, billing_date DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='花呗按账期保存的本期应还及累计已还金额';
