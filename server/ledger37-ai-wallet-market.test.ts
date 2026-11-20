import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const source = readFileSync(new URL('./ledger37-ai-wallet-market.ts', import.meta.url), 'utf8');
const mocks = vi.hoisted(() => ({ prices: vi.fn(), rate: vi.fn() }));
vi.mock('./price-scanner', () => ({ getAllLatestPrices: mocks.prices, getUsdtCnyRate: mocks.rate }));
import { readLedger37AiWalletMarket } from './ledger37-ai-wallet-market';

beforeEach(() => { mocks.prices.mockReset(); mocks.rate.mockReset(); mocks.prices.mockReturnValue({ BTY: { price: 0.01, hidden: 'SECRET' }, BTC: { price: 90000 } }); mocks.rate.mockReturnValue(6.7); });
describe('37号AI姓名旁钱包：米瓣同源行情，只读、无DB/网络', () => {
  it('只读取getCryptoPrices同一价格缓存与汇率，合法6.7不按数字猜测成缺失', async () => {
    expect(await readLedger37AiWalletMarket()).toEqual({ prices: { BTY: 0.01, BTC: 90000 }, usdtCnyRate: 6.7 });
    expect(mocks.prices).toHaveBeenCalledOnce(); expect(mocks.rate).toHaveBeenCalledOnce();
  });
  it.each([0, -1, NaN, Infinity, undefined, null])('无效汇率%s为未知，不填替代值', async rate => {
    mocks.rate.mockReturnValue(rate); expect((await readLedger37AiWalletMarket()).usdtCnyRate).toBeNull();
  });
  it.each([NaN, Infinity, undefined, '0.01'])('无效行情%s不能造零', async price => {
    mocks.prices.mockReturnValue({ BTY: { price } }); await expect(readLedger37AiWalletMarket()).rejects.toThrow('钱包行情数据无效');
  });
  it('价格零与负值保留同源状态，由既有纯估值函数判定缺价，不自行估价', async () => {
    mocks.prices.mockReturnValue({ BTY: { price: 0 }, BTC: { price: -1 } });
    expect((await readLedger37AiWalletMarket()).prices).toEqual({ BTY: 0, BTC: -1 });
  });
  it('无凭据、余额数据、扫描启动、数据库或提供商抓取', () => {
    expect(source).toContain('getAllLatestPrices'); expect(source).toContain('getUsdtCnyRate');
    expect(source).not.toMatch(/fetch\(|getDb|\.execute\(|refreshUsdt|start.*Scanner|OPENAI|DATABASE_URL|apiKey|Authorization/);
  });
});
