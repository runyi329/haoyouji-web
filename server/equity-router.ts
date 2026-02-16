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
  
  // 获取所有股东的股权信息（管理员），附带席位编号
  getAllShareholders: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      const shareholders = await dbEquity.getAllShareholdersEquity();
      const seatMap = await dbEquity.getAllSeatNumbers();
      return shareholders.map(sh => ({
        ...sh,
        seatNumber: seatMap.get(sh.userId) || 0,
      }));
    }),
  
  // 获取所有投资记录（管理员），附带席位编号
  getAllInvestments: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      const investments = await dbEquity.getAllInvestments();
      const seatMap = await dbEquity.getAllSeatNumbers();
      return investments.map(inv => ({
        ...inv,
        seatNumber: inv.userId ? (seatMap.get(inv.userId) || 0) : 0,
      }));
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

  // 获取股份池配置（所有登录用户可访问，用于前端展示公司股权架构饼图）
  getPoolConfig: protectedProcedure
    .query(async () => {
      return await dbEquity.getEquityRulesDetail();
    }),

  // 获取增强的股权信息（包含估值、排名、席位编号、动态杠杆等）
  getMyEquityEnhanced: protectedProcedure
    .query(async ({ ctx }) => {
      const equity = await dbEquity.calculateUserEquity(ctx.user.id);
      const rules = await dbEquity.getEquityRules();
      const companyValuation = rules['company_valuation'] || 5000000;
      const estimatedValue = (equity.totalEquity / 100) * companyValuation;
      const ranking = await dbEquity.getShareholderRanking(ctx.user.id);
      const poolStatus = await dbEquity.getPoolStatus();
      
      // 获取席位编号和动态杠杆
      const seat = await dbEquity.getUserSeatNumber(ctx.user.id);
      const dynamicLeverage = seat.seatNumber > 0 
        ? dbEquity.calculateDynamicLeverage(seat.seatNumber, seat.totalSeats)
        : null;
      
      return {
        ...equity,
        estimatedValue,
        companyValuation,
        ranking,
        poolStatus,
        seat,
        dynamicLeverage,
      };
    }),

  // 获取估值历史
  getValuationHistory: protectedProcedure
    .query(async () => {
      return await dbEquity.getValuationHistory();
    }),

  // 获取最近动态
  getRecentActivities: protectedProcedure
    .query(async () => {
      return await dbEquity.getRecentActivities(10);
    }),
  // 获取用户晋升数据统计
  getPromotionStats: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbEquity.getUserPromotionStats(ctx.user.id);
    }),
  // 获取我邀请的用户统计
  getMyInvitedUsersStats: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbEquity.getMyInvitedUsersStats(ctx.user.id);
    }),
});

  // 获取用户的历史周报
  getWeeklyReports: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbEquity.getUserWeeklyReports(ctx.user.id);
    }),
