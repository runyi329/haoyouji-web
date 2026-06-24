/**
 * 企业微信 + Manus API 集成路由
 *
 * GET  /api/wecom/callback  -> 企业微信服务器验证（URL接入验证）
 * POST /api/wecom/callback  -> 接收企业微信用户消息，转发给 Manus API，回复结果
 *
 * 配置项（环境变量）：
 *   WECOM_CORP_ID         企业ID
 *   WECOM_AGENT_ID        自建应用AgentId
 *   WECOM_SECRET          自建应用Secret
 *   WECOM_TOKEN           接收消息Token
 *   WECOM_ENCODING_AES_KEY 接收消息EncodingAESKey（43位）
 *   MANUS_API_KEY         Manus API Key
 */

import { Router, Request, Response, text as expressText } from "express";
import crypto from "crypto";
import { parseStringPromise } from "xml2js";
import { getDbConnection } from "./db";
import {
  backfillEmbeddingAsync,
  searchKnowledgeSemantic,
  dedupCheckDb,
  buildItemEmbedText,
  isVectorEnabled,
  embedTexts,
  cosineSim,
  parseEmbedding,
  DEDUP_THRESHOLD_DUPLICATE,
  DEDUP_THRESHOLD_SIMILAR,
} from "./wecom-vector";
import { getUsdtCnyRate } from "./price-scanner";
import { getAIConfig, callAI, callAIVision, callAIVoice, logApiUsage, saveAIConfig, getAIConfigs, MODEL_OPTIONS, USE_CASE_META, type UseCase } from "./wecom-ai-config";
import { isAIFeatureEnabled } from "./ai-monitor";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";

const router = Router();

// -----------------------------------------------------------
// 配置常量
// -----------------------------------------------------------
const WECOM_TOKEN = process.env.WECOM_TOKEN || "pEhNzolV5wrJ7Xk7";
const WECOM_ENCODING_AES_KEY = process.env.WECOM_ENCODING_AES_KEY || "myX82WWfAVfunhJyaLrqIyZozz1q7f8hVx1t4rSDKAy";
const WECOM_CORP_ID = process.env.WECOM_CORP_ID || "wwbbaccf1da5f886d9";
const WECOM_AGENT_ID = process.env.WECOM_AGENT_ID || "1000002";
const WECOM_SECRET = process.env.WECOM_SECRET || "3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g";
// ⚠️  换 Manus 账号时，只需 3 步：
//   1. 修改服务器 .env 中的 MANUS_API_KEY 为新账号的 Key
//   2. 执行 SQL: TRUNCATE TABLE wecom_manus_sessions  （清空旧任务绑定）
//   3. pm2 restart haoyouji  （重启服务，新 Key 立即生效）
//   之后用户发消息会自动用新 Key 创建新任务，无需任何代码改动。
const MANUS_API_KEY = process.env.MANUS_API_KEY || "";
const MANUS_API_BASE = "https://api.manus.ai/v2";
if (!MANUS_API_KEY) {
  console.error("[Manus] ❌ MANUS_API_KEY 未配置！请在 .env 中设置 MANUS_API_KEY，然后重启服务。");
}
// 企微专用 DeepSeek Key，严格只读 WECOM_DEEPSEEK_API_KEY，不回退到通用 Key
// 其他模块（ai-search/company-reports/db-ai-assistant 等）读取 DEEPSEEK_API_KEY，两者完全隔离
const DEEPSEEK_API_KEY = process.env.WECOM_DEEPSEEK_API_KEY || "";
if (!DEEPSEEK_API_KEY) {
  console.warn("[WeCom] ⚠️  WECOM_DEEPSEEK_API_KEY 未配置！DeepSeek 模型将无法使用。");
}
const DEEPSEEK_API_BASE = "https://api.deepseek.com/v1";

// -----------------------------------------------------------
// 工具函数：SHA1 签名验证
// -----------------------------------------------------------
function computeSignature(token: string, timestamp: string, nonce: string, encrypt?: string): string {
  const arr = encrypt ? [token, timestamp, nonce, encrypt].sort() : [token, timestamp, nonce].sort();
  return crypto.createHash("sha1").update(arr.join("")).digest("hex");
}

// -----------------------------------------------------------
// 工具函数：企业微信消息解密（AES-256-CBC）
// -----------------------------------------------------------
function decryptWeCom(encryptedMsg: string): string {
  try {
    const aesKey = Buffer.from(WECOM_ENCODING_AES_KEY + "=", "base64");
    const iv = aesKey.slice(0, 16);
    const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
    decipher.setAutoPadding(false);
    let decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedMsg, "base64")), decipher.final()]);
    // 去除PKCS7填充
    const padLen = decrypted[decrypted.length - 1];
    decrypted = decrypted.slice(0, decrypted.length - padLen);
    // 前16字节为随机字符串，接下来4字节为消息长度（大端序）
    const msgLen = decrypted.readUInt32BE(16);
    const msgContent = decrypted.slice(20, 20 + msgLen).toString("utf8");
    return msgContent;
  } catch (e) {
    console.error("[WeCom] 解密失败:", e);
    return "";
  }
}

// -----------------------------------------------------------
// 工具函数：获取企业微信 access_token
// -----------------------------------------------------------
let _accessToken: string | null = null;
let _accessTokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (_accessToken && Date.now() < _accessTokenExpiry) {
    return _accessToken;
  }
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECOM_CORP_ID}&corpsecret=${WECOM_SECRET}`;
  const res = await fetch(url);
  const data = await res.json() as any;
  if (data.errcode !== 0) {
    throw new Error(`获取access_token失败: ${data.errmsg}`);
  }
  _accessToken = data.access_token;
  _accessTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return _accessToken!;
}

// -----------------------------------------------------------
// 工具函数：发送文字消息给企业微信用户
// -----------------------------------------------------------
async function sendWeComMessage(toUser: string, content: string): Promise<void> {
  try {
    const token = await getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`;
    const body = {
      touser: toUser,
      msgtype: "text",
      agentid: Number(WECOM_AGENT_ID),
      text: { content },
      safe: 0,
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    if (data.errcode !== 0) {
      console.error("[WeCom] 发送消息失败:", data.errmsg);
    } else {
      console.log(`[WeCom] 消息已发送给 ${toUser}: ${content.substring(0, 50)}...`);
    }
  } catch (e) {
    console.error("[WeCom] 发送消息异常:", e);
  }
}

// -----------------------------------------------------------
// 用户模型偏好（内存缓存 + 持久化到数据库）
// -----------------------------------------------------------
const userModelPrefs: Record<string, string> = {};
const MODEL_PROFILES: Record<string, { profile: string; label: string; emoji: string }> = {
  MODEL_MAX: { profile: "manus-1.6-max", label: "Max 模式（最强能力，适合复杂任务）", emoji: "🔴" },
  MODEL_NORMAL: { profile: "manus-1.6", label: "标准模式（平衡能力与速度）", emoji: "🟡" },
  MODEL_LITE: { profile: "manus-1.6-lite", label: "轻量模式（快速响应，省积分）", emoji: "🟢" },
  MODEL_DS_FLASH: { profile: "deepseek-chat", label: "DeepSeek 快速（高效对话）", emoji: "⚡" },
};

// -----------------------------------------------------------
// 计费公式硬编码（用于统计页面换算人民币）
// -----------------------------------------------------------
// Manus 积分价格：4000积分 = 148元，即 1积分 = 0.037元
const MANUS_CREDIT_PRICE = 0.037; // 元/积分

// DeepSeek 官方价格（元/百万token）
const DEEPSEEK_PRICING: Record<string, { inputMiss: number; inputHit: number; output: number }> = {
  'deepseek-v4-flash':         { inputMiss: 1,   inputHit: 0.1, output: 2 },
  'deepseek-v4-flash-thinking':{ inputMiss: 1,   inputHit: 0.1, output: 2 },
  'deepseek-v4-pro':           { inputMiss: 3,   inputHit: 0.3, output: 6 },
  'deepseek-v4-pro-thinking':  { inputMiss: 3,   inputHit: 0.3, output: 6 },
  'deepseek-chat':             { inputMiss: 1,   inputHit: 0.1, output: 2 }, // 兼容旧名，映射到 flash
};

/**
 * 计算 DeepSeek 费用（元）
 * @param model 模型名（如 deepseek-v4-flash）
 * @param inputMissTokens 缓存未命中输入token
 * @param inputHitTokens 缓存命中输入token
 * @param outputTokens 输出token
 */
function calcDeepSeekCost(model: string, inputMissTokens: number, inputHitTokens: number, outputTokens: number): number {
  const pricing = DEEPSEEK_PRICING[model] || DEEPSEEK_PRICING['deepseek-v4-flash'];
  const cost = (inputMissTokens * pricing.inputMiss + inputHitTokens * pricing.inputHit + outputTokens * pricing.output) / 1_000_000;
  return cost;
}

// DeepSeek 模型 profile 列表（用于判断是否走 DeepSeek 路径）
// 带 -thinking 后缀的表示开启思考模式（实际 API 调用时传入 thinking: { type: 'enabled' } 参数）
const DEEPSEEK_PROFILES = new Set([
  "deepseek-chat",
  "deepseek-v4-flash",
  "deepseek-v4-flash-thinking",
  "deepseek-v4-pro",
  "deepseek-v4-pro-thinking",
]);

async function getUserModel(userId: string): Promise<string> {
  // 内存缓存命中直接返回
  if (userModelPrefs[userId]) return userModelPrefs[userId];
  // 从数据库读取
  try {
    const conn = await getDbConnection();
    if (conn) {
      const [rows] = await (conn as any).execute(
        "SELECT model_pref FROM wecom_manus_sessions WHERE wecom_user_id = ? LIMIT 1",
        [userId]
      ) as any;
      if ((rows as any[]).length > 0 && (rows as any[])[0].model_pref) {
        const pref = (rows as any[])[0].model_pref;
        userModelPrefs[userId] = pref; // 写入内存缓存
        return pref;
      }
    }
  } catch (_) {}
  return "auto_route";
}

async function setUserModel(userId: string, profile: string): Promise<void> {
  userModelPrefs[userId] = profile; // 更新内存缓存
  try {
    const conn = await getDbConnection();
    if (conn) {
      await (conn as any).execute(
        "UPDATE wecom_manus_sessions SET model_pref = ? WHERE wecom_user_id = ?",
        [profile, userId]
      );
    }
  } catch (e) {
    console.error("[WeCom] 保存模型偏好失败:", e);
  }
}

async function getUserModelLabel(userId: string): Promise<string> {
  const profile = await getUserModel(userId);
  const entry = Object.values(MODEL_PROFILES).find(m => m.profile === profile);
  return entry?.label || profile;
}

