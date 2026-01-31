import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { contactFieldValues } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

const contactId = 1590105; // 胡永许

const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL
});
const db = drizzle(connection);

// 查询要删除的记录
const records = await db.select().from(contactFieldValues).where(eq(contactFieldValues.contactId, contactId));
console.log(`找到 ${records.length} 条扩展信息记录`);

// 删除所有扩展信息
const result = await db.delete(contactFieldValues).where(eq(contactFieldValues.contactId, contactId));
console.log(`已删除联系人 ${contactId} 的所有扩展信息`);

await connection.end();
console.log('完成！');
