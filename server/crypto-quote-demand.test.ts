import { describe, expect, it, vi } from 'vitest';
import { CRYPTO_ASSET_CODES } from '../shared/crypto-asset-catalog';
import {
  CRYPTO_QUOTE_DEMAND_GRACE_MS, CRYPTO_QUOTE_DEMAND_LEASE_MS, CRYPTO_QUOTE_DEMAND_REFRESH_MS,
  CRYPTO_QUOTE_DEMAND_SOURCES, CryptoQuoteDemandRegistry, LEGACY_CRYPTO_QUOTE_SYMBOLS,
  MAX_ACTIVE_CRYPTO_QUOTE_SYMBOLS, cryptoDemandDecimalIsNonzero, normalizeCryptoQuoteDemandSymbol,
  getActiveCryptoQuoteSymbols, getCryptoQuoteDemandDiagnostics, type CryptoQuoteDemandQuery,
} from './crypto-quote-demand';

// Importing demand must not import/connect DB or run a lazy schema initializer.
vi.mock('./db', () => { throw new Error('DB must not be imported in demand tests'); });
type Row = Record<string, unknown>;
function fixture() {
  let now = 1_000;
  const data = new Map<string, Row[]>();
  const failures = new Map<string, Error>();
  const query = vi.fn<CryptoQuoteDemandQuery>(async sql => {
    const source = CRYPTO_QUOTE_DEMAND_SOURCES.find(item => item.sql === sql);
    if (!source) throw new Error('unknown_test_source');
    if (failures.has(source.id)) throw failures.get(source.id);
    return data.get(source.id) ?? [];
  });
  const registry = new CryptoQuoteDemandRegistry({ query, now: () => now });
  return { registry, query, data, failures, advance: (ms = CRYPTO_QUOTE_DEMAND_REFRESH_MS) => { now += ms; }, now: () => now };
}
function order(overrides: Row = {}): Row {
  return { status: 'active', coin: 'FIL', amount_currency: 'USDT', interest_base_currency: 'USDT',
    interest_rate_currency: 'USDT', collateral_coin: null, collateral_qty: null,
    collateral_assets: null, lent_out_assets: null, option_info: null, ...overrides };
}
function participant(snapshot: unknown, overrides: Row = {}): Row {
  return order({ coin: 'BTC', order_snapshot: snapshot, participant_amount_currency: null,
    participant_interest_base_currency: null, participant_interest_rate_currency: null, ...overrides });
}

describe('crypto quote demand normalization / exact quantity', () => {
  it('accepts base or explicit USDT crypto only; rejects unknown, derivative, securities and funding', () => {
    expect(normalizeCryptoQuoteDemandSymbol(' fil ')).toBe('FIL');
    expect(normalizeCryptoQuoteDemandSymbol(' crypto:fil-usdt ')).toBe('FIL');
    for (const invalid of ['FILUSDT', 'FIL-USDT', 'FIL_USDT', 'CRYPTO:FIL-USD', 'CRYPTO:USDT-USDT',
      'ETH_PERP', 'FIL-USDT-SWAP', 'AAPL', 'USDT', 'CNY', 'NOTLISTED', 'CRYPTO:NOTLISTED-USDT', null]) {
      expect(normalizeCryptoQuoteDemandSymbol(invalid)).toBeNull();
    }
  });
  it('never converts 18-decimal quantities or large decimal money to float', () => {
    for (const value of ['0.000000000000000001', '-0.000000000000000001', '999999999999999999.000000000000000001']) {
      expect(cryptoDemandDecimalIsNonzero(value)).toBe(true);
    }
    for (const value of ['0', '-0.000000000000000000', '+000.00', 0, BigInt(0)]) expect(cryptoDemandDecimalIsNonzero(value)).toBe(false);
    for (const value of [null, undefined, '', 'NaN', '1e-18', 0.1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => cryptoDemandDecimalIsNonzero(value)).toThrow();
    }
  });
  it('import is pure, starts with precisely legacy39, and the cap follows catalog216', () => {
    expect(getActiveCryptoQuoteSymbols()).toHaveLength(39);
    expect(getActiveCryptoQuoteSymbols()).not.toContain('FIL');
    expect(getCryptoQuoteDemandDiagnostics().lastAttemptAt).toBeNull();
    expect(CRYPTO_ASSET_CODES).toHaveLength(216);
    expect(MAX_ACTIVE_CRYPTO_QUOTE_SYMBOLS).toBe(216);
  });
});

