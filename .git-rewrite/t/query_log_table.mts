import * as mysql from 'mysql2/promise';

const url = 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';
const conn = await mysql.createConnection(url);

// 查询日志表数据
const [rows] = await conn.execute('SELECT * FROM eth_position_change_logs LIMIT 5');
console.log('LOG_ROWS:', JSON.stringify(rows, null, 2));

// 尝试手动插入一条测试记录
try {
  await conn.execute(
    "INSERT INTO eth_position_change_logs (ledger_id, price, change_type, old_value, new_value, note) VALUES (?, ?, ?, ?, ?, ?)",
    [1, 2000, 'actual', 0, 1.5, 'test-from-script']
  );
  console.log('INSERT_OK');
  
  // 查询刚插入的
  const [r2] = await conn.execute('SELECT * FROM eth_position_change_logs WHERE note = ?', ['test-from-script']);
  console.log('INSERTED_ROW:', JSON.stringify(r2));
  
  // 清理
  await conn.execute('DELETE FROM eth_position_change_logs WHERE note = ?', ['test-from-script']);
  console.log('CLEANUP_OK');
} catch(e: any) {
  console.log('INSERT_ERROR:', e.message);
}

await conn.end();
