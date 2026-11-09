export type WalletBalanceSummary = { total: number; available: number; frozen: number };

export type WalletDigitalAsset = {
  assetCode: string;
  totalBalance: number;
  availableBalance: number | null;
  frozenBalance: number | null;
  priceUsdt: number;
};

export function getDigitalAssetDisplayDigits(assetCode: string, amount: number): number {
  if (assetCode === "USDT") return 2;
  const absoluteAmount = Math.abs(amount);
  if (absoluteAmount >= 1_000) return 2;
  if (absoluteAmount >= 1) return 4;
  if (absoluteAmount >= 0.01) return 6;
  return 8;
}

export function formatDigitalAssetAmount(assetCode: string, amount: number): string {
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: assetCode === "USDT" ? 2 : 0,
    maximumFractionDigits: getDigitalAssetDisplayDigits(assetCode, amount),
  });
}

/** 全局钱包持仓口径：担保仍属资产；USDT只出现一次且固定首位，其余按估值排列。 */
export function buildWalletDigitalAssets(
  usdtSummary: WalletBalanceSummary | undefined,
  multiAssets: ReadonlyArray<{
    assetCode: string;
    totalBalance?: number;
    availableBalance?: number;
    frozenBalance?: number;
    priceUsdt?: number;
  }>,
  fallbackUsdtTotal = 0,
): WalletDigitalAsset[] {
  const usdtTotal = Number(usdtSummary?.total ?? fallbackUsdtTotal);
  const assets: WalletDigitalAsset[] = multiAssets
    .filter(asset => String(asset.assetCode || "").trim().toUpperCase() !== "USDT")
    .map(asset => ({
      assetCode: String(asset.assetCode || "").trim().toUpperCase(),
      totalBalance: Number(asset.totalBalance ?? (Number(asset.availableBalance ?? 0) + Number(asset.frozenBalance ?? 0))),
      availableBalance: Number(asset.availableBalance ?? 0),
      frozenBalance: Number(asset.frozenBalance ?? 0),
      priceUsdt: Number(asset.priceUsdt ?? 0),
    }))
    .filter(asset => asset.totalBalance > 0);
  if (usdtTotal > 0) assets.unshift({
    assetCode: "USDT",
    totalBalance: usdtTotal,
    // 未获取权威分层摘要时，不把总余额伪装成可用额，也不伪造担保为0。
    availableBalance: usdtSummary ? Number(usdtSummary.available) : null,
    frozenBalance: usdtSummary ? Number(usdtSummary.frozen) : null,
    priceUsdt: 1,
  });
  return assets.sort((left, right) => {
    if (left.assetCode === "USDT" && right.assetCode !== "USDT") return -1;
    if (right.assetCode === "USDT" && left.assetCode !== "USDT") return 1;
    const difference = right.totalBalance * right.priceUsdt - left.totalBalance * left.priceUsdt;
    return difference || left.assetCode.localeCompare(right.assetCode);
  });
}
