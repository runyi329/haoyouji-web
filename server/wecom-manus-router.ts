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
const MANUS_API_KEY = process.env.MANUS_API_KEY || "";
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
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_wecom_user_id (wecom_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业微信用户与Manus任务的会话映射'
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
        agent_profile: "manus-1.6-max",
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
          const statusEvt = (checkData.events || []).find((e: any) => e.type === "status_update");
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
        agent_profile: "manus-1.6-max",
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

      const events = msgsData.events || [];

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

    // 只处理文字消息
    if (innerMsgType !== "text" || !content || !userId) {
      if (innerMsgType === "event" && event === "subscribe") {
        await sendWeComMessage(userId, "您好！我是脉动网 AI 助手，有任何需求直接告诉我即可。");
      }
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

    // 发送给 Manus 并获取回复
    const reply = await sendToManusAndGetReply(taskId, content);

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
// 管理API：查询所有绑定关系
// -----------------------------------------------------------
router.get("/api/wecom/sessions", async (req: Request, res: Response) => {
  try {
    await ensureSessionTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      "SELECT id, wecom_user_id, manus_task_id, nickname, created_at, updated_at FROM wecom_manus_sessions ORDER BY updated_at DESC"
    );
    res.json({ ok: true, sessions: rows });
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
    const { wecom_user_id, manus_task_id, nickname } = req.body || {};
    if (!wecom_user_id || !manus_task_id) {
      return res.status(400).json({ error: "wecom_user_id 和 manus_task_id 为必填" });
    }
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ error: "数据库连接失败" });
    await (conn as any).execute(
      `INSERT INTO wecom_manus_sessions (wecom_user_id, manus_task_id, nickname) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE manus_task_id = VALUES(manus_task_id), nickname = VALUES(nickname)`,
      [wecom_user_id, manus_task_id, nickname || ""]
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

export default router;
