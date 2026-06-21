/**
 * 企业微信管理后台路由
 * 职责：账号绑定管理（查询、手动绑定、解绑、搜索）
 * 路径前缀：/api/admin/wecom
 * 权限：仅超级管理员（通过 session 验证）
 */

import { Router, Request, Response } from "express";
import { getDbConnection } from "./db";

const router = Router();

// ─── 鉴权中间件：仅超级管理员可访问 ─────────────────────────────────────────
async function requireSuperAdmin(req: Request, res: Response, next: Function) {
  const sessionToken = req.cookies?.session_token || req.headers?.["x-session-token"];
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: "未登录" });
  }
  try {
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });
    const [rows] = await (conn as any).execute(
      `SELECT u.id, u.username, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > NOW() LIMIT 1`,
      [sessionToken]
    ) as any;
    const user = (rows as any[])[0];
    if (!user || user.role !== "super_admin") {
      return res.status(403).json({ ok: false, error: "权限不足，仅超级管理员可操作" });
    }
    (req as any).adminUser = user;
    next();
  } catch (e) {
    console.error("[wecom-admin] 鉴权失败:", e);
    return res.status(500).json({ ok: false, error: "鉴权异常" });
  }
}

// ─── 确保数据库表存在并执行迁移 ──────────────────────────────────────────────
let _tableEnsured = false;
async function ensureBindingTable() {
  if (_tableEnsured) return;
  const conn = await getDbConnection();
  if (!conn) return;

  // 确保 wecom_account_binding 表存在（兼容已有表）
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

  // 迁移：补充 provider 字段（为未来多渠道扩展预留，默认 wecom）
  try {
    await (conn as any).execute(
      `ALTER TABLE wecom_account_binding
       ADD COLUMN IF NOT EXISTS provider VARCHAR(32) NOT NULL DEFAULT 'wecom'
       COMMENT '认证来源: wecom/wechat_mp' AFTER id`
    );
  } catch (_) {}

  // 迁移：补充 bind_note 字段（管理员备注）
  try {
    await (conn as any).execute(
      `ALTER TABLE wecom_account_binding
       ADD COLUMN IF NOT EXISTS bind_note VARCHAR(200) DEFAULT NULL
       COMMENT '管理员备注' AFTER bound_by`
    );
  } catch (_) {}

  _tableEnsured = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/wecom/bindings
// 获取绑定列表（支持关键词搜索、分页）
// ─────────────────────────────────────────────────────────────────────────────
router.get("/api/admin/wecom/bindings", requireSuperAdmin, async (req: Request, res: Response) => {
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
        b.wecom_user_id LIKE ? OR
        b.site_username LIKE ? OR
        u.name LIKE ? OR
        u.phone LIKE ?
      )`;
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }

    // 查询总数
    const [countRows] = await (conn as any).execute(
      `SELECT COUNT(*) as total
       FROM wecom_account_binding b
       LEFT JOIN users u ON u.id = b.site_user_id
       ${whereClause}`,
      params
    ) as any;
    const total = (countRows as any[])[0]?.total || 0;

    // 查询列表（关联 users 表获取真实姓名和手机号）
    const [rows] = await (conn as any).execute(
      `SELECT
         b.id,
         b.wecom_user_id,
         b.provider,
         b.site_username,
         b.site_user_id,
         b.bound_by,
         b.bind_note,
         b.created_at AS bound_at,
         b.updated_at,
         u.name AS user_real_name,
         u.phone AS user_phone,
         u.role AS user_role,
         s.nickname AS wecom_nickname,
         s.wecom_name,
         s.wecom_avatar
       FROM wecom_account_binding b
       LEFT JOIN users u ON u.id = b.site_user_id
       LEFT JOIN (
         SELECT wecom_user_id, MAX(nickname) AS nickname, MAX(wecom_name) AS wecom_name, MAX(wecom_avatar) AS wecom_avatar
         FROM wecom_manus_sessions GROUP BY wecom_user_id
       ) s ON s.wecom_user_id = b.wecom_user_id
       ${whereClause}
       ORDER BY b.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    ) as any;

    res.json({
      ok: true,
      data: rows as any[],
      total,
      page,
      pageSize,
    });
  } catch (e) {
    console.error("[wecom-admin] 查询绑定列表失败:", e);
    res.status(500).json({ ok: false, error: "查询失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/wecom/unbound-users
// 获取尚未绑定的企微用户列表（用于手动绑定时的下拉选择）
// ─────────────────────────────────────────────────────────────────────────────
router.get("/api/admin/wecom/unbound-users", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureBindingTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const [rows] = await (conn as any).execute(`
      SELECT
        s.wecom_user_id,
        MAX(s.nickname) AS nickname,
        MAX(s.wecom_name) AS wecom_name,
        MAX(s.wecom_avatar) AS wecom_avatar,
        MAX(s.updated_at) AS last_active
      FROM wecom_manus_sessions s
      LEFT JOIN wecom_account_binding b ON b.wecom_user_id = s.wecom_user_id
      WHERE b.id IS NULL
      GROUP BY s.wecom_user_id
      ORDER BY last_active DESC
      LIMIT 100
    `) as any;

    res.json({ ok: true, data: rows as any[] });
  } catch (e) {
    console.error("[wecom-admin] 查询未绑定用户失败:", e);
    res.status(500).json({ ok: false, error: "查询失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/wecom/search-site-user
// 按手机号或用户名搜索脉动网用户（用于绑定时的用户检索）
// ─────────────────────────────────────────────────────────────────────────────
router.get("/api/admin/wecom/search-site-user", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const keyword = (req.query.keyword as string || "").trim();
    if (!keyword) return res.json({ ok: true, data: [] });

    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const [rows] = await (conn as any).execute(
      `SELECT id, username, name, phone, role
       FROM users
       WHERE username LIKE ? OR phone LIKE ? OR name LIKE ?
       LIMIT 10`,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
    ) as any;

    res.json({ ok: true, data: rows as any[] });
  } catch (e) {
    console.error("[wecom-admin] 搜索用户失败:", e);
    res.status(500).json({ ok: false, error: "搜索失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/wecom/bindings
// 手动创建或更新绑定关系
// body: { wecom_user_id, site_user_id, bind_note? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/api/admin/wecom/bindings", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureBindingTable();
    const { wecom_user_id, site_user_id, bind_note } = req.body || {};
    const adminUser = (req as any).adminUser;

    if (!wecom_user_id || !site_user_id) {
      return res.status(400).json({ ok: false, error: "缺少必要参数：wecom_user_id 和 site_user_id" });
    }

    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    // 校验脉动网用户是否存在
    const [userRows] = await (conn as any).execute(
      `SELECT id, username, name, phone FROM users WHERE id = ? LIMIT 1`,
      [site_user_id]
    ) as any;
    const siteUser = (userRows as any[])[0];
    if (!siteUser) {
      return res.status(404).json({ ok: false, error: `脉动网用户 ID ${site_user_id} 不存在` });
    }

    // 写入绑定（已存在则更新）
    await (conn as any).execute(
      `INSERT INTO wecom_account_binding
         (wecom_user_id, site_username, site_user_id, bound_by, bind_note)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         site_username = VALUES(site_username),
         site_user_id  = VALUES(site_user_id),
         bound_by      = VALUES(bound_by),
         bind_note     = VALUES(bind_note),
         updated_at    = NOW()`,
      [wecom_user_id, siteUser.username, siteUser.id, adminUser.username, bind_note || null]
    );

    res.json({
      ok: true,
      message: `绑定成功：${wecom_user_id} ↔ ${siteUser.username}（${siteUser.name || siteUser.phone || ""}）`,
    });
  } catch (e) {
    console.error("[wecom-admin] 创建绑定失败:", e);
    res.status(500).json({ ok: false, error: "绑定失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/wecom/bindings/:id
// 更新绑定备注
// body: { bind_note }
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/api/admin/wecom/bindings/:id", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { bind_note } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: "无效的 ID" });

    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    await (conn as any).execute(
      `UPDATE wecom_account_binding SET bind_note = ?, updated_at = NOW() WHERE id = ?`,
      [bind_note || null, id]
    );

    res.json({ ok: true, message: "备注已更新" });
  } catch (e) {
    console.error("[wecom-admin] 更新备注失败:", e);
    res.status(500).json({ ok: false, error: "更新失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/wecom/bindings/:id
// 解除绑定
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/api/admin/wecom/bindings/:id", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "无效的 ID" });

    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    await (conn as any).execute(
      `DELETE FROM wecom_account_binding WHERE id = ?`,
      [id]
    );

    res.json({ ok: true, message: "已解除绑定" });
  } catch (e) {
    console.error("[wecom-admin] 解除绑定失败:", e);
    res.status(500).json({ ok: false, error: "解除失败" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/wecom/binding-stats
// 获取绑定统计概览（总绑定数、今日新增、未绑定的活跃企微用户数）
// ─────────────────────────────────────────────────────────────────────────────
router.get("/api/admin/wecom/binding-stats", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await ensureBindingTable();
    const conn = await getDbConnection();
    if (!conn) return res.status(500).json({ ok: false, error: "数据库连接失败" });

    const [[totalRow], [todayRow], [unboundRow]] = await Promise.all([
      (conn as any).execute(`SELECT COUNT(*) AS cnt FROM wecom_account_binding`) as Promise<any>,
      (conn as any).execute(
        `SELECT COUNT(*) AS cnt FROM wecom_account_binding WHERE DATE(created_at) = CURDATE()`
      ) as Promise<any>,
      (conn as any).execute(`
        SELECT COUNT(DISTINCT s.wecom_user_id) AS cnt
        FROM wecom_manus_sessions s
        LEFT JOIN wecom_account_binding b ON b.wecom_user_id = s.wecom_user_id
        WHERE b.id IS NULL
      `) as Promise<any>,
    ]);

    res.json({
      ok: true,
      data: {
        total_bound: (totalRow as any[])[0]?.cnt || 0,
        today_new: (todayRow as any[])[0]?.cnt || 0,
        unbound_active: (unboundRow as any[])[0]?.cnt || 0,
      },
    });
  } catch (e) {
    console.error("[wecom-admin] 统计失败:", e);
    res.status(500).json({ ok: false, error: "统计失败" });
  }
});

export default router;
