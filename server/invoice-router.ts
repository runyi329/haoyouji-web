/**
 * 发票管理路由
 *
 * GET  /api/invoice/search?name=xxx        -> 按公司名查询税号等开票信息（调用第三方API）
 * GET  /api/invoice/headers                -> 获取已保存的发票抬头列表
 * POST /api/invoice/headers                -> 新增发票抬头
 * PUT  /api/invoice/headers/:id            -> 更新发票抬头
 * DELETE /api/invoice/headers/:id          -> 删除发票抬头
 * GET  /api/invoice/config                 -> 获取发票API配置（Key是否已配置）
 * PUT  /api/invoice/config                 -> 更新发票API配置（Key、启用的子项目）
 * GET  /api/invoice/projects               -> 获取子项目开放状态
 */

import { Router, Request, Response } from "express";
import { getDbConnection } from "./db";

const router = Router();

// ─── 初始化数据库表 ──────────────────────────────────────────────────────────
async function ensureInvoiceTables(): Promise<void> {
  const conn = await getDbConnection();
  if (!conn) return;

  // 发票抬头表
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS invoice_headers (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      company_name  VARCHAR(200) NOT NULL COMMENT '公司名称',
      tax_no        VARCHAR(50)  NOT NULL COMMENT '纳税人识别号',
      address       VARCHAR(300) DEFAULT '' COMMENT '注册地址',
      phone         VARCHAR(50)  DEFAULT '' COMMENT '注册电话',
      bank_name     VARCHAR(200) DEFAULT '' COMMENT '开户银行',
      bank_account  VARCHAR(100) DEFAULT '' COMMENT '银行账号',
      remark        VARCHAR(200) DEFAULT '' COMMENT '备注',
      is_default    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否默认',
      source_project VARCHAR(50) DEFAULT 'global' COMMENT '来源子项目',
      created_by    INT          DEFAULT NULL COMMENT '创建人用户ID',
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_name),
      INDEX idx_tax_no (tax_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发票抬头信息表'
  `);

  // 发票API配置表（全局单行配置）
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS invoice_config (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      api_provider  VARCHAR(50)  NOT NULL DEFAULT 'tencent' COMMENT 'API供应商: tencent/tianyuan',
      api_key       VARCHAR(200) DEFAULT '' COMMENT 'API Key',
      api_secret    VARCHAR(200) DEFAULT '' COMMENT 'API Secret（腾讯云用）',
      enabled_projects TEXT      DEFAULT '[]' COMMENT '已开放的子项目JSON数组',
      query_count   INT          NOT NULL DEFAULT 0 COMMENT '累计查询次数',
      updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发票API全局配置'
  `);

  // 插入默认配置行（如不存在）
  await (conn as any).execute(`
    INSERT IGNORE INTO invoice_config (id, api_provider, enabled_projects)
    VALUES (1, 'tencent', '["yaban"]')
  `);
}

// ─── 工具：获取API配置 ────────────────────────────────────────────────────────
async function getInvoiceConfig() {
  const conn = await getDbConnection();
  if (!conn) return null;
  const [rows] = await (conn as any).execute(
    "SELECT * FROM invoice_config WHERE id = 1 LIMIT 1"
  );
  return (rows as any[])[0] || null;
}

// ─── 工具：调用腾讯云企业税号查询 ────────────────────────────────────────────
async function queryTaxNoFromTencent(
  companyName: string,
  secretId: string,
  secretKey: string
): Promise<any> {
  // 腾讯云 API 3.0 签名
  const crypto = await import("crypto");
  const service = "ocr";
  const host = "ocr.tencentcloudapi.com";
  const action = "QueryBarCode"; // 使用企业工商信息查询
  const version = "2018-11-19";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().split("T")[0];

  const payload = JSON.stringify({ BarCode: companyName });

  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const hashedPayload = crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");

  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = crypto
    .createHash("sha256")
    .update(canonicalRequest)
    .digest("hex");
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");

  const hmac = (key: Buffer | string, msg: string) =>
    crypto.createHmac("sha256", key).update(msg).digest();
  const secretDate = hmac("TC3" + secretKey, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmac(secretSigning, stringToSign).toString("hex");

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      Host: host,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Timestamp": String(timestamp),
    },
    body: payload,
  });
  return response.json();
}

