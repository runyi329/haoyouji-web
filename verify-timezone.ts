import mysql from 'mysql2/promise';

async function verifyTimezone() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  console.log('========== 验证时区转换 ==========\n');
  
  // 获取数据库当前时间
  const [result1] = await connection.query(`
    SELECT 
      NOW() as db_utc_time,
      CONVERT_TZ(NOW(), '+00:00', '+08:00') as db_beijing_time,
      DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00')) as db_beijing_date
  `);
  
  console.log('数据库时间：');
  console.table(result1);
  
  // 本地时间
  const now = new Date();
  console.log('\nNode.js 本地时间：');
  console.log(`  UTC: ${now.toISOString()}`);
  console.log(`  北京时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  
  // 测试今日充值统计SQL
  const [result2] = await connection.query(`
    SELECT 
      order_no,
      amount,
      completed_at as utc_time,
      CONVERT_TZ(completed_at, '+00:00', '+08:00') as beijing_time,
      DATE(CONVERT_TZ(completed_at, '+00:00', '+08:00')) as beijing_date,
      DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00')) as today_beijing,
      CASE 
        WHEN DATE(CONVERT_TZ(completed_at, '+00:00', '+08:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00')) THEN 'YES'
        ELSE 'NO'
      END as is_today
    FROM recharge_orders
    WHERE status = 'completed'
    ORDER BY completed_at DESC
  `);
  
  console.log('\n所有已完成订单的时间分析：');
  console.table(result2);
  
  // 统计今日充值
  const [result3] = await connection.query(`
    SELECT 
      COUNT(*) as count,
      SUM(CAST(amount AS DECIMAL(20,8))) as total_amount
    FROM recharge_orders
    WHERE status = 'completed'
      AND DATE(CONVERT_TZ(completed_at, '+00:00', '+08:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
  `);
  
  console.log('\n今日充值统计（使用北京时间）：');
  console.table(result3);
  
  await connection.end();
  process.exit(0);
}

verifyTimezone().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
