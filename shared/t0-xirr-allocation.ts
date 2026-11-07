/** Allocation-only extraction of T0Journal's XIRR and target terminal top-up. */
export type T0AllocationCashFlow = {
  occurredOn: string;
  amount: number;
  /** Positive ledger amounts: deposit is an outflow, withdrawal is an inflow.
   * Without direction, amount is already a signed investor cash flow. */
  direction?: 'deposit' | 'withdrawal';
  /** Terminal value at Beijing day end; contributes one additional calendar day. */
  atEndOfBeijingDay?: boolean;
};

function getBeijingDateInputValue(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getT0CalendarDateUtc(value: string): number | null {
  // Missing dates are invalid flows, not dates inferred from today's date.
  if (typeof value !== "string") return null;
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const [, yearText, monthText, dayText] = matched;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? timestamp
    : null;
}

function signedAmount(cashFlow: T0AllocationCashFlow): number {
  if (cashFlow.direction === "deposit") return -Math.abs(cashFlow.amount);
  if (cashFlow.direction === "withdrawal") return Math.abs(cashFlow.amount);
  return cashFlow.amount;
}

/** Same dated-cash-flow solver as client/src/pages/T0Journal.tsx calculateT0Xirr.
 * Returns a decimal annualized rate (0.1 = 10%), or null if unsolvable. */
export function calculateT0AllocationXirr(cashFlows: T0AllocationCashFlow[]): number | null {
  const grouped = new Map<number, number>();
  cashFlows.forEach((cashFlow) => {
    const calendarTimestamp = getT0CalendarDateUtc(cashFlow.occurredOn);
    const amount = signedAmount(cashFlow);
    if (calendarTimestamp === null || !Number.isFinite(amount) || Math.abs(amount) < 0.000001) return;
    const timestamp = calendarTimestamp + (cashFlow.atEndOfBeijingDay ? 24 * 60 * 60 * 1000 : 0);
    grouped.set(timestamp, (grouped.get(timestamp) || 0) + amount);
  });
  const flows = Array.from(grouped.entries())
    .map(([timestamp, amount]) => ({ timestamp, amount }))
    .filter((cashFlow) => Math.abs(cashFlow.amount) >= 0.000001)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (flows.length < 2 || !flows.some((cashFlow) => cashFlow.amount < 0) || !flows.some((cashFlow) => cashFlow.amount > 0)) return null;
  const firstTimestamp = flows[0].timestamp;
  const lastTimestamp = flows[flows.length - 1].timestamp;
  if (lastTimestamp <= firstTimestamp) return null;

  const npv = (rate: number) => {
    if (rate <= -1) return Number.POSITIVE_INFINITY;
    return flows.reduce((total, cashFlow) => {
      const years = (cashFlow.timestamp - firstTimestamp) / (365 * 24 * 60 * 60 * 1000);
      return total + cashFlow.amount / Math.pow(1 + rate, years);
    }, 0);
  };

  let lower = -0.999999999;
  let upper = 1;
  let lowerValue = npv(lower);
  let upperValue = npv(upper);
  if (!Number.isFinite(lowerValue) || Number.isNaN(upperValue)) return null;
  // Preserve the frontend's extended upper bound for large short-term annualized returns.
  for (let index = 0; index < 256 && lowerValue * upperValue > 0; index += 1) {
    upper = upper * 2 + 1;
    upperValue = npv(upper);
    if (Number.isNaN(upperValue) || !Number.isFinite(upper)) return null;
  }
  if (lowerValue * upperValue > 0) return null;

  for (let index = 0; index < 128; index += 1) {
    const middle = (lower + upper) / 2;
    const middleValue = npv(middle);
    if (!Number.isFinite(middleValue)) return null;
    if (Math.abs(middleValue) < 0.0000001) return middle;
    if (lowerValue * middleValue > 0) {
      lower = middle;
      lowerValue = middleValue;
    } else {
      upper = middle;
      upperValue = middleValue;
    }
  }
  const result = (lower + upper) / 2;
  return Number.isFinite(result) ? result : null;
}

/** Same terminal-value calculation as T0Journal's calculateT0XirrTargetTopUp.
 * cashFlows contains historical flows, NOT the terminalValue added again as a flow.
 * Each flow compounds to asOfDate's Beijing day end; negative terminal values are valid.
 * Returns an unrounded nonnegative amount; budget caps and cents belong to the caller. */
export function calculateT0AllocationTargetTopUp(
  cashFlows: T0AllocationCashFlow[],
  terminalValue: number,
  targetAnnualizedRate: number,
  asOfDate: string = getBeijingDateInputValue(),
): number | null {
  if (!Number.isFinite(terminalValue) || !Number.isFinite(targetAnnualizedRate) || targetAnnualizedRate <= -1) return null;
  const terminalDate = getT0CalendarDateUtc(asOfDate);
  if (terminalDate === null) return null;
  const terminalTimestamp = terminalDate + 24 * 60 * 60 * 1000;
  let hasInvestmentCashFlow = false;
  let requiredTerminalValue = 0;
  for (const cashFlow of cashFlows) {
    const calendarTimestamp = getT0CalendarDateUtc(cashFlow.occurredOn);
    const amount = signedAmount(cashFlow);
    if (calendarTimestamp === null || !Number.isFinite(amount)) continue;
    const timestamp = calendarTimestamp + (cashFlow.atEndOfBeijingDay ? 24 * 60 * 60 * 1000 : 0);
    if (timestamp > terminalTimestamp) continue;
    if (amount < 0) hasInvestmentCashFlow = true;
    const yearsToTerminal = (terminalTimestamp - timestamp) / (365 * 24 * 60 * 60 * 1000);
    requiredTerminalValue -= amount * Math.pow(1 + targetAnnualizedRate, yearsToTerminal);
  }
  if (!hasInvestmentCashFlow || !Number.isFinite(requiredTerminalValue)) return null;
  const topUp = requiredTerminalValue - terminalValue;
  return Number.isFinite(topUp) ? Math.max(0, topUp) : null;
}
