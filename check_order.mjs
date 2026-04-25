import { config } from 'dotenv';
config();
import mysql from 'mysql2/promise';

const url = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.log('No DB URL found'); process.exit(1); }

const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^/]+)\/(.+)/);
if (!match) { console.log('Cannot parse URL'); process.exit(1); }

const [, user, pass, hostPort, db] = match;
const [host, port] = hostPort.split(':');

const conn = await mysql.createConnection({
  host, port: parseInt(port || '3306'), user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});

const [rows] = await conn.execute(
  "SELECT id, order_no, interest_base, interest_rate_annual, interest_start_date, status, admin_note FROM finance_interest_orders WHERE order_no = 'F27507'"
);
console.log('F27507 订单数据:');
console.log(JSON.stringify(rows, null, 2));
await conn.end();
