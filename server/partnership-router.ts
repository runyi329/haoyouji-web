import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { 
  partnerships, 
  partnershipWorkGroups, 
  partnershipMembers, 
  partnershipWorkGroupMembers,
  users 
} from "../drizzle/schema";
import { eq, and, inArray, like, or, sql } from "drizzle-orm";

export const partnershipRouter = router({
  // 搜索可邀请的用户（排除已是成员的用户）
  searchUsers: protectedProcedure
    .input(z.object({
      partnershipId: z.number(),
      query: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const { partnershipId, query } = input;
      const db = await getDb();

      // 获取已是成员的用户ID列表
      const existingMembers = await db
        .select({ userId: partnershipMembers.userId })
        .from(partnershipMembers)
        .where(eq(partnershipMembers.partnershipId, partnershipId));

      const existingUserIds = existingMembers.map(m => m.userId);

      // 搜索所有用户（模糊搜索username、name、email）
      let allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
        })
        .from(users)
        .where(
          query.trim() 
            ? or(
                like(users.username, `%${query}%`),
                like(users.name, `%${query}%`),
                like(users.email, `%${query}%`)
              )
            : undefined
        )
        .limit(20);

      // 过滤掉已是成员的用户
      const filteredUsers = allUsers.filter(user => !existingUserIds.includes(user.id));

      return filteredUsers;
    }),

  // 添加成员到企业和工作群
  addMember: protectedProcedure
    .input(z.object({
      partnershipId: z.number(),
      userId: z.number(),
      workGroupIds: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const { partnershipId, userId, workGroupIds } = input;

      const db = await getDb();
      // 检查用户是否已是成员
      const existingMember = await db
        .select()
        .from(partnershipMembers)
        .where(
          and(
            eq(partnershipMembers.partnershipId, partnershipId),
            eq(partnershipMembers.userId, userId)
          )
        )
        .limit(1);

      if (existingMember.length > 0) {
        throw new Error("该用户已是企业成员");
      }

      // 添加成员到企业
      await db.insert(partnershipMembers).values({
        partnershipId,
        userId,
        role: "member",
      });

      // 添加成员到工作群
      if (workGroupIds.length > 0) {
        const workGroupMemberValues = workGroupIds.map(workGroupId => ({
          workGroupId,
          userId,
        }));

        await db.insert(partnershipWorkGroupMembers).values(workGroupMemberValues);
      }

      return { success: true };
    }),

  // 获取企业成员列表
  getMembers: protectedProcedure
    .input(z.object({
      partnershipId: z.number(),
    }))
    .query(async ({ input }) => {
      const { partnershipId } = input;
      const db = await getDb();

      // 获取成员列表
      const members = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
          role: partnershipMembers.role,
          joinedAt: partnershipMembers.joinedAt,
        })
        .from(partnershipMembers)
        .innerJoin(users, eq(partnershipMembers.userId, users.id))
        .where(eq(partnershipMembers.partnershipId, partnershipId));

      // 获取每个成员所属的工作群
      const memberIds = members.map(m => m.id);
      
      if (memberIds.length === 0) {
        return [];
      }

      const memberWorkGroups = await db
        .select({
          userId: partnershipWorkGroupMembers.userId,
          workGroupId: partnershipWorkGroupMembers.workGroupId,
          workGroupName: partnershipWorkGroups.name,
        })
        .from(partnershipWorkGroupMembers)
        .innerJoin(
          partnershipWorkGroups,
          eq(partnershipWorkGroupMembers.workGroupId, partnershipWorkGroups.id)
        )
        .where(inArray(partnershipWorkGroupMembers.userId, memberIds));

      // 组装数据
      const membersWithWorkGroups = members.map(member => {
        const workGroups = memberWorkGroups
          .filter(wg => wg.userId === member.id)
          .map(wg => ({
            id: wg.workGroupId,
            name: wg.workGroupName,
          }));

        return {
          ...member,
          workGroups,
        };
      });

      return membersWithWorkGroups;
    }),

  // 获取工作群列表
  getWorkGroups: protectedProcedure
    .input(z.object({
      partnershipId: z.number(),
    }))
    .query(async ({ input }) => {
      const { partnershipId } = input;
      const db = await getDb();

      const workGroups = await db
        .select({
          id: partnershipWorkGroups.id,
          name: partnershipWorkGroups.name,
          description: partnershipWorkGroups.description,
        })
        .from(partnershipWorkGroups)
        .where(eq(partnershipWorkGroups.partnershipId, partnershipId));

      return workGroups;
    }),

  // 移除成员
  removeMember: protectedProcedure
    .input(z.object({
      partnershipId: z.number(),
      userId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { partnershipId, userId } = input;
      const db = await getDb();

      // 删除成员-企业关联
      await db
        .delete(partnershipMembers)
        .where(
          and(
            eq(partnershipMembers.partnershipId, partnershipId),
            eq(partnershipMembers.userId, userId)
          )
        );

      // 删除成员-工作群关联（通过工作群ID）
      const workGroups = await db
        .select({ id: partnershipWorkGroups.id })
        .from(partnershipWorkGroups)
        .where(eq(partnershipWorkGroups.partnershipId, partnershipId));

      const workGroupIds = workGroups.map(wg => wg.id);

      if (workGroupIds.length > 0) {
        await db
          .delete(partnershipWorkGroupMembers)
          .where(
            and(
              inArray(partnershipWorkGroupMembers.workGroupId, workGroupIds),
              eq(partnershipWorkGroupMembers.userId, userId)
            )
          );
      }

      return { success: true };
    }),
});
