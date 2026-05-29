import mysql from 'mysql2/promise';

const DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";

const conn = await mysql.createConnection(DB_URL);

// 查找 ETH 订单，开仓时间2025年11月28日附近
const [orders] = await conn.execute(`
  SELECT o.id, o.user_id, o.coin, o.limit_price, o.quantity, o.status, o.sell_status, 
         o.confirmed_at, o.created_at,
         s.all_time_low_price, s.all_time_low_at, s.scan_count
  FROM af_orders o
  LEFT JOIN af_order_scan_stats s ON s.order_id = o.id
  WHERE o.coin = 'ETH' 
    AND o.status = 'completed'
    AND o.confirmed_at BETWEEN '2025-11-25' AND '2025-12-01'
  ORDER BY o.id
`);
console.log('ETH订单(11月28日附近):', JSON.stringify(orders, null, 2));

// 查询每笔订单的档位触发记录
for (const order of orders) {
  const [tiers] = await conn.execute(`
    SELECT tier, trigger_price, triggered_at FROM af_order_tier_triggers
    WHERE order_id = ? ORDER BY tier
  `, [order.id]);
  console.log(`订单#${order.id} 买入价:${order.limit_price} 档位记录:`, JSON.stringify(tiers, null, 2));
}

await conn.end();
