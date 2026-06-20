const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: '/home/ubuntu/haoyouji-web/.env' });

async function checkTableStructure() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    
    console.log('查询 ledger_records 表结构:');
    console.log('='.repeat(80));
    
    const [rows] = await connection.query('DESCRIBE ledger_records');
    
    console.table(rows);
    
    await connection.end();
  } catch (error) {
    console.error('错误:', error.message);
    console.error(error);
  }
}

checkTableStructure();
