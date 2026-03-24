/**
 * funder-price-scanner.ts
 * 资金方订单收益权扫描服务
 *
 * 收益权规则：
 *   - 每降 1%，资金方获得 0.5% 的收益权
 *   - 例：买入价 2000，跌至 1800（跌 10%），收益权 = 5%
 *   - 收益权对应币数 = 买入数量 × 收益权比例
 *
 * 扫描内容：
 *   - 累计扫描次数
 *   - 上次扫描时间
 *   - 历史最低价（不可逆，只降不升）
 *   - 历史最低价 vs 买入价的跌幅
 *   - 当前收益权比例（%）
 *   - 收益权对应币数
 */

const COIN_SYMBOLS: Record<string, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
};

// 全局扫描锁：防止并发执行
let globalFunderScanLock = false;

/**
 * 获取指定币种过去4小时的最低价
 * 复用 af-tier-scanner 的三交易所策略（Gate.io → 火币 → OKX）
 */
async function fetch4hLowPrice(coin: string): Promise<{ low: number } | null> {
  const symbol = COIN_SYMBOLS[coin];
  if (!symbol) return null;

  // Gate.io 主用
  try {
    const pair = symbol.replace(/^(BTC|ETH|SOL)(USDT)$/, '$1_$2');
    const r = await fetch(
      `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${pair}&interval=4h&limit=2`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (r.ok) {
      const data: any[] = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        const low = Math.min(...data.map((k: any[]) => parseFloat(k[4])));
        if (!isNaN(low) && low > 0) {
          console.log(`[资方扫描] Gate.io ${coin} 4h最低价: ${low}`);
          return { low };
        }
      }
    }
  } catch (e) {
    console.warn(`[资方扫描] Gate.io获取 ${coin} 失败:`, e);
  }

  // 火币备用
  try {
    const sym = symbol.toLowerCase();
    const r = await fetch(
      `https://api.huobi.pro/market/history/kline?symbol=${sym}&period=4hour&size=2`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const j: any = await r.json();
      if (j.status === 'ok' && j.data?.length > 0) {
        const low = Math.min(...j.data.map((k: any) => parseFloat(k.low)));
        if (!isNaN(low) && low > 0) {
          console.log(`[资方扫描] 火币 ${coin} 4h最低价: ${low}`);
          return { low };
        }
      }
    }
  } catch (e) {
    console.warn(`[资方扫描] 火币获取 ${coin} 失败:`, e);
  }

  // OKX 备用
  try {
    const instId = symbol.replace(/^(BTC|ETH|SOL)(USDT)$/, '$1-$2');
    const res = await fetch(
      `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=4H&limit=2`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const json: any = await res.json();
      if (json.code === '0' && json.data?.length > 0) {
        const low = Math.min(...json.data.map((k: any[]) => parseFloat(k[3])));
        if (!isNaN(low) && low > 0) {
          console.log(`[资方扫描] OKX ${coin} 4h最低价: ${low}`);
          return { low };
        }
      }
    }
  } catch (e) {
    console.warn(`[资方扫描] OKX获取 ${coin} 失败:`, e);
  }

  return null;
}

/**
 * 计算收益权
 * @param buyPrice 买入价格
 * @param allTimeLow 历史最低价
 * @param buyQuantity 买入数量
 * @returns { dropPct, profitRightPct, profitRightCoins }
 */
export function calcFunderProfitRight(
  buyPrice: number,
  allTimeLow: number,
  buyQuantity: number
): { dropPct: number; profitRightPct: number; profitRightCoins: number } {
  if (!buyPrice || buyPrice <= 0 || !allTimeLow || allTimeLow <= 0) {
    return { dropPct: 0, profitRightPct: 0, profitRightCoins: 0 };
  }
  // 跌幅（正数表示下跌）
  const dropPct = Math.max(0, (buyPrice - allTimeLow) / buyPrice * 100);
  // 收益权比例：每降1%获得0.5%收益权
  const profitRightPct = dropPct * 0.5;
  // 收益权对应币数
  const profitRightCoins = buyQuantity * (profitRightPct / 100);
  return {
    dropPct: Math.round(dropPct * 100) / 100,
    profitRightPct: Math.round(profitRightPct * 10000) / 10000,
    profitRightCoins: Math.round(profitRightCoins * 100000000) / 100000000,
  };
}

/**
 * 执行一次资金方订单扫描
 * @param targetOrderId 可选，指定只扫描某笔订单
 */
