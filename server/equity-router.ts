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

  // 获取用户的历史周报
  getWeeklyReports: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbEquity.getUserWeeklyReports(ctx.user.id);
    }),

  // ===== 账本股权管理（59号账本蓄水池股东专用）=====

  // 获取账本内所有股权记录（按成员分组）
  getLedgerShares: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 确保regNo字段存在（兼容旧表）
      try { await (conn as any).execute(`ALTER TABLE equity_shares ADD COLUMN IF NOT EXISTS regNo VARCHAR(10) DEFAULT NULL`); } catch(e) {}
      const [rows] = await (conn as any).execute(
        `SELECT es.id, es.userId, es.memberNickname, es.shareCount, es.shareType, es.grantDate, es.reason, es.regNo, es.createdAt,
                COALESCE(es.annualRate, 6.00) as annualRate,
                sn.shareNo
         FROM equity_shares es
         LEFT JOIN shareholder_numbers sn ON sn.ledgerId=es.ledgerId AND sn.userId=es.userId
         WHERE es.ledgerId=?
         ORDER BY COALESCE(sn.shareNo, '9999'), es.userId, es.grantDate DESC, es.id DESC`,
        [input.ledgerId]
      );
      return rows as any[];
    }),

  // 获取账本内某成员的股权记录
  getMemberShares: protectedProcedure
    .input(z.object({ ledgerId: z.number(), userId: z.number() }))
    .query(async ({ input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [rows] = await (conn as any).execute(
        `SELECT es.id, es.userId, es.memberNickname, es.shareCount, es.shareType, es.grantDate, es.reason, es.regNo, es.createdAt,
                COALESCE(es.annualRate, 6.00) as annualRate,
                sn.shareNo
         FROM equity_shares es
         LEFT JOIN shareholder_numbers sn ON sn.ledgerId=es.ledgerId AND sn.userId=es.userId
         WHERE es.ledgerId=? AND es.userId=? ORDER BY es.grantDate DESC, es.id DESC`,
        [input.ledgerId, input.userId]
      );
      return rows as any[];
    }),

  // 添加股权记录（仅owner/admin可操作）
  addLedgerShare: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      userId: z.number(),
      memberNickname: z.string(),
      shareCount: z.number().positive(),
      shareType: z.string().default('资金股'),
      grantDate: z.string(), // YYYY-MM-DD
      reason: z.string(),
      regNo: z.string().optional(), // 股权登记编号，可选，不填则自动生成
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 验证操作者是账本owner或admin
      const [members] = await (conn as any).execute(
        `SELECT role FROM ledger_members WHERE ledgerId=? AND userId=?`,
        [input.ledgerId, ctx.user.id]
      );
      const member = (members as any[])[0];
      if (!member || !['owner','admin'].includes(member.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可操作' });
      }
      // 生成6位股权登记编号（数字+字母混合），如未提供则自动生成
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const autoRegNo = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const finalRegNo = input.regNo?.trim() || autoRegNo;
      // 确保regNo字段存在
      try { await (conn as any).execute(`ALTER TABLE equity_shares ADD COLUMN IF NOT EXISTS regNo VARCHAR(10) DEFAULT NULL`); } catch(e) {}
      const [result] = await (conn as any).execute(
        `INSERT INTO equity_shares (ledgerId, userId, memberNickname, shareCount, shareType, grantDate, reason, regNo, createdBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.ledgerId, input.userId, input.memberNickname, input.shareCount, input.shareType || '资金股', input.grantDate, input.reason, finalRegNo, ctx.user.id]
      );
      return { id: (result as any).insertId, regNo: finalRegNo };
    }),

  // 删除股权记录（仅owner/admin可操作）
  deleteLedgerShare: protectedProcedure
    .input(z.object({ id: z.number(), ledgerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [members] = await (conn as any).execute(
        `SELECT role FROM ledger_members WHERE ledgerId=? AND userId=?`,
        [input.ledgerId, ctx.user.id]
      );
      const member = (members as any[])[0];
      if (!member || !['owner','admin'].includes(member.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可操作' });
      }
      await (conn as any).execute(`DELETE FROM equity_shares WHERE id=? AND ledgerId=?`, [input.id, input.ledgerId]);
      return { success: true };
    }),

  // 编辑股权记录（仅owner/admin可操作）
  updateEquityShare: protectedProcedure
    .input(z.object({
      id: z.number(),
      ledgerId: z.number(),
      shareCount: z.number().positive(),
      shareType: z.string(),
      grantDate: z.string(),
      reason: z.string(),
      annualRate: z.number().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [members] = await (conn as any).execute(
        `SELECT role FROM ledger_members WHERE ledgerId=? AND userId=?`,
        [input.ledgerId, ctx.user.id]
      );
      const member = (members as any[])[0];
      if (!member || !['owner','admin'].includes(member.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可操作' });
      }
      await (conn as any).execute(
        `UPDATE equity_shares SET shareCount=?, shareType=?, grantDate=?, reason=?, annualRate=? WHERE id=? AND ledgerId=?`,
        [input.shareCount, input.shareType, input.grantDate, input.reason, input.annualRate, input.id, input.ledgerId]
      );
      return { success: true };
    }),

  // 获取成员脉动统计（人脉数、联络次数、直接推荐数）
  getMemberStats: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });

      // 人脉数：contacts表中该用户添加的联系人数
      const [contactRows] = await (conn as any).execute(
        `SELECT COUNT(*) as cnt FROM contacts WHERE parentUserId=?`,
        [input.userId]
      );
      const contactCount = (contactRows as any[])[0]?.cnt ?? 0;

      // 联络次数：contact_interactions通过contactId关联contacts.parentUserId
      const [interactionRows] = await (conn as any).execute(
        `SELECT COUNT(ci.id) as cnt FROM contact_interactions ci
         JOIN contacts c ON ci.contactId = c.id
         WHERE c.parentUserId=?`,
        [input.userId]
      );
      const interactionCount = (interactionRows as any[])[0]?.cnt ?? 0;

      // 直接推荐数：users表中invited_by_user_id等于该用户id的数量
      const [referralRows] = await (conn as any).execute(
        `SELECT COUNT(*) as cnt FROM users WHERE invited_by_user_id=?`,
        [input.userId]
      );
      const referralCount = (referralRows as any[])[0]?.cnt ?? 0;

      return {
        contactCount: Number(contactCount),
        interactionCount: Number(interactionCount),
        referralCount: Number(referralCount),
      };
    }),
});
