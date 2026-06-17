-- ============================================================
-- 牙伴演示院（tenant_id=9999）预约 + 医生排班 数据收敛脚本
-- 范围：仅动预约(yaban_appointment) 与 排班(yaban_shift_template/override) 及演示医生/顾客账号
-- 不触碰：收费、商城订单、评价、材料等其它演示数据
-- 全部幂等，可安全重复执行
-- ============================================================
SET @TID := 9999;

-- ---------- 1) 新建/确保 5 个演示医生账号 ----------
-- openId 固定前缀 yaban_demo_doc_N，避免与真实用户冲突；role 用 parent
INSERT INTO users (openId, username, name, role, loginMethod, points)
SELECT * FROM (
  SELECT 'yaban_demo_doc_1' AS openId, 'yaban_demo_doc_1' AS username, '王医生' AS name, 'parent' AS role, 'demo' AS loginMethod, 0 AS points UNION ALL
  SELECT 'yaban_demo_doc_2','yaban_demo_doc_2','李医生','parent','demo',0 UNION ALL
  SELECT 'yaban_demo_doc_3','yaban_demo_doc_3','张医生','parent','demo',0 UNION ALL
  SELECT 'yaban_demo_doc_4','yaban_demo_doc_4','刘医生','parent','demo',0 UNION ALL
  SELECT 'yaban_demo_doc_5','yaban_demo_doc_5','陈医生','parent','demo',0
) d
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.openId = d.openId);

-- 名称兜底刷新（若已存在则确保名字正确）
UPDATE users SET name='王医生' WHERE openId='yaban_demo_doc_1';
UPDATE users SET name='李医生' WHERE openId='yaban_demo_doc_2';
UPDATE users SET name='张医生' WHERE openId='yaban_demo_doc_3';
UPDATE users SET name='刘医生' WHERE openId='yaban_demo_doc_4';
UPDATE users SET name='陈医生' WHERE openId='yaban_demo_doc_5';

-- ---------- 2) 新建/确保 5 个演示顾客账号 ----------
INSERT INTO users (openId, username, name, role, loginMethod, points)
SELECT * FROM (
  SELECT 'yaban_demo_pat_1' AS openId, 'yaban_demo_pat_1' AS username, '赵敏' AS name, 'parent' AS role, 'demo' AS loginMethod, 0 AS points UNION ALL
  SELECT 'yaban_demo_pat_2','yaban_demo_pat_2','孙浩','parent','demo',0 UNION ALL
  SELECT 'yaban_demo_pat_3','yaban_demo_pat_3','周婷','parent','demo',0 UNION ALL
  SELECT 'yaban_demo_pat_4','yaban_demo_pat_4','吴磊','parent','demo',0 UNION ALL
  SELECT 'yaban_demo_pat_5','yaban_demo_pat_5','郑雪','parent','demo',0
) d
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.openId = d.openId);

UPDATE users SET name='赵敏' WHERE openId='yaban_demo_pat_1';
UPDATE users SET name='孙浩' WHERE openId='yaban_demo_pat_2';
UPDATE users SET name='周婷' WHERE openId='yaban_demo_pat_3';
UPDATE users SET name='吴磊' WHERE openId='yaban_demo_pat_4';
UPDATE users SET name='郑雪' WHERE openId='yaban_demo_pat_5';

-- ---------- 3) 清理 9999 院旧成员，只挂 5 名演示医生 ----------
DELETE FROM yaban_clinic_member WHERE tenant_id = @TID;
INSERT INTO yaban_clinic_member (tenant_id, user_id, role_key, status)
SELECT @TID, u.id, 'owner', 'active'
FROM users u WHERE u.openId = 'yaban_demo_doc_1';
INSERT INTO yaban_clinic_member (tenant_id, user_id, role_key, status)
SELECT @TID, u.id, 'doctor', 'active' FROM users u WHERE u.openId IN
  ('yaban_demo_doc_2','yaban_demo_doc_3','yaban_demo_doc_4','yaban_demo_doc_5');

-- ---------- 4) 重建 5 名医生的排班模板 ----------
DELETE FROM yaban_shift_template WHERE tenant_id = @TID;
INSERT INTO yaban_shift_template
  (tenant_id, staff_user_id, staff_name, role_key, work_start, work_end, break_start, break_end, work_days, color, is_active)
SELECT @TID, u.id, '王医生', 'owner',  '09:00','18:00','12:00','13:00','1,2,3,4,5,6','#1E88D6',1 FROM users u WHERE u.openId='yaban_demo_doc_1'
UNION ALL
SELECT @TID, u.id, '李医生', 'doctor', '09:00','18:00','12:00','13:00','1,2,3,4,5',  '#26A69A',1 FROM users u WHERE u.openId='yaban_demo_doc_2'
UNION ALL
SELECT @TID, u.id, '张医生', 'doctor', '10:00','19:00','13:00','14:00','2,3,4,5,6',  '#7E57C2',1 FROM users u WHERE u.openId='yaban_demo_doc_3'
UNION ALL
SELECT @TID, u.id, '刘医生', 'doctor', '09:00','17:00','12:00','13:00','1,2,3,4,5',  '#EF6C00',1 FROM users u WHERE u.openId='yaban_demo_doc_4'
UNION ALL
SELECT @TID, u.id, '陈医生', 'doctor', '09:30','18:30','12:30','13:30','1,3,4,5,6',  '#C2185B',1 FROM users u WHERE u.openId='yaban_demo_doc_5';

-- ---------- 5) 清理 9999 院旧预约与单日调班 ----------
DELETE FROM yaban_appointment WHERE tenant_id = @TID;
DELETE FROM yaban_shift_override WHERE tenant_id = @TID;
-- 重建预约由存储过程生成（见下）
