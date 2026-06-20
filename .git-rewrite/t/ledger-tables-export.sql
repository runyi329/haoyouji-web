-- ========================================
-- 账本系统数据库表结构和预设数据
-- 导出时间: 2026-01-27
-- 用途: 在腾讯云数据库中创建账本相关的表
-- ========================================

-- ========== 1. ledgers 表（账本主表） ==========
CREATE TABLE IF NOT EXISTS `ledgers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'personal',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CNY',
  `icon` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdBy` int(11) NOT NULL DEFAULT '0',
  `ownerId` int(11) NOT NULL,
  `isVip` tinyint(1) NOT NULL DEFAULT '0',
  `isArchived` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=90001;

-- ========== 2. ledger_members 表（账本成员表） ==========
CREATE TABLE IF NOT EXISTS `ledger_members` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ledgerId` int(11) NOT NULL,
  `userId` int(11) NOT NULL,
  `role` enum('owner','member') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'member',
  `nickname` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `member_type` enum('real','ai') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'real' COMMENT '成员类型',
  `avatar_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'AI雇员头像类型',
  `permission_view` enum('all','own') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT '查看账目权限',
  `permission_add` enum('all','own') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT '添加账目权限',
  `permission_edit` enum('all','own') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'own' COMMENT '修改账目权限',
  `permission_delete` enum('all','own') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'own' COMMENT '删除账目权限',
  `canEdit` tinyint(4) NOT NULL DEFAULT '1',
  `canDelete` tinyint(4) NOT NULL DEFAULT '0',
  `canInvite` tinyint(4) NOT NULL DEFAULT '0',
  `invitedBy` int(11) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=90001;

-- ========== 3. ledger_records 表（账目明细表） ==========
CREATE TABLE IF NOT EXISTS `ledger_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ledgerId` int(11) NOT NULL,
  `categoryId` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `type` enum('income','expense') COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdBy` int(11) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 4. ledger_categories 表（账目分类表） ==========
CREATE TABLE IF NOT EXISTS `ledger_categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ledgerId` int(11) NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('income','expense') COLLATE utf8mb4_unicode_ci NOT NULL,
  `parentId` int(11) DEFAULT NULL,
  `icon` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sortOrder` int(11) NOT NULL DEFAULT '0',
  `isDefault` tinyint(4) NOT NULL DEFAULT '0',
  `createdBy` int(11) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=120001;

-- ========== 5. 预设分类数据（8条示例分类） ==========
-- 这些分类是全局预设分类（ledgerId=0），所有账本都可以使用
INSERT INTO ledger_categories (id, ledgerId, name, type, parentId, icon, color, sortOrder, isDefault, createdBy, createdAt, updatedAt) VALUES
(90001, 0, '购物', 'expense', NULL, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:52', '2026-01-27 06:46:52'),
(90002, 0, '外卖', 'expense', 90001, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:52', '2026-01-27 06:46:52'),
(90003, 0, '饿了么', 'expense', 90002, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:52', '2026-01-27 06:46:52'),
(90004, 0, '美团', 'expense', 90002, NULL, NULL, 2, 0, 0, '2026-01-27 06:46:53', '2026-01-27 06:46:53'),
(90005, 0, '工资', 'income', NULL, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:53', '2026-01-27 06:46:53'),
(90006, 0, '主业收入', 'income', 90005, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:53', '2026-01-27 06:46:53'),
(90007, 0, '固定工资', 'income', 90006, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:53', '2026-01-27 06:46:53'),
(90008, 0, '绩效奖金', 'income', 90006, NULL, NULL, 2, 0, 0, '2026-01-27 06:46:54', '2026-01-27 06:46:54');

-- ========================================
-- 导入说明：
-- 1. 连接到腾讯云MySQL数据库
-- 2. 选择目标数据库: USE crm_db;
-- 3. 执行本SQL文件: source /path/to/ledger-tables-export.sql;
-- 4. 验证表创建: SHOW TABLES LIKE 'ledger%';
-- 5. 验证预设分类: SELECT * FROM ledger_categories WHERE ledgerId=0;
-- ========================================
