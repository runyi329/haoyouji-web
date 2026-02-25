import mysql from 'mysql2/promise';

async function checkTableStructure() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  console.log('========== 检查 recharge_orders 表结构 ==========\n');
  
  const [columns] = await connection.query('SHOW COLUMNS FROM recharge_orders');
  
  console.log('表字段列表:');
  console.table(columns);
  
  console.log('\n========== 尝试添加 wallet_address 字段 ==========\n');
  
  try {
    await connection.query(`
      ALTER TABLE recharge_orders 
      ADD COLUMN wallet_address VARCHAR(255) NULL COMMENT '收款钱包地址' 
      AFTER network
    `);
    console.log('✅ 字段添加成功！');
  } catch (error: any) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️  字段已存在');
    } else {
      console.error('❌ 添加失败:', error.message);
      throw error;
    }
  }
  
  console.log('\n========== 更新订单地址 ==========\n');
  
  const [result] = await connection.query(`
    UPDATE recharge_orders 
    SET wallet_address = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d'
    WHERE network = 'APTOS' 
      AND order_no = 'CHG1771986246733318'
  `);
  
  console.log('更新结果:', result);
  
  console.log('\n========== 验证订单 ==========\n');
  
  const [orders] = await connection.query(`
    SELECT order_no, amount, network, wallet_address, status
    FROM recharge_orders
    WHERE network = 'APTOS'
  `);
  
  console.table(orders);
  
  await connection.end();
  console.log('\n✅ 完成！');
  process.exit(0);
}

checkTableStructure().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
