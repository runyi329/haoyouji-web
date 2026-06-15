/**
 * 牙伴齿科管理 - 权限体系 后端路由（重构版）
 *
 * 权限层级（自上而下）：
 *   1. 脉动网系统管理员 super_admin —— 系统级最高权限（users.role），天然拥有牙伴一切
 *   2. 牙伴创始人 founder —— 牙伴项目内最高权限，跨诊所管理（yaban_platform_role 表），非系统级
 *   3. 诊所院长/股东 owner —— 单诊所最高权限（可多人同级），合并原 owner+admin
 *   4. 医生 doctor
 *   5. 护士/助理 assistant（并列）
 *   6. 前台 receptionist
 *   7. 财务 finance
 *
 * 权限开关面板（照搬脉动网快捷开关范式）：
 *   - 不写死角色权限，改为逐项开关，院长/股东及以上可控
 *   - 两级粒度：按角色开关(yaban_role_perm_switch) + 按个人覆盖(yaban_member_perm_switch)
 *   - 生效优先级：个人覆盖 > 角色开关 > 角色默认值
 *
 * 设计原则：
 *   - 单店阶段 tenant_id 固定为 1，表已预留多租户字段
 *   - 全部使用 getDbConnection 原生 SQL（与项目现有写法一致）
 *   - 严禁 Emoji
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

const DEFAULT_TENANT_ID = 1;

// 诊所内拥有员工/权限管理能力的角色（院长/股东）
const CLINIC_MANAGE_ROLES = ["owner"];

// ============ 权限点全集（面板逐项开关的项） ============
// key 必须稳定，name 为中文展示，group 用于面板分组
export const PERM_DEFS: { key: string; name: string; group: string }[] = [
  { key: "patient", name: "顾客管理", group: "顾客" },
  { key: "patient_create", name: "顾客建档", group: "顾客" },
  { key: "followup", name: "随访管理", group: "顾客" },
  { key: "media_view", name: "影像查看", group: "影像" },
  { key: "media_upload", name: "影像上传", group: "影像" },
  { key: "media_delete", name: "影像删除", group: "影像" },
  { key: "schedule", name: "预约排班", group: "运营" },
  { key: "shop_order", name: "商城订单", group: "运营" },
  { key: "shop_verify", name: "到店核销", group: "运营" },
  { key: "finance", name: "财务营收", group: "运营" },
  { key: "data_export", name: "数据导出", group: "运营" },
  { key: "member_manage", name: "员工管理", group: "管理" },
  { key: "clinic_setting", name: "门诊设置", group: "管理" },
];

export const ALL_PERM_KEYS = PERM_DEFS.map((p) => p.key);

// ============ 角色定义（诊所层 4 类 + 院长/股东） ============
export const ROLE_DEFS: {
  role_key: string;
  name: string;
  description: string;
  sort: number;
}[] = [
  { role_key: "owner", name: "院长/股东", description: "诊所最高权限，可管理员工与权限开关，可多人同级", sort: 1 },
  { role_key: "doctor", name: "医生", description: "顾客管理、随访、排班、影像、核销", sort: 2 },
  { role_key: "assistant", name: "护士/助理", description: "随访、排班、影像查看上传、核销", sort: 3 },
  { role_key: "receptionist", name: "前台", description: "预约排班、商城订单核销、顾客建档", sort: 4 },
  { role_key: "finance", name: "财务", description: "财务营收、商城订单、数据导出", sort: 5 },
];

// 各角色默认开启的权限点（院长进面板后可自行增减）
export const ROLE_DEFAULT_PERMS: Record<string, string[]> = {
  // 院长/股东：全部权限
  owner: [...ALL_PERM_KEYS],
  // 医生
  doctor: [
    "patient", "patient_create", "followup",
    "media_view", "media_upload",
    "schedule", "shop_verify",
  ],
  // 护士/助理
  assistant: [
    "patient", "followup",
    "media_view", "media_upload",
    "schedule", "shop_verify",
  ],
  // 前台
  receptionist: [
    "patient", "patient_create",
    "schedule", "shop_order", "shop_verify",
  ],
  // 财务
  finance: [
    "finance", "shop_order", "data_export",
  ],
};

// ==================== 建表与初始化 ====================
let initialized = false;
export async function ensureRoleTables(conn: any) {
  if (initialized) return;

  // 角色表
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_clinic_role (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role_key VARCHAR(32) NOT NULL UNIQUE,
      name VARCHAR(64) NOT NULL,
      description VARCHAR(255) DEFAULT NULL,
      sort INT DEFAULT 0,
      is_builtin TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴诊所角色'
  `);

  // 成员表
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

  // 平台级创始人表
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

  // 按角色权限开关表（诊所内某角色的某权限是否开启）
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_role_perm_switch (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      role_key VARCHAR(32) NOT NULL,
      perm_key VARCHAR(32) NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_by INT DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_role_perm (tenant_id, role_key, perm_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴按角色权限开关'
  `);

  // 按个人权限覆盖表（优先级最高）
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_member_perm_switch (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      user_id INT NOT NULL,
      perm_key VARCHAR(32) NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_by INT DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_perm (tenant_id, user_id, perm_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴按个人权限覆盖'
  `);

  // 同步角色定义（更新文案；合并 admin/staff）
  for (const r of ROLE_DEFS) {
    await conn.execute(
      `INSERT INTO yaban_clinic_role (role_key, name, description, sort, is_builtin)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort=VALUES(sort)`,
      [r.role_key, r.name, r.description, r.sort]
    );
  }
  // 将历史 admin / staff 成员并入 owner / receptionist（一次性迁移）
  await conn.execute(
    `UPDATE yaban_clinic_member SET role_key='owner' WHERE role_key='admin'`
  );
  await conn.execute(
    `UPDATE yaban_clinic_member SET role_key='receptionist' WHERE role_key='staff'`
  );
  // 移除已废弃角色定义
  await conn.execute(
    `DELETE FROM yaban_clinic_role WHERE role_key IN ('admin','staff')`
  );

  // 确保 jiang(870413) 是牙伴创始人
  await conn.execute(
    `INSERT INTO yaban_platform_role (user_id, role_key, status, granted_by)
     VALUES (870413, 'founder', 'active', 870413)
     ON DUPLICATE KEY UPDATE status='active'`
  );

  initialized = true;
}

// ==================== 工具函数 ====================

// 是否系统管理员（脉动网系统级）
function isSuperAdmin(ctx: any): boolean {
  return ctx?.user?.role === "super_admin";
}

// 是否牙伴创始人（平台级；super_admin 天然是）
async function isFounder(conn: any, ctx: any): Promise<boolean> {
  if (isSuperAdmin(ctx)) return true;
  const [rows] = (await conn.execute(
    `SELECT id FROM yaban_platform_role WHERE user_id=? AND role_key='founder' AND status='active' LIMIT 1`,
    [ctx.user.id]
  )) as any;
  return !!(rows as any[])[0];
}

// 查询某用户在门诊的成员记录
async function getMember(conn: any, userId: number, tenantId = DEFAULT_TENANT_ID) {
  const [rows] = (await conn.execute(
    `SELECT id, tenant_id, user_id, role_key, status FROM yaban_clinic_member
     WHERE user_id = ? AND tenant_id = ? LIMIT 1`,
    [userId, tenantId]
  )) as any;
  return (rows as any[])[0] || null;
}

// 计算某角色当前生效的权限点集合（角色默认 叠加 角色开关覆盖）
async function getEffectiveRolePerms(
  conn: any,
  roleKey: string,
  tenantId = DEFAULT_TENANT_ID
): Promise<string[]> {
  const defaults = new Set(ROLE_DEFAULT_PERMS[roleKey] || []);
  const [rows] = (await conn.execute(
    `SELECT perm_key, enabled FROM yaban_role_perm_switch WHERE tenant_id=? AND role_key=?`,
    [tenantId, roleKey]
  )) as any;
  for (const r of rows as any[]) {
    if (r.enabled) defaults.add(r.perm_key);
    else defaults.delete(r.perm_key);
  }
  return Array.from(defaults);
}

// 计算某用户最终生效权限（创始人/super_admin 全开；否则按角色 + 个人覆盖）
async function getUserEffectivePerms(
  conn: any,
  ctx: any,
  tenantId = DEFAULT_TENANT_ID
): Promise<{ perms: string[]; isFounder: boolean; isSuperAdmin: boolean; member: any }> {
  const superAdmin = isSuperAdmin(ctx);
  const founder = await isFounder(conn, ctx);
  if (founder || superAdmin) {
    return { perms: [...ALL_PERM_KEYS], isFounder: founder, isSuperAdmin: superAdmin, member: null };
  }
  const member = await getMember(conn, ctx.user.id, tenantId);
  if (!member) return { perms: [], isFounder: false, isSuperAdmin: false, member: null };
  const rolePerms = new Set(await getEffectiveRolePerms(conn, member.role_key, tenantId));
  // 个人覆盖
  const [rows] = (await conn.execute(
    `SELECT perm_key, enabled FROM yaban_member_perm_switch WHERE tenant_id=? AND user_id=?`,
    [tenantId, ctx.user.id]
  )) as any;
  for (const r of rows as any[]) {
    if (r.enabled) rolePerms.add(r.perm_key);
    else rolePerms.delete(r.perm_key);
  }
  return { perms: Array.from(rolePerms), isFounder: false, isSuperAdmin: false, member };
}

// 校验当前用户是否可管理诊所权限（院长/股东 或 创始人）
async function assertCanManage(conn: any, ctx: any) {
  if (await isFounder(conn, ctx)) return;
  const me = await getMember(conn, ctx.user.id);
  if (!me || !CLINIC_MANAGE_ROLES.includes(me.role_key)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "无权管理门诊员工与权限" });
  }
}

// ==================== 对外导出：供其它路由做权限校验 ====================
export async function checkYabanPerm(
  ctx: any,
  permKey: string,
  tenantId = DEFAULT_TENANT_ID
): Promise<boolean> {
  const conn = await getDbConnection();
  if (!conn) return false;
  await ensureRoleTables(conn);
  const { perms } = await getUserEffectivePerms(conn, ctx, tenantId);
  return perms.includes(permKey);
}

export async function isYabanFounder(ctx: any): Promise<boolean> {
  const conn = await getDbConnection();
  if (!conn) return false;
  await ensureRoleTables(conn);
  return isFounder(conn, ctx);
}

// ==================== 路由 ====================
export const yabanRoleRouter = router({
  // ============ 当前用户的角色与生效权限 ============
  myMembership: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return { member: null, permissions: [] as string[], canManage: false, isFounder: false, isSuperAdmin: false };
    await ensureRoleTables(conn);
    const { perms, isFounder: founder, isSuperAdmin: sa, member } = await getUserEffectivePerms(conn, ctx);
    const canManage = founder || sa || (member && CLINIC_MANAGE_ROLES.includes(member.role_key));
    return {
      member,
      permissions: perms,
      canManage: !!canManage,
      isFounder: founder,
      isSuperAdmin: sa,
    };
  }),

  // ============ 角色列表（含当前生效权限点） ============
  listRoles: protectedProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) return [];
    await ensureRoleTables(conn);
    const [roleRows] = (await conn.execute(
      `SELECT role_key, name, description, sort, is_builtin FROM yaban_clinic_role ORDER BY sort ASC`
    )) as any;
    const result: any[] = [];
    for (const r of roleRows as any[]) {
      const perms = await getEffectiveRolePerms(conn, r.role_key);
      result.push({ ...r, permissions: perms });
    }
    return result;
  }),

  // ============ 权限点字典（供面板渲染） ============
  listPermDefs: protectedProcedure.query(async () => {
    return PERM_DEFS;
  }),

  // ============ 权限开关面板数据：角色 x 权限 矩阵 ============
  getPermMatrix: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await ensureRoleTables(conn);
    await assertCanManage(conn, ctx);
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const r of ROLE_DEFS) {
      const perms = new Set(await getEffectiveRolePerms(conn, r.role_key));
      matrix[r.role_key] = {};
      for (const p of ALL_PERM_KEYS) {
        matrix[r.role_key][p] = perms.has(p);
      }
    }
    return { roles: ROLE_DEFS, perms: PERM_DEFS, matrix };
  }),

  // ============ 切换"按角色"权限开关 ============
  setRolePerm: protectedProcedure
    .input(
      z.object({
        roleKey: z.string().min(1).max(32),
        permKey: z.string().min(1).max(32),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx);
      if (!ALL_PERM_KEYS.includes(input.permKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "未知权限项" });
      }
      if (!ROLE_DEFS.some((r) => r.role_key === input.roleKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "未知角色" });
      }
      // 院长/股东(owner) 的核心管理权限不允许关闭，避免无人可管
      if (input.roleKey === "owner" && ["member_manage", "clinic_setting"].includes(input.permKey) && !input.enabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "院长/股东的管理权限不可关闭" });
      }
      await conn.execute(
        `INSERT INTO yaban_role_perm_switch (tenant_id, role_key, perm_key, enabled, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`,
        [DEFAULT_TENANT_ID, input.roleKey, input.permKey, input.enabled ? 1 : 0, ctx.user.id]
      );
      return { success: true };
    }),

  // ============ 查询某成员的个人权限覆盖 ============
  getMemberPerms: protectedProcedure
    .input(z.object({ userId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx);
      const target = await getMember(conn, input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "成员不存在" });
      const roleEffective = new Set(await getEffectiveRolePerms(conn, target.role_key));
      const [rows] = (await conn.execute(
        `SELECT perm_key, enabled FROM yaban_member_perm_switch WHERE tenant_id=? AND user_id=?`,
        [DEFAULT_TENANT_ID, input.userId]
      )) as any;
      const override: Record<string, boolean> = {};
      for (const r of rows as any[]) override[r.perm_key] = !!r.enabled;
      // 最终生效 = 角色生效 叠加 个人覆盖
      const effective: Record<string, boolean> = {};
      for (const p of ALL_PERM_KEYS) {
        effective[p] = p in override ? override[p] : roleEffective.has(p);
      }
      return { roleKey: target.role_key, perms: PERM_DEFS, override, effective };
    }),

  // ============ 切换"按个人"权限覆盖 ============
  setMemberPerm: protectedProcedure
    .input(
      z.object({
        userId: z.number().int(),
        permKey: z.string().min(1).max(32),
        enabled: z.boolean(),
        reset: z.boolean().optional(), // true 表示清除覆盖、回归角色默认
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx);
      if (!ALL_PERM_KEYS.includes(input.permKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "未知权限项" });
      }
      const target = await getMember(conn, input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "成员不存在" });
      if (input.reset) {
        await conn.execute(
          `DELETE FROM yaban_member_perm_switch WHERE tenant_id=? AND user_id=? AND perm_key=?`,
          [DEFAULT_TENANT_ID, input.userId, input.permKey]
        );
        return { success: true, reset: true };
      }
      await conn.execute(
        `INSERT INTO yaban_member_perm_switch (tenant_id, user_id, perm_key, enabled, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`,
        [DEFAULT_TENANT_ID, input.userId, input.permKey, input.enabled ? 1 : 0, ctx.user.id]
      );
      return { success: true };
    }),

  // ============ 门诊成员列表 ============
  listMembers: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    await ensureRoleTables(conn);
    await assertCanManage(conn, ctx);
    const [rows] = (await conn.execute(
      `SELECT m.id, m.user_id, m.role_key, m.status, m.created_at,
              u.username, u.name, u.phone, u.avatar,
              r.name AS role_name
       FROM yaban_clinic_member m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN yaban_clinic_role r ON r.role_key = m.role_key
       WHERE m.tenant_id = ?
       ORDER BY FIELD(m.role_key,'owner','doctor','assistant','receptionist','finance'), m.created_at ASC`,
      [DEFAULT_TENANT_ID]
    )) as any;
    return rows as any[];
  }),

  // ============ 添加门诊员工 ============
  addMember: protectedProcedure
    .input(
      z.object({
        identifier: z.string().min(1).max(50),
        roleKey: z.string().min(1).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx);
      if (!ROLE_DEFS.some((r) => r.role_key === input.roleKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "角色不存在" });
      }
      const id = input.identifier.trim();
      const [userRows] = (await conn.execute(
        `SELECT id FROM users WHERE phone = ? OR username = ? LIMIT 1`,
        [id, id]
      )) as any;
      const targetUser = (userRows as any[])[0];
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "未找到该用户，请确认手机号或用户名" });
      }
      await conn.execute(
        `INSERT INTO yaban_clinic_member (tenant_id, user_id, role_key, status, invited_by)
         VALUES (?, ?, ?, 'active', ?)
         ON DUPLICATE KEY UPDATE role_key = VALUES(role_key), status = 'active', updated_at = CURRENT_TIMESTAMP`,
        [DEFAULT_TENANT_ID, targetUser.id, input.roleKey, ctx.user.id]
      );
      return { success: true, userId: targetUser.id };
    }),

  // ============ 修改成员角色 ============
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int(),
        roleKey: z.string().min(1).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx);
      if (!ROLE_DEFS.some((r) => r.role_key === input.roleKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "角色不存在" });
      }
      const [rows] = (await conn.execute(
        `SELECT id, user_id, role_key FROM yaban_clinic_member WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.memberId, DEFAULT_TENANT_ID]
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
    .input(z.object({ memberId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      await assertCanManage(conn, ctx);
      const [rows] = (await conn.execute(
        `SELECT id, user_id, role_key FROM yaban_clinic_member WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.memberId, DEFAULT_TENANT_ID]
      )) as any;
      const target = (rows as any[])[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "成员不存在" });
      if (target.user_id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不可移除自己" });
      }
      // 清理该成员的个人权限覆盖
      await conn.execute(
        `DELETE FROM yaban_member_perm_switch WHERE tenant_id=? AND user_id=?`,
        [DEFAULT_TENANT_ID, target.user_id]
      );
      await conn.execute(`DELETE FROM yaban_clinic_member WHERE id = ?`, [input.memberId]);
      return { success: true };
    }),

  // ============ 创始人专属：平台级成员（创始人）列表 ============
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
       WHERE p.role_key='founder' AND p.status='active'
       ORDER BY p.created_at ASC`
    )) as any;
    return rows as any[];
  }),
});
