/** Presentation only: never use rounded values for return calculations. */
export function ledger37DisplayedMoneyValue(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  // Match the existing Intl two-decimal display, including half-cent boundaries.
  const rounded = Number(value.toLocaleString('en-US', {
    useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }));
  return rounded === 0 ? 0 : rounded;
}

function signColor(value: number | null): string {
  return value === null ? '#9E9E9E' : value > 0 ? '#D32F2F' : value < 0 ? '#388E3C' : '#555';
}

export function ledger37MoneyText(value: number | null): string {
  const displayed = ledger37DisplayedMoneyValue(value);
  if (displayed === null) return '待更新';
  return `${displayed > 0 ? '+' : ''}${displayed.toLocaleString('zh-CN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

export function ledger37MoneyColor(value: number | null): string {
  return signColor(ledger37DisplayedMoneyValue(value));
}

/** Calendar cells keep their existing whole-yuan / ten-thousand-yuan precision. */
export function ledger37CompactMoneyText(value: number): string {
  if (!Number.isFinite(value)) return '待更新';
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(2)}万`;
  const rounded = Math.round(value);
  const displayed = rounded === 0 ? 0 : rounded;
  return `${displayed > 0 ? '+' : ''}${displayed.toLocaleString('zh-CN', { useGrouping: false })}`;
}

export function ledger37CompactMoneyColor(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return signColor(null);
  return signColor(Math.abs(value) >= 10000 ? value : Math.round(value));
}
