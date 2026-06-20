import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// 查看ledgers表结构
const [cols] = await db.execute('DESCRIBE ledgers');
console.log('=== ledgers表字段 ===');
cols.forEach(c => console.log(`  ${c.Field}: ${c.Type} ${c.Null === 'YES' ? '(nullable)' : ''} ${c.Default ? `default=${c.Default}` : ''}`));

// 查看所有custom_aa类型的账本
const [ledgers] = await db.execute("SELECT id, name, type, description, icon, isVip, createdAt FROM ledgers WHERE type = 'custom_aa' ORDER BY createdAt DESC LIMIT 10");
console.log('\n=== custom_aa 类型账本 ===');
ledgers.forEach(l => console.log(JSON.stringify(l)));

// 查看所有账本类型
const [types] = await db.execute("SELECT DISTINCT type, COUNT(*) as cnt FROM ledgers GROUP BY type");
console.log('\n=== 账本类型统计 ===');
types.forEach(t => console.log(`  ${t.type}: ${t.cnt}个`));

// 查看CustomAA后台管理表（如果有）
try {
  const [customAATables] = await db.execute("SHOW TABLES LIKE '%custom%'");
  console.log('\n=== custom相关表 ===');
  customAATables.forEach(t => console.log(' ', Object.values(t)[0]));
} catch(e) {}

// 查看custom_aa_configs表（如果存在）
try {
  const [configs] = await db.execute("SELECT * FROM custom_aa_configs LIMIT 5");
  console.log('\n=== custom_aa_configs ===');
  configs.forEach(c => console.log(JSON.stringify(c)));
} catch(e) {
  console.log('\ncustom_aa_configs表不存在');
}

await db.end();
