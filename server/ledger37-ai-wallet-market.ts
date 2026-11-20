import { getAllLatestPrices, getUsdtCnyRate } from './price-scanner';

export type Ledger37AiWalletMarket = { prices: Record<string, number>; usdtCnyRate: number | null };

/** 与公开getCryptoPrices及米瓣使用同一缓存；仅供展示估值，非结算汇率。 */
export async function readLedger37AiWalletMarket(): Promise<Ledger37AiWalletMarket> {
  const snapshot = getAllLatestPrices();
  const prices: Record<string, number> = {};
  for (const [code, entry] of Object.entries(snapshot)) {
    if (typeof entry.price !== 'number' || !Number.isFinite(entry.price)) throw new Error('钱包行情数据无效');
    prices[code] = entry.price;
  }
  const rate = getUsdtCnyRate();
  return { prices, usdtCnyRate: typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null };
}
