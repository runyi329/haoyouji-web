import { createHash, randomUUID } from "node:crypto";
import { getDbConnection } from "./db";
import { ensureMultiAssetWalletInfrastructure } from "./db-multi-asset-wallet";
import { assertGlobalWalletDebit, fundingUnits } from "./wallet-funding-guard";
import { verifyMibanPaymentQuoteToken } from "./miban-wallet-payment-quote";
import {
  PAYMENT_SCALE, normalizeMibanPaymentAssetCode, paymentDecimalUnits, paymentUnitsText,
  normalizeMibanPaymentAssets, validateMibanPaymentDeductions, type MibanPaymentAssetInput, type MibanPaymentDeduction,
} from "../shared/miban-wallet-payment";

export type PreparedMibanPayment = {
  quoteToken: string;
  quotedAt: string;
  expiresAt: string;
  usdtCnyRate: string;
  deductions: MibanPaymentDeduction[];
};
export type MibanOrderWalletPayment = MibanPaymentDeduction & { quotedAt: string; refunded: boolean };
const rowsOf = (rows: any): any[] => Array.isArray(rows) ? rows : [];
const isFunding = (code: string) => code === "CNY" || code === "USDT";
const missingTable = (error: any) => (error?.code ?? error?.cause?.code) === "ER_NO_SUCH_TABLE";
let infrastructure: Promise<void> | null = null;

