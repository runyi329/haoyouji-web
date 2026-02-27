-- 添加 require_image 字段到 ledgers 表
-- 用于控制记账时是否必须上传图片

ALTER TABLE ledgers 
ADD COLUMN IF NOT EXISTS require_image TINYINT NOT NULL DEFAULT 0 
COMMENT '是否要求记账必须上传图片: 0=不要求, 1=要求';
