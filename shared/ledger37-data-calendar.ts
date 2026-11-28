import type { Ledger37DataTag } from './ledger37-data-management';

export type Ledger37CalendarMonth = {
  leadingEmpty: number;
  days: Array<{ date: string; day: number }>;
};

export type Ledger37MemberReturnCurvePoint = {
  date: string;
  totalPnl: number | null;
  verifiedSubtotal: number | null;
  pendingTagNames: string[];
};

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function parseMonth(month: string): { year: number; monthIndex: number } {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new RangeError('month must use YYYY-MM format');
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1900 || year > 2200 || monthNumber < 1 || monthNumber > 12) {
    throw new RangeError('month must be a valid month from 1900-01 through 2200-12');
  }
  return { year, monthIndex: monthNumber - 1 };
}

export function ledger37CalendarMonth(month: string): Ledger37CalendarMonth {
  const { year, monthIndex } = parseMonth(month);
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const leadingEmpty = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const days: Array<{ date: string; day: number }> = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({ date: `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`, day });
  }
  return { leadingEmpty, days };
}

function isKnownTotal(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function latestPointByDate(tag: Ledger37DataTag): Map<string, number | null> {
  const points = new Map<string, number | null>();
  // Without a settlement identity, duplicate same-day points are ambiguous.
  // Keep that date missing instead of choosing an input-order winner.
  tag.points.forEach(point => points.set(point.date, points.has(point.date) ? null : point.totalPnl));
  return points;
}

export function ledger37MemberReturnCurve(tags: Ledger37DataTag[]): Ledger37MemberReturnCurvePoint[] {
  const dates: string[] = [];
  tags.forEach(tag => tag.points.forEach(point => {
    if (dates.indexOf(point.date) === -1) dates.push(point.date);
  }));
  dates.sort();

  const indexed = tags.map(tag => ({ tag, points: latestPointByDate(tag) }));
  return dates.map(date => {
    let knownCount = 0;
    let subtotal = 0;
    const pendingTagNames: string[] = [];

    indexed.forEach(({ tag, points }) => {
      if (tag.startDate !== null && tag.startDate > date) return;

      let latestDate: string | undefined;
      points.forEach((_value, pointDate) => {
        if (pointDate <= date && (latestDate === undefined || pointDate > latestDate)) {
          latestDate = pointDate;
        }
      });
      const latestTotal = latestDate === undefined ? undefined : points.get(latestDate);
      if (isKnownTotal(latestTotal)) {
        knownCount += 1;
        subtotal += latestTotal;
      } else {
        pendingTagNames.push(tag.name);
      }
    });

    const verifiedSubtotal = knownCount > 0 && Number.isFinite(subtotal) ? subtotal : null;
    return {
      date,
      totalPnl: pendingTagNames.length === 0 && verifiedSubtotal !== null ? verifiedSubtotal : null,
      verifiedSubtotal,
      pendingTagNames,
    };
  });
}
