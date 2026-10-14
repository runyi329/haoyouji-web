import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

export type InformationCollectionScope = "all" | "ledger" | "ledger37" | "ledger52";

export type InformationCollectionVisitInput = {
  userId: number;
  viewedAsUserId: number | null;
  sessionToken: string;
  sectionKey: "site" | "ledger" | "other";
  ledgerId: number | null;
  pageKey: string | null;
  pageLabel: string | null;
  pagePath: string | null;
  detailed: boolean;
  eventType: "page_view" | "heartbeat";
  visibleSeconds: number;
  deviceType: "mobile" | "tablet" | "desktop" | "unknown";
  osName: string;
  browserName: string;
  language: string | null;
  timezone: string | null;
  viewport: string | null;
  ipAddress: string | null;
};

type QueryScope = {
  scope: InformationCollectionScope;
  rangeStart: string;
};

const BEIJING_SQL_NOW = "CONVERT_TZ(UTC_TIMESTAMP(3), '+00:00', '+08:00')";

function padTimePart(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * MySQL DATETIME 在本项目中按北京时间墙上时间写入；转换为带 +08:00 偏移的 ISO，
 * 避免 Node 运行环境为 UTC 时被前端误显示为八小时后的时间。
 */
function toBeijingIso(value: unknown) {
  if (!value) return null;
  const raw = String(value);
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);
  if (matched) {
    const [, year, month, day, hour, minute, second, milliseconds] = matched;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${String(milliseconds || "0").padEnd(3, "0")}+08:00`;
  }
  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${padTimePart(date.getUTCMonth() + 1)}-${padTimePart(date.getUTCDate())}`
    + `T${padTimePart(date.getUTCHours())}:${padTimePart(date.getUTCMinutes())}:${padTimePart(date.getUTCSeconds())}`
    + `.${String(date.getUTCMilliseconds()).padStart(3, "0")}+08:00`;
}

/** 返回北京时间自然日的起点，今天为北京时间 00:00；7/30 天均含今天。 */
function getBeijingRangeStart(rangeDays: number) {
  const now = new Date();
  const beijingWallClock = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(
    beijingWallClock.getUTCFullYear(),
    beijingWallClock.getUTCMonth(),
    beijingWallClock.getUTCDate() - (rangeDays - 1),
    0,
    0,
    0,
    0,
  ));
  return `${start.getUTCFullYear()}-${padTimePart(start.getUTCMonth() + 1)}-${padTimePart(start.getUTCDate())} 00:00:00.000`;
}

