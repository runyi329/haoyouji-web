import { describe, expect, it } from 'vitest';
import {
  HISTORICAL_PRINCIPAL_END,
  HISTORICAL_PRINCIPAL_START,
  parseHistoricalPrincipalSources,
} from './wallet-historical-principal';

// 纯函数离线回归，不加载 DB/路由/前端。紧凑 marker 明确编码 CNY/wechat/user-confirmed 来源。
type SourceRow = Parameters<typeof parseHistoricalPrincipalSources>[0];
const prefix = '[CNY]历史手工保证金迁入并冻结 · 历史保证金 · startDate=2026-06-01';
function marker(businessDate = '2026-01-05', amount = '100.00000001', sourceTag = 'LQY') {
  return `${HISTORICAL_PRINCIPAL_START}${businessDate},${amount},${sourceTag}${HISTORICAL_PRINCIPAL_END}`;
}
function row(body = marker(), overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    id: 10001, ledger_id: 37, amount: '300.00000003',
    created_at: '2026-06-01 12:34:56', note: `${prefix}${body}`,
    ...overrides,
  };
}

describe('historical principal: confirmed CNY/wechat source is display-only', () => {
  it.each(['2026-01-05', '2026-05-05'])('keeps genuine business date %s without rewriting it to tag startDate', businessDate => {
    const input = row(marker(businessDate));
    const before = JSON.stringify(input);
    const sources = parseHistoricalPrincipalSources(input);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: 'historical-principal-10001', businessDate, amount: '100.00000001',
      sourceTag: 'LQY', targetTag: '历史保证金', walletRecordedAt: input.created_at,
      linkedWalletEntryId: input.id, paymentMethod: 'wechat', countsTowardBalance: false,
    });
    expect(sources[0]).not.toHaveProperty('startDate');
    expect(sources[0].note).toContain('业务日期经管理员确认');
    expect(sources[0].note).toContain('不重复增加余额');
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([36, 38, 52, 0, -1, '37', undefined])('rejects other or untrusted ledger id %s', ledger => {
    expect(parseHistoricalPrincipalSources(row(marker(), { ledger_id: ledger as number }))).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])('rejects invalid linked wallet id %s', id => {
    expect(parseHistoricalPrincipalSources(row(marker(), { id }))).toEqual([]);
  });

  it.each([
    '[CNY]普通充值 · 历史保证金', '[USDT]历史手工保证金迁入并冻结 · 历史保证金',
    '[CNY]历史手工保证金迁入并冻结',
  ])('does not infer sources from unrelated or incomplete migration note %s', notePrefix => {
    expect(parseHistoricalPrincipalSources(row(marker(), { note: `${notePrefix}${marker()}` }))).toEqual([]);
  });

  it.each(['[历史支付宝本金V1:', '[历史现金本金V1:', '[历史USDT本金V1:', '[历史微信本金V2:'])
  ('does not reinterpret a different payment/currency/version marker %s', start => {
    expect(parseHistoricalPrincipalSources(row(`${start}2026-01-05,100,LQY]`))).toEqual([]);
  });
});

describe('historical principal: exact positive amounts with up to eight decimals', () => {
  it.each(['1', '1.2', '1.23456789', '0.00000001', '999999999999999999.99999999'])
  ('accepts exact positive decimal text %s', amount => {
    const sources = parseHistoricalPrincipalSources(row(marker('2026-01-05', amount), { amount }));
    expect(sources).toHaveLength(1);
    expect(sources[0].amount).toBe(amount);
    expect(sources[0].countsTowardBalance).toBe(false);
  });

  it('rejects a one-unit overflow beyond Number precision by exact BigInt comparison', () => {
    const amount = '9007199254740992.00000001';
    const carrier = '9007199254740992.00000000';
    expect(Number(amount)).toBe(Number(carrier));
    expect(parseHistoricalPrincipalSources(row(marker('2026-01-05', amount), { amount: carrier }))).toEqual([]);
    expect(parseHistoricalPrincipalSources(row(marker('2026-01-05', carrier), { amount: carrier }))).toHaveLength(1);
  });

  it('allows equality and a smaller source but rejects any source exceeding carrier amount', () => {
    expect(parseHistoricalPrincipalSources(row(marker('2026-01-05', '0.30000003'), { amount: '0.30000003' }))).toHaveLength(1);
    expect(parseHistoricalPrincipalSources(row(marker('2026-01-05', '0.30000002'), { amount: '0.30000003' }))).toHaveLength(1);
    expect(parseHistoricalPrincipalSources(row(marker('2026-01-05', '0.30000004'), { amount: '0.30000003' }))).toEqual([]);
  });

  it.each([
    '0', '0.00000000', '-1', '+1', '1.123456789', '1e2', ' 1', '1 ', '.1', '1.',
    'NaN', 'Infinity', '1,000', '', '1000000000000000000',
  ])('rejects invalid or nonpositive source amount %s', amount => {
    expect(parseHistoricalPrincipalSources(row(marker('2026-01-05', amount)))).toEqual([]);
  });

  it.each(['0', '-1', '0.00000000', '1.123456789', '1e3', '', null, 300])
  ('rejects invalid carrier amount %s', amount => {
    expect(parseHistoricalPrincipalSources(row(marker(), { amount: amount as string }))).toEqual([]);
  });
});

