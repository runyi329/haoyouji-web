/**
 * 牙伴齿科管理 - AI 智能估值 后端路由
 *
 * 设计原则：
 *   - 原生 SQL；严禁 Emoji；全部按医院(tenant_id)隔离。
 *   - 数据存储于 yaban_valuation（一家医院一行，payload 存完整估值快照 JSON）。
 *   - 读写权限复用牙伴权限体系：
 *       创始人/super_admin 可读写任意医院；
 *       普通成员仅可读写自己所属医院（须为该院 active 成员）。
 *   - 模拟院(tenant=9999) 所有用户均为 owner，可读写其演示数据。
 */
import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import { ensureRoleTables, isYabanFounder, YABAN_MODEL_TENANT_ID } from "./yaban-role-router";

const DEFAULT_TENANT_ID = 1;

// 解析当前用户默认医院（取其 active 成员中优先级最高的一家）
async function resolveTenantId(ctx: any): Promise<number> {
  const conn = await getDbConnection();
  if (!conn) return DEFAULT_TENANT_ID;
  try {
    const [rows] = (await conn.execute(
      `SELECT tenant_id FROM yaban_clinic_member WHERE user_id=? AND status='active'
       ORDER BY FIELD(role_key,'owner','doctor','assistant','receptionist','finance'), tenant_id ASC LIMIT 1`,
      [ctx.user.id]
    )) as any;
    const tid = (rows as any[])[0]?.tenant_id;
    return tid ? Number(tid) : DEFAULT_TENANT_ID;
  } catch {
    return DEFAULT_TENANT_ID;
  }
}

// 校验当前用户对该医院是否有访问权（创始人放行；否则须为该院 active 成员）
async function assertCanAccess(conn: any, ctx: any, tenantId: number): Promise<void> {
  if (await isYabanFounder(ctx)) return;
  const [rows] = (await conn.execute(
    `SELECT id FROM yaban_clinic_member WHERE user_id=? AND tenant_id=? AND status='active' LIMIT 1`,
    [ctx.user.id, tenantId]
  )) as any;
  if (!(rows as any[])[0]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "无权访问该医院估值数据" });
  }
}

export const yabanValuationRouter = router({
  // 读取某医院的估值数据
  get: protectedProcedure
    .input(z.object({ tenantId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      const tenantId = input?.tenantId ?? (await resolveTenantId(ctx));
      await assertCanAccess(conn, ctx, tenantId);

      const [rows] = (await conn.execute(
        `SELECT tenant_id, valuation, base_valuation, dynamic_premium, confidence, change_pct, risk_overall, payload, updated_at
         FROM yaban_valuation WHERE tenant_id=? LIMIT 1`,
        [tenantId]
      )) as any;
      const row = (rows as any[])[0];
      if (!row) return { tenantId, exists: false, data: null as any };

      let data: any = {};
      try {
        data = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload || {};
      } catch {
        data = {};
      }
      return { tenantId, exists: true, data, updatedAt: row.updated_at };
    }),

  // 保存/更新某医院的估值数据
  save: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().optional(),
        data: z.record(z.string(), z.any()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureRoleTables(conn);
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      await assertCanAccess(conn, ctx, tenantId);

      const d = input.data || {};
      await conn.execute(
        `INSERT INTO yaban_valuation (tenant_id, valuation, base_valuation, dynamic_premium, confidence, change_pct, risk_overall, payload, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)
         ON DUPLICATE KEY UPDATE
           valuation=VALUES(valuation), base_valuation=VALUES(base_valuation),
           dynamic_premium=VALUES(dynamic_premium), confidence=VALUES(confidence),
           change_pct=VALUES(change_pct), risk_overall=VALUES(risk_overall),
           payload=VALUES(payload), updated_by=VALUES(updated_by)`,
        [
          tenantId,
          String(d.valuation ?? ""),
          String(d.baseValuation ?? ""),
          String(d.dynamicPremium ?? ""),
          String(d.confidence ?? ""),
          String(d.change ?? ""),
          String(d.riskOverall ?? ""),
          JSON.stringify(d),
          ctx.user.id,
        ]
      );
      return { ok: true, tenantId };
    }),
});
