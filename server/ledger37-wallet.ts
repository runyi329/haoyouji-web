import { randomBytes } from "crypto";
import { getDbConnection, getDbTransactionConnection } from "./db";
import {
  AI_WALLET_CRYPTO_MARKET_ASSETS,
  type AiWalletMarketAsset,
} from "../shared/ai-wallet-assets";
import * as dbMultiAssetWallet from "./db-multi-asset-wallet";

export const LEDGER_37_ID = 37;
export const LEDGER_37_WALLET_OPERATOR_ID = 870413;

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
  cnyValueSnapshot: string | null;
  status: "active" | "released";
  createdAt: string;
  releasedAt: string | null;
};

let infrastructureReady: Promise<void> | null = null;

function rowsOf(result: any): SqlRows {
  if (Array.isArray(result?.[0])) return result[0];
  return Array.isArray(result) ? result : [];
}

function buildRequestId(prefix: string): string {
  return `L37${prefix}${Date.now().toString(36).toUpperCase()}${randomBytes(6).toString("hex").toUpperCase()}`;
}

function decimalText(value: string | number): string {
  const text = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(text) || Number(text) <= 0) {
    throw new Error("金额必须大于0，且最多支持18位小数");
  }
  return text;
}

export function normalizeLedger37WalletAsset(value: unknown): Ledger37WalletAsset {
  const asset = String(value || "").trim().toUpperCase();
  if (asset === "CNY" || asset === "USDT") return asset;
  if ((AI_WALLET_CRYPTO_MARKET_ASSETS as readonly string[]).includes(asset)) {
    return asset as AiWalletMarketAsset as Ledger37WalletAsset;
  }
  throw new Error("37号账本仅支持人民币、USDT与已启用的数字币资产");
}

function isFundingAsset(assetCode: Ledger37WalletAsset): assetCode is "CNY" | "USDT" {
  return assetCode === "CNY" || assetCode === "USDT";
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
      try {
        await (conn as any).execute("ALTER TABLE dividend_records ADD UNIQUE KEY uk_dividend_wallet_request (wallet_request_id)");
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
    "SELECT id, COALESCE(balance, 0) AS balance, COALESCE(balance_cny, 0) AS balance_cny FROM users WHERE id = ? LIMIT 1 FOR UPDATE",
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
    `SELECT COALESCE(SUM(amount), 0) AS frozen FROM ai_wallet_project_holds
      WHERE user_id = ? AND asset_code = ? AND status = 'active' FOR UPDATE`,
    [userId, assetCode],
  );
  const frozen = Number(rowsOf(holdRows)[0]?.frozen || 0);
  const total = Number(assetCode === "CNY" ? user.balance_cny : user.balance) + manual;
  return { total, frozen, available: total - frozen };
}

export async function getLedger37FundingBalanceSummary(userId: number, assetCode: "CNY" | "USDT") {
  await ensureLedger37WalletInfrastructure();
  const conn = await getDbConnection();
  if (!conn) return { total: 0, frozen: 0, available: 0 };
  const [userRows] = await (conn as any).execute(
    "SELECT COALESCE(balance, 0) AS balance, COALESCE(balance_cny, 0) AS balance_cny FROM users WHERE id = ? LIMIT 1",
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
    "SELECT COALESCE(SUM(amount), 0) AS frozen FROM ai_wallet_project_holds WHERE user_id = ? AND asset_code = ? AND status = 'active'",
    [userId, assetCode],
  );
  const total = Number(assetCode === "CNY" ? user.balance_cny : user.balance) + Number(rowsOf(manualRows)[0]?.total || 0);
  const frozen = Number(rowsOf(holdRows)[0]?.frozen || 0);
  return { total, frozen, available: total - frozen };
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
  return {
    id: Number(row.id),
    holdNo: String(row.hold_no),
    ledgerId: Number(row.ledger_id),
    userId: Number(row.user_id),
    tagName: String(row.tag_name),
    assetCode: normalizeLedger37WalletAsset(row.asset_code),
    amount: String(row.amount),
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
  requestId?: string;
  transaction?: any;
}): Promise<{ hold: Ledger37WalletHold; alreadyCompleted: boolean }> {
  await ensureLedger37WalletInfrastructure();
  const assetCode = normalizeLedger37WalletAsset(params.assetCode);
  const amount = decimalText(params.amount);
  const tagName = String(params.tagName || "").trim().slice(0, 160);
  if (!tagName) throw new Error("标签名称不能为空");
  const requestId = params.requestId || buildRequestId("H");
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
      return { hold: holdResult(existing), alreadyCompleted: true };
    }
    const cnyValueSnapshot = await getCnyValue(assetCode, amount);
    if (isFundingAsset(assetCode)) {
      const wallet = await getFundingBalanceForUpdate(transaction, params.userId, assetCode);
      if (Number(amount) > wallet.available + 1e-8) {
        throw new Error(`${assetCode} 可用余额不足；可冻结 ${Math.max(0, wallet.available).toFixed(assetCode === "CNY" ? 2 : 8)} ${assetCode}`);
      }
    } else {
      await dbMultiAssetWallet.moveMultiAssetBalanceToFrozen({
        userId: params.userId,
        assetCode,
        amount,
        direction: "freeze",
        note: `37号账本保证金冻结 · ${tagName}`,
        requestId: `${requestId}_ASSET`,
        actorUserId: params.actorUserId,
        sourceLedgerId: LEDGER_37_ID,
        transaction,
      });
    }
    const holdNo = `H37${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString("hex").toUpperCase()}`;
    const [insert] = await transaction.execute(
      `INSERT INTO ai_wallet_project_holds
        (hold_no, request_id, ledger_id, user_id, tag_name, asset_code, amount, cny_value_snapshot, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), CAST(? AS DECIMAL(36,8)), 'active', ?)`,
      [holdNo, requestId, LEDGER_37_ID, params.userId, tagName, assetCode, amount, cnyValueSnapshot, params.actorUserId],
    );
    const [holdRows] = await transaction.execute("SELECT * FROM ai_wallet_project_holds WHERE id = ? LIMIT 1", [Number((insert as any).insertId)]);
    if (ownConnection) await transaction.commit();
    return { hold: holdResult(rowsOf(holdRows)[0]), alreadyCompleted: false };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}

