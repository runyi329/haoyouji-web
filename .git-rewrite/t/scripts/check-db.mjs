import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const c = await mysql.createConnection(dbUrl);

const [cnt] = await c.execute('SELECT COUNT(*) as cnt FROM merchant_products');
console.log('merchant_products total:', cnt[0].cnt);

const [sample] = await c.execute('SELECT id,name,subtitle,basePrice,sourceType,status,ownerMerchantId FROM merchant_products LIMIT 10');
console.log('sample data:');
sample.forEach(r => console.log(' -', JSON.stringify(r)));

const [pp] = await c.execute('SELECT COUNT(*) as cnt FROM platform_products');
console.log('platform_products total:', pp[0].cnt);

const [tables] = await c.execute("SHOW TABLES LIKE 'merchant%'");
console.log('merchant-related tables:', tables.map(r => Object.values(r)[0]));

await c.end();