// -----------------------------------------------------------
// 工具函数：查询积分消耗
// -----------------------------------------------------------
async function queryCreditsUsage(userId: string): Promise<string> {
  try {
    // 先从数据库获取当前用户的 task_id
    let userTaskId: string | null = null;
    try {
      const conn = await getDbConnection();
      if (conn) {
        const [rows] = await (conn as any).execute(
          "SELECT manus_task_id FROM wecom_manus_sessions WHERE wecom_user_id = ? LIMIT 1",
          [userId]
        ) as any;
        if ((rows as any[]).length > 0) {
          userTaskId = (rows as any[])[0].manus_task_id;
        }
      }
    } catch (_) {}

    // 拉取积分记录（多拉一些以确保能找到当前用户的）
    const res = await fetch(`${MANUS_API_BASE}/usage.list?limit=50`, {
      headers: { "x-manus-api-key": MANUS_API_KEY },
    });
    const data = await res.json() as any;
    if (!data.ok || !data.data) {
      return "查询积分失败，请稍后重试。";
    }

    const allRecords = data.data as any[];
    if (allRecords.length === 0) {
      return "暂无积分消耗记录。";
    }

    // 过滤出当前用户的任务记录
    const records = userTaskId
      ? allRecords.filter((r: any) => r.task_id === userTaskId)
      : [];

    // 计算当前用户消耗
    let userCost = 0;
    const lines: string[] = [];

    if (records.length > 0) {
      lines.push("--- 你的任务积分记录 ---");
      for (const r of records) {
        const time = new Date(r.created_at * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const credits = r.credits;
        const type = r.type === "cost" ? "消耗" : r.type === "refund" ? "退还" : "充值";
        const title = r.title || "未命名任务";
        lines.push(`${time} | ${type} ${Math.abs(credits)} 积分 | ${title}`);
        if (r.type === "cost") userCost += Math.abs(credits);
      }
      lines.push(`\n你的累计消耗: ${userCost} 积分`);
    } else {
      lines.push("暂无你的积分消耗记录。");
      if (!userTaskId) {
        lines.push("（你还没有创建过任务，发送消息即可开始）");
      }
    }



    return lines.join("\n");
  } catch (e) {
    console.error("[Manus] 查询积分异常:", e);
    return "查询积分时发生错误，请稍后重试。";
  }
}

// -----------------------------------------------------------
// 工具函数：查询菜单自定义回复模板（存储在 wecom_route_config，key = menu_reply_{EVENT_KEY}）
// 支持变量替换：{username} {balance} {model} {task_id} {created_at}
// 返回 null 表示未配置，调用方使用默认回复
// -----------------------------------------------------------
async function getMenuReplyTemplate(eventKey: string, vars: Record<string, string> = {}): Promise<string | null> {
  try {
    const conn = await getDbConnection();
    if (!conn) return null;
    const [rows] = await (conn as any).execute(
      `SELECT config_val FROM wecom_route_config WHERE config_key = ? LIMIT 1`,
      [`menu_reply_${eventKey}`]
    ) as any;
    const tpl = (rows as any[])[0]?.config_val;
    if (!tpl) return null;
    // 替换变量
    return tpl.replace(/\{(\w+)\}/g, (_: string, k: string) => vars[k] ?? `{${k}}`);
  } catch (_) {
    return null;
  }
}

// -----------------------------------------------------------
// 工具函数：处理菜单点击事件
// -----------------------------------------------------------
async function handleMenuClick(userId: string, eventKey: string): Promise<void> {
  console.log(`[WeCom] 菜单点击: user=${userId} key=${eventKey}`);

  switch (eventKey) {
    case "MODEL_MAX":
    case "MODEL_NORMAL":
    case "MODEL_LITE":
    case "MODEL_DS_FLASH":
    case "MODEL_STATUS": {
      // 已移除手动切换模型功能，全局使用自动路由模式
      await sendWeComMessage(userId, "当前已启用全自动路由模式，系统会自动选择最合适的 AI 处理您的消息。");
      break;
    }

    case "CREDITS_QUERY": {
      await sendWeComMessage(userId, "正在查询积分...");
      const result = await queryCreditsUsage(userId);
      await sendWeComMessage(userId, result);
      break;
    }

    case "NEW_TASK":
    case "NEW_CONVERSATION": {
      // 删除当前会话，下次发消息时自动创建新任务
      try {
        const conn = await getDbConnection();
        if (conn) {
          await (conn as any).execute(
            "DELETE FROM wecom_manus_sessions WHERE wecom_user_id = ?",
            [userId]
          );
        }
        await sendWeComMessage(userId, "已开启新对话。下次发送消息将创建全新的 AI 任务。");
      } catch (e) {
        await sendWeComMessage(userId, "操作失败，请稍后重试。");
      }
      break;
    }

    case "TASK_STATUS": {
      try {
        await ensureSessionTable();
        const conn = await getDbConnection();
        if (!conn) {
          await sendWeComMessage(userId, "系统异常，请稍后重试。");
          break;
        }
        const [rows] = await (conn as any).execute(
          "SELECT manus_task_id, created_at FROM wecom_manus_sessions WHERE wecom_user_id = ? LIMIT 1",
          [userId]
        ) as any;
        if ((rows as any[]).length === 0) {
          await sendWeComMessage(userId, "当前没有活跃任务。发送任何消息即可创建新任务。");
        } else {
          const row = (rows as any[])[0];
          const created = new Date(row.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
          const modelLabel = await getUserModelLabel(userId);
          await sendWeComMessage(userId, `当前任务ID: ${row.manus_task_id}\n创建时间: ${created}\n当前模型: ${modelLabel}`);
        }
      } catch (e) {
        await sendWeComMessage(userId, "查询任务状态失败。");
      }
      break;
    }

    case "HELP": {
      const helpText = [
        "--- 使用帮助 ---",
        "",
        "直接发送文字消息即可与 AI 对话。",
        "系统已启用全自动路由模式，会自动选择最合适的 AI 处理您的消息。",
        "",
        "底部菜单功能:",
        "[AI 助理] 重置为自动路由模式",
        "",
        "[工具箱]",
        "  - 查积分: 查看最近积分消耗",
        "  - 新对话: 重新开始一个全新任务",
        "  - 任务状态: 查看当前任务信息",
        "",
        "[更多]",
        "  - 使用帮助: 显示本帮助",
        "  - 意见反馈: 提交反馈建议",
      ].join("\n");
      await sendWeComMessage(userId, helpText);
      break;
    }

    case "FEEDBACK": {
      const feedbackTpl = await getMenuReplyTemplate(eventKey);
      await sendWeComMessage(userId, feedbackTpl ?? "感谢您的反馈！请直接回复您的建议或问题，我们会认真处理。");
      break;
    }
    case "MY_WALLET": {
      try {
        await ensureSessionTable();
        const conn = await getDbConnection();
        if (!conn) {
          await sendWeComMessage(userId, "系统异常，请稍后重试。");
          break;
        }
        // 查询绑定关系
        const [bindRows] = await (conn as any).execute(
          `SELECT site_username, site_user_id FROM wecom_account_binding WHERE wecom_user_id = ? LIMIT 1`,
          [userId]
        ) as any;
        if (!(bindRows as any[]).length) {
          await sendWeComMessage(userId, "您还未绑定人脉网账号。\n\n请联系管理员帮您完成钱包绑定。");
          break;
        }
        const binding = (bindRows as any[])[0];
        const siteUserId = binding.site_user_id;
        const siteUsername = binding.site_username;
        if (!siteUserId) {
          await sendWeComMessage(userId, `绑定账号「${siteUsername}」数据异常，请联系管理员。`);
          break;
        }
        // 查询网站余额：users.balance + af_manual_balances合计
        const [balRows] = await (conn as any).execute(
          `SELECT
             (SELECT COALESCE(balance, 0) FROM users WHERE id = ?) AS userBalance,
             (SELECT COALESCE(SUM(amount), 0) FROM af_manual_balances WHERE user_id = ?) AS manual`,
          [siteUserId, siteUserId]
        ) as any;
        const row = (balRows as any[])[0] || {};
        const userBalance = parseFloat(row.userBalance || '0') || 0;
        const manual = parseFloat(row.manual || '0') || 0;
        const totalBalance = userBalance + manual;
        const walletVars = {
          username: siteUsername,
          balance: totalBalance.toFixed(2),
          time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        };
        const walletTpl = await getMenuReplyTemplate('MY_WALLET', walletVars);
        await sendWeComMessage(userId,
          walletTpl ?? `─── 我的钱包 ───\n账号：${siteUsername}\n余额：¥${totalBalance.toFixed(2)} 元`
        );
      } catch (e) {
        console.error('[WeCom] MY_WALLET 查询失败:', e);
        await sendWeComMessage(userId, "查询余额失败，请稍后重试。");
      }
      break;
    }

    case "AI_EMPLOYEE": {
      // 将用户模型偏好设为 auto_route，触发智能路由模式
      await setUserModel(userId, "auto_route");
      // 从数据库读取可配置的欢迎语
      let welcomeMsg = "已切换到 AI 员工模式\n\n我会自动判断你的问题，选择最合适的 AI 来回答。\n直接发消息开始吧！";
      try {
        const wConn = await getDbConnection();
        if (wConn) {
          const [wRows] = await (wConn as any).execute(
            "SELECT config_val FROM wecom_route_config WHERE config_key = 'employee_welcome' LIMIT 1"
          ) as any;
          if ((wRows as any[]).length > 0 && (wRows as any[])[0].config_val) {
            welcomeMsg = (wRows as any[])[0].config_val;
          }
        }
      } catch (_) {}
      await sendWeComMessage(userId, welcomeMsg);
      break;
    }

    default: {
      if (eventKey.startsWith("RESERVED_")) {
        await sendWeComMessage(userId, "此功能即将上线，敬请期待。");
      } else {
        await sendWeComMessage(userId, `未知操作: ${eventKey}`);
      }
      break;
    }
  }
}

// -----------------------------------------------------------
// 工具函数：确保数据库表存在
// -----------------------------------------------------------
let _tableEnsured = false;
async function ensureSessionTable(): Promise<void> {
  if (_tableEnsured) return;
  const conn = await getDbConnection();
  if (!conn) return;
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_manus_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      wecom_user_id VARCHAR(100) NOT NULL UNIQUE COMMENT '企业微信用户ID',
      manus_task_id VARCHAR(200) NOT NULL COMMENT 'Manus任务ID',
      nickname VARCHAR(200) DEFAULT '' COMMENT '用户备注名',
      model_pref VARCHAR(50) DEFAULT 'manus-1.6-max' COMMENT '用户默认模型',
      system_prompt TEXT DEFAULT NULL COMMENT '系统提示词',
      enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_wecom_user_id (wecom_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业微信用户与Manus任务的会话映射'
  `);
  // 迁移：如果旧表没有相关列，自动添加
  for (const sql of [
    `ALTER TABLE wecom_manus_sessions ADD COLUMN model_pref VARCHAR(50) DEFAULT 'manus-1.6-max' COMMENT '用户默认模型'`,
    `ALTER TABLE wecom_manus_sessions ADD COLUMN system_prompt TEXT DEFAULT NULL COMMENT '系统提示词'`,
    `ALTER TABLE wecom_manus_sessions ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用'`,
  ]) { try { await (conn as any).execute(sql); } catch (_) {} }

  // 创建消息级积分记录表
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_message_credits (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      wecom_user_id VARCHAR(100) NOT NULL COMMENT '企业微信用户ID',
      manus_task_id VARCHAR(200) NOT NULL COMMENT 'Manus任务ID',
      user_message  TEXT         COMMENT '用户发送的消息内容（前200字）',
      credits_before INT         NOT NULL DEFAULT 0 COMMENT '发消息前任务累计积分消耗',
      credits_after  INT         NOT NULL DEFAULT 0 COMMENT 'AI回复后任务累计积分消耗',
      credits_used   INT         NOT NULL DEFAULT 0 COMMENT '本次消耗积分（after - before）或DeepSeek total_tokens',
      input_tokens   INT         NOT NULL DEFAULT 0 COMMENT 'DeepSeek输入token数（缓存未命中）',
      output_tokens  INT         NOT NULL DEFAULT 0 COMMENT 'DeepSeek输出token数',
      cache_hit_tokens INT       NOT NULL DEFAULT 0 COMMENT 'DeepSeek缓存命中输入token数',
      model_used    VARCHAR(50)  COMMENT '使用的模型',
      reply_preview TEXT         COMMENT 'AI回复预览（前100字）',
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '消息时间',
      INDEX idx_mc_wecom_user (wecom_user_id),
      INDEX idx_mc_task (manus_task_id),
      INDEX idx_mc_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业微信每条消息积分消耗记录'
  `);
  // 迁移：给旧表补充 DeepSeek token 字段
  for (const sql of [
    `ALTER TABLE wecom_message_credits ADD COLUMN input_tokens INT NOT NULL DEFAULT 0 COMMENT 'DeepSeek输入token数（缓存未命中）'`,
    `ALTER TABLE wecom_message_credits ADD COLUMN output_tokens INT NOT NULL DEFAULT 0 COMMENT 'DeepSeek输出token数'`,
    `ALTER TABLE wecom_message_credits ADD COLUMN cache_hit_tokens INT NOT NULL DEFAULT 0 COMMENT 'DeepSeek缓存命中输入token数'`,
    `ALTER TABLE wecom_message_credits ADD COLUMN model_used VARCHAR(50) NULL COMMENT '使用的模型'`,
  ]) { try { await (conn as any).execute(sql); } catch (_) {} }

  // 创建工作流规则表
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_workflow_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL COMMENT '规则名称',
      trigger_type ENUM('keyword','schedule','always') NOT NULL DEFAULT 'keyword' COMMENT '触发方式',
      trigger_value TEXT NOT NULL COMMENT '触发值（关键词/cron表达式/说明）',
      action_type ENUM('prompt_override','fixed_reply','block') NOT NULL DEFAULT 'prompt_override' COMMENT '执行动作',
      action_value TEXT NOT NULL COMMENT '动作内容',
      enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业微信工作流规则'
  `);

  // 创建 AI 路由日志表
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_route_log (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      wecom_user_id   VARCHAR(100) NOT NULL COMMENT '企业微信用户ID',
      user_message    TEXT         COMMENT '用户消息（前200字）',
      classifier_result TINYINT    COMMENT '分类结果：1=DS快速 2=DS深思 3=Manus',
      routed_to       VARCHAR(50)  COMMENT '实际路由到的模型',
      tokens_classify INT          NOT NULL DEFAULT 0 COMMENT '分类消耗token',
      tokens_reply    INT          NOT NULL DEFAULT 0 COMMENT '回复消耗token（DS）或积分（Manus）',
      latency_ms      INT          NOT NULL DEFAULT 0 COMMENT '总耗时毫秒',
      created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_rl_user (wecom_user_id),
      INDEX idx_rl_created (created_at),
      INDEX idx_rl_routed (routed_to)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI路由日志'
  `);

  // 创建 AI 路由配置表
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_route_config (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      config_key  VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键',
      config_val  TEXT         NOT NULL COMMENT '配置值',
      updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI路由配置'
  `);

  // 创建企微用户与网站账号绑定表
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_account_binding (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      wecom_user_id   VARCHAR(100) NOT NULL UNIQUE COMMENT '企微用户ID',
      site_username   VARCHAR(100) NOT NULL COMMENT '网站用户名（users.username）',
      site_user_id    INT          COMMENT '网站用户ID（users.id）',
      bound_by        VARCHAR(100) COMMENT '绑定操作人',
      created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_wab_wecom (wecom_user_id),
      INDEX idx_wab_site (site_username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企微用户与网站账号绑定关系'
  `);

  // 插入默认路由配置（如不存在）
  await (conn as any).execute(`
    INSERT IGNORE INTO wecom_route_config (config_key, config_val) VALUES
    ('route_enabled', '0'),
    ('fallback_model', 'deepseek-chat'),
    ('classifier_model', 'deepseek-chat'),
    ('classifier_prompt', '你是消息分类器，只回复数字，不解释。\n规则：\n1 = 普通问答、闲聊、查信息、写文字（DeepSeek快速处理）\n2 = 需要深度推理、复杂分析、数学逻辑（DeepSeek深思处理）\n3 = 需要执行操作、生成文件、调用工具、处理图片（Manus处理）\n\n用户消息：{MSG}\n\n回复数字：'),
    ('employee_welcome', '已切换到 AI 员工模式\n\n我会自动判断你的问题，选择最合适的 AI 来回答。\n直接发消息开始吧！'),
    ('waiting_msg', '收到，AI 正在思考中，请稍候...'),
    ('system_prompt', '')
  `);
  // 单独插入 menu_config（避免多值 INSERT IGNORE 在已有部分记录时失效）
  try {
    await (conn as any).execute(`INSERT IGNORE INTO wecom_route_config (config_key, config_val) VALUES ('menu_config', '')`);
  } catch (_) {}

  // 专属规则表
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_custom_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      rule_name VARCHAR(100) NOT NULL COMMENT '规则名称（管理员自定义）',
      trigger_intent TEXT NOT NULL COMMENT '触发意图描述（自然语言，供分类模型判断）',
      reply_mode ENUM('template','ai') NOT NULL DEFAULT 'ai' COMMENT 'template=固定模板回复 ai=专属AI回复',
      template_text TEXT COMMENT '固定模板回复内容（reply_mode=template时使用）',
      ai_model VARCHAR(100) NOT NULL DEFAULT 'deepseek-chat' COMMENT '专属AI模型',
      ai_system_prompt TEXT COMMENT '专属System Prompt',
      target_type ENUM('all','selected') NOT NULL DEFAULT 'selected' COMMENT 'all=全部用户 selected=指定用户',
      target_user_ids TEXT COMMENT '指定用户的wecom_user_id列表，JSON数组格式',
      enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
      trigger_count INT NOT NULL DEFAULT 0 COMMENT '累计触发次数',
      channel_type VARCHAR(20) NOT NULL DEFAULT 'kf' COMMENT '渠道类型：kf/app',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 迁移：给旧表补充字段（小写每条 try-catch，兼容旧 MySQL）
  for (const sql of [
    `ALTER TABLE wecom_custom_rules ADD COLUMN channel_type VARCHAR(20) NOT NULL DEFAULT 'kf' COMMENT '渠道类型：kf/app'`,
    `ALTER TABLE wecom_message_credits ADD COLUMN channel_type VARCHAR(20) NOT NULL DEFAULT 'kf' COMMENT '渠道类型：kf/app'`,
    `ALTER TABLE wecom_message_credits ADD COLUMN dialog_score TINYINT DEFAULT NULL COMMENT '对话质量评分(0-100)'`,
    `ALTER TABLE wecom_message_credits ADD COLUMN score_level VARCHAR(10) DEFAULT NULL COMMENT '评分等级：优质/良好/一般/低质'`,
    `ALTER TABLE wecom_message_credits ADD COLUMN score_reason TEXT DEFAULT NULL COMMENT 'AI评分理由'`,
    `ALTER TABLE wecom_message_credits ADD COLUMN score_dimensions JSON DEFAULT NULL COMMENT '各维度评分JSON'`,
    `ALTER TABLE wecom_message_credits ADD COLUMN score_at TIMESTAMP DEFAULT NULL COMMENT '评分时间'`,
  ]) { try { await (conn as any).execute(sql); } catch (_) {} }

  // 结构化指令条目表
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_prompt_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      channel_id INT NOT NULL DEFAULT 2 COMMENT '渠道ID',
      layer TINYINT NOT NULL DEFAULT 2 COMMENT '层级：1=角色定义 2=行为规则',
      category VARCHAR(50) NOT NULL DEFAULT '行为规则' COMMENT '分类标签：角色定义/知识库规则/回复格式/语气风格/安全边界',
      content TEXT NOT NULL COMMENT '指令内容',
      enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序权重',
      remark VARCHAR(200) DEFAULT '' COMMENT '备注',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_channel_layer (channel_id, layer)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='结构化AI指令条目'
  `);

  // 自动迁移：如果 wecom_prompt_rules 为空，但 wecom_channel_config 里有旧的 system_prompt，则自动拆分迁移
  try {
    const [countRows] = await (conn as any).execute(`SELECT COUNT(*) as cnt FROM wecom_prompt_rules`);
    const ruleCount = (countRows as any[])[0]?.cnt ?? 0;
    if (ruleCount === 0) {
      // 查询所有渠道的旧 system_prompt
      const [cfgRows] = await (conn as any).execute(
        `SELECT DISTINCT channel_id FROM wecom_channels WHERE channel_type = 'kf' LIMIT 10`
      );
      for (const chRow of cfgRows as any[]) {
        const chId = chRow.channel_id;
        const [spRows] = await (conn as any).execute(
          `SELECT config_val FROM wecom_channel_config WHERE channel_id = ? AND config_key = 'system_prompt' LIMIT 1`,
          [chId]
        );
        const oldPrompt: string = (spRows as any[])[0]?.config_val ?? '';
        if (!oldPrompt.trim()) continue;
        // 拆分迁移为结构化条目
        const migrationRules = [
          { layer: 1, category: '角色定义', content: '回复字数要自然，尽量两到三句话说清楚，不要一大段一大段。客户发多长，我们差不多跟他匹配。回复时不要用句号结尾，也不要在句子末尾加任何标点符号，说完就直接结束，像真人发消息一样自然收尾', remark: '迁移自旧system_prompt - 回复风格定义', sort_order: 1 },
          { layer: 2, category: '知识库规则', content: '如果知识库中有与用户问题相关的内容，必须严格按照知识库的答案回复，不得自行发挥或修改。知识库里有的数据直接报出来，不允许用模糊表达', remark: '迁移自旧system_prompt - 知识库优先规则', sort_order: 1 },
          { layer: 2, category: '回复格式', content: '客户问什么，就只回答什么，不要主动补充没被问到的信息。比如客户只问价格，就只说价格，不要顺带说克数、份数、口味等。客户只问最贵的是哪款，就只说产品名和价格，不要展开介绍', remark: '迁移自旧system_prompt - 回答精准性规则', sort_order: 2 },
          { layer: 2, category: '回复格式', content: '回答价格时不要主动提口味，因为同一产品不同口味价格相同，提口味没有意义', remark: '迁移自旧system_prompt - 价格回答规则', sort_order: 3 },
          { layer: 2, category: '回复格式', content: '当客户问最贵的是什么、最便宜的是什么等比较类问题时，必须给出明确的产品名称和价格，不能含糊其辞', remark: '迁移自旧system_prompt - 比较类问题规则', sort_order: 4 },
        ];
        for (const r of migrationRules) {
          await (conn as any).execute(
            `INSERT INTO wecom_prompt_rules (channel_id, layer, category, content, enabled, sort_order, remark) VALUES (?,?,?,?,1,?,?)`,
            [chId, r.layer, r.category, r.content, r.sort_order, r.remark]
          );
        }
        console.log(`[PromptRules] 已自动迁移渠道 ${chId} 的旧 system_prompt 为 ${migrationRules.length} 条结构化指令`);
      }
    }
  } catch (e) {
    console.error('[PromptRules] 自动迁移失败:', e);
  }

  _tableEnsured = true;
}

// -----------------------------------------------------------
// 工具函数：获取或创建用户的 Manus task_id
// -----------------------------------------------------------
async function getOrCreateManusTask(wecomUserId: string): Promise<string | null> {
  const conn = await getDbConnection();
  if (!conn) return null;

  // 查询已有会话
  const [rows] = await (conn as any).execute(
    "SELECT manus_task_id FROM wecom_manus_sessions WHERE wecom_user_id = ? LIMIT 1",
    [wecomUserId]
  ) as any;

  if ((rows as any[]).length > 0) {
    return (rows as any[])[0].manus_task_id;
  }

  // 创建新的 Manus 任务
  try {
    console.log(`[Manus] 为用户 ${wecomUserId} 创建新任务...`);
    const res = await fetch(`${MANUS_API_BASE}/task.create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": MANUS_API_KEY,
      },
      body: JSON.stringify({
        message: {
          role: "user",
          content: "你好，我是通过企业微信连接的用户。请记住我们的对话，帮助我完成各种工作。",
        },
        // 注意：不传 agent_profile，避免 auto_route 等非 Manus profile 值导致创建失败
        // 实际发消息时会通过 sendToManusAndGetReply 的 agentProfile 参数指定模型
      }),
    });
    const data = await res.json() as any;
    console.log("[Manus] task.create 响应:", JSON.stringify(data).substring(0, 300));

    if (!data.ok || !data.task_id) {
      console.error("[Manus] 创建任务失败:", JSON.stringify(data));
      return null;
    }

    const initTaskId = data.task_id;

    // 保存到数据库，新任务强制为 active（不等待初始消息完成，避免超时）
    await (conn as any).execute(
      "INSERT INTO wecom_manus_sessions (wecom_user_id, manus_task_id, status) VALUES (?, ?, 'active')",
      [wecomUserId, initTaskId]
    );
    console.log(`[Manus] 为用户 ${wecomUserId} 创建新任务成功: ${initTaskId}`);
    // 等待3秒让初始任务稍微稳定，但不阻塞主流程
    await new Promise(resolve => setTimeout(resolve, 3000));
    return initTaskId;
  } catch (e) {
    console.error("[Manus] 创建任务异常:", e);
    return null;
  }
}

// -----------------------------------------------------------
// 工具函数：上传图片到企业微信临时素材并发送图片消息
// -----------------------------------------------------------
async function sendWeComImage(toUser: string, imageUrl: string): Promise<void> {
  try {
    // 1. 下载图片
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.error(`[WeCom] 下载图片失败: ${imgRes.status} ${imageUrl.substring(0, 80)}`);
      return;
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/png";
    const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("gif") ? "gif" : "png";

    // 2. 上传到企业微信临时素材
    const token = await getAccessToken();
    const uploadUrl = `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${token}&type=image`;

    // 构造 multipart/form-data
    const boundary = `----WeComBoundary${Date.now()}`;
    const filename = `image.${ext}`;
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, imgBuffer, footer]);

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    const uploadData = await uploadRes.json() as any;
    console.log(`[KF-MAT] 上传企微返回:`, JSON.stringify(uploadData).substring(0, 200));
    if (uploadData.errcode !== 0 && uploadData.errcode !== undefined) {
      console.error("[WeCom] 上传临时素材失败:", uploadData.errmsg);
      // 降级：发送图片链接文字
      await sendWeComMessage(toUser, `[图片] ${imageUrl}`);
      return;
    }
    const mediaId = uploadData.media_id;
    console.log(`[WeCom] 图片上传成功 media_id=${mediaId}`);

    // 3. 发送图片消息
    const sendToken = await getAccessToken();
    const sendRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${sendToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        touser: toUser,
        msgtype: "image",
        agentid: Number(WECOM_AGENT_ID),
        image: { media_id: mediaId },
        safe: 0,
      }),
    });
    const sendData = await sendRes.json() as any;
    if (sendData.errcode !== 0) {
      console.error("[WeCom] 发送图片消息失败:", sendData.errmsg);
    } else {
      console.log(`[WeCom] 图片消息已发送给 ${toUser}`);
    }
  } catch (e) {
    console.error("[WeCom] 发送图片异常:", e);
  }
}

// -----------------------------------------------------------
// 工具函数：下载视频、ffmpeg 压缩到 10MB 以内，上传企微素材库发送视频消息
// -----------------------------------------------------------
async function sendWeComVideo(toUser: string, videoUrl: string, filename: string): Promise<void> {
  const tmpDir = os.tmpdir();
  const rawPath = path.join(tmpDir, `wecom_video_raw_${Date.now()}.mp4`);
  const compPath = path.join(tmpDir, `wecom_video_comp_${Date.now()}.mp4`);
  try {
    // 1. 下载视频
    console.log(`[WeCom] 下载视频: ${videoUrl.substring(0, 80)}`);
    const vidRes = await fetch(videoUrl);
    if (!vidRes.ok) {
      console.error(`[WeCom] 下载视频失败: ${vidRes.status}`);
      await sendWeComMessage(toUser, `[视频] ${filename}\n${videoUrl}`);
      return;
    }
    const vidBuffer = Buffer.from(await vidRes.arrayBuffer());
    fs.writeFileSync(rawPath, vidBuffer);
    const rawSize = vidBuffer.length;
    console.log(`[WeCom] 视频下载完成，大小: ${(rawSize / 1024 / 1024).toFixed(2)} MB`);

    // 2. 如果超过 9MB，用 ffmpeg 压缩
    const MAX_SIZE = 9 * 1024 * 1024; // 9MB 留 1MB 余量
    let uploadPath = rawPath;
    if (rawSize > MAX_SIZE) {
      console.log(`[WeCom] 视频超过 9MB，开始 ffmpeg 压缩...`);
      // 目标码率：9MB * 8bit / 视频时长(估算60s) = ~1200kbps，保守用 800kbps
      await new Promise<void>((resolve, reject) => {
        execFile('ffmpeg', [
          '-i', rawPath,
          '-vcodec', 'libx264',
          '-acodec', 'aac',
          '-b:v', '600k',
          '-b:a', '64k',
          '-movflags', '+faststart',
          '-y',
          compPath
        ], (err) => {
          if (err) reject(err); else resolve();
        });
      });
      const compSize = fs.statSync(compPath).size;
      console.log(`[WeCom] 压缩完成，大小: ${(compSize / 1024 / 1024).toFixed(2)} MB`);
      uploadPath = compPath;
    }

    // 3. 上传到企业微信临时素材
    const token = await getAccessToken();
    const uploadUrl = `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${token}&type=video`;
    const boundary = `----WeComBoundary${Date.now()}`;
    const videoBuffer = fs.readFileSync(uploadPath);
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, videoBuffer, footer]);
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    const uploadData = await uploadRes.json() as any;
    console.log(`[KF-MAT] 上传企微返回:`, JSON.stringify(uploadData).substring(0, 200));
    if (uploadData.errcode !== 0 && uploadData.errcode !== undefined) {
      console.error('[WeCom] 上传视频素材失败:', uploadData.errmsg);
      // 降级：发送原版链接
      await sendWeComMessage(toUser, `[视频] ${filename}\n${videoUrl}`);
      return;
    }
    const mediaId = uploadData.media_id;
    console.log(`[WeCom] 视频上传成功 media_id=${mediaId}`);

    // 4. 发送视频消息
    const sendToken = await getAccessToken();
    const sendRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${sendToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: toUser,
        msgtype: 'video',
        agentid: Number(WECOM_AGENT_ID),
        video: { media_id: mediaId, title: filename, description: '' },
        safe: 0,
      }),
    });
    const sendData = await sendRes.json() as any;
    if (sendData.errcode !== 0) {
      console.error('[WeCom] 发送视频消息失败:', sendData.errmsg);
      await sendWeComMessage(toUser, `[视频] ${filename}\n${videoUrl}`);
    } else {
      console.log(`[WeCom] 视频消息已发送给 ${toUser}`);
      // 如果原视频超过 9MB，额外发一条原版链接
      if (rawSize > MAX_SIZE) {
        await sendWeComMessage(toUser, `原版高清视频（完整版）：\n${videoUrl}`);
      }
    }
  } catch (e) {
    console.error('[WeCom] 发送视频异常:', e);
    await sendWeComMessage(toUser, `[视频] ${filename}\n${videoUrl}`);
  } finally {
    // 清理临时文件
    try { if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath); } catch (_) {}
    try { if (fs.existsSync(compPath)) fs.unlinkSync(compPath); } catch (_) {}
  }
}

// -----------------------------------------------------------
// 工具函数：下载文件并上传企微素材库发送文件消息（20MB 以内）
// -----------------------------------------------------------
async function sendWeComFile(toUser: string, fileUrl: string, filename: string): Promise<void> {
  const tmpPath = path.join(os.tmpdir(), `wecom_file_${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  try {
    // 1. 下载文件
    console.log(`[WeCom] 下载文件: ${fileUrl.substring(0, 80)}`);
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      console.error(`[WeCom] 下载文件失败: ${fileRes.status}`);
      await sendWeComMessage(toUser, `[文件] ${filename}\n${fileUrl}`);
      return;
    }
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const fileSize = fileBuffer.length;
    console.log(`[WeCom] 文件下载完成，大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    // 2. 超过 20MB 降级为链接
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    if (fileSize > MAX_FILE_SIZE) {
      console.log(`[WeCom] 文件超过 20MB，降级为链接`);
      await sendWeComMessage(toUser, `[文件] ${filename}（${(fileSize / 1024 / 1024).toFixed(1)}MB，请点链接下载）\n${fileUrl}`);
      return;
    }

    fs.writeFileSync(tmpPath, fileBuffer);

    // 3. 上传到企业微信临时素材
    const token = await getAccessToken();
    const uploadUrl = `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${token}&type=file`;
    const boundary = `----WeComBoundary${Date.now()}`;
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    const uploadData = await uploadRes.json() as any;
    console.log(`[KF-MAT] 上传企微返回:`, JSON.stringify(uploadData).substring(0, 200));
    if (uploadData.errcode !== 0 && uploadData.errcode !== undefined) {
      console.error('[WeCom] 上传文件素材失败:', uploadData.errmsg);
      await sendWeComMessage(toUser, `[文件] ${filename}\n${fileUrl}`);
      return;
    }
    const mediaId = uploadData.media_id;
    console.log(`[WeCom] 文件上传成功 media_id=${mediaId}`);

    // 4. 发送文件消息
    const sendToken = await getAccessToken();
    const sendRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${sendToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: toUser,
        msgtype: 'file',
        agentid: Number(WECOM_AGENT_ID),
        file: { media_id: mediaId },
        safe: 0,
      }),
    });
    const sendData = await sendRes.json() as any;
    if (sendData.errcode !== 0) {
      console.error('[WeCom] 发送文件消息失败:', sendData.errmsg);
      await sendWeComMessage(toUser, `[文件] ${filename}\n${fileUrl}`);
    } else {
      console.log(`[WeCom] 文件消息已发送给 ${toUser}: ${filename}`);
    }
  } catch (e) {
    console.error('[WeCom] 发送文件异常:', e);
    await sendWeComMessage(toUser, `[文件] ${filename}\n${fileUrl}`);
  } finally {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

// -----------------------------------------------------------
// 工具函数：向 Manus 任务发送消息并等待回复
// -----------------------------------------------------------
interface ManusReply {
  text: string;
  imageUrls: string[];
  fileAttachments: Array<{ url: string; filename: string; type: string }>;
}

async function sendToManusAndGetReply(taskId: string, userMessage: string, agentProfile?: string): Promise<ManusReply> {
  try {
    // 记录发送前的时间戳（Unix 秒），用于过滤旧消息
    const sendTimestamp = Math.floor(Date.now() / 1000);

    console.log(`[Manus] 向任务 ${taskId} 发送消息 (model=${agentProfile || 'default'}): ${userMessage.substring(0, 50)}`);
    const sendBody: any = {
      task_id: taskId,
      message: {
        role: "user",
        content: userMessage,
      },
    };
    if (agentProfile) sendBody.agent_profile = agentProfile;

    const sendRes = await fetch(`${MANUS_API_BASE}/task.sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": MANUS_API_KEY,
      },
      body: JSON.stringify(sendBody),
    });
    const sendData = await sendRes.json() as any;
    console.log("[Manus] task.sendMessage 响应:", JSON.stringify(sendData).substring(0, 300));

    if (!sendData.ok) {
      console.error("[Manus] 发送消息失败:", JSON.stringify(sendData));
      return { text: "消息发送失败，请稍后重试。", imageUrls: [], fileAttachments: [] };
    }

    // 轮询等待任务完成（最多等待300秒，Max模式任务可能较慢）
    const maxWait = 300;
    const pollInterval = 5;
    let waited = 0;

    while (waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));
      waited += pollInterval;

      const msgsRes = await fetch(
        `${MANUS_API_BASE}/task.listMessages?task_id=${taskId}&order=desc&limit=20`,
        { headers: { "x-manus-api-key": MANUS_API_KEY } }
      );
      const msgsData = await msgsRes.json() as any;

      if (!msgsData.ok) {
        console.error("[Manus] listMessages 失败:", JSON.stringify(msgsData));
        continue;
      }

      const events = msgsData.messages || [];

      // 调试：打印事件类型列表
      const eventTypes = events.map((e: any) => e.type).join(',');
      if (waited <= 10 || waited % 30 === 0) {
        console.log(`[Manus] listMessages 事件类型: [${eventTypes}] (共${events.length}条)`);
        if (events.length > 0) {
          console.log(`[Manus] 第一条事件: ${JSON.stringify(events[0]).substring(0, 300)}`);
        }
      }

      // 查找最新的 status_update 事件（order=desc，第一个就是最新的）
      const latestStatus = events.find((e: any) => e.type === "status_update");
      if (latestStatus) {
        const agentStatus = latestStatus.status_update?.agent_status;
        console.log(`[Manus] 任务状态: ${agentStatus} (已等待 ${waited}s)`);

        if (agentStatus === "stopped" || agentStatus === "error") {
          // 只取 sendTimestamp 之后的新 assistant_message（过滤历史旧消息）
          const newAssistantMsgs = events.filter(
            (e: any) => e.type === "assistant_message" && (e.timestamp || 0) >= sendTimestamp
          );

          // 提取文字 + 附件（图片/视频/文件）的辅助函数
          const extractReply = (msg: any): ManusReply => {
            const am = msg.assistant_message || {};
            // 提取文字
            let text = "";
            const rawContent = am.content;
            if (typeof rawContent === "string") text = rawContent;
            else if (Array.isArray(rawContent)) {
              text = rawContent.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
            }
            // 提取附件
            const imageUrls: string[] = [];
            const fileAttachments: Array<{ url: string; filename: string; type: string }> = [];
            const attachments: any[] = am.attachments || [];
            for (const att of attachments) {
              const url = att.url || "";
              const filename = att.filename || "file";
              const attType = att.type || att.content_type || "";
              if (attType === "image" || (att.content_type || "").startsWith("image/")) {
                imageUrls.push(url);
              } else {
                // 视频、音频、文件、PPT、Excel、PDF 等统一作为文件链接
                fileAttachments.push({ url, filename, type: attType });
              }
            }
            return { text, imageUrls, fileAttachments };
          };

          if (newAssistantMsgs.length > 0) {
            const result = extractReply(newAssistantMsgs[0]);
            if (result.text || result.imageUrls.length > 0 || result.fileAttachments.length > 0) {
              return result;
            }
          }
          // 如果没有新消息，尝试不过滤时间再找一次（容错）
          const anyAssistantMsg = events.find((e: any) => e.type === "assistant_message");
          if (anyAssistantMsg) {
            const result = extractReply(anyAssistantMsg);
            if (result.text || result.imageUrls.length > 0 || result.fileAttachments.length > 0) {
              return result;
            }
          }
          return { text: agentStatus === "error" ? "任务执行失败，请重新描述您的需求。" : "任务已完成，但没有文字回复。", imageUrls: [], fileAttachments: [] };
        }

        if (agentStatus === "waiting") {
          const detail = latestStatus.status_update?.status_detail;
          if (detail?.waiting_for_event_type === "messageAskUser") {
            // Manus 在问用户问题，把问题转发给企业微信用户
            const askMsg = events.find((e: any) => e.type === "assistant_message");
            if (askMsg) {
              const askContent = askMsg.assistant_message?.content;
              let askText = "";
              if (typeof askContent === "string") askText = askContent;
              else if (Array.isArray(askContent)) askText = askContent.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
              if (askText) return { text: askText, imageUrls: [], fileAttachments: [] };
            }
            return { text: "AI 助手需要更多信息，请补充说明。", imageUrls: [], fileAttachments: [] };
          }
          // 其他等待类型，自动确认
          if (detail?.waiting_for_event_id) {
            try {
              await fetch(`${MANUS_API_BASE}/task.confirmAction`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-manus-api-key": MANUS_API_KEY,
                },
                body: JSON.stringify({
                  task_id: taskId,
                  event_id: detail.waiting_for_event_id,
                  input: { accept: true },
                }),
              });
              console.log(`[Manus] 自动确认操作: ${detail.waiting_for_event_type}`);
            } catch (confirmErr) {
              console.error("[Manus] 自动确认失败:", confirmErr);
            }
          }
        }
        // running 状态继续轮询
      }
    }

    return { text: "Manus 正在处理中，处理时间较长。请稍后再发送消息查看进度。", imageUrls: [], fileAttachments: [] };
  } catch (e) {
    console.error("[Manus] 通信异常:", e);
    return { text: "与 AI 助手通信时发生错误，请稍后重试。", imageUrls: [], fileAttachments: [] };
  }
}

