import { TRPCError } from "@trpc/server";
import { getDbConnection, getDbTransactionConnection } from "./db";
import * as dbLedger from "./db-ledger";

export const LEDGER_52_T0_JOURNAL_ID = 52;
/** OKX VIP 2 合约：挂单 0.0150%，市价吃单 0.0360%（2026-10-04由管理员确认）。 */
export const OKX_VIP2_TAKER_FEE_RATE = "0.00036";
const POSITION_ARCHIVE_STEP = 10;

export type T0JournalAction = "openLong" | "closeLong" | "openShort" | "closeShort";
const T0_JOURNAL_ACTIONS = new Set<T0JournalAction>(["openLong", "closeLong", "openShort", "closeShort"]);
export type T0JournalInstrumentType = "spot" | "contract" | "option";
const T0_JOURNAL_INSTRUMENT_TYPES = new Set<T0JournalInstrumentType>(["spot", "contract", "option"]);
const ETH_QUANTITY_RESTORE_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;

export type T0JournalActor = {
  id: number;
  role?: string | null;
  isViewingAs?: boolean;
};

export type T0JournalReadScope =
  | { mode: "admin"; journalOwnerUserId: number }
  | { mode: "member"; relatedUserId: number };

export type SaveT0JournalEntryInput = {
  actorUserId: number;
  accountId?: number;
  accountName?: string;
  /** 管理员可在开单后补充；未设置时按未关联订单归集。 */
  relatedUserId?: number;
  /** 同一关联用户下的独立专项款；开仓关联用户时必须指定，旧流水保留为空。 */
  relatedFundId?: number;
  relatedFundName?: string;
  symbol: "ETH";
  action: T0JournalAction;
  /** 仅开仓主单可锁定，供管理员逐笔报价黑金标识使用。 */
  instrumentType?: T0JournalInstrumentType;
  isLocked?: boolean;
  quantity: string;
  price: string;
  targetPrice?: string;
  note?: string;
  clientRequestId: string;
};

/**
 * 收益分配规则绑定专项项目，只作用于未来新开仓：修改比例时保留旧规则，并由订单快照持续引用，
 * 因此历史开平仓绝不会被新比例回溯改写。
 */
export type T0JournalProfitShareRule = {
  id: number;
  relatedFundId: number;
  relatedFundName: string;
  sourceUserId: number;
  sourceUserName: string;
  beneficiaryUserId: number;
  beneficiaryUserName: string;
  percentage: number;
  createdAt: string;
};

/** 开仓或平仓的不可变收益分配快照；平仓可按 FIFO 拆到多个开仓来源。 */
export type T0JournalProfitShareSnapshot = {
  entryId: string;
  openingEntryId: string;
  relatedFundId: number;
  relatedFundName?: string;
  sourceUserId: number;
  beneficiaryUserId: number;
  percentage: number;
  matchedQuantity: number;
  sourceUserName?: string;
  beneficiaryUserName?: string;
};

let tablesReady: Promise<void> | null = null;

function asRows(result: unknown): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as any[];
  return Array.isArray(result) ? result as any[] : [];
}

function normalizeInstrumentType(value: unknown, required = false): T0JournalInstrumentType | undefined {
  const normalized = String(value || "").trim() as T0JournalInstrumentType;
  if (!normalized) {
    if (required) throw new TRPCError({ code: "BAD_REQUEST", message: "请选择现货、合约或期权" });
    return undefined;
  }
  if (!T0_JOURNAL_INSTRUMENT_TYPES.has(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "订单类型无效，请重新选择" });
  }
  return normalized;
}

function isoTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

