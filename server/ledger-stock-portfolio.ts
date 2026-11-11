import { getDbConnection, getDbTransactionConnection } from "./db";
import { fetchIntradayStockQuotes, getUsdtCnyRate, refreshUsdtCnyRate, resolveUsStockExchange, searchManualStocks } from "./price-scanner";
import { isStockLotSaleDateValid, requiresStockTradeOrderCheck } from "../shared/stock-trade-ordering";
import { readTagVisible } from "../shared/tag-visibility";
import { buildMemberStockCalendar, isTrustedMemberCalendarClose, memberCalendarSettlementSummary, type MemberCalendarQuote } from './shared/stock-member-calendar';
import { fetchOvernightUnifiedCloseQuotes, marketSessionDateFromBeijingTradeTimestamp, type UnifiedCloseQuote } from './stock-unified-close-quotes';
import { getOvernightUsSessionDate, isStockMarketSession } from '../shared/stock-market-session';
import { getUnifiedStockCloseSnapshotDate, getUnifiedStockCloseVersion, isUnifiedStockCloseReady, isUnifiedStockCloseQuoteForDate, type UnifiedStockClosePublicationResult } from '../shared/stock-unified-close-policy';
import { fetchStockUsdCnyAtClose } from './stock-usd-cny-rate';
import { ensureStockCalendarResultTable, markStockCalendarResultDirty, readStockCalendarResult, rebuildCachedStockCalendarResult } from './stock-calendar-result-cache';

import {
  buildStockObservationHolding,
  summarizeStockObservationHoldings,
  releaseStockParticipationForObservation,
  validateStockObservationQuantity,
  validateStockObservationEntryPrice,
  validateStockObservationStartDate,
  validateStockObservationPauseDate,
  type StockLotObservation,
  type StockObservationHolding,
  type StockObservationQuote,
  type StockObservationValuation,
} from "../shared/stock-observation-portfolio";

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
  source?: 'intraday' | 'close';
};

let tablesReady: Promise<void> | null = null;
let quoteHistoryTableReady: Promise<void> | null = null;
let closeRefreshInProgress = false;
let intradayRefreshInProgress = false;

const STOCK_LEDGER_ID = 37;
const EPSILON = 0.00000001;
/** 股票标签统一按买卖双边各千分之一计入交易成本。 */
const STOCK_TRADE_FEE_RATE = 0.001;
const STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION = 'cn-day-us-overnight-1505-v1';

// 成员首页会同时读取标签列表、当前详情和行情。相同用户的并发读取必须合并，
// 否则远程数据库会被同一页的重复请求拖慢。缓存只保留极短时间，所有交易和份额
// 写入完成后立即清空，不能让已保存的成交或分配比例延迟显示。
const MEMBER_STOCK_READ_CACHE_TTL_MS = 20_000;
type ShortLivedReadCacheEntry<T> = { expiresAt: number; promise: Promise<T> };
const memberPortfolioReadCache = new Map<string, ShortLivedReadCacheEntry<any>>();
const memberOverviewReadCache = new Map<string, ShortLivedReadCacheEntry<any[]>>();

function readShortLivedCache<T>(
  cache: Map<string, ShortLivedReadCacheEntry<T>>,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = loader();
  const entry: ShortLivedReadCacheEntry<T> = { expiresAt: now + MEMBER_STOCK_READ_CACHE_TTL_MS, promise };
  cache.set(key, entry);
  void promise.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return promise;
}

function invalidateMemberStockReadCaches() {
  memberPortfolioReadCache.clear();
  memberOverviewReadCache.clear();
}

function asRows(result: any): any[] {
  if (Array.isArray(result?.[0])) return result[0];
  return Array.isArray(result) ? result : [];
}

