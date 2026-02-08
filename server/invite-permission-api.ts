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
          invitedByUserId: users.invitedByUserId,
          invitedAt: users.invitedAt,
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
        invitedByUserId: user.invitedByUserId,
        invitedAt: user.invitedAt,
        createdAt: user.createdAt,
      }));
    }),
});

  // 更新用户的推荐人 (仅管理员)
  updateUserReferrer: protectedProcedure
    .input(z.object({
      userId: z.number(),
      referrerId: z.number().nullable(), // null表示清除推荐关系
    }))
    .mutation(async ({ ctx, input }) => {
      // 检查权限: 只有super_admin可以操作
      if (ctx.user!.role !== 'super_admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "只有管理员可以修改推荐关系",
        });
      }
      
      const db = await getDb();
      
      // 检查用户是否存在
      const [targetUser] = await db
        .select({ id: users.id, invitedByUserId: users.invitedByUserId })
        .from(users)
        .where(eq(users.id, input.userId));
      
      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "目标用户不存在",
        });
      }
      
      // 如果是清除推荐关系
      if (input.referrerId === null) {
        // 如果原来有推荐人,需要减少原推荐人的inviteCount
        if (targetUser.invitedByUserId) {
          await db
            .update(users)
            .set({
              inviteCount: sql`GREATEST(0, ${users.inviteCount} - 1)`,
            })
            .where(eq(users.id, targetUser.invitedByUserId));
        }
        
        // 清除推荐关系
        await db
          .update(users)
          .set({
            invitedByUserId: null,
            invitedAt: null,
          })
          .where(eq(users.id, input.userId));
        
        return {
          success: true,
          message: "已清除推荐关系",
        };
      }
      
      // 检查推荐人是否存在
      const [referrer] = await db
        .select({ id: users.id, username: users.username, name: users.name })
        .from(users)
        .where(eq(users.id, input.referrerId));
      
      if (!referrer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "推荐人不存在",
        });
      }
      
      // 防止自己推荐自己
      if (input.userId === input.referrerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不能将自己设置为推荐人",
        });
      }
      
      // 防止循环推荐 - 检查推荐人是否被目标用户推荐
      const [circularCheck] = await db
        .select({ invitedByUserId: users.invitedByUserId })
        .from(users)
        .where(eq(users.id, input.referrerId));
      
      if (circularCheck?.invitedByUserId === input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不能形成循环推荐关系",
        });
      }
      
      // 如果原来有推荐人,需要减少原推荐人的inviteCount
      if (targetUser.invitedByUserId && targetUser.invitedByUserId !== input.referrerId) {
        await db
          .update(users)
          .set({
            inviteCount: sql`GREATEST(0, ${users.inviteCount} - 1)`,
          })
          .where(eq(users.id, targetUser.invitedByUserId));
      }
      
      // 更新推荐关系
      await db
        .update(users)
        .set({
          invitedByUserId: input.referrerId,
          invitedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(users.id, input.userId));
      
      // 增加新推荐人的inviteCount(如果原来的推荐人和新推荐人不同)
      if (targetUser.invitedByUserId !== input.referrerId) {
        await db
          .update(users)
          .set({
            inviteCount: sql`${users.inviteCount} + 1`,
          })
          .where(eq(users.id, input.referrerId));
      }
      
      return {
        success: true,
        message: `已将推荐人设置为: ${referrer.name || referrer.username}`,
        referrer: {
          id: referrer.id,
          username: referrer.username,
          name: referrer.name,
        },
      };
    }),
  
  // 获取用户的推荐人信息 (仅管理员)
  getUserReferrer: protectedProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      // 检查权限: 只有super_admin可以查询
      if (ctx.user!.role !== 'super_admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "只有管理员可以查询推荐关系",
        });
      }
      
      const db = await getDb();
      
      // 查询用户及其推荐人信息
      const [userWithReferrer] = await db
        .select({
          userId: users.id,
          username: users.username,
          name: users.name,
          invitedByUserId: users.invitedByUserId,
          invitedAt: users.invitedAt,
        })
        .from(users)
        .where(eq(users.id, input.userId));
      
      if (!userWithReferrer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "用户不存在",
        });
      }
      
      // 如果有推荐人,查询推荐人详细信息
      let referrerInfo = null;
      if (userWithReferrer.invitedByUserId) {
        const [referrer] = await db
          .select({
            id: users.id,
            username: users.username,
            name: users.name,
            inviteCode: users.inviteCode,
          })
          .from(users)
          .where(eq(users.id, userWithReferrer.invitedByUserId));
        
        if (referrer) {
          referrerInfo = {
            id: referrer.id,
            username: referrer.username,
            name: referrer.name,
            inviteCode: referrer.inviteCode,
          };
        }
      }
      
      return {
        userId: userWithReferrer.userId,
        username: userWithReferrer.username,
        name: userWithReferrer.name,
        invitedAt: userWithReferrer.invitedAt,
        referrer: referrerInfo,
      };
    }),
});
