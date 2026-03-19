import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { loginWithPassword, registerWithPassword, hashPassword } from "./auth";
import { sdk } from "./_core/sdk";
import { textToSpeech } from "./_core/tts";
import * as dbContacts from "./db-contacts";
import * as dbReminderTypes from "./db-reminder-types";
import * as dbReferrerStats from "./db-referrer-stats";
import * as dbAnalytics from "./db-analytics";
import * as dbPoints from "./db-points";
import * as dbTagAnalytics from "./db-tag-analytics";
import { addPointsForAction } from "./db-point-system";
import * as dbLedger from "./db-ledger";
import * as dbEquity from "./db-equity";
import * as dbCoupon from "./db-coupon";
import * as dbPaymentAccounts from "./db-payment-accounts";
import * as dbRecharge from "./db-recharge";
import * as dbAIEmployee from "./db-ai-employee";
import { getDb, getDbConnection, getLedgerDb } from "./db";
import { contacts, contactFieldCategories, contactFieldValues, contactTags, users, sharingNotifications, sharingAuthorizations, contactSharingConnections, scannerHeartbeat, walletAddresses, rechargeOrders, ledgers, ledgerRecords, ledgerCategories, agPromptImages, agSyncSources, agSyncLogs, ahCompanies, ahTaxAuthorizations, ahCompanyMembers } from "../drizzle/schema";
import * as schema from "../drizzle/schema";
import { eq, and, desc, sql, isNull, inArray, like, or, gt } from "drizzle-orm";
import { inviteRouter } from "./invite-api";
import { equityRouter } from "./equity-router";
import { invitePermissionRouter } from "./invite-permission-api";
import { workGroupsRouter } from "./work-groups-api";
import { partnershipRouter } from "./partnership-router";
import { posterFavoritesRouter } from "./poster-favorites-router";
import { beautyRouter } from "./beauty-router";
import { dietRouter } from "./diet-router";
import { merchantRouter } from "./merchant-router";
import { lotteryRouter } from "./lottery-router";
import { predictionRouter } from "./prediction-router";
import { okxTraderRouter } from "./okx-trader-router";
import * as dbMemo from "./db-memo";
// 数据库初始化功能已禁用
// import { initDatabase } from "./db-init";

import ExcelJS from "exceljs";

// // 在应用启动时初始化数据库
// initDatabase().catch(err => {
//   console.error("[DB Init] Failed to initialize database:", err);
// });


// ===== 行情数据内存缓存（30秒TTL，避免重复请求外部API）=====
const _marketCache = new Map<string, { data: any; ts: number }>();
const MARKET_CACHE_TTL = 30_000; // 30秒
function getCache(key: string): any | null {
  const entry = _marketCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > MARKET_CACHE_TTL) { _marketCache.delete(key); return null; }
  return entry.data;
}
function setCache(key: string, data: any): void {
  _marketCache.set(key, { data, ts: Date.now() });
}
// ================================================================

// Manus 聊天功能（管理员发送消息/文件给用户）
const manusRouter = router({
  // 管理员发送消息（文字或文件）
  sendMessage: protectedProcedure
    .input(z.object({
      content: z.string().optional(),
      fileData: z.string().optional(),
      fileName: z.string().optional(),
      fileType: z.enum(['image', 'pdf', 'ppt', 'excel', 'other']).optional(),
      fileSize: z.number().optional(),
      fileMime: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可发送消息' });
      }
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      let fileUrl: string | undefined;
      if (input.fileData && input.fileName && input.fileMime) {
        const isImage = input.fileType === 'image';
        if (isImage) {
          const { uploadImageToCOS } = await import('./cos-upload');
          fileUrl = await uploadImageToCOS(input.fileData, 'ledger-photos', `manus-${input.fileName}`);
        } else {
          const { uploadFileToCOS } = await import('./cos-upload');
          fileUrl = await uploadFileToCOS(input.fileData, 'manus-files', input.fileName, input.fileMime);
        }
      }
      await dbConn.execute(
        `INSERT INTO manus_messages (sender, content, file_url, file_name, file_type, file_size) VALUES (?, ?, ?, ?, ?, ?)`,
        ['admin', input.content || null, fileUrl || null, input.fileName || null, input.fileType || null, input.fileSize || null]
      );
      return { success: true };
    }),

  // 获取消息列表
  getMessages: protectedProcedure
    .input(z.object({
      limit: z.number().optional().default(50),
      beforeId: z.number().optional(),
    }))
    .query(async ({ ctx }) => {
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      const [rows] = await dbConn.execute(
        `SELECT id, sender, content, file_url, file_name, file_type, file_size, created_at, is_read FROM manus_messages ORDER BY created_at DESC LIMIT 100`
      ) as any;
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
        await dbConn.execute(`UPDATE manus_messages SET is_read = 1 WHERE sender = 'admin' AND is_read = 0`);
      }
      return (rows as any[]).reverse();
    }),

  // 获取未读消息数
  getUnreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role === 'admin' || ctx.user.role === 'super_admin') return { count: 0 };
      const dbConn = await getDbConnection();
      if (!dbConn) return { count: 0 };
      const [rows] = await dbConn.execute(
        `SELECT COUNT(*) as cnt FROM manus_messages WHERE sender = 'admin' AND is_read = 0`
      ) as any;
      return { count: Number((rows as any[])[0]?.cnt ?? 0) };
    }),
});

export const appRouter = router({
  system: systemRouter,
  equity: equityRouter,
  partnership: partnershipRouter,
  beauty: beautyRouter,
  diet: dietRouter,
  merchant: merchantRouter,
  lottery: lotteryRouter,
  prediction: predictionRouter,
  okxTrader: okxTraderRouter,

  // 支付账户管理
  paymentAccounts: router({
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
        cardType: z.enum(['debit', 'credit']),
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
        cardType: z.enum(['debit', 'credit']).optional(),
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
        walletType: z.enum(['blockchain', 'alipay', 'wechat', 'other']),
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
        walletType: z.enum(['blockchain', 'alipay', 'wechat', 'other']).optional(),
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
  }),

  // 充值系统
  recharge: router({
    // 创建充値订单
    createOrder: protectedProcedure
      .input(z.object({
        amount: z.number().min(1).max(100000),
        network: z.enum(['TRC20', 'ERC20', 'BEP20', 'APTOS', 'SOLANA']).default('TRC20'),
        ledgerId: z.number().optional()  // 关联账本 ID，传入则充値记录关联到该账本
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbRecharge.createRechargeOrder(ctx.user.id, input.amount, input.network, input.ledgerId);
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

    // 获取用户余额（支持viewAsUserId和ledgerId）
    // 如果传入 ledgerId，则按账本隔离计算余额（推荐）
    getBalance: protectedProcedure
      .input(z.object({ 
        viewAsUserId: z.number().optional(),
        ledgerId: z.number().optional()  // 按账本隔离计算余额
      }).optional())
      .query(async ({ ctx, input }) => {
        const targetUserId = input?.viewAsUserId || ctx.user.id;
        return await dbRecharge.getUserBalance(targetUserId, input?.ledgerId);
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
        remark: z.string().optional()
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

    // SNT 划转：搜索用户
    searchUserForTransfer: protectedProcedure
      .input(z.object({ keyword: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const { searchUsersByUsername } = await import('./db-point-system');
        const userList = await searchUsersByUsername(input.keyword);
        return (userList as any[])
          .filter((u: any) => u.id !== ctx.user.id)
          .slice(0, 10)
          .map((u: any) => ({ id: u.id, username: u.username, name: u.name }));
      }),

    // SNT 划转：执行划转
    transferSNT: protectedProcedure
      .input(z.object({
        toUserId: z.number(),
        sntAmount: z.number().positive(),
        remark: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbRecharge.transferSNT(
          ctx.user.id,
          input.toUserId,
          input.sntAmount,
          input.remark
        );
      }),

    // SNT 划转：获取划转记录
    getMySntTransfers: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        return await dbRecharge.getUserSntTransfers(ctx.user.id, input.limit);
      }),

    // === 管理员功能 ===
    // 获取所有待处理订单
    adminGetPendingOrders: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        return await dbRecharge.getAllPendingOrders();
      }),
    // 获取所有充值订单
    adminGetAllOrders: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        return await dbRecharge.getAllOrders(input.limit);
      }),
    // 获取未匹配交易列表
    adminGetUnmatchedTransactions: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        return await dbRecharge.getUnmatchedTransactions();
      }),
    // 管理员手动确认充值
    adminConfirmRecharge: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        txnHash: z.string(),
        actualAmount: z.number().min(0.01)
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        return await dbRecharge.adminConfirmRecharge(
          ctx.user.id, input.orderId, input.txnHash, input.actualAmount
        );
      }),
    // 管理员直接给用户充值
    adminDirectRecharge: protectedProcedure
      .input(z.object({
        userId: z.number(),
        amount: z.number().min(0.01),
        description: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        return await dbRecharge.adminDirectRecharge(
          ctx.user.id, input.userId, input.amount, input.description
        );
      }),
    // 获取系统统计信息
    adminGetSystemStats: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        return await dbRecharge.getSystemStats();
      }),
    // 管理员获取扫描器心跳状态
    adminGetScannerHeartbeat: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        const db = await getDb();
        const heartbeat = await db
          .select()
          .from(schema.scannerHeartbeat)
          .where(eq(schema.scannerHeartbeat.scannerType, 'blockchain'))
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
        label: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
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
        enabled: z.number().min(0).max(1).optional()
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        const { id, ...data } = input;
        return await dbRecharge.updateWalletAddress(id, data);
      }),
    // 管理员删除收款地址
    adminDeleteWalletAddress: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        return await dbRecharge.deleteWalletAddress(input.id);
      }),
    // 管理员一键修复扫描器
    adminFixScanner: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        
        const results: string[] = [];
        const db = await getDb();
        
        try {
          // 1. 检查scanner_heartbeat表是否存在
          results.push('步骤1: 检查scanner_heartbeat表...');
          try {
            await db.select().from(schema.scannerHeartbeat).limit(1);
            results.push('✅ scanner_heartbeat表存在');
          } catch (error) {
            results.push('⚠️ scanner_heartbeat表不存在，尝试创建...');
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
            await db.execute(sql.raw(createTableSQL));
            results.push('✅ scanner_heartbeat表创建成功');
          }
          
          // 2. 检查是否有启用的收款地址
          results.push('步骤2: 检查收款地址...');
          const enabledAddresses = await db
            .select()
            .from(schema.walletAddresses)
            .where(eq(schema.walletAddresses.enabled, 1));
          
          if (enabledAddresses.length === 0) {
            results.push('❌ 没有启用的收款地址，请在“管理收款地址”中添加');
            return {
              success: false,
              message: '没有启用的收款地址',
              logs: results,
            };
          } else {
            results.push(`✅ 找到 ${enabledAddresses.length} 个启用的收款地址`);
          }
          
          // 3. 初始化心跳记录
          results.push('步骤3: 初始化心跳记录...');
          const existingHeartbeat = await db
            .select()
            .from(schema.scannerHeartbeat)
            .where(eq(schema.scannerHeartbeat.scannerType, 'blockchain'))
            .limit(1);
          
          if (existingHeartbeat.length === 0) {
            await db.insert(schema.scannerHeartbeat).values({
              scannerType: 'blockchain',
              lastScanAt: new Date(),
              scanCount: 0,
              successCount: 0,
              errorCount: 0,
            });
            results.push('✅ 心跳记录初始化成功');
          } else {
            results.push('✅ 心跳记录已存在');
          }
          
          results.push('✅ 修复完成！请稍后刷新页面查看扫描器状态');
          
          return {
            success: true,
            message: '修复成功',
            logs: results,
          };
          
        } catch (error) {
          results.push(`❌ 错误: ${error instanceof Error ? error.message : String(error)}`);
          return {
            success: false,
            message: '修复失败',
            logs: results,
          };
        }
      }),
    // 管理员诊断API：检查所有链的扫描器状态
    adminDiagnose: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        
        const logs: string[] = [];
        
        try {
          logs.push('========== 多链扫描器诊断 ==========');
          logs.push('');
          
          // 检查所有网络的钱包地址
          const networks = ['TRC20', 'APTOS', 'SOLANA', 'ERC20', 'BEP20'];
          for (const network of networks) {
            const wallets = await dbRecharge.getEnabledWalletAddresses(network);
            logs.push(`${network}: ${wallets.length}个启用地址`);
            if (wallets.length > 0) {
              wallets.forEach((w, i) => {
                logs.push(`  ${i+1}. ${w.label || '未命名'} (${w.address.slice(0, 10)}...)`);
              });
            }
          }
          logs.push('');
          
          // 1. 检查环境变量
          const apiKey = process.env.TRONGRID_API_KEY || '';
          logs.push(`TRONGRID_API_KEY: ${apiKey ? '已设置 (' + apiKey.slice(0, 8) + '...)' : '❌ 未设置'}`);
          logs.push(`ETHERSCAN_API_KEY: ${process.env.ETHERSCAN_API_KEY ? '已设置' : '未设置（可选）'}`);
          logs.push(`BSCSCAN_API_KEY: ${process.env.BSCSCAN_API_KEY ? '已设置' : '未设置（可选）'}`);
          logs.push('');
          
          // 2. 测试TRC20（保留原有逻辑）
          logs.push('---------- TRC20 测试 ----------');
          const wallets = await dbRecharge.getEnabledWalletAddresses('TRC20');
          logs.push(`启用的TRC20钱包: ${wallets.length}个`);
          
          if (wallets.length === 0) {
            logs.push('❌ 没有启用的TRC20钱包地址');
            return { success: false, logs };
          }
          
          const walletAddress = wallets[0].address;
          logs.push(`测试钱包: ${walletAddress}`);
          
          // 3. 直接调用TronGrid API
          const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
          const apiUrl = `https://api.trongrid.io/v1/accounts/${walletAddress}/transactions/trc20?limit=20&only_to=true&contract_address=${USDT_CONTRACT}`;
          logs.push(`API URL: ${apiUrl}`);
          
          const fetchOpts: RequestInit = {};
          if (apiKey) {
            fetchOpts.headers = {
              'TRON-PRO-API-KEY': apiKey
            };
          }
          const response = await fetch(apiUrl, fetchOpts);
          
          logs.push(`HTTP状态: ${response.status} ${response.statusText}`);
          
          if (!response.ok) {
            const errorText = await response.text();
            logs.push(`错误响应: ${errorText.slice(0, 500)}`);
            return { success: false, logs };
          }
          
          const data = await response.json();
          logs.push(`返回数据: data.success=${data.success}, data.data长度=${data.data?.length || 0}`);
          
          if (data.data && data.data.length > 0) {
            // 显示前5笔交易
            for (let i = 0; i < Math.min(5, data.data.length); i++) {
              const tx = data.data[i];
              const amount = parseFloat(tx.value) / 1e6;
              const txTime = new Date(tx.block_timestamp);
              logs.push(`交易${i+1}: ${amount} USDT, from=${tx.from?.slice(0,10)}..., hash=${tx.transaction_id?.slice(0,16)}..., 时间=${txTime.toISOString()}`);
            }
          } else {
            logs.push('⚠️ API返回0笔交易');
          }
          
          // 4. 检查待处理订单
          const db2 = await getDb();
          const pendingOrders = await db2
            .select()
            .from(schema.rechargeOrders)
            .where(
              sql`${schema.rechargeOrders.status} IN ('pending', 'submitted')`
            );
          
          logs.push(`待处理订单: ${pendingOrders.length}个`);
          for (const order of pendingOrders) {
            logs.push(`  订单 ${order.orderNo}: ${order.amount} USDT, 状态=${order.status}, 过期=${order.expiresAt}`);
          }
          
          // 5. 检查lastScanTimestamp
          const scanTimestamp = Date.now() - 24 * 60 * 60 * 1000;
          logs.push(`扫描时间范围: ${new Date(scanTimestamp).toISOString()} 到现在`);
          
          // 6. 尝试匹配
          if (data.data && data.data.length > 0 && pendingOrders.length > 0) {
            logs.push('--- 尝试匹配 ---');
            for (const tx of data.data.slice(0, 10)) {
              const amount = parseFloat(tx.value) / 1e6;
              const txTime = tx.block_timestamp;
              if (txTime < scanTimestamp) {
                logs.push(`跳过: ${amount} USDT (时间 ${new Date(txTime).toISOString()} 早于扫描范围)`);
                continue;
              }
              
              // 检查是否有匹配的订单
              for (const order of pendingOrders) {
                const orderAmount = parseFloat(order.amount);
                const diff = Math.abs(orderAmount - amount);
                if (diff <= 0.01) {
                  logs.push(`✅ 精确匹配: 交易 ${amount} USDT ↔ 订单 ${order.orderNo} (${order.amount} USDT), 差额=${diff}`);
                } else if (orderAmount > amount && orderAmount - amount <= 3) {
                  logs.push(`🔄 模糊匹配: 交易 ${amount} USDT ↔ 订单 ${order.orderNo} (${order.amount} USDT), 差额=${(orderAmount - amount).toFixed(4)}`);
                }
              }
            }
          }
          
          return { success: true, logs };
          
        } catch (error) {
          logs.push(`❌ 异常: ${error instanceof Error ? error.message : String(error)}`);
          return { success: false, logs };
        }
      }),
    // 管理员手动触发扫描
    adminTriggerScan: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        
        try {
          // 动态导入多链扫描器
          const { scanAllChains } = await import('./multi-chain-scanner');
          
          // 执行一次扫描
          const results = await scanAllChains();
          
          return {
            success: results.success,
            message: results.success ? '扫描完成' : `扫描完成，但有错误: ${results.errors.join(', ')}`,
            results,
          };
        } catch (error) {
          return {
            success: false,
            message: error instanceof Error ? error.message : '扫描失败',
          };
        }
      }),
    // 管理员手动回滚错误订单
    adminRollbackOrder: protectedProcedure
      .input(z.object({ orderNo: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        
        try {
          const db = await getDb();
          
          // 查找订单
          const [order] = await db
            .select()
            .from(rechargeOrders)
            .where(eq(rechargeOrders.orderNo, input.orderNo))
            .limit(1);
          
          if (!order) {
            return { success: false, message: '订单不存在' };
          }
          
          if (order.status !== 'completed') {
            return { success: false, message: '订单不是已完成状态' };
          }
          
          // 使用订单金额作为退款金额（简化处理）
          const refundAmount = parseFloat(order.amount);
          
          // 扣除余额
          await db
            .update(users)
            .set({ balance: sql`balance - ${refundAmount}` })
            .where(eq(users.id, order.userId));
          
          // 更新订单状态
          await db
            .update(rechargeOrders)
            .set({
              status: 'pending',
              txnHash: null,
              completedAt: null
            })
            .where(eq(rechargeOrders.id, order.id));
          
          return {
            success: true,
            message: `订单${input.orderNo}已回滚，扣除余额${refundAmount} USDT`
          };
        } catch (error) {
          return {
            success: false,
            message: error instanceof Error ? error.message : '回滚失败'
          };
        }
      }),

    // ========== SNT 提现功能 ==========
    // 获取用户绑定的 BSC 钱包
    getBscWallet: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbRecharge.getUserBscWallet(ctx.user.id);
      }),

    // 绑定/更新 BSC 钱包地址
    upsertBscWallet: protectedProcedure
      .input(z.object({ bscAddress: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        return await dbRecharge.upsertUserBscWallet(ctx.user.id, input.bscAddress);
      }),

    // 用户申请 SNT 提现
    requestSntWithdraw: protectedProcedure
      .input(z.object({
        sntAmount: z.number().min(10),
        bscAddress: z.string().min(1),
        ledgerId: z.number().optional(),  // 账本 ID，默认 52
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbRecharge.requestSntWithdraw(
          ctx.user.id,
          input.sntAmount,
          input.bscAddress,
          input.ledgerId ?? 52,
        );
      }),

    // 获取用户 SNT 提现记录
    getMySntWithdrawals: protectedProcedure
      .input(z.object({ limit: z.number().optional(), ledgerId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        return await dbRecharge.getUserSntWithdrawals(ctx.user.id, input.limit, input.ledgerId);
      }),

    // 管理员获取所有 SNT 提现申请
    adminGetAllSntWithdrawals: protectedProcedure
      .input(z.object({ status: z.string().optional(), limit: z.number().optional(), ledgerId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const isSystemAdmin = ctx.user.role === 'super_admin' || ctx.user.role === 'admin';
        // 如果传了 ledgerId，允许账本 owner 查看该账本的提现记录
        if (!isSystemAdmin && input.ledgerId) {
          const conn = await db.getDbConnection();
          if (!conn) throw new Error('数据库连接失败');
          // 先检查 ledgers.ownerId（账本创建者直接有权限）
          const [ledgerRows] = await conn.execute(
            `SELECT id FROM ledgers WHERE id = ? AND ownerId = ? LIMIT 1`,
            [input.ledgerId, ctx.user.id]
          );
          // 再检查 ledger_members 表（注意字段名是驼峰 ledgerId/userId）
          const [memberRows] = await conn.execute(
            `SELECT role FROM ledger_members WHERE ledgerId = ? AND userId = ? AND role IN ('owner','admin') LIMIT 1`,
            [input.ledgerId, ctx.user.id]
          );
          if (!(ledgerRows as any[]).length && !(memberRows as any[]).length) {
            throw new Error('无权限');
          }
        } else if (!isSystemAdmin) {
          throw new Error('无权限');
        }
        return await dbRecharge.adminGetAllSntWithdrawals(input.status, input.limit, input.ledgerId);
      }),

    // 管理员审核通过提现
    adminApproveSntWithdrawal: protectedProcedure
      .input(z.object({
        withdrawalId: z.number(),
        txnHash: z.string().optional(),
        adminNote: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        return await dbRecharge.adminApproveSntWithdrawal(
          input.withdrawalId,
          input.txnHash,
          input.adminNote,
        );
      }),

    // 管理员拒绝提现
    adminRejectSntWithdrawal: protectedProcedure
      .input(z.object({
        withdrawalId: z.number(),
        adminNote: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        return await dbRecharge.adminRejectSntWithdrawal(
          input.withdrawalId,
          input.adminNote,
        );
      }),

    // 管理员标记提现为处理中
    adminProcessingSntWithdrawal: protectedProcedure
      .input(z.object({
        withdrawalId: z.number(),
        adminNote: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new Error('无权限');
        }
        return await dbRecharge.adminProcessingSntWithdrawal(
          input.withdrawalId,
          input.adminNote,
        );
      }),
  }),

  // 卡券系统
  coupon: router({
    // 获取可发送卡券的用户列表
    getAvailableRecipients: protectedProcedure.query(async ({ ctx }) => {
      return await dbCoupon.getAvailableRecipients(ctx.user.id);
    }),

    // 创建并发送卡券
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        validFrom: z.string(),
        validUntil: z.string(),
        recipientIds: z.union([z.array(z.string()), z.literal('all')]),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbCoupon.createCoupon({
          ...input,
          creatorId: ctx.user.id,
        });
      }),

    // 获取收到的卡券列表
    getReceived: protectedProcedure.query(async ({ ctx }) => {
      return await dbCoupon.getReceivedCoupons(ctx.user.id);
    }),

    // 获取发出的卡券列表
    getSent: protectedProcedure.query(async ({ ctx }) => {
      return await dbCoupon.getSentCoupons(ctx.user.id);
    }),

    // 获取卡券详情
    getDetail: protectedProcedure
      .input(z.object({ couponId: z.string() }))
      .query(async ({ ctx, input }) => {
        return await dbCoupon.getCouponDetail(input.couponId, ctx.user.id);
      }),

    // 使用/核销卡券
    use: protectedProcedure
      .input(z.object({
        recipientRecordId: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbCoupon.useCoupon(
          input.recipientRecordId,
          ctx.user.id,
          input.notes
        );
      }),

    // 获取卡券核销记录（仅创建者可见）
    getUsageRecords: protectedProcedure
      .input(z.object({ couponId: z.string() }))
      .query(async ({ ctx, input }) => {
        return await dbCoupon.getCouponUsageRecords(input.couponId, ctx.user.id);
      }),
  }),

  
  auth: router({
    me: publicProcedure.query(opts => {
      console.log('[auth.me] 返回用户信息:', opts.ctx.user ? `用户ID: ${opts.ctx.user.id}, 用户名: ${opts.ctx.user.username}` : 'null');
      return opts.ctx.user;
    }),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      console.log("[Logout] Clearing cookie with options:", {
        cookieName: COOKIE_NAME,
        cookieOptions,
        host: ctx.req.headers.host,
        protocol: ctx.req.protocol,
        forwardedProto: ctx.req.headers['x-forwarded-proto']
      });
      
      // 方法1: 使用clearCookie
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      
      // 方法2: 设置过期的cookie来强制覆盖
      ctx.res.cookie(COOKIE_NAME, '', {
        ...cookieOptions,
        maxAge: 0,
        expires: new Date(0)
      });
      
      // 方法3: 清除所有可能的domain变体（处理代理环境）
      const host = ctx.req.headers.host;
      if (host) {
        const hostname = host.split(':')[0];
        // 清除当前域名的cookie
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, domain: hostname });
        ctx.res.cookie(COOKIE_NAME, '', {
          ...cookieOptions,
          domain: hostname,
          maxAge: 0,
          expires: new Date(0)
        });
        
        // 如果是子域名，也清除父域名的cookie
        const parts = hostname.split('.');
        if (parts.length > 2) {
          const parentDomain = parts.slice(-2).join('.');
          ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, domain: `.${parentDomain}` });
          ctx.res.cookie(COOKIE_NAME, '', {
            ...cookieOptions,
            domain: `.${parentDomain}`,
            maxAge: 0,
            expires: new Date(0)
          });
        }
      }
      
      return { success: true } as const;
    }),
    
    // 用户名密码登录
    loginWithPassword: publicProcedure
      .input(z.object({
        username: z.string().min(1).max(20),
        password: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        const ipAddress = ctx.req.ip || ctx.req.headers["x-forwarded-for"] as string || "unknown";
        const result = await loginWithPassword(input.username, input.password, ipAddress);
        
        if (!result.success) {
          throw new TRPCError({
            code: result.isLocked ? "FORBIDDEN" : "UNAUTHORIZED",
            message: result.error || "登录失败",
          });
        }
        
        // 获取完整用户信息
        const user = await db.getUserByUsername(input.username);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "用户不存在" });
        }
        
        // 创建session token
        const sessionToken = await sdk.createSessionToken(user.id.toString(), {
          expiresInMs: ONE_YEAR_MS,
          name: user.name || user.username || "",
        });
        
        // 设置cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        
        return {
          success: true,
          token: sessionToken,  // 返回token供前端存储到localStorage
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          },
        };
      }),
    
    // 用户名密码注册
    registerWithPassword: publicProcedure
      .input(z.object({
        username: z.string().min(2).max(20),
        password: z.string().min(6),
        name: z.string().optional(),
        email: z.string().email().optional(),
        inviteCode: z.string().optional(), // 邀请码
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await registerWithPassword(
          input.username,
          input.password,
          input.name,
          input.email
        );
        
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "注册失败",
          });
        }
        
        // 获取新创建的用户
        const user = await db.getUserByUsername(input.username);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建用户失败" });
        }
        
        // 处理邀请码
        if (input.inviteCode) {
          const dbConn = await getDb();
          // 查找邀请者
          const [inviter] = await dbConn
            .select({ id: users.id })
            .from(users)
            .where(eq(users.inviteCode, input.inviteCode));
          
          if (inviter) {
            // 更新新用户的邀请信息（用原始SQL避免字段不存在时报错）
            try {
              const rawConn = await getDbConnection();
              if (rawConn) {
                await rawConn.execute(
                  'UPDATE users SET invited_by_user_id = ?, invited_at = NOW() WHERE id = ?',
                  [inviter.id, user.id]
                );
                await rawConn.execute(
                  'UPDATE users SET invite_count = COALESCE(invite_count, 0) + 1 WHERE id = ?',
                  [inviter.id]
                );
              }
            } catch (inviteUpdateErr) {
              console.error('[邀请注册] 更新邀请信息失败（字段可能不存在）:', inviteUpdateErr);
              // 不影响注册流程，用户已成功注册
            }
            
            // 自动将新用户加入邀请者的 AF（custom_af）类型账本
            try {
              const afLedgers = await dbConn
                .select({ id: ledgers.id })
                .from(ledgers)
                .where(
                  and(
                    eq(ledgers.ownerId, inviter.id),
                    eq(ledgers.type, 'custom_af')
                  )
                );
              
              for (const afLedger of afLedgers) {
                // 检查是否已经是成员
                const existing = await dbConn
                  .select({ id: ledgerMembers.id })
                  .from(ledgerMembers)
                  .where(
                    and(
                      eq(ledgerMembers.ledgerId, afLedger.id),
                      eq(ledgerMembers.userId, user.id)
                    )
                  )
                  .limit(1);
                
                if (existing.length === 0) {
                  await dbConn.insert(ledgerMembers).values({
                    ledgerId: afLedger.id,
                    userId: user.id,
                    role: 'member',
                    memberType: 'real',
                    permissionView: 'all',
                    permissionAdd: 'all',
                    permissionEdit: 'own',
                    permissionDelete: 'own',
                  });
                  console.log(`[邀请注册] 新用户 ${user.id} 自动加入 AF 账本 ${afLedger.id}`);
                }
              }
            } catch (afErr) {
              console.error('[邀请注册] 自动加入AF账本失败:', afErr);
              // 不影响注册流程
            }
          }
        }
        
        // 如果是家长，自动创建family
        if (user.role === "parent") {
          const familyName = input.name || input.username;
          await db.createFamilyForParent(user.id, familyName);
        }
        
        // 自动登录
        const sessionToken = await sdk.createSessionToken(user.id.toString(), {
          expiresInMs: ONE_YEAR_MS,
          name: user.name || user.username || "",
        });
        
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        
        return {
          success: true,
          token: sessionToken,  // 返回token供前端存储到localStorage
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          },
        };
      }),
    
    // 更新个人信息（用户自己更新）
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        realName: z.string().optional(),
        idCardNumber: z.string().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        business: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db_instance = await getDb();
        if (!db_instance) throw new Error("Database not available");
        
        // 更新用户基本信息
        const updateData: any = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.email !== undefined) updateData.email = input.email;
        if (input.realName !== undefined) updateData.realName = input.realName;
        if (input.idCardNumber !== undefined) updateData.idCardNumber = input.idCardNumber;
        if (input.phone !== undefined) updateData.phone = input.phone;
        if (input.company !== undefined) updateData.company = input.company;
        if (input.business !== undefined) updateData.business = input.business;
        
        if (Object.keys(updateData).length > 0) {
          await db_instance.update(users).set(updateData).where(eq(users.id, ctx.user.id));
        }
        
        return { success: true };
      }),
    
    // 上传头像
    uploadAvatar: protectedProcedure
      .input(z.object({
        imageData: z.string(), // base64 encoded image
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          // 使用腾讯COS存储头像
          const { uploadImageToCOS } = await import('./cos-upload');
          const avatarUrl = await uploadImageToCOS(input.imageData, 'avatars');
          
          // 更新数据库为COS URL
          const db_instance = await getDb();
          if (db_instance) {
            await db_instance.update(users).set({ avatar: avatarUrl }).where(eq(users.id, ctx.user.id));
          }
          
          return { success: true, avatarUrl };
        } catch (error) {
          console.error('[uploadAvatar] 错误:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `头像上传失败: ${error instanceof Error ? error.message : '未知错误'}` 
          });
        }
      }),
    
    // 游客模式登录（开发专用）
    guestLogin: publicProcedure
      .mutation(async ({ ctx }) => {        
        // 使用专门的游客用户ID（guest_dev）
        const guestUserId = 5070293;
        
        // 获取游客用户信息
        const user = await db.getUserById(guestUserId);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "游客用户不存在" });
        }
        
        // 创建session token
        const sessionToken = await sdk.createSessionToken(user.id.toString(), {
          expiresInMs: ONE_YEAR_MS,
          name: user.name || user.username || "游客",
        });
        
        // 设置cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        
        return {
          success: true,
          token: sessionToken,  // 返回token供前端存储到localStorage
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          },
        };
      }),
    
    // 修改密码
    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(6),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "无法修改密码" });
        }
        
        const { verifyPassword } = await import("./auth");
        const isValid = await verifyPassword(input.currentPassword, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "当前密码错误" });
        }
        
        const newHash = await hashPassword(input.newPassword);
        await db.updateUserPassword(ctx.user.id, newHash);
        
        return { success: true };
      }),
    
    // 一键登录（管理员和家长功能）
    quickLogin: protectedProcedure
      .input(z.object({
        targetUserId: z.number(),
        password: z.string().optional(), // 宝宝切换回家长时需要提供家长密码
      }))
      .mutation(async ({ ctx, input }) => {
        // 超级管理员可以登录任何账户
        if (ctx.user.role === "super_admin") {
          const targetUser = await db.getUserById(input.targetUserId);
          if (!targetUser) {
            throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
          }
          
          const { sdk } = await import("./_core/sdk");
          const sessionToken = await sdk.createSessionToken(targetUser.id.toString(), {
            name: targetUser.name || targetUser.username || "",
            expiresInMs: 24 * 60 * 60 * 1000,
          });
          
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, {
            ...cookieOptions,
            maxAge: 24 * 60 * 60 * 1000,
          });
          
          return { 
            success: true,
            sessionToken,  // 返回新token，供前端更新localStorage
            user: {
              id: targetUser.id,
              username: targetUser.username,
              name: targetUser.name,
              role: targetUser.role,
            },
          };
        }
        
        // 家长只能切换到自己管理的宝宝账户
        if (ctx.user.role === "parent") {
          const targetUser = await db.getUserById(input.targetUserId);
          if (!targetUser) {
            throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
          }
          
          if (targetUser.role !== "baby") {
            throw new TRPCError({ code: "FORBIDDEN", message: "只能切换到宝宝账户" });
          }
          
          const kids = await db.getKidsByParent(ctx.user.id);
          const isMyKid = kids.some(kid => kid.userId === input.targetUserId);
          
          if (!isMyKid) {
            throw new TRPCError({ code: "FORBIDDEN", message: "只能切换到自己管理的宝宝账户" });
          }
          
          const { sdk } = await import("./_core/sdk");
          const sessionToken = await sdk.createSessionToken(targetUser.id.toString(), {
            name: targetUser.name || targetUser.username || "",
            expiresInMs: 24 * 60 * 60 * 1000,
          });
          
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, {
            ...cookieOptions,
            maxAge: 24 * 60 * 60 * 1000,
          });
          
          return { 
            success: true,
            sessionToken,  // 返回新token，供前端更新localStorage
            user: {
              id: targetUser.id,
              username: targetUser.username,
              name: targetUser.name,
              role: targetUser.role,
            },
          };
        }
        
        // 宝宝可以切换回家长账户（需要验证家长密码）
        if (ctx.user.role === "baby") {
          const targetUser = await db.getUserById(input.targetUserId);
          if (!targetUser) {
            throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
          }
          
          if (targetUser.role !== "parent") {
            throw new TRPCError({ code: "FORBIDDEN", message: "只能切换到家长账户" });
          }
          
          // 验证当前宝宝是否属于目标家长
          const kids = await db.getKidsByParent(input.targetUserId);
          const isMyParent = kids.some(kid => kid.userId === ctx.user.id);
          
          if (!isMyParent) {
            throw new TRPCError({ code: "FORBIDDEN", message: "只能切换到自己的家长账户" });
          }
          
          // 验证家长密码
          if (!input.password) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "请输入家长密码" });
          }
          
          const { verifyPassword } = await import("./auth");
          if (!targetUser.passwordHash) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "家长账户未设置密码" });
          }
          const isPasswordValid = await verifyPassword(input.password, targetUser.passwordHash);
          
          if (!isPasswordValid) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "家长密码错误" });
          }
          
          const { sdk } = await import("./_core/sdk");
          const sessionToken = await sdk.createSessionToken(targetUser.id.toString(), {
            name: targetUser.name || targetUser.username || "",
            expiresInMs: 24 * 60 * 60 * 1000,
          });
          
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, {
            ...cookieOptions,
            maxAge: 24 * 60 * 60 * 1000,
          });
          
          return { 
            success: true,
            sessionToken,  // 返回新token，供前端更新localStorage
            user: {
              id: targetUser.id,
              username: targetUser.username,
              name: targetUser.name,
              role: targetUser.role,
            },
          };
        }
        
        throw new TRPCError({ code: "FORBIDDEN", message: "无权使用一键登录功能" });
      }),
    
    // 获取当前用户的功能权限
    getMyFeaturePermissions: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user.id;
      const userRole = ctx.user.role;
      
      // 超级管理员拥有所有权限
      if (userRole === 'super_admin') {
        return {
          'my-equity': true,
          'node-growth': true,
          'my-points': true,
          'ai-assistant': true,
          'wallet': true,
        };
      }
      
      // 普通用户查询数据库
      const dbPermissions = await import('./db-permissions');
      const permissions = await dbPermissions.getUserPermissions(userId);
      
      const result: Record<string, boolean> = {};
      const featureKeys = ['my-equity', 'node-growth', 'my-points', 'ai-assistant', 'wallet'];
      
      for (const key of featureKeys) {
        const perm = permissions.find(p => p.featureKey === key);
        if (perm) {
          result[key] = perm.isEnabled === true || perm.isEnabled === 1;
        } else {
          // 默认关闭
          result[key] = false;
        }
      }
      
      return result;
    }),
  }),

  // 通用文件上传API
  upload: router({
    file: protectedProcedure
      .input(z.object({
        base64Data: z.string(),
        contentType: z.string(),
        prefix: z.string().default("uploads"),
      }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.base64Data, "base64");
        const ext = input.contentType.split("/")[1] || "bin";
        const fileKey = `${input.prefix}/${Date.now()}-${nanoid()}.${ext}`;
        
        // 上传到腾讯云COS（国内节点，速度快）
        const { uploadImageToCOS } = await import('./cos-upload');
        const folder = input.prefix.startsWith('lottery') ? 'lottery-images' : 'ledger-photos';
        const url = await uploadImageToCOS(buffer, folder as any, fileKey);
        return { url, fileKey };
      }),
  }),
  
  // ==================== 管理后台 ====================
  admin: router({
    // 获取所有用户
    getUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
      }
      return db.getAllUsers();
    }),
    
    // 解锁用户
    unlockUser: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以解锁用户" });
        }
        await db.unlockUser(input.userId);
        return { success: true };
      }),
    
    // 设置用户角色
    setUserRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["super_admin", "parent", "baby"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以设置角色" });
        }
        await db.updateUserRole(input.userId, input.role);
        return { success: true };
      }),
    
    // 创建用户（管理员创建）
    createUser: protectedProcedure
      .input(z.object({
        username: z.string().min(1).max(20),
        password: z.string().min(6),
        name: z.string().optional(),
        role: z.enum(["super_admin", "parent", "baby"]).default("parent"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建用户" });
        }
        
        const existingUser = await db.getUserByUsername(input.username);
        if (existingUser) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "用户名已存在" });
        }
        
        const passwordHash = await hashPassword(input.password);
        const userId = await db.createUserWithPassword({
          username: input.username,
          passwordHash,
          name: input.name,
          role: input.role,
        });
        
        return { success: true, userId };
      }),
    
    // 重置用户密码
    resetUserPassword: protectedProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以重置密码" });
        }
        
        const passwordHash = await hashPassword(input.newPassword);
        await db.updateUserPassword(input.userId, passwordHash);
        return { success: true };
      }),
    
    // 获取所有家长用户
    getAllParents: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
      }
      return db.getAllParents();
    }),
    
    // 获取家庭的所有子功能权限
    getFamilyFeatures: protectedProcedure
      .input(z.object({ familyId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
        }
        return db.getFamilyFeatures(input.familyId);
      }),
    
    // 更新子功能权限
    updateFamilyFeature: protectedProcedure
      .input(z.object({
        familyId: z.number(),
        featureName: z.string(),
        subFeatureName: z.string(),
        enabled: z.boolean(),
        settings: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
        }
        await db.upsertFamilyFeature(input);
        return { success: true };
      }),
    
    // 批量更新子功能权限
    batchUpdateFamilyFeatures: protectedProcedure
      .input(z.object({
        familyId: z.number(),
        features: z.array(z.object({
          featureName: z.string(),
          subFeatureName: z.string(),
          enabled: z.boolean(),
          settings: z.any().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
        }
        await db.batchUpdateFamilyFeatures(input.familyId, input.features);
        return { success: true };
      }),
    
    // 获取当前用户的功能权限（家长/宝宝使用）
    getMyFamilyFeatures: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user;
      if (!user.familyId) {
        return [];
      }
      return db.getFamilyFeatures(user.familyId);
    }),
    
    // 获取功能树（带家庭权限状态）
    getFeatureTree: protectedProcedure
      .input(z.object({
        familyId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
        }
        
        // 导入功能树结构
        const { FEATURE_TREE, buildFeatureTree } = await import("../shared/featureTree");
        
        // 获取家庭的所有权限记录
        const familyFeatures = await db.getFamilyFeatures(input.familyId);
        const featureMap = new Map(familyFeatures.map(f => [f.path, f]));
        
        // 合并功能树和权限状态
        const featuresWithStatus = FEATURE_TREE.map(node => ({
          ...node,
          enabled: featureMap.get(node.path)?.enabled ?? false,
        }));
        
        return buildFeatureTree(featuresWithStatus);
      }),
    
    // 批量更新功能权限（按path）
    batchUpdateFeaturesByPath: protectedProcedure
      .input(z.object({
        familyId: z.number(),
        updates: z.array(z.object({
          path: z.string(),
          enabled: z.boolean(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
        }
        console.log('[batchUpdateFeaturesByPath] 收到保存请求:', {
          familyId: input.familyId,
          updatesCount: input.updates.length,
          updates: input.updates.slice(0, 10),
        });
        await db.batchUpdateFeaturesByPath(input.familyId, input.updates);
        
        // 检查是否包含"好友记 - 共享权限"，如果有则同步更新用户表的sharingEnabled字段
        const sharingPermissionUpdate = input.updates.find(u => u.path === '社交/好友记/好友记 - 共享权限');
        if (sharingPermissionUpdate !== undefined) {
          console.log('[batchUpdateFeaturesByPath] 同步更新用户sharingEnabled:', sharingPermissionUpdate.enabled);
          await db.updateUsersSharingEnabled(input.familyId, sharingPermissionUpdate.enabled);
        }
        
        console.log('[batchUpdateFeaturesByPath] 保存成功');
        return { success: true };
      }),
    
    // 同步功能树到数据库（初始化/更新时使用）
    syncFeatureTree: protectedProcedure
      .input(z.object({
        familyId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以同步功能树" });
        }
        
        // 导入功能树结构
        const { FEATURE_TREE } = await import("../shared/featureTree");
        
        // 转换为数据库格式
        const features = FEATURE_TREE.map(node => ({
          featureName: node.path.split('/')[0], // 顶级模块名称
          subFeatureName: node.name,
          parentFeature: node.parentId ? FEATURE_TREE.find(n => n.id === node.parentId)?.name ?? null : null,
          level: node.level,
          path: node.path,
          displayOrder: node.displayOrder,
          enabled: false, // 默认关闭
        }));
        
        await db.syncFamilyFeatures(input.familyId, features);
        return { success: true };
      }),
    
    // 检查功能权限
    checkPermission: protectedProcedure
      .input(z.object({
        path: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const user = ctx.user;
        if (!user.familyId) {
          return false;
        }
        return db.checkFeaturePermission(user.familyId, input.path);
      }),
    
    // 获取所有家庭
    getFamilies: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
      }
      return db.getAllFamilies();
    }),
    
    // 更新用户的家庭归属
    updateUserFamily: protectedProcedure
      .input(z.object({
        userId: z.number(),
        familyId: z.number().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改用户家庭归属" });
        }
        await db.updateUserFamily(input.userId, input.familyId);
        return { success: true };
      }),
    
    // 更新用户关系：关联家长和宝宝
    updateUserRelation: protectedProcedure
      .input(z.object({
        userId: z.number(),
        relatedUserId: z.number().nullable(),
        relationType: z.enum(['parent', 'child']),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改用户关系" });
        }
        await db.updateUserRelation(input.userId, input.relatedUserId, input.relationType);
        return { success: true };
      }),
    
    // 批量删除用户
    deleteUsers: protectedProcedure
      .input(z.object({
        userIds: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除用户" });
        }
        await db.deleteUsers(input.userIds);
        return { success: true };
      }),
    
    // 更新用户基本信息
    updateUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
        username: z.string().optional(),
        name: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以编辑用户信息" });
        }
        await db.updateUserInfo(input.userId, {
          username: input.username,
          name: input.name,
        });
        return { success: true };
      }),
    
    // 切换钱包功能开关
    toggleWalletEnabled: protectedProcedure
      .input(z.object({
        userId: z.number(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以操作" });
        }
        const db = await import("./db");
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.default.update(users)
          .set({ walletEnabled: input.enabled ? 1 : 0 })
          .where(eq(users.id, input.userId));
        return { success: true };
      }),
    
    // 获取用户的功能权限
    getUserPermissions: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
        }
        const dbPermissions = await import("./db-permissions");
        return await dbPermissions.getUserPermissions(input.userId);
      }),
    
    // 获取所有可用功能列表
    getAllFeatures: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
      }
      const dbPermissions = await import("./db-permissions");
      return dbPermissions.getAllFeatures();
    }),
    
    // 设置用户功能权限
    setUserPermissions: protectedProcedure
      .input(z.object({
        userId: z.number(),
        permissions: z.array(z.object({
          featureKey: z.string(),
          isEnabled: z.boolean(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
        }
        const dbPermissions = await import("./db-permissions");
        await dbPermissions.setUserPermissions(input.userId, input.permissions);
        return { success: true };
      }),
  }),

  // ==================== 功能权限检查 ====================
  features: router({
    // 检查用户的功能权限（普通用户可访问）
    checkPermission: protectedProcedure
      .input(z.object({ path: z.string() }))
      .query(async ({ ctx, input }) => {
        console.log('[features.checkPermission] ========== 开始检查 ==========');
        console.log('[features.checkPermission] 调用参数:', {
          userId: ctx.user.id,
          username: ctx.user.username,
          familyId: ctx.user.familyId,
          sharingEnabled: ctx.user.sharingEnabled,
          path: input.path
        });

        // 对于"好友记 - 共享权限"，直接返回user.sharingEnabled
        if (input.path === '社交/好友记/好友记 - 共享权限') {
          console.log('[features.checkPermission] 返回用户级别权限:', ctx.user.sharingEnabled);
          return { enabled: ctx.user.sharingEnabled || false };
        }

        // 其他功能仍然使用familyFeatures表
        if (!ctx.user.familyId) {
          console.log('[features.checkPermission] 用户没有familyId，返回false');
          return { enabled: false };
        }

        const feature = await db.checkFeaturePermission(ctx.user.familyId, input.path);
        console.log('[features.checkPermission] 权限检查结果:', {
          familyId: ctx.user.familyId,
          path: input.path,
          result: feature
        });
        console.log('[features.checkPermission] ========== 检查结束 ==========');
        return { enabled: feature || false };
      }),
  }),

  // ==================== 孩子档案 ====================
  children: router({
    list: protectedProcedure.query(async ({ ctx }) => {

      return db.getChildrenByParent(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        avatar: z.string().optional(),
        birthday: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createChildProfile({
          parentId: ctx.user.id,
          name: input.name,
          avatar: input.avatar,
          birthday: input.birthday ? new Date(input.birthday) : undefined,
        });
        return { id };
      }),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getChildById(input.id);
      }),
  }),

  // ==================== 游戏 ====================
  games: router({
    saveRecord: protectedProcedure
      .input(z.object({
        gameType: z.enum(["memory", "puzzle", "math"]),
        score: z.number(),
        level: z.number().default(1),
        duration: z.number().default(0),
        childId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 保存游戏记录
        const id = await db.createGameRecord({
          userId: ctx.user.id,
          childId: input.childId,
          gameType: input.gameType,
          score: input.score,
          level: input.level,
          duration: input.duration,
        });

        // 计算积分奖励
        const pointsEarned = Math.floor(input.score / 10);
        if (pointsEarned > 0) {
          await db.updateUserPoints(ctx.user.id, pointsEarned);
          if (input.childId) {
            await db.updateChildPoints(input.childId, pointsEarned);
          }
          await db.createPointTransaction({
            userId: ctx.user.id,
            childId: input.childId,
            amount: pointsEarned,
            type: "game",
            referenceId: id,
            description: `游戏奖励: ${input.gameType}`,
          });
        }

        return { id, pointsEarned };
      }),
    getRecords: protectedProcedure
      .input(z.object({ gameType: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        return db.getGameRecordsByUser(ctx.user.id, input.gameType);
      }),
    getLeaderboard: publicProcedure
      .input(z.object({ gameType: z.enum(["memory", "puzzle", "math"]), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        return db.getTopScores(input.gameType, input.limit);
      }),
  }),
  antonym: router({
    getRandomPairs: publicProcedure
      .input(z.object({ 
        count: z.number().min(10).max(50).default(10),
        difficulty: z.enum(['beginner', 'advanced']).default('beginner') // 初级/高级
      }))
      .query(async ({ input }) => {
        return db.getRandomAntonymPairs(input.count, input.difficulty);
      }),
    
    getAllPairs: publicProcedure.query(async () => {
      return db.getAllAntonymPairs();
    }),
    
    createPair: protectedProcedure
      .input(z.object({
        word: z.string().min(1).max(50),
        antonym: z.string().min(1).max(50),
        category: z.string().default("general"),
        difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can add antonyms" });
        }
        const id = await db.createAntonymPair(input);
        return { id };
      }),
    
    updatePair: protectedProcedure
      .input(z.object({
        id: z.number(),
        word: z.string().optional(),
        antonym: z.string().optional(),
        category: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can update antonyms" });
        }
        const { id, ...data } = input;
        await db.updateAntonymPair(id, data);
        return { success: true };
      }),
    
    deletePair: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete antonyms" });
        }
        await db.deleteAntonymPair(input.id);
        return { success: true };
      }),
  }),


  // ==================== 知识 ====================
  knowledge: router({
    getCategories: publicProcedure.query(async () => {
      return db.getAllKnowledgeCategories();
    }),
    createCategory: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        icon: z.string().optional(),
        color: z.string().optional(),
        description: z.string().optional(),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建分类" });
        }
        const id = await db.createKnowledgeCategory(input);
        return { id };
      }),
    updateCategory: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        description: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以更新分类" });
        }
        const { id, ...data } = input;
        await db.updateKnowledgeCategory(id, data);
        return { success: true };
      }),
    deleteCategory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除分类" });
        }
        await db.deleteKnowledgeCategory(input.id);
        return { success: true };
      }),
    getItems: publicProcedure
      .input(z.object({ categoryId: z.number() }))
      .query(async ({ input }) => {
        return db.getKnowledgeItemsByCategory(input.categoryId);
      }),
    getItem: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const item = await db.getKnowledgeItemById(input.id);
        if (item) {
          await db.incrementKnowledgeViewCount(input.id);
        }
        return item;
      }),
    createItem: protectedProcedure
      .input(z.object({
        categoryId: z.number(),
        title: z.string().min(1).max(200),
        content: z.string(),
        coverImage: z.string().optional(),
        images: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建内容" });
        }
        const id = await db.createKnowledgeItem({
          ...input,
          createdBy: ctx.user.id,
        });
        return { id };
      }),
    updateItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().optional(),
        coverImage: z.string().optional(),
        images: z.array(z.string()).optional(),
        isPublished: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以更新内容" });
        }
        const { id, ...data } = input;
        await db.updateKnowledgeItem(id, data);
        return { success: true };
      }),
    deleteItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除内容" });
        }
        await db.deleteKnowledgeItem(input.id);
        return { success: true };
      }),
  }),

  // ==================== 相册 ====================
  albums: router({
    // 公开访问：获取所有相册
    list: publicProcedure.query(async () => {
      return db.getAllPublicAlbums();
    }),
    // 公开访问：获取相册详情
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const album = await db.getAlbumById(input.id);
        if (!album) {
          throw new TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
        }
        return album;
      }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        childId: z.number().optional(),
        isPublic: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createAlbum({
          userId: ctx.user.id,
          ...input,
        });
        return { id };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        coverImage: z.string().optional(),
        isPublic: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const album = await db.getAlbumById(input.id);
        if (!album || album.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
        }
        const { id, ...data } = input;
        await db.updateAlbum(id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const album = await db.getAlbumById(input.id);
        if (!album || album.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
        }
        await db.deleteAlbum(input.id);
        return { success: true };
      }),
  }),

  // ==================== 照片 ====================
  photos: router({
    // 公开访问：获取相册中的照片列表
    list: publicProcedure
      .input(z.object({ albumId: z.number() }))
      .query(async ({ input }) => {
        const album = await db.getAlbumById(input.albumId);
        if (!album) {
          throw new TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
        }
        return db.getPhotosByAlbum(input.albumId);
      }),
    // 公开访问：获取单张照片详情
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getPhotoById(input.id);
      }),
    upload: protectedProcedure
      .input(z.object({
        albumId: z.number(),
        fileData: z.string(), // base64 encoded
        fileName: z.string(),
        mimeType: z.string(),
        description: z.string().optional(),
        takenAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const album = await db.getAlbumById(input.albumId);
        if (!album || album.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
        }

        // 上传到腾讯云COS（国内节点，速度快）
        const buffer = Buffer.from(input.fileData, "base64");
        const fileKey = `photos/${ctx.user.id}/${nanoid()}-${input.fileName}`;
        const { uploadImageToCOS } = await import('./cos-upload');
        const url = await uploadImageToCOS(buffer, 'ledger-photos', fileKey);

        // 保存到数据库
        const id = await db.createPhoto({
          albumId: input.albumId,
          userId: ctx.user.id,
          url,
          fileKey,
          description: input.description,
          takenAt: input.takenAt ? new Date(input.takenAt) : undefined,
        });

        // 如果是相册第一张照片，设为封面
        if (!album.coverImage) {
          await db.updateAlbum(input.albumId, { coverImage: url });
        }

        return { id, url };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        takenAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const photo = await db.getPhotoById(input.id);
        if (!photo || photo.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "照片不存在" });
        }
        const { id, ...data } = input;
        await db.updatePhoto(id, {
          ...data,
          takenAt: data.takenAt ? new Date(data.takenAt) : undefined,
        });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const photo = await db.getPhotoById(input.id);
        if (!photo || photo.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "照片不存在" });
        }
        await db.deletePhoto(input.id);
        return { success: true };
      }),
    addComment: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        content: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createPhotoComment({
          photoId: input.photoId,
          userId: ctx.user.id,
          content: input.content,
        });
        return { id };
      }),
    getComments: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .query(async ({ input }) => {
        return db.getCommentsByPhoto(input.photoId);
      }),
  }),

  // ==================== 奖励系统 ====================
  rewards: router({
    // 勋章
    getBadges: publicProcedure.query(async () => {
      return db.getAllBadges();
    }),
    getUserBadges: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserBadges(ctx.user.id);
    }),
    awardBadge: protectedProcedure
      .input(z.object({
        badgeId: z.number(),
        childId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.awardBadge({
          userId: ctx.user.id,
          badgeId: input.badgeId,
          childId: input.childId,
        });
        return { id };
      }),

    // 任务
    getTasks: protectedProcedure.query(async () => {
      return db.getActiveTasks();
    }),
    getMyTasks: protectedProcedure.query(async ({ ctx }) => {
      return db.getTasksByCreator(ctx.user.id);
    }),
    createTask: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        taskType: z.enum(["daily", "weekly", "custom"]).default("custom"),
        points: z.number().default(10),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createTask({
          createdBy: ctx.user.id,
          ...input,
        });
        return { id };
      }),
    updateTask: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        points: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const task = await db.getTaskById(input.id);
        if (!task || task.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }
        const { id, ...data } = input;
        await db.updateTask(id, data);
        return { success: true };
      }),
    completeTask: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        childId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const task = await db.getTaskById(input.taskId);
        if (!task) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }

        // 记录完成
        const id = await db.completeTask({
          taskId: input.taskId,
          userId: ctx.user.id,
          childId: input.childId,
          pointsEarned: task.points,
        });

        // 发放积分
        await db.updateUserPoints(ctx.user.id, task.points);
        if (input.childId) {
          await db.updateChildPoints(input.childId, task.points);
        }
        await db.createPointTransaction({
          userId: ctx.user.id,
          childId: input.childId,
          amount: task.points,
          type: "task",
          referenceId: input.taskId,
          description: `完成任务: ${task.title}`,
        });

        return { id, pointsEarned: task.points };
      }),
    getCompletions: protectedProcedure.query(async ({ ctx }) => {
      return db.getTaskCompletionsByUser(ctx.user.id);
    }),

    // 奖品
    list: publicProcedure.query(async ({ ctx }) => {
      // 未登录或超级管理员：返回所有活跃奖品
      if (!ctx.user || ctx.user.role === "super_admin") {
        return db.getActiveRewards();
      }
      
      // 家长：只返回自己创建的奖品
      if (ctx.user.role === "parent") {
        return db.getRewardsByCreator(ctx.user.id);
      }
      
      // 其他角色：返回所有活跃奖品
      return db.getActiveRewards();
    }),
    getRewards: publicProcedure.query(async () => {
      return db.getActiveRewards();
    }),
    createReward: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        icon: z.string().optional(),
        pointsCost: z.number().default(100),
        stock: z.number().default(-1),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createReward({
          createdBy: ctx.user.id,
          ...input,
        });
        return { id };
      }),
    updateReward: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        pointsCost: z.number().optional(),
        stock: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const reward = await db.getRewardById(input.id);
        if (!reward) {
          throw new TRPCError({ code: "NOT_FOUND", message: "奖品不存在" });
        }
        // 家长只能编辑自己创建的奖品，超级管理员可以编辑所有奖品
        if (ctx.user.role !== "super_admin" && reward.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "无权编辑此奖品" });
        }
        const { id, ...data } = input;
        await db.updateReward(id, data);
        return { success: true };
      }),
    redeemReward: protectedProcedure
      .input(z.object({
        rewardId: z.number(),
        childId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const reward = await db.getRewardById(input.rewardId);
        if (!reward || !reward.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "奖品不存在或已下架" });
        }

        // 检查积分
        const user = await db.getUserById(ctx.user.id);
        if (!user || user.points < reward.pointsCost) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "积分不足" });
        }

        // 检查库存
        if (reward.stock !== -1 && reward.stock <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "库存不足" });
        }

        // 扣除积分
        await db.updateUserPoints(ctx.user.id, -reward.pointsCost);
        if (input.childId) {
          await db.updateChildPoints(input.childId, -reward.pointsCost);
        }

        // 减少库存
        if (reward.stock !== -1) {
          await db.updateReward(input.rewardId, { stock: reward.stock - 1 });
        }

        // 创建兑换记录
        const id = await db.redeemReward({
          rewardId: input.rewardId,
          userId: ctx.user.id,
          childId: input.childId,
          pointsSpent: reward.pointsCost,
        });

        // 记录积分交易
        await db.createPointTransaction({
          userId: ctx.user.id,
          childId: input.childId,
          amount: -reward.pointsCost,
          type: "reward",
          referenceId: input.rewardId,
          description: `兑换奖品: ${reward.name}`,
        });

        return { id };
      }),
    getRedemptions: protectedProcedure.query(async ({ ctx }) => {
      return db.getRedemptionsByUser(ctx.user.id);
    }),
    updateRedemptionStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "approved", "rejected", "completed"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以处理兑换" });
        }
        await db.updateRedemptionStatus(input.id, input.status);
        return { success: true };
      }),

    // 积分
    getPoints: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      return { points: user?.points ?? 0 };
    }),
    deleteReward: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const reward = await db.getRewardById(input.id);
        if (!reward || reward.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "奖品不存在" });
        }
        await db.deleteReward(input.id);
        return { success: true };
      }),
    getTransactions: protectedProcedure.query(async ({ ctx }) => {
      return db.getPointTransactionsByUser(ctx.user.id);
    }),
    
    // 获取积分历史记录
    getPointHistory: protectedProcedure
      .input(z.object({
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        return dbPoints.getPointHistory(ctx.user.id, input.limit);
      }),
    
    // 获取积分统计数据
    getPointStats: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      const stats = await dbPoints.getPointStats(ctx.user.id);
      return {
        currentPoints: user?.points ?? 0,
        ...stats,
      };
    }),
    
    // 用星星兑换奖品
    redeemWithStars: publicProcedure
      .input(z.object({
        kidId: z.number(),
        rewardId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const reward = await db.getRewardById(input.rewardId);
        if (!reward || !reward.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "奖品不存在或已下架" });
        }

        // 检查孩子的星星数
        const kid = await db.getSpecialKidById(input.kidId);
        if (!kid || kid.stars < reward.pointsCost) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "星星不足" });
        }

        // 检查库存
        if (reward.stock !== -1 && reward.stock <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "库存不足" });
        }

        // 扣除星星
        await db.updateSpecialKidStars(input.kidId, -reward.pointsCost);

        // 减少库存
        if (reward.stock !== -1) {
          await db.updateReward(input.rewardId, { stock: reward.stock - 1 });
        }

        // 创建兑换记录
        const redemptionId = await db.redeemReward({
          rewardId: input.rewardId,
          userId: reward.createdBy, // 使用奖品创建者作为userId
          childId: input.kidId,
          pointsSpent: reward.pointsCost,
        });

        return { 
          id: redemptionId,
          itemName: reward.name,
        };
      }),
  }),

  // ==================== 喵喵旺旺专属模块 ====================
  specialKids: router({
    // 获取喵喵和斺斺的信息
    // 根据用户角色返回不同的宝宝列表：
    // - super_admin: 返回所有宝宝（喵喵、斺斺）- 仅用于首页展示
    // - parent: 只返回该家长的家庭中的宝宝
    // - baby: 返回空列表
    list: publicProcedure
      .input(z.object({ forManagement: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        // 未登录：返回所有特殊宝宝（喵喵、旺旺），供演示
        if (!ctx.user) {
          return db.getSpecialKids();
        }
        
        // 超级管理员：
        // - 如果是宝贝档案管理页面（forManagement=true），返回自己的宝宝（空列表）
        // - 如果是首页（forManagement=false），返回所有特殊宝宝用于演示
        if (ctx.user.role === "super_admin") {
          if (input?.forManagement) {
            return db.getKidsByParent(ctx.user.id);
          }
          return db.getSpecialKids();
        }
        
        // 家长：只返回自己家庭中的宝宝
        if (ctx.user.role === "parent") {
          return db.getKidsByParent(ctx.user.id);
        }
        
        // 宝宝：返回自己的信息（用于显示“切换回家长”按钮）
        if (ctx.user.role === "baby") {
          const db_instance = await db.getDb();
          if (!db_instance) return [];
          
          const { specialKids, users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          
          const kids = await db_instance.select({
            id: specialKids.id,
            userId: specialKids.userId,
            parentUserId: specialKids.parentUserId,
            name: specialKids.name,
            avatar: specialKids.avatar,
            stars: specialKids.stars,
            position: specialKids.position,
            createdAt: specialKids.createdAt,
            updatedAt: specialKids.updatedAt,
            username: users.username,
          }).from(specialKids)
            .leftJoin(users, eq(specialKids.userId, users.id))
            .where(eq(specialKids.userId, ctx.user.id));
          
          return kids as any[];
        }
        
        return [];
      }),
    
    // 获取单个孩子信息
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getSpecialKidById(input.id);
      }),
    
    // 更新孩子信息（管理员）
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        avatar: z.string().optional(),
        starsChange: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改" });
        }
        // 更新基本信息
        if (input.name || input.avatar) {
          await db.updateSpecialKid(input.id, {
            name: input.name,
            avatar: input.avatar,
          });
        }
        // 调整星星数量
        if (input.starsChange !== undefined && input.starsChange !== 0) {
          await db.updateSpecialKidStars(input.id, input.starsChange);
        }
        return { success: true };
      }),
    
    // 上传头像
    uploadAvatar: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        filename: z.string(),
        contentType: z.string(),
        fileData: z.instanceof(Uint8Array),
      }))
      .mutation(async ({ ctx, input }) => {
        // 只有家长和超级管理员可以上传头像
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有家长可以添加宝宝头像" });
        }
        
        const buffer = Buffer.from(input.fileData);
        const ext = input.contentType.split("/")[1] || "jpg";
        const fileKey = `kids/avatar-${input.id || Date.now()}-${nanoid()}.${ext}`;
        
        const { uploadImageToCOS } = await import('./cos-upload');
        const url = await uploadImageToCOS(buffer, 'avatars', fileKey);
        
        // 如果提供了宝宝ID，更新数据库
        if (input.id) {
          await db.updateSpecialKid(input.id, { avatar: url });
        }
        
        return { url };
      }),
    
    // 创建宝宝（家长添加）
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有家长可以添加宝宝" });
        }
        
        const existingKids = await db.getKidsByParent(ctx.user.id);
        const kidCount = existingKids?.length || 0;
        
        let position: "left" | "right" = "left";
        if (kidCount === 1) {
          position = "right";
        } else if (kidCount >= 2) {
          position = "left";
        }
        
        // 为宝宝创建登录账户
        // 账号规则：baby_姓名_随机数
        // 密码：固定为 123456
        const defaultPassword = "123456";
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        const username = `baby_${input.name}_${randomSuffix}`;
        const passwordHash = await hashPassword(defaultPassword);
        
        const userId = await db.createUserWithPassword({
          username,
          passwordHash,
          name: input.name,
          role: "baby",
        });
        
        if (!userId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建宝宝账户失败" });
        }
        
        const kid = await db.createSpecialKid({
          name: input.name,
          position,
          parentUserId: ctx.user.id,
          userId,
        });
        
        // 返回宝宝信息和账户信息
        return {
          ...kid,
          account: {
            username,
            password: defaultPassword,
          },
        };
      }),
    
    // 删除宝宝
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // 超级管理员可以删除任何宝宝
        if (ctx.user.role === "super_admin") {
          await db.deleteSpecialKid(input.id);
          return { success: true };
        }
        
        // 家长只能删除自己的宝宝
        if (ctx.user.role === "parent") {
          // 先检查这个宝宝是否属于当前家长
          const kid = await db.getSpecialKidById(input.id);
          if (!kid || kid.parentUserId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "你只能删除自己的宝宝" });
          }
          
          await db.deleteSpecialKid(input.id);
          return { success: true };
        }
        
        // 宝宝角色不能删除
        throw new TRPCError({ code: "FORBIDDEN", message: "无权删除宝宝" });
      }),
    
    // 获取孩子的奖励记录
    getRewards: publicProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return db.getStarRewardsByKid(input.kidId);
      }),
  }),
  
  // ==================== 五角星奖励规则 ====================
  starRules: router({
    // 获取所有奖励规则
    list: publicProcedure.query(async () => {
      return db.getStarRewardRules();
    }),
    
    // 更新奖励规则（管理员）
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        starsReward: z.number().min(0),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改奖励规则" });
        }
        await db.updateStarRewardRule(input.id, {
          starsReward: input.starsReward,
          isActive: input.isActive,
        });
        return { success: true };
      }),
    
    // 创建自定义奖励规则（管理员）
    create: protectedProcedure
      .input(z.object({
        activityType: z.string().min(1),
        activityName: z.string().min(1),
        starsReward: z.number().min(0),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建奖励规则" });
        }
        const id = await db.createStarRewardRule(input);
        return { id };
      }),
    
    // 删除奖励规则（管理员）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除奖励规则" });
        }
        await db.deleteStarRewardRule(input.id);
        return { success: true };
      }),
  }),
  
  // ==================== 五角星奖励发放 ====================
  starRewards: router({
    // 发放奖励（游戏获胜等）
    award: publicProcedure
      .input(z.object({
        kidId: z.number(),
        activityType: z.string(),
        description: z.string().optional(),
        customStars: z.number().optional(), // 自定义星星数量（反义词游戏等根据题数变化）
      }))
      .mutation(async ({ input }) => {
        // 获取奖励规则
        const rule = await db.getStarRewardRuleByType(input.activityType);
        if (!rule || !rule.isActive) {
          return { success: false, starsEarned: 0, message: "该活动没有奖励" };
        }
        
        // 使用自定义星星数量（如果提供），否则使用规则默认值
        const starsToAward = input.customStars ?? rule.starsReward;
        
        // 创建奖励记录
        await db.createStarReward({
          kidId: input.kidId,
          activityType: input.activityType,
          starsEarned: starsToAward,
          description: input.description || rule.activityName,
        });
        
        return { 
          success: true, 
          starsEarned: starsToAward,
          activityName: rule.activityName,
        };
      }),
    
    // 管理员手动发放奖励
    manualAward: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        stars: z.number().min(1),
        description: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以手动发放奖励" });
        }
        
        await db.createStarReward({
          kidId: input.kidId,
          activityType: "manual",
          starsEarned: input.stars,
          description: input.description,
        });
        
        return { success: true };
      }),
  }),
  
  // ==================== 星星商城 ====================
  starShop: router({
    // 获取商品列表
    list: publicProcedure.query(async () => {
      return db.getStarShopItems();
    }),
    
    // 获取所有商品（包括下架的，管理员用）
    listAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以查看所有商品" });
      }
      return db.getAllStarShopItems();
    }),
    
    // 创建商品（管理员）
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        image: z.string().optional(),
        starsCost: z.number().min(1),
        stock: z.number().default(-1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建商品" });
        }
        const id = await db.createStarShopItem(input);
        return { id };
      }),
    
    // 更新商品（管理员）
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        image: z.string().optional(),
        starsCost: z.number().optional(),
        stock: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改商品" });
        }
        const { id, ...data } = input;
        await db.updateStarShopItem(id, data);
        return { success: true };
      }),
    
    // 删除商品（管理员）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除商品" });
        }
        await db.deleteStarShopItem(input.id);
        return { success: true };
      }),
    
    // 兑换商品
    redeem: publicProcedure
      .input(z.object({
        kidId: z.number(),
        itemId: z.number(),
      }))
      .mutation(async ({ input }) => {
        // 获取孩子信息
        const kid = await db.getSpecialKidById(input.kidId);
        if (!kid) {
          throw new TRPCError({ code: "NOT_FOUND", message: "找不到孩子信息" });
        }
        
        // 获取商品信息
        const item = await db.getStarShopItemById(input.itemId);
        if (!item || !item.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "商品不存在或已下架" });
        }
        
        // 检查星星是否足够
        if (kid.stars < item.starsCost) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "星星不足" });
        }
        
        // 检查库存
        if (item.stock !== -1 && item.stock <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "商品已售罄" });
        }
        
        // 创建兑换记录
        const id = await db.createStarRedemption({
          kidId: input.kidId,
          itemId: input.itemId,
          starsSpent: item.starsCost,
        });
        
        // 更新库存
        if (item.stock !== -1) {
          await db.updateStarShopItem(input.itemId, { stock: item.stock - 1 });
        }
        
        return { id, itemName: item.name };
      }),
    
    // 获取兑换记录
    getRedemptions: publicProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return db.getStarRedemptionsByKid(input.kidId);
      }),
    
    // 获取所有兑换记录（管理员）
    getAllRedemptions: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以查看所有兑换记录" });
      }
      return db.getAllStarRedemptions();
    }),
    
    // 更新兑换状态（管理员）
    updateRedemptionStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "approved", "rejected", "completed"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以处理兑换" });
        }
        await db.updateStarRedemptionStatus(input.id, input.status);
        return { success: true };
      }),
  }),

  // ==================== 游戏排序偏好 ====================
  gameOrder: router({
    // 获取孩子的游戏排序偏好
    get: publicProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        const preference = await db.getGameOrderPreference(input.kidId);
        if (!preference) {
          return { gameOrders: null };
        }
        return { gameOrders: JSON.parse(preference.gameOrders) };
      }),

    // 保存孩子的游戏排序偏好
    save: publicProcedure
      .input(z.object({
        kidId: z.number(),
        gameOrders: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        await db.saveGameOrderPreference(input.kidId, input.gameOrders);
        return { success: true };
      }),
  }),

  // ==================== 错题本 ====================
  wrongQuestions: router({
    // 记录错题
    add: publicProcedure
      .input(z.object({
        kidId: z.number(),
        gameType: z.enum(["math", "antonym", "character"]),
        questionData: z.string(), // JSON字符串
        userAnswer: z.string(),
        correctAnswer: z.string(),
      }))
      .mutation(async ({ input }) => {
        await db.createWrongQuestion(input);
        return { success: true };
      }),

    // 获取错题列表
    list: publicProcedure
      .input(z.object({
        kidId: z.number(),
        gameType: z.enum(["math", "antonym", "character"]).optional(),
      }))
      .query(async ({ input }) => {
        return await db.getWrongQuestionsByKid(input.kidId, input.gameType);
      }),

    // 标记为已复习
    markReviewed: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.markWrongQuestionReviewed(input.id);
        return { success: true };
      }),

    // 删除错题
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteWrongQuestion(input.id);
        return { success: true };
      }),

    // 获取错题统计
    stats: publicProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return await db.getWrongQuestionStats(input.kidId);
      }),
  }),

  // ==================== 汉字学习 ====================
  character: router({
    // 获取随机汉字题目
    getRandomCharacters: publicProcedure
      .input(z.object({
        count: z.number().min(5).max(1000).default(10),
        category: z.string().optional(),
        difficulty: z.number().min(1).max(5).optional(),
      }))
      .query(async ({ input }) => {
        return await db.getRandomCharacters(input.count, input.category, input.difficulty);
      }),

    // 获取所有汉字（管理后台用）
    getAll: publicProcedure
      .input(z.object({
        category: z.string().optional(),
        difficulty: z.number().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getAllCharacters(input);
      }),

    // 创建汉字（管理员）
    create: protectedProcedure
      .input(z.object({
        character: z.string().min(1).max(10),
        pinyin: z.string().min(1).max(50),
        imageUrl: z.string().url(),
        fileKey: z.string(),
        category: z.string().min(1).max(50),
        difficulty: z.number().min(1).max(5).default(1),
        strokeCount: z.number().min(0).default(0),
        commonWords: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can create characters" });
        }
        const id = await db.createCharacter(input);
        return { id };
      }),

    // 更新汉字（管理员）
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        character: z.string().optional(),
        pinyin: z.string().optional(),
        imageUrl: z.string().optional(),
        fileKey: z.string().optional(),
        category: z.string().optional(),
        difficulty: z.number().optional(),
        strokeCount: z.number().optional(),
        commonWords: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can update characters" });
        }
        const { id, ...data } = input;
        await db.updateCharacter(id, data);
        return { success: true };
      }),

    // 删除汉字（管理员）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete characters" });
        }
        await db.deleteCharacter(input.id);
        return { success: true };
      }),

    // 记录学习
    recordLearning: publicProcedure
      .input(z.object({
        kidId: z.number(),
        characterId: z.number(),
        isCorrect: z.boolean(),
        timeSpent: z.number(), // 秒
      }))
      .mutation(async ({ input }) => {
        const id = await db.recordCharacterLearning(input);
        return { id };
      }),

    // 获取学习记录
    getLearningRecords: publicProcedure
      .input(z.object({
        kidId: z.number(),
        characterId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getCharacterLearningRecords(input.kidId, input.characterId);
      }),

    // 获取汉字统计信息
    getStats: publicProcedure
      .query(async () => {
        return await db.getCharacterStats();
      }),

    // 获取快闪识字记录
    getFlashcardRecord: publicProcedure
      .input(z.object({
        kidId: z.number(),
        characterId: z.number(),
      }))
      .query(async ({ input }) => {
        return await db.getFlashcardRecordByCharacter(input.kidId, input.characterId);
      }),

    // 获取所有快闪识字记录
    getAllFlashcardRecords: publicProcedure
      .input(z.object({
        kidId: z.number(),
      }))
      .query(async ({ input }) => {
        return await db.getFlashcardRecords(input.kidId);
      }),

    // 记录认识
    recordKnown: publicProcedure
      .input(z.object({
        kidId: z.number(),
        characterId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.incrementFlashcardKnown(input.kidId, input.characterId);
        return { success: true };
      }),

    // 记录忘记
    recordForgotten: publicProcedure
      .input(z.object({
        kidId: z.number(),
        characterId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.incrementFlashcardForgotten(input.kidId, input.characterId);
        return { success: true };
      }),
  }),

  // ==================== 刷牙游戏 ====================
  brushing: router({
    // 创建刷牙记录
    create: publicProcedure
      .input(z.object({
        kidId: z.number(),
        duration: z.number().min(120).max(300), // 2-5分钟
        completed: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        // 创建刷牙记录
        const session = await db.createBrushingSession({
          kidId: input.kidId,
          duration: input.duration,
          completed: input.completed,
          starsEarned: 1, // 完成刷牙获得1颗星
        });

        if (!session) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建刷牙记录失败" });
        }

        // 发放星星奖励
        await db.createStarReward({
          kidId: input.kidId,
          activityType: "brushing_complete",
          starsEarned: 1,
          description: "完成刷牙任务",
        });

        return { session, starsEarned: 1 };
      }),

    // 获取刷牙记录列表
    list: publicProcedure
      .input(z.object({
        kidId: z.number(),
        limit: z.number().min(1).max(100).default(10),
      }))
      .query(async ({ input }) => {
        return await db.getBrushingSessions(input.kidId, input.limit);
      }),

    // 获取刷牙统计
    stats: publicProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return await db.getBrushingStats(input.kidId);
      }),
  }),

  // ==================== 邀请码管理 ====================
  invitations: router({
    // 创建邀请码（仅超级管理员）
    create: protectedProcedure
      .input(z.object({
        familyName: z.string().optional(),
        maxUses: z.number().min(1).max(100).optional(),
        expiresInDays: z.number().min(1).max(365).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只有超级管理员可以创建邀请码' });
        }
        
        const expiresAt = input.expiresInDays 
          ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
          : undefined;
        
        const result = await db.createInvitation({
          familyName: input.familyName,
          maxUses: input.maxUses || 1,
          expiresAt,
          createdBy: ctx.user.id,
        });
        
        if (!result) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '创建邀请码失败' });
        }
        
        return result;
      }),
    
    // 获取所有邀请码（仅超级管理员）
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权查看邀请码列表' });
      }
      return await db.getAllInvitations();
    }),
    
    // 验证邀请码（公开接口）
    validate: publicProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        const result = await db.validateInvitation(input.code);
        return {
          valid: result.valid,
          familyName: result.invitation?.familyName,
          error: result.error,
        };
      }),
    
    // 使用邀请码注册（公开接口）
    register: publicProcedure
      .input(z.object({
        code: z.string(),
        username: z.string().min(1).max(20),
        password: z.string().min(6),
        name: z.string().optional(),
        email: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const passwordHash = await hashPassword(input.password);
        
        const result = await db.useInvitationToRegister({
          code: input.code,
          username: input.username,
          passwordHash,
          name: input.name,
          email: input.email,
        });
        
        if (!result.success) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: result.error || '注册失败' });
        }
        
        // 获取新创建的用户并创建session
        const user = await db.getUserByUsername(input.username);
        if (!user) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '创建用户失败' });
        }
        
        // 创建session token
        const sessionToken = await sdk.createSessionToken(user.id.toString(), {
          expiresInMs: ONE_YEAR_MS,
          name: user.name || user.username || '',
        });
        
        // 设置cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        
        return {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            familyId: result.familyId,
          },
        };
      }),
    
    // 停用邀请码（仅超级管理员）
    deactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '无权停用邀请码' });
        }
        
        const success = await db.deactivateInvitation(input.id);
        if (!success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '停用失败' });
        }
        
        return { success: true };
      }),
  }),

  // ==================== 家庭管理 ====================
  families: router({
    // 获取所有家庭（仅超级管理员）
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权查看家庭列表' });
      }
      return await db.getAllFamilies();
    }),
    
    // 获取家庭成员
    members: protectedProcedure
      .input(z.object({ familyId: z.number() }))
      .query(async ({ ctx, input }) => {
        // 超级管理员可以查看任何家庭，家长只能查看自己家庭
        if (ctx.user.role !== 'super_admin' && ctx.user.familyId !== input.familyId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '无权查看该家庭成员' });
        }
        return await db.getFamilyMembers(input.familyId);
      }),
  }),

  // ==================== 初始化 ====================
  init: router({
    setup: publicProcedure.mutation(async () => {
      await db.initializeDefaultData();
      await db.initDefaultStarRewardRules();
      await db.initSpecialKids();
      return { success: true };
    }),
  }),

  // ==================== 语音合成 ====================
  tts: router({
    speak: publicProcedure
      .input(z.object({
        text: z.string().min(1).max(500),
        voice: z.string().optional(),
        speed: z.number().min(0.5).max(2.0).optional(),
      }))
      .mutation(async ({ input }) => {
        return await textToSpeech(input);
      }),
  }),

  // ==================== 首页横幅 ====================
  homeBanner: router({
    // 获取当前活跃的横幅（公开接口）
    get: publicProcedure.query(async () => {
      return await db.getActiveHomeBanner();
    }),
    
    // 更新横幅（仅超级管理员）
    update: protectedProcedure
      .input(z.object({
        title: z.string().max(200).optional(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只有超级管理员可以更新横幅' });
        }
        await db.upsertHomeBanner(input);
        return { success: true };
      }),
  }),

  // 20加法游戏
  addition20: router({
    // 获取游戏配置
    getConfig: protectedProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        const config = await db.getAddition20Config(input.kidId);
        return config || {
          kidId: input.kidId,
          difficulty: "easy" as const,
          questionCount: 10,
          answerMode: "choice" as const,
        };
      }),

    // 保存游戏配置（家长使用）
    saveConfig: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        questionCount: z.number().min(10).max(50).optional(),
        answerMode: z.enum(["choice", "input"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查权限：只有家长或管理员可以修改配置
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有家长可以修改游戏配置" });
        }
        await db.upsertAddition20Config(input);
        return { success: true };
      }),

    // 保存游戏记录
    saveRecord: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        difficulty: z.enum(["easy", "medium", "hard"]),
        questionCount: z.number(),
        correctCount: z.number(),
        duration: z.number(),
        answerMode: z.enum(["choice", "input"]),
        starsEarned: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        const id = await db.saveAddition20Record(input);
        return { id };
      }),

    // 获取游戏记录
    getRecords: protectedProcedure
      .input(z.object({ kidId: z.number(), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        return db.getAddition20Records(input.kidId, input.limit);
      }),

    // 获取最高分
    getHighScore: protectedProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return db.getAddition20HighScore(input.kidId);
      }),

    // ==================== 有奖挑战相关 ====================

    // 创建有奖挑战（家长使用）
    createChallenge: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        targetCorrectCount: z.number().min(10).max(1000),
        penaltyPerWrong: z.number().min(0).max(10).default(0),
        rewardTitle: z.string().min(1).max(100),
        rewardImageUrl: z.string().optional(),
        rewardFileKey: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查权限：只有家长或管理员可以创建挑战
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有家长可以创建挑战" });
        }

        // 检查是否已有活跃的挑战
        const existingChallenge = await db.getActiveAddition20Challenge(input.kidId);
        if (existingChallenge) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "已有进行中的挑战，请先完成或取消" });
        }

        const id = await db.createAddition20Challenge({
          ...input,
          parentId: ctx.user.id,
        });
        return { id };
      }),

    // 获取活跃挑战
    getActiveChallenge: protectedProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return db.getActiveAddition20Challenge(input.kidId);
      }),

    // 更新挑战进度
    updateChallengeProgress: protectedProcedure
      .input(z.object({
        challengeId: z.number(),
        currentCorrectCount: z.number().optional(),
        totalAttempted: z.number().optional(),
        totalCorrect: z.number().optional(),
        totalWrong: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { challengeId, ...data } = input;
        await db.updateAddition20ChallengeProgress(challengeId, {
          ...data,
          lastPlayedAt: new Date(),
        });
        return { success: true };
      }),

    // 完成挑战
    completeChallenge: protectedProcedure
      .input(z.object({ challengeId: z.number() }))
      .mutation(async ({ input }) => {
        await db.completeAddition20Challenge(input.challengeId);
        return { success: true };
      }),

    // 暂停挑战（休息保存）
    pauseChallenge: protectedProcedure
      .input(z.object({ challengeId: z.number() }))
      .mutation(async ({ input }) => {
        await db.pauseAddition20Challenge(input.challengeId);
        return { success: true };
      }),

    // 恢复挑战
    resumeChallenge: protectedProcedure
      .input(z.object({ challengeId: z.number() }))
      .mutation(async ({ input }) => {
        await db.resumeAddition20Challenge(input.challengeId);
        return { success: true };
      }),

    // 取消/放弃挑战（需要家长密码验证）
    cancelChallenge: protectedProcedure
      .input(z.object({ 
        challengeId: z.number(),
        password: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        // 验证家长密码
        const user = await db.getUserById(ctx.user.id);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "请先设置家长密码" });
        }
        
        const bcrypt = await import("bcryptjs");
        const isValid = await bcrypt.default.compare(input.password, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "密码错误" });
        }
        
        // 取消挑战
        await db.cancelAddition20Challenge(input.challengeId);
        return { success: true };
      }),

    // 获取挑战历史
    getChallengeHistory: protectedProcedure
      .input(z.object({ kidId: z.number(), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        return db.getAddition20ChallengeHistory(input.kidId, input.limit);
      }),

    // 验证家长密码
    verifyParentPassword: protectedProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // 检查权限：只有家长或管理员可以验证
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有家长可以验证密码" });
        }

        // 获取当前用户的密码哈希
        const user = await db.getUserById(ctx.user.id);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "未设置密码" });
        }

        // 验证密码
        const bcrypt = await import("bcryptjs");
        const isValid = await bcrypt.default.compare(input.password, user.passwordHash);
        
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "密码错误" });
        }

        return { success: true };
      }),
  }),

  // 阅读识字游戏
  readingGame: router({
    // 获取故事列表
    getStories: protectedProcedure
      .input(z.object({ kidId: z.number().optional() }))
      .query(async ({ input }) => {
        return db.getReadingStories(input.kidId);
      }),

    // 获取单个故事
    getStory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getReadingStoryById(input.id);
      }),

    // 创建自定义故事
    createStory: protectedProcedure
      .input(z.object({
        title: z.string(),
        content: z.string().max(5000, "故事内容最多5000字"),
        type: z.enum(["custom", "ai_generated"]),
        kidId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const storyId = await db.createReadingStory({
          title: input.title,
          content: input.content,
          type: input.type,
          createdBy: ctx.user.id,
          kidId: input.kidId,
        });
        return { storyId };
      }),

    // 更新故事
    updateStory: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().max(5000).optional(),
      }))
      .mutation(async ({ input }) => {
        await db.updateReadingStory(input.id, {
          title: input.title,
          content: input.content,
        });
        return { success: true };
      }),

    // 删除故事
    deleteStory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteReadingStory(input.id);
        return { success: true };
      }),

    // AI生成故事
    generateStory: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        theme: z.string().optional(), // 主题（可选）
        wordCount: z.number().min(50).max(500).default(100), // 字数限制
      }))
      .mutation(async ({ ctx, input }) => {
        const { invokeLLM } = await import("./_core/llm");
        
        // 计算字数范围（允许±10%的浮动）
        const minWords = Math.max(input.wordCount - 10, 30);
        const maxWords = input.wordCount + 10;
        
        const prompt = input.theme 
          ? `请为学龄前儿童创作一个主题为「${input.theme}」的故事。

重要要求：
1. 故事总字数必须严格控制在 ${minWords}-${maxWords} 字之间，目标是 ${input.wordCount} 字。
2. 请精确计算字数，不要超出范围。
3. 故事应该有趣、有教育意义，使用简单易懂的语言。
4. 如果字数较少（50-100字），请创作简短的小故事。`
          : `请为学龄前儿童创作一个故事。

重要要求：
1. 故事总字数必须严格控制在 ${minWords}-${maxWords} 字之间，目标是 ${input.wordCount} 字。
2. 请精确计算字数，不要超出范围。
3. 故事应该有趣、有教育意义，使用简单易懂的语言。
4. 请随机选择一个适合孩子的主题（如动物、植物、友谊、勇气等）。
5. 如果字数较少（50-100字），请创作简短的小故事。`;
        
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "你是一个儿童故事作家，擅长创作适合学龄前儿童的故事。" },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "story",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", description: "故事标题" },
                  content: { type: "string", description: "故事内容" },
                },
                required: ["title", "content"],
                additionalProperties: false,
              },
            },
          },
        });
        
        const content = response.choices[0].message.content;
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        const storyData = JSON.parse(contentStr || "{}");
        
        // 生成故事配图
        let coverImageUrl: string | undefined;
        try {
          const { generateImage } = await import("./_core/imageGeneration");
          const imagePrompt = `为儿童故事《${storyData.title}》创作一幅卡通风格的封面插图。故事简介：${storyData.content.substring(0, 100)}...

要求：
1. 卡通风格，色彩明亮温暖
2. 适合学龄前儿童观看
3. 画面简洁可爱，不要文字
4. 体现故事主题和情节`;
          
          const result = await generateImage({
            prompt: imagePrompt,
          });
          
          coverImageUrl = result.url;
        } catch (error) {
          console.error("生成故事配图失败：", error);
          // 如果图片生成失败，不影响故事创建
        }
        
        // 保存AI生成的故事
        const storyId = await db.createReadingStory({
          title: storyData.title,
          content: storyData.content,
          type: "ai_generated",
          coverImageUrl,
          createdBy: ctx.user.id,
          kidId: input.kidId,
        });
        
        return { 
          storyId,
          title: storyData.title,
          content: storyData.content,
          coverImageUrl,
        };
      }),

    // 文本转语音（TTS）
    textToSpeech: protectedProcedure
      .input(z.object({ text: z.string().max(1000) }))
      .mutation(async ({ input }) => {
        // 使用Manus内置TTS API
        const response = await fetch(`${process.env.BUILT_IN_FORGE_API_URL}/tts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
          },
          body: JSON.stringify({
            text: input.text,
            voice: "zh-CN-XiaoxiaoNeural", // 使用中文女声
          }),
        });
        
        if (!response.ok) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "TTS服务调用失败" });
        }
        
        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString("base64");
        
        return { audioData: base64Audio };
      }),

    // 创建阅读记录
    createRecord: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        storyId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const recordId = await db.createReadingRecord(input);
        return { recordId };
      }),

    // 更新阅读记录
    updateRecord: protectedProcedure
      .input(z.object({
        recordId: z.number(),
        clickCount: z.number().optional(),
        readDuration: z.number().optional(),
        completed: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const updateData: any = {};
        if (input.clickCount !== undefined) updateData.clickCount = input.clickCount;
        if (input.readDuration !== undefined) updateData.readDuration = input.readDuration;
        if (input.completed) updateData.completedAt = new Date();
        
        await db.updateReadingRecord(input.recordId, updateData);
        return { success: true };
      }),

    // 获取阅读记录
    getRecords: protectedProcedure
      .input(z.object({ kidId: z.number(), limit: z.number().default(20) }))
      .query(async ({ input }) => {
        return db.getReadingRecords(input.kidId, input.limit);
      }),
  }),

  // ==================== 宝宝词库 ====================
  vocabulary: router({
    // 获取总词库列表（超级管理员）
    masterList: protectedProcedure
      .input(z.object({
        language: z.enum(["chinese", "english"]).optional(),
        category: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        search: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以查看总词库" });
        }
        return await db.getVocabularyMasterList(input);
      }),

    // 创建总词库词汇（超级管理员）
    masterCreate: protectedProcedure
      .input(z.object({
        word: z.string().min(1).max(100),
        language: z.enum(["chinese", "english"]),
        translation: z.string().max(200).optional(),
        pinyin: z.string().max(100).optional(),
        pronunciation: z.string().max(100).optional(),
        category: z.string().default("general"),
        difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
        example: z.string().optional(),
        imageUrl: z.string().optional(),
        audioUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以添加总词库" });
        }
        const vocab = await db.createVocabularyMaster(input);
        return { id: vocab?.id };
      }),

    // 更新总词库词汇（超级管理员）
    masterUpdate: protectedProcedure
      .input(z.object({
        id: z.number(),
        word: z.string().optional(),
        translation: z.string().optional(),
        pinyin: z.string().optional(),
        pronunciation: z.string().optional(),
        category: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        example: z.string().optional(),
        imageUrl: z.string().optional(),
        audioUrl: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以修改总词库" });
        }
        const { id, ...data } = input;
        await db.updateVocabularyMaster(id, data);
        return { success: true };
      }),

    // 删除总词库词汇（超级管理员）
    masterDelete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以删除总词库" });
        }
        await db.deleteVocabularyMaster(input.id);
        return { success: true };
      }),

    // 获取家长词库列表
    familyList: protectedProcedure
      .input(z.object({
        language: z.enum(["chinese", "english"]).optional(),
        kidId: z.number().nullable().optional(),
        wordType: z.enum(["character", "word"]).optional(),
      }))
      .query(async ({ ctx, input }) => {
        // 家长只能查看自己的词库
        return await db.getFamilyVocabularyList(ctx.user.id, input.language, input.kidId, input.wordType);
      }),

    // 添加词汇到家长词库
    familyAdd: protectedProcedure
      .input(z.object({
        kidId: z.number().nullable().optional(),
        word: z.string().min(1).max(100),
        language: z.enum(["chinese", "english"]),
        wordType: z.enum(["character", "word"]).default("word"),
        translation: z.string().max(200).optional(),
        pinyin: z.string().max(100).optional(),
        pronunciation: z.string().max(100).optional(),
        category: z.string().default("general"),
        difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
        customNote: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { kidId, customNote, ...vocabData } = input;

        // 1. 检查总词库是否已存在该词汇
        let masterVocab = await db.findVocabularyMasterByWord(vocabData.word, vocabData.language);

        // 2. 如果不存在，自动添加到总词库
        if (!masterVocab) {
          masterVocab = await db.createVocabularyMaster(vocabData);
          if (!masterVocab) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "添加到总词库失败" });
          }
        }

        // 3. 添加到家长词库
        const familyVocab = await db.addVocabularyToFamily({
          parentUserId: ctx.user.id,
          vocabularyId: masterVocab.id,
          kidId,
          addedBy: ctx.user.id,
          customNote,
        });

        return { success: true, id: familyVocab?.id };
      }),

    // 从家长词库删除词汇
    familyRemove: protectedProcedure
      .input(z.object({
        vocabularyId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.removeVocabularyFromFamily(ctx.user.id, input.vocabularyId);
        return { success: true };
      }),

    // 更新家长词库备注
    familyUpdateNote: protectedProcedure
      .input(z.object({
        vocabularyId: z.number(),
        customNote: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateFamilyVocabularyNote(ctx.user.id, input.vocabularyId, input.customNote);
        return { success: true };
      }),

    // 更新学习进度
    updateMasteryLevel: protectedProcedure
      .input(z.object({
        vocabularyId: z.number(),
        masteryLevel: z.enum(["not_started", "learning", "mastered"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateFamilyVocabularyMasteryLevel(ctx.user.id, input.vocabularyId, input.masteryLevel);
        return { success: true };
      }),

    // OCR识别图片中的文字
    recognizeImage: protectedProcedure
      .input(z.object({
        imageUrl: z.string(),
        contentType: z.enum(["character", "word", "english"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { recognizeText } = await import("./_core/ocr");
        return await recognizeText(input.imageUrl, input.contentType);
      }),

    // 获取词库统计数据
    stats: protectedProcedure
      .input(z.object({
        kidId: z.number().nullable().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getFamilyVocabularyStats(ctx.user.id, input.kidId);
      }),

    // 从文本中提取词汇
    extractWords: protectedProcedure
      .input(z.object({
        text: z.string(),
        useLLM: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const { extractWords, extractWordsWithLLM } = await import("./_core/ocr");
        
        if (input.useLLM) {
          const words = await extractWordsWithLLM(input.text);
          return { words };
        } else {
          // 检测语言
          const hasChinese = /[\u4e00-\u9fa5]/.test(input.text);
          const hasEnglish = /[a-zA-Z]/.test(input.text);
          let language: "chinese" | "english" | "mixed" = "chinese";
          if (hasChinese && hasEnglish) {
            language = "mixed";
          } else if (hasEnglish && !hasChinese) {
            language = "english";
          }
          
          const words = extractWords(input.text, language);
          return { words };
        }
      }),
  }),

  // ==================== 游戏使用统计 ====================
  gameStats: router({
    // 获取所有游戏的使用统计
    getUsageStats: protectedProcedure
      .query(async ({ ctx }) => {
        // 只有超级管理员可以查看统计数据
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '只有超级管理员可以查看游戏统计数据',
          });
        }

        const stats = await db.getGameUsageStats();
        return stats;
      }),
  }),

  // ==================== VI配置管理 ====================
  vi: router({
    // 获取家长的VI配置
    getConfig: publicProcedure
      .input(z.object({
        parentUserId: z.number(),
      }))
      .query(async ({ input }) => {
        const config = await db.getViConfigByParentUserId(input.parentUserId);
        return config;
      }),

    // 更新家长的VI配置（仅超级管理员）
    updateConfig: protectedProcedure
      .input(z.object({
        parentUserId: z.number(),
        viThemeId: z.string().nullable().optional(),
        customConfig: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 只有超级管理员可以配置VI
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '只有超级管理员可以配置VI',
          });
        }

        const config = await db.upsertViConfig({
          parentUserId: input.parentUserId,
          viThemeId: input.viThemeId,
          customConfig: input.customConfig,
          createdBy: ctx.user.id,
        });

        return config;
      }),

    // 重置家长的VI配置（仅超级管理员）
    resetConfig: protectedProcedure
      .input(z.object({
        parentUserId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 只有超级管理员可以重置VI
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '只有超级管理员可以重置VI',
          });
        }

        const success = await db.deleteViConfig(input.parentUserId);
        return { success };
      }),

    // 获取可用的VI主题列表
    getAvailableThemes: publicProcedure
      .query(async () => {
        // TODO: 等待用户上传VI方案后返回实际主题列表
        const themes = await db.getAvailableViThemes();
        return themes;
      }),
  }),

  // 人脉管理
  contacts: router({
  // 获取人脉关系健康度汇总统计
  overviewStats: protectedProcedure
    .query(async ({ ctx }) => {
      const stats = await dbContacts.getContactsOverviewStats(ctx.user.id);
      return stats;
    }),

  // 获取累计使用天数
  getTotalUsageDays: protectedProcedure
    .query(async ({ ctx }) => {
      const firstContactCreatedAt = await dbContacts.getFirstContactCreatedAt(ctx.user.id);
      if (!firstContactCreatedAt) {
        return 0;
      }
      // 将字符串日期转换为Date对象，然后获取毫秒时间戳
      const firstContactDate = new Date(firstContactCreatedAt).getTime();
      const now = Date.now();
      const diffInMs = now - firstContactDate;
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
      return diffInDays;
    }),

  // 名片OCR识别
  recognizeBusinessCard: protectedProcedure
    .input(z.object({ imageUrl: z.string() }))
    .mutation(async ({ input }) => {
      // 调用LLM识别名片
      const { invokeLLM } = await import("./_core/llm");
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "你是一个专业的名片识别助手。请从名片图片中提取联系人信息,以JSON格式返回。如果某个字段无法识别,返回空字符串。"
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "请识别这张名片中的信息,提取姓名、公司、职位、电话、邮箱、地址等字段。"
              },
              {
                type: "image_url",
                image_url: {
                  url: input.imageUrl
                }
              }
            ]
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "business_card_info",
            strict: true,
            schema: {
              type: "object",
              properties: {
                name: { type: "string", description: "姓名" },
                company: { type: "string", description: "公司名称" },
                title: { type: "string", description: "职位" },
                phone: { type: "string", description: "电话号码" },
                email: { type: "string", description: "邮箱地址" },
                address: { type: "string", description: "地址" },
                wechat: { type: "string", description: "微信号" },
                website: { type: "string", description: "网站" }
              },
              required: ["name", "company", "title", "phone", "email", "address", "wechat", "website"],
              additionalProperties: false
            }
          }
        }
      });

      const content = response.choices[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "名片识别失败"
        });
      }

      const result = JSON.parse(content);
      return result;
    }),

  // 获取人脉列表
  list: protectedProcedure
    .input(z.object({
      searchQuery: z.string().optional(),
      sortBy: z.enum(['tagCount_desc', 'tagCount_asc', 'interactionCount_desc', 'interactionCount_asc']).optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(50),
      filterType: z.string().optional(), // 筛选类型: todayActive, weeklyActive, thisWeek等
    }))
    .query(async ({ ctx, input }) => {
      const paginatedResult = await dbContacts.getContactsByParentPaginated(
        ctx.user.id, 
        input.searchQuery,
        input.page,
        input.pageSize
      );
      
      const contacts = paginatedResult.contacts;
      
      if (contacts.length === 0) {
        return {
          total: paginatedResult.total,
          contacts: [],
          hasMore: false,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
        };
      }
      
      // 获取所有联系人ID
      const contactIds = contacts.map(c => c.id);
      
      // 并行批量查询所有需要的数据（只查询一次）
      const [allReferrerStats, tagsMap, personalTagsMap, interactionStatsMap, interactionInfoMap, fieldValuesMap] = await Promise.all([
        // 推荐人统计只查询一次
        dbReferrerStats.getReferrerStats(ctx.user.id).catch(err => {
          console.error('获取介绍人贡献统计失败:', err);
          return [];
        }),
        // 批量获取所有联系人的标签
        dbContacts.getTagsForContacts(contactIds),
        // 批量获取所有联系人的个人标签
        dbContacts.getPersonalTagsForContacts(contactIds),
        // 批量获取所有联系人的联络统计
        dbContacts.getInteractionStatsForContacts(contactIds),
        // 批量获取所有联系人的最后联络时间和今日联络状态
        dbContacts.getInteractionInfoForContacts(contactIds),
        // 批量获取所有联系人的字段值（公司、职位等）
        dbContacts.getFieldValuesForContacts(contactIds),
      ]);
      
      // 创建推荐人统计的Map以便快速查找
      const referrerStatsMap = new Map(
        allReferrerStats.map(stat => [stat.contactId, stat])
      );
      
      // 为每个人脉组装详情数据（不再需要单独查询）
      const contactsWithDetails = contacts.map((contact) => {
        // 从批量查询结果中获取数据
        const tags = tagsMap.get(contact.id) || [];
        const personalTags = personalTagsMap.get(contact.id) || [];
        const interactionStats = interactionStatsMap.get(contact.id) || { totalInteractions: 0 };
        const interactionInfo = interactionInfoMap.get(contact.id) || { lastInteraction: null, hasTodayInteraction: false };
        const referrerStats = referrerStatsMap.get(contact.id) || null;
        const fieldValues = fieldValuesMap.get(contact.id) || [];
        
        return {
          ...contact,
          tags,
          personalTags,
          fieldValues,
          lastInteractionDate: interactionInfo.lastInteraction,
          daysSinceLastInteraction: interactionInfo.lastInteraction 
            ? Math.floor((Date.now() - new Date(interactionInfo.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
            : null,
          hasTodayInteraction: interactionInfo.hasTodayInteraction,
          hasReferrer: contact.referrerId !== null && contact.referrerId !== undefined,
          totalInteractions: interactionStats?.totalInteractions || 0,
          directReferrals: referrerStats?.directReferrals || 0,
          indirectReferrals: referrerStats?.indirectReferrals || 0,
        };
      });
      
      // 根据filterType过滤
      let filteredContacts = contactsWithDetails;
      if (input.filterType) {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        
        filteredContacts = contactsWithDetails.filter(contact => {
          const createdAt = new Date(contact.createdAt);
          
          switch (input.filterType) {
            case 'thisWeek':
              return createdAt >= startOfWeek;
            case 'thisMonth':
              return createdAt >= startOfMonth;
            case 'thisYear':
              return createdAt >= startOfYear;
            case 'todayActive':
              return contact.hasTodayInteraction === true;
            case 'weeklyActive': {
              // 本周活跃：需要查询本周有联络记录
              // 这里简化处理，如果有lastInteractionDate且在本周内
              if (!contact.lastInteractionDate) return false;
              const lastInteraction = new Date(contact.lastInteractionDate);
              return lastInteraction >= startOfWeek;
            }
            case 'monthlyActive': {
              // 本月活跃
              if (!contact.lastInteractionDate) return false;
              const lastInteraction = new Date(contact.lastInteractionDate);
              return lastInteraction >= startOfMonth;
            }
            case 'yearlyActive': {
              // 今年活跃
              if (!contact.lastInteractionDate) return false;
              const lastInteraction = new Date(contact.lastInteractionDate);
              return lastInteraction >= startOfYear;
            }
            case 'blacklist':
              return contact.isBlacklisted === true;
            case 'needsAttention': {
              // 需要关注：基于标签的分级关注机制
              const tagNames = contact.tags?.map((t: any) => t.name) || [];
              let thresholdDays: number;
              if (tagNames.includes('周关注')) {
                thresholdDays = 7;
              } else if (tagNames.includes('月关注')) {
                thresholdDays = 30;
              } else if (tagNames.includes('季关注')) {
                thresholdDays = 90;
              } else {
                thresholdDays = 180;
              }
              
              if (!contact.lastInteractionDate) return true;
              const daysSince = Math.floor((now.getTime() - new Date(contact.lastInteractionDate).getTime()) / (1000 * 60 * 60 * 24));
              return daysSince > thresholdDays;
            }
            default:
              return true;
          }
        });
      }
      
      // 根据 sortBy 参数排序
      if (input.sortBy) {
        filteredContacts.sort((a, b) => {
          if (input.sortBy === 'tagCount_desc') {
            return (b.tags.length + b.personalTags.length) - (a.tags.length + a.personalTags.length);
          } else if (input.sortBy === 'tagCount_asc') {
            return (a.tags.length + a.personalTags.length) - (b.tags.length + b.personalTags.length);
          } else if (input.sortBy === 'interactionCount_desc') {
            return (b.totalInteractions || 0) - (a.totalInteractions || 0);
          } else if (input.sortBy === 'interactionCount_asc') {
            return (a.totalInteractions || 0) - (b.totalInteractions || 0);
          }
          return 0;
        });
      }
      
      return {
        total: filteredContacts.length, // 返回过滤后的总数
        contacts: filteredContacts,
        hasMore: false, // 过滤后一次返回所有结果，无需分页
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // 获取人脉详情
  get: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      console.log('[contacts.get] 查询人脉详情:', { contactId: input.id, userId: ctx.user.id });
      
      const contact = await dbContacts.getContactById(input.id);
      if (!contact) {
        console.error('[contacts.get] 人脉不存在:', input.id);
        throw new TRPCError({ code: "NOT_FOUND", message: "人脉不存在" });
      }
      
      console.log('[contacts.get] 找到人脉:', { id: contact.id, name: contact.name, parentUserId: contact.parentUserId });
      
      const tags = await dbContacts.getContactTagsByContactId(contact.id);
      const interactions = await dbContacts.getContactInteractions(contact.id);
      const lastInteraction = await dbContacts.getLastInteractionDate(contact.id);
      const hasTodayInteraction = await dbContacts.hasTodayInteraction(contact.id);
      
      // 获取介绍人贡献统计（该人脉作为介绍人的贡献值）
      let referrerContribution = null;
      try {
        const allReferrerStats = await dbReferrerStats.getReferrerStats(ctx.user.id);
        referrerContribution = allReferrerStats.find(stat => stat.contactId === contact.id) || null;
      } catch (error) {
        console.error('获取介绍人贡献统计失败:', error);
        // 失败时不影响整个API，继续返回其他数据
      }
      
      return {
        ...contact,
        tags,
        interactions,
        lastInteractionDate: lastInteraction,
        daysSinceLastInteraction: lastInteraction 
          ? Math.floor((Date.now() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
          : null,
        hasTodayInteraction,
        hasReferrer: contact.referrerId !== null && contact.referrerId !== undefined,
        // 介绍人贡献数据
        referrerContribution: referrerContribution ? {
          directReferrals: referrerContribution.directReferrals,
          indirectReferrals: referrerContribution.indirectReferrals,
          totalScore: referrerContribution.totalScore,
        } : null,
      };
    }),

  // 重名检测：检查姓名和昵称的各种交叉重复
  checkDuplicateName: protectedProcedure
    .input(z.object({
      name: z.string().optional(),
      title: z.string().optional(), // 昵称
      phone: z.string().optional(), // 手机号
      email: z.string().optional(), // 邮箱
      excludeId: z.number().optional(), // 编辑模式下排除当前联系人
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { name, title: nickname, phone, email, excludeId } = input;
      const duplicates: { type: string; matchedName: string; matchedTitle: string | null; matchedValue?: string; contactId: number }[] = [];
      
      if (!name && !nickname && !phone && !email) return { duplicates };
      
      const db = await (await import('./db')).getDb();
      const { contacts, contactFieldValues, contactFieldCategories } = await import('../drizzle/schema');
      const { eq, and, ne, or, sql } = await import('drizzle-orm');
      
      // 查询当前用户的所有联系人（排除当前编辑的）
      const conditions = [eq(contacts.parentUserId, userId)];
      if (excludeId) {
        conditions.push(ne(contacts.id, excludeId));
      }
      
      const allContacts = await db
        .select({ id: contacts.id, name: contacts.name, title: contacts.title, phone: contacts.phone })
        .from(contacts)
        .where(and(...conditions));
      
      const trimmedName = name?.trim().toLowerCase();
      const trimmedNickname = nickname?.trim().toLowerCase();
      const trimmedPhone = phone?.trim().replace(/\s+/g, ''); // 移除空格
      const trimmedEmail = email?.trim().toLowerCase();
      
      // 检查姓名和昵称重复
      for (const c of allContacts) {
        const cName = c.name?.trim().toLowerCase();
        const cTitle = c.title?.trim().toLowerCase();
        const cPhone = c.phone?.trim().replace(/\s+/g, '');
        
        // 1. 姓名与姓名重复
        if (trimmedName && cName && trimmedName === cName) {
          duplicates.push({ type: 'name_name', matchedName: c.name, matchedTitle: c.title, contactId: c.id });
          continue;
        }
        
        // 2. 昵称与昵称重复
        if (trimmedNickname && cTitle && trimmedNickname === cTitle) {
          duplicates.push({ type: 'title_title', matchedName: c.name, matchedTitle: c.title, contactId: c.id });
          continue;
        }
        
        // 3. 姓名与已有昵称重复
        if (trimmedName && cTitle && trimmedName === cTitle) {
          duplicates.push({ type: 'name_title', matchedName: c.name, matchedTitle: c.title, contactId: c.id });
          continue;
        }
        
        // 4. 昵称与已有姓名重复
        if (trimmedNickname && cName && trimmedNickname === cName) {
          duplicates.push({ type: 'title_name', matchedName: c.name, matchedTitle: c.title, contactId: c.id });
          continue;
        }
        
        // 5. 手机号重复（contacts表中的phone字段）
        if (trimmedPhone && cPhone && trimmedPhone === cPhone) {
          duplicates.push({ type: 'phone_phone', matchedName: c.name, matchedTitle: c.title, matchedValue: c.phone || undefined, contactId: c.id });
          continue;
        }
      }
      
      // 检查手机号和邮箱在扩展字段中的重复
      if (trimmedPhone || trimmedEmail) {
        const fieldValues = await db
          .select({
            contactId: contactFieldValues.contactId,
            categoryName: contactFieldCategories.name,
            value: contactFieldValues.value,
          })
          .from(contactFieldValues)
          .innerJoin(contactFieldCategories, eq(contactFieldValues.categoryId, contactFieldCategories.id))
          .innerJoin(contacts, eq(contactFieldValues.contactId, contacts.id))
          .where(
            and(
              eq(contacts.parentUserId, userId),
              excludeId ? ne(contacts.id, excludeId) : sql`1=1`,
              or(
                eq(contactFieldCategories.name, '手机'),
                eq(contactFieldCategories.name, '邮箱')
              )
            )
          );
        
        for (const fv of fieldValues) {
          // 手机号是JSON数组格式
          if (fv.categoryName === '手机' && trimmedPhone) {
            try {
              const phones = JSON.parse(fv.value);
              if (Array.isArray(phones)) {
                for (const p of phones) {
                  const normalizedP = p.trim().replace(/\s+/g, '');
                  if (normalizedP === trimmedPhone) {
                    const contact = allContacts.find(c => c.id === fv.contactId);
                    if (contact && !duplicates.find(d => d.contactId === contact.id && d.type === 'phone_phone')) {
                      duplicates.push({ type: 'phone_phone', matchedName: contact.name, matchedTitle: contact.title, matchedValue: p, contactId: contact.id });
                    }
                    break;
                  }
                }
              }
            } catch {}
          }
          
          // 邮箱也JSON数组格式
          if (fv.categoryName === '邮箱' && trimmedEmail) {
            try {
              const emails = JSON.parse(fv.value);
              if (Array.isArray(emails)) {
                for (const e of emails) {
                  const normalizedE = e.trim().toLowerCase();
                  if (normalizedE === trimmedEmail) {
                    const contact = allContacts.find(c => c.id === fv.contactId);
                    if (contact && !duplicates.find(d => d.contactId === contact.id && d.type === 'email_email')) {
                      duplicates.push({ type: 'email_email', matchedName: contact.name, matchedTitle: contact.title, matchedValue: e, contactId: contact.id });
                    }
                    break;
                  }
                }
              }
            } catch {}
          }
        }
      }
      
      return { duplicates };
    }),

  // 创建人脉
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1, "姓名不能为空"),
      title: z.string().optional(), // 称谓
      gender: z.string().optional(),
      birthDate: z.string().optional(),
      occupation: z.string().optional(),
      address: z.string().optional(),
      region: z.string().optional(), // 所在地区
      wechat: z.string().optional(),
      phone: z.string().optional(),
      referrerId: z.number().optional(), // 介绍人 ID
      tagIds: z.array(z.number()).optional(),
      customFields: z.array(z.object({
        fieldName: z.string(),
        fieldValue: z.string(),
      })).optional(), // 自定义字段
    }))
    .mutation(async ({ ctx, input }) => {
      const { tagIds, customFields, ...contactData } = input;
      
      const contactId = await dbContacts.createContact({
        ...contactData,
        parentUserId: ctx.user.id,
      });
      
      if (!contactId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建人脉失败" });
      }
      
      // 添加标签关联
      if (tagIds && tagIds.length > 0) {
        await Promise.all(
          tagIds.map(tagId => dbContacts.addTagToContact(contactId, tagId))
        );
      }
      
      // 添加自定义字段
      if (customFields && customFields.length > 0) {
        await dbContacts.addCustomFields(contactId, customFields);
      }
      
      // 奖励积分：添加人脉
      await addPointsForAction(ctx.user.id, 'add_contact', contactId);
      
      // 如果设置了推荐人，给推荐人奖励积分
      if (input.referrerId) {
        // 需要找到推荐人对应的 userId
        const referrerContact = await dbContacts.getContactById(input.referrerId);
        if (referrerContact && referrerContact.parentUserId) {
          await addPointsForAction(referrerContact.parentUserId, 'be_referrer', contactId);
        }
      }
      
      return { id: contactId };
    }),

  // 更新人脉
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1, "姓名不能为空").optional(),
      title: z.string().optional(), // 称谓
      gender: z.string().optional(),
      birthDate: z.string().optional(),
      occupation: z.string().optional(),
      address: z.string().optional(),
      region: z.string().optional(), // 所在地区
      wechat: z.string().optional(),
      phone: z.string().optional(),
      referrerId: z.number().optional(), // 介绍人 ID
    }))
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input;
      await dbContacts.updateContact(id, updateData);
      return { success: true };
    }),

  // 设置介绍人（独立API，专门用于设置/清除介绍人）
  setReferrer: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      referrerId: z.number().nullable(), // null表示清除介绍人
    }))
    .mutation(async ({ ctx, input }) => {
      const { contactId, referrerId } = input;
      
      // 验证人脉属于当前用户
      const contact = await dbContacts.getContactById(contactId);
      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "人脉不存在" });
      }
      if (contact.parentUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权操作此人脉" });
      }
      
      // 如果设置介绍人，验证介绍人存在且属于当前用户
      if (referrerId !== null) {
        const referrer = await dbContacts.getContactById(referrerId);
        if (!referrer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "介绍人不存在" });
        }
        if (referrer.parentUserId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "介绍人不属于您的人脉" });
        }
        // 不能设置自己为介绍人
        if (referrerId === contactId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "不能设置自己为介绍人" });
        }
      }
      
      // 更新介绍人
      await dbContacts.updateContact(contactId, { referrerId: referrerId });
      return { success: true };
    }),

  // 获取可选择的介绍人列表（独立API，避免依赖list API的复杂逻辑）
  listForReferrer: protectedProcedure
    .input(z.object({
      excludeContactId: z.number().optional(), // 排除当前人脉（编辑时不能选择自己）
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      
      // 直接查询数据库，只获取必要的字段
      const allContacts = await db.select({
        id: contacts.id,
        name: contacts.name,
        title: contacts.title,
      }).from(contacts)
        .where(eq(contacts.parentUserId, ctx.user.id))
        .orderBy(contacts.name);
      
      // 排除指定的人脉
      if (input.excludeContactId) {
        return allContacts.filter((c: { id: number; name: string; title: string | null }) => c.id !== input.excludeContactId);
      }
      
      return allContacts;
    }),
  // 智能识别快递地址（调用DeepSeek API解析文本）
  recognizeAddress: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(1000),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI服务未配置' });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content: '你是一个快递地址解析助手。用户会粘贴一段包含收件人信息的文本，请从中提取：收件人姓名、联系电话、详细地址。以JSON格式返回，格式为：{"name":"收件人姓名","phone":"联系电话","address":"详细地址"}。如果某个字段无法识别则返回空字符串。只返回JSON，不要其他内容。'
              },
              { role: 'user', content: input.text }
            ],
            temperature: 0.1,
            max_tokens: 300,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI服务暂时不可用' });
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '{}';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        return {
          name: String(parsed.name || ''),
          phone: String(parsed.phone || ''),
          address: String(parsed.address || ''),
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') throw new TRPCError({ code: 'TIMEOUT', message: 'AI识别超时，请重试' });
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI识别失败，请手动填写' });
      }
    }),
  // 智能识别银行账号（调用DeepSeek API解析文本）
  recognizeBank: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(1000),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI服务未配置' });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content: '你是一个银行账号解析助手。用户会粘贴一段包含银行账号信息的文本，请从中提取：账户名（户名/姓名）、开户行（银行名称及支行）、银行账号（卡号/账号）。以JSON格式返回，格式为：{"accountName":"账户名","bankName":"开户行","accountNumber":"银行账号"}。如果某个字段无法识别则返回空字符串。只返回JSON，不要其他内容。'
              },
              { role: 'user', content: input.text }
            ],
            temperature: 0.1,
            max_tokens: 300,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI服务暂时不可用' });
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '{}';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        return {
          accountName: String(parsed.accountName || ''),
          bankName: String(parsed.bankName || ''),
          accountNumber: String(parsed.accountNumber || ''),
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') throw new TRPCError({ code: 'TIMEOUT', message: 'AI识别超时，请重试' });
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI识别失败，请手动填写' });
      }
    }),
  // 自定义字段管理
  customFields: router({
    // 获取人脉的自定义字段
    list: protectedProcedure
      .input(z.object({ contactId: z.number() }))
      .query(async ({ input }) => {
        return await dbContacts.getCustomFieldsByContactId(input.contactId);
      }),

    // 添加自定义字段
    add: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        fieldName: z.string().min(1, "字段名称不能为空"),
        fieldValue: z.string(),
      }))
      .mutation(async ({ input }) => {
        const id = await dbContacts.addCustomField(input);
        return { id };
      }),

    // 更新自定义字段
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        fieldName: z.string().optional(),
        fieldValue: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await dbContacts.updateCustomField(id, data);
        return { success: true };
      }),

    // 删除自定义字段
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await dbContacts.deleteCustomField(input.id);
        return { success: true };
      }),
  }),

  // 删除人脉
  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      await dbContacts.deleteContact(input.id);
      return { success: true };
    }),

  // 获取统计数据
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getContactStats(ctx.user.id);
    }),

  // 轻量级获取联系人数量（全部、我的、共享）
  counts: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getContactCounts(ctx.user.id);
    }),

  // 根据筛选类型获取分类统计数量（全部、我的、共享）
  filteredCounts: protectedProcedure
    .input(z.object({
      filterType: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return await dbContacts.getFilteredCounts(ctx.user.id, input.filterType);
    }),

  // 获取公司列表（所有有公司名称的联系人，标注重复）
  companyList: protectedProcedure
    .query(async ({ ctx }) => {
      const result = await dbContacts.getCompanyList(ctx.user.id);
      console.log('[companyList] 返回数据示例:', result.slice(0, 3));
      console.log('[companyList] 总共返回', result.length, '条记录');
      return result;
    }),

  // 获取累计联络次数
  totalInteractionCount: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getTotalInteractionCount(ctx.user.id);
    }),

  // 获取互动统计总览
  interactionOverview: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getInteractionOverview(ctx.user.id);
    }),

  // 获取互动频次分布
  interactionDistribution: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getInteractionDistribution(ctx.user.id);
    }),

  // 获取互动时间序列
  interactionTimeSeries: protectedProcedure
    .input(z.object({
      granularity: z.enum(['day', 'week', 'month']).default('day'),
      range: z.number().default(30)
    }))
    .query(async ({ ctx, input }) => {
      return await dbContacts.getInteractionTimeSeries(ctx.user.id, input.granularity, input.range);
    }),

  // 获取标签互动统计
  tagInteractionStats: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getTagInteractionStats(ctx.user.id);
    }),

  // 获取累计标签数量
  totalTagCount: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getTotalTagCount(ctx.user.id);
    }),

  // 获取账目总数
  totalLedgerEntries: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getTotalLedgerEntries(ctx.user.id);
    }),

  // 自动生成模拟人脉功能（仅限特定用户）
  autoGenerate: router({
    // 检查当前用户是否有权限使用此功能
    checkPermission: protectedProcedure
      .query(async ({ ctx }) => {
        // 目前仅允许用户名为"胡永煜"的用户使用
        const allowedUsernames = ['胡永煜'];
        return {
          allowed: allowedUsernames.includes(ctx.user.username),
          username: ctx.user.username
        };
      }),
    
    // 获取当前自动生成状态
    status: protectedProcedure
      .query(async ({ ctx }) => {
        const { getAutoGenerateStatus } = await import('./mock-data-generator');
        return getAutoGenerateStatus(ctx.user.id);
      }),
    
    // 启动自动生成
    start: protectedProcedure
      .input(z.object({
        dailyNewContacts: z.number().min(0).max(100).default(0),  // 每天生成新人脉数量
        dailyRandomInteractions: z.number().min(0).max(100).default(0),  // 每天随机联络数量
        dailyRandomTags: z.number().min(0).max(200).default(0),  // 每天随机打标签数量
        options: z.object({
          includePhone: z.boolean().default(true),
          includeEmail: z.boolean().default(true),
          includeAddress: z.boolean().default(true),
          includeBankAccount: z.boolean().default(true),
          includeCompany: z.boolean().default(true),
          includeInvoiceInfo: z.boolean().default(true),
        })
      }))
      .mutation(async ({ ctx, input }) => {
        // 权限检查
        const allowedUsernames = ['胡永煤'];
        if (!allowedUsernames.includes(ctx.user.username)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '您没有权限使用此功能' });
        }
        
        const { startAutoGenerate, generateMockContact } = await import('./mock-data-generator');
        
        const userId = ctx.user.id;
        
        // 创建联系人的回调
        const createContactCallback = async (mockData: any): Promise<number> => {
          const contactId = await dbContacts.createContact({
            parentUserId: userId,
            name: mockData.name,
            title: mockData.title,
            gender: mockData.gender,
            region: mockData.region,
          });
          
          // 添加扩展信息 - 使用 addFieldValue 函数
          // 先获取字段类目信息
          const categories = await dbContacts.getFieldCategories(userId);
          const getCategoryId = (name: string) => {
            for (const cat of categories) {
              if (cat.name === name) return cat.id;
              if (cat.children) {
                const child = cat.children.find((c: any) => c.name === name);
                if (child) return child.id;
              }
            }
            return 0;
          };
          
          if (mockData.phone) {
            await dbContacts.addFieldValue(contactId, getCategoryId('手机'), '手机', mockData.phone);
          }
          if (mockData.email) {
            await dbContacts.addFieldValue(contactId, getCategoryId('邮箱'), '邮箱', mockData.email);
          }
          if (mockData.address) {
            await dbContacts.addFieldValue(contactId, getCategoryId('快递地址'), '快递地址', JSON.stringify(mockData.address));
          }
          if (mockData.bankAccount) {
            await dbContacts.addFieldValue(contactId, getCategoryId('银行账号'), '银行账号', JSON.stringify(mockData.bankAccount));
          }
          if (mockData.company) {
            await dbContacts.addFieldValue(contactId, getCategoryId('公司名称'), '公司名称', mockData.company);
          }
          if (mockData.invoiceInfo) {
            await dbContacts.addFieldValue(contactId, getCategoryId('开票信息'), '开票信息', JSON.stringify(mockData.invoiceInfo));
          }
          
          return contactId;
        };
        
        // 创建联络记录的回调
        const createInteractionCallback = async (contactId: number, type: string, notes: string): Promise<void> => {
          await dbContacts.createContactInteraction({
            contactId,
            interactionDate: new Date(),
            note: `[自动生成] ${type}: ${notes}`,
          });
        };
        
        // 添加标签的回调
        const addTagCallback = async (contactId: number, tagName: string): Promise<void> => {
          // 先查找或创建标签
          const existingTags = await dbContacts.getContactTags(userId);
          let tagId = existingTags.find(t => t.name === tagName)?.id;
          if (!tagId) {
            // 创建新标签
            const newTag = await dbContacts.createContactTag({
              name: tagName,
              parentUserId: userId,
              color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'),
            });
            tagId = newTag?.id;
          }
          if (tagId) {
            await dbContacts.addTagToContact(contactId, tagId);
          }
        };
        
        // 获取随机联系人ID的回调
        const getRandomContactIds = async (): Promise<number[]> => {
          const contacts = await dbContacts.getContactsByParent(userId);
          return contacts.map(c => c.id);
        };
        
        // 启动自动任务
        startAutoGenerate(
          userId,
          {
            dailyNewContacts: input.dailyNewContacts,
            dailyRandomInteractions: input.dailyRandomInteractions,
            dailyRandomTags: input.dailyRandomTags,
            options: input.options,
          },
          createContactCallback,
          createInteractionCallback,
          addTagCallback,
          getRandomContactIds
        );
        
        const messages = [];
        if (input.dailyNewContacts > 0) messages.push(`每天生成${input.dailyNewContacts}个新人脉`);
        if (input.dailyRandomInteractions > 0) messages.push(`每天随机联络${input.dailyRandomInteractions}次`);
        if (input.dailyRandomTags > 0) messages.push(`每天随机打${input.dailyRandomTags}个标签`);
        
        return { success: true, message: `已启动自动任务：${messages.join('，')}` };
      }),
    
    // 停止自动生成
    stop: protectedProcedure
      .mutation(async ({ ctx }) => {
        const { stopAutoGenerate } = await import('./mock-data-generator');
        const stopped = stopAutoGenerate(ctx.user.id);
        return { success: stopped, message: stopped ? '已停止自动生成' : '没有正在运行的任务' };
      }),
  }),

  // 标签管理
  tags: router({
    // 获取所有标签
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getContactTags(ctx.user.id);
      }),

    // 搜索标签（模糊搜索标签名称）
    search: protectedProcedure
      .input(z.object({
        keyword: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbContacts.searchTags(ctx.user.id, input.keyword || '');
      }),

    // 创建自定义标签
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "标签名称不能为空"),
        color: z.string().default("#3b82f6"),
      }))
      .mutation(async ({ ctx, input }) => {
        const tagId = await dbContacts.createContactTag({
          name: input.name,
          color: input.color,
          parentUserId: ctx.user.id,
          isPreset: false,
        });
        return { id: tagId };
      }),

    // 编辑标签
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1, "标签名称不能为空").optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.updateContactTag(input.id, ctx.user.id, {
          name: input.name,
          color: input.color,
        });
        return { success: true };
      }),

    // 删除自定义标签
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.deleteContactTag(input.id, ctx.user.id);
        return { success: true };
      }),

    // 批量更新标签排序
    updateOrder: protectedProcedure
      .input(z.object({
        tagOrders: z.array(z.object({
          id: z.number(),
          sortOrder: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.updateTagsOrder(ctx.user.id, input.tagOrders);
        return { success: true };
      }),

    // 获取标签大数据分析
    analytics: protectedProcedure
      .input(z.object({
        scope: z.enum(['all', 'mine', 'shared', 'global']).default('all'),
      }))
      .query(async ({ ctx, input }) => {
        const { scope } = input;
        const [overallStats, globalRanking, personalRanking, userDistribution, recentTags] = await Promise.all([
          dbTagAnalytics.getTagOverallStats(ctx.user.id, scope),
          dbTagAnalytics.getGlobalTagRanking(ctx.user.id, scope, 50),
          dbTagAnalytics.getPersonalTagRanking(ctx.user.id, scope, 50),
          dbTagAnalytics.getTagUserDistribution(ctx.user.id, scope),
          dbTagAnalytics.getRecentTags(ctx.user.id, scope, 20),
        ]);

        return {
          overallStats,
          globalRanking,
          personalRanking,
          userDistribution,
          recentTags,
        };
      }),

    // 为人脉添加标签
    addToContact: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        tagId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.addTagToContact(input.contactId, input.tagId);
        
        // 奖励积分：打标签
        await addPointsForAction(ctx.user.id, 'add_tag', input.contactId);
        
        return { success: true };
      }),

    // 移除人脉的标签
    removeFromContact: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        tagId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await dbContacts.removeTagFromContact(input.contactId, input.tagId);
        return { success: true };
      }),
    
    // 批量为多个人脉设置标签（用于关注周期标签等）
    batchAddToContacts: protectedProcedure
      .input(z.object({
        contactIds: z.array(z.number()),
        tagId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { contactIds, tagId } = input;
        let successCount = 0;
        let skipCount = 0;
        
        for (const contactId of contactIds) {
          try {
            // 检查是否已经有这个标签
            const existingTags = await dbContacts.getContactTagsByContactId(contactId);
            const hasTag = existingTags.some(t => t.id === tagId);
            
            if (!hasTag) {
              await dbContacts.addTagToContact(contactId, tagId);
              successCount++;
            } else {
              skipCount++;
            }
          } catch (error) {
            console.error(`Failed to add tag to contact ${contactId}:`, error);
          }
        }
        
        return { 
          success: true, 
          successCount, 
          skipCount,
          totalCount: contactIds.length 
        };
      }),
    
    // 批量为多个人脉移除标签
    batchRemoveFromContacts: protectedProcedure
      .input(z.object({
        contactIds: z.array(z.number()),
        tagId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { contactIds, tagId } = input;
        let successCount = 0;
        let skipCount = 0;
        
        for (const contactId of contactIds) {
          try {
            // 检查是否有这个标签
            const existingTags = await dbContacts.getContactTagsByContactId(contactId);
            const hasTag = existingTags.some(t => t.id === tagId);
            
            if (hasTag) {
              await dbContacts.removeTagFromContact(contactId, tagId);
              successCount++;
            } else {
              skipCount++;
            }
          } catch (error) {
            console.error(`Failed to remove tag from contact ${contactId}:`, error);
          }
        }
        
        return { 
          success: true, 
          successCount, 
          skipCount,
          totalCount: contactIds.length 
        };
      }),
  }),

  // 个人标签管理（针对单个人脉的自定义标签）
  personalTags: router({
    // 获取人脉的个人标签列表
    list: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .query(async ({ input }) => {
        return await dbContacts.getPersonalTagsByContactId(input.contactId);
      }),

    // 创建个人标签
    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        name: z.string().min(1, "标签名称不能为空"),
        color: z.string().default("#A80000"),
      }))
      .mutation(async ({ ctx, input }) => {
        const tagId = await dbContacts.createPersonalTag({
          contactId: input.contactId,
          parentUserId: ctx.user.id,
          name: input.name,
          color: input.color,
        });
        return { id: tagId };
      }),

    // 更新个人标签
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1, "标签名称不能为空").optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.updatePersonalTag(input.id, ctx.user.id, {
          name: input.name,
          color: input.color,
        });
        return { success: true };
      }),

    // 删除个人标签
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.deletePersonalTag(input.id, ctx.user.id);
        return { success: true };
      }),

    // 获取个人标签使用统计
    stats: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getPersonalTagsStats(ctx.user.id);
      }),
  }),

  // 字段分类管理（全局字段定义）
  fieldCategories: router({
    // 获取所有字段分类
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getContactFieldCategories(ctx.user.id);
      }),

    // 创建字段分类
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "字段名称不能为空"),
        fieldType: z.enum(["text", "number", "date", "select"]).default("text"),
        options: z.array(z.string()).optional(),
        isRequired: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const category = await db.createContactFieldCategory({
          parentUserId: ctx.user.id,
          name: input.name,
          fieldType: input.fieldType,
          options: input.options || null,
          isRequired: input.isRequired,
          sortOrder: 0,
        });
        if (!category) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建字段分类失败" });
        }
        return category;
      }),

    // 删除字段分类
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deleteContactFieldCategory(input.id, ctx.user.id);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "删除字段分类失败" });
        }
        return { success: true };
      }),
  }),

  // 字段值管理
  fieldValues: router({
    // 获取所有可用的字段类目
    categories: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getFieldCategories(ctx.user.id);
      }),

    // 创建字段类目
    createCategory: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "分类名称不能为空"),
        icon: z.string().default(''),
        parentCategoryId: z.number().nullable().default(null),
      }))
      .mutation(async ({ input }) => {
        return await dbContacts.createFieldCategory(input.name, input.icon, input.parentCategoryId);
      }),

    // 获取人脉的所有字段值
    list: protectedProcedure
      .input(z.object({ contactId: z.number() }))
      .query(async ({ input }) => {
        return await dbContacts.getContactFieldValues(input.contactId);
      }),

    // 批量设置人脉的字段值
    set: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        values: z.array(z.object({
          categoryId: z.number(),
          value: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        const success = await db.setContactFieldValues(input.contactId, input.values);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "设置字段值失败" });
        }
        return { success: true };
      }),

    // 添加单个字段值
    add: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        categoryId: z.number(),
        categoryName: z.string(),
        value: z.string(),
      }))
      .mutation(async ({ input }) => {
        const newFieldValue = await dbContacts.addFieldValue(input.contactId, input.categoryId, input.categoryName, input.value);
        return newFieldValue;
      }),

    // 删除单个字段值
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const success = await dbContacts.deleteFieldValue(input.id);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "删除字段值失败" });
        }
        return { success: true };
      }),

    // 批量删除联系人的所有扩展信息
    deleteAll: protectedProcedure
      .input(z.object({ contactId: z.number() }))
      .mutation(async ({ input }) => {
        const success = await dbContacts.deleteAllFieldValues(input.contactId);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "删除扩展信息失败" });
        }
        return { success: true };
      }),

    // 更新字段值的排序
    updateSortOrder: protectedProcedure
      .input(z.object({
        updates: z.array(z.object({
          id: z.number(),
          sortOrder: z.number(),
        })),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        // 批量更新sortOrder
        for (const update of input.updates) {
          await db
            .update(contactFieldValues)
            .set({ sortOrder: update.sortOrder })
            .where(eq(contactFieldValues.id, update.id));
        }
        
        return { success: true };
      }),
  }),

  // 联络记录
  interactions: router({
    // 记录一次联络
    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        note: z.string().optional(),
        interactionDate: z.string().optional(), // 补记时传入自定义日期（ISO字符串）
      }))
      .mutation(async ({ ctx, input }) => {
        // 如果是补记（传入了自定义日期），跳过今日重复检查
        if (!input.interactionDate) {
          // 检查今天是否已经记录过联络（基于北京时间）
          const hasTodayInteraction = await dbContacts.hasTodayInteraction(input.contactId);
          if (hasTodayInteraction) {
            throw new TRPCError({ 
              code: "BAD_REQUEST", 
              message: "今天已经记录过联络，每天只能记录一次" 
            });
          }
        }
        
        // 使用传入的日期或当前时间
        const recordDate = input.interactionDate ? new Date(input.interactionDate) : new Date();
        
        const interactionId = await dbContacts.createContactInteraction({
          contactId: input.contactId,
          interactionDate: recordDate,
          note: input.note,
        });
        
        // 奖励积分：每次联络
        await addPointsForAction(ctx.user.id, 'communication', input.contactId);
        
        return { id: interactionId, isBackfill: !!input.interactionDate };
      }),

    // 获取联络历史
    list: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .query(async ({ input }) => {
        return await dbContacts.getContactInteractions(input.contactId);
      }),

    // 获取联络统计信息
    stats: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .query(async ({ input }) => {
        return await dbContacts.getContactInteractionStats(input.contactId);
      }),

    // 删除联络记录
    delete: protectedProcedure
      .input(z.object({
        interactionId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await dbContacts.deleteContactInteraction(input.interactionId);
        return { success: true };
      }),

    // 更新联络记录
    update: protectedProcedure
      .input(z.object({
        interactionId: z.number(),
        interactionDate: z.date().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await dbContacts.updateContactInteraction({
          id: input.interactionId,
          interactionDate: input.interactionDate,
          note: input.note,
        });
        return { success: true };
      }),
  }),

  // 提醒类型管理
  reminderTypes: router({
    // 创建提醒类型
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "类型名称不能为空"),
        icon: z.string().default("🔔"),
        color: z.string().default("#6366f1"),
      }))
      .mutation(async ({ ctx, input }) => {
        const newType = await dbReminderTypes.createReminderType({
          userId: ctx.user.id,
          name: input.name,
          icon: input.icon,
          color: input.color,
          isDefault: false,
        });
        return newType;
      }),

    // 获取用户的所有提醒类型
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbReminderTypes.getReminderTypesByUserId(ctx.user.id);
      }),

    // 更新提醒类型
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1, "类型名称不能为空").optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const updated = await dbReminderTypes.updateReminderType(id, ctx.user.id, data);
        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "提醒类型不存在" });
        }
        return updated;
      }),

    // 删除提醒类型
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const success = await dbReminderTypes.deleteReminderType(input.id, ctx.user.id);
        if (!success) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "无法删除默认类型或类型不存在" });
        }
        return { success: true };
      }),
  }),

  // 提醒管理
  reminders: router({
    // 创建提醒
    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        title: z.string().min(1, "提醒事项不能为空"),
        reminderDate: z.number().optional(), // Unix timestamp (ms), 普通提醒必填
        reminderType: z.enum(["normal", "birthday"]).default("normal"),
        birthMonth: z.number().min(1).max(12).optional(), // 生日月份，生日提醒必填
        birthDay: z.number().min(1).max(31).optional(), // 生日日期，生日提醒必填
      }))
      .mutation(async ({ ctx, input }) => {
        // 验证：普通提醒必须有reminderDate，生日提醒必须有birthMonth和birthDay
        if (input.reminderType === "normal" && !input.reminderDate) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "普通提醒必须指定提醒时间" });
        }
        if (input.reminderType === "birthday" && (!input.birthMonth || !input.birthDay)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "生日提醒必须指定月份和日期" });
        }
        
        // 生日提醒：计算今年的生日日期
        let reminderDate: Date;
        if (input.reminderType === "birthday") {
          const now = new Date();
          const currentYear = now.getFullYear();
          reminderDate = new Date(currentYear, input.birthMonth! - 1, input.birthDay!);
          // 如果今年的生日已过，设置为明年的生日
          if (reminderDate < now) {
            reminderDate = new Date(currentYear + 1, input.birthMonth! - 1, input.birthDay!);
          }
        } else {
          reminderDate = new Date(input.reminderDate!);
        }
        
        const reminderId = await dbContacts.createReminder({
          contactId: input.contactId,
          userId: ctx.user.id,
          title: input.title,
          reminderDate,
          reminderType: input.reminderType,
          isRecurring: input.reminderType === "birthday", // 生日提醒自动循环
          birthMonth: input.birthMonth,
          birthDay: input.birthDay,
          isCompleted: false,
        });
        return { id: reminderId };
      }),

    // 获取某个人脉的所有提醒
    list: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbContacts.getContactReminders(input.contactId, ctx.user.id);
      }),

    // 更新提醒（标记完成/未完成）
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        isCompleted: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.updateReminder(input.id, ctx.user.id, {
          isCompleted: input.isCompleted,
        });
        return { success: true };
      }),

    // 删除提醒
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.deleteReminder(input.id, ctx.user.id);
        return { success: true };
      }),

    // 获取今日提醒人数
    todayCount: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getTodayRemindersCount(ctx.user.id);
      }),

    // 获取本周提醒人数
    weekCount: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getWeekRemindersCount(ctx.user.id);
      }),

    // 获取本月提醒人数
    monthCount: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getMonthRemindersCount(ctx.user.id);
      }),
  }),

  // 区域统计和筛选
  regions: router({
    // 获取所有省份的人数统计
    stats: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getRegionStats(ctx.user.id);
      }),

    // 按区域筛选人脉列表
    list: protectedProcedure
      .input(z.object({
        region: z.string(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ ctx, input }) => {
        return await dbContacts.getContactsByRegionPaginated(
          ctx.user.id,
          input.region,
          input.page,
          input.pageSize
        );
      }),
  }),

  // 容器顺序管理
  featureOrder: router({
    // 获取用户的容器顺序（合并默认定义和用户自定义顺序）
    get: protectedProcedure
      .query(async ({ ctx }) => {
        const [definitions, userOrder] = await Promise.all([
          db.getActiveFeatureDefinitions(),
          db.getUserFeatureOrder(ctx.user.id),
        ]);
        
        // 创建用户顺序映射
        const userOrderMap = new Map(
          userOrder.map(o => [o.featureId, o.position])
        );
        
        // 合并：用户有自定义顺序的使用自定义，否则使用默认
        const features = definitions.map(def => ({
          featureId: def.featureId,
          title: def.title,
          description: def.description,
          position: userOrderMap.get(def.featureId) ?? def.defaultPosition,
        }));
        
        // 按position排序
        features.sort((a, b) => a.position - b.position);
        
        return features;
      }),
    
    // 保存用户的容器顺序
    save: protectedProcedure
      .input(z.object({
        orders: z.array(z.object({
          featureId: z.number(),
          position: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.saveUserFeatureOrder(ctx.user.id, input.orders);
        return { success: true };
      }),
  }),

  // 介绍人贡献统计
  referrerStats: router({
    // 获取介绍人贡献排行榜
    leaderboard: protectedProcedure
      .input(z.object({
        directWeight: z.number().optional(),
        indirectWeight: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return await dbReferrerStats.getReferrerStats(ctx.user.id);
      }),
  }),

  // 导出所有人脉数据
  exportAll: protectedProcedure
    .input(z.object({
      scope: z.enum(['current_user', 'all_users']).default('current_user'),
    }))
    .query(async ({ ctx, input }) => {
      const scope = input.scope;
      
      // 只有超级管理员才能导出所有用户数据
      if (scope === 'all_users' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '只有超级管理员才能导出所有用户数据' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // 1. 根据scope查询人脉
      const contactsList = scope === 'all_users'
        ? await db.select().from(contacts) // 查询所有用户的人脉
        : await db.select().from(contacts).where(eq(contacts.parentUserId, ctx.user.id)); // 只查询当前用户的人脉
      
      // 2. 根据scope查询标签和字段分类
      const tags = scope === 'all_users'
        ? await db.select().from(contactTags) // 查询所有标签
        : await dbContacts.getContactTags(ctx.user.id); // 只查询当前用户的标签
      
      // 3. 查询所有字段分类
      const fieldCategoriesList = scope === 'all_users'
        ? await db.select().from(contactFieldCategories) // 查询所有字段分类
        : await db.select().from(contactFieldCategories).where(eq(contactFieldCategories.parentUserId, ctx.user.id));
      
      // 4. 为每个人脉查询详细信息
      const contactsWithDetails = await Promise.all(contactsList.map(async (contact: any) => {
        // 查询扩展信息
        const fieldValuesList = await db.select().from(contactFieldValues).where(eq(contactFieldValues.contactId, contact.id));
        
        // 查询标签关系
        const contactTags = await dbContacts.getContactTagsByContactId(contact.id);
        
        // 查询联络记录
        const interactions = await dbContacts.getContactInteractions(contact.id);
        
        // 查询提醒事项
        const reminders = await dbContacts.getContactReminders(contact.id, contact.parentUserId);
        
        return {
          ...contact,
          fieldValues: fieldValuesList,
          tags: contactTags,
          interactions,
          reminders,
        };
      }));
      
      // 5. 生成备份数据
      return {
        exportDate: new Date().toISOString(),
        scope,
        exportedBy: ctx.user.id,
        summary: {
          totalContacts: contactsList.length,
          totalTags: tags.length,
          totalFieldCategories: fieldCategoriesList.length,
          totalInteractions: contactsWithDetails.reduce((sum: number, c: any) => sum + c.interactions.length, 0),
          totalReminders: contactsWithDetails.reduce((sum: number, c: any) => sum + c.reminders.length, 0),
        },
        tags,
        fieldCategories: fieldCategoriesList,
        contacts: contactsWithDetails,
      };
    }),

    // 获取推荐关系（直接或间接）
    getReferrals: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        type: z.enum(['direct', 'indirect']),
      }))
      .query(async ({ input }) => {
        if (input.type === 'direct') {
          const referrals = await dbContacts.getDirectReferrals(input.contactId);
          return {
            referrals,
            stats: {
              total: referrals.length,
              levelDistribution: [{ level: 1, count: referrals.length }],
            },
          };
        } else {
          const referrals = await dbContacts.getIndirectReferrals(input.contactId);
          // 统计各层级人数
          const levelCounts = new Map<number, number>();
          referrals.forEach((r: any) => {
            const count = levelCounts.get(r.level) || 0;
            levelCounts.set(r.level, count + 1);
          });
          const levelDistribution = Array.from(levelCounts.entries())
            .map(([level, count]) => ({ level, count }))
            .sort((a, b) => a.level - b.level);
          
          return {
            referrals,
            stats: {
              total: referrals.length,
              levelDistribution,
            },
          };
        }
      }),
    getReferralChain: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .query(async ({ input }) => {
        return await dbContacts.getReferralChain(input.contactId);
      }),
  }),

  // ==================== 人脉共享管理 ====================
  sharing: router({
    // 创建共享连接
    createConnection: protectedProcedure
      .input(z.object({
        receiverUsername: z.string().min(1, "请输入接收者用户名"),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 共享功能对所有用户开放，不再检查权限
        
        // 查找接收者用户
        const receiver = await db.getUserByUsername(input.receiverUsername);
        if (!receiver) {
          throw new TRPCError({ code: "NOT_FOUND", message: "找不到该用户" });
        }
        
        // 不能连接自己
        if (receiver.id === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "不能连接自己" });
        }
        
        // 检查是否已存在连接
        const existingConnection = await db.getSharingConnection(ctx.user.id, receiver.id);
        if (existingConnection) {
          throw new TRPCError({ code: "CONFLICT", message: "已存在与该用户的连接" });
        }
        
        // 创建连接
        const connectionId = await db.createSharingConnection({
          sharerId: ctx.user.id,
          receiverId: receiver.id,
          status: 'active', // 直接激活，不需要确认
          note: input.note,
        });
        
        // 初始化默认权限（全部共享）
        const defaultFields = ['name', 'title', 'gender', 'occupation', 'address', 'region', 'wechat', 'phone', 'tags'];
        for (const fieldName of defaultFields) {
          await db.createSharingPermission({
            connectionId,
            fieldName,
            isShared: true,
          });
        }
        
        // 奖励积分：共享人脉
        await addPointsForAction(ctx.user.id, 'share_contact', connectionId);
        
        // 记录共享通知：通知接收者“XXX共享给你了”
        const currentUser = await db.getUserById(ctx.user.id);
        const dbConn = await getDb();
        if (dbConn) {
          await dbConn.insert(sharingNotifications).values({
            receiverId: receiver.id,
            actorId: ctx.user.id,
            actorName: currentUser?.name || currentUser?.username || `用户${ctx.user.id}`,
            type: 'added',
          });
        }
        
        return { connectionId, receiverName: receiver.name || receiver.username };
      }),

    // 删除共享连接
    deleteConnection: protectedProcedure
      .input(z.object({
        connectionId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查连接是否属于当前用户
        const connection = await db.getSharingConnectionById(input.connectionId);
        if (!connection || connection.sharerId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "连接不存在" });
        }
        
        // 记录共享通知：通知接收者“XXX取消了共享”
        const currentUser = await db.getUserById(ctx.user.id);
        const dbConn = await getDb();
        if (dbConn) {
          await dbConn.insert(sharingNotifications).values({
            receiverId: connection.receiverId,
            actorId: ctx.user.id,
            actorName: currentUser?.name || currentUser?.username || `用户${ctx.user.id}`,
            type: 'removed',
          });
        }
        
        // 删除权限配置
        await db.deleteSharingPermissionsByConnectionId(input.connectionId);
        // 删除连接
        await db.deleteSharingConnection(input.connectionId);
        
        return { success: true };
      }),

    // 获取我的共享连接列表（作为分享者）
    listMyConnections: protectedProcedure
      .query(async ({ ctx }) => {
        const connections = await db.getSharingConnectionsBySharerId(ctx.user.id);
        
        // 为每个连接获取接收者信息、权限配置和共享人数
        const connectionsWithDetails = await Promise.all(
          connections.map(async (conn: any) => {
            const receiver = await db.getUserById(conn.receiverId);
            const permissions = await db.getSharingPermissionsByConnectionId(conn.id);
            // 统计共享给该用户的人数（当前用户的所有联系人）
            const contacts = await dbContacts.getContactsByParent(ctx.user.id);
            const sharedContactCount = contacts.length;
            return {
              ...conn,
              receiverName: receiver?.name || receiver?.username || '未知用户',
              receiverUsername: receiver?.username || '',
              receiverAvatar: receiver?.avatar || null,
              permissions,
              sharedContactCount, // 共享给对方的人数
            };
          })
        );
        
        return connectionsWithDetails;
      }),

    // 获取共享给我的连接列表（作为接收者）
    listSharedToMe: protectedProcedure
      .query(async ({ ctx }) => {
        const connections = await db.getSharingConnectionsByReceiverId(ctx.user.id);
        
        // 为每个连接获取分享者信息和共享人数
        const connectionsWithDetails = await Promise.all(
          connections.map(async (conn: any) => {
            const sharer = await db.getUserById(conn.sharerId);
            // 统计分享者共享给我的人数（分享者的所有联系人）
            const contacts = await dbContacts.getContactsByParent(conn.sharerId);
            const sharedContactCount = contacts.length;
            return {
              ...conn,
              sharerName: sharer?.name || sharer?.username || '未知用户',
              sharerUsername: sharer?.username || '',
              sharerAvatar: sharer?.avatar || null,
              sharedContactCount, // 对方共享给我的人数
            };
          })
        );
        
        return connectionsWithDetails;
      }),

    // 更新共享权限配置
    updatePermissions: protectedProcedure
      .input(z.object({
        connectionId: z.number(),
        permissions: z.array(z.object({
          fieldName: z.string(),
          isShared: z.boolean(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查连接是否属于当前用户
        const connection = await db.getSharingConnectionById(input.connectionId);
        if (!connection || connection.sharerId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "连接不存在" });
        }
        
        // 更新权限
        for (const perm of input.permissions) {
          await db.upsertSharingPermission(input.connectionId, perm.fieldName, perm.isShared);
        }
        
        return { success: true };
      }),

    // 获取共享权限配置
    getPermissions: protectedProcedure
      .input(z.object({
        connectionId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        // 检查连接是否属于当前用户
        const connection = await db.getSharingConnectionById(input.connectionId);
        if (!connection || (connection.sharerId !== ctx.user.id && connection.receiverId !== ctx.user.id)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "连接不存在" });
        }
        
        return await db.getSharingPermissionsByConnectionId(input.connectionId);
      }),

    // 获取未读共享通知数量（区分新增和删除）
    getUnreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        const dbConn = await getDb();
        if (!dbConn) return { addedCount: 0, removedCount: 0 };
        
        const unread = await dbConn
          .select({
            type: sharingNotifications.type,
            id: sharingNotifications.id,
          })
          .from(sharingNotifications)
          .where(
            and(
              eq(sharingNotifications.receiverId, ctx.user.id),
              eq(sharingNotifications.isRead, 0)
            )
          );
        
        const addedCount = unread.filter(n => n.type === 'added').length;
        const removedCount = unread.filter(n => n.type === 'removed').length;
        
        return { addedCount, removedCount };
      }),

    // 获取未读共享通知详情列表
    getUnreadNotifications: protectedProcedure
      .query(async ({ ctx }) => {
        const dbConn = await getDb();
        if (!dbConn) return [];
        
        const notifications = await dbConn
          .select()
          .from(sharingNotifications)
          .where(
            and(
              eq(sharingNotifications.receiverId, ctx.user.id),
              eq(sharingNotifications.isRead, 0)
            )
          )
          .orderBy(desc(sharingNotifications.createdAt));
        
        return notifications;
      }),

    // 标记共享通知为已读
    markAsRead: protectedProcedure
      .mutation(async ({ ctx }) => {
        const dbConn = await getDb();
        if (!dbConn) return { success: false };
        
        await dbConn
          .update(sharingNotifications)
          .set({ isRead: 1 })
          .where(
            and(
              eq(sharingNotifications.receiverId, ctx.user.id),
              eq(sharingNotifications.isRead, 0)
            )
          );
        
        return { success: true };
      }),

    // 轻量级获取共享人列表（只返回共享人名字和ID，使用单次SQL查询优化）
    getSharerList: protectedProcedure
      .query(async ({ ctx }) => {
        // 获取所有共享给我的连接（只返回active状态）
        const allConnections = await db.getSharingConnectionsByReceiverId(ctx.user.id);
        const connections = allConnections.filter((conn: any) => conn.status === 'active');
        
        if (connections.length === 0) {
          return [];
        }
        
        // 提取所有分享者ID
        const sharerIds = connections.map((conn: any) => conn.sharerId);
        
        // 一次性查询所有分享者信息（使用 IN 查询，支持几千个分享者）
        const sharers = await db.getUsersByIds(sharerIds);
        
        // 构建结果列表：直接共享者
        const resultMap = new Map<string, { id: string; name: string }>();
        for (const sharer of sharers) {
          resultMap.set(sharer.id.toString(), {
            id: sharer.id.toString(),
            name: sharer.name || sharer.username || `用户${sharer.id}`
          });
        }
        
        // 如果连接有介绍人，将介绍人也加入筛选列表（去重）
        for (const conn of connections) {
          if ((conn as any).introducerId && (conn as any).introducerName) {
            const introId = (conn as any).introducerId.toString();
            if (!resultMap.has(introId)) {
              resultMap.set(introId, {
                id: introId,
                name: (conn as any).introducerName
              });
            }
          }
        }
        
        return Array.from(resultMap.values());
      }),

    // 获取共享给我的人脉列表（数据聚合）
    getSharedContacts: protectedProcedure
      .query(async ({ ctx }) => {
        // 获取所有共享给我的连接（只返回active状态）
        const allConnections = await db.getSharingConnectionsByReceiverId(ctx.user.id);
        const connections = allConnections.filter((conn: any) => conn.status === 'active');
        
        if (connections.length === 0) {
          return [];
        }
        
        // 为每个连接获取分享者的人脉数据
        const allSharedContacts: any[] = [];
        
        for (const conn of connections) {
          // 获取分享者信息
          const sharer = await db.getUserById(conn.sharerId);
          if (!sharer) continue;
          
          // 获取权限配置
          const permissions = await db.getSharingPermissionsByConnectionId(conn.id);
          const sharedFields = permissions.filter((p: any) => p.isShared).map((p: any) => p.fieldName);
          const sharedFieldsSet = new Set(sharedFields);
          
          // 获取分享者的人脉列表
          const contacts = await dbContacts.getContactsByParent(conn.sharerId);
          
          if (contacts.length === 0) continue;
          
          // 获取所有联系人ID
          const contactIds = contacts.map((c: any) => c.id);
          
          // 并行批量查询所有需要的数据（和contacts.list一样）
          const [allReferrerStats, tagsMap, personalTagsMap, interactionStatsMap, interactionInfoMap, fieldValuesMap] = await Promise.all([
            dbReferrerStats.getReferrerStats(conn.sharerId).catch(() => []),
            dbContacts.getTagsForContacts(contactIds),
            dbContacts.getPersonalTagsForContacts(contactIds),
            dbContacts.getInteractionStatsForContacts(contactIds),
            dbContacts.getInteractionInfoForContacts(contactIds),
            dbContacts.getFieldValuesForContacts(contactIds),
          ]);
          
          // 创建推荐人统计的Map
          const referrerStatsMap = new Map(
            allReferrerStats.map((stat: any) => [stat.contactId, stat])
          );
          
          // 为每个人脉组装详情数据
          const contactsWithDetails = contacts.map((contact: any) => {
            const tags = tagsMap.get(contact.id) || [];
            const personalTags = personalTagsMap.get(contact.id) || [];
            const interactionStats = interactionStatsMap.get(contact.id) || { totalInteractions: 0 };
            const interactionInfo = interactionInfoMap.get(contact.id) || { lastInteraction: null, hasTodayInteraction: false };
            const referrerStats = referrerStatsMap.get(contact.id) || null;
            const fieldValues = fieldValuesMap.get(contact.id) || [];
            
            // 基础字段（始终返回）
            const result: any = {
              id: contact.id,
              _sharedBy: sharer.name || sharer.username,
              _sharerUserId: conn.sharerId,
              // 介绍人信息（如果这个连接是通过他人介绍建立的）
              _introducerName: (conn as any).introducerName || null,
              _introducerId: (conn as any).introducerId || null,
              createdAt: contact.createdAt,
              updatedAt: contact.updatedAt,
            };
            
            // 根据权限配置过滤字段
            // 姓名始终显示（必须的）
            if (sharedFieldsSet.has('name') || sharedFieldsSet.size === 0) {
              result.name = contact.name;
            }
            
            // 其他基本字段根据权限配置
            if (sharedFieldsSet.has('title')) result.title = contact.title;
            if (sharedFieldsSet.has('phone')) result.phone = contact.phone;
            if (sharedFieldsSet.has('occupation')) result.occupation = contact.occupation;
            if (sharedFieldsSet.has('avatar')) result.avatar = contact.avatar;
            if (sharedFieldsSet.has('notes')) result.notes = contact.notes;
            if (sharedFieldsSet.has('isBlacklisted')) result.isBlacklisted = contact.isBlacklisted;
            
            // 标签始终显示（重要信息）
            result.tags = tags;
            result.personalTags = personalTags;
            
            // 字段值（公司、职位等）始终显示
            result.fieldValues = fieldValues;
            
            // 联络信息始终显示（让接收方知道分享者的联络情况）
            result.lastInteractionDate = interactionInfo.lastInteraction;
            result.daysSinceLastInteraction = interactionInfo.lastInteraction 
              ? Math.floor((Date.now() - new Date(interactionInfo.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
              : null;
            result.hasTodayInteraction = interactionInfo.hasTodayInteraction;
            result.hasInteractionToday = interactionInfo.hasInteractionToday || false;
            result.hasInteractionThisWeek = interactionInfo.hasInteractionThisWeek || false;
            result.hasInteractionThisMonth = interactionInfo.hasInteractionThisMonth || false;
            result.hasInteractionThisYear = interactionInfo.hasInteractionThisYear || false;
            result.totalInteractions = interactionStats?.totalInteractions || 0;
            
            // 推荐人信息
            result.hasReferrer = contact.referrerId !== null && contact.referrerId !== undefined;
            result.directReferrals = referrerStats?.directReferrals || 0;
            result.indirectReferrals = referrerStats?.indirectReferrals || 0;
            
            return result;
          });
          
          // 使用concat或循环避免栈溢出（push(...array)在数组很大时会崩溃）
          for (const contact of contactsWithDetails) {
            allSharedContacts.push(contact);
          }
        }
        
        return allSharedContacts;
      }),

    // 搜索用户（用于添加连接时搜索）
    searchUsers: protectedProcedure
      .input(z.object({
        query: z.string().min(1),
      }))
      .query(async ({ ctx, input }) => {
        const users = await db.searchUsersByUsername(input.query);
        // 过滤掉自己
        return users.filter((u: any) => u.id !== ctx.user.id).map((u: any) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          avatar: u.avatar ?? null,
        }));
      }),

    // 获取我的二维码内容（支持三种模式）
    // mode: 'receive' = 对方共享给我, 'give' = 我共享给对方, 'both' = 双向共享
    getMyQrCode: protectedProcedure
      .input(z.object({
        mode: z.enum(['receive', 'give', 'both']).default('receive'),
      }))
      .query(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });
        const qrContent = JSON.stringify({ type: 'sharing_add', username: user.username, mode: input.mode });
        return {
          qrContent,
          username: user.username,
          name: user.name || user.username,
          mode: input.mode,
        };
      }),

    // 通过扫码添加共享连接（支持三种模式）
    addByQrCode: protectedProcedure
      .input(z.object({
        qrContent: z.string().min(1, '二维码内容不能为空'),
      }))
      .mutation(async ({ ctx, input }) => {
        let parsed: { type: string; username: string; mode?: string };
        try {
          parsed = JSON.parse(input.qrContent);
        } catch {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '无效的二维码' });
        }
        if (parsed.type !== 'sharing_add' || !parsed.username) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '无效的二维码类型' });
        }
        const mode = parsed.mode || 'receive'; // 默认对方共享给我
        // 查找二维码所属用户（二维码持有者）
        const qrOwner = await db.getUserByUsername(parsed.username);
        if (!qrOwner) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '找不到该用户' });
        }
        if (qrOwner.id === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '不能扫自己的二维码' });
        }
        const scanner = ctx.user; // 扫码者
        const dbConn = await getDb();
        const currentUser = await db.getUserById(scanner.id);
        const defaultFields = ['name', 'title', 'gender', 'occupation', 'address', 'region', 'wechat', 'phone', 'tags'];

        // 辅助函数：创建单向连接
        const createOneWayConnection = async (sharerId: number, receiverId: number, noteText: string) => {
          const existing = await db.getSharingConnection(sharerId, receiverId);
          if (existing) return null; // 已存在则跳过
          const connId = await db.createSharingConnection({
            sharerId,
            receiverId,
            status: 'active',
            note: noteText,
          });
          for (const fieldName of defaultFields) {
            await db.createSharingPermission({ connectionId: connId, fieldName, isShared: true });
          }
          await addPointsForAction(sharerId, 'share_contact', connId);
          if (dbConn) {
            await dbConn.insert(sharingNotifications).values({
              receiverId,
              actorId: sharerId,
              actorName: (await db.getUserById(sharerId))?.name || `用户${sharerId}`,
              type: 'added',
            });
          }
          return connId;
        };

        let resultMsg = '';
        if (mode === 'receive') {
          // 对方共享给我：扫码者作为 receiver，qrOwner 作为 sharer
          await createOneWayConnection(qrOwner.id, scanner.id, '扫码共享（对方共享给我）');
          resultMsg = `${qrOwner.name || qrOwner.username} 的联系人已共享给你`;
        } else if (mode === 'give') {
          // 我共享给对方：扫码者作为 sharer，qrOwner 作为 receiver
          await createOneWayConnection(scanner.id, qrOwner.id, '扫码共享（我共享给对方）');
          resultMsg = `你的联系人已共享给 ${qrOwner.name || qrOwner.username}`;
        } else if (mode === 'both') {
          // 双向共享：同时建立两个方向的连接
          await createOneWayConnection(qrOwner.id, scanner.id, '扫码双向共享');
          await createOneWayConnection(scanner.id, qrOwner.id, '扫码双向共享');
          resultMsg = `与 ${qrOwner.name || qrOwner.username} 已建立双向共享`;
        }
         return { success: true, message: resultMsg };
      }),

    // 授权某人可以代为介绍我（A授权我，我才能介绍A给别人）
    // 调用者：A（共享给我的那个人），connectionId是A共享给我的连接ID，authorizedTo是我的ID
    authorizeIntroduce: protectedProcedure
      .input(z.object({
        connectionId: z.number().int().positive(), // A共享给我的连接ID
        authorizedToUserId: z.number().int().positive(), // 被授权人（我）的ID
      }))
      .mutation(async ({ ctx, input }) => {
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
        // 验证这条连接确实是 ctx.user 共享给 authorizedToUserId 的
        const [conn] = await dbConn.select().from(contactSharingConnections)
          .where(and(
            eq(contactSharingConnections.id, input.connectionId),
            eq(contactSharingConnections.sharerId, ctx.user.id),
            eq(contactSharingConnections.receiverId, input.authorizedToUserId),
          ));
        if (!conn) throw new TRPCError({ code: 'NOT_FOUND', message: '未找到对应的共享连接' });
        // 检查是否已授权
        const [existing] = await dbConn.select().from(sharingAuthorizations)
          .where(and(
            eq(sharingAuthorizations.connectionId, input.connectionId),
            eq(sharingAuthorizations.authorizedBy, ctx.user.id),
            eq(sharingAuthorizations.authorizedTo, input.authorizedToUserId),
          ));
        if (existing) {
          // 切换授权状态
          const newActive = existing.isActive === 1 ? 0 : 1;
          await dbConn.update(sharingAuthorizations)
            .set({ isActive: newActive })
            .where(eq(sharingAuthorizations.id, existing.id));
          return { success: true, isActive: newActive === 1 };
        }
        // 新建授权
        await dbConn.insert(sharingAuthorizations).values({
          connectionId: input.connectionId,
          authorizedBy: ctx.user.id,
          authorizedTo: input.authorizedToUserId,
          isActive: 1,
        });
        return { success: true, isActive: true };
      }),

    // 获取我共享给某人的授权状态列表（用于"我共享的人"列表显示授权按钮状态）
    getMyAuthorizationStatus: protectedProcedure
      .query(async ({ ctx }) => {
        const dbConn = await getDb();
        if (!dbConn) return [];
        // 查询我共享给别人的所有连接，以及对应的授权状态
        const rows = await dbConn.select({
          connectionId: sharingAuthorizations.connectionId,
          authorizedTo: sharingAuthorizations.authorizedTo,
          isActive: sharingAuthorizations.isActive,
        }).from(sharingAuthorizations)
          .where(eq(sharingAuthorizations.authorizedBy, ctx.user.id));
        return rows;
      }),

    // 获取别人授权我可以介绍的列表（用于"共享给我的人"列表显示介绍二维码图标）
    getAuthorizedToIntroduce: protectedProcedure
      .query(async ({ ctx }) => {
        const dbConn = await getDb();
        if (!dbConn) return [];
        const rows = await dbConn.select({
          connectionId: sharingAuthorizations.connectionId,
          authorizedBy: sharingAuthorizations.authorizedBy,
          isActive: sharingAuthorizations.isActive,
        }).from(sharingAuthorizations)
          .where(and(
            eq(sharingAuthorizations.authorizedTo, ctx.user.id),
            eq(sharingAuthorizations.isActive, 1),
          ));
        return rows;
      }),

    // 生成介绍二维码（我介绍A给别人扫）
    getIntroduceQrCode: protectedProcedure
      .input(z.object({
        connectionId: z.number().int().positive(), // A共享给我的连接ID
      }))
      .query(async ({ ctx, input }) => {
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
        // 验证授权有效
        const [auth] = await dbConn.select().from(sharingAuthorizations)
          .where(and(
            eq(sharingAuthorizations.connectionId, input.connectionId),
            eq(sharingAuthorizations.authorizedTo, ctx.user.id),
            eq(sharingAuthorizations.isActive, 1),
          ));
        if (!auth) throw new TRPCError({ code: 'FORBIDDEN', message: '未获得介绍授权' });
        // 获取A的信息
        const [conn] = await dbConn.select().from(contactSharingConnections)
          .where(eq(contactSharingConnections.id, input.connectionId));
        if (!conn) throw new TRPCError({ code: 'NOT_FOUND', message: '连接不存在' });
        const aUser = await db.getUserById(conn.sharerId);
        const meUser = await db.getUserById(ctx.user.id);
        if (!aUser || !meUser) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });
        // 生成介绍二维码内容
        const qrContent = JSON.stringify({
          type: 'sharing_introduce',
          targetUsername: aUser.username, // 被介绍人A的用户名
          introducerUsername: meUser.username, // 介绍人（我）的用户名
          introducerName: meUser.name || meUser.username,
        });
        return {
          qrContent,
          targetName: aUser.name || aUser.username,
          introducerName: meUser.name || meUser.username,
        };
      }),

    // 扫介绍二维码：C扫码后，建立A-C和C-A的双向共享，并记录介绍人
    addByIntroduceQrCode: protectedProcedure
      .input(z.object({
        qrContent: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        let parsed: { type: string; targetUsername: string; introducerUsername: string; introducerName: string };
        try {
          parsed = JSON.parse(input.qrContent);
        } catch {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '无效的二维码' });
        }
        if (parsed.type !== 'sharing_introduce' || !parsed.targetUsername || !parsed.introducerUsername) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '无效的介绍二维码' });
        }
        const targetUser = await db.getUserByUsername(parsed.targetUsername);
        const introducerUser = await db.getUserByUsername(parsed.introducerUsername);
        if (!targetUser) throw new TRPCError({ code: 'NOT_FOUND', message: '找不到被介绍人' });
        if (!introducerUser) throw new TRPCError({ code: 'NOT_FOUND', message: '找不到介绍人' });
        const scanner = ctx.user; // C
        if (scanner.id === targetUser.id) throw new TRPCError({ code: 'BAD_REQUEST', message: '不能扫自己的介绍码' });
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
        const defaultFields = ['name', 'title', 'gender', 'occupation', 'address', 'region', 'wechat', 'phone', 'tags'];
        const createIntroducedConnection = async (sharerId: number, receiverId: number) => {
          const existing = await db.getSharingConnection(sharerId, receiverId);
          if (existing) return null;
          const connId = await db.createSharingConnection({
            sharerId,
            receiverId,
            status: 'active',
            note: `由${parsed.introducerName}介绍`,
          });
          // 写入介绍人信息
          await dbConn.update(contactSharingConnections)
            .set({
              introducerId: introducerUser.id,
              introducerName: parsed.introducerName,
            })
            .where(eq(contactSharingConnections.id, connId));
          for (const fieldName of defaultFields) {
            await db.createSharingPermission({ connectionId: connId, fieldName, isShared: true });
          }
          await addPointsForAction(sharerId, 'share_contact', connId);
          await dbConn.insert(sharingNotifications).values({
            receiverId,
            actorId: sharerId,
            actorName: (await db.getUserById(sharerId))?.name || `用户${sharerId}`,
            type: 'added',
          });
          return connId;
        };
        // 建立双向连接：A共享给C，C共享给A
        await createIntroducedConnection(targetUser.id, scanner.id);
        await createIntroducedConnection(scanner.id, targetUser.id);
        const targetName = targetUser.name || targetUser.username;
        return { success: true, message: `已与 ${targetName} 建立双向共享（由${parsed.introducerName}介绍）` };
      }),
  }),
  // 锦炼计数系统
  exercise: router({
    // 获取锻炼项目列表
    getTypes: protectedProcedure
      .query(async ({ ctx }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.getExerciseTypes(ctx.user.id);
      }),

    // 创建锻炼项目
    createType: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        icon: z.string().default("💪"),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.createExerciseType(ctx.user.id, input.name, input.icon);
      }),

    // 更新锻炼项目
    updateType: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(50).optional(),
        icon: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        const { id, ...data } = input;
        return await dbExercise.updateExerciseType(id, ctx.user.id, data);
      }),

    // 删除锻炼项目
    deleteType: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.deleteExerciseType(input.id, ctx.user.id);
      }),

    // 保存锻炼记录
    saveRecord: protectedProcedure
      .input(z.object({
        exerciseTypeId: z.number(),
        count: z.number().min(0),
        recordDate: z.string(), // YYYY-MM-DD格式
      }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.upsertExerciseRecord(
          ctx.user.id,
          input.exerciseTypeId,
          input.count,
          input.recordDate
        );
      }),

    // 获取锻炼记录
    getRecords: protectedProcedure
      .input(z.object({
        exerciseTypeId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.getExerciseRecordsByDateRange(
          ctx.user.id,
          input.exerciseTypeId,
          input.startDate,
          input.endDate
        );
      }),

    // 删除锻炼记录
    deleteRecord: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.deleteExerciseRecord(input.id, ctx.user.id);
      }),

    // 检查是否已设置家长密码
    hasPassword: protectedProcedure
      .query(async ({ ctx }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.hasParentPassword(ctx.user.id);
      }),

    // 设置家长密码
    setPassword: protectedProcedure
      .input(z.object({ password: z.string().min(4).max(20) }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        await dbExercise.setParentPassword(ctx.user.id, input.password);
        return { success: true };
      }),

    // 验证家长密码
    verifyPassword: protectedProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        const isValid = await dbExercise.verifyParentPassword(ctx.user.id, input.password);
        return { isValid };
      }),
  }),

  // 数据分析
  analytics: router({
    // 获取“我的”数据分析
    myData: protectedProcedure
      .query(async ({ ctx }) => {
        const data = await dbAnalytics.getMyDataAnalytics(ctx.user.id);
        return data;
      }),
    
    // 获取地域分布趋势数据
    regionTrend: protectedProcedure
      .input(z.object({
        months: z.number().min(1).max(24).default(6),
        regions: z.array(z.string()).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { getRegionTrend } = await import('./db-region-trend');
        return await getRegionTrend(ctx.user.id, input.months, input.regions);
      }),
    
    // 获取海外和其他类别的趋势数据
    overseasAndOtherTrend: protectedProcedure
      .input(z.object({
        months: z.number().min(1).max(24).default(6),
      }))
      .query(async ({ ctx, input }) => {
        const { getOverseasAndOtherTrend } = await import('./db-region-trend');
        return await getOverseasAndOtherTrend(ctx.user.id, input.months);
      }),
    
    // 获取人脉增长统计数据
    contactGrowthStats: protectedProcedure
      .input(z.object({
        type: z.enum(['all', 'my', 'shared']),
        period: z.enum(['day', 'week', 'month']),
      }))
      .query(async ({ ctx, input }) => {
        return await dbAnalytics.getContactGrowthStats(ctx.user.id, input.type, input.period);
      }),
    
    // 获取人脉互动分层统计数据
    contactLayerStats: protectedProcedure
      .input(z.object({
        type: z.enum(['all', 'my', 'shared']),
      }))
      .query(async ({ ctx, input }) => {
        return await dbAnalytics.getContactLayerStats(ctx.user.id, input.type);
      }),
    
    // 获取健康度统计数据
    healthStats: protectedProcedure
      .input(z.object({
        type: z.enum(['all', 'my', 'shared']),
      }))
      .query(async ({ ctx, input }) => {
        return await dbContacts.getHealthStats(ctx.user.id, input.type);
      }),
  }),
  
  // 用户偏好设置
  userPreferences: router({
    // 获取用户首页卡片排序
    getHomeCardOrder: protectedProcedure
      .query(async ({ ctx }) => {
        const preference = await db.getUserPreference(ctx.user.id);
        return preference?.homeCardOrder || null;
      }),
    
    // 保存用户首页卡片排序
    saveHomeCardOrder: protectedProcedure
      .input(z.object({
        cardOrder: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.saveHomeCardOrder(ctx.user.id, input.cardOrder);
        return { success: true };
      }),
    
    // 获取用户主题设置
    getThemeSettings: protectedProcedure
      .query(async ({ ctx }) => {
        const preference = await db.getUserPreference(ctx.user.id);
        return {
          colorThemeId: preference?.colorThemeId || null,
          customColors: preference?.customColors || null,
        };
      }),
    
    // 保存用户主题设置
    saveThemeSettings: protectedProcedure
      .input(z.object({
        colorThemeId: z.string().nullable(),
        customColors: z.any().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.saveThemeSettings(ctx.user.id, input.colorThemeId, input.customColors);
        return { success: true };
      }),
  }),

  // 积分系统
  pointSystem: router({
    // 获取当前用户积分
    getMyPoints: protectedProcedure
      .query(async ({ ctx }) => {
        const { getUserPoints } = await import('./db-point-system');
        const points = await getUserPoints(ctx.user.id);
        return { points };
      }),
    
    // 获取当前用户的积分变动记录
    getMyPointLogs: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ ctx, input }) => {
        const { getUserPointLogs } = await import('./db-point-system');
        const logs = await getUserPointLogs(ctx.user.id, input.limit);
        return logs;
      }),
    
    // 管理员：获取所有积分规则
    getAllRules: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { getAllPointRules } = await import('./db-point-system');
        return await getAllPointRules();
      }),
    
    // 管理员：更新积分规则
    updateRule: protectedProcedure
      .input(z.object({
        actionType: z.string(),
        points: z.number().optional(),
        isActive: z.boolean().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { updatePointRule } = await import('./db-point-system');
        await updatePointRule(input.actionType, {
          points: input.points,
          isActive: input.isActive,
          description: input.description,
        });
        return { success: true };
      }),
    
    // 管理员：获取所有用户及其积分
    getAllUsers: protectedProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { getAllUsersWithPoints } = await import('./db-point-system');
        return await getAllUsersWithPoints(input.page, input.pageSize);
      }),
    
    // 管理员：搜索用户
    searchUsers: protectedProcedure
      .input(z.object({
        keyword: z.string().min(1),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { searchUsersByUsername } = await import('./db-point-system');
        return await searchUsersByUsername(input.keyword);
      }),
    
    // 管理员：手动调整用户积分
    adjustUserPoints: protectedProcedure
      .input(z.object({
        userId: z.number(),
        points: z.number(),
        description: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { adjustUserPointsByAdmin } = await import('./db-point-system');
        await adjustUserPointsByAdmin(
          input.userId,
          input.points,
          input.description,
          ctx.user.id
        );
        return { success: true };
      }),
    
    // 管理员：获取所有积分变动记录
    getAllLogs: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(200).default(100),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { getAllPointLogs } = await import('./db-point-system');
        return await getAllPointLogs(input.limit);
      }),
  }),

  // 个人中心常用功能管理
  profileFeatures: router({
    // 获取用户的常用功能列表
    getFavorites: protectedProcedure
      .query(async ({ ctx }) => {
        const { getUserFavoriteFeatures } = await import('./db-profile-features');
        const favorites = await getUserFavoriteFeatures(ctx.user.id, ctx.user.role);
        return { favorites };
      }),
    
    // 保存用户的常用功能配置
    saveFavorites: protectedProcedure
      .input(z.object({
        featureIds: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        const { saveUserFavoriteFeatures } = await import('./db-profile-features');
        await saveUserFavoriteFeatures(ctx.user.id, input.featureIds);
        return { success: true };
      }),
    
    // 生成邀请海报
    generateInvitePoster: protectedProcedure
      .query(async ({ ctx }) => {
        const { generateInvitePoster } = await import('./db-poster');
        const posterPath = await generateInvitePoster(ctx.user.id, ctx.user.username);
        return { posterPath };
      }),
  }),

  // 账本管理
  ledger: router({
    // 获取全站最近活动动态（公开API，用于首页滚动排行榜）
    recentActivity: publicProcedure
      .query(async () => {
        const database = await db.getDb();
        
        // 获取最近新建的账本（最近30条）
        const recentLedgers = await database
          .select({
            id: ledgers.id,
            name: ledgers.name,
            createdAt: ledgers.createdAt,
            username: users.username,
          })
          .from(ledgers)
          .leftJoin(users, eq(ledgers.createdBy, users.id))
          .orderBy(desc(ledgers.createdAt))
          .limit(30);
        
        // 获取最近新增的账目（最近30条）
        const recentRecords = await database
          .select({
            id: ledgerRecords.id,
            ledgerId: ledgerRecords.ledgerId,
            type: ledgerRecords.type,
            createdAt: ledgerRecords.createdAt,
            username: users.username,
            ledgerName: ledgers.name,
          })
          .from(ledgerRecords)
          .leftJoin(users, eq(ledgerRecords.createdBy, users.id))
          .leftJoin(ledgers, eq(ledgerRecords.ledgerId, ledgers.id))
          .where(isNull(ledgerRecords.deletedAt))
          .orderBy(desc(ledgerRecords.createdAt))
          .limit(30);
        
        // 用户名脱敏处理
        const maskUsername = (username: string | null) => {
          if (!username) return '***';
          if (username.length <= 1) return username[0] + '**';
          if (username.length <= 2) return username[0] + '*';
          if (username.length <= 4) return username[0] + '*'.repeat(username.length - 2) + username[username.length - 1];
          return username[0] + username[1] + '*'.repeat(username.length - 4) + username.slice(-2);
        };
        
        // 合并并按时间排序
        const activities: Array<{
          type: 'new_ledger' | 'new_record';
          username: string;
          detail: string;
          createdAt: string;
        }> = [];
        
        for (const l of recentLedgers) {
          activities.push({
            type: 'new_ledger',
            username: maskUsername(l.username),
            detail: '新建了一个账本',
            createdAt: l.createdAt || '',
          });
        }
        
        for (const r of recentRecords) {
          const actionText = r.type === 'income' ? '新增了一条收入' : '新增了一条支出';
          activities.push({
            type: 'new_record',
            username: maskUsername(r.username),
            detail: actionText,
            createdAt: r.createdAt || '',
          });
        }
        
        // 按时间倒序排列，取前50条
        activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        return activities.slice(0, 50);
      }),

    // 获取账本统计数据
    stats: protectedProcedure
      .query(async ({ ctx }) => {
        // 获取未封存和已封存的账本，统一统计
        const activeLedgers = await dbLedger.getUserLedgers(ctx.user.id, false);
        const archivedLedgers = await dbLedger.getUserLedgers(ctx.user.id, true);
        const allLedgers = [...activeLedgers, ...archivedLedgers];
        const totalLedgers = allLedgers.length;
        
        // 累加每个账本的 recordCount（已排除删除的账目）
        const totalEntries = allLedgers.reduce((sum: number, l: any) => sum + (l.recordCount || 0), 0);
        
        return {
          totalLedgers,
          totalEntries,
        };
      }),

    // 获取用户的所有账本
    list: protectedProcedure
      .input(z.object({
        isArchived: z.boolean().optional().default(false),
      }))
      .query(async ({ ctx, input }) => {
        // opinion_book类型账本已在ledgers表中，getUserLedgers会自然包含，无需手动合并
        return await dbLedger.getUserLedgers(ctx.user.id, input.isArchived);
      }),


    // 获取用户所有账本中的待结账目汇总
    getAllPending: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbLedger.getAllPendingTransactions(ctx.user.id);
      }),

    // 获取单个账本详情
    getById: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        // 56号账本自动准入：YJH（userId=4957151）的直接/间接下线自动加入
        if (input.ledgerId === 56 && ctx.user.id !== 4957151) {
          try {
            const db = await getDbConnection();
            if (db) {
              // 检查是否已是成员
              const [memberRows] = await db.execute(
                `SELECT id FROM ledger_members WHERE ledgerId = 56 AND userId = ? LIMIT 1`,
                [ctx.user.id]
              ) as any[];
              if (!memberRows || (memberRows as any[]).length === 0) {
                // 递归查找是否是YJH的下线（invited_by_user_id链）
                const isYJHDownline = async (userId: number, depth = 0): Promise<boolean> => {
                  if (depth > 10) return false; // 防止无限递归
                  const [rows] = await db.execute(
                    `SELECT invited_by_user_id FROM users WHERE id = ? LIMIT 1`,
                    [userId]
                  ) as any[];
                  const row = (rows as any[])[0];
                  if (!row || !row.invited_by_user_id) return false;
                  if (row.invited_by_user_id === 4957151) return true;
                  return isYJHDownline(row.invited_by_user_id, depth + 1);
                };
                const isDownline = await isYJHDownline(ctx.user.id);
                if (isDownline) {
                  // 自动加入56号账本（使用实际列名）
                  await db.execute(
                    `INSERT IGNORE INTO ledger_members (ledgerId, userId, role, member_type, permission_view, permission_add, permission_edit, permission_delete, canEdit, canDelete, canInvite, createdAt, updatedAt)
                     VALUES (56, ?, 'member', 'real', 'all', 'all', 'own', 'own', 1, 0, 0, NOW(), NOW())`,
                    [ctx.user.id]
                  );
                  console.log('[56号账本自动准入] 用户', ctx.user.id, '已自动加入56号账本');
                }
              }
            }
          } catch (e) {
            console.error('[56号账本自动准入] 错误:', e);
          }
        }
        return await dbLedger.getLedgerById(input.ledgerId, ctx.user.id);
      }),

    // 获取账本信息（别名，与getById相同）
    getLedger: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerById(input.id, ctx.user.id);
      }),

    // 更新账本功能设置
    updateLedgerFeatures: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        enableReimbursement: z.boolean().optional(),
        enablePending: z.boolean().optional(),
        pendingDefaultIncludeStats: z.number().min(0).max(1).optional(),
        requireImage: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.updateLedgerFeatures(input.ledgerId, ctx.user.id, {
          enableReimbursement: input.enableReimbursement,
          enablePending: input.enablePending,
          pendingDefaultIncludeStats: input.pendingDefaultIncludeStats,
          requireImage: input.requireImage,
        });
      }),

    // 获取账本成员列表
    getMembers: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerMembers(input.ledgerId, ctx.user.id);
      }),

    // 获取账本金额范围
    getAmountRange: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        // TODO: 实现getLedgerAmountRange函数
        return { min: 0, max: 0 };
      }),

    // 上传账目图片到COS
    uploadLedgerImage: protectedProcedure
      .input(z.object({
        imageData: z.string(), // base64 encoded image
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const { uploadImageToCOS } = await import('./cos-upload');
          const imageUrl = await uploadImageToCOS(input.imageData, 'ledger-photos');
          return { success: true, imageUrl };
        } catch (error) {
          console.error('[uploadLedgerImage] 错误:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `图片上传失败: ${error instanceof Error ? error.message : '未知错误'}` 
          });
        }
      }),

    // 创建新账本
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
        type: z.string().optional(),
        currency: z.string().optional(),
        memberNickname: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: input.type,
          currency: input.currency,
          createdBy: ctx.user.id,
        });
        return ledger;
      }),

    // 更新账本信息
    update: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        name: z.string().min(1).max(50).optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.updateLedger(input.ledgerId, ctx.user.id, {
          name: input.name,
          description: input.description,
        });
        return { success: true };
      }),

    // 更新成员昵称
    updateMemberNickname: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        nickname: z.string().min(0).max(20),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.updateMemberNickname(input.ledgerId, ctx.user.id, input.nickname);
        return { success: true };
      }),

    // 存档/取消存档账本
    archive: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        isArchived: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.archiveLedger(input.ledgerId, ctx.user.id, input.isArchived);
        return { success: true };
      }),

    // 删除账本
    delete: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.deleteLedger(input.ledgerId, ctx.user.id);
        return { success: true };
      }),

    // 复制账本
    copy: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const newLedger = await dbLedger.copyLedger(input.ledgerId, ctx.user.id);
        return newLedger;
      }),

    // 生成邀请token
    generateInviteToken: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const token = await dbLedger.generateInviteToken(input.ledgerId, ctx.user.id);
        return { token };
      }),

    // 通过邀请token加入账本
    joinByToken: protectedProcedure
      .input(z.object({
        token: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ledger = await dbLedger.joinLedgerByToken(input.token, ctx.user.id);
        return ledger;
      }),

    // 邀请成员加入账本（通过用户名）
    inviteMember: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        username: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.inviteMemberByUsername(input.ledgerId, ctx.user.id, input.username);
      }),

    // 移除账本成员
    removeMember: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        userId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.removeLedgerMember(input.ledgerId, ctx.user.id, input.userId);
        return { success: true };
      }),

    // 转移账本创建人
    transferOwnership: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        newOwnerId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.transferOwnership(input.ledgerId, ctx.user.id, input.newOwnerId);
      }),

    // 获取账本密钥
    getSecretKey: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerSecretKey(input.ledgerId, ctx.user.id);
      }),

    // 通过密钥加入账本
    joinBySecretKey: protectedProcedure
      .input(z.object({
        secretKey: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.joinLedgerBySecretKey(input.secretKey, ctx.user.id);
      }),

    // 获取账本分类列表
    getCategories: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        type: z.enum(['income', 'expense']).optional(),
        parentId: z.number().nullable().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerCategories(input.ledgerId, ctx.user.id, input.type, input.parentId);
      }),

    // 公开获取演示账本分类（无需登录）
    getPublicCategories: publicProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ input }) => {
        const dbConn = await getDbConnection();
        if (!dbConn) return [];
        const [rows] = await dbConn.execute(
          `SELECT id, name, parentId, isDefault FROM ledger_categories
           WHERE ledgerId=?
           ORDER BY sortOrder ASC, id ASC`,
          [input.ledgerId]
        ) as any;
        return rows as any[];
      }),

    // 添加账本分类
    addCategory: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        name: z.string().min(1).max(50),
        type: z.enum(['income', 'expense']),
        parentId: z.number().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.addLedgerCategory({
          ...input,
          createdBy: ctx.user.id,
        });
      }),

    // 删除账本分类
    deleteCategory: protectedProcedure
      .input(z.object({
        categoryId: z.number(),
        cascade: z.boolean().optional().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.deleteLedgerCategory(
          input.categoryId,
          ctx.user.id,
          input.cascade
        );
      }),

    // 批量替换分类
    replaceCategory: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        sourceCategoryId: z.number(),
        targetCategoryId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.replaceLedgerCategory(
          input.ledgerId,
          input.sourceCategoryId,
          input.targetCategoryId,
          ctx.user.id
        );
      }),

    // 获取分类使用数量
    getCategoryUsageCount: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        categoryId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getCategoryUsageCount(
          input.ledgerId,
          input.categoryId,
          ctx.user.id
        );
      }),

    // 获取成员权限列表
    getMemberPermissions: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const result = await dbLedger.getMemberPermissions(input.ledgerId, ctx.user.id);
        
        // 从主数据库获取用户信息
        const membersWithUserInfo = await Promise.all(
          result.members.map(async (member: any) => {
            const user = await db.getUserById(member.userId);
            return {
              ...member,
              userName: user?.name || user?.username || '未知用户',
              userAvatar: user?.avatar || null,
            };
          })
        );
        
        return {
          members: membersWithUserInfo,
          defaultPermissions: result.defaultPermissions,
          currentUserRole: result.currentUserRole,
          isOwner: result.isOwner,
        };
      }),

    // 更新成员权限
    updateMemberPermission: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        memberId: z.number(),
        permissionType: z.enum(['view', 'add', 'edit', 'delete', 'backup']),
        permissionValue: z.enum(['all', 'own', 'none', 'allow']),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.updateMemberPermission(
          input.ledgerId,
          input.memberId,
          input.permissionType,
          input.permissionValue,
          ctx.user.id
        );
      }),

    // 更新默认成员权限
    updateDefaultPermission: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        permissionType: z.enum(['view', 'add', 'edit', 'delete', 'backup']),
        permissionValue: z.enum(['all', 'own', 'none', 'allow']),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.updateDefaultPermission(
          input.ledgerId,
          input.permissionType,
          input.permissionValue,
          ctx.user.id
        );
      }),

    // 获取AI雇员列表
    getAIEmployees: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getAIEmployees(input.ledgerId, ctx.user.id);
      }),

    // 开关AI分身（开启则自动创建，关闭则删除）
    toggleAIEmployee: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.toggleAIEmployee(
          input.ledgerId,
          input.enabled,
          ctx.user.id
        );
      }),

    // 保留旧接口兼容
    addAIEmployee: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        avatarType: z.string(),
        nickname: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.addAIEmployee(
          input.ledgerId,
          input.avatarType,
          input.nickname,
          ctx.user.id
        );
      }),

    // 删除AI雇员
    removeAIEmployee: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        employeeId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.removeAIEmployee(
          input.ledgerId,
          input.employeeId,
          ctx.user.id
        );
      }),

    // AI分身：解析任务（调用DeepSeek API）
    parseAIEmployeeTask: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        taskDescription: z.string().min(1).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbAIEmployee.parseTaskWithAI(
          input.ledgerId,
          ctx.user.id,
          input.taskDescription
        );
      }),

    // AI分身：确认并创建任务
    createAIEmployeeTask: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        taskDescription: z.string(),
        parsedPlan: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbAIEmployee.createAIEmployeeTask(
          input.ledgerId,
          ctx.user.id,
          input.taskDescription,
          input.parsedPlan
        );
      }),

    // AI分身：获取任务列表
    getAIEmployeeTasks: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbAIEmployee.getAIEmployeeTasks(
          input.ledgerId,
          ctx.user.id
        );
      }),

    // AI分身：更新任务状态
    updateAIEmployeeTaskStatus: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        status: z.enum(['running', 'paused', 'stopped']),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbAIEmployee.updateTaskStatus(
          input.taskId,
          ctx.user.id,
          input.status
        );
      }),

    // AI分身：获取任务执行日志
    getAIEmployeeTaskLogs: protectedProcedure
      .input(z.object({
        taskId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbAIEmployee.getTaskLogs(
          input.taskId,
          ctx.user.id
        );
      }),

    // AI分身：多轮对话（新版）
    chatWithAIEmployee: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        message: z.string().min(1).max(1000),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbAIEmployee.chatWithAIEmployee(
          input.ledgerId,
          ctx.user.id,
          input.message
        );
      }),
    // AI分身：获取对话历史
    getAIConversationHistory: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbAIEmployee.getAIConversationHistory(
          input.ledgerId,
          ctx.user.id
        );
      }),
    // AI分身：清空对话历史
    clearAIConversationHistory: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbAIEmployee.clearAIConversationHistory(
          input.ledgerId,
          ctx.user.id
        );
      }),
        // 获取报表数据
    getReport: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        year: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerReport(
          input.ledgerId, 
          ctx.user.id, 
          input.year,
          input.startDate,
          input.endDate
        );
      }),

    // 获取日历数据（指定月份的每日收支统计）
    getCalendarData: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        year: z.number(),
        month: z.number(),
        memberIds: z.array(z.number()).optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getCalendarData(input.ledgerId, ctx.user.id, input.year, input.month, input.memberIds);
      }),

    // 获取指定日期的记账记录
    getDayRecords: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        date: z.string(),
        memberIds: z.array(z.number()).optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getDayRecords(input.ledgerId, ctx.user.id, input.date, input.memberIds);
      }),

    // 检测当天重复账目
    checkDuplicateTransaction: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        type: z.enum(['income', 'expense']),
        amount: z.number().optional(),
        categoryId: z.number().optional(),
        date: z.string(), // YYYY-MM-DD
        excludeId: z.number().optional(), // 编辑模式排除自身
      }))
      .query(async ({ ctx, input }) => {
        // 金额和类目都没有时不检测
        if (!input.amount && !input.categoryId) return { duplicates: [] };
        const db = await getLedgerDb();
        if (!db) return { duplicates: [] };
        // 查询当天该用户在该账本的所有记录
        const conditions = [
          eq(ledgerRecords.ledgerId, input.ledgerId),
          eq(ledgerRecords.createdBy, ctx.user.id),
          eq(ledgerRecords.type, input.type),
          eq(ledgerRecords.recordDate, input.date),
          sql`${ledgerRecords.deletedAt} IS NULL`,
        ];
        if (input.excludeId) {
          conditions.push(sql`${ledgerRecords.id} != ${input.excludeId}`);
        }
        const records = await db
          .select({
            id: ledgerRecords.id,
            amount: ledgerRecords.amount,
            categoryId: ledgerRecords.categoryId,
            description: ledgerRecords.description,
          })
          .from(ledgerRecords)
          .where(and(...conditions));
        // 匹配重复逻辑：金额+类目均相同 > 仅金额相同
        const duplicates: Array<{ id: number; matchType: 'both' | 'amount_only'; amount: string; categoryId: number | null; description: string | null }> = [];
        for (const r of records) {
          const amountMatch = input.amount !== undefined && Math.abs(parseFloat(r.amount) - input.amount) < 0.001;
          const categoryMatch = input.categoryId !== undefined && r.categoryId === input.categoryId;
          if (amountMatch && categoryMatch) {
            duplicates.push({ id: r.id, matchType: 'both', amount: r.amount, categoryId: r.categoryId, description: r.description });
          } else if (amountMatch && !input.categoryId) {
            // 只输入了金额，没有选类目
            duplicates.push({ id: r.id, matchType: 'amount_only', amount: r.amount, categoryId: r.categoryId, description: r.description });
          } else if (amountMatch) {
            // 金额相同但类目不同
            duplicates.push({ id: r.id, matchType: 'amount_only', amount: r.amount, categoryId: r.categoryId, description: r.description });
          }
        }
        return { duplicates };
      }),

    // 添加记账记录
    addTransaction: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        type: z.enum(['income', 'expense']),
        amount: z.number().min(0),
        categoryId: z.number(),
        subcategoryId: z.number().optional(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        transactionDate: z.string(),
        images: z.array(z.string()).optional(),
        memberId: z.number().optional(),
        accountId: z.number().optional(),
        reimbursementStatus: z.enum(['none', 'pending', 'completed']).optional(),
        pendingType: z.enum(['receivable', 'payable']).nullable().optional(),
        pendingIncludeStats: z.number().min(0).max(1).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.addTransaction({
          ...input,
          userId: ctx.user.id,
        });
      }),

    // 获取记账记录列表（按日期分组）
    getTransactions: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        type: z.enum(['income', 'expense']).optional(),
        categoryId: z.number().optional(),
        memberId: z.number().optional(),
        amountMin: z.string().optional(),
        amountMax: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { ledgerId, ...options } = input;
        return await dbLedger.getTransactionsList(ledgerId, ctx.user.id, options);
      }),

    // 删除记账记录
    deleteTransaction: protectedProcedure
      .input(z.object({
        recordId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.deleteTransaction(input.recordId, ctx.user.id);
      }),

    // 获取已删除的账目记录（30天内）
    getDeletedTransactions: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getDeletedTransactions(input.ledgerId, ctx.user.id);
      }),

    // 恢复已删除的账目记录
    restoreTransaction: protectedProcedure
      .input(z.object({
        recordId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.restoreTransaction(input.recordId, ctx.user.id);
      }),

    // 清理超过30天的已删除记录
    purgeExpiredDeletedRecords: protectedProcedure
      .mutation(async () => {
        return await dbLedger.purgeExpiredDeletedRecords();
      }),

    // 获取账目修改记录日志
    getRecordLogs: protectedProcedure
      .input(z.object({
        recordId: z.number(),
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getRecordLogs(input.recordId, input.ledgerId, ctx.user.id);
      }),
    // 获取账目修改记录条数
    getRecordLogCount: protectedProcedure
      .input(z.object({
        recordId: z.number(),
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const count = await dbLedger.getRecordLogCount(input.recordId, input.ledgerId, ctx.user.id);
        return { count };
      }),
    // 更新记账记录
    updateTransaction: protectedProcedure
      .input(z.object({
        recordId: z.number(),
        type: z.enum(['income', 'expense']).optional(),
        amount: z.number().min(0).optional(),
        categoryId: z.number().optional(),
        subcategoryId: z.number().optional(),
        description: z.string().optional(),
        transactionDate: z.string().optional(),
        images: z.array(z.string()).optional(),
        memberId: z.number().optional(),
        accountId: z.number().optional(),
        reimbursementStatus: z.enum(['none', 'pending', 'completed']).optional(),
        pendingType: z.enum(['receivable', 'payable']).nullable().optional(),
        pendingIncludeStats: z.number().min(0).max(1).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { recordId, ...data } = input;
        return await dbLedger.updateTransaction(recordId, ctx.user.id, data);
      }),

    // ==================== 审批相关 ====================
    
    // 获取审批规则
    getApprovalRules: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getApprovalRules(input.ledgerId, ctx.user.id);
      }),

    // 保存审批规则
    saveApprovalRules: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        rules: z.array(z.object({
          recorderId: z.number().nullable(),
          approverType: z.enum(['all', 'specific']),
          approverIds: z.array(z.number()).optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.saveApprovalRules(input.ledgerId, ctx.user.id, input.rules);
      }),

    // 删除审批规则
    deleteApprovalRule: protectedProcedure
      .input(z.object({
        ruleId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.deleteApprovalRule(input.ruleId, ctx.user.id);
      }),

    // 审批记账
    approveTransaction: protectedProcedure
      .input(z.object({
        transactionId: z.number(),
        action: z.enum(['approved', 'rejected']),
        comment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.approveTransaction(
          input.transactionId,
          ctx.user.id,
          input.action,
          input.comment
        );
      }),

    // 获取单条记账详情
    getTransactionDetail: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        transactionId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getTransactionDetail(
          input.ledgerId,
          input.transactionId,
          ctx.user.id
        );
      }),

    // 获取待审批的记账列表
    getPendingApprovals: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getPendingApprovals(input.ledgerId, ctx.user.id);
      }),

    // 导出账目为Excel
    exportToExcel: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        try {
          console.log('[exportToExcel] 开始导出:', { ledgerId: input.ledgerId, userId: ctx.user.id });
          
          // 检查备份权限
          const hasBackupPermission = await dbLedger.checkBackupPermission(input.ledgerId, ctx.user.id);
          if (!hasBackupPermission) {
            throw new TRPCError({ code: 'FORBIDDEN', message: '您没有备份该账本的权限' });
          }
          
          // 获取账目数据
          const transactions = await dbLedger.getTransactionsList(
            input.ledgerId,
            ctx.user.id,
            {
              startDate: input.startDate,
              endDate: input.endDate,
            }
          );
          
          console.log('[exportToExcel] 获取到账目数据:', { count: transactions.length });

          // 创建 Excel工作簿
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('账目明细');

          // 设置列
          worksheet.columns = [
            { header: '日期', key: 'date', width: 15 },
            { header: '类型', key: 'type', width: 10 },
            { header: '分类', key: 'category', width: 15 },
            { header: '金额', key: 'amount', width: 15 },
            { header: '备注', key: 'description', width: 30 },
            { header: '创建人', key: 'creator', width: 15 },
          ];

          // 添加数据 - transactions是按日期分组的数组
          let rowCount = 0;
          transactions.forEach((dayGroup: any) => {
            dayGroup.records.forEach((record: any) => {
              worksheet.addRow({
                date: dayGroup.date,
                type: record.type === 'income' ? '收入' : '支出',
                category: record.category || '未分类',
                amount: record.amount,
                description: record.description || '',
                creator: record.member?.username || '',
              });
              rowCount++;
            });
          });
          
          console.log('[exportToExcel] 添加了', rowCount, '条记录');

          // 生成buffer
          const buffer = await workbook.xlsx.writeBuffer();
          const base64 = buffer.toString('base64');
          
          console.log('[exportToExcel] 生成成功, base64长度:', base64.length);
          
          return {
            data: base64,
            filename: `账目导出_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`,
          };
        } catch (error: any) {
          console.error('[exportToExcel] 错误:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `导出失败: ${error.message}`,
          });
        }
      }),

    // 设置成员角色（owner设置admin）重写版：使用targetUserId
    setMemberRole: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        targetUserId: z.number(),
        role: z.enum(['admin', 'member', 'funder']),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.setMemberRole(input.ledgerId, ctx.user.id, input.targetUserId, input.role);
      }),

    // 管理报销（管理员操作）
    manageReimbursement: protectedProcedure
      .input(z.object({
        recordId: z.number(),
        status: z.enum(['none', 'pending', 'completed']),
        notes: z.string().optional(),
        voucherImage: z.string().optional(), // base64
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.manageReimbursement(input.recordId, ctx.user.id, input.status, input.notes, input.voucherImage);
      }),

    // 获取报销历史
    getReimbursementHistory: protectedProcedure
      .input(z.object({
        recordId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getReimbursementHistory(input.recordId, ctx.user.id);
      }),

    // 获取报销统计
    getReimbursementStats: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getReimbursementStats(input.ledgerId, ctx.user.id);
      }),

    // 获取账本所有图片
    getImages: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerImages(input.ledgerId, ctx.user.id);
      }),

    // 获取账本导出统计信息
    getExportStats: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerExportStats(input.ledgerId, ctx.user.id);
      }),

    // 获取账本备份设置
    getBackupSettings: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const db_instance = await getDb();
        if (!db_instance) throw new Error("Database not available");
        
        const { ledgerBackupSettings } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        const settings = await db_instance
          .select()
          .from(ledgerBackupSettings)
          .where(
            and(
              eq(ledgerBackupSettings.ledgerId, input.ledgerId),
              eq(ledgerBackupSettings.userId, ctx.user.id)
            )
          )
          .limit(1);
        
        return settings[0] || null;
      }),

    // 保存账本备份设置
    saveBackupSettings: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        frequency: z.enum(['weekly', 'monthly', 'quarterly']),
        enabled: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db_instance = await getDb();
        if (!db_instance) throw new Error("Database not available");
        
        const { ledgerBackupSettings } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        
        // 计算下次备份时间
        const now = new Date();
        let nextBackupAt = new Date(now);
        
        if (input.frequency === 'weekly') {
          nextBackupAt.setDate(now.getDate() + 7);
        } else if (input.frequency === 'monthly') {
          nextBackupAt.setMonth(now.getMonth() + 1);
        } else if (input.frequency === 'quarterly') {
          nextBackupAt.setMonth(now.getMonth() + 3);
        }
        
        // 检查是否已存在设置
        const existing = await db_instance
          .select()
          .from(ledgerBackupSettings)
          .where(
            and(
              eq(ledgerBackupSettings.ledgerId, input.ledgerId),
              eq(ledgerBackupSettings.userId, ctx.user.id)
            )
          )
          .limit(1);
        
        // 将Date转为MySQL格式
        const pad = (n: number) => String(n).padStart(2, '0');
        const formatMySQLDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        const nextBackupStr = formatMySQLDate(nextBackupAt);
        
        if (existing.length > 0) {
          // 更新现有设置
          await db_instance
            .update(ledgerBackupSettings)
            .set({
              frequency: input.frequency,
              enabled: input.enabled ? 1 : 0,
              nextBackupAt: nextBackupStr,
            })
            .where(eq(ledgerBackupSettings.id, existing[0].id));
        } else {
          // 创建新设置
          await db_instance.insert(ledgerBackupSettings).values({
            ledgerId: input.ledgerId,
            userId: ctx.user.id,
            frequency: input.frequency,
            enabled: input.enabled ? 1 : 0,
            lastBackupAt: null,
            nextBackupAt: nextBackupStr,
          });
        }
        
        return { success: true };
      }),
    
    // 发送测试备份邮件
    sendTestBackup: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查备份权限
        const hasBackupPermission = await dbLedger.checkBackupPermission(input.ledgerId, ctx.user.id);
        if (!hasBackupPermission) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '您没有备份该账本的权限' });
        }
        
        const { executeBackup } = await import('./backup-service');
        await executeBackup(input.ledgerId, ctx.user.id);
        
        // 发送成功后更新备份计数和上次发送时间
        const db_instance = await getDb();
        if (db_instance) {
          const { ledgerBackupSettings } = await import("../drizzle/schema");
          const { eq, and, sql } = await import("drizzle-orm");
          
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
          
          await db_instance
            .update(ledgerBackupSettings)
            .set({
              backupCount: sql`backup_count + 1`,
              lastBackupAt: nowStr,
            })
            .where(
              and(
                eq(ledgerBackupSettings.ledgerId, input.ledgerId),
                eq(ledgerBackupSettings.userId, ctx.user.id)
              )
            );
        }
        
        return { success: true };
      }),

    // 解析导入数据
    parseImportData: protectedProcedure
      .input(z.object({
        data: z.string(),
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const db_instance = await getDb();
        if (!db_instance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        // 验证用户是否是该账本成员
        const member = await db_instance
          .select()
          .from(ledgerMembers)
          .where(
            and(
              eq(ledgerMembers.ledgerId, input.ledgerId),
              eq(ledgerMembers.userId, ctx.user.id)
            )
          )
          .limit(1);
        
        if (member.length === 0) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '您不是该账本成员' });
        }

        // 解析CSV/TSV数据
        const lines = input.data.split('\n').filter(line => line.trim());
        const records: any[] = [];

        // 尝试识别分隔符（逗号或制表符）
        const firstLine = lines[0];
        const delimiter = firstLine.includes('\t') ? '\t' : ',';

        // 解析每一行
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // 跳过表头行（包含“交易时间”、“金额”等关键字）
          if (i === 0 && (line.includes('交易时间') || line.includes('时间') || line.includes('金额') || line.includes('类型'))) {
            continue;
          }

          const fields = line.split(delimiter).map(f => f.trim().replace(/^"|"$/g, ''));
          
          // 至少需要有日期和金额
          if (fields.length < 2) continue;

          // 尝试识别各个字段
          let date = '';
          let amount = 0;
          let type: 'income' | 'expense' = 'expense';
          let category = '其他';
          let description = '';

          // 微信账单格式：交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
          // 支付宝账单格式：交易时间,交易分类,交易对方,商品说明,金额,收/支,交易状态
          
          for (let j = 0; j < fields.length; j++) {
            const field = fields[j];
            
            // 识别日期（包含 - 或 / 或年月日）
            if (!date && (field.match(/\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}/) || field.match(/\d{4}-\d{2}-\d{2}/))) {
              date = field.replace(/年|月/g, '-').replace(/日/g, '').split(' ')[0];
            }
            
            // 识别金额（数字或带元符号）
            const amountMatch = field.match(/([+-]?\d+\.?\d*)/);
            if (amountMatch && parseFloat(amountMatch[1]) > 0) {
              const parsedAmount = parseFloat(amountMatch[1]);
              if (parsedAmount > amount) {
                amount = parsedAmount;
                // 根据正负号判断收支
                if (field.startsWith('-') || field.startsWith('－')) {
                  type = 'expense';
                } else if (field.startsWith('+') || field.startsWith('＋')) {
                  type = 'income';
                }
              }
            }
            
            // 识别收支类型
            if (field.includes('支出') || field.includes('付款') || field === '支') {
              type = 'expense';
            } else if (field.includes('收入') || field.includes('收款') || field === '收') {
              type = 'income';
            }
            
            // 识别分类
            if (field.includes('餐饮') || field.includes('美食')) {
              category = '餐饮';
            } else if (field.includes('购物') || field.includes('超市')) {
              category = '购物';
            } else if (field.includes('交通') || field.includes('打车') || field.includes('公交')) {
              category = '交通';
            } else if (field.includes('娱乐') || field.includes('电影')) {
              category = '娱乐';
            } else if (field.includes('医疗') || field.includes('药店')) {
              category = '医疗';
            }
            
            // 收集备注信息
            if (j > 2 && field.length > 0 && field.length < 50 && !field.match(/\d{10,}/)) {
              if (!description) {
                description = field;
              }
            }
          }

          // 如果没有识别到日期，使用今天
          if (!date) {
            const now = new Date();
            date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          }

          // 如果识别到有效数据，添加到结果
          if (amount > 0) {
            records.push({
              date,
              type,
              amount,
              category,
              description: description || '导入记录',
              originalData: line,
            });
          }
        }

        return { records };
      }),

    // 导入记录
    importRecords: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        records: z.array(z.object({
          date: z.string(),
          type: z.enum(['income', 'expense']),
          amount: z.number(),
          category: z.string(),
          description: z.string(),
          originalData: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const db_instance = await getDb();
        if (!db_instance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        // 验证用户是否是该账本成员
        const member = await db_instance
          .select()
          .from(ledgerMembers)
          .where(
            and(
              eq(ledgerMembers.ledgerId, input.ledgerId),
              eq(ledgerMembers.userId, ctx.user.id)
            )
          )
          .limit(1);
        
        if (member.length === 0) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '您不是该账本成员' });
        }

        // 批量插入记录
        let successCount = 0;
        for (const record of input.records) {
          try {
            // 查找或创建分类
            let categoryId = null;
            const existingCategory = await db_instance
              .select()
              .from(ledgerCategories)
              .where(
                and(
                  eq(ledgerCategories.ledgerId, input.ledgerId),
                  eq(ledgerCategories.name, record.category)
                )
              )
              .limit(1);
            
            if (existingCategory.length > 0) {
              categoryId = existingCategory[0].id;
            } else {
              // 创建新分类
              const result = await db_instance
                .insert(ledgerCategories)
                .values({
                  ledgerId: input.ledgerId,
                  name: record.category,
                  type: record.type,
                  icon: '💰',
                  color: record.type === 'income' ? '#4CAF50' : '#D32F2F',
                });
              categoryId = result[0].insertId;
            }

            // 插入账目记录
            await db_instance
              .insert(ledgerRecords)
              .values({
                ledgerId: input.ledgerId,
                userId: ctx.user.id,
                categoryId: categoryId,
                amount: record.amount,
                type: record.type,
                date: record.date,
                description: record.description,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
            
            successCount++;
          } catch (error) {
            console.error('导入记录失败:', error);
            // 继续导入其他记录
          }
        }

        return { count: successCount };
      }),

    // ===== 定制账本(AA) 管理员专用接口 =====
    // 创建定制账本（仅管理员）
    createCustomAA: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可创建定制账本' });
        }
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: 'custom_aa',
          createdBy: ctx.user.id,
        });
        return ledger;
      }),

    // 获取所有定制账本列表（仅管理员）
    listCustomAA: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可查看定制账本列表' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const rows = await db
          .select({
            id: ledgers.id,
            name: ledgers.name,
            description: ledgers.description,
            createdAt: ledgers.createdAt,
          })
          .from(ledgers)
          .where(eq(ledgers.type, 'custom_aa'))
          .orderBy(desc(ledgers.createdAt));
        return rows;
      }),

    // 邀请用户加入定制账本（仅管理员，通过用户名）
    inviteToCustomAA: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        username: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可邀请用户加入定制账本' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [ledger] = await db
          .select({ id: ledgers.id, type: ledgers.type })
          .from(ledgers)
          .where(eq(ledgers.id, input.ledgerId));
        if (!ledger || ledger.type !== 'custom_aa') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '该账本不是定制账本' });
        }
        return await dbLedger.inviteMemberByUsername(input.ledgerId, ctx.user.id, input.username);
      }),

    // ===== AC 型定制账本（共享健康·减肥账本）=====
    // 创建 AC 账本（仅管理员）
    createCustomAC: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可创建AC定制账本' });
        }
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: 'custom_ac',
          createdBy: ctx.user.id,
        });
        return ledger;
      }),

    // 获取 AC 账本列表（仅管理员）
    // 同时包含旧的 'diet' 类型和新的 'custom_ac' 类型，不限所有权
    listCustomAC: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可查看AC定制账本列表' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const rows = await db
          .select({
            id: ledgers.id,
            name: ledgers.name,
            description: ledgers.description,
            createdAt: ledgers.createdAt,
          })
          .from(ledgers)
          .where(inArray(ledgers.type, ['diet', 'custom_ac']))
          .orderBy(desc(ledgers.createdAt));
        return rows;
      }),

    // 邀请学员加入 AC 账本（仅管理员）
    inviteToCustomAC: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        username: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可邀请学员加入AC账本' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [ledger] = await db
          .select({ id: ledgers.id, type: ledgers.type })
          .from(ledgers)
          .where(eq(ledgers.id, input.ledgerId));
         if (!ledger || !['diet', 'custom_ac'].includes(ledger.type)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '该账本不是AC定制账本' });
        }
        return await dbLedger.inviteMemberByUsername(input.ledgerId, ctx.user.id, input.username);
      }),

    // ===== AD 型定制账本（永忆）=====
    // 创建 AD 账本（仅管理员）
    createCustomAD: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可创建AD定制账本' });
        }
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: 'custom_ad',
          createdBy: ctx.user.id,
        });
        return ledger;
      }),
    // 获取 AD 账本列表（仅管理员）
    listCustomAD: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可查看AD定制账本列表' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const rows = await db
          .select({
            id: ledgers.id,
            name: ledgers.name,
            description: ledgers.description,
            createdAt: ledgers.createdAt,
          })
          .from(ledgers)
          .where(eq(ledgers.type, 'custom_ad'))
          .orderBy(desc(ledgers.createdAt));
        return rows;
      }),
    // 邀请成员加入 AD 账本（仅管理员）
    inviteToCustomAD: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        username: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可邀请成员加入AD账本' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [ledger] = await db
          .select({ id: ledgers.id, type: ledgers.type })
          .from(ledgers)
          .where(eq(ledgers.id, input.ledgerId));
        if (!ledger || ledger.type !== 'custom_ad') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '该账本不是AD定制账本' });
        }
        return await dbLedger.inviteMemberByUsername(input.ledgerId, ctx.user.id, input.username);
      }),

    // ===== AE 型共享抽奖账本管理 =====
    createCustomAE: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可创建AE定制账本' });
        }
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: 'custom_ae',
          createdBy: ctx.user.id,
        });
        return ledger;
      }),
    listCustomAE: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可查看AE定制账本列表' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const rows = await db
          .select({
            id: ledgers.id,
            name: ledgers.name,
            description: ledgers.description,
            createdAt: ledgers.createdAt,
          })
          .from(ledgers)
          .where(eq(ledgers.type, 'custom_ae'))
          .orderBy(desc(ledgers.createdAt));
        return rows;
      }),
    inviteToCustomAE: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        username: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可邀请成员加入AE账本' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [ledger] = await db
          .select({ id: ledgers.id, type: ledgers.type })
          .from(ledgers)
          .where(eq(ledgers.id, input.ledgerId));
        if (!ledger || ledger.type !== 'custom_ae') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '该账本不是AE定制账本' });
        }
        return await dbLedger.inviteMemberByUsername(input.ledgerId, ctx.user.id, input.username);
      }),

    // ===== AF 型定制账本管理 =====
    createCustomAF: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可创建AF定制账本' });
        }
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: 'custom_af',
          createdBy: ctx.user.id,
        });
        return ledger;
      }),
    listCustomAF: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可查看AF定制账本列表' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const rows = await db
          .select({
            id: ledgers.id,
            name: ledgers.name,
            description: ledgers.description,
            createdAt: ledgers.createdAt,
          })
          .from(ledgers)
          .where(eq(ledgers.type, 'custom_af'))
          .orderBy(desc(ledgers.createdAt));
        return rows;
      }),
    inviteToCustomAF: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        username: z.string(),
        role: z.enum(['member', 'funder', 'admin']).optional().default('member'),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可邀请成员加入AF账本' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [ledger] = await db
          .select({ id: ledgers.id, type: ledgers.type })
          .from(ledgers)
          .where(eq(ledgers.id, input.ledgerId));
        if (!ledger || ledger.type !== 'custom_af') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '该账本不是AF定制账本' });
        }
        return await dbLedger.inviteMemberByUsernameWithRole(input.ledgerId, ctx.user.id, input.username, input.role);
      }),
    // ===== AG 型定制账本（共享图片助记词）=====
    createCustomAG: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可创建AG定制账本' });
        }
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: 'custom_ag',
          createdBy: ctx.user.id,
        });
        return ledger;
      }),
    listCustomAG: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可查看AG定制账本列表' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const rows = await db
          .select({
            id: ledgers.id,
            name: ledgers.name,
            description: ledgers.description,
            createdAt: ledgers.createdAt,
          })
          .from(ledgers)
          .where(eq(ledgers.type, 'custom_ag'))
          .orderBy(desc(ledgers.createdAt));
        return rows;
      }),
    inviteToCustomAG: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        username: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可邀请成员加入AG账本' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [ledger] = await db
          .select({ id: ledgers.id, type: ledgers.type })
          .from(ledgers)
          .where(eq(ledgers.id, input.ledgerId));
        if (!ledger || ledger.type !== 'custom_ag') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '该账本不是AG定制账本' });
        }
        return await dbLedger.inviteMemberByUsername(input.ledgerId, ctx.user.id, input.username);
      }),
    // ===== AG型账本：图片助记词 CRUD =====
    // 获取AG账本的图片列表
    getAgPromptImages: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
        tag: z.string().optional(),      // 标签筛选
        keyword: z.string().optional(),  // 关键词搜索
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const { ledgerId, page, pageSize, tag, keyword } = input;
        const offset = (page - 1) * pageSize;
        // 构建查询条件
        const conditions: any[] = [
          eq(agPromptImages.ledgerId, ledgerId),
          isNull(agPromptImages.deletedAt),
        ];
        if (tag) {
          conditions.push(like(agPromptImages.tags, `%${tag}%`));
        }
        if (keyword) {
          conditions.push(or(
            like(agPromptImages.title, `%${keyword}%`),
            like(agPromptImages.promptText, `%${keyword}%`),
          ));
        }
        const items = await db
          .select()
          .from(agPromptImages)
          .where(and(...conditions))
          .orderBy(desc(agPromptImages.sortOrder), desc(agPromptImages.createdAt))
          .limit(pageSize)
          .offset(offset);
        // 获取总数
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(agPromptImages)
          .where(and(...conditions));
        const total = countResult?.count ?? 0;
        // 获取所有标签（用于筛选栏）
        const allTagsRows = await db
          .select({ tags: agPromptImages.tags })
          .from(agPromptImages)
          .where(and(
            eq(agPromptImages.ledgerId, ledgerId),
            isNull(agPromptImages.deletedAt),
          ));
        const tagSet = new Set<string>();
        const tagCountMap: Record<string, number> = {};
        for (const row of allTagsRows) {
          if (row.tags) {
            try {
              const arr = JSON.parse(row.tags);
              if (Array.isArray(arr)) {
                arr.forEach((t: string) => {
                  tagSet.add(t);
                  tagCountMap[t] = (tagCountMap[t] || 0) + 1;
                });
              }
            } catch {}
          }
        }
        return {
          items,
          total,
          page,
          pageSize,
          hasMore: offset + items.length < total,
          allTags: Array.from(tagSet).slice(0, 50),
          tagCounts: tagCountMap,
        };
      }),
    // 收藏/取消收藏AG图片
    toggleAgFavorite: protectedProcedure
      .input(z.object({
        imageId: z.number(),
        ledgerId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const userId = ctx.user.id;
        // 检查是否已收藏
        const [existing] = await db.execute(
          `SELECT id FROM ag_favorites WHERE user_id = ? AND image_id = ?`,
          [userId, input.imageId]
        ) as any[];
        const rows = existing as any[];
        if (rows && rows.length > 0) {
          // 已收藏 -> 取消
          await db.execute(
            `DELETE FROM ag_favorites WHERE user_id = ? AND image_id = ?`,
            [userId, input.imageId]
          );
          return { favorited: false };
        } else {
          // 未收藏 -> 添加
          await db.execute(
            `INSERT INTO ag_favorites (user_id, ledger_id, image_id) VALUES (?, ?, ?)`,
            [userId, input.ledgerId, input.imageId]
          );
          return { favorited: true };
        }
      }),

    // 获取用户在某账本的收藏列表
    getAgFavorites: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const userId = ctx.user.id;
        const rows = await db.execute(
          `SELECT f.image_id, i.title, i.image_url, i.prompt_text, i.tags, i.created_at
           FROM ag_favorites f
           JOIN ag_prompt_images i ON i.id = f.image_id AND i.deleted_at IS NULL
           WHERE f.user_id = ? AND f.ledger_id = ?
           ORDER BY f.created_at DESC`,
          [userId, input.ledgerId]
        ) as any[];
        const items = (rows[0] as any[]) || [];
        return { items };
      }),

    // 获取用户在某账本收藏的image_id集合（用于前端判断是否已收藏）
    getAgFavoriteIds: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const userId = ctx.user.id;
        const rows = await db.execute(
          `SELECT image_id FROM ag_favorites WHERE user_id = ? AND ledger_id = ?`,
          [userId, input.ledgerId]
        ) as any[];
        const ids = ((rows[0] as any[]) || []).map((r: any) => r.image_id as number);
        return { ids };
      }),

    // 上传AG账本图片（接受base64，上传到COS，并保存记录）
    uploadAgPromptImage: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        imageData: z.string(),   // base64 encoded image
        promptText: z.string().optional(),
        title: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [member] = await db
          .select({ id: schema.ledgerMembers.id })
          .from(schema.ledgerMembers)
          .where(and(
            eq(schema.ledgerMembers.ledgerId, input.ledgerId),
            eq(schema.ledgerMembers.userId, ctx.user.id)
          ));
        if (!member) throw new TRPCError({ code: 'FORBIDDEN', message: '您不是该账本成员' });
        const { uploadImageToCOS } = await import('./cos-upload');
        const imageUrl = await uploadImageToCOS(input.imageData, 'ledger-photos');
        await db.insert(agPromptImages).values({
          ledgerId: input.ledgerId,
          imageUrl,
          imageKey: imageUrl,  // COS URL作为key
          promptText: input.promptText || null,
          title: input.title || null,
          uploadedBy: ctx.user.id,
          sortOrder: 0,
        });
        return { success: true, imageUrl };
      }),
    // 更新AG账本图片的提示词
    updateAgPromptImage: protectedProcedure
      .input(z.object({
        id: z.number(),
        promptText: z.string().optional(),
        title: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [img] = await db.select().from(agPromptImages).where(eq(agPromptImages.id, input.id));
        if (!img) throw new TRPCError({ code: 'NOT_FOUND', message: '图片不存在' });
        if (img.uploadedBy !== ctx.user.id && ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只能编辑自己上传的图片' });
        }
        await db.update(agPromptImages)
          .set({ promptText: input.promptText ?? img.promptText, title: input.title ?? img.title })
          .where(eq(agPromptImages.id, input.id));
        return { success: true };
      }),
    // 删除AG账本图片
    deleteAgPromptImage: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [img] = await db.select().from(agPromptImages).where(eq(agPromptImages.id, input.id));
        if (!img) throw new TRPCError({ code: 'NOT_FOUND', message: '图片不存在' });
        if (img.uploadedBy !== ctx.user.id && ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只能删除自己上传的图片' });
        }
        await db.update(agPromptImages)
          .set({ deletedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') })
          .where(eq(agPromptImages.id, input.id));
        return { success: true };
      }),
    // ===== AG 数据源管理 =====
    // 获取数据源列表
    getAgSyncSources: protectedProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 验证是账本成员
        const [member] = await db.select().from(schema.ledgerMembers).where(and(
          eq(schema.ledgerMembers.ledgerId, input.ledgerId),
          eq(schema.ledgerMembers.userId, ctx.user.id)
        ));
        if (!member) throw new TRPCError({ code: 'FORBIDDEN', message: '您不是该账本成员' });
        const sources = await db.select().from(agSyncSources)
          .where(eq(agSyncSources.ledgerId, input.ledgerId))
          .orderBy(agSyncSources.id);
        return { sources };
      }),
    // 获取同步日志
    getAgSyncLogs: protectedProcedure
      .input(z.object({ sourceId: z.number(), limit: z.number().default(20) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const logs = await db.select().from(agSyncLogs)
          .where(eq(agSyncLogs.sourceId, input.sourceId))
          .orderBy(desc(agSyncLogs.id))
          .limit(input.limit);
        return { logs };
      }),
    // 触发增量同步
    syncAgFromSource: protectedProcedure
      .input(z.object({ sourceId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const startTime = Date.now();
        // 获取数据源配置
        const [source] = await db.select().from(agSyncSources).where(eq(agSyncSources.id, input.sourceId));
        if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: '数据源不存在' });
        // 验证是账本owner
        const [member] = await db.select().from(schema.ledgerMembers).where(and(
          eq(schema.ledgerMembers.ledgerId, source.ledgerId),
          eq(schema.ledgerMembers.userId, ctx.user.id)
        ));
        if (!member || member.role !== 'owner') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只有账本创建者可以触发同步' });
        }
        const maxIdBefore = source.lastMaxId || 0;
        let newCount = 0;
        let skipCount = 0;
        let maxIdAfter = maxIdBefore;
        let errorMsg: string | null = null;
        // 根据数据源名称判断同步策略
        const isAiartPics = source.name === 'aiart.pics';
        try {
          const { uploadImageToCOS } = await import('./cos-upload');
          const baseApiUrl = source.apiUrl;
          let shouldStop = false;

          if (isAiartPics) {
            // ===== aiart.pics 同步逻辑 =====
            // API: GET /api/prompts?limit=20&offset=0，返回 {prompts:[], total, limit, offset}
            // 详情: GET /api/prompts/{id}，返回 {success, data: {prompts:[], images:[{path}], tags:[], author:{name}, title:{zh,en}}}
            // 图片CDN: https://img1.aiart.pics/{path}
            const PAGE_SIZE = 20;
            let offset = 0;
            const total = 99999; // 先设大值，实际由API返回
            let actualTotal = total;
            while (!shouldStop) {
              const listUrl = `${baseApiUrl}?limit=${PAGE_SIZE}&offset=${offset}`;
              const resp = await fetch(listUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
              if (!resp.ok) throw new Error(`aiart.pics API请求失败: ${resp.status}`);
              const json = await resp.json() as any;
              const items: any[] = json.prompts || [];
              actualTotal = json.total || actualTotal;
              if (!items || items.length === 0) { shouldStop = true; break; }
              for (const item of items) {
                const externalId = item.id; // UUID字符串
                // 只处理图片类型
                if (item.mediaType !== 'image') { skipCount++; continue; }
                // 检查是否已存在（通过imageKey包含aiartpics_{id}_）
                const [existing] = await db.select({ id: agPromptImages.id })
                  .from(agPromptImages)
                  .where(and(
                    eq(agPromptImages.ledgerId, source.ledgerId),
                    like(agPromptImages.imageKey, `%aiartpics_${externalId}_%`)
                  ))
                  .limit(1);
                if (existing) {
                  // 遇到已存在的记录，停止同步
                  skipCount++;
                  shouldStop = true;
                  break;
                }
                // 新记录：拉取详情 + 下载图片 + 上传到COS
                try {
                  // 拉取详情获取完整信息（含prompts文本）
                  const detailResp = await fetch(`${baseApiUrl}/${externalId}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
                  let detail: any = null;
                  if (detailResp.ok) {
                    const detailJson = await detailResp.json() as any;
                    detail = detailJson.data || detailJson;
                  }
                  // 获取图片URL：优先详情中第一张图片，CDN前缀 https://img1.aiart.pics/
                  const imgPath = (detail?.images && detail.images[0]?.path) || (item.images && item.images[0]?.path);
                  if (!imgPath) { skipCount++; continue; }
                  const imgUrl = `https://img1.aiart.pics/${imgPath}`;
                  const imgResp = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
                  if (!imgResp.ok) { skipCount++; continue; }
                  const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
                  const fileKey = `ag-prompts/aiartpics_${externalId}_${Date.now()}.jpg`;
                  const cosUrl = await uploadImageToCOS(imgBuffer, 'ag-prompts', fileKey);
                  // 提取提示词（prompts数组中第一条文本，优先中文）
                  let promptText: string | null = null;
                  if (detail?.prompts && Array.isArray(detail.prompts) && detail.prompts.length > 0) {
                    // aiart.pics 的 prompts 是字符串数组，取第一条
                    promptText = detail.prompts[0] || null;
                  }
                  // 提取标题（优先中文）
                  const titleZh = detail?.title?.zh || item.title?.zh || null;
                  const titleEn = detail?.title?.en || item.title?.en || null;
                  const titleText = titleZh || titleEn || null;
                  // 构建tags
                  const tags: string[] = [];
                  const tagSource = detail?.tags || item.tags;
                  if (tagSource && Array.isArray(tagSource)) {
                    tags.push(...tagSource.map((t: any) => typeof t === 'string' ? t : t.name || '').filter(Boolean));
                  }
                  // 作者名
                  const authorName = detail?.author?.name || item.author?.name || null;
                  await db.insert(agPromptImages).values({
                    ledgerId: source.ledgerId,
                    imageUrl: cosUrl,
                    imageKey: fileKey,
                    promptText,
                    title: titleText,
                    tags: tags.length > 0 ? JSON.stringify(tags) : null,
                    author: authorName,
                    uploadedBy: ctx.user.id,
                    sortOrder: 0,
                  });
                  newCount++;
                } catch (imgErr) {
                  console.error('[AG Sync aiart.pics] 图片处理失败:', imgErr);
                  skipCount++;
                }
              }
              // 检查是否还有更多页
              offset += PAGE_SIZE;
              if (offset >= actualTotal) { shouldStop = true; break; }
              // 最多拉取20页（400条）防止无限循环
              if (offset >= PAGE_SIZE * 20) shouldStop = true;
            }
          } else {
            // ===== OpenNana 同步逻辑（原有逻辑）=====
            // API: GET /api/prompts?page=1&limit=20，返回 {data: {items:[], pagination:{has_more}}}
            let page = 1;
            while (!shouldStop) {
              const listUrl = `${baseApiUrl}?page=${page}&limit=20`;
              const resp = await fetch(listUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
              if (!resp.ok) throw new Error(`API请求失败: ${resp.status}`);
              const json = await resp.json() as any;
              const items: any[] = json.data?.items || [];
              if (!items || items.length === 0) { shouldStop = true; break; }
              for (const item of items) {
                const externalId = item.id;
                // 只处理图片类型
                if (item.media_type !== 'image') { skipCount++; continue; }
                // 检查是否已存在（通过imageKey包含externalId）
                const [existing] = await db.select({ id: agPromptImages.id })
                  .from(agPromptImages)
                  .where(and(
                    eq(agPromptImages.ledgerId, source.ledgerId),
                    like(agPromptImages.imageKey, `%opennana_${externalId}_%`)
                  ))
                  .limit(1);
                if (existing) {
                  // 遇到已存在的记录，停止同步
                  skipCount++;
                  shouldStop = true;
                  break;
                }
                // 新记录：拉取详情 + 下载图片 + 上传到COS
                try {
                  // 拉取详情获取完整信息
                  const detailResp = await fetch(`${baseApiUrl}/${item.slug}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
                  let detail: any = null;
                  if (detailResp.ok) {
                    const detailJson = await detailResp.json() as any;
                    detail = detailJson.data || detailJson;
                  }
                  // 获取图片URL（优先详情中的高清图，fallback到列表缩略图）
                  const imgUrl = (detail?.images && detail.images[0]) || item.cover_image;
                  if (!imgUrl) { skipCount++; continue; }
                  const imgResp = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
                  if (!imgResp.ok) { skipCount++; continue; }
                  const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
                  const fileKey = `ag-prompts/opennana_${externalId}_${Date.now()}.jpg`;
                  const cosUrl = await uploadImageToCOS(imgBuffer, 'ag-prompts', fileKey);
                  // 提取提示词（优先中文）
                  let promptText: string | null = null;
                  if (detail?.prompts && Array.isArray(detail.prompts)) {
                    const zhPrompt = detail.prompts.find((p: any) => p.type === 'zh');
                    const enPrompt = detail.prompts.find((p: any) => p.type === 'en');
                    promptText = zhPrompt?.text || enPrompt?.text || null;
                  }
                  // 构建tags
                  const tags: string[] = [];
                  const tagSource = detail?.tags || item.tags;
                  if (tagSource) {
                    if (Array.isArray(tagSource)) tags.push(...tagSource.map((t: any) => typeof t === 'string' ? t : t.name || '').filter(Boolean));
                    else if (typeof tagSource === 'string') tags.push(...tagSource.split(',').map((t: string) => t.trim()).filter(Boolean));
                  }
                  await db.insert(agPromptImages).values({
                    ledgerId: source.ledgerId,
                    imageUrl: cosUrl,
                    imageKey: fileKey,
                    promptText,
                    title: item.title || null,
                    tags: tags.length > 0 ? JSON.stringify(tags) : null,
                    author: detail?.submitter_name || null,
                    uploadedBy: ctx.user.id,
                    sortOrder: 0,
                  });
                  if (externalId > maxIdAfter) maxIdAfter = externalId;
                  newCount++;
                } catch (imgErr) {
                  console.error('[AG Sync] 图片处理失败:', imgErr);
                  skipCount++;
                }
              }
              // 检查是否还有更多页
              const hasMore = json.data?.pagination?.has_more;
              if (!hasMore) { shouldStop = true; break; }
              page++;
              // 最多拉取20页防止无限循环
              if (page > 20) shouldStop = true;
            }
          }
          // 更新数据源状态
          await db.update(agSyncSources)
            .set({
              lastMaxId: maxIdAfter,
              totalSynced: (source.totalSynced || 0) + newCount,
              lastSyncedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
            })
            .where(eq(agSyncSources.id, input.sourceId));
          // 记录同步日志
          await db.insert(agSyncLogs).values({
            sourceId: input.sourceId,
            ledgerId: source.ledgerId,
            status: 'success',
            newCount,
            skipCount,
            maxIdBefore,
            maxIdAfter,
            durationMs: Date.now() - startTime,
            triggeredBy: ctx.user.id,
            triggeredByName: ctx.user.username || ctx.user.name || null,
          });
          return { success: true, newCount, skipCount, durationMs: Date.now() - startTime };
        } catch (err) {
          errorMsg = err instanceof Error ? err.message : String(err);
          // 记录失败日志
          await db.insert(agSyncLogs).values({
            sourceId: input.sourceId,
            ledgerId: source.ledgerId,
            status: 'failed',
            newCount,
            skipCount,
            maxIdBefore,
            maxIdAfter,
            durationMs: Date.now() - startTime,
            errorMsg,
            triggeredBy: ctx.user.id,
            triggeredByName: ctx.user.username || ctx.user.name || null,
          });
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `同步失败: ${errorMsg}` });
        }
      }),
    // ===== 备忘录条目 CRUD（AD型账本使用）=====
    // 获取备忘录列表
    getMemoItems: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        category: z.string().optional(),
        keyword: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        await dbMemo.ensureMemoTables();
        if (input.keyword && input.keyword.trim()) {
          return await dbMemo.searchMemoItems(input.ledgerId, input.keyword.trim());
        }
        return await dbMemo.getMemoItems(input.ledgerId, undefined, input.category);
      }),
    // 创建备忘录条目
    createMemoItem: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        category: z.string(),
        title: z.string().min(1).max(100),
        fields: z.array(z.object({
          label: z.string(),
          value: z.string(),
          sensitive: z.boolean().optional(),
        })),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbMemo.ensureMemoTables();
        const id = await dbMemo.createMemoItem({
          ledgerId: input.ledgerId,
          userId: ctx.user.id,
          category: input.category,
          title: input.title,
          fields: input.fields,
          note: input.note,
        });
        return { id };
      }),
    // 更新备忘录条目
    updateMemoItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        category: z.string().optional(),
        title: z.string().optional(),
        fields: z.array(z.object({
          label: z.string(),
          value: z.string(),
          sensitive: z.boolean().optional(),
        })).optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await dbMemo.updateMemoItem(id, ctx.user.id, data);
        return { success: true };
      }),
    // 删除备忘录条目
    deleteMemoItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await dbMemo.deleteMemoItem(input.id, ctx.user.id);
        return { success: true };
      }),

    // ===== 提示词库 =====
    getPrompts: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        category: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbMemo.getPrompts(input.ledgerId, input.category);
      }),

    createPrompts: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        category: z.string(),
        contents: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbMemo.createPrompts({
          ledgerId: input.ledgerId,
          userId: ctx.user.id,
          category: input.category,
          contents: input.contents,
        });
        return { success: true };
      }),

    deletePrompt: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await dbMemo.deletePrompt(input.id, ctx.user.id);
        return { success: true };
      }),

    // 获取当前用户的初始金额配置（定制账本AA）
    getMyInitialBalances: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        viewAsUserId: z.number().optional(), // 管理员可查指定成员的初始金额
      }))
      .query(async ({ ctx, input }) => {
        let targetUserId = ctx.user.id;
        if (input.viewAsUserId) {
          // 验证当前用户是否是owner/admin
          const members = await dbLedger.getLedgerMembers(input.ledgerId, ctx.user.id);
          const myMembership = (members as any[]).find((m: any) => m.userId === ctx.user.id);
          if (myMembership && (myMembership.role === 'owner' || myMembership.role === 'admin')) {
            targetUserId = input.viewAsUserId;
          }
        }
        const balances = await dbLedger.getMyInitialBalances(input.ledgerId, targetUserId);
        return { balances: balances ?? {} };
      }),
    // 更新当前用户的初始金额配置（定制账本AA）
    updateMyInitialBalances: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        balances: z.record(z.string(), z.union([z.number(), z.string()])),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.updateMyInitialBalances(input.ledgerId, ctx.user.id, input.balances);
        return { success: true };
      }),
    // 管理员：获取所有成员的初始金额配置（定制账本AA）
    adminGetAllInitialBalances: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        // 只有owner/admin可操作
        const members = await dbLedger.getLedgerMembers(input.ledgerId, ctx.user.id);
        const realMembers = members.filter((m: any) => m.memberType !== 'ai');
        const result = await dbLedger.getAllMembersInitialBalances(input.ledgerId);
        return { members: realMembers, balancesMap: result };
      }),
    // 管理员：设置指定成员的初始金额配置（定制账本AA）
    adminSetMemberInitialBalances: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        targetUserId: z.number(),
        balances: z.record(z.string(), z.union([z.number(), z.string()])),
      }))
      .mutation(async ({ ctx, input }) => {
        // 验证操作者是owner或admin
        const myMembership = await dbLedger.getUserMembership(input.ledgerId, ctx.user.id);
        if (!myMembership || (myMembership.role !== 'owner' && myMembership.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本创建人或管理员可设置初始金额' });
        }
        await dbLedger.updateMyInitialBalances(input.ledgerId, input.targetUserId, input.balances);
        return { success: true };
      }),

    // AF 手动调账 - 获取列表
    afGetManualBalances: protectedProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const dbLedger = await import('./db-ledger');
        const membership = await dbLedger.getUserMembership(input.ledgerId, ctx.user.id);
        if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可查看' });
        }
        
        const db = await getLedgerDb();
        const rows = await db.execute(
          sql`SELECT * FROM af_manual_balances WHERE ledger_id = ${input.ledgerId} ORDER BY created_at DESC`
        );
        return (rows as any)[0] as any[];
      }),

    // AF 手动调账 - 新增或更新
    afUpsertManualBalance: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        id: z.number().optional(),
        userId: z.number(),
        amount: z.number(),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbLedger = await import('./db-ledger');
        const membership = await dbLedger.getUserMembership(input.ledgerId, ctx.user.id);
        if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
        }
        
        const db = await getLedgerDb();
        if (input.id) {
          await db.execute(
            sql`UPDATE af_manual_balances SET amount = ${input.amount}, note = ${input.note || ''}, updated_at = NOW() WHERE id = ${input.id} AND ledger_id = ${input.ledgerId}`
          );
        } else {
          // af_manual_balances 表已通过 deploy.yml 创建
          await db.execute(
            sql`INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (${input.ledgerId}, ${input.userId}, ${input.amount}, ${input.note || ''}, NOW(), NOW())`
          );
        }
        return { success: true };
      }),

    // AF 手动调账 - 删除
    afDeleteManualBalance: protectedProcedure
      .input(z.object({ ledgerId: z.number(), id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbLedger = await import('./db-ledger');
        const membership = await dbLedger.getUserMembership(input.ledgerId, ctx.user.id);
        if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
        }
        
        const db = await getLedgerDb();
        await db.execute(
          sql`DELETE FROM af_manual_balances WHERE id = ${input.id} AND ledger_id = ${input.ledgerId}`
        );
        return { success: true };
      }),

    // 查询当前用户在 AF 账本的总资产估值（充值到账 + 手动调账）
    afGetMyTotalAsset: protectedProcedure
      .input(z.object({ ledgerId: z.number(), viewAsUserId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        
        const db = await getLedgerDb();
        // 视角切换：管理员可以查看任意成员数据
        let targetUserId = ctx.user.id;
        if (input.viewAsUserId) {
          // 验证当前用户是该账本的 owner 或 admin
          const memberCheck = await db.execute(
            sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
          ) as any;
          const rawResult = memberCheck;
          console.log('[AF viewAs] memberCheck raw:', JSON.stringify(rawResult));
          const myRole = (memberCheck as any)[0]?.[0]?.role || (memberCheck as any)[0]?.role;
          console.log('[AF viewAs] myRole:', myRole, 'viewAsUserId:', input.viewAsUserId, 'currentUserId:', ctx.user.id);
          if (myRole === 'owner' || myRole === 'admin') {
            targetUserId = input.viewAsUserId;
          }
        }
        console.log('[AF viewAs] final targetUserId:', targetUserId);

        // ★ 并行执行所有查询，从 9 个串行压缩为 3 个并行
        const [balanceResult, positionResult, userResult] = await Promise.all([
          // 查询1：充値总额 + 手动调账（按账本隔离）
          // 充値记录按 ledger_id 过滤：只计算该账本的充値（有 ledger_id 的），小包含无 ledger_id 的通用充値
          db.execute(
            sql`SELECT
              (SELECT COALESCE(SUM(CAST(amount AS DECIMAL(20,8))), 0) FROM recharge_orders WHERE user_id = ${targetUserId} AND ledger_id = ${input.ledgerId} AND status = 'completed') as recharged,
              (SELECT COALESCE(SUM(amount), 0) FROM af_manual_balances WHERE ledger_id = ${input.ledgerId} AND user_id = ${targetUserId}) as manual`
          ).catch(() => [[{ recharged: '0', manual: '0' }]]),

          // 查询2：仓位（所有币种 GROUP BY coin+side，排除已卖出订单）
          db.execute(
            sql`SELECT coin, side, COALESCE(SUM(CAST(quantity AS DECIMAL(28,8))), 0) as total
                FROM af_orders
                WHERE ledger_id = ${input.ledgerId} AND user_id = ${targetUserId}
                  AND status = 'completed' AND coin IN ('BTC','ETH','SOL')
                  AND (sell_status IS NULL OR sell_status != 'sold')
                GROUP BY coin, side`
          ).catch(() => [[]]),

          // 查询3：用户信息（invite_count）
          db.execute(
            sql`SELECT invite_count FROM users WHERE id = ${targetUserId} LIMIT 1`
          ).catch(() => [[{ invite_count: 0 }]]),
        ]);

        // 解析余额
        const balRow = (balanceResult as any)[0]?.[0] ?? (balanceResult as any)[0];
        const recharged = parseFloat(balRow?.recharged ?? '0');
        const manual = parseFloat(balRow?.manual ?? '0');

        // 解析仓位
        const posRows: any[] = (positionResult as any)[0] || (positionResult as any) || [];
        const positions: Record<string, number> = { BTC: 0, ETH: 0, SOL: 0 };
        for (const row of posRows) {
          const coin = row.coin;
          const side = row.side;
          const total = parseFloat((row.total ?? '0').toString());
          if (coin in positions) {
            if (side === 'buy') positions[coin] += total;
            else if (side === 'sell') positions[coin] -= total;
          }
        }
        for (const c of ['BTC', 'ETH', 'SOL']) positions[c] = Math.max(0, positions[c]);

        // 解析推荐人数
        const userRow = (userResult as any)[0]?.[0] ?? (userResult as any)[0];
        const inviteCount = Number(userRow?.invite_count ?? 0);

        // YJH 专属：计算直推和间推人数（无限层级递归）
        const YJH_USER_ID = 4957151;
        let directReferralCount = 0;
        let indirectReferralCount = 0;
        if (targetUserId === YJH_USER_ID) {
          try {
            const [directRows, directIdRows] = await Promise.all([
              db.execute(sql`SELECT COUNT(*) as cnt FROM users WHERE invited_by_user_id = ${YJH_USER_ID}`),
              db.execute(sql`SELECT id FROM users WHERE invited_by_user_id = ${YJH_USER_ID}`),
            ]) as any[];
            directReferralCount = Number((directRows as any)[0]?.[0]?.cnt ?? (directRows as any)[0]?.cnt ?? 0);
            const directIds = ((directIdRows as any)[0] || directIdRows).map((r: any) => r.id || r[0]);
            let queue = [...directIds];
            while (queue.length > 0) {
              const batch = queue.splice(0, 100);
              const placeholders = batch.map(() => '?').join(',');
              const childRows = await db.execute(
                sql.raw(`SELECT id FROM users WHERE invited_by_user_id IN (${placeholders})`, batch)
              ) as any;
              const children = ((childRows as any)[0] || childRows);
              for (const child of children) {
                indirectReferralCount++;
                queue.push(child.id || child[0]);
              }
            }
          } catch (e) {
            console.error('[AF] YJH间推统计失败:', e);
          }
        }

        return { total: recharged + manual, inviteCount, directReferralCount, indirectReferralCount, positions };
      }),
    // AF 充值记录 + 手动调账记录合并（供用户查看）
    afGetMyRechargeHistory: protectedProcedure
      .input(z.object({ ledgerId: z.number(), viewAsUserId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        
        const db = await getLedgerDb();
        // 视角切换
        let targetUserId = ctx.user.id;
        if (input.viewAsUserId) {
          const memberCheck = await db.execute(
            sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
          ) as any;
          const myRole = (memberCheck as any)[0]?.[0]?.role || (memberCheck as any)[0]?.role;
          if (myRole === 'owner' || myRole === 'admin') {
            targetUserId = input.viewAsUserId;
          }
        }
        // 1. 充値订单（recharge_orders，仅 completed 状态，按 ledger_id 隔离）
        const rechargeRows = await db.execute(
          sql`SELECT id, amount, created_at FROM recharge_orders WHERE user_id = ${targetUserId} AND ledger_id = ${input.ledgerId} AND status = 'completed' ORDER BY created_at DESC LIMIT 100`
        ) as any;
        const rechargeList = ((rechargeRows[0] || rechargeRows) as any[]).map((r: any) => ({
          id: `r_${r.id}`,
          amount: parseFloat(r.amount),
          sourceType: 'recharge' as const,
          note: '充値到账',
          createdAt: r.created_at,
        }));
        // 2. 手动调账记录（af_manual_balances）
        let manualList: any[] = [];
        try {
          const manualRows = await db.execute(
            sql`SELECT id, amount, note, created_at FROM af_manual_balances WHERE ledger_id = ${input.ledgerId} AND user_id = ${targetUserId} ORDER BY created_at DESC`
          ) as any;
          manualList = ((manualRows[0] || manualRows) as any[]).map((r: any) => ({
            id: `m_${r.id}`,
            amount: parseFloat(r.amount),
            sourceType: 'manual' as const,
            note: r.note || '管理员调账',
            createdAt: r.created_at,
          }));
        } catch (_) {
          // 表不存在时忽略
        }
        // 3. 合并并按时间倒序排列
        const combined = [...rechargeList, ...manualList].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return combined;
      }),
    // AF 提交委托订单
    afSubmitOrder: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        coin: z.string(),
        side: z.enum(['buy', 'sell']),
        limitPrice: z.string(),
        amount: z.string(),
        quantity: z.string(),
        orderType: z.string().optional(), // 无损合约 / 无损现货 / 行情评估
        sourceOrderId: z.number().nullable().optional(), // 委托卖出时关联的原始买入订单ID
      }))
      .mutation(async ({ ctx, input }) => {
        
        const db = await getLedgerDb();

        if (input.side === 'sell' && input.sourceOrderId) {
          // ★ 委托卖出：不创建新订单，直接在原买单上更新卖出字段
          // 防重复：检查原订单是否已在委托卖中
          const orderRows = await db.execute(
            sql`SELECT id, status, sell_status, user_id FROM af_orders
                WHERE id = ${input.sourceOrderId}
                  AND ledger_id = ${input.ledgerId}
                  AND user_id = ${ctx.user.id}
                LIMIT 1`
          ) as any;
          const order = (orderRows[0]?.[0] ?? orderRows[0]);
          if (!order) throw new Error('订单不存在');
          if (order.status !== 'completed') throw new Error('只有已成交的买单才能委托卖出');
          if (order.sell_status === 'selling') throw new Error('该订单已在委托卖出中，请先撤销后再重新委托');
          if (order.sell_status === 'sold') throw new Error('该订单已卖出，无法重复操作');
          
          // 更新原买单的卖出字段
          await db.execute(
            sql`UPDATE af_orders SET
                sell_price = ${input.limitPrice},
                sell_quantity = ${input.quantity},
                sell_at = NOW(),
                sell_status = 'selling',
                updated_at = NOW()
                WHERE id = ${input.sourceOrderId} AND ledger_id = ${input.ledgerId}`
          );
          console.log(`[afSubmitOrder] 委托卖出: 更新订单#${input.sourceOrderId} sell_status=selling, sell_price=${input.limitPrice}`);
          // 委托卖出不动余额，等管理员确认成交后再计算
          return { success: true };
        }

        // 买入订单：正常创建新订单
        const orderType = input.orderType || '无损合约';
        await db.execute(
          sql`INSERT INTO af_orders (ledger_id, user_id, coin, side, limit_price, original_limit_price, amount, quantity, status, order_type, created_at, updated_at)
              VALUES (${input.ledgerId}, ${ctx.user.id}, ${input.coin}, 'buy', ${input.limitPrice}, ${input.limitPrice}, ${input.amount}, ${input.quantity}, 'pending', ${orderType}, NOW(), NOW())`
        );
        // 委托买入：扣除余额
        const amountNum = parseFloat(input.amount);
        if (!isNaN(amountNum) && amountNum > 0) {
          await db.execute(
            sql`INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
                VALUES (${input.ledgerId}, ${ctx.user.id}, ${-amountNum}, ${`委托买入 ${input.coin} ${input.amount} USDT`}, NOW(), NOW())`
          );
        }
        return { success: true };
      }),
    // AF 查询委托订单（该账本所有币种）
    afGetOrders: protectedProcedure
      .input(z.object({ ledgerId: z.number(), viewAsUserId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        
        const db = await getLedgerDb();
        // 视角切换
        let targetUserId = ctx.user.id;
        if (input.viewAsUserId) {
          const memberCheck = await db.execute(
            sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
          ) as any;
          const myRole = (memberCheck as any)[0]?.[0]?.role || (memberCheck as any)[0]?.role;
          if (myRole === 'owner' || myRole === 'admin') {
            targetUserId = input.viewAsUserId;
          }
        }
        const rows = await db.execute(
          sql`SELECT o.id, o.coin, o.side, o.limit_price, o.amount, o.quantity, o.status, COALESCE(o.order_type,'') as order_type, o.created_at, o.updated_at,
                     COALESCE(o.is_gift, 0) as is_gift, COALESCE(o.gift_multiplier, '') as gift_multiplier,
                     o.source_order_id, o.source_user_id,
                     COALESCE(o.original_limit_price, o.limit_price) as original_limit_price,
                     COALESCE(o.source_amount, '') as source_amount,
                     COALESCE(su.username, '') as source_username,
                     o.sell_price, o.sell_quantity, o.sell_at, o.sell_confirmed_at, o.sell_status
              FROM af_orders o
              LEFT JOIN users su ON su.id = o.source_user_id
              WHERE o.ledger_id = ${input.ledgerId} AND o.user_id = ${targetUserId}
                AND o.side = 'buy'
              ORDER BY o.created_at DESC
              LIMIT 100`
        ) as any;
        const allOrders = ((rows[0] || rows) as any[]);
        
        const list = allOrders.map((r: any) => ({
          id: r.id,
          coin: r.coin,
          side: 'buy' as const,
          limitPrice: r.limit_price,
          originalLimitPrice: r.original_limit_price || r.limit_price,
          amount: r.amount,
          quantity: r.quantity,
          status: r.status,
          orderType: r.order_type || '',
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          isGift: !!r.is_gift,
          giftMultiplier: r.gift_multiplier || '',
          sourceOrderId: r.source_order_id || null,
          sourceUsername: r.source_username || '',
          sourceAmount: r.source_amount || '',
          // 卖出字段（订单合并模型）
          sellPrice: r.sell_price || null,
          sellQuantity: r.sell_quantity || null,
          sellAt: r.sell_at || null,
          sellConfirmedAt: r.sell_confirmed_at || null,
          sellStatus: r.sell_status || null,
          // 兼容旧字段：是否已在委托卖中
          hasPendingSell: r.sell_status === 'selling',
        }));
        return list;
      }),
    // AF 查询可卖数量（已成交买入的币种数量总和）
    afGetAvailableSell: protectedProcedure
      .input(z.object({ ledgerId: z.number(), coin: z.string(), viewAsUserId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        
        const db = await getLedgerDb();
        // 视角切换
        let targetUserId = ctx.user.id;
        if (input.viewAsUserId) {
          const memberCheck = await db.execute(
            sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
          ) as any;
          const myRole = (memberCheck as any)[0]?.[0]?.role || (memberCheck as any)[0]?.role;
          if (myRole === 'owner' || myRole === 'admin') {
            targetUserId = input.viewAsUserId;
          }
        }
        // 已成交买入的数量总和（未卖出的 + 委托卖中的）
        const buyRows = await db.execute(
          sql`SELECT COALESCE(SUM(CAST(quantity AS DECIMAL(28,8))), 0) as total
              FROM af_orders
              WHERE ledger_id = ${input.ledgerId} AND user_id = ${targetUserId}
                AND coin = ${input.coin} AND side = 'buy' AND status = 'completed'
                AND (sell_status IS NULL OR sell_status = '' OR sell_status = 'sell_cancelled')`
        ) as any;
        const available = parseFloat((buyRows[0]?.[0]?.total ?? buyRows[0]?.total ?? '0').toString());
        return { coin: input.coin, available };
      }),
    // 管理员：查询该账本所有用户的所有订单
    afAdminGetOrders: protectedProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ ctx, input }) => {
        
        const db = await getLedgerDb();
        // 验证是否是 owner 或 admin
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0]?.role ?? roleRows[0]?.role ?? '');
        if (role !== 'owner' && role !== 'admin') throw new Error('无权限');
        const rows = await db.execute(
          sql`SELECT o.id, o.user_id, o.coin, o.side, o.limit_price, o.amount, o.quantity, o.status, COALESCE(o.order_type,'') as order_type, o.created_at, o.updated_at,
                     u.username, COALESCE(u.name,'') as user_name,
                     COALESCE(o.is_gift, 0) as is_gift, COALESCE(o.gift_multiplier, '') as gift_multiplier,
                     o.source_order_id, o.source_user_id,
                     COALESCE(o.original_limit_price, o.limit_price) as original_limit_price,
                     COALESCE(o.source_amount, '') as source_amount,
                     COALESCE(su.username, '') as source_username,
                     o.sell_price, o.sell_quantity, o.sell_at, o.sell_confirmed_at, o.sell_status
              FROM af_orders o
              LEFT JOIN users u ON u.id = o.user_id
              LEFT JOIN users su ON su.id = o.source_user_id
              WHERE o.ledger_id = ${input.ledgerId}
              ORDER BY o.created_at DESC
              LIMIT 500`
        ) as any;
        const list = ((rows[0] || rows) as any[]).map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          username: r.username || '',
          nickname: r.user_name || r.username || '',
          coin: r.coin,
          side: r.side,
          limitPrice: r.limit_price,
          originalLimitPrice: r.original_limit_price || r.limit_price,
          amount: r.amount,
          quantity: r.quantity,
          status: r.status,
          orderType: r.order_type || '',
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          isGift: !!r.is_gift,
          giftMultiplier: r.gift_multiplier || '',
          sourceOrderId: r.source_order_id || null,
          sourceUsername: r.source_username || '',
          sourceAmount: r.source_amount || '',
          // 卖出字段（订单合并模型）
          sellPrice: r.sell_price || null,
          sellQuantity: r.sell_quantity || null,
          sellAt: r.sell_at || null,
          sellConfirmedAt: r.sell_confirmed_at || null,
          sellStatus: r.sell_status || null,
          equityTier: 0,
        }));
        
        // 为每个买单查询权益折扣档位
        for (const order of list) {
          if (order.side === 'buy') {
            const tierRows = await db.execute(
              sql`SELECT COALESCE(MAX(tier), 0) as maxTier FROM af_order_tier_triggers WHERE order_id = ${order.id}`
            ) as any;
            const maxTier = parseInt((tierRows[0]?.[0]?.maxTier ?? tierRows[0]?.maxTier ?? '0').toString()) || 0;
            order.equityTier = maxTier;
          }
        }
        
        return list;
      }),
    // 管理员：订单和管理费统计
    afAdminGetStats: protectedProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        // 权限控制：只有账本创建者/拥有者才能查看
        const ledgerResult = await db.execute(
          sql`SELECT createdBy, ownerId FROM ledgers WHERE id = ${input.ledgerId} LIMIT 1`
        ) as any;
        const rows = (ledgerResult as any)[0] || ledgerResult;
        const row = Array.isArray(rows) ? rows[0] : null;
        const createdBy = Number(row?.createdBy ?? 0);
        const ownerId = Number(row?.ownerId ?? 0);
        const currentUserId = Number(ctx.user.id);
        console.log('[afAdminGetStats] 权限检查:', { currentUserId, createdBy, ownerId, rawRow: row });
        if (currentUserId !== createdBy && currentUserId !== ownerId) {
          console.log('[afAdminGetStats] 无权限，返回authorized:false');
          return { authorized: false, orders: null, fees: null };
        }
        console.log('[afAdminGetStats] 权限通过');

        // 1. 订单统计：普通订单数 + 赠送订单数（只统计买单）
        const orderStatsRows = await db.execute(
          sql`SELECT 
                SUM(CASE WHEN side='buy' AND COALESCE(is_gift,0)=0 THEN 1 ELSE 0 END) as normalCount,
                SUM(CASE WHEN side='buy' AND COALESCE(is_gift,0)=1 THEN 1 ELSE 0 END) as giftCount,
                SUM(CASE WHEN side='buy' THEN 1 ELSE 0 END) as totalCount
              FROM af_orders WHERE ledger_id = ${input.ledgerId}`
        ) as any;
        const os = (orderStatsRows[0]?.[0] ?? orderStatsRows[0] ?? {});
        const normalCount = parseInt(os.normalCount || '0') || 0;
        const giftCount = parseInt(os.giftCount || '0') || 0;
        const totalCount = parseInt(os.totalCount || '0') || 0;

        // 2. 管理费统计：查询所有买单，根据状态计算
        //    公式：订单金额 ÷ 0.75 × 0.12 ÷ 365 × 持有天数
        //    进行中 = 已成交且未卖出的买单（status='completed' 且没有对应卖单已成交）
        //    已结清 = 已卖出的买单（对应卖单status='completed'）
        const buyOrderRows = await db.execute(
          sql`SELECT o.id, o.amount, o.status, o.updated_at, o.created_at,
                     COALESCE(o.is_gift, 0) as is_gift,
                     COALESCE(o.gift_multiplier, '5.25') as gift_multiplier,
                     COALESCE(o.sell_status, '') as sell_status_val,
                     o.sell_confirmed_at
              FROM af_orders o
              WHERE o.ledger_id = ${input.ledgerId} AND o.side = 'buy' AND o.status = 'completed'`
        ) as any;
        const buyOrders = ((buyOrderRows[0] || buyOrderRows) as any[]);

        let ongoingFee = 0;   // 进行中管理费
        let settledFee = 0;   // 已结清管理费
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        for (const bo of buyOrders) {
          const amount = parseFloat(bo.amount || '0');
          if (amount <= 0) continue;
          // 成交价値 = 普通订单用 amount×5.25，赠送订单用 amount（已是市値）
          const isGift = parseInt(bo.is_gift || '0') === 1;
          const tradeValue = isGift ? amount : amount * 5.25;
          const dailyFee = tradeValue / 0.75 * 0.12 / 365;
          const confirmedDate = bo.updated_at ? new Date(bo.updated_at) : new Date(bo.created_at);
          const confirmedDay = new Date(confirmedDate.getFullYear(), confirmedDate.getMonth(), confirmedDate.getDate());

          if (bo.sell_status_val === 'sold') {
            // 已结清：从确认日到卖出确认日
            const sellConfirmedDate = bo.sell_confirmed_at ? new Date(bo.sell_confirmed_at) : now;
            const sellDay = new Date(sellConfirmedDate.getFullYear(), sellConfirmedDate.getMonth(), sellConfirmedDate.getDate());
            const holdDays = Math.max(1, Math.floor((sellDay.getTime() - confirmedDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            settledFee += dailyFee * holdDays;
          } else {
            // 进行中：从确认日到今天
            const holdDays = Math.max(1, Math.floor((todayStart.getTime() - confirmedDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            ongoingFee += dailyFee * holdDays;
          }
        }

        const totalFee = ongoingFee + settledFee;

        return {
          authorized: true,
          orders: { normalCount, giftCount, totalCount },
          fees: { ongoingFee: +ongoingFee.toFixed(4), settledFee: +settledFee.toFixed(4), totalFee: +totalFee.toFixed(4) },
        };
      }),
    // 管理员：查询买单的扣档记录（包含触发时间、价格、第几次扫描）
    afAdminGetTierHistory: protectedProcedure
      .input(z.object({ ledgerId: z.number(), orderId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0]?.role ?? roleRows[0]?.role ?? '');
        if (role !== 'owner' && role !== 'admin') throw new Error('无权限');

        // 先获取该订单的 coin 和买入时间
        const orderInfoRows = await db.execute(
          sql`SELECT coin, created_at, updated_at, status FROM af_orders WHERE id = ${input.orderId} LIMIT 1`
        ) as any;
        const orderInfo = (orderInfoRows[0]?.[0] ?? orderInfoRows[0]);
        const coin = orderInfo?.coin ?? '';
        // 买入成交时间（status=completed 时 updated_at，否则 created_at）
        const buyConfirmedAt = orderInfo?.updated_at || orderInfo?.created_at;

        // 查询扣档记录
        const tierRows = await db.execute(
          sql`SELECT t.id, t.tier, t.trigger_price, t.triggered_at, t.buy_price,
                     (
                       SELECT COUNT(*) FROM af_price_scan_logs s
                       WHERE s.coin = ${coin}
                       AND s.scanned_at <= t.triggered_at
                     ) as scan_count
              FROM af_order_tier_triggers t
              WHERE t.order_id = ${input.orderId}
              ORDER BY t.tier ASC`
        ) as any;
        const list = ((tierRows[0] || tierRows) as any[]).map((r: any) => ({
          tier: r.tier,
          triggerPrice: r.trigger_price,
          triggeredAt: r.triggered_at,
          buyPrice: r.buy_price,
          scanCount: Number(r.scan_count || 0),
        }));

        // 查询历史最低扫描价（买入成交后的所有扫描中最低的那一次）
        let lowestScan: { price: string; scannedAt: any; scanCount: number } | null = null;
        if (coin) {
          // 根据是否有买入时间选择不同的查询
          const lowestRows = buyConfirmedAt
            ? await db.execute(
                sql`SELECT s.low_price, s.scanned_at,
                           (
                             SELECT COUNT(*) FROM af_price_scan_logs s2
                             WHERE s2.coin = ${coin}
                             AND s2.scanned_at <= s.scanned_at
                           ) as scan_count
                    FROM af_price_scan_logs s
                    WHERE s.coin = ${coin}
                    AND s.scanned_at >= ${buyConfirmedAt}
                    ORDER BY s.low_price ASC
                    LIMIT 1`
              ) as any
            : await db.execute(
                sql`SELECT s.low_price, s.scanned_at,
                           (
                             SELECT COUNT(*) FROM af_price_scan_logs s2
                             WHERE s2.coin = ${coin}
                             AND s2.scanned_at <= s.scanned_at
                           ) as scan_count
                    FROM af_price_scan_logs s
                    WHERE s.coin = ${coin}
                    ORDER BY s.low_price ASC
                    LIMIT 1`
              ) as any;
          const lr = (lowestRows[0]?.[0] ?? lowestRows[0]);
          if (lr) {
            lowestScan = {
              price: lr.low_price,
              scannedAt: lr.scanned_at,
              scanCount: Number(lr.scan_count || 0),
            };
          }
        }

        return { list, lowestScan };
      }),
    // 管理员：修改订单参数和状态（含余额联动）
    afAdminUpdateOrder: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        orderId: z.number(),
        // 可修改字段
        limitPrice: z.string().optional(),
        amount: z.string().optional(),
        quantity: z.string().optional(),
        status: z.enum(['pending', 'completed', 'cancelled']).optional(),
        // 新增：确认卖出成交
        sellStatus: z.enum(['sold', 'sell_cancelled']).optional(),
        sellPrice: z.string().optional(), // 实际卖出成交价
      }))
      .mutation(async ({ ctx, input }) => {
        
        const db = await getLedgerDb();
        // 验证是否是 owner 或 admin
        const roleRows = await db.execute(
         sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0]?.role ?? roleRows[0]?.role ?? '');
        if (role !== 'owner' && role !== 'admin') throw new Error('无权限');
        // 查询原始订单信息
        const orderRows = await db.execute(
          sql`SELECT id, user_id, coin, side, limit_price, amount, quantity, status, is_gift, source_order_id, sell_status, sell_price FROM af_orders WHERE id = ${input.orderId} AND ledger_id = ${input.ledgerId} LIMIT 1`
        ) as any;
        const order = (orderRows[0]?.[0] ?? orderRows[0]);
        if (!order) throw new Error('订单不存在');
        const oldStatus = order.status;
        const oldAmount = parseFloat(order.amount || '0');
        const newAmount = input.amount ? parseFloat(input.amount) : oldAmount;
        const newStatus = input.status || oldStatus;
        const userId = order.user_id;
        const coin = order.coin;
        const side = order.side;
        
        let balanceAdjust = 0;
        let balanceNote = '';
        
        // ========== 卖出成交处理（订单合并模型） ==========
        if (input.sellStatus === 'sold' && order.sell_status === 'selling') {
          // 确认卖出成交：从同一订单取买入信息
          const actualSellPrice = input.sellPrice ? parseFloat(input.sellPrice) : parseFloat(order.sell_price || '0');
          const principal = oldAmount; // 买入本金
          const buyPrice = parseFloat(order.limit_price || '0');
          const originalQty = parseFloat(order.quantity || '0');
          
          // 查询收益权最高档位
          const tierRows = await db.execute(
            sql`SELECT COALESCE(MAX(tier), 0) as maxTier FROM af_order_tier_triggers WHERE order_id = ${input.orderId}`
          ) as any;
          const maxTier = parseInt((tierRows[0]?.[0]?.maxTier ?? tierRows[0]?.maxTier ?? '0').toString()) || 0;
          
          const equityDiscountRates: Record<number, number> = {
            0: 1.0, 1: 0.6667, 2: 0.4444, 3: 0.3333, 4: 0.2667,
            5: 0.2222, 6: 0.1905, 7: 0.1667, 8: 0.1481, 9: 0.1333,
          };
          const discountRate = equityDiscountRates[maxTier] || 1.0;
          const effectiveQty = originalQty * discountRate;
          let profit = 0;
          if (actualSellPrice > 0 && buyPrice > 0) {
            profit = effectiveQty * (actualSellPrice - buyPrice);
          }
          console.log(`[AF卖出成交] 订单#${input.orderId}: 本金=${principal}, 买入价=${buyPrice}, 卖出价=${actualSellPrice}, 原始币数=${originalQty}, 最高档位=${maxTier}, 有效币数=${effectiveQty.toFixed(8)}, 收益=${profit.toFixed(4)}`);
          
          // 计算累计管理费
          const confirmedDate = order.updated_at ? new Date(order.updated_at) : new Date(order.created_at);
          const confirmedDay = new Date(confirmedDate.getFullYear(), confirmedDate.getMonth(), confirmedDate.getDate());
          const todayNow = new Date();
          const todayDay = new Date(todayNow.getFullYear(), todayNow.getMonth(), todayNow.getDate());
          const holdDays = Math.max(1, Math.floor((todayDay.getTime() - confirmedDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
          const isGift = parseInt(order.is_gift || '0') === 1;
          const tradeValue = isGift ? principal : principal * 5.25;
          const dailyFee = tradeValue / 0.75 * 0.12 / 365;
          const managementFee = dailyFee * holdDays;
          console.log(`[AF卖出成交] 管理费: 本金=${principal}, 成交价值=${tradeValue.toFixed(2)}, 持有天数=${holdDays}, 累计管理费=${managementFee.toFixed(4)}`);
          
          const grossReturn = principal + Math.max(0, profit);
          balanceAdjust = Math.max(0, grossReturn - managementFee);
          balanceNote = `卖出成交 ${coin} 本金${principal.toFixed(2)}+收益${Math.max(0, profit).toFixed(4)}-管理费${managementFee.toFixed(4)} USDT`;
          
          if (Math.abs(balanceAdjust) > 0.001) {
            await db.execute(
              sql`INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
                  VALUES (${input.ledgerId}, ${userId}, ${balanceAdjust}, ${balanceNote}, NOW(), NOW())`
            );
          }
          // 更新卖出状态
          const sellPriceUpdate = input.sellPrice ? `, sell_price = '${input.sellPrice.replace(/'/g, '')}'` : '';
          await db.execute(
            sql`UPDATE af_orders SET sell_status = 'sold', sell_confirmed_at = NOW()${sql.raw(sellPriceUpdate)}, updated_at = NOW()
                WHERE id = ${input.orderId} AND ledger_id = ${input.ledgerId}`
          );
          return { success: true };
        }
        
        // ========== 管理员撤销卖出 ==========
        if (input.sellStatus === 'sell_cancelled' && order.sell_status === 'selling') {
          await db.execute(
            sql`UPDATE af_orders SET sell_price = NULL, sell_quantity = NULL, sell_at = NULL, sell_status = 'sell_cancelled', updated_at = NOW()
                WHERE id = ${input.orderId} AND ledger_id = ${input.ledgerId}`
          );
          return { success: true };
        }
        
        // ========== 原有买单状态处理 ==========
        // 1. 状态变化：待定→已成交
        if (oldStatus === 'pending' && newStatus === 'completed') {
          // 委买成交：买入时已扣了余额，无需额外操作
        }
        // 2. 状态变化：待定→已撤单
        if (oldStatus === 'pending' && newStatus === 'cancelled') {
          // 委买撤单：退回已扣除的金额
          balanceAdjust = oldAmount;
          balanceNote = `撤单退回 委买 ${coin} ${oldAmount} USDT`;
        }
        // 3. 金额参数修改（仅当状态为 pending 时）
        if (input.amount && newStatus === 'pending' && Math.abs(newAmount - oldAmount) > 0.001) {
          const diff = newAmount - oldAmount;
          balanceAdjust += -diff;
          balanceNote = `订单调整 委买 ${coin} 金额 ${oldAmount} -> ${newAmount} USDT`;
        }
        // 执行余额调整
        if (Math.abs(balanceAdjust) > 0.001) {
          await db.execute(
            sql`INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
                VALUES (${input.ledgerId}, ${userId}, ${balanceAdjust}, ${balanceNote || '订单调整'}, NOW(), NOW())`
          );
        }
        // 构建动态 UPDATE
        const updates: string[] = [];
        if (input.limitPrice !== undefined) {
          updates.push(`limit_price = '${input.limitPrice.replace(/'/g, '')}' `);
          const newPrice = parseFloat(input.limitPrice);
          if (!isNaN(newPrice) && newPrice > 0) {
            const recalcQty = (oldAmount * 5.25 / newPrice).toFixed(8);
            updates.push(`quantity = '${recalcQty}'`);
          }
        } else if (input.quantity !== undefined) {
          updates.push(`quantity = '${input.quantity.replace(/'/g, '')}'`);
        }
        if (input.status !== undefined) updates.push(`status = '${input.status}'`);
        if (updates.length > 0) {
          await db.execute(
            sql`UPDATE af_orders SET ${sql.raw(updates.join(', '))}, updated_at = NOW() WHERE id = ${input.orderId} AND ledger_id = ${input.ledgerId}`
          );
        }
        // 如果订单变为已成交，立即触发一次扫描（不等四小时）
        if (newStatus === 'completed' && oldStatus !== 'completed' && order.side === 'buy') {
          // 异步触发，不阻塞当前请求
          setTimeout(async () => {
            try {
              const { triggerImmediateScan } = await import('./af-tier-scanner');
              triggerImmediateScan(input.orderId);
            } catch (e) {
              console.error('[AF扫描] 立即扫描失败:', e);
            }
          }, 500);
        }
        // ========== 拨比赠送订单逻辑（新版：无限代，手动设置拨比）==========
        // 当买入订单从 pending 变为 completed，且不是赠送订单本身
        // 按照 af_payout_ratios 表中该下单人的所有上级拨比配置，生成对应的赠予订单
        if (newStatus === 'completed' && oldStatus !== 'completed' && order.side === 'buy' && !order.is_gift) {
          setTimeout(async () => {
            try {
              const giftDb = await getLedgerDb();
              // 确保 af_payout_ratios 表存在
              await giftDb.execute(sql`
                CREATE TABLE IF NOT EXISTS af_payout_ratios (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  ledger_id INT NOT NULL,
                  beneficiary_user_id INT NOT NULL COMMENT '受益人（上级）的用户ID',
                  source_user_id INT NOT NULL COMMENT '下单人（下级）的用户ID',
                  ratio DECIMAL(5,2) NOT NULL COMMENT '拨比百分比，如20.00表示20%',
                  created_at DATETIME DEFAULT NOW(),
                  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
                  UNIQUE KEY uq_payout (ledger_id, beneficiary_user_id, source_user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
              `);
              
              // 重新读取订单数据（管理员可能已修改价格/金额/数量，必须用更新后的值）
              const updatedOrderRows = await giftDb.execute(
                sql`SELECT id, user_id, coin, side, limit_price, amount, quantity FROM af_orders WHERE id = ${input.orderId} AND ledger_id = ${input.ledgerId} LIMIT 1`
              ) as any;
              const updatedOrder = (updatedOrderRows[0]?.[0] ?? updatedOrderRows[0]);
              if (!updatedOrder) { console.error('[AF拨比赠送] 重新读取订单失败'); return; }
              
              const actualSpend = parseFloat(updatedOrder.amount || '0');
              const actualPrice = parseFloat(updatedOrder.limit_price || '0');
              
              // 查询该订单的权益档位（tier）
              const tierRows2 = await giftDb.execute(
                sql`SELECT COALESCE(MAX(tier), 0) as maxTier FROM af_order_tier_triggers WHERE order_id = ${input.orderId}`
              ) as any;
              const equityTier = parseInt((tierRows2[0]?.[0]?.maxTier ?? tierRows2[0]?.maxTier ?? '0').toString()) || 0;
              
              // 权益系数：第0档 × 0.75，第1档 ÷ 2，第2档 ÷ 3，以此类推
              const equityCoeff = equityTier === 0 ? 0.75 : 1 / (equityTier + 1);
              
              // 赠予基数 = 实际投入 × 10 × 权益系数 × 0.3
              const baseGiftAmount = actualSpend * 10 * equityCoeff * 0.3;
              
              // 查询该下单人（userId）在该账本的所有拨比配置
              const ratioRows = await giftDb.execute(
                sql`SELECT beneficiary_user_id, ratio FROM af_payout_ratios WHERE ledger_id = ${input.ledgerId} AND source_user_id = ${userId}`
              ) as any;
              const ratios: Array<{ beneficiary_user_id: number; ratio: string }> = 
                ((ratioRows[0] || ratioRows) as any[]).filter((r: any) => r && r.beneficiary_user_id);
              
              if (ratios.length === 0) {
                console.log(`[AF拨比赠送] 订单#${input.orderId} 下单人(${userId})未配置拨比，跳过赠予`);
                return;
              }
              
              // 验证拨比总和是否为100%（允许±0.1的误差）
              const totalRatio = ratios.reduce((sum: number, r: any) => sum + parseFloat(r.ratio), 0);
              if (Math.abs(totalRatio - 100) > 0.1) {
                console.warn(`[AF拨比赠送] 订单#${input.orderId} 下单人(${userId})拨比总和=${totalRatio}%，不等于100%，仍按比例生成`);
              }
              
              // 为每个受益人生成赠予订单
              for (const r of ratios) {
                const ratio = parseFloat(r.ratio) / 100;
                const giftAmount = (baseGiftAmount * ratio).toFixed(8);
                const giftQuantity = actualPrice > 0 ? (parseFloat(giftAmount) / actualPrice).toFixed(8) : '0';
                await giftDb.execute(
                  sql`INSERT INTO af_orders (ledger_id, user_id, coin, side, limit_price, amount, quantity, status, is_gift, gift_multiplier, source_order_id, source_user_id, source_amount, created_at, updated_at)
                      VALUES (${input.ledgerId}, ${r.beneficiary_user_id}, ${updatedOrder.coin}, 'buy', ${updatedOrder.limit_price}, ${giftAmount}, ${giftQuantity}, 'completed', 1, ${String(ratio.toFixed(4))}, ${input.orderId}, ${userId}, ${actualSpend.toFixed(8)}, NOW(), NOW())`
                );
                console.log(`[AF拨比赠送] 订单#${input.orderId} 下单人(${userId}) → 受益人(${r.beneficiary_user_id}) 拨比${r.ratio}% 赠予金额:${giftAmount}`);
              }
            } catch (e) {
              console.error('[AF拨比赠送] 生成赠送订单失败:', e);
            }
          }, 200);
        }
        return { success: true };
      }),
    // AF 用户自助撤单（委托买撤单 或 委托卖撤单）
    afCancelOrder: protectedProcedure
      .input(z.object({ ledgerId: z.number(), orderId: z.number(), cancelType: z.enum(['buy', 'sell']).optional() }))
      .mutation(async ({ ctx, input }) => {
        
        const db = await getLedgerDb();
        const orderRows = await db.execute(
          sql`SELECT id, user_id, coin, side, amount, status, sell_status FROM af_orders
              WHERE id = ${input.orderId} AND ledger_id = ${input.ledgerId} AND user_id = ${ctx.user.id} LIMIT 1`
        ) as any;
        const order = (orderRows[0]?.[0] ?? orderRows[0]);
        if (!order) throw new Error('订单不存在');
        
        const cancelType = input.cancelType || (order.sell_status === 'selling' ? 'sell' : 'buy');
        
        if (cancelType === 'sell') {
          // 撤销委托卖出：清空卖出字段，回到已成交状态
          if (order.sell_status !== 'selling') throw new Error('该订单未在委托卖出中');
          await db.execute(
            sql`UPDATE af_orders SET
                sell_price = NULL, sell_quantity = NULL, sell_at = NULL,
                sell_status = 'sell_cancelled',
                updated_at = NOW()
                WHERE id = ${input.orderId} AND ledger_id = ${input.ledgerId}`
          );
          console.log(`[afCancelOrder] 撤销委托卖出: 订单#${input.orderId}`);
          // 委托卖出时没动余额，撤销也不需要动余额
          return { success: true };
        }
        
        // 撤销委托买入
        if (order.status !== 'pending') throw new Error('只有委托中的订单才能撤单');
        const amount = parseFloat(order.amount || '0');
        // 买单撤单：退回冻结金额
        if (amount > 0.001) {
          await db.execute(
            sql`INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
                VALUES (${input.ledgerId}, ${ctx.user.id}, ${amount}, ${`用户撤单 委买 ${order.coin} ${amount} USDT`}, NOW(), NOW())`
          );
        }
        await db.execute(
          sql`UPDATE af_orders SET status = 'cancelled', updated_at = NOW()
              WHERE id = ${input.orderId} AND ledger_id = ${input.ledgerId} AND user_id = ${ctx.user.id}`
        );
        return { success: true };
      }),
    // AF 查询订单的收益权档位触发记录 + 扫描状态
    afGetTierData: protectedProcedure
      .input(z.object({ orderId: z.number(), ledgerId: z.number(), viewAsUserId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        
        const db = await getLedgerDb();
        // 支持 viewAs 视角切换（管理员可查看其他用户的订单）
        let targetUserId = ctx.user.id;
        if (input.viewAsUserId) {
          const roleRows = await db.execute(
            sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
          ) as any;
          const myRole = (roleRows[0]?.[0]?.role ?? roleRows[0]?.role ?? '');
          if (myRole === 'owner' || myRole === 'admin') {
            targetUserId = input.viewAsUserId;
          }
        }
        // 验证订单属于目标用户
        const orderRows = await db.execute(
          sql`SELECT id, coin, limit_price, status FROM af_orders
              WHERE id = ${input.orderId} AND ledger_id = ${input.ledgerId} AND user_id = ${targetUserId} LIMIT 1`
        ) as any;
        const order = (orderRows[0]?.[0] ?? orderRows[0]);
        if (!order) return { triggers: [], scanStatus: null, latestLowPrice: null, scanCount: 0, allTimeLowPrice: null, allTimeLowAt: null };

        // 查询该订单的所有档位触发记录
        const triggerRows = await db.execute(
          sql`SELECT tier, trigger_price, triggered_at FROM af_order_tier_triggers
              WHERE order_id = ${input.orderId}
              ORDER BY tier ASC`
        ) as any;
        const triggers: Array<{ tier: number; triggerPrice: string; triggeredAt: string }> =
          ((triggerRows[0] || triggerRows) as any[]).map((r: any) => ({
            tier: r.tier,
            triggerPrice: r.trigger_price,
            triggeredAt: r.triggered_at
          }));

        // 并行查询：扫描统计表 + 最近一次扫描日志
        const [statsRows, scanRows] = await Promise.all([
          db.execute(
            sql`SELECT scan_count, last_scan_at, last_low_price, all_time_low_price, all_time_low_at
                FROM af_order_scan_stats WHERE order_id = ${input.orderId} LIMIT 1`
          ) as any,
          db.execute(
            sql`SELECT low_price, scanned_at FROM af_price_scan_logs
                WHERE coin = ${order.coin}
                ORDER BY scanned_at DESC LIMIT 1`
          ) as any,
        ]);
        const scanStats = (statsRows[0]?.[0] ?? statsRows[0]) || null;
        const lastScan = (scanRows[0]?.[0] ?? scanRows[0]) || null;

        // 从全局内存状态获取扫描信息
        const { getScanStatus } = await import('./af-tier-scanner');
        const coinStatus = getScanStatus(order.coin);

        return {
          triggers,
          buyPrice: order.limit_price,
          coin: order.coin,
          scanStatus: {
            lastScanAt: coinStatus?.lastScanAt || (scanStats?.last_scan_at ? new Date(scanStats.last_scan_at).toISOString() : lastScan?.scanned_at ? new Date(lastScan.scanned_at).toISOString() : null),
            lowestPrice: coinStatus?.lowestPrice || scanStats?.last_low_price || lastScan?.low_price || null,
            scanning: coinStatus?.scanning || false,
          },
          latestLowPrice: scanStats?.last_low_price ?? lastScan?.low_price ?? null,
          // 新增字段
          scanCount: scanStats?.scan_count ?? 0,
          allTimeLowPrice: scanStats?.all_time_low_price ?? null,
          allTimeLowAt: scanStats?.all_time_low_at ? new Date(scanStats.all_time_low_at).toISOString() : null,
        };
      }),
    // OKX 行情代理（国内服务器可访问，替代 Binance）
    getBinanceTicker: publicProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        const cacheKey = `ticker:${input.symbol}`;
        const cached = getCache(cacheKey);
        if (cached) return cached;
        // BTCUSDT -> BTC-USDT
        const instId = input.symbol.replace(/^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE)(USDT)$/, '$1-$2');
        // 先尝试火币（国内最稳定），失败则用 OKX
        try {
          const sym = input.symbol.toLowerCase();
          const r = await fetch(`https://api.huobi.pro/market/detail/merged?symbol=${sym}`, { signal: AbortSignal.timeout(5000) });
          if (r.ok) {
            const j: any = await r.json();
            if (j.status === 'ok' && j.tick) {
              const t = j.tick;
              const last = t.close;
              const open = t.open;
              const pct = open ? (((last - open) / open) * 100).toFixed(4) : '0';
              const r1 = { symbol: input.symbol, lastPrice: String(last), priceChangePercent: pct, highPrice: String(t.high), lowPrice: String(t.low), volume: String(t.amount), weightedAvgPrice: String(last), openPrice: String(open) };
              setCache(cacheKey, r1); return r1;
            }
          }
        } catch {}
        // 备用：OKX
        const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('行情数据获取失败');
        const json: any = await res.json();
        if (json.code !== '0' || !json.data?.[0]) throw new Error('行情数据获取失败');
        const d = json.data[0];
        const r2 = { symbol: input.symbol, lastPrice: d.last, priceChangePercent: d.open24h && d.last ? (((parseFloat(d.last) - parseFloat(d.open24h)) / parseFloat(d.open24h)) * 100).toFixed(4) : '0', highPrice: d.high24h, lowPrice: d.low24h, volume: d.vol24h, weightedAvgPrice: d.last, openPrice: d.open24h };
        setCache(cacheKey, r2); return r2;
      }),
    // ========== 实时盈亏计算 API ==========
    afGetPnlSummary: protectedProcedure
      .input(z.object({ ledgerId: z.number(), viewAsUserId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { getLatestPrice } = await import('./price-scanner');
        const db = await getLedgerDb();
        // 代看视角时查目标用户的订单，否则查自己的
        const targetUserId = input.viewAsUserId || ctx.user.id;
        // 查询目标用户所有买单（委托中 + 已成交 + 委卖中 + 已卖出，不含已撤销）
        const orderRows = await db.execute(
          sql`SELECT o.id, o.coin, o.limit_price, o.quantity, o.amount, o.status, o.sell_status, o.sell_price, o.is_gift
              FROM af_orders o
              WHERE o.ledger_id = ${input.ledgerId} AND o.user_id = ${targetUserId}
                AND o.side = 'buy' AND o.status IN ('pending', 'completed')
                AND (o.order_type = '无损合约' OR o.order_type IS NULL OR o.order_type = '')`
        ) as any;
        const orders = ((orderRows[0] || orderRows) as any[]);
        if (!orders || orders.length === 0) {
          return { coins: [], total: 0, prices: {} as Record<string, number> };
        }
        // 查询每个订单的最高档位
        const orderIds = orders.map((o: any) => o.id);
        const tierRows = await db.execute(
          sql`SELECT order_id, COALESCE(MAX(tier), 0) as maxTier FROM af_order_tier_triggers WHERE order_id IN (${sql.join(orderIds.map((id: number) => sql`${id}`), sql`,`)}) GROUP BY order_id`
        ) as any;
        const tierMap: Record<number, number> = {};
        for (const r of ((tierRows[0] || tierRows) as any[])) {
          tierMap[r.order_id] = parseInt(r.maxTier?.toString() || '0') || 0;
        }
        // 收益权折扣率
        const equityDiscountRates: Record<number, number> = {
          0: 1.0, 1: 0.6667, 2: 0.4444, 3: 0.3333, 4: 0.2667,
          5: 0.2222, 6: 0.1905, 7: 0.1667, 8: 0.1481, 9: 0.1333,
        };
        // 获取实时价格
        const prices: Record<string, number> = {};
        for (const coin of ['BTC', 'ETH', 'SOL']) {
          const p = getLatestPrice(coin);
          if (p) prices[coin] = p;
        }
        // 按币种分组计算盈亏
        const coinPnl: Record<string, { pnl: number; orderCount: number; holdingCount: number; soldCount: number; pendingCount: number; totalCost: number; totalQty: number }> = {};
        for (const order of orders) {
          const coin = order.coin;
          if (!coinPnl[coin]) coinPnl[coin] = { pnl: 0, orderCount: 0, holdingCount: 0, soldCount: 0, pendingCount: 0, totalCost: 0, totalQty: 0 };
          coinPnl[coin].orderCount++;
          const buyPrice = parseFloat(order.limit_price || '0');
          const originalQty = parseFloat(order.quantity || '0');
          if (order.status === 'pending') {
            // 委托中订单：统计订单数和成本，但不参与盈亏计算
            coinPnl[coin].pendingCount++;
            if (buyPrice > 0 && originalQty > 0) {
              coinPnl[coin].totalCost += buyPrice * originalQty;
              coinPnl[coin].totalQty += originalQty;
            }
            continue;
          }
          const maxTier = tierMap[order.id] || 0;
          const discountRate = equityDiscountRates[maxTier] || 1.0;
          const effectiveQty = originalQty * discountRate;
          // 平均持仓成本：用原始数量和买入价，不含收益折扣（只统计未卖出的）
          if (order.sell_status !== 'sold' && buyPrice > 0 && originalQty > 0) {
            coinPnl[coin].totalCost += buyPrice * originalQty;
            coinPnl[coin].totalQty += originalQty;
          }
          if (order.sell_status === 'sold') {
            // 已卖出：用实际卖出价计算已实现盈亏
            const sellPrice = parseFloat(order.sell_price || '0');
            if (sellPrice > 0 && buyPrice > 0) {
              coinPnl[coin].pnl += effectiveQty * (sellPrice - buyPrice);
            }
            coinPnl[coin].soldCount++;
          } else {
            // 持仓中/委卖中：用实时价格计算浮动盈亏
            const currentPrice = prices[coin];
            if (currentPrice && buyPrice > 0) {
              coinPnl[coin].pnl += effectiveQty * (currentPrice - buyPrice);
            }
            coinPnl[coin].holdingCount++;
          }
        }
        // 汇总（负盈亏显示为0，只记正收益）
        const coins = Object.entries(coinPnl).map(([coin, data]) => ({
          coin,
          pnl: parseFloat(Math.max(0, data.pnl).toFixed(4)),
          orderCount: data.orderCount,
          holdingCount: data.holdingCount,
          soldCount: data.soldCount,
          pendingCount: data.pendingCount,
          avgCost: data.totalQty > 0 ? parseFloat((data.totalCost / data.totalQty).toFixed(2)) : 0,
        }));
        // 按 BTC > ETH > SOL 顺序排列
        const coinOrder = ['BTC', 'ETH', 'SOL'];
        coins.sort((a, b) => coinOrder.indexOf(a.coin) - coinOrder.indexOf(b.coin));
        const total = parseFloat(coins.reduce((sum, c) => sum + c.pnl, 0).toFixed(4));
        // 取最新价格扫描时间作为更新时间
        const { getAllLatestPrices } = await import('./price-scanner');
        const allPrices = getAllLatestPrices();
        let latestUpdatedAt: string | null = null;
        for (const v of Object.values(allPrices)) {
          if (!latestUpdatedAt || v.updatedAt > latestUpdatedAt) latestUpdatedAt = v.updatedAt;
        }
        return { coins, total, prices, updatedAt: latestUpdatedAt };
      }),

    // ===== AH 型定制账本（公司财务记账管理）=====
    createCustomAH: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可创建AH定制账本' });
        }
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: 'custom_ah',
          createdBy: ctx.user.id,
        });
        return ledger;
      }),
    listCustomAH: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可查看AH定制账本列表' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const rows = await db
          .select({
            id: ledgers.id,
            name: ledgers.name,
            description: ledgers.description,
            createdAt: ledgers.createdAt,
          })
          .from(ledgers)
          .where(eq(ledgers.type, 'custom_ah'))
          .orderBy(desc(ledgers.createdAt));
        return rows;
      }),
    inviteToCustomAH: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        username: z.string(),
        role: z.enum(['member', 'admin', 'client', 'employee']).optional().default('member'),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可邀请成员加入AH账本' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [ledger] = await db
          .select({ id: ledgers.id, type: ledgers.type })
          .from(ledgers)
          .where(eq(ledgers.id, input.ledgerId));
        if (!ledger || ledger.type !== 'custom_ah') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '该账本不是AH定制账本' });
        }
        return await dbLedger.inviteMemberByUsernameWithRole(input.ledgerId, ctx.user.id, input.username, input.role);
      }),

    // ========== AH 公司管理 API ==========
    // 创建公司（管理员/创建者）
    ahCreateCompany: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        name: z.string().min(1),
        contactName: z.string().optional(),
        contactPhone: z.string().optional(),
        taxId: z.string().optional(),
        address: z.string().optional(),
        note: z.string().optional(),
        clientUserId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 检查权限：必须是账本的owner或admin
        const ledgerDb = await getLedgerDb();
        const roleRows = await ledgerDb.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        );
        const userRole = (roleRows as any)?.[0]?.[0]?.role;
        if (userRole !== 'owner' && userRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅创建者或管理员可创建公司' });
        }
        const result = await db.insert(ahCompanies).values({
          ledgerId: input.ledgerId,
          name: input.name,
          contactName: input.contactName || null,
          contactPhone: input.contactPhone || null,
          taxId: input.taxId || null,
          address: input.address || null,
          note: input.note || null,
          clientUserId: input.clientUserId || null,
          createdBy: ctx.user.id,
        });
        // 自动创建当月的报税授权记录
        const now = new Date();
        const taxPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const dueMonth = now.getDate() >= 15 ? now.getMonth() + 2 : now.getMonth() + 1;
        const dueYear = dueMonth > 12 ? now.getFullYear() + 1 : now.getFullYear();
        const dueDate = `${dueYear}-${String(dueMonth > 12 ? dueMonth - 12 : dueMonth).padStart(2, '0')}-15`;
        const companyId = (result as any)[0]?.insertId;
        if (companyId) {
          await db.insert(ahTaxAuthorizations).values({
            ledgerId: input.ledgerId,
            companyId,
            taxPeriod,
            dueDate,
          });
        }
        return { success: true, companyId };
      }),

    // 获取公司列表（管理员看全部，客户只看自己关联的）
    ahListCompanies: protectedProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const ledgerDb = await getLedgerDb();
        const roleRows = await ledgerDb.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        );
        const userRole = (roleRows as any)?.[0]?.[0]?.role;
        if (!userRole) throw new TRPCError({ code: 'FORBIDDEN', message: '您不是该账本的成员' });
        
        let companies;
        if (userRole === 'owner' || userRole === 'admin' || userRole === 'member') {
          // 管理员和普通用户看全部公司
          companies = await db.select().from(ahCompanies)
            .where(eq(ahCompanies.ledgerId, input.ledgerId))
            .orderBy(desc(ahCompanies.createdAt));
        } else {
          // 客户和企业员工通过ah_company_members绑定关系查看
          const conn = await getDbConnection();
          const [rows] = await conn.execute(
            'SELECT DISTINCT c.* FROM ah_companies c INNER JOIN ah_company_members cm ON c.id = cm.company_id WHERE c.ledger_id = ? AND cm.user_id = ? ORDER BY c.created_at DESC',
            [input.ledgerId, ctx.user.id]
          );
          companies = rows as any[];
        }
        return companies;
      }),

    // 获取某公司的报税授权记录
    ahGetTaxAuthorizations: protectedProcedure
      .input(z.object({ ledgerId: z.number(), companyId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const ledgerDb = await getLedgerDb();
        const roleRows = await ledgerDb.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        );
        const userRole = (roleRows as any)?.[0]?.[0]?.role;
        if (!userRole) throw new TRPCError({ code: 'FORBIDDEN', message: '您不是该账本的成员' });
        
        let conditions = [eq(ahTaxAuthorizations.ledgerId, input.ledgerId)];
        if (input.companyId) {
          conditions.push(eq(ahTaxAuthorizations.companyId, input.companyId));
        }
        // 客户和企业员工只能看自己绑定公司的
        if (userRole === 'client' || userRole === 'employee') {
          const conn = await getDbConnection();
          const [companyRows] = await conn.execute(
            'SELECT DISTINCT company_id FROM ah_company_members WHERE user_id = ?',
            [ctx.user.id]
          );
          const myCompanyIds = (companyRows as any[]).map((r: any) => r.company_id);
          if (myCompanyIds.length === 0) return [];
          conditions.push(inArray(ahTaxAuthorizations.companyId, myCompanyIds));
        }
        
        const auths = await db.select().from(ahTaxAuthorizations)
          .where(and(...conditions))
          .orderBy(desc(ahTaxAuthorizations.dueDate));
        return auths;
      }),

    // 客户确认授权
    ahAuthorize: protectedProcedure
      .input(z.object({ ledgerId: z.number(), authId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 检查授权记录是否存在
        const [auth] = await db.select().from(ahTaxAuthorizations)
          .where(and(eq(ahTaxAuthorizations.id, input.authId), eq(ahTaxAuthorizations.ledgerId, input.ledgerId)));
        if (!auth) throw new TRPCError({ code: 'NOT_FOUND', message: '授权记录不存在' });
        if (auth.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: '该记录已授权或已过期' });
        // 检查是否是该公司关联的客户
        const [company] = await db.select().from(ahCompanies)
          .where(eq(ahCompanies.id, auth.companyId));
        if (!company || company.clientUserId !== ctx.user.id) {
          // 也允许管理员代为授权
          const ledgerDb = await getLedgerDb();
          const roleRows = await ledgerDb.execute(
            sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
          );
          const userRole = (roleRows as any)?.[0]?.[0]?.role;
          if (userRole !== 'owner' && userRole !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: '您无权授权该公司的报税' });
          }
        }
        await db.update(ahTaxAuthorizations)
          .set({ status: 'authorized', authorizedBy: ctx.user.id, authorizedAt: sql`NOW()` })
          .where(eq(ahTaxAuthorizations.id, input.authId));
        return { success: true, message: '授权成功' };
      }),

    // 管理员确认已申报
    ahMarkFiled: protectedProcedure
      .input(z.object({ ledgerId: z.number(), authId: z.number(), note: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const ledgerDb = await getLedgerDb();
        const roleRows = await ledgerDb.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        );
        const userRole = (roleRows as any)?.[0]?.[0]?.role;
        if (userRole !== 'owner' && userRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可标记已申报' });
        }
        const [auth] = await db.select().from(ahTaxAuthorizations)
          .where(and(eq(ahTaxAuthorizations.id, input.authId), eq(ahTaxAuthorizations.ledgerId, input.ledgerId)));
        if (!auth) throw new TRPCError({ code: 'NOT_FOUND', message: '授权记录不存在' });
        if (auth.status !== 'authorized') throw new TRPCError({ code: 'BAD_REQUEST', message: '该记录尚未授权，无法申报' });
        await db.update(ahTaxAuthorizations)
          .set({ status: 'filed', filedBy: ctx.user.id, filedAt: sql`NOW()`, filedNote: input.note || null })
          .where(eq(ahTaxAuthorizations.id, input.authId));
        return { success: true, message: '已标记为已申报' };
      }),

    // 管理员手动创建新一期报税授权（或自动创建下一期）
    ahCreateTaxAuth: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        companyId: z.number(),
        taxPeriod: z.string(), // 格式 "2026-03"
        dueDate: z.string(),   // 格式 "2026-04-15"
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const ledgerDb = await getLedgerDb();
        const roleRows = await ledgerDb.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        );
        const userRole = (roleRows as any)?.[0]?.[0]?.role;
        if (userRole !== 'owner' && userRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可创建报税授权' });
        }
        // 检查是否已存在同期记录
        const existing = await db.select().from(ahTaxAuthorizations)
          .where(and(
            eq(ahTaxAuthorizations.ledgerId, input.ledgerId),
            eq(ahTaxAuthorizations.companyId, input.companyId),
            eq(ahTaxAuthorizations.taxPeriod, input.taxPeriod)
          ));
        if (existing.length > 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `${input.taxPeriod} 期的报税授权已存在` });
        }
        await db.insert(ahTaxAuthorizations).values({
          ledgerId: input.ledgerId,
          companyId: input.companyId,
          taxPeriod: input.taxPeriod,
          dueDate: input.dueDate,
        });
        return { success: true };
      }),

    // 更新公司信息
    ahUpdateCompany: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        companyId: z.number(),
        name: z.string().optional(),
        contactName: z.string().optional(),
        contactPhone: z.string().optional(),
        taxId: z.string().optional(),
        address: z.string().optional(),
        note: z.string().optional(),
        clientUserId: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const ledgerDb = await getLedgerDb();
        const roleRows = await ledgerDb.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        );
        const userRole = (roleRows as any)?.[0]?.[0]?.role;
        if (userRole !== 'owner' && userRole !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可修改公司信息' });
        }
        const updates: any = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.contactName !== undefined) updates.contactName = input.contactName;
        if (input.contactPhone !== undefined) updates.contactPhone = input.contactPhone;
        if (input.taxId !== undefined) updates.taxId = input.taxId;
        if (input.address !== undefined) updates.address = input.address;
        if (input.note !== undefined) updates.note = input.note;
        if (input.clientUserId !== undefined) updates.clientUserId = input.clientUserId;
        if (Object.keys(updates).length === 0) return { success: true };
        await db.update(ahCompanies).set(updates)
          .where(and(eq(ahCompanies.id, input.companyId), eq(ahCompanies.ledgerId, input.ledgerId)));
        return { success: true };
      }),

    // ========== AH 公司人员管理 API ==========
    // 添加用户到公司
    ahAddCompanyMember: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        companyId: z.number(),
        userId: z.number(),
        role: z.enum(['client', 'employee']).default('client'),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        // 验证操作者是管理员
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        );
        const userRole = (roleRows as any)[0]?.[0]?.role;
        if (!['owner', 'admin'].includes(userRole)) throw new Error('无权操作');
        // 检查是否已绑定
        const existing = await db.select().from(ahCompanyMembers)
          .where(and(
            eq(ahCompanyMembers.companyId, input.companyId),
            eq(ahCompanyMembers.userId, input.userId),
            eq(ahCompanyMembers.status, 'active')
          )).limit(1);
        if (existing.length > 0) throw new Error('该用户已绑定到此公司');
        await db.insert(ahCompanyMembers).values({
          ledgerId: input.ledgerId,
          companyId: input.companyId,
          userId: input.userId,
          role: input.role,
          addedBy: ctx.user.id,
        });
        return { success: true };
      }),

    // 移除公司成员
    ahRemoveCompanyMember: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        memberId: z.number(), // ah_company_members表的id
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        );
        const userRole = (roleRows as any)[0]?.[0]?.role;
        if (!['owner', 'admin'].includes(userRole)) throw new Error('无权操作');
        await db.update(ahCompanyMembers).set({ status: 'inactive' })
          .where(and(eq(ahCompanyMembers.id, input.memberId), eq(ahCompanyMembers.ledgerId, input.ledgerId)));
        return { success: true };
      }),

    // 获取公司成员列表
    ahGetCompanyMembers: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        companyId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        const members = await db.select().from(ahCompanyMembers)
          .where(and(
            eq(ahCompanyMembers.companyId, input.companyId),
            eq(ahCompanyMembers.ledgerId, input.ledgerId),
            eq(ahCompanyMembers.status, 'active')
          ));
        // 获取用户名称
        if (members.length === 0) return [];
        const userIds = members.map(m => m.userId);
        const mainDb = await getDb();
        const userRows = await mainDb.select({ id: users.id, name: users.name, avatar: users.avatar }).from(users)
          .where(inArray(users.id, userIds));
        const userMap = new Map(userRows.map(u => [u.id, u]));
        return members.map(m => ({
          ...m,
          userName: userMap.get(m.userId)?.name || '未知用户',
          userAvatar: userMap.get(m.userId)?.avatar || '',
        }));
      }),

    // 获取用户所属的公司列表（客户视角）
    ahGetMyCompanies: protectedProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        // 查找用户绑定的所有活跃公司
        const bindings = await db.select().from(ahCompanyMembers)
          .where(and(
            eq(ahCompanyMembers.ledgerId, input.ledgerId),
            eq(ahCompanyMembers.userId, ctx.user.id),
            eq(ahCompanyMembers.status, 'active')
          ));
        if (bindings.length === 0) return [];
        const companyIds = bindings.map(b => b.companyId);
        const companies = await db.select().from(ahCompanies)
          .where(and(
            inArray(ahCompanies.id, companyIds),
            eq(ahCompanies.status, 'active')
          ));
        return companies.map(c => ({
          ...c,
          memberRole: bindings.find(b => b.companyId === c.id)?.role || 'client',
        }));
      }),

    // 获取公司详情（管理员和客户都可用）
    ahGetCompanyDetail: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        companyId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        const company = await db.select().from(ahCompanies)
          .where(and(eq(ahCompanies.id, input.companyId), eq(ahCompanies.ledgerId, input.ledgerId)))
          .limit(1);
        if (company.length === 0) throw new Error('公司不存在');
        // 获取公司成员数量
        const memberCount = await db.select().from(ahCompanyMembers)
          .where(and(
            eq(ahCompanyMembers.companyId, input.companyId),
            eq(ahCompanyMembers.status, 'active')
          ));
        // 获取最新报税授权状态
        const latestAuth = await db.select().from(ahTaxAuthorizations)
          .where(eq(ahTaxAuthorizations.companyId, input.companyId))
          .orderBy(desc(ahTaxAuthorizations.id))
          .limit(1);
        return {
          ...company[0],
          memberCount: memberCount.length,
          latestTaxAuth: latestAuth[0] || null,
        };
      }),

    // ========== 资方资产订单管理 API ==========
    // 获取资方资产订单列表（资金方看自己的，管理员看全部或指定用户的）
    funderGetAssetOrders: protectedProcedure
      .input(z.object({ ledgerId: z.number(), userId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        // 查询当前用户在账本中的角色
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;
        const isManager = role === 'owner' || role === 'admin';
        const isFunder = role === 'funder';
        if (!isManager && !isFunder) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        // 资金方只能看自己的，管理员可以看指定用户或全部
        let targetUserId: number | null = null;
        if (isFunder && !isManager) {
          targetUserId = ctx.user.id;
        } else if (input.userId) {
          targetUserId = input.userId;
        }
        let rows: any;
        if (targetUserId) {
          rows = await db.execute(
            sql`SELECT fo.*, u.username, u.name as userName, u.avatar
                FROM funder_asset_orders fo
                LEFT JOIN users u ON u.id = fo.user_id
                WHERE fo.ledger_id = ${input.ledgerId} AND fo.user_id = ${targetUserId}
                ORDER BY fo.created_at DESC`
          );
        } else {
          rows = await db.execute(
            sql`SELECT fo.*, u.username, u.name as userName, u.avatar
                FROM funder_asset_orders fo
                LEFT JOIN users u ON u.id = fo.user_id
                WHERE fo.ledger_id = ${input.ledgerId}
                ORDER BY fo.created_at DESC`
          );
        }
        return ((rows[0] || rows) as any[]) || [];
      }),

    // 获取资方资产汇总（资金方首页用）
    funderGetAssetSummary: protectedProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        // 查询当前用户在账本中的角色
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;
        if (role !== 'funder' && role !== 'owner' && role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        }
        // 查询该用户的所有活跃资产订单
        const rows = await db.execute(
          sql`SELECT coin, amount, quantity, status FROM funder_asset_orders
              WHERE ledger_id = ${input.ledgerId} AND user_id = ${ctx.user.id} AND status = 'active'`
        ) as any;
        const orders = ((rows[0] || rows) as any[]) || [];
        // 汇总
        let totalUsdt = 0;
        const coinBreakdown: Record<string, { amount: number; quantity: number; count: number }> = {};
        for (const o of orders) {
          const amt = parseFloat(o.amount) || 0;
          totalUsdt += amt;
          if (!coinBreakdown[o.coin]) coinBreakdown[o.coin] = { amount: 0, quantity: 0, count: 0 };
          coinBreakdown[o.coin].amount += amt;
          coinBreakdown[o.coin].quantity += parseFloat(o.quantity) || 0;
          coinBreakdown[o.coin].count += 1;
        }
        return { totalUsdt, coinBreakdown, orderCount: orders.length };
      }),

    // 管理员创建资方资产订单
    funderCreateAssetOrder: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        userId: z.number(),
        coin: z.string(),
        amount: z.string(),
        quantity: z.string().optional(),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
        interestType: z.string().optional(),
        interestRate: z.string().optional(),
        interestNote: z.string().optional(),
        profitShareType: z.string().optional(),
        profitShareRate: z.string().optional(),
        profitShareNote: z.string().optional(),
        adminNote: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        // 验证管理员权限
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;
        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
        // 验证目标用户是资金方
        const targetRoleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${input.userId} LIMIT 1`
        ) as any;
        const targetRole = (targetRoleRows[0]?.[0] ?? targetRoleRows[0])?.role;
        if (targetRole !== 'funder') throw new TRPCError({ code: 'BAD_REQUEST', message: '目标用户不是资金方角色' });
        await db.execute(
          sql`INSERT INTO funder_asset_orders (ledger_id, user_id, coin, amount, quantity, start_at, end_at, interest_type, interest_rate, interest_note, profit_share_type, profit_share_rate, profit_share_note, admin_note, created_by)
              VALUES (${input.ledgerId}, ${input.userId}, ${input.coin}, ${input.amount}, ${input.quantity || null}, ${input.startAt || null}, ${input.endAt || null}, ${input.interestType || null}, ${input.interestRate || null}, ${input.interestNote || null}, ${input.profitShareType || null}, ${input.profitShareRate || null}, ${input.profitShareNote || null}, ${input.adminNote || null}, ${ctx.user.id})`
        );
        return { success: true };
      }),

    // 管理员更新资方资产订单
    funderUpdateAssetOrder: protectedProcedure
      .input(z.object({
        id: z.number(),
        ledgerId: z.number(),
        coin: z.string().optional(),
        amount: z.string().optional(),
        quantity: z.string().optional(),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
        interestType: z.string().optional(),
        interestRate: z.string().optional(),
        interestNote: z.string().optional(),
        profitShareType: z.string().optional(),
        profitShareRate: z.string().optional(),
        profitShareNote: z.string().optional(),
        status: z.string().optional(),
        adminNote: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        // 验证管理员权限
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;
        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
        // 构建动态更新
        const sets: string[] = [];
        const vals: any[] = [];
        if (input.coin !== undefined) { sets.push('coin = ?'); vals.push(input.coin); }
        if (input.amount !== undefined) { sets.push('amount = ?'); vals.push(input.amount); }
        if (input.quantity !== undefined) { sets.push('quantity = ?'); vals.push(input.quantity); }
        if (input.startAt !== undefined) { sets.push('start_at = ?'); vals.push(input.startAt || null); }
        if (input.endAt !== undefined) { sets.push('end_at = ?'); vals.push(input.endAt || null); }
        if (input.interestType !== undefined) { sets.push('interest_type = ?'); vals.push(input.interestType || null); }
        if (input.interestRate !== undefined) { sets.push('interest_rate = ?'); vals.push(input.interestRate || null); }
        if (input.interestNote !== undefined) { sets.push('interest_note = ?'); vals.push(input.interestNote || null); }
        if (input.profitShareType !== undefined) { sets.push('profit_share_type = ?'); vals.push(input.profitShareType || null); }
        if (input.profitShareRate !== undefined) { sets.push('profit_share_rate = ?'); vals.push(input.profitShareRate || null); }
        if (input.profitShareNote !== undefined) { sets.push('profit_share_note = ?'); vals.push(input.profitShareNote || null); }
        if (input.status !== undefined) { sets.push('status = ?'); vals.push(input.status); }
        if (input.adminNote !== undefined) { sets.push('admin_note = ?'); vals.push(input.adminNote || null); }
        if (sets.length === 0) return { success: true };
        const setClause = sets.join(', ');
        // sql.raw only accepts a string, so we use template literal with sql`` for parameterized query
        const rawQuery = `UPDATE funder_asset_orders SET ${setClause} WHERE id = ? AND ledger_id = ?`;
        const allVals = [...vals, input.id, input.ledgerId];
        // Use the underlying mysql2 connection for parameterized raw queries
        const { getDbConnection } = await import('./db');
        const conn = await getDbConnection();
        if (conn) await conn.execute(rawQuery, allVals);
        return { success: true };
      }),

    // 管理员删除资方资产订单
    funderDeleteAssetOrder: protectedProcedure
      .input(z.object({ id: z.number(), ledgerId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        // 验证管理员权限
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;
        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
        await db.execute(
          sql`DELETE FROM funder_asset_orders WHERE id = ${input.id} AND ledger_id = ${input.ledgerId}`
        );
        return { success: true };
      }),

    // 获取账本中所有资金方用户列表（管理员用）
    funderGetFunderUsers: protectedProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        // 验证管理员权限
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;
        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
        const rows = await db.execute(
          sql`SELECT lm.userId, lm.nickname, u.username, u.name, u.avatar
              FROM ledger_members lm
              LEFT JOIN users u ON u.id = lm.userId
              WHERE lm.ledgerId = ${input.ledgerId} AND lm.role = 'funder'
              ORDER BY lm.id ASC`
        ) as any;
        return ((rows[0] || rows) as any[]) || [];
      }),

    // ========== AF 拨比管理 API ==========
    // 获取某个下单人的所有拨比配置
    afGetPayoutRatios: protectedProcedure
      .input(z.object({ ledgerId: z.number(), sourceUserId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        // 验证管理员权限
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;
        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        // 确保表存在
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS af_payout_ratios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ledger_id INT NOT NULL,
            beneficiary_user_id INT NOT NULL COMMENT '受益人（上级）的用户ID',
            source_user_id INT NOT NULL COMMENT '下单人（下级）的用户ID',
            ratio DECIMAL(5,2) NOT NULL COMMENT '拨比百分比，如20.00表示20%',
            created_at DATETIME DEFAULT NOW(),
            updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
            UNIQUE KEY uq_payout (ledger_id, beneficiary_user_id, source_user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        const rows = await db.execute(
          sql`SELECT r.id, r.beneficiary_user_id, r.ratio, u.username, u.name
              FROM af_payout_ratios r
              LEFT JOIN users u ON u.id = r.beneficiary_user_id
              WHERE r.ledger_id = ${input.ledgerId} AND r.source_user_id = ${input.sourceUserId}
              ORDER BY r.ratio DESC`
        ) as any;
        return ((rows[0] || rows) as any[]).filter((r: any) => r && r.id).map((r: any) => ({
          id: r.id,
          beneficiaryUserId: r.beneficiary_user_id,
          ratio: parseFloat(r.ratio),
          username: r.username || '',
          name: r.name || '',
        }));
      }),
    // 设置/更新拨比
    afSetPayoutRatio: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        sourceUserId: z.number(),
        beneficiaryUserId: z.number(),
        ratio: z.number().min(0).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;
        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        await db.execute(sql`
          INSERT INTO af_payout_ratios (ledger_id, source_user_id, beneficiary_user_id, ratio)
          VALUES (${input.ledgerId}, ${input.sourceUserId}, ${input.beneficiaryUserId}, ${input.ratio})
          ON DUPLICATE KEY UPDATE ratio = ${input.ratio}, updated_at = NOW()
        `);
        return { success: true };
      }),
    // 删除拨比
    afDeletePayoutRatio: protectedProcedure
      .input(z.object({ ledgerId: z.number(), id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;
        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        await db.execute(
          sql`DELETE FROM af_payout_ratios WHERE id = ${input.id} AND ledger_id = ${input.ledgerId}`
        );
        return { success: true };
      }),
    // 获取账本所有成员列表（拨比管理页用）
    afGetMembersForPayout: protectedProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getLedgerDb();
        const roleRows = await db.execute(
          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;
        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;
        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        const rows = await db.execute(
          sql`SELECT lm.userId, u.username, u.name, u.avatar, u.invited_by_user_id
              FROM ledger_members lm
              LEFT JOIN users u ON u.id = lm.userId
              WHERE lm.ledgerId = ${input.ledgerId} AND lm.userId > 0
              ORDER BY lm.createdAt ASC`
        ) as any;
        const memberList = ((rows[0] || rows) as any[]).filter((r: any) => r && r.userId);
        
        // YJH是第1代，账本owner不标代数（generation=null）
        const YJH_USER_ID = 4957151;
        // 找出账本owner
        const ownerRoleRows = await db.execute(
          sql`SELECT userId FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND role = 'owner' LIMIT 1`
        ) as any;
        const ownerUserId = (ownerRoleRows[0]?.[0] ?? ownerRoleRows[0])?.userId;
        
        // 构建userId -> invitedByUserId的映射（仅账本成员）
        const memberMap = new Map<number, any>();
        for (const r of memberList) {
          memberMap.set(r.userId, r);
        }
        
        // 计算某用户的代数（YJH=1代，YJH直推=2代，以此类推；owner返回null不标代数）
        function getGeneration(userId: number): number | null {
          if (userId === ownerUserId && userId !== YJH_USER_ID) return null; // owner不标代数
          if (userId === YJH_USER_ID) return 1;
          // 从当前用户往上追溯，直到找到YJH
          let current = userId;
          let steps = 0;
          const visited = new Set<number>();
          while (current && !visited.has(current)) {
            visited.add(current);
            const member = memberMap.get(current);
            const parentId = member?.invited_by_user_id;
            if (!parentId) break; // 找不到上级，无法确定代数
            if (parentId === YJH_USER_ID) return steps + 2; // 直接上级是YJH，则为第2代
            steps++;
            current = parentId;
            if (steps > 20) break;
          }
          // 如果追溯到了YJH本人
          if (current === YJH_USER_ID) return steps + 1;
          return null; // 无法追溯到YJH，不标代数
        }
        
        // 获取某用户的上级链（从本人到YJH，包含本人；owner不在链中）
        function getAncestorChain(userId: number): number[] {
          if (userId === ownerUserId && userId !== YJH_USER_ID) return []; // owner无上级链
          const chain: number[] = [userId];
          let current = userId;
          const visited = new Set<number>();
          while (current && !visited.has(current)) {
            visited.add(current);
            const member = memberMap.get(current);
            const parentId = member?.invited_by_user_id;
            if (!parentId || parentId === ownerUserId) break; // 不把owner加入链
            if (!memberMap.has(parentId)) break;
            chain.push(parentId);
            if (parentId === YJH_USER_ID) break;
            current = parentId;
            if (chain.length > 20) break;
          }
          return chain;
        }
        
        return memberList.map((r: any) => ({
          userId: r.userId,
          username: r.username || '',
          name: r.name || '',
          avatar: r.avatar || '',
          generation: getGeneration(r.userId), // owner为null不标代数
          ancestorChain: getAncestorChain(r.userId),
        }));
      }),
    getBinanceKlines: publicProcedure
      .input(z.object({ symbol: z.string(), interval: z.string(), limit: z.number().default(60) }))
      .query(async ({ input }) => {
        const cacheKey = `klines:${input.symbol}:${input.interval}:${input.limit}`;
        const cached = getCache(cacheKey);
        if (cached) return cached;
        const instId = input.symbol.replace(/^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE)(USDT)$/, '$1-$2');
        const barMap: Record<string, string> = { '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','2h':'2H','4h':'4H','6h':'6H','12h':'12H','1d':'1D','3d':'3D','1w':'1W','1M':'1M' };
        const bar = barMap[input.interval] || '1H';
        // 先尝试火币 K 线
        try {
          const huobiPeriod: Record<string, string> = { '1m':'1min','5m':'5min','15m':'15min','30m':'30min','1h':'60min','4h':'4hour','1d':'1day','1w':'1week' };
          const period = huobiPeriod[input.interval] || '60min';
          const sym = input.symbol.toLowerCase();
          const r = await fetch(`https://api.huobi.pro/market/history/kline?symbol=${sym}&period=${period}&size=${input.limit}`, { signal: AbortSignal.timeout(5000) });
          if (r.ok) {
            const j: any = await r.json();
            if (j.status === 'ok' && j.data?.length > 0) {
              const kr1 = (j.data as any[]).reverse().map((k: any) => ({ openTime: k.id * 1000, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.amount }));
              setCache(cacheKey, kr1); return kr1;
            }
          }
        } catch {}
        // 备用：OKX
        const res = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${input.limit}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('K线数据获取失败');
        const json: any = await res.json();
        if (json.code !== '0') throw new Error('K线数据获取失败');
        const kr2 = (json.data as any[]).reverse().map((k: any[]) => ({ openTime: parseInt(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]) }));
        setCache(cacheKey, kr2); return kr2;
      }),

    // ========== AI 型定制账本（共享公司股权管理） ==========
    createCustomAI: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可创建AI定制账本' });
        }
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: 'custom_ai',
          createdBy: ctx.user.id,
        });
        return ledger;
      }),

    listCustomAI: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可查看AI定制账本列表' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const rows = await db
          .select({
            id: ledgers.id,
            name: ledgers.name,
            description: ledgers.description,
            createdAt: ledgers.createdAt,
          })
          .from(ledgers)
          .where(eq(ledgers.type, 'custom_ai'))
          .orderBy(desc(ledgers.createdAt));
        return rows;
      }),

    inviteToCustomAI: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        username: z.string(),
        role: z.enum(['member', 'admin', 'shareholder', 'observer']).optional().default('shareholder'),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可邀请成员加入AI账本' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [ledger] = await db
          .select({ id: ledgers.id, type: ledgers.type })
          .from(ledgers)
          .where(eq(ledgers.id, input.ledgerId));
        if (!ledger || ledger.type !== 'custom_ai') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '该账本不是AI定制账本' });
        }
        return await dbLedger.inviteMemberByUsernameWithRole(input.ledgerId, ctx.user.id, input.username, input.role);
      }),
  }),
  
  // 銀行列表管理
  banks: router({
    // 搜索银行
    search: protectedProcedure
      .input(z.object({
        query: z.string(),
      }))
      .query(async ({ input }) => {
        const dbBanks = await import('./db-banks');
        return await dbBanks.searchBanks(input.query);
      }),
    
    // 更新银行使用次数（仅预置银行）
    updateUsage: protectedProcedure
      .input(z.object({
        name: z.string(),
      }))
      .mutation(async ({ input }) => {
        const dbBanks = await import('./db-banks');
        return await dbBanks.updateBankUsage(input.name);
      }),
    
    // 获取所有银行
    list: protectedProcedure
      .query(async () => {
        const dbBanks = await import('./db-banks');
        return await dbBanks.getAllBanks();
      }),
  }),
  
  // AI智能助手
  aiAssistant: router({
    // AI查询
    query: protectedProcedure
      .input(z.object({
        query: z.string(),
        sessionId: z.number().optional(),
        history: z.array(z.object({
          role: z.string(),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const dbAI = await import('./db-ai-assistant');
          const result = await dbAI.queryWithAI(ctx.user.id, input.query, input.sessionId, input.history);
          return {
            answer: result.result,
            tokensUsed: result.tokensUsed,
            cost: result.cost,
            balanceAfter: result.balanceAfter,
            sessionId: result.sessionId,
          };
        } catch (error: any) {
          console.error('[Router] AI query error:', error.message);
          throw error;
        }
      }),
    
    // 获取AI助手的提示词配置
    getPrompts: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const dbAI = await import('./db-ai-assistant');
        return await dbAI.getAssistantPrompts();
      }),
    
    // 保存AI助手的提示词配置
    savePrompts: protectedProcedure
      .input(z.object({
        role: z.string(),
        rules: z.string(),
        format: z.string(),
        examples: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const dbAI = await import('./db-ai-assistant');
        await dbAI.saveAssistantPrompts(input);
        return { success: true };
      }),
    
    // 获取AI工具列表
    getTools: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const dbAI = await import('./db-ai-assistant');
        return await dbAI.getToolsList();
      }),
    
    // 获取API密钥配置状态
    getApiStatus: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const dbAI = await import('./db-ai-assistant');
        return await dbAI.getApiKeysStatus();
      }),
    
    // 获取用户的会话列表
    getSessions: protectedProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ ctx, input }) => {
        const dbSessions = await import('./db-ai-sessions');
        return await dbSessions.getUserSessions(ctx.user.id, input.page, input.limit);
      }),
    
    // 获取会话详情（包含消息历史）
    getSessionDetail: protectedProcedure
      .input(z.object({
        sessionId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const dbSessions = await import('./db-ai-sessions');
        return await dbSessions.getSessionDetail(input.sessionId, ctx.user.id);
      }),
    
    // 创建新会话
    createSession: protectedProcedure
      .input(z.object({
        title: z.string().default('新对话'),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbSessions = await import('./db-ai-sessions');
        const sessionId = await dbSessions.createSession(ctx.user.id, input.title);
        return { sessionId };
      }),
    
    // 更新会话标题
    updateSessionTitle: protectedProcedure
      .input(z.object({
        sessionId: z.number(),
        title: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbSessions = await import('./db-ai-sessions');
        await dbSessions.updateSessionTitle(input.sessionId, ctx.user.id, input.title);
        return { success: true };
      }),
    
    // 删除会话
    deleteSession: protectedProcedure
      .input(z.object({
        sessionId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbSessions = await import('./db-ai-sessions');
        await dbSessions.deleteSession(input.sessionId, ctx.user.id);
        return { success: true };
      }),
  }),
  
  // 邀请系统
  invite: inviteRouter,
  
  // 邀请功能权限管理 (管理员)
  invitePermission: invitePermissionRouter,

  // 海报收藏管理
  posterFavorites: posterFavoritesRouter,

  // 脉动节点合作平台 - 工作群管理
  workGroups: workGroupsRouter,

  // ==================== 管理员功能 ====================
  // adminFeature: adminFeatureRouter, // 已移至文件底部定义，在下方单独导出
  // ==================== Manus 聊天功能 ====================
  manus: manusRouter,

  // ==================== 账本分组管理 ====================
  ledgerGroup: router({
    // 获取当前用户的所有分组（含账本归属信息）
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getLedgerGroupsWithLedgers } = await import('./db-ledger');
      return getLedgerGroupsWithLedgers(ctx.user.id);
    }),
    // 创建分组
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(50) }))
      .mutation(async ({ ctx, input }) => {
        const { createLedgerGroup } = await import('./db-ledger');
        return createLedgerGroup(ctx.user.id, input.name);
      }),
    // 重命名分组
    update: protectedProcedure
      .input(z.object({ groupId: z.number(), name: z.string().min(1).max(50) }))
      .mutation(async ({ ctx, input }) => {
        const { updateLedgerGroup } = await import('./db-ledger');
        return updateLedgerGroup(ctx.user.id, input.groupId, input.name);
      }),
    // 删除分组（账本移出分组，不删除账本）
    delete: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteLedgerGroup } = await import('./db-ledger');
        return deleteLedgerGroup(ctx.user.id, input.groupId);
      }),
    // 将账本归入/移出分组
    assignLedger: protectedProcedure
      .input(z.object({ ledgerId: z.number(), groupId: z.number().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const { assignLedgerToGroup } = await import('./db-ledger');
        return assignLedgerToGroup(ctx.user.id, input.ledgerId, input.groupId);
      }),
  }),

  // ==================== 数据安全（加密管理） ====================
  encryption: router({
    // 获取加密配置列表
    getConfig: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
      }
      const dbEncryption = await import('./db-encryption');
      const configs = await dbEncryption.getEncryptionConfigList();
      const stats = await dbEncryption.getEncryptionStats();
      const keyConfigured = dbEncryption.isEncryptionKeyConfigured();
      return { configs, stats, keyConfigured };
    }),

    // 切换字段加密开关
    toggleField: protectedProcedure
      .input(z.object({
        configId: z.number(),
        enable: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const dbEncryption = await import('./db-encryption');
        return await dbEncryption.toggleFieldEncryption(input.configId, input.enable);
      }),

    // 初始化加密配置表
    init: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
      }
      const dbEncryption = await import('./db-encryption');
      await dbEncryption.initEncryptionConfig();
      return { success: true };
    }),
  }),

  // ==================== 汇率计算器 ====================
  exchange: router({
    // 天行数据单对汇率查询
    getRate: publicProcedure
      .input(z.object({
        fromcoin: z.string().default('USD'),
        tocoin: z.string().default('CNY'),
        money: z.number().default(1),
      }))
      .query(async ({ input }) => {
        const TIANAPI_KEY = '3878a89bed4728b65cc7d8dc0a644c07';
        try {
          const params = new URLSearchParams({
            key: TIANAPI_KEY,
            fromcoin: input.fromcoin,
            tocoin: input.tocoin,
            money: String(input.money),
          });
          const res = await fetch(`https://apis.tianapi.com/fxrate/index?${params}`, {
            signal: AbortSignal.timeout(8000),
          });
          const data = await res.json() as { code: number; msg: string; result?: { money: string } };
          if (data.code === 200 && data.result) {
            return { success: true, money: data.result.money, fromcoin: input.fromcoin, tocoin: input.tocoin };
          }
          return { success: false, money: '0', fromcoin: input.fromcoin, tocoin: input.tocoin };
        } catch {
          return { success: false, money: '0', fromcoin: input.fromcoin, tocoin: input.tocoin };
        }
      }),
    // 批量获取常用货币对基准货币的汇率（一次请求多个币种）
    getRates: publicProcedure
      .input(z.object({ base: z.string().default('CNY') }))
      .query(async ({ input }) => {
        const TIANAPI_KEY = '3878a89bed4728b65cc7d8dc0a644c07';
        const targets = ['USD', 'EUR', 'GBP', 'JPY', 'HKD', 'KRW', 'AUD', 'CAD', 'SGD', 'CHF', 'THB', 'MYR', 'TWD', 'RUB', 'AED', 'CNY'];
        const filtered = targets.filter(c => c !== input.base);
        const rates: Record<string, number> = {};
        const today = new Date();
        const lastUpdated = `${today.getFullYear()}/${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getDate()).padStart(2,'0')}`;
        try {
          // 并发请求所有目标货币
          await Promise.all(filtered.map(async (tocoin) => {
            const params = new URLSearchParams({
              key: TIANAPI_KEY,
              fromcoin: input.base,
              tocoin,
              money: '1',
            });
            const res = await fetch(`https://apis.tianapi.com/fxrate/index?${params}`, {
              signal: AbortSignal.timeout(8000),
            });
            const data = await res.json() as { code: number; result?: { money: string } };
            if (data.code === 200 && data.result) {
              rates[tocoin] = parseFloat(data.result.money);
            }
          }));
          rates[input.base] = 1;
          return { rates, base: input.base, lastUpdated };
        } catch {
          return { rates: {}, base: input.base, lastUpdated: '' };
        }
      }),
  }),
  // ===== AB 定制账本 - 共享意见本 =====
  opinionBook: router({
    // 创建意见本（仅管理员）- 直接复用 ledgers 表，type='opinion_book'
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        storeName: z.string().max(100).optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可创建意见本' });
        }
        // 直接在 ledgers 表创建，不再需要 opinion_books 表
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: 'opinion_book',
          currency: 'CNY',
          createdBy: ctx.user.id,
        });
        return { id: ledger.id, ledgerId: ledger.id, name: input.name };
      }),

    // 获取意见本列表（仅管理员）- 从 ledgers 表查，type='opinion_book'
    list: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可查看' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // super_admin 和 admin 都能看到全部 opinion_book 和 opinion_book_demo 账本
        const rows = await db
          .select({
            id: ledgers.id,
            name: ledgers.name,
            description: ledgers.description,
            type: ledgers.type,
            createdAt: ledgers.createdAt,
          })
          .from(ledgers)
          .where(and(inArray(ledgers.type, ['opinion_book', 'opinion_book_demo']), eq(ledgers.isArchived, false)))
          .orderBy(desc(ledgers.createdAt));
        return rows;
      }),

    // ═══ 分店管理（全部用原始SQL，不依赖type字段值，不依赖ORM） ═══

    // 添加分店 - 直接INSERT到ledger_categories
    addBranch: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        name: z.string().min(1).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
        }
        const dbConn = await getDbConnection();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 验证账本归属
        const [ledgerRows] = await dbConn.execute(
          `SELECT id FROM ledgers WHERE id=? AND ownerId=? AND type='opinion_book'`,
          [input.ledgerId, ctx.user.id]
        ) as any;
        if (!(ledgerRows as any[]).length) throw new TRPCError({ code: 'FORBIDDEN', message: '无权操作此意见本' });
        // 获取当前最大排序值
        const [maxRows] = await dbConn.execute(
          `SELECT COALESCE(MAX(sort_order), 0) as maxSort FROM ledger_categories WHERE ledgerId=?`,
          [input.ledgerId]
        ) as any;
        const nextSort = ((maxRows as any[])[0]?.maxSort || 0) + 1;
        // 直接INSERT，type用'expense'（兼容旧枚举），isDefault=0标识为用户创建的分店
        const [result] = await dbConn.execute(
          `INSERT INTO ledger_categories (ledgerId, name, type, icon, color, sort_order, isDefault, createdBy)
           VALUES (?, ?, 'expense', '🏪', '#D32F2F', ?, 0, ?)`,
          [input.ledgerId, input.name, nextSort, ctx.user.id]
        ) as any;
        console.log(`[addBranch] 新增分店: ledgerId=${input.ledgerId}, name=${input.name}, insertId=${result.insertId}`);
        return { id: result.insertId, name: input.name };
      }),

    // 获取分店列表 - 查该账本下所有isDefault=0的分类（不依赖type字段）
    getBranches: protectedProcedure
      .input(z.object({ ledgerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const dbConn = await getDbConnection();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 允许：平台管理员 或 该账本的 owner/admin
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          const [ownerRows] = await dbConn.execute(
            `SELECT id FROM ledgers WHERE id=? AND ownerId=?`,
            [input.ledgerId, ctx.user.id]
          ) as any;
          const [memberRows] = await dbConn.execute(
            `SELECT role FROM ledger_members WHERE ledgerId=? AND userId=?`,
            [input.ledgerId, ctx.user.id]
          ) as any;
          const isOwner = (ownerRows as any[]).length > 0;
          const memberRole = (memberRows as any[])[0]?.role;
          if (!isOwner && memberRole !== 'owner' && memberRole !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本管理员可查看' });
          }
        }
        // deleted_at 字段已确认存在，无需动态检测
        const joinCond = `r.categoryId = c.id AND r.deleted_at IS NULL`;
        const [rows] = await dbConn.execute(
          `SELECT c.id, c.name, c.sort_order,
                  COUNT(r.id) as entry_count
           FROM ledger_categories c
           LEFT JOIN ledger_records r ON ${joinCond}
           WHERE c.ledgerId = ? AND (c.isDefault = 0 OR c.isDefault IS NULL)
             AND c.parentId IS NULL
           GROUP BY c.id, c.name, c.sort_order
           ORDER BY c.sort_order ASC, c.id ASC`,
          [input.ledgerId]
        ) as any;
        console.log(`[getBranches] ledgerId=${input.ledgerId}, 查到 ${(rows as any[]).length} 个分店`);
        return rows as Array<{ id: number; name: string; sort_order: number; entry_count: number }>;
      }),

    // 删除分店 - 直接DELETE
    deleteBranch: protectedProcedure
      .input(z.object({ categoryId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
        }
        const dbConn = await getDbConnection();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 先把该分店下的意见记录的categoryId置空（保留记录，只解除关联）
        await dbConn.execute(
          `UPDATE ledger_records SET categoryId = NULL WHERE categoryId = ?`,
          [input.categoryId]
        );
        // 删除分店
        await dbConn.execute(
          `DELETE FROM ledger_categories WHERE id = ?`,
          [input.categoryId]
        );
        console.log(`[deleteBranch] 删除分店: categoryId=${input.categoryId}`);
        return { success: true };
      }),

    // 获取意见列表（仅管理员）- 从 ledger_records 查
    getEntries: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        categoryId: z.number().optional(),  // 分店ID（ledger_categories.id）
        page: z.number().default(1),
        pageSize: z.number().default(20),
      }))
      .query(async ({ ctx, input }) => {
        const dbConn = await getDbConnection();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 允许 super_admin、admin 或账本 owner 查看
        let isOwner = ctx.user.role === 'super_admin';
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          const [ownerRows] = await dbConn.execute(
            `SELECT id FROM ledgers WHERE id=? AND ownerId=? AND isArchived=0`,
            [input.ledgerId, ctx.user.id]
          ) as any;
          if (!(ownerRows as any[]).length) {
            throw new TRPCError({ code: 'FORBIDDEN', message: '无权查看此意见本' });
          }
          isOwner = true; // 通过了 owner 检查，说明是账本 owner
        } else if (ctx.user.role === 'admin') {
          // admin 不是 owner，需额外检查是否是账本成员
          const [memberRows] = await dbConn.execute(
            `SELECT id FROM ledger_members WHERE ledgerId=? AND userId=?`,
            [input.ledgerId, ctx.user.id]
          ) as any;
          if (!(memberRows as any[]).length) {
            throw new TRPCError({ code: 'FORBIDDEN', message: '无权查看此意见本' });
          }
          // 检查是否是 owner
          const [ownerCheck] = await dbConn.execute(
            `SELECT id FROM ledgers WHERE id=? AND ownerId=?`,
            [input.ledgerId, ctx.user.id]
          ) as any;
          isOwner = (ownerCheck as any[]).length > 0;
        }
        const offset = (input.page - 1) * input.pageSize;
        // 意见本字段（rating/guest_name/guest_wechat/is_read/deleted_at）已确认存在，无需动态检测
        const guestFields = isOwner
          ? `r.guest_name, r.guest_wechat`
          : `NULL as guest_name, NULL as guest_wechat`;
        let query = `SELECT r.id, r.description as content, r.rating, ${guestFields}, r.is_read,
                        r.createdAt as created_at, r.categoryId as category_id,
                        c.name as branch_name
                 FROM ledger_records r
                 LEFT JOIN ledger_categories c ON c.id = r.categoryId
                 WHERE r.ledgerId = ? AND (r.deleted_at IS NULL)`;
        const params: any[] = [input.ledgerId];
        if (input.categoryId !== undefined) {
          query += ` AND r.categoryId = ?`;
          params.push(input.categoryId);
        }
        query += ` ORDER BY r.createdAt DESC LIMIT ${Number(input.pageSize)} OFFSET ${Number(offset)}`;
        const [rows] = await dbConn.execute(query, params) as any;
        let countQuery = `SELECT COUNT(*) as total FROM ledger_records r WHERE r.ledgerId = ? AND (r.deleted_at IS NULL)`;
        const countParams: any[] = [input.ledgerId];
        if (input.categoryId !== undefined) {
          countQuery += ` AND r.categoryId = ?`;
          countParams.push(input.categoryId);
        }
        const [countRows] = await dbConn.execute(countQuery, countParams) as any;
        return { entries: rows as any[], total: (countRows as any[])[0].total };
      }),

    // 游客提交意见（公开接口，无需登录）- 存入 ledger_records
    submitEntry: publicProcedure
      .input(z.object({
        ledgerId: z.number(),
        categoryId: z.number().optional(),  // 分店ID（ledger_categories.id），可选
        content: z.string().min(1).max(1000),
        rating: z.number().min(1).max(5).optional(),
        guestName: z.string().max(50).optional(),
        guestWechat: z.string().max(100).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbConn = await getDbConnection();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 验证账本存在且是 opinion_book 或 opinion_book_demo 类型
        const [ledgerRows] = await dbConn.execute(
          `SELECT id FROM ledgers WHERE id=? AND type IN ('opinion_book','opinion_book_demo') AND isArchived=0`,
          [input.ledgerId]
        ) as any;
        if (!(ledgerRows as any[]).length) throw new TRPCError({ code: 'BAD_REQUEST', message: '无效的意见本' });
        // 如果指定了分店，验证分店存在
        if (input.categoryId) {
          const [catRows] = await dbConn.execute(
            `SELECT id FROM ledger_categories WHERE id=? AND ledgerId=?`,
            [input.categoryId, input.ledgerId]
          ) as any;
          if (!(catRows as any[]).length) throw new TRPCError({ code: 'BAD_REQUEST', message: '无效的分店' });
        }
        const req = (ctx as any).req;
        const guestIp = req?.ip || req?.headers?.['x-forwarded-for'] || null;
        const today = new Date().toISOString().split('T')[0];
        // 意见本字段已确认存在，直接写入完整信息
        await dbConn.execute(
          `INSERT INTO ledger_records (ledgerId, type, amount, categoryId, description, recordDate, createdBy, rating, guest_name, guest_wechat, guest_ip, is_read)
           VALUES (?, 'expense', '0.00', ?, ?, ?, 0, ?, ?, ?, ?, 0)`,
          [input.ledgerId, input.categoryId || null, input.content, today,
           input.rating || null, input.guestName || null, input.guestWechat || null, guestIp]
        );
        return { success: true };
      }),

    // 获取意见本公开信息（游客扫码时获取门店名和分店列表）
    getPublicInfo: publicProcedure
      .input(z.object({
        ledgerId: z.number(),
        categoryId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const dbConn = await getDbConnection();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [ledgerRows] = await dbConn.execute(
          `SELECT id, name, description, icon FROM ledgers WHERE id=? AND type IN ('opinion_book','opinion_book_demo') AND isArchived=0`,
          [input.ledgerId]
        ) as any;
        if (!(ledgerRows as any[]).length) throw new TRPCError({ code: 'NOT_FOUND', message: '意见本不存在' });
        let branch = null;
        let tableName = null;
        if (input.categoryId) {
          const [catRows] = await dbConn.execute(
            `SELECT id, name, parentId FROM ledger_categories WHERE id=? AND ledgerId=?`,
            [input.categoryId, input.ledgerId]
          ) as any;
          const cat = (catRows as any[])[0] || null;
          if (cat) {
            if (cat.parentId) {
              // categoryId 是桌号（二级分类），查父分类（分店）
              tableName = cat.name;
              const [parentRows] = await dbConn.execute(
                `SELECT id, name FROM ledger_categories WHERE id=?`,
                [cat.parentId]
              ) as any;
              branch = (parentRows as any[])[0] || null;
            } else {
              // categoryId 是分店（一级分类）
              branch = cat;
            }
          }
        }
        return { book: (ledgerRows as any[])[0], branch, tableName };
      }),

    // 批量创建桌号二级分类（意见本二维码管理用）
    // 给指定分店批量创建桌号，返回每个桌号的 categoryId
    ensureTables: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        branchId: z.number(),   // 一级分类（分店）ID
        tableCount: z.number().min(1).max(200),
      }))
      .mutation(async ({ ctx, input }) => {
        // 验证用户是该账本的成员（任意成员均可操作）
        const memberConn = await getDbConnection();
        if (memberConn) {
          const [memberRows] = await memberConn.execute(
            'SELECT id FROM ledger_members WHERE ledgerId = ? AND userId = ? LIMIT 1',
            [input.ledgerId, ctx.user.id]
          ) as any;
          if (!memberRows || (memberRows as any[]).length === 0) {
            throw new TRPCError({ code: 'FORBIDDEN', message: '您不是该账本的成员' });
          }
        }
        // 获取该分店下已有的桌号二级分类
        const existing = await dbLedger.getLedgerCategories(input.ledgerId);
        const existingTables = existing.filter(
          (c: any) => c.parentId === input.branchId
        );
        // 计算已有桌号的最大序号
        const existingNumbers = existingTables
          .map((c: any) => parseInt(c.name))
          .filter((n: number) => !isNaN(n));
        const maxExisting = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
        // 只创建不存在的桌号
        const toCreate: number[] = [];
        for (let i = 1; i <= input.tableCount; i++) {
          if (!existingNumbers.includes(i)) toCreate.push(i);
        }
        const created: Array<{ tableNumber: number; categoryId: number; name: string }> = [];
        const insertConn = await getDbConnection();
        if (!insertConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        for (const num of toCreate) {
          const name = String(num).padStart(2, '0') + '桌';
          // 直接用 SQL 插入，避免 Drizzle .$returningId() 在某些 MySQL 版本不兼容
          const [insertResult] = await insertConn.execute(
            `INSERT INTO ledger_categories (ledgerId, name, type, parentId, icon, color, sortOrder, isDefault, createdBy)
             VALUES (?, ?, 'branch', ?, '🪑', '#888888', ?, 0, ?)`,
            [input.ledgerId, name, input.branchId, num, ctx.user.id]
          ) as any;
          const newId = (insertResult as any).insertId;
          if (newId) {
            created.push({ tableNumber: num, categoryId: newId, name });
          }
        }
        // 返回所有桌号（包含已有的和新建的）
        const allCategories = await dbLedger.getLedgerCategories(input.ledgerId);
        const allTables = allCategories
          .filter((c: any) => c.parentId === input.branchId)
          .map((c: any) => ({ categoryId: c.id, name: c.name }))
          .sort((a: any, b: any) => {
            const na = parseInt(a.name); const nb = parseInt(b.name);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.name.localeCompare(b.name);
          });
        return { tables: allTables, created: created.length };
      }),

    // 初始化演示账本（仅超级管理员，幂等操作）
    initDemo: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
        }
        const dbConn = await getDbConnection();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });

        const DEMO_NAME = '麻六记·北京区域意见簿';
        const DEMO_DESC = '麻六记北京区域顾客意见收集平台（演示账本）';
        const MALUJI_LOGO = 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/maluji-logo_40f7da5d.webp';
        const ownerId = ctx.user.id;

        // 检查是否已存在
        const [existRows] = await dbConn.execute(
          `SELECT id FROM ledgers WHERE name=? AND type='opinion_book_demo' LIMIT 1`,
          [DEMO_NAME]
        ) as any;

        let ledgerId: number;
        if ((existRows as any[]).length > 0) {
          ledgerId = (existRows as any[])[0].id;
          // 确保owner成员记录存在（可能因为初次创建失败导致成员未插入）
          await dbConn.execute(
            `INSERT IGNORE INTO ledger_members (ledgerId, userId, role, memberType, nickname, permissionView, permissionAdd, permissionEdit, permissionDelete, canEdit, canDelete, canInvite)
             VALUES (?, ?, 'owner', 'real', '麻六记管理员', 'all', 'all', 'all', 'all', 1, 1, 1)`,
            [ledgerId, ownerId]
          );
        } else {
          // 创建演示账本
          const [res] = await dbConn.execute(
            `INSERT INTO ledgers (name, description, type, currency, icon, createdBy, ownerId, isVip, isArchived)
             VALUES (?, ?, 'opinion_book_demo', 'CNY', ?, ?, ?, 0, 0)`,
            [DEMO_NAME, DEMO_DESC, MALUJI_LOGO, ownerId, ownerId]
          ) as any;
          ledgerId = (res as any).insertId;
          // 加入成员
          await dbConn.execute(
            `INSERT IGNORE INTO ledger_members (ledgerId, userId, role, memberType, nickname, permissionView, permissionAdd, permissionEdit, permissionDelete, canEdit, canDelete, canInvite)
             VALUES (?, ?, 'owner', 'real', '麻六记管理员', 'all', 'all', 'all', 'all', 1, 1, 1)`,
            [ledgerId, ownerId]
          );
        }

        // 创建10家北京门店
        const BRANCHES = [
          '国贸商城店', '银泰中心店', '金融街店', '王府井APM店', '三里屯太古里店',
          '望京华彩店', '中关村欧美汇店', '西单大悦城店', '朝阳大悦城店', '来广营环宇汇店'
        ];
        const branchIds: number[] = [];
        for (let i = 0; i < BRANCHES.length; i++) {
          const [existBranch] = await dbConn.execute(
            `SELECT id FROM ledger_categories WHERE ledgerId=? AND name=? LIMIT 1`,
            [ledgerId, BRANCHES[i]]
          ) as any;
          if ((existBranch as any[]).length > 0) {
            branchIds.push((existBranch as any[])[0].id);
          } else {
            const [r] = await dbConn.execute(
              `INSERT INTO ledger_categories (ledgerId, name, type, icon, color, isDefault, sortOrder) VALUES (?, ?, 'expense', '', '#E8472A', 0, ?)`,
              [ledgerId, BRANCHES[i], i + 1]
            ) as any;
            branchIds.push((r as any).insertId);
          }
        }

        // 检查是否已有足够数据
        const [countRows] = await dbConn.execute(
          `SELECT COUNT(*) as cnt FROM ledger_records WHERE ledgerId=?`,
          [ledgerId]
        ) as any;
        const existCount = Number((countRows as any[])[0].cnt);
        // 清除所有门店分类的表情图标
        await dbConn.execute(
          `UPDATE ledger_categories SET icon='' WHERE ledgerId=? AND icon IS NOT NULL AND icon!=''`,
          [ledgerId]
        );

        if (existCount >= 300) {
          return { ledgerId, created: false, message: '演示数据已存在，图标已清除' };
        }

        // 插入300条模拟点评
        const POSITIVE = [
          '菜品口味非常好，麻辣鲜香，层次丰富，下次还会来！',
          '服务员态度很好，上菜速度快，整体体验很满意。',
          '环境干净整洁，装修有特色，适合朋友聚餐。',
          '酸辣粉真的很好吃，汤底浓郁，分量也足。',
          '性价比很高，味道正宗，是我吃过最好的川菜之一。',
          '店员很热情，推荐了几道招牌菜，都非常好吃。',
          '食材新鲜，火候到位，麻辣程度可以自选，很贴心。',
          '招牌夫妻肺片超级好吃，红油拌得很均匀。',
          '整体体验超出预期，强烈推荐给喜欢川菜的朋友！',
          '点了套餐，量很足，两个人吃很划算。',
          '装修很有川渝风格，拍照很好看。',
          '辣度可以调节，非常适合不太能吃辣的朋友。',
          '老板很亲切，会主动询问口味偏好。',
          '外卖包装也很用心，送到家还是热的。',
          '位置很好找，停车方便，下次带家人来。',
        ];
        const NEGATIVE = [
          '等位时间有点长，希望能优化一下叫号系统。',
          '菜品口味偏咸，建议减少盐的用量。',
          '服务员有点忙，叫了几次才来，希望增加人手。',
          '空调温度有点低，坐久了有点冷，建议调高一点。',
          '停车位不够，找了很久才停好车。',
          '菜品上桌速度有点慢，等了将近20分钟。',
          '分量稍微少了一点，建议加量或者降价。',
          '有一道菜的食材不太新鲜，希望加强食材管理。',
          '结账时排队时间较长，建议增加收银台。',
          '噪音有点大，用餐体验稍受影响。',
          '菜单更新不够及时，有几道菜已经下架但还在菜单上。',
          '餐具有一个有点脏，希望加强清洗质量。',
          '辣度标注不够准确，点了微辣但实际很辣。',
          '桌子间距有点小，坐着有点拥挤。',
          '希望增加一些非辣菜品，方便不能吃辣的顾客。',
        ];
        const NEUTRAL = [
          '整体还不错，就是价格稍微贵了一点。',
          '口味中规中矩，没有特别惊艳但也不差。',
          '环境一般，但菜品质量还可以。',
          '第一次来，还在适应口味，下次再来试试其他菜。',
          '朋友推荐来的，感觉和预期差不多。',
          '性价比一般，但胜在位置方便。',
          '味道还行，就是等位时间有点长。',
          '菜品种类丰富，但有几道菜口味一般。',
          '服务态度还不错，但上菜速度可以再快一点。',
          '整体来说是一次还算满意的用餐体验。',
        ];
        const NAMES = ['张先生','李女士','王先生','赵女士','陈先生','刘女士','杨先生','黄女士','周先生','吴女士','徐先生','孙女士','马先生','朱女士','胡先生','郭女士','何先生','高女士','林先生','郑女士','匿名顾客','路过的食客','常客','老顾客'];
        
        const now = Date.now();
        for (let i = 0; i < branchIds.length; i++) {
          for (let j = 0; j < 30; j++) {
            const rand = Math.random();
            let rating: number, content: string;
            if (rand < 0.45) { rating = 5; content = POSITIVE[Math.floor(Math.random() * POSITIVE.length)]; }
            else if (rand < 0.70) { rating = 4; content = POSITIVE[Math.floor(Math.random() * POSITIVE.length)]; }
            else if (rand < 0.85) { rating = 3; content = NEUTRAL[Math.floor(Math.random() * NEUTRAL.length)]; }
            else if (rand < 0.95) { rating = 2; content = NEGATIVE[Math.floor(Math.random() * NEGATIVE.length)]; }
            else { rating = 1; content = NEGATIVE[Math.floor(Math.random() * NEGATIVE.length)]; }
            const guestName = NAMES[Math.floor(Math.random() * NAMES.length)];
            const daysAgo = Math.floor(Math.random() * 90);
            const recordDate = new Date(now - daysAgo * 86400000).toISOString().split('T')[0];
            await dbConn.execute(
              `INSERT INTO ledger_records (ledgerId, type, amount, categoryId, description, recordDate, createdBy, rating, guest_name, guest_wechat, guest_ip, is_read)
               VALUES (?, 'expense', '0.00', ?, ?, ?, 0, ?, ?, NULL, NULL, 0)`,
              [ledgerId, branchIds[i], content, recordDate, rating, guestName]
            );
          }
        }

        return { ledgerId, created: true, message: '演示账本初始化成功，已创建300条模拟点评' };
      }),

    // 修复演示账本成员（仅超级管理员，幂等）
    fixDemoMember: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
        }
        const dbConn = await getDbConnection();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 找到演示账本
        const [rows] = await dbConn.execute(
          `SELECT id FROM ledgers WHERE type='opinion_book_demo' LIMIT 1`
        ) as any;
        if (!(rows as any[]).length) throw new TRPCError({ code: 'NOT_FOUND', message: '演示账本不存在' });
        const ledgerId = (rows as any[])[0].id;
        // 确保当前用户（jiang）在成员表里
        await dbConn.execute(
          `INSERT IGNORE INTO ledger_members (ledgerId, userId, role, memberType, nickname, permissionView, permissionAdd, permissionEdit, permissionDelete, canEdit, canDelete, canInvite)
           VALUES (?, ?, 'owner', 'real', '麻六记管理员', 'all', 'all', 'all', 'all', 1, 1, 1)`,
          [ledgerId, ctx.user.id]
        );
        return { ledgerId, userId: ctx.user.id, message: '成员记录已修复' };
      }),

    // 演示账本公开获取意见列表（无需登录）
    getDemoEntries: publicProcedure
      .input(z.object({
        ledgerId: z.number(),
        categoryId: z.number().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
        isOwner: z.boolean().default(false),
      }))
      .query(async ({ input }) => {
        const dbConn = await getDbConnection();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 只允许访问 opinion_book_demo 类型的账本
        const [ledgerRows] = await dbConn.execute(
          `SELECT id FROM ledgers WHERE id=? AND type='opinion_book_demo' AND isArchived=0`,
          [input.ledgerId]
        ) as any;
        if (!(ledgerRows as any[]).length) throw new TRPCError({ code: 'NOT_FOUND', message: '演示账本不存在' });
        const offset = (input.page - 1) * input.pageSize;
        const guestFields = input.isOwner
          ? `r.guest_name, r.guest_wechat`
          : `NULL as guest_name, NULL as guest_wechat`;
        let query = `SELECT r.id, r.description as content, r.rating, ${guestFields}, r.is_read,
                        r.createdAt as created_at, r.categoryId as category_id,
                        c.name as branch_name
                 FROM ledger_records r
                 LEFT JOIN ledger_categories c ON c.id = r.categoryId
                 WHERE r.ledgerId = ? AND (r.deleted_at IS NULL)`;
        const params: any[] = [input.ledgerId];
        if (input.categoryId !== undefined) {
          query += ` AND r.categoryId = ?`;
          params.push(input.categoryId);
        }
        query += ` ORDER BY r.createdAt DESC LIMIT ${Number(input.pageSize)} OFFSET ${Number(offset)}`;
        const [rows] = await dbConn.execute(query, params) as any;
        let countQuery = `SELECT COUNT(*) as total FROM ledger_records r WHERE r.ledgerId = ? AND (r.deleted_at IS NULL)`;
        const countParams: any[] = [input.ledgerId];
        if (input.categoryId !== undefined) {
          countQuery += ` AND r.categoryId = ?`;
          countParams.push(input.categoryId);
        }
        const [countRows] = await dbConn.execute(countQuery, countParams) as any;
        return { entries: rows as any[], total: (countRows as any[])[0].total };
      }),

    // AI 智能分析：读取账本所有评价，调用 LLM 生成最重要最紧急的建议
    aiInsights: publicProcedure
      .input(z.object({
        ledgerId: z.number(),
        categoryId: z.number().optional(),  // 可选分店筛选
        forceRefresh: z.boolean().default(false),
      }))
      .query(async ({ input }) => {
        const dbConn = await getDbConnection();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 验证账本存在
        const [ledgerRows] = await dbConn.execute(
          `SELECT id, name FROM ledgers WHERE id=? AND type IN ('opinion_book','opinion_book_demo') AND isArchived=0`,
          [input.ledgerId]
        ) as any;
        if (!(ledgerRows as any[]).length) throw new TRPCError({ code: 'NOT_FOUND', message: '账本不存在' });
        const ledgerName = (ledgerRows as any[])[0].name;

        // 读取最近 200 条意见（防止 token 过多）
        let entriesQuery = `SELECT r.description as content, r.createdAt as created_at,
                                   c.name as branch_name
                            FROM ledger_records r
                            LEFT JOIN ledger_categories c ON c.id = r.categoryId
                            WHERE r.ledgerId = ? AND (r.deleted_at IS NULL)`;
        const params: any[] = [input.ledgerId];
        if (input.categoryId !== undefined) {
          entriesQuery += ` AND r.categoryId = ?`;
          params.push(input.categoryId);
        }
        entriesQuery += ` ORDER BY r.createdAt DESC LIMIT 200`;
        const [entryRows] = await dbConn.execute(entriesQuery, params) as any;
        const entries = entryRows as any[];

        if (entries.length === 0) {
          return {
            insights: [],
            summary: '暂无足够意见数据，请等客户提交意见后再查看 AI 分析。',
            totalAnalyzed: 0,
          };
        }

        // 构建评价摘要文本
        const entriesSummary = entries
          .map((e: any, i: number) => `${i + 1}. [${e.branch_name || '未知分店'}] ${e.content}`)
          .join('\n');

        // 使用 DeepSeek API 进行 AI 分析
        const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
        if (!deepseekApiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DeepSeek API Key 未配置' });
        const deepseekRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekApiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content: `你是一个餐饮行业经营顾问，擅长从大量客户意见中提炼关键洞察。你的任务是分析「${ledgerName}」的客户意见，为老板生成 3～5 条最重要、最紧急的改进建议。

要求：
1. 每条建议必须有具体可操作的行动方案
2. 标注紧急程度：高（需立即处理）/ 中（本周内）/ 低（长期优化）
3. 每条建议要指出该问题被多少客户提到
4. 语言简洁直接，面向老板，不要学术化
5. 返回纯 JSON 格式（不要包含 markdown 代码块），包含字段：insights (数组) 和 summary (总结一句话)

insights 数组每项包含：
- title: 建议标题（不超过 20 字）
- detail: 具体行动建议（不超过 60 字）
- urgency: 高 | 中 | 低
- count: 涉及该问题的意见条数（整数）`,
              },
              {
                role: 'user',
                content: `以下是最近 ${entries.length} 条客户意见：\n\n${entriesSummary}\n\n请分析并返回 JSON。`,
              },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
          }),
        });
        if (!deepseekRes.ok) {
          const errText = await deepseekRes.text();
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `DeepSeek API 错误: ${errText.slice(0, 200)}` });
        }
        const deepseekData = await deepseekRes.json() as any;
        const rawContent = deepseekData.choices[0].message.content;
        const parsed = JSON.parse(rawContent);
        return {
          insights: parsed.insights as Array<{ title: string; detail: string; urgency: string; count: number }>,
          summary: parsed.summary as string,
          totalAnalyzed: entries.length,
        };
      }),

    // 获取分店下的桌号列表（用于二维码管理页展示）
    getTables: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        branchId: z.number(),
      }))
      .query(async ({ input }) => {
        const allCategories = await dbLedger.getLedgerCategories(input.ledgerId);
        const tables = allCategories
          .filter((c: any) => c.parentId === input.branchId)
          .map((c: any) => ({ categoryId: c.id, name: c.name }))
          .sort((a: any, b: any) => {
            const na = parseInt(a.name); const nb = parseInt(b.name);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.name.localeCompare(b.name);
          });
        return { tables };
      }),
  }),
});
// 管理员容器定义管理（独立 router，仅超级管理员可用）
export const adminFeatureRouter = router({
  // 获取所有容器定义
  list: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
      }
      return db.getAllFeatureDefinitions();
    }),
  
  // 创建或更新容器定义
  upsert: protectedProcedure
    .input(z.object({
      featureId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      isActive: z.boolean(),
      defaultPosition: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
      }
      await db.upsertFeatureDefinition({
        ...input,
        createdBy: ctx.user.id,
      });
      return { success: true };
    }),
  
  // 执行 pending_type 数据库迁移
  migratePendingType: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
      }
      
      const { migratePendingType } = await import('./migrate-production');
      const db = await import('./db').then(m => m.getDb());
      
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
      }
      
      const result = await migratePendingType(db);
      
      if (!result.success) {
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `迁移失败: ${result.error}` 
        });
      }
      
      return result;
    }),

  // 获取脱动共享商盟完整架构文档（建站规则页使用）
  getMerchantArchitectureDoc: publicProcedure
    .query(async () => {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        // 文档存放在项目根目录（与 server 同级）
        const docPath = path.resolve(process.cwd(), 'maidong-merchant-architecture.md');
        const content = await fs.readFile(docPath, 'utf-8');
        return { content, updatedAt: new Date() };
      } catch {
        // 如果文件不在项目目录，尝试上级目录
        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          const docPath = path.resolve(process.cwd(), '..', 'maidong-merchant-architecture.md');
          const content = await fs.readFile(docPath, 'utf-8');
          return { content, updatedAt: new Date() };
        } catch {
           return { content: '文档加载失败，请联系管理员', updatedAt: new Date() };
        }
      }
    }),


});
export type AppRouter = typeof appRouter;