describe('historical principal: real dates on or before migration', () => {
  it.each(['2024-02-29', '2000-02-29', '2026-01-05', '2026-06-01'])
  ('accepts real calendar date %s', businessDate => {
    expect(parseHistoricalPrincipalSources(row(marker(businessDate)))[0]?.businessDate).toBe(businessDate);
  });

  it.each([
    '2025-02-29', '1900-02-29', '2026-02-30', '2026-04-31', '2026-00-01', '2026-13-01',
    '2026-01-00', '2026-01-32', '2026-1-05', '2026-01-5', '2026/01/05', '2026-01-05T00:00:00Z', '',
  ])('rejects invalid/noncanonical date %s rather than normalizing it', businessDate => {
    expect(parseHistoricalPrincipalSources(row(marker(businessDate)))).toEqual([]);
  });

  it.each(['2026-06-02', '2027-01-01'])('rejects date %s later than migration', businessDate => {
    expect(parseHistoricalPrincipalSources(row(marker(businessDate)))).toEqual([]);
  });

  it.each(['2026-02-30 12:00:00', 'not-a-date', '2025-02-29', ''])
  ('rejects invalid migration date %s', created_at => {
    expect(parseHistoricalPrincipalSources(row(marker(), { created_at }))).toEqual([]);
  });
});

describe('historical principal: malformed and duplicate markers fail closed', () => {
  it.each([
    '', '[历史微信本金V1:2026-01-05,100,LQY', '[历史微信本金V1:2026-01-05,100]',
    '[历史微信本金V1:2026-01-05,100,LQY,extra]', '[历史微信本金V1:2026-01-05,100,]',
    '[历史微信本金V1:2026-01-05,100,  ]', '[历史微信本金V1:2026-01-05,100,L[QY]',
    '[历史微信本金V1:2026-01-05,100,L\nQY]', '[历史微信本金V1:2026-01-05,100,L\rQY]',
    `[历史微信本金V1:2026-01-05,100,${'x'.repeat(51)}]`,
  ])('rejects malformed fields or missing marker %s', body => {
    expect(() => parseHistoricalPrincipalSources(row(body))).not.toThrow();
    expect(parseHistoricalPrincipalSources(row(body))).toEqual([]);
  });

  it.each(['[]', '[', 'null', '{}', '[{"businessDate":"2026-01-05","amount":"100","currency":"CNY","paymentMethod":"wechat","dateBasis":"user_confirmed"}]'])
  ('rejects old JSON metadata (even otherwise valid) and damaged JSON %s', raw => {
    expect(parseHistoricalPrincipalSources(row(`[历史本金来源V1]${raw}[/历史本金来源V1]`))).toEqual([]);
    expect(parseHistoricalPrincipalSources(row(`[历史微信本金V1:${raw}]`))).toEqual([]);
  });

  it('rejects duplicate item/marker, even if a second marker is incomplete or differs', () => {
    for (const body of [marker() + marker(), marker() + marker('2026-05-05'), marker() + HISTORICAL_PRINCIPAL_START]) {
      expect(parseHistoricalPrincipalSources(row(body))).toEqual([]);
    }
  });

  it('rejects extra currency/payment/dateBasis fields rather than trusting loose JSON or guesses', () => {
    for (const extra of ['CNY', 'wechat', 'user_confirmed', 'USDT', 'alipay']) {
      expect(parseHistoricalPrincipalSources(row(`[历史微信本金V1:2026-01-05,100,LQY,${extra}]`))).toEqual([]);
    }
  });
});
