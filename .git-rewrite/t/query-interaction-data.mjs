import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db'
});

try {
  // 查询互动记录表结构和数据
  const [interactions] = await connection.execute(`
    SELECT 
      COUNT(*) as total_interactions,
      COUNT(DISTINCT contactId) as contacts_with_interactions,
      AVG(interactionCount) as avg_per_contact
    FROM (
      SELECT contactId, COUNT(*) as interactionCount
      FROM interactions
      GROUP BY contactId
    ) as t
  `);
  
  console.log('=== 互动统计 ===');
  console.log(JSON.stringify(interactions[0], null, 2));
  
  // 查询联络频次分布
  const [distribution] = await connection.execute(`
    SELECT 
      CASE 
        WHEN cnt = 0 THEN '零联络'
        WHEN cnt BETWEEN 1 AND 5 THEN '低频(1-5次)'
        WHEN cnt BETWEEN 6 AND 20 THEN '中频(6-20次)'
        WHEN cnt BETWEEN 21 AND 100 THEN '高频(21-100次)'
        ELSE '核心圈(>100次)'
      END as frequency_group,
      COUNT(*) as contact_count,
      SUM(cnt) as total_interactions
    FROM (
      SELECT c.id, COALESCE(COUNT(i.id), 0) as cnt
      FROM contacts c
      LEFT JOIN interactions i ON c.id = i.contactId
      GROUP BY c.id
    ) as t
    GROUP BY frequency_group
    ORDER BY 
      CASE frequency_group
        WHEN '零联络' THEN 1
        WHEN '低频(1-5次)' THEN 2
        WHEN '中频(6-20次)' THEN 3
        WHEN '高频(21-100次)' THEN 4
        ELSE 5
      END
  `);
  
  console.log('\n=== 联络频次分布 ===');
  console.log(JSON.stringify(distribution, null, 2));
  
  // 查询标签分布
  const [tags] = await connection.execute(`
    SELECT t.name, COUNT(DISTINCT ct.contactId) as contact_count
    FROM tags t
    LEFT JOIN contact_tags ct ON t.id = ct.tagId
    GROUP BY t.id, t.name
    ORDER BY contact_count DESC
    LIMIT 10
  `);
  
  console.log('\n=== 热门标签TOP10 ===');
  console.log(JSON.stringify(tags, null, 2));
  
} catch (error) {
  console.error('查询失败:', error);
} finally {
  await connection.end();
}
