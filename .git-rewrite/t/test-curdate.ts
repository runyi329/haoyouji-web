import mysql from 'mysql2/promise';

async function testCurdate() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  console.log('========== 测试 CURDATE() 函数 ==========\n');
  
  // 测试CURDATE()返回的日期
  const [result1] = await connection.query('SELECT CURDATE() as cur_date, NOW() as cur_time');
  console.log('数据库当前日期和时间：');
  console.table(result1);
  
  // 测试时区转换
  const [result2] = await connection.query(`
    SELECT 
      NOW() as utc_now,
      CONVERT_TZ(NOW(), '+00:00', '+08:00') as beijing_now,
      CURDATE() as curdate,
      DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00')) as beijing_date
  `);
  console.log('\n时区转换测试：');
  console.table(result2);
  
  // 测试今日充值统计（修复后的SQL）
  const [result3] = await connection.query(`
    SELECT 
      COUNT(*) as count,
      SUM(CAST(amount AS DECIMAL(20,8))) as total_amount
    FROM recharge_orders
    WHERE status = 'completed'
      AND DATE(CONVERT_TZ(completed_at, '+00:00', '+08:00')) = CURDATE()
  `);
  console.log('\n今日充值统计（修复后的SQL）：');
  console.table(result3);
  
  // 查看所有已完成订单的完成时间
  const [result4] = await connection.query(`
    SELECT 
      order_no,
      amount,
      completed_at,
      CONVERT_TZ(completed_at, '+00:00', '+08:00') as completed_at_beijing,
      DATE(CONVERT_TZ(completed_at, '+00:00', '+08:00')) as date_beijing,
      CURDATE() as today,
      CASE 
        WHEN DATE(CONVERT_TZ(completed_at, '+00:00', '+08:00')) = CURDATE() THEN 'YES'
        ELSE 'NO'
      END as is_today
    FROM recharge_orders
    WHERE status = 'completed'
    ORDER BY completed_at DESC
  `);
  console.log('\n所有已完成订单的时间分析：');
  console.table(result4);
  
  await connection.end();
  process.exit(0);
}

testCurdate().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
