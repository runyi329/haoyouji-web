// 临时调试脚本：直接查询win_status差异
// 在服务器上执行: node scripts/debug-win-status.mjs

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
  charset: 'utf8mb4',
});

console.log('=== 1. 汇总统计 ===');
const [sumRows] = await conn.execute(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN win_status = '已中奖' OR (win_status NOT IN ('未中奖','0','') AND win_status IS NOT NULL AND CAST(win_status AS DECIMAL(20,4)) > 0) THEN 1 ELSE 0 END) as won,
    SUM(CASE WHEN win_status IN ('未中奖','0','') OR win_status IS NULL THEN 1 ELSE 0 END) as lost
  FROM qq_trade_records
  WHERE amount IS NOT NULL AND amount != ''
`);
const s = sumRows[0];
console.log(`total=${s.total}  won=${s.won}  lost=${s.lost}  diff=${Number(s.total)-Number(s.won)-Number(s.lost)}`);

console.log('\n=== 2. win_status全量分布（含HEX） ===');
const [distRows] = await conn.execute(`
  SELECT win_status, HEX(win_status) as hex_val, COUNT(*) as cnt
  FROM qq_trade_records
  WHERE amount IS NOT NULL AND amount != ''
  GROUP BY win_status
  ORDER BY cnt DESC
  LIMIT 30
`);
for (const r of distRows) {
  console.log(`  "${r.win_status ?? 'NULL'}"  hex=[${r.hex_val ?? ''}]  count=${r.cnt}`);
}

console.log('\n=== 3. 漏算记录（不属于won也不属于lost） ===');
const [missedRows] = await conn.execute(`
  SELECT order_id, win_status, HEX(win_status) as hex_val, amount, win_amount, content
  FROM qq_trade_records
  WHERE amount IS NOT NULL AND amount != ''
    AND NOT (
      win_status = '已中奖'
      OR (win_status NOT IN ('未中奖','0','') AND win_status IS NOT NULL AND CAST(win_status AS DECIMAL(20,4)) > 0)
    )
    AND NOT (
      win_status IN ('未中奖','0','') OR win_status IS NULL
    )
  LIMIT 20
`);
if (missedRows.length === 0) {
  console.log('  没有漏算记录');
} else {
  for (const r of missedRows) {
    console.log(`  order_id=${r.order_id}  win_status="${r.win_status}"  hex=[${r.hex_val}]  amount=${r.amount}  content=${String(r.content||'').substring(0,30)}`);
  }
}

console.log('\n=== 4. amount字段含空白字符的记录 ===');
const [edgeRows] = await conn.execute(`
  SELECT order_id, HEX(amount) as hex_amount, amount, win_status
  FROM qq_trade_records
  WHERE amount IS NOT NULL AND amount != ''
    AND (TRIM(amount) = '' OR LENGTH(amount) != LENGTH(TRIM(amount)))
  LIMIT 10
`);
if (edgeRows.length === 0) {
  console.log('  没有含空白字符的amount记录');
} else {
  for (const r of edgeRows) {
    console.log(`  order_id=${r.order_id}  amount="${r.amount}"  hex=[${r.hex_amount}]  win_status="${r.win_status}"`);
  }
}

await conn.end();
console.log('\n=== 查询完成 ===');
