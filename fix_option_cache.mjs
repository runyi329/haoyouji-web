import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. 查出52号账本所有期权订单
const [orders] = await conn.execute(`
  SELECT o.id, o.order_no, o.option_info, u.name as user_name
  FROM ledger_orders o
  LEFT JOIN users u ON o.user_id = u.id
  WHERE o.ledger_id = 52 AND o.asset_type = 'crypto_option'
  ORDER BY o.id
`);

console.log(`找到 ${orders.length} 张期权订单：`);

const instruments = [];
for (const o of orders) {
  const info = typeof o.option_info === 'string' ? JSON.parse(o.option_info) : o.option_info;
  const coin = info?.coin || 'ETH';
  const label = info?.deribitLabel || '';
  const strike = info?.strikePrice || '';
  const dir = info?.direction || '';
  const isCall = dir.includes('call') ? 'C' : 'P';
  const instrument = `${coin}-${label}-${strike}-${isCall}`;
  instruments.push(instrument);
  console.log(`  ${o.order_no} (${o.user_name}): ${instrument}, 权利金=${info?.premium}, 张数=${info?.buyQty}`);
}

// 2. 查出这些合约的缓存，找出 source=deribit 的
console.log('\n检查缓存状态：');
let fixedCount = 0;
for (const inst of instruments) {
  const cacheKey = `greeks:${inst}`;
  const [rows] = await conn.execute('SELECT cache_key, cache_value FROM deribit_cache WHERE cache_key = ?', [cacheKey]);
  if (rows.length > 0) {
    const val = JSON.parse(rows[0].cache_value);
    if (val.source === 'deribit') {
      // Deribit markPrice 是 ETH 计价，需要清除让其重新获取
      console.log(`  ❌ ${inst}: markPrice=${val.markPrice} (Deribit ETH计价，需清除)`);
      await conn.execute('DELETE FROM deribit_cache WHERE cache_key = ?', [cacheKey]);
      fixedCount++;
    } else {
      console.log(`  ✅ ${inst}: markPrice=${val.markPrice} (${val.source}, USDT，正确)`);
    }
  } else {
    console.log(`  ⬜ ${inst}: 无缓存，下次请求时会重新获取`);
  }
}

console.log(`\n共清除 ${fixedCount} 条 Deribit 来源的错误缓存`);
console.log('下次打开对应期权卡片时，系统会重新从 Gate.io 获取正确的 USDT 现价');

await conn.end();
