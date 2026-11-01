import { TRPCError } from "@trpc/server";
import { getDbConnection, getDbTransactionConnection } from "./db";

const LEDGER_ID = 52;
const MAX_REFERRAL_DEPTH = 20;
// 统一按OKX合约挂单口径估算：手续费率 × 默认30%节点净手续费返佣。
const OKX_MAKER_REBATE_RATE_PCT_BY_VIP_TIER = {
  regular: 0.006,
  vip1: 0.0048,
  vip2: 0.0045,
  vip3: 0.003,
  vip4: 0.0024,
  vip5: 0.0015,
} as const;
type OkxVipTier = keyof typeof OKX_MAKER_REBATE_RATE_PCT_BY_VIP_TIER;

let tablesReady: Promise<void> | null = null;

type SqlConnection = any;

type AllocationInput = {
  beneficiaryUserId: number;
  percentage: string;
};

type StoredAllocation = {
  userId: number;
  name: string;
  inviteCode: string | null;
  percentage: number;
};

type DashboardMode = "admin" | "member";

export type Ledger52OkxCommissionScope = {
  mode: DashboardMode;
  memberUserId?: number;
};

function asRows(result: unknown): any[] {
  if (Array.isArray((result as any)?.[0])) return (result as any)[0];
  return Array.isArray(result) ? result as any[] : [];
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}

function isAdministrativeRole(value: unknown): boolean {
  const role = textValue(value).toLowerCase();
  return role === "super_admin" || role === "admin" || role === "owner";
}

function normalizeOkxVipTier(value: unknown): OkxVipTier {
  const tier = textValue(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(OKX_MAKER_REBATE_RATE_PCT_BY_VIP_TIER, tier)
    ? tier as OkxVipTier
    : "regular";
}

function getOkxVipTierRebateRate(value: unknown): number {
  return OKX_MAKER_REBATE_RATE_PCT_BY_VIP_TIER[normalizeOkxVipTier(value)];
}

function displayName(row: any): string {
  return textValue(row?.customer_name) || textValue(row?.name) || textValue(row?.username) || "未命名客户";
}

function roundAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}

function decimalText(value: number): string {
  return roundAmount(value).toFixed(8);
}

function monthKey(value: unknown): string | null {
  const match = textValue(value).match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function parseRequiredNonNegativeDecimal(value: string, label: string): number {
  const normalized = textValue(value);
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/.test(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label}格式无效，最多8位小数` });
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label}必须为非负数` });
  }
  return parsed;
}

function parseOptionalNonNegativeDecimal(value: string | undefined, label: string): number | null {
  const normalized = textValue(value);
  if (!normalized) return null;
  return parseRequiredNonNegativeDecimal(normalized, label);
}

function parseAllocationConfig(value: unknown): StoredAllocation[] {
  if (!value) return [];
  try {
    const raw = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry: any) => {
      const userId = numberValue(entry?.userId, 0);
      const percentage = numberValue(entry?.percentage, Number.NaN);
      if (!Number.isInteger(userId) || userId <= 0 || !Number.isFinite(percentage) || percentage < 0) return [];
      return [{
        userId,
        name: textValue(entry?.name) || "未命名用户",
        inviteCode: textValue(entry?.inviteCode) || null,
        percentage: roundAmount(percentage),
      }];
    });
  } catch {
    return [];
  }
}

function mysqlDateTime(value: string): string {
  const normalized = textValue(value);
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "登记时间格式无效" });
  const candidate = new Date(`${match[1]}T${match[2]}:${match[3] || "00"}`);
  if (Number.isNaN(candidate.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "登记时间无效" });
  return `${match[1]} ${match[2]}:${match[3] || "00"}`;
}

async function getRequiredConnection(connection?: SqlConnection): Promise<SqlConnection> {
  const conn = connection ?? await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OKX佣金数据库连接失败" });
  return conn;
}

/**
 * OKX佣金业务独立存储：客户账户为当前配置；每次累计登记及其受益分配都是不可变快照。
 * 不复用T+0订单表，避免交易所佣金和订单持仓、手续费逻辑相互影响。
 */
