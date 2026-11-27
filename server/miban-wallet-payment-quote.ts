import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ENV } from "./_core/env";
import { AI_WALLET_ASSET_CATALOG } from "../shared/ai-wallet-assets";
import {
  MIBAN_PAYMENT_ASSETS,
  MIBAN_PAYMENT_QUOTE_TTL_MS,
  PAYMENT_SCALE,
  normalizeMibanPaymentAssetCode,
  paymentDecimalUnits,
  paymentUnitsText,
  type MibanPaymentAsset,
  type MibanWalletPaymentQuote,
} from "../shared/miban-wallet-payment";

const DOMAIN = "miban-wallet-payment-quote:v1:";
type FundingBalance = { total: number | string; frozen: number | string; available: number | string };
type WalletAssetBalance = { assetCode: string; assetName?: string; availableBalance: string | number; frozenBalance: string | number };
type Market = {
  prices: Record<string, number>;
  updatedAt: Record<string, string>;
  health: Record<string, { stale?: boolean; lastSuccessAt?: string | null }>;
  usdtCnyRate: number | string | null;
  usdtCnyFx?: { stale?: boolean; observedAt?: string; asOf?: string } | null;
};
export type VerifiedMibanPaymentQuote = {
  quotedAt: string;
  expiresAt: string;
  usdtCnyRate: string;
  assets: Pick<MibanPaymentAsset, "assetCode" | "priceCny" | "priceUsdt">[];
};

function signingKey(key: string): string {
  if (typeof key !== "string" || key.length < 16) throw new Error("支付报价签名未配置，已停止支付");
  return key;
}

function nativeAmount(value: number | string, field: string): string {
  if (typeof value === "string" && !/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value)) throw new Error(`${field}余额数据无效`);
  return paymentUnitsText(paymentDecimalUnits(value));
}

/** 可注入只读数据源供独立预览及单元测试使用；生产入口只读取真实钱包与统一行情。 */
export function buildMibanWalletPaymentQuote(input: {
  userId: number;
  cny: FundingBalance;
  usdt: FundingBalance;
  balances: WalletAssetBalance[];
  market: Market;
  key?: string;
  now?: number;
}): MibanWalletPaymentQuote {
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) throw new Error("支付用户无效");
  const key = signingKey(input.key ?? ENV.cookieSecret);
  if (input.market.usdtCnyRate === null || input.market.usdtCnyFx?.stale !== false) throw new Error("实时人民币汇率暂不可用，请刷新后重试");
  const rateUnits = paymentDecimalUnits(input.market.usdtCnyRate);
  if (rateUnits <= 0n) throw new Error("实时人民币汇率无效");
  const rate = paymentUnitsText(rateUnits);
  const quotedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + MIBAN_PAYMENT_QUOTE_TTL_MS).toISOString();
  const balances = new Map<string, WalletAssetBalance>();
  for (const row of input.balances) {
    const code = row.assetCode.trim().toUpperCase();
    if (balances.has(code)) throw new Error("钱包币种重复，已停止支付报价");
    balances.set(code, row);
  }
  const assets: MibanPaymentAsset[] = MIBAN_PAYMENT_ASSETS.map(code => {
    const funding = code === "CNY" ? input.cny : code === "USDT" ? input.usdt : null;
    const balance = balances.get(code);
    const available = nativeAmount(funding ? funding.available : balance?.availableBalance ?? "0", code);
    const frozen = nativeAmount(funding ? funding.frozen : balance?.frozenBalance ?? "0", code);
    if (paymentDecimalUnits(frozen) < 0n) throw new Error(`${code}冻结台账异常，已停止支付报价`);
    const row: MibanPaymentAsset = {
      assetCode: code,
      assetName: AI_WALLET_ASSET_CATALOG.find(asset => asset.code === code)?.name ?? code,
      available,
      frozen,
      priceCny: null,
      priceUsdt: null,
      priceUpdatedAt: null,
    };
    if (code === "CNY" || code === "USDT") {
      row.priceCny = code === "CNY" ? "1" : rate;
      row.priceUsdt = code === "USDT" ? "1" : paymentUnitsText(PAYMENT_SCALE * PAYMENT_SCALE / rateUnits);
      row.priceUpdatedAt = input.market.usdtCnyFx?.observedAt ?? quotedAt;
    } else {
      const price = input.market.prices[code];
      const updatedAt = input.market.updatedAt[code];
      const observed = updatedAt ? Date.parse(updatedAt) : NaN;
      const health = input.market.health[code];
      const fresh = Number.isFinite(observed) && observed <= now + 5000 && now - observed <= 120_000 && health?.stale === false;
      if (typeof price === "number" && Number.isFinite(price) && price > 0 && fresh) {
        const priceUsdt = paymentDecimalUnits(price);
        const priceCny = priceUsdt * rateUnits / PAYMENT_SCALE;
        if (priceCny > 0n && priceUsdt > 0n) {
          row.priceUsdt = paymentUnitsText(priceUsdt);
          row.priceCny = paymentUnitsText(priceCny);
          row.priceUpdatedAt = updatedAt;
        }
      }
      if (!row.priceCny) row.unavailableReason = fresh ? "实时价格暂不可用" : "行情暂不可用或已过时";
    }
    if (paymentDecimalUnits(available) <= 0n) row.unavailableReason = paymentDecimalUnits(frozen) > 0n ? "余额已冻结，没有可用数量" : "没有可用余额";
    return row;
  });
  const payload = {
    version: 1,
    userId: input.userId,
    nonce: randomBytes(16).toString("hex"),
    quotedAt,
    expiresAt,
    usdtCnyRate: rate,
    // 不将浏览器余额或输入价格作为可扣款依据。扣款必须另在事务锁内复核真实钱包。
    assets: assets.filter(row => !row.unavailableReason && row.priceCny && row.priceUsdt).map(({ assetCode, priceCny, priceUsdt }) => ({ assetCode, priceCny, priceUsdt })),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", key).update(DOMAIN + encoded).digest("base64url");
  return { quoteToken: `${encoded}.${signature}`, quotedAt, expiresAt, usdtCnyRate: rate, assets };
}

