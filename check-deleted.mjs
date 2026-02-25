import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.TIDB_HOST,
  port: parseInt(process.env.TIDB_PORT || '4000'),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  ssl: process.env.TIDB_ENABLE_SSL === 'true' ? {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  } : undefined
});

console.log('✓ 数据库连接成功\n');

// 查询所有有 deleted_at 的记录
console.log('=== 查询所有已删除的记录 ===');
const [allDeleted] = await connection.execute(`
  SELECT id, ledger_id, type, amount, deleted_at, deleted_by, created_by, record_date
  FROM ledger_records
  WHERE deleted_at IS NOT NULL
  ORDER BY deleted_at DESC
  LIMIT 20
`);

console.log(`找到 ${allDeleted.length} 条已删除记录：\n`);
allDeleted.forEach(r => {
  console.log(`ID: ${r.id}, 账本ID: ${r.ledger_id}, 金额: ${r.amount}, 删除时间: ${r.deleted_at}, 删除人: ${r.deleted_by}, 创建人: ${r.created_by}`);
});

// 查询最近3天删除的记录
console.log('\n=== 查询最近3天删除的记录 ===');
const [recent] = await connection.execute(`
  SELECT id, ledger_id, type, amount, deleted_at, deleted_by, created_by
  FROM ledger_records
  WHERE deleted_at IS NOT NULL 
    AND deleted_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
  ORDER BY deleted_at DESC
`);

console.log(`找到 ${recent.length} 条最近3天删除的记录\n`);
recent.forEach(r => {
  console.log(`ID: ${r.id}, 账本ID: ${r.ledger_id}, 金额: ${r.amount}, 删除时间: ${r.deleted_at}`);
});

// 查询所有账本及其删除记录数
console.log('\n=== 各账本的删除记录统计 ===');
const [stats] = await connection.execute(`
  SELECT 
    l.id as ledger_id,
    l.name as ledger_name,
    COUNT(lr.id) as deleted_count
  FROM ledgers l
  LEFT JOIN ledger_records lr ON l.id = lr.ledger_id AND lr.deleted_at IS NOT NULL
  GROUP BY l.id, l.name
  HAVING deleted_count > 0
  ORDER BY deleted_count DESC
`);

stats.forEach(s => {
  console.log(`账本 "${s.ledger_name}" (ID: ${s.ledger_id}): ${s.deleted_count} 条删除记录`);
});

await connection.end();
console.log('\n✓ 查询完成');
