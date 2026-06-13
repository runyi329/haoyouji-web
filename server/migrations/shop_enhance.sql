-- 牙伴齿科商城增强功能 DDL（幂等：字段用 IF NOT EXISTS，表用 CREATE TABLE IF NOT EXISTS）
-- 数据库：crm_db  租户：默认 tenant_id=1

-- ============ 1. shop_product 增字段：库存 / 多规格 ============
ALTER TABLE shop_product
  ADD COLUMN IF NOT EXISTS stock INT NOT NULL DEFAULT 0 COMMENT '库存(实物商品)',
  ADD COLUMN IF NOT EXISTS stock_enabled TINYINT NOT NULL DEFAULT 0 COMMENT '是否启用库存管理:1启用0不限',
  ADD COLUMN IF NOT EXISTS spec_options TEXT NULL COMMENT '规格选项JSON:[{name,values[]}]';

-- ============ 2. shop_order 增字段：收货 / 核销 / 优惠 ============
ALTER TABLE shop_order
  ADD COLUMN IF NOT EXISTS receiver_name  VARCHAR(64)  NULL COMMENT '收货人',
  ADD COLUMN IF NOT EXISTS receiver_phone VARCHAR(20)  NULL COMMENT '收货电话',
  ADD COLUMN IF NOT EXISTS receiver_addr  VARCHAR(255) NULL COMMENT '收货地址',
  ADD COLUMN IF NOT EXISTS ship_no        VARCHAR(64)  NULL COMMENT '物流单号',
  ADD COLUMN IF NOT EXISTS ship_company   VARCHAR(32)  NULL COMMENT '物流公司',
  ADD COLUMN IF NOT EXISTS verify_code    VARCHAR(32)  NULL COMMENT '到店核销码',
  ADD COLUMN IF NOT EXISTS verify_status  VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT 'none/unused/used',
  ADD COLUMN IF NOT EXISTS verified_at    TIMESTAMP    NULL COMMENT '核销时间',
  ADD COLUMN IF NOT EXISTS coupon_id      INT          NULL COMMENT '使用的用户券id',
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '优惠金额',
  ADD COLUMN IF NOT EXISTS goods_amount   DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '商品原始金额(优惠前)';

-- ============ 3. shop_order_item 增字段：规格 ============
ALTER TABLE shop_order_item
  ADD COLUMN IF NOT EXISTS spec_text VARCHAR(128) NULL COMMENT '所选规格描述';

-- ============ 4. 订单状态流转日志 ============
CREATE TABLE IF NOT EXISTS shop_order_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  order_no VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL COMMENT '动作:create/pay/ship/verify/complete/refund/cancel等',
  from_status VARCHAR(16) NULL,
  to_status VARCHAR(16) NULL,
  operator VARCHAR(32) NULL COMMENT 'user/admin/system',
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_no (order_no),
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 5. 退款/售后申请 ============
CREATE TABLE IF NOT EXISTS shop_refund (
  id INT AUTO_INCREMENT PRIMARY KEY,
  refund_no VARCHAR(32) NOT NULL UNIQUE,
  tenant_id INT NOT NULL DEFAULT 1,
  order_no VARCHAR(32) NOT NULL,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  reason VARCHAR(255) NULL,
  images TEXT NULL COMMENT '凭证图JSON数组',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/refunded',
  admin_note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_order_no (order_no),
  INDEX idx_user (user_id),
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 6. 优惠券模板 ============
CREATE TABLE IF NOT EXISTS shop_coupon (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  name VARCHAR(64) NOT NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'full_reduce' COMMENT 'full_reduce满减/discount折扣',
  threshold DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '满多少可用',
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '减多少(满减)',
  discount DECIMAL(4,2) NULL COMMENT '折扣率(0-1,折扣券)',
  total_qty INT NOT NULL DEFAULT 0 COMMENT '发行总量,0不限',
  claimed_qty INT NOT NULL DEFAULT 0 COMMENT '已领取',
  per_user_limit INT NOT NULL DEFAULT 1,
  valid_days INT NOT NULL DEFAULT 30 COMMENT '领取后有效天数',
  start_at TIMESTAMP NULL,
  end_at TIMESTAMP NULL,
  status TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 7. 用户领取的券 ============
CREATE TABLE IF NOT EXISTS shop_user_coupon (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  coupon_id INT NOT NULL,
  user_id INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'unused' COMMENT 'unused/used/expired',
  order_no VARCHAR(32) NULL COMMENT '使用的订单',
  expire_at TIMESTAMP NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_coupon (coupon_id),
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 8. 商品评价/晒单 ============
CREATE TABLE IF NOT EXISTS shop_review (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  order_no VARCHAR(32) NOT NULL,
  product_id INT NULL,
  product_code VARCHAR(32) NULL,
  user_id INT NOT NULL,
  user_name VARCHAR(64) NULL,
  rating TINYINT NOT NULL DEFAULT 5 COMMENT '1-5星',
  content VARCHAR(500) NULL,
  images TEXT NULL COMMENT '晒单图JSON数组',
  reply VARCHAR(500) NULL COMMENT '商家回复',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1显示0隐藏',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product (product_code),
  INDEX idx_order (order_no),
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 9. 首页运营位 Banner ============
CREATE TABLE IF NOT EXISTS shop_banner (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  title VARCHAR(64) NULL,
  image VARCHAR(255) NOT NULL,
  link_type VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT 'none/product/category/url',
  link_value VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 10. 多规格 SKU ============
CREATE TABLE IF NOT EXISTS shop_sku (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  product_id INT NOT NULL,
  spec_text VARCHAR(128) NOT NULL COMMENT '规格组合描述,如 大号+蓝色',
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  stock INT NOT NULL DEFAULT 0,
  image VARCHAR(255) NULL,
  status TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product (product_id),
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
