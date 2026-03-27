import { router, protectedProcedure } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as dbRecharge from "../db-recharge";
import { getDb } from "../db";
import * as schema from "../../drizzle/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";

export const rechargeRouter = router({
  // 创建充值订单
  createOrder: protectedProcedure
    .input(z.object({
      amount: z.number().min(1).max(100000),
      network: z.enum(["TRC20", "ERC20", "BEP20", "APTOS", "SOLANA"]).default("TRC20"),
    }))
    .mutation(async ({ ctx, input }) => {
      return await dbRecharge.createRechargeOrder(ctx.user.id, input.amount, input.network);
    }),

  // 用户提交转账确认
  submitTransfer: protectedProcedure
    .input(z.object({ orderNo: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await dbRecharge.submitTransferConfirmation(input.orderNo, ctx.user.id);
    }),

  // 查询充值订单
  getOrder: protectedProcedure
    .input(z.object({ orderNo: z.string() }))
    .query(async ({ input }) => {
      return await dbRecharge.getRechargeOrder(input.orderNo);
    }),

  // 获取用户充值订单列表
  getMyOrders: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      return await dbRecharge.getUserRechargeOrders(ctx.user.id, input.limit);
    }),

  // 获取用户余额
  getBalance: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbRecharge.getUserBalance(ctx.user.id);
    }),

  // 获取余额变动记录
  getBalanceHistory: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      return await dbRecharge.getUserBalanceHistory(ctx.user.id, input.limit);
    }),

  // 用户申请提现
  requestWithdraw: protectedProcedure
    .input(z.object({
      amount: z.number().min(10),
      paymentAccountId: z.number(),
      remark: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await dbRecharge.requestWithdraw(
        ctx.user.id,
        input.amount,
        input.paymentAccountId,
        input.remark
      );
    }),

  // 获取用户提现记录
  getMyWithdrawHistory: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      return await dbRecharge.getUserWithdrawHistory(ctx.user.id, input.limit);
    }),

  // === 管理员功能 ===

  // 获取所有待处理订单
  adminGetPendingOrders: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }
      return await dbRecharge.getAllPendingOrders();
    }),
  // 获取所有充值订单
  adminGetAllOrders: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }
      return await dbRecharge.getAllOrders(input.limit);
    }),
  // 获取未匹配交易列表
  adminGetUnmatchedTransactions: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }
      return await dbRecharge.getUnmatchedTransactions();
    }),

  // 管理员手动确认充值
  adminConfirmRecharge: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      txnHash: z.string().optional(),
      actualAmount: z.number().min(0.01),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }
      return await dbRecharge.adminConfirmRecharge(
        ctx.user.id, input.orderId, input.txnHash, input.actualAmount
      );
    }),

  // 管理员审核提现
  adminDirectRecharge: protectedProcedure
    .input(z.object({
      userId: z.number(),
      amount: z.number().min(0.01),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }
      return await dbRecharge.adminDirectRecharge(
        ctx.user.id, input.userId, input.amount, input.description
      );
    }),

  // 获取系统统计信息
  adminGetSystemStats: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }
      return await dbRecharge.getSystemStats();
    }),
  // 管理员获取扫描器心跳状态
  adminGetScannerHeartbeat: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }
      const db = await getDb();
      const heartbeat = await db
        .select()
        .from(schema.scannerHeartbeat)
        .where(eq(schema.scannerHeartbeat.scannerType, "blockchain"))
        .limit(1);

      if (heartbeat.length === 0) {
        return null;
      }

      return heartbeat[0];
    }),

  // 管理员添加收款地址
  adminAddWalletAddress: protectedProcedure
    .input(z.object({
      address: z.string().min(1),
      network: z.string().min(1),
      label: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }
      return await dbRecharge.addWalletAddress(input.address, input.network, input.label);
    }),
  // 管理员更新收款地址
  adminUpdateWalletAddress: protectedProcedure
    .input(z.object({
      id: z.number(),
      address: z.string().optional(),
      network: z.string().optional(),
      label: z.string().optional(),
      enabled: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }
      const { id, ...data } = input;
      return await dbRecharge.updateWalletAddress(id, data);
    }),
  // 管理员删除收款地址
  adminDeleteWalletAddress: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }
      return await dbRecharge.deleteWalletAddress(input.id);
    }),
  // 管理员一键修复扫描器
  adminFixScanner: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new Error("无权限");
      }

      const results: string[] = [];
      const db = await getDb();

      try {
        // 1. 检查scanner_heartbeat表是否存在
        results.push("步骤1: 检查scanner_heartbeat表...");
        try {
          await db.select().from(schema.scannerHeartbeat).limit(1);
          results.push("✅ scanner_heartbeat表存在");
        } catch (error) {
          results.push("⚠️ scanner_heartbeat表不存在，尝试创建...");
          // 执行创建表SQL
          const createTableSQL = `
            CREATE TABLE IF NOT EXISTS scanner_heartbeat (
              id INT AUTO_INCREMENT PRIMARY KEY,
              scanner_type VARCHAR(50) NOT NULL,
              last_scan_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              scan_count INT DEFAULT 0,
              success_count INT DEFAULT 0,
              error_count INT DEFAULT 0,
              last_error TEXT,
              scanned_addresses INT DEFAULT 0,
              found_transactions INT DEFAULT 0,
              matched_orders INT DEFAULT 0,
              unmatched_transactions INT DEFAULT 0,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY unique_scanner_type (scanner_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `;
          await db.execute(sql`${createTableSQL}`);
          results.push("✅ scanner_heartbeat表创建成功");
        }

        // 2. 检查用户是否已启用收款地址
        results.push("步骤2: 检查用户是否已启用收款地址...");
        const enabledAddresses = await db.query.walletAddresses.findMany({
          where: and(
            eq(schema.walletAddresses.userId, ctx.user.id),
            eq(schema.walletAddresses.enabled, true)
          ),
        });

        if (enabledAddresses.length === 0) {
          return {
            success: false,
            message: "没有启用的收款地址",
            logs: results,
          };
        } else {
          results.push(`✅ 找到 ${enabledAddresses.length} 个启用的收款地址`);
        }

        // 3. 初始化心跳记录
        results.push("步骤3: 初始化心跳记录...");
        const existingHeartbeat = await db
          .select()
          .from(schema.scannerHeartbeat)
          .where(eq(schema.scannerHeartbeat.scannerType, "blockchain"))
          .limit(1);

        if (existingHeartbeat.length === 0) {
          await db.insert(schema.scannerHeartbeat).values({
            scannerType: "blockchain",
            lastScanAt: new Date(),
            scanCount: 0,
            successCount: 0,
            errorCount: 0,
            scannedAddresses: 0,
            foundTransactions: 0,
            matchedOrders: 0,
            unmatchedTransactions: 0,
          });
          results.push("✅ 区块链扫描器心跳记录初始化成功");
        } else {
          results.push("✅ 区块链扫描器心跳记录已存在，无需初始化");
        }

        results.push("✅ 区块链扫描器修复完成");
        return {
          success: true,
          message: "区块链扫描器修复完成",
          logs: results,
        };
      } catch (error: any) {
        results.push(`❌ 修复失败: ${error.message}`);
        return {
          success: false,
          message: "区块链扫描器修复失败",
          logs: results,
        };
      }
    }),
});