export async function ensureLedger52OkxCommissionTables(connection?: SqlConnection): Promise<void> {
  if (tablesReady) return tablesReady;
  tablesReady = (async () => {
    const conn = await getRequiredConnection(connection);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_okx_commission_accounts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        member_user_id BIGINT UNSIGNED NOT NULL,
        okx_uid VARCHAR(32) NOT NULL,
        okx_login VARCHAR(128) DEFAULT NULL,
        vip_tier VARCHAR(16) NOT NULL DEFAULT 'regular',
        allocation_config_json LONGTEXT NOT NULL,
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        created_by_user_id BIGINT UNSIGNED NOT NULL,
        updated_by_user_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_okx_commission_member (ledger_id, member_user_id),
        UNIQUE KEY uq_okx_commission_uid (ledger_id, okx_uid),
        KEY idx_okx_commission_accounts_member (ledger_id, member_user_id, status),
        KEY idx_okx_commission_accounts_recent (ledger_id, status, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本OKX交易所佣金：客户OKX账户与当前返佣分配配置'
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_okx_commission_account_audits (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        account_id BIGINT UNSIGNED NOT NULL,
        member_user_id BIGINT UNSIGNED NOT NULL,
        operation ENUM('create','update') NOT NULL,
        before_snapshot LONGTEXT DEFAULT NULL,
        after_snapshot LONGTEXT NOT NULL,
        client_request_id VARCHAR(64) NOT NULL,
        operator_user_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_okx_commission_account_audit_request (ledger_id, operator_user_id, client_request_id),
        KEY idx_okx_commission_account_audit_account (ledger_id, account_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本OKX交易所佣金：客户资料与当前返佣配置的操作审计'
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_okx_commission_records (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        account_id BIGINT UNSIGNED NOT NULL,
        recorded_at DATETIME(3) NOT NULL,
        transaction_cumulative_usdt DECIMAL(24,8) DEFAULT NULL,
        transaction_increment_usdt DECIMAL(24,8) DEFAULT NULL,
        spot_cumulative_usdt DECIMAL(24,8) NOT NULL,
        futures_cumulative_usdt DECIMAL(24,8) NOT NULL,
        spot_increment_usdt DECIMAL(24,8) NOT NULL,
        futures_increment_usdt DECIMAL(24,8) NOT NULL,
        rebate_rate_pct DECIMAL(12,8) DEFAULT NULL,
        expected_commission_usdt DECIMAL(24,8) DEFAULT NULL,
        paid_commission_usdt DECIMAL(24,8) DEFAULT NULL,
        allocation_snapshot_json LONGTEXT NOT NULL,
        client_request_id VARCHAR(64) NOT NULL,
        created_by_user_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_okx_commission_record_request (ledger_id, created_by_user_id, client_request_id),
        KEY idx_okx_commission_record_account_time (ledger_id, account_id, recorded_at, id),
        KEY idx_okx_commission_record_created (ledger_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本OKX交易所佣金：管理员手工登记的累计交易量与返佣快照'
    `);

    for (const statement of [
      `ALTER TABLE ledger52_okx_commission_accounts ADD COLUMN vip_tier VARCHAR(16) NOT NULL DEFAULT 'regular' AFTER okx_login`,
      `ALTER TABLE ledger52_okx_commission_records ADD COLUMN transaction_cumulative_usdt DECIMAL(24,8) DEFAULT NULL AFTER recorded_at`,
      `ALTER TABLE ledger52_okx_commission_records ADD COLUMN transaction_increment_usdt DECIMAL(24,8) DEFAULT NULL AFTER transaction_cumulative_usdt`,
    ]) {
      try {
        await conn.execute(statement);
      } catch (error) {
        if (!String((error as Error)?.message || error).toLowerCase().includes("duplicate column")) throw error;
      }
    }

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_okx_commission_record_allocations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        commission_record_id BIGINT UNSIGNED NOT NULL,
        beneficiary_user_id BIGINT UNSIGNED NOT NULL,
        beneficiary_name_snapshot VARCHAR(160) NOT NULL,
        beneficiary_invite_code_snapshot VARCHAR(64) DEFAULT NULL,
        allocation_pct DECIMAL(12,8) NOT NULL,
        expected_amount_usdt DECIMAL(24,8) DEFAULT NULL,
        paid_amount_usdt DECIMAL(24,8) DEFAULT NULL,
        payout_status ENUM('pending','paid','legacy_paid','void') NOT NULL DEFAULT 'pending',
        payout_batch_id BIGINT UNSIGNED DEFAULT NULL,
        payout_wallet_balance_id BIGINT UNSIGNED DEFAULT NULL,
        paid_at DATETIME(3) DEFAULT NULL,
        paid_by_user_id BIGINT UNSIGNED DEFAULT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_okx_commission_record_beneficiary (commission_record_id, beneficiary_user_id),
        KEY idx_okx_commission_allocation_beneficiary (ledger_id, beneficiary_user_id, created_at),
        KEY idx_okx_commission_allocation_record (ledger_id, commission_record_id),
        KEY idx_okx_commission_allocation_pending (ledger_id, payout_status, beneficiary_user_id, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本OKX交易所佣金：每笔登记固定的受益分配快照'
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_okx_commission_payout_batches (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        client_request_id VARCHAR(64) NOT NULL,
        operator_user_id BIGINT UNSIGNED NOT NULL,
        recipient_count INT NOT NULL,
        allocation_count INT NOT NULL,
        total_amount_usdt DECIMAL(24,8) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_okx_commission_payout_batch_request (ledger_id, operator_user_id, client_request_id),
        KEY idx_okx_commission_payout_batch_created (ledger_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本OKX交易所佣金：批量发放批次与幂等审计'
    `);

    for (const statement of [
      `ALTER TABLE ledger52_okx_commission_record_allocations ADD COLUMN payout_status ENUM('pending','paid','legacy_paid','void') NOT NULL DEFAULT 'pending' AFTER paid_amount_usdt`,
      `ALTER TABLE ledger52_okx_commission_record_allocations ADD COLUMN payout_batch_id BIGINT UNSIGNED DEFAULT NULL AFTER payout_status`,
      `ALTER TABLE ledger52_okx_commission_record_allocations ADD COLUMN payout_wallet_balance_id BIGINT UNSIGNED DEFAULT NULL AFTER payout_batch_id`,
      `ALTER TABLE ledger52_okx_commission_record_allocations ADD COLUMN paid_at DATETIME(3) DEFAULT NULL AFTER payout_wallet_balance_id`,
      `ALTER TABLE ledger52_okx_commission_record_allocations ADD COLUMN paid_by_user_id BIGINT UNSIGNED DEFAULT NULL AFTER paid_at`,
      `ALTER TABLE ledger52_okx_commission_record_allocations ADD KEY idx_okx_commission_allocation_pending (ledger_id, payout_status, beneficiary_user_id, id)`,
    ]) {
      try {
        await conn.execute(statement);
      } catch (error) {
        const message = String((error as Error)?.message || error).toLowerCase();
        if (!message.includes('duplicate column') && !message.includes('duplicate key')) throw error;
      }
    }
    // 本功能上线前历史上手填过的正数“已发佣金”视为旧的线下发放记录，不能再次自动入账。
    // 0 或空值仍为待发，以便管理员按新流程选择后发放到钱包。
    await conn.execute(`
      UPDATE ledger52_okx_commission_record_allocations
         SET payout_status = 'legacy_paid'
       WHERE ledger_id = ?
         AND payout_status = 'pending'
         AND COALESCE(paid_amount_usdt, 0) > 0
         AND payout_wallet_balance_id IS NULL
    `, [LEDGER_ID]);
  })();
  try {
    await tablesReady;
  } catch (error) {
    tablesReady = null;
    throw error;
  }
}

export async function resolveLedger52OkxCommissionScope(actor: { id: number; role?: string | null }): Promise<Ledger52OkxCommissionScope> {
  const userId = numberValue(actor.id, 0);
  if (!Number.isInteger(userId) || userId <= 0) throw new TRPCError({ code: "UNAUTHORIZED", message: "登录身份无效" });
  const systemRole = textValue(actor.role).toLowerCase();
  const conn = await getRequiredConnection();
  const [membershipResult] = await conn.execute(
    `SELECT role
       FROM ledger_members
      WHERE ledgerId = ? AND userId = ? AND (member_type IS NULL OR member_type <> 'ai')
      ORDER BY id ASC
      LIMIT 1`,
    [LEDGER_ID, userId],
  );
  const membership = asRows(membershipResult)[0];
  const ledgerRole = textValue(membership?.role).toLowerCase();
  if (systemRole === "super_admin" || systemRole === "admin" || ledgerRole === "owner" || ledgerRole === "admin") {
    return { mode: "admin" };
  }
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "仅52号账本成员可查看交易所佣金业务" });
  return { mode: "member", memberUserId: userId };
}

async function ensureCustomerIsLedger52Member(transaction: SqlConnection, memberUserId: number): Promise<boolean> {
  const [userRowsResult] = await transaction.execute(
    `SELECT id, role
       FROM users
      WHERE id = ?
      LIMIT 1 FOR UPDATE`,
    [memberUserId],
  );
  const user = asRows(userRowsResult)[0];
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "客户全局资料不存在" });
  if (isAdministrativeRole(user.role)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请从普通用户中选择佣金客户" });
  }

  const [memberRowsResult] = await transaction.execute(
    `SELECT id, role, member_type
       FROM ledger_members
      WHERE ledgerId = ? AND userId = ?
      ORDER BY id ASC
      LIMIT 1 FOR UPDATE`,
    [LEDGER_ID, memberUserId],
  );
  const member = asRows(memberRowsResult)[0];
  if (member) {
    if (String(member.member_type || "real").toLowerCase() === "ai") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "AI成员不能登记为佣金客户" });
    }
    if (isAdministrativeRole(member.role)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请从普通用户中选择佣金客户" });
    }
    return false;
  }

  await transaction.execute(
    `INSERT INTO ledger_members
       (ledgerId, userId, role, member_type, permission_view, permission_add, permission_edit, permission_delete, canEdit, canDelete, canInvite)
     VALUES (?, ?, 'member', 'real', 'all', 'all', 'own', 'own', 1, 0, 0)`,
    [LEDGER_ID, memberUserId],
  );
  return true;
}

async function getAllowedBeneficiaryIds(transaction: SqlConnection, memberUserId: number): Promise<Set<number>> {
  const allowed = new Set<number>();
  const visited = new Set<number>();
  let currentUserId = memberUserId;
  for (let depth = 0; depth <= MAX_REFERRAL_DEPTH; depth += 1) {
    if (visited.has(currentUserId)) throw new TRPCError({ code: "BAD_REQUEST", message: "全局推荐关系存在循环，请先修正推荐链" });
    visited.add(currentUserId);
    const [rowsResult] = await transaction.execute(
      `SELECT id, invited_by_user_id, role
         FROM users
        WHERE id = ?
        LIMIT 1 FOR UPDATE`,
      [currentUserId],
    );
    const row = asRows(rowsResult)[0];
    if (!row) {
      if (depth === 0) throw new TRPCError({ code: "NOT_FOUND", message: "客户全局资料不存在" });
      break;
    }
    const actualId = numberValue(row.id, 0);
    if (!actualId) break;
    // 管理员是推荐链的边界：最高可分配对象只到管理员直属下级，管理员本身及其上级不参与佣金分配。
    if (isAdministrativeRole(row.role)) break;
    allowed.add(actualId);
    const parentUserId = numberValue(row.invited_by_user_id, 0);
    if (!parentUserId) break;
    currentUserId = parentUserId;
  }
  if (allowed.size === 0) throw new TRPCError({ code: "NOT_FOUND", message: "未找到客户的全局推荐资料" });
  return allowed;
}

