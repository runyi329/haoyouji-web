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
         u.balance        AS user_balance,
         (SELECT COUNT(*) FROM wecom_route_log rl WHERE rl.wecom_user_id = s.wecom_user_id) AS msg_count
       FROM wecom_manus_sessions s
       LEFT JOIN wecom_account_binding b ON b.wecom_user_id = s.wecom_user_id
       LEFT JOIN users u ON u.id = b.site_user_id
       ${whereClause}
       ORDER BY s.updated_at DESC
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

export default router;
