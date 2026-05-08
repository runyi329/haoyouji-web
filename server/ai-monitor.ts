/**
 * AI 用量监控模块
 * - ai_usage_logs: 记录每次 LLM 调用的 token 消耗
 * - ai_feature_switches: 控制每个功能是否允许调用 AI
 */
import { getDbConnection } from "./db";

// ==================== 功能名称映射 ====================
export const AI_FEATURE_LABELS: Record<string, string> = {
  "crypto_ai_analysis":       "加密货币 AI 分析",
  "generate_story":           "儿童故事生成",
  "recognize_business_card":  "名片识别",
  "recognize_address":        "地址识别",
  "recognize_bank":           "银行信息识别",
  "ai_insights":              "客户意见 AI 洞察",
  "recognize_qq_trade":       "QQ 交易图识别",
  "analyze_skin":             "皮肤分析",
  "gold_ai_analysis":         "黄金 AI 分析",
  "eth_position_analyze":     "ETH 持仓退出分析",
  "diet_analysis":            "饮食健康分析",
  "lottery_analysis":         "彩票分析",
  "okx_trader_chat":          "OKX 交易 AI 对话",
  "prediction_analysis":      "预测市场分析",
  "bank_account_parser":      "银行流水解析",
  "ocr_recognize":            "通用 OCR 识别",
};

