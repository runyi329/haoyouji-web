import { getDbConnection } from './server/db';

async function main() {
  const conn = await getDbConnection();
  if (!conn) { console.log('no db connection'); return; }
  
  try {
    // 测试原始SQL
    const [rows] = await (conn as any).execute(`
      SELECT r.*, u.username, u.name as userName, u.real_name as realName, u.phone
      FROM recharge_orders r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT ?
    `, [200]) as any[];
    console.log('SQL success, rows count:', (rows as any[]).length);
    if ((rows as any[]).length > 0) {
      console.log('First row keys:', Object.keys((rows as any[])[0]));
    }
  } catch(e: any) {
    console.log('SQL error:', e.message);
    // 尝试不带参数
    try {
      const [rows2] = await (conn as any).execute(`
        SELECT r.*, u.username, u.name as userName, u.real_name as realName, u.phone
        FROM recharge_orders r
        LEFT JOIN users u ON r.user_id = u.id
        ORDER BY r.created_at DESC
        LIMIT 200
      `) as any[];
      console.log('SQL without param success, rows count:', (rows2 as any[]).length);
    } catch(e2: any) {
      console.log('SQL without param error:', e2.message);
    }
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
