/**
 * 牙伴 AI 语音秘书 - 二进制音频上传接口
 * 用 multer 接收 multipart/form-data，直接处理 Buffer，
 * 绕开 iOS Safari 对 FileReader.readAsDataURL 的大文件内存限制。
 *
 * POST /api/yaban/analyze-voice-upload
 *   FormData: audio (file), customerId (string), mimeType (string)
 */
import { Router } from "express";
import multer from "multer";
import { sdk } from "./_core/sdk";
import { getDbConnection } from "./db";
import { callAIVoice } from "./wecom-ai-config";
import { ENV } from "./_core/env";

const router = Router();

// multer: 音频存内存（Buffer），最大 50MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// 默认 AI 提示词
const DEFAULT_COMM_PROMPT = `你是一名专业的牙科诊所助理，请根据以下对话内容，提取与诊所业务相关的关键信息，整理成简短的摘要条目。

要求：
1. 只提取与业务相关的内容，忽略所有寒暄、客套、无关闲聊
2. 每条摘要是一句简短的中文短句，20字以内
3. 条目数量根据内容决定，通常3-6条，内容少可以更少
4. 返回格式为 JSON，字段名为 "items"，值为字符串数组
5. 只返回 JSON，不要包含 markdown 代码块标记或其他任何内容

返回格式示例：
{"items":["下周三下午两点复诊","复查由张医生负责","无需携带任何材料","可以正常进食"]}

如果对话中没有任何业务相关内容，返回：{"items":[]}`;

/** 解析 tenantId（复用 yaban-customer-router 的逻辑） */
async function resolveTenantIdFromReq(req: any, userId: number): Promise<number> {
  const DEFAULT_TENANT_ID = 9999;
  try {
    const conn = await getDbConnection();
    if (!conn) return DEFAULT_TENANT_ID;
    const raw = req.headers?.["x-yaban-tenant"];
    const headerVal = Array.isArray(raw) ? raw[0] : raw;
    const wanted = headerVal ? parseInt(String(headerVal), 10) : NaN;
    if (!isNaN(wanted) && wanted > 0) {
      if (wanted === 9999) return 9999;
      const [m] = (await (conn as any).execute(
        `SELECT 1 FROM yaban_clinic_member WHERE user_id = ? AND tenant_id = ? AND status = 'active' LIMIT 1`,
        [userId, wanted]
      )) as any;
      if ((m as any[]).length > 0) return wanted;
    }
    const [rows] = (await (conn as any).execute(
      `SELECT tenant_id FROM yaban_clinic_member
       WHERE user_id = ? AND status = 'active'
       ORDER BY FIELD(role_key,'owner','doctor','assistant','receptionist','finance'), tenant_id ASC
       LIMIT 1`,
      [userId]
    )) as any;
    if ((rows as any[]).length > 0) return (rows as any[])[0].tenant_id;
    return DEFAULT_TENANT_ID;
  } catch {
    return DEFAULT_TENANT_ID;
  }
}

