import { TRPCError } from "@trpc/server";
import { getDbConnection, getDbTransactionConnection } from "./db";

const LEDGER_ID = 52;
const ADJUSTMENT_TABLE = "ledger52_t0_weekly_settlement_adjustments";
const MONEY_TOLERANCE_CENTS = 0n;

type AdjustmentType = "source_correction" | "allocation_transfer" | "hold";

type AdjustmentLineInput = { userId: number; amount: string };

export type Ledger52T0SettlementAdjustmentLine = {
  userId: number;
  name: string;
  amount: number;
};

export type Ledger52T0SettlementAdjustment = {
  id: string;
  weekStartBjt: string;
  type: AdjustmentType;
  accountId: string | null;
  accountName: string | null;
  sourceClosingEntryId: string | null;
  sourceNetPnlDelta: number;
  allocations: Ledger52T0SettlementAdjustmentLine[];
  reason: string;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
};

function asRows(result: unknown): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as any[];
  return Array.isArray(result) ? result as any[] : [];
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTableMissing(error: unknown) {
  const code = String((error as any)?.code || "");
  return code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_TABLE_ERROR";
}

function assertWritableEnvironment() {
  if (process.env.PREVIEW_READONLY === "true" || process.env.FAST_PREVIEW === "true" || process.env.DEV_BYPASS_AUTH === "true") {
    throw new TRPCError({ code: "FORBIDDEN", message: "当前为只读热预览：可查看结算调整流程，但不会保存任何调整记录" });
  }
}

function parseMoneyCents(raw: string, field: string) {
  const text = String(raw || "").trim();
  if (!/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(text)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${field}须为最多两位小数的有效金额` });
  }
  const negative = text.startsWith("-");
  const normalized = negative ? text.slice(1) : text;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction.padEnd(2, "0") || "0").slice(0, 2));
  const signed = negative ? -cents : cents;
  if (signed > 100_000_000_000_00n || signed < -100_000_000_000_00n) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${field}超出允许范围` });
  }
  return signed;
}

function formatMoneyCents(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

function parseMondayWeekStart(value: string) {
  const text = String(value || "").trim();
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) throw new TRPCError({ code: "BAD_REQUEST", message: "结算周须为 YYYY-MM-DD 格式的周一" });
  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])));
  if (date.getUTCFullYear() !== Number(matched[1]) || date.getUTCMonth() !== Number(matched[2]) - 1 || date.getUTCDate() !== Number(matched[3]) || date.getUTCDay() !== 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "结算周必须选择北京时间周一" });
  }
  return text;
}

function parseAllocationJson(raw: unknown): Ledger52T0SettlementAdjustmentLine[] {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const userId = Number(item?.userId);
      const name = String(item?.name || `用户#${userId}`);
      const amount = Number(item?.amount);
      return Number.isInteger(userId) && userId > 0 && Number.isFinite(amount) ? [{ userId, name, amount }] : [];
    });
  } catch {
    return [];
  }
}

