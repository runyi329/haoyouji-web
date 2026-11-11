import { getBeijingLedgerRecordToday } from "@shared/ledger-record-date";

/** A selected civil date must not be shifted by UTC serialization. */
export function formatLedgerRecordDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLedgerRecordInitialDate(ledgerId: number, presetDate?: string | null): Date {
  if (presetDate) return new Date(`${presetDate}T00:00:00`);
  return ledgerId === 37
    ? new Date(`${getBeijingLedgerRecordToday()}T00:00:00`)
    : new Date();
}
