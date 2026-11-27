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

export const LEDGER_CALENDAR_TAP_MOVE_PX = 8;
export type LedgerCalendarTouchOrigin = { x: number; y: number };
type LedgerCalendarTouches = ArrayLike<{ clientX: number; clientY: number }>;

/** 只记录手指起点，绝不把 touchstart/touchend 另算一次 click。 */
export function beginLedgerCalendarTouch(
  origin: { current: LedgerCalendarTouchOrigin | null },
  taps: { current: LedgerCalendarTap | null },
  touches: LedgerCalendarTouches,
): void {
  const touch = touches[0];
  if (touches.length !== 1 || !touch || !Number.isFinite(touch.clientX) || !Number.isFinite(touch.clientY)) {
    origin.current = null;
    taps.current = null;
    return;
  }
  origin.current = { x: touch.clientX, y: touch.clientY };
}

/** 手机轻微抖动不清除第一次点击；真正滑动、缩放及无起点的移动仍中断配对。 */
export function cancelLedgerCalendarTapOnScroll(
  origin: { current: LedgerCalendarTouchOrigin | null },
  taps: { current: LedgerCalendarTap | null },
  touches: LedgerCalendarTouches,
): void {
  const touch = touches[0];
  const start = origin.current;
  if (!start || touches.length !== 1 || !touch || !Number.isFinite(touch.clientX) || !Number.isFinite(touch.clientY)
    || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > LEDGER_CALENDAR_TAP_MOVE_PX) {
    origin.current = null;
    taps.current = null;
  }
}