function asRows(result: unknown): any[] {
  if (Array.isArray((result as any)?.[0])) return (result as any)[0];
  return Array.isArray(result) ? result : [];
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

/**
 * 本地热预览连接真实数据库时，不写入访问行为数据，避免调试动作混入正式统计。
 * 正式部署会自动开启；如确有本地联调需要，必须显式设置开关。
 */
export function isInformationCollectionCaptureEnabled() {
  return process.env.NODE_ENV === "production" || process.env.ENABLE_INFORMATION_COLLECTION_DEV === "true";
}

async function ensureInformationCollectionTables(conn: any) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS site_information_collection_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      viewed_as_user_id INT NULL,
      session_token VARCHAR(96) NOT NULL,
      device_type ENUM('mobile', 'tablet', 'desktop', 'unknown') NOT NULL DEFAULT 'unknown',
      os_name VARCHAR(40) NOT NULL DEFAULT '未知系统',
      browser_name VARCHAR(48) NOT NULL DEFAULT '未知浏览器',
      language VARCHAR(24) NULL,
      timezone VARCHAR(64) NULL,
      viewport VARCHAR(32) NULL,
      ip_address VARCHAR(45) NULL,
      started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      visible_seconds INT UNSIGNED NOT NULL DEFAULT 0,
      page_view_count INT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_info_collection_user_session (user_id, session_token),
      KEY idx_info_collection_session_last_seen (last_seen_at),
      KEY idx_info_collection_session_user_last_seen (user_id, last_seen_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS site_information_collection_visits (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      session_id BIGINT UNSIGNED NOT NULL,
      user_id INT NOT NULL,
      section_key ENUM('site', 'ledger', 'other') NOT NULL DEFAULT 'site',
      ledger_id INT NULL,
      page_key VARCHAR(96) NOT NULL,
      page_label VARCHAR(100) NOT NULL,
      page_path VARCHAR(180) NULL,
      first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      visible_seconds INT UNSIGNED NOT NULL DEFAULT 0,
      page_view_count INT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_info_collection_session_page (session_id, page_key),
      KEY idx_info_collection_visit_scope_time (section_key, ledger_id, last_seen_at),
      KEY idx_info_collection_visit_user_time (user_id, last_seen_at),
      CONSTRAINT fk_info_collection_visit_session
        FOREIGN KEY (session_id) REFERENCES site_information_collection_sessions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function resolveClientIp(req: any) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstForwarded = String(forwardedValue || "").split(",")[0]?.trim();
  const candidate = firstForwarded || req?.ip || req?.socket?.remoteAddress || "";
  return candidate ? String(candidate).slice(0, 45) : null;
}

function scopeCondition(scope: InformationCollectionScope) {
  if (scope === "ledger") return { sql: "v.section_key = 'ledger'", params: [] as unknown[] };
  if (scope === "ledger37") return { sql: "v.ledger_id = 37", params: [] as unknown[] };
  if (scope === "ledger52") return { sql: "v.ledger_id = 52", params: [] as unknown[] };
  return { sql: "1 = 1", params: [] as unknown[] };
}

function createEmptyDashboard(capturing: boolean, rangeDays: number, scope: InformationCollectionScope) {
  return {
    capturing,
    rangeDays,
    scope,
    overview: {
      site: { key: "site", label: "脉动网", users: 0, sessions: 0, visibleSeconds: 0, lastSeenAt: null as string | null },
      ledger: { key: "ledger", label: "账本中心", users: 0, visits: 0, visibleSeconds: 0, lastSeenAt: null as string | null },
      ledger37: { key: "ledger37", label: "37号账本", users: 0, visits: 0, visibleSeconds: 0, lastSeenAt: null as string | null },
      ledger52: { key: "ledger52", label: "52号账本", users: 0, visits: 0, visibleSeconds: 0, lastSeenAt: null as string | null },
    },
    pages: [] as Array<{
      key: string;
      label: string;
      section: string;
      ledgerId: number | null;
      users: number;
      views: number;
      visibleSeconds: number;
      lastSeenAt: string | null;
      viewers: Array<{ userId: number; name: string; username: string; views: number; lastSeenAt: string | null }>;
    }>,
    users: [] as Array<{ userId: number; name: string; username: string; views: number; visibleSeconds: number; lastSeenAt: string | null; device: string; ipAddress: string | null }>,
    userActivities: [] as Array<{ key: string; action: string; pageLabel: string; views: number; visibleSeconds: number; lastSeenAt: string | null }>,
    modules: [
      { key: "ledger37", label: "37号账本", state: "capturing" as const, note: "概览、保证金、利息与设置等页面已纳入" },
      { key: "ledger52", label: "52号账本", state: "capturing" as const, note: "账本入口、T+0 速记账本等页面已纳入" },
      { key: "commerce", label: "商城", state: "planned" as const, note: "暂未纳入采集，保留占位" },
      { key: "other", label: "其他功能", state: "planned" as const, note: "后续按重要性逐项启用" },
    ],
  };
}

export async function recordInformationCollectionVisit(input: Omit<InformationCollectionVisitInput, "ipAddress"> & { req: any }) {
  if (!isInformationCollectionCaptureEnabled()) return { capturing: false };
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "信息采集数据库连接失败" });
  await ensureInformationCollectionTables(conn);

  const visibleSeconds = Math.max(0, Math.min(3600, Math.floor(input.visibleSeconds || 0)));
  const pageViewIncrement = input.eventType === "page_view" ? 1 : 0;
  const ipAddress = resolveClientIp(input.req);

  await conn.execute(
    `INSERT INTO site_information_collection_sessions
       (user_id, viewed_as_user_id, session_token, device_type, os_name, browser_name, language, timezone, viewport, ip_address, started_at, last_seen_at, created_at, updated_at, visible_seconds, page_view_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${BEIJING_SQL_NOW}, ${BEIJING_SQL_NOW}, ${BEIJING_SQL_NOW}, ${BEIJING_SQL_NOW}, ?, ?)
     ON DUPLICATE KEY UPDATE
       viewed_as_user_id = VALUES(viewed_as_user_id),
       device_type = VALUES(device_type),
       os_name = VALUES(os_name),
       browser_name = VALUES(browser_name),
       language = VALUES(language),
       timezone = VALUES(timezone),
       viewport = VALUES(viewport),
       ip_address = VALUES(ip_address),
       last_seen_at = ${BEIJING_SQL_NOW},
       updated_at = ${BEIJING_SQL_NOW},
       visible_seconds = visible_seconds + VALUES(visible_seconds),
       page_view_count = page_view_count + VALUES(page_view_count)`,
    [
      input.userId,
      input.viewedAsUserId,
      input.sessionToken,
      input.deviceType,
      input.osName,
      input.browserName,
      input.language,
      input.timezone,
      input.viewport,
      ipAddress,
      visibleSeconds,
      pageViewIncrement,
    ],
  );

  if (!input.detailed || !input.pageKey || !input.pageLabel) return { capturing: true };

  const [sessionRows] = await conn.execute(
    `SELECT id FROM site_information_collection_sessions WHERE user_id = ? AND session_token = ? LIMIT 1`,
    [input.userId, input.sessionToken],
  ) as any[];
  const sessionId = Number(asRows(sessionRows)[0]?.id || 0);
  if (!sessionId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "访问会话保存失败" });

  await conn.execute(
    `INSERT INTO site_information_collection_visits
       (session_id, user_id, section_key, ledger_id, page_key, page_label, page_path, first_seen_at, last_seen_at, created_at, updated_at, visible_seconds, page_view_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ${BEIJING_SQL_NOW}, ${BEIJING_SQL_NOW}, ${BEIJING_SQL_NOW}, ${BEIJING_SQL_NOW}, ?, ?)
     ON DUPLICATE KEY UPDATE
       page_label = VALUES(page_label),
       page_path = VALUES(page_path),
       last_seen_at = ${BEIJING_SQL_NOW},
       updated_at = ${BEIJING_SQL_NOW},
       visible_seconds = visible_seconds + VALUES(visible_seconds),
       page_view_count = page_view_count + VALUES(page_view_count)`,
    [
      sessionId,
      input.userId,
      input.sectionKey,
      input.ledgerId,
      input.pageKey,
      input.pageLabel,
      input.pagePath,
      visibleSeconds,
      pageViewIncrement,
    ],
  );

  return { capturing: true };
}

