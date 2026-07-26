import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { createHmac } from "crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

// ─── 脉动网 SSO 单点登录端点 ─────────────────────────────────────────────────
// 脉动网主站用 HMAC-SHA256 对 uid:name:ts 签名，子项目验证签名后颁发 session cookie。
// 规范（H-3）：GET /api/auth/external-login?uid=xxx&name=xxx&ts=xxx&sign=xxx&redirect=/
async function handleSsoLogin(req: Request, res: Response) {
  const uid = getQueryParam(req, "uid");
  const name = getQueryParam(req, "name") ?? "";
  const ts = getQueryParam(req, "ts");
  const sign = getQueryParam(req, "sign");
  const redirect = getQueryParam(req, "redirect") ?? "/";

  if (!uid || !ts || !sign) {
    res.status(400).json({ error: "uid, ts, sign are required" });
    return;
  }

  const sharedSecret = process.env.HAOYOUJI_SHARED_SECRET;
  if (!sharedSecret) {
    console.error("[SSO] HAOYOUJI_SHARED_SECRET is not configured");
    res.status(500).json({ error: "SSO not configured" });
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
    const decodedName = decodeURIComponent(name);
    const payload = `${uid}:${decodedName}:${ts}`;
    const expectedSign = createHmac("sha256", sharedSecret)
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
      name: decodedName || null,
      loginMethod: "haoyouji_sso",
      lastSignedIn: new Date(),
    });

    // 签发本平台 session token
    const sessionToken = await sdk.createSessionToken(openId, {
      name: decodedName,
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    // 跳转到目标页面（默认首页）
    const safeRedirect = redirect.startsWith("/") ? redirect : "/";
    res.redirect(302, safeRedirect);
  } catch (error) {
    console.error("[SSO] Verification failed", error);
    res.status(401).json({ error: "Invalid or expired link" });
  }
}

export function registerOAuthRoutes(app: Express) {
  // 脉动网 SSO 登录端点（H-3 规范：GET /api/auth/external-login?uid=xxx&name=xxx&ts=xxx&sign=xxx）
  app.get("/api/auth/external-login", handleSsoLogin);

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

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
