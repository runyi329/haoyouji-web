import { LEGACY_WALLET_CRYPTO_ASSET_CODES } from "./crypto-asset-catalog";

/** 保持既有34种数字币支付范围；钱包扩目录不自动开放新币商城支付。 */
export const MIBAN_PAYMENT_ASSETS = ["CNY", "USDT", ...LEGACY_WALLET_CRYPTO_ASSET_CODES] as const;
export type MibanPaymentAssetCode = (typeof MIBAN_PAYMENT_ASSETS)[number];
export const PAYMENT_SCALE = 10n ** 18n;
export const MIBAN_PAYMENT_QUOTE_TTL_MS = 60_000;

export type MibanPaymentAsset = {
  assetCode: string;
  assetName: string;
  /** 已扣除冻结的真实可用币量，不再重复扣冻结。 */
  available: string;
  frozen: string;
  priceCny: string | null;
  priceUsdt: string | null;
  priceUpdatedAt: string | null;
  unavailableReason?: string;
};
export type MibanWalletPaymentQuote = {
  quoteToken: string;
  quotedAt: string;
  expiresAt: string;
  usdtCnyRate: string;
  assets: MibanPaymentAsset[];
};
export type MibanPaymentAssetInput = { assetCode: string; amount: string };
export type MibanPaymentDeduction = MibanPaymentAssetInput & {
  priceCny: string;
  priceUsdt: string;
  cnyValue: string;
};
export type MibanPaymentPlan = {
  deductions: MibanPaymentDeduction[];
  paymentAssets: MibanPaymentAssetInput[];
  totalValueCny: string;
  remainingCny: string;
  canPay: boolean;
};

/** 报价数值允许科学计数法；资金请求与资金数据库字符串必须使用原生十进制文本。 */
export function paymentDecimalUnits(value: string | number): bigint {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("支付金额或报价无效");
  const text = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw new Error("支付金额或报价必须为十进制数");
  const exponent = Number(match[4] ?? "0");
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) throw new Error("支付金额或报价超出范围");
  const digits = BigInt(match[2] + (match[3] ?? ""));
  const shift = 18 + exponent - (match[3]?.length ?? 0);
  const magnitude = shift >= 0 ? digits * (10n ** BigInt(shift)) : digits / (10n ** BigInt(-shift));
  return match[1] ? -magnitude : magnitude;
}

