/**
 * qiban-router.ts - 企伴 tRPC 路由
 *
 * 命名空间：qiban（所有过程名加 qiban. 前缀，防止与脉动网现有过程名冲突）
 * 数据库：使用脉动网腾讯云 MySQL（本地部署），表名加 qiban_ 前缀
 * 数据：手动维护，不自动触发部署
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure, adminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  qibanCompanies,
  qibanPartnerships,
  qibanContracts,
  qibanContacts,
  qibanClientCompanies,
  qibanDeclarations,
  qibanInvoiceSuggestions,
} from "../drizzle/schema";
import { eq, desc, and, like, sql } from "drizzle-orm";

export const qibanRouter = router({
  // ─── 统计数据 ────────────────────────────────────────────────────────────────
  getStats: publicProcedure.query(async () => {
    try {
      const db = await getDb();
      if (!db) return { companyCount: 0, partnershipCount: 0, contractCount: 0 };
      const [companyCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(qibanCompanies);
      const [partnershipCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(qibanPartnerships);
      const [contractCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(qibanContracts);
      return {
        companyCount: Number(companyCount?.count ?? 0),
        partnershipCount: Number(partnershipCount?.count ?? 0),
        contractCount: Number(contractCount?.count ?? 0),
      };
    } catch {
      return { companyCount: 0, partnershipCount: 0, contractCount: 0 };
    }
  }),

  // ─── 企业档案 ────────────────────────────────────────────────────────────────
  listCompanies: protectedProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
        industry: z.string().optional(),
        status: z.enum(["active", "inactive", "pending"]).optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const offset = (input.page - 1) * input.pageSize;
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.keyword) {
        conditions.push(like(qibanCompanies.name, `%${input.keyword}%`));
      }
      if (input.industry) {
        conditions.push(eq(qibanCompanies.industry, input.industry));
      }
      if (input.status) {
        conditions.push(eq(qibanCompanies.status, input.status));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db
        .select()
        .from(qibanCompanies)
        .where(where)
        .orderBy(desc(qibanCompanies.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(qibanCompanies)
        .where(where);
      return { rows, total: Number(total?.count ?? 0) };
    }),

  getCompany: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [row] = await db
        .select()
        .from(qibanCompanies)
        .where(eq(qibanCompanies.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
      return row;
    }),

  createCompany: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        shortName: z.string().max(64).optional(),
        unifiedCode: z.string().max(32).optional(),
        industry: z.string().max(64).optional(),
        province: z.string().max(32).optional(),
        city: z.string().max(32).optional(),
        address: z.string().optional(),
        contactName: z.string().max(64).optional(),
        contactPhone: z.string().max(20).optional(),
        contactEmail: z.string().max(128).optional(),
        website: z.string().max(255).optional(),
        logoUrl: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        status: z.enum(["active", "inactive", "pending"]).default("active"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const { tags, ...rest } = input;
      const [result] = await db.insert(qibanCompanies).values({
        ...rest,
        tags: tags ? JSON.stringify(tags) : null,
        createdBy: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  updateCompany: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        shortName: z.string().max(64).optional(),
        unifiedCode: z.string().max(32).optional(),
        industry: z.string().max(64).optional(),
        province: z.string().max(32).optional(),
        city: z.string().max(32).optional(),
        address: z.string().optional(),
        contactName: z.string().max(64).optional(),
        contactPhone: z.string().max(20).optional(),
        contactEmail: z.string().max(128).optional(),
        website: z.string().max(255).optional(),
        logoUrl: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        status: z.enum(["active", "inactive", "pending"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const { id, tags, ...rest } = input;
      const [existing] = await db
        .select({ createdBy: qibanCompanies.createdBy })
        .from(qibanCompanies)
        .where(eq(qibanCompanies.id, id));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
      if (existing.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权修改此企业" });
      }
      await db
        .update(qibanCompanies)
        .set({ ...rest, ...(tags !== undefined ? { tags: JSON.stringify(tags) } : {}) })
        .where(eq(qibanCompanies.id, id));
      return { ok: true };
    }),

  deleteCompany: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [existing] = await db
        .select({ createdBy: qibanCompanies.createdBy })
        .from(qibanCompanies)
        .where(eq(qibanCompanies.id, input.id));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
      if (existing.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权删除此企业" });
      }
      await db.delete(qibanCompanies).where(eq(qibanCompanies.id, input.id));
      return { ok: true };
    }),

  // ─── 合作项目 ────────────────────────────────────────────────────────────────
  listPartnerships: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["draft", "negotiating", "signed", "completed", "cancelled"])
          .optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const offset = (input.page - 1) * input.pageSize;
      const conditions: ReturnType<typeof eq>[] = [eq(qibanPartnerships.createdBy, ctx.user.id)];
      if (input.status) {
        conditions.push(eq(qibanPartnerships.status, input.status));
      }
      const rows = await db
        .select()
        .from(qibanPartnerships)
        .where(and(...conditions))
        .orderBy(desc(qibanPartnerships.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(qibanPartnerships)
        .where(and(...conditions));
      return { rows, total: Number(total?.count ?? 0) };
    }),

  createPartnership: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        companyAId: z.number(),
        companyBId: z.number().optional(),
        type: z
          .enum(["supply", "distribution", "investment", "tech", "other"])
          .default("other"),
        status: z
          .enum(["draft", "negotiating", "signed", "completed", "cancelled"])
          .default("draft"),
        description: z.string().optional(),
        expectedAmount: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [result] = await db.insert(qibanPartnerships).values({
        ...input,
        createdBy: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  // ─── 合同管理 ────────────────────────────────────────────────────────────────
  listContracts: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["draft", "signed", "expired", "terminated"])
          .optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const offset = (input.page - 1) * input.pageSize;
      const conditions: ReturnType<typeof eq>[] = [eq(qibanContracts.createdBy, ctx.user.id)];
      if (input.status) {
        conditions.push(eq(qibanContracts.status, input.status));
      }
      const rows = await db
        .select()
        .from(qibanContracts)
        .where(and(...conditions))
        .orderBy(desc(qibanContracts.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(qibanContracts)
        .where(and(...conditions));
      return { rows, total: Number(total?.count ?? 0) };
    }),

  createContract: protectedProcedure
    .input(
      z.object({
        partnershipId: z.number().optional(),
        title: z.string().min(1).max(255),
        partyA: z.string().min(1).max(255),
        partyB: z.string().min(1).max(255),
        amount: z.string().optional(),
        signDate: z.string().optional(),
        expiryDate: z.string().optional(),
        fileUrl: z.string().optional(),
        status: z
          .enum(["draft", "signed", "expired", "terminated"])
          .default("draft"),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [result] = await db.insert(qibanContracts).values({
        ...input,
        createdBy: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  // ─── 人脉联系人 ──────────────────────────────────────────────────────────────
  listContacts: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        keyword: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const offset = (input.page - 1) * input.pageSize;
      const conditions: ReturnType<typeof eq>[] = [eq(qibanContacts.createdBy, ctx.user.id)];
      if (input.companyId) {
        conditions.push(eq(qibanContacts.companyId, input.companyId));
      }
      if (input.keyword) {
        conditions.push(like(qibanContacts.name, `%${input.keyword}%`));
      }
      const rows = await db
        .select()
        .from(qibanContacts)
        .where(and(...conditions))
        .orderBy(desc(qibanContacts.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(qibanContacts)
        .where(and(...conditions));
      return { rows, total: Number(total?.count ?? 0) };
    }),

  createContact: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        name: z.string().min(1).max(64),
        title: z.string().max(64).optional(),
        phone: z.string().max(20).optional(),
        email: z.string().max(128).optional(),
        wechat: z.string().max(64).optional(),
        avatarUrl: z.string().optional(),
        tags: z.array(z.string()).optional(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const { tags, ...rest } = input;
      const [result] = await db.insert(qibanContacts).values({
        ...rest,
        tags: tags ? JSON.stringify(tags) : null,
        createdBy: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  // ─── 代理记账管理（adminProcedure，仅超级管理员可用） ─────────────────────────

  /** 获取企伴客户端企业列表（含审核状态筛选） */
  adminListClientCompanies: adminProcedure
    .input(
      z.object({
        status: z.enum(["pending", "active", "rejected"]).optional(),
        keyword: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [];
      if (input.status) conditions.push(eq(qibanClientCompanies.status, input.status));
      if (input.keyword) conditions.push(like(qibanClientCompanies.name, `%${input.keyword}%`));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db
        .select()
        .from(qibanClientCompanies)
        .where(where)
        .orderBy(desc(qibanClientCompanies.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(qibanClientCompanies)
        .where(where);
      return { rows, total: Number(total?.count ?? 0) };
    }),

  /** 审核企业：通过或拒绝 */
  adminReviewCompany: adminProcedure
    .input(
      z.object({
        companyId: z.number(),
        action: z.enum(["approve", "reject"]),
        rejectReason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [existing] = await db
        .select()
        .from(qibanClientCompanies)
        .where(eq(qibanClientCompanies.id, input.companyId));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
      await db
        .update(qibanClientCompanies)
        .set({
          status: input.action === "approve" ? "active" : "rejected",
          rejectReason: input.action === "reject" ? (input.rejectReason ?? "审核未通过") : null,
        })
        .where(eq(qibanClientCompanies.id, input.companyId));
      return { ok: true };
    }),

  /** 获取某企业的申报表列表 */
  adminListDeclarations: adminProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        period: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [];
      if (input.companyId) conditions.push(eq(qibanDeclarations.companyId, input.companyId));
      if (input.period) conditions.push(eq(qibanDeclarations.period, input.period));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db
        .select()
        .from(qibanDeclarations)
        .where(where)
        .orderBy(desc(qibanDeclarations.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(qibanDeclarations)
        .where(where);
      return { rows, total: Number(total?.count ?? 0) };
    }),

  /**
   * 上传申报表并用 AI 解析财税数据，写入 declarations 表
   * 支持图片（base64）或文本内容直接传入
   */
  adminUploadDeclaration: adminProcedure
    .input(
      z.object({
        companyId: z.number(),
        period: z.string().min(1).max(10),
        declarationType: z.string().optional().default("增值税申报表"),
        /** base64 编码的文件内容（图片/PDF），或直接传入文本内容 */
        fileData: z.string().optional(),
        fileName: z.string().optional(),
        fileMime: z.string().optional(),
        /** 直接传入的文本内容（优先于 fileData） */
        textContent: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

      // 1. 确认企业存在
      const [company] = await db
        .select()
        .from(qibanClientCompanies)
        .where(eq(qibanClientCompanies.id, input.companyId));
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });

      // 2. 上传文件到 COS（如有）
      let fileKey: string | null = null;
      if (input.fileData && input.fileName && input.fileMime) {
        try {
          const { uploadFileToCOS } = await import('./cos-upload');
          const url = await uploadFileToCOS(
            input.fileData,
            'qiban-declarations',
            input.fileName,
            input.fileMime
          );
          fileKey = url;
        } catch (e) {
          console.error('[qiban] 文件上传失败:', e);
        }
      }

      // 3. 用 LLM 解析财税数据
      let revenue: string | null = null;
      let cost: string | null = null;
      let profit: string | null = null;
      let taxAmount: string | null = null;
      let taxPaid: string | null = null;
      let notes: string | null = null;

      const contentToAnalyze = input.textContent || (fileKey ? `文件已上传：${fileKey}` : null);
      if (contentToAnalyze) {
        try {
          const { invokeLLM } = await import('./_core/llm');
          const prompt = `你是一名专业的财税数据提取助手。请从以下申报表内容中提取关键财务数据，以 JSON 格式返回。

申报表内容：
${contentToAnalyze}

请提取并返回以下字段（金额单位：元，无法提取的字段返回 null）：
{
  "revenue": 收入总额（数字或null）,
  "cost": 成本总额（数字或null）,
  "profit": 利润总额（数字或null）,
  "taxAmount": 应纳税额（数字或null）,
  "taxPaid": 已缴税额（数字或null）,
  "notes": 备注说明（字符串，简述申报表类型和关键信息）
}

只返回 JSON，不要其他文字。`;

          const result = await invokeLLM({
            messages: [{ role: 'user', content: prompt }],
            model: 'claude-3-5-haiku',
            temperature: 0,
          });

          const rawContent = result.content || '';
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            revenue = parsed.revenue != null ? String(parsed.revenue) : null;
            cost = parsed.cost != null ? String(parsed.cost) : null;
            profit = parsed.profit != null ? String(parsed.profit) : null;
            taxAmount = parsed.taxAmount != null ? String(parsed.taxAmount) : null;
            taxPaid = parsed.taxPaid != null ? String(parsed.taxPaid) : null;
            notes = parsed.notes || null;
          }
        } catch (e) {
          console.error('[qiban] AI 解析失败:', e);
          notes = '文件已上传，AI 解析失败，请手动填写数据';
        }
      }

      // 4. 写入 declarations 表
      const [result] = await db.insert(qibanDeclarations).values({
        companyId: input.companyId,
        period: input.period,
        declarationType: input.declarationType,
        fileKey: fileKey,
        revenue: revenue as any,
        cost: cost as any,
        profit: profit as any,
        taxAmount: taxAmount as any,
        taxPaid: taxPaid as any,
        status: 'submitted',
        notes: notes,
      });

      // 5. 更新企业健康评分（简单算法：根据利润率计算）
      if (revenue && profit) {
        const rev = parseFloat(revenue);
        const pro = parseFloat(profit);
        if (rev > 0) {
          const margin = pro / rev;
          const score = Math.min(100, Math.max(0, Math.round(50 + margin * 100)));
          await db
            .update(qibanClientCompanies)
            .set({ healthScore: score })
            .where(eq(qibanClientCompanies.id, input.companyId));
        }
      }

      return {
        id: (result as any).insertId,
        revenue,
        cost,
        profit,
        taxAmount,
        taxPaid,
        notes,
        fileKey,
      };
    }),

  /** 手动更新申报表数据（管理员手动修正 AI 解析结果） */
  adminUpdateDeclaration: adminProcedure
    .input(
      z.object({
        id: z.number(),
        revenue: z.string().optional(),
        cost: z.string().optional(),
        profit: z.string().optional(),
        taxAmount: z.string().optional(),
        taxPaid: z.string().optional(),
        status: z.enum(["draft", "submitted", "accepted", "rejected"]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const { id, ...rest } = input;
      await db
        .update(qibanDeclarations)
        .set(rest as any)
        .where(eq(qibanDeclarations.id, id));
      return { ok: true };
    }),

  /** 添加成本票建议 */
  adminAddInvoiceSuggestion: adminProcedure
    .input(
      z.object({
        companyId: z.number(),
        period: z.string().min(1).max(10),
        category: z.string().optional(),
        suggestedAmount: z.string().optional(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [result] = await db.insert(qibanInvoiceSuggestions).values({
        companyId: input.companyId,
        period: input.period,
        category: input.category,
        suggestedAmount: input.suggestedAmount as any,
        reason: input.reason,
      });
      return { id: (result as any).insertId };
    }),

  /** 获取某企业的成本票建议列表 */
  adminListInvoiceSuggestions: adminProcedure
    .input(
      z.object({
        companyId: z.number(),
        period: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [] };
      const conditions: any[] = [eq(qibanInvoiceSuggestions.companyId, input.companyId)];
      if (input.period) conditions.push(eq(qibanInvoiceSuggestions.period, input.period));
      const rows = await db
        .select()
        .from(qibanInvoiceSuggestions)
        .where(and(...conditions))
      .orderBy(desc(qibanInvoiceSuggestions.createdAt));
      return { rows };
    }),

  // ─── 企伴客户端用户接口（protectedProcedure，按 userId 隔离） ─────────────────

  /** 获取当前用户名下的企业列表（含状态和健康评分） */
  getMyCompanies: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { rows: [] };
    const rows = await db
      .select()
      .from(qibanClientCompanies)
      .where(eq(qibanClientCompanies.userId, ctx.user.id))
      .orderBy(desc(qibanClientCompanies.createdAt));
    return { rows };
  }),

  /** 提交新企业审核申请 */
  submitCompany: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        creditCode: z.string().min(1).max(50),
        legalPerson: z.string().max(100).optional(),
        licenseImageKey: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      // 检查是否已存在相同信用代码
      const [existing] = await db
        .select({ id: qibanClientCompanies.id })
        .from(qibanClientCompanies)
        .where(eq(qibanClientCompanies.creditCode, input.creditCode));
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "该统一社会信用代码已存在，请勿重复提交" });
      }
      const [result] = await db.insert(qibanClientCompanies).values({
        userId: ctx.user.id,
        name: input.name,
        creditCode: input.creditCode,
        legalPerson: input.legalPerson ?? null,
        licenseImageKey: input.licenseImageKey ?? null,
        status: "pending",
      });
      return { id: (result as any).insertId };
    }),

  /** 获取指定企业的申报明细（仅限本人企业） */
  getDeclarations: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      // 校验企业归属
      const [company] = await db
        .select({ userId: qibanClientCompanies.userId })
        .from(qibanClientCompanies)
        .where(eq(qibanClientCompanies.id, input.companyId));
      if (!company || company.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权访问该企业数据" });
      }
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db
        .select()
        .from(qibanDeclarations)
        .where(eq(qibanDeclarations.companyId, input.companyId))
        .orderBy(desc(qibanDeclarations.period))
        .limit(input.pageSize)
        .offset(offset);
      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(qibanDeclarations)
        .where(eq(qibanDeclarations.companyId, input.companyId));
      return { rows, total: Number(total?.count ?? 0) };
    }),

  /** 获取指定企业的成本票建议（仅限本人企业） */
  getInvoiceSuggestions: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        period: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { rows: [] };
      // 校验企业归属
      const [company] = await db
        .select({ userId: qibanClientCompanies.userId })
        .from(qibanClientCompanies)
        .where(eq(qibanClientCompanies.id, input.companyId));
      if (!company || company.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权访问该企业数据" });
      }
      const conditions: any[] = [eq(qibanInvoiceSuggestions.companyId, input.companyId)];
      if (input.period) conditions.push(eq(qibanInvoiceSuggestions.period, input.period));
      const rows = await db
        .select()
        .from(qibanInvoiceSuggestions)
        .where(and(...conditions))
        .orderBy(desc(qibanInvoiceSuggestions.createdAt));
      return { rows };
    }),
});