async function normalizeAllocations(transaction: SqlConnection, memberUserId: number, input: AllocationInput[]): Promise<StoredAllocation[]> {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_REFERRAL_DEPTH + 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "返佣分配不能为空，且最多保留20级推荐链" });
  }
  const allowed = await getAllowedBeneficiaryIds(transaction, memberUserId);
  const allocationByUser = new Map<number, number>();
  for (const item of input) {
    const beneficiaryUserId = numberValue(item?.beneficiaryUserId, 0);
    if (!Number.isInteger(beneficiaryUserId) || beneficiaryUserId <= 0 || !allowed.has(beneficiaryUserId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "返佣对象必须属于该客户的全局推荐链" });
    }
    if (allocationByUser.has(beneficiaryUserId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "同一返佣对象不能重复设置" });
    }
    const percentage = parseRequiredNonNegativeDecimal(item.percentage, "返佣比例");
    if (percentage > 100) throw new TRPCError({ code: "BAD_REQUEST", message: "单个返佣比例不能超过100%" });
    allocationByUser.set(beneficiaryUserId, percentage);
  }
  const total = Array.from(allocationByUser.values()).reduce((sum, percentage) => sum + percentage, 0);
  if (Math.abs(total - 100) > 0.000001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "返佣分配合计必须为100%" });
  }

  const userIds = Array.from(allocationByUser.keys());
  const placeholders = userIds.map(() => "?").join(",");
  const [userRowsResult] = await transaction.execute(
    `SELECT id, name, username
       FROM users
      WHERE id IN (${placeholders})`,
    userIds,
  );
  const usersById = new Map(asRows(userRowsResult).map((row) => [numberValue(row.id, 0), row]));
  return userIds.map((userId) => {
    const user = usersById.get(userId);
    if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "返佣对象不存在或已失效" });
    return {
      userId,
      name: displayName(user),
      inviteCode: null,
      percentage: roundAmount(allocationByUser.get(userId) || 0),
    };
  });
}

function mapRecord(row: any) {
  const legacyCumulative = numberValue(row.spot_cumulative_usdt) + numberValue(row.futures_cumulative_usdt);
  const legacyIncrement = numberValue(row.spot_increment_usdt) + numberValue(row.futures_increment_usdt);
  return {
    id: String(row.id),
    registeredAt: textValue(row.recorded_at),
    transactionCumulative: row.transaction_cumulative_usdt === null || row.transaction_cumulative_usdt === undefined
      ? legacyCumulative
      : numberValue(row.transaction_cumulative_usdt),
    transactionIncrement: row.transaction_increment_usdt === null || row.transaction_increment_usdt === undefined
      ? legacyIncrement
      : numberValue(row.transaction_increment_usdt),
    rebateRate: row.rebate_rate_pct === null || row.rebate_rate_pct === undefined ? null : numberValue(row.rebate_rate_pct),
    paidCommission: row.paid_commission_usdt === null || row.paid_commission_usdt === undefined ? null : numberValue(row.paid_commission_usdt),
    expectedCommission: row.expected_commission_usdt === null || row.expected_commission_usdt === undefined ? null : numberValue(row.expected_commission_usdt),
  };
}

type AdminTeamMember = {
  userId: number;
  customerName: string;
  username: string;
  cumulativeTurnover: number;
  expectedCommissionTotal: number;
};

type CommissionAccountDirectoryEntry = {
  accountId: number;
  userId: number;
  invitedByUserId: number | null;
  customerName: string;
  username: string;
  cumulativeTurnover: number;
};

function buildGlobalCommissionTeamMembers(accountDirectory: CommissionAccountDirectoryEntry[]): Map<number, Map<number, AdminTeamMember>> {
  const accountsByUserId = new Map(accountDirectory.map((account) => [account.userId, account]));
  const membersByAccountId = new Map<number, Map<number, AdminTeamMember>>();
  for (const source of accountDirectory) {
    const visited = new Set<number>([source.userId]);
    let ancestorUserId = source.invitedByUserId;
    for (let depth = 0; ancestorUserId && depth < MAX_REFERRAL_DEPTH; depth += 1) {
      if (visited.has(ancestorUserId)) break;
      visited.add(ancestorUserId);
      const ancestor = accountsByUserId.get(ancestorUserId);
      if (!ancestor) break;
      const members = membersByAccountId.get(ancestor.accountId) || new Map<number, AdminTeamMember>();
      members.set(source.userId, {
        userId: source.userId,
        customerName: source.customerName,
        username: source.username,
        cumulativeTurnover: source.cumulativeTurnover,
        expectedCommissionTotal: members.get(source.userId)?.expectedCommissionTotal ?? 0,
      });
      membersByAccountId.set(ancestor.accountId, members);
      ancestorUserId = ancestor.invitedByUserId;
    }
  }
  return membersByAccountId;
}

type AdminMonthlyCommission = {
  month: string;
  personalExpectedCommissionTotal: number;
  teamExpectedCommissionTotal: number;
  totalExpectedCommission: number;
};

type AdminAccountCommissionSummary = {
  personalExpectedCommissionTotal: number;
  teamCustomerCount: number;
  teamCumulativeTurnover: number;
  teamExpectedCommissionTotal: number;
  totalExpectedCommission: number;
  teamMembers: AdminTeamMember[];
  monthlyCommission: AdminMonthlyCommission[];
};

/**
 * 团队成员身份按当前全局推荐链识别；交易额与返佣金额仍只按每笔已冻结的分佣快照汇总。
 * 因此调整推荐关系会更新团队名单，但不会回写任何历史结算金额。
 */
