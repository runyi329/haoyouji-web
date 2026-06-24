const mysql = require('mysql2/promise');
async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.log('No DATABASE_URL'); process.exit(1); }
  const conn = await mysql.createConnection(dbUrl);
  
  const [rows] = await conn.execute('SELECT id, channel_id, title, description, is_active FROM wecom_materials');
  console.log('=== wecom_materials ===');
  console.log(JSON.stringify(rows, null, 2));
  
  const [chs] = await conn.execute("SELECT id, name, channel_type, kf_id FROM wecom_channels WHERE channel_type='kf'");
  console.log('=== kf channels ===');
  console.log(JSON.stringify(chs, null, 2));
  
  await conn.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
