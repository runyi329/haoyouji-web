import * as mysql from 'mysql2/promise';

const url = 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';
const conn = await mysql.createConnection(url);

const [count] = await conn.execute('SELECT COUNT(*) as total FROM eth_position_change_logs');
console.log('总记录数:', (count as any[])[0].total);

const [rows] = await conn.execute('SELECT * FROM eth_position_change_logs ORDER BY created_at DESC LIMIT 10');
console.log('最新10条记录:');
console.log(JSON.stringify(rows, null, 2));

await conn.end();
