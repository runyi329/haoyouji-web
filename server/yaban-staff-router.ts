/**
 * 牙伴齿科 · 人事驾驶舱后端路由（yabanStaff）
 *
 * 接口列表：
 *   list           - 员工列表（含人事字段）
 *   dashboardStats - 驾驶舱统计卡片数据
 *   warnings       - 合同/证照预警列表
 *   updateMember   - 更新员工人事字段（院长/创始人权限）
 *
 * 数据来源：
 *   yaban_clinic_member m
 *   JOIN users u ON u.id = m.user_id
 *   JOIN yaban_clinic c ON c.tenant_id = m.tenant_id
 *
 * 权限口径：
 *   - 创始人（ctx.user.role === 'super_admin'）：可查所有门店
 *   - 院长（role_key='owner'）：只能查自己门店
 *   - 其他角色：无权访问（抛 FORBIDDEN）
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 格式化 Date 对象或 Date 字符串为 YYYY-MM-DD，null 返回 null */
function fmtDate(d: any): string | null {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return null;
}

/** 计算合同状态：根据 contract_expire_at 自动推断 */
function calcContractStatus(
  contractExpireAt: string | null,
  storedStatus: string | null
): string {
  if (storedStatus === "unsigned") return "unsigned";
  if (!contractExpireAt) return storedStatus || "unsigned";
  const now = new Date();
  const expire = new Date(contractExpireAt);
  const diffDays = Math.floor((expire.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring";
  return "active";
}

/** 解析当前用户有权查看的 tenantId 列表 */
async function resolveTenantIds(
  ctx: any,
  conn: any,
  inputTenantId?: number
): Promise<number[]> {
  const isSuperAdmin = ctx.user?.role === "super_admin";
  if (isSuperAdmin) {
    if (inputTenantId) return [inputTenantId];
    // 超级管理员查所有已激活门店
    const [rows] = (await (conn as any).execute(
      `SELECT DISTINCT tenant_id FROM yaban_clinic WHERE status='active' ORDER BY tenant_id`
    )) as any;
    return (rows as any[]).map((r: any) => r.tenant_id);
  }
  // 普通用户：只能查自己是 owner 的门店
  const userId = ctx.user?.id;
  if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
  const [rows] = (await (conn as any).execute(
    `SELECT DISTINCT tenant_id FROM yaban_clinic_member WHERE user_id=? AND role_key='owner' AND status='active'`,
    [userId]
  )) as any;
  const tenantIds = (rows as any[]).map((r: any) => r.tenant_id);
  if (tenantIds.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "无权限查看人事数据" });
  }
  if (inputTenantId && tenantIds.includes(inputTenantId)) return [inputTenantId];
  return tenantIds;
}

// ─── 角色显示名映射 ───────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  owner: "院长",
  doctor: "医生",
  nurse: "护士",
  assistant: "助理",
  receptionist: "前台",
  finance: "财务",
  consultant: "咨询师",
  manager: "主管",
};