// -----------------------------------------------------------
// AI 路由：读取路由配置
// -----------------------------------------------------------
async function getRouteConfig(): Promise<{ enabled: boolean; fallbackModel: string; classifierModel: string; classifierPrompt: string }> {
  try {
    const conn = await getDbConnection();
    if (!conn) return { enabled: false, fallbackModel: "deepseek-chat", classifierModel: "deepseek-chat", classifierPrompt: "" };
    const [rows] = await (conn as any).execute(
      "SELECT config_key, config_val FROM wecom_route_config WHERE config_key IN ('route_enabled','fallback_model','classifier_model','classifier_prompt')"
    ) as any;
    const cfg: Record<string, string> = {};
    for (const r of (rows as any[])) cfg[r.config_key] = r.config_val;
    return {
      enabled: cfg["route_enabled"] === "1",
      fallbackModel: cfg["fallback_model"] || "deepseek-chat",
      classifierModel: cfg["classifier_model"] || "deepseek-chat",
      classifierPrompt: cfg["classifier_prompt"] || "",
    };
  } catch (_) {
    return { enabled: false, fallbackModel: "deepseek-chat", classifierModel: "deepseek-chat", classifierPrompt: "" };
  }
}

// AI 路由：对消息进行分类，返回 1/2/3
// classifierModel: 前置分类模型，建议选轻量级模型（如 deepseek-chat / manus-1.6-lite）
async function classifyMessage(userMessage: string, prompt: string, classifierModel: string = "deepseek-chat"): Promise<{ result: number; tokens: number }> {
  try {
    const isManus = classifierModel.startsWith("manus");
    const fullPrompt = prompt.replace("{MSG}", userMessage.substring(0, 300));
    if (isManus) {
      // 使用 Manus API 做分类
      const manusApiKey = process.env.MANUS_API_KEY || "";
      if (!manusApiKey) return { result: 1, tokens: 0 };
      const res = await fetch("https://api.manus.im/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${manusApiKey}` },
        body: JSON.stringify({
          model: classifierModel,
          messages: [{ role: "user", content: fullPrompt }],
          max_tokens: 5,
          temperature: 0,
          stream: false,
        }),
      });
      if (!res.ok) return { result: 1, tokens: 0 };
      const data = await res.json() as any;
      const raw = (data?.choices?.[0]?.message?.content || "1").trim();
      const num = parseInt(raw.charAt(0));
      const result = (num >= 1 && num <= 3) ? num : 1;
      const tokens = data?.usage?.total_tokens || 0;
      console.log(`[Router] 分类模型=${classifierModel} 结果=${result} tokens=${tokens}`);
      return { result, tokens };
    } else {
      // 使用 DeepSeek API 做分类
      if (!DEEPSEEK_API_KEY) return { result: 1, tokens: 0 };
      // 去掉 -thinking 后缀，分类不需要思考模式
      const actualModel = classifierModel.replace("-thinking", "");
      const res = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
        body: JSON.stringify({
          model: actualModel,
          messages: [{ role: "user", content: fullPrompt }],
          max_tokens: 5,
          temperature: 0,
          stream: false,
        }),
      });
      if (!res.ok) return { result: 1, tokens: 0 };
      const data = await res.json() as any;
      const raw = (data?.choices?.[0]?.message?.content || "1").trim();
      const num = parseInt(raw.charAt(0));
      const result = (num >= 1 && num <= 3) ? num : 1;
      const tokens = data?.usage?.total_tokens || 0;
      console.log(`[Router] 分类模型=${actualModel} 结果=${result} tokens=${tokens}`);
      return { result, tokens };
    }
  } catch (e) {
    console.error("[Router] 分类失败:", e);
    return { result: 1, tokens: 0 };
  }
}

// -----------------------------------------------------------
// 工具函数：向 DeepSeek API 发送消息并获取回复
// -----------------------------------------------------------
interface DeepSeekReply { content: string; promptTokens: number; completionTokens: number; totalTokens: number; cacheHitTokens: number; modelUsed?: string; }
async function sendToDeepSeekAndGetReply(userMessage: string, model: string = "deepseek-chat", systemPrompt?: string, useCase: UseCase = "chat"): Promise<DeepSeekReply> {
  const errReply = (msg: string): DeepSeekReply => ({ content: msg, promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHitTokens: 0 });
  try {
    // ===== 动态读取全局 AI 配置 =====
    // 当 model 为 "auto" 或 "deepseek-chat" 时，优先从数据库读取全局配置
    let apiKey = DEEPSEEK_API_KEY;
    let apiBase = DEEPSEEK_API_BASE;
    let resolvedModel = model;
    const shouldUseGlobalConfig = model === "auto" || model === "deepseek-chat" || model === "deepseek-v4-flash";
    if (shouldUseGlobalConfig) {
      try {
        const cfg = await getAIConfig(useCase);
        if (cfg && cfg.api_key) {
          apiKey = cfg.api_key;
          apiBase = cfg.api_base;
          resolvedModel = cfg.model_name;
          console.log(`[AI] 使用全局配置 useCase=${useCase} provider=${cfg.provider} model=${cfg.model_name}`);
        }
      } catch (cfgErr) {
        console.warn("[AI] 读取全局配置失败，降级使用 DeepSeek:", cfgErr);
      }
    }
    if (!apiKey) {
      return errReply("AI API Key 未配置，请在平台管理→AI模型配置中设置。");
    }
    // 判断是否需要开启思考模式
    const isThinking = resolvedModel.endsWith("-thinking");
    const actualModel = isThinking ? resolvedModel.replace("-thinking", "") : resolvedModel;
    // 兼容旧模型名：deepseek-chat 映射到 deepseek-v4-flash（仅 DeepSeek 服务商）
    const apiModel = (actualModel === "deepseek-chat" && apiBase.includes("deepseek")) ? "deepseek-v4-flash" : actualModel;
    console.log(`[AI] 发送消息 model=${apiModel} thinking=${isThinking}: ${userMessage.substring(0, 50)}`);
    const messages: Array<{role: string; content: string}> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userMessage });
    const requestBody: Record<string, any> = {
      model: apiModel,
      messages,
      max_tokens: isThinking ? 32768 : 4096,
      stream: false,
    };
    if (isThinking) {
      requestBody.thinking = { type: "enabled" };
    }
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[DeepSeek] API 错误 ${res.status}:`, errText);
      return errReply(`DeepSeek 服务暂时不可用（${res.status}），请稍后重试。`);
    }
    const data = await res.json() as any;
    // 思考模式下，content 是最终答案，reasoning_content 是思维链（不发给用户）
    const content = data?.choices?.[0]?.message?.content || "";
    const reasoningContent = data?.choices?.[0]?.message?.reasoning_content || "";
    if (!content && !reasoningContent) {
      console.error("[DeepSeek] 返回内容为空:", JSON.stringify(data).substring(0, 300));
      return errReply("DeepSeek 未返回有效内容，请稍后重试。");
    }
    // 如果 content 为空但有 reasoning_content，说明模型在思考中，取 reasoning_content 作为回复
    const finalContent = content || reasoningContent;
    const usage = data?.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || 0;
    // DeepSeek API 返回缓存命中 token 数（prompt_cache_hit_tokens）
    const cacheHitTokens = usage.prompt_cache_hit_tokens || 0;
    if (isThinking && reasoningContent) {
      console.log(`[DeepSeek] 思考模式回复成功，思维链长度=${reasoningContent.length}，最终答案长度=${content.length}，tokens=${totalTokens}，cacheHit=${cacheHitTokens}`);
    } else {
      console.log(`[DeepSeek] 回复成功，长度=${finalContent.length}，tokens=${totalTokens}，cacheHit=${cacheHitTokens}`);
    }
    return { content: finalContent, promptTokens, completionTokens, totalTokens, cacheHitTokens, modelUsed: apiModel };
  } catch (e) {
    console.error("[DeepSeek] 通信异常:", e);
    return errReply("与 DeepSeek 通信时发生错误，请稍后重试。");
  }
}

// -----------------------------------------------------------
// 微信客服：发送消息给外部用户
// -----------------------------------------------------------
async function sendKfMessage(openKfid: string, toUser: string, content: string): Promise<void> {
  try {
    const token = await getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token=${token}`;
    const body = {
      touser: toUser,
      open_kfid: openKfid,
      msgtype: "text",
      text: { content },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    if (data.errcode !== 0) {
      console.error(`[KF] 发送消息失败: errcode=${data.errcode} errmsg=${data.errmsg}`);
    } else {
      console.log(`[KF] 消息发送成功 to=${toUser}`);
    }
  } catch (e) {
    console.error("[KF] 发送消息异常:", e);
  }
}

// -----------------------------------------------------------
// 微信客服：发送素材消息（图片/视频/文件）
// 流程：先上传素材到企微获取media_id，再用media_id发送
// -----------------------------------------------------------
async function sendKfMaterial(openKfid: string, toUser: string, matType: string, storageUrl: string, title: string): Promise<void> {
  try {
    const token = await getAccessToken();
    console.log(`[KF-MAT] 开始发送素材 type=${matType} url=${storageUrl.substring(0, 80)}`);
    console.log(`[KF-MAT] 获取token成功`);

    // 1. 从云存储下载文件内容
    const fileRes = await fetch(storageUrl);
    if (!fileRes.ok) throw new Error(`下载素材失败: ${fileRes.status}`);
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
    console.log(`[KF-MAT] 下载文件成功 size=${fileBuffer.length} contentType=${contentType}`);

    // 2. 上传到企微媒体库获取 media_id
    // 企微上传接口：POST https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=xxx&type=image/video/file
    let wecomType = "file";
    if (matType === "image") wecomType = "image";
    else if (matType === "video") wecomType = "video";

    const uploadUrl = `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${token}&type=${wecomType}`;
    const fileName = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]/g, "_") + (matType === "image" ? ".jpg" : matType === "video" ? ".mp4" : ".file");

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: contentType });
    formData.append("media", blob, fileName);
    console.log(`[KF-MAT] 开始上传企微 wecomType=${wecomType} fileName=${fileName}`);

    const uploadRes = await fetch(uploadUrl, { method: "POST", body: formData });
    const uploadData = await uploadRes.json() as any;
    console.log(`[KF-MAT] 上传企微返回:`, JSON.stringify(uploadData).substring(0, 200));
    if (uploadData.errcode && uploadData.errcode !== 0) {
      throw new Error(`企微上传素材失败: errcode=${uploadData.errcode} errmsg=${uploadData.errmsg}`);
    }
    const mediaId = uploadData.media_id;
    if (!mediaId) throw new Error("企微上传素材未返回media_id");

    // 3. 用 media_id 发送消息
    const sendUrl = `https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token=${token}`;
    let msgBody: any;
    if (wecomType === "image") {
      msgBody = { touser: toUser, open_kfid: openKfid, msgtype: "image", image: { media_id: mediaId } };
    } else if (wecomType === "video") {
      msgBody = { touser: toUser, open_kfid: openKfid, msgtype: "video", video: { media_id: mediaId, title } };
    } else {
      msgBody = { touser: toUser, open_kfid: openKfid, msgtype: "file", file: { media_id: mediaId } };
    }

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msgBody),
    });
    const sendData = await sendRes.json() as any;
    if (sendData.errcode !== 0) {
      console.error(`[KF] 素材消息发送失败: errcode=${sendData.errcode} errmsg=${sendData.errmsg}`);
    } else {
      console.log(`[KF] 素材消息发送成功 type=${wecomType} to=${toUser}`);
    }
  } catch (e) {
    console.error("[KF] sendKfMaterial 异常:", e);
    throw e;
  }
}

// -----------------------------------------------------------
// 微信客服：处理 kf_msg_or_event 事件
// 流程：syncMsg拉取 → 知识库检索 → DeepSeek回复 → kf/send_msg发回 → 写日志
// -----------------------------------------------------------
async function handleKfMsgOrEvent(callbackToken: string, callbackOpenKfId: string): Promise<void> {
  console.log(`[KF-ENTRY] handleKfMsgOrEvent 被调用 token长度=${callbackToken.length} openKfId=${callbackOpenKfId}`);
  try {
    const token = await getAccessToken();

    // 0. 确定 open_kfid：优先用回调里的 OpenKfId，其次从数据库读
    let KF_OPEN_KFID = callbackOpenKfId || "";
    const dbConnForKfid = await getDbConnection();
    if (!KF_OPEN_KFID && dbConnForKfid) {
      try {
        const [kfRows] = await (dbConnForKfid as any).execute(
          "SELECT kf_id FROM wecom_channels WHERE channel_type = 'kf' AND kf_id IS NOT NULL LIMIT 1"
        );
        if ((kfRows as any[]).length > 0) KF_OPEN_KFID = (kfRows as any[])[0].kf_id || "";
      } catch (_) {}
    }
    if (!KF_OPEN_KFID) {
      console.error("[KF] 未找到有效的 open_kfid");
      return;
    }
    console.log(`[KF] 使用 open_kfid: ${KF_OPEN_KFID}, 回调token长度=${callbackToken.length}`);

    // 1. 读取上次保存的 cursor（按 open_kfid 持久化在 wecom_channel_kv）
    let cursor = "";
    const cursorKey = `kf_cursor_${KF_OPEN_KFID}`;
    if (dbConnForKfid) {
      try {
        const [curRows] = await (dbConnForKfid as any).execute(
          "SELECT config_val FROM wecom_channel_kv WHERE channel_type = 'kf' AND config_key = ? LIMIT 1",
          [cursorKey]
        );
        if ((curRows as any[]).length > 0) cursor = (curRows as any[])[0].config_val || "";
      } catch (_) {}
    }

    // 2. 拉取客服消息（POST，body传 token + cursor，循环拉完 has_more）
    const msgList: any[] = [];
    let safety = 0;
    while (safety < 10) {
      safety++;
      const body: any = { token: callbackToken, limit: 1000, open_kfid: KF_OPEN_KFID, voice_format: 0 };
      if (cursor) body.cursor = cursor;
      const syncRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg?access_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const syncData = await syncRes.json() as any;
      if (syncData.errcode !== 0) {
        console.error(`[KF] syncMsg失败: errcode=${syncData.errcode} errmsg=${syncData.errmsg}`);
        break;
      }
      const batch: any[] = syncData.msg_list || [];
      msgList.push(...batch);
      cursor = syncData.next_cursor || cursor;
      if (syncData.has_more !== 1) break;
    }

    // 3. 保存最新 cursor（避免下次重复拉取）
    if (cursor && dbConnForKfid) {
      try {
        await (dbConnForKfid as any).execute(
          "INSERT INTO wecom_channel_kv (channel_type, config_key, config_val) VALUES ('kf', ?, ?) ON DUPLICATE KEY UPDATE config_val = VALUES(config_val)",
          [cursorKey, cursor]
        );
      } catch (e) { console.error("[KF] 保存cursor失败:", e); }
    }

    console.log(`[KF] syncMsg拉取到 ${msgList.length} 条消息`);
    // 调试：记录非文本消息的原始结构（帮助排查语音等消息类型）
    for (const m of msgList) {
      if (m.msgtype !== 'text') {
        console.log(`[KF-DEBUG] 非文本消息 msgtype=${m.msgtype} origin=${m.origin} external_userid=${m.external_userid} raw=${JSON.stringify(m).substring(0, 300)}`);
      }
    }
    if (msgList.length === 0) return;

    // 4. 读取kf渠道配置（按 open_kfid 动态查找，不存在则自动注册）
    let systemPrompt = "";
    let aiModel = "deepseek-chat";
    let kbId: number | null = null;
    let notifyEnabled = false;
    let notifyUserids: string[] = [];
    let kfChannelId = 2;
    const dbConn = await getDbConnection();
    if (dbConn) {
      try {
        // 按 open_kfid 查找渠道
        const [chRows] = await (dbConn as any).execute(
          "SELECT id FROM wecom_channels WHERE channel_type = 'kf' AND kf_id = ? LIMIT 1",
          [KF_OPEN_KFID]
        );
        if ((chRows as any[]).length > 0) {
          kfChannelId = (chRows as any[])[0].id;
        } else {
          // 自动注册新渠道
          const [insertRes] = await (dbConn as any).execute(
            "INSERT INTO wecom_channels (name, channel_type, kf_id) VALUES (?, 'kf', ?)",
            [`新客服账号_${KF_OPEN_KFID.substring(0, 6)}`, KF_OPEN_KFID]
          );
          kfChannelId = (insertRes as any).insertId;
          console.log(`[KF] 自动注册新客服渠道: id=${kfChannelId}, kf_id=${KF_OPEN_KFID}`);
          
          // 为新渠道创建默认知识库
          await (dbConn as any).execute(
            "INSERT INTO wecom_knowledge_bases (name, description, channel_type, channel_id) VALUES (?, ?, 'kf', ?)",
            [`客服账号_${KF_OPEN_KFID.substring(0, 6)}知识库`, "自动创建的默认知识库", kfChannelId]
          );
        }
        const [cfgRows] = await (dbConn as any).execute(
          "SELECT config_key, config_val FROM wecom_channel_config WHERE channel_id = ?",
          [kfChannelId]
        );
        const cfg: Record<string, string> = {};
        for (const r of cfgRows as any[]) cfg[r.config_key] = r.config_val;
        if (cfg.ai_model) aiModel = cfg.ai_model;
        if (cfg.knowledge_base_id) kbId = parseInt(cfg.knowledge_base_id, 10) || null;
        notifyEnabled = cfg.notify_enabled === '1';
        notifyUserids = (cfg.notify_userids || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        // 从结构化指令表拼接 System Prompt
        // 先加载平台共享指令（channel_id=1），再加载私人指令（当前渠道）
        const disablePlatformRules = cfg.disable_platform_rules === '1';
        const [platformRuleRows] = disablePlatformRules
          ? [[]]
          : await (dbConn as any).execute(
              "SELECT layer, category, content FROM wecom_prompt_rules WHERE channel_id = 1 AND enabled = 1 ORDER BY layer ASC, sort_order ASC, id ASC",
              []
            );
        const [ruleRows] = await (dbConn as any).execute(
          "SELECT layer, category, content FROM wecom_prompt_rules WHERE channel_id = ? AND enabled = 1 ORDER BY layer ASC, sort_order ASC, id ASC",
          [kfChannelId]
        );
        const platformRules = platformRuleRows as any[];
        const rules = ruleRows as any[];
        // 平台共享指令：layer1（角色定义）+ layer2（行为规范）全部拼入
        const platformLayer1 = platformRules.filter((r: any) => r.layer === 1);
        const platformLayer2 = platformRules.filter((r: any) => r.layer === 2);
        // 私人指令：layer1（角色定义）+ layer2（行为规范）
        const privateLayer1 = rules.filter((r: any) => r.layer === 1);
        const privateLayer2 = rules.filter((r: any) => r.layer === 2);
        const parts: string[] = [];
        // 第一块：角色定义（平台 + 私人）
        const allLayer1 = [...platformLayer1, ...privateLayer1];
        if (allLayer1.length > 0) parts.push(allLayer1.map((r: any) => r.content).join("\n"));
        // 第二块：行为规范（平台 + 私人）
        const allLayer2 = [...platformLayer2, ...privateLayer2];
        if (allLayer2.length > 0) parts.push("行为规则：\n" + allLayer2.map((r: any, i: number) => `${i + 1}. ${r.content}`).join("\n"));
        if (parts.length > 0) systemPrompt = parts.join("\n\n");
        // 如果指令表为空，尝试读取旧的 system_prompt 字段兑底
        if (!systemPrompt && cfg.system_prompt) systemPrompt = cfg.system_prompt;
      } catch (e) { console.error("[KF] 读取渠道配置失败:", e); }
    }
    // 兜底：若配置里没有知识库ID，按 channel_id 找
    if (dbConn && !kbId) {
      try {
        const [kbRows] = await (dbConn as any).execute(
          "SELECT id FROM wecom_knowledge_bases WHERE channel_id = ? ORDER BY id LIMIT 1",
          [kfChannelId]
        );
        if ((kbRows as any[]).length > 0) kbId = (kbRows as any[])[0].id;
      } catch (_) {}
    }

    // 4. 遍历消息，处理文本和语音类型
    for (const msg of msgList) {
      if (msg.msgtype !== "text" && msg.msgtype !== "voice") continue;
      const fromUser: string = msg.external_userid || msg.open_kfid || "";
      if (!fromUser) continue;

      let userText: string = "";
      if (msg.msgtype === "voice") {
        // 语音消息：下载音频 → Whisper 转文字
        const mediaId: string = msg.voice?.media_id || msg.voice?.mediaid || "";
        if (!mediaId) continue;
        try {
          const kfToken = await getAccessToken();
          const audioResp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=${kfToken}&media_id=${encodeURIComponent(mediaId)}`);
          if (!audioResp.ok) throw new Error(`下载语音失败: ${audioResp.status}`);
          const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
          const mimeType = audioResp.headers.get("content-type") || "audio/amr";
          const asrResult = await callAIVoice(audioBuffer, mimeType, kfChannelId);
          if (!asrResult.text?.trim()) {
            await sendKfMessage(fromUser, kfOpenKfId, "(语音已收到，但未能识别内容，请重新发送或改用文字)");
            continue;
          }
          userText = asrResult.text.trim();
          console.log(`[KF] 语音识别成功 from=${fromUser} text=${userText.substring(0, 50)}`);
        } catch (e) {
          console.error(`[KF] 语音识别失败 from=${fromUser}: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
          await sendKfMessage(fromUser, kfOpenKfId, "(语音消息识别失败，请重新发送或改用文字)");
          continue;
        }
      } else {
        userText = msg.text?.content || "";
      }
      if (!userText) continue;

      console.log(`[KF] 处理消息 from=${fromUser} text=${userText.substring(0, 50)}`);

      // 5. 知识库检索（两层：系统默认知识库 + 私有知识库，合并检索，取前5条）
      let kbContext = "";
      if (dbConn) {
        try {
          // 收集需要检索的 kb_id 列表：该分身绑定的公共库 + 当前渠道私有库
          const kbIdSet = new Set<number>();
          // 该分身绑定的平台公共知识库（多对多，分身可自选）
          try {
            const [boundKbRows] = await (dbConn as any).execute(
              `SELECT sk.kb_id FROM wecom_channel_shared_kb sk
               JOIN wecom_knowledge_bases kb ON sk.kb_id = kb.id
               WHERE sk.channel_id = ? AND kb.is_shared = 1`,
              [kfChannelId]
            );
            for (const r of (boundKbRows as any[])) kbIdSet.add(r.kb_id);
          } catch (bindErr) {
            // 绑定表不存在或异常时，兜底回退到旧的 is_system 全继承逻辑
            console.error("[KF] 读取公共库绑定失败，回退 is_system:", bindErr);
            const [sysKbRows] = await (dbConn as any).execute(
              "SELECT id FROM wecom_knowledge_bases WHERE is_system = 1 ORDER BY id"
            );
            for (const r of (sysKbRows as any[])) kbIdSet.add(r.id);
          }
          // 当前渠道私有知识库
          if (kbId) kbIdSet.add(kbId);
          // 如果没有任何知识库，跳过
          if (kbIdSet.size > 0) {
            const kbIds = Array.from(kbIdSet);
            let kbItems: any[] = [];
            // 【优先】向量语义检索：理解语义，避免字面不符就漏检
            if (isVectorEnabled()) {
              try {
                const hits = await searchKnowledgeSemantic(dbConn, kbIds, userText, 5, 0.5);
                if (hits && hits.length > 0) {
                  kbItems = hits.map((h) => ({ question: h.question, answer: h.answer }));
                  console.log(`[KF] 知识库语义命中 ${kbItems.length} 条，最高分 ${(hits[0].score * 100).toFixed(1)}%`);
                }
              } catch (ve) {
                console.error("[KF] 向量检索异常，降级关键词:", ve);
              }
            }
            // 【兜底】向量无命中或未启用时，回退到原关键词 LIKE 匹配
            // 提取关键词：保留2字以上的词，最多取8个
            const keywords = userText.replace(/[？?！!。，,、\s]/g, " ").split(" ").filter((k: string) => k.length >= 2).slice(0, 8);
            if (kbItems.length === 0 && keywords.length > 0) {
              const kbPlaceholders = kbIds.map(() => "?").join(",");
              // 第一步：优先按问题字段匹配（命中率更高）
              const qLike = keywords.map(() => "question LIKE ?").join(" OR ");
              const qParams = keywords.map((kw: string) => `%${kw}%`);
              const [qItems] = await (dbConn as any).execute(
                `SELECT question, answer FROM wecom_knowledge_items WHERE kb_id IN (${kbPlaceholders}) AND enabled = 1 AND (${qLike}) LIMIT 5`,
                [...kbIds, ...qParams]
              );
              kbItems = (qItems as any[]);
              // 第二步：若问题字段命中不足3条，补充答案字段匹配
              if (kbItems.length < 3) {
                const existingQs = new Set(kbItems.map((i: any) => i.question));
                const aLike = keywords.map(() => "answer LIKE ?").join(" OR ");
                const aParams = keywords.map((kw: string) => `%${kw}%`);
                const [aItems] = await (dbConn as any).execute(
                  `SELECT question, answer FROM wecom_knowledge_items WHERE kb_id IN (${kbPlaceholders}) AND enabled = 1 AND (${aLike}) LIMIT 5`,
                  [...kbIds, ...aParams]
                );
                for (const item of (aItems as any[])) {
                  if (!existingQs.has(item.question)) kbItems.push(item);
                  if (kbItems.length >= 5) break;
                }
              }
            }
            // 生成知识库上下文（向量命中或关键词命中均适用）
            if (kbItems.length > 0) {
              kbContext = "\n\n【知识库标准答案——必须优先使用】\n" + kbItems.slice(0, 5).map((item: any, i: number) =>
                `${i + 1}. 问：${(item.question || "").split("\n")[0]}\n   答：${item.answer}`
              ).join("\n") + "\n【重要】以上是标准答案，回复时必须严格依照上述内容，不得修改或忽略。";
            }
          }
        } catch (e) {
          console.error("[KF] 知识库检索失败:", e);
        }
      }

      // 6. 数字分身语料检索（若 twin_enabled=1，取前3条优质语料作为回复风格示例）
      let twinContext = "";
      if (dbConn) {
        try {
          const [[twinRow]] = await (dbConn as any).execute(
            `SELECT twin_enabled FROM wecom_digital_twin WHERE channel_id = ? LIMIT 1`,
            [kfChannelId]
          ) as any;
          if (twinRow && twinRow.twin_enabled === 1) {
            const [corpusRows] = await (dbConn as any).execute(
              `SELECT user_msg, agent_reply FROM wecom_corpus WHERE channel_id = ? AND quality = 1 ORDER BY id DESC LIMIT 3`,
              [kfChannelId]
            ) as any;
            if ((corpusRows as any[]).length > 0) {
              twinContext = "\n\n[参考回复风格示例（请模仿这些示例的语气和表达方式）]\n" +
                (corpusRows as any[]).map((r: any, i: number) =>
                  `${i + 1}. 客户问：${r.user_msg.substring(0, 80)}\n   回复：${r.agent_reply.substring(0, 120)}`
                ).join("\n") +
                "\n[风格要求]回复时请保持上述示例的语气、节奏和表达风格";
              console.log(`[KF] 数字分身语料命中 ${(corpusRows as any[]).length} 条`);
            }
          }
        } catch (_) {}
      }

      // 6b. 构建system prompt（含知识库内容）
      // 6c. 素材库：系统层面语义匹配，不依赖AI加标记
      // 用用户消息与素材触发描述做关键词/语义匹配，命中则在AI回复后直接发送素材
      let materialsToSend: Array<{ id: number; type: string; storage_url: string; title: string }> = [];
      if (dbConn) {
        try {
          const [matRows] = await (dbConn as any).execute(
            `SELECT id, type, title, description, storage_url FROM wecom_materials WHERE channel_id = ? AND is_active = 1 AND description != '' ORDER BY id`,
            [kfChannelId]
          ) as any;
          console.log(`[KF] 素材库查询: channel_id=${kfChannelId}, 查到条数=${(matRows as any[]).length}`);
          if ((matRows as any[]).length > 0) {
            console.log(`[KF] 素材列表:`, (matRows as any[]).map((r: any) => `id=${r.id} title=${r.title}`).join(', '));
            // 系统层面匹配：把用户消息与每条素材的触发描述做关键词重叠度计算
            const userWords = userText.replace(/[，。！？、\s]/g, '').split('');
            for (const r of (matRows as any[])) {
              const desc: string = r.description || '';
              // 提取描述中的关键词（去掉常见停用词）
              const stopWords = new Set(['当', '客', '户', '问', '到', '的', '时', '候', '我', '们', '会', '把', '这', '张', '发', '给', '他', '她', '可', '以', '在', '或', '者', '如', '果', '想', '要', '了', '和', '与', '及', '等', '一', '个', '这', '那', '是', '有', '没', '能', '不', '都', '也', '就', '了', '啊', '呢', '吧']);
              const descWords = desc.replace(/[，。！？、\s]/g, '').split('').filter((c: string) => c.length > 0 && !stopWords.has(c));
              // 计算用户消息与描述的字符重叠数
              const userSet = new Set(userWords);
              const overlap = descWords.filter((c: string) => userSet.has(c)).length;
              const score = descWords.length > 0 ? overlap / descWords.length : 0;
              console.log(`[KF] 素材匹配 id=${r.id} title=${r.title} overlap=${overlap}/${descWords.length} score=${score.toFixed(2)}`);
              // 阈值：重叠率>=15% 或 重叠字数>=3 则触发发送
              if (score >= 0.15 || overlap >= 3) {
                materialsToSend.push({ id: r.id, type: r.type, storage_url: r.storage_url, title: r.title });
                console.log(`[KF] 素材命中 id=${r.id} title=${r.title}，将在AI回复后发送`);
              }
            }
          }
        } catch (matErr: any) {
          console.error(`[KF] 素材库查询异常 channel_id=${kfChannelId}:`, matErr?.message || matErr);
        }
      }

      console.log(`[KF] 构建 fullSystemPrompt: kfChannelId=${kfChannelId} materialsToSend=${materialsToSend.length}条`);
      const fullSystemPrompt = systemPrompt + twinContext + kbContext;

      // 7. 调用DeepSeek获取回复
      const dsReply = await sendToDeepSeekAndGetReply(userText, aiModel, fullSystemPrompt, "chat_reply");
      console.log(`[KF] DeepSeek回复 tokens=${dsReply.totalTokens} 内容=${dsReply.content.substring(0, 50)}`);

      // 8. 发送回复给用户
      console.log(`[KF] AI原始回复(${dsReply.content.length}字): ${dsReply.content.substring(0, 200)}`);
      const replyContent = dsReply.content;
      
      await sendKfMessage(KF_OPEN_KFID, fromUser, replyContent);

      // 8b. 发送素材消息（系统层面匹配命中的素材，在AI回复后发送）
      console.log(`[KF] 即将发送素材 materialsToSend.length=${materialsToSend.length}`);
      for (const mat of materialsToSend) {
        if (!mat.storage_url) continue;
        try {
          await sendKfMaterial(KF_OPEN_KFID, fromUser, mat.type, mat.storage_url, mat.title);
          console.log(`[KF] 素材发送成功 matId=${mat.id} type=${mat.type} title=${mat.title}`);
        } catch (matErr) {
          console.error(`[KF] 素材发送失败 matId=${mat.id}:`, matErr);
        }
      }

      // 9. 抄送通知给指定企业成员
      if (notifyEnabled && notifyUserids.length > 0) {
        const notifyContent = `【微信客服消息抄送】\n客户：${fromUser}\n问：${userText.substring(0, 200)}\nAI回：${dsReply.content.substring(0, 300)}`;
        for (const uid of notifyUserids) {
          await sendWeComMessage(uid, notifyContent);
        }
      }

      // 10. 写入消息日志
      if (dbConn) {
        try {
          const cacheHitTokens = dsReply.cacheHitTokens || 0;
          const inputTokensMiss = Math.max(0, dsReply.promptTokens - cacheHitTokens);
          const [insertResult] = await (dbConn as any).execute(
            `INSERT INTO wecom_message_credits
             (wecom_user_id, manus_task_id, user_message, credits_before, credits_after, credits_used, input_tokens, output_tokens, cache_hit_tokens, model_used, reply_preview, channel_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [fromUser, `kf-deepseek-${kfChannelId}`, userText.substring(0, 200), 0, dsReply.totalTokens, dsReply.totalTokens,
             inputTokensMiss, dsReply.completionTokens, cacheHitTokens, dsReply.modelUsed || aiModel, dsReply.content.substring(0, 100), 'kf']
          );
          // 异步触发对话评分（不阻塞回复发送）
          const newLogId = (insertResult as any).insertId;
          if (newLogId) {
            setImmediate(async () => {
              try {
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
星级标准：5星=极优精选训练集，4星=良好备选语料，3星=一般参考语料，2星=较差建议修改，1星=低质过滤丢弃。必须使用半星精度（如3.5、4.0、4.5）。`;
                const scoreUserPrompt = `用户消息：${userText.substring(0, 300)}
AI回复：${dsReply.content.substring(0, 300)}`;
                const scoreReply = await sendToDeepSeekAndGetReply(scoreUserPrompt, 'deepseek-chat', scoreSystemPrompt, 'chat_score');
                let stars = 3.0, reason = '', dimensions: any = null;
                try {
                  const m = scoreReply.content.match(/\{[\s\S]*\}/);
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
                // 确保字段存在
                // 评分字段已在 initDb 中初始化，此处跳过
                await (dbConn as any).execute(
                  `UPDATE wecom_message_credits SET dialog_score=?, score_level=?, score_reason=?, score_dimensions=?, score_at=NOW() WHERE id=?`,
                  [score, level, reason, dimJson, newLogId]
                );
                console.log(`[KF评分] logId=${newLogId} stars=${stars} level=${level}`);
              } catch (se) {
                console.error('[KF评分] 失败:', se);
              }
            });
          }
        } catch (e) {
          console.error("[KF] 写入日志失败:", e);
        }
      }
    }
  } catch (e) {
    console.error("[KF] handleKfMsgOrEvent异常:", e);
  }
}

