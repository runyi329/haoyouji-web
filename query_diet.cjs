const { createConnection } = require('mysql2/promise');
async function main() {
  const url = process.env.ORIGINAL_DATABASE_URL;
  if (!url) { console.log('no ORIGINAL_DATABASE_URL'); return; }
  const c = await createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
  const [r] = await c.execute("SELECT id, name, type, ownerId, createdBy FROM ledgers WHERE type IN ('diet','custom_ac') ORDER BY id DESC");
  console.log(JSON.stringify(r, null, 2));
  await c.end();
}
main().catch(e => console.error(e.message));
