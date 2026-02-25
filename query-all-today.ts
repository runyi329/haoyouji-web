import mysql from 'mysql2/promise';

async function queryAllToday() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  console.log('========== 查询所有今日完成的订单 ==========\n');
  
  // 查询所有今日完成的订单（使用北京时间）
  const [ordersBeijing] = await connection.query(`
    SELECT 
      order_no, 
      amount,
      network,
      status,
      completed_at,
      CONVERT_TZ(completed_at, '+00:00', '+08:00') as completed_at_beijing,
      DATE(CONVERT_TZ(completed_at, '+00:00', '+08:00')) as date_beijing
    FROM recharge_orders
    WHERE status = 'completed'
      AND DATE(CONVERT_TZ(completed_at, '+00:00', '+08:00')) = CURDATE()
    ORDER BY completed_at DESC
  `);
  
  console.log('使用北京时间统计今日完成的订单：');
  console.table(ordersBeijing);
  
  // 统计总金额
  const total = (ordersBeijing as any[]).reduce((sum, order) => {
    return sum + parseFloat(order.amount);
  }, 0);
  
  console.log(`\n总计：${(ordersBeijing as any[]).length} 笔，${total.toFixed(2)} USDT\n`);
  
  // 查询用户前端看到的数据（最近订单）
  const [recentOrders] = await connection.query(`
    SELECT 
      order_no, 
      amount,
      network,
      status,
      completed_at,
      CONVERT_TZ(completed_at, '+00:00', '+08:00') as completed_at_beijing
    FROM recharge_orders
    WHERE status = 'completed'
    ORDER BY completed_at DESC
    LIMIT 10
  `);
  
  console.log('最近10笔已完成订单（用户前端看到的）：');
  console.table(recentOrders);
  
  await connection.end();
  process.exit(0);
}

queryAllToday().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
