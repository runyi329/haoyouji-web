/**
 * 牙伴齿科管理 - 顾客（原患者）后端路由
 *
 * 设计原则：
 *   - 单店阶段 tenant_id 固定为 1，表已预留多租户字段
 *   - 使用 getDbConnection 原生 SQL（与项目现有写法一致）
 *   - 字段对应前端「新建顾客」5 个 Tab 的内容
 *   - 严禁 Emoji
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

const DEFAULT_TENANT_ID = 1;

// 门店编号前缀（拼音字母缩写）。多门店阶段可按 tenant 映射，单店阶段固定。
const STORE_PREFIX_MAP: Record<number, string> = {
  1: "PT", // 恒愿齿科普陀店
};
function getStorePrefix(tenantId: number): string {
  return STORE_PREFIX_MAP[tenantId] || "PT";
}
const SEQ_WIDTH = 5; // 流水号位数

// 生成下一个顾客编号：门店前缀 + 5位流水（取该门店现有最大流水 +1）
async function nextCustomerCode(conn: any, tenantId: number): Promise<string> {
  const prefix = getStorePrefix(tenantId);
  // 仅匹配 "前缀+纯数字" 的编号，取数字部分最大值
  const [rows] = (await conn.execute(
    `SELECT medical_no FROM yaban_customer
     WHERE tenant_id = ? AND medical_no REGEXP ?
     ORDER BY CAST(SUBSTRING(medical_no, ?) AS UNSIGNED) DESC LIMIT 1`,
    [tenantId, `^${prefix}[0-9]+$`, prefix.length + 1]
  )) as any;
  const last = (rows as any[])[0]?.medical_no as string | undefined;
  const lastSeq = last ? parseInt(last.slice(prefix.length), 10) || 0 : 0;
  const next = lastSeq + 1;
  return prefix + String(next).padStart(SEQ_WIDTH, "0");
}

// 确保顾客表存在
async function ensureCustomerTable(conn: any) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_customer (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 1,
      name VARCHAR(64) NOT NULL,
      gender VARCHAR(8) DEFAULT '未知',
      birthday VARCHAR(20) DEFAULT NULL,
      age INT DEFAULT NULL,
      zodiac VARCHAR(16) DEFAULT NULL,
      patient_type VARCHAR(16) DEFAULT '电子',
      medical_no VARCHAR(40) DEFAULT NULL,
      external_no VARCHAR(64) DEFAULT NULL,
      nickname VARCHAR(64) DEFAULT NULL,
      email VARCHAR(128) DEFAULT NULL,
      mobile VARCHAR(32) DEFAULT NULL,
      phone VARCHAR(32) DEFAULT NULL,
      region VARCHAR(64) DEFAULT NULL,
      address VARCHAR(255) DEFAULT NULL,
      source VARCHAR(64) DEFAULT NULL,
      net_consultant VARCHAR(64) DEFAULT NULL,
      consultant VARCHAR(64) DEFAULT NULL,
      history VARCHAR(128) DEFAULT NULL,
      remark VARCHAR(255) DEFAULT NULL,
      chief_complaint VARCHAR(128) DEFAULT NULL,
      health_status VARCHAR(64) DEFAULT NULL,
      drug_allergy VARCHAR(255) DEFAULT NULL,
      food_allergy VARCHAR(255) DEFAULT NULL,
      heart VARCHAR(16) DEFAULT NULL,
      hypertension VARCHAR(16) DEFAULT NULL,
      diabetes VARCHAR(16) DEFAULT NULL,
      kidney VARCHAR(16) DEFAULT NULL,
      infectious VARCHAR(16) DEFAULT NULL,
      bleeding VARCHAR(16) DEFAULT NULL,
      pregnant VARCHAR(16) DEFAULT NULL,
      medication VARCHAR(255) DEFAULT NULL,
      last_doctor VARCHAR(64) DEFAULT NULL,
      last_visit VARCHAR(40) DEFAULT NULL,
      created_by BIGINT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_tenant (tenant_id),
      KEY idx_name (name),
      KEY idx_mobile (mobile)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// 创建顾客输入校验
const createInput = z.object({
  name: z.string().min(1, "姓名必填").max(64),
  gender: z.string().max(8).optional(),
  birthday: z.string().max(20).optional(),
  age: z.union([z.number(), z.string()]).optional(),
  zodiac: z.string().max(16).optional(),
  patientType: z.string().max(16).optional(),
  medicalNo: z.string().max(40).optional(),
  externalNo: z.string().max(64).optional(),
  nickname: z.string().max(64).optional(),
  email: z.string().max(128).optional(),
  mobile: z.string().min(1, "手机号必填").max(32),
  phone: z.string().max(32).optional(),
  region: z.string().max(64).optional(),
  address: z.string().max(255).optional(),
  source: z.string().max(64).optional(),
  netConsultant: z.string().max(64).optional(),
  consultant: z.string().max(64).optional(),
  history: z.string().max(128).optional(),
  remark: z.string().max(255).optional(),
  chiefComplaint: z.string().max(128).optional(),
  healthStatus: z.string().max(64).optional(),
  drugAllergy: z.string().max(255).optional(),
  foodAllergy: z.string().max(255).optional(),
  heart: z.string().max(16).optional(),
  hypertension: z.string().max(16).optional(),
  diabetes: z.string().max(16).optional(),
  kidney: z.string().max(16).optional(),
  infectious: z.string().max(16).optional(),
  bleeding: z.string().max(16).optional(),
  pregnant: z.string().max(16).optional(),
  medication: z.string().max(255).optional(),
});

function s(v: any): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v);
}

export const yabanCustomerRouter = router({
  // ============ 顾客列表 ============
  list: protectedProcedure
    .input(z.object({ keyword: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      await ensureCustomerTable(conn);
      const keyword = input?.keyword?.trim();
      let sql = `SELECT * FROM yaban_customer WHERE tenant_id = ?`;
      const params: any[] = [DEFAULT_TENANT_ID];
      if (keyword) {
        sql += ` AND (name LIKE ? OR mobile LIKE ? OR medical_no LIKE ? OR nickname LIKE ?)`;
        const like = `%${keyword}%`;
        params.push(like, like, like, like);
      }
      sql += ` ORDER BY id DESC LIMIT 500`;
      const [rows] = (await (conn as any).execute(sql, params)) as any;
      return rows as any[];
    }),

  // ============ 顾客详情 ============
  detail: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return null;
      await ensureCustomerTable(conn);
      const [rows] = (await (conn as any).execute(
        `SELECT * FROM yaban_customer WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.id, DEFAULT_TENANT_ID]
      )) as any;
      return (rows as any[])[0] || null;
    }),

  // ============ 创建顾客 ============
  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureCustomerTable(conn);

      // 兼容旧表：补充 zodiac 列
      try {
        await (conn as any).execute(`ALTER TABLE yaban_customer ADD COLUMN zodiac VARCHAR(16) DEFAULT NULL AFTER age`);
      } catch (e) {
        // 列已存在则忽略
      }
      // 兼容旧表：补充 external_no（导入时保留原始编号）
      try {
        await (conn as any).execute(`ALTER TABLE yaban_customer ADD COLUMN external_no VARCHAR(64) DEFAULT NULL AFTER medical_no`);
      } catch (e) {
        // 列已存在则忽略
      }
      // 兼容旧表：为 (tenant_id, medical_no) 加唯一索引，从数据库层防重
      try {
        await (conn as any).execute(`ALTER TABLE yaban_customer ADD UNIQUE KEY uniq_tenant_medical (tenant_id, medical_no)`);
      } catch (e) {
        // 索引已存在则忽略
      }

      // 顾客编号：传入则用传入值，否则按门店前缀+流水顺延生成
      let medicalNo = s(input.medicalNo);
      const autoGen = !medicalNo;
      if (autoGen) {
        medicalNo = await nextCustomerCode(conn, DEFAULT_TENANT_ID);
      } else {
        // 传入编号需查重，避免与现有顾客重复
        const [dupRows] = (await (conn as any).execute(
          `SELECT id FROM yaban_customer WHERE tenant_id = ? AND medical_no = ? LIMIT 1`,
          [DEFAULT_TENANT_ID, medicalNo]
        )) as any;
        if ((dupRows as any[]).length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: `顾客编号 ${medicalNo} 已存在，请更换` });
        }
      }

      const ageNum =
        input.age === undefined || input.age === null || input.age === ""
          ? null
          : parseInt(String(input.age), 10) || null;

      const doInsert = async (code: string) =>
        (await (conn as any).execute(
          `INSERT INTO yaban_customer
           (tenant_id, name, gender, birthday, age, zodiac, patient_type, medical_no, external_no, nickname,
            email, mobile, phone, region, address,
            source, net_consultant, consultant, history, remark,
            chief_complaint, health_status, drug_allergy, food_allergy,
            heart, hypertension, diabetes, kidney, infectious, bleeding, pregnant, medication,
            created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?,?,?,?,?, ?)`,
          [
            DEFAULT_TENANT_ID,
            input.name.trim(),
            s(input.gender) || "未知",
            s(input.birthday),
            ageNum,
            s(input.zodiac),
            s(input.patientType) || "电子",
            code,
            s(input.externalNo),
            s(input.nickname),
            s(input.email),
            input.mobile.trim(),
            s(input.phone),
            s(input.region),
            s(input.address),
            s(input.source),
            s(input.netConsultant),
            s(input.consultant),
            s(input.history),
            s(input.remark),
            s(input.chiefComplaint),
            s(input.healthStatus),
            s(input.drugAllergy),
            s(input.foodAllergy),
            s(input.heart),
            s(input.hypertension),
            s(input.diabetes),
            s(input.kidney),
            s(input.infectious),
            s(input.bleeding),
            s(input.pregnant),
            s(input.medication),
            ctx.user.id,
          ]
        )) as any;

      // 插入；若唯一冲突且为自动生成编号，重新取号重试（最多5次）
      let result: any;
      let attempt = 0;
      while (true) {
        try {
          [result] = await doInsert(medicalNo!);
          break;
        } catch (e: any) {
          const dup = e?.code === "ER_DUP_ENTRY" || /Duplicate entry/i.test(e?.message || "");
          if (dup && autoGen && attempt < 5) {
            attempt++;
            medicalNo = await nextCustomerCode(conn, DEFAULT_TENANT_ID);
            continue;
          }
          if (dup) {
            throw new TRPCError({ code: "CONFLICT", message: `顾客编号 ${medicalNo} 已存在，请更换` });
          }
          throw e;
        }
      }

      return { success: true, id: result.insertId, medicalNo };
    }),
});
