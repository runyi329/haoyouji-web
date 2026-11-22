import { TRPCError } from '@trpc/server';
import { ENV } from './_core/env';
import type { Message } from './_core/llm';
import { getDbConnection } from './db';
import { isIP } from 'node:net';

const FEATURE = 'aj_invoice_review';
// 必须由服务器明确配置且在本项目实时目录确认能力；不硬编码或猜测可用模型。
type CatalogModel = {
  id: string; owned_by?: string; description?: string;
  pricing?: { input_per_1m_usd?: number; output_per_1m_usd?: number };
  capabilities?: { supports_vision?: boolean; supports_response_format_json_schema?: boolean;
    thinking_param?: string; thinking_example?: Record<string, unknown> };
};
let catalogCache: { base: string; key: string; until: number; models: CatalogModel[] } | null = null;

function provider() {
  // 只能使用该项目服务器的视觉服务授权；禁止拿沙箱 OPENAI 密钥或文本 DeepSeek 兜底。
  const key = ENV.forgeApiKey.trim();
  if (!key) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '发票照片识别尚未配置项目视觉服务；现有文本AI不能读取照片，请配置服务器视觉服务后使用。' });
  if (!ENV.forgeApiUrl.trim()) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '尚未配置项目视觉服务地址。' });
  let base = ENV.forgeApiUrl.trim().replace(/\/+$/, '');
  base = base.replace(/\/v1\/chat\/completions$/, '').replace(/\/v1$/, '');
  let url: URL;
  try { url = new URL(base); } catch { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '项目视觉服务地址配置无效。' }); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !publicHostname(url.hostname)) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '项目视觉服务必须使用无凭据参数的HTTPS地址。' });
  }
  return { base, key };
}

async function projectModels(base: string, key: string): Promise<CatalogModel[]> {
  if (catalogCache && catalogCache.base === base && catalogCache.key === key && catalogCache.until > Date.now()) return catalogCache.models;
  let response: Response;
  try {
    response = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  } catch { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '无法读取项目视觉模型目录，请检查服务器视觉服务配置后重试；尚未调用照片识别。' }); }
  if (!response.ok) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `项目视觉模型目录不可用（HTTP ${response.status}），请检查服务配置；尚未调用照片识别。` });
  let body: any;
  try { body = await response.json(); } catch { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '项目视觉模型目录返回格式无效；尚未调用照片识别。' }); }
  if (body?.error || !Array.isArray(body?.data)) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '项目视觉模型目录返回错误；尚未调用照片识别。' });
  const models = body.data.filter((model: any) => typeof model?.id === 'string') as CatalogModel[];
  catalogCache = { base, key, models, until: Date.now() + 300000 };
  return models;
}

