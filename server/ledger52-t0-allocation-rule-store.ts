import { TRPCError } from "@trpc/server";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbConnection, getDbTransactionConnection } from "./db";
import {
  getDefaultLedger52T0AllocationRuleSettings,
  ledger52T0AllocationPrincipalRuleSchema,
  ledger52T0AllocationRuleSettingsSchema,
  ledger52T0AllocationRuleVersionSchema,
  setLedger52T0AllocationRulesInputSchema,
  type GetLedger52T0AllocationRulesInput,
  type Ledger52T0AllocationRuleSettings,
  type Ledger52T0AllocationRules,
  type SetLedger52T0AllocationRulesInput,
} from "../shared/t0-allocation-rule-store";

export type {
  GetLedger52T0AllocationRulesInput,
  Ledger52T0AllocationRuleSettings,
  Ledger52T0AllocationRules,
  SetLedger52T0AllocationRulesInput,
} from "../shared/t0-allocation-rule-store";

const LEDGER_ID = 52;
type StoredRules = Ledger52T0AllocationRuleSettings & { version: number };
type PrincipalSnapshot = Pick<Ledger52T0AllocationRules, "principal" | "principalVersion">;
interface AllocationRuleRow extends RowDataPacket {
  rules_json: unknown;
  version: unknown;
}

function assertActorUserId(actorUserId: number): void {
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "分配规则操作者无效" });
  }
}

function hasMysqlError(error: unknown, code: string, errno: number): boolean {
  return !!error && typeof error === "object"
    && (("code" in error && error.code === code) || ("errno" in error && error.errno === errno));
}

function defaultStoredRules(): StoredRules {
  return { ...getDefaultLedger52T0AllocationRuleSettings(), version: 0 };
}

/** 固定字段顺序用于语义一致比较，不按输入对象或数据库JSON键顺序比较。 */
function serializeSettings(settings: Ledger52T0AllocationRuleSettings): string {
  return JSON.stringify({
    weightedOrder: {
      distanceInfluence: settings.weightedOrder.distanceInfluence,
      statusInfluence: settings.weightedOrder.statusInfluence,
      pnlInfluence: settings.weightedOrder.pnlInfluence,
    },
    contribution: {
      outgoing: settings.contribution.outgoing,
      incomingAmount: settings.contribution.incomingAmount,
      incomingCount: settings.contribution.incomingCount,
    },
    market: {
      referrals: settings.market.referrals,
      capital: settings.market.capital,
      trading: settings.market.trading,
      output: settings.market.output,
      indirectDecay: settings.market.indirectDecay,
      retentionInfluence: settings.market.retentionInfluence,
      retentionDays: settings.market.retentionDays,
    },
  });
}

function mapStoredRules(row: AllocationRuleRow): StoredRules {
  try {
    if (typeof row.rules_json !== "string") throw new Error("规则JSON必须为字符串");
    const json: unknown = JSON.parse(row.rules_json);
    const settings = ledger52T0AllocationRuleSettingsSchema.parse(json);
    // mysql2可能把BIGINT返回为十进制字符串；不接受null、空串或隐式boolean转换。
    const rawVersion = row.version;
    if (typeof rawVersion !== "number"
      && !(typeof rawVersion === "string" && /^(0|[1-9]\d*)$/.test(rawVersion))) {
      throw new Error("规则版本格式无效");
    }
    const version = ledger52T0AllocationRuleVersionSchema.parse(Number(rawVersion));
    return { ...settings, version };
  } catch (cause) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "分配规则存储数据无效，请联系管理员", cause });
  }
}

/** 动态导入防止journal/plan/store初始化循环；必须跳过旧服务的建表逻辑。 */
async function getPrincipalSnapshot(connection?: PoolConnection, lockRules = false): Promise<PrincipalSnapshot> {
  const { getLedger52T0SharedIncomePrincipalRule } = await import("./ledger52-t0-journal");
  const existing = await getLedger52T0SharedIncomePrincipalRule({ skipTableEnsure: true, connection, lockRules });
  const principal = ledger52T0AllocationPrincipalRuleSchema.safeParse({
    curve: existing.curve,
    influencePercentage: existing.influencePercentage,
  });
  const version = ledger52T0AllocationRuleVersionSchema.safeParse(existing.version);
  if (!principal.success || !version.success) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "既有本金规则数据或版本无效" });
  }
  return { principal: principal.data, principalVersion: version.data };
}

/** 仅供已鉴权管理员路由：新规则按ledger52+操作者隔离，GET永不建表或写数据。 */
export async function getLedger52T0AllocationRules(
  input: GetLedger52T0AllocationRulesInput & { connection?: PoolConnection; lockRules?: boolean },
): Promise<Ledger52T0AllocationRules> {
  assertActorUserId(input.actorUserId);
  const connection = input.connection || await getDbConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  let stored = defaultStoredRules();
  let row: AllocationRuleRow | undefined;
  try {
    const [rows] = await connection.execute<AllocationRuleRow[]>(
      `SELECT rules_json, version
         FROM ledger52_t0_journal_allocation_rules
        WHERE ledger_id = ? AND user_id = ? LIMIT 1${input.lockRules ? " FOR UPDATE" : ""}`,
      [LEDGER_ID, input.actorUserId],
    );
    row = rows[0];
  } catch (error) {
    // 仅表不存在允许返回版本0默认配置；连接、权限等其它失败必须暴露。
    if (!hasMysqlError(error, "ER_NO_SUCH_TABLE", 1146)) throw error;
  }
  if (row) stored = mapStoredRules(row);
  return { ...stored, ...await getPrincipalSnapshot(input.connection, input.lockRules) };
}

