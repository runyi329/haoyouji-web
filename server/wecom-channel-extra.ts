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
import {
  backfillEmbeddingAsync,
  backfillAllMissing,
  buildItemEmbedText,
} from "./wecom-vector";

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
  const kbIdParam = req.query.kb_id as string;
  const conn = await getDbConnection();
  try {
    let kbRows;
    if (kbIdParam) {
      kbRows = [{ id: Number(kbIdParam) }];
    } else if (channelId) {
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
// kbIdExplicit：若显式传入（如公共库 channel_id=0），直接使用该库
async function ensureDefaultKb(conn: any, channelType: string, channelId?: string | number, kbIdExplicit?: string | number): Promise<number> {
  if (kbIdExplicit) {
    return Number(kbIdExplicit);
  }
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
  const kbIdParam = req.body.kb_id as string;
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: "未收到文件" });
  const conn = await getDbConnection();
  try {
    const kbId = await ensureDefaultKb(conn, channelType, channelId, kbIdParam);
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
    // 批量回填本次导入条目的向量（导入接口本身较慢，await 完成可接受）
    try { await backfillAllMissing(conn); } catch {}
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
  const kbIdParam = req.query.kb_id as string;
  const conn = await getDbConnection();
  try {
    let kbRows;
    if (kbIdParam) {
      kbRows = [{ id: Number(kbIdParam) }];
    } else if (channelId) {
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
  const kbIdParam = req.query.kb_id as string;
  const sourceFile = req.query.source_file as string;
  if (!sourceFile) return res.status(400).json({ error: "缺少source_file" });
  const conn = await getDbConnection();
  try {
    let kbRows;
    if (kbIdParam) {
      kbRows = [{ id: Number(kbIdParam) }];
    } else if (channelId) {
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
  const kbIdParam = req.query.kb_id as string;
  const conn = await getDbConnection();
  try {
    let kbRows;
    if (kbIdParam) {
      kbRows = [{ id: Number(kbIdParam) }];
    } else if (channelId) {
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
      `SELECT COALESCE(source_file, 'AI整理') AS source_file,
              COUNT(*) AS item_count,
              MAX(created_at) AS imported_at,
              MAX(item_type) AS item_type
       FROM wecom_knowledge_items WHERE kb_id IN (${placeholders})
       GROUP BY COALESCE(source_file, 'AI整理')
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
  const kbIdParam = req.query.kb_id as string;
  const sourceFile = req.query.source_file as string;
  const conn = await getDbConnection();
  try {
    let kbRows;
    if (kbIdParam) {
      kbRows = [{ id: Number(kbIdParam) }];
    } else if (channelId) {
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
      if (sourceFile === "AI整理") {
        sql += " AND (source_file IS NULL OR source_file = 'AI整理')";
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
    // 确保 channel_id 字段存在（兼容旧数据库）
    try {
      await (conn as any).execute(`ALTER TABLE wecom_message_credits ADD COLUMN channel_id INT DEFAULT NULL COMMENT '渠道ID'`);
      // 迁移旧数据：manus_task_id='kf-deepseek' 归入 channel_id=3（营养顾问）
      await (conn as any).execute(`UPDATE wecom_message_credits SET channel_id=3 WHERE manus_task_id='kf-deepseek' AND channel_id IS NULL`);
      // 迁移新格式：从 manus_task_id 解析 channel_id（如 kf-deepseek-3 -> 3）
      await (conn as any).execute(`UPDATE wecom_message_credits SET channel_id=CAST(REGEXP_SUBSTR(manus_task_id, '[0-9]+$') AS UNSIGNED) WHERE manus_task_id REGEXP 'kf-deepseek-[0-9]+' AND channel_id IS NULL`);
    } catch (_) {}

    const conditions: string[] = [];
    const params: any[] = [];
    if (channel_id) {
      // 优先用 channel_id 字段，兼容旧数据（channel_type IN ('kf','kf_N')）
      conditions.push("(mc.channel_id = ? OR (mc.channel_id IS NULL AND (mc.channel_type = ? OR mc.channel_type = ?)))");
      params.push(Number(channel_id), `kf_${channel_id}`, 'kf');
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
              mc.credits_used, mc.input_tokens, mc.output_tokens, mc.cache_hit_tokens,
              mc.created_at, ws.nickname,
              mc.channel_id, mc.channel_type, mc.manus_task_id,
              wc.name AS channel_name,
              wc.avatar_url AS channel_avatar,
              mc.dialog_score, mc.score_level, mc.score_reason, mc.score_dimensions
       FROM wecom_message_credits mc
       LEFT JOIN wecom_manus_sessions ws ON ws.wecom_user_id = mc.wecom_user_id
       LEFT JOIN wecom_channels wc ON wc.id = mc.channel_id
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
  const { channel_type = "app", channel_id, kb_id, question, similar_questions, answer } = req.body;
  if (!answer) return res.status(400).json({ error: "答案不能为空" });
  const conn = await getDbConnection();
  try {
    const kbId = await ensureDefaultKb(conn, channel_type, channel_id, kb_id);
    // 将相似问法合并进 question，提升向量检索覆盖率
    let finalQuestion = (question || "").trim();
    if (finalQuestion && similar_questions && String(similar_questions).trim()) {
      finalQuestion += "\n" + String(similar_questions).trim();
    }
    const [result] = await (conn as any).execute(
      `INSERT INTO wecom_knowledge_items (kb_id, item_type, question, answer, source_file) VALUES (?,?,?,?,?)`,
      [kbId, "qa", finalQuestion || null, answer, "AI分析采纳"]
    );
    const newId = (result as any).insertId;
    // 异步回填向量（不阻塞响应；连接池连接，安全）
    backfillEmbeddingAsync(
      conn,
      "wecom_knowledge_items",
      newId,
      buildItemEmbedText(finalQuestion, answer)
    );
    res.json({ ok: true, id: newId });
  } catch (e: any) {
    console.error("[采纳知识] 失败:", e);
    res.status(500).json({ error: "采纳失败" });
  }
});

// AI 解析粘贴内容/链接并批量入库
router.post("/api/wecom/ch/kb/ai-parse", async (req: Request, res: Response) => {
  const { channel_type = "kf", channel_id, content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "内容不能为空" });
  const conn = await getDbConnection();
  try {
    // 判断是否是 URL
    let rawText = content.trim();
    const urlPattern = /^https?:\/\/.+/i;
    if (urlPattern.test(rawText)) {
      // 抓取网页内容
      try {
        const fetchRes = await fetch(rawText, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; HaoyoujiBot/1.0)" },
          signal: AbortSignal.timeout(10000),
        });
        const html = await fetchRes.text();
        // 简单提取文本：去掉 HTML 标签
        rawText = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s{3,}/g, "\n")
          .trim()
          .substring(0, 8000);
      } catch (fetchErr: any) {
        return res.status(400).json({ error: `无法抓取链接内容：${fetchErr.message}` });
      }
    }

    // 调用 AI 解析成问答对
    const systemPrompt = `你是一个知识库整理助手。请将用户提供的文本内容整理成若干个问答对（Q&A），用于知识库。
要求：
1. 每个问答对包含一个问题和一个答案
2. 问题要简洁明确，答案要完整准确
3. 如果内容不适合拆分成问答，就整理成一条知识（问题留空，答案为完整内容）
4. 输出严格的 JSON 格式：{"items": [{"question": "...", "answer": "..."}, ...]}
5. 最多生成 20 条问答对`;

    const aiReply = await callWecomDeepSeek(systemPrompt, rawText);

    // 解析 AI 返回的 JSON
    let items: Array<{ question: string; answer: string }> = [];
    try {
      const jsonMatch = aiReply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        items = parsed.items || [];
      }
    } catch {
      // 如果解析失败，把整段内容作为一条知识
      items = [{ question: "", answer: rawText.substring(0, 2000) }];
    }

    if (items.length === 0) {
      return res.status(400).json({ error: "AI 未能解析出有效内容" });
    }

    // 批量写入知识库
    const kbId = await ensureDefaultKb(conn, channel_type, channel_id);
    const sourceFile = `AI粘贴_${new Date().toLocaleDateString("zh-CN")}`;
    let insertCount = 0;
    for (const item of items) {
      if (!item.answer || !item.answer.trim()) continue;
      await (conn as any).execute(
        `INSERT INTO wecom_knowledge_items (kb_id, item_type, question, answer, source_file) VALUES (?,?,?,?,?)`,
        [kbId, "qa", item.question || null, item.answer, sourceFile]
      );
            insertCount++;
    }
    // 批量回填本次新写入条目的向量（此接口 finally 会关闭连接池，故在响应前 await 完成）
    try { await backfillAllMissing(conn); } catch {}
    res.json({ ok: true, count: insertCount, items });
  } catch (e: any) {
    console.error("[AI解析粘贴] 失败:", e);
    res.status(500).json({ error: "AI 解析失败: " + (e?.message || "") });
  } finally {
    conn.end?.();
  }
});

// =====================================================================
// 五、客户数据汇总（CustomerDataTab 专用）
// =====================================================================
// 返回：总对话数、总用户数、本月对话数、平均积分消耗
router.get("/api/wecom/ch/data/summary", async (req: Request, res: Response) => {
  const { channel_type = "app", channel_id } = req.query as Record<string, string>;
  const conn = await getDbConnection();
  try {
    // 兼容旧数据：channel_id=3 时同时查 kf_3（新格式）和 kf（旧格式，已归入营养顾问）
  const channelCondition = channel_id
    ? `(mc.channel_type = 'kf_${channel_id}' OR (mc.channel_type = 'kf' AND (mc.channel_id = ${parseInt(channel_id, 10)} OR mc.channel_id IS NULL) AND ${parseInt(channel_id, 10)} = 3))`
    : `mc.channel_type = '${channel_type}'`;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const [[totals]] = await (conn as any).execute(
      `SELECT COUNT(*) AS total_logs,
              COUNT(DISTINCT mc.wecom_user_id) AS total_users,
              SUM(mc.credits_used) AS total_credits,
              AVG(mc.credits_used) AS avg_credits
       FROM wecom_message_credits mc
       WHERE ${channelCondition}`
    ) as any;
    const [[monthRow]] = await (conn as any).execute(
      `SELECT COUNT(*) AS month_logs
       FROM wecom_message_credits mc
       WHERE ${channelCondition} AND mc.created_at >= ?`,
      [monthStart + " 00:00:00"]
    ) as any;
    // 获取所有出现过的模型列表（用于筛选下拉框）
    const [modelRows] = await (conn as any).execute(
      `SELECT DISTINCT mc.model_used FROM wecom_message_credits mc
       WHERE ${channelCondition} AND mc.model_used IS NOT NULL AND mc.model_used != ''
       ORDER BY mc.model_used`
    ) as any;
    res.json({
      ok: true,
      total_logs: Number(totals?.total_logs || 0),
      total_users: Number(totals?.total_users || 0),
      total_credits: Number(totals?.total_credits || 0),
      avg_credits: Math.round(Number(totals?.avg_credits || 0)),
      month_logs: Number(monthRow?.month_logs || 0),
      models: (modelRows as any[]).map((r: any) => r.model_used).filter(Boolean),
    });
  } catch (e: any) {
    console.error("[客户数据汇总] 失败:", e);
    res.status(500).json({ error: "获取失败" });
  } finally {
    conn.end?.();
  }
});

// =====================================================================
// 数字分身（Corpus + DigitalTwin）API
// =====================================================================

/** 确保 wecom_corpus 和 wecom_digital_twin 表存在（含列迁移） */
async function ensureCorpusTables(conn: any) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS wecom_corpus (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      channel_id INT NOT NULL,
      user_msg TEXT NOT NULL COMMENT '用户消息',
      agent_reply TEXT NOT NULL COMMENT '客服回复',
      quality TINYINT NOT NULL DEFAULT 0 COMMENT '0=普通 1=优质',
      scene_tag VARCHAR(32) DEFAULT NULL COMMENT '场景标签: price/product/close/objection/followup/other',
      source VARCHAR(32) DEFAULT 'manual' COMMENT '来源: manual/import/ai_pick',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_channel_quality (channel_id, quality)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS wecom_digital_twin (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      channel_id INT NOT NULL UNIQUE,
      twin_enabled TINYINT NOT NULL DEFAULT 0 COMMENT '开关',
      twin_version VARCHAR(16) DEFAULT 'v1.0',
      last_trained_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 列迁移：若旧表缺少列，自动补充
  const migrationCols = [
    { col: 'twin_enabled', sql: 'ADD COLUMN twin_enabled TINYINT NOT NULL DEFAULT 0 COMMENT \'\u5f00关\'' },
    { col: 'twin_version', sql: "ADD COLUMN twin_version VARCHAR(16) DEFAULT 'v1.0'" },
    { col: 'last_trained_at', sql: 'ADD COLUMN last_trained_at TIMESTAMP NULL DEFAULT NULL' },
    { col: 'updated_at', sql: 'ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
  ];
  for (const m of migrationCols) {
    try {
      await conn.execute(`ALTER TABLE wecom_digital_twin ${m.sql}`);
    } catch (_) { /* 列已存在，忽略 */ }
  }
  // API 用量记录表（统一记录所有 AI 调用的 token/积分/次数）
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS wecom_api_usage_log (
      id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      use_case      VARCHAR(64) NOT NULL COMMENT '场景标识，如 chat/embedding/image_ocr/voice_asr',
      provider      VARCHAR(32) NOT NULL DEFAULT '' COMMENT '服务商，如 hunyuan/deepseek/manus',
      model_name    VARCHAR(64) NOT NULL DEFAULT '' COMMENT '模型名称',
      channel_id    INT NULL COMMENT '关联分身渠道，NULL 表示平台级调用',
      input_tokens  INT NOT NULL DEFAULT 0 COMMENT '输入 token 数（或等效计量）',
      output_tokens INT NOT NULL DEFAULT 0 COMMENT '输出 token 数',
      duration_sec  FLOAT NOT NULL DEFAULT 0 COMMENT '音频时长（秒），语音识别专用',
      cost_unit     VARCHAR(16) NOT NULL DEFAULT 'token' COMMENT '计费单位：token/second/call',
      extra         TEXT NULL COMMENT 'JSON 扩展字段',
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_use_case_time (use_case, created_at),
      INDEX idx_channel_time (channel_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/** GET /api/wecom/corpus/stats?channel_id=3 */
router.get("/api/wecom/corpus/stats", async (req: Request, res: Response) => {
  const channelId = parseInt(req.query.channel_id as string, 10) || 0;
  if (!channelId) return res.status(400).json({ ok: false, error: "channel_id 必填" });
  const conn = await getDbConnection();
  try {
    await ensureCorpusTables(conn);
    const [[totalRow]] = await (conn as any).execute(
      `SELECT COUNT(*) as cnt FROM wecom_corpus WHERE channel_id = ?`,
      [channelId]
    ) as any;
    const [[qualityRow]] = await (conn as any).execute(
      `SELECT COUNT(*) as cnt FROM wecom_corpus WHERE channel_id = ? AND quality = 1`,
      [channelId]
    ) as any;
    const [sceneRows] = await (conn as any).execute(
      `SELECT scene_tag as tag, COUNT(*) as cnt FROM wecom_corpus WHERE channel_id = ? AND quality = 1 AND scene_tag IS NOT NULL GROUP BY scene_tag ORDER BY cnt DESC LIMIT 6`,
      [channelId]
    ) as any;
    const [[twinRow]] = await (conn as any).execute(
      `SELECT twin_enabled, twin_version, last_trained_at FROM wecom_digital_twin WHERE channel_id = ? LIMIT 1`,
      [channelId]
    ) as any;
    res.json({
      ok: true,
      total: Number(totalRow?.cnt || 0),
      quality_count: Number(qualityRow?.cnt || 0),
      scene_tags: (sceneRows as any[]).map((r: any) => ({ tag: r.tag, cnt: Number(r.cnt) })),
      twin_enabled: twinRow ? (twinRow.twin_enabled === 1) : false,
      twin_version: twinRow?.twin_version || 'v1.0',
      last_updated: twinRow?.last_trained_at || null,
    });
  } catch (e: any) {
    console.error("[corpus/stats] 失败:", e);
    res.status(500).json({ ok: false, error: "获取失败" });
  }
});

/** POST /api/wecom/corpus/twin-toggle */
router.post("/api/wecom/corpus/twin-toggle", async (req: Request, res: Response) => {
  const { channel_id, enabled } = req.body;
  if (!channel_id) return res.status(400).json({ ok: false, error: "channel_id 必填" });
  const conn = await getDbConnection();
  try {
    await ensureCorpusTables(conn);
    await (conn as any).execute(
      `INSERT INTO wecom_digital_twin (channel_id, twin_enabled) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE twin_enabled = VALUES(twin_enabled), updated_at = CURRENT_TIMESTAMP`,
      [channel_id, enabled ? 1 : 0]
    );
    res.json({ ok: true, twin_enabled: !!enabled });
  } catch (e: any) {
    console.error("[corpus/twin-toggle] 失败:", e);
    res.status(500).json({ ok: false, error: "操作失败" });
  }
});

// =====================================================================
// 对话质量评分（AI自动打分 + 手动调整）
// =====================================================================

/**
 * POST /api/wecom/ch/logs/auto-score-all
 * 对未打分的对话记录批量补打分，每次最多处理 batchSize 条
 * 异步执行：接口立即返回，后台持续打分
 * 注意：必须在 /:id/score 路由之前注册，否则 auto-score-all 会被当作 :id 匹配
 */
router.post("/api/wecom/ch/logs/auto-score-all", async (req: Request, res: Response) => {
  const batchSize = Math.min(parseInt((req.body?.batch_size as string) || '50', 10), 100);
  const conn = await getDbConnection();
  let pendingCount = 0;
  try {
    const [pending] = await (conn as any).execute(
      `SELECT id, user_message, reply_preview FROM wecom_message_credits
       WHERE dialog_score IS NULL
         AND channel_type IN ('kf','kf_3','kf_4','kf_5','kf_6')
         AND user_message IS NOT NULL AND user_message != ''
         AND reply_preview IS NOT NULL AND reply_preview != ''
       ORDER BY id DESC LIMIT ?`,
      [batchSize]
    );
    pendingCount = (pending as any[]).length;
    res.json({ ok: true, pending: pendingCount, message: `开始异步批量打分 ${pendingCount} 条` });
    setImmediate(async () => {
      const scoreSystemPrompt = `你是一名专业的AI对话质量评估专家。请对以下一条对话进行质量评分，输出严格的JSON格式（不要输出任何其他内容）：
{
  "stars": <1.0|1.5|2.0|2.5|3.0|3.5|4.0|4.5|5.0 中的一个小数>,
  "reason": "<简洁的中文总评，不超过80字>",
  "dimensions": {
    "intent_clarity": <0-20的整数>,
    "reply_quality": <0-30的整数>,
    "completeness": <0-20的整数>,
    "info_density": <0-15的整数>,
    "emotion_handling": <0-15的整数>
  }
}
星级标准：5星=极优精选训练集，4星=良好备选语料，3星=一般参考语料，2星=较差建议修改，1星=低质过滤丢弃。必须使用半星精度。`;
      for (const log of (pending as any[])) {
        try {
          const userPrompt = `用户消息：${(log.user_message || '').substring(0, 300)}
AI回复：${(log.reply_preview || '').substring(0, 300)}`;
          const aiReply = await callWecomDeepSeek(scoreSystemPrompt, userPrompt);
          let stars = 3.0, reason = '', dimensions: any = null;
          try {
            const m = aiReply.match(/\{[\s\S]*\}/);
            if (m) {
              const p = JSON.parse(m[0]);
              if (p.stars !== undefined) stars = Math.round(Math.max(1.0, Math.min(5.0, parseFloat(p.stars) || 3.0)) * 2) / 2;
              reason = (p.reason || '').substring(0, 200);
              if (p.dimensions) dimensions = p.dimensions;
            }
          } catch (_) {}
          const score = Math.round(stars * 20);
          const level = stars >= 4.5 ? '优质' : stars >= 3.5 ? '良好' : stars >= 2.5 ? '一般' : '低质';
          const dimJson = dimensions ? JSON.stringify(dimensions) : null;
          await (conn as any).execute(
            `UPDATE wecom_message_credits SET dialog_score=?, score_level=?, score_reason=?, score_dimensions=?, score_at=NOW() WHERE id=?`,
            [score, level, reason, dimJson, log.id]
          );
          console.log(`[批量评分] id=${log.id} stars=${stars}`);
          await new Promise(r => setTimeout(r, 500));
        } catch (se) {
          console.error(`[批量评分] id=${log.id} 失败:`, se);
        }
      }
      console.log(`[批量评分] 完成 ${pendingCount} 条`);
      conn.end?.();
    });
  } catch (e: any) {
    console.error('[批量评分] 失败:', e);
    res.status(500).json({ error: '批量评分失败' });
  }
});

/** POST /api/wecom/ch/logs/:id/score
 *  body: { channel_id, channel_type, avatar_role? }
 *  功能：调用 DeepSeek 对单条对话打分，结合分身定位
 */
router.post("/api/wecom/ch/logs/:id/score", async (req: Request, res: Response) => {
  const logId = parseInt(req.params.id, 10);
  const { channel_id, channel_type = "kf", avatar_role } = req.body;
  if (!logId) return res.status(400).json({ error: "缺少 log id" });
  const conn = await getDbConnection();
  try {
    // 确保评分字段存在
    try {
      for (const sql of [
        `ALTER TABLE wecom_message_credits ADD COLUMN dialog_score TINYINT DEFAULT NULL COMMENT '对话质量评分 0-100'`,
        `ALTER TABLE wecom_message_credits ADD COLUMN score_level VARCHAR(10) DEFAULT NULL COMMENT '评分等级：优质/良好/一般/低质'`,
        `ALTER TABLE wecom_message_credits ADD COLUMN score_reason TEXT DEFAULT NULL COMMENT 'AI评分理由'`,
        `ALTER TABLE wecom_message_credits ADD COLUMN score_at TIMESTAMP DEFAULT NULL COMMENT '评分时间'`,
        `ALTER TABLE wecom_message_credits ADD COLUMN score_dimensions JSON DEFAULT NULL COMMENT 'AI评分各维度详情'`,
      ]) { try { await (conn as any).execute(sql); } catch (_) {} }
    } catch (_) {}

    // 读取对话内容
    const [rows] = await (conn as any).execute(
      `SELECT mc.id, mc.user_message, mc.reply_preview, mc.model_used,
              mc.dialog_score, mc.score_level, mc.score_reason, mc.score_dimensions, mc.score_at,
              ws.nickname
       FROM wecom_message_credits mc
       LEFT JOIN wecom_manus_sessions ws ON ws.wecom_user_id = mc.wecom_user_id
       WHERE mc.id = ?`,
      [logId]
    );
    const log = (rows as any[])[0];
    if (!log) return res.status(404).json({ error: "对话记录不存在" });

    // 如果已有评分，直接返回（避免重复计费）
    if (log.dialog_score !== null && log.dialog_score !== undefined) {
      const cachedStars = Math.round((log.dialog_score / 20) * 2) / 2;
      let cachedDims = null;
      try { cachedDims = log.score_dimensions ? JSON.parse(log.score_dimensions) : null; } catch (_) {}
      return res.json({ ok: true, score: log.dialog_score, stars: cachedStars, level: log.score_level, reason: log.score_reason, dimensions: cachedDims, cached: true });
    }

    // 构建评分 Prompt（结合分身定位）
    const roleContext = avatar_role
      ? `当前数字分身的定位是：${avatar_role}。请结合该定位评估对话是否符合分身的专业方向和服务目标。`
      : "请从通用AI客服质量角度评估对话。";

    const systemPrompt = `你是一名专业的AI对话质量评估专家。${roleContext}

请对以下一条对话进行质量评分，输出严格的JSON格式（不要输出任何其他内容）：
{
  "stars": <1.0|1.5|2.0|2.5|3.0|3.5|4.0|4.5|5.0 中的一个小数>,
  "reason": "<简洁的中文总评，不超过80字>",
  "dimensions": {
    "intent_clarity": <0-20的整数，评估用户意图是否清晰、AI是否准确理解意图>,
    "reply_quality": <0-30的整数，评估回复是否准确完整专业、有无错误信息>,
    "completeness": <0-20的整数，评估是否有完整的问答闭环、用户问题是否得到解决>,
    "info_density": <0-15的整数，评估对话中是否包含有价値的业务知识信息>,
    "emotion_handling": <0-15的整数，评估遇到负面情绪或投诉时AI的处理是否得当>
  }
}

星级标准：5星=极优精选训练集，4星=良好备选语料，3星=一般参考语料，2星=较差建议修改，1星=低质过滤丢弃。必须使用半星精度（如3.5、4.0、4.5），不要只给整星。`;

    const userPrompt = `用户消息：${log.user_message || "(空)"}
AI回复：${log.reply_preview || "(空)"}`;

    const aiReply = await callWecomDeepSeek(systemPrompt, userPrompt);

    // 解析 JSON
    let stars = 3.0, reason = "AI评分完成", dimensions: any = null;
    try {
      const jsonMatch = aiReply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // 星级解析：支持 stars 字段（新）或 score 字段（兼容旧格式）
        if (parsed.stars !== undefined) {
          stars = Math.round(Math.max(1.0, Math.min(5.0, parseFloat(parsed.stars) || 3.0)) * 2) / 2;
        } else if (parsed.score !== undefined) {
          // 将旧的 0-100 分转换为星级
          const s = Math.max(0, Math.min(100, parseInt(parsed.score, 10) || 60));
          stars = Math.round((s / 20) * 2) / 2; // 0-100 映射到 0-5
          stars = Math.max(1.0, Math.min(5.0, stars));
        }
        reason = (parsed.reason || "").substring(0, 200);
        if (parsed.dimensions) dimensions = parsed.dimensions;
      }
    } catch (_) { /* 保持默认分 */ }

    // 星级转换为 0-100 分存储（向下兼容）
    const score = Math.round(stars * 20);
    const level = stars >= 4.5 ? "优质" : stars >= 3.5 ? "良好" : stars >= 2.5 ? "一般" : "低质";
    const dimensionsJson = dimensions ? JSON.stringify(dimensions) : null;

    // 确保 dimensions 字段存在
    // score_dimensions 已在 initScoreColumns 中处理，此处跳过

    // 写入数据库
    await (conn as any).execute(
      `UPDATE wecom_message_credits SET dialog_score=?, score_level=?, score_reason=?, score_dimensions=?, score_at=NOW() WHERE id=?`,
      [score, level, reason, dimensionsJson, logId]
    );

    res.json({ ok: true, score, stars, level, reason, dimensions, cached: false });
  } catch (e: any) {
    console.error("[对话评分] 失败:", e);
    res.status(500).json({ error: "评分失败: " + (e?.message || "") });
  }
});

/** PATCH /api/wecom/ch/logs/:id/score
 *  body: { score, level, reason }
 *  功能：手动调整评分
 */
router.patch("/api/wecom/ch/logs/:id/score", async (req: Request, res: Response) => {
  const logId = parseInt(req.params.id, 10);
  const { score, level, reason } = req.body;
  if (!logId || score === undefined) return res.status(400).json({ error: "缺少参数" });
  const finalScore = Math.max(0, Math.min(100, parseInt(score, 10)));
  const finalLevel = ["优质", "良好", "一般", "低质"].includes(level) ? level : (finalScore >= 80 ? "优质" : finalScore >= 60 ? "良好" : finalScore >= 40 ? "一般" : "低质");
  const conn = await getDbConnection();
  try {
    await (conn as any).execute(
      `UPDATE wecom_message_credits SET dialog_score=?, score_level=?, score_reason=?, score_at=NOW() WHERE id=?`,
      [finalScore, finalLevel, reason || "手动调整", logId]
    );
    res.json({ ok: true, score: finalScore, level: finalLevel });
  } catch (e: any) {
    res.status(500).json({ error: "调整失败" });
  }
});

// =====================================================================
// 全平台对话记录明细（用量统计页面专用）
// =====================================================================
/** GET /api/wecom/platform/logs
 *  支持筛选：channel_id, start_date, end_date, user_id, model, keyword
 *  返回：带渠道名称的对话记录列表，含 token 明细
 */
router.get("/api/wecom/platform/logs", async (req: Request, res: Response) => {
  const {
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
    // 确保 channel_id 字段存在（兼容旧数据库）
    try {
      await (conn as any).execute(`ALTER TABLE wecom_message_credits ADD COLUMN channel_id INT DEFAULT NULL COMMENT '渠道ID'`);
      await (conn as any).execute(`UPDATE wecom_message_credits SET channel_id=3 WHERE manus_task_id='kf-deepseek' AND channel_id IS NULL`);
      await (conn as any).execute(`UPDATE wecom_message_credits SET channel_id=CAST(REGEXP_SUBSTR(manus_task_id, '[0-9]+$') AS UNSIGNED) WHERE manus_task_id REGEXP 'kf-deepseek-[0-9]+' AND channel_id IS NULL`);
    } catch (_) {}
    const conditions: string[] = ["mc.channel_type IN ('kf','kf_3','kf_4','kf_5','kf_6')"];
    const params: any[] = [];
    // 支持按渠道筛选（kf类型）
    if (channel_id && channel_id !== 'all') {
      conditions.push("(mc.channel_id = ? OR (mc.channel_id IS NULL AND mc.manus_task_id LIKE ?))");
      params.push(Number(channel_id), `kf-deepseek-${channel_id}%`);
      // 如果是渠道3，还要包含旧的 kf-deepseek 数据
      if (channel_id === '3') {
        conditions[conditions.length - 1] = "(mc.channel_id = ? OR (mc.channel_id IS NULL AND (mc.manus_task_id = 'kf-deepseek' OR mc.manus_task_id LIKE 'kf-deepseek-3%')))";
      }
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
              mc.credits_used, mc.input_tokens, mc.output_tokens, mc.cache_hit_tokens,
              mc.created_at, ws.nickname,
              mc.channel_id, mc.channel_type, mc.manus_task_id,
              COALESCE(wc.name, CASE
                WHEN mc.manus_task_id = 'kf-deepseek' THEN '营养顾问'
                WHEN mc.manus_task_id LIKE 'kf-deepseek-%' THEN CONCAT('渠道', REGEXP_SUBSTR(mc.manus_task_id, '[0-9]+$'))
                ELSE mc.channel_type
              END) AS channel_name,
              mc.dialog_score, mc.score_level
       FROM wecom_message_credits mc
       LEFT JOIN wecom_manus_sessions ws ON ws.wecom_user_id = mc.wecom_user_id
       LEFT JOIN wecom_channels wc ON wc.id = mc.channel_id
       ${where}
       ORDER BY mc.created_at DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );
    const [countRows] = await (conn as any).execute(
      `SELECT COUNT(*) AS total,
              SUM(mc.input_tokens + mc.output_tokens + mc.cache_hit_tokens) AS total_tokens,
              SUM(mc.credits_used) AS total_credits
       FROM wecom_message_credits mc ${where}`,
      params
    );
    const summary = (countRows as any[])[0];
    res.json({
      ok: true,
      logs: rows,
      total: Number(summary?.total || 0),
      total_tokens: Number(summary?.total_tokens || 0),
      total_credits: Number(summary?.total_credits || 0),
    });
  } catch (e: any) {
    console.error("[平台日志] 失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

/** GET /api/wecom/platform/channels
 *  返回所有 kf 类型渠道列表（用于筛选下拉）
 */
router.get("/api/wecom/platform/channels", async (req: Request, res: Response) => {
  const conn = await getDbConnection();
  try {
    const [rows] = await (conn as any).execute(
      `SELECT id, name FROM wecom_channels WHERE channel_type = 'kf' AND is_enabled = 1 ORDER BY id`
    );
    res.json({ ok: true, channels: rows });
  } catch (e: any) {
    res.status(500).json({ error: "获取失败" });
  }
});



// =====================================================================
// 素材库（wecom_materials）
// 每个分身可上传图片/视频/文件，配一段自然语言触发描述
// AI 对话时自动注入素材列表，AI 用 [SEND_MAT:id] 标记触发发送
// =====================================================================

async function ensureMaterialsTable(conn: any) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS wecom_materials (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      channel_id    INT NOT NULL COMMENT '所属分身渠道',
      type          VARCHAR(16) NOT NULL DEFAULT 'image' COMMENT 'image/video/file',
      title         VARCHAR(128) NOT NULL DEFAULT '' COMMENT '素材名称',
      description   TEXT COMMENT '触发描述（自然语言，AI 据此判断何时发送）',
      storage_url   TEXT COMMENT '云存储原始URL（永久）',
      storage_key   VARCHAR(256) COMMENT '云存储key',
      media_id      VARCHAR(128) DEFAULT NULL COMMENT '企微媒体ID（3天有效）',
      media_id_expires_at BIGINT DEFAULT NULL COMMENT '企微媒体ID过期时间戳(ms)',
      file_size     INT DEFAULT 0 COMMENT '文件大小(bytes)',
      mime_type     VARCHAR(64) DEFAULT '' COMMENT 'MIME类型',
      is_active     TINYINT NOT NULL DEFAULT 1,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_channel (channel_id, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/** GET /api/wecom/materials?channel_id=3 — 获取素材列表 */
router.get("/api/wecom/materials", async (req: Request, res: Response) => {
  const channelId = parseInt(req.query.channel_id as string, 10) || 0;
  if (!channelId) return res.status(400).json({ ok: false, error: "channel_id 必填" });
  const conn = await getDbConnection();
  try {
    await ensureMaterialsTable(conn);
    const [rows] = await (conn as any).execute(
      `SELECT id, channel_id, type, title, description, storage_url, file_size, mime_type, is_active, created_at
       FROM wecom_materials WHERE channel_id = ? AND is_active = 1 ORDER BY id DESC`,
      [channelId]
    );
    res.json({ ok: true, materials: rows });
  } catch (e: any) {
    console.error("[materials] 获取失败:", e);
    res.status(500).json({ ok: false, error: "获取失败" });
  }
});

/** POST /api/wecom/materials/upload — 上传素材文件 */
router.post("/api/wecom/materials/upload", upload.single("file"), async (req: Request, res: Response) => {
  const channelId = parseInt(req.body.channel_id, 10) || 0;
  const title = (req.body.title as string || "").trim();
  const description = (req.body.description as string || "").trim();
  if (!channelId) return res.status(400).json({ ok: false, error: "channel_id 必填" });
  if (!req.file) return res.status(400).json({ ok: false, error: "文件必填" });

  const conn = await getDbConnection();
  try {
    await ensureMaterialsTable(conn);

    // 读取文件内容
    const fileBuffer = fs.readFileSync(req.file.path);
    const mimeType = req.file.mimetype || "application/octet-stream";
    const originalName = req.file.originalname || req.file.filename;
    const fileSize = req.file.size || fileBuffer.length;

    // 判断类型
    let matType = "file";
    if (mimeType.startsWith("image/")) matType = "image";
    else if (mimeType.startsWith("video/")) matType = "video";

    // 上传到腾讯云COS
    let storageUrl: string;
    const safeFilename = `${channelId}/${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    if (mimeType.startsWith("image/")) {
      const { uploadImageToCOS } = await import("./cos-upload");
      storageUrl = await uploadImageToCOS(fileBuffer, "wecom-materials", safeFilename);
    } else {
      const { uploadFileToCOS } = await import("./cos-upload");
      storageUrl = await uploadFileToCOS(fileBuffer, "wecom-materials", safeFilename, mimeType);
    }

    // 写入数据库
    const displayTitle = title || originalName;
    const [result] = await (conn as any).execute(
      `INSERT INTO wecom_materials (channel_id, type, title, description, storage_url, storage_key, file_size, mime_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [channelId, matType, displayTitle, description, storageUrl, safeFilename, fileSize, mimeType]
    );
    const insertId = (result as any).insertId;

    // 清理临时文件
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    res.json({ ok: true, id: insertId, storage_url: storageUrl, type: matType, title: displayTitle });
  } catch (e: any) {
    console.error("[materials/upload] 失败:", e);
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ ok: false, error: e.message || "上传失败" });
  }
});

/** PUT /api/wecom/materials/:id — 更新素材描述/标题 */
router.put("/api/wecom/materials/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { title, description } = req.body;
  if (!id) return res.status(400).json({ ok: false, error: "id 必填" });
  const conn = await getDbConnection();
  try {
    await ensureMaterialsTable(conn);
    await (conn as any).execute(
      `UPDATE wecom_materials SET title = ?, description = ? WHERE id = ?`,
      [title || "", description || "", id]
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[materials] 更新失败:", e);
    res.status(500).json({ ok: false, error: "更新失败" });
  }
});

/** DELETE /api/wecom/materials/:id — 软删除素材 */
router.delete("/api/wecom/materials/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: "id 必填" });
  const conn = await getDbConnection();
  try {
    await ensureMaterialsTable(conn);
    await (conn as any).execute(`UPDATE wecom_materials SET is_active = 0 WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[materials] 删除失败:", e);
    res.status(500).json({ ok: false, error: "删除失败" });
  }
});

/** GET /api/wecom/materials/for-ai?channel_id=3 — 给AI用的素材列表（含描述） */
router.get("/api/wecom/materials/for-ai", async (req: Request, res: Response) => {
  const channelId = parseInt(req.query.channel_id as string, 10) || 0;
  if (!channelId) return res.status(400).json({ ok: false, materials: [] });
  const conn = await getDbConnection();
  try {
    await ensureMaterialsTable(conn);
    const [rows] = await (conn as any).execute(
      `SELECT id, type, title, description FROM wecom_materials WHERE channel_id = ? AND is_active = 1 AND description != '' ORDER BY id`,
      [channelId]
    );
    res.json({ ok: true, materials: rows });
  } catch (e: any) {
    res.json({ ok: false, materials: [] });
  }
});

// -----------------------------------------------------------
// OCR识别图片中的文字（用于① AI 智能整理上传图片）
// 直接调用 Forge API（支持视觉），绕过 invokeLLM 避免参数兼容问题
// -----------------------------------------------------------
router.post('/api/wecom/ocr-image', async (req: any, res: any) => {
  const { imageBase64, mimeType = 'image/jpeg' } = req.body;
  if (!imageBase64) {
    return res.json({ ok: false, error: '缺少图片数据' });
  }
  try {
    // 优先使用 Forge API（支持视觉），fallback 到 WECOM_DEEPSEEK_API_KEY（不支持视觉，仅文字）
    const forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY || '';
    const forgeApiUrl = process.env.BUILT_IN_FORGE_API_URL || 'https://forge.manus.im';
    if (!forgeApiKey) {
      return res.json({ ok: false, error: 'OCR 功能需要配置 BUILT_IN_FORGE_API_KEY' });
    }
    const apiUrl = `${forgeApiUrl.replace(/\/$/, '')}/v1/chat/completions`;
    const payload = {
      model: 'gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '请识别图片中的所有文字内容，保持原有格式和顺序，直接返回文字内容，不要添加任何解释或前缀。如果图片中没有文字，请回复"图片中没有文字"。' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      max_tokens: 4096,
    };
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${forgeApiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('[OCR] API 调用失败:', response.status, errText.substring(0, 200));
      return res.json({ ok: false, error: `图片识别服务暂时不可用（${response.status}）` });
    }
    const data = await response.json() as any;
    const rawContent = data?.choices?.[0]?.message?.content;
    const text = typeof rawContent === 'string' ? rawContent : '';
    if (text) {
      res.json({ ok: true, text });
    } else {
      res.json({ ok: false, error: '图片识别失败，未返回内容' });
    }
  } catch (e: any) {
    console.error('[OCR] 图片识别失败:', e);
    res.json({ ok: false, error: e?.message || '图片识别失败' });
  }
});

export default router;
