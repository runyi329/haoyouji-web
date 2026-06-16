/**
 * 牙伴齿科管理 - 权限体系 后端路由（矩阵驱动版 v3）
 *
 * 核心理念（按用户需求重构）：
 *   - 角色仅作"默认权限模板"与身份徽标；真实权限以"成员×权限矩阵"逐人逐项设置为准。
 *   - 权限点分两类：
 *       toggle（开关型）：只有 开/关 两态，如顾客建档、影像删除、数据导出、员工管理…
 *       scope （范围型）：三档 全部(all)/仅自己(self)/不允许(none)，如顾客管理、随访、影像查看…
 *   - 生效优先级：个人定制 > 角色默认模板(多角色取并集，取更宽松) > 系统兜底。
 *   - 全部按医院(tenant_id)隔离；院长仅可管理自己名下医院，且多店分别设置。
 *   - 权限主体分两类：员工(staff) 与 顾客(customer)，两个 Tab 各一套权限定义与矩阵。
 *
 * 存储：
 *   - yaban_role_perm_switch：角色默认模板覆盖（scope 列；兼容旧 enabled）
 *   - yaban_member_perm_switch：个人定制（scope 列；兼容旧 enabled）
 *   - yaban_customer_perm_switch：顾客个人权限（scope 列）
 *
 * 设计原则：原生 SQL；严禁 Emoji；数据驱动便于未来新增权限项与新项目模块。
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

const DEFAULT_TENANT_ID = 1;

// 诊所内拥有员工/权限管理能力的角色（院长/股东）
const CLINIC_MANAGE_ROLES = ["owner"];

// 三档取值
export type Scope = "all" | "self" | "none";

// ============ 权限点全集 ============
// type: "toggle"=开关型(all/none)，"scope"=范围型(all/self/none)
// subject: "staff"=员工权限，"customer"=顾客权限
export type PermType = "toggle" | "scope";
export interface PermDef {
  key: string;
  name: string;
  group: string;
  type: PermType;
  subject: "staff" | "customer";
  desc?: string;
}

// 员工权限定义
export const STAFF_PERM_DEFS: PermDef[] = [
  { key: "patient", name: "顾客管理", group: "顾客", type: "scope", subject: "staff", desc: "查看/编辑顾客资料的范围" },
  { key: "patient_create", name: "顾客建档", group: "顾客", type: "toggle", subject: "staff", desc: "能否新增顾客" },
  { key: "patient_edit", name: "修改顾客", group: "顾客", type: "scope", subject: "staff", desc: "可修改全部顾客 / 仅自己登记的" },
  { key: "patient_delete", name: "删除顾客", group: "顾客", type: "scope", subject: "staff", desc: "可删除全部 / 仅自己登记的" },
  { key: "followup", name: "随访管理", group: "顾客", type: "scope", subject: "staff", desc: "随访记录的可见与操作范围" },
  { key: "media_view", name: "影像查看", group: "影像", type: "scope", subject: "staff", desc: "可看全部 / 仅自己上传的影像" },
  { key: "media_upload", name: "影像上传", group: "影像", type: "toggle", subject: "staff", desc: "能否上传影像" },
  { key: "media_delete", name: "影像删除", group: "影像", type: "scope", subject: "staff", desc: "可删全部 / 仅自己上传的影像" },
  { key: "schedule", name: "预约排班", group: "运营", type: "scope", subject: "staff", desc: "排班的可见与操作范围" },
  { key: "shop_order", name: "商城订单", group: "运营", type: "toggle", subject: "staff", desc: "能否处理商城订单" },
  { key: "shop_verify", name: "到店核销", group: "运营", type: "toggle", subject: "staff", desc: "能否核销到店订单" },
  { key: "finance", name: "财务营收", group: "运营", type: "scope", subject: "staff", desc: "财务数据可见范围" },
  { key: "data_export", name: "数据导出", group: "运营", type: "toggle", subject: "staff", desc: "能否导出数据" },
  { key: "inventory", name: "库存管理", group: "运营", type: "toggle", subject: "staff", desc: "能否查看与操作库存出入库" },
  { key: "member_manage", name: "员工管理", group: "管理", type: "toggle", subject: "staff", desc: "能否管理员工与权限" },
  { key: "clinic_setting", name: "门诊设置", group: "管理", type: "toggle", subject: "staff", desc: "能否修改门诊设置" },
];

// 顾客权限定义（顾客在该门诊可被开通的权限）
export const CUSTOMER_PERM_DEFS: PermDef[] = [
  { key: "c_view_record", name: "查看本人病历", group: "本人资料", type: "toggle", subject: "customer", desc: "能否查看自己的病历" },
  { key: "c_view_media", name: "查看本人影像", group: "本人资料", type: "toggle", subject: "customer", desc: "能否查看自己的影像" },
  { key: "c_view_bill", name: "查看本人账单", group: "本人资料", type: "toggle", subject: "customer", desc: "能否查看自己的消费与账单" },
  { key: "c_view_followup", name: "查看随访计划", group: "本人资料", type: "toggle", subject: "customer", desc: "能否查看自己的随访计划" },
  { key: "c_book", name: "在线预约", group: "互动", type: "toggle", subject: "customer", desc: "能否在线预约" },
  { key: "c_shop_order", name: "商城下单", group: "互动", type: "toggle", subject: "customer", desc: "能否在商城下单" },
];

// ============ 平台层权限定义（独立于医院，专用于创始股东 co_founder）============
// 创始人(founder) 永远全开、不受此表限制；创始股东(co_founder) 默认仅看汇总、其余全关。
// type 全部为 toggle：开=允许，关=在其视角内隐身。
export interface PlatformPermDef {
  key: string;
  name: string;
  group: string;
  desc: string;
  defaultOn: boolean; // 新创始股东的默认值
}
export const PLATFORM_PERM_DEFS: PlatformPermDef[] = [
  { key: "view_dashboard", name: "查看平台大数据汇总", group: "数据查看", desc: "查看全平台经营汇总数据（默认开放）", defaultOn: true },
  { key: "view_clinic_detail", name: "查看各医院经营明细", group: "数据查看", desc: "下钻查看单家医院的经营明细", defaultOn: false },
  { key: "view_customer", name: "查看顾客名单与明细", group: "数据查看", desc: "查看各院顾客名单与档案明细", defaultOn: false },
  { key: "view_finance", name: "查看财务/分红明细", group: "数据查看", desc: "查看平台财务与分红明细", defaultOn: false },
  { key: "unmask_sensitive", name: "查看敏感信息(不脱敏)", group: "数据查看", desc: "关闭时手机号/证件/精确金额等脱敏显示", defaultOn: false },
  { key: "export_data", name: "导出/下载平台数据", group: "数据导出", desc: "导出或下载平台级数据", defaultOn: false },
  { key: "backup_data", name: "备份平台数据", group: "数据导出", desc: "备份平台级数据", defaultOn: false },
  { key: "manage_team", name: "管理创始团队", group: "管理", desc: "任命/撤销创始团队成员", defaultOn: false },
  { key: "approve_clinic", name: "审批/管理医院", group: "管理", desc: "审批开通、命名编辑、新建医院", defaultOn: false },
  { key: "manage_perm_matrix", name: "管理医院权限矩阵", group: "管理", desc: "跨院修改员工/顾客权限矩阵", defaultOn: false },
];
export const PLATFORM_PERM_MAP: Record<string, PlatformPermDef> = Object.fromEntries(
  PLATFORM_PERM_DEFS.map((p) => [p.key, p])
);
export const PLATFORM_DEFAULT: Record<string, boolean> = Object.fromEntries(
  PLATFORM_PERM_DEFS.map((p) => [p.key, p.defaultOn])
);

// 全部权限定义（合集，供建表与校验）
export const PERM_DEFS = STAFF_PERM_DEFS; // 兼容旧引用：默认指员工权限
export const ALL_STAFF_PERM_KEYS = STAFF_PERM_DEFS.map((p) => p.key);
export const ALL_CUSTOMER_PERM_KEYS = CUSTOMER_PERM_DEFS.map((p) => p.key);
export const ALL_PERM_KEYS = ALL_STAFF_PERM_KEYS; // 兼容旧引用

// 快速取某权限定义
const STAFF_PERM_MAP: Record<string, PermDef> = Object.fromEntries(STAFF_PERM_DEFS.map((p) => [p.key, p]));
const CUSTOMER_PERM_MAP: Record<string, PermDef> = Object.fromEntries(CUSTOMER_PERM_DEFS.map((p) => [p.key, p]));

// 某权限允许的取值集合
function allowedScopes(def: PermDef): Scope[] {
  return def.type === "toggle" ? ["all", "none"] : ["all", "self", "none"];
}

// ============ 角色定义 ============
export const ROLE_DEFS: { role_key: string; name: string; description: string; sort: number }[] = [
  { role_key: "owner", name: "院长", description: "诊所最高运营权限，可管理员工与权限开关，可多人同级", sort: 1 },
  { role_key: "shareholder", name: "股东", description: "出资方/投资人，默认以查看营收汇总与数据为主，不参与日常运营管理", sort: 2 },
  { role_key: "doctor", name: "医生", description: "顾客管理、随访、排班、影像、核销", sort: 3 },
  { role_key: "nurse", name: "护士", description: "椅旁配合、随访、影像查看上传、核销", sort: 4 },
  { role_key: "assistant", name: "助理", description: "行政辅助、随访、排班、影像查看上传、核销", sort: 5 },
  { role_key: "receptionist", name: "前台", description: "预约排班、商城订单核销、顾客建档", sort: 6 },
  { role_key: "finance", name: "财务", description: "财务营收、商城订单、数据导出", sort: 7 },
];

// 各角色默认权限模板（scope 取值）。未列出的权限默认 none。
// 范围型默认给 all 或 self；开关型给 all(=开) 或 none(=关)。
type RolePermTemplate = Record<string, Scope>;
export const ROLE_DEFAULT_PERMS: Record<string, RolePermTemplate> = {
  // 院长：全部 all
  owner: Object.fromEntries(ALL_STAFF_PERM_KEYS.map((k) => [k, "all"])) as RolePermTemplate,
  // 股东：出资方/投资人，默认以查看为主（财务、数据导出），不管理日常运营与员工
  shareholder: {
    patient: "none", patient_create: "none", patient_edit: "none", patient_delete: "none",
    followup: "none", media_view: "none", media_upload: "none", media_delete: "none",
    schedule: "none", shop_order: "none", shop_verify: "none", finance: "all",
    inventory: "none",
    data_export: "all", member_manage: "none", clinic_setting: "none",
  },
  // 医生：顾客/随访/影像 全部，建档可，删除仅自己，无财务/导出/员工管理/门诊设置
  doctor: {
    patient: "all", patient_create: "all", patient_edit: "all", patient_delete: "self",
    followup: "all", media_view: "all", media_upload: "all", media_delete: "self",
    schedule: "all", shop_order: "none", shop_verify: "all", finance: "none",
    inventory: "all",
    data_export: "none", member_manage: "none", clinic_setting: "none",
  },
  // 护士：随访/影像 全部，顾客查看全部但修改仅自己，无删除
  nurse: {
    patient: "all", patient_create: "none", patient_edit: "self", patient_delete: "none",
    followup: "all", media_view: "all", media_upload: "all", media_delete: "none",
    schedule: "all", shop_order: "none", shop_verify: "all", finance: "none",
    inventory: "all",
    data_export: "none", member_manage: "none", clinic_setting: "none",
  },
  // 助理：行政辅助，随访/影像 全部，顾客查看全部但修改仅自己，无删除
  assistant: {
    patient: "all", patient_create: "none", patient_edit: "self", patient_delete: "none",
    followup: "all", media_view: "all", media_upload: "all", media_delete: "none",
    schedule: "all", shop_order: "none", shop_verify: "all", finance: "none",
    inventory: "all",
    data_export: "none", member_manage: "none", clinic_setting: "none",
  },
  // 前台：建档可，顾客资料修改仅自己登记的，排班/商城/核销
  receptionist: {
    patient: "all", patient_create: "all", patient_edit: "self", patient_delete: "none",
    followup: "self", media_view: "none", media_upload: "none", media_delete: "none",
    schedule: "all", shop_order: "all", shop_verify: "all", finance: "none",
    inventory: "all",
    data_export: "none", member_manage: "none", clinic_setting: "none",
  },
  // 财务：财务全部、商城订单、数据导出
  finance: {
    patient: "none", patient_create: "none", patient_edit: "none", patient_delete: "none",
    followup: "none", media_view: "none", media_upload: "none", media_delete: "none",
    schedule: "none", shop_order: "all", shop_verify: "none", finance: "all",
    inventory: "all",
    data_export: "all", member_manage: "none", clinic_setting: "none",
  },
};

// 顾客默认权限模板（新顾客默认可看本人资料、可预约下单）
export const CUSTOMER_DEFAULT_PERMS: RolePermTemplate = {
  c_view_record: "all", c_view_media: "all", c_view_bill: "all", c_view_followup: "all",
  c_book: "all", c_shop_order: "all",
};

// scope 合并：取更宽松（all > self > none）
function mergeScope(a: Scope, b: Scope): Scope {
  const rank: Record<Scope, number> = { all: 2, self: 1, none: 0 };
  return rank[a] >= rank[b] ? a : b;
}

// 把旧布尔 enabled 归一化为 scope
function boolToScope(enabled: number | boolean, def?: PermDef): Scope {
  const on = !!enabled;
  if (!on) return "none";
  return "all";
}

// 校验并规整一个 scope 值到该权限允许的集合
function normalizeScope(def: PermDef, raw: string): Scope {
  const allowed = allowedScopes(def);
  if ((allowed as string[]).includes(raw)) return raw as Scope;
  // toggle 不允许 self -> 视作 all
  if (def.type === "toggle" && raw === "self") return "all";
  return "none";
}

// ==================== 建表与初始化 ====================
let initialized = false;
export async function ensureRoleTables(conn: any) {
  if (initialized) return;

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_clinic_role (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 0,
      role_key VARCHAR(32) NOT NULL,
      name VARCHAR(64) NOT NULL,
      description VARCHAR(255) DEFAULT NULL,
      sort INT DEFAULT 0,
      is_builtin TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_tenant_role (tenant_id, role_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴诊所角色'
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_clinic_member (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      user_id INT NOT NULL,
      role_key VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      invited_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_tenant_user (tenant_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴诊所成员'
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_platform_role (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      role_key VARCHAR(32) NOT NULL DEFAULT 'founder',
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      granted_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_role (user_id, role_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴平台级角色(创始人)'
  `);

  // 角色默认模板覆盖（scope 列）
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_role_perm_switch (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      role_key VARCHAR(32) NOT NULL,
      perm_key VARCHAR(32) NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      scope VARCHAR(8) DEFAULT NULL,
      updated_by INT DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_role_perm (tenant_id, role_key, perm_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴按角色权限模板'
  `);

  // 个人定制（scope 列）
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_member_perm_switch (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      user_id INT NOT NULL,
      perm_key VARCHAR(32) NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      scope VARCHAR(8) DEFAULT NULL,
      updated_by INT DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_perm (tenant_id, user_id, perm_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴按个人权限定制'
  `);

  // 顾客个人权限（scope 列）
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_customer_perm_switch (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      user_id INT NOT NULL,
      perm_key VARCHAR(32) NOT NULL,
      scope VARCHAR(8) NOT NULL DEFAULT 'all',
      updated_by INT DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_cust_perm (tenant_id, user_id, perm_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴顾客个人权限'
  `);

  // 平台层权限（创始股东的逼项开关，独立于医院）
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_platform_perm (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      perm_key VARCHAR(40) NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 0,
      updated_by INT DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_pperm (user_id, perm_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴平台层权限(创始股东)'
  `);

  // 兼容升级：为旧表补 scope 列（若不存在）
  await ensureScopeColumn(conn, "yaban_role_perm_switch");
  await ensureScopeColumn(conn, "yaban_member_perm_switch");
  // 兼容升级：为 yaban_clinic_role 补 tenant_id 列（若不存在），内置角色 tenant_id=0
  await ensureRoleTenantColumn(conn);

  // 同步内置角色定义（tenant_id=0 表示全局内置）
  for (const r of ROLE_DEFS) {
    await conn.execute(
      `INSERT INTO yaban_clinic_role (tenant_id, role_key, name, description, sort, is_builtin)
       VALUES (0, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort=VALUES(sort)`,
      [r.role_key, r.name, r.description, r.sort]
    );
  }
  await conn.execute(`UPDATE yaban_clinic_member SET role_key='owner' WHERE role_key='admin'`);
  await conn.execute(`UPDATE yaban_clinic_member SET role_key='receptionist' WHERE role_key='staff'`);
  await conn.execute(`DELETE FROM yaban_clinic_role WHERE role_key IN ('admin','staff') AND tenant_id=0`);

  await conn.execute(
    `INSERT INTO yaban_platform_role (user_id, role_key, status, granted_by)
     VALUES (870413, 'founder', 'active', 870413)
     ON DUPLICATE KEY UPDATE status='active'`
  );

  initialized = true;
}

async function ensureRoleTenantColumn(conn: any) {
  try {
    const [cols] = (await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='yaban_clinic_role' AND COLUMN_NAME='tenant_id'`
    )) as any;
    if (!(cols as any[])[0]) {
      await conn.execute(`ALTER TABLE yaban_clinic_role ADD COLUMN tenant_id INT NOT NULL DEFAULT 0 AFTER id`);
      // 旧唯一键为 role_key 单列，需替换为 (tenant_id, role_key)
      try { await conn.execute(`ALTER TABLE yaban_clinic_role DROP INDEX role_key`); } catch (e) { /* ignore */ }
      try { await conn.execute(`ALTER TABLE yaban_clinic_role ADD UNIQUE KEY uniq_tenant_role (tenant_id, role_key)`); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // 忽略：表可能尚未创建或权限不足，建表语句已含该列
  }
}