async function getAdminAccountCommissionSummaries(
  conn: SqlConnection,
  accountIds: number[],
  accountIdByMemberUserId: Map<number, number>,
  accountDirectory: CommissionAccountDirectoryEntry[],
): Promise<Map<number, AdminAccountCommissionSummary>> {
  const summaries = new Map<number, {
    personalExpectedCommissionTotal: number;
    teamExpectedCommissionTotal: number;
    teamMembersByCustomer: Map<number, AdminTeamMember>;
    monthlyCommissionByMonth: Map<string, { personalExpectedCommissionTotal: number; teamExpectedCommissionTotal: number }>;
  }>();
  const ensureSummary = (accountId: number) => {
    const existing = summaries.get(accountId);
    if (existing) return existing;
    const created = {
      personalExpectedCommissionTotal: 0,
      teamExpectedCommissionTotal: 0,
      teamMembersByCustomer: new Map<number, AdminTeamMember>(),
      monthlyCommissionByMonth: new Map<string, { personalExpectedCommissionTotal: number; teamExpectedCommissionTotal: number }>(),
    };
    summaries.set(accountId, created);
    return created;
  };
  if (accountIds.length === 0) return new Map();
  for (const [accountId, teamMembers] of buildGlobalCommissionTeamMembers(accountDirectory)) {
    const summary = ensureSummary(accountId);
    for (const member of teamMembers.values()) summary.teamMembersByCustomer.set(member.userId, member);
  }
  const ensureMonthSummary = (summary: { monthlyCommissionByMonth: Map<string, { personalExpectedCommissionTotal: number; teamExpectedCommissionTotal: number }> }, recordedAt: unknown) => {
    const month = monthKey(recordedAt);
    if (!month) return null;
    const existing = summary.monthlyCommissionByMonth.get(month);
    if (existing) return existing;
    const created = { personalExpectedCommissionTotal: 0, teamExpectedCommissionTotal: 0 };
    summary.monthlyCommissionByMonth.set(month, created);
    return created;
  };
  const placeholders = accountIds.map(() => "?").join(",");
  const [rowsResult] = await conn.execute(
    `SELECT a.id AS source_account_id, a.member_user_id AS source_customer_user_id,
            COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('客户 #', a.member_user_id)) AS source_customer_name,
            COALESCE(u.username, '') AS source_customer_username,
            ra.beneficiary_user_id, ra.allocation_pct, ra.expected_amount_usdt,
            r.id AS record_id, r.recorded_at, DATE_FORMAT(r.recorded_at, '%Y-%m') AS recorded_month,
            r.transaction_cumulative_usdt, r.spot_cumulative_usdt, r.futures_cumulative_usdt
       FROM ledger52_okx_commission_record_allocations ra
       INNER JOIN ledger52_okx_commission_records r
               ON r.id = ra.commission_record_id AND r.ledger_id = ra.ledger_id
       INNER JOIN ledger52_okx_commission_accounts a
               ON a.id = r.account_id AND a.ledger_id = r.ledger_id
       LEFT JOIN users u ON u.id = a.member_user_id
      WHERE ra.ledger_id = ? AND r.account_id IN (${placeholders})
      ORDER BY a.id ASC, ra.beneficiary_user_id ASC, r.recorded_at DESC, r.id DESC, ra.id DESC`,
    [LEDGER_ID, ...accountIds],
  );
  for (const row of asRows(rowsResult)) {
    const sourceAccountId = numberValue(row.source_account_id, 0);
    const sourceCustomerUserId = numberValue(row.source_customer_user_id, 0);
    const beneficiaryUserId = numberValue(row.beneficiary_user_id, 0);
    if (!sourceAccountId || !sourceCustomerUserId || !beneficiaryUserId) continue;
    const expectedAmount = numberValue(row.expected_amount_usdt);
    if (beneficiaryUserId === sourceCustomerUserId) {
      const summary = ensureSummary(sourceAccountId);
      summary.personalExpectedCommissionTotal += expectedAmount;
      const monthlySummary = ensureMonthSummary(summary, row.recorded_month);
      if (monthlySummary) monthlySummary.personalExpectedCommissionTotal += expectedAmount;
      continue;
    }
    if (numberValue(row.allocation_pct) <= 0) continue;
    // 只有已登记的受益人才会在管理员登记列表拥有一行；团队数据必须归入该受益人。
    const beneficiaryAccountId = accountIdByMemberUserId.get(beneficiaryUserId);
    if (!beneficiaryAccountId) continue;
    const summary = ensureSummary(beneficiaryAccountId);
    summary.teamExpectedCommissionTotal += expectedAmount;
    const monthlySummary = ensureMonthSummary(summary, row.recorded_month);
    if (monthlySummary) monthlySummary.teamExpectedCommissionTotal += expectedAmount;
    const existingMember = summary.teamMembersByCustomer.get(sourceCustomerUserId);
    if (existingMember) {
      existingMember.expectedCommissionTotal += expectedAmount;
      continue;
    }
    const legacyCumulative = numberValue(row.spot_cumulative_usdt) + numberValue(row.futures_cumulative_usdt);
    const cumulativeTurnover = row.transaction_cumulative_usdt === null || row.transaction_cumulative_usdt === undefined
      ? legacyCumulative
      : numberValue(row.transaction_cumulative_usdt);
    summary.teamMembersByCustomer.set(sourceCustomerUserId, {
      userId: sourceCustomerUserId,
      customerName: textValue(row.source_customer_name) || `客户 #${sourceCustomerUserId}`,
      username: textValue(row.source_customer_username),
      cumulativeTurnover,
      expectedCommissionTotal: expectedAmount,
    });
  }
  return new Map(Array.from(summaries.entries()).map(([accountId, summary]) => {
    const teamMembers = Array.from(summary.teamMembersByCustomer.values())
      .map((member) => ({ ...member, cumulativeTurnover: roundAmount(member.cumulativeTurnover), expectedCommissionTotal: roundAmount(member.expectedCommissionTotal) }))
      .sort((left, right) => right.cumulativeTurnover - left.cumulativeTurnover || right.expectedCommissionTotal - left.expectedCommissionTotal);
    const teamCumulativeTurnover = teamMembers.reduce((sum, member) => sum + member.cumulativeTurnover, 0);
    const personalExpectedCommissionTotal = roundAmount(summary.personalExpectedCommissionTotal);
    const teamExpectedCommissionTotal = roundAmount(summary.teamExpectedCommissionTotal);
    const monthlyCommission = Array.from(summary.monthlyCommissionByMonth.entries())
      .map(([month, totals]) => {
        const personalExpectedCommissionTotal = roundAmount(totals.personalExpectedCommissionTotal);
        const teamExpectedCommissionTotal = roundAmount(totals.teamExpectedCommissionTotal);
        return {
          month,
          personalExpectedCommissionTotal,
          teamExpectedCommissionTotal,
          totalExpectedCommission: roundAmount(personalExpectedCommissionTotal + teamExpectedCommissionTotal),
        };
      })
      .sort((left, right) => left.month.localeCompare(right.month));
    return [accountId, {
      personalExpectedCommissionTotal,
      teamCustomerCount: teamMembers.length,
      teamCumulativeTurnover: roundAmount(teamCumulativeTurnover),
      teamExpectedCommissionTotal,
      totalExpectedCommission: roundAmount(personalExpectedCommissionTotal + teamExpectedCommissionTotal),
      teamMembers,
      monthlyCommission,
    }];
  }));
}

/**
 * 团队成员名单按当前全局推荐树识别；返佣金额仍只按登记时冻结的分配快照累计。
 * 这样未登记交易额的下级也会出现在团队中，但不会凭空产生交易额或返佣金额。
 */
