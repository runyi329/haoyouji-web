-- 清零所有用户的积分
-- 执行日期: 2026-02-19
-- 说明: 将所有用户的积分重置为0，作为初始状态

-- 更新users表中所有用户的积分为0
UPDATE users SET points = 0;

-- 更新child_profiles表中所有子账户的积分为0
UPDATE child_profiles SET points = 0;

-- 查询验证结果
SELECT 'users表积分统计' as table_name, 
       COUNT(*) as total_users, 
       SUM(points) as total_points,
       MAX(points) as max_points,
       MIN(points) as min_points
FROM users
UNION ALL
SELECT 'child_profiles表积分统计' as table_name,
       COUNT(*) as total_users,
       SUM(points) as total_points,
       MAX(points) as max_points,
       MIN(points) as min_points
FROM child_profiles;
