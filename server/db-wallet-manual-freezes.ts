import { createHash, randomUUID } from "crypto";
import { AI_WALLET_ASSETS, type AiWalletAsset } from "../shared/ai-wallet-assets";
import { getDbConnection } from "./db";
import { ensureLedger37WalletInfrastructure } from "./ledger37-wallet";
import { ensureMultiAssetWalletInfrastructure, moveMultiAssetBalanceToFrozen } from "./db-multi-asset-wallet";
import { assertGlobalWalletDebit, fundingUnits, withGlobalWalletTransaction } from "./wallet-funding-guard";

/** Reserved namespace, deliberately unrelated to ANY 52-order tag. */
export const MANUAL_FREEZE_HOLD_TAG_PREFIX = "AIW_MANUAL_FREEZE:";
export type WalletManualFreezeItem = {
  id: number;
  assetCode: AiWalletAsset;
  amount: string;
  releasedAmount: string;
  remainingAmount: string;
  note: string;
  status: "active" | "released";
  createdAt: string;
};
export type WalletManualFreezeAction = {
  id: number;
  freezeId: number;
  userId: number;
  ledgerId: 52;
  assetCode: AiWalletAsset;
  direction: "freeze" | "release";
  amount: string;
  note: string;
  actorUserId: number;
  createdAt: string;
};
type BaseInput = { ledgerId: 52; userId: number; amount: string; note?: string; requestId: string; actorUserId: number };
export type WalletManualFreezeInput = BaseInput & { assetCode: AiWalletAsset };
export type WalletManualReleaseInput = BaseInput & { freezeId: number };
export type WalletManualFreezeResult = { success: true; alreadyCompleted: boolean; item: WalletManualFreezeItem; actionId: number };
export type WalletManualFreezeAvailableAsset = { assetCode: AiWalletAsset; availableAmount: string };
type WalletReadConnection = { execute(sql: string, values: unknown[]): Promise<any> };
const rowsOf = (value: any): any[] => Array.isArray(value) ? value : [];
const isFunding = (asset: AiWalletAsset): asset is "CNY" | "USDT" => asset === "CNY" || asset === "USDT";
let infrastructureReady: Promise<void> | null = null;

function assertIdentity(ledgerId: number, userId: number) {
  if (ledgerId !== 52) throw new Error("手动冻结仅支持52号账本");
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("钱包用户无效");
}
function normalizeAsset(value: unknown): AiWalletAsset {
  if (!(AI_WALLET_ASSETS as readonly unknown[]).includes(value)) throw new Error("不支持的钱包资产");
  return value as AiWalletAsset;
}
/** No Number conversion, exponent notation, signed zero, rounding or epsilon. */
export function normalizeWalletManualAmount(asset: AiWalletAsset, value: string): string {
  normalizeAsset(asset);
  const precision = isFunding(asset) ? 8 : 18;
  if (typeof value !== "string" || !new RegExp(`^(?:0|[1-9]\\d{0,17})(?:\\.\\d{1,${precision}})?$`).test(value)) {
    throw new Error(`金额格式无效，${asset}最多支持${precision}位小数`);
  }
  if (fundingUnits(value) <= BigInt(0)) throw new Error("金额必须大于0");
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
function validateBase(input: BaseInput) {
  assertIdentity(input.ledgerId, input.userId);
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) throw new Error("操作人无效");
  if (typeof input.requestId !== "string" || !/^[A-Za-z0-9_-]{16,96}$/.test(input.requestId)) throw new Error("资金请求无效");
  if (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 500)) throw new Error("备注最多500字");
}
function itemResult(row: any): WalletManualFreezeItem {
  if (!row) throw new Error("手动冻结台账不存在");
  const original: bigint = fundingUnits(row.amount);
  const released: bigint = fundingUnits(row.released_amount);
  if (original <= BigInt(0) || released < BigInt(0) || released > original) throw new Error("手动冻结台账金额异常");
  // Exact fixed-point subtraction, including historical idempotency replay snapshots.
  const remaining = original - released;
  const scale = BigInt("1000000000000000000");
  const integer = remaining / scale;
  const fraction = (remaining % scale).toString().padStart(18, "0").replace(/0+$/, "");
  return {
    id: Number(row.id), assetCode: normalizeAsset(row.asset_code), amount: String(row.amount),
    releasedAmount: String(row.released_amount), remainingAmount: fraction ? `${integer}.${fraction}` : String(integer),
    note: String(row.note || ""), status: remaining === BigInt(0) ? "released" : "active", createdAt: String(row.created_at || ""),
  };
}

