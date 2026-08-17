CREATE TABLE IF NOT EXISTS credit_card_billing_statements (
  id INT NOT NULL AUTO_INCREMENT,
  credit_card_id INT NOT NULL COMMENT '信用卡 ID',
  billing_date DATE NOT NULL COMMENT '对应账单日（账期唯一标识）',
  statement_amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '本期应还账单金额，由用户手动录入',
  created_by_user_id INT NOT NULL COMMENT '首次录入人用户 ID',
  updated_by_user_id INT NOT NULL COMMENT '最后更新人用户 ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_credit_card_billing_date (credit_card_id, billing_date),
  KEY idx_credit_card_billing_statements_card_date (credit_card_id, billing_date DESC),
  CONSTRAINT fk_credit_card_billing_statements_card
    FOREIGN KEY (credit_card_id) REFERENCES credit_cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='信用卡按账期保存的手动本期还款金额';
