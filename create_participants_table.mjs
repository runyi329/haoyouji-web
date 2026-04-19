import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const conn = await mysql.createConnection(url);

const sql = `
CREATE TABLE IF NOT EXISTS funder_order_participants (
  id INT AUTO_INCREMENT NOT NULL,
  order_id INT NOT NULL,
  ledger_id INT NOT NULL,
  role VARCHAR(20) NOT NULL COMMENT '角色: funder=资金方, borrower=借款人, broker=中间人',
  contact_name VARCHAR(100) NOT NULL COMMENT '参与方姓名',
  contact_phone VARCHAR(50) NULL COMMENT '联系电话',
  rate VARCHAR(20) NULL COMMENT '该角色看到的利率/佣金率（如9表示9%）',
  rate_label VARCHAR(50) NULL COMMENT '利率标签（如年化利率、综合利率、介绍费）',
  amount VARCHAR(50) NULL COMMENT '该角色对应的金额（如本金）',
  note TEXT NULL COMMENT '该角色可见的备注',
  sort_order INT DEFAULT 0 COMMENT '排序权重',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id),
  INDEX fop_order_idx (order_id),
  INDEX fop_ledger_idx (ledger_id),
  INDEX fop_role_idx (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

try {
  await conn.execute(sql);
  console.log('✅ funder_order_participants 表创建成功');
} catch (e) {
  console.error('❌ 创建失败:', e.message);
}

await conn.end();
