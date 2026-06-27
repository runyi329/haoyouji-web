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

// 默认 AI 提示词（与 yaban-comm-router.ts 保持一致）
const DEFAULT_COMM_PROMPT = `你是一名专业的牙科诊所助理，请根据以下对话内容，提取关键信息并以 JSON 格式返回。
请提取以下四个维度：
1. demand（客户诉求）：客户提到的问题、需求、主诉，用简洁的语言概括
2. keyPoints（沟通要点）：员工给出的建议、方案、报价、重要说明等
3. followup（跟进事项）：下次联系时间、待办事项、需要跟进的内容
4. remark（备注）：其他需要记录的补充信息
返回格式示例：
{
  "demand": "客户主诉牙齿敏感，询问是否需要做检查",
  "keyPoints": "建议做全口检查，报价 200 元，可使用医保",
  "followup": "约定下周三下午 3 点复诊",
  "remark": "客户对价格较敏感，可适当优惠"
}
重要要求：
- 每个字段的值必须是一段纯文本字符串，绝对不能是嵌套的对象或数组。
- 如果某个维度有多条信息，请用顿号或逗号连接成一句话。
- 如果某个维度没有相关信息，对应字段返回空字符串。
- 只返回 JSON，不要包含 markdown 代码块标记或其他任何内容。
正确示例（所有字段都是字符串）：
{"demand":"牙齿敏感，询问是否需要检查","keyPoints":"建议做全口检查，报价200元","followup":"约下周三下午3点复诊","remark":"客户对价格较敏感"}`;

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
      let summaryKeyPoints = "";
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
            max_tokens: 1024,
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
          const toStr = (v: any): string => {
            if (v == null) return "";
            if (typeof v === "string") return v;
            if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join("；");
            if (typeof v === "object") return Object.values(v).map(toStr).filter(Boolean).join("；");
            return String(v);
          };
          summaryDemand = toStr(parsed.demand);
          summaryKeyPoints = toStr(parsed.keyPoints);
          summaryFollowup = toStr(parsed.followup);
          summaryRemark = toStr(parsed.remark);
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
               summary_demand, summary_key_points, summary_followup, summary_remark,
               created_by, created_at)
             VALUES (?, ?, 'voice_ai', ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              TENANT_ID,
              customerId,
              rawText,
              audioUrl || null,
              summaryDemand || null,
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
