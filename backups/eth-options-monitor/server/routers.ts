import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getBuyRecordsByClientId, insertBuyRecord, deleteBuyRecord } from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ─── 持仓记录接口 ─────────────────────────────────────────
  records: router({
    /** 查询指定 clientId 的所有持仓记录 */
    list: publicProcedure
      .input(z.object({ clientId: z.string().min(1) }))
      .query(async ({ input }) => {
        return getBuyRecordsByClientId(input.clientId);
      }),

    /** 新增一条持仓记录 */
    add: publicProcedure
      .input(
        z.object({
          id: z.string(),
          clientId: z.string().min(1),
          instrumentName: z.string(),
          strike: z.number().int(),
          expiryLabel: z.string(),
          annualizedRate: z.number().nullable().optional(),
          markPriceUsd: z.number().nullable().optional(),
          ethPriceAtBuy: z.number(),
          trueBreakeven: z.number().nullable().optional(),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await insertBuyRecord({
          id: input.id,
          clientId: input.clientId,
          instrumentName: input.instrumentName,
          strike: input.strike,
          expiryLabel: input.expiryLabel,
          annualizedRate: input.annualizedRate ?? null,
          markPriceUsd: input.markPriceUsd ?? null,
          ethPriceAtBuy: input.ethPriceAtBuy,
          trueBreakeven: input.trueBreakeven ?? null,
          note: input.note ?? null,
        });
        return { success: true };
      }),

    /** 删除一条持仓记录 */
    delete: publicProcedure
      .input(z.object({ id: z.string(), clientId: z.string() }))
      .mutation(async ({ input }) => {
        await deleteBuyRecord(input.id, input.clientId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
