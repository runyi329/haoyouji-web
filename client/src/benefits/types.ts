export { flattenCatalog, skuSelectable, scopeNames, kindNames, scopeText, isCoupon, valueText, status, money } from "@shared/miban-benefits";
export type { Rule, Audit, Scope, Kind, CatalogProduct, CatalogSku, BenefitUser } from "@shared/miban-benefits";

export const STOREFRONT = "miban-limited" as const;
export type UserFilter = "all" | "with" | "without";
export function currentDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function dateAfter(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return currentDate(date);
}
export function mutationError(error: unknown): string {
  const message = error instanceof Error ? error.message : "操作失败，请重试。";
  return /CONFLICT|版本|已变更|刷新/.test(message) ? `${message} 请重新载入最新优惠后核对再提交。` : message;
}
