import { randomInt } from "crypto";
import { AI_WALLET_ASSET_CATALOG, AI_WALLET_SETTLEMENT_ASSETS, type AiWalletAsset } from "../shared/ai-wallet-assets";
import { getDbConnection, getDbTransactionConnection } from "./db";

/**
 * 第二阶段多资产钱包账本。
 *
 * CNY / USDT 继续使用历史兼容余额模型；本模块只处理已经纳入 52 号行情库的
 * 其他数字资产。每种资产各自独立记账，绝不折算、混写或用实时价格改变余额。
 */
export const MULTI_ASSET_WALLET_ASSETS = AI_WALLET_SETTLEMENT_ASSETS;
export type MultiAssetWalletAsset = (typeof MULTI_ASSET_WALLET_ASSETS)[number];

export type MultiAssetBalance = {
  assetCode: MultiAssetWalletAsset;
  assetName: string;
  availableBalance: string;
  frozenBalance: string;
  totalBalance: string;
  updatedAt: string;
};

export type MultiAssetHistoryItem = {
  id: number;
  entryNo: string;
  requestId: string;
  assetCode: MultiAssetWalletAsset;
  assetName: string;
  amount: string;
  balanceAfter: string;
  eventType: "admin_adjustment" | "transfer_in" | "transfer_out" | "collateral_lock" | "collateral_release";
  note: string;
  sourceLedgerId: number | null;
  /** 对手方仅在站内转账流水中返回，用于把“转给谁/谁转入”放在预览首行。 */
  counterpartyName: string | null;
  transferNo: string | null;
  createdAt: string;
};

export type WalletCollateralAssetInput = {
  coin: string;
  qty: string;
};

export type WalletCollateralLock = {
  id: number;
  ledgerId: number;
  orderId: number;
  userId: number;
  assetCode: MultiAssetWalletAsset;
  amount: string;
  status: "active" | "released";
};

const DECIMAL_PATTERN = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/;
const SIGNED_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;

let multiAssetWalletInfrastructureReady: Promise<void> | null = null;

