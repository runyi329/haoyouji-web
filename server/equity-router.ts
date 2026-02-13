import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as dbEquity from "./db-equity";

export const equityRouter = router({
  // 获取当前用户的股权信息
  getMyEquity: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbEquity.calculateUserEquity(ctx.user.id);
    }),
  
  // 获取所有股东的股权信息（管理员）
  getAllShareholders: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      return await dbEquity.getAllShareholdersEquity();
    }),
  
  // 获取所有投资记录（管理员）
  getAllInvestments: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      return await dbEquity.getAllInvestments();
    }),
  
  // 添加投资记录（管理员）
  addInvestment: protectedProcedure
    .input(z.object({
      userId: z.number(),
      investorName: z.string().optional(),
      investorIdCard: z.string().optional(),
      amount: z.number().positive(),
      investmentDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      return await dbEquity.addInvestment(input.userId, input.investorName, input.investorIdCard, input.amount, input.investmentDate, input.notes);
    }),
  
  // 更新投资记录（管理员）
  updateInvestment: protectedProcedure
    .input(z.object({
      id: z.number(),
      amount: z.number().positive(),
      investorName: z.string().optional(),
      investorIdCard: z.string().optional(),
      investmentDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      return await dbEquity.updateInvestment(input.id, input.amount, input.investorName, input.investorIdCard, input.investmentDate, input.notes);
    }),
  
  // 删除投资记录（管理员）
  deleteInvestment: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      return await dbEquity.deleteInvestment(input.id);
    }),
  
  // 获取股权规则配置（管理员）
  getRules: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      return await dbEquity.getEquityRules();
    }),
  
  // 更新股权规则（管理员）
  updateRule: protectedProcedure
    .input(z.object({
      ruleKey: z.string(),
      ruleValue: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      return await dbEquity.updateEquityRule(input.ruleKey, input.ruleValue);
    }),

  // 批量更新股权规则（管理员）
  updateRules: protectedProcedure
    .input(z.object({
      rules: z.array(z.object({
        ruleKey: z.string(),
        ruleValue: z.number(),
        ruleDescription: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      console.log(`[updateRules] Received ${input.rules.length} rules to update`);
      const results = [];
      for (const rule of input.rules) {
        console.log(`[updateRules] Processing: key=${rule.ruleKey}, value=${rule.ruleValue}, desc=${rule.ruleDescription}`);
        try {
          await dbEquity.upsertEquityRule(rule.ruleKey, rule.ruleValue, rule.ruleDescription);
          results.push({ key: rule.ruleKey, status: 'ok' });
        } catch (err: any) {
          console.error(`[updateRules] Failed for ${rule.ruleKey}:`, err.message);
          results.push({ key: rule.ruleKey, status: 'error', message: err.message });
        }
      }
      const failed = results.filter(r => r.status === 'error');
      if (failed.length > 0) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `部分规则保存失败: ${failed.map(f => f.key).join(', ')}` });
      }
      return { success: true };
    }),

  // 删除股权规则（管理员）
  deleteRule: protectedProcedure
    .input(z.object({
      ruleKey: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      return await dbEquity.deleteEquityRule(input.ruleKey);
    }),

  // 获取所有规则详情（包含描述）
  getRulesDetail: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      return await dbEquity.getEquityRulesDetail();
    }),
});
