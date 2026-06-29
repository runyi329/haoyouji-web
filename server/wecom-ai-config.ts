/**
 * wecom-ai-config.ts
 * AI 模型全局配置模块
 *
 * 功能：
 * 1. 从数据库读取/保存 AI 模型配置（use_case -> provider/model/key/base）
 * 2. 提供 callAI(useCase, messages) 统一调用入口，自动路由到对应模型
 * 3. 提供 callAIVision(imageBase64, prompt) 图片识别调用
 *
 * use_case 枚举（7个独立场景）：
 *   chat_reply   - 分身对话回复（主流程，影响客户体验）
 *   rule_reply   - 规则触发回复（特定关键词触发专属规则）
 *   chat_score   - 对话质量评分（后台自动打星，建议用免费模型）
 *   ai_organize  - AI辅助整理（大白话→提炼指令+知识库条目）
 *   ai_analyze   - AI辅助分析指令（分析放哪个分类）
 *   image_ocr    - 图片识别（拍照上传，必须用视觉模型）
 *   embedding    - 向量语义检索（必须用embedding模型）
 */

import { getDbConnection } from "./db";

// -------------------------------------------------------
// 用途枚举
// -------------------------------------------------------
export type UseCase =
  | "chat_reply"
  | "rule_reply"
  | "chat_score"
  | "ai_organize"
  | "ai_analyze"
  | "image_ocr"
  | "embedding"
  | "voice_asr"  // 语音识别（Whisper/forgeApi）
  | "chat_reply_fallback";  // 分身对话回复兜底模型（主模型失败时自动切换）

// -------------------------------------------------------
// 模型选项（供前端下拉框使用，含价格说明）
// -------------------------------------------------------
export interface ModelOption {
  provider: string;
  model_name: string;
  label: string;
  price_note: string;
  api_base: string;
  supports_vision: boolean;
  supports_embedding: boolean;
  category: "chat" | "vision" | "embedding";  // 模型分类
}

// use_case 元数据（中文名称、说明、分类）
export const USE_CASE_META: Record<string, { label: string; desc: string; category: "chat" | "vision" | "embedding" }> = {
  chat_reply:  { label: "分身对话回复",     desc: "分身自动回复客户消息，影响客户体验，建议用质量较好的模型",  category: "chat" },
  chat_reply_fallback: { label: "分身对话回复（兜底）", desc: "主模型失败时自动切换，建议选永久免费模型（如智谱GLM-4-Flash）", category: "chat" },
  rule_reply:  { label: "规则触发回复",     desc: "客户触发特定关键词时的专属规则回复",                    category: "chat" },
  chat_score:  { label: "对话质量评分",     desc: "后台自动给每条对话打星，建议用免费模型",                category: "chat" },
  ai_organize: { label: "AI 辅助整理",       desc: "大白话输入→自动提炼指令+知识库条目，管理员操作",        category: "chat" },
  ai_analyze:  { label: "AI 辅助分析指令",   desc: "分析新增指令应放哪个分类，管理员操作",                    category: "chat" },
  image_ocr:   { label: "图片识别",           desc: "拍照上传图片→自动识别内容，必须选具备视觉能力的模型",   category: "vision" },
  embedding:   { label: "向量语义检索",     desc: "知识库语义检索和查重，必须选 embedding 模型",             category: "embedding" },
  voice_asr:   { label: "语音识别",           desc: "客户发送语音消息时自动转文字，使用 Manus forgeApi（Whisper）",      category: "chat" },
};

