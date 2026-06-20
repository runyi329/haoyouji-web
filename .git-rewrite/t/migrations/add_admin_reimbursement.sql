-- 账本管理员管理 + 报销功能数据库迁移
-- 执行时间：2026-02-13

-- 1. 修改 ledger_members 表，添加 admin 角色
ALTER TABLE ledger_members 
MODIFY COLUMN role ENUM('owner', 'admin', 'member') DEFAULT 'member' NOT NULL
COMMENT '角色：owner-所有者，admin-管理员，member-普通成员';

-- 2. 修改 ledger_records 表，添加报销相关字段
ALTER TABLE ledger_records 
ADD COLUMN reimbursement_status ENUM('none', 'pending', 'completed') DEFAULT 'none' NOT NULL
COMMENT '报销状态：none-无需报销，pending-待报销，completed-已报销',

ADD COLUMN reimbursement_amount DECIMAL(10,2) NULL 
COMMENT '报销金额（预留，支持部分报销）',

ADD COLUMN reimbursed_at DATETIME NULL 
COMMENT '报销时间',

ADD COLUMN reimbursed_by INT NULL 
COMMENT '报销操作人ID',

ADD COLUMN reimbursement_notes TEXT NULL 
COMMENT '报销备注',

ADD COLUMN reimbursement_voucher_url TEXT NULL 
COMMENT '报销凭证图片URL';

-- 3. 创建报销修改历史表
CREATE TABLE IF NOT EXISTS reimbursement_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_id INT NOT NULL COMMENT '账目ID',
  ledger_id INT NOT NULL COMMENT '账本ID',
  operated_by INT NOT NULL COMMENT '操作人ID',
  action VARCHAR(50) NOT NULL COMMENT '操作类型：mark_pending, mark_completed, update',
  old_status ENUM('none', 'pending', 'completed') NULL COMMENT '旧状态',
  new_status ENUM('none', 'pending', 'completed') NULL COMMENT '新状态',
  notes TEXT NULL COMMENT '操作备注',
  voucher_url TEXT NULL COMMENT '凭证URL',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_record_id (record_id),
  INDEX idx_ledger_id (ledger_id),
  INDEX idx_operated_by (operated_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='报销修改历史记录';
