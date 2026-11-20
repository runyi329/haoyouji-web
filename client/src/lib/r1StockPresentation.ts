import { portfolioCashMultiplier, portfolioQuotePrefix, type PortfolioCurrency } from "@shared/portfolio-instruments";

const positiveUserId = (value: unknown): number | undefined => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

/** 展示目标不是实际操作者；权限只信服务端 context。URL 显式视角优先。 */
export function resolveR1EffectiveUserId(search: string, storedViewAs: string | null, effectiveUserId?: number, authUserId?: number): number | undefined {
  const urlTarget = positiveUserId(new URLSearchParams(search).get("viewAs"));
  return urlTarget ?? positiveUserId(storedViewAs) ?? positiveUserId(effectiveUserId) ?? positiveUserId(authUserId);
}

/** 与旧页面 toCny 完全相同的乘法换汇，不翻转已分配收益，不用缺失汇率补零。 */
export function r1ParticipationToCny(value: number | null | undefined, currency: PortfolioCurrency, usdCnyRate: number | null, usdtCnyRate: number | null): number | null {
  const rate = portfolioCashMultiplier(currency, usdCnyRate, usdtCnyRate);
  return value === null || value === undefined || !Number.isFinite(value) || rate === null ? null : value * rate;
}

export function r1ParticipationMoney(value: number | null | undefined, currency: PortfolioCurrency = "CNY", signed = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = signed ? value > 0 ? "+" : value < 0 ? "−" : "" : value < 0 ? "−" : "";
  return `${sign}${portfolioQuotePrefix(currency)}${Math.abs(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function r1ParticipationQuantity(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: 8 });
}

/** 保留登记金额的十进制字符串精度，而非假装证券成本就是已缴金额。 */
export function r1RecordedMarginAmount(value: string): string {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value) ? value : "—";
}

/** 原币行已包含当前与历史分配收益（含部分结束），只换汇不再重算收益。 */
export function r1SummaryAtDisplayFx(rows: import("@shared/r1-stock-presentation").R1AiParticipationRow[], usdCnyRate: number | null, usdtCnyRate: number | null): import("@shared/r1-stock-presentation").R1AiParticipationSummary {
  const sum = (field: "floatingPnl" | "realizedPnl") => {
    const values = rows.map(row => r1ParticipationToCny(row[field], row.currency, usdCnyRate, usdtCnyRate));
    return values.some(value => value === null) ? null : values.reduce<number>((total, value) => total + Number(value), 0);
  };
  const floatingPnl = sum("floatingPnl"), realizedPnl = sum("realizedPnl");
  return { floatingPnl, realizedPnl, totalPnl: floatingPnl === null || realizedPnl === null ? null : floatingPnl + realizedPnl };
}
