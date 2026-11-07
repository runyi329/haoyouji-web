/**
 * Pure helpers for full A-share daily-history backfills.
 * No network, database, environment, or timezone configuration is consulted.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAILY_FIELDS = [
  'ts_code', 'trade_date', 'open', 'high', 'low', 'close',
  'pre_close', 'change', 'pct_chg', 'vol', 'amount',
];
const NUMERIC_FIELDS = [
  ['open', 'open'],
  ['high', 'high'],
  ['low', 'low'],
  ['close', 'close'],
  ['pre_close', 'preClose'],
  ['change', 'chg'],
  ['pct_chg', 'pctChg'],
  ['vol', 'vol'],
  ['amount', 'amount'],
];

/** Accept only an eight-character Gregorian calendar date (years 0001–9999). */
export function isTradeDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function requireDate(value, label) {
  if (!isTradeDate(value)) throw new Error(`Invalid ${label}: ${String(value)}`);
}

function formatUtcDate(date) {
  const result = `${String(date.getUTCFullYear()).padStart(4, '0')}${
    String(date.getUTCMonth() + 1).padStart(2, '0')}${
    String(date.getUTCDate()).padStart(2, '0')}`;
  requireDate(result, 'completed cutoff');
  return result;
}

/**
 * Calendar cutoff at Beijing 15:00: before close use yesterday, otherwise today.
 * This intentionally does not guess holidays or weekends; absent rows stay absent.
 */
export function completedCutoff(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('Invalid now: expected a valid Date');
  }
  const beijing = new Date(now.getTime() + BEIJING_OFFSET_MS);
  if (!Number.isFinite(beijing.getTime())) throw new Error('Invalid Beijing date');
  if (beijing.getUTCHours() < 15) {
    beijing.setUTCDate(beijing.getUTCDate() - 1);
  }
  return formatUtcDate(beijing);
}

/**
 * Partition into inclusive, adjacent ten-calendar-year buckets anchored to the
 * listing year: e.g. 19901126–19991231, 20000101–20091231, ... .
 * Each bucket has at most 3653 calendar days, below the API's 6000-row cap.
 * An invalid/missing delisting date is ignored; an invalid listing/cutoff throws.
 * An effective cutoff before listing yields no segments.
 */
export function historySegments(listDate, cutoff, delistDate = null) {
  requireDate(listDate, 'listing date');
  requireDate(cutoff, 'cutoff');
  const validDelist = isTradeDate(delistDate);
  if (validDelist && delistDate < listDate) {
    throw new Error('Delisting date precedes listing date');
  }
  const effectiveEnd = validDelist && delistDate < cutoff ? delistDate : cutoff;
  if (effectiveEnd < listDate) return [];

  const segments = [];
  let start = listDate;
  let bucketYear = Number(listDate.slice(0, 4));
  while (start <= effectiveEnd) {
    const bucketEnd = `${String(Math.min(bucketYear + 9, 9999)).padStart(4, '0')}1231`;
    const end = bucketEnd < effectiveEnd ? bucketEnd : effectiveEnd;
    segments.push({ start, end });
    if (end === effectiveEnd) break;
    bucketYear += 10;
    start = `${String(bucketYear).padStart(4, '0')}0101`;
  }
  return segments;
}

