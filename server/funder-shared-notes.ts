import { createHash } from "crypto";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

type SqlConnection = {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
};

type LegacyNote = {
  id?: string;
  text: string;
  time?: string;
  userId?: number;
  userName?: string;
  userAvatar?: string;
  version?: number;
};

type StoredNote = {
  id: string;
  ledger_id: number;
  order_id: number;
  scope_user_id: number;
  body: string;
  created_by_user_id: number | null;
  created_by_name_snapshot: string | null;
  created_by_avatar_snapshot: string | null;
  source_note_time: string | null;
  created_at: unknown;
  updated_at: unknown;
  version: number;
  source: string;
  legacy_item_key: string | null;
};

type AuditContext = {
  actorUserId: number;
  effectiveUserId: number;
  viewedAsUserId: number | null;
  isViewingAs: boolean;
  actorRole: string | null;
  requestId: string;
  observedIp: string | null;
  ipSource: "unverified_request_ip" | "unavailable";
  userAgent: string | null;
  informationSessionToken: string | null;
};

export type SharedNotePayload = {
  id: string;
  text: string;
  time: string;
  userId?: number;
  userName?: string;
  userAvatar?: string;
  version: number;
};

function asRows(result: unknown): any[] {
  if (Array.isArray(result) && Array.isArray(result[0]))
    return result[0] as any[];
  if (Array.isArray(result)) return result as any[];
  return [];
}

function safeHeader(value: string | string[] | undefined): string | null {
  const normalized = Array.isArray(value) ? value[0] : value;
  const trimmed = String(normalized || "").trim();
  return trimmed ? trimmed : null;
}

function readAuditContext(ctx: TrpcContext): AuditContext {
  const realActor = ctx.realUser ?? ctx.user;
  const effectiveUser = ctx.user ?? realActor;
  if (!realActor || !effectiveUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "登录状态失效" });
  }
  const request = ctx.req as any;
  const observed = String(
    request?.ip || request?.socket?.remoteAddress || ""
  ).trim();
  const informationSessionToken = safeHeader(
    request?.headers?.["x-information-collection-session"]
  );
  return {
    actorUserId: Number(realActor.id),
    effectiveUserId: Number(effectiveUser.id),
    viewedAsUserId: ctx.isViewingAs ? Number(effectiveUser.id) : null,
    isViewingAs: Boolean(ctx.isViewingAs),
    actorRole: realActor.role ? String(realActor.role) : null,
    requestId: nanoid(20),
    // 当前生产代理链尚未完成可信 XFF 约束，所以只保留“观察到的请求地址”，不能当作已验证公网 IP。
    observedIp: observed ? observed.slice(0, 64) : null,
    ipSource: observed ? "unverified_request_ip" : "unavailable",
    userAgent:
      safeHeader(request?.headers?.["user-agent"])?.slice(0, 1024) || null,
    informationSessionToken: informationSessionToken?.slice(0, 96) || null,
  };
}

function parseLegacyNotes(raw: unknown): LegacyNote[] {
  if (raw === null || raw === undefined || raw === "") return [];
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === "object" && !Array.isArray(item)
        )
        .map(item => ({
          id: typeof item.id === "string" ? item.id : undefined,
          text: String(item.text ?? "").trim(),
          time: typeof item.time === "string" ? item.time : "",
          userId:
            Number.isFinite(Number(item.userId)) && Number(item.userId) > 0
              ? Number(item.userId)
              : undefined,
          userName:
            typeof item.userName === "string"
              ? item.userName.slice(0, 120)
              : undefined,
          userAvatar:
            typeof item.userAvatar === "string"
              ? item.userAvatar.slice(0, 2048)
              : undefined,
          version: Number.isInteger(Number(item.version))
            ? Number(item.version)
            : undefined,
        }))
        .filter(item => Boolean(item.text));
    }
  } catch {
    // 历史纯文本备注作为一条不可丢失的旧记录导入。
  }
  return [{ text, time: "" }];
}

