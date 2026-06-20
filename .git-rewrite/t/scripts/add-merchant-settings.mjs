import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('Adding merchant settings fields to merchants table...');

const alterStatements = [
  `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS share_title VARCHAR(50) NULL`,
  `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS share_logo TEXT NULL`,
  `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS share_cover_image TEXT NULL`,
  `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS share_description VARCHAR(100) NULL`,
  `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS contact_wechat VARCHAR(50) NULL`,
  `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20) NULL`,
  `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS about_us TEXT NULL`,
  `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS official_website VARCHAR(200) NULL`,
];

for (const sql of alterStatements) {
  try {
    await conn.execute(sql);
    console.log('✓', sql.substring(0, 60) + '...');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠ Column already exists, skipping:', sql.substring(40, 80));
    } else {
      console.error('✗ Error:', e.message);
    }
  }
}

// Verify
const [rows] = await conn.execute(`DESCRIBE merchants`);
console.log('\nMerchants table columns:');
rows.forEach(r => console.log(' -', r.Field, ':', r.Type));

await conn.end();
console.log('\nDone!');
