-- 创建卡券表
CREATE TABLE IF NOT EXISTS `coupons` (
  `id` VARCHAR(36) PRIMARY KEY NOT NULL,
  `creator_id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `template_type` VARCHAR(50) NOT NULL DEFAULT 'default',
  `template_data` JSON,
  `valid_from` TIMESTAMP NOT NULL,
  `valid_until` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `coupons_creator_id_idx` (`creator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建卡券接收记录表
CREATE TABLE IF NOT EXISTS `coupon_recipients` (
  `id` VARCHAR(36) PRIMARY KEY NOT NULL,
  `coupon_id` VARCHAR(36) NOT NULL,
  `recipient_id` VARCHAR(36) NOT NULL,
  `status` ENUM('unused', 'used') NOT NULL DEFAULT 'unused',
  `received_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `coupon_recipients_coupon_id_idx` (`coupon_id`),
  INDEX `coupon_recipients_recipient_id_idx` (`recipient_id`),
  INDEX `coupon_recipients_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建卡券使用/核销记录表
CREATE TABLE IF NOT EXISTS `coupon_usage` (
  `id` VARCHAR(36) PRIMARY KEY NOT NULL,
  `recipient_record_id` VARCHAR(36) NOT NULL,
  `coupon_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `used_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` TEXT,
  INDEX `coupon_usage_coupon_id_idx` (`coupon_id`),
  INDEX `coupon_usage_user_id_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
