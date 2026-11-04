export type MibanWalletBalanceSummary = {
  total: number;
  frozen: number;
  available: number;
};

export type MibanWalletValueInput = {
  usdt: MibanWalletBalanceSummary;
  cny: MibanWalletBalanceSummary;
  assets: Array<{
    assetCode: string;
    assetName?: string;
    availableBalance: string | number;
    frozenBalance: string | number;
    totalBalance?: string | number;
  }>;
  /** 当前统一行情的 USDT 单价；禁止使用余额接口的价格快照兜底。 */
  prices: Record<string, number>;
  usdtCnyRate: number;
};

export type MibanWalletValueRow = {
  assetCode: string;
  assetName: string;
  available: number;
  frozen: number;
  total: number;
  priceUsdt: number | null;
  availableCny: number | null;
  frozenCny: number | null;
};

export type MibanWalletValue = {
  availableCny: number | null;
  availableUsdt: number | null;
  frozenCny: number | null;
  frozenUsdt: number | null;
  totalCny: number | null;
  missingPrices: string[];
  rows: MibanWalletValueRow[];
};

function finiteNumber(value: string | number, field: string): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw new Error(`钱包估值：${field} 必须是有限数值`);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`钱包估值：${field} 必须是有限数值`);
  }
  return number;
}

/**
 * 仅负责展示估值，不参与结算。available 已扣冻结，不再扣第二次。
 * 缺价只使对应非零数量的估值未知；零可用、非零冻结不影响可用合计。
 * 保留负余额及完整精度，显示端自行格式化。
 */
export function calculateMibanWalletValue(
  input: MibanWalletValueInput
): MibanWalletValue {
  const rate = finiteNumber(input.usdtCnyRate, "usdtCnyRate");
  if (rate <= 0) {
    throw new Error("钱包估值：usdtCnyRate 必须大于 0");
  }
  const cnyPriceUsdt = finiteNumber(1 / rate, "CNY.priceUsdt");
  const prices: Record<string, number> = {};
  for (const [code, price] of Object.entries(input.prices)) {
    prices[code.trim().toUpperCase()] = finiteNumber(price, `prices.${code}`);
  }

  type QuantityRow = Omit<MibanWalletValueRow, "availableCny" | "frozenCny">;
  const quantityRows: QuantityRow[] = [
    {
      assetCode: "USDT",
      assetName: "USDT",
      available: finiteNumber(input.usdt.available, "usdt.available"),
      frozen: finiteNumber(input.usdt.frozen, "usdt.frozen"),
      total: finiteNumber(input.usdt.total, "usdt.total"),
      priceUsdt: 1,
    },
    {
      assetCode: "CNY",
      assetName: "人民币",
      available: finiteNumber(input.cny.available, "cny.available"),
      frozen: finiteNumber(input.cny.frozen, "cny.frozen"),
      total: finiteNumber(input.cny.total, "cny.total"),
      priceUsdt: cnyPriceUsdt,
    },
  ];
  const missingPrices = new Set<string>();
  const seenAssets = new Set<string>();
  for (const asset of input.assets) {
    const code = asset.assetCode.trim().toUpperCase();
    // USDT/CNY 的唯一来源是各自的分层余额，避免再次计入多资产接口。
    if (code === "USDT" || code === "CNY") continue;
    if (!code) throw new Error("钱包估值：assetCode 不能为空");
    if (seenAssets.has(code)) {
      throw new Error(`钱包估值：重复的 assetCode ${code}`);
    }
    seenAssets.add(code);
    const available = finiteNumber(
      asset.availableBalance,
      `${code}.availableBalance`
    );
    const frozen = finiteNumber(asset.frozenBalance, `${code}.frozenBalance`);
    const total = finiteNumber(
      asset.totalBalance === undefined
        ? available + frozen
        : asset.totalBalance,
      `${code}.totalBalance`
    );
    if (available === 0 && frozen === 0 && total === 0) continue;
    const livePrice = prices[code];
    // 0 或负报价不代表资产归零，而是没有有效的实时单价。
    const priceUsdt =
      livePrice !== undefined && livePrice > 0 ? livePrice : null;
    if (priceUsdt === null) missingPrices.add(code);
    quantityRows.push({
      assetCode: code,
      assetName: asset.assetName || code,
      available,
      frozen,
      total,
      priceUsdt,
    });
  }

  function toCny(row: QuantityRow, quantity: number): number | null {
    if (quantity === 0) return 0;
    if (row.priceUsdt === null) return null;
    return finiteNumber(
      row.assetCode === "CNY" ? quantity : quantity * row.priceUsdt * rate,
      `${row.assetCode}.CNY估值`
    );
  }
  function sumCny(field: "available" | "frozen" | "total"): number | null {
    let sum = 0;
    let missing = false;
    for (const row of quantityRows) {
      const value = toCny(row, row[field]);
      if (value === null) missing = true;
      else sum = finiteNumber(sum + value, `${field}Cny合计`);
    }
    return missing ? null : sum;
  }
  const availableCny = sumCny("available");
  const frozenCny = sumCny("frozen");
  return {
    availableCny,
    availableUsdt:
      availableCny === null
        ? null
        : finiteNumber(availableCny / rate, "availableUsdt合计"),
    frozenCny,
    frozenUsdt:
      frozenCny === null
        ? null
        : finiteNumber(frozenCny / rate, "frozenUsdt合计"),
    totalCny: sumCny("total"),
    missingPrices: [...missingPrices],
    rows: quantityRows.map(row => ({
      ...row,
      availableCny: toCny(row, row.available),
      frozenCny: toCny(row, row.frozen),
    })),
  };
}
