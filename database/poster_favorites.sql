-- 海报收藏表
-- 用于存储用户收藏的海报信息

CREATE TABLE IF NOT EXISTS poster_favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '用户ID',
  title VARCHAR(255) NOT NULL COMMENT '海报标题',
  description TEXT COMMENT '海报描述',
  category VARCHAR(50) NOT NULL DEFAULT 'other' COMMENT '海报分类：marketing(营销类), product_tutorial(产品教程), target_audience(特定对象), brand(品牌宣传), event(活动类), other(其他)',
  series_name VARCHAR(255) COMMENT '系列名称（如：脉动网宣传系列）',
  thumbnail_url VARCHAR(500) NOT NULL COMMENT '缩略图URL（腾讯云COS）',
  full_url VARCHAR(500) NOT NULL COMMENT '原图URL（腾讯云COS）',
  width INT COMMENT '图片宽度（像素）',
  height INT COMMENT '图片高度（像素）',
  file_size INT COMMENT '文件大小（字节）',
  tags JSON COMMENT '标签数组，如：["营销", "宣传", "脉动网"]',
  sort_order INT DEFAULT 0 COMMENT '排序顺序，数值越大越靠前',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  -- 索引
  INDEX idx_user_id (user_id),
  INDEX idx_category (category),
  INDEX idx_series (series_name),
  INDEX idx_created_at (created_at),
  
  -- 外键约束
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='海报收藏表';

-- 示例数据（可选，用于测试）
-- INSERT INTO poster_favorites (user_id, title, description, category, series_name, thumbnail_url, full_url, tags) VALUES
-- (1, 'KTV版宣传海报', '用别人的老婆赚钱 vs 用别人的人脉赚钱', 'marketing', '脉动网宣传系列', 
--  'https://example.cos.ap-guangzhou.myqcloud.com/posters/ktv-thumbnail.jpg',
--  'https://example.cos.ap-guangzhou.myqcloud.com/posters/ktv-full.jpg',
--  '["营销", "宣传", "脉动网"]');
