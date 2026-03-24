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
 *
 * 价格来源优先级：Gate.io → Binance → 火币 → OKX
 * 每次失败自动重试3次，间隔5秒
 * 扫描频率：每小时一次
 */

const COIN_SYMBOLS: Record<string, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
};

// 全局扫描锁：防止并发执行
let globalFunderScanLock = false;

/**
 * 带重试的 fetch 封装
 */
async function fetchWithRetry(url: string, timeoutMs: number, retries = 3): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) return r;
    } catch (e) {
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, 5000));
      }
    }
  }
  return null;
}

/**
 * 获取指定币种当前价格（最近1小时最低价）
 * 优先级：Gate.io → Binance → 火币 → OKX
 */
async function fetch1hLowPrice(coin: string): Promise<{ low: number } | null> {
  const symbol = COIN_SYMBOLS[coin];
  if (!symbol) return null;

  // 1. Gate.io 主用（1h K线）
  try {
    const pair = symbol.replace(/^(BTC|ETH|SOL)(USDT)$/, '$1_$2');
    const r = await fetchWithRetry(
      `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${pair}&interval=1h&limit=2`,
      12000
    );
    if (r) {
      const data: any[] = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        // Gate.io K线格式: [时间戳, 成交量, 开盘, 最高, 最低, 收盘, ...]
        const low = Math.min(...data.map((k: any[]) => parseFloat(k[4])));
        if (!isNaN(low) && low > 0) {
          console.log(`[资方扫描] Gate.io ${coin} 1h最低价: ${low}`);
          return { low };
        }
      }
    }
  } catch (e) {
    console.warn(`[资方扫描] Gate.io获取 ${coin} 失败:`, e);
  }

  // 2. Binance 备用（1h K线）
  try {
    const r = await fetchWithRetry(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=2`,
      12000
    );
    if (r) {
      const data: any[] = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        // Binance K线格式: [时间戳, 开盘, 最高, 最低, 收盘, ...]
        const low = Math.min(...data.map((k: any[]) => parseFloat(k[3])));
        if (!isNaN(low) && low > 0) {
          console.log(`[资方扫描] Binance ${coin} 1h最低价: ${low}`);
          return { low };
        }
      }
    }
  } catch (e) {
    console.warn(`[资方扫描] Binance获取 ${coin} 失败:`, e);
  }

  // 3. 火币备用（1h K线）
  try {
    const sym = symbol.toLowerCase();
    const r = await fetchWithRetry(
      `https://api.huobi.pro/market/history/kline?symbol=${sym}&period=60min&size=2`,
      10000
    );
    if (r) {
      const j: any = await r.json();
      if (j.status === 'ok' && j.data?.length > 0) {
        const low = Math.min(...j.data.map((k: any) => parseFloat(k.low)));
        if (!isNaN(low) && low > 0) {
          console.log(`[资方扫描] 火币 ${coin} 1h最低价: ${low}`);
          return { low };
        }
      }
    }
  } catch (e) {
    console.warn(`[资方扫描] 火币获取 ${coin} 失败:`, e);
  }

  // 4. OKX 备用（1H K线）
  try {
    const instId = symbol.replace(/^(BTC|ETH|SOL)(USDT)$/, '$1-$2');
    const res = await fetchWithRetry(
      `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1H&limit=2`,
      10000
    );
    if (res) {
      const json: any = await res.json();
      if (json.code === '0' && json.data?.length > 0) {
        // OKX K线格式: [时间戳, 开盘, 最高, 最低, 收盘, ...]
        const low = Math.min(...json.data.map((k: any[]) => parseFloat(k[3])));
        if (!isNaN(low) && low > 0) {
          console.log(`[资方扫描] OKX ${coin} 1h最低价: ${low}`);
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
  // 收益权比例规则：
  // 跌幅 < 1%：收益分成 = 0%
  // 跌幅 >= 1% 且 < 2%：收益分成 = 0.5%
  // 跌幅 >= 2%：收益分成 = 1%
  let profitRightPct: number;
  if (dropPct < 1) {
    profitRightPct = 0;
  } else if (dropPct < 2) {
    profitRightPct = 0.5;
  } else {
    profitRightPct = 1;
  }
  // 收益权对应币数
  const profitRightCoins = buyQuantity * (profitRightPct / 100);
  return {
    dropPct: Math.round(dropPct * 100) / 100,
    profitRightPct,
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
      // 1. 获取1小时最低价
      const priceData = await fetch1hLowPrice(coin);
      if (!priceData) {
        console.warn(`[资方扫描] ${coin} 价格获取失败（四个交易所均不可用），跳过`);
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
 * 启动定时扫描（每小时整点触发）
 */
export function startFunderScanner() {
  function getNextHourMs(): number {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(1, 0, 0); // 每小时01分触发，避免整点拥堵
    if (nextHour <= now) {
      nextHour.setHours(nextHour.getHours() + 1);
    }
    return Math.max(nextHour.getTime() - now.getTime(), 60 * 1000);
  }

  function scheduleNext() {
    const delay = getNextHourMs();
    const nextTime = new Date(Date.now() + delay);
    const bjNext = new Date(nextTime.getTime() + 8 * 3600 * 1000);
    console.log(`[资方扫描] 下次扫描计划在北京时间 ${bjNext.getUTCHours().toString().padStart(2, '0')}:01（${Math.round(delay / 60000)}分钟后）`);
    setTimeout(async () => {
      await runFunderScan();
      scheduleNext();
    }, delay);
  }

  console.log('[资方扫描] 资金方收益权监控已启动，每小时整点扫描（Gate.io→Binance→火币→OKX，失败自动重试3次）');
  // 启动时立即执行一次，不等整点
  setTimeout(async () => {
    console.log('[资方扫描] 启动即时扫描（初始化）...');
    await runFunderScan();
  }, 5000);
  scheduleNext();
}
