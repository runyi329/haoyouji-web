import { drizzle } from "drizzle-orm/mysql2";

// 连接到Manus临时数据库
const db = drizzle(process.env.DATABASE_URL);

console.log("正在导出账本相关表的SQL...\n");

// 导出表结构
const tables = ['ledgers', 'ledger_members', 'ledger_entries', 'ledger_categories'];

for (const table of tables) {
  try {
    const [result] = await db.execute(`SHOW CREATE TABLE ${table}`);
    console.log(`-- ========== ${table} 表结构 ==========`);
    console.log(result[0]['Create Table']);
    console.log('\n');
  } catch (error) {
    console.error(`导出 ${table} 失败:`, error.message);
  }
}

// 导出预设分类数据
try {
  const [categories] = await db.execute(
    `SELECT * FROM ledger_categories WHERE ledgerId = 0 ORDER BY id`
  );
  
  console.log(`-- ========== 预设分类数据 (${categories.length}条) ==========`);
  
  if (categories.length > 0) {
    const columns = Object.keys(categories[0]).join(', ');
    console.log(`INSERT INTO ledger_categories (${columns}) VALUES`);
    
    categories.forEach((cat, index) => {
      const values = Object.values(cat).map(v => {
        if (v === null) return 'NULL';
        if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
        if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
        return v;
      }).join(', ');
      
      const comma = index < categories.length - 1 ? ',' : ';';
      console.log(`(${values})${comma}`);
    });
  }
} catch (error) {
  console.error('导出预设分类失败:', error.message);
}

console.log('\n导出完成！');
process.exit(0);
