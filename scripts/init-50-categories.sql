-- 初始化50个扩展信息类目

INSERT INTO contact_field_categories (parentUserId, name, fieldType, options, sortOrder, isRequired) VALUES
-- 基本联系信息
(0, '手机号码', 'text', NULL, 1, 0),
(0, '座机号码', 'text', NULL, 2, 0),
(0, '微信号', 'text', NULL, 3, 0),
(0, 'QQ号', 'text', NULL, 4, 0),
(0, '邮箱', 'text', NULL, 5, 0),
(0, '个人网站', 'text', NULL, 6, 0),
(0, '领英主页', 'text', NULL, 7, 0),

-- 工作信息
(0, '公司名称', 'text', NULL, 8, 0),
(0, '职位', 'text', NULL, 9, 0),
(0, '部门', 'text', NULL, 10, 0),
(0, '工号', 'text', NULL, 11, 0),
(0, '公司电话', 'text', NULL, 12, 0),
(0, '公司邮箱', 'text', NULL, 13, 0),
(0, '办公地址', 'text', NULL, 14, 0),
(0, '行业', 'text', NULL, 15, 0),
(0, '入职日期', 'date', NULL, 16, 0),

-- 地址信息
(0, '家庭地址', 'text', NULL, 17, 0),
(0, '快递地址', 'text', NULL, 18, 0),
(0, '户籍地址', 'text', NULL, 19, 0),
(0, '常住地址', 'text', NULL, 20, 0),

-- 个人信息
(0, '生日', 'date', NULL, 21, 0),
(0, '身份证号', 'text', NULL, 22, 0),
(0, '护照号', 'text', NULL, 23, 0),
(0, '驾照号', 'text', NULL, 24, 0),
(0, '血型', 'text', NULL, 25, 0),
(0, '身高', 'text', NULL, 26, 0),
(0, '体重', 'text', NULL, 27, 0),
(0, '民族', 'text', NULL, 28, 0),
(0, '籍贯', 'text', NULL, 29, 0),
(0, '政治面貌', 'text', NULL, 30, 0),

-- 教育背景
(0, '毕业院校', 'text', NULL, 31, 0),
(0, '学历', 'text', NULL, 32, 0),
(0, '专业', 'text', NULL, 33, 0),
(0, '毕业时间', 'date', NULL, 34, 0),

-- 家庭信息
(0, '配偶姓名', 'text', NULL, 35, 0),
(0, '配偶电话', 'text', NULL, 36, 0),
(0, '子女姓名', 'text', NULL, 37, 0),
(0, '子女年龄', 'text', NULL, 38, 0),
(0, '父母姓名', 'text', NULL, 39, 0),
(0, '父母电话', 'text', NULL, 40, 0),
(0, '紧急联系人', 'text', NULL, 41, 0),
(0, '紧急联系电话', 'text', NULL, 42, 0),

-- 兴趣爱好
(0, '爱好', 'text', NULL, 43, 0),
(0, '特长', 'text', NULL, 44, 0),
(0, '运动项目', 'text', NULL, 45, 0),

-- 其他信息
(0, '车牌号', 'text', NULL, 46, 0),
(0, '车型', 'text', NULL, 47, 0),
(0, '备注', 'text', NULL, 48, 0),
(0, '标签', 'text', NULL, 49, 0),
(0, '自定义字段', 'text', NULL, 50, 0);
