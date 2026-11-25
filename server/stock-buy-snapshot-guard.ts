import { getCryptoPortfolioEffectiveDate, latestCryptoPortfolioSnapshotDate, parsePortfolioTradeTime } from '../shared/crypto-portfolio-policy';
import { parsePortfolioInstrument } from '../shared/portfolio-instruments';
import { isStockSessionDate } from '../shared/stock-market-session';
import { cryptoPortfolioStockAnchor } from './shared/crypto-portfolio-calendar';
import { marketSessionDateFromBeijingTradeTimestamp } from './stock-unified-close-quotes';

/** SELECT evidence only. Stocks need their actual exchange day, never registration as a fallback. */
export type StockBuySnapshotEvidence = {
  symbol: string;
  originalActualTradedAt: unknown;
  nextActualTradedAt: unknown;
  registeredAt: unknown;
  effectiveDate: unknown;
  activationDates: readonly unknown[];
  operation: 'edit' | 'cancel';
  now: Date;
};

export function assertStockBuySnapshotSafe(input: StockBuySnapshotEvidence): void {
  const message = input.operation === 'cancel'
    ? '这笔买入已计入历史日结或缺少可核对的日期证据，不能直接撤销；请先核对历史后再处理。'
    : '这笔买入已计入历史日结或缺少可核对的日期证据，不能直接修改股数、价格或日期；仍可修改备注。请先核对历史后再处理。';
  const deny = () => { throw new Error(message); };
  const instrument = parsePortfolioInstrument(input.symbol);
  if (!instrument || !Number.isFinite(input.now.getTime())) deny();
  const wallTime = (value: unknown): string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return deny();
    try {
      const instant = parsePortfolioTradeTime(value);
      if (!Number.isFinite(instant.getTime()) || instant.getTime() > input.now.getTime()) return deny();
    } catch { return deny(); }
    return value;
  };
  const original = wallTime(input.originalActualTradedAt), next = wallTime(input.nextActualTradedAt);
  const due = latestCryptoPortfolioSnapshotDate(input.now);
  if (instrument!.market === 'CRYPTO') {
    const registered = wallTime(input.registeredAt), effective = input.effectiveDate;
    if (!isStockSessionDate(effective) || effective <= due
      || effective !== getCryptoPortfolioEffectiveDate(original, registered)
      || effective !== getCryptoPortfolioEffectiveDate(next, registered)) deny();
    return;
  }
  const market = instrument!.market as 'A' | 'US';
  const originalDate = marketSessionDateFromBeijingTradeTimestamp(original, market);
  const nextDate = marketSessionDateFromBeijingTradeTimestamp(next, market);
  if (!originalDate || !nextDate || input.activationDates.some(date => !isStockSessionDate(date))) deny();
  // A missing due snapshot is NOT permission to change its inputs. Persisted activation
  // also survives a voided last crypto lot. A new stock is safe only on BOTH sides of edit.
  const mixedDue = input.activationDates.some(date => typeof date === 'string' && date <= due);
  if (mixedDue || input.operation === 'cancel') {
    const anchor = cryptoPortfolioStockAnchor(due)?.[market];
    if (!anchor || originalDate! <= anchor || nextDate! <= anchor) deny();
  }
}
