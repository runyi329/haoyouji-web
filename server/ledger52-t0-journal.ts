import { TRPCError } from "@trpc/server";
import { getDbConnection, getDbTransactionConnection } from "./db";
import * as dbLedger from "./db-ledger";

export const LEDGER_52_T0_JOURNAL_ID = 52;
/** OKX VIP 2 合约：挂单 0.0150%，市价吃单 0.0360%（2026-10-04由管理员确认）。 */
export const OKX_VIP2_TAKER_FEE_RATE = "0.00036";
const POSITION_ARCHIVE_STEP = 10;

export type T0JournalAction = "openLong" | "closeLong" | "openShort" | "closeShort";
const T0_JOURNAL_ACTIONS = new Set<T0JournalAction>(["openLong", "closeLong", "openShort", "closeShort"]);
const ETH_QUANTITY_RESTORE_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;

export type T0JournalActor = {
  id: number;
  role?: string | null;
  isViewingAs?: boolean;
};

export type T0JournalReadScope =
  | { mode: "admin"; journalOwnerUserId: number }
  | { mode: "member"; relatedUserId: number };

export type SaveT0JournalEntryInput = {
  actorUserId: number;
  accountId?: number;
  accountName?: string;
  relatedUserId: number;
  symbol: "ETH";
  action: T0JournalAction;
  quantity: string;
  price: string;
  targetPrice?: string;
  note?: string;
  clientRequestId: string;
};

let tablesReady: Promise<void> | null = null;

function asRows(result: unknown): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as any[];
  return Array.isArray(result) ? result as any[] : [];
}

function isoTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** 输入可为整数或一/两位小数，入账统一使用两位小数字符串，避免浮点补零。 */
function normalizeEthQuantity(value: string): string {
  const [integerPart, fractionalPart = ""] = String(value).trim().split(".");
  return `${integerPart}.${fractionalPart.padEnd(2, "0")}`;
}

function actionSide(action: T0JournalAction): "long" | "short" {
  return action === "openLong" || action === "closeLong" ? "long" : "short";
}

function isOpeningAction(action: T0JournalAction): boolean {
  return action === "openLong" || action === "openShort";
}

/**
 * 不受前端点击价格格影响，始终按实际成交价归入十美元档：
 * 多仓向上归档（2701 → 2710），空仓向下归档（2701 → 2700）。
 */
function archivePriceForAction(action: T0JournalAction, value: unknown): number {
  const numeric = toNumber(value);
  if (numeric <= 0) return 0;
  const scaled = numeric / POSITION_ARCHIVE_STEP;
  const archive = actionSide(action) === "long"
    ? Math.ceil(scaled - 1e-9)
    : Math.floor(scaled + 1e-9);
  return Number((archive * POSITION_ARCHIVE_STEP).toFixed(8));
}

function archivedTargetPrice(action: T0JournalAction, targetPrice: unknown, fallbackPrice?: unknown): number {
  const target = toNumber(targetPrice);
  return archivePriceForAction(action, target > 0 ? target : fallbackPrice);
}

function quantityToCents(value: unknown): number {
  const normalized = normalizeEthQuantity(String(value));
  const [integerPart = "0", fractionalPart = "00"] = normalized.split(".");
  return Number(integerPart) * 100 + Number(fractionalPart.slice(0, 2).padEnd(2, "0"));
}

function priceKey(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toFixed(8);
}

function relatedUserKey(value: unknown): string {
  const userId = toNumber(value);
  return userId > 0 ? String(userId) : "legacy-unlinked";
}

