import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  isTradeDate,
  completedCutoff,
  historySegments,
  validateDailyResponse,
  summarizeRows,
} from './stock_history_core.mjs';

const fields = [
  'ts_code', 'trade_date', 'open', 'high', 'low', 'close',
  'pre_close', 'change', 'pct_chg', 'vol', 'amount',
];
const options = { tsCode: '600000.SH', start: '20241001', end: '20241031' };

// Offline fixture in the actual Tushare fields/items response format. Numbers
// exercise ex-rights and first-day semantics; these are not live market quotes.
function fixture() {
  return {
    request_id: 'offline-daily-fixture',
    code: 0,
    msg: '',
    data: {
      fields: [...fields],
      items: [
        ['600000.SH', '20241014', 9.3, 10.1, 9.1, 9.9, 9, 0.9, 10, 184200.12, 176590.245],
        ['600000.SH', '20241011', 10.1, 10.2, 9.8, 10, 10.2, -0.2, -1.9608, 100000, 100000],
        ['600000.SH', '20241010', 10, 10.1, 9.9, 10.01, 0, 10.01, 0, 12000, 12012],
      ],
    },
  };
}

function changeCell(field, value) {
  const json = fixture();
  json.data.items[0][fields.indexOf(field)] = value;
  return json;
}

function ordinal(date) {
  const utc = new Date(0);
  utc.setUTCFullYear(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));
  utc.setUTCHours(0, 0, 0, 0);
  return utc.getTime() / (24 * 60 * 60 * 1000);
}

function verifySegments(segments, start, end) {
  assert.equal(segments[0].start, start);
  assert.equal(segments.at(-1).end, end);
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    assert.ok(isTradeDate(segment.start));
    assert.ok(isTradeDate(segment.end));
    assert.ok(segment.start <= segment.end);
    assert.ok(ordinal(segment.end) - ordinal(segment.start) + 1 <= 3653);
    if (i > 0) assert.equal(ordinal(segment.start) - ordinal(segments[i - 1].end), 1);
  }
}

test('isTradeDate accepts only strict, actual Gregorian YYYYMMDD dates', () => {
  for (const value of ['19901126', '20000229', '20240229', '20261231', '00010101', '99991231']) {
    assert.equal(isTradeDate(value), true, value);
  }
  for (const value of [
    '19000229', '21000229', '20230229', '20240431', '20241131', '20240001',
    '20241301', '20240100', '20240132', '00000101', '2024-01-01', '2024011',
    '202401011', ' 20240101', '20240101 ', '２０２４０１０１', '', null, undefined,
    20240101, new Date('2024-01-01'), {},
  ]) {
    assert.equal(isTradeDate(value), false, String(value));
  }
});

test('completedCutoff changes at exactly Beijing 15:00 including milliseconds', () => {
  assert.equal(completedCutoff(new Date('2026-11-06T06:59:59.999Z')), '20261105');
  assert.equal(completedCutoff(new Date('2026-11-06T07:00:00.000Z')), '20261106');
  assert.equal(completedCutoff(new Date('2026-11-06T07:00:00.001Z')), '20261106');
  assert.equal(completedCutoff(new Date('2026-11-06T14:59:59+08:00')), '20261105');
  assert.equal(completedCutoff(new Date('2026-11-06T15:00:00+08:00')), '20261106');
  assert.ok(isTradeDate(completedCutoff()));
});

test('completedCutoff handles Beijing/UTC day rollover, new year and leap days', () => {
  assert.equal(completedCutoff(new Date('2025-12-31T16:00:00Z')), '20251231');
  assert.equal(completedCutoff(new Date('2026-01-01T07:00:00Z')), '20260101');
  assert.equal(completedCutoff(new Date('2024-03-01T06:59:59Z')), '20240229');
  assert.equal(completedCutoff(new Date('2023-03-01T06:59:59Z')), '20230228');
  // Calendar cutoff, not a fabricated exchange-calendar/last-trading-date guess.
  assert.equal(completedCutoff(new Date('2024-10-13T07:00:00Z')), '20241013');
  assert.equal(completedCutoff(new Date('2024-10-14T06:59:59Z')), '20241013');
  for (const value of [new Date('invalid'), null, undefined, '2026-11-06', 0]) {
    if (value === undefined) continue; // undefined invokes the default valid Date.
    assert.throws(() => completedCutoff(value), /Invalid now/);
  }
});