describe('temporary leases and persistent consumer independence', () => {
  it('activates new FIL immediately, merges repeated leases, and expires only after the grace period', async () => {
    const f = fixture();
    await f.registry.refresh();
    expect(f.registry.active()).toEqual(['BTC', 'ETH', 'SOL']);
    f.registry.touch(['FIL', 'CRYPTO:FIL-USDT', 'UNKNOWN']);
    expect(f.registry.active()).toEqual(['BTC', 'ETH', 'SOL', 'FIL']);
    expect(f.registry.diagnostic().leaseCount).toBe(1);
    f.advance(10_000);
    f.registry.touch(['FIL']);
    f.registry.touch(['FIL'], 0); // Shorter touches cannot revoke a longer lease.
    f.advance(CRYPTO_QUOTE_DEMAND_LEASE_MS + CRYPTO_QUOTE_DEMAND_GRACE_MS - 1);
    expect(f.registry.active()).toContain('FIL');
    f.advance(1);
    expect(f.registry.active()).not.toContain('FIL');
  });
  it('a persistent FIL reference survives page closure; one consumer cannot erase another or a lease', async () => {
    const f = fixture();
    await f.registry.refresh();
    f.registry.replacePersistent('wallet-a', ['FIL']);
    f.registry.replacePersistent('order-b', ['FIL', 'DOT']);
    f.registry.touch(['FIL']);
    f.registry.replacePersistent('wallet-a', []);
    f.advance(CRYPTO_QUOTE_DEMAND_LEASE_MS + CRYPTO_QUOTE_DEMAND_GRACE_MS);
    expect(f.registry.active()).toContain('FIL');
    f.registry.replacePersistent('order-b', []);
    expect(f.registry.active()).not.toContain('FIL');
    f.registry.touch(CRYPTO_ASSET_CODES);
    expect(f.registry.active()).toHaveLength(MAX_ACTIVE_CRYPTO_QUOTE_SYMBOLS);
    expect(() => f.registry.touch(['FIL'], NaN)).toThrow();
    expect(() => f.registry.replacePersistent('', [])).toThrow();
  });
});

