/**
 * 牙办齿科商城 - 真实支付 HTTP 路由（第三步第四批）
 *
 * 这些接口必须是原生 Express（非 tRPC），因为：
 *   - 支付宝/微信服务器会直接 POST 异步回调到后端，无登录态、需按各自规范验签并返回固定文本/JSON
 *   - live 模式创建支付需返回可跳转 URL，前端 window.location 跳转
 *
 * 路由：
 *   POST /api/yaban-pay/create        创建 live 支付（需登录），返回 { payUrl, paymentNo }
 *   POST /api/yaban-pay/alipay/notify 支付宝异步回调（验签→驱动订单）→ 返回 "success"
 *   GET  /api/yaban-pay/alipay/return 支付宝同步跳转→重定向到结果页
 *   POST /api/yaban-pay/wechat/notify 微信异步回调（解密验签→驱动订单）→ 返回 {code,message}
 *
 * 安全：金额一律以服务端订单 total_amount 为准；回调只认数据库已存在的支付单，幂等更新。
 */
import { Router, Request, Response } from "express";
import { getDbConnection } from "./db";
import { sdk } from "./_core/sdk";
import {
  createAlipayWapUrl,
  verifyAlipayNotify,
  createWechatH5Url,
  decryptWxNotify,
} from "./yaban-payment-service";

const router = Router();
const DEFAULT_TENANT_ID = 1;

function genNo(prefix: string): string {
  const ts = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  const datePart = `${ts.getFullYear()}${p(ts.getMonth() + 1)}${p(ts.getDate())}${p(ts.getHours())}${p(ts.getMinutes())}${p(ts.getSeconds())}`;
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `${prefix}${datePart}${rand}`;
}

async function loadMerchantConfig(conn: any, tenantId: number) {
  const [rows]: any = await conn.query(
    "SELECT * FROM shop_merchant_config WHERE tenant_id = ? LIMIT 1",
    [tenantId]
  );
  return rows && rows[0] ? rows[0] : null;
}

function getHost(req: Request): string {
  const protocol = (req.headers["x-forwarded-proto"] as string) || "https";
  const hostHeader =
    (req.headers["x-forwarded-host"] as string) || req.headers.host || "www.haoyouji.cn";
  return `${protocol}://${hostHeader}`;
}

// 幂等：标记支付单成功并驱动订单（成功才驱动；已成功则跳过）
async function markPaymentSuccess(conn: any, paymentNo: string, tradeNo: string, rawJson: string) {
  const [pays]: any = await conn.query(
    "SELECT * FROM shop_payment WHERE payment_no = ? LIMIT 1",
    [paymentNo]
  );
  if (!pays || !pays[0]) {
    console.warn(`[YabanPay] 回调找不到支付单: ${paymentNo}`);
    return false;
  }
  const pay = pays[0];
  if (pay.status === "success") return true; // 幂等
  await conn.query(
    "UPDATE shop_payment SET status='success', trade_no=?, callback_raw=?, paid_at=CURRENT_TIMESTAMP WHERE id=?",
    [tradeNo, rawJson?.slice(0, 60000) || null, pay.id]
  );
  await conn.query(
    "UPDATE shop_order SET pay_status='paid', pay_method=?, order_status=IF(order_status='pending','confirmed',order_status) WHERE id=?",
    [pay.channel, pay.order_id]
  );
  console.log(`[YabanPay] 支付单 ${paymentNo} 成功，订单 ${pay.order_no} 已置为已支付`);
  return true;
}

