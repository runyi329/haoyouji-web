import { describe, expect, it } from 'vitest';
import { getOrderCryptoQuoteSymbols } from './crypto-order-quote-symbols';
import { expandCryptoCatalogProfileAssets } from './crypto-catalog-profile-expansion';
import { CRYPTO_ASSET_CODES } from '../shared/crypto-asset-catalog';

describe('actual order demand, not the whole catalog', () => {
  it('selected order and collateral currencies only', () => {
    expect(new Set(getOrderCryptoQuoteSymbols([{status: 'active', coin:'FIL',amount_currency:'USDT',collateral_coin:'BTC',collateral_assets:'[{"coin":"ETH","qty":"1"}]',option_info:{coin:'SOL',denomination:'CNY'}}])))
      .toEqual(new Set(['FIL','BTC','ETH','SOL']));
  });
  it('closed and malformed history does not pin demand', () => {
    expect(getOrderCryptoQuoteSymbols([{status:'settled',coin:'FIL'}, {status:'cancelled',coin:'NEAR'}, {status:'active',coin:'AAPL',collateral_assets:'bad'}])).toEqual([]);
    expect(getOrderCryptoQuoteSymbols([])).toEqual([]);
  });
  it('participant snapshots and live segments are read without guessing aliases', () => {
    expect(new Set(getOrderCryptoQuoteSymbols([{coin:'FIL',status:'active',order_snapshot:JSON.stringify({amount_currency:'ETH',joint_order_segments:[{status:'active',coin:'BTC'},{status:'settled',coin:'SOL'}]})}])))
      .toEqual(new Set(['FIL','ETH','BTC']));
    expect(getOrderCryptoQuoteSymbols([{coin:'CRYPTO:ETH-USDT'}, {coin:'ETH_PERP'}])).toEqual([]);
  });
});

describe('one-time profile expansion candidates', () => {
  it.each(['ledger:37','ledger:52'])('adds new182 once to %s preserving old hidden coins', target => {
    const expanded = expandCryptoCatalogProfileAssets(target, ['CNY','USDT','BTC']);
    expect(expanded).toContain('FIL');
    expect(expanded).toContain('INJ');
    expect(expanded).not.toContain('ETH');
    expect(expanded).not.toContain('BTY');
    expect(expanded).toHaveLength(185);
    expect(expandCryptoCatalogProfileAssets(target, expanded)).toEqual(expanded);
  });
  it('does not expand unrelated merchant or funding-only projects', () => {
    expect(expandCryptoCatalogProfileAssets('version:proj_hzxm2t',['CNY','USDT','BTC'])).toEqual(['CNY','USDT','BTC']);
    expect(expandCryptoCatalogProfileAssets('ledger:52',['CNY','USDT'])).toEqual(['CNY','USDT']);
  });
  it('full existing crypto becomes exactly216 without new stable/gold assets', () => {
    const expanded=expandCryptoCatalogProfileAssets('ledger:52',CRYPTO_ASSET_CODES);
    expect(expanded).toHaveLength(216);
    for(const code of ['USDC','USD1','RLUSD','USDS','XAUT','PAXG'])expect(expanded).not.toContain(code);
  });
});
