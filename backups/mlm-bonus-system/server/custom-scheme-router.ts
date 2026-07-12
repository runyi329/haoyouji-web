/**
 * 自定义奖金制度路由
 */
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { desc, eq, or, and } from "drizzle-orm";
import { getDb } from "./db";
import { customSchemes } from "../drizzle/schema";

export const customSchemeRouter = router({
  // 创建新制度
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        industry: z.string().max(100).default(""),
        schemeType: z.string().max(50).default("staircase"),
        description: z.string().optional(),
        config: z.string(), // JSON string
        color: z.string().max(20).default("#3B82F6"),
        icon: z.string().max(10).default("⭐"),
        isPublic: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");
      const userId = ctx.user?.id ?? null;
      const result = await db.insert(customSchemes).values({
        userId,
        name: input.name,
        industry: input.industry,
        schemeType: input.schemeType,
        description: input.description ?? null,
        config: input.config,
        color: input.color,
        icon: input.icon,
        isPublic: input.isPublic,
      });
      const id = (result as any).insertId as number;
      return { id, success: true };
    }),

  // 获取单个制度
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(customSchemes).where(eq(customSchemes.id, input.id));
      const scheme = rows[0];
      if (!scheme) return null;
      // 只有本人或公开的才能查看
      const userId = ctx.user?.id ?? null;
      if (!scheme.isPublic && scheme.userId !== userId) return null;
      return scheme;
    }),

  // 列出制度（公开 + 自己的）
  list: publicProcedure
    .input(
      z.object({
        page: z.number().default(1),
        pageSize: z.number().default(20),
        onlyMine: z.boolean().default(false),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const userId = ctx.user?.id ?? null;

      let rows;
      if (input.onlyMine && userId) {
        rows = await db
          .select()
          .from(customSchemes)
          .where(eq(customSchemes.userId, userId))
          .orderBy(desc(customSchemes.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);
      } else if (userId) {
        // 公开的 + 自己的
        rows = await db
          .select()
          .from(customSchemes)
          .where(
            or(
              eq(customSchemes.isPublic, true),
              eq(customSchemes.userId, userId)
            )
          )
          .orderBy(desc(customSchemes.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);
      } else {
        // 未登录只看公开的
        rows = await db
          .select()
          .from(customSchemes)
          .where(eq(customSchemes.isPublic, true))
          .orderBy(desc(customSchemes.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);
      }
      return rows;
    }),

  // 更新制度
  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(200).optional(),
        industry: z.string().max(100).optional(),
        schemeType: z.string().max(50).optional(),
        description: z.string().optional(),
        config: z.string().optional(),
        color: z.string().max(20).optional(),
        icon: z.string().max(10).optional(),
        isPublic: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");
      const userId = ctx.user?.id ?? null;
      const existing = await db.select().from(customSchemes).where(eq(customSchemes.id, input.id));
      if (!existing[0]) throw new Error("制度不存在");
      if (existing[0].userId !== userId) throw new Error("无权限修改");
      const { id, ...updates } = input;
      await db.update(customSchemes).set(updates).where(eq(customSchemes.id, id));
      return { success: true };
    }),

  // 删除制度
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");
      const userId = ctx.user?.id ?? null;
      const existing = await db.select().from(customSchemes).where(eq(customSchemes.id, input.id));
      if (!existing[0]) throw new Error("制度不存在");
      if (existing[0].userId !== userId) throw new Error("无权限删除");
      await db.delete(customSchemes).where(eq(customSchemes.id, input.id));
      return { success: true };
    }),
});
