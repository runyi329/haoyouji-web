import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { contactFieldCategories } from './drizzle/schema.ts';

const sqlite = new Database('./data/haoyouji.db');
const db = drizzle(sqlite);

const categories = [
  '星座', '生日', '血型', '属相', '年龄', '身高', '鞋码', '民族',
  '饮食', '习惯', '健康', '性格', '品牌', '娱乐',
  '公司', '行业', '类型', '职业', '征信', '财务', '法务', '劳务',
  '税务', '人事', '公户', '私户',
  '电话', '微信', '邮箱', '地址'
];

const existing = await db.select().from(contactFieldCategories);
const existingNames = new Set(existing.map(c => c.name));

console.log(`现有分类: ${existing.length}个`);

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
  }
}

console.log(`\n新创建: ${created}个`);

const all = await db.select().from(contactFieldCategories);
console.log(`总计: ${all.length}个分类`);
all.slice(0, 10).forEach(c => console.log(`  ${c.id}: ${c.name}`));
