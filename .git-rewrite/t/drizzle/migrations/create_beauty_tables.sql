-- 奢贝美容院 - 数据库表创建
-- 所有表使用 CREATE TABLE IF NOT EXISTS，可重复执行

CREATE TABLE IF NOT EXISTS `beauty_services` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `duration` INT NOT NULL DEFAULT 60,
  `price` DECIMAL(10,2) NOT NULL,
  `imageUrl` TEXT,
  `category` ENUM('facial','body','hair','nail','other') NOT NULL DEFAULT 'other',
  `isActive` INT NOT NULL DEFAULT 1,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `beauty_appointments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `serviceId` INT NOT NULL,
  `appointmentDate` TIMESTAMP NOT NULL,
  `status` ENUM('pending','confirmed','completed','cancelled') NOT NULL DEFAULT 'pending',
  `notes` TEXT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `beauty_promotions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `imageUrl` TEXT,
  `type` ENUM('opening','points','coupon','other') NOT NULL DEFAULT 'other',
  `isActive` INT NOT NULL DEFAULT 1,
  `startDate` TIMESTAMP NULL,
  `endDate` TIMESTAMP NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `beauty_brands` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `logoUrl` TEXT,
  `bannerUrl` TEXT,
  `isActive` INT NOT NULL DEFAULT 1,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `beauty_product_categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL,
  `type` ENUM('beauty','health') NOT NULL,
  `isActive` INT NOT NULL DEFAULT 1,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `beauty_product_effects` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL,
  `isActive` INT NOT NULL DEFAULT 1,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `beauty_products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `price` DECIMAL(10,2) NOT NULL,
  `imageUrl` TEXT,
  `brandId` INT NOT NULL,
  `categoryId` INT NOT NULL,
  `specification` VARCHAR(100),
  `stock` INT NOT NULL DEFAULT 0,
  `isActive` INT NOT NULL DEFAULT 1,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `beauty_product_effect_mappings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `productId` INT NOT NULL,
  `effectId` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `beauty_cart_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `productId` INT NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `beauty_orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `orderNumber` VARCHAR(50) NOT NULL UNIQUE,
  `totalAmount` DECIMAL(10,2) NOT NULL,
  `status` ENUM('pending','paid','shipped','completed','cancelled') NOT NULL DEFAULT 'pending',
  `shippingAddress` TEXT,
  `notes` TEXT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `beauty_order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `orderId` INT NOT NULL,
  `productId` INT NOT NULL,
  `productName` VARCHAR(100) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `quantity` INT NOT NULL,
  `subtotal` DECIMAL(10,2) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入 IDEALIGHT 品牌（如果不存在）
INSERT INTO `beauty_brands` (`name`, `description`, `logoUrl`, `isActive`, `sortOrder`)
SELECT '爱达光 IDEALIGHT', '上海佰时特健康科技有限公司旗下品牌，专注红光健康设备研发与制造', NULL, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `beauty_brands` WHERE `name` = '爱达光 IDEALIGHT');

-- 插入健康仪器分类（如果不存在）
INSERT INTO `beauty_product_categories` (`name`, `type`, `isActive`, `sortOrder`)
SELECT '健康仪器', 'health', 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `beauty_product_categories` WHERE `name` = '健康仪器');

-- 插入红立方光焕能舱商品（如果不存在）
INSERT INTO `beauty_products` (`name`, `description`, `price`, `imageUrl`, `brandId`, `categoryId`, `specification`, `stock`, `isActive`, `sortOrder`)
SELECT 
  '红立方光焕能舱 RQ-22',
  '元气焕活年度私定养护套餐。红光舱=给身体充能！\n\n【六大核心功效】\n1. 焕活身体活力，提升精气神 - 温和唤醒身体能量，让人更有精神、不易疲惫\n2. 促进身体循环，周身舒畅 - 助力气血顺畅运行，改善身体发沉、手脚易凉的状态\n3. 温和排浊，身体更轻松 - 微微出汗，帮助代谢多余湿气与浊物，体感轻盈舒适\n4. 舒缓身心，提升睡眠质量 - 放松神经，帮助睡得更安稳，晨起更有活力\n5. 焕亮肌肤状态，透出好气色 - 温和养护肌肤，让肤色更透亮、肤质更细腻\n6. 调理身体状态，体质更稳定 - 长期坚持，帮助身体保持良好状态，日常更有活力\n\n【产品亮点】\n精准黄金波长 | 超大能量密度 | 定时时间控制 | 两档速度选择 | 网络远程监控 | 智能语音提示 | 智能恒温保护 | 独立新风系统\n\n【科学原理】\n红光疗法（Red Light Therapy）利用特定波长的红光（630-660nm）和近红外光（810-850nm）穿透皮肤，作用于细胞线粒体，促进ATP能量分子的产生，从而激活细胞自我修复与再生能力。\n\n【认证资质】\n通过CMA计量认证、CNAS实验室认证、ILAC-MRA国际互认资质检测，符合GB 4706.1-2005国家安全标准。\n\n【规格参数】\n型号：RQ-22 | 品牌：IDEALIGHT | 类型：立式光浴设备\n生产商：上海佰时特健康科技有限公司',
  30000.00,
  'https://manus-storage-China.oss-cn-beijing.aliyuncs.com/user-file/f4c2c584b7e5c5d0/redcube-hero.jpg',
  (SELECT `id` FROM `beauty_brands` WHERE `name` = '爱达光 IDEALIGHT' LIMIT 1),
  (SELECT `id` FROM `beauty_product_categories` WHERE `name` = '健康仪器' LIMIT 1),
  'RQ-22 立式光浴设备',
  99,
  1,
  1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `beauty_products` WHERE `name` = '红立方光焕能舱 RQ-22');
