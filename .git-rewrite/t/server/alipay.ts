/**
 * 支付宝 WAP 手机支付服务
 * 使用 alipay-sdk 官方包，RSA2 签名方式
 */
import { AlipaySdk } from "alipay-sdk";

// 格式化私钥：确保包含 PEM 头尾
function formatPrivateKey(key: string): string {
  const stripped = key
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return `-----BEGIN RSA PRIVATE KEY-----\n${stripped.match(/.{1,64}/g)?.join("\n")}\n-----END RSA PRIVATE KEY-----`;
}

// 格式化支付宝公钥
function formatPublicKey(key: string): string {
  const stripped = key
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return `-----BEGIN PUBLIC KEY-----\n${stripped.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
}

let _sdk: AlipaySdk | null = null;

export function getAlipaySdk(): AlipaySdk {
  if (_sdk) return _sdk;
  const appId = process.env.ALIPAY_APP_ID || "";
  const privateKey = process.env.ALIPAY_APP_PRIVATE_KEY || "";
  const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY || "";

  if (!appId || !privateKey || !alipayPublicKey) {
    throw new Error("支付宝配置缺失：ALIPAY_APP_ID / ALIPAY_APP_PRIVATE_KEY / ALIPAY_PUBLIC_KEY");
  }

  _sdk = new AlipaySdk({
    appId,
    privateKey: formatPrivateKey(privateKey),
    alipayPublicKey: formatPublicKey(alipayPublicKey),
    signType: "RSA2",
    gateway: "https://openapi.alipay.com/gateway.do",
    timeout: 15000,
  });
  return _sdk;
}

export interface CreateWapOrderParams {
  orderId: string;       // 商户订单号（唯一）
  subject: string;       // 商品标题
  totalAmount: number;   // 金额（元）
  returnUrl: string;     // 支付完成后跳转的前端页面
  notifyUrl: string;     // 支付宝异步回调地址（后端接口）
  body?: string;         // 商品描述（可选）
}

/**
 * 创建支付宝 WAP 支付 URL（GET 方式，手机端直接跳转）
 * 返回支付宝支付链接，前端直接 window.location.href 跳转
 */
export function createWapPayUrl(params: CreateWapOrderParams): string {
  const sdk = getAlipaySdk();
  const payUrl = sdk.pageExecute("alipay.trade.wap.pay", "GET", {
    bizContent: {
      out_trade_no: params.orderId,
      subject: params.subject,
      total_amount: params.totalAmount.toFixed(2),
      product_code: "QUICK_WAP_WAY",
      body: params.body || params.subject,
    },
    returnUrl: params.returnUrl,
    notifyUrl: params.notifyUrl,
  });
  return payUrl as string;
}

/**
 * 创建支付宝 WAP 支付表单 HTML（POST 方式，自动提交）
 * 返回 HTML 表单字符串，前端 document.write 后自动跳转
 */
export function createWapPayForm(params: CreateWapOrderParams): string {
  const sdk = getAlipaySdk();
  const formHtml = sdk.pageExecute("alipay.trade.wap.pay", "POST", {
    bizContent: {
      out_trade_no: params.orderId,
      subject: params.subject,
      total_amount: params.totalAmount.toFixed(2),
      product_code: "QUICK_WAP_WAY",
      body: params.body || params.subject,
    },
    returnUrl: params.returnUrl,
    notifyUrl: params.notifyUrl,
  });
  return formHtml as string;
}

/**
 * 验证支付宝异步回调通知签名
 */
export function verifyAlipayNotify(params: Record<string, string>): boolean {
  try {
    const sdk = getAlipaySdk();
    return sdk.checkNotifySign(params);
  } catch (e) {
    console.error("[Alipay] 验签失败:", e);
    return false;
  }
}
