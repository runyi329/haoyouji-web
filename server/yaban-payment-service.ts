/**
 * 牙办齿科商城 - 多租户真实支付服务（第三步第四批：真实渠道接入）
 *
 * 设计原则：
 *   - 多租户：按 tenantId 读取该医院加密的商户密钥，动态实例化对应 SDK，钱进各自商户号
 *   - 支付宝：手机网站支付 alipay.trade.wap.pay，返回可跳转的支付链接；异步回调用 checkNotifySign 验签
 *   - 微信：H5 支付 /v3/pay/transactions/h5，返回 h5_url 供跳转；回调用 APIv3 密钥 AES-256-GCM 解密验签
 *   - 所有密钥从 shop_merchant_config 解密取出，绝不出现在前端
 *   - SDK 实例按 tenantId 缓存，配置变更时可调用 clearMerchantCache 失效
 */
import { AlipaySdk } from "alipay-sdk";
import WxPay from "wechatpay-node-v3";
import crypto from "crypto";

// ============ 加解密（与 yaban-payment-router 保持一致）============
function getCryptoKey(): Buffer {
  const raw = process.env.PAYMENT_SECRET_KEY || "haoyouji-yaban-shop-default-pay-secret-2026";
  return crypto.createHash("sha256").update(raw).digest();
}

