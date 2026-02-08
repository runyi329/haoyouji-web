// 邀请系统API
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import QRCode from 'qrcode';

// 生成6位随机邀请码
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混淆的字符 (0,O,1,I,L)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const inviteRouter = router({
  // 获取当前用户的邀请信息
  getMyInviteInfo: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user!.id;
    
    const [user] = await db
      .select({
        id: users.id,
        inviteCode: users.inviteCode,
        inviteLink: users.inviteLink,
        inviteCount: users.inviteCount,
        invitedByUserId: users.invitedByUserId,
      })
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
    }
    
    // 如果用户还没有邀请码,生成一个
    if (!user.inviteCode) {
      const newCode = generateInviteCode();
      const newLink = `https://jiangyuchen.cn/login?invite=${newCode}`;
      
      await db
        .update(users)
        .set({
          inviteCode: newCode,
          inviteLink: newLink,
        })
        .where(eq(users.id, userId));
      
      user.inviteCode = newCode;
      user.inviteLink = newLink;
    }
    
    return {
      inviteCode: user.inviteCode,
      inviteLink: user.inviteLink,
      inviteCount: user.inviteCount || 0,
      invitedByUserId: user.invitedByUserId,
    };
  }),
  
  // 生成邀请二维码
  generateQRCode: protectedProcedure
    .input(z.object({
      inviteCode: z.string(),
    }))
    .query(async ({ input }) => {
      const inviteLink = `https://jiangyuchen.cn/login?invite=${input.inviteCode}`;
      
      try {
        // 生成二维码 (返回Data URL)
        const qrCodeDataUrl = await QRCode.toDataURL(inviteLink, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
        
        return {
          qrCodeDataUrl,
          inviteLink,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "生成二维码失败",
        });
      }
    }),
  
  // 验证邀请码
  validateInviteCode: publicProcedure
    .input(z.object({
      inviteCode: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      
      const [inviter] = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
        })
        .from(users)
        .where(eq(users.inviteCode, input.inviteCode));
      
      if (!inviter) {
        return {
          valid: false,
          message: "邀请码不存在",
        };
      }
      
      return {
        valid: true,
        inviter: {
          id: inviter.id,
          name: inviter.name || inviter.username,
        },
      };
    }),
  
  // 获取我邀请的用户列表
  getMyInvitedUsers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user!.id;
    
    const invitedUsers = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        avatar: users.avatar,
        invitedAt: users.invitedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.invitedByUserId, userId))
      .orderBy(sql`${users.invitedAt} DESC`);
    
    return invitedUsers;
  }),
  
  // 重新生成邀请码 (管理员功能)
  regenerateInviteCode: protectedProcedure
    .input(z.object({
      userId: z.number().optional(), // 如果不提供,则为当前用户
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const targetUserId = input.userId || ctx.user!.id;
      
      // 如果是为其他用户生成,需要管理员权限
      if (input.userId && ctx.user!.role !== 'super_admin') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "只有管理员可以为其他用户重新生成邀请码",
        });
      }
      
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        const newCode = generateInviteCode();
        const newLink = `https://jiangyuchen.cn/login?invite=${newCode}`;
        
        try {
          await db
            .update(users)
            .set({
              inviteCode: newCode,
              inviteLink: newLink,
            })
            .where(eq(users.id, targetUserId));
          
          return {
            success: true,
            inviteCode: newCode,
            inviteLink: newLink,
          };
        } catch (error: any) {
          if (error.message?.includes('Duplicate entry')) {
            attempts++;
            continue;
          }
          throw error;
        }
      }
      
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "生成邀请码失败,请重试",
      });
    }),
});

  // 获取我邀请的好友列表及其人脉统计
  getMyInvitedFriends: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user!.id;
    
    // 查询被当前用户邀请的所有用户
    const invitedUsers = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        avatarUrl: users.avatarUrl,
        invitedAt: users.invitedAt,
      })
      .from(users)
      .where(eq(users.invitedByUserId, userId));
    
    // 为每个被邀请用户获取人脉统计
    const friendsWithStats = await Promise.all(
      invitedUsers.map(async (friend) => {
        // 获取该用户自己的人脉数
        const [ownContactsResult] = await db.execute(sql`
          SELECT COUNT(*) as count 
          FROM contacts 
          WHERE parent_user_id = ${friend.id}
        `);
        const ownContactsCount = Number(ownContactsResult?.count || 0);
        
        // 获取该用户共享给他的人脉数
        const [sharedContactsResult] = await db.execute(sql`
          SELECT COUNT(DISTINCT c.id) as count
          FROM contacts c
          INNER JOIN contact_shares cs ON c.id = cs.contact_id
          WHERE cs.shared_with_user_id = ${friend.id}
        `);
        const sharedContactsCount = Number(sharedContactsResult?.count || 0);
        
        // 全部人脉数 = 自己的 + 共享的
        const totalContactsCount = ownContactsCount + sharedContactsCount;
        
        return {
          id: friend.id,
          username: friend.username,
          name: friend.name,
          avatarUrl: friend.avatarUrl,
          invitedAt: friend.invitedAt,
          ownContactsCount,
          sharedContactsCount,
          totalContactsCount,
        };
      })
    );
    
    return friendsWithStats;
  }),
