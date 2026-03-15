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

/**
 * 获取指定币种过去4小时的最低价
 * 先尝试火币，失败则用OKX
 */
async function fetch4hLowPrice(coin: string): Promise<{ low: number; scanFrom: Date; scanTo: Date } | null> {
  const symbol = COIN_SYMBOLS[coin];
  if (!symbol) return null;

  const now = new Date();
  const scanFrom = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  try {
    // 火币：获取4小时K线（最近2根，取最低价）
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

  try {
    // OKX 备用
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
  const { getDbConnection } = await import("./db");
  const conn = await getDbConnection();
  if (!conn) {
    console.warn("[AF扫描] 数据库连接失败，跳过本次扫描");
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
           AND (order_type = '无损合约' OR order_type IS NULL OR order_type = '')`;
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
 * 启动定时扫描（每4小时一次）
 */
export function startTierScanner() {
  console.log("[AF扫描] 收益权档位监控已启动，每4小时扫描一次");

  // 启动后延迟30秒执行第一次（等服务器完全启动）
  setTimeout(async () => {
    await runTierScan();
  }, 30 * 1000);

  // 之后每4小时执行一次
  setInterval(async () => {
    await runTierScan();
  }, 4 * 60 * 60 * 1000);
}
