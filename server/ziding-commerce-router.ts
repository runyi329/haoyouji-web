import { randomInt, randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDbConnection, getDbTransactionConnection } from "./db";
import { hashPassword } from "./auth";
import { resolveUserVersion } from "./version-resolver";
import {
  createZidingPaymentProofViewUrl,
  deletePrivateZidingPaymentProof,
  uploadImageToCOS,
  uploadPrivateZidingPaymentProof,
} from "./cos-upload";

export const ZIDING_PROJECT_KEY = "proj_stn4q7";
const ZIDING_OWNER_USER_ID = 4958114; // 盈盈：仅紫鼎项目负责人，不影响全站角色。
const BEIJING_TIME_ZONE = "Asia/Shanghai";

type DbConn = any;
type ProjectRole = "user" | "order_admin" | "catalog_admin" | "owner";
type MemberTier = "junior" | "senior";
type OrderStatus = "awaiting_proof" | "proof_submitted" | "proof_rejected" | "confirmed" | "shipped" | "completed" | "cancelled";

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_proof: "待上传凭证",
  proof_submitted: "待确认收款",
  proof_rejected: "凭证待补充",
  confirmed: "已确认，待发货",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消",
};

const MONEY = (value: unknown) => Number(Number(value || 0).toFixed(2));
const nowMonth = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BEIJING_TIME_ZONE, year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}`;
};
const beijingDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: BEIJING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/\//g, "-");
const orderNo = () => `ZD${beijingDate().replace(/-/g, "")}${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
const actorId = (ctx: any) => Number((ctx.realUser || ctx.user)?.id || 0);

function toError(code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "INTERNAL_SERVER_ERROR", message: string): never {
  throw new TRPCError({ code, message });
}

/** 仅为紫鼎会员开通账号生成一次性展示的六位初始密码，不在数据库或日志中保存明文。 */
function newZidingInitialPassword() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * 确认平台用户存在，并在启用紫鼎会员时授予其紫鼎版本入口。
 * 不覆盖已有版本归属，只把紫鼎加入可切换范围；新建紫鼎会员会直接以紫鼎作为默认版本。
 */
async function ensureZidingVersionAccess(conn: DbConn, userId: number, grantAccess: boolean) {
  const [rows] = await conn.execute(
    `SELECT id,version_key,version_switch_scope FROM users WHERE id=? LIMIT 1`,
    [userId],
  );
  const user = (rows as any[])[0];
  if (!user) toError("NOT_FOUND", "未找到该平台用户");
  if (!grantAccess) return;

  const scopes = String(user.version_switch_scope || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!scopes.includes(ZIDING_PROJECT_KEY)) scopes.push(ZIDING_PROJECT_KEY);
  const currentVersion = String(user.version_key || "").trim();
  await conn.execute(
    `UPDATE users SET version_key=?,version_switch_scope=? WHERE id=?`,
    [currentVersion || ZIDING_PROJECT_KEY, scopes.join(","), userId],
  );
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(String(raw)) as T; } catch { return fallback; }
}

function mapProduct(row: any, tier: MemberTier) {
  const juniorPrice = MONEY(row.price_junior);
  const seniorPrice = row.price_senior == null ? null : MONEY(row.price_senior);
  const price = tier === "senior" && seniorPrice != null ? seniorPrice : juniorPrice;
  return {
    id: Number(row.id),
    name: String(row.name),
    subtitle: String(row.subtitle || ""),
    description: String(row.description || ""),
    imageUrl: String(row.image_url || ""),
    price,
    priceJunior: juniorPrice,
    priceSenior: seniorPrice,
    originalPrice: row.original_price == null ? null : MONEY(row.original_price),
    stock: Math.max(0, Number(row.stock || 0) - Number(row.reserved_stock || 0)),
    status: Number(row.status) === 1,
    earnsPoints: Number(row.earns_points) === 1,
    sortOrder: Number(row.sort_order || 0),
  };
}

function mapOrder(row: any) {
  const status = String(row.status) as OrderStatus;
  return {
    id: Number(row.id),
    orderNo: String(row.order_no),
    status,
    statusLabel: ORDER_STATUS_LABEL[status] || status,
    totalAmount: MONEY(row.total_amount),
    pointsEligibleAmount: MONEY(row.points_eligible_amount),
    pointsMonth: row.points_month || null,
    paymentConfirmedAt: row.payment_confirmed_at || null,
    proofSubmittedAt: row.proof_submitted_at || null,
    shippedAt: row.shipped_at || null,
    completedAt: row.completed_at || null,
    autoCompleteAt: row.auto_complete_at || null,
    expireAt: row.expire_at || null,
    shippingCompany: row.shipping_company || "",
    trackingNo: row.tracking_no || "",
    adminRemark: row.admin_remark || "",
    rejectReason: row.reject_reason || "",
    createdAt: row.created_at,
    receiver: {
      name: row.receiver_name || "",
      phone: row.receiver_phone || "",
      province: row.receiver_province || "",
      city: row.receiver_city || "",
      district: row.receiver_district || "",
      detail: row.receiver_detail || "",
    },
  };
}

