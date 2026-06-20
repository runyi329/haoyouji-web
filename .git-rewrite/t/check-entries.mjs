import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
});

// 1. 列出所有表
const [tables] = await conn.query('SHOW TABLES');
console.log('=== 所有表 ===');
tables.forEach(t => console.log(Object.values(t)[0]));

// 2. 查 ledger_records 表（意见应该存在这里）
try {
  const [count] = await conn.query('SELECT COUNT(*) as cnt FROM ledger_records');
  console.log('\n=== ledger_records 总数 ===', count[0].cnt);
  
  const [recent] = await conn.query('SELECT * FROM ledger_records ORDER BY id DESC LIMIT 5');
  console.log('\n=== ledger_records 最新5条 ===');
  recent.forEach(r => console.log(JSON.stringify(r)));
} catch(e) {
  console.log('ledger_records 查询失败:', e.message);
}

// 3. 查 opinion_entries 表
try {
  const [count] = await conn.query('SELECT COUNT(*) as cnt FROM opinion_entries');
  console.log('\n=== opinion_entries 总数 ===', count[0].cnt);
  
  const [recent] = await conn.query('SELECT * FROM opinion_entries ORDER BY id DESC LIMIT 5');
  console.log('\n=== opinion_entries 最新5条 ===');
  recent.forEach(r => console.log(JSON.stringify(r)));
} catch(e) {
  console.log('opinion_entries 查询失败:', e.message);
}

// 4. 查 ledgers 表，看意见本的 ledgerId
try {
  const [ledgers] = await conn.query("SELECT id, name, type FROM ledgers WHERE type='opinion_book' OR name LIKE '%意见%' OR name LIKE '%建议%' LIMIT 10");
  console.log('\n=== 意见本类型的 ledgers ===');
  ledgers.forEach(l => console.log(JSON.stringify(l)));
} catch(e) {
  console.log('ledgers 查询失败:', e.message);
}

// 5. 查 ledger_records 中与意见本相关的记录
try {
  const [ledgers] = await conn.query("SELECT id FROM ledgers WHERE type='opinion_book' LIMIT 1");
  if (ledgers.length > 0) {
    const lid = ledgers[0].id;
    const [records] = await conn.query('SELECT * FROM ledger_records WHERE ledgerId = ? ORDER BY id DESC LIMIT 5', [lid]);
    console.log(`\n=== ledger_records (ledgerId=${lid}) ===`);
    records.forEach(r => console.log(JSON.stringify(r)));
    
    const [cnt] = await conn.query('SELECT COUNT(*) as cnt FROM ledger_records WHERE ledgerId = ?', [lid]);
    console.log(`总数: ${cnt[0].cnt}`);
  }
} catch(e) {
  console.log('查询失败:', e.message);
}

await conn.end();
