/**
 * 支付宝 WAP 手机支付 Express 路由
 * POST /api/alipay/create-order  → 生成支付宝支付表单
 * POST /api/alipay/notify        → 支付宝异步回调（验签+更新订单）
 * GET  /api/alipay/return        → 支付完成同步跳转（前端重定向）
 */
import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { createWapPayUrl, createWapPayForm, verifyAlipayNotify } from "./alipay";
import { getDb } from "./db";
import { rechargeOrders } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";

const router = Router();

// ─────────────────────────────────────────────
// 工具：从请求中解析当前用户 ID
// ─────────────────────────────────────────────
async function getUserIdFromRequest(req: Request): Promise<number | null> {
  try {
    const user = await sdk.authenticateRequest(req);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// POST /api/alipay/create-order
// Body: { productId, productName, amount }
// ─────────────────────────────────────────────
router.post("/api/alipay/create-order", async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "请先登录" });
    }

    const { productId, productName, amount } = req.body as {
      productId?: string;
      productName?: string;
      amount?: number;
    };

    if (!productId || !productName || !amount || amount <= 0) {
      return res.status(400).json({ error: "参数缺失：productId / productName / amount" });
    }

    // 生成唯一订单号（最长 64 位）
    const orderId = `HYJ${Date.now()}${nanoid(6)}`;

    // 过期时间 30 分钟
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    // 写入数据库
    const db = await getDb();
    if (db) {
      await db.insert(rechargeOrders).values({
        userId,
        orderNo: orderId,
        amount: amount.toFixed(2),
        currency: "CNY",
        network: "ALIPAY",
        status: "pending",
        expiresAt,
      });
    }

    // 构建回调地址
    const host = req.headers.origin || `https://${req.headers.host}`;
    const notifyUrl = `${host}/api/alipay/notify`;
    const returnUrl = `${host}/payment/result?orderId=${orderId}`;

    // 生成支付宝 WAP 支付链接（GET 方式，手机端直接跳转）
    const payUrl = createWapPayUrl({
      orderId,
      subject: productName,
      totalAmount: amount,
      returnUrl,
      notifyUrl,
      body: `好友记-${productName}`,
    });

    return res.json({ success: true, orderId, payUrl });
  } catch (err: any) {
    console.error("[Alipay] create-order error:", err);
    return res.status(500).json({ error: err?.message || "创建订单失败" });
  }
});

// ─────────────────────────────────────────────
// POST /api/alipay/notify
// 支付宝异步回调（必须返回纯文本 "success"）
// ─────────────────────────────────────────────
router.post("/api/alipay/notify", async (req: Request, res: Response) => {
  try {
    const params = req.body as Record<string, string>;
    console.log("[Alipay] notify params:", params);

    // 验证签名
    const valid = verifyAlipayNotify(params);
    if (!valid) {
      console.warn("[Alipay] 签名验证失败");
      return res.send("fail");
    }

    const tradeStatus = params.trade_status;
    const outTradeNo = params.out_trade_no;

    // 只处理支付成功状态
    if (tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") {
      const db = await getDb();
      if (db) {
        await db
          .update(rechargeOrders)
          .set({
            status: "completed",
            txnHash: params.trade_no, // 支付宝交易号存入 txnHash 字段
            completedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
          })
          .where(eq(rechargeOrders.orderNo, outTradeNo));
      }
      console.log(`[Alipay] 订单 ${outTradeNo} 支付成功，交易号: ${params.trade_no}`);
    }

    return res.send("success");
  } catch (err) {
    console.error("[Alipay] notify error:", err);
    return res.send("fail");
  }
});

// ─────────────────────────────────────────────
// GET /api/alipay/return
// 支付完成同步跳转（支付宝 GET 回调，重定向到前端结果页）
// ─────────────────────────────────────────────
router.get("/api/alipay/return", (req: Request, res: Response) => {
  const outTradeNo = req.query.out_trade_no as string;
  const tradeNo = req.query.trade_no as string;
  const resultStatus = req.query.trade_status as string;
  // 重定向到前端结果页
  const redirectUrl = `/payment/result?orderId=${outTradeNo}&tradeNo=${tradeNo}&status=${resultStatus || "success"}`;
  return res.redirect(redirectUrl);
});

// ─────────────────────────────────────────────
// GET /api/alipay/order-status?orderId=xxx
// 查询订单状态（前端轮询用）
// ─────────────────────────────────────────────
router.get("/api/alipay/order-status", async (req: Request, res: Response) => {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "请先登录" });
    }
    const orderId = req.query.orderId as string;
    if (!orderId) {
      return res.status(400).json({ error: "缺少 orderId 参数" });
    }
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "数据库连接失败" });
    }
    const rows = await db
      .select()
      .from(rechargeOrders)
      .where(eq(rechargeOrders.orderNo, orderId))
      .limit(1);
    if (!rows.length) {
      return res.status(404).json({ error: "订单不存在" });
    }
    const order = rows[0];
    // 安全检查：只允许本人查询
    if (order.userId !== userId) {
      return res.status(403).json({ error: "无权限" });
    }
    return res.json({ success: true, status: order.status, orderId });
  } catch (err: any) {
    console.error("[Alipay] order-status error:", err);
    return res.status(500).json({ error: err?.message || "查询失败" });
  }
});

// ─────────────────────────────────────────────
// POST /api/alipay/feedback-pay
// 意见本客户端支付（公开接口，无需登录）
// Body: { amount, ledgerId, subject? }
// ─────────────────────────────────────────────
router.post("/api/alipay/feedback-pay", async (req: Request, res: Response) => {
  try {
    const { amount, ledgerId, subject } = req.body as {
      amount?: number;
      ledgerId?: string | number;
      subject?: string;
    };

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "请输入有效的消费金额" });
    }

    // 生成唯一订单号
    const orderId = `FB${Date.now()}${nanoid(6)}`;

    // 构建回调地址
    const host = req.headers.origin || `https://${req.headers.host}`;
    const notifyUrl = `${host}/api/alipay/notify`;
    const returnUrl = `${host}/feedback/${ledgerId || ""}?paid=1&orderId=${orderId}`;

    const paySubject = subject || "好友记-意见反馈95折优惠";

    // 生成支付宝 WAP 支付链接
    const payUrl = createWapPayUrl({
      orderId,
      subject: paySubject,
      totalAmount: amount,
      returnUrl,
      notifyUrl,
      body: paySubject,
    });

    console.log(`[Alipay] feedback-pay 订单创建: ${orderId}, 金额: ${amount}, ledgerId: ${ledgerId}`);

    return res.json({ success: true, orderId, payUrl });
  } catch (err: any) {
    console.error("[Alipay] feedback-pay error:", err);
    return res.status(500).json({ error: err?.message || "创建支付订单失败" });
  }
});

export default router;
