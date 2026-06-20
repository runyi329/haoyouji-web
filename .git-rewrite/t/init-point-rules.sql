-- 初始化积分规则数据
-- 如果规则已存在则跳过，避免重复插入

INSERT IGNORE INTO point_rules (actionType, actionName, points, isActive, description) VALUES
('add_contact', '添加人脉', 10, 1, '每次添加新联系人获得的积分'),
('add_tag', '打标签', 5, 1, '为好友添加标签获得的积分'),
('communication', '每次联络', 2, 1, '与联系人互动沟通获得的积分'),
('share_contact', '共享人脉', 15, 1, '分享联系人给其他用户获得的积分'),
('be_referrer', '被加为推荐人', 20, 1, '被其他用户添加为推荐人获得的积分'),
('daily_signin', '每日签到', 3, 1, '每日签到获得的积分'),
('consecutive_signin', '连续签到', 10, 1, '连续签到奖励积分'),
('complete_task', '完成任务', 8, 1, '完成系统任务获得的积分'),
('participate_activity', '参与活动', 12, 1, '参与平台活动获得的积分'),
('share_content', '分享内容', 5, 1, '分享内容到社交平台获得的积分'),
('add_favorite', '添加收藏', 3, 1, '收藏内容获得的积分'),
('add_comment', '发表评论', 5, 1, '发表评论获得的积分');

-- 查看插入结果
SELECT * FROM point_rules ORDER BY id;
