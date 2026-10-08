import { createHash, randomBytes } from "crypto";
import { getDbConnection, getDbTransactionConnection } from "./db";
import {
  AI_WALLET_CRYPTO_MARKET_ASSETS,
  type AiWalletMarketAsset,
} from "../shared/ai-wallet-assets";
import * as dbMultiAssetWallet from "./db-multi-asset-wallet";

export const LEDGER_37_ID = 37;
export const LEDGER_37_WALLET_OPERATOR_ID = 870413;
export const LEDGER_52_ID = 52;

// 37号账本当前业务范围是人民币、USDT与数字币；52号新增的证券/商品市场资产不进入37号分红或保证金流程。
export type Ledger37WalletAsset = "CNY" | "USDT" | (typeof AI_WALLET_CRYPTO_MARKET_ASSETS)[number];

type SqlRows = any[];

export type Ledger37WalletHold = {
  id: number;
  holdNo: string;
  ledgerId: number;
  userId: number;
  tagName: string;
  assetCode: Ledger37WalletAsset;
  amount: string;
  releasedAmount: string;
  remainingAmount: string;
  cnyValueSnapshot: string | null;
  status: "active" | "released";
  createdAt: string;
  releasedAt: string | null;
};

/** 冻结完成时的全局钱包余额；后续动账不会覆盖该历史快照。 */
export type Ledger37WalletBalanceSnapshot = {
  assetCode: Ledger37WalletAsset;
  total: string;
  frozen: string;
  available: string;
  /** 快照固化时点；后续钱包动账不会覆盖本次审计余额。 */
  capturedAt?: string;
};

export type Ledger37ManualMarginMigration = {
  migrationNo: string;
  hold: Ledger37WalletHold;
  assetCode: Ledger37WalletAsset;
  amount: string;
  alreadyCompleted: boolean;
};

let infrastructureReady: Promise<void> | null = null;

function rowsOf(result: any): SqlRows {
  if (Array.isArray(result?.[0])) return result[0];
  return Array.isArray(result) ? result : [];
}

function buildRequestId(prefix: string): string {
  return `L37${prefix}${Date.now().toString(36).toUpperCase()}${randomBytes(6).toString("hex").toUpperCase()}`;
}

function buildManualMigrationRequestId(userId: number, tagName: string, marginEntryId: string): string {
  const source = `${LEDGER_37_ID}|${userId}|${tagName}|${marginEntryId}`;
  return `L37M${createHash("sha256").update(source).digest("hex").slice(0, 48).toUpperCase()}`;
}

function buildManualMarginTransferRequestId(userId: number, sourceMarginEntryId: string, sourceOutflowEntryId: string, targetMarginEntryId: string): string {
  const source = `${LEDGER_37_ID}|${userId}|${sourceMarginEntryId}|${sourceOutflowEntryId}|${targetMarginEntryId}`;
  return `L37T${createHash("sha256").update(source).digest("hex").slice(0, 48).toUpperCase()}`;
}

function decimalText(value: string | number): string {
  const text = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(text) || Number(text) <= 0) {
    throw new Error("金额必须大于0，且最多支持18位小数");
  }
  return text;
}

function balanceSnapshotText(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(text)) return "0";
  return text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function normalizeLedger37WalletAsset(value: unknown): Ledger37WalletAsset {
  const asset = String(value || "").trim().toUpperCase();
  if (asset === "CNY" || asset === "人民币" || asset === "RMB" || asset === "元") return "CNY";
  if (asset === "USDT") return asset;
  if ((AI_WALLET_CRYPTO_MARKET_ASSETS as readonly string[]).includes(asset)) {
    return asset as AiWalletMarketAsset as Ledger37WalletAsset;
  }
  throw new Error("37号账本仅支持人民币、USDT与已启用的数字币资产");
}

function isFundingAsset(assetCode: Ledger37WalletAsset): assetCode is "CNY" | "USDT" {
  return assetCode === "CNY" || assetCode === "USDT";
}

function normalizeWalletHoldLedgerId(value: unknown): typeof LEDGER_37_ID | typeof LEDGER_52_ID {
  const ledgerId = Number(value ?? LEDGER_37_ID);
  if (ledgerId !== LEDGER_37_ID && ledgerId !== LEDGER_52_ID) {
    throw new Error("钱包担保仅支持37号或52号账本");
  }
  return ledgerId as typeof LEDGER_37_ID | typeof LEDGER_52_ID;
}

function buildWalletHoldRequestId(ledgerId: number, prefix: string): string {
  return `L${ledgerId}${prefix}${Date.now().toString(36).toUpperCase()}${randomBytes(6).toString("hex").toUpperCase()}`;
}

function decimalFromNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new Error("担保金额无效");
  return value.toFixed(18).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** 37号项目的冻结台账。冻结不改变总资产，只改变可用余额。 */