// -----------------------------------------------------------
// 中间件：解析 text/xml body
// -----------------------------------------------------------
const xmlBodyParser = expressText({ type: ["text/xml", "application/xml"] });

// -----------------------------------------------------------
// GET /api/wecom/callback -- 企业微信服务器URL验证
// -----------------------------------------------------------
router.get("/api/wecom/callback", (req: Request, res: Response) => {
  const { msg_signature, timestamp, nonce, echostr } = req.query as Record<string, string>;

  if (!msg_signature || !timestamp || !nonce || !echostr) {
    return res.status(400).send("参数缺失");
  }

  // 验证签名（加密模式：token + timestamp + nonce + echostr 排序后 SHA1）
  const expectedSig = computeSignature(WECOM_TOKEN, timestamp, nonce, echostr);
  if (expectedSig !== msg_signature) {
    console.error("[WeCom] URL验证签名失败", { expectedSig, msg_signature });
    return res.status(403).send("签名验证失败");
  }

  // 解密 echostr
  const decrypted = decryptWeCom(echostr);
  if (!decrypted) {
    return res.status(500).send("解密失败");
  }

  console.log("[WeCom] URL验证成功");
  res.send(decrypted);
});

// -----------------------------------------------------------
// POST /api/wecom/callback -- 接收企业微信用户消息
// -----------------------------------------------------------
router.post("/api/wecom/callback", xmlBodyParser, async (req: Request, res: Response) => {
  // 先返回200，避免企业微信超时重试
  res.status(200).send("success");

  try {
    await ensureSessionTable();

    const { msg_signature, timestamp, nonce } = req.query as Record<string, string>;

    // 获取原始 XML body
    let xmlContent: string;
    if (typeof req.body === "string") {
      xmlContent = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      xmlContent = req.body.toString("utf8");
    } else {
      // 如果 body 已经被其他中间件解析为对象
      console.error("[WeCom] body 类型异常:", typeof req.body);
      return;
    }

    console.log("[WeCom] 收到POST请求，body长度:", xmlContent.length);

    // 解析外层XML
    let parsed: any;
    try {
      parsed = await parseStringPromise(xmlContent, { explicitArray: false });
    } catch (e) {
      console.error("[WeCom] XML解析失败:", e, "原始内容:", xmlContent?.substring(0, 200));
      return;
    }

    const xml = parsed?.xml;
    if (!xml) {
      console.error("[WeCom] 解析后无xml节点");
      return;
    }

    const encryptedMsg = xml.Encrypt;
    if (!encryptedMsg) {
      console.error("[WeCom] 消息中无Encrypt字段");
      return;
    }

    // 验证签名
    if (msg_signature && timestamp && nonce) {
      const expectedSig = computeSignature(WECOM_TOKEN, timestamp, nonce, encryptedMsg);
      if (expectedSig !== msg_signature) {
        console.error("[WeCom] 消息签名验证失败");
        return;
      }
    }

    // 解密消息
    const decryptedXml = decryptWeCom(encryptedMsg);
    if (!decryptedXml) {
      console.error("[WeCom] 消息解密失败");
      return;
    }

    console.log("[WeCom] 解密后内容:", decryptedXml.substring(0, 200));

    // 解析解密后的XML
    let innerParsed: any;
    try {
      innerParsed = await parseStringPromise(decryptedXml, { explicitArray: false });
    } catch (e) {
      console.error("[WeCom] 内层XML解析失败:", e);
      return;
    }

    const innerXml = innerParsed?.xml;
    if (!innerXml) return;

    const userId = innerXml.FromUserName;
    const innerMsgType = innerXml.MsgType;
    const content = innerXml.Content;
    const event = innerXml.Event;

    console.log(`[WeCom] 收到消息 from=${userId} type=${innerMsgType} content=${content}`);

    // 处理事件类型（菜单点击等）
    if (innerMsgType === "event") {
      if (event === "subscribe") {
        await sendWeComMessage(userId, "您好！我是脉动网 AI 助手，有任何需求直接告诉我即可。");
      } else if (event === "click") {
        const eventKey = innerXml.EventKey;
        if (eventKey) {
          await handleMenuClick(userId, eventKey);
        }
      } else if (event === "kf_msg_or_event") {
        // ===== 微信客服消息处理 =====
        // 回调里携带临时 Token（用于 sync_msg 校验）和 OpenKfId（有新消息的客服账号）
        const kfToken = innerXml.Token || "";
        const kfOpenKfId = innerXml.OpenKfId || "";
        await handleKfMsgOrEvent(kfToken, kfOpenKfId);
      }
      return;
    }

    // 处理语音消息：下载 AMR → 调 Whisper 转文字 → 当作文字消息继续处理
    let finalContent = content || "";
    if (innerMsgType === "voice") {
      const mediaId = innerXml.MediaId || innerXml.media_id || "";
      if (!mediaId || !userId) return;
      try {
        const token = await getAccessToken();
        const audioResp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=${token}&media_id=${encodeURIComponent(mediaId)}`);
        if (!audioResp.ok) throw new Error(`下载语音失败: ${audioResp.status}`);
        const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
        const mimeType = audioResp.headers.get("content-type") || "audio/amr";
        const asrResult = await callAIVoice(audioBuffer, mimeType);
        if (!asrResult.text?.trim()) {
          await sendWeComMessage(userId, "（语音已收到，但未能识别内容，请重新发送或改用文字）");
          return;
        }
        finalContent = asrResult.text.trim();
        console.log(`[WeCom] 语音识别成功 from=${userId} text=${finalContent.substring(0, 50)}`);
      } catch (e) {
        console.error(`[WeCom] 语音识别失败 from=${userId}:`, e);
        await sendWeComMessage(userId, "（语音消息识别失败，请重新发送或改用文字）");
        return;
      }
    } else if (innerMsgType !== "text" || !content || !userId) {
      // 其他非文字非语音类型，静默忽略
      return;
    }

    // 自动拉取企微昵称（nickname为空时触发，异步不阻塞主流程）
    (async () => {
      try {
        const conn = await getDbConnection();
        if (!conn) return;
        const [rows] = await (conn as any).execute(
          "SELECT nickname FROM wecom_manus_sessions WHERE wecom_user_id = ? LIMIT 1",
          [userId]
        ) as any;
        const existingNickname = rows?.[0]?.nickname;
        if (existingNickname) return; // 已有昵称，不再拉取
        const token = await getAccessToken();
        let nickname = "";
        if (userId.startsWith("wm")) {
          // 外部联系人
          const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/externalcontact/get?access_token=${token}&external_userid=${encodeURIComponent(userId)}`);
          const data = await res.json() as any;
          nickname = data?.contact_detail?.name || data?.contact?.name || "";
        } else {
          // 内部员工
          const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${token}&userid=${encodeURIComponent(userId)}`);
          const data = await res.json() as any;
          nickname = data?.name || "";
        }
        if (nickname) {
          await (conn as any).execute(
            "UPDATE wecom_manus_sessions SET nickname = ? WHERE wecom_user_id = ?",
            [nickname, userId]
          );
          console.log(`[WeCom] 自动拉取昵称成功: ${userId} -> ${nickname}`);
        }
      } catch (e) {
        console.error(`[WeCom] 自动拉取昵称失败: ${userId}`, e);
      }
    })();

    // 获取用户当前模型偏好
    let userModelProfile = await getUserModel(userId);

    // ===== 专属规则优先级检查（高于全局路由）=====
    // hitCustomRule 标志：一旦命中规则并开始处理，无论后续是否异常都不再走全局路由
    let hitCustomRule = false;
    try {
      const ruleConn = await getDbConnection();
      if (ruleConn) {
        const [ruleRows] = await (ruleConn as any).execute(
          `SELECT * FROM wecom_custom_rules WHERE enabled = 1 AND channel_type = 'app' ORDER BY created_at ASC`
        ) as any;
        const allRules = ruleRows as any[];
        // 筛选出适用于当前用户的规则
        const applicableRules = allRules.filter((rule: any) => {
          if (rule.target_type === 'all') return true;
          try {
            const ids: string[] = JSON.parse(rule.target_user_ids || '[]');
            return ids.includes(userId);
          } catch { return false; }
        });
        if (applicableRules.length > 0) {
          // 用分类模型逐条判断是否命中
          for (const rule of applicableRules) {
            const intentPrompt = `你是意图匹配器，只回复 1 或 0，不解释。\n\n意图描述：${rule.trigger_intent}\n\n用户消息：${finalContent}\n\n是否匹配（1=是 0=否）：`;
            const matchResult = await classifyMessage(finalContent, intentPrompt, 'deepseek-chat');
            if (matchResult.result === 1) {
              // 命中！立即设置标志位，确保后续任何异常都不会再走全局路由
              hitCustomRule = true;
              console.log(`[专属规则] 用户 ${userId} 命中规则「${rule.rule_name}」`);
              // 更新触发计数
              await (ruleConn as any).execute(
                `UPDATE wecom_custom_rules SET trigger_count = trigger_count + 1 WHERE id = ?`, [rule.id]
              ).catch(() => {});
              if (rule.reply_mode === 'template') {
                // 固定模板回复
                const replyText = (rule.template_text || '').replace(/\\n/g, '\n');
                await sendWeComMessage(userId, replyText || '（模板内容为空）');
              } else {
                // 专属 AI 回复
                const ruleModel = rule.ai_model || 'deepseek-chat';
                const rulePrompt = rule.ai_system_prompt || '';
                const isRuleDeepSeek = DEEPSEEK_PROFILES.has(ruleModel);
                let waitingMsg2 = '收到，AI 正在思考中，请稍候...';
                try {
                  const [wRows] = await (ruleConn as any).execute(
                    `SELECT config_val FROM wecom_route_config WHERE config_key = 'waiting_msg' LIMIT 1`
                  ) as any;
                  if ((wRows as any[]).length > 0 && (wRows as any[])[0].config_val) waitingMsg2 = (wRows as any[])[0].config_val;
                } catch (_) {}
                await sendWeComMessage(userId, waitingMsg2);
                if (isRuleDeepSeek) {
                  const dsReply = await sendToDeepSeekAndGetReply(finalContent, ruleModel, rulePrompt || undefined, 'rule_reply');
                  const chunks = dsReply.content.match(/[\s\S]{1,2000}/g) || [dsReply.content];
                  for (const chunk of chunks) {
                    await sendWeComMessage(userId, chunk);
                    await new Promise(r => setTimeout(r, 500));
                  }
                } else {
                  // Manus 路径：把专属 System Prompt 拼接到消息前面注入
                  const taskId = await getOrCreateManusTask(userId);
                  if (taskId) {
                    const manusContent = rulePrompt
                      ? `[系统指令]\n${rulePrompt}\n\n[用户消息]\n${finalContent}`
                      : finalContent;
                    const reply = await sendToManusAndGetReply(taskId, manusContent, ruleModel);
                    // 如果 Manus 返回空内容（沉默规则），不发任何消息
                    if (reply.text || reply.imageUrls.length > 0 || reply.fileAttachments.length > 0) {
                      const chunks = reply.text.match(/[\s\S]{1,2000}/g) || [reply.text];
                      for (const chunk of chunks) {
                        if (chunk.trim()) await sendWeComMessage(userId, chunk);
                        await new Promise(r => setTimeout(r, 500));
                      }
                      for (const imgUrl of reply.imageUrls) {
                        await sendWeComImage(userId, imgUrl);
                      }
                    }
                  }
                }
              }
              return; // 专属规则已处理，跳过后续全局路由
            }
          }
        }
      }
    } catch (ruleErr) {
      console.error('[专属规则] 检查/执行异常:', ruleErr);
      // 如果已命中规则（hitCustomRule=true），即使出现异常也不走全局路由，避免重复回复
      if (hitCustomRule) return;
    }

    // ===== AI 智能路由：如开启，自动分类派发 =====
    const startTime = Date.now();
    let classifierResult = 0;
    let classifierTokens = 0;
    const routeConfig = await getRouteConfig();
    // 当用户已选择 auto_route，或全局路由开关开启时，触发智能分类
    const shouldRoute = userModelProfile === "auto_route" || (routeConfig.enabled && routeConfig.classifierPrompt);
    if (shouldRoute && routeConfig.classifierPrompt) {
      const cls = await classifyMessage(finalContent, routeConfig.classifierPrompt, routeConfig.classifierModel);
      classifierResult = cls.result;
      classifierTokens = cls.tokens;
      // 根据分类结果覆盖模型
      if (classifierResult === 1) userModelProfile = "deepseek-chat";
      else if (classifierResult === 2) userModelProfile = "deepseek-v4-flash"; // 深思模式占位，当前用 flash
      else if (classifierResult === 3) userModelProfile = "manus-1.6"; // 默认派给 Manus 标准
      console.log(`[Router] 用户 ${userId} 消息路由到: ${userModelProfile}`);
    } else if (userModelProfile === "auto_route") {
      // 路由配置不完整，默认使用 DeepSeek Flash
      userModelProfile = "deepseek-chat";
      console.log(`[Router] 用户 ${userId} auto_route 无路由配置，默认用 deepseek-chat`);
    }

    const isDeepSeek = DEEPSEEK_PROFILES.has(userModelProfile);
    const modelEntry = Object.values(MODEL_PROFILES).find(m => m.profile === userModelProfile);
    const modelEmoji = modelEntry?.emoji || "";
    const modelShortLabel = modelEntry?.label.split("\uff08")[0] || userModelProfile;

    // 读取可配置的等待提示语和全局 system_prompt
    let waitingMsg = "收到，AI 正在思考中，请稍候...";
    let globalSystemPrompt = "";
    try {
      const cfgConn = await getDbConnection();
      if (cfgConn) {
        const [cfgRows] = await (cfgConn as any).execute(
          "SELECT config_key, config_val FROM wecom_route_config WHERE config_key IN ('waiting_msg','system_prompt')"
        ) as any;
        for (const r of (cfgRows as any[])) {
          if (r.config_key === 'waiting_msg' && r.config_val) waitingMsg = r.config_val;
          if (r.config_key === 'system_prompt') globalSystemPrompt = r.config_val || "";
        }
      }
    } catch (_) {}

    if (isDeepSeek) {
      // ===== DeepSeek 路径 =====
      // 检查功能开关
      const dsEnabled = await isAIFeatureEnabled("wecom_deepseek");
      if (!dsEnabled) {
        await sendWeComMessage(userId, "抱歉，DeepSeek 功能暂时未开放，请切换到 Manus 模式使用。");
        return;
      }
      await sendWeComMessage(userId, waitingMsg);
      const dsReply = await sendToDeepSeekAndGetReply(finalContent, userModelProfile, globalSystemPrompt || undefined, 'chat_reply');
      const dsReplyText = dsReply.content;
      if (dsReplyText.length <= 2048) {
        await sendWeComMessage(userId, dsReplyText);
      } else {
        const chunks = dsReplyText.match(/[\s\S]{1,2000}/g) || [dsReplyText];
        for (const chunk of chunks) {
          await sendWeComMessage(userId, chunk);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      // 记录到数据库并查询累计 token
      try {
        const dbConn = await getDbConnection();
        if (dbConn) {
          // 查询该用户历史累计 token
          const [tokenRows] = await (dbConn as any).execute(
            `SELECT COALESCE(SUM(credits_used), 0) AS total_tokens FROM wecom_message_credits WHERE wecom_user_id = ? AND manus_task_id = 'deepseek'`,
            [userId]
          ) as any;
          const prevTotalTokens = Number((tokenRows as any[])[0]?.total_tokens || 0);
          const newTotalTokens = prevTotalTokens + dsReply.totalTokens;
          // 从 DeepSeek API 返回的 usage 中提取各类 token
          // prompt_cache_hit_tokens: 缓存命中的输入token（价格优惠）
          // prompt_tokens - prompt_cache_hit_tokens: 缓存未命中的输入token（正常价格）
          const cacheHitTokens = dsReply.cacheHitTokens || 0;
          const inputTokensMiss = Math.max(0, dsReply.promptTokens - cacheHitTokens);
          await (dbConn as any).execute(
            `INSERT INTO wecom_message_credits
             (wecom_user_id, manus_task_id, user_message, credits_before, credits_after, credits_used, input_tokens, output_tokens, cache_hit_tokens, model_used, reply_preview, channel_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'app')`,
            [userId, "deepseek", finalContent.substring(0, 200), prevTotalTokens, newTotalTokens, dsReply.totalTokens,
             inputTokensMiss, dsReply.completionTokens, cacheHitTokens, userModelProfile, dsReply.content.substring(0, 100)]
          );
          // 计算本次 DeepSeek 费用
          const dsCost = calcDeepSeekCost(userModelProfile, inputTokensMiss, cacheHitTokens, dsReply.completionTokens);
          if (dsReply.totalTokens > 0) {
            await sendWeComMessage(userId, `─────────────\n本次消耗：${dsReply.totalTokens} tokens（≈¥${dsCost.toFixed(4)}）\n累计消耗：${newTotalTokens} tokens`);
          }
          // 写入路由日志
          if (classifierResult > 0) {
            try {
              await (dbConn as any).execute(
                "INSERT INTO wecom_route_log (wecom_user_id, user_message, classifier_result, routed_to, tokens_classify, tokens_reply, latency_ms) VALUES (?,?,?,?,?,?,?)",
                [userId, finalContent.substring(0, 200), classifierResult, userModelProfile, classifierTokens, dsReply.totalTokens, Date.now() - startTime]
              );
            } catch (_) {}
          }
        }
      } catch (_) {}

    } else {
      // ===== Manus 路径 =====
      await sendWeComMessage(userId, waitingMsg);

      const taskId = await getOrCreateManusTask(userId);
      if (!taskId) {
        await sendWeComMessage(userId, "系统初始化失败，请联系管理员。");
        return;
      }

      // 注入 system_prompt（全局配置 + 用户级配置叠加）
      let manusContent = finalContent;
      try {
        let combinedPrompt = globalSystemPrompt;
        const conn = await getDbConnection();
        if (conn) {
          const [rows] = await (conn as any).execute(
            "SELECT system_prompt FROM wecom_manus_sessions WHERE wecom_user_id = ? LIMIT 1",
            [userId]
          ) as any;
          const userSystemPrompt = (rows as any[])[0]?.system_prompt || "";
          if (userSystemPrompt) {
            combinedPrompt = combinedPrompt ? `${combinedPrompt}\n${userSystemPrompt}` : userSystemPrompt;
          }
        }
        if (combinedPrompt) {
          manusContent = `[系统指令：${combinedPrompt}]\n\n${finalContent}`;
        }
      } catch (_) {}

      // 发消息前查询积分
      let creditsBefore = 0;
      try {
        const beforeRes = await fetch(`${MANUS_API_BASE}/task.detail?task_id=${taskId}`, {
          headers: { "x-manus-api-key": MANUS_API_KEY },
        });
        const beforeData = await beforeRes.json() as any;
        if (beforeData.ok && beforeData.task) {
          creditsBefore = beforeData.task.credit_usage || 0;
        }
      } catch (_) {}

      const reply = await sendToManusAndGetReply(taskId, manusContent, userModelProfile);

      // 回复后计算差值并写入数据库
      try {
        const afterRes = await fetch(`${MANUS_API_BASE}/task.detail?task_id=${taskId}`, {
          headers: { "x-manus-api-key": MANUS_API_KEY },
        });
        const afterData = await afterRes.json() as any;
        const creditsAfter = (afterData.ok && afterData.task) ? (afterData.task.credit_usage || 0) : creditsBefore;
        const creditsUsed = Math.max(0, creditsAfter - creditsBefore);
        const replyPreview = reply.text ? reply.text.substring(0, 100) : (reply.imageUrls.length > 0 ? "[图片]" : "[文件]");
        const dbConn = await getDbConnection();
        if (dbConn) {
          await (dbConn as any).execute(
            `INSERT INTO wecom_message_credits
             (wecom_user_id, manus_task_id, user_message, credits_before, credits_after, credits_used, model_used, reply_preview, channel_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'app')`,
            [userId, taskId, finalContent.substring(0, 200), creditsBefore, creditsAfter, creditsUsed, userModelProfile, replyPreview]
          );
          console.log(`[Credits] 用户 ${userId} 本次消耗 ${creditsUsed} 积分 (${creditsBefore} -> ${creditsAfter})`);
        }
      } catch (creditsErr) {
        console.error("[Credits] 记录积分失败:", creditsErr);
      }

      // 发送回复（带模型 Emoji 标识）
      if (reply.text) {
        const manusReplyText = reply.text;
        if (manusReplyText.length <= 2048) {
          await sendWeComMessage(userId, manusReplyText);
        } else {
          const chunks = manusReplyText.match(/[\s\S]{1,2000}/g) || [manusReplyText];
          for (const chunk of chunks) {
            await sendWeComMessage(userId, chunk);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      for (const imgUrl of reply.imageUrls) {
        await sendWeComImage(userId, imgUrl);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      for (const att of reply.fileAttachments) {
        const ext = att.filename.split(".").pop()?.toLowerCase() || "";
        const isVideo = att.type === "video" || ["mp4", "mov", "avi", "mkv", "webm"].includes(ext);
        if (isVideo) {
          // 视频：自动下载压缩后以视频消息发送
          await sendWeComVideo(userId, att.url, att.filename);
        } else {
          // 其他文件（PDF/PPT/Excel/Word/音频/压缩包等）：上传企微素材库发文件消息
          await sendWeComFile(userId, att.url, att.filename);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // 发送积分消耗统计
      try {
        const afterRes2 = await fetch(`${MANUS_API_BASE}/task.detail?task_id=${taskId}`, {
          headers: { "x-manus-api-key": MANUS_API_KEY },
        });
        const afterData2 = await afterRes2.json() as any;
        const creditsAfterFinal = (afterData2.ok && afterData2.task) ? (afterData2.task.credit_usage || 0) : creditsBefore;
        const creditsUsedFinal = Math.max(0, creditsAfterFinal - creditsBefore);
        if (creditsUsedFinal > 0) {
          const cnyThis = (creditsUsedFinal * 0.037).toFixed(2);
          const cnyTotal = (creditsAfterFinal * 0.037).toFixed(2);
          await sendWeComMessage(userId, `─────────────\n本次新增：${creditsUsedFinal} 积分 | ${cnyThis} 元 | ${modelShortLabel}\n项目累计：${creditsAfterFinal} 积分 | ${cnyTotal} 元`);
        }
        // 写入路由日志
        if (classifierResult > 0) {
          try {
            const logConn = await getDbConnection();
            if (logConn) {
              await (logConn as any).execute(
                "INSERT INTO wecom_route_log (wecom_user_id, user_message, classifier_result, routed_to, tokens_classify, tokens_reply, latency_ms) VALUES (?,?,?,?,?,?,?)",
                [userId, content.substring(0, 200), classifierResult, userModelProfile, classifierTokens, creditsUsedFinal, Date.now() - startTime]
              );
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

  } catch (e) {
    console.error("[WeCom] 处理消息异常:", e);
  }
});

// -----------------------------------------------------------
// 管理API：查询所有绑定关系（并发拉取 Manus 标题 + 企微真实姓名头像）
// -----------------------------------------------------------
router.get("/api/wecom/sessions", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      "SELECT id, wecom_user_id, manus_task_id, nickname, model_pref, system_prompt, enabled, status, created_at, updated_at FROM wecom_manus_sessions ORDER BY updated_at DESC"
    ) as any;
    const sessions = rows as any[];

    // 获取企微 access_token
    let wecomToken = "";
    try {
      const tokenRes = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECOM_CORP_ID}&corpsecret=${WECOM_SECRET}`
      );
      const tokenData = await tokenRes.json() as any;
      wecomToken = tokenData.access_token || "";
    } catch { /* 如果获取失败就继续 */ }

    // 并发拉取：Manus 任务标题 + 企微成员信息
    const enriched = await Promise.all(
      sessions.map(async (s: any) => {
        const [manusRes, wecomRes] = await Promise.allSettled([
          // 1. Manus 任务标题
          fetch(`${MANUS_API_BASE}/task.detail?task_id=${s.manus_task_id}`, {
            headers: { "x-manus-api-key": MANUS_API_KEY }
          }).then(r => r.json()) as Promise<any>,
          // 2. 企微成员信息（姓名 + 头像）
          wecomToken
            ? fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${wecomToken}&userid=${encodeURIComponent(s.wecom_user_id)}`)
                .then(r => r.json()) as Promise<any>
            : Promise.resolve(null)
        ]);

        const taskTitle = manusRes.status === "fulfilled" && manusRes.value?.ok
          ? (manusRes.value.task?.title || "")
          : "";

        const wecomUser = wecomRes.status === "fulfilled" ? wecomRes.value : null;
        const wecomName = wecomUser?.errcode === 0 ? (wecomUser.name || "") : "";
        const wecomAvatar = wecomUser?.errcode === 0 ? (wecomUser.avatar || wecomUser.thumb_avatar || "") : "";
        const wecomAlias = wecomUser?.errcode === 0 ? (wecomUser.alias || "") : "";

        return { ...s, task_title: taskTitle, wecom_name: wecomName, wecom_avatar: wecomAvatar, wecom_alias: wecomAlias };
      })
    );

    res.json({ ok: true, sessions: enriched });
  } catch (e) {
    console.error("[WeCom] 查询sessions失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// -----------------------------------------------------------
// 管理API：手动绑定/更新
// -----------------------------------------------------------
router.post("/api/wecom/sessions", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const { wecom_user_id, manus_task_id, nickname, model_pref, system_prompt, enabled } = req.body || {};
    if (!wecom_user_id || !manus_task_id) {
      return res.status(400).json({ error: "wecom_user_id 和 manus_task_id 为必填" });
    }
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    // 如果是新绑定，先把该用户旧的 active 记录改为 archived
    await (conn as any).execute(
      "UPDATE wecom_manus_sessions SET status = 'archived' WHERE wecom_user_id = ? AND status = 'active' AND manus_task_id != ?",
      [wecom_user_id, manus_task_id]
    );

    // 插入新记录或更新现有记录，同时强制设为 active
    await (conn as any).execute(
      `INSERT INTO wecom_manus_sessions (wecom_user_id, manus_task_id, nickname, model_pref, system_prompt, enabled, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'active') 
       ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), model_pref = VALUES(model_pref), system_prompt = VALUES(system_prompt), enabled = VALUES(enabled), status = 'active'`,
      [wecom_user_id, manus_task_id, nickname || "", model_pref || "manus-1.6-max", system_prompt || null, enabled !== undefined ? enabled : 1]
    );
    res.json({ ok: true, message: "绑定成功" });
  } catch (e) {
    console.error("[WeCom] 绑定失败:", e);
    res.status(500).json({ error: "绑定失败" });
  }
});

// -----------------------------------------------------------
// 管理API：归档绑定记录（代替物理删除）
// -----------------------------------------------------------
router.post("/api/wecom/sessions/:id/archive", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    await (conn as any).execute("UPDATE wecom_manus_sessions SET status = 'archived' WHERE id = ?", [id]);
    res.json({ ok: true, message: "归档成功" });
  } catch (e) {
    console.error("[WeCom] 归档失败:", e);
    res.status(500).json({ error: "归档失败" });
  }
});

// -----------------------------------------------------------
// 管理API：更新用户设置（备注名、任务ID、模型、提示词、启用状态）
// -----------------------------------------------------------
router.patch("/api/wecom/sessions/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nickname, manus_task_id, model_pref, system_prompt, enabled } = req.body || {};
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });

    // 动态构建更新字段
    const fields: string[] = [];
    const values: any[] = [];
    if (nickname !== undefined) { fields.push("nickname = ?"); values.push(nickname); }
    if (manus_task_id !== undefined) { fields.push("manus_task_id = ?"); values.push(manus_task_id); }
    if (model_pref !== undefined) { fields.push("model_pref = ?"); values.push(model_pref); }
    if (system_prompt !== undefined) { fields.push("system_prompt = ?"); values.push(system_prompt); }
    if (enabled !== undefined) { fields.push("enabled = ?"); values.push(enabled); }

    if (fields.length === 0) return res.status(400).json({ error: "无可更新字段" });

    values.push(id);
    await (conn as any).execute(
      `UPDATE wecom_manus_sessions SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    res.json({ ok: true, message: "保存成功" });
  } catch (e) {
    console.error("[WeCom] 更新用户设置失败:", e);
    res.status(500).json({ error: "保存失败" });
  }
});

// -----------------------------------------------------------
// 管理API：工作流规则 - 查询所有
// -----------------------------------------------------------
router.get("/api/wecom/workflow-rules", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      "SELECT id, name, trigger_type, trigger_value, action_type, action_value, enabled, created_at FROM wecom_workflow_rules ORDER BY created_at DESC"
    );
    res.json({ ok: true, rules: rows });
  } catch (e) {
    console.error("[WeCom] 查询workflow-rules失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// -----------------------------------------------------------
// 管理API：工作流规则 - 创建
// -----------------------------------------------------------
router.post("/api/wecom/workflow-rules", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const { name, trigger_type, trigger_value, action_type, action_value } = req.body || {};
    if (!name || !trigger_value || action_value === undefined) {
      return res.status(400).json({ error: "name、trigger_value、action_value 为必填" });
    }
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    await (conn as any).execute(
      "INSERT INTO wecom_workflow_rules (name, trigger_type, trigger_value, action_type, action_value) VALUES (?, ?, ?, ?, ?)",
      [name, trigger_type || "keyword", trigger_value, action_type || "prompt_override", action_value || ""]
    );
    res.json({ ok: true, message: "规则创建成功" });
  } catch (e) {
    console.error("[WeCom] 创建workflow-rule失败:", e);
    res.status(500).json({ error: "创建失败" });
  }
});

// -----------------------------------------------------------
// 管理API：工作流规则 - 更新（启用/禁用）
// -----------------------------------------------------------
router.patch("/api/wecom/workflow-rules/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled, name, trigger_value, action_value } = req.body || {};
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    // 动态构建更新字段
    const updates: string[] = [];
    const values: any[] = [];
    if (enabled !== undefined) { updates.push("enabled = ?"); values.push(enabled); }
    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (trigger_value !== undefined) { updates.push("trigger_value = ?"); values.push(trigger_value); }
    if (action_value !== undefined) { updates.push("action_value = ?"); values.push(action_value); }
    if (updates.length === 0) return res.status(400).json({ error: "没有需要更新的字段" });
    values.push(id);
    await (conn as any).execute(
      `UPDATE wecom_workflow_rules SET ${updates.join(", ")} WHERE id = ?`,
      values
    );
    res.json({ ok: true, message: "更新成功" });
  } catch (e) {
    console.error("[WeCom] 更新workflow-rule失败:", e);
    res.status(500).json({ error: "更新失败" });
  }
});

