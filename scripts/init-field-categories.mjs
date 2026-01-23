import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from '../drizzle/schema.ts';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
const db = drizzle(connection, { schema, mode: 'default' });

// 固定的扩展信息类目
const fieldCategories = [
  { name: '公司', field_type: 'text', sort_order: 1, is_required: false },
  { name: '职位', field_type: 'text', sort_order: 2, is_required: false },
  { name: '手机号码', field_type: 'text', sort_order: 3, is_required: false },
  { name: '邮箱', field_type: 'text', sort_order: 4, is_required: false },
  { name: '微信号', field_type: 'text', sort_order: 5, is_required: false },
  { name: '快递地址', field_type: 'text', sort_order: 6, is_required: false },
  { name: '生日', field_type: 'date', sort_order: 7, is_required: false },
  { name: '爱好', field_type: 'text', sort_order: 8, is_required: false },
  { name: '备注', field_type: 'text', sort_order: 9, is_required: false }
];

console.log('开始初始化扩展信息类目...');

for (const category of fieldCategories) {
  await db.insert(schema.contactFieldCategories).values({
    parent_user_id: null, // 全局类目，不属于任何用户
    name: category.name,
    field_type: category.field_type,
    options: null,
    sort_order: category.sort_order,
    is_required: category.is_required
  });
  console.log(`✓ 已添加类目: ${category.name}`);
}

console.log(`\n成功初始化 ${fieldCategories.length} 个扩展信息类目！`);

await connection.end();