export function verifyMibanPaymentQuoteToken(token: string, userId: number, key = ENV.cookieSecret, now = Date.now()): VerifiedMibanPaymentQuote {
  signingKey(key);
  if (typeof token !== "string" || token.length > 16_000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error("支付报价无效，请刷新后重新核对");
  const [encoded, signature] = token.split(".");
  const actual = Buffer.from(signature, "base64url");
  const expected = createHmac("sha256", key).update(DOMAIN + encoded).digest();
  if (actual.toString("base64url") !== signature || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("支付报价验签失败，请刷新后重新核对");
  let payload: any;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw new Error("支付报价格式无效"); }
  if (payload.version !== 1 || payload.userId !== userId || !Number.isSafeInteger(userId) || userId <= 0) throw new Error("支付报价不属于当前用户");
  const issued = Date.parse(payload.quotedAt);
  const expires = Date.parse(payload.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now + 5000 || expires <= now || expires - issued !== MIBAN_PAYMENT_QUOTE_TTL_MS) throw new Error("支付报价已过期，请刷新后重新核对");
  if (typeof payload.usdtCnyRate !== "string" || paymentDecimalUnits(payload.usdtCnyRate) <= 0n) throw new Error("支付报价汇率无效");
  if (!Array.isArray(payload.assets) || payload.assets.length > MIBAN_PAYMENT_ASSETS.length) throw new Error("支付报价币种无效");
  const seen = new Set<string>();
  for (const asset of payload.assets) {
    const code = normalizeMibanPaymentAssetCode(asset.assetCode);
    if (seen.has(code) || code !== asset.assetCode || typeof asset.priceCny !== "string" || typeof asset.priceUsdt !== "string" || paymentDecimalUnits(asset.priceCny) <= 0n || paymentDecimalUnits(asset.priceUsdt) <= 0n) throw new Error("支付报价价格无效");
    seen.add(code);
  }
  return { quotedAt: payload.quotedAt, expiresAt: payload.expiresAt, usdtCnyRate: payload.usdtCnyRate, assets: payload.assets };
}

/** 查询路径不执行DDL，不创建余额，不在客户端缺数据时虚构零余额。 */
export async function getMibanWalletPaymentQuote(userId: number): Promise<MibanWalletPaymentQuote> {
  const [{ getGlobalWalletFundingBalance }, { getDbConnection }, { getAllLatestPrices, getMarketPriceHealth, ensureCryptoSpotPrices }, { getLiveUsdtCnyQuote }] = await Promise.all([
    import("./wallet-funding-guard"), import("./db"), import("./price-scanner"), import("./usdt-cny-rate"),
  ]);
  const connection = await getDbConnection();
  if (!connection) throw new Error("钱包数据库暂不可用，已停止支付报价");
  const [cny, usdt, balanceResult, fx] = await Promise.all([
    getGlobalWalletFundingBalance(userId, "CNY"),
    getGlobalWalletFundingBalance(userId, "USDT"),
    (connection as any).execute("SELECT asset_code, available_balance, frozen_balance FROM ai_wallet_asset_balances WHERE user_id = ?", [userId]),
    getLiveUsdtCnyQuote(),
  ]);
  await ensureCryptoSpotPrices((balanceResult[0] as any[])
    .filter(row => Number(row.available_balance) !== 0 && (MIBAN_PAYMENT_ASSETS as readonly string[]).includes(String(row.asset_code)))
    .map(row => String(row.asset_code)));
  const allPrices = getAllLatestPrices();
  const prices: Record<string, number> = {};
  const updatedAt: Record<string, string> = {};
  for (const [code, entry] of Object.entries(allPrices)) { prices[code] = entry.price; updatedAt[code] = entry.updatedAt; }
  return buildMibanWalletPaymentQuote({
    userId, cny, usdt,
    balances: (balanceResult[0] as any[]).map(row => ({ assetCode: String(row.asset_code), availableBalance: String(row.available_balance), frozenBalance: String(row.frozen_balance) })),
    market: { prices, updatedAt, health: getMarketPriceHealth(), usdtCnyRate: fx && !fx.stale ? fx.rate : null, usdtCnyFx: fx },
  });
}