export async function ensureLedger37WalletInfrastructure(): Promise<void> {
  if (!infrastructureReady) {
    infrastructureReady = (async () => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ai_wallet_project_holds (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          hold_no VARCHAR(64) NOT NULL,
          request_id VARCHAR(112) NOT NULL,
          ledger_id INT NOT NULL,
          user_id INT NOT NULL,
          tag_name VARCHAR(160) NOT NULL,
          asset_code VARCHAR(16) NOT NULL,
          amount DECIMAL(36,18) NOT NULL,
          released_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
          cny_value_snapshot DECIMAL(36,8) NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          created_by INT NOT NULL,
          released_by INT NULL,
          released_reason VARCHAR(64) NULL,
          released_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ai_wallet_project_hold_no (hold_no),
          UNIQUE KEY uk_ai_wallet_project_hold_request (request_id),
          KEY idx_ai_wallet_project_hold_user_asset (user_id, asset_code, status),
          KEY idx_ai_wallet_project_hold_ledger_tag (ledger_id, tag_name, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目钱包冻结台账：不改变总资产，仅占用可用余额'
      `);
      const [holdColumns] = await (conn as any).execute(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'ai_wallet_project_holds'
      `) as any[];
      const holdColumnSet = new Set(rowsOf(holdColumns).map((row) => String(row.column_name)));
      if (!holdColumnSet.has('released_amount')) {
        try { await (conn as any).execute("ALTER TABLE ai_wallet_project_holds ADD COLUMN released_amount DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER amount"); }
        catch (error: any) { if (error?.code !== "ER_DUP_FIELDNAME") throw error; }
      }
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ai_wallet_project_hold_releases (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          release_no VARCHAR(64) NOT NULL,
          request_id VARCHAR(112) NOT NULL,
          hold_id BIGINT UNSIGNED NOT NULL,
          amount DECIMAL(36,18) NOT NULL,
          released_by INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ai_wallet_project_hold_release_no (release_no),
          UNIQUE KEY uk_ai_wallet_project_hold_release_request (request_id),
          KEY idx_ai_wallet_project_hold_release_hold (hold_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='37号项目钱包保证金部分或全额解冻审计流水'
      `);
      const [releaseColumns] = await (conn as any).execute(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'ai_wallet_project_hold_releases'
      `) as any[];
      const releaseColumnSet = new Set(rowsOf(releaseColumns).map((row) => String(row.column_name)));
      const addReleaseColumn = async (column: string, definition: string) => {
        if (releaseColumnSet.has(column)) return;
        try { await (conn as any).execute(`ALTER TABLE ai_wallet_project_hold_releases ADD COLUMN ${column} ${definition}`); }
        catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
        releaseColumnSet.add(column);
      };
      await addReleaseColumn('entry_kind', "VARCHAR(16) NOT NULL DEFAULT 'release' AFTER amount");
      await addReleaseColumn('status', "VARCHAR(16) NOT NULL DEFAULT 'active' AFTER entry_kind");
      await addReleaseColumn('reversal_of_id', 'BIGINT UNSIGNED NULL AFTER status');
      await addReleaseColumn('reversed_by', 'INT NULL AFTER released_by');
      await addReleaseColumn('reversed_at', 'DATETIME NULL AFTER reversed_by');
      try {
        await (conn as any).execute('ALTER TABLE ai_wallet_project_hold_releases ADD UNIQUE KEY uk_ai_wallet_project_hold_release_reversal (reversal_of_id)');
      } catch (error: any) {
        if (!['ER_DUP_KEYNAME', 'ER_DUP_ENTRY'].includes(String(error?.code))) throw error;
      }
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger37_wallet_action_reversals (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          reversal_no VARCHAR(64) NOT NULL,
          request_id VARCHAR(112) NOT NULL,
          action_kind VARCHAR(32) NOT NULL,
          source_record_id BIGINT UNSIGNED NOT NULL,
          mode VARCHAR(16) NOT NULL,
          user_id INT NOT NULL,
          asset_code VARCHAR(16) NOT NULL,
          amount DECIMAL(36,18) NOT NULL,
          source_wallet_entry_id BIGINT NULL,
          reversal_wallet_entry_id BIGINT NULL,
          actor_user_id INT NOT NULL,
          detail_json LONGTEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger37_wallet_action_reversal_no (reversal_no),
          UNIQUE KEY uk_ledger37_wallet_action_reversal_request (request_id),
          UNIQUE KEY uk_ledger37_wallet_action_reversal_source (action_kind, source_record_id),
          KEY idx_ledger37_wallet_action_reversal_user (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='37号钱包资金动作撤回或冲正审计'
      `);
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ai_wallet_project_hold_migrations (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          migration_no VARCHAR(64) NOT NULL,
          request_id VARCHAR(112) NOT NULL,
          ledger_id INT NOT NULL,
          user_id INT NOT NULL,
          tag_name VARCHAR(160) NOT NULL,
          margin_entry_id VARCHAR(160) NOT NULL,
          asset_code VARCHAR(16) NOT NULL,
          amount DECIMAL(36,18) NOT NULL,
          source_recorded_at VARCHAR(64) NULL,
          source_notes TEXT NULL,
          hold_id BIGINT UNSIGNED NOT NULL,
          wallet_entry_id BIGINT NULL,
          created_by INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ai_wallet_hold_migration_no (migration_no),
          UNIQUE KEY uk_ai_wallet_hold_migration_request (request_id),
          UNIQUE KEY uk_ai_wallet_hold_migration_source (ledger_id, user_id, tag_name, margin_entry_id),
          KEY idx_ai_wallet_hold_migration_hold (hold_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='历史手工保证金迁入全局钱包并冻结的不可重复审计流水'
      `);
      const [migrationColumns] = await (conn as any).execute(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'ai_wallet_project_hold_migrations'
      `) as any[];
      const migrationColumnSet = new Set(rowsOf(migrationColumns).map((row) => String(row.column_name)));
      const addMigrationColumn = async (column: string, definition: string) => {
        if (migrationColumnSet.has(column)) return;
        try { await (conn as any).execute(`ALTER TABLE ai_wallet_project_hold_migrations ADD COLUMN ${column} ${definition}`); }
        catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
        migrationColumnSet.add(column);
      };
      await addMigrationColumn('source_recorded_at', 'VARCHAR(64) NULL AFTER amount');
      await addMigrationColumn('source_notes', 'TEXT NULL AFTER source_recorded_at');
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ai_wallet_project_hold_transfers (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          transfer_no VARCHAR(64) NOT NULL,
          request_id VARCHAR(112) NOT NULL,
          ledger_id INT NOT NULL,
          user_id INT NOT NULL,
          source_tag_name VARCHAR(160) NOT NULL,
          source_margin_entry_id VARCHAR(160) NOT NULL,
          source_outflow_entry_id VARCHAR(160) NOT NULL,
          target_tag_name VARCHAR(160) NOT NULL,
          target_margin_entry_id VARCHAR(160) NOT NULL,
          asset_code VARCHAR(16) NOT NULL,
          amount DECIMAL(36,18) NOT NULL,
          source_hold_id BIGINT UNSIGNED NOT NULL,
          target_hold_id BIGINT UNSIGNED NOT NULL,
          source_migration_no VARCHAR(64) NOT NULL,
          source_outflow_recorded_at VARCHAR(64) NULL,
          source_outflow_notes TEXT NULL,
          target_recorded_at VARCHAR(64) NULL,
          target_notes TEXT NULL,
          created_by INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ai_wallet_hold_transfer_no (transfer_no),
          UNIQUE KEY uk_ai_wallet_hold_transfer_request (request_id),
          UNIQUE KEY uk_ai_wallet_hold_transfer_source_outflow (ledger_id, user_id, source_outflow_entry_id),
          UNIQUE KEY uk_ai_wallet_hold_transfer_target (ledger_id, user_id, target_margin_entry_id),
          KEY idx_ai_wallet_hold_transfer_source (source_hold_id),
          KEY idx_ai_wallet_hold_transfer_target_hold (target_hold_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='37号历史手工保证金标签平移：同一笔钱包冻结从来源标签转至目标标签'
      `);
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ledger37_margin_migration_batches (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          batch_no VARCHAR(64) NOT NULL,
          manifest_hash CHAR(64) NOT NULL,
          direct_migration_count INT NOT NULL,
          transfer_count INT NOT NULL,
          pre_snapshot LONGTEXT NOT NULL,
          post_snapshot LONGTEXT NOT NULL,
          reconciliation_json LONGTEXT NOT NULL,
          created_by INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ledger37_margin_migration_batch_no (batch_no),
          UNIQUE KEY uk_ledger37_margin_migration_manifest (manifest_hash),
          KEY idx_ledger37_margin_migration_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='37号历史保证金迁移前后保证金、盈亏及分红核对快照'
      `);
      const [columns] = await (conn as any).execute(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'dividend_records'
      `) as any[];
      const present = new Set(rowsOf(columns).map((row) => String(row.column_name)));
      const addColumn = async (column: string, definition: string) => {
        if (present.has(column)) return;
        try { await (conn as any).execute(`ALTER TABLE dividend_records ADD COLUMN ${column} ${definition}`); }
        catch (error: any) { if (error?.code !== "ER_DUP_FIELDNAME") throw error; }
        present.add(column);
      };
      await addColumn("asset_code", "VARCHAR(16) NULL DEFAULT NULL AFTER amount");
      await addColumn("asset_amount", "DECIMAL(36,18) NULL DEFAULT NULL AFTER asset_code");
      await addColumn("wallet_request_id", "VARCHAR(112) NULL DEFAULT NULL AFTER note");
      await addColumn("wallet_entry_id", "BIGINT NULL DEFAULT NULL AFTER wallet_request_id");
      await addColumn("reversal_of_id", "BIGINT NULL DEFAULT NULL AFTER wallet_entry_id");
      await addColumn("reversal_mode", "VARCHAR(16) NULL DEFAULT NULL AFTER reversal_of_id");
      await addColumn("wallet_snapshot_json", "LONGTEXT NULL AFTER wallet_entry_id");
      try {
        await (conn as any).execute("ALTER TABLE dividend_records ADD UNIQUE KEY uk_dividend_wallet_request (wallet_request_id)");
      } catch (error: any) {
        if (!['ER_DUP_KEYNAME', 'ER_DUP_ENTRY'].includes(String(error?.code))) throw error;
      }
      try {
        await (conn as any).execute('ALTER TABLE dividend_records ADD UNIQUE KEY uk_dividend_reversal_of (reversal_of_id)');
      } catch (error: any) {
        if (!['ER_DUP_KEYNAME', 'ER_DUP_ENTRY'].includes(String(error?.code))) throw error;
      }
    })().catch((error) => {
      infrastructureReady = null;
      throw error;
    });
  }
  await infrastructureReady;
}

async function getFundingBalanceForUpdate(transaction: any, userId: number, assetCode: "CNY" | "USDT") {
  const [userRows] = await transaction.execute(
    "SELECT id, COALESCE(balance, 0) AS balance, COALESCE(cny_balance, 0) AS cny_balance FROM users WHERE id = ? LIMIT 1 FOR UPDATE",
    [userId],
  );
  const user = rowsOf(userRows)[0];
  if (!user) throw new Error("钱包用户不存在");
  const where = assetCode === "CNY"
    ? "COALESCE(note, '') LIKE '[CNY]%'"
    : "COALESCE(note, '') NOT LIKE '[CNY]%' AND COALESCE(note, '') NOT LIKE '[BALANCE_BASE]%'";
  const [manualRows] = await transaction.execute(
    `SELECT amount FROM af_manual_balances WHERE user_id = ? AND ${where} FOR UPDATE`,
    [userId],
  );
  const manual = rowsOf(manualRows).reduce((total, row) => total + Number(row.amount || 0), 0);
  const [holdRows] = await transaction.execute(
    `SELECT COALESCE(SUM(amount - COALESCE(released_amount, 0)), 0) AS frozen FROM ai_wallet_project_holds
      WHERE user_id = ? AND asset_code = ? AND status = 'active' FOR UPDATE`,
    [userId, assetCode],
  );
  const frozen = Number(rowsOf(holdRows)[0]?.frozen || 0);
  const total = Number(assetCode === "CNY" ? user.cny_balance : user.balance) + manual;
  return { total, frozen, available: total - frozen };
}

export async function getWalletFundingBalanceSummary(userId: number, assetCode: "CNY" | "USDT") {
  await ensureLedger37WalletInfrastructure();
  const conn = await getDbConnection();
  if (!conn) return { total: 0, frozen: 0, available: 0 };
  const [userRows] = await (conn as any).execute(
    "SELECT COALESCE(balance, 0) AS balance, COALESCE(cny_balance, 0) AS cny_balance FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  const user = rowsOf(userRows)[0];
  if (!user) return { total: 0, frozen: 0, available: 0 };
  const where = assetCode === "CNY"
    ? "COALESCE(note, '') LIKE '[CNY]%'"
    : "COALESCE(note, '') NOT LIKE '[CNY]%' AND COALESCE(note, '') NOT LIKE '[BALANCE_BASE]%'";
  const [manualRows] = await (conn as any).execute(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM af_manual_balances WHERE user_id = ? AND ${where}`,
    [userId],
  );
  const [holdRows] = await (conn as any).execute(
    "SELECT COALESCE(SUM(amount - COALESCE(released_amount, 0)), 0) AS frozen FROM ai_wallet_project_holds WHERE user_id = ? AND asset_code = ? AND status = 'active'",
    [userId, assetCode],
  );
  const total = Number(assetCode === "CNY" ? user.cny_balance : user.balance) + Number(rowsOf(manualRows)[0]?.total || 0);
  const frozen = Number(rowsOf(holdRows)[0]?.frozen || 0);
  return { total, frozen, available: total - frozen };
}

/** 兼容37号账本既有调用；资金账户冻结会合并计算37号与52号占用。 */
export const getLedger37FundingBalanceSummary = getWalletFundingBalanceSummary;

/**
 * 资金型钱包冻结的可审计来源分组。
 * 只读取仍有效的项目冻结台账，remainingAmount 与分层余额的 frozen 口径保持一致，绝不从流水备注推测。
 */
export async function getLedger37FundingBalanceBreakdown(userId: number, assetCode: "CNY" | "USDT") {
  const summary = await getLedger37FundingBalanceSummary(userId, assetCode);
  const conn = await getDbConnection();
  if (!conn) return { ...summary, frozenByLedger: [] as Array<{ ledgerId: number; amount: number; holdCount: number }> };
  const [rows] = await (conn as any).execute(
    `SELECT ledger_id,
            COALESCE(SUM(amount - COALESCE(released_amount, 0)), 0) AS amount,
            COUNT(*) AS hold_count
       FROM ai_wallet_project_holds
      WHERE user_id = ?
        AND asset_code = ?
        AND status = 'active'
        AND amount > COALESCE(released_amount, 0)
      GROUP BY ledger_id
      ORDER BY ledger_id ASC`,
    [userId, assetCode],
  );
  const frozenByLedger = rowsOf(rows)
    .map((row) => ({
      ledgerId: Number(row.ledger_id),
      amount: Number(row.amount || 0),
      holdCount: Number(row.hold_count || 0),
    }))
    .filter((row) => Number.isInteger(row.ledgerId) && row.ledgerId > 0 && row.amount > 0);
  return { ...summary, frozenByLedger };
}

/**
 * 在同一事务内读取分红入账完成后的钱包余额。
 * 该值仅作为分红审计快照保存，不会随之后的充值、冻结或解冻变化。
 */
async function getLedger37DividendWalletSnapshot(
  transaction: any,
  userId: number,
  assetCode: Ledger37WalletAsset,
): Promise<Ledger37WalletBalanceSnapshot> {
  const capturedAt = new Date().toISOString();
  if (isFundingAsset(assetCode)) {
    const wallet = await getFundingBalanceForUpdate(transaction, userId, assetCode);
    return {
      assetCode,
      total: balanceSnapshotText(wallet.total),
      frozen: balanceSnapshotText(wallet.frozen),
      available: balanceSnapshotText(wallet.available),
      capturedAt,
    };
  }

  const [assetRows] = await transaction.execute(
    `SELECT available_balance AS available, frozen_balance AS frozen,
            available_balance + frozen_balance AS total
       FROM ai_wallet_asset_balances
      WHERE user_id = ? AND asset_code = ?
      LIMIT 1 FOR UPDATE`,
    [userId, assetCode],
  );
  const assetBalance = rowsOf(assetRows)[0];
  if (!assetBalance) throw new Error("分红入账后无法读取数字资产钱包余额快照");
  return {
    assetCode,
    total: balanceSnapshotText(assetBalance.total),
    frozen: balanceSnapshotText(assetBalance.frozen),
    available: balanceSnapshotText(assetBalance.available),
    capturedAt,
  };
}

async function getCnyValue(assetCode: Ledger37WalletAsset, amount: string): Promise<string> {
  const quantity = Number(amount);
  if (!Number.isFinite(quantity)) throw new Error("资产数量无效");
  if (assetCode === "CNY") return quantity.toFixed(8);
  const { getLatestPrice, getUsdtCnyRate } = await import("./price-scanner");
  const cnyRate = Number(getUsdtCnyRate?.() || 0);
  const priceUsdt = assetCode === "USDT" ? 1 : Number(getLatestPrice(assetCode) || 0);
  if (!(cnyRate > 0) || !(priceUsdt > 0)) throw new Error(`${assetCode} 暂无可靠人民币估值，不能创建该笔资金记录`);
  return (quantity * priceUsdt * cnyRate).toFixed(8);
}

function holdResult(row: any): Ledger37WalletHold {
  const amount = String(row.amount);
  const releasedAmount = String(row.released_amount ?? 0);
  const remainingAmount = Math.max(0, Number(amount) - Number(releasedAmount)).toFixed(18).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return {
    id: Number(row.id),
    holdNo: String(row.hold_no),
    ledgerId: Number(row.ledger_id),
    userId: Number(row.user_id),
    tagName: String(row.tag_name),
    assetCode: normalizeLedger37WalletAsset(row.asset_code),
    amount,
    releasedAmount,
    remainingAmount,
    cnyValueSnapshot: row.cny_value_snapshot == null ? null : String(row.cny_value_snapshot),
    status: String(row.status) === "released" ? "released" : "active",
    createdAt: row.created_at ? String(row.created_at) : "",
    releasedAt: row.released_at ? String(row.released_at) : null,
  };
}

export async function listLedger37WalletHolds(userId?: number): Promise<Ledger37WalletHold[]> {
  await ensureLedger37WalletInfrastructure();
  const conn = await getDbConnection();
  if (!conn) return [];
  const params: unknown[] = [LEDGER_37_ID];
  const userWhere = userId ? " AND user_id = ?" : "";
  if (userId) params.push(userId);
  const [rows] = await (conn as any).execute(
    `SELECT * FROM ai_wallet_project_holds WHERE ledger_id = ?${userWhere} ORDER BY created_at DESC, id DESC`,
    params,
  );
  return rowsOf(rows).map(holdResult);
}

export async function freezeLedger37WalletHold(params: {
  userId: number;
  tagName: string;
  assetCode: Ledger37WalletAsset | string;
  amount: string;
  actorUserId: number;
  /** 默认37号；52号仅用于融资订单钱包担保。 */
  ledgerId?: typeof LEDGER_37_ID | typeof LEDGER_52_ID;
  requestId?: string;
  transaction?: any;
}): Promise<{ hold: Ledger37WalletHold; walletBalanceSnapshot: Ledger37WalletBalanceSnapshot | null; alreadyCompleted: boolean }> {
  await ensureLedger37WalletInfrastructure();
  const ledgerId = normalizeWalletHoldLedgerId(params.ledgerId);
  const assetCode = normalizeLedger37WalletAsset(params.assetCode);
  const amount = decimalText(params.amount);
  const tagName = String(params.tagName || "").trim().slice(0, 160);
  if (!tagName) throw new Error("标签名称不能为空");
  const requestId = params.requestId || buildWalletHoldRequestId(ledgerId, "H");
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接失败");
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [existingRows] = await transaction.execute(
      "SELECT * FROM ai_wallet_project_holds WHERE request_id = ? LIMIT 1 FOR UPDATE",
      [requestId],
    );
    const existing = rowsOf(existingRows)[0];
    if (existing) {
      if (ownConnection) await transaction.commit();
      return { hold: holdResult(existing), walletBalanceSnapshot: null, alreadyCompleted: true };
    }
    const cnyValueSnapshot = await getCnyValue(assetCode, amount);
    let walletBalanceSnapshot: Ledger37WalletBalanceSnapshot;
    if (isFundingAsset(assetCode)) {
      const wallet = await getFundingBalanceForUpdate(transaction, params.userId, assetCode);
      if (Number(amount) > wallet.available + 1e-8) {
        throw new Error(`${assetCode} 可用余额不足；可冻结 ${Math.max(0, wallet.available).toFixed(assetCode === "CNY" ? 2 : 8)} ${assetCode}`);
      }
      walletBalanceSnapshot = {
        assetCode,
        total: balanceSnapshotText(wallet.total),
        frozen: balanceSnapshotText(wallet.frozen + Number(amount)),
        available: balanceSnapshotText(wallet.available - Number(amount)),
      };
    } else {
      await dbMultiAssetWallet.moveMultiAssetBalanceToFrozen({
        userId: params.userId,
        assetCode,
        amount,
        direction: "freeze",
        note: `${ledgerId}号账本保证金冻结 · ${tagName}`,
        requestId: `${requestId}_ASSET`,
        actorUserId: params.actorUserId,
        sourceLedgerId: ledgerId,
        transaction,
      });
      const [assetRows] = await transaction.execute(
        `SELECT available_balance AS available, frozen_balance AS frozen,
                available_balance + frozen_balance AS total
           FROM ai_wallet_asset_balances
          WHERE user_id = ? AND asset_code = ?
          LIMIT 1 FOR UPDATE`,
        [params.userId, assetCode],
      );
      const assetBalance = rowsOf(assetRows)[0];
      if (!assetBalance) throw new Error("冻结后无法读取钱包余额快照");
      walletBalanceSnapshot = {
        assetCode,
        total: balanceSnapshotText(assetBalance.total),
        frozen: balanceSnapshotText(assetBalance.frozen),
        available: balanceSnapshotText(assetBalance.available),
      };
    }
    const holdNo = `H${ledgerId}${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString("hex").toUpperCase()}`;
    const [insert] = await transaction.execute(
      `INSERT INTO ai_wallet_project_holds
        (hold_no, request_id, ledger_id, user_id, tag_name, asset_code, amount, cny_value_snapshot, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), CAST(? AS DECIMAL(36,8)), 'active', ?)`,
      [holdNo, requestId, ledgerId, params.userId, tagName, assetCode, amount, cnyValueSnapshot, params.actorUserId],
    );
    const [holdRows] = await transaction.execute("SELECT * FROM ai_wallet_project_holds WHERE id = ? LIMIT 1", [Number((insert as any).insertId)]);
    if (ownConnection) await transaction.commit();
    return { hold: holdResult(rowsOf(holdRows)[0]), walletBalanceSnapshot, alreadyCompleted: false };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

/**
 * 一次性把一笔已确认存在的历史手工保证金纳入全局钱包，并立即冻结给原标签。
 * 钱包总额会增加，但可用额同步被等额冻结；迁移本身不会产生可用余额。
 */
export async function migrateLedger37ManualMarginToWalletHold(params: {
  userId: number;
  tagName: string;
  marginEntryId: string;
  assetCode: Ledger37WalletAsset | string;
  amount: string;
  /** 原手工保证金录入时间；保留业务发生日，不替换迁移审计时间。 */
  sourceRecordedAt?: string | null;
  /** 原手工保证金逐笔备注；完整内容写入迁移审计，摘要同步到钱包流水。 */
  sourceNotes?: string[];
  actorUserId: number;
  transaction?: any;
}): Promise<Ledger37ManualMarginMigration> {
  await ensureLedger37WalletInfrastructure();
  const assetCode = normalizeLedger37WalletAsset(params.assetCode);
  const amount = decimalText(params.amount);
  const tagName = String(params.tagName || '').trim().slice(0, 160);
  const marginEntryId = String(params.marginEntryId || '').trim().slice(0, 160);
  if (!tagName || !marginEntryId) throw new Error('历史保证金记录无效');
  const sourceRecordedAt = String(params.sourceRecordedAt || '').trim().slice(0, 64) || null;
  const sourceNotes = (params.sourceNotes ?? [])
    .map((note) => String(note || '').trim())
    .filter(Boolean)
    .slice(0, 100);
  const sourceNotesJson = sourceNotes.length > 0 ? JSON.stringify(sourceNotes) : null;
  const requestId = buildManualMigrationRequestId(params.userId, tagName, marginEntryId);
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error('数据库连接失败');
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [existingRows] = await transaction.execute(
      `SELECT migration_no, hold_id, asset_code, amount FROM ai_wallet_project_hold_migrations
       WHERE request_id = ? LIMIT 1 FOR UPDATE`,
      [requestId],
    );
    const existing = rowsOf(existingRows)[0];
    if (existing) {
      if (String(existing.asset_code).toUpperCase() !== assetCode || Number(existing.amount) !== Number(amount)) {
        throw new Error('历史保证金迁移记录与当前金额不一致，请先完成线下核对');
      }
      const [holdRows] = await transaction.execute('SELECT * FROM ai_wallet_project_holds WHERE id = ? LIMIT 1 FOR UPDATE', [Number(existing.hold_id)]);
      const hold = rowsOf(holdRows)[0];
      if (!hold) throw new Error('历史保证金迁移台账不完整');
      if (ownConnection) await transaction.commit();
      return {
        migrationNo: String(existing.migration_no), hold: holdResult(hold), assetCode,
        amount, alreadyCompleted: true,
      };
    }

    const migrationNo = `M37${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`;
    const sourceSummary = [
      sourceRecordedAt ? `原记录 ${sourceRecordedAt}` : '',
      sourceNotes.length > 0 ? `原备注 ${sourceNotes.join('；')}` : '',
    ].filter(Boolean).join(' · ').slice(0, 420);
    const visibleNote = `历史手工保证金迁入并冻结 · ${tagName}${sourceSummary ? ` · ${sourceSummary}` : ''}`;
    let walletEntryId: number | null = null;
    if (isFundingAsset(assetCode)) {
      const note = assetCode === 'CNY' ? `[CNY]${visibleNote}` : visibleNote;
      const [walletInsert] = await transaction.execute(
        'INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, CAST(? AS DECIMAL(36,18)), ?, NOW(), NOW())',
        [LEDGER_37_ID, params.userId, amount, note],
      );
      walletEntryId = Number((walletInsert as any).insertId);
    } else {
      const credit = await dbMultiAssetWallet.adjustMultiAssetBalance({
        userId: params.userId,
        assetCode,
        amount,
        note: visibleNote,
        requestId: `${requestId}_ASSET`,
        actorUserId: params.actorUserId,
        sourceLedgerId: LEDGER_37_ID,
        eventType: 'admin_adjustment',
        transaction,
      });
      walletEntryId = Number(credit.entry.id);
    }
    const holdResultValue = await freezeLedger37WalletHold({
      userId: params.userId,
      tagName,
      assetCode,
      amount,
      actorUserId: params.actorUserId,
      requestId: `${requestId}_HOLD`,
      transaction,
    });
    const hold = holdResultValue.hold;
    await transaction.execute(
      `INSERT INTO ai_wallet_project_hold_migrations
        (migration_no, request_id, ledger_id, user_id, tag_name, margin_entry_id, asset_code, amount, source_recorded_at, source_notes, hold_id, wallet_entry_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), ?, ?, ?, ?, ?)`,
      [migrationNo, requestId, LEDGER_37_ID, params.userId, tagName, marginEntryId, assetCode, amount, sourceRecordedAt, sourceNotesJson, hold.id, walletEntryId, params.actorUserId],
    );
    if (ownConnection) await transaction.commit();
    return { migrationNo, hold, assetCode, amount, alreadyCompleted: false };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

/**
 * 直接删除一笔“历史手工保证金迁入并冻结”。
 * 仅允许仍全额冻结、从未解冻或平移的迁入记录：同步移除迁入钱包流水与冻结台账，
 * 但在 ledger37_wallet_action_reversals 保留后台审计，避免形成无痕资金删除。
 */
export async function deleteLedger37ManualMarginMigration(params: {
  holdId: number;
  expectedUserId: number;
  expectedTagName: string;
  expectedMarginEntryId: string;
  expectedAmount: string;
  reason: string;
  actorUserId: number;
  transaction?: any;
}): Promise<{
  holdId: number;
  migrationNo: string;
  marginEntryId: string;
  userId: number;
  tagName: string;
  assetCode: Ledger37WalletAsset;
  amount: string;
  walletEntryId: number;
  auditNo: string;
}> {
  await ensureLedger37WalletInfrastructure();
  const holdId = Number(params.holdId);
  const expectedUserId = Number(params.expectedUserId);
  const expectedTagName = String(params.expectedTagName || '').trim().slice(0, 160);
  const expectedMarginEntryId = String(params.expectedMarginEntryId || '').trim().slice(0, 160);
  const expectedAmount = decimalText(params.expectedAmount);
  const reason = String(params.reason || '').trim().slice(0, 240);
  if (!Number.isInteger(holdId) || holdId <= 0 || !Number.isInteger(expectedUserId) || expectedUserId <= 0 || !expectedTagName || !expectedMarginEntryId || !reason) {
    throw new Error('删除历史保证金迁入的核对参数不完整');
  }

  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error('数据库连接失败');
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [migrationRows] = await transaction.execute(
      `SELECT m.*, h.user_id AS hold_user_id, h.tag_name AS hold_tag_name,
              h.asset_code AS hold_asset_code, h.amount AS hold_amount,
              h.released_amount AS hold_released_amount, h.status AS hold_status
       FROM ai_wallet_project_hold_migrations m
       JOIN ai_wallet_project_holds h ON h.id = m.hold_id
       WHERE m.ledger_id = ? AND m.hold_id = ?
       LIMIT 1 FOR UPDATE`,
      [LEDGER_37_ID, holdId],
    );
    const migration = rowsOf(migrationRows)[0];
    if (!migration) throw new Error('未找到该历史保证金迁入记录，可能已被删除或变更');

    const assetCode = normalizeLedger37WalletAsset(migration.asset_code);
    const amount = decimalText(String(migration.amount));
    const userId = Number(migration.user_id);
    const tagName = String(migration.tag_name || '').trim();
    const marginEntryId = String(migration.margin_entry_id || '').trim();
    const walletEntryId = Number(migration.wallet_entry_id);
    if (
      userId !== expectedUserId
      || tagName !== expectedTagName
      || marginEntryId !== expectedMarginEntryId
      || Math.abs(Number(amount) - Number(expectedAmount)) > 0.00000001
      || Number(migration.hold_user_id) !== expectedUserId
      || String(migration.hold_tag_name || '').trim() !== expectedTagName
      || String(migration.hold_asset_code || '').trim().toUpperCase() !== assetCode
      || Math.abs(Number(migration.hold_amount) - Number(expectedAmount)) > 0.00000001
    ) {
      throw new Error('迁入记录已变化，已阻止删除；请刷新后重新核对');
    }
    if (String(migration.hold_status) !== 'active' || Math.abs(Number(migration.hold_released_amount || 0)) > 0.00000001) {
      throw new Error('该笔保证金已发生解冻，不能直接删除；请使用撤回或冲正流程');
    }

    const [releaseRows] = await transaction.execute(
      'SELECT id FROM ai_wallet_project_hold_releases WHERE hold_id = ? LIMIT 1 FOR UPDATE',
      [holdId],
    );
    if (rowsOf(releaseRows)[0]) throw new Error('该笔保证金已有解冻流水，不能直接删除；请使用撤回或冲正流程');
    const [transferRows] = await transaction.execute(
      'SELECT id FROM ai_wallet_project_hold_transfers WHERE source_hold_id = ? OR target_hold_id = ? LIMIT 1 FOR UPDATE',
      [holdId, holdId],
    );
    if (rowsOf(transferRows)[0]) throw new Error('该笔保证金已参与标签平移，不能直接删除；请使用撤回或冲正流程');

    const [existingAuditRows] = await transaction.execute(
      `SELECT id FROM ledger37_wallet_action_reversals
       WHERE action_kind = 'manual_margin_migration_delete' AND source_record_id = ?
       LIMIT 1 FOR UPDATE`,
      [holdId],
    );
    if (rowsOf(existingAuditRows)[0]) throw new Error('该笔历史保证金迁入已删除，请勿重复操作');
    if (!Number.isInteger(walletEntryId) || walletEntryId <= 0) throw new Error('迁入钱包流水缺失，不能直接删除');

    if (isFundingAsset(assetCode)) {
      const [walletRows] = await transaction.execute(
        `SELECT id FROM af_manual_balances
         WHERE id = ? AND ledger_id = ? AND user_id = ?
           AND amount = CAST(? AS DECIMAL(36,18))
           AND COALESCE(note, '') LIKE '%历史手工保证金迁入并冻结%'
         LIMIT 1 FOR UPDATE`,
        [walletEntryId, LEDGER_37_ID, userId, amount],
      );
      if (!rowsOf(walletRows)[0]) throw new Error('原钱包迁入流水已变化，不能直接删除');
    } else {
      const [walletRows] = await transaction.execute(
        `SELECT id FROM ai_wallet_asset_entries
         WHERE id = ? AND user_id = ? AND asset_code = ?
           AND amount = CAST(? AS DECIMAL(36,18)) AND source_ledger_id = ?
           AND event_type = 'admin_adjustment'
         LIMIT 1 FOR UPDATE`,
        [walletEntryId, userId, assetCode, amount, LEDGER_37_ID],
      );
      if (!rowsOf(walletRows)[0]) throw new Error('原数字资产迁入流水已变化，不能直接删除');
    }

    const auditNo = `D37${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`;
    const requestId = `MDD37_${holdId}_${randomBytes(6).toString('hex')}`;
    await transaction.execute(
      `INSERT INTO ledger37_wallet_action_reversals
        (reversal_no, request_id, action_kind, source_record_id, mode, user_id, asset_code, amount, source_wallet_entry_id, actor_user_id, detail_json)
       VALUES (?, ?, 'manual_margin_migration_delete', ?, 'delete', ?, ?, CAST(? AS DECIMAL(36,18)), ?, ?, ?)`,
      [auditNo, requestId, holdId, userId, assetCode, amount, walletEntryId, params.actorUserId, JSON.stringify({
        migrationNo: String(migration.migration_no),
        marginEntryId,
        tagName,
        reason,
        sourceRecordedAt: migration.source_recorded_at ?? null,
        sourceNotes: migration.source_notes ?? null,
      })],
    );
    await transaction.execute('DELETE FROM ai_wallet_project_hold_migrations WHERE id = ? LIMIT 1', [Number(migration.id)]);
    await transaction.execute(
      `DELETE FROM ai_wallet_project_holds
       WHERE id = ? AND status = 'active' AND released_amount = 0
       LIMIT 1`,
      [holdId],
    );
    if (isFundingAsset(assetCode)) {
      await transaction.execute('DELETE FROM af_manual_balances WHERE id = ? LIMIT 1', [walletEntryId]);
    } else {
      await transaction.execute('DELETE FROM ai_wallet_asset_entries WHERE id = ? LIMIT 1', [walletEntryId]);
    }
    if (ownConnection) await transaction.commit();
    return { holdId, migrationNo: String(migration.migration_no), marginEntryId, userId, tagName, assetCode, amount, walletEntryId, auditNo };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

/**
 * 历史手工保证金的标签平移：来源正数保证金只入钱包一次，再从来源冻结转至目标冻结。
 * 目标标签的“转入”正数仅承接已有冻结，绝不重复给全局钱包加余额。
 */
export async function transferLedger37ManualMarginWalletHold(params: {
  userId: number;
  assetCode: Ledger37WalletAsset | string;
  amount: string;
  sourceTagName: string;
  sourceMarginEntryId: string;
  sourceRecordedAt?: string | null;
  sourceNotes?: string[];
  sourceOutflowEntryId: string;
  sourceOutflowRecordedAt?: string | null;
  sourceOutflowNotes?: string[];
  targetTagName: string;
  targetMarginEntryId: string;
  targetRecordedAt?: string | null;
  targetNotes?: string[];
  actorUserId: number;
  transaction?: any;
}): Promise<{
  transferNo: string;
  sourceMigration: Ledger37ManualMarginMigration;
  sourceRelease: Awaited<ReturnType<typeof releaseLedger37WalletHold>>;
  targetHold: Ledger37WalletHold;
  alreadyCompleted: boolean;
}> {
  await ensureLedger37WalletInfrastructure();
  const assetCode = normalizeLedger37WalletAsset(params.assetCode);
  const amount = decimalText(params.amount);
  const sourceTagName = String(params.sourceTagName || '').trim().slice(0, 160);
  const targetTagName = String(params.targetTagName || '').trim().slice(0, 160);
  const sourceMarginEntryId = String(params.sourceMarginEntryId || '').trim().slice(0, 160);
  const sourceOutflowEntryId = String(params.sourceOutflowEntryId || '').trim().slice(0, 160);
  const targetMarginEntryId = String(params.targetMarginEntryId || '').trim().slice(0, 160);
  if (!sourceTagName || !targetTagName || !sourceMarginEntryId || !sourceOutflowEntryId || !targetMarginEntryId) {
    throw new Error('历史保证金平移记录无效');
  }
  if (sourceTagName === targetTagName) throw new Error('保证金平移的来源与目标标签不能相同');
  const requestId = buildManualMarginTransferRequestId(params.userId, sourceMarginEntryId, sourceOutflowEntryId, targetMarginEntryId);
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error('数据库连接失败');
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [existingRows] = await transaction.execute(
      'SELECT * FROM ai_wallet_project_hold_transfers WHERE request_id = ? LIMIT 1 FOR UPDATE',
      [requestId],
    );
    const existing = rowsOf(existingRows)[0];
    if (existing) {
      if (String(existing.asset_code).toUpperCase() !== assetCode || Number(existing.amount) !== Number(amount)) {
        throw new Error('历史保证金平移记录与当前金额不一致，请先完成线下核对');
      }
      const [holdRows] = await transaction.execute(
        'SELECT * FROM ai_wallet_project_holds WHERE id IN (?, ?) ORDER BY id ASC FOR UPDATE',
        [Number(existing.source_hold_id), Number(existing.target_hold_id)],
      );
      const holds = rowsOf(holdRows);
      const sourceHold = holds.find((row) => Number(row.id) === Number(existing.source_hold_id));
      const targetHold = holds.find((row) => Number(row.id) === Number(existing.target_hold_id));
      if (!sourceHold || !targetHold) throw new Error('历史保证金平移台账不完整');
      const [migrationRows] = await transaction.execute(
        'SELECT migration_no FROM ai_wallet_project_hold_migrations WHERE hold_id = ? LIMIT 1 FOR UPDATE',
        [Number(existing.source_hold_id)],
      );
      const migrationNo = String(rowsOf(migrationRows)[0]?.migration_no || existing.source_migration_no || '');
      if (!migrationNo) throw new Error('历史保证金平移来源迁移台账不完整');
      const sourceHoldResult = holdResult(sourceHold);
      const targetHoldResult = holdResult(targetHold);
      if (ownConnection) await transaction.commit();
      return {
        transferNo: String(existing.transfer_no),
        sourceMigration: { migrationNo, hold: sourceHoldResult, assetCode, amount, alreadyCompleted: true },
        sourceRelease: {
          hold: sourceHoldResult,
          releasedAmount: String(existing.amount),
          remainingAmount: sourceHoldResult.remainingAmount,
          fullyReleased: sourceHoldResult.status === 'released',
          releaseNo: '',
          releasedAt: sourceHoldResult.releasedAt || '',
        },
        targetHold: targetHoldResult,
        alreadyCompleted: true,
      };
    }

    const sourceMigration = await migrateLedger37ManualMarginToWalletHold({
      userId: params.userId,
      tagName: sourceTagName,
      marginEntryId: sourceMarginEntryId,
      assetCode,
      amount,
      sourceRecordedAt: params.sourceRecordedAt,
      sourceNotes: params.sourceNotes,
      actorUserId: params.actorUserId,
      transaction,
    });
    if (sourceMigration.alreadyCompleted) throw new Error('来源保证金已迁入，但缺少平移审计记录');
    const sourceRelease = await releaseLedger37WalletHold({
      holdId: sourceMigration.hold.id,
      amount,
      reason: 'ledger37_margin_transfer',
      actorUserId: params.actorUserId,
      transaction,
    });
    const targetFreeze = await freezeLedger37WalletHold({
      userId: params.userId,
      tagName: targetTagName,
      assetCode,
      amount,
      actorUserId: params.actorUserId,
      requestId: `${requestId}_TARGET_HOLD`,
      transaction,
    });
    if (targetFreeze.alreadyCompleted) throw new Error('目标标签冻结记录已存在，但缺少平移审计记录');
    const transferNo = `T37${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`;
    const sourceOutflowNotes = (params.sourceOutflowNotes ?? []).map((note) => String(note || '').trim()).filter(Boolean).slice(0, 100);
    const targetNotes = (params.targetNotes ?? []).map((note) => String(note || '').trim()).filter(Boolean).slice(0, 100);
    await transaction.execute(
      `INSERT INTO ai_wallet_project_hold_transfers
        (transfer_no, request_id, ledger_id, user_id, source_tag_name, source_margin_entry_id, source_outflow_entry_id, target_tag_name, target_margin_entry_id, asset_code, amount, source_hold_id, target_hold_id, source_migration_no, source_outflow_recorded_at, source_outflow_notes, target_recorded_at, target_notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transferNo, requestId, LEDGER_37_ID, params.userId, sourceTagName, sourceMarginEntryId, sourceOutflowEntryId,
        targetTagName, targetMarginEntryId, assetCode, amount, sourceMigration.hold.id, targetFreeze.hold.id,
        sourceMigration.migrationNo, String(params.sourceOutflowRecordedAt || '').trim().slice(0, 64) || null,
        sourceOutflowNotes.length > 0 ? JSON.stringify(sourceOutflowNotes) : null,
        String(params.targetRecordedAt || '').trim().slice(0, 64) || null,
        targetNotes.length > 0 ? JSON.stringify(targetNotes) : null, params.actorUserId,
      ],
    );
    if (ownConnection) await transaction.commit();
    return { transferNo, sourceMigration, sourceRelease, targetHold: targetFreeze.hold, alreadyCompleted: false };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

export async function releaseLedger37WalletHold(params: {
  holdId: number;
  /** 未传时释放该笔剩余冻结金额；传入时仅减少指定数量。 */
  amount?: string;
  /** 平移时从来源标签释放，但资金会在同一事务中冻结到目标标签。 */
  reason?: string;
  actorUserId: number;
  /** 默认37号；52号仅用于融资订单钱包担保。 */
  ledgerId?: typeof LEDGER_37_ID | typeof LEDGER_52_ID;
  transaction?: any;
}): Promise<{ hold: Ledger37WalletHold; releasedAmount: string; remainingAmount: string; fullyReleased: boolean; releaseNo: string; releasedAt: string }> {
  await ensureLedger37WalletInfrastructure();
  const ledgerId = normalizeWalletHoldLedgerId(params.ledgerId);
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接失败");
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [holdRows] = await transaction.execute(
      "SELECT * FROM ai_wallet_project_holds WHERE id = ? AND ledger_id = ? LIMIT 1 FOR UPDATE",
      [params.holdId, ledgerId],
    );
    const hold = rowsOf(holdRows)[0];
    if (!hold) throw new Error("保证金冻结记录不存在");
    if (String(hold.status) !== "active") throw new Error("该保证金已经解冻");
    const assetCode = normalizeLedger37WalletAsset(hold.asset_code);
    const originalAmount = Number(hold.amount || 0);
    const previouslyReleased = Math.max(0, Number(hold.released_amount || 0));
    const remaining = Math.max(0, originalAmount - previouslyReleased);
    if (!(remaining > 0.00000001)) throw new Error("该保证金没有可解冻余额");
    const amount = params.amount
      ? decimalText(params.amount)
      : remaining.toFixed(18).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    if (Number(amount) - remaining > 0.00000001) {
      throw new Error(`${assetCode} 本笔最多可解冻 ${remaining.toFixed(assetCode === "CNY" ? 2 : 8)} ${assetCode}`);
    }
    const nextReleased = previouslyReleased + Number(amount);
    const fullyReleased = nextReleased >= originalAmount - 0.00000001;
    const releaseNo = `R${ledgerId}${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString("hex").toUpperCase()}`;
    const releaseRequestId = buildWalletHoldRequestId(ledgerId, "R");
    const releasedAt = new Date().toISOString();
    if (!isFundingAsset(assetCode)) {
      await dbMultiAssetWallet.moveMultiAssetBalanceToFrozen({
        userId: Number(hold.user_id), assetCode, amount, direction: "release",
        note: `${ledgerId}号账本保证金解冻 · ${String(hold.tag_name)}`,
        requestId: `${releaseRequestId}_ASSET`, actorUserId: params.actorUserId,
        sourceLedgerId: ledgerId, transaction,
      });
    } else {
      // 资金型资产冻结没有改变总额；标记释放即可使该笔金额重新计入可用余额。
      await getFundingBalanceForUpdate(transaction, Number(hold.user_id), assetCode);
    }
    await transaction.execute(
      `INSERT INTO ai_wallet_project_hold_releases
        (release_no, request_id, hold_id, amount, entry_kind, status, released_by)
       VALUES (?, ?, ?, CAST(? AS DECIMAL(36,18)), 'release', 'active', ?)`,
      [releaseNo, releaseRequestId, params.holdId, amount, params.actorUserId],
    );
    if (fullyReleased) {
      await transaction.execute(
        "UPDATE ai_wallet_project_holds SET released_amount = amount, status = 'released', released_by = ?, released_reason = ?, released_at = NOW(), updated_at = NOW() WHERE id = ?",
        [params.actorUserId, params.reason || `ledger${ledgerId}_margin_release`, params.holdId],
      );
    } else {
      await transaction.execute(
        "UPDATE ai_wallet_project_holds SET released_amount = released_amount + CAST(? AS DECIMAL(36,18)), released_by = ?, released_reason = ?, updated_at = NOW() WHERE id = ?",
        [amount, params.actorUserId, params.reason || `ledger${ledgerId}_margin_partial_release`, params.holdId],
      );
    }
    const [releasedRows] = await transaction.execute("SELECT * FROM ai_wallet_project_holds WHERE id = ? LIMIT 1", [params.holdId]);
    if (ownConnection) await transaction.commit();
    const updatedHold = holdResult(rowsOf(releasedRows)[0]);
    return { hold: updatedHold, releasedAmount: amount, remainingAmount: updatedHold.remainingAmount, fullyReleased, releaseNo, releasedAt };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

const ledger52FundingCollateralTag = (orderId: number) => `52号融资订单 #${orderId} 钱包担保`;

type Ledger52FundingCollateralInput = { coin: "CNY" | "USDT"; qty: string };

/** 52号融资订单的人民币与USDT担保；冻结不改变资产总额，只占用可用余额。 */
export async function syncLedger52FundingCollateralHolds(params: {
  orderId: number;
  userId: number;
  assets: Ledger52FundingCollateralInput[];
  actorUserId: number;
  transaction?: any;
}): Promise<{ holds: Ledger37WalletHold[] }> {
  if (!Number.isInteger(params.orderId) || params.orderId <= 0 || !Number.isInteger(params.userId) || params.userId <= 0) {
    throw new Error("订单或担保用户无效");
  }
  await ensureLedger37WalletInfrastructure();
  const desired = new Map<"CNY" | "USDT", number>();
  for (const asset of params.assets || []) {
    const assetCode = String(asset.coin || "").toUpperCase();
    if (assetCode !== "CNY" && assetCode !== "USDT") throw new Error("仅人民币和USDT使用兼容资金钱包担保");
    if (desired.has(assetCode)) throw new Error(`同一币种只能作为一条钱包担保物：${assetCode}`);
    desired.set(assetCode, Number(decimalText(asset.qty)));
  }
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接失败");
  const transaction = conn as any;
  const tagName = ledger52FundingCollateralTag(params.orderId);
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [existingRows] = await transaction.execute(
      `SELECT * FROM ai_wallet_project_holds
        WHERE ledger_id = ? AND tag_name = ? AND user_id = ? AND status = 'active' AND asset_code IN ('CNY', 'USDT')
        ORDER BY asset_code ASC, id ASC FOR UPDATE`,
      [LEDGER_52_ID, tagName, params.userId],
    );
    const existingByAsset = new Map<"CNY" | "USDT", any[]>();
    for (const row of rowsOf(existingRows)) {
      const assetCode = String(row.asset_code || "").toUpperCase();
      if (assetCode !== "CNY" && assetCode !== "USDT") continue;
      existingByAsset.set(assetCode, [...(existingByAsset.get(assetCode) || []), row]);
    }
    for (const assetCode of ["CNY", "USDT"] as const) {
      const rows = existingByAsset.get(assetCode) || [];
      const current = rows.reduce((total, row) => total + Math.max(0, Number(row.amount || 0) - Number(row.released_amount || 0)), 0);
      const delta = (desired.get(assetCode) || 0) - current;
      if (delta > 1e-8) {
        await freezeLedger37WalletHold({ ledgerId: LEDGER_52_ID, userId: params.userId, tagName, assetCode, amount: decimalFromNumber(delta), actorUserId: params.actorUserId, transaction });
      } else if (delta < -1e-8) {
        let pendingRelease = -delta;
        for (const row of rows) {
          if (pendingRelease <= 1e-8) break;
          const remaining = Math.max(0, Number(row.amount || 0) - Number(row.released_amount || 0));
          if (remaining <= 1e-8) continue;
          const amount = Math.min(remaining, pendingRelease);
          await releaseLedger37WalletHold({ ledgerId: LEDGER_52_ID, holdId: Number(row.id), amount: decimalFromNumber(amount), actorUserId: params.actorUserId, reason: "ledger52_funding_collateral_sync", transaction });
          pendingRelease -= amount;
        }
        if (pendingRelease > 1e-8) throw new Error(`${assetCode} 钱包担保冻结台账异常，无法解除`);
      }
    }
    const [finalRows] = await transaction.execute(
      `SELECT * FROM ai_wallet_project_holds
        WHERE ledger_id = ? AND tag_name = ? AND user_id = ? AND status = 'active' AND amount > COALESCE(released_amount, 0)
        ORDER BY asset_code ASC, id ASC`,
      [LEDGER_52_ID, tagName, params.userId],
    );
    if (ownConnection) await transaction.commit();
    return { holds: rowsOf(finalRows).map(holdResult) };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

export async function getLedger52FundingCollateralHoldsForOrder(orderId: number): Promise<Ledger37WalletHold[]> {
  if (!Number.isInteger(orderId) || orderId <= 0) return [];
  await ensureLedger37WalletInfrastructure();
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接失败");
  const [rows] = await (conn as any).execute(
    `SELECT * FROM ai_wallet_project_holds
      WHERE ledger_id = ? AND tag_name = ? AND status = 'active' AND amount > COALESCE(released_amount, 0)
      ORDER BY user_id ASC, asset_code ASC, id ASC`,
    [LEDGER_52_ID, ledger52FundingCollateralTag(orderId)],
  );
  return rowsOf(rows).map(holdResult);
}

/** 结清或移入回收站时，自动解除该融资订单全部人民币与USDT钱包担保。 */
export async function releaseLedger52FundingCollateralHoldsForOrder(params: {
  orderId: number;
  actorUserId: number;
  reason: "order_settled" | "order_deleted";
  transaction?: any;
}): Promise<{ releasedCount: number }> {
  if (!Number.isInteger(params.orderId) || params.orderId <= 0) return { releasedCount: 0 };
  await ensureLedger37WalletInfrastructure();
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接失败");
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [rows] = await transaction.execute(
      `SELECT id FROM ai_wallet_project_holds
        WHERE ledger_id = ? AND tag_name = ? AND status = 'active' AND amount > COALESCE(released_amount, 0)
        ORDER BY user_id ASC, asset_code ASC, id ASC FOR UPDATE`,
      [LEDGER_52_ID, ledger52FundingCollateralTag(params.orderId)],
    );
    const holds = rowsOf(rows);
    for (const row of holds) {
      await releaseLedger37WalletHold({ ledgerId: LEDGER_52_ID, holdId: Number(row.id), actorUserId: params.actorUserId, reason: `ledger52_funding_collateral_${params.reason}`, transaction });
    }
    if (ownConnection) await transaction.commit();
    return { releasedCount: holds.length };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

async function writeFundingDividend(transaction: any, params: {
  userId: number;
  assetCode: "CNY" | "USDT";
  amount: string;
  tagName: string;
  note?: string;
  kind?: 'dividend' | 'reversal';
}) {
  await getFundingBalanceForUpdate(transaction, params.userId, params.assetCode);
  // 用户钱包只展示资金用途，不再暴露账本编号；标签和备注保留，便于对账。
  const visibleNote = `${params.kind === 'reversal' ? '股票分红冲正' : '股票分红'} · ${params.tagName}${params.note ? ` · ${params.note}` : ""}`;
  const note = params.assetCode === "CNY" ? `[CNY]${visibleNote}` : visibleNote;
  const [insert] = await transaction.execute(
    "INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, CAST(? AS DECIMAL(36,18)), ?, NOW(), NOW())",
    [LEDGER_37_ID, params.userId, params.amount, note],
  );
  return Number((insert as any).insertId);
}

export async function createLedger37Dividend(params: {
  userId: number;
  tagName: string;
  assetCode: Ledger37WalletAsset | string;
  assetAmount: string;
  note?: string;
  actorUserId: number;
  transaction?: any;
}): Promise<{ recordId: number; cnyValue: string; assetCode: Ledger37WalletAsset; assetAmount: string; walletBalanceSnapshot: Ledger37WalletBalanceSnapshot | null }> {
  await ensureLedger37WalletInfrastructure();
  const assetCode = normalizeLedger37WalletAsset(params.assetCode);
  const assetAmount = decimalText(params.assetAmount);
  const tagName = String(params.tagName || "").trim().slice(0, 160);
  if (!tagName) throw new Error("标签名称不能为空");
  const requestId = buildRequestId("D");
  const cnyValue = await getCnyValue(assetCode, assetAmount);
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接失败");
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [recordInsert] = await transaction.execute(
      `INSERT INTO dividend_records (ledger_id, user_id, tag_name, amount, asset_code, asset_amount, note, wallet_request_id)
       VALUES (?, ?, ?, CAST(? AS DECIMAL(18,2)), ?, CAST(? AS DECIMAL(36,18)), ?, ?)`,
      [LEDGER_37_ID, params.userId, tagName, cnyValue, assetCode, assetAmount, String(params.note || "").trim().slice(0, 255), requestId],
    );
    const recordId = Number((recordInsert as any).insertId);
    let walletEntryId: number | null = null;
    let walletBalanceSnapshot: Ledger37WalletBalanceSnapshot | null = null;
    if (isFundingAsset(assetCode)) {
      walletEntryId = await writeFundingDividend(transaction, { userId: params.userId, assetCode, amount: assetAmount, tagName, note: params.note });
    } else {
      const credit = await dbMultiAssetWallet.adjustMultiAssetBalance({
        userId: params.userId,
        assetCode,
        amount: assetAmount,
        note: `股票分红 · ${tagName}${params.note ? ` · ${params.note}` : ""}`,
        requestId: `${requestId}_ASSET`,
        actorUserId: params.actorUserId,
        sourceLedgerId: LEDGER_37_ID,
        eventType: "ledger_dividend",
        transaction,
      });
      walletEntryId = Number(credit.entry.id);
    }
    walletBalanceSnapshot = await getLedger37DividendWalletSnapshot(transaction, params.userId, assetCode);
    await transaction.execute(
      "UPDATE dividend_records SET wallet_entry_id = ?, wallet_snapshot_json = ? WHERE id = ?",
      [walletEntryId, JSON.stringify(walletBalanceSnapshot), recordId],
    );
    if (ownConnection) await transaction.commit();
    return { recordId, cnyValue, assetCode, assetAmount, walletBalanceSnapshot };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

export type Ledger37RevokeMode = 'reverse' | 'delete';

/**
 * 撤回一笔已入账的37号分红。
 * - reverse：保留原分红，在分红与钱包中各写一笔相反方向的冲正流水；
 * - delete：删除原分红及其原钱包流水，仅适用于资金仍完全可用的情形。
 */
export async function revokeLedger37Dividend(params: {
  recordId: number;
  mode: Ledger37RevokeMode;
  actorUserId: number;
  transaction?: any;
}): Promise<{ mode: Ledger37RevokeMode; sourceRecordId: number; reversalRecordId?: number; assetCode: Ledger37WalletAsset; assetAmount: string }> {
  await ensureLedger37WalletInfrastructure();
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error('数据库连接失败');
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [sourceRows] = await transaction.execute(
      `SELECT * FROM dividend_records
       WHERE id = ? AND ledger_id = ?
       LIMIT 1 FOR UPDATE`,
      [params.recordId, LEDGER_37_ID],
    );
    const source = rowsOf(sourceRows)[0];
    if (!source) throw new Error('分红记录不存在或已被直接撤回');
    if (Number(source.reversal_of_id || 0) > 0) throw new Error('冲正分红不能再次撤回');
    if (!source.wallet_request_id || !source.wallet_entry_id) throw new Error('该笔分红没有关联钱包入账，仍可使用原编辑或删除功能');

    const [existingAuditRows] = await transaction.execute(
      `SELECT id FROM ledger37_wallet_action_reversals
       WHERE action_kind = 'dividend' AND source_record_id = ? LIMIT 1 FOR UPDATE`,
      [params.recordId],
    );
    if (rowsOf(existingAuditRows)[0]) throw new Error('该笔分红已经撤回或冲正，请刷新后核对');

    const assetCode = normalizeLedger37WalletAsset(source.asset_code || 'CNY');
    const assetAmount = decimalText(String(source.asset_amount ?? source.amount ?? ''));
    const cnyAmount = Math.abs(Number(source.amount || 0));
    if (!(cnyAmount > 0)) throw new Error('原分红人民币估值无效，不能撤回');
    const sourceUserId = Number(source.user_id);
    const sourceWalletEntryId = Number(source.wallet_entry_id);
    const requestId = buildRequestId(params.mode === 'reverse' ? 'DR' : 'DD');
    const reversalNo = `V37${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`;
    let reversalWalletEntryId: number | null = null;
    let reversalRecordId: number | undefined;
    let reversalWalletBalanceSnapshot: Ledger37WalletBalanceSnapshot | null = null;

    if (params.mode === 'reverse') {
      if (isFundingAsset(assetCode)) {
        const funding = await getFundingBalanceForUpdate(transaction, sourceUserId, assetCode);
        if (Number(assetAmount) > funding.available + 1e-8) {
          throw new Error(`${assetCode} 当前可用余额不足，不能为该笔分红写入冲正`);
        }
      }
      const reversalNote = source.note ? `冲正原分红#${params.recordId} · ${String(source.note).trim()}` : `冲正原分红#${params.recordId}`;
      const [reversalInsert] = await transaction.execute(
        `INSERT INTO dividend_records
          (ledger_id, user_id, tag_name, amount, asset_code, asset_amount, note, wallet_request_id, reversal_of_id, reversal_mode)
         VALUES (?, ?, ?, CAST(? AS DECIMAL(18,2)), ?, CAST(? AS DECIMAL(36,18)), ?, ?, ?, 'reverse')`,
        [LEDGER_37_ID, sourceUserId, String(source.tag_name), -cnyAmount, assetCode, `-${assetAmount}`, reversalNote.slice(0, 255), requestId, params.recordId],
      );
      reversalRecordId = Number((reversalInsert as any).insertId);
      if (isFundingAsset(assetCode)) {
        reversalWalletEntryId = await writeFundingDividend(transaction, {
          userId: sourceUserId,
          assetCode,
          amount: `-${assetAmount}`,
          tagName: String(source.tag_name),
          note: reversalNote,
          kind: 'reversal',
        });
      } else {
        const debit = await dbMultiAssetWallet.adjustMultiAssetBalance({
          userId: sourceUserId,
          assetCode,
          amount: `-${assetAmount}`,
          note: `股票分红冲正 · ${String(source.tag_name)} · 原分红#${params.recordId}`,
          requestId: `${requestId}_ASSET`,
          actorUserId: params.actorUserId,
          sourceLedgerId: LEDGER_37_ID,
          eventType: 'ledger_dividend_reversal',
          transaction,
        });
        reversalWalletEntryId = Number(debit.entry.id);
      }
      reversalWalletBalanceSnapshot = await getLedger37DividendWalletSnapshot(transaction, sourceUserId, assetCode);
      await transaction.execute(
        'UPDATE dividend_records SET wallet_entry_id = ?, wallet_snapshot_json = ? WHERE id = ?',
        [reversalWalletEntryId, JSON.stringify(reversalWalletBalanceSnapshot), reversalRecordId],
      );
    } else {
      if (isFundingAsset(assetCode)) {
        const [walletRows] = await transaction.execute(
          `SELECT id FROM af_manual_balances
           WHERE id = ? AND ledger_id = ? AND user_id = ? AND amount > 0
             AND COALESCE(note, '') LIKE '%股票分红%'
           LIMIT 1 FOR UPDATE`,
          [sourceWalletEntryId, LEDGER_37_ID, sourceUserId],
        );
        if (!rowsOf(walletRows)[0]) throw new Error('未找到原分红钱包流水，已阻止直接撤回');
        const funding = await getFundingBalanceForUpdate(transaction, sourceUserId, assetCode);
        if (Number(assetAmount) > funding.available + 1e-8) {
          throw new Error(`${assetCode} 当前可用余额不足，不能直接撤回原分红；请待资金回到可用余额后重试`);
        }
        await transaction.execute('DELETE FROM af_manual_balances WHERE id = ? LIMIT 1', [sourceWalletEntryId]);
      } else {
        const [walletRows] = await transaction.execute(
          `SELECT id FROM ai_wallet_asset_entries
           WHERE id = ? AND user_id = ? AND asset_code = ? AND amount > 0
             AND source_ledger_id = ? AND event_type = 'ledger_dividend'
           LIMIT 1 FOR UPDATE`,
          [sourceWalletEntryId, sourceUserId, assetCode, LEDGER_37_ID],
        );
        if (!rowsOf(walletRows)[0]) throw new Error('未找到原分红数字资产流水，已阻止直接撤回');
        const debit = await dbMultiAssetWallet.adjustMultiAssetBalance({
          userId: sourceUserId,
          assetCode,
          amount: `-${assetAmount}`,
          note: `临时撤回分红#${params.recordId}`,
          requestId: `${requestId}_ASSET`,
          actorUserId: params.actorUserId,
          sourceLedgerId: LEDGER_37_ID,
          eventType: 'ledger_dividend_reversal',
          transaction,
        });
        // 直接撤回语义是移除原流水；余额已由上面的受控负向调整恢复，临时审计流水也一并删除。
        await transaction.execute('DELETE FROM ai_wallet_asset_entries WHERE id IN (?, ?)', [sourceWalletEntryId, Number(debit.entry.id)]);
      }
      await transaction.execute('DELETE FROM dividend_records WHERE id = ? AND ledger_id = ? LIMIT 1', [params.recordId, LEDGER_37_ID]);
    }

    await transaction.execute(
      `INSERT INTO ledger37_wallet_action_reversals
        (reversal_no, request_id, action_kind, source_record_id, mode, user_id, asset_code, amount, source_wallet_entry_id, reversal_wallet_entry_id, actor_user_id, detail_json)
       VALUES (?, ?, 'dividend', ?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), ?, ?, ?, ?)`,
      [reversalNo, requestId, params.recordId, params.mode, sourceUserId, assetCode, assetAmount, sourceWalletEntryId, reversalWalletEntryId, params.actorUserId, JSON.stringify({ tagName: String(source.tag_name), reversalRecordId: reversalRecordId ?? null })],
    );
    if (ownConnection) await transaction.commit();
    return { mode: params.mode, sourceRecordId: params.recordId, reversalRecordId, assetCode, assetAmount };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

/** 撤回一笔“保证金解冻回退”，重新将等额资金冻结至原标签。 */
export async function revokeLedger37WalletHoldRelease(params: {
  releaseNo: string;
  mode: Ledger37RevokeMode;
  actorUserId: number;
  transaction?: any;
}): Promise<{ mode: Ledger37RevokeMode; sourceReleaseNo: string; reversalNo?: string; hold: Ledger37WalletHold; amount: string }> {
  await ensureLedger37WalletInfrastructure();
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error('数据库连接失败');
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [releaseRows] = await transaction.execute(
      `SELECT r.*, h.ledger_id, h.user_id, h.tag_name, h.asset_code, h.amount AS hold_amount,
              h.released_amount, h.status AS hold_status
         FROM ai_wallet_project_hold_releases r
         INNER JOIN ai_wallet_project_holds h ON h.id = r.hold_id
        WHERE r.release_no = ? AND h.ledger_id = ?
        LIMIT 1 FOR UPDATE`,
      [params.releaseNo, LEDGER_37_ID],
    );
    const release = rowsOf(releaseRows)[0];
    if (!release) throw new Error('保证金回退记录不存在或已被直接撤回');
    if (String(release.entry_kind || 'release') !== 'release' || String(release.status || 'active') !== 'active') {
      throw new Error('该保证金回退已经撤回或冲正，请刷新后核对');
    }
    const assetCode = normalizeLedger37WalletAsset(release.asset_code);
    const amount = decimalText(String(release.amount));
    const sourceUserId = Number(release.user_id);
    const heldAmount = Number(release.hold_amount || 0);
    const releasedAmount = Number(release.released_amount || 0);
    if (releasedAmount + 1e-8 < Number(amount)) throw new Error('当前冻结台账与回退记录不一致，已阻止撤回');

    const requestId = buildRequestId(params.mode === 'reverse' ? 'HR' : 'HD');
    if (isFundingAsset(assetCode)) {
      const funding = await getFundingBalanceForUpdate(transaction, sourceUserId, assetCode);
      if (Number(amount) > funding.available + 1e-8) {
        throw new Error(`${assetCode} 当前可用余额不足，不能撤回该笔保证金回退`);
      }
    } else {
      await dbMultiAssetWallet.moveMultiAssetBalanceToFrozen({
        userId: sourceUserId,
        assetCode,
        amount,
        direction: 'freeze',
        note: `保证金解冻冲正 · ${String(release.tag_name)}`,
        requestId: `${requestId}_ASSET`,
        actorUserId: params.actorUserId,
        sourceLedgerId: LEDGER_37_ID,
        transaction,
      });
    }

    const nextReleased = Math.max(0, releasedAmount - Number(amount));
    await transaction.execute(
      `UPDATE ai_wallet_project_holds
          SET released_amount = CAST(? AS DECIMAL(36,18)), status = 'active', updated_at = NOW()
        WHERE id = ?`,
      [nextReleased.toFixed(18), Number(release.hold_id)],
    );

    let reversalNo: string | undefined;
    if (params.mode === 'delete') {
      await transaction.execute('DELETE FROM ai_wallet_project_hold_releases WHERE id = ? LIMIT 1', [Number(release.id)]);
    } else {
      reversalNo = `V37${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`;
      const reversalRequestId = buildRequestId('HV');
      await transaction.execute(
        `UPDATE ai_wallet_project_hold_releases
            SET status = 'reversed', reversed_by = ?, reversed_at = NOW()
          WHERE id = ?`,
        [params.actorUserId, Number(release.id)],
      );
      await transaction.execute(
        `INSERT INTO ai_wallet_project_hold_releases
          (release_no, request_id, hold_id, amount, entry_kind, status, reversal_of_id, released_by)
         VALUES (?, ?, ?, CAST(? AS DECIMAL(36,18)), 'reversal', 'active', ?, ?)`,
        [reversalNo, reversalRequestId, Number(release.hold_id), amount, Number(release.id), params.actorUserId],
      );
    }
    const [holdRows] = await transaction.execute('SELECT * FROM ai_wallet_project_holds WHERE id = ? LIMIT 1', [Number(release.hold_id)]);
    const hold = holdResult(rowsOf(holdRows)[0]);
    if (ownConnection) await transaction.commit();
    return { mode: params.mode, sourceReleaseNo: params.releaseNo, reversalNo, hold, amount };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}
