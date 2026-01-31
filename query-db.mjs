import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { contactFieldValues } from './drizzle/schema.ts';
import { eq, inArray } from 'drizzle-orm';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

const results = await db.select().from(contactFieldValues).where(inArray(contactFieldValues.categoryId, [0, 100])).limit(20);

console.log('找到', results.length, '条记录：');
results.forEach(r => {
  console.log(`ID: ${r.id}, contactId: ${r.contactId}, categoryId: ${r.categoryId}, value: ${r.value.substring(0, 50)}`);
});

await connection.end();