export const MODEL_OPTIONS: ModelOption[] = [
  // ===== 腾讯混元 - 对话模型 =====
  {
    provider: "hunyuan",
    model_name: "hunyuan-lite",
    label: "混元 Lite（永久免费）",
    price_note: "永久免费，适合日常对话和文字分析，推荐用于评分/分析",
    api_base: "https://api.hunyuan.cloud.tencent.com/v1",
    supports_vision: false,
    supports_embedding: false,
    category: "chat",
  },
  {
    provider: "hunyuan",
    model_name: "hunyuan-turbo-s",
    label: "混元 TurboS（输入¥0.8/百万）",
    price_note: "输入¥0.8/百万token，输出¥2/百万token，旗舰轻量版",
    api_base: "https://api.hunyuan.cloud.tencent.com/v1",
    supports_vision: false,
    supports_embedding: false,
    category: "chat",
  },
  {
    provider: "hunyuan",
    model_name: "hunyuan-turbo",
    label: "混元 Turbo（输入¥2.4/百万）",
    price_note: "输入¥2.4/百万token，输出¥9.6/百万token，高质量旗舰版",
    api_base: "https://api.hunyuan.cloud.tencent.com/v1",
    supports_vision: false,
    supports_embedding: false,
    category: "chat",
  },
  {
    provider: "hunyuan",
    model_name: "hunyuan-pro",
    label: "混元 Pro（输入¥4/百万）",
    price_note: "输入¥4/百万token，输出¥16/百万token，最强旗舰版",
    api_base: "https://api.hunyuan.cloud.tencent.com/v1",
    supports_vision: false,
    supports_embedding: false,
    category: "chat",
  },
  // ===== 智谱 GLM - 对话模型 =====
  {
    provider: "zhipu",
    model_name: "glm-4-flash",
    label: "智谱 GLM-4-Flash（永久免费）",
    price_note: "永久免费，无限量，适合兜底场景",
    api_base: "https://open.bigmodel.cn/api/paas/v4",
    supports_vision: false,
    supports_embedding: false,
    category: "chat",
  },
  {
    provider: "zhipu",
    model_name: "glm-4-air",
    label: "智谱 GLM-4-Air（输入¥1/百万）",
    price_note: "输入¥1/百万token，输出¥1/百万token，高性价比",
    api_base: "https://open.bigmodel.cn/api/paas/v4",
    supports_vision: false,
    supports_embedding: false,
    category: "chat",
  },
  // ===== DeepSeek - 对话模型 =====
  {
    provider: "deepseek",
    model_name: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash（输入¥2/百万）",
    price_note: "输入¥2/百万token，输出¥8/百万token（缓存命中¥0.1/百万）",
    api_base: "https://api.deepseek.com/v1",
    supports_vision: false,
    supports_embedding: false,
    category: "chat",
  },
  {
    provider: "deepseek",
    model_name: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro（输入¥4/百万）",
    price_note: "输入¥4/百万token，输出¥16/百万token，带深度思维链",
    api_base: "https://api.deepseek.com/v1",
    supports_vision: false,
    supports_embedding: false,
    category: "chat",
  },
  // ===== 腾讯混元 - 视觉模型（仅 image_ocr 可选）=====
  {
    provider: "hunyuan",
    model_name: "hunyuan-turbos-vision",
    label: "混元 TurboS-Vision（¥3/百万，推荐）",
    price_note: "输入+输出各¥3/百万token，推荐图片识别用",
    api_base: "https://api.hunyuan.cloud.tencent.com/v1",
    supports_vision: true,
    supports_embedding: false,
    category: "vision",
  },
  {
    provider: "hunyuan",
    model_name: "hunyuan-vision",
    label: "混元 Vision（¥18/百万）",
    price_note: "输入+输出各¥18/百万token，高精度视觉模型",
    api_base: "https://api.hunyuan.cloud.tencent.com/v1",
    supports_vision: true,
    supports_embedding: false,
    category: "vision",
  },
  // ===== 腾讯混元 - Embedding（仅 embedding 可选）=====
  {
    provider: "hunyuan",
    model_name: "hunyuan-embedding",
    label: "混元 Embedding（¥0.7/百万，推荐）",
    price_note: "¥0.7/百万token，1024维向量",
    api_base: "https://api.hunyuan.cloud.tencent.com/v1",
    supports_vision: false,
    supports_embedding: true,
    category: "embedding",
  },
  // ===== Manus forgeApi - 语音识别（仅 voice_asr 可选）=====
  {
    provider: "manus",
    model_name: "whisper-1",
    label: "Manus Whisper（内置语音识别）",
    price_note: "包含在 Manus 平台服务费用内，无额外计费，使用 BUILT_IN_FORGE_API_KEY",
    api_base: "",  // 自动读取 ENV.forgeApiUrl
    supports_vision: false,
    supports_embedding: false,
    category: "chat",
  },
];

// -------------------------------------------------------
// 配置行类型
// -------------------------------------------------------
export interface AIModelConfig {
  use_case: UseCase;
  label: string;
  provider: string;
  model_name: string;
  api_key: string;
  api_base: string;
  note: string;
}

// -------------------------------------------------------
// 内存缓存（60秒 TTL）
// -------------------------------------------------------
let configCache: Map<UseCase, AIModelConfig> | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

