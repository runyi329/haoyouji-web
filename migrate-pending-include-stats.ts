import mysql from 'mysql2/promise';

async function runMigration() {
  const connection = await mysql.createConnection({
    host: '124.223.54.69',
    port: 3306,
    user: 'root',
    password: 'Miao@20190603',
    database: 'crm_db',
  });

  try {
    console.log('连接到生产数据库...');
    
    // 1. 检查 pending_type 字段是否存在
    const [ptCols] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'crm_db' AND TABLE_NAME = 'ledger_records' AND COLUMN_NAME = 'pending_type'
    `);
    if ((ptCols as any[]).length === 0) {
      await connection.query(`
        ALTER TABLE ledger_records
        ADD COLUMN pending_type ENUM('receivable', 'payable') DEFAULT NULL COMMENT '待结类型（receivable=代收，payable=代付，NULL=无）'
      `);
      console.log('✅ 添加 pending_type 字段成功');
    } else {
      console.log('✅ pending_type 字段已存在');
    }
    
    // 2. 检查 pending_include_stats 字段是否存在
    const [pisCols] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'crm_db' AND TABLE_NAME = 'ledger_records' AND COLUMN_NAME = 'pending_include_stats'
    `);
    if ((pisCols as any[]).length === 0) {
      await connection.query(`
        ALTER TABLE ledger_records
        ADD COLUMN pending_include_stats TINYINT DEFAULT 1 COMMENT '待结账目是否计入统计（0=仅显示不计入，1=显示并计入）'
      `);
      console.log('✅ 添加 pending_include_stats 字段成功');
    } else {
      console.log('✅ pending_include_stats 字段已存在');
    }
    
    // 3. 检查 enable_pending 字段是否存在
    const [epCols] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'crm_db' AND TABLE_NAME = 'ledgers' AND COLUMN_NAME = 'enable_pending'
    `);
    if ((epCols as any[]).length === 0) {
      await connection.query(`
        ALTER TABLE ledgers
        ADD COLUMN enable_pending TINYINT DEFAULT 0 NOT NULL COMMENT '是否启用待结功能（1=启用，0=禁用）'
      `);
      console.log('✅ 添加 enable_pending 字段成功');
    } else {
      console.log('✅ enable_pending 字段已存在');
    }
    
    // 4. 创建索引
    try {
      await connection.query(`CREATE INDEX idx_pending_type ON ledger_records(pending_type)`);
      console.log('✅ 创建 idx_pending_type 索引成功');
    } catch (e: any) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('✅ idx_pending_type 索引已存在');
      } else {
        throw e;
      }
    }
    
    // 5. 验证字段
    const [verifyRecords] = await connection.query(`
      DESCRIBE ledger_records pending_type
    `);
    console.log('\n📋 pending_type 字段：', verifyRecords);
    
    const [verifyInclude] = await connection.query(`
      DESCRIBE ledger_records pending_include_stats
    `);
    console.log('📋 pending_include_stats 字段：', verifyInclude);
    
    const [verifyLedger] = await connection.query(`
      DESCRIBE ledgers enable_pending
    `);
    console.log('📋 enable_pending 字段：', verifyLedger);
    
    console.log('\n🎉 数据库迁移完成！');
    
  } catch (error: any) {
    console.error('❌ 迁移失败：', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

runMigration().catch(console.error);
