-- 为 lottery_activities 表添加外部开奖数据源字段
-- external_seed_type: 外部数据类型 (null=内部随机, sh_index=上证指数, sz_index=深证成指, ssq=双色球, dlt=大乐透)
-- external_seed_date: 外部数据的日期（开奖日期，格式 YYYY-MM-DD）
-- external_seed_value: 外部数据的实际值（收盘价或开奖号码，开奖后写入）
-- external_seed_source: 外部数据来源说明（可验证的 URL 或描述）

ALTER TABLE `lottery_activities`
  ADD COLUMN IF NOT EXISTS `external_seed_type` ENUM('sh_index','sz_index','ssq','dlt') DEFAULT NULL COMMENT '外部开奖数据类型',
  ADD COLUMN IF NOT EXISTS `external_seed_date` DATE DEFAULT NULL COMMENT '外部数据日期',
  ADD COLUMN IF NOT EXISTS `external_seed_value` VARCHAR(255) DEFAULT NULL COMMENT '外部数据实际值（开奖后写入）',
  ADD COLUMN IF NOT EXISTS `external_seed_source` TEXT DEFAULT NULL COMMENT '外部数据来源说明';