// 各场景的默认配置（数据库没有时自动 INSERT）
const DEFAULT_CONFIGS: Record<string, { provider: string; model_name: string; api_key: string; api_base: string }> = {
  chat_reply:  { provider: "hunyuan",  model_name: "hunyuan-turbo-s",        api_key: "", api_base: "https://api.hunyuan.cloud.tencent.com/v1" },
  rule_reply:  { provider: "hunyuan",  model_name: "hunyuan-turbo-s",        api_key: "", api_base: "https://api.hunyuan.cloud.tencent.com/v1" },
  chat_score:  { provider: "hunyuan",  model_name: "hunyuan-lite",           api_key: "", api_base: "https://api.hunyuan.cloud.tencent.com/v1" },
  ai_organize: { provider: "hunyuan",  model_name: "hunyuan-turbo-s",        api_key: "", api_base: "https://api.hunyuan.cloud.tencent.com/v1" },
  ai_analyze:  { provider: "hunyuan",  model_name: "hunyuan-lite",           api_key: "", api_base: "https://api.hunyuan.cloud.tencent.com/v1" },
  image_ocr:   { provider: "hunyuan",  model_name: "hunyuan-turbos-vision",  api_key: "", api_base: "https://api.hunyuan.cloud.tencent.com/v1" },
  embedding:   { provider: "hunyuan",  model_name: "hunyuan-embedding",      api_key: "", api_base: "https://api.hunyuan.cloud.tencent.com/v1" },
  voice_asr:   { provider: "manus",    model_name: "whisper-1",              api_key: "", api_base: "" },
  chat_reply_fallback: { provider: "zhipu", model_name: "glm-4-flash", api_key: "", api_base: "https://open.bigmodel.cn/api/paas/v4" },
};

export async function getAIConfigs(): Promise<Map<UseCase, AIModelConfig>> {
  if (configCache && Date.now() - cacheTime < CACHE_TTL) return configCache;
  const conn = await getDbConnection();
  const [rows] = await (conn as any).execute(
    "SELECT use_case, label, provider, model_name, api_key, api_base, note FROM wecom_ai_model_config ORDER BY id"
  ) as any[];
  const map = new Map<UseCase, AIModelConfig>();
  for (const row of rows) {
    map.set(row.use_case as UseCase, row as AIModelConfig);
  }
  // 补全：对 USE_CASE_META 里定义但数据库里没有的场景，自动 INSERT 默认配置
  const missingCases = Object.keys(USE_CASE_META).filter(uc => !map.has(uc as UseCase));
  for (const uc of missingCases) {
    const def = DEFAULT_CONFIGS[uc] || { provider: "", model_name: "", api_key: "", api_base: "" };
    const meta = USE_CASE_META[uc];
    try {
      await (conn as any).execute(
        `INSERT IGNORE INTO wecom_ai_model_config (use_case, label, provider, model_name, api_key, api_base, note)
         VALUES (?, ?, ?, ?, ?, ?, '')`,
        [uc, meta.label, def.provider, def.model_name, def.api_key, def.api_base]
      );
      map.set(uc as UseCase, {
        use_case: uc as UseCase,
        label: meta.label,
        provider: def.provider,
        model_name: def.model_name,
        api_key: def.api_key,
        api_base: def.api_base,
        note: "",
      });
    } catch (_) { /* 忽略，不影响主流程 */ }
  }
  configCache = map;
  cacheTime = Date.now();
  return map;
}

export async function getAIConfig(useCase: UseCase): Promise<AIModelConfig | null> {
  const map = await getAIConfigs();
  return map.get(useCase) ?? null;
}

/** 获取 chat_reply 的兜底配置（api_key 有值才返回） */
export async function getAIFallbackConfig(): Promise<AIModelConfig | null> {
  const map = await getAIConfigs();
  const cfg = map.get("chat_reply_fallback") ?? null;
  if (!cfg || !cfg.api_key) return null;
  return cfg;
}

/** 保存单条配置，清空缓存 */
export async function saveAIConfig(cfg: Partial<AIModelConfig> & { use_case: UseCase }): Promise<void> {
  const conn = await getDbConnection();
  await (conn as any).execute(
    `INSERT INTO wecom_ai_model_config (use_case, provider, model_name, api_key, api_base, note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       provider=VALUES(provider), model_name=VALUES(model_name),
       api_key=VALUES(api_key), api_base=VALUES(api_base), note=VALUES(note)`,
    [cfg.use_case, cfg.provider ?? "", cfg.model_name ?? "", cfg.api_key ?? "", cfg.api_base ?? "", cfg.note ?? ""]
  );
  configCache = null;
}