describe('real persistent source reads, failure retention and recovery', () => {
  it('restores frozen-only wallet balance, project holds, active locks, manual freezes and real37 positions', async () => {
    const f = fixture();
    f.data.set('wallet-balances', [{ asset_code: 'FIL', available_balance: '0', frozen_balance: '0.000000000000000001' }]);
    f.data.set('wallet-project-holds', [{ asset_code: 'DOT', quantity: '0.000000000000000001' }]);
    f.data.set('wallet-collateral-locks', [{ asset_code: 'APT', quantity: '2' }]);
    f.data.set('wallet-manual-freezes', [{ asset_code: 'BCH', quantity: '1' }]);
    f.data.set('ledger37-real-holdings', [{ asset_code: 'CRYPTO:RENDER-USDT', quantity: '0.00000001' }, { asset_code: 'CRYPTO:UNI-USDT', quantity: '0.00000000' }]);
    await f.registry.refresh();
    expect(f.registry.active()).toEqual(expect.arrayContaining(['BTC', 'ETH', 'SOL', 'FIL', 'DOT', 'APT', 'BCH', 'RENDER']));
    expect(f.registry.active()).not.toContain('UNI');
    expect(f.registry.active()).not.toContain('BTY');
    expect(f.registry.diagnostic()).toMatchObject({ reconciled: true, fallbackActive: false });
    f.advance(1_000_000);
    expect(f.registry.active()).toContain('FIL');
    // A fresh process independently rebuilds the same persistent union from real read rows.
    const restarted = new CryptoQuoteDemandRegistry({ query: f.query, now: f.now });
    expect(restarted.active()).toHaveLength(39);
    await restarted.refresh();
    expect(restarted.active()).toEqual(f.registry.active());
  });
  it('nets37 configured margin by member/tag/coin exactly, excludes zero-net historical corrections', async () => {
    const f = fixture();
    f.data.set('ledger37-configured-margins', [{ initial_balances: JSON.stringify({
      tag1__margins: [{ coin: 'FIL', amount: '0.000000000000000002' }, { coin: 'FIL', amount: '-0.000000000000000001' }],
      tag2__margins: [{ coin: 'DOT', amount: '2' }, { coin: 'DOT', amount: '-2.000000000000000000' }],
      tag3__margin: '0.000000000000000001', tag3__marginCoin: 'APT',
    }) }, { initial_balances: { other__margins: '[{"coin":"LTC","amount":"1"}]' } }]);
    await f.registry.refresh();
    expect(f.registry.active()).toEqual(['BTC', 'ETH', 'SOL', 'APT', 'FIL', 'LTC']);
    expect(f.registry.active()).not.toContain('DOT');
    expect(f.registry.diagnostic().sources.find(item => item.source === 'ledger37-configured-margins')?.state).toBe('ok');
  });
  it('collects52 coin, amount currency, collateral/lent assets and option denomination; terminal rows do not pin', async () => {
    const f = fixture();
    f.data.set('ledger52-open-orders', [order({ amount_currency: 'DOT',
      collateral_coin: 'APT', collateral_qty: '0.000000000000000001',
      collateral_assets: JSON.stringify([{ coin: 'RENDER', qty: '0.000000000000000001' }, { coin: 'UNI', qty: '0' }]),
      lent_out_assets: [{ coin: 'BCH', qty: '2' }],
      option_info: Buffer.from(JSON.stringify({ coin: 'BTC', denomination: 'ETH' })),
    }), order({ coin: 'LTC', status: 'completed' }), order({ coin: 'ARB', status: 'settled' }), order({ coin: 'AVAX', status: 'cancelled' })]);
    await f.registry.refresh();
    expect(f.registry.active()).toEqual(expect.arrayContaining(['FIL', 'DOT', 'APT', 'RENDER', 'BCH']));
    for (const excluded of ['LTC', 'ARB', 'AVAX', 'UNI']) expect(f.registry.active()).not.toContain(excluded);
  });
  it('reads participant-only collateral and active joint segment even after primary segment closes', async () => {
    const f = fixture();
    f.data.set('ledger52-participant-orders', [participant(JSON.stringify({ coin: 'FIL',
      joint_order_primary_settlement: { status: 'settled', settlement_snapshot: {} },
      collateral_assets: [{ coin: 'DOT', qty: '1' }],
      joint_order_segments: [{ id: 'later', coin: 'APT', collateral_assets: [{ coin: 'RENDER', qty: '1' }] },
        { id: 'ended', coin: 'LTC', status: 'settled', settlement_snapshot: {} }],
    })), participant({ coin: 'ARB', status: 'settled' }),
    participant({ coin: 'BCH', collateral_assets: [{ coin: 'FIL', qty: '1' }] }, { coin: 'BTC', participant_amount_currency: 'DOT' })]);
    await f.registry.refresh();
    expect(f.registry.active()).toEqual(expect.arrayContaining(['APT', 'RENDER', 'BCH', 'FIL', 'DOT']));
    expect(f.registry.active()).not.toContain('LTC');
    expect(f.registry.active()).not.toContain('ARB');
  });
  it('successful empty source removes former persistent references, not temporary leases or independent consumers', async () => {
    const f = fixture();
    f.data.set('ledger52-open-orders', [order()]);
    await f.registry.refresh();
    f.registry.replacePersistent('risk-c', ['DOT']);
    f.registry.touch(['APT']);
    f.data.clear();
    f.advance();
    await f.registry.refresh();
    expect(f.registry.active()).toEqual(['BTC', 'ETH', 'SOL', 'APT', 'DOT']);
    expect(f.registry.diagnostic().fallbackActive).toBe(false);
  });
  it('DB failure keeps all prior references, adds legacy39 and proven new symbols, then shrinks on recovery', async () => {
    const f = fixture();
    f.data.set('wallet-balances', [{ asset_code: 'FIL', available_balance: '1', frozen_balance: '0' }]);
    await f.registry.refresh();
    f.advance();
    f.data.set('wallet-balances', []);
    f.data.set('ledger52-open-orders', [order({ coin: 'DOT' })]);
    f.failures.set('ledger37-real-holdings', Object.assign(new Error('credential must never enter diagnostics'), { code: 'ER_BAD_FIELD_ERROR' }));
    await f.registry.refresh();
    expect(f.registry.active()).toEqual(expect.arrayContaining([...LEGACY_CRYPTO_QUOTE_SYMBOLS, 'FIL', 'DOT']));
    expect(f.registry.diagnostic().sources.find(item => item.source === 'ledger37-real-holdings')).toMatchObject({ state: 'failed', error: 'ER_BAD_FIELD_ERROR' });
    expect(JSON.stringify(f.registry.diagnostic())).not.toContain('credential');
    f.failures.clear();
    f.advance();
    await f.registry.refresh();
    expect(f.registry.active()).toEqual(['BTC', 'ETH', 'SOL', 'DOT']);
  });
  it.each([
    ['wallet-balances', [{ asset_code: 'FIL', available_balance: '1' }]],
    ['wallet-balances', [{ asset_code: 'FIL', available_balance: '1', frozen_balance: null }]],
    ['ledger37-real-holdings', [{ asset_code: 'CRYPTO:UNLISTED-USDT', quantity: '1' }]],
    ['ledger52-open-orders', [order({ collateral_assets: '{broken' })]],
    ['ledger52-open-orders', [order({ status: 'future_unknown_status' })]],
    ['ledger52-participant-orders', [participant({ joint_order_segments: [{ coin: 'FIL', collateral_assets: [{ coin: 'DOT' }] }] })]],
    ['ledger52-open-orders', [order({ collateral_assets: [{ coin: 'FIL', qty: 0.1 }] })]],
    ['ledger37-configured-margins', [{ initial_balances: { tag__margins: [{ coin: 'FIL', amount: 0.1 }] } }]],
    ['ledger37-configured-margins', [{ initial_balances: '{bad json' }]],
  ] as const)('missing fields / malformed JSON / inexact amount in %s never becomes false empty success', async (source, rows) => {
    const f = fixture();
    f.data.set(source, [...rows]);
    await f.registry.refresh();
    expect(f.registry.diagnostic().fallbackActive).toBe(true);
    expect(f.registry.diagnostic().reconciled).toBe(false);
    expect(f.registry.active()).toEqual(expect.arrayContaining([...LEGACY_CRYPTO_QUOTE_SYMBOLS]));
    expect(f.registry.diagnostic().sources.find(item => item.source === source)?.state).toBe('failed');
  });
  it('throttles every30sec and singleflights concurrent refresh, including failed retries', async () => {
    let unblock!: () => void;
    const barrier = new Promise<void>(resolve => { unblock = resolve; });
    let now = 0;
    const query = vi.fn<CryptoQuoteDemandQuery>(async () => { await barrier; return []; });
    const registry = new CryptoQuoteDemandRegistry({ query, now: () => now });
    const first = registry.refresh();
    const second = registry.refresh();
    expect(first).toBe(second);
    expect(query).toHaveBeenCalledTimes(CRYPTO_QUOTE_DEMAND_SOURCES.length);
    expect(registry.diagnostic().refreshing).toBe(true);
    unblock();
    await first;
    now = 29_999;
    await registry.refresh();
    expect(query).toHaveBeenCalledTimes(CRYPTO_QUOTE_DEMAND_SOURCES.length);
    now = 30_000;
    await registry.refresh();
    expect(query).toHaveBeenCalledTimes(CRYPTO_QUOTE_DEMAND_SOURCES.length * 2);
    const failed = fixture();
    failed.failures.set('wallet-balances', new Error('network failure'));
    await failed.registry.refresh();
    await failed.registry.refresh();
    expect(failed.query).toHaveBeenCalledTimes(CRYPTO_QUOTE_DEMAND_SOURCES.length);
    expect(failed.registry.active()).toHaveLength(39);
  });
  it('uses verified read-only schemas, no historical wallet/trade entries and no guessed tenant/lock/joint columns', () => {
    const sql = CRYPTO_QUOTE_DEMAND_SOURCES.map(item => item.sql).join('\n');
    expect(sql).not.toMatch(/\b(CREATE|ALTER|INSERT|UPDATE|DELETE|FOR UPDATE|setInterval)\b/i);
    expect(sql).not.toContain('ai_wallet_asset_entries');
    expect(sql).not.toContain('crypto_klines');
    expect(sql).not.toContain('ai_wallet_asset_locks');
    expect(sql).not.toContain('tenant_id');
    expect(sql).not.toContain('o.joint_order_segments');
    expect(sql).not.toContain('ledger_stock_lot_observations');
    expect(sql).toContain("sale.status = 'active'");
    expect(sql).toContain("sale.event_type IN ('reduce','sell')");
    expect(sql).toContain('c.ledgerId = l.ledger_id');
    expect(sql).toContain('o.ledger_id = p.ledger_id');
    expect(sql).toContain("status NOT IN ('settled','completed','cancelled')");
    expect(sql).toContain('MAX(ABS(available_balance))'); // Never sum opposite users to zero.
    expect(sql).toContain('MAX(ABS(frozen_balance))');
    expect(sql).toContain('FROM ledger_members WHERE ledgerId = ?');
  });
});
