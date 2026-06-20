/**
 * 补录脚本：为 YJH 补上已有订单的 1.0 倍赠予订单
 * 
 * 逻辑：
 * 1. 查找 AF 账本(id=52) 中所有已成交的非赠予买入订单
 * 2. 对每个订单，检查下单人是否在 YJH 的推荐链上（直推或间推）
 * 3. 如果是，检查是否已有 1.0 倍赠予订单（避免重复）
 * 4. 如果没有，生成 1.0 倍赠予订单
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const YJH_USER_ID = 4957151;
const AF_LEDGER_ID = 52;

async function main() {
  const conn = await mysql.createConnection(process.env.ORIGINAL_DATABASE_URL);
  
  console.log('=== 开始补录 YJH 1.0 倍赠予订单 ===');
  
  // 1. 先构建 YJH 的所有下级用户集合（直推 + 间推，无限层级）
  const yjhDescendants = new Set();
  const queue = [YJH_USER_ID];
  
  while (queue.length > 0) {
    const currentId = queue.shift();
    const [children] = await conn.execute(
      'SELECT id FROM users WHERE invited_by_user_id = ?',
      [currentId]
    );
    for (const child of children) {
      if (!yjhDescendants.has(child.id)) {
        yjhDescendants.add(child.id);
        queue.push(child.id);
      }
    }
  }
  
  console.log(`YJH 的所有下级用户: ${[...yjhDescendants].join(', ')} (共 ${yjhDescendants.size} 人)`);
  
  // 2. 查找 AF 账本中所有已成交的非赠予买入订单
  const [orders] = await conn.execute(
    `SELECT id, user_id, coin, side, limit_price, amount, quantity, status 
     FROM af_orders 
     WHERE ledger_id = ? AND side = 'buy' AND status = 'completed' AND (is_gift = 0 OR is_gift IS NULL)
     ORDER BY id`,
    [AF_LEDGER_ID]
  );
  
  console.log(`AF 账本已成交普通买入订单: ${orders.length} 个`);
  
  let created = 0;
  let skipped = 0;
  
  for (const order of orders) {
    // 下单人是 YJH 自己，跳过
    if (order.user_id === YJH_USER_ID) {
      console.log(`  订单#${order.id}: 下单人是 YJH 自己，跳过`);
      skipped++;
      continue;
    }
    
    // 下单人不在 YJH 推荐链上，跳过
    if (!yjhDescendants.has(order.user_id)) {
      console.log(`  订单#${order.id}: 下单人(${order.user_id})不在 YJH 推荐链上，跳过`);
      skipped++;
      continue;
    }
    
    // 检查是否已有 1.0 倍赠予订单
    const [existing] = await conn.execute(
      `SELECT id FROM af_orders 
       WHERE ledger_id = ? AND is_gift = 1 AND gift_multiplier = '1.0' 
         AND source_order_id = ? AND user_id = ?
       LIMIT 1`,
      [AF_LEDGER_ID, order.id, YJH_USER_ID]
    );
    
    if (existing.length > 0) {
      console.log(`  订单#${order.id}: 已有 1.0 倍赠予订单(#${existing[0].id})，跳过`);
      skipped++;
      continue;
    }
    
    // 生成 1.0 倍赠予订单
    const actualSpend = parseFloat(order.amount || '0');
    const actualPrice = parseFloat(order.limit_price || '0');
    const giftAmount = (actualSpend * 1.0).toFixed(8);
    const giftQuantity = actualPrice > 0 ? (actualSpend * 1.0 / actualPrice).toFixed(8) : '0';
    
    await conn.execute(
      `INSERT INTO af_orders (ledger_id, user_id, coin, side, limit_price, amount, quantity, status, is_gift, gift_multiplier, source_order_id, source_user_id, source_amount, created_at, updated_at)
       VALUES (?, ?, ?, 'buy', ?, ?, ?, 'completed', 1, '1.0', ?, ?, ?, NOW(), NOW())`,
      [AF_LEDGER_ID, YJH_USER_ID, order.coin, order.limit_price, giftAmount, giftQuantity, order.id, order.user_id, actualSpend.toFixed(8)]
    );
    
    console.log(`  订单#${order.id}: 已为 YJH 生成 1.0 倍赠予订单 (币种:${order.coin}, 金额:${giftAmount}, 来源用户:${order.user_id})`);
    created++;
  }
  
  console.log(`\n=== 补录完成 ===`);
  console.log(`创建: ${created} 个, 跳过: ${skipped} 个`);
  
  await conn.end();
}

main().catch(e => {
  console.error('补录失败:', e);
  process.exit(1);
});
