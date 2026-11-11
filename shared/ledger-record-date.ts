/** Business dates for actual ledger records, not start/pause/order configuration. */
export function getBeijingLedgerRecordToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Only ledger 37 actual records are restricted; historical backfill remains allowed. */
export function getLedgerRecordDateError(ledgerId: number, date: unknown, now: Date = new Date()): string | null {
  if (ledgerId !== 37) return null;
  const text = typeof date === 'string' ? date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '请填写有效的账目日期';
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    return '请填写有效的账目日期';
  }
  const today = getBeijingLedgerRecordToday(now);
  return text > today ? `账目日期不能晚于今天（${today}，北京时间）` : null;
}
