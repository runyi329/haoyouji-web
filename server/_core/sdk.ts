import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  userId: string;
  appId: string;
  name: string;
};

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    // ENV.cookieSecret 在模块加载时读取，若 .env 未在此之前加载则为空
    // 此处直接读 process.env.JWT_SECRET 作为兜底，确保热重启后也能正确获取
    const secret = ENV.cookieSecret || process.env.JWT_SECRET || "haoyouji-dev-fallback-secret-2026";
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(
    userId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return this.signSession(
      {
        userId,
        appId: "local-app",
        name: options.name || "",
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      userId: payload.userId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ userId: string; appId: string; name: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { userId, appId, name } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(userId) ||
        !isNonEmptyString(appId) ||
        typeof name !== 'string'
      ) {
        console.warn("[Auth] Session payload missing required fields", { userId, appId, name });
        return null;
      }

      return {
        userId,
        appId,
        name,
      };
    } catch (error) {
      console.error("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    // 优先从 Authorization header 读取 token
    // 前端始终会从 localStorage 发送最新登录用户的 token
    // 解决微信浏览器中 Cookie 残留旧用户 token 的问题
    let sessionCookie: string | undefined;
    const authHeader = req.headers.authorization;
    console.log('[Auth-DEBUG] authorization header:', authHeader ? authHeader.substring(0, 30) + '...' : 'MISSING');
    console.log('[Auth-DEBUG] cookie header:', req.headers.cookie ? req.headers.cookie.substring(0, 60) + '...' : 'MISSING');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionCookie = authHeader.substring(7); // 移除 "Bearer " 前缀
    }
    
    // 如果 Authorization header 中没有 token，回退到 Cookie
    if (!sessionCookie) {
      const cookies = this.parseCookies(req.headers.cookie);
      sessionCookie = cookies.get(COOKIE_NAME);
    }
    
    console.log('[Auth-DEBUG2] sessionCookie:', sessionCookie ? sessionCookie.substring(0, 30) + '...' : 'UNDEFINED');
    const session = await this.verifySession(sessionCookie);
    console.log('[Auth-DEBUG2] session result:', session ? JSON.stringify(session).substring(0, 60) : 'NULL');

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.userId;
    const signedInAt = new Date();
    console.log('[Auth-DEBUG3] looking up userId:', sessionUserId);
    let user;
    try {
      user = await db.getUserById(parseInt(sessionUserId));
      console.log('[Auth-DEBUG3] getUserById result:', user ? user.username : 'NOT_FOUND');
    } catch (e: any) {
      console.error('[Auth-DEBUG3] getUserById ERROR:', e.message);
      throw e;
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.updateUserLastSignedIn(user.id, signedInAt);

    return user;
  }
}

export const sdk = new SDKServer();
