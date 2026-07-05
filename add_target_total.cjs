require('dotenv').config({ path: '.env' });
const mysql = require('mysql2/promise');
async function main() {
  const url = process.env.DATABASE_URL || process.env.DB_URL;
  if (!url) { console.error('No DB URL'); return; }
  const conn = await mysql.createConnection(url);
  try {
    await conn.execute('ALTER TABLE ledger_tag_config ADD COLUMN target_total VARCHAR(64) NULL');
    console.log('OK: target_total column added');
  } catch(e) {
    if (e.message.includes('Duplicate column')) {
      console.log('Column already exists');
    } else {
      console.error('Error:', e.message);
    }
  }
  await conn.end();
}
main().catch(e => console.error(e.message));
