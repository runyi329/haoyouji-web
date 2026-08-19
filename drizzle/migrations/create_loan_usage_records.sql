CREATE TABLE IF NOT EXISTS loan_usage_records (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '额度所属用户 ID',
  amount DECIMAL(14,2) NOT NULL COMMENT '本条已用额度用途金额',
  description VARCHAR(200) NOT NULL COMMENT '资金用途说明',
  created_by_user_id INT NOT NULL COMMENT '创建记录的用户 ID',
  updated_by_user_id INT NOT NULL COMMENT '最后更新记录的用户 ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_loan_usage_records_user_updated (user_id, updated_at DESC),
  CONSTRAINT fk_loan_usage_records_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='贷款管理已用额度的用途说明记录';
