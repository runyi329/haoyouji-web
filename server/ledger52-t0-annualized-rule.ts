import { TRPCError } from "@trpc/server";
import { getDbConnection, getDbTransactionConnection } from "./db";
import {
  DEFAULT_T0_ANNUALIZED_ALLOCATION_RULE,
  type T0AnnualizedAllocationRule,
} from "../shared/t0-annualized-allocation-rule";

export type Ledger52T0SharedIncomeAnnualizedRule = T0AnnualizedAllocationRule;
export type SetLedger52T0SharedIncomeAnnualizedRuleInput = {
  actorUserId: number;
  influence: number;
  targets: Array<{ userId: number; targetPercentage: number }>;
  expectedVersion: number;
};

const LEDGER_ID = 52;

function assertActorUserId(actorUserId: number): void {
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "年化规则操作者无效" });
  }
}

function defaultRule(): Ledger52T0SharedIncomeAnnualizedRule {
  return { ...DEFAULT_T0_ANNUALIZED_ALLOCATION_RULE, targets: {} };
}

function normalizeRule(input: Pick<SetLedger52T0SharedIncomeAnnualizedRuleInput, "influence" | "targets">) {
  if (!Number.isFinite(input.influence) || input.influence < 0 || input.influence > 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "年化影响度必须为0至1" });
  }
  if (!Array.isArray(input.targets) || input.targets.length > 1000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "目标年化最多配置1000人" });
  }
  const targets: Record<string, number> = {};
  const ids = new Set<number>();
  for (const item of input.targets) {
    if (!Number.isSafeInteger(item.userId) || item.userId <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "目标年化用户无效" });
    }
    if (ids.has(item.userId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "目标年化不可重复配置同一用户" });
    }
    if (!Number.isFinite(item.targetPercentage) || item.targetPercentage < 0 || item.targetPercentage > 10000) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "目标年化必须为0至10000的百分数" });
    }
    ids.add(item.userId);
    targets[String(item.userId)] = Number(item.targetPercentage.toFixed(2));
  }
  // 与 DECIMAL(6,4) 存储精度一致，避免相同配置产生无意义的新版本。
  return { influence: Number(input.influence.toFixed(4)), targets };
}

function mapRule(row: any): Ledger52T0SharedIncomeAnnualizedRule {
  const parsed: unknown = JSON.parse(String(row.targets_json));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "目标年化规则数据无效" });
  }
  const entries = Object.entries(parsed);
  if (entries.some(([, value]) => typeof value !== "number")) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "目标年化规则数据无效" });
  }
  const normalized = normalizeRule({
    influence: Number(row.influence),
    targets: entries.map(([userId, targetPercentage]) => ({ userId: Number(userId), targetPercentage: targetPercentage as number })),
  });
  const version = Number(row.version);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "目标年化规则版本无效" });
  }
  return { ...normalized, version };
}

/** 独立于报价页近期用户和当前共享候选；只读已授权所有者的T+0参与目录，绝不建表。 */
export async function getLedger52T0SharedIncomeAnnualizedUsers(input: {
  journalOwnerUserId: number;
}): Promise<Array<{ id: string; name: string; username?: string }>> {
  if (!Number.isSafeInteger(input.journalOwnerUserId) || input.journalOwnerUserId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "目标年化用户目录归属无效" });
  }
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const [rows] = await conn.execute(
    `SELECT participants.related_user_id, u.name, u.username, MAX(participants.last_used_at) AS last_used_at
       FROM (
         SELECT related_user_id, trade_time AS last_used_at
           FROM ledger52_t0_journal_entries
          WHERE ledger_id = ? AND user_id = ?
         UNION ALL
         SELECT related_user_id, created_at AS last_used_at
           FROM ledger52_t0_journal_payout_logs
          WHERE ledger_id = ? AND user_id = ?
         UNION ALL
         SELECT related_user_id, last_used_at
           FROM ledger52_t0_journal_related_funds
          WHERE ledger_id = ? AND user_id = ? AND is_active = 1
       ) participants
       LEFT JOIN users u ON u.id = participants.related_user_id
      WHERE participants.related_user_id > 0
        AND NOT EXISTS (
          SELECT 1 FROM ledger52_t0_journal_deleted_dimensions deleted_user
           WHERE deleted_user.ledger_id = ? AND deleted_user.user_id = ?
             AND deleted_user.dimension = 'related_user'
             AND deleted_user.dimension_id = participants.related_user_id
        )
      GROUP BY participants.related_user_id, u.name, u.username
      ORDER BY last_used_at DESC, participants.related_user_id ASC`,
    [
      LEDGER_ID, input.journalOwnerUserId,
      LEDGER_ID, input.journalOwnerUserId,
      LEDGER_ID, input.journalOwnerUserId,
      LEDGER_ID, input.journalOwnerUserId,
    ],
  );
  return (rows as any[]).map((row) => {
    const id = String(row.related_user_id);
    const username = String(row.username || "").trim();
    return {
      id,
      name: String(row.name || "").trim() || username || `用户#${id}`,
      ...(username ? { username } : {}),
    };
  });
}