function asRows(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function getAssetName(assetCode: MultiAssetWalletAsset): string {
  return AI_WALLET_ASSET_CATALOG.find((asset) => asset.code === assetCode)?.name || assetCode;
}

export function normalizeMultiAssetWalletAsset(value: unknown): MultiAssetWalletAsset {
  const assetCode = String(value || "").trim().toUpperCase();
  if (!(MULTI_ASSET_WALLET_ASSETS as readonly string[]).includes(assetCode)) {
    throw new Error("该资产尚未启用独立钱包账本；CNY 与 USDT 请继续使用现有账户");
  }
  return assetCode as MultiAssetWalletAsset;
}

function normalizeUnsignedDecimal(value: string): string {
  const input = String(value ?? "").trim();
  if (!DECIMAL_PATTERN.test(input)) throw new Error("金额格式无效，最多支持 18 位小数");
  const normalized = input.replace(/^0+(?=\d)/, "");
  if (Number(normalized) <= 0) throw new Error("金额必须大于 0");
  return normalized;
}

function normalizeSignedDecimal(value: string): string {
  const input = String(value ?? "").trim();
  if (!SIGNED_DECIMAL_PATTERN.test(input)) throw new Error("金额格式无效，最多支持 18 位小数");
  const negative = input.startsWith("-");
  const positive = normalizeUnsignedDecimal(negative ? input.slice(1) : input);
  return negative ? `-${positive}` : positive;
}

function buildEntryNo(): string {
  return `WAE${Date.now().toString(36).toUpperCase()}${randomInt(100_000, 999_999)}`;
}

function buildTransferNo(): string {
  return `WAT${Date.now().toString(36).toUpperCase()}${randomInt(100_000, 999_999)}`;
}

function buildCollateralRequestId(): string {
  return `WCL${Date.now().toString(36).toUpperCase()}${randomInt(100_000, 999_999)}`;
}

function entryResult(row: any): MultiAssetHistoryItem {
  const assetCode = normalizeMultiAssetWalletAsset(row.asset_code);
  const eventType = String(row.event_type);
  const isTransfer = eventType === "transfer_in" || eventType === "transfer_out";
  const counterpartyName = isTransfer
    ? String(eventType === "transfer_out"
      ? (row.recipient_name || row.recipient_username || "")
      : (row.sender_name || row.sender_username || "")).trim() || null
    : null;
  return {
    id: Number(row.id),
    entryNo: String(row.entry_no),
    requestId: String(row.request_id),
    assetCode,
    assetName: getAssetName(assetCode),
    amount: String(row.amount),
    balanceAfter: String(row.balance_after),
    eventType: eventType === "transfer_in" || eventType === "transfer_out" || eventType === "collateral_lock" || eventType === "collateral_release"
      ? eventType
      : "admin_adjustment",
    note: String(row.note || ""),
    sourceLedgerId: row.source_ledger_id == null ? null : Number(row.source_ledger_id),
    counterpartyName,
    transferNo: row.transfer_no ? String(row.transfer_no) : null,
    createdAt: row.created_at ? String(row.created_at) : "",
  };
}

export async function ensureMultiAssetWalletInfrastructure(): Promise<void> {
  if (!multiAssetWalletInfrastructureReady) {
    multiAssetWalletInfrastructureReady = (async () => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败，无法初始化多资产钱包账本");
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ai_wallet_asset_balances (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id INT NOT NULL,
          asset_code VARCHAR(16) NOT NULL,
          available_balance DECIMAL(36,18) NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_ai_wallet_asset_balance_user_asset (user_id, asset_code),
          KEY idx_ai_wallet_asset_balance_asset (asset_code),
          KEY idx_ai_wallet_asset_balance_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI智能钱包多资产当前余额；不含CNY与USDT历史余额'
      `, []);
      const [balanceColumns] = await (conn as any).execute(`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'ai_wallet_asset_balances'
      `, []) as any[];
      const hasFrozenBalance = asRows(balanceColumns).some((row) => String(row.column_name || row.COLUMN_NAME) === 'frozen_balance');
      if (!hasFrozenBalance) {
        try {
          await (conn as any).execute(`ALTER TABLE ai_wallet_asset_balances ADD COLUMN frozen_balance DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER available_balance`, []);
        } catch (error: any) {
          if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
        }
      }
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ai_wallet_asset_entries (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          entry_no VARCHAR(48) NOT NULL,
          request_id VARCHAR(112) NOT NULL,
          user_id INT NOT NULL,
          asset_code VARCHAR(16) NOT NULL,
          amount DECIMAL(36,18) NOT NULL,
          balance_after DECIMAL(36,18) NOT NULL,
          event_type VARCHAR(32) NOT NULL,
          note VARCHAR(500) NOT NULL DEFAULT '',
          source_ledger_id INT NULL,
          related_transfer_id BIGINT UNSIGNED NULL,
          actor_user_id INT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_ai_wallet_asset_entry_no (entry_no),
          UNIQUE KEY uk_ai_wallet_asset_entry_request (user_id, request_id),
          KEY idx_ai_wallet_asset_entry_user_time (user_id, created_at),
          KEY idx_ai_wallet_asset_entry_asset_time (asset_code, created_at),
          KEY idx_ai_wallet_asset_entry_transfer (related_transfer_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI智能钱包多资产不可变流水'
      `, []);
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ai_wallet_asset_transfers (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          transfer_no VARCHAR(48) NOT NULL,
          request_id VARCHAR(96) NOT NULL,
          from_user_id INT NOT NULL,
          to_user_id INT NOT NULL,
          asset_code VARCHAR(16) NOT NULL,
          amount DECIMAL(36,18) NOT NULL,
          source_ledger_id INT NULL,
          from_entry_id BIGINT UNSIGNED NULL,
          to_entry_id BIGINT UNSIGNED NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_ai_wallet_asset_transfer_no (transfer_no),
          UNIQUE KEY uk_ai_wallet_asset_transfer_request (request_id),
          KEY idx_ai_wallet_asset_transfer_from_time (from_user_id, created_at),
          KEY idx_ai_wallet_asset_transfer_to_time (to_user_id, created_at),
          KEY idx_ai_wallet_asset_transfer_asset (asset_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI智能钱包多资产站内转账主记录'
      `, []);
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ai_wallet_asset_collateral_locks (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          ledger_id INT NOT NULL,
          order_id BIGINT UNSIGNED NOT NULL,
          user_id INT NOT NULL,
          asset_code VARCHAR(16) NOT NULL,
          amount DECIMAL(36,18) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          created_by INT NULL,
          released_by INT NULL,
          released_reason VARCHAR(64) NULL,
          released_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_wallet_collateral_active_order_asset (ledger_id, order_id, user_id, asset_code),
          KEY idx_wallet_collateral_user_asset_status (user_id, asset_code, status),
          KEY idx_wallet_collateral_order_status (ledger_id, order_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='52号融资订单的钱包数字资产担保冻结；余额不扣除，仅限制可用额'
      `, []);
      // 兼容首版预览中已存在但缺少账本归属列的冻结表；查询前必须补齐，
      // 否则钱包担保页会因 WHERE ledger_id 直接报错，且绝不能把不同账本的锁混在一起。
      const [lockColumns] = await (conn as any).execute(`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'ai_wallet_asset_collateral_locks'
      `, []) as any[];
      const hasLockLedgerId = asRows(lockColumns).some((row) => String(row.column_name || row.COLUMN_NAME) === 'ledger_id');
      if (!hasLockLedgerId) {
        try {
          await (conn as any).execute(`ALTER TABLE ai_wallet_asset_collateral_locks ADD COLUMN ledger_id INT NOT NULL DEFAULT 52 AFTER id`, []);
        } catch (error: any) {
          if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
        }
      }
    })().catch((error) => {
      multiAssetWalletInfrastructureReady = null;
      throw error;
    });
  }
  await multiAssetWalletInfrastructureReady;
}

async function ensureBalanceRow(transaction: any, userId: number, assetCode: MultiAssetWalletAsset) {
  await transaction.execute(
    `INSERT INTO ai_wallet_asset_balances (user_id, asset_code, available_balance)
     VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE updated_at = updated_at`,
    [userId, assetCode],
  );
}

async function getLockedBalance(transaction: any, userId: number, assetCode: MultiAssetWalletAsset) {
  const [rows] = await transaction.execute(
    `SELECT id, available_balance, frozen_balance
       FROM ai_wallet_asset_balances
      WHERE user_id = ? AND asset_code = ?
      LIMIT 1 FOR UPDATE`,
    [userId, assetCode],
  );
  const row = asRows(rows)[0];
  if (!row) throw new Error("资产余额初始化失败");
  return row;
}

async function assertUserExists(transaction: any, userId: number) {
  const [rows] = await transaction.execute(`SELECT id FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (!asRows(rows)[0]) throw new Error("目标用户不存在");
}

export async function getUserMultiAssetBalances(userId: number): Promise<MultiAssetBalance[]> {
  await ensureMultiAssetWalletInfrastructure();
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接失败");
  const [rows] = await (conn as any).execute(
    `SELECT asset_code, available_balance, frozen_balance,
            CAST(available_balance + frozen_balance AS CHAR) AS total_balance,
            updated_at
       FROM ai_wallet_asset_balances
      WHERE user_id = ? AND (available_balance <> 0 OR frozen_balance <> 0)
      ORDER BY updated_at DESC, asset_code ASC`,
    [userId],
  );
  return asRows(rows).map((row) => {
    const assetCode = normalizeMultiAssetWalletAsset(row.asset_code);
    return {
      assetCode,
      assetName: getAssetName(assetCode),
      availableBalance: String(row.available_balance),
      frozenBalance: String(row.frozen_balance ?? 0),
      totalBalance: String(row.total_balance ?? row.available_balance),
      updatedAt: row.updated_at ? String(row.updated_at) : "",
    };
  });
}

export async function getMultiAssetBalancesForUsers(userIds: number[]): Promise<Map<number, MultiAssetBalance[]>> {
  await ensureMultiAssetWalletInfrastructure();
  const ids = Array.from(new Set(userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  const result = new Map<number, MultiAssetBalance[]>();
  if (ids.length === 0) return result;
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接失败");
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await (conn as any).execute(
    `SELECT user_id, asset_code, available_balance, frozen_balance,
            CAST(available_balance + frozen_balance AS CHAR) AS total_balance,
            updated_at
       FROM ai_wallet_asset_balances
      WHERE user_id IN (${placeholders}) AND (available_balance <> 0 OR frozen_balance <> 0)
      ORDER BY updated_at DESC, asset_code ASC`,
    ids,
  );
  for (const row of asRows(rows)) {
    const userId = Number(row.user_id);
    const assetCode = normalizeMultiAssetWalletAsset(row.asset_code);
    const next = result.get(userId) || [];
    next.push({
      assetCode,
      assetName: getAssetName(assetCode),
      availableBalance: String(row.available_balance),
      frozenBalance: String(row.frozen_balance ?? 0),
      totalBalance: String(row.total_balance ?? row.available_balance),
      updatedAt: row.updated_at ? String(row.updated_at) : "",
    });
    result.set(userId, next);
  }
  return result;
}

export async function getUserMultiAssetHistory(userId: number, limit = 20): Promise<MultiAssetHistoryItem[]> {
  await ensureMultiAssetWalletInfrastructure();
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接失败");
  // 总览只取最近流水；完整明细页可读取更长的只读审计窗口。
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const [rows] = await (conn as any).execute(
    `SELECT entry.id, entry.entry_no, entry.request_id, entry.asset_code, entry.amount, entry.balance_after,
            entry.event_type, entry.note, entry.source_ledger_id, entry.created_at,
            transfer.transfer_no,
            sender.name AS sender_name, sender.username AS sender_username,
            recipient.name AS recipient_name, recipient.username AS recipient_username
       FROM ai_wallet_asset_entries entry
       LEFT JOIN ai_wallet_asset_transfers transfer ON transfer.id = entry.related_transfer_id
       LEFT JOIN users sender ON sender.id = transfer.from_user_id
       LEFT JOIN users recipient ON recipient.id = transfer.to_user_id
      WHERE entry.user_id = ?
      ORDER BY entry.created_at DESC, entry.id DESC
      LIMIT ${safeLimit}`,
    [userId],
  );
  return asRows(rows).map(entryResult);
}

export async function adjustMultiAssetBalance(params: {
  userId: number;
  assetCode: MultiAssetWalletAsset | string;
  amount: string;
  note?: string;
  requestId: string;
  actorUserId: number;
  sourceLedgerId?: number;
}): Promise<{ success: true; entry: MultiAssetHistoryItem; alreadyCompleted: boolean }> {
  if (!Number.isInteger(params.userId) || params.userId <= 0) throw new Error("调账用户无效");
  if (!REQUEST_ID_PATTERN.test(params.requestId)) throw new Error("调账请求无效");
  const assetCode = normalizeMultiAssetWalletAsset(params.assetCode);
  const amount = normalizeSignedDecimal(params.amount);
  const note = String(params.note || "").trim().slice(0, 500) || "管理员手动调账（未填写备注）";
  await ensureMultiAssetWalletInfrastructure();

  const conn = await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接失败");
  const transaction = conn as any;
  try {
    await transaction.beginTransaction();
    const [existingRows] = await transaction.execute(
      `SELECT id, entry_no, request_id, asset_code, amount, balance_after, event_type, note, source_ledger_id, created_at
         FROM ai_wallet_asset_entries
        WHERE user_id = ? AND request_id = ?
        LIMIT 1 FOR UPDATE`,
      [params.userId, params.requestId],
    );
    const existing = asRows(existingRows)[0];
    if (existing) {
      if (String(existing.asset_code).toUpperCase() !== assetCode || String(existing.amount) !== amount) {
        throw new Error("调账请求已被使用，请刷新后重新填写金额");
      }
      await transaction.commit();
      return { success: true, entry: entryResult(existing), alreadyCompleted: true };
    }

    await assertUserExists(transaction, params.userId);
    await ensureBalanceRow(transaction, params.userId, assetCode);
    await getLockedBalance(transaction, params.userId, assetCode);
    const [updateResult] = await transaction.execute(
      `UPDATE ai_wallet_asset_balances
          SET available_balance = available_balance + CAST(? AS DECIMAL(36,18)), updated_at = NOW()
        WHERE user_id = ? AND asset_code = ?
          AND available_balance + CAST(? AS DECIMAL(36,18)) >= 0`,
      [amount, params.userId, assetCode, amount],
    );
    if (Number((updateResult as any).affectedRows || 0) !== 1) {
      throw new Error("扣除金额超过该资产可用余额，不能形成负数余额");
    }
    const balanceRow = await getLockedBalance(transaction, params.userId, assetCode);
    const entryNo = buildEntryNo();
    const [entryInsert] = await transaction.execute(
      `INSERT INTO ai_wallet_asset_entries
        (entry_no, request_id, user_id, asset_code, amount, balance_after, event_type, note, source_ledger_id, actor_user_id)
       VALUES (?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), ?, 'admin_adjustment', ?, ?, ?)`,
      [entryNo, params.requestId, params.userId, assetCode, amount, String(balanceRow.available_balance), note, params.sourceLedgerId ?? null, params.actorUserId],
    );
    const entry = {
      id: Number((entryInsert as any).insertId),
      entry_no: entryNo,
      request_id: params.requestId,
      asset_code: assetCode,
      amount,
      balance_after: String(balanceRow.available_balance),
      event_type: "admin_adjustment",
      note,
      source_ledger_id: params.sourceLedgerId ?? null,
      created_at: new Date().toISOString(),
    };
    await transaction.commit();
    return { success: true, entry: entryResult(entry), alreadyCompleted: false };
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    transaction.release?.();
  }
}

function normalizeWalletDecimal(value: unknown): string {
  const input = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(input)) throw new Error("担保数量格式无效，最多支持 18 位小数");
  const [integerPart, fractionalPart = ""] = input.split(".");
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fractionalPart.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
}

function compareWalletDecimals(left: string, right: string): number {
  const [leftInteger, leftFraction = ""] = normalizeWalletDecimal(left).split(".");
  const [rightInteger, rightFraction = ""] = normalizeWalletDecimal(right).split(".");
  if (leftInteger.length !== rightInteger.length) return leftInteger.length > rightInteger.length ? 1 : -1;
  if (leftInteger !== rightInteger) return leftInteger > rightInteger ? 1 : -1;
  const paddedLeft = leftFraction.padEnd(18, "0");
  const paddedRight = rightFraction.padEnd(18, "0");
  if (paddedLeft === paddedRight) return 0;
  return paddedLeft > paddedRight ? 1 : -1;
}

function subtractWalletDecimals(larger: string, smaller: string): string {
  if (compareWalletDecimals(larger, smaller) < 0) throw new Error("担保数量不能为负数");
  const [largeInteger, largeFraction = ""] = normalizeWalletDecimal(larger).split(".");
  const [smallInteger, smallFraction = ""] = normalizeWalletDecimal(smaller).split(".");
  const left = `${largeInteger}${largeFraction.padEnd(18, "0")}`.padStart(36, "0");
  const right = `${smallInteger}${smallFraction.padEnd(18, "0")}`.padStart(36, "0");
  let borrow = 0;
  let output = "";
  for (let index = left.length - 1; index >= 0; index -= 1) {
    let digit = Number(left[index]) - borrow - Number(right[index]);
    if (digit < 0) { digit += 10; borrow = 1; } else borrow = 0;
    output = String(digit) + output;
  }
  const integerPart = output.slice(0, -18).replace(/^0+(?=\d)/, "") || "0";
  const fractionalPart = output.slice(-18).replace(/0+$/, "");
  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
}

function normalizeWalletCollateralAssets(items: WalletCollateralAssetInput[]): Array<{ assetCode: MultiAssetWalletAsset; amount: string }> {
  const seen = new Set<string>();
  return items.map((item) => {
    const assetCode = normalizeMultiAssetWalletAsset(item.coin);
    if (seen.has(assetCode)) throw new Error(`同一币种只能作为一条钱包担保物：${assetCode}`);
    seen.add(assetCode);
    const amount = normalizeWalletDecimal(item.qty);
    if (compareWalletDecimals(amount, "0") <= 0) throw new Error(`${assetCode} 担保数量必须大于 0`);
    return { assetCode, amount };
  }).sort((left, right) => left.assetCode.localeCompare(right.assetCode));
}

async function appendCollateralEntry(transaction: any, params: {
  userId: number;
  assetCode: MultiAssetWalletAsset;
  amount: string;
  balanceAfter: string;
  eventType: "collateral_lock" | "collateral_release";
  ledgerId: number;
  orderId: number;
  actorUserId: number;
  requestId: string;
}) {
  const entryNo = buildEntryNo();
  const actionLabel = params.eventType === "collateral_lock" ? "担保冻结" : "担保解冻";
  await transaction.execute(
    `INSERT INTO ai_wallet_asset_entries
      (entry_no, request_id, user_id, asset_code, amount, balance_after, event_type, note, source_ledger_id, actor_user_id)
     VALUES (?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), ?, ?, ?, ?, ?)`,
    [
      entryNo,
      params.requestId,
      params.userId,
      params.assetCode,
      params.amount,
      params.balanceAfter,
      params.eventType,
      `${actionLabel}：52号融资订单 #${params.orderId}`,
      params.ledgerId,
      params.actorUserId,
    ],
  );
}

