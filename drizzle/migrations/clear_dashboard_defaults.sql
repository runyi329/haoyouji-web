-- 清空最新动态和预警雷达的默认模拟数据
DELETE FROM `partnership_dashboard_activities` WHERE `partnership_id` = 1;
DELETE FROM `partnership_dashboard_alerts` WHERE `partnership_id` = 1;
