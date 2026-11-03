import { TRPCError } from "@trpc/server";
import { getDbConnection, getDbTransactionConnection } from "./db";

export type WalletFundingAsset = "USDT" | "CNY";
const SCALE = 10n ** 18n;

/** Exact comparison at the hold table's 18-decimal precision; never allow an epsilon overdraft. */
export function fundingUnits(value: unknown): bigint {
  const text = String(value ?? "0").trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,18}))?$/.exec(text);
  if (!match) throw new Error("钱包金额数据无效，已停止扣款");
  const units = BigInt(match[2]) * SCALE + BigInt((match[3] ?? "").padEnd(18, "0"));
  return match[1] ? -units : units;
}

/** Legacy funding ledger persists 8 decimals, including CNY. */
export function fundingAmountText(amount: number): string {
  if (!Number.isFinite(amount)) throw new Error("钱包金额必须为有效数字");
  const text = amount.toFixed(8);
  if (amount !== 0 && fundingUnits(text) === 0n) throw new Error("钱包金额小于最小记账精度");
  return text;
}

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : [];
}

function assertAsset(asset: string): asserts asset is WalletFundingAsset {
  if (asset !== "USDT" && asset !== "CNY") throw new Error("不支持的资金币种");
}

async function lockUser(transaction: any, userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("钱包用户无效");
  const [rows] = await transaction.execute(
    "SELECT id, COALESCE(balance, 0) AS balance, COALESCE(cny_balance, 0) AS cny_balance FROM users WHERE id = ? LIMIT 1 FOR UPDATE",
    [userId],
  );
  const user = rowsOf(rows)[0];
  if (!user) throw new Error("钱包用户不存在");
  return user;
}

/** All callers must use this user lock, also used by 37/52 funding freezes and transfers. */
export async function withGlobalWalletTransaction<T>(
  userId: number,
  work: (transaction: any) => Promise<T>,
): Promise<T> {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new Error("数据库连接失败，未执行钱包扣款");
  const transaction = connection as any;
  try {
    await transaction.beginTransaction();
    // First operation is a current locking read; do not create an older repeatable-read snapshot first.
    await lockUser(transaction, userId);
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original payment error. */ }
    throw error;
  } finally {
    if (typeof transaction.release === "function") transaction.release();
    else if (typeof transaction.end === "function") await transaction.end();
  }
}