// ==================== 建表（首次启动自动执行）====================
export async function initAIMonitorTables(): Promise<void> {
  try {
    const conn = await getDbConnection();
    if (!conn) return;

    await (conn as any).execute(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        feature_key VARCHAR(100) NOT NULL COMMENT '功能标识',
        feature_label VARCHAR(200) DEFAULT '' COMMENT '功能名称',
        model VARCHAR(100) DEFAULT '' COMMENT '模型名称',
        prompt_tokens INT DEFAULT 0 COMMENT '输入 token 数',
        completion_tokens INT DEFAULT 0 COMMENT '输出 token 数',
        total_tokens INT DEFAULT 0 COMMENT '总 token 数',
        cost_usd DECIMAL(10,6) DEFAULT 0 COMMENT '估算费用（美元）',
        duration_ms INT DEFAULT 0 COMMENT '耗时（毫秒）',
        success TINYINT(1) DEFAULT 1 COMMENT '是否成功',
        error_msg TEXT DEFAULT NULL COMMENT '错误信息',
        user_id INT DEFAULT NULL COMMENT '触发用户ID',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_feature_key (feature_key),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 调用日志'
    `);

    await (conn as any).execute(`
      CREATE TABLE IF NOT EXISTS ai_feature_switches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        feature_key VARCHAR(100) NOT NULL UNIQUE COMMENT '功能标识',
        feature_label VARCHAR(200) DEFAULT '' COMMENT '功能名称',
        enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_feature_key (feature_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 功能开关'
    `);

    // 初始化所有功能开关（不存在则插入，存在则跳过）
    for (const [key, label] of Object.entries(AI_FEATURE_LABELS)) {
      await (conn as any).execute(
        `INSERT IGNORE INTO ai_feature_switches (feature_key, feature_label, enabled) VALUES (?, ?, 1)`,
        [key, label]
      );
    }

    console.log("[AI Monitor] 表初始化完成");
  } catch (err) {
    console.warn("[AI Monitor] 建表失败（不影响主流程）:", err);
  }
}

// ==================== 检查功能开关 ====================
// 缓存开关状态，避免每次调用都查数据库（60秒过期）
const switchCache: Map<string, { enabled: boolean; expireAt: number }> = new Map();

export async function isAIFeatureEnabled(featureKey: string): Promise<boolean> {
  // 检查缓存
  const cached = switchCache.get(featureKey);
  if (cached && Date.now() < cached.expireAt) {
    return cached.enabled;
  }

  try {
    const conn = await getDbConnection();
    if (!conn) return true; // 数据库不可用时默认放行

    const [rows] = await (conn as any).execute(
      `SELECT enabled FROM ai_feature_switches WHERE feature_key = ? LIMIT 1`,
      [featureKey]
    );
    const enabled = (rows as any[]).length === 0 ? true : !!(rows as any[])[0].enabled;
    
    // 写入缓存，60秒过期
    switchCache.set(featureKey, { enabled, expireAt: Date.now() + 60_000 });
    return enabled;
  } catch {
    return true; // 查询失败时默认放行
  }
}

// 清除指定功能的缓存（切换开关后调用）
export function clearSwitchCache(featureKey?: string) {
  if (featureKey) {
    switchCache.delete(featureKey);
  } else {
    switchCache.clear();
  }
}

// ==================== 写入调用日志 ====================
export async function logAIUsage(params: {
  featureKey: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  success?: boolean;
  errorMsg?: string;
  userId?: number;
}): Promise<void> {
  try {
    const conn = await getDbConnection();
    if (!conn) return;

    const {
      featureKey,
      model = "deepseek-chat",
      promptTokens = 0,
      completionTokens = 0,
      totalTokens = (promptTokens + completionTokens),
      durationMs = 0,
      success = true,
      errorMsg = null,
      userId = null,
    } = params;

    const featureLabel = AI_FEATURE_LABELS[featureKey] ?? featureKey;

    // DeepSeek 价格估算：输入 $0.14/M tokens，输出 $0.28/M tokens（deepseek-chat）
    const costUsd = (promptTokens * 0.00000014) + (completionTokens * 0.00000028);

    await (conn as any).execute(
      `INSERT INTO ai_usage_logs 
        (feature_key, feature_label, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, success, error_msg, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [featureKey, featureLabel, model, promptTokens, completionTokens, totalTokens, costUsd, durationMs, success ? 1 : 0, errorMsg, userId]
    );
  } catch (err) {
    // 日志写入失败不影响主流程
    console.warn("[AI Monitor] 写入日志失败:", err);
  }
}

// ==================== 查询接口 ====================

/** 获取所有功能开关状态 */
export async function getFeatureSwitches() {
  try {
    const conn = await getDbConnection();
    if (!conn) return [];
    const [rows] = await (conn as any).execute(
      `SELECT feature_key, feature_label, enabled, updated_at FROM ai_feature_switches ORDER BY feature_key`
    );
    return rows as Array<{ feature_key: string; feature_label: string; enabled: number; updated_at: string }>;
  } catch {
    return [];
  }
}

/** 切换功能开关 */
export async function toggleFeatureSwitch(featureKey: string, enabled: boolean): Promise<void> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库不可用");
  await (conn as any).execute(
    `UPDATE ai_feature_switches SET enabled = ? WHERE feature_key = ?`,
    [enabled ? 1 : 0, featureKey]
  );
  clearSwitchCache(featureKey);
}

/** 按功能分组统计 token 消耗（指定日期范围） */
export async function getUsageStats(startDate: string, endDate: string) {
  try {
    const conn = await getDbConnection();
    if (!conn) return [];
    const [rows] = await (conn as any).execute(
      `SELECT 
        feature_key,
        feature_label,
        COUNT(*) as call_count,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(cost_usd) as total_cost_usd,
        AVG(duration_ms) as avg_duration_ms,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count,
        MAX(created_at) as last_called_at
       FROM ai_usage_logs
       WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY feature_key, feature_label
       ORDER BY total_tokens DESC`,
      [startDate, endDate]
    );
    return rows as Array<{
      feature_key: string;
      feature_label: string;
      call_count: number;
      total_prompt_tokens: number;
      total_completion_tokens: number;
      total_tokens: number;
      total_cost_usd: number;
      avg_duration_ms: number;
      error_count: number;
      last_called_at: string;
    }>;
  } catch {
    return [];
  }
}

/** 获取每日汇总（折线图用） */
export async function getDailyStats(startDate: string, endDate: string) {
  try {
    const conn = await getDbConnection();
    if (!conn) return [];
    const [rows] = await (conn as any).execute(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as call_count,
        SUM(total_tokens) as total_tokens,
        SUM(cost_usd) as total_cost_usd
       FROM ai_usage_logs
       WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [startDate, endDate]
    );
    return rows as Array<{ date: string; call_count: number; total_tokens: number; total_cost_usd: number }>;
  } catch {
    return [];
  }
}
