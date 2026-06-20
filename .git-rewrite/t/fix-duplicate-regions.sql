-- 修复省份重复数据
-- 统一使用短名字（不带"省/市/自治区/特别行政区"后缀）

-- 直辖市
UPDATE contacts SET region = '北京' WHERE region = '北京市';
UPDATE contacts SET region = '上海' WHERE region = '上海市';
UPDATE contacts SET region = '天津' WHERE region = '天津市';
UPDATE contacts SET region = '重庆' WHERE region = '重庆市';

-- 省份
UPDATE contacts SET region = '河北' WHERE region = '河北省';
UPDATE contacts SET region = '山西' WHERE region = '山西省';
UPDATE contacts SET region = '辽宁' WHERE region = '辽宁省';
UPDATE contacts SET region = '吉林' WHERE region = '吉林省';
UPDATE contacts SET region = '黑龙江' WHERE region = '黑龙江省';
UPDATE contacts SET region = '江苏' WHERE region = '江苏省';
UPDATE contacts SET region = '浙江' WHERE region = '浙江省';
UPDATE contacts SET region = '安徽' WHERE region = '安徽省';
UPDATE contacts SET region = '福建' WHERE region = '福建省';
UPDATE contacts SET region = '江西' WHERE region = '江西省';
UPDATE contacts SET region = '山东' WHERE region = '山东省';
UPDATE contacts SET region = '河南' WHERE region = '河南省';
UPDATE contacts SET region = '湖北' WHERE region = '湖北省';
UPDATE contacts SET region = '湖南' WHERE region = '湖南省';
UPDATE contacts SET region = '广东' WHERE region = '广东省';
UPDATE contacts SET region = '海南' WHERE region = '海南省';
UPDATE contacts SET region = '四川' WHERE region = '四川省';
UPDATE contacts SET region = '贵州' WHERE region = '贵州省';
UPDATE contacts SET region = '云南' WHERE region = '云南省';
UPDATE contacts SET region = '陕西' WHERE region = '陕西省';
UPDATE contacts SET region = '甘肃' WHERE region = '甘肃省';
UPDATE contacts SET region = '青海' WHERE region = '青海省';
UPDATE contacts SET region = '台湾' WHERE region = '台湾省';

-- 自治区
UPDATE contacts SET region = '内蒙古' WHERE region = '内蒙古自治区';
UPDATE contacts SET region = '广西' WHERE region = '广西壮族自治区';
UPDATE contacts SET region = '西藏' WHERE region = '西藏自治区';
UPDATE contacts SET region = '宁夏' WHERE region = '宁夏回族自治区';
UPDATE contacts SET region = '新疆' WHERE region = '新疆维吾尔自治区';

-- 特别行政区
UPDATE contacts SET region = '香港' WHERE region = '香港特别行政区';
UPDATE contacts SET region = '澳门' WHERE region = '澳门特别行政区';

-- 查看修复后的结果
SELECT region, COUNT(*) as count 
FROM contacts 
WHERE region IS NOT NULL AND region != '' 
GROUP BY region 
ORDER BY COUNT(*) DESC;
