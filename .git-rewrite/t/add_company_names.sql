-- 为 jiang 用户的联系人批量添加公司名称（只添加完整的公司名称）
-- 注意：已有"公司名称"字段的联系人不会重复添加

-- 1. 王茜 - 北京扶摇新程信息咨询有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '北京扶摇新程信息咨询有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '王茜'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 2. 李晓洁 - 上海桥孚科技有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '上海桥孚科技有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '李晓洁'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 3. 羊仲平 - 隐钰庐（上海）艺术设计有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '隐钰庐（上海）艺术设计有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '羊仲平'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 4. 张珏 - 上海润豆仪豆贸易有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '上海润豆仪豆贸易有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '张珏'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 5. 刘强 - 上海合合信息科技发展有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '上海合合信息科技发展有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '刘强'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 6. 马婉义 - 北京公积金管理中心
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '北京公积金管理中心', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '马婉义'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 7. 钟贝 - 北京第一法院
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '北京第一法院', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '钟贝'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 8. 杨雪 - 北京市地税局
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '北京市地税局', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '杨雪'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 9. 秦主任 - 海淀外国语多语种学院
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '海淀外国语多语种学院', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '秦主任'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 10. 丁楠 - 上海再捷商务信息咨询有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '上海再捷商务信息咨询有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '丁楠'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 11. 郑奎 - 上海博雅口腔门诊部有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '上海博雅口腔门诊部有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '郑奎'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 12. 洪小燕 - 上海恒愿口腔门诊部有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '上海恒愿口腔门诊部有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '洪小燕'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 13. 望悦 - 锦途远景教育科技(北京)有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '锦途远景教育科技(北京)有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '望悦'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 14. 卓迪敦 - 艾林芝黄志刚律师事务所
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '艾林芝黄志刚律师事务所', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '卓迪敦'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 15. 周翔 - 上海思航农业科技有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '上海思航农业科技有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '周翔'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 16. 陈奇戎 - 上海保恒贸易有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '上海保恒贸易有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '陈奇戎'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 17. 王海艳 - 上海昌唯文化发展有限公司
INSERT INTO contact_custom_fields (contactId, fieldName, fieldValue, sortOrder, createdAt, updatedAt)
SELECT c.id, '公司名称', '上海昌唯文化发展有限公司', 0, NOW(), NOW()
FROM contacts c
INNER JOIN users u ON c.parentUserId = u.id
WHERE u.username = 'Jiang' AND c.name = '王海艳'
AND NOT EXISTS (
  SELECT 1 FROM contact_custom_fields ccf 
  WHERE ccf.contactId = c.id AND ccf.fieldName = '公司名称'
);

-- 注意：以下联系人的公司名称不完整，不添加：
-- - 白媛媛: 青苗
-- - 白君禹: 外文局
-- - 安宇: 西门子
-- - 付before: 太阳公享
-- - 赵鹏: Boss直聘Ceo
