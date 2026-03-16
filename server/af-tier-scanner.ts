/**
 * af-tier-scanner.ts
 * 无损合约收益权档位扫描服务
 * - 每4小时扫描一次火币/OKX 的4小时K线最低价
 * - 与已成交买入订单的委托价格比较，触发档位记录
 * - 档位：每跌10%一档，共9档（1/1 → 1/9）
 * - 记录每笔订单的累计扫描次数、上次最低价、历史最低价
 */

// 币种 → 交易所 symbol 映射
const COIN_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

// 最近一次扫描状态（供前端查询）
const scanStatus: Record<string, {
  lastScanAt: string;
  lowestPrice: string;
  scanning: boolean;
}> = {};

// 全局扫描锁：防止并发执行
let globalScanLock = false;

/**
 * 获取指定币种过去4小时的最低价
 * 使用 Gate.io API（腔讯云服务器可访问）
 * Gate.io K线格式: [timestamp, volume, open, high, low, close, ...]
 */
async function fetch4hLowPrice(coin: string): Promise<{ low: number; scanFrom: Date; scanTo: Date } | null> {
  const symbol = COIN_SYMBOLS[coin];
  if (!symbol) return null;

  const now = new Date();
  const scanFrom = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  // Gate.io 主用（腔讯云服务器可访问）
  try {
    const pair = symbol.replace(/^(BTC|ETH|SOL)(USDT)$/, "$1_$2");
    const r = await fetch(
      `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${pair}&interval=4h&limit=2`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (r.ok) {
      const data: any[] = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        // Gate.io 格式: [timestamp, quote_volume, open, high, low, close, base_volume, is_closed]
        const low = Math.min(...data.map((k: any[]) => parseFloat(k[4])));
        if (!isNaN(low) && low > 0) {
          console.log(`[AF扫描] Gate.io ${coin} 4h最低价: ${low}`);
          return { low, scanFrom, scanTo: now };
        }
      }
    }
  } catch (e) {
    console.warn(`[AF扫描] Gate.io获取 ${coin} 失败:`, e);
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
      if (j.status === "ok" && j.data?.length > 0) {
        const low = Math.min(...j.data.map((k: any) => parseFloat(k.low)));
        if (!isNaN(low) && low > 0) {
          console.log(`[AF扫描] 火币 ${coin} 4h最低价: ${low}`);
          return { low, scanFrom, scanTo: now };
        }
      }
    }
  } catch (e) {
    console.warn(`[AF扫描] 火币获取 ${coin} 失败:`, e);
  }

  // OKX 备用
  try {
    const instId = symbol.replace(/^(BTC|ETH|SOL)(USDT)$/, "$1-$2");
    const res = await fetch(
      `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=4H&limit=2`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const json: any = await res.json();
      if (json.code === "0" && json.data?.length > 0) {
        const low = Math.min(...json.data.map((k: any[]) => parseFloat(k[3])));
        if (!isNaN(low) && low > 0) {
          console.log(`[AF扫描] OKX ${coin} 4h最低价: ${low}`);
          return { low, scanFrom, scanTo: now };
        }
      }
    }
  } catch (e) {
    console.warn(`[AF扫描] OKX获取 ${coin} 失败:`, e);
  }

  return null;
}

/**
 * 执行一次扫描：检查所有已成交买入订单，触发档位
 * @param targetOrderId 可选，指定只扫描某笔订单（新订单即时扫描用）
 */