// -----------------------------------------------------------
// 管理API：工作流规则 - 删除
// -----------------------------------------------------------
router.delete("/api/wecom/workflow-rules/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    await (conn as any).execute("DELETE FROM wecom_workflow_rules WHERE id = ?", [id]);
    res.json({ ok: true, message: "删除成功" });
  } catch (e) {
    console.error("[WeCom] 删除workflow-rule失败:", e);
    res.status(500).json({ error: "删除失败" });
  }
});

// -----------------------------------------------------------
// 管理API：查询某用户的消息记录（调用 Manus task.listMessages）
// -----------------------------------------------------------
router.get("/api/wecom/messages/:taskId", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    if (!taskId) return res.status(400).json({ error: "taskId 为必填" });

    const msgsRes = await fetch(
      `${MANUS_API_BASE}/task.listMessages?task_id=${taskId}&order=asc&limit=100`,
      { headers: { "x-manus-api-key": MANUS_API_KEY } }
    );
    const msgsData = await msgsRes.json() as any;

    if (!msgsData.ok) {
      return res.status(500).json({ error: msgsData.error || "获取消息失败" });
    }

    // 提取 user_message 和 assistant_message 类型的消息
    const rawMessages = msgsData.messages || [];
    const messages = rawMessages
      .filter((e: any) => e.type === "user_message" || e.type === "assistant_message")
      .map((e: any) => {
        const isUser = e.type === "user_message";
        const contentRaw = isUser ? e.user_message?.content : e.assistant_message?.content;
        let content = "";
        if (typeof contentRaw === "string") {
          content = contentRaw;
        } else if (Array.isArray(contentRaw)) {
          content = contentRaw.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
        }
        return {
          role: isUser ? "user" : "assistant",
          content,
          timestamp: e.timestamp ? new Date(e.timestamp * 1000).toISOString() : null,
        };
      })
      .filter((m: any) => m.content);

    res.json({ ok: true, messages });
  } catch (e) {
    console.error("[WeCom] 查询消息记录失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// -----------------------------------------------------------
// 管理API：按日期聚合统计（必须在 /api/wecom/stats 之前注册，避免被拦截）
// -----------------------------------------------------------
router.get("/api/wecom/stats/daily", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });

    const { start_date, end_date, user_ids, ai_model } = req.query as {
      start_date?: string; end_date?: string; user_ids?: string; ai_model?: string;
    };

    const conditions: string[] = ['1=1'];
    if (start_date && end_date) {
      conditions.push(`mc.created_at >= '${start_date} 00:00:00' AND mc.created_at <= '${end_date} 23:59:59'`);
    }
    if (user_ids) {
      const ids = user_ids.split(',').map((id: string) => `'${id.trim().replace(/'/g, '')}'`).join(',');
      if (ids) conditions.push(`mc.wecom_user_id IN (${ids})`);
    }
    if (ai_model && ai_model !== 'all') {
      if (ai_model === 'manus') conditions.push(`mc.manus_task_id != 'deepseek'`);
      else if (ai_model === 'deepseek') conditions.push(`mc.manus_task_id = 'deepseek'`);
      else if (ai_model === 'ds_flash') conditions.push(`mc.manus_task_id = 'deepseek' AND mc.model_used NOT IN ('deepseek-v4-pro','deepseek-v4-pro-thinking')`);
      else if (ai_model === 'ds_pro') conditions.push(`mc.manus_task_id = 'deepseek' AND mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking')`);
    }
    const whereClause = conditions.join(' AND ');

    const [rows] = await (conn as any).execute(
      `SELECT
         DATE(mc.created_at) AS date,
         COUNT(DISTINCT mc.wecom_user_id) AS user_count,
         COUNT(*) AS record_count,
         SUM(CASE WHEN mc.manus_task_id != 'deepseek' THEN COALESCE(mc.credits_used,0) ELSE 0 END) AS manus_credits,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.credits_used,0) ELSE 0 END) AS ds_total_tokens,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.input_tokens,0) ELSE 0 END) AS ds_input_miss,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.output_tokens,0) ELSE 0 END) AS ds_output,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.cache_hit_tokens,0) ELSE 0 END) AS ds_cache_hit,
         SUM(CASE WHEN mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking') THEN COALESCE(mc.input_tokens,0) ELSE 0 END) AS ds_pro_input_miss,
         SUM(CASE WHEN mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking') THEN COALESCE(mc.output_tokens,0) ELSE 0 END) AS ds_pro_output,
         SUM(CASE WHEN mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking') THEN COALESCE(mc.cache_hit_tokens,0) ELSE 0 END) AS ds_pro_cache_hit
       FROM wecom_message_credits mc
       WHERE ${whereClause}
       GROUP BY DATE(mc.created_at)
       ORDER BY date DESC`
    ) as any;

    const daily = (rows as any[]).map((r: any) => {
      const manusCredits = Number(r.manus_credits) || 0;
      const manusCny = manusCredits * MANUS_CREDIT_PRICE;
      const dsProInputMiss = Number(r.ds_pro_input_miss) || 0;
      const dsProOutput = Number(r.ds_pro_output) || 0;
      const dsProCacheHit = Number(r.ds_pro_cache_hit) || 0;
      const dsFlashInputMiss = Math.max(0, (Number(r.ds_input_miss) || 0) - dsProInputMiss);
      const dsFlashOutput = Math.max(0, (Number(r.ds_output) || 0) - dsProOutput);
      const dsFlashCacheHit = Math.max(0, (Number(r.ds_cache_hit) || 0) - dsProCacheHit);
      const dsFlashCny = calcDeepSeekCost('deepseek-v4-flash', dsFlashInputMiss, dsFlashCacheHit, dsFlashOutput);
      const dsProCny = calcDeepSeekCost('deepseek-v4-pro', dsProInputMiss, dsProCacheHit, dsProOutput);
      const dsTotalCny = dsFlashCny + dsProCny;
      const totalCny = manusCny + dsTotalCny;
      return {
        date: r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10),
        user_count: Number(r.user_count) || 0,
        record_count: Number(r.record_count) || 0,
        manus_credits: manusCredits,
        ds_total_tokens: Number(r.ds_total_tokens) || 0,
        manus_cny: manusCny,
        ds_cny: dsTotalCny,
        total_cny: totalCny,
      };
    });

    res.json({ ok: true, daily });
  } catch (e) {
    console.error("[WeCom] 按日期统计失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// -----------------------------------------------------------
// 管理API：使用统计（调用 Manus usage.list，按 task_id 聚合）
// -----------------------------------------------------------
router.get("/api/wecom/stats", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });

    // 筛选参数
    const { start_date, end_date, user_ids, ai_model } = req.query as {
      start_date?: string; end_date?: string; user_ids?: string; ai_model?: string;
    };

    const conditions: string[] = ['1=1'];
    if (start_date && end_date) {
      conditions.push(`mc.created_at >= '${start_date} 00:00:00' AND mc.created_at <= '${end_date} 23:59:59'`);
    }
    // 用户多选：user_ids 为逗号分隔的 wecom_user_id
    if (user_ids) {
      const ids = user_ids.split(',').map((id: string) => `'${id.trim().replace(/'/g, '')}'`).join(',');
      if (ids) conditions.push(`mc.wecom_user_id IN (${ids})`);
    }
    // AI模型筛选：manus=只看Manus, ds_flash=只看DS Flash, ds_pro=只看DS Pro, deepseek=所有DS
    if (ai_model && ai_model !== 'all') {
      if (ai_model === 'manus') {
        conditions.push(`mc.manus_task_id != 'deepseek'`);
      } else if (ai_model === 'deepseek') {
        conditions.push(`mc.manus_task_id = 'deepseek'`);
      } else if (ai_model === 'ds_flash') {
        conditions.push(`mc.manus_task_id = 'deepseek' AND mc.model_used NOT IN ('deepseek-v4-pro','deepseek-v4-pro-thinking')`);
      } else if (ai_model === 'ds_pro') {
        conditions.push(`mc.manus_task_id = 'deepseek' AND mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking')`);
      }
    }
    const whereClause = conditions.join(' AND ');

    // 直接从本地 wecom_message_credits 表按 wecom_user_id 汇总
    const [creditRows] = await (conn as any).execute(
      `SELECT
         mc.wecom_user_id,
         COALESCE(MAX(s.nickname), mc.wecom_user_id) AS nickname,
         SUM(CASE WHEN mc.manus_task_id != 'deepseek' THEN COALESCE(mc.credits_used,0) ELSE 0 END) AS manus_credits,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.credits_used,0) ELSE 0 END) AS ds_total_tokens,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.input_tokens,0) ELSE 0 END) AS ds_input_miss,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.output_tokens,0) ELSE 0 END) AS ds_output,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.cache_hit_tokens,0) ELSE 0 END) AS ds_cache_hit,
         SUM(CASE WHEN mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking') THEN COALESCE(mc.input_tokens,0) ELSE 0 END) AS ds_pro_input_miss,
         SUM(CASE WHEN mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking') THEN COALESCE(mc.output_tokens,0) ELSE 0 END) AS ds_pro_output,
         SUM(CASE WHEN mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking') THEN COALESCE(mc.cache_hit_tokens,0) ELSE 0 END) AS ds_pro_cache_hit,
         COUNT(*) AS record_count,
         MIN(mc.created_at) AS first_message_at,
         MAX(b.site_username) AS site_username,
         MAX(b.site_user_id) AS site_user_id
       FROM wecom_message_credits mc
       LEFT JOIN wecom_manus_sessions s ON s.wecom_user_id = mc.wecom_user_id
       LEFT JOIN wecom_account_binding b ON b.wecom_user_id = mc.wecom_user_id
       WHERE ${whereClause}
       GROUP BY mc.wecom_user_id
       ORDER BY mc.wecom_user_id`
    ) as any;
    const creditStats = creditRows as any[];

    if (creditStats.length === 0) {
      return res.json({ ok: true, stats: [], total_cost: 0, total_cny: 0 });
    }

    const stats = creditStats.map((r: any) => {
      const manusCredits = Number(r.manus_credits) || 0;
      const manusCny = manusCredits * MANUS_CREDIT_PRICE;

      // DeepSeek 按模型分组精确计费
      // Flash 系列 = 总输入 - Pro输入
      const dsProInputMiss = Number(r.ds_pro_input_miss) || 0;
      const dsProOutput = Number(r.ds_pro_output) || 0;
      const dsProCacheHit = Number(r.ds_pro_cache_hit) || 0;
      const dsFlashInputMiss = Math.max(0, (Number(r.ds_input_miss) || 0) - dsProInputMiss);
      const dsFlashOutput = Math.max(0, (Number(r.ds_output) || 0) - dsProOutput);
      const dsFlashCacheHit = Math.max(0, (Number(r.ds_cache_hit) || 0) - dsProCacheHit);

      const dsFlashCny = calcDeepSeekCost('deepseek-v4-flash', dsFlashInputMiss, dsFlashCacheHit, dsFlashOutput);
      const dsProCny = calcDeepSeekCost('deepseek-v4-pro', dsProInputMiss, dsProCacheHit, dsProOutput);
      const dsTotalCny = dsFlashCny + dsProCny;
      const totalCny = manusCny + dsTotalCny;

      return {
        wecom_user_id: r.wecom_user_id,
        nickname: r.nickname || r.wecom_user_id,
        // 原始数据
        manus_credits: manusCredits,
        ds_total_tokens: Number(r.ds_total_tokens) || 0,
        // 费用明细
        manus_cny: manusCny,
        ds_cny: dsTotalCny,
        total_cny: totalCny,
        // 兼容旧字段
        total_cost: manusCredits,  // 保留旧字段，为 Manus 积分
        record_count: Number(r.record_count) || 0,
        task_count: 0,
        site_username: r.site_username || null,
        site_user_id: r.site_user_id ? Number(r.site_user_id) : null,
        first_bound_at: r.first_message_at
          ? (r.first_message_at instanceof Date ? r.first_message_at.toISOString() : String(r.first_message_at))
          : "",
      };
    });

    // 按总费用降序排序
    stats.sort((a: any, b: any) => b.total_cny - a.total_cny);

    const total_cny = stats.reduce((sum: number, s: any) => sum + s.total_cny, 0);
    const total_cost = stats.reduce((sum: number, s: any) => sum + s.manus_credits, 0);

    const usdt_cny_rate = getUsdtCnyRate();
    res.json({ ok: true, stats, total_cost, total_cny, usdt_cny_rate });
  } catch (e) {
    console.error("[WeCom] 查询使用统计失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// -----------------------------------------------------------
// 管理API：按日期聚合统计
// -----------------------------------------------------------
router.get("/api/wecom/stats/daily", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });

    const { start_date, end_date, user_ids, ai_model } = req.query as {
      start_date?: string; end_date?: string; user_ids?: string; ai_model?: string;
    };

    const conditions: string[] = ['1=1'];
    if (start_date && end_date) {
      conditions.push(`mc.created_at >= '${start_date} 00:00:00' AND mc.created_at <= '${end_date} 23:59:59'`);
    }
    if (user_ids) {
      const ids = user_ids.split(',').map((id: string) => `'${id.trim().replace(/'/g, '')}'`).join(',');
      if (ids) conditions.push(`mc.wecom_user_id IN (${ids})`);
    }
    if (ai_model && ai_model !== 'all') {
      if (ai_model === 'manus') conditions.push(`mc.manus_task_id != 'deepseek'`);
      else if (ai_model === 'deepseek') conditions.push(`mc.manus_task_id = 'deepseek'`);
      else if (ai_model === 'ds_flash') conditions.push(`mc.manus_task_id = 'deepseek' AND mc.model_used NOT IN ('deepseek-v4-pro','deepseek-v4-pro-thinking')`);
      else if (ai_model === 'ds_pro') conditions.push(`mc.manus_task_id = 'deepseek' AND mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking')`);
    }
    const whereClause = conditions.join(' AND ');

    const [rows] = await (conn as any).execute(
      `SELECT
         DATE(mc.created_at) AS date,
         COUNT(DISTINCT mc.wecom_user_id) AS user_count,
         COUNT(*) AS record_count,
         SUM(CASE WHEN mc.manus_task_id != 'deepseek' THEN COALESCE(mc.credits_used,0) ELSE 0 END) AS manus_credits,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.credits_used,0) ELSE 0 END) AS ds_total_tokens,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.input_tokens,0) ELSE 0 END) AS ds_input_miss,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.output_tokens,0) ELSE 0 END) AS ds_output,
         SUM(CASE WHEN mc.manus_task_id = 'deepseek' THEN COALESCE(mc.cache_hit_tokens,0) ELSE 0 END) AS ds_cache_hit,
         SUM(CASE WHEN mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking') THEN COALESCE(mc.input_tokens,0) ELSE 0 END) AS ds_pro_input_miss,
         SUM(CASE WHEN mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking') THEN COALESCE(mc.output_tokens,0) ELSE 0 END) AS ds_pro_output,
         SUM(CASE WHEN mc.model_used IN ('deepseek-v4-pro','deepseek-v4-pro-thinking') THEN COALESCE(mc.cache_hit_tokens,0) ELSE 0 END) AS ds_pro_cache_hit
       FROM wecom_message_credits mc
       WHERE ${whereClause}
       GROUP BY DATE(mc.created_at)
       ORDER BY date DESC`
    ) as any;

    const daily = (rows as any[]).map((r: any) => {
      const manusCredits = Number(r.manus_credits) || 0;
      const manusCny = manusCredits * MANUS_CREDIT_PRICE;
      const dsProInputMiss = Number(r.ds_pro_input_miss) || 0;
      const dsProOutput = Number(r.ds_pro_output) || 0;
      const dsProCacheHit = Number(r.ds_pro_cache_hit) || 0;
      const dsFlashInputMiss = Math.max(0, (Number(r.ds_input_miss) || 0) - dsProInputMiss);
      const dsFlashOutput = Math.max(0, (Number(r.ds_output) || 0) - dsProOutput);
      const dsFlashCacheHit = Math.max(0, (Number(r.ds_cache_hit) || 0) - dsProCacheHit);
      const dsFlashCny = calcDeepSeekCost('deepseek-v4-flash', dsFlashInputMiss, dsFlashCacheHit, dsFlashOutput);
      const dsProCny = calcDeepSeekCost('deepseek-v4-pro', dsProInputMiss, dsProCacheHit, dsProOutput);
      const dsTotalCny = dsFlashCny + dsProCny;
      const totalCny = manusCny + dsTotalCny;
      return {
        date: r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10),
        user_count: Number(r.user_count) || 0,
        record_count: Number(r.record_count) || 0,
        manus_credits: manusCredits,
        ds_total_tokens: Number(r.ds_total_tokens) || 0,
        manus_cny: manusCny,
        ds_cny: dsTotalCny,
        total_cny: totalCny,
      };
    });

    res.json({ ok: true, daily });
  } catch (e) {
    console.error("[WeCom] 按日期统计失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// -----------------------------------------------------------
// 管理API：API 用量统计（wecom_api_usage_log 按场景汇总）
// -----------------------------------------------------------
router.get("/api/wecom/stats/api-usage", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });

    const { start_date, end_date } = req.query as { start_date?: string; end_date?: string };
    const conditions: string[] = ['1=1'];
    if (start_date && end_date) {
      conditions.push(`created_at >= '${start_date} 00:00:00' AND created_at <= '${end_date} 23:59:59'`);
    }
    const where = conditions.join(' AND ');

    // 按场景汇总
    const [byScene] = await (conn as any).execute(
      `SELECT
         use_case,
         provider,
         model_name,
         COUNT(*) AS call_count,
         SUM(COALESCE(input_tokens,0)) AS total_input_tokens,
         SUM(COALESCE(output_tokens,0)) AS total_output_tokens,
         SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)) AS total_tokens,
         SUM(COALESCE(duration_sec,0)) AS total_audio_seconds
       FROM wecom_api_usage_log
       WHERE ${where}
       GROUP BY use_case, provider, model_name
       ORDER BY call_count DESC`
    ) as any;

    // 按天汇总（最近30天）
    const [byDay] = await (conn as any).execute(
      `SELECT
         DATE(created_at) AS date,
         COUNT(*) AS call_count,
         SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)) AS total_tokens
       FROM wecom_api_usage_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
    ) as any;

    res.json({
      ok: true,
      by_scene: (byScene as any[]).map(r => ({
        use_case: r.use_case,
        provider: r.provider,
        model_name: r.model_name,
        call_count: Number(r.call_count) || 0,
        total_input_tokens: Number(r.total_input_tokens) || 0,
        total_output_tokens: Number(r.total_output_tokens) || 0,
        total_tokens: Number(r.total_tokens) || 0,
        total_audio_seconds: Number(r.total_audio_seconds) || 0,
      })),
      by_day: (byDay as any[]).map(r => ({
        date: r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10),
        call_count: Number(r.call_count) || 0,
        total_tokens: Number(r.total_tokens) || 0,
      })),
    });
  } catch (e) {
    console.error("[WeCom] API用量统计查询失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// -----------------------------------------------------------
// 调试API：查看最近的服务器日志（用于排查语音等问题）
// -----------------------------------------------------------
const recentLogs: string[] = [];
const MAX_LOG_LINES = 2000;
let _afLogCount = 0; // AF扫描日志采样计数
const origConsoleLog = console.log.bind(console);
const origConsoleError = console.error.bind(console);
console.log = (...args: any[]) => {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  // AF扫描日志每10条只保留1条，避免冲刷其他日志
  if (line.includes('[AF扫描]')) {
    _afLogCount++;
    if (_afLogCount % 10 !== 0) { origConsoleLog(...args); return; }
  }
  recentLogs.push(`[LOG] ${new Date().toISOString()} ${line}`);
  if (recentLogs.length > MAX_LOG_LINES) recentLogs.shift();
  origConsoleLog(...args);
};
console.error = (...args: any[]) => {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  recentLogs.push(`[ERR] ${new Date().toISOString()} ${line}`);
  if (recentLogs.length > MAX_LOG_LINES) recentLogs.shift();
  origConsoleError(...args);
};
router.get("/api/wecom/debug-logs", (req: Request, res: Response) => {
  const keyword = (req.query.keyword as string) || '';
  const lines = keyword ? recentLogs.filter(l => l.includes(keyword)) : recentLogs;
  res.json({ lines: lines.slice(-100), total: lines.length });
});

// -----------------------------------------------------------
// 管理API：推送菜单到企业微信
// -----------------------------------------------------------
// 菜单配置：读取已保存的菜单
router.get("/api/wecom/menu", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      `SELECT config_val FROM wecom_route_config WHERE config_key = 'menu_config' LIMIT 1`
    ) as any;
    const val = (rows as any[])[0]?.config_val || '';
    if (val) {
      try {
        const savedMenu = JSON.parse(val);
        return res.json({ ok: true, menu: savedMenu });
      } catch (_) {}
    }
    res.json({ ok: true, menu: null }); // null 表示未保存过，前端用默认值
  } catch (e) {
    console.error("[WeCom] 读取菜单失败:", e);
    res.status(500).json({ error: "读取失败" });
  }
});

// 菜单配置：推送并保存菜单
router.post("/api/wecom/menu", async (req: Request, res: Response) => {
  try {
    const { menu } = req.body || {};
    if (!menu || !Array.isArray(menu)) {
      return res.status(400).json({ error: "menu 字段为必填数组" });
    }

    const token = await getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/menu/create?access_token=${token}&agentid=${WECOM_AGENT_ID}`;

    const menuRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ button: menu }),
    });
    const menuData = await menuRes.json() as any;

    if (menuData.errcode !== 0) {
      console.error("[WeCom] 推送菜单失败:", menuData);
      return res.status(500).json({ error: `企业微信错误: ${menuData.errmsg}` });
    }

    // 推送成功后同时保存到数据库
    try {
      await ensureSessionTable();
      const conn = await getDbConnection();
      if (conn) {
        await (conn as any).execute(
          `INSERT INTO wecom_route_config (config_key, config_val) VALUES ('menu_config', ?)
           ON DUPLICATE KEY UPDATE config_val = VALUES(config_val)`,
          [JSON.stringify(menu)]
        );
      }
    } catch (saveErr) {
      console.error("[WeCom] 菜单保存到数据库失败:", saveErr);
    }

    console.log("[WeCom] 菜单推送并保存成功");
    res.json({ ok: true, message: "菜单推送成功" });
  } catch (e) {
    console.error("[WeCom] 推送菜单异常:", e);
    res.status(500).json({ error: "推送失败" });
  }
});