/** 显式保存三项未来配置及审计，不保存本金、私有目标年化或修改历史快照。 */
export async function setLedger52T0AllocationRules(
  input: SetLedger52T0AllocationRulesInput,
): Promise<Ledger52T0AllocationRules> {
  assertActorUserId(input.actorUserId);
  if (process.env.NODE_ENV !== "production" && process.env.FAST_PREVIEW === "true") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "热预览仅应用本次试算，不写入数据库" });
  }
  const parsed = setLedger52T0AllocationRulesInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "分配规则字段或版本无效：影响度须为0至1，留存参考天数须为1至365的整数",
      cause: parsed.error,
    });
  }
  const { weightedOrder, contribution, market, actorUserId, expectedVersion } = parsed.data;
  const next: Ledger52T0AllocationRuleSettings = { weightedOrder, contribution, market };
  const nextJson = serializeSettings(next);
  // 先读取旧本金规则，避免提交后读取失败使客户端误以为本次保存没有成功。
  const principal = await getPrincipalSnapshot();
  const tx = await getDbTransactionConnection();
  if (!tx) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  let transactionStarted = false;
  try {
    // MySQL DDL隐式提交：仅显式保存时、BEGIN之前创建表；不放在读取或部署路径。
    await tx.execute(`CREATE TABLE IF NOT EXISTS ledger52_t0_journal_allocation_rules (
      ledger_id INT NOT NULL,
      user_id INT NOT NULL,
      rules_json LONGTEXT NOT NULL,
      version BIGINT NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (ledger_id, user_id)
    ) ENGINE=InnoDB`);
    await tx.execute(`CREATE TABLE IF NOT EXISTS ledger52_t0_journal_allocation_rule_audits (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ledger_id INT NOT NULL,
      user_id INT NOT NULL,
      prev_json LONGTEXT NULL,
      next_json LONGTEXT NOT NULL,
      version BIGINT NOT NULL,
      operator_user_id INT NOT NULL,
      created_at DATETIME(3) NOT NULL,
      KEY idx_t0_allocation_rule_audit_owner (ledger_id, user_id, created_at)
    ) ENGINE=InnoDB`);
    await tx.beginTransaction();
    transactionStarted = true;
    const [rows] = await tx.execute<AllocationRuleRow[]>(
      `SELECT rules_json, version
         FROM ledger52_t0_journal_allocation_rules
        WHERE ledger_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [LEDGER_ID, actorUserId],
    );
    const existing = rows[0];
    const previous = existing ? mapStoredRules(existing) : defaultStoredRules();
    if (previous.version !== expectedVersion) {
      throw new TRPCError({ code: "CONFLICT", message: "分配规则已更新，请刷新后重试" });
    }
    if (serializeSettings(previous) === nextJson) {
      await tx.commit();
      transactionStarted = false;
      return { ...previous, ...principal };
    }
    if (previous.version >= Number.MAX_SAFE_INTEGER) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "分配规则版本已达上限" });
    }
    const saved: StoredRules = { ...next, version: previous.version + 1 };
    if (existing) {
      const [result] = await tx.execute<ResultSetHeader>(
        `UPDATE ledger52_t0_journal_allocation_rules
            SET rules_json = ?, version = ?, updated_at = NOW(3)
          WHERE ledger_id = ? AND user_id = ? AND version = ?`,
        [nextJson, saved.version, LEDGER_ID, actorUserId, previous.version],
      );
      if (result.affectedRows !== 1) {
        throw new TRPCError({ code: "CONFLICT", message: "分配规则已更新，请刷新后重试" });
      }
    } else {
      // 不使用UPSERT；并发首次保存不得覆盖已经写入的另一版本。
      await tx.execute(
        `INSERT INTO ledger52_t0_journal_allocation_rules
          (ledger_id, user_id, rules_json, version, updated_at)
         VALUES (?, ?, ?, ?, NOW(3))`,
        [LEDGER_ID, actorUserId, nextJson, saved.version],
      );
    }
    await tx.execute(
      `INSERT INTO ledger52_t0_journal_allocation_rule_audits
        (ledger_id, user_id, prev_json, next_json, version, operator_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
      [LEDGER_ID, actorUserId, existing ? JSON.stringify(previous) : null,
        JSON.stringify(saved), saved.version, actorUserId],
    );
    await tx.commit();
    transactionStarted = false;
    return { ...saved, ...principal };
  } catch (error) {
    if (transactionStarted) await tx.rollback();
    if (hasMysqlError(error, "ER_DUP_ENTRY", 1062)) {
      throw new TRPCError({ code: "CONFLICT", message: "分配规则已更新，请刷新后重试" });
    }
    throw error;
  } finally {
    if (typeof (tx as PoolConnection).release === "function") (tx as PoolConnection).release();
    else await tx.end();
  }
}
