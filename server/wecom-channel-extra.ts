/**
 * 企业微信渠道详情页 - 扩展接口
 * 统一两个渠道（自建应用 app / 客服账号 kf）的五Tab功能
 *
 * 包含：
 *  - 渠道AI配置（key-value 形式，按 channel_type 隔离）
 *  - 用户列表 + 黑名单（拉黑/解除）
 *  - 知识库：文件上传(Excel/PDF/Word/TXT) + RAG切片 + 看板统计 + 导入导出
 *  - 对话日志：多维筛选 + 导出 + 内置AI分析（质检/优化/知识库推荐）
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import fs from "fs";
import { getDbConnection } from "./db";

const router = Router();

// 企微专用 DeepSeek Key（与 wecom-manus-router 保持一致，独立隔离）
const WECOM_DEEPSEEK_API_KEY = process.env.WECOM_DEEPSEEK_API_KEY || "";
const WECOM_DEEPSEEK_API_BASE = "https://api.deepseek.com/v1";

/**
 * 调用 DeepSeek 进行 AI 分析（复用企微同款 Key 与直连方式）
 * @param systemPrompt 系统提示词
 * @param userPrompt 用户内容
 * @returns AI 回复文本
 */
async function callWecomDeepSeek(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!WECOM_DEEPSEEK_API_KEY) {
    throw new Error("AI 服务未配置（WECOM_DEEPSEEK_API_KEY），请联系管理员");
  }
  const res = await fetch(`${WECOM_DEEPSEEK_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${WECOM_DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4096,
      stream: false,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek 服务暂时不可用（${res.status}）: ${errText.substring(0, 200)}`);
  }
  const data = (await res.json()) as any;
  return data?.choices?.[0]?.message?.content || "";
}
const upload = multer({ dest: "/tmp/wecom-uploads/", limits: { fileSize: 20 * 1024 * 1024 } });