async function getLedger52OkxCommissionTeamForBeneficiary(beneficiaryUserId: number) {
  const conn = await getRequiredConnection();
  const [rosterRowsResult] = await conn.execute(
    `SELECT a.member_user_id AS customer_user_id, a.allocation_config_json, a.vip_tier, u.invited_by_user_id,
            COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('客户 #', a.member_user_id)) AS customer_name,
            COALESCE(u.username, '') AS customer_username
       FROM ledger52_okx_commission_accounts a
       INNER JOIN users u ON u.id = a.member_user_id
      WHERE a.ledger_id = ? AND a.status = 'active'`,
    [LEDGER_ID],
  );
  const rosterByUserId = new Map<number, any>();
  for (const row of asRows(rosterRowsResult)) {
    const userId = numberValue(row.customer_user_id, 0);
    if (!Number.isInteger(userId) || userId <= 0) continue;
    rosterByUserId.set(userId, {
      userId,
      invitedByUserId: numberValue(row.invited_by_user_id, 0) || null,
      customerName: textValue(row.customer_name) || `客户 #${userId}`,
      username: textValue(row.customer_username),
      vipTier: textValue(row.vip_tier) || "regular",
      allocationPct: roundAmount(parseAllocationConfig(row.allocation_config_json).find((allocation) => allocation.userId === beneficiaryUserId)?.percentage ?? 0),
    });
  }
  const globalTeamMembersByUserId = new Map<number, any>();
  for (const candidate of rosterByUserId.values()) {
    if (candidate.userId === beneficiaryUserId) continue;
    const visited = new Set<number>([candidate.userId]);
    let ancestorUserId = candidate.invitedByUserId;
    for (let depth = 0; ancestorUserId && depth < MAX_REFERRAL_DEPTH; depth += 1) {
      if (ancestorUserId === beneficiaryUserId) {
        // 用户端仅展示当前受益人实际分得佣金的团队关系；0%不形成可见团队成员。
        if (candidate.allocationPct > 0) globalTeamMembersByUserId.set(candidate.userId, candidate);
        break;
      }
      if (visited.has(ancestorUserId)) break;
      visited.add(ancestorUserId);
      const ancestor = rosterByUserId.get(ancestorUserId);
      if (!ancestor) break;
      ancestorUserId = ancestor.invitedByUserId;
    }
  }
  const [teamRowsResult] = await conn.execute(
    `SELECT ra.id AS allocation_id, ra.commission_record_id, ra.allocation_pct,
            ra.expected_amount_usdt, ra.paid_amount_usdt,
            r.id AS record_id, DATE_FORMAT(r.recorded_at, '%Y-%m-%dT%H:%i') AS recorded_at,
            r.transaction_cumulative_usdt, r.transaction_increment_usdt,
            r.spot_cumulative_usdt, r.futures_cumulative_usdt,
            r.spot_increment_usdt, r.futures_increment_usdt,
            a.id AS account_id, a.member_user_id AS customer_user_id, a.vip_tier,
            COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('客户 #', a.member_user_id)) AS customer_name,
            COALESCE(u.username, '') AS customer_username
       FROM ledger52_okx_commission_record_allocations ra
       INNER JOIN ledger52_okx_commission_records r
               ON r.id = ra.commission_record_id AND r.ledger_id = ra.ledger_id
       INNER JOIN ledger52_okx_commission_accounts a
               ON a.id = r.account_id AND a.ledger_id = r.ledger_id
       LEFT JOIN users u ON u.id = a.member_user_id
      WHERE ra.ledger_id = ?
        AND ra.beneficiary_user_id = ?
        AND a.member_user_id <> ?
        AND ra.allocation_pct > 0
      ORDER BY r.recorded_at DESC, r.id DESC, ra.id DESC`,
    [LEDGER_ID, beneficiaryUserId, beneficiaryUserId],
  );

  const customersByUserId = new Map<number, any>(Array.from(globalTeamMembersByUserId.values()).map((member) => [member.userId, {
    userId: member.userId,
    customerName: member.customerName,
    username: member.username,
    vipTier: member.vipTier,
    allocationPct: member.allocationPct,
    registrationCount: 0,
    expectedCommissionTotal: 0,
    paidCommissionKnownTotal: 0,
    paidCommissionUnknownCount: 0,
    latestRegistration: null,
    records: [] as any[],
  }]));
  let registrationCount = 0;
  let expectedCommissionTotal = 0;
  let paidCommissionKnownTotal = 0;
  let paidCommissionUnknownCount = 0;
  for (const row of asRows(teamRowsResult)) {
    const customerUserId = numberValue(row.customer_user_id, 0);
    if (!Number.isInteger(customerUserId) || customerUserId <= 0) continue;
    // 历史记录可能保留旧比例；若当前设置已为0%，不再进入该用户的团队名单或汇总。
    if (!globalTeamMembersByUserId.has(customerUserId)) continue;
    const legacyCumulative = numberValue(row.spot_cumulative_usdt) + numberValue(row.futures_cumulative_usdt);
    const legacyIncrement = numberValue(row.spot_increment_usdt) + numberValue(row.futures_increment_usdt);
    const record = {
      id: String(row.record_id),
      registeredAt: textValue(row.recorded_at),
      transactionCumulative: row.transaction_cumulative_usdt === null || row.transaction_cumulative_usdt === undefined
        ? legacyCumulative
        : numberValue(row.transaction_cumulative_usdt),
      transactionIncrement: row.transaction_increment_usdt === null || row.transaction_increment_usdt === undefined
        ? legacyIncrement
        : numberValue(row.transaction_increment_usdt),
      allocationPct: numberValue(row.allocation_pct),
      expectedCommission: row.expected_amount_usdt === null || row.expected_amount_usdt === undefined ? null : numberValue(row.expected_amount_usdt),
      paidCommission: row.paid_amount_usdt === null || row.paid_amount_usdt === undefined ? null : numberValue(row.paid_amount_usdt),
    };
    let customer = customersByUserId.get(customerUserId);
    if (!customer) {
      customer = {
        userId: customerUserId,
        customerName: textValue(row.customer_name) || `客户 #${customerUserId}`,
        username: textValue(row.customer_username),
        vipTier: textValue(row.vip_tier) || "regular",
        allocationPct: numberValue(row.allocation_pct),
        registrationCount: 0,
        expectedCommissionTotal: 0,
        paidCommissionKnownTotal: 0,
        paidCommissionUnknownCount: 0,
        latestRegistration: null as any,
        records: [] as any[],
      };
      customersByUserId.set(customerUserId, customer);
    }
    registrationCount += 1;
    customer.registrationCount += 1;
    if (customer.latestRegistration === null) customer.latestRegistration = record;
    customer.records.push(record);
    if (record.expectedCommission !== null) {
      customer.expectedCommissionTotal += record.expectedCommission;
      expectedCommissionTotal += record.expectedCommission;
    }
    if (record.paidCommission === null) {
      customer.paidCommissionUnknownCount += 1;
      paidCommissionUnknownCount += 1;
    } else {
      customer.paidCommissionKnownTotal += record.paidCommission;
      paidCommissionKnownTotal += record.paidCommission;
    }
  }

  const customers = Array.from(customersByUserId.values()).map((customer) => ({
    ...customer,
    allocationPct: roundAmount(numberValue(customer.allocationPct)),
    expectedCommissionTotal: roundAmount(customer.expectedCommissionTotal),
    paidCommissionKnownTotal: roundAmount(customer.paidCommissionKnownTotal),
    records: customer.records,
  }));
  const cumulativeTurnover = customers.reduce((sum, customer) => sum + numberValue(customer.latestRegistration?.transactionCumulative), 0);
  const latestIncrementTotal = customers.reduce((sum, customer) => sum + numberValue(customer.latestRegistration?.transactionIncrement), 0);
  return {
    hasTeam: customers.length > 0,
    customers,
    summary: {
      customerCount: customers.length,
      registrationCount,
      cumulativeTurnover: roundAmount(cumulativeTurnover),
      latestIncrementTotal: roundAmount(latestIncrementTotal),
      expectedCommissionTotal: roundAmount(expectedCommissionTotal),
      paidCommissionKnownTotal: roundAmount(paidCommissionKnownTotal),
      paidCommissionUnknownCount,
    },
  };
}

export async function getLedger52OkxCommissionDashboard(params: { mode: DashboardMode; memberUserId?: number }) {
  await ensureLedger52OkxCommissionTables();
  const conn = await getRequiredConnection();
  const memberUserId = params.mode === "member" ? numberValue(params.memberUserId, 0) : 0;
  if (params.mode === "member" && (!Number.isInteger(memberUserId) || memberUserId <= 0)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "成员身份无效" });
  }
  const accountWhere = params.mode === "member" ? " AND a.member_user_id = ?" : "";
  const [accountRowsResult] = await conn.execute(
    `SELECT a.id, a.member_user_id, a.okx_uid, a.okx_login, a.vip_tier, a.allocation_config_json, a.updated_at,
            u.username AS customer_username, u.invited_by_user_id AS customer_invited_by_user_id,
            u.avatar AS customer_avatar,
            COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), '未命名客户') AS customer_name
       FROM ledger52_okx_commission_accounts a
       LEFT JOIN users u ON u.id = a.member_user_id
      WHERE a.ledger_id = ? AND a.status = 'active'${accountWhere}
      ORDER BY a.updated_at DESC, a.id DESC`,
    params.mode === "member" ? [LEDGER_ID, memberUserId] : [LEDGER_ID],
  );
  const accountRows = asRows(accountRowsResult);
  // 旧配置可能早于“管理员不参与分佣”规则；读取时也绝不向客户端暴露管理员受益人。
  const allocationBeneficiaryIds = Array.from(new Set(accountRows.flatMap((row) => (
    parseAllocationConfig(row.allocation_config_json).map((allocation) => allocation.userId)
  )))).filter((userId) => userId > 0);
  const administrativeBeneficiaryIds = new Set<number>();
  if (allocationBeneficiaryIds.length > 0) {
    const placeholders = allocationBeneficiaryIds.map(() => "?").join(",");
    const [beneficiaryRowsResult] = await conn.execute(
      `SELECT id, role FROM users WHERE id IN (${placeholders})`,
      allocationBeneficiaryIds,
    );
    for (const beneficiary of asRows(beneficiaryRowsResult)) {
      if (isAdministrativeRole(beneficiary.role)) administrativeBeneficiaryIds.add(numberValue(beneficiary.id, 0));
    }
  }
  const accountIds = accountRows.map((row) => numberValue(row.id, 0)).filter((id) => id > 0);
  const recordsByAccount = new Map<number, any[]>();
  if (accountIds.length > 0) {
    const placeholders = accountIds.map(() => "?").join(",");
    const [recordRowsResult] = await conn.execute(
      `SELECT id, account_id,
              DATE_FORMAT(recorded_at, '%Y-%m-%dT%H:%i') AS recorded_at,
              transaction_cumulative_usdt, transaction_increment_usdt,
              spot_cumulative_usdt, futures_cumulative_usdt, spot_increment_usdt, futures_increment_usdt,
              rebate_rate_pct, expected_commission_usdt, paid_commission_usdt
         FROM ledger52_okx_commission_records
        WHERE ledger_id = ? AND account_id IN (${placeholders})
        ORDER BY account_id ASC, recorded_at ASC, id ASC`,
      [LEDGER_ID, ...accountIds],
    );
    for (const row of asRows(recordRowsResult)) {
      const accountId = numberValue(row.account_id, 0);
      const entries = recordsByAccount.get(accountId) || [];
      entries.push(mapRecord(row));
      recordsByAccount.set(accountId, entries);
    }
  }

  const accountIdByMemberUserId = new Map<number, number>();
  for (const row of accountRows) {
    const accountUserId = numberValue(row.member_user_id, 0);
    const accountId = numberValue(row.id, 0);
    if (accountUserId > 0 && accountId > 0) accountIdByMemberUserId.set(accountUserId, accountId);
  }
  const accountDirectory: CommissionAccountDirectoryEntry[] = accountRows.flatMap((row) => {
    const accountId = numberValue(row.id, 0);
    const userId = numberValue(row.member_user_id, 0);
    if (!accountId || !userId) return [];
    const accountRecords = recordsByAccount.get(accountId) || [];
    const latestRecord = accountRecords[accountRecords.length - 1];
    return [{
      accountId,
      userId,
      invitedByUserId: numberValue(row.customer_invited_by_user_id, 0) || null,
      customerName: displayName(row),
      username: textValue(row.customer_username),
      cumulativeTurnover: numberValue(latestRecord?.transactionCumulative),
    }];
  });
  const adminAccountCommissionSummaries = params.mode === "admin"
    ? await getAdminAccountCommissionSummaries(conn, accountIds, accountIdByMemberUserId, accountDirectory)
    : new Map<number, AdminAccountCommissionSummary>();
  const accounts = accountRows.map((row) => {
    const accountId = numberValue(row.id, 0);
    const commissionSummary = adminAccountCommissionSummaries.get(accountId) || {
      personalExpectedCommissionTotal: 0,
      teamCustomerCount: 0,
      teamCumulativeTurnover: 0,
      teamExpectedCommissionTotal: 0,
      totalExpectedCommission: 0,
      teamMembers: [] as AdminTeamMember[],
      monthlyCommission: [] as AdminMonthlyCommission[],
    };
    return {
      id: String(accountId),
      userId: numberValue(row.member_user_id, 0),
      customerName: displayName(row),
      username: textValue(row.customer_username),
      avatar: textValue(row.customer_avatar) || null,
      okxUid: textValue(row.okx_uid),
      okxLogin: textValue(row.okx_login),
      vipTier: normalizeOkxVipTier(row.vip_tier),
      allocationSnapshot: parseAllocationConfig(row.allocation_config_json)
        .filter((allocation) => !administrativeBeneficiaryIds.has(allocation.userId)),
      personalExpectedCommissionTotal: commissionSummary.personalExpectedCommissionTotal,
      teamSummary: {
        customerCount: commissionSummary.teamCustomerCount,
        cumulativeTurnover: commissionSummary.teamCumulativeTurnover,
        expectedCommissionTotal: commissionSummary.teamExpectedCommissionTotal,
        totalExpectedCommission: commissionSummary.totalExpectedCommission,
        members: commissionSummary.teamMembers,
      },
      monthlyCommission: commissionSummary.monthlyCommission,
      records: recordsByAccount.get(accountId) || [],
    };
  });
  const team = params.mode === "member"
    ? await getLedger52OkxCommissionTeamForBeneficiary(memberUserId)
    : { hasTeam: false, customers: [], summary: null };
  return {
    viewerMode: params.mode,
    accounts,
    team,
    hasCommissionBusiness: params.mode === "member" && (accounts.length > 0 || team.hasTeam),
  };
}