/** 仅由真实T+0管理员鉴权路由调用；规则按操作者隔离。GET绝不建表。 */
export async function getLedger52T0SharedIncomeAnnualizedRule(input: {
  actorUserId: number;
  connection?: import("mysql2/promise").PoolConnection;
  lockRules?: boolean;
}): Promise<Ledger52T0SharedIncomeAnnualizedRule> {
  assertActorUserId(input.actorUserId);
  const conn = input.connection || await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  try {
    const [rows] = await conn.execute(
      `SELECT influence, targets_json, version
         FROM ledger52_t0_journal_shared_income_annualized_rules
        WHERE ledger_id = ? AND user_id = ? LIMIT 1${input.lockRules ? " FOR UPDATE" : ""}`,
      [LEDGER_ID, input.actorUserId],
    );
    const row = (rows as any[])[0];
    return row ? mapRule(row) : defaultRule();
  } catch (error: any) {
    if (error?.code === "ER_NO_SUCH_TABLE" || error?.errno === 1146) return defaultRule();
    throw error;
  }
}

/** 仅管理员明确点击保存调用；只保存未来配置和审计，不改订单、分配或历史快照。 */
export async function setLedger52T0SharedIncomeAnnualizedRule(
  input: SetLedger52T0SharedIncomeAnnualizedRuleInput,
): Promise<Ledger52T0SharedIncomeAnnualizedRule> {
  assertActorUserId(input.actorUserId);
  if (process.env.NODE_ENV !== "production" && process.env.FAST_PREVIEW === "true") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "热预览仅应用本次试算，不写入数据库" });
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "目标年化规则版本无效" });
  }
  const next = normalizeRule(input);
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  let transactionStarted = false;
  try {
    // MySQL DDL会隐式提交，因此仅在显式保存中、BEGIN之前创建配置及审计表。
    await tx.execute(`CREATE TABLE IF NOT EXISTS ledger52_t0_journal_shared_income_annualized_rules (
      ledger_id INT NOT NULL,
      user_id INT NOT NULL,
      influence DECIMAL(6,4) NOT NULL,
      targets_json LONGTEXT NOT NULL,
      version INT NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (ledger_id, user_id)
    ) ENGINE=InnoDB`);
    await tx.execute(`CREATE TABLE IF NOT EXISTS ledger52_t0_journal_shared_income_annualized_rule_audits (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ledger_id INT NOT NULL,
      user_id INT NOT NULL,
      prev_json LONGTEXT NULL,
      next_json LONGTEXT NOT NULL,
      version INT NOT NULL,
      operator_user_id INT NOT NULL,
      created_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB`);
    await tx.beginTransaction();
    transactionStarted = true;
    const [existingRows] = await tx.execute(
      `SELECT influence, targets_json, version
         FROM ledger52_t0_journal_shared_income_annualized_rules
        WHERE ledger_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [LEDGER_ID, input.actorUserId],
    );
    const existing = (existingRows as any[])[0];
    const previous = existing ? mapRule(existing) : defaultRule();
    if (previous.version !== input.expectedVersion) {
      throw new TRPCError({ code: "CONFLICT", message: "目标年化规则已更新，请刷新后重试" });
    }
    const targetIds = Object.keys(next.targets).map(Number).sort((a, b) => a - b);
    if (targetIds.length > 0) {
      // 仅验证全局用户存在；未来分配仍必须按操作者的实际授权候选范围应用目标。
      const [userRows] = await tx.execute(
        `SELECT id FROM users WHERE id IN (${targetIds.map(() => "?").join(",")}) ORDER BY id FOR UPDATE`,
        targetIds,
      );
      const found = new Set((userRows as any[]).map((row) => Number(row.id)));
      if (targetIds.some((id) => !found.has(id))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "目标年化用户不存在或已失效，请重新选择" });
      }
    }
    if (previous.influence === next.influence && JSON.stringify(previous.targets) === JSON.stringify(next.targets)) {
      await tx.commit();
      transactionStarted = false;
      return previous;
    }
    const saved: Ledger52T0SharedIncomeAnnualizedRule = { ...next, version: previous.version + 1 };
    // 缺失行使用纯INSERT：并发首写冲突必须失败，不能用UPSERT静默覆盖别人的版本。
    const updateClause = existing
      ? ` ON DUPLICATE KEY UPDATE influence = VALUES(influence), targets_json = VALUES(targets_json),
          version = VALUES(version), updated_at = VALUES(updated_at)`
      : "";
    await tx.execute(
      `INSERT INTO ledger52_t0_journal_shared_income_annualized_rules
        (ledger_id, user_id, influence, targets_json, version, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(3))${updateClause}`,
      [LEDGER_ID, input.actorUserId, saved.influence, JSON.stringify(saved.targets), saved.version],
    );
    await tx.execute(
      `INSERT INTO ledger52_t0_journal_shared_income_annualized_rule_audits
        (ledger_id, user_id, prev_json, next_json, version, operator_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
      [LEDGER_ID, input.actorUserId, existing ? JSON.stringify(previous) : null, JSON.stringify(saved), saved.version, input.actorUserId],
    );
    await tx.commit();
    transactionStarted = false;
    return saved;
  } catch (error: any) {
    if (transactionStarted) await tx.rollback();
    if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) {
      throw new TRPCError({ code: "CONFLICT", message: "目标年化规则已更新，请刷新后重试" });
    }
    throw error;
  } finally {
    if (typeof tx.release === "function") await tx.release();
    else await tx.end();
  }
}
