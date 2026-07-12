/**
 * 牙伴齿科管理 - 诊疗记录后端路由
 *
 * 表：
 *   yaban_treatment       — 诊疗记录主表（每次就诊一条）
 *   yaban_treatment_tooth — 牙位明细（每条记录可关联多个牙位）
 */
import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

const DEFAULT_TENANT_ID = 1;

// ============ 工具函数 ============
async function resolveTenantId(ctx: any): Promise<number> {
  const conn = await getDbConnection();
  if (!conn) return DEFAULT_TENANT_ID;
  try {
    const [rows] = (await conn.execute(
      `SELECT tenant_id FROM yaban_clinic_member WHERE user_id=? AND status='active' ORDER BY FIELD(role_key,'owner','doctor','assistant','receptionist','finance'), tenant_id ASC LIMIT 1`,
      [ctx.user.id]
    )) as any;
    const tid = (rows as any[])[0]?.tenant_id;
    return tid ? Number(tid) : DEFAULT_TENANT_ID;
  } catch {
    return DEFAULT_TENANT_ID;
  }
}

// ============ 建表 ============
let treatmentTablesReady = false;
async function ensureTreatmentTables(conn: any) {
  if (treatmentTablesReady) return;
  // 诊疗记录主表
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_treatment (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 1,
      customer_id BIGINT UNSIGNED NOT NULL,
      treatment_no VARCHAR(40) NOT NULL,
      visit_at DATETIME NOT NULL,
      doctor VARCHAR(64),
      assistant VARCHAR(64),
      dept VARCHAR(64),
      room VARCHAR(64),
      chief_complaint TEXT,
      diagnosis TEXT,
      treatment_plan TEXT,
      treatment_note TEXT,
      next_visit_plan VARCHAR(255),
      status VARCHAR(16) NOT NULL DEFAULT 'completed',
      charge_id BIGINT UNSIGNED DEFAULT NULL,
      appointment_id BIGINT UNSIGNED DEFAULT NULL,
      created_by BIGINT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_customer (customer_id),
      KEY idx_tenant_customer (tenant_id, customer_id),
      KEY idx_visit_at (tenant_id, visit_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 牙位明细表（FDI 编号体系，11-48）
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_treatment_tooth (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      treatment_id BIGINT UNSIGNED NOT NULL,
      tooth_no VARCHAR(8) NOT NULL,
      condition_code VARCHAR(32),
      condition_label VARCHAR(64),
      treatment_item VARCHAR(128),
      note VARCHAR(255),
      PRIMARY KEY (id),
      KEY idx_treatment (treatment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  treatmentTablesReady = true;
}

// 生成诊疗单号：ZL + yyyyMMdd + 4位序号
async function nextTreatmentNo(conn: any, tenantId: number): Promise<string> {
  const today = new Date();
  const ymd =
    String(today.getFullYear()) +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const prefix = `ZL${ymd}`;
  const [rows] = (await conn.execute(
    `SELECT treatment_no FROM yaban_treatment WHERE tenant_id=? AND treatment_no LIKE ? ORDER BY id DESC LIMIT 1`,
    [tenantId, `${prefix}%`]
  )) as any;
  const last = (rows as any[])[0]?.treatment_no as string | undefined;
  const seq = last ? parseInt(last.slice(-4), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// ============ 路由 ============
export const yabanTreatmentRouter = router({
  // 查询患者的诊疗记录列表
  list: protectedProcedure
    .input(
      z.object({
        customerId: z.number().int().positive(),
        tenantId: z.number().int().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureTreatmentTables(conn);
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const offset = (input.page - 1) * input.pageSize;
      const [rows] = (await conn.execute(
        `SELECT t.id, t.treatment_no, t.visit_at, t.doctor, t.assistant, t.dept, t.room,
                t.chief_complaint, t.diagnosis, t.treatment_plan, t.treatment_note,
                t.next_visit_plan, t.status, t.charge_id, t.appointment_id, t.created_at
         FROM yaban_treatment t
         WHERE t.tenant_id=? AND t.customer_id=?
         ORDER BY t.visit_at DESC
         LIMIT ? OFFSET ?`,
        [tenantId, input.customerId, input.pageSize, offset]
      )) as any;
      const [countRows] = (await conn.execute(
        `SELECT COUNT(*) AS cnt FROM yaban_treatment WHERE tenant_id=? AND customer_id=?`,
        [tenantId, input.customerId]
      )) as any;
      const total = Number((countRows as any[])[0]?.cnt ?? 0);
      return { list: rows as any[], total, page: input.page, pageSize: input.pageSize };
    }),

  // 查询单条诊疗记录详情（含牙位明细）
  detail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureTreatmentTables(conn);
      const tenantId = await resolveTenantId(ctx);
      const [rows] = (await conn.execute(
        `SELECT * FROM yaban_treatment WHERE id=? AND tenant_id=? LIMIT 1`,
        [input.id, tenantId]
      )) as any;
      const record = (rows as any[])[0];
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "诊疗记录不存在" });
      const [toothRows] = (await conn.execute(
        `SELECT * FROM yaban_treatment_tooth WHERE treatment_id=? ORDER BY id ASC`,
        [input.id]
      )) as any;
      return { ...record, teeth: toothRows as any[] };
    }),

  // 新建诊疗记录
  create: protectedProcedure
    .input(
      z.object({
        customerId: z.number().int().positive(),
        tenantId: z.number().int().optional(),
        visitAt: z.string(),
        doctor: z.string().max(64).optional(),
        assistant: z.string().max(64).optional(),
        dept: z.string().max(64).optional(),
        room: z.string().max(64).optional(),
        chiefComplaint: z.string().max(500).optional(),
        diagnosis: z.string().max(1000).optional(),
        treatmentPlan: z.string().max(1000).optional(),
        treatmentNote: z.string().max(2000).optional(),
        nextVisitPlan: z.string().max(255).optional(),
        status: z.enum(["completed", "ongoing", "cancelled"]).default("completed"),
        chargeId: z.number().int().optional(),
        appointmentId: z.number().int().optional(),
        teeth: z
          .array(
            z.object({
              toothNo: z.string().max(8),
              conditionCode: z.string().max(32).optional(),
              conditionLabel: z.string().max(64).optional(),
              treatmentItem: z.string().max(128).optional(),
              note: z.string().max(255).optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureTreatmentTables(conn);
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const treatmentNo = await nextTreatmentNo(conn, tenantId);
      const [res] = (await conn.execute(
        `INSERT INTO yaban_treatment
          (tenant_id, customer_id, treatment_no, visit_at, doctor, assistant, dept, room,
           chief_complaint, diagnosis, treatment_plan, treatment_note, next_visit_plan,
           status, charge_id, appointment_id, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,
          input.customerId,
          treatmentNo,
          input.visitAt,
          input.doctor ?? null,
          input.assistant ?? null,
          input.dept ?? null,
          input.room ?? null,
          input.chiefComplaint ?? null,
          input.diagnosis ?? null,
          input.treatmentPlan ?? null,
          input.treatmentNote ?? null,
          input.nextVisitPlan ?? null,
          input.status,
          input.chargeId ?? null,
          input.appointmentId ?? null,
          ctx.user.id,
        ]
      )) as any;
      const treatmentId = Number(res.insertId);
      // 批量插入牙位明细
      if (input.teeth && input.teeth.length > 0) {
        for (const t of input.teeth) {
          await conn.execute(
            `INSERT INTO yaban_treatment_tooth (treatment_id, tooth_no, condition_code, condition_label, treatment_item, note)
             VALUES (?,?,?,?,?,?)`,
            [treatmentId, t.toothNo, t.conditionCode ?? null, t.conditionLabel ?? null, t.treatmentItem ?? null, t.note ?? null]
          );
        }
      }
      return { success: true, id: treatmentId, treatmentNo };
    }),

  // 更新诊疗记录
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        visitAt: z.string().optional(),
        doctor: z.string().max(64).optional(),
        assistant: z.string().max(64).optional(),
        dept: z.string().max(64).optional(),
        room: z.string().max(64).optional(),
        chiefComplaint: z.string().max(500).optional(),
        diagnosis: z.string().max(1000).optional(),
        treatmentPlan: z.string().max(1000).optional(),
        treatmentNote: z.string().max(2000).optional(),
        nextVisitPlan: z.string().max(255).optional(),
        status: z.enum(["completed", "ongoing", "cancelled"]).optional(),
        teeth: z
          .array(
            z.object({
              toothNo: z.string().max(8),
              conditionCode: z.string().max(32).optional(),
              conditionLabel: z.string().max(64).optional(),
              treatmentItem: z.string().max(128).optional(),
              note: z.string().max(255).optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureTreatmentTables(conn);
      const tenantId = await resolveTenantId(ctx);
      // 校验记录存在且属于当前诊所
      const [checkRows] = (await conn.execute(
        `SELECT id FROM yaban_treatment WHERE id=? AND tenant_id=? LIMIT 1`,
        [input.id, tenantId]
      )) as any;
      if ((checkRows as any[]).length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "诊疗记录不存在" });
      }
      const sets: string[] = [];
      const vals: any[] = [];
      if (input.visitAt !== undefined) { sets.push("visit_at=?"); vals.push(input.visitAt); }
      if (input.doctor !== undefined) { sets.push("doctor=?"); vals.push(input.doctor || null); }
      if (input.assistant !== undefined) { sets.push("assistant=?"); vals.push(input.assistant || null); }
      if (input.dept !== undefined) { sets.push("dept=?"); vals.push(input.dept || null); }
      if (input.room !== undefined) { sets.push("room=?"); vals.push(input.room || null); }
      if (input.chiefComplaint !== undefined) { sets.push("chief_complaint=?"); vals.push(input.chiefComplaint || null); }
      if (input.diagnosis !== undefined) { sets.push("diagnosis=?"); vals.push(input.diagnosis || null); }
      if (input.treatmentPlan !== undefined) { sets.push("treatment_plan=?"); vals.push(input.treatmentPlan || null); }
      if (input.treatmentNote !== undefined) { sets.push("treatment_note=?"); vals.push(input.treatmentNote || null); }
      if (input.nextVisitPlan !== undefined) { sets.push("next_visit_plan=?"); vals.push(input.nextVisitPlan || null); }
      if (input.status !== undefined) { sets.push("status=?"); vals.push(input.status); }
      if (sets.length > 0) {
        vals.push(input.id);
        await conn.execute(`UPDATE yaban_treatment SET ${sets.join(",")} WHERE id=?`, vals);
      }
      // 更新牙位：先删后插
      if (input.teeth !== undefined) {
        await conn.execute(`DELETE FROM yaban_treatment_tooth WHERE treatment_id=?`, [input.id]);
        for (const t of input.teeth) {
          await conn.execute(
            `INSERT INTO yaban_treatment_tooth (treatment_id, tooth_no, condition_code, condition_label, treatment_item, note)
             VALUES (?,?,?,?,?,?)`,
            [input.id, t.toothNo, t.conditionCode ?? null, t.conditionLabel ?? null, t.treatmentItem ?? null, t.note ?? null]
          );
        }
      }
      return { success: true };
    }),

  // 删除诊疗记录
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureTreatmentTables(conn);
      const tenantId = await resolveTenantId(ctx);
      const [checkRows] = (await conn.execute(
        `SELECT id FROM yaban_treatment WHERE id=? AND tenant_id=? LIMIT 1`,
        [input.id, tenantId]
      )) as any;
      if ((checkRows as any[]).length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "诊疗记录不存在" });
      }
      await conn.execute(`DELETE FROM yaban_treatment_tooth WHERE treatment_id=?`, [input.id]);
      await conn.execute(`DELETE FROM yaban_treatment WHERE id=?`, [input.id]);
      return { success: true };
    }),
});
