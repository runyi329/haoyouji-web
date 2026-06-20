-- =====================================================
-- 工作群成员管理系统 - 数据库迁移
-- =====================================================
-- 创建日期: 2026-02-21
-- 说明: 创建工作群相关的4个表和初始化数据
-- =====================================================

-- 1. 创建有限合伙企业表
CREATE TABLE IF NOT EXISTS `partnerships` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL COMMENT '企业名称',
  `description` TEXT COMMENT '企业描述',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='有限合伙企业表';

-- 2. 创建工作群表
CREATE TABLE IF NOT EXISTS `partnership_work_groups` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `partnership_id` INT NOT NULL COMMENT '所属企业ID',
  `name` VARCHAR(100) NOT NULL COMMENT '工作群名称',
  `description` TEXT COMMENT '工作群描述',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_partnership_id` (`partnership_id`),
  CONSTRAINT `fk_work_groups_partnership` FOREIGN KEY (`partnership_id`) REFERENCES `partnerships` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作群表';

-- 3. 创建成员-企业关联表
CREATE TABLE IF NOT EXISTS `partnership_members` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `partnership_id` INT NOT NULL COMMENT '所属企业ID',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `role` ENUM('member', 'admin') NOT NULL DEFAULT 'member' COMMENT '角色：member=普通成员, admin=管理员',
  `joined_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_partnership_user` (`partnership_id`, `user_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_members_partnership` FOREIGN KEY (`partnership_id`) REFERENCES `partnerships` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成员-企业关联表';

-- 4. 创建成员-工作群关联表
CREATE TABLE IF NOT EXISTS `partnership_work_group_members` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `work_group_id` INT NOT NULL COMMENT '工作群ID',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `joined_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_work_group_user` (`work_group_id`, `user_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_wg_members_work_group` FOREIGN KEY (`work_group_id`) REFERENCES `partnership_work_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wg_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成员-工作群关联表';

-- =====================================================
-- 初始化数据
-- =====================================================

-- 插入有限合伙企业（使用INSERT IGNORE避免重复）
INSERT IGNORE INTO `partnerships` (`id`, `name`, `description`) VALUES 
(1, '上海煦斌教育科技合伙企业（有限合伙）', '有限合伙企业');

-- 插入工作群（使用INSERT IGNORE避免重复）
INSERT IGNORE INTO `partnership_work_groups` (`id`, `partnership_id`, `name`, `description`) VALUES 
(1, 1, '工作群1', '第一个工作群'),
(2, 1, '工作群2', '第二个工作群'),
(3, 1, '工作群3', '第三个工作群');
