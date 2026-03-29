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
        `SELECT es.id, es.share_code, es.userId, es.memberNickname, es.shareCount, es.shareType, es.grantDate, es.reason, es.regNo, es.createdAt,
                COALESCE(es.annualRate, 6.00) as annualRate,
                COALESCE(es.weight, 1.0000) as weight,
                COALESCE(es.resource_weight, 1.0000) as resourceWeight,
                COALESCE(es.capital_weight, 1.0000) as capitalWeight,
                es.source_user_id, es.source_amount,
                sn.shareNo,
                su.name as sourceNickname, su.username as sourceUsername
         FROM equity_shares es
         LEFT JOIN shareholder_numbers sn ON sn.ledgerId=es.ledgerId AND sn.userId=es.userId
         LEFT JOIN users su ON su.id=es.source_user_id
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
        `SELECT es.id, es.share_code, es.userId, es.memberNickname, es.shareCount, es.shareType, es.grantDate, es.reason, es.regNo, es.createdAt,
                COALESCE(es.annualRate, 6.00) as annualRate,
                COALESCE(es.weight, 1.0000) as weight,
                COALESCE(es.resource_weight, 1.0000) as resourceWeight,
                COALESCE(es.capital_weight, 1.0000) as capitalWeight,
                es.source_user_id, es.source_amount,
                sn.shareNo,
                su.name as sourceNickname, su.username as sourceUsername
         FROM equity_shares es
         LEFT JOIN shareholder_numbers sn ON sn.ledgerId=es.ledgerId AND sn.userId=es.userId
         LEFT JOIN users su ON su.id=es.source_user_id
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
      // 实时计算该用户的资金权重（不依赖 equity_weights 静态表，始终基于当前数据）
      // 1. 读取资源权重（手动设置的部分，仍从 equity_weights 读取）
      const [[weightRow]] = await (conn as any).execute(
        'SELECT resource_weight FROM equity_weights WHERE user_id = ? LIMIT 1',
        [input.userId]
      ) as any;
      const rw = weightRow ? Number(weightRow.resource_weight) : 1.0;

      // 2. 实时计算资金权重：查该用户在本账本的资金股累计 + 股东编号排名
      const [[capRow]] = await (conn as any).execute(
        `SELECT COALESCE(SUM(es2.shareCount), 0) AS capitalTotal
         FROM equity_shares es2
         WHERE es2.ledgerId = ? AND es2.userId = ? AND es2.shareType = '资金股'`,
        [input.ledgerId, input.userId]
      ) as any;
      const [[snRow]] = await (conn as any).execute(
        'SELECT shareNo FROM shareholder_numbers WHERE ledgerId = ? AND userId = ? LIMIT 1',
        [input.ledgerId, input.userId]
      ) as any;
      // 66档等差规则：资金股≥10万 且 股东编号在前660名
      const THRESHOLD_W = 100000;
      const TIERS_W = 66;
      const MAX_RANK_W = 660;
      const MAX_BONUS_W = 1.0;
      const MIN_BONUS_W = Math.round(MAX_BONUS_W / (TIERS_W - 1) * 10000) / 10000;
      const stepW = (MAX_BONUS_W - MIN_BONUS_W) / (TIERS_W - 1);
      const capitalTotal = Number(capRow?.capitalTotal ?? 0);
      const capitalRatio = Math.min(capitalTotal / THRESHOLD_W, 1.0);
      let rawBonus = 0;
      if (snRow?.shareNo) {
        const rank = parseInt(String(snRow.shareNo), 10);
        if (!isNaN(rank) && rank >= 1 && rank <= MAX_RANK_W) {
          const tier = Math.ceil(rank / 10);
          rawBonus = Math.round((MAX_BONUS_W - (tier - 1) * stepW) * 10000) / 10000;
        }
      }
      const autoBonus = Math.round(rawBonus * capitalRatio * 10000) / 10000;
      const cw = Math.round((1.0 + autoBonus) * 10000) / 10000;
      const snapshotWeight = Math.round(rw * cw * 10000) / 10000;
      // 生成唯一股权编号 share_code（格式：ES-{ledgerId:02d}-{年份}-{6位随机数字}）
      const year = new Date().getFullYear();
      const randDigits = Math.floor(100000 + Math.random() * 900000).toString();
      const shareCode = `ES-${String(input.ledgerId).padStart(2,'0')}-${year}-${randDigits}`;
      const [result] = await (conn as any).execute(
        `INSERT INTO equity_shares (share_code, ledgerId, userId, memberNickname, shareCount, shareType, grantDate, reason, regNo, createdBy, weight, resource_weight, capital_weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [shareCode, input.ledgerId, input.userId, input.memberNickname, input.shareCount, input.shareType || '资金股', input.grantDate, input.reason, finalRegNo, ctx.user.id, snapshotWeight, rw, cw]
      );
      return { id: (result as any).insertId, regNo: finalRegNo, shareCode };
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

  // 管理员单独修改某张订单的权重（不影响其他订单）
  updateShareWeight: protectedProcedure
    .input(z.object({
      id: z.number(),
      ledgerId: z.number(),
      resourceWeight: z.number().min(0.01).max(100),
      capitalWeight: z.number().min(0.01).max(100),
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
      const newWeight = Math.round(input.resourceWeight * input.capitalWeight * 10000) / 10000;
      await (conn as any).execute(
        `UPDATE equity_shares SET resource_weight=?, capital_weight=?, weight=? WHERE id=? AND ledgerId=?`,
        [input.resourceWeight, input.capitalWeight, newWeight, input.id, input.ledgerId]
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

      // 标签总数：该用户对自己好友打的标签次数（不含共享好友）
      // 1. 普通标签：contact_tag_relations JOIN contacts，contacts.parentUserId = userId
      const [normalTagRows] = await (conn as any).execute(
        `SELECT COUNT(ctr.id) as cnt
         FROM contact_tag_relations ctr
         JOIN contacts c ON ctr.contactId = c.id
         WHERE c.parentUserId=?`,
        [input.userId]
      );
      const normalTagCount = (normalTagRows as any[])[0]?.cnt ?? 0;

      // 2. 个人标签：personal_contact_tags.parentUserId = userId
      const [personalTagRows] = await (conn as any).execute(
        `SELECT COUNT(*) as cnt FROM personal_contact_tags WHERE parentUserId=?`,
        [input.userId]
      );
      const personalTagCount = (personalTagRows as any[])[0]?.cnt ?? 0;

      const tagCount = Number(normalTagCount) + Number(personalTagCount);

      return {
        contactCount: Number(contactCount),
        interactionCount: Number(interactionCount),
        referralCount: Number(referralCount),
        tagCount,
      };
    }),
  // 获取全网资金股和市场资源股的总股本（用于持股结构容器）
  getGlobalShareStats: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 资金股总股本
      const [angelRows] = await (conn as any).execute(
        `SELECT COALESCE(SUM(shareCount), 0) as total FROM equity_shares WHERE ledgerId=? AND shareType='资金股'`,
        [input.ledgerId]
      );
      const angelTotal = Number((angelRows as any[])[0]?.total ?? 0);
      // 资金股授股日期（最早一笔，用于计算全网年化股息起始时间）
      const [dateRows] = await (conn as any).execute(
        `SELECT grantDate, shareCount, annualRate FROM equity_shares WHERE ledgerId=? AND shareType='资金股' ORDER BY grantDate ASC`,
        [input.ledgerId]
      );
      const angelShares = (dateRows as any[]).map(r => ({
        grantDate: r.grantDate,
        shareCount: Number(r.shareCount),
        annualRate: Number(r.annualRate ?? 6),
      }));
      // 市场资源股总股本
      const [marketRows] = await (conn as any).execute(
        `SELECT COALESCE(SUM(shareCount), 0) as total FROM equity_shares WHERE ledgerId=? AND shareType='资源股'`,
        [input.ledgerId]
      );
      const marketTotal = Number((marketRows as any[])[0]?.total ?? 0);
      const [marketDateRows] = await (conn as any).execute(
        `SELECT grantDate, shareCount, annualRate FROM equity_shares WHERE ledgerId=? AND shareType='资源股' ORDER BY grantDate ASC`,
        [input.ledgerId]
      );
      const marketShares = (marketDateRows as any[]).map(r => ({
        grantDate: r.grantDate,
        shareCount: Number(r.shareCount),
        annualRate: Number(r.annualRate ?? 6),
      }));
      return { angelTotal, angelShares, marketTotal, marketShares };
    }),

  // ===== 权重管理 =====
  // 获取单个用户的权重（任何已登录用户可查询自己或他人的权重）
  getUserWeight: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [[row]] = await (db as any).execute(
        'SELECT resource_weight, capital_weight FROM equity_weights WHERE user_id = ? LIMIT 1',
        [input.userId]
      ) as any;
      const r = row ? Number(row.resource_weight) : 1.00;
      // 如果数据库有手动保存的资金权重，直接使用；否则自动计算
      let c: number;
      if (row) {
        c = Number(row.capital_weight);
      } else {
        // 没有手动记录，根据股东编号和资金达标系数自动计算资金权重
        const [[snRow]] = await (db as any).execute(
          'SELECT shareNo FROM shareholder_numbers WHERE userId = ? LIMIT 1',
          [input.userId]
        ) as any;
        const [[capRow]] = await (db as any).execute(
          `SELECT COALESCE(SUM(shareCount), 0) AS capitalAmount
           FROM equity_shares WHERE userId = ? AND shareType = '资金股'`,
          [input.userId]
        ) as any;
        const THRESHOLD_W = 100000;
        const TIERS_W = 66;
        const MAX_RANK_W = 660;
        const MAX_BONUS_W = 1.0;
        const MIN_BONUS_W = Math.round(MAX_BONUS_W / (TIERS_W - 1) * 10000) / 10000;
        const stepW = (MAX_BONUS_W - MIN_BONUS_W) / (TIERS_W - 1);
        const capitalAmount = Number(capRow?.capitalAmount ?? 0);
        const capitalRatio = Math.min(capitalAmount / THRESHOLD_W, 1.0);
        let rawBonus = 0;
        if (snRow?.shareNo) {
          const rank = parseInt(String(snRow.shareNo), 10);
          if (!isNaN(rank) && rank <= MAX_RANK_W) {
            const tier = Math.ceil(rank / 10);
            rawBonus = Math.round((MAX_BONUS_W - (tier - 1) * stepW) * 10000) / 10000;
          }
        }
        const autoBonus = Math.round(rawBonus * capitalRatio * 10000) / 10000;
        c = Math.round((1.0 + autoBonus) * 10000) / 10000;
      }
      return {
        resourceWeight: r,
        capitalWeight: c,
        totalWeight: Math.round(r * c * 10000) / 10000,
      };
    }),

  // 获取账本所有成员及其权重（仅账本 owner/admin 可访问）
  getWeightMembers: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 验证操作者是该账本的 owner 或 admin
      const [[myRow]] = await (db as any).execute(
        'SELECT role FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
        [input.ledgerId, ctx.user.id]
      ) as any;
      const isGlobal = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      if (!isGlobal && myRow?.role !== 'owner' && myRow?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可访问' });
      }
      // 查该账本所有成员，并联查资金股本金和股东编号，以及资源参考数据
      const [members] = await (db as any).execute(
        `SELECT lm.userId, u.name, u.username, u.avatar,
                COALESCE(sn.shareNo, NULL) AS shareNo,
                COALESCE((
                  SELECT SUM(es2.shareCount)
                  FROM equity_shares es2
                  WHERE es2.ledgerId = lm.ledgerId AND es2.userId = lm.userId AND es2.shareType = '资金股'
                ), 0) AS capitalAmount,
                COALESCE((
                  SELECT COUNT(*) FROM contacts c
                  WHERE c.parentUserId = lm.userId
                ), 0) AS networkCount,
                COALESCE((
                  SELECT COUNT(*) FROM contact_tag_relations ctr
                  INNER JOIN contacts c2 ON c2.id = ctr.contactId
                  WHERE c2.parentUserId = lm.userId
                ), 0) AS tagCount,
                COALESCE((
                  SELECT COUNT(*) FROM contacts c3
                  WHERE c3.parentUserId = lm.userId AND c3.referrerId IS NOT NULL
                ), 0) AS directReferrals
         FROM ledger_members lm
         LEFT JOIN users u ON u.id = lm.userId
         LEFT JOIN shareholder_numbers sn ON sn.ledgerId = lm.ledgerId AND sn.userId = lm.userId
         WHERE lm.ledgerId = ? AND lm.userId > 0
         ORDER BY lm.createdAt ASC`,
        [input.ledgerId]
      ) as any;
      // 查资源权重（手动设置部分，仍从 equity_weights 读取）
      const [weights] = await (db as any).execute(
        'SELECT user_id, resource_weight FROM equity_weights'
      ) as any;
      const rwMap = new Map<number, number>();
      for (const w of weights) {
        rwMap.set(Number(w.user_id), Number(w.resource_weight));
      }
      // 实时计算资金权重（66档等差规则）
      const THRESHOLD_W = 100000;
      const TIERS_W = 66;
      const MAX_RANK_W = 660;
      const MAX_BONUS_W = 1.0;
      const MIN_BONUS_W = Math.round(MAX_BONUS_W / (TIERS_W - 1) * 10000) / 10000;
      const stepW = (MAX_BONUS_W - MIN_BONUS_W) / (TIERS_W - 1);
      return (members as any[]).map((m: any) => {
        const uid = Number(m.userId);
        const r = rwMap.get(uid) ?? 1.00;
        const capitalAmount = Number(m.capitalAmount ?? 0);
        const capitalRatio = Math.min(capitalAmount / THRESHOLD_W, 1.0);
        // 根据股东编号实时计算入股早晚加成
        const shareNo = m.shareNo ? String(m.shareNo) : null;
        let rawBonus = 0;
        if (shareNo) {
          const rank = parseInt(shareNo, 10);
          if (!isNaN(rank) && rank >= 1 && rank <= MAX_RANK_W) {
            const tier = Math.ceil(rank / 10);
            rawBonus = Math.round((MAX_BONUS_W - (tier - 1) * stepW) * 10000) / 10000;
          }
        }
        const autoBonus = Math.round(rawBonus * capitalRatio * 10000) / 10000;
        const c = Math.round((1.0 + autoBonus) * 10000) / 10000;
        return {
          userId: uid,
          name: m.name || m.username || '未知',
          avatar: m.avatar ?? null,
          resourceWeight: r,
          capitalWeight: c,          // 实时计算，不再读静态表
          totalWeight: Math.round(r * c * 10000) / 10000,
          capitalAmount,
          capitalRatio: Math.round(capitalRatio * 10000) / 10000,
          shareNo,
          rawBonus,
          autoBonus,
          networkCount: Number(m.networkCount ?? 0),
          tagCount: Number(m.tagCount ?? 0),
          directReferrals: Number(m.directReferrals ?? 0),
        };
      });
    }),

  // 设置成员权重（仅账本 owner/admin 可操作）
  setMemberWeight: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      userId: z.number(),
      resourceWeight: z.number().min(0).max(99),
      capitalWeight: z.number().min(0).max(99),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 验证操作者是该账本的 owner 或 admin
      const [[myRow]] = await (db as any).execute(
        'SELECT role FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
        [input.ledgerId, ctx.user.id]
      ) as any;
      const isGlobal = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      if (!isGlobal && myRow?.role !== 'owner' && myRow?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可操作' });
      }
      // 读取旧权重（用于写入日志）
      const [[oldRow]] = await (db as any).execute(
        'SELECT resource_weight, capital_weight FROM equity_weights WHERE user_id = ? LIMIT 1',
        [input.userId]
      ) as any;
      const oldRes = oldRow ? Number(oldRow.resource_weight) : 1.00;
      const oldCap = oldRow ? Number(oldRow.capital_weight) : 1.00;

      await (db as any).execute(
        `INSERT INTO equity_weights (user_id, resource_weight, capital_weight)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           resource_weight = VALUES(resource_weight),
           capital_weight  = VALUES(capital_weight),
           updated_at      = NOW()`,
        [input.userId, input.resourceWeight, input.capitalWeight]
      );

      // 写入变更日志
      await (db as any).execute(
        `INSERT INTO equity_weight_logs
           (ledger_id, user_id, operator_id, old_resource_weight, old_capital_weight, new_resource_weight, new_capital_weight)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [input.ledgerId, input.userId, ctx.user.id, oldRes, oldCap, input.resourceWeight, input.capitalWeight]
      );

      return { success: true };
    }),

  // 查询某成员的权重变更日志（仅账本 owner/admin 可查）
  getWeightLogs: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      userId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [[myRow]] = await (db as any).execute(
        'SELECT role FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
        [input.ledgerId, ctx.user.id]
      ) as any;
      const isGlobal = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      const isAdminOrOwner = isGlobal || myRow?.role === 'owner' || myRow?.role === 'admin';
      // 普通成员只能查看自己的权重日志，管理员可查看任意成员
      const targetUserId = isAdminOrOwner ? input.userId : ctx.user.id;
      if (!isAdminOrOwner && input.userId !== 0 && input.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '只能查看自己的权重记录' });
      }
      const [rows] = await (db as any).execute(
        `SELECT wl.id, wl.old_resource_weight, wl.old_capital_weight,
                wl.new_resource_weight, wl.new_capital_weight,
                wl.remark, wl.created_at,
                u.name AS operator_name
         FROM equity_weight_logs wl
         LEFT JOIN users u ON u.id = wl.operator_id
         WHERE wl.user_id = ? AND wl.ledger_id = ?
         ORDER BY wl.created_at DESC
         LIMIT 50`,
        [targetUserId, input.ledgerId]
      ) as any;
      return (rows as any[]).map((r: any) => ({
        id: Number(r.id),
        oldResourceWeight: Number(r.old_resource_weight),
        oldCapitalWeight: Number(r.old_capital_weight),
        newResourceWeight: Number(r.new_resource_weight),
        newCapitalWeight: Number(r.new_capital_weight),
        remark: r.remark ?? '',
        createdAt: r.created_at as Date,
        operatorName: r.operator_name ?? '未知',
      }));
    }),

  // 预览自动权重计算结果（按股东编号早晚，资金股≥10万，66档等差2.0~1.0）
  previewAutoWeight: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [[myRow]] = await (db as any).execute(
        'SELECT role FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
        [input.ledgerId, ctx.user.id]
      ) as any;
      const isGlobal = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      if (!isGlobal && myRow?.role !== 'owner' && myRow?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可访问' });
      }
      // 查该账本所有成员的资金股总额，按 shareholder_numbers.shareNo 排序
      const [rows] = await (db as any).execute(
        `SELECT
           lm.userId,
           COALESCE(u.name, u.username, '未知') AS name,
           u.avatar,
           COALESCE(sn.shareNo, '9999') AS shareNo,
           COALESCE((
             SELECT SUM(es2.shareCount)
             FROM equity_shares es2
             WHERE es2.ledgerId = lm.ledgerId AND es2.userId = lm.userId AND es2.shareType = '资金股'
           ), 0) AS capitalTotal
         FROM ledger_members lm
         LEFT JOIN users u ON u.id = lm.userId
         LEFT JOIN shareholder_numbers sn ON sn.ledgerId = lm.ledgerId AND sn.userId = lm.userId
         WHERE lm.ledgerId = ? AND lm.userId > 0
         ORDER BY COALESCE(sn.shareNo, '9999') ASC, lm.userId ASC`,
        [input.ledgerId]
      ) as any;

      // 已排名人数：统计 shareholder_numbers 中有编号的成员数
      const [[snCountRow]] = await (db as any).execute(
        'SELECT COUNT(*) AS cnt FROM shareholder_numbers WHERE ledgerId = ?',
        [input.ledgerId]
      ) as any;
      const totalRanked = Number(snCountRow?.cnt ?? 0);

      // 筛选资金股≥10万的成员，按 shareNo 顺序排列
      const THRESHOLD = 100000;
      const TIERS = 66;
      const MAX_RANK = 660;
      // 入股早晚因素：第1档加1.0，第66档加MIN_BONUS，第661名加0
      const MAX_BONUS = 1.0;
      const MIN_BONUS = Math.round(MAX_BONUS / (TIERS - 1) * 10000) / 10000; // ≈ 0.0154
      const step = (MAX_BONUS - MIN_BONUS) / (TIERS - 1);

      const eligible = (rows as any[]).filter((r: any) => Number(r.capitalTotal) >= THRESHOLD);
      // 下一位进来的权重（基础1.0 + 入股早晚加成）
      const nextRank = totalRanked + 1;
      let nextBonus: number;
      if (nextRank > MAX_RANK) {
        nextBonus = 0;
      } else {
        const tier = Math.ceil(nextRank / 10); // 1~66
        nextBonus = Math.round((MAX_BONUS - (tier - 1) * step) * 10000) / 10000;
      }
      const nextWeight = Math.round((1.0 + nextBonus) * 10000) / 10000;

      // 计算每位符合条件成员的权重
      const preview = eligible.map((r: any, idx: number) => {
        const rank = idx + 1;
        const capitalTotal = Number(r.capitalTotal);
        // 资金达标系数：min(本金/10万, 1.0)
        const capitalRatio = Math.min(capitalTotal / THRESHOLD, 1.0);
        let rawBonus: number;
        if (rank > MAX_RANK) {
          rawBonus = 0;
        } else {
          const tier = Math.ceil(rank / 10);
          rawBonus = Math.round((MAX_BONUS - (tier - 1) * step) * 10000) / 10000;
        }
        // 实际加成 = 入股早晚加成 × 资金达标系数
        const bonus = Math.round(rawBonus * capitalRatio * 10000) / 10000;
        const capitalWeight = Math.round((1.0 + bonus) * 10000) / 10000;
        return {
          userId: Number(r.userId),
          name: r.name as string,
          avatar: r.avatar as string | null,
          shareNo: r.shareNo as string,
          capitalTotal,
          rank,
          tier: rank <= MAX_RANK ? Math.ceil(rank / 10) : null,
          rawBonus,
          capitalRatio: Math.round(capitalRatio * 10000) / 10000,
          bonus,
          capitalWeight,
        };
      });

      // 66档规则列表（展示加成值0~1.0）
      const tiers = Array.from({ length: TIERS }, (_, i) => {
        const tier = i + 1;
        const bonus = Math.round((MAX_BONUS - i * step) * 10000) / 10000;
        const totalW = Math.round((1.0 + bonus) * 10000) / 10000;
        return { tier, rankFrom: (tier - 1) * 10 + 1, rankTo: tier * 10, bonus, weight: totalW };
      });

      return { totalEligible: eligible.length, totalRanked, nextWeight, nextBonus, preview, tiers };
    }),

  // 一键应用自动权重（将预览结果写入equity_weights）
  applyAutoWeight: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [[myRow]] = await (db as any).execute(
        'SELECT role FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
        [input.ledgerId, ctx.user.id]
      ) as any;
      const isGlobal = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      if (!isGlobal && myRow?.role !== 'owner' && myRow?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可操作' });
      }
      // 重新计算（与preview相同逻辑）
      const [rows] = await (db as any).execute(
        `SELECT
           lm.userId,
           COALESCE(sn.shareNo, '9999') AS shareNo,
           COALESCE((
             SELECT SUM(es2.shareCount)
             FROM equity_shares es2
             WHERE es2.ledgerId = lm.ledgerId AND es2.userId = lm.userId AND es2.shareType = '资金股'
           ), 0) AS capitalTotal
         FROM ledger_members lm
         LEFT JOIN shareholder_numbers sn ON sn.ledgerId = lm.ledgerId AND sn.userId = lm.userId
         WHERE lm.ledgerId = ? AND lm.userId > 0
         ORDER BY COALESCE(sn.shareNo, '9999') ASC, lm.userId ASC`,
        [input.ledgerId]
      ) as any;
      const THRESHOLD = 100000;
      const TIERS = 66;
      const MAX_RANK = 660;
      const MAX_BONUS = 1.0;
      const MIN_BONUS = Math.round(MAX_BONUS / (TIERS - 1) * 10000) / 10000;
      const step = (MAX_BONUS - MIN_BONUS) / (TIERS - 1);
      const eligible = (rows as any[]).filter((r: any) => Number(r.capitalTotal) >= THRESHOLD);
      let updatedCount = 0;
      for (let idx = 0; idx < eligible.length; idx++) {
        const r = eligible[idx];
        const rank = idx + 1;
        const capitalTotal = Number(r.capitalTotal);
        const capitalRatio = Math.min(capitalTotal / THRESHOLD, 1.0);
        let rawBonus: number;
        if (rank > MAX_RANK) {
          rawBonus = 0;
        } else {
          const tier = Math.ceil(rank / 10);
          rawBonus = Math.round((MAX_BONUS - (tier - 1) * step) * 10000) / 10000;
        }
        // 实际加成 = 入股早晚加成 × 资金达标系数
        const bonus = Math.round(rawBonus * capitalRatio * 10000) / 10000;
        const capitalWeight = Math.round((1.0 + bonus) * 10000) / 10000;
        // 读取旧值
        const [[oldRow]] = await (db as any).execute(
          'SELECT resource_weight, capital_weight FROM equity_weights WHERE user_id = ? LIMIT 1',
          [Number(r.userId)]
        ) as any;
        const oldRes = oldRow ? Number(oldRow.resource_weight) : 1.00;
        const oldCap = oldRow ? Number(oldRow.capital_weight) : 1.00;
        // 写入新资金权重，保留原资源权重
        await (db as any).execute(
          `INSERT INTO equity_weights (user_id, resource_weight, capital_weight)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             capital_weight  = VALUES(capital_weight),
             updated_at = NOW()`,
          [Number(r.userId), oldRes, capitalWeight]
        );
        // 写日志
        await (db as any).execute(
          `INSERT INTO equity_weight_logs (ledger_id, user_id, operator_id, old_resource_weight, old_capital_weight, new_resource_weight, new_capital_weight, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, '自动权重规则应用')`,
          [input.ledgerId, Number(r.userId), ctx.user.id, oldRes, oldCap, oldRes, capitalWeight]
        );
        updatedCount++;
      }
      return { updatedCount };
    }),

  // ===== 推荐人审核功能 =====
  // 初始化推荐审核表（服务器首次调用时自动建表）
  initReferralTable: protectedProcedure
    .mutation(async ({ ctx }) => {
      const isGlobal = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      if (!isGlobal) throw new TRPCError({ code: 'FORBIDDEN' });
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      await (db as any).execute(`
        CREATE TABLE IF NOT EXISTS referral_approvals (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL COMMENT '账本ID',
          member_user_id INT NOT NULL COMMENT '推荐者（申请人）',
          referred_user_id INT NOT NULL COMMENT '被推荐人',
          referred_name VARCHAR(100) DEFAULT NULL COMMENT '被推荐人姓名',
          status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          remark VARCHAR(255) DEFAULT NULL COMMENT '审核备注',
          reviewer_user_id INT DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          reviewed_at DATETIME DEFAULT NULL,
          INDEX idx_ledger_member (ledger_id, member_user_id),
          INDEX idx_status (status)
        ) COMMENT='资源权重推荐人审核表'
      `);
      return { success: true };
    }),

  // 批量导入现有推荐关系到待审核队列（管理员一次性操作）
  importExistingReferrals: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const isGlobal = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      if (!isGlobal) throw new TRPCError({ code: 'FORBIDDEN' });
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 先确保表存在
      await (db as any).execute(`
        CREATE TABLE IF NOT EXISTS referral_approvals (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          member_user_id INT NOT NULL,
          referred_user_id INT NOT NULL,
          referred_name VARCHAR(100) DEFAULT NULL,
          status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          remark VARCHAR(255) DEFAULT NULL,
          reviewer_user_id INT DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          reviewed_at DATETIME DEFAULT NULL,
          INDEX idx_ledger_member (ledger_id, member_user_id),
          INDEX idx_status (status)
        )
      `);
      // 查询该账本所有成员
      const [members] = await (db as any).execute(
        'SELECT user_id FROM ledger_members WHERE ledger_id = ?',
        [input.ledgerId]
      ) as any;
      const memberIds = (members as any[]).map((m: any) => Number(m.user_id));
      if (memberIds.length === 0) return { imported: 0, skipped: 0 };
      // 查询这些成员在 contacts 表中的推荐关系（referrer_id 不为空）
      const placeholders = memberIds.map(() => '?').join(',');
      const [contacts] = await (db as any).execute(
        `SELECT c.parent_user_id AS memberUserId, c.user_id AS referredUserId, u.name AS referredName
         FROM contacts c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.parent_user_id IN (${placeholders})
           AND c.referrer_id IS NOT NULL
           AND c.referrer_id != 0`,
        memberIds
      ) as any;
      let imported = 0;
      let skipped = 0;
      for (const row of contacts as any[]) {
        const memberUserId = Number(row.memberUserId);
        const referredUserId = Number(row.referredUserId);
        if (!memberIds.includes(memberUserId)) { skipped++; continue; }
        // 检查是否已存在（避免重复）
        const [[existing]] = await (db as any).execute(
          'SELECT id FROM referral_approvals WHERE ledger_id = ? AND member_user_id = ? AND referred_user_id = ? LIMIT 1',
          [input.ledgerId, memberUserId, referredUserId]
        ) as any;
        if (existing) { skipped++; continue; }
        await (db as any).execute(
          'INSERT INTO referral_approvals (ledger_id, member_user_id, referred_user_id, referred_name) VALUES (?, ?, ?, ?)',
          [input.ledgerId, memberUserId, referredUserId, row.referredName ?? null]
        );
        imported++;
      }
      return { imported, skipped };
    }),

  // 提交推荐人审核申请
  submitReferralApproval: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      referredUserId: z.number(),
      referredName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 检查是否已存在相同申请
      const [[existing]] = await (db as any).execute(
        'SELECT id FROM referral_approvals WHERE ledger_id = ? AND member_user_id = ? AND referred_user_id = ? AND status = \'pending\' LIMIT 1',
        [input.ledgerId, ctx.user.id, input.referredUserId]
      ) as any;
      if (existing) throw new TRPCError({ code: 'BAD_REQUEST', message: '已提交过该推荐人的审核申请' });
      await (db as any).execute(
        'INSERT INTO referral_approvals (ledger_id, member_user_id, referred_user_id, referred_name) VALUES (?, ?, ?, ?)',
        [input.ledgerId, ctx.user.id, input.referredUserId, input.referredName ?? null]
      );
      return { success: true };
    }),

  // 查询待审核推荐列表（管理员）
  getReferralApprovals: protectedProcedure
    .input(z.object({ ledgerId: z.number(), status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending') }))
    .query(async ({ ctx, input }) => {
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [[myRow]] = await (db as any).execute(
        'SELECT role FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
        [input.ledgerId, ctx.user.id]
      ) as any;
      const isGlobal = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      if (!isGlobal && myRow?.role !== 'owner' && myRow?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可查看' });
      }
      const whereStatus = input.status === 'all' ? '' : 'AND ra.status = ?';
      const params: any[] = input.status === 'all' ? [input.ledgerId] : [input.ledgerId, input.status];
      const [rows] = await (db as any).execute(
        `SELECT ra.id, ra.member_user_id, ra.referred_user_id, ra.referred_name,
                ra.status, ra.remark, ra.created_at, ra.reviewed_at,
                u1.name AS memberName, u1.avatar AS memberAvatar,
                u2.name AS referredUserName
         FROM referral_approvals ra
         LEFT JOIN users u1 ON u1.id = ra.member_user_id
         LEFT JOIN users u2 ON u2.id = ra.referred_user_id
         WHERE ra.ledger_id = ? ${whereStatus}
         ORDER BY ra.created_at DESC`,
        params
      ) as any;
      return (rows as any[]).map((r: any) => ({
        id: Number(r.id),
        memberUserId: Number(r.member_user_id),
        memberName: r.memberName ?? '未知',
        memberAvatar: r.memberAvatar ?? null,
        referredUserId: Number(r.referred_user_id),
        referredName: r.referred_name ?? r.referredUserName ?? '未知',
        status: r.status as 'pending' | 'approved' | 'rejected',
        remark: r.remark ?? '',
        createdAt: r.created_at as Date,
        reviewedAt: r.reviewed_at as Date | null,
      }));
    }),

  // 审核推荐申请（通过/拒绝）
  reviewReferralApproval: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      approvalId: z.number(),
      action: z.enum(['approved', 'rejected']),
      remark: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [[myRow]] = await (db as any).execute(
        'SELECT role FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
        [input.ledgerId, ctx.user.id]
      ) as any;
      const isGlobal = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      if (!isGlobal && myRow?.role !== 'owner' && myRow?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可审核' });
      }
      await (db as any).execute(
        'UPDATE referral_approvals SET status = ?, remark = ?, reviewer_user_id = ?, reviewed_at = NOW() WHERE id = ? AND ledger_id = ?',
        [input.action, input.remark ?? null, ctx.user.id, input.approvalId, input.ledgerId]
      );
      return { success: true };
    }),

  // 查询某成员已审核通过的推荐人数（用于计算资源权重）
  getApprovedReferralCount: protectedProcedure
    .input(z.object({ ledgerId: z.number(), memberUserId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await (await import('./db')).getDbConnection();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [[row]] = await (db as any).execute(
        'SELECT COUNT(*) AS cnt FROM referral_approvals WHERE ledger_id = ? AND member_user_id = ? AND status = \'approved\'',
        [input.ledgerId, input.memberUserId]
      ) as any;
      return { count: Number(row?.cnt ?? 0) };
    }),
});
// ===== 股权转让功能 =====
export const equityTransferRouter = router({
  // 发起转让申请（任何持股人均可申请）
  createTransfer: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      fromShareId: z.number(), // 转出的股权记录ID
      fromShareCount: z.number().positive(),
      toUserId: z.number(),
      toNickname: z.string(),
      toShareType: z.string(),
      reason: z.string().optional().default(''),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 查找转出股权记录，必须属于当前用户
      const [shareRows] = await (conn as any).execute(
        `SELECT id, userId, memberNickname, shareCount, shareType FROM equity_shares WHERE id=? AND ledgerId=? AND userId=?`,
        [input.fromShareId, input.ledgerId, ctx.user.id]
      );
      const share = (shareRows as any[])[0];
      if (!share) throw new TRPCError({ code: 'NOT_FOUND', message: '未找到该股权记录或无权操作' });
      if (Number(share.shareCount) < input.fromShareCount) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `可转让张数不足，当前持有 ${share.shareCount} 张` });
      }
      // 检查是否有待审核中的申请（同一股权记录）
      const [pendingRows] = await (conn as any).execute(
        `SELECT id FROM equity_transfers WHERE fromUserId=? AND ledgerId=? AND status='pending'`,
        [ctx.user.id, input.ledgerId]
      );
      if ((pendingRows as any[]).length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: '您已有待审核的转让申请，请等待管理员处理后再提交' });
      }
      const [result] = await (conn as any).execute(
        `INSERT INTO equity_transfers (ledgerId, fromUserId, fromNickname, fromShareType, fromShareCount, toUserId, toNickname, toShareType, reason, status, createdBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [input.ledgerId, ctx.user.id, share.memberNickname, share.shareType, input.fromShareCount, input.toUserId, input.toNickname, input.toShareType, input.reason, ctx.user.id]
      );
      return { id: (result as any).insertId };
    }),

  // 管理员审批转让申请
  reviewTransfer: protectedProcedure
    .input(z.object({
      transferId: z.number(),
      action: z.enum(['approved', 'rejected']),
      adminNote: z.string().optional().default(''),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 必须是管理员
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可审批' });
      }
      // 查找申请
      const [rows] = await (conn as any).execute(
        `SELECT * FROM equity_transfers WHERE id=? AND status='pending'`,
        [input.transferId]
      );
      const transfer = (rows as any[])[0];
      if (!transfer) throw new TRPCError({ code: 'NOT_FOUND', message: '未找到待审核的申请' });

      if (input.action === 'approved') {
        // 查找转出人的对应股权记录（取最新一条同类型，余额足够的）
        const [fromShares] = await (conn as any).execute(
          `SELECT id, shareCount FROM equity_shares WHERE ledgerId=? AND userId=? AND shareType=? ORDER BY grantDate ASC, id ASC`,
          [transfer.ledgerId, transfer.fromUserId, transfer.fromShareType]
        );
        const fromShareList = fromShares as any[];
        const totalFrom = fromShareList.reduce((s: number, r: any) => s + Number(r.shareCount), 0);
        if (totalFrom < Number(transfer.fromShareCount)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `转出人当前持有 ${totalFrom} 张，不足以转让 ${transfer.fromShareCount} 张` });
        }
        // 按FIFO扣减转出人股权
        let remaining = Number(transfer.fromShareCount);
        for (const row of fromShareList) {
          if (remaining <= 0) break;
          const rowCount = Number(row.shareCount);
          if (rowCount <= remaining) {
            await (conn as any).execute(`DELETE FROM equity_shares WHERE id=?`, [row.id]);
            remaining -= rowCount;
          } else {
            await (conn as any).execute(`UPDATE equity_shares SET shareCount=? WHERE id=?`, [rowCount - remaining, row.id]);
            remaining = 0;
          }
        }
        // 获取转出人的annualRate（取第一条）
        const annualRate = fromShareList[0]?.annualRate ?? 6;
        // 查询转入人当前权重，转让时快照
        const [[toWeightRow]] = await (conn as any).execute(
          'SELECT resource_weight, capital_weight FROM equity_weights WHERE user_id = ? LIMIT 1',
          [transfer.toUserId]
        ) as any;
        const toRw = toWeightRow ? Number(toWeightRow.resource_weight) : 1.0;
        const toCw = toWeightRow ? Number(toWeightRow.capital_weight) : 1.0;
        const toSnapshotWeight = Math.round(toRw * toCw * 10000) / 10000;
        // 新增转入人的股权记录
        const today = new Date().toISOString().slice(0, 10);
        const transferYear = new Date().getFullYear();
        const transferRandDigits = Math.floor(100000 + Math.random() * 900000).toString();
        const transferShareCode = `ES-${String(transfer.ledgerId).padStart(2,'0')}-${transferYear}-${transferRandDigits}`;
        await (conn as any).execute(
          `INSERT INTO equity_shares (share_code, ledgerId, userId, memberNickname, shareCount, shareType, grantDate, reason, createdBy, annualRate, weight, resource_weight, capital_weight)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [transferShareCode, transfer.ledgerId, transfer.toUserId, transfer.toNickname, transfer.fromShareCount, transfer.toShareType,
           today, `股权转让（来自 ${transfer.fromNickname}）`, ctx.user.id, annualRate, toSnapshotWeight, toRw, toCw]
        );
      }

      // 更新申请状态
      await (conn as any).execute(
        `UPDATE equity_transfers SET status=?, adminNote=?, reviewedBy=?, reviewedAt=NOW() WHERE id=?`,
        [input.action, input.adminNote, ctx.user.id, input.transferId]
      );
      return { success: true };
    }),

  // 查询待审核的转让申请（管理员）
  getPendingTransfers: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [rows] = await (conn as any).execute(
        `SELECT * FROM equity_transfers WHERE ledgerId=? AND status='pending' ORDER BY createdAt DESC`,
        [input.ledgerId]
      );
      return rows as any[];
    }),

  // 查询所有转让记录（管理员）
  getAllTransfers: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [rows] = await (conn as any).execute(
        `SELECT * FROM equity_transfers WHERE ledgerId=? ORDER BY createdAt DESC`,
        [input.ledgerId]
      );
      return rows as any[];
    }),

  // 查询当前用户的股权流水（授予+转入+转出）
  getMyEquityHistory: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 授予记录（equity_shares）
      const [grantRows] = await (conn as any).execute(
        `SELECT id as shareId, shareType, shareCount, grantDate as eventDate, reason, createdAt,
                'grant' as eventType, NULL as counterparty,
                COALESCE(resource_weight, 1.0) as resourceWeight,
                COALESCE(capital_weight, 1.0) as capitalWeight
         FROM equity_shares WHERE ledgerId=? AND userId=? ORDER BY grantDate DESC, id DESC`,
        [input.ledgerId, ctx.user.id]
      );
      // 转入记录（equity_transfers，approved，toUserId=我）
      const [inRows] = await (conn as any).execute(
        `SELECT id, toShareType as shareType, fromShareCount as shareCount, reviewedAt as eventDate,
                reason, createdAt, 'transfer_in' as eventType, fromNickname as counterparty
         FROM equity_transfers WHERE ledgerId=? AND toUserId=? AND status='approved' ORDER BY reviewedAt DESC`,
        [input.ledgerId, ctx.user.id]
      );
      // 转出记录（equity_transfers，approved/rejected/pending，fromUserId=我）
      const [outRows] = await (conn as any).execute(
        `SELECT id, fromShareType as shareType, fromShareCount as shareCount, 
                COALESCE(reviewedAt, createdAt) as eventDate,
                reason, createdAt, 
                CONCAT('transfer_out_', status) as eventType,
                toNickname as counterparty
         FROM equity_transfers WHERE ledgerId=? AND fromUserId=? ORDER BY createdAt DESC`,
        [input.ledgerId, ctx.user.id]
      );
      // 合并并按时间倒序
      const all = [
        ...(grantRows as any[]).map(r => ({ ...r, eventType: 'grant' })),
        ...(inRows as any[]).map(r => ({ ...r, eventType: 'transfer_in' })),
        ...(outRows as any[]),
      ].sort((a, b) => new Date(b.eventDate || b.createdAt).getTime() - new Date(a.eventDate || a.createdAt).getTime());
      return all;
    }),

  // 查询指定用户的股权流水（管理员查看任意用户）
  getUserEquityHistory: protectedProcedure
    .input(z.object({ ledgerId: z.number(), userId: z.number() }))
    .query(async ({ ctx, input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 验证账本级别管理员权限
      const [lmRows] = await (conn as any).execute(
        `SELECT role FROM ledger_members WHERE ledgerId=? AND userId=?`,
        [input.ledgerId, ctx.user.id]
      );
      const lmRole = (lmRows as any[])[0]?.role;
      if (!lmRole || !['owner','admin'].includes(lmRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可访问' });
      }
      const [grantRows] = await (conn as any).execute(
        `SELECT id as shareId, shareType, shareCount, grantDate as eventDate, reason, createdAt,
                'grant' as eventType, NULL as counterparty,
                COALESCE(resource_weight, 1.0) as resourceWeight,
                COALESCE(capital_weight, 1.0) as capitalWeight
         FROM equity_shares WHERE ledgerId=? AND userId=? ORDER BY grantDate DESC, id DESC`,
        [input.ledgerId, input.userId]
      );
      const [inRows] = await (conn as any).execute(
        `SELECT id, toShareType as shareType, fromShareCount as shareCount, reviewedAt as eventDate,
                reason, createdAt, 'transfer_in' as eventType, fromNickname as counterparty
         FROM equity_transfers WHERE ledgerId=? AND toUserId=? AND status='approved' ORDER BY reviewedAt DESC`,
        [input.ledgerId, input.userId]
      );
      const [outRows] = await (conn as any).execute(
        `SELECT id, fromShareType as shareType, fromShareCount as shareCount,
                COALESCE(reviewedAt, createdAt) as eventDate,
                reason, createdAt,
                CONCAT('transfer_out_', status) as eventType,
                toNickname as counterparty
         FROM equity_transfers WHERE ledgerId=? AND fromUserId=? ORDER BY createdAt DESC`,
        [input.ledgerId, input.userId]
      );
      const all = [
        ...(grantRows as any[]).map(r => ({ ...r, eventType: 'grant' })),
        ...(inRows as any[]).map(r => ({ ...r, eventType: 'transfer_in' })),
        ...(outRows as any[]),
      ].sort((a, b) => new Date(b.eventDate || b.createdAt).getTime() - new Date(a.eventDate || a.createdAt).getTime());
      return all;
    }),
});
