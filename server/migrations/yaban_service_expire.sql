-- 牙伴齿科：给 yaban_clinic 表新增服务到期日期和套餐类型字段
-- 执行时间：2026-07-11

ALTER TABLE yaban_clinic
  ADD COLUMN IF NOT EXISTS service_expire_at DATE NULL COMMENT '服务到期日期',
  ADD COLUMN IF NOT EXISTS service_plan VARCHAR(32) NULL COMMENT '套餐类型：monthly/annual/lifetime';
