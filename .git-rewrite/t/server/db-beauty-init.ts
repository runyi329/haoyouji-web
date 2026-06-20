/**
 * 奢贝美容院 - 数据库表自动初始化
 * 在服务器启动时确保所有 beauty 相关表存在（CREATE TABLE IF NOT EXISTS）
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function ensureBeautyTables(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // beauty_services
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_services\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(100) NOT NULL,
        \`description\` TEXT,
        \`duration\` INT NOT NULL DEFAULT 60,
        \`price\` DECIMAL(10,2) NOT NULL,
        \`imageUrl\` TEXT,
        \`category\` ENUM('facial','body','hair','nail','other') NOT NULL DEFAULT 'other',
        \`isActive\` INT NOT NULL DEFAULT 1,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    // beauty_appointments
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_appointments\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL,
        \`serviceId\` INT NOT NULL,
        \`appointmentDate\` TIMESTAMP NOT NULL,
        \`status\` ENUM('pending','confirmed','completed','cancelled') NOT NULL DEFAULT 'pending',
        \`notes\` TEXT,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    // beauty_promotions
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_promotions\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`title\` VARCHAR(100) NOT NULL,
        \`description\` TEXT,
        \`imageUrl\` TEXT,
        \`type\` ENUM('opening','points','coupon','other') NOT NULL DEFAULT 'other',
        \`isActive\` INT NOT NULL DEFAULT 1,
        \`startDate\` TIMESTAMP NULL,
        \`endDate\` TIMESTAMP NULL,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    // beauty_brands
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_brands\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(100) NOT NULL,
        \`description\` TEXT,
        \`logoUrl\` TEXT,
        \`bannerUrl\` TEXT,
        \`isActive\` INT NOT NULL DEFAULT 1,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    // beauty_product_categories
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_product_categories\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(50) NOT NULL,
        \`type\` ENUM('beauty','health') NOT NULL,
        \`isActive\` INT NOT NULL DEFAULT 1,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    // beauty_product_effects
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_product_effects\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(50) NOT NULL,
        \`isActive\` INT NOT NULL DEFAULT 1,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    // beauty_products
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_products\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(100) NOT NULL,
        \`description\` TEXT,
        \`price\` DECIMAL(10,2) NOT NULL,
        \`imageUrl\` TEXT,
        \`brandId\` INT NOT NULL,
        \`categoryId\` INT NOT NULL,
        \`specification\` VARCHAR(100),
        \`stock\` INT NOT NULL DEFAULT 0,
        \`isActive\` INT NOT NULL DEFAULT 1,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    // beauty_product_effect_mappings
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_product_effect_mappings\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`productId\` INT NOT NULL,
        \`effectId\` INT NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    // beauty_cart_items
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_cart_items\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL,
        \`productId\` INT NOT NULL,
        \`quantity\` INT NOT NULL DEFAULT 1,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    // beauty_orders
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_orders\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL,
        \`orderNumber\` VARCHAR(50) NOT NULL UNIQUE,
        \`totalAmount\` DECIMAL(10,2) NOT NULL,
        \`status\` ENUM('pending','paid','shipped','completed','cancelled') NOT NULL DEFAULT 'pending',
        \`shippingAddress\` TEXT,
        \`notes\` TEXT,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    // beauty_order_items
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS \`beauty_order_items\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`orderId\` INT NOT NULL,
        \`productId\` INT NOT NULL,
        \`productName\` VARCHAR(100) NOT NULL,
        \`price\` DECIMAL(10,2) NOT NULL,
        \`quantity\` INT NOT NULL,
        \`subtotal\` DECIMAL(10,2) NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `));

    console.log('[初始化] 奢贝美容院数据库表检查完成');
  } catch (error) {
    console.error('[初始化] 奢贝美容院建表失败:', error instanceof Error ? error.message : error);
  }
}