function beijingDate(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeSymbol(value: unknown): string {
  const raw = String(value || "").trim().toUpperCase();
  if (!/^\d{6}\.(SH|SZ|BJ)$/.test(raw) && !/^[A-Z][A-Z0-9.\-]{0,14}$/.test(raw)) {
    throw new Error("仅支持已核验的 A 股代码或美股 ticker");
  }
  return raw;
}

function stockCurrency(symbol: string): 'CNY' | 'USD' {
  return /^\d{6}\.(SH|SZ|BJ)$/.test(symbol) ? 'CNY' : 'USD';
}

function stockMarket(symbol: string): 'A' | 'US' {
  return stockCurrency(symbol) === 'CNY' ? 'A' : 'US';
}

function toIso(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

/** FX archive DATETIME values are Beijing wall-clock timestamps. */
function toBeijingWallClockIso(value: unknown): string {
  if (!value) return "";
  const raw = String(value).trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) return `${raw}+08:00`;
  return toIso(value);
}

function toMysqlBeijingDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error('FX quote时间无效');
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
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

/** 独立、只CREATE的报价档案迁移；不补写历史、不改钱包或既有股票数据。 */
export async function ensureLedgerStockQuoteHistoryTable(): Promise<void> {
  if (!quoteHistoryTableReady) {
    quoteHistoryTableReady = (async () => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接不可用，无法初始化股票报价历史");
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_quote_history (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          category_id INT NOT NULL,
          symbol VARCHAR(16) NOT NULL,
          price DECIMAL(20,8) NOT NULL,
          price_date DATE NOT NULL,
          captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          source ENUM('intraday','close') NOT NULL,
          INDEX idx_ledger_stock_quote_history_asof (ledger_id, category_id, symbol, price_date, captured_at, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((error) => {
      quoteHistoryTableReady = null;
      throw error;
    });
  }
  await quoteHistoryTableReady;
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
          transaction_fee DECIMAL(24,8) NULL COMMENT '实际成交额按统一费率自动计算的手续费',
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

      // 手续费独立留存在不可变成交审计上；历史成交没有该字段时继续按原口径读取。
      const [eventFeeColumnRows] = await (conn as any).execute(
        `SELECT COLUMN_NAME FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'ledger_stock_events'
           AND column_name = 'transaction_fee'`,
      );
      if ((eventFeeColumnRows as any[]).length === 0) {
        await (conn as any).execute(
          `ALTER TABLE ledger_stock_events
           ADD COLUMN transaction_fee DECIMAL(24,8) NULL COMMENT '实际成交额按统一费率自动计算的手续费' AFTER execution_price`,
        );
      }

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
      await ensureLedgerStockQuoteHistoryTable();

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
      // 日结金额统一以人民币报告。混合 CNY/USD 标签需保留结算时使用的汇率，
      // 保证历史日历不会因为未来的实时汇率变化而被重新估值。
      const [dailySnapshotColumnRows] = await (conn as any).execute(
        `SELECT COLUMN_NAME FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'ledger_stock_daily_snapshots'
           AND column_name = 'usd_cny_rate'`,
      );
      if ((dailySnapshotColumnRows as any[]).length === 0) {
        await (conn as any).execute(
          `ALTER TABLE ledger_stock_daily_snapshots
           ADD COLUMN usd_cny_rate DECIMAL(16,8) NULL COMMENT '北京时间15:05快照的USD/CNY折算汇率' AFTER position_count`,
        );
      }
      // 新正规收盘版本与旧15:05快照并存；不改写旧历史金额。唯一键加事务确保crash可重试。
      await (conn as any).execute(`CREATE TABLE IF NOT EXISTS ledger_stock_unified_close_category_publications (
        ledger_id INT NOT NULL, category_id INT NOT NULL, snapshot_date DATE NOT NULL,
        policy_version VARCHAR(80) NOT NULL,
        market_value DECIMAL(24,8) NOT NULL, cost_value DECIMAL(24,8) NOT NULL,
        floating_pnl DECIMAL(24,8) NOT NULL, realized_pnl DECIMAL(24,8) NOT NULL,
        total_pnl DECIMAL(24,8) NOT NULL, position_count INT NOT NULL,
        usd_cny_rate DECIMAL(16,8) NULL, quotes_json JSON NOT NULL,
        captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ledger_id, category_id, snapshot_date, policy_version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await (conn as any).execute(`CREATE TABLE IF NOT EXISTS ledger_stock_unified_close_prices (
        ledger_id INT NOT NULL, category_id INT NOT NULL, symbol VARCHAR(20) NOT NULL,
        session_date DATE NOT NULL, price DECIMAL(20,8) NOT NULL, currency VARCHAR(8) NOT NULL,
        source VARCHAR(64) NOT NULL, policy_version VARCHAR(64) NOT NULL,
        captured_at DATETIME NOT NULL, evidence_sha256 CHAR(64) NULL,
        PRIMARY KEY (ledger_id, category_id, symbol, session_date, policy_version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await (conn as any).execute(`CREATE TABLE IF NOT EXISTS ledger_stock_unified_close_fx (
        ledger_id INT NOT NULL, category_id INT NOT NULL, snapshot_date DATE NOT NULL,
        policy_version VARCHAR(80) NOT NULL, usd_cny_rate DECIMAL(16,8) NOT NULL,
        source VARCHAR(64) NOT NULL, quote_as_of DATETIME NOT NULL, locked_at DATETIME NOT NULL,
        evidence_sha256 CHAR(64) NULL, captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ledger_id, category_id, snapshot_date, policy_version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

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

      // 展示用观察账户单独存储；不约束实际库存、不参与分红/押金/钱包/冻结/卖出。
      // 只在既有显式迁移中建表，观察读写接口本身不会触发 ensure。
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_lot_observations (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          category_id INT NOT NULL,
          lot_id BIGINT NOT NULL,
          user_id INT NOT NULL,
          enabled TINYINT(1) NOT NULL DEFAULT 0,
          quantity DECIMAL(24,8) NOT NULL DEFAULT 0,
          entry_price DECIMAL(20,8) NOT NULL,
          start_date DATE NOT NULL,
          pause_date DATE NULL COMMENT '仅此股票观察账户暂停日期',
          assigned_by INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger_stock_lot_observation (lot_id, user_id),
          INDEX idx_ledger_stock_observation_tag_user (ledger_id, category_id, user_id),
          INDEX idx_ledger_stock_observation_lot (lot_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 兼容此前已建好的观察表，保留全部已保存观察记录；只补独立暂停日期，不改真实参与。
      const [observationPauseColumnRows] = await (conn as any).execute(
        `SELECT COLUMN_NAME FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'ledger_stock_lot_observations'
           AND column_name = 'pause_date'`,
      );
      if ((observationPauseColumnRows as any[]).length === 0) {
        await (conn as any).execute(
          `ALTER TABLE ledger_stock_lot_observations
           ADD COLUMN pause_date DATE NULL COMMENT '仅此股票观察账户暂停日期' AFTER start_date`,
        );
      }

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

      // 每笔卖出最终利润的分配快照。成员当前持仓可继续调整，但该表保留卖出时管理员确认的比例与金额。
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger_stock_sale_profit_allocations (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          sell_event_id BIGINT NOT NULL,
          recipient_type ENUM('member','account') NOT NULL,
          participation_id BIGINT NULL,
          user_id INT NULL,
          recipient_name VARCHAR(120) NOT NULL,
          allocation_quantity DECIMAL(24,8) NOT NULL,
          share_percent DECIMAL(12,8) NOT NULL,
          distributable_amount DECIMAL(24,8) NOT NULL,
          currency VARCHAR(3) NOT NULL,
          created_by INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger_stock_sale_profit_recipient (sell_event_id, recipient_type, participation_id),
          INDEX idx_ledger_stock_sale_profit_event (sell_event_id),
          INDEX idx_ledger_stock_sale_profit_user (user_id)
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
  initializeTables = true,
): Promise<Access> {
  if (initializeTables) await ensureLedgerStockPortfolioTables();
  if (ledgerId !== STOCK_LEDGER_ID) {
    throw new Error("股票持仓标签仅适用于37号账本");
  }
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");

  const [categoryRows] = await (conn as any).execute(
    `SELECT c.id, c.ledgerId, c.name, c.parentId, c.accounting_mode,
            m.userId AS member_user_id, m.role AS member_role, m.initial_balances AS initialBalances
     FROM ledger_categories c
     LEFT JOIN ledger_members m ON m.ledgerId=c.ledgerId AND m.userId=?
     WHERE c.id = ? AND c.ledgerId = ? LIMIT 1`,
    [userId, categoryId, ledgerId],
  );
  const category = (categoryRows as any[])[0];
  if (!category || category.parentId !== null || category.accounting_mode !== "stock_portfolio") {
    throw new Error("该标签不是股票持仓模式");
  }

  const member = category.member_user_id == null ? null
    : { role: category.member_role, initialBalances: category.initialBalances };
  const isSystemAdmin = systemRole === "admin" || systemRole === "super_admin";
  if (!member && !isSystemAdmin) throw new Error("您不是此账本的成员");

  // Keep the existing 37 tag visibility policy intact; a hidden tag cannot be accessed by guessing its ID.
  if (member && member.role !== "owner") {
    try {
      const balances = member.initialBalances ? JSON.parse(member.initialBalances) : {};
      if (!readTagVisible(balances, String(category.name))) {
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
            l.initial_quantity, l.unit_cost, opening_event.transaction_fee AS opening_fee,
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
    openingFee: row.opening_fee === null || row.opening_fee === undefined ? null : numberValue(row.opening_fee),
    note: String(row.note || ""),
    allocatedQuantity: numberValue(row.allocated_quantity),
    remainingQuantity: Math.max(0, numberValue(row.initial_quantity) - numberValue(row.allocated_quantity)),
  }));
}

/**
 * 已卖出批次从进行中持仓完全分流：只读卖出事件和批次分配，不取实时行情。
 * 旧记录没有手续费时沿用既有已实现盈亏口径；新记录则保留买卖双边手续费。
 */
async function getSoldLots(categoryId: number, lots: Awaited<ReturnType<typeof getActiveLots>>, includePartial = false) {
  // 汇总包含所有已经售出的份额；原订单卡仍仅展示完整卖出的批次。
  const selectedLots = lots.filter((lot) => includePartial ? lot.allocatedQuantity > EPSILON : lot.remainingQuantity <= EPSILON);
  if (selectedLots.length === 0) return [];
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const lotIds = selectedLots.map((lot) => lot.id);
  const placeholders = lotIds.map(() => '?').join(',');
  const [rows] = await (conn as any).execute(
    `SELECT a.lot_id, a.quantity, e.id AS sell_event_id, e.execution_price, e.quantity AS event_quantity, e.transaction_fee,
            e.actual_traded_at, e.server_registered_at, e.note AS sell_note
     FROM ledger_stock_event_lot_allocations a
     INNER JOIN ledger_stock_events e ON e.id = a.event_id
     WHERE a.lot_id IN (${placeholders})
       AND e.status = 'active' AND ${includePartial ? "e.event_type IN ('reduce','sell')" : "e.event_type = 'sell'"}
     ORDER BY COALESCE(e.actual_traded_at, e.server_registered_at) DESC, e.id DESC`,
    lotIds,
  );
  const lotById = new Map(selectedLots.map((lot) => [lot.id, lot]));
  const grouped = new Map<number, any[]>();
  for (const row of rows as any[]) {
    const lotId = Number(row.lot_id);
    const list = grouped.get(lotId) || [];
    list.push(row);
    grouped.set(lotId, list);
  }
  const latestSellEventIds = Array.from(grouped.values())
    .map((saleRows) => includePartial ? 0 : Number(saleRows[0]?.sell_event_id))
    .filter((eventId) => Number.isInteger(eventId) && eventId > 0);
  const memberSharesBySellEvent = new Map<number, Array<{ userId: number; name: string; percentage: number }>>();
  if (latestSellEventIds.length > 0) {
    const sharePlaceholders = latestSellEventIds.map(() => '?').join(',');
    const [shareRows] = await (conn as any).execute(
      `SELECT sell_event_id, user_id, recipient_name, share_percent
       FROM ledger_stock_sale_profit_allocations
       WHERE recipient_type = 'member' AND sell_event_id IN (${sharePlaceholders})
       ORDER BY sell_event_id ASC, id ASC`,
      latestSellEventIds,
    );
    for (const row of shareRows as any[]) {
      const eventId = Number(row.sell_event_id);
      const list = memberSharesBySellEvent.get(eventId) || [];
      list.push({
        userId: Number(row.user_id),
        name: String(row.recipient_name || `用户#${row.user_id}`),
        percentage: numberValue(row.share_percent),
      });
      memberSharesBySellEvent.set(eventId, list);
    }
  }
  return Array.from(grouped.entries()).flatMap(([lotId, saleRows]) => {
    const lot = lotById.get(lotId);
    if (!lot) return [];
    const soldQuantity = saleRows.reduce((total, row) => total + numberValue(row.quantity), 0);
    // 新流程要求整笔卖出。历史减仓记录不伪装成完整的“已卖出”订单卡。
    if (!includePartial && soldQuantity + EPSILON < lot.initialQuantity) return [];
    const sellValue = saleRows.reduce((total, row) => total + numberValue(row.quantity) * numberValue(row.execution_price), 0);
    const sellFee = saleRows.reduce((total, row) => {
      const fee = row.transaction_fee === null || row.transaction_fee === undefined ? 0 : numberValue(row.transaction_fee);
      const eventQuantity = numberValue(row.event_quantity);
      return total + (eventQuantity > EPSILON ? fee * numberValue(row.quantity) / eventQuantity : 0);
    }, 0);
    const buyFee = saleRows.reduce((total, row) => {
      // 与 getRealizedPnl 保持一致：仅新式（已留存卖出手续费）的成交计入双边手续费。
      if (row.transaction_fee === null || row.transaction_fee === undefined) return total;
      const quantity = numberValue(row.quantity);
      const perShareFee = lot.openingFee === null
        ? lot.unitCost * STOCK_TRADE_FEE_RATE
        : lot.openingFee / Math.max(EPSILON, lot.initialQuantity);
      return total + quantity * perShareFee;
    }, 0);
    const latestSale = saleRows[0];
    const costValue = soldQuantity * lot.unitCost;
    return [{
      lotId,
      symbol: lot.symbol,
      stockName: lot.stockName,
      currency: stockCurrency(lot.symbol),
      openedAt: lot.openedAt,
      initialQuantity: lot.initialQuantity,
      unitCost: lot.unitCost,
      note: lot.note,
      sellEventId: Number(latestSale.sell_event_id),
      soldAt: toIso(latestSale.actual_traded_at || latestSale.server_registered_at),
      sellNote: String(latestSale.sell_note || ''),
      memberShares: memberSharesBySellEvent.get(Number(latestSale.sell_event_id)) || [],
      soldQuantity: Number(soldQuantity.toFixed(8)),
      sellPrice: soldQuantity > EPSILON ? Number((sellValue / soldQuantity).toFixed(8)) : 0,
      buyValue: Number(costValue.toFixed(8)),
      sellValue: Number(sellValue.toFixed(8)),
      buyFee: Number(buyFee.toFixed(8)),
      sellFee: Number(sellFee.toFixed(8)),
      accountNetProfit: Number((sellValue - sellFee - costValue - buyFee).toFixed(8)),
    }];
  }).sort((left, right) => (
    String(right.soldAt).localeCompare(String(left.soldAt)) || right.sellEventId - left.sellEventId
  ));
}

/**
 * 交易所归属是证券主数据，展示时按当前美股基础目录补齐；不会修改任何历史成交记录。
 * 目录暂时没有覆盖的新股明确返回空值，前端不显示交易所标签，不臆测 NYSE/NASDAQ。
 */
async function getUsStockExchangeMap(symbols: string[]): Promise<Record<string, string>> {
  const usSymbols = Array.from(new Set(symbols.filter((symbol) => stockMarket(symbol) === 'US')));
  if (usSymbols.length === 0) return {};
  const conn = await getDbConnection();
  if (!conn) return {};
  try {
    const [rows] = await (conn as any).execute(
      `SELECT ts_code, exchange
       FROM us_stock_basic
       WHERE UPPER(ts_code) IN (${usSymbols.map(() => '?').join(',')})`,
      usSymbols,
    );
    return (rows as any[]).reduce((result, row) => {
      const symbol = String(row?.ts_code || '').trim().toUpperCase();
      const exchange = resolveUsStockExchange(symbol, row?.exchange);
      if (symbol && exchange) result[symbol] = exchange;
      return result;
    }, {} as Record<string, string>);
  } catch {
    return {};
  }
}

async function getLatestQuotes(categoryId: number, symbols: string[], asOfDate?: string): Promise<Record<string, StoredQuote>> {
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
       WHERE category_id = ? AND symbol IN (${placeholders})${asOfDate ? ' AND price_date <= ? AND captured_at < DATE_ADD(?, INTERVAL 1 DAY)' : ''}
       GROUP BY symbol
     ) latest ON latest.symbol = s.symbol AND latest.max_price_date = s.price_date
     WHERE s.category_id = ?${asOfDate ? ' AND s.price_date <= ? AND s.captured_at < DATE_ADD(?, INTERVAL 1 DAY)' : ''}`,
    [categoryId, ...unique, ...(asOfDate ? [asOfDate, asOfDate] : []), categoryId, ...(asOfDate ? [asOfDate, asOfDate] : [])],
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

/** 返回各股票最后一笔盘中报价；美股按纽约交易日而非北京时间判断跨日。 */
async function getLatestIntradayQuotes(categoryId: number, symbols: string[], asOfDate?: string): Promise<Record<string, StoredQuote>> {
  if (symbols.length === 0) return {};
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const unique = Array.from(new Set(symbols));
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await (conn as any).execute(
    `SELECT symbol, price, price_date, captured_at
     FROM ledger_stock_intraday_quotes
     WHERE category_id = ? AND symbol IN (${placeholders})${asOfDate ? ' AND price_date <= ? AND captured_at < DATE_ADD(?, INTERVAL 1 DAY)' : ''}`,
    [categoryId, ...unique, ...(asOfDate ? [asOfDate, asOfDate] : [])],
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

/** 观察历史读取只SELECT；旧部署未建档案时不隐式DDL，也绝不借用未来价。 */
async function getArchivedQuotesAsOf(categoryId: number, symbols: string[], asOfDate: string): Promise<Record<string, StoredQuote>> {
  if (symbols.length === 0) return {};
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [tableRows] = await (conn as any).execute(
    `SELECT TABLE_NAME FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'ledger_stock_quote_history' LIMIT 1`,
  );
  if ((tableRows as any[]).length === 0) return {};
  const unique = Array.from(new Set(symbols));
  const [rows] = await (conn as any).execute(
    `SELECT symbol, price, price_date, captured_at, source FROM (
       SELECT symbol, price, price_date, captured_at, source,
              ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY price_date DESC, captured_at DESC, id DESC) AS quote_rank
       FROM ledger_stock_quote_history
       WHERE ledger_id = ? AND category_id = ? AND symbol IN (${unique.map(() => '?').join(',')})
         AND price > 0 AND price_date <= ? AND captured_at < DATE_ADD(?, INTERVAL 1 DAY)
     ) history WHERE quote_rank = 1`,
    [STOCK_LEDGER_ID, categoryId, ...unique, asOfDate, asOfDate],
  );
  const result: Record<string, StoredQuote> = {};
  for (const row of rows as any[]) {
    const quote: StoredQuote = {
      symbol: String(row.symbol), price: numberValue(row.price),
      priceDate: normalizeStoredDate(row.price_date) || '', updatedAt: toIso(row.captured_at),
      source: row.source === 'close' ? 'close' : 'intraday',
    };
    if (quote.price > 0 && isQuoteAtOrBefore(quote, asOfDate)) result[quote.symbol] = quote;
  }
  return result;
}

function isQuoteAtOrBefore(quote: StoredQuote, asOfDate: string): boolean {
  const cutoff = Date.parse(`${asOfDate}T00:00:00+08:00`) + 86400000;
  return !!quote.priceDate && quote.priceDate <= asOfDate && !!quote.updatedAt
    && Number.isFinite(Date.parse(quote.updatedAt)) && Date.parse(quote.updatedAt) < cutoff;
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

async function getLatestReferenceQuotes(categoryId: number, asOfDate?: string): Promise<Record<string, StoredQuote>> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT e.symbol, e.market_reference_price, e.market_reference_at
     FROM ledger_stock_events e
     INNER JOIN (
       SELECT symbol, MAX(id) AS max_id
       FROM ledger_stock_events
       WHERE category_id = ? AND status = 'active' AND symbol IS NOT NULL
         AND market_reference_price IS NOT NULL${asOfDate ? ' AND market_reference_at < DATE_ADD(?, INTERVAL 1 DAY)' : ''}
       GROUP BY symbol
     ) latest ON latest.max_id = e.id
     WHERE e.category_id = ?`,
    [categoryId, ...(asOfDate ? [asOfDate] : []), categoryId],
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

async function getRealizedPnl(categoryId: number, usdCnyRate: number): Promise<number | null> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT e.id, e.symbol, e.quantity, e.execution_price, e.transaction_fee,
            COALESCE(SUM(a.quantity * l.unit_cost), 0) AS allocated_cost,
            COALESCE(SUM(CASE WHEN e.transaction_fee IS NOT NULL
              THEN a.quantity * COALESCE(opening_event.transaction_fee / NULLIF(l.initial_quantity, 0), l.unit_cost * ?)
              ELSE 0 END), 0) AS allocated_buy_fee
     FROM ledger_stock_events e
     LEFT JOIN ledger_stock_event_lot_allocations a ON a.event_id = e.id
     LEFT JOIN ledger_stock_lots l ON l.id = a.lot_id
     LEFT JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id
     WHERE e.category_id = ? AND e.status = 'active'
       AND e.event_type IN ('reduce','sell')
     GROUP BY e.id`,
    [STOCK_TRADE_FEE_RATE, categoryId],
  );
  let total = 0;
  for (const row of rows as any[]) {
    const currency = stockCurrency(String(row.symbol || ''));
    const multiplier = currency === 'USD' ? usdCnyRate : 1;
    if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
    const proceeds = numberValue(row.quantity) * numberValue(row.execution_price);
    // 仅对新成交写入的手续费纳入净利润，旧历史成交没有 transaction_fee 时保留原有结果。
    const sellFee = row.transaction_fee === null || row.transaction_fee === undefined ? 0 : numberValue(row.transaction_fee);
    total += (proceeds - sellFee - numberValue(row.allocated_cost) - numberValue(row.allocated_buy_fee)) * multiplier;
  }
  return total;
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
    transactionFee: row.transaction_fee === null ? null : numberValue(row.transaction_fee),
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

type CurrencyPortfolioSummary = {
  currency: 'CNY' | 'USD';
  costValue: number;
  marketValue: number | null;
  floatingPnl: number | null;
  positionCount: number;
  unpricedPositionCount: number;
};

/** 混合市场的金额只在同币种内汇总，禁止把美元直接与人民币相加。 */
function summarizePositionsByCurrency(positions: Array<{ currency?: string; costValue: number; marketValue: number | null; floatingPnl: number | null }>): CurrencyPortfolioSummary[] {
  return (['CNY', 'USD'] as const).flatMap((currency) => {
    const rows = positions.filter((position) => (position.currency || 'CNY') === currency);
    if (rows.length === 0) return [];
    const unpricedPositionCount = rows.filter((position) => position.marketValue === null).length;
    return [{
      currency,
      costValue: rows.reduce((total, position) => total + position.costValue, 0),
      marketValue: unpricedPositionCount > 0 ? null : rows.reduce((total, position) => total + (position.marketValue ?? 0), 0),
      floatingPnl: unpricedPositionCount > 0 ? null : rows.reduce((total, position) => total + (position.floatingPnl ?? 0), 0),
      positionCount: rows.length,
      unpricedPositionCount,
    }];
  });
}

type CnyPortfolioSummary = {
  costValue: number | null;
  marketValue: number | null;
  floatingPnl: number | null;
  unpricedPositionCount: number;
  fxUnavailable: boolean;
};

/**
 * 37 号账本对用户端统一按人民币展示。保留 currencySummaries 供设置端显示原币种，
 * 但概览、押金参考额和回报必须使用同一 USD/CNY 实时换算口径，不能因混合币种直接置空。
 */
function summarizePositionsInCny(
  positions: Array<{ currency?: string; costValue: number; marketValue: number | null; floatingPnl: number | null }>,
  usdCnyRate: number,
): CnyPortfolioSummary {
  let costValue = 0;
  let marketValue = 0;
  let floatingPnl = 0;
  let unpricedPositionCount = 0;
  let fxUnavailable = false;

  for (const position of positions) {
    const currency = String(position.currency || 'CNY').toUpperCase();
    const multiplier = currency === 'USD' ? usdCnyRate : 1;
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      fxUnavailable = true;
      continue;
    }
    costValue += position.costValue * multiplier;
    if (position.marketValue === null || position.floatingPnl === null) {
      unpricedPositionCount += 1;
      continue;
    }
    marketValue += position.marketValue * multiplier;
    floatingPnl += position.floatingPnl * multiplier;
  }

  const cannotValue = fxUnavailable || unpricedPositionCount > 0;
  return {
    costValue: fxUnavailable ? null : costValue,
    marketValue: cannotValue ? null : marketValue,
    floatingPnl: cannotValue ? null : floatingPnl,
    unpricedPositionCount,
    fxUnavailable,
  };
}

async function buildPortfolio(categoryId: number) {
  const allLots = await getActiveLots(categoryId);
  const activeLots = allLots.filter((lot) => lot.remainingQuantity > EPSILON);
  const symbols = activeLots.map((lot) => lot.symbol);
  const [referenceQuotes, storedQuotes, intradayQuotes, usStockExchanges] = await Promise.all([
    getLatestReferenceQuotes(categoryId),
    getLatestQuotes(categoryId, symbols),
    getLatestIntradayQuotes(categoryId, symbols),
    getUsStockExchangeMap(symbols),
  ]);
  const quoteMap = mergeLatestQuoteMaps(referenceQuotes, storedQuotes, intradayQuotes);
  const positionMap = new Map<string, any>();

  // 已卖尽的批次不再混入同一股票的“当前持仓”列表，更不会占用持仓编号。
  for (const lot of activeLots) {
    const current = positionMap.get(lot.symbol) || {
      symbol: lot.symbol,
      stockName: lot.stockName,
      currency: stockCurrency(lot.symbol),
      market: stockMarket(lot.symbol),
      exchange: stockMarket(lot.symbol) === 'US' ? (usStockExchanges[lot.symbol] || null) : null,
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
  const [soldLots, realizedLots] = await Promise.all([
    getSoldLots(categoryId, allLots),
    getSoldLots(categoryId, allLots, true),
  ]);

  const usdCnyRate = Number(getUsdtCnyRate() || 0);
  const realizedPnl = await getRealizedPnl(categoryId, usdCnyRate);
  const currencySummaries = summarizePositionsByCurrency(positions);
  const isMixedCurrency = currencySummaries.length > 1;
  const cnySummary = summarizePositionsInCny(positions, usdCnyRate);
  const costValue = cnySummary.costValue;
  const marketValue = cnySummary.marketValue;
  const floatingPnl = cnySummary.floatingPnl;
  const hasUnpricedPositions = cnySummary.unpricedPositionCount > 0 || cnySummary.fxUnavailable;
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
    soldLots,
    realizedLots,
    summary: {
      // Never display or persist a partial portfolio aggregate as though missing prices were zero.
      reportingCurrency: 'CNY' as const,
      usdCnyRate: usdCnyRate > 0 ? usdCnyRate : null,
      marketValue: hasUnpricedPositions ? null : marketValue,
      costValue,
      floatingPnl: hasUnpricedPositions ? null : floatingPnl,
      realizedPnl,
      totalPnl: hasUnpricedPositions || floatingPnl === null || realizedPnl === null ? null : floatingPnl + realizedPnl,
      positionCount: positions.length,
      unpricedPositionCount: cnySummary.unpricedPositionCount,
      currencySummaries,
      isMixedCurrency,
      dailyChange: isMixedCurrency ? null : dailyChange,
      dailyChangePercent: isMixedCurrency ? null : dailyChangePercent,
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
  return { ...access, viewerUserId: input.userId, accountingMode: "stock_portfolio" as const, ...portfolio, realizedLots: access.canEdit ? portfolio.realizedLots : [], history };
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
  const memberPortfolio = await getCachedMemberStockPortfolio(access.categoryId, input.userId);
  if (!memberPortfolio.isEligible && !access.canEdit) throw new Error("该股票标签尚未对您开放");
  const { soldLots: _soldLots, realizedLots: _realizedLots, ...portfolio } = await buildPortfolio(access.categoryId);
  // 批次备注是管理员维护信息；成员只需看到已分配批次的价格与数量，不能读取备注。
  const publicPositions = portfolio.positions.map((position) => ({
    ...position,
    lots: position.lots.map(({ note: _note, ...lot }: any) => lot),
  }));
  return { ...access, accountingMode: "stock_portfolio" as const, ...portfolio, positions: publicPositions, history: [] as any[] };
}

/** Tag-wide calendar only. Keeps the personal overview and all funds APIs untouched. */
export async function getStockTagCalendar(input: {
  ledgerId: number; categoryId: number; userId: number; systemRole?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, false, false);
  if (!access.canEdit && !await isStockCalendarMemberEligible(access, input.userId)) {
    throw new Error("该股票标签尚未对您开放");
  }
  // Cache miss/pending keeps the compatible [] shape; absolutely no DDL/rebuild/quote calls here.
  return readStockCalendarResult(access.categoryId);
}

/** Exactly the previous visibleParticipations definition, including settled real allocations.
 * Observations and future allocations do not grant access; pause/remaining quantity don't revoke it.
 */
async function isStockCalendarMemberEligible(access: Access, userId: number): Promise<boolean> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT 1 AS eligible FROM ledger_stock_lot_participations p
     INNER JOIN ledger_stock_lots l ON l.id=p.lot_id AND l.ledger_id=p.ledger_id AND l.category_id=p.category_id
     WHERE p.ledger_id=? AND p.category_id=? AND p.user_id=? AND p.allocated_quantity>0
       AND COALESCE(DATE_FORMAT(p.start_date,'%Y-%m-%d'),DATE_FORMAT(l.opened_at,'%Y-%m-%d'),?)<=?
     LIMIT 1`, [access.ledgerId, access.categoryId, userId, beijingDate(), beijingDate()]);
  return (rows as any[]).length > 0;
}

/** Background-only: reuse all original sources and the same ready/unready reconstruction engine. */
async function calculateStockTagCalendar(access: Pick<Access, 'categoryId' | 'ledgerId'>, now: Date, conn: any) {
  const [lotRows] = await (conn as any).execute(
    `SELECT l.id,l.symbol,l.initial_quantity,l.unit_cost,opening.transaction_fee AS opening_fee,
      DATE_FORMAT(opening.actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at
     FROM ledger_stock_lots l
     INNER JOIN ledger_stock_events opening ON opening.id=l.opened_event_id
       AND opening.ledger_id=l.ledger_id AND opening.category_id=l.category_id AND opening.status='active'
     WHERE l.ledger_id=? AND l.category_id=?`, [STOCK_LEDGER_ID, access.categoryId]);
  if (!(lotRows as any[]).length) return [];
  const [saleRows] = await (conn as any).execute(
    `SELECT a.lot_id,a.quantity,e.execution_price,e.quantity AS event_quantity,e.transaction_fee,l.symbol,
      DATE_FORMAT(e.actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at
     FROM ledger_stock_event_lot_allocations a
     INNER JOIN ledger_stock_events e ON e.id=a.event_id AND e.status='active' AND e.event_type IN ('reduce','sell')
     INNER JOIN ledger_stock_lots l ON l.id=a.lot_id AND l.ledger_id=e.ledger_id AND l.category_id=e.category_id
     INNER JOIN ledger_stock_events opening ON opening.id=l.opened_event_id AND opening.status='active'
     WHERE e.ledger_id=? AND e.category_id=?`, [STOCK_LEDGER_ID, access.categoryId]);
  const [tableRows] = await (conn as any).execute(
    `SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE()
     AND table_name IN ('ledger_stock_unified_close_prices','ledger_stock_unified_close_fx')`);
  const tableNames = new Set((tableRows as any[]).map(row => String(row.TABLE_NAME || row.table_name)));
  const [legacyRows] = await (conn as any).execute(
    `SELECT symbol,DATE_FORMAT(price_date,'%Y-%m-%d') AS price_date,price,
      DATE_FORMAT(captured_at,'%Y-%m-%d %H:%i:%s') AS captured_at
     FROM ledger_stock_price_snapshots WHERE ledger_id=? AND category_id=? ORDER BY captured_at ASC`,
    [STOCK_LEDGER_ID, access.categoryId]);
  const [quoteRows] = tableNames.has('ledger_stock_unified_close_prices')
    ? await (conn as any).execute(
      `SELECT symbol,DATE_FORMAT(session_date,'%Y-%m-%d') AS price_date,price,source,
        DATE_FORMAT(captured_at,'%Y-%m-%d %H:%i:%s') AS captured_at
       FROM ledger_stock_unified_close_prices WHERE ledger_id=? AND category_id=? ORDER BY captured_at ASC`,
      [STOCK_LEDGER_ID, access.categoryId]) : [[]];
  const [fxRows] = tableNames.has('ledger_stock_unified_close_fx')
    ? await (conn as any).execute(
      `SELECT DATE_FORMAT(snapshot_date,'%Y-%m-%d') AS snapshot_date,usd_cny_rate,source,
        DATE_FORMAT(quote_as_of,'%Y-%m-%d %H:%i:%s') AS quote_as_of,
        DATE_FORMAT(locked_at,'%Y-%m-%d %H:%i:%s') AS locked_at
       FROM ledger_stock_unified_close_fx WHERE ledger_id=? AND category_id=? AND policy_version=? ORDER BY snapshot_date ASC`,
      [STOCK_LEDGER_ID, access.categoryId, STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION]) : [[]];
  const { buildStockTotalCalendar } = await import('./shared/stock-total-calendar');
  return buildStockTotalCalendar({
    lots: (lotRows as any[]).map(row => ({ id: Number(row.id), symbol: String(row.symbol),
      initialQuantity: calendarSourceNumber(row.initial_quantity), unitCost: calendarSourceNumber(row.unit_cost),
      openingFee: row.opening_fee == null ? null : Number(row.opening_fee),
      openedDate: marketSessionDateFromBeijingTradeTimestamp(row.actual_traded_at, stockMarket(String(row.symbol))) })),
    sales: (saleRows as any[]).map(row => ({ lotId: Number(row.lot_id), quantity: calendarSourceNumber(row.quantity),
      salePrice: calendarSourceNumber(row.execution_price), eventQuantity: calendarSourceNumber(row.event_quantity),
      transactionFee: row.transaction_fee == null ? null : Number(row.transaction_fee),
      closeDate: marketSessionDateFromBeijingTradeTimestamp(row.actual_traded_at, stockMarket(String(row.symbol))) })),
    quotes: [...(legacyRows as any[]).filter(row => stockMarket(String(row.symbol)) === 'A')
      .map(row => ({ ...row, source: 'price_snapshot' })), ...(quoteRows as any[])].map(row => ({
        symbol: String(row.symbol), price: calendarSourceNumber(row.price), priceDate: String(row.price_date),
        capturedAt: toBeijingWallClockIso(row.captured_at), source: String(row.source) })),
    fx: (fxRows as any[]).map(row => ({ snapshotDate: String(row.snapshot_date),
      usdCnyRate: row.usd_cny_rate == null ? null : Number(row.usd_cny_rate), source: String(row.source),
      asOf: toBeijingWallClockIso(row.quote_as_of), lockedAt: toBeijingWallClockIso(row.locked_at) })),
    now,
  }).sort((left, right) => right.snapshotDate.localeCompare(left.snapshotDate));
}

/** Never convert unknown required historical numbers into a plausible zero. */
function calendarSourceNumber(value: unknown): number {
  return value == null || value === '' ? Number.NaN : Number(value);
}

/** Internal scheduler/admin tool API; category validation is not a replacement for route authorization. */
export function rebuildStockTagCalendarResult(input: { categoryId: number; now?: Date; force?: boolean }) {
  return rebuildCachedStockCalendarResult({ ...input, calculate: async (conn, now) => {
    const [rows] = await conn.execute(`SELECT id FROM ledger_categories
      WHERE id=? AND ledgerId=? AND parentId IS NULL AND accounting_mode='stock_portfolio' LIMIT 1`,
    [input.categoryId, STOCK_LEDGER_ID]);
    if (!(rows as any[]).length) throw new Error("该标签不是37号股票持仓模式");
    return calculateStockTagCalendar({ categoryId: input.categoryId, ledgerId: STOCK_LEDGER_ID }, now, conn);
  } });
}

/** Startup/15:05/retry warm. Unchanged generations and settlement versions skip full reconstruction. */
export async function warmAllStockTagCalendarResults(options: { force?: boolean; now?: Date } = {}) {
  await ensureStockCalendarResultTable();
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(`SELECT id FROM ledger_categories
    WHERE ledgerId=? AND parentId IS NULL AND accounting_mode='stock_portfolio'`, [STOCK_LEDGER_ID]);
  const results: Array<Awaited<ReturnType<typeof rebuildStockTagCalendarResult>> & { error?: string }> = [];
  // Sequential tags keep startup repair bounded; per-tag singleflight also merges trade-triggered warm.
  for (const row of rows as any[]) {
    const categoryId = Number(row.id);
    try { results.push(await rebuildStockTagCalendarResult({ categoryId, ...options })); }
    catch (error) {
      console.error(`[37股票日历] ${categoryId} 后台生成失败，旧结果保留`, error);
      results.push({ categoryId, saved: false, status: 'superseded', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { categories: results.length, saved: results.filter(result => result.saved).length,
    complete: results.every(result => result.status === 'saved' || result.status === 'up-to-date'), results };
}

/** Only successful physical-trade mutations request background warm, never intraday/member config. */
function queueStockCalendarResultRebuild(categoryId: number) {
  // A mutation may arrive just as a shared flight completes; one clean metadata recheck
  // after it settles avoids losing that dirty signal without adding another full compute.
  void rebuildStockTagCalendarResult({ categoryId }).then(async () => {
    await rebuildStockTagCalendarResult({ categoryId });
    await repairPendingStockTagCalendarEvidence({ categoryId });
  }).catch(error => {
    console.error(`[37股票日历] ${categoryId} 成交后重建失败，等待后台重试`, error);
  });
}

let calendarEvidenceRepairInProgress = false;
/** Background-only repair of older pending cells, including backdated trades outside the 14-day startup window.
 * Only missing verified close/FX evidence is inserted by the publisher; existing amounts and wallet are untouched.
 * A bounded batch keeps repair out of request latency; later scheduler retries continue any remaining cells.
 */
export async function repairPendingStockTagCalendarEvidence(options: { categoryId?: number } = {}) {
  if (calendarEvidenceRepairInProgress) return { attempted: 0, busy: true };
  calendarEvidenceRepairInProgress = true;
  let attempted = 0;
  try {
    const conn = await getDbConnection();
    if (!conn) throw new Error('数据库连接不可用');
    const [categories] = await (conn as any).execute(
      `SELECT id FROM ledger_categories WHERE ledgerId=? AND parentId IS NULL AND accounting_mode='stock_portfolio'
       ${options.categoryId === undefined ? '' : 'AND id=?'}`,
      options.categoryId === undefined ? [STOCK_LEDGER_ID] : [STOCK_LEDGER_ID, options.categoryId]);
    for (const category of categories as any[]) {
      const categoryId = Number(category.id);
      const pendingDates = (await readStockCalendarResult(categoryId))
        .filter(point => (!point.ready || point.dailyPnl === null) && isUnifiedStockCloseReady(point.snapshotDate))
        .map(point => point.snapshotDate).sort().slice(0, 14);
      for (const snapshotDate of pendingDates) {
        attempted++;
        await refreshLedgerStockTagCloseSnapshots({ categoryId, snapshotDate });
      }
      if (pendingDates.length) await rebuildStockTagCalendarResult({ categoryId });
    }
    return { attempted, busy: false };
  } finally {
    calendarEvidenceRepairInProgress = false;
  }
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
            DATE_FORMAT(opening.actual_traded_at, '%Y-%m-%d %H:%i:%s') AS opening_actual_traded_at,
            COALESCE(SUM(c.quantity), 0) AS closed_quantity,
            COALESCE(SUM(c.quantity * c.sale_price), 0) AS closed_value,
            MAX(c.closed_at) AS closed_at,
            COALESCE(SUM(c.quantity * (p.entry_price - c.sale_price)), 0) AS realized_pnl
     FROM ledger_stock_lot_participations p
     INNER JOIN ledger_stock_lots l ON l.id = p.lot_id
     LEFT JOIN ledger_stock_events opening ON opening.id = l.opened_event_id
       AND opening.ledger_id = p.ledger_id AND opening.category_id = p.category_id
     LEFT JOIN ledger_stock_participation_closures c ON c.participation_id = p.id
     WHERE p.category_id = ? AND p.user_id = ? AND p.allocated_quantity > 0
     GROUP BY p.id
     ORDER BY COALESCE(p.start_date, DATE(l.opened_at)) ASC, p.assigned_at ASC, p.id ASC`,
    [categoryId, userId],
  );

  const today = beijingDate();
  const participations = (rows as any[]).map((row) => {
    const startDate = normalizeStoredDate(row.start_date) || normalizeStoredDate(row.opened_at) || today;
    const openingSessionDate = marketSessionDateFromBeijingTradeTimestamp(row.opening_actual_traded_at, stockMarket(String(row.symbol)));
    const businessEffectiveDate = normalizeStoredDate(row.start_date) || openingSessionDate;
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
      // Manual start_date is an A business-effective date, not a NY physical opening session.
      // Physical US opening requires actual time; CNY may use its explicit business date if absent.
      historyStartDate: openingSessionDate || (stockMarket(String(row.symbol)) === 'A' ? businessEffectiveDate : null),
      participationEffectiveDate: businessEffectiveDate,
      allocatedQuantity,
      remainingQuantity,
      closedQuantity: numberValue(row.closed_quantity),
      closedValue: numberValue(row.closed_value),
      closedAt: toIso(row.closed_at),
      entryPrice: numberValue(row.entry_price),
      lotInitialQuantity,
      allocationRatio: lotInitialQuantity > EPSILON ? allocatedQuantity / lotInitialQuantity : 0,
      realizedPnl: numberValue(row.realized_pnl),
    };
  });
  const visibleParticipations = participations.filter((item) => item.startDate <= today);
  const activeParticipations = visibleParticipations.filter((item) => item.remainingQuantity > EPSILON);
  const symbols = Array.from(new Set(activeParticipations.map((item) => item.symbol)));
  // 持仓/资金API的当前浮盈可读取盘中报价；A日15:05历史和R1概览使用独立日结。
  // 买入审计已保存的参考价仅作为“没有任何已存价格”的最后回退，不能覆盖盘中或盘尾报价。
  // 盘后新登记可在实时持仓页显示参考价，但绝不能据此改变已完成日结统计。
  const [referenceQuotes, storedQuotes, intradayQuotes, usStockExchanges] = await Promise.all([
    getLatestReferenceQuotes(categoryId),
    getLatestQuotes(categoryId, symbols),
    getLatestIntradayQuotes(categoryId, symbols),
    getUsStockExchangeMap(symbols),
  ]);
  const quotes = mergeLatestQuoteMaps(referenceQuotes, storedQuotes, intradayQuotes);
  const grouped = new Map<string, any>();
  for (const item of activeParticipations) {
    const current = grouped.get(item.symbol) || {
      symbol: item.symbol,
      stockName: item.stockName,
      currency: stockCurrency(item.symbol),
      market: stockMarket(item.symbol),
      exchange: stockMarket(item.symbol) === 'US' ? (usStockExchanges[item.symbol] || null) : null,
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
  const currencySummaries = summarizePositionsByCurrency(positions);
  const isMixedCurrency = currencySummaries.length > 1;
  const usdCnyRate = Number(getUsdtCnyRate() || 0);
  const cnySummary = summarizePositionsInCny(positions, usdCnyRate);
  const closedLots = visibleParticipations
    .filter((item) => item.remainingQuantity <= EPSILON)
    .map((item) => {
      const soldQuantity = item.closedQuantity;
      const sellValue = item.closedValue;
      return {
        // 管理员总账户会按此稳定批次标识匹配自己的平仓份额；
        // 成员端仍只读取自身已获配的记录，不会获得其他成员的信息。
        lotId: item.lotId,
        participationId: item.id,
        allocationRatio: item.allocationRatio,
        symbol: item.symbol,
        stockName: item.stockName,
        openedAt: item.openedAt,
        startDate: item.startDate,
        soldAt: item.closedAt,
        initialQuantity: item.allocatedQuantity,
        soldQuantity,
        unitCost: item.entryPrice,
        sellPrice: soldQuantity > EPSILON ? sellValue / soldQuantity : null,
        buyValue: soldQuantity * item.entryPrice,
        sellValue,
        currency: stockCurrency(item.symbol),
        realizedPnl: item.realizedPnl,
      };
    });
  const costValue = cnySummary.costValue;
  const realizedPnl = cnySummary.fxUnavailable
    ? null
    : visibleParticipations.reduce((total, item) => {
      const multiplier = stockCurrency(item.symbol) === 'USD' ? usdCnyRate : 1;
      return total + item.realizedPnl * multiplier;
    }, 0);
  const allPositionsPriced = cnySummary.unpricedPositionCount === 0 && !cnySummary.fxUnavailable;
  const marketValue = cnySummary.marketValue;
  const floatingPnl = cnySummary.floatingPnl;
  const quoteDates = positions.map((position) => position.quoteDate).filter((date): date is string => Boolean(date));
  // 实时持仓/资金summary仍按各自最新报价估值，不改变参考押金或冻结/提现口径。
  // R1概览另映射settlementSummary，不允许实时行情带动日结累计回报。
  const valuationDate = allPositionsPriced && quoteDates.length === positions.length
    ? quoteDates.sort().at(-1) || null
    : null;

  const historicalSymbols = Array.from(new Set(visibleParticipations.map(item => item.symbol)));
  const [priceRows] = historicalSymbols.length > 0
    ? await (conn as any).execute(
      `SELECT symbol, DATE_FORMAT(price_date,'%Y-%m-%d') AS price_date, price,
         DATE_FORMAT(captured_at,'%Y-%m-%d %H:%i:%s') AS captured_at
       FROM ledger_stock_price_snapshots
       WHERE ledger_id = ? AND category_id = ? AND symbol IN (${historicalSymbols.map(() => '?').join(',')})
       ORDER BY price_date ASC`,
      [STOCK_LEDGER_ID, categoryId, ...historicalSymbols],
    )
    : [[]];
  const [closureRows] = await (conn as any).execute(
    `SELECT c.participation_id, c.quantity, c.sale_price,
            DATE_FORMAT(e.actual_traded_at, '%Y-%m-%d %H:%i:%s') AS actual_traded_at
     FROM ledger_stock_participation_closures c
     INNER JOIN ledger_stock_lot_participations p ON p.id = c.participation_id
     INNER JOIN ledger_stock_events e ON e.id = c.sell_event_id
     WHERE p.ledger_id = ? AND p.category_id = ? AND p.user_id = ?
       AND e.ledger_id = p.ledger_id AND e.category_id = p.category_id AND e.status = 'active'`,
    [STOCK_LEDGER_ID, categoryId, userId],
  );
  const [newTables] = await (conn as any).execute(
    `SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE()
     AND table_name IN ('ledger_stock_unified_close_prices','ledger_stock_unified_close_category_publications','ledger_stock_unified_close_fx')`,
  );
  const tableNames = new Set((newTables as any[]).map(row => String(row.TABLE_NAME || row.table_name)));
  const [fxRows] = tableNames.has('ledger_stock_unified_close_fx')
    ? await (conn as any).execute(
      `SELECT DATE_FORMAT(snapshot_date,'%Y-%m-%d') AS snapshot_date, usd_cny_rate, source,
         DATE_FORMAT(quote_as_of,'%Y-%m-%d %H:%i:%s') AS quote_as_of,
         DATE_FORMAT(locked_at,'%Y-%m-%d %H:%i:%s') AS locked_at
       FROM ledger_stock_unified_close_fx
       WHERE ledger_id = ? AND category_id = ? AND policy_version = ? ORDER BY snapshot_date ASC`,
      [STOCK_LEDGER_ID, categoryId, STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION],
    ) : [[]];
  const [unifiedRows] = tableNames.has('ledger_stock_unified_close_prices') && historicalSymbols.length > 0
    ? await (conn as any).execute(
      `SELECT symbol, DATE_FORMAT(session_date,'%Y-%m-%d') AS price_date, price,
         DATE_FORMAT(captured_at,'%Y-%m-%d %H:%i:%s') AS captured_at, source
       FROM ledger_stock_unified_close_prices
       WHERE ledger_id = ? AND category_id = ?
         AND source IN ('unified_close_yahoo','unified_close_tushare','unified_close_sina')
         AND symbol IN (${historicalSymbols.map(() => '?').join(',')})`,
      [STOCK_LEDGER_ID, categoryId, ...historicalSymbols],
    ) : [[]];
  const [publicationRows] = tableNames.has('ledger_stock_unified_close_category_publications')
    ? await (conn as any).execute(
      `SELECT DATE_FORMAT(snapshot_date,'%Y-%m-%d') AS snapshot_date, usd_cny_rate FROM ledger_stock_unified_close_category_publications
       WHERE ledger_id = ? AND category_id = ?
         AND policy_version IN (CONCAT('cn-us-regular-close-v1:', snapshot_date), CONCAT('cn-day-us-overnight-1505-v1:', snapshot_date))
         ORDER BY snapshot_date ASC, CASE WHEN policy_version LIKE 'cn-day-us-overnight-1505-v1:%' THEN 1 ELSE 0 END ASC`,
      [STOCK_LEDGER_ID, categoryId],
    ) : [[]];
  const historicalQuotes: MemberCalendarQuote[] = [...(priceRows as any[]).filter(row => stockMarket(String(row.symbol)) === 'A')
    .map(row => ({ ...row, source: 'price_snapshot' })), ...(unifiedRows as any[])].map(row => ({
      symbol: String(row.symbol), price: numberValue(row.price), priceDate: normalizeStoredDate(row.price_date) || '',
      capturedAt: toBeijingWallClockIso(row.captured_at), source: String(row.source),
    }));
  const dailySnapshots = buildMemberStockCalendar({
    participations: visibleParticipations,
    closures: (closureRows as any[]).map(row => ({ participationId: Number(row.participation_id),
      quantity: numberValue(row.quantity), salePrice: numberValue(row.sale_price),
      closeDate: marketSessionDateFromBeijingTradeTimestamp(row.actual_traded_at,
        stockMarket(visibleParticipations.find(item => item.id === Number(row.participation_id))?.symbol || '')) || '' })),
    quotes: historicalQuotes,
    candidateDates: (priceRows as any[]).map(row => normalizeStoredDate(row.price_date) || ''),
    fx: (fxRows as any[]).map(row => ({
      snapshotDate: normalizeStoredDate(row.snapshot_date) || '',
      usdCnyRate: row.usd_cny_rate == null ? null : numberValue(row.usd_cny_rate),
      source: row.source == null ? null : String(row.source),
      asOf: row.quote_as_of == null ? null : toBeijingWallClockIso(row.quote_as_of),
      lockedAt: row.locked_at == null ? null : toBeijingWallClockIso(row.locked_at),
    })),
  });
  const latestSnapshot = dailySnapshots[dailySnapshots.length - 1] || null;
  const priorSnapshot = dailySnapshots.length > 1 ? dailySnapshots[dailySnapshots.length - 2] : null;
  const dailyChange = latestSnapshot?.dailyPnl ?? null;
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
    settlementSummary: memberCalendarSettlementSummary(dailySnapshots),
    summary: {
      reportingCurrency: 'CNY' as const,
      usdCnyRate: usdCnyRate > 0 ? usdCnyRate : null,
      marketValue,
      costValue,
      floatingPnl,
      realizedPnl,
      totalPnl: floatingPnl === null || realizedPnl === null ? null : floatingPnl + realizedPnl,
      positionCount: positions.length,
      unpricedPositionCount: cnySummary.unpricedPositionCount,
      currencySummaries,
      isMixedCurrency,
      dailyChange,
      dailyChangePercent,
      dailyChangeReady: latestSnapshot?.dailyPnlReady ?? false,
      dailyChangeDate: latestSnapshot?.snapshotDate ?? null,
      previousDate: latestSnapshot?.previousDate ?? null,
      latestSnapshot,
      priorSnapshot,
      valuationDate,
      awaitingFirstClose: positions.length > 0 && !dailySnapshots.some(snapshot => snapshot.ready),
    },
  };
}

function getCachedMemberStockPortfolio(categoryId: number, userId: number) {
  return readShortLivedCache(
    memberPortfolioReadCache,
    `${categoryId}:${userId}`,
    () => buildMemberStockPortfolio(categoryId, userId),
  );
}

/** 缺表仅返回空观察配置；任何观察读取都不能通过 ensure 执行 DDL。 */
async function stockObservationTableExists(conn: any): Promise<boolean> {
  const [rows] = await conn.execute(
    `SELECT TABLE_NAME FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'ledger_stock_lot_observations' LIMIT 1`,
  );
  return (rows as any[]).length > 0;
}

async function getStockLotObservations(ledgerId: number, categoryId: number, userId?: number): Promise<StockLotObservation[]> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  if (!await stockObservationTableExists(conn)) return [];
  const [rows] = await (conn as any).execute(
    `SELECT o.lot_id, o.user_id, o.enabled, o.quantity, o.entry_price,
            DATE_FORMAT(o.start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(o.pause_date, '%Y-%m-%d') AS pause_date,
            o.assigned_by, o.created_at, o.updated_at,
            l.symbol, l.stock_name, l.initial_quantity,
            COALESCE(sales.sold_quantity, 0) AS sold_quantity,
            sales.sold_value, sales.sold_at,
            DATE_FORMAT(sales.sold_at, '%Y-%m-%d') AS sold_date
     FROM ledger_stock_lot_observations o
     INNER JOIN ledger_stock_lots l ON l.id = o.lot_id AND l.ledger_id = o.ledger_id AND l.category_id = o.category_id
     INNER JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id AND opening_event.status = 'active'
     LEFT JOIN (
       SELECT a.lot_id, SUM(a.quantity) AS sold_quantity,
              CASE WHEN SUM(CASE WHEN e.execution_price IS NULL OR e.execution_price < 0 THEN 1 ELSE 0 END) > 0
                THEN NULL ELSE SUM(a.quantity * e.execution_price) END AS sold_value,
              MAX(COALESCE(e.actual_traded_at, e.server_registered_at)) AS sold_at
       FROM ledger_stock_event_lot_allocations a
       INNER JOIN ledger_stock_events e ON e.id = a.event_id
       WHERE e.ledger_id = ? AND e.category_id = ? AND e.status = 'active' AND e.event_type IN ('reduce','sell')
       GROUP BY a.lot_id
     ) sales ON sales.lot_id = l.id
     WHERE o.ledger_id = ? AND o.category_id = ?${userId === undefined ? '' : ' AND o.user_id = ? AND o.enabled = 1 AND o.quantity > 0'}
     ORDER BY o.start_date ASC, o.lot_id ASC, o.user_id ASC`,
    [ledgerId, categoryId, ledgerId, categoryId, ...(userId === undefined ? [] : [userId])],
  );
  return (rows as any[]).map((row) => {
    const initialQuantity = numberValue(row.initial_quantity);
    const soldQuantity = numberValue(row.sold_quantity);
    const lotCurrentQuantity = Math.max(0, initialQuantity - soldQuantity);
    return {
      lotId: Number(row.lot_id), userId: Number(row.user_id), enabled: Number(row.enabled) === 1,
      quantity: numberValue(row.quantity), entryPrice: numberValue(row.entry_price), startDate: String(row.start_date),
      pauseDate: normalizeStoredDate(row.pause_date),
      assignedBy: Number(row.assigned_by), createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at),
      symbol: String(row.symbol), stockName: String(row.stock_name), initialQuantity,
      lotCurrentQuantity: lotCurrentQuantity <= EPSILON ? 0 : lotCurrentQuantity,
      soldQuantity,
      soldValue: row.sold_value === null || row.sold_value === undefined ? null : Number(row.sold_value),
      soldAt: row.sold_at ? toIso(row.sold_at) : null, soldDate: row.sold_date || null,
    };
  });
}

function toStockObservationQuote(
  symbol: string,
  quoteMap: Record<string, StoredQuote>,
  referenceQuotes: Record<string, StoredQuote>,
  storedQuotes: Record<string, StoredQuote>,
  intradayQuotes: Record<string, StoredQuote>,
): StockObservationQuote | null {
  const quote = quoteMap[symbol];
  if (!quote) return null;
  return {
    price: quote.price, updatedAt: quote.updatedAt || null, priceDate: quote.priceDate || null,
    source: quote.source ?? (quote === intradayQuotes[symbol] ? 'intraday'
      : quote === storedQuotes[symbol] ? 'close' : quote === referenceQuotes[symbol] ? 'reference' : 'unavailable'),
  };
}

export type StockObservationPauseContext = {
  pauseDate: string;
  observationValuation: StockObservationValuation;
  quote: StockObservationQuote | null;
};

/**
 * 仅SELECT：供已授权观察沙箱预览调用（路由仍须校验批次所属标签和管理员权限）。
 * 返回as-of原批次数量/截至当日售出及已存历史报价；不可用于真实资金结算。
 * 空/未来暂停应由调用方继续使用matrix.observationValuation及实时quote。
 */
export async function getStockObservationPauseContext(lotId: number, pauseDate: string): Promise<StockObservationPauseContext | null> {
  if (!Number.isSafeInteger(lotId) || lotId <= 0) throw new Error("持仓编号无效");
  validateStockObservationStartDate(pauseDate);
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  const [rows] = await (conn as any).execute(
    `SELECT l.id, l.category_id, l.symbol, l.initial_quantity,
            COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN a.quantity ELSE 0 END), 0) AS sold_quantity,
            CASE WHEN SUM(CASE WHEN e.id IS NOT NULL AND (e.execution_price IS NULL OR e.execution_price < 0)
              THEN 1 ELSE 0 END) > 0 THEN NULL ELSE SUM(CASE WHEN e.id IS NOT NULL THEN a.quantity * e.execution_price ELSE 0 END) END AS sold_value,
            MAX(COALESCE(e.actual_traded_at, e.server_registered_at)) AS sold_at
     FROM ledger_stock_lots l
     INNER JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id AND opening_event.status = 'active'
     LEFT JOIN ledger_stock_event_lot_allocations a ON a.lot_id = l.id
     LEFT JOIN ledger_stock_events e ON e.id = a.event_id AND e.ledger_id = l.ledger_id AND e.category_id = l.category_id
       AND e.status = 'active' AND e.event_type IN ('reduce','sell')
       AND COALESCE(e.actual_traded_at, e.server_registered_at) < DATE_ADD(?, INTERVAL 1 DAY)
     WHERE l.id = ? AND l.ledger_id = ?
     GROUP BY l.id`,
    [pauseDate, lotId, STOCK_LEDGER_ID],
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  const initialQuantity = numberValue(row.initial_quantity);
  const soldQuantity = numberValue(row.sold_quantity);
  const remaining = Math.max(0, initialQuantity - soldQuantity);
  const observationValuation: StockObservationValuation = {
    initialQuantity, lotCurrentQuantity: remaining <= EPSILON ? 0 : remaining, soldQuantity,
    soldValue: row.sold_value === null || row.sold_value === undefined ? null : Number(row.sold_value),
    soldAt: row.sold_at ? toIso(row.sold_at) : null,
    soldDate: row.sold_at ? normalizeStoredDate(row.sold_at) : null,
  };
  if (observationValuation.lotCurrentQuantity === 0) return { pauseDate, observationValuation, quote: null };
  const categoryId = Number(row.category_id);
  const symbol = String(row.symbol);
  const archivedQuotes = await getArchivedQuotesAsOf(categoryId, [symbol], pauseDate);
  if (archivedQuotes[symbol]) {
    return { pauseDate, observationValuation, quote: toStockObservationQuote(symbol, archivedQuotes, {}, {}, {}) };
  }
  // 旧历史没有archive时只安全读取尚未被覆写的旧快照/审计，不回填、不使用未来行情。
  const [referenceQuotes, storedQuotes, intradayQuotes] = await Promise.all([
    getLatestReferenceQuotes(categoryId, pauseDate),
    getLatestQuotes(categoryId, [symbol], pauseDate),
    getLatestIntradayQuotes(categoryId, [symbol], pauseDate),
  ]);
  const safeMaps = [referenceQuotes, storedQuotes, intradayQuotes].map((map) => Object.fromEntries(
    Object.entries(map).filter(([, quote]) => isQuoteAtOrBefore(quote, pauseDate)),
  ));
  const quoteMap = mergeLatestQuoteMaps(...safeMaps);
  const quote = toStockObservationQuote(symbol, quoteMap, referenceQuotes, storedQuotes, intradayQuotes);
  return { pauseDate, observationValuation, quote };
}

async function getStockObservationPauseContexts(observations: readonly StockLotObservation[], today: string) {
  const contexts = new Map<string, StockObservationPauseContext | null>();
  const requests = new Map<string, { lotId: number; pauseDate: string }>();
  for (const observation of observations) {
    if (observation.pauseDate && observation.pauseDate <= today && observation.startDate <= today) {
      requests.set(`${observation.lotId}:${observation.pauseDate}`, { lotId: observation.lotId, pauseDate: observation.pauseDate });
    }
  }
  await Promise.all(Array.from(requests, async ([key, request]) => {
    contexts.set(key, await getStockObservationPauseContext(request.lotId, request.pauseDate));
  }));
  return contexts;
}

/**
 * 本人独立观察组合；即使没有实际获配份额也能读取。不调用真实 eligibility/portfolio，
 * 不生成 snapshot/closure，不刷新或写入行情。管理员查看其他用户须由路由单独授权。
 */
export async function getMyStockTagObservationPortfolio(input: {
  ledgerId: number;
  categoryId: number;
  userId: number;
  systemRole?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, false, false);
  const observations = await getStockLotObservations(access.ledgerId, access.categoryId, input.userId);
  const today = beijingDate();
  const pauseContexts = await getStockObservationPauseContexts(observations, today);
  // 全平仓不读取实时行情，仅以实际批次卖出加权价冻结观察回报。
  const symbols = Array.from(new Set(observations.filter((item) => item.lotCurrentQuantity > 0
    && (!item.pauseDate || item.pauseDate > today)).map((item) => item.symbol)));
  const [referenceQuotes, storedQuotes, intradayQuotes] = symbols.length === 0 ? [{}, {}, {}] : await Promise.all([
    getLatestReferenceQuotes(access.categoryId),
    getLatestQuotes(access.categoryId, symbols),
    getLatestIntradayQuotes(access.categoryId, symbols),
  ]);
  const quoteMap = mergeLatestQuoteMaps(referenceQuotes, storedQuotes, intradayQuotes);
  const holdings: StockObservationHolding[] = observations.flatMap((item) => {
    const context = pauseContexts.get(`${item.lotId}:${item.pauseDate}`);
    const paused = item.startDate <= today && !!item.pauseDate && item.pauseDate <= today;
    // 缺失as-of批次时不借用未来售出数据；不伪造观察已结束或零估值。
    if (paused && !context) throw new Error("观察暂停估值批次不可用，请刷新后重试");
    const holding = buildStockObservationHolding(context ? { ...item, ...context.observationValuation } : item,
      paused ? context?.quote ?? null : toStockObservationQuote(item.symbol, quoteMap, referenceQuotes, storedQuotes, intradayQuotes), today);
    return holding ? [holding] : [];
  });
  return {
    ...access,
    viewerUserId: input.userId,
    accountingMode: "stock_portfolio" as const,
    observationView: true as const,
    holdings,
    summary: summarizeStockObservationHoldings(holdings),
  };
}

/** 观察专属入口目录，不改变真实 getMyStockTagOverview / isEligible。 */
export async function getMyStockTagObservationOverview(input: { ledgerId: number; userId: number; systemRole?: string }) {
  const categories: Array<{ categoryId: number; categoryName: string; holdingCount: number }> = [];
  if (input.ledgerId !== STOCK_LEDGER_ID) return { categories };
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  if (!await stockObservationTableExists(conn)) return { categories };
  const [rows] = await (conn as any).execute(
    `SELECT c.id, c.name, COUNT(DISTINCT o.lot_id) AS holding_count
     FROM ledger_stock_lot_observations o
     INNER JOIN ledger_categories c ON c.id = o.category_id AND c.ledgerId = o.ledger_id
     INNER JOIN ledger_stock_lots l ON l.id = o.lot_id AND l.category_id = o.category_id AND l.ledger_id = o.ledger_id
     INNER JOIN ledger_stock_events e ON e.id = l.opened_event_id AND e.status = 'active'
     WHERE o.ledger_id = ? AND o.user_id = ? AND o.enabled = 1 AND o.quantity > 0
       AND c.parentId IS NULL AND c.accounting_mode = 'stock_portfolio'
     GROUP BY c.id, c.name, c.sortOrder ORDER BY c.sortOrder ASC, c.id ASC`,
    [input.ledgerId, input.userId],
  );
  for (const row of rows as any[]) {
    try {
      const access = await assertStockTagAccess(input.ledgerId, Number(row.id), input.userId, input.systemRole, false, false);
      categories.push({ categoryId: access.categoryId, categoryName: access.categoryName, holdingCount: Number(row.holding_count) });
    } catch (error) {
      if (error instanceof Error && (error.message === "您无权查看此标签" || error.message === "该标签不是股票持仓模式")) continue;
      throw error;
    }
  }
  return { categories };
}

export async function getMyStockTagParticipantPortfolio(input: {
  ledgerId: number;
  categoryId: number;
  userId: number;
  systemRole?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole);
  // 普通成员只读取自己获配批次的估值，不能取得标签完整操作历史。
  const portfolio = await getCachedMemberStockPortfolio(access.categoryId, input.userId);
  if (!portfolio.isEligible && !access.canEdit) throw new Error("该股票标签尚未对您开放");
  return {
    ...access,
    accountingMode: "stock_portfolio" as const,
    participantView: true,
    ...portfolio,
    history: [] as any[],
  };
}

/** All immediately-visible stock tags for the effective member, used by 37's overview table. */
async function buildMyStockTagOverview(input: { ledgerId: number; userId: number; systemRole?: string }) {
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
    let access: Access;
    try {
      access = await assertStockTagAccess(input.ledgerId, Number(category.id), input.userId, input.systemRole);
    } catch (error) {
      if (error instanceof Error && error.message === "您无权查看此标签") continue;
      throw error;
    }
    const portfolio = await getCachedMemberStockPortfolio(Number(category.id), input.userId);
    if (!portfolio.isEligible) continue;
    // R1只展示最近已过A交易日15:05的同scope日结；持仓/资金summary仍独立实时估值。
    const points = portfolio.dailySnapshots.slice().reverse().map(snapshot => ({
      ...snapshot,
      date: snapshot.snapshotDate,
      pnl: snapshot.totalPnl,
    }));
    result.push({
      categoryId: access.categoryId,
      name: access.categoryName,
      startDate: portfolio.startDate,
      summary: portfolio.settlementSummary,
      points,
    });
  }
  return result;
}

export async function getMyStockTagOverview(input: { ledgerId: number; userId: number; systemRole?: string }) {
  if (input.ledgerId !== STOCK_LEDGER_ID) return [];
  return readShortLivedCache(
    memberOverviewReadCache,
    `${input.ledgerId}:${input.userId}:${input.systemRole || ''}`,
    () => buildMyStockTagOverview(input),
  );
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
  const results = await searchManualStocks(normalized, stockMarket(normalized));
  const matched = results.find((row) => row.symbol === normalized);
  if (!matched) {
    throw new Error("暂时无法核验该股票代码或美股 ticker，请稍后重试");
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
  profitAllocations?: StockSaleProfitAllocationInput[];
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
    if (type === "sell" && Number(input.lotId) > 0) {
      const lotId = Number(input.lotId);
      if (!Number.isInteger(lotId) || lotId <= 0) throw new Error("卖出时请选择持仓编号");
      const lots = await getActiveLots(access.categoryId);
      const selectedLot = lots.find((lot) => lot.id === lotId && lot.remainingQuantity > EPSILON);
      if (!selectedLot) throw new Error("所选持仓编号不存在或已全部卖出");
      if (!isStockLotSaleDateValid(actualTradedAt, selectedLot.openedAt)) {
        throw new Error("卖出日期不能早于这笔持仓的买入日期");
      }
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

  // 展示序号会随当前列表变化。新买入、按内部持仓ID选定的卖出彼此独立，
  // 不由同股票其他记录或12:00日期占位时间拦截；旧式非指定持仓操作仍保留保护。
  if (stock && requiresStockTradeOrderCheck(type, input.correctsEventId, Number(input.lotId))) {
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

  if (type !== 'note') await ensureStockCalendarResultTable();
  const tx = await getDbTransactionConnection();
  if (!tx) throw new Error("数据库连接不可用");
  try {
    await (tx as any).beginTransaction();
    const referencePrice = stock?.latestPrice && stock.latestPrice > 0 ? stock.latestPrice : null;
    const referenceTime = stock?.latestPriceUpdatedAt ? new Date(stock.latestPriceUpdatedAt) : null;
    const transactionFee = quantity !== null && executionPrice !== null
      ? Number((quantity * executionPrice * STOCK_TRADE_FEE_RATE).toFixed(8))
      : null;
    const [result] = await (tx as any).execute(
      `INSERT INTO ledger_stock_events
       (ledger_id, category_id, event_type, symbol, stock_name, quantity, execution_price,
        transaction_fee, actual_traded_at, market_reference_price, market_reference_at, note, created_by, corrects_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        access.ledgerId,
        access.categoryId,
        type,
        stock?.symbol || null,
        stock?.name || null,
        quantity,
        executionPrice,
        transactionFee,
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
      if (type === "sell" && input.lotId) {
        if (input.profitAllocations && input.profitAllocations.length > 0) {
          await syncStockLotMemberSharesForSale(tx, {
            ledgerId: access.ledgerId,
            categoryId: access.categoryId,
            lotId: Number(input.lotId),
            closingQuantity: quantity!,
            createdBy: input.userId,
            memberShares: input.profitAllocations,
          });
        }
        await allocateWholeLot(tx, eventId, access.categoryId, Number(input.lotId), stock!.symbol, quantity!, executionPrice!);
        await saveStockSaleProfitAllocations(tx, {
          lotId: Number(input.lotId),
          sellEventId: eventId,
          quantity: quantity!,
          salePrice: executionPrice!,
          sellFee: transactionFee || 0,
          createdBy: input.userId,
        });
      } else {
        await allocateFifo(tx, eventId, access.categoryId, stock!.symbol, quantity!, executionPrice!);
      }
    }
    if (type !== 'note') await markStockCalendarResultDirty(tx, access.categoryId);
    await (tx as any).commit();
    invalidateMemberStockReadCaches();
    if (type !== 'note') queueStockCalendarResultRebuild(access.categoryId);
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
  await ensureStockCalendarResultTable();
  const conn = await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接不可用");
  try {
    await (conn as any).beginTransaction();
    const [rows] = await (conn as any).execute(
      `SELECT id, event_type, status FROM ledger_stock_events
       WHERE id = ? AND category_id = ? AND ledger_id = ? LIMIT 1 FOR UPDATE`,
      [input.eventId, input.categoryId, input.ledgerId],
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
      // 按批次ID锁定，与开启观察/真实分配使用同一主锁，避免撤销与转换竞态。
      const [closedRows] = await (conn as any).execute(
        `SELECT c.participation_id, p.lot_id, SUM(c.quantity) AS quantity
         FROM ledger_stock_participation_closures c
         INNER JOIN ledger_stock_lot_participations p ON p.id = c.participation_id
         WHERE c.sell_event_id = ? AND p.ledger_id = ? AND p.category_id = ?
         GROUP BY c.participation_id, p.lot_id`,
        [input.eventId, input.ledgerId, input.categoryId],
      );
      const lotIds = Array.from(new Set((closedRows as any[]).map((row) => Number(row.lot_id)))).sort((a, b) => a - b);
      for (const lotId of lotIds) {
        await (conn as any).execute(
          `SELECT id FROM ledger_stock_lots WHERE id = ? AND ledger_id = ? AND category_id = ? FOR UPDATE`,
          [lotId, input.ledgerId, input.categoryId],
        );
      }
      const observationTableExists = await stockObservationTableExists(conn);
      for (const row of closedRows as any[]) {
        const [participationRows] = await (conn as any).execute(
          `SELECT id, user_id FROM ledger_stock_lot_participations
           WHERE id = ? AND ledger_id = ? AND category_id = ? FOR UPDATE`,
          [Number(row.participation_id), input.ledgerId, input.categoryId],
        );
        const participation = (participationRows as any[])[0];
        if (!participation) throw new Error("撤销卖出的真实参与记录不可用");
        let observerEnabled = false;
        if (observationTableExists) {
          const [observationRows] = await (conn as any).execute(
            `SELECT enabled FROM ledger_stock_lot_observations
             WHERE ledger_id = ? AND category_id = ? AND lot_id = ? AND user_id = ? FOR UPDATE`,
            [input.ledgerId, input.categoryId, Number(row.lot_id), Number(participation.user_id)],
          );
          observerEnabled = (observationRows as any[]).some((observation) => Number(observation.enabled) === 1);
        }
        if (observerEnabled) {
          // 转观察时已释放真实余量：撤销closure只减掉该笔已售allocated，不能恢复真实资产。
          await (conn as any).execute(
            `UPDATE ledger_stock_lot_participations
             SET allocated_quantity = GREATEST(0, allocated_quantity - ?), remaining_quantity = 0 WHERE id = ?`,
            [numberValue(row.quantity), Number(row.participation_id)],
          );
        } else {
          await (conn as any).execute(
            `UPDATE ledger_stock_lot_participations SET remaining_quantity = remaining_quantity + ? WHERE id = ?`,
            [numberValue(row.quantity), Number(row.participation_id)],
          );
        }
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
    if (event.event_type !== 'note') await markStockCalendarResultDirty(conn, input.categoryId);
    await (conn as any).commit();
    invalidateMemberStockReadCaches();
    if (event.event_type !== 'note') queueStockCalendarResultRebuild(input.categoryId);
    return { success: true };
  } catch (error) {
    await (conn as any).rollback();
    throw error;
  } finally {
    if (typeof (conn as any).release === "function") (conn as any).release();
  }
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

  // 新式卖出始终对应一个完整持仓编号。更正时必须沿用该编号和成员比例，
  // 不能退回 FIFO，否则会让已卖出卡片与初始标签管理的成员份额脱节。
  let sellCorrection: { lotId: number; profitAllocations: StockSaleProfitAllocationInput[] } | null = null;
  if (original.event_type === "sell") {
    const [allocationRows] = await (conn as any).execute(
      `SELECT lot_id, SUM(quantity) AS quantity
       FROM ledger_stock_event_lot_allocations
       WHERE event_id = ?
       GROUP BY lot_id`,
      [input.eventId],
    );
    const allocations = allocationRows as any[];
    if (allocations.length !== 1) {
      throw new Error("这笔历史卖出关联了多个持仓编号，请先作废后按编号重新登记");
    }
    const lotId = Number(allocations[0]?.lot_id);
    if (!Number.isInteger(lotId) || lotId <= 0) {
      throw new Error("该卖出记录缺少原持仓编号，请先作废后重新登记");
    }
    const [closureRows] = await (conn as any).execute(
      `SELECT p.user_id, SUM(c.quantity) AS quantity
       FROM ledger_stock_participation_closures c
       INNER JOIN ledger_stock_lot_participations p ON p.id = c.participation_id
       WHERE c.sell_event_id = ?
       GROUP BY p.user_id`,
      [input.eventId],
    );
    const closingQuantity = numberValue(allocations[0]?.quantity);
    const profitAllocations = (closureRows as any[]).map((row) => ({
      userId: Number(row.user_id),
      percentage: closingQuantity > EPSILON ? Number((numberValue(row.quantity) / closingQuantity * 100).toFixed(8)) : 0,
    })).filter((row) => Number.isInteger(row.userId) && row.userId > 0 && row.percentage > 0);
    sellCorrection = { lotId, profitAllocations };
  }
  await voidStockTagEvent({
    ledgerId: input.ledgerId,
    categoryId: input.categoryId,
    eventId: input.eventId,
    userId: input.userId,
    systemRole: input.systemRole,
    reason: `更正：${String(input.reason || "").trim()}`,
  });
  return createStockTagEvent({
    ...input,
    correctsEventId: input.eventId,
    ...(sellCorrection || {}),
  });
}

/** A股D15:05发布 A_D + 严格早于D的最近已收盘纽约交易日；raw proof和旧金额不改写。 */
export async function refreshLedgerStockTagCloseSnapshots(options: {
  categoryId?: number;
  snapshotDate?: string;
} = {}): Promise<UnifiedStockClosePublicationResult> {
  const snapshotDate = options.snapshotDate || getUnifiedStockCloseSnapshotDate();
  const version = getUnifiedStockCloseVersion(snapshotDate);
  type CloseFailureDetails = {
    symbol?: string; expectedDate?: string; actualDate?: string; currency?: string; source?: string };
  const result: UnifiedStockClosePublicationResult = { categories: 0, symbols: 0, updated: 0,
    publishedCategories: 0, alreadyPublishedCategories: 0, skippedCategories: 0,
    complete: false, snapshotDate, version };
  const fail = (categoryId: number, stage: string, reason: string, details: CloseFailureDetails = {}) => {
    const failure = { categoryId, snapshotDate, reason,
      ...(details.symbol ? { missingSymbols: [details.symbol] } : {}), details: { stage, ...details } };
    (result.failures ??= []).push(failure);
    // Deliberately log only evidence metadata, never upstream errors, URLs or credentials.
    console.error('[37正规收盘] 未发布原因', failure);
  };
  const usSessionDate = getOvernightUsSessionDate(snapshotDate);
  if (!isStockMarketSession(snapshotDate, 'A') || !usSessionDate || !isUnifiedStockCloseReady(snapshotDate) || closeRefreshInProgress) return result;
  const marketCutoff = (symbol: string) => stockCurrency(symbol) === 'USD' ? usSessionDate : snapshotDate;
  closeRefreshInProgress = true;
  try {
    await ensureLedgerStockPortfolioTables();
    await ensureStockCalendarResultTable();
    const conn = await getDbConnection();
    if (!conn) throw new Error("数据库连接不可用");
    const requestedCategoryId = Number(options.categoryId || 0);
    if (options.categoryId !== undefined && (!Number.isInteger(requestedCategoryId) || requestedCategoryId <= 0)) {
      throw new Error("补写日结时必须提供有效标签编号");
    }
    const [rows] = await (conn as any).execute(
      `SELECT id FROM ledger_categories
       WHERE ledgerId = ? AND parentId IS NULL AND accounting_mode = 'stock_portfolio'
       ${requestedCategoryId ? 'AND id = ?' : ''}`,
      requestedCategoryId ? [STOCK_LEDGER_ID, requestedCategoryId] : [STOCK_LEDGER_ID],
    );
    const observedSymbols = new Set<string>();
    let evidenceChanged = false;
    for (const row of rows as any[]) {
      const categoryId = Number(row.id);
      let categoryCounted = false;
      try {
      // Reconstruct at each market's price date; registration time is not a trade-date substitute.
      const [lotRows] = await (conn as any).execute(
        `SELECT l.id, l.symbol, l.unit_cost, l.initial_quantity,
          DATE_FORMAT(opening.actual_traded_at, '%Y-%m-%d %H:%i:%s') AS actual_traded_at
         FROM ledger_stock_lots l
         INNER JOIN ledger_stock_events opening ON opening.id = l.opened_event_id
          AND opening.ledger_id = l.ledger_id AND opening.category_id = l.category_id AND opening.status = 'active'
         WHERE l.ledger_id = ? AND l.category_id = ?`, [STOCK_LEDGER_ID, categoryId],
      );
      if (!(lotRows as any[]).length) continue;
      const [saleRows] = await (conn as any).execute(
        `SELECT e.id, e.symbol, e.quantity, e.execution_price, e.transaction_fee,
          DATE_FORMAT(e.actual_traded_at, '%Y-%m-%d %H:%i:%s') AS actual_traded_at,
          COALESCE(SUM(a.quantity * l.unit_cost), 0) AS allocated_cost,
          COALESCE(SUM(CASE WHEN e.transaction_fee IS NOT NULL
            THEN a.quantity * COALESCE(opening.transaction_fee / NULLIF(l.initial_quantity, 0), l.unit_cost * ?)
            ELSE 0 END), 0) AS allocated_buy_fee,
          JSON_ARRAYAGG(JSON_OBJECT('lotId', a.lot_id, 'quantity', a.quantity)) AS allocations
         FROM ledger_stock_events e
         LEFT JOIN ledger_stock_event_lot_allocations a ON a.event_id = e.id
         LEFT JOIN ledger_stock_lots l ON l.id = a.lot_id AND l.ledger_id = e.ledger_id AND l.category_id = e.category_id
         LEFT JOIN ledger_stock_events opening ON opening.id = l.opened_event_id
         WHERE e.ledger_id = ? AND e.category_id = ? AND e.status = 'active' AND e.event_type IN ('reduce','sell')
         GROUP BY e.id`, [STOCK_TRADE_FEE_RATE, STOCK_LEDGER_ID, categoryId]);
      const lots = (lotRows as any[]).map(lot => ({ ...lot,
        start_date: marketSessionDateFromBeijingTradeTimestamp(lot.actual_traded_at, stockMarket(String(lot.symbol))) }));
      const sales = (saleRows as any[]).map(sale => ({ ...sale,
        close_date: marketSessionDateFromBeijingTradeTimestamp(sale.actual_traded_at, stockMarket(String(sale.symbol))) }));
      if (lots.some(lot => !lot.start_date) || sales.some(sale => !sale.close_date)) {
        fail(categoryId, 'trade_history', 'missing_actual_trade_date');
        result.categories++; categoryCounted = true; result.skippedCategories!++; continue;
      }
      const applicableLots = lots.filter(lot => String(lot.start_date) <= marketCutoff(String(lot.symbol)));
      if (!applicableLots.length) continue;
      const applicableSales = sales.filter(sale => String(sale.close_date) <= marketCutoff(String(sale.symbol)));
      const soldByLot = new Map<number, number>();
      for (const sale of applicableSales) {
        const allocations = typeof sale.allocations === 'string' ? JSON.parse(sale.allocations) : sale.allocations;
        for (const allocation of allocations ?? []) if (allocation.lotId != null) {
          const id = Number(allocation.lotId);
          soldByLot.set(id, (soldByLot.get(id) ?? 0) + numberValue(allocation.quantity));
        }
      }
      const active = applicableLots.map(lot => ({ symbol: String(lot.symbol), unitCost: numberValue(lot.unit_cost),
        quantity: Math.max(0, numberValue(lot.initial_quantity) - (soldByLot.get(Number(lot.id)) ?? 0)) })).filter(lot => lot.quantity > EPSILON);
      const symbols = Array.from(new Set(active.map(lot => lot.symbol)));
      result.categories++;
      categoryCounted = true;
      symbols.forEach(symbol => observedSymbols.add(symbol));
      const tx = await getDbTransactionConnection();
      if (!tx) throw new Error('数据库事务连接不可用');
      const lockName = `stock37:${categoryId}:${snapshotDate}:${version.split(':')[0]}`;
      let locked = false, transaction = false;
      try {
        const [lockRows] = await (tx as any).execute('SELECT GET_LOCK(?,0) AS acquired', [lockName]);
        locked = Number((lockRows as any[])[0]?.acquired) === 1;
        if (!locked) { fail(categoryId, 'lock', 'busy'); result.skippedCategories!++; continue; }
        const [existing] = await (tx as any).execute(
          `SELECT category_id FROM ledger_stock_unified_close_category_publications
           WHERE ledger_id=? AND category_id=? AND snapshot_date=? AND policy_version=?`,
          [STOCK_LEDGER_ID, categoryId, snapshotDate, version]);
        const alreadyPublished = (existing as any[]).length > 0;
        // An immutable publication must not hide evidence needed by a later backdated trade.
        // Recheck the current symbol coverage, but never overwrite the old publication amount.
        // Both old and new raw proofs are accepted by source + true session, never publication version.
        const hasUsd = applicableLots.some(lot => stockCurrency(String(lot.symbol)) === 'USD');
        const [savedFxRows] = hasUsd ? await (tx as any).execute(
          `SELECT usd_cny_rate, source,
             DATE_FORMAT(quote_as_of,'%Y-%m-%d %H:%i:%s') AS quote_as_of,
             DATE_FORMAT(locked_at,'%Y-%m-%d %H:%i:%s') AS locked_at FROM ledger_stock_unified_close_fx
           WHERE ledger_id=? AND category_id=? AND snapshot_date=? AND policy_version=?`,
          [STOCK_LEDGER_ID, categoryId, snapshotDate, STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION]) : [[]];
        // Archive first. Start the 15:05 capture BEFORE stock HTTP work; a slow stock source
        // must not push a Sina FX observation beyond cutoff. Attach rejection handling now.
        const fxPromise = hasUsd && !(savedFxRows as any[]).length
          ? Promise.resolve().then(() => fetchStockUsdCnyAtClose(snapshotDate))
            .then(quote => ({ quote, failed: false }), () => ({ quote: null, failed: true }))
          : Promise.resolve({ quote: null, failed: false });
        const allowedSources = ['unified_close_yahoo', 'unified_close_tushare', 'unified_close_sina'];
        const quoteFailure = (symbol: string, quote: UnifiedCloseQuote | undefined): string | null => {
          if (!quote) return 'not_found';
          if (!quote.priceDate) return 'missing_date';
          if (!isUnifiedStockCloseQuoteForDate(quote, marketCutoff(symbol))) return 'bad_price_or_date';
          if (quote.currency !== stockCurrency(symbol)) return 'bad_currency';
          if (!allowedSources.includes(quote.source)) return 'bad_source';
          if (!isTrustedMemberCalendarClose({ ...quote, symbol, capturedAt: quote.updatedAt })) return 'untrusted_close';
          return null;
        };
        const quotes: Record<string, UnifiedCloseQuote> = {};
        const rejectedProofs: Record<string, UnifiedCloseQuote> = {};
        if (symbols.length) {
          const [proofRows] = await (tx as any).execute(
            `SELECT symbol, DATE_FORMAT(session_date,'%Y-%m-%d') AS session_date, price, currency, source,
               DATE_FORMAT(captured_at,'%Y-%m-%d %H:%i:%s') AS captured_at
             FROM ledger_stock_unified_close_prices WHERE ledger_id=? AND category_id=?
               AND session_date IN (?,?) AND symbol IN (${symbols.map(() => '?').join(',')})
               AND source IN ('unified_close_yahoo','unified_close_tushare','unified_close_sina') ORDER BY captured_at ASC`,
            [STOCK_LEDGER_ID, categoryId, snapshotDate, usSessionDate, ...symbols]);
          for (const proof of proofRows as any[]) {
            const symbol = String(proof.symbol), priceDate = normalizeStoredDate(proof.session_date) || '';
            const quote: UnifiedCloseQuote = { price: numberValue(proof.price), currency: proof.currency,
              source: String(proof.source), updatedAt: toBeijingWallClockIso(proof.captured_at), priceDate };
            if (!quoteFailure(symbol, quote)) quotes[symbol] = quote;
            else rejectedProofs[symbol] = quote;
          }
        }
        const missing = symbols.filter(symbol => !quotes[symbol]);
        const quotesPromise = missing.length
          ? Promise.resolve().then(() => fetchOvernightUnifiedCloseQuotes(missing, snapshotDate))
            .then(fetched => ({ fetched, failed: false }), () => ({ fetched: {} as Record<string, UnifiedCloseQuote>, failed: true }))
          : Promise.resolve({ fetched: {} as Record<string, UnifiedCloseQuote>, failed: false });
        const [fxFetch, quoteFetch] = await Promise.all([fxPromise, quotesPromise]);
        for (const symbol of missing) {
          const candidate = quoteFetch.fetched[symbol];
          const reason = quoteFailure(symbol, candidate);
          if (!reason) quotes[symbol] = candidate;
          else {
            const rejected = candidate || rejectedProofs[symbol];
            fail(categoryId, 'quote', rejected ? quoteFailure(symbol, rejected)! : quoteFetch.failed ? 'fetch_failed' : reason,
              { symbol, expectedDate: marketCutoff(symbol), actualDate: rejected?.priceDate || '',
                currency: rejected?.currency || '', source: rejected?.source || '' });
          }
        }
        let fxArchive = (savedFxRows as any[])[0] || null;
        let rate = numberValue(fxArchive?.usd_cny_rate);
        if (!fxArchive && fxFetch.quote) {
          const fetched = fxFetch.quote;
          rate = Number(Number(fetched.usdCnyRate).toFixed(8));
          fxArchive = { usd_cny_rate: rate, source: fetched.source, quote_as_of: fetched.asOf, locked_at: fetched.lockedAt };
        }
        let validFx = !hasUsd;
        if (hasUsd) {
          const cutoff = Date.parse(`${snapshotDate}T15:05:00+08:00`);
          const quoteAt = Date.parse(toBeijingWallClockIso(fxArchive?.quote_as_of));
          const lockedAt = Date.parse(toBeijingWallClockIso(fxArchive?.locked_at));
          validFx = Number.isFinite(rate) && rate > 0
            && ['yahoo_usdcny_5m', 'sina_usdcny'].includes(String(fxArchive?.source))
            && Number.isFinite(quoteAt) && quoteAt <= cutoff && cutoff - quoteAt <= 30 * 60_000 && lockedAt === cutoff;
          if (!validFx) fail(categoryId, 'fx', !fxArchive ? 'not_found'
            : !Number.isFinite(rate) || rate <= 0 ? 'bad_rate'
            : !['yahoo_usdcny_5m', 'sina_usdcny'].includes(String(fxArchive.source)) ? 'bad_source' : 'bad_cutoff',
          { expectedDate: `${snapshotDate}T15:05:00+08:00`, actualDate: fxArchive ? toBeijingWallClockIso(fxArchive.quote_as_of) : '',
            currency: 'USD/CNY', source: fxArchive?.source || '' });
        }
        let completeEvidence = symbols.every(symbol => !!quotes[symbol]) && validFx;
        if (alreadyPublished && !missing.length && completeEvidence && (!hasUsd || (savedFxRows as any[]).length > 0)) {
          result.alreadyPublishedCategories!++; continue;
        }
        const verifiedSymbols = symbols.filter(symbol => !!quotes[symbol]);
        if (!verifiedSymbols.length && !(hasUsd && validFx) && !completeEvidence) {
          result.skippedCategories!++; continue;
        }
        await (tx as any).beginTransaction(); transaction = true;
        let addedEvidence = 0;
        for (const symbol of verifiedSymbols) {
          const quote = quotes[symbol];
          // Existing verified evidence is immutable, including the administrator's historic import.
          const [inserted] = await (tx as any).execute(
            `INSERT IGNORE INTO ledger_stock_unified_close_prices
             (ledger_id,category_id,symbol,session_date,price,currency,source,policy_version,captured_at)
             VALUES (?,?,?,?,?,?,?,?,NOW())`,
            [STOCK_LEDGER_ID, categoryId, symbol, quote.priceDate, quote.price, quote.currency, quote.source, 'cn-us-regular-close-v1']);
          const added = Number(inserted.affectedRows || 0);
          addedEvidence += added;
          // An ignored fetch is not proof of persistence: the immutable key may contain
          // an invalid older row. Never publish a fetched price that was not archived.
          if (!added && missing.includes(symbol)) {
            const [persistedRows] = await (tx as any).execute(
              `SELECT symbol, DATE_FORMAT(session_date,'%Y-%m-%d') AS session_date, price, currency, source,
                 DATE_FORMAT(captured_at,'%Y-%m-%d %H:%i:%s') AS captured_at
               FROM ledger_stock_unified_close_prices WHERE ledger_id=? AND category_id=? AND symbol=?
                 AND session_date=? AND policy_version=? FOR UPDATE`,
              [STOCK_LEDGER_ID, categoryId, symbol, quote.priceDate, 'cn-us-regular-close-v1']);
            const proof = (persistedRows as any[])[0];
            const persisted = proof ? { price: numberValue(proof.price), currency: proof.currency,
              source: String(proof.source), updatedAt: toBeijingWallClockIso(proof.captured_at),
              priceDate: normalizeStoredDate(proof.session_date) || '' } : undefined;
            if (persisted && !quoteFailure(symbol, persisted)) quotes[symbol] = persisted;
            else {
              delete quotes[symbol]; completeEvidence = false;
              fail(categoryId, 'quote', 'evidence_insert_ignored', { symbol, expectedDate: marketCutoff(symbol),
                actualDate: persisted?.priceDate || '', currency: persisted?.currency || '', source: persisted?.source || '' });
            }
          }
        }
        if (hasUsd && validFx && fxArchive) {
          const [inserted] = await (tx as any).execute(
            `INSERT IGNORE INTO ledger_stock_unified_close_fx
             (ledger_id,category_id,snapshot_date,policy_version,usd_cny_rate,source,quote_as_of,locked_at)
             VALUES (?,?,?,?,?,?,?,?)`,
            [STOCK_LEDGER_ID, categoryId, snapshotDate, STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION, rate, fxArchive.source,
              typeof fxArchive.quote_as_of === 'string' && fxArchive.quote_as_of.includes('T') ? toMysqlBeijingDateTime(fxArchive.quote_as_of) : fxArchive.quote_as_of,
              typeof fxArchive.locked_at === 'string' && fxArchive.locked_at.includes('T') ? toMysqlBeijingDateTime(fxArchive.locked_at) : fxArchive.locked_at]);
          addedEvidence += Number(inserted.affectedRows || 0);
          const [lockedFxRows] = await (tx as any).execute(
            `SELECT usd_cny_rate,source,
               DATE_FORMAT(quote_as_of,'%Y-%m-%d %H:%i:%s') AS quote_as_of,
               DATE_FORMAT(locked_at,'%Y-%m-%d %H:%i:%s') AS locked_at FROM ledger_stock_unified_close_fx
             WHERE ledger_id=? AND category_id=? AND snapshot_date=? AND policy_version=? FOR UPDATE`,
            [STOCK_LEDGER_ID, categoryId, snapshotDate, STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION]);
          const lockedFx = (lockedFxRows as any[])[0];
          if (!lockedFx || Math.abs(numberValue(lockedFx.usd_cny_rate) - rate) > 0.00000001
            || lockedFx.source !== fxArchive.source
            || Date.parse(toBeijingWallClockIso(lockedFx.quote_as_of)) !== Date.parse(toBeijingWallClockIso(fxArchive.quote_as_of))
            || Date.parse(toBeijingWallClockIso(lockedFx.locked_at)) !== Date.parse(toBeijingWallClockIso(fxArchive.locked_at))) {
            throw new Error('已锁定的日结汇率冲突，禁止覆盖或按另一汇率发布');
          }
        }
        if (completeEvidence && !alreadyPublished) {
          // Writer-only historical realized amount; never alter the existing funds API helper.
          const realized = applicableSales.reduce((total, sale) => {
            const multiplier = stockCurrency(String(sale.symbol)) === 'USD' ? rate : 1;
            return total + (numberValue(sale.quantity) * numberValue(sale.execution_price)
              - numberValue(sale.transaction_fee) - numberValue(sale.allocated_cost) - numberValue(sale.allocated_buy_fee)) * multiplier;
          }, 0);
          let cost = 0, marketValue = 0;
          for (const lot of active) {
            const multiplier = stockCurrency(lot.symbol) === 'USD' ? rate : 1;
            cost += lot.quantity * lot.unitCost * multiplier;
            marketValue += lot.quantity * quotes[lot.symbol].price * multiplier;
          }
          await (tx as any).execute(
            `INSERT INTO ledger_stock_unified_close_category_publications
             (ledger_id,category_id,snapshot_date,policy_version,market_value,cost_value,floating_pnl,realized_pnl,total_pnl,position_count,usd_cny_rate,quotes_json)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [STOCK_LEDGER_ID, categoryId, snapshotDate, version, marketValue, cost, marketValue - cost, realized,
              marketValue - cost + realized, symbols.length, hasUsd ? rate : null, JSON.stringify({ ...quotes,
                ...(hasUsd && fxArchive ? { __usdCnyFx: { pair: 'USD/CNY', rate, source: fxArchive.source,
                  quoteAsOf: toBeijingWallClockIso(fxArchive.quote_as_of), lockedAt: toBeijingWallClockIso(fxArchive.locked_at) } } : {}) })]);
        }
        // Generation and new proof must commit together, including a partial recovery.
        if (addedEvidence > 0) await markStockCalendarResultDirty(tx, categoryId);
        await (tx as any).commit(); transaction = false;
        if (!completeEvidence) result.skippedCategories!++;
        else if (alreadyPublished) result.alreadyPublishedCategories!++;
        else result.publishedCategories!++;
        result.updated += verifiedSymbols.length;
        evidenceChanged ||= addedEvidence > 0;
      } catch (error) {
        if (transaction) {
          try { await (tx as any).rollback(); } catch { fail(categoryId, 'rollback', 'publication_error'); }
        }
        result.skippedCategories!++;
        fail(categoryId, 'transaction', 'publication_error');
      } finally {
        try {
          if (locked) await (tx as any).execute('SELECT RELEASE_LOCK(?)', [lockName]);
        } catch { fail(categoryId, 'release_lock', 'publication_error'); }
        try {
          if (typeof (tx as any).release === 'function') (tx as any).release();
        } catch { fail(categoryId, 'release_connection', 'publication_error'); }
      }
      } catch {
        if (!categoryCounted) result.categories++;
        result.skippedCategories!++;
        fail(categoryId, 'category', 'publication_error');
      }
    }
    result.symbols = observedSymbols.size;
    result.complete = result.categories > 0 && result.skippedCategories === 0
      && Number(result.publishedCategories) + Number(result.alreadyPublishedCategories) === result.categories;
    if (result.publishedCategories || evidenceChanged) invalidateMemberStockReadCaches();
    return result;
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
        // A 股仍按北京时间当日过滤；美股报价日期以交易所返回的纽约交易日为准。
        if (stockCurrency(symbol) === 'CNY' && priceDate !== date) continue;
        await (conn as any).execute(
          `INSERT INTO ledger_stock_quote_history
           (ledger_id, category_id, symbol, price, price_date, captured_at, source)
           VALUES (?, ?, ?, ?, ?, NOW(), 'intraday')`,
          [STOCK_LEDGER_ID, categoryId, symbol, quote.price, priceDate],
        );
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
            COALESCE(SUM(CASE WHEN e.status = 'active' THEN a.quantity ELSE 0 END), 0) AS globally_sold_quantity,
            COALESCE(SUM(CASE WHEN e.status = 'active' AND e.event_type IN ('reduce','sell') THEN a.quantity ELSE 0 END), 0) AS observation_sold_quantity,
            CASE WHEN SUM(CASE WHEN e.status = 'active' AND e.event_type IN ('reduce','sell')
              AND (e.execution_price IS NULL OR e.execution_price < 0) THEN 1 ELSE 0 END) > 0
              THEN NULL ELSE SUM(CASE WHEN e.status = 'active' AND e.event_type IN ('reduce','sell')
                THEN a.quantity * e.execution_price ELSE 0 END) END AS observation_sold_value,
            MAX(CASE WHEN e.status = 'active' AND e.event_type IN ('reduce','sell')
              THEN COALESCE(e.actual_traded_at, e.server_registered_at) ELSE NULL END) AS observation_sold_at
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
  const symbols = (lotRows as any[]).map((row) => String(row.symbol));
  // 初始标签管理必须与主组合共用同一报价优先级：盘中最新价 → 盘尾价 → 登记参考价。
  // 新开仓在下一轮盘中刷新前才会暂时使用登记参考价，不能让旧盘尾或登记价长期占用当前价。
  const [referenceQuotes, storedQuotes, intradayQuotes] = await Promise.all([
    getLatestReferenceQuotes(categoryId),
    getLatestQuotes(categoryId, symbols),
    getLatestIntradayQuotes(categoryId, symbols),
  ]);
  const quoteMap = mergeLatestQuoteMaps(referenceQuotes, storedQuotes, intradayQuotes);
  const observationRows = await getStockLotObservations(STOCK_LEDGER_ID, categoryId);
  const today = beijingDate();
  const pauseContexts = await getStockObservationPauseContexts(observationRows, today);
  const observationsByLot = new Map<number, typeof observationRows>();
  for (const observation of observationRows) {
    const list = observationsByLot.get(observation.lotId) || [];
    list.push(observation);
    observationsByLot.set(observation.lotId, list);
  }
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
    const symbol = String(row.symbol);
    const marketQuote = quoteMap[symbol];
    const marketPrice = marketQuote?.price ?? null;
    const marketQuoteSource = marketQuote === intradayQuotes[symbol]
      ? 'intraday'
      : marketQuote === storedQuotes[symbol]
        ? 'close'
        : marketQuote === referenceQuotes[symbol]
          ? 'reference'
          : 'unavailable';
    const participations = byLot.get(Number(row.id)) || [];
    const activeAllocatedQuantity = participations.reduce((total, item) => total + item.remainingQuantity, 0);
    return {
      id: Number(row.id), symbol: String(row.symbol), stockName: String(row.stock_name),
      // 使用管理员登记的实际成交/接单时间（精确到秒），不受后续日度估值影响。
      openedAt: toIso(row.opened_at), actualTradedAt: toIso(row.actual_traded_at),
      unitCost: numberValue(row.unit_cost), openingReferencePrice: numberValue(row.opening_reference_price) || null,
      note: String(row.note || ""),
      initialQuantity, globallySoldQuantity, currentQuantity, marketPrice,
      marketQuoteSource, marketQuoteDate: marketQuote?.priceDate || null, marketQuoteUpdatedAt: marketQuote?.updatedAt || null,
      availableForParticipation: Math.max(0, currentQuantity - activeAllocatedQuantity),
      status: currentQuantity > EPSILON ? "active" as const : "closed" as const,
      // 仅为沙箱观察预览提供同一纯函数的估值输入；不覆盖任何真实字段。
      observationValuation: {
        initialQuantity,
        lotCurrentQuantity: Math.max(0, initialQuantity - numberValue(row.observation_sold_quantity)) <= EPSILON
          ? 0 : Math.max(0, initialQuantity - numberValue(row.observation_sold_quantity)),
        soldQuantity: numberValue(row.observation_sold_quantity),
        soldValue: row.observation_sold_value === null || row.observation_sold_value === undefined ? null : Number(row.observation_sold_value),
        soldAt: row.observation_sold_at ? toIso(row.observation_sold_at) : null,
        soldDate: row.observation_sold_at ? normalizeStoredDate(row.observation_sold_at) : null,
      },
      // 已存暂停配置的as-of合同；任意新日期的预览调用只读PauseContext helper。
      pausedValuationByDate: Object.fromEntries((observationsByLot.get(Number(row.id)) || []).flatMap((observation) => {
        const context = pauseContexts.get(`${observation.lotId}:${observation.pauseDate}`);
        return context ? [[context.pauseDate, context]] : [];
      })) as Record<string, StockObservationPauseContext>,
      participations: participations.map((item) => ({
        ...item,
        floatingPnl: marketPrice === null ? null : (item.entryPrice - marketPrice) * item.remainingQuantity,
        totalPnl: marketPrice === null ? item.realizedPnl : item.realizedPnl + (item.entryPrice - marketPrice) * item.remainingQuantity,
      })),
      // 观察配置只附加展示，不进入 activeAllocatedQuantity 或 availableForParticipation。
      observations: (observationsByLot.get(Number(row.id)) || []).map((observation) => {
        const context = pauseContexts.get(`${observation.lotId}:${observation.pauseDate}`);
        const paused = observation.startDate <= today && !!observation.pauseDate && observation.pauseDate <= today;
        if (paused && !context) throw new Error("观察暂停估值批次不可用，请刷新后重试");
        const holding = buildStockObservationHolding(
          context ? { ...observation, ...context.observationValuation } : observation,
          paused ? context?.quote ?? null : toStockObservationQuote(symbol, quoteMap, referenceQuotes, storedQuotes, intradayQuotes), today);
        return {
          userId: observation.userId, enabled: observation.enabled, quantity: observation.quantity,
          entryPrice: observation.entryPrice, startDate: observation.startDate,
          pauseDate: observation.pauseDate || null,
          assignedBy: observation.assignedBy, createdAt: observation.createdAt, updatedAt: observation.updatedAt,
          currentQuantity: holding?.currentQuantity ?? 0,
          closedQuantity: holding?.closedQuantity ?? 0,
          floatingPnl: holding?.floatingPnl ?? null, closedPnl: holding?.closedPnl ?? null,
          totalPnl: holding?.totalPnl ?? null, status: holding?.status ?? 'disabled',
        };
      }),
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
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, false, false);
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


/** 开启观察原子释放该用户本批次未结算真实余量；不是卖出，不触碰历史结算或资金。 */
export async function setStockLotObservation(input: {
  ledgerId: number;
  categoryId: number;
  lotId: number;
  targetUserId: number;
  enabled: boolean;
  quantity: number;
  entryPrice?: number;
  startDate?: string;
  pauseDate?: string;
  userId: number;
  systemRole?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, true, false);
  const quantity = Number(validateStockObservationQuantity(input.quantity).toFixed(8));
  if (typeof input.enabled !== 'boolean') throw new Error("观察开关必须是布尔值");
  if (!Number.isSafeInteger(input.lotId) || input.lotId <= 0) throw new Error("持仓编号无效");
  if (!Number.isSafeInteger(input.targetUserId) || input.targetUserId <= 0) throw new Error("观察成员编号无效");
  const specifiedEntryPrice = input.entryPrice === undefined ? undefined : validateStockObservationEntryPrice(input.entryPrice);
  const specifiedStartDate = input.startDate === undefined ? undefined : validateStockObservationStartDate(input.startDate);
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接不可用");
  if (!await stockObservationTableExists(conn)) throw new Error("观察账户表尚未初始化，请由管理员授权执行迁移；本接口不会自动建表");
  const tx = await getDbTransactionConnection();
  if (!tx) throw new Error("数据库连接不可用");
  try {
    await (tx as any).beginTransaction();
    const [memberRows] = await (tx as any).execute(
      `SELECT userId FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1 FOR UPDATE`,
      [access.ledgerId, input.targetUserId],
    );
    if ((memberRows as any[]).length === 0) throw new Error("该用户不是37号账本成员");
    // 与真实分配共用批次锁；不受全实配或历史卖出限制，再锁定目标真实参与行。
    const [lotRows] = await (tx as any).execute(
      `SELECT l.id, l.unit_cost, l.opened_at
       FROM ledger_stock_lots l
       INNER JOIN ledger_stock_events e ON e.id = l.opened_event_id AND e.ledger_id = l.ledger_id AND e.category_id = l.category_id
       WHERE l.id = ? AND l.ledger_id = ? AND l.category_id = ? AND e.status = 'active' FOR UPDATE`,
      [input.lotId, access.ledgerId, access.categoryId],
    );
    const lot = (lotRows as any[])[0];
    if (!lot) throw new Error("股票批次不存在或已作废");
    const [participationRows] = await (tx as any).execute(
      `SELECT id, ledger_id, category_id, allocated_quantity, remaining_quantity
       FROM ledger_stock_lot_participations WHERE lot_id = ? AND user_id = ? FOR UPDATE`,
      [input.lotId, input.targetUserId],
    );
    const participation = (participationRows as any[])[0];
    if (participation && (Number(participation.ledger_id) !== access.ledgerId || Number(participation.category_id) !== access.categoryId)) {
      throw new Error("真实参与记录归属不一致，拒绝跨账本更新");
    }
    const [existingRows] = await (tx as any).execute(
      `SELECT ledger_id, category_id, entry_price, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(pause_date, '%Y-%m-%d') AS pause_date
       FROM ledger_stock_lot_observations WHERE lot_id = ? AND user_id = ? FOR UPDATE`,
      [input.lotId, input.targetUserId],
    );
    const existing = (existingRows as any[])[0];
    if (existing && (Number(existing.ledger_id) !== access.ledgerId || Number(existing.category_id) !== access.categoryId)) {
      throw new Error("观察配置归属不一致，拒绝跨账本更新");
    }
    const entryPrice = validateStockObservationEntryPrice(specifiedEntryPrice ?? Number(existing?.entry_price ?? lot.unit_cost));
    const startDate = specifiedStartDate ?? existing?.start_date ?? normalizeStoredDate(lot.opened_at) ?? beijingDate();
    validateStockObservationStartDate(startDate);
    const pauseDate = validateStockObservationPauseDate(input.pauseDate === undefined
      ? normalizeStoredDate(existing?.pause_date) ?? undefined : input.pauseDate, startDate);
    if (input.enabled && participation) {
      const released = releaseStockParticipationForObservation({
        allocatedQuantity: Number(participation.allocated_quantity),
        remainingQuantity: Number(participation.remaining_quantity),
      });
      if (released.releasedQuantity > 0) {
        // 只释放未结算部分：保留历史ID、已卖出allocated部分和全部closure，不产生卖出/退款。
        await (tx as any).execute(
          `UPDATE ledger_stock_lot_participations SET allocated_quantity = ?, remaining_quantity = ?
           WHERE id = ? AND ledger_id = ? AND category_id = ? AND lot_id = ? AND user_id = ?`,
          [released.allocatedQuantity, released.remainingQuantity, participation.id, access.ledgerId, access.categoryId, input.lotId, input.targetUserId],
        );
      }
    }
    // enabled即使quantity=0也与真实余量互斥；关闭只保存配置，不自动恢复已释放份额。
    await (tx as any).execute(
      `INSERT INTO ledger_stock_lot_observations
       (ledger_id, category_id, lot_id, user_id, enabled, quantity, entry_price, start_date, pause_date, assigned_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), quantity = VALUES(quantity),
         entry_price = VALUES(entry_price), start_date = VALUES(start_date), pause_date = VALUES(pause_date), assigned_by = VALUES(assigned_by),
         updated_at = CURRENT_TIMESTAMP`,
      [access.ledgerId, access.categoryId, input.lotId, input.targetUserId, input.enabled ? 1 : 0, quantity, entryPrice, startDate, pauseDate, input.userId],
    );
    await (tx as any).commit();
    invalidateMemberStockReadCaches();
    return {
      success: true as const,
      observation: { userId: input.targetUserId, lotId: input.lotId, enabled: input.enabled, quantity, entryPrice, startDate, pauseDate },
    };
  } catch (error) {
    await (tx as any).rollback();
    throw error;
  } finally {
    if (typeof (tx as any).release === "function") (tx as any).release();
  }
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
    if (quantity > 0 && await stockObservationTableExists(tx)) {
      // 必须在同lot锁内检查；开启观察（包括零观察股数）时不能同时获配真实股份。
      const [observationRows] = await (tx as any).execute(
        `SELECT enabled FROM ledger_stock_lot_observations
         WHERE ledger_id = ? AND category_id = ? AND lot_id = ? AND user_id = ? FOR UPDATE`,
        [access.ledgerId, access.categoryId, input.lotId, input.targetUserId],
      );
      if ((observationRows as any[]).some((row) => Number(row.enabled) === 1)) {
        throw new Error("该用户已开启此批次观察，请先关闭观察后再分配真实股数");
      }
    }
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
    invalidateMemberStockReadCaches();
    return { success: true };
  } catch (error) {
    await (tx as any).rollback();
    throw error;
  } finally {
    if (typeof (tx as any).release === "function") (tx as any).release();
  }
}


async function closeLotParticipationsFifo(conn: any, lotId: number, sellEventId: number, salePrice: number, quantity: number) {
  const observationTableExists = await stockObservationTableExists(conn);
  const [rows] = await conn.execute(
    `SELECT id, remaining_quantity FROM ledger_stock_lot_participations
     WHERE lot_id = ? AND remaining_quantity > 0${observationTableExists ? `
       AND NOT EXISTS (SELECT 1 FROM ledger_stock_lot_observations o
         WHERE o.lot_id = ledger_stock_lot_participations.lot_id
           AND o.user_id = ledger_stock_lot_participations.user_id
           AND o.ledger_id = ledger_stock_lot_participations.ledger_id
           AND o.category_id = ledger_stock_lot_participations.category_id AND o.enabled = 1)` : ''}
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

type StockSaleProfitAllocationInput = {
  // 这里是初始标签管理中同一位成员的比例，不是另一份“利润比例”。
  userId: number;
  percentage: number;
};

/**
 * 卖出确认前，把卖出页的成员比例写回初始标签管理共用的持仓份额。
 * 必须与结清和最终收益快照处在同一事务，避免两份比例不同步。
 */
async function syncStockLotMemberSharesForSale(
  conn: any,
  params: {
    ledgerId: number;
    categoryId: number;
    lotId: number;
    closingQuantity: number;
    createdBy: number;
    memberShares: StockSaleProfitAllocationInput[];
  },
) {
  const [lotRows] = await conn.execute(
    `SELECT l.id, l.unit_cost, l.opened_at, opening_event.market_reference_price
     FROM ledger_stock_lots l
     INNER JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id
     WHERE l.id = ? AND l.category_id = ? AND opening_event.status = 'active'
     LIMIT 1 FOR UPDATE`,
    [params.lotId, params.categoryId],
  );
  const lot = (lotRows as any[])[0];
  if (!lot) throw new Error("卖出分配所对应的持仓编号不存在");

  const shareByUser = new Map<number, number>();
  for (const item of params.memberShares) {
    const userId = Number(item.userId);
    const percentage = Number(item.percentage);
    if (!Number.isInteger(userId) || userId <= 0 || shareByUser.has(userId)) {
      throw new Error("成员分配比例存在重复或无效成员，请刷新后重试");
    }
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new Error("每位成员的分配比例必须在0%到100%之间");
    }
    shareByUser.set(userId, percentage);
  }
  const totalPercentage = Array.from(shareByUser.values()).reduce((sum, value) => sum + value, 0);
  if (totalPercentage > 100.001) {
    throw new Error(`成员分配比例合计不能超过100%，当前为${totalPercentage.toFixed(4)}%`);
  }

  const submittedUserIds = Array.from(shareByUser.keys());
  if (submittedUserIds.length === 0) return;
  const observerUserIds = new Set<number>();
  if (await stockObservationTableExists(conn)) {
    const [observationRows] = await conn.execute(
      `SELECT user_id FROM ledger_stock_lot_observations
       WHERE ledger_id = ? AND category_id = ? AND lot_id = ? AND enabled = 1 FOR UPDATE`,
      [params.ledgerId, params.categoryId, params.lotId],
    );
    for (const row of observationRows as any[]) observerUserIds.add(Number(row.user_id));
    if (submittedUserIds.some((userId) => observerUserIds.has(userId) && (shareByUser.get(userId) || 0) > 0)) {
      throw new Error("该用户已开启此批次观察，请先关闭观察后再分配真实股数");
    }
  }
  const memberPlaceholders = submittedUserIds.map(() => '?').join(', ');
  const [memberRows] = await conn.execute(
    `SELECT userId FROM ledger_members WHERE ledgerId = ? AND userId IN (${memberPlaceholders}) FOR UPDATE`,
    [params.ledgerId, ...submittedUserIds],
  );
  const validMemberIds = new Set((memberRows as any[]).map((row) => Number(row.userId)));
  if (validMemberIds.size !== submittedUserIds.length) {
    throw new Error("分配成员不属于当前37号账本，请刷新后重试");
  }

  const [participationRows] = await conn.execute(
    `SELECT id, user_id, allocated_quantity, remaining_quantity, entry_price, start_date, pause_date
     FROM ledger_stock_lot_participations
     WHERE lot_id = ? FOR UPDATE`,
    [params.lotId],
  );
  const participations = participationRows as any[];
  const existingByUser = new Map(participations.map((row) => [Number(row.user_id), row]));
  const activeNotSubmitted = participations.find((row) => (
    numberValue(row.remaining_quantity) > EPSILON && !shareByUser.has(Number(row.user_id))
  ));
  if (activeNotSubmitted) {
    throw new Error("成员分配资料已变化，请刷新卖出页后重新确认");
  }

  const [closureRows] = await conn.execute(
    `SELECT participation_id, COUNT(*) AS closure_count
     FROM ledger_stock_participation_closures
     WHERE participation_id IN (SELECT id FROM ledger_stock_lot_participations WHERE lot_id = ?)
     GROUP BY participation_id`,
    [params.lotId],
  );
  const closureCountByParticipation = new Map((closureRows as any[]).map((row) => [Number(row.participation_id), Number(row.closure_count)]));
  const defaultStartDate = normalizeStoredDate(lot.opened_at) || beijingDate();
  for (const userId of submittedUserIds) {
    // 零比例观察用户不删除历史真实参与ID/closure，也不从观察股数自动分配。
    if (observerUserIds.has(userId)) continue;
    const existing = existingByUser.get(userId);
    const percentage = shareByUser.get(userId) || 0;
    const desiredQuantity = Number((params.closingQuantity * percentage / 100).toFixed(8));
    const hasClosureHistory = existing && (closureCountByParticipation.get(Number(existing.id)) || 0) > 0;
    if (hasClosureHistory && Math.abs(numberValue(existing.remaining_quantity) - desiredQuantity) > EPSILON) {
      throw new Error("该成员已有历史卖出结算，不能在本次卖出前修改其原始分配比例");
    }
    if (hasClosureHistory) continue;
    if (desiredQuantity <= EPSILON) {
      if (existing) await conn.execute(`DELETE FROM ledger_stock_lot_participations WHERE id = ?`, [existing.id]);
      continue;
    }
    if (existing) {
      await conn.execute(
        `UPDATE ledger_stock_lot_participations
         SET allocated_quantity = ?, remaining_quantity = ?, assigned_by = ?
         WHERE id = ?`,
        [desiredQuantity, desiredQuantity, params.createdBy, existing.id],
      );
    } else {
      const entryPrice = numberValue(lot.unit_cost) || numberValue(lot.market_reference_price);
      if (entryPrice <= 0) throw new Error("该股票批次缺少有效开仓价，暂不能新增成员分配");
      await conn.execute(
        `INSERT INTO ledger_stock_lot_participations
         (ledger_id, category_id, lot_id, user_id, allocated_quantity, remaining_quantity, entry_price, start_date, pause_date, assigned_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [params.ledgerId, params.categoryId, params.lotId, userId, desiredQuantity, desiredQuantity, entryPrice, defaultStartDate, null, params.createdBy],
      );
    }
  }
}

/** 在卖出事务内冻结最终结算。成员为账户长仓的对手盘，因此成员收益与账户净盈亏方向相反。 */
async function saveStockSaleProfitAllocations(
  conn: any,
  params: {
    lotId: number;
    sellEventId: number;
    quantity: number;
    salePrice: number;
    sellFee: number;
    createdBy: number;
  },
) {
  const [lotRows] = await conn.execute(
    `SELECT l.id, l.symbol, l.initial_quantity, l.unit_cost, opening_event.transaction_fee AS opening_fee
     FROM ledger_stock_lots l
     LEFT JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id
     WHERE l.id = ? LIMIT 1 FOR UPDATE`,
    [params.lotId],
  );
  const lot = (lotRows as any[])[0];
  if (!lot) throw new Error("卖出分配所对应的持仓编号不存在");

  const [participantRows] = await conn.execute(
    `SELECT c.participation_id, SUM(c.quantity) AS closed_quantity,
            p.user_id, COALESCE(NULLIF(u.name, ''), u.username, CONCAT('用户#', p.user_id)) AS member_name
     FROM ledger_stock_participation_closures c
     INNER JOIN ledger_stock_lot_participations p ON p.id = c.participation_id
     LEFT JOIN users u ON u.id = p.user_id
     WHERE c.sell_event_id = ? AND p.lot_id = ?
     GROUP BY c.participation_id, p.user_id, u.name, u.username
     ORDER BY MIN(c.id) ASC`,
    [params.sellEventId, params.lotId],
  );
  const memberTargets = (participantRows as any[]).map((row) => ({
    recipientType: "member" as const,
    participationId: Number(row.participation_id),
    userId: Number(row.user_id),
    name: String(row.member_name || `用户#${row.user_id}`),
    quantity: numberValue(row.closed_quantity),
  })).filter((row) => row.quantity > EPSILON);
  const memberQuantity = memberTargets.reduce((sum, row) => sum + row.quantity, 0);
  if (memberQuantity - params.quantity > EPSILON) {
    throw new Error("成员分配股数超过本次可结清数量，请刷新后重试");
  }
  if (memberTargets.length === 0) return;

  const openingFee = lot.opening_fee === null || lot.opening_fee === undefined
    ? params.quantity * numberValue(lot.unit_cost) * STOCK_TRADE_FEE_RATE
    : numberValue(lot.opening_fee) * params.quantity / Math.max(EPSILON, numberValue(lot.initial_quantity));
  const accountNetProfit = params.quantity * params.salePrice - params.sellFee - params.quantity * numberValue(lot.unit_cost) - openingFee;
  for (const target of memberTargets) {
    const percentage = params.quantity > EPSILON ? target.quantity / params.quantity * 100 : 0;
    // 成员是账户长仓的对手盘：账户亏损，成员盈利。
    const recipientProfit = -accountNetProfit * percentage / 100;
    await conn.execute(
      `INSERT INTO ledger_stock_sale_profit_allocations
       (sell_event_id, recipient_type, participation_id, user_id, recipient_name, allocation_quantity, share_percent, distributable_amount, currency, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.sellEventId,
        target.recipientType,
        target.participationId,
        target.userId,
        target.name,
        target.quantity,
        Number(percentage.toFixed(8)),
        Number(recipientProfit.toFixed(8)),
        stockCurrency(String(lot.symbol || "")),
        params.createdBy,
      ],
    );
  }
}

/**
 * 已卖出订单的修改是原单覆盖：保留同一个卖出事件 ID，只更新价格、时间、备注、
 * 双边手续费和成员分配结果。不会新增“更正单”，也不会把原单标记为作废。
 */
export async function updateStockTagSale(input: {
  ledgerId: number;
  categoryId: number;
  eventId: number;
  executionPrice: number;
  actualTradedAt: string;
  note?: string;
  profitAllocations?: StockSaleProfitAllocationInput[];
  userId: number;
  systemRole?: string;
}) {
  const access = await assertStockTagAccess(input.ledgerId, input.categoryId, input.userId, input.systemRole, true);
  const executionPrice = Number(input.executionPrice);
  if (!Number.isFinite(executionPrice) || executionPrice <= 0) throw new Error("实际卖出价格必须大于 0");
  const actualTradedAt = new Date(input.actualTradedAt);
  if (Number.isNaN(actualTradedAt.getTime())) throw new Error("实际成交时间无效");
  const note = String(input.note || "").trim().slice(0, 3000);
  await ensureStockCalendarResultTable();
  const tx = await getDbTransactionConnection();
  if (!tx) throw new Error("数据库连接不可用");
  try {
    await (tx as any).beginTransaction();
    const [eventRows] = await (tx as any).execute(
      `SELECT id, event_type, status, quantity
       FROM ledger_stock_events
       WHERE id = ? AND ledger_id = ? AND category_id = ?
       LIMIT 1 FOR UPDATE`,
      [input.eventId, access.ledgerId, access.categoryId],
    );
    const event = (eventRows as any[])[0];
    if (!event || event.status !== 'active' || event.event_type !== 'sell') {
      throw new Error("仅可修改有效的已卖出订单");
    }
    const [allocationRows] = await (tx as any).execute(
      `SELECT lot_id, SUM(quantity) AS quantity
       FROM ledger_stock_event_lot_allocations
       WHERE event_id = ?
       GROUP BY lot_id
       FOR UPDATE`,
      [input.eventId],
    );
    const eventLots = allocationRows as any[];
    if (eventLots.length !== 1) {
      throw new Error("该历史卖出包含多个持仓编号，暂不能在此直接修改");
    }
    const lotId = Number(eventLots[0].lot_id);
    const soldQuantity = numberValue(eventLots[0].quantity);
    if (!Number.isInteger(lotId) || lotId <= 0 || soldQuantity <= EPSILON) {
      throw new Error("该卖出订单缺少有效的持仓编号或卖出数量");
    }
    const [otherClosureRows] = await (tx as any).execute(
      `SELECT COUNT(*) AS count
       FROM ledger_stock_participation_closures c
       INNER JOIN ledger_stock_lot_participations p ON p.id = c.participation_id
       WHERE p.lot_id = ? AND c.sell_event_id <> ?`,
      [lotId, input.eventId],
    );
    if (numberValue((otherClosureRows as any[])[0]?.count) > 0) {
      throw new Error("该持仓编号存在其他历史结算，暂不能覆盖此笔卖出");
    }
    // 先撤除旧的最终分配快照，随后按本次保存的成员比例重新生成。
    // 这样即便数据库启用了参与记录外键，也可以安全调整零份额成员。
    await (tx as any).execute(`DELETE FROM ledger_stock_sale_profit_allocations WHERE sell_event_id = ?`, [input.eventId]);

    if (input.profitAllocations !== undefined) {
      const shareByUser = new Map<number, number>();
      for (const item of input.profitAllocations) {
        const userId = Number(item.userId);
        const percentage = Number(item.percentage);
        if (!Number.isInteger(userId) || userId <= 0 || shareByUser.has(userId)) {
          throw new Error("成员分配比例存在重复或无效成员，请刷新后重试");
        }
        if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
          throw new Error("每位成员的分配比例必须在0%到100%之间");
        }
        shareByUser.set(userId, percentage);
      }
      const totalPercentage = Array.from(shareByUser.values()).reduce((sum, value) => sum + value, 0);
      if (totalPercentage > 100.001) {
        throw new Error(`成员分配比例合计不能超过100%，当前为${totalPercentage.toFixed(4)}%`);
      }
      const submittedUserIds = Array.from(shareByUser.keys());
      if (submittedUserIds.length > 0) {
        const placeholders = submittedUserIds.map(() => '?').join(',');
        const [memberRows] = await (tx as any).execute(
          `SELECT userId FROM ledger_members WHERE ledgerId = ? AND userId IN (${placeholders}) FOR UPDATE`,
          [access.ledgerId, ...submittedUserIds],
        );
        if ((memberRows as any[]).length !== submittedUserIds.length) {
          throw new Error("分配成员不属于当前37号账本，请刷新后重试");
        }
      }
      const [participationRows] = await (tx as any).execute(
        `SELECT id, user_id, entry_price, start_date, pause_date
         FROM ledger_stock_lot_participations
         WHERE lot_id = ? FOR UPDATE`,
        [lotId],
      );
      const participations = participationRows as any[];
      const existingByUser = new Map(participations.map((row) => [Number(row.user_id), row]));
      await (tx as any).execute(`DELETE FROM ledger_stock_participation_closures WHERE sell_event_id = ?`, [input.eventId]);
      for (const participation of participations) {
        const userId = Number(participation.user_id);
        const desiredQuantity = Number((soldQuantity * (shareByUser.get(userId) || 0) / 100).toFixed(8));
        if (desiredQuantity <= EPSILON) {
          await (tx as any).execute(`DELETE FROM ledger_stock_lot_participations WHERE id = ?`, [participation.id]);
        } else {
          await (tx as any).execute(
            `UPDATE ledger_stock_lot_participations
             SET allocated_quantity = ?, remaining_quantity = 0, assigned_by = ?
             WHERE id = ?`,
            [desiredQuantity, input.userId, participation.id],
          );
        }
      }
      const [lotRows] = await (tx as any).execute(
        `SELECT l.unit_cost, l.opened_at, opening_event.market_reference_price
         FROM ledger_stock_lots l
         INNER JOIN ledger_stock_events opening_event ON opening_event.id = l.opened_event_id
         WHERE l.id = ? LIMIT 1 FOR UPDATE`,
        [lotId],
      );
      const lot = (lotRows as any[])[0];
      if (!lot) throw new Error("卖出订单对应的持仓编号不存在");
      const defaultEntryPrice = numberValue(lot.unit_cost) || numberValue(lot.market_reference_price);
      const defaultStartDate = normalizeStoredDate(lot.opened_at) || beijingDate();
      for (const userId of submittedUserIds) {
        const desiredQuantity = Number((soldQuantity * (shareByUser.get(userId) || 0) / 100).toFixed(8));
        if (desiredQuantity <= EPSILON || existingByUser.has(userId)) continue;
        await (tx as any).execute(
          `INSERT INTO ledger_stock_lot_participations
           (ledger_id, category_id, lot_id, user_id, allocated_quantity, remaining_quantity, entry_price, start_date, pause_date, assigned_by)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL, ?)`,
          [access.ledgerId, access.categoryId, lotId, userId, desiredQuantity, defaultEntryPrice, defaultStartDate, input.userId],
        );
      }
      const [updatedParticipationRows] = await (tx as any).execute(
        `SELECT id, user_id FROM ledger_stock_lot_participations WHERE lot_id = ? FOR UPDATE`,
        [lotId],
      );
      const updatedParticipationByUser = new Map((updatedParticipationRows as any[]).map((row) => [Number(row.user_id), Number(row.id)]));
      for (const userId of submittedUserIds) {
        const desiredQuantity = Number((soldQuantity * (shareByUser.get(userId) || 0) / 100).toFixed(8));
        const participationId = updatedParticipationByUser.get(userId);
        if (desiredQuantity <= EPSILON || !participationId) continue;
        await (tx as any).execute(
          `INSERT INTO ledger_stock_participation_closures (participation_id, sell_event_id, quantity, sale_price)
           VALUES (?, ?, ?, ?)`,
          [participationId, input.eventId, desiredQuantity, executionPrice],
        );
      }
    } else {
      await (tx as any).execute(
        `UPDATE ledger_stock_participation_closures SET sale_price = ? WHERE sell_event_id = ?`,
        [executionPrice, input.eventId],
      );
    }

    const sellFee = Number((soldQuantity * executionPrice * STOCK_TRADE_FEE_RATE).toFixed(8));
    await (tx as any).execute(
      `UPDATE ledger_stock_events
       SET execution_price = ?, transaction_fee = ?, actual_traded_at = ?, note = ?
       WHERE id = ?`,
      [executionPrice, sellFee, actualTradedAt, note || null, input.eventId],
    );
    // 最终收益和成员比例是该事件的当前结果；保存时直接覆盖，不保留第二份更正快照。
    await saveStockSaleProfitAllocations(tx, {
      lotId,
      sellEventId: input.eventId,
      quantity: soldQuantity,
      salePrice: executionPrice,
      sellFee,
      createdBy: input.userId,
    });
    await markStockCalendarResultDirty(tx, access.categoryId);
    await (tx as any).commit();
    invalidateMemberStockReadCaches();
    queueStockCalendarResultRebuild(access.categoryId);
    return { success: true, eventId: input.eventId, lotId };
  } catch (error) {
    await (tx as any).rollback();
    throw error;
  } finally {
    if (typeof (tx as any).release === 'function') (tx as any).release();
  }
}
