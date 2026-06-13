-- ============================================================
-- 牙办齿科商城 - 数据库表（第三步第一批：订单落库 + 订单管理）
-- 设计原则：
--   1. 先按单店（恒愿齿科）跑通，预留 tenant_id 字段供未来多租户
--   2. 商品表预留 source 字段（self=医院自营 / platform=平台供货）
--   3. 全部使用 InnoDB + utf8mb4，金额用 DECIMAL(10,2)
-- 注意：本批次重点是订单，商品表先建好结构（第二批商品管理后台再用）
-- ============================================================

-- 分类表
CREATE TABLE IF NOT EXISTS `shop_category` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id`   INT NOT NULL DEFAULT 1            COMMENT '租户(医院)ID，预留多租户',
  `code`        VARCHAR(32)  NOT NULL             COMMENT '分类编码，如 care/implant',
  `name`        VARCHAR(64)  NOT NULL             COMMENT '分类名称',
  `icon`        VARCHAR(255) DEFAULT NULL          COMMENT '分类图标URL',
  `sort_order`  INT NOT NULL DEFAULT 0            COMMENT '排序，越小越靠前',
  `status`      TINYINT NOT NULL DEFAULT 1        COMMENT '1启用 0停用',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_cat_tenant` (`tenant_id`),
  KEY `idx_cat_code` (`tenant_id`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商城分类表';

-- 商品表
CREATE TABLE IF NOT EXISTS `shop_product` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id`      INT NOT NULL DEFAULT 1          COMMENT '租户(医院)ID，预留多租户',
  `source`         VARCHAR(16) NOT NULL DEFAULT 'self' COMMENT '来源：self自营 / platform平台供货',
  `platform_ref_id` INT DEFAULT NULL              COMMENT '若为平台铺货，引用的平台商品ID（预留）',
  `category_code`  VARCHAR(32) NOT NULL           COMMENT '分类编码',
  `kind`           VARCHAR(16) NOT NULL DEFAULT 'product' COMMENT 'product实物 / service诊疗服务',
  `name`           VARCHAR(128) NOT NULL          COMMENT '商品名称',
  `subtitle`       VARCHAR(255) DEFAULT NULL       COMMENT '副标题/卖点',
  `price`          DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '现价(元)',
  `original_price` DECIMAL(10,2) DEFAULT NULL      COMMENT '原价/划线价(元)',
  `image`          VARCHAR(255) DEFAULT NULL       COMMENT '主图URL',
  `sales`          INT NOT NULL DEFAULT 0         COMMENT '销量(展示用)',
  `tags`           VARCHAR(255) DEFAULT NULL       COMMENT '标签，逗号分隔，如 热销,定金',
  `description`    TEXT DEFAULT NULL              COMMENT '详情描述，按行分段(JSON数组字符串)',
  `legacy_code`    VARCHAR(32) DEFAULT NULL        COMMENT '前端写死数据的旧编码，如 p1001/s2001，便于迁移对齐',
  `sort_order`     INT NOT NULL DEFAULT 0         COMMENT '排序',
  `status`         TINYINT NOT NULL DEFAULT 1     COMMENT '1上架 0下架',
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_prod_tenant` (`tenant_id`),
  KEY `idx_prod_cat` (`tenant_id`, `category_code`),
  KEY `idx_prod_status` (`tenant_id`, `status`),
  KEY `idx_prod_legacy` (`legacy_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商城商品表';

-- 订单表
CREATE TABLE IF NOT EXISTS `shop_order` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `order_no`      VARCHAR(32) NOT NULL              COMMENT '订单号(唯一)',
  `tenant_id`     INT NOT NULL DEFAULT 1            COMMENT '租户(医院)ID，预留多租户',
  `user_id`       INT NOT NULL                     COMMENT '下单用户ID(users.id)',
  `user_name`     VARCHAR(64) DEFAULT NULL          COMMENT '下单时用户名称快照',
  `user_phone`    VARCHAR(20) DEFAULT NULL          COMMENT '联系电话(可选)',
  `total_amount`  DECIMAL(10,2) NOT NULL DEFAULT 0  COMMENT '订单总金额(元)',
  `pay_method`    VARCHAR(16) NOT NULL DEFAULT 'wechat' COMMENT '支付方式 wechat/alipay',
  `pay_status`    VARCHAR(16) NOT NULL DEFAULT 'unpaid' COMMENT '支付状态 unpaid/paid(占位)',
  `order_status`  VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '订单状态 pending待处理/confirmed已确认/completed已完成/cancelled已取消',
  `has_service`   TINYINT NOT NULL DEFAULT 0        COMMENT '是否含诊疗项目 1是 0否',
  `remark`        VARCHAR(500) DEFAULT NULL         COMMENT '客户备注',
  `admin_remark`  VARCHAR(500) DEFAULT NULL         COMMENT '管理员备注',
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_order_tenant` (`tenant_id`),
  KEY `idx_order_user` (`user_id`),
  KEY `idx_order_status` (`tenant_id`, `order_status`),
  KEY `idx_order_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商城订单表';

-- 订单明细表
CREATE TABLE IF NOT EXISTS `shop_order_item` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `order_id`       INT NOT NULL                    COMMENT '订单ID(shop_order.id)',
  `order_no`       VARCHAR(32) NOT NULL            COMMENT '订单号(冗余便于查询)',
  `tenant_id`      INT NOT NULL DEFAULT 1          COMMENT '租户(医院)ID',
  `product_code`   VARCHAR(32) DEFAULT NULL         COMMENT '商品编码(前端写死数据用legacy_code)',
  `product_id`     INT DEFAULT NULL                COMMENT '商品ID(shop_product.id，迁移后用)',
  `product_name`   VARCHAR(128) NOT NULL          COMMENT '商品名称快照',
  `product_image`  VARCHAR(255) DEFAULT NULL        COMMENT '商品图快照',
  `kind`           VARCHAR(16) NOT NULL DEFAULT 'product' COMMENT 'product/service',
  `price`          DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '单价快照(元)',
  `qty`            INT NOT NULL DEFAULT 1         COMMENT '数量',
  `subtotal`       DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '小计(元)',
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_item_order` (`order_id`),
  KEY `idx_item_order_no` (`order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商城订单明细表';
