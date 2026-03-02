import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { 
  partnerships, 
  partnershipWorkGroups, 
  partnershipMembers, 
  partnershipWorkGroupMembers,
  users,
  contacts,
  contactSharingConnections,
  contactInteractions,
  contactTags,
  personalContactTags,
  ledgers,
  ledgerMembers,
  ledgerRecords
} from "../drizzle/schema";
import { eq, and, inArray, like, or, sql, asc } from "drizzle-orm";
import { mysqlTable, int, varchar, text, timestamp } from "drizzle-orm/mysql-core";

// Dashboard tables (inline definition to avoid schema regeneration)
const partnershipDashboardActivities = mysqlTable("partnership_dashboard_activities", {
  id: int().autoincrement().notNull(),
  partnershipId: int("partnership_id").notNull().default(1),
  userName: varchar("user_name", { length: 100 }).notNull(),
  action: varchar({ length: 100 }).notNull(),
  timeText: varchar("time_text", { length: 100 }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
});

const partnershipDashboardAlerts = mysqlTable("partnership_dashboard_alerts", {
  id: int().autoincrement().notNull(),
  partnershipId: int("partnership_id").notNull().default(1),
  type: varchar({ length: 20 }).notNull().default("warning"),
  message: text().notNull(),
  actionText: varchar("action_text", { length: 255 }).notNull().default(""),
  sortOrder: int("sort_order").notNull().default(0),
});

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

      // 为每个成员查询统计数据
      const membersWithStats = await Promise.all(members.map(async (member) => {
        const workGroups = memberWorkGroups
          .filter(wg => wg.userId === member.id)
          .map(wg => ({
            id: wg.workGroupId,
            name: wg.workGroupName,
          }));

        // 查询我的人脉数（作为parentUserId创建的联系人）
        const ownContactsResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(contacts)
          .where(eq(contacts.parentUserId, member.id));
        const ownContactsCount = ownContactsResult[0]?.count || 0;

        // 查询共享给我的人脉数（作为receiverId且状态为active的连接）
        const sharedContactsResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(contactSharingConnections)
          .where(
            and(
              eq(contactSharingConnections.receiverId, member.id),
              eq(contactSharingConnections.status, 'active')
            )
          );
        const sharedContactsCount = sharedContactsResult[0]?.count || 0;

        // 全部人脉 = 我的 + 共享
        const totalContactsCount = ownContactsCount + sharedContactsCount;

        // 查询标签数（统计用户创建的全局标签和个人标签总数）
        // 1. 全局标签（contactTags表）
        const globalTagsResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(contactTags)
          .where(eq(contactTags.parentUserId, member.id));
        const globalTagsCount = globalTagsResult[0]?.count || 0;

        // 2. 个人标签（personalContactTags表）- 统计唯一标签名称
        const personalTagsResult = await db
          .select({ name: personalContactTags.name })
          .from(personalContactTags)
          .where(eq(personalContactTags.parentUserId, member.id));
        const uniquePersonalTags = new Set(personalTagsResult.map(t => t.name));
        const personalTagsCount = uniquePersonalTags.size;

        // 总标签数 = 全局标签 + 唯一个人标签
        const tagsCount = globalTagsCount + personalTagsCount;

        // 查询联络数（我的联系人的互动记录总数）
        const myContactIds = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(eq(contacts.parentUserId, member.id));
        
        let interactionsCount = 0;
        if (myContactIds.length > 0) {
          const contactIds = myContactIds.map(c => c.id);
          const interactionsResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(contactInteractions)
            .where(inArray(contactInteractions.contactId, contactIds));
          interactionsCount = interactionsResult[0]?.count || 0;
        }

        // 查询账本数（用户参与的所有账本，包括自己创建的和别人加入的）
        const ledgerCountResult = await db
          .select({ count: sql<number>`count(distinct ${ledgerMembers.ledgerId})` })
          .from(ledgerMembers)
          .where(eq(ledgerMembers.userId, member.id));
        const ledgerCount = ledgerCountResult[0]?.count || 0;

        // 查询账目数（用户参与的所有账本中的账目总数）
        const memberLedgerIds = await db
          .select({ ledgerId: ledgerMembers.ledgerId })
          .from(ledgerMembers)
          .where(eq(ledgerMembers.userId, member.id));
        
        let recordCount = 0;
        if (memberLedgerIds.length > 0) {
          const ledgerIdList = memberLedgerIds.map(l => l.ledgerId);
          const recordCountResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(ledgerRecords)
            .where(
              and(
                inArray(ledgerRecords.ledgerId, ledgerIdList),
                sql`${ledgerRecords.deletedAt} IS NULL`
              )
            );
          recordCount = recordCountResult[0]?.count || 0;
        }

        // ===== 6个成长里程碑（基于已有查询数据推断，不新增数据库查询） =====
        const hasProfile = !!(member.email) || !!(member.avatar);
        const hasContact = ownContactsCount > 0;
        const hasShareContact = sharedContactsCount > 0;
        const hasLedger = ledgerCount > 0;
        const hasShareBook = memberLedgerIds.length > 1 || recordCount > 0;
        const hasInvite = false; // 需要单独查询inviteCount，先安全地默认false

        // 安全地查询inviteCount
        let inviteFlag = false;
        try {
          const inviteResult = await db
            .select({ inviteCount: users.inviteCount })
            .from(users)
            .where(eq(users.id, member.id))
            .limit(1);
          inviteFlag = (inviteResult[0]?.inviteCount || 0) > 0;
        } catch (e) {
          // 查询失败时保持false
        }

        return {
          ...member,
          workGroups,
          ownContactsCount,
          sharedContactsCount,
          totalContactsCount,
          tagsCount,
          interactionsCount,
          ledgerCount,
          recordCount,
          hasProfile,
          hasContact,
          hasShareContact,
          hasLedger,
          hasShareBook,
          hasInvite: inviteFlag,
        };
      }));

      return membersWithStats;
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

  // ========== Dashboard 管理 API ==========

  // 获取最新动态列表
  getDashboardActivities: protectedProcedure
    .input(z.object({
      partnershipId: z.number().default(1),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const activities = await db
        .select()
        .from(partnershipDashboardActivities)
        .where(eq(partnershipDashboardActivities.partnershipId, input.partnershipId))
        .orderBy(asc(partnershipDashboardActivities.sortOrder));
      return activities;
    }),

  // 保存最新动态（先删后插）
  saveDashboardActivities: protectedProcedure
    .input(z.object({
      partnershipId: z.number().default(1),
      activities: z.array(z.object({
        userName: z.string(),
        action: z.string(),
        timeText: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // 先删除旧数据
      await db
        .delete(partnershipDashboardActivities)
        .where(eq(partnershipDashboardActivities.partnershipId, input.partnershipId));
      // 插入新数据
      if (input.activities.length > 0) {
        const values = input.activities.map((a, index) => ({
          partnershipId: input.partnershipId,
          userName: a.userName,
          action: a.action,
          timeText: a.timeText,
          sortOrder: index + 1,
        }));
        await db.insert(partnershipDashboardActivities).values(values);
      }
      return { success: true };
    }),

  // 获取预警雷达列表
  getDashboardAlerts: protectedProcedure
    .input(z.object({
      partnershipId: z.number().default(1),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const alerts = await db
        .select()
        .from(partnershipDashboardAlerts)
        .where(eq(partnershipDashboardAlerts.partnershipId, input.partnershipId))
        .orderBy(asc(partnershipDashboardAlerts.sortOrder));
      return alerts;
    }),

  // 保存预警雷达（先删后插）
  saveDashboardAlerts: protectedProcedure
    .input(z.object({
      partnershipId: z.number().default(1),
      alerts: z.array(z.object({
        type: z.string(),
        message: z.string(),
        actionText: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // 先删除旧数据
      await db
        .delete(partnershipDashboardAlerts)
        .where(eq(partnershipDashboardAlerts.partnershipId, input.partnershipId));
      // 插入新数据
      if (input.alerts.length > 0) {
        const values = input.alerts.map((a, index) => ({
          partnershipId: input.partnershipId,
          type: a.type,
          message: a.message,
          actionText: a.actionText,
          sortOrder: index + 1,
        }));
        await db.insert(partnershipDashboardAlerts).values(values);
      }
      return { success: true };
    }),
});
