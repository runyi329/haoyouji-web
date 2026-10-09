import { getDbConnection } from "./db";
import { fetchEndOfDayStockCloseSnapshots, fetchIntradayStockQuotes } from "./price-scanner";
import { ensureLedgerStockPortfolioTables, refreshLedgerStockTagCloseSnapshots, refreshLedgerStockTagIntradaySnapshots } from "./ledger-stock-portfolio";
import { getTagMarginStockSymbols, parseTagMarginRecords } from "@shared/tag-margin-assets";

type StoredManualStockClose = {
  symbol: string;
  price: number;
  currency: "USD" | "CNY";
  priceDate: string;
  source: string;
  updatedAt: string;
};

let tableReady: Promise<void> | null = null;
let dailyTimer: NodeJS.Timeout | null = null;
let intradayTimer: NodeJS.Timeout | null = null;
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

async function getTrackedSymbols(options: { includeLedger37MarginStocks?: boolean } = {}): Promise<string[]> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用，无法读取股票组合");
  const [rows] = await (conn as any).execute(`
    SELECT collateral_source
    FROM ledger_orders
    WHERE ledger_id = 52
      AND asset_type = 'stock'
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
  if (!options.includeLedger37MarginStocks) return Array.from(symbols).slice(0, 200);
  // 37号标签的股票保证金使用同一套服务端快照，不在管理员打开页面时发起第三方报价请求。
  const [marginRows] = await (conn as any).execute(`
    SELECT margin_by_coin
    FROM ledger_tag_config
    WHERE ledger_id = 37
      AND margin_by_coin IS NOT NULL
      AND margin_by_coin <> ''
  `);
  for (const row of marginRows as Array<{ margin_by_coin?: unknown }>) {
    for (const symbol of getTagMarginStockSymbols(parseTagMarginRecords(row.margin_by_coin))) symbols.add(symbol);
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
    const symbols = await getTrackedSymbols({ includeLedger37MarginStocks: true });
    if (!symbols.length) return { symbols: 0, updated: 0 };
    const quotes = await fetchEndOfDayStockCloseSnapshots(symbols);
    const conn = await getDbConnection();
    if (!conn) throw new Error("数据库连接不可用，无法保存股票盘尾快照");
    let updated = 0;
    for (const symbol of symbols) {
      const quote = quotes[symbol];
      if (!quote) continue;
      const priceDate = quote.priceDate || beijingDate();
      // A 股休市日会返回上一交易日的静态行情，不能把它误写成新的盘中更新。
      if (/^\d{6}\.(?:SH|SZ|BJ)$/.test(symbol) && priceDate !== beijingDate()) continue;
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
        [symbol, quote.price, quote.currency, priceDate, `盘尾·${quote.source}`]
      );
      updated += 1;
    }
    console.log(`[股票盘尾] ${beijingDate()}：跟踪 ${symbols.length} 只，更新 ${updated} 只`);
    return { symbols: symbols.length, updated };
  } finally {
    refreshInProgress = false;
  }
}

/**
 * 盘中每五分钟刷新52号手工股票与37号股票保证金引用的参考价。
 * 只更新当前可见价格与浮动盈亏，不创建日结记录；15:05 的独立盘尾任务仍负责固化收盘价。
 */
export async function refreshManualStockIntradaySnapshots(): Promise<{ symbols: number; updated: number }> {
  if (refreshInProgress) return { symbols: 0, updated: 0 };
  refreshInProgress = true;
  try {
    await ensureTable();
    const symbols = await getTrackedSymbols({ includeLedger37MarginStocks: true });
    if (!symbols.length) return { symbols: 0, updated: 0 };
    const quotes = await fetchIntradayStockQuotes(symbols);
    const conn = await getDbConnection();
    if (!conn) throw new Error("数据库连接不可用，无法保存股票盘中参考价");
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
        [symbol, quote.price, quote.currency, priceDate, `盘中·${quote.source}`]
      );
      updated += 1;
    }
    console.log(`[股票盘中] ${beijingDate()}：跟踪 ${symbols.length} 只，更新 ${updated} 只`);
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
    .slice(0, 100);
  if (!normalized.length) return {};
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用，无法读取股票盘尾快照");
  const placeholders = normalized.map(() => "?").join(",");
  const [rows] = await (conn as any).execute(
    `SELECT symbol, price, currency, price_date, source, updated_at
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
      source: String(row.source || ""),
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
      // 52号融资订单与37号股票标签分别持久化，绝不混写到同一快照表。
      await Promise.all([
        refreshManualStockCloseSnapshots(),
        refreshLedgerStockTagCloseSnapshots(),
      ]);
    } catch (error) {
      console.error("[股票盘尾] 同步失败:", error instanceof Error ? error.message : error);
    } finally {
      scheduleNextManualStockClose();
    }
  }, millisecondsUntilNextBeijingClose());
}

function isBeijingTradingWindow(now = new Date()): boolean {
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const day = beijing.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes();
  // A股连续竞价时段：09:30–11:30、13:00–15:00（含收盘前最后一个五分钟点）。
  return (minutes >= 9 * 60 + 30 && minutes <= 11 * 60 + 30)
    || (minutes >= 13 * 60 && minutes <= 15 * 60);
}

function millisecondsUntilNextFiveMinuteBoundary(now = new Date()): number {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(next.getUTCMinutes() + (5 - (next.getUTCMinutes() % 5)));
  return Math.max(1_000, next.getTime() - now.getTime());
}

function scheduleNextManualStockIntradayRefresh(): void {
  intradayTimer = setTimeout(async () => {
    try {
      if (isBeijingTradingWindow()) {
        await Promise.all([
          refreshManualStockIntradaySnapshots(),
          refreshLedgerStockTagIntradaySnapshots(),
        ]);
      }
    } catch (error) {
      console.error("[股票盘中] 同步失败:", error instanceof Error ? error.message : error);
    } finally {
      scheduleNextManualStockIntradayRefresh();
    }
  }, millisecondsUntilNextFiveMinuteBoundary());
}

function refreshIntradayQuotesOnStartup(): void {
  if (!isBeijingTradingWindow()) return;
  void Promise.all([
    refreshManualStockIntradaySnapshots(),
    refreshLedgerStockTagIntradaySnapshots(),
  ]).catch((error) => {
    console.error("[股票盘中] 启动即时同步失败:", error instanceof Error ? error.message : error);
  });
}

/** 启动52号订单与37号股票标签的盘中报价及每日15:05盘尾快照任务。 */
export function startManualStockCloseScheduler(): void {
  if (dailyTimer || intradayTimer) return;
  void ensureTable().catch((error) => {
    console.error("[股票盘尾] 快照表初始化失败:", error instanceof Error ? error.message : error);
  });
  void ensureLedgerStockPortfolioTables().catch((error) => {
    console.error("[37股票盘尾] 标签数据表初始化失败:", error instanceof Error ? error.message : error);
  });
  scheduleNextManualStockClose();
  // 部署或 PM2 重启发生在交易时段时，先立即取一次报价，之后再对齐每五分钟整点。
  refreshIntradayQuotesOnStartup();
  scheduleNextManualStockIntradayRefresh();
  console.log("[股票行情] 52订单、37股票标签及其股票保证金在交易时段每5分钟更新，15:05固化盘尾快照");
}
