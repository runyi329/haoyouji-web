import mysql from 'mysql2/promise';

async function queryTodayOrders() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  console.log('========== 查询今日完成的订单 ==========\n');
  
  // 查询1：使用UTC日期
  const today = new Date().toISOString().slice(0, 10);
  console.log(`今天的日期（UTC）: ${today}\n`);
  
  const [ordersUTC] = await connection.query(`
    SELECT 
      order_no, 
      amount, 
      amount,
      network,
      status,
      completed_at,
      DATE(completed_at) as completed_date,
      CONVERT_TZ(completed_at, '+00:00', '+08:00') as completed_at_beijing
    FROM recharge_orders
    WHERE status = 'completed'
      AND DATE(completed_at) = ?
    ORDER BY completed_at DESC
  `, [today]);
  
  console.log('方法1：使用 DATE(completed_at) = today（UTC）');
  console.table(ordersUTC);
  
  // 查询2：查询所有今天完成的订单（不限日期）
  const [allCompleted] = await connection.query(`
    SELECT 
      order_no, 
      amount,
      amount,
      network,
      status,
      completed_at,
      DATE(completed_at) as completed_date,
      CONVERT_TZ(completed_at, '+00:00', '+08:00') as completed_at_beijing
    FROM recharge_orders
    WHERE status = 'completed'
    ORDER BY completed_at DESC
    LIMIT 10
  `);
  
  console.log('\n方法2：最近10笔已完成订单');
  console.table(allCompleted);
  
  // 查询3：统计今日充值（使用北京时间）
  const [statsBeijing] = await connection.query(`
    SELECT 
      COUNT(*) as count,
      SUM(CAST(amount AS DECIMAL(20,8))) as total_amount
    FROM recharge_orders
    WHERE status = 'completed'
      AND DATE(CONVERT_TZ(completed_at, '+00:00', '+08:00')) = CURDATE()
  `);
  
  console.log('\n方法3：使用北京时间统计今日充值');
  console.table(statsBeijing);
  
  await connection.end();
  process.exit(0);
}

queryTodayOrders().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