export async function releaseLedger37WalletHold(params: {
  holdId: number;
  actorUserId: number;
  transaction?: any;
}): Promise<Ledger37WalletHold> {
  await ensureLedger37WalletInfrastructure();
  const ownConnection = !params.transaction;
  const conn = params.transaction || await getDbTransactionConnection();
  if (!conn) throw new Error("数据库连接失败");
  const transaction = conn as any;
  try {
    if (ownConnection) await transaction.beginTransaction();
    const [holdRows] = await transaction.execute(
      "SELECT * FROM ai_wallet_project_holds WHERE id = ? AND ledger_id = ? LIMIT 1 FOR UPDATE",
      [params.holdId, LEDGER_37_ID],
    );
    const hold = rowsOf(holdRows)[0];
    if (!hold) throw new Error("保证金冻结记录不存在");
    if (String(hold.status) !== "active") throw new Error("该保证金已经解冻");
    const assetCode = normalizeLedger37WalletAsset(hold.asset_code);
    const amount = decimalText(String(hold.amount));
    if (!isFundingAsset(assetCode)) {
      await dbMultiAssetWallet.moveMultiAssetBalanceToFrozen({
        userId: Number(hold.user_id), assetCode, amount, direction: "release",
        note: `37号账本保证金解冻 · ${String(hold.tag_name)}`,
        requestId: `${String(hold.request_id)}_RELEASE`, actorUserId: params.actorUserId,
        sourceLedgerId: LEDGER_37_ID, transaction,
      });
    } else {
      // 资金型资产冻结没有改变总额；标记释放即可使该笔金额重新计入可用余额。
      await getFundingBalanceForUpdate(transaction, Number(hold.user_id), assetCode);
    }
    await transaction.execute(
      "UPDATE ai_wallet_project_holds SET status = 'released', released_by = ?, released_reason = 'ledger37_margin_release', released_at = NOW(), updated_at = NOW() WHERE id = ?",
      [params.actorUserId, params.holdId],
    );
    const [releasedRows] = await transaction.execute("SELECT * FROM ai_wallet_project_holds WHERE id = ? LIMIT 1", [params.holdId]);
    if (ownConnection) await transaction.commit();
    return holdResult(rowsOf(releasedRows)[0]);
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
}) {
  await getFundingBalanceForUpdate(transaction, params.userId, params.assetCode);
  const visibleNote = `37号账本分红入账 · ${params.tagName}${params.note ? ` · ${params.note}` : ""}`;
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
}): Promise<{ recordId: number; cnyValue: string; assetCode: Ledger37WalletAsset; assetAmount: string }> {
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
    if (isFundingAsset(assetCode)) {
      walletEntryId = await writeFundingDividend(transaction, { userId: params.userId, assetCode, amount: assetAmount, tagName, note: params.note });
    } else {
      const credit = await dbMultiAssetWallet.adjustMultiAssetBalance({
        userId: params.userId,
        assetCode,
        amount: assetAmount,
        note: `37号账本分红入账 · ${tagName}${params.note ? ` · ${params.note}` : ""}`,
        requestId: `${requestId}_ASSET`,
        actorUserId: params.actorUserId,
        sourceLedgerId: LEDGER_37_ID,
        eventType: "ledger_dividend",
        transaction,
      });
      walletEntryId = Number(credit.entry.id);
    }
    await transaction.execute("UPDATE dividend_records SET wallet_entry_id = ? WHERE id = ?", [walletEntryId, recordId]);
    if (ownConnection) await transaction.commit();
    return { recordId, cnyValue, assetCode, assetAmount };
  } catch (error) {
    if (ownConnection) try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    if (ownConnection) transaction.release?.();
  }
}
