import React from 'react';
import { getTagMarginStockSaleSummary, type TagMarginStockRecord } from '@shared/tag-margin-assets';

/** Both administrator and read-only member detail use the same sale text. */
export function TagMarginStockSaleDetails({ record }: { record: TagMarginStockRecord }) {
  const summary = getTagMarginStockSaleSummary(record);
  if (record.purchasePrice === undefined && !record.sales?.length && summary.valid) return null;
  const price = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 8 });
  const money = (value: number) => value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="mt-0.5 space-y-0.5 text-[10px] leading-4 text-slate-500" data-tag-margin-stock-sale-details>
      <div>买入价：{record.purchasePrice !== undefined && Number.isFinite(record.purchasePrice) && record.purchasePrice > 0 ? `¥${price(record.purchasePrice)}` : '未登记'}</div>
      {!summary.valid ? <div className="text-amber-700">卖出数据待纠正，估值暂不可用</div> : (
        <>
          {record.sales?.map((sale, index) => <div key={index}>卖出 ¥{price(sale.price)} × {sale.quantity.toLocaleString('zh-CN')}股 = ¥{money(sale.price * sale.quantity)}</div>)}
          {summary.soldQuantity > 0 && (
            <>
              <div className="font-medium text-blue-700">已卖出价值：¥{money(summary.saleValue)}</div>
              <div>{summary.remainingQuantity === 0 ? '全部卖出，价值按成交价固定' : `剩余 ${summary.remainingQuantity.toLocaleString('zh-CN')}股按参考价估值`}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