test('completedCutoff is independent of process TZ', () => {
  const moduleUrl = new URL('./stock_history_core.mjs', import.meta.url).href;
  const script = `import { completedCutoff } from ${JSON.stringify(moduleUrl)};
console.log(JSON.stringify([
  completedCutoff(new Date('2026-11-06T06:59:59.999Z')),
  completedCutoff(new Date('2026-11-06T07:00:00Z')),
  completedCutoff(new Date('2024-03-01T06:59:59Z'))
]));`;
  for (const TZ of ['UTC', 'America/New_York', 'Asia/Shanghai', 'Asia/Kathmandu']) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ }, encoding: 'utf8',
    });
    assert.deepEqual(JSON.parse(output), ['20261105', '20261106', '20240229'], TZ);
  }
});

test('historySegments anchors ten-year buckets to listing year and exact listing date', () => {
  const segments = historySegments('19901126', '20261106');
  assert.deepEqual(segments, [
    { start: '19901126', end: '19991231' },
    { start: '20000101', end: '20091231' },
    { start: '20100101', end: '20191231' },
    { start: '20200101', end: '20261106' },
  ]);
  verifySegments(segments, '19901126', '20261106');
  assert.deepEqual(historySegments('19911231', '20010101'), [
    { start: '19911231', end: '20001231' },
    { start: '20010101', end: '20010101' },
  ]);
});

test('historySegments crosses leap/century years continuously and never approaches 6000 rows', () => {
  for (const [start, end] of [
    ['18960101', '19251231'],
    ['19920229', '20311231'],
    ['20000101', '20191231'],
    ['20240229', '20340228'],
    ['00010101', '00391231'],
    ['99900228', '99991231'],
    ['99991231', '99991231'],
  ]) {
    verifySegments(historySegments(start, end), start, end);
  }
  assert.equal(ordinal('20091231') - ordinal('20000101') + 1, 3653);
  assert.deepEqual(historySegments('20240229', '20240229'), [{ start: '20240229', end: '20240229' }]);
});

test('historySegments caps delisting, ignores invalid delisting, and rejects inconsistent dates', () => {
  assert.deepEqual(historySegments('19901126', '20261106', '20010501'), [
    { start: '19901126', end: '19991231' },
    { start: '20000101', end: '20010501' },
  ]);
  assert.deepEqual(historySegments('20240102', '20241001', '20241101'), [
    { start: '20240102', end: '20241001' },
  ]);
  assert.deepEqual(historySegments('20240102', '20241001', '20240102'), [
    { start: '20240102', end: '20240102' },
  ]);
  for (const invalidDelist of [null, undefined, '', '20230229', '00000000', 20240101, 'bad']) {
    assert.deepEqual(historySegments('20240102', '20241001', invalidDelist), [
      { start: '20240102', end: '20241001' },
    ]);
  }
  assert.deepEqual(historySegments('20260101', '20251231'), []);
  assert.throws(() => historySegments('20230229', '20261106'), /listing date/);
  assert.throws(() => historySegments(null, '20261106'), /listing date/);
  assert.throws(() => historySegments('20240102', '20230229'), /cutoff/);
  assert.throws(() => historySegments('20240102', '20241001', '20240101'), /precedes/);
  assert.throws(() => historySegments('20240102', '20230101', '20220101'), /precedes/);
});

test('validateDailyResponse normalizes real-style fields/items, sorts without mutating and preserves official pct', () => {
  const json = fixture();
  const original = structuredClone(json);
  const rows = validateDailyResponse(json, options);
  assert.deepEqual(rows.map((row) => row.tradeDate), ['20241010', '20241011', '20241014']);
  assert.deepEqual(rows[2], {
    tsCode: '600000.SH', tradeDate: '20241014', open: 9.3, high: 10.1, low: 9.1,
    close: 9.9, preClose: 9, chg: 0.9, pctChg: 10, vol: 184200.12, amount: 176590.245,
  });
  assert.equal(rows[0].preClose, 0); // first listing day may have no previous close
  assert.equal(rows[0].pctChg, 0);
  assert.equal(rows[2].pctChg, 10); // raw close went down versus Friday's 10, not the official denominator
  assert.deepEqual(json, original);
});

test('validateDailyResponse supports reordered fields, extra fields and finite decimal numeric strings', () => {
  const json = fixture();
  json.data.items = json.data.items.map((item) => [...item].reverse().concat('extra'));
  json.data.fields = [...json.data.fields].reverse().concat('extra_field');
  assert.equal(validateDailyResponse(json, options)[2].chg, 0.9);
  for (const value of ['10', ' 10.0 ', '+1e1', '1.0e+1']) {
    assert.equal(validateDailyResponse(changeCell('pct_chg', value), options)[2].pctChg, 10);
  }
  assert.equal(validateDailyResponse(changeCell('vol', 0), options)[2].vol, 0);
  assert.equal(validateDailyResponse(changeCell('amount', 0), options)[2].amount, 0);
});

