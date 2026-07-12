/**
 * 全局搜索路由 - 基于数据库的公司目录搜索
 */
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { like, or, eq, asc } from "drizzle-orm";
import { getDb } from "./db";
import { companyCatalog } from "../drizzle/schema";

export const searchRouter = router({
  /**
   * 搜索公司目录
   * 支持：公司名称、英文名、制度类型、简介、标签
   */
  companies: publicProcedure
    .input(
      z.object({
        query: z.string().max(100).default(""),
        schemeType: z.string().max(50).default(""),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { results: [], total: 0 };

      const { query, schemeType } = input;
      const q = query.trim();

      // 构建查询条件
      let rows;

      if (!q && !schemeType) {
        // 无条件：返回全部，按 sortOrder 排序
        rows = await db
          .select()
          .from(companyCatalog)
          .orderBy(asc(companyCatalog.sortOrder));
      } else if (!q && schemeType) {
        // 仅按制度类型筛选
        rows = await db
          .select()
          .from(companyCatalog)
          .where(eq(companyCatalog.schemeType, schemeType))
          .orderBy(asc(companyCatalog.sortOrder));
      } else {
        // 全文搜索（MySQL LIKE 多字段 OR）
        const likeQ = `%${q}%`;
        const conditions = or(
          like(companyCatalog.name, likeQ),
          like(companyCatalog.nameEn, likeQ),
          like(companyCatalog.schemeType, likeQ),
          like(companyCatalog.tagline, likeQ),
          like(companyCatalog.subtitle, likeQ),
          like(companyCatalog.description, likeQ),
          like(companyCatalog.features, likeQ),
          like(companyCatalog.tag, likeQ)
        );

        if (schemeType) {
          // 搜索词 + 制度类型双重过滤
          rows = await db
            .select()
            .from(companyCatalog)
            .where(
              // 同时满足：制度类型匹配 AND 搜索词命中任意字段
              // Drizzle 暂不支持直接 and(eq, or)，用 SQL 原生方式
              // 退而求其次：先按搜索词过滤，再在应用层过滤 schemeType
              conditions
            )
            .orderBy(asc(companyCatalog.sortOrder));
          // 应用层追加 schemeType 过滤
          rows = rows.filter((r) => r.schemeType === schemeType);
        } else {
          rows = await db
            .select()
            .from(companyCatalog)
            .where(conditions)
            .orderBy(asc(companyCatalog.sortOrder));
        }
      }

      // 解析 features JSON
      const results = rows.map((r) => ({
        ...r,
        features: (() => {
          try {
            return JSON.parse(r.features) as string[];
          } catch {
            return [r.features];
          }
        })(),
      }));

      return { results, total: results.length };
    }),

  /**
   * 获取所有制度类型（用于筛选标签）
   */
  schemeTypes: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return ["全部"];
    const rows = await db
      .selectDistinct({ schemeType: companyCatalog.schemeType })
      .from(companyCatalog)
      .orderBy(asc(companyCatalog.schemeType));
    return ["全部", ...rows.map((r) => r.schemeType)];
  }),
});
