/**
 * 牙伴齿科 · 运营报表后端路由（yabanOps）
 *
 * 设计原则（与项目现有写法保持一致）：
 *   - 全部为 protectedProcedure（登录可查），只读，不做任何写操作
 *   - 入参统一含可选 tenantId，实际门店由 resolveTenantId(ctx) 解析（多门店安全口径一致）
 *   - 使用 getDbConnection 原生 SQL，先 ensureChargeTables 兜底建表，避免空库报错
 *   - 金额字段统一 Number 化，比例统一保留一位小数
 *   - 严禁 Emoji
 *
 * 真实表字段以 yaban-customer-router.ts / yaban-appointment-router.ts 建表语句为准：
 *   yaban_charge:        paid/receivable/owed/status/doctor/visit_at/customer_id/created_at/tenant_id
 *   yaban_charge_item:   charge_id/name
 *   yaban_charge_product:category_id/name
 *   yaban_charge_category:name
 *   yaban_charge_payment:charge_id/method/amount
 *   yaban_customer:      gender/age/birthday/source/consultant/mobile/name/created_at/tenant_id
 *   yaban_appointment:   doctor/status/appoint_date/duration/tenant_id（注意：无 consultant 字段）
 *
 * 注意：收费统计统一排除 status='void'；接诊以 visit_at 为口径，visit_at 为空时回退 created_at。
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import { resolveTenantId, ensureChargeTables } from "./yaban-customer-router";

// 统一日期范围入参
const dateRangeInput = z.object({
  tenantId: z.number().optional(),
  startDate: z.string(), // "2026-06-01"
  endDate: z.string(), // "2026-06-16"
});

// 保留一位小数的占比计算
function ratio(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

// 收费有效范围条件片段（排除作废单，按 visit_at 口径，回退 created_at）
// 用于 WHERE，占位参数顺序：tenantId, startDate, endDate
const CHARGE_RANGE_WHERE = `
  tenant_id = ?
  AND status <> 'void'
  AND DATE(COALESCE(visit_at, created_at)) BETWEEN ? AND ?
`;

export const yabanOpsRouter = router({
  // 接口1：运营报表总览
  overview: protectedProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await ensureChargeTables(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const { startDate, endDate } = input;

    // 本期核心指标
    const [curRows] = (await (conn as any).execute(
      `SELECT
         COALESCE(SUM(paid), 0) AS total_revenue,
         COUNT(DISTINCT customer_id) AS patient_count
       FROM yaban_charge
       WHERE ${CHARGE_RANGE_WHERE}`,
      [TENANT_ID, startDate, endDate]
    )) as any;
    const cur = (curRows as any[])[0] || {};
    const totalRevenue = Number(cur.total_revenue || 0);
    const patientCount = Number(cur.patient_count || 0);

    // 上一个等长周期（环比）
    const msPerDay = 86400000;
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const spanDays = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
    const prevEnd = new Date(start.getTime() - msPerDay);
    const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * msPerDay);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const [prevRows] = (await (conn as any).execute(
      `SELECT COALESCE(SUM(paid), 0) AS total_revenue
       FROM yaban_charge
       WHERE ${CHARGE_RANGE_WHERE}`,
      [TENANT_ID, fmt(prevStart), fmt(prevEnd)]
    )) as any;
    const prevRevenue = Number((prevRows as any[])[0]?.total_revenue || 0);
    const revenueGrowthRate = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10 : 0;

    // 新患人数（customer.created_at 在范围内）
    const [newRows] = (await (conn as any).execute(
      `SELECT COUNT(*) AS c FROM yaban_customer
       WHERE tenant_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
      [TENANT_ID, startDate, endDate]
    )) as any;
    const newPatientCount = Number((newRows as any[])[0]?.c || 0);

    return {
      totalRevenue,
      targetRevenue: 0, // 暂无诊所目标设置，按需求单返回 0
      patientCount,
      avgPerPatient: patientCount > 0 ? Math.round((totalRevenue / patientCount) * 100) / 100 : 0,
      revenueGrowthRate,
      newPatientCount,
      returnPatientCount: Math.max(patientCount - newPatientCount, 0),
    };
  }),

  // 接口2：日营收柱状图数据
  dailyRevenue: protectedProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await ensureChargeTables(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const { startDate, endDate } = input;

    const [rows] = (await (conn as any).execute(
      `SELECT DATE(COALESCE(visit_at, created_at)) AS d,
              COALESCE(SUM(paid), 0) AS revenue,
              COUNT(DISTINCT customer_id) AS patient_count
       FROM yaban_charge
       WHERE ${CHARGE_RANGE_WHERE}
       GROUP BY DATE(COALESCE(visit_at, created_at))`,
      [TENANT_ID, startDate, endDate]
    )) as any;

    const map = new Map<string, { revenue: number; patientCount: number }>();
    for (const r of rows as any[]) {
      const key = r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10);
      map.set(key, { revenue: Number(r.revenue || 0), patientCount: Number(r.patient_count || 0) });
    }

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const msPerDay = 86400000;
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const items: Array<{ date: string; revenue: number; patientCount: number; isToday: boolean; isFuture: boolean }> = [];
    let maxRevenue = 0;
    for (let t = start.getTime(); t <= end.getTime(); t += msPerDay) {
      const dateStr = new Date(t).toISOString().slice(0, 10);
      const isFuture = dateStr > todayStr;
      const hit = map.get(dateStr);
      const revenue = isFuture ? 0 : Number(hit?.revenue || 0);
      const patientCount = isFuture ? 0 : Number(hit?.patientCount || 0);
      if (revenue > maxRevenue) maxRevenue = revenue;
      items.push({ date: dateStr, revenue, patientCount, isToday: dateStr === todayStr, isFuture });
    }

    return { items, breakevenValue: 14800, maxRevenue };
  }),

  // 接口3：收入结构（按项目分类）
  revenueByCategory: protectedProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await ensureChargeTables(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const { startDate, endDate } = input;

    // 项目明细 → 关联产品 → 分类；按 item.subtotal 聚合（与收费单口径一致，落到分类）
    const [rows] = (await (conn as any).execute(
      `SELECT COALESCE(cat.name, '其他') AS category_name,
              COALESCE(SUM(ci.subtotal), 0) AS revenue,
              COUNT(DISTINCT ci.charge_id) AS cnt
       FROM yaban_charge c
       JOIN yaban_charge_item ci ON ci.charge_id = c.id
       LEFT JOIN yaban_charge_product p ON p.tenant_id = c.tenant_id AND p.name = ci.name
       LEFT JOIN yaban_charge_category cat ON cat.id = p.category_id
       WHERE c.tenant_id = ? AND c.status <> 'void'
         AND DATE(COALESCE(c.visit_at, c.created_at)) BETWEEN ? AND ?
       GROUP BY COALESCE(cat.name, '其他')
       ORDER BY revenue DESC`,
      [TENANT_ID, startDate, endDate]
    )) as any;

    const all = (rows as any[]).map((r) => ({
      categoryName: String(r.category_name || "其他"),
      revenue: Number(r.revenue || 0),
      count: Number(r.cnt || 0),
    }));
    const total = all.reduce((s, x) => s + x.revenue, 0);

    // 最多 8 个分类，其余合并为"其他"
    let items = all;
    if (all.length > 8) {
      const head = all.slice(0, 8);
      const restRevenue = all.slice(8).reduce((s, x) => s + x.revenue, 0);
      const restCount = all.slice(8).reduce((s, x) => s + x.count, 0);
      const existedOther = head.find((x) => x.categoryName === "其他");
      if (existedOther) {
        existedOther.revenue += restRevenue;
        existedOther.count += restCount;
      } else {
        head.push({ categoryName: "其他", revenue: restRevenue, count: restCount });
      }
      items = head;
    }

    return {
      items: items.map((x) => ({ ...x, ratio: ratio(x.revenue, total) })),
      total,
    };
  }),

  // 接口4：医生绩效排行
  doctorPerformance: protectedProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await ensureChargeTables(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const { startDate, endDate } = input;

    const [rows] = (await (conn as any).execute(
      `SELECT CASE WHEN doctor IS NULL OR doctor = '' THEN '未分配' ELSE doctor END AS doctor_name,
              COALESCE(SUM(paid), 0) AS revenue,
              COUNT(DISTINCT customer_id) AS patient_count
       FROM yaban_charge
       WHERE ${CHARGE_RANGE_WHERE}
       GROUP BY CASE WHEN doctor IS NULL OR doctor = '' THEN '未分配' ELSE doctor END
       ORDER BY revenue DESC
       LIMIT 10`,
      [TENANT_ID, startDate, endDate]
    )) as any;

    const list = (rows as any[]).map((r) => ({
      doctorName: String(r.doctor_name || "未分配"),
      revenue: Number(r.revenue || 0),
      patientCount: Number(r.patient_count || 0),
    }));
    const total = list.reduce((s, x) => s + x.revenue, 0);

    return {
      items: list.map((x) => ({
        ...x,
        avgPerPatient: x.patientCount > 0 ? Math.round((x.revenue / x.patientCount) * 100) / 100 : 0,
        ratio: ratio(x.revenue, total),
      })),
      total,
    };
  }),

  // 接口5：咨询师转化数据
  // 注意：真实预约表无 consultant 字段，咨询师以 yaban_customer.consultant 为口径，
  // 关联其在范围内的收费单统计成交与营收；预约/到诊以 customer 维度近似（无咨询师级预约表）。
  consultantConversion: protectedProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await ensureChargeTables(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const { startDate, endDate } = input;

    // 按咨询师汇总：名下顾客数（预约近似）、有到诊收费的顾客数（到诊）、成交单数与金额
    const [rows] = (await (conn as any).execute(
      `SELECT CASE WHEN cu.consultant IS NULL OR cu.consultant = '' THEN '未分配' ELSE cu.consultant END AS consultant_name,
              COUNT(DISTINCT cu.id) AS appointment_count,
              COUNT(DISTINCT c.customer_id) AS visit_count,
              COUNT(c.id) AS charge_count,
              COALESCE(SUM(c.paid), 0) AS revenue
       FROM yaban_customer cu
       LEFT JOIN yaban_charge c
         ON c.customer_id = cu.id
        AND c.tenant_id = cu.tenant_id
        AND c.status <> 'void'
        AND DATE(COALESCE(c.visit_at, c.created_at)) BETWEEN ? AND ?
       WHERE cu.tenant_id = ?
       GROUP BY CASE WHEN cu.consultant IS NULL OR cu.consultant = '' THEN '未分配' ELSE cu.consultant END
       HAVING revenue > 0 OR charge_count > 0
       ORDER BY revenue DESC`,
      [startDate, endDate, TENANT_ID]
    )) as any;

    return {
      items: (rows as any[]).map((r) => {
        const appointmentCount = Number(r.appointment_count || 0);
        const visitCount = Number(r.visit_count || 0);
        const chargeCount = Number(r.charge_count || 0);
        return {
          consultantName: String(r.consultant_name || "未分配"),
          appointmentCount,
          visitCount,
          chargeCount,
          revenue: Number(r.revenue || 0),
          conversionRate: ratio(visitCount, appointmentCount),
          chargeRate: ratio(chargeCount, visitCount),
        };
      }),
    };
  }),

  // 接口6：患者分析
  patientAnalysis: protectedProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await ensureChargeTables(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const { startDate, endDate } = input;

    // 范围内到诊顾客（去重），关联顾客性别/年龄
    const [rows] = (await (conn as any).execute(
      `SELECT cu.gender AS gender, cu.age AS age,
              (DATE(cu.created_at) BETWEEN ? AND ?) AS is_new
       FROM (
         SELECT DISTINCT customer_id
         FROM yaban_charge
         WHERE ${CHARGE_RANGE_WHERE}
       ) v
       JOIN yaban_customer cu ON cu.id = v.customer_id`,
      [startDate, endDate, TENANT_ID, startDate, endDate]
    )) as any;

    const list = rows as any[];
    const total = list.length;

    const genderMap = new Map<string, number>();
    const ageBuckets: Record<string, number> = { "0-17": 0, "18-30": 0, "31-45": 0, "46-60": 0, "60+": 0 };
    let newCount = 0;
    for (const r of list) {
      const g = r.gender && String(r.gender).trim() ? String(r.gender) : "未知";
      genderMap.set(g, (genderMap.get(g) || 0) + 1);
      const age = r.age != null ? Number(r.age) : null;
      if (age != null && !isNaN(age)) {
        if (age <= 17) ageBuckets["0-17"]++;
        else if (age <= 30) ageBuckets["18-30"]++;
        else if (age <= 45) ageBuckets["31-45"]++;
        else if (age <= 60) ageBuckets["46-60"]++;
        else ageBuckets["60+"]++;
      }
      if (Number(r.is_new) === 1) newCount++;
    }

    const genderDistribution = Array.from(genderMap.entries()).map(([label, count]) => ({
      label,
      count,
      ratio: ratio(count, total),
    }));
    const ageDistribution = Object.entries(ageBuckets).map(([label, count]) => ({
      label,
      count,
      ratio: ratio(count, total),
    }));

    return {
      genderDistribution,
      ageDistribution,
      newVsReturn: {
        newCount,
        returnCount: Math.max(total - newCount, 0),
        newRatio: ratio(newCount, total),
      },
      totalPatients: total,
    };
  }),

  // 接口7：患者来源分析
  patientSource: protectedProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await ensureChargeTables(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const { startDate, endDate } = input;

    const [rows] = (await (conn as any).execute(
      `SELECT CASE WHEN cu.source IS NULL OR cu.source = '' THEN '未知' ELSE cu.source END AS source,
              COUNT(DISTINCT cu.id) AS cnt,
              COALESCE(SUM(c.paid), 0) AS revenue
       FROM yaban_customer cu
       JOIN (
         SELECT customer_id, SUM(paid) AS paid
         FROM yaban_charge
         WHERE ${CHARGE_RANGE_WHERE}
         GROUP BY customer_id
       ) c ON c.customer_id = cu.id
       WHERE cu.tenant_id = ?
       GROUP BY CASE WHEN cu.source IS NULL OR cu.source = '' THEN '未知' ELSE cu.source END
       ORDER BY cnt DESC`,
      [TENANT_ID, startDate, endDate, TENANT_ID]
    )) as any;

    const list = (rows as any[]).map((r) => ({
      source: String(r.source || "未知"),
      count: Number(r.cnt || 0),
      revenue: Number(r.revenue || 0),
    }));
    const total = list.reduce((s, x) => s + x.count, 0);

    return {
      items: list.map((x) => ({ ...x, ratio: ratio(x.count, total) })),
      total,
    };
  }),

  // 接口8：收费方式分布
  paymentMethodStats: protectedProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await ensureChargeTables(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const { startDate, endDate } = input;

    const [rows] = (await (conn as any).execute(
      `SELECT pay.method AS method,
              COALESCE(SUM(pay.amount), 0) AS amount,
              COUNT(*) AS cnt
       FROM yaban_charge_payment pay
       JOIN yaban_charge c ON c.id = pay.charge_id
       WHERE c.tenant_id = ? AND c.status <> 'void'
         AND DATE(COALESCE(c.visit_at, c.created_at)) BETWEEN ? AND ?
       GROUP BY pay.method
       ORDER BY amount DESC`,
      [TENANT_ID, startDate, endDate]
    )) as any;

    const list = (rows as any[]).map((r) => ({
      method: String(r.method || "其他"),
      amount: Number(r.amount || 0),
      count: Number(r.cnt || 0),
    }));
    const total = list.reduce((s, x) => s + x.amount, 0);

    return {
      items: list.map((x) => ({ ...x, ratio: ratio(x.amount, total) })),
      total,
    };
  }),

  // 接口9：欠费预警列表
  debtWarning: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().optional(),
        minOwed: z.number().optional(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureChargeTables(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const minOwedRaw = input.minOwed != null ? Number(input.minOwed) : 0.01;
      const minOwed = isNaN(minOwedRaw) || minOwedRaw < 0 ? 0.01 : minOwedRaw;
      const limit = input.limit != null ? Math.max(1, Math.min(Math.floor(input.limit), 200)) : 20;

      // 按顾客聚合欠费
      const [rows] = (await (conn as any).execute(
        `SELECT c.customer_id AS customer_id,
                cu.name AS customer_name,
                cu.mobile AS mobile,
                COALESCE(SUM(c.owed), 0) AS total_owed,
                COUNT(*) AS charge_count,
                DATE_FORMAT(MAX(COALESCE(c.visit_at, c.created_at)), '%Y-%m-%d') AS last_charge_date
         FROM yaban_charge c
         LEFT JOIN yaban_customer cu ON cu.id = c.customer_id
         WHERE c.tenant_id = ? AND c.status <> 'void' AND c.owed > 0
         GROUP BY c.customer_id, cu.name, cu.mobile
         HAVING total_owed >= ${minOwed}
         ORDER BY total_owed DESC
         LIMIT ${limit}`,
        [TENANT_ID]
      )) as any;

      const items = (rows as any[]).map((r) => ({
        customerId: Number(r.customer_id),
        customerName: String(r.customer_name || "未知顾客"),
        mobile: (r.mobile as string | null) ?? null,
        totalOwed: Number(r.total_owed || 0),
        lastChargeDate: String(r.last_charge_date || ""),
        chargeCount: Number(r.charge_count || 0),
      }));

      // 全量欠费汇总（不受 limit 限制）
      const [sumRows] = (await (conn as any).execute(
        `SELECT COALESCE(SUM(t.owed_sum), 0) AS total_owed_amount,
                COUNT(*) AS total_owed_count
         FROM (
           SELECT customer_id, SUM(owed) AS owed_sum
           FROM yaban_charge
           WHERE tenant_id = ? AND status <> 'void' AND owed > 0
           GROUP BY customer_id
           HAVING owed_sum >= ${minOwed}
         ) t`,
        [TENANT_ID]
      )) as any;
      const s = (sumRows as any[])[0] || {};

      return {
        items,
        totalOwedAmount: Number(s.total_owed_amount || 0),
        totalOwedCount: Number(s.total_owed_count || 0),
      };
    }),
});
