-- 为积分商城产品表添加列表预览图字段
ALTER TABLE `merchant_products` ADD COLUMN IF NOT EXISTS `thumbnailUrl` text;
