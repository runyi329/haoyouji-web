import { getDb } from './server/db';

async function createCategories() {
  const { contactFieldCategories } = await import('./drizzle/schema');
  const db = await getDb();
  
  if (!db) {
    console.error('数据库不可用');
    process.exit(1);
  }
  
  const categories = [
    '星座', '生日', '血型', '属相', '年龄', '身高', '鞋码', '民族',
    '饮食', '习惯', '健康', '性格', '品牌', '娱乐',
    '公司', '行业', '类型', '职业', '征信', '财务', '法务', '劳务',
    '税务', '人事', '公户', '私户',
    '电话', '微信', '邮箱', '地址'
  ];
  
  console.log('开始创建字段分类...');
  
  // 获取现有分类
  const existing = await db.select().from(contactFieldCategories);
  const existingNames = new Set(existing.map(c => c.name));
  
  console.log(`现有分类: ${existing.length}个`);
  
  // 创建缺失的分类
  let created = 0;
  for (const name of categories) {
    if (!existingNames.has(name)) {
      await db.insert(contactFieldCategories).values({
        name,
        icon: '',
        parentCategoryId: null,
        parentUserId: null,
        createdAt: new Date(),
      });
      console.log(`✓ ${name}`);
      created++;
    } else {
      console.log(`- ${name} (已存在)`);
    }
  }
  
  console.log(`\n完成！新创建 ${created} 个分类`);
  
  // 显示所有分类
  const all = await db.select().from(contactFieldCategories);
  console.log(`\n总计: ${all.length} 个分类`);
  
  process.exit(0);
}

createCategories().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
