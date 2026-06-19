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
// 用户模型偏好（内存缓存，重启后默认 max）
// -----------------------------------------------------------
const userModelPrefs: Record<string, string> = {};
const MODEL_PROFILES: Record<string, { profile: string; label: string }> = {
  MODEL_MAX: { profile: "manus-1.6-max", label: "Max 模式（最强能力，适合复杂任务）" },
  MODEL_NORMAL: { profile: "manus-1.6", label: "标准模式（平衡能力与速度）" },
  MODEL_LITE: { profile: "manus-1.6-lite", label: "轻量模式（快速响应，省积分）" },
};

function getUserModel(userId: string): string {
  return userModelPrefs[userId] || "manus-1.6-max";
}

function getUserModelLabel(userId: string): string {
  const profile = getUserModel(userId);
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
    case "MODEL_LITE": {
      const model = MODEL_PROFILES[eventKey];
      userModelPrefs[userId] = model.profile;
      await sendWeComMessage(userId, `已切换到: ${model.label}\n\n下次发送消息将使用新模型。`);
      break;
    }

    case "MODEL_STATUS": {
      const label = getUserModelLabel(userId);
      await sendWeComMessage(userId, `当前使用模型: ${label}`);
      break;
    }

    case "CREDITS_QUERY": {
      await sendWeComMessage(userId, "正在查询积分...");
      const result = await queryCreditsUsage(userId);
      await sendWeComMessage(userId, result);
      break;
    }

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
          await sendWeComMessage(userId, `当前任务ID: ${row.manus_task_id}\n创建时间: ${created}\n当前模型: ${getUserModelLabel(userId)}`);
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
        "  - Max: 最强能力，适合复杂任务",
        "  - 标准: 平衡能力与速度",
        "  - 轻量: 快速响应，省积分",
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
        agent_profile: getUserModel(wecomUserId),
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

    // 保存到数据库
    await (conn as any).execute(
      "INSERT INTO wecom_manus_sessions (wecom_user_id, manus_task_id) VALUES (?, ?)",
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
// 工具函数：向 Manus 任务发送消息并等待回复
// -----------------------------------------------------------
async function sendToManusAndGetReply(taskId: string, userMessage: string): Promise<string> {
  try {
    // 记录发送前的时间戳（Unix 秒），用于过滤旧消息
    const sendTimestamp = Math.floor(Date.now() / 1000);

    // 发送消息（使用 Max 模式）
    console.log(`[Manus] 向任务 ${taskId} 发送消息: ${userMessage.substring(0, 50)}`);
    const sendRes = await fetch(`${MANUS_API_BASE}/task.sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": MANUS_API_KEY,
      },
      body: JSON.stringify({
        task_id: taskId,
        message: {
          role: "user",
          content: userMessage,
        },
      }),
    });
    const sendData = await sendRes.json() as any;
    console.log("[Manus] task.sendMessage 响应:", JSON.stringify(sendData).substring(0, 300));

    if (!sendData.ok) {
      console.error("[Manus] 发送消息失败:", JSON.stringify(sendData));
      return "消息发送失败，请稍后重试。";
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
          if (newAssistantMsgs.length > 0) {
            // 取最新的一条（order=desc 所以第一条就是最新）
            const content = newAssistantMsgs[0].assistant_message?.content;
            if (typeof content === "string") return content;
            if (Array.isArray(content)) {
              return content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
            }
          }
          // 如果没有新消息，尝试不过滤时间再找一次（容错）
          const anyAssistantMsg = events.find((e: any) => e.type === "assistant_message");
          if (anyAssistantMsg) {
            const content = anyAssistantMsg.assistant_message?.content;
            if (typeof content === "string") return content;
            if (Array.isArray(content)) {
              return content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
            }
          }
          return agentStatus === "error" ? "任务执行失败，请重新描述您的需求。" : "任务已完成，但没有文字回复。";
        }

        if (agentStatus === "waiting") {
          const detail = latestStatus.status_update?.status_detail;
          if (detail?.waiting_for_event_type === "messageAskUser") {
            // Manus 在问用户问题，把问题转发给企业微信用户
            const askMsg = events.find((e: any) => e.type === "assistant_message");
            if (askMsg) {
              const askContent = askMsg.assistant_message?.content;
              if (typeof askContent === "string") return askContent;
              if (Array.isArray(askContent)) {
                return askContent.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
              }
            }
            return "AI 助手需要更多信息，请补充说明。";
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

    return "Manus 正在处理中，处理时间较长。请稍后再发送消息查看进度。";
  } catch (e) {
    console.error("[Manus] 通信异常:", e);
    return "与 AI 助手通信时发生错误，请稍后重试。";
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

    // 发送"处理中"提示
    await sendWeComMessage(userId, "收到，AI 正在处理中，请稍候...");

    // 获取或创建 Manus 任务
    const taskId = await getOrCreateManusTask(userId);
    if (!taskId) {
      await sendWeComMessage(userId, "系统初始化失败，请联系管理员。");
      return;
    }

    // 从数据库读取 system_prompt，注入到消息前面
    let finalContent = content;
    try {
      const conn = await getDbConnection();
      if (conn) {
        const [rows] = await (conn as any).execute(
          "SELECT system_prompt FROM wecom_manus_sessions WHERE wecom_user_id = ? LIMIT 1",
          [userId]
        ) as any;
        const systemPrompt = (rows as any[])[0]?.system_prompt;
        if (systemPrompt) {
          finalContent = `[系统指令：${systemPrompt}]\n\n${content}`;
        }
      }
    } catch (_) {}

    // 发送给 Manus 并获取回复
    const reply = await sendToManusAndGetReply(taskId, finalContent);

    // 回复给用户（超过2048字符分段发送）
    if (reply.length <= 2048) {
      await sendWeComMessage(userId, reply);
    } else {
      const chunks = reply.match(/.{1,2000}/gs) || [reply];
      for (const chunk of chunks) {
        await sendWeComMessage(userId, chunk);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

  } catch (e) {
    console.error("[WeCom] 处理消息异常:", e);
  }
});

// -----------------------------------------------------------
// 管理API：查询所有绑定关系（并发拉取 Manus 任务标题）
// -----------------------------------------------------------
router.get("/api/wecom/sessions", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      "SELECT id, wecom_user_id, manus_task_id, nickname, model_pref, system_prompt, enabled, created_at, updated_at FROM wecom_manus_sessions ORDER BY updated_at DESC"
    ) as any;
    const sessions = rows as any[];

    // 并发拉取每个 task 的 Manus 标题
    const withTitles = await Promise.all(
      sessions.map(async (s: any) => {
        try {
          const r = await fetch(
            `${MANUS_API_BASE}/task.detail?task_id=${s.manus_task_id}`,
            { headers: { "x-manus-api-key": MANUS_API_KEY } }
          );
          const d = await r.json() as any;
          return { ...s, task_title: d.ok ? (d.task?.title || "") : "" };
        } catch {
          return { ...s, task_title: "" };
        }
      })
    );

    res.json({ ok: true, sessions: withTitles });
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
    await (conn as any).execute(
      `INSERT INTO wecom_manus_sessions (wecom_user_id, manus_task_id, nickname, model_pref, system_prompt, enabled) 
       VALUES (?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE manus_task_id = VALUES(manus_task_id), nickname = VALUES(nickname), model_pref = VALUES(model_pref), system_prompt = VALUES(system_prompt), enabled = VALUES(enabled)`,
      [wecom_user_id, manus_task_id, nickname || "", model_pref || "manus-1.6-max", system_prompt || null, enabled !== undefined ? enabled : 1]
    );
    res.json({ ok: true, message: "绑定成功" });
  } catch (e) {
    console.error("[WeCom] 绑定失败:", e);
    res.status(500).json({ error: "绑定失败" });
  }
});

// -----------------------------------------------------------
// 管理API：删除绑定
// -----------------------------------------------------------
router.delete("/api/wecom/sessions/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    await (conn as any).execute("DELETE FROM wecom_manus_sessions WHERE id = ?", [id]);
    res.json({ ok: true, message: "删除成功" });
  } catch (e) {
    console.error("[WeCom] 删除失败:", e);
    res.status(500).json({ error: "删除失败" });
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

    // 查询所有绑定用户
    const [sessionRows] = await (conn as any).execute(
      "SELECT wecom_user_id, manus_task_id, nickname FROM wecom_manus_sessions"
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

    // 关联用户信息
    const stats = sessions
      .map((s: any) => ({
        task_id: s.manus_task_id,
        wecom_user_id: s.wecom_user_id,
        nickname: s.nickname || s.wecom_user_id,
        total_cost: taskCostMap[s.manus_task_id]?.total_cost || 0,
        record_count: taskCostMap[s.manus_task_id]?.record_count || 0,
      }))
      .sort((a: any, b: any) => b.total_cost - a.total_cost);

    const total_cost = stats.reduce((sum: number, s: any) => sum + s.total_cost, 0);

    res.json({ ok: true, stats, total_cost });
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

export default router;