/** Lazy DDL is executed ONLY before transaction acquisition, never in the money transaction. */
export async function ensureWalletManualFreezeInfrastructure(): Promise<void> {
  if (!infrastructureReady) {
    infrastructureReady = (async () => {
      await ensureLedger37WalletInfrastructure();
      await ensureMultiAssetWalletInfrastructure();
      const connection = await getDbConnection();
      if (!connection) throw new Error("数据库连接失败");
      await (connection as any).execute(`CREATE TABLE IF NOT EXISTS ai_wallet_manual_freezes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'manual',
        freeze_no VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        asset_code VARCHAR(16) NOT NULL,
        amount DECIMAL(36,18) NOT NULL,
        released_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
        funding_hold_id BIGINT UNSIGNED NULL,
        note VARCHAR(500) NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_by INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_wallet_manual_freeze_no (freeze_no),
        UNIQUE KEY uk_wallet_manual_freeze_hold (funding_hold_id),
        KEY idx_wallet_manual_freeze_user (ledger_id, user_id, source, created_at),
        CONSTRAINT fk_wallet_manual_freeze_hold FOREIGN KEY (funding_hold_id) REFERENCES ai_wallet_project_holds(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员手动冻结；不得关联37项目或52订单'`, []);
      await (connection as any).execute(`CREATE TABLE IF NOT EXISTS ai_wallet_manual_freeze_actions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        freeze_id BIGINT UNSIGNED NOT NULL,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'manual',
        request_id VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        asset_code VARCHAR(16) NOT NULL,
        direction VARCHAR(16) NOT NULL,
        amount DECIMAL(36,18) NOT NULL,
        note VARCHAR(500) NOT NULL DEFAULT '',
        actor_user_id INT NOT NULL,
        result_json LONGTEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_wallet_manual_action_request (request_id),
        KEY idx_wallet_manual_action_user (ledger_id, user_id, source, created_at),
        KEY idx_wallet_manual_action_freeze (freeze_id, created_at),
        CONSTRAINT fk_wallet_manual_action_freeze FOREIGN KEY (freeze_id) REFERENCES ai_wallet_manual_freezes(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='手动冻结解冻不可变动作；禁止修改或删除历史'`, []);
    })().catch(error => { infrastructureReady = null; throw error; });
  }
  await infrastructureReady;
}

/** Optional history branch: probe only, never initializes schema or hides other SQL errors. */
export async function hasWalletManualFreezeActions(connection: { execute(sql: string, values: unknown[]): Promise<unknown> }): Promise<boolean> {
  try {
    await connection.execute("SELECT 1 FROM ai_wallet_manual_freeze_actions LIMIT 1", []);
    return true;
  } catch (error: any) {
    if ((error?.code ?? error?.cause?.code) === "ER_NO_SUCH_TABLE") return false;
    throw error;
  }
}

function isMissingReadTable(error: any): boolean {
  return (error?.code ?? error?.cause?.code) === "ER_NO_SUCH_TABLE";
}

/** A single-table probe makes absence explicit; permissions/columns/network failures are fatal. */
async function hasFundingReadTable(connection: WalletReadConnection, table: "af_manual_balances" | "ai_wallet_project_holds"): Promise<boolean> {
  try {
    await connection.execute(`SELECT 1 FROM ${table} LIMIT 1`, []);
    return true;
  } catch (error) {
    if (isMissingReadTable(error)) return false;
    throw error;
  }
}

