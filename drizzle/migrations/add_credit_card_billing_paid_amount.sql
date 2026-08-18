ALTER TABLE credit_card_billing_statements
  ADD COLUMN paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0
  COMMENT '本期已还金额，由卡主或管理员手动录入'
  AFTER statement_amount;
