import mysql from 'mysql2/promise';

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    console.log('开始执行数据库迁移...');
    
    // 检查字段是否已存在
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledger_records' AND COLUMN_NAME = 'pending_type'
    `, [process.env.DB_NAME]);
    
    if ((columns as any[]).length > 0) {
      console.log('✅ pending_type 字段已存在，无需迁移');
      return;
    }
    
    // 执行迁移 SQL
    await connection.query(`
      ALTER TABLE ledger_records
      ADD COLUMN pending_type ENUM('receivable', 'payable') DEFAULT NULL COMMENT '待结类型（receivable=代收，payable=代付，NULL=无）'
    `);
    
    console.log('✅ 添加 pending_type 字段成功');
    
    // 创建索引
    await connection.query(`
      CREATE INDEX idx_pending_type ON ledger_records(pending_type)
    `);
    
    console.log('✅ 创建索引成功');
    
    // 检查 ledgers 表的字段
    const [ledgerColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledgers' AND COLUMN_NAME IN ('enable_reimbursement', 'enable_pending')
    `, [process.env.DB_NAME]);
    
    if ((ledgerColumns as any[]).length < 2) {
      await connection.query(`
        ALTER TABLE ledgers 
        ADD COLUMN enable_reimbursement TINYINT DEFAULT 1 NOT NULL COMMENT '是否启用报销功能（1=启用，0=禁用）',
        ADD COLUMN enable_pending TINYINT DEFAULT 0 NOT NULL COMMENT '是否启用待结功能（1=启用，0=禁用）'
      `);
      console.log('✅ 添加 ledgers 功能开关字段成功');
    } else {
      console.log('✅ ledgers 功能开关字段已存在');
    }
    
    console.log('🎉 数据库迁移完成！');
    
  } catch (error: any) {
    if (error.code === 'ER_DUP_KEYNAME') {
      console.log('⚠️ 索引已存在，跳过');
    } else {
      console.error('❌ 迁移失败：', error.message);
      throw error;
    }
  } finally {
    await connection.end();
  }
}

runMigration().catch(console.error);