export async function runFunderScan(targetOrderId?: number) {
  if (!targetOrderId && globalFunderScanLock) {
    console.log('[资方扫描] 已有全量扫描运行中，跳过本次');
    return;
  }
  if (!targetOrderId) globalFunderScanLock = true;

  const { getDbConnection } = await import('./db');
  const conn = await getDbConnection();
  if (!conn) {
    console.warn('[资方扫描] 数据库连接失败，跳过本次扫描');
    if (!targetOrderId) globalFunderScanLock = false;
    return;
  }

  console.log(targetOrderId
    ? `[资方扫描] 即时扫描资金方订单#${targetOrderId}...`
    : '[资方扫描] 开始全量扫描资金方订单收益权...');

  for (const coin of Object.keys(COIN_SYMBOLS)) {
    try {
      // 1. 获取4小时最低价
      const priceData = await fetch4hLowPrice(coin);
      if (!priceData) {
        console.warn(`[资方扫描] ${coin} 价格获取失败，跳过`);
        continue;
      }
      const { low } = priceData;
      const lowStr = low.toString();

      // 2. 查询该币种所有持有中的资金方订单
      let ordersQuery = `SELECT id, buy_price, buy_quantity FROM funder_asset_orders
         WHERE coin = ? AND status = 'active' AND buy_price IS NOT NULL AND buy_quantity IS NOT NULL`;
      const queryParams: any[] = [coin];

      if (targetOrderId) {
        ordersQuery += ' AND id = ?';
        queryParams.push(targetOrderId);
      }

      const [orders] = await conn.execute(ordersQuery, queryParams) as any[];

      if (!Array.isArray(orders) || orders.length === 0) {
        console.log(`[资方扫描] ${coin} 无持有中的资金方订单`);
        continue;
      }

      for (const order of orders) {
        const buyPrice = parseFloat(order.buy_price);
        if (!buyPrice || buyPrice <= 0) continue;

        // 3. 更新扫描统计（累计次数、上次最低价、历史最低价）
        try {
          const [existingStats] = await conn.execute(
            'SELECT scan_count, all_time_low_price FROM funder_order_scan_stats WHERE order_id = ?',
            [order.id]
          ) as any[];
          const stats = existingStats?.[0];

          const currentAllTimeLow = stats?.all_time_low_price ? parseFloat(stats.all_time_low_price) : null;

          if (stats) {
            await conn.execute(
              `UPDATE funder_order_scan_stats SET
                scan_count = scan_count + 1,
                last_scan_at = NOW(),
                last_low_price = ?,
                all_time_low_price = CASE WHEN ? < CAST(COALESCE(all_time_low_price, '999999999') AS DECIMAL(20,8)) THEN ? ELSE all_time_low_price END,
                all_time_low_at = CASE WHEN ? < CAST(COALESCE(all_time_low_price, '999999999') AS DECIMAL(20,8)) THEN NOW() ELSE all_time_low_at END,
                updated_at = NOW()
               WHERE order_id = ?`,
              [lowStr, low, lowStr, low, order.id]
            );
          } else {
            await conn.execute(
              `INSERT INTO funder_order_scan_stats (order_id, coin, scan_count, last_scan_at, last_low_price, all_time_low_price, all_time_low_at, created_at, updated_at)
               VALUES (?, ?, 1, NOW(), ?, ?, NOW(), NOW(), NOW())`,
              [order.id, coin, lowStr, lowStr]
            );
          }

          // 计算收益权并打印日志
          const allTimeLow = currentAllTimeLow !== null ? Math.min(currentAllTimeLow, low) : low;
          const { dropPct, profitRightPct, profitRightCoins } = calcFunderProfitRight(
            buyPrice, allTimeLow, parseFloat(order.buy_quantity)
          );
          console.log(
            `[资方扫描] 订单#${order.id} ${coin} 买入价:${buyPrice} 历史最低:${allTimeLow} 跌幅:${dropPct.toFixed(2)}% 收益权:${profitRightPct.toFixed(4)}% (${profitRightCoins} ${coin})`
          );
        } catch (statsErr) {
          console.warn(`[资方扫描] 更新订单#${order.id}扫描统计失败:`, statsErr);
        }
      }
    } catch (err) {
      console.error(`[资方扫描] ${coin} 处理出错:`, err);
    }
  }

  console.log('[资方扫描] 本次扫描完成');
  if (!targetOrderId) globalFunderScanLock = false;
}

/**
 * 新订单创建后立即触发一次扫描（异步，不阻塞主流程）
 */
export function triggerFunderImmediateScan(orderId: number) {
  console.log(`[资方扫描] 新资金方订单#${orderId}，触发即时扫描`);
  setTimeout(async () => {
    try {
      await runFunderScan(orderId);
    } catch (e) {
      console.error(`[资方扫描] 即时扫描订单#${orderId}失败:`, e);
    }
  }, 3000);
}

/**
 * 启动定时扫描（对齐北京时间 0/4/8/12/16/20 点整点触发）
 */
export function startFunderScanner() {
  function getNextAlignedMs(): number {
    const now = new Date();
    const bjMs = now.getTime() + 8 * 3600 * 1000;
    const bjDate = new Date(bjMs);
    const bjHour = bjDate.getUTCHours();
    const nextBjHour = (Math.floor(bjHour / 4) + 1) * 4;
    const nextBjDate = new Date(bjMs);
    nextBjDate.setUTCHours(nextBjHour % 24, 0, 45, 0); // 整点后45秒触发（与af-tier-scanner错开）
    if (nextBjHour >= 24) {
      nextBjDate.setUTCDate(nextBjDate.getUTCDate() + 1);
      nextBjDate.setUTCHours(0, 0, 45, 0);
    }
    const nextUtcMs = nextBjDate.getTime() - 8 * 3600 * 1000;
    return Math.max(nextUtcMs - now.getTime(), 60 * 1000);
  }

  function scheduleNext() {
    const delay = getNextAlignedMs();
    const nextTime = new Date(Date.now() + delay);
    const bjNext = new Date(nextTime.getTime() + 8 * 3600 * 1000);
    console.log(`[资方扫描] 下次扫描计划在北京时间 ${bjNext.getUTCHours().toString().padStart(2, '0')}:00（${Math.round(delay / 60000)}分钟后）`);
    setTimeout(async () => {
      await runFunderScan();
      scheduleNext();
    }, delay);
  }

  console.log('[资方扫描] 资金方收益权监控已启动，对齐北京时间 0/4/8/12/16/20 点整点扫描');
  scheduleNext();
}
