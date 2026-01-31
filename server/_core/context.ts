import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  isGuest: boolean; // 是否是游客用户
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
  if (process.env.DEV_BYPASS_AUTH === 'true' && !user) {
    user = {
      id: 28,
      openId: 'dev_mock_user',
      username: 'hyy329',
      passwordHash: '',
      name: '测试用户',
      email: null,
      loginMethod: 'password' as const,
      role: 'parent' as const,
      familyId: 1,
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

  return {
    req: opts.req,
    res: opts.res,
    user,
    isGuest,
  };
}