/**
 * 将一张52号融资订单的钱包担保同步为目标数量。
 * 仅在可用余额与冻结余额之间搬移，不会改变用户的总持币；同一币种不能同时锁给另一张订单。
 * 传入 transaction 时由调用方与订单更新共用同一事务，避免出现订单已保存、担保未冻结的状态。
 */
export async function syncWalletCollateralLocks(params: {
  ledgerId: number;
  orderId: number;
  userId: number;
  assets: WalletCollateralAssetInput[];
  actorUserId: number;
  transaction?: any;
}): Promise<{ locks: WalletCollateralLock[] }> {
  if (params.ledgerId !== 52) throw new Error("钱包担保冻结仅支持 52 号账本");
  if (!Number.isInteger(params.orderId) || params.orderId <= 0 || !Number.isInteger(params.userId) || params.userId <= 0) {
    throw new Error("订单或担保用户无效");
  }
  const desiredAssets = normalizeWalletCollateralAssets(params.assets || []);
  await ensureMultiAssetWalletInfrastructure();
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接失败");
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    await assertUserExists(transaction, params.userId);
    const [lockRows] = await transaction.execute(
      `SELECT id, asset_code, amount, status
         FROM ai_wallet_asset_collateral_locks
        WHERE ledger_id = ? AND order_id = ? AND user_id = ?
        FOR UPDATE`,
      [params.ledgerId, params.orderId, params.userId],
    );
    const existingByAsset = new Map<string, any>();
    for (const row of asRows(lockRows)) existingByAsset.set(String(row.asset_code).toUpperCase(), row);
    const desiredByAsset = new Map(desiredAssets.map((item) => [item.assetCode, item]));
    const assetCodes = Array.from(new Set(Array.from(existingByAsset.keys()).concat(Array.from(desiredByAsset.keys()))))
      .map((asset) => normalizeMultiAssetWalletAsset(asset))
      .sort();

    for (const assetCode of assetCodes) await ensureBalanceRow(transaction, params.userId, assetCode);
    for (const assetCode of assetCodes) await getLockedBalance(transaction, params.userId, assetCode);

    for (const assetCode of assetCodes) {
      const existing = existingByAsset.get(assetCode);
      const currentAmount = existing && String(existing.status) === "active" ? normalizeWalletDecimal(existing.amount) : "0";
      const desiredAmount = desiredByAsset.has(assetCode) ? normalizeWalletDecimal(desiredByAsset.get(assetCode)!.amount) : "0";
      const comparison = compareWalletDecimals(desiredAmount, currentAmount);
      if (comparison > 0) {
        const deltaText = subtractWalletDecimals(desiredAmount, currentAmount);
        const [result] = await transaction.execute(
          `UPDATE ai_wallet_asset_balances
              SET available_balance = available_balance - CAST(? AS DECIMAL(36,18)),
                  frozen_balance = frozen_balance + CAST(? AS DECIMAL(36,18)),
                  updated_at = NOW()
            WHERE user_id = ? AND asset_code = ?
              AND available_balance >= CAST(? AS DECIMAL(36,18))`,
          [deltaText, deltaText, params.userId, assetCode, deltaText],
        );
        if (Number((result as any).affectedRows || 0) !== 1) throw new Error(`${assetCode} 可用余额不足，无法冻结为担保物`);
        const balance = await getLockedBalance(transaction, params.userId, assetCode);
        await appendCollateralEntry(transaction, {
          userId: params.userId, assetCode, amount: `-${deltaText}`, balanceAfter: String(balance.available_balance),
          eventType: "collateral_lock", ledgerId: params.ledgerId, orderId: params.orderId,
          actorUserId: params.actorUserId, requestId: `${buildCollateralRequestId()}_lock_${assetCode}`,
        });
      } else if (comparison < 0) {
        const releaseText = subtractWalletDecimals(currentAmount, desiredAmount);
        const [result] = await transaction.execute(
          `UPDATE ai_wallet_asset_balances
              SET available_balance = available_balance + CAST(? AS DECIMAL(36,18)),
                  frozen_balance = frozen_balance - CAST(? AS DECIMAL(36,18)),
                  updated_at = NOW()
            WHERE user_id = ? AND asset_code = ?
              AND frozen_balance >= CAST(? AS DECIMAL(36,18))`,
          [releaseText, releaseText, params.userId, assetCode, releaseText],
        );
        if (Number((result as any).affectedRows || 0) !== 1) throw new Error(`${assetCode} 冻结余额异常，无法解除担保`);
        const balance = await getLockedBalance(transaction, params.userId, assetCode);
        await appendCollateralEntry(transaction, {
          userId: params.userId, assetCode, amount: releaseText, balanceAfter: String(balance.available_balance),
          eventType: "collateral_release", ledgerId: params.ledgerId, orderId: params.orderId,
          actorUserId: params.actorUserId, requestId: `${buildCollateralRequestId()}_release_${assetCode}`,
        });
      }

      if (compareWalletDecimals(desiredAmount, "0") > 0) {
        if (existing) {
          await transaction.execute(
            `UPDATE ai_wallet_asset_collateral_locks
                SET amount = CAST(? AS DECIMAL(36,18)), status = 'active', released_by = NULL, released_reason = NULL, released_at = NULL, updated_at = NOW()
              WHERE id = ?`,
            [desiredAmount, Number(existing.id)],
          );
        } else {
          await transaction.execute(
            `INSERT INTO ai_wallet_asset_collateral_locks
              (ledger_id, order_id, user_id, asset_code, amount, status, created_by)
             VALUES (?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), 'active', ?)`,
            [params.ledgerId, params.orderId, params.userId, assetCode, desiredAmount, params.actorUserId],
          );
        }
      } else if (existing && String(existing.status) === "active") {
        await transaction.execute(
          `UPDATE ai_wallet_asset_collateral_locks
              SET status = 'released', released_by = ?, released_reason = 'collateral_changed', released_at = NOW(), updated_at = NOW()
            WHERE id = ?`,
          [params.actorUserId, Number(existing.id)],
        );
      }
    }
    if (ownConnection) await transaction.commit();
    const [finalRows] = await transaction.execute(
      `SELECT id, ledger_id, order_id, user_id, asset_code, amount, status
         FROM ai_wallet_asset_collateral_locks
        WHERE ledger_id = ? AND order_id = ? AND user_id = ? AND status = 'active'
        ORDER BY asset_code ASC`,
      [params.ledgerId, params.orderId, params.userId],
    );
    return {
      locks: asRows(finalRows).map((row) => ({
        id: Number(row.id), ledgerId: Number(row.ledger_id), orderId: Number(row.order_id), userId: Number(row.user_id),
        assetCode: normalizeMultiAssetWalletAsset(row.asset_code), amount: String(row.amount), status: "active" as const,
      })),
    };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

/** 订单结清或移入回收站时释放全部钱包担保，不会改变总持币。 */
export async function releaseWalletCollateralLocksForOrder(params: {
  ledgerId: number;
  orderId: number;
  actorUserId: number;
  reason: "order_settled" | "order_deleted";
  transaction?: any;
}): Promise<{ releasedCount: number }> {
  if (params.ledgerId !== 52) return { releasedCount: 0 };
  await ensureMultiAssetWalletInfrastructure();
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接失败");
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [lockRows] = await transaction.execute(
      `SELECT id, user_id, asset_code, amount
         FROM ai_wallet_asset_collateral_locks
        WHERE ledger_id = ? AND order_id = ? AND status = 'active'
        ORDER BY user_id ASC, asset_code ASC
        FOR UPDATE`,
      [params.ledgerId, params.orderId],
    );
    const locks = asRows(lockRows);
    for (const lock of locks) {
      const userId = Number(lock.user_id);
      const assetCode = normalizeMultiAssetWalletAsset(lock.asset_code);
      const amount = normalizeWalletDecimal(lock.amount);
      await ensureBalanceRow(transaction, userId, assetCode);
      await getLockedBalance(transaction, userId, assetCode);
      const [result] = await transaction.execute(
        `UPDATE ai_wallet_asset_balances
            SET available_balance = available_balance + CAST(? AS DECIMAL(36,18)),
                frozen_balance = frozen_balance - CAST(? AS DECIMAL(36,18)),
                updated_at = NOW()
          WHERE user_id = ? AND asset_code = ?
            AND frozen_balance >= CAST(? AS DECIMAL(36,18))`,
        [amount, amount, userId, assetCode, amount],
      );
      if (Number((result as any).affectedRows || 0) !== 1) throw new Error(`${assetCode} 冻结余额异常，无法随订单解除`);
      const balance = await getLockedBalance(transaction, userId, assetCode);
      await appendCollateralEntry(transaction, {
        userId, assetCode, amount, balanceAfter: String(balance.available_balance), eventType: "collateral_release",
        ledgerId: params.ledgerId, orderId: params.orderId, actorUserId: params.actorUserId,
        requestId: `${buildCollateralRequestId()}_settled_${Number(lock.id)}`,
      });
      await transaction.execute(
        `UPDATE ai_wallet_asset_collateral_locks
            SET status = 'released', released_by = ?, released_reason = ?, released_at = NOW(), updated_at = NOW()
          WHERE id = ?`,
        [params.actorUserId, params.reason, Number(lock.id)],
      );
    }
    if (ownConnection) await transaction.commit();
    return { releasedCount: locks.length };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

export async function getActiveWalletCollateralLocks(ledgerId: number, orderId: number): Promise<WalletCollateralLock[]> {
  await ensureMultiAssetWalletInfrastructure();
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接失败");
  const [rows] = await (conn as any).execute(
    `SELECT id, ledger_id, order_id, user_id, asset_code, amount, status
       FROM ai_wallet_asset_collateral_locks
      WHERE ledger_id = ? AND order_id = ? AND status = 'active'
      ORDER BY user_id ASC, asset_code ASC`,
    [ledgerId, orderId],
  );
  return asRows(rows).map((row) => ({
    id: Number(row.id), ledgerId: Number(row.ledger_id), orderId: Number(row.order_id), userId: Number(row.user_id),
    assetCode: normalizeMultiAssetWalletAsset(row.asset_code), amount: String(row.amount), status: "active" as const,
  }));
}

export async function transferMultiAssetBalance(params: {
  fromUserId: number;
  toUserId: number;
  assetCode: MultiAssetWalletAsset | string;
  amount: string;
  requestId: string;
  sourceLedgerId?: number;
}): Promise<{ success: true; transferNo: string; amount: string; assetCode: MultiAssetWalletAsset; alreadyCompleted: boolean }> {
  if (!Number.isInteger(params.fromUserId) || !Number.isInteger(params.toUserId) || params.fromUserId <= 0 || params.toUserId <= 0 || params.fromUserId === params.toUserId) {
    throw new Error("收款用户无效");
  }
  if (!REQUEST_ID_PATTERN.test(params.requestId)) throw new Error("转账请求无效");
  const assetCode = normalizeMultiAssetWalletAsset(params.assetCode);
  const amount = normalizeUnsignedDecimal(params.amount);
  await ensureMultiAssetWalletInfrastructure();

  const conn = await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接失败");
  const transaction = conn as any;
  try {
    await transaction.beginTransaction();
    const [existingRows] = await transaction.execute(
      `SELECT transfer_no, from_user_id, to_user_id, asset_code, amount
         FROM ai_wallet_asset_transfers WHERE request_id = ? LIMIT 1 FOR UPDATE`,
      [params.requestId],
    );
    const existing = asRows(existingRows)[0];
    if (existing) {
      if (Number(existing.from_user_id) !== params.fromUserId || Number(existing.to_user_id) !== params.toUserId || String(existing.asset_code).toUpperCase() !== assetCode || String(existing.amount) !== amount) {
        throw new Error("转账请求已被使用，请重新核验收款人和金额");
      }
      await transaction.commit();
      return { success: true, transferNo: String(existing.transfer_no), amount: String(existing.amount), assetCode, alreadyCompleted: true };
    }

    const userOrder = [params.fromUserId, params.toUserId].sort((left, right) => left - right);
    const [usersRows] = await transaction.execute(`SELECT id FROM users WHERE id IN (?, ?) ORDER BY id ASC FOR UPDATE`, userOrder);
    if (asRows(usersRows).length !== 2) throw new Error("收款用户不存在");
    await ensureBalanceRow(transaction, params.fromUserId, assetCode);
    await ensureBalanceRow(transaction, params.toUserId, assetCode);
    // 固定用户 ID 顺序锁定两行，避免反向转账产生死锁。
    for (const userId of userOrder) await getLockedBalance(transaction, userId, assetCode);

    const [senderUpdate] = await transaction.execute(
      `UPDATE ai_wallet_asset_balances
          SET available_balance = available_balance - CAST(? AS DECIMAL(36,18)), updated_at = NOW()
        WHERE user_id = ? AND asset_code = ? AND available_balance >= CAST(? AS DECIMAL(36,18))`,
      [amount, params.fromUserId, assetCode, amount],
    );
    if (Number((senderUpdate as any).affectedRows || 0) !== 1) throw new Error("可用余额不足，无法完成转账");
    await transaction.execute(
      `UPDATE ai_wallet_asset_balances
          SET available_balance = available_balance + CAST(? AS DECIMAL(36,18)), updated_at = NOW()
        WHERE user_id = ? AND asset_code = ?`,
      [amount, params.toUserId, assetCode],
    );
    const senderBalance = await getLockedBalance(transaction, params.fromUserId, assetCode);
    const recipientBalance = await getLockedBalance(transaction, params.toUserId, assetCode);
    const transferNo = buildTransferNo();
    const [transferInsert] = await transaction.execute(
      `INSERT INTO ai_wallet_asset_transfers (transfer_no, request_id, from_user_id, to_user_id, asset_code, amount, source_ledger_id)
       VALUES (?, ?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), ?)`,
      [transferNo, params.requestId, params.fromUserId, params.toUserId, assetCode, amount, params.sourceLedgerId ?? null],
    );
    const transferId = Number((transferInsert as any).insertId);
    const transferNote = `站内转账 ${assetCode}；转账编号：${transferNo}`;
    const [senderEntry] = await transaction.execute(
      `INSERT INTO ai_wallet_asset_entries
        (entry_no, request_id, user_id, asset_code, amount, balance_after, event_type, note, source_ledger_id, related_transfer_id)
       VALUES (?, ?, ?, ?, -CAST(? AS DECIMAL(36,18)), ?, 'transfer_out', ?, ?, ?)`,
      [buildEntryNo(), `${params.requestId}_out`, params.fromUserId, assetCode, amount, String(senderBalance.available_balance), transferNote, params.sourceLedgerId ?? null, transferId],
    );
    const [recipientEntry] = await transaction.execute(
      `INSERT INTO ai_wallet_asset_entries
        (entry_no, request_id, user_id, asset_code, amount, balance_after, event_type, note, source_ledger_id, related_transfer_id)
       VALUES (?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), ?, 'transfer_in', ?, ?, ?)`,
      [buildEntryNo(), `${params.requestId}_in`, params.toUserId, assetCode, amount, String(recipientBalance.available_balance), transferNote, params.sourceLedgerId ?? null, transferId],
    );
    await transaction.execute(
      `UPDATE ai_wallet_asset_transfers SET from_entry_id = ?, to_entry_id = ? WHERE id = ?`,
      [Number((senderEntry as any).insertId), Number((recipientEntry as any).insertId), transferId],
    );
    await transaction.commit();
    return { success: true, transferNo, amount, assetCode, alreadyCompleted: false };
  } catch (error: any) {
    try { await transaction.rollback(); } catch {}
    if (String(error?.code || "") === "ER_DUP_ENTRY") {
      const [rows] = await transaction.execute(
        `SELECT transfer_no, from_user_id, to_user_id, asset_code, amount FROM ai_wallet_asset_transfers WHERE request_id = ? LIMIT 1`,
        [params.requestId],
      );
      const existing = asRows(rows)[0];
      if (existing && Number(existing.from_user_id) === params.fromUserId && Number(existing.to_user_id) === params.toUserId && String(existing.asset_code).toUpperCase() === assetCode && String(existing.amount) === amount) {
        return { success: true, transferNo: String(existing.transfer_no), amount: String(existing.amount), assetCode, alreadyCompleted: true };
      }
    }
    throw error;
  } finally {
    transaction.release?.();
  }
}

export function isMultiAssetWalletAsset(value: unknown): value is MultiAssetWalletAsset {
  return (MULTI_ASSET_WALLET_ASSETS as readonly string[]).includes(String(value || "").toUpperCase());
}

export function getMultiAssetWalletAssetDefinition(assetCode: MultiAssetWalletAsset | string) {
  const normalized = normalizeMultiAssetWalletAsset(assetCode);
  return AI_WALLET_ASSET_CATALOG.find((asset) => asset.code === normalized) || { code: normalized as AiWalletAsset, name: normalized };
}
