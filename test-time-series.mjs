import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db'
});

try {
  // 测试时间序列查询
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  console.log('=== 测试时间序列查询 ===');
  console.log('开始日期:', startDate.toISOString());
  
  const [series] = await connection.execute(`
    SELECT 
      DATE(interactionDate) as date,
      COUNT(*) as interactions,
      COUNT(DISTINCT contactId) as contacts,
      DAYOFWEEK(interactionDate) as weekday
    FROM contact_interactions
    WHERE interactionDate >= ?
    GROUP BY DATE(interactionDate)
    ORDER BY date
  `, [startDate]);
  
  console.log('\n查询结果数量:', series.length);
  console.log('前5条数据:', JSON.stringify(series.slice(0, 5), null, 2));
  
  // 测试周模式
  const [weekPattern] = await connection.execute(`
    SELECT 
      DAYOFWEEK(interactionDate) as weekday,
      COUNT(*) as count,
      COUNT(DISTINCT contactId) as unique_contacts
    FROM contact_interactions
    WHERE interactionDate >= ?
    GROUP BY DAYOFWEEK(interactionDate)
    ORDER BY weekday
  `, [startDate]);
  
  console.log('\n=== 周模式数据 ===');
  console.log(JSON.stringify(weekPattern, null, 2));
  
} catch (error) {
  console.error('查询失败:', error.message);
} finally {
  await connection.end();
}
