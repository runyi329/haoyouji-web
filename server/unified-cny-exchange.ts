import { getLiveUsdtCnyQuote } from './usdt-cny-rate';
import { getLiveStockUsdCnyQuote } from './stock-usd-cny-rate';

/** One base quote, then amount conversion; never cache a previously multiplied amount. */
export async function readUnifiedCnyExchangeRate(fromcoin: 'USD' | 'USDT', money = 1) {
  const quote = fromcoin === 'USDT' ? await getLiveUsdtCnyQuote() : await getLiveStockUsdCnyQuote();
  const pair = `${fromcoin}/CNY`;
  const converted = quote ? quote.rate * money : NaN;
  const usable = quote && quote.pair === pair && !quote.stale && Number.isFinite(quote.rate)
    && quote.rate > 0 && Number.isFinite(money) && money >= 0 && Number.isFinite(converted);
  return {
    success: !!usable,
    money: usable ? String(Number(converted.toFixed(6))) : '0',
    fromcoin,
    tocoin: 'CNY',
    rate: usable ? quote.rate : null,
    pair,
    source: quote?.source ?? null,
    asOf: quote?.asOf ?? null,
    observedAt: quote && 'observedAt' in quote ? quote.observedAt : null,
    stale: !usable,
    carried: quote && 'carried' in quote ? quote.carried : false,
    // USDT 的 1:1 是用户授权会计政策，不是交易所市场价格。
    conversionPolicy: quote && 'conversionPolicy' in quote ? quote.conversionPolicy : null,
    usdtUsdRate: quote && 'usdtUsdRate' in quote ? quote.usdtUsdRate : null,
    usdtUsdAsOf: quote && 'usdtUsdAsOf' in quote ? quote.usdtUsdAsOf : null,
    usdtUsdSource: quote && 'usdtUsdSource' in quote ? quote.usdtUsdSource : null,
    usdCnyRate: quote && 'usdCnyRate' in quote ? quote.usdCnyRate : null,
    usdCnyAsOf: quote && 'usdCnyAsOf' in quote ? quote.usdCnyAsOf : null,
    usdCnySource: quote && 'usdCnySource' in quote ? quote.usdCnySource : null,
  };
}

/** New records only: historical dates need their explicitly supplied historical rate. */
export async function resolveRecordedUsdtCnyRate(supplied: number | undefined, recordDate: string, today: string): Promise<number> {
  if (supplied !== undefined) {
    if (Number.isFinite(supplied) && supplied > 0) return supplied;
    throw new Error('请填写有效的USDT兑人民币汇率');
  }
  if (recordDate !== today) throw new Error('历史付款请填写当日USDT兑人民币汇率');
  const quote = await getLiveUsdtCnyQuote();
  if (!quote || quote.stale || quote.pair !== 'USDT/CNY' || !Number.isFinite(quote.rate) || quote.rate <= 0) {
    throw new Error('人民币汇率暂不可用，请稍后重试或填写实际付款汇率');
  }
  return quote.rate;
}

/** Additive evidence for newly frozen current stock orders; never rewrites old/historical snapshots. */
export async function readCurrentStockUsdCnyFreezeEvidence(assetType: string, isHistorical: boolean) {
  if (assetType !== 'stock' || isHistorical) return null;
  const quote = await getLiveStockUsdCnyQuote();
  if (!quote || quote.stale || quote.pair !== 'USD/CNY' || !Number.isFinite(quote.rate) || quote.rate <= 0
    || !quote.source || !Number.isFinite(Date.parse(quote.asOf))) return null;
  return { rate: quote.rate, source: quote.source, asOf: quote.asOf, pair: 'USD/CNY' as const };
}
