const { createConnection } = require('mysql2/promise');
async function main() {
  const url = process.env.DATABASE_URL;
  const c = await createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
  // 查找gimg用户
  const [r] = await c.execute("SELECT id, username, name, role FROM users WHERE username LIKE '%gimg%' OR name LIKE '%gimg%' LIMIT 10");
  console.log('gimg users:', JSON.stringify(r, null, 2));
  // 查看最近用户
  const [r2] = await c.execute("SELECT id, username, name, role FROM users ORDER BY id DESC LIMIT 10");
  console.log('recent users:', JSON.stringify(r2, null, 2));
  await c.end();
}
main().catch(e => console.error(e.message));