export function decryptSecret(stored: string | null | undefined): string | null {
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

// ============ 密钥格式化（兼容用户可能粘贴的无 PEM 头尾的纯 base64）============
function formatAliPrivateKey(key: string): string {
  if (key.includes("BEGIN")) return key;
  const stripped = key.replace(/\s+/g, "");
  return `-----BEGIN RSA PRIVATE KEY-----\n${stripped.match(/.{1,64}/g)?.join("\n")}\n-----END RSA PRIVATE KEY-----`;
}
function formatAliPublicKey(key: string): string {
  if (key.includes("BEGIN")) return key;
  const stripped = key.replace(/\s+/g, "");
  return `-----BEGIN PUBLIC KEY-----\n${stripped.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
}

// ============ 按租户缓存 SDK 实例 ============
const aliCache = new Map<number, AlipaySdk>();
const wxCache = new Map<number, any>();

export function clearMerchantCache(tenantId?: number) {
  if (tenantId === undefined) {
    aliCache.clear();
    wxCache.clear();
  } else {
    aliCache.delete(tenantId);
    wxCache.delete(tenantId);
  }
}

// cfg 为 shop_merchant_config 行（含加密字段）
export function getAlipaySdkForTenant(tenantId: number, cfg: any): AlipaySdk {
  if (aliCache.has(tenantId)) return aliCache.get(tenantId)!;
  const appId = cfg?.ali_appid || "";
  const privateKey = decryptSecret(cfg?.ali_private_key_enc);
  const publicKey = decryptSecret(cfg?.ali_public_key_enc);
  if (!appId || !privateKey || !publicKey) {
    throw new Error("支付宝商户配置不完整（AppID/应用私钥/支付宝公钥）");
  }
  const sdk = new AlipaySdk({
    appId,
    privateKey: formatAliPrivateKey(privateKey),
    alipayPublicKey: formatAliPublicKey(publicKey),
    signType: "RSA2",
    gateway: "https://openapi.alipay.com/gateway.do",
    timeout: 15000,
  });
  aliCache.set(tenantId, sdk);
  return sdk;
}

export function getWxPayForTenant(tenantId: number, cfg: any): any {
  if (wxCache.has(tenantId)) return wxCache.get(tenantId)!;
  const appid = cfg?.wx_appid || "";
  const mchid = cfg?.wx_mch_id || "";
  const apiKey = decryptSecret(cfg?.wx_api_key_enc); // APIv3 密钥
  const privateKey = decryptSecret(cfg?.wx_private_key_enc); // 商户私钥 apiclient_key.pem 内容
  const serialNo = cfg?.wx_cert_serial || "";
  if (!appid || !mchid || !apiKey || !privateKey) {
    throw new Error("微信支付商户配置不完整（AppID/商户号/APIv3密钥/商户私钥）");
  }
  // wechatpay-node-v3 需要 publicKey(证书) 与 privateKey；
  // H5 下单+回调解密仅需 privateKey + key(APIv3) + serial_no，publicKey 传私钥占位避免库初始化报错
  const pay = new WxPay({
    appid,
    mchid,
    serial_no: serialNo,
    publicKey: Buffer.from(privateKey), // 占位（H5下单不强依赖商户证书公钥）
    privateKey: Buffer.from(privateKey),
    key: apiKey,
  } as any);
  wxCache.set(tenantId, pay);
  return pay;
}

// ============ 支付宝：创建 WAP 支付链接 ============
export interface AliWapParams {
  outTradeNo: string;
  subject: string;
  totalAmount: number; // 元
  returnUrl: string;
  notifyUrl: string;
}
export function createAlipayWapUrl(tenantId: number, cfg: any, params: AliWapParams): string {
  const sdk = getAlipaySdkForTenant(tenantId, cfg);
  const url = sdk.pageExecute("alipay.trade.wap.pay", "GET", {
    bizContent: {
      out_trade_no: params.outTradeNo,
      subject: params.subject,
      total_amount: params.totalAmount.toFixed(2),
      product_code: "QUICK_WAP_WAY",
      body: params.subject,
    },
    returnUrl: params.returnUrl,
    notifyUrl: params.notifyUrl,
  });
  return url as string;
}

export function verifyAlipayNotify(tenantId: number, cfg: any, params: Record<string, string>): boolean {
  try {
    const sdk = getAlipaySdkForTenant(tenantId, cfg);
    return sdk.checkNotifySign(params);
  } catch (e) {
    console.error("[YabanPay][Ali] 验签失败:", e);
    return false;
  }
}

// ============ 微信：创建 H5 支付（返回 h5_url）============
export interface WxH5Params {
  outTradeNo: string;
  description: string;
  totalFen: number; // 分
  notifyUrl: string;
  clientIp: string;
  appName: string;
  appUrl: string;
}
export async function createWechatH5Url(tenantId: number, cfg: any, params: WxH5Params): Promise<string> {
  const pay = getWxPayForTenant(tenantId, cfg);
  const reqParams: any = {
    appid: cfg.wx_appid,
    mchid: cfg.wx_mch_id,
    description: params.description,
    out_trade_no: params.outTradeNo,
    notify_url: params.notifyUrl,
    amount: { total: params.totalFen, currency: "CNY" },
    scene_info: {
      payer_client_ip: params.clientIp || "127.0.0.1",
      h5_info: { type: "Wap", app_name: params.appName, app_url: params.appUrl },
    },
  };
  // 库内置 transactions_h5 封装
  const result = await pay.transactions_h5(reqParams);
  // 兼容不同返回结构
  const data = (result && (result.data || result)) || {};
  const h5Url = data.h5_url || result?.h5_url;
  if (!h5Url) {
    throw new Error(`微信H5下单失败：${JSON.stringify(result)}`);
  }
  return h5Url as string;
}

// 微信回调解密：resource 为回调 body 中的 resource 对象
export function decryptWxNotify(tenantId: number, cfg: any, resource: any): any | null {
  try {
    const pay = getWxPayForTenant(tenantId, cfg);
    const { ciphertext, associated_data, nonce } = resource || {};
    // 库提供 decipher_gcm(ciphertext, associated_data, nonce, apiv3key)
    const apiKey = decryptSecret(cfg?.wx_api_key_enc) || "";
    const plain = pay.decipher_gcm(ciphertext, associated_data, nonce, apiKey);
    return plain;
  } catch (e) {
    console.error("[YabanPay][Wx] 回调解密失败:", e);
    return null;
  }
}
