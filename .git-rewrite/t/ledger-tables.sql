正在导出账本相关表的SQL...

-- ========== ledgers 表结构 ==========
CREATE TABLE `ledgers` (
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
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=90001


-- ========== ledger_members 表结构 ==========
CREATE TABLE `ledger_members` (
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
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=90001


导出 ledger_entries 失败: Failed query: SHOW CREATE TABLE ledger_entries
params: 
-- ========== ledger_categories 表结构 ==========
CREATE TABLE `ledger_categories` (
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
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=120001


-- ========== 预设分类数据 (8条) ==========
INSERT INTO ledger_categories (id, ledgerId, name, type, parentId, icon, color, sortOrder, isDefault, createdBy, createdAt, updatedAt) VALUES
(90001, 0, '购物', 'expense', NULL, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:52', '2026-01-27 06:46:52'),
(90002, 0, '外卖', 'expense', 90001, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:52', '2026-01-27 06:46:52'),
(90003, 0, '饿了么', 'expense', 90002, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:52', '2026-01-27 06:46:52'),
(90004, 0, '美团', 'expense', 90002, NULL, NULL, 2, 0, 0, '2026-01-27 06:46:53', '2026-01-27 06:46:53'),
(90005, 0, '工资', 'income', NULL, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:53', '2026-01-27 06:46:53'),
(90006, 0, '主业收入', 'income', 90005, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:53', '2026-01-27 06:46:53'),
(90007, 0, '固定工资', 'income', 90006, NULL, NULL, 1, 0, 0, '2026-01-27 06:46:53', '2026-01-27 06:46:53'),
(90008, 0, '绩效奖金', 'income', 90006, NULL, NULL, 2, 0, 0, '2026-01-27 06:46:54', '2026-01-27 06:46:54');

导出完成！
