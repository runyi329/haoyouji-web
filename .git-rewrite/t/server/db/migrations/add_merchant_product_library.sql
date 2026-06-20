-- 脉动共享商盟 - 商品库模块迁移
-- 创建时间: 2026-03-05

-- 商家信息表
CREATE TABLE IF NOT EXISTS `merchants` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `merchantCode` varchar(50) NOT NULL UNIQUE,
  `shopName` varchar(100) NOT NULL,
  `shopDescription` text,
  `shopLogoUrl` text,
  `shopBannerUrl` text,
  `themeColor` varchar(20) DEFAULT '#722F37',
  `shopType` varchar(50),
  `contactPhone` varchar(20),
  `contactWechat` varchar(50),
  `status` enum('active','inactive','suspended') DEFAULT 'active' NOT NULL,
  `isVerified` tinyint DEFAULT 0 NOT NULL,
  `depositAmount` decimal(10,2) DEFAULT '0.00',
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `merchants_userId_idx` (`userId`),
  INDEX `merchants_merchantCode_idx` (`merchantCode`)
);

-- 商品分类表
CREATE TABLE IF NOT EXISTS `merchant_product_categories` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchantId` int,
  `name` varchar(100) NOT NULL,
  `description` text,
  `iconUrl` text,
  `sortOrder` int DEFAULT 0 NOT NULL,
  `isActive` tinyint DEFAULT 1 NOT NULL,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `mpc_merchantId_idx` (`merchantId`)
);

-- 商品主表（平台中央商品库）
CREATE TABLE IF NOT EXISTS `merchant_products` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `ownerMerchantId` int,
  `categoryId` int,
  `name` varchar(200) NOT NULL,
  `subtitle` varchar(300),
  `description` text,
  `mainImageUrl` text,
  `imageUrls` text,
  `videoUrl` text,
  `basePrice` decimal(10,2) NOT NULL,
  `originalPrice` decimal(10,2),
  `unit` varchar(20) DEFAULT '件',
  `stock` int DEFAULT 999 NOT NULL,
  `salesCount` int DEFAULT 0 NOT NULL,
  `sourceType` enum('platform','merchant','shared') DEFAULT 'merchant' NOT NULL,
  `status` enum('active','inactive','draft') DEFAULT 'active' NOT NULL,
  `isShareable` tinyint DEFAULT 1 NOT NULL,
  `extendedFields` text,
  `sortOrder` int DEFAULT 0 NOT NULL,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `mp_ownerMerchantId_idx` (`ownerMerchantId`),
  INDEX `mp_categoryId_idx` (`categoryId`),
  INDEX `mp_status_idx` (`status`)
);

-- 商品规格表
CREATE TABLE IF NOT EXISTS `merchant_product_specs` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `productId` int NOT NULL,
  `specName` varchar(50) NOT NULL,
  `specValue` varchar(100) NOT NULL,
  `priceAdjustment` decimal(10,2) DEFAULT '0.00',
  `stock` int DEFAULT 999 NOT NULL,
  `isActive` tinyint DEFAULT 1 NOT NULL,
  `sortOrder` int DEFAULT 0 NOT NULL,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `mps_productId_idx` (`productId`)
);

-- 店铺商品陈列表
CREATE TABLE IF NOT EXISTS `merchant_shop_products` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchantId` int NOT NULL,
  `productId` int NOT NULL,
  `displayPrice` decimal(10,2),
  `customCategoryId` int,
  `customSortOrder` int DEFAULT 0 NOT NULL,
  `isVisible` tinyint DEFAULT 1 NOT NULL,
  `isOwned` tinyint DEFAULT 1 NOT NULL,
  `sharedFromMerchantId` int,
  `commissionRate` decimal(5,2),
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `msp_merchantId_idx` (`merchantId`),
  INDEX `msp_productId_idx` (`productId`)
);

-- 商品共享申请表
CREATE TABLE IF NOT EXISTS `merchant_product_share_requests` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `requesterMerchantId` int NOT NULL,
  `ownerMerchantId` int NOT NULL,
  `productId` int,
  `proposedCommissionRate` decimal(5,2),
  `agreedCommissionRate` decimal(5,2),
  `status` enum('pending','approved','rejected','cancelled') DEFAULT 'pending' NOT NULL,
  `message` text,
  `replyMessage` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `mpsr_requester_idx` (`requesterMerchantId`),
  INDEX `mpsr_owner_idx` (`ownerMerchantId`)
);

-- 插入默认商品分类（红酒类）
INSERT IGNORE INTO `merchant_product_categories` (`merchantId`, `name`, `description`, `sortOrder`) VALUES
(NULL, '法国红酒', '法国各产区精选红葡萄酒', 1),
(NULL, '意大利红酒', '意大利顶级酒庄出品', 2),
(NULL, '西班牙红酒', '西班牙里奥哈等产区', 3),
(NULL, '智利红酒', '智利新世界精品红酒', 4),
(NULL, '澳大利亚红酒', '澳洲奔富等知名品牌', 5),
(NULL, '国产红酒', '中国优质葡萄酒', 6),
(NULL, '起泡酒/香槟', '庆典首选气泡酒', 7),
(NULL, '白葡萄酒', '清爽白葡萄酒系列', 8);
