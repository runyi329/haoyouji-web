-- 创建加密配置表
CREATE TABLE IF NOT EXISTS encryption_config (
  id INT AUTO_INCREMENT NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(100) NOT NULL,
  field_group VARCHAR(50) NOT NULL,
  is_enabled TINYINT DEFAULT 0 NOT NULL,
  encrypted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_table_field (table_name, field_name)
);

-- 初始化加密配置项（默认全部关闭）
INSERT IGNORE INTO encryption_config (table_name, field_name, field_label, field_group, is_enabled) VALUES
-- 联系人数据
('contacts', 'name', '联系人姓名', '联系人数据', 0),
('contacts', 'phone', '手机号', '联系人数据', 0),
('contacts', 'wechat', '微信号', '联系人数据', 0),
('contacts', 'address', '地址', '联系人数据', 0),
('contacts', 'occupation', '职业', '联系人数据', 0),
('contacts', 'title', '头衔', '联系人数据', 0),
-- 联系人扩展数据
('contact_field_values', 'value', '自定义字段值', '联系人数据', 0),
('contact_interactions', 'note', '互动备注', '联系人数据', 0),
-- 账目数据
('ledger_records', 'description', '账目备注', '账目数据', 0),
('reimbursement_history', 'notes', '报销备注', '账目数据', 0),
-- 用户数据
('users', 'name', '用户昵称', '用户数据', 0),
('users', 'email', '用户邮箱', '用户数据', 0);
