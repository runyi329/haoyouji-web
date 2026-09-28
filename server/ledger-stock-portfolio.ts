import { getDbConnection, getDbTransactionConnection } from "./db";
import { fetchEndOfDayStockCloseSnapshots, searchManualAshareStocks } from "./price-scanner";

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
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger_stock_lots_opened_event (opened_event_id),
          INDEX idx_ledger_stock_lots_tag_symbol (category_id, symbol, opened_at, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

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
        priceDate: String(row.price_date || "").slice(0, 10),
        updatedAt: toIso(row.captured_at),
      };
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
  const [rows] = await (conn as any).execute(
    `SELECT e.*, u.name AS admin_name, u.username AS admin_username,
            corrected.id AS corrected_event_id
     FROM ledger_stock_events e
     LEFT JOIN users u ON u.id = e.created_by
     LEFT JOIN ledger_stock_events corrected ON corrected.corrects_event_id = e.id
     WHERE e.category_id = ?
     ORDER BY COALESCE(e.actual_traded_at, e.server_registered_at) DESC, e.id DESC
     LIMIT ?`,
    [categoryId, Math.min(Math.max(limit, 1), 1000)],
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
    snapshotDate: String(row.snapshot_date).slice(0, 10),
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
  const referenceQuotes = await getLatestReferenceQuotes(categoryId);
  const storedQuotes = await getLatestQuotes(categoryId, allLots.map((lot) => lot.symbol));
  const quoteMap = { ...referenceQuotes, ...storedQuotes };
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
      openedAt: lot.openedAt,
      quantity: lot.remainingQuantity,
      unitCost: lot.unitCost,
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
  const dailyChange = latestSnapshot && priorSnapshot ? latestSnapshot.marketValue - priorSnapshot.marketValue : null;
  const dailyChangePercent = dailyChange !== null && priorSnapshot && Math.abs(priorSnapshot.marketValue) > EPSILON
    ? dailyChange / priorSnapshot.marketValue
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
  return { ...access, accountingMode: "stock_portfolio" as const, ...portfolio, history };
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
    snapshotDate: String(row.snapshot_date).slice(0, 10),
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
      remaining -= allocated;
    }
  }
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
  actualTradedAt?: string;
  note?: string;
  correctsEventId?: number;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, true);
  const type = input.eventType;
  const note = String(input.note || "").trim().slice(0, 3000);
  const actualTradedAt = input.actualTradedAt ? new Date(input.actualTradedAt) : new Date();
  if (Number.isNaN(actualTradedAt.getTime())) throw new Error("实际成交时间无效");

  let stock: Awaited<ReturnType<typeof verifyStockForTrade>> | null = null;
  let quantity: number | null = null;
  let executionPrice: number | null = null;
  if (type !== "note") {
    stock = await verifyStockForTrade(String(input.symbol || ""));
    quantity = Number(input.quantity);
    executionPrice = Number(input.executionPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("成交数量必须大于0");
    if (!Number.isFinite(executionPrice) || executionPrice <= 0) throw new Error("成交价格必须大于0");
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
         (ledger_id, category_id, symbol, stock_name, opened_event_id, opened_at, initial_quantity, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [access.ledgerId, access.categoryId, stock!.symbol, stock!.name, eventId, actualTradedAt, quantity, executionPrice],
      );
    }
    if (type === "reduce" || type === "sell") {
      await allocateFifo(tx, eventId, access.categoryId, stock!.symbol, quantity!);
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
