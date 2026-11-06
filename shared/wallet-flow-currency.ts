/**
 * 钱包流水展示必须先按原始币种分流，再清理备注或套用账户单位。
 * 不进行汇率换算，也不修改金额、余额快照或原始记录。
 */
export type WalletFlowCurrencySource = {
  currency?: unknown;
  assetCode?: unknown;
  note?: unknown;
  description?: unknown;
};

export function getWalletFlowCurrency(item: WalletFlowCurrencySource): string {
  const currency = String(item.currency ?? "").trim().toUpperCase();
  if (currency) return currency;
  const assetCode = String(item.assetCode ?? "").trim().toUpperCase();
  if (assetCode) return assetCode;
  // 仅缺失币种字段的历史手动流水使用原始 [CNY] 标记；备注内的约等于人民币不是币种。
  const rawNote = String(item.note || item.description || "");
  return /^\s*\[CNY\]/i.test(rawNote) ? "CNY" : "USDT";
}

export function isWalletFlowCurrency(item: WalletFlowCurrencySource, currency: string): boolean {
  return getWalletFlowCurrency(item) === currency.trim().toUpperCase();
}