function mapAdjustment(row: any): Ledger52T0SettlementAdjustment {
  return {
    id: String(row.id),
    weekStartBjt: String(row.week_start_bjt).slice(0, 10),
    type: row.adjustment_type === "allocation_transfer" || row.adjustment_type === "hold" ? row.adjustment_type : "source_correction",
    accountId: row.account_id === null || row.account_id === undefined ? null : String(row.account_id),
    accountName: row.account_name_snapshot ? String(row.account_name_snapshot) : null,
    sourceClosingEntryId: row.source_closing_entry_id === null || row.source_closing_entry_id === undefined ? null : String(row.source_closing_entry_id),
    sourceNetPnlDelta: toNumber(row.source_net_pnl_delta),
    allocations: parseAllocationJson(row.allocation_json),
    reason: String(row.reason || ""),
    createdByUserId: Number(row.created_by_user_id),
    createdByName: String(row.created_by_name || `用户#${row.created_by_user_id}`),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** 读取路径永不建表；尚未上线时返回空调整单列表。 */
export async function listLedger52T0SettlementAdjustments(input: {
  journalOwnerUserId: number;
  weekStartBjt?: string;
  targetUserId?: number;
}): Promise<Ledger52T0SettlementAdjustment[]> {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0结算调整数据库连接失败" });
  const params: Array<string | number> = [LEDGER_ID, input.journalOwnerUserId];
  let weekClause = "";
  if (input.weekStartBjt) {
    weekClause = " AND adjustment.week_start_bjt = ?";
    params.push(parseMondayWeekStart(input.weekStartBjt));
  }
  try {
    const [rows] = await conn.execute(
      `SELECT adjustment.id, DATE_FORMAT(adjustment.week_start_bjt, '%Y-%m-%d') AS week_start_bjt,
              adjustment.adjustment_type, adjustment.account_id, adjustment.account_name_snapshot,
              adjustment.source_closing_entry_id, adjustment.source_net_pnl_delta, adjustment.allocation_json,
              adjustment.reason, adjustment.created_by_user_id, adjustment.created_at,
              COALESCE(NULLIF(creator.name, ''), NULLIF(creator.username, ''), CONCAT('用户#', adjustment.created_by_user_id)) AS created_by_name
         FROM ${ADJUSTMENT_TABLE} adjustment
         LEFT JOIN users creator ON creator.id = adjustment.created_by_user_id
        WHERE adjustment.ledger_id = ? AND adjustment.journal_owner_user_id = ?${weekClause}
        ORDER BY adjustment.created_at DESC, adjustment.id DESC
        LIMIT 500`,
      params,
    );
    const adjustments = asRows(rows).map(mapAdjustment);
    if (!input.targetUserId) return adjustments;
    return adjustments.flatMap((adjustment) => {
      const allocations = adjustment.allocations.filter((line) => line.userId === input.targetUserId);
      return allocations.length > 0 ? [{ ...adjustment, allocations }] : [];
    });
  } catch (error) {
    if (isTableMissing(error)) return [];
    throw error;
  }
}

/** 建表仅在正式保存调整单时调用；预览/开发只读路径在进入该函数前已经拒绝。 */
async function ensureSettlementAdjustmentTable(conn: any) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ${ADJUSTMENT_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      ledger_id INT NOT NULL,
      journal_owner_user_id INT NOT NULL,
      week_start_bjt DATE NOT NULL,
      adjustment_type ENUM('source_correction', 'allocation_transfer', 'hold') NOT NULL,
      account_id BIGINT UNSIGNED NULL,
      account_name_snapshot VARCHAR(160) NULL,
      source_closing_entry_id BIGINT UNSIGNED NULL,
      source_net_pnl_delta DECIMAL(24,8) NOT NULL DEFAULT 0,
      allocation_json LONGTEXT NOT NULL,
      reason VARCHAR(500) NOT NULL,
      context_json LONGTEXT NOT NULL,
      client_request_id VARCHAR(64) NOT NULL,
      created_by_user_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_t0_settlement_adjustment_request (ledger_id, journal_owner_user_id, client_request_id),
      KEY idx_t0_settlement_adjustment_week (ledger_id, journal_owner_user_id, week_start_bjt, id DESC),
      KEY idx_t0_settlement_adjustment_closing (ledger_id, journal_owner_user_id, source_closing_entry_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='52号账本T+0周结算追加调整单：不改订单、原收益或冻结周报'
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ledger52_t0_weekly_settlement_adjustment_audits (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      adjustment_id BIGINT UNSIGNED NOT NULL,
      ledger_id INT NOT NULL,
      journal_owner_user_id INT NOT NULL,
      operation ENUM('create') NOT NULL,
      before_snapshot LONGTEXT NULL,
      after_snapshot LONGTEXT NOT NULL,
      reason_snapshot VARCHAR(500) NOT NULL,
      actor_user_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_t0_settlement_adjustment_audit (ledger_id, journal_owner_user_id, adjustment_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='52号账本T+0周结算调整单不可变审计快照'
  `);
}

async function findAdjustmentByRequest(tx: any, journalOwnerUserId: number, clientRequestId: string) {
  const [rows] = await tx.execute(
    `SELECT adjustment.id, DATE_FORMAT(adjustment.week_start_bjt, '%Y-%m-%d') AS week_start_bjt,
            adjustment.adjustment_type, adjustment.account_id, adjustment.account_name_snapshot,
            adjustment.source_closing_entry_id, adjustment.source_net_pnl_delta, adjustment.allocation_json,
            adjustment.reason, adjustment.created_by_user_id, adjustment.created_at,
            COALESCE(NULLIF(creator.name, ''), NULLIF(creator.username, ''), CONCAT('用户#', adjustment.created_by_user_id)) AS created_by_name
       FROM ${ADJUSTMENT_TABLE} adjustment
       LEFT JOIN users creator ON creator.id = adjustment.created_by_user_id
      WHERE adjustment.ledger_id = ? AND adjustment.journal_owner_user_id = ? AND adjustment.client_request_id = ?
      LIMIT 1`,
    [LEDGER_ID, journalOwnerUserId, clientRequestId],
  );
  const row = asRows(rows)[0];
  return row ? mapAdjustment(row) : null;
}

export async function createLedger52T0SettlementAdjustment(input: {
  journalOwnerUserId: number;
  actorUserId: number;
  weekStartBjt: string;
  type: AdjustmentType;
  accountId?: string;
  sourceClosingEntryId?: string;
  sourceNetPnlDelta: string;
  allocations: AdjustmentLineInput[];
  reason: string;
  clientRequestId: string;
}) {
  assertWritableEnvironment();
  const weekStartBjt = parseMondayWeekStart(input.weekStartBjt);
  const type: AdjustmentType = input.type === "allocation_transfer" || input.type === "hold" ? input.type : "source_correction";
  const reason = String(input.reason || "").trim();
  const clientRequestId = String(input.clientRequestId || "").trim();
  if (reason.length < 2 || reason.length > 500) throw new TRPCError({ code: "BAD_REQUEST", message: "请填写2至500字的调整原因" });
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(clientRequestId)) throw new TRPCError({ code: "BAD_REQUEST", message: "调整请求标识无效，请刷新后重试" });

  const sourceNetPnlDeltaCents = parseMoneyCents(input.sourceNetPnlDelta, "账户收益补正");
  const rawAccountId = String(input.accountId || "").trim();
  const accountId = rawAccountId ? Number(rawAccountId) : null;
  if (rawAccountId && (!Number.isInteger(accountId) || accountId <= 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "账户无效" });
  const rawClosingId = String(input.sourceClosingEntryId || "").trim();
  const sourceClosingEntryId = rawClosingId ? Number(rawClosingId) : null;
  if (rawClosingId && (!Number.isInteger(sourceClosingEntryId) || sourceClosingEntryId <= 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "来源平仓单无效" });

  const allocationCents = new Map<number, bigint>();
  for (const item of input.allocations ?? []) {
    const userId = Number(item?.userId);
    if (!Number.isInteger(userId) || userId <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "调整用户无效" });
    const amount = parseMoneyCents(item.amount, "用户调整金额");
    if (amount === 0n) continue;
    allocationCents.set(userId, (allocationCents.get(userId) || 0n) + amount);
  }
  const allocationTotalCents = Array.from(allocationCents.values()).reduce((total, amount) => total + amount, 0n);
  if (type === "source_correction") {
    if (!accountId) throw new TRPCError({ code: "BAD_REQUEST", message: "账户收益补正必须选择来源账户" });
    if (sourceNetPnlDeltaCents === 0n) throw new TRPCError({ code: "BAD_REQUEST", message: "账户收益补正不能为0" });
    if (allocationCents.size === 0 || allocationTotalCents !== sourceNetPnlDeltaCents) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "账户补正金额必须与全部用户去向合计完全一致" });
    }
  } else if (type === "allocation_transfer") {
    if (!accountId) throw new TRPCError({ code: "BAD_REQUEST", message: "用户去向调整必须选择来源账户" });
    if (sourceNetPnlDeltaCents !== 0n || allocationCents.size < 2 || allocationTotalCents !== MONEY_TOLERANCE_CENTS) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "用户去向调整必须至少涉及两位用户，且加减合计严格为0" });
    }
  } else if (sourceNetPnlDeltaCents !== 0n || allocationCents.size > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "暂挂说明不能包含金额调整" });
  }

  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0结算调整数据库连接失败" });
  const tx: any = connection;
  try {
    await ensureSettlementAdjustmentTable(tx);
    await tx.beginTransaction();
    const existing = await findAdjustmentByRequest(tx, input.journalOwnerUserId, clientRequestId);
    if (existing) {
      await tx.commit();
      return existing;
    }

    let accountName: string | null = null;
    if (accountId) {
      const [accountRows] = await tx.execute(
        `SELECT id, name FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1 LIMIT 1 FOR UPDATE`,
        [accountId, LEDGER_ID, input.journalOwnerUserId],
      );
      const account = asRows(accountRows)[0];
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "来源账户不存在或已停用" });
      accountName = String(account.name || `账户#${accountId}`);
    }
    if (sourceClosingEntryId) {
      const [closingRows] = await tx.execute(
        `SELECT id, account_id, action FROM ledger52_t0_journal_entries
          WHERE id = ? AND ledger_id = ? AND user_id = ? AND action IN ('closeLong', 'closeShort') LIMIT 1 FOR UPDATE`,
        [sourceClosingEntryId, LEDGER_ID, input.journalOwnerUserId],
      );
      const closing = asRows(closingRows)[0];
      if (!closing) throw new TRPCError({ code: "NOT_FOUND", message: "来源平仓单不存在" });
      if (accountId && Number(closing.account_id) !== accountId) throw new TRPCError({ code: "BAD_REQUEST", message: "来源平仓单不属于所选账户" });
    }

    const userIds = Array.from(allocationCents.keys());
    const namesByUserId = new Map<number, string>();
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => "?").join(", ");
      const [userRows] = await tx.execute(
        `SELECT u.id, COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', u.id)) AS name
           FROM users u
           INNER JOIN ledger_members member ON member.userId = u.id AND member.ledgerId = ?
          WHERE u.id IN (${placeholders})`,
        [LEDGER_ID, ...userIds],
      );
      for (const row of asRows(userRows)) namesByUserId.set(Number(row.id), String(row.name || `用户#${row.id}`));
      if (namesByUserId.size !== userIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "调整对象必须是52号账本成员" });
    }
    const allocations = Array.from(allocationCents.entries()).map(([userId, amount]) => ({
      userId,
      name: namesByUserId.get(userId) || `用户#${userId}`,
      amount: Number(formatMoneyCents(amount)),
    }));
    const sourceNetPnlDelta = Number(formatMoneyCents(sourceNetPnlDeltaCents));
    const context = {
      version: "t0-settlement-adjustment-v1",
      balanceRule: type === "source_correction"
        ? "账户收益补正 = 用户去向合计"
        : type === "allocation_transfer"
          ? "用户去向加减合计 = 0，账户收益不变"
          : "仅暂挂说明，无金额影响",
      sourceClosingEntryId: sourceClosingEntryId ? String(sourceClosingEntryId) : null,
    };
    const [result] = await tx.execute(
      `INSERT INTO ${ADJUSTMENT_TABLE}
        (ledger_id, journal_owner_user_id, week_start_bjt, adjustment_type, account_id, account_name_snapshot,
         source_closing_entry_id, source_net_pnl_delta, allocation_json, reason, context_json, client_request_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        LEDGER_ID,
        input.journalOwnerUserId,
        weekStartBjt,
        type,
        accountId,
        accountName,
        sourceClosingEntryId,
        formatMoneyCents(sourceNetPnlDeltaCents),
        JSON.stringify(allocations),
        reason,
        JSON.stringify(context),
        clientRequestId,
        input.actorUserId,
      ],
    );
    const insertedId = Number((result as any)?.insertId);
    const [rows] = await tx.execute(
      `SELECT adjustment.id, DATE_FORMAT(adjustment.week_start_bjt, '%Y-%m-%d') AS week_start_bjt,
              adjustment.adjustment_type, adjustment.account_id, adjustment.account_name_snapshot,
              adjustment.source_closing_entry_id, adjustment.source_net_pnl_delta, adjustment.allocation_json,
              adjustment.reason, adjustment.created_by_user_id, adjustment.created_at,
              COALESCE(NULLIF(creator.name, ''), NULLIF(creator.username, ''), CONCAT('用户#', adjustment.created_by_user_id)) AS created_by_name
         FROM ${ADJUSTMENT_TABLE} adjustment
         LEFT JOIN users creator ON creator.id = adjustment.created_by_user_id
        WHERE adjustment.id = ? AND adjustment.ledger_id = ? AND adjustment.journal_owner_user_id = ? LIMIT 1`,
      [insertedId, LEDGER_ID, input.journalOwnerUserId],
    );
    const row = asRows(rows)[0];
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "结算调整保存后读取失败" });
    const adjustment = mapAdjustment(row);
    await tx.execute(
      `INSERT INTO ledger52_t0_weekly_settlement_adjustment_audits
        (adjustment_id, ledger_id, journal_owner_user_id, operation, before_snapshot, after_snapshot, reason_snapshot, actor_user_id)
       VALUES (?, ?, ?, 'create', NULL, ?, ?, ?)`,
      [
        insertedId,
        LEDGER_ID,
        input.journalOwnerUserId,
        JSON.stringify(adjustment),
        reason,
        input.actorUserId,
      ],
    );
    await tx.commit();
    return adjustment;
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}