// ─── 工具：调用天远数据企业基本信息查询 ──────────────────────────────────────
async function queryTaxNoFromTianyuan(
  companyName: string,
  apiKey: string
): Promise<any> {
  const url = `https://api.tianyuandata.com/enterprise/basic?name=${encodeURIComponent(companyName)}&apikey=${apiKey}`;
  const response = await fetch(url);
  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// 路由：查询公司税号（调用第三方API）
// ═══════════════════════════════════════════════════════════════════════════
router.get("/api/invoice/search", async (req: Request, res: Response) => {
  try {
    await ensureInvoiceTables();
    const { name } = req.query as { name?: string };
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ ok: false, error: "公司名称至少2个字符" });
    }

    // 先从本地已保存的抬头中模糊匹配
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const [localRows] = await (conn as any).execute(
      "SELECT * FROM invoice_headers WHERE company_name LIKE ? ORDER BY is_default DESC, updated_at DESC LIMIT 10",
      [`%${name.trim()}%`]
    );
    const localResults = localRows as any[];

    // 获取API配置
    const config = await getInvoiceConfig();
    const hasApiKey = config && config.api_key && config.api_key.trim().length > 0;

    // 如果本地有精确匹配，直接返回，不消耗API次数
    const exactMatch = localResults.find(
      (r) => r.company_name === name.trim()
    );
    if (exactMatch) {
      return res.json({
        ok: true,
        source: "local",
        results: localResults.map((r) => ({
          company_name: r.company_name,
          tax_no: r.tax_no,
          address: r.address,
          phone: r.phone,
          bank_name: r.bank_name,
          bank_account: r.bank_account,
          saved: true,
          id: r.id,
        })),
      });
    }

    // 如果本地有模糊匹配结果，先返回本地结果
    if (localResults.length > 0) {
      return res.json({
        ok: true,
        source: "local",
        results: localResults.map((r) => ({
          company_name: r.company_name,
          tax_no: r.tax_no,
          address: r.address,
          phone: r.phone,
          bank_name: r.bank_name,
          bank_account: r.bank_account,
          saved: true,
          id: r.id,
        })),
      });
    }

    // 本地无结果，调用第三方API
    if (!hasApiKey) {
      return res.json({
        ok: true,
        source: "none",
        results: [],
        hint: "未配置API Key，无法查询外部数据库。请在发票管理-设置中填写API Key。",
      });
    }

    let apiResult: any = null;
    let mappedResult: any = null;

    try {
      if (config.api_provider === "tianyuan") {
        apiResult = await queryTaxNoFromTianyuan(name.trim(), config.api_key);
        if (apiResult && apiResult.data) {
          const d = apiResult.data;
          mappedResult = {
            company_name: d.name || name.trim(),
            tax_no: d.taxNo || d.creditCode || "",
            address: d.address || "",
            phone: d.phone || "",
            bank_name: d.bankName || "",
            bank_account: d.bankAccount || "",
            saved: false,
          };
        }
      } else {
        // 腾讯云：使用企业工商信息查询（需要 SecretId + SecretKey）
        const [secretId, secretKey] = config.api_key.split("|");
        if (secretId && secretKey) {
          apiResult = await queryTaxNoFromTencent(name.trim(), secretId, secretKey);
        }
      }

      // 更新查询计数
      await (conn as any).execute(
        "UPDATE invoice_config SET query_count = query_count + 1 WHERE id = 1"
      );
    } catch (apiErr) {
      console.error("[Invoice] 第三方API查询失败:", apiErr);
    }

    return res.json({
      ok: true,
      source: "api",
      results: mappedResult ? [mappedResult] : [],
      raw: process.env.NODE_ENV === "development" ? apiResult : undefined,
    });
  } catch (e) {
    console.error("[Invoice] 查询失败:", e);
    res.status(500).json({ ok: false, error: "查询失败" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 路由：获取发票抬头列表
// ═══════════════════════════════════════════════════════════════════════════
router.get("/api/invoice/headers", async (req: Request, res: Response) => {
  try {
    await ensureInvoiceTables();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const { project } = req.query as { project?: string };
    let sql = "SELECT * FROM invoice_headers";
    const params: any[] = [];
    if (project) {
      sql += " WHERE source_project = ? OR source_project = 'global'";
      params.push(project);
    }
    sql += " ORDER BY is_default DESC, updated_at DESC";

    const [rows] = await (conn as any).execute(sql, params);
    res.json({ ok: true, headers: rows });
  } catch (e) {
    console.error("[Invoice] 获取抬头列表失败:", e);
    res.status(500).json({ ok: false, error: "获取失败" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 路由：新增发票抬头
// ═══════════════════════════════════════════════════════════════════════════
router.post("/api/invoice/headers", async (req: Request, res: Response) => {
  try {
    await ensureInvoiceTables();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const {
      company_name, tax_no, address = "", phone = "",
      bank_name = "", bank_account = "", remark = "",
      is_default = 0, source_project = "global",
    } = req.body;

    if (!company_name || !tax_no) {
      return res.status(400).json({ ok: false, error: "公司名称和税号为必填项" });
    }

    // 如果设为默认，先清除其他默认
    if (is_default) {
      await (conn as any).execute(
        "UPDATE invoice_headers SET is_default = 0"
      );
    }

    const [result] = await (conn as any).execute(
      `INSERT INTO invoice_headers
        (company_name, tax_no, address, phone, bank_name, bank_account, remark, is_default, source_project)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_name, tax_no, address, phone, bank_name, bank_account, remark, is_default ? 1 : 0, source_project]
    );

    res.json({ ok: true, id: (result as any).insertId });
  } catch (e) {
    console.error("[Invoice] 新增抬头失败:", e);
    res.status(500).json({ ok: false, error: "新增失败" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 路由：更新发票抬头
// ═══════════════════════════════════════════════════════════════════════════
router.put("/api/invoice/headers/:id", async (req: Request, res: Response) => {
  try {
    await ensureInvoiceTables();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const { id } = req.params;
    const {
      company_name, tax_no, address, phone,
      bank_name, bank_account, remark, is_default,
    } = req.body;

    if (is_default) {
      await (conn as any).execute("UPDATE invoice_headers SET is_default = 0");
    }

    await (conn as any).execute(
      `UPDATE invoice_headers SET
        company_name = ?, tax_no = ?, address = ?, phone = ?,
        bank_name = ?, bank_account = ?, remark = ?, is_default = ?
       WHERE id = ?`,
      [company_name, tax_no, address || "", phone || "",
       bank_name || "", bank_account || "", remark || "",
       is_default ? 1 : 0, id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("[Invoice] 更新抬头失败:", e);
    res.status(500).json({ ok: false, error: "更新失败" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 路由：删除发票抬头
// ═══════════════════════════════════════════════════════════════════════════
router.delete("/api/invoice/headers/:id", async (req: Request, res: Response) => {
  try {
    await ensureInvoiceTables();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const { id } = req.params;
    await (conn as any).execute("DELETE FROM invoice_headers WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[Invoice] 删除抬头失败:", e);
    res.status(500).json({ ok: false, error: "删除失败" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 路由：获取发票API配置
// ═══════════════════════════════════════════════════════════════════════════
router.get("/api/invoice/config", async (req: Request, res: Response) => {
  try {
    await ensureInvoiceTables();
    const config = await getInvoiceConfig();
    if (!config) return res.status(500).json({ ok: false, error: "获取配置失败" });

    // 脱敏返回（不暴露完整Key）
    const maskedKey = config.api_key
      ? config.api_key.substring(0, 4) + "****" + config.api_key.slice(-4)
      : "";

    res.json({
      ok: true,
      config: {
        api_provider: config.api_provider,
        api_key_masked: maskedKey,
        has_api_key: !!(config.api_key && config.api_key.trim()),
        enabled_projects: JSON.parse(config.enabled_projects || "[]"),
        query_count: config.query_count,
      },
    });
  } catch (e) {
    console.error("[Invoice] 获取配置失败:", e);
    res.status(500).json({ ok: false, error: "获取配置失败" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 路由：更新发票API配置
// ═══════════════════════════════════════════════════════════════════════════
router.put("/api/invoice/config", async (req: Request, res: Response) => {
  try {
    await ensureInvoiceTables();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const { api_provider, api_key, api_secret, enabled_projects } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (api_provider) { updates.push("api_provider = ?"); params.push(api_provider); }
    if (api_key !== undefined) { updates.push("api_key = ?"); params.push(api_key); }
    if (api_secret !== undefined) { updates.push("api_secret = ?"); params.push(api_secret); }
    if (enabled_projects !== undefined) {
      updates.push("enabled_projects = ?");
      params.push(JSON.stringify(enabled_projects));
    }

    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: "无更新内容" });
    }

    params.push(1);
    await (conn as any).execute(
      `UPDATE invoice_config SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("[Invoice] 更新配置失败:", e);
    res.status(500).json({ ok: false, error: "更新配置失败" });
  }
});

export default router;
