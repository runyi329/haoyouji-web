import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const [tables] = await connection.execute("SHOW TABLES");
console.log('所有表:');
tables.forEach(t => console.log(Object.values(t)[0]));
await connection.end();
