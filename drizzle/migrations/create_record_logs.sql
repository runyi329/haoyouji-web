-- 创建账目修改记录日志表
CREATE TABLE IF NOT EXISTS ledger_record_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_id INT NOT NULL COMMENT '账目ID',
  ledger_id INT NOT NULL COMMENT '账本ID',
  operator_id INT NOT NULL COMMENT '操作人用户ID',
  action VARCHAR(50) NOT NULL COMMENT '操作类型: edit/reimburse/approve/reject/delete/restore',
  field_name VARCHAR(100) COMMENT '修改的字段名',
  old_value TEXT COMMENT '修改前的值',
  new_value TEXT COMMENT '修改后的值',
  note TEXT COMMENT '备注说明',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  INDEX idx_record_id (record_id),
  INDEX idx_ledger_id (ledger_id),
  INDEX idx_operator_id (operator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账目修改记录日志';