function finiteNumber(value, label) {
  // Numeric strings are accepted, but null, blanks, booleans, containers and
  // non-decimal coercions (e.g. hexadecimal strings) must never become zero.
  if (typeof value === 'string') {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) {
      throw new Error(`Invalid numeric ${label}: ${String(value)}`);
    }
    value = Number(value);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid numeric ${label}: ${String(value)}`);
  }
  return value;
}

/**
 * Validate and normalize a Tushare daily response, sorted by trade date ascending.
 * Official change/pct_chg are retained, not recomputed from raw previous closes
 * (the official pre_close denominator accounts for ex-rights/ex-dividend days).
 * Empty items are a successful empty segment, not permission to synthesize rows.
 * Literal null vol/amount are retained as unknown, never replaced or estimated.
 */
export function validateDailyResponse(json, { tsCode, start, end }) {
  if (typeof tsCode !== 'string' || !tsCode.trim()) {
    throw new Error('Invalid requested tsCode');
  }
  requireDate(start, 'segment start');
  requireDate(end, 'segment end');
  if (start > end) throw new Error('Segment start exceeds end');
  if (!json || typeof json !== 'object' || Array.isArray(json) || json.code !== 0) {
    throw new Error(`Tushare daily response code must be 0 (received ${String(json?.code)})`);
  }
  const data = json.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || !Array.isArray(data.fields) || !Array.isArray(data.items)) {
    throw new Error('Malformed Tushare daily data: expected fields and items arrays');
  }
  if (data.fields.some((field) => typeof field !== 'string' || !field.trim())
    || new Set(data.fields).size !== data.fields.length) {
    throw new Error('Malformed Tushare daily fields: invalid or duplicate names');
  }
  const indexes = new Map(data.fields.map((field, index) => [field, index]));
  for (const field of DAILY_FIELDS) {
    if (!indexes.has(field)) throw new Error(`Missing required daily field: ${field}`);
  }
  if (data.items.length >= 6000) {
    throw new Error(`Possible truncated daily response: ${data.items.length} rows (limit 6000)`);
  }

  const dates = new Set();
  const rows = data.items.map((item, rowIndex) => {
    if (!Array.isArray(item) || item.length !== data.fields.length) {
      throw new Error(`Malformed daily item ${rowIndex}: column count mismatch`);
    }
    const value = (field) => item[indexes.get(field)];
    if (value('ts_code') !== tsCode) {
      throw new Error(`Daily ts_code mismatch at item ${rowIndex}`);
    }
    const tradeDate = value('trade_date');
    requireDate(tradeDate, `trade_date at item ${rowIndex}`);
    if (tradeDate < start || tradeDate > end) {
      throw new Error(`Daily trade_date ${tradeDate} outside segment ${start}–${end}`);
    }
    if (dates.has(tradeDate)) throw new Error(`Duplicate daily trade_date: ${tradeDate}`);
    dates.add(tradeDate);

    const row = { tsCode, tradeDate };
    for (const [field, property] of NUMERIC_FIELDS) {
      const cell = value(field);
      row[property] = (field === 'vol' || field === 'amount') && cell === null
        ? null
        : finiteNumber(cell, `${field} at ${tradeDate}`);
    }
    for (const field of ['open', 'high', 'low', 'close']) {
      if (row[field] <= 0) throw new Error(`${field} must be positive at ${tradeDate}`);
    }
    for (const field of ['preClose', 'vol', 'amount']) {
      if (row[field] !== null && row[field] < 0) {
        throw new Error(`${field} must be nonnegative at ${tradeDate}`);
      }
    }
    if (row.high < row.low) throw new Error(`high is below low at ${tradeDate}`);
    return row;
  });
  return rows.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

/**
 * Classify official pctChg signs only; duplicates and unknown values are errors.
 * Empty histories have zero counts/rate and null first/last trade dates.
 */
export function summarizeRows(rows) {
  if (!Array.isArray(rows)) throw new Error('History rows must be an array');
  const dates = new Set();
  let upDays = 0;
  let downDays = 0;
  let flatDays = 0;
  let firstTradeDate = null;
  let lastTradeDate = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Malformed history row');
    }
    requireDate(row.tradeDate, 'history tradeDate');
    if (dates.has(row.tradeDate)) throw new Error(`Duplicate history tradeDate: ${row.tradeDate}`);
    dates.add(row.tradeDate);
    const pctChg = finiteNumber(row.pctChg, `pctChg at ${row.tradeDate}`);
    if (pctChg > 0) upDays += 1;
    else if (pctChg < 0) downDays += 1;
    else flatDays += 1;
    if (firstTradeDate === null || row.tradeDate < firstTradeDate) firstTradeDate = row.tradeDate;
    if (lastTradeDate === null || row.tradeDate > lastTradeDate) lastTradeDate = row.tradeDate;
  }
  const totalDays = rows.length;
  const upRate = totalDays === 0 ? 0 : Math.round((upDays / totalDays) * 1000) / 10;
  return { upDays, downDays, flatDays, totalDays, upRate, firstTradeDate, lastTradeDate };
}