export async function upsertLedger52OkxCommissionAccount(params: {
  actorUserId: number;
  memberUserId: number;
  okxUid: string;
  okxLogin?: string;
  vipTier: string;
  allocations: AllocationInput[];
  clientRequestId: string;
}) {
  await ensureLedger52OkxCommissionTables();
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OKX佣金数据库连接失败" });
  const tx: SqlConnection = connection;
  const actorUserId = numberValue(params.actorUserId, 0);
  const memberUserId = numberValue(params.memberUserId, 0);
  const okxUid = textValue(params.okxUid);
  const okxLogin = textValue(params.okxLogin).slice(0, 128);
  const vipTier = normalizeOkxVipTier(params.vipTier);
  const clientRequestId = textValue(params.clientRequestId);
  if (!Number.isInteger(actorUserId) || actorUserId <= 0 || !Number.isInteger(memberUserId) || memberUserId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "客户身份无效" });
  }
  if (!/^\d{17,20}$/.test(okxUid)) throw new TRPCError({ code: "BAD_REQUEST", message: "OKX UID需填写17至20位数字" });
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(clientRequestId)) throw new TRPCError({ code: "BAD_REQUEST", message: "保存请求无效，请刷新后重试" });

  try {
    await tx.beginTransaction();
    const [previousRequestResult] = await tx.execute(
      `SELECT account_id FROM ledger52_okx_commission_account_audits
        WHERE ledger_id = ? AND operator_user_id = ? AND client_request_id = ?
        LIMIT 1 FOR UPDATE`,
      [LEDGER_ID, actorUserId, clientRequestId],
    );
    const previousRequest = asRows(previousRequestResult)[0];
    if (previousRequest) {
      await tx.commit();
      return { accountId: String(previousRequest.account_id), replayed: true, joinedLedger: false };
    }

    const joinedLedger = await ensureCustomerIsLedger52Member(tx, memberUserId);
    const allocations = await normalizeAllocations(tx, memberUserId, params.allocations);
    const allocationConfigJson = JSON.stringify(allocations);
    const [existingRowsResult] = await tx.execute(
      `SELECT id, okx_uid, okx_login, vip_tier, allocation_config_json
         FROM ledger52_okx_commission_accounts
        WHERE ledger_id = ? AND member_user_id = ?
        LIMIT 1 FOR UPDATE`,
      [LEDGER_ID, memberUserId],
    );
    const existing = asRows(existingRowsResult)[0];
    const [uidRowsResult] = await tx.execute(
      `SELECT id FROM ledger52_okx_commission_accounts
        WHERE ledger_id = ? AND okx_uid = ? AND member_user_id <> ?
        LIMIT 1 FOR UPDATE`,
      [LEDGER_ID, okxUid, memberUserId],
    );
    if (asRows(uidRowsResult)[0]) throw new TRPCError({ code: "CONFLICT", message: "该OKX UID已登记给其他客户" });

    let accountId = numberValue(existing?.id, 0);
    const afterSnapshot = JSON.stringify({ memberUserId, okxUid, okxLogin: okxLogin || null, vipTier, allocations });
    if (accountId > 0) {
      await tx.execute(
        `UPDATE ledger52_okx_commission_accounts
            SET okx_uid = ?, okx_login = ?, vip_tier = ?, allocation_config_json = ?, status = 'active', updated_by_user_id = ?
          WHERE id = ? AND ledger_id = ?`,
        [okxUid, okxLogin || null, vipTier, allocationConfigJson, actorUserId, accountId, LEDGER_ID],
      );
    } else {
      const [insertResult] = await tx.execute(
        `INSERT INTO ledger52_okx_commission_accounts
          (ledger_id, member_user_id, okx_uid, okx_login, vip_tier, allocation_config_json, status, created_by_user_id, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [LEDGER_ID, memberUserId, okxUid, okxLogin || null, vipTier, allocationConfigJson, actorUserId, actorUserId],
      );
      accountId = numberValue((insertResult as any)?.insertId, 0);
    }
    if (!accountId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "客户资料保存失败" });

    await tx.execute(
      `INSERT INTO ledger52_okx_commission_account_audits
        (ledger_id, account_id, member_user_id, operation, before_snapshot, after_snapshot, client_request_id, operator_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        LEDGER_ID,
        accountId,
        memberUserId,
        existing ? "update" : "create",
        existing ? JSON.stringify({ okxUid: textValue(existing.okx_uid), okxLogin: textValue(existing.okx_login) || null, vipTier: normalizeOkxVipTier(existing.vip_tier), allocations: parseAllocationConfig(existing.allocation_config_json) }) : null,
        afterSnapshot,
        clientRequestId,
        actorUserId,
      ],
    );
    await tx.commit();
    return { accountId: String(accountId), replayed: false, joinedLedger };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.release?.();
  }
}

