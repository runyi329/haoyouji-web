require('dotenv').config({ path: '.env' });
const mysql = require('mysql2/promise');
mysql.createConnection(process.env.DATABASE_URL).then(conn => {
  return conn.execute('SELECT tag_name, target_total FROM ledger_tag_config WHERE ledger_id = 37 LIMIT 5')
    .then(([rows]) => { console.log(JSON.stringify(rows)); return conn.end(); });
}).catch(e => console.error(e.message));
