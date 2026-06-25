/**
 * 企业微信管理后台路由
 * 职责：用户绑定管理（以企微用户为主体，展示绑定状态）
 * 路径前缀：/api/admin/wecom
 * 权限：仅超级管理员（通过 session cookie 验证）
 */

import { Router, Request, Response } from "express";
import { getDbConnection } from "./db";
import { sdk } from "./_core/sdk";
import { getLatestPrice } from "./price-scanner";

const router = Router();

// ─── 鉴权中间件：仅超级管理员可访问 ─────────────────────────────────────────
async function requireSuperAdmin(req: Request, res: Response, next: Function) {
  try {
    // 使用与其他接口一致的认证方式：Authorization: Bearer <auth-token>
    const user = await sdk.authenticateRequest(req);
    if (!user || (user as any).role !== "super_admin") {
      return res.status(403).json({ ok: false, error: "权限不足，仅超级管理员可操作" });
    }
    (req as any).adminUser = user;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "未登录或登录已过期" });
  }
}

// ─── 确保数据库表存在并执行迁移 ──────────────────────────────────────────────
let _tableEnsured = false;
async function ensureBindingTable() {
  if (_tableEnsured) return;
  const conn = await getDbConnection();
  if (!conn) return;

  // 确保 wecom_account_binding 表存在
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

  // 迁移：补充 provider 字段（MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，需先检查）
  try {
    const [providerCols] = await (conn as any).execute(
      `SHOW COLUMNS FROM wecom_account_binding LIKE 'provider'`
    ) as any;
    if ((providerCols as any[]).length === 0) {
      await (conn as any).execute(
        `ALTER TABLE wecom_account_binding
         ADD COLUMN provider VARCHAR(32) NOT NULL DEFAULT 'wecom'
         COMMENT '认证来源: wecom/wechat_mp' AFTER id`
      );
    }
  } catch (_) {}

  // 迁移：补充 bind_note 字段
  try {
    const [noteCols] = await (conn as any).execute(
      `SHOW COLUMNS FROM wecom_account_binding LIKE 'bind_note'`
    ) as any;
    if ((noteCols as any[]).length === 0) {
      await (conn as any).execute(
        `ALTER TABLE wecom_account_binding
         ADD COLUMN bind_note VARCHAR(200) DEFAULT NULL
         COMMENT '管理员备注' AFTER bound_by`
      );
    }
  } catch (_) {}

  _tableEnsured = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/wecom/users
// 以企微用户为主体，返回所有企微用户及其绑定状态（脉动网账号 + Manus）
// ─────────────────────────────────────────────────────────────────────────────
router.get("/api/admin/wecom/users", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureBindingTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const keyword = (req.query.keyword as string || "").trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize as string) || 20));
    const offset = (page - 1) * pageSize;

    let whereClause = "";
    const params: any[] = [];
    if (keyword) {
      whereClause = `WHERE (
        s.wecom_user_id LIKE ? OR
        s.nickname LIKE ? OR
        b.site_username LIKE ? OR
        u.name LIKE ? OR
        u.phone LIKE ?
      )`;
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw, kw);
    }

    // 查询总数
    const [countRows] = await (conn as any).execute(
      `SELECT COUNT(*) as total
       FROM wecom_manus_sessions s
       LEFT JOIN wecom_account_binding b ON b.wecom_user_id = s.wecom_user_id
       LEFT JOIN users u ON u.id = b.site_user_id
       ${whereClause}`,
      params
    ) as any;
    const total = (countRows as any[])[0]?.total || 0;

    // 查询列表
    const [rows] = await (conn as any).execute(
      `SELECT
         s.wecom_user_id,
         s.nickname,
         s.manus_task_id,
         s.model_pref,
         s.enabled        AS wecom_enabled,
         s.status         AS wecom_status,
         s.created_at     AS first_seen_at,
         s.updated_at     AS last_active_at,
         b.id             AS binding_id,
         b.site_username,
         b.site_user_id,
         b.bind_note,
         b.bound_by,
         b.created_at     AS bound_at,
         u.name           AS user_real_name,
         u.phone          AS user_phone,
         u.role           AS user_role,
         (COALESCE(u.balance, 0) + COALESCE((SELECT SUM(amount) FROM af_manual_balances WHERE user_id = u.id), 0)) AS user_balance_usdt,
         (SELECT COUNT(*) FROM wecom_route_log rl WHERE rl.wecom_user_id = s.wecom_user_id) AS msg_count
       FROM wecom_manus_sessions s
       LEFT JOIN wecom_account_binding b ON b.wecom_user_id = s.wecom_user_id
       LEFT JOIN users u ON u.id = b.site_user_id
       ${whereClause}
       ORDER BY s.updated_at DESC
       LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`,
      params
    ) as any;

    res.json({
      ok: true,
      data: rows as any[],
      total,
      page,
      pageSize,
    });
  } catch (e) {
    console.error("[wecom-admin] 查询用户列表失败:", e);
    res.status(500).json({ ok: false, error: "查询失败: " + (e as any)?.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/wecom/search-site-user
// 搜索脉动网用户（用于绑定时的下拉选择）
// ─────────────────────────────────────────────────────────────────────────────
router.get("/api/admin/wecom/search-site-user", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    const keyword = (req.query.keyword as string || "").trim();
    if (!keyword) return res.json({ ok: true, data: [] });
    const kw = `%${keyword}%`;
    const [rows] = await (conn as any).execute(
      `SELECT id, username, name, phone, role, balance
       FROM users
       WHERE username LIKE ? OR name LIKE ? OR phone LIKE ?
       ORDER BY id DESC LIMIT 20`,
      [kw, kw, kw]
    ) as any;
    res.json({ ok: true, data: rows as any[] });
  } catch (e) {
    res.status(500).json({ ok: false, error: "搜索失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/wecom/bindings
// 绑定企微用户到脉动网账号
// ─────────────────────────────────────────────────────────────────────────────
router.post("/api/admin/wecom/bindings", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureBindingTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const { wecom_user_id, site_username, bind_note } = req.body;
    if (!wecom_user_id || !site_username) {
      return res.status(400).json({ ok: false, error: "企微用户ID和网站用户名不能为空" });
    }

    // 查找脉动网用户
    const [userRows] = await (conn as any).execute(
      `SELECT id, username, name, phone, balance FROM users WHERE username = ? LIMIT 1`,
      [site_username]
    ) as any;
    const siteUser = (userRows as any[])[0];
    if (!siteUser) {
      return res.status(404).json({ ok: false, error: `未找到用户名为「${site_username}」的脉动网用户` });
    }

    const adminUser = (req as any).adminUser;

    // 检查是否已有绑定，有则更新，无则插入
    const [existRows] = await (conn as any).execute(
      `SELECT id FROM wecom_account_binding WHERE wecom_user_id = ? LIMIT 1`,
      [wecom_user_id]
    ) as any;

    if ((existRows as any[]).length > 0) {
      await (conn as any).execute(
        `UPDATE wecom_account_binding
         SET site_username = ?, site_user_id = ?, bound_by = ?, bind_note = ?, updated_at = NOW()
         WHERE wecom_user_id = ?`,
        [site_username, siteUser.id, adminUser.username, bind_note || null, wecom_user_id]
      );
    } else {
      await (conn as any).execute(
        `INSERT INTO wecom_account_binding (wecom_user_id, site_username, site_user_id, bound_by, bind_note)
         VALUES (?, ?, ?, ?, ?)`,
        [wecom_user_id, site_username, siteUser.id, adminUser.username, bind_note || null]
      );
    }

    res.json({ ok: true, message: "绑定成功" });
  } catch (e) {
    console.error("[wecom-admin] 绑定失败:", e);
    res.status(500).json({ ok: false, error: "绑定失败: " + (e as any)?.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/wecom/bindings/:wecomUserId
// 解除绑定
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/api/admin/wecom/bindings/:wecomUserId", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    const { wecomUserId } = req.params;
    await (conn as any).execute(
      `DELETE FROM wecom_account_binding WHERE wecom_user_id = ?`,
      [wecomUserId]
    );
    res.json({ ok: true, message: "已解除绑定" });
  } catch (e) {
    res.status(500).json({ ok: false, error: "解绑失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/wecom/bindings/:wecomUserId/note
// 更新备注
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/api/admin/wecom/bindings/:wecomUserId/note", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    const { wecomUserId } = req.params;
    const { bind_note } = req.body;
    await (conn as any).execute(
      `UPDATE wecom_account_binding SET bind_note = ?, updated_at = NOW() WHERE wecom_user_id = ?`,
      [bind_note || null, wecomUserId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "更新备注失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/wecom/binding-stats
// 统计概览
// ─────────────────────────────────────────────────────────────────────────────
router.get("/api/admin/wecom/binding-stats", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureBindingTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const [r1] = await (conn as any).execute(`SELECT COUNT(*) AS total FROM wecom_manus_sessions`) as any;
    const [r2] = await (conn as any).execute(`SELECT COUNT(*) AS total FROM wecom_account_binding`) as any;
    const [r3] = await (conn as any).execute(
      `SELECT COUNT(*) AS total FROM wecom_manus_sessions WHERE DATE(updated_at) = CURDATE()`
    ) as any;

    res.json({
      ok: true,
      data: {
        total_wecom_users: (r1 as any[])[0]?.total || 0,
        total_bound: (r2 as any[])[0]?.total || 0,
        today_active: (r3 as any[])[0]?.total || 0,
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: "统计失败" });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// 通知平台：企业微信推送配置 & 通知开关
// ─────────────────────────────────────────────────────────────────────────────

let _notifyTableEnsured = false;
async function ensureNotifyTable() {
  if (_notifyTableEnsured) return;
  const conn = await getDbConnection();
  if (!conn) return;
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_notify_config (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      cfg_key    VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键',
      cfg_value  TEXT         COMMENT '配置值（JSON 或字符串）',
      updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业微信通知平台配置'
  `);
  _notifyTableEnsured = true;
}


// GET /api/admin/wecom/notify-members  获取企业微信成员列表（用于下拉框）
router.get("/api/admin/wecom/notify-members", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    // 先从数据库读取 corpid/corpsecret，如果没有就用环境变量默认值
    await ensureNotifyTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      `SELECT cfg_key, cfg_value FROM wecom_notify_config WHERE cfg_key IN ('corpid','corpsecret')`
    ) as any;
    const cfg: Record<string, string> = {};
    for (const row of rows as any[]) { cfg[row.cfg_key] = row.cfg_value; }
    const corpid = cfg.corpid || "wwbbaccf1da5f886d9";
    const corpsecret = cfg.corpsecret || "3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g";

    // 获取 access_token
    const tokenResp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpid}&corpsecret=${corpsecret}`
    );
    const tokenData: any = await tokenResp.json();
    if (tokenData.errcode !== 0) {
      return res.status(400).json({ ok: false, error: `获取 token 失败：${tokenData.errmsg}` });
    }
    const accessToken = tokenData.access_token;

    // 获取部门列表
    const deptResp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=${accessToken}`
    );
    const deptData: any = await deptResp.json();
    const deptIds: number[] = (deptData.department || []).map((d: any) => d.id);
    if (deptIds.length === 0) deptIds.push(1);

    // 获取所有成员（去重）
    const memberMap: Record<string, { userid: string; name: string; avatar?: string }> = {};
    for (const deptId of deptIds.slice(0, 5)) { // 最多查5个部门避免超时
      const userResp = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token=${accessToken}&department_id=${deptId}&fetch_child=0`
      );
      const userData: any = await userResp.json();
      for (const u of (userData.userlist || [])) {
        memberMap[u.userid] = { userid: u.userid, name: u.name, avatar: u.avatar };
      }
    }
    const members = Object.values(memberMap);
    return res.json({ ok: true, members });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/admin/wecom/notify-config
router.get("/api/admin/wecom/notify-config", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureNotifyTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      `SELECT cfg_key, cfg_value FROM wecom_notify_config`
    ) as any;
    const config: Record<string, any> = {};
    for (const row of rows as any[]) {
      try { config[row.cfg_key] = JSON.parse(row.cfg_value); } catch { config[row.cfg_key] = row.cfg_value; }
    }
    // 预填默认值（如果数据库里没有）
    if (!config.corpid) config.corpid = "wwbbaccf1da5f886d9";
    if (!config.corpsecret) config.corpsecret = "3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g";
    if (!config.agentid) config.agentid = "1000002";
    return res.json({ ok: true, config });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/wecom/notify-config
router.post("/api/admin/wecom/notify-config", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureNotifyTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    const updates: Record<string, any> = req.body || {};
    for (const [key, value] of Object.entries(updates)) {
      const strVal = typeof value === "string" ? value : JSON.stringify(value);
      await (conn as any).execute(
        `INSERT INTO wecom_notify_config (cfg_key, cfg_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE cfg_value = VALUES(cfg_value)`,
        [key, strVal]
      );
    }
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/wecom/notify-test
router.post("/api/admin/wecom/notify-test", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureNotifyTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      `SELECT cfg_key, cfg_value FROM wecom_notify_config WHERE cfg_key IN ('corpid','corpsecret','agentid','test_touser')`
    ) as any;
    const cfg: Record<string, string> = {};
    for (const row of rows as any[]) { cfg[row.cfg_key] = row.cfg_value; }
    const { corpid, corpsecret, agentid, test_touser } = cfg;
    if (!corpid || !corpsecret || !agentid) {
      return res.status(400).json({ ok: false, error: "请先填写 corpid、corpsecret、agentid" });
    }
    const touser = req.body?.touser || test_touser || "@all";
    const msgtype: string = req.body?.msgtype || "text";
    const content: string = req.body?.content || `【好友记通知平台】测试消息发送成功\n时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`;
    const cardTitle: string = req.body?.card_title || "好友记通知";
    const cardUrl: string = req.body?.card_url || "https://haoyouji.com";
    const tokenResp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpid}&corpsecret=${corpsecret}`
    );
    const tokenData: any = await tokenResp.json();
    if (tokenData.errcode !== 0) {
      return res.status(400).json({ ok: false, error: `获取 access_token 失败：${tokenData.errmsg}` });
    }
    const accessToken = tokenData.access_token;
    let msgBody: Record<string, any>;
    if (msgtype === "markdown") {
      msgBody = { touser, msgtype: "markdown", agentid: parseInt(agentid), markdown: { content }, safe: 0 };
    } else if (msgtype === "textcard") {
      msgBody = { touser, msgtype: "textcard", agentid: parseInt(agentid), textcard: { title: cardTitle, description: content, url: cardUrl, btntxt: "查看详情" }, safe: 0 };
    } else {
      msgBody = { touser, msgtype: "text", agentid: parseInt(agentid), text: { content }, safe: 0 };
    }
    const msgResp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msgBody) }
    );
    const msgData: any = await msgResp.json();
    if (msgData.errcode !== 0) {
      return res.status(400).json({ ok: false, error: `发送失败：${msgData.errmsg}（errcode: ${msgData.errcode}）` });
    }
    return res.json({ ok: true, msg: "测试消息发送成功" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});



// ─────────────────────────────────────────────────────────────────────────────
// 用户维度通知配置：以企微 userid 为主体，每人每个通知项独立配置
// 表：wecom_user_notify_config (userid, notify_key, enabled, msgtype, content, card_title, card_url, threshold, advance_days)
// ─────────────────────────────────────────────────────────────────────────────

let _userNotifyTableEnsured = false;
async function ensureUserNotifyTable() {
  if (_userNotifyTableEnsured) return;
  const conn = await getDbConnection();
  if (!conn) return;
  // 创建表（支持多条记录，去掉 UNIQUE KEY）
  await (conn as any).execute(`
    CREATE TABLE IF NOT EXISTS wecom_user_notify_config (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      userid       VARCHAR(100) NOT NULL COMMENT '企微用户ID',
      notify_key   VARCHAR(100) NOT NULL COMMENT '通知项key',
      label        VARCHAR(200) COMMENT '记录备注名称',
      enabled      TINYINT(1)   NOT NULL DEFAULT 1,
      msgtype      VARCHAR(20)  NOT NULL DEFAULT 'text' COMMENT 'text/markdown/textcard',
      content      TEXT         COMMENT '消息内容模板',
      card_title   VARCHAR(200) COMMENT '卡片标题',
      card_url     VARCHAR(500) COMMENT '卡片跳转链接',
      threshold    VARCHAR(50)  COMMENT '阈值（担保缺口/跌幅）',
      advance_days VARCHAR(10)  COMMENT '提前天数（结息提醒）',
      order_scope  TEXT         COMMENT '监控订单范围：all 或 JSON 数组存储订单ID列表',
      monitor_user_id INT       COMMENT '监控的脉动网用户ID',
      monitor_user_name VARCHAR(100) COMMENT '监控的脉动网用户名',
      alert_mode   VARCHAR(50)  NOT NULL DEFAULT 'new_low_24h' COMMENT '发送频率模式',
      last_alerted_pct DECIMAL(10,4) DEFAULT NULL COMMENT '上次已预警的百分比（新底模式用）',
      last_alerted_at  DATETIME     DEFAULT NULL COMMENT '上次发送预警的时间',
      created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_notify (userid, notify_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企微用户通知配置（用户维度，支持多条）'
  `);
  // 如果旧表有 UNIQUE KEY，尝试删除（ALTER TABLE 忽略错误）
  try { await (conn as any).execute(`ALTER TABLE wecom_user_notify_config DROP INDEX uk_user_notify`); } catch {}
  // 如果旧表没有 label 字段，补上
  try { await (conn as any).execute(`ALTER TABLE wecom_user_notify_config ADD COLUMN label VARCHAR(200) COMMENT '记录备注名称' AFTER notify_key`); } catch {}
  try { await (conn as any).execute(`ALTER TABLE wecom_user_notify_config ADD COLUMN monitor_user_id INT COMMENT '监控的脉动网用户ID' AFTER order_scope`); } catch {}
  try { await (conn as any).execute(`ALTER TABLE wecom_user_notify_config ADD COLUMN monitor_user_name VARCHAR(100) COMMENT '监控的脉动网用户名' AFTER monitor_user_id`); } catch {}
  try { await (conn as any).execute(`ALTER TABLE wecom_user_notify_config ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER monitor_user_name`); } catch {}
  try { await (conn as any).execute(`ALTER TABLE wecom_user_notify_config ADD COLUMN alert_mode VARCHAR(50) NOT NULL DEFAULT 'new_low_24h' COMMENT '发送频率模式' AFTER created_at`); } catch {}
  try { await (conn as any).execute(`ALTER TABLE wecom_user_notify_config ADD COLUMN last_alerted_pct DECIMAL(10,4) DEFAULT NULL COMMENT '上次已预警的百分比' AFTER alert_mode`); } catch {}
  try { await (conn as any).execute(`ALTER TABLE wecom_user_notify_config ADD COLUMN last_alerted_at DATETIME DEFAULT NULL COMMENT '上次发送预警的时间' AFTER last_alerted_pct`); } catch {}
  try { await (conn as any).execute(`ALTER TABLE wecom_user_notify_config ADD COLUMN last_scan_ratio DECIMAL(10,4) DEFAULT NULL COMMENT '上次扫描的保证金比例'`); } catch {}
  try { await (conn as any).execute(`ALTER TABLE wecom_user_notify_config ADD COLUMN next_scan_at DATETIME DEFAULT NULL COMMENT '下次扫描时间（自适应调度）'`); } catch {}
  _userNotifyTableEnsured = true;
}

// GET /api/admin/wecom/user-notify-config?userid=xxx
// 获取某用户的所有通知项配置（返回数组，支持多条）
router.get("/api/admin/wecom/user-notify-config", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureUserNotifyTable();
    const userid = (req.query.userid as string || "").trim();
    if (!userid) return res.status(400).json({ ok: false, error: "userid 不能为空" });
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      `SELECT id, notify_key, label, enabled, msgtype, content, card_title, card_url, threshold, advance_days, order_scope, monitor_user_id, monitor_user_name, alert_mode, last_alerted_pct, last_alerted_at, created_at FROM wecom_user_notify_config WHERE userid = ? ORDER BY notify_key, created_at ASC`,
      [userid]
    ) as any;
    // 按 notify_key 分组，每组是一个数组
    const records: Record<string, any[]> = {};
    for (const row of rows as any[]) {
      if (!records[row.notify_key]) records[row.notify_key] = [];
      records[row.notify_key].push({
        id: row.id,
        notify_key: row.notify_key,
        label: row.label || "",
        enabled: !!row.enabled,
        msgtype: row.msgtype || "text",
        content: row.content || "",
        card_title: row.card_title || "",
        card_url: row.card_url || "",
        threshold: row.threshold || "",
        advance_days: row.advance_days || "",
        order_scope: row.order_scope || "all",
        monitor_user_id: row.monitor_user_id || null,
        monitor_user_name: row.monitor_user_name || "",
        alert_mode: row.alert_mode || "new_low_24h",
        last_alerted_pct: row.last_alerted_pct != null ? Number(row.last_alerted_pct) : null,
        last_alerted_at: row.last_alerted_at || null,
        created_at: row.created_at,
      });
    }
    return res.json({ ok: true, records });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/wecom/user-notify-config
// 新增一条通知配置记录
router.post("/api/admin/wecom/user-notify-config", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureUserNotifyTable();
    const { userid, notify_key, label, enabled, msgtype, content, card_title, card_url, threshold, advance_days, order_scope, monitor_user_id, monitor_user_name, alert_mode } = req.body || {};
    if (!userid || !notify_key) return res.status(400).json({ ok: false, error: "userid 和 notify_key 不能为空" });
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    const [result] = await (conn as any).execute(
      `INSERT INTO wecom_user_notify_config (userid, notify_key, label, enabled, msgtype, content, card_title, card_url, threshold, advance_days, order_scope, monitor_user_id, monitor_user_name, alert_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userid, notify_key, label || "", enabled !== false ? 1 : 0, msgtype || "text", content || "", card_title || "", card_url || "", threshold || "", advance_days || "", order_scope || "all", monitor_user_id || null, monitor_user_name || "", alert_mode || "new_low_24h"]
    ) as any;
    return res.json({ ok: true, id: result.insertId });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT /api/admin/wecom/user-notify-config/:id
// 更新某条通知配置记录
router.put("/api/admin/wecom/user-notify-config/:id", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureUserNotifyTable();
    const id = Number(req.params.id);
    const { label, enabled, msgtype, content, card_title, card_url, threshold, advance_days, order_scope, monitor_user_id, monitor_user_name, alert_mode } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: "id 不能为空" });
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    await (conn as any).execute(
      `UPDATE wecom_user_notify_config SET label=?, enabled=?, msgtype=?, content=?, card_title=?, card_url=?, threshold=?, advance_days=?, order_scope=?, monitor_user_id=?, monitor_user_name=?, alert_mode=? WHERE id=?`,
      [label || "", enabled !== false ? 1 : 0, msgtype || "text", content || "", card_title || "", card_url || "", threshold || "", advance_days || "", order_scope || "all", monitor_user_id || null, monitor_user_name || "", alert_mode || "new_low_24h", id]
    );
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /api/admin/wecom/user-notify-config/:id
// 删除某条通知配置记录
router.delete("/api/admin/wecom/user-notify-config/:id", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "id 不能为空" });
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    await (conn as any).execute(`DELETE FROM wecom_user_notify_config WHERE id = ?`, [id]);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/wecom/user-notify-test
// 对某用户某通知项发送测试消息
router.post("/api/admin/wecom/user-notify-test", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureNotifyTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    // 读取基础配置
    const [cfgRows] = await (conn as any).execute(
      `SELECT cfg_key, cfg_value FROM wecom_notify_config WHERE cfg_key IN ('corpid','corpsecret','agentid')`
    ) as any;
    const cfg: Record<string, string> = {};
    for (const row of cfgRows as any[]) { cfg[row.cfg_key] = row.cfg_value; }
    const corpid = cfg.corpid || "wwbbaccf1da5f886d9";
    const corpsecret = cfg.corpsecret || "3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g";
    const agentid = cfg.agentid || "1000002";
    const { userid, msgtype, content, card_title, card_url } = req.body || {};
    if (!userid) return res.status(400).json({ ok: false, error: "userid 不能为空" });
    const tokenResp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpid}&corpsecret=${corpsecret}`);
    const tokenData: any = await tokenResp.json();
    if (tokenData.errcode !== 0) return res.status(400).json({ ok: false, error: `获取 token 失败：${tokenData.errmsg}` });
    const accessToken = tokenData.access_token;
    const msgContent = content || `【好友记通知平台】测试消息\n时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`;
    let msgBody: Record<string, any>;
    if (msgtype === "markdown") {
      msgBody = { touser: userid, msgtype: "markdown", agentid: parseInt(agentid), markdown: { content: msgContent }, safe: 0 };
    } else if (msgtype === "textcard") {
      msgBody = { touser: userid, msgtype: "textcard", agentid: parseInt(agentid), textcard: { title: card_title || "好友记通知", description: msgContent, url: card_url || "https://haoyouji.com", btntxt: "查看详情" }, safe: 0 };
    } else {
      msgBody = { touser: userid, msgtype: "text", agentid: parseInt(agentid), text: { content: msgContent }, safe: 0 };
    }
    const msgResp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msgBody) }
    );
    const msgData: any = await msgResp.json();
    if (msgData.errcode !== 0) return res.status(400).json({ ok: false, error: `发送失败：${msgData.errmsg}（errcode: ${msgData.errcode}）` });
    return res.json({ ok: true, msg: "测试消息发送成功" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/admin/wecom/af-users-list - 获取脉动网用户列表（供订单范围选择用）
router.get("/api/admin/wecom/af-users-list", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, users: [] });
    // 获取在 52 号账本有融资付息活跃订单的用户，附带身份和订单数（查 ledger_orders 融资付息订单）
    const [rows] = await (conn as any).execute(
      `SELECT
         u.id,
         u.username,
         u.name,
         COALESCE(lm.role, 'member') AS ledger_role,
         COUNT(o.id) AS active_order_count
       FROM users u
       INNER JOIN ledger_orders o ON o.user_id = u.id
       LEFT JOIN ledger_members lm ON lm.userId = u.id AND lm.ledgerId = 52
       WHERE o.ledger_id = 52
         AND o.deleted_at IS NULL
         AND o.status NOT IN ('cancelled','rejected')
       GROUP BY u.id, u.username, u.name, lm.role
       ORDER BY u.username ASC
       LIMIT 200`
    ) as any;
    const roleLabel: Record<string, string> = {
      funder: '资方',
      owner: '账本所有者',
      admin: '管理员',
      member: '成员',
      client: '客户',
      employee: '员工',
    };
    const users = (rows as any[]).map((r: any) => ({
      id: r.id,
      username: r.username,
      name: r.name || r.username,
      ledger_role: r.ledger_role || 'member',
      active_order_count: Number(r.active_order_count) || 0,
      label: `${r.name || r.username} (${r.username})`,
      display_label: `${r.name || r.username}（${roleLabel[r.ledger_role] || r.ledger_role || '成员'}·${Number(r.active_order_count) || 0}张订单）`,
    }));
    return res.json({ ok: true, users });
  } catch (e: any) {
    console.error("[WecomAdmin] af-users-list error:", e.message);
    return res.status(500).json({ ok: false, users: [], error: e.message });
  }
});

// GET /api/admin/wecom/af-orders-list - 获取融资付息订单列表（供通知配置选择订单范围）
router.get("/api/admin/wecom/af-orders-list", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, orders: [] });
    const userId = req.query.userId ? Number(req.query.userId) : null;
    // 查 ledger_orders（融资付息订单在 ledger_orders 表），带 collateral_share_mode
    let sql = `SELECT o.id, o.order_no, o.coin, o.status, o.amount, o.buy_price,
              o.collateral_share_mode, o.order_role,
              u.username, u.name as user_name
       FROM ledger_orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN ledger_members lm ON lm.ledgerId = o.ledger_id AND lm.userId = o.user_id
       WHERE o.ledger_id = 52
         AND o.deleted_at IS NULL
         AND o.status NOT IN ('cancelled','rejected')`;
    const params: any[] = [];
    if (userId) {
      sql += ` AND o.user_id = ?`;
      params.push(userId);
    }
    sql += ` ORDER BY o.collateral_share_mode DESC, o.id DESC LIMIT 300`;
    const [rows] = await (conn as any).execute(sql, params) as any;
    const orders = (rows as any[]).map((r: any) => ({
      id: r.id,
      order_no: r.order_no || `#${r.id}`,
      coin: r.coin || '-',
      status: r.status,
      amount: r.amount,
      buy_price: r.buy_price,
      collateral_share_mode: r.collateral_share_mode || 'none',
      username: r.username || r.user_name || `user_${r.id}`,
      label: `${r.order_no || '#' + r.id} ${r.coin || ''} ${r.amount ? Number(r.amount).toLocaleString() + 'U' : ''}`,
    }));
    return res.json({ ok: true, orders });
  } catch (e: any) {
    console.error("[WecomAdmin] af-orders-list error:", e.message);
    return res.status(500).json({ ok: false, orders: [], error: e.message });
  }
});

// GET /api/admin/wecom/bound-members - 从绑定表获取成员列表（不依赖企微API，动态实时）
router.get("/api/admin/wecom/bound-members", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.json({ ok: false, members: [] });
    const [rows] = await (conn as any).execute(
      `SELECT wecom_user_id, site_username, bind_note FROM wecom_account_binding ORDER BY created_at ASC`
    ) as any;
    const members = (rows as any[]).map((r: any) => ({
      userid: r.wecom_user_id,
      name: r.bind_note || r.site_username || r.wecom_user_id,
    }));
    res.json({ ok: true, members });
  } catch (e: any) {
    console.error("[WecomAdmin] bound-members error:", e.message);
    res.json({ ok: false, members: [] });
  }
});

// 启动时自动建表并预填默认配置
(async () => {
  try {
    await ensureNotifyTable();
    const conn = await getDbConnection();
    if (!conn) return;
    // 预填默认值（如果还没有保存过）
    const defaults: Record<string, string> = {
      corpid: "wwbbaccf1da5f886d9",
      corpsecret: "3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g",
      agentid: "1000002",
    };
    for (const [key, val] of Object.entries(defaults)) {
      const [rows] = await (conn as any).execute(
        `SELECT id FROM wecom_notify_config WHERE cfg_key = ?`, [key]
      ) as any;
      if ((rows as any[]).length === 0) {
        await (conn as any).execute(
          `INSERT INTO wecom_notify_config (cfg_key, cfg_value) VALUES (?, ?)`, [key, val]
        );
      }
    }
    console.log("[WecomAdmin] notify config table ready");
  } catch (e: any) {
    console.warn("[WecomAdmin] init notify table failed:", e.message);
  }
})();

// ─── 担保缺口预警扫描逻辑 ──────────────────────────────────────────────────────
/**
 * 判断是否应该发送预警，并返回新的已预警百分比
 */
function shouldSendCollateralAlert(cfg: any, currentPct: number): { shouldSend: boolean; newAlertedPct: number | null } {
  const threshold = parseFloat(cfg.threshold);
  if (isNaN(threshold) || currentPct >= threshold) {
    return { shouldSend: false, newAlertedPct: null };
  }

  const mode = cfg.alert_mode || "new_low_24h";
  const now = new Date();
  const lastAt = cfg.last_alerted_at ? new Date(cfg.last_alerted_at) : null;
  const lastPct = cfg.last_alerted_pct != null ? Number(cfg.last_alerted_pct) : null;

  if (mode === "always") {
    return { shouldSend: true, newAlertedPct: currentPct };
  }

  if (mode === "cooldown_1h" || mode === "cooldown_4h" || mode === "cooldown_24h") {
    const hours = mode === "cooldown_1h" ? 1 : mode === "cooldown_4h" ? 4 : 24;
    if (!lastAt) return { shouldSend: true, newAlertedPct: currentPct };
    const diffHours = (now.getTime() - lastAt.getTime()) / (1000 * 60 * 60);
    if (diffHours >= hours) return { shouldSend: true, newAlertedPct: currentPct };
    return { shouldSend: false, newAlertedPct: null };
  }

  // new_low_24h（默认）：新底预警 + 24小时重置
  if (mode === "new_low_24h") {
    if (lastAt) {
      const diffHours = (now.getTime() - lastAt.getTime()) / (1000 * 60 * 60);
      if (diffHours >= 24) {
        // 24小时后重置，重新触发
        return { shouldSend: true, newAlertedPct: currentPct };
      }
    }
    if (lastPct === null) {
      // 第一次触发
      return { shouldSend: true, newAlertedPct: currentPct };
    }
    // 只在跌破新低时发（取整比较，避免浮点横跳）
    const lastFloor = Math.floor(lastPct);
    const curFloor = Math.floor(currentPct);
    if (curFloor < lastFloor) {
      return { shouldSend: true, newAlertedPct: currentPct };
    }
    return { shouldSend: false, newAlertedPct: null };
  }

  return { shouldSend: false, newAlertedPct: null };
}

// ─── 担保缺口扫描核心逻辑（可被定时任务和 HTTP 接口共同调用）──────────────────
/**
 * 计算指定订单集合的综合保证金比例
 * 公式：totalGap / totalBuyValue × 100%
 * totalGap = 总担保物市值 - 总担保需求（本金 + 待结利息）
 * totalBuyValue = Σ(buy_price × buy_quantity)（固定值）
 */
async function calcCollateralRatio(
  conn: any,
  orderIds: number[] | null,
  monitorUserId: number | null,
  shareMode: "shared" | "all" = "all"
): Promise<{ ratio: number | null; totalGap: number; totalBuyValue: number; orderCount: number }> {
  // 查询订单基础字段
  let sql = `
    SELECT o.id, o.order_no, o.coin, o.buy_price, o.buy_quantity,
           o.interest_base, o.interest_rate_annual, o.interest_start_date,
           o.collateral_assets, o.collateral_share_mode
    FROM ledger_orders o
    WHERE o.ledger_id = 52
      AND o.status = 'active'
      AND o.deleted_at IS NULL
  `;
  const params: any[] = [];
  if (monitorUserId) {
    sql += ` AND o.user_id = ?`;
    params.push(monitorUserId);
  }
  if (shareMode === "shared") {
    sql += ` AND o.collateral_share_mode = 'self'`;
  }
  if (orderIds && orderIds.length > 0) {
    sql += ` AND o.id IN (${orderIds.map(() => "?").join(",")})`;
    params.push(...orderIds);
  }

  const [rows] = await (conn as any).execute(sql, params) as any;
  const orders = rows as any[];
  if (orders.length === 0) return { ratio: null, totalGap: 0, totalBuyValue: 0, orderCount: 0 };

  // 查询已结利息
  const oids = orders.map((o: any) => Number(o.id));
  const paidMap: Record<number, number> = {};
  if (oids.length > 0) {
    const placeholders = oids.map(() => "?").join(",");
    const [paidRows] = await (conn as any).execute(
      `SELECT order_id, SUM(amount) as total_paid FROM ledger_order_payments WHERE order_id IN (${placeholders}) GROUP BY order_id`,
      oids
    ) as any;
    for (const r of (paidRows as any[])) { paidMap[Number(r.order_id)] = parseFloat(r.total_paid || "0"); }
  }

  // 计算汇总
  let totalCollateralValue = 0;
  let totalCollateralRequired = 0;
  let totalBuyValue = 0;
  const bjOffset = 8 * 60 * 60 * 1000;

  for (const o of orders) {
    // 担保物市值
    let collateralValue = 0;
    const collateralAssets = (() => {
      try {
        const raw = o.collateral_assets;
        if (Array.isArray(raw)) return raw;
        if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString("utf8"));
        if (typeof raw === "string") return JSON.parse(raw || "[]");
        return [];
      } catch { return []; }
    })();
    for (const asset of collateralAssets) {
      const qty = parseFloat(asset.qty) || 0;
      const coin = (asset.coin || "").toUpperCase().replace(/\s+/g, "");
      const isStable = ["USDT","U","USDC","USDT.E","USDC.E","BUSD","DAI"].includes(coin);
      const price = isStable ? 1 : (getLatestPrice(coin) || 0);
      collateralValue += qty * price;
    }

    // 待结利息
    const principal = parseFloat(String(o.interest_base || o.amount || 0)) || 0;
    const annualRate = parseFloat(String(o.interest_rate_annual || 0)) || 0;
    const startDate = o.interest_start_date ? new Date(o.interest_start_date) : null;
    const holdDays = (() => {
      if (!startDate) return 0;
      const startBJ = new Date(startDate.getTime() + bjOffset);
      const nowBJ = new Date(Date.now() + bjOffset);
      const startDay = Math.floor(startBJ.getTime() / 86400000);
      const nowDay = Math.floor(nowBJ.getTime() / 86400000);
      return Math.max(0, nowDay - startDay + 1);
    })();
    const totalInterest = principal * (annualRate / 100) * holdDays / 365;
    const paidInterest = paidMap[Number(o.id)] || 0;
    const pendingInterest = Math.max(0, totalInterest - paidInterest);
    const collateralRequired = principal + pendingInterest;

    // 买入价值（固定值）
    const buyPrice = parseFloat(String(o.buy_price ?? 0)) || 0;
    const buyQty = parseFloat(String(o.buy_quantity ?? 0)) || 0;
    const buyValue = buyPrice * buyQty;

    totalCollateralValue += collateralValue;
    totalCollateralRequired += collateralRequired;
    totalBuyValue += buyValue;
  }

  const totalGap = totalCollateralValue - totalCollateralRequired;
  const ratio = totalBuyValue > 0 ? (totalGap / totalBuyValue) * 100 : null;
  return { ratio, totalGap, totalBuyValue, orderCount: orders.length };
}

/**
 * 根据当前保证金比例计算下次扫描时间（自适应调度）
 * ≥23% → 1小时后；21-23% → 15分钟后；<21% → 1分钟后
 */
function calcNextScanAt(ratio: number | null): Date {
  const now = Date.now();
  if (ratio === null || ratio >= 23) {
    return new Date(now + 60 * 60 * 1000); // 1小时
  } else if (ratio >= 21) {
    return new Date(now + 15 * 60 * 1000); // 15分钟
  } else {
    return new Date(now + 60 * 1000); // 1分钟
  }
}

/**
 * 发送企业微信消息
 */
async function sendWecomMessage(wecomCfg: Record<string, string>, userid: string, msgtype: string, content: string): Promise<void> {
  const tokenResp = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${wecomCfg.corpid}&corpsecret=${wecomCfg.corpsecret}`
  );
  const tokenData = await tokenResp.json() as any;
  const token = tokenData.access_token;
  if (!token) throw new Error("获取企微 access_token 失败");
  await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      touser: userid,
      msgtype: msgtype || "text",
      agentid: Number(wecomCfg.agentid),
      text: { content },
    }),
  });
}

/**
 * 担保缺口预警扫描主函数（供 HTTP 接口和定时任务共用）
 * @param onlyDue 是否只扫描 next_scan_at 已到期的配置（定时任务模式）
 */
export async function runCollateralGapScan(onlyDue = false): Promise<{ scanned: number; results: any[] }> {
  await ensureUserNotifyTable();
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接失败");

  // 1. 获取所有启用的担保缺口预警配置
  let cfgQuery = `SELECT * FROM wecom_user_notify_config WHERE notify_key = 'fz_notify_collateral_gap' AND enabled = 1`;
  if (onlyDue) {
    cfgQuery += ` AND (next_scan_at IS NULL OR next_scan_at <= NOW())`;
  }
  const [cfgRows] = await (conn as any).execute(cfgQuery) as any;

  // 2. 获取企业微信基础配置
  const [cfgBase] = await (conn as any).execute(
    `SELECT cfg_key, cfg_value FROM wecom_notify_config WHERE cfg_key IN ('corpid','corpsecret','agentid')`
  ) as any;
  const wecomCfg: Record<string, string> = {};
  for (const r of cfgBase as any[]) wecomCfg[r.cfg_key] = r.cfg_value;

  const results: any[] = [];

  for (const cfg of cfgRows as any[]) {
    try {
      let orderIds: number[] | null = null;
      if (cfg.order_scope && cfg.order_scope !== "all") {
        try { orderIds = JSON.parse(cfg.order_scope); } catch {}
      }

      // 3. 计算当前保证金比例（使用正确公式：totalGap / totalBuyValue × 100%）
      const { ratio, totalGap, totalBuyValue, orderCount } = await calcCollateralRatio(
        conn, orderIds, cfg.monitor_user_id || null, "all"
      );

      // 4. 计算下次扫描时间（自适应调度）
      const nextScanAt = calcNextScanAt(ratio);
      const nextScanStr = nextScanAt.toISOString().replace("T", " ").replace("Z", "").slice(0, 19);

      if (ratio === null) {
        // 无有效订单，更新 next_scan_at 后跳过
        await (conn as any).execute(
          `UPDATE wecom_user_notify_config SET last_scan_ratio=NULL, next_scan_at=? WHERE id=?`,
          [nextScanStr, cfg.id]
        );
        results.push({ cfg_id: cfg.id, userid: cfg.userid, ratio: null, sent: false, reason: "无有效订单" });
        continue;
      }

      const currentPct = ratio;
      const { shouldSend, newAlertedPct } = shouldSendCollateralAlert(cfg, currentPct);

      if (shouldSend) {
        const timeStr = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const content = (cfg.content || "【担保缺口预警】当前保证金比例为 {gap_pct}%，低于预警阈值 {threshold}%，风险敞口 {gap}U / 总买入价值 {buy}U，请及时补充担保物。\n时间：{time}")
          .replace("{gap_pct}", currentPct.toFixed(2))
          .replace("{threshold}", cfg.threshold || "")
          .replace("{gap}", totalGap.toFixed(2))
          .replace("{buy}", totalBuyValue.toFixed(2))
          .replace("{time}", timeStr);

        try {
          await sendWecomMessage(wecomCfg, cfg.userid, cfg.msgtype || "text", content);
          console.log(`[CollateralScan] 已发送预警给 ${cfg.userid}，比例=${currentPct.toFixed(2)}%`);
        } catch (sendErr: any) {
          console.warn("[CollateralScan] 发送失败:", sendErr.message);
        }

        await (conn as any).execute(
          `UPDATE wecom_user_notify_config SET last_alerted_pct=?, last_alerted_at=NOW(), last_scan_ratio=?, next_scan_at=? WHERE id=?`,
          [newAlertedPct, currentPct, nextScanStr, cfg.id]
        );
        results.push({ cfg_id: cfg.id, userid: cfg.userid, ratio: currentPct, totalGap, totalBuyValue, orderCount, sent: true });
      } else {
        await (conn as any).execute(
          `UPDATE wecom_user_notify_config SET last_scan_ratio=?, next_scan_at=? WHERE id=?`,
          [currentPct, nextScanStr, cfg.id]
        );
        results.push({ cfg_id: cfg.id, userid: cfg.userid, ratio: currentPct, totalGap, totalBuyValue, orderCount, sent: false });
      }
    } catch (cfgErr: any) {
      console.error(`[CollateralScan] 配置 ${cfg.id} 扫描失败:`, cfgErr.message);
      results.push({ cfg_id: cfg.id, error: cfgErr.message });
    }
  }

  return { scanned: (cfgRows as any[]).length, results };
}

// POST /api/admin/wecom/run-collateral-gap-scan
// 手动触发担保缺口预警扫描
router.post("/api/admin/wecom/run-collateral-gap-scan", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const result = await runCollateralGapScan(false);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/wecom/test-collateral-gap-send
// 强制测试发送：不走阈值/新底逻辑，直接取当前保证金比例发一条测试消息
router.post("/api/admin/wecom/test-collateral-gap-send", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { cfg_id } = req.body;
    if (!cfg_id) return res.status(400).json({ ok: false, error: "cfg_id 不能为空" });

    await ensureUserNotifyTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    // 查询配置记录
    const [cfgRows] = await (conn as any).execute(
      `SELECT * FROM wecom_user_notify_config WHERE id = ?`, [cfg_id]
    ) as any;
    if (!(cfgRows as any[]).length) return res.status(404).json({ ok: false, error: "配置记录不存在" });
    const cfg = (cfgRows as any[])[0];

    // 获取企业微信基础配置
    const [cfgBase] = await (conn as any).execute(
      `SELECT cfg_key, cfg_value FROM wecom_notify_config WHERE cfg_key IN ('corpid','corpsecret','agentid')`
    ) as any;
    const wecomCfg: Record<string, string> = {};
    for (const r of cfgBase as any[]) wecomCfg[r.cfg_key] = r.cfg_value;
    if (!wecomCfg.corpid || !wecomCfg.corpsecret || !wecomCfg.agentid) {
      return res.status(400).json({ ok: false, error: "企微基础配置不完整（缺少 corpid/corpsecret/agentid）" });
    }

    // 计算当前保证金比例（不走阈值判断）
    let orderIds: number[] | null = null;
    if (cfg.order_scope && cfg.order_scope !== "all") {
      try { orderIds = JSON.parse(cfg.order_scope); } catch {}
    }
    const { ratio, totalGap, totalBuyValue, orderCount } = await calcCollateralRatio(
      conn, orderIds, cfg.monitor_user_id || null, "all"
    );

    // 拼装测试消息
    const timeStr = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const ratioStr = ratio !== null ? ratio.toFixed(2) : "N/A";
    const content = `[测试] 担保缺口预警测试消息
当前保证金比例：${ratioStr}%
风险敞口：${totalGap.toFixed(2)}U
总买入价值：${totalBuyValue.toFixed(2)}U
订单数量：${orderCount} 张
预警阈值：${cfg.threshold || "未设置"}%
时间：${timeStr}`;

    // 强制发送（不走任何判断逻辑）
    await sendWecomMessage(wecomCfg, cfg.userid, cfg.msgtype || "text", content);

    return res.json({
      ok: true,
      userid: cfg.userid,
      ratio: ratio !== null ? parseFloat(ratio.toFixed(2)) : null,
      totalGap: parseFloat(totalGap.toFixed(2)),
      totalBuyValue: parseFloat(totalBuyValue.toFixed(2)),
      orderCount,
      message: `测试消息已发送给 ${cfg.userid}，当前比例=${ratioStr}%`,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
// GET /api/admin/wecom/describe-af-orders - 临时查看 af_orders 表结构
router.get("/api/admin/wecom/describe-af-orders", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false });
    const [rows] = await (conn as any).execute(`DESCRIBE af_orders`) as any;
    return res.json({ ok: true, columns: rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});
