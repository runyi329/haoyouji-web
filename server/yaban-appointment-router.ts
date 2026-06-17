/**
 * 牙伴齿科管理 - 预约 & 排班后端路由
 *
 * 表：
 *   yaban_appointment      — 预约记录
 *   yaban_shift_template   — 员工班次模板（周期性上班时间）
 *   yaban_shift_override   — 班次单日覆盖（调班/请假）
 */
import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

// ============ 常量 ============
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

// ============ 预约路由 ============
export const yabanAppointmentRouter = router({
  // 按日期查询预约列表
  listByDate: protectedProcedure
    .input(z.object({
      date: z.string(),           // YYYY-MM-DD
      tenantId: z.number().int().optional(),
      doctor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const where: string[] = [`tenant_id = ?`, `appoint_date = ?`];
      const params: any[] = [tenantId, input.date];
      if (input.doctor && input.doctor !== "全部") {
        where.push(`doctor = ?`);
        params.push(input.doctor);
      }
      const [rows] = (await conn.execute(
        `SELECT id, patient_id, patient_name, patient_mobile, patient_gender, patient_age,
                doctor, room, project, appoint_date, appoint_time, end_time, duration,
                status, remark, created_by, created_at
         FROM yaban_appointment
         WHERE ${where.join(" AND ")}
         ORDER BY appoint_time ASC`,
        params
      )) as any;
      return (rows as any[]).map((r) => ({
        id: Number(r.id),
        patientId: r.patient_id ? Number(r.patient_id) : null,
        patientName: r.patient_name || "",
        patientMobile: r.patient_mobile || "",
        patientGender: r.patient_gender || "未知",
        patientAge: r.patient_age ? Number(r.patient_age) : null,
        doctor: r.doctor || "",
        room: r.room || "",
        project: r.project || "",
        appointDate: r.appoint_date instanceof Date
          ? r.appoint_date.toISOString().slice(0, 10)
          : String(r.appoint_date || ""),
        appointTime: r.appoint_time || "",
        endTime: r.end_time || "",
        duration: r.duration ? Number(r.duration) : 30,
        status: r.status || "booked",
        remark: r.remark || "",
      }));
    }),

  // 按月份统计每天预约负荷（用于日历热力图，与医生进度环口径统一：基于预约时长真实占用率）
  // 返回：{ [date]: { cnt: 条数, minutes: 总时长(分钟), doctors: 参与医生数 } }
  // 同时保留扁平的 cnt 映射以向后兼容旧调用方。
  monthStats: protectedProcedure
    .input(z.object({
      year: z.number().int(),
      month: z.number().int(),   // 1-12
      tenantId: z.number().int().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return {};
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const monthStr = `${input.year}-${String(input.month).padStart(2, "0")}`;
      const [rows] = (await conn.execute(
        `SELECT appoint_date,
                COUNT(*) AS cnt,
                COALESCE(SUM(CASE WHEN duration > 0 THEN duration ELSE 30 END), 0) AS minutes,
                COUNT(DISTINCT NULLIF(doctor, '')) AS doctors
         FROM yaban_appointment
         WHERE tenant_id = ? AND DATE_FORMAT(appoint_date,'%Y-%m') = ?
           AND status NOT IN ('cancelled','missed')
         GROUP BY appoint_date`,
        [tenantId, monthStr]
      )) as any;
      const result: Record<string, { cnt: number; minutes: number; doctors: number }> = {};
      for (const r of rows as any[]) {
        const d = r.appoint_date instanceof Date
          ? r.appoint_date.toISOString().slice(0, 10)
          : String(r.appoint_date || "");
        result[d] = {
          cnt: Number(r.cnt || 0),
          minutes: Number(r.minutes || 0),
          doctors: Number(r.doctors || 0),
        };
      }
      return result;
    }),

  // 历史预约负荷基准（用于日历热力图自适应着色）
  // 取该院全部历史「营业日」每日预约数，计算分位数 P10/P50/P90 作为颜色锚点
  loadBaseline: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      const fallback = { p10: 1, p50: 4, p90: 12, sampleDays: 0 };
      if (!conn) return fallback;
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      // 每个营业日（有预约的日子）的预约数；排除已取消/爽约
      const [rows] = (await conn.execute(
        `SELECT appoint_date, COUNT(*) AS cnt
         FROM yaban_appointment
         WHERE tenant_id = ?
           AND status NOT IN ('cancelled','missed')
         GROUP BY appoint_date
         HAVING cnt > 0`,
        [tenantId]
      )) as any;
      const counts = (rows as any[]).map((r) => Number(r.cnt || 0)).filter((n) => n > 0).sort((a, b) => a - b);
      if (counts.length === 0) return fallback;
      const q = (p: number) => {
        const idx = (counts.length - 1) * p;
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        if (lo === hi) return counts[lo];
        return counts[lo] + (counts[hi] - counts[lo]) * (idx - lo);
      };
      let p10 = q(0.10);
      let p50 = q(0.50);
      let p90 = q(0.90);
      // 防御：保证 p10 < p50 < p90，避免样本极端时区间塌缩
      if (p90 <= p10) { p90 = p10 + 1; }
      if (p50 <= p10) { p50 = (p10 + p90) / 2; }
      if (p50 >= p90) { p50 = (p10 + p90) / 2; }
      return { p10, p50, p90, sampleDays: counts.length };
    }),

  // 新建预约
  create: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().optional(),
      patientId: z.number().int().optional(),
      patientName: z.string().min(1).max(64),
      patientMobile: z.string().max(32).optional(),
      patientGender: z.string().max(8).optional(),
      patientAge: z.number().int().optional(),
      doctor: z.string().max(64).optional(),
      room: z.string().max(64).optional(),
      project: z.string().max(128).optional(),
      appointDate: z.string(),   // YYYY-MM-DD
      appointTime: z.string(),   // HH:MM
      endTime: z.string().optional(),
      duration: z.number().int().optional(),
      status: z.string().max(32).optional(),
      remark: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const [res] = (await conn.execute(
        `INSERT INTO yaban_appointment
           (tenant_id, patient_id, patient_name, patient_mobile, patient_gender, patient_age,
            doctor, room, project, appoint_date, appoint_time, end_time, duration,
            status, remark, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,
          input.patientId ?? null,
          input.patientName,
          input.patientMobile ?? null,
          input.patientGender ?? "未知",
          input.patientAge ?? null,
          input.doctor ?? null,
          input.room ?? null,
          input.project ?? null,
          input.appointDate,
          input.appointTime,
          input.endTime ?? null,
          input.duration ?? 30,
          input.status ?? "booked",
          input.remark ?? null,
          ctx.user.id,
        ]
      )) as any;
      return { success: true, id: Number(res.insertId) };
    }),

  // 更新预约状态（带 tenant 校验，禁止跨医院操作）
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      status: z.string().max(32),
      tenantId: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const [res] = (await conn.execute(
        `UPDATE yaban_appointment SET status=? WHERE id=? AND tenant_id=?`,
        [input.status, input.id, tenantId]
      )) as any;
      if (!res || res.affectedRows === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "预约不存在或无权操作" });
      }
      return { success: true };
    }),

  // 删除预约（带 tenant 校验，禁止跨医院操作）
  delete: protectedProcedure
    .input(z.object({ id: z.number().int(), tenantId: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const [res] = (await conn.execute(
        `DELETE FROM yaban_appointment WHERE id=? AND tenant_id=?`,
        [input.id, tenantId]
      )) as any;
      if (!res || res.affectedRows === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "预约不存在或无权操作" });
      }
      return { success: true };
    }),

  // 按ID查询单个预约（带 tenant 校验，禁止跨医院读取）
  getById: protectedProcedure
    .input(z.object({ id: z.number().int(), tenantId: z.number().int().optional() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return null;
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const [rows] = (await conn.execute(
        `SELECT id, patient_id, patient_name, patient_mobile, patient_gender, patient_age,
                doctor, consultant, assistant, room, department, project, source,
                appoint_date, appoint_time, end_time, duration, status, remark
         FROM yaban_appointment WHERE id=? AND tenant_id=? LIMIT 1`,
        [input.id, tenantId]
      )) as any;
      const r = (rows as any[])[0];
      if (!r) return null;
      return {
        id: Number(r.id),
        patientId: r.patient_id ? Number(r.patient_id) : null,
        patientName: r.patient_name || "",
        patientMobile: r.patient_mobile || "",
        patientGender: r.patient_gender || "未知",
        patientAge: r.patient_age ? Number(r.patient_age) : null,
        doctor: r.doctor || "",
        consultant: r.consultant || "",
        assistant: r.assistant || "",
        room: r.room || "",
        department: r.department || "",
        project: r.project || "",
        source: r.source || "",
        date: r.appoint_date instanceof Date
          ? r.appoint_date.toISOString().slice(0, 10)
          : String(r.appoint_date || ""),
        appointTime: r.appoint_time || "",
        endTime: r.end_time || "",
        duration: r.duration ? Number(r.duration) : 30,
        status: r.status || "booked",
        remark: r.remark || "",
      };
    }),

  // 获取门店员工列表
  listMembers: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const tenantId = input?.tenantId ?? (await resolveTenantId(ctx));
      const [rows] = (await conn.execute(
        `SELECT m.user_id, u.name, m.role_key
         FROM yaban_clinic_member m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.tenant_id=? AND m.status='active'
         ORDER BY FIELD(m.role_key,'owner','doctor','nurse','assistant','receptionist','finance'), m.id ASC`,
        [tenantId]
      )) as any;
      return (rows as any[]).map((r) => ({
        userId: Number(r.user_id),
        name: r.name || "",
        roleKey: r.role_key || "doctor",
      }));
    }),
});

// ============ 排班路由 ============
export const yabanShiftRouter = router({
  // 获取门店所有员工的班次模板
  listTemplates: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const tenantId = input?.tenantId ?? (await resolveTenantId(ctx));
      const [rows] = (await conn.execute(
        `SELECT t.id, t.staff_user_id, t.staff_name, t.role_key,
                t.work_start, t.work_end, t.break_start, t.break_end,
                t.work_days, t.overtime_start, t.overtime_end, t.color, t.is_active,
                u.name AS user_name, u.avatar
         FROM yaban_shift_template t
         LEFT JOIN users u ON u.id = t.staff_user_id
         WHERE t.tenant_id = ? AND t.is_active = 1
         ORDER BY FIELD(t.role_key,'owner','doctor','nurse','assistant','receptionist','finance'), t.id ASC`,
        [tenantId]
      )) as any;
      return (rows as any[]).map((r) => ({
        id: Number(r.id),
        staffUserId: Number(r.staff_user_id),
        staffName: r.user_name || r.staff_name || "",
        roleKey: r.role_key || "doctor",
        workStart: r.work_start || "09:00",
        workEnd: r.work_end || "18:00",
        breakStart: r.break_start || "12:00",
        breakEnd: r.break_end || "13:00",
        workDays: (r.work_days || "1,2,3,4,5").split(",").map(Number),
        overtimeStart: r.overtime_start || null,
        overtimeEnd: r.overtime_end || null,
        color: r.color || "#1E88D6",
        avatar: r.avatar || null,
      }));
    }),

  // 获取某周的班次（模板 + 单日覆盖合并）
  weekSchedule: protectedProcedure
    .input(z.object({
      weekStart: z.string(),   // YYYY-MM-DD（周一）
      tenantId: z.number().int().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return { templates: [], overrides: [] };
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      // 模板
      const [tplRows] = (await conn.execute(
        `SELECT t.id, t.staff_user_id, t.staff_name, t.role_key,
                t.work_start, t.work_end, t.break_start, t.break_end,
                t.work_days, t.overtime_start, t.overtime_end, t.color,
                u.name AS user_name, u.avatar
         FROM yaban_shift_template t
         LEFT JOIN users u ON u.id = t.staff_user_id
         WHERE t.tenant_id = ? AND t.is_active = 1
         ORDER BY FIELD(t.role_key,'owner','doctor','nurse','assistant','receptionist','finance'), t.id ASC`,
        [tenantId]
      )) as any;
      // 本周单日覆盖
      const [ovRows] = (await conn.execute(
        `SELECT staff_user_id, override_date, shift_type,
                work_start, work_end, break_start, break_end,
                overtime_start, overtime_end, note
         FROM yaban_shift_override
         WHERE tenant_id = ?
           AND override_date >= ? AND override_date < DATE_ADD(?, INTERVAL 7 DAY)`,
        [tenantId, input.weekStart, input.weekStart]
      )) as any;
      const templates = (tplRows as any[]).map((r) => ({
        id: Number(r.id),
        staffUserId: Number(r.staff_user_id),
        staffName: r.user_name || r.staff_name || "",
        roleKey: r.role_key || "doctor",
        workStart: r.work_start || "09:00",
        workEnd: r.work_end || "18:00",
        breakStart: r.break_start || "12:00",
        breakEnd: r.break_end || "13:00",
        workDays: (r.work_days || "1,2,3,4,5").split(",").map(Number),
        overtimeStart: r.overtime_start || null,
        overtimeEnd: r.overtime_end || null,
        color: r.color || "#1E88D6",
        avatar: r.avatar || null,
      }));
      const overrides = (ovRows as any[]).map((r) => ({
        staffUserId: Number(r.staff_user_id),
        overrideDate: r.override_date instanceof Date
          ? r.override_date.toISOString().slice(0, 10)
          : String(r.override_date || ""),
        shiftType: r.shift_type || "custom",
        workStart: r.work_start || null,
        workEnd: r.work_end || null,
        breakStart: r.break_start || null,
        breakEnd: r.break_end || null,
        overtimeStart: r.overtime_start || null,
        overtimeEnd: r.overtime_end || null,
        note: r.note || "",
      }));
      return { templates, overrides };
    }),

  // 保存/更新班次模板
  saveTemplate: protectedProcedure
    .input(z.object({
      id: z.number().int().optional(),
      tenantId: z.number().int().optional(),
      staffUserId: z.number().int(),
      staffName: z.string().max(64).optional(),
      roleKey: z.string().max(32).optional(),
      workStart: z.string().max(8),
      workEnd: z.string().max(8),
      breakStart: z.string().max(8).optional(),
      breakEnd: z.string().max(8).optional(),
      workDays: z.array(z.number().int()),
      overtimeStart: z.string().max(8).optional(),
      overtimeEnd: z.string().max(8).optional(),
      color: z.string().max(16).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const workDaysStr = input.workDays.join(",");
      if (input.id) {
        await conn.execute(
          `UPDATE yaban_shift_template SET
             work_start=?, work_end=?, break_start=?, break_end=?,
             work_days=?, overtime_start=?, overtime_end=?, color=?
           WHERE id=? AND tenant_id=?`,
          [
            input.workStart, input.workEnd,
            input.breakStart ?? "12:00", input.breakEnd ?? "13:00",
            workDaysStr,
            input.overtimeStart ?? null, input.overtimeEnd ?? null,
            input.color ?? "#1E88D6",
            input.id, tenantId,
          ]
        );
        return { success: true, id: input.id };
      }
      // 新建：先查是否已有该员工的模板
      const [exist] = (await conn.execute(
        `SELECT id FROM yaban_shift_template WHERE tenant_id=? AND staff_user_id=? LIMIT 1`,
        [tenantId, input.staffUserId]
      )) as any;
      const existRow = (exist as any[])[0];
      if (existRow) {
        await conn.execute(
          `UPDATE yaban_shift_template SET
             staff_name=?, role_key=?,
             work_start=?, work_end=?, break_start=?, break_end=?,
             work_days=?, overtime_start=?, overtime_end=?, color=?, is_active=1
           WHERE id=?`,
          [
            input.staffName ?? "", input.roleKey ?? "doctor",
            input.workStart, input.workEnd,
            input.breakStart ?? "12:00", input.breakEnd ?? "13:00",
            workDaysStr,
            input.overtimeStart ?? null, input.overtimeEnd ?? null,
            input.color ?? "#1E88D6",
            existRow.id,
          ]
        );
        return { success: true, id: Number(existRow.id) };
      }
      const [res] = (await conn.execute(
        `INSERT INTO yaban_shift_template
           (tenant_id, staff_user_id, staff_name, role_key,
            work_start, work_end, break_start, break_end,
            work_days, overtime_start, overtime_end, color)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId, input.staffUserId, input.staffName ?? "", input.roleKey ?? "doctor",
          input.workStart, input.workEnd,
          input.breakStart ?? "12:00", input.breakEnd ?? "13:00",
          workDaysStr,
          input.overtimeStart ?? null, input.overtimeEnd ?? null,
          input.color ?? "#1E88D6",
        ]
      )) as any;
      return { success: true, id: Number(res.insertId) };
    }),

  // 单日覆盖（调班/请假）
  saveOverride: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().optional(),
      staffUserId: z.number().int(),
      overrideDate: z.string(),
      shiftType: z.string().max(16),
      workStart: z.string().max(8).optional(),
      workEnd: z.string().max(8).optional(),
      breakStart: z.string().max(8).optional(),
      breakEnd: z.string().max(8).optional(),
      overtimeStart: z.string().max(8).optional(),
      overtimeEnd: z.string().max(8).optional(),
      note: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      await conn.execute(
        `INSERT INTO yaban_shift_override
           (tenant_id, staff_user_id, override_date, shift_type,
            work_start, work_end, break_start, break_end,
            overtime_start, overtime_end, note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           shift_type=VALUES(shift_type),
           work_start=VALUES(work_start), work_end=VALUES(work_end),
           break_start=VALUES(break_start), break_end=VALUES(break_end),
           overtime_start=VALUES(overtime_start), overtime_end=VALUES(overtime_end),
           note=VALUES(note)`,
        [
          tenantId, input.staffUserId, input.overrideDate, input.shiftType,
          input.workStart ?? null, input.workEnd ?? null,
          input.breakStart ?? null, input.breakEnd ?? null,
          input.overtimeStart ?? null, input.overtimeEnd ?? null,
          input.note ?? null,
        ]
      );
      return { success: true };
    }),
});