/** Mutation-only preparation; never called by quote/history queries or inside a money transaction. */
export async function ensureMibanWalletPaymentInfrastructure(includeCrypto = false): Promise<void> {
  if (includeCrypto) await ensureMultiAssetWalletInfrastructure();
  if (!infrastructure) infrastructure = (async () => {
    const connection = await getDbConnection();
    if (!connection) throw new Error("数据库连接失败，未执行商城支付初始化");
    await (connection as any).execute(`CREATE TABLE IF NOT EXISTS miban_order_wallet_payments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL, user_id INT NOT NULL, asset_code VARCHAR(16) NOT NULL,
      amount DECIMAL(36,18) NOT NULL, price_cny DECIMAL(36,18) NOT NULL,
      price_usdt DECIMAL(36,18) NOT NULL, cny_value DECIMAL(36,18) NOT NULL,
      quoted_at VARCHAR(32) NOT NULL, refunded TINYINT(1) NOT NULL DEFAULT 0,
      payment_entry_id BIGINT UNSIGNED NULL, refund_entry_id BIGINT UNSIGNED NULL,
      refunded_at DATETIME NULL, refunded_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_miban_order_wallet_asset (order_id, asset_code),
      KEY idx_miban_wallet_payment_user (user_id, order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
    await (connection as any).execute(`CREATE TABLE IF NOT EXISTS miban_wallet_payment_quote_uses (
      quote_hash CHAR(64) NOT NULL PRIMARY KEY, user_id INT NOT NULL,
      first_order_id INT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_miban_wallet_quote_user (user_id, first_order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
  })().catch(error => { infrastructure = null; throw error; });
  await infrastructure;
}

/** Frontend supplies only coin quantities and an authenticated server quote, never prices/user IDs. */
export function prepareMibanWalletPayment(params: {
  userId: number; totalCny: string | number;
  paymentAssets?: MibanPaymentAssetInput[]; paymentQuoteToken?: string;
}): PreparedMibanPayment | null {
  if (params.paymentAssets === undefined) {
    if (params.paymentQuoteToken !== undefined) throw new Error("支付报价必须与所选币量一起提交");
    return null;
  }
  if (!params.paymentQuoteToken) throw new Error("请选择币种并刷新支付报价");
  const quote = verifyMibanPaymentQuoteToken(params.paymentQuoteToken, params.userId);
  return { quoteToken: params.paymentQuoteToken, ...quote,
    deductions: validateMibanPaymentDeductions(params.totalCny, params.paymentAssets, quote.assets) };
}

export function mibanFundingDeductionAmounts(deductions: MibanPaymentDeduction[]) {
  return { cnyAmount: deductions.find(row => row.assetCode === "CNY")?.amount ?? "0",
    usdtAmount: deductions.find(row => row.assetCode === "USDT")?.amount ?? "0" };
}

async function lockOwner(transaction: any, userId: number): Promise<void> {
  if (!transaction || !Number.isSafeInteger(userId) || userId <= 0) throw new Error("商城资金事务或钱包用户无效");
  const [rows] = await transaction.execute("SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE", [userId]);
  if (!rowsOf(rows)[0]) throw new Error("钱包用户不存在");
}
function nativeUnits(value: unknown): bigint { return fundingUnits(value); }
function exactText(value: unknown): string { return paymentUnitsText(nativeUnits(value)); }
function positiveSnapshot(row: any): MibanPaymentDeduction {
  const assetCode = normalizeMibanPaymentAssetCode(String(row.asset_code));
  const amount = exactText(row.amount);
  const priceCny = exactText(row.price_cny);
  const priceUsdt = exactText(row.price_usdt);
  if (nativeUnits(amount) <= 0n || nativeUnits(priceCny) <= 0n || nativeUnits(priceUsdt) <= 0n) throw new Error("订单原币支付快照异常，已停止退款");
  return { assetCode, amount, priceCny, priceUsdt, cnyValue: exactText(row.cny_value) };
}

async function writeFunding(transaction: any, params: {
  userId: number; assetCode: string; amount: string; orderId: number; note: string; refund: boolean;
}): Promise<number> {
  const [ledgerRows] = await transaction.execute("SELECT ledger_id FROM af_manual_balances WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", [params.userId]);
  const ledgerId = rowsOf(ledgerRows)[0]?.ledger_id ?? (params.assetCode === "CNY" ? 37 : 52);
  const signedAmount = params.refund ? params.amount : `-${params.amount}`;
  const note = params.assetCode === "CNY" ? `[CNY]${params.note}` : `${params.refund ? "[退款]" : "[扣款]"} ${params.note}`;
  const [result] = await transaction.execute(
    "INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, CAST(? AS DECIMAL(36,18)), ?, NOW(), NOW())",
    [ledgerId, params.userId, signedAmount, note]);
  // Old migration scripts declare DECIMAL(18,2). Never silently charge/refund a rounded native amount.
  const [persistedRows] = await transaction.execute("SELECT amount FROM af_manual_balances WHERE id = ? LIMIT 1 FOR UPDATE", [Number(result.insertId)]);
  const persisted = rowsOf(persistedRows)[0];
  if (!persisted || nativeUnits(persisted.amount) !== nativeUnits(signedAmount)) throw new Error("资金账本精度不足，已停止商城扣款或退款，请联系管理员核对");
  if (params.assetCode === "USDT") await transaction.execute(
    "INSERT INTO balance_history (user_id, amount, type, currency, related_id, balance, description) VALUES (?, ?, ?, 'USDT', ?, 0, ?)",
    [params.userId, signedAmount, params.refund ? "refund" : "consume", params.orderId, params.note]);
  return Number(result.insertId);
}

async function lockedCryptoBalance(transaction: any, userId: number, assetCode: string) {
  const [rows] = await transaction.execute(
    "SELECT available_balance, frozen_balance FROM ai_wallet_asset_balances WHERE user_id = ? AND asset_code = ? LIMIT 1 FOR UPDATE", [userId, assetCode]);
  const row = rowsOf(rows)[0];
  if (!row || nativeUnits(row.available_balance) < 0n || nativeUnits(row.frozen_balance) < 0n) throw new Error(`${assetCode}钱包余额或冻结台账异常`);
  return row;
}
async function writeCrypto(transaction: any, params: {
  userId: number; assetCode: string; amount: string; orderId: number; actorUserId: number; refund: boolean;
}): Promise<number> {
  const signed = params.refund ? params.amount : `-${params.amount}`;
  const [result] = await transaction.execute(
    `UPDATE ai_wallet_asset_balances SET available_balance = available_balance + CAST(? AS DECIMAL(36,18)), updated_at = NOW()
      WHERE user_id = ? AND asset_code = ? AND frozen_balance >= 0
        AND available_balance + CAST(? AS DECIMAL(36,18)) >= 0`,
    [signed, params.userId, params.assetCode, signed]);
  if (Number(result.affectedRows) !== 1) throw new Error(`${params.assetCode}可用余额不足；冻结资金不可用于扣款`);
  const balance = await lockedCryptoBalance(transaction, params.userId, params.assetCode);
  const [insert] = await transaction.execute(
    `INSERT INTO ai_wallet_asset_entries
      (entry_no, request_id, user_id, asset_code, amount, balance_after, event_type, note, source_ledger_id, actor_user_id)
      VALUES (?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), ?, ?, ?, 52, ?)`,
    [`MBE${randomUUID()}`, `miban_${params.refund ? "refund" : "payment"}_${params.orderId}_${params.assetCode}`,
      params.userId, params.assetCode, signed, String(balance.available_balance), params.refund ? "miban_refund" : "miban_payment",
      `米伴订单${params.refund ? "原币退款" : "原币扣款"} #${params.orderId}`, params.actorUserId]);
  return Number(result.insertId);
}

type MibanPaymentOrders = Array<{ orderId: number; deductions: MibanPaymentDeduction[] }>;
function assertOrderDeductions(sorted: MibanPaymentDeduction[], orders: MibanPaymentOrders): void {
  if (!orders.length) throw new Error("支付订单无效");
  const orderIds = new Set<number>();
  const sums = new Map<string, bigint>();
  for (const order of orders) {
    if (!Number.isSafeInteger(order.orderId) || order.orderId <= 0 || orderIds.has(order.orderId)) throw new Error("支付订单无效");
    orderIds.add(order.orderId);
    const assets = new Set<string>();
    for (const row of order.deductions) {
      const original = sorted.find(item => item.assetCode === row.assetCode);
      if (!original || assets.has(row.assetCode) || original.priceCny !== row.priceCny || original.priceUsdt !== row.priceUsdt || nativeUnits(row.amount) <= 0n) throw new Error("订单原币快照异常");
      assets.add(row.assetCode);
      if (nativeUnits(row.cnyValue) !== nativeUnits(row.amount) * nativeUnits(row.priceCny) / PAYMENT_SCALE) throw new Error("订单原币快照折算金额异常");
      sums.set(row.assetCode, (sums.get(row.assetCode) ?? 0n) + nativeUnits(row.amount));
    }
  }
  for (const row of sorted) if (sums.get(row.assetCode) !== nativeUnits(row.amount)) throw new Error("订单原币分摊与实际扣款不一致");
}

/** User lock -> expiry -> one-use quote -> all balance checks -> debits -> per-order snapshots. Caller owns commit/rollback. */
export async function debitMibanWalletPayment(params: {
  transaction: any; userId: number; payment: PreparedMibanPayment;
  orders: Array<{ orderId: number; deductions: MibanPaymentDeduction[] }>;
}): Promise<void> {
  const { transaction, userId, payment } = params;
  await lockOwner(transaction, userId);
  if (!params.orders.length) throw new Error("支付订单无效");
  // Re-verify after inventory work/lock waits, using the same configured signing key and current time.
  verifyMibanPaymentQuoteToken(payment.quoteToken, userId);
  if (Date.now() >= Date.parse(payment.expiresAt)) throw new Error("支付报价已过期，请刷新后重新核对");
  const sorted = [...payment.deductions].sort((a, b) => a.assetCode.localeCompare(b.assetCode));
  assertOrderDeductions(sorted, params.orders);
  const hash = createHash("sha256").update(`miban-payment:${userId}:${payment.quoteToken}`).digest("hex");
  try {
    await transaction.execute("INSERT INTO miban_wallet_payment_quote_uses (quote_hash, user_id, first_order_id) VALUES (?, ?, ?)", [hash, userId, params.orders[0].orderId]);
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") throw new Error("该支付报价已成功使用，请查看订单，勿重复支付");
    throw error;
  }
  await debitAndSnapshotMibanPayment({ transaction, userId, sorted, orders: params.orders, quotedAt: payment.quotedAt });
}

/** Only old cross-group carts use this: real CNY/USDT, one debit per asset, original-rate snapshots. */
export async function debitMibanLegacyCartWalletPayment(params: {
  transaction: any; userId: number; deductions: MibanPaymentDeduction[]; orders: MibanPaymentOrders;
}): Promise<void> {
  await lockOwner(params.transaction, params.userId);
  const normalized = normalizeMibanPaymentAssets(params.deductions);
  for (const row of params.deductions) {
    if (!isFunding(row.assetCode) || nativeUnits(row.priceCny) <= 0n || nativeUnits(row.priceUsdt) <= 0n
      || (row.assetCode === "CNY" && nativeUnits(row.priceCny) !== PAYMENT_SCALE)
      || (row.assetCode === "USDT" && nativeUnits(row.priceUsdt) !== PAYMENT_SCALE)
      || nativeUnits(row.cnyValue) !== nativeUnits(row.amount) * nativeUnits(row.priceCny) / PAYMENT_SCALE
      || !normalized.some(asset => asset.assetCode === row.assetCode && asset.amount === row.amount)) throw new Error("历史购物车两币支付快照异常");
  }
  const sorted = [...params.deductions].sort((a, b) => a.assetCode.localeCompare(b.assetCode));
  assertOrderDeductions(sorted, params.orders);
  await debitAndSnapshotMibanPayment({ ...params, sorted, quotedAt: new Date().toISOString() });
}

async function debitAndSnapshotMibanPayment(params: {
  transaction: any; userId: number; sorted: MibanPaymentDeduction[]; orders: MibanPaymentOrders; quotedAt: string;
}): Promise<void> {
  const { transaction, userId, sorted } = params;
  // Validate every coin before any balance mutation. Independent available already excludes ALL freezes.
  for (const row of sorted) {
    if (isFunding(row.assetCode)) await assertGlobalWalletDebit(transaction, userId, row.assetCode as "CNY" | "USDT", row.amount);
    else {
      const balance = await lockedCryptoBalance(transaction, userId, row.assetCode);
      if (nativeUnits(row.amount) > nativeUnits(balance.available_balance)) throw new Error(`${row.assetCode}可用余额不足；冻结资金不可用于扣款`);
    }
  }
  const entries = new Map<string, number>();
  for (const row of sorted) {
    const orderId = params.orders[0].orderId;
    const entry = isFunding(row.assetCode)
      ? await writeFunding(transaction, { userId, assetCode: row.assetCode, amount: row.amount, orderId, note: `米伴订单原币扣款 #${orderId}`, refund: false })
      : await writeCrypto(transaction, { userId, assetCode: row.assetCode, amount: row.amount, orderId, actorUserId: userId, refund: false });
    entries.set(row.assetCode, entry);
  }
  for (const order of params.orders) for (const row of order.deductions) await transaction.execute(
    `INSERT INTO miban_order_wallet_payments
      (order_id, user_id, asset_code, amount, price_cny, price_usdt, cny_value, quoted_at, payment_entry_id)
      VALUES (?, ?, ?, CAST(? AS DECIMAL(36,18)), CAST(? AS DECIMAL(36,18)), CAST(? AS DECIMAL(36,18)), CAST(? AS DECIMAL(36,18)), ?, ?)`,
    [order.orderId, userId, row.assetCode, row.amount, row.priceCny, row.priceUsdt, row.cnyValue, params.quotedAt, entries.get(row.assetCode)]);
}

/** Read-only enrichment. Only absent pre-migration table is compatible; outages/corrupt snapshots fail closed. */
export async function readMibanOrderWalletPayments(orderIds: number[], connection?: any): Promise<Map<number, MibanOrderWalletPayment[]>> {
  const result = new Map<number, MibanOrderWalletPayment[]>();
  const ids = [...new Set(orderIds)].filter(id => Number.isSafeInteger(id) && id > 0);
  if (!ids.length) return result;
  const conn = connection ?? await getDbConnection();
  if (!conn) throw new Error("数据库连接失败，无法读取原币支付记录");
  let rows: any;
  try { [rows] = await conn.execute(`SELECT * FROM miban_order_wallet_payments WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY order_id, asset_code`, ids); }
  catch (error) { if (missingTable(error)) return result; throw error; }
  for (const row of rowsOf(rows)) {
    const orderId = Number(row.order_id);
    result.set(orderId, [...(result.get(orderId) ?? []), { ...positiveSnapshot(row), quotedAt: String(row.quoted_at), refunded: Number(row.refunded) === 1 }]);
  }
  return result;
}

/** Called only after user AND current order lock. No DDL, nested transaction, repricing, or freezing/refreeze. */
export async function refundMibanOrderWalletPayment(params: {
  transaction: any; order: { id: number; userId: number; walletDeductCny?: unknown; walletDeductUsdt?: unknown };
  actorUserId: number;
}): Promise<MibanPaymentDeduction[]> {
  const { transaction, order, actorUserId } = params;
  let snapshots: any[] = [];
  try {
    const [rows] = await transaction.execute("SELECT * FROM miban_order_wallet_payments WHERE order_id = ? ORDER BY asset_code FOR UPDATE", [order.id]);
    snapshots = rowsOf(rows);
  } catch (error) { if (!missingTable(error)) throw error; }
  if (snapshots.length) {
    const refunds = snapshots.map(row => {
      if (Number(row.user_id) !== order.userId || ![0, 1].includes(Number(row.refunded))) throw new Error("原币支付归属或退款状态异常");
      return positiveSnapshot(row);
    });
    for (let index = 0; index < snapshots.length; index++) {
      const snapshot = snapshots[index];
      if (Number(snapshot.refunded) === 1) continue;
      const row = refunds[index];
      if (!isFunding(row.assetCode)) await lockedCryptoBalance(transaction, order.userId, row.assetCode);
      const entryId = isFunding(row.assetCode)
        ? await writeFunding(transaction, { userId: order.userId, assetCode: row.assetCode, amount: row.amount, orderId: order.id, note: `米伴订单原币退款 #${order.id}`, refund: true })
        : await writeCrypto(transaction, { userId: order.userId, assetCode: row.assetCode, amount: row.amount, orderId: order.id, actorUserId, refund: true });
      const [updated] = await transaction.execute(
        "UPDATE miban_order_wallet_payments SET refunded = 1, refund_entry_id = ?, refunded_at = NOW(), refunded_by = ? WHERE id = ? AND refunded = 0", [entryId, actorUserId, snapshot.id]);
      if (Number(updated.affectedRows) !== 1) throw new Error("原币退款状态已变动，已停止退款");
    }
    return refunds;
  }
  // Legacy original currency amounts only; no epsilon/tiny-value suppression or current-rate substitution.
  const refunds: MibanPaymentDeduction[] = [];
  for (const [assetCode, raw] of [["CNY", order.walletDeductCny ?? "0"], ["USDT", order.walletDeductUsdt ?? "0"]] as const) {
    const amount = exactText(raw);
    if (nativeUnits(amount) < 0n) throw new Error("历史订单退款金额异常");
    if (nativeUnits(amount) === 0n) continue;
    await writeFunding(transaction, { userId: order.userId, assetCode, amount, orderId: order.id, note: `米伴历史订单原币退款 #${order.id}`, refund: true });
    // No invented price for historical refunds; the returned quantities are the actual native refund.
    refunds.push({ assetCode, amount, priceCny: "0", priceUsdt: "0", cnyValue: "0" });
  }
  return refunds;
}

/** Sales equivalents from snapshot prices, not live prices and not the duplicate legacy deduction columns. */
export function mibanWalletPaymentSalesValue(order: { walletPayments?: MibanPaymentDeduction[]; walletDeductCny?: unknown; walletDeductUsdt?: unknown }) {
  if (order.walletPayments?.length) {
    let cny = 0n, usdt = 0n;
    for (const row of order.walletPayments) {
      const amount = paymentDecimalUnits(row.amount);
      cny += amount * paymentDecimalUnits(row.priceCny) / PAYMENT_SCALE;
      usdt += amount * paymentDecimalUnits(row.priceUsdt) / PAYMENT_SCALE;
    }
    return { cny: Number(paymentUnitsText(cny)), usdt: Number(paymentUnitsText(usdt)) };
  }
  return { cny: Math.max(0, Number(order.walletDeductCny ?? 0)), usdt: Math.max(0, Number(order.walletDeductUsdt ?? 0)) };
}

/** Current order/commission reads after owner lock; cancelled replay only retries external restocking. */
export async function cancelMibanOrderWithWalletRefund(params: {
  transaction: any; userId: number; orderId: number; actorUserId: number;
}): Promise<{ order: any; walletPayments: MibanPaymentDeduction[]; alreadyCancelled: boolean }> {
  await lockOwner(params.transaction, params.userId);
  if (!Number.isSafeInteger(params.orderId) || params.orderId <= 0) throw new Error("订单编号无效");
  const [orders] = await params.transaction.execute("SELECT * FROM miban_orders WHERE id = ? LIMIT 1 FOR UPDATE", [params.orderId]);
  const order = rowsOf(orders)[0];
  if (!order) throw new Error("订单不存在");
  if (Number(order.userId) !== params.userId) throw new Error("订单钱包归属已变动，已停止退款");
  if (order.status === "cancelled") return { order, walletPayments: [], alreadyCancelled: true };
  if (order.status === "shipped") throw new Error("订单已发货，请在完成退货验收入库后处理退款");
  if (order.status === "delivered") throw new Error("已送达订单不可取消");
  const [commissions] = await params.transaction.execute("SELECT id, status FROM miban_commissions WHERE order_id = ? ORDER BY id FOR UPDATE", [params.orderId]);
  if (rowsOf(commissions).some(row => row.status === "settled")) throw new Error("该订单奖金已结算，请先处理奖金冲正后再退款");
  const walletPayments = await refundMibanOrderWalletPayment({ transaction: params.transaction, order, actorUserId: params.actorUserId });
  await params.transaction.execute("UPDATE miban_commissions SET status = 'cancelled' WHERE order_id = ? AND status = 'pending'", [params.orderId]);
  const [updated] = await params.transaction.execute("UPDATE miban_orders SET status = 'cancelled' WHERE id = ? AND status = ?", [params.orderId, order.status]);
  if (Number(updated.affectedRows) !== 1) throw new Error("订单状态已变动，已停止退款");
  return { order, walletPayments, alreadyCancelled: false };
}