/** 初始化紫鼎项目独立的数据域。所有表按项目 key 隔离，绝不复用全局管理员权限。 */
async function initializeZidingCommerceTables(): Promise<DbConn | null> {
  const conn = await getDbConnection();
  if (!conn) return null;
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_project_members (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version_key VARCHAR(64) NOT NULL,
    user_id BIGINT NOT NULL,
    member_tier ENUM('junior','senior') NOT NULL DEFAULT 'junior',
    project_role ENUM('user','order_admin','catalog_admin','owner') NOT NULL DEFAULT 'user',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by BIGINT NULL,
    updated_by BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ziding_member (version_key, user_id),
    KEY idx_ziding_member_role (version_key, project_role, is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_products (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version_key VARCHAR(64) NOT NULL,
    name VARCHAR(160) NOT NULL,
    subtitle VARCHAR(240) NOT NULL DEFAULT '',
    description TEXT NULL,
    image_url VARCHAR(1024) NOT NULL DEFAULT '',
    price_junior DECIMAL(12,2) NOT NULL,
    price_senior DECIMAL(12,2) NULL,
    original_price DECIMAL(12,2) NULL,
    stock INT NOT NULL DEFAULT 0,
    reserved_stock INT NOT NULL DEFAULT 0,
    earns_points TINYINT(1) NOT NULL DEFAULT 1,
    status TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_by BIGINT NULL,
    updated_by BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_ziding_products_list (version_key, status, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_addresses (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version_key VARCHAR(64) NOT NULL,
    user_id BIGINT NOT NULL,
    receiver_name VARCHAR(64) NOT NULL,
    receiver_phone VARCHAR(32) NOT NULL,
    province VARCHAR(64) NOT NULL,
    city VARCHAR(64) NOT NULL,
    district VARCHAR(64) NOT NULL DEFAULT '',
    detail VARCHAR(255) NOT NULL,
    label_name VARCHAR(32) NOT NULL DEFAULT '常用地址',
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_ziding_addresses_owner (version_key, user_id, is_default)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_settings (
    version_key VARCHAR(64) PRIMARY KEY,
    payment_instruction TEXT NOT NULL,
    stock_hold_hours INT NOT NULL DEFAULT 24,
    auto_confirm_days INT NOT NULL DEFAULT 7,
    updated_by BIGINT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version_key VARCHAR(64) NOT NULL,
    order_no VARCHAR(40) NOT NULL,
    user_id BIGINT NOT NULL,
    member_tier ENUM('junior','senior') NOT NULL DEFAULT 'junior',
    status ENUM('awaiting_proof','proof_submitted','proof_rejected','confirmed','shipped','completed','cancelled') NOT NULL DEFAULT 'awaiting_proof',
    total_amount DECIMAL(12,2) NOT NULL,
    points_eligible_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    points_month CHAR(7) NULL,
    receiver_name VARCHAR(64) NOT NULL,
    receiver_phone VARCHAR(32) NOT NULL,
    receiver_province VARCHAR(64) NOT NULL,
    receiver_city VARCHAR(64) NOT NULL,
    receiver_district VARCHAR(64) NOT NULL DEFAULT '',
    receiver_detail VARCHAR(255) NOT NULL,
    payment_confirmed_at DATETIME NULL,
    proof_submitted_at DATETIME NULL,
    shipped_at DATETIME NULL,
    completed_at DATETIME NULL,
    auto_complete_at DATETIME NULL,
    expire_at DATETIME NULL,
    shipping_company VARCHAR(80) NULL,
    tracking_no VARCHAR(120) NULL,
    reject_reason VARCHAR(500) NULL,
    admin_remark VARCHAR(500) NULL,
    cancelled_at DATETIME NULL,
    cancelled_by BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ziding_order_no (order_no),
    KEY idx_ziding_orders_owner (version_key, user_id, created_at),
    KEY idx_ziding_orders_status (version_key, status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_order_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    product_name VARCHAR(160) NOT NULL,
    product_image_url VARCHAR(1024) NOT NULL DEFAULT '',
    unit_price DECIMAL(12,2) NOT NULL,
    quantity INT NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    earns_points TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ziding_order_items_order (order_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_payment_proofs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version_key VARCHAR(64) NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    owner_user_id BIGINT NOT NULL,
    object_key VARCHAR(512) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    byte_size INT UNSIGNED NOT NULL,
    sha256 CHAR(64) NOT NULL,
    status ENUM('active','deleted') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    UNIQUE KEY uq_ziding_proof_key (object_key),
    KEY idx_ziding_proofs_order (version_key, order_id, owner_user_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_order_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version_key VARCHAR(64) NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    actor_user_id BIGINT NULL,
    actor_role VARCHAR(32) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    event_text VARCHAR(500) NOT NULL,
    meta_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ziding_events_order (version_key, order_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_point_rules (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version_key VARCHAR(64) NOT NULL,
    min_amount DECIMAL(12,2) NOT NULL,
    multiplier DECIMAL(8,4) NOT NULL,
    rule_note VARCHAR(255) NOT NULL DEFAULT '',
    effective_month CHAR(7) NOT NULL DEFAULT '1970-01',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_by BIGINT NULL,
    updated_by BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ziding_point_threshold (version_key, effective_month, min_amount),
    KEY idx_ziding_point_rules (version_key, enabled, effective_month, min_amount)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_points_ledger (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version_key VARCHAR(64) NOT NULL,
    user_id BIGINT NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    point_month CHAR(7) NOT NULL,
    delta_points DECIMAL(14,2) NOT NULL,
    target_points DECIMAL(14,2) NOT NULL,
    qualified_amount DECIMAL(12,2) NOT NULL,
    multiplier DECIMAL(8,4) NOT NULL,
    entry_type ENUM('auto_adjustment','manual_adjustment') NOT NULL DEFAULT 'auto_adjustment',
    note VARCHAR(500) NOT NULL DEFAULT '',
    created_by BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ziding_points_user (version_key, user_id, point_month, created_at),
    KEY idx_ziding_points_order (order_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version_key VARCHAR(64) NOT NULL,
    user_id BIGINT NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(160) NOT NULL,
    content VARCHAR(500) NOT NULL,
    read_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ziding_notifications_user (version_key, user_id, read_at, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS ziding_admin_audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version_key VARCHAR(64) NOT NULL,
    actor_user_id BIGINT NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    detail_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ziding_audit_entity (version_key, entity_type, entity_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await conn.execute(
    `INSERT INTO ziding_settings (version_key, payment_instruction, stock_hold_hours, auto_confirm_days, updated_by)
     VALUES (?, '请按管理员提供的收款信息完成转账，并在订单内上传清晰付款凭证。管理员核验后安排发货。', 24, 7, ?)
     ON DUPLICATE KEY UPDATE version_key = VALUES(version_key)`,
    [ZIDING_PROJECT_KEY, ZIDING_OWNER_USER_ID],
  );
  await conn.execute(
    `INSERT INTO ziding_point_rules (version_key, min_amount, multiplier, rule_note, effective_month, enabled, sort_order, created_by)
     VALUES (?, 0, 1.0000, '基础积分：确认收款金额 1:1 计分', '1970-01', 1, 0, ?)
     ON DUPLICATE KEY UPDATE version_key = VALUES(version_key)`,
    [ZIDING_PROJECT_KEY, ZIDING_OWNER_USER_ID],
  );
  // 用户已明确授权：盈盈仅在紫鼎项目内担任负责人。若今后手动改为更高角色，本语句不会覆盖。
  await conn.execute(
    `INSERT INTO ziding_project_members (version_key, user_id, member_tier, project_role, is_active, created_by, updated_by)
     VALUES (?, ?, 'junior', 'owner', 1, ?, ?)
     ON DUPLICATE KEY UPDATE
       project_role = IF(project_role = 'user', 'owner', project_role),
       is_active = 1,
       updated_by = VALUES(updated_by)`,
    [ZIDING_PROJECT_KEY, ZIDING_OWNER_USER_ID, ZIDING_OWNER_USER_ID, ZIDING_OWNER_USER_ID],
  );
  return conn;
}

// 路由每次请求都需要连接，但 DDL 只应在单个进程内运行一次。
let zidingSchemaReady = false;
let zidingSchemaPromise: Promise<void> | null = null;
export async function ensureZidingCommerceTables(): Promise<DbConn | null> {
  const conn = await getDbConnection();
  if (!conn) return null;
  if (zidingSchemaReady) return conn;
  if (!zidingSchemaPromise) {
    zidingSchemaPromise = initializeZidingCommerceTables()
      .then((initialized) => {
        if (!initialized) throw new Error("紫鼎项目数据表初始化失败");
        zidingSchemaReady = true;
      })
      .catch((error) => {
        zidingSchemaPromise = null;
        throw error;
      });
  }
  await zidingSchemaPromise;
  return conn;
}

async function getActiveMember(conn: DbConn, userId: number, allowCreate = true) {
  const [rows] = await conn.execute(
    `SELECT * FROM ziding_project_members WHERE version_key = ? AND user_id = ? LIMIT 1`,
    [ZIDING_PROJECT_KEY, userId],
  );
  let member = (rows as any[])[0] || null;
  if (!member && allowCreate) {
    await conn.execute(
      `INSERT INTO ziding_project_members (version_key, user_id, member_tier, project_role, is_active, created_by, updated_by)
       VALUES (?, ?, 'junior', 'user', 1, ?, ?)`,
      [ZIDING_PROJECT_KEY, userId, userId, userId],
    );
    const [created] = await conn.execute(
      `SELECT * FROM ziding_project_members WHERE version_key = ? AND user_id = ? LIMIT 1`,
      [ZIDING_PROJECT_KEY, userId],
    );
    member = (created as any[])[0] || null;
  }
  if (!member || Number(member.is_active) !== 1) toError("FORBIDDEN", "该紫鼎项目账号当前不可用");
  return member as any;
}

async function getProjectAccess(ctx: any, allowCreate = true) {
  const conn = await ensureZidingCommerceTables();
  if (!conn) toError("INTERNAL_SERVER_ERROR", "项目服务暂不可用");
  const effectiveUserId = Number(ctx.user?.id || 0);
  if (!effectiveUserId) toError("FORBIDDEN", "请先登录后继续");
  const realUser = ctx.realUser || ctx.user;
  const [existingRows] = await conn.execute(
    `SELECT project_role, is_active FROM ziding_project_members WHERE version_key = ? AND user_id = ? LIMIT 1`,
    [ZIDING_PROJECT_KEY, effectiveUserId],
  );
  const existing = (existingRows as any[])[0] || null;
  const hasProjectManagementRole = existing && Number(existing.is_active) === 1 && ["owner", "order_admin", "catalog_admin"].includes(String(existing.project_role));
  // 项目入口沿用站点已有的版本分发：只有被分配该版本（或该版本在可切换范围）的
  // 用户才能进入。项目负责人、系统超管可用于配置和救援，不能被版本设置误锁在外。
  const resolvedVersion = await resolveUserVersion(effectiveUserId);
  const versionAllowed = resolvedVersion.versionKey === ZIDING_PROJECT_KEY || resolvedVersion.switchableVersionKeys.includes(ZIDING_PROJECT_KEY);
  if (realUser?.role !== "super_admin" && !hasProjectManagementRole && !versionAllowed) {
    toError("FORBIDDEN", "当前账号未获分配紫鼎商业联盟项目版本");
  }
  const member = await getActiveMember(conn, effectiveUserId, allowCreate);
  const actingUserId = actorId(ctx) || effectiveUserId;
  return { conn, member, effectiveUserId, actingUserId };
}

async function requireProjectAdmin(ctx: any, scope: "orders" | "catalog" | "all" = "all") {
  const conn = await ensureZidingCommerceTables();
  if (!conn) toError("INTERNAL_SERVER_ERROR", "项目服务暂不可用");
  const user = ctx.realUser || ctx.user;
  const userId = Number(user?.id || 0);
  if (!userId) toError("FORBIDDEN", "请先登录后继续");
  if (user?.role === "super_admin") return { conn, actorUserId: userId, role: "owner" as ProjectRole };
  const member = await getActiveMember(conn, userId, false);
  const role = String(member.project_role) as ProjectRole;
  const allowed = role === "owner" || (scope === "orders" && role === "order_admin") || (scope === "catalog" && role === "catalog_admin");
  if (!allowed) toError("FORBIDDEN", "仅紫鼎项目管理员可执行此操作");
  return { conn, actorUserId: userId, role };
}

function assertNotViewingAs(ctx: any) {
  if (ctx.isViewingAs) toError("FORBIDDEN", "查看模式下不能提交订单或修改数据");
}

async function writeEvent(conn: DbConn, input: {
  orderId: number; actorUserId?: number | null; actorRole: string; eventType: string; text: string; meta?: unknown;
}) {
  await conn.execute(
    `INSERT INTO ziding_order_events (version_key, order_id, actor_user_id, actor_role, event_type, event_text, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ZIDING_PROJECT_KEY, input.orderId, input.actorUserId ?? null, input.actorRole, input.eventType, input.text, input.meta ? JSON.stringify(input.meta) : null],
  );
}

async function sendNotification(conn: DbConn, userId: number, input: { orderId?: number; type: string; title: string; content: string }) {
  await conn.execute(
    `INSERT INTO ziding_notifications (version_key, user_id, order_id, type, title, content) VALUES (?, ?, ?, ?, ?, ?)`,
    [ZIDING_PROJECT_KEY, userId, input.orderId ?? null, input.type, input.title, input.content],
  );
}

async function auditAdmin(conn: DbConn, actorUserId: number, action: string, entityType: string, entityId: string | number, detail?: unknown) {
  await conn.execute(
    `INSERT INTO ziding_admin_audit_logs (version_key, actor_user_id, action, entity_type, entity_id, detail_json) VALUES (?, ?, ?, ?, ?, ?)`,
    [ZIDING_PROJECT_KEY, actorUserId, action, entityType, String(entityId), detail ? JSON.stringify(detail) : null],
  );
}

async function getSettings(conn: DbConn) {
  const [rows] = await conn.execute(`SELECT * FROM ziding_settings WHERE version_key = ? LIMIT 1`, [ZIDING_PROJECT_KEY]);
  return (rows as any[])[0] || { payment_instruction: "", stock_hold_hours: 24, auto_confirm_days: 7 };
}

async function getPointRules(conn: DbConn, month: string) {
  const [rows] = await conn.execute(
    `SELECT * FROM ziding_point_rules
     WHERE version_key = ? AND enabled = 1 AND effective_month <= ?
     ORDER BY effective_month DESC, min_amount ASC, sort_order ASC`,
    [ZIDING_PROJECT_KEY, month],
  );
  const rules = rows as any[];
  const latestMonth = rules[0]?.effective_month;
  return rules.filter((rule) => rule.effective_month === latestMonth).sort((a, b) => Number(a.min_amount) - Number(b.min_amount));
}

/** 以确认收款月为维度重算目标积分，只写入差额，保证重复调用幂等。 */
async function reconcileMonthlyPoints(conn: DbConn, input: { userId: number; month: string; triggerOrderId: number; actorUserId: number; note: string }) {
  const [amountRows] = await conn.execute(
    `SELECT COALESCE(SUM(points_eligible_amount), 0) AS qualified_amount
     FROM ziding_orders
     WHERE version_key = ? AND user_id = ? AND points_month = ?
       AND status IN ('confirmed','shipped','completed')`,
    [ZIDING_PROJECT_KEY, input.userId, input.month],
  );
  const qualifiedAmount = MONEY((amountRows as any[])[0]?.qualified_amount);
  const rules = await getPointRules(conn, input.month);
  const matched = [...rules].reverse().find((rule) => qualifiedAmount >= Number(rule.min_amount)) || rules[0] || { multiplier: 1 };
  const multiplier = Number(matched.multiplier || 1);
  const targetPoints = MONEY(qualifiedAmount * multiplier);
  const [ledgerRows] = await conn.execute(
    `SELECT COALESCE(SUM(delta_points), 0) AS current_points FROM ziding_points_ledger
     WHERE version_key = ? AND user_id = ? AND point_month = ?`,
    [ZIDING_PROJECT_KEY, input.userId, input.month],
  );
  const currentPoints = MONEY((ledgerRows as any[])[0]?.current_points);
  const delta = MONEY(targetPoints - currentPoints);
  if (Math.abs(delta) < 0.005) return { qualifiedAmount, multiplier, targetPoints, delta: 0 };
  await conn.execute(
    `INSERT INTO ziding_points_ledger
     (version_key, user_id, order_id, point_month, delta_points, target_points, qualified_amount, multiplier, entry_type, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'auto_adjustment', ?, ?)`,
    [ZIDING_PROJECT_KEY, input.userId, input.triggerOrderId, input.month, delta, targetPoints, qualifiedAmount, multiplier, input.note, input.actorUserId],
  );
  return { qualifiedAmount, multiplier, targetPoints, delta };
}

async function getOrderWithOwnership(conn: DbConn, orderId: number) {
  const [rows] = await conn.execute(`SELECT * FROM ziding_orders WHERE id = ? AND version_key = ? LIMIT 1`, [orderId, ZIDING_PROJECT_KEY]);
  return (rows as any[])[0] || null;
}

async function getOrderDetail(conn: DbConn, row: any) {
  const [itemRows, proofRows, eventRows] = await Promise.all([
    conn.execute(`SELECT oi.*, p.subtitle AS product_subtitle FROM ziding_order_items oi LEFT JOIN ziding_products p ON p.id=oi.product_id AND p.version_key=? WHERE oi.order_id=? ORDER BY oi.id ASC`, [ZIDING_PROJECT_KEY, row.id]),
    conn.execute(`SELECT id, created_at FROM ziding_payment_proofs WHERE version_key = ? AND order_id = ? AND status = 'active' ORDER BY id ASC`, [ZIDING_PROJECT_KEY, row.id]),
    conn.execute(`SELECT event_type, event_text, created_at FROM ziding_order_events WHERE version_key = ? AND order_id = ? ORDER BY id ASC`, [ZIDING_PROJECT_KEY, row.id]),
  ]);
  return {
    ...mapOrder(row),
    items: ((itemRows[0] as any[]) || []).map((item) => ({
      id: Number(item.id), productId: Number(item.product_id), name: item.product_name, subtitle: String(item.product_subtitle || ""), imageUrl: item.product_image_url || "",
      unitPrice: MONEY(item.unit_price), quantity: Number(item.quantity), lineTotal: MONEY(item.line_total), earnsPoints: Number(item.earns_points) === 1,
    })),
    proofs: ((proofRows[0] as any[]) || []).map((proof) => ({ id: Number(proof.id), createdAt: proof.created_at })),
    timeline: ((eventRows[0] as any[]) || []).map((event) => ({ type: event.event_type, text: event.event_text, createdAt: event.created_at })),
  };
}

async function releaseOrderReservation(conn: DbConn, orderId: number, restoreStock: boolean) {
  const [itemRows] = await conn.execute(`SELECT product_id, quantity FROM ziding_order_items WHERE order_id = ?`, [orderId]);
  for (const item of (itemRows as any[]) || []) {
    await conn.execute(
      `UPDATE ziding_products SET reserved_stock = GREATEST(0, reserved_stock - ?), stock = ${restoreStock ? "stock + ?" : "stock"}
       WHERE id = ? AND version_key = ?`,
      restoreStock ? [Number(item.quantity), Number(item.quantity), Number(item.product_id), ZIDING_PROJECT_KEY] : [Number(item.quantity), Number(item.product_id), ZIDING_PROJECT_KEY],
    );
  }
}

async function cancelOrderInternal(conn: DbConn, order: any, input: { actorUserId: number; actorRole: string; reason: string }) {
  const wasPaid = ["confirmed", "shipped", "completed"].includes(String(order.status));
  await releaseOrderReservation(conn, Number(order.id), wasPaid);
  await conn.execute(
    `UPDATE ziding_orders SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ?, admin_remark = CASE WHEN ? = '' THEN admin_remark ELSE ? END WHERE id = ?`,
    [input.actorUserId, input.reason, input.reason, order.id],
  );
  await writeEvent(conn, { orderId: Number(order.id), actorUserId: input.actorUserId, actorRole: input.actorRole, eventType: "cancelled", text: `订单已取消${input.reason ? `：${input.reason}` : ""}` });
  if (wasPaid && order.points_month) {
    await reconcileMonthlyPoints(conn, {
      userId: Number(order.user_id), month: String(order.points_month), triggerOrderId: Number(order.id), actorUserId: input.actorUserId, note: "订单取消，重算当月积分",
    });
  }
  await sendNotification(conn, Number(order.user_id), { orderId: Number(order.id), type: "order_cancelled", title: "订单已取消", content: `订单 ${order.order_no} 已取消${input.reason ? `：${input.reason}` : ""}` });
}

/** 生产环境定时调用：释放超时未传凭证库存并自动确认已发货订单。 */
export async function runZidingOrderLifecycleSweep() {
  const conn = await ensureZidingCommerceTables();
  if (!conn) return { cancelled: 0, completed: 0 };
  const [expiredRows] = await conn.execute(
    `SELECT * FROM ziding_orders WHERE version_key = ? AND status IN ('awaiting_proof','proof_rejected') AND expire_at IS NOT NULL AND expire_at < NOW() LIMIT 200`,
    [ZIDING_PROJECT_KEY],
  );
  let cancelled = 0;
  for (const order of (expiredRows as any[]) || []) {
    await cancelOrderInternal(conn, order, { actorUserId: 0, actorRole: "system", reason: "超时未上传付款凭证，库存已释放" });
    cancelled += 1;
  }
  const [deliveredRows] = await conn.execute(
    `SELECT * FROM ziding_orders WHERE version_key = ? AND status = 'shipped' AND auto_complete_at IS NOT NULL AND auto_complete_at < NOW() LIMIT 200`,
    [ZIDING_PROJECT_KEY],
  );
  let completed = 0;
  for (const order of (deliveredRows as any[]) || []) {
    await conn.execute(`UPDATE ziding_orders SET status = 'completed', completed_at = NOW() WHERE id = ? AND status = 'shipped'`, [order.id]);
    await writeEvent(conn, { orderId: Number(order.id), actorUserId: 0, actorRole: "system", eventType: "auto_completed", text: "已到自动确认收货时间，订单已完成" });
    await sendNotification(conn, Number(order.user_id), { orderId: Number(order.id), type: "order_completed", title: "订单已自动完成", content: `订单 ${order.order_no} 已自动确认收货。` });
    completed += 1;
  }
  return { cancelled, completed };
}

const addressInput = z.object({
  id: z.number().int().positive().optional(),
  receiverName: z.string().trim().min(1).max(64),
  receiverPhone: z.string().trim().min(7).max(32),
  province: z.string().trim().min(1).max(64),
  city: z.string().trim().min(1).max(64),
  district: z.string().trim().max(64).optional().default(""),
  detail: z.string().trim().min(1).max(255),
  labelName: z.string().trim().max(32).optional().default("常用地址"),
  isDefault: z.boolean().optional().default(false),
});

export const zidingCommerceRouter = router({
  myContext: protectedProcedure.query(async ({ ctx }) => {
    const { conn, member, effectiveUserId } = await getProjectAccess(ctx);
    const month = nowMonth();
    const [pointRows, ledgerRows, notificationRows, productRows, orderStatusRows] = await Promise.all([
      conn.execute(`SELECT COALESCE(SUM(points_eligible_amount), 0) AS qualified_amount FROM ziding_orders WHERE version_key=? AND user_id=? AND points_month=? AND status IN ('confirmed','shipped','completed')`, [ZIDING_PROJECT_KEY, effectiveUserId, month]),
      conn.execute(`SELECT COALESCE(SUM(delta_points), 0) AS points FROM ziding_points_ledger WHERE version_key=? AND user_id=? AND point_month=?`, [ZIDING_PROJECT_KEY, effectiveUserId, month]),
      conn.execute(`SELECT COUNT(*) AS count FROM ziding_notifications WHERE version_key=? AND user_id=? AND read_at IS NULL`, [ZIDING_PROJECT_KEY, effectiveUserId]),
      conn.execute(`SELECT COUNT(*) AS count FROM ziding_products WHERE version_key=? AND status=1`, [ZIDING_PROJECT_KEY]),
      conn.execute(`SELECT status, COUNT(*) AS count FROM ziding_orders WHERE version_key=? AND user_id=? AND status IN ('proof_submitted','confirmed','shipped') GROUP BY status`, [ZIDING_PROJECT_KEY, effectiveUserId]),
    ]);
    const rules = await getPointRules(conn, month);
    const settings = await getSettings(conn);
    const qualifiedAmount = MONEY((pointRows[0] as any[])[0]?.qualified_amount);
    const currentRule = [...rules].reverse().find((rule) => qualifiedAmount >= Number(rule.min_amount)) || rules[0] || { multiplier: 1, min_amount: 0 };
    const nextRule = rules.find((rule) => Number(rule.min_amount) > qualifiedAmount) || null;
    const role = String(member.project_role) as ProjectRole;
    const statusCounts = Object.fromEntries(((orderStatusRows[0] as any[]) || []).map((row) => [String(row.status), Number(row.count || 0)]));
    return {
      projectKey: ZIDING_PROJECT_KEY,
      member: { tier: member.member_tier as MemberTier, role, isAdmin: role !== "user" || ctx.user?.role === "super_admin" },
      points: {
        month, qualifiedAmount, currentMultiplier: Number(currentRule.multiplier || 1),
        earned: MONEY((ledgerRows[0] as any[])[0]?.points),
        nextThreshold: nextRule ? MONEY(nextRule.min_amount) : null,
        amountToNext: nextRule ? MONEY(Number(nextRule.min_amount) - qualifiedAmount) : null,
      },
      unreadNotifications: Number((notificationRows[0] as any[])[0]?.count || 0),
      orderSummary: {
        awaitingConfirmation: Number(statusCounts.proof_submitted || 0),
        awaitingShipment: Number(statusCounts.confirmed || 0),
        awaitingReceipt: Number(statusCounts.shipped || 0),
      },
      productCount: Number((productRows[0] as any[])[0]?.count || 0),
      paymentInstruction: String(settings.payment_instruction || ""),
    };
  }),

  listProducts: protectedProcedure.query(async ({ ctx }) => {
    const { conn, member } = await getProjectAccess(ctx);
    const [rows] = await conn.execute(`SELECT * FROM ziding_products WHERE version_key = ? AND status = 1 ORDER BY sort_order ASC, id DESC`, [ZIDING_PROJECT_KEY]);
    return ((rows as any[]) || []).map((row) => mapProduct(row, member.member_tier as MemberTier));
  }),

  listAddresses: protectedProcedure.query(async ({ ctx }) => {
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    const [rows] = await conn.execute(`SELECT * FROM ziding_addresses WHERE version_key=? AND user_id=? ORDER BY is_default DESC, updated_at DESC, id DESC`, [ZIDING_PROJECT_KEY, effectiveUserId]);
    return ((rows as any[]) || []).map((row) => ({
      id: Number(row.id), receiverName: row.receiver_name, receiverPhone: row.receiver_phone, province: row.province, city: row.city,
      district: row.district, detail: row.detail, labelName: row.label_name, isDefault: Number(row.is_default) === 1,
    }));
  }),

  saveAddress: protectedProcedure.input(addressInput).mutation(async ({ ctx, input }) => {
    assertNotViewingAs(ctx);
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    if (input.isDefault) await conn.execute(`UPDATE ziding_addresses SET is_default=0 WHERE version_key=? AND user_id=?`, [ZIDING_PROJECT_KEY, effectiveUserId]);
    if (input.id) {
      await conn.execute(`UPDATE ziding_addresses SET receiver_name=?, receiver_phone=?, province=?, city=?, district=?, detail=?, label_name=?, is_default=? WHERE id=? AND version_key=? AND user_id=?`,
        [input.receiverName, input.receiverPhone, input.province, input.city, input.district, input.detail, input.labelName, input.isDefault ? 1 : 0, input.id, ZIDING_PROJECT_KEY, effectiveUserId]);
      return { id: input.id };
    }
    const [result] = await conn.execute(`INSERT INTO ziding_addresses (version_key,user_id,receiver_name,receiver_phone,province,city,district,detail,label_name,is_default) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [ZIDING_PROJECT_KEY, effectiveUserId, input.receiverName, input.receiverPhone, input.province, input.city, input.district, input.detail, input.labelName, input.isDefault ? 1 : 0]);
    return { id: Number((result as any).insertId) };
  }),

  deleteAddress: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    assertNotViewingAs(ctx);
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    await conn.execute(`DELETE FROM ziding_addresses WHERE id=? AND version_key=? AND user_id=?`, [input.id, ZIDING_PROJECT_KEY, effectiveUserId]);
    return { success: true };
  }),

  createOrder: protectedProcedure.input(z.object({
    addressId: z.number().int().positive(),
    items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(99) })).min(1).max(20),
  })).mutation(async ({ ctx, input }) => {
    assertNotViewingAs(ctx);
    const { member, effectiveUserId } = await getProjectAccess(ctx);
    const quantityByProduct = new Map<number, number>();
    for (const item of input.items) quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) || 0) + item.quantity);
    const productIds = Array.from(quantityByProduct.keys());
    // getProjectAccess 返回的是连接池代理，只能执行普通 SQL；下单需要行锁与原子提交，
    // 因此必须单独申请真实连接，不能在连接池代理上调用 beginTransaction。
    const txConn = await getDbTransactionConnection();
    if (!txConn) toError("INTERNAL_SERVER_ERROR", "订单服务暂不可用，请稍后重试");
    try {
      await txConn.beginTransaction();
      const [addressRows] = await txConn.execute(`SELECT * FROM ziding_addresses WHERE id=? AND version_key=? AND user_id=? LIMIT 1 FOR UPDATE`, [input.addressId, ZIDING_PROJECT_KEY, effectiveUserId]);
      const address = (addressRows as any[])[0];
      if (!address) toError("NOT_FOUND", "请先选择有效的收货地址");
      const placeholders = productIds.map(() => "?").join(",");
      const [productRows] = await txConn.execute(`SELECT * FROM ziding_products WHERE version_key=? AND id IN (${placeholders}) AND status=1 FOR UPDATE`, [ZIDING_PROJECT_KEY, ...productIds]);
      const products = new Map<number, any>(((productRows as any[]) || []).map((product) => [Number(product.id), product]));
      if (products.size !== productIds.length) toError("BAD_REQUEST", "部分商品已下架，请刷新后重试");
      let total = 0;
      let eligible = 0;
      const items: Array<any> = [];
      for (const productId of productIds) {
        const product = products.get(productId);
        const quantity = quantityByProduct.get(productId) || 0;
        const available = Number(product.stock || 0) - Number(product.reserved_stock || 0);
        if (available < quantity) toError("BAD_REQUEST", `“${product.name}”库存不足，当前可订 ${Math.max(0, available)} 件`);
        const unitPrice = member.member_tier === "senior" && product.price_senior != null ? MONEY(product.price_senior) : MONEY(product.price_junior);
        const lineTotal = MONEY(unitPrice * quantity);
        total += lineTotal;
        if (Number(product.earns_points) === 1) eligible += lineTotal;
        items.push({ product, quantity, unitPrice, lineTotal });
      }
      const settings = await getSettings(txConn);
      const holdHours = Math.max(1, Math.min(Number(settings.stock_hold_hours || 24), 168));
      const [result] = await txConn.execute(
        `INSERT INTO ziding_orders (version_key,order_no,user_id,member_tier,status,total_amount,points_eligible_amount,receiver_name,receiver_phone,receiver_province,receiver_city,receiver_district,receiver_detail,expire_at)
         VALUES (?,?,?,?, 'awaiting_proof', ?,?,?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
        [ZIDING_PROJECT_KEY, orderNo(), effectiveUserId, member.member_tier, MONEY(total), MONEY(eligible), address.receiver_name, address.receiver_phone, address.province, address.city, address.district, address.detail, holdHours],
      );
      const newOrderId = Number((result as any).insertId);
      for (const item of items) {
        await txConn.execute(`UPDATE ziding_products SET reserved_stock=reserved_stock+? WHERE id=? AND version_key=?`, [item.quantity, item.product.id, ZIDING_PROJECT_KEY]);
        await txConn.execute(`INSERT INTO ziding_order_items (order_id,product_id,product_name,product_image_url,unit_price,quantity,line_total,earns_points) VALUES (?,?,?,?,?,?,?,?)`,
          [newOrderId, item.product.id, item.product.name, item.product.image_url || "", item.unitPrice, item.quantity, item.lineTotal, Number(item.product.earns_points) === 1 ? 1 : 0]);
      }
      await writeEvent(txConn, { orderId: newOrderId, actorUserId: effectiveUserId, actorRole: "user", eventType: "created", text: "订单已拍下，等待上传付款凭证" });
      await txConn.commit();
      return { id: newOrderId };
    } catch (error) {
      await txConn.rollback();
      throw error;
    } finally {
      // 连接池场景必须释放独占连接；直连开发环境没有 release，不应在这里关闭。
      if (typeof (txConn as any).release === "function") (txConn as any).release();
    }
  }),

  myOrders: protectedProcedure.input(z.object({ status: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    const filters = [`version_key=?`, `user_id=?`]; const values: any[] = [ZIDING_PROJECT_KEY, effectiveUserId];
    if (input?.status && input.status !== "all") { filters.push(`status=?`); values.push(input.status); }
    const [rows] = await conn.execute(`SELECT * FROM ziding_orders WHERE ${filters.join(" AND ")} ORDER BY created_at DESC, id DESC`, values);
    return ((rows as any[]) || []).map(mapOrder);
  }),

  myOrderDetail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    const order = await getOrderWithOwnership(conn, input.id);
    if (!order || Number(order.user_id) !== effectiveUserId) toError("NOT_FOUND", "订单不存在");
    return getOrderDetail(conn, order);
  }),

  uploadPaymentProof: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), imageData: z.string().min(32).max(15_000_000) })).mutation(async ({ ctx, input }) => {
    assertNotViewingAs(ctx);
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    const order = await getOrderWithOwnership(conn, input.orderId);
    if (!order || Number(order.user_id) !== effectiveUserId) toError("NOT_FOUND", "订单不存在");
    if (!["awaiting_proof", "proof_rejected"].includes(String(order.status))) toError("BAD_REQUEST", "当前订单不允许继续上传付款凭证");
    const [proofCountRows] = await conn.execute(`SELECT COUNT(*) AS count FROM ziding_payment_proofs WHERE version_key=? AND order_id=? AND status='active'`, [ZIDING_PROJECT_KEY, order.id]);
    if (Number((proofCountRows as any[])[0]?.count || 0) >= 3) toError("BAD_REQUEST", "一笔订单最多上传 3 张付款凭证");
    const uploaded = await uploadPrivateZidingPaymentProof({ imageData: input.imageData, orderId: Number(order.id), ownerUserId: effectiveUserId });
    try {
      await conn.execute(`INSERT INTO ziding_payment_proofs (version_key,order_id,owner_user_id,object_key,content_type,byte_size,sha256) VALUES (?,?,?,?,?,?,?)`,
        [ZIDING_PROJECT_KEY, order.id, effectiveUserId, uploaded.objectKey, uploaded.contentType, uploaded.byteSize, uploaded.sha256]);
      await conn.execute(`UPDATE ziding_orders SET status='proof_submitted', proof_submitted_at=NOW(), reject_reason=NULL WHERE id=?`, [order.id]);
      await writeEvent(conn, { orderId: Number(order.id), actorUserId: effectiveUserId, actorRole: "user", eventType: "proof_submitted", text: "已上传付款凭证，等待管理员确认" });
      return { success: true };
    } catch (error) {
      await deletePrivateZidingPaymentProof(uploaded.objectKey).catch(() => undefined);
      throw error;
    }
  }),

  // 分步下单页在用户确认后一次提交所选凭证，避免每选择一张图片就改变订单状态。
  submitPaymentProofs: protectedProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        images: z.array(z.string().min(32).max(15_000_000)).min(1).max(3),
        transferNote: z.string().trim().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertNotViewingAs(ctx);
      const { effectiveUserId } = await getProjectAccess(ctx);
      const txConn = await getDbTransactionConnection();
      if (!txConn)
        toError("INTERNAL_SERVER_ERROR", "订单服务暂不可用，请稍后重试");
      const uploaded: Array<
        Awaited<ReturnType<typeof uploadPrivateZidingPaymentProof>>
      > = [];
      let transactionStarted = false;
      try {
        await txConn.beginTransaction();
        transactionStarted = true;
        const [orderRows] = await txConn.execute(
          `SELECT * FROM ziding_orders WHERE id=? AND version_key=? AND user_id=? LIMIT 1 FOR UPDATE`,
          [input.orderId, ZIDING_PROJECT_KEY, effectiveUserId]
        );
        const order = (orderRows as any[])[0];
        if (!order) toError("NOT_FOUND", "订单不存在");
        if (
          !["awaiting_proof", "proof_rejected"].includes(String(order.status))
        )
          toError("BAD_REQUEST", "当前订单不允许继续上传付款凭证");
        const [proofCountRows] = await txConn.execute(
          `SELECT COUNT(*) AS count FROM ziding_payment_proofs WHERE version_key=? AND order_id=? AND status='active'`,
          [ZIDING_PROJECT_KEY, order.id]
        );
        const existingCount = Number((proofCountRows as any[])[0]?.count || 0);
        if (existingCount + input.images.length > 3) {
          toError(
            "BAD_REQUEST",
            `一笔订单最多上传 3 张付款凭证，当前还可提交 ${Math.max(0, 3 - existingCount)} 张`
          );
        }
        for (const imageData of input.images) {
          uploaded.push(
            await uploadPrivateZidingPaymentProof({
              imageData,
              orderId: Number(order.id),
              ownerUserId: effectiveUserId,
            })
          );
        }
        for (const proof of uploaded) {
          await txConn.execute(
            `INSERT INTO ziding_payment_proofs (version_key,order_id,owner_user_id,object_key,content_type,byte_size,sha256) VALUES (?,?,?,?,?,?,?)`,
            [
              ZIDING_PROJECT_KEY,
              order.id,
              effectiveUserId,
              proof.objectKey,
              proof.contentType,
              proof.byteSize,
              proof.sha256,
            ]
          );
        }
        await txConn.execute(
          `UPDATE ziding_orders SET status='proof_submitted', proof_submitted_at=NOW(), reject_reason=NULL WHERE id=?`,
          [order.id]
        );
        await writeEvent(txConn, {
          orderId: Number(order.id),
          actorUserId: effectiveUserId,
          actorRole: "user",
          eventType: "proof_submitted",
          text: `已提交 ${uploaded.length} 张付款凭证${input.transferNote ? `（汇款备注：${input.transferNote}）` : ""}，等待管理员确认`,
        });
        await txConn.commit();
        return { success: true, proofCount: existingCount + uploaded.length };
      } catch (error) {
        if (transactionStarted) await txConn.rollback().catch(() => undefined);
        await Promise.all(
          uploaded.map(proof =>
            deletePrivateZidingPaymentProof(proof.objectKey).catch(
              () => undefined
            )
          )
        );
        throw error;
      } finally {
        if (typeof (txConn as any).release === "function")
          (txConn as any).release();
      }
    }),

  getPaymentProofUrl: protectedProcedure.input(z.object({ proofId: z.number().int().positive(), download: z.boolean().optional().default(false) })).query(async ({ ctx, input }) => {
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    const [rows] = await conn.execute(`SELECT p.*, o.user_id, o.order_no FROM ziding_payment_proofs p INNER JOIN ziding_orders o ON o.id=p.order_id WHERE p.id=? AND p.version_key=? AND p.status='active' LIMIT 1`, [input.proofId, ZIDING_PROJECT_KEY]);
    const proof = (rows as any[])[0];
    if (!proof) toError("NOT_FOUND", "付款凭证不存在");
    const isOwner = Number(proof.owner_user_id) === effectiveUserId && Number(proof.user_id) === effectiveUserId;
    let actorRole = "user";
    if (!isOwner) {
      const realUser = ctx.realUser || ctx.user;
      const realId = Number(realUser?.id || 0);
      const [memberRows] = await conn.execute(`SELECT project_role FROM ziding_project_members WHERE version_key=? AND user_id=? AND is_active=1 LIMIT 1`, [ZIDING_PROJECT_KEY, realId]);
      const role = String((memberRows as any[])[0]?.project_role || "");
      if (!(realUser?.role === "super_admin" || ["owner", "order_admin"].includes(role))) toError("FORBIDDEN", "无权查看该付款凭证");
      actorRole = "project_admin";
    }
    const result = await createZidingPaymentProofViewUrl(String(proof.object_key), 300, input.download);
    await auditAdmin(conn, actorId(ctx) || effectiveUserId, input.download ? "payment_proof_download" : "payment_proof_preview", "payment_proof", input.proofId, { orderId: Number(proof.order_id), actorRole });
    return { ...result, filename: `payment-proof-${proof.order_no}-${proof.id}.webp` };
  }),

  cancelMyOrder: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    assertNotViewingAs(ctx);
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    const order = await getOrderWithOwnership(conn, input.id);
    if (!order || Number(order.user_id) !== effectiveUserId) toError("NOT_FOUND", "订单不存在");
    if (!["awaiting_proof", "proof_rejected"].includes(String(order.status))) toError("BAD_REQUEST", "已确认收款的订单请联系管理员处理");
    await cancelOrderInternal(conn, order, { actorUserId: effectiveUserId, actorRole: "user", reason: "用户取消订单" });
    return { success: true };
  }),

  confirmReceipt: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    assertNotViewingAs(ctx);
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    const order = await getOrderWithOwnership(conn, input.id);
    if (!order || Number(order.user_id) !== effectiveUserId) toError("NOT_FOUND", "订单不存在");
    if (order.status !== "shipped") toError("BAD_REQUEST", "当前订单尚不能确认收货");
    await conn.execute(`UPDATE ziding_orders SET status='completed', completed_at=NOW() WHERE id=?`, [order.id]);
    await writeEvent(conn, { orderId: Number(order.id), actorUserId: effectiveUserId, actorRole: "user", eventType: "receipt_confirmed", text: "用户已确认收货，订单完成" });
    return { success: true };
  }),

  listNotifications: protectedProcedure.query(async ({ ctx }) => {
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    const [rows] = await conn.execute(`SELECT * FROM ziding_notifications WHERE version_key=? AND user_id=? ORDER BY created_at DESC LIMIT 100`, [ZIDING_PROJECT_KEY, effectiveUserId]);
    return ((rows as any[]) || []).map((row) => ({ id: Number(row.id), orderId: row.order_id == null ? null : Number(row.order_id), type: row.type, title: row.title, content: row.content, readAt: row.read_at, createdAt: row.created_at }));
  }),

  markNotificationRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { conn, effectiveUserId } = await getProjectAccess(ctx);
    await conn.execute(`UPDATE ziding_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=? AND version_key=? AND user_id=?`, [input.id, ZIDING_PROJECT_KEY, effectiveUserId]);
    return { success: true };
  }),

  adminDashboard: protectedProcedure.query(async ({ ctx }) => {
    const { conn } = await requireProjectAdmin(ctx, "orders");
    const [countRows, lowStockRows, pointsRows] = await Promise.all([
      conn.execute(`SELECT status, COUNT(*) AS count FROM ziding_orders WHERE version_key=? GROUP BY status`, [ZIDING_PROJECT_KEY]),
      conn.execute(`SELECT id,name,stock,reserved_stock FROM ziding_products WHERE version_key=? AND status=1 AND stock-reserved_stock<=5 ORDER BY stock-reserved_stock ASC LIMIT 20`, [ZIDING_PROJECT_KEY]),
      conn.execute(`SELECT COALESCE(SUM(delta_points),0) AS points FROM ziding_points_ledger WHERE version_key=? AND point_month=?`, [ZIDING_PROJECT_KEY, nowMonth()]),
    ]);
    const counts: Record<string, number> = {};
    for (const row of (countRows[0] as any[]) || []) counts[row.status] = Number(row.count);
    return {
      counts: { awaitingProof: counts.awaiting_proof || 0, proofSubmitted: counts.proof_submitted || 0, confirmed: counts.confirmed || 0, shipped: counts.shipped || 0, completed: counts.completed || 0 },
      lowStock: ((lowStockRows[0] as any[]) || []).map((row) => ({ id: Number(row.id), name: row.name, availableStock: Math.max(0, Number(row.stock) - Number(row.reserved_stock)) })),
      monthPointsIssued: MONEY((pointsRows[0] as any[])[0]?.points),
    };
  }),

  adminListOrders: protectedProcedure.input(z.object({ status: z.string().optional().default("all"), keyword: z.string().trim().max(64).optional().default("") }).optional()).query(async ({ ctx, input }) => {
    const { conn } = await requireProjectAdmin(ctx, "orders");
    const where = [`o.version_key=?`]; const values: any[] = [ZIDING_PROJECT_KEY];
    if (input?.status && input.status !== "all") { where.push(`o.status=?`); values.push(input.status); }
    if (input?.keyword) { where.push(`(o.order_no LIKE ? OR u.name LIKE ? OR u.username LIKE ?)`); const kw = `%${input.keyword}%`; values.push(kw, kw, kw); }
    const [rows] = await conn.execute(`SELECT o.*, u.name AS user_name, u.username FROM ziding_orders o LEFT JOIN users u ON u.id=o.user_id WHERE ${where.join(" AND ")} ORDER BY o.created_at DESC LIMIT 300`, values);
    return ((rows as any[]) || []).map((row) => ({ ...mapOrder(row), user: { id: Number(row.user_id), name: row.user_name || row.username || `用户${row.user_id}` } }));
  }),

  adminOrderDetail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const { conn } = await requireProjectAdmin(ctx, "orders");
    const order = await getOrderWithOwnership(conn, input.id);
    if (!order) toError("NOT_FOUND", "订单不存在");
    return getOrderDetail(conn, order);
  }),

  adminConfirmAndShipOrder: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        shippingCompany: z.string().trim().max(80).optional().default(""),
        trackingNo: z.string().trim().max(120).optional().default(""),
        noShipment: z.boolean().optional().default(false),
        remark: z.string().trim().max(500).optional().default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { conn, actorUserId } = await requireProjectAdmin(ctx, "orders");
      const txConn = await getDbTransactionConnection();
      if (!txConn)
        toError("INTERNAL_SERVER_ERROR", "订单履约服务暂不可用，请稍后重试");
      const month = nowMonth();
      let shippedOrder: any = null;
      let needsPaymentConfirmation = false;
      try {
        await txConn.beginTransaction();
        const [lockedRows] = await txConn.execute(
          `SELECT * FROM ziding_orders WHERE id=? AND version_key=? LIMIT 1 FOR UPDATE`,
          [input.id, ZIDING_PROJECT_KEY]
        );
        shippedOrder = (lockedRows as any[])[0];
        if (!shippedOrder) toError("NOT_FOUND", "订单不存在");
        needsPaymentConfirmation = shippedOrder.status === "proof_submitted";
        if (!needsPaymentConfirmation && shippedOrder.status !== "confirmed")
          toError("BAD_REQUEST", "当前订单不支持登记发货");
        if (!input.noShipment && (!input.shippingCompany || !input.trackingNo))
          toError("BAD_REQUEST", "请填写物流公司和物流单号，或选择无需物流");
        const settings = await getSettings(txConn);
        const days = Math.max(
          1,
          Math.min(Number(settings.auto_confirm_days || 7), 30)
        );
        if (needsPaymentConfirmation) {
          if (input.noShipment) {
            await txConn.execute(
              `UPDATE ziding_orders SET status='completed', payment_confirmed_at=NOW(), points_month=?, admin_remark=?, shipping_company=NULL, tracking_no=NULL, shipped_at=NULL, auto_complete_at=NULL, completed_at=NOW() WHERE id=?`,
              [month, input.remark || null, shippedOrder.id]
            );
          } else {
            await txConn.execute(
              `UPDATE ziding_orders SET status='shipped', payment_confirmed_at=NOW(), points_month=?, admin_remark=?, shipping_company=?, tracking_no=?, shipped_at=NOW(), auto_complete_at=DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id=?`,
              [
                month,
                input.remark || null,
                input.shippingCompany,
                input.trackingNo,
                days,
                shippedOrder.id,
              ]
            );
          }
          const [itemsRows] = await txConn.execute(
            `SELECT product_id,quantity FROM ziding_order_items WHERE order_id=?`,
            [shippedOrder.id]
          );
          for (const item of (itemsRows as any[]) || []) {
            await txConn.execute(
              `UPDATE ziding_products SET stock=GREATEST(0,stock-?), reserved_stock=GREATEST(0,reserved_stock-?) WHERE id=? AND version_key=?`,
              [
                Number(item.quantity),
                Number(item.quantity),
                Number(item.product_id),
                ZIDING_PROJECT_KEY,
              ]
            );
          }
          await writeEvent(txConn, {
            orderId: Number(shippedOrder.id),
            actorUserId,
            actorRole: "project_admin",
            eventType: "payment_confirmed",
            text: input.noShipment
              ? "已确认收款，无需物流，订单已完成"
              : "管理员已确认收款",
          });
        } else {
          if (input.noShipment) {
            await txConn.execute(
              `UPDATE ziding_orders SET status='completed', admin_remark=COALESCE(NULLIF(?,''),admin_remark), shipping_company=NULL, tracking_no=NULL, shipped_at=NULL, auto_complete_at=NULL, completed_at=NOW() WHERE id=?`,
              [input.remark, shippedOrder.id]
            );
          } else {
            await txConn.execute(
              `UPDATE ziding_orders SET status='shipped', admin_remark=COALESCE(NULLIF(?,''),admin_remark), shipping_company=?, tracking_no=?, shipped_at=NOW(), auto_complete_at=DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id=?`,
              [
                input.remark,
                input.shippingCompany,
                input.trackingNo,
                days,
                shippedOrder.id,
              ]
            );
          }
        }
        await writeEvent(txConn, {
          orderId: Number(shippedOrder.id),
          actorUserId,
          actorRole: "project_admin",
          eventType: input.noShipment
            ? "completed_without_shipping"
            : "shipped",
          text: input.noShipment
            ? "无需物流，订单已完成"
            : `已发货：${input.shippingCompany} ${input.trackingNo}`,
        });
        await txConn.commit();
      } catch (error) {
        await txConn.rollback().catch(() => undefined);
        throw error;
      } finally {
        if (typeof (txConn as any).release === "function")
          (txConn as any).release();
      }
      let pointsDelta = 0;
      if (needsPaymentConfirmation) {
        const pointResult = await reconcileMonthlyPoints(conn, {
          userId: Number(shippedOrder.user_id),
          month,
          triggerOrderId: Number(shippedOrder.id),
          actorUserId,
          note: `订单 ${shippedOrder.order_no} 确认收款并发货，重算当月积分`,
        });
        pointsDelta = pointResult.delta;
      }
      const confirmationText = input.noShipment
        ? "已确认收款，无需物流，订单已完成"
        : needsPaymentConfirmation
          ? "已确认收款并发货"
          : "已登记发货";
      await sendNotification(conn, Number(shippedOrder.user_id), {
        orderId: Number(shippedOrder.id),
        type: input.noShipment ? "order_completed" : "order_shipped",
        title: input.noShipment
          ? "付款已确认，订单已完成"
          : needsPaymentConfirmation
            ? "付款已确认，订单已发货"
            : "订单已发货",
        content: input.noShipment
          ? `订单 ${shippedOrder.order_no} 已确认收款，无需物流，订单已完成。${pointsDelta > 0 ? `本月积分增加 ${pointsDelta} 分。` : ""}`
          : `订单 ${shippedOrder.order_no}${confirmationText}：${input.shippingCompany} ${input.trackingNo}${pointsDelta > 0 ? `。本月积分增加 ${pointsDelta} 分。` : ""}`,
      });
      await auditAdmin(
        conn,
        actorUserId,
        input.noShipment
          ? "order_completed_without_shipping"
          : needsPaymentConfirmation
            ? "order_confirmed_and_shipped"
            : "order_shipped",
        "order",
        input.id,
        {
          shippingCompany: input.shippingCompany,
          trackingNo: input.trackingNo,
          noShipment: input.noShipment,
          remark: input.remark,
        }
      );
      return { success: true };
    }),

  adminReviewOrder: protectedProcedure.input(z.object({ id: z.number().int().positive(), action: z.enum(["confirm", "reject"]), remark: z.string().trim().max(500).optional().default("") })).mutation(async ({ ctx, input }) => {
    const { conn, actorUserId } = await requireProjectAdmin(ctx, "orders");
    const order = await getOrderWithOwnership(conn, input.id);
    if (!order) toError("NOT_FOUND", "订单不存在");
    if (order.status !== "proof_submitted") toError("BAD_REQUEST", "当前订单不处于待确认收款状态");
    if (input.action === "reject") {
      await conn.execute(`UPDATE ziding_orders SET status='proof_rejected', reject_reason=?, admin_remark=? WHERE id=?`, [input.remark || "请补充清晰付款凭证", input.remark || null, order.id]);
      await writeEvent(conn, { orderId: Number(order.id), actorUserId, actorRole: "project_admin", eventType: "proof_rejected", text: `付款凭证待补充${input.remark ? `：${input.remark}` : ""}` });
      await sendNotification(conn, Number(order.user_id), { orderId: Number(order.id), type: "proof_rejected", title: "付款凭证需要补充", content: input.remark || "请重新上传清晰、完整的付款凭证。" });
    } else {
      const month = nowMonth();
      const txConn = await getDbTransactionConnection();
      if (!txConn) toError("INTERNAL_SERVER_ERROR", "订单审核服务暂不可用，请稍后重试");
      let confirmedOrder = order;
      try {
        await txConn.beginTransaction();
        const [lockedRows] = await txConn.execute(`SELECT * FROM ziding_orders WHERE id=? AND version_key=? LIMIT 1 FOR UPDATE`, [order.id, ZIDING_PROJECT_KEY]);
        confirmedOrder = (lockedRows as any[])[0];
        if (!confirmedOrder) toError("NOT_FOUND", "订单不存在");
        if (confirmedOrder.status !== "proof_submitted") toError("BAD_REQUEST", "当前订单不处于待确认收款状态");
        await txConn.execute(`UPDATE ziding_orders SET status='confirmed', payment_confirmed_at=NOW(), points_month=?, admin_remark=? WHERE id=?`, [month, input.remark || null, confirmedOrder.id]);
        const [itemsRows] = await txConn.execute(`SELECT product_id,quantity FROM ziding_order_items WHERE order_id=?`, [confirmedOrder.id]);
        for (const item of (itemsRows as any[]) || []) {
          await txConn.execute(`UPDATE ziding_products SET stock=GREATEST(0,stock-?), reserved_stock=GREATEST(0,reserved_stock-?) WHERE id=? AND version_key=?`, [Number(item.quantity), Number(item.quantity), Number(item.product_id), ZIDING_PROJECT_KEY]);
        }
        await writeEvent(txConn, { orderId: Number(confirmedOrder.id), actorUserId, actorRole: "project_admin", eventType: "payment_confirmed", text: "管理员已确认收款，等待发货" });
        await txConn.commit();
      } catch (error) {
        await txConn.rollback().catch(() => undefined);
        throw error;
      } finally {
        if (typeof (txConn as any).release === "function") (txConn as any).release();
      }
      const pointResult = await reconcileMonthlyPoints(conn, { userId: Number(confirmedOrder.user_id), month, triggerOrderId: Number(confirmedOrder.id), actorUserId, note: `订单 ${confirmedOrder.order_no} 确认收款，重算当月积分` });
      await sendNotification(conn, Number(confirmedOrder.user_id), { orderId: Number(confirmedOrder.id), type: "payment_confirmed", title: "付款已确认", content: `订单 ${confirmedOrder.order_no} 已确认收款，等待发货。${pointResult.delta > 0 ? `本月积分增加 ${pointResult.delta} 分。` : ""}` });
    }
    await auditAdmin(conn, actorUserId, input.action === "confirm" ? "order_payment_confirmed" : "order_payment_rejected", "order", input.id, { remark: input.remark });
    return { success: true };
  }),

  adminShipOrder: protectedProcedure.input(z.object({ id: z.number().int().positive(), shippingCompany: z.string().trim().min(1).max(80), trackingNo: z.string().trim().min(1).max(120) })).mutation(async ({ ctx, input }) => {
    const { conn, actorUserId } = await requireProjectAdmin(ctx, "orders");
    const order = await getOrderWithOwnership(conn, input.id);
    if (!order) toError("NOT_FOUND", "订单不存在");
    if (order.status !== "confirmed") toError("BAD_REQUEST", "仅已确认收款的订单可发货");
    const settings = await getSettings(conn); const days = Math.max(1, Math.min(Number(settings.auto_confirm_days || 7), 30));
    await conn.execute(`UPDATE ziding_orders SET status='shipped', shipping_company=?, tracking_no=?, shipped_at=NOW(), auto_complete_at=DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id=?`, [input.shippingCompany, input.trackingNo, days, order.id]);
    await writeEvent(conn, { orderId: Number(order.id), actorUserId, actorRole: "project_admin", eventType: "shipped", text: `已发货：${input.shippingCompany} ${input.trackingNo}` });
    await sendNotification(conn, Number(order.user_id), { orderId: Number(order.id), type: "order_shipped", title: "订单已发货", content: `订单 ${order.order_no} 已发货：${input.shippingCompany} ${input.trackingNo}` });
    await auditAdmin(conn, actorUserId, "order_shipped", "order", input.id, { shippingCompany: input.shippingCompany });
    return { success: true };
  }),

  adminCancelOrder: protectedProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(1).max(500) })).mutation(async ({ ctx, input }) => {
    const { conn, actorUserId } = await requireProjectAdmin(ctx, "orders");
    const order = await getOrderWithOwnership(conn, input.id);
    if (!order) toError("NOT_FOUND", "订单不存在");
    if (["shipped", "completed", "cancelled"].includes(String(order.status))) toError("BAD_REQUEST", "当前订单状态不支持直接取消");
    await cancelOrderInternal(conn, order, { actorUserId, actorRole: "project_admin", reason: input.reason });
    await auditAdmin(conn, actorUserId, "order_cancelled", "order", input.id, { reason: input.reason });
    return { success: true };
  }),

  adminListProducts: protectedProcedure.query(async ({ ctx }) => {
    const { conn } = await requireProjectAdmin(ctx, "catalog");
    const [rows] = await conn.execute(`SELECT * FROM ziding_products WHERE version_key=? ORDER BY sort_order ASC,id DESC`, [ZIDING_PROJECT_KEY]);
    return ((rows as any[]) || []).map((row) => mapProduct(row, "senior"));
  }),

  adminSaveProduct: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(160), subtitle: z.string().trim().max(240).optional().default(""), description: z.string().trim().max(10000).optional().default(""), imageUrl: z.string().trim().max(1024).optional().default(""), priceJunior: z.number().min(0).max(99999999), priceSenior: z.number().min(0).max(99999999).nullable().optional(), originalPrice: z.number().min(0).max(99999999).nullable().optional(), stock: z.number().int().min(0).max(1000000), earnsPoints: z.boolean().default(true), status: z.boolean().default(true), sortOrder: z.number().int().min(-99999).max(99999).default(0) })).mutation(async ({ ctx, input }) => {
    const { conn, actorUserId } = await requireProjectAdmin(ctx, "catalog");
    if (input.id) {
      await conn.execute(`UPDATE ziding_products SET name=?,subtitle=?,description=?,image_url=?,price_junior=?,price_senior=?,original_price=?,stock=GREATEST(?,reserved_stock),earns_points=?,status=?,sort_order=?,updated_by=? WHERE id=? AND version_key=?`,
        [input.name, input.subtitle, input.description, input.imageUrl, MONEY(input.priceJunior), input.priceSenior == null ? null : MONEY(input.priceSenior), input.originalPrice == null ? null : MONEY(input.originalPrice), input.stock, input.earnsPoints ? 1 : 0, input.status ? 1 : 0, input.sortOrder, actorUserId, input.id, ZIDING_PROJECT_KEY]);
      await auditAdmin(conn, actorUserId, "product_updated", "product", input.id, { name: input.name });
      return { id: input.id };
    }
    const [result] = await conn.execute(`INSERT INTO ziding_products (version_key,name,subtitle,description,image_url,price_junior,price_senior,original_price,stock,earns_points,status,sort_order,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ZIDING_PROJECT_KEY, input.name, input.subtitle, input.description, input.imageUrl, MONEY(input.priceJunior), input.priceSenior == null ? null : MONEY(input.priceSenior), input.originalPrice == null ? null : MONEY(input.originalPrice), input.stock, input.earnsPoints ? 1 : 0, input.status ? 1 : 0, input.sortOrder, actorUserId, actorUserId]);
    const id = Number((result as any).insertId); await auditAdmin(conn, actorUserId, "product_created", "product", id, { name: input.name }); return { id };
  }),

  adminUploadProductImage: protectedProcedure.input(z.object({ imageData: z.string().min(32).max(15_000_000) })).mutation(async ({ ctx, input }) => {
    const { conn, actorUserId } = await requireProjectAdmin(ctx, "catalog");
    const key = `assets/ziding-commercial-alliance/products/${randomUUID()}.webp`;
    const url = await uploadImageToCOS(input.imageData, "yaban-shop" as any, key);
    await auditAdmin(conn, actorUserId, "product_image_uploaded", "product_image", key);
    return { url };
  }),

  adminListMembers: protectedProcedure.query(async ({ ctx }) => {
    const { conn } = await requireProjectAdmin(ctx, "all");
    const [rows] = await conn.execute(`SELECT m.*,u.name,u.username,u.avatar FROM ziding_project_members m LEFT JOIN users u ON u.id=m.user_id WHERE m.version_key=? ORDER BY FIELD(m.project_role,'owner','order_admin','catalog_admin','user'),m.updated_at DESC`, [ZIDING_PROJECT_KEY]);
    return ((rows as any[]) || []).map((row) => ({ userId: Number(row.user_id), name: row.name || row.username || `用户${row.user_id}`, username: row.username || "", avatar: row.avatar || "", tier: row.member_tier as MemberTier, role: row.project_role as ProjectRole, isActive: Number(row.is_active) === 1, updatedAt: row.updated_at }));
  }),

  adminSearchUsers: protectedProcedure.input(z.object({ keyword: z.string().trim().min(1).max(50) })).query(async ({ ctx, input }) => {
    const { conn } = await requireProjectAdmin(ctx, "all");
    const kw = `%${input.keyword}%`;
    const [rows] = await conn.execute(`SELECT id,name,username,avatar FROM users WHERE name LIKE ? OR username LIKE ? ORDER BY name ASC LIMIT 20`, [kw, kw]);
    return ((rows as any[]) || []).map((row) => ({ userId: Number(row.id), name: row.name || row.username || `用户${row.id}`, username: row.username || "", avatar: row.avatar || "" }));
  }),

  adminCheckMemberUsername: protectedProcedure.input(z.object({
    username: z.string().trim().min(1).max(20).regex(/^[\u4e00-\u9fa5a-zA-Z0-9_]+$/),
  })).query(async ({ ctx, input }) => {
    const { conn } = await requireProjectAdmin(ctx, "all");
    const username = input.username.trim();
    const [rows] = await conn.execute(`SELECT id FROM users WHERE username=? LIMIT 1`, [username]);
    return { username, available: !((rows as any[]) || []).length };
  }),

  adminCreateMember: protectedProcedure.input(z.object({
    username: z.string().trim().min(1, "请填写用户名").max(20, "用户名最多20个字符").regex(/^[\u4e00-\u9fa5a-zA-Z0-9_]+$/, "用户名只能包含汉字、字母、数字和下划线"),
    nickname: z.string().trim().max(50, "昵称最多50个字符").optional().default(""),
  })).mutation(async ({ ctx, input }) => {
    const { actorUserId } = await requireProjectAdmin(ctx, "all");
    const initialPassword = newZidingInitialPassword();
    const passwordHash = await hashPassword(initialPassword);
    const txConn = await getDbTransactionConnection();
    if (!txConn) toError("INTERNAL_SERVER_ERROR", "会员服务暂不可用，请稍后重试");
    try {
      await txConn.beginTransaction();
      const [existingRows] = await txConn.execute(`SELECT id FROM users WHERE username=? LIMIT 1 FOR UPDATE`, [input.username]);
      if ((existingRows as any[]).length) toError("BAD_REQUEST", "用户名已存在，请换一个用户名");
      // 不论由哪位紫鼎管理员执行开通，新会员均统一归属项目负责人盈盈（susan）。
      // 版本字段刻意留空，由现有推荐链继承负责人名下的紫鼎版本设置。
      const referrerUserId = ZIDING_OWNER_USER_ID;
      const [referrerRows] = await txConn.execute(`SELECT id FROM users WHERE id=? LIMIT 1 FOR UPDATE`, [referrerUserId]);
      if (!((referrerRows as any[]) || []).length) toError("INTERNAL_SERVER_ERROR", "紫鼎项目负责人账号不存在，无法开通会员");
      const nickname = input.nickname || input.username;
      const [created] = await txConn.execute(
        `INSERT INTO users (openId,username,passwordHash,name,loginMethod,role,version_key,version_switch_scope,invited_by_user_id,invited_at,lastSignedIn)
         VALUES (?,?,?,?, 'password','parent',NULL,NULL,?,NOW(),NOW())`,
        [`ziding_${randomUUID()}`, input.username, passwordHash, nickname, referrerUserId],
      );
      const userId = Number((created as any).insertId);
      await txConn.execute(`UPDATE users SET invite_count=COALESCE(invite_count,0)+1 WHERE id=?`, [referrerUserId]);
      await txConn.execute(
        `INSERT INTO ziding_project_members (version_key,user_id,member_tier,project_role,is_active,created_by,updated_by)
         VALUES (?,?,'junior','user',1,?,?)`,
        [ZIDING_PROJECT_KEY, userId, actorUserId, actorUserId],
      );
      await auditAdmin(txConn, actorUserId, "member_created", "member", userId, { username: input.username, nickname: input.nickname || null, tier: "junior", referrerUserId });
      await txConn.commit();
      return { userId, username: input.username, nickname, initialPassword };
    } catch (error) {
      await txConn.rollback();
      throw error;
    } finally {
      if (typeof (txConn as any).release === "function") (txConn as any).release();
    }
  }),

  adminSaveMember: protectedProcedure.input(z.object({ userId: z.number().int().positive(), tier: z.enum(["junior", "senior"]), role: z.enum(["user", "order_admin", "catalog_admin", "owner"]), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { conn, actorUserId, role: actorRole } = await requireProjectAdmin(ctx, "all");
    if (input.role === "owner" && actorRole !== "owner" && (ctx.realUser || ctx.user)?.role !== "super_admin") toError("FORBIDDEN", "仅项目负责人可授予负责人权限");
    if (input.userId === ZIDING_OWNER_USER_ID && (!input.isActive || input.role !== "owner")) toError("BAD_REQUEST", "紫鼎项目负责人不能在此处被停用或降级");
    await ensureZidingVersionAccess(conn, input.userId, input.isActive);
    await conn.execute(`INSERT INTO ziding_project_members (version_key,user_id,member_tier,project_role,is_active,created_by,updated_by) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE member_tier=VALUES(member_tier),project_role=VALUES(project_role),is_active=VALUES(is_active),updated_by=VALUES(updated_by)`,
      [ZIDING_PROJECT_KEY, input.userId, input.tier, input.role, input.isActive ? 1 : 0, actorUserId, actorUserId]);
    await auditAdmin(conn, actorUserId, "member_updated", "member", input.userId, { tier: input.tier, role: input.role, isActive: input.isActive });
    return { success: true };
  }),

  adminListPointRules: protectedProcedure.query(async ({ ctx }) => {
    const { conn } = await requireProjectAdmin(ctx, "all");
    const [rows] = await conn.execute(`SELECT * FROM ziding_point_rules WHERE version_key=? ORDER BY effective_month DESC,min_amount ASC,sort_order ASC,id ASC`, [ZIDING_PROJECT_KEY]);
    return ((rows as any[]) || []).map((row) => ({ id: Number(row.id), minAmount: MONEY(row.min_amount), multiplier: Number(row.multiplier), ruleNote: row.rule_note || "", effectiveMonth: row.effective_month, enabled: Number(row.enabled) === 1, sortOrder: Number(row.sort_order) }));
  }),

  adminSavePointRule: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), minAmount: z.number().min(0).max(99999999), multiplier: z.number().min(0).max(100), ruleNote: z.string().trim().max(255).optional().default(""), effectiveMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), enabled: z.boolean().default(true), sortOrder: z.number().int().min(-99999).max(99999).default(0) })).mutation(async ({ ctx, input }) => {
    const { conn, actorUserId } = await requireProjectAdmin(ctx, "all");
    if (input.id) {
      await conn.execute(`UPDATE ziding_point_rules SET min_amount=?,multiplier=?,rule_note=?,effective_month=?,enabled=?,sort_order=?,updated_by=? WHERE id=? AND version_key=?`, [MONEY(input.minAmount), input.multiplier, input.ruleNote, input.effectiveMonth, input.enabled ? 1 : 0, input.sortOrder, actorUserId, input.id, ZIDING_PROJECT_KEY]);
      await auditAdmin(conn, actorUserId, "point_rule_updated", "point_rule", input.id, input); return { id: input.id };
    }
    const [result] = await conn.execute(`INSERT INTO ziding_point_rules (version_key,min_amount,multiplier,rule_note,effective_month,enabled,sort_order,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?)`, [ZIDING_PROJECT_KEY, MONEY(input.minAmount), input.multiplier, input.ruleNote, input.effectiveMonth, input.enabled ? 1 : 0, input.sortOrder, actorUserId, actorUserId]);
    const id = Number((result as any).insertId); await auditAdmin(conn, actorUserId, "point_rule_created", "point_rule", id, input); return { id };
  }),

  adminGetSettings: protectedProcedure.query(async ({ ctx }) => {
    const { conn } = await requireProjectAdmin(ctx, "all"); const settings = await getSettings(conn);
    return { paymentInstruction: settings.payment_instruction || "", stockHoldHours: Number(settings.stock_hold_hours || 24), autoConfirmDays: Number(settings.auto_confirm_days || 7) };
  }),

  adminSaveSettings: protectedProcedure.input(z.object({ paymentInstruction: z.string().trim().min(1).max(5000), stockHoldHours: z.number().int().min(1).max(168), autoConfirmDays: z.number().int().min(1).max(30) })).mutation(async ({ ctx, input }) => {
    const { conn, actorUserId } = await requireProjectAdmin(ctx, "all");
    await conn.execute(`UPDATE ziding_settings SET payment_instruction=?,stock_hold_hours=?,auto_confirm_days=?,updated_by=? WHERE version_key=?`, [input.paymentInstruction, input.stockHoldHours, input.autoConfirmDays, actorUserId, ZIDING_PROJECT_KEY]);
    await auditAdmin(conn, actorUserId, "settings_updated", "settings", ZIDING_PROJECT_KEY, input); return { success: true };
  }),
});
