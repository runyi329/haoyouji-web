-- 确保初始数据存在（放在最前面，确保一定能执行到）
INSERT IGNORE INTO `partnerships` (`id`, `name`, `description`) VALUES 
(1, '上海煦斌教育科技合伙企业（有限合伙）', '有限合伙企业');

INSERT IGNORE INTO `partnership_work_groups` (`id`, `partnership_id`, `name`, `description`) VALUES 
(1, 1, '工作群1', '第一个工作群'),
(2, 1, '工作群2', '第二个工作群'),
(3, 1, '工作群3', '第三个工作群');
