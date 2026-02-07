// 邀请功能权限控制API (管理员功能)
import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const invitePermissionRouter = router({
  // 设置用户的邀请功能权限 (仅管理员)
  setUserInvitePermission: protectedProcedure
    .input(z.object({
      userId: z.number(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 检查权限: 只有super_admin可以操作
      if (ctx.user!.role !== 'super_admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "只有管理员可以设置邀请功能权限",
        });
      }
      
      const db = await getDb();
      
      // 更新用户的邀请功能权限
      await db
        .update(users)
        .set({
          inviteEnabled: input.enabled ? 1 : 0,
        })
        .where(eq(users.id, input.userId));
      
      return {
        success: true,
        message: input.enabled ? "已开启邀请功能" : "已关闭邀请功能",
      };
    }),
  
  // 批量设置用户的邀请功能权限 (仅管理员)
  batchSetInvitePermission: protectedProcedure
    .input(z.object({
      userIds: z.array(z.number()),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 检查权限: 只有super_admin可以操作
      if (ctx.user!.role !== 'super_admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "只有管理员可以设置邀请功能权限",
        });
      }
      
      const db = await getDb();
      
      // 批量更新用户的邀请功能权限
      for (const userId of input.userIds) {
        await db
          .update(users)
          .set({
            inviteEnabled: input.enabled ? 1 : 0,
          })
          .where(eq(users.id, userId));
      }
      
      return {
        success: true,
        count: input.userIds.length,
        message: `已${input.enabled ? '开启' : '关闭'} ${input.userIds.length} 个用户的邀请功能`,
      };
    }),
  
  // 获取用户的邀请功能权限状态 (仅管理员)
  getUserInvitePermission: protectedProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      // 检查权限: 只有super_admin可以查询
      if (ctx.user!.role !== 'super_admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "只有管理员可以查询邀请功能权限",
        });
      }
      
      const db = await getDb();
      
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          inviteEnabled: users.inviteEnabled,
          inviteCode: users.inviteCode,
          inviteCount: users.inviteCount,
        })
        .from(users)
        .where(eq(users.id, input.userId));
      
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "用户不存在",
        });
      }
      
      return {
        userId: user.id,
        username: user.username,
        name: user.name,
        inviteEnabled: Boolean(user.inviteEnabled),
        inviteCode: user.inviteCode,
        inviteCount: user.inviteCount || 0,
      };
    }),
  
  // 获取所有用户的邀请功能权限状态 (仅管理员)
  getAllUsersInvitePermission: protectedProcedure
    .query(async ({ ctx }) => {
      // 检查权限: 只有super_admin可以查询
      if (ctx.user!.role !== 'super_admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "只有管理员可以查询邀请功能权限",
        });
      }
      
      const db = await getDb();
      
      const allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          role: users.role,
          inviteEnabled: users.inviteEnabled,
          inviteCode: users.inviteCode,
          inviteCount: users.inviteCount,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(users.createdAt);
      
      return allUsers.map(user => ({
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        inviteEnabled: Boolean(user.inviteEnabled),
        inviteCode: user.inviteCode,
        inviteCount: user.inviteCount || 0,
        createdAt: user.createdAt,
      }));
    }),
});