/** One non-locking DECIMAL statement for both funding assets; mirrors wallet-funding-guard. */
async function readManualFreezeFunding(connection: WalletReadConnection, userId: number, manual = true, holds = true): Promise<any> {
  const [rows] = await connection.execute(`SELECT
      CAST(COALESCE(u.cny_balance, 0) ${manual ? "+ COALESCE(m.cny_amount, 0)" : ""} ${holds ? "- COALESCE(h.cny_frozen, 0)" : ""} AS CHAR) AS cny_available,
      CAST(COALESCE(u.balance, 0) ${manual ? "+ COALESCE(m.usdt_amount, 0)" : ""} ${holds ? "- COALESCE(h.usdt_frozen, 0)" : ""} AS CHAR) AS usdt_available,
      ${holds ? "COALESCE(h.invalid_holds, 0)" : "0"} AS invalid_holds
    FROM users u
    ${manual ? `LEFT JOIN (
      SELECT user_id,
        SUM(CASE WHEN COALESCE(note, '') LIKE '[CNY]%' THEN amount ELSE 0 END) AS cny_amount,
        SUM(CASE WHEN COALESCE(note, '') NOT LIKE '[CNY]%' AND COALESCE(note, '') NOT LIKE '[BALANCE_BASE]%' THEN amount ELSE 0 END) AS usdt_amount
      FROM af_manual_balances WHERE user_id = ? GROUP BY user_id
    ) m ON m.user_id = u.id` : ""}
    ${holds ? `LEFT JOIN (
      SELECT user_id,
        SUM(CASE WHEN asset_code = 'CNY' THEN amount - COALESCE(released_amount, 0) ELSE 0 END) AS cny_frozen,
        SUM(CASE WHEN asset_code = 'USDT' THEN amount - COALESCE(released_amount, 0) ELSE 0 END) AS usdt_frozen,
        SUM(CASE WHEN amount < 0 OR COALESCE(released_amount, 0) < 0 OR COALESCE(released_amount, 0) > amount THEN 1 ELSE 0 END) AS invalid_holds
      FROM ai_wallet_project_holds WHERE user_id = ? AND asset_code IN ('CNY', 'USDT') AND status = 'active' GROUP BY user_id
    ) h ON h.user_id = u.id` : ""}
    WHERE u.id = ? LIMIT 1`, [...(manual ? [userId] : []), ...(holds ? [userId] : []), userId]);
  const row = rowsOf(rows)[0];
  if (!row) throw new Error("钱包用户不存在");
  if (row.invalid_holds == null || !/^0+$/.test(String(row.invalid_holds))) throw new Error("钱包冻结台账异常，请联系管理员核对");
  return row;
}

/** Only representable positive quantities. Truncate, never round a historical 18-place funding hold. */
function manualFreezeAvailableText(assetCode: AiWalletAsset, value: unknown): string | null {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d{1,18})?$/.test(value)) throw new Error("钱包可用余额数据异常");
  const units = fundingUnits(value);
  if (units <= BigInt(0)) return null;
  const scale = BigInt("1000000000000000000");
  const integer = (units / scale).toString();
  const fraction = (units % scale).toString().padStart(18, "0").slice(0, isFunding(assetCode) ? 8 : 18).replace(/0+$/, "");
  if (integer === "0" && !fraction) return null;
  return fraction ? `${integer}.${fraction}` : integer;
}

/** Reusable read-only native quantities, independent of prices, orders, schema ensure and transactions.
 * An absent adjustment/hold table contains no corresponding rows: keep real users base balances and
 * every still-existing source, never substitute an empty wallet after a failed aggregate.
 */
export async function getWalletManualFreezeAvailableAssets(userId: number, existingConnection?: WalletReadConnection): Promise<WalletManualFreezeAvailableAsset[]> {
  assertIdentity(52, userId);
  const connection = existingConnection ?? await getDbConnection() as WalletReadConnection | null;
  if (!connection) throw new Error("数据库连接失败");
  let funding: any;
  try {
    funding = await readManualFreezeFunding(connection, userId);
  } catch (error) {
    if (!isMissingReadTable(error)) throw error;
    const manual = await hasFundingReadTable(connection, "af_manual_balances");
    const holds = await hasFundingReadTable(connection, "ai_wallet_project_holds");
    if (manual && holds) throw error; // Includes a missing users table: it is never optional.
    funding = await readManualFreezeFunding(connection, userId, manual, holds);
  }
  const amounts = new Map<AiWalletAsset, unknown>([["CNY", funding.cny_available], ["USDT", funding.usdt_available]]);
  try {
    const [rows] = await connection.execute(`SELECT asset_code, CAST(available_balance AS CHAR) AS available_balance
      FROM ai_wallet_asset_balances WHERE user_id = ?`, [userId]);
    for (const row of rowsOf(rows)) {
      if (!(AI_WALLET_ASSETS as readonly unknown[]).includes(row.asset_code) || isFunding(row.asset_code)) continue;
      amounts.set(row.asset_code, row.available_balance);
    }
  } catch (error) {
    // This single-table SELECT can only have the independent balances table genuinely absent.
    if (!isMissingReadTable(error)) throw error;
  }
  const availableAssets: WalletManualFreezeAvailableAsset[] = [];
  for (const assetCode of AI_WALLET_ASSETS) {
    if (!amounts.has(assetCode)) continue;
    const availableAmount = manualFreezeAvailableText(assetCode, amounts.get(assetCode));
    if (availableAmount !== null) availableAssets.push({ assetCode, availableAmount });
  }
  return availableAssets;
}