export function paymentUnitsText(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const fraction = String(absolute % PAYMENT_SCALE).padStart(18, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${absolute / PAYMENT_SCALE}${fraction ? `.${fraction}` : ""}`;
}

export function normalizeMibanPaymentAssetCode(value: string): MibanPaymentAssetCode {
  const code = value.trim().toUpperCase();
  if (!(MIBAN_PAYMENT_ASSETS as readonly string[]).includes(code)) throw new Error("该资产不支持商城数字币支付");
  return code as MibanPaymentAssetCode;
}

export function paymentAssetDecimals(code: string): number {
  return code === "CNY" ? 2 : code === "USDT" ? 8 : 18;
}

function quantum(code: string): bigint {
  return 10n ** BigInt(18 - paymentAssetDecimals(code));
}

export function normalizeMibanPaymentAssets(inputs: MibanPaymentAssetInput[]): MibanPaymentAssetInput[] {
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > MIBAN_PAYMENT_ASSETS.length) throw new Error("请选择有效的支付币种");
  const seen = new Set<string>();
  return inputs.map(input => {
    const assetCode = normalizeMibanPaymentAssetCode(input.assetCode);
    if (seen.has(assetCode)) throw new Error("支付币种不可重复");
    seen.add(assetCode);
    if (typeof input.amount !== "string" || !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(input.amount)) throw new Error("支付币量必须为最多十八位小数的十进制文本");
    const units = paymentDecimalUnits(input.amount);
    if (units <= 0n || units % quantum(assetCode) !== 0n) throw new Error("支付币量必须大于零且符合该币种记账精度");
    return { assetCode, amount: paymentUnitsText(units) };
  });
}

/** 自动分配只读报价中的可用币量。不会使用frozen，不会生成缺价/失效币种扣款。 */
export function buildMibanPaymentPlan(
  totalCny: string | number,
  quote: MibanWalletPaymentQuote,
  priorityCodes: string[],
  cnyRequested?: string | number,
  now = Date.now(),
): MibanPaymentPlan {
  const total = paymentDecimalUnits(totalCny);
  if (total < 0n) throw new Error("订单金额不可为负");
  const expires = Date.parse(quote.expiresAt);
  const valid = Number.isFinite(expires) && now < expires && paymentDecimalUnits(quote.usdtCnyRate) > 0n;
  const rows = new Map(quote.assets.map(row => [row.assetCode, row]));
  const seen = new Set<string>();
  const deductions: MibanPaymentDeduction[] = [];
  let remaining = total;
  let covered = 0n;
  if (valid) for (const raw of priorityCodes) {
    const code = normalizeMibanPaymentAssetCode(raw);
    if (seen.has(code)) throw new Error("支付币种不可重复");
    seen.add(code);
    const row = rows.get(code);
    if (!row || row.unavailableReason || !row.priceCny || !row.priceUsdt || remaining <= 0n) continue;
    let price: bigint;
    try {
      price = paymentDecimalUnits(row.priceCny);
      if (paymentDecimalUnits(row.priceUsdt) <= 0n) continue;
    } catch {
      continue;
    }
    const frozen = paymentDecimalUnits(row.frozen);
    let available = paymentDecimalUnits(row.available);
    if (frozen < 0n) throw new Error("钱包冻结台账异常");
    if (price <= 0n || available <= 0n) continue;
    if (code === "CNY" && cnyRequested !== undefined) {
      const requested = paymentDecimalUnits(cnyRequested);
      available = available < requested ? available : requested;
    }
    if (available <= 0n) continue;
    const step = quantum(code);
    available = available / step * step;
    // 向上取到最小记账单位，避免报价换算导致应付不足；限额始终向下取整。
    const denominator = price * step;
    const needed = (remaining * PAYMENT_SCALE + denominator - 1n) / denominator * step;
    const amount = needed < available ? needed : available;
    if (amount <= 0n) continue;
    const value = amount * price / PAYMENT_SCALE;
    if (value <= 0n) continue;
    deductions.push({ assetCode: code, amount: paymentUnitsText(amount), priceCny: row.priceCny, priceUsdt: row.priceUsdt, cnyValue: paymentUnitsText(value) });
    covered += value;
    remaining = remaining > value ? remaining - value : 0n;
  }
  return {
    deductions,
    paymentAssets: deductions.map(({ assetCode, amount }) => ({ assetCode, amount })),
    totalValueCny: paymentUnitsText(covered),
    remainingCny: paymentUnitsText(remaining),
    canPay: valid && total > 0n && remaining === 0n && covered - total <= PAYMENT_SCALE / 100n,
  };
}

/** 服务端仅用已验签的服务端单价重算，不使用客户端的价格或折算金额。 */
export function validateMibanPaymentDeductions(
  totalCny: string | number,
  inputs: MibanPaymentAssetInput[],
  serverPrices: Pick<MibanPaymentAsset, "assetCode" | "priceCny" | "priceUsdt">[],
): MibanPaymentDeduction[] {
  const total = paymentDecimalUnits(totalCny);
  if (total <= 0n) throw new Error("订单金额必须大于零");
  const prices = new Map(serverPrices.map(row => [row.assetCode, row]));
  let sum = 0n;
  const result = normalizeMibanPaymentAssets(inputs).map(input => {
    const row = prices.get(input.assetCode);
    if (!row?.priceCny || !row.priceUsdt) throw new Error(`${input.assetCode}行情暂不可用，请刷新报价`);
    const price = paymentDecimalUnits(row.priceCny);
    if (price <= 0n || paymentDecimalUnits(row.priceUsdt) <= 0n) throw new Error("支付单价无效");
    const cnyValue = paymentDecimalUnits(input.amount) * price / PAYMENT_SCALE;
    if (cnyValue <= 0n) throw new Error("支付币量小于有效结算精度");
    sum += cnyValue;
    return { ...input, priceCny: row.priceCny, priceUsdt: row.priceUsdt, cnyValue: paymentUnitsText(cnyValue) };
  });
  if (sum < total) throw new Error("所选币种支付金额不足，请刷新报价和余额");
  if (sum - total > PAYMENT_SCALE / 100n) throw new Error("所选币种支付金额超过应付，请重新分配");
  return result;
}

/** 订阅逐币分摊，最后一期承接原生精度尾差，原币量之和严格等于实际一次扣款。 */
export function splitMibanPaymentDeductions(deductions: MibanPaymentDeduction[], periods: number): MibanPaymentDeduction[][] {
  if (!Number.isInteger(periods) || periods < 1 || periods > 12) throw new Error("订阅期数无效");
  const result: MibanPaymentDeduction[][] = Array.from({ length: periods }, () => []);
  for (const deduction of deductions) {
    const amount = paymentDecimalUnits(deduction.amount);
    const step = quantum(deduction.assetCode);
    const base = amount / step / BigInt(periods) * step;
    for (let index = 0; index < periods; index++) {
      const share = index === periods - 1 ? amount - base * BigInt(periods - 1) : base;
      if (share === 0n) continue;
      result[index].push({ ...deduction, amount: paymentUnitsText(share), cnyValue: paymentUnitsText(share * paymentDecimalUnits(deduction.priceCny) / PAYMENT_SCALE) });
    }
  }
  return result;
}

/** 仅供展示；按绝对值四舍五入至两位，不改动原始扣款币量。负微量保留负号。 */
export function formatMibanUsdtAmount(value: string | number | null): string {
  if (value === null) return "--";
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("支付金额无效");
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(value).trim());
  if (!match) throw new Error("支付金额必须为十进制数");
  const exponent = Number(match[4] ?? "0");
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) throw new Error("支付金额超出范围");
  const digits = BigInt(match[2] + (match[3] ?? ""));
  if (digits === 0n) return "0.00";
  const shift = 2 + exponent - (match[3]?.length ?? 0);
  const divisor = shift < 0 ? 10n ** BigInt(-shift) : 1n;
  const cents = shift >= 0 ? digits * (10n ** BigInt(shift)) : (digits + divisor / 2n) / divisor;
  const sign = match[1] ? "-" : "";
  if (cents === 0n) return `${sign}<0.01`;
  return `${sign}${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

function formatPaymentCnyAmount(amount: string): string {
  const units = paymentDecimalUnits(amount);
  const absolute = units < 0n ? -units : units;
  const cents = (absolute + PAYMENT_SCALE / 200n) / (PAYMENT_SCALE / 100n);
  return `${units < 0n ? "-" : ""}${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export function formatMibanPaymentSummary(deductions: MibanPaymentAssetInput[]): string {
  return deductions.map(row => row.assetCode === "CNY" ? `¥${formatPaymentCnyAmount(row.amount)}` : row.assetCode === "USDT" ? `${formatMibanUsdtAmount(row.amount)} U` : `${row.amount} ${row.assetCode}`).join(" + ");
}

/** 新订单只展示真实原币快照；旧订单没有侧表记录时由调用方保留历史兼容显示。 */
export function getMibanOrderWalletPaymentSummary(order: { walletPayments?: unknown }): string | null {
  if (!Array.isArray(order.walletPayments) || order.walletPayments.length === 0) return null;
  try {
    const inputs = order.walletPayments.map(row => ({ assetCode: row.assetCode, amount: row.amount }));
    return formatMibanPaymentSummary(normalizeMibanPaymentAssets(inputs));
  } catch {
    return "支付记录待核实";
  }
}