async function logUsage(model: CatalogModel, userId: number, usage: any, durationMs: number, success: boolean, errorMsg: string | null) {
  try {
    const conn = await getDbConnection();
    if (!conn) return;
    const promptTokens = Number(usage?.prompt_tokens) || 0;
    const completionTokens = Number(usage?.completion_tokens) || 0;
    const prices = model.pricing ?? {};
    const cost = (promptTokens * (prices.input_per_1m_usd ?? 0) + completionTokens * (prices.output_per_1m_usd ?? 0)) / 1000000;
    // 不调用 initAIMonitorTables，不在此处产生DDL。统计失败不改变报销/归类事务结果。
    await conn.execute(`INSERT INTO ai_usage_logs
      (feature_key,feature_label,model,prompt_tokens,completion_tokens,total_tokens,cost_usd,duration_ms,success,error_msg,user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [FEATURE, '发票照片核对与归类', model.id, promptTokens, completionTokens,
        Number(usage?.total_tokens) || promptTokens + completionTokens, cost, durationMs, success ? 1 : 0, errorMsg, userId]);
  } catch { /* 不泄漏图片、密钥、提示词或服务原始错误到日志。 */ }
}

export async function invokeAJInvoiceVision(input: {
  messages: Message[]; schema: Record<string, unknown>; userId: number;
}): Promise<{ text: string; model: string }> {
  if (process.env.FAST_PREVIEW === 'true' || process.env.PREVIEW_READONLY === 'true') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '当前为只读热预览，不运行付费照片识别，也不保存或修改发票。' });
  }
  const { base, key } = provider();
  const modelId = process.env.AJ_INVOICE_VISION_MODEL?.trim();
  if (!modelId) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '尚未明确配置发票视觉模型，未调用识别。' });
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '无法验证发票AI功能开关，未调用识别。' });
  let switches: any;
  try { [switches] = await conn.execute('SELECT enabled FROM ai_feature_switches WHERE feature_key=? LIMIT 1', [FEATURE]); }
  catch { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '无法验证发票AI功能开关，请先完成管理员配置；未调用识别。' }); }
  if (!Array.isArray(switches) || !switches.length || Number(switches[0].enabled) !== 1) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '管理员尚未启用发票照片核对与归类功能。' });
  }
  const models = await projectModels(base, key);
  const model = models.find(value => value.id === modelId);
  if (!model) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `项目尚未提供发票识别模型 ${modelId}，请配置可用视觉模型；不会静默切换到文本模型。` });
  const caps = model.capabilities;
  if (caps?.supports_vision !== true || caps?.supports_response_format_json_schema !== true) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '配置的模型未确认同时支持照片和严格JSON输出，不能用于发票自动归类。' });
  }
  if (/superseded|shutdown|deprecated/i.test(model.description || '')) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '配置的视觉模型已被替代或将关闭，请配置可用的非退役模型。' });
  }
  for (const message of input.messages) if (Array.isArray(message.content)) for (const part of message.content) {
    if (part.type === 'image_url' && !isSafeAJVisionImageUrl(part.image_url.url)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '凭证必须来自管理员允许的上传存储，不能转交任意外部或内网URL。' });
    }
  }
  const payload: Record<string, unknown> = {
    model: modelId, messages: input.messages,
    response_format: { type: 'json_schema', json_schema: { name: 'aj_invoice_analysis', strict: true, schema: input.schema } },
  };
  const isGPT = model.owned_by === 'openai' || /^gpt-/.test(modelId);
  if (isGPT) {
    payload.max_completion_tokens = 6000;
  } else {
    payload.max_tokens = 16384;
    if (caps?.thinking_param === 'reasoning' && caps.thinking_example) payload.reasoning = caps.thinking_example;
    else if (caps?.thinking_param === 'thinking' && caps.thinking_example) payload.thinking = caps.thinking_example;
  }
  const started = Date.now();
  let usage: any;
  let success = false;
  let errorMsg: string | null = null;
  try {
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) {
      errorMsg = `视觉服务HTTP ${response.status}`;
      throw new TRPCError({ code: 'BAD_GATEWAY', message: `照片识别服务返回错误（HTTP ${response.status}），本次未自动审批，请稍后重试。` });
    }
    const result = await response.json() as any;
    usage = result?.usage;
    if (result?.error) {
      errorMsg = '视觉服务返回错误';
      throw new TRPCError({ code: 'BAD_GATEWAY', message: '照片识别服务返回错误，请检查模型或AI额度；本次不保存识别结果。' });
    }
    const choice = result?.choices?.[0];
    if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim() || choice.finish_reason !== 'stop') {
      errorMsg = '视觉服务结果为空或不完整';
      throw new TRPCError({ code: 'BAD_GATEWAY', message: '照片识别结果为空或不完整，请人工核对或重新识别；本次不保存不完整结果。' });
    }
    success = true;
    return { text: choice.message.content, model: modelId };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    errorMsg = '视觉服务超时或网络不可用';
    throw new TRPCError({ code: 'TIMEOUT', message: '照片识别超时或网络不可用，本次不保存过时结果；请稍后重试或人工处理。' });
  } finally { await logUsage(model, input.userId, usage, Date.now() - started, success, errorMsg); }
}

function publicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // 不接受IP文字或裸域名，避免各种IPv4编码、IPv6、内网和localhost别名。
  return !!host && !isIP(host) && host.includes('.') && !host.endsWith('.') &&
    !/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host);
}

/** 仅信任管理员配置的精确上传存储 HTTPS 前缀；空白名单默认禁用图像外带。
 * 白名单必须指向受控的静态存储路径，不可配置开放重定向或可解析至私网的域名。
 * 视觉供应商负责抓图，服务器不自行请求客户端URL、不携带项目凭据抓图。
 */
export function isSafeAJVisionImageUrl(value: string): boolean {
  if (!value || value.length > 12000 || /\s|[\u0000-\u001f\u007f\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port && url.port !== '443' || !publicHostname(url.hostname)) return false;
    if (/%(?:2f|5c|2e)/i.test(url.pathname)) return false;
    return (process.env.AJ_INVOICE_IMAGE_ALLOWED_PREFIXES || '').split(',').some(raw => {
      const entry = raw.trim();
      if (!entry) return false;
      try {
        const prefix = new URL(entry);
        if (prefix.protocol !== 'https:' || prefix.username || prefix.password || prefix.search || prefix.hash || !publicHostname(prefix.hostname)) return false;
        const path = prefix.pathname.endsWith('/') ? prefix.pathname : `${prefix.pathname}/`;
        return url.origin === prefix.origin && url.pathname.startsWith(path);
      } catch { return false; }
    });
  } catch { return false; }
}
