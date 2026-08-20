-- 全局钱包历史差额核对：保留八位小数的手动调整金额。
-- 已在生产环境执行；本迁移供其他环境与审计追溯使用。
ALTER TABLE af_manual_balances
  MODIFY COLUMN amount DECIMAL(18,8) NOT NULL DEFAULT 0.00000000;