function calculateAvailableCloseCents(rows: any[], action: T0JournalAction, targetPrice: string, relatedUserId: number): number {
  const balances = new Map<string, number>();
  for (const row of rows) {
    const rowAction = String(row.action) as T0JournalAction;
    const side = actionSide(rowAction);
    const userKey = relatedUserKey(row.related_user_id);
    if (isOpeningAction(rowAction)) {
      // 用实际开仓成交价重算，以自动兼容旧版按多空方向写入的归档档位。
      const archivePrice = archivePriceForAction(rowAction, row.price);
      const key = `${side}:${priceKey(archivePrice)}:${userKey}`;
      balances.set(key, (balances.get(key) || 0) + quantityToCents(row.quantity));
      continue;
    }
    if (row.target_price === null || row.target_price === undefined) continue;
    const archivePrice = archivedTargetPrice(rowAction, row.target_price);
    const key = `${side}:${priceKey(archivePrice)}:${userKey}`;
    balances.set(key, Math.max(0, (balances.get(key) || 0) - quantityToCents(row.quantity)));
  }
  const archivePrice = archivedTargetPrice(action, targetPrice);
  return balances.get(`${actionSide(action)}:${priceKey(archivePrice)}:${relatedUserKey(relatedUserId)}`) || 0;
}

function mapAccount(row: any) {
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    lastUsedAt: row.last_used_at ? isoTime(row.last_used_at) : null,
    createdAt: isoTime(row.created_at),
  };
}

function mapRelatedUser(row: any) {
  const id = toNumber(row.related_user_id ?? row.id);
  return {
    id,
    name: String(row.name || row.username || `用户#${id}`),
    username: row.username ? String(row.username) : undefined,
    avatar: row.avatar ? String(row.avatar) : undefined,
    lastUsedAt: row.last_used_at ? isoTime(row.last_used_at) : null,
  };
}

function mapEntry(row: any) {
  const relatedUserId = toNumber(row.related_user_id ?? row.relatedUserId);
  return {
    id: String(row.id),
    accountId: Number(row.account_id),
    accountName: String(row.account_name || ""),
    relatedUserId: relatedUserId > 0 ? relatedUserId : undefined,
    relatedUserName: row.related_user_name ?? row.relatedUserName ?? undefined,
    relatedUsername: row.related_username ?? row.relatedUsername ?? undefined,
    relatedUserAvatar: row.related_user_avatar ?? row.relatedUserAvatar ?? undefined,
    symbol: String(row.symbol || "ETH"),
    action: String(row.action) as T0JournalAction,
    quantity: toNumber(row.quantity),
    price: toNumber(row.price),
    fee: toNumber(row.fee_usdt),
    targetPrice: row.target_price === null || row.target_price === undefined ? undefined : toNumber(row.target_price),
    note: row.note ? String(row.note) : undefined,
    createdAt: isoTime(row.trade_time || row.created_at),
  };
}

function mapRecoverableAudit(row: any) {
  try {
    const snapshot = JSON.parse(String(row.before_snapshot || ""));
    // 旧版删除审计未保存重建所需的请求标识，保留审计但不在“可恢复”中展示，避免误恢复。
    if (!snapshot?.id || !snapshot?.client_request_id) return null;
    return {
      auditId: String(row.audit_id),
      operation: String(row.operation),
      revertedAt: isoTime(row.created_at),
      entry: mapEntry(snapshot),
    };
  } catch {
    return null;
  }
}

/**
 * 账户与流水均按 ledger 52 + 当前管理员 user_id 分区。
 * 不设外键，避免旧库迁移时受历史数据状态影响；所有读写均由接口侧权限校验保障。
 */
