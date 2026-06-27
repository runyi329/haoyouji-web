/**
 * 牙伴齿科 - 售前售后沟通记录路由
 * 包含：沟通记录 CRUD、AI 语音秘书（Whisper 转写 + DeepSeek 摘要）、AI 提示词配置
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDbConnection } from "./db";
import { resolveTenantId } from "./yaban-customer-router";
import { transcribeAudio } from "./_core/voiceTranscription";
import { invokeLLM } from "./_core/llm";
import { TRPCError } from "@trpc/server";

// 默认 AI 提示词
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

如果某个维度没有相关信息，对应字段返回空字符串。只返回 JSON，不要其他内容。`;

export const yabanCommRouter = router({
  /** 获取某顾客的沟通记录列表（按时间倒序） */
  list: protectedProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const [rows] = await (conn as any).execute(
        `SELECT id, customer_id, record_type, raw_text, audio_url,
                summary_demand, summary_key_points, summary_followup, summary_remark,
                ai_generated, operator_id, operator_name, comm_at, created_at
         FROM yaban_comm_record
         WHERE tenant_id = ? AND customer_id = ?
         ORDER BY comm_at DESC`,
        [TENANT_ID, input.customerId]
      );
      return { records: rows as any[] };
    }),

  /** 创建沟通记录（手动录入） */
  create: protectedProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
      recordType: z.enum(['voice', 'text', 'manual']).default('manual'),
      rawText: z.string().optional(),
      audioUrl: z.string().optional(),
      summaryDemand: z.string().optional(),
      summaryKeyPoints: z.string().optional(),
      summaryFollowup: z.string().optional(),
      summaryRemark: z.string().optional(),
      aiGenerated: z.boolean().default(false),
      commAt: z.string().optional(), // ISO 日期字符串
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const operatorName = (ctx.user as any).name || (ctx.user as any).username || '';
      const commAt = input.commAt ? new Date(input.commAt) : new Date();
      const [result] = await (conn as any).execute(
        `INSERT INTO yaban_comm_record
          (tenant_id, customer_id, record_type, raw_text, audio_url,
           summary_demand, summary_key_points, summary_followup, summary_remark,
           ai_generated, operator_id, operator_name, comm_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          TENANT_ID, input.customerId, input.recordType,
          input.rawText || null, input.audioUrl || null,
          input.summaryDemand || null, input.summaryKeyPoints || null,
          input.summaryFollowup || null, input.summaryRemark || null,
          input.aiGenerated ? 1 : 0,
          ctx.user.id, operatorName, commAt,
        ]
      );
      return { id: (result as any).insertId, success: true };
    }),

  /** 更新沟通记录 */
  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      summaryDemand: z.string().optional(),
      summaryKeyPoints: z.string().optional(),
      summaryFollowup: z.string().optional(),
      summaryRemark: z.string().optional(),
      rawText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `UPDATE yaban_comm_record
         SET summary_demand = ?, summary_key_points = ?, summary_followup = ?, summary_remark = ?,
             raw_text = COALESCE(?, raw_text), updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [
          input.summaryDemand || null, input.summaryKeyPoints || null,
          input.summaryFollowup || null, input.summaryRemark || null,
          input.rawText || null, input.id, TENANT_ID,
        ]
      );
      return { success: true };
    }),

  /** 删除沟通记录 */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `DELETE FROM yaban_comm_record WHERE id = ? AND tenant_id = ?`,
        [input.id, TENANT_ID]
      );
      return { success: true };
    }),

  /**
   * AI 语音秘书：接收 base64 音频，调用 Whisper 转写，再用 DeepSeek 提取摘要
   * 前端将多段录音合并为一个 webm/mp4 blob，转 base64 后传入
   */
  analyzeVoice: protectedProcedure
    .input(z.object({
      customerId: z.number().int().positive(),
      audioBase64: z.string(), // data:audio/webm;base64,xxx 或纯 base64
      mimeType: z.string().default('audio/webm'),
    }))
    .mutation(async ({ ctx, input }) => {
      const TENANT_ID = await resolveTenantId(ctx);

      // Step 1: 上传音频到 COS，获取 URL
      let audioUrl: string | null = null;
      try {
        const { uploadFileToCOS } = await import('./cos-upload');
        audioUrl = await uploadFileToCOS(
          input.audioBase64,
          'yaban-voice-records',
          `comm_${TENANT_ID}_${input.customerId}_${Date.now()}.webm`,
          input.mimeType
        );
      } catch (e) {
        console.error('[AI语音秘书] 音频上传失败:', e);
        // 上传失败不阻断流程，继续转写
      }

      // Step 2: 调用 Whisper 转写
      const transcribeResult = await transcribeAudio({
        audioUrl: audioUrl || `data:${input.mimeType};base64,${input.audioBase64.replace(/^data:[^;]+;base64,/, '')}`,
        mimeType: input.mimeType as any,
        language: 'zh',
        prompt: '这是一段牙科诊所的客户沟通录音，包含客户诉求和员工建议。',
      });

      if ('error' in transcribeResult) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `语音转写失败：${transcribeResult.error}`,
        });
      }

      const rawText = transcribeResult.text;

      // Step 3: 获取 AI 提示词（优先使用院长自定义，否则用默认）
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
        console.error('[AI语音秘书] 获取提示词失败，使用默认:', e);
      }

      // Step 4: 调用 DeepSeek 提取摘要
      let summaryDemand = '';
      let summaryKeyPoints = '';
      let summaryFollowup = '';
      let summaryRemark = '';

      try {
        const llmResult = await invokeLLM({
          messages: [
            { role: 'system', content: promptContent },
            { role: 'user', content: `对话内容如下：\n\n${rawText}` },
          ],
          featureKey: 'yaban_comm_summary',
          userId: ctx.user.id,
        });

        if (llmResult.content) {
          const jsonStr = (llmResult.content as string).replace(/```json\n?|\n?```/g, '').trim();
          const parsed = JSON.parse(jsonStr);
          summaryDemand = parsed.demand || '';
          summaryKeyPoints = parsed.keyPoints || '';
          summaryFollowup = parsed.followup || '';
          summaryRemark = parsed.remark || '';
        }
      } catch (e) {
        console.error('[AI语音秘书] AI摘要提取失败:', e);
        // AI 失败不阻断，返回原始转写文字，让用户手动填写
      }

      return {
        rawText,
        audioUrl,
        summaryDemand,
        summaryKeyPoints,
        summaryFollowup,
        summaryRemark,
      };
    }),

  /** 获取 AI 提示词配置 */
  getPromptConfig: protectedProcedure
    .input(z.object({ promptKey: z.string() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const [rows] = await (conn as any).execute(
        `SELECT prompt_content, description, updated_at FROM yaban_ai_prompt_config
         WHERE tenant_id = ? AND prompt_key = ? LIMIT 1`,
        [TENANT_ID, input.promptKey]
      );
      if ((rows as any[]).length === 0) {
        // 返回默认提示词
        return {
          promptContent: DEFAULT_COMM_PROMPT,
          description: '沟通记录 AI 摘要提示词',
          isDefault: true,
        };
      }
      return {
        promptContent: (rows as any[])[0].prompt_content,
        description: (rows as any[])[0].description || '',
        isDefault: false,
      };
    }),

  /** 保存 AI 提示词配置 */
  savePromptConfig: protectedProcedure
    .input(z.object({
      promptKey: z.string(),
      promptContent: z.string().min(10),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `INSERT INTO yaban_ai_prompt_config (tenant_id, prompt_key, prompt_content, description, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           prompt_content = VALUES(prompt_content),
           description = VALUES(description),
           updated_by = VALUES(updated_by),
           updated_at = NOW()`,
        [TENANT_ID, input.promptKey, input.promptContent, input.description || null, ctx.user.id]
      );
      return { success: true };
    }),

  /** 列出所有 AI 提示词配置（供前端展示） */
  listPrompts: protectedProcedure
    .input(z.object({ tenantId: z.number().int().optional() }))
    .query(async ({ ctx }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      const [rows] = await (conn as any).execute(
        `SELECT prompt_key, prompt_content, updated_at FROM yaban_ai_prompt_config WHERE tenant_id = ?`,
        [TENANT_ID]
      );
      return { prompts: rows as any[] };
    }),

  /** 保存单个 AI 提示词（前端 YabanAIPrompts 使用） */
  savePrompt: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().optional(),
      promptKey: z.string(),
      promptContent: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `INSERT INTO yaban_ai_prompt_config (tenant_id, prompt_key, prompt_content, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           prompt_content = VALUES(prompt_content),
           updated_by = VALUES(updated_by),
           updated_at = NOW()`,
        [TENANT_ID, input.promptKey, input.promptContent, ctx.user.id]
      );
      return { success: true };
    }),

  /** 重置 AI 提示词为默认值 */
  resetPromptConfig: protectedProcedure
    .input(z.object({ promptKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const TENANT_ID = await resolveTenantId(ctx);
      await (conn as any).execute(
        `DELETE FROM yaban_ai_prompt_config WHERE tenant_id = ? AND prompt_key = ?`,
        [TENANT_ID, input.promptKey]
      );
      return { success: true, defaultPrompt: DEFAULT_COMM_PROMPT };
    }),
});