export async function runTierScan(targetOrderId?: number) {
  // 全量扫描防重入：如果已有全量扫描在运行，跳过（即时扫描不受锁影响）
  if (!targetOrderId && globalScanLock) {
    console.log('[AF扫描] 已有全量扫描运行中，跳过本次');
    return;
  }
  if (!targetOrderId) globalScanLock = true;

  const { getDbConnection } = await import("./db");
  const conn = await getDbConnection();
  if (!conn) {
    console.warn("[AF扫描] 数据库连接失败，跳过本次扫描");
    if (!targetOrderId) globalScanLock = false;
    return;
  }

  console.log(targetOrderId
    ? `[AF扫描] 即时扫描订单#${targetOrderId}...`
    : "[AF扫描] 开始全量扫描收益权档位...");

  for (const coin of Object.keys(COIN_SYMBOLS)) {
    try {
      scanStatus[coin] = { ...scanStatus[coin], scanning: true, lastScanAt: scanStatus[coin]?.lastScanAt || "", lowestPrice: scanStatus[coin]?.lowestPrice || "" };

      // 1. 获取4小时最低价
      const priceData = await fetch4hLowPrice(coin);
      if (!priceData) {
        console.warn(`[AF扫描] ${coin} 价格获取失败，跳过`);
        scanStatus[coin] = { scanning: false, lastScanAt: new Date().toISOString(), lowestPrice: scanStatus[coin]?.lowestPrice || "--" };
        continue;
      }

      const { low, scanFrom, scanTo } = priceData;
      const lowStr = low.toString();
      const nowTs = Date.now();

      // 2. 记录扫描日志
      try {
        await conn.execute(
          `INSERT INTO af_price_scan_logs (order_id, coin, low_price, scan_count, scanned_at, created_at)
           VALUES (?, ?, ?, 1, NOW(), NOW())`,
          [targetOrderId || null, coin, lowStr]
        );
      } catch (logErr) {
        console.warn(`[AF扫描] 写入价格日志失败:`, logErr);
      }

      // 更新内存扫描状态
      scanStatus[coin] = { scanning: false, lastScanAt: new Date().toISOString(), lowestPrice: lowStr };

      // 3. 查询该币种所有已成交买入订单（无损合约）
      let ordersQuery = `SELECT id, ledger_id, user_id, coin, limit_price FROM af_orders
         WHERE coin = ? AND side = 'buy' AND status = 'completed'
           AND (order_type = '无损合约' OR order_type IS NULL OR order_type = '')
           AND (sell_status IS NULL OR sell_status = '' OR sell_status = 'selling' OR sell_status = 'sell_cancelled')`;
      const queryParams: any[] = [coin];

      if (targetOrderId) {
        ordersQuery += ` AND id = ?`;
        queryParams.push(targetOrderId);
      }

      const [orders] = await conn.execute(ordersQuery, queryParams) as any[];

      if (!Array.isArray(orders) || orders.length === 0) {
        console.log(`[AF扫描] ${coin} 无已成交无损合约买入订单`);
        continue;
      }

      for (const order of orders) {
        const buyPrice = parseFloat(order.limit_price);
        if (!buyPrice || buyPrice <= 0) continue;

        // 4. 更新该订单的扫描统计（累计次数、上次最低价、历史最低价）
        try {
          // 查询现有统计
          const [existingStats] = await conn.execute(
            `SELECT scan_count, all_time_low_price, all_time_low_at FROM af_order_scan_stats WHERE order_id = ?`,
            [order.id]
          ) as any[];
          const stats = existingStats?.[0];

          const currentAllTimeLow = stats?.all_time_low_price ? parseFloat(stats.all_time_low_price) : null;
          const isNewAllTimeLow = currentAllTimeLow === null || low < currentAllTimeLow;

          if (stats) {
            // 更新现有记录
            await conn.execute(
              `UPDATE af_order_scan_stats SET
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
            // 插入新记录
            await conn.execute(
              `INSERT INTO af_order_scan_stats (order_id, coin, scan_count, last_scan_at, last_low_price, all_time_low_price, all_time_low_at, created_at, updated_at)
               VALUES (?, ?, 1, NOW(), ?, ?, NOW(), NOW(), NOW())`,
              [order.id, coin, lowStr, lowStr]
            );
          }
        } catch (statsErr) {
          console.warn(`[AF扫描] 更新订单#${order.id}扫描统计失败:`, statsErr);
        }

        // 5. 计算当前跌幅，判断档位
        const dropPct = (buyPrice - low) / buyPrice; // 正数表示下跌
        const currentTier = Math.floor(dropPct / 0.1); // 0=未跌10%, 1=跌10-20%, ...

        if (currentTier <= 0) {
          console.log(`[AF扫描] 订单#${order.id} ${coin} 未达到第1档 (买入:${buyPrice}, 当前最低:${low}, 跌幅:${(dropPct*100).toFixed(2)}%)`);
          continue;
        }
        const tierToTrigger = Math.min(currentTier, 9); // 最多9档

        // 6. 查询该订单已触发的最高档位
        const [existing] = await conn.execute(
          `SELECT COALESCE(MAX(tier), 0) as maxTier FROM af_order_tier_triggers WHERE order_id = ?`,
          [order.id]
        ) as any[];
        const maxTriggered = parseInt(existing?.[0]?.maxTier ?? "0") || 0;

        // 7. 只触发尚未记录的新档位（不可逆）
        for (let tier = maxTriggered + 1; tier <= tierToTrigger; tier++) {
          await conn.execute(
            `INSERT INTO af_order_tier_triggers (order_id, ledger_id, coin, tier, trigger_price, triggered_at, created_at)
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [order.id, order.ledger_id, coin, tier, lowStr]
          );
          console.log(`[AF扫描] ✅ 订单#${order.id} ${coin} 触发第${tier}档 (买入价:${buyPrice}, 当前最低:${low}, 跌幅:${(dropPct*100).toFixed(2)}%)`);
        }

        if (maxTriggered >= tierToTrigger) {
          console.log(`[AF扫描] 订单#${order.id} ${coin} 已在第${maxTriggered}档，当前档位${tierToTrigger}，无需新增`);
        }
      }
    } catch (err) {
      console.error(`[AF扫描] ${coin} 处理出错:`, err);
      scanStatus[coin] = { scanning: false, lastScanAt: new Date().toISOString(), lowestPrice: scanStatus[coin]?.lowestPrice || "--" };
    }
  }

  console.log("[AF扫描] 本次扫描完成");
  // 释放全局扫描锁
  if (!targetOrderId) globalScanLock = false;
}

/**
 * 获取指定币种的扫描状态
 */
export function getScanStatus(coin: string) {
  return scanStatus[coin] || null;
}

/**
 * 新订单成交后立即触发一次扫描（异步，不阻塞主流程）
 */
export function triggerImmediateScan(orderId: number) {
  console.log(`[AF扫描] 新订单#${orderId}成交，触发即时扫描`);
  setTimeout(async () => {
    try {
      await runTierScan(orderId);
    } catch (e) {
      console.error(`[AF扫描] 即时扫描订单#${orderId}失败:`, e);
    }
  }, 3000); // 延迟3秒，等订单写入完成
}

/**
 * 启动定时扫描（对齐北京时间 0/4/8/12/16/20 点整点触发）
 */
export function startTierScanner() {
  // 计算下一个4小时整点（北京时间 0/4/8/12/16/20）
  function getNextAlignedMs(): number {
    const now = new Date();
    // 北京时间 = UTC+8
    const bjMs = now.getTime() + 8 * 3600 * 1000;
    const bjDate = new Date(bjMs);
    const bjHour = bjDate.getUTCHours();
    // 下一个4小时对齐点（如当前6点，下一个是8点）
    const nextBjHour = (Math.floor(bjHour / 4) + 1) * 4;
    const nextBjDate = new Date(bjMs);
    nextBjDate.setUTCHours(nextBjHour % 24, 0, 30, 0); // 整点后30秒触发，避免正好在K线切换时
    if (nextBjHour >= 24) {
      // 跨天
      nextBjDate.setUTCDate(nextBjDate.getUTCDate() + 1);
      nextBjDate.setUTCHours(0, 0, 30, 0);
    }
    // 转回实际UTC时间
    const nextUtcMs = nextBjDate.getTime() - 8 * 3600 * 1000;
    return Math.max(nextUtcMs - now.getTime(), 60 * 1000); // 最少等彔1分钟
  }

  function scheduleNext() {
    const delay = getNextAlignedMs();
    const nextTime = new Date(Date.now() + delay);
    const bjNext = new Date(nextTime.getTime() + 8 * 3600 * 1000);
    console.log(`[AF扫描] 下次扫描计划在北京时间 ${bjNext.getUTCHours().toString().padStart(2,'0')}:00（${Math.round(delay/60000)}分钟后）`);
    setTimeout(async () => {
      await runTierScan();
      scheduleNext(); // 扫描完成后安排下一次
    }, delay);
  }

  console.log("[AF扫描] 收益权档位监控已启动，对齐北京时间 0/4/8/12/16/20 点整点扫描");
  scheduleNext();
}
