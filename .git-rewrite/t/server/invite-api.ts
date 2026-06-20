// 邀请系统API
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { users, contacts, contactSharingConnections, contactInteractions, contactTags, personalContactTags } from "../drizzle/schema";
import { eq, and, sql, inArray, count } from "drizzle-orm";
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

    // 实时统计实际推荐人数（避免 invite_count 缓存字段因删除用户等操作导致数据不一致）
    const [countResult] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.invitedByUserId, userId));
    const realInviteCount = Number(countResult?.count ?? 0);
    
    return {
      inviteCode: user.inviteCode,
      inviteLink: user.inviteLink,
      inviteCount: realInviteCount,
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

  // 获取我邀请的好友列表及其人脉统计
  getMyInvitedFriends: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user!.id;
    
    console.log('[getMyInvitedFriends] 开始查询，当前用户ID:', userId);
    
    // 1. 查询被当前用户邀请的所有用户（使用正确的字段名）
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
    
    console.log('[getMyInvitedFriends] 查询到邀请用户数:', invitedUsers.length);
    
    if (invitedUsers.length === 0) {
      return [];
    }
    
    // 2. 为每个被邀请用户获取人脉统计
    const friendsWithStats = await Promise.all(
      invitedUsers.map(async (friend) => {
        // 2a. 获取该用户自己的人脉数（使用drizzle ORM查询，和getContactCounts一样的方式）
        const mineResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(contacts)
          .where(eq(contacts.parentUserId, friend.id));
        const ownCount = mineResult[0]?.count || 0;
        
        // 2b. 获取共享给该用户的人脉数（通过contact_sharing_connections表）
        const sharingConnections = await db
          .select({ sharerId: contactSharingConnections.sharerId })
          .from(contactSharingConnections)
          .where(
            and(
              eq(contactSharingConnections.receiverId, friend.id),
              eq(contactSharingConnections.status, 'active')
            )
          );
        
        let sharedCount = 0;
        if (sharingConnections.length > 0) {
          const sharerIds = sharingConnections.map(conn => conn.sharerId);
          const sharedResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(contacts)
            .where(inArray(contacts.parentUserId, sharerIds));
          sharedCount = sharedResult[0]?.count || 0;
        }
        
        const totalCount = ownCount + sharedCount;
        
        // 2c. 获取该用户的标签总数（全局标签 + 个人标签）
        // 全局标签：contact_tags表中该用户创建的标签
        const globalTagsResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(contactTags)
          .where(eq(contactTags.parentUserId, friend.id));
        const globalTagsCount = globalTagsResult[0]?.count || 0;
        
        // 个人标签：personal_contact_tags表中该用户创建的标签
        const personalTagsResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(personalContactTags)
          .where(eq(personalContactTags.parentUserId, friend.id));
        const personalTagsCount = personalTagsResult[0]?.count || 0;
        
        const totalTagsCount = globalTagsCount + personalTagsCount;
        
        // 2d. 获取该用户的联络记录总数
        // 首先获取该用户的所有人脉ID
        const userContactIds = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(eq(contacts.parentUserId, friend.id));
        
        let interactionsCount = 0;
        if (userContactIds.length > 0) {
          const contactIds = userContactIds.map(c => c.id);
          const interactionsResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(contactInteractions)
            .where(inArray(contactInteractions.contactId, contactIds));
          interactionsCount = interactionsResult[0]?.count || 0;
        }
        
        console.log(`[getMyInvitedFriends] 用户 ${friend.username}(${friend.id}): 自己=${ownCount}, 共享=${sharedCount}, 全部=${totalCount}, 标签=${totalTagsCount}, 联络=${interactionsCount}`);
        
        return {
          id: friend.id,
          username: friend.username,
          name: friend.name,
          avatar: friend.avatar,
          invitedAt: friend.invitedAt,
          createdAt: friend.createdAt,
          ownContactsCount: ownCount,
          sharedContactsCount: sharedCount,
          totalContactsCount: totalCount,
          tagsCount: totalTagsCount,
          interactionsCount: interactionsCount,
        };
      })
    );
    
    console.log('[getMyInvitedFriends] 查询完成，返回数据:', friendsWithStats.length, '条');
    
    return friendsWithStats;
  }),
});
