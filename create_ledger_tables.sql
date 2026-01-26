-- ==========================================
-- 账本系统数据库表创建脚本
-- 数据库：crm_db (腾讯云共享数据库)
-- ==========================================

-- 1. 创建 ledgers 表（账本主表）
CREATE TABLE IF NOT EXISTS `ledgers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL COMMENT '账本名称',
  `description` TEXT COMMENT '账本描述',
  `type` VARCHAR(50) NOT NULL DEFAULT 'personal' COMMENT '账本类型：personal/family/couple/group',
  `currency` VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '结算货币',
  `icon` TEXT COMMENT '账本图标',
  `createdBy` INT NOT NULL COMMENT '创建者用户ID',
  `ownerId` INT NOT NULL COMMENT '所有者用户ID',
  `isVip` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否VIP账本',
  `isArchived` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已归档',
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX `idx_createdBy` (`createdBy`),
  INDEX `idx_ownerId` (`ownerId`),
  INDEX `idx_type` (`type`),
  INDEX `idx_isArchived` (`isArchived`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账本主表';

-- 2. 创建 ledger_members 表（账本成员表）
CREATE TABLE IF NOT EXISTS `ledger_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ledgerId` INT NOT NULL COMMENT '账本ID',
  `userId` INT NOT NULL COMMENT '用户ID',
  `role` VARCHAR(20) NOT NULL DEFAULT 'member' COMMENT '角色：owner/admin/member',
  `nickname` VARCHAR(50) COMMENT '在该账本中的昵称',
  `canEdit` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否可以编辑记录',
  `canDelete` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否可以删除记录',
  `canInvite` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否可以邀请新成员',
  `invitedBy` INT COMMENT '邀请人用户ID',
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY `uk_ledger_user` (`ledgerId`, `userId`),
  INDEX `idx_userId` (`userId`),
  INDEX `idx_ledgerId` (`ledgerId`),
  INDEX `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账本成员表';

-- 3. 创建 ledger_categories 表（账本分类表）
CREATE TABLE IF NOT EXISTS `ledger_categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ledgerId` INT NOT NULL COMMENT '账本ID',
  `name` VARCHAR(50) NOT NULL COMMENT '分类名称',
  `type` VARCHAR(20) NOT NULL COMMENT '分类类型：income/expense',
  `icon` VARCHAR(50) COMMENT '分类图标',
  `color` VARCHAR(20) COMMENT '分类颜色',
  `parentId` INT COMMENT '父分类ID（用于二级分类）',
  `sortOrder` INT NOT NULL DEFAULT 0 COMMENT '排序顺序',
  `isSystem` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否系统预设分类',
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX `idx_ledgerId` (`ledgerId`),
  INDEX `idx_type` (`type`),
  INDEX `idx_parentId` (`parentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账本分类表';

-- 4. 创建 ledger_records 表（账本记录表）
CREATE TABLE IF NOT EXISTS `ledger_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ledgerId` INT NOT NULL COMMENT '账本ID',
  `categoryId` INT NOT NULL COMMENT '分类ID',
  `userId` INT NOT NULL COMMENT '记录人用户ID',
  `type` VARCHAR(20) NOT NULL COMMENT '记录类型：income/expense',
  `amount` DECIMAL(10, 2) NOT NULL COMMENT '金额',
  `description` TEXT COMMENT '备注说明',
  `recordDate` DATE NOT NULL COMMENT '记录日期',
  `images` TEXT COMMENT '图片URL列表（JSON格式）',
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX `idx_ledgerId` (`ledgerId`),
  INDEX `idx_categoryId` (`categoryId`),
  INDEX `idx_userId` (`userId`),
  INDEX `idx_type` (`type`),
  INDEX `idx_recordDate` (`recordDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账本记录表';

-- ==========================================
-- 创建完成！
-- ==========================================
