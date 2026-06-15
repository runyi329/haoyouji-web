/**
 * 牙伴齿科 - 医院(企业信息)管理 后端路由
 *
 * 业务闭环：
 *   1. 院长/股东(owner) 在"我的-企业信息"提交 企业名称 + 税号 -> 生成一条 pending 医院记录
 *   2. 创始人(founder) 在后台"大数据管理"看到所有医院申请，确认开通(active)/驳回(rejected)
 *   3. 创始人可搜索用户名，任命某用户为某医院的院长/股东(owner)
 *   4. 看板统计：每家医院的 院长/股东、医生、护士助理、前台、财务 人数，顾客数，营业额(实收)
 *      数据全部来自各院在系统中产生的真实数据（yaban_clinic_member / yaban_customer / yaban_charge）
 *
 * 说明：
 *   - 医院主表 yaban_clinic 的 id 即作为 tenant_id 维度
 *   - 历史单店数据 tenant_id=1，会作为"默认门诊"展示
 *   - 全部使用 getDbConnection 原生 SQL；严禁 Emoji
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import { isYabanFounder } from "./yaban-role-router";

// 确保医院主表存在
let clinicInitialized = false;
async function ensureClinicTable(conn: any) {
  if (clinicInitialized) return;
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_clinic (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      tax_no VARCHAR(64) DEFAULT '',
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      apply_user_id INT DEFAULT NULL,
      apply_user_name VARCHAR(64) DEFAULT '',
      reject_reason VARCHAR(255) DEFAULT '',
      approved_by INT DEFAULT NULL,
      approved_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_apply_user (apply_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='牙伴医院(企业信息)'
  `);
  clinicInitialized = true;
}

async function assertFounder(conn: any, ctx: any) {
  const ok = await isYabanFounder(ctx);
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "仅牙伴创始人可操作" });
}

// 判断用户是否为院长/股东(owner)；返回其所在医院 id 列表
async function getOwnerClinicIds(conn: any, userId: number): Promise<number[]> {
  const [rows] = (await conn.execute(
    `SELECT tenant_id FROM yaban_clinic_member WHERE user_id=? AND role_key='owner' AND status='active'`,
    [userId]
  )) as any;
  return (rows as any[]).map((r) => Number(r.tenant_id));
}

export const yabanClinicRouter = router({
  // ==================== 院长/股东侧 ====================

  // 我的企业信息（owner 才有意义）：返回我名下的医院（按 owner 成员关系 或 我提交的申请）
  myClinic: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return { isOwner: false, clinic: null as any };
    await ensureClinicTable(conn);
    const ownerClinicIds = await getOwnerClinicIds(conn, ctx.user.id);
    // 取我作为 owner 关联的医院（优先），或我自己提交过的申请
    let clinic: any = null;
    if (ownerClinicIds.length > 0) {
      const [rows] = (await conn.execute(
        `SELECT * FROM yaban_clinic WHERE id IN (${ownerClinicIds.map(() => "?").join(",")}) ORDER BY id DESC LIMIT 1`,
        ownerClinicIds
      )) as any;
      clinic = (rows as any[])[0] || null;
    }
    if (!clinic) {
      const [rows] = (await conn.execute(
        `SELECT * FROM yaban_clinic WHERE apply_user_id=? ORDER BY id DESC LIMIT 1`,
        [ctx.user.id]
      )) as any;
      clinic = (rows as any[])[0] || null;
    }
    return { isOwner: ownerClinicIds.length > 0, clinic };
  }),

  // 提交/更新企业信息申请（企业名称 + 税号）
  applyClinic: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(128),
        taxNo: z.string().min(0).max(64).optional().default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureClinicTable(conn);
      const name = input.name.trim();
      const taxNo = (input.taxNo || "").trim();
      // 当前用户名
      const [uRows] = (await conn.execute(`SELECT name, username FROM users WHERE id=? LIMIT 1`, [ctx.user.id])) as any;
      const applyName = (uRows as any[])[0]?.name || (uRows as any[])[0]?.username || "";
      // 如果该用户已是某医院 owner，则更新该医院信息；否则若已有自己提交的待审/驳回申请则更新，否则新建
      const ownerClinicIds = await getOwnerClinicIds(conn, ctx.user.id);
      if (ownerClinicIds.length > 0) {
        await conn.execute(
          `UPDATE yaban_clinic SET name=?, tax_no=? WHERE id=?`,
          [name, taxNo, ownerClinicIds[0]]
        );
        return { success: true, clinicId: ownerClinicIds[0], updated: true };
      }
      const [existRows] = (await conn.execute(
        `SELECT id, status FROM yaban_clinic WHERE apply_user_id=? ORDER BY id DESC LIMIT 1`,
        [ctx.user.id]
      )) as any;
      const exist = (existRows as any[])[0];
      if (exist && exist.status !== "active") {
        // 重新提交：覆盖原申请，状态回到 pending
        await conn.execute(
          `UPDATE yaban_clinic SET name=?, tax_no=?, status='pending', reject_reason='' WHERE id=?`,
          [name, taxNo, exist.id]
        );
        return { success: true, clinicId: exist.id, updated: true };
      }
      const [res] = (await conn.execute(
        `INSERT INTO yaban_clinic (name, tax_no, status, apply_user_id, apply_user_name)
         VALUES (?, ?, 'pending', ?, ?)`,
        [name, taxNo, ctx.user.id, applyName]
      )) as any;
      return { success: true, clinicId: res.insertId, updated: false };
    }),

  // ==================== 创始人侧：大数据看板 ====================

  // 顶部总览汇总
  adminOverview: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await ensureClinicTable(conn);
    await assertFounder(conn, ctx);
    const [[clinicAgg]] = (await conn.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(status='active') AS active,
         SUM(status='pending') AS pending
       FROM yaban_clinic`
    )) as any;
    const [[ownerAgg]] = (await conn.execute(
      `SELECT COUNT(*) AS owners FROM yaban_clinic_member WHERE role_key='owner' AND status='active'`
    )) as any;
    const [[staffAgg]] = (await conn.execute(
      `SELECT COUNT(*) AS staff FROM yaban_clinic_member WHERE status='active'`
    )) as any;
    const [[custAgg]] = (await conn.execute(`SELECT COUNT(*) AS customers FROM yaban_customer`)) as any;
    const [[revAgg]] = (await conn.execute(
      `SELECT COALESCE(SUM(paid),0) AS revenue FROM yaban_charge`
    )) as any;
    return {
      clinicTotal: Number(clinicAgg.total || 0),
      clinicActive: Number(clinicAgg.active || 0),
      clinicPending: Number(clinicAgg.pending || 0),
      ownerTotal: Number(ownerAgg.owners || 0),
      staffTotal: Number(staffAgg.staff || 0),
      customerTotal: Number(custAgg.customers || 0),
      revenueTotal: Number(revAgg.revenue || 0),
    };
  }),

  // 医院列表（含各角色人数 + 顾客数 + 营业额统计）
  adminListClinics: protectedProcedure
    .input(z.object({ keyword: z.string().optional().default("") }).optional())
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureClinicTable(conn);
      await assertFounder(conn, ctx);
      const kw = (input?.keyword || "").trim();

      // 1) 医院主表记录
      let clinicSql = `SELECT id, name, tax_no, status, apply_user_id, apply_user_name, reject_reason, created_at, approved_at FROM yaban_clinic`;
      const params: any[] = [];
      if (kw) {
        clinicSql += ` WHERE name LIKE ? OR tax_no LIKE ?`;
        params.push(`%${kw}%`, `%${kw}%`);
      }
      clinicSql += ` ORDER BY FIELD(status,'pending','active','rejected'), id DESC`;
      const [clinicRows] = (await conn.execute(clinicSql, params)) as any;
      const clinics = clinicRows as any[];

      // 2) 按 tenant_id 聚合各角色人数
      const [memberAgg] = (await conn.execute(
        `SELECT tenant_id,
                SUM(role_key='owner') AS owner_cnt,
                SUM(role_key='doctor') AS doctor_cnt,
                SUM(role_key='assistant') AS assistant_cnt,
                SUM(role_key='receptionist') AS receptionist_cnt,
                SUM(role_key='finance') AS finance_cnt,
                COUNT(*) AS staff_cnt
         FROM yaban_clinic_member WHERE status='active' GROUP BY tenant_id`
      )) as any;
      const memberMap: Record<number, any> = {};
      for (const m of memberAgg as any[]) memberMap[Number(m.tenant_id)] = m;

      // 3) 顾客数 / 营业额 按 tenant_id 聚合
      const [custAgg] = (await conn.execute(
        `SELECT tenant_id, COUNT(*) AS cust_cnt FROM yaban_customer GROUP BY tenant_id`
      )) as any;
      const custMap: Record<number, number> = {};
      for (const c of custAgg as any[]) custMap[Number(c.tenant_id)] = Number(c.cust_cnt);
      const [revAgg] = (await conn.execute(
        `SELECT tenant_id, COALESCE(SUM(paid),0) AS rev FROM yaban_charge GROUP BY tenant_id`
      )) as any;
      const revMap: Record<number, number> = {};
      for (const r of revAgg as any[]) revMap[Number(r.tenant_id)] = Number(r.rev);

      const result = clinics.map((c) => {
        const m = memberMap[c.id] || {};
        return {
          id: c.id,
          name: c.name,
          taxNo: c.tax_no,
          status: c.status,
          applyUserId: c.apply_user_id,
          applyUserName: c.apply_user_name,
          rejectReason: c.reject_reason,
          createdAt: c.created_at,
          approvedAt: c.approved_at,
          ownerCount: Number(m.owner_cnt || 0),
          doctorCount: Number(m.doctor_cnt || 0),
          assistantCount: Number(m.assistant_cnt || 0),
          receptionistCount: Number(m.receptionist_cnt || 0),
          financeCount: Number(m.finance_cnt || 0),
          staffCount: Number(m.staff_cnt || 0),
          customerCount: custMap[c.id] || 0,
          revenue: revMap[c.id] || 0,
        };
      });

      // 附带：历史默认门诊(tenant_id=1) 如果有成员但没有医院主记录，也展示出来
      const hasTenant1 = clinics.some((c) => c.id === 1);
      if (!hasTenant1 && (memberMap[1] || custMap[1] || revMap[1]) && !kw) {
        const m = memberMap[1] || {};
        result.unshift({
          id: 1,
          name: "默认门诊（历史数据）",
          taxNo: "",
          status: "active",
          applyUserId: null,
          applyUserName: "",
          rejectReason: "",
          createdAt: null,
          approvedAt: null,
          ownerCount: Number(m.owner_cnt || 0),
          doctorCount: Number(m.doctor_cnt || 0),
          assistantCount: Number(m.assistant_cnt || 0),
          receptionistCount: Number(m.receptionist_cnt || 0),
          financeCount: Number(m.finance_cnt || 0),
          staffCount: Number(m.staff_cnt || 0),
          customerCount: custMap[1] || 0,
          revenue: revMap[1] || 0,
        });
      }
      return result;
    }),

  // 单家医院详情：成员名册（按角色分组）
  adminClinicDetail: protectedProcedure
    .input(z.object({ clinicId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureClinicTable(conn);
      await assertFounder(conn, ctx);
      const [cRows] = (await conn.execute(`SELECT * FROM yaban_clinic WHERE id=? LIMIT 1`, [input.clinicId])) as any;
      const clinic = (cRows as any[])[0] || (input.clinicId === 1 ? { id: 1, name: "默认门诊（历史数据）", status: "active" } : null);
      const [members] = (await conn.execute(
        `SELECT m.user_id, m.role_key, m.status, m.created_at, u.username, u.name, u.phone, u.avatar,
                r.name AS role_name
         FROM yaban_clinic_member m
         JOIN users u ON u.id=m.user_id
         LEFT JOIN yaban_clinic_role r ON r.role_key=m.role_key
         WHERE m.tenant_id=? AND m.status='active'
         ORDER BY FIELD(m.role_key,'owner','doctor','assistant','receptionist','finance'), m.created_at ASC`,
        [input.clinicId]
      )) as any;
      const [[custAgg]] = (await conn.execute(
        `SELECT COUNT(*) AS c FROM yaban_customer WHERE tenant_id=?`,
        [input.clinicId]
      )) as any;
      const [[revAgg]] = (await conn.execute(
        `SELECT COALESCE(SUM(paid),0) AS rev FROM yaban_charge WHERE tenant_id=?`,
        [input.clinicId]
      )) as any;
      return {
        clinic,
        members: members as any[],
        customerCount: Number(custAgg.c || 0),
        revenue: Number(revAgg.rev || 0),
      };
    }),

  // 确认开通（批准）：将医院置为 active，并把申请人任命为该医院 owner
  adminApprove: protectedProcedure
    .input(z.object({ clinicId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureClinicTable(conn);
      await assertFounder(conn, ctx);
      const [cRows] = (await conn.execute(`SELECT * FROM yaban_clinic WHERE id=? LIMIT 1`, [input.clinicId])) as any;
      const clinic = (cRows as any[])[0];
      if (!clinic) throw new TRPCError({ code: "NOT_FOUND", message: "医院不存在" });
      await conn.execute(
        `UPDATE yaban_clinic SET status='active', reject_reason='', approved_by=?, approved_at=NOW() WHERE id=?`,
        [ctx.user.id, input.clinicId]
      );
      // 把申请人任命为该医院 owner（以医院 id 作为 tenant_id）
      if (clinic.apply_user_id) {
        await conn.execute(
          `INSERT INTO yaban_clinic_member (tenant_id, user_id, role_key, status, invited_by)
           VALUES (?, ?, 'owner', 'active', ?)
           ON DUPLICATE KEY UPDATE role_key='owner', status='active', updated_at=CURRENT_TIMESTAMP`,
          [input.clinicId, clinic.apply_user_id, ctx.user.id]
        );
      }
      return { success: true };
    }),

  // 驳回
  adminReject: protectedProcedure
    .input(z.object({ clinicId: z.number().int(), reason: z.string().max(255).optional().default("") }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureClinicTable(conn);
      await assertFounder(conn, ctx);
      await conn.execute(
        `UPDATE yaban_clinic SET status='rejected', reject_reason=? WHERE id=?`,
        [(input.reason || "").trim(), input.clinicId]
      );
      return { success: true };
    }),

  // 创始人搜索用户（按用户名/姓名/手机号）
  adminSearchUser: protectedProcedure
    .input(z.object({ keyword: z.string().min(1).max(50) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureClinicTable(conn);
      await assertFounder(conn, ctx);
      const kw = `%${input.keyword.trim()}%`;
      const [rows] = (await conn.execute(
        `SELECT id, username, name, phone, avatar FROM users
         WHERE username LIKE ? OR name LIKE ? OR phone LIKE ? LIMIT 20`,
        [kw, kw, kw]
      )) as any;
      return rows as any[];
    }),

  // 创始人任命某用户为某医院的 院长/股东(owner)
  adminAppointOwner: protectedProcedure
    .input(z.object({ clinicId: z.number().int(), userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureClinicTable(conn);
      await assertFounder(conn, ctx);
      await conn.execute(
        `INSERT INTO yaban_clinic_member (tenant_id, user_id, role_key, status, invited_by)
         VALUES (?, ?, 'owner', 'active', ?)
         ON DUPLICATE KEY UPDATE role_key='owner', status='active', updated_at=CURRENT_TIMESTAMP`,
        [input.clinicId, input.userId, ctx.user.id]
      );
      return { success: true };
    }),

  // 创始人取消某用户在某医院的 owner 任命（移除成员）
  adminRemoveOwner: protectedProcedure
    .input(z.object({ clinicId: z.number().int(), userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureClinicTable(conn);
      await assertFounder(conn, ctx);
      await conn.execute(
        `DELETE FROM yaban_clinic_member WHERE tenant_id=? AND user_id=? AND role_key='owner'`,
        [input.clinicId, input.userId]
      );
      return { success: true };
    }),
});