export async function createLedger52OkxCommissionRecord(params: {
  actorUserId: number;
  accountId: number;
  recordedAt: string;
  cumulativeTurnover: string;
  clientRequestId: string;
}) {
  await ensureLedger52OkxCommissionTables();
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OKX佣金数据库连接失败" });
  const tx: SqlConnection = connection;
  const actorUserId = numberValue(params.actorUserId, 0);
  const accountId = numberValue(params.accountId, 0);
  const recordedAt = mysqlDateTime(params.recordedAt);
  const cumulativeTurnover = parseRequiredNonNegativeDecimal(params.cumulativeTurnover, "累计交易额");
  const clientRequestId = textValue(params.clientRequestId);
  if (!Number.isInteger(actorUserId) || actorUserId <= 0 || !Number.isInteger(accountId) || accountId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "登记对象无效" });
  }
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(clientRequestId)) throw new TRPCError({ code: "BAD_REQUEST", message: "登记请求无效，请刷新后重试" });

  try {
    await tx.beginTransaction();
    const [previousRequestResult] = await tx.execute(
      `SELECT id FROM ledger52_okx_commission_records
        WHERE ledger_id = ? AND created_by_user_id = ? AND client_request_id = ?
        LIMIT 1 FOR UPDATE`,
      [LEDGER_ID, actorUserId, clientRequestId],
    );
    const previousRequest = asRows(previousRequestResult)[0];
    if (previousRequest) {
      await tx.commit();
      return { recordId: String(previousRequest.id), replayed: true };
    }

    const [accountRowsResult] = await tx.execute(
      `SELECT id, vip_tier, allocation_config_json
         FROM ledger52_okx_commission_accounts
        WHERE id = ? AND ledger_id = ? AND status = 'active'
        LIMIT 1 FOR UPDATE`,
      [accountId, LEDGER_ID],
    );
    const account = asRows(accountRowsResult)[0];
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "客户佣金资料不存在或已停用" });
    const rebateRate = getOkxVipTierRebateRate(account.vip_tier);
    const allocations = parseAllocationConfig(account.allocation_config_json);
    const allocationTotal = allocations.reduce((sum, allocation) => sum + allocation.percentage, 0);
    if (allocations.length === 0 || Math.abs(allocationTotal - 100) > 0.000001) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "客户返佣分配不完整，请先保存客户与返佣分配" });
    }

    const [previousRecordResult] = await tx.execute(
      `SELECT DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS recorded_at,
              transaction_cumulative_usdt, spot_cumulative_usdt, futures_cumulative_usdt
         FROM ledger52_okx_commission_records
        WHERE ledger_id = ? AND account_id = ?
        ORDER BY recorded_at DESC, id DESC
        LIMIT 1 FOR UPDATE`,
      [LEDGER_ID, accountId],
    );
    const previousRecord = asRows(previousRecordResult)[0];
    const previousTurnover = previousRecord?.transaction_cumulative_usdt === null || previousRecord?.transaction_cumulative_usdt === undefined
      ? numberValue(previousRecord?.spot_cumulative_usdt, 0) + numberValue(previousRecord?.futures_cumulative_usdt, 0)
      : numberValue(previousRecord.transaction_cumulative_usdt, 0);
    const previousRecordedAt = textValue(previousRecord?.recorded_at);
    if (previousRecordedAt && recordedAt < previousRecordedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "登记时间不能早于上一笔已保存登记" });
    }
    if (cumulativeTurnover + 0.00000001 < previousTurnover) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "累计交易额不能低于上一笔已保存登记" });
    }

    const turnoverIncrement = roundAmount(cumulativeTurnover - previousTurnover);
    const expectedCommission = roundAmount(turnoverIncrement * rebateRate / 100);
    const allocationSnapshotJson = JSON.stringify(allocations);
    const [insertResult] = await tx.execute(
      `INSERT INTO ledger52_okx_commission_records
        (ledger_id, account_id, recorded_at, transaction_cumulative_usdt, transaction_increment_usdt,
         spot_cumulative_usdt, futures_cumulative_usdt, spot_increment_usdt, futures_increment_usdt,
         rebate_rate_pct, expected_commission_usdt, paid_commission_usdt, allocation_snapshot_json,
         client_request_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        LEDGER_ID,
        accountId,
        recordedAt,
        decimalText(cumulativeTurnover),
        decimalText(turnoverIncrement),
        decimalText(cumulativeTurnover),
        decimalText(0),
        decimalText(turnoverIncrement),
        decimalText(0),
        decimalText(rebateRate),
        decimalText(expectedCommission),
        null,
        allocationSnapshotJson,
        clientRequestId,
        actorUserId,
      ],
    );
    const recordId = numberValue((insertResult as any)?.insertId, 0);
    if (!recordId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "交易量登记保存失败" });
    for (const allocation of allocations) {
      const expectedAmount = roundAmount(expectedCommission * allocation.percentage / 100);
      await tx.execute(
        `INSERT INTO ledger52_okx_commission_record_allocations
          (ledger_id, commission_record_id, beneficiary_user_id, beneficiary_name_snapshot,
           beneficiary_invite_code_snapshot, allocation_pct, expected_amount_usdt, paid_amount_usdt, payout_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending')`,
        [
          LEDGER_ID,
          recordId,
          allocation.userId,
          allocation.name.slice(0, 160),
          allocation.inviteCode,
          decimalText(allocation.percentage),
          decimalText(expectedAmount),
        ],
      );
    }
    await tx.commit();
    return { recordId: String(recordId), replayed: false };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.release?.();
  }
}


type PendingPayoutAllocation = {
  allocationId: string;
  recordId: string;
  sourceCustomerName: string;
  sourceUsername: string;
  recordedAt: string;
  amount: number;
};

type PendingPayoutGroup = {
  beneficiaryUserId: number;
  beneficiaryName: string;
  beneficiaryUsername: string;
  allocationCount: number;
  totalAmount: number;
  allocations: PendingPayoutAllocation[];
};

function decimalToUnits(value: unknown): bigint {
  const raw = textValue(value);
  const match = raw.match(/^(-?)(\d+)(?:\.(\d{1,8}))?$/);
  if (!match) return 0n;
  const units = BigInt(match[2]) * 100_000_000n + BigInt((match[3] || '').padEnd(8, '0'));
  return match[1] === '-' ? -units : units;
}

function unitsToDecimalText(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const integer = absolute / 100_000_000n;
  const fraction = String(absolute % 100_000_000n).padStart(8, '0');
  return `${negative ? '-' : ''}${integer}.${fraction}`;
}

function unitsToDisplayNumber(value: bigint): number {
  return Number(unitsToDecimalText(value));
}

/**
 * 仅给52号账本资金管理员使用的待发列表。数据以冻结的每笔受益分配为准，
 * 组内按收款人聚合，明细仍完整保留，供勾选后再进入最终确认。
 */
export async function getLedger52OkxCommissionPendingPayouts(): Promise<{ groups: PendingPayoutGroup[]; totalAmount: number; totalAllocationCount: number }> {
  await ensureLedger52OkxCommissionTables();
  const conn = await getRequiredConnection();
  const [rowsResult] = await conn.execute(
    `SELECT ra.id AS allocation_id, ra.commission_record_id, ra.beneficiary_user_id,
            ra.beneficiary_name_snapshot,
            COALESCE(NULLIF(beneficiary.name, ''), NULLIF(beneficiary.username, ''), ra.beneficiary_name_snapshot) AS beneficiary_name,
            COALESCE(beneficiary.username, '') AS beneficiary_username,
            COALESCE(NULLIF(source_user.name, ''), NULLIF(source_user.username, ''), CONCAT('客户 #', source_account.member_user_id)) AS source_customer_name,
            COALESCE(source_user.username, '') AS source_username,
            DATE_FORMAT(record.recorded_at, '%Y-%m-%d') AS recorded_at,
            ra.expected_amount_usdt
       FROM ledger52_okx_commission_record_allocations ra
       INNER JOIN ledger52_okx_commission_records record
               ON record.id = ra.commission_record_id AND record.ledger_id = ra.ledger_id
       INNER JOIN ledger52_okx_commission_accounts source_account
               ON source_account.id = record.account_id AND source_account.ledger_id = record.ledger_id
       LEFT JOIN users source_user ON source_user.id = source_account.member_user_id
       LEFT JOIN users beneficiary ON beneficiary.id = ra.beneficiary_user_id
      WHERE ra.ledger_id = ?
        AND ra.payout_status = 'pending'
        AND ra.paid_amount_usdt IS NULL
        AND COALESCE(ra.expected_amount_usdt, 0) > 0
      ORDER BY beneficiary_name ASC, beneficiary_username ASC, record.recorded_at ASC, record.id ASC, ra.id ASC`,
    [LEDGER_ID],
  );
  const groupsByUserId = new Map<number, { group: PendingPayoutGroup; units: bigint }>();
  let totalUnits = 0n;
  for (const row of asRows(rowsResult)) {
    const beneficiaryUserId = numberValue(row.beneficiary_user_id, 0);
    const units = decimalToUnits(row.expected_amount_usdt);
    if (!Number.isInteger(beneficiaryUserId) || beneficiaryUserId <= 0 || units <= 0n) continue;
    let aggregate = groupsByUserId.get(beneficiaryUserId);
    if (!aggregate) {
      aggregate = {
        units: 0n,
        group: {
          beneficiaryUserId,
          beneficiaryName: textValue(row.beneficiary_name) || textValue(row.beneficiary_name_snapshot) || `客户 #${beneficiaryUserId}`,
          beneficiaryUsername: textValue(row.beneficiary_username),
          allocationCount: 0,
          totalAmount: 0,
          allocations: [],
        },
      };
      groupsByUserId.set(beneficiaryUserId, aggregate);
    }
    aggregate.units += units;
    aggregate.group.allocationCount += 1;
    aggregate.group.allocations.push({
      allocationId: String(row.allocation_id),
      recordId: String(row.commission_record_id),
      sourceCustomerName: textValue(row.source_customer_name) || '未命名客户',
      sourceUsername: textValue(row.source_username),
      recordedAt: textValue(row.recorded_at),
      amount: unitsToDisplayNumber(units),
    });
    totalUnits += units;
  }
  const groups = Array.from(groupsByUserId.values()).map(({ group, units }) => ({
    ...group,
    totalAmount: unitsToDisplayNumber(units),
  })).sort((left, right) => right.totalAmount - left.totalAmount || left.beneficiaryName.localeCompare(right.beneficiaryName));
  return { groups, totalAmount: unitsToDisplayNumber(totalUnits), totalAllocationCount: groups.reduce((sum, group) => sum + group.allocationCount, 0) };
}

