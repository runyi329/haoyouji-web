/**
 * 企业微信管理后台路由
 * 职责：用户绑定管理（以企微用户为主体，展示绑定状态）
 * 路径前缀：/api/admin/wecom
 * 权限：仅超级管理员（通过 session cookie 验证）
 */

import { Router, Request, Response } from "express";
import { getDbConnection } from "./db";
import { sdk } from "./_core/sdk";

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
    const tokenResp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpid}&corpsecret=${corpsecret}`
    );
    const tokenData: any = await tokenResp.json();
    if (tokenData.errcode !== 0) {
      return res.status(400).json({ ok: false, error: `获取 access_token 失败：${tokenData.errmsg}` });
    }
    const accessToken = tokenData.access_token;
    const msgResp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          touser,
          msgtype: "text",
          agentid: parseInt(agentid),
          text: { content: `【好友记通知平台】测试消息发送成功 ✅\n时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}` },
          safe: 0
        })
      }
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

export default router;
