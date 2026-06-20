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
import { getUsdtCnyRate } from "./price-scanner";
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
const MANUS_API_KEY = process.env.MANUS_API_KEY || "sk-CR8TOKZLGtXfij6m_2UNN8XQcjq75tcEYTtYv6Y9mWm3-bGLAxU54FiOK4IESdLl_Xcr1FVbceWQJD4XaNv4lNYnsxqw";
const MANUS_API_BASE = "https://api.manus.ai/v2";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
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

// DeepSeek 模型 profile 列表（用于判断是否走 DeepSeek 路径）
const DEEPSEEK_PROFILES = new Set(["deepseek-chat", "deepseek-v4-flash"]);

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
  return "manus-1.6-max";
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
// 工具函数：处理菜单点击事件
// -----------------------------------------------------------
async function handleMenuClick(userId: string, eventKey: string): Promise<void> {
  console.log(`[WeCom] 菜单点击: user=${userId} key=${eventKey}`);

  switch (eventKey) {
    case "MODEL_MAX":
    case "MODEL_NORMAL":
    case "MODEL_LITE":
    case "MODEL_DS_FLASH": {
      const model = MODEL_PROFILES[eventKey];
      await setUserModel(userId, model.profile);
      await sendWeComMessage(userId, `已切换到: ${model.emoji} ${model.label}\n\n下次发送消息将使用新模型。`);
      break;
    }

    case "MODEL_STATUS": {
      const label = await getUserModelLabel(userId);
      await sendWeComMessage(userId, `当前使用模型: ${label}`);
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
        "",
        "底部菜单功能:",
        "[切换模型] 选择不同的 AI 模型",
        "  🔴 Max: 最强能力，适合复杂任务",
        "  🟡 标准: 平衡能力与速度",
        "  🟢 轻量: 快速响应，省积分",
        "  ⚡ DeepSeek 快速: 高效对话",
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
      await sendWeComMessage(userId, "感谢您的反馈！请直接回复您的建议或问题，我们会认真处理。");
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
  try {
    await (conn as any).execute(`ALTER TABLE wecom_manus_sessions ADD COLUMN IF NOT EXISTS model_pref VARCHAR(50) DEFAULT 'manus-1.6-max' COMMENT '用户默认模型'`);
    await (conn as any).execute(`ALTER TABLE wecom_manus_sessions ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT NULL COMMENT '系统提示词'`);
    await (conn as any).execute(`ALTER TABLE wecom_manus_sessions ADD COLUMN IF NOT EXISTS enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用'`);
  } catch (_) {}

  // 创建消息级积分记录表
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_message_credits (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      wecom_user_id VARCHAR(100) NOT NULL COMMENT '企业微信用户ID',
      manus_task_id VARCHAR(200) NOT NULL COMMENT 'Manus任务ID',
      user_message  TEXT         COMMENT '用户发送的消息内容（前200字）',
      credits_before INT         NOT NULL DEFAULT 0 COMMENT '发消息前任务累计积分消耗',
      credits_after  INT         NOT NULL DEFAULT 0 COMMENT 'AI回复后任务累计积分消耗',
      credits_used   INT         NOT NULL DEFAULT 0 COMMENT '本次消耗积分（after - before）',
      model_used    VARCHAR(50)  COMMENT '使用的模型',
      reply_preview TEXT         COMMENT 'AI回复预览（前100字）',
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '消息时间',
      INDEX idx_mc_wecom_user (wecom_user_id),
      INDEX idx_mc_task (manus_task_id),
      INDEX idx_mc_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业微信每条消息积分消耗记录'
  `);

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

  // 插入默认路由配置（如不存在）
  await (conn as any).execute(`
    INSERT IGNORE INTO wecom_route_config (config_key, config_val) VALUES
    ('route_enabled', '0'),
    ('fallback_model', 'deepseek-chat'),
    ('classifier_prompt', '你是消息分类器，只回复数字，不解释。\n规则：\n1 = 普通问答、闲聊、查信息、写文字（DeepSeek快速处理）\n2 = 需要深度推理、复杂分析、数学逻辑（DeepSeek深思处理）\n3 = 需要执行操作、生成文件、调用工具、处理图片（Manus处理）\n\n用户消息：{MSG}\n\n回复数字：'),
    ('employee_welcome', '已切换到 AI 员工模式\n\n我会自动判断你的问题，选择最合适的 AI 来回答。\n直接发消息开始吧！'),
    ('waiting_msg', '收到，AI 正在思考中，请稍候...'),
    ('system_prompt', '')
  `);

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

  // 创建新的 Manus 任务（使用 Max 模式）
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
        agent_profile: await getUserModel(wecomUserId),
      }),
    });
    const data = await res.json() as any;
    console.log("[Manus] task.create 响应:", JSON.stringify(data).substring(0, 300));

    if (!data.ok || !data.task_id) {
      console.error("[Manus] 创建任务失败:", JSON.stringify(data));
      return null;
    }

    // 等待初始任务完成（最多60秒），避免立刻 sendMessage 时任务还在 running
    const initTaskId = data.task_id;
    let initWaited = 0;
    while (initWaited < 60) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      initWaited += 3;
      try {
        const checkRes = await fetch(
          `${MANUS_API_BASE}/task.listMessages?task_id=${initTaskId}&order=desc&limit=5`,
          { headers: { "x-manus-api-key": MANUS_API_KEY } }
        );
        const checkData = await checkRes.json() as any;
        if (checkData.ok) {
          const statusEvt = (checkData.messages || []).find((e: any) => e.type === "status_update");
          const st = statusEvt?.status_update?.agent_status;
          console.log(`[Manus] 初始任务状态: ${st} (已等待 ${initWaited}s)`);
          if (st === "stopped" || st === "waiting" || st === "error") break;
        }
      } catch (_) {}
    }

    // 保存到数据库，新任务强制为 active
    await (conn as any).execute(
      "INSERT INTO wecom_manus_sessions (wecom_user_id, manus_task_id, status) VALUES (?, ?, 'active')",
      [wecomUserId, initTaskId]
    );
    console.log(`[Manus] 为用户 ${wecomUserId} 创建新任务成功: ${initTaskId}`);
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
async function getRouteConfig(): Promise<{ enabled: boolean; fallbackModel: string; classifierPrompt: string }> {
  try {
    const conn = await getDbConnection();
    if (!conn) return { enabled: false, fallbackModel: "deepseek-chat", classifierPrompt: "" };
    const [rows] = await (conn as any).execute(
      "SELECT config_key, config_val FROM wecom_route_config WHERE config_key IN ('route_enabled','fallback_model','classifier_prompt')"
    ) as any;
    const cfg: Record<string, string> = {};
    for (const r of (rows as any[])) cfg[r.config_key] = r.config_val;
    return {
      enabled: cfg["route_enabled"] === "1",
      fallbackModel: cfg["fallback_model"] || "deepseek-chat",
      classifierPrompt: cfg["classifier_prompt"] || "",
    };
  } catch (_) {
    return { enabled: false, fallbackModel: "deepseek-chat", classifierPrompt: "" };
  }
}

// AI 路由：对消息进行分类，返回 1/2/3
async function classifyMessage(userMessage: string, prompt: string): Promise<{ result: number; tokens: number }> {
  try {
    if (!DEEPSEEK_API_KEY) return { result: 1, tokens: 0 };
    const fullPrompt = prompt.replace("{MSG}", userMessage.substring(0, 300));
    const res = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
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
    console.log(`[Router] 分类结果=${result}，tokens=${tokens}，原始回复=${raw}`);
    return { result, tokens };
  } catch (e) {
    console.error("[Router] 分类失败:", e);
    return { result: 1, tokens: 0 };
  }
}

// -----------------------------------------------------------
// 工具函数：向 DeepSeek API 发送消息并获取回复
// -----------------------------------------------------------
interface DeepSeekReply { content: string; promptTokens: number; completionTokens: number; totalTokens: number; }
async function sendToDeepSeekAndGetReply(userMessage: string, model: string = "deepseek-chat", systemPrompt?: string): Promise<DeepSeekReply> {
  const errReply = (msg: string): DeepSeekReply => ({ content: msg, promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  try {
    if (!DEEPSEEK_API_KEY) {
      return errReply("DeepSeek API Key 未配置，请联系管理员。");
    }
    console.log(`[DeepSeek] 发送消息 model=${model}: ${userMessage.substring(0, 50)}`);
    const messages: Array<{role: string; content: string}> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userMessage });
    const res = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 4096,
        stream: false,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[DeepSeek] API 错误 ${res.status}:`, errText);
      return errReply(`DeepSeek 服务暂时不可用（${res.status}），请稍后重试。`);
    }
    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content || "";
    if (!content) {
      console.error("[DeepSeek] 返回内容为空:", JSON.stringify(data).substring(0, 300));
      return errReply("DeepSeek 未返回有效内容，请稍后重试。");
    }
    const usage = data?.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || 0;
    console.log(`[DeepSeek] 回复成功，长度=${content.length}，tokens=${totalTokens}`);
    return { content, promptTokens, completionTokens, totalTokens };
  } catch (e) {
    console.error("[DeepSeek] 通信异常:", e);
    return errReply("与 DeepSeek 通信时发生错误，请稍后重试。");
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
      }
      return;
    }

    // 只处理文字消息
    if (innerMsgType !== "text" || !content || !userId) {
      return;
    }

    // 获取用户当前模型偏好
    let userModelProfile = await getUserModel(userId);

    // ===== AI 智能路由：如开启，自动分类派发 =====
    const startTime = Date.now();
    let classifierResult = 0;
    let classifierTokens = 0;
    const routeConfig = await getRouteConfig();
    // 当用户已选择 auto_route，或全局路由开关开启时，触发智能分类
    const shouldRoute = userModelProfile === "auto_route" || (routeConfig.enabled && routeConfig.classifierPrompt);
    if (shouldRoute && routeConfig.classifierPrompt) {
      const cls = await classifyMessage(content, routeConfig.classifierPrompt);
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
      const dsReply = await sendToDeepSeekAndGetReply(content, userModelProfile, globalSystemPrompt || undefined);
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
          await (dbConn as any).execute(
            `INSERT INTO wecom_message_credits
             (wecom_user_id, manus_task_id, user_message, credits_before, credits_after, credits_used, model_used, reply_preview)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, "deepseek", content.substring(0, 200), prevTotalTokens, newTotalTokens, dsReply.totalTokens, userModelProfile, dsReply.content.substring(0, 100)]
          );
          // 发送 token 统计消息
          if (dsReply.totalTokens > 0) {
            await sendWeComMessage(userId, `─────────────\n本次消耗：${dsReply.totalTokens} tokens\n累计消耗：${newTotalTokens} tokens`);
          }
          // 写入路由日志
          if (classifierResult > 0) {
            try {
              await (dbConn as any).execute(
                "INSERT INTO wecom_route_log (wecom_user_id, user_message, classifier_result, routed_to, tokens_classify, tokens_reply, latency_ms) VALUES (?,?,?,?,?,?,?)",
                [userId, content.substring(0, 200), classifierResult, userModelProfile, classifierTokens, dsReply.totalTokens, Date.now() - startTime]
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
      let finalContent = content;
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
          finalContent = `[系统指令：${combinedPrompt}]\n\n${content}`;
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

      const reply = await sendToManusAndGetReply(taskId, finalContent, userModelProfile);

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
             (wecom_user_id, manus_task_id, user_message, credits_before, credits_after, credits_used, model_used, reply_preview)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, taskId, content.substring(0, 200), creditsBefore, creditsAfter, creditsUsed, userModelProfile, replyPreview]
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
// 管理API：使用统计（调用 Manus usage.list，按 task_id 聚合）
// -----------------------------------------------------------
router.get("/api/wecom/stats", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });

    // 查询所有绑定用户（包含 active 和 archived），按 created_at 升序排列以便取最早时间
    const [sessionRows] = await (conn as any).execute(
      "SELECT wecom_user_id, manus_task_id, nickname, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at FROM wecom_manus_sessions ORDER BY created_at ASC"
    ) as any;
    const sessions = sessionRows as any[];

    if (sessions.length === 0) {
      return res.json({ ok: true, stats: [], total_cost: 0 });
    }

    // 拉取积分记录（多拉以确保覆盖所有用户）
    const usageRes = await fetch(`${MANUS_API_BASE}/usage.list?limit=200`, {
      headers: { "x-manus-api-key": MANUS_API_KEY },
    });
    const usageData = await usageRes.json() as any;

    if (!usageData.ok || !usageData.data) {
      return res.status(500).json({ error: "获取使用记录失败" });
    }

    const allRecords = usageData.data as any[];

    // 按 task_id 聚合
    const taskCostMap: Record<string, { total_cost: number; record_count: number }> = {};
    for (const r of allRecords) {
      if (!r.task_id) continue;
      if (!taskCostMap[r.task_id]) taskCostMap[r.task_id] = { total_cost: 0, record_count: 0 };
      if (r.type === "cost") {
        taskCostMap[r.task_id].total_cost += Math.abs(r.credits || 0);
        taskCostMap[r.task_id].record_count += 1;
      }
    }

    // 按 wecom_user_id 汇总所有任务的积分
    const userStatsMap: Record<string, any> = {};
    for (const s of sessions) {
      const uid = s.wecom_user_id;
      // 将 created_at 转为字符串（mysql2可能返回 Date 对象）
      const createdAtStr = s.created_at
        ? (s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at))
        : "";
      if (!userStatsMap[uid]) {
        userStatsMap[uid] = {
          wecom_user_id: uid,
          nickname: s.nickname || uid,
          total_cost: 0,
          record_count: 0,
          task_count: 0,
          first_bound_at: createdAtStr,  // 最早绑定时间（SQL已升序，第一条即最早）
        };
      }
      const cost = taskCostMap[s.manus_task_id]?.total_cost || 0;
      const count = taskCostMap[s.manus_task_id]?.record_count || 0;
      userStatsMap[uid].total_cost += cost;
      userStatsMap[uid].record_count += count;
      if (cost > 0 || count > 0) {
        userStatsMap[uid].task_count += 1;
      }
    }

    const stats = Object.values(userStatsMap)
      .filter(s => s.total_cost > 0)
      .sort((a: any, b: any) => b.total_cost - a.total_cost);

    const total_cost = stats.reduce((sum: number, s: any) => sum + s.total_cost, 0);

    const usdt_cny_rate = getUsdtCnyRate();
    res.json({ ok: true, stats, total_cost, usdt_cny_rate });
  } catch (e) {
    console.error("[WeCom] 查询使用统计失败:", e);
    res.status(500).json({ error: "查询失败" });
  }
});

// -----------------------------------------------------------
// 管理API：推送菜单到企业微信
// -----------------------------------------------------------
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

    console.log("[WeCom] 菜单推送成功");
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
    res.json({ tasks, has_more: data.has_more, next_cursor: data.next_cursor });
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
    const taskIds = sessions.map((s: any) => s.manus_task_id);
    let messageRecords: any[] = [];
    let useMessageCredits = false;

    if (taskIds.length > 0) {
      try {
        const placeholders = taskIds.map(() => "?").join(",");
        const [mcRows] = await (conn as any).execute(
          `SELECT id, wecom_user_id, manus_task_id, user_message, credits_before, credits_after,
                  credits_used, model_used, reply_preview,
                  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
           FROM wecom_message_credits
           WHERE manus_task_id IN (${placeholders})
           ORDER BY created_at DESC`,
          taskIds
        ) as any;
        messageRecords = mcRows as any[];
        useMessageCredits = messageRecords.length > 0;
      } catch (_) {}
    }

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
      return {
        ...s,
        task_title: taskTitles[s.manus_task_id] || "",
        total_cost: totalCost,
        record_count: taskMsgs.length,
      };
    });

    // 构建统一格式的 records 数组返回给前端
    let userRecords: any[];
    if (useMessageCredits) {
      // 消息级记录：每条消息一行
      userRecords = messageRecords.map((r: any) => ({
        id: r.id,
        task_id: r.manus_task_id,
        user_message: r.user_message || "",
        credits: r.credits_used || 0,
        credits_before: r.credits_before || 0,
        credits_after: r.credits_after || 0,
        model: r.model_used || "",
        reply_preview: r.reply_preview || "",
        created_at: r.created_at || "",
        record_type: "message",  // 标识记录类型
      }));
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
    res.json({ ok: true, sessions: enrichedSessions, records: userRecords, usdt_cny_rate: usdtCnyRate, use_message_credits: useMessageCredits });
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

export default router;