/** Read-only manual facts plus real native availability; no order query or schema mutation. */
export async function getWalletManualFreezeState(input: { ledgerId: 52; userId: number }): Promise<{
  items: WalletManualFreezeItem[]; events: WalletManualFreezeAction[]; orderProtected: true; availableAssets: WalletManualFreezeAvailableAsset[];
}> {
  assertIdentity(input.ledgerId, input.userId);
  const connection = await getDbConnection();
  if (!connection) throw new Error("数据库连接失败");
  // Outside the optional manual-history catch: balance failures must never turn into empty balances.
  const availableAssets = await getWalletManualFreezeAvailableAssets(input.userId, connection as WalletReadConnection);
  try {
    const [rows] = await (connection as any).execute(
      "SELECT * FROM ai_wallet_manual_freezes WHERE ledger_id = 52 AND user_id = ? AND source = 'manual' ORDER BY created_at DESC, id DESC", [input.userId]);
    const [events] = await (connection as any).execute(
      "SELECT * FROM ai_wallet_manual_freeze_actions WHERE ledger_id = 52 AND user_id = ? AND source = 'manual' ORDER BY created_at DESC, id DESC", [input.userId]);
    return { items: rowsOf(rows).map(itemResult), events: rowsOf(events).map(row => ({
      id: Number(row.id), freezeId: Number(row.freeze_id), userId: Number(row.user_id), ledgerId: 52,
      assetCode: normalizeAsset(row.asset_code), direction: row.direction === "release" ? "release" : "freeze",
      amount: String(row.amount), note: String(row.note || ""), actorUserId: Number(row.actor_user_id), createdAt: String(row.created_at || ""),
    })), orderProtected: true, availableAssets };
  } catch (error: any) {
    if ((error?.code ?? error?.cause?.code) === "ER_NO_SUCH_TABLE") return { items: [], events: [], orderProtected: true, availableAssets };
    throw error;
  }
}

async function readFreeze(transaction: any, userId: number, freezeId: number) {
  const [rows] = await transaction.execute(
    "SELECT * FROM ai_wallet_manual_freezes WHERE ledger_id = 52 AND user_id = ? AND id = ? AND source = 'manual' LIMIT 1 FOR UPDATE", [userId, freezeId]);
  const row = rowsOf(rows)[0];
  if (!row) throw new Error("手动冻结记录不存在；订单或项目冻结必须由原订单/项目解冻");
  return row;
}
function payloadHash(input: BaseInput, direction: "freeze" | "release", assetCode: AiWalletAsset, amount: string, freezeId: number | null) {
  return createHash("sha256").update(JSON.stringify({ ledgerId: input.ledgerId, userId: input.userId, assetCode, amount,
    freezeId, direction, note: input.note ?? "", actorUserId: input.actorUserId })).digest("hex");
}
async function replay(transaction: any, requestId: string, hash: string): Promise<WalletManualFreezeResult | null> {
  const [rows] = await transaction.execute("SELECT * FROM ai_wallet_manual_freeze_actions WHERE request_id = ? LIMIT 1 FOR UPDATE", [requestId]);
  const existing = rowsOf(rows)[0];
  if (!existing) return null;
  if (existing.source !== "manual" || Number(existing.ledger_id) !== 52 || existing.payload_hash !== hash) throw new Error("请求编号已用于不同资金操作，请刷新后重试");
  return { success: true, alreadyCompleted: true, item: JSON.parse(String(existing.result_json)), actionId: Number(existing.id) };
}
async function insertAction(transaction: any, input: BaseInput, direction: "freeze" | "release", row: any, amount: string, hash: string): Promise<WalletManualFreezeResult> {
  const item = itemResult(row);
  const [insert] = await transaction.execute(`INSERT INTO ai_wallet_manual_freeze_actions
    (freeze_id, ledger_id, user_id, source, request_id, payload_hash, asset_code, direction, amount, note, actor_user_id, result_json)
    VALUES (?, 52, ?, 'manual', ?, ?, ?, ?, CAST(? AS DECIMAL(36,18)), ?, ?, ?)`,
    [item.id, input.userId, input.requestId, hash, item.assetCode, direction, amount, input.note ?? "", input.actorUserId, JSON.stringify(item)]);
  return { success: true, alreadyCompleted: false, item, actionId: Number(insert.insertId) };
}
async function moveAsset(transaction: any, input: BaseInput, assetCode: AiWalletAsset, amount: string, direction: "freeze" | "release", freezeId: number) {
  const movement = await moveMultiAssetBalanceToFrozen({ transaction, userId: input.userId, assetCode, amount, direction,
    note: `${direction === "freeze" ? "手动冻结" : "手动解冻"} · [MANUAL_FREEZE:${freezeId}]${input.note ? ` · ${input.note}` : ""}`.slice(0, 500),
    requestId: `WMF_${createHash("sha256").update(input.requestId).digest("hex")}`,
    actorUserId: input.actorUserId, sourceLedgerId: 52 });
  // The manual action is the only replay authority. An orphan/colliding asset request must fail closed.
  if (movement.alreadyCompleted) throw new Error("手动冻结与资产流水关联异常，已停止操作");
}

