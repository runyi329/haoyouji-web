/**
 * 37号标签真实当前CNY市值；仅在旧摘要/冻结快照没有新字段时兼容手工余额。
 * 新字段明确为空或无效表示市值未加载，不能用旧余额、保证金总额或倍率后浮盈替代。
 */
export function readLedgerTagHoldingValue(summary: unknown): number | null {
  if (summary === null || typeof summary !== 'object') return null;
  const tagSummary = summary as {
    currentHoldingValue?: { value?: unknown } | null;
    latestBalance?: { balance?: unknown } | null;
  };
  const rawValue = tagSummary.currentHoldingValue === undefined
    ? tagSummary.latestBalance?.balance
    : tagSummary.currentHoldingValue?.value;
  if (typeof rawValue !== 'number' && typeof rawValue !== 'string') return null;
  if (typeof rawValue === 'string' && rawValue.trim() === '') return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}
