import { getDbConnection } from "./db";
import { fetchEndOfDayStockCloseSnapshots, fetchIntradayStockQuotes } from "./price-scanner";
import { ensureLedgerStockPortfolioTables, refreshLedgerStockTagCloseSnapshots, refreshLedgerStockTagIntradaySnapshots, warmAllStockTagCalendarResults, repairPendingStockTagCalendarEvidence } from "./ledger-stock-portfolio";
import { getTagMarginStockSymbols, parseTagMarginRecords } from "@shared/tag-margin-assets";
import { captureStockUsdCnyBeforeClose } from './stock-usd-cny-rate';
import {
  getBeijingStockClock,
  getUnifiedStockCloseCandidateDates,
  getUnifiedStockCloseVersion,
  prioritizeUnifiedStockCloseCandidates,
  isUnifiedStockClosePublicationComplete,
  isUnifiedStockCloseReady,
  isUnifiedStockCloseRetryWindow,
  millisecondsUntilNextUnifiedStockClose,
} from "@shared/stock-unified-close-policy";

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
let unifiedCloseTimer: NodeJS.Timeout | null = null;
let unifiedCloseRetryTimer: NodeJS.Timeout | null = null;
let unifiedCloseTableReady: Promise<void> | null = null;
let unifiedCloseInProgress = false;
let refreshInProgress = false;
let lastUsCloseSession = '';
// 复用既有重试timer；只在当日15:05–18:05窗口内每5分钟重试，不回扫历史14日。
const UNIFIED_STOCK_CLOSE_SCHEDULER_RETRY_INTERVAL_MS = 5 * 60 * 1000;

