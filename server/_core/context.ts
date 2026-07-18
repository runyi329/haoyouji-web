import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  realUser: User | null; // 管理员真实身份（viewAs模式下与user不同）
  isViewingAs: boolean;  // 是否处于身份代入模式
  isGuest: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // 开启DEV_BYPASS_AUTH时自动使用测试用户
  // 但如果请求携带了 Authorization header，说明前端已有真实 token，不走 bypass
  const hasAuthHeader = !!(opts.req.headers.authorization);
  if (process.env.DEV_BYPASS_AUTH === 'true' && !user && !hasAuthHeader) {
    user = {
      id: 28,
      openId: 'dev_mock_user',
      username: 'hyy329',
      passwordHash: '',
      name: 'hyy329',
      email: null,
      loginMethod: 'password' as const,
      role: 'parent' as const,
      mibanRole: 'parent' as const,
      familyId: null,
      avatar: null,
      points: 0,
      sharingEnabled: 0,
      isLocked: 0,
      failedLoginAttempts: 0,
      lastFailedLogin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
  }

  const GUEST_USER_ID = 5070293;
  const isGuest = user?.id === GUEST_USER_ID;

  // ===== viewAs 身份代入逻辑 =====
  // 只有 super_admin / admin / parent 才允许身份代入
  // 前端切换视角时，通过请求头 x-view-as-user-id 传入目标用户ID
  let realUser: User | null = user;
  let isViewingAs = false;

  const viewAsHeader = opts.req.headers['x-view-as-user-id'];
  const viewAsUserIdRaw = Array.isArray(viewAsHeader) ? viewAsHeader[0] : viewAsHeader;
  const viewAsUserId = viewAsUserIdRaw ? parseInt(viewAsUserIdRaw, 10) : null;

  if (
    user &&
    viewAsUserId &&
    !isNaN(viewAsUserId) &&
    viewAsUserId !== user.id &&
    (user.role === 'super_admin' || user.role === 'admin' || user.role === 'parent')
  ) {
    try {
      const targetUser = await db.getUserById(viewAsUserId);
      if (targetUser) {
        user = targetUser as User;
        isViewingAs = true;
      }
    } catch (e) {
      // 获取目标用户失败，保持原用户
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    realUser,
    isViewingAs,
    isGuest,
  };
}
