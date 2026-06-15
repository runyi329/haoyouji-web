/**
 * 多版本（皮肤）体系 后端路由
 *
 * - listVersions：列出版本（管理员可见全部，普通查询仅启用项）
 * - myVersion：当前登录用户的生效版本与切换权限（前端登录后分发与切换器用）
 * - saveVersion / deleteVersion：管理员维护版本列表（新增/编辑/删除）
 * - setUserVersion：管理员为单个用户设置版本 / 切换权限 / 可切换范围（可联动下线）
 * - userVersionInfo：后台查看某用户的生效版本与来源（最顶层设置者是谁）
 *
 * 权限：写操作仅限系统超级管理员 super_admin。
 * 严禁 Emoji。全部使用 getDbConnection 原生 SQL（与项目现有写法一致）。
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import { listSiteVersions, resolveUserVersion } from "./version-resolver";

function assertSuperAdmin(ctx: any) {
  const role = ctx?.user?.role;
  if (role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅系统管理员可操作版本设置" });
  }
}

// 收集某用户名下的所有下线用户ID（沿 invited_by_user_id 向下，BFS）
async function collectDescendantIds(rootUserId: number): Promise<number[]> {
  const conn = await getDbConnection();
  if (!conn) return [];
  const result: number[] = [];
  let frontier = [rootUserId];
  const visited = new Set<number>([rootUserId]);
  let depth = 0;
  while (frontier.length > 0 && depth < 100) {
    const placeholders = frontier.map(() => "?").join(",");
    const [rows]: any = await conn.execute(
      `SELECT id FROM users WHERE invited_by_user_id IN (${placeholders})`,
      frontier
    );
    const next: number[] = [];
    for (const r of rows as any[]) {
      const id = Number(r.id);
      if (!visited.has(id)) {
        visited.add(id);
        result.push(id);
        next.push(id);
      }
    }
    frontier = next;
    depth++;
  }
  return result;
}

export const versionRouter = router({
  // 列出版本：includeDisabled=true 时返回全部（管理员后台用）
  listVersions: publicProcedure
    .input(z.object({ includeDisabled: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const versions = await listSiteVersions(input?.includeDisabled === true);
      return versions;
    }),

  // 当前登录用户的生效版本与切换权限
  myVersion: protectedProcedure.query(async ({ ctx }) => {
    return resolveUserVersion(ctx.user.id);
  }),

  // 新增 / 编辑版本（管理员）
  saveVersion: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        versionKey: z
          .string()
          .min(1)
          .max(50)
          .regex(/^[a-z0-9_]+$/, "版本标识只能用小写字母、数字、下划线"),
        name: z.string().min(1).max(100),
        loginUi: z.string().min(1).max(50),
        landingPath: z.string().min(1).max(255),
        enabled: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertSuperAdmin(ctx);
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });

      if (input.id) {
        // 编辑：不允许把 version_key 改成与其他版本冲突
        const [dup]: any = await conn.execute(
          `SELECT id FROM site_versions WHERE version_key = ? AND id <> ? LIMIT 1`,
          [input.versionKey, input.id]
        );
        if ((dup as any[]).length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "版本标识已存在" });
        }
        await conn.execute(
          `UPDATE site_versions SET version_key = ?, name = ?, login_ui = ?, landing_path = ?, enabled = ?, sort_order = ? WHERE id = ?`,
          [
            input.versionKey,
            input.name,
            input.loginUi,
            input.landingPath,
            input.enabled === false ? 0 : 1,
            input.sortOrder ?? 0,
            input.id,
          ]
        );
        return { success: true, id: input.id };
      } else {
        const [dup]: any = await conn.execute(
          `SELECT id FROM site_versions WHERE version_key = ? LIMIT 1`,
          [input.versionKey]
        );
        if ((dup as any[]).length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "版本标识已存在" });
        }
        const [res]: any = await conn.execute(
          `INSERT INTO site_versions (version_key, name, login_ui, landing_path, is_default, enabled, sort_order)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
          [
            input.versionKey,
            input.name,
            input.loginUi,
            input.landingPath,
            input.enabled === false ? 0 : 1,
            input.sortOrder ?? 0,
          ]
        );
        return { success: true, id: Number(res.insertId) };
      }
    }),

  // 删除版本（管理员）：默认版本不可删除
  deleteVersion: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertSuperAdmin(ctx);
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });
      const [rows]: any = await conn.execute(
        `SELECT version_key, is_default FROM site_versions WHERE id = ? LIMIT 1`,
        [input.id]
      );
      const row = (rows as any[])[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "版本不存在" });
      if (Number(row.is_default) === 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "系统默认版本不可删除" });
      }
      await conn.execute(`DELETE FROM site_versions WHERE id = ?`, [input.id]);
      return { success: true };
    }),

  // 管理员为单个用户设置版本 / 切换权限 / 可切换范围
  setUserVersion: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        // 留空字符串表示清除该用户的单独版本设置（恢复为沿推荐链继承）
        versionKey: z.string().max(50).optional(),
        switchEnabled: z.boolean().optional(),
        // 允许切换到的版本key列表；空数组表示全部启用版本
        switchScope: z.array(z.string()).optional(),
        // 是否把版本设置同时下发到该用户名下所有下线
        applyToDescendants: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertSuperAdmin(ctx);
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });

      const sets: string[] = [];
      const vals: any[] = [];

      if (input.versionKey !== undefined) {
        const vk = input.versionKey.trim();
        if (vk) {
          // 校验版本存在
          const [vrows]: any = await conn.execute(
            `SELECT id FROM site_versions WHERE version_key = ? LIMIT 1`,
            [vk]
          );
          if ((vrows as any[]).length === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "指定的版本不存在" });
          }
          sets.push("version_key = ?");
          vals.push(vk);
        } else {
          sets.push("version_key = NULL");
        }
      }
      if (input.switchEnabled !== undefined) {
        sets.push("version_switch_enabled = ?");
        vals.push(input.switchEnabled ? 1 : 0);
      }
      if (input.switchScope !== undefined) {
        const scope = input.switchScope.map((s) => s.trim()).filter(Boolean).join(",");
        sets.push("version_switch_scope = ?");
        vals.push(scope || null);
      }

      if (sets.length === 0) return { success: true, affected: 0 };

      // 目标用户集合
      const targetIds = [input.userId];
      if (input.applyToDescendants) {
        const descendants = await collectDescendantIds(input.userId);
        targetIds.push(...descendants);
      }

      // 逐批更新（IN 列表）
      const placeholders = targetIds.map(() => "?").join(",");
      await conn.execute(
        `UPDATE users SET ${sets.join(", ")} WHERE id IN (${placeholders})`,
        [...vals, ...targetIds]
      );

      return { success: true, affected: targetIds.length };
    }),

  // 后台查看某用户的生效版本与来源（最顶层设置者是谁）
  userVersionInfo: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      assertSuperAdmin(ctx);
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });
      const resolved = await resolveUserVersion(input.userId);
      // 附带该用户自身的原始设置（用于后台编辑表单回填）
      const [rows]: any = await conn.execute(
        `SELECT version_key, version_switch_enabled, version_switch_scope FROM users WHERE id = ? LIMIT 1`,
        [input.userId]
      );
      const row = (rows as any[])[0] || {};
      return {
        resolved,
        selfSetting: {
          versionKey: row.version_key ? String(row.version_key) : "",
          switchEnabled: Number(row.version_switch_enabled) === 1,
          switchScope: row.version_switch_scope
            ? String(row.version_switch_scope).split(",").map((s: string) => s.trim()).filter(Boolean)
            : [],
        },
      };
    }),
});
