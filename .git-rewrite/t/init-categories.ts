import { createFieldCategory, getFieldCategories } from './server/db-contacts';
import { getDb } from './server/db';

const categories = [
  '星座', '生日', '血型', '属相', '年龄', '身高', '鞋码', '民族',
  '饮食', '习惯', '健康', '性格', '品牌', '娱乐',
  '公司', '行业', '类型', '职业', '征信', '财务', '法务', '劳务',
  '税务', '人事', '公户', '私户',
  '电话', '微信', '邮箱', '地址'
];

async function init() {
  console.log('初始化数据库...');
  await getDb();
  console.log('开始初始化字段分类...');
  
  // 获取现有分类
  const existing = await getFieldCategories();
  const existingNames = new Set();
  
  const collectNames = (cats: any[]) => {
    cats.forEach((cat: any) => {
      existingNames.add(cat.name);
      if (cat.children) {
        collectNames(cat.children);
      }
    });
  };
  collectNames(existing);
  
  console.log(`现有分类: ${existingNames.size}个`);
  
  // 创建缺失的分类
  let created = 0;
  for (const name of categories) {
    if (!existingNames.has(name)) {
      try {
        await createFieldCategory(name, '', null);
        console.log(`✓ 创建: ${name}`);
        created++;
      } catch (error: any) {
        console.log(`✗ 失败: ${name} - ${error.message}`);
      }
    }
  }
  
  console.log(`\n完成！新创建 ${created} 个分类`);
  
  // 显示所有分类
  const all = await getFieldCategories();
  console.log(`\n总计: ${all.length} 个分类`);
  
  process.exit(0);
}

init().catch(console.error);