export async function freezeWalletManually(input: WalletManualFreezeInput): Promise<WalletManualFreezeResult> {
  validateBase(input);
  const assetCode = normalizeAsset(input.assetCode);
  const amount = normalizeWalletManualAmount(assetCode, input.amount);
  const hash = payloadHash(input, "freeze", assetCode, amount, null);
  await ensureWalletManualFreezeInfrastructure();
  return withGlobalWalletTransaction(input.userId, async (transaction: any) => {
    const existing = await replay(transaction, input.requestId, hash);
    if (existing) return existing;
    const freezeNo = `WMF_${randomUUID()}`;
    let holdId: number | null = null;
    if (isFunding(assetCode)) {
      await assertGlobalWalletDebit(transaction, input.userId, assetCode, amount);
      const [hold] = await transaction.execute(`INSERT INTO ai_wallet_project_holds
        (hold_no, request_id, ledger_id, user_id, tag_name, asset_code, amount, cny_value_snapshot, status, created_by)
        VALUES (?, ?, 52, ?, ?, ?, CAST(? AS DECIMAL(36,18)), NULL, 'active', ?)`,
        [freezeNo, freezeNo, input.userId, `${MANUAL_FREEZE_HOLD_TAG_PREFIX}${freezeNo}`, assetCode, amount, input.actorUserId]);
      holdId = Number(hold.insertId);
    }
    const [insert] = await transaction.execute(`INSERT INTO ai_wallet_manual_freezes
      (ledger_id, user_id, source, freeze_no, asset_code, amount, funding_hold_id, note, status, created_by)
      VALUES (52, ?, 'manual', ?, ?, CAST(? AS DECIMAL(36,18)), ?, ?, 'active', ?)`,
      [input.userId, freezeNo, assetCode, amount, holdId, input.note ?? "", input.actorUserId]);
    const freezeId = Number(insert.insertId);
    if (!isFunding(assetCode)) await moveAsset(transaction, input, assetCode, amount, "freeze", freezeId);
    const row = await readFreeze(transaction, input.userId, freezeId);
    return insertAction(transaction, input, "freeze", row, amount, hash);
  });
}

