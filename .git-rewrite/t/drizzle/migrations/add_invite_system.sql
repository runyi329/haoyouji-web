-- 邀请ID系统数据库迁移
-- 添加邀请相关字段到users表

-- 1. 添加邀请码字段 (6位随机字母+数字)
ALTER TABLE users ADD COLUMN invite_code VARCHAR(6) UNIQUE COMMENT '专属邀请码(6位随机字母数字)';

-- 2. 添加邀请链接字段
ALTER TABLE users ADD COLUMN invite_link VARCHAR(255) COMMENT '专属邀请链接';

-- 3. 添加邀请者ID字段 (记录是谁邀请的)
ALTER TABLE users ADD COLUMN invited_by_user_id INT COMMENT '邀请者的用户ID';

-- 4. 添加邀请时间字段
ALTER TABLE users ADD COLUMN invited_at TIMESTAMP NULL COMMENT '被邀请注册的时间';

-- 5. 添加邀请统计字段
ALTER TABLE users ADD COLUMN invite_count INT DEFAULT 0 NOT NULL COMMENT '成功邀请的用户数量';

-- 6. 创建索引以提高查询性能
CREATE INDEX idx_invite_code ON users(invite_code);
CREATE INDEX idx_invited_by ON users(invited_by_user_id);

-- 7. 为现有用户生成邀请码 (按注册顺序)
-- 注意: 这个操作会在后端代码中执行,确保按注册顺序生成唯一的邀请码
