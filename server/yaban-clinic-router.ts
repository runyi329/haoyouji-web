/**
 * 牙伴齿科 - 医院(企业信息)管理 后端路由
 *
 * 业务闭环：
 *   1. 院长/股东(owner) 在"我的-企业信息"提交/补全 企业信息(名称/税号/地址等)
 *   2. 创始人(founder) 在后台"大数据管理"看到所有医院，可命名/编辑详情、确认开通/驳回
 *   3. 创始人可搜索用户名，任命某用户为某医院的院长/股东(owner)
 *   4. 看板统计：每家医院各角色人数 / 顾客数 / 营业额，全部来自系统真实数据
 *
 * 说明：
 *   - 医院主表 yaban_clinic.tenant_id 关联各业务表(yaban_clinic_member/yaban_customer/yaban_charge)
 *   - 历史单店数据 tenant_id=1，已建占位记录
 *   - 双向维护：院长可提交，创始人也可直接编辑，写同一条记录
 *   - 全部使用 getDbConnection 原生 SQL；严禁 Emoji
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import { isYabanFounder } from "./yaban-role-router";

// 医院详情可编辑字段（创始人/院长共用）
const clinicDetailSchema = z.object({
  name: z.string().max(128).optional(),
  shortName: z.string().max(64).optional(),
  taxNo: z.string().max(64).optional(),
  clinicType: z.string().max(32).optional(),
  legalPerson: z.string().max(64).optional(),
  contactName: z.string().max(64).optional(),
  contactPhone: z.string().max(32).optional(),
  province: z.string().max(32).optional(),
  city: z.string().max(32).optional(),
  district: z.string().max(32).optional(),
  address: z.string().max(255).optional(),
  licenseNo: z.string().max(64).optional(),
  businessLicenseNo: z.string().max(64).optional(),
  licenseImage: z.string().max(512).optional(),
  logoImage: z.string().max(512).optional(),
  establishedDate: z.string().max(20).optional(),
  scale: z.string().max(32).optional(),
  intro: z.string().max(1000).optional(),
  remark: z.string().max(500).optional(),
});

// 字段名 -> 数据库列名 映射
const FIELD_COL: Record<string, string> = {
  name: "name",
  shortName: "short_name",
  taxNo: "tax_no",
  clinicType: "clinic_type",
  legalPerson: "legal_person",
  contactName: "contact_name",
  contactPhone: "contact_phone",
  province: "province",
  city: "city",
  district: "district",
  address: "address",
  licenseNo: "license_no",
  businessLicenseNo: "business_license_no",
  licenseImage: "license_image",
  logoImage: "logo_image",
  establishedDate: "established_date",
  scale: "scale",
  intro: "intro",
  remark: "remark",
};

function buildUpdateSet(input: Record<string, any>): { sql: string; params: any[] } {
  const sets: string[] = [];
  const params: any[] = [];
  for (const key of Object.keys(FIELD_COL)) {
    if (input[key] !== undefined) {
      const col = FIELD_COL[key];
      let val: any = input[key];
      if (col === "established_date") val = val ? val : null;
      else if (typeof val === "string") val = val.trim();
      sets.push(`${col}=?`);
      params.push(val);
    }
  }
  return { sql: sets.join(", "), params };
}

async function assertFounder(conn: any, ctx: any) {
  const ok = await isYabanFounder(ctx);
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "仅牙伴创始人可操作" });
}

// 判断用户是否为院长/股东(owner)；返回其所在医院 tenant_id 列表
async function getOwnerTenantIds(conn: any, userId: number): Promise<number[]> {
  const [rows] = (await conn.execute(
    `SELECT tenant_id FROM yaban_clinic_member WHERE user_id=? AND role_key='owner' AND status='active'`,
    [userId]
  )) as any;
  return (rows as any[]).map((r) => Number(r.tenant_id));
}

const SELECT_COLS = `id, tenant_id, name, short_name, tax_no, clinic_type, legal_person,
  contact_name, contact_phone, province, city, district, address,
  license_no, business_license_no, license_image, logo_image,
  established_date, scale, intro, remark,
  status, apply_user_id, apply_user_name, reject_reason, approved_by, approved_at, created_at, updated_at,
  show_room, show_dept, service_expire_at, service_plan`;

function mapClinicRow(c: any) {
  if (!c) return null;
  return {
    id: c.id,
    tenantId: c.tenant_id,
    name: c.name || "",
    shortName: c.short_name || "",
    taxNo: c.tax_no || "",
    clinicType: c.clinic_type || "",
    legalPerson: c.legal_person || "",
    contactName: c.contact_name || "",
    contactPhone: c.contact_phone || "",
    province: c.province || "",
    city: c.city || "",
    district: c.district || "",
    address: c.address || "",
    licenseNo: c.license_no || "",
    businessLicenseNo: c.business_license_no || "",
    licenseImage: c.license_image || "",
    logoImage: c.logo_image || "",
    establishedDate: c.established_date || "",
    scale: c.scale || "",
    intro: c.intro || "",
    remark: c.remark || "",
    status: c.status,
    applyUserId: c.apply_user_id,
    applyUserName: c.apply_user_name || "",
    rejectReason: c.reject_reason || "",
    approvedAt: c.approved_at,
    createdAt: c.created_at,
    showRoom: c.show_room === undefined ? true : c.show_room === 1,
    showDept: c.show_dept === undefined ? true : c.show_dept === 1,
    serviceExpireAt: c.service_expire_at ? String(c.service_expire_at).slice(0, 10) : null,
    servicePlan: c.service_plan || null,
  };
}

export const yabanClinicRouter = router({
  // ==================== 院长/股东侧 ====================

  // 我的企业信息（owner/shareholder 均可查，支持指定 tenantId）
  myClinic: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const conn = await getDbConnection();
    if (!conn) return { isOwner: false, clinic: null as any };
    const ownerTenantIds = await getOwnerTenantIds(conn, ctx.user.id);
    let clinic: any = null;
    // 优先用指定的 tenantId 直接查询
    if (input?.tenantId) {
      const [rows] = (await conn.execute(
        `SELECT ${SELECT_COLS} FROM yaban_clinic WHERE tenant_id=? LIMIT 1`,
        [input.tenantId]
      )) as any;
      clinic = (rows as any[])[0] || null;
      return { isOwner: ownerTenantIds.includes(input.tenantId), clinic: mapClinicRow(clinic) };
    }
    if (ownerTenantIds.length > 0) {
      // 优先取我作为 owner 关联的医院（按 tenant_id 匹配主表）
      const [rows] = (await conn.execute(
        `SELECT ${SELECT_COLS} FROM yaban_clinic WHERE tenant_id IN (${ownerTenantIds.map(() => "?").join(",")}) ORDER BY id DESC LIMIT 1`,
        ownerTenantIds
      )) as any;
      clinic = (rows as any[])[0] || null;
      // 如果该 tenant 还没主表记录，自动建一条占位（active），便于院长填写
      if (!clinic) {
        const [res] = (await conn.execute(
          `INSERT INTO yaban_clinic (tenant_id, name, status) VALUES (?, '', 'active')`,
          [ownerTenantIds[0]]
        )) as any;
        const [r2] = (await conn.execute(`SELECT ${SELECT_COLS} FROM yaban_clinic WHERE id=?`, [res.insertId])) as any;
        clinic = (r2 as any[])[0] || null;
      }
    }
    // 如果 owner 查不到，尝试通过 shareholder/其他成员身份查找
    if (!clinic) {
      const [memberRows] = (await conn.execute(
        `SELECT tenant_id FROM yaban_clinic_member WHERE user_id=? AND status='active' ORDER BY id ASC LIMIT 1`,
        [ctx.user.id]
      )) as any;
      const memberTenantId = (memberRows as any[])[0]?.tenant_id;
      if (memberTenantId) {
        const [rows2] = (await conn.execute(
          `SELECT ${SELECT_COLS} FROM yaban_clinic WHERE tenant_id=? LIMIT 1`,
          [memberTenantId]
        )) as any;
        clinic = (rows2 as any[])[0] || null;
      }
    }
    if (!clinic) {
      const [rows] = (await conn.execute(
        `SELECT ${SELECT_COLS} FROM yaban_clinic WHERE apply_user_id=? ORDER BY id DESC LIMIT 1`,
        [ctx.user.id]
      )) as any;
      clinic = (rows as any[])[0] || null;
    }
    return { isOwner: ownerTenantIds.length > 0, clinic: mapClinicRow(clinic) };
  }),

  // 更新诊室/科室可见性
  updateVisibility: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().optional(),
      showRoom: z.boolean().optional(),
      showDept: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const allowedTenantIds = await getOwnerTenantIds(conn, ctx.user.id);
      const tenantId = input.tenantId ?? allowedTenantIds[0];
      if (!tenantId || !allowedTenantIds.includes(tenantId)) throw new TRPCError({ code: "FORBIDDEN", message: "无权操作" });
      const sets: string[] = [];
      const params: any[] = [];
      if (input.showRoom !== undefined) { sets.push("show_room=?"); params.push(input.showRoom ? 1 : 0); }
      if (input.showDept !== undefined) { sets.push("show_dept=?"); params.push(input.showDept ? 1 : 0); }
      if (sets.length === 0) return { success: true };
      params.push(tenantId);
      await conn.execute(`UPDATE yaban_clinic SET ${sets.join(",")} WHERE tenant_id=?`, params);
      return { success: true };
    }),

  // 当前用户已加入的门店列表（下拉切换用）：参加几家返回几家
  // 来源：yaban_clinic_member(status=active) 关联 yaban_clinic 主表取门店名
  myClinics: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return { clinics: [] as any[] };
    const [rows] = (await conn.execute(
      `SELECT m.tenant_id AS tenantId, m.role_key AS roleKey,
              c.id AS clinicId, c.name AS name, c.short_name AS shortName, c.status AS status,
              c.service_expire_at AS serviceExpireAt, c.service_plan AS servicePlan
       FROM yaban_clinic_member m
       LEFT JOIN yaban_clinic c ON c.tenant_id = m.tenant_id
       WHERE m.user_id = ? AND m.status = 'active'
       ORDER BY FIELD(m.role_key,'owner','doctor','assistant','receptionist','finance'), m.tenant_id ASC`,
      [ctx.user.id]
    )) as any;
    const seen = new Set<number>();
    const clinics: any[] = [];
    for (const r of rows as any[]) {
      const tid = Number(r.tenantId);
      if (seen.has(tid)) continue;
      seen.add(tid);
      const display = (r.name && String(r.name).trim()) || (r.shortName && String(r.shortName).trim()) || `门店 ${tid}`;
      clinics.push({
        tenantId: tid,
        clinicId: r.clinicId ? Number(r.clinicId) : null,
        name: display,
        shortName: r.shortName || "",
        roleKey: r.roleKey || "",
        status: r.status || "",
        serviceExpireAt: r.serviceExpireAt ? String(r.serviceExpireAt).slice(0, 10) : null,
        servicePlan: r.servicePlan || null,
      });
    }
    // 演示院(tenant=9999)：仅对已加入至少一家门店的员工可见，顾客（clinics 为空）不追加
    const MODEL_TID = 9999;
    if (clinics.length > 0 && !seen.has(MODEL_TID)) {
      try {
        const [mrows] = (await conn.execute(
          `SELECT id AS clinicId, name, short_name AS shortName, status FROM yaban_clinic WHERE tenant_id = ? LIMIT 1`,
          [MODEL_TID]
        )) as any;
        const m = (mrows as any[])[0];
        if (m) {
          const mdisplay = (m.name && String(m.name).trim()) || (m.shortName && String(m.shortName).trim()) || "牙伴齿科";
          clinics.push({
            tenantId: MODEL_TID,
            clinicId: m.clinicId ? Number(m.clinicId) : null,
            name: mdisplay,
            shortName: m.shortName || "",
            roleKey: "",
            status: m.status || "active",
          });
        }
      } catch (e) { /* ignore */ }
    }
    return { clinics };
  }),

  // 院长提交/补全企业信息（全字段）
  applyClinic: protectedProcedure
    .input(clinicDetailSchema.extend({ name: z.string().min(2).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [uRows] = (await conn.execute(`SELECT name, username FROM users WHERE id=? LIMIT 1`, [ctx.user.id])) as any;
      const applyName = (uRows as any[])[0]?.name || (uRows as any[])[0]?.username || "";
      const { sql: setSql, params: setParams } = buildUpdateSet(input);
      const ownerTenantIds = await getOwnerTenantIds(conn, ctx.user.id);

      if (ownerTenantIds.length > 0) {
        // 已是 owner：更新其医院（按 tenant_id），不存在则建
        const [exist] = (await conn.execute(`SELECT id FROM yaban_clinic WHERE tenant_id=? LIMIT 1`, [ownerTenantIds[0]])) as any;
        const row = (exist as any[])[0];
        if (row) {
          await conn.execute(`UPDATE yaban_clinic SET ${setSql} WHERE id=?`, [...setParams, row.id]);
          return { success: true, clinicId: row.id, updated: true };
        }
        const [res] = (await conn.execute(
          `INSERT INTO yaban_clinic (tenant_id, ${Object.keys(FIELD_COL).filter((k)=>(input as any)[k]!==undefined).map((k)=>FIELD_COL[k]).join(",")}, status)
           VALUES (?, ${setParams.map(()=>"?").join(",")}, 'active')`,
          [ownerTenantIds[0], ...setParams]
        )) as any;
        return { success: true, clinicId: res.insertId, updated: false };
      }

      // 非 owner：作为开通申请提交（pending），覆盖自己未通过的旧申请
      const [existRows] = (await conn.execute(
        `SELECT id, status FROM yaban_clinic WHERE apply_user_id=? ORDER BY id DESC LIMIT 1`,
        [ctx.user.id]
      )) as any;
      const exist = (existRows as any[])[0];
      if (exist && exist.status !== "active") {
        await conn.execute(
          `UPDATE yaban_clinic SET ${setSql}, status='pending', reject_reason='' WHERE id=?`,
          [...setParams, exist.id]
        );
        return { success: true, clinicId: exist.id, updated: true };
      }
      const cols = Object.keys(FIELD_COL).filter((k) => (input as any)[k] !== undefined).map((k) => FIELD_COL[k]);
      const [res] = (await conn.execute(
        `INSERT INTO yaban_clinic (${cols.join(",")}, status, apply_user_id, apply_user_name)
         VALUES (${setParams.map(() => "?").join(",")}, 'pending', ?, ?)`,
        [...setParams, ctx.user.id, applyName]
      )) as any;
      return { success: true, clinicId: res.insertId, updated: false };
    }),

  // ==================== 创始人侧：大数据看板 ====================

  adminOverview: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
    await assertFounder(conn, ctx);
    const [[clinicAgg]] = (await conn.execute(
      `SELECT COUNT(*) AS total, SUM(status='active') AS active, SUM(status='pending') AS pending FROM yaban_clinic`
    )) as any;
    const [[ownerAgg]] = (await conn.execute(
      `SELECT COUNT(*) AS owners FROM yaban_clinic_member WHERE role_key='owner' AND status='active'`
    )) as any;
    const [[staffAgg]] = (await conn.execute(
      `SELECT COUNT(*) AS staff FROM yaban_clinic_member WHERE status='active'`
    )) as any;
    const [[custAgg]] = (await conn.execute(`SELECT COUNT(*) AS customers FROM yaban_customer`)) as any;
    const [[revAgg]] = (await conn.execute(`SELECT COALESCE(SUM(paid),0) AS revenue FROM yaban_charge`)) as any;
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

  // 医院列表（含各角色人数 + 顾客数 + 营业额）
  adminListClinics: protectedProcedure
    .input(z.object({ keyword: z.string().optional().default("") }).optional())
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await assertFounder(conn, ctx);
      const kw = (input?.keyword || "").trim();

      let clinicSql = `SELECT ${SELECT_COLS} FROM yaban_clinic`;
      const params: any[] = [];
      if (kw) {
        clinicSql += ` WHERE name LIKE ? OR tax_no LIKE ? OR city LIKE ?`;
        params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
      }
      clinicSql += ` ORDER BY FIELD(status,'pending','active','rejected'), id DESC`;
      const [clinicRows] = (await conn.execute(clinicSql, params)) as any;
      const clinics = clinicRows as any[];

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

      return clinics.map((c) => {
        const tid = Number(c.tenant_id);
        const m = memberMap[tid] || {};
        const base = mapClinicRow(c)!;
        return {
          ...base,
          ownerCount: Number(m.owner_cnt || 0),
          doctorCount: Number(m.doctor_cnt || 0),
          assistantCount: Number(m.assistant_cnt || 0),
          receptionistCount: Number(m.receptionist_cnt || 0),
          financeCount: Number(m.finance_cnt || 0),
          staffCount: Number(m.staff_cnt || 0),
          customerCount: custMap[tid] || 0,
          revenue: revMap[tid] || 0,
        };
      });
    }),

  // 单家医院详情：完整信息 + 成员名册
  adminClinicDetail: protectedProcedure
    .input(z.object({ clinicId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await assertFounder(conn, ctx);
      const [cRows] = (await conn.execute(`SELECT ${SELECT_COLS} FROM yaban_clinic WHERE id=? LIMIT 1`, [input.clinicId])) as any;
      const raw = (cRows as any[])[0];
      if (!raw) throw new TRPCError({ code: "NOT_FOUND", message: "医院不存在" });
      const tid = Number(raw.tenant_id);
      const [members] = (await conn.execute(
        `SELECT m.user_id, m.role_key, m.status, m.created_at, u.username, u.name, u.phone, u.avatar,
                r.name AS role_name
         FROM yaban_clinic_member m
         JOIN users u ON u.id=m.user_id
         LEFT JOIN yaban_clinic_role r ON r.role_key=m.role_key
         WHERE m.tenant_id=? AND m.status='active'
         ORDER BY FIELD(m.role_key,'owner','doctor','assistant','receptionist','finance'), m.created_at ASC`,
        [tid]
      )) as any;
      const [[custAgg]] = (await conn.execute(`SELECT COUNT(*) AS c FROM yaban_customer WHERE tenant_id=?`, [tid])) as any;
      const [[revAgg]] = (await conn.execute(`SELECT COALESCE(SUM(paid),0) AS rev FROM yaban_charge WHERE tenant_id=?`, [tid])) as any;
      return {
        clinic: mapClinicRow(raw),
        members: members as any[],
        customerCount: Number(custAgg.c || 0),
        revenue: Number(revAgg.rev || 0),
      };
    }),

  // 创始人：新建医院（可指定 tenant_id，留空则自动分配新的）
  adminCreateClinic: protectedProcedure
    .input(clinicDetailSchema.extend({ name: z.string().min(1).max(128), tenantId: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await assertFounder(conn, ctx);
      let tenantId = input.tenantId;
      if (!tenantId) {
        // 自动分配：取 member/customer/clinic 中最大 tenant_id + 1
        const [[r]] = (await conn.execute(
          `SELECT GREATEST(
              COALESCE((SELECT MAX(tenant_id) FROM yaban_clinic),0),
              COALESCE((SELECT MAX(tenant_id) FROM yaban_clinic_member),0),
              COALESCE((SELECT MAX(tenant_id) FROM yaban_customer),0)
           ) AS maxt`
        )) as any;
        tenantId = Number(r.maxt || 0) + 1;
      }
      const cols = Object.keys(FIELD_COL).filter((k) => input[k as keyof typeof input] !== undefined).map((k) => FIELD_COL[k]);
      const { params: setParams } = buildUpdateSet(input as any);
      const [res] = (await conn.execute(
        `INSERT INTO yaban_clinic (tenant_id, ${cols.join(",")}, status, approved_by, approved_at)
         VALUES (?, ${setParams.map(() => "?").join(",")}, 'active', ?, NOW())`,
        [tenantId, ...setParams, ctx.user.id]
      )) as any;
      // 自动绑定到「牙伴在线」企微客服渠道（channel_id=4，硬编码）
      try {
        const clinicName = (input as any).name || `诊所${tenantId}`;
        await conn.execute(
          `INSERT IGNORE INTO wecom_channel_service_binding
           (channel_id, service_type, service_tenant_id, service_tenant_name, created_at)
           VALUES (4, 'yaban', ?, ?, NOW())`,
          [String(tenantId), clinicName]
        );
      } catch (_e) {
        // 自动绑定失败不影响主流程
      }
      return { success: true, clinicId: res.insertId, tenantId };
    }),

  // 创始人：编辑医院全字段（命名/补全详情）
  adminUpdateClinic: protectedProcedure
    .input(clinicDetailSchema.extend({ clinicId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await assertFounder(conn, ctx);
      const { sql: setSql, params: setParams } = buildUpdateSet(input as any);
      if (!setSql) return { success: true };
      await conn.execute(`UPDATE yaban_clinic SET ${setSql} WHERE id=?`, [...setParams, input.clinicId]);
      return { success: true };
    }),

  // 确认开通（批准）
  adminApprove: protectedProcedure
    .input(z.object({ clinicId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await assertFounder(conn, ctx);
      const [cRows] = (await conn.execute(`SELECT * FROM yaban_clinic WHERE id=? LIMIT 1`, [input.clinicId])) as any;
      const clinic = (cRows as any[])[0];
      if (!clinic) throw new TRPCError({ code: "NOT_FOUND", message: "医院不存在" });
      // 批准时若没有 tenant_id 则分配一个
      let tenantId = clinic.tenant_id;
      if (!tenantId) {
        const [[r]] = (await conn.execute(
          `SELECT GREATEST(
              COALESCE((SELECT MAX(tenant_id) FROM yaban_clinic),0),
              COALESCE((SELECT MAX(tenant_id) FROM yaban_clinic_member),0),
              COALESCE((SELECT MAX(tenant_id) FROM yaban_customer),0)
           ) AS maxt`
        )) as any;
        tenantId = Number(r.maxt || 0) + 1;
      }
      await conn.execute(
        `UPDATE yaban_clinic SET status='active', tenant_id=?, reject_reason='', approved_by=?, approved_at=NOW() WHERE id=?`,
        [tenantId, ctx.user.id, input.clinicId]
      );
      if (clinic.apply_user_id) {
        await conn.execute(
          `INSERT INTO yaban_clinic_member (tenant_id, user_id, role_key, status, invited_by)
           VALUES (?, ?, 'owner', 'active', ?)
           ON DUPLICATE KEY UPDATE role_key='owner', status='active', updated_at=CURRENT_TIMESTAMP`,
          [tenantId, clinic.apply_user_id, ctx.user.id]
        );
      }
      // 自动绑定到「牙伴在线」企微客服渠道（channel_id=4，硬编码）
      try {
        const clinicName = clinic.name || `诊所${tenantId}`;
        await conn.execute(
          `INSERT IGNORE INTO wecom_channel_service_binding
           (channel_id, service_type, service_tenant_id, service_tenant_name, created_at)
           VALUES (4, 'yaban', ?, ?, NOW())`,
          [String(tenantId), clinicName]
        );
      } catch (_e) {
        // 自动绑定失败不影响主流程
      }
      return { success: true };
    }),

  // 驳回
  adminReject: protectedProcedure
    .input(z.object({ clinicId: z.number().int(), reason: z.string().max(255).optional().default("") }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await assertFounder(conn, ctx);
      await conn.execute(
        `UPDATE yaban_clinic SET status='rejected', reject_reason=? WHERE id=?`,
        [(input.reason || "").trim(), input.clinicId]
      );
      return { success: true };
    }),

  // 创始人搜索用户
  adminSearchUser: protectedProcedure
    .input(z.object({ keyword: z.string().min(1).max(50) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await assertFounder(conn, ctx);
      const kw = `%${input.keyword.trim()}%`;
      const [rows] = (await conn.execute(
        `SELECT id, username, name, phone, avatar FROM users
         WHERE username LIKE ? OR name LIKE ? OR phone LIKE ? LIMIT 20`,
        [kw, kw, kw]
      )) as any;
      return rows as any[];
    }),

  // 创始人任命某用户为某医院 院长/股东(owner)
  adminAppointOwner: protectedProcedure
    .input(z.object({ clinicId: z.number().int(), userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await assertFounder(conn, ctx);
      const [cRows] = (await conn.execute(`SELECT tenant_id FROM yaban_clinic WHERE id=? LIMIT 1`, [input.clinicId])) as any;
      const tid = Number((cRows as any[])[0]?.tenant_id || 0);
      if (!tid) throw new TRPCError({ code: "BAD_REQUEST", message: "该医院尚未分配租户，请先确认开通" });
      await conn.execute(
        `INSERT INTO yaban_clinic_member (tenant_id, user_id, role_key, status, invited_by)
         VALUES (?, ?, 'owner', 'active', ?)
         ON DUPLICATE KEY UPDATE role_key='owner', status='active', updated_at=CURRENT_TIMESTAMP`,
        [tid, input.userId, ctx.user.id]
      );
      return { success: true };
    }),

  // 创始人取消某用户 owner 任命
  adminRemoveOwner: protectedProcedure
    .input(z.object({ clinicId: z.number().int(), userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await assertFounder(conn, ctx);
      const [cRows] = (await conn.execute(`SELECT tenant_id FROM yaban_clinic WHERE id=? LIMIT 1`, [input.clinicId])) as any;
      const tid = Number((cRows as any[])[0]?.tenant_id || 0);
      if (!tid) return { success: true };
      await conn.execute(
        `DELETE FROM yaban_clinic_member WHERE tenant_id=? AND user_id=? AND role_key='owner'`,
        [tid, input.userId]
      );
      return { success: true };
    }),

  // 查询当前用户所在诊所的服务到期状态（普通用户可用）
  getMyServiceStatus: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return { found: false, expireAt: null as string | null, plan: null as string | null, daysLeft: null as number | null };
      let tenantId = input?.tenantId || 0;
      if (!tenantId) {
        const [memberRows] = (await conn.execute(
          `SELECT tenant_id FROM yaban_clinic_member WHERE user_id=? AND status='active' ORDER BY id ASC LIMIT 1`,
          [ctx.user.id]
        )) as any;
        tenantId = Number((memberRows as any[])[0]?.tenant_id || 0);
      }
      if (!tenantId) return { found: false, expireAt: null, plan: null, daysLeft: null };
      const [clinicRows] = (await conn.execute(
        `SELECT service_expire_at, service_plan FROM yaban_clinic WHERE tenant_id=? LIMIT 1`,
        [tenantId]
      )) as any;
      const row = (clinicRows as any[])[0];
      if (!row) return { found: false, expireAt: null, plan: null, daysLeft: null };
      const expireAt = (() => {
        if (!row.service_expire_at) return null;
        const v = row.service_expire_at;
        // mysql2 可能返回 Date 对象或字符串，统一转为 YYYY-MM-DD
        if (v instanceof Date) {
          const y = v.getFullYear();
          const mo = String(v.getMonth() + 1).padStart(2, "0");
          const d = String(v.getDate()).padStart(2, "0");
          return `${y}-${mo}-${d}`;
        }
        return String(v).slice(0, 10);
      })();
      let daysLeft: number | null = null;
      if (expireAt) {
        const diff = new Date(expireAt).getTime() - Date.now();
        daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }
      return { found: true, expireAt, plan: row.service_plan || null, daysLeft };
    }),

  // 创始人设置某诊所的服务到期日期
  adminSetExpire: protectedProcedure
    .input(z.object({
      clinicId: z.number().int(),
      expireAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      plan: z.enum(["monthly", "annual", "lifetime"]).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await assertFounder(conn, ctx);
      await conn.execute(
        `UPDATE yaban_clinic SET service_expire_at=?, service_plan=? WHERE id=?`,
        [input.expireAt || null, input.plan || null, input.clinicId]
      );
      return { success: true };
    }),
});
