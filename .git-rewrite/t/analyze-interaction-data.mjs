import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db'
});

try {
  // 查看contact_interactions表结构
  const [columns] = await connection.execute(`SHOW COLUMNS FROM contact_interactions`);
  console.log('=== contact_interactions表结构 ===');
  console.log(JSON.stringify(columns, null, 2));
  
  // 查询互动记录统计
  const [stats] = await connection.execute(`
    SELECT 
      COUNT(*) as total_interactions,
      COUNT(DISTINCT contactId) as contacts_with_interactions,
      MIN(interactionDate) as earliest_date,
      MAX(interactionDate) as latest_date
    FROM contact_interactions
  `);
  console.log('\n=== 互动记录统计 ===');
  console.log(JSON.stringify(stats[0], null, 2));
  
  // 查询每个联系人的互动次数分布
  const [distribution] = await connection.execute(`
    SELECT 
      interaction_count,
      COUNT(*) as contact_count
    FROM (
      SELECT contactId, COUNT(*) as interaction_count
      FROM contact_interactions
      GROUP BY contactId
    ) as t
    GROUP BY interaction_count
    ORDER BY interaction_count
  `);
  console.log('\n=== 联络频次分布 ===');
  console.log(JSON.stringify(distribution.slice(0, 20), null, 2));
  
  // 查询标签统计
  const [tags] = await connection.execute(`
    SELECT 
      t.name,
      COUNT(DISTINCT ctr.contactId) as contact_count
    FROM contact_tags t
    LEFT JOIN contact_tag_relations ctr ON t.id = ctr.tagId
    GROUP BY t.id, t.name
    HAVING contact_count > 0
    ORDER BY contact_count DESC
    LIMIT 15
  `);
  console.log('\n=== 热门标签TOP15 ===');
  console.log(JSON.stringify(tags, null, 2));
  
  // 按月统计互动趋势
  const [monthlyTrend] = await connection.execute(`
    SELECT 
      DATE_FORMAT(interactionDate, '%Y-%m') as month,
      COUNT(*) as interaction_count,
      COUNT(DISTINCT contactId) as unique_contacts
    FROM contact_interactions
    WHERE interactionDate >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    GROUP BY month
    ORDER BY month
  `);
  console.log('\n=== 近12个月互动趋势 ===');
  console.log(JSON.stringify(monthlyTrend, null, 2));
  
} catch (error) {
  console.error('查询失败:', error.message);
} finally {
  await connection.end();
}
