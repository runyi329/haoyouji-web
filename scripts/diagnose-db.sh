#!/bin/bash
echo "========== DB 诊断报告 =========="
echo ""
echo "=== 1. ledger_records 表结构 ==="
cd /var/www/haoyouji-web
node -e "
const mysql = require('mysql2/promise');
(async () => {
  try {
    const dotenv = require('dotenv');
    dotenv.config();
    const url = process.env.DATABASE_URL || process.env.DB_URL || '';
    console.log('DB URL prefix:', url.substring(0, 30) + '...');
    const conn = await mysql.createConnection(url);
    const [rows] = await conn.execute('DESCRIBE ledger_records');
    console.log('=== ledger_records columns ===');
    rows.forEach(r => console.log(r.Field, r.Type, r.Null, r.Key, r.Default));
    
    console.log('');
    console.log('=== 查询 transaction 163 ===');
    const [records] = await conn.execute('SELECT * FROM ledger_records WHERE id = 163 LIMIT 1');
    if (records.length > 0) {
      console.log(JSON.stringify(records[0], null, 2));
    } else {
      console.log('Record 163 not found');
    }
    
    await conn.end();
  } catch(e) {
    console.error('DB Error:', e.message);
  }
})();
" 2>&1

echo ""
echo "=== 2. PM2 日志最后50行 ==="
pm2 logs haoyouji-web --lines 50 --nostream 2>&1 || echo "No PM2 logs"
echo ""
echo "=== 3. 应用错误日志 ==="
tail -50 /var/www/haoyouji-web/logs/error.log 2>/dev/null || tail -50 /var/www/haoyouji-web/logs/app.log 2>/dev/null || echo "No app logs found"
echo ""
echo "========== 诊断完成 =========="