/** 将 JSON 审计快照中的 ISO 时间还原为 MySQL DATETIME(3) 可接受的 UTC 字符串。 */
function mysqlDateTime(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  const resolved = Number.isNaN(date.getTime()) ? new Date() : date;
  return resolved.toISOString().slice(0, 23).replace("T", " ");
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** 输入可为整数或一/两位小数，入账统一使用两位小数字符串，避免浮点补零。 */
function normalizeEthQuantity(value: string): string {
  const [integerPart, fractionalPart = ""] = String(value).trim().split(".");
  return `${integerPart}.${fractionalPart.padEnd(2, "0")}`;
}

/**
 * 审计快照来自 MySQL DECIMAL 字段，常带 18 位零补位；恢复时仅接受超过两位部分均为零的数量，
 * 既兼容历史快照，也不会静默截断真实的超精度数量。
 */
function normalizeStoredEthQuantity(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const match = /^(0|[1-9]\d{0,3})(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;
  const [, integerPart, fractionalPart = ""] = match;
  if (fractionalPart.length > 2 && /[1-9]/.test(fractionalPart.slice(2))) return null;
  return `${integerPart}.${fractionalPart.slice(0, 2).padEnd(2, "0")}`;
}

function actionSide(action: T0JournalAction): "long" | "short" {
  return action === "openLong" || action === "closeLong" ? "long" : "short";
}

function isOpeningAction(action: T0JournalAction): boolean {
  return action === "openLong" || action === "openShort";
}

/**
 * 不受前端点击价格格影响，始终按实际成交价归入十美元档：
 * 多仓向上归档（2701 → 2710），空仓向下归档（2701 → 2700）。
 */
function archivePriceForAction(action: T0JournalAction, value: unknown): number {
  const numeric = toNumber(value);
  if (numeric <= 0) return 0;
  const scaled = numeric / POSITION_ARCHIVE_STEP;
  const archive = actionSide(action) === "long"
    ? Math.ceil(scaled - 1e-9)
    : Math.floor(scaled + 1e-9);
  return Number((archive * POSITION_ARCHIVE_STEP).toFixed(8));
}

function archivedTargetPrice(action: T0JournalAction, targetPrice: unknown, fallbackPrice?: unknown): number {
  const target = toNumber(targetPrice);
  return archivePriceForAction(action, target > 0 ? target : fallbackPrice);
}

function quantityToCents(value: unknown): number {
  const normalized = normalizeEthQuantity(String(value));
  const [integerPart = "0", fractionalPart = "00"] = normalized.split(".");
  return Number(integerPart) * 100 + Number(fractionalPart.slice(0, 2).padEnd(2, "0"));
}

function priceKey(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toFixed(8);
}

function relatedUserKey(value: unknown): string {
  const userId = toNumber(value);
  return userId > 0 ? String(userId) : "legacy-unlinked";
}

function relatedFundKey(value: unknown): string {
  const fundId = toNumber(value);
  return fundId > 0 ? String(fundId) : "legacy-unclassified";
}

function calculateAvailableCloseCents(rows: any[], action: T0JournalAction, targetPrice: string, relatedUserId: number, relatedFundId: number): number {
  const balances = new Map<string, number>();
  for (const row of rows) {
    const rowAction = String(row.action) as T0JournalAction;
    const side = actionSide(rowAction);
    const userKey = relatedUserKey(row.related_user_id);
    const fundKey = relatedFundKey(row.related_fund_id);
    if (isOpeningAction(rowAction)) {
      // 用实际开仓成交价重算，以自动兼容旧版按多空方向写入的归档档位。
      const archivePrice = archivePriceForAction(rowAction, row.price);
      const key = `${side}:${priceKey(archivePrice)}:${userKey}:${fundKey}`;
      balances.set(key, (balances.get(key) || 0) + quantityToCents(row.quantity));
      continue;
    }
    if (row.target_price === null || row.target_price === undefined) continue;
    const archivePrice = archivedTargetPrice(rowAction, row.target_price);
    const key = `${side}:${priceKey(archivePrice)}:${userKey}:${fundKey}`;
    balances.set(key, Math.max(0, (balances.get(key) || 0) - quantityToCents(row.quantity)));
  }
  const archivePrice = archivedTargetPrice(action, targetPrice);
  return balances.get(`${actionSide(action)}:${priceKey(archivePrice)}:${relatedUserKey(relatedUserId)}:${relatedFundKey(relatedFundId)}`) || 0;
}

/**
 * 删除或编辑开仓前，按与平仓可用量一致的 FIFO 口径判断该主单是否真的被后续平仓消耗。
 * 不能仅因同一十美元档存在历史平仓就拒绝：平仓可能早于该开仓，或已由更早的主单承接。
 */
function openingHasDependentClose(rows: any[], openingEntryId: number): boolean {
  const opening = rows.find((row) => Number(row.id) === openingEntryId);
  if (!opening) return false;

  const openingAction = String(opening.action) as T0JournalAction;
  if (!isOpeningAction(openingAction)) return false;

  const closingAction: T0JournalAction = actionSide(openingAction) === "long" ? "closeLong" : "closeShort";
  const archivePrice = archivePriceForAction(openingAction, opening.price);
  const archiveKey = priceKey(archivePrice);
  const openingQueue: Array<{ entryId: number; remainingCents: number }> = [];

  for (const row of rows) {
    const rowAction = String(row.action) as T0JournalAction;
    if (rowAction === openingAction) {
      if (priceKey(archivePriceForAction(rowAction, row.price)) !== archiveKey) continue;
      openingQueue.push({ entryId: Number(row.id), remainingCents: quantityToCents(row.quantity) });
      continue;
    }
    if (rowAction !== closingAction || row.target_price === null || row.target_price === undefined) continue;
    if (priceKey(archivedTargetPrice(rowAction, row.target_price, row.price)) !== archiveKey) continue;

    let remainingCloseCents = quantityToCents(row.quantity);
    for (const queuedOpening of openingQueue) {
      if (remainingCloseCents <= 0) break;
      if (queuedOpening.remainingCents <= 0) continue;
      const allocatedCents = Math.min(queuedOpening.remainingCents, remainingCloseCents);
      queuedOpening.remainingCents -= allocatedCents;
      remainingCloseCents -= allocatedCents;
      if (queuedOpening.entryId === openingEntryId && allocatedCents > 0) return true;
    }
  }

  return false;
}

function mapAccount(row: any) {
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    lastUsedAt: row.last_used_at ? isoTime(row.last_used_at) : null,
    createdAt: isoTime(row.created_at),
  };
}

function mapRelatedUser(row: any) {
  const id = toNumber(row.related_user_id ?? row.id);
  return {
    id,
    name: String(row.name || row.username || `用户#${id}`),
    username: row.username ? String(row.username) : undefined,
    avatar: row.avatar ? String(row.avatar) : undefined,
    lastUsedAt: row.last_used_at ? isoTime(row.last_used_at) : null,
  };
}

function mapRelatedFund(row: any) {
  const id = toNumber(row.related_fund_id ?? row.id);
  const relatedUserId = toNumber(row.related_user_id);
  return {
    id,
    relatedUserId: relatedUserId > 0 ? relatedUserId : undefined,
    name: String(row.name || "未命名专项款"),
    lastUsedAt: row.last_used_at ? isoTime(row.last_used_at) : null,
  };
}

function mapEntry(row: any) {
  const relatedUserId = toNumber(row.related_user_id ?? row.relatedUserId);
  const relatedFundId = toNumber(row.related_fund_id ?? row.relatedFundId);
  return {
    id: String(row.id),
    accountId: Number(row.account_id),
    accountName: String(row.account_name || ""),
    accountHidden: Boolean(toNumber(row.account_hidden ?? row.accountHidden)),
    relatedUserId: relatedUserId > 0 ? relatedUserId : undefined,
    relatedUserName: row.related_user_name ?? row.relatedUserName ?? undefined,
    relatedUsername: row.related_username ?? row.relatedUsername ?? undefined,
    relatedUserAvatar: row.related_user_avatar ?? row.relatedUserAvatar ?? undefined,
    relatedUserHidden: Boolean(toNumber(row.related_user_hidden ?? row.relatedUserHidden)),
    relatedFundId: relatedFundId > 0 ? relatedFundId : undefined,
    relatedFundName: row.related_fund_name ?? row.relatedFundName ?? undefined,
    relatedFundHidden: Boolean(toNumber(row.related_fund_hidden ?? row.relatedFundHidden)),
    symbol: String(row.symbol || "ETH"),
    action: String(row.action) as T0JournalAction,
    instrumentType: T0_JOURNAL_INSTRUMENT_TYPES.has(String(row.instrument_type ?? row.instrumentType ?? "") as T0JournalInstrumentType)
      ? String(row.instrument_type ?? row.instrumentType) as T0JournalInstrumentType
      : undefined,
    isLocked: Boolean(toNumber(row.is_locked ?? row.isLocked)),
    quantity: toNumber(row.quantity),
    price: toNumber(row.price),
    fee: toNumber(row.fee_usdt),
    targetPrice: row.target_price === null || row.target_price === undefined ? undefined : toNumber(row.target_price),
    note: row.note ? String(row.note) : undefined,
    createdAt: isoTime(row.trade_time || row.created_at),
  };
}

function mapProfitShareRule(row: any): T0JournalProfitShareRule {
  const sourceUserId = toNumber(row.source_user_id ?? row.sourceUserId);
  const relatedFundId = toNumber(row.related_fund_id ?? row.relatedFundId);
  const beneficiaryUserId = toNumber(row.beneficiary_user_id ?? row.beneficiaryUserId);
  return {
    id: toNumber(row.id),
    relatedFundId,
    relatedFundName: String(row.related_fund_name ?? row.relatedFundName ?? `项目#${relatedFundId}`),
    sourceUserId,
    sourceUserName: String(row.source_user_name ?? row.sourceUserName ?? `用户#${sourceUserId}`),
    beneficiaryUserId,
    beneficiaryUserName: String(row.beneficiary_user_name ?? row.beneficiaryUserName ?? `用户#${beneficiaryUserId}`),
    percentage: toNumber(row.share_percentage ?? row.percentage),
    createdAt: isoTime(row.created_at ?? row.createdAt),
  };
}

function mapProfitShareSnapshot(row: any): T0JournalProfitShareSnapshot {
  const sourceUserId = toNumber(row.source_user_id ?? row.sourceUserId);
  const relatedFundId = toNumber(row.related_fund_id ?? row.relatedFundId);
  const beneficiaryUserId = toNumber(row.beneficiary_user_id ?? row.beneficiaryUserId);
  return {
    entryId: String(row.entry_id ?? row.entryId),
    openingEntryId: String(row.opening_entry_id ?? row.openingEntryId),
    relatedFundId,
    relatedFundName: row.related_fund_name ?? row.relatedFundName ?? undefined,
    sourceUserId,
    beneficiaryUserId,
    percentage: toNumber(row.share_percentage ?? row.percentage),
    matchedQuantity: toNumber(row.matched_quantity ?? row.matchedQuantity),
    sourceUserName: row.source_user_name ?? row.sourceUserName ?? undefined,
    beneficiaryUserName: row.beneficiary_user_name ?? row.beneficiaryUserName ?? undefined,
  };
}

function mapRecoverableAudit(row: any) {
  try {
    const snapshot = JSON.parse(String(row.before_snapshot || ""));
    // 旧版删除审计未保存重建所需的请求标识，保留审计但不在“可恢复”中展示，避免误恢复。
    if (!snapshot?.id || !snapshot?.client_request_id) return null;
    return {
      auditId: String(row.audit_id),
      operation: String(row.operation),
      revertedAt: isoTime(row.created_at),
      entry: mapEntry(snapshot),
    };
  } catch {
    return null;
  }
}

/**
 * 账户与流水均按 ledger 52 + 当前管理员 user_id 分区。
 * 不设外键，避免旧库迁移时受历史数据状态影响；所有读写均由接口侧权限校验保障。
 */
export async function ensureLedger52T0JournalTables(conn?: any): Promise<void> {
  if (tablesReady) return tablesReady;
  tablesReady = (async () => {
    const db = conn ?? await getDbConnection();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0 速记账本数据库连接失败" });

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_accounts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        name VARCHAR(80) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_used_at DATETIME(3) DEFAULT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_account_owner_name (ledger_id, user_id, name),
        KEY idx_t0_journal_account_recent (ledger_id, user_id, is_active, last_used_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：当前管理员可见的下单账户'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_related_funds (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        related_user_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(80) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_used_at DATETIME(3) DEFAULT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_related_fund_name (ledger_id, user_id, name),
        KEY idx_t0_journal_related_fund_recent (ledger_id, user_id, related_user_id, is_active, last_used_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：关联用户下的专项款目录'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_entries (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        account_id BIGINT UNSIGNED NOT NULL,
        related_user_id BIGINT UNSIGNED DEFAULT NULL,
        related_fund_id BIGINT UNSIGNED DEFAULT NULL,
        symbol VARCHAR(16) NOT NULL DEFAULT 'ETH',
        instrument_type ENUM('spot','contract','option') DEFAULT NULL,
        is_locked TINYINT(1) NOT NULL DEFAULT 0 COMMENT '仅T+0开仓主单的管理员锁定展示标记',
        action ENUM('openLong','closeLong','openShort','closeShort') NOT NULL,
        quantity DECIMAL(36,18) NOT NULL,
        price DECIMAL(36,18) NOT NULL,
        fee_usdt DECIMAL(36,18) NOT NULL DEFAULT 0,
        target_price DECIMAL(36,18) DEFAULT NULL,
        note VARCHAR(500) DEFAULT NULL,
        client_request_id VARCHAR(64) NOT NULL,
        created_by_user_id INT NOT NULL,
        trade_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_entry_request (ledger_id, user_id, client_request_id),
        KEY idx_t0_journal_entry_account_time (ledger_id, user_id, account_id, trade_time),
        KEY idx_t0_journal_entry_related_user_time (ledger_id, user_id, related_user_id, trade_time),
        KEY idx_t0_journal_entry_related_fund_time (ledger_id, user_id, related_fund_id, trade_time),
        KEY idx_t0_journal_entry_instrument_time (ledger_id, user_id, instrument_type, trade_time),
        KEY idx_t0_journal_entry_owner_time (ledger_id, user_id, trade_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：管理员手工下单流水与创建审计'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_entry_audits (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        entry_id BIGINT UNSIGNED NOT NULL,
        operation ENUM('update','delete','revert','restore') NOT NULL,
        before_snapshot LONGTEXT NOT NULL,
        after_snapshot LONGTEXT DEFAULT NULL,
        operator_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_t0_journal_audit_entry (ledger_id, user_id, entry_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：编辑与删除审计快照'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_dimension_audits (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        dimension ENUM('account','related_user','related_fund') NOT NULL,
        dimension_id BIGINT UNSIGNED NOT NULL,
        related_user_id BIGINT UNSIGNED DEFAULT NULL,
        operation ENUM('rename','delete') NOT NULL DEFAULT 'rename',
        old_name VARCHAR(80) NOT NULL,
        new_name VARCHAR(80) NOT NULL,
        affected_entry_count INT UNSIGNED NOT NULL DEFAULT 0,
        operator_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_t0_journal_dimension_audit (ledger_id, user_id, dimension, dimension_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：账户、关联用户及项目目录变更审计'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_deleted_dimensions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        dimension ENUM('account','related_user','related_fund') NOT NULL,
        dimension_id BIGINT UNSIGNED NOT NULL,
        related_user_id BIGINT UNSIGNED DEFAULT NULL,
        deleted_name VARCHAR(80) NOT NULL,
        operator_user_id INT NOT NULL,
        deleted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_deleted_dimension (ledger_id, user_id, dimension, dimension_id),
        KEY idx_t0_journal_deleted_dimension_owner (ledger_id, user_id, dimension, deleted_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：已隐藏目录，保留稳定键供历史核对'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_profit_share_rules (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        source_user_id BIGINT UNSIGNED NOT NULL,
        related_fund_id BIGINT UNSIGNED DEFAULT NULL,
        beneficiary_user_id BIGINT UNSIGNED NOT NULL,
        share_percentage DECIMAL(7,4) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        superseded_by_rule_id BIGINT UNSIGNED DEFAULT NULL,
        ended_at DATETIME(3) DEFAULT NULL,
        created_by_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_t0_journal_profit_share_source_active (ledger_id, user_id, source_user_id, is_active, id),
        KEY idx_t0_journal_profit_share_fund_active (ledger_id, user_id, related_fund_id, is_active, id),
        KEY idx_t0_journal_profit_share_beneficiary_active (ledger_id, user_id, beneficiary_user_id, is_active, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：按专项项目配置的未来新开仓收益分配规则'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_profit_share_source_settings (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        source_user_id BIGINT UNSIGNED NOT NULL,
        configured_by_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_profit_share_source_setting (ledger_id, user_id, source_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：关联用户是否已完成首次收益分配决定'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_entry_profit_shares (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        entry_id BIGINT UNSIGNED NOT NULL,
        opening_entry_id BIGINT UNSIGNED NOT NULL,
        source_user_id BIGINT UNSIGNED NOT NULL,
        related_fund_id BIGINT UNSIGNED DEFAULT NULL,
        beneficiary_user_id BIGINT UNSIGNED NOT NULL,
        profit_share_rule_id BIGINT UNSIGNED DEFAULT NULL,
        share_percentage DECIMAL(7,4) NOT NULL,
        matched_quantity DECIMAL(36,18) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_entry_profit_share (ledger_id, user_id, entry_id, opening_entry_id, beneficiary_user_id),
        KEY idx_t0_journal_entry_profit_share_entry (ledger_id, user_id, entry_id),
        KEY idx_t0_journal_entry_profit_share_beneficiary (ledger_id, user_id, beneficiary_user_id, entry_id),
        KEY idx_t0_journal_entry_profit_share_fund (ledger_id, user_id, related_fund_id, entry_id),
        KEY idx_t0_journal_entry_profit_share_opening (ledger_id, user_id, opening_entry_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：开平仓收益分配不可变快照'
    `);

    const [dimensionAuditOperationColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_dimension_audits LIKE 'operation'`);
    if (asRows(dimensionAuditOperationColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_dimension_audits
          ADD COLUMN operation ENUM('rename','delete') NOT NULL DEFAULT 'rename' AFTER related_user_id,
          ADD COLUMN affected_entry_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER new_name
      `);
    }

    // 兼容已经创建过旧版审计表的生产库，使其可记录速记回撤与恢复动作。
    await db.execute(`
      ALTER TABLE ledger52_t0_journal_entry_audits
        MODIFY COLUMN operation ENUM('update','delete','revert','restore') NOT NULL
    `);

    // 兼容已创建的T+0流水表：关联用户为新增维度，旧流水保留为空，以免篡改历史记录。
    const [relatedUserColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'related_user_id'`);
    if (asRows(relatedUserColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN related_user_id BIGINT UNSIGNED DEFAULT NULL AFTER account_id,
          ADD KEY idx_t0_journal_entry_related_user_time (ledger_id, user_id, related_user_id, trade_time)
      `);
    }

    // 兼容已创建的流水表：专项款为新增维度，所有历史记录保留为空，前端标记为“未区分专项款（历史）”。
    const [relatedFundColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'related_fund_id'`);
    if (asRows(relatedFundColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN related_fund_id BIGINT UNSIGNED DEFAULT NULL AFTER related_user_id,
          ADD KEY idx_t0_journal_entry_related_fund_time (ledger_id, user_id, related_fund_id, trade_time)
      `);
    }

    // 开仓类型是新增研究维度：历史流水保持 NULL，管理员可在编辑开仓时按实际情况补录。
    const [instrumentTypeColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'instrument_type'`);
    if (asRows(instrumentTypeColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN instrument_type ENUM('spot','contract','option') DEFAULT NULL AFTER symbol,
          ADD KEY idx_t0_journal_entry_instrument_time (ledger_id, user_id, instrument_type, trade_time)
      `);
    }

    // 开仓锁定仅供管理员逐笔报价做黑金视觉标识；历史订单默认未锁，绝不影响数量、FIFO 或收益计算。
    const [lockedColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'is_locked'`);
    if (asRows(lockedColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0 COMMENT '仅T+0开仓主单的管理员锁定展示标记' AFTER instrument_type
      `);
    }

    // 项目名称在同一账本管理员范围内全局唯一，不能被不同关联用户重复使用。
    // 如历史数据已有重名，保留其可读性并由服务层阻止新的重复创建，避免初始化失败影响账本访问。
    const [duplicateFundNameRows] = await db.execute(`
      SELECT name FROM ledger52_t0_journal_related_funds
       WHERE ledger_id = ?
       GROUP BY user_id, name
      HAVING COUNT(*) > 1
       LIMIT 1
    `, [LEDGER_52_T0_JOURNAL_ID]);
    const [globalFundNameIndexRows] = await db.execute(`SHOW INDEX FROM ledger52_t0_journal_related_funds WHERE Key_name = 'uq_t0_journal_related_fund_name'`);
    if (asRows(duplicateFundNameRows).length === 0 && asRows(globalFundNameIndexRows).length === 0) {
      await db.execute(`ALTER TABLE ledger52_t0_journal_related_funds ADD UNIQUE KEY uq_t0_journal_related_fund_name (ledger_id, user_id, name)`);
    }

    // 项目级收益分配：旧的用户级规则保留审计，但不再被新订单读取；新规则和快照均固定专项项目键。
    const [profitShareRuleFundColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_profit_share_rules LIKE 'related_fund_id'`);
    if (asRows(profitShareRuleFundColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_profit_share_rules
          ADD COLUMN related_fund_id BIGINT UNSIGNED DEFAULT NULL AFTER source_user_id,
          ADD KEY idx_t0_journal_profit_share_fund_active (ledger_id, user_id, related_fund_id, is_active, id)
      `);
    }
    const [profitShareSnapshotFundColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entry_profit_shares LIKE 'related_fund_id'`);
    if (asRows(profitShareSnapshotFundColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entry_profit_shares
          ADD COLUMN related_fund_id BIGINT UNSIGNED DEFAULT NULL AFTER source_user_id,
          ADD KEY idx_t0_journal_entry_profit_share_fund (ledger_id, user_id, related_fund_id, entry_id)
      `);
    }
  })().catch((error) => {
    tablesReady = null;
    throw error;
  });
  return tablesReady;
}

/**
 * T+0阅读权限：管理员读取其管理流水的全量关联用户数据；52号账本成员只读取自身关联用户ID的数据。
 * 身份代入不是实际成员会话，不能借此浏览个人仓位。
 */
export async function resolveLedger52T0JournalReadScope(actor: T0JournalActor): Promise<T0JournalReadScope> {
  if (actor.isViewingAs) {
    throw new TRPCError({ code: "FORBIDDEN", message: "代入成员视角不可访问T+0速记账本" });
  }
  if (actor.role === "super_admin" || actor.role === "admin") {
    return { mode: "admin", journalOwnerUserId: actor.id };
  }

  const membership = await dbLedger.getUserMembership(LEDGER_52_T0_JOURNAL_ID, actor.id);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅52号账本成员可访问T+0速记账本" });
  }
  if (membership.role === "owner" || membership.role === "admin") {
    return { mode: "admin", journalOwnerUserId: actor.id };
  }
  return { mode: "member", relatedUserId: actor.id };
}

/** 所有写入与关联用户搜索继续只开放给账本管理员。 */
export async function assertLedger52T0JournalAccess(actor: T0JournalActor): Promise<void> {
  const scope = await resolveLedger52T0JournalReadScope(actor);
  if (scope.mode !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅52号账本管理员可操作T+0速记账本" });
  }
}

async function resolveLedger52T0JournalRelatedFund(tx: any, input: {
  actorUserId: number;
  relatedUserId: number;
  relatedFundId?: number;
  relatedFundName?: string;
  required?: boolean;
  /** 平仓可沿用已逻辑删除的历史项目，避免删除目录后无法完成既有仓位的平仓。 */
  allowInactive?: boolean;
}): Promise<{ id: number; name: string } | null> {
  const relatedFundId = Number(input.relatedFundId || 0);
  const relatedFundName = String(input.relatedFundName || "").trim();
  if (input.relatedUserId <= 0) {
    if (relatedFundId > 0 || relatedFundName) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请先选择关联用户，再选择专项款" });
    }
    return null;
  }
  if (relatedFundId > 0) {
    if (!Number.isInteger(relatedFundId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "专项款信息无效" });
    }
    const [fundRows] = await tx.execute(
      `SELECT id, name
         FROM ledger52_t0_journal_related_funds
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND related_user_id = ?
          AND (is_active = 1 OR ? = 1)
        LIMIT 1 FOR UPDATE`,
      [relatedFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.relatedUserId, input.allowInactive ? 1 : 0],
    );
    const fund = asRows(fundRows)[0];
    if (!fund) {
      throw new TRPCError({ code: "NOT_FOUND", message: "专项款不存在、已停用或不属于该关联用户" });
    }
    await tx.execute(
      `UPDATE ledger52_t0_journal_related_funds SET last_used_at = NOW(3)
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [relatedFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    return { id: relatedFundId, name: String(fund.name || "") };
  }
  if (relatedFundName) {
    const [sameNameRows] = await tx.execute(
      `SELECT id, related_user_id, name
         FROM ledger52_t0_journal_related_funds
        WHERE ledger_id = ? AND user_id = ? AND name = ?
        ORDER BY id ASC FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, relatedFundName],
    );
    const sameNameFunds = asRows(sameNameRows);
    const fundForOtherUser = sameNameFunds.find((fund) => toNumber(fund.related_user_id) !== input.relatedUserId);
    if (fundForOtherUser) {
      throw new TRPCError({ code: "CONFLICT", message: `项目名称“${relatedFundName}”已归属于其他关联用户，请使用不同名称` });
    }
    const existingFund = sameNameFunds[0];
    if (existingFund) {
      const existingFundId = toNumber(existingFund.id);
      await tx.execute(
        `UPDATE ledger52_t0_journal_related_funds
            SET is_active = 1, last_used_at = NOW(3), updated_at = NOW(3)
          WHERE id = ? AND ledger_id = ? AND user_id = ?`,
        [existingFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      return { id: existingFundId, name: String(existingFund.name || relatedFundName) };
    }
    const [result] = await tx.execute(
      `INSERT INTO ledger52_t0_journal_related_funds (ledger_id, user_id, related_user_id, name, is_active, last_used_at)
       VALUES (?, ?, ?, ?, 1, NOW(3))`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.relatedUserId, relatedFundName],
    );
    const createdFundId = Number((result as any).insertId || 0);
    if (!createdFundId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "专项款保存失败" });
    }
    return { id: createdFundId, name: relatedFundName };
  }
  if (input.required) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "关联用户开仓时，请选择或新建专项款" });
  }
  return null;
}

export async function getLedger52T0Journal(scope: T0JournalReadScope) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  await ensureLedger52T0JournalTables(conn);

  const isAdminScope = scope.mode === "admin";
  const journalOwnerUserId = isAdminScope ? scope.journalOwnerUserId : 0;
  const relatedUserId = scope.mode === "member" ? scope.relatedUserId : 0;
  const memberVisibilitySql = `(
    e.related_user_id = ?
    OR EXISTS (
      SELECT 1
        FROM ledger52_t0_journal_entry_profit_shares shared_entry
       WHERE shared_entry.ledger_id = e.ledger_id
         AND shared_entry.user_id = e.user_id
         AND shared_entry.entry_id = e.id
         AND shared_entry.beneficiary_user_id = ?
    )
  )`;
  const [accountResult, entryResult, recoverableAuditResult, recentUserResult, relatedFundResult] = await Promise.all([
    isAdminScope
      ? conn.execute(
        `SELECT id, name, last_used_at, created_at
           FROM ledger52_t0_journal_accounts
          WHERE ledger_id = ? AND user_id = ? AND is_active = 1
          ORDER BY last_used_at IS NULL ASC, last_used_at DESC, updated_at DESC, id DESC`,
        [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
      )
      : conn.execute(
        `SELECT a.id, a.name, MAX(e.trade_time) AS last_used_at, MIN(a.created_at) AS created_at
           FROM ledger52_t0_journal_entries e
           INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id AND a.is_active = 1
          WHERE e.ledger_id = ? AND ${memberVisibilitySql}
          GROUP BY a.id, a.name
          ORDER BY last_used_at DESC, a.id DESC`,
        [LEDGER_52_T0_JOURNAL_ID, relatedUserId, relatedUserId],
      ),
    conn.execute(
      `SELECT e.id, e.account_id,
              CASE WHEN a.is_active = 1 THEN a.name ELSE NULL END AS account_name,
              CASE WHEN a.is_active = 1 THEN 0 ELSE 1 END AS account_hidden,
              e.symbol, e.instrument_type, e.is_locked, e.action, e.related_user_id, e.related_fund_id,
              CASE WHEN f.is_active = 1 THEN f.name ELSE NULL END AS related_fund_name,
              CASE WHEN f.is_active = 1 THEN 0 ELSE 1 END AS related_fund_hidden,
              CASE WHEN deleted_user.id IS NULL THEN COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) ELSE NULL END AS related_user_name,
              CASE WHEN deleted_user.id IS NULL THEN u.username ELSE NULL END AS related_username,
              CASE WHEN deleted_user.id IS NULL THEN u.avatar ELSE NULL END AS related_user_avatar,
              CASE WHEN deleted_user.id IS NULL THEN 0 ELSE 1 END AS related_user_hidden,
              e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
         LEFT JOIN users u ON u.id = e.related_user_id
         LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
         LEFT JOIN ledger52_t0_journal_deleted_dimensions deleted_user
           ON deleted_user.ledger_id = e.ledger_id AND deleted_user.user_id = e.user_id
          AND deleted_user.dimension = 'related_user' AND deleted_user.dimension_id = e.related_user_id
        WHERE e.ledger_id = ? AND ${isAdminScope ? "e.user_id = ?" : memberVisibilitySql}
        ORDER BY e.trade_time ASC, e.id ASC
        LIMIT 2000`,
      isAdminScope
        ? [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId]
        : [LEDGER_52_T0_JOURNAL_ID, relatedUserId, relatedUserId],
    ),
    isAdminScope ? conn.execute(
      `SELECT a.id AS audit_id, a.entry_id, a.operation, a.before_snapshot, a.created_at
         FROM ledger52_t0_journal_entry_audits a
         INNER JOIN (
           SELECT entry_id, MAX(id) AS latest_audit_id
             FROM ledger52_t0_journal_entry_audits
            WHERE ledger_id = ? AND user_id = ?
            GROUP BY entry_id
         ) latest ON latest.latest_audit_id = a.id
        WHERE a.ledger_id = ? AND a.user_id = ?
          AND a.operation IN ('delete', 'revert')
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 30`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId, LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    ) : Promise.resolve([[]]),
    isAdminScope ? conn.execute(
      `SELECT e.related_user_id, u.username, u.name, u.avatar, MAX(e.trade_time) AS last_used_at
         FROM ledger52_t0_journal_entries e
         LEFT JOIN users u ON u.id = e.related_user_id
        WHERE e.ledger_id = ? AND e.user_id = ? AND e.related_user_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ledger52_t0_journal_deleted_dimensions deleted_user
             WHERE deleted_user.ledger_id = e.ledger_id AND deleted_user.user_id = e.user_id
               AND deleted_user.dimension = 'related_user' AND deleted_user.dimension_id = e.related_user_id
          )
        GROUP BY e.related_user_id, u.username, u.name, u.avatar
        ORDER BY last_used_at DESC, e.related_user_id DESC
        LIMIT 30`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    ) : Promise.resolve([[]]),
    isAdminScope ? conn.execute(
      `SELECT id, related_user_id, name, last_used_at
         FROM ledger52_t0_journal_related_funds
        WHERE ledger_id = ? AND user_id = ? AND is_active = 1
          AND NOT EXISTS (
            SELECT 1 FROM ledger52_t0_journal_deleted_dimensions deleted_user
             WHERE deleted_user.ledger_id = ledger52_t0_journal_related_funds.ledger_id
               AND deleted_user.user_id = ledger52_t0_journal_related_funds.user_id
               AND deleted_user.dimension = 'related_user'
               AND deleted_user.dimension_id = ledger52_t0_journal_related_funds.related_user_id
          )
        ORDER BY last_used_at IS NULL ASC, last_used_at DESC, updated_at DESC, id DESC
        LIMIT 200`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    ) : conn.execute(
      `SELECT f.id, f.related_user_id, f.name, MAX(e.trade_time) AS last_used_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_related_funds f
           ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id AND f.is_active = 1
        WHERE e.ledger_id = ? AND ${memberVisibilitySql}
        GROUP BY f.id, f.related_user_id, f.name
        ORDER BY last_used_at DESC, f.id DESC
        LIMIT 200`,
      [LEDGER_52_T0_JOURNAL_ID, relatedUserId, relatedUserId],
    ),
  ]);

  const entryRows = asRows(entryResult);
  const entryIds = entryRows.map((row) => toNumber(row.id)).filter((id) => id > 0);
  const [profitShareSnapshotResult, profitShareRuleResult] = await Promise.all([
    entryIds.length > 0
      ? conn.execute(
        `SELECT shared_entry.entry_id, shared_entry.opening_entry_id, shared_entry.source_user_id, shared_entry.related_fund_id,
                shared_entry.beneficiary_user_id, shared_entry.share_percentage, shared_entry.matched_quantity,
                COALESCE(NULLIF(source_user.name, ''), NULLIF(source_user.username, ''), CONCAT('用户#', shared_entry.source_user_id)) AS source_user_name,
                fund.name AS related_fund_name,
                COALESCE(NULLIF(beneficiary_user.name, ''), NULLIF(beneficiary_user.username, ''), CONCAT('用户#', shared_entry.beneficiary_user_id)) AS beneficiary_user_name
           FROM ledger52_t0_journal_entry_profit_shares shared_entry
           LEFT JOIN users source_user ON source_user.id = shared_entry.source_user_id
           LEFT JOIN ledger52_t0_journal_related_funds fund ON fund.id = shared_entry.related_fund_id AND fund.ledger_id = shared_entry.ledger_id AND fund.user_id = shared_entry.user_id
           LEFT JOIN users beneficiary_user ON beneficiary_user.id = shared_entry.beneficiary_user_id
          WHERE shared_entry.ledger_id = ? AND shared_entry.entry_id IN (${entryIds.map(() => "?").join(", ")})
          ORDER BY shared_entry.entry_id ASC, shared_entry.opening_entry_id ASC, shared_entry.id ASC`,
        [LEDGER_52_T0_JOURNAL_ID, ...entryIds],
      )
      : Promise.resolve([[]]),
    isAdminScope
      ? conn.execute(
        `SELECT rule_row.id, rule_row.source_user_id, rule_row.related_fund_id, rule_row.beneficiary_user_id, rule_row.share_percentage, rule_row.created_at,
                COALESCE(NULLIF(source_user.name, ''), NULLIF(source_user.username, ''), CONCAT('用户#', rule_row.source_user_id)) AS source_user_name,
                fund.name AS related_fund_name,
                COALESCE(NULLIF(beneficiary_user.name, ''), NULLIF(beneficiary_user.username, ''), CONCAT('用户#', rule_row.beneficiary_user_id)) AS beneficiary_user_name
           FROM ledger52_t0_journal_profit_share_rules rule_row
           LEFT JOIN users source_user ON source_user.id = rule_row.source_user_id
           LEFT JOIN ledger52_t0_journal_related_funds fund ON fund.id = rule_row.related_fund_id AND fund.ledger_id = rule_row.ledger_id AND fund.user_id = rule_row.user_id
           LEFT JOIN users beneficiary_user ON beneficiary_user.id = rule_row.beneficiary_user_id
          WHERE rule_row.ledger_id = ? AND rule_row.user_id = ? AND rule_row.is_active = 1
          ORDER BY rule_row.created_at DESC, rule_row.id DESC`,
        [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
      )
      : Promise.resolve([[]]),
  ]);

  return {
    viewerMode: scope.mode,
    viewerRelatedUserId: isAdminScope ? undefined : relatedUserId,
    accounts: asRows(accountResult).map(mapAccount),
    // 成员端无锁定功能，且始终使用整合报价：响应中完全不下发锁定展示字段。
    entries: entryRows.map((row) => {
      const entry = mapEntry(row);
      if (isAdminScope) return entry;
      const { isLocked: _isLocked, ...memberEntry } = entry;
      return memberEntry;
    }),
    recentUsers: asRows(recentUserResult).map(mapRelatedUser),
    relatedFunds: asRows(relatedFundResult).map(mapRelatedFund),
    profitShareSnapshots: asRows(profitShareSnapshotResult).map(mapProfitShareSnapshot),
    profitShareRules: asRows(profitShareRuleResult).map(mapProfitShareRule),
    recoverableEntries: asRows(recoverableAuditResult)
      .map(mapRecoverableAudit)
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}

/** 仅由已通过T+0管理员鉴权的路由调用，供关联用户的用户名/昵称模糊搜索使用。 */
export async function searchLedger52T0JournalUsers(query: string) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "用户搜索服务暂不可用" });
  const keyword = String(query || "").trim();
  if (!keyword) return [];
  const like = `%${keyword}%`;
  const [result] = await conn.execute(
    `SELECT id, username, name, avatar
       FROM users
      WHERE COALESCE(username, '') LIKE ? OR COALESCE(name, '') LIKE ?
      ORDER BY
        CASE WHEN username = ? THEN 0 WHEN name = ? THEN 1 ELSE 2 END,
        username ASC, id ASC
      LIMIT 20`,
    [like, like, keyword, keyword],
  );
  return asRows(result).map(mapRelatedUser);
}

function normalizeProfitSharePercentage(value: number): number {
  const percentage = Number(value);
  if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "每位收益分配人比例必须为1至100的整数" });
  }
  return percentage;
}

async function assertExistingGlobalUser(tx: any, userId: number, label: string) {
  const [rows] = await tx.execute(`SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`, [userId]);
  if (!asRows(rows)[0]) throw new TRPCError({ code: "NOT_FOUND", message: `${label}不存在或已失效，请重新搜索选择` });
}

async function getActiveLedger52T0JournalProfitShareRules(tx: any, input: { actorUserId: number; relatedFundId: number; lock?: boolean }) {
  const [rows] = await tx.execute(
    `SELECT id, source_user_id, related_fund_id, beneficiary_user_id, share_percentage, created_at
       FROM ledger52_t0_journal_profit_share_rules
      WHERE ledger_id = ? AND user_id = ? AND related_fund_id = ? AND is_active = 1
      ORDER BY beneficiary_user_id ASC, id ASC${input.lock ? " FOR UPDATE" : ""}`,
    [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.relatedFundId],
  );
  return asRows(rows);
}

/**
 * 将完整的多人比例清单另存为新版本，并停用旧清单；任何已落库开仓都只读取自身快照，绝不跟随后续修改。
 */
export async function setLedger52T0JournalProfitShareRules(input: {
  actorUserId: number;
  relatedFundId?: number;
  relatedUserId?: number;
  relatedFundName?: string;
  allocations: Array<{ beneficiaryUserId: number; percentage: number }>;
}) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const requestedFundId = Number(input.relatedFundId || 0);
  const requestedRelatedUserId = Number(input.relatedUserId || 0);
  const requestedFundName = String(input.relatedFundName || "").trim();
  if ((!Number.isInteger(requestedFundId) || requestedFundId <= 0)
    && (!Number.isInteger(requestedRelatedUserId) || requestedRelatedUserId <= 0 || !requestedFundName)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请选择已有项目，或填写新项目名称后设置收益分配" });
  }
  const normalizedAllocations = input.allocations.map((allocation) => ({
    beneficiaryUserId: Number(allocation.beneficiaryUserId),
    percentage: normalizeProfitSharePercentage(allocation.percentage),
  }));
  if (normalizedAllocations.length === 0 || normalizedAllocations.length > 20) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请设置1至20位收益分配人" });
  }
  const beneficiaryIds = new Set<number>();
  for (const allocation of normalizedAllocations) {
    if (!Number.isInteger(allocation.beneficiaryUserId) || allocation.beneficiaryUserId <= 0 || beneficiaryIds.has(allocation.beneficiaryUserId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "收益分配人不能重复，且必须来自全局用户库" });
    }
    beneficiaryIds.add(allocation.beneficiaryUserId);
  }
  const totalPercentage = normalizedAllocations.reduce((total, allocation) => total + allocation.percentage, 0);
  if (Math.abs(totalPercentage - 100) > 0.00001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `收益分配合计必须为100%，当前为${totalPercentage.toFixed(4).replace(/\.0+$/, "")}%` });
  }
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    let relatedFundId = requestedFundId;
    let sourceUserId = 0;
    if (relatedFundId > 0) {
      const [fundRows] = await tx.execute(
        `SELECT related_user_id FROM ledger52_t0_journal_related_funds
          WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1 LIMIT 1 FOR UPDATE`,
        [relatedFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      sourceUserId = toNumber(asRows(fundRows)[0]?.related_user_id);
      if (sourceUserId <= 0) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在、已停用或不属于当前账本" });
    } else {
      await assertExistingGlobalUser(tx, requestedRelatedUserId, "关联用户");
      const fund = await resolveLedger52T0JournalRelatedFund(tx, {
        actorUserId: input.actorUserId,
        relatedUserId: requestedRelatedUserId,
        relatedFundName: requestedFundName,
        required: true,
      });
      if (!fund) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "新项目创建失败" });
      relatedFundId = fund.id;
      sourceUserId = requestedRelatedUserId;
    }
    for (const allocation of normalizedAllocations) {
      await assertExistingGlobalUser(tx, allocation.beneficiaryUserId, "收益分配人");
    }
    const activeRules = await getActiveLedger52T0JournalProfitShareRules(tx, {
      actorUserId: input.actorUserId,
      relatedFundId,
      lock: true,
    });
    const orderedAllocations = [...normalizedAllocations].sort((a, b) => a.beneficiaryUserId - b.beneficiaryUserId);
    const unchanged = activeRules.length === orderedAllocations.length && activeRules.every((rule, index) => (
      toNumber(rule.beneficiary_user_id) === orderedAllocations[index].beneficiaryUserId
      && Math.abs(toNumber(rule.share_percentage) - orderedAllocations[index].percentage) < 0.00001
    ));
    if (unchanged) {
      await tx.commit();
      return { rules: activeRules.map(mapProfitShareRule) };
    }
    if (activeRules.length > 0) {
      await tx.execute(
        `UPDATE ledger52_t0_journal_profit_share_rules
            SET is_active = 0, ended_at = NOW(3), updated_at = NOW(3)
          WHERE ledger_id = ? AND user_id = ? AND related_fund_id = ? AND is_active = 1`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, relatedFundId],
      );
    }
    for (const allocation of orderedAllocations) {
      await tx.execute(
        `INSERT INTO ledger52_t0_journal_profit_share_rules
          (ledger_id, user_id, source_user_id, related_fund_id, beneficiary_user_id, share_percentage, is_active, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, sourceUserId, relatedFundId, allocation.beneficiaryUserId, allocation.percentage, input.actorUserId],
      );
    }
    const [rows] = await tx.execute(
      `SELECT rule_row.id, rule_row.source_user_id, rule_row.related_fund_id, rule_row.beneficiary_user_id, rule_row.share_percentage, rule_row.created_at,
              COALESCE(NULLIF(source_user.name, ''), NULLIF(source_user.username, ''), CONCAT('用户#', rule_row.source_user_id)) AS source_user_name,
              fund.name AS related_fund_name,
              COALESCE(NULLIF(beneficiary_user.name, ''), NULLIF(beneficiary_user.username, ''), CONCAT('用户#', rule_row.beneficiary_user_id)) AS beneficiary_user_name
         FROM ledger52_t0_journal_profit_share_rules rule_row
         LEFT JOIN users source_user ON source_user.id = rule_row.source_user_id
         LEFT JOIN ledger52_t0_journal_related_funds fund ON fund.id = rule_row.related_fund_id AND fund.ledger_id = rule_row.ledger_id AND fund.user_id = rule_row.user_id
         LEFT JOIN users beneficiary_user ON beneficiary_user.id = rule_row.beneficiary_user_id
        WHERE rule_row.ledger_id = ? AND rule_row.user_id = ? AND rule_row.related_fund_id = ? AND rule_row.is_active = 1
        ORDER BY rule_row.beneficiary_user_id ASC, rule_row.id ASC`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, relatedFundId],
    );
    const rules = asRows(rows);
    if (rules.length !== orderedAllocations.length) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "收益分配规则读取失败" });
    await tx.commit();
    return { rules: rules.map(mapProfitShareRule) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

type ProfitShareOpeningMatch = { openingEntryId: number; matchedQuantityCents: number };

/**
 * 与平仓可用量完全相同的 FIFO 口径，额外返回本次平仓实际消耗到的开仓主单。
 * 这让平仓永远继承其对应开仓当时的收益分配快照，而不是读取当前规则。
 */
function buildProfitShareOpeningMatches(rows: any[], action: T0JournalAction, targetPrice: string, relatedUserId: number, relatedFundId: number, requestedCents: number): ProfitShareOpeningMatch[] {
  const side = actionSide(action);
  const openingAction: T0JournalAction = side === "long" ? "openLong" : "openShort";
  const closingAction: T0JournalAction = side === "long" ? "closeLong" : "closeShort";
  const archiveKey = priceKey(archivedTargetPrice(action, targetPrice));
  const expectedUserKey = relatedUserKey(relatedUserId);
  const expectedFundKey = relatedFundKey(relatedFundId);
  const openingQueue: Array<{ entryId: number; remainingCents: number }> = [];
  const consume = (cents: number, capture: boolean): ProfitShareOpeningMatch[] => {
    const matches: ProfitShareOpeningMatch[] = [];
    let remaining = cents;
    for (const opening of openingQueue) {
      if (remaining <= 0) break;
      if (opening.remainingCents <= 0) continue;
      const allocated = Math.min(opening.remainingCents, remaining);
      opening.remainingCents -= allocated;
      remaining -= allocated;
      if (capture && allocated > 0) matches.push({ openingEntryId: opening.entryId, matchedQuantityCents: allocated });
    }
    return matches;
  };

  for (const row of rows) {
    const rowAction = String(row.action) as T0JournalAction;
    if (relatedUserKey(row.related_user_id) !== expectedUserKey || relatedFundKey(row.related_fund_id) !== expectedFundKey) continue;
    if (rowAction === openingAction && priceKey(archivePriceForAction(rowAction, row.price)) === archiveKey) {
      openingQueue.push({ entryId: toNumber(row.id), remainingCents: quantityToCents(row.quantity) });
      continue;
    }
    if (rowAction === closingAction
      && priceKey(archivedTargetPrice(rowAction, row.target_price, row.price)) === archiveKey) {
      consume(quantityToCents(row.quantity), false);
    }
  }
  return consume(requestedCents, true);
}

async function getEntryProfitShareSnapshotRows(tx: any, input: { actorUserId: number; entryIds: number[]; lock?: boolean }) {
  if (input.entryIds.length === 0) return [];
  const [rows] = await tx.execute(
    `SELECT id, entry_id, opening_entry_id, source_user_id, related_fund_id, beneficiary_user_id, profit_share_rule_id, share_percentage, matched_quantity
       FROM ledger52_t0_journal_entry_profit_shares
      WHERE ledger_id = ? AND user_id = ? AND entry_id IN (${input.entryIds.map(() => "?").join(", ")})
      ORDER BY entry_id ASC, opening_entry_id ASC, id ASC${input.lock ? " FOR UPDATE" : ""}`,
    [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, ...input.entryIds],
  );
  return asRows(rows);
}

async function writeOpeningProfitShareSnapshot(tx: any, input: {
  actorUserId: number;
  entryId: number;
  sourceUserId: number;
  relatedFundId: number;
  quantity: string;
}) {
  if (input.sourceUserId <= 0 || input.relatedFundId <= 0) return;
  const activeRules = await getActiveLedger52T0JournalProfitShareRules(tx, {
    actorUserId: input.actorUserId,
    relatedFundId: input.relatedFundId,
    lock: true,
  });
  if (activeRules.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请先完成该项目的收益分配设置" });
  }
  const totalPercentage = activeRules.reduce((total, rule) => total + toNumber(rule.share_percentage), 0);
  if (Math.abs(totalPercentage - 100) > 0.00001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "该项目的收益分配必须合计为100%" });
  }
  for (const activeRule of activeRules) {
    await tx.execute(
      `INSERT INTO ledger52_t0_journal_entry_profit_shares
        (ledger_id, user_id, entry_id, opening_entry_id, source_user_id, related_fund_id, beneficiary_user_id, profit_share_rule_id, share_percentage, matched_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        input.entryId,
        input.entryId,
        input.sourceUserId,
        input.relatedFundId,
        toNumber(activeRule.beneficiary_user_id),
        toNumber(activeRule.id) || null,
        toNumber(activeRule.share_percentage),
        input.quantity,
      ],
    );
  }
}

async function writeClosingProfitShareSnapshots(tx: any, input: {
  actorUserId: number;
  entryId: number;
  sourceUserId: number;
  positionRows: any[];
  action: T0JournalAction;
  targetPrice: string;
  relatedFundId: number;
  quantity: string;
}) {
  if (input.sourceUserId <= 0) return;
  const matches = buildProfitShareOpeningMatches(
    input.positionRows,
    input.action,
    input.targetPrice,
    input.sourceUserId,
    input.relatedFundId,
    quantityToCents(input.quantity),
  );
  const openingSnapshotRows = await getEntryProfitShareSnapshotRows(tx, {
    actorUserId: input.actorUserId,
    entryIds: matches.map((match) => match.openingEntryId),
    lock: true,
  });
  const snapshotsByOpening = new Map<number, any[]>();
  for (const snapshot of openingSnapshotRows) {
    const openingEntryId = toNumber(snapshot.opening_entry_id);
    const current = snapshotsByOpening.get(openingEntryId) || [];
    current.push(snapshot);
    snapshotsByOpening.set(openingEntryId, current);
  }
  for (const match of matches) {
    const openingSnapshots = snapshotsByOpening.get(match.openingEntryId) || [];
    for (const openingSnapshot of openingSnapshots) {
      await tx.execute(
        `INSERT INTO ledger52_t0_journal_entry_profit_shares
          (ledger_id, user_id, entry_id, opening_entry_id, source_user_id, related_fund_id, beneficiary_user_id, profit_share_rule_id, share_percentage, matched_quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          LEDGER_52_T0_JOURNAL_ID,
          input.actorUserId,
          input.entryId,
          match.openingEntryId,
          toNumber(openingSnapshot.source_user_id) || input.sourceUserId,
          toNumber(openingSnapshot.related_fund_id) || input.relatedFundId,
          toNumber(openingSnapshot.beneficiary_user_id),
          toNumber(openingSnapshot.profit_share_rule_id) || null,
          toNumber(openingSnapshot.share_percentage),
          (match.matchedQuantityCents / 100).toFixed(2),
        ],
      );
    }
  }
}

async function restoreEntryProfitShareSnapshots(tx: any, input: { actorUserId: number; entryId: number; snapshots: any[] }) {
  for (const snapshot of input.snapshots) {
    const openingEntryId = toNumber(snapshot.opening_entry_id ?? snapshot.openingEntryId);
    const beneficiaryUserId = toNumber(snapshot.beneficiary_user_id ?? snapshot.beneficiaryUserId);
    const sourceUserId = toNumber(snapshot.source_user_id ?? snapshot.sourceUserId);
    const relatedFundId = toNumber(snapshot.related_fund_id ?? snapshot.relatedFundId);
    const percentage = toNumber(snapshot.share_percentage ?? snapshot.percentage);
    const quantity = String(snapshot.matched_quantity ?? snapshot.matchedQuantity ?? "");
    if (!openingEntryId || !beneficiaryUserId || !sourceUserId || percentage <= 0 || !quantity) continue;
    await tx.execute(
      `INSERT INTO ledger52_t0_journal_entry_profit_shares
        (ledger_id, user_id, entry_id, opening_entry_id, source_user_id, related_fund_id, beneficiary_user_id, profit_share_rule_id, share_percentage, matched_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        input.entryId,
        openingEntryId,
        sourceUserId,
        relatedFundId || null,
        beneficiaryUserId,
        toNumber(snapshot.profit_share_rule_id ?? snapshot.profitShareRuleId) || null,
        percentage,
        quantity,
      ],
    );
  }
}

export async function selectLedger52T0JournalAccount(userId: number, accountId: number) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  await ensureLedger52T0JournalTables(conn);

  const [result] = await conn.execute(
    `UPDATE ledger52_t0_journal_accounts
        SET last_used_at = NOW(3)
      WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1`,
    [accountId, LEDGER_52_T0_JOURNAL_ID, userId],
  ) as any[];
  if (Number((result as any)?.affectedRows || 0) !== 1) {
    throw new TRPCError({ code: "NOT_FOUND", message: "下单账户不存在或无权选择" });
  }

  const [rows] = await conn.execute(
    `SELECT id, name, last_used_at, created_at
       FROM ledger52_t0_journal_accounts
      WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`,
    [accountId, LEDGER_52_T0_JOURNAL_ID, userId],
  );
  const account = asRows(rows)[0];
  if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "下单账户不存在" });
  return { account: mapAccount(account) };
}

function normalizeJournalDirectoryName(value: string, label: string): string {
  const name = String(value || "").trim();
  if (!name) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label}不能为空` });
  }
  if (name.length > 80) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label}最多80个字符` });
  }
  return name;
}

async function writeLedger52T0JournalDimensionAudit(tx: any, input: {
  userId: number;
  dimension: "account" | "related_user" | "related_fund";
  dimensionId: number;
  relatedUserId?: number;
  operation?: "rename" | "delete";
  oldName: string;
  newName: string;
  affectedEntryCount?: number;
  operatorUserId: number;
}) {
  await tx.execute(
    `INSERT INTO ledger52_t0_journal_dimension_audits
      (ledger_id, user_id, dimension, dimension_id, related_user_id, operation, old_name, new_name, affected_entry_count, operator_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      LEDGER_52_T0_JOURNAL_ID,
      input.userId,
      input.dimension,
      input.dimensionId,
      input.relatedUserId && input.relatedUserId > 0 ? input.relatedUserId : null,
      input.operation ?? "rename",
      input.oldName,
      input.newName,
      Math.max(0, Number(input.affectedEntryCount || 0)),
      input.operatorUserId,
    ],
  );
}

/** 改名只更新账户目录；全部历史流水仍通过 account_id 自动展示为新名称。 */
export async function renameLedger52T0JournalAccount(input: { actorUserId: number; accountId: number; name: string }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const name = normalizeJournalDirectoryName(input.name, "账户名称");
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [rows] = await tx.execute(
      `SELECT id, name, last_used_at, created_at
         FROM ledger52_t0_journal_accounts
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1
        LIMIT 1 FOR UPDATE`,
      [input.accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const account = asRows(rows)[0];
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "账户不存在或已停用" });
    const oldName = String(account.name || "");
    if (oldName !== name) {
      const [duplicateRows] = await tx.execute(
        `SELECT id FROM ledger52_t0_journal_accounts
          WHERE ledger_id = ? AND user_id = ? AND name = ? AND id <> ?
          LIMIT 1 FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, name, input.accountId],
      );
      if (asRows(duplicateRows)[0]) {
        throw new TRPCError({ code: "CONFLICT", message: "已存在同名账户，请换一个名称" });
      }
      await tx.execute(
        `UPDATE ledger52_t0_journal_accounts SET name = ?, updated_at = NOW(3) WHERE id = ?`,
        [name, input.accountId],
      );
      await writeLedger52T0JournalDimensionAudit(tx, {
        userId: input.actorUserId,
        dimension: "account",
        dimensionId: input.accountId,
        oldName,
        newName: name,
        operatorUserId: input.actorUserId,
      });
    }
    await tx.commit();
    return { account: mapAccount({ ...account, name }) };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await tx.release();
  }
}

/** 改名只更新项目目录；历史流水通过 related_fund_id 联表，因此会同步显示新名称。 */
export async function renameLedger52T0JournalRelatedFund(input: { actorUserId: number; relatedFundId: number; name: string }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const name = normalizeJournalDirectoryName(input.name, "项目名称");
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [rows] = await tx.execute(
      `SELECT id, related_user_id, name, last_used_at, created_at
         FROM ledger52_t0_journal_related_funds
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1
        LIMIT 1 FOR UPDATE`,
      [input.relatedFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const fund = asRows(rows)[0];
    if (!fund) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在或已停用" });
    const oldName = String(fund.name || "");
    const relatedUserId = toNumber(fund.related_user_id);
    if (oldName !== name) {
      const [duplicateRows] = await tx.execute(
        `SELECT id FROM ledger52_t0_journal_related_funds
          WHERE ledger_id = ? AND user_id = ? AND name = ? AND id <> ?
          LIMIT 1 FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, name, input.relatedFundId],
      );
      if (asRows(duplicateRows)[0]) {
        throw new TRPCError({ code: "CONFLICT", message: "该账本已存在同名项目，请换一个名称" });
      }
      await tx.execute(
        `UPDATE ledger52_t0_journal_related_funds SET name = ?, updated_at = NOW(3) WHERE id = ?`,
        [name, input.relatedFundId],
      );
      await writeLedger52T0JournalDimensionAudit(tx, {
        userId: input.actorUserId,
        dimension: "related_fund",
        dimensionId: input.relatedFundId,
        relatedUserId,
        oldName,
        newName: name,
        operatorUserId: input.actorUserId,
      });
    }
    await tx.commit();
    return { relatedFund: mapRelatedFund({ ...fund, name }) };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await tx.release();
  }
}

type T0JournalDirectoryDimension = "account" | "related_user" | "related_fund";
type T0JournalDirectoryImpact = {
  dimension: T0JournalDirectoryDimension;
  dimensionId: number;
  name: string;
  relatedUserId?: number;
  affectedEntryCount: number;
  outstandingQuantity: number;
  accounts: Array<{ id: number; name: string; count: number }>;
  users: Array<{ id: number; name: string; count: number }>;
  funds: Array<{ id: number; name: string; count: number }>;
};

function calculateOutstandingOpeningQuantity(rows: any[]): number {
  const balances = new Map<string, number>();
  for (const row of rows) {
    const action = String(row.action) as T0JournalAction;
    const accountId = toNumber(row.account_id);
    const relatedUserId = toNumber(row.related_user_id);
    const relatedFundId = toNumber(row.related_fund_id);
    const archivePrice = isOpeningAction(action)
      ? archivePriceForAction(action, row.price)
      : archivedTargetPrice(action, row.target_price, row.price);
    if (!accountId || !archivePrice) continue;
    const key = `${actionSide(action)}:${priceKey(archivePrice)}:${accountId}:${relatedUserKey(relatedUserId)}:${relatedFundKey(relatedFundId)}`;
    const quantity = quantityToCents(row.quantity);
    balances.set(key, Math.max(0, (balances.get(key) || 0) + (isOpeningAction(action) ? quantity : -quantity)));
  }
  return Array.from(balances.values()).reduce((sum, cents) => sum + cents, 0) / 100;
}

function summarizeDirectoryImpactRows(rows: any[], input: {
  dimension: T0JournalDirectoryDimension;
  dimensionId: number;
  name: string;
  relatedUserId?: number;
}): T0JournalDirectoryImpact {
  const summarize = (idField: string, nameField: string) => {
    const values = new Map<number, { id: number; name: string; count: number }>();
    for (const row of rows) {
      const id = toNumber(row[idField]);
      if (!id) continue;
      const current = values.get(id);
      values.set(id, {
        id,
        name: String(row[nameField] || `未命名#${id}`),
        count: (current?.count || 0) + 1,
      });
    }
    return Array.from(values.values()).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"));
  };

  return {
    dimension: input.dimension,
    dimensionId: input.dimensionId,
    name: input.name,
    relatedUserId: input.relatedUserId,
    affectedEntryCount: rows.length,
    outstandingQuantity: calculateOutstandingOpeningQuantity(rows),
    accounts: summarize("account_id", "account_name"),
    users: summarize("related_user_id", "related_user_name"),
    funds: summarize("related_fund_id", "related_fund_name"),
  };
}

async function getLedger52T0JournalDirectoryImpactWithConnection(tx: any, input: {
  actorUserId: number;
  dimension: T0JournalDirectoryDimension;
  dimensionId: number;
  lock?: boolean;
}): Promise<T0JournalDirectoryImpact> {
  const lock = input.lock ? " FOR UPDATE" : "";
  let target: any;
  let relatedUserId: number | undefined;
  if (input.dimension === "account") {
    const [rows] = await tx.execute(
      `SELECT id, name FROM ledger52_t0_journal_accounts
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1 LIMIT 1${lock}`,
      [input.dimensionId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    target = asRows(rows)[0];
  } else if (input.dimension === "related_fund") {
    const [rows] = await tx.execute(
      `SELECT id, related_user_id, name FROM ledger52_t0_journal_related_funds
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1 LIMIT 1${lock}`,
      [input.dimensionId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    target = asRows(rows)[0];
    relatedUserId = target ? toNumber(target.related_user_id) : undefined;
  } else {
    const [entryRows] = await tx.execute(
      `SELECT e.related_user_id AS id, COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS name
         FROM ledger52_t0_journal_entries e
         LEFT JOIN users u ON u.id = e.related_user_id
        WHERE e.ledger_id = ? AND e.user_id = ? AND e.related_user_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM ledger52_t0_journal_deleted_dimensions deleted_user
             WHERE deleted_user.ledger_id = e.ledger_id AND deleted_user.user_id = e.user_id
               AND deleted_user.dimension = 'related_user' AND deleted_user.dimension_id = e.related_user_id
          )
        LIMIT 1${lock}`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.dimensionId],
    );
    target = asRows(entryRows)[0];
    relatedUserId = target ? toNumber(target.id) : undefined;
  }
  if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "要操作的目录项不存在、已删除或无权访问" });

  const condition = input.dimension === "account"
    ? "e.account_id = ?"
    : input.dimension === "related_fund"
      ? "e.related_fund_id = ?"
      : "e.related_user_id = ?";
  const [entryRows] = await tx.execute(
    `SELECT e.action, e.quantity, e.price, e.target_price, e.account_id, e.related_user_id, e.related_fund_id,
            a.name AS account_name,
            COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
            f.name AS related_fund_name
       FROM ledger52_t0_journal_entries e
       INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
       LEFT JOIN users u ON u.id = e.related_user_id
       LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
      WHERE e.ledger_id = ? AND e.user_id = ? AND ${condition}
      ORDER BY e.trade_time ASC, e.id ASC${lock}`,
    [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.dimensionId],
  );
  return summarizeDirectoryImpactRows(asRows(entryRows), {
    dimension: input.dimension,
    dimensionId: input.dimensionId,
    name: String(target.name || `项目#${input.dimensionId}`),
    relatedUserId,
  });
}

/** 返回编辑/删除前的精确影响范围，供前端在二次确认前展示。 */
export async function getLedger52T0JournalDirectoryImpact(input: {
  actorUserId: number;
  dimension: T0JournalDirectoryDimension;
  dimensionId: number;
}) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  await ensureLedger52T0JournalTables(conn);
  return getLedger52T0JournalDirectoryImpactWithConnection(conn, input);
}

/**
 * 目录删除是逻辑删除：从新订单的可选目录与前端展示中移除，历史流水仍保留稳定键以维持FIFO、盈亏与审计核对。
 * 删除后旧开仓仍可按稳定ID完成平仓，目录不会重新出现在新订单选择中。
 */
export async function deleteLedger52T0JournalDirectory(input: {
  actorUserId: number;
  dimension: T0JournalDirectoryDimension;
  dimensionId: number;
  expectedAffectedEntryCount?: number;
}) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const impact = await getLedger52T0JournalDirectoryImpactWithConnection(tx, { ...input, lock: true });
    if (input.expectedAffectedEntryCount !== undefined && input.expectedAffectedEntryCount !== impact.affectedEntryCount) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "目录关联的历史流水已变化，请刷新影响预览后重新确认" });
    }
    if (input.dimension === "account") {
      await tx.execute(
        `UPDATE ledger52_t0_journal_accounts SET is_active = 0, updated_at = NOW(3)
          WHERE id = ? AND ledger_id = ? AND user_id = ?`,
        [input.dimensionId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
    } else if (input.dimension === "related_fund") {
      await tx.execute(
        `UPDATE ledger52_t0_journal_related_funds SET is_active = 0, updated_at = NOW(3)
          WHERE id = ? AND ledger_id = ? AND user_id = ?`,
        [input.dimensionId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      await tx.execute(
        `UPDATE ledger52_t0_journal_profit_share_rules
            SET is_active = 0, ended_at = NOW(3), updated_at = NOW(3)
          WHERE ledger_id = ? AND user_id = ? AND related_fund_id = ? AND is_active = 1`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.dimensionId],
      );
    } else {
      await tx.execute(
        `INSERT INTO ledger52_t0_journal_deleted_dimensions
          (ledger_id, user_id, dimension, dimension_id, related_user_id, deleted_name, operator_user_id)
         VALUES (?, ?, 'related_user', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE deleted_name = VALUES(deleted_name), operator_user_id = VALUES(operator_user_id), deleted_at = NOW(3)`,
        [
          LEDGER_52_T0_JOURNAL_ID,
          input.actorUserId,
          input.dimensionId,
          impact.relatedUserId || input.dimensionId,
          impact.name,
          input.actorUserId,
        ],
      );
      // 目录移除后不再为该用户创建未来新开仓的分配快照；既有订单快照与审计保持不变。
      await tx.execute(
        `UPDATE ledger52_t0_journal_profit_share_rules
            SET is_active = 0, ended_at = NOW(3), updated_at = NOW(3)
          WHERE ledger_id = ? AND user_id = ? AND is_active = 1
            AND (source_user_id = ? OR beneficiary_user_id = ?)`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.dimensionId, input.dimensionId],
      );
    }

    await writeLedger52T0JournalDimensionAudit(tx, {
      userId: input.actorUserId,
      dimension: input.dimension,
      dimensionId: input.dimensionId,
      relatedUserId: impact.relatedUserId,
      operation: "delete",
      oldName: impact.name,
      newName: "",
      affectedEntryCount: impact.affectedEntryCount,
      operatorUserId: input.actorUserId,
    });
    await tx.commit();
    return { impact };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await tx.release();
  }
}

export async function saveLedger52T0JournalEntry(input: SaveT0JournalEntryInput) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const normalizedQuantity = normalizeEthQuantity(input.quantity);
  const instrumentType = isOpeningAction(input.action)
    ? normalizeInstrumentType(input.instrumentType, true)
    : undefined;
  const isLocked = isOpeningAction(input.action) && input.isLocked === true ? 1 : 0;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();

    const relatedUserId = Number(input.relatedUserId || 0);
    if (relatedUserId > 0) {
      if (!Number.isInteger(relatedUserId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "关联用户信息无效" });
      }
      const [relatedUserRows] = await tx.execute(
        `SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
        [relatedUserId],
      );
      if (!asRows(relatedUserRows)[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "关联用户不存在或已失效，请重新选择" });
      }
      // 新开仓再次明确选择该用户时才恢复目录可见性；旧仓平仓沿用ID时保持删除状态。
      if (isOpeningAction(input.action)) {
        await tx.execute(
          `DELETE FROM ledger52_t0_journal_deleted_dimensions
            WHERE ledger_id = ? AND user_id = ? AND dimension = 'related_user' AND dimension_id = ?`,
          [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, relatedUserId],
        );
      }
    }
    const relatedFund = await resolveLedger52T0JournalRelatedFund(tx, {
      actorUserId: input.actorUserId,
      relatedUserId,
      relatedFundId: input.relatedFundId,
      relatedFundName: input.relatedFundName,
      // 新开仓关联到具体用户后，必须归属于该用户的一笔专项款；旧流水的平仓仍可保留空专项款。
      required: isOpeningAction(input.action) && relatedUserId > 0,
      allowInactive: !isOpeningAction(input.action),
    });

    let accountId = Number(input.accountId || 0);
    let accountName = String(input.accountName || "").trim();
    if (accountId > 0) {
      const [rows] = await tx.execute(
        `SELECT id, name
           FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ?
            AND (is_active = 1 OR ? = 1)
          LIMIT 1 FOR UPDATE`,
        [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId, isOpeningAction(input.action) ? 0 : 1],
      );
      const account = asRows(rows)[0];
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "下单账户不存在或无权使用" });
      accountName = String(account.name);
    } else {
      if (!accountName) throw new TRPCError({ code: "BAD_REQUEST", message: "请填写下单账户名称" });
      const [result] = await tx.execute(
        `INSERT INTO ledger52_t0_journal_accounts (ledger_id, user_id, name, is_active, last_used_at)
         VALUES (?, ?, ?, 1, NOW(3))
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), is_active = 1, last_used_at = NOW(3), updated_at = NOW(3)`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountName],
      );
      accountId = Number((result as any).insertId || 0);
      if (!accountId) {
        const [rows] = await tx.execute(
          `SELECT id FROM ledger52_t0_journal_accounts
            WHERE ledger_id = ? AND user_id = ? AND name = ? LIMIT 1 FOR UPDATE`,
          [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountName],
        );
        accountId = Number(asRows(rows)[0]?.id || 0);
      }
      if (!accountId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "下单账户保存失败" });
    }

    await tx.execute(
      `UPDATE ledger52_t0_journal_accounts
          SET last_used_at = NOW(3)
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );

    const [existingRequestRows] = await tx.execute(
      `SELECT id
         FROM ledger52_t0_journal_entries
        WHERE ledger_id = ? AND user_id = ? AND client_request_id = ?
        LIMIT 1 FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.clientRequestId],
    );
    const isRetryOfExistingEntry = Boolean(asRows(existingRequestRows)[0]?.id);

    const storedTargetPrice = isOpeningAction(input.action)
      ? archivePriceForAction(input.action, input.price)
      : archivedTargetPrice(input.action, input.targetPrice);
    let positionRowsForProfitShare: any[] = [];

    if (!isOpeningAction(input.action) && !isRetryOfExistingEntry) {
      if (!storedTargetPrice) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "平仓记录必须指定对应的开仓价格档位" });
      }
      const [positionRows] = await tx.execute(
        `SELECT id, action, quantity, price, target_price, related_user_id, related_fund_id
           FROM ledger52_t0_journal_entries
          WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
          ORDER BY trade_time ASC, id ASC FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountId, input.symbol],
      );
      const availableCents = calculateAvailableCloseCents(asRows(positionRows), input.action, String(storedTargetPrice), relatedUserId, relatedFund?.id ?? 0);
      const requestedCents = quantityToCents(normalizedQuantity);
      if (requestedCents <= 0 || requestedCents > availableCents) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: availableCents > 0
            ? `该价格档位最多可平 ${(availableCents / 100).toFixed(2)} ETH`
            : "该价格档位已无可平数量",
        });
      }
      positionRowsForProfitShare = asRows(positionRows);
    }

    const [entryResult] = await tx.execute(
      `INSERT INTO ledger52_t0_journal_entries
        (ledger_id, user_id, account_id, related_user_id, related_fund_id, symbol, instrument_type, is_locked, action, quantity, price, fee_usdt, target_price, note, client_request_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(CAST(? AS DECIMAL(36,18)) * CAST(? AS DECIMAL(36,18)) * ${OKX_VIP2_TAKER_FEE_RATE}, 18), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        accountId,
        relatedUserId > 0 ? relatedUserId : null,
        relatedFund?.id ?? null,
        input.symbol,
        instrumentType ?? null,
        isLocked,
        input.action,
        normalizedQuantity,
        input.price,
        normalizedQuantity,
        input.price,
        storedTargetPrice || null,
        input.note || null,
        input.clientRequestId,
        input.actorUserId,
      ],
    );
    const entryId = Number((entryResult as any).insertId || 0);
    if (!entryId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "速记流水保存失败" });

    if (!isRetryOfExistingEntry) {
      if (isOpeningAction(input.action)) {
        await writeOpeningProfitShareSnapshot(tx, {
          actorUserId: input.actorUserId,
          entryId,
          sourceUserId: relatedUserId,
          relatedFundId: relatedFund?.id ?? 0,
          quantity: normalizedQuantity,
        });
      } else if (storedTargetPrice) {
        await writeClosingProfitShareSnapshots(tx, {
          actorUserId: input.actorUserId,
          entryId,
          sourceUserId: relatedUserId,
          positionRows: positionRowsForProfitShare,
          action: input.action,
          targetPrice: String(storedTargetPrice),
          relatedFundId: relatedFund?.id ?? 0,
          quantity: normalizedQuantity,
        });
      }
    }

    const [accountRows, entryRows] = await Promise.all([
      tx.execute(
        `SELECT id, name, last_used_at, created_at
           FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`,
        [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      ),
      tx.execute(
        `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, f.name AS related_fund_name,
                COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
                u.username AS related_username, u.avatar AS related_user_avatar,
                e.symbol, e.instrument_type, e.is_locked, e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
           FROM ledger52_t0_journal_entries e
           INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
           LEFT JOIN users u ON u.id = e.related_user_id
           LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
          WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ? LIMIT 1`,
        [entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      ),
    ]);
    const account = asRows(accountRows)[0];
    const entry = asRows(entryRows)[0];
    if (!account || !entry) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "速记流水读取失败" });

    await tx.commit();
    return { account: mapAccount(account), entry: mapEntry(entry) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

async function lockEditableOpeningEntry(tx: any, actorUserId: number, entryId: number) {
  const [rows] = await tx.execute(
    `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, e.symbol, e.instrument_type, e.action,
            e.is_locked, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.client_request_id,
            e.created_by_user_id, e.trade_time, e.created_at, e.updated_at
       FROM ledger52_t0_journal_entries e
       INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
      WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ?
      LIMIT 1 FOR UPDATE`,
    [entryId, LEDGER_52_T0_JOURNAL_ID, actorUserId],
  );
  const entry = asRows(rows)[0];
  if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "开仓记录不存在或无权操作" });
  if (!isOpeningAction(String(entry.action) as T0JournalAction)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "当前仅支持编辑或删除开仓记录" });
  }

  const entryAction = String(entry.action) as T0JournalAction;
  const [scopeRows] = await tx.execute(
    `SELECT id, action, quantity, price, target_price, trade_time, created_at
       FROM ledger52_t0_journal_entries
      WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
        AND COALESCE(related_user_id, 0) = ?
        AND COALESCE(related_fund_id, 0) = ?
      ORDER BY trade_time ASC, id ASC FOR UPDATE`,
    [
      LEDGER_52_T0_JOURNAL_ID,
      actorUserId,
      Number(entry.account_id),
      String(entry.symbol),
      toNumber(entry.related_user_id),
      toNumber(entry.related_fund_id),
    ],
  );
  if (openingHasDependentClose(asRows(scopeRows), Number(entry.id))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "该开仓主单已被后续平仓使用，请先处理关联平仓流水" });
  }
  return entry;
}

async function writeEntryAudit(tx: any, input: {
  actorUserId: number;
  entryId: number;
  operation: "update" | "delete" | "revert" | "restore";
  before: unknown;
  after?: unknown;
}) {
  const [result] = await tx.execute(
    `INSERT INTO ledger52_t0_journal_entry_audits
      (ledger_id, user_id, entry_id, operation, before_snapshot, after_snapshot, operator_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      LEDGER_52_T0_JOURNAL_ID,
      input.actorUserId,
      input.entryId,
      input.operation,
      JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.actorUserId,
    ],
  );
  return Number((result as any)?.insertId || 0);
}