// ─────────────────────────────────────────────
// POST /api/yaban-pay/create  （live 模式创建真实支付）
// Body: { orderNo, channel: 'wechat'|'alipay' }
// ─────────────────────────────────────────────
router.post("/api/yaban-pay/create", async (req: Request, res: Response) => {
  const conn: any = await getDbConnection();
  try {
    // 校验登录
    let userId: number | null = null;
    try {
      const user = await sdk.authenticateRequest(req as any);
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }
    if (!userId) return res.status(401).json({ error: "请先登录" });

    const { orderNo, channel } = req.body as { orderNo?: string; channel?: string };
    if (!orderNo || (channel !== "wechat" && channel !== "alipay")) {
      return res.status(400).json({ error: "参数错误：orderNo / channel" });
    }

    const [orders]: any = await conn.query(
      "SELECT * FROM shop_order WHERE order_no = ? LIMIT 1",
      [orderNo]
    );
    if (!orders || !orders[0]) return res.status(404).json({ error: "订单不存在" });
    const order = orders[0];
    if (order.user_id !== userId) return res.status(403).json({ error: "无权支付该订单" });
    if (order.pay_status === "paid") return res.json({ alreadyPaid: true });

    const cfg = await loadMerchantConfig(conn, order.tenant_id);
    const mode = cfg?.mode || "sandbox";
    if (mode !== "live") {
      return res.status(400).json({ error: "当前为模拟支付模式，请走收银台模拟支付" });
    }
    if (channel === "wechat" && !cfg?.wx_enabled) {
      return res.status(400).json({ error: "该门店未启用微信支付" });
    }
    if (channel === "alipay" && !cfg?.ali_enabled) {
      return res.status(400).json({ error: "该门店未启用支付宝" });
    }

    const amount = Number(order.total_amount); // 服务端金额为准
    const paymentNo = genNo("PAY");
    await conn.query(
      `INSERT INTO shop_payment
         (payment_no, tenant_id, order_id, order_no, user_id, channel, amount, status, mode)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [paymentNo, order.tenant_id, order.id, order.order_no, userId, channel, amount, "pending", "live"]
    );

    const host = getHost(req);
    const subject = `齿科商城-${order.order_no}`;

    if (channel === "alipay") {
      const notifyUrl = `${host}/api/yaban-pay/alipay/notify`;
      const returnUrl = `${host}/yaban/shop/pay-result?paymentNo=${paymentNo}`;
      const payUrl = createAlipayWapUrl(order.tenant_id, cfg, {
        outTradeNo: paymentNo,
        subject,
        totalAmount: amount,
        returnUrl,
        notifyUrl,
      });
      return res.json({ success: true, paymentNo, payUrl, channel });
    } else {
      const notifyUrl = `${host}/api/yaban-pay/wechat/notify`;
      const clientIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        "127.0.0.1";
      const payUrl = await createWechatH5Url(order.tenant_id, cfg, {
        outTradeNo: paymentNo,
        description: subject,
        totalFen: Math.round(amount * 100),
        notifyUrl,
        clientIp,
        appName: "好友记齿科商城",
        appUrl: host,
      });
      // 微信 h5_url 跳转后支付完成由微信回跳商户配置的 redirect_url，这里附带 paymentNo 供结果页轮询
      const redirect = encodeURIComponent(`${host}/yaban/shop/pay-result?paymentNo=${paymentNo}`);
      return res.json({ success: true, paymentNo, payUrl: `${payUrl}&redirect_url=${redirect}`, channel });
    }
  } catch (err: any) {
    console.error("[YabanPay] create error:", err);
    return res.status(500).json({ error: err?.message || "创建支付失败" });
  } finally {
    conn.release?.();
  }
});

// ─────────────────────────────────────────────
// POST /api/yaban-pay/alipay/notify  支付宝异步回调
// ─────────────────────────────────────────────
router.post("/api/yaban-pay/alipay/notify", async (req: Request, res: Response) => {
  const conn: any = await getDbConnection();
  try {
    const params = req.body as Record<string, string>;
    const outTradeNo = params.out_trade_no; // = paymentNo
    if (!outTradeNo) return res.send("fail");

    // 先取支付单拿 tenantId，再用该租户密钥验签
    const [pays]: any = await conn.query(
      "SELECT * FROM shop_payment WHERE payment_no = ? LIMIT 1",
      [outTradeNo]
    );
    if (!pays || !pays[0]) return res.send("fail");
    const pay = pays[0];
    const cfg = await loadMerchantConfig(conn, pay.tenant_id);
    if (!cfg) return res.send("fail");

    const valid = verifyAlipayNotify(pay.tenant_id, cfg, params);
    if (!valid) {
      console.warn("[YabanPay][Ali] 验签失败", outTradeNo);
      return res.send("fail");
    }

    // 金额核对（防篡改）
    const notifyAmount = Number(params.total_amount);
    if (Math.abs(notifyAmount - Number(pay.amount)) > 0.01) {
      console.warn(`[YabanPay][Ali] 金额不符 expect=${pay.amount} got=${notifyAmount}`);
      return res.send("fail");
    }

    const status = params.trade_status;
    if (status === "TRADE_SUCCESS" || status === "TRADE_FINISHED") {
      await markPaymentSuccess(conn, outTradeNo, params.trade_no, JSON.stringify(params));
    }
    return res.send("success");
  } catch (err) {
    console.error("[YabanPay][Ali] notify error:", err);
    return res.send("fail");
  } finally {
    conn.release?.();
  }
});

// 支付宝同步跳转
router.get("/api/yaban-pay/alipay/return", (req: Request, res: Response) => {
  const paymentNo = (req.query.out_trade_no as string) || "";
  return res.redirect(`/yaban/shop/pay-result?paymentNo=${paymentNo}`);
});

// ─────────────────────────────────────────────
// POST /api/yaban-pay/wechat/notify  微信异步回调（APIv3）
// ─────────────────────────────────────────────
router.post("/api/yaban-pay/wechat/notify", async (req: Request, res: Response) => {
  const conn: any = await getDbConnection();
  try {
    const body = req.body || {};
    const resource = body.resource;
    if (!resource) {
      return res.status(400).json({ code: "FAIL", message: "缺少 resource" });
    }
    // 微信回调的 out_trade_no 在解密后才能拿到，但需要 tenant 才能解密；
    // 策略：先解密尝试每个启用微信的租户的 key 不现实，这里改为：商户回调 URL 在下单时已固定指向本接口，
    // 通过解密后的 out_trade_no(=paymentNo) 反查租户；为此先用“候选租户”逐一尝试解密。
    // 实战中通常单租户/少量租户，遍历启用微信的配置逐个解密直到成功。
    const [cfgRows]: any = await conn.query(
      "SELECT * FROM shop_merchant_config WHERE wx_enabled = 1 AND mode = 'live'"
    );
    let decrypted: any = null;
    let matchedCfg: any = null;
    for (const cfg of cfgRows || []) {
      const plain = decryptWxNotify(cfg.tenant_id, cfg, resource);
      if (plain && plain.out_trade_no) {
        decrypted = plain;
        matchedCfg = cfg;
        break;
      }
    }
    if (!decrypted) {
      console.warn("[YabanPay][Wx] 无法解密回调");
      return res.status(400).json({ code: "FAIL", message: "解密失败" });
    }

    const paymentNo = decrypted.out_trade_no;
    const tradeState = decrypted.trade_state; // SUCCESS
    const transactionId = decrypted.transaction_id || "";
    const payAmount = decrypted.amount?.total; // 分

    const [pays]: any = await conn.query(
      "SELECT * FROM shop_payment WHERE payment_no = ? LIMIT 1",
      [paymentNo]
    );
    if (!pays || !pays[0]) {
      return res.status(200).json({ code: "SUCCESS", message: "ok" });
    }
    const pay = pays[0];
    // 金额核对
    if (payAmount != null && Math.abs(Number(payAmount) - Math.round(Number(pay.amount) * 100)) > 1) {
      console.warn(`[YabanPay][Wx] 金额不符 expect=${Math.round(pay.amount * 100)} got=${payAmount}`);
      return res.status(400).json({ code: "FAIL", message: "金额不符" });
    }
    if (tradeState === "SUCCESS") {
      await markPaymentSuccess(conn, paymentNo, transactionId, JSON.stringify(decrypted));
    }
    return res.status(200).json({ code: "SUCCESS", message: "成功" });
  } catch (err) {
    console.error("[YabanPay][Wx] notify error:", err);
    return res.status(500).json({ code: "FAIL", message: "处理失败" });
  } finally {
    conn.release?.();
  }
});

export default router;
