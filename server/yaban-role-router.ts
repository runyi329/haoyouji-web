/**
 * 牙伴齿科管理 - 门诊员工与角色权限 后端路由
 *
 * 设计原则：
 *   - 单店阶段 tenant_id 固定为 1，表已预留多租户字段
 *   - 7 个内置角色：owner / admin / doctor / assistant / receptionist / finance / staff
 *   - 权限点：patient / followup / schedule / shop_order / shop_verify / finance / member_manage / clinic_setting
 *   - 权限校验：根据当前用户在 yaban_clinic_member 中的 role_key 决定可见与可操作范围
 *   - 全部使用 getDbConnection 原生 SQL（与项目现有写法一致）
 *   - 严禁 Emoji
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

const DEFAULT_TENANT_ID = 1;

// 拥有员工管理权限的角色
const MANAGE_ROLES = ["owner", "admin"];

// 查询某用户在门诊的成员记录（含角色）
async function getMember(conn: any, userId: number, tenantId = DEFAULT_TENANT_ID) {
  const [rows] = (await conn.execute(
    `SELECT id, tenant_id, user_id, role_key, status FROM yaban_clinic_member
     WHERE user_id = ? AND tenant_id = ? LIMIT 1`,
    [userId, tenantId]
  )) as any;
  return (rows as any[])[0] || null;
}

// 查询某角色的权限点集合
async function getRolePerms(conn: any, roleKey: string): Promise<string[]> {
  const [rows] = (await conn.execute(
    `SELECT perm_key FROM yaban_role_permission WHERE role_key = ?`,
    [roleKey]
  )) as any;
  return (rows as any[]).map((r) => r.perm_key);
}

export const yabanRoleRouter = router({
  // ============ 当前用户在门诊的角色与权限 ============
  myMembership: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return { member: null, permissions: [] as string[], canManage: false };
    const member = await getMember(conn, ctx.user.id);
    if (!member) return { member: null, permissions: [] as string[], canManage: false };
    const permissions = await getRolePerms(conn, member.role_key);
    return {
      member,
      permissions,
      canManage: MANAGE_ROLES.includes(member.role_key),
    };
  }),

  // ============ 角色列表（含权限点） ============
  listRoles: protectedProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const [roleRows] = (await (conn as any).execute(
      `SELECT role_key, name, description, sort, is_builtin FROM yaban_clinic_role ORDER BY sort ASC`
    )) as any;
    const [permRows] = (await (conn as any).execute(
      `SELECT role_key, perm_key FROM yaban_role_permission`
    )) as any;
    const permMap: Record<string, string[]> = {};
    for (const p of permRows as any[]) {
      (permMap[p.role_key] ||= []).push(p.perm_key);
    }
    return (roleRows as any[]).map((r) => ({
      ...r,
      permissions: permMap[r.role_key] || [],
    }));
  }),

  // ============ 门诊成员列表 ============
  listMembers: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    // 仅有管理权限者可查看完整成员列表
    const me = await getMember(conn, ctx.user.id);
    if (!me || !MANAGE_ROLES.includes(me.role_key)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无权查看门诊成员" });
    }
    const [rows] = (await (conn as any).execute(
      `SELECT m.id, m.user_id, m.role_key, m.status, m.created_at,
              u.username, u.name, u.phone, u.avatar,
              r.name AS role_name
       FROM yaban_clinic_member m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN yaban_clinic_role r ON r.role_key = m.role_key
       WHERE m.tenant_id = ?
       ORDER BY FIELD(m.role_key,'owner','admin','doctor','assistant','receptionist','finance','staff'), m.created_at ASC`,
      [DEFAULT_TENANT_ID]
    )) as any;
    return rows as any[];
  }),

  // ============ 添加门诊员工（按手机号或用户名） ============
  addMember: protectedProcedure
    .input(
      z.object({
        identifier: z.string().min(1).max(50), // 手机号或用户名
        roleKey: z.string().min(1).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

      const me = await getMember(conn, ctx.user.id);
      if (!me || !MANAGE_ROLES.includes(me.role_key)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权添加门诊员工" });
      }
      // 不允许通过添加接口直接授予 owner
      if (input.roleKey === "owner") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "所有者角色不可直接授予" });
      }
      // 校验角色存在
      const [roleRows] = (await (conn as any).execute(
        `SELECT role_key FROM yaban_clinic_role WHERE role_key = ? LIMIT 1`,
        [input.roleKey]
      )) as any;
      if (!(roleRows as any[])[0]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "角色不存在" });
      }
      // 查找目标用户
      const id = input.identifier.trim();
      const [userRows] = (await (conn as any).execute(
        `SELECT id, username, name, phone FROM users WHERE phone = ? OR username = ? LIMIT 1`,
        [id, id]
      )) as any;
      const targetUser = (userRows as any[])[0];
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "未找到该用户，请确认手机号或用户名" });
      }
      // 写入或更新成员
      await (conn as any).execute(
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

      const me = await getMember(conn, ctx.user.id);
      if (!me || !MANAGE_ROLES.includes(me.role_key)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权修改成员角色" });
      }
      if (input.roleKey === "owner") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "所有者角色不可直接授予" });
      }
      // 取目标成员
      const [rows] = (await (conn as any).execute(
        `SELECT id, user_id, role_key FROM yaban_clinic_member WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.memberId, DEFAULT_TENANT_ID]
      )) as any;
      const target = (rows as any[])[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "成员不存在" });
      // 不可修改 owner 的角色
      if (target.role_key === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "不可修改所有者的角色" });
      }
      // admin 不可修改自己（避免误降权后无人管理）由 owner 处理
      await (conn as any).execute(
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

      const me = await getMember(conn, ctx.user.id);
      if (!me || !MANAGE_ROLES.includes(me.role_key)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权移除门诊员工" });
      }
      const [rows] = (await (conn as any).execute(
        `SELECT id, user_id, role_key FROM yaban_clinic_member WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.memberId, DEFAULT_TENANT_ID]
      )) as any;
      const target = (rows as any[])[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "成员不存在" });
      if (target.role_key === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "不可移除所有者" });
      }
      if (target.user_id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不可移除自己" });
      }
      await (conn as any).execute(`DELETE FROM yaban_clinic_member WHERE id = ?`, [input.memberId]);
      return { success: true };
    }),
});
