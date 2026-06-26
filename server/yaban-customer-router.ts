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
import { pinyin } from "pinyin-pro";
import bcrypt from "bcrypt";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import {
  fetchAllCustomers,
  buildBackupJson,
  buildBackupExcel,
  sendCustomerBackupEmail,
  ensureBackupSettingsTable,
  calcNextBackupAt,
} from "./yaban-backup-service";
import { uploadYabanMedia, deleteYabanMedia, type YabanMediaTier } from "./cos-upload";
import { checkYabanPerm, ensureRoleTables, isYabanPureFounder } from "./yaban-role-router";

// ========= 影像记录：分类 → 高清份处理档位映射 =========
// 诊断级（无损原图直传）
const LOSSLESS_CATEGORIES = ["X光片", "小牙片", "根尖片", "全景片", "CBCT", "内窥镜"];
// 专业格式原文件直传（非位图）
const RAWFILE_CATEGORIES = ["CBCT原始", "口扫模型", "DICOM"];
// 文档类
const DOCUMENT_CATEGORIES = ["文档图片", "知情同意书", "文档记录"];
function tierForCategory(category: string, fileName?: string): YabanMediaTier {
  const fn = (fileName || "").toLowerCase();
  // 专业格式按扩展名优先判定
  if (/\.(stl|ply|obj|dcm|dicom|zip|rar)$/.test(fn)) return "rawFile";
  if (RAWFILE_CATEGORIES.includes(category)) return "rawFile";
  if (LOSSLESS_CATEGORIES.includes(category)) return "lossless";
  if (DOCUMENT_CATEGORIES.includes(category)) return "documentCompress";
  // 默认照片类轻压缩（面像照/口内照/对比照等）
  return "lightCompress";
}

const DEFAULT_TENANT_ID = 1;

// ===================== 多门店：解析当前请求的门店 tenant_id =====================
// 来源：前端统一 fetch 注入的请求头 x-yaban-tenant（首页切店时写入 localStorage）
// 安全：必须校验该用户确实是这家门店的在职成员（平台创始人放行），否则回退到用户默认门店
// 回退顺序：合法的 header 门店 -> 用户第一家在职门店 -> DEFAULT_TENANT_ID(1)
export async function resolveTenantId(ctx: any): Promise<number> {
  try {
    const conn = await getDbConnection();
    if (!conn || !ctx?.user?.id) return DEFAULT_TENANT_ID;
    const userId = Number(ctx.user.id);

    // 读取请求头中的目标门店
    const raw = ctx?.req?.headers?.["x-yaban-tenant"];
    const headerVal = Array.isArray(raw) ? raw[0] : raw;
    const wanted = headerVal ? parseInt(String(headerVal), 10) : NaN;

    // 平台创始人/超管：可访问任意门店（与角色路由口径一致）
    let isFounderLike = false;
    try {
      isFounderLike = await isYabanPureFounder(ctx);
    } catch {
      isFounderLike = false;
    }

    // 若 header 指定了有效门店
    if (!isNaN(wanted) && wanted > 0) {
      if (isFounderLike) return wanted;
      // 校验成员资格
      const [m] = (await (conn as any).execute(
        `SELECT 1 FROM yaban_clinic_member WHERE user_id = ? AND tenant_id = ? AND status = 'active' LIMIT 1`,
        [userId, wanted]
      )) as any;
      if ((m as any[]).length > 0) return wanted;
      // 越权或非成员：忽略 header，走回退
    }

    // 回退：取用户第一家在职门店
    const [rows] = (await (conn as any).execute(
      `SELECT tenant_id FROM yaban_clinic_member
       WHERE user_id = ? AND status = 'active'
       ORDER BY FIELD(role_key,'owner','doctor','assistant','receptionist','finance'), tenant_id ASC
       LIMIT 1`,
      [userId]
    )) as any;
    const first = (rows as any[])[0]?.tenant_id;
    if (first != null) return Number(first);
  } catch {
    // 任意异常都安全回退
  }
  return DEFAULT_TENANT_ID;
}

// 取医院名称（用于导出文件命名）；缺省回退到占位名
async function getClinicName(tenantId: number): Promise<string> {
  const conn = await getDbConnection();
  if (!conn) return `医院#${tenantId}`;
  try {
    const [rows] = (await (conn as any).execute(
      `SELECT name, short_name FROM yaban_clinic WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`,
      [tenantId]
    )) as any;
    const r = (rows as any[])[0];
    return (r && (r.name || r.short_name)) || `医院#${tenantId}`;
  } catch {
    return `医院#${tenantId}`;
  }
}

// 根据姓名计算 A-Z 首字母（用于拼音索引分组）。非中英文/无法识别归入 "#"
function getInitial(name?: string | null): string {
  const n = (name || "").trim();
  if (!n) return "#";
  const first = n[0];
  // 英文字母直接归类
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
  // 中文取拼音首字母
  if (/[\u4e00-\u9fa5]/.test(first)) {
    try {
      const py = pinyin(first, { pattern: "first", toneType: "none", type: "string" }) as string;
      const letter = (py || "").trim()[0];
      if (letter && /[a-zA-Z]/.test(letter)) return letter.toUpperCase();
    } catch {
      // ignore
    }
  }
  return "#";
}

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

// 确保顾客来源配置表存在，并初始化预设选项
const DEFAULT_SOURCES = [
  "到店", "转介绍", "网络预约", "电话预约", "微信预约", "老顾客推荐", "其他",
];

const DEFAULT_PATIENT_TYPES = ["电子", "临时", "普通"];

async function ensurePatientTypeTable(conn: any, tenantId: number) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_patient_type (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 1,
      label VARCHAR(64) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 如果该门店还没有任何顾客类型配置，插入预设选项
  const [existing] = (await conn.execute(
    `SELECT COUNT(*) AS cnt FROM yaban_patient_type WHERE tenant_id = ?`,
    [tenantId]
  )) as any;
  if (Number((existing as any[])[0]?.cnt || 0) === 0) {
    for (let i = 0; i < DEFAULT_PATIENT_TYPES.length; i++) {
      await conn.execute(
        `INSERT INTO yaban_patient_type (tenant_id, label, sort_order) VALUES (?, ?, ?)`,
        [tenantId, DEFAULT_PATIENT_TYPES[i], i + 1]
      );
    }
  }
}

const DEFAULT_RELATIONS = ["夫妻", "父母", "子女", "兄弟姐妹", "朋友", "其他"];
async function ensureRelationTable(conn: any, tenantId: number) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_customer_relation (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      name VARCHAR(50) NOT NULL,
      sort INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  const [existing] = (await conn.execute(
    `SELECT COUNT(*) AS cnt FROM yaban_customer_relation WHERE tenant_id = ?`,
    [tenantId]
  )) as any;
  if (Number((existing as any[])[0]?.cnt || 0) === 0) {
    for (let i = 0; i < DEFAULT_RELATIONS.length; i++) {
      await conn.execute(
        `INSERT INTO yaban_customer_relation (tenant_id, name, sort) VALUES (?, ?, ?)`,
        [tenantId, DEFAULT_RELATIONS[i], i + 1]
      );
    }
  }
}

async function ensureCustomerSourceTable(conn: any, tenantId: number) {
  // 主表
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_customer_source (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 1,
      label VARCHAR(64) NOT NULL,
      color VARCHAR(32) DEFAULT NULL,
      sort INT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 兼容旧表：补充 color / sort 列
  for (const ddl of [
    `ALTER TABLE yaban_customer_source ADD COLUMN color VARCHAR(32) DEFAULT NULL`,
    `ALTER TABLE yaban_customer_source ADD COLUMN sort INT NOT NULL DEFAULT 0`,
  ]) {
    try { await conn.execute(ddl); } catch { /* 列已存在则忽略 */ }
  }

  // 子标签表
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_customer_source_tag (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      source_id BIGINT UNSIGNED NOT NULL,
      tenant_id INT NOT NULL DEFAULT 1,
      label VARCHAR(64) NOT NULL,
      color VARCHAR(32) DEFAULT NULL,
      sort INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_source (source_id),
      INDEX idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 如果该门店还没有任何来源配置，插入预设选项
  const [existing] = (await conn.execute(
    `SELECT COUNT(*) AS cnt FROM yaban_customer_source WHERE tenant_id = ?`,
    [tenantId]
  )) as any;
  if (Number((existing as any[])[0]?.cnt || 0) === 0) {
    for (let i = 0; i < DEFAULT_SOURCES.length; i++) {
      await conn.execute(
        `INSERT INTO yaban_customer_source (tenant_id, label, sort_order, sort) VALUES (?, ?, ?, ?)`,
        [tenantId, DEFAULT_SOURCES[i], i + 1, i + 1]
      );
    }
  }
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
      chinese_zodiac VARCHAR(16) DEFAULT NULL,
      patient_type VARCHAR(16) DEFAULT '电子',
      medical_no VARCHAR(40) DEFAULT NULL,
      external_no VARCHAR(64) DEFAULT NULL,
      nickname VARCHAR(64) DEFAULT NULL,
      email VARCHAR(128) DEFAULT NULL,
      mobile VARCHAR(32) DEFAULT NULL,
      phone VARCHAR(32) DEFAULT NULL,
      region VARCHAR(64) DEFAULT NULL,
      address VARCHAR(255) DEFAULT NULL,
      license_plate VARCHAR(16) DEFAULT NULL,
      license_plate2 VARCHAR(16) DEFAULT NULL,
      license_plate3 VARCHAR(16) DEFAULT NULL,
      avatar VARCHAR(255) DEFAULT NULL,
      emergency_contact VARCHAR(64) DEFAULT NULL,
      emergency_relation VARCHAR(32) DEFAULT NULL,
      occupation VARCHAR(64) DEFAULT NULL,
      emergency_phone VARCHAR(32) DEFAULT NULL,
      source VARCHAR(64) DEFAULT NULL,
      net_consultant VARCHAR(64) DEFAULT NULL,
      consultant VARCHAR(64) DEFAULT NULL,
      history TEXT DEFAULT NULL,
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
  // 兼容旧表：补充 avatar 列（默认头像标识，如 male_youth）
  try {
    await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN avatar VARCHAR(255) DEFAULT NULL AFTER address`);
  } catch (e) {
    // 列已存在则忽略
  }
  // 兼容旧表：将 history 列扩展为 TEXT（既往史改为多选+备注，可能超过 128 字符）
  try {
    await conn.execute(`ALTER TABLE yaban_customer MODIFY COLUMN history TEXT DEFAULT NULL`);
  } catch (e) {
    // 已是 TEXT 或无权限时忽略
  }
  // 兼容旧表：补充 license_plate 列
  try {
    await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN license_plate VARCHAR(16) DEFAULT NULL AFTER address`);
  } catch (e) { /* 列已存在则忽略 */ }
  // 兼容旧表：补充 license_plate2/3 列
  try {
    await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN license_plate2 VARCHAR(16) DEFAULT NULL AFTER license_plate`);
  } catch (e) { /* 列已存在则忽略 */ }
  try {
    await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN license_plate3 VARCHAR(16) DEFAULT NULL AFTER license_plate2`);
  } catch (e) { /* 列已存在则忽略 */ }
  // 兼容旧表：补充紧急联系人相关列
  for (const col of [
    `emergency_contact VARCHAR(64) DEFAULT NULL`,
    `emergency_relation VARCHAR(32) DEFAULT NULL`,
    `occupation VARCHAR(64) DEFAULT NULL`,
    `emergency_phone VARCHAR(32) DEFAULT NULL`,
  ]) {
    try {
      await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN ${col}`);
    } catch (e) {
      // 列已存在则忽略
    }
  }
  // 兼容旧表：补充牙伴账号/密码列
  try {
    await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN yaban_username VARCHAR(64) DEFAULT NULL AFTER consultant`);
  } catch (e) { /* 列已存在则忽略 */ }
  try {
    await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN yaban_password VARCHAR(32) DEFAULT NULL AFTER yaban_username`);
  } catch (e) { /* 列已存在则忽略 */ }
  // 兑入推荐人列
  try {
    await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN referrer_username VARCHAR(64) DEFAULT NULL AFTER yaban_password`);
  } catch (e) { /* 列已存在则忽略 */ }
  // 兼入顾客来源副标签列
  try {
    await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN source_tag VARCHAR(64) DEFAULT NULL AFTER source`);
  } catch (e) { /* 列已存在则忽略 */ }
  // 兼入亲友关联列
  try {
    await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN relative_id BIGINT DEFAULT NULL AFTER referrer_username`);
  } catch (e) { /* 列已存在则忽略 */ }
  try {
    await conn.execute(`ALTER TABLE yaban_customer ADD COLUMN relative_relation VARCHAR(50) DEFAULT NULL AFTER relative_id`);
  } catch (e) { /* 列已存在则忽略 */ }
}

