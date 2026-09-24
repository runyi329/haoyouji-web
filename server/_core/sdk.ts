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

type CachedUser = {
  user: User;
  expiresAt: number;
  lastSignedInWriteAt: number;
};

class SDKServer {
  // 身份代入目标可短时复用，避免管理员连续切换页面时重复读取同一用户；
  // 实际登录用户仍逐请求从数据库读取，确保角色/锁定状态立即生效。
  private readonly userCache = new Map<number, CachedUser>();
  private readonly userCacheTtlMs = 15_000;
  private readonly lastSignedInWriteIntervalMs = 5 * 60_000;

  private pruneUserCache(now: number) {
    if (this.userCache.size < 2_048) return;
    for (const [id, entry] of this.userCache) {
      if (entry.expiresAt <= now) this.userCache.delete(id);
    }
  }

  async getCachedUserById(userId: number): Promise<User | undefined> {
    const now = Date.now();
    const cached = this.userCache.get(userId);
    if (cached && cached.expiresAt > now) return cached.user;

    this.pruneUserCache(now);
    const user = await db.getUserById(userId);
    if (!user) return undefined;
    this.userCache.set(userId, {
      user,
      expiresAt: now + this.userCacheTtlMs,
      // 首次加载可立即记录；后续请求在限频窗口内不再等待写操作。
      lastSignedInWriteAt: 0,
    });
    return user;
  }

  private cacheUser(user: User) {
    const now = Date.now();
    const prior = this.userCache.get(user.id);
    this.userCache.set(user.id, {
      user,
      expiresAt: now + this.userCacheTtlMs,
      lastSignedInWriteAt: prior?.lastSignedInWriteAt ?? 0,
    });
  }

  private refreshLastSignedIn(userId: number) {
    const now = Date.now();
    const cached = this.userCache.get(userId);
    if (!cached || now - cached.lastSignedInWriteAt < this.lastSignedInWriteIntervalMs) return;
    cached.lastSignedInWriteAt = now;
    // 活跃标记是辅助信息，不应阻塞受保护页面的读取路径。
    void db.updateUserLastSignedIn(userId, new Date(now)).catch((error) => {
      console.warn('[Auth] Failed to refresh last signed-in timestamp:', String(error));
    });
  }

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
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionCookie = authHeader.substring(7); // 移除 "Bearer " 前缀
    }
    
    // 如果 Authorization header 中没有 token，回退到 Cookie
    if (!sessionCookie) {
      const cookies = this.parseCookies(req.headers.cookie);
      sessionCookie = cookies.get(COOKIE_NAME);
    }
    
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = parseInt(session.userId, 10);
    let user: User | undefined;
    try {
      user = await db.getUserById(sessionUserId);
      if (user) this.cacheUser(user);
    } catch (e: any) {
      console.error('[Auth] User lookup failed:', e.message);
      throw e;
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    this.refreshLastSignedIn(user.id);

    return user;
  }
}

export const sdk = new SDKServer();
