/**
 * 牙办齿科商城 - 支付后端路由（第三步第三批：网页兼容版双支付框架）
 *
 * 设计原则：
 *   - 多租户 SaaS：每家医院(tenant)的钱进各自商户号，平台不碰钱
 *   - 商户密钥(微信APIv3密钥/私钥、支付宝私钥/公钥)由 AES-256-GCM 加密后存库，接口返回一律脱敏
 *   - 支付单(shop_payment)与订单解耦：一个订单可多次支付，回调只更新支付单，再驱动订单状态
 *   - 金额一切以服务端为准：支付金额取订单 total_amount，不信任前端
 *   - 当前提供 mode=sandbox 模拟支付，跑通 下单→支付→改单 全流程；
 *     真实微信/支付宝渠道预留 createWechatPay/createAlipay 钩子，后期填商户密钥即可切 live
 *   - 全部使用 getDbConnection 原生 SQL，与项目现有写法一致
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import crypto from "crypto";
import { clearMerchantCache } from "./yaban-payment-service";
import { onOrderPaid } from "./yaban-order-fulfill-router";

const DEFAULT_TENANT_ID = 1;

// ============ 加解密工具（AES-256-GCM）============
// 密钥取环境变量 PAYMENT_SECRET_KEY；未配置时用固定兜底串派生，保证功能不崩（生产建议在 .env 配置）
function getCryptoKey(): Buffer {
  const raw = process.env.PAYMENT_SECRET_KEY || "haoyouji-yaban-shop-default-pay-secret-2026";
  return crypto.createHash("sha256").update(raw).digest(); // 32 bytes
}

function encryptSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getCryptoKey(), iv);
    const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    // 存储格式：iv:tag:cipher (hex)
    return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
  } catch {
    return null;
  }
}

function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const [ivHex, tagHex, dataHex] = String(stored).split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", getCryptoKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

// 脱敏：只显示是否已配置 + 末尾几位，绝不回传明文密钥
function mask(stored: string | null | undefined, plainHint?: string | null): string {
  if (!stored) return "";
  return "已配置（已加密保存）";
}

// 生成单号
function genNo(prefix: string): string {
  const ts = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  const datePart = `${ts.getFullYear()}${p(ts.getMonth() + 1)}${p(ts.getDate())}${p(ts.getHours())}${p(ts.getMinutes())}${p(ts.getSeconds())}`;
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `${prefix}${datePart}${rand}`;
}

// 读取某租户的商户配置（内部用，含解密）
async function loadMerchantConfig(conn: any, tenantId: number) {
  const [rows]: any = await conn.query(
    "SELECT * FROM shop_merchant_config WHERE tenant_id = ? LIMIT 1",
    [tenantId]
  );
  return rows && rows[0] ? rows[0] : null;
}

export const yabanPaymentRouter = router({
  // ============ 商户配置：管理端 ============
  // 读取当前租户商户配置（脱敏，不回传明文密钥）
  // TODO：上线前需收紧为 adminProcedure（当前与商品/订单后台口径一致，临时公开；密钥仅脱敏返回）
  adminGetMerchantConfig: publicProcedure
    .input(z.object({ tenantId: z.number().int().optional() }).optional())
    .query(async ({ input }) => {
      const tenantId = input?.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      try {
        const cfg = await loadMerchantConfig(conn, tenantId);
        if (!cfg) {
          return {
            tenantId,
            merchantName: "",
            mode: "sandbox",
            wxEnabled: false,
            wxAppid: "",
            wxMchId: "",
            wxApiKeySet: false,
            wxCertSerial: "",
            wxPrivateKeySet: false,
            aliEnabled: false,
            aliAppid: "",
            aliPrivateKeySet: false,
            aliPublicKeySet: false,
          };
        }
        return {
          tenantId,
          merchantName: cfg.merchant_name || "",
          mode: cfg.mode || "sandbox",
          wxEnabled: !!cfg.wx_enabled,
          wxAppid: cfg.wx_appid || "",
          wxMchId: cfg.wx_mch_id || "",
          wxApiKeySet: !!cfg.wx_api_key_enc,
          wxCertSerial: cfg.wx_cert_serial || "",
          wxPrivateKeySet: !!cfg.wx_private_key_enc,
          aliEnabled: !!cfg.ali_enabled,
          aliAppid: cfg.ali_appid || "",
          aliPrivateKeySet: !!cfg.ali_private_key_enc,
          aliPublicKeySet: !!cfg.ali_public_key_enc,
        };
      } finally {
        conn.release?.();
      }
    }),

  // 保存当前租户商户配置（密钥字段留空表示“不修改”，传值则加密覆盖）
  // TODO：上线前需收紧为 adminProcedure
  adminSaveMerchantConfig: publicProcedure
    .input(
      z.object({
        tenantId: z.number().int().optional(),
        merchantName: z.string().max(128).optional(),
        mode: z.enum(["sandbox", "live"]).optional(),
        wxEnabled: z.boolean().optional(),
        wxAppid: z.string().max(64).optional(),
        wxMchId: z.string().max(64).optional(),
        wxApiKey: z.string().optional(), // 明文传入，服务端加密；留空=不改
        wxCertSerial: z.string().max(128).optional(),
        wxPrivateKey: z.string().optional(),
        aliEnabled: z.boolean().optional(),
        aliAppid: z.string().max(64).optional(),
        aliPrivateKey: z.string().optional(),
        aliPublicKey: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const conn = await getDbConnection();
      try {
        const existing = await loadMerchantConfig(conn, tenantId);
        // 密钥字段：传了非空值才加密更新，否则保留原值
        const wxApiKeyEnc =
          input.wxApiKey && input.wxApiKey.trim()
            ? encryptSecret(input.wxApiKey.trim())
            : existing?.wx_api_key_enc ?? null;
        const wxPrivEnc =
          input.wxPrivateKey && input.wxPrivateKey.trim()
            ? encryptSecret(input.wxPrivateKey.trim())
            : existing?.wx_private_key_enc ?? null;
        const aliPrivEnc =
          input.aliPrivateKey && input.aliPrivateKey.trim()
            ? encryptSecret(input.aliPrivateKey.trim())
            : existing?.ali_private_key_enc ?? null;
        const aliPubEnc =
          input.aliPublicKey && input.aliPublicKey.trim()
            ? encryptSecret(input.aliPublicKey.trim())
            : existing?.ali_public_key_enc ?? null;

        if (existing) {
          await conn.query(
            `UPDATE shop_merchant_config SET
               merchant_name = ?, mode = ?,
               wx_enabled = ?, wx_appid = ?, wx_mch_id = ?, wx_api_key_enc = ?, wx_cert_serial = ?, wx_private_key_enc = ?,
               ali_enabled = ?, ali_appid = ?, ali_private_key_enc = ?, ali_public_key_enc = ?
             WHERE tenant_id = ?`,
            [
              input.merchantName ?? existing.merchant_name ?? null,
              input.mode ?? existing.mode ?? "sandbox",
              input.wxEnabled !== undefined ? (input.wxEnabled ? 1 : 0) : existing.wx_enabled,
              input.wxAppid ?? existing.wx_appid ?? null,
              input.wxMchId ?? existing.wx_mch_id ?? null,
              wxApiKeyEnc,
              input.wxCertSerial ?? existing.wx_cert_serial ?? null,
              wxPrivEnc,
              input.aliEnabled !== undefined ? (input.aliEnabled ? 1 : 0) : existing.ali_enabled,
              input.aliAppid ?? existing.ali_appid ?? null,
              aliPrivEnc,
              aliPubEnc,
              tenantId,
            ]
          );
        } else {
          await conn.query(
            `INSERT INTO shop_merchant_config
               (tenant_id, merchant_name, mode, wx_enabled, wx_appid, wx_mch_id, wx_api_key_enc, wx_cert_serial, wx_private_key_enc,
                ali_enabled, ali_appid, ali_private_key_enc, ali_public_key_enc)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              tenantId,
              input.merchantName ?? null,
              input.mode ?? "sandbox",
              input.wxEnabled ? 1 : 0,
              input.wxAppid ?? null,
              input.wxMchId ?? null,
              wxApiKeyEnc,
              input.wxCertSerial ?? null,
              wxPrivEnc,
              input.aliEnabled ? 1 : 0,
              input.aliAppid ?? null,
              aliPrivEnc,
              aliPubEnc,
            ]
          );
        }
        // 密钥/模式变更后失效该租户的 SDK 实例缓存，下次调用重建
        try { clearMerchantCache(tenantId); } catch {}
        return { ok: true };
      } finally {
        conn.release?.();
      }
    }),

  // ============ 支付：客人端 ============
  // 查询某渠道在当前租户是否可用（前端收银台据此展示按钮）
  getPayMethods: publicProcedure
    .input(z.object({ orderNo: z.string() }))
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      try {
        const [orders]: any = await conn.query(
          "SELECT tenant_id FROM shop_order WHERE order_no = ? LIMIT 1",
          [input.orderNo]
        );
        if (!orders || !orders[0]) throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
        const tenantId = orders[0].tenant_id;
        const cfg = await loadMerchantConfig(conn, tenantId);
        const mode = cfg?.mode || "sandbox";
        // sandbox 模式下两种方式都可用（模拟）；live 模式下取决于商户是否启用
        const wechat = mode === "sandbox" ? true : !!cfg?.wx_enabled;
        const alipay = mode === "sandbox" ? true : !!cfg?.ali_enabled;
        return { mode, wechat, alipay };
      } finally {
        conn.release?.();
      }
    }),

  // 创建支付单并发起支付（当前 sandbox 返回模拟支付参数；live 预留渠道调用）
  createPayment: protectedProcedure
    .input(
      z.object({
        orderNo: z.string(),
        channel: z.enum(["wechat", "alipay"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
      const conn = await getDbConnection();
      try {
        const [orders]: any = await conn.query(
          "SELECT * FROM shop_order WHERE order_no = ? LIMIT 1",
          [input.orderNo]
        );
        if (!orders || !orders[0]) throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
        const order = orders[0];
        if (order.user_id !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "无权支付该订单" });
        if (order.pay_status === "paid") {
          return { alreadyPaid: true, paymentNo: null, mode: "live" };
        }

        const cfg = await loadMerchantConfig(conn, order.tenant_id);
        const mode = cfg?.mode || "sandbox";
        const amount = Number(order.total_amount); // 金额以服务端订单为准

        const paymentNo = genNo("PAY");
        await conn.query(
          `INSERT INTO shop_payment
             (payment_no, tenant_id, order_id, order_no, user_id, channel, amount, status, mode)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [paymentNo, order.tenant_id, order.id, order.order_no, userId, input.channel, amount, "pending", mode]
        );

        if (mode === "sandbox") {
          // 模拟支付：返回一个标识，前端确认后调 mockPaySuccess 完成
          return {
            mode: "sandbox",
            paymentNo,
            amount,
            channel: input.channel,
            // 前端凭此展示“模拟支付”确认弹窗
            sandbox: true,
          };
        }

        // ===== live 模式：真实渠道（预留，待商户密钥到位后实现）=====
        // const wxKey = decryptSecret(cfg?.wx_api_key_enc); ...调用微信/支付宝下单，返回 prepay_id/二维码/跳转链接
        throw new TRPCError({
          code: "NOT_IMPLEMENTED" as any,
          message: "真实支付渠道尚未配置商户密钥，请先在后台完成支付设置",
        });
      } finally {
        conn.release?.();
      }
    }),

  // 模拟支付完成（仅 sandbox 模式有效）：标记支付单成功并驱动订单状态
  mockPaySuccess: protectedProcedure
    .input(z.object({ paymentNo: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any).user?.id;
      const conn = await getDbConnection();
      try {
        const [pays]: any = await conn.query(
          "SELECT * FROM shop_payment WHERE payment_no = ? LIMIT 1",
          [input.paymentNo]
        );
        if (!pays || !pays[0]) throw new TRPCError({ code: "NOT_FOUND", message: "支付单不存在" });
        const pay = pays[0];
        if (pay.user_id !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "无权操作" });
        if (pay.mode !== "sandbox") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "非模拟支付不可手动完成" });
        }
        if (pay.status === "success") {
          return { ok: true, already: true };
        }
        const tradeNo = "MOCK" + Date.now();
        await conn.query(
          "UPDATE shop_payment SET status='success', trade_no=?, paid_at=CURRENT_TIMESTAMP WHERE id=?",
          [tradeNo, pay.id]
        );
        // 驱动订单：支付状态 paid、pending->confirmed、服务单生成核销码、写日志
        await onOrderPaid(conn, pay.order_id, pay.channel);
        return { ok: true, tradeNo };
      } finally {
        conn.release?.();
      }
    }),

  // 查询支付单状态（前端轮询/结果页用）
  getPaymentStatus: protectedProcedure
    .input(z.object({ paymentNo: z.string() }))
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      try {
        const [pays]: any = await conn.query(
          "SELECT payment_no, order_no, channel, amount, status, mode, paid_at FROM shop_payment WHERE payment_no = ? LIMIT 1",
          [input.paymentNo]
        );
        if (!pays || !pays[0]) throw new TRPCError({ code: "NOT_FOUND", message: "支付单不存在" });
        const p = pays[0];
        return {
          paymentNo: p.payment_no,
          orderNo: p.order_no,
          channel: p.channel,
          amount: Number(p.amount),
          status: p.status,
          mode: p.mode,
          paidAt: p.paid_at,
        };
      } finally {
        conn.release?.();
      }
    }),
});