// 确保标签表与关联表存在
async function ensureTagTables(conn: any, tenantId: number = DEFAULT_TENANT_ID) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_tag (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 1,
      name VARCHAR(32) NOT NULL,
      color VARCHAR(16) NOT NULL DEFAULT '#1E88D6',
      sort INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_customer_tag (
      customer_id BIGINT UNSIGNED NOT NULL,
      tag_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (customer_id, tag_id),
      KEY idx_tag (tag_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 首次初始化预置几个常用标签（仅当表为空时）
  try {
    const [cntRows] = (await conn.execute(
      `SELECT COUNT(*) AS cnt FROM yaban_tag WHERE tenant_id = ?`,
      [tenantId]
    )) as any;
    if (Number((cntRows as any[])[0]?.cnt || 0) === 0) {
      const presets: Array<[string, string]> = [
        ["VIP", "#E5A100"],
        ["\u79cd\u690d\u610f\u5411", "#1E88D6"],
        ["\u6b63\u7578\u610f\u5411", "#7C4DFF"],
        ["\u6b20\u8d39", "#E53935"],
        ["\u5df2\u6d41\u5931", "#9E9E9E"],
      ];
      let sort = 0;
      for (const [name, color] of presets) {
        await conn.execute(
          `INSERT INTO yaban_tag (tenant_id, name, color, sort) VALUES (?,?,?,?)`,
          [tenantId, name, color, sort++]
        );
      }
    }
  } catch {
    // 预置失败不阻断
  }
}

// 影像记录建表：缩略图 + 高清/无损双轨
let mediaTableReady = false;
async function ensureMediaTable(conn: any) {
  if (mediaTableReady) return;
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_media (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 1,
      customer_id BIGINT UNSIGNED NOT NULL,
      category VARCHAR(32) NOT NULL DEFAULT '其他',
      full_url TEXT NOT NULL,
      thumb_url TEXT,
      mime VARCHAR(64),
      file_size INT UNSIGNED,
      is_lossless TINYINT(1) NOT NULL DEFAULT 0,
      file_name VARCHAR(255),
      remark VARCHAR(500),
      uploader_id BIGINT,
      uploader_role VARCHAR(32),
      taken_at DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_customer (customer_id),
      KEY idx_tenant_customer (tenant_id, customer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  mediaTableReady = true;
}

// ========= 收费记录建表 =========
let chargeTablesReady = false;
export async function ensureChargeTables(conn: any) {
  if (chargeTablesReady) return;
  // 收费单主表
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_charge (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 1,
      customer_id BIGINT UNSIGNED NOT NULL,
      charge_no VARCHAR(40) NOT NULL,
      charge_type VARCHAR(16) NOT NULL DEFAULT 'quick',
      summary VARCHAR(255),
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      receivable DECIMAL(12,2) NOT NULL DEFAULT 0,
      paid DECIMAL(12,2) NOT NULL DEFAULT 0,
      owed DECIMAL(12,2) NOT NULL DEFAULT 0,
      change_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'paid',
      doctor VARCHAR(64),
      cashier_id BIGINT,
      cashier_name VARCHAR(64),
      dept VARCHAR(64),
      remark VARCHAR(500),
      visit_at DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_customer (customer_id),
      KEY idx_tenant_customer (tenant_id, customer_id),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 收费项目明细表
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_charge_item (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      charge_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(128) NOT NULL,
      tooth VARCHAR(32),
      unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
      discount DECIMAL(6,2) NOT NULL DEFAULT 100,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      sort INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_charge (charge_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 支付明细表（支持组合支付）
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_charge_payment (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      charge_id BIGINT UNSIGNED NOT NULL,
      method VARCHAR(32) NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      operator_id BIGINT,
      PRIMARY KEY (id),
      KEY idx_charge (charge_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  chargeTablesReady = true;
}

// 生成收费单号：SF + yyyyMMdd + 4位序号
async function nextChargeNo(conn: any, tenantId: number): Promise<string> {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const prefix = `SF${y}${m}${d}`;
  const [rows] = (await conn.execute(
    `SELECT charge_no FROM yaban_charge WHERE tenant_id = ? AND charge_no LIKE ? ORDER BY id DESC LIMIT 1`,
    [tenantId, prefix + "%"]
  )) as any;
  let seq = 1;
  const last = (rows as any[])[0];
  if (last && last.charge_no) {
    const tail = String(last.charge_no).slice(prefix.length);
    const n = parseInt(tail, 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return prefix + String(seq).padStart(4, "0");
}

// 收费项目库：分类表 + 项目表
let chargeItemLibStructureReady = false;
const chargeItemLibSeeded = new Set<number>();
async function ensureChargeItemLib(conn: any, tenantId: number = DEFAULT_TENANT_ID) {
  if (chargeItemLibStructureReady && chargeItemLibSeeded.has(tenantId)) return;
  // 项目分类表
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_charge_category (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 1,
      name VARCHAR(64) NOT NULL,
      sort INT NOT NULL DEFAULT 0,
      enabled TINYINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 收费项目表
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_charge_product (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 1,
      category_id BIGINT UNSIGNED,
      name VARCHAR(128) NOT NULL,
      unit VARCHAR(16) NOT NULL DEFAULT '次',
      price DECIMAL(12,2) NOT NULL DEFAULT 0,
      is_common TINYINT NOT NULL DEFAULT 0,
      enabled TINYINT NOT NULL DEFAULT 1,
      sort INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_tenant (tenant_id),
      KEY idx_category (category_id),
      KEY idx_common (tenant_id, is_common)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 首次为空时写入默认分类与常用项目，便于诊所直接使用
  const [catCnt] = (await conn.execute(
    `SELECT COUNT(*) AS c FROM yaban_charge_category WHERE tenant_id = ?`,
    [tenantId]
  )) as any;
  if (Number((catCnt as any[])[0]?.c || 0) === 0) {
    const defaults: { cat: string; items: { name: string; price: number; unit: string; common?: boolean }[] }[] = [
      { cat: "检查诊断", items: [
        { name: "口腔检查", price: 0, unit: "次", common: true },
        { name: "全景片", price: 80, unit: "次", common: true },
        { name: "小牙片", price: 30, unit: "次" },
        { name: "CBCT", price: 200, unit: "次" },
      ] },
      { cat: "补牙修复", items: [
        { name: "树脂补牙", price: 200, unit: "颗", common: true },
        { name: "嵌体修复", price: 1500, unit: "颗" },
        { name: "窝沟封闭", price: 80, unit: "颗" },
      ] },
      { cat: "根管治疗", items: [
        { name: "根管治疗(前牙)", price: 800, unit: "颗", common: true },
        { name: "根管治疗(后牙)", price: 1200, unit: "颗", common: true },
      ] },
      { cat: "拔牙", items: [
        { name: "普通拔牙", price: 150, unit: "颗", common: true },
        { name: "复杂拔牙", price: 400, unit: "颗" },
        { name: "阻生齿拔除", price: 800, unit: "颗" },
      ] },
      { cat: "洁治美白", items: [
        { name: "超声波洁牙", price: 200, unit: "次", common: true },
        { name: "喷砂抛光", price: 150, unit: "次" },
        { name: "冷光美白", price: 1500, unit: "次" },
      ] },
      { cat: "种植", items: [
        { name: "种植牙", price: 8000, unit: "颗" },
      ] },
      { cat: "正畸", items: [
        { name: "金属托槽矫正", price: 12000, unit: "疗程" },
        { name: "隐形矫正", price: 25000, unit: "疗程" },
      ] },
      { cat: "镶牙义齿", items: [
        { name: "烤瓷牙", price: 800, unit: "颗" },
        { name: "全瓷牙", price: 2000, unit: "颗" },
      ] },
      { cat: "材料费", items: [
        { name: "材料费", price: 0, unit: "项" },
      ] },
    ];
    let catSort = 0;
    for (const group of defaults) {
      const [r] = (await conn.execute(
        `INSERT INTO yaban_charge_category (tenant_id, name, sort, enabled) VALUES (?, ?, ?, 1)`,
        [tenantId, group.cat, catSort++]
      )) as any;
      const catId = (r as any).insertId;
      let itemSort = 0;
      for (const it of group.items) {
        await conn.execute(
          `INSERT INTO yaban_charge_product (tenant_id, category_id, name, unit, price, is_common, enabled, sort) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [tenantId, catId, it.name, it.unit, it.price, it.common ? 1 : 0, itemSort++]
        );
      }
    }
  }
  chargeItemLibStructureReady = true;
  chargeItemLibSeeded.add(tenantId);
}

// 收费业绩分配表（一单可分配给多个员工）
let chargePerfReady = false;
async function ensureChargePerf(conn: any) {
  if (chargePerfReady) return;
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_charge_performance (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      charge_id BIGINT UNSIGNED NOT NULL,
      tenant_id INT NOT NULL DEFAULT 1,
      staff_id BIGINT,
      staff_name VARCHAR(64) NOT NULL,
      role_key VARCHAR(32),
      share_type VARCHAR(8) NOT NULL DEFAULT 'amount',
      share_value DECIMAL(12,2) NOT NULL DEFAULT 0,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_charge (charge_id),
      KEY idx_staff (tenant_id, staff_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  chargePerfReady = true;
}

// 创建顾客输入校验
const createInput = z.object({
  name: z.string().min(1, "姓名必填").max(64),
  gender: z.string().max(8).optional(),
  birthday: z.string().max(20).optional(),
  age: z.union([z.number(), z.string()]).optional(),
  zodiac: z.string().max(16).optional(),
  chineseZodiac: z.string().max(16).optional(),
  patientType: z.string().max(16).optional(),
  medicalNo: z.string().max(40).optional(),
  externalNo: z.string().max(64).optional(),
  nickname: z.string().max(64).optional(),
  email: z.string().max(128).optional(),
  mobile: z.string().max(32).optional(),
  phone: z.string().max(32).optional(),
  region: z.string().max(64).optional(),
  address: z.string().max(255).optional(),
  licensePlate: z.string().max(16).optional(),
  licensePlate2: z.string().max(16).optional(),
  licensePlate3: z.string().max(16).optional(),
  avatar: z.string().max(255).optional(),
  emergencyContact: z.string().max(64).optional(),
  emergencyRelation: z.string().max(32).optional(),
  occupation: z.string().max(64).optional(),
  emergencyPhone: z.string().max(32).optional(),
  source: z.string().max(64).optional(),
  sourceTag: z.string().max(64).optional(),
  netConsultant: z.string().max(64).optional(),
  consultant: z.string().max(64).optional(),
  referrerUsername: z.string().max(64).optional(),
  relativeId: z.number().int().positive().optional(),
  relativeRelation: z.string().max(50).optional(),
  yabanPassword: z.string().max(32).optional(),
  history: z.string().max(2000).optional(),
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
    .input(
      z
        .object({
          keyword: z.string().optional(),
          // 快捷筛选：all | today | week | new | followup
          quickFilter: z.string().optional(),
          // 排序：recent(最近就诊) | created(创建时间) | name(姓名拼音) | age(年龄)
          sort: z.string().optional(),
          // 高级筛选（组合条件，均为可选）
          gender: z.string().optional(),        // 男 | 女 | 未知
          ageRange: z.string().optional(),      // child(0-12) | teen(13-17) | youth(18-39) | middle(40-59) | senior(60+)
          source: z.string().optional(),        // 来源渠道
          consultant: z.string().optional(),    // 咨询师
                    doctor: z.string().optional(),    // 负责医生（last_doctor）
          hasMobile: z.boolean().optional(),    // true=仅有手机号
          tagId: z.number().int().optional(),   // 按标签筛选
          // 分页
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(100).optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) return { items: [], total: 0, page: 1, pageSize: 30, hasMore: false };
      await ensureCustomerTable(conn);
      const TENANT_ID = await resolveTenantId(ctx);

      const keyword = input?.keyword?.trim();
      const quickFilter = input?.quickFilter || "all";
      const sort = input?.sort || "created";
      const page = input?.page && input.page > 0 ? input.page : 1;
      const pageSize = input?.pageSize && input.pageSize > 0 ? input.pageSize : 30;
      const offset = (page - 1) * pageSize;

      const where: string[] = [`tenant_id = ?`];
      const params: any[] = [TENANT_ID];

      if (keyword) {
        where.push(`(name LIKE ? OR mobile LIKE ? OR medical_no LIKE ? OR nickname LIKE ?)`);
        const like = `%${keyword}%`;
        params.push(like, like, like, like);
      }

      // 快捷筛选
      if (quickFilter === "today") {
        // 今日新增
        where.push(`DATE(created_at) = CURDATE()`);
      } else if (quickFilter === "week") {
        // 本周新增（周一为起点）
        where.push(`YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)`);
      } else if (quickFilter === "new") {
        // 新顾客：近30天创建
        where.push(`created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`);
      } else if (quickFilter === "followup") {
        // 待回访：有上次就诊且距今超过90天
        where.push(`last_visit IS NOT NULL AND last_visit <> '' AND STR_TO_DATE(REPLACE(last_visit,'.','-'), '%Y-%m-%d') < DATE_SUB(CURDATE(), INTERVAL 90 DAY)`);
      }

      // 高级筛选（组合条件）
      if (input?.gender) {
        where.push(`gender = ?`);
        params.push(input.gender);
      }
      if (input?.ageRange) {
        const r = input.ageRange;
        if (r === "child") where.push(`age IS NOT NULL AND age <= 12`);
        else if (r === "teen") where.push(`age >= 13 AND age <= 17`);
        else if (r === "youth") where.push(`age >= 18 AND age <= 39`);
        else if (r === "middle") where.push(`age >= 40 AND age <= 59`);
        else if (r === "senior") where.push(`age >= 60`);
      }
      if (input?.source) {
        where.push(`source = ?`);
        params.push(input.source);
      }
      if (input?.consultant) {
        where.push(`(consultant = ? OR net_consultant = ?)`);
        params.push(input.consultant, input.consultant);
      }
      if (input?.doctor) {
        where.push(`last_doctor = ?`);
        params.push(input.doctor);
      }
      if (input?.hasMobile === true) {
        where.push(`mobile IS NOT NULL AND mobile <> ''`);
      }
      if (input?.tagId) {
        where.push(`id IN (SELECT customer_id FROM yaban_customer_tag WHERE tag_id = ?)`);
        params.push(input.tagId);
      }

      const whereSql = where.join(" AND ");

      // 排序映射（白名单，防注入）
      let orderSql = "id DESC";
      if (sort === "recent") {
        orderSql = "(last_visit IS NULL OR last_visit = '') ASC, last_visit DESC, id DESC";
      } else if (sort === "created") {
        orderSql = "id DESC";
      } else if (sort === "name") {
        orderSql = "CONVERT(name USING gbk) ASC, id DESC";
      } else if (sort === "age") {
        orderSql = "(age IS NULL) ASC, age DESC, id DESC";
      }

      // 总数
      const [cntRows] = (await (conn as any).execute(
        `SELECT COUNT(*) AS cnt FROM yaban_customer WHERE ${whereSql}`,
        params
      )) as any;
      const total = Number((cntRows as any[])[0]?.cnt || 0);

      // 分页数据
      // 注意：mysql2 的 prepared statement 对 LIMIT ?/OFFSET ? 绑定参数会报错，
      // 这里 pageSize/offset 已被 zod 校验并强制为整数，直接安全拼接
      const safeLimit = Math.max(1, Math.floor(pageSize));
      const safeOffset = Math.max(0, Math.floor(offset));
      const [rows] = (await (conn as any).execute(
        `SELECT * FROM yaban_customer WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      )) as any;

      // 为每条记录附加拼音首字母（用于前端索引分组）
      const baseItems = (rows as any[]).map((r) => ({ ...r, initial: getInitial(r.name), tags: [] as any[] }));

      // 批量附加标签（一次查询本页所有顾客的标签）
      try {
        const ids = baseItems.map((r) => Number(r.id)).filter(Boolean);
        if (ids.length > 0) {
          await ensureTagTables(conn, TENANT_ID);
          const placeholders = ids.map(() => "?").join(",");
          const [tagRows] = (await (conn as any).execute(
            `SELECT ct.customer_id AS cid, t.id AS tag_id, t.name AS tag_name, t.color AS tag_color
             FROM yaban_customer_tag ct JOIN yaban_tag t ON ct.tag_id = t.id
             WHERE ct.customer_id IN (${placeholders}) ORDER BY t.sort ASC, t.id ASC`,
            ids
          )) as any;
          const map = new Map<number, any[]>();
          for (const tr of tagRows as any[]) {
            const cid = Number(tr.cid);
            if (!map.has(cid)) map.set(cid, []);
            map.get(cid)!.push({ id: Number(tr.tag_id), name: tr.tag_name, color: tr.tag_color });
          }
          for (const it of baseItems) it.tags = map.get(Number(it.id)) || [];
        }
      } catch {
        // 标签查询失败不影响列表主体
      }
      const items = baseItems;

      return {
        items,
        total,
        page,
        pageSize,
        hasMore: offset + (rows as any[]).length < total,
      };
    }),

  // ============ 高级筛选可选项（动态从全表去重生成） ============
  filterOptions: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    const empty = { sources: [] as string[], consultants: [] as string[], doctors: [] as string[] };
    if (!conn) return empty;
    await ensureCustomerTable(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const distinct = async (sql: string): Promise<string[]> => {
      try {
        const [rows] = (await (conn as any).execute(sql, [TENANT_ID])) as any;
        return (rows as any[])
          .map((r) => (r.v == null ? "" : String(r.v).trim()))
          .filter((v) => v !== "");
      } catch {
        return [];
      }
    };
    const sources = await distinct(
      `SELECT DISTINCT source AS v FROM yaban_customer WHERE tenant_id = ? AND source IS NOT NULL AND source <> '' ORDER BY source`
    );
    // 咨询师合并 consultant 与 net_consultant
    const c1 = await distinct(
      `SELECT DISTINCT consultant AS v FROM yaban_customer WHERE tenant_id = ? AND consultant IS NOT NULL AND consultant <> ''`
    );
    const c2 = await distinct(
      `SELECT DISTINCT net_consultant AS v FROM yaban_customer WHERE tenant_id = ? AND net_consultant IS NOT NULL AND net_consultant <> ''`
    );
    const consultants = Array.from(new Set([...c1, ...c2])).sort();
    const doctors = await distinct(
      `SELECT DISTINCT last_doctor AS v FROM yaban_customer WHERE tenant_id = ? AND last_doctor IS NOT NULL AND last_doctor <> '' ORDER BY last_doctor`
    );
    return { sources, consultants, doctors };
  }),

  // ============ 顾客统计（总数 / 今日新增 / 本月新增） ============
  stats: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return { total: 0, today: 0, month: 0 };
    await ensureCustomerTable(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const [rows] = (await (conn as any).execute(
      `SELECT
         COUNT(*) AS total,
         SUM(DATE(created_at) = CURDATE()) AS today,
         SUM(YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())) AS month
       FROM yaban_customer WHERE tenant_id = ?`,
      [TENANT_ID]
    )) as any;
    const r = (rows as any[])[0] || {};
    return {
      total: Number(r.total || 0),
      today: Number(r.today || 0),
      month: Number(r.month || 0),
    };
  }),

  // ============ 预览下一个顾客编号（仅供新建页展示，实际以保存时生成为准） ============
  previewCode: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return { code: "" };
    await ensureCustomerTable(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const code = await nextCustomerCode(conn, TENANT_ID);
    return { code };
  }),

  // ============ 顾客详情 ============
  detail: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) return null;
      await ensureCustomerTable(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const [rows] = (await (conn as any).execute(
        `SELECT * FROM yaban_customer WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.id, TENANT_ID]
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
      const TENANT_ID = await resolveTenantId(ctx);

      // 兼容旧表：补充 zodiac 列
      try {
        await (conn as any).execute(`ALTER TABLE yaban_customer ADD COLUMN zodiac VARCHAR(16) DEFAULT NULL AFTER age`);
      } catch (e) {
        // 列已存在则忽略
      }
      // 兼容旧表：补充 chinese_zodiac（生肖）列
      try {
        await (conn as any).execute(`ALTER TABLE yaban_customer ADD COLUMN chinese_zodiac VARCHAR(16) DEFAULT NULL AFTER zodiac`);
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
        medicalNo = await nextCustomerCode(conn, TENANT_ID);
      } else {
        // 传入编号需查重，避免与现有顾客重复
        const [dupRows] = (await (conn as any).execute(
          `SELECT id FROM yaban_customer WHERE tenant_id = ? AND medical_no = ? LIMIT 1`,
          [TENANT_ID, medicalNo]
        )) as any;
        if ((dupRows as any[]).length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "顾客编号 " + medicalNo + " 已存在，请更换" });
        }
      }

      const ageNum =
        input.age === undefined || input.age === null || input.age === ""
          ? null
          : parseInt(String(input.age), 10) || null;

      // 生成牙伴账号和密码
      const baseName = (input.name || "").trim();
      const mobile = (input.mobile || "").trim();
      // 优先用前端传来的密码（页面预生成），否则后端生成
      const yabanPassword = s(input.yabanPassword) ||
        (mobile.length >= 6 ? mobile.slice(-6) : String(Math.floor(100000 + Math.random() * 900000)));

      // 查找推荐人的 user_id
      let referrerUserId: number | null = null;
      const referrerUsername = s(input.referrerUsername);
      if (referrerUsername) {
        try {
          const [refRows] = await (conn as any).execute(
            `SELECT id FROM users WHERE username = ? OR name = ? LIMIT 1`,
            [referrerUsername, referrerUsername]
          ) as any;
          if ((refRows as any[]).length > 0) {
            referrerUserId = (refRows as any[])[0].id;
          }
        } catch (e) {
          console.warn("[YabanCustomer] 查找推荐人失败", e);
        }
      }

      // 同名账号自动加序号：张三 → 张三1 → 张三2 …
      let yabanUsername = baseName;
      try {
        const passwordHash = await bcrypt.hash(yabanPassword, 10);
        let inserted = false;
        for (let seq = 0; seq <= 99; seq++) {
          const candidate = seq === 0 ? baseName : `${baseName}${seq}`;
          try {
            // openId 用 yaban_cust_{timestamp}_{seq} 保证唯一
            const openIdVal = `yaban_cust_${Date.now()}_${seq}`;
            const [res] = await (conn as any).execute(
              `INSERT IGNORE INTO users (openId, username, passwordHash, name, loginMethod, role, invited_by_user_id, createdAt, updatedAt, lastSignedIn)
               VALUES (?, ?, ?, ?, 'password', 'parent', ?, NOW(), NOW(), NOW())`,
              [openIdVal, candidate, passwordHash, candidate, referrerUserId]
            ) as any;
            if (res.affectedRows > 0) {
              yabanUsername = candidate;
              inserted = true;
              break;
            }
          } catch (_) { /* 继续尝试下一个序号 */ }
        }
        if (!inserted) yabanUsername = baseName; // 兜底：沿用原名
      } catch (e) {
        console.warn("[YabanCustomer] 同步创建 users 账号失败（可忽略）", e);
      }

      const doInsert = async (code: string) =>
        (await (conn as any).execute(
          `INSERT INTO yaban_customer
            (tenant_id, name, gender, birthday, age, zodiac, chinese_zodiac, patient_type, medical_no, external_no, nickname,
             email, mobile, phone, region, address, license_plate, license_plate2, license_plate3, avatar,
            emergency_contact, emergency_relation, occupation, emergency_phone,
            source, source_tag, net_consultant, consultant, yaban_username, yaban_password, referrer_username, relative_id, relative_relation, history, remark,
            chief_complaint, health_status, drug_allergy, food_allergy,
            heart, hypertension, diabetes, kidney, infectious, bleeding, pregnant, medication,
            created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?,?,?,?,?, ?,?)`,
          [
            TENANT_ID,
            (input.name || "").trim(),
            s(input.gender) || "无",
            s(input.birthday),
            ageNum,
            s(input.zodiac),
            s(input.chineseZodiac),
            s(input.patientType) || "电子",
            code,
            s(input.externalNo),
            s(input.nickname),
            s(input.email),
            (input.mobile || "").trim(),
            s(input.phone),
            s(input.region),
            s(input.address),
            s(input.licensePlate),
            s(input.licensePlate2),
            s(input.licensePlate3),
            s(input.avatar),
            s(input.emergencyContact),
            s(input.emergencyRelation),
            s(input.occupation),
            s(input.emergencyPhone),
            s(input.source),
            s(input.sourceTag),
            s(input.netConsultant),
            s(input.consultant),
            yabanUsername,
            yabanPassword,
            referrerUsername,
            input.relativeId ?? null,
            s(input.relativeRelation),
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
            medicalNo = await nextCustomerCode(conn, TENANT_ID);
            continue;
          }
          if (dup) {
            throw new TRPCError({ code: "CONFLICT", message: "顾客编号 " + medicalNo + " 已存在，请更换" });
          }
          throw e;
        }
      }

      return { success: true, id: result.insertId, medicalNo };
    }),

  // ============ 更新顾客 ============
  update: protectedProcedure
    .input(createInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureCustomerTable(conn);
      const TENANT_ID = await resolveTenantId(ctx);

      // 校验顾客存在
      const [exist] = (await (conn as any).execute(
        `SELECT id FROM yaban_customer WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.id, TENANT_ID]
      )) as any;
      if ((exist as any[]).length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "顾客不存在或无权修改" });
      }

      // 兼容旧表：补齐可能缺失的列，避免 UPDATE 报 Unknown column
      try {
        await (conn as any).execute(`ALTER TABLE yaban_customer ADD COLUMN zodiac VARCHAR(16) DEFAULT NULL AFTER age`);
      } catch (e) { /* 列已存在则忽略 */ }
      try {
        await (conn as any).execute(`ALTER TABLE yaban_customer ADD COLUMN chinese_zodiac VARCHAR(16) DEFAULT NULL AFTER zodiac`);
      } catch (e) { /* 列已存在则忽略 */ }
      try {
        await (conn as any).execute(`ALTER TABLE yaban_customer ADD COLUMN external_no VARCHAR(64) DEFAULT NULL AFTER medical_no`);
      } catch (e) { /* 列已存在则忽略 */ }

      const ageNum =
        input.age === undefined || input.age === null || input.age === ""
          ? null
          : parseInt(String(input.age), 10) || null;

      // 不修改 medical_no（顾客编号）、tenant_id、created_by
      await (conn as any).execute(
        `UPDATE yaban_customer SET
           name = ?, gender = ?, birthday = ?, age = ?, zodiac = ?, chinese_zodiac = ?, patient_type = ?,
           external_no = ?, nickname = ?, email = ?, mobile = ?, phone = ?, region = ?, address = ?, license_plate = ?, license_plate2 = ?, license_plate3 = ?, avatar = ?,
           emergency_contact = ?, emergency_relation = ?, occupation = ?, emergency_phone = ?,
           source = ?, source_tag = ?, net_consultant = ?, consultant = ?, relative_id = ?, relative_relation = ?, history = ?, remark = ?,
           chief_complaint = ?, health_status = ?, drug_allergy = ?, food_allergy = ?,
           heart = ?, hypertension = ?, diabetes = ?, kidney = ?, infectious = ?, bleeding = ?, pregnant = ?, medication = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          (input.name || "").trim(),
          s(input.gender) || "无",
          s(input.birthday),
          ageNum,
          s(input.zodiac),
          s(input.chineseZodiac),
          s(input.patientType) || "电子",
          s(input.externalNo),
          s(input.nickname),
          s(input.email),
          (input.mobile || "").trim(),
          s(input.phone),
          s(input.region),
          s(input.address),
          s(input.licensePlate),
          s(input.licensePlate2),
          s(input.licensePlate3),
          s(input.avatar),
          s(input.emergencyContact),
          s(input.emergencyRelation),
          s(input.occupation),
          s(input.emergencyPhone),
          s(input.source),
          s(input.sourceTag),
          s(input.netConsultant),
          s(input.consultant),
          input.relativeId ?? null,
          s(input.relativeRelation),
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
          input.id,
          TENANT_ID,
        ]
      );

      return { success: true, id: input.id };
    }),

  // ============ 我可导出的医院列表 ============
  // 资格：在该医院 status=active，且对该医院拥有 data_export 权限（owner 默认有；其他角色需院长单独开启）
  listExportableClinics: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return { clinics: [] as { tenantId: number; name: string; roleKey: string }[] };
    await ensureRoleTables(conn);
    // 创始人/超管：特例，无视医院成员关系，可导出全部医院（创始股东不在此列）
    if (await isYabanPureFounder(ctx)) {
      const [allRows] = (await (conn as any).execute(
        `SELECT tenant_id, name, short_name FROM yaban_clinic ORDER BY tenant_id ASC`
      )) as any;
      const clinics = (allRows as any[]).map((r) => ({
        tenantId: Number(r.tenant_id),
        name: r.name || r.short_name || `医院 #${r.tenant_id}`,
        roleKey: "founder",
      }));
      return { clinics };
    }
    // 取我所有在职成员关系
    const [rows] = (await (conn as any).execute(
      `SELECT m.tenant_id, m.role_key, c.name, c.short_name, c.status AS clinic_status
         FROM yaban_clinic_member m
         LEFT JOIN yaban_clinic c ON c.tenant_id = m.tenant_id
        WHERE m.user_id = ? AND m.status = 'active'
        ORDER BY m.tenant_id ASC`,
      [ctx.user.id]
    )) as any;
    const seen = new Set<number>();
    const clinics: { tenantId: number; name: string; roleKey: string }[] = [];
    for (const r of rows as any[]) {
      const tid = Number(r.tenant_id);
      if (seen.has(tid)) continue;
      // 校验该医院的导出权限
      const can = await checkYabanPerm(ctx, "data_export", tid);
      if (!can) continue;
      seen.add(tid);
      clinics.push({
        tenantId: tid,
        name: r.name || r.short_name || `医院 #${tid}`,
        roleKey: r.role_key || "",
      });
    }
    return { clinics };
  }),

  // 校验并返回医院名称（内部复用）
  // ============ 导出顾客数据（JSON / Excel，返回 base64 供前端下载）============
  exportData: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().positive(),
      formats: z.array(z.enum(["json", "excel"])).min(1),
      categories: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const can = await checkYabanPerm(ctx, "data_export", input.tenantId);
      if (!can) throw new TRPCError({ code: "FORBIDDEN", message: "您没有该医院的数据导出权限" });
      const storeName = await getClinicName(input.tenantId);
      const customers = await fetchAllCustomers(input.tenantId);
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const files: { name: string; mime: string; base64: string }[] = [];
      if (input.formats.includes("excel")) {
        const buf = await buildBackupExcel(customers);
        files.push({
          name: `${storeName}_顾客数据备份_${dateStr}.xlsx`,
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          base64: buf.toString("base64"),
        });
      }
      if (input.formats.includes("json")) {
        const json = buildBackupJson(customers, input.tenantId);
        files.push({
          name: `${storeName}_顾客数据存档_${dateStr}.json`,
          mime: "application/json",
          base64: Buffer.from(JSON.stringify(json, null, 2), "utf-8").toString("base64"),
        });
      }
      return { success: true, count: customers.length, files };
    }),

  // ============ 立即发送备份到邮箱 ============
  sendBackupNow: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().positive(),
      email: z.string().email("邮箱格式不正确"),
      formats: z.array(z.enum(["json", "excel"])).min(1),
      categories: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const can = await checkYabanPerm(ctx, "data_export", input.tenantId);
      if (!can) throw new TRPCError({ code: "FORBIDDEN", message: "您没有该医院的数据导出权限" });
      const storeName = await getClinicName(input.tenantId);
      const customers = await fetchAllCustomers(input.tenantId);
      await sendCustomerBackupEmail({
        to: input.email,
        storeName,
        customers,
        formats: input.formats,
        tenantId: input.tenantId,
      });
      return { success: true, count: customers.length };
    }),

  // ============ 读取定时备份设置（按医院） ============
  getBackupSettings: protectedProcedure
    .input(z.object({ tenantId: z.number().int().positive() }))
    .query(async ({ input }) => {
    const conn = await getDbConnection();
    if (!conn) return null;
    await ensureBackupSettingsTable(conn);
    const [rows] = (await (conn as any).execute(
      `SELECT * FROM yaban_backup_settings WHERE tenant_id = ? LIMIT 1`,
      [input.tenantId]
    )) as any;
    const r = (rows as any[])[0];
    if (!r) return { enabled: false, email: "", formats: ["excel"], frequency: "monthly", lastBackupAt: null, nextBackupAt: null, backupCount: 0 };
    return {
      enabled: r.enabled === 1,
      email: r.email || "",
      formats: String(r.formats || "excel").split(",").filter(Boolean),
      frequency: r.frequency || "monthly",
      lastBackupAt: r.last_backup_at,
      nextBackupAt: r.next_backup_at,
      backupCount: r.backup_count || 0,
    };
  }),

  // ============ 保存定时备份设置（按医院） ============
  saveBackupSettings: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().int().positive(),
        enabled: z.boolean(),
        email: z.string().optional(),
        formats: z.array(z.enum(["json", "excel"])).min(1),
        frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]),
        categories: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const can = await checkYabanPerm(ctx, "data_export", input.tenantId);
      if (!can) throw new TRPCError({ code: "FORBIDDEN", message: "您没有该医院的数据导出权限" });
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureBackupSettingsTable(conn);
      if (input.enabled && (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "开启定时备份需填写正确的邮箱" });
      }
      const formatsStr = input.formats.join(",");
      const pad = (n: number) => String(n).padStart(2, "0");
      const toMySQL = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const nextAt = input.enabled ? toMySQL(calcNextBackupAt(input.frequency)) : null;
      await (conn as any).execute(
        `INSERT INTO yaban_backup_settings (tenant_id, enabled, email, formats, frequency, next_backup_at)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), email = VALUES(email), formats = VALUES(formats), frequency = VALUES(frequency), next_backup_at = VALUES(next_backup_at)`,
        [input.tenantId, input.enabled ? 1 : 0, input.email || null, formatsStr, input.frequency, nextAt]
      );
      return { success: true };
    }),

  // ============ 导入顾客数据（从 JSON 存档还原）============
  importData: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().int().positive().optional(),
        customers: z.array(z.record(z.string(), z.any())),
        mode: z.enum(["skip", "insert"]).default("skip"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tid = input.tenantId || DEFAULT_TENANT_ID;
      const can = await checkYabanPerm(ctx, "data_export", tid);
      if (!can) throw new TRPCError({ code: "FORBIDDEN", message: "您没有该医院的数据导入权限" });
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureCustomerTable(conn);

      let inserted = 0;
      let skipped = 0;
      for (const c of input.customers) {
        const name = s(c.name);
        const mobile = s(c.mobile);
        if (!name || !mobile) {
          skipped++;
          continue;
        }
        // 跳过模式：手机号或原编号已存在则跳过
        if (input.mode === "skip") {
          const externalNo = s(c.medical_no) || s(c.external_no);
          const [dup] = (await (conn as any).execute(
            `SELECT id FROM yaban_customer WHERE tenant_id = ? AND (mobile = ? OR (external_no IS NOT NULL AND external_no = ?)) LIMIT 1`,
            [tid, mobile, externalNo]
          )) as any;
          if ((dup as any[]).length > 0) {
            skipped++;
            continue;
          }
        }
        // 统一重新分配我方编号，原编号存入 external_no
        const code = await nextCustomerCode(conn, tid);
        const externalNo = s(c.external_no) || s(c.medical_no);
        const ageNum = c.age === undefined || c.age === null || c.age === "" ? null : parseInt(String(c.age), 10) || null;
        try {
          await (conn as any).execute(
            `INSERT INTO yaban_customer
             (tenant_id, name, gender, birthday, age, zodiac, patient_type, medical_no, external_no, nickname,
              email, mobile, phone, region, address, source, net_consultant, consultant, history, remark,
              chief_complaint, health_status, drug_allergy, food_allergy,
              heart, hypertension, diabetes, kidney, infectious, bleeding, pregnant, medication,
              last_doctor, last_visit, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?)`,
            [
              tid, name, s(c.gender) || "未知", s(c.birthday), ageNum, s(c.zodiac),
              s(c.patient_type) || "电子", code, externalNo, s(c.nickname),
              s(c.email), mobile, s(c.phone), s(c.region), s(c.address), s(c.source),
              s(c.net_consultant), s(c.consultant), s(c.history), s(c.remark),
              s(c.chief_complaint), s(c.health_status), s(c.drug_allergy), s(c.food_allergy),
              s(c.heart), s(c.hypertension), s(c.diabetes), s(c.kidney), s(c.infectious), s(c.bleeding), s(c.pregnant), s(c.medication),
              s(c.last_doctor), s(c.last_visit), ctx.user.id,
            ]
          );
          inserted++;
        } catch (e) {
          skipped++;
        }
      }
      return { success: true, inserted, skipped, total: input.customers.length };
    }),

  // ============ 标签：列表（含每个标签下顾客数量） ============
  listTags: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [] as any[];
    await ensureTagTables(conn);
    const TENANT_ID = await resolveTenantId(ctx);
    const [rows] = (await (conn as any).execute(
      `SELECT t.id, t.name, t.color, t.sort,
              (SELECT COUNT(*) FROM yaban_customer_tag ct WHERE ct.tag_id = t.id) AS count
       FROM yaban_tag t WHERE t.tenant_id = ? ORDER BY t.sort ASC, t.id ASC`,
      [TENANT_ID]
    )) as any;
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      name: r.name,
      color: r.color,
      sort: Number(r.sort || 0),
      count: Number(r.count || 0),
    }));
  }),

  // ============ 标签：新建 ============
  createTag: protectedProcedure
    .input(z.object({ name: z.string().min(1, "\u6807\u7b7e\u540d\u5fc5\u586b").max(32), color: z.string().max(16).optional() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u6570\u636e\u5e93\u8fde\u63a5\u5931\u8d25" });
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureTagTables(conn, TENANT_ID);
      const [maxRows] = (await (conn as any).execute(
        `SELECT COALESCE(MAX(sort), -1) AS m FROM yaban_tag WHERE tenant_id = ?`,
        [TENANT_ID]
      )) as any;
      const nextSort = Number((maxRows as any[])[0]?.m ?? -1) + 1;
      const [res] = (await (conn as any).execute(
        `INSERT INTO yaban_tag (tenant_id, name, color, sort) VALUES (?,?,?,?)`,
        [TENANT_ID, input.name.trim(), input.color || "#1E88D6", nextSort]
      )) as any;
      return { id: Number((res as any).insertId) };
    }),

  // ============ 标签：编辑 ============
  updateTag: protectedProcedure
    .input(z.object({ id: z.number().int(), name: z.string().min(1).max(32), color: z.string().max(16) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u6570\u636e\u5e93\u8fde\u63a5\u5931\u8d25" });
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureTagTables(conn, TENANT_ID);
      await (conn as any).execute(
        `UPDATE yaban_tag SET name = ?, color = ? WHERE id = ? AND tenant_id = ?`,
        [input.name.trim(), input.color, input.id, TENANT_ID]
      );
      return { success: true };
    }),

  // ============ 标签：删除（同时解除关联） ============
  deleteTag: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u6570\u636e\u5e93\u8fde\u63a5\u5931\u8d25" });
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureTagTables(conn, TENANT_ID);
      await (conn as any).execute(`DELETE FROM yaban_customer_tag WHERE tag_id = ?`, [input.id]);
      await (conn as any).execute(`DELETE FROM yaban_tag WHERE id = ? AND tenant_id = ?`, [input.id, TENANT_ID]);
      return { success: true };
    }),

  // ============ 批量：为多位顾客打标签 ============
  bulkAddTag: protectedProcedure
    .input(z.object({ customerIds: z.array(z.number().int()).min(1), tagId: z.number().int() }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u6570\u636e\u5e93\u8fde\u63a5\u5931\u8d25" });
      await ensureTagTables(conn);
      let affected = 0;
      for (const cid of input.customerIds) {
        try {
          await (conn as any).execute(
            `INSERT IGNORE INTO yaban_customer_tag (customer_id, tag_id) VALUES (?,?)`,
            [cid, input.tagId]
          );
          affected++;
        } catch {
          // 忽略单条失败
        }
      }
      return { success: true, affected };
    }),

  // ============ 批量：移除多位顾客的某标签 ============
  bulkRemoveTag: protectedProcedure
    .input(z.object({ customerIds: z.array(z.number().int()).min(1), tagId: z.number().int() }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u6570\u636e\u5e93\u8fde\u63a5\u5931\u8d25" });
      await ensureTagTables(conn);
      const placeholders = input.customerIds.map(() => "?").join(",");
      await (conn as any).execute(
        `DELETE FROM yaban_customer_tag WHERE tag_id = ? AND customer_id IN (${placeholders})`,
        [input.tagId, ...input.customerIds]
      );
      return { success: true };
    }),

  // ===================== 影像记录 =====================
  // 查看某顾客的影像列表（登录即可查看）
  listMedia: protectedProcedure
    .input(z.object({ customerId: z.union([z.number(), z.string()]) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u6570\u636e\u5e93\u8fde\u63a5\u5931\u8d25" });
      await ensureMediaTable(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const cid = Number(input.customerId);
      const [rows] = (await (conn as any).execute(
        `SELECT id, customer_id, category, full_url, thumb_url, mime, file_size, is_lossless,
                file_name, remark, uploader_id, uploader_role,
                DATE_FORMAT(taken_at, '%Y-%m-%d') AS taken_at,
                created_at
           FROM yaban_media
          WHERE tenant_id = ? AND customer_id = ?
          ORDER BY COALESCE(taken_at, DATE(created_at)) DESC, id DESC`,
        [TENANT_ID, cid]
      )) as any;
      const list = (rows as any[]).map((r) => ({
        id: Number(r.id),
        customerId: Number(r.customer_id),
        category: r.category as string,
        fullUrl: r.full_url as string,
        thumbUrl: (r.thumb_url || r.full_url) as string,
        mime: r.mime as string | null,
        fileSize: r.file_size != null ? Number(r.file_size) : null,
        isLossless: Number(r.is_lossless) === 1,
        fileName: r.file_name as string | null,
        remark: r.remark as string | null,
        uploaderId: r.uploader_id != null ? Number(r.uploader_id) : null,
        uploaderRole: r.uploader_role as string | null,
        takenAt: r.taken_at as string | null,
        createdAt: r.created_at,
      }));
      return { list };
    }),

  // 各分类影像数量统计（登录即可查看）
  mediaStats: protectedProcedure
    .input(z.object({ customerId: z.union([z.number(), z.string()]) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u6570\u636e\u5e93\u8fde\u63a5\u5931\u8d25" });
      await ensureMediaTable(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const cid = Number(input.customerId);
      const [rows] = (await (conn as any).execute(
        `SELECT category, COUNT(*) AS cnt FROM yaban_media
          WHERE tenant_id = ? AND customer_id = ?
          GROUP BY category`,
        [TENANT_ID, cid]
      )) as any;
      const byCategory: Record<string, number> = {};
      let total = 0;
      for (const r of rows as any[]) {
        const c = Number(r.cnt);
        byCategory[r.category as string] = c;
        total += c;
      }
      return { total, byCategory };
    }),

  // 上传影像（需 media_upload 权限）
  uploadMedia: protectedProcedure
    .input(z.object({
      customerId: z.union([z.number(), z.string()]),
      category: z.string().min(1).max(32),
      dataUrl: z.string().min(8),
      fileName: z.string().max(255).optional(),
      remark: z.string().max(500).optional(),
      takenAt: z.string().max(20).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "media_upload"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无影像上传权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureMediaTable(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const cid = Number(input.customerId);
      const tier = tierForCategory(input.category, input.fileName);
      let uploaded;
      try {
        uploaded = await uploadYabanMedia(input.dataUrl, tier, input.fileName);
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u5f71\u50cf\u4e0a\u4f20\u5931\u8d25\uff1a" + (err?.message || "unknown") });
      }
      const takenAt = input.takenAt && /^\d{4}-\d{2}-\d{2}$/.test(input.takenAt) ? input.takenAt : null;
      const [res] = (await (conn as any).execute(
        `INSERT INTO yaban_media
           (tenant_id, customer_id, category, full_url, thumb_url, mime, file_size, is_lossless,
            file_name, remark, uploader_id, uploader_role, taken_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          TENANT_ID, cid, input.category,
          uploaded.fullUrl, uploaded.thumbUrl, uploaded.mime, uploaded.fileSize,
          uploaded.isLossless ? 1 : 0,
          s(input.fileName), s(input.remark),
          ctx.user.id ?? null, ctx.user.role ?? null, takenAt,
        ]
      )) as any;
      return { id: Number((res as any).insertId), fullUrl: uploaded.fullUrl, thumbUrl: uploaded.thumbUrl };
    }),

  // 更新影像备注/分类/拍摄日期（需 media_upload 权限）
  updateMedia: protectedProcedure
    .input(z.object({
      id: z.union([z.number(), z.string()]),
      remark: z.string().max(500).optional(),
      category: z.string().max(32).optional(),
      takenAt: z.string().max(20).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "media_upload"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无影像编辑权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u6570\u636e\u5e93\u8fde\u63a5\u5931\u8d25" });
      await ensureMediaTable(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const sets: string[] = [];
      const vals: any[] = [];
      if (input.remark !== undefined) { sets.push("remark = ?"); vals.push(s(input.remark)); }
      if (input.category !== undefined && input.category) { sets.push("category = ?"); vals.push(input.category); }
      if (input.takenAt !== undefined) {
        const t = input.takenAt && /^\d{4}-\d{2}-\d{2}$/.test(input.takenAt) ? input.takenAt : null;
        sets.push("taken_at = ?"); vals.push(t);
      }
      if (sets.length === 0) return { success: true };
      vals.push(TENANT_ID, Number(input.id));
      await (conn as any).execute(
        `UPDATE yaban_media SET ${sets.join(", ")} WHERE tenant_id = ? AND id = ?`,
        vals
      );
      return { success: true };
    }),

  // 删除影像（需 media_delete 权限）：先删 COS 再删数据库
  deleteMedia: protectedProcedure
    .input(z.object({ id: z.union([z.number(), z.string()]) }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "media_delete"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无影像删除权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u6570\u636e\u5e93\u8fde\u63a5\u5931\u8d25" });
      await ensureMediaTable(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const [rows] = (await (conn as any).execute(
        `SELECT full_url, thumb_url FROM yaban_media WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [TENANT_ID, Number(input.id)]
      )) as any;
      const row = (rows as any[])[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "\u5f71\u50cf\u4e0d\u5b58\u5728" });
      try {
        await deleteYabanMedia([row.full_url, row.thumb_url]);
      } catch {
        // COS \u5220\u9664\u5931\u8d25\u4e0d\u963b\u65ad\u6570\u636e\u5e93\u6e05\u7406
      }
      await (conn as any).execute(
        `DELETE FROM yaban_media WHERE tenant_id = ? AND id = ?`,
        [TENANT_ID, Number(input.id)]
      );
      return { success: true };
    }),

  // ==================== 收费记录 ====================

  // 顾客收费统计（消费总额/已收/欠费）——登录即可查看
  chargeStats: protectedProcedure
    .input(z.object({ customerId: z.union([z.number(), z.string()]) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureChargeTables(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const cid = Number(input.customerId);
      const [rows] = (await (conn as any).execute(
        `SELECT
           COALESCE(SUM(CASE WHEN status <> 'void' THEN receivable ELSE 0 END), 0) AS total_receivable,
           COALESCE(SUM(CASE WHEN status <> 'void' THEN paid ELSE 0 END), 0) AS total_paid,
           COALESCE(SUM(CASE WHEN status <> 'void' THEN owed ELSE 0 END), 0) AS total_owed
         FROM yaban_charge
         WHERE tenant_id = ? AND customer_id = ?`,
        [TENANT_ID, cid]
      )) as any;
      const r = (rows as any[])[0] || {};
      return {
        totalReceivable: Number(r.total_receivable || 0),
        totalPaid: Number(r.total_paid || 0),
        totalOwed: Number(r.total_owed || 0),
      };
    }),

  // 收费单列表——登录即可查看
  listCharges: protectedProcedure
    .input(z.object({ customerId: z.union([z.number(), z.string()]) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureChargeTables(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const cid = Number(input.customerId);
      const [rows] = (await (conn as any).execute(
        `SELECT id, charge_no, charge_type, summary, total_amount, discount_amount,
                receivable, paid, owed, change_amount, status, doctor, cashier_name, dept, remark,
                DATE_FORMAT(visit_at, '%Y-%m-%d %H:%i') AS visit_at,
                created_at
           FROM yaban_charge
          WHERE tenant_id = ? AND customer_id = ?
          ORDER BY created_at DESC, id DESC`,
        [TENANT_ID, cid]
      )) as any;
      const list = (rows as any[]).map((r) => ({
        id: Number(r.id),
        chargeNo: r.charge_no as string,
        chargeType: r.charge_type as string,
        summary: r.summary as string | null,
        totalAmount: Number(r.total_amount),
        discountAmount: Number(r.discount_amount),
        receivable: Number(r.receivable),
        paid: Number(r.paid),
        owed: Number(r.owed),
        changeAmount: Number(r.change_amount),
        status: r.status as string,
        doctor: r.doctor as string | null,
        cashierName: r.cashier_name as string | null,
        dept: r.dept as string | null,
        remark: r.remark as string | null,
        visitAt: r.visit_at as string | null,
        createdAt: r.created_at,
      }));
      return { list };
    }),

  // 收费单详情（含项目明细与支付明细）——登录即可查看
  chargeDetail: protectedProcedure
    .input(z.object({ id: z.union([z.number(), z.string()]) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureChargeTables(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const id = Number(input.id);
      const [headRows] = (await (conn as any).execute(
        `SELECT id, customer_id, charge_no, charge_type, summary, total_amount, discount_amount,
                receivable, paid, owed, change_amount, status, doctor, cashier_name, dept, remark,
                DATE_FORMAT(visit_at, '%Y-%m-%d %H:%i') AS visit_at, created_at
           FROM yaban_charge WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [TENANT_ID, id]
      )) as any;
      const h = (headRows as any[])[0];
      if (!h) throw new TRPCError({ code: "NOT_FOUND", message: "收费单不存在" });
      const [itemRows] = (await (conn as any).execute(
        `SELECT id, name, tooth, unit_price, quantity, discount, subtotal FROM yaban_charge_item WHERE charge_id = ? ORDER BY sort ASC, id ASC`,
        [id]
      )) as any;
      const [payRows] = (await (conn as any).execute(
        `SELECT id, method, amount, DATE_FORMAT(paid_at, '%Y-%m-%d %H:%i') AS paid_at FROM yaban_charge_payment WHERE charge_id = ? ORDER BY id ASC`,
        [id]
      )) as any;
      await ensureChargePerf(conn);
      const [perfRows] = (await (conn as any).execute(
        `SELECT id, staff_name, role_key, share_type, share_value, amount FROM yaban_charge_performance WHERE charge_id = ? ORDER BY id ASC`,
        [id]
      )) as any;
      return {
        id: Number(h.id),
        customerId: Number(h.customer_id),
        chargeNo: h.charge_no as string,
        chargeType: h.charge_type as string,
        summary: h.summary as string | null,
        totalAmount: Number(h.total_amount),
        discountAmount: Number(h.discount_amount),
        receivable: Number(h.receivable),
        paid: Number(h.paid),
        owed: Number(h.owed),
        changeAmount: Number(h.change_amount),
        status: h.status as string,
        doctor: h.doctor as string | null,
        cashierName: h.cashier_name as string | null,
        dept: h.dept as string | null,
        remark: h.remark as string | null,
        visitAt: h.visit_at as string | null,
        createdAt: h.created_at,
        items: (itemRows as any[]).map((it) => ({
          id: Number(it.id),
          name: it.name as string,
          tooth: it.tooth as string | null,
          unitPrice: Number(it.unit_price),
          quantity: Number(it.quantity),
          discount: Number(it.discount),
          subtotal: Number(it.subtotal),
        })),
        payments: (payRows as any[]).map((p) => ({
          id: Number(p.id),
          method: p.method as string,
          amount: Number(p.amount),
          paidAt: p.paid_at as string,
        })),
        performances: (perfRows as any[]).map((pf) => ({
          id: Number(pf.id),
          staffName: pf.staff_name as string,
          roleKey: pf.role_key as string | null,
          shareType: pf.share_type as string,
          shareValue: Number(pf.share_value),
          amount: Number(pf.amount),
        })),
      };
    }),

  // 新建收费单（快速收费）——需 finance 权限
  createCharge: protectedProcedure
    .input(z.object({
      customerId: z.union([z.number(), z.string()]),
      chargeType: z.enum(["quick", "item"]).default("quick"),
      items: z.array(z.object({
        name: z.string().min(1).max(128),
        tooth: z.string().max(32).optional(),
        unitPrice: z.number().min(0),
        quantity: z.number().min(0).default(1),
        discount: z.number().min(0).max(100).default(100),
      })).min(1, "至少一个收费项目"),
      discountAmount: z.number().min(0).default(0),
      payments: z.array(z.object({
        method: z.string().min(1).max(32),
        amount: z.number().min(0),
      })).default([]),
      doctor: z.string().max(64).optional(),
      dept: z.string().max(64).optional(),
      remark: z.string().max(500).optional(),
      visitAt: z.string().max(32).optional(),
      performances: z.array(z.object({
        staffId: z.union([z.number(), z.string()]).optional(),
        staffName: z.string().min(1).max(64),
        roleKey: z.string().max(32).optional(),
        shareType: z.enum(["amount", "percent"]).default("amount"),
        shareValue: z.number().min(0).default(0),
      })).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "finance"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无收费权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureChargeTables(conn);
      await ensureChargePerf(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const cid = Number(input.customerId);

      // 计算金额（服务端为准）
      let totalAmount = 0;
      const computedItems = input.items.map((it, idx) => {
        const qty = it.quantity > 0 ? it.quantity : 1;
        const disc = it.discount >= 0 && it.discount <= 100 ? it.discount : 100;
        const subtotal = Math.round(it.unitPrice * qty * (disc / 100) * 100) / 100;
        totalAmount += subtotal;
        return { ...it, quantity: qty, discount: disc, subtotal, sort: idx };
      });
      totalAmount = Math.round(totalAmount * 100) / 100;
      const discountAmount = Math.round((input.discountAmount || 0) * 100) / 100;
      const receivable = Math.max(0, Math.round((totalAmount - discountAmount) * 100) / 100);
      let paid = 0;
      for (const p of input.payments) paid += p.amount;
      paid = Math.round(paid * 100) / 100;
      const owed = Math.max(0, Math.round((receivable - paid) * 100) / 100);
      const changeAmount = Math.max(0, Math.round((paid - receivable) * 100) / 100);
      const status = owed > 0 ? (paid > 0 ? "partial" : "unpaid") : "paid";
      const summary = computedItems.map((i) => i.name).join("、").slice(0, 200);
      const visitAt = input.visitAt && /^\d{4}-\d{2}-\d{2}/.test(input.visitAt) ? input.visitAt.replace("T", " ").slice(0, 19) : null;
      const chargeNo = await nextChargeNo(conn, TENANT_ID);

      const [res] = (await (conn as any).execute(
        `INSERT INTO yaban_charge
           (tenant_id, customer_id, charge_no, charge_type, summary, total_amount, discount_amount,
            receivable, paid, owed, change_amount, status, doctor, cashier_id, cashier_name, dept, remark, visit_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          TENANT_ID, cid, chargeNo, input.chargeType, summary, totalAmount, discountAmount,
          receivable, paid, owed, changeAmount, status,
          s(input.doctor), ctx.user.id ?? null, s(ctx.user.name), s(input.dept), s(input.remark), visitAt,
        ]
      )) as any;
      const chargeId = Number((res as any).insertId);

      for (const it of computedItems) {
        await (conn as any).execute(
          `INSERT INTO yaban_charge_item (charge_id, name, tooth, unit_price, quantity, discount, subtotal, sort)
           VALUES (?,?,?,?,?,?,?,?)`,
          [chargeId, it.name, s(it.tooth), it.unitPrice, it.quantity, it.discount, it.subtotal, it.sort]
        );
      }
      for (const p of input.payments) {
        if (p.amount <= 0) continue;
        await (conn as any).execute(
          `INSERT INTO yaban_charge_payment (charge_id, method, amount, operator_id) VALUES (?,?,?,?)`,
          [chargeId, p.method, Math.round(p.amount * 100) / 100, ctx.user.id ?? null]
        );
      }
      // 业绩分配：按金额或百分比折算到实际业绩金额（以应收为基数）
      for (const perf of input.performances) {
        if (!perf.staffName) continue;
        const amount = perf.shareType === "percent"
          ? Math.round(receivable * (perf.shareValue / 100) * 100) / 100
          : Math.round(perf.shareValue * 100) / 100;
        await (conn as any).execute(
          `INSERT INTO yaban_charge_performance (charge_id, tenant_id, staff_id, staff_name, role_key, share_type, share_value, amount)
           VALUES (?,?,?,?,?,?,?,?)`,
          [chargeId, TENANT_ID, perf.staffId ? Number(perf.staffId) : null, perf.staffName, s(perf.roleKey), perf.shareType, perf.shareValue, amount]
        );
      }
      return { id: chargeId, chargeNo, receivable, paid, owed, changeAmount, status };
    }),

  // 补收欠款——需 finance 权限
  settleCharge: protectedProcedure
    .input(z.object({
      id: z.union([z.number(), z.string()]),
      method: z.string().min(1).max(32),
      amount: z.number().min(0.01),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "finance"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无收费权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureChargeTables(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      const id = Number(input.id);
      const [rows] = (await (conn as any).execute(
        `SELECT receivable, paid, owed, status FROM yaban_charge WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [TENANT_ID, id]
      )) as any;
      const row = (rows as any[])[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "收费单不存在" });
      if (row.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "该单已作废" });
      const addAmt = Math.round(input.amount * 100) / 100;
      const newPaid = Math.round((Number(row.paid) + addAmt) * 100) / 100;
      const receivable = Number(row.receivable);
      const newOwed = Math.max(0, Math.round((receivable - newPaid) * 100) / 100);
      const changeAmount = Math.max(0, Math.round((newPaid - receivable) * 100) / 100);
      const status = newOwed > 0 ? "partial" : "paid";
      await (conn as any).execute(
        `INSERT INTO yaban_charge_payment (charge_id, method, amount, operator_id) VALUES (?,?,?,?)`,
        [id, input.method, addAmt, ctx.user.id ?? null]
      );
      await (conn as any).execute(
        `UPDATE yaban_charge SET paid = ?, owed = ?, change_amount = ?, status = ? WHERE tenant_id = ? AND id = ?`,
        [newPaid, newOwed, changeAmount, status, TENANT_ID, id]
      );
      return { paid: newPaid, owed: newOwed, changeAmount, status };
    }),

  // 作废收费单——需 finance 权限
  voidCharge: protectedProcedure
    .input(z.object({ id: z.union([z.number(), z.string()]) }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "finance"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无收费权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await ensureChargeTables(conn);
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `UPDATE yaban_charge SET status = 'void' WHERE tenant_id = ? AND id = ?`,
        [TENANT_ID, Number(input.id)]
      );
      return { success: true };
    }),

  // ============ 收费项目库：分类 + 项目列表（按分类分组返回） ============
  listChargeProducts: protectedProcedure
    .input(z.object({ includeDisabled: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureChargeItemLib(conn, TENANT_ID);
      const includeDisabled = input?.includeDisabled ?? false;
      const [catRows] = (await (conn as any).execute(
        `SELECT id, name, sort, enabled FROM yaban_charge_category WHERE tenant_id = ? ORDER BY sort ASC, id ASC`,
        [TENANT_ID]
      )) as any;
      const [prodRows] = (await (conn as any).execute(
        `SELECT id, category_id, name, unit, price, is_common, enabled, sort
           FROM yaban_charge_product WHERE tenant_id = ?
           ${includeDisabled ? "" : "AND enabled = 1"}
           ORDER BY sort ASC, id ASC`,
        [TENANT_ID]
      )) as any;
      const prods = (prodRows as any[]).map((p) => ({
        id: Number(p.id),
        categoryId: p.category_id != null ? Number(p.category_id) : null,
        name: p.name as string,
        unit: p.unit as string,
        price: Number(p.price),
        isCommon: !!p.is_common,
        enabled: !!p.enabled,
        sort: Number(p.sort),
      }));
      const categories = (catRows as any[]).map((c) => ({
        id: Number(c.id),
        name: c.name as string,
        sort: Number(c.sort),
        enabled: !!c.enabled,
        items: prods.filter((p) => p.categoryId === Number(c.id)),
      }));
      const commons = prods.filter((p) => p.isCommon && p.enabled);
      return { categories, commons };
    }),

  // 新建/编辑分类——需 finance 权限
  saveChargeCategory: protectedProcedure
    .input(z.object({
      id: z.union([z.number(), z.string()]).optional(),
      name: z.string().min(1).max(64),
      sort: z.number().int().min(0).default(0),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "finance"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无收费权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureChargeItemLib(conn, TENANT_ID);
      if (input.id) {
        await (conn as any).execute(
          `UPDATE yaban_charge_category SET name = ?, sort = ?, enabled = ? WHERE tenant_id = ? AND id = ?`,
          [input.name, input.sort, input.enabled ? 1 : 0, TENANT_ID, Number(input.id)]
        );
        return { id: Number(input.id) };
      }
      const [r] = (await (conn as any).execute(
        `INSERT INTO yaban_charge_category (tenant_id, name, sort, enabled) VALUES (?, ?, ?, ?)`,
        [TENANT_ID, input.name, input.sort, input.enabled ? 1 : 0]
      )) as any;
      return { id: Number((r as any).insertId) };
    }),

  // 删除分类（仅当其下无项目时允许）——需 finance 权限
  deleteChargeCategory: protectedProcedure
    .input(z.object({ id: z.union([z.number(), z.string()]) }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "finance"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无收费权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureChargeItemLib(conn, TENANT_ID);
      const cid = Number(input.id);
      const [cnt] = (await (conn as any).execute(
        `SELECT COUNT(*) AS c FROM yaban_charge_product WHERE tenant_id = ? AND category_id = ? AND enabled = 1`,
        [TENANT_ID, cid]
      )) as any;
      if (Number((cnt as any[])[0]?.c || 0) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该分类下仍有项目，无法删除" });
      }
      await (conn as any).execute(
        `DELETE FROM yaban_charge_category WHERE tenant_id = ? AND id = ?`,
        [TENANT_ID, cid]
      );
      return { success: true };
    }),

  // 新建/编辑项目——需 finance 权限
  saveChargeProduct: protectedProcedure
    .input(z.object({
      id: z.union([z.number(), z.string()]).optional(),
      categoryId: z.union([z.number(), z.string()]).optional(),
      name: z.string().min(1).max(128),
      unit: z.string().min(1).max(16).default("次"),
      price: z.number().min(0).default(0),
      isCommon: z.boolean().default(false),
      enabled: z.boolean().default(true),
      sort: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "finance"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无收费权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureChargeItemLib(conn, TENANT_ID);
      const catId = input.categoryId ? Number(input.categoryId) : null;
      if (input.id) {
        await (conn as any).execute(
          `UPDATE yaban_charge_product SET category_id = ?, name = ?, unit = ?, price = ?, is_common = ?, enabled = ?, sort = ?
             WHERE tenant_id = ? AND id = ?`,
          [catId, input.name, input.unit, input.price, input.isCommon ? 1 : 0, input.enabled ? 1 : 0, input.sort, TENANT_ID, Number(input.id)]
        );
        return { id: Number(input.id) };
      }
      const [r] = (await (conn as any).execute(
        `INSERT INTO yaban_charge_product (tenant_id, category_id, name, unit, price, is_common, enabled, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [TENANT_ID, catId, input.name, input.unit, input.price, input.isCommon ? 1 : 0, input.enabled ? 1 : 0, input.sort]
      )) as any;
      return { id: Number((r as any).insertId) };
    }),

  // 软删除项目（置为禁用）——需 finance 权限
  deleteChargeProduct: protectedProcedure
    .input(z.object({ id: z.union([z.number(), z.string()]) }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "finance"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无收费权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureChargeItemLib(conn, TENANT_ID);
      await (conn as any).execute(
        `UPDATE yaban_charge_product SET enabled = 0, is_common = 0 WHERE tenant_id = ? AND id = ?`,
        [TENANT_ID, Number(input.id)]
      );
      return { success: true };
    }),

  // 切换常用状态——需 finance 权限
  toggleProductCommon: protectedProcedure
    .input(z.object({ id: z.union([z.number(), z.string()]), isCommon: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (!(await checkYabanPerm(ctx, "finance"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无收费权限" });
      }
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureChargeItemLib(conn, TENANT_ID);
      await (conn as any).execute(
        `UPDATE yaban_charge_product SET is_common = ? WHERE tenant_id = ? AND id = ?`,
        [input.isCommon ? 1 : 0, TENANT_ID, Number(input.id)]
      );
      return { success: true };
    }),

  // ============ 推荐人搜索（搜索脉动网已有用户） ============
  searchReferrer: protectedProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const TENANT_ID = await resolveTenantId(ctx);
      const keyword = input.query ? `%${input.query}%` : "%";

      // 1. 搜索本院员工（users 表，避免字符集冲突用 COLLATE 强制转换）
      const [staffRows] = (await (conn as any).execute(
        `SELECT DISTINCT u.id,
                u.username COLLATE utf8mb4_0900_ai_ci AS username,
                u.name    COLLATE utf8mb4_0900_ai_ci AS name,
                u.phone   COLLATE utf8mb4_0900_ai_ci AS phone
           FROM users u
           JOIN yaban_clinic_member m ON m.user_id = u.id AND m.tenant_id = ? AND m.status = 'active'
          WHERE (u.username COLLATE utf8mb4_0900_ai_ci LIKE ?
              OR u.name    COLLATE utf8mb4_0900_ai_ci LIKE ?
              OR u.phone   COLLATE utf8mb4_0900_ai_ci LIKE ?)
          LIMIT 20`,
        [TENANT_ID, keyword, keyword, keyword]
      )) as any;

      // 2. 搜索本院有脉动账号的顾客（直接查 yaban_customer，再 JOIN users 取 username）
      const [custRows] = (await (conn as any).execute(
        `SELECT DISTINCT u.id,
                u.username COLLATE utf8mb4_0900_ai_ci AS username,
                c.name AS name,
                c.mobile AS phone
           FROM yaban_customer c
           JOIN users u ON u.username = c.yaban_username COLLATE utf8mb4_unicode_ci
          WHERE c.tenant_id = ?
            AND c.yaban_username IS NOT NULL AND c.yaban_username != ''
            AND (c.name LIKE ? OR c.mobile LIKE ? OR c.nickname LIKE ?
              OR u.username COLLATE utf8mb4_0900_ai_ci LIKE ?)
          LIMIT 20`,
        [TENANT_ID, keyword, keyword, keyword, keyword]
      )) as any;

      // 合并去重，员工优先
      const seen = new Set<number>();
      const combined: { id: number; username: string; name: string; mobile: string }[] = [];
      for (const row of [...(staffRows as any[]), ...(custRows as any[])]) {
        const id = Number(row.id);
        if (seen.has(id)) continue;
        seen.add(id);
        combined.push({
          id,
          username: (row.username || "") as string,
          name: (row.name || row.username || "") as string,
          mobile: (row.phone || "") as string,
        });
      }
      combined.sort((a, b) => a.name.localeCompare(b.name, "zh"));
      return combined.slice(0, 20);
    }),

  // ============ 搜索顾客（关联亲友用，搜索所有顾客不限账号）============
  searchCustomer: protectedProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const TENANT_ID = await resolveTenantId(ctx);
      const keyword = input?.query?.trim() ? `%${input.query.trim()}%` : null;

      // 查询本院顾客
      let custRows: any[] = [];
      if (keyword) {
        const [r] = (await (conn as any).execute(
          `SELECT id, name, mobile, nickname FROM yaban_customer
           WHERE tenant_id = ? AND (name LIKE ? OR mobile LIKE ? OR nickname LIKE ?)
           LIMIT 30`,
          [TENANT_ID, keyword, keyword, keyword]
        )) as any;
        custRows = r as any[];
      } else {
        const [r] = (await (conn as any).execute(
          `SELECT id, name, mobile, nickname FROM yaban_customer
           WHERE tenant_id = ? AND name IS NOT NULL AND name != ''
           LIMIT 50`,
          [TENANT_ID]
        )) as any;
        custRows = r as any[];
      }

      // 查询本院员工（含院长，通过 yaban_clinic_member 关联 users）
      let staffRows: any[] = [];
      if (keyword) {
        const [r] = (await (conn as any).execute(
          `SELECT DISTINCT u.id, u.name COLLATE utf8mb4_0900_ai_ci AS name,
                  u.phone AS mobile, u.username AS nickname
           FROM users u
           JOIN yaban_clinic_member m ON m.user_id = u.id AND m.tenant_id = ? AND m.status = 'active'
           WHERE (u.name COLLATE utf8mb4_0900_ai_ci LIKE ?
              OR u.username COLLATE utf8mb4_0900_ai_ci LIKE ?
              OR u.phone COLLATE utf8mb4_0900_ai_ci LIKE ?)
           LIMIT 20`,
          [TENANT_ID, keyword, keyword, keyword]
        )) as any;
        staffRows = r as any[];
      } else {
        const [r] = (await (conn as any).execute(
          `SELECT DISTINCT u.id, u.name COLLATE utf8mb4_0900_ai_ci AS name,
                  u.phone AS mobile, u.username AS nickname
           FROM users u
           JOIN yaban_clinic_member m ON m.user_id = u.id AND m.tenant_id = ? AND m.status = 'active'
           WHERE u.name IS NOT NULL AND u.name != ''
           LIMIT 20`,
          [TENANT_ID]
        )) as any;
        staffRows = r as any[];
      }

      // 合并去重（顾客优先），按姓名排序
      const seen = new Set<number>();
      const combined: { id: number; name: string; mobile: string }[] = [];
      for (const row of [...custRows, ...staffRows]) {
        const id = Number(row.id);
        if (seen.has(id)) continue;
        seen.add(id);
        combined.push({
          id,
          name: (row.name || row.nickname || "") as string,
          mobile: (row.mobile || "") as string,
        });
      }
      combined.sort((a, b) => a.name.localeCompare(b.name, "zh"));
      return combined.slice(0, 50);
    }),

  // ============ 查询某顾客作为推荐人的所有代数被推荐人数 ============
  getReferralCount: protectedProcedure
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) return { direct: 0, total: 0 };
      const TENANT_ID = await resolveTenantId(ctx);
      // 获取该顾客的 yaban_username，再查 users 表得到 user_id
      const [custRows] = (await (conn as any).execute(
        `SELECT yaban_username FROM yaban_customer WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.customerId, TENANT_ID]
      )) as any;
      if (!(custRows as any[]).length || !(custRows as any[])[0].yaban_username) {
        return { direct: 0, total: 0 };
      }
      const yabanUsername = (custRows as any[])[0].yaban_username;
      const [userRows] = (await (conn as any).execute(
        `SELECT id FROM users WHERE username = ? LIMIT 1`,
        [yabanUsername]
      )) as any;
      if (!(userRows as any[]).length) return { direct: 0, total: 0 };
      const userId = Number((userRows as any[])[0].id);
      // 第1代：直接被推荐人数
      const [directRows] = (await (conn as any).execute(
        `SELECT COUNT(*) AS cnt FROM users WHERE invited_by_user_id = ?`,
        [userId]
      )) as any;
      const direct = Number((directRows as any[])[0]?.cnt || 0);
      // 所有代数：递归查询（最多 10 层，防止死循环）
      let total = 0;
      let currentLevel = [userId];
      const visited = new Set<number>([userId]);
      for (let depth = 0; depth < 10 && currentLevel.length > 0; depth++) {
        const placeholders = currentLevel.map(() => '?').join(',');
        const [nextRows] = (await (conn as any).execute(
          `SELECT id FROM users WHERE invited_by_user_id IN (${placeholders})`,
          currentLevel
        )) as any;
        const nextIds = (nextRows as any[]).map((r: any) => Number(r.id)).filter((id: number) => !visited.has(id));
        nextIds.forEach((id: number) => visited.add(id));
        total += nextIds.length;
        currentLevel = nextIds;
      }
      return { direct, total };
    }),

  // ============ 查询某顾客推荐的所有人列表（按层级） ============
  getReferralList: protectedProcedure
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const TENANT_ID = await resolveTenantId(ctx);
      // 获取该顾客的 yaban_username -> user_id
      const [custRows] = (await (conn as any).execute(
        `SELECT yaban_username FROM yaban_customer WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.customerId, TENANT_ID]
      )) as any;
      if (!(custRows as any[]).length || !(custRows as any[])[0].yaban_username) return [];
      const yabanUsername = (custRows as any[])[0].yaban_username;
      const [userRows] = (await (conn as any).execute(
        `SELECT id FROM users WHERE username = ? LIMIT 1`,
        [yabanUsername]
      )) as any;
      if (!(userRows as any[]).length) return [];
      const rootUserId = Number((userRows as any[])[0].id);
      // 递归按层查询（最多 10 层）
      const result: { level: number; userId: number; username: string; name: string; mobile: string }[] = [];
      let currentLevel = [rootUserId];
      const visited = new Set<number>([rootUserId]);
      for (let depth = 1; depth <= 10 && currentLevel.length > 0; depth++) {
        const placeholders = currentLevel.map(() => '?').join(',');
        // 查这一层的用户，并尝试关联到 yaban_customer 获取手机号
        const [nextRows] = (await (conn as any).execute(
          `SELECT u.id, u.username, u.name, c.mobile, c.name AS cname
             FROM users u
             LEFT JOIN yaban_customer c ON c.yaban_username = u.username AND c.tenant_id = ?
            WHERE u.invited_by_user_id IN (${placeholders})`,
          [TENANT_ID, ...currentLevel]
        )) as any;
        const nextIds: number[] = [];
        for (const r of nextRows as any[]) {
          const uid = Number(r.id);
          if (visited.has(uid)) continue;
          visited.add(uid);
          nextIds.push(uid);
          result.push({
            level: depth,
            userId: uid,
            username: r.username || "",
            name: r.cname || r.name || "",
            mobile: r.mobile || "",
          });
        }
        currentLevel = nextIds;
      }
      return result;
    }),

  // ============ 删除顾客档案 ============
  deleteCustomer: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("DB连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      // 确认该顾客属于当前租户
      const [rows] = (await (conn as any).execute(
        `SELECT id FROM yaban_customer WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.id, TENANT_ID]
      )) as any;
      if (!(rows as any[]).length) throw new Error("顾客不存在或无权限删除");
      await (conn as any).execute(
        `DELETE FROM yaban_customer WHERE id = ? AND tenant_id = ?`,
        [input.id, TENANT_ID]
      );
      return { success: true };
    }),

  // ============ 顾客类型配置（院长可自定义） ============

  /** 获取当前门店的顾客类型列表 */
  listPatientTypes: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const TENANT_ID = await resolveTenantId(ctx);
    await ensurePatientTypeTable(conn, TENANT_ID);
    const [rows] = (await (conn as any).execute(
      `SELECT id, label, sort_order FROM yaban_patient_type WHERE tenant_id = ? ORDER BY sort_order ASC, id ASC`,
      [TENANT_ID]
    )) as any;
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      label: String(r.label),
      sortOrder: Number(r.sort_order),
    }));
  }),

  /** 新增顾客类型 */
  addPatientType: protectedProcedure
    .input(z.object({ label: z.string().min(1).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      await ensurePatientTypeTable(conn, TENANT_ID);
      const [maxRows] = (await (conn as any).execute(
        `SELECT COALESCE(MAX(sort_order), 0) AS mx FROM yaban_patient_type WHERE tenant_id = ?`,
        [TENANT_ID]
      )) as any;
      const nextSort = Number((maxRows as any[])[0]?.mx || 0) + 1;
      await (conn as any).execute(
        `INSERT INTO yaban_patient_type (tenant_id, label, sort_order) VALUES (?, ?, ?)`,
        [TENANT_ID, input.label.trim(), nextSort]
      );
      return { success: true };
    }),

  /** 修改顾客类型名称 */
  updatePatientType: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), label: z.string().min(1).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      await (conn as any).execute(
        `UPDATE yaban_patient_type SET label = ? WHERE id = ? AND tenant_id = ?`,
        [input.label.trim(), input.id, TENANT_ID]
      );
      return { success: true };
    }),

  /** 删除顾客类型 */
  deletePatientType: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      await (conn as any).execute(
        `DELETE FROM yaban_patient_type WHERE id = ? AND tenant_id = ?`,
        [input.id, TENANT_ID]
      );
      return { success: true };
    }),

  /** 顾客类型排序 */
  reorderPatientTypes: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      for (let i = 0; i < input.ids.length; i++) {
        await (conn as any).execute(
          `UPDATE yaban_patient_type SET sort_order = ? WHERE id = ? AND tenant_id = ?`,
          [i + 1, input.ids[i], TENANT_ID]
        );
      }
      return { success: true };
    }),

  // ============ 顾客来源配置（院长可自定义） ============

  /** 获取当前门店的顾客来源列表（每个来源包含其副标签数组） */
  listCustomerSources: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const TENANT_ID = await resolveTenantId(ctx);
    await ensureCustomerSourceTable(conn, TENANT_ID);
    // 主来源列表
    const [rows] = (await (conn as any).execute(
      `SELECT id, label, color, sort_order FROM yaban_customer_source WHERE tenant_id = ? ORDER BY sort_order ASC, id ASC`,
      [TENANT_ID]
    )) as any;
    // 子标签列表
    const [tagRows] = (await (conn as any).execute(
      `SELECT id, source_id, label, color, sort FROM yaban_customer_source_tag WHERE tenant_id = ? ORDER BY sort ASC, id ASC`,
      [TENANT_ID]
    )) as any;
    const tagMap: Record<number, { id: number; label: string; color: string | null; sort: number }[]> = {};
    for (const t of tagRows as any[]) {
      const sid = Number(t.source_id);
      if (!tagMap[sid]) tagMap[sid] = [];
      tagMap[sid].push({ id: Number(t.id), label: String(t.label), color: t.color || null, sort: Number(t.sort) });
    }
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      label: String(r.label),
      color: r.color || null,
      sortOrder: Number(r.sort_order),
      tags: tagMap[Number(r.id)] ?? [],
    }));
  }),

  /** 新增一条来源主标题（院长权限） */
  addCustomerSource: protectedProcedure
    .input(z.object({ label: z.string().min(1).max(32), tenantId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = input.tenantId ?? await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      await ensureCustomerSourceTable(conn, TENANT_ID);
      const [maxRows] = (await (conn as any).execute(
        `SELECT COALESCE(MAX(sort_order),0)+1 AS next_order FROM yaban_customer_source WHERE tenant_id = ?`,
        [TENANT_ID]
      )) as any;
      const nextOrder = Number((maxRows as any[])[0]?.next_order || 1);
      await (conn as any).execute(
        `INSERT INTO yaban_customer_source (tenant_id, label, sort_order, sort) VALUES (?, ?, ?, ?)`,
        [TENANT_ID, input.label.trim(), nextOrder, nextOrder]
      );
      return { success: true };
    }),

  /** 修改来源主标题（院长权限） */
  updateCustomerSource: protectedProcedure
    .input(z.object({ id: z.number(), label: z.string().min(1).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      await (conn as any).execute(
        `UPDATE yaban_customer_source SET label = ? WHERE id = ? AND tenant_id = ?`,
        [input.label.trim(), input.id, TENANT_ID]
      );
      return { success: true };
    }),

  /** 删除来源主标题（院长权限，级联删副标签） */
  deleteCustomerSource: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      // 级联删除子标签
      await (conn as any).execute(
        `DELETE FROM yaban_customer_source_tag WHERE source_id = ? AND tenant_id = ?`,
        [input.id, TENANT_ID]
      );
      await (conn as any).execute(
        `DELETE FROM yaban_customer_source WHERE id = ? AND tenant_id = ?`,
        [input.id, TENANT_ID]
      );
      return { success: true };
    }),

  /** 调整来源主标题排序 */
  reorderCustomerSources: protectedProcedure
    .input(z.array(z.object({ id: z.number(), sortOrder: z.number() })))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      for (const item of input) {
        await (conn as any).execute(
          `UPDATE yaban_customer_source SET sort_order = ? WHERE id = ? AND tenant_id = ?`,
          [item.sortOrder, item.id, TENANT_ID]
        );
      }
      return { success: true };
    }),

  /** 给某来源主标题添加副标签 */
  addSourceTag: protectedProcedure
    .input(z.object({
      sourceId: z.number(),
      label: z.string().min(1).max(32),
      color: z.string().max(32).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      await ensureCustomerSourceTable(conn, TENANT_ID);
      const [maxRows] = (await (conn as any).execute(
        `SELECT COALESCE(MAX(sort),0)+1 AS next_sort FROM yaban_customer_source_tag WHERE source_id = ? AND tenant_id = ?`,
        [input.sourceId, TENANT_ID]
      )) as any;
      const nextSort = Number((maxRows as any[])[0]?.next_sort || 1);
      await (conn as any).execute(
        `INSERT INTO yaban_customer_source_tag (source_id, tenant_id, label, color, sort) VALUES (?, ?, ?, ?, ?)`,
        [input.sourceId, TENANT_ID, input.label.trim(), input.color || null, nextSort]
      );
      return { success: true };
    }),

  /** 修改副标签 */
  updateSourceTag: protectedProcedure
    .input(z.object({
      id: z.number(),
      label: z.string().min(1).max(32).optional(),
      color: z.string().max(32).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      const sets: string[] = [];
      const vals: any[] = [];
      if (input.label !== undefined) { sets.push("label = ?"); vals.push(input.label.trim()); }
      if (input.color !== undefined) { sets.push("color = ?"); vals.push(input.color || null); }
      if (sets.length === 0) return { success: true };
      vals.push(input.id, TENANT_ID);
      await (conn as any).execute(
        `UPDATE yaban_customer_source_tag SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
        vals
      );
      return { success: true };
    }),

  /** 删除副标签 */
  deleteSourceTag: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await checkYabanPerm(ctx, "manage_customer_source", TENANT_ID);
      await (conn as any).execute(
        `DELETE FROM yaban_customer_source_tag WHERE id = ? AND tenant_id = ?`,
        [input.id, TENANT_ID]
      );
      return { success: true };
    }),

  // ============ 诊所员工列表（供业绩分配选人） ============
  listClinicMembers: protectedProcedure.query(async ({ ctx }) => {
      const TENANT_ID = await resolveTenantId(ctx);
    const conn = await getDbConnection();
    if (!conn) return [];
    await ensureRoleTables(conn);
    const [rows] = (await (conn as any).execute(
      `SELECT m.user_id, m.role_key, u.name, u.username, r.name AS role_name
         FROM yaban_clinic_member m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN yaban_clinic_role r ON r.role_key = m.role_key
        WHERE m.tenant_id = ? AND m.status = 'active'
        ORDER BY FIELD(m.role_key,'owner','doctor','assistant','receptionist','finance'), m.created_at ASC`,
      [TENANT_ID]
    )) as any;
    return (rows as any[]).map((m) => ({
      userId: Number(m.user_id),
      name: (m.name || m.username || "员工") as string,
      roleKey: m.role_key as string,
      roleName: (m.role_name || "") as string,
    }));
  }),

  // ============ 亲友关系类型配置（院长可自定义） ============

  /** 获取当前门店的亲友关系类型列表 */
  listRelations: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const TENANT_ID = await resolveTenantId(ctx);
    await ensureRelationTable(conn, TENANT_ID);
    const [rows] = (await (conn as any).execute(
      `SELECT id, name, sort FROM yaban_customer_relation WHERE tenant_id = ? ORDER BY sort ASC, id ASC`,
      [TENANT_ID]
    )) as any;
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      sort: Number(r.sort),
    }));
  }),

  /** 新增亲友关系类型 */
  addRelation: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureRelationTable(conn, TENANT_ID);
      const [maxRows] = (await (conn as any).execute(
        `SELECT COALESCE(MAX(sort), 0) AS mx FROM yaban_customer_relation WHERE tenant_id = ?`,
        [TENANT_ID]
      )) as any;
      const nextSort = Number((maxRows as any[])[0]?.mx || 0) + 1;
      await (conn as any).execute(
        `INSERT INTO yaban_customer_relation (tenant_id, name, sort) VALUES (?, ?, ?)`,
        [TENANT_ID, input.name.trim(), nextSort]
      );
      return { success: true };
    }),

  /** 修改亲友关系类型名称 */
  updateRelation: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `UPDATE yaban_customer_relation SET name = ? WHERE id = ? AND tenant_id = ?`,
        [input.name.trim(), input.id, TENANT_ID]
      );
      return { success: true };
    }),

  /** 删除亲友关系类型 */
  deleteRelation: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `DELETE FROM yaban_customer_relation WHERE id = ? AND tenant_id = ?`,
        [input.id, TENANT_ID]
      );
      return { success: true };
    }),
});
