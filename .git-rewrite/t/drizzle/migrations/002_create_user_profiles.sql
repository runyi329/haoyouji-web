-- 创建用户扩展资料表
CREATE TABLE IF NOT EXISTS `user_profiles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL UNIQUE,
  
  -- 基本信息
  `nickname` VARCHAR(100),
  `phone` VARCHAR(20),
  
  -- 实名认证
  `real_name` VARCHAR(100),
  `id_card_number` VARCHAR(18),
  `id_card_front_url` TEXT,
  `id_card_back_url` TEXT,
  `verification_status` ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
  `verified_at` TIMESTAMP NULL,
  
  -- 支付账号
  `bank_name` VARCHAR(100),
  `bank_account_number` VARCHAR(50),
  `bank_account_name` VARCHAR(100),
  `digital_wallet_address` VARCHAR(255),
  `alipay_account` VARCHAR(100),
  `wechat_account` VARCHAR(100),
  
  -- 时间戳
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_verification_status` (`verification_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建收件地址表（支持多个地址）
CREATE TABLE IF NOT EXISTS `shipping_addresses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  
  -- 地址信息
  `recipient_name` VARCHAR(100) NOT NULL,
  `recipient_phone` VARCHAR(20) NOT NULL,
  `province` VARCHAR(50),
  `city` VARCHAR(50),
  `district` VARCHAR(50),
  `detailed_address` TEXT NOT NULL,
  `postal_code` VARCHAR(10),
  
  -- 标记
  `is_default` TINYINT DEFAULT 0 NOT NULL,
  `label` VARCHAR(20), -- 家、公司、学校等
  
  -- 时间戳
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_is_default` (`is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