for (const field of ['amount', 'vol']) {
  test(`validateDailyResponse preserves literal null ${field} without changing pctChg-only statistics`, () => {
    const json = changeCell(field, null);
    const original = structuredClone(json);
    const baseline = validateDailyResponse(fixture(), options);
    const rows = validateDailyResponse(json, options);
    assert.equal(rows[2][field], null); // unknown is neither zero nor an estimate
    assert.deepEqual(rows, baseline.map((row, index) => index === 2 ? { ...row, [field]: null } : row));
    assert.deepEqual(json, original);
    assert.deepEqual(summarizeRows(rows), summarizeRows(baseline));
    assert.deepEqual(summarizeRows(rows), {
      upDays: 1, downDays: 1, flatDays: 1, totalDays: 3, upRate: 33.3,
      firstTradeDate: '20241010', lastTradeDate: '20241014',
    });
  });
}

test('validateDailyResponse preserves simultaneous null vol and amount on every pctChg sign', () => {
  const json = fixture();
  for (const item of json.data.items) {
    item[fields.indexOf('vol')] = null;
    item[fields.indexOf('amount')] = null;
  }
  const original = structuredClone(json);
  const baseline = validateDailyResponse(fixture(), options);
  const rows = validateDailyResponse(json, options);
  assert.deepEqual(rows, baseline.map((row) => ({ ...row, vol: null, amount: null })));
  assert.deepEqual(summarizeRows(rows), summarizeRows(baseline));
  assert.deepEqual(json, original);
});

test('validateDailyResponse requires success code and correct response/item structure', () => {
  for (const bad of [null, undefined, {}, [], { code: '0', data: fixture().data }, { code: -2001, msg: 'token error' }]) {
    assert.throws(() => validateDailyResponse(bad, options), /code must be 0/);
  }
  for (const data of [null, [], {}, { fields, items: null }, { fields: 'ts_code', items: [] }]) {
    assert.throws(() => validateDailyResponse({ code: 0, data }, options), /Malformed/);
  }
  for (const field of fields) {
    const json = fixture();
    const index = json.data.fields.indexOf(field);
    json.data.fields.splice(index, 1);
    json.data.items.forEach((item) => item.splice(index, 1));
    assert.throws(() => validateDailyResponse(json, options), /Missing required/);
  }
  for (const badField of ['ts_code', null, '', 3]) {
    const json = fixture();
    json.data.fields.push(badField);
    json.data.items.forEach((item) => item.push(1));
    assert.throws(() => validateDailyResponse(json, options), /fields/);
  }
  for (const badItem of [null, {}, 'row', [], [...fixture().data.items[0], 1]]) {
    const json = fixture();
    json.data.items = [badItem];
    assert.throws(() => validateDailyResponse(json, options), /Malformed daily item/);
  }
});

test('validateDailyResponse rejects row caps rather than trusting truncated pages', () => {
  for (const length of [6000, 6001]) {
    const json = fixture();
    json.data.items = Array(length).fill(json.data.items[0]);
    assert.throws(() => validateDailyResponse(json, options), /truncated.*limit 6000/);
  }
});

test('validateDailyResponse rejects code mismatch, invalid/out-of-range dates and duplicate dates', () => {
  for (const tsCode of ['000001.SZ', null, '', '600000.SH ']) {
    assert.throws(() => validateDailyResponse(changeCell('ts_code', tsCode), options), /ts_code mismatch/);
  }
  for (const value of ['20240930', '20241101']) {
    assert.throws(() => validateDailyResponse(changeCell('trade_date', value), options), /outside segment/);
  }
  for (const value of ['20240230', '2024101', 20241014, null]) {
    assert.throws(() => validateDailyResponse(changeCell('trade_date', value), options), /trade_date/);
  }
  const json = fixture();
  json.data.items.push([...json.data.items[0]]);
  assert.throws(() => validateDailyResponse(json, options), /Duplicate daily trade_date/);
  assert.throws(() => validateDailyResponse(fixture(), { ...options, tsCode: '' }), /tsCode/);
  assert.throws(() => validateDailyResponse(fixture(), { ...options, start: '20240230' }), /segment start/);
  assert.throws(() => validateDailyResponse(fixture(), { ...options, end: '20240930' }), /start exceeds end/);
});