export async function ensureLedger52T0JournalTables(conn?: any): Promise<void> {
  if (tablesReady) return tablesReady;
  tablesReady = (async () => {
    const db = conn ?? await getDbConnection();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0 速记账本数据库连接失败" });

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_accounts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        name VARCHAR(80) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_used_at DATETIME(3) DEFAULT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_account_owner_name (ledger_id, user_id, name),
        KEY idx_t0_journal_account_recent (ledger_id, user_id, is_active, last_used_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：当前管理员可见的下单账户'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_entries (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        account_id BIGINT UNSIGNED NOT NULL,
        related_user_id BIGINT UNSIGNED DEFAULT NULL,
        symbol VARCHAR(16) NOT NULL DEFAULT 'ETH',
        action ENUM('openLong','closeLong','openShort','closeShort') NOT NULL,
        quantity DECIMAL(36,18) NOT NULL,
        price DECIMAL(36,18) NOT NULL,
        fee_usdt DECIMAL(36,18) NOT NULL DEFAULT 0,
        target_price DECIMAL(36,18) DEFAULT NULL,
        note VARCHAR(500) DEFAULT NULL,
        client_request_id VARCHAR(64) NOT NULL,
        created_by_user_id INT NOT NULL,
        trade_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_entry_request (ledger_id, user_id, client_request_id),
        KEY idx_t0_journal_entry_account_time (ledger_id, user_id, account_id, trade_time),
        KEY idx_t0_journal_entry_related_user_time (ledger_id, user_id, related_user_id, trade_time),
        KEY idx_t0_journal_entry_owner_time (ledger_id, user_id, trade_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：管理员手工下单流水与创建审计'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_entry_audits (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        entry_id BIGINT UNSIGNED NOT NULL,
        operation ENUM('update','delete','revert','restore') NOT NULL,
        before_snapshot LONGTEXT NOT NULL,
        after_snapshot LONGTEXT DEFAULT NULL,
        operator_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_t0_journal_audit_entry (ledger_id, user_id, entry_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：编辑与删除审计快照'
    `);

    // 兼容已经创建过旧版审计表的生产库，使其可记录速记回撤与恢复动作。
    await db.execute(`
      ALTER TABLE ledger52_t0_journal_entry_audits
        MODIFY COLUMN operation ENUM('update','delete','revert','restore') NOT NULL
    `);

    // 兼容已创建的T+0流水表：关联用户为新增维度，旧流水保留为空，以免篡改历史记录。
    const [relatedUserColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'related_user_id'`);
    if (asRows(relatedUserColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN related_user_id BIGINT UNSIGNED DEFAULT NULL AFTER account_id,
          ADD KEY idx_t0_journal_entry_related_user_time (ledger_id, user_id, related_user_id, trade_time)
      `);
    }
  })().catch((error) => {
    tablesReady = null;
    throw error;
  });
  return tablesReady;
}

/**
 * T+0阅读权限：管理员读取其管理流水的全量关联用户数据；52号账本成员只读取自身关联用户ID的数据。
 * 身份代入不是实际成员会话，不能借此浏览个人仓位。
 */
export async function resolveLedger52T0JournalReadScope(actor: T0JournalActor): Promise<T0JournalReadScope> {
  if (actor.isViewingAs) {
    throw new TRPCError({ code: "FORBIDDEN", message: "代入成员视角不可访问T+0速记账本" });
  }
  if (actor.role === "super_admin" || actor.role === "admin") {
    return { mode: "admin", journalOwnerUserId: actor.id };
  }

  const membership = await dbLedger.getUserMembership(LEDGER_52_T0_JOURNAL_ID, actor.id);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅52号账本成员可访问T+0速记账本" });
  }
  if (membership.role === "owner" || membership.role === "admin") {
    return { mode: "admin", journalOwnerUserId: actor.id };
  }
  return { mode: "member", relatedUserId: actor.id };
}

/** 所有写入与关联用户搜索继续只开放给账本管理员。 */
export async function assertLedger52T0JournalAccess(actor: T0JournalActor): Promise<void> {
  const scope = await resolveLedger52T0JournalReadScope(actor);
  if (scope.mode !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅52号账本管理员可操作T+0速记账本" });
  }
}

export async function getLedger52T0Journal(scope: T0JournalReadScope) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  await ensureLedger52T0JournalTables(conn);

  const isAdminScope = scope.mode === "admin";
  const journalOwnerUserId = isAdminScope ? scope.journalOwnerUserId : 0;
  const relatedUserId = scope.mode === "member" ? scope.relatedUserId : 0;
  const [accountResult, entryResult, recoverableAuditResult, recentUserResult] = await Promise.all([
    isAdminScope
      ? conn.execute(
        `SELECT id, name, last_used_at, created_at
           FROM ledger52_t0_journal_accounts
          WHERE ledger_id = ? AND user_id = ? AND is_active = 1
          ORDER BY last_used_at IS NULL ASC, last_used_at DESC, updated_at DESC, id DESC`,
        [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
      )
      : conn.execute(
        `SELECT a.id, a.name, MAX(e.trade_time) AS last_used_at, MIN(a.created_at) AS created_at
           FROM ledger52_t0_journal_entries e
           INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id AND a.is_active = 1
          WHERE e.ledger_id = ? AND e.related_user_id = ?
          GROUP BY a.id, a.name
          ORDER BY last_used_at DESC, a.id DESC`,
        [LEDGER_52_T0_JOURNAL_ID, relatedUserId],
      ),
    conn.execute(
      `SELECT e.id, e.account_id, a.name AS account_name, e.symbol, e.action,
              e.related_user_id,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
              u.username AS related_username, u.avatar AS related_user_avatar,
              e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
         LEFT JOIN users u ON u.id = e.related_user_id
        WHERE e.ledger_id = ? AND ${isAdminScope ? "e.user_id = ?" : "e.related_user_id = ?"}
        ORDER BY e.trade_time ASC, e.id ASC
        LIMIT 2000`,
      [LEDGER_52_T0_JOURNAL_ID, isAdminScope ? journalOwnerUserId : relatedUserId],
    ),
    isAdminScope ? conn.execute(
      `SELECT a.id AS audit_id, a.entry_id, a.operation, a.before_snapshot, a.created_at
         FROM ledger52_t0_journal_entry_audits a
         INNER JOIN (
           SELECT entry_id, MAX(id) AS latest_audit_id
             FROM ledger52_t0_journal_entry_audits
            WHERE ledger_id = ? AND user_id = ?
            GROUP BY entry_id
         ) latest ON latest.latest_audit_id = a.id
        WHERE a.ledger_id = ? AND a.user_id = ?
          AND a.operation IN ('delete', 'revert')
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 30`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId, LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    ) : Promise.resolve([[]]),
    isAdminScope ? conn.execute(
      `SELECT e.related_user_id, u.username, u.name, u.avatar, MAX(e.trade_time) AS last_used_at
         FROM ledger52_t0_journal_entries e
         LEFT JOIN users u ON u.id = e.related_user_id
        WHERE e.ledger_id = ? AND e.user_id = ? AND e.related_user_id IS NOT NULL
        GROUP BY e.related_user_id, u.username, u.name, u.avatar
        ORDER BY last_used_at DESC, e.related_user_id DESC
        LIMIT 30`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    ) : Promise.resolve([[]]),
  ]);

  return {
    viewerMode: scope.mode,
    accounts: asRows(accountResult).map(mapAccount),
    entries: asRows(entryResult).map(mapEntry),
    recentUsers: asRows(recentUserResult).map(mapRelatedUser),
    recoverableEntries: asRows(recoverableAuditResult)
      .map(mapRecoverableAudit)
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}

/** 仅由已通过T+0管理员鉴权的路由调用，供关联用户的用户名/昵称模糊搜索使用。 */
export async function searchLedger52T0JournalUsers(query: string) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "用户搜索服务暂不可用" });
  const keyword = String(query || "").trim();
  if (!keyword) return [];
  const like = `%${keyword}%`;
  const [result] = await conn.execute(
    `SELECT id, username, name, avatar
       FROM users
      WHERE COALESCE(username, '') LIKE ? OR COALESCE(name, '') LIKE ?
      ORDER BY
        CASE WHEN username = ? THEN 0 WHEN name = ? THEN 1 ELSE 2 END,
        username ASC, id ASC
      LIMIT 20`,
    [like, like, keyword, keyword],
  );
  return asRows(result).map(mapRelatedUser);
}

export async function selectLedger52T0JournalAccount(userId: number, accountId: number) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  await ensureLedger52T0JournalTables(conn);

  const [result] = await conn.execute(
    `UPDATE ledger52_t0_journal_accounts
        SET last_used_at = NOW(3)
      WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1`,
    [accountId, LEDGER_52_T0_JOURNAL_ID, userId],
  ) as any[];
  if (Number((result as any)?.affectedRows || 0) !== 1) {
    throw new TRPCError({ code: "NOT_FOUND", message: "下单账户不存在或无权选择" });
  }

  const [rows] = await conn.execute(
    `SELECT id, name, last_used_at, created_at
       FROM ledger52_t0_journal_accounts
      WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`,
    [accountId, LEDGER_52_T0_JOURNAL_ID, userId],
  );
  const account = asRows(rows)[0];
  if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "下单账户不存在" });
  return { account: mapAccount(account) };
}

export async function saveLedger52T0JournalEntry(input: SaveT0JournalEntryInput) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const normalizedQuantity = normalizeEthQuantity(input.quantity);

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();

    const relatedUserId = Number(input.relatedUserId || 0);
    if (!Number.isInteger(relatedUserId) || relatedUserId <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请选择关联用户" });
    }
    const [relatedUserRows] = await tx.execute(
      `SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
      [relatedUserId],
    );
    if (!asRows(relatedUserRows)[0]) {
      throw new TRPCError({ code: "NOT_FOUND", message: "关联用户不存在或已失效，请重新选择" });
    }

    let accountId = Number(input.accountId || 0);
    let accountName = String(input.accountName || "").trim();
    if (accountId > 0) {
      const [rows] = await tx.execute(
        `SELECT id, name
           FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1
          LIMIT 1 FOR UPDATE`,
        [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      const account = asRows(rows)[0];
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "下单账户不存在或无权使用" });
      accountName = String(account.name);
    } else {
      if (!accountName) throw new TRPCError({ code: "BAD_REQUEST", message: "请填写下单账户名称" });
      const [result] = await tx.execute(
        `INSERT INTO ledger52_t0_journal_accounts (ledger_id, user_id, name, is_active, last_used_at)
         VALUES (?, ?, ?, 1, NOW(3))
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), is_active = 1, last_used_at = NOW(3), updated_at = NOW(3)`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountName],
      );
      accountId = Number((result as any).insertId || 0);
      if (!accountId) {
        const [rows] = await tx.execute(
          `SELECT id FROM ledger52_t0_journal_accounts
            WHERE ledger_id = ? AND user_id = ? AND name = ? LIMIT 1 FOR UPDATE`,
          [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountName],
        );
        accountId = Number(asRows(rows)[0]?.id || 0);
      }
      if (!accountId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "下单账户保存失败" });
    }

    await tx.execute(
      `UPDATE ledger52_t0_journal_accounts
          SET last_used_at = NOW(3)
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );

    const [existingRequestRows] = await tx.execute(
      `SELECT id
         FROM ledger52_t0_journal_entries
        WHERE ledger_id = ? AND user_id = ? AND client_request_id = ?
        LIMIT 1 FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.clientRequestId],
    );
    const isRetryOfExistingEntry = Boolean(asRows(existingRequestRows)[0]?.id);

    const storedTargetPrice = isOpeningAction(input.action)
      ? archivePriceForAction(input.action, input.price)
      : archivedTargetPrice(input.action, input.targetPrice);

    if (!isOpeningAction(input.action) && !isRetryOfExistingEntry) {
      if (!storedTargetPrice) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "平仓记录必须指定对应的开仓价格档位" });
      }
      const [positionRows] = await tx.execute(
        `SELECT action, quantity, price, target_price, related_user_id
           FROM ledger52_t0_journal_entries
          WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
          ORDER BY trade_time ASC, id ASC FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountId, input.symbol],
      );
      const availableCents = calculateAvailableCloseCents(asRows(positionRows), input.action, String(storedTargetPrice), relatedUserId);
      const requestedCents = quantityToCents(normalizedQuantity);
      if (requestedCents <= 0 || requestedCents > availableCents) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: availableCents > 0
            ? `该价格档位最多可平 ${(availableCents / 100).toFixed(2)} ETH`
            : "该价格档位已无可平数量",
        });
      }
    }

    const [entryResult] = await tx.execute(
      `INSERT INTO ledger52_t0_journal_entries
        (ledger_id, user_id, account_id, related_user_id, symbol, action, quantity, price, fee_usdt, target_price, note, client_request_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ROUND(CAST(? AS DECIMAL(36,18)) * CAST(? AS DECIMAL(36,18)) * ${OKX_VIP2_TAKER_FEE_RATE}, 18), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        accountId,
        relatedUserId,
        input.symbol,
        input.action,
        normalizedQuantity,
        input.price,
        normalizedQuantity,
        input.price,
        storedTargetPrice || null,
        input.note || null,
        input.clientRequestId,
        input.actorUserId,
      ],
    );
    const entryId = Number((entryResult as any).insertId || 0);
    if (!entryId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "速记流水保存失败" });

    const [accountRows, entryRows] = await Promise.all([
      tx.execute(
        `SELECT id, name, last_used_at, created_at
           FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`,
        [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      ),
      tx.execute(
        `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id,
                COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
                u.username AS related_username, u.avatar AS related_user_avatar,
                e.symbol, e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
           FROM ledger52_t0_journal_entries e
           INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
           LEFT JOIN users u ON u.id = e.related_user_id
          WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ? LIMIT 1`,
        [entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      ),
    ]);
    const account = asRows(accountRows)[0];
    const entry = asRows(entryRows)[0];
    if (!account || !entry) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "速记流水读取失败" });

    await tx.commit();
    return { account: mapAccount(account), entry: mapEntry(entry) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

async function lockEditableOpeningEntry(tx: any, actorUserId: number, entryId: number) {
  const [rows] = await tx.execute(
    `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.symbol, e.action,
            e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.client_request_id,
            e.created_by_user_id, e.trade_time, e.created_at, e.updated_at
       FROM ledger52_t0_journal_entries e
       INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
      WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ?
      LIMIT 1 FOR UPDATE`,
    [entryId, LEDGER_52_T0_JOURNAL_ID, actorUserId],
  );
  const entry = asRows(rows)[0];
  if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "开仓记录不存在或无权操作" });
  if (!isOpeningAction(String(entry.action) as T0JournalAction)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "当前仅支持编辑或删除开仓记录" });
  }

  const entryAction = String(entry.action) as T0JournalAction;
  const closeAction = actionSide(entryAction) === "long" ? "closeLong" : "closeShort";
  const archivePrice = archivePriceForAction(entryAction, entry.price);
  const legacyStoredTargetPrice = toNumber(entry.target_price);
  const legacyActualPrice = toNumber(entry.price);
  const [dependentRows] = await tx.execute(
    `SELECT id
       FROM ledger52_t0_journal_entries
      WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
        AND action = ? AND target_price IN (?, ?, ?)
      LIMIT 1 FOR UPDATE`,
    [
      LEDGER_52_T0_JOURNAL_ID,
      actorUserId,
      Number(entry.account_id),
      String(entry.symbol),
      closeAction,
      archivePrice,
      legacyStoredTargetPrice || legacyActualPrice,
      legacyActualPrice,
    ],
  );
  if (asRows(dependentRows)[0]) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "该开仓价格档位已有平仓记录，请先处理对应平仓流水" });
  }
  return entry;
}

