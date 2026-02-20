import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createWorkGroup,
  getUserWorkGroups,
  getWorkGroupById,
  updateWorkGroup,
  archiveWorkGroup,
  getWorkGroupMembers,
  createWorkGroupMember,
  checkWorkGroupPermission,
} from './db-work-groups';

/**
 * 脉动节点工作平台 - 工作群tRPC路由
 */

export const workGroupsRouter = router({
  // 创建工作群
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1, '工作群名称不能为空'),
      description: z.string().optional(),
      icon: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      
      const result = await createWorkGroup({
        name: input.name.trim(),
        description: input.description?.trim(),
        icon: input.icon,
        createdBy: userId,
        ownerId: userId,
      });
      
      return { success: true, data: result };
    }),

  // 获取用户的所有工作群
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id;
    const groups = await getUserWorkGroups(userId);
    return { success: true, data: groups };
  }),

  // 获取工作群详情
  getById: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      
      // 检查权限
      const hasPermission = await checkWorkGroupPermission(input.id, userId);
      if (!hasPermission) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权访问此工作群' });
      }
      
      const group = await getWorkGroupById(input.id);
      
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '工作群不存在' });
      }
      
      return { success: true, data: group };
    }),

  // 更新工作群信息
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      
      // 检查权限
      const hasPermission = await checkWorkGroupPermission(input.id, userId);
      if (!hasPermission) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权修改此工作群' });
      }
      
      const result = await updateWorkGroup(input.id, {
        name: input.name?.trim(),
        description: input.description?.trim(),
        icon: input.icon,
      });
      
      return { success: true, data: result };
    }),

  // 删除（归档）工作群
  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      
      // 检查权限
      const hasPermission = await checkWorkGroupPermission(input.id, userId);
      if (!hasPermission) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权删除此工作群' });
      }
      
      const result = await archiveWorkGroup(input.id);
      
      return { success: true, data: result };
    }),

  // 获取工作群中的所有人员
  getMembers: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      
      // 检查权限
      const hasPermission = await checkWorkGroupPermission(input.id, userId);
      if (!hasPermission) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权访问此工作群' });
      }
      
      const members = await getWorkGroupMembers(input.id);
      
      return { success: true, data: members };
    }),

  // 在工作群中添加人员（创建账本）
  addMember: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      name: z.string().min(1, '人员名称不能为空'),
      description: z.string().optional(),
      icon: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      
      // 检查权限
      const hasPermission = await checkWorkGroupPermission(input.groupId, userId);
      if (!hasPermission) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权在此工作群中添加人员' });
      }
      
      const result = await createWorkGroupMember({
        groupId: input.groupId,
        name: input.name.trim(),
        description: input.description?.trim(),
        icon: input.icon,
        createdBy: userId,
        ownerId: userId,
      });
      
      return { success: true, data: result };
    }),
});