async function buildEntryAuditSnapshot(tx: any, actorUserId: number, entry: any) {
  const profitShareSnapshots = await getEntryProfitShareSnapshotRows(tx, {
    actorUserId,
    entryIds: [toNumber(entry.id)],
    lock: true,
  });
  return { ...entry, profitShareSnapshots };
}

export async function updateLedger52T0JournalOpeningEntry(input: {
  actorUserId: number;
  entryId: number;
  /** 仅允许改为当前管理员名下的既有有效账户；未传时保留原账户。 */
  accountId?: number;
  /** 允许管理员保留未关联状态，之后再补充关联用户。 */
  relatedUserId?: number;
  relatedFundId?: number;
  relatedFundName?: string;
  /** 旧开仓未标注时可留空；管理员选择后即固化该类型。 */
  instrumentType?: T0JournalInstrumentType;
  /** 未传时保持历史锁定状态，传入时可锁定或解除。 */
  isLocked?: boolean;
  quantity: string;
  price: string;
  note?: string;
}) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const normalizedQuantity = normalizeEthQuantity(input.quantity);
  const instrumentType = normalizeInstrumentType(input.instrumentType);
  const isLocked = input.isLocked === undefined ? null : input.isLocked ? 1 : 0;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const before = await lockEditableOpeningEntry(tx, input.actorUserId, input.entryId);
    const beforeForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, before);
    const accountId = input.accountId === undefined ? toNumber(before.account_id) : Number(input.accountId);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "下单账户信息无效，请重新选择" });
    }
    if (accountId !== toNumber(before.account_id)) {
      const [targetAccountRows] = await tx.execute(
        `SELECT id
           FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1
          LIMIT 1 FOR UPDATE`,
        [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      if (!asRows(targetAccountRows)[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "目标下单账户不存在、已停用或无权选择" });
      }
    }
    const relatedUserId = Number(input.relatedUserId || 0);
    if (relatedUserId > 0) {
      if (!Number.isInteger(relatedUserId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "关联用户信息无效" });
      }
      const [relatedUserRows] = await tx.execute(
        `SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
        [relatedUserId],
      );
      if (!asRows(relatedUserRows)[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "关联用户不存在或已失效，请重新选择" });
      }
    }
    if (beforeForAudit.profitShareSnapshots.length > 0 && relatedUserId !== toNumber(before.related_user_id)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该开仓已固化收益分配快照；如需修改关联用户，请先回撤后重新录入" });
    }
    const relatedFund = await resolveLedger52T0JournalRelatedFund(tx, {
      actorUserId: input.actorUserId,
      relatedUserId,
      relatedFundId: input.relatedFundId,
      relatedFundName: input.relatedFundName,
      // 旧开仓可能在专项款功能上线前已关联用户，编辑时允许暂时保留“未区分专项款（历史）”。
      required: false,
    });
    if (accountId !== toNumber(before.account_id)) {
      // 目标账户若已有本单之后的平仓，移入该开仓会改写目标账户既有 FIFO 配对，必须先处理平仓流水。
      const [targetCloseRows] = await tx.execute(
        `SELECT id
           FROM ledger52_t0_journal_entries
          WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
            AND action IN ('closeLong', 'closeShort')
            AND COALESCE(related_user_id, 0) = ?
            AND COALESCE(related_fund_id, 0) = ?
            AND trade_time >= ?
          ORDER BY trade_time ASC, id ASC
          LIMIT 1 FOR UPDATE`,
        [
          LEDGER_52_T0_JOURNAL_ID,
          input.actorUserId,
          accountId,
          String(before.symbol),
          relatedUserId,
          relatedFund?.id ?? 0,
          before.trade_time,
        ],
      );
      if (asRows(targetCloseRows)[0]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "目标账户已有后续平仓流水；请先处理关联平仓后再调整下单账户" });
      }
    }
    const archivePrice = archivePriceForAction(String(before.action) as T0JournalAction, input.price);
    await tx.execute(
      `UPDATE ledger52_t0_journal_entries
          SET account_id = ?, quantity = ?, price = ?, target_price = ?, related_user_id = ?, related_fund_id = ?,
              instrument_type = COALESCE(?, instrument_type),
              is_locked = COALESCE(?, is_locked),
              fee_usdt = ROUND(CAST(? AS DECIMAL(36,18)) * CAST(? AS DECIMAL(36,18)) * ${OKX_VIP2_TAKER_FEE_RATE}, 18),
              note = ?, updated_at = NOW(3)
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [
        accountId,
        normalizedQuantity,
        input.price,
        archivePrice,
        relatedUserId > 0 ? relatedUserId : null,
        relatedFund?.id ?? null,
        instrumentType ?? null,
        isLocked,
        normalizedQuantity,
        input.price,
        input.note || null,
        input.entryId,
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
      ],
    );
    if (beforeForAudit.profitShareSnapshots.length > 0) {
      await tx.execute(
        `UPDATE ledger52_t0_journal_entry_profit_shares
            SET matched_quantity = ?
          WHERE ledger_id = ? AND user_id = ? AND entry_id = ? AND opening_entry_id = ?`,
        [normalizedQuantity, LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.entryId, input.entryId],
      );
    }
    const [updatedRows] = await tx.execute(
      `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, f.name AS related_fund_name,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
              u.username AS related_username, u.avatar AS related_user_avatar,
              e.symbol, e.instrument_type, e.is_locked, e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
         LEFT JOIN users u ON u.id = e.related_user_id
         LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
        WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ? LIMIT 1`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const after = asRows(updatedRows)[0];
    if (!after) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "编辑后的开仓记录读取失败" });
    const afterForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, after);
    await writeEntryAudit(tx, { actorUserId: input.actorUserId, entryId: input.entryId, operation: "update", before: beforeForAudit, after: afterForAudit });
    await tx.commit();
    return { entry: mapEntry(after) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

export async function deleteLedger52T0JournalOpeningEntry(input: { actorUserId: number; entryId: number }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const before = await lockEditableOpeningEntry(tx, input.actorUserId, input.entryId);
    const beforeForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, before);
    const auditId = await writeEntryAudit(tx, { actorUserId: input.actorUserId, entryId: input.entryId, operation: "delete", before: beforeForAudit });
    await tx.execute(
      `DELETE FROM ledger52_t0_journal_entry_profit_shares
        WHERE ledger_id = ? AND user_id = ? AND entry_id = ?`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.entryId],
    );
    const [result] = await tx.execute(
      `DELETE FROM ledger52_t0_journal_entries
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (Number((result as any)?.affectedRows || 0) !== 1) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "开仓记录删除失败" });
    }
    await tx.commit();
    return { entryId: String(input.entryId), auditId: String(auditId), entry: mapEntry(before) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

/**
 * 从“最近速记”回撤一笔流水。开仓若已有关联平仓，必须先回撤对应平仓，防止仓位账不平。
 * 所有回撤只删活动流水，不抹掉审计快照，后续可由恢复接口原样恢复。
 */
export async function revertLedger52T0JournalEntry(input: { actorUserId: number; entryId: number }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [rows] = await tx.execute(
      `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, e.symbol, e.instrument_type, e.action,
              e.is_locked, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.client_request_id,
              e.created_by_user_id, e.trade_time, e.created_at, e.updated_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
        WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ?
        LIMIT 1 FOR UPDATE`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    let before = asRows(rows)[0];
    if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "该速记流水不存在或无权回撤" });

    const action = String(before.action) as T0JournalAction;
    if (isOpeningAction(action)) {
      // 复用开仓依赖校验，防止回撤开仓后遗留无法匹配的平仓流水。
      before = await lockEditableOpeningEntry(tx, input.actorUserId, input.entryId);
    }

    const beforeForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, before);
    const auditId = await writeEntryAudit(tx, { actorUserId: input.actorUserId, entryId: input.entryId, operation: "revert", before: beforeForAudit });
    await tx.execute(
      `DELETE FROM ledger52_t0_journal_entry_profit_shares
        WHERE ledger_id = ? AND user_id = ? AND entry_id = ?`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.entryId],
    );
    const [result] = await tx.execute(
      `DELETE FROM ledger52_t0_journal_entries
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (Number((result as any)?.affectedRows || 0) !== 1) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "速记流水回撤失败" });
    }

    await tx.commit();
    return { entryId: String(input.entryId), auditId: String(auditId), entry: mapEntry(before) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

/** 将最近被删除或回撤的流水从审计快照恢复；恢复平仓前会再次校验可平数量。 */
export async function restoreLedger52T0JournalEntry(input: { actorUserId: number; auditId: number }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [auditRows] = await tx.execute(
      `SELECT id, entry_id, operation, before_snapshot
         FROM ledger52_t0_journal_entry_audits
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND operation IN ('delete', 'revert')
        LIMIT 1 FOR UPDATE`,
      [input.auditId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const audit = asRows(auditRows)[0];
    if (!audit) throw new TRPCError({ code: "NOT_FOUND", message: "可恢复的速记记录不存在或已恢复" });

    const [latestAuditRows] = await tx.execute(
      `SELECT id, operation
         FROM ledger52_t0_journal_entry_audits
        WHERE ledger_id = ? AND user_id = ? AND entry_id = ?
        ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, Number(audit.entry_id)],
    );
    const latestAudit = asRows(latestAuditRows)[0];
    if (!latestAudit || Number(latestAudit.id) !== Number(audit.id)) {
      throw new TRPCError({ code: "CONFLICT", message: "该流水状态已有更新，请刷新后再操作" });
    }

    let snapshot: any;
    try { snapshot = JSON.parse(String(audit.before_snapshot || "")); } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该历史审计快照无法恢复" });
    }
    const entryId = Number(snapshot?.id || 0);
    const accountId = Number(snapshot?.account_id || 0);
    const action = String(snapshot?.action || "") as T0JournalAction;
    const isLocked = isOpeningAction(action) && Boolean(toNumber(snapshot?.is_locked ?? snapshot?.isLocked));
    const quantity = normalizeStoredEthQuantity(snapshot?.quantity);
    const price = String(snapshot?.price ?? "");
    const relatedUserId = toNumber(snapshot?.related_user_id ?? snapshot?.relatedUserId);
    const relatedFundId = toNumber(snapshot?.related_fund_id ?? snapshot?.relatedFundId);
    const clientRequestId = String(snapshot?.client_request_id || "");
    if (!entryId || !accountId || !T0_JOURNAL_ACTIONS.has(action) || !clientRequestId || !quantity || !ETH_QUANTITY_RESTORE_PATTERN.test(quantity) || toNumber(price) <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该历史审计快照不完整，无法安全恢复" });
    }

    const [existingRows] = await tx.execute(
      `SELECT id FROM ledger52_t0_journal_entries
        WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (asRows(existingRows)[0]) throw new TRPCError({ code: "CONFLICT", message: "该速记流水已存在，无需重复恢复" });

    const [accountRows] = await tx.execute(
      `SELECT id FROM ledger52_t0_journal_accounts
        WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (!asRows(accountRows)[0]) throw new TRPCError({ code: "NOT_FOUND", message: "原下单账户已不存在，无法恢复" });

    if (!isOpeningAction(action)) {
      const targetPrice = archivedTargetPrice(action, snapshot.target_price);
      if (!targetPrice) throw new TRPCError({ code: "BAD_REQUEST", message: "历史平仓记录缺少对应开仓档位，无法恢复" });
      const [positionRows] = await tx.execute(
        `SELECT action, quantity, price, target_price, related_user_id, related_fund_id
           FROM ledger52_t0_journal_entries
          WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
          ORDER BY trade_time ASC, id ASC FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountId, String(snapshot.symbol || "ETH")],
      );
      const availableCents = calculateAvailableCloseCents(asRows(positionRows), action, String(targetPrice), relatedUserId, relatedFundId);
      if (quantityToCents(quantity) > availableCents) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "恢复后会超过该档位可平数量，请先恢复对应开仓流水" });
      }
    }

    const restoredTradeTime = mysqlDateTime(snapshot.trade_time || snapshot.created_at);
    const restoredCreatedAt = mysqlDateTime(snapshot.created_at || snapshot.trade_time);

    await tx.execute(
      `INSERT INTO ledger52_t0_journal_entries
        (id, ledger_id, user_id, account_id, related_user_id, related_fund_id, symbol, instrument_type, is_locked, action, quantity, price, fee_usdt, target_price, note, client_request_id, created_by_user_id, trade_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        entryId,
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        accountId,
        relatedUserId > 0 ? relatedUserId : null,
        relatedFundId > 0 ? relatedFundId : null,
        String(snapshot.symbol || "ETH"),
        normalizeInstrumentType(snapshot.instrument_type ?? snapshot.instrumentType),
        isLocked ? 1 : 0,
        action,
        quantity,
        price,
        String(snapshot.fee_usdt ?? "0"),
        snapshot.target_price ?? null,
        snapshot.note ?? null,
        clientRequestId,
        Number(snapshot.created_by_user_id || input.actorUserId),
        restoredTradeTime,
        restoredCreatedAt,
      ],
    );
    await restoreEntryProfitShareSnapshots(tx, {
      actorUserId: input.actorUserId,
      entryId,
      snapshots: Array.isArray(snapshot.profitShareSnapshots) ? snapshot.profitShareSnapshots : [],
    });
    const [restoredRows] = await tx.execute(
      `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, f.name AS related_fund_name,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
              u.username AS related_username, u.avatar AS related_user_avatar,
              e.symbol, e.instrument_type, e.is_locked, e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
         LEFT JOIN users u ON u.id = e.related_user_id
         LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
        WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ? LIMIT 1`,
      [entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const restored = asRows(restoredRows)[0];
    if (!restored) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "恢复后的速记流水读取失败" });
    const restoredForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, restored);
    await writeEntryAudit(tx, {
      actorUserId: input.actorUserId,
      entryId,
      operation: "restore",
      before: { auditId: input.auditId, snapshot },
      after: restoredForAudit,
    });
    await tx.commit();
    return { entry: mapEntry(restored) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}
