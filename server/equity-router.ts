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
  // 获取全网天使股和市场贡献股的总股本（用于持股结构容器）
  getGlobalShareStats: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 天使股总股本
      const [angelRows] = await (conn as any).execute(
        `SELECT COALESCE(SUM(shareCount), 0) as total FROM equity_shares WHERE ledgerId=? AND shareType='天使股'`,
        [input.ledgerId]
      );
      const angelTotal = Number((angelRows as any[])[0]?.total ?? 0);
      // 天使股授股日期（最早一笔，用于计算全网年化股息起始时间）
      const [dateRows] = await (conn as any).execute(
        `SELECT grantDate, shareCount, annualRate FROM equity_shares WHERE ledgerId=? AND shareType='天使股' ORDER BY grantDate ASC`,
        [input.ledgerId]
      );
      const angelShares = (dateRows as any[]).map(r => ({
        grantDate: r.grantDate,
        shareCount: Number(r.shareCount),
        annualRate: Number(r.annualRate ?? 6),
      }));
      // 市场贡献股总股本
      const [marketRows] = await (conn as any).execute(
        `SELECT COALESCE(SUM(shareCount), 0) as total FROM equity_shares WHERE ledgerId=? AND shareType='市场贡献股'`,
        [input.ledgerId]
      );
      const marketTotal = Number((marketRows as any[])[0]?.total ?? 0);
      const [marketDateRows] = await (conn as any).execute(
        `SELECT grantDate, shareCount, annualRate FROM equity_shares WHERE ledgerId=? AND shareType='市场贡献股' ORDER BY grantDate ASC`,
        [input.ledgerId]
      );
      const marketShares = (marketDateRows as any[]).map(r => ({
        grantDate: r.grantDate,
        shareCount: Number(r.shareCount),
        annualRate: Number(r.annualRate ?? 6),
      }));
      return { angelTotal, angelShares, marketTotal, marketShares };
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
        // 新增转入人的股权记录
        const today = new Date().toISOString().slice(0, 10);
        await (conn as any).execute(
          `INSERT INTO equity_shares (ledgerId, userId, memberNickname, shareCount, shareType, grantDate, reason, createdBy, annualRate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [transfer.ledgerId, transfer.toUserId, transfer.toNickname, transfer.fromShareCount, transfer.toShareType,
           today, `股权转让（来自 ${transfer.fromNickname}）`, ctx.user.id, annualRate]
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
        `SELECT id, shareType, shareCount, grantDate as eventDate, reason, createdAt,
                'grant' as eventType, NULL as counterparty
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
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [grantRows] = await (conn as any).execute(
        `SELECT id, shareType, shareCount, grantDate as eventDate, reason, createdAt,
                'grant' as eventType, NULL as counterparty
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

  // 获取指定用户的权重
  getUserWeight: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      const [rows] = await (conn as any).execute(
        `SELECT resource_weight, capital_weight FROM equity_weights WHERE user_id = ?`,
        [input.userId]
      );
      if ((rows as any[]).length === 0) {
        return { resourceWeight: 1.00, capitalWeight: 1.00, totalWeight: 1.00 };
      }
      const row = (rows as any[])[0];
      const r = Number(row.resource_weight);
      const c = Number(row.capital_weight);
      return { resourceWeight: r, capitalWeight: c, totalWeight: Math.round((r * c) * 10000) / 10000 };
    }),

  // 获取所有用户权重（管理员）——从 ledger_members 查该账本所有成员
  getAllWeights: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可访问' });
      }
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      // 从 ledger_members JOIN users 查该账本所有成员
      const [members] = await (conn as any).execute(
        `SELECT lm.userId, u.name, u.username, u.avatar
         FROM ledger_members lm
         LEFT JOIN users u ON u.id = lm.userId
         WHERE lm.ledgerId = ? AND lm.userId > 0
         ORDER BY lm.createdAt ASC`,
        [input.ledgerId]
      );
      // 获取已设置的权重
      const [weights] = await (conn as any).execute(
        `SELECT user_id, resource_weight, capital_weight FROM equity_weights`
      );
      const weightMap = new Map((weights as any[]).map((w: any) => [Number(w.user_id), w]));
      return (members as any[]).map((m: any) => {
        const w = weightMap.get(Number(m.userId));
        const r = w ? Number(w.resource_weight) : 1.00;
        const c = w ? Number(w.capital_weight) : 1.00;
        return {
          userId: m.userId,
          name: m.name || m.username || '未知',
          avatar: m.avatar,
          resourceWeight: r,
          capitalWeight: c,
          totalWeight: Math.round((r * c) * 10000) / 10000,
        };
      });
    }),

  // 设置用户权重（管理员）
  setUserWeight: protectedProcedure
    .input(z.object({
      userId: z.number(),
      resourceWeight: z.number().min(0).max(99),
      capitalWeight: z.number().min(0).max(99),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
      }
      const conn = await (await import('./db')).getDbConnection();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB连接失败' });
      await (conn as any).execute(
        `INSERT INTO equity_weights (user_id, resource_weight, capital_weight)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE resource_weight=VALUES(resource_weight), capital_weight=VALUES(capital_weight), updated_at=NOW()`,
        [input.userId, input.resourceWeight, input.capitalWeight]
      );
      return { success: true };
    }),
});
