/**
 * 牙伴齿科管理 - 顾客数据备份服务
 *
 * 功能：
 *   - 导出顾客数据为 JSON / Excel
 *   - 通过 QQ SMTP 发送备份邮件（复用 email-service 的传输器配置思路）
 *   - 定时备份设置表 + 到期检查执行
 *
 * 严禁 Emoji。数据来源：腾讯云 crm_db 的 yaban_customer 表。
 */
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { getDbConnection } from "./db";

const DEFAULT_TENANT_ID = 1;

// SMTP 配置（与脉动账本备份一致，复用同一发件邮箱）
const SMTP_CONFIG = {
  host: "smtp.qq.com",
  port: 465,
  secure: true,
  auth: {
    user: "tina_u@qq.com",
    pass: "wqettalptfmebgdf",
  },
};

let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport(SMTP_CONFIG);
  }
  return _transporter;
}

// 导出字段定义：key 对应数据库列，title 为表头中文名
const EXPORT_COLUMNS: { key: string; title: string; width: number }[] = [
  { key: "medical_no", title: "顾客编号", width: 14 },
  { key: "external_no", title: "原编号", width: 14 },
  { key: "name", title: "姓名", width: 12 },
  { key: "gender", title: "性别", width: 8 },
  { key: "birthday", title: "生日", width: 14 },
  { key: "age", title: "年龄", width: 8 },
  { key: "zodiac", title: "星座", width: 10 },
  { key: "patient_type", title: "顾客类型", width: 10 },
  { key: "nickname", title: "昵称", width: 12 },
  { key: "email", title: "邮箱", width: 20 },
  { key: "mobile", title: "手机号", width: 16 },
  { key: "phone", title: "电话", width: 16 },
  { key: "region", title: "地区", width: 14 },
  { key: "address", title: "地址详情", width: 24 },
  { key: "source", title: "顾客来源", width: 14 },
  { key: "net_consultant", title: "网电咨询师", width: 12 },
  { key: "consultant", title: "咨询师", width: 12 },
  { key: "history", title: "健康标签", width: 14 },
  { key: "remark", title: "顾客备注", width: 24 },
  { key: "chief_complaint", title: "就诊主诉", width: 16 },
  { key: "health_status", title: "健康状况", width: 12 },
  { key: "drug_allergy", title: "药物过敏史", width: 16 },
  { key: "food_allergy", title: "食物过敏史", width: 16 },
  { key: "heart", title: "心脏病", width: 8 },
  { key: "hypertension", title: "高血压", width: 8 },
  { key: "diabetes", title: "糖尿病", width: 8 },
  { key: "kidney", title: "肾脏病", width: 8 },
  { key: "infectious", title: "传染病", width: 8 },
  { key: "bleeding", title: "易出血不止", width: 10 },
  { key: "pregnant", title: "是否怀孕", width: 10 },
  { key: "medication", title: "服药史", width: 16 },
  { key: "last_doctor", title: "上次就诊医生", width: 12 },
  { key: "last_visit", title: "上次就诊时间", width: 18 },
  { key: "created_at", title: "建档时间", width: 20 },
];

/** 读取某门店全部顾客数据 */
export async function fetchAllCustomers(tenantId = DEFAULT_TENANT_ID): Promise<any[]> {
  const conn = await getDbConnection();
  if (!conn) return [];
  const [rows] = (await (conn as any).execute(
    `SELECT * FROM yaban_customer WHERE tenant_id = ? ORDER BY id ASC`,
    [tenantId]
  )) as any;
  return rows as any[];
}

/** 生成 JSON 备份内容（带元信息，便于再次导入还原） */
export function buildBackupJson(customers: any[], tenantId = DEFAULT_TENANT_ID) {
  return {
    type: "yaban-customer-backup",
    version: 1,
    tenantId,
    exportedAt: new Date().toISOString(),
    count: customers.length,
    customers,
  };
}