test('validateDailyResponse rejects null required price/change cells and all other invalid numeric cells', () => {
  for (const field of fields.slice(2, 9)) {
    assert.throws(() => validateDailyResponse(changeCell(field, null), options), /Invalid numeric/, `${field}: null`);
  }
  for (const field of fields.slice(2)) {
    for (const value of [undefined, '', '  ', '\t\n', NaN, Infinity, -Infinity, 'NaN', 'Infinity', 'null', 'abc', '0x10', true, false, [], {}]) {
      assert.throws(() => validateDailyResponse(changeCell(field, value), options), /Invalid numeric/, `${field}: ${String(value)}`);
    }
    const json = fixture();
    delete json.data.items[0][fields.indexOf(field)];
    assert.throws(() => validateDailyResponse(json, options), /Invalid numeric/, `${field}: missing cell`);
  }
});

test('validateDailyResponse enforces requested price and volume sanity constraints', () => {
  for (const field of ['open', 'high', 'low', 'close']) {
    for (const value of [0, -1]) {
      assert.throws(() => validateDailyResponse(changeCell(field, value), options), /must be positive/);
    }
  }
  for (const field of ['pre_close', 'vol', 'amount']) {
    assert.throws(() => validateDailyResponse(changeCell(field, -1), options), /nonnegative/);
  }
  assert.throws(() => validateDailyResponse(changeCell('high', 9), options), /high is below low/);
});

test('summarizeRows classifies official pctChg, rounds to one decimal, does not depend on close or order', () => {
  const rows = validateDailyResponse(fixture(), options).reverse();
  const original = structuredClone(rows);
  assert.deepEqual(summarizeRows(rows), {
    upDays: 1, downDays: 1, flatDays: 1, totalDays: 3, upRate: 33.3,
    firstTradeDate: '20241010', lastTradeDate: '20241014',
  });
  assert.deepEqual(rows, original);
  const result = summarizeRows([
    { tradeDate: '20241014', pctChg: '0.001' },
    { tradeDate: '20241015', pctChg: 1 },
    { tradeDate: '20241016', pctChg: -0.0001 },
  ]);
  assert.equal(result.upRate, 66.7);
  assert.equal(typeof result.upRate, 'number');
  assert.equal(result.upDays + result.downDays + result.flatDays, result.totalDays);
  assert.equal(summarizeRows([{ tradeDate: '20241014', pctChg: -0 }]).flatDays, 1);
  assert.equal(summarizeRows([{ tradeDate: '20241014', pctChg: 1 }]).upRate, 100);
});

test('summarizeRows rejects duplicate dates, unknown pct and malformed rows', () => {
  assert.throws(() => summarizeRows([
    { tradeDate: '20241014', pctChg: 1 }, { tradeDate: '20241014', pctChg: 0 },
  ]), /Duplicate history tradeDate/);
  for (const value of [undefined, null, NaN, Infinity, -Infinity, '', ' ', 'NaN', 'invalid', false]) {
    assert.throws(() => summarizeRows([{ tradeDate: '20241014', pctChg: value }]), /Invalid numeric/);
  }
  assert.throws(() => summarizeRows([{ tradeDate: '20241014' }]), /Invalid numeric/);
  for (const value of [null, {}, 'rows']) assert.throws(() => summarizeRows(value), /must be an array/);
  for (const row of [null, [], false]) assert.throws(() => summarizeRows([row]), /Malformed history row/);
  assert.throws(() => summarizeRows([{ tradeDate: '20240230', pctChg: 1 }]), /tradeDate/);
});

test('empty/suspended segments remain empty and neither validation nor summary generates weekend rows', () => {
  const json = fixture();
  json.data.items = [];
  assert.deepEqual(validateDailyResponse(json, options), []);
  assert.deepEqual(summarizeRows([]), {
    upDays: 0, downDays: 0, flatDays: 0, totalDays: 0, upRate: 0,
    firstTradeDate: null, lastTradeDate: null,
  });
  const sparse = fixture();
  sparse.data.items = sparse.data.items.filter((item) => ['20241011', '20241014'].includes(item[1]));
  const rows = validateDailyResponse(sparse, options);
  assert.deepEqual(rows.map((row) => row.tradeDate), ['20241011', '20241014']);
  assert.equal(summarizeRows(rows).totalDays, 2);
  assert.ok(!rows.some((row) => ['20241012', '20241013'].includes(row.tradeDate)));
  const summary = summarizeRows(validateDailyResponse(fixture(), options));
  assert.equal(summary.totalDays, 3); // no missing October 9 / holidays / other dates are generated
  assert.equal(summary.upDays + summary.downDays + summary.flatDays, summary.totalDays);
});
