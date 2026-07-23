/**
 * qiban-router.ts - 企伴 tRPC 路由
 *
 * 命名空间：qiban（所有过程名加 qiban. 前缀，防止与脉动网现有过程名冲突）
 * 数据库：使用脉动网腾讯云 MySQL（本地部署），表名加 qiban_ 前缀
 * 数据：手动维护，不自动触发部署
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  qibanCompanies,
  qibanPartnerships,
  qibanContracts,
  qibanContacts,
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
});