export async function releaseWalletManually(input: WalletManualReleaseInput): Promise<WalletManualFreezeResult> {
  validateBase(input);
  if (!Number.isSafeInteger(input.freezeId) || input.freezeId <= 0) throw new Error("手动冻结编号无效");
  await ensureWalletManualFreezeInfrastructure();
  return withGlobalWalletTransaction(input.userId, async (transaction: any) => {
    const row = await readFreeze(transaction, input.userId, input.freezeId);
    const assetCode = normalizeAsset(row.asset_code);
    const amount = normalizeWalletManualAmount(assetCode, input.amount);
    const hash = payloadHash(input, "release", assetCode, amount, input.freezeId);
    const existing = await replay(transaction, input.requestId, hash);
    if (existing) return existing;
    const item = itemResult(row);
    if (row.status !== "active" || fundingUnits(amount) > fundingUnits(item.remainingAmount)) throw new Error("解冻金额超过本笔手动冻结剩余金额");
    if (isFunding(assetCode)) {
      // Verify ALL underlying hold identity fields, not just an arbitrary supplied hold id.
      const [holds] = await transaction.execute(`SELECT * FROM ai_wallet_project_holds
        WHERE id = ? AND ledger_id = 52 AND user_id = ? AND tag_name = ? AND hold_no = ? AND request_id = ?
          AND asset_code = ? AND created_by = ? LIMIT 1 FOR UPDATE`,
        [row.funding_hold_id, input.userId, `${MANUAL_FREEZE_HOLD_TAG_PREFIX}${row.freeze_no}`, row.freeze_no, row.freeze_no, assetCode, row.created_by]);
      const hold = rowsOf(holds)[0];
      if (!hold || hold.status !== "active" || fundingUnits(hold.amount) !== fundingUnits(row.amount)
        || fundingUnits(hold.released_amount) !== fundingUnits(row.released_amount)) throw new Error("手动冻结关联台账异常，禁止释放订单或项目冻结");
      const [updated] = await transaction.execute(`UPDATE ai_wallet_project_holds
        SET status = CASE WHEN released_amount + CAST(? AS DECIMAL(36,18)) = amount THEN 'released' ELSE 'active' END,
            released_at = CASE WHEN released_amount + CAST(? AS DECIMAL(36,18)) = amount THEN NOW() ELSE NULL END,
            released_amount = released_amount + CAST(? AS DECIMAL(36,18)), released_by = ?, released_reason = 'wallet_manual_release', updated_at = NOW()
        WHERE id = ? AND ledger_id = 52 AND user_id = ? AND tag_name = ? AND hold_no = ? AND request_id = ?
          AND asset_code = ? AND status = 'active' AND released_amount >= 0 AND released_amount + CAST(? AS DECIMAL(36,18)) <= amount`,
        [amount, amount, amount, input.actorUserId, row.funding_hold_id, input.userId,
          `${MANUAL_FREEZE_HOLD_TAG_PREFIX}${row.freeze_no}`, row.freeze_no, row.freeze_no, assetCode, amount]);
      if (Number(updated.affectedRows) !== 1) throw new Error("手动冻结底层释放失败");
    } else {
      if (row.funding_hold_id != null) throw new Error("独立资产手动冻结关联异常");
      await moveAsset(transaction, input, assetCode, amount, "release", input.freezeId);
    }
    const [updated] = await transaction.execute(`UPDATE ai_wallet_manual_freezes
      SET status = CASE WHEN released_amount + CAST(? AS DECIMAL(36,18)) = amount THEN 'released' ELSE 'active' END,
          released_amount = released_amount + CAST(? AS DECIMAL(36,18)), updated_at = NOW()
      WHERE id = ? AND ledger_id = 52 AND user_id = ? AND source = 'manual' AND status = 'active'
        AND released_amount >= 0 AND released_amount + CAST(? AS DECIMAL(36,18)) <= amount`,
      [amount, amount, input.freezeId, input.userId, amount]);
    if (Number(updated.affectedRows) !== 1) throw new Error("手动冻结剩余额更新失败");
    return insertAction(transaction, input, "release", await readFreeze(transaction, input.userId, input.freezeId), amount, hash);
  });
}

export type WalletManualFundingFreezeEvent = {
  id: string; ledgerId: 52; amount: string; currency: "CNY" | "USDT";
  sourceType: "wallet_hold"; type: "manual_freeze" | "manual_release";
  note: string; createdAt: string; balanceAfter: null;
};
/** Compatibility read: never initializes schema, never touches orders or user balances. */
export async function listWalletManualFundingFreezeEvents(userId: number): Promise<WalletManualFundingFreezeEvent[]> {
  assertIdentity(52, userId);
  const connection = await getDbConnection();
  if (!connection) throw new Error("数据库连接失败");
  try {
    const [rows] = await (connection as any).execute(`SELECT id, asset_code, direction, amount, note, created_at
      FROM ai_wallet_manual_freeze_actions
      WHERE ledger_id = 52 AND user_id = ? AND source = 'manual' AND asset_code IN ('CNY', 'USDT')
      ORDER BY created_at DESC, id DESC`, [userId]);
    return rowsOf(rows).map(row => ({ id: `manual_hold_${row.id}`, ledgerId: 52,
      amount: `${row.direction === "freeze" ? "-" : ""}${String(row.amount)}`, currency: row.asset_code === "CNY" ? "CNY" : "USDT",
      sourceType: "wallet_hold", type: row.direction === "freeze" ? "manual_freeze" : "manual_release",
      note: `${row.direction === "freeze" ? "手动冻结" : "手动解冻"}${row.note ? ` · ${row.note}` : ""}`,
      createdAt: String(row.created_at || ""), balanceAfter: null }));
  } catch (error: any) {
    if ((error?.code ?? error?.cause?.code) === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}
