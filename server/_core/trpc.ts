import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { setCurrentIsGuest } from "../db";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// 在每个请求开始时设置isGuest标记
const setGuestContext = t.middleware(async opts => {
  const { ctx, next } = opts;
  setCurrentIsGuest(ctx.isGuest);
  return next();
});

export const publicProcedure = t.procedure.use(setGuestContext);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  // 开启DEV_BYPASS_AUTH时自动使用测试用户
  if (process.env.DEV_BYPASS_AUTH === 'true' && !ctx.user) {
    const mockUser = {
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
    return next({
      ctx: {
        ...ctx,
        user: mockUser,
      },
    });
  }

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(setGuestContext).use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'super_admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
