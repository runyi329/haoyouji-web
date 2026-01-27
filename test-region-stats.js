// 模拟后端逻辑
const allProvinces = [
  '北京', '天津', '上海', '重庆',
  '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '海南',
  '四川', '贵州', '云南', '陕西', '甘肃', '青海',
  '内蒙古', '广西', '西藏', '宁夏', '新疆',
  '台湾', '香港', '澳门'
];

// 模拟数据库返回的数据
const dbData = [
  { name: '北京', value: 331 },
  { name: '上海', value: 82 },
  { name: '浙江', value: 26 }
];

// 创建regionMap
const regionMap = new Map();
for (const r of dbData) {
  regionMap.set(r.name, r.value);
}

// 创建完整的省份列表
const normalRegions = allProvinces.map(province => ({
  name: province,
  value: regionMap.get(province) || 0
}));

console.log('前5个省份:', JSON.stringify(normalRegions.slice(0, 5), null, 2));
console.log('总共:', normalRegions.length, '个省份');
console.log('有数据的:', normalRegions.filter(p => p.value > 0).length, '个');