// -------------------------------------------------------
// 统一 AI 文字调用
// -------------------------------------------------------
export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICallResult {
  text: string;
  model: string;
  provider: string;
}

export async function callAI(
  useCase: UseCase,
  messages: AIMessage[],
  maxTokens = 2000
): Promise<AICallResult> {
  const cfg = await getAIConfig(useCase);
  if (!cfg) throw new Error(`AI配置未找到: ${useCase}`);
  if (!cfg.api_key) throw new Error(`AI配置缺少API Key: ${useCase}`);

  const resp = await fetch(`${cfg.api_base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.api_key}`,
    },
    body: JSON.stringify({
      model: cfg.model_name,
      messages,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[callAI] ${useCase} 调用失败 (${resp.status}):`, errText.substring(0, 300));
    throw new Error(`AI调用失败(${resp.status}): ${errText.substring(0, 100)}`);
  }

  const data = await resp.json() as any;
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("AI返回内容为空");
  const inputTok = data?.usage?.prompt_tokens ?? 0;
  const outputTok = data?.usage?.completion_tokens ?? 0;
  // 异步记录用量（不阻塞主流程）
  logApiUsage({ use_case: useCase, provider: cfg.provider, model_name: cfg.model_name, input_tokens: inputTok, output_tokens: outputTok }).catch(() => {});
  return { text, model: cfg.model_name, provider: cfg.provider };
}

// -------------------------------------------------------
// 图片识别调用（自动读取 image_ocr 配置）
// -------------------------------------------------------
export async function callAIVision(
  imageBase64: string,
  prompt = "请详细描述这张图片中的所有内容，包括文字、数字、表格、产品信息等。用中文回答，尽量完整保留原文内容。",
  maxTokens = 2000
): Promise<AICallResult> {
  const cfg = await getAIConfig("image_ocr");
  if (!cfg) throw new Error("图片识别AI配置未找到");
  if (!cfg.api_key) throw new Error("图片识别AI配置缺少API Key");

  const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

  const resp = await fetch(`${cfg.api_base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.api_key}`,
    },
    body: JSON.stringify({
      model: cfg.model_name,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: prompt },
        ],
      }],
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[callAIVision] 图片识别失败 (${resp.status}):`, errText.substring(0, 300));
    throw new Error(`图片识别失败(${resp.status}): ${errText.substring(0, 100)}`);
  }

  const data = await resp.json() as any;
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("图片识别返回内容为空");
  const inputTokens = data?.usage?.prompt_tokens ?? 0;
  const outputTokens = data?.usage?.completion_tokens ?? 0;
  // 异步记录用量（不阻塞主流程）
  logApiUsage({ use_case: "image_ocr", provider: cfg.provider, model_name: cfg.model_name, input_tokens: inputTokens, output_tokens: outputTokens }).catch(() => {});
  return { text, model: cfg.model_name, provider: cfg.provider };
}

// -------------------------------------------------------
// API 用量日志（异步写入，不阻塞主流程）
// -------------------------------------------------------
export interface ApiUsageEntry {
  use_case: string;
  provider: string;
  model_name: string;
  channel_id?: number | null;
  input_tokens?: number;
  output_tokens?: number;
  duration_sec?: number;
  cost_unit?: string;
  extra?: string;
}

