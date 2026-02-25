import { getDb } from "./server/db";

async function verifyPendingType() {
  console.log('========== 验证 pending_type 字段 ==========\n');
  
  const db = await getDb();
  if (!db) {
    throw new Error('Database connection failed');
  }
  console.log('✅ 数据库连接成功\n');
  
  // 查询表结构
  console.log('1. 检查 ledger_records 表结构...');
  const columns = await db.execute("SHOW COLUMNS FROM ledger_records LIKE 'pending_type'");
  console.log('pending_type 字段信息:', columns);
  
  // 查询索引
  console.log('\n2. 检查索引...');
  const indexes = await db.execute("SHOW INDEX FROM ledger_records WHERE Key_name = 'idx_pending_type'");
  console.log('idx_pending_type 索引信息:', indexes);
  
  // 测试插入一条带 pending_type 的记录
  console.log('\n3. 测试查询带 pending_type 的记录...');
  const records = await db.execute("SELECT id, pending_type FROM ledger_records WHERE pending_type IS NOT NULL LIMIT 5");
  console.log('找到的记录:', records);
  
  console.log('\n========== 验证完成 ==========');
  process.exit(0);
}

verifyPendingType().catch((error) => {
  console.error('验证失败:', error);
  process.exit(1);
});
