import mysql from 'mysql2/promise';

async function checkLedgerStatus() {
  const connection = await mysql.createConnection({
    host: '124.223.54.69',
    port: 3306,
    user: 'root',
    password: 'Miao@20190603',
    database: 'crm_db',
  });

  try {
    console.log('连接到生产数据库...\n');
    
    // 查询所有账本的功能开关状态
    const [ledgers] = await connection.query(`
      SELECT id, name, enable_reimbursement, enable_pending
      FROM ledgers
      ORDER BY id DESC
      LIMIT 10
    `);
    
    console.log('📚 最近的账本列表：');
    console.table(ledgers);
    
    // 查询最近添加的账目记录
    const [records] = await connection.query(`
      SELECT id, ledger_id, amount, category, pending_type, created_at
      FROM ledger_records
      ORDER BY id DESC
      LIMIT 10
    `);
    
    console.log('\n📝 最近的账目记录：');
    console.table(records);
    
  } catch (error: any) {
    console.error('❌ 查询失败：', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

checkLedgerStatus().catch(console.error);