function toIso(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function legacyKey(
  ledgerId: number,
  orderId: number,
  scopeUserId: number,
  note: LegacyNote,
  index: number
): string {
  const identity = JSON.stringify({
    ledgerId,
    orderId,
    scopeUserId,
    index,
    text: note.text,
    time: note.time || "",
    userId: note.userId || null,
    userName: note.userName || "",
  });
  return createHash("sha256").update(identity).digest("hex");
}

function getDeviceSummaryFromUserAgent(
  userAgent: string | null
): string | null {
  if (!userAgent) return null;
  const lower = userAgent.toLowerCase();
  const device =
    /ipad|tablet/.test(lower) ||
    (/android/.test(lower) && !/mobile/.test(lower))
      ? "平板"
      : /mobile|iphone|ipod|android/.test(lower)
        ? "手机"
        : "电脑";
  const os = /iphone|ipad|ipod/.test(lower)
    ? "iOS"
    : /android/.test(lower)
      ? "Android"
      : /windows/.test(lower)
        ? "Windows"
        : /mac os|macintosh/.test(lower)
          ? "macOS"
          : /linux/.test(lower)
            ? "Linux"
            : "未知系统";
  const browser = /micromessenger/.test(lower)
    ? "微信内置浏览器"
    : /edg\//.test(lower)
      ? "Edge"
      : /firefox\//.test(lower)
        ? "Firefox"
        : /chrome\//.test(lower) && !/edg\//.test(lower)
          ? "Chrome"
          : /safari\//.test(lower) && !/chrome\//.test(lower)
            ? "Safari"
            : "未知浏览器";
  return `${device} · ${os} · ${browser}`;
}

export async function ensureFunderSharedNoteTables(conn: SqlConnection) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ledger_order_shared_notes (
      id VARCHAR(32) NOT NULL PRIMARY KEY,
      ledger_id INT NOT NULL,
      order_id INT NOT NULL,
      scope_user_id INT NOT NULL DEFAULT 0 COMMENT '0=主订单；非0=参与者独立视图',
      body TEXT NOT NULL,
      created_by_user_id INT NULL,
      created_by_name_snapshot VARCHAR(120) NULL,
      created_by_avatar_snapshot TEXT NULL,
      source_note_time VARCHAR(64) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_by_user_id INT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      version INT UNSIGNED NOT NULL DEFAULT 1,
      deleted_at DATETIME(3) NULL,
      deleted_by_user_id INT NULL,
      source VARCHAR(24) NOT NULL DEFAULT 'app',
      legacy_item_key CHAR(64) NULL,
      UNIQUE KEY uq_funder_shared_note_legacy (legacy_item_key),
      KEY idx_funder_shared_note_scope (ledger_id, order_id, scope_user_id, deleted_at, created_at),
      KEY idx_funder_shared_note_author (created_by_user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ledger_order_shared_note_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      note_id VARCHAR(32) NOT NULL,
      ledger_id INT NOT NULL,
      order_id INT NOT NULL,
      scope_user_id INT NOT NULL DEFAULT 0,
      action VARCHAR(24) NOT NULL,
      before_body TEXT NULL,
      after_body TEXT NULL,
      actor_user_id INT NOT NULL COMMENT '真实登录操作人',
      effective_user_id INT NOT NULL COMMENT '当前生效/代入身份',
      viewed_as_user_id INT NULL,
      is_viewing_as TINYINT(1) NOT NULL DEFAULT 0,
      actor_role VARCHAR(32) NULL,
      request_id VARCHAR(32) NOT NULL,
      information_session_id BIGINT UNSIGNED NULL,
      device_summary VARCHAR(255) NULL,
      user_agent VARCHAR(1024) NULL,
      observed_ip VARCHAR(64) NULL,
      ip_source VARCHAR(32) NOT NULL DEFAULT 'unavailable',
      occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_funder_shared_note_event_scope (ledger_id, order_id, scope_user_id, occurred_at),
      KEY idx_funder_shared_note_event_note (note_id, occurred_at),
      KEY idx_funder_shared_note_event_actor (actor_user_id, occurred_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ledger_order_shared_note_migrations (
      ledger_id INT NOT NULL,
      order_id INT NOT NULL,
      scope_user_id INT NOT NULL DEFAULT 0,
      migrated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      legacy_checksum CHAR(64) NOT NULL,
      PRIMARY KEY (ledger_id, order_id, scope_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function getInformationSession(conn: SqlConnection, audit: AuditContext) {
  if (!audit.informationSessionToken) {
    return {
      informationSessionId: null as number | null,
      deviceSummary: getDeviceSummaryFromUserAgent(audit.userAgent),
    };
  }
  try {
    const result = await conn.execute(
      `SELECT id, device_type, os_name, browser_name
         FROM site_information_collection_sessions
        WHERE user_id = ? AND session_token = ?
        LIMIT 1`,
      [audit.actorUserId, audit.informationSessionToken]
    );
    const session = asRows(result)[0];
    if (!session) {
      return {
        informationSessionId: null as number | null,
        deviceSummary: getDeviceSummaryFromUserAgent(audit.userAgent),
      };
    }
    const parts = [session.device_type, session.os_name, session.browser_name]
      .map(value => String(value || "").trim())
      .filter(Boolean);
    return {
      informationSessionId: Number(session.id),
      deviceSummary: parts.length
        ? parts.join(" · ").slice(0, 255)
        : getDeviceSummaryFromUserAgent(audit.userAgent),
    };
  } catch {
    return {
      informationSessionId: null as number | null,
      deviceSummary: getDeviceSummaryFromUserAgent(audit.userAgent),
    };
  }
}

async function appendEvent(
  conn: SqlConnection,
  args: {
    noteId: string;
    ledgerId: number;
    orderId: number;
    scopeUserId: number;
    action: "legacy_import" | "create" | "update" | "soft_delete";
    beforeBody: string | null;
    afterBody: string | null;
    audit: AuditContext;
    informationSessionId: number | null;
    deviceSummary: string | null;
  }
) {
  await conn.execute(
    `INSERT INTO ledger_order_shared_note_events
      (note_id, ledger_id, order_id, scope_user_id, action, before_body, after_body,
       actor_user_id, effective_user_id, viewed_as_user_id, is_viewing_as, actor_role,
       request_id, information_session_id, device_summary, user_agent, observed_ip, ip_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      args.noteId,
      args.ledgerId,
      args.orderId,
      args.scopeUserId,
      args.action,
      args.beforeBody,
      args.afterBody,
      args.audit.actorUserId,
      args.audit.effectiveUserId,
      args.audit.viewedAsUserId,
      args.audit.isViewingAs ? 1 : 0,
      args.audit.actorRole,
      args.audit.requestId,
      args.informationSessionId,
      args.deviceSummary,
      args.audit.userAgent,
      args.audit.observedIp,
      args.audit.ipSource,
    ]
  );
}

async function migrateLegacyScope(
  conn: SqlConnection,
  args: {
    ledgerId: number;
    orderId: number;
    scopeUserId: number;
    legacyRaw: string | null;
    audit: AuditContext;
    informationSessionId: number | null;
    deviceSummary: string | null;
  }
) {
  const markerResult = await conn.execute(
    `SELECT ledger_id FROM ledger_order_shared_note_migrations
      WHERE ledger_id = ? AND order_id = ? AND scope_user_id = ? FOR UPDATE`,
    [args.ledgerId, args.orderId, args.scopeUserId]
  );
  if (asRows(markerResult).length > 0) return;

  const notes = parseLegacyNotes(args.legacyRaw);
  const checksum = createHash("sha256")
    .update(String(args.legacyRaw || ""))
    .digest("hex");
  for (const [index, note] of notes.entries()) {
    const key = legacyKey(
      args.ledgerId,
      args.orderId,
      args.scopeUserId,
      note,
      index
    );
    const noteId = nanoid(20);
    const createdBy = note.userId ?? null;
    await conn.execute(
      `INSERT IGNORE INTO ledger_order_shared_notes
       (id, ledger_id, order_id, scope_user_id, body, created_by_user_id, created_by_name_snapshot,
        created_by_avatar_snapshot, source_note_time, updated_by_user_id, source, legacy_item_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'legacy_import', ?)`,
      [
        noteId,
        args.ledgerId,
        args.orderId,
        args.scopeUserId,
        note.text,
        createdBy,
        note.userName || null,
        note.userAvatar || null,
        note.time || null,
        createdBy,
        key,
      ]
    );
    const inserted = await conn.execute(
      `SELECT id FROM ledger_order_shared_notes WHERE legacy_item_key = ? LIMIT 1`,
      [key]
    );
    const actualId = String(asRows(inserted)[0]?.id || noteId);
    await appendEvent(conn, {
      noteId: actualId,
      ledgerId: args.ledgerId,
      orderId: args.orderId,
      scopeUserId: args.scopeUserId,
      action: "legacy_import",
      beforeBody: null,
      afterBody: note.text,
      audit: args.audit,
      informationSessionId: args.informationSessionId,
      deviceSummary: args.deviceSummary,
    });
  }
  await conn.execute(
    `INSERT INTO ledger_order_shared_note_migrations (ledger_id, order_id, scope_user_id, legacy_checksum)
      VALUES (?, ?, ?, ?)`,
    [args.ledgerId, args.orderId, args.scopeUserId, checksum]
  );
}

function serializeNotes(rows: StoredNote[]): SharedNotePayload[] {
  return rows.map(row => ({
    id: String(row.id),
    text: String(row.body),
    time: row.source_note_time || toIso(row.created_at),
    ...(row.created_by_user_id
      ? { userId: Number(row.created_by_user_id) }
      : {}),
    ...(row.created_by_name_snapshot
      ? { userName: String(row.created_by_name_snapshot) }
      : {}),
    ...(row.created_by_avatar_snapshot
      ? { userAvatar: String(row.created_by_avatar_snapshot) }
      : {}),
    version: Number(row.version || 1),
  }));
}

function hasSameLegacyIdentity(
  stored: StoredNote,
  incoming: LegacyNote
): boolean {
  if (String(stored.body) !== incoming.text) return false;
  const incomingUserId = incoming.userId || null;
  const storedUserId = stored.created_by_user_id
    ? Number(stored.created_by_user_id)
    : null;
  if (incomingUserId !== storedUserId) return false;
  const incomingTime = incoming.time || "";
  return (
    !incomingTime || incomingTime === String(stored.source_note_time || "")
  );
}

function assertCanModifyExistingNote(args: {
  row: StoredNote;
  isManager: boolean;
  effectiveUserId: number;
  isSettled: boolean;
}) {
  if (args.isManager) return;
  if (args.isSettled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "已结清订单的历史共享备注不可修改或删除，仅可追加新备注",
    });
  }
  if (Number(args.row.created_by_user_id || 0) !== args.effectiveUserId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "仅可修改或删除自己的共享备注",
    });
  }
}

export async function synchronizeFunderSharedNotes(args: {
  conn: SqlConnection;
  ctx: TrpcContext;
  ledgerId: number;
  orderId: number;
  scopeUserId?: number;
  legacyRaw: string | null;
  incomingRaw: string;
  isManager: boolean;
  isSettled: boolean;
}) {
  const scopeUserId = Number(args.scopeUserId || 0);
  const audit = readAuditContext(args.ctx);
  const { informationSessionId, deviceSummary } = await getInformationSession(
    args.conn,
    audit
  );
  await migrateLegacyScope(args.conn, {
    ledgerId: args.ledgerId,
    orderId: args.orderId,
    scopeUserId,
    legacyRaw: args.legacyRaw,
    audit,
    informationSessionId,
    deviceSummary,
  });

  const existingResult = await args.conn.execute(
    `SELECT id, ledger_id, order_id, scope_user_id, body, created_by_user_id,
            created_by_name_snapshot, created_by_avatar_snapshot, source_note_time,
            created_at, updated_at, version, source, legacy_item_key
       FROM ledger_order_shared_notes
      WHERE ledger_id = ? AND order_id = ? AND scope_user_id = ? AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC FOR UPDATE`,
    [args.ledgerId, args.orderId, scopeUserId]
  );
  const existing = asRows(existingResult) as StoredNote[];
  const incoming = parseLegacyNotes(args.incomingRaw);
  if (incoming.length > 120) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "共享备注最多保留120条",
    });
  }
  if (incoming.some(note => note.text.length > 500)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "单条共享备注不能超过500字",
    });
  }

  const byId = new Map(existing.map(note => [String(note.id), note]));
  const unmatched = new Set(existing.map(note => String(note.id)));
  const seenInputIds = new Set<string>();

  for (const note of incoming) {
    let current: StoredNote | undefined;
    const noteId = String(note.id || "").trim();
    if (noteId) {
      if (seenInputIds.has(noteId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "共享备注存在重复标识，请刷新后重试",
        });
      }
      seenInputIds.add(noteId);
      current = byId.get(noteId);
      if (!current) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "共享备注已发生变化，请刷新后再保存",
        });
      }
      if (
        note.version !== undefined &&
        Number(note.version) !== Number(current.version)
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "共享备注已被其他人修改，请刷新后再保存",
        });
      }
    } else {
      current = existing.find(
        candidate =>
          unmatched.has(String(candidate.id)) &&
          hasSameLegacyIdentity(candidate, note)
      );
    }

    if (current) {
      unmatched.delete(String(current.id));
      if (String(current.body) !== note.text) {
        assertCanModifyExistingNote({
          row: current,
          isManager: args.isManager,
          effectiveUserId: audit.effectiveUserId,
          isSettled: args.isSettled,
        });
        await args.conn.execute(
          `UPDATE ledger_order_shared_notes
              SET body = ?, updated_by_user_id = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP(3)
            WHERE id = ? AND version = ? AND deleted_at IS NULL`,
          [note.text, audit.effectiveUserId, current.id, current.version]
        );
        await appendEvent(args.conn, {
          noteId: String(current.id),
          ledgerId: args.ledgerId,
          orderId: args.orderId,
          scopeUserId,
          action: "update",
          beforeBody: String(current.body),
          afterBody: note.text,
          audit,
          informationSessionId,
          deviceSummary,
        });
      }
      continue;
    }

    const createdAt = new Date().toISOString();
    const newNoteId = nanoid(20);
    const currentUser = args.ctx.user;
    await args.conn.execute(
      `INSERT INTO ledger_order_shared_notes
       (id, ledger_id, order_id, scope_user_id, body, created_by_user_id, created_by_name_snapshot,
        created_by_avatar_snapshot, source_note_time, updated_by_user_id, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'app')`,
      [
        newNoteId,
        args.ledgerId,
        args.orderId,
        scopeUserId,
        note.text,
        audit.effectiveUserId,
        currentUser?.name ||
          currentUser?.username ||
          `用户#${audit.effectiveUserId}`,
        currentUser?.avatar || null,
        createdAt,
        audit.effectiveUserId,
      ]
    );
    await appendEvent(args.conn, {
      noteId: newNoteId,
      ledgerId: args.ledgerId,
      orderId: args.orderId,
      scopeUserId,
      action: "create",
      beforeBody: null,
      afterBody: note.text,
      audit,
      informationSessionId,
      deviceSummary,
    });
  }

  for (const noteId of unmatched) {
    const current = byId.get(noteId);
    if (!current) continue;
    assertCanModifyExistingNote({
      row: current,
      isManager: args.isManager,
      effectiveUserId: audit.effectiveUserId,
      isSettled: args.isSettled,
    });
    await args.conn.execute(
      `UPDATE ledger_order_shared_notes
          SET deleted_at = CURRENT_TIMESTAMP(3), deleted_by_user_id = ?, updated_by_user_id = ?,
              version = version + 1, updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ? AND version = ? AND deleted_at IS NULL`,
      [
        audit.effectiveUserId,
        audit.effectiveUserId,
        current.id,
        current.version,
      ]
    );
    await appendEvent(args.conn, {
      noteId: String(current.id),
      ledgerId: args.ledgerId,
      orderId: args.orderId,
      scopeUserId,
      action: "soft_delete",
      beforeBody: String(current.body),
      afterBody: null,
      audit,
      informationSessionId,
      deviceSummary,
    });
  }

  const activeResult = await args.conn.execute(
    `SELECT id, ledger_id, order_id, scope_user_id, body, created_by_user_id,
            created_by_name_snapshot, created_by_avatar_snapshot, source_note_time,
            created_at, updated_at, version, source, legacy_item_key
       FROM ledger_order_shared_notes
      WHERE ledger_id = ? AND order_id = ? AND scope_user_id = ? AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC`,
    [args.ledgerId, args.orderId, scopeUserId]
  );
  const notes = serializeNotes(asRows(activeResult) as StoredNote[]);
  return { notes, publicNote: notes.length ? JSON.stringify(notes) : "" };
}

export async function getFunderSharedNoteAuditEvents(args: {
  conn: SqlConnection;
  ledgerId: number;
  orderId: number;
  scopeUserId?: number;
  limit?: number;
}) {
  const scopeUserId = Number(args.scopeUserId || 0);
  try {
    const exists = await args.conn.execute(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'ledger_order_shared_note_events' LIMIT 1`
    );
    if (asRows(exists).length === 0) return [];
    const rows = await args.conn.execute(
      `SELECT e.id, e.note_id, e.action, e.before_body, e.after_body, e.actor_user_id,
              e.effective_user_id, e.viewed_as_user_id, e.is_viewing_as, e.device_summary,
              e.user_agent, e.observed_ip, e.ip_source, e.occurred_at,
              COALESCE(NULLIF(actor.name, ''), NULLIF(actor.username, ''), CONCAT('用户#', e.actor_user_id)) AS actor_name,
              COALESCE(NULLIF(effective.name, ''), NULLIF(effective.username, ''), CONCAT('用户#', e.effective_user_id)) AS effective_name
         FROM ledger_order_shared_note_events e
         LEFT JOIN users actor ON actor.id = e.actor_user_id
         LEFT JOIN users effective ON effective.id = e.effective_user_id
        WHERE e.ledger_id = ? AND e.order_id = ? AND e.scope_user_id = ?
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT ?`,
      [
        args.ledgerId,
        args.orderId,
        scopeUserId,
        Math.max(1, Math.min(200, Number(args.limit || 100))),
      ]
    );
    return asRows(rows).map(row => ({
      id: Number(row.id),
      noteId: String(row.note_id),
      action: String(row.action),
      beforeBody: row.before_body ?? null,
      afterBody: row.after_body ?? null,
      actorUserId: Number(row.actor_user_id),
      actorName: String(row.actor_name || `用户#${row.actor_user_id}`),
      effectiveUserId: Number(row.effective_user_id),
      effectiveName: String(
        row.effective_name || `用户#${row.effective_user_id}`
      ),
      viewedAsUserId: row.viewed_as_user_id
        ? Number(row.viewed_as_user_id)
        : null,
      isViewingAs: Boolean(row.is_viewing_as),
      deviceSummary: row.device_summary || null,
      userAgent: row.user_agent || null,
      observedIp: row.observed_ip || null,
      ipSource: String(row.ip_source || "unavailable"),
      occurredAt: row.occurred_at,
    }));
  } catch {
    return [];
  }
}
