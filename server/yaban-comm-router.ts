/**
 * 牙伴齿科 - 售前售后沟通记录路由
 * 包含：沟通记录 CRUD、AI 语音秘书（Whisper 转写 + DeepSeek 摘要）、AI 提示词配置
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDbConnection } from "./db";
import { resolveTenantId } from "./yaban-customer-router";
import { callAIVoice } from "./wecom-ai-config";
import { ENV } from "./_core/env";
import { TRPCError } from "@trpc/server";

// 默认 AI 提示词
const DEFAULT_COMM_PROMPT = `你是一名专业的牙科诊所助理，请根据以下对话内容，提取关键信息并以 JSON 格式返回。

请提取以下五个维度：
1. demand（客户记录）：客户提到的问题、需求、主诉，用简洁的语言概括
2. hospital（医院记录）：医生给出的建议、诊断、方案、报价、重要说明等
3. keyPoints（沟通要点）：本次沟通的其他重要要点
4. followup（跟进事项）：下次联系时间、待办事项、需要跟进的内容
5. remark（备注）：其他需要记录的补充信息

返回格式示例：
{
  "demand": "客户主诉牙齿敏感，询问是否需要做检查",
  "hospital": "建议做全口检查，报价 200 元，可使用医保",
  "keyPoints": "客户对价格较敏感",
  "followup": "约定下周三下午 3 点复诊",
  "remark": ""
}

重要要求：
- 每个字段的值必须是一段纯文本字符串，绝对不能是嵌套的对象或数组。
- 如果某个维度有多条信息，请用顿号或逗号连接成一句话。
- 如果某个维度没有相关信息，对应字段返回空字符串。
- 只返回 JSON，不要包含 markdown 代码块标记或其他任何内容。

正确示例（所有字段都是字符串）：
{"demand":"牙齿敏感，询问是否需要检查","hospital":"建议做全口检查，报价200元","keyPoints":"客户对价格较敏感","followup":"约下周三下午3点复诊","remark":""}`;

export const yabanCommRouter = router({
  /**
   * 随访列表：查询本门店所有 biz_type='followup' 的随访记录，关联客户姓名。
   * 支持按状态筛选（all/pending/completed/failed/cancelled），按随访日期倒序。
   * 随访本质上是一条带 followup_date / followup_status 的沟通记录。
   */
  listFollowups: protectedProcedure
    .input(z.object({
      status: z.enum(['all', 'pending', 'completed', 'failed', 'cancelled']).default('all'),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const statusMap: Record<string, string> = {
        pending: '待计划', completed: '随访完成', failed: '未成功', cancelled: '已取消',
      };
      let whereStatus = '';
      const params: any[] = [TENANT_ID];
      if (input.status !== 'all') {
        whereStatus = ' AND r.followup_status = ?';
        params.push(statusMap[input.status]);
      }
      const [rows] = await (conn as any).execute(
        `SELECT r.id, r.customer_id, c.name AS customer_name,
                r.summary_followup, r.summary_demand, r.summary_remark, r.raw_text,
                r.followup_date, r.followup_status, r.followup_assignee,
                r.operator_name, r.comm_at, r.created_at
         FROM yaban_comm_record r
         LEFT JOIN yaban_customer c ON c.id = r.customer_id
         WHERE r.tenant_id = ? AND r.biz_type = 'followup'${whereStatus}
         ORDER BY r.followup_date DESC, r.id DESC`,
        params
      );
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const list = (rows as any[]).map((r: any) => {
        const dateStr = r.followup_date instanceof Date
          ? r.followup_date.toISOString().slice(0, 10)
          : String(r.followup_date || '').slice(0, 10);
        // 待计划且日期已过 => 超时
        let isOverdue = false;
        if (r.followup_status === '待计划' && dateStr) {
          const d = new Date(dateStr.replace(/-/g, '/'));
          isOverdue = d < today;
        }
        // 内容优先取跟进事项，其次需求、备注、原始文字
        const content = (r.summary_followup || r.summary_demand || r.summary_remark || r.raw_text || '').toString().trim();
        return {
          id: Number(r.id),
          customerId: Number(r.customer_id),
          patientName: (r.customer_name || '未知客户') as string,
          date: dateStr.replace(/-/g, '/'),
          content,
          staff: (r.followup_assignee || r.operator_name || '前台') as string,
          status: r.followup_status || '待计划',
          isOverdue,
        };
      });
      return { list };
    }),

  /**
   * 创建随访：写入一条 biz_type='followup' 的沟通记录。
   * 同时落入客户的售前售后时间线，实现数据打通。
   */
  createFollowup: protectedProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
      followupDate: z.string().min(1),       // YYYY-MM-DD 计划随访日期
      followupStatus: z.string().default('待计划'),
      assignee: z.string().optional(),        // 随访人员
      doctor: z.string().optional(),          // 随访医生
      followUpType: z.string().optional(),    // 随访类型
      project: z.string().optional(),         // 随访项目
      content: z.string().optional(),         // 随访内容
      communicationMethod: z.string().optional(),
      satisfaction: z.string().optional(),
      result: z.string().optional(),          // 随访结果
      remark: z.string().optional(),
      visitTime: z.string().optional(),       // 就诊时间
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const operatorName = (ctx.user as any).name || (ctx.user as any).username || '';
      // 把随访内容归入 summary_followup；类型/项目等附加信息归入 demand/remark，保证在时间线里可读
      const demandParts: string[] = [];
      if (input.followUpType) demandParts.push(`类型：${input.followUpType}`);
      if (input.project) demandParts.push(`项目：${input.project}`);
      if (input.communicationMethod) demandParts.push(`沟通方式：${input.communicationMethod}`);
      const remarkParts: string[] = [];
      if (input.satisfaction) remarkParts.push(`满意度：${input.satisfaction}`);
      if (input.result) remarkParts.push(`结果：${input.result}`);
      if (input.remark) remarkParts.push(input.remark);
      const commAt = input.visitTime ? new Date(input.visitTime.replace(/\//g, '-')) : new Date();
      const [result] = await (conn as any).execute(
        `INSERT INTO yaban_comm_record
          (tenant_id, customer_id, record_type, biz_type, raw_text,
           summary_demand, summary_followup, summary_remark,
           ai_generated, operator_id, operator_name,
           followup_date, followup_status, followup_assignee, comm_at)
         VALUES (?, ?, 'manual', 'followup', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
        [
          TENANT_ID, input.customerId,
          input.content || null,
          demandParts.join('，') || null,
          input.content || null,
          remarkParts.join('，') || null,
          ctx.user.id, operatorName,
          input.followupDate, input.followupStatus,
          input.assignee || input.doctor || null,
          isNaN(commAt.getTime()) ? new Date() : commAt,
        ]
      );
      return { id: (result as any).insertId, success: true };
    }),

  /** 更新随访状态（待计划/随访完成/未成功/已取消） */
  updateFollowupStatus: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.string().min(1),
      result: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `UPDATE yaban_comm_record SET followup_status = ?, updated_at = NOW()
         WHERE id = ? AND tenant_id = ? AND biz_type = 'followup'`,
        [input.status, input.id, TENANT_ID]
      );
      return { success: true };
    }),

  /** 随访详情：按 id 查询单条随访记录，关联客户信息 */
  followupDetail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const [rows] = await (conn as any).execute(
        `SELECT r.id, r.customer_id, c.name AS customer_name, c.gender, c.age,
                c.mobile, c.medical_no,
                r.summary_followup, r.summary_demand, r.summary_remark, r.raw_text,
                r.followup_date, r.followup_status, r.followup_assignee,
                r.operator_name, r.comm_at, r.created_at
         FROM yaban_comm_record r
         LEFT JOIN yaban_customer c ON c.id = r.customer_id
         WHERE r.id = ? AND r.tenant_id = ? AND r.biz_type = 'followup'
         LIMIT 1`,
        [input.id, TENANT_ID]
      );
      const r = (rows as any[])[0];
      if (!r) throw new TRPCError({ code: 'NOT_FOUND', message: '随访记录不存在' });
      const fmt = (v: any) => v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : '');
      const fmtTime = (v: any) => v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : (v ? String(v).slice(0, 16).replace('T', ' ') : '');
      const planDate = fmt(r.followup_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let isOverdue = false;
      if (r.followup_status === '待计划' && planDate) {
        isOverdue = new Date(planDate.replace(/-/g, '/')) < today;
      }
      const age: number | undefined = (r.age != null && Number(r.age) > 0) ? Number(r.age) : undefined;
      return {
        id: Number(r.id),
        customerId: Number(r.customer_id),
        patientName: (r.customer_name || '未知客户') as string,
        gender: (r.gender === '男') ? 'male' : 'female',
        age,
        phone: (r.mobile || '') as string,
        medicalNo: (r.medical_no || '') as string,
        status: r.followup_status || '待计划',
        isOverdue,
        planTime: planDate.replace(/-/g, '/'),
        visitTime: fmtTime(r.comm_at),
        createTime: fmtTime(r.created_at),
        creator: (r.operator_name || '') as string,
        followUpStaff: (r.followup_assignee || r.operator_name || '前台') as string,
        followUpContent: (r.summary_followup || r.raw_text || '') as string,
        demand: (r.summary_demand || '') as string,
        remark: (r.summary_remark || '') as string,
      };
    }),

  /**
   * 首页日历月度统计：按天聚合5个维度数据
   * - yuyue 预约数（yaban_appointment.appoint_date 计数）
   * - suifang 随访数（yaban_comm_record biz_type=followup 的 followup_date 计数）
   * - yishoufei 已收费笔数（yaban_charge.visit_at 计数）
   * - shishou 实收业绩金额（yaban_charge.paid 求和）
   * - xinzeng 新增顾客数（yaban_customer.created_at 计数）
   * 返回 { yuyue:{day:count}, suifang:{...}, yishoufei:{...}, shishou:{...}, xinzeng:{...} }
   */
  calendarStats: protectedProcedure
    .input(z.object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const ym = `${input.year}-${String(input.month).padStart(2, '0')}`;
      const start = `${ym}-01`;
      // 下月第一天作为右开区间
      const nextMonth = input.month === 12 ? `${input.year + 1}-01-01` : `${input.year}-${String(input.month + 1).padStart(2, '0')}-01`;

      const toMap = (rows: any[], key: string) => {
        const m: Record<number, number> = {};
        for (const r of rows as any[]) {
          const d = Number(r.d);
          if (d >= 1 && d <= 31) m[d] = Number(r[key]) || 0;
        }
        return m;
      };

      // 预约：按 appoint_date 计数
      const [yuyueRows] = await (conn as any).execute(
        `SELECT DAY(appoint_date) AS d, COUNT(*) AS c FROM yaban_appointment
         WHERE tenant_id = ? AND appoint_date >= ? AND appoint_date < ? GROUP BY DAY(appoint_date)`,
        [TENANT_ID, start, nextMonth]
      );
      // 随访：按 followup_date 计数
      const [suifangRows] = await (conn as any).execute(
        `SELECT DAY(followup_date) AS d, COUNT(*) AS c FROM yaban_comm_record
         WHERE tenant_id = ? AND biz_type = 'followup' AND followup_date >= ? AND followup_date < ? GROUP BY DAY(followup_date)`,
        [TENANT_ID, start, nextMonth]
      );
      // 已收费笔数 + 实收金额：按 visit_at 日期
      const [chargeRows] = await (conn as any).execute(
        `SELECT DAY(visit_at) AS d, COUNT(*) AS c, COALESCE(SUM(paid),0) AS amt FROM yaban_charge
         WHERE tenant_id = ? AND visit_at >= ? AND visit_at < ? GROUP BY DAY(visit_at)`,
        [TENANT_ID, start, nextMonth]
      );
      // 新增顾客：按 created_at 日期
      const [custRows] = await (conn as any).execute(
        `SELECT DAY(created_at) AS d, COUNT(*) AS c FROM yaban_customer
         WHERE tenant_id = ? AND created_at >= ? AND created_at < ? GROUP BY DAY(created_at)`,
        [TENANT_ID, start, nextMonth]
      );

      const shishouMap: Record<number, number> = {};
      for (const r of chargeRows as any[]) {
        const d = Number(r.d);
        if (d >= 1 && d <= 31) shishouMap[d] = Math.round(Number(r.amt) || 0);
      }

      return {
        yuyue: toMap(yuyueRows as any[], 'c'),
        suifang: toMap(suifangRows as any[], 'c'),
        yishoufei: toMap(chargeRows as any[], 'c'),
        shishou: shishouMap,
        xinzeng: toMap(custRows as any[], 'c'),
      };
    }),

  /** 今日视角：今日预约列表 + 今日随访列表 */
  todayOverview: protectedProcedure
    .input(z.object({ date: z.string().optional() })) // YYYY-MM-DD，不传则用服务器今天
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const today = input.date || new Date().toISOString().slice(0, 10);
      const tomorrow = (() => {
        const d = new Date(today); d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
      })();

      // 今日预约（yaban_appointment 用 patient_id/patient_name/doctor 字段）
      const [apptRows] = await (conn as any).execute(
        `SELECT a.id, a.appoint_date, a.appoint_time, a.status,
                COALESCE(c.name, a.patient_name) AS customer_name,
                COALESCE(a.patient_id, 0) AS customer_id,
                a.doctor AS doctor_name
         FROM yaban_appointment a
         LEFT JOIN yaban_customer c ON c.id = a.patient_id AND c.tenant_id = a.tenant_id
         WHERE a.tenant_id = ? AND a.appoint_date >= ? AND a.appoint_date < ?
         ORDER BY a.appoint_time ASC, a.id ASC`,
        [TENANT_ID, today, tomorrow]
      );

      // 今日随访（followup_date = today）
      const [followRows] = await (conn as any).execute(
        `SELECT r.id, r.followup_date, r.followup_status, r.customer_id,
                c.name AS customer_name
         FROM yaban_comm_record r
         LEFT JOIN yaban_customer c ON c.id = r.customer_id AND c.tenant_id = r.tenant_id
         WHERE r.tenant_id = ? AND r.biz_type = 'followup'
           AND r.followup_date >= ? AND r.followup_date < ?
         ORDER BY r.followup_date ASC, r.id ASC`,
        [TENANT_ID, today, tomorrow]
      );

      // 今日收费统计
      const [chargeRows] = await (conn as any).execute(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(actual_amount), 0) AS total
         FROM yaban_charge
         WHERE tenant_id = ? AND charge_date >= ? AND charge_date < ?`,
        [TENANT_ID, today, tomorrow]
      );
      const chargeCount = Number((chargeRows as any[])[0]?.cnt || 0);
      const chargeTotal = Number((chargeRows as any[])[0]?.total || 0);

      const appts = (apptRows as any[]).map(r => ({
        id: r.id,
        customerId: Number(r.customer_id) || 0,
        customerName: r.customer_name || '未知顾客',
        appointTime: r.appoint_time || '',
        doctorName: r.doctor_name || '',
        status: r.status || '',
      }));

      const apptTotal = appts.length;
      const apptPending = appts.filter(a => a.status === 'pending').length;
      const apptArrived = appts.filter(a => a.status === 'arrived' || a.status === 'completed').length;
      const apptConfirmed = appts.filter(a => a.status === 'confirmed').length;

      const follows = (followRows as any[]).map(r => ({
        id: r.id,
        customerId: r.customer_id,
        customerName: r.customer_name || '未知顾客',
        followupStatus: r.followup_status || 'pending',
      }));
      const followTotal = follows.length;
      const followPending = follows.filter(f => f.followupStatus === 'pending').length;
      const followDone = follows.filter(f => f.followupStatus === 'done' || f.followupStatus === 'completed').length;

      return {
        date: today,
        appointments: appts,
        followups: follows,
        stats: {
          apptTotal, apptPending, apptArrived, apptConfirmed,
          followTotal, followPending, followDone,
          chargeCount, chargeTotal,
        },
      };
    }),

  /** 周视角：本周7天每天的预约数+随访数 */
  weekOverview: protectedProcedure
    .input(z.object({ weekStart: z.string() })) // YYYY-MM-DD（周一）
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const start = input.weekStart;
      const end = (() => {
        const d = new Date(start); d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
      })();

      const [apptRows] = await (conn as any).execute(
        `SELECT DATE(appoint_date) AS d, COUNT(*) AS c FROM yaban_appointment
         WHERE tenant_id = ? AND appoint_date >= ? AND appoint_date < ?
         GROUP BY DATE(appoint_date)`,
        [TENANT_ID, start, end]
      );
      // 周视角 appt 字段已正确（不需要 customer_id）
      const [followRows] = await (conn as any).execute(
        `SELECT DATE(followup_date) AS d, COUNT(*) AS c FROM yaban_comm_record
         WHERE tenant_id = ? AND biz_type = 'followup' AND followup_date >= ? AND followup_date < ?
         GROUP BY DATE(followup_date)`,
        [TENANT_ID, start, end]
      );

      const apptMap: Record<string, number> = {};
      for (const r of apptRows as any[]) apptMap[String(r.d).slice(0, 10)] = Number(r.c);
      const followMap: Record<string, number> = {};
      for (const r of followRows as any[]) followMap[String(r.d).slice(0, 10)] = Number(r.c);

      // 生成7天数组
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(d.getDate() + i);
        const ds = d.toISOString().slice(0, 10);
        days.push({ date: ds, appt: apptMap[ds] || 0, follow: followMap[ds] || 0 });
      }
      return { days };
    }),

  /** 今日收费列表：查询指定日期所有收费记录，含顾客姓名 */
  todayCharges: protectedProcedure
    .input(z.object({ date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const today = input.date || (() => {
        const d = new Date();
        const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
        return `${y}-${m}-${day}`;
      })();
      const tomorrow = (() => {
        const d = new Date(today + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
        return `${y}-${m}-${day}`;
      })();

      const [rows] = await (conn as any).execute(
        `SELECT ch.id, ch.customer_id, ch.charge_no, ch.status,
                ch.total_amount, ch.receivable, ch.paid, ch.actual_amount,
                ch.doctor, ch.cashier_name,
                DATE_FORMAT(ch.charge_date, '%Y-%m-%d') AS charge_date,
                COALESCE(c.name, '') AS customer_name
           FROM yaban_charge ch
           LEFT JOIN yaban_customer c ON c.id = ch.customer_id AND c.tenant_id = ch.tenant_id
          WHERE ch.tenant_id = ? AND ch.charge_date >= ? AND ch.charge_date < ?
          ORDER BY ch.id DESC`,
        [TENANT_ID, today, tomorrow]
      );

      const CHARGE_STATUS_MAP: Record<string, string> = {
        draft: '草稿', paid: '已收费', partial: '部分收款', refunded: '已退款', cancelled: '已取消',
      };

      return {
        date: today,
        list: (rows as any[]).map(r => ({
          id: Number(r.id),
          customerId: Number(r.customer_id) || 0,
          customerName: r.customer_name || '未知顾客',
          chargeNo: r.charge_no || '',
          status: r.status || '',
          statusLabel: CHARGE_STATUS_MAP[r.status] || r.status || '',
          totalAmount: Number(r.total_amount || 0),
          receivable: Number(r.receivable || 0),
          paid: Number(r.paid || 0),
          actualAmount: Number(r.actual_amount || 0),
          doctor: r.doctor || '',
          cashierName: r.cashier_name || '',
          chargeDate: r.charge_date || today,
        })),
      };
    }),

  /** 获取某顾客的沟通记录列表（按时间倒序），同时返回该患者的预约记录 */
  list: protectedProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const [rows] = await (conn as any).execute(
        `SELECT id, customer_id, record_type, biz_type, raw_text, audio_url,
                summary_demand, summary_hospital, summary_key_points, summary_followup, summary_remark,
                followup_date, followup_status, followup_assignee,
                ai_generated, operator_id, operator_name, comm_at, created_at
         FROM yaban_comm_record
         WHERE tenant_id = ? AND customer_id = ?
         ORDER BY comm_at DESC`,
        [TENANT_ID, input.customerId]
      );
      // 同时查询该患者的预约记录
      let appointments: any[] = [];
      try {
        const [apptRows] = await (conn as any).execute(
          `SELECT id, patient_id, patient_name, doctor, room, project,
                  appoint_date, appoint_time, end_time, duration, status, remark, created_at
           FROM yaban_appointment
           WHERE tenant_id = ? AND patient_id = ?
           ORDER BY appoint_date DESC, appoint_time DESC`,
          [TENANT_ID, input.customerId]
        );
        appointments = (apptRows as any[]).map((r: any) => ({
          id: Number(r.id),
          patientId: Number(r.patient_id),
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
      } catch (e) {
        // 预约表查询失败不影响主流程
      }
      return { records: rows as any[], appointments };
    }),

  /** 创建沟通记录（手动录入） */
  create: protectedProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
      recordType: z.enum(['voice', 'text', 'manual']).default('manual'),
      rawText: z.string().optional(),
      audioUrl: z.string().optional(),
      summaryDemand: z.string().optional(),
      summaryHospital: z.string().optional(),
      summaryKeyPoints: z.string().optional(),
      summaryFollowup: z.string().optional(),
      summaryRemark: z.string().optional(),
      aiGenerated: z.boolean().default(false),
      commAt: z.string().optional(), // ISO 日期字符串
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const operatorName = (ctx.user as any).name || (ctx.user as any).username || '';
      const commAt = input.commAt ? new Date(input.commAt) : new Date();
      const [result] = await (conn as any).execute(
        `INSERT INTO yaban_comm_record
          (tenant_id, customer_id, record_type, raw_text, audio_url,
           summary_demand, summary_hospital, summary_key_points, summary_followup, summary_remark,
           ai_generated, operator_id, operator_name, comm_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          TENANT_ID, input.customerId, input.recordType,
          input.rawText || null, input.audioUrl || null,
          input.summaryDemand || null, input.summaryHospital || null,
          input.summaryKeyPoints || null,
          input.summaryFollowup || null, input.summaryRemark || null,
          input.aiGenerated ? 1 : 0,
          ctx.user.id, operatorName, commAt,
        ]
      );
      return { id: (result as any).insertId, success: true };
    }),

  /** 更新沟通记录 */
  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      summaryDemand: z.string().optional(),
      summaryHospital: z.string().optional(),
      summaryKeyPoints: z.string().optional(),
      summaryFollowup: z.string().optional(),
      summaryRemark: z.string().optional(),
      rawText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `UPDATE yaban_comm_record
         SET summary_demand = ?, summary_hospital = ?, summary_key_points = ?, summary_followup = ?, summary_remark = ?,
             raw_text = COALESCE(?, raw_text), updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [
          input.summaryDemand || null, input.summaryHospital || null,
          input.summaryKeyPoints || null,
          input.summaryFollowup || null, input.summaryRemark || null,
          input.rawText || null, input.id, TENANT_ID,
        ]
      );
      return { success: true };
    }),

  /** 删除沟通记录 */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `DELETE FROM yaban_comm_record WHERE id = ? AND tenant_id = ?`,
        [input.id, TENANT_ID]
      );
      return { success: true };
    }),

  /**
   * AI 语音秘书：接收 base64 音频，调用 Whisper 转写，再用 DeepSeek 提取摘要
   * 前端将多段录音合并为一个 webm/mp4 blob，转 base64 后传入
   */
  analyzeVoice: protectedProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
      audioBase64: z.string(), // data:audio/webm;base64,xxx 或纯 base64
      mimeType: z.string().default('audio/webm'),
    }))
    .mutation(async ({ ctx, input }) => {
      const TENANT_ID = await resolveTenantId(ctx);
      console.log(`[AI语音秘书] analyzeVoice 收到请求: mimeType=${input.mimeType}, base64长度=${input.audioBase64.length}, 估算大小=${Math.round(input.audioBase64.length * 0.75 / 1024)}KB`);
      // Step 1: 上传音频到 COS，获取 URL
      let audioUrl: string | null = null;
      try {
        const { uploadFileToCOS } = await import('./cos-upload');
        audioUrl = await uploadFileToCOS(
          input.audioBase64,
          'yaban-voice-records',
          `comm_${TENANT_ID}_${input.customerId}_${Date.now()}.webm`,
          input.mimeType
        );
      } catch (e) {
        console.error('[AI语音秘书] 音频上传失败:', e);
        // 上传失败不阻断流程，继续转写
      }

      // Step 2: 调用 Whisper 转写（复用企业微信 callAIVoice，共用同一套 voice_asr 配置）
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, '');
      const audioBuffer = Buffer.from(base64Data, 'base64');
      let rawText = '';
      try {
        const asrResult = await callAIVoice(audioBuffer, input.mimeType);
        rawText = asrResult.text?.trim() || '';
        if (!rawText) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '语音转写失败：未能识别到内容，请重新录音',
          });
        }
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `语音转写失败：${e?.message || '未知错误'}`,
        });
      }

      // Step 3: 获取 AI 提示词（优先使用院长自定义，否则用默认）
      let promptContent = DEFAULT_COMM_PROMPT;
      try {
        const conn = await getDbConnection();
        if (conn) {
          const [rows] = await (conn as any).execute(
            `SELECT prompt_content FROM yaban_ai_prompt_config WHERE tenant_id = ? AND prompt_key = 'comm_summary' LIMIT 1`,
            [TENANT_ID]
          );
          if ((rows as any[]).length > 0) {
            promptContent = (rows as any[])[0].prompt_content;
          }
        }
      } catch (e) {
        console.error('[AI语音秘书] 获取提示词失败，使用默认:', e);
      }

      // Step 4: 调用混元提取摘要
      let summaryDemand = '';
      let summaryHospital = '';
      let summaryKeyPoints = '';
      let summaryFollowup = '';
      let summaryRemark = '';

      try {
        const hunyuanApiKey = ENV.hunyuanApiKey;
        const hunyuanApiBase = ENV.hunyuanApiBase;
        if (!hunyuanApiKey) throw new Error('混元 API Key 未配置');

        const hunyuanResp = await fetch(`${hunyuanApiBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${hunyuanApiKey}`,
          },
          body: JSON.stringify({
            model: 'hunyuan-lite',
            messages: [
              { role: 'system', content: promptContent },
              { role: 'user', content: `对话内容如下：\n\n${rawText}` },
            ],
            max_tokens: 1024,
          }),
        });

        if (!hunyuanResp.ok) {
          const errText = await hunyuanResp.text().catch(() => '');
          throw new Error(`混元 API 请求失败(${hunyuanResp.status}): ${errText.substring(0, 100)}`);
        }

        const hunyuanData = await hunyuanResp.json() as any;
        const content = hunyuanData?.choices?.[0]?.message?.content || '';
        console.log('[AI语音秘书] 混元返回原始内容:', content.substring(0, 300));
        if (content) {
          // 容错：提取 JSON（去掉 markdown 代码块，取第一个 {...} 片段）
          let jsonStr = content.replace(/```json\n?|```\n?|\n?```/g, '').trim();
          const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (braceMatch) jsonStr = braceMatch[0];
          const parsed = JSON.parse(jsonStr);
          // 容错：字段可能被模型返回为对象/数组，统一展平为字符串
          const toStr = (v: any): string => {
            if (v == null) return '';
            if (typeof v === 'string') return v;
            if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join('；');
            if (typeof v === 'object') return Object.values(v).map(toStr).filter(Boolean).join('；');
            return String(v);
          };
          summaryDemand = toStr(parsed.demand);
          summaryHospital = toStr(parsed.hospital);
          summaryKeyPoints = toStr(parsed.keyPoints);
          summaryFollowup = toStr(parsed.followup);
          summaryRemark = toStr(parsed.remark);
        }
      } catch (e) {
        console.error('[AI语音秘书] AI摘要提取失败:', e);
        // AI 失败不阻断，返回原始转写文字，让用户手动填写
      }

      return {
        rawText,
        audioUrl,
        summaryDemand,
        summaryHospital,
        summaryKeyPoints,
        summaryFollowup,
        summaryRemark,
      };
    }),

  /** 获取 AI 提示词配置 */
  getPromptConfig: protectedProcedure
    .input(z.object({ promptKey: z.string() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const [rows] = await (conn as any).execute(
        `SELECT prompt_content, description, updated_at FROM yaban_ai_prompt_config
         WHERE tenant_id = ? AND prompt_key = ? LIMIT 1`,
        [TENANT_ID, input.promptKey]
      );
      if ((rows as any[]).length === 0) {
        // 返回默认提示词
        return {
          promptContent: DEFAULT_COMM_PROMPT,
          description: '沟通记录 AI 摘要提示词',
          isDefault: true,
        };
      }
      return {
        promptContent: (rows as any[])[0].prompt_content,
        description: (rows as any[])[0].description || '',
        isDefault: false,
      };
    }),

  /** 保存 AI 提示词配置 */
  savePromptConfig: protectedProcedure
    .input(z.object({
      promptKey: z.string(),
      promptContent: z.string().min(10),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `INSERT INTO yaban_ai_prompt_config (tenant_id, prompt_key, prompt_content, description, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           prompt_content = VALUES(prompt_content),
           description = VALUES(description),
           updated_by = VALUES(updated_by),
           updated_at = NOW()`,
        [TENANT_ID, input.promptKey, input.promptContent, input.description || null, ctx.user.id]
      );
      return { success: true };
    }),

  /** 列出所有 AI 提示词配置（供前端展示） */
  listPrompts: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }))
    .query(async ({ ctx }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const [rows] = await (conn as any).execute(
        `SELECT prompt_key, prompt_content, updated_at FROM yaban_ai_prompt_config WHERE tenant_id = ?`,
        [TENANT_ID]
      );
      return { prompts: rows as any[] };
    }),

  /** 保存单个 AI 提示词（前端 YabanAIPrompts 使用） */
  savePrompt: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().optional(),
      promptKey: z.string(),
      promptContent: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `INSERT INTO yaban_ai_prompt_config (tenant_id, prompt_key, prompt_content, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           prompt_content = VALUES(prompt_content),
           updated_by = VALUES(updated_by),
           updated_at = NOW()`,
        [TENANT_ID, input.promptKey, input.promptContent, ctx.user.id]
      );
      return { success: true };
    }),

  /**
   * 保存录音分段：每3分钟自动调用，转写并存入临时表
   * 前端录音不中断，后台静默切段保存
   */
  saveVoiceSegment: protectedProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
      sessionKey: z.string().min(1).max(64), // 前端会话唯一标识
      segmentIndex: z.number().int().min(0),
      audioBase64: z.string(),
      mimeType: z.string().default('audio/mp4'),
      durationSec: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const TENANT_ID = await resolveTenantId(ctx);
      console.log(`[AI语音秘书] saveVoiceSegment: 客户${input.customerId} 第${input.segmentIndex}段, 时长${input.durationSec}s, base64长度=${input.audioBase64.length}`);

      // Step 1: Whisper 转写
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, '');
      const audioBuffer = Buffer.from(base64Data, 'base64');
      let rawText = '';
      try {
        const asrResult = await callAIVoice(audioBuffer, input.mimeType);
        rawText = asrResult.text?.trim() || '';
      } catch (e: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `第${input.segmentIndex + 1}段语音转写失败：${e?.message || '未知错误'}`,
        });
      }

      // Step 2: 上传音频到 COS
      let audioUrl: string | null = null;
      try {
        const { uploadFileToCOS } = await import('./cos-upload');
        audioUrl = await uploadFileToCOS(
          input.audioBase64,
          'yaban-voice-records',
          `seg_${TENANT_ID}_${input.customerId}_${input.sessionKey}_${input.segmentIndex}.mp4`,
          input.mimeType
        );
      } catch (e) {
        console.error('[AI语音秘书] 分段音频上传失败，不阻断流程:', e);
      }

      // Step 3: 存入临时表
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      await (conn as any).execute(
        `INSERT INTO yaban_voice_segment
          (tenant_id, customer_id, session_key, segment_index, raw_text, audio_url, duration_sec)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), audio_url = VALUES(audio_url), duration_sec = VALUES(duration_sec)`,
        [TENANT_ID, input.customerId, input.sessionKey, input.segmentIndex, rawText, audioUrl, input.durationSec]
      );

      console.log(`[AI语音秘书] 分段${input.segmentIndex}保存成功，转写内容：${rawText.substring(0, 50)}...`);
      return { success: true, rawText, segmentIndex: input.segmentIndex };
    }),

  /**
   * 合并分段并分析：将所有临时段文字拼接，再调用混元提取摘要
   * 前端点“结束并分析”时调用，传入最后一段音频（如果有）
   */
  analyzeWithSegments: protectedProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
      sessionKey: z.string().min(1).max(64),
      // 最后一段音频（如果录音未达3分钟就结束，直接传入）
      lastAudioBase64: z.string().optional(),
      lastMimeType: z.string().default('audio/mp4'),
      lastDurationSec: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const TENANT_ID = await resolveTenantId(ctx);
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });

      // Step 1: 转写最后一段（如果有）
      let lastRawText = '';
      if (input.lastAudioBase64) {
        try {
          const base64Data = input.lastAudioBase64.replace(/^data:[^;]+;base64,/, '');
          const audioBuffer = Buffer.from(base64Data, 'base64');
          const asrResult = await callAIVoice(audioBuffer, input.lastMimeType);
          lastRawText = asrResult.text?.trim() || '';
          // 保存最后一段
          const [existRows] = await (conn as any).execute(
            `SELECT MAX(segment_index) as maxIdx FROM yaban_voice_segment WHERE tenant_id = ? AND customer_id = ? AND session_key = ?`,
            [TENANT_ID, input.customerId, input.sessionKey]
          );
          const nextIdx = ((existRows as any[])[0]?.maxIdx ?? -1) + 1;
          let lastAudioUrl: string | null = null;
          try {
            const { uploadFileToCOS } = await import('./cos-upload');
            lastAudioUrl = await uploadFileToCOS(
              input.lastAudioBase64,
              'yaban-voice-records',
              `seg_${TENANT_ID}_${input.customerId}_${input.sessionKey}_${nextIdx}.mp4`,
              input.lastMimeType
            );
          } catch (e) { /* COS 失败不阻断 */ }
          await (conn as any).execute(
            `INSERT INTO yaban_voice_segment (tenant_id, customer_id, session_key, segment_index, raw_text, audio_url, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [TENANT_ID, input.customerId, input.sessionKey, nextIdx, lastRawText, lastAudioUrl, input.lastDurationSec]
          );
        } catch (e: any) {
          console.error('[AI语音秘书] 最后一段转写失败:', e);
          // 不阻断，用已有分段继续
        }
      }

      // Step 2: 合并所有分段文字
      const [segRows] = await (conn as any).execute(
        `SELECT segment_index, raw_text FROM yaban_voice_segment
         WHERE tenant_id = ? AND customer_id = ? AND session_key = ?
         ORDER BY segment_index ASC`,
        [TENANT_ID, input.customerId, input.sessionKey]
      );
      const segments = segRows as any[];
      if (segments.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '没有找到录音分段，请重新录音' });
      }
      const fullRawText = segments.map((s: any) => s.raw_text).filter(Boolean).join(' ');
      console.log(`[AI语音秘书] 合并${segments.length}段，总文字长度=${fullRawText.length}`);

      // Step 3: 获取 AI 提示词
      let promptContent = DEFAULT_COMM_PROMPT;
      try {
        const [rows] = await (conn as any).execute(
          `SELECT prompt_content FROM yaban_ai_prompt_config WHERE tenant_id = ? AND prompt_key = 'comm_summary' LIMIT 1`,
          [TENANT_ID]
        );
        if ((rows as any[]).length > 0) promptContent = (rows as any[])[0].prompt_content;
      } catch (e) { /* 使用默认 */ }

      // Step 4: 混元提取摘要
      let summaryDemand = '', summaryHospital = '', summaryKeyPoints = '', summaryFollowup = '', summaryRemark = '';
      try {
        const hunyuanApiKey = ENV.hunyuanApiKey;
        const hunyuanApiBase = ENV.hunyuanApiBase;
        if (!hunyuanApiKey) throw new Error('混元 API Key 未配置');
        const hunyuanResp = await fetch(`${hunyuanApiBase}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hunyuanApiKey}` },
          body: JSON.stringify({
            model: 'hunyuan-lite',
            messages: [
              { role: 'system', content: promptContent },
              { role: 'user', content: `对话内容如下：\n\n${fullRawText}` },
            ],
            max_tokens: 1024,
          }),
        });
        if (!hunyuanResp.ok) throw new Error(`混元请求失败(${hunyuanResp.status})`);
        const hunyuanData = await hunyuanResp.json() as any;
        const content = hunyuanData?.choices?.[0]?.message?.content || '';
        console.log('[AI语音秘书] 混元返回:', content.substring(0, 200));
        if (content) {
          let jsonStr = content.replace(/```json\n?|```\n?|\n?```/g, '').trim();
          const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (braceMatch) jsonStr = braceMatch[0];
          const parsed = JSON.parse(jsonStr);
          const toStr = (v: any): string => {
            if (v == null) return '';
            if (typeof v === 'string') return v;
            if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join('；');
            if (typeof v === 'object') return Object.values(v).map(toStr).filter(Boolean).join('；');
            return String(v);
          };
          summaryDemand = toStr(parsed.demand);
          summaryHospital = toStr(parsed.hospital);
          summaryKeyPoints = toStr(parsed.keyPoints);
          summaryFollowup = toStr(parsed.followup);
          summaryRemark = toStr(parsed.remark);
        }
      } catch (e) {
        console.error('[AI语音秘书] 摘要提取失败:', e);
      }

      // Step 5: 清空临时分段记录
      await (conn as any).execute(
        `DELETE FROM yaban_voice_segment WHERE tenant_id = ? AND customer_id = ? AND session_key = ?`,
        [TENANT_ID, input.customerId, input.sessionKey]
      );

      return {
        rawText: fullRawText,
        audioUrl: null,
        summaryDemand,
        summaryHospital,
        summaryKeyPoints,
        summaryFollowup,
        summaryRemark,
        segmentCount: segments.length,
      };
    }),

  /** 重置 AI 提示词为默认値 */
  resetPromptConfig: protectedProcedure
    .input(z.object({ promptKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `DELETE FROM yaban_ai_prompt_config WHERE tenant_id = ? AND prompt_key = ?`,
        [TENANT_ID, input.promptKey]
      );
      return { success: true, defaultPrompt: DEFAULT_COMM_PROMPT };
    }),
});
