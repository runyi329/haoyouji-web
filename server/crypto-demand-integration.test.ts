import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./db',()=>({getDbConnection:()=>{throw new Error('DB forbidden')},getLedgerDb:()=>{throw new Error('DB forbidden')}}));
vi.mock('./ledger52-t0-journal',()=>({hasLedger52T0PendingOrders:()=>false,scanLedger52T0PendingOrders:vi.fn()}));
vi.mock('./usdt-cny-rate',()=>({getLiveUsdtCnyQuote:vi.fn(),peekUsdtCnyQuote:()=>null}));
const NOW=Date.parse('2026-11-27T15:00:00Z');
let net:ReturnType<typeof vi.fn>;
let scanner:typeof import('./price-scanner');
let portfolio:typeof import('./crypto-portfolio-quotes');
let provider:typeof import('./crypto-spot-quote-cache');
let fail=false;
beforeEach(async()=>{
 vi.resetModules();vi.useFakeTimers();vi.setSystemTime(NOW);fail=false;
 net=vi.fn(async(input:string)=>{
  const u=new URL(input);
  const data=u.pathname.endsWith('/currency_pairs')?['FIL','BTC','ETH'].map(code=>({id:`${code}_USDT`,base:code,base_name:code==='FIL'?'Filecoin':code,quote:'USDT',type:'normal',trade_status:'tradable'}))
   :u.pathname==='/v1/common/symbols'?{status:'ok',data:[]}
   :u.pathname.endsWith('/tickers')?fail?[]:[{currency_pair:u.searchParams.get('currency_pair'),last:'2.5',change_percentage:'5',high_24h:'3',low_24h:'2',base_volume:'100',quote_volume:'250'}]:null;
  return {ok:true,json:async()=>data};
 });vi.stubGlobal('fetch',net);
 scanner=await import('./price-scanner');portfolio=await import('./crypto-portfolio-quotes');provider=await import('./crypto-spot-quote-cache');
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();vi.restoreAllMocks()});
const tickers=()=>net.mock.calls.filter(([url])=>String(url).includes('/tickers'));

describe('shared demand integration without DB or scanner startup',()=>{
 it('opening directory does not fetch216 or create balances; importing starts no timer',async()=>{
  expect(net).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  const list=await portfolio.searchCryptoPortfolio('*');
  expect(list.results.map(x=>x.symbol)).toContain('CRYPTO:FIL-USDT');
  expect(list.results).toHaveLength(216);
  expect(tickers()).toHaveLength(0);expect(net).not.toHaveBeenCalled();
 });
 it('wallet+37+52 simultaneous selection joins one FIL ticker and identical sampling',async()=>{
  const [_,quotes]=await Promise.all([scanner.ensureCryptoSpotPrices(['FIL']),portfolio.fetchCryptoPortfolioQuotes(['CRYPTO:FIL-USDT']),scanner.ensureCryptoSpotPrices(['FIL','FIL'])]);
  expect(tickers()).toHaveLength(1);
  expect(scanner.getLatestPrice('FIL')).toBe(2.5);
  expect(quotes['CRYPTO:FIL-USDT'].price).toBe(2.5);
  const cached=scanner.getAllLatestPrices().FIL;
  expect(cached.updatedAt).toBe(quotes['CRYPTO:FIL-USDT'].updatedAt);
  expect(cached.updatedAt).toBe(new Date(NOW).toISOString());
  expect(cached.high24h).toBe(3);
  expect(provider.peekUnifiedCryptoSpotQuote('FIL')?.updatedAt).toBe(cached.updatedAt);
  expect(scanner.getT0EthPerpetualMark().price).toBeNull();
 });
 it('cache reads never restamp samples or turn fail/expired quotes into0',async()=>{
  await scanner.ensureCryptoSpotPrices(['FIL']);const sample=new Date(NOW).toISOString();
  vi.setSystemTime(NOW+1000);expect(scanner.getAllLatestPrices().FIL.updatedAt).toBe(sample);expect(tickers()).toHaveLength(1);
  vi.setSystemTime(NOW+2600);fail=true;await scanner.ensureCryptoSpotPrices(['FIL']);
  expect(scanner.getLatestPrice('FIL')).toBeNull();expect(scanner.getAllLatestPrices().FIL).toBeUndefined();
  expect(portfolio.getCachedCryptoPortfolioQuote('CRYPTO:FIL-USDT')).toBeNull();
  const health=scanner.getMarketPriceHealth().FIL;expect(health.stale).toBe(true);expect(health.lastSuccessAt).toBe(sample);
  expect(net.mock.calls.every(([url])=>!/okx|futures|binance/i.test(String(url)))).toBe(true);
 });
 it('unselected symbols and history do not create requests; new coins never OKX/SWAP fallback',async()=>{
  await scanner.ensureCryptoSpotPrices(['FIL']);
  for(const code of ['ETH_PERP','USDT','AAPL','NOTCOIN'])expect(provider.peekUnifiedCryptoSpotQuote(code)).toBeNull();
  expect(tickers().map(([url])=>new URL(url as string).searchParams.get('currency_pair'))).toEqual(['FIL_USDT']);
  vi.setSystemTime(NOW+120001);expect(scanner.getLatestPrice('FIL')).toBeNull();
  expect(scanner.getAllLatestPrices().FIL).toBeUndefined();expect(tickers()).toHaveLength(1);
 });
});

describe('legacy OKX spot fallback uses verified exchange sampling only',()=>{
 const setFallback=(row:Record<string,unknown>)=>{
  const original=net.getMockImplementation()!;
  net.mockImplementation(async(input:string)=>new URL(input).hostname==='www.okx.com'
   ?{ok:true,json:async()=>({code:'0',data:[row]})}:original(input));
  fail=true;
 };
 it('retains original exchange timestamp and does not restamp a later failed fallback',async()=>{
  setFallback({instId:'BTC-USDT',instType:'SPOT',last:'100',ts:String(NOW-60000)});
  await scanner.ensureCryptoSpotPrices(['BTC']);
  expect(scanner.getLatestPrice('BTC')).toBe(100);
  expect(scanner.getAllLatestPrices().BTC.updatedAt).toBe(new Date(NOW-60000).toISOString());
  vi.setSystemTime(NOW+3100);
  net.mockImplementation(async()=>({ok:true,json:async()=>({code:'0',data:[{instId:'BTC-USDT',last:'100',ts:'0'}]})}));
  await scanner.ensureCryptoSpotPrices(['BTC']);
  expect(scanner.getLatestPrice('BTC')).toBeNull();
  expect(scanner.getMarketPriceHealth().BTC.lastSuccessAt).toBe(new Date(NOW-60000).toISOString());
 });
 it.each([
  {instId:'BTC-USDT-SWAP',ts:String(NOW)},
  {instId:'ETH-USDT',ts:String(NOW)},
  {instId:'BTC-USDT',instType:'SWAP',ts:String(NOW)},
  {instId:'BTC-USDT'},
  {instId:'BTC-USDT',ts:String(NOW-120001)},
  {instId:'BTC-USDT',ts:String(NOW+5001)},
 ])('rejects wrong/missing/stale/future identity evidence %#',async(row)=>{
  setFallback({last:'100',...row});
  await scanner.ensureCryptoSpotPrices(['BTC']);
  expect(scanner.getLatestPrice('BTC')).toBeNull();
  expect(scanner.getAllLatestPrices().BTC).toBeUndefined();
 });
});
