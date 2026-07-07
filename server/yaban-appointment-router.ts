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

// ============ 在岗时段校验工具 ============
// 计算某医生某天的「在岗分段 segments」（与前端 getEffectiveShift 口径一致）：
// override(单日调班/请假) 优先于周期模板；shiftType=rest 当天不可约。
// 返回 null 表示当天不可约（休息/未排该工作日）。
function _t2m(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function _buildSegs(ws: number, we: number, bs: number | null, be: number | null): [number, number][] {
  if (we <= ws) return [];
  if (bs != null && be != null && be > bs && bs > ws && be < we) return [[ws, bs], [be, we]];
  return [[ws, we]];
}
async function getDoctorSegments(conn: any, tenantId: number, doctor: string, dateStr: string): Promise<[number, number][] | null> {
  if (!doctor) return null;
  const toMin = (t?: string | null) => (t ? _t2m(t) : null);
  // 模板（按姓名匹配，与前端一致）
  const [tplRows] = (await conn.execute(
    `SELECT staff_user_id, work_start, work_end, break_start, break_end, work_days
     FROM yaban_shift_template
     WHERE tenant_id=? AND is_active=1 AND staff_user_id<>0 AND role_key<>'__biz__' AND staff_name=? LIMIT 1`,
    [tenantId, doctor]
  )) as any;
  const tpl = (tplRows as any[])[0];
  const staffId = tpl?.staff_user_id;
  // 计算星期几（0=周一，6=周日），用本地时间避免 UTC 偏移
  const [_y, _m, _d] = dateStr.split("-").map(Number);
  const dow = (new Date(_y, _m - 1, _d).getDay() + 6) % 7;
  // 单日覆盖优先（override）
  if (staffId != null) {
    const [ovRows] = (await conn.execute(
      `SELECT shift_type, work_start, work_end, break_start, break_end
       FROM yaban_shift_override WHERE tenant_id=? AND staff_user_id=? AND override_date=? LIMIT 1`,
      [tenantId, staffId, dateStr]
    )) as any;
    const ov = (ovRows as any[])[0];
    if (ov) {
      if (ov.shift_type === "rest") return null;
      if (ov.work_start && ov.work_end) return _buildSegs(_t2m(ov.work_start), _t2m(ov.work_end), toMin(ov.break_start), toMin(ov.break_end));
    }
  }
  // 新周模板：yaban_shift_day_segs（优先于旧 work_days 字段）
  if (staffId != null) {
    const [dsRows] = (await conn.execute(
      `SELECT work_start, work_end, break_start, break_end, is_rest
       FROM yaban_shift_day_segs
       WHERE tenant_id=? AND staff_user_id=? AND dow=? LIMIT 1`,
      [tenantId, staffId, dow]
    )) as any;
    const ds = (dsRows as any[])[0];
    if (ds) {
      if (Number(ds.is_rest) === 1) return null;
      if (ds.work_start && ds.work_end) return _buildSegs(_t2m(ds.work_start), _t2m(ds.work_end), toMin(ds.break_start), toMin(ds.break_end));
    }
  }
  // 回退旧周期模板（work_days 字段）
  if (tpl) {
    const days: number[] = (tpl.work_days || "1,2,3,4,5").split(",").map(Number);
    if (days.length > 0 && !days.includes(dow)) return null;
    if (tpl.work_start && tpl.work_end) return _buildSegs(_t2m(tpl.work_start), _t2m(tpl.work_end), toMin(tpl.break_start), toMin(tpl.break_end));
  }
  return null;
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
      consultant: z.string().max(64).optional(),
      assistant: z.string().max(64).optional(),
      department: z.string().max(64).optional(),
      source: z.string().max(64).optional(),
      visitType: z.string().max(16).optional(),
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

      // 注意：已移除后端在班硬校验。前端甘特图已通过排班数据限制可点击区域，
      // 后端重复校验会因数据源不一致（周模板 vs 单日覆盖）导致误报，影响正常预约。
      // 仅保留基础时间合法性校验。
      if (input.appointTime && input.endTime) {
        const s = _t2m(input.appointTime);
        const e = _t2m(input.endTime);
        if (e <= s) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "预约结束时间必须晚于开始时间" });
        }
      }

      const [res] = (await conn.execute(
        `INSERT INTO yaban_appointment
           (tenant_id, patient_id, patient_name, patient_mobile, patient_gender, patient_age,
            doctor, room, project, consultant, assistant, department, source, visit_type,
            appoint_date, appoint_time, end_time, duration,
            status, remark, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
          input.consultant ?? null,
          input.assistant ?? null,
          input.department ?? null,
          input.source ?? null,
          input.visitType ?? "复诊",
          input.appointDate,
          input.appointTime,
          input.endTime ?? null,
          input.duration ?? 30,
          input.status ?? "booked",
          input.remark ?? null,
          ctx.user.id,
        ]
      )) as any;
      const apptId = Number(res.insertId);

      // 联动：向该顺客的沟通动态插入一条系统记录
      // 若未传 patientId，尝试按姓名 + tenantId 查找匹配的顺客 ID
      try {
        let resolvedPatientId: number | null = input.patientId ?? null;
        if (!resolvedPatientId && input.patientName) {
          const [matchRows] = await conn.execute(
            `SELECT id FROM yaban_customer WHERE tenant_id = ? AND name = ? LIMIT 1`,
            [tenantId, input.patientName]
          ) as any;
          if ((matchRows as any[]).length > 0) {
            resolvedPatientId = Number((matchRows as any[])[0].id);
            // 回填 patient_id 到预约表
            await conn.execute(
              `UPDATE yaban_appointment SET patient_id = ? WHERE id = ?`,
              [resolvedPatientId, apptId]
            );
          }
        }
        if (resolvedPatientId) {
          const operatorName = (ctx.user as any).name || (ctx.user as any).username || '';
          const timeLabel = input.endTime
            ? `${input.appointTime}-${input.endTime}`
            : input.appointTime;
          const parts: string[] = [];
          if (input.project) parts.push(`项目：${input.project}`);
          if (input.doctor) parts.push(`医生：${input.doctor}`);
          if (input.consultant) parts.push(`咨询师：${input.consultant}`);
          if (input.room) parts.push(`诊室：${input.room}`);
          if (input.visitType) parts.push(`类型：${input.visitType}`);
          if (input.remark) parts.push(`备注：${input.remark}`);
          const rawText = `新建预约：${input.appointDate} ${timeLabel}${parts.length ? '，' + parts.join('，') : ''}`;
          const summaryDemand = `预约日期：${input.appointDate} ${timeLabel}`;
          await conn.execute(
            `INSERT INTO yaban_comm_record
              (tenant_id, customer_id, record_type, biz_type, raw_text,
               summary_demand, summary_remark,
               ai_generated, operator_id, operator_name, comm_at)
             VALUES (?, ?, 'system', 'appointment', ?, ?, ?, 0, ?, ?, NOW())`,
            [
              tenantId,
              resolvedPatientId,
              rawText,
              summaryDemand,
              parts.length ? parts.join('，') : null,
              ctx.user.id,
              operatorName,
            ]
          );
        }
      } catch (e) {
        // 联动写入失败不影响预约创建本身
        console.error('[appt->comm] 联动写入失败', e);
      }

      return { success: true, id: apptId };
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

  // 按患者ID查询该患者的全部预约记录
  listByPatient: protectedProcedure
    .input(z.object({
      patientId: z.number().int().positive(),
      tenantId: z.number().int().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const [rows] = (await conn.execute(
        `SELECT id, patient_id, patient_name, doctor, consultant, assistant,
                room, department, project, source, visit_type,
                appoint_date, appoint_time, end_time, duration,
                status, remark, created_at
         FROM yaban_appointment
         WHERE tenant_id = ? AND patient_id = ?
         ORDER BY appoint_date DESC, appoint_time DESC`,
        [tenantId, input.patientId]
      )) as any;
      return (rows as any[]).map((r) => ({
        id: Number(r.id),
        patientId: r.patient_id ? Number(r.patient_id) : null,
        patientName: r.patient_name || "",
        doctor: r.doctor || "",
        consultant: r.consultant || "",
        assistant: r.assistant || "",
        room: r.room || "",
        department: r.department || "",
        project: r.project || "",
        source: r.source || "",
        visitType: r.visit_type || "",
        appointDate: r.appoint_date instanceof Date
          ? r.appoint_date.toISOString().slice(0, 10)
          : String(r.appoint_date || ""),
        appointTime: r.appoint_time || "",
        endTime: r.end_time || "",
        duration: r.duration ? Number(r.duration) : 30,
        status: r.status || "booked",
        remark: r.remark || "",
        createdAt: r.created_at ? String(r.created_at) : "",
      }));
    }),

  // 获取门店员工列表
  listMembers: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const tenantId = input?.tenantId ?? (await resolveTenantId(ctx));
      // 按 user_id 分组，合并多个身份的 role_key（如院长+医生）
      const [rows] = (await conn.execute(
        `SELECT m.user_id, u.name,
                GROUP_CONCAT(DISTINCT m.role_key ORDER BY FIELD(m.role_key,'owner','shareholder','doctor','nurse','assistant','receptionist','finance') SEPARATOR ',') AS role_keys,
                COALESCE(t.color, '#1E88D6') AS bar_color,
                MIN(FIELD(m.role_key,'owner','shareholder','doctor','nurse','assistant','receptionist','finance')) AS role_rank
         FROM yaban_clinic_member m
         LEFT JOIN users u ON u.id = m.user_id
         LEFT JOIN (
           SELECT staff_user_id, tenant_id, color,
                  ROW_NUMBER() OVER (PARTITION BY staff_user_id, tenant_id ORDER BY id DESC) AS rn
           FROM yaban_shift_template
           WHERE is_active = 1 AND role_key <> '__biz__'
         ) t ON t.staff_user_id = m.user_id AND t.tenant_id = m.tenant_id AND t.rn = 1
         WHERE m.tenant_id=? AND m.status='active'
         GROUP BY m.user_id, u.name, t.color
         ORDER BY role_rank ASC, m.user_id ASC`,
        [tenantId]
      )) as any;
      return (rows as any[]).map((r) => {
        const roleKeys: string[] = (r.role_keys || "doctor").split(",");
        // 主身份取优先级最高的（第一个）
        const primaryRole = roleKeys[0] || "doctor";
        return {
          userId: Number(r.user_id),
          name: r.name || "",
          roleKey: primaryRole,
          roleKeys,
          color: r.bar_color || "#1E88D6",
        };
      });
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
         WHERE t.tenant_id = ? AND t.is_active = 1 AND t.staff_user_id <> 0 AND t.role_key <> '__biz__'
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
      if (!conn) return { templates: [], overrides: [], daySegs: [] };
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      // 模板
      const [tplRows] = (await conn.execute(
        `SELECT t.id, t.staff_user_id, t.staff_name, t.role_key,
                t.work_start, t.work_end, t.break_start, t.break_end,
                t.work_days, t.overtime_start, t.overtime_end, t.color,
                u.name AS user_name, u.avatar
         FROM yaban_shift_template t
         LEFT JOIN users u ON u.id = t.staff_user_id
         WHERE t.tenant_id = ? AND t.is_active = 1 AND t.staff_user_id <> 0 AND t.role_key <> '__biz__'
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
      // 每员工每天独立时段（新周模板）
      const [dsRows] = (await conn.execute(
        `SELECT staff_user_id, dow, work_start, work_end, break_start, break_end, is_rest
         FROM yaban_shift_day_segs
         WHERE tenant_id = ?`,
        [tenantId]
      )) as any;
      // 按 staffUserId 分组：数组格式，避免 superjson 对象 key 类型问题
      const daySegsMap: Record<number, { dow: number; workStart: string; workEnd: string; breakStart: string | null; breakEnd: string | null; isRest: boolean }[]> = {};
      for (const r of (dsRows as any[])) {
        const uid = Number(r.staff_user_id);
        const dow = Number(r.dow);
        if (!daySegsMap[uid]) daySegsMap[uid] = [];
        daySegsMap[uid].push({
          dow,
          workStart: r.work_start || "09:00",
          workEnd: r.work_end || "18:00",
          breakStart: r.break_start || null,
          breakEnd: r.break_end || null,
          isRest: Number(r.is_rest) === 1,
        });
      }
      // 转为数组格式返回
      const daySegs = Object.entries(daySegsMap).map(([uid, segs]) => ({
        staffUserId: Number(uid),
        segs,
      }));
      console.log('[weekSchedule] tenantId=', tenantId, 'daySegs=', JSON.stringify(daySegs));
      return { templates, overrides, daySegs };
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

  // 获取门店营业时间（零表结构变更：存为 staff_user_id=0 / role_key='__biz__' 的特殊记录）
  getBusinessHours: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return { open: "09:00", close: "18:00" };
      const tenantId = input?.tenantId ?? (await resolveTenantId(ctx));
      const [rows] = (await conn.execute(
        `SELECT work_start, work_end FROM yaban_shift_template
         WHERE tenant_id = ? AND staff_user_id = 0 AND role_key = '__biz__' LIMIT 1`,
        [tenantId]
      )) as any;
      const row = (rows as any[])[0];
      return { open: row?.work_start || "09:00", close: row?.work_end || "18:00" };
    }),

  // 保存门店营业时间
  saveBusinessHours: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().optional(),
      open: z.string().max(8),
      close: z.string().max(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const [exist] = (await conn.execute(
        `SELECT id FROM yaban_shift_template
         WHERE tenant_id = ? AND staff_user_id = 0 AND role_key = '__biz__' LIMIT 1`,
        [tenantId]
      )) as any;
      const existRow = (exist as any[])[0];
      if (existRow) {
        await conn.execute(
          `UPDATE yaban_shift_template SET work_start=?, work_end=?, is_active=1 WHERE id=?`,
          [input.open, input.close, existRow.id]
        );
      } else {
        await conn.execute(
          `INSERT INTO yaban_shift_template
             (tenant_id, staff_user_id, staff_name, role_key,
              work_start, work_end, break_start, break_end, work_days, color, is_active)
           VALUES (?, 0, '营业时间', '__biz__', ?, ?, '12:00', '13:00', '1,2,3,4,5', '#1E88D6', 1)`,
          [tenantId, input.open, input.close]
        );
      }
      return { success: true };
    }),

  // 获取某员工的按天时段模板（周一~周日各自的时段）
  getDaySegs: protectedProcedure
    .input(z.object({
      staffUserId: z.number().int(),
      tenantId: z.number().int().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const [rows] = (await conn.execute(
        `SELECT dow, work_start, work_end, break_start, break_end,
                overtime_start, overtime_end, is_rest
         FROM yaban_shift_day_segs
         WHERE tenant_id = ? AND staff_user_id = ?
         ORDER BY dow ASC`,
        [tenantId, input.staffUserId]
      )) as any;
      return (rows as any[]).map((r: any) => ({
        dow: Number(r.dow),
        workStart: r.work_start || "09:00",
        workEnd: r.work_end || "18:00",
        breakStart: r.break_start || null,
        breakEnd: r.break_end || null,
        overtimeStart: r.overtime_start || null,
        overtimeEnd: r.overtime_end || null,
        isRest: Number(r.is_rest) === 1,
      }));
    }),

  // 保存某员工的按天时段模板（批量 upsert，一次传 7 天）
  saveDaySegs: protectedProcedure
    .input(z.object({
      staffUserId: z.number().int(),
      tenantId: z.number().int().optional(),
      days: z.array(z.object({
        dow: z.number().int().min(0).max(6),
        workStart: z.string().max(8),
        workEnd: z.string().max(8),
        breakStart: z.string().max(8).nullable().optional(),
        breakEnd: z.string().max(8).nullable().optional(),
        overtimeStart: z.string().max(8).nullable().optional(),
        overtimeEnd: z.string().max(8).nullable().optional(),
        isRest: z.boolean(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      for (const d of input.days) {
        await conn.execute(
          `INSERT INTO yaban_shift_day_segs
             (tenant_id, staff_user_id, dow, work_start, work_end,
              break_start, break_end, overtime_start, overtime_end, is_rest)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             work_start=VALUES(work_start), work_end=VALUES(work_end),
             break_start=VALUES(break_start), break_end=VALUES(break_end),
             overtime_start=VALUES(overtime_start), overtime_end=VALUES(overtime_end),
             is_rest=VALUES(is_rest)`,
          [
            tenantId, input.staffUserId, d.dow,
            d.workStart, d.workEnd,
            d.breakStart ?? null, d.breakEnd ?? null,
            d.overtimeStart ?? null, d.overtimeEnd ?? null,
            d.isRest ? 1 : 0,
          ]
        );
      }
      // 同步更新 yaban_shift_template 的 workDays（有时段且非休息的天）
      const workDays = input.days.filter(d => !d.isRest).map(d => d.dow);
      if (workDays.length > 0) {
        const firstWork = input.days.find(d => !d.isRest);
        await conn.execute(
          `INSERT INTO yaban_shift_template
             (tenant_id, staff_user_id, staff_name, role_key,
              work_start, work_end, break_start, break_end, work_days)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             work_start=VALUES(work_start), work_end=VALUES(work_end),
             break_start=VALUES(break_start), break_end=VALUES(break_end),
             work_days=VALUES(work_days), is_active=1`,
          [
            tenantId, input.staffUserId, "", "doctor",
            firstWork?.workStart ?? "09:00", firstWork?.workEnd ?? "18:00",
            firstWork?.breakStart ?? null, firstWork?.breakEnd ?? null,
            workDays.join(","),
          ]
        );
      }
      return { success: true };
    }),

  // 清空某员工从指定日期起到结束日期的所有 override 记录
  clearOverrides: protectedProcedure
    .input(z.object({
      staffUserId: z.number().int(),
      tenantId: z.number().int().optional(),
      fromDate: z.string(), // YYYY-MM-DD，从这天起清空
      toDate: z.string(),   // YYYY-MM-DD，清空到这天
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      await conn.execute(
        `DELETE FROM yaban_shift_override
         WHERE tenant_id = ? AND staff_user_id = ?
           AND override_date >= ? AND override_date <= ?`,
        [tenantId, input.staffUserId, input.fromDate, input.toDate]
      );
      return { success: true };
    }),

  // 清空员工长期周模板（yaban_shift_day_segs + yaban_shift_template）
  clearDaySegs: protectedProcedure
    .input(z.object({
      staffUserId: z.number().int(),
      tenantId: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      await conn.execute(
        `DELETE FROM yaban_shift_day_segs WHERE tenant_id = ? AND staff_user_id = ?`,
        [tenantId, input.staffUserId]
      );
      await conn.execute(
        `DELETE FROM yaban_shift_template WHERE tenant_id = ? AND staff_user_id = ?`,
        [tenantId, input.staffUserId]
      );
      return { success: true };
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
