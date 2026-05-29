-- 为ledger_records表添加stock_codes字段（存储股票代码JSON数组）
ALTER TABLE ledger_records ADD COLUMN IF NOT EXISTS stock_codes JSON;