/** 生成 Excel 备份 Buffer */
export async function buildBackupExcel(customers: any[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("顾客明细");
  ws.columns = EXPORT_COLUMNS.map((c) => ({ header: c.title, key: c.key, width: c.width }));
  for (const row of customers) {
    const r: Record<string, any> = {};
    for (const c of EXPORT_COLUMNS) {
      const v = row[c.key];
      r[c.key] = v === null || v === undefined ? "" : String(v);
    }
    ws.addRow(r);
  }
  // 表头样式：牙伴蓝
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E88D6" } };
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** 发送顾客备份邮件，formats 决定附件包含哪些格式 */
export async function sendCustomerBackupEmail(options: {
  to: string;
  storeName: string;
  customers: any[];
  formats: ("json" | "excel")[];
  tenantId?: number;
}): Promise<void> {
  const { to, storeName, customers, formats } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  const attachments: any[] = [];
  if (formats.includes("excel")) {
    const excelBuffer = await buildBackupExcel(customers);
    attachments.push({ filename: `${storeName}_顾客数据备份_${dateStr}.xlsx`, content: excelBuffer });
  }
  if (formats.includes("json")) {
    const json = buildBackupJson(customers, tenantId);
    attachments.push({
      filename: `${storeName}_顾客数据存档_${dateStr}.json`,
      content: Buffer.from(JSON.stringify(json, null, 2), "utf-8"),
    });
  }

  const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', Arial, sans-serif; color:#333; background:#f0f4f8; margin:0; padding:20px; }
  .container { max-width:600px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(30,136,214,0.12); }
  .header { background:linear-gradient(135deg,#2196C8 0%,#3BA9E0 100%); color:#fff; padding:28px 24px; text-align:center; }
  .header h1 { margin:0; font-size:20px; font-weight:700; }
  .header p { margin:6px 0 0; font-size:13px; opacity:.85; }
  .body { padding:24px; }
  .stats { width:100%; border-collapse:collapse; margin:8px 0 4px; }
  .stats td { padding:11px 0; border-bottom:1px solid #f0f0f0; font-size:14px; }
  .stats td:first-child { color:#888; width:40%; }
  .stats td:last-child { color:#1A2340; font-weight:600; text-align:right; }
  .footer { background:#f8f9fc; padding:16px 24px; text-align:center; color:#aaa; font-size:12px; }
</style></head>
<body>
  <div class="container">
    <div class="header">
      <h1>牙伴顾客数据备份</h1>
      <p>备份时间：${dateStr}</p>
    </div>
    <div class="body">
      <p style="font-size:14px;color:#555;line-height:1.8;">您好，这是「${storeName}」的顾客数据备份，请查收附件。建议妥善保存，可用于数据导入存档还原。</p>
      <table class="stats">
        <tr><td>门店名称</td><td>${storeName}</td></tr>
        <tr><td>顾客总数</td><td>${customers.length} 位</td></tr>
        <tr><td>附件格式</td><td>${formats.map((f) => (f === "excel" ? "Excel 表格" : "JSON 存档")).join(" + ")}</td></tr>
      </table>
    </div>
    <div class="footer">此邮件由牙伴齿科管理系统自动发送，请勿直接回复。</div>
  </div>
</body></html>`;

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"牙伴齿科数据备份" <${SMTP_CONFIG.auth.user}>`,
    to,
    subject: `【牙伴顾客数据备份】${storeName} (${dateStr})，共${customers.length}位顾客`,
    html: htmlContent,
    attachments,
  });
  console.log(`[sendCustomerBackupEmail] 已发送至 ${to}，顾客 ${customers.length} 位`);
}

// ===================== 定时备份设置 =====================

/** 确保备份设置表存在 */
export async function ensureBackupSettingsTable(conn: any) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS yaban_backup_settings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 1,
      enabled TINYINT NOT NULL DEFAULT 0,
      email VARCHAR(128) DEFAULT NULL,
      formats VARCHAR(32) NOT NULL DEFAULT 'excel',
      frequency VARCHAR(16) NOT NULL DEFAULT 'monthly',
      last_backup_at TIMESTAMP NULL DEFAULT NULL,
      next_backup_at TIMESTAMP NULL DEFAULT NULL,
      backup_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toMySQL(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

/** 根据频率计算下次备份时间 */
export function calcNextBackupAt(frequency: string, from = new Date()): Date {
  const next = new Date(from);
  if (frequency === "daily") next.setDate(from.getDate() + 1);
  else if (frequency === "weekly") next.setDate(from.getDate() + 7);
  else if (frequency === "quarterly") next.setMonth(from.getMonth() + 3);
  else next.setMonth(from.getMonth() + 1); // monthly 默认
  // 统一固定在到期当天的凌晨 2:00（与前端提示保持一致）
  next.setHours(2, 0, 0, 0);
  return next;
}

/** 检查并执行所有到期的牙伴顾客定时备份 */
export async function checkAndExecuteYabanBackups(): Promise<void> {
  const conn = await getDbConnection();
  if (!conn) return;
  await ensureBackupSettingsTable(conn);

  const now = new Date();
  const [rows] = (await (conn as any).execute(
    `SELECT * FROM yaban_backup_settings WHERE enabled = 1 AND next_backup_at IS NOT NULL AND next_backup_at <= ?`,
    [toMySQL(now)]
  )) as any;
  const due = rows as any[];
  console.log(`[checkAndExecuteYabanBackups] 到期顾客备份任务 ${due.length} 个`);

  for (const setting of due) {
    try {
      if (!setting.email) {
        console.warn(`[checkAndExecuteYabanBackups] 设置 ${setting.id} 未填邮箱，跳过`);
        continue;
      }
      const customers = await fetchAllCustomers(setting.tenant_id);
      const formats = String(setting.formats || "excel")
        .split(",")
        .map((x: string) => x.trim())
        .filter((x: string) => x === "json" || x === "excel") as ("json" | "excel")[];
      await sendCustomerBackupEmail({
        to: setting.email,
        storeName: "恒愿齿科普陀店",
        customers,
        formats: formats.length ? formats : ["excel"],
        tenantId: setting.tenant_id,
      });

      const next = calcNextBackupAt(setting.frequency, now);
      await (conn as any).execute(
        `UPDATE yaban_backup_settings SET backup_count = backup_count + 1, last_backup_at = ?, next_backup_at = ? WHERE id = ?`,
        [toMySQL(now), toMySQL(next), setting.id]
      );
      console.log(`[checkAndExecuteYabanBackups] 顾客备份完成 ID=${setting.id}`);
    } catch (err) {
      console.error(`[checkAndExecuteYabanBackups] 顾客备份失败 ID=${setting.id}`, err);
    }
  }
}
