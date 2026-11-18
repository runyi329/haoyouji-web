export type WalletFlowCategory = "digital" | "stable" | "cny";

/** 仅用于展示分类，不转换账务币种、金额或账户。现有证券/商品流水仍保留在数字资产列表。 */
export function getWalletFlowCategory(assetCode: string): WalletFlowCategory {
  const code = String(assetCode).trim().toUpperCase();
  if (["CNY", "RMB", "人民币"].includes(code)) return "cny";
  if (["USDT", "U"].includes(code)) return "stable";
  return "digital";
}

/** 与统一钱包历史接口的兼容口径一致：旧无币种流水属于USDT，不属于人民币。 */
export function getWalletFundingCurrency(currency: unknown): "USDT" | "CNY" {
  return getWalletFlowCategory(String(currency ?? "USDT")) === "cny" ? "CNY" : "USDT";
}
