import mysql from 'mysql2/promise';

const dbUrl = 'mysql://root:Miao%4020190603@124.223.54.69:3306/haoyouji';
const url = new URL(dbUrl);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
});

const [rows] = await conn.execute(
  "SELECT id, username, name FROM users WHERE name LIKE '%STEVEN%' OR name LIKE '%steven%' OR username LIKE '%steven%' OR username LIKE '%STEVEN%' OR username LIKE '%huang%' OR name LIKE '%Huang%' LIMIT 10"
);
console.log('Search results:', rows);

// Also show all users
const [all] = await conn.execute("SELECT id, username, name FROM users ORDER BY id LIMIT 50");
console.log('\nAll users:');
all.forEach(r => console.log(r.id, r.username, r.name));

await conn.end();
