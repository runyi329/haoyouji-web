import { AI_WALLET_ASSETS, type AiWalletAsset } from "@shared/ai-wallet-assets";

export type ManualWalletFreeze = {
  id: number;
  assetCode: AiWalletAsset;
  amount: string;
  releasedAmount: string;
  remainingAmount: string;
  note: string;
  status: "active" | "released";
  createdAt: string;
};

/** 冻结不做汇率换算；历史资金账户最多8位小数，独立资产最多18位。 */
export function normalizeManualFreezeAmount(assetCode: string, input: string): string {
  if (!(AI_WALLET_ASSETS as readonly string[]).includes(assetCode)) throw new Error("请选择已启用的钱包资产");
  const text = input.trim();
  const precision = assetCode === "CNY" || assetCode === "USDT" ? 8 : 18;
  if (!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(text)) {
    throw new Error("请输入大于0的普通十进制数量，不支持负数或科学计数法");
  }
  if ((text.split(".")[1] || "").length > precision) throw new Error(`${assetCode} 最多支持${precision}位小数`);
  const normalized = text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (!/[1-9]/.test(normalized)) throw new Error("冻结或解冻数量必须大于0");
  return normalized;
}

/** 只比较非负十进制字符串，不把18位币数量转成Number。 */
export function compareManualFreezeAmounts(left: string, right: string): number {
  const asFixed = (value: string) => {
    const text = String(value).trim();
    if (!/^\d{1,18}(?:\.\d{1,18})?$/.test(text)) throw new Error("冻结记录数量无效，请更新后重试");
    const [whole, fraction = ""] = text.split(".");
    return whole.padStart(18, "0") + fraction.padEnd(18, "0");
  };
  const a = asFixed(left), b = asFixed(right);
  return a === b ? 0 : a > b ? 1 : -1;
}

export type ManualFreezableAsset = { assetCode: AiWalletAsset; availableAmount: string };

/** 只使用服务端原币可用数量；不能把总额、冻结额或人民币估值当作最大数量。 */
export function getManualFreezableAssets(value: unknown): ManualFreezableAsset[] {
  if (!Array.isArray(value)) return [];
  const result: ManualFreezableAsset[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.assetCode !== "string" || typeof item.availableAmount !== "string") continue;
    if (!(AI_WALLET_ASSETS as readonly string[]).includes(item.assetCode) || seen.has(item.assetCode)) continue;
    try {
      const availableAmount = normalizeManualFreezeAmount(item.assetCode, item.availableAmount);
      if (compareManualFreezeAmounts(availableAmount, "0") <= 0) continue;
      seen.add(item.assetCode);
      result.push({ assetCode: item.assetCode as AiWalletAsset, availableAmount });
    } catch { /* 数量损坏或不可冻结的币种不提供“最大”，由服务端继续校验资金。 */ }
  }
  return result;
}

/** 统计仍有剩余的手动冻结币种，不按笔数计，不读取订单冻结或估值。 */
export function getManualFrozenAssetCount(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  const codes = new Set<string>();
  for (const item of value) {
    if (item?.status === "released") continue;
    if (!item || item.status !== "active" || !(AI_WALLET_ASSETS as readonly unknown[]).includes(item.assetCode)
      || !Number.isSafeInteger(item.id) || item.id <= 0 || typeof item.remainingAmount !== "string") return null;
    try {
      if (compareManualFreezeAmounts(item.remainingAmount, "0") > 0) codes.add(item.assetCode);
    } catch { return null; }
  }
  return codes.size;
}

export function validateManualRelease(freeze: ManualWalletFreeze, amount: string): string {
  if (!Number.isSafeInteger(freeze.id) || freeze.id <= 0 || freeze.status !== "active") {
    throw new Error("只能解冻仍有效的手动冻结记录");
  }
  const normalized = normalizeManualFreezeAmount(freeze.assetCode, amount);
  if (compareManualFreezeAmounts(normalized, freeze.remainingAmount) > 0) throw new Error("解冻数量超过本笔手动冻结的剩余数量");
  return normalized;
}

export function createManualFreezeRequestId(): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  return `MANUAL_${suffix}`;
}

/** 同一提交重试保留requestId；换用户、资产、数量、备注或来源则不能沿用旧payload。 */
export function getManualFreezeRequest(previous: { key: string; id: string } | null, payload: object) {
  const key = JSON.stringify(payload);
  return previous?.key === key ? previous : { key, id: createManualFreezeRequestId() };
}
