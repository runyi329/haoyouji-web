/** Structurally matches the existing engine input without importing server code. */
export type AiFearGreedDailyRow = {
  canonicaldate: string;
  rawCount: number;
  validCount: number;
  upCount: number;
  downCount: number;
  upAmount: number;
  downAmount: number;
  totalAmount: number;
  /** Decimal return: 0.01 means +1%; null means there are no valid rows. */
  meanReturn: number | null;
};

const REQUIRED_FIELDS = ['ts_code', 'trade_date', 'close', 'pre_close', 'pct_chg', 'vol', 'amount'] as const;
const NUMERIC_FIELDS = ['close', 'pre_close', 'pct_chg', 'vol', 'amount'] as const;
const MIN_RAW_COUNT = 3000;
const A_SHARE_CODE = /^(?:6\d{5}\.SH|[03]\d{5}\.SZ)$/;

function canonicalDate(tradeDate: string): string {
  if (typeof tradeDate !== 'string' || !/^\d{8}$/.test(tradeDate)) {
    throw new Error('tradeDate must be a strict YYYYMMDD Tushare date');
  }
  const year = Number(tradeDate.slice(0, 4));
  const month = Number(tradeDate.slice(4, 6));
  const day = Number(tradeDate.slice(6, 8));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('tradeDate is not a real calendar date');
  }
  return `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}`;
}

/** Compensated Number sums; this is not arbitrary-precision accounting. */
class Sum {
  value = 0;
  private compensation = 0;

  add(value: number): void {
    const corrected = value - this.compensation;
    const next = this.value + corrected;
    this.compensation = (next - this.value) - corrected;
    if (!Number.isFinite(next) || !Number.isFinite(this.compensation)) {
      throw new Error('Non-finite aggregate sum');
    }
    this.value = next;
  }
}

/**
 * Aggregate one complete upstream Tushare `daily` response, using the codes
 * actually present on that source day, never today's constituent list.
 *
 * rawCount counts only 6xxxxx.SH / 0xxxxx.SZ / 3xxxxx.SZ, including legal
 * zero-volume/zero-amount rows. Valid rows additionally require positive close,
 * pre_close, amount and vol; flat valid rows contribute to totalAmount/meanReturn
 * but neither direction. Amount stays in Tushare's original unit (thousand CNY).
 *
 * Missing/null/non-number/non-finite required values, malformed dates, mixed
 * days and duplicate (day, code) reject the whole response, including excluded
 * codes. Numeric strings are deliberately not coerced. The 3000 in-universe
 * raw-row floor is a minimum sanity check, NOT an official completeness guarantee.
 * No caller can lower that floor, and no synthetic fallback is provided here.
 */
export function aggregateAiFearGreedMarketDay(
  fields: string[],
  items: unknown[][],
  tradeDate: string,
): AiFearGreedDailyRow {
  const canonicaldate = canonicalDate(tradeDate);
  if (!Array.isArray(fields) || fields.some(field => typeof field !== 'string' || field.length === 0)) {
    throw new Error('fields must contain non-empty field names');
  }
  if (new Set(fields).size !== fields.length) throw new Error('Duplicate field name');
  for (const field of REQUIRED_FIELDS) {
    if (!fields.includes(field)) throw new Error(`Missing required field: ${field}`);
  }
  if (!Array.isArray(items)) throw new Error('items must be an array');
  const indices = Object.fromEntries(REQUIRED_FIELDS.map(field => [field, fields.indexOf(field)])) as Record<(typeof REQUIRED_FIELDS)[number], number>;
  const seen = new Set<string>();
  const upAmount = new Sum();
  const downAmount = new Sum();
  const totalAmount = new Sum();
  const returns = new Sum();
  let rawCount = 0;
  let validCount = 0;
  let upCount = 0;
  let downCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!Array.isArray(item) || item.length !== fields.length) {
      throw new Error(`Row ${i}: field/item length mismatch`);
    }
    const code = item[indices.ts_code];
    if (typeof code !== 'string' || !/^\d{6}\.(?:SH|SZ|BJ)$/.test(code)) {
      throw new Error(`Row ${i}: malformed ts_code`);
    }
    const sourceDate = item[indices.trade_date];
    if (typeof sourceDate !== 'string' || sourceDate !== tradeDate) {
      throw new Error(`Row ${i}: trade_date must match the requested strict source day`);
    }
    const key = `${sourceDate}/${code}`;
    if (seen.has(key)) throw new Error(`Row ${i}: duplicate day/code`);
    seen.add(key);

    for (const field of NUMERIC_FIELDS) {
      const value = item[indices[field]];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Row ${i}: ${field} must be a finite number (no null coercion)`);
      }
    }
    if (!A_SHARE_CODE.test(code)) continue;
    rawCount++;
    const close = item[indices.close] as number;
    const preClose = item[indices.pre_close] as number;
    const pctChange = item[indices.pct_chg] as number;
    const vol = item[indices.vol] as number;
    const amount = item[indices.amount] as number;
    if (!(close > 0 && preClose > 0 && amount > 0 && vol > 0)) continue;

    validCount++;
    totalAmount.add(amount);
    returns.add(pctChange / 100);
    if (pctChange > 0) {
      upCount++;
      upAmount.add(amount);
    } else if (pctChange < 0) {
      downCount++;
      downAmount.add(amount);
    }
  }
  if (rawCount < MIN_RAW_COUNT) {
    throw new Error(`Incomplete market daily response: rawCount ${rawCount} is below minimum ${MIN_RAW_COUNT}`);
  }
  return {
    canonicaldate,
    rawCount,
    validCount,
    upCount,
    downCount,
    upAmount: upAmount.value,
    downAmount: downAmount.value,
    totalAmount: totalAmount.value,
    meanReturn: validCount === 0 ? null : returns.value / validCount,
  };
}
