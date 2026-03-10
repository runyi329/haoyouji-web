/**
 * af-tier-scanner.ts
 * 无损合约收益权档位扫描服务
 * - 每4小时扫描一次火币/OKX 的4小时K线最低价
 * - 与已成交买入订单的委托价格比较，触发档位记录
 * - 档位：每跌10%一档，共9档（1/1 → 1/9）
 */

import { sql } from "drizzle-orm";

// 币种 → 交易所 symbol 映射
const COIN_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

// 最近一次扫描状态（供前端查询）
const scanStatus: Record<string, {
  lastScanAt: string;
  lastLowPrice: string;
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
        const low = Math.min(...j.data.map((k: any) => k.low));
        console.log(`[AF扫描] 火币 ${coin} 4h最低价: ${low}`);
        return { low, scanFrom, scanTo: now };
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
        console.log(`[AF扫描] OKX ${coin} 4h最低价: ${low}`);
        return { low, scanFrom, scanTo: now };
      }
    }
  } catch (e) {
    console.warn(`[AF扫描] OKX获取 ${coin} 失败:`, e);
  }

  return null;
}

/**
 * 执行一次扫描：检查所有已成交买入订单，触发档位
 */
export async function runTierScan() {
  const { getDbConnection } = await import("./db");
  const conn = await getDbConnection();
  if (!conn) {
    console.warn("[AF扫描] 数据库连接失败，跳过本次扫描");
    return;
  }

  console.log("[AF扫描] 开始扫描收益权档位...");

  for (const coin of Object.keys(COIN_SYMBOLS)) {
    try {
      scanStatus[coin] = { ...scanStatus[coin], scanning: true, lastScanAt: scanStatus[coin]?.lastScanAt || "" };

      // 1. 获取4小时最低价
      const priceData = await fetch4hLowPrice(coin);
      if (!priceData) {
        console.warn(`[AF扫描] ${coin} 价格获取失败，跳过`);
        scanStatus[coin] = { scanning: false, lastScanAt: new Date().toISOString(), lastLowPrice: scanStatus[coin]?.lastLowPrice || "--" };
        continue;
      }

      const { low, scanFrom, scanTo } = priceData;
      const lowStr = low.toString();

      // 2. 记录扫描日志
      await conn.execute(
        `INSERT INTO af_price_scan_logs (coin, symbol, scan_from, scan_to, low_price, scanned_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [coin, COIN_SYMBOLS[coin], scanFrom.toISOString().slice(0, 19).replace("T", " "), scanTo.toISOString().slice(0, 19).replace("T", " "), lowStr]
      );

      // 更新扫描状态
      scanStatus[coin] = { scanning: false, lastScanAt: new Date().toISOString(), lastLowPrice: lowStr };

      // 3. 查询该币种所有已成交买入订单（无损合约）
      const [orders] = await conn.execute(
        `SELECT id, ledger_id, user_id, coin, limit_price FROM af_orders
         WHERE coin = ? AND side = 'buy' AND status = 'completed'
           AND (order_type = '无损合约' OR order_type IS NULL OR order_type = '')`,
        [coin]
      ) as any[];

      if (!Array.isArray(orders) || orders.length === 0) continue;

      for (const order of orders) {
        const buyPrice = parseFloat(order.limit_price);
        if (!buyPrice || buyPrice <= 0) continue;

        // 4. 计算当前跌幅，判断档位
        const dropPct = (buyPrice - low) / buyPrice; // 正数表示下跌
        const currentTier = Math.floor(dropPct / 0.1); // 0=未跌10%, 1=跌10-20%, ...

        if (currentTier <= 0) continue; // 未达到第1档，不触发
        const tierToTrigger = Math.min(currentTier, 9); // 最多9档

        // 5. 查询该订单已触发的最高档位
        const [existing] = await conn.execute(
          `SELECT MAX(tier) as max_tier FROM af_order_tier_triggers WHERE order_id = ?`,
          [order.id]
        ) as any[];
        const maxTriggered = parseInt(existing?.[0]?.max_tier ?? "0") || 0;

        // 6. 只触发尚未记录的新档位（不可逆）
        for (let tier = maxTriggered + 1; tier <= tierToTrigger; tier++) {
          await conn.execute(
            `INSERT INTO af_order_tier_triggers (order_id, ledger_id, coin, buy_price, tier, trigger_price, triggered_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [order.id, order.ledger_id, coin, order.limit_price, tier, lowStr]
          );
          console.log(`[AF扫描] ✅ 订单#${order.id} ${coin} 触发第${tier}档 (买入价:${buyPrice}, 当前最低:${low})`);
        }
      }
    } catch (err) {
      console.error(`[AF扫描] ${coin} 处理出错:`, err);
      scanStatus[coin] = { scanning: false, lastScanAt: new Date().toISOString(), lastLowPrice: scanStatus[coin]?.lastLowPrice || "--" };
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