// =====================================================================
// 一、渠道AI配置（key-value，按 channel_type 隔离）
// =====================================================================
// 配置表：wecom_channel_kv (channel_type, config_key, config_val)
async function ensureChannelKvTable(conn: any) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS wecom_channel_kv (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      channel_type VARCHAR(20) NOT NULL,
      config_key VARCHAR(64) NOT NULL,
      config_val TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_ch_key (channel_type, config_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// 获取渠道配置
router.get("/api/wecom/ch/config", async (req: Request, res: Response) => {
  const channelType = (req.query.channel_type as string) || "app";
  const conn = await getDbConnection();
  try {
    await ensureChannelKvTable(conn);
    const [rows] = await (conn as any).execute(
      "SELECT config_key, config_val FROM wecom_channel_kv WHERE channel_type = ?",
      [channelType]
    );
    const cfg: Record<string, string> = {};
    for (const r of rows as any[]) cfg[r.config_key] = r.config_val;
    res.json({ ok: true, config: cfg });
  } catch (e: any) {
    console.error("[渠道配置] 获取失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 保存渠道配置
router.post("/api/wecom/ch/config", async (req: Request, res: Response) => {
  const channelType = (req.body.channel_type as string) || "app";
  const config = req.body.config || {};
  const conn = await getDbConnection();
  try {
    await ensureChannelKvTable(conn);
    for (const [key, val] of Object.entries(config)) {
      await (conn as any).execute(
        `INSERT INTO wecom_channel_kv (channel_type, config_key, config_val) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE config_val=VALUES(config_val)`,
        [channelType, key, String(val ?? "")]
      );
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[渠道配置] 保存失败:", e);
    res.status(500).json({ error: "保存失败" });
  }
});

// =====================================================================
// 二、用户列表 + 黑名单
// =====================================================================
// 用户列表（按渠道，含积分消耗汇总 + 是否拉黑）
router.get("/api/wecom/ch/users", async (req: Request, res: Response) => {
  const channelType = (req.query.channel_type as string) || "app";
  const conn = await getDbConnection();
  try {
    // 从消息消耗表聚合每个用户的使用情况
    const [rows] = await (conn as any).execute(
      `SELECT mc.wecom_user_id,
              MAX(ws.nickname) AS nickname,
              COUNT(*) AS msg_count,
              SUM(mc.credits_used) AS total_credits,
              MAX(mc.created_at) AS last_active
       FROM wecom_message_credits mc
       LEFT JOIN wecom_manus_sessions ws ON ws.wecom_user_id = mc.wecom_user_id
       WHERE mc.channel_type = ?
       GROUP BY mc.wecom_user_id
       ORDER BY last_active DESC`,
      [channelType]
    );
    // 查黑名单
    const [blackRows] = await (conn as any).execute(
      "SELECT wecom_user_id FROM wecom_user_blacklist WHERE channel_type = ?",
      [channelType]
    );
    const blackSet = new Set((blackRows as any[]).map((r) => r.wecom_user_id));
    const users = (rows as any[]).map((u) => ({
      ...u,
      blocked: blackSet.has(u.wecom_user_id),
    }));
    res.json({ ok: true, users });
  } catch (e: any) {
    console.error("[渠道用户] 获取失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 拉黑用户
router.post("/api/wecom/ch/users/block", async (req: Request, res: Response) => {
  const { wecom_user_id, channel_type = "app", reason = "" } = req.body;
  if (!wecom_user_id) return res.status(400).json({ error: "缺少wecom_user_id" });
  const conn = await getDbConnection();
  try {
    await (conn as any).execute(
      `INSERT INTO wecom_user_blacklist (wecom_user_id, channel_type, reason) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE reason=VALUES(reason)`,
      [wecom_user_id, channel_type, reason]
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[拉黑] 失败:", e);
    res.status(500).json({ error: "操作失败" });
  }
});

// 解除拉黑
router.post("/api/wecom/ch/users/unblock", async (req: Request, res: Response) => {
  const { wecom_user_id, channel_type = "app" } = req.body;
  if (!wecom_user_id) return res.status(400).json({ error: "缺少wecom_user_id" });
  const conn = await getDbConnection();
  try {
    await (conn as any).execute(
      "DELETE FROM wecom_user_blacklist WHERE wecom_user_id = ? AND channel_type = ?",
      [wecom_user_id, channel_type]
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[解除拉黑] 失败:", e);
    res.status(500).json({ error: "操作失败" });
  }
});

// =====================================================================
// 三、知识库看板 + 文件上传 + 导入导出
// =====================================================================
// 看板统计（按渠道）：知识库数、条目数、覆盖文件数、字符数
router.get("/api/wecom/ch/kb/stats", async (req: Request, res: Response) => {
  const channelType = (req.query.channel_type as string) || "app";
  const channelId = req.query.channel_id as string;
  const conn = await getDbConnection();
  try {
    let kbRows;
    if (channelId) {
      [kbRows] = await (conn as any).execute(
        "SELECT id FROM wecom_knowledge_bases WHERE channel_id = ?",
        [channelId]
      );
    } else {
      [kbRows] = await (conn as any).execute(
        "SELECT id FROM wecom_knowledge_bases WHERE channel_type = ?",
        [channelType]
      );
    }
    const kbIds = (kbRows as any[]).map((r) => r.id);
    if (kbIds.length === 0) {
      return res.json({ ok: true, kb_count: 0, item_count: 0, file_count: 0, char_count: 0 });
    }
    const placeholders = kbIds.map(() => "?").join(",");
    const [statRows] = await (conn as any).execute(
      `SELECT COUNT(*) AS item_count,
              COUNT(DISTINCT source_file) AS file_count,
              SUM(CHAR_LENGTH(COALESCE(question,'')) + CHAR_LENGTH(COALESCE(answer,''))) AS char_count,
              MAX(created_at) AS last_updated
       FROM wecom_knowledge_items WHERE kb_id IN (${placeholders})`,
      kbIds
    );
    // 本月新增（北京时间 UTC+8）
    const now = new Date();
    const bjNow = new Date(now.getTime() + 8 * 3600 * 1000);
    const monthStart = `${bjNow.getUTCFullYear()}-${String(bjNow.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`;
    const [monthRows] = await (conn as any).execute(
      `SELECT COUNT(*) AS month_count FROM wecom_knowledge_items WHERE kb_id IN (${placeholders}) AND created_at >= ?`,
      [...kbIds, monthStart]
    );
    const stat = (statRows as any[])[0] || {};
    const monthCount = Number((monthRows as any[])[0]?.month_count || 0);
    res.json({
      ok: true,
      kb_count: kbIds.length,
      item_count: Number(stat.item_count || 0),
      file_count: Number(stat.file_count || 0),
      char_count: Number(stat.char_count || 0),
      last_updated: stat.last_updated || null,
      month_count: monthCount,
    });
  } catch (e: any) {
    console.error("[知识库看板] 失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 确保渠道有一个默认知识库，返回 kbId
async function ensureDefaultKb(conn: any, channelType: string, channelId?: string | number): Promise<number> {
  if (channelId) {
    const [rows] = await conn.execute(
      "SELECT id FROM wecom_knowledge_bases WHERE channel_id = ? ORDER BY id LIMIT 1",
      [channelId]
    );
    if ((rows as any[]).length > 0) return (rows as any[])[0].id;
    const name = channelType === "kf" ? `客服知识库_${channelId}` : "自建应用知识库";
    const [result] = await conn.execute(
      "INSERT INTO wecom_knowledge_bases (name, description, channel_type, channel_id) VALUES (?,?,?,?)",
      [name, "默认知识库", channelType, channelId]
    );
    return (result as any).insertId;
  }

  const [rows] = await conn.execute(
    "SELECT id FROM wecom_knowledge_bases WHERE channel_type = ? ORDER BY id LIMIT 1",
    [channelType]
  );
  if ((rows as any[]).length > 0) return (rows as any[])[0].id;
  const name = channelType === "kf" ? "客服账号知识库" : "自建应用知识库";
  const [result] = await conn.execute(
    "INSERT INTO wecom_knowledge_bases (name, description, channel_type) VALUES (?,?,?)",
    [name, "默认知识库", channelType]
  );
  return (result as any).insertId;
}

// 文本切片函数（RAG）：按段落+长度切，每片约 300-500 字
function chunkText(text: string, maxLen = 450): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const paragraphs = cleaned.split(/\n\s*\n/);
  const chunks: string[] = [];
  let buffer = "";
  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;
    if ((buffer + "\n" + p).length <= maxLen) {
      buffer = buffer ? buffer + "\n" + p : p;
    } else {
      if (buffer) chunks.push(buffer);
      if (p.length <= maxLen) {
        buffer = p;
      } else {
        // 超长段落按句号切
        const sentences = p.split(/(?<=[。！？.!?])/);
        let sBuf = "";
        for (const s of sentences) {
          if ((sBuf + s).length <= maxLen) {
            sBuf += s;
          } else {
            if (sBuf) chunks.push(sBuf);
            sBuf = s;
          }
        }
        buffer = sBuf;
      }
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.filter((c) => c.trim().length > 0);
}

// 文件上传导入（Excel/CSV/PDF/Word/TXT）
router.post("/api/wecom/ch/kb/upload", upload.single("file"), async (req: Request, res: Response) => {
  const channelType = (req.body.channel_type as string) || "app";
  const channelId = req.body.channel_id as string;
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: "未收到文件" });
  const conn = await getDbConnection();
  try {
    const kbId = await ensureDefaultKb(conn, channelType, channelId);
    const origName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const ext = (origName.split(".").pop() || "").toLowerCase();
    let imported = 0;

    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      // Excel/CSV 标准知识库格式（按文档规范）：
      //   A列(0) = 编号（字母数字组合，如 P001）
      //   B列(1) = 标准问题 ★ → question
      //   C列(2) = 相似问法 ★ → 合并追加到 question，换行分隔
      //   D列(3) = 标准答案 ★ → answer
      //   H列(7) = 状态（已启用/已停用）
      // 支持多 Sheet：遍历所有 Sheet，自动跳过目录页和小标题行
      // 兼容旧版两列格式（无编号列）
      const fileBuffer = fs.readFileSync(file.path);
      const wb = XLSX.read(fileBuffer, { type: "buffer" });

      // 判断某个 Sheet 是否为目录页（数据行少于 3 行或无有效编号）
      function isIndexSheet(rows: any[][]): boolean {
        let dataCount = 0;
        for (const row of rows) {
          const col0 = String(row?.[0] ?? "").trim();
          // 有编号格式（字母+数字，如 P001、A001、S001）或纯数字编号
          if (/^[A-Za-z]\d+$/.test(col0) || /^\d+$/.test(col0)) dataCount++;
        }
        return dataCount < 3;
      }

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        // 跳过目录页
        if (isIndexSheet(rows)) continue;

        // 检测列格式：找到表头行，确认 B 列是「标准问题」
        // 若 A 列是「编号」则 colOffset=0（从 B 列读），否则 colOffset=-1（从 A 列读）
        let colOffset = 0;
        // 找第一个有编号格式的数据行来判断
        for (const row of rows) {
          const col0 = String(row?.[0] ?? "").trim();
          if (/^[A-Za-z]\d+$/.test(col0) || /^\d+$/.test(col0)) {
            colOffset = 0; // 有编号列
            break;
          }
          // 若 A 列是问题文本（非编号、非表头、非标题）
          const isHeader = col0.includes("编号") || col0.includes("问题") || col0.includes("▌") || col0.length > 30;
          if (!isHeader && col0.length > 0) {
            colOffset = -1; // 无编号列，从 A 列读
            break;
          }
        }

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const col0 = String(row[0] ?? "").trim();
          const standardQ = String(row[1 + colOffset] ?? "").trim();
          const similarRaw = String(row[2 + colOffset] ?? "").trim();
          const answer     = String(row[3 + colOffset] ?? "").trim();
          const status     = String(row[7] ?? "").trim(); // H列：状态

          // 跳过：表头行、大标题行、分类小标题行（▌开头）、空行
          if (!col0 && !standardQ) continue;
          if (col0.includes("编号") || col0.includes("▌") || col0.startsWith("  ")) continue;
          if (standardQ.includes("标准问题") || standardQ.toLowerCase().includes("question")) continue;
          // 跳过「已停用」状态
          if (status === "已停用") continue;
          // 必须有答案
          if (!answer) continue;

          // 将相似问法合并进 question 字段（换行分隔），提升向量检索覆盖率
          let finalQuestion = standardQ;
          if (similarRaw) {
            finalQuestion += "\n" + similarRaw;
          }

          await (conn as any).execute(
            `INSERT INTO wecom_knowledge_items (kb_id, item_type, question, answer, source_file) VALUES (?,?,?,?,?)`,
            [kbId, "qa", finalQuestion || null, answer, origName]
          );
          imported++;
        }
      }
    } else {
      // PDF/Word/TXT：提取文本 → 切片 → doc 条目
      let rawText = "";
      if (ext === "pdf") {
        const pdfParse = (await import("pdf-parse")).default;
        const dataBuffer = fs.readFileSync(file.path);
        const parsed = await pdfParse(dataBuffer);
        rawText = parsed.text || "";
      } else if (ext === "docx" || ext === "doc") {
        // 用 mammoth 提取 docx 文本（若无则降级用 textract 风格）
        try {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ path: file.path });
          rawText = result.value || "";
        } catch {
          rawText = fs.readFileSync(file.path, "utf8");
        }
      } else {
        // txt 或其它纯文本
        rawText = fs.readFileSync(file.path, "utf8");
      }
      const chunks = chunkText(rawText);
      for (let i = 0; i < chunks.length; i++) {
        await (conn as any).execute(
          `INSERT INTO wecom_knowledge_items (kb_id, item_type, question, answer, source_file, chunk_index) VALUES (?,?,?,?,?,?)`,
          [kbId, "doc", null, chunks[i], origName, i]
        );
        imported++;
      }
    }

    // 清理临时文件
    try { fs.unlinkSync(file.path); } catch {}
    res.json({ ok: true, imported, file: origName, kb_id: kbId });
  } catch (e: any) {
    console.error("[知识库上传] 失败:", e);
    try { fs.unlinkSync(file.path); } catch {}
    res.status(500).json({ error: "导入失败: " + (e?.message || "未知错误") });
  }
});

// 导出知识库为Excel（按渠道）
router.get("/api/wecom/ch/kb/export", async (req: Request, res: Response) => {
  const channelType = (req.query.channel_type as string) || "app";
  const channelId = req.query.channel_id as string;
  const conn = await getDbConnection();
  try {
    let kbRows;
    if (channelId) {
      [kbRows] = await (conn as any).execute(
        "SELECT id FROM wecom_knowledge_bases WHERE channel_id = ?",
        [channelId]
      );
    } else {
      [kbRows] = await (conn as any).execute(
        "SELECT id FROM wecom_knowledge_bases WHERE channel_type = ?",
        [channelType]
      );
    }
    const kbIds = (kbRows as any[]).map((r) => r.id);
    let items: any[] = [];
    if (kbIds.length > 0) {
      const placeholders = kbIds.map(() => "?").join(",");
      const [rows] = await (conn as any).execute(
        `SELECT item_type, question, answer, source_file, enabled
         FROM wecom_knowledge_items WHERE kb_id IN (${placeholders}) ORDER BY id`,
        kbIds
      );
      items = rows as any[];
    }
    const data = [
      ["问题", "答案", "类型", "来源文件", "启用"],
      ...items.map((it) => [
        it.question || "",
        it.answer || "",
        it.item_type === "qa" ? "问答" : "文档",
        it.source_file || "",
        it.enabled ? "是" : "否",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "知识库");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="knowledge_${channelType}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (e: any) {
    console.error("[知识库导出] 失败:", e);
    res.status(500).json({ error: "导出失败" });
  }
});

// 按来源文件删除知识条目
router.delete("/api/wecom/ch/kb/source", async (req: Request, res: Response) => {
  const channelType = (req.query.channel_type as string) || "app";
  const channelId = req.query.channel_id as string;
  const sourceFile = req.query.source_file as string;
  if (!sourceFile) return res.status(400).json({ error: "缺少source_file" });
  const conn = await getDbConnection();
  try {
    let kbRows;
    if (channelId) {
      [kbRows] = await (conn as any).execute(
        "SELECT id FROM wecom_knowledge_bases WHERE channel_id = ?",
        [channelId]
      );
    } else {
      [kbRows] = await (conn as any).execute(
        "SELECT id FROM wecom_knowledge_bases WHERE channel_type = ?",
        [channelType]
      );
    }
    const kbIds = (kbRows as any[]).map((r) => r.id);
    if (kbIds.length === 0) return res.json({ ok: true, deleted: 0 });
    const placeholders = kbIds.map(() => "?").join(",");
    const [result] = await (conn as any).execute(
      `DELETE FROM wecom_knowledge_items WHERE kb_id IN (${placeholders}) AND source_file = ?`,
      [...kbIds, sourceFile]
    );
    res.json({ ok: true, deleted: (result as any).affectedRows });
  } catch (e: any) {
    console.error("[按来源删除] 失败:", e);
    res.status(500).json({ error: "删除失败" });
  }
});

// 来源文件分组列表（看板下钻：每个文件多少条）
router.get("/api/wecom/ch/kb/sources", async (req: Request, res: Response) => {
  const channelType = (req.query.channel_type as string) || "app";
  const channelId = req.query.channel_id as string;
  const conn = await getDbConnection();
  try {
    let kbRows;
    if (channelId) {
      [kbRows] = await (conn as any).execute(
        "SELECT id FROM wecom_knowledge_bases WHERE channel_id = ?",
        [channelId]
      );
    } else {
      [kbRows] = await (conn as any).execute(
        "SELECT id FROM wecom_knowledge_bases WHERE channel_type = ?",
        [channelType]
      );
    }
    const kbIds = (kbRows as any[]).map((r) => r.id);
    if (kbIds.length === 0) return res.json({ ok: true, sources: [] });
    const placeholders = kbIds.map(() => "?").join(",");
    const [rows] = await (conn as any).execute(
      `SELECT COALESCE(source_file, '手动录入') AS source_file,
              COUNT(*) AS item_count,
              MAX(created_at) AS imported_at,
              MAX(item_type) AS item_type
       FROM wecom_knowledge_items WHERE kb_id IN (${placeholders})
       GROUP BY COALESCE(source_file, '手动录入')
       ORDER BY imported_at DESC`,
      kbIds
    );
    res.json({ ok: true, sources: rows as any[] });
  } catch (e: any) {
    console.error("[来源列表] 失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 查看某来源文件下的所有知识条目
router.get("/api/wecom/ch/kb/items", async (req: Request, res: Response) => {
  const channelType = (req.query.channel_type as string) || "app";
  const channelId = req.query.channel_id as string;
  const sourceFile = req.query.source_file as string;
  const conn = await getDbConnection();
  try {
    let kbRows;
    if (channelId) {
      [kbRows] = await (conn as any).execute(
        "SELECT id FROM wecom_knowledge_bases WHERE channel_id = ?",
        [channelId]
      );
    } else {
      [kbRows] = await (conn as any).execute(
        "SELECT id FROM wecom_knowledge_bases WHERE channel_type = ?",
        [channelType]
      );
    }
    const kbIds = (kbRows as any[]).map((r) => r.id);
    if (kbIds.length === 0) return res.json({ ok: true, items: [] });
    const placeholders = kbIds.map(() => "?").join(",");
    let sql = `SELECT id, item_type, question, answer, source_file, chunk_index, enabled
               FROM wecom_knowledge_items WHERE kb_id IN (${placeholders})`;
    const params: any[] = [...kbIds];
    if (sourceFile) {
      if (sourceFile === "手动录入") {
        sql += " AND source_file IS NULL";
      } else {
        sql += " AND source_file = ?";
        params.push(sourceFile);
      }
    }
    sql += " ORDER BY chunk_index IS NULL, chunk_index, id";
    const [rows] = await (conn as any).execute(sql, params);
    res.json({ ok: true, items: rows as any[] });
  } catch (e: any) {
    console.error("[知识条目] 失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// =====================================================================
// 四、对话日志增强：多维筛选 + 导出 + AI分析
// =====================================================================
// 增强版日志查询（支持 channel_type / 关键词 / 模型 过滤）
router.get("/api/wecom/ch/logs", async (req: Request, res: Response) => {
  const {
    channel_type = "app",
    channel_id,
    start_date,
    end_date,
    user_id,
    keyword,
    model,
    limit = "50",
    offset = "0",
  } = req.query as Record<string, string>;
  const conn = await getDbConnection();
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    if (channel_id) {
      conditions.push("mc.channel_type = ?");
      params.push(`kf_${channel_id}`);
    } else {
      conditions.push("mc.channel_type = ?");
      params.push(channel_type);
    }
    if (start_date) { conditions.push("mc.created_at >= ?"); params.push(start_date + " 00:00:00"); }
    if (end_date) { conditions.push("mc.created_at <= ?"); params.push(end_date + " 23:59:59"); }
    if (user_id) { conditions.push("mc.wecom_user_id = ?"); params.push(user_id); }
    if (keyword) {
      conditions.push("(mc.user_message LIKE ? OR mc.reply_preview LIKE ?)");
      params.push("%" + keyword + "%", "%" + keyword + "%");
    }
    if (model) { conditions.push("mc.model_used = ?"); params.push(model); }
    const where = "WHERE " + conditions.join(" AND ");
    const [rows] = await (conn as any).execute(
      `SELECT mc.id, mc.wecom_user_id, mc.user_message, mc.reply_preview, mc.model_used,
              mc.credits_used, mc.created_at, ws.nickname
       FROM wecom_message_credits mc
       LEFT JOIN wecom_manus_sessions ws ON ws.wecom_user_id = mc.wecom_user_id
       ${where}
       ORDER BY mc.created_at DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );
    const [countRows] = await (conn as any).execute(
      `SELECT COUNT(*) AS total FROM wecom_message_credits mc ${where}`,
      params
    );
    res.json({ ok: true, logs: rows, total: (countRows as any[])[0].total });
  } catch (e: any) {
    console.error("[渠道日志] 失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 日志导出（CSV / JSON）
router.get("/api/wecom/ch/logs/export", async (req: Request, res: Response) => {
  const {
    channel_type = "app",
    channel_id,
    start_date,
    end_date,
    user_id,
    keyword,
    model,
    format = "csv",
  } = req.query as Record<string, string>;
  const conn = await getDbConnection();
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    if (channel_id) {
      conditions.push("mc.channel_type = ?");
      params.push(`kf_${channel_id}`);
    } else {
      conditions.push("mc.channel_type = ?");
      params.push(channel_type);
    }
    if (start_date) { conditions.push("mc.created_at >= ?"); params.push(start_date + " 00:00:00"); }
    if (end_date) { conditions.push("mc.created_at <= ?"); params.push(end_date + " 23:59:59"); }
    if (user_id) { conditions.push("mc.wecom_user_id = ?"); params.push(user_id); }
    if (keyword) {
      conditions.push("(mc.user_message LIKE ? OR mc.reply_preview LIKE ?)");
      params.push("%" + keyword + "%", "%" + keyword + "%");
    }
    if (model) { conditions.push("mc.model_used = ?"); params.push(model); }
    const where = "WHERE " + conditions.join(" AND ");
    const [rows] = await (conn as any).execute(
      `SELECT mc.created_at, ws.nickname, mc.wecom_user_id, mc.user_message, mc.reply_preview,
              mc.model_used, mc.credits_used
       FROM wecom_message_credits mc
       LEFT JOIN wecom_manus_sessions ws ON ws.wecom_user_id = mc.wecom_user_id
       ${where}
       ORDER BY mc.created_at DESC`,
      params
    );
    const logs = rows as any[];
    if (format === "json") {
      res.setHeader("Content-Disposition", `attachment; filename="logs_${channel_type}.json"`);
      res.setHeader("Content-Type", "application/json");
      res.send(JSON.stringify(logs, null, 2));
    } else {
      const header = ["时间", "昵称", "用户ID", "用户消息", "AI回复", "模型", "积分"];
      const escape = (s: any) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const lines = [header.join(",")];
      for (const l of logs) {
        lines.push([l.created_at, l.nickname, l.wecom_user_id, l.user_message, l.reply_preview, l.model_used, l.credits_used].map(escape).join(","));
      }
      res.setHeader("Content-Disposition", `attachment; filename="logs_${channel_type}.csv"`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send("\uFEFF" + lines.join("\n")); // BOM 防止Excel中文乱码
    }
  } catch (e: any) {
    console.error("[日志导出] 失败:", e);
    res.status(500).json({ error: "导出失败" });
  }
});

// AI分析：质检 / 优化 / 知识库推荐
// body: { mode: 'qc'|'optimize'|'kb', logs: [{user_message, reply_preview}], custom_prompt? }
router.post("/api/wecom/ch/logs/ai-analyze", async (req: Request, res: Response) => {
  const { mode, logs, custom_prompt } = req.body;
  if (!Array.isArray(logs) || logs.length === 0) {
    return res.status(400).json({ error: "缺少对话记录" });
  }
  try {
    const convText = logs
      .map((l: any, i: number) => `【对话${i + 1}】\n用户：${l.user_message || ""}\nAI回复：${l.reply_preview || ""}`)
      .join("\n\n");

    let systemPrompt = "";
    let userPrompt = "";
    let wantJson = false;

    if (mode === "qc") {
      systemPrompt = "你是一名专业的AI客服质检员。请对以下对话进行质量评估，从准确性、完整性、用户满意度三个维度分析，指出问题并给出评分（1-10分）。用简洁的中文输出，适合在手机上阅读。";
      userPrompt = convText;
    } else if (mode === "optimize") {
      systemPrompt = "你是一名AI客服优化专家。请找出以下对话中AI回答得不够好的地方，并针对每条给出改进后的回复版本。用简洁的中文输出，先说问题再给改进版。";
      userPrompt = convText;
    } else if (mode === "kb") {
      systemPrompt = "你是一名知识库维护助手。请根据以下对话，判断哪些问题应该补充进知识库，生成标准的「问答对」。只输出JSON数组，格式：[{\"question\":\"...\",\"similar_questions\":\"...\",\"answer\":\"...\"}]，其中 similar_questions 是用换行分隔的 2-3 个相似问法（不同表达方式），答案要专业、准确、简洁。不要输出多余文字。";
      userPrompt = convText;
      wantJson = true;
    } else if (mode === "custom") {
      systemPrompt = "你是一名数据分析助手，请根据用户的分析需求对以下对话进行分析，用简洁中文输出。";
      userPrompt = `分析需求：${custom_prompt || "总结这些对话"}\n\n${convText}`;
    } else {
      return res.status(400).json({ error: "未知的分析模式" });
    }

    const content = await callWecomDeepSeek(systemPrompt, userPrompt);

    if (wantJson) {
      // 尝试解析JSON
      let suggestions: any[] = [];
      try {
        const match = content.match(/\[[\s\S]*\]/);
        if (match) suggestions = JSON.parse(match[0]);
      } catch {
        suggestions = [];
      }
      return res.json({ ok: true, mode, suggestions, raw: content });
    }
    res.json({ ok: true, mode, result: content });
  } catch (e: any) {
    console.error("[AI分析] 失败:", e);
    res.status(500).json({ error: "AI分析失败: " + (e?.message || "") });
  }
});

// 采纳知识库推荐（写入知识库，支持编辑后的内容）
// 支持传入 similar_questions，合并进 question 字段（换行分隔）
router.post("/api/wecom/ch/kb/adopt", async (req: Request, res: Response) => {
  const { channel_type = "app", channel_id, question, similar_questions, answer } = req.body;
  if (!answer) return res.status(400).json({ error: "答案不能为空" });
  const conn = await getDbConnection();
  try {
    const kbId = await ensureDefaultKb(conn, channel_type, channel_id);
    // 将相似问法合并进 question，提升向量检索覆盖率
    let finalQuestion = (question || "").trim();
    if (finalQuestion && similar_questions && String(similar_questions).trim()) {
      finalQuestion += "\n" + String(similar_questions).trim();
    }
    const [result] = await (conn as any).execute(
      `INSERT INTO wecom_knowledge_items (kb_id, item_type, question, answer, source_file) VALUES (?,?,?,?,?)`,
      [kbId, "qa", finalQuestion || null, answer, "AI分析采纳"]
    );
    res.json({ ok: true, id: (result as any).insertId });
  } catch (e: any) {
    console.error("[采纳知识] 失败:", e);
    res.status(500).json({ error: "采纳失败" });
  }
});

export default router;
