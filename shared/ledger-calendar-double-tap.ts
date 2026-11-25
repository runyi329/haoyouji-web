/** 使用 click 作为唯一计数来源：触摸、鼠标及没有 PointerEvent 的 WebView 都可用。
 * 不在 pointerup/touchend 再计一次，避免一次触摸被算成双击；滚动不会生成有效 click。
 */
export const LEDGER_CALENDAR_DOUBLE_TAP_MS = 600;
export type LedgerCalendarTap = { key: string; at: number };

export function consumeLedgerCalendarDoubleTap(
  ref: { current: LedgerCalendarTap | null },
  key: string,
  at = Date.now(),
): boolean {
  const previous = ref.current;
  const elapsed = previous ? at - previous.at : -1;
  if (previous?.key === key && elapsed >= 0 && elapsed <= LEDGER_CALENDAR_DOUBLE_TAP_MS) {
    ref.current = null;
    return true;
  }
  ref.current = { key, at };
  return false;
}
