import { TRPCError } from '@trpc/server';
import { getTagMarginStockSaleSummary, type TagMarginStockRecord } from '../shared/tag-margin-assets';

/** Validate only explicit additions in ledger 37; never normalize or rewrite historical JSON. */
export function validateTagMarginStockSales(input: { ledgerId: number; marginByCoin?: unknown }): void {
  if (input.ledgerId !== 37 || input.marginByCoin === undefined || input.marginByCoin === null) return;
  let value = input.marginByCoin;
  if (typeof value === 'string') {
    // Existing empty configurations remain compatible with the legacy parser.
    if (!value.trim()) return;
    try {
      value = JSON.parse(value);
    } catch {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '保证金配置必须是有效 JSON' });
    }
  }
  // Legacy { coin: amount } dictionaries (including any currency names) are untouched.
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || entry.assetType !== 'stock') return;
    if (!Object.prototype.hasOwnProperty.call(entry, 'purchasePrice')
      && !Object.prototype.hasOwnProperty.call(entry, 'sales')) return;
    // Match the old stock quantity/symbol parser, but strictly validate the new fields.
    const record = {
      ...entry,
      symbol: String(entry.symbol ?? '').trim().toUpperCase(),
      quantity: Number(entry.quantity ?? entry.amount),
    } as TagMarginStockRecord;
    if (!getTagMarginStockSaleSummary(record).valid) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `第 ${index + 1} 笔股票保证金的买入价或卖出登记无效：买入价和成交价须为有限正数，卖出股数须为正整数且累计不得超过原正股数`,
      });
    }
  });
}
