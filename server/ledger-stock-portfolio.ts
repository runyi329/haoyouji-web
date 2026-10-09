import { getDbConnection, getDbTransactionConnection } from "./db";
import { fetchEndOfDayStockCloseSnapshots, fetchIntradayStockQuotes, searchManualAshareStocks } from "./price-scanner";

export type StockEventType = "buy" | "add" | "reduce" | "sell" | "note";
export type AccountingMode = "manual_balance" | "stock_portfolio";

type Access = {
  categoryId: number;
  ledgerId: number;
  categoryName: string;
  canEdit: boolean;
};

type StoredQuote = {
  symbol: string;
  price: number;
  priceDate: string;
  updatedAt: string;
};

let tablesReady: Promise<void> | null = null;
let closeRefreshInProgress = false;
let intradayRefreshInProgress = false;

const STOCK_LEDGER_ID = 37;
const EPSILON = 0.00000001;

function asRows(result: any): any[] {
  if (Array.isArray(result?.[0])) return result[0];
  return Array.isArray(result) ? result : [];
}

function beijingDate(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeSymbol(value: unknown): string {
  const raw = String(value || "").trim().toUpperCase();
  if (!/^\d{6}\.(SH|SZ|BJ)$/.test(raw)) {
    throw new Error("仅支持已核验的 A 股六码代码");
  }
  return raw;
}

function toIso(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStoredDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error("日期格式无效");
  // mysql2 returns MySQL DATE columns as Date objects.  In production these
  // objects represent midnight in the database/server time zone; slicing the
  // UTC ISO string turns Beijing's 2026-09-28 into 2026-09-27.  All 37 stock
  // settlement dates are business dates in Beijing, so preserve that calendar
  // day explicitly instead of deriving it in UTC.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("日期格式无效");
  return `${year}-${month}-${day}`;
}

/**
 * This migration is deliberately independent from financing-order stock data.
 * It adds an immutable category mode and dedicated append-only portfolio tables.
 */
export async function ensureLedgerStockPortfolioTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接不可用，无法初始化股票标签");

      const [modeColumns] = await (conn as any).execute(
        `SELECT COLUMN_NAME FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'ledger_categories'
           AND column_name = 'accounting_mode'`,
      );
      if ((modeColumns as any[]).length === 0) {
        await (conn as any).execute(
          `ALTER TABLE ledger_categories
           ADD COLUMN accounting_mode ENUM('manual_balance','stock_portfolio')
           NOT NULL DEFAULT 'manual_balance'
           COMMENT '37标签创建时固定的核算方式'`,
        );
      }

      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_events (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          category_id INT NOT NULL,
          event_type ENUM('buy','add','reduce','sell','note') NOT NULL,
          symbol VARCHAR(16) NULL,
          stock_name VARCHAR(80) NULL,
          quantity DECIMAL(24,8) NULL,
          execution_price DECIMAL(20,8) NULL,
          actual_traded_at DATETIME NULL COMMENT '管理员确认的实际成交/接单时间',
          server_registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '服务器登记时间',
          market_reference_price DECIMAL(20,8) NULL COMMENT '登记时服务器查询的参考价',
          market_reference_at DATETIME NULL COMMENT '登记时参考价时间',
          note TEXT NULL,
          created_by INT NOT NULL,
          status ENUM('active','voided') NOT NULL DEFAULT 'active',
          voided_at DATETIME NULL,
          voided_by INT NULL,
          void_reason VARCHAR(300) NULL,
          corrects_event_id BIGINT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ledger_stock_events_tag (ledger_id, category_id, status, actual_traded_at, id),
          INDEX idx_ledger_stock_events_symbol (category_id, symbol, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_lots (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          category_id INT NOT NULL,
          symbol VARCHAR(16) NOT NULL,
          stock_name VARCHAR(80) NOT NULL,
          opened_event_id BIGINT NOT NULL,
          opened_at DATETIME NOT NULL,
          initial_quantity DECIMAL(24,8) NOT NULL,
          unit_cost DECIMAL(20,8) NOT NULL,
          note TEXT NULL COMMENT '持仓编号的管理员批次备注',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger_stock_lots_opened_event (opened_event_id),
          INDEX idx_ledger_stock_lots_tag_symbol (category_id, symbol, opened_at, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 批次备注独立于不可变的成交审计备注。已有批次读取时会回退到开仓事件的 note，
      // 管理员后续编辑只更新此字段，不会作废或重建任何股票成交记录。
      const [lotNoteColumnRows] = await (conn as any).execute(
        `SELECT COLUMN_NAME FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'ledger_stock_lots'
           AND column_name = 'note'`,
      );
      if ((lotNoteColumnRows as any[]).length === 0) {
        await (conn as any).execute(
          `ALTER TABLE ledger_stock_lots
           ADD COLUMN note TEXT NULL COMMENT '持仓编号的管理员批次备注' AFTER unit_cost`,
        );
      }

      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_event_lot_allocations (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          event_id BIGINT NOT NULL,
          lot_id BIGINT NOT NULL,
          quantity DECIMAL(24,8) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger_stock_event_lot_allocation (event_id, lot_id),
          INDEX idx_ledger_stock_alloc_lot (lot_id),
          INDEX idx_ledger_stock_alloc_event (event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_price_snapshots (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          category_id INT NOT NULL,
          symbol VARCHAR(16) NOT NULL,
          price DECIMAL(20,8) NOT NULL,
          price_date DATE NOT NULL,
          captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger_stock_price_snapshot (category_id, symbol, price_date),
          INDEX idx_ledger_stock_price_latest (category_id, symbol, price_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 盘中报价与15:05日结报价分表保存：盘中价格只影响当前市值，不能伪造当日历史快照。
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_intraday_quotes (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          category_id INT NOT NULL,
          symbol VARCHAR(16) NOT NULL,
          price DECIMAL(20,8) NOT NULL,
          price_date DATE NOT NULL,
          captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger_stock_intraday_quote (category_id, symbol),
          INDEX idx_ledger_stock_intraday_latest (category_id, price_date, captured_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_daily_snapshots (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          category_id INT NOT NULL,
          snapshot_date DATE NOT NULL,
          market_value DECIMAL(24,8) NOT NULL,
          cost_value DECIMAL(24,8) NOT NULL,
          floating_pnl DECIMAL(24,8) NOT NULL,
          realized_pnl DECIMAL(24,8) NOT NULL,
          total_pnl DECIMAL(24,8) NOT NULL,
          position_count INT NOT NULL DEFAULT 0,
          captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger_stock_daily_snapshot (category_id, snapshot_date),
          INDEX idx_ledger_stock_daily_tag_date (category_id, snapshot_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 每位成员对每个全局买入批次的参与股数。它不是标签“初始金额”：
      // 进入后的盈亏只从该次分配的参考价开始计算，买卖资金本身不会被当成盈亏。
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_lot_participations (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          category_id INT NOT NULL,
          lot_id BIGINT NOT NULL,
          user_id INT NOT NULL,
          allocated_quantity DECIMAL(24,8) NOT NULL,
          remaining_quantity DECIMAL(24,8) NOT NULL,
          entry_price DECIMAL(20,8) NOT NULL,
          assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          assigned_by INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger_stock_lot_participation (lot_id, user_id),
          INDEX idx_ledger_stock_participation_tag_user (category_id, user_id),
          INDEX idx_ledger_stock_participation_lot (lot_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 参与日期属于“成员 × 股票批次”，不能复用标签级初始金额日期。
      // 保留为空的历史记录在读取时回退到该批次实际成交日，避免迁移覆盖旧配置。
      const [participationColumnRows] = await (conn as any).execute(
        `SELECT COLUMN_NAME FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'ledger_stock_lot_participations'
           AND column_name IN ('start_date', 'pause_date')`,
      );
      const participationColumns = new Set((participationColumnRows as any[]).map((row: any) => String(row.COLUMN_NAME || row.column_name)));
      if (!participationColumns.has('start_date')) {
        await (conn as any).execute(
          `ALTER TABLE ledger_stock_lot_participations
           ADD COLUMN start_date DATE NULL COMMENT '成员本股票批次开始参与日期' AFTER entry_price`,
        );
      }
      if (!participationColumns.has('pause_date')) {
        await (conn as any).execute(
          `ALTER TABLE ledger_stock_lot_participations
           ADD COLUMN pause_date DATE NULL COMMENT '成员本股票批次暂停日期' AFTER start_date`,
        );
      }

      // 卖出只追加关闭明细；已卖出的参与股数永远不回到可编辑的分配行。
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_participation_closures (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          participation_id BIGINT NOT NULL,
          sell_event_id BIGINT NOT NULL,
          quantity DECIMAL(24,8) NOT NULL,
          sale_price DECIMAL(20,8) NOT NULL,
          closed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger_stock_participation_closure (participation_id, sell_event_id),
          INDEX idx_ledger_stock_participation_closure_event (sell_event_id),
          INDEX idx_ledger_stock_participation_closure_participation (participation_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  await tablesReady;
}

async function assertStockTagAccess(
  ledgerId: number,
  categoryId: number,
  userId: number,
  systemRole?: string,
  write = false,
): Promise<Access> {
  await ensureLedgerStockPortfolioTables();
  if (ledgerId !== STOCK_LEDGER_ID) {
    throw new Error("股票持仓标签仅适用于37号账本");
  }
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");

  const [categoryRows] = await (conn as any).execute(
    `SELECT id, ledgerId, name, parentId, accounting_mode
     FROM ledger_categories
     WHERE id = ? AND ledgerId = ? LIMIT 1`,
    [categoryId, ledgerId],
  );
  const category = (categoryRows as any[])[0];
  if (!category || category.parentId !== null || category.accounting_mode !== "stock_portfolio") {
    throw new Error("该标签不是股票持仓模式");
  }

  const [memberRows] = await (conn as any).execute(
    `SELECT role, initial_balances AS initialBalances FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1`,
    [ledgerId, userId],
  );
  const member = (memberRows as any[])[0];
  const isSystemAdmin = systemRole === "admin" || systemRole === "super_admin";
  if (!member && !isSystemAdmin) throw new Error("您不是此账本的成员");

  // Keep the existing 37 tag visibility policy intact; a hidden tag cannot be accessed by guessing its ID.
  if (member && member.role !== "owner") {
    try {
      const balances = member.initialBalances ? JSON.parse(member.initialBalances) : {};
      if (Number(balances[`${category.name}__visible`]) === 0) {
        throw new Error("您无权查看此标签");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "您无权查看此标签") throw error;
    }
  }

  const canEdit = isSystemAdmin || member?.role === "owner" || member?.role === "admin";
  if (write && !canEdit) throw new Error("仅37号账本管理员可以维护股票持仓");
  return { categoryId, ledgerId, categoryName: String(category.name), canEdit };
}

export async function getStockTagMode(input: {
  ledgerId: number;
  categoryId: number;
  userId: number;
  systemRole?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole);
  return { accountingMode: "stock_portfolio" as const, categoryName: access.categoryName, canEdit: access.canEdit };
}

async function getActiveLots(categoryId: number, symbol?: string) {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const params: any[] = [categoryId];
  const symbolCondition = symbol ? " AND l.symbol = ?" : "";
  if (symbol) params.push(symbol);
  const [rows] = await (conn as any).execute(
    `SELECT l.id, l.symbol, l.stock_name, l.opened_event_id, l.opened_at,
            l.initial_quantity, l.unit_cost,
            COALESCE(l.note, opening_event.note, '') AS note,
            COALESCE(SUM(CASE WHEN e.status = 'active' THEN a.quantity ELSE 0 END), 0) AS allocated_quantity
     FROM ledger_stock_lots l
     INNER JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id
     LEFT JOIN ledger_stock_event_lot_allocations a ON a.lot_id = l.id
     LEFT JOIN ledger_stock_events e ON e.id = a.event_id
     WHERE l.category_id = ? AND opening_event.status = 'active'${symbolCondition}
     GROUP BY l.id
     ORDER BY l.opened_at ASC, l.id ASC`,
    params,
  );
  return (rows as any[]).map((row) => ({
    id: Number(row.id),
    symbol: String(row.symbol),
    stockName: String(row.stock_name),
    openedEventId: Number(row.opened_event_id),
    openedAt: toIso(row.opened_at),
    initialQuantity: numberValue(row.initial_quantity),
    unitCost: numberValue(row.unit_cost),
    note: String(row.note || ""),
    allocatedQuantity: numberValue(row.allocated_quantity),
    remainingQuantity: Math.max(0, numberValue(row.initial_quantity) - numberValue(row.allocated_quantity)),
  }));
}

async function getLatestQuotes(categoryId: number, symbols: string[]): Promise<Record<string, StoredQuote>> {
  if (symbols.length === 0) return {};
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const unique = Array.from(new Set(symbols));
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await (conn as any).execute(
    `SELECT s.symbol, s.price, s.price_date, s.captured_at
     FROM ledger_stock_price_snapshots s
     INNER JOIN (
       SELECT symbol, MAX(price_date) AS max_price_date
       FROM ledger_stock_price_snapshots
       WHERE category_id = ? AND symbol IN (${placeholders})
       GROUP BY symbol
     ) latest ON latest.symbol = s.symbol AND latest.max_price_date = s.price_date
     WHERE s.category_id = ?`,
    [categoryId, ...unique, categoryId],
  );
  const result: Record<string, StoredQuote> = {};
  for (const row of rows as any[]) {
    const price = numberValue(row.price);
    if (price > 0) {
      result[String(row.symbol)] = {
        symbol: String(row.symbol),
        price,
        priceDate: normalizeStoredDate(row.price_date) || "",
        updatedAt: toIso(row.captured_at),
      };
    }
  }
  return result;
}

/** 只返回当日盘中报价；跨日残留不能覆盖上一交易日的正式盘尾价。 */
async function getLatestIntradayQuotes(categoryId: number, symbols: string[]): Promise<Record<string, StoredQuote>> {
  if (symbols.length === 0) return {};
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const unique = Array.from(new Set(symbols));
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await (conn as any).execute(
    `SELECT symbol, price, price_date, captured_at
     FROM ledger_stock_intraday_quotes
     WHERE category_id = ? AND price_date = ? AND symbol IN (${placeholders})`,
    [categoryId, beijingDate(), ...unique],
  );
  const result: Record<string, StoredQuote> = {};
  for (const row of rows as any[]) {
    const price = numberValue(row.price);
    if (price > 0) {
      result[String(row.symbol)] = {
        symbol: String(row.symbol),
        price,
        priceDate: normalizeStoredDate(row.price_date) || "",
        updatedAt: toIso(row.captured_at),
      };
    }
  }
  return result;
}

/** 同一交易日内以更晚时间为准，让15:05盘尾价优先替代15:00盘中参考价。 */
function mergeLatestQuoteMaps(...maps: Array<Record<string, StoredQuote>>): Record<string, StoredQuote> {
  const result: Record<string, StoredQuote> = {};
  for (const map of maps) {
    for (const [symbol, quote] of Object.entries(map)) {
      const current = result[symbol];
      if (!current
        || quote.priceDate > current.priceDate
        || (quote.priceDate === current.priceDate && quote.updatedAt >= current.updatedAt)) {
        result[symbol] = quote;
      }
    }
  }
  return result;
}

async function getLatestReferenceQuotes(categoryId: number): Promise<Record<string, StoredQuote>> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT e.symbol, e.market_reference_price, e.market_reference_at
     FROM ledger_stock_events e
     INNER JOIN (
       SELECT symbol, MAX(id) AS max_id
       FROM ledger_stock_events
       WHERE category_id = ? AND status = 'active' AND symbol IS NOT NULL
         AND market_reference_price IS NOT NULL
       GROUP BY symbol
     ) latest ON latest.max_id = e.id
     WHERE e.category_id = ?`,
    [categoryId, categoryId],
  );
  const result: Record<string, StoredQuote> = {};
  for (const row of rows as any[]) {
    const price = numberValue(row.market_reference_price);
    if (price > 0 && row.symbol) {
      result[String(row.symbol)] = {
        symbol: String(row.symbol),
        price,
        priceDate: toIso(row.market_reference_at).slice(0, 10),
        updatedAt: toIso(row.market_reference_at),
      };
    }
  }
  return result;
}

async function getRealizedPnl(categoryId: number): Promise<number> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT e.id, e.quantity, e.execution_price,
            COALESCE(SUM(a.quantity * l.unit_cost), 0) AS allocated_cost
     FROM ledger_stock_events e
     LEFT JOIN ledger_stock_event_lot_allocations a ON a.event_id = e.id
     LEFT JOIN ledger_stock_lots l ON l.id = a.lot_id
     WHERE e.category_id = ? AND e.status = 'active'
       AND e.event_type IN ('reduce','sell')
     GROUP BY e.id`,
    [categoryId],
  );
  return (rows as any[]).reduce((total, row) => {
    const proceeds = numberValue(row.quantity) * numberValue(row.execution_price);
    return total + proceeds - numberValue(row.allocated_cost);
  }, 0);
}

async function getEventHistory(categoryId: number, limit = 500) {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  // This production MySQL/MariaDB endpoint rejects a bound LIMIT parameter in prepared statements.
  // The value is clamped locally before interpolation, so it remains non-user-injectable.
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  const [rows] = await (conn as any).execute(
    `SELECT e.*, u.name AS admin_name, u.username AS admin_username,
            corrected.id AS corrected_event_id
     FROM ledger_stock_events e
     LEFT JOIN users u ON u.id = e.created_by
     LEFT JOIN ledger_stock_events corrected ON corrected.corrects_event_id = e.id
     WHERE e.category_id = ?
     ORDER BY COALESCE(e.actual_traded_at, e.server_registered_at) DESC, e.id DESC
     LIMIT ${safeLimit}`,
    [categoryId],
  );
  return (rows as any[]).map((row) => ({
    id: Number(row.id),
    type: row.event_type as StockEventType,
    symbol: row.symbol || null,
    stockName: row.stock_name || null,
    quantity: row.quantity === null ? null : numberValue(row.quantity),
    executionPrice: row.execution_price === null ? null : numberValue(row.execution_price),
    actualTradedAt: toIso(row.actual_traded_at),
    serverRegisteredAt: toIso(row.server_registered_at),
    marketReferencePrice: row.market_reference_price === null ? null : numberValue(row.market_reference_price),
    marketReferenceAt: toIso(row.market_reference_at),
    note: row.note || "",
    adminName: row.admin_name || row.admin_username || `管理员#${row.created_by}`,
    status: row.status as "active" | "voided",
    voidedAt: toIso(row.voided_at),
    voidReason: row.void_reason || "",
    correctsEventId: row.corrects_event_id ? Number(row.corrects_event_id) : null,
    correctedEventId: row.corrected_event_id ? Number(row.corrected_event_id) : null,
  }));
}

async function getLatestDailySnapshots(categoryId: number) {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT snapshot_date, market_value, cost_value, floating_pnl, realized_pnl, total_pnl, position_count, captured_at
     FROM ledger_stock_daily_snapshots
     WHERE category_id = ?
     ORDER BY snapshot_date DESC
     LIMIT 2`,
    [categoryId],
  );
  return (rows as any[]).map((row) => ({
    snapshotDate: normalizeStoredDate(row.snapshot_date) || "",
    marketValue: numberValue(row.market_value),
    costValue: numberValue(row.cost_value),
    floatingPnl: numberValue(row.floating_pnl),
    realizedPnl: numberValue(row.realized_pnl),
    totalPnl: numberValue(row.total_pnl),
    positionCount: Number(row.position_count || 0),
    capturedAt: toIso(row.captured_at),
  }));
}

async function buildPortfolio(categoryId: number) {
  const allLots = await getActiveLots(categoryId);
  const symbols = allLots.map((lot) => lot.symbol);
  const [referenceQuotes, storedQuotes, intradayQuotes] = await Promise.all([
    getLatestReferenceQuotes(categoryId),
    getLatestQuotes(categoryId, symbols),
    getLatestIntradayQuotes(categoryId, symbols),
  ]);
  const quoteMap = mergeLatestQuoteMaps(referenceQuotes, storedQuotes, intradayQuotes);
  const positionMap = new Map<string, any>();

  for (const lot of allLots) {
    const current = positionMap.get(lot.symbol) || {
      symbol: lot.symbol,
      stockName: lot.stockName,
      quantity: 0,
      costValue: 0,
      lots: [],
    };
    current.quantity += lot.remainingQuantity;
    current.costValue += lot.remainingQuantity * lot.unitCost;
    current.lots.push({
      id: lot.id,
      openedEventId: lot.openedEventId,
      openedAt: lot.openedAt,
      quantity: lot.remainingQuantity,
      unitCost: lot.unitCost,
      note: lot.note,
    });
    positionMap.set(lot.symbol, current);
  }

  const positions = Array.from(positionMap.values()).map((position) => {
    const quote = quoteMap[position.symbol];
    const marketPrice = quote?.price ?? null;
    const marketValue = marketPrice === null ? null : position.quantity * marketPrice;
    const floatingPnl = marketValue === null ? null : marketValue - position.costValue;
    return {
      ...position,
      quantity: Number(position.quantity.toFixed(8)),
      costValue: Number(position.costValue.toFixed(8)),
      averageCost: position.quantity > EPSILON ? position.costValue / position.quantity : 0,
      marketPrice,
      marketValue,
      floatingPnl,
      quoteDate: quote?.priceDate || null,
      quoteUpdatedAt: quote?.updatedAt || null,
      hasPrice: marketPrice !== null,
    };
  }).filter((position) => position.quantity > EPSILON);

  const closedLots = allLots
    .filter((lot) => lot.remainingQuantity <= EPSILON)
    .map((lot) => ({
      symbol: lot.symbol,
      stockName: lot.stockName,
      openedAt: lot.openedAt,
      initialQuantity: lot.initialQuantity,
      unitCost: lot.unitCost,
    }));

  const realizedPnl = await getRealizedPnl(categoryId);
  const costValue = positions.reduce((total, row) => total + row.costValue, 0);
  const pricedPositions = positions.filter((row) => row.marketValue !== null);
  const hasUnpricedPositions = positions.length !== pricedPositions.length;
  const marketValue = positions.reduce((total, row) => total + (row.marketValue ?? 0), 0);
  const floatingPnl = pricedPositions.reduce((total, row) => total + (row.floatingPnl ?? 0), 0);
  const dailySnapshots = await getLatestDailySnapshots(categoryId);
  const latestSnapshot = dailySnapshots[0] || null;
  const priorSnapshot = dailySnapshots[1] || null;
  // 当日盈亏必须比较两个盘尾的累计盈亏，不能直接比较总市值：新开仓、加仓或
  // 减仓会改变市值，但新增/收回的本金不是当天的盈亏。例如 R1 在 9 月 29 日
  // 新增约 55.6 万持仓，市值差额不应被误报为 +55 万当日盈利。
  const dailyChange = latestSnapshot && priorSnapshot ? latestSnapshot.totalPnl - priorSnapshot.totalPnl : null;
  const dailyChangePercent = dailyChange !== null && priorSnapshot && Math.abs(priorSnapshot.costValue) > EPSILON
    ? dailyChange / priorSnapshot.costValue
    : null;

  return {
    positions,
    closedLots,
    summary: {
      // Never display or persist a partial portfolio aggregate as though missing prices were zero.
      marketValue: hasUnpricedPositions ? null : marketValue,
      costValue,
      floatingPnl: hasUnpricedPositions ? null : floatingPnl,
      realizedPnl,
      totalPnl: hasUnpricedPositions ? null : floatingPnl + realizedPnl,
      positionCount: positions.length,
      unpricedPositionCount: positions.length - pricedPositions.length,
      dailyChange,
      dailyChangePercent,
      latestSnapshot,
      priorSnapshot,
    },
  };
}

export async function getStockTagPortfolio(input: {
  ledgerId: number;
  categoryId: number;
  userId: number;
  systemRole?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole);
  const [portfolio, history] = await Promise.all([
    buildPortfolio(access.categoryId),
    getEventHistory(access.categoryId),
  ]);
  // The administrator UI needs this only to label its own allocation inside the
  // full member allocation matrix.  Access remains enforced server-side.
  return { ...access, viewerUserId: input.userId, accountingMode: "stock_portfolio" as const, ...portfolio, history };
}

/**
 * Reads a whole tag's current market value after confirming stock_portfolio mode.
 * Financing-order references intentionally bypass member-view filtering, while
 * preserving the strict split between stock_portfolio and manual_balance tags.
 */
export async function getStockTagCurrentMarketValue(input: {
  ledgerId: number;
  categoryId: number;
}): Promise<{ value: number; priceDate: string | null; updatedAt: string | null } | null> {
  if (input.ledgerId !== STOCK_LEDGER_ID) return null;
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT id, accounting_mode
     FROM ledger_categories
     WHERE id = ? AND ledgerId = ? AND parentId IS NULL
     LIMIT 1`,
    [input.categoryId, input.ledgerId],
  );
  const category = (rows as any[])[0];
  if (!category || category.accounting_mode !== "stock_portfolio") return null;
  const portfolio = await buildPortfolio(Number(category.id));
  if (portfolio.summary.marketValue === null) return null;
  const priceDates = portfolio.positions
    .map((position) => position.quoteDate)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();
  const updatedTimes = portfolio.positions
    .map((position) => position.quoteUpdatedAt)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();
  return {
    value: portfolio.summary.marketValue,
    priceDate: priceDates.at(-1) || portfolio.summary.latestSnapshot?.snapshotDate || null,
    updatedAt: updatedTimes.at(-1) || portfolio.summary.latestSnapshot?.capturedAt || null,
  };
}

/**
 * Read-only tag-wide market view for a member who already has an eligible
 * allocation.  This deliberately exposes aggregate holdings only; all write
 * controls remain governed by the existing administrator procedure.
 */
export async function getStockTagPublicPortfolio(input: {
  ledgerId: number;
  categoryId: number;
  userId: number;
  systemRole?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole);
  const memberPortfolio = await buildMemberStockPortfolio(access.categoryId, input.userId);
  if (!memberPortfolio.isEligible && !access.canEdit) throw new Error("该股票标签尚未对您开放");
  const portfolio = await buildPortfolio(access.categoryId);
  // 批次备注是管理员维护信息；成员只需看到已分配批次的价格与数量，不能读取备注。
  const publicPositions = portfolio.positions.map((position) => ({
    ...position,
    lots: position.lots.map(({ note: _note, ...lot }: any) => lot),
  }));
  return { ...access, accountingMode: "stock_portfolio" as const, ...portfolio, positions: publicPositions, history: [] as any[] };
}

/**
 * A member's view is deliberately separate from the administrator's tag-wide
 * portfolio.  A member's baseline is each allocated lot's entry price and
 * start date, never the tag's (non-existent) manual initial balance.
 */
async function buildMemberStockPortfolio(categoryId: number, userId: number) {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT p.id, p.lot_id, p.allocated_quantity, p.remaining_quantity, p.entry_price,
            p.start_date, p.pause_date, p.assigned_at,
            l.symbol, l.stock_name, l.opened_at, l.initial_quantity, l.unit_cost,
            COALESCE(SUM(c.quantity), 0) AS closed_quantity,
            COALESCE(SUM(c.quantity * (p.entry_price - c.sale_price)), 0) AS realized_pnl
     FROM ledger_stock_lot_participations p
     INNER JOIN ledger_stock_lots l ON l.id = p.lot_id
     LEFT JOIN ledger_stock_participation_closures c ON c.participation_id = p.id
     WHERE p.category_id = ? AND p.user_id = ? AND p.allocated_quantity > 0
     GROUP BY p.id
     ORDER BY COALESCE(p.start_date, DATE(l.opened_at)) ASC, p.assigned_at ASC, p.id ASC`,
    [categoryId, userId],
  );

  const today = beijingDate();
  const participations = (rows as any[]).map((row) => {
    const startDate = normalizeStoredDate(row.start_date) || normalizeStoredDate(row.opened_at) || today;
    const pauseDate = normalizeStoredDate(row.pause_date);
    const allocatedQuantity = numberValue(row.allocated_quantity);
    const remainingQuantity = numberValue(row.remaining_quantity);
    const lotInitialQuantity = numberValue(row.initial_quantity);
    return {
      id: Number(row.id),
      lotId: Number(row.lot_id),
      symbol: String(row.symbol),
      stockName: String(row.stock_name),
      openedAt: toIso(row.opened_at),
      startDate,
      pauseDate,
      allocatedQuantity,
      remainingQuantity,
      closedQuantity: numberValue(row.closed_quantity),
      entryPrice: numberValue(row.entry_price),
      lotInitialQuantity,
      allocationRatio: lotInitialQuantity > EPSILON ? allocatedQuantity / lotInitialQuantity : 0,
      realizedPnl: numberValue(row.realized_pnl),
    };
  });
  const visibleParticipations = participations.filter((item) => item.startDate <= today);
  const activeParticipations = visibleParticipations.filter((item) => item.remainingQuantity > EPSILON);
  const symbols = Array.from(new Set(activeParticipations.map((item) => item.symbol)));
  // 当前浮盈可读取当日盘中报价；按日历史与日历仍只使用15:05盘尾快照。
  // 买入审计已保存的参考价仅作为“没有任何已存价格”的最后回退，不能覆盖盘中或盘尾报价。
  // 这样盘后新登记的股票在下一个15:05盘尾前，个人概览仍可按可追溯的登记参考价计算。
  const [referenceQuotes, storedQuotes, intradayQuotes] = await Promise.all([
    getLatestReferenceQuotes(categoryId),
    getLatestQuotes(categoryId, symbols),
    getLatestIntradayQuotes(categoryId, symbols),
  ]);
  const quotes = mergeLatestQuoteMaps(referenceQuotes, storedQuotes, intradayQuotes);
  const grouped = new Map<string, any>();
  for (const item of activeParticipations) {
    const current = grouped.get(item.symbol) || {
      symbol: item.symbol,
      stockName: item.stockName,
      quantity: 0,
      costValue: 0,
      lots: [],
      realizedPnl: 0,
    };
    current.quantity += item.remainingQuantity;
    current.costValue += item.remainingQuantity * item.entryPrice;
    current.realizedPnl += item.realizedPnl;
    current.lots.push({
      id: item.lotId,
      participationId: item.id,
      openedAt: item.openedAt,
      startDate: item.startDate,
      pauseDate: item.pauseDate,
      quantity: item.remainingQuantity,
      allocatedQuantity: item.allocatedQuantity,
      allocationRatio: item.allocationRatio,
      entryPrice: item.entryPrice,
      unitCost: item.entryPrice,
    });
    grouped.set(item.symbol, current);
  }
  const positions = Array.from(grouped.values()).map((position) => {
    const quote = quotes[position.symbol];
    const marketPrice = quote?.price ?? null;
    const marketValue = marketPrice === null ? null : position.quantity * marketPrice;
    return {
      ...position,
      quantity: Number(position.quantity.toFixed(8)),
      costValue: Number(position.costValue.toFixed(8)),
      averageCost: position.quantity > EPSILON ? position.costValue / position.quantity : 0,
      marketPrice,
      marketValue,
      floatingPnl: marketValue === null ? null : position.costValue - marketValue,
      quoteDate: quote?.priceDate || null,
      quoteUpdatedAt: quote?.updatedAt || null,
      hasPrice: marketPrice !== null,
    };
  });
  const closedLots = visibleParticipations
    .filter((item) => item.remainingQuantity <= EPSILON)
    .map((item) => ({
      symbol: item.symbol,
      stockName: item.stockName,
      openedAt: item.openedAt,
      startDate: item.startDate,
      initialQuantity: item.allocatedQuantity,
      unitCost: item.entryPrice,
      realizedPnl: item.realizedPnl,
    }));
  const costValue = positions.reduce((total, position) => total + position.costValue, 0);
  const realizedPnl = visibleParticipations.reduce((total, item) => total + item.realizedPnl, 0);
  const allPositionsPriced = positions.every((position) => position.marketValue !== null);
  const marketValue = allPositionsPriced ? positions.reduce((total, position) => total + (position.marketValue ?? 0), 0) : null;
  const floatingPnl = allPositionsPriced ? positions.reduce((total, position) => total + (position.floatingPnl ?? 0), 0) : null;
  const quoteDates = positions.map((position) => position.quoteDate).filter((date): date is string => Boolean(date));
  const valuationDate = allPositionsPriced && quoteDates.length === positions.length && new Set(quoteDates).size === 1
    ? quoteDates[0]
    : null;

  const [priceRows] = symbols.length > 0
    ? await (conn as any).execute(
      `SELECT symbol, price_date, price
       FROM ledger_stock_price_snapshots
       WHERE category_id = ? AND symbol IN (${symbols.map(() => '?').join(',')})
       ORDER BY price_date ASC`,
      [categoryId, ...symbols],
    )
    : [[]];
  const priceByDate = new Map<string, Map<string, number>>();
  for (const row of priceRows as any[]) {
    const date = normalizeStoredDate(row.price_date);
    if (!date) continue;
    const bySymbol = priceByDate.get(date) || new Map<string, number>();
    bySymbol.set(String(row.symbol), numberValue(row.price));
    priceByDate.set(date, bySymbol);
  }
  const dailySnapshots = Array.from(priceByDate.entries()).map(([snapshotDate, priceBySymbol]) => {
    const effective = activeParticipations.filter((item) => (
      item.startDate <= snapshotDate && (!item.pauseDate || snapshotDate <= item.pauseDate)
    ));
    const allPriced = effective.every((item) => priceBySymbol.has(item.symbol));
    const snapshotCost = effective.reduce((total, item) => total + item.remainingQuantity * item.entryPrice, 0);
    const snapshotMarket = allPriced
      ? effective.reduce((total, item) => total + item.remainingQuantity * (priceBySymbol.get(item.symbol) || 0), 0)
      : null;
    const snapshotFloating = snapshotMarket === null ? null : snapshotCost - snapshotMarket;
    return {
      snapshotDate,
      marketValue: snapshotMarket,
      costValue: snapshotCost,
      floatingPnl: snapshotFloating,
      realizedPnl,
      totalPnl: snapshotFloating === null ? null : snapshotFloating + realizedPnl,
      positionCount: new Set(effective.map((item) => item.symbol)).size,
    };
  });
  const latestSnapshot = dailySnapshots[dailySnapshots.length - 1] || null;
  const priorSnapshot = dailySnapshots.length > 1 ? dailySnapshots[dailySnapshots.length - 2] : null;
  // 成员视图同样按个人累计盈亏的相邻盘尾差额计算，避免新增参与份额被误算成盈亏。
  const dailyChange = latestSnapshot && priorSnapshot && latestSnapshot.totalPnl !== null && priorSnapshot.totalPnl !== null
    ? latestSnapshot.totalPnl - priorSnapshot.totalPnl
    : null;
  const dailyChangePercent = dailyChange !== null && priorSnapshot && priorSnapshot.costValue !== null && Math.abs(priorSnapshot.costValue) > EPSILON
    ? dailyChange / priorSnapshot.costValue
    : null;
  return {
    positions,
    closedLots,
    participations,
    isEligible: visibleParticipations.length > 0,
    startDate: visibleParticipations.map((item) => item.startDate).sort()[0] || null,
    dailySnapshots: dailySnapshots.slice().reverse(),
    summary: {
      marketValue,
      costValue,
      floatingPnl,
      realizedPnl,
      totalPnl: floatingPnl === null ? (realizedPnl || null) : floatingPnl + realizedPnl,
      positionCount: positions.length,
      unpricedPositionCount: positions.filter((position) => position.marketValue === null).length,
      dailyChange,
      dailyChangePercent,
      latestSnapshot,
      priorSnapshot,
      valuationDate,
      awaitingFirstClose: positions.length > 0 && latestSnapshot === null,
    },
  };
}

export async function getMyStockTagParticipantPortfolio(input: {
  ledgerId: number;
  categoryId: number;
  userId: number;
  systemRole?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole);
  const [portfolio, history] = await Promise.all([
    buildMemberStockPortfolio(access.categoryId, input.userId),
    getEventHistory(access.categoryId),
  ]);
  if (!portfolio.isEligible && !access.canEdit) throw new Error("该股票标签尚未对您开放");
  return {
    ...access,
    accountingMode: "stock_portfolio" as const,
    participantView: true,
    ...portfolio,
    history,
  };
}

/** All immediately-visible stock tags for the effective member, used by 37's overview table. */
export async function getMyStockTagOverview(input: { ledgerId: number; userId: number; systemRole?: string }) {
  if (input.ledgerId !== STOCK_LEDGER_ID) return [];
  await ensureLedgerStockPortfolioTables();
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [categoryRows] = await (conn as any).execute(
    `SELECT DISTINCT c.id, c.name, c.sortOrder
     FROM ledger_categories c
     INNER JOIN ledger_stock_lot_participations p ON p.category_id = c.id AND p.user_id = ? AND p.allocated_quantity > 0
     INNER JOIN ledger_stock_lots l ON l.id = p.lot_id
     WHERE c.ledgerId = ? AND c.parentId IS NULL AND c.accounting_mode = 'stock_portfolio'
       AND COALESCE(p.start_date, DATE(l.opened_at)) <= ?
     ORDER BY c.sortOrder ASC, c.id ASC`,
    [input.userId, STOCK_LEDGER_ID, beijingDate()],
  );
  const result: any[] = [];
  for (const category of categoryRows as any[]) {
    const access = await assertStockTagAccess(input.ledgerId, Number(category.id), input.userId, input.systemRole);
    const portfolio = await buildMemberStockPortfolio(Number(category.id), input.userId);
    if (!portfolio.isEligible) continue;
    const chronological = portfolio.dailySnapshots.slice().reverse();
    const valuationDate = portfolio.summary.valuationDate;
    const valuationPnl = portfolio.summary.totalPnl;
    const valuationMarketValue = portfolio.summary.marketValue;
    // 历史日历只认15:05盘尾；但当该日期的某个新批次尚未被盘尾任务覆盖时，
    // 使用同一批次已落库的审计参考价补齐“当前累计回报”。不覆盖任何已有有效盘尾。
    if (valuationDate && valuationPnl !== null && valuationMarketValue !== null) {
      const valuationSnapshot = {
        snapshotDate: valuationDate,
        marketValue: valuationMarketValue,
        costValue: portfolio.summary.costValue,
        floatingPnl: portfolio.summary.floatingPnl,
        realizedPnl: portfolio.summary.realizedPnl,
        totalPnl: valuationPnl,
        positionCount: portfolio.summary.positionCount,
      };
      const sameDateIndex = chronological.findIndex((snapshot) => snapshot.snapshotDate === valuationDate);
      if (sameDateIndex >= 0 && chronological[sameDateIndex].totalPnl === null) {
        chronological[sameDateIndex] = valuationSnapshot;
      } else if (sameDateIndex < 0 && (chronological.length === 0 || chronological[chronological.length - 1].snapshotDate < valuationDate)) {
        chronological.push(valuationSnapshot);
      }
    }
    const points = chronological.map((snapshot, index) => ({
      date: snapshot.snapshotDate,
      pnl: snapshot.totalPnl ?? 0,
      dailyPnl: index > 0 && snapshot.totalPnl !== null && chronological[index - 1].totalPnl !== null
        ? snapshot.totalPnl - (chronological[index - 1].totalPnl as number)
        // 首个有效盘尾以入场时的 0 盈亏为基准；若此时已有盈亏，必须计入当天概览。
        : (snapshot.totalPnl ?? 0),
      marketValue: snapshot.marketValue,
    }));
    // The tag must become visible immediately after a valid allocation, even before its first 15:05 close.
    if (points.length === 0) {
      points.push({ date: beijingDate(), pnl: 0, dailyPnl: 0, marketValue: null });
    }
    result.push({
      categoryId: access.categoryId,
      name: access.categoryName,
      startDate: portfolio.startDate,
      summary: portfolio.summary,
      points,
    });
  }
  return result;
}

export async function getStockTagDailySnapshots(input: {
  ledgerId: number;
  categoryId: number;
  userId: number;
  systemRole?: string;
  from?: string;
  to?: string;
}) {
  await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole);
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const params: any[] = [input.categoryId];
  let rangeSql = "";
  if (input.from) { rangeSql += " AND snapshot_date >= ?"; params.push(input.from); }
  if (input.to) { rangeSql += " AND snapshot_date <= ?"; params.push(input.to); }
  const [rows] = await (conn as any).execute(
    `SELECT snapshot_date, market_value, cost_value, floating_pnl, realized_pnl, total_pnl, position_count, captured_at
     FROM ledger_stock_daily_snapshots
     WHERE category_id = ?${rangeSql}
     ORDER BY snapshot_date DESC`,
    params,
  );
  return (rows as any[]).map((row) => ({
    snapshotDate: normalizeStoredDate(row.snapshot_date) || "",
    marketValue: numberValue(row.market_value),
    costValue: numberValue(row.cost_value),
    floatingPnl: numberValue(row.floating_pnl),
    realizedPnl: numberValue(row.realized_pnl),
    totalPnl: numberValue(row.total_pnl),
    positionCount: Number(row.position_count || 0),
    capturedAt: toIso(row.captured_at),
  }));
}

async function verifyStockForTrade(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const code = normalized.slice(0, 6);
  const results = await searchManualAshareStocks(code);
  const matched = results.find((row) => row.symbol === normalized);
  if (!matched) {
    throw new Error("暂时无法核验该股票代码，请稍后重试");
  }
  if (!matched.latestPrice || matched.latestPrice <= 0 || !matched.latestPriceUpdatedAt) {
    throw new Error("暂时无法取得登记时参考价，请稍后重试后再登记");
  }
  return matched;
}

async function allocateFifo(
  conn: any,
  eventId: number,
  categoryId: number,
  symbol: string,
  quantity: number,
  salePrice: number,
) {
  const lots = await getActiveLots(categoryId, symbol);
  const available = lots.reduce((total, lot) => total + lot.remainingQuantity, 0);
  if (quantity - available > EPSILON) {
    throw new Error(`可用持仓不足：当前最多可减仓 ${available}`);
  }
  let remaining = quantity;
  for (const lot of lots) {
    if (remaining <= EPSILON) break;
    const allocated = Math.min(remaining, lot.remainingQuantity);
    if (allocated > EPSILON) {
      await conn.execute(
        `INSERT INTO ledger_stock_event_lot_allocations (event_id, lot_id, quantity) VALUES (?, ?, ?)`,
        [eventId, lot.id, allocated],
      );
      // The same FIFO sell closes participant lots in order. Historical sold parts remain
      // in the closure ledger and cannot later be changed from initial-management settings.
      await closeLotParticipationsFifo(conn, lot.id, eventId, salePrice, allocated);
      remaining -= allocated;
    }
  }
}

/** A newly entered sale must close one numbered lot in full; it may not reduce it or spill into another lot. */
async function allocateWholeLot(
  conn: any,
  eventId: number,
  categoryId: number,
  lotId: number,
  symbol: string,
  quantity: number,
  salePrice: number,
) {
  const [lotRows] = await conn.execute(
    `SELECT l.id, l.symbol, l.initial_quantity
     FROM ledger_stock_lots l
     INNER JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id
     WHERE l.id = ? AND l.category_id = ? AND opening_event.status = 'active'
     LIMIT 1 FOR UPDATE`,
    [lotId, categoryId],
  );
  const lot = (lotRows as any[])[0];
  if (!lot) throw new Error("所选持仓编号不存在或已作废");
  if (String(lot.symbol) !== symbol) throw new Error("所选持仓编号与股票代码不一致");

  const [allocationRows] = await conn.execute(
    `SELECT COALESCE(SUM(a.quantity), 0) AS allocated_quantity
     FROM ledger_stock_event_lot_allocations a
     INNER JOIN ledger_stock_events closing_event ON closing_event.id = a.event_id
     WHERE a.lot_id = ? AND closing_event.status = 'active'`,
    [lotId],
  );
  const remainingQuantity = Math.max(0, numberValue(lot.initial_quantity) - numberValue((allocationRows as any[])[0]?.allocated_quantity));
  if (remainingQuantity <= EPSILON) throw new Error("该持仓编号已经全部卖出");
  if (Math.abs(quantity - remainingQuantity) > EPSILON) {
    throw new Error(`持仓编号只能整笔卖出：请以剩余 ${remainingQuantity} 股结清`);
  }

  await conn.execute(
    `INSERT INTO ledger_stock_event_lot_allocations (event_id, lot_id, quantity) VALUES (?, ?, ?)`,
    [eventId, lotId, remainingQuantity],
  );
  await closeLotParticipationsFifo(conn, lotId, eventId, salePrice, remainingQuantity);
}

export async function createStockTagEvent(input: {
  ledgerId: number;
  categoryId: number;
  userId: number;
  systemRole?: string;
  eventType: StockEventType;
  symbol?: string;
  quantity?: number;
  executionPrice?: number;
  lotId?: number;
  actualTradedAt?: string;
  note?: string;
  correctsEventId?: number;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, true);
  const type = input.eventType;
  const note = String(input.note || "").trim().slice(0, 3000);
  const actualTradedAt = input.actualTradedAt ? new Date(input.actualTradedAt) : new Date();
  if (Number.isNaN(actualTradedAt.getTime())) throw new Error("实际成交时间无效");
  const isNewOperation = !input.correctsEventId;
  if (isNewOperation && type !== "buy" && type !== "sell") {
    throw new Error("股票标签仅可新登记买入或卖出；历史加仓、减仓和备注记录仍可查看");
  }

  let stock: Awaited<ReturnType<typeof verifyStockForTrade>> | null = null;
  let quantity: number | null = null;
  let executionPrice: number | null = null;
  if (type !== "note") {
    executionPrice = Number(input.executionPrice);
    if (!Number.isFinite(executionPrice) || executionPrice <= 0) throw new Error("成交价格必须大于0");
    if (type === "sell" && isNewOperation) {
      const lotId = Number(input.lotId);
      if (!Number.isInteger(lotId) || lotId <= 0) throw new Error("卖出时请选择持仓编号");
      const lots = await getActiveLots(access.categoryId);
      const selectedLot = lots.find((lot) => lot.id === lotId && lot.remainingQuantity > EPSILON);
      if (!selectedLot) throw new Error("所选持仓编号不存在或已全部卖出");
      stock = await verifyStockForTrade(selectedLot.symbol);
      quantity = selectedLot.remainingQuantity;
    } else {
      stock = await verifyStockForTrade(String(input.symbol || ""));
      quantity = Number(input.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("成交数量必须大于0");
    }
  } else if (!note) {
    throw new Error("备注内容不能为空");
  }

  // Append-only allocation is deterministic only when new trades are recorded in execution order.
  // A historical backfill remains possible until a later trade is present; otherwise the later
  // operation must first be corrected/voided in reverse order instead of silently reallocating it.
  if (stock && !input.correctsEventId) {
    const conn = await getDbConnection();
    if (!conn) throw new Error("数据库连接不可用");
    const [laterRows] = await (conn as any).execute(
      `SELECT id FROM ledger_stock_events
       WHERE category_id = ? AND symbol = ? AND status = 'active'
         AND COALESCE(actual_traded_at, server_registered_at) > ?
       ORDER BY COALESCE(actual_traded_at, server_registered_at) ASC, id ASC LIMIT 1`,
      [access.categoryId, stock.symbol, actualTradedAt],
    );
    if ((laterRows as any[]).length > 0) {
      throw new Error("该股票已有更晚的有效操作；请先按时间倒序更正或作废后续操作，再补录此笔成交");
    }
  }

  const tx = await getDbTransactionConnection();
  if (!tx) throw new Error("数据库连接不可用");
  try {
    await (tx as any).beginTransaction();
    const referencePrice = stock?.latestPrice && stock.latestPrice > 0 ? stock.latestPrice : null;
    const referenceTime = stock?.latestPriceUpdatedAt ? new Date(stock.latestPriceUpdatedAt) : null;
    const [result] = await (tx as any).execute(
      `INSERT INTO ledger_stock_events
       (ledger_id, category_id, event_type, symbol, stock_name, quantity, execution_price,
        actual_traded_at, market_reference_price, market_reference_at, note, created_by, corrects_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        access.ledgerId,
        access.categoryId,
        type,
        stock?.symbol || null,
        stock?.name || null,
        quantity,
        executionPrice,
        actualTradedAt,
        referencePrice,
        referenceTime,
        note || null,
        input.userId,
        input.correctsEventId || null,
      ],
    );
    const eventId = Number((result as any).insertId);
    if (!eventId) throw new Error("股票操作保存失败");

    if (type === "buy" || type === "add") {
      await (tx as any).execute(
        `INSERT INTO ledger_stock_lots
         (ledger_id, category_id, symbol, stock_name, opened_event_id, opened_at, initial_quantity, unit_cost, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [access.ledgerId, access.categoryId, stock!.symbol, stock!.name, eventId, actualTradedAt, quantity, executionPrice, note || null],
      );
    }
    if (type === "reduce" || type === "sell") {
      if (type === "sell" && isNewOperation && input.lotId) {
        await allocateWholeLot(tx, eventId, access.categoryId, Number(input.lotId), stock!.symbol, quantity!, executionPrice!);
      } else {
        await allocateFifo(tx, eventId, access.categoryId, stock!.symbol, quantity!, executionPrice!);
      }
    }
    await (tx as any).commit();
    return { id: eventId };
  } catch (error) {
    await (tx as any).rollback();
    throw error;
  } finally {
    const pooled = tx as any;
    if (typeof pooled.release === "function") pooled.release();
  }
}

export async function voidStockTagEvent(input: {
  ledgerId: number;
  categoryId: number;
  eventId: number;
  userId: number;
  systemRole?: string;
  reason: string;
}) {
  await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, true);
  const reason = String(input.reason || "").trim().slice(0, 300);
  if (!reason) throw new Error("请填写作废原因");
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT id, event_type, status FROM ledger_stock_events WHERE id = ? AND category_id = ? LIMIT 1`,
    [input.eventId, input.categoryId],
  );
  const event = (rows as any[])[0];
  if (!event) throw new Error("股票操作不存在");
  if (event.status === "voided") throw new Error("该股票操作已作废");

  if (event.event_type === "buy" || event.event_type === "add") {
    const [dependencyRows] = await (conn as any).execute(
      `SELECT COUNT(*) AS count
       FROM ledger_stock_event_lot_allocations a
       INNER JOIN ledger_stock_events e ON e.id = a.event_id
       INNER JOIN ledger_stock_lots l ON l.id = a.lot_id
       WHERE l.opened_event_id = ? AND e.status = 'active'`,
      [input.eventId],
    );
    if (Number((dependencyRows as any[])[0]?.count || 0) > 0) {
      throw new Error("该买入批次已有后续减仓/卖出记录，请先作废后续操作");
    }
    const [participationRows] = await (conn as any).execute(
      `SELECT COUNT(*) AS count FROM ledger_stock_lot_participations p
       INNER JOIN ledger_stock_lots l ON l.id = p.lot_id
       WHERE l.opened_event_id = ?`,
      [input.eventId],
    );
    if (Number((participationRows as any[])[0]?.count || 0) > 0) {
      throw new Error("该买入批次已分配给参与成员；请先在初始金额管理中移除未卖出的参与分配");
    }
  }
  if (event.event_type === "reduce" || event.event_type === "sell") {
    // The sale's participant closures are append-only evidence. Reversing an entire sale
    // restores its quantities before the closure records are deleted, keeping the matrix
    // consistent with the surviving stock transaction history.
    const [closedRows] = await (conn as any).execute(
      `SELECT participation_id, SUM(quantity) AS quantity
       FROM ledger_stock_participation_closures
       WHERE sell_event_id = ?
       GROUP BY participation_id`,
      [input.eventId],
    );
    for (const row of closedRows as any[]) {
      await (conn as any).execute(
        `UPDATE ledger_stock_lot_participations SET remaining_quantity = remaining_quantity + ? WHERE id = ?`,
        [numberValue(row.quantity), Number(row.participation_id)],
      );
    }
    await (conn as any).execute(
      `DELETE FROM ledger_stock_participation_closures WHERE sell_event_id = ?`,
      [input.eventId],
    );
  }
  await (conn as any).execute(
    `UPDATE ledger_stock_events
     SET status = 'voided', voided_at = NOW(), voided_by = ?, void_reason = ?
     WHERE id = ? AND category_id = ? AND status = 'active'`,
    [input.userId, reason, input.eventId, input.categoryId],
  );
  return { success: true };
}

/**
 * Corrections never overwrite a historical event: a replacement event is appended first,
 * then the prior operation is explicitly voided with a linked correction record.
 */
export async function correctStockTagEvent(input: {
  ledgerId: number;
  categoryId: number;
  eventId: number;
  userId: number;
  systemRole?: string;
  eventType: StockEventType;
  symbol?: string;
  quantity?: number;
  executionPrice?: number;
  actualTradedAt?: string;
  note?: string;
  reason: string;
}) {
  await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, true);
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT event_type FROM ledger_stock_events WHERE id = ? AND category_id = ? AND status = 'active' LIMIT 1`,
    [input.eventId, input.categoryId],
  );
  const original = (rows as any[])[0];
  if (!original) throw new Error("仅可更正仍有效的历史操作");
  if (original.event_type !== input.eventType) {
    throw new Error("更正只能修改同类型操作的成交信息；如需变更操作类型，请先作废后重新登记");
  }
  // Enforce reverse-order correction for opening lots; this prevents a correction from silently changing cost beneath a later sale.
  if (["buy", "add"].includes(original.event_type)) {
    const [dependencies] = await (conn as any).execute(
      `SELECT COUNT(*) AS count FROM ledger_stock_event_lot_allocations a
       INNER JOIN ledger_stock_lots l ON l.id = a.lot_id
       INNER JOIN ledger_stock_events e ON e.id = a.event_id
       WHERE l.opened_event_id = ? AND e.status = 'active'`,
      [input.eventId],
    );
    if (Number((dependencies as any[])[0]?.count || 0) > 0) {
      throw new Error("该批次已有后续卖出，请先按时间倒序更正后续操作");
    }
  }
  await voidStockTagEvent({
    ledgerId: input.ledgerId,
    categoryId: input.categoryId,
    eventId: input.eventId,
    userId: input.userId,
    systemRole: input.systemRole,
    reason: `更正：${String(input.reason || "").trim()}`,
  });
  return createStockTagEvent({ ...input, correctsEventId: input.eventId });
}

export async function refreshLedgerStockTagCloseSnapshots(): Promise<{ categories: number; symbols: number; updated: number }> {
  if (closeRefreshInProgress) return { categories: 0, symbols: 0, updated: 0 };
  closeRefreshInProgress = true;
  try {
    await ensureLedgerStockPortfolioTables();
    const conn = await getDbConnection();
    if (!conn) throw new Error("数据库连接不可用");
    const [rows] = await (conn as any).execute(
      `SELECT id FROM ledger_categories
       WHERE ledgerId = ? AND parentId IS NULL AND accounting_mode = 'stock_portfolio'`,
      [STOCK_LEDGER_ID],
    );
    const categoryIds = (rows as any[]).map((row) => Number(row.id));
    const symbolsByCategory = new Map<number, string[]>();
    const allSymbols = new Set<string>();
    for (const categoryId of categoryIds) {
      const lots = await getActiveLots(categoryId);
      const symbols = Array.from(new Set(lots.filter((lot) => lot.remainingQuantity > EPSILON).map((lot) => lot.symbol)));
      symbolsByCategory.set(categoryId, symbols);
      symbols.forEach((symbol) => allSymbols.add(symbol));
    }
    if (allSymbols.size === 0) return { categories: categoryIds.length, symbols: 0, updated: 0 };

    const quotes = await fetchEndOfDayStockCloseSnapshots(Array.from(allSymbols));
    const date = beijingDate();
    let updated = 0;
    for (const [categoryId, symbols] of Array.from(symbolsByCategory.entries())) {
      const freshSymbols = new Set<string>();
      for (const symbol of symbols) {
        const quote = quotes[symbol];
        if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) continue;
        // A prior trading day's fallback is still useful as a last displayed reference,
        // but it must not manufacture a new daily valuation for a holiday/failure date.
        const priceDate = quote.priceDate || "";
        if (!priceDate) continue;
        await (conn as any).execute(
          `INSERT INTO ledger_stock_price_snapshots
           (ledger_id, category_id, symbol, price, price_date, captured_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE price = VALUES(price), captured_at = NOW()`,
          [STOCK_LEDGER_ID, categoryId, symbol, quote.price, priceDate],
        );
        if (priceDate === date) freshSymbols.add(symbol);
        updated += 1;
      }
      // Write a category snapshot only when every active symbol has an actual close for today.
      // This keeps weekends, exchange holidays, and incomplete market responses from becoming
      // fictitious snapshot dates while retaining the latest valid quote already on record.
      if (symbols.some((symbol) => !freshSymbols.has(symbol))) continue;
      const portfolio = await buildPortfolio(categoryId);
      // A failed quote leaves the previous valid quote in the calculation; no zero-value snapshot is written.
      if (portfolio.summary.unpricedPositionCount > 0) continue;
      await (conn as any).execute(
        `INSERT INTO ledger_stock_daily_snapshots
         (ledger_id, category_id, snapshot_date, market_value, cost_value, floating_pnl, realized_pnl, total_pnl, position_count, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           market_value = VALUES(market_value), cost_value = VALUES(cost_value),
           floating_pnl = VALUES(floating_pnl), realized_pnl = VALUES(realized_pnl),
           total_pnl = VALUES(total_pnl), position_count = VALUES(position_count), captured_at = NOW()`,
        [
          STOCK_LEDGER_ID,
          categoryId,
          date,
          portfolio.summary.marketValue,
          portfolio.summary.costValue,
          portfolio.summary.floatingPnl,
          portfolio.summary.realizedPnl,
          portfolio.summary.totalPnl,
          portfolio.summary.positionCount,
        ],
      );
    }
    console.log(`[37股票盘尾] ${date}：标签 ${categoryIds.length} 个，跟踪 ${allSymbols.size} 只，更新 ${updated} 条行情`);
    return { categories: categoryIds.length, symbols: allSymbols.size, updated };
  } finally {
    closeRefreshInProgress = false;
  }
}

/**
 * 交易时段每五分钟刷新37号股票标签当前市值。
 * 盘中报价单独保存，不触碰日历、每日盈亏或15:05才固化的盘尾快照。
 */
export async function refreshLedgerStockTagIntradaySnapshots(): Promise<{ categories: number; symbols: number; updated: number }> {
  if (intradayRefreshInProgress) return { categories: 0, symbols: 0, updated: 0 };
  intradayRefreshInProgress = true;
  try {
    await ensureLedgerStockPortfolioTables();
    const conn = await getDbConnection();
    if (!conn) throw new Error("数据库连接不可用");
    const [rows] = await (conn as any).execute(
      `SELECT id FROM ledger_categories
       WHERE ledgerId = ? AND parentId IS NULL AND accounting_mode = 'stock_portfolio'`,
      [STOCK_LEDGER_ID],
    );
    const categoryIds = (rows as any[]).map((row) => Number(row.id));
    const symbolsByCategory = new Map<number, string[]>();
    const allSymbols = new Set<string>();
    for (const categoryId of categoryIds) {
      const lots = await getActiveLots(categoryId);
      const symbols = Array.from(new Set(
        lots.filter((lot) => lot.remainingQuantity > EPSILON).map((lot) => lot.symbol),
      ));
      symbolsByCategory.set(categoryId, symbols);
      symbols.forEach((symbol) => allSymbols.add(symbol));
    }
    if (allSymbols.size === 0) return { categories: categoryIds.length, symbols: 0, updated: 0 };

    const quotes = await fetchIntradayStockQuotes(Array.from(allSymbols));
    const date = beijingDate();
    let updated = 0;
    for (const [categoryId, symbols] of Array.from(symbolsByCategory.entries())) {
      for (const symbol of symbols) {
        const quote = quotes[symbol];
        if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) continue;
        const priceDate = quote.priceDate || date;
        // 节假日或上游返回前一交易日价格时，不能伪装成本交易日的实时行情。
        if (priceDate !== date) continue;
        await (conn as any).execute(
          `INSERT INTO ledger_stock_intraday_quotes
           (ledger_id, category_id, symbol, price, price_date, captured_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             price = VALUES(price), price_date = VALUES(price_date), captured_at = NOW()`,
          [STOCK_LEDGER_ID, categoryId, symbol, quote.price, priceDate],
        );
        updated += 1;
      }
    }
    console.log(`[37股票盘中] ${date}：标签 ${categoryIds.length} 个，跟踪 ${allSymbols.size} 只，更新 ${updated} 条行情`);
    return { categories: categoryIds.length, symbols: allSymbols.size, updated };
  } finally {
    intradayRefreshInProgress = false;
  }
}

async function getStockLotParticipationMatrixInternal(categoryId: number) {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [lotRows] = await (conn as any).execute(
    `SELECT l.id, l.symbol, l.stock_name, l.opened_at, l.initial_quantity, l.unit_cost,
            COALESCE(l.note, opening_event.note, '') AS note,
            opening_event.market_reference_price AS opening_reference_price,
            COALESCE(opening_event.actual_traded_at, l.opened_at) AS actual_traded_at,
            COALESCE(SUM(CASE WHEN e.status = 'active' THEN a.quantity ELSE 0 END), 0) AS globally_sold_quantity
     FROM ledger_stock_lots l
     INNER JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id
     LEFT JOIN ledger_stock_event_lot_allocations a ON a.lot_id = l.id
     LEFT JOIN ledger_stock_events e ON e.id = a.event_id
     WHERE l.category_id = ? AND opening_event.status = 'active'
     GROUP BY l.id
     ORDER BY l.opened_at ASC, l.id ASC`,
    [categoryId],
  );
  const [members] = await (conn as any).execute(
    `SELECT lm.userId, lm.role, u.username, u.name
     FROM ledger_members lm
     LEFT JOIN users u ON u.id = lm.userId
     WHERE lm.ledgerId = ?
     ORDER BY CASE lm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, lm.id ASC`,
    [STOCK_LEDGER_ID],
  );
  const [participationRows] = await (conn as any).execute(
    `SELECT p.id, p.lot_id, p.user_id, p.allocated_quantity, p.remaining_quantity, p.entry_price,
            DATE_FORMAT(COALESCE(MAX(p.start_date), DATE(MAX(l.opened_at))), '%Y-%m-%d') AS start_date,
            DATE_FORMAT(MAX(p.pause_date), '%Y-%m-%d') AS pause_date,
            p.assigned_at, p.assigned_by,
            COALESCE(SUM(c.quantity), 0) AS closed_quantity,
            COALESCE(SUM(c.quantity * (p.entry_price - c.sale_price)), 0) AS realized_pnl
     FROM ledger_stock_lot_participations p
     INNER JOIN ledger_stock_lots l ON l.id = p.lot_id
     LEFT JOIN ledger_stock_participation_closures c ON c.participation_id = p.id
     WHERE p.category_id = ?
     GROUP BY p.id
     ORDER BY p.assigned_at ASC, p.id ASC`,
    [categoryId],
  );
  const [storedQuotes, referenceQuotes] = await Promise.all([
    getLatestQuotes(categoryId, (lotRows as any[]).map((row) => String(row.symbol))),
    getLatestReferenceQuotes(categoryId),
  ]);
  const quoteMap = { ...referenceQuotes, ...storedQuotes };
  const byLot = new Map<number, any[]>();
  for (const row of participationRows as any[]) {
    const lotId = Number(row.lot_id);
    const list = byLot.get(lotId) || [];
    list.push({
      id: Number(row.id), userId: Number(row.user_id),
      allocatedQuantity: numberValue(row.allocated_quantity), remainingQuantity: numberValue(row.remaining_quantity),
      closedQuantity: numberValue(row.closed_quantity), entryPrice: numberValue(row.entry_price),
      startDate: row.start_date || '', pauseDate: row.pause_date || '',
      assignedAt: toIso(row.assigned_at), assignedBy: Number(row.assigned_by), realizedPnl: numberValue(row.realized_pnl),
    });
    byLot.set(lotId, list);
  }
  const lots = (lotRows as any[]).map((row) => {
    const initialQuantity = numberValue(row.initial_quantity);
    const globallySoldQuantity = numberValue(row.globally_sold_quantity);
    const currentQuantity = Math.max(0, initialQuantity - globallySoldQuantity);
    const marketPrice = quoteMap[String(row.symbol)]?.price ?? null;
    const participations = byLot.get(Number(row.id)) || [];
    const activeAllocatedQuantity = participations.reduce((total, item) => total + item.remainingQuantity, 0);
    return {
      id: Number(row.id), symbol: String(row.symbol), stockName: String(row.stock_name),
      // 使用管理员登记的实际成交/接单时间（精确到秒），不受后续日度估值影响。
      openedAt: toIso(row.opened_at), actualTradedAt: toIso(row.actual_traded_at),
      unitCost: numberValue(row.unit_cost), openingReferencePrice: numberValue(row.opening_reference_price) || null,
      note: String(row.note || ""),
      initialQuantity, globallySoldQuantity, currentQuantity, marketPrice,
      availableForParticipation: Math.max(0, currentQuantity - activeAllocatedQuantity),
      status: currentQuantity > EPSILON ? "active" as const : "closed" as const,
      participations: participations.map((item) => ({
        ...item,
        floatingPnl: marketPrice === null ? null : (item.entryPrice - marketPrice) * item.remainingQuantity,
        totalPnl: marketPrice === null ? item.realizedPnl : item.realizedPnl + (item.entryPrice - marketPrice) * item.remainingQuantity,
      })),
    };
  });
  return {
    members: (members as any[]).map((member) => ({
      userId: Number(member.userId), role: member.role,
      name: member.name || member.username || `用户${member.userId}`,
    })),
    lots,
  };
}

export async function getStockLotParticipationMatrix(input: { ledgerId: number; categoryId: number; userId: number; systemRole?: string }) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole);
  // The matrix names every participant and their allocated quantities.  It is an
  // administrator maintenance view only; ordinary members keep the separate
  // read-only endpoint that returns only their own allocations.
  if (!access.canEdit) throw new Error("仅37号账本管理员可查看全员股票份额");
  return { ...await getStockLotParticipationMatrixInternal(access.categoryId), canEdit: access.canEdit };
}

/**
 * Updates the display note for one holding number without changing the immutable
 * opening event or any balance, quantity, cost, allocation, or audit evidence.
 */
export async function updateStockTagLotNote(input: {
  ledgerId: number;
  categoryId: number;
  lotId: number;
  note: string;
  userId: number;
  systemRole?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, true);
  const lotId = Number(input.lotId);
  if (!Number.isInteger(lotId) || lotId <= 0) throw new Error("持仓编号无效");
  const note = String(input.note ?? "").trim().slice(0, 3000);
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT l.id
     FROM ledger_stock_lots l
     INNER JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id
     WHERE l.id = ? AND l.category_id = ? AND opening_event.status = 'active'
     LIMIT 1`,
    [lotId, access.categoryId],
  );
  if ((rows as any[]).length === 0) throw new Error("持仓编号不存在或已作废");
  // Empty string is intentionally stored as an explicit cleared note. NULL is reserved
  // for legacy rows so those rows continue to display their original opening-event note.
  await (conn as any).execute(
    `UPDATE ledger_stock_lots SET note = ? WHERE id = ? AND category_id = ?`,
    [note, lotId, access.categoryId],
  );
  return { success: true, note };
}


export async function setStockLotParticipation(input: {
  ledgerId: number;
  categoryId: number;
  lotId: number;
  targetUserId: number;
  quantity: number;
  userId: number;
  systemRole?: string;
  entryPrice?: number;
  startDate?: string;
  pauseDate?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, true);
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error("参与股数必须为不小于 0 的数字");
  const specifiedEntryPrice = input.entryPrice === undefined ? undefined : Number(input.entryPrice);
  if (specifiedEntryPrice !== undefined && (!Number.isFinite(specifiedEntryPrice) || specifiedEntryPrice <= 0)) {
    throw new Error("成员入场参考价必须大于 0");
  }
  const specifiedStartDate = input.startDate === undefined ? undefined : normalizeStoredDate(input.startDate);
  const specifiedPauseDate = input.pauseDate === undefined ? undefined : normalizeStoredDate(input.pauseDate);
  const tx = await getDbTransactionConnection();
  if (!tx) throw new Error("数据库连接不可用");
  try {
    await (tx as any).beginTransaction();
    const [memberRows] = await (tx as any).execute(
      `SELECT userId FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1`,
      [access.ledgerId, input.targetUserId],
    );
    if ((memberRows as any[]).length === 0) throw new Error("该用户不是37号账本成员");
    // 先锁定股票批次主记录。每次同一批次的参与分配都会串行计算，避免并发编辑合计超出当前余量。
    const [lotRows] = await (tx as any).execute(
      `SELECT l.id, l.symbol, l.initial_quantity, l.unit_cost, l.opened_at, opening_event.market_reference_price
       FROM ledger_stock_lots l
       INNER JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id
       WHERE l.id = ? AND l.category_id = ? AND opening_event.status = 'active'
       FOR UPDATE`,
      [input.lotId, access.categoryId],
    );
    const lot = (lotRows as any[])[0];
    if (!lot) throw new Error("股票批次不存在或已作废");
    const [soldRows] = await (tx as any).execute(
      `SELECT COALESCE(SUM(a.quantity), 0) AS globally_sold_quantity
       FROM ledger_stock_event_lot_allocations a
       INNER JOIN ledger_stock_events e ON e.id = a.event_id
       WHERE a.lot_id = ? AND e.status = 'active'`,
      [input.lotId],
    );
    const [existingRows] = await (tx as any).execute(
      `SELECT p.id, p.entry_price, p.start_date, p.pause_date, COUNT(c.id) AS closure_count
       FROM ledger_stock_lot_participations p
       LEFT JOIN ledger_stock_participation_closures c ON c.participation_id = p.id
       WHERE p.lot_id = ? AND p.user_id = ?
       GROUP BY p.id FOR UPDATE`,
      [input.lotId, input.targetUserId],
    );
    const existing = (existingRows as any[])[0];
    if (existing && Number(existing.closure_count) > 0) {
      throw new Error("该用户的此股票已发生卖出结算，分配记录仅可查看，不能再修改");
    }
    const defaultStartDate = normalizeStoredDate(lot.opened_at) || beijingDate();
    const effectiveStartDate = specifiedStartDate ?? normalizeStoredDate(existing?.start_date) ?? defaultStartDate;
    const effectivePauseDate = specifiedPauseDate === undefined ? normalizeStoredDate(existing?.pause_date) : specifiedPauseDate;
    if (effectivePauseDate && effectiveStartDate && effectivePauseDate < effectiveStartDate) {
      throw new Error("暂停日期不能早于开始日期");
    }
    const [otherRows] = await (tx as any).execute(
      `SELECT COALESCE(SUM(remaining_quantity), 0) AS allocated_quantity
       FROM ledger_stock_lot_participations
       WHERE lot_id = ? AND id <> ? FOR UPDATE`,
      [input.lotId, existing?.id || 0],
    );
    const otherAllocated = numberValue((otherRows as any[])[0]?.allocated_quantity);
    const remainingGlobal = Math.max(0, numberValue(lot.initial_quantity) - numberValue((soldRows as any[])[0]?.globally_sold_quantity));
    if (quantity - (remainingGlobal - otherAllocated) > EPSILON) {
      throw new Error(`可分配股数不足：当前最多可分配 ${Math.max(0, remainingGlobal - otherAllocated)}`);
    }
    if (quantity <= EPSILON) {
      if (existing) await (tx as any).execute(`DELETE FROM ledger_stock_lot_participations WHERE id = ?`, [existing.id]);
    } else if (existing) {
      await (tx as any).execute(
        `UPDATE ledger_stock_lot_participations
         SET allocated_quantity = ?, remaining_quantity = ?, entry_price = COALESCE(?, entry_price), assigned_by = ?,
             start_date = CASE WHEN ? THEN ? ELSE start_date END,
             pause_date = CASE WHEN ? THEN ? ELSE pause_date END
         WHERE id = ?`,
        [
          quantity, quantity, specifiedEntryPrice ?? null, input.userId,
          input.startDate === undefined ? 0 : 1, specifiedStartDate,
          input.pauseDate === undefined ? 0 : 1, specifiedPauseDate,
          existing.id,
        ],
      );
    } else {
      // 成员首次参与默认沿用该股票批次的实际买入价；管理员仍可在转让或中途加入时覆盖。
      const entryPrice = specifiedEntryPrice ?? (numberValue(lot.unit_cost) || numberValue(lot.market_reference_price));
      await (tx as any).execute(
        `INSERT INTO ledger_stock_lot_participations
         (ledger_id, category_id, lot_id, user_id, allocated_quantity, remaining_quantity, entry_price, start_date, pause_date, assigned_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [access.ledgerId, access.categoryId, input.lotId, input.targetUserId, quantity, quantity, entryPrice, effectiveStartDate, effectivePauseDate, input.userId],
      );
    }
    await (tx as any).commit();
    return { success: true };
  } catch (error) {
    await (tx as any).rollback();
    throw error;
  } finally {
    if (typeof (tx as any).release === "function") (tx as any).release();
  }
}


async function closeLotParticipationsFifo(conn: any, lotId: number, sellEventId: number, salePrice: number, quantity: number) {
  const [rows] = await conn.execute(
    `SELECT id, remaining_quantity FROM ledger_stock_lot_participations
     WHERE lot_id = ? AND remaining_quantity > 0
     ORDER BY assigned_at ASC, id ASC FOR UPDATE`,
    [lotId],
  );
  let remaining = quantity;
  for (const row of rows as any[]) {
    if (remaining <= EPSILON) break;
    const closedQuantity = Math.min(remaining, numberValue(row.remaining_quantity));
    if (closedQuantity <= EPSILON) continue;
    await conn.execute(
      `INSERT INTO ledger_stock_participation_closures (participation_id, sell_event_id, quantity, sale_price)
       VALUES (?, ?, ?, ?)`,
      [row.id, sellEventId, closedQuantity, salePrice],
    );
    await conn.execute(
      `UPDATE ledger_stock_lot_participations SET remaining_quantity = remaining_quantity - ? WHERE id = ?`,
      [closedQuantity, row.id],
    );
    remaining -= closedQuantity;
  }
}
