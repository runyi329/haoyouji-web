/**
 * 回填订单063和065（ETH）及其赠与单的历史最低价和档位
 * 2026-02-06 ETH 日线最低价：1748.63
 *
 * 订单063：买入价3850，开仓2025-10-30，最高触发第5档（跌50%=1925，1748.63<1925）
 * 订单065：买入价3014，开仓2025-11-28，最高触发第4档（跌40%=1808.4，1748.63<1808.4）
 */
import mysql from 'mysql2/promise';

const DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const ALL_TIME_LOW = "1748.63";
const ALL_TIME_LOW_AT_MS = new Date('2026-02-06T00:00:00Z').getTime(); // bigint 毫秒时间戳
const ALL_TIME_LOW_AT_STR = '2026-02-06 00:00:00'; // 用于 scan_stats 的 datetime 字段

const conn = await mysql.createConnection(DB_URL);

// 需要处理的订单配置
const TARGET_ORDERS = [
  { buyPrice: 3850, confirmedFrom: '2025-10-28', confirmedTo: '2025-11-05', label: '订单063' },
  { buyPrice: 3014, confirmedFrom: '2025-11-25', confirmedTo: '2025-12-01', label: '订单065' },
];

for (const target of TARGET_ORDERS) {
  console.log(`\n========== 处理 ${target.label} (买入价${target.buyPrice}) ==========`);

  // 1. 查找正单
  const [orders] = await conn.execute(`
    SELECT id, coin, limit_price, confirmed_at, is_gift, source_order_id
    FROM af_orders
    WHERE coin = 'ETH'
      AND status = 'completed'
      AND confirmed_at BETWEEN ? AND ?
      AND (is_gift IS NULL OR is_gift = 0)
      AND (source_order_id IS NULL OR source_order_id = 0)
    ORDER BY ABS(CAST(limit_price AS DECIMAL(20,8)) - ?) ASC
    LIMIT 3
  `, [target.confirmedFrom, target.confirmedTo, target.buyPrice]);
  
  console.log('候选正单:', orders.map(o => `#${o.id} price=${o.limit_price} confirmed=${o.confirmed_at}`));

  if (orders.length === 0) {
    console.log(`❌ 未找到 ${target.label}，跳过`);
    continue;
  }

  const mainOrder = orders[0];
  console.log(`✅ 选定正单 #${mainOrder.id}，买入价 ${mainOrder.limit_price}`);

  // 2. 查找赠与单
  const [giftOrders] = await conn.execute(`
    SELECT id, coin, limit_price FROM af_orders
    WHERE source_order_id = ? AND coin = 'ETH'
  `, [mainOrder.id]);
  console.log(`赠与单(${giftOrders.length}笔):`, giftOrders.map(o => `#${o.id}`).join(', ') || '无');

  const allOrderIds = [mainOrder.id, ...giftOrders.map(o => o.id)];
  const buyPrice = parseFloat(mainOrder.limit_price);
  
  // 计算最高档位：每跌10%一档，最多9档
  const dropPct = (buyPrice - parseFloat(ALL_TIME_LOW)) / buyPrice;
  const maxTierToSet = Math.min(Math.floor(dropPct / 0.1), 9);
  console.log(`跌幅: ${(dropPct*100).toFixed(2)}%，应触发到第${maxTierToSet}档`);

  // 3. 更新 af_order_scan_stats
  for (const orderId of allOrderIds) {
    const [existing] = await conn.execute(
      `SELECT id, all_time_low_price FROM af_order_scan_stats WHERE order_id = ?`,
      [orderId]
    );
    const stats = existing[0];

    if (stats) {
      const currentLow = parseFloat(stats.all_time_low_price) || 999999;
      if (parseFloat(ALL_TIME_LOW) < currentLow) {
        await conn.execute(`
          UPDATE af_order_scan_stats
          SET all_time_low_price = ?, all_time_low_at = ?, updated_at = NOW()
          WHERE order_id = ?
        `, [ALL_TIME_LOW, ALL_TIME_LOW_AT_STR, orderId]);
        console.log(`  ✅ 订单#${orderId} 更新最低价: ${currentLow} → ${ALL_TIME_LOW}`);
      } else {
        console.log(`  ⏭️  订单#${orderId} 当前最低价${currentLow}已更低，跳过`);
      }
    } else {
      await conn.execute(`
        INSERT INTO af_order_scan_stats (order_id, coin, scan_count, last_scan_at, last_low_price, all_time_low_price, all_time_low_at, created_at, updated_at)
        VALUES (?, 'ETH', 1, ?, ?, ?, ?, NOW(), NOW())
      `, [orderId, ALL_TIME_LOW_AT_STR, ALL_TIME_LOW, ALL_TIME_LOW, ALL_TIME_LOW_AT_STR]);
      console.log(`  ✅ 订单#${orderId} 插入新扫描统计记录`);
    }
  }

  // 4. 补录档位触发记录
  for (const orderId of allOrderIds) {
    const [tierRows] = await conn.execute(`
      SELECT COALESCE(MAX(tier), 0) as maxTier FROM af_order_tier_triggers WHERE order_id = ?
    `, [orderId]);
    const currentMaxTier = parseInt(tierRows[0]?.maxTier ?? "0") || 0;
    console.log(`  订单#${orderId} 当前最高档位: ${currentMaxTier}，需要补录到第${maxTierToSet}档`);

    if (currentMaxTier >= maxTierToSet) {
      console.log(`  ⏭️  订单#${orderId} 档位已足够，跳过`);
      continue;
    }

    const [orderInfo] = await conn.execute(`SELECT ledger_id FROM af_orders WHERE id = ?`, [orderId]);
    const ledgerId = orderInfo[0]?.ledger_id;

    for (let tier = currentMaxTier + 1; tier <= maxTierToSet; tier++) {
      const tierPrice = (buyPrice * (1 - tier * 0.1)).toFixed(2);
      await conn.execute(`
        INSERT INTO af_order_tier_triggers (order_id, ledger_id, coin, tier, trigger_price, triggered_at, created_at)
        VALUES (?, ?, 'ETH', ?, ?, ?, NOW())
      `, [orderId, ledgerId, tier, tierPrice, ALL_TIME_LOW_AT_MS]);
      console.log(`  ✅ 订单#${orderId} 补录第${tier}档，触发价 ${tierPrice}`);
    }
  }
}

console.log('\n🎉 全部回填完成！');
await conn.end();
