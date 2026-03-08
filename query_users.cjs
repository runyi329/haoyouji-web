const { createConnection } = require('mysql2/promise');
async function main() {
  const url = process.env.DATABASE_URL;
  const c = await createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
  const [r] = await c.execute("SELECT id, name, role FROM users LIMIT 50");
  console.log(JSON.stringify(r, null, 2));
  await c.end();
}
main().catch(e => console.error(e.message));
