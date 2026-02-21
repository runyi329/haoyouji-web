-- 将管理员Jiang添加为企业成员
-- 这样他的头像就会显示在工作群卡片中

-- 首先检查Jiang是否已经是成员（避免重复插入）
INSERT INTO partnership_members (partnership_id, user_id, role, joined_at, updated_at)
SELECT 1, u.id, 'admin', NOW(), NOW()
FROM users u
WHERE u.username = 'jiang'
AND NOT EXISTS (
  SELECT 1 FROM partnership_members pm
  WHERE pm.partnership_id = 1 AND pm.user_id = u.id
)
LIMIT 1;

-- 将Jiang添加到所有工作群（可选，如果希望他出现在所有工作群中）
INSERT INTO partnership_work_group_members (work_group_id, user_id, joined_at, updated_at)
SELECT pwg.id, u.id, NOW(), NOW()
FROM users u
CROSS JOIN partnership_work_groups pwg
WHERE u.username = 'jiang'
AND pwg.partnership_id = 1
AND NOT EXISTS (
  SELECT 1 FROM partnership_work_group_members pwgm
  WHERE pwgm.work_group_id = pwg.id AND pwgm.user_id = u.id
);
