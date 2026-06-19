/**
 * 企业微信 + Manus API 集成路由
 *
 * GET  /api/wecom/callback  → 企业微信服务器验证（URL接入验证）
 * POST /api/wecom/callback  → 接收企业微信用户消息，转发给 Manus API，回复结果
 *
 * 配置项（环境变量）：
 *   WECOM_CORP_ID         企业ID
 *   WECOM_AGENT_ID        自建应用AgentId
 *   WECOM_SECRET          自建应用Secret
 *   WECOM_TOKEN           接收消息Token（pEhNzolV5wrJ7Xk7）
 *   WECOM_ENCODING_AES_KEY 接收消息EncodingAESKey（43位）
 *   MANUS_API_KEY         Manus API Key
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { parseStringPromise } from "xml2js";
import { getDbConnection } from "./db";

const router = Router();

// ─────────────────────────────────────────────────────────
// 配置常量
// ─────────────────────────────────────────────────────────
const WECOM_TOKEN = process.env.WECOM_TOKEN || "pEhNzolV5wrJ7Xk7";
const WECOM_ENCODING_AES_KEY = process.env.WECOM_ENCODING_AES_KEY || "myX82WWfAVfunhJyaLrqIyZozz1q7f8hVx1t4rSDKAy";
const WECOM_CORP_ID = process.env.WECOM_CORP_ID || "";
const WECOM_AGENT_ID = process.env.WECOM_AGENT_ID || "";
const WECOM_SECRET = process.env.WECOM_SECRET || "";
const MANUS_API_KEY = process.env.MANUS_API_KEY || "";
const MANUS_API_BASE = "https://api.manus.im/v2";

// ─────────────────────────────────────────────────────────
// 工具函数：SHA1 签名验证
// ─────────────────────────────────────────────────────────
function verifySignature(token: string, timestamp: string, nonce: string, signature: string): boolean {
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join("");
  const sha1 = crypto.createHash("sha1").update(str).digest("hex");
  return sha1 === signature;
}

// ─────────────────────────────────────────────────────────
// 工具函数：企业微信消息解密（AES-256-CBC）
// ─────────────────────────────────────────────────────────
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
    // 前4字节为随机字符串，接下来4字节为消息长度
    const msgLen = decrypted.readUInt32BE(16);
    const msgContent = decrypted.slice(20, 20 + msgLen).toString("utf8");
    return msgContent;
  } catch (e) {
    console.error("[WeCom] 解密失败:", e);
    return "";
  }
}

// ─────────────────────────────────────────────────────────
// 工具函数：获取企业微信 access_token
// ─────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────
// 工具函数：发送文字消息给企业微信用户
// ─────────────────────────────────────────────────────────
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
    }
  } catch (e) {
    console.error("[WeCom] 发送消息异常:", e);
  }
}

// ─────────────────────────────────────────────────────────
// 工具函数：确保数据库表存在
// ─────────────────────────────────────────────────────────
async function ensureSessionTable(): Promise<void> {
  const conn = await getDbConnection();
  if (!conn) return;
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_manus_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      wecom_user_id VARCHAR(100) NOT NULL UNIQUE COMMENT '企业微信用户ID',
      manus_task_id VARCHAR(200) NOT NULL COMMENT 'Manus任务ID',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_wecom_user_id (wecom_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业微信用户与Manus任务的会话映射'
  `);
}

// ─────────────────────────────────────────────────────────
// 工具函数：获取或创建用户的 Manus task_id
// ─────────────────────────────────────────────────────────
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
    const res = await fetch(`${MANUS_API_BASE}/task.create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MANUS_API_KEY}`,
      },
      body: JSON.stringify({
        message: {
          role: "user",
          content: "你好，我是通过企业微信连接的项目负责人。请记住我们的对话，帮助我完成网站内容的修改和迭代工作。",
        },
      }),
    });
    const data = await res.json() as any;
    if (!data.task_id) {
      console.error("[Manus] 创建任务失败:", data);
      return null;
    }

    // 保存到数据库
    await (conn as any).execute(
      "INSERT INTO wecom_manus_sessions (wecom_user_id, manus_task_id) VALUES (?, ?)",
      [wecomUserId, data.task_id]
    );
    console.log(`[Manus] 为用户 ${wecomUserId} 创建新任务: ${data.task_id}`);
    return data.task_id;
  } catch (e) {
    console.error("[Manus] 创建任务异常:", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// 工具函数：向 Manus 任务发送消息并等待回复
// ─────────────────────────────────────────────────────────
async function sendToManusAndGetReply(taskId: string, userMessage: string): Promise<string> {
  try {
    // 发送消息
    const sendRes = await fetch(`${MANUS_API_BASE}/task.sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MANUS_API_KEY}`,
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
    if (sendData.error) {
      console.error("[Manus] 发送消息失败:", sendData.error);
      return "消息发送失败，请稍后重试。";
    }

    // 轮询等待任务完成（最多等待120秒）
    const maxWait = 120;
    const pollInterval = 3;
    let waited = 0;

    while (waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));
      waited += pollInterval;

      const statusRes = await fetch(`${MANUS_API_BASE}/task.get?task_id=${taskId}`, {
        headers: { "Authorization": `Bearer ${MANUS_API_KEY}` },
      });
      const statusData = await statusRes.json() as any;

      if (statusData.status === "completed" || statusData.status === "failed") {
        // 获取最新消息
        const msgsRes = await fetch(`${MANUS_API_BASE}/task.listMessages?task_id=${taskId}&limit=5`, {
          headers: { "Authorization": `Bearer ${MANUS_API_KEY}` },
        });
        const msgsData = await msgsRes.json() as any;
        const messages = msgsData.messages || [];
        // 找最后一条 assistant 消息
        const lastAssistant = messages.reverse().find((m: any) => m.role === "assistant");
        if (lastAssistant) {
          const content = lastAssistant.content;
          if (typeof content === "string") return content;
          if (Array.isArray(content)) {
            return content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
          }
        }
        return statusData.status === "failed" ? "任务执行失败，请重新描述您的需求。" : "任务已完成，但没有文字回复。";
      }
    }

    return "Manus 正在处理中，请稍后再次发送消息查看进度。";
  } catch (e) {
    console.error("[Manus] 通信异常:", e);
    return "与 AI 助手通信时发生错误，请稍后重试。";
  }
}

// ─────────────────────────────────────────────────────────
// GET /api/wecom/callback — 企业微信服务器URL验证
// ─────────────────────────────────────────────────────────
router.get("/api/wecom/callback", (req: Request, res: Response) => {
  const { msg_signature, timestamp, nonce, echostr } = req.query as Record<string, string>;

  if (!msg_signature || !timestamp || !nonce || !echostr) {
    return res.status(400).send("参数缺失");
  }

  // 验证签名（使用加密模式时需要解密echostr）
  const arr = [WECOM_TOKEN, timestamp, nonce, echostr].sort();
  const sha1 = crypto.createHash("sha1").update(arr.join("")).digest("hex");

  if (sha1 !== msg_signature) {
    console.error("[WeCom] 签名验证失败");
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

// ─────────────────────────────────────────────────────────
// POST /api/wecom/callback — 接收企业微信用户消息
// ─────────────────────────────────────────────────────────
router.post("/api/wecom/callback", async (req: Request, res: Response) => {
  // 先返回200，避免企业微信超时重试
  res.status(200).send("success");

  try {
    await ensureSessionTable();

    const { msg_signature, timestamp, nonce } = req.query as Record<string, string>;
    const rawBody = req.body;

    let xmlContent: string;

    // 解析XML body
    if (typeof rawBody === "string") {
      xmlContent = rawBody;
    } else if (Buffer.isBuffer(rawBody)) {
      xmlContent = rawBody.toString("utf8");
    } else {
      // express.json() 可能已经解析了，尝试重新序列化
      xmlContent = JSON.stringify(rawBody);
    }

    // 解析XML
    let parsed: any;
    try {
      parsed = await parseStringPromise(xmlContent, { explicitArray: false });
    } catch (e) {
      console.error("[WeCom] XML解析失败:", e, "原始内容:", xmlContent?.substring(0, 200));
      return;
    }

    const xml = parsed?.xml;
    if (!xml) return;

    const encryptedMsg = xml.Encrypt;
    const fromUser = xml.FromUserName;
    const msgType = xml.MsgType;

    if (!encryptedMsg) {
      console.error("[WeCom] 消息中无Encrypt字段");
      return;
    }

    // 验证签名
    if (msg_signature && timestamp && nonce) {
      const arr = [WECOM_TOKEN, timestamp, nonce, encryptedMsg].sort();
      const sha1 = crypto.createHash("sha1").update(arr.join("")).digest("hex");
      if (sha1 !== msg_signature) {
        console.error("[WeCom] 消息签名验证失败");
        return;
      }
    }

    // 解密消息
    const decryptedXml = decryptWeCom(encryptedMsg);
    if (!decryptedXml) return;

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
        await sendWeComMessage(userId, "您好！我是脉动网 AI 助手，有任何关于网站修改、内容迭代的需求，直接告诉我即可。");
      }
      return;
    }

    // 发送"处理中"提示
    await sendWeComMessage(userId, "收到您的消息，AI 正在处理中，请稍候...");

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

export default router;