// -----------------------------------------------------------
// 管理API：获取 Manus 任务列表（用于手动绑定下拉框）
// -----------------------------------------------------------
router.get("/api/wecom/manus-tasks", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string || undefined;
    const url = new URL(`${MANUS_API_BASE}/task.list`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("order", "desc");
    if (cursor) url.searchParams.set("cursor", cursor);

    const resp = await fetch(url.toString(), {
      headers: { "x-manus-api-key": MANUS_API_KEY },
    });
    const data = await resp.json() as any;
    const tasks = (data.data || []).map((t: any) => ({
      id: t.id,
      title: t.title || "(无标题)",
      created_at: t.created_at,
      agent_profile: t.agent_profile,
    }));
    res.json({ ok: true, tasks, has_more: data.has_more, next_cursor: data.next_cursor });
  } catch (e) {
    console.error("[WeCom] 获取Manus任务列表失败:", e);
    res.status(500).json({ error: "获取任务列表失败" });
  }
});

// -----------------------------------------------------------
// 管理API：获取企业微信成员列表（用于手动绑定下拉框）
// -----------------------------------------------------------
router.get("/api/wecom/wecom-users", async (req: Request, res: Response) => {
  try {
    const token = await getAccessToken();
    const resp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/user/simplelist?access_token=${token}&department_id=1&fetch_child=1`
    );
    const data = await resp.json() as any;
    if (data.errcode !== 0) {
      // IP白名单限制时降级返回空列表，前端改为手动输入
      console.warn("[WeCom] 获取成员列表失败（可能IP未加白名单）:", data.errmsg);
      return res.json({ users: [], error: data.errmsg });
    }
    const users = (data.userlist || []).map((u: any) => ({
      userid: u.userid,
      name: u.name || u.userid,
    }));
    res.json({ users });
  } catch (e) {
    console.error("[WeCom] 获取企业微信成员列表失败:", e);
    res.json({ users: [], error: "获取失败" });
  }
});

// -----------------------------------------------------------
// 管理API：用户积分明细（按用户查询该用户所有任务的每条消耗记录）
// -----------------------------------------------------------
router.get("/api/wecom/user-detail", async (req: Request, res: Response) => {
  const wecomUserId = req.query.wecom_user_id as string;
  if (!wecomUserId) return res.status(400).json({ error: "缺少wecom_user_id" });
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });

    // 查询该用户所有绑定记录（active + archived）
    const [sessionRows] = await (conn as any).execute(
      "SELECT id, manus_task_id, nickname, status, created_at FROM wecom_manus_sessions WHERE wecom_user_id = ? ORDER BY created_at ASC",
      [wecomUserId]
    ) as any;
    const sessions = sessionRows as any[];

    if (sessions.length === 0) {
      return res.json({ ok: true, sessions: [], records: [] });
    }

    // 优先从 wecom_message_credits 表读取消息级积分记录
    // 同时查询该用户所有记录（包含 DeepSeek 记录，即 manus_task_id='deepseek'）
    let messageRecords: any[] = [];
    let useMessageCredits = false;

    try {
      const [mcRows] = await (conn as any).execute(
        `SELECT id, wecom_user_id, manus_task_id, user_message, credits_before, credits_after,
                credits_used, input_tokens, output_tokens, cache_hit_tokens, model_used, reply_preview,
                DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
         FROM wecom_message_credits
         WHERE wecom_user_id = ?
         ORDER BY created_at DESC`,
        [wecomUserId]
      ) as any;
      messageRecords = mcRows as any[];
      useMessageCredits = messageRecords.length > 0;
    } catch (_) {}
    const taskIds = sessions.map((s: any) => s.manus_task_id);

    // 拉取每个任务的标题（并行请求）
    const taskTitles: Record<string, string> = {};
    const taskCreditTotals: Record<string, number> = {};
    await Promise.all(sessions.map(async (s: any) => {
      try {
        const r = await fetch(`${MANUS_API_BASE}/task.detail?task_id=${s.manus_task_id}`, {
          headers: { "x-manus-api-key": MANUS_API_KEY },
        });
        const d = await r.json() as any;
        if (d.ok && d.task) {
          taskTitles[s.manus_task_id] = d.task.title || "";
          taskCreditTotals[s.manus_task_id] = d.task.credit_usage || 0;
        }
      } catch (_) {}
    }));

    // 如果有消息级记录，用 wecom_message_credits 计算每个任务的积分汇总；否则用 task.detail
    const enrichedSessions = sessions.map((s: any) => {
      const taskMsgs = messageRecords.filter((r: any) => r.manus_task_id === s.manus_task_id);
      const totalCost = useMessageCredits
        ? taskMsgs.reduce((sum: number, r: any) => sum + (r.credits_used || 0), 0)
        : (taskCreditTotals[s.manus_task_id] || 0);
      const manusCny = totalCost * MANUS_CREDIT_PRICE;
      return {
        ...s,
        task_title: taskTitles[s.manus_task_id] || "",
        total_cost: totalCost,
        manus_cny: manusCny,
        record_count: taskMsgs.length,
      };
    });

    // 计算该用户所有 DeepSeek 记录的费用
    const dsRecords = messageRecords.filter((r: any) => r.manus_task_id === 'deepseek');
    let dsTotalCny = 0;
    let dsTotalTokens = 0;
    for (const dr of dsRecords) {
      const inputMiss = Number(dr.input_tokens) || 0;
      const cacheHit = Number(dr.cache_hit_tokens) || 0;
      const output = Number(dr.output_tokens) || 0;
      const model = dr.model_used || 'deepseek-v4-flash';
      dsTotalCny += calcDeepSeekCost(model, inputMiss, cacheHit, output);
      dsTotalTokens += Number(dr.credits_used) || 0;
    }
    const manusTotalCredits = enrichedSessions.reduce((sum: number, s: any) => sum + (s.total_cost || 0), 0);
    const manusTotalCny = manusTotalCredits * MANUS_CREDIT_PRICE;
    const grandTotalCny = manusTotalCny + dsTotalCny;

    // 构建统一格式的 records 数组返回给前端
    let userRecords: any[];
    if (useMessageCredits) {
      // 消息级记录：每条消息一行
      userRecords = messageRecords.map((r: any) => {
        const isDeepSeekRecord = r.manus_task_id === 'deepseek';
        const inputMiss = Number(r.input_tokens) || 0;
        const cacheHit = Number(r.cache_hit_tokens) || 0;
        const output = Number(r.output_tokens) || 0;
        const model = r.model_used || '';
        const cny = isDeepSeekRecord
          ? calcDeepSeekCost(model, inputMiss, cacheHit, output)
          : (Number(r.credits_used) || 0) * MANUS_CREDIT_PRICE;
        return {
          id: r.id,
          task_id: r.manus_task_id,
          user_message: r.user_message || "",
          credits: r.credits_used || 0,
          credits_before: r.credits_before || 0,
          credits_after: r.credits_after || 0,
          input_tokens: inputMiss,
          output_tokens: output,
          cache_hit_tokens: cacheHit,
          cny: cny,  // 本条记录换算的人民币
          model: model,
          reply_preview: r.reply_preview || "",
          created_at: r.created_at || "",
          record_type: "message",
          is_deepseek: isDeepSeekRecord,
        };
      });
    } else {
      // 降级：从 Manus usage.list 获取任务级记录
      const usageRes = await fetch(`${MANUS_API_BASE}/usage.list?limit=500`, {
        headers: { "x-manus-api-key": MANUS_API_KEY },
      });
      const usageData = await usageRes.json() as any;
      const allRecords = (usageData.ok && usageData.data) ? usageData.data as any[] : [];
      const taskMap: Record<string, any> = {};
      for (const s of sessions) taskMap[s.manus_task_id] = s;
      userRecords = allRecords
        .filter((r: any) => r.task_id && taskMap[r.task_id] && r.type === "cost")
        .map((r: any) => ({
          task_id: r.task_id,
          credits: Math.abs(r.credits || 0),
          created_at: r.created_at ? new Date(Number(r.created_at) * 1000).toISOString().replace('T', ' ').substring(0, 19) : "",
          model: r.model || "",
          record_type: "task",
        }))
        .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
    }

    const usdtCnyRate = getUsdtCnyRate();
    res.json({
      ok: true,
      sessions: enrichedSessions,
      records: userRecords,
      usdt_cny_rate: usdtCnyRate,
      use_message_credits: useMessageCredits,
      // 费用汇总
      manus_credits: manusTotalCredits,
      manus_cny: manusTotalCny,
      ds_tokens: dsTotalTokens,
      ds_cny: dsTotalCny,
      total_cny: grandTotalCny,
    });
  } catch (e) {
    console.error("[WeCom] 查询用户明细失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// -----------------------------------------------------------
// AI 路由 API：获取路由配置
// -----------------------------------------------------------
router.get("/api/wecom/route-config", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      "SELECT config_key, config_val FROM wecom_route_config"
    ) as any;
    const cfg: Record<string, string> = {};
    for (const r of (rows as any[])) cfg[r.config_key] = r.config_val;
    res.json({ ok: true, config: cfg });
  } catch (e) {
    res.status(500).json({ error: "获取配置失败" });
  }
});

// AI 路由 API：保存路由配置
router.post("/api/wecom/route-config", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { config } = req.body || {};
    if (!config || typeof config !== "object") return res.status(400).json({ error: "config 字段必填" });
    for (const [key, val] of Object.entries(config)) {
      await (conn as any).execute(
        "INSERT INTO wecom_route_config (config_key, config_val) VALUES (?,?) ON DUPLICATE KEY UPDATE config_val=VALUES(config_val)",
        [key, String(val)]
      );
    }
    res.json({ ok: true, message: "配置已保存" });
  } catch (e) {
    res.status(500).json({ error: "保存配置失败" });
  }
});

// AI 路由 API：今日统计
router.get("/api/wecom/route-stats", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const days = parseInt(req.query.days as string) || 7;

    // 今日汇总
    const [todayRows] = await (conn as any).execute(`
      SELECT
        routed_to,
        COUNT(*) AS msg_count,
        SUM(tokens_classify) AS total_classify_tokens,
        SUM(tokens_reply) AS total_reply_tokens,
        AVG(latency_ms) AS avg_latency
      FROM wecom_route_log
      WHERE DATE(created_at) = CURDATE()
      GROUP BY routed_to
    `) as any;

    // 迗去N天趋势
    const [trendRows] = await (conn as any).execute(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
        routed_to,
        COUNT(*) AS msg_count,
        SUM(tokens_classify + tokens_reply) AS total_tokens
      FROM wecom_route_log
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d'), routed_to
      ORDER BY date ASC
    `, [days]) as any;

    // 总计
    const [totalRows] = await (conn as any).execute(`
      SELECT COUNT(*) AS total_msgs, SUM(tokens_classify) AS total_classify
      FROM wecom_route_log
    `) as any;

    res.json({
      ok: true,
      today: todayRows as any[],
      trend: trendRows as any[],
      total: (totalRows as any[])[0] || { total_msgs: 0, total_classify: 0 },
    });
  } catch (e) {
    console.error("[WeCom] 路由统计失败:", e);
    res.status(500).json({ error: "统计查询失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 钉包绑定管理 API
// ─────────────────────────────────────────────────────────────────────────────

// 查询绑定列表（包含所有企微用户，显示是否已绑定）
router.get("/api/wecom/wallet-bindings", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    // 查询所有企微用户，左连接绑定表
    const [rows] = await (conn as any).execute(`
      SELECT
        s.wecom_user_id,
        s.nickname,
        b.id AS binding_id,
        b.site_username,
        b.site_user_id,
        b.bound_by,
        b.created_at AS bound_at
      FROM (
        SELECT DISTINCT wecom_user_id, MAX(nickname) AS nickname
        FROM wecom_manus_sessions
        GROUP BY wecom_user_id
      ) s
      LEFT JOIN wecom_account_binding b ON b.wecom_user_id = s.wecom_user_id
      ORDER BY b.id DESC, s.wecom_user_id
    `) as any;
    res.json({ ok: true, bindings: rows as any[] });
  } catch (e) {
    console.error("[钱包绑定] 查询失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// 创建或更新绑定
router.post("/api/wecom/wallet-bindings", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const { wecom_user_id, site_username } = req.body || {};
    if (!wecom_user_id || !site_username) {
      return res.status(400).json({ error: "缺少必要参数" });
    }
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    // 查找网站用户
    const [userRows] = await (conn as any).execute(
      `SELECT id, username FROM users WHERE username = ? LIMIT 1`,
      [site_username]
    ) as any;
    if (!(userRows as any[]).length) {
      return res.status(404).json({ error: `网站用户「${site_username}」不存在` });
    }
    const siteUser = (userRows as any[])[0];
    // 写入绑定（如已存在则更新）
    await (conn as any).execute(
      `INSERT INTO wecom_account_binding (wecom_user_id, site_username, site_user_id, bound_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE site_username = VALUES(site_username), site_user_id = VALUES(site_user_id), bound_by = VALUES(bound_by), updated_at = NOW()`,
      [wecom_user_id, siteUser.username, siteUser.id, 'admin']
    );
    res.json({ ok: true, message: `绑定成功：${wecom_user_id} ↔ ${siteUser.username}` });
  } catch (e) {
    console.error("[钱包绑定] 创建失败:", e);
    res.status(500).json({ error: "绑定失败" });
  }
});

// 解除绑定
router.delete("/api/wecom/wallet-bindings/:wecomUserId", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const wecomUserId = req.params.wecomUserId;
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    await (conn as any).execute(
      `DELETE FROM wecom_account_binding WHERE wecom_user_id = ?`,
      [wecomUserId]
    );
    res.json({ ok: true, message: "已解除绑定" });
  } catch (e) {
    console.error("[钱包绑定] 解除失败:", e);
    res.status(500).json({ error: "解除失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 专属规则 CRUD API
// ─────────────────────────────────────────────────────────────────────────────

// 查询规则列表（按 channel_type 隔离）
router.get("/api/wecom/custom-rules", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const channelType = (req.query.channel_type as string) || "app";
    const [rows] = await (conn as any).execute(
      `SELECT id, rule_name, trigger_intent, reply_mode, template_text, ai_model, ai_system_prompt,
              target_type, target_user_ids, enabled, trigger_count, channel_type, created_at, updated_at
       FROM wecom_custom_rules WHERE channel_type = ? ORDER BY created_at DESC`,
      [channelType]
    ) as any;
    res.json({ ok: true, rules: rows as any[] });
  } catch (e) {
    console.error("[专属规则] 查询失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// 新建规则
router.post("/api/wecom/custom-rules", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { rule_name, trigger_intent, reply_mode, template_text, ai_model, ai_system_prompt, target_type, target_user_ids, channel_type } = req.body;
    if (!rule_name || !trigger_intent) return res.status(400).json({ error: "规则名称和触发意图不能为空" });
    const [result] = await (conn as any).execute(
      `INSERT INTO wecom_custom_rules (rule_name, trigger_intent, reply_mode, template_text, ai_model, ai_system_prompt, target_type, target_user_ids, enabled, channel_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        rule_name,
        trigger_intent,
        reply_mode || 'ai',
        template_text || '',
        ai_model || 'deepseek-chat',
        ai_system_prompt || '',
        target_type || 'selected',
        target_user_ids ? JSON.stringify(target_user_ids) : '[]',
        channel_type || 'app'
      ]
    ) as any;
    res.json({ ok: true, id: (result as any).insertId });
  } catch (e) {
    console.error("[专属规则] 新建失败:", e);
    res.status(500).json({ error: "新建失败" });
  }
});

// 更新规则
router.put("/api/wecom/custom-rules/:id", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { id } = req.params;
    const { rule_name, trigger_intent, reply_mode, template_text, ai_model, ai_system_prompt, target_type, target_user_ids, enabled } = req.body;
    await (conn as any).execute(
      `UPDATE wecom_custom_rules SET rule_name=?, trigger_intent=?, reply_mode=?, template_text=?,
       ai_model=?, ai_system_prompt=?, target_type=?, target_user_ids=?, enabled=?, updated_at=NOW()
       WHERE id=?`,
      [
        rule_name,
        trigger_intent,
        reply_mode || 'ai',
        template_text || '',
        ai_model || 'deepseek-chat',
        ai_system_prompt || '',
        target_type || 'selected',
        target_user_ids ? JSON.stringify(target_user_ids) : '[]',
        enabled ? 1 : 0,
        id
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[专属规则] 更新失败:", e);
    res.status(500).json({ error: "更新失败" });
  }
});

// 切换启用/停用
router.patch("/api/wecom/custom-rules/:id/toggle", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { id } = req.params;
    const { enabled } = req.body;
    await (conn as any).execute(
      `UPDATE wecom_custom_rules SET enabled=?, updated_at=NOW() WHERE id=?`,
      [enabled ? 1 : 0, id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[专属规则] 切换失败:", e);
    res.status(500).json({ error: "切换失败" });
  }
});

// 删除规则
router.delete("/api/wecom/custom-rules/:id", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { id } = req.params;
    await (conn as any).execute(`DELETE FROM wecom_custom_rules WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[专属规则] 删除失败:", e);
    res.status(500).json({ error: "删除失败" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 渠道管理接口 (wecom_channels)
// ═══════════════════════════════════════════════════════════════════════════════

// 获取渠道列表（支持按app_id过滤）
router.get("/api/wecom/channels", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const appId = req.query.app_id;
    let sql = `SELECT id, name, channel_type, project_key, kf_id, is_enabled, app_id, created_at FROM wecom_channels`;
    const params: any[] = [];
    if (appId) { sql += " WHERE app_id = ?"; params.push(Number(appId)); }
    sql += " ORDER BY id ASC";
    const [rows] = await (conn as any).execute(sql, params);
    // 尝试补充 avatar_url
    let channels = rows as any[];
    try {
      const [ar] = await (conn as any).execute(`SELECT id, avatar_url FROM wecom_channels ORDER BY id ASC`);
      const avatarMap: Record<number, string> = {};
      for (const r of ar as any[]) avatarMap[r.id] = r.avatar_url || null;
      channels = channels.map((c: any) => ({ ...c, avatar_url: avatarMap[c.id] ?? null }));
    } catch { channels = channels.map((c: any) => ({ ...c, avatar_url: null })); }
    res.json({ channels });
  } catch (e) {
    console.error("[渠道] 获取列表失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 新增渠道
router.post("/api/wecom/channels", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { name, channel_type, project_key, kf_id } = req.body;
    if (!name || !channel_type) return res.status(400).json({ error: "name和channel_type必填" });
    const [result] = await (conn as any).execute(
      `INSERT INTO wecom_channels (name, channel_type, project_key, kf_id) VALUES (?,?,?,?)`,
      [name, channel_type, project_key || null, kf_id || null]
    );
    res.json({ ok: true, id: (result as any).insertId });
  } catch (e) {
    console.error("[渠道] 新增失败:", e);
    res.status(500).json({ error: "新增失败" });
  }
});

// 确保 wecom_channels 有 avatar_url 列
async function ensureAvatarUrlColumn() {
  try {
    const conn = await getDbConnection();
    if (!conn) return;
    await (conn as any).execute(`ALTER TABLE wecom_channels ADD COLUMN avatar_url VARCHAR(500) DEFAULT NULL`);
    console.log('[wecom_channels] avatar_url 列添加成功');
  } catch { /* 列已存在，忽略 */ }
}
// 延迟执行迁移，不阻塞启动
setTimeout(ensureAvatarUrlColumn, 3000);

// 获取单个渠道
router.get("/api/wecom/channels/:id", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { id } = req.params;
    // 排除 /config 子路径（由后面的路由处理）
    if (id === 'config' || isNaN(Number(id))) return res.status(400).json({ error: "无效ID" });
    // 安全查询：先不包含 avatar_url，再单独查
    const [rows] = await (conn as any).execute(
      `SELECT id, name, channel_type, project_key, kf_id, is_enabled, app_id, created_at FROM wecom_channels WHERE id=? LIMIT 1`,
      [id]
    );
    const ch = (rows as any[])[0] as any;
    if (!ch) return res.status(404).json({ error: "渠道不存在" });
    // 尝试获取 avatar_url
    try {
      const [ar] = await (conn as any).execute(`SELECT avatar_url FROM wecom_channels WHERE id=? LIMIT 1`, [id]);
      ch.avatar_url = (ar as any[])[0]?.avatar_url || null;
    } catch { ch.avatar_url = null; }
    res.json(ch);
  } catch (e) {
    console.error("[渠道] 获取单个失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 更新渠道
router.put("/api/wecom/channels/:id", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { id } = req.params;
    const { name, channel_type, project_key, kf_id, is_enabled, avatar_url } = req.body;
    // 先检查avatar_url列是否存在，不存在则迁移添加
    try {
      await (conn as any).execute(`ALTER TABLE wecom_channels ADD COLUMN avatar_url VARCHAR(500) DEFAULT NULL`);
    } catch { /* 列已存在，忽略 */ }
    await (conn as any).execute(
      `UPDATE wecom_channels SET name=?, channel_type=?, project_key=?, kf_id=?, is_enabled=?, avatar_url=? WHERE id=?`,
      [name, channel_type, project_key || null, kf_id || null, is_enabled ?? 1, avatar_url || null, id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[渠道] 更新失败:", e);
    res.status(500).json({ error: "更新失败" });
  }
});

// 删除渠道
router.delete("/api/wecom/channels/:id", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { id } = req.params;
    await (conn as any).execute(`DELETE FROM wecom_channels WHERE id=?`, [id]);
    await (conn as any).execute(`DELETE FROM wecom_channel_config WHERE channel_id=?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[渠道] 删除失败:", e);
    res.status(500).json({ error: "删除失败" });
  }
});

// 同步企业微信客服账号列表 → 自动更新 kf_id
router.post("/api/wecom/channels/sync-kf-accounts", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    // 获取 access_token
    const tokenRes = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECOM_CORP_ID}&corpsecret=${process.env.WECOM_SECRET || "3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g"}`
    );
    const tokenData: any = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(500).json({ error: "获取access_token失败: " + tokenData.errmsg });
    }
    const token = tokenData.access_token;
    // 调用企业微信客服账号列表接口
    const kfRes = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/kf/account/list?access_token=${token}&offset=0&limit=100`
    );
    const kfData: any = await kfRes.json();
    if (kfData.errcode !== 0) {
      return res.status(500).json({ error: `企业微信接口错误: ${kfData.errmsg} (${kfData.errcode})` });
    }
    const accounts: any[] = kfData.account_list || [];
    const updated: any[] = [];
    const created: any[] = [];
    for (const acc of accounts) {
      const openKfId: string = acc.open_kfid || "";
      const name: string = acc.name || "";
      const avatarUrl: string = acc.avatar || "";
      if (!openKfId) continue;
      // 查找是否已有渠道匹配此 open_kfid
      const [existing] = await (conn as any).execute(
        "SELECT id, name FROM wecom_channels WHERE channel_type = 'kf' AND kf_id = ? LIMIT 1",
        [openKfId]
      );
      if ((existing as any[]).length > 0) {
        const chId = (existing as any[])[0].id;
        // 同步头像
        if (avatarUrl) {
          try { await (conn as any).execute("UPDATE wecom_channels SET avatar_url = ? WHERE id = ?", [avatarUrl, chId]); } catch (_) {}
        }
        updated.push({ id: chId, name: (existing as any[])[0].name, open_kfid: openKfId, avatar: avatarUrl });
      } else {
        // 尝试按名称匹配（名称相同但 kf_id 为空或不同）
        const [byName] = await (conn as any).execute(
          "SELECT id, name FROM wecom_channels WHERE channel_type = 'kf' AND (kf_id IS NULL OR kf_id = '') AND name = ? LIMIT 1",
          [name]
        );
        if ((byName as any[]).length > 0) {
          const chId = (byName as any[])[0].id;
          await (conn as any).execute("UPDATE wecom_channels SET kf_id = ? WHERE id = ?", [openKfId, chId]);
          updated.push({ id: chId, name, open_kfid: openKfId, action: "matched_by_name" });
        } else {
          // 尝试按旧格式 kfcid 匹配（kfc 开头的错误格式）
          const [byKfc] = await (conn as any).execute(
            "SELECT id, name FROM wecom_channels WHERE channel_type = 'kf' AND kf_id LIKE 'kfc%' LIMIT 10",
            []
          );
          // 如果只有一个 kfc 格式的渠道，直接更新；如果有多个，按名字模糊匹配
          let matchedByKfc = null;
          if ((byKfc as any[]).length === 1) {
            matchedByKfc = (byKfc as any[])[0];
          } else if ((byKfc as any[]).length > 1) {
            // 多个 kfc 渠道，尝试模糊名字匹配
            matchedByKfc = (byKfc as any[]).find((c: any) =>
              name && c.name && (c.name.includes(name) || name.includes(c.name))
            ) || null;
          }
          if (matchedByKfc) {
            const chId = matchedByKfc.id;
            await (conn as any).execute("UPDATE wecom_channels SET kf_id = ? WHERE id = ?", [openKfId, chId]);
            updated.push({ id: chId, name: matchedByKfc.name, open_kfid: openKfId, action: "matched_by_kfc_fallback" });
          } else {
            // 新建渠道
            const [ins] = await (conn as any).execute(
              "INSERT INTO wecom_channels (name, channel_type, kf_id) VALUES (?, 'kf', ?)",
              [name, openKfId]
            );
            created.push({ id: (ins as any).insertId, name, open_kfid: openKfId });
          }
        }
      }
    }
    res.json({ ok: true, total: accounts.length, updated, created, accounts: accounts.map((a: any) => ({ name: a.name, open_kfid: a.open_kfid })) });
  } catch (e) {
    console.error("[同步客服账号] 失败:", e);
    res.status(500).json({ error: "同步失败" });
  }
});

// 获取渠道配置
router.get("/api/wecom/channels/:id/config", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { id } = req.params;
    const [rows] = await (conn as any).execute(
      `SELECT config_key, config_val FROM wecom_channel_config WHERE channel_id=?`,
      [id]
    );
    // 转为 key-value 对象
    const config: Record<string, string> = {};
    for (const row of rows as any[]) {
      config[row.config_key] = row.config_val;
    }
    res.json({ config });
  } catch (e) {
    console.error("[渠道配置] 获取失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 保存渠道配置（批量 upsert）
router.post("/api/wecom/channels/:id/config", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { id } = req.params;
    const { config } = req.body; // { key: value, ... }
    if (!config || typeof config !== "object") return res.status(400).json({ error: "config必须是对象" });
    for (const [key, val] of Object.entries(config)) {
      await (conn as any).execute(
        `INSERT INTO wecom_channel_config (channel_id, config_key, config_val) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE config_val=VALUES(config_val)`,
        [id, key, val]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[渠道配置] 保存失败:", e);
    res.status(500).json({ error: "保存失败" });
  }
});

// ==================== 结构化AI指令条目接口 ====================

// 获取指令条目列表
router.get("/api/wecom/channels/:channelId/prompt-rules", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { channelId } = req.params;
    const [rows] = await (conn as any).execute(
      `SELECT * FROM wecom_prompt_rules WHERE channel_id = ? ORDER BY layer ASC, sort_order ASC, id ASC`,
      [channelId]
    );
    res.json({ rules: rows });
  } catch (e) {
    console.error("[指令条目] 获取失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 新增指令条目
router.post("/api/wecom/channels/:channelId/prompt-rules", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { channelId } = req.params;
    const { layer, category, content, enabled, sort_order, remark } = req.body;
    if (!content) return res.status(400).json({ error: "content不能为空" });
    const [result] = await (conn as any).execute(
      `INSERT INTO wecom_prompt_rules (channel_id, layer, category, content, enabled, sort_order, remark) VALUES (?,?,?,?,?,?,?)`,
      [channelId, layer || 2, category || '行为规则', content, enabled !== undefined ? enabled : 1, sort_order || 0, remark || '']
    );
    const insertId = (result as any).insertId;
    // 异步回填规则向量（内容即 embed 文本）
    backfillEmbeddingAsync(conn, "wecom_prompt_rules", insertId, String(content || ""));
    const [rows] = await (conn as any).execute(`SELECT * FROM wecom_prompt_rules WHERE id = ?`, [insertId]);
    res.json({ rule: (rows as any[])[0] });
  } catch (e) {
    console.error("[指令条目] 新增失败:", e);
    res.status(500).json({ error: "新增失败" });
  }
});

// 更新指令条目
router.put("/api/wecom/channels/:channelId/prompt-rules/:ruleId", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { ruleId } = req.params;
    const { layer, category, content, enabled, sort_order, remark } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    if (layer !== undefined) { fields.push("layer=?"); values.push(layer); }
    if (category !== undefined) { fields.push("category=?"); values.push(category); }
    if (content !== undefined) { fields.push("content=?"); values.push(content); }
    if (enabled !== undefined) { fields.push("enabled=?"); values.push(enabled); }
    if (sort_order !== undefined) { fields.push("sort_order=?"); values.push(sort_order); }
    if (remark !== undefined) { fields.push("remark=?"); values.push(remark); }
    if (fields.length === 0) return res.status(400).json({ error: "无更新字段" });
    values.push(ruleId);
    await (conn as any).execute(`UPDATE wecom_prompt_rules SET ${fields.join(",")} WHERE id=?`, values);
    // 内容变更时重新回填向量
    if (content !== undefined) {
      backfillEmbeddingAsync(conn, "wecom_prompt_rules", Number(ruleId), String(content || ""));
    }
    const [rows] = await (conn as any).execute(`SELECT * FROM wecom_prompt_rules WHERE id = ?`, [ruleId]);
    res.json({ rule: (rows as any[])[0] });
  } catch (e) {
    console.error("[指令条目] 更新失败:", e);
    res.status(500).json({ error: "更新失败" });
  }
});

// 删除指令条目
router.delete("/api/wecom/channels/:channelId/prompt-rules/:ruleId", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { ruleId } = req.params;
    await (conn as any).execute(`DELETE FROM wecom_prompt_rules WHERE id=?`, [ruleId]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[指令条目] 删除失败:", e);
    res.status(500).json({ error: "删除失败" });
  }
});

// ==================== 知识库管理接口 ====================

// 获取知识库列表
router.get("/api/wecom/knowledge-bases", async (req: Request, res: Response) => {
  const conn = await getDbConnection();
  try {
    const [rows] = await (conn as any).execute(
      `SELECT kb.*, COUNT(ki.id) AS item_count
       FROM wecom_knowledge_bases kb
       LEFT JOIN wecom_knowledge_items ki ON ki.kb_id = kb.id
       GROUP BY kb.id
       ORDER BY kb.id`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "获取失败" });
  } finally {
  }
});

// 获取知识库条目列表
router.get("/api/wecom/knowledge-bases/:kbId/items", async (req: Request, res: Response) => {
  const { kbId } = req.params;
  const conn = await getDbConnection();
  try {
    const [rows] = await (conn as any).execute(
      `SELECT * FROM wecom_knowledge_items WHERE kb_id = ? ORDER BY id DESC`,
      [kbId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "获取失败" });
  } finally {
  }
});

// 新增知识库条目
router.post("/api/wecom/knowledge-bases/:kbId/items", async (req: Request, res: Response) => {
  const { kbId } = req.params;
  const { item_type, question, answer, source_doc } = req.body;
  if (!answer) return res.status(400).json({ error: "内容不能为空" });
  const conn = await getDbConnection();
  try {
    const [result] = await (conn as any).execute(
      `INSERT INTO wecom_knowledge_items (kb_id, item_type, question, answer, source_doc) VALUES (?, ?, ?, ?, ?)`,
      [kbId, item_type || 'qa', question || null, answer, source_doc || null]
    );
    const newItemId = (result as any).insertId;
    backfillEmbeddingAsync(conn, "wecom_knowledge_items", newItemId, buildItemEmbedText(question, answer));
    res.json({ ok: true, id: newItemId });
  } catch (e) {
    res.status(500).json({ error: "新增失败" });
  } finally {
  }
});

// 更新知识库条目
router.put("/api/wecom/knowledge-bases/items/:itemId", async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const { item_type, question, answer, source_doc, enabled } = req.body;
  const conn = await getDbConnection();
  try {
    await (conn as any).execute(
      `UPDATE wecom_knowledge_items SET item_type=?, question=?, answer=?, source_doc=?, enabled=? WHERE id=?`,
      [item_type || 'qa', question || null, answer, source_doc || null, enabled !== undefined ? enabled : 1, itemId]
    );
    // 问答变更时重新回填向量
    backfillEmbeddingAsync(conn, "wecom_knowledge_items", Number(itemId), buildItemEmbedText(question, answer));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "更新失败" });
  } finally {
  }
});

// 删除知识库条目
router.delete("/api/wecom/knowledge-bases/items/:itemId", async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const conn = await getDbConnection();
  try {
    await (conn as any).execute(`DELETE FROM wecom_knowledge_items WHERE id=?`, [itemId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "删除失败" });
  } finally {
  }
});

// ==================== 平台公共知识库管理接口（多库 + 分身多对多绑定） ====================

// 获取所有公共知识库列表（is_shared=1）
router.get("/api/wecom/shared-kbs", async (_req: Request, res: Response) => {
  const conn = await getDbConnection();
  try {
    const [rows] = await (conn as any).execute(
      `SELECT kb.id, kb.name, kb.description, kb.created_at, kb.updated_at,
              COUNT(ki.id) AS item_count
       FROM wecom_knowledge_bases kb
       LEFT JOIN wecom_knowledge_items ki ON ki.kb_id = kb.id
       WHERE kb.is_shared = 1
       GROUP BY kb.id
       ORDER BY kb.id`
    );
    res.json(rows);
  } catch (e) {
    console.error("[公共库] 列表获取失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 新建公共知识库
router.post("/api/wecom/shared-kbs", async (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: "库名不能为空" });
  const conn = await getDbConnection();
  try {
    const [result] = await (conn as any).execute(
      `INSERT INTO wecom_knowledge_bases (name, description, channel_type, channel_id, is_system, is_shared)
       VALUES (?, ?, 'kf', 0, 0, 1)`,
      [String(name).trim(), description || null]
    );
    res.json({ ok: true, id: (result as any).insertId });
  } catch (e) {
    console.error("[公共库] 新建失败:", e);
    res.status(500).json({ error: "新建失败" });
  }
});

// 重命名/编辑公共知识库
router.put("/api/wecom/shared-kbs/:kbId", async (req: Request, res: Response) => {
  const { kbId } = req.params;
  const { name, description } = req.body;
  const conn = await getDbConnection();
  try {
    await (conn as any).execute(
      `UPDATE wecom_knowledge_bases SET name = COALESCE(?, name), description = ?, updated_at = NOW()
       WHERE id = ? AND is_shared = 1`,
      [name ? String(name).trim() : null, description ?? null, kbId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[公共库] 更新失败:", e);
    res.status(500).json({ error: "更新失败" });
  }
});

// 删除公共知识库（同时清理绑定关系与库内条目）
router.delete("/api/wecom/shared-kbs/:kbId", async (req: Request, res: Response) => {
  const { kbId } = req.params;
  const conn = await getDbConnection();
  try {
    await (conn as any).execute(`DELETE FROM wecom_channel_shared_kb WHERE kb_id = ?`, [kbId]);
    await (conn as any).execute(`DELETE FROM wecom_knowledge_items WHERE kb_id = ?`, [kbId]);
    await (conn as any).execute(`DELETE FROM wecom_knowledge_bases WHERE id = ? AND is_shared = 1`, [kbId]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[公共库] 删除失败:", e);
    res.status(500).json({ error: "删除失败" });
  }
});

// 查询某分身已绑定的公共库 id 列表
router.get("/api/wecom/channels/:channelId/shared-kbs", async (req: Request, res: Response) => {
  const { channelId } = req.params;
  const conn = await getDbConnection();
  try {
    const [rows] = await (conn as any).execute(
      `SELECT kb_id FROM wecom_channel_shared_kb WHERE channel_id = ?`,
      [channelId]
    );
    res.json({ kb_ids: (rows as any[]).map((r) => r.kb_id) });
  } catch (e) {
    console.error("[公共库] 查询分身绑定失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 设置某分身绑定的公共库（全量覆盖）
router.put("/api/wecom/channels/:channelId/shared-kbs", async (req: Request, res: Response) => {
  const { channelId } = req.params;
  const { kb_ids } = req.body;
  if (!Array.isArray(kb_ids)) return res.status(400).json({ error: "kb_ids 必须为数组" });
  const conn = await getDbConnection();
  try {
    await (conn as any).execute(`DELETE FROM wecom_channel_shared_kb WHERE channel_id = ?`, [channelId]);
    for (const kbId of kb_ids) {
      await (conn as any).execute(
        `INSERT IGNORE INTO wecom_channel_shared_kb (channel_id, kb_id) VALUES (?, ?)`,
        [channelId, kbId]
      );
    }
    res.json({ ok: true, count: kb_ids.length });
  } catch (e) {
    console.error("[公共库] 设置分身绑定失败:", e);
    res.status(500).json({ error: "保存失败" });
  }
});

// -------------------------------------------------------
// AI 模型配置管理接口（平台管理→AI模型配置）
// -------------------------------------------------------

// GET /api/wecom/ai-model-configs - 获取全部AI模型配置列表 + 可选模型选项
router.get("/api/wecom/ai-model-configs", async (_req: Request, res: Response) => {
  try {
    const configMap = await getAIConfigs();
    // 将数据库配置与 USE_CASE_META 合并，补充前端需要的字段
    const configs = Array.from(configMap.values()).map(c => {
      const meta = USE_CASE_META[c.use_case] || { label: c.use_case, desc: "", category: "chat" };
      return {
        ...c,
        use_case_label: meta.label,
        use_case_desc: meta.desc,
        category: meta.category,
      };
    });
    // 按 category 分组返回模型选项（前端按分类展示下拉框）
    const model_options: Record<string, typeof MODEL_OPTIONS> = {};
    for (const opt of MODEL_OPTIONS) {
      if (!model_options[opt.category]) model_options[opt.category] = [];
      model_options[opt.category].push({ ...opt, value: opt.model_name } as any);
    }
    res.json({ ok: true, configs, model_options });
  } catch (e) {
    console.error("[AI模型配置] 获取失败:", e);
    res.status(500).json({ error: "获取AI模型配置失败" });
  }
});

// PUT /api/wecom/ai-model-configs/:useCase - 保存单条AI模型配置
router.put("/api/wecom/ai-model-configs/:useCase", async (req: Request, res: Response) => {
  const { useCase } = req.params;
  const { provider, model_name, api_key, api_base } = req.body;
  if (!provider || !model_name) return res.status(400).json({ error: "provider 和 model_name 不能为空" });
  try {
    await saveAIConfig({ use_case: useCase as UseCase, provider, model_name, api_key: api_key || "", api_base: api_base || "" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[AI模型配置] 保存失败:", e);
    res.status(500).json({ error: "保存AI模型配置失败" });
  }
});

// 获取渠道AI配置（欢迎词、System Prompt等）
router.get("/api/wecom/channel-config/:channelId", async (req: Request, res: Response) => {
  const { channelId } = req.params;
  const conn = await getDbConnection();
  try {
    // 表结构为键值对：(channel_id, config_key, config_val)
    const [rows] = await (conn as any).execute(
      `SELECT config_key, config_val FROM wecom_channel_config WHERE channel_id = ?`,
      [channelId]
    );
    const kvMap: Record<string, string> = {};
    for (const row of rows as any[]) {
      kvMap[row.config_key] = row.config_val;
    }
    res.json({
      channel_id: channelId,
      welcome_msg: kvMap['welcome_msg'] || '',
      waiting_msg: kvMap['waiting_msg'] || '收到，稍等为您解答～',
      system_prompt: kvMap['system_prompt'] || '',
      ai_model: kvMap['ai_model'] || 'deepseek-chat',
      knowledge_base_id: kvMap['knowledge_base_id'] ? Number(kvMap['knowledge_base_id']) : null,
      context_rounds: kvMap['context_rounds'] ? Number(kvMap['context_rounds']) : 10,
      notify_enabled: kvMap['notify_enabled'] || '0',
      notify_userids: kvMap['notify_userids'] || '',
      disable_system_kb: kvMap['disable_system_kb'] || '0',
    });
  } catch (e) {
    res.status(500).json({ error: "获取失败" });
  }
});

// 保存渠道AI配置
router.post("/api/wecom/channel-config/:channelId", async (req: Request, res: Response) => {
  const { channelId } = req.params;
  const { welcome_msg, waiting_msg, system_prompt, ai_model, knowledge_base_id, context_rounds, notify_enabled, notify_userids, disable_system_kb } = req.body;
  const conn = await getDbConnection();
  try {
    // 按键值对逐条 upsert，只更新传入的字段
    const kvPairs: Record<string, string> = {};
    if (welcome_msg !== undefined) kvPairs.welcome_msg = welcome_msg || '';
    if (waiting_msg !== undefined) kvPairs.waiting_msg = waiting_msg || '收到，稍等为您解答～';
    if (system_prompt !== undefined) kvPairs.system_prompt = system_prompt || '';
    if (ai_model !== undefined) kvPairs.ai_model = ai_model || 'deepseek-chat';
    if (knowledge_base_id !== undefined) kvPairs.knowledge_base_id = knowledge_base_id != null ? String(knowledge_base_id) : '';
    if (context_rounds !== undefined) kvPairs.context_rounds = context_rounds != null ? String(context_rounds) : '10';
    if (notify_enabled !== undefined) kvPairs.notify_enabled = notify_enabled != null ? String(notify_enabled) : '0';
    if (notify_userids !== undefined) kvPairs.notify_userids = notify_userids != null ? String(notify_userids) : '';
    if (disable_system_kb !== undefined) kvPairs.disable_system_kb = String(disable_system_kb);
    for (const [key, val] of Object.entries(kvPairs)) {
      await (conn as any).execute(
        `INSERT INTO wecom_channel_config (channel_id, config_key, config_val)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE config_val=VALUES(config_val)`,
        [channelId, key, val]
      );
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[channel-config] 保存失败:', e?.message);
    res.status(500).json({ error: "保存失败" });
  }
});

// 获取对话日志（按渠道）
router.get("/api/wecom/chat-logs", async (req: Request, res: Response) => {
  const { channel_type, start_date, end_date, user_id, limit = '50', offset = '0' } = req.query as Record<string, string>;
  const conn = await getDbConnection();
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    if (start_date) { conditions.push('mc.created_at >= ?'); params.push(start_date + ' 00:00:00'); }
    if (end_date) { conditions.push('mc.created_at <= ?'); params.push(end_date + ' 23:59:59'); }
    if (user_id) { conditions.push('mc.wecom_user_id = ?'); params.push(user_id); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await (conn as any).execute(
      `SELECT mc.id, mc.wecom_user_id, mc.user_message, mc.reply_preview, mc.model_used,
              mc.credits_used, mc.created_at,
              ws.nickname, CAST(NULL AS CHAR) AS avatar_url
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
    res.json({ logs: rows, total: (countRows as any[])[0].total });
  } catch (e) {
    console.error('[对话日志]', e);
    res.status(500).json({ error: "获取失败" });
  } finally {
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 自建应用管理接口 (wecom_apps)
// ═══════════════════════════════════════════════════════════════════════════════

// 获取应用列表
router.get("/api/wecom/apps", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      `SELECT id, name, corp_id, agent_id, callback_url, is_enabled, created_at FROM wecom_apps ORDER BY id ASC`
    );
    res.json({ apps: rows });
  } catch (e) {
    console.error("[应用] 获取列表失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 获取应用详情（含敏感字段，管理员专用）
router.get("/api/wecom/apps/:id", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { id } = req.params;
    const [rows] = await (conn as any).execute(
      `SELECT id, name, corp_id, agent_id, secret, token, encoding_aes_key, callback_url, description, is_enabled, created_at FROM wecom_apps WHERE id = ?`,
      [id]
    );
    if (!(rows as any[]).length) return res.status(404).json({ error: "应用不存在" });
    res.json({ app: (rows as any[])[0] });
  } catch (e) {
    console.error("[应用] 获取详情失败:", e);
    res.status(500).json({ error: "获取失败" });
  }
});

// 新建app
router.post("/api/wecom/apps", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { name, corp_id, agent_id, secret, token, encoding_aes_key, callback_url, description } = req.body;
    if (!name || !corp_id || !agent_id || !secret) return res.status(400).json({ error: "name/corp_id/agent_id/secret必填" });
    const [result] = await (conn as any).execute(
      `INSERT INTO wecom_apps (name, corp_id, agent_id, secret, token, encoding_aes_key, callback_url, description) VALUES (?,?,?,?,?,?,?,?)`,
      [name, corp_id, agent_id, secret, token || '', encoding_aes_key || '', callback_url || '', description || '']
    );
    res.json({ ok: true, id: (result as any).insertId });
  } catch (e) {
    console.error("[应用] 新建失败:", e);
    res.status(500).json({ error: "新建失败" });
  }
});

// 更新app
router.put("/api/wecom/apps/:id", async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const { id } = req.params;
    const { name, corp_id, agent_id, secret, token, encoding_aes_key, callback_url, description, is_enabled } = req.body;
    await (conn as any).execute(
      `UPDATE wecom_apps SET name=?, corp_id=?, agent_id=?, secret=?, token=?, encoding_aes_key=?, callback_url=?, description=?, is_enabled=? WHERE id=?`,
      [name, corp_id, agent_id, secret, token || '', encoding_aes_key || '', callback_url || '', description || '', is_enabled ?? 1, id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[应用] 更新失败:", e);
    res.status(500).json({ error: "更新失败" });
  }
});

// ─── AI 辅助指令知识库维护 ────────────────────────────────────────────────────

// 图片识别接口：接收 base64 图片，自动读取平台AI模型配置（image_ocr场景）
router.post("/api/wecom/ai-image-extract", async (req: Request, res: Response) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "请上传图片" });

  try {
    const result = await callAIVision(imageBase64);
    res.json({ ok: true, text: result.text });
  } catch (e: any) {
    console.error("[AI图片识别] 异常:", e);
    res.status(400).json({ error: e?.message || "图片识别失败，请在平台管理→AI模型配置中检查图片识别配置" });
  }
});

// 接收大白话，调用 DeepSeek 分析，返回结构化的「指令建议」和「知识库条目建议」
router.post("/api/wecom/ai-assist-config", async (req: Request, res: Response) => {
  const { text, channelId, kbId: reqKbId, scope, kbIds } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "请输入内容" });
  // scope='platform' 表示平台层：查重针对平台共享规则(channel_id=1)与选中的共享库
  const isPlatform = scope === 'platform';
  // 规范化选中的库 id 列表（平台模式用）
  const targetKbIds: number[] = Array.isArray(kbIds)
    ? kbIds.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  // 硬编码系统提示词：明确告知 AI 这里的输出是用于知识库和指令集的
  const systemPrompt = `你是一个企业微信AI客服的配置助手。你的输出将直接写入两个地方：

《写入目标》
1. **AI指令（System Prompt）**：直接嵌入到 AI 的系统提示词中，控制 AI 的行为、风格、禁止事项。
2. **知识库（QA对）**：存入知识库，当客户问相关问题时 AI 会检索并引用。

《输出要求（严格执行）》
- **精炼犠利**：每条指令必须是可直接执行的行为准则，不要模糊、不要冗余
- **指令格式**：用第二人称命令式（如“回复时用口语化表达”），不要用描述性语言
- **知识库格式**：问题要精准简短（客户真实会这样问），答案要完整准确包含具体数据
- **不要展开**：不要补充用户未提供的信息，不要自己编造价格或不确定的事实
- **分类准确**：行为约束放指令，具体事实放知识库

请以JSON格式返回：
{
  "prompt_additions": [
    "第二人称命令式的指令内容1",
    "第二人称命令式的指令内容2"
  ],
  "kb_items": [
    { "question": "客户真实会问的问题", "answer": "完整准确的答案" }
  ],
  "summary": "本次提炼了X条指令和Y条知识库条目"
}

只返回JSON，不要其他文字。如果某类没有内容则返回空数组[]。`;

  try {
    const result = await sendToDeepSeekAndGetReply(text.trim(), "deepseek-chat", systemPrompt, "ai_organize");
    // 尝试解析JSON
    let parsed: any = null;
    try {
      // 提取JSON（可能有markdown代码块包裹）
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("[AI辅助] JSON解析失败:", result.content.substring(0, 200));
    }
    if (!parsed) {
      return res.status(500).json({ error: "AI返回格式异常，请重试" });
    }
    // 查重：获取现有规则和知识库条目（同时取出向量用于语义查重）
    const conn2 = await getDbConnection();
    let existingRules: string[] = [];
    let existingKbItems: { question: string; answer: string }[] = [];
    // 带向量的现有数据（用于语义查重）
    let ruleVecs: { text: string; vec: number[] | null }[] = [];
    let kbVecs: { text: string; vec: number[] | null }[] = [];
    try {
      if (conn2 && isPlatform) {
        // 【平台模式】规则查重：仅平台共享规则 channel_id=1
        const [sysRuleRows] = await (conn2 as any).execute(
          `SELECT content, embedding FROM wecom_prompt_rules WHERE channel_id = 1 AND enabled = 1`
        );
        existingRules = (sysRuleRows as any[]).map((r: any) => r.content || "");
        ruleVecs = (sysRuleRows as any[]).map((r: any) => ({ text: r.content || "", vec: parseEmbedding(r.embedding) }));

        // 知识库查重：针对选中的共享库（targetKbIds）；若未指定则查全部 is_shared=1
        let kbRows: any[] = [];
        if (targetKbIds.length > 0) {
          const placeholders = targetKbIds.map(() => '?').join(',');
          const [rows] = await (conn2 as any).execute(
            `SELECT ki.question, ki.answer, ki.embedding FROM wecom_knowledge_items ki
             WHERE ki.kb_id IN (${placeholders}) AND ki.enabled = 1 LIMIT 1000`,
            targetKbIds
          );
          kbRows = rows as any[];
        } else {
          const [rows] = await (conn2 as any).execute(
            `SELECT ki.question, ki.answer, ki.embedding FROM wecom_knowledge_items ki
             JOIN wecom_knowledge_bases kb ON ki.kb_id = kb.id
             WHERE kb.is_shared = 1 AND ki.enabled = 1 LIMIT 1000`
          );
          kbRows = rows as any[];
        }
        existingKbItems = kbRows.map((r: any) => ({ question: r.question || "", answer: r.answer || "" }));
        kbVecs = kbRows.map((r: any) => ({
          text: buildItemEmbedText(r.question, r.answer),
          vec: parseEmbedding(r.embedding),
        }));
      } else if (conn2 && channelId) {
        const [ruleRows] = await (conn2 as any).execute(
          `SELECT content, embedding FROM wecom_prompt_rules WHERE channel_id = ? AND enabled = 1`,
          [channelId]
        );
        // 同时查平台共享规则
        const [sysRuleRows] = await (conn2 as any).execute(
          `SELECT content, embedding FROM wecom_prompt_rules WHERE channel_id = 1 AND enabled = 1`
        );
        const allRuleRows = [...(ruleRows as any[]), ...(sysRuleRows as any[])];
        existingRules = allRuleRows.map((r: any) => r.content || "");
        ruleVecs = allRuleRows.map((r: any) => ({ text: r.content || "", vec: parseEmbedding(r.embedding) }));

        const [kbRows] = await (conn2 as any).execute(
          `SELECT ki.question, ki.answer, ki.embedding FROM wecom_knowledge_items ki
           JOIN wecom_knowledge_bases kb ON ki.kb_id = kb.id
           WHERE kb.channel_id = ? AND ki.enabled = 1 LIMIT 500`,
          [channelId]
        );
        existingKbItems = (kbRows as any[]).map((r: any) => ({ question: r.question || "", answer: r.answer || "" }));
        kbVecs = (kbRows as any[]).map((r: any) => ({
          text: buildItemEmbedText(r.question, r.answer),
          vec: parseEmbedding(r.embedding),
        }));
      }
    } catch {}

    // 【向量语义查重】如果向量可用，预先批量生成本次新内容的向量
    const useVector = isVectorEnabled();
    const newRuleTexts: string[] = (parsed.prompt_additions || []).map((p: any) =>
      typeof p === "string" ? p : (p.content || "")
    );
    const newKbTexts: string[] = (parsed.kb_items || []).map((item: any) =>
      buildItemEmbedText(item.question || "", item.answer || "")
    );
    let newRuleVecs: (number[] | null)[] = newRuleTexts.map(() => null);
    let newKbVecs: (number[] | null)[] = newKbTexts.map(() => null);
    if (useVector) {
      try {
        const allNew = [...newRuleTexts, ...newKbTexts].map((t) => t || " ");
        if (allNew.length > 0) {
          const vecs = await embedTexts(allNew);
          newRuleVecs = vecs.slice(0, newRuleTexts.length);
          newKbVecs = vecs.slice(newRuleTexts.length);
        }
      } catch (ve) {
        console.error("[AI辅助] 查重向量生成失败，降级关键词:", ve);
      }
    }
    // 向量查重辅助：返回 {level, score, matchedText}，未命中返回 null
    function vecDup(newVec: number[] | null, existing: { text: string; vec: number[] | null }[]) {
      if (!newVec) return null;
      let best = -1, bestText = "";
      for (const e of existing) {
        if (!e.vec) continue;
        const s = cosineSim(newVec, e.vec);
        if (s > best) { best = s; bestText = e.text; }
      }
      if (best < 0) return null;
      let level = "new";
      if (best >= DEDUP_THRESHOLD_DUPLICATE) level = "duplicate";
      else if (best >= DEDUP_THRESHOLD_SIMILAR) level = "similar";
      return { level, score: best, text: bestText };
    }

    // 关键词重叠辅助查重（向量不可用时降级用），返回 {level, score, text}
    function kwDup(newText: string, existingTexts: string[]) {
      let maxScore = 0, matched = "";
      for (const ex of existingTexts) {
        const s = simScoreRef(newText, ex);
        if (s > maxScore) { maxScore = s; matched = ex; }
      }
      let level = "new";
      if (maxScore >= 0.7) level = "duplicate";
      else if (maxScore >= 0.4) level = "similar";
      return { level, score: maxScore, text: matched };
    }

    // 简单相似度：关键词重叠率
    function simScoreRef(a: string, b: string): number {
      const wordsA = new Set(a.replace(/[，。！？、；：""''（）【】]/g, ' ').split(/\s+/).filter(w => w.length > 1));
      const wordsB = new Set(b.replace(/[，。！？、；：""''（）【】]/g, ' ').split(/\s+/).filter(w => w.length > 1));
      if (wordsA.size === 0 || wordsB.size === 0) return 0;
      let overlap = 0;
      wordsA.forEach(w => { if (wordsB.has(w)) overlap++; });
      return overlap / Math.min(wordsA.size, wordsB.size);
    }

    // 归类工具：先试向量，向量不可用时降级关键词，返回 {level, score, matched}
    function classify(newText: string, newVec: number[] | null, existing: { text: string; vec: number[] | null }[], existingTexts: string[]) {
      const vd = vecDup(newVec, existing);
      if (vd) return { level: vd.level, score: vd.score, matched: vd.text };
      const kd = kwDup(newText, existingTexts);
      return { level: kd.level, score: kd.score, matched: kd.text };
    }

    // 收集需要 AI 二次判断的中间区间（similar）条目，批量一次问 AI
    const judgeQueue: { key: string; newText: string; matched: string }[] = [];

    // 初步归类 prompt_additions
    const promptRaw = (parsed.prompt_additions || []).map((p: any, idx: number) => {
      const content = typeof p === 'string' ? p : (p.content || '');
      const c = classify(content, newRuleVecs[idx], ruleVecs, existingRules);
      return { content, level: c.level, score: c.score, matched: c.matched, _key: `p${idx}` };
    });
    promptRaw.forEach((p: any) => {
      if (p.level === 'similar') judgeQueue.push({ key: p._key, newText: p.content, matched: p.matched });
    });

    // 初步归类 kb_items
    const kbRaw = (parsed.kb_items || []).map((item: any, idx: number) => {
      const q = item.question || '';
      const a = item.answer || '';
      const text = `问：${q}\n答：${a}`;
      const exTexts = existingKbItems.map((e: any) => `问：${e.question}\n答：${e.answer}`);
      const c = classify(text, newKbVecs[idx], kbVecs, exTexts);
      return { question: q, answer: a, level: c.level, score: c.score, matched: c.matched, _key: `k${idx}` };
    });
    kbRaw.forEach((k: any) => {
      if (k.level === 'similar') judgeQueue.push({ key: k._key, newText: `问：${k.question}\n答：${k.answer}`, matched: k.matched });
    });

    // AI 二次判断 + 差量提取：对相似条目，AI 只提取「新内容里现有条目没有的增量」，重复部分丢弃
    // verdict.action: 'add'(全新保留) | 'merge'(只保留增量delta) | 'skip'(完全重复丢弃)
    const aiVerdict: Record<string, { keep: boolean; action: string; reason: string; delta?: string; deltaQ?: string; deltaA?: string }> = {};
    if (judgeQueue.length > 0) {
      try {
        const listText = judgeQueue.map((j, i) =>
          `[${i}] 新内容：${j.newText.slice(0, 300)}\n    现有最相似条目：${(j.matched || '').slice(0, 300)}`
        ).join('\n\n');
        const judgePrompt = `你是营养顾问知识库管理助手。下面每一条是「新内容」与知识库中「现有最相似条目」的对比。请逐条做“差量合并”判断，目标是【只保留新内容里现有条目没有的增量信息，重复部分一律丢弃】：\n\n- action="skip"：新内容与现有条目表达完全相同的意思、没有任何新增信息 → 整条丢弃\n- action="merge"：新内容与现有条目大部分重复，但含有少量现有条目没有的增量信息（如更精确的数据、新的例子、补充的场景） → 必须在 delta 字段里只写出“那部分增量信息”，重复部分不要写\n- action="add"：新内容与现有条目其实主题不同（算法误判到一起），或绝大部分都是新信息 → 整条作为新内容保留，delta 留空\n\n要求：\n1. delta 必须是完整通顺的一句话或一段话，能独立入库，不能只是零散词\n2. delta 里绝不能包含现有条目里已有的信息\n3. 若该条是“问答对”（含“问：”“答：”），merge 时请用 deltaQ/deltaA 分别给出增量后的问题与答案\n\n待判断列表：\n${listText}\n\n仅返回 JSON 数组，格式：[{"index":0,"action":"merge","reason":"简短理由(20字内)","delta":"增量内容","deltaQ":"增量问题(问答对时)","deltaA":"增量答案(问答对时)"}]，不要其他文字。`;
        const judgeRes = await callAI('ai_organize', [
          { role: 'system', content: '你是严谨的知识库差量合并助手，只返回 JSON。核心原则：只提取增量信息，重复部分一律丢弃，delta 绝不能含已有信息。' },
          { role: 'user', content: judgePrompt },
        ]);
        let jtext = (judgeRes.text || '').trim();
        const jm = jtext.match(/\[[\s\S]*\]/);
        if (jm) jtext = jm[0];
        const arr = JSON.parse(jtext);
        const POSITIVE_RE = /额外|补充|不同|新增|更精确|更详细|不是重复|非重复|新信息|新内容|不相关/;
        const NEGATIVE_RE = /重复|相同|一致|已有|重叠|同一/;
        for (const v of arr) {
          const item = judgeQueue[v.index];
          if (!item) continue;
          const reason = String(v.reason || '');
          let action = String(v.action || '').toLowerCase();
          if (action !== 'add' && action !== 'merge' && action !== 'skip') {
            // 兜底：按理由推断
            action = NEGATIVE_RE.test(reason) && !POSITIVE_RE.test(reason) ? 'skip' : 'add';
          }
          const delta = String(v.delta || '').trim();
          const deltaQ = String(v.deltaQ || '').trim();
          const deltaA = String(v.deltaA || '').trim();
          // 一致性兜底：判 merge 却没给出任何 delta → 降级
          if (action === 'merge' && !delta && !deltaA) {
            action = NEGATIVE_RE.test(reason) ? 'skip' : 'add';
          }
          const keep = action !== 'skip';
          aiVerdict[item.key] = { keep, action, reason, delta, deltaQ, deltaA };
        }
      } catch (je) {
        console.error('[AI辅助] 二次差量判断失败，相似条目默认整条归入建议加入:', je);
      }
    }

    // 根据 level + AI 判决生成最终 recommendation/dedup_reason/matched/action/delta
    function finalize(level: string, score: number, matched: string, key: string) {
      const pct = Math.round(score * 100);
      if (level === 'duplicate') {
        return { recommendation: 'skip', action: 'skip', dedup_reason: `与现有条目高度重复（相似度${pct}%）`, matched };
      }
      if (level === 'similar') {
        const v = aiVerdict[key];
        if (v && v.action === 'skip') {
          return { recommendation: 'skip', action: 'skip', dedup_reason: v.reason || `与现有条目重复（相似度${pct}%）`, matched };
        }
        if (v && v.action === 'merge') {
          return { recommendation: 'add', action: 'merge', dedup_reason: v.reason || `仅保留增量部分（原文相似度${pct}%）`, matched, delta: v.delta, deltaQ: v.deltaQ, deltaA: v.deltaA };
        }
        if (v && v.action === 'add') {
          return { recommendation: 'add', action: 'add', dedup_reason: v.reason || `与现有条目主题不同，整条加入`, matched };
        }
        return { recommendation: 'add', action: 'add', dedup_reason: `与现有条目部分相似（相似度${pct}%），建议人工复核`, matched };
      }
      return { recommendation: 'add', action: 'add', dedup_reason: '全新内容', matched: '' };
    }

    const promptAdditions = promptRaw.map((p: any) => {
      const f: any = finalize(p.level, p.score, p.matched, p._key);
      // merge 时用增量 delta 替换要入库的内容；original 保留原文供对照展示
      const finalContent = (f.action === 'merge' && f.delta) ? f.delta : p.content;
      return { content: finalContent, original: p.content, recommendation: f.recommendation, action: f.action, dedup_reason: f.dedup_reason, matched: f.matched, duplicate_check: f.recommendation === 'skip' ? 'duplicate' : 'new' };
    });
    const kbItems = kbRaw.map((k: any) => {
      const f: any = finalize(k.level, k.score, k.matched, k._key);
      // merge 时用增量 deltaQ/deltaA 替换；originalQ/A 保留原文
      const useMerge = f.action === 'merge' && (f.deltaA || f.deltaQ);
      const finalQ = useMerge ? (f.deltaQ || k.question) : k.question;
      const finalA = useMerge ? (f.deltaA || k.answer) : k.answer;
      return { question: finalQ, answer: finalA, originalQuestion: k.question, originalAnswer: k.answer, recommendation: f.recommendation, action: f.action, dedup_reason: f.dedup_reason, matched: f.matched, duplicate_check: f.recommendation === 'skip' ? 'duplicate' : 'new' };
    });

    // 按 recommendation 分组汇总
    const addItems = [
      ...promptAdditions.filter((p: any) => p.recommendation === 'add').map((p: any) => ({ kind: 'prompt', ...p })),
      ...kbItems.filter((k: any) => k.recommendation === 'add').map((k: any) => ({ kind: 'kb', ...k })),
    ];
    const skipItems = [
      ...promptAdditions.filter((p: any) => p.recommendation === 'skip').map((p: any) => ({ kind: 'prompt', ...p })),
      ...kbItems.filter((k: any) => k.recommendation === 'skip').map((k: any) => ({ kind: 'kb', ...k })),
    ];

    const addCount = addItems.length;
    const skipCount = skipItems.length;
    const mergeCount = addItems.filter((it: any) => it.action === 'merge').length;
    const parts: string[] = [];
    if (addCount > 0) parts.push(`✅ 建议加入 ${addCount} 条`);
    if (mergeCount > 0) parts.push(`其中 ${mergeCount} 条已只保留增量部分`);
    if (skipCount > 0) parts.push(`已自动去重 ${skipCount} 条`);
    const dupSummary = parts.join('，') || '无可加入内容';

    res.json({
      ok: true,
      prompt_additions: promptAdditions,
      kb_items: kbItems,
      add_items: addItems,
      skip_items: skipItems,
      summary: parsed.summary || "",
      dup_summary: dupSummary,
      tokens: result.totalTokens,
      model_used: "AI智能归类",
    });
  } catch (e) {
    console.error("[AI辅助] 分析失败:", e);
    res.status(500).json({ error: "AI分析失败，请稍后重试" });
  }
});

// -----------------------------------------------------------
// 获取所有企微用户列表（用于规则编辑中的「指定用户」选择）
// 从 wecom_manus_sessions 表中读取已有用户
// -----------------------------------------------------------
router.get("/api/wecom/users", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      `SELECT DISTINCT wecom_user_id, COALESCE(NULLIF(nickname,''), wecom_user_id) AS nickname
       FROM wecom_manus_sessions
       ORDER BY updated_at DESC`
    ) as any;
    const users = (rows as any[]).map((r: any) => ({
      wecom_user_id: r.wecom_user_id,
      nickname: r.nickname,
    }));
    res.json({ ok: true, users });
  } catch (e) {
    console.error("[企微用户列表] 查询失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// AI辅助分析平台指令：建议分类 + 润色
router.post("/api/wecom/ai-analyze-rule", async (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "请输入指令内容" });

  const systemPrompt = `你是一个企业微信AI客服系统的指令库管理专家。用户会粘贴一段指令原文，你需要：

1. 判断它属于哪一层：
   - 第1层「角色定义」：AI是谁、有什么身份、能力范围、人格设定
   - 第2层「行为规范」：AI在对话中应该怎么做、具体动作、处理逻辑

2. 确定具体分类（category）：
   - 角色定义层：只能选「角色定义」
   - 行为规范层：可选「知识库规则」「回复格式」「语气风格」「安全边界」

3. 对原文进行润色和补充：
   - 保留原意图，语言更精准专业
   - 补充可能的边界情况和异常处理
   - 使用第二人称命令式（如「当...时，你应该...」）

请以JSON格式返回：
{
  "suggested_layer": 1 或 2,
  "suggested_category": "分类名称",
  "reason": "为什么建议放这里（一句话）",
  "polished": "润色后的完整指令内容"
}

只返回JSON，不要其他文字。`;

  try {
    const result = await sendToDeepSeekAndGetReply(content.trim(), "deepseek-chat", systemPrompt, "ai_analyze");
    let parsed: any = null;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("[AI分析指令] JSON解析失败:", result.content.substring(0, 200));
    }
    if (!parsed) return res.status(500).json({ error: "AI返回格式异常，请重试" });
    res.json({ ok: true, result: parsed });
  } catch (e) {
    console.error("[AI分析指令] 失败:", e);
    res.status(500).json({ error: "AI分析失败，请稍后重试" });
  }
});

export default router;