function beijingDate(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** MySQL DATETIME 存的是北京时间；优先保留 SQL 格式化后的原始墙上时间，避免客户端时区二次偏移。 */
function databaseBeijingTimestamp(value: unknown): string {
  const raw = String(value ?? '').trim();
  const mysqlTimestamp = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  if (mysqlTimestamp) return `${mysqlTimestamp[1]}T${mysqlTimestamp[2]}+08:00`;
  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function databaseBeijingDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  const mysqlDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (mysqlDate) return mysqlDate[1];
  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
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
 * 只更新当前可见价格与浮动盈亏，不创建日结记录；37号仅A交易日15:05发布A当天+此前US收盘。
 */
export async function refreshManualStockIntradaySnapshotsForSymbols(rawSymbols: string[]): Promise<{ symbols: number; updated: number }> {
  const symbols = Array.from(new Set(rawSymbols
    .map(normalizeSymbol)
    .filter((symbol): symbol is string => !!symbol)))
    .slice(0, 200);
  if (!symbols.length) return { symbols: 0, updated: 0 };

  await ensureTable();
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
  return { symbols: symbols.length, updated };
}

export async function refreshManualStockIntradaySnapshots(): Promise<{ symbols: number; updated: number }> {
  if (refreshInProgress) return { symbols: 0, updated: 0 };
  refreshInProgress = true;
  try {
    const symbols = await getTrackedSymbols({ includeLedger37MarginStocks: true });
    const result = await refreshManualStockIntradaySnapshotsForSymbols(symbols);
    console.log(`[股票盘中] ${beijingDate()}：跟踪 ${result.symbols} 只，更新 ${result.updated} 只`);
    return result;
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
    `SELECT symbol, price, currency,
            DATE_FORMAT(price_date, '%Y-%m-%d') AS price_date_text,
            source,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_text
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
      priceDate: databaseBeijingDate(row.price_date_text ?? row.price_date),
      source: String(row.source || ""),
      updatedAt: databaseBeijingTimestamp(row.updated_at_text ?? row.updated_at),
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
  return next.getTime() - now.getTime();
}

function scheduleNextManualStockClose(): void {
  dailyTimer = setTimeout(async () => {
    try {
      // 保留52号原15:05独立采集及共用参考报价；37号日结另按市场会话验价后发布。
      await refreshManualStockCloseSnapshots();
    } catch (error) {
      console.error("[股票盘尾] 同步失败:", error instanceof Error ? error.message : error);
    } finally {
      scheduleNextManualStockClose();
    }
  }, millisecondsUntilNextBeijingClose());
}

/** 成功标记只记录后台完整发布确认；是否可跳过由publisher当前generation及目标日覆盖决定。 */
async function ensureUnifiedClosePublicationTable(): Promise<void> {
  if (!unifiedCloseTableReady) {
    unifiedCloseTableReady = (async () => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接不可用，无法读取37日结发布状态");
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_unified_close_publications (
          ledger_id INT NOT NULL,
          snapshot_date DATE NOT NULL,
          policy_version VARCHAR(96) NOT NULL,
          published_categories INT NOT NULL,
          published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (ledger_id, snapshot_date, policy_version)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((error) => {
      unifiedCloseTableReady = null;
      throw error;
    });
  }
  await unifiedCloseTableReady;
}

/**
 * 有界回查最近14个自然日，仅补已到15:05发布时间的A交易日，按旧到新发布。
 * A使用D、US使用此前最近纽约交易日（严格<D）；后台仍须验证真实常规收盘。
 * 缺报价、无效交易日、忙碌或部分标签发布均不得写成功标记。
 * 后台还须按(category,date,version)幂等，防止“写日结后进程退出”重试重复统计。
 * 有限重试只传入原A日，不建立新日期；旧价格来源表的provenance版本不在这里转写。
 */
async function refreshUnifiedStockCloseCandidates(now = new Date(), retrySnapshotDate?: string): Promise<void> {
  if (unifiedCloseInProgress) return;
  unifiedCloseInProgress = true;
  try {
    await ensureLedgerStockPortfolioTables();
    await ensureUnifiedClosePublicationTable();
    const conn = await getDbConnection();
    if (!conn) throw new Error("数据库连接不可用，无法补跑37日结");
    const candidates = retrySnapshotDate
      ? [retrySnapshotDate].filter(date => date === getBeijingStockClock(now).date
        && isUnifiedStockCloseRetryWindow(now) && isUnifiedStockCloseReady(date, now))
      : getUnifiedStockCloseCandidateDates(now);
    for (const snapshotDate of prioritizeUnifiedStockCloseCandidates(candidates, now)) {
      const version = getUnifiedStockCloseVersion(snapshotDate);
      // 全日published不能阻断历史交易新增symbol的证据补齐。每轮让publisher检查
      // cache generation == computed_generation且目标日calendar ready时轻量跳过；
      // 否则由publisher补真实历史quotes/FX缺失证据（INSERT）、markDirty + warm，保留旧immutable publication。
      try {
        const result = await refreshLedgerStockTagCloseSnapshots({ snapshotDate });
        if (!isUnifiedStockClosePublicationComplete(result, snapshotDate)) {
          console.log(`[37统一日结] ${snapshotDate}：A当天及此前US收盘证据或本版本发布确认未齐，不记成功（${version}）`);
          if (result.failures?.length) console.warn('[37统一日结缺项]', JSON.stringify(result.failures));
          continue;
        }
        await (conn as any).execute(
          `INSERT IGNORE INTO ledger_stock_unified_close_publications
           (ledger_id, snapshot_date, policy_version, published_categories, published_at)
           VALUES (37, ?, ?, ?, NOW())`,
          [snapshotDate, version, result.categories],
        );
        console.log(`[37统一日结] ${snapshotDate}：${result.categories} 个标签发布完成（${version}）`);
        // 今日完整发布后立即落可读结果，不等待其他历史日或外部历史源结束。
        if (snapshotDate === getBeijingStockClock(now).date) await warmAllStockTagCalendarResults();
      } catch (error) {
        // 单日失败不阻止后续日期；下一有限重试或下一天再补，不标成功。
        console.error(`[37统一日结] ${snapshotDate}补跑失败:`, error instanceof Error ? error.message : error);
      }
    }
    // 日历数字由后台一次预计算并持久化；即使收盘证据已经发布，启动时也补齐缺失结果。
    // warm 只更新缺失、交易已改或新日结版本的标签，不因盘中报价变化重算旧格子。
    await warmAllStockTagCalendarResults();
    // 历史补录可能早于14日回查窗口；从已存派生结果挑有限缺格补真实证据，不在用户查询时做。
    await repairPendingStockTagCalendarEvidence();
  } finally {
    unifiedCloseInProgress = false;
  }
}

function scheduleUnifiedStockCloseRetry(snapshotDate: string): void {
  const now = new Date();
  if (unifiedCloseRetryTimer || !isUnifiedStockCloseRetryWindow(now) || getBeijingStockClock(now).date !== snapshotDate) return;
  const nextAttempt = new Date(now.getTime() + UNIFIED_STOCK_CLOSE_SCHEDULER_RETRY_INTERVAL_MS);
  if (!isUnifiedStockCloseRetryWindow(nextAttempt)) return;
  unifiedCloseRetryTimer = setTimeout(() => {
    unifiedCloseRetryTimer = null;
    // 事件循环延迟越过有限窗口时不在夜间继续发布。
    if (!isUnifiedStockCloseRetryWindow() || getBeijingStockClock().date !== snapshotDate) return;
    void runUnifiedStockCloseWithRetry(snapshotDate);
  }, UNIFIED_STOCK_CLOSE_SCHEDULER_RETRY_INTERVAL_MS);
}

async function runUnifiedStockCloseWithRetry(retrySnapshotDate?: string): Promise<void> {
  const now = new Date();
  try {
    await refreshUnifiedStockCloseCandidates(now, retrySnapshotDate);
  } catch (error) {
    console.error("[37统一日结] 发布检查失败:", error instanceof Error ? error.message : error);
  } finally {
    // A交易日15:05–18:05每5分钟只重试同A日同版本；历史缺证据留待下一每日有界首试。
    scheduleUnifiedStockCloseRetry(retrySnapshotDate ?? getBeijingStockClock(now).date);
  }
}

function scheduleNextUnifiedStockClose(): void {
  unifiedCloseTimer = setTimeout(async () => {
    try {
      const now = new Date();
      // 定时首试只能在当前A日发布窗口执行；若事件循环拖到夜间，等下次A日或启动补跑。
      if (isUnifiedStockCloseRetryWindow(now)) {
        // 先保留截止时点之前的真实汇率；15:05后的报价不会被倒填成锁定值。
        await captureStockUsdCnyBeforeClose(now).catch(error => {
          console.warn('[37日结汇率采样] 未取得有效截止报价:', error instanceof Error ? error.message : '取数失败');
        });
        // 每日首试仍回查14日，但先发布当天；后续5分钟重试仍仅限当天。
        await runUnifiedStockCloseWithRetry();
      }
    } finally {
      scheduleNextUnifiedStockClose();
    }
  }, millisecondsUntilNextUnifiedStockClose());
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

function getNewYorkClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  return {
    sessionDate: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: value('weekday'),
    minutes: hour * 60 + minute,
  };
}

/** 美股常规盘 09:30–16:00（纽约时区，自动处理夏令时）。 */
function isUsTradingWindow(now = new Date()): boolean {
  const clock = getNewYorkClock(now);
  if (clock.weekday === 'Sat' || clock.weekday === 'Sun') return false;
  return clock.minutes >= 9 * 60 + 30 && clock.minutes <= 16 * 60;
}

/** 52号纽约收盘后首个十分钟采集窗口；只保存共用行情参考，不写37号日结。 */
function getUsCloseSessionToRun(now = new Date()): string | null {
  const clock = getNewYorkClock(now);
  if (clock.weekday === 'Sat' || clock.weekday === 'Sun') return null;
  return clock.minutes >= 16 * 60 && clock.minutes < 16 * 60 + 10 ? clock.sessionDate : null;
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
      // 复用原五分钟边界在截止前预采样；函数仅在A交易日14:35–15:05取数。
      await captureStockUsdCnyBeforeClose().catch(error => {
        console.warn('[37日结汇率预采样] 取数失败:', error instanceof Error ? error.message : '报价不可用');
      });
      if (isBeijingTradingWindow() || isUsTradingWindow()) {
        await Promise.all([
          refreshManualStockIntradaySnapshots(),
          refreshLedgerStockTagIntradaySnapshots(),
        ]);
      }
      const usCloseSession = getUsCloseSessionToRun();
      if (usCloseSession && usCloseSession !== lastUsCloseSession) {
        // 52号独立收盘采集不改37号日历；只有采集实际完成才标记此窗口已执行。
        await refreshManualStockCloseSnapshots();
        lastUsCloseSession = usCloseSession;
      }
    } catch (error) {
      console.error("[股票盘中] 同步失败:", error instanceof Error ? error.message : error);
    } finally {
      scheduleNextManualStockIntradayRefresh();
    }
  }, millisecondsUntilNextFiveMinuteBoundary());
}

function refreshIntradayQuotesOnStartup(): void {
  if (!isBeijingTradingWindow() && !isUsTradingWindow()) return;
  void Promise.all([
    refreshManualStockIntradaySnapshots(),
    refreshLedgerStockTagIntradaySnapshots(),
  ]).catch((error) => {
    console.error("[股票盘中] 启动即时同步失败:", error instanceof Error ? error.message : error);
  });
}

/** 52保持原独立采集；37盘中5min只估值，每个A交易日北京时间15:05统一日结。 */
export function startManualStockCloseScheduler(): void {
  if (dailyTimer || intradayTimer || unifiedCloseTimer) return;
  void ensureTable().catch((error) => {
    console.error("[股票盘尾] 快照表初始化失败:", error instanceof Error ? error.message : error);
  });
  void ensureLedgerStockPortfolioTables().catch((error) => {
    console.error("[37股票盘尾] 标签数据表初始化失败:", error instanceof Error ? error.message : error);
  });
  scheduleNextManualStockClose();
  scheduleNextUnifiedStockClose();
  // 应用启动仅补最近14个自然日窗口已到15:05发布时间的A日；不提前发今天或创建周末日结。
  void runUnifiedStockCloseWithRetry();
  // 部署或 PM2 重启发生在交易时段时，先立即取一次报价，之后再对齐每五分钟整点。
  refreshIntradayQuotesOnStartup();
  scheduleNextManualStockIntradayRefresh();
  console.log("[股票行情] 盘中每5分钟仅更新当前估值；37标签每个A股交易日北京时间15:05发布A当天D+此前最近纽约US交易日（严格<D），当天夜间US归下一A日；15:05–18:05每5分钟同日同版本有限重试，启动及每日首试有界回查14日已可发布A日，由publisher按generation及覆盖轻量跳过，周末/假期不另日结；52保留15:05及纽约16:00独立采集");
}
