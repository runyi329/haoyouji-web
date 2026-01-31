-- 为 ledger_records 表添加图片字段
ALTER TABLE ledger_records ADD COLUMN image_url TEXT AFTER description;
