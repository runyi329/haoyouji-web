/**
 * 生产环境数据库迁移脚本
 * 通过 API 端点触发：/api/admin/migrate-pending-type
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export async function migratePendingType(db: any) {
  console.log('[Migration] Starting pending_type migration...');
  
  try {
    // 读取迁移 SQL
    const migrationPath = join(process.cwd(), 'migrations', 'add-ledger-features.sql');
    const sql = readFileSync(migrationPath, 'utf-8');
    
    // 分割 SQL 语句
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    console.log(`[Migration] Found ${statements.length} statements`);
    
    // 执行每条语句
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;
      
      console.log(`[Migration] Executing statement ${i + 1}/${statements.length}`);
      
      try {
        await db.execute(statement);
        console.log(`[Migration] ✓ Statement ${i + 1} executed successfully`);
      } catch (error: any) {
        // 忽略"字段已存在"错误
        if (error.message?.includes('Duplicate column name') || 
            error.message?.includes('Duplicate key name')) {
          console.log(`[Migration] ⚠ Statement ${i + 1} skipped (already exists)`);
        } else {
          console.error(`[Migration] ✗ Statement ${i + 1} failed:`, error.message);
          throw error;
        }
      }
    }
    
    console.log('[Migration] ✅ Migration completed successfully');
    return { success: true, message: 'Migration completed' };
    
  } catch (error: any) {
    console.error('[Migration] ❌ Migration failed:', error);
    return { success: false, error: error.message };
  }
}