async function writeEntryAudit(tx: any, input: {
  actorUserId: number;
  entryId: number;
  operation: "update" | "delete" | "revert" | "restore";
  before: unknown;
  after?: unknown;
}) {
  const [result] = await tx.execute(
    `INSERT INTO ledger52_t0_journal_entry_audits
      (ledger_id, user_id, entry_id, operation, before_snapshot, after_snapshot, operator_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      LEDGER_52_T0_JOURNAL_ID,
      input.actorUserId,
      input.entryId,
      input.operation,
      JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.actorUserId,
    ],
  );
  return Number((result as any)?.insertId || 0);
}

export async function updateLedger52T0JournalOpeningEntry(input: {
  actorUserId: number;
  entryId: number;
  relatedUserId: number;
  quantity: string;
  price: string;
  note?: string;
}) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const normalizedQuantity = normalizeEthQuantity(input.quantity);

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const before = await lockEditableOpeningEntry(tx, input.actorUserId, input.entryId);
    const relatedUserId = Number(input.relatedUserId || 0);
    if (!Number.isInteger(relatedUserId) || relatedUserId <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请选择关联用户" });
    }
    const [relatedUserRows] = await tx.execute(
      `SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
      [relatedUserId],
    );
    if (!asRows(relatedUserRows)[0]) {
      throw new TRPCError({ code: "NOT_FOUND", message: "关联用户不存在或已失效，请重新选择" });
    }
    const archivePrice = archivePriceForAction(String(before.action) as T0JournalAction, input.price);
    await tx.execute(
      `UPDATE ledger52_t0_journal_entries
          SET quantity = ?, price = ?, target_price = ?, related_user_id = ?,
              fee_usdt = ROUND(CAST(? AS DECIMAL(36,18)) * CAST(? AS DECIMAL(36,18)) * ${OKX_VIP2_TAKER_FEE_RATE}, 18),
              note = ?, updated_at = NOW(3)
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [
        normalizedQuantity,
        input.price,
        archivePrice,
        relatedUserId,
        normalizedQuantity,
        input.price,
        input.note || null,
        input.entryId,
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
      ],
    );
    const [updatedRows] = await tx.execute(
      `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
              u.username AS related_username, u.avatar AS related_user_avatar,
              e.symbol, e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
         LEFT JOIN users u ON u.id = e.related_user_id
        WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ? LIMIT 1`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const after = asRows(updatedRows)[0];
    if (!after) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "编辑后的开仓记录读取失败" });
    await writeEntryAudit(tx, { actorUserId: input.actorUserId, entryId: input.entryId, operation: "update", before, after });
    await tx.commit();
    return { entry: mapEntry(after) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

export async function deleteLedger52T0JournalOpeningEntry(input: { actorUserId: number; entryId: number }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const before = await lockEditableOpeningEntry(tx, input.actorUserId, input.entryId);
    const auditId = await writeEntryAudit(tx, { actorUserId: input.actorUserId, entryId: input.entryId, operation: "delete", before });
    const [result] = await tx.execute(
      `DELETE FROM ledger52_t0_journal_entries
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (Number((result as any)?.affectedRows || 0) !== 1) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "开仓记录删除失败" });
    }
    await tx.commit();
    return { entryId: String(input.entryId), auditId: String(auditId), entry: mapEntry(before) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

/**
 * 从“最近速记”回撤一笔流水。开仓若已有关联平仓，必须先回撤对应平仓，防止仓位账不平。
 * 所有回撤只删活动流水，不抹掉审计快照，后续可由恢复接口原样恢复。
 */
export async function revertLedger52T0JournalEntry(input: { actorUserId: number; entryId: number }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [rows] = await tx.execute(
      `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.symbol, e.action,
              e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.client_request_id,
              e.created_by_user_id, e.trade_time, e.created_at, e.updated_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
        WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ?
        LIMIT 1 FOR UPDATE`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    let before = asRows(rows)[0];
    if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "该速记流水不存在或无权回撤" });

    const action = String(before.action) as T0JournalAction;
    if (isOpeningAction(action)) {
      // 复用开仓依赖校验，防止回撤开仓后遗留无法匹配的平仓流水。
      before = await lockEditableOpeningEntry(tx, input.actorUserId, input.entryId);
    }

    const auditId = await writeEntryAudit(tx, { actorUserId: input.actorUserId, entryId: input.entryId, operation: "revert", before });
    const [result] = await tx.execute(
      `DELETE FROM ledger52_t0_journal_entries
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (Number((result as any)?.affectedRows || 0) !== 1) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "速记流水回撤失败" });
    }

    await tx.commit();
    return { entryId: String(input.entryId), auditId: String(auditId), entry: mapEntry(before) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

/** 将最近被删除或回撤的流水从审计快照恢复；恢复平仓前会再次校验可平数量。 */
export async function restoreLedger52T0JournalEntry(input: { actorUserId: number; auditId: number }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [auditRows] = await tx.execute(
      `SELECT id, entry_id, operation, before_snapshot
         FROM ledger52_t0_journal_entry_audits
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND operation IN ('delete', 'revert')
        LIMIT 1 FOR UPDATE`,
      [input.auditId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const audit = asRows(auditRows)[0];
    if (!audit) throw new TRPCError({ code: "NOT_FOUND", message: "可恢复的速记记录不存在或已恢复" });

    const [latestAuditRows] = await tx.execute(
      `SELECT id, operation
         FROM ledger52_t0_journal_entry_audits
        WHERE ledger_id = ? AND user_id = ? AND entry_id = ?
        ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, Number(audit.entry_id)],
    );
    const latestAudit = asRows(latestAuditRows)[0];
    if (!latestAudit || Number(latestAudit.id) !== Number(audit.id)) {
      throw new TRPCError({ code: "CONFLICT", message: "该流水状态已有更新，请刷新后再操作" });
    }

    let snapshot: any;
    try { snapshot = JSON.parse(String(audit.before_snapshot || "")); } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该历史审计快照无法恢复" });
    }
    const entryId = Number(snapshot?.id || 0);
    const accountId = Number(snapshot?.account_id || 0);
    const action = String(snapshot?.action || "") as T0JournalAction;
    const quantity = normalizeEthQuantity(String(snapshot?.quantity ?? ""));
    const price = String(snapshot?.price ?? "");
    const relatedUserId = toNumber(snapshot?.related_user_id ?? snapshot?.relatedUserId);
    const clientRequestId = String(snapshot?.client_request_id || "");
    if (!entryId || !accountId || !T0_JOURNAL_ACTIONS.has(action) || !clientRequestId || !ETH_QUANTITY_RESTORE_PATTERN.test(quantity) || toNumber(price) <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该历史审计快照不完整，无法安全恢复" });
    }

    const [existingRows] = await tx.execute(
      `SELECT id FROM ledger52_t0_journal_entries
        WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (asRows(existingRows)[0]) throw new TRPCError({ code: "CONFLICT", message: "该速记流水已存在，无需重复恢复" });

    const [accountRows] = await tx.execute(
      `SELECT id FROM ledger52_t0_journal_accounts
        WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (!asRows(accountRows)[0]) throw new TRPCError({ code: "NOT_FOUND", message: "原下单账户已不存在，无法恢复" });

    if (!isOpeningAction(action)) {
      const targetPrice = archivedTargetPrice(action, snapshot.target_price);
      if (!targetPrice) throw new TRPCError({ code: "BAD_REQUEST", message: "历史平仓记录缺少对应开仓档位，无法恢复" });
      if (relatedUserId <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "历史平仓记录缺少关联用户，无法安全恢复" });
      }
      const [positionRows] = await tx.execute(
        `SELECT action, quantity, price, target_price, related_user_id
           FROM ledger52_t0_journal_entries
          WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
          ORDER BY trade_time ASC, id ASC FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountId, String(snapshot.symbol || "ETH")],
      );
      const availableCents = calculateAvailableCloseCents(asRows(positionRows), action, String(targetPrice), relatedUserId);
      if (quantityToCents(quantity) > availableCents) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "恢复后会超过该档位可平数量，请先恢复对应开仓流水" });
      }
    }

    await tx.execute(
      `INSERT INTO ledger52_t0_journal_entries
        (id, ledger_id, user_id, account_id, related_user_id, symbol, action, quantity, price, fee_usdt, target_price, note, client_request_id, created_by_user_id, trade_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        entryId,
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        accountId,
        relatedUserId > 0 ? relatedUserId : null,
        String(snapshot.symbol || "ETH"),
        action,
        quantity,
        price,
        String(snapshot.fee_usdt ?? "0"),
        snapshot.target_price ?? null,
        snapshot.note ?? null,
        clientRequestId,
        Number(snapshot.created_by_user_id || input.actorUserId),
        snapshot.trade_time || snapshot.created_at || new Date().toISOString(),
        snapshot.created_at || snapshot.trade_time || new Date().toISOString(),
      ],
    );
    const [restoredRows] = await tx.execute(
      `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
              u.username AS related_username, u.avatar AS related_user_avatar,
              e.symbol, e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
         LEFT JOIN users u ON u.id = e.related_user_id
        WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ? LIMIT 1`,
      [entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const restored = asRows(restoredRows)[0];
    if (!restored) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "恢复后的速记流水读取失败" });
    await writeEntryAudit(tx, {
      actorUserId: input.actorUserId,
      entryId,
      operation: "restore",
      before: { auditId: input.auditId, snapshot },
      after: restored,
    });
    await tx.commit();
    return { entry: mapEntry(restored) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}
