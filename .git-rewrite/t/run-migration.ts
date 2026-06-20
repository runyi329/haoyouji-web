import { readFileSync } from 'fs';
import { getDb } from "./server/db";

async function runMigration() {
  console.log('========== 执行数据库迁移 ==========\n');
  
  const sql = readFileSync('./migrations/add-ledger-features.sql', 'utf-8');
  
  console.log('SQL脚本:');
  console.log(sql);
  console.log('\n正在执行...\n');
  
  const db = await getDb();
  
  // 分割SQL语句并执行
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    console.log(`执行: ${statement.substring(0, 100)}...`);
    try {
      await db.execute(statement);
      console.log('✅ 成功\n');
    } catch (error) {
      console.error('❌ 失败:', error);
      throw error;
    }
  }
  
  console.log('========== 迁移完成 ==========');
  process.exit(0);
}

runMigration().catch((error) => {
  console.error('迁移失败:', error);
  process.exit(1);
});
