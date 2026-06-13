-- 牙办齿科商城 - 商品/分类表（第三步第二批）
-- 多租户预留：tenant_id 默认 1（单店阶段）

-- 商品分类表
CREATE TABLE IF NOT EXISTS shop_category (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  code VARCHAR(32) NOT NULL,                 -- 分类编码（如 care/implant），前端筛选用
  name VARCHAR(64) NOT NULL,                 -- 分类名称
  icon VARCHAR(255) DEFAULT NULL,            -- 分类图标 URL
  sort INT NOT NULL DEFAULT 0,               -- 排序，越小越靠前
  is_active TINYINT NOT NULL DEFAULT 1,      -- 是否启用
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_code (tenant_id, code),
  KEY idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙办商城-商品分类';

-- 商品表
CREATE TABLE IF NOT EXISTS shop_product (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  code VARCHAR(32) NOT NULL,                 -- 商品编码（如 p1001/s2001），与订单明细 product_code 对应
  category_code VARCHAR(32) NOT NULL,        -- 所属分类编码
  kind VARCHAR(16) NOT NULL DEFAULT 'product', -- product 实物 / service 诊疗
  name VARCHAR(128) NOT NULL,
  subtitle VARCHAR(255) DEFAULT NULL,        -- 副标题/卖点
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00, -- 现价
  original_price DECIMAL(10,2) DEFAULT NULL, -- 原价（划线价）
  image VARCHAR(500) DEFAULT NULL,           -- 主图 URL
  sales INT NOT NULL DEFAULT 0,              -- 销量（展示用）
  tags VARCHAR(255) DEFAULT NULL,            -- 标签，逗号分隔（如 "热销,定金"）
  description TEXT DEFAULT NULL,             -- 详情段落，换行分隔
  is_active TINYINT NOT NULL DEFAULT 1,      -- 是否上架
  sort INT NOT NULL DEFAULT 0,               -- 排序，越小越靠前
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_code (tenant_id, code),
  KEY idx_tenant_cat (tenant_id, category_code),
  KEY idx_active (tenant_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙办商城-商品';
