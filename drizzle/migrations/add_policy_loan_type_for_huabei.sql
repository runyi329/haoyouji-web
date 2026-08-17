-- 将既有保单贷款表扩展为通用贷款表：保单贷款使用 policy，花呗使用 huabei。
ALTER TABLE policy_loans
  ADD COLUMN loan_type VARCHAR(24) NOT NULL DEFAULT 'policy' AFTER insurer,
  ADD INDEX idx_policy_loans_user_type_active (user_id, loan_type, is_active);
