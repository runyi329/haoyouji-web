import { getDbConnection } from './server/db';

async function main() {
  const conn = await getDbConnection();
  if (!conn) { console.log('no db connection'); return; }
  
  const [rows1] = await (conn as any).execute("SHOW COLUMNS FROM users LIKE 'real_name'") as any[];
  console.log('real_name in users:', JSON.stringify(rows1));
  
  const [rows2] = await (conn as any).execute("SHOW COLUMNS FROM user_profiles LIKE 'real_name'") as any[];
  console.log('real_name in user_profiles:', JSON.stringify(rows2));
  
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
