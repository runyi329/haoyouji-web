import { getDbConnection } from "./db";
import { fetchEndOfDayStockCloseSnapshots } from "./price-scanner";

type StoredManualStockClose = {
  symbol: string;
  price: number;
  currency: "USD" | "CNY";
  priceDate: string;
  updatedAt: string;
};

let tableReady: Promise<void> | null = null;
let dailyTimer: NodeJS.Timeout | null = null;
let refreshInProgress = false;

function beijingDate(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeSymbol(value: unknown): string | null {
  const symbol = String(value || "").trim().toUpperCase();
  if (/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol)) return symbol;
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(symbol)) return symbol;
  return null;
}

async function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接不可用，无法初始化股票盘尾快照");
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS funder_manual_stock_close_snapshots (
          symbol VARCHAR(20) NOT NULL PRIMARY KEY,
          price DECIMAL(20,8) NOT NULL,
          currency VARCHAR(8) NOT NULL,
          price_date DATE NOT NULL,
          source VARCHAR(64) NOT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_funder_manual_stock_close_date (price_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

async function getTrackedSymbols(): Promise<string[]> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用，无法读取股票组合");
  const [rows] = await (conn as any).execute(`
    SELECT collateral_source
    FROM ledger_orders
    WHERE asset_type = 'stock'
      AND status = 'active'
      AND collateral_source IS NOT NULL
  `);
  const symbols = new Set<string>();
  for (const row of rows as Array<{ collateral_source?: unknown }>) {
    try {
      const source = typeof row.collateral_source === "string"
        ? JSON.parse(row.collateral_source)
        : row.collateral_source;
      if (source?.stockPnlSource !== "manual_positions" || !Array.isArray(source?.stockPositions)) continue;
      for (const position of source.stockPositions) {
        const symbol = normalizeSymbol(position?.symbol);
        if (symbol) symbols.add(symbol);
      }
    } catch {
      // 单张历史订单的数据异常不能阻断其他订单的盘尾快照。
    }
  }
  return Array.from(symbols).slice(0, 200);
}

/**
 * 每日盘尾同步已被融资订单引用的手工股票代码。
 * 写入的是收盘价快照，不在用户打开订单时访问第三方报价服务。
 */
export async function refreshManualStockCloseSnapshots(): Promise<{ symbols: number; updated: number }> {
  if (refreshInProgress) return { symbols: 0, updated: 0 };
  refreshInProgress = true;
  try {
    await ensureTable();
    const symbols = await getTrackedSymbols();
    if (!symbols.length) return { symbols: 0, updated: 0 };
    const quotes = await fetchEndOfDayStockCloseSnapshots(symbols);
    const conn = await getDbConnection();
    if (!conn) throw new Error("数据库连接不可用，无法保存股票盘尾快照");
    let updated = 0;
    for (const symbol of symbols) {
      const quote = quotes[symbol];
      if (!quote) continue;
      const priceDate = quote.priceDate || beijingDate();
      await (conn as any).execute(
        `INSERT INTO funder_manual_stock_close_snapshots
          (symbol, price, currency, price_date, source, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           price = VALUES(price),
           currency = VALUES(currency),
           price_date = VALUES(price_date),
           source = VALUES(source),
           updated_at = NOW()`,
        [symbol, quote.price, quote.currency, priceDate, quote.source]
      );
      updated += 1;
    }
    console.log(`[股票盘尾] ${beijingDate()}：跟踪 ${symbols.length} 只，更新 ${updated} 只`);
    return { symbols: symbols.length, updated };
  } finally {
    refreshInProgress = false;
  }
}

/** 订单卡片和实时预览只读取已保存的盘尾快照，不触发第三方请求。 */
export async function getManualStockCloseSnapshots(symbols: string[]): Promise<Record<string, StoredManualStockClose>> {
  await ensureTable();
  const normalized = Array.from(new Set(symbols
    .map(normalizeSymbol)
    .filter((symbol): symbol is string => !!symbol)))
    .slice(0, 20);
  if (!normalized.length) return {};
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用，无法读取股票盘尾快照");
  const placeholders = normalized.map(() => "?").join(",");
  const [rows] = await (conn as any).execute(
    `SELECT symbol, price, currency, price_date, updated_at
     FROM funder_manual_stock_close_snapshots
     WHERE symbol IN (${placeholders})`,
    normalized
  );
  const result: Record<string, StoredManualStockClose> = {};
  for (const row of rows as any[]) {
    const symbol = normalizeSymbol(row.symbol);
    const price = Number(row.price);
    const currency = String(row.currency || "USD").toUpperCase() === "CNY" ? "CNY" : "USD";
    if (!symbol || !Number.isFinite(price) || price <= 0) continue;
    result[symbol] = {
      symbol,
      price,
      currency,
      priceDate: String(row.price_date || "").slice(0, 10),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
    };
  }
  return result;
}

function millisecondsUntilNextBeijingClose(): number {
  const now = new Date();
  // 北京 15:05 = UTC 07:05。无需依赖服务器本地时区。
  const next = new Date(now);
  next.setUTCHours(7, 5, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  // 周末不触发；节假日若没有日线，任务会保留上一笔盘尾快照而不覆盖。
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleNextManualStockClose(): void {
  dailyTimer = setTimeout(async () => {
    try {
      await refreshManualStockCloseSnapshots();
    } catch (error) {
      console.error("[股票盘尾] 同步失败:", error instanceof Error ? error.message : error);
    } finally {
      scheduleNextManualStockClose();
    }
  }, millisecondsUntilNextBeijingClose());
}

/** 启动一次每日北京时间 15:05 的盘尾快照任务；不做盘中轮询。 */
export function startManualStockCloseScheduler(): void {
  if (dailyTimer) return;
  void ensureTable().catch((error) => {
    console.error("[股票盘尾] 快照表初始化失败:", error instanceof Error ? error.message : error);
  });
  scheduleNextManualStockClose();
  console.log("[股票盘尾] 每日北京时间 15:05 收盘价快照任务已启动");
}
