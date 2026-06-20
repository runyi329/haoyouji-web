import { getLedgerDb } from './server/db';
import { ledgerRecords } from './drizzle/schema';
import { sql, isNotNull } from 'drizzle-orm';

async function testDeletedRecords() {
  const db = await getLedgerDb();
  if (!db) {
    console.error('Database connection failed');
    return;
  }

  // 查询所有有 deletedAt 的记录
  console.log('\n=== 查询所有已删除的记录 ===');
  const allDeleted = await db
    .select({
      id: ledgerRecords.id,
      ledgerId: ledgerRecords.ledgerId,
      deletedAt: ledgerRecords.deletedAt,
      deletedBy: ledgerRecords.deletedBy,
    })
    .from(ledgerRecords)
    .where(isNotNull(ledgerRecords.deletedAt))
    .limit(10);
  
  console.log(`找到 ${allDeleted.length} 条已删除记录：`);
  allDeleted.forEach(r => {
    console.log(`  ID: ${r.id}, 账本ID: ${r.ledgerId}, 删除时间: ${r.deletedAt}, 删除人: ${r.deletedBy}`);
  });

  // 查询30天内删除的记录（使用原来的查询）
  console.log('\n=== 查询30天内删除的记录（原查询） ===');
  const within30Days = await db
    .select({
      id: ledgerRecords.id,
      ledgerId: ledgerRecords.ledgerId,
      deletedAt: ledgerRecords.deletedAt,
    })
    .from(ledgerRecords)
    .where(
      sql`${ledgerRecords.deletedAt} IS NOT NULL AND ${ledgerRecords.deletedAt} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    )
    .limit(10);
  
  console.log(`找到 ${within30Days.length} 条30天内删除的记录`);

  // 查询60天内删除的记录
  console.log('\n=== 查询60天内删除的记录 ===');
  const within60Days = await db
    .select({
      id: ledgerRecords.id,
      ledgerId: ledgerRecords.ledgerId,
      deletedAt: ledgerRecords.deletedAt,
    })
    .from(ledgerRecords)
    .where(
      sql`${ledgerRecords.deletedAt} IS NOT NULL AND ${ledgerRecords.deletedAt} >= DATE_SUB(NOW(), INTERVAL 60 DAY)`
    )
    .limit(10);
  
  console.log(`找到 ${within60Days.length} 条60天内删除的记录`);

  process.exit(0);
}

testDeletedRecords().catch(console.error);
