-- 花呗按用户实际账单周期保存账单日与最后还款日。
-- 仅 loan_type='huabei' 使用；保单贷款记录保持 NULL。
ALTER TABLE policy_loans
  ADD COLUMN huabei_billing_day TINYINT UNSIGNED NULL COMMENT '花呗每月账单日（1-31）' AFTER due_date,
  ADD COLUMN huabei_repayment_day TINYINT UNSIGNED NULL COMMENT '花呗每月最后还款日（1-31）' AFTER huabei_billing_day;

CREATE INDEX idx_policy_loans_huabei_cycle
  ON policy_loans (loan_type, huabei_billing_day, huabei_repayment_day);
