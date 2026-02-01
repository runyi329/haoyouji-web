const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function queryUser() {
  try {
    const result = await pool.query(`
      SELECT id, username, role 
      FROM users 
      WHERE username IN ('jiang', 'yunting', 'hyy329')
      ORDER BY username
    `);
    console.log('用户信息:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    // 查询每个用户的联系人数量
    for (const user of result.rows) {
      const contactCount = await pool.query(`
        SELECT COUNT(*) as count FROM contacts WHERE "userId" = $1
      `, [user.id]);
      console.log(`\n${user.username} (ID: ${user.id}) 的联系人数: ${contactCount.rows[0].count}`);
    }
    
    await pool.end();
  } catch (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }
}

queryUser();