export async function assertGlobalWalletDebit(
  transaction: any,
  userId: number,
  assetCode: WalletFundingAsset,
  amount: number,
): Promise<void> {
  assertAsset(assetCode);
  if (!(amount > 0)) throw new Error("钱包扣款金额必须大于0");
  const debit = fundingUnits(fundingAmountText(amount));
  const user = await lockUser(transaction, userId);
  const condition = assetCode === "CNY"
    ? "COALESCE(note, '') LIKE '[CNY]%'"
    : "COALESCE(note, '') NOT LIKE '[CNY]%' AND COALESCE(note, '') NOT LIKE '[BALANCE_BASE]%'";
  // Current locking reads, not a stale aggregate from an earlier transaction snapshot.
  const [manualRows] = await transaction.execute(
    `SELECT amount FROM af_manual_balances WHERE user_id = ? AND ${condition} ORDER BY id FOR UPDATE`,
    [userId],
  );
  const [holdRows] = await transaction.execute(
    "SELECT amount, COALESCE(released_amount, 0) AS released_amount FROM ai_wallet_project_holds WHERE user_id = ? AND asset_code = ? AND status = 'active' ORDER BY id FOR UPDATE",
    [userId, assetCode],
  );
  const manual = rowsOf(manualRows).reduce((sum, row) => sum + fundingUnits(row.amount), 0n);
  const frozen = rowsOf(holdRows).reduce((sum, row) => {
    const amount = fundingUnits(row.amount);
    const released = fundingUnits(row.released_amount);
    if (amount < 0n || released < 0n || released > amount) {
      throw new Error("钱包冻结台账异常，已停止扣款，请联系管理员核对");
    }
    return sum + amount - released;
  }, 0n);
  const total = fundingUnits(assetCode === "CNY" ? user.cny_balance : user.balance) + manual;
  const available = total - frozen;
  if (debit > available) {
    const availableNumber = Math.max(0, Number(available) / Number(SCALE));
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${assetCode === "CNY" ? "人民币" : "USDT"}钱包可用余额不足；可用 ${availableNumber.toFixed(assetCode === "CNY" ? 2 : 8)} ${assetCode}，冻结资金不可用于扣款`,
    });
  }
}

/** UI/preflight only. Actual debit MUST recheck under withGlobalWalletTransaction. Missing schema fails closed. */
export async function getGlobalWalletFundingBalance(
  userId: number,
  assetCode: WalletFundingAsset,
): Promise<{ total: number; frozen: number; available: number }> {
  assertAsset(assetCode);
  const connection = await getDbConnection();
  if (!connection) throw new Error("数据库连接失败，钱包可用余额暂不可用");
  const column = assetCode === "CNY" ? "cny_balance" : "balance";
  const condition = assetCode === "CNY"
    ? "COALESCE(note, '') LIKE '[CNY]%'"
    : "COALESCE(note, '') NOT LIKE '[CNY]%' AND COALESCE(note, '') NOT LIKE '[BALANCE_BASE]%'";
  const [rows] = await (connection as any).execute(
    `SELECT COALESCE(u.${column}, 0) + COALESCE((SELECT SUM(m.amount) FROM af_manual_balances m WHERE m.user_id = u.id AND ${condition}), 0) AS total,
            COALESCE((SELECT SUM(h.amount - COALESCE(h.released_amount, 0)) FROM ai_wallet_project_holds h WHERE h.user_id = u.id AND h.asset_code = ? AND h.status = 'active'), 0) AS frozen
       FROM users u WHERE u.id = ? LIMIT 1`,
    [assetCode, userId],
  );
  const row = rowsOf(rows)[0];
  if (!row) throw new Error("钱包用户不存在");
  const total = Number(row.total);
  const frozen = Number(row.frozen);
  if (!Number.isFinite(total) || !Number.isFinite(frozen) || frozen < 0) throw new Error("钱包余额数据异常");
  return { total, frozen, available: total - frozen };
}

/** Shared marketplace payment primitive: both currencies and order writes share one transaction. */
export async function debitGlobalWallet(params: {
  transaction: any;
  userId: number;
  cnyAmount: number;
  usdtAmount: number;
  note: string;
  usdtDescription?: string;
  relatedId?: number;
  ledgerId?: number;
}): Promise<void> {
  if (!params.transaction) throw new Error("钱包扣款必须在订单事务中执行");
  for (const amount of [params.cnyAmount, params.usdtAmount]) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("商城扣款金额无效");
  }
  // Check every required currency BEFORE writing any of them. Zero-use currencies may have historical deficits.
  if (params.cnyAmount > 0) await assertGlobalWalletDebit(params.transaction, params.userId, "CNY", params.cnyAmount);
  if (params.usdtAmount > 0) await assertGlobalWalletDebit(params.transaction, params.userId, "USDT", params.usdtAmount);
  const [ledgerRows] = await params.transaction.execute(
    "SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    [params.userId],
  );
  const ledgerId = params.ledgerId ?? rowsOf(ledgerRows)[0]?.ledger_id;
  if (params.cnyAmount > 0) {
    await params.transaction.execute(
      "INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
      [ledgerId ?? 37, params.userId, fundingAmountText(-params.cnyAmount), `[CNY]${params.note}`],
    );
  }
  if (params.usdtAmount > 0) {
    const amount = fundingAmountText(-params.usdtAmount);
    const description = params.usdtDescription ?? params.note;
    await params.transaction.execute(
      "INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
      [ledgerId ?? 52, params.userId, amount, `[奖励] ${description}`],
    );
    // Compatibility mirror. Same 8-decimal amount avoids the earlier rounding-driven duplicate-history bug.
    await params.transaction.execute(
      "INSERT INTO balance_history (user_id, amount, type, currency, related_id, balance, description) VALUES (?, ?, 'reward', 'USDT', ?, 0, ?)",
      [params.userId, amount, params.relatedId ?? null, description],
    );
  }
}