router.post(
  "/api/yaban/analyze-voice-upload",
  upload.single("audio"),
  async (req: any, res: any) => {
    try {
      // 1. 认证
      let userId: number | null = null;
      try {
        const user = await sdk.authenticateRequest(req);
        userId = user?.id ?? null;
      } catch {
        userId = null;
      }
      if (!userId) return res.status(401).json({ error: "请先登录" });

      // 2. 参数校验
      const customerId = parseInt(req.body?.customerId, 10);
      if (!customerId || isNaN(customerId)) {
        return res.status(400).json({ error: "customerId 无效" });
      }
      const mimeType: string = req.body?.mimeType || "audio/webm";
      const audioBuffer: Buffer | undefined = req.file?.buffer;
      if (!audioBuffer || audioBuffer.length === 0) {
        return res.status(400).json({ error: "未收到音频文件" });
      }
      console.log(`[AI语音秘书-upload] 收到请求: userId=${userId}, customerId=${customerId}, mimeType=${mimeType}, size=${Math.round(audioBuffer.length / 1024)}KB`);

      const TENANT_ID = await resolveTenantIdFromReq(req, userId);

      // 3. 上传音频到 COS（失败不阻断）
      let audioUrl: string | null = null;
      try {
        const { uploadFileToCOS } = await import("./cos-upload");
        audioUrl = await uploadFileToCOS(
          audioBuffer,
          "yaban-voice-records",
          `comm_${TENANT_ID}_${customerId}_${Date.now()}.mp4`,
          mimeType
        );
      } catch (e) {
        console.error("[AI语音秘书-upload] 音频上传 COS 失败:", e);
      }

      // 4. Whisper 转写
      let rawText = "";
      try {
        const asrResult = await callAIVoice(audioBuffer, mimeType);
        rawText = asrResult.text?.trim() || "";
        if (!rawText) {
          return res.status(422).json({ error: "语音转写失败：未能识别到内容，请重新录音" });
        }
      } catch (e: any) {
        return res.status(422).json({ error: `语音转写失败：${e?.message || "未知错误"}` });
      }

      // 5. 获取 AI 提示词
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
        console.error("[AI语音秘书-upload] 获取提示词失败，使用默认:", e);
      }

      // 6. 混元摘要
      let summaryDemand = "";
      let summaryHospital = "";
      let summaryKeyPoints = ""; // 存储业务摘要条目，用 \n 分隔
      let summaryFollowup = "";
      let summaryRemark = "";
      try {
        const hunyuanApiKey = ENV.hunyuanApiKey;
        const hunyuanApiBase = ENV.hunyuanApiBase;
        if (!hunyuanApiKey) throw new Error("混元 API Key 未配置");
        const hunyuanResp = await fetch(`${hunyuanApiBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${hunyuanApiKey}`,
          },
          body: JSON.stringify({
            model: "hunyuan-lite",
            messages: [
              { role: "system", content: promptContent },
              { role: "user", content: `对话内容如下：\n\n${rawText}` },
            ],
            max_tokens: 512,
          }),
        });
        if (!hunyuanResp.ok) {
          const errText = await hunyuanResp.text().catch(() => "");
          throw new Error(`混元 API 请求失败(${hunyuanResp.status}): ${errText.substring(0, 100)}`);
        }
        const hunyuanData = (await hunyuanResp.json()) as any;
        const content = hunyuanData?.choices?.[0]?.message?.content || "";
        console.log("[AI语音秘书-upload] 混元返回:", content.substring(0, 300));
        if (content) {
          let jsonStr = content.replace(/```json\n?|```\n?|\n?```/g, "").trim();
          const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (braceMatch) jsonStr = braceMatch[0];
          const parsed = JSON.parse(jsonStr);
          // 新格式： items 数组，用 \n 拼接存入 summaryKeyPoints
          if (Array.isArray(parsed.items)) {
            summaryKeyPoints = parsed.items.filter(Boolean).join("\n");
          } else {
            // 兼容旧格式
            const toStr = (v: any): string => {
              if (v == null) return "";
              if (typeof v === "string") return v;
              if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join("；");
              if (typeof v === "object") return Object.values(v).map(toStr).filter(Boolean).join("；");
              return String(v);
            };
            summaryDemand = toStr(parsed.demand);
            summaryHospital = toStr(parsed.hospital);
            summaryKeyPoints = toStr(parsed.keyPoints);
            summaryFollowup = toStr(parsed.followup);
            summaryRemark = toStr(parsed.remark);
          }
        }
      } catch (e) {
        console.error("[AI语音秘书-upload] AI摘要提取失败:", e);
      }

      // 7. 保存到数据库
      let recordId: number | null = null;
      try {
        const conn = await getDbConnection();
        if (conn) {
          const [insertResult] = await (conn as any).execute(
            `INSERT INTO yaban_comm_record
              (tenant_id, customer_id, record_type, raw_text, audio_url,
               summary_demand, summary_hospital, summary_key_points, summary_followup, summary_remark,
               created_by, created_at)
             VALUES (?, ?, 'voice_ai', ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              TENANT_ID,
              customerId,
              rawText,
              audioUrl || null,
              summaryDemand || null,
              summaryHospital || null,
              summaryKeyPoints || null,
              summaryFollowup || null,
              summaryRemark || null,
              userId,
            ]
          );
          recordId = (insertResult as any).insertId ?? null;
        }
      } catch (e) {
        console.error("[AI语音秘书-upload] 保存记录失败:", e);
      }

      return res.json({
        success: true,
        recordId,
        rawText,
        audioUrl,
        summaryDemand,
        summaryHospital,
        summaryKeyPoints,
        summaryFollowup,
        summaryRemark,
      });
    } catch (e: any) {
      console.error("[AI语音秘书-upload] 未处理错误:", e);
      return res.status(500).json({ error: e?.message || "服务器内部错误" });
    }
  }
);

export default router;
