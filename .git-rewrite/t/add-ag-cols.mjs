import mysql from 'mysql2/promise';

async function addCols() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL || process.env.ORIGINAL_DATABASE_URL);
  
  const [cols] = await conn.query('DESCRIBE ag_prompt_images');
  const colNames = cols.map(c => c.Field);
  console.log('Current columns:', colNames);
  
  if (!colNames.includes('tags')) {
    await conn.query('ALTER TABLE ag_prompt_images ADD COLUMN tags TEXT NULL AFTER title');
    console.log('Added tags column');
  } else {
    console.log('tags already exists');
  }
  
  if (!colNames.includes('author')) {
    await conn.query('ALTER TABLE ag_prompt_images ADD COLUMN author VARCHAR(100) NULL AFTER tags');
    console.log('Added author column');
  } else {
    console.log('author already exists');
  }
  
  await conn.end();
  console.log('Done');
}

addCols().catch(e => console.error('Error:', e.message));
