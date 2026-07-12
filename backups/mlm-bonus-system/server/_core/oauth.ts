import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { createHmac } from "crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

// 脉动网数据库连接（只读，用于验证用户名+密码）
const HAOYOUJI_DB_URL =
  process.env.HAOYOUJI_DB_URL ||
  "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";

let haoyoujiPool: mysql.Pool | null = null;
function getHaoyoujiPool(): mysql.Pool {
  if (!haoyoujiPool) {
    haoyoujiPool = mysql.createPool(HAOYOUJI_DB_URL);
  }
  return haoyoujiPool;
}

// 脉动网（haoyouji-web）对接：HMAC签名验证
// 两端共享同一个 HAOYOUJI_SHARED_SECRET，不依赖 JWT_SECRET
// 跳转链接格式：?uid=xxx&name=xxx&ts=xxx&sign=xxx
const HAOYOUJI_SHARED_SECRET =
  process.env.HAOYOUJI_SHARED_SECRET || "mlm-bonus-shared-secret-2026";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  /**
   * 脉动网单点登录入口（HMAC签名验证，不依赖JWT_SECRET）
   * 脉动网跳转时携带 ?uid=xxx&name=xxx&ts=xxx&sign=xxx 参数
   * sign = HMAC-SHA256(uid + ":" + name + ":" + ts, HAOYOUJI_SHARED_SECRET)
   * ts 为 Unix 时间戳（秒），有效期5分钟
   * 用法：https://mlmbonus-chknjmtw.manus.space/api/auth/external-login?uid=xxx&name=xxx&ts=xxx&sign=xxx&redirect=/
   */
  app.get("/api/auth/external-login", async (req: Request, res: Response) => {
    const uid = typeof req.query.uid === "string" ? req.query.uid : null;
    const name = typeof req.query.name === "string" ? decodeURIComponent(req.query.name) : "";
    const ts = typeof req.query.ts === "string" ? req.query.ts : null;
    const sign = typeof req.query.sign === "string" ? req.query.sign : null;
    const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "/";

    if (!uid || !ts || !sign) {
      res.status(400).json({ error: "uid, ts, sign are required" });
      return;
    }

    try {
      // 验证时间戳（5分钟有效期，防重放攻击）
      const tsNum = parseInt(ts, 10);
      const now = Math.floor(Date.now() / 1000);
      if (isNaN(tsNum) || Math.abs(now - tsNum) > 300) {
        res.status(401).json({ error: "Link expired, please try again" });
        return;
      }

      // 验证 HMAC 签名
      const payload = `${uid}:${name}:${ts}`;
      const expectedSign = createHmac("sha256", HAOYOUJI_SHARED_SECRET)
        .update(payload)
        .digest("hex");

      if (sign !== expectedSign) {
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      // 用脉动网 userId 作为 openId，在本平台创建/更新用户记录
      const openId = `haoyouji:${uid}`;
      await db.upsertUser({
        openId,
        name: name || null,
        loginMethod: "haoyouji",
        lastSignedIn: new Date(),
      });

      // 签发本平台 session token
      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // 跳转到目标页面（默认首页）
      const safeRedirect = redirect.startsWith("/") ? redirect : "/";
      res.redirect(302, safeRedirect);
    } catch (error) {
      console.error("[ExternalLogin] Verification failed", error);
      res.status(401).json({ error: "Invalid or expired link" });
    }
  });

  /**
   * 脉动网账号直接登录
   * 用户在奖金平台输入脉动网用户名+密码，连接脉动网数据库验证
   * 验证通过后签发本平台 session
   */
  app.post("/api/auth/haoyouji-login", async (req: Request, res: Response) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: "用户名和密码不能为空" });
      return;
    }

    try {
      const pool = getHaoyoujiPool();
      const [rows] = await pool.execute(
        "SELECT id, username, name, passwordHash, isLocked, failedLoginAttempts FROM users WHERE username = ? LIMIT 1",
        [username]
      ) as [any[], any];

      const user = rows[0];

      if (!user) {
        res.status(401).json({ error: "用户名或密码错误" });
        return;
      }

      if (user.isLocked) {
        res.status(403).json({ error: "账号已被锁定，请联系管理员" });
        return;
      }

      if (!user.passwordHash) {
        res.status(401).json({ error: "该账号未设置密码，请在脉动网登录" });
        return;
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);

      if (!isValid) {
        // 更新失败次数
        const newFailCount = (user.failedLoginAttempts || 0) + 1;
        const shouldLock = newFailCount >= 10;
        await pool.execute(
          "UPDATE users SET failedLoginAttempts = ?, isLocked = ?, lastFailedLogin = NOW() WHERE id = ?",
          [newFailCount, shouldLock ? 1 : 0, user.id]
        );
        const remaining = Math.max(0, 10 - newFailCount);
        res.status(401).json({
          error: "用户名或密码错误",
          remaining,
          showCaptcha: newFailCount >= 3,
          locked: shouldLock,
        });
        return;
      }

      // 登录成功，重置失败次数
      await pool.execute(
        "UPDATE users SET failedLoginAttempts = 0, lastSignedIn = NOW() WHERE id = ?",
        [user.id]
      );

      // 用脉动网 userId 作为 openId
      const openId = `haoyouji:${user.id}`;
      await db.upsertUser({
        openId,
        name: user.name || user.username || null,
        loginMethod: "haoyouji-password",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: user.name || user.username || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name || user.username,
        },
      });
    } catch (error) {
      console.error("[HaoyoujiLogin] 登录失败", error);
      res.status(500).json({ error: "登录失败，请稍后重试" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
