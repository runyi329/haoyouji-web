const { createConnection } = require('mysql2/promise');
async function main() {
  const url = process.env.DATABASE_URL;
  const c = await createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
  // 查看users表结构
  const [cols] = await c.execute("DESCRIBE users");
  console.log('columns:', cols.map(r => r.Field).join(', '));
  // 查找gimg用户
  const [r] = await c.execute("SELECT id, name, role FROM users WHERE name LIKE '%gimg%' OR name LIKE '%GIMG%' LIMIT 10");
  const [r2] = await c.execute("SELECT id, name, role FROM users ORDER BY id DESC LIMIT 20");
  console.log('recent users:', JSON.stringify(r2));
  console.log('gimg users:', JSON.stringify(r));
  await c.end();
}
main().catch(e => console.error(e.message));