// 区块链扫描器修复工具
export const fixScannerHeartbeat = protectedProcedure
  .mutation(async ({ ctx }) => {
    const results: string[] = [];
    try {
      results.push("开始修复区块链扫描器心跳记录...");
      // 1. 检查用户是否已启用收款地址
      results.push("步骤1: 检查用户是否已启用收款地址...");
      const enabledAddresses = await db.query.walletAddresses.findMany({
        where: and(
          eq(schema.walletAddresses.userId, ctx.user.id),
          eq(schema.walletAddresses.enabled, true)
        ),
      });

      if (enabledAddresses.length === 0) {
        return {
          success: false,
          message: "没有启用的收款地址",
          logs: results,
        };
      } else {
        results.push(`✅ 找到 ${enabledAddresses.length} 个启用的收款地址`);
      }

      // 3. 初始化心跳记录
      results.push("步骤3: 初始化心跳记录...");
      const existingHeartbeat = await db
        .select()
        .from(schema.scannerHeartbeat)
        .where(eq(schema.scannerHeartbeat.scannerType, "blockchain"))
        .limit(1);

      if (existingHeartbeat.length === 0) {
        await db.insert(schema.scannerHeartbeat).values({
          scannerType: "blockchain",
          lastScanAt: new Date(),
          scanCount: 0,
          successCount: 0,
          errorCount: 0,
          scannedAddresses: 0,
          foundTransactions: 0,
          matchedOrders: 0,
          unmatchedTransactions: 0,
        });
        results.push("✅ 区块链扫描器心跳记录初始化成功");
      } else {
        results.push("✅ 区块链扫描器心跳记录已存在，无需初始化");
      }

      results.push("✅ 区块链扫描器修复完成");
      return {
        success: true,
        message: "区块链扫描器修复完成",
        logs: results,
      };
    } catch (error: any) {
      results.push(`❌ 修复失败: ${error.message}`);
      return {
        success: false,
        message: "区块链扫描器修复失败",
        logs: results,
      };
    }
  });