/**
 * 对已勾选的待发分佣执行一次性、幂等的钱包入账：
 * - 每位收款人每批只写一条52号USDT钱包流水；
 * - 每条冻结分佣原子地标记为已发并关联批次与钱包流水；
 * - 请求重放返回同一批次，绝不二次入账。
 */
export async function issueLedger52OkxCommissionPayouts(params: {
  actorUserId: number;
  allocationIds: string[];
  clientRequestId: string;
}) {
  await ensureLedger52OkxCommissionTables();
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'OKX佣金数据库连接失败' });
  const tx: SqlConnection = connection;
  const actorUserId = numberValue(params.actorUserId, 0);
  const clientRequestId = textValue(params.clientRequestId);
  const allocationIds = Array.from(new Set((params.allocationIds || []).map((id) => textValue(id)).filter((id) => /^\d+$/.test(id))));
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) throw new TRPCError({ code: 'UNAUTHORIZED', message: '发放身份无效' });
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(clientRequestId)) throw new TRPCError({ code: 'BAD_REQUEST', message: '发放请求无效，请刷新后重试' });
  if (allocationIds.length === 0 || allocationIds.length > 2_000) throw new TRPCError({ code: 'BAD_REQUEST', message: '请选择1至2000笔待发佣金' });

  try {
    await tx.beginTransaction();
    const [previousBatchResult] = await tx.execute(
      `SELECT id, recipient_count, allocation_count, total_amount_usdt
         FROM ledger52_okx_commission_payout_batches
        WHERE ledger_id = ? AND operator_user_id = ? AND client_request_id = ?
        LIMIT 1 FOR UPDATE`,
      [LEDGER_ID, actorUserId, clientRequestId],
    );
    const previousBatch = asRows(previousBatchResult)[0];
    if (previousBatch) {
      await tx.commit();
      return {
        batchId: String(previousBatch.id),
        recipientCount: numberValue(previousBatch.recipient_count),
        allocationCount: numberValue(previousBatch.allocation_count),
        totalAmount: numberValue(previousBatch.total_amount_usdt),
        replayed: true,
      };
    }

    const placeholders = allocationIds.map(() => '?').join(',');
    const [rowsResult] = await tx.execute(
      `SELECT ra.id AS allocation_id, ra.commission_record_id, ra.beneficiary_user_id,
              ra.expected_amount_usdt
         FROM ledger52_okx_commission_record_allocations ra
        WHERE ra.ledger_id = ?
          AND ra.id IN (${placeholders})
          AND ra.payout_status = 'pending'
          AND ra.paid_amount_usdt IS NULL
          AND COALESCE(ra.expected_amount_usdt, 0) > 0
        FOR UPDATE`,
      [LEDGER_ID, ...allocationIds],
    );
    const allocationRows = asRows(rowsResult);
    if (allocationRows.length !== allocationIds.length) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '部分待发佣金状态已变化，请刷新清单后重新选择' });
    }

    const recipients = new Map<number, { units: bigint; allocationIds: string[]; recordIds: Set<string> }>();
    let totalUnits = 0n;
    for (const row of allocationRows) {
      const beneficiaryUserId = numberValue(row.beneficiary_user_id, 0);
      const units = decimalToUnits(row.expected_amount_usdt);
      if (!Number.isInteger(beneficiaryUserId) || beneficiaryUserId <= 0 || units <= 0n) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '待发佣金金额异常，请刷新后核对' });
      }
      const recipient = recipients.get(beneficiaryUserId) || { units: 0n, allocationIds: [], recordIds: new Set<string>() };
      recipient.units += units;
      recipient.allocationIds.push(String(row.allocation_id));
      recipient.recordIds.add(String(row.commission_record_id));
      recipients.set(beneficiaryUserId, recipient);
      totalUnits += units;
    }
    if (totalUnits <= 0n || recipients.size === 0) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '没有可发放的有效佣金' });

    const [batchInsert] = await tx.execute(
      `INSERT INTO ledger52_okx_commission_payout_batches
        (ledger_id, client_request_id, operator_user_id, recipient_count, allocation_count, total_amount_usdt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [LEDGER_ID, clientRequestId, actorUserId, recipients.size, allocationRows.length, unitsToDecimalText(totalUnits)],
    );
    const batchId = numberValue((batchInsert as any)?.insertId, 0);
    if (!batchId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '佣金发放批次创建失败' });

    for (const [beneficiaryUserId, recipient] of recipients) {
      const amountText = unitsToDecimalText(recipient.units);
      const [walletInsert] = await tx.execute(
        `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
         VALUES (?, ?, CAST(? AS DECIMAL(36,18)), ?, NOW(), NOW())`,
        [LEDGER_ID, beneficiaryUserId, amountText, `交易所佣金发放 · 批次${batchId}`],
      );
      const walletBalanceId = numberValue((walletInsert as any)?.insertId, 0);
      if (!walletBalanceId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '钱包入账失败，已阻止佣金状态更新' });
      const recipientPlaceholders = recipient.allocationIds.map(() => '?').join(',');
      await tx.execute(
        `UPDATE ledger52_okx_commission_record_allocations
            SET paid_amount_usdt = expected_amount_usdt,
                payout_status = 'paid',
                payout_batch_id = ?,
                payout_wallet_balance_id = ?,
                paid_at = NOW(),
                paid_by_user_id = ?
          WHERE ledger_id = ?
            AND id IN (${recipientPlaceholders})
            AND payout_status = 'pending'
            AND paid_amount_usdt IS NULL`,
        [batchId, walletBalanceId, actorUserId, LEDGER_ID, ...recipient.allocationIds],
      );
    }

    const recordIds = Array.from(new Set(allocationRows.map((row) => String(row.commission_record_id))));
    if (recordIds.length > 0) {
      const recordPlaceholders = recordIds.map(() => '?').join(',');
      await tx.execute(
        `UPDATE ledger52_okx_commission_records record
            SET paid_commission_usdt = (
              SELECT COALESCE(SUM(COALESCE(allocation.paid_amount_usdt, 0)), 0)
                FROM ledger52_okx_commission_record_allocations allocation
               WHERE allocation.ledger_id = record.ledger_id
                 AND allocation.commission_record_id = record.id
            )
          WHERE record.ledger_id = ?
            AND record.id IN (${recordPlaceholders})`,
        [LEDGER_ID, ...recordIds],
      );
    }
    await tx.commit();
    return {
      batchId: String(batchId),
      recipientCount: recipients.size,
      allocationCount: allocationRows.length,
      totalAmount: unitsToDisplayNumber(totalUnits),
      replayed: false,
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.release?.();
  }
}