// ─── 路由定义 ─────────────────────────────────────────────────────────────────
export const yabanStaffRouter = router({
  /**
   * list - 员工列表
   * 入参: { tenantId?, clinicFilter?, search? }
   * 出参: Array<StaffRow>
   */
  list: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().optional(),
        clinicFilter: z.string().optional(), // 门店名，"全部" 或具体名称
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

      const tenantIds = await resolveTenantIds(ctx, conn, input.tenantId);
      if (tenantIds.length === 0) return [];

      const placeholders = tenantIds.map(() => "?").join(",");
      const params: any[] = [...tenantIds];

      let sql = `
        SELECT
          m.id,
          m.tenant_id,
          m.user_id,
          m.role_key,
          m.status,
          m.join_date,
          m.contract_expire_at,
          m.contract_status,
          m.gender,
          m.edu,
          m.license_expire_at,
          m.license_no,
          m.remark,
          m.created_at,
          u.name AS user_name,
          u.phone AS user_phone,
          u.avatar AS user_avatar,
          c.name AS clinic_name
        FROM yaban_clinic_member m
        JOIN users u ON u.id = m.user_id
        JOIN yaban_clinic c ON c.tenant_id = m.tenant_id
        WHERE m.status = 'active'
          AND m.tenant_id IN (${placeholders})
      `;

      if (input.clinicFilter && input.clinicFilter !== "全部") {
        sql += ` AND c.name = ?`;
        params.push(input.clinicFilter);
      }

      if (input.search) {
        sql += ` AND (u.name LIKE ? OR u.phone LIKE ?)`;
        params.push(`%${input.search}%`, `%${input.search}%`);
      }

      sql += ` ORDER BY m.tenant_id, m.role_key, m.id`;

      const [rows] = (await (conn as any).execute(sql, params)) as any;

      const now = new Date();
      return (rows as any[]).map((r: any) => {
        const joinDate = fmtDate(r.join_date);
        const contractExpireAt = fmtDate(r.contract_expire_at);
        const licenseExpireAt = fmtDate(r.license_expire_at);
        const contractStatus = calcContractStatus(contractExpireAt, r.contract_status);

        // 计算在职年限
        let yearsStr = "";
        if (joinDate) {
          const join = new Date(joinDate);
          const diffMs = now.getTime() - join.getTime();
          const years = Math.floor(diffMs / (365.25 * 86400000));
          const months = Math.floor((diffMs % (365.25 * 86400000)) / (30.44 * 86400000));
          if (years >= 1) yearsStr = `${years}年`;
          else if (months >= 1) yearsStr = `${months}个月`;
          else yearsStr = "不足1个月";
        }

        return {
          id: r.id,
          userId: r.user_id,
          tenantId: r.tenant_id,
          name: r.user_name || "未知",
          role: ROLE_LABEL[r.role_key] || r.role_key,
          roleKey: r.role_key,
          clinic: r.clinic_name || "",
          phone: r.user_phone || "",
          avatar: r.user_avatar || null,
          gender: r.gender || "",
          edu: r.edu || "",
          joinDate,
          yearsStr,
          contractStatus,
          contractExpireAt,
          licenseExpireAt,
          licenseNo: r.license_no || "",
          remark: r.remark || "",
        };
      });
    }),

  /**
   * dashboardStats - 驾驶舱统计卡片
   */
  dashboardStats: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().optional(),
        clinicFilter: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

      const tenantIds = await resolveTenantIds(ctx, conn, input.tenantId);
      if (tenantIds.length === 0) {
        return { total: 0, contractWarn: 0, newThisMonth: 0, licenseWarn: 0, doctorCount: 0, nurseCount: 0, newbieCount: 0 };
      }

      const placeholders = tenantIds.map(() => "?").join(",");
      const params: any[] = [...tenantIds];

      let clinicFilter = "";
      if (input.clinicFilter && input.clinicFilter !== "全部") {
        clinicFilter = ` AND c.name = ?`;
        params.push(input.clinicFilter);
      }

      const baseSql = `
        FROM yaban_clinic_member m
        JOIN users u ON u.id = m.user_id
        JOIN yaban_clinic c ON c.tenant_id = m.tenant_id
        WHERE m.status = 'active'
          AND m.tenant_id IN (${placeholders})
          ${clinicFilter}
      `;

      const now = new Date();
      const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

      // 总人数
      const [totalRows] = (await (conn as any).execute(
        `SELECT COUNT(*) AS cnt ${baseSql}`,
        [...params]
      )) as any;
      const total = Number((totalRows as any[])[0]?.cnt || 0);

      // 合同预警（expired/expiring/unsigned）
      const contractParams = [...params];
      const [contractRows] = (await (conn as any).execute(
        `SELECT COUNT(*) AS cnt ${baseSql}
         AND (
           m.contract_status = 'unsigned'
           OR (m.contract_expire_at IS NOT NULL AND m.contract_expire_at <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))
         )`,
        contractParams
      )) as any;
      const contractWarn = Number((contractRows as any[])[0]?.cnt || 0);

      // 本月新入职
      const [newRows] = (await (conn as any).execute(
        `SELECT COUNT(*) AS cnt ${baseSql} AND m.join_date >= ?`,
        [...params, thisMonthStart]
      )) as any;
      const newThisMonth = Number((newRows as any[])[0]?.cnt || 0);

      // 证照预警（30天内到期）
      const [licenseRows] = (await (conn as any).execute(
        `SELECT COUNT(*) AS cnt ${baseSql}
         AND m.license_expire_at IS NOT NULL
         AND m.license_expire_at <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`,
        [...params]
      )) as any;
      const licenseWarn = Number((licenseRows as any[])[0]?.cnt || 0);

      // 医生人数
      const [doctorRows] = (await (conn as any).execute(
        `SELECT COUNT(*) AS cnt ${baseSql} AND m.role_key = 'doctor'`,
        [...params]
      )) as any;
      const doctorCount = Number((doctorRows as any[])[0]?.cnt || 0);

      // 护士人数
      const [nurseRows] = (await (conn as any).execute(
        `SELECT COUNT(*) AS cnt ${baseSql} AND m.role_key = 'nurse'`,
        [...params]
      )) as any;
      const nurseCount = Number((nurseRows as any[])[0]?.cnt || 0);

      // 新人（入职不足3个月）
      const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
      const [newbieRows] = (await (conn as any).execute(
        `SELECT COUNT(*) AS cnt ${baseSql} AND m.join_date >= ?`,
        [...params, threeMonthsAgo]
      )) as any;
      const newbieCount = Number((newbieRows as any[])[0]?.cnt || 0);

      return { total, contractWarn, newThisMonth, licenseWarn, doctorCount, nurseCount, newbieCount };
    }),

  /**
   * warnings - 合同/证照预警列表
   */
  warnings: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().optional(),
        clinicFilter: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

      const tenantIds = await resolveTenantIds(ctx, conn, input.tenantId);
      if (tenantIds.length === 0) return [];

      const placeholders = tenantIds.map(() => "?").join(",");
      const params: any[] = [...tenantIds];

      let clinicFilter = "";
      if (input.clinicFilter && input.clinicFilter !== "全部") {
        clinicFilter = ` AND c.name = ?`;
        params.push(input.clinicFilter);
      }

      const [rows] = (await (conn as any).execute(
        `SELECT
           m.id,
           m.user_id,
           m.role_key,
           m.contract_expire_at,
           m.contract_status,
           m.license_expire_at,
           u.name AS user_name,
           c.name AS clinic_name
         FROM yaban_clinic_member m
         JOIN users u ON u.id = m.user_id
         JOIN yaban_clinic c ON c.tenant_id = m.tenant_id
         WHERE m.status = 'active'
           AND m.tenant_id IN (${placeholders})
           ${clinicFilter}
           AND (
             m.contract_status = 'unsigned'
             OR (m.contract_expire_at IS NOT NULL AND m.contract_expire_at <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))
             OR (m.license_expire_at IS NOT NULL AND m.license_expire_at <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))
           )
         ORDER BY m.contract_expire_at ASC, m.license_expire_at ASC`,
        params
      )) as any;

      const result: any[] = [];
      for (const r of rows as any[]) {
        const contractExpireAt = fmtDate(r.contract_expire_at);
        const licenseExpireAt = fmtDate(r.license_expire_at);
        const contractStatus = calcContractStatus(contractExpireAt, r.contract_status);

        // 合同预警
        if (contractStatus === "unsigned") {
          result.push({
            type: "contract",
            staffId: r.id,
            staffName: r.user_name,
            clinicName: r.clinic_name,
            detail: "未签署劳动合同",
            urgency: "high",
          });
        } else if (contractStatus === "expired") {
          result.push({
            type: "contract",
            staffId: r.id,
            staffName: r.user_name,
            clinicName: r.clinic_name,
            detail: `合同已于 ${contractExpireAt} 到期`,
            urgency: "high",
          });
        } else if (contractStatus === "expiring" && contractExpireAt) {
          const daysLeft = Math.floor((new Date(contractExpireAt).getTime() - Date.now()) / 86400000);
          result.push({
            type: "contract",
            staffId: r.id,
            staffName: r.user_name,
            clinicName: r.clinic_name,
            detail: `合同将于 ${contractExpireAt} 到期（还有 ${daysLeft} 天）`,
            urgency: daysLeft <= 7 ? "high" : "medium",
          });
        }

        // 证照预警
        if (licenseExpireAt) {
          const daysLeft = Math.floor((new Date(licenseExpireAt).getTime() - Date.now()) / 86400000);
          if (daysLeft <= 30) {
            result.push({
              type: "license",
              staffId: r.id,
              staffName: r.user_name,
              clinicName: r.clinic_name,
              detail: daysLeft < 0
                ? `执业证书已于 ${licenseExpireAt} 到期`
                : `执业证书将于 ${licenseExpireAt} 到期（还有 ${daysLeft} 天）`,
              urgency: daysLeft <= 0 ? "high" : daysLeft <= 7 ? "high" : "medium",
            });
          }
        }
      }

      return result;
    }),

  /**
   * updateMember - 更新员工人事字段
   * 只有院长或创始人可以操作
   */
  updateMember: protectedProcedure
    .input(
      z.object({
        memberId: z.number(),
        joinDate: z.string().nullable().optional(),
        contractExpireAt: z.string().nullable().optional(),
        contractStatus: z.string().nullable().optional(),
        gender: z.string().nullable().optional(),
        edu: z.string().nullable().optional(),
        licenseExpireAt: z.string().nullable().optional(),
        licenseNo: z.string().nullable().optional(),
        remark: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

      const isSuperAdmin = ctx.user?.role === "super_admin";
      const userId = ctx.user?.id;

      // 查询目标成员所属门店
      const [memberRows] = (await (conn as any).execute(
        `SELECT tenant_id FROM yaban_clinic_member WHERE id = ?`,
        [input.memberId]
      )) as any;
      if (!(memberRows as any[]).length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "成员不存在" });
      }
      const targetTenantId = (memberRows as any[])[0].tenant_id;

      // 权限校验
      if (!isSuperAdmin) {
        const [ownerRows] = (await (conn as any).execute(
          `SELECT id FROM yaban_clinic_member WHERE user_id=? AND tenant_id=? AND role_key='owner' AND status='active'`,
          [userId, targetTenantId]
        )) as any;
        if (!(ownerRows as any[]).length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "无权限修改该成员信息" });
        }
      }

      // 构建更新字段
      const updates: string[] = [];
      const params: any[] = [];

      if (input.joinDate !== undefined) { updates.push("join_date = ?"); params.push(input.joinDate || null); }
      if (input.contractExpireAt !== undefined) { updates.push("contract_expire_at = ?"); params.push(input.contractExpireAt || null); }
      if (input.contractStatus !== undefined) { updates.push("contract_status = ?"); params.push(input.contractStatus || null); }
      if (input.gender !== undefined) { updates.push("gender = ?"); params.push(input.gender || null); }
      if (input.edu !== undefined) { updates.push("edu = ?"); params.push(input.edu || null); }
      if (input.licenseExpireAt !== undefined) { updates.push("license_expire_at = ?"); params.push(input.licenseExpireAt || null); }
      if (input.licenseNo !== undefined) { updates.push("license_no = ?"); params.push(input.licenseNo || null); }
      if (input.remark !== undefined) { updates.push("remark = ?"); params.push(input.remark || null); }

      if (updates.length === 0) return { ok: true };

      params.push(input.memberId);
      await (conn as any).execute(
        `UPDATE yaban_clinic_member SET ${updates.join(", ")} WHERE id = ?`,
        params
      );

      return { ok: true };
    }),
});
