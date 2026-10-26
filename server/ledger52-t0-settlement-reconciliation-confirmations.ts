import { TRPCError } from "@trpc/server";
import { getDbConnection, getDbTransactionConnection } from "./db";

const LEDGER_ID = 52;
const CONFIRMATION_TABLE = "ledger52_t0_weekly_settlement_reconciliation_confirmations";

type SettlementSourceStatus = "realtime" | "frozen" | "backfill";

export type Ledger52T0SettlementReconciliationConfirmation = {
  id: string;
  weekStartBjt: string;
  basisHash: string;
  settlementSourceStatus: SettlementSourceStatus;
  settlementSourceHash: string | null;
  note: string;
  confirmedByUserId: number;
  confirmedByName: string;
  confirmedAt: string;
};

function asRows(result: unknown): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as any[];
  return Array.isArray(result) ? result as any[] : [];
}

function isTableMissing(error: unknown) {
  const code = String((error as any)?.code || "");
  return code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_TABLE_ERROR";
}

function assertWritableEnvironment() {
  if (process.env.PREVIEW_READONLY === "true" || process.env.FAST_PREVIEW === "true" || process.env.DEV_BYPASS_AUTH === "true") {
    throw new TRPCError({ code: "FORBIDDEN", message: "当前为只读热预览：可查看历史周对账与确认流程，但不会保存账目已平确认" });
  }
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

function assertHash(value: string, label: string, optional = false) {
  const text = String(value || "").trim();
  if (optional && !text) return null;
  if (!/^[a-f0-9]{64}$/i.test(text)) throw new TRPCError({ code: "BAD_REQUEST", message: `${label}无效，请刷新后重新核对` });
  return text.toLowerCase();
}

function mapConfirmation(row: any): Ledger52T0SettlementReconciliationConfirmation {
  return {
    id: String(row.id),
    weekStartBjt: String(row.week_start_bjt).slice(0, 10),
    basisHash: String(row.basis_hash || "").toLowerCase(),
    settlementSourceStatus: row.settlement_source_status === "frozen" || row.settlement_source_status === "backfill" ? row.settlement_source_status : "realtime",
    settlementSourceHash: row.settlement_source_hash ? String(row.settlement_source_hash).toLowerCase() : null,
    note: String(row.note || ""),
    confirmedByUserId: Number(row.confirmed_by_user_id),
    confirmedByName: String(row.confirmed_by_name_snapshot || `用户#${row.confirmed_by_user_id}`),
    confirmedAt: new Date(row.confirmed_at).toISOString(),
  };
}

async function selectLatestConfirmation(connection: any, input: {
  journalOwnerUserId: number;
  weekStartBjt: string;
  forUpdate?: boolean;
}) {
  const [rows] = await connection.execute(
    `SELECT confirmation.id, DATE_FORMAT(confirmation.week_start_bjt, '%Y-%m-%d') AS week_start_bjt,
            confirmation.basis_hash, confirmation.settlement_source_status, confirmation.settlement_source_hash,
            confirmation.note, confirmation.confirmed_by_user_id, confirmation.confirmed_by_name_snapshot, confirmation.confirmed_at
       FROM ${CONFIRMATION_TABLE} confirmation
      WHERE confirmation.ledger_id = ?
        AND confirmation.journal_owner_user_id = ?
        AND confirmation.week_start_bjt = ?
      ORDER BY confirmation.confirmed_at DESC, confirmation.id DESC
      LIMIT 1${input.forUpdate ? " FOR UPDATE" : ""}`,
    [LEDGER_ID, input.journalOwnerUserId, input.weekStartBjt],
  );
  const row = asRows(rows)[0];
  return row ? mapConfirmation(row) : null;
}

/** 读取路径绝不建表；未曾确认过的结算周返回 null。 */
export async function getLatestLedger52T0SettlementReconciliationConfirmation(input: {
  journalOwnerUserId: number;
  weekStartBjt: string;
}): Promise<Ledger52T0SettlementReconciliationConfirmation | null> {
  const weekStartBjt = parseMondayWeekStart(input.weekStartBjt);
  const connection = await getDbConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0对账确认数据库连接失败" });
  try {
    return await selectLatestConfirmation(connection, { journalOwnerUserId: input.journalOwnerUserId, weekStartBjt });
  } catch (error) {
    if (isTableMissing(error)) return null;
    throw error;
  }
}

/** 仅在生产确认时建表；确认本身为追加式凭证，禁止覆盖历史确认。 */
async function ensureSettlementReconciliationConfirmationTable(connection: any) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${CONFIRMATION_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      ledger_id INT NOT NULL,
      journal_owner_user_id INT NOT NULL,
      week_start_bjt DATE NOT NULL,
      basis_hash CHAR(64) NOT NULL,
      settlement_source_status ENUM('realtime', 'frozen', 'backfill') NOT NULL,
      settlement_source_hash CHAR(64) NULL,
      basis_snapshot_json LONGTEXT NOT NULL,
      note VARCHAR(300) NOT NULL DEFAULT '',
      client_request_id VARCHAR(64) NOT NULL,
      confirmed_by_user_id BIGINT UNSIGNED NOT NULL,
      confirmed_by_name_snapshot VARCHAR(160) NOT NULL,
      confirmed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_t0_reconciliation_confirmation_request (ledger_id, journal_owner_user_id, client_request_id),
      UNIQUE KEY uq_t0_reconciliation_confirmation_basis (ledger_id, journal_owner_user_id, week_start_bjt, basis_hash),
      KEY idx_t0_reconciliation_confirmation_week (ledger_id, journal_owner_user_id, week_start_bjt, id DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='52号账本T+0周账户对账已平确认：追加式、不可改写的银行对账审计凭证'
  `);
}

export async function createLedger52T0SettlementReconciliationConfirmation(input: {
  journalOwnerUserId: number;
  actorUserId: number;
  weekStartBjt: string;
  basisHash: string;
  settlementSourceStatus: SettlementSourceStatus;
  settlementSourceHash?: string | null;
  basisSnapshot: unknown;
  note?: string;
  clientRequestId: string;
}): Promise<Ledger52T0SettlementReconciliationConfirmation> {
  assertWritableEnvironment();
  const weekStartBjt = parseMondayWeekStart(input.weekStartBjt);
  const basisHash = assertHash(input.basisHash, "对账依据") as string;
  const settlementSourceHash = assertHash(input.settlementSourceHash || "", "结算来源哈希", true);
  const settlementSourceStatus: SettlementSourceStatus = input.settlementSourceStatus === "frozen" || input.settlementSourceStatus === "backfill"
    ? input.settlementSourceStatus
    : "realtime";
  const note = String(input.note || "").trim();
  const clientRequestId = String(input.clientRequestId || "").trim();
  if (note.length > 300) throw new TRPCError({ code: "BAD_REQUEST", message: "核对说明不能超过300字" });
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(clientRequestId)) throw new TRPCError({ code: "BAD_REQUEST", message: "对账确认请求标识无效，请刷新后重试" });
  let basisSnapshotJson = "";
  try {
    basisSnapshotJson = JSON.stringify(input.basisSnapshot);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "对账依据无法保存" });
  }
  if (!basisSnapshotJson || basisSnapshotJson.length > 2_000_000) throw new TRPCError({ code: "BAD_REQUEST", message: "对账依据过大，无法保存" });

  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0对账确认数据库连接失败" });
  const tx: any = connection;
  try {
    await ensureSettlementReconciliationConfirmationTable(tx);
    await tx.beginTransaction();
    const [requestRows] = await tx.execute(
      `SELECT confirmation.id, DATE_FORMAT(confirmation.week_start_bjt, '%Y-%m-%d') AS week_start_bjt,
              confirmation.basis_hash, confirmation.settlement_source_status, confirmation.settlement_source_hash,
              confirmation.note, confirmation.confirmed_by_user_id, confirmation.confirmed_by_name_snapshot, confirmation.confirmed_at
         FROM ${CONFIRMATION_TABLE} confirmation
        WHERE confirmation.ledger_id = ? AND confirmation.journal_owner_user_id = ? AND confirmation.client_request_id = ?
        LIMIT 1 FOR UPDATE`,
      [LEDGER_ID, input.journalOwnerUserId, clientRequestId],
    );
    const existingByRequest = asRows(requestRows)[0];
    if (existingByRequest) {
      await tx.commit();
      return mapConfirmation(existingByRequest);
    }
    const [actorRows] = await tx.execute(
      `SELECT COALESCE(NULLIF(name, ''), NULLIF(username, ''), CONCAT('用户#', id)) AS name FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
      [input.actorUserId],
    );
    const confirmedByName = String(asRows(actorRows)[0]?.name || `用户#${input.actorUserId}`).slice(0, 160);
    await tx.execute(
      `INSERT IGNORE INTO ${CONFIRMATION_TABLE}
        (ledger_id, journal_owner_user_id, week_start_bjt, basis_hash, settlement_source_status, settlement_source_hash,
         basis_snapshot_json, note, client_request_id, confirmed_by_user_id, confirmed_by_name_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        LEDGER_ID,
        input.journalOwnerUserId,
        weekStartBjt,
        basisHash,
        settlementSourceStatus,
        settlementSourceHash,
        basisSnapshotJson,
        note,
        clientRequestId,
        input.actorUserId,
        confirmedByName,
      ],
    );
    const [basisRows] = await tx.execute(
      `SELECT confirmation.id, DATE_FORMAT(confirmation.week_start_bjt, '%Y-%m-%d') AS week_start_bjt,
              confirmation.basis_hash, confirmation.settlement_source_status, confirmation.settlement_source_hash,
              confirmation.note, confirmation.confirmed_by_user_id, confirmation.confirmed_by_name_snapshot, confirmation.confirmed_at
         FROM ${CONFIRMATION_TABLE} confirmation
        WHERE confirmation.ledger_id = ? AND confirmation.journal_owner_user_id = ?
          AND confirmation.week_start_bjt = ? AND confirmation.basis_hash = ?
        ORDER BY confirmation.id DESC LIMIT 1 FOR UPDATE`,
      [LEDGER_ID, input.journalOwnerUserId, weekStartBjt, basisHash],
    );
    const confirmationRow = asRows(basisRows)[0];
    if (!confirmationRow) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "账目已平确认保存后读取失败" });
    const confirmation = mapConfirmation(confirmationRow);
    await tx.commit();
    return confirmation;
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}
