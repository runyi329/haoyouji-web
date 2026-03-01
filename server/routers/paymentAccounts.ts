import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import * as dbPaymentAccounts from "../db-payment-accounts";

export const paymentAccountsRouter = router({
  // ========== 银行卡管理 ==========
  // 获取银行卡列表
  getBankCards: protectedProcedure.query(async ({ ctx }) => {
    return await dbPaymentAccounts.getUserBankCards(ctx.user.id);
  }),

  // 添加银行卡
  addBankCard: protectedProcedure
    .input(z.object({
      cardNumber: z.string().min(1),
      cardHolder: z.string().min(1),
      bankName: z.string().min(1),
      cardType: z.enum(["debit", "credit"]),
      isDefault: z.boolean().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await dbPaymentAccounts.addBankCard({
        ...input,
        userId: ctx.user.id,
      });
    }),

  // 更新银行卡
  updateBankCard: protectedProcedure
    .input(z.object({
      cardId: z.string(),
      cardNumber: z.string().optional(),
      cardHolder: z.string().optional(),
      bankName: z.string().optional(),
      cardType: z.enum(["debit", "credit"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { cardId, ...data } = input;
      return await dbPaymentAccounts.updateBankCard(cardId, ctx.user.id, data);
    }),

  // 删除银行卡
  deleteBankCard: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await dbPaymentAccounts.deleteBankCard(input.cardId, ctx.user.id);
    }),

  // 设置默认银行卡
  setDefaultBankCard: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await dbPaymentAccounts.setDefaultBankCard(input.cardId, ctx.user.id);
    }),

  // ========== 数字钱包管理 ==========
  // 获取数字钱包列表
  getDigitalWallets: protectedProcedure.query(async ({ ctx }) => {
    return await dbPaymentAccounts.getUserDigitalWallets(ctx.user.id);
  }),

  // 添加数字钱包
  addDigitalWallet: protectedProcedure
    .input(z.object({
      walletType: z.enum(["blockchain", "alipay", "wechat", "other"]),
      network: z.string().optional(),
      walletAddress: z.string().optional(),
      currency: z.string().optional(),
      account: z.string().optional(),
      accountName: z.string().optional(),
      isDefault: z.boolean().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await dbPaymentAccounts.addDigitalWallet({
        ...input,
        userId: ctx.user.id,
      });
    }),

  // 更新数字钱包
  updateDigitalWallet: protectedProcedure
    .input(z.object({
      walletId: z.string(),
      walletType: z.enum(["blockchain", "alipay", "wechat", "other"]).optional(),
      network: z.string().optional(),
      walletAddress: z.string().optional(),
      currency: z.string().optional(),
      account: z.string().optional(),
      accountName: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { walletId, ...data } = input;
      return await dbPaymentAccounts.updateDigitalWallet(walletId, ctx.user.id, data);
    }),

  // 删除数字钱包
  deleteDigitalWallet: protectedProcedure
    .input(z.object({ walletId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await dbPaymentAccounts.deleteDigitalWallet(input.walletId, ctx.user.id);
    }),

  // 设置默认数字钱包
  setDefaultDigitalWallet: protectedProcedure
    .input(z.object({ walletId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await dbPaymentAccounts.setDefaultDigitalWallet(input.walletId, ctx.user.id);
    }),
});