export async function logApiUsage(entry: ApiUsageEntry): Promise<void> {
  try {
    const conn = await getDbConnection();
    if (!conn) return;
    await (conn as any).execute(
      `INSERT INTO wecom_api_usage_log
       (use_case, provider, model_name, channel_id, input_tokens, output_tokens, duration_sec, cost_unit, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.use_case,
        entry.provider ?? "",
        entry.model_name ?? "",
        entry.channel_id ?? null,
        entry.input_tokens ?? 0,
        entry.output_tokens ?? 0,
        entry.duration_sec ?? 0,
        entry.cost_unit ?? "token",
        entry.extra ?? null,
      ]
    );
  } catch (e) {
    // 用量日志失败不影响主流程
    console.error("[logApiUsage] 写入失败:", e);
  }
}

// -------------------------------------------------------
// 语音识别调用（自动读取 voice_asr 配置，支持换 key）
// -------------------------------------------------------
import { ENV } from "./_core/env";

export interface VoiceAsrResult {
  text: string;
  duration_sec: number;
  language: string;
  provider: string;
  model: string;
}

/**
 * 语音识别：传入音频 Buffer（AMR/MP3/WAV），返回识别文字
 * 自动读取 voice_asr 配置：
 *   - provider=manus 时：使用 ENV.forgeApiUrl + ENV.forgeApiKey（内置 Whisper）
 *   - 其他 provider 时：使用配置的 api_base + api_key（展留未来换服务商）
 */
export async function callAIVoice(
  audioBuffer: Buffer,
  mimeType = "audio/amr",
  channelId?: number | null
): Promise<VoiceAsrResult> {
  const cfg = await getAIConfig("voice_asr");
  const provider = cfg?.provider ?? "manus";
  const modelName = cfg?.model_name ?? "whisper-1";

  // 确定调用地址和 key
  let apiBase: string;
  let apiKey: string;
  if (provider === "manus" || !cfg?.api_base) {
    // 优先使用系统注入的 OPENAI_API_BASE（llm-proxy），去掉末尾 /v1 避免拼接时重复
    // BUILT_IN_FORGE_API_URL 在 .env 中路径不正确（/api/forge 404），改用 llm-proxy
    const openaiBase = process.env.OPENAI_API_BASE ?? ENV.forgeApiUrl ?? "";
    apiBase = openaiBase.replace(/\/v1\/?$/, "").replace(/\/$/, "");
    // BUILT_IN_FORGE_API_KEY 在 .env 中是字面量 "${OPENAI_API_KEY}"（未展开），改用系统注入的真实 key
    apiKey = process.env.OPENAI_API_KEY ?? ENV.forgeApiKey ?? "";
  } else {
    apiBase = cfg.api_base.replace(/\/$/, "");
    apiKey = cfg.api_key;
  }

  if (!apiBase || !apiKey) {
    throw new Error("语音识别服务未配置（请在管理平台配置 voice_asr 或设置 BUILT_IN_FORGE_API_KEY）");
  }

  // 构建 multipart form
  const formData = new FormData();
  // iOS Safari 录音时 MIME type 为 "audio/webm; codecs=opus"，但实际内部是 mp4 容器格式，
  // 直接用 webm 后缀会导致 Whisper 报 "File is corrupted"，必须改为 mp4。
  // 判断方式：如果包含 "webm" 且包含 "opus" （iOS 特征），强制用 mp4。
  const isIosWebm = mimeType.includes("webm") && mimeType.includes("opus");
  const ext = mimeType.includes("amr") ? "amr"
    : mimeType.includes("mp3") || mimeType.includes("mpeg") ? "mp3"
    : mimeType.includes("wav") ? "wav"
    : mimeType.includes("mp4") || mimeType.includes("m4a") ? "mp4"
    : mimeType.includes("ogg") ? "ogg"
    : isIosWebm ? "mp4"  // iOS 的 webm+opus 实际是 mp4 容器，用 mp4 后缀
    : mimeType.includes("webm") ? "webm"
    : mimeType.includes("flac") ? "flac"
    : "mp4";
  // 对应地，如果是 iOS webm，把 blob 的 type 也改为 audio/mp4
  const effectiveMime = isIosWebm ? "audio/mp4" : mimeType;
  const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: effectiveMime });
  formData.append("file", audioBlob, `voice.${ext}`);
  formData.append("model", modelName);
  formData.append("response_format", "verbose_json");
  formData.append("prompt", "请将用户语音转写为文字，保持原意不要翻译");

    const transcribeUrl = `${apiBase}/v1/audio/transcriptions`;
  console.log(`[callAIVoice] 调用语音识别: url=${transcribeUrl}, ext=${ext}, mimeType=${mimeType}, size=${audioBuffer.length}bytes, keyPrefix=${(apiKey || "").substring(0, 8)}`);
  const resp = await fetch(transcribeUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "Accept-Encoding": "identity" },
    body: formData,
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error(`[callAIVoice] 语音识别失败 status=${resp.status}, url=${transcribeUrl}, body=${errText.substring(0, 200)}`);
    throw new Error(`语音识别失败(${resp.status}): ${errText.substring(0, 100)}`);
  }

  const result = await resp.json() as any;
  const text = result?.text ?? "";
  const durationSec: number = result?.duration ?? 0;
  const language: string = result?.language ?? "zh";

  // 异步记录用量
  logApiUsage({
    use_case: "voice_asr",
    provider,
    model_name: modelName,
    channel_id: channelId ?? null,
    duration_sec: durationSec,
    cost_unit: "second",
    extra: JSON.stringify({ language }),
  }).catch(() => {});

  return { text, duration_sec: durationSec, language, provider, model: modelName };
}