async function aggregateSessions(conn: any, rangeStart: string) {
  const [result] = await conn.execute(
    `SELECT COUNT(DISTINCT user_id) AS users,
            COUNT(*) AS sessions,
            COALESCE(SUM(visible_seconds), 0) AS visible_seconds,
            MAX(last_seen_at) AS last_seen_at
       FROM site_information_collection_sessions
      WHERE last_seen_at >= ?`,
    [rangeStart],
  ) as any[];
  const row = asRows(result)[0] ?? {};
  return {
    users: toNumber(row.users),
    sessions: toNumber(row.sessions),
    visibleSeconds: toNumber(row.visible_seconds),
    lastSeenAt: toBeijingIso(row.last_seen_at),
  };
}

async function aggregateVisits(conn: any, rangeStart: string, conditionSql: string) {
  const [result] = await conn.execute(
    `SELECT COUNT(DISTINCT v.user_id) AS users,
            COALESCE(SUM(v.page_view_count), 0) AS visits,
            COALESCE(SUM(v.visible_seconds), 0) AS visible_seconds,
            MAX(v.last_seen_at) AS last_seen_at
       FROM site_information_collection_visits v
      WHERE v.last_seen_at >= ? AND ${conditionSql}`,
    [rangeStart],
  ) as any[];
  const row = asRows(result)[0] ?? {};
  return {
    users: toNumber(row.users),
    visits: toNumber(row.visits),
    visibleSeconds: toNumber(row.visible_seconds),
    lastSeenAt: toBeijingIso(row.last_seen_at),
  };
}

