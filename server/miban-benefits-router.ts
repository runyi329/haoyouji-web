import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { MIBAN_BENEFITS_STOREFRONT } from "../shared/miban-benefits";
import {
  getMibanBenefitsCatalog,
  getMibanBenefitsUsers,
  getMibanBenefitsRules,
  getMibanBenefitsAudits,
  saveMibanBenefitRule,
  setMibanBenefitState,
  getMyMibanBenefits,
  getMibanBenefitQuote,
  mibanBenefitRuleInputSchema,
} from "./miban-benefits";
const admin = protectedProcedure.use(({ ctx, next }) => {
  // Suppliers, impersonated non-admins and realUser escalation are deliberately NOT authorized.
  if ((ctx.user.role as string) !== "super_admin")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "仅系统超级管理员可管理用户优惠",
    });
  return next({ ctx });
});
const storefront = z.literal(MIBAN_BENEFITS_STOREFRONT);
const base = z.object({ storefront });
const user = base.extend({ userId: z.number().int().positive() });
const cart = base.extend({
  items: z
    .array(
      z.object({
        productKey: z.string().min(1).max(80),
        skuId: z.string().min(1).max(80),
        quantity: z.number().int().min(1).max(20),
      })
    )
    .min(1)
    .max(100),
  mode: z.enum(["once", "annual"]).default("once"),
});
export const mibanBenefitsRouter = router({
  catalog: admin
    .input(base)
    .query(({ input }) => getMibanBenefitsCatalog(input.storefront)),
  users: admin
    .input(
      base.extend({
        keyword: z.string().max(200).default(""),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(30),
        filter: z.enum(["all", "with", "without"]).default("all"),
      })
    )
    .query(({ input }) => getMibanBenefitsUsers(input)),
  rules: admin
    .input(user)
    .query(({ input }) =>
      getMibanBenefitsRules(input.userId, input.storefront)
    ),
  audits: admin
    .input(
      user.extend({
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(200),
      })
    )
    .query(({ input }) =>
      getMibanBenefitsAudits(
        input.userId,
        input.storefront,
        input.offset,
        input.limit
      )
    ),
  save: admin
    .input(
      user.extend({
        rule: mibanBenefitRuleInputSchema,
        count: z.number().int().min(1).max(20).default(1),
        requestId: z.string().uuid(),
      })
    )
    .mutation(({ ctx, input }) => saveMibanBenefitRule(ctx.user, input)),
  state: admin
    .input(
      user.extend({
        ruleId: z.string().min(1).max(64),
        version: z.number().int().positive(),
        next: z.enum(["active", "paused", "revoked"]),
        reason: z.string().trim().min(1).max(1000),
      })
    )
    .mutation(({ ctx, input }) => setMibanBenefitState(ctx.user, input)),
  my: protectedProcedure
    .input(base)
    .query(({ ctx, input }) =>
      getMyMibanBenefits(ctx.user.id, input.storefront)
    ),
  quote: protectedProcedure
    .input(cart)
    .query(({ ctx, input }) =>
      getMibanBenefitQuote(ctx.user.id, input.items, input.mode)
    ),
  preview: admin
    .input(cart.extend({ userId: z.number().int().positive() }))
    .query(({ input }) =>
      getMibanBenefitQuote(input.userId, input.items, input.mode)
    ),
});