async function ensureScopeColumn(conn: any, table: string) {
  try {
    const [cols] = (await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='scope'`,
      [table]
    )) as any;
    if (!(cols as any[])[0]) {
      await conn.execute(`ALTER TABLE ${table} ADD COLUMN scope VARCHAR(8) DEFAULT NULL`);
    }
  } catch (e) {
    // 忽略：表可能尚未创建或权限不足，建表语句已含该列
  }
}

// ==================== 工具函数 ====================

function isSuperAdmin(ctx: any): boolean {
  return ctx?.user?.role === "super_admin";
}

async function isFounder(conn: any, ctx: any): Promise<boolean> {
  if (isSuperAdmin(ctx)) return true;
  const [rows] = (await conn.execute(
    `SELECT id FROM yaban_platform_role WHERE user_id=? AND role_key IN ('founder','co_founder') AND status='active' LIMIT 1`,
    [ctx.user.id]
  )) as any;
  return !!(rows as any[])[0];
}

async function getFounderTitle(conn: any, ctx: any): Promise<string | null> {
  if (isSuperAdmin(ctx)) return "founder";
  const [rows] = (await conn.execute(
    `SELECT role_key FROM yaban_platform_role WHERE user_id=? AND role_key IN ('founder','co_founder') AND status='active'
     ORDER BY FIELD(role_key,'founder','co_founder') LIMIT 1`,
    [ctx.user.id]
  )) as any;
  return (rows as any[])[0]?.role_key || null;
}

// 纯创始人（founder 或 super_admin）：拥有平台最高权限，不受平台权限表限制
async function isPureFounder(conn: any, ctx: any): Promise<boolean> {
  if (isSuperAdmin(ctx)) return true;
  const [rows] = (await conn.execute(
    `SELECT id FROM yaban_platform_role WHERE user_id=? AND role_key='founder' AND status='active' LIMIT 1`,
    [ctx.user.id]
  )) as any;
  return !!(rows as any[])[0];
}

// 是否仅为创始股东（co_founder 且非 founder）
async function isCoFounderOnly(conn: any, ctx: any): Promise<boolean> {
  if (await isPureFounder(conn, ctx)) return false;
  const [rows] = (await conn.execute(
    `SELECT id FROM yaban_platform_role WHERE user_id=? AND role_key='co_founder' AND status='active' LIMIT 1`,
    [ctx.user.id]
  )) as any;
  return !!(rows as any[])[0];
}

// 读取某用户的平台权限（返回 perm_key->bool，未设置的取默认值）
async function getPlatformPerms(conn: any, userId: number): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = { ...PLATFORM_DEFAULT };
  const [rows] = (await conn.execute(
    `SELECT perm_key, enabled FROM yaban_platform_perm WHERE user_id=?`,
    [userId]
  )) as any;
  for (const r of rows as any[]) {
    if (r.perm_key in result) result[r.perm_key] = !!r.enabled;
  }
  return result;
}

// 计算当前登录者的平台权限：创始人全开；创始股东按表；其他全关
async function getMyPlatformPerms(conn: any, ctx: any): Promise<{ perms: Record<string, boolean>; isPureFounder: boolean; isCoFounder: boolean }> {
  const pure = await isPureFounder(conn, ctx);
  if (pure) {
    const all = Object.fromEntries(PLATFORM_PERM_DEFS.map((p) => [p.key, true]));
    return { perms: all, isPureFounder: true, isCoFounder: false };
  }
  const co = await isCoFounderOnly(conn, ctx);
  if (co) {
    return { perms: await getPlatformPerms(conn, ctx.user.id), isPureFounder: false, isCoFounder: true };
  }
  const none = Object.fromEntries(PLATFORM_PERM_DEFS.map((p) => [p.key, false]));
  return { perms: none, isPureFounder: false, isCoFounder: false };
}

// 断言仅创始人可用（创始股东需额外拥有对应平台权限才能通过）
async function assertPlatformPerm(conn: any, ctx: any, permKey: string) {
  if (await isPureFounder(conn, ctx)) return;
  if (await isCoFounderOnly(conn, ctx)) {
    const perms = await getPlatformPerms(conn, ctx.user.id);
    if (perms[permKey]) return;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "无此操作权限" });
}

async function getMember(conn: any, userId: number, tenantId = DEFAULT_TENANT_ID) {
  const [rows] = (await conn.execute(
    `SELECT id, tenant_id, user_id, role_key, status FROM yaban_clinic_member
     WHERE user_id = ? AND tenant_id = ? LIMIT 1`,
    [userId, tenantId]
  )) as any;
  return (rows as any[])[0] || null;
}

// 取某用户在某医院持有的全部诊所角色（一人可多角色）
async function getMemberRoles(conn: any, userId: number, tenantId = DEFAULT_TENANT_ID): Promise<string[]> {
  const [rows] = (await conn.execute(
    `SELECT role_key FROM yaban_clinic_member WHERE user_id=? AND tenant_id=? AND status='active'`,
    [userId, tenantId]
  )) as any;
  return (rows as any[]).map((r) => r.role_key);
}

// ==================== 角色解析（内置 + 门店自定义）====================
// 返回某门店可用的全部角色（内置 tenant_id=0 ∩ 该门店自定义 tenant_id=N）
// 内置角色排在前，自定义角色按 sort/created 靠后
async function listTenantRoles(
  conn: any,
  tenantId = DEFAULT_TENANT_ID
): Promise<{ role_key: string; name: string; description: string; sort: number; is_builtin: number }[]> {
  const [rows] = (await conn.execute(
    `SELECT role_key, name, description, sort, is_builtin
       FROM yaban_clinic_role
      WHERE tenant_id = 0 OR tenant_id = ?
      ORDER BY is_builtin DESC, sort ASC, id ASC`,
    [tenantId]
  )) as any;
  return (rows as any[]).map((r) => ({
    role_key: r.role_key,
    name: r.name,
    description: r.description || "",
    sort: Number(r.sort) || 0,
    is_builtin: Number(r.is_builtin),
  }));
}

// 校验某 roleKey 在该门店是否可用（内置或该门店自定义）
async function roleExistsForTenant(
  conn: any,
  roleKey: string,
  tenantId = DEFAULT_TENANT_ID
): Promise<boolean> {
  const [rows] = (await conn.execute(
    `SELECT id FROM yaban_clinic_role WHERE role_key=? AND (tenant_id=0 OR tenant_id=?) LIMIT 1`,
    [roleKey, tenantId]
  )) as any;
  return !!(rows as any[])[0];
}

// 计算某角色对某员工权限的默认 scope（含角色模板覆盖）
async function getRoleScope(
  conn: any,
  roleKey: string,
  permKey: string,
  tenantId = DEFAULT_TENANT_ID
): Promise<Scope> {
  const def = STAFF_PERM_MAP[permKey];
  if (!def) return "none";
  // 角色模板覆盖
  const [rows] = (await conn.execute(
    `SELECT enabled, scope FROM yaban_role_perm_switch WHERE tenant_id=? AND role_key=? AND perm_key=? LIMIT 1`,
    [tenantId, roleKey, permKey]
  )) as any;
  const row = (rows as any[])[0];
  if (row) {
    if (row.scope) return normalizeScope(def, row.scope);
    return boolToScope(row.enabled, def);
  }
  // 无覆盖 -> 角色默认模板（内置角色有模板；自定义角色无模板时默认 none，权限完全来自 yaban_role_perm_switch）
  const tpl = ROLE_DEFAULT_PERMS[roleKey] || {};
  return normalizeScope(def, tpl[permKey] || "none");
}

// 计算某员工某权限的最终 scope：个人定制 > 多角色默认并集
async function getStaffEffectiveScope(
  conn: any,
  userId: number,
  permKey: string,
  tenantId = DEFAULT_TENANT_ID
): Promise<Scope> {
  const def = STAFF_PERM_MAP[permKey];
  if (!def) return "none";
  // 个人定制优先
  const [pm] = (await conn.execute(
    `SELECT enabled, scope FROM yaban_member_perm_switch WHERE tenant_id=? AND user_id=? AND perm_key=? LIMIT 1`,
    [tenantId, userId, permKey]
  )) as any;
  const prow = (pm as any[])[0];
  if (prow) {
    if (prow.scope) return normalizeScope(def, prow.scope);
    return boolToScope(prow.enabled, def);
  }
  // 否则取该用户所有角色默认的并集（更宽松）
  const roles = await getMemberRoles(conn, userId, tenantId);
  let eff: Scope = "none";
  for (const rk of roles) {
    eff = mergeScope(eff, await getRoleScope(conn, rk, permKey, tenantId));
  }
  return eff;
}

// 计算当前登录用户所有员工权限的 scope 映射（供前端控制 UI 与后端校验）
async function getUserPermScopes(
  conn: any,
  ctx: any,
  tenantId = DEFAULT_TENANT_ID
): Promise<{ scopes: Record<string, Scope>; isFounder: boolean; isSuperAdmin: boolean; member: any }> {
  const superAdmin = isSuperAdmin(ctx);
  const founder = await isFounder(conn, ctx);
  if (founder || superAdmin) {
    const scopes: Record<string, Scope> = {};
    for (const k of ALL_STAFF_PERM_KEYS) scopes[k] = "all";
    return { scopes, isFounder: founder, isSuperAdmin: superAdmin, member: null };
  }
  const member = await getMember(conn, ctx.user.id, tenantId);
  const scopes: Record<string, Scope> = {};
  for (const k of ALL_STAFF_PERM_KEYS) {
    scopes[k] = member ? await getStaffEffectiveScope(conn, ctx.user.id, k, tenantId) : "none";
  }
  return { scopes, isFounder: false, isSuperAdmin: false, member };
}

async function assertCanManage(conn: any, ctx: any, tenantId = DEFAULT_TENANT_ID) {
  if (await isFounder(conn, ctx)) return;
  const me = await getMember(conn, ctx.user.id, tenantId);
  if (!me || !CLINIC_MANAGE_ROLES.includes(me.role_key)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "无权管理门诊员工与权限" });
  }
}

// ==================== 对外导出：供其它路由做权限校验 ====================
// 返回该权限的 scope；其它路由可据此判断 all/self/none
export async function getYabanPermScope(
  ctx: any,
  permKey: string,
  tenantId = DEFAULT_TENANT_ID
): Promise<Scope> {
  const conn = await getDbConnection();
  if (!conn) return "none";
  await ensureRoleTables(conn);
  if (isSuperAdmin(ctx) || (await isFounder(conn, ctx))) return "all";
  const member = await getMember(conn, ctx.user.id, tenantId);
  if (!member) return "none";
  return getStaffEffectiveScope(conn, ctx.user.id, permKey, tenantId);
}

// 兼容旧调用：是否拥有某权限（scope != none 即视为有）
export async function checkYabanPerm(
  ctx: any,
  permKey: string,
  tenantId = DEFAULT_TENANT_ID
): Promise<boolean> {
  const scope = await getYabanPermScope(ctx, permKey, tenantId);
  return scope !== "none";
}

export async function isYabanFounder(ctx: any): Promise<boolean> {
  const conn = await getDbConnection();
  if (!conn) return false;
  await ensureRoleTables(conn);
  return isFounder(conn, ctx);
}

// 纯创始人（founder 或 super_admin，不含创始股东 co_founder）：平台最高权限特例
export async function isYabanPureFounder(ctx: any): Promise<boolean> {
  const conn = await getDbConnection();
  if (!conn) return false;
  await ensureRoleTables(conn);
  return isPureFounder(conn, ctx);
}

// ==================== 路由 ====================
export const yabanRoleRouter = router({
  // ============ 当前用户的角色与生效权限 ============
  myMembership: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return { member: null, permissions: [] as string[], scopes: {}, canManage: false, isFounder: false, isSuperAdmin: false, roleBadges: [] as string[], founderTitle: null };
    await ensureRoleTables(conn);
    const { scopes, isFounder: founder, isSuperAdmin: sa, member } = await getUserPermScopes(conn, ctx);
    const canManage = founder || sa || (member && CLINIC_MANAGE_ROLES.includes(member.role_key));
    const founderTitle = founder ? await getFounderTitle(conn, ctx) : null;
    const platform = await getMyPlatformPerms(conn, ctx);

    // 兼容旧字段 permissions：scope != none 的权限 key 列表
    const permissions = Object.keys(scopes).filter((k) => scopes[k] !== "none");

    // 身份徽标：一人可多角色
    const badgeKeys: string[] = [];
    if (founderTitle) badgeKeys.push(founderTitle);
    else if (founder) badgeKeys.push("founder");
    const [roleRows] = (await conn.execute(
      `SELECT DISTINCT role_key FROM yaban_clinic_member WHERE user_id=? AND status='active'`,
      [ctx.user.id]
    )) as any;
    const order = ["owner", "shareholder", "doctor", "nurse", "assistant", "receptionist", "finance"];
    const clinicRoleKeys = (roleRows as any[]).map((r) => r.role_key);
    for (const k of order) {
      if (clinicRoleKeys.includes(k) && !badgeKeys.includes(k)) badgeKeys.push(k);
    }
    // 自定义角色（不在内置 order 中）补在后面
    for (const k of clinicRoleKeys) {
      if (!badgeKeys.includes(k)) badgeKeys.push(k);
    }

    return {
      member,
      permissions,
      scopes,
      canManage: !!canManage,
      isFounder: founder,
      isSuperAdmin: sa,
      founderTitle,
      roleBadges: badgeKeys,
      // 平台层权限：创始人全开，创始股东按表，其他全关
      platformPerms: platform.perms,
      isPureFounder: platform.isPureFounder,
      isCoFounder: platform.isCoFounder,
    };
  }),

  // ============ 角色列表（含默认模板 scope；内置 + 该门店自定义） ============
  listRoles: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ input }) => {
      const tenantId = input?.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) return [];
      await ensureRoleTables(conn);
      const roleList = await listTenantRoles(conn, tenantId);
      const result: any[] = [];
      for (const r of roleList) {
        const scopes: Record<string, Scope> = {};
        for (const k of ALL_STAFF_PERM_KEYS) {
          scopes[k] = await getRoleScope(conn, r.role_key, k, tenantId);
        }
        result.push({ ...r, scopes });
      }
      return result;
    }),

  // ============ 权限点字典（供面板渲染；含 type/subject） ============
  listPermDefs: protectedProcedure.query(async () => {
    return { staff: STAFF_PERM_DEFS, customer: CUSTOMER_PERM_DEFS };
  }),

  // ============ 角色默认模板矩阵（角色 x 权限 -> scope） ============
  getRoleTemplateMatrix: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = input?.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      const roleList = await listTenantRoles(conn, tenantId);
      const matrix: Record<string, Record<string, Scope>> = {};
      for (const r of roleList) {
        matrix[r.role_key] = {};
        for (const p of ALL_STAFF_PERM_KEYS) {
          matrix[r.role_key][p] = await getRoleScope(conn, r.role_key, p, tenantId);
        }
      }
      return { roles: roleList, perms: STAFF_PERM_DEFS, matrix, tenantId };
    }),

  // ============ 设置角色默认模板某项 scope ============
  setRolePerm: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().int().optional(),
        roleKey: z.string().min(1).max(32),
        permKey: z.string().min(1).max(32),
        scope: z.enum(["all", "self", "none"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      const def = STAFF_PERM_MAP[input.permKey];
      if (!def) throw new TRPCError({ code: "BAD_REQUEST", message: "未知权限项" });
      if (!(await roleExistsForTenant(conn, input.roleKey, tenantId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "未知角色" });
      }
      const scope = normalizeScope(def, input.scope);
      // 院长/股东 的核心管理权限不允许关闭
      if (input.roleKey === "owner" && ["member_manage", "clinic_setting"].includes(input.permKey) && scope === "none") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "院长/股东的管理权限不可关闭" });
      }
      await conn.execute(
        `INSERT INTO yaban_role_perm_switch (tenant_id, role_key, perm_key, enabled, scope, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), scope=VALUES(scope), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`,
        [tenantId, input.roleKey, input.permKey, scope === "none" ? 0 : 1, scope, ctx.user.id]
      );
      return { success: true };
    }),

  // ============ 院长新建自定义角色 ============
  createCustomRole: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().int().optional(),
        name: z.string().min(1).max(20),
        description: z.string().max(100).optional(),
        // 初始权限模板：perm_key -> scope（可选）
        perms: z.record(z.string(), z.enum(["all", "self", "none"])).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      const name = input.name.trim();
      if (!name) throw new TRPCError({ code: "BAD_REQUEST", message: "请输入角色名称" });
      // 同门店不允许重名（含内置角色）
      const existRoles = await listTenantRoles(conn, tenantId);
      if (existRoles.some((r) => r.name === name)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "角色名称已存在" });
      }
      // 生成唯一 role_key：custom_{tenantId}_{timestamp}
      const roleKey = `custom_${tenantId}_${Date.now().toString(36)}`;
      // 排序：排在所有角色之后
      const maxSort = existRoles.reduce((m, r) => Math.max(m, r.sort), 0);
      await conn.execute(
        `INSERT INTO yaban_clinic_role (tenant_id, role_key, name, description, sort, is_builtin)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [tenantId, roleKey, name, input.description?.trim() || null, maxSort + 1]
      );
      // 写入初始权限模板（若提供）
      if (input.perms) {
        for (const [permKey, rawScope] of Object.entries(input.perms)) {
          const def = STAFF_PERM_MAP[permKey];
          if (!def) continue;
          const scope = normalizeScope(def, String(rawScope));
          await conn.execute(
            `INSERT INTO yaban_role_perm_switch (tenant_id, role_key, perm_key, enabled, scope, updated_by)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), scope=VALUES(scope), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`,
            [tenantId, roleKey, permKey, scope === "none" ? 0 : 1, scope, ctx.user.id]
          );
        }
      }
      return { success: true, roleKey, name };
    }),

  // ============ 院长修改自定义角色名称/描述 ============
  updateCustomRole: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().int().optional(),
        roleKey: z.string().min(1).max(40),
        name: z.string().min(1).max(20),
        description: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      // 仅可改该门店自定义角色（is_builtin=0 且 tenant_id=本门店）
      const [rows] = (await conn.execute(
        `SELECT id FROM yaban_clinic_role WHERE role_key=? AND tenant_id=? AND is_builtin=0 LIMIT 1`,
        [input.roleKey, tenantId]
      )) as any;
      if (!(rows as any[])[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "仅可修改自定义角色" });
      const name = input.name.trim();
      if (!name) throw new TRPCError({ code: "BAD_REQUEST", message: "请输入角色名称" });
      // 重名检查（排除自身）
      const existRoles = await listTenantRoles(conn, tenantId);
      if (existRoles.some((r) => r.name === name && r.role_key !== input.roleKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "角色名称已存在" });
      }
      await conn.execute(
        `UPDATE yaban_clinic_role SET name=?, description=? WHERE role_key=? AND tenant_id=? AND is_builtin=0`,
        [name, input.description?.trim() || null, input.roleKey, tenantId]
      );
      return { success: true };
    }),

  // ============ 院长删除自定义角色（需无成员使用） ============
  deleteCustomRole: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional(), roleKey: z.string().min(1).max(40) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      const [rows] = (await conn.execute(
        `SELECT id FROM yaban_clinic_role WHERE role_key=? AND tenant_id=? AND is_builtin=0 LIMIT 1`,
        [input.roleKey, tenantId]
      )) as any;
      if (!(rows as any[])[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "仅可删除自定义角色" });
      // 检查是否有成员在用
      const [used] = (await conn.execute(
        `SELECT COUNT(*) AS cnt FROM yaban_clinic_member WHERE tenant_id=? AND role_key=?`,
        [tenantId, input.roleKey]
      )) as any;
      if (Number((used as any[])[0]?.cnt || 0) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该角色下还有成员，请先调整成员角色后再删除" });
      }
      // 删角色及其权限模板
      await conn.execute(`DELETE FROM yaban_role_perm_switch WHERE tenant_id=? AND role_key=?`, [tenantId, input.roleKey]);
      await conn.execute(`DELETE FROM yaban_clinic_role WHERE role_key=? AND tenant_id=? AND is_builtin=0`, [input.roleKey, tenantId]);
      return { success: true };
    }),

  // ============ 员工权限矩阵（成员 x 权限 -> 当前 scope + 是否个人定制） ============
  getStaffMatrix: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = input?.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      const roleList = await listTenantRoles(conn, tenantId);
      const [memberRows] = (await conn.execute(
        `SELECT m.id, m.user_id, m.role_key, m.status, u.username, u.name, u.phone, u.avatar
         FROM yaban_clinic_member m JOIN users u ON u.id = m.user_id
         WHERE m.tenant_id = ? AND m.status='active'
                  ORDER BY FIELD(m.role_key,'owner','shareholder','doctor','nurse','assistant','receptionist','finance') DESC, m.created_at ASC`,
      [tenantId]
    )) as any;
      const members: any[] = [];
      for (const m of memberRows as any[]) {
        // 个人定制记录
        const [ov] = (await conn.execute(
          `SELECT perm_key, enabled, scope FROM yaban_member_perm_switch WHERE tenant_id=? AND user_id=?`,
          [tenantId, m.user_id]
        )) as any;
        const customized = new Set((ov as any[]).map((r) => r.perm_key));
        const scopes: Record<string, Scope> = {};
        for (const p of ALL_STAFF_PERM_KEYS) {
          scopes[p] = await getStaffEffectiveScope(conn, m.user_id, p, tenantId);
        }
        members.push({
          memberId: m.id, userId: m.user_id, roleKey: m.role_key,
          username: m.username, name: m.name, phone: m.phone, avatar: m.avatar,
          scopes, customized: Array.from(customized),
        });
      }
      return { members, perms: STAFF_PERM_DEFS, roles: roleList, tenantId };
    }),

  // ============ 设置员工个人定制某项 scope（或重置回角色默认） ============
  setMemberPerm: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().int().optional(),
        userId: z.number().int(),
        permKey: z.string().min(1).max(32),
        scope: z.enum(["all", "self", "none"]).optional(),
        reset: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      const def = STAFF_PERM_MAP[input.permKey];
      if (!def) throw new TRPCError({ code: "BAD_REQUEST", message: "未知权限项" });
      const target = await getMember(conn, input.userId, tenantId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "成员不存在" });
      if (input.reset) {
        await conn.execute(
          `DELETE FROM yaban_member_perm_switch WHERE tenant_id=? AND user_id=? AND perm_key=?`,
          [tenantId, input.userId, input.permKey]
        );
        return { success: true, reset: true };
      }
      const scope = normalizeScope(def, input.scope || "none");
      await conn.execute(
        `INSERT INTO yaban_member_perm_switch (tenant_id, user_id, perm_key, enabled, scope, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), scope=VALUES(scope), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`,
        [tenantId, input.userId, input.permKey, scope === "none" ? 0 : 1, scope, ctx.user.id]
      );
      return { success: true };
    }),

  // ============ 单个员工的权限详情（用于点进某人弹出的开关面板） ============
  getMemberPerms: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional(), userId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      const target = await getMember(conn, input.userId, tenantId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "成员不存在" });
      const roles = await getMemberRoles(conn, input.userId, tenantId);
      const [ov] = (await conn.execute(
        `SELECT perm_key, enabled, scope FROM yaban_member_perm_switch WHERE tenant_id=? AND user_id=?`,
        [tenantId, input.userId]
      )) as any;
      const customized = new Set((ov as any[]).map((r) => r.perm_key));
      const effective: Record<string, Scope> = {};
      const roleDefault: Record<string, Scope> = {};
      for (const p of ALL_STAFF_PERM_KEYS) {
        effective[p] = await getStaffEffectiveScope(conn, input.userId, p, tenantId);
        // 角色默认并集
        let rd: Scope = "none";
        for (const rk of roles) rd = mergeScope(rd, await getRoleScope(conn, rk, p, tenantId));
        roleDefault[p] = rd;
      }
      return {
        userId: input.userId,
        roleKey: target.role_key,
        roles,
        perms: STAFF_PERM_DEFS,
        effective,
        roleDefault,
        customized: Array.from(customized),
      };
    }),

  // ============ 顾客权限矩阵（顾客 x 权限） ============
  getCustomerMatrix: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional(), keyword: z.string().optional(), limit: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = input?.tenantId ?? DEFAULT_TENANT_ID;
      const limit = Math.min(input?.limit ?? 50, 200);
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      // 顾客来源：yaban_patient 表（按 tenant 过滤）。容错：表不存在则返回空。
      let patientRows: any[] = [];
      try {
        const kw = (input?.keyword || "").trim();
        if (kw) {
          const [rows] = (await conn.execute(
            `SELECT id, user_id, name, phone, avatar FROM yaban_patient
             WHERE tenant_id=? AND user_id IS NOT NULL AND (name LIKE ? OR phone LIKE ?)
             ORDER BY created_at DESC LIMIT ?`,
            [tenantId, `%${kw}%`, `%${kw}%`, limit]
          )) as any;
          patientRows = rows as any[];
        } else {
          const [rows] = (await conn.execute(
            `SELECT id, user_id, name, phone, avatar FROM yaban_patient
             WHERE tenant_id=? AND user_id IS NOT NULL
             ORDER BY created_at DESC LIMIT ?`,
            [tenantId, limit]
          )) as any;
          patientRows = rows as any[];
        }
      } catch (e) {
        patientRows = [];
      }
      const customers: any[] = [];
      for (const p of patientRows) {
        const [ov] = (await conn.execute(
          `SELECT perm_key, scope FROM yaban_customer_perm_switch WHERE tenant_id=? AND user_id=?`,
          [tenantId, p.user_id]
        )) as any;
        const map: Record<string, Scope> = {};
        for (const r of ov as any[]) map[r.perm_key] = r.scope as Scope;
        const scopes: Record<string, Scope> = {};
        for (const def of CUSTOMER_PERM_DEFS) {
          scopes[def.key] = map[def.key] ?? (CUSTOMER_DEFAULT_PERMS[def.key] || "none");
        }
        customers.push({
          patientId: p.id, userId: p.user_id, name: p.name, phone: p.phone, avatar: p.avatar, scopes,
        });
      }
      return { customers, perms: CUSTOMER_PERM_DEFS, tenantId };
    }),

  // ============ 设置顾客个人权限某项 ============
  setCustomerPerm: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().int().optional(),
        userId: z.number().int(),
        permKey: z.string().min(1).max(32),
        scope: z.enum(["all", "self", "none"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      const def = CUSTOMER_PERM_MAP[input.permKey];
      if (!def) throw new TRPCError({ code: "BAD_REQUEST", message: "未知顾客权限项" });
      const scope = normalizeScope(def, input.scope);
      await conn.execute(
        `INSERT INTO yaban_customer_perm_switch (tenant_id, user_id, perm_key, scope, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE scope=VALUES(scope), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`,
        [tenantId, input.userId, input.permKey, scope, ctx.user.id]
      );
      return { success: true };
    }),

  // ============ 当前用户可管理的医院列表（多店切换用） ============
  myManageableClinics: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    await ensureRoleTables(conn);
    const founder = await isFounder(conn, ctx);
    // 门店列表 = 我实际加入的所有门店（任意角色，active）∪ 创始人可见的全部已建档门店
    // 用 Map 按 tenantId 去重，保证“把自己加进哪家店，那家店就一定出现在列表里”
    const byTenant = new Map<number, { tenant_id: number; name: string | null; short_name: string | null }>();
    // 1) 我作为成员加入的所有门店（关键：创始人被加进某店后，这里就会带出该店）
    try {
      const [rows] = (await conn.execute(
        `SELECT m.tenant_id, c.name, c.short_name
         FROM yaban_clinic_member m
         LEFT JOIN yaban_clinic c ON c.tenant_id = m.tenant_id
         WHERE m.user_id=? AND m.status='active'
         ORDER BY m.tenant_id ASC`,
        [ctx.user.id]
      )) as any;
      for (const r of rows as any[]) {
        byTenant.set(r.tenant_id, { tenant_id: r.tenant_id, name: r.name ?? null, short_name: r.short_name ?? null });
      }
    } catch (e) { /* ignore */ }
    // 2) 创始人额外可见所有已建档门店
    if (founder) {
      try {
        const [rows] = (await conn.execute(
          `SELECT tenant_id, name, short_name FROM yaban_clinic ORDER BY tenant_id ASC`
        )) as any;
        for (const r of rows as any[]) {
          if (!byTenant.has(r.tenant_id)) {
            byTenant.set(r.tenant_id, { tenant_id: r.tenant_id, name: r.name ?? null, short_name: r.short_name ?? null });
          }
        }
      } catch (e) { /* ignore */ }
    }
    let clinicRows = Array.from(byTenant.values()).sort((a, b) => a.tenant_id - b.tenant_id);
    // 兜底：创始人/owner 至少有一个默认门诊可进入
    if (clinicRows.length === 0) {
      const me = await getMember(conn, ctx.user.id, DEFAULT_TENANT_ID);
      if (founder || (me && me.role_key === "owner")) {
        clinicRows = [{ tenant_id: DEFAULT_TENANT_ID, name: "本门诊", short_name: null }];
      }
    }
    return clinicRows.map((c) => ({
      tenantId: c.tenant_id,
      name: c.name || `门诊 #${c.tenant_id}`,
      shortName: c.short_name || null,
    }));
  }),

  // ============ 门诊成员列表 ============
  listMembers: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = input?.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) return [];
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      const [rows] = (await conn.execute(
        `SELECT m.id, m.user_id, m.role_key, m.status, m.created_at,
                u.username, u.name, u.phone, u.avatar,
                r.name AS role_name
         FROM yaban_clinic_member m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN yaban_clinic_role r ON r.role_key = m.role_key
         WHERE m.tenant_id = ?
         ORDER BY FIELD(m.role_key,'owner','shareholder','doctor','nurse','assistant','receptionist','finance'), m.created_at ASC`,
        [tenantId]
      )) as any;
      return rows as any[];
    }),

  // ============ 只读诊断：查看门店与成员的真实 tenant 分布 ============
  debugMembership: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return { error: "no-db" } as any;
    await ensureRoleTables(conn);
    const founder = await isFounder(conn, ctx);
    const superAdmin = isSuperAdmin(ctx);
    // yaban_clinic 表门店
    let clinics: any[] = [];
    try {
      const [r] = (await conn.execute(`SELECT tenant_id, name FROM yaban_clinic ORDER BY tenant_id ASC`)) as any;
      clinics = r as any[];
    } catch (e: any) { clinics = [{ err: String(e?.message || e) }]; }
    // 各 tenant 下的成员数
    let memberCounts: any[] = [];
    try {
      const [r] = (await conn.execute(
        `SELECT tenant_id, status, COUNT(*) AS cnt FROM yaban_clinic_member GROUP BY tenant_id, status ORDER BY tenant_id ASC`
      )) as any;
      memberCounts = r as any[];
    } catch (e: any) { memberCounts = [{ err: String(e?.message || e) }]; }
    // 我自己的成员记录
    let mine: any[] = [];
    try {
      const [r] = (await conn.execute(
        `SELECT tenant_id, role_key, status FROM yaban_clinic_member WHERE user_id=? ORDER BY tenant_id ASC`,
        [ctx.user.id]
      )) as any;
      mine = r as any[];
    } catch (e: any) { mine = [{ err: String(e?.message || e) }]; }
    return { meUserId: ctx.user.id, founder, superAdmin, clinics, memberCounts, mine, DEFAULT_TENANT_ID };
  }),

  // ============ 模糊搜索脉动网用户（添加员工联想） ============
  searchUsers: protectedProcedure
    .input(z.object({ keyword: z.string().max(50) }))
    .query(async ({ ctx, input }) => {
      const kw = input.keyword.trim();
      if (kw.length < 1) return [] as any[];
      const conn = await getDbConnection();
      if (!conn) return [] as any[];
      const like = `%${kw}%`;
      // 手机号/用户名/昵称模糊匹配；手机号或用户名完全匹配的优先靠前
      const [rows] = (await conn.execute(
        `SELECT id, COALESCE(name, username, '未知') AS name, username, phone, avatar
           FROM users
          WHERE phone LIKE ? OR username LIKE ? OR name LIKE ?
          ORDER BY (phone = ? OR username = ?) DESC, id DESC
          LIMIT 20`,
        [like, like, like, kw, kw]
      )) as any;
      return (rows as any[]).map((u) => ({
        userId: Number(u.id),
        name: (u.name || u.username || "未知") as string,
        username: (u.username || "") as string,
        phone: (u.phone || "") as string,
        avatar: (u.avatar || "") as string,
      }));
    }),

  // ============ 添加门诊员工 ============
  addMember: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().int().optional(),
        userId: z.number().int().optional(), // 从联想列表选中时传入，优先精确定位，避免文本反查歧义
        identifier: z.string().max(50).optional(),
        roleKey: z.string().min(1).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      if (!(await roleExistsForTenant(conn, input.roleKey, tenantId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "角色不存在" });
      }
      let targetUser: any = null;
      if (input.userId != null) {
        // 优先：按 userId 精确定位（联想选中场景）
        const [r] = (await conn.execute(`SELECT id FROM users WHERE id = ? LIMIT 1`, [input.userId])) as any;
        targetUser = (r as any[])[0] || null;
      }
      if (!targetUser) {
        // 回退：按手机号/用户名文本精确匹配
        const id = (input.identifier || "").trim();
        if (!id) throw new TRPCError({ code: "BAD_REQUEST", message: "请选择或输入手机号/用户名" });
        const [userRows] = (await conn.execute(
          `SELECT id FROM users WHERE phone = ? OR username = ? LIMIT 1`,
          [id, id]
        )) as any;
        targetUser = (userRows as any[])[0] || null;
      }
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "未找到该用户，请确认手机号或用户名" });
      }
      await conn.execute(
        `INSERT INTO yaban_clinic_member (tenant_id, user_id, role_key, status, invited_by)
         VALUES (?, ?, ?, 'active', ?)
         ON DUPLICATE KEY UPDATE role_key = VALUES(role_key), status = 'active', updated_at = CURRENT_TIMESTAMP`,
        [tenantId, targetUser.id, input.roleKey, ctx.user.id]
      );
      // 回查写入结果，确认同一 tenant 下已为 active
      const [chk] = (await conn.execute(
        `SELECT tenant_id, status, role_key FROM yaban_clinic_member WHERE tenant_id=? AND user_id=? LIMIT 1`,
        [tenantId, targetUser.id]
      )) as any;
      const saved = (chk as any[])[0] || null;
      return { success: true, userId: targetUser.id, tenantId, saved };
    }),

  // ============ 修改成员角色 ============
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().int().optional(),
        memberId: z.number().int(),
        roleKey: z.string().min(1).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      if (!(await roleExistsForTenant(conn, input.roleKey, tenantId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "角色不存在" });
      }
      const [rows] = (await conn.execute(
        `SELECT id, user_id, role_key FROM yaban_clinic_member WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.memberId, tenantId]
      )) as any;
      const target = (rows as any[])[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "成员不存在" });
      await conn.execute(
        `UPDATE yaban_clinic_member SET role_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [input.roleKey, input.memberId]
      );
      return { success: true };
    }),

  // ============ 移除门诊员工 ============
  removeMember: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional(), memberId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx, tenantId);
      const [rows] = (await conn.execute(
        `SELECT id, user_id, role_key FROM yaban_clinic_member WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.memberId, tenantId]
      )) as any;
      const target = (rows as any[])[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "成员不存在" });
      if (target.user_id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不可移除自己" });
      }
      await conn.execute(
        `DELETE FROM yaban_member_perm_switch WHERE tenant_id=? AND user_id=?`,
        [tenantId, target.user_id]
      );
      await conn.execute(`DELETE FROM yaban_clinic_member WHERE id = ?`, [input.memberId]);
      return { success: true };
    }),

  // ============ 创始人专属：平台级成员列表 ============
  listFounders: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    await ensureRoleTables(conn);
    if (!(await isFounder(conn, ctx))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "仅牙伴创始人可查看" });
    }
    const [rows] = (await conn.execute(
      `SELECT p.id, p.user_id, p.role_key, p.status, p.created_at, u.username, u.name, u.phone
       FROM yaban_platform_role p JOIN users u ON u.id = p.user_id
       WHERE p.role_key IN ('founder','co_founder') AND p.status='active'
       ORDER BY FIELD(p.role_key,'founder','co_founder'), p.created_at ASC`
    )) as any;
    return rows as any[];
  }),

  // ============ 创始人专属：全局用户模糊搜索（任命创始股东用） ============
  searchGlobalUser: protectedProcedure
    .input(z.object({ keyword: z.string().min(1).max(50), limit: z.number().int().min(1).max(30).default(20) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      if (!(await isFounder(conn, ctx))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅牙伴创始人可操作" });
      }
      const kw = input.keyword.trim();
      if (!kw) return [];
      const like = `%${kw}%`;
      // 全局用户模糊查询：用户名 / 姓名 / 手机号
      const [rows] = (await conn.execute(
        `SELECT u.id, u.username, u.name, u.phone, u.avatar,
                pr.role_key AS founder_role
         FROM users u
         LEFT JOIN yaban_platform_role pr
           ON pr.user_id = u.id AND pr.role_key IN ('founder','co_founder') AND pr.status='active'
         WHERE u.username LIKE ? OR u.name LIKE ? OR u.phone LIKE ?
         ORDER BY (u.name = ? OR u.username = ?) DESC, u.id DESC
         LIMIT ?`,
        [like, like, like, kw, kw, input.limit]
      )) as any;
      return (rows as any[]).map((r) => ({
        id: Number(r.id),
        username: r.username || "",
        name: r.name || "",
        phone: r.phone || "",
        avatar: r.avatar || "",
        founderRole: r.founder_role || null,
      }));
    }),

  // ============ 创始人专属：授予创始人/创始股东 ============
  grantFounder: protectedProcedure
    .input(z.object({ identifier: z.string().min(1).optional(), userId: z.number().int().optional(), title: z.enum(["founder", "co_founder"]).default("co_founder") }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      // 任命只允许纯创始人（创始股东为虚衔，不得任命/撤销）
      if (!(await isPureFounder(conn, ctx))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅牙伴创始人可操作" });
      }
      let targetUser: any = null;
      if (input.userId) {
        const [userRows] = (await conn.execute(
          `SELECT id, username, name FROM users WHERE id=? LIMIT 1`,
          [input.userId]
        )) as any;
        targetUser = (userRows as any[])[0];
      } else if (input.identifier) {
        const id = input.identifier.trim();
        const [userRows] = (await conn.execute(
          `SELECT id, username, name FROM users WHERE id=? OR username=? OR phone=? LIMIT 1`,
          [/^\d+$/.test(id) ? Number(id) : 0, id, id]
        )) as any;
        targetUser = (userRows as any[])[0];
      }
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "未找到该用户" });
      await conn.execute(
        `DELETE FROM yaban_platform_role WHERE user_id=? AND role_key IN ('founder','co_founder')`,
        [targetUser.id]
      );
      await conn.execute(
        `INSERT INTO yaban_platform_role (user_id, role_key, status, granted_by)
         VALUES (?, ?, 'active', ?)
         ON DUPLICATE KEY UPDATE status='active', granted_by=VALUES(granted_by)`,
        [targetUser.id, input.title, ctx.user.id]
      );
      return { success: true, userId: targetUser.id, name: targetUser.name || targetUser.username };
    }),

  // ============ 创始人专属：撤销创始人/创始股东 ============
  revokeFounder: protectedProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      // 撤销只允许纯创始人
      if (!(await isPureFounder(conn, ctx))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅牙伴创始人可操作" });
      }
      if (input.userId === 870413) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不可撤销创始人" });
      }
      await conn.execute(
        `DELETE FROM yaban_platform_role WHERE user_id=? AND role_key IN ('founder','co_founder')`,
        [input.userId]
      );
      // 同时清理该用户的平台层权限记录
      await conn.execute(`DELETE FROM yaban_platform_perm WHERE user_id=?`, [input.userId]);
      return { success: true };
    }),

  // ============ 平台层权限：权限项定义列表（数据驱动） ============
  listPlatformPermDefs: protectedProcedure.query(async () => {
    return PLATFORM_PERM_DEFS.map((d) => ({
      key: d.key,
      name: d.name,
      group: d.group,
      desc: d.desc,
      defaultOn: d.defaultOn,
    }));
  }),

  // ============ 创始人专属：读取某创始股东的平台权限 ============
  getMemberPlatformPerms: protectedProcedure
    .input(z.object({ userId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      if (!(await isFounder(conn, ctx))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅牙伴创始人可查看" });
      }
      const perms = await getPlatformPerms(conn, input.userId);
      return PLATFORM_PERM_DEFS.map((d) => ({
        key: d.key,
        name: d.name,
        group: d.group,
        desc: d.desc,
        enabled: !!perms[d.key],
      }));
    }),

  // ============ 创始人专属：设置某创始股东的某项平台权限（仅纯创始人可写） ============
  setPlatformPerm: protectedProcedure
    .input(z.object({ userId: z.number().int(), permKey: z.string().min(1), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      if (!(await isPureFounder(conn, ctx))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅牙伴创始人可设置" });
      }
      if (!PLATFORM_PERM_MAP[input.permKey]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "未知的权限项" });
      }
      // 目标用户必须是创始股东
      const [rows] = (await conn.execute(
        `SELECT role_key FROM yaban_platform_role WHERE user_id=? AND role_key IN ('founder','co_founder') AND status='active' LIMIT 1`,
        [input.userId]
      )) as any;
      const targetRole = (rows as any[])[0]?.role_key;
      if (targetRole !== "co_founder") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "仅可为创始股东设置平台权限" });
      }
      await conn.execute(
        `INSERT INTO yaban_platform_perm (user_id, perm_key, enabled, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), updated_by=VALUES(updated_by)`,
        [input.userId, input.permKey, input.enabled ? 1 : 0, ctx.user.id]
      );
      return { success: true };
    }),
});
