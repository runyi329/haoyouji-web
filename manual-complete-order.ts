import mysql from 'mysql2/promise';

async function manualCompleteOrder() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  console.log('========== 手动完成订单 ==========\n');
  
  const orderNo = 'CHG1771986246733318';
  const txnHash = '0xb17a36d8962af8f5e66188c70';
  const actualAmount = 15.8837;
  
  try {
    // 1. 查询订单信息
    console.log('1. 查询订单信息...');
    const [orders] = await connection.query<any[]>(`
      SELECT * FROM recharge_orders WHERE order_no = ?
    `, [orderNo]);
    
    if (orders.length === 0) {
      console.error('❌ 订单不存在');
      return;
    }
    
    const order = orders[0];
    console.log(`   订单号: ${order.order_no}`);
    console.log(`   用户ID: ${order.user_id}`);
    console.log(`   订单金额: ${order.amount} USDT`);
    console.log(`   实际到账: ${actualAmount} USDT`);
    console.log(`   当前状态: ${order.status}`);
    
    // 2. 更新订单状态
    console.log('\n2. 更新订单状态...');
    await connection.query(`
      UPDATE recharge_orders 
      SET status = 'completed',
          txn_hash = ?,
          completed_at = NOW()
      WHERE order_no = ?
    `, [txnHash, orderNo]);
    console.log('   ✅ 订单状态已更新为 completed');
    
    // 3. 给用户账户加钱
    console.log('\n3. 更新用户余额...');
    
    // 查询当前余额
    const [users] = await connection.query<any[]>(`
      SELECT balance FROM users WHERE id = ?
    `, [order.user_id]);
    
    if (users.length === 0) {
      console.error('❌ 用户不存在');
      return;
    }
    
    const currentBalance = parseFloat(users[0].balance || '0');
    const newBalance = currentBalance + actualAmount;
    
    console.log(`   当前余额: ${currentBalance} USDT`);
    console.log(`   充值金额: ${actualAmount} USDT`);
    console.log(`   新余额: ${newBalance} USDT`);
    
    // 更新余额
    await connection.query(`
      UPDATE users 
      SET balance = ?
      WHERE id = ?
    `, [newBalance, order.user_id]);
    console.log('   ✅ 用户余额已更新');
    
    // 4. 验证结果
    console.log('\n4. 验证结果...');
    const [updatedOrders] = await connection.query<any[]>(`
      SELECT order_no, amount, status, txn_hash, completed_at
      FROM recharge_orders
      WHERE order_no = ?
    `, [orderNo]);
    
    const [updatedUsers] = await connection.query<any[]>(`
      SELECT id, username, balance
      FROM users
      WHERE id = ?
    `, [order.user_id]);
    
    console.log('\n订单信息:');
    console.table(updatedOrders);
    
    console.log('\n用户信息:');
    console.table(updatedUsers);
    
    console.log('\n✅ 订单手动完成成功！');
    
  } catch (error) {
    console.error('❌ 操作失败:', error);
    throw error;
  } finally {
    await connection.end();
  }
  
  process.exit(0);
}

manualCompleteOrder().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
