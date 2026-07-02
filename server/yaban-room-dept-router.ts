/**
 * 诊室 & 科室 CRUD 路由
 * 表：yaban_clinic_room / yaban_clinic_dept
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDbConnection } from "./db";

async function resolveTenantId(ctx: any): Promise<number> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("DB unavailable");
  const [rows] = (await conn.execute(
    `SELECT tenant_id FROM yaban_clinic_member WHERE user_id=? AND status='active' ORDER BY FIELD(role_key,'owner','doctor','assistant','receptionist','finance'), tenant_id ASC LIMIT 1`,
    [ctx.user.id]
  )) as any;
  const tid = (rows as any[])[0]?.tenant_id;
  if (!tid) throw new Error("未找到所属诊所");
  return Number(tid);
}

// ---- 通用 list/create/update/delete 工厂 ----
function makeRoomDeptRouter(table: "yaban_clinic_room" | "yaban_clinic_dept") {
  return router({
    list: protectedProcedure
      .input(z.object({ tenantId: z.number().int().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const conn = await getDbConnection();
        if (!conn) return [];
        const tenantId = input?.tenantId ?? (await resolveTenantId(ctx));
        const [rows] = (await conn.execute(
          `SELECT id, name, sort, is_active FROM \`${table}\` WHERE tenant_id=? ORDER BY sort ASC, id ASC`,
          [tenantId]
        )) as any;
        return (rows as any[]).map((r) => ({
          id: Number(r.id),
          name: r.name as string,
          sort: Number(r.sort),
          isActive: r.is_active === 1,
        }));
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(64),
        sort: z.number().int().optional(),
        tenantId: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const conn = await getDbConnection();
        if (!conn) throw new Error("DB unavailable");
        const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
        const [res] = (await conn.execute(
          `INSERT INTO \`${table}\` (tenant_id, name, sort) VALUES (?,?,?)`,
          [tenantId, input.name, input.sort ?? 0]
        )) as any;
        return { success: true, id: Number(res.insertId) };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).max(64).optional(),
        sort: z.number().int().optional(),
        isActive: z.boolean().optional(),
        tenantId: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const conn = await getDbConnection();
        if (!conn) throw new Error("DB unavailable");
        const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
        const sets: string[] = [];
        const params: any[] = [];
        if (input.name !== undefined) { sets.push("name=?"); params.push(input.name); }
        if (input.sort !== undefined) { sets.push("sort=?"); params.push(input.sort); }
        if (input.isActive !== undefined) { sets.push("is_active=?"); params.push(input.isActive ? 1 : 0); }
        if (sets.length === 0) return { success: true };
        params.push(input.id, tenantId);
        await conn.execute(
          `UPDATE \`${table}\` SET ${sets.join(",")} WHERE id=? AND tenant_id=?`,
          params
        );
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        tenantId: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const conn = await getDbConnection();
        if (!conn) throw new Error("DB unavailable");
        const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
        await conn.execute(
          `DELETE FROM \`${table}\` WHERE id=? AND tenant_id=?`,
          [input.id, tenantId]
        );
        return { success: true };
      }),
  });
}

export const yabanRoomRouter = makeRoomDeptRouter("yaban_clinic_room");
export const yabanDeptRouter = makeRoomDeptRouter("yaban_clinic_dept");