export async function getInformationCollectionDashboard(input: {
  rangeDays: number;
  scope: InformationCollectionScope;
  selectedUserId?: number | null;
}) {
  const rangeDays = Math.max(1, Math.min(90, Math.floor(input.rangeDays || 7)));
  const selectedUserId = Number.isInteger(input.selectedUserId) && Number(input.selectedUserId) > 0
    ? Number(input.selectedUserId)
    : null;
  const empty = createEmptyDashboard(isInformationCollectionCaptureEnabled(), rangeDays, input.scope);
  if (!isInformationCollectionCaptureEnabled()) return empty;

  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "信息采集数据库连接失败" });
  await ensureInformationCollectionTables(conn);

  const rangeStart = getBeijingRangeStart(rangeDays);
  const selection: QueryScope = { scope: input.scope, rangeStart };
  const scope = scopeCondition(selection.scope);

  const [site, ledger, ledger37, ledger52] = await Promise.all([
    aggregateSessions(conn, selection.rangeStart),
    aggregateVisits(conn, selection.rangeStart, "v.section_key = 'ledger'"),
    aggregateVisits(conn, selection.rangeStart, "v.ledger_id = 37"),
    aggregateVisits(conn, selection.rangeStart, "v.ledger_id = 52"),
  ]);

  const [pageRows] = await conn.execute(
    `SELECT v.page_key, v.page_label, v.section_key, v.ledger_id,
            COUNT(DISTINCT v.user_id) AS users,
            COALESCE(SUM(v.page_view_count), 0) AS views,
            COALESCE(SUM(v.visible_seconds), 0) AS visible_seconds,
            MAX(v.last_seen_at) AS last_seen_at
       FROM site_information_collection_visits v
      WHERE v.last_seen_at >= ? AND ${scope.sql}
      GROUP BY v.page_key, v.page_label, v.section_key, v.ledger_id
      ORDER BY users DESC, views DESC, last_seen_at DESC
      LIMIT 30`,
    [selection.rangeStart, ...scope.params],
  ) as any[];

  const [pageViewerRows] = await conn.execute(
    `SELECT v.page_key, v.section_key, v.ledger_id, v.user_id,
            COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', v.user_id)) AS name,
            u.username,
            COALESCE(SUM(v.page_view_count), 0) AS views,
            MAX(v.last_seen_at) AS last_seen_at
       FROM site_information_collection_visits v
       LEFT JOIN users u ON u.id = v.user_id
      WHERE v.last_seen_at >= ? AND ${scope.sql}
      GROUP BY v.page_key, v.section_key, v.ledger_id, v.user_id, u.name, u.username
      ORDER BY last_seen_at DESC, views DESC`,
    [selection.rangeStart, ...scope.params],
  ) as any[];

  const [userRows] = await conn.execute(
    `SELECT v.user_id,
            COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', v.user_id)) AS name,
            u.username,
            COALESCE(SUM(v.page_view_count), 0) AS views,
            COALESCE(SUM(v.visible_seconds), 0) AS visible_seconds,
            MAX(v.last_seen_at) AS last_seen_at,
            SUBSTRING_INDEX(GROUP_CONCAT(CONCAT(s.device_type, '·', s.os_name, '·', s.browser_name) ORDER BY s.last_seen_at DESC SEPARATOR '||'), '||', 1) AS device,
            SUBSTRING_INDEX(GROUP_CONCAT(s.ip_address ORDER BY s.last_seen_at DESC SEPARATOR '||'), '||', 1) AS ip_address
       FROM site_information_collection_visits v
       LEFT JOIN users u ON u.id = v.user_id
       LEFT JOIN site_information_collection_sessions s ON s.id = v.session_id
      WHERE v.last_seen_at >= ? AND ${scope.sql}
      GROUP BY v.user_id, u.name, u.username
      ORDER BY last_seen_at DESC, views DESC
      LIMIT 50`,
    [selection.rangeStart, ...scope.params],
  ) as any[];

  let userActivityRows: any[] = [];
  if (selectedUserId) {
    const [result] = await conn.execute(
      `SELECT v.page_key, v.page_label,
              COALESCE(SUM(v.page_view_count), 0) AS views,
              COALESCE(SUM(v.visible_seconds), 0) AS visible_seconds,
              MAX(v.last_seen_at) AS last_seen_at
         FROM site_information_collection_visits v
        WHERE v.user_id = ? AND v.last_seen_at >= ? AND ${scope.sql}
        GROUP BY v.page_key, v.page_label
        ORDER BY last_seen_at DESC, views DESC
        LIMIT 100`,
      [selectedUserId, selection.rangeStart, ...scope.params],
    ) as any[];
    userActivityRows = asRows(result);
  }

  const viewersByPageKey = new Map<string, Array<{
    userId: number;
    name: string;
    username: string;
    views: number;
    lastSeenAt: string | null;
  }>>();
  for (const row of asRows(pageViewerRows)) {
    const pageKey = String(row.page_key || "");
    const viewers = viewersByPageKey.get(pageKey) || [];
    viewers.push({
      userId: toNumber(row.user_id),
      name: String(row.name || "未命名用户"),
      username: String(row.username || ""),
      views: toNumber(row.views),
      lastSeenAt: toBeijingIso(row.last_seen_at),
    });
    viewersByPageKey.set(pageKey, viewers);
  }

  return {
    ...empty,
    overview: {
      site: { key: "site", label: "脉动网", ...site },
      ledger: { key: "ledger", label: "账本中心", ...ledger },
      ledger37: { key: "ledger37", label: "37号账本", ...ledger37 },
      ledger52: { key: "ledger52", label: "52号账本", ...ledger52 },
    },
    pages: asRows(pageRows).map((row) => ({
      key: String(row.page_key || ""),
      label: String(row.page_label || "未命名页面"),
      section: String(row.section_key || "site"),
      ledgerId: row.ledger_id === null || row.ledger_id === undefined ? null : toNumber(row.ledger_id),
      users: toNumber(row.users),
      views: toNumber(row.views),
      visibleSeconds: toNumber(row.visible_seconds),
      lastSeenAt: toBeijingIso(row.last_seen_at),
      viewers: viewersByPageKey.get(String(row.page_key || "")) || [],
    })),
    users: asRows(userRows).map((row) => ({
      userId: toNumber(row.user_id),
      name: String(row.name || "未命名用户"),
      username: String(row.username || ""),
      views: toNumber(row.views),
      visibleSeconds: toNumber(row.visible_seconds),
      lastSeenAt: toBeijingIso(row.last_seen_at),
      device: String(row.device || "未知设备"),
      ipAddress: row.ip_address ? String(row.ip_address) : null,
    })),
    userActivities: userActivityRows.map((row) => ({
      key: String(row.page_key || ""),
      action: "查看页面",
      pageLabel: String(row.page_label || "未命名页面"),
      views: toNumber(row.views),
      visibleSeconds: toNumber(row.visible_seconds),
      lastSeenAt: toBeijingIso(row.last_seen_at),
    })),
  };
}
