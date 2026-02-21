-- =====================================================
-- 修复工作群表 - 添加缺失的 updated_at 列
-- =====================================================

-- 使用存储过程安全地添加列（MySQL不支持 ADD COLUMN IF NOT EXISTS）
DELIMITER //

DROP PROCEDURE IF EXISTS add_updated_at_columns//

CREATE PROCEDURE add_updated_at_columns()
BEGIN
    -- 给 partnerships 表添加 updated_at 列
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'partnerships' 
        AND COLUMN_NAME = 'updated_at'
    ) THEN
        ALTER TABLE `partnerships` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
    END IF;

    -- 给 partnership_work_groups 表添加 updated_at 列
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'partnership_work_groups' 
        AND COLUMN_NAME = 'updated_at'
    ) THEN
        ALTER TABLE `partnership_work_groups` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
    END IF;
END//

DELIMITER ;

CALL add_updated_at_columns();
DROP PROCEDURE IF EXISTS add_updated_at_columns;

-- 确保初始数据存在
INSERT IGNORE INTO `partnerships` (`id`, `name`, `description`) VALUES 
(1, '上海煦斌教育科技合伙企业（有限合伙）', '有限合伙企业');

INSERT IGNORE INTO `partnership_work_groups` (`id`, `partnership_id`, `name`, `description`) VALUES 
(1, 1, '工作群1', '第一个工作群'),
(2, 1, '工作群2', '第二个工作群'),
(3, 1, '工作群3', '第三个工作群');
