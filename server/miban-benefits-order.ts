import type { BenefitResult } from "../shared/miban-benefits";

/** Integer-cent apportionment; never create a zero-price child order. */
export function splitMibanBenefitPeriodCents(totalCents: number, count: number): number[] {
  if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(count) || count < 1 || totalCents < count) {
    throw new Error("优惠后金额不足以安全分配到各期订单，请重新选择优惠");
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** A customer-facing immutable snapshot, not the mutable administrator note. */
export function mibanBenefitLineSnapshot(result: BenefitResult, productKey: string, skuId: string, paidCents?: number) {
  const line = result.lines.find(item => item.productKey === productKey && item.skuId === skuId);
  if (!line) throw new Error("优惠报价缺少商品行，请重新获取报价");
  const amount = paidCents ?? line.totalCents;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("优惠后商品金额无效");
  return {
    storefront: "miban-limited" as const,
    originalCny: line.originalCents / 100,
    paidCny: amount / 100,
    savedCny: (line.originalCents - amount) / 100,
    summary: result.summary,
    ruleId: line.ruleId ?? null,
    ruleName: line.ruleName ?? null,
  };
}
