export function limitFunderAnnualRateInput(rawValue: string): string | null {
  const normalized = rawValue.replace(/[，,]/g, '.').trim();
  if (normalized === '') return '';
  if (!/^\d*(?:\.\d{0,2})?$/.test(normalized)) return null;
  return normalized;
}

export function formatFunderAnnualRate(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '+' || raw === '-') return '';
  const numeric = Math.abs(Number(raw));
  if (!Number.isFinite(numeric)) return '';
  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2);
}

export function normalizeFunderAnnualRate(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim();
  const negative = raw.startsWith('-');
  const formatted = formatFunderAnnualRate(raw);
  if (!formatted) return raw === '-' ? '-0' : '';
  return `${negative ? '-' : ''}${formatted}`;
}
